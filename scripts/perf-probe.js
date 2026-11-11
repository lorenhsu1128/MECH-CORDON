// 卡頓與效能的量測（docs/perf-threejs-upgrade.md）：開一場自由出擊，往前走、射擊、QB，定期靠近敵人並擊破兩台
// （觸發擊破特效、增援），逐格記錄：
//   loop 的 CPU 時間與兩格的間隔、各段耗時（包裝 Game 的方法與管線的各段）、
//   這一格新增的著色器程式／幾何／貼圖、JS heap 下降（GC）、這一格發生的事件（生成、擊破、增援…）、
//   每次著色器連結的耗時與關鍵的 define（包裝 gl.linkProgram／getProgramParameter）
//
//   node scripts/perf-probe.js                      結果寫到 test-results/perf-<tag>.json
//   node scripts/perf-probe.js --map=snow --secs=60 --tag=after --compare=before
//
// 參數：--map＝地圖主題（預設 industrial）、--secs＝出擊後量幾秒（預設 45）、--size=1600x900、
//       --cpu＝另外做一段 CPU 與記憶體配置取樣（暖機 12 秒後取樣 15 秒，印出前幾名）、
//       --gp＝把 three.js 換成未壓縮版並記錄每次 getProgram 的原因（複製一份 dist 到系統暫存）、
//       --learn＝帶入上一次記下的著色器變體（render/shader-warm.js 的學習式預熱，test-results/perf-warm.json），
//       --sync＝著色器預熱照自動化測試的同步方式（預設和玩家的瀏覽器一樣走非同步），
//       --variant＝主題變體、--style＝內建的渲染風格、--full＝畫面設定全開（品質）、
//       --owner＝新編譯的著色器在編譯當下記下所屬的物件（走訪場景，會拖慢那一格）、
//       --sortie＝主線的出擊（--seg＝從第幾段開始）、
//       --long=25＝列出 CPU 超過幾 ms 的影格、--tag、--compare、--dist＝別的建置資料夾。
//       頁面的亂數固定種子。需要先 npm run build。
/* global window, localStorage, requestAnimationFrame */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { launch, initScript, instrument } = require('./perf-lib');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-results');
const args = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}
const MAP = args.map || 'industrial';
const SECS = +(args.secs || 45);
const TAG = args.tag || 'now';
const LONG = +(args.long || 25);
const [VW, VH] = String(args.size || '1600x900')
  .split('x')
  .map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let DIST = args.dist ? path.resolve(args.dist) : path.join(ROOT, 'dist');

// --gp：複製一份建置，three.min.js 換成加了紀錄的未壓縮版
function gpDist() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mech-cordon-perf-'));
  fs.copyFileSync(path.join(DIST, 'mech-cordon.html'), path.join(dir, 'mech-cordon.html'));
  fs.cpSync(path.join(DIST, 'lib'), path.join(dir, 'lib'), { recursive: true });
  let src = fs.readFileSync(path.join(ROOT, 'node_modules/three/build/three.js'), 'utf8');
  const a = `			} else {
				needsProgramChange = true;
				materialProperties.__version = material.version;
			} //`;
  const b = `			let program = materialProperties.currentProgram;

			if (needsProgramChange === true) {`;
  if (!src.includes(a) || !src.includes(b))
    throw new Error('--gp：three.js 的 setProgram 和預期的不同（換版本了？）');
  src = src.replace(a, a.replace('} //', '\tmaterialProperties.__vwhy = 1;\n\t\t\t} //'));
  src = src.replace(
    b,
    `			let program = materialProperties.currentProgram;
			if (needsProgramChange === true && window.__gp) {
				const why = materialProperties.__vwhy ? 'version' : (materialProperties.needsLights && materialProperties.lightsStateVersion !== lights.state.version) ? 'lights' : materialProperties.outputEncoding !== encoding ? 'encoding' : (!!object.isInstancedMesh !== !!materialProperties.instancing) ? 'instancing' : materialProperties.envMap !== envMap ? 'envMap' : (material.fog && materialProperties.fog !== fog) ? 'fog' : materialProperties.vertexAlphas !== vertexAlphas ? 'vertexAlphas' : 'clip';
				materialProperties.__vwhy = 0;
				window.__gp(material, object, why);
			}
			if (needsProgramChange === true) {`,
  );
  fs.writeFileSync(path.join(dir, 'lib/three/build/three.min.js'), src);
  return dir;
}

async function act(page, secs) {
  const t0 = Date.now();
  let k = 0;
  await page.mouse.move(VW / 2, VH / 2);
  await page.keyboard.down('w');
  while (Date.now() - t0 < secs * 1000) {
    k++;
    await page.mouse.down();
    await sleep(300);
    await page.mouse.up();
    if (k % 3 === 0) await page.keyboard.press('Shift'); // QB
    if (k % 10 === 0)
      await page.evaluate(() => {
        // 靠近最近的敵人並擊破兩台：擊破特效、增援
        const g = window.__game,
          p = g.player;
        if (!p || p.dead) return;
        const al = g.enemies.filter((e) => !e.dead && !e.isBoss);
        al.sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos));
        if (al[0]) {
          p.pos.x = al[0].pos.x + 30;
          p.pos.z = al[0].pos.z + 30;
        }
        for (const e of al.slice(0, 2)) e.takeDamage(1e7, 0, p, e.pos.clone(), null, false, 'w_rifle');
      });
    await page.evaluate(() => {
      const p = window.__game.player;
      if (p) p.ap = p.maxAp; // 不要被擊破
    });
    await sleep(200);
  }
  await page.keyboard.up('w');
}

function summarize() {
  const W = window.__prof;
  W.on = false;
  const f = W.frames.filter((r) => r.st === 'play');
  const q = (a, p) => (a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(1) : 0);
  const ms = f.map((r) => r.ms).sort((a, b) => a - b);
  const gaps = f.map((r) => r.gap).sort((a, b) => a - b);
  const sec = {};
  for (const r of f) for (const k in r.sec) sec[k] = (sec[k] || 0) + r.sec[k];
  for (const k in sec) sec[k] = +(sec[k] / Math.max(1, f.length)).toFixed(2);
  const frames = W.frames.map((r, i) => ({
    i,
    st: r.st,
    ms: +r.ms.toFixed(1),
    gap: +r.gap.toFixed(1),
    prog: r.prog,
    geo: r.geo,
    tex: r.tex,
    gc: r.gc,
    sec: Object.fromEntries(
      Object.entries(r.sec)
        .filter(([, v]) => v > 3)
        .map(([k, v]) => [k, +v.toFixed(1)]),
    ),
    ev: W.ev.filter((e) => e.f === i && e.tag[0] === '!').map((e) => e.tag.slice(1) + ':' + e.ms),
  }));
  const sh = window.__sh.filter((x) => x.st === 'play');
  const R = window.__game.renderer;
  // 觸發編譯的材質屬於哪個物件：名稱與上層的名稱、類型
  const owner = new Map();
  window.__game.scene.traverse((o) => {
    if (!o.material) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!owner.has(m)) owner.set(m, o);
  });
  const desc = (o) => {
    const a = [];
    for (let x = o, k = 0; x && k < 5 && !x.isScene; x = x.parent, k++)
      a.push(
        (x.name || x.type) +
          (x.userData && Object.keys(x.userData).length
            ? '{' + Object.keys(x.userData).slice(0, 3).join(',') + '}'
            : ''),
      );
    return a.join(' < ');
  };
  const nb = W.nb.map((x) => {
    const m = x.m,
      o = x.at || owner.get(m);
    return {
      f: x.f,
      st: x.st,
      mat: m.type + (m.name ? '「' + m.name + '」' : ''),
      flags: [
        m.map && 'map',
        m.normalMap && 'nmap',
        m.vertexColors && 'vc',
        m.flatShading && 'flat',
        m.side === 2 && 'double',
        m.transparent && 'transp',
        o && o.isSkinnedMesh && 'skin',
        o && o.isInstancedMesh && 'inst',
      ]
        .filter(Boolean)
        .join(','),
      owner: o ? desc(o) : '(已不在場景裡)',
    };
  });
  return {
    n: f.length,
    cpu: { p50: q(ms, 0.5), p90: q(ms, 0.9), p99: q(ms, 0.99), max: q(ms, 1) },
    gap: { p50: q(gaps, 0.5), p90: q(gaps, 0.9), p99: q(gaps, 0.99), max: q(gaps, 1) },
    over100: f.filter((r) => r.ms > 100).length,
    over50: f.filter((r) => r.ms > 50).length,
    sec,
    gcN: f.filter((r) => r.gc).length,
    gcMB: Math.round(f.reduce((s, r) => s + r.gc, 0)),
    programs: R.info.programs.length,
    geos: R.info.memory.geometries,
    texs: R.info.memory.textures,
    shAll: { n: window.__sh.length, ms: window.__sh.reduce((s, x) => s + x.ms, 0) },
    shPlay: { n: sh.length, ms: sh.reduce((s, x) => s + x.ms, 0) },
    shList: window.__sh,
    nb,
    frames,
  };
}

async function sampling(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('HeapProfiler.enable');
  await cdp.send('Profiler.start');
  await cdp.send('HeapProfiler.startSampling', {
    samplingInterval: 8192,
    includeObjectsCollectedByMajorGC: true,
    includeObjectsCollectedByMinorGC: true,
  });
  await act(page, 15);
  const { profile } = await cdp.send('Profiler.stop');
  const { profile: hp } = await cdp.send('HeapProfiler.stopSampling');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) {
    const cf = byId.get(profile.samples[i]).callFrame;
    const key = `${cf.functionName || '(anon)'} @${path.basename(cf.url || '-')}:${cf.lineNumber}`;
    self.set(key, (self.get(key) || 0) + (profile.timeDeltas[i] || 0));
  }
  const tot = [...self.values()].reduce((a, b) => a + b, 0);
  console.log(`\n== CPU self time 前 30（取樣 ${(tot / 1000).toFixed(0)} ms）`);
  for (const [k, v] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 30))
    console.log(`${((v / tot) * 100).toFixed(1).padStart(5)}%  ${k}`);
  const alloc = new Map();
  const walk = (n, st) => {
    const s2 = [...st, `${n.callFrame.functionName || '(anon)'}@${n.callFrame.lineNumber}`];
    if (n.selfSize) {
      const key = s2.slice(-3).join(' < ');
      alloc.set(key, (alloc.get(key) || 0) + n.selfSize);
    }
    for (const c of n.children || []) walk(c, s2);
  };
  walk(hp.head, []);
  const at = [...alloc.values()].reduce((a, b) => a + b, 0);
  console.log(`\n== 記憶體配置 前 30（15 秒共 ${(at / 1e6).toFixed(0)} MB）`);
  for (const [k, v] of [...alloc].sort((a, b) => b[1] - a[1]).slice(0, 30))
    console.log(`${((v / at) * 100).toFixed(1).padStart(5)}%  ${(v / 1e6).toFixed(1).padStart(6)} MB  ${k}`);
  return { cpuMs: Math.round(tot / 1000), allocMB: Math.round(at / 1e6) };
}

(async () => {
  let tmp = null;
  if (args.gp) DIST = tmp = gpDist();
  const browser = await launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.addInitScript(initScript);
    // 著色器預熱：預設走非同步（compileAsync，和玩家的瀏覽器相同）；--sync 改回同步
    if (!args.sync) await page.addInitScript(() => (window.__warmAsync = true));
    await page.addInitScript((map) => localStorage.setItem('mech_cordon_map', map), MAP);
    // --variant＝主題變體（'base'＝標準）；--full＝畫面設定全開（快速設定的「品質」：水面高、砲火華麗、機甲特效完整、殘影）
    // --style＝內建的渲染風格（例如 zzz；docs/zzz-style-design.md）
    if (args.style)
      await page.addInitScript(
        (id) => localStorage.setItem('mech_cordon_style', JSON.stringify({ sel: { k: 'builtin', id } })),
        args.style,
      );
    if (args.variant)
      await page.addInitScript((v) => localStorage.setItem('mech_cordon_variant', v), args.variant);
    if (args.full)
      await page.addInitScript(() => {
        const c = JSON.parse(localStorage.getItem('mech_cordon_ctrl') || '{}');
        Object.assign(c, { water: 'high', fxLv: 'rich', mechFx: 'full', ghost: 'on', tfx: 'full' });
        localStorage.setItem('mech_cordon_ctrl', JSON.stringify(c));
      });
    // --learn：帶入上一次量測記下的著色器變體（render/shader-warm.js；玩家的瀏覽器會一直留著）
    const LEARN = path.join(OUT, 'perf-warm.json');
    if (args.learn && fs.existsSync(LEARN))
      await page.addInitScript(
        (s) => localStorage.setItem('mech_cordon_shader_warm2', s),
        fs.readFileSync(LEARN, 'utf8'),
      );
    await page.goto(require('url').pathToFileURL(path.join(DIST, 'mech-cordon.html')).href + '?test');
    await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
    await sleep(1500);
    await page.click('#btnSaves');
    await page.click('#saveSlots [data-slot="1"] [data-act="new"]');
    await page.waitForFunction(() => window.__game.state === 'garage', null, { timeout: 30000 });
    await sleep(2500);
    if (args.owner) await page.evaluate(() => (window.__probeOwner = true));
    await page.evaluate(instrument);
    await page.evaluate(() => {
      window.__reseed(7777); // 每個版本的地圖與敵人相同
      window.__prof.on = true;
    });
    const tS = Date.now();
    if (args.sortie) {
      // --sortie＝主線的出擊（--seg＝從第幾段開始，0 起算）：轉場畫面直接出擊
      await page.evaluate(
        ([sid, seg]) => {
          const g = window.__game;
          g.encLazy = true; // 和玩家的瀏覽器相同（?test 時預設關掉）
          g.campBegin(sid);
          g.camp.seg = seg;
          g.campGo();
        },
        [args.sortie, +(args.seg || 0)],
      );
    } else {
      await page.evaluate(() => (window.__game.encLazy = true));
      await page.click('#btnSortie');
    }
    await page.waitForFunction(() => window.__game.state === 'play' && window.__game.player, null, {
      timeout: 90000,
    });
    const load = Date.now() - tS;
    await act(page, SECS);
    let gp = null;
    if (args.gp) {
      await page.evaluate(() => (window.__gpOn = true));
      await page.evaluate(
        () =>
          new Promise((r) => {
            let n = 0;
            const t = () => (++n < 300 ? requestAnimationFrame(t) : r());
            requestAnimationFrame(t);
          }),
      );
      gp = await page.evaluate(() => {
        window.__gpOn = false;
        return [...window.__gpc].sort((a, b) => b[1] - a[1]);
      });
    }
    const out = await page.evaluate(summarize);
    const learned = await page.evaluate(() => localStorage.getItem('mech_cordon_shader_warm2'));
    if (learned) fs.writeFileSync(LEARN, learned);
    out.map = MAP;
    out.load = load;
    if (gp) out.gp = { total: gp.reduce((s, x) => s + x[1], 0), list: gp.slice(0, 20) };
    if (args.cpu) out.sampling = await sampling(ctx, page);
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `perf-${TAG}.json`), JSON.stringify(out, null, 1));
    // 報告
    const sh = out.shList.filter((x) => x.st === 'play');
    console.log(`\n地圖 ${MAP}，${out.n} 格，出擊載入 ${load} ms`);
    console.log(
      `每格 CPU：p50 ${out.cpu.p50}、p90 ${out.cpu.p90}、p99 ${out.cpu.p99}、最長 ${out.cpu.max} ms`,
    );
    console.log(`兩格間隔：p50 ${out.gap.p50}、p99 ${out.gap.p99}、最長 ${out.gap.max} ms`);
    console.log(`超過 50 ms 的格 ${out.over50}、超過 100 ms 的格 ${out.over100}`);
    console.log(
      `著色器：整段 ${out.shAll.n} 個 ${out.shAll.ms} ms；任務中 ${sh.length} 個 ${out.shPlay.ms} ms`,
    );
    for (const x of sh.slice(0, 30)) console.log(`   ${String(x.ms).padStart(4)} ms  ${x.name}  [${x.defs}]`);
    const nbp = out.nb.filter((x) => x.st === 'play');
    if (nbp.length) {
      console.log(`任務中觸發新風格程式的材質 ${nbp.length} 個：`);
      for (const x of nbp.slice(0, 40)) console.log(`   #${x.f} ${x.mat} [${x.flags}] ← ${x.owner}`);
    }
    console.log(`GC：${out.gcN} 次明顯的回收、合計 ${out.gcMB} MB`);
    console.log(`程式 ${out.programs}、幾何 ${out.geos}、貼圖 ${out.texs}`);
    console.log(
      '各段平均（ms／格）：' +
        Object.entries(out.sec)
          .filter(([, v]) => v >= 0.1)
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `${k} ${v}`)
          .join('、'),
    );
    if (out.gp) {
      console.log(`\n300 格的 getProgram：${out.gp.total} 次`);
      for (const [k, v] of out.gp.list) console.log(`  ${String(v).padStart(6)}  ${k}`);
    }
    const long = out.frames.filter((r) => r.st === 'play' && r.ms > LONG);
    console.log(`\n長的影格（CPU > ${LONG} ms）${long.length} 格，最長的 15 格：`);
    for (const r of [...long].sort((a, b) => b.ms - a.ms).slice(0, 15))
      console.log(
        `  #${r.i} ${r.ms} ms 程式+${r.prog} 幾何${r.geo >= 0 ? '+' : ''}${r.geo} GC ${r.gc} MB ${JSON.stringify(r.sec)} ${r.ev.join(' ')}`,
      );
    if (args.compare) {
      const f = path.join(OUT, `perf-${args.compare}.json`);
      if (!fs.existsSync(f)) console.log(`找不到 ${f}`);
      else {
        const b = JSON.parse(fs.readFileSync(f, 'utf8'));
        const row = (name, x, y) =>
          console.log(`  ${name.padEnd(20)} ${String(x).padStart(8)} → ${String(y).padStart(8)}`);
        console.log(`\n== 和 ${args.compare} 比較`);
        row('CPU p50', b.cpu.p50, out.cpu.p50);
        row('CPU p99', b.cpu.p99, out.cpu.p99);
        row('最長', b.cpu.max, out.cpu.max);
        row('>50 ms 的格', b.over50, out.over50);
        row('>100 ms 的格', b.over100, out.over100);
        row('任務中的著色器', b.shPlay.n, out.shPlay.n);
        row('任務中的編譯 ms', b.shPlay.ms, out.shPlay.ms);
        row('整段的著色器', b.shAll.n, out.shAll.n);
        row('GC MB', b.gcMB, out.gcMB);
        row('出擊載入 ms', b.load, out.load);
        if (b.gp && out.gp) row('getProgram／300 格', b.gp.total, out.gp.total);
        if (b.sampling && out.sampling) row('配置 MB／15 秒', b.sampling.allocMB, out.sampling.allocMB);
      }
    }
  } finally {
    await browser.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
