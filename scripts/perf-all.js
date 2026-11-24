// 全遊戲的效能與卡頓檢查（docs/perf-full-plan.md）：依分期跑各個量測、結果放在 test-results/perf-all/<tag>/，最後彙整成一份報告。
//
//   node scripts/perf-all.js --phase=1        主線的全部出擊（scripts/perf-campaign.js，第 1 周目）
//   node scripts/perf-all.js --phase=2        自由出擊：15 個主題、重的地圖換視角與畫質全開、空域、全部 Boss 與機獸
//   node scripts/perf-all.js --phase=3        選單與過場：開遊戲、機甲庫、作戰室（八個區域）、第 1 周目的過場
//   node scripts/perf-all.js --phase=4        平板（模擬）：1180x820 兩倍像素＋觸控＋內顯（Intel UHD 770）＋CPU 降速 1/4，重的地圖、主線 3 段、作戰室、過場
//   node scripts/perf-all.js --phase=5        長時間：同一個網頁反覆出擊、回機甲庫、進作戰室，每輪回收記憶體後記錄
//   node scripts/perf-all.js --phase=2,3,4,5  依序跑幾期；--resume＝已經有結果的項目略過（中斷後接著跑）
//   node scripts/perf-all.js --report         只重新彙整報告（test-results/perf-all/<tag>/report.md）
//   --tag=名稱（預設 full）、--only=項目名稱的開頭（逗號分隔）、--secs=每個自由出擊量幾秒（預設 40）
//
// 量測時電腦不要做其他重的事（音效產生、ComfyUI、語音、完整測試）。需要先 npm run build。
/* global window, document, requestAnimationFrame, localStorage, MutationObserver */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const os = require('os');
const { launch, initScript } = require('./perf-lib');

const args = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}
const ROOT = path.join(__dirname, '..');
const TAG = args.tag || 'full';
const OUT = path.join(ROOT, 'test-results', 'perf-all', TAG);
const SECS = +(args.secs || 40);
const ONLY = args.only ? String(args.only).split(',') : null;
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'run.log');
const log = (s) => {
  const line = `[${new Date().toLocaleTimeString('zh-TW', { hour12: false })}] ${s}`;
  console.log(line);
  fs.appendFileSync(LOG, line + '\n');
};
// 目標（2026-11-24 使用者定案）：低標的裝置上 fps 至少 24～30——平均 30 以上＝達標、24～30＝勉強、24 以下＝不合格
const FPS_OK = 30,
  FPS_MIN = 24;
const mark = (fps) => (fps >= FPS_OK ? '✅' : fps >= FPS_MIN ? '△' : '✗');
const tally = [];
const MEM_MIN = 3e9;
let oomHit = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const THEMES = [
  'industrial',
  'grid',
  'desert',
  'snow',
  'wasteland',
  'dunes',
  'flooded',
  'dam',
  'spaceport',
  'grid086',
  'xylem',
  'orbit',
  'institute',
  'volcano',
  'ark',
];
const HEAVY = ['grid086', 'institute', 'xylem', 'volcano']; // 上次量測最重、平板回報過卡的
const BOSSES = [
  'MONOLITH',
  'mirror',
  'flagship',
  'interceptor',
  'TETRARCH',
  'railgun',
  'worm',
  'funnel',
  'heli',
  'furnace',
  'artillery',
  'rampart',
  'duo',
  'phantom',
  'spider',
  'orbital',
  'ARCHON',
  'trinity',
  'hunter',
  'train',
  'fortress',
  'ibis',
  'anvil',
  'salamander',
  'gantry',
  'deckgun',
  'reactor',
  'sovereign',
];
const BEASTS = ['lion', 'tiger', 'bear', 'turtle', 'gorilla', 'scorpion', 'mantis', 'raptor'];
// 全部的項目一律用低標跑（2026-11-24 使用者定案：要確認一般的設備就跑得順）：內顯 Intel UHD 770＋CPU 降速 1/4；
// --hw＝改回這台的獨立顯示卡、不降速（比較用）
const LOW = args.hw ? {} : { PERF_GPU: 'low', PERF_CPU: '4' };
// 平板（使用者不在電腦旁，2026-11-24 改成模擬）：平板的解析度、2 倍像素、觸控＋內顯＋CPU 降速 1/4
const WEAK = { PERF_GPU: 'low', PERF_CPU: '4', PERF_TABLET: '1180x820' };
const WEAK_S = Object.assign({}, WEAK, { PERF_TABLET: '1000x626' }); // 小一點的平板（冒煙測試的平板大小）

// ---------- 各期的項目：{ id, kind: 'probe'|'campaign'|'hub'|'cine'|'inline', args, env } ----------
function scenarios(phase) {
  const L = [];
  const probe = (id, a, env) => L.push({ id, kind: 'probe', args: a, env });
  if (phase === 1) L.push({ id: 'camp', kind: 'campaign', args: ['--segsecs=150'] }); // 低標的自動操作比較慢
  if (phase === 2) {
    for (const t of THEMES) probe('free-' + t, ['--map=' + t]);
    for (const t of HEAVY) {
      probe(`view-${t}-chase`, ['--map=' + t, '--view=chase']);
      probe(`view-${t}-fps`, ['--map=' + t, '--view=fps']);
      probe(`full-${t}`, ['--map=' + t, '--full']);
    }
    probe('air', ['--map=airspace']);
    for (const b of BOSSES) probe('boss-' + b, ['--boss=' + b]);
    for (const b of BEASTS) probe('beast-' + b, ['--beast=' + b]);
  }
  if (phase === 3) {
    L.push({ id: 'startup', kind: 'inline', fn: startup });
    L.push({ id: 'garage', kind: 'inline', fn: garage });
    L.push({ id: 'hub', kind: 'hub', args: ['--ch=8', '--again', '--secs=15'] });
    L.push({ id: 'cine', kind: 'cine', args: ['c1'] });
  }
  if (phase === 4) {
    for (const t of [...HEAVY, 'orbit', 'ark', 'flooded', 'industrial'])
      probe('weak-' + t, ['--map=' + t], WEAK);
    probe('weak-boss-sovereign', ['--boss=sovereign'], WEAK);
    probe('weak-beast-lion', ['--beast=lion'], WEAK);
    for (const t of ['grid086', 'institute']) probe('weak-s-' + t, ['--map=' + t], WEAK_S);
    L.push({
      id: 'weak-camp',
      kind: 'campaign',
      args: ['--only=c4s1,c5s1,c3s2', '--segsecs=150'],
      env: WEAK,
    });
    L.push({ id: 'weak-hub', kind: 'hub', args: ['--ch=8', '--secs=15'], env: WEAK });
    L.push({ id: 'weak-cine', kind: 'cine', args: ['i1_2,o1_4,i1_6'], env: WEAK });
    L.push({ id: 'weak-startup', kind: 'inline', fn: startup, env: WEAK });
  }
  if (phase === 5) L.push({ id: 'soak', kind: 'inline', fn: soak });
  return L;
}

// ---------- 執行子程序 ----------
function runChild(script, a, env, tag) {
  return new Promise((res) => {
    const p = cp.spawn(process.execPath, ['--no-warnings', path.join(__dirname, script), ...a], {
      cwd: ROOT,
      env: Object.assign({}, process.env, env || {}),
    });
    const lf = fs.createWriteStream(path.join(OUT, tag + '.log'));
    p.stdout.pipe(lf);
    p.stderr.pipe(lf);
    // 記憶體防護：可用記憶體低於 MEM_MIN 時停掉這一項（Claude Code 會在系統記憶體不足時把整個量測停掉；
    // 2026-11-24 低標的主線 3 個出擊連跑時發生過）
    const iv = setInterval(() => {
      if (os.freemem() < MEM_MIN) {
        clearInterval(iv);
        oomHit = true;
        log(`  ${tag}：可用記憶體只剩 ${(os.freemem() / 1e9).toFixed(1)} GB，停掉這一項`);
        p.kill('SIGKILL');
        killStray();
      }
    }, 5000);
    p.on('close', (code) => {
      clearInterval(iv);
      res(code);
    });
  });
}
// 結果檢查：沒有檔案、格數太少、頁面錯誤、主線的出擊沒跑完 → 回傳原因（沒問題回傳空字串）
function check(s) {
  const p = path.join(OUT, s.id + '.json');
  if (!fs.existsSync(p)) return '沒有結果';
  let o;
  try {
    o = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return '結果的 JSON 壞了';
  }
  if (s.kind === 'probe') {
    const n = (o.frames || []).filter((r) => r.st === 'play').length;
    if (n < 60) return `任務中只有 ${n} 格`;
  }
  if (s.kind === 'campaign') {
    const want = s.args.find((a) => a.startsWith('--only='));
    const ids = Object.keys(o);
    if (want && ids.length < want.slice(7).split(',').length) return `只跑完 ${ids.length} 個出擊`;
    const bad = ids.filter((k) => !(o[k].segs || []).length);
    if (bad.length) return '沒有區段的出擊：' + bad.join('、');
  }
  if (s.kind === 'cine' && !(Array.isArray(o) && o.length)) return '過場沒有結果';
  if (s.kind === 'hub' && !(Array.isArray(o) && o.length && o[0].frames && o[0].frames.length > 5))
    return '作戰室沒有記到格（每一格都很慢的話是真的慢，不是量測失敗）';
  if (s.kind === 'inline' && o.errs && o.errs.length > 20) return `頁面錯誤 ${o.errs.length} 筆`;
  return '';
}
// 重跑前關掉這次留下的無頭瀏覽器（只篩 chrome／msedge 的程序名稱，見 CLAUDE.md 的記憶）
function killStray() {
  return new Promise((res) => {
    const ps =
      "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' OR Name='msedge.exe'\" | " +
      "Where-Object { $_.CommandLine -like '*--headless*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }";
    cp.execFile('powershell', ['-NoProfile', '-Command', ps], () => setTimeout(res, 2000));
  });
}
async function runOne(s0) {
  const s = Object.assign({}, s0, { env: Object.assign({}, LOW, s0.env || {}) });
  const out = path.join(OUT, s.id + '.json');
  const t0 = Date.now();
  let code = 0;
  if (s.kind === 'probe') {
    code = await runChild(
      'perf-probe.js',
      [...s.args, `--secs=${SECS}`, `--tag=pa-${TAG}-${s.id}`],
      s.env,
      s.id,
    );
    const src = path.join(ROOT, 'test-results', `perf-pa-${TAG}-${s.id}.json`);
    if (fs.existsSync(src)) fs.renameSync(src, out);
  } else if (s.kind === 'campaign') {
    code = await runChild(
      'perf-campaign.js',
      [...s.args, `--tag=pa-${TAG}-${s.id}`, ...(args.resume ? ['--resume'] : [])],
      s.env,
      s.id,
    );
    const src = path.join(ROOT, 'test-results', 'perf-campaign', `pa-${TAG}-${s.id}.json`);
    if (fs.existsSync(src)) fs.copyFileSync(src, out);
  } else if (s.kind === 'hub') {
    code = await runChild('perf-hub.js', [...s.args, `--tag=pa-${TAG}-${s.id}`], s.env, s.id);
    const src = path.join(ROOT, 'test-results', `perf-hub-pa-${TAG}-${s.id}.json`);
    if (fs.existsSync(src)) fs.renameSync(src, out);
  } else if (s.kind === 'cine') {
    code = await runChild('cine-perf.js', [...s.args, `--tag=pa-${TAG}-${s.id}`], s.env, s.id);
    const src = path.join(ROOT, 'test-results', `cine-perf-pa-${TAG}-${s.id}.json`);
    if (fs.existsSync(src)) fs.renameSync(src, out);
  } else {
    const old = {};
    for (const k in s.env || {}) ((old[k] = process.env[k]), (process.env[k] = s.env[k]));
    try {
      fs.writeFileSync(out, JSON.stringify(await s.fn(), null, 1));
    } catch (e) {
      code = 1;
      log(`  ${s.id} 失敗：${e.message}`);
    } finally {
      for (const k in old)
        if (old[k] === undefined) delete process.env[k];
        else process.env[k] = old[k];
    }
  }
  log(
    `  ${s.id}：${code === 0 && fs.existsSync(out) ? '完成' : '失敗（結束碼 ' + code + '）'}，${Math.round((Date.now() - t0) / 1000)} 秒`,
  );
}

// ---------- 頁面裡的共用：記錄每一格的間隔 ----------
function gapRec(secs) {
  return new Promise((done) => {
    const gaps = [];
    let last = performance.now();
    const t0 = last;
    const tick = (now) => {
      gaps.push(+(now - last).toFixed(1));
      last = now;
      if (now - t0 < secs * 1000) requestAnimationFrame(tick);
      else done(gaps);
    };
    requestAnimationFrame(tick);
  });
}
function gapSum(gaps) {
  const s = gaps.slice().sort((a, b) => a - b);
  const q = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0);
  const tot = gaps.reduce((a, b) => a + b, 0);
  return {
    n: gaps.length,
    fps: tot ? +((gaps.length * 1000) / tot).toFixed(1) : 0,
    p50: q(0.5),
    p99: q(0.99),
    max: q(1),
    hitch: gaps.filter((g) => g >= 50).length,
    worst: gaps
      .map((g, i) => [g, i])
      .filter((x) => x[0] >= 50)
      .sort((a, b) => b[0] - a[0])
      .slice(0, 8)
      .map((x) => x[0]),
  };
}
async function newPage(br) {
  const ctx = await br.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  page.__errs = [];
  page.on('pageerror', (e) => page.__errs.push(e.message));
  await page.addInitScript(initScript);
  await page.addInitScript(() => (window.__warmAsync = true));
  return { ctx, page };
}
const URL0 = require('url').pathToFileURL(path.join(ROOT, 'dist', 'mech-cordon.html')).href + '?test&tile=32';
async function newSave(page) {
  await page.click('#btnSaves');
  await page.click('#saveSlots [data-slot="1"] [data-act="new"]');
  await page.waitForFunction(() => window.__game.state === 'garage', null, { timeout: 30000 });
}

// 開遊戲：到標題畫面要多久、之後 40 秒（背景載入各個素材包）的卡頓與長任務、載入的資源
async function startup() {
  const br = await launch();
  try {
    const { page } = await newPage(br);
    // file:// 的資源不在 resource timing 裡：記錄加進頁面的 <script>（素材包 lib/*.js）的加入與載入完成時間
    await page.addInitScript(() => {
      window.__scr = [];
      new MutationObserver((ms) => {
        for (const m of ms)
          for (const n of m.addedNodes)
            if (n.tagName === 'SCRIPT' && n.src) {
              const r = {
                src: n.src.split('/lib/')[1] || n.src.split('/').pop(),
                t: Math.round(performance.now()),
              };
              window.__scr.push(r);
              n.addEventListener('load', () => (r.d = Math.round(performance.now() - r.t)));
            }
      }).observe(document, { childList: true, subtree: true });
    });
    const t0 = Date.now();
    await page.goto(URL0);
    const tGame = Date.now() - t0;
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
      timeout: 90000,
    });
    const tTitle = Date.now() - t0;
    const gaps = await page.evaluate(gapRec, 40);
    const r = await page.evaluate(() => ({
      lt: window.__lt.map((x) => [Math.round(x.t), Math.round(x.d)]),
      res: window.__scr.map((r) => [r.src, r.t, r.d === undefined ? '' : r.d, '']),
      heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : 0,
      sfx: window.__sfx ? Object.keys(window.__sfx.buf).length : 0,
    }));
    return { tGame, tTitle, gap: gapSum(gaps), ...r, errs: page.__errs };
  } finally {
    await br.close();
  }
}

// 機甲庫：格納庫的待機、拖曳繞看、換部位的鏡頭
async function garage() {
  const br = await launch();
  try {
    const { page } = await newPage(br);
    await page.goto(URL0);
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
      timeout: 90000,
    });
    await sleep(1500);
    await newSave(page);
    await page
      .waitForFunction(() => window.MECH_CORDON_HANGAR || window.__game.hangarRich, null, { timeout: 30000 })
      .catch(() => {});
    await sleep(4000);
    const idle = gapSum(await page.evaluate(gapRec, 12));
    // 拖曳繞看
    const p = page.evaluate(gapRec, 12);
    for (let i = 0; i < 10; i++) {
      await page.mouse.move(800, 450);
      await page.mouse.down({ button: 'left' });
      for (let k = 0; k < 10; k++) await page.mouse.move(800 + k * 25, 450 + (k % 3) * 5);
      await page.mouse.up({ button: 'left' });
      await sleep(400);
    }
    const drag = gapSum(await p);
    // 換部位（鏡頭轉過去）
    const p2 = page.evaluate(gapRec, 12);
    await page.evaluate(async () => {
      const g = window.__game;
      for (const s of ['head', 'core', 'arms', 'legs', 'booster', 'rarm', 'larm', 'rback', 'lback']) {
        g.garageSlot = s;
        if (g.renderGarage) g.renderGarage();
        await new Promise((r) => setTimeout(r, 1200));
      }
    });
    const slots = gapSum(await p2);
    return { idle, drag, slots, errs: page.__errs };
  } finally {
    await br.close();
  }
}

// 長時間：同一個網頁反覆出擊（換地圖）→ 放棄 → 機甲庫，每 3 輪進一次作戰室；每輪回收記憶體後記錄
async function soak() {
  const N = +(args.rounds || 14);
  const br = await launch();
  const maps = ['industrial', 'grid086', 'xylem', 'institute', 'snow', 'volcano', 'ark', 'dam'];
  try {
    const { ctx, page } = await newPage(br);
    const cdp = await ctx.newCDPSession(page);
    await page.goto(URL0);
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
      timeout: 90000,
    });
    await sleep(1500);
    await newSave(page);
    await sleep(3000);
    const rows = [];
    const t0 = Date.now();
    const sample = async (i, what) => {
      await cdp.send('HeapProfiler.collectGarbage');
      await sleep(500);
      const r = await page.evaluate(() => {
        const g = window.__game,
          I = g.renderer.info;
        let objs = 0;
        g.scene.traverse(() => objs++);
        return {
          heap: +(performance.memory.usedJSHeapSize / 1e6).toFixed(1),
          geo: I.memory.geometries,
          tex: I.memory.textures,
          prog: I.programs ? I.programs.length : 0,
          objs,
          sfx: window.__sfx ? Object.keys(window.__sfx.buf).length : 0,
          dom: document.getElementsByTagName('*').length,
          state: g.state,
        };
      });
      rows.push({ i, what, t: Math.round((Date.now() - t0) / 1000), ...r });
      log(
        `    第 ${i} 輪 ${what}：heap ${r.heap} MB、幾何 ${r.geo}、貼圖 ${r.tex}、程式 ${r.prog}、場景物件 ${r.objs}、音效 ${r.sfx}`,
      );
    };
    await sample(0, 'garage');
    const fights = [];
    for (let i = 1; i <= N; i++) {
      if (os.freemem() < MEM_MIN) {
        log(`    可用記憶體只剩 ${(os.freemem() / 1e9).toFixed(1)} GB，第 ${i} 輪之前停止`);
        break;
      }
      const map = maps[(i - 1) % maps.length];
      await page.evaluate((m) => {
        localStorage.setItem('mech_cordon_map', m);
        window.__game.encLazy = true;
        window.__game.startMission();
      }, map);
      await page.waitForFunction(
        () => window.__game.state === 'play' && window.__game.player && !window.__game.warmBusy,
        null,
        {
          timeout: 120000,
        },
      );
      // 出擊中：每 4 秒擊破最近的兩台敵人、玩家不會被擊破；同時記錄每格的間隔
      const gp = page.evaluate(gapRec, 50);
      for (let k = 0; k < 12; k++) {
        await page.evaluate(() => {
          const g = window.__game,
            p = g.player;
          if (!p || p.dead) return;
          p.hp = p.maxHp;
          const al = g.enemies.filter((e) => !e.dead && !e.isBoss);
          al.sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos));
          for (const e of al.slice(0, 2)) e.takeDamage(1e7, 0, p, e.pos.clone(), null, false, 'w_rifle');
        });
        await sleep(4000);
      }
      fights.push({ i, map, ...gapSum(await gp) });
      await page.evaluate(() => document.getElementById('btnAbort').click());
      await page.waitForFunction(() => window.__game.state !== 'play', null, { timeout: 30000 });
      await sleep(1500);
      await page.evaluate(() => window.__game.openGarage());
      await sleep(2000);
      if (i % 3 === 0) {
        await page.evaluate(() => window.__game.openHub());
        await sleep(6000);
        await page.evaluate(() => window.__game.openGarage());
        await sleep(2000);
      }
      await sample(i, map);
    }
    return { rows, fights, errs: page.__errs };
  } finally {
    await br.close();
  }
}

// ---------- 彙整 ----------
function probeRow(o) {
  const f = (o.frames || []).filter((r) => r.st === 'play');
  const t0 = f.length ? f[0].i : 0;
  const steady = f.slice(Math.min(f.length, 240)); // 進場後約 3 秒以後
  const gaps = steady.map((r) => r.gap);
  const g = gapSum(gaps);
  const top = Object.entries(o.sec || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([k, v]) => `${k} ${v}`)
    .join('、');
  return {
    load: o.load,
    cpu: o.cpu,
    g,
    top,
    sh: o.shPlay,
    gc: o.gcN,
    geo: o.geos,
    tex: o.texs,
    boss: o.boss,
    map: o.map,
    t0,
  };
}
function report() {
  const L = [
    '# 全遊戲的效能與卡頓檢查（' + TAG + '）',
    '',
    `產生時間：${new Date().toLocaleString('zh-TW')}`,
    '',
    args.hw
      ? '裝置：這台的獨立顯示卡（RTX 4070），CPU 不降速。'
      : '裝置：低標——內顯 Intel UHD 770＋CPU 降速 1/4（畫面 1600×900；weak-＝平板 1180×820 兩倍像素＋觸控，weak-s-＝1000×626）。',
    '',
  ];
  const J = (id) => {
    const p = path.join(OUT, id + '.json');
    return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  };
  // 自由出擊類（第 2、4 期）
  const ids = fs
    .readdirSync(OUT)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5));
  const probes = ids.filter((id) =>
    /^(free|view|full|air|boss|beast|weak-(?!camp|hub|cine|startup))/.test(id),
  );
  if (probes.length) {
    L.push(
      '## 自由出擊（每個 ' + SECS + ' 秒；進場後 3 秒起算）',
      '',
      '| 項目 | 地圖 | Boss | 載入 ms | 達標 | fps | 間隔 p50／p99／最長 | 卡頓 ≥50 | 主迴圈 p99 | 任務中編譯（個／ms） | GC 次數 | 幾何／貼圖 | 各段平均前四（ms／格） |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    );
    for (const id of probes) {
      const o = J(id);
      if (!o || !o.frames) continue;
      const r = probeRow(o);
      tally.push([id, r.g.fps]);
      L.push(
        `| ${id} | ${r.map} | ${r.boss || ''} | ${r.load} | ${mark(r.g.fps)} | ${r.g.fps} | ${r.g.p50}／${r.g.p99}／${r.g.max} | ${r.g.hitch} | ${r.cpu.p99} | ${r.sh ? r.sh.n + '／' + r.sh.ms : ''} | ${r.gc} | ${r.geo}／${r.tex} | ${r.top} |`,
      );
    }
    L.push('');
  }
  for (const id of ['camp', 'weak-camp']) {
    const o = J(id);
    if (!o) continue;
    L.push(
      `## 主線（${id}）`,
      '',
      `詳細報告：test-results/perf-campaign/pa-${TAG}-${id}.md`,
      '',
      '| 出擊 | 段 | 主題／變體 | 類型 | 達標 | fps 平均／最差 1% | 間隔 p99／最長 | 卡頓／小卡頓 | 進場 ms | heap MB |',
      '|---|---|---|---|---|---|---|---|---|---|',
    );
    for (const sid of Object.keys(o))
      for (const g of o[sid].segs || []) {
        tally.push([`${id}:${sid}#${g.seg + 1}`, g.fps]);
        L.push(
          `| ${sid} | ${g.seg + 1} | ${g.theme} ${g.variant || ''} | ${g.type}${g.boss ? '(Boss)' : ''} | ${mark(g.fps)} | ${g.fps}／${g.low1} | ${g.gap.p99}／${g.gap.max} | ${g.hitch}／${g.mini} | ${g.sync}＋${g.prep} | ${g.mem ? g.mem.heap : ''} |`,
        );
      }
    L.push('');
  }
  for (const id of ['startup', 'weak-startup']) {
    const o = J(id);
    if (!o) continue;
    const big = (o.lt || []).filter((x) => x[1] >= 100);
    L.push(
      `## 開遊戲（${id}）`,
      '',
      `到遊戲實例 ${o.tGame} ms、到標題畫面 ${o.tTitle} ms；之後 40 秒：fps ${o.gap.fps}、卡頓 ${o.gap.hitch} 次（最長 ${o.gap.worst.join('、')} ms）、` +
        `長任務 ${o.lt.length} 次（100 ms 以上 ${big.length} 次：${big
          .slice(0, 10)
          .map((x) => `${x[1]} ms@${(x[0] / 1000).toFixed(1)}s`)
          .join('、')}）；heap ${o.heap} MB、音效 ${o.sfx} 個`,
      '',
      '| 素材包 | 開始 ms | 載入 ms |',
      '|---|---|---|',
      ...(o.res || []).map((x) => `| ${x[0]} | ${x[1]} | ${x[2]} |`),
      '',
    );
  }
  const ga = J('garage');
  if (ga) {
    L.push('## 機甲庫', '', '| 動作 | fps | 間隔 p99／最長 | 卡頓 |', '|---|---|---|---|');
    for (const k of ['idle', 'drag', 'slots'])
      (tally.push(['garage-' + k, ga[k].fps]),
        L.push(
          `| ${{ idle: '待機', drag: '拖曳繞看', slots: '換部位' }[k]} | ${mark(ga[k].fps)} ${ga[k].fps} | ${ga[k].p99}／${ga[k].max} | ${ga[k].hitch} |`,
        ));
    L.push('');
  }
  for (const id of ['hub', 'weak-hub']) {
    const o = J(id);
    if (!o) continue;
    L.push(
      `## 作戰室（${id}）`,
      '',
      '| 次 | 格 | fps | 間隔 p99／最長 | 卡頓 | 繪製 |',
      '|---|---|---|---|---|---|',
    );
    for (const r of o) {
      const gaps = (r.frames || []).map((f) => f.gap).filter((x) => x !== undefined);
      const s = gapSum(gaps.slice(30));
      tally.push([`${id}:${r.label}`, s.fps]);
      L.push(
        `| ${r.label} | ${gaps.length} | ${mark(s.fps)} ${s.fps} | ${s.p99}／${s.max} | ${s.hitch} | ${r.calls || ''} |`,
      );
    }
    L.push('');
  }
  for (const id of ['cine', 'weak-cine']) {
    const o = J(id);
    if (!o) continue;
    L.push(
      `## 過場（${id}）`,
      '',
      '| 段 | 準備 秒 | fps | 間隔 p99 | 卡頓 | 最長的幾次（ms@秒） |',
      '|---|---|---|---|---|---|',
    );
    for (const r of o)
      (tally.push([`${id}:${r.key}`, r.fps]),
        L.push(
          `| ${r.key} | ${r.prep} | ${mark(r.fps)} ${r.fps} | ${r.p99} | ${r.hitch} | ${r.worst.map((x) => x[0] + '@' + x[1]).join('、')} |`,
        ));
    L.push('');
  }
  const so = J('soak');
  if (so) {
    L.push(
      '## 長時間（每輪回收記憶體之後）',
      '',
      '| 輪 | 秒 | 地圖 | heap MB | 幾何 | 貼圖 | 程式 | 場景物件 | 音效 | DOM | 那一輪的 fps／卡頓 |',
      '|---|---|---|---|---|---|---|---|---|---|---|',
    );
    for (const r of so.rows) {
      const f = so.fights.find((x) => x.i === r.i);
      L.push(
        `| ${r.i} | ${r.t} | ${r.what} | ${r.heap} | ${r.geo} | ${r.tex} | ${r.prog} | ${r.objs} | ${r.sfx} | ${r.dom} | ${f ? f.fps + '／' + f.hitch : ''} |`,
      );
    }
    L.push('');
  }
  // 開頭的總覽：達標的比例與不合格的項目（由低到高）
  const bad = tally.filter((x) => x[1] < FPS_MIN).sort((a, b) => a[1] - b[1]);
  const mid = tally.filter((x) => x[1] >= FPS_MIN && x[1] < FPS_OK);
  L.splice(
    6,
    0,
    `## 目標：fps 至少 ${FPS_MIN}～${FPS_OK}`,
    '',
    `共 ${tally.length} 項：✅ 平均 ${FPS_OK} 以上 ${tally.length - bad.length - mid.length} 項、△ ${FPS_MIN}～${FPS_OK} ${mid.length} 項、✗ ${FPS_MIN} 以下 ${bad.length} 項。`,
    '',
    bad.length ? '不合格（由低到高）：' + bad.map((x) => `${x[0]} ${x[1]}`).join('、') : '',
    '',
  );
  fs.writeFileSync(path.join(OUT, 'report.md'), L.join('\n'));
  log('報告：' + path.join(OUT, 'report.md'));
}

(async () => {
  if (args.report) return report();
  const phases = String(args.phase || '')
    .split(',')
    .filter(Boolean)
    .map(Number);
  if (!phases.length) throw new Error('要指定 --phase=1～5 或 --report');
  for (const ph of phases) {
    log(`== 第 ${ph} 期`);
    for (const s of scenarios(ph)) {
      if (ONLY && !ONLY.some((o) => s.id.startsWith(o))) continue;
      if (args.resume && fs.existsSync(path.join(OUT, s.id + '.json')) && s.kind !== 'campaign') continue;
      log(`  開始 ${s.id}`);
      // 失敗或結果不完整時重跑（最多 3 次；主線用 --resume 從沒跑完的出擊接著跑）
      for (let k = 1; k <= 3; k++) {
        oomHit = false;
        await runOne(s);
        if (oomHit) {
          log(`  ${s.id} 記憶體不足，不重跑（結果裡記下的部分照樣彙整）`);
          await killStray();
          await sleep(5000);
          break;
        }
        const why = check(s);
        if (!why) break;
        log(`  ${s.id} 有問題（${why}），${k < 3 ? '重跑第 ' + k + ' 次' : '放棄'}`);
        if (k < 3 && s.kind !== 'campaign') fs.rmSync(path.join(OUT, s.id + '.json'), { force: true });
        if (s.kind === 'campaign') args.resume = true;
        await killStray();
      }
    }
    report();
  }
})().catch((e) => {
  log('中止：' + e.stack);
  process.exit(1);
});
