// 作戰室的卡頓量測：新存檔進機甲庫 → 進作戰室，逐格記錄 loop 的時間、兩格的間隔、各方法的耗時、著色器連結
//   node scripts/perf-hub.js                 第 1 章的存檔（只開放一個區域）
//   node scripts/perf-hub.js --ch=8          第 1～7 章都完成（八個區域都開放）
//   參數：--secs＝進作戰室後量幾秒（預設 12）、--size=1600x900、--again＝回機甲庫再進一次、--tag、--long=25
/* global window, document, localStorage */
const path = require('path');
const fs = require('fs');
const { launch, initScript } = require('./perf-lib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-results');
const args = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}
const SECS = +(args.secs || 12);
const CH = +(args.ch || 1);
const LONG = +(args.long || 25);
const TAG = args.tag || 'hub';
const [VW, VH] = String(args.size || '1600x900')
  .split('x')
  .map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 頁面裡：包裝 Game 的方法，記錄每一格
function hubInstrument() {
  const g = window.__game,
    P = Object.getPrototypeOf(g),
    R = g.renderer;
  const W = (window.__prof = { frames: [], calls: [], cur: null, on: false });
  const wrap = (obj, name, tag) => {
    const o = obj && obj[name];
    if (!o || o.__perf) return;
    const f = function (...a) {
      const t0 = performance.now();
      try {
        return o.apply(this, a);
      } finally {
        const ms = performance.now() - t0;
        if (W.cur) W.cur.sec[tag] = (W.cur.sec[tag] || 0) + ms;
        if (W.on && ms > 2)
          W.calls.push({
            f: W.frames.length,
            tag,
            ms: +ms.toFixed(1),
            a: tag === 'hubHoloSample' ? a[0] : '',
          });
      }
    };
    f.__perf = 1;
    obj[name] = f;
  };
  for (const n of [
    'openHub',
    'renderHub',
    'hubSetup',
    'hubHoloBuild',
    'hubHoloSample',
    'hubPutTile',
    'hubHangarBuild',
    'hubMechSync',
    'hubBgSync',
    'hubLabels',
    'hubOutline',
    'hubRegionSrc',
    'hubPrePlan',
    'hubSortieState',
    'guideNodeInfo',
    'campComm',
    'writeSave',
    'lmRefresh',
    'storyHubCheck',
    'hubSpotsUi',
    'tutHubIntro',
    'showScreen',
  ])
    wrap(P, n, n);
  if (g.stylePipe) wrap(Object.getPrototypeOf(g.stylePipe), 'render', 'pipe.render');
  const loop = P.loop;
  let lastT = performance.now(),
    lastHeap = 0;
  P.loop = function () {
    const t0 = performance.now();
    const rec = { t0, gap: t0 - lastT, sec: {}, st: this.state };
    lastT = t0;
    W.cur = rec;
    const p0 = R.info.programs ? R.info.programs.length : 0;
    R.info.autoReset = false;
    R.info.reset();
    try {
      loop.call(this);
    } finally {
      rec.ms = performance.now() - t0;
      rec.drawn = !!this.hubDrawn;
      rec.prog = (R.info.programs ? R.info.programs.length : 0) - p0;
      rec.calls = R.info.render.calls;
      rec.tris = R.info.render.triangles;
      const hp = performance.memory ? performance.memory.usedJSHeapSize : 0;
      rec.gc = lastHeap && hp < lastHeap - 2e6 ? +((lastHeap - hp) / 1e6).toFixed(1) : 0;
      lastHeap = hp;
      W.cur = null;
      if (W.on) W.frames.push(rec);
    }
  };
}

(async () => {
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.addInitScript(initScript);
    // 著色器預熱照玩家的瀏覽器走非同步（--sync 改回自動化測試的同步）；--nopre＝不在標題畫面先建作戰室
    if (!args.sync) await page.addInitScript(() => (window.__warmAsync = true));
    await page.goto(
      require('url').pathToFileURL(path.join(ROOT, 'dist/rubicon-protocol.html')).href + '?test',
    );
    await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
    if (args.nopre) await page.evaluate(() => (window.__game.hubPre = 'done'));
    await sleep(args.nopre ? 1500 : 6000);
    await page.click('#btnSaves');
    await page.click('#saveSlots [data-slot="1"] [data-act="new"]');
    await page.waitForFunction(() => window.__game.state === 'garage', null, { timeout: 30000 });
    await sleep(3000);
    await page.evaluate((ch) => {
      const g = window.__game;
      const st = g.campStory();
      // 第 ch 章以前的委託都完成（抉擇：卡斯特隆、維爾威）
      if (ch > 1) {
        st.choices = { c2: 'castron', c4: 'veerwell' };
        for (const sid of [
          'c1s1',
          'c1s2',
          'c2s1',
          'c2s2',
          'c2s3a',
          'c3s1',
          'c3s2',
          'c3s3',
          'c4s1',
          'c4s2',
          'c4s3a',
        ])
          if (+sid[1] < ch) st.done[sid] = 1;
        for (const sid of ['c5s1', 'c5s2a', 'c5s3', 'c6s1', 'c6s2', 'c6s3', 'c7s1', 'c7s2', 'c7s3'])
          if (+sid[1] < ch) st.done[sid] = 1;
      }
      // 序章與章節開場當作看過（不播過場）
      st.storySeen = st.storySeen || {};
      for (let c = 1; c <= 8; c++) st.storySeen['i1_' + c] = 1;
      st.storySeen.p1 = 1;
      g.writeSave();
    }, CH);
    await page.evaluate(hubInstrument);
    const runs = [];
    const enter = async (label, viaTitle) => {
      await page.evaluate((viaTitle) => {
        const W = window.__prof;
        W.frames = [];
        W.calls = [];
        W.lt0 = window.__lt.length;
        W.sh0 = window.__sh.length;
        W.on = true;
        W.tIn = performance.now();
        if (viaTitle) document.getElementById('btnStory').click();
        else window.__game.openHub();
      }, viaTitle);
      await sleep(SECS * 1000);
      const r = await page.evaluate(() => {
        const W = window.__prof;
        W.on = false;
        return {
          frames: W.frames.map((f) => ({
            t: +(f.t0 - W.tIn).toFixed(0),
            gap: +f.gap.toFixed(1),
            ms: +f.ms.toFixed(1),
            prog: f.prog,
            calls: f.calls,
            tris: f.tris,
            gc: f.gc,
            drawn: f.drawn,
            st: f.st,
            sec: Object.fromEntries(Object.entries(f.sec).map(([k, v]) => [k, +v.toFixed(1)])),
          })),
          calls: W.calls,
          lt: window.__lt.slice(W.lt0).map((e) => ({ t: +(e.t - W.tIn).toFixed(0), d: +e.d.toFixed(0) })),
          sh: window.__sh
            .slice(W.sh0)
            .map((s) => ({ t: +(s.t - W.tIn).toFixed(0), ms: s.ms, name: s.name, defs: s.defs })),
          state: window.__game.state,
        };
      });
      r.label = label;
      runs.push(r);
    };
    // --cpu：第一次進作戰室的期間做 CPU 取樣（npm run build -- --dev 的未壓縮版才看得到函式名稱）
    let cdp = null;
    if (args.cpu) {
      cdp = await ctx.newCDPSession(page);
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
      await cdp.send('Profiler.start');
    }
    await enter('第一次進作戰室');
    if (cdp) {
      const { profile } = await cdp.send('Profiler.stop');
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      const dt = profile.timeDeltas;
      const self = new Map();
      profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (dt[i] || 0)));
      const tot = new Map();
      const total = (n) => {
        if (tot.has(n.id)) return tot.get(n.id);
        let s = self.get(n.id) || 0;
        for (const c of n.children || []) s += total(byId.get(c));
        tot.set(n.id, s);
        return s;
      };
      const name = (n) =>
        `${n.callFrame.functionName || '(匿名)'} ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber + 1}`;
      const agg = (m) => {
        const r = new Map();
        for (const n of profile.nodes) {
          // 遞迴的只算最外層
          let p = n.parent,
            rec = false;
          const nm = name(n);
          while (p && m === tot) {
            if (name(byId.get(p)) === nm) {
              rec = true;
              break;
            }
            p = byId.get(p).parent;
          }
          if (rec) continue;
          r.set(nm, (r.get(nm) || 0) + (m === tot ? total(n) : self.get(n.id) || 0));
        }
        return [...r].sort((a, b) => b[1] - a[1]);
      };
      for (const n of profile.nodes) for (const c of n.children || []) byId.get(c).parent = n.id;
      console.log('\nCPU 取樣：自身時間前 30 名（ms）');
      for (const [k, v] of agg(self).slice(0, 30))
        console.log(`  ${(v / 1000).toFixed(0).padStart(6)}  ${k}`);
      console.log('含呼叫的時間前 60 名（ms）');
      for (const [k, v] of agg(tot).slice(0, 60)) console.log(`  ${(v / 1000).toFixed(0).padStart(6)}  ${k}`);
    }
    if (args.again) {
      await page.evaluate(() => window.__game.openGarage && window.__game.openGarage());
      await sleep(2000);
      await enter('第二次進作戰室');
    }
    // --reload：重新整理網頁（瀏覽器存的區域地形還在），停在標題 8 秒（作戰室在背景先建好）再從「主線」進去
    if (args.reload) {
      await page.reload();
      await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
      await sleep(8000);
      await page.evaluate(hubInstrument);
      await enter('重新整理後從標題進作戰室', true);
      console.log(
        '瀏覽器存的區域地形：',
        await page.evaluate(() => (localStorage.getItem('rubicon_hub_tiles') || '').length),
        '字',
      );
    }
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `perf-hub-${TAG}.json`), JSON.stringify(runs, null, 1));
    for (const r of runs) {
      const fr = r.frames;
      const gaps = fr.map((f) => f.gap).sort((a, b) => a - b);
      const med = gaps[gaps.length >> 1] || 0;
      console.log(`\n== ${r.label}（第 ${CH} 章、狀態 ${r.state}）：${fr.length} 格，間隔中位數 ${med} ms`);
      const fd = fr.find((f) => f.drawn);
      console.log(`第一次畫出作戰室：進來後 ${fd ? fd.t : '—'} ms`);
      const sumSec = {};
      for (const f of fr) for (const k in f.sec) sumSec[k] = (sumSec[k] || 0) + f.sec[k];
      console.log(
        '各方法合計（ms）：',
        Object.entries(sumSec)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 14)
          .map(([k, v]) => `${k} ${v.toFixed(0)}`)
          .join('、'),
      );
      const avgMs = fr.length ? fr.reduce((s, f) => s + f.ms, 0) / fr.length : 0;
      const avgCalls = fr.length ? fr.reduce((s, f) => s + f.calls, 0) / fr.length : 0;
      const avgTris = fr.length ? fr.reduce((s, f) => s + f.tris, 0) / fr.length : 0;
      console.log(
        `每格 CPU 平均 ${avgMs.toFixed(1)} ms、繪製次數 ${avgCalls.toFixed(0)}、三角形 ${(avgTris / 1000).toFixed(0)}k`,
      );
      const longF = fr.filter((f) => f.gap >= 50 || f.ms >= LONG);
      console.log(`卡頓（間隔 ≥ 50 ms 或 CPU ≥ ${LONG} ms）：${longF.length} 格`);
      for (const f of longF.slice(0, 40)) {
        const top = Object.entries(f.sec)
          .filter(([, v]) => v >= 3)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${v}`)
          .join('、');
        console.log(
          `  t=${f.t} 間隔 ${f.gap} CPU ${f.ms}${f.prog ? ' 新程式 ' + f.prog : ''}${f.gc ? ' GC ' + f.gc + 'MB' : ''}　${top}`,
        );
      }
      const big = r.calls.filter((c) => c.ms >= 8);
      console.log('耗時的呼叫（≥ 8 ms）：');
      for (const c of big.slice(0, 40))
        console.log(`  格 ${c.f} ${c.tag}${c.a ? '（' + c.a + '）' : ''} ${c.ms} ms`);
      console.log(`著色器連結 ${r.sh.length} 次，合計 ${r.sh.reduce((s, x) => s + x.ms, 0)} ms`);
      for (const s of r.sh.filter((x) => x.ms >= 20).slice(0, 20))
        console.log(`  t=${s.t} ${s.ms} ms ${s.name} ${s.defs}`);
      console.log(
        `長任務 ${r.lt.length} 個：` +
          r.lt
            .slice(0, 20)
            .map((e) => `t=${e.t}:${e.d}ms`)
            .join(' '),
      );
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
