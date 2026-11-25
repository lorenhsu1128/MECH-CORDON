// 卡頓量測的共用部分（scripts/perf-probe.js、scripts/perf-campaign.js）：頁面載入前的紀錄（固定亂數、著色器連結、長任務）、
// 出擊後各段的計時（instrument）、啟動顯示卡算繪的瀏覽器
/* global THREE, window, requestAnimationFrame, WebGLRenderingContext, WebGL2RenderingContext */
const fs = require('fs');
const { chromium } = require('playwright-core');

const BROWSERS = [
  process.env.BENCH_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

// 模擬弱的裝置（docs/perf-full-plan.md 第 4 期）：環境變數 PERF_GPU=low 改用省電的顯示卡（這台是內顯 Intel UHD 770）、
// PERF_CPU=4 把 CPU 降速成 1/4（Chrome DevTools 的 CPU throttling，每個新分頁自動套用）、
// PERF_TABLET=1180x820（寬x高）＝平板：畫面改成這個大小、2 倍像素、觸控（取代各腳本自己的 viewport）
async function launch() {
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  if (!exe) throw new Error('找不到 Edge 或 Chrome');
  const gpu = process.env.PERF_GPU,
    cpu = +process.env.PERF_CPU || 0;
  const br = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: [
      process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=default',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
      '--enable-precise-memory-info',
      ...(gpu === 'low' ? ['--force_low_power_gpu'] : gpu === 'high' ? ['--force_high_performance_gpu'] : []),
    ],
  });
  const tab = /^(\d+)x(\d+)$/.exec(process.env.PERF_TABLET || '');
  if (cpu > 1 || tab) {
    const nc = br.newContext.bind(br);
    br.newContext = async (o = {}, ...a) => {
      if (tab)
        o = Object.assign({}, o, {
          viewport: { width: +tab[1], height: +tab[2] },
          deviceScaleFactor: 2,
          hasTouch: true,
        });
      const ctx = await nc(o, ...a);
      if (!(cpu > 1)) return ctx;
      const np = ctx.newPage.bind(ctx);
      ctx.newPage = async () => {
        const pg = await np();
        const cdp = await ctx.newCDPSession(pg);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
        pg.__cdp = cdp; // 留著（回收了降速就失效）
        return pg;
      };
      return ctx;
    };
  }
  return br;
}

// 頁面載入前：固定亂數、記錄著色器連結、getProgram 的原因
function initScript() {
  let a = 1;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  window.__reseed = (s) => (a = s >>> 0);
  window.__lt = [];
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) window.__lt.push({ t: e.startTime, d: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch (e) {}
  window.__sh = [];
  window.__shOn = true;
  const DEFS = [
    'USE_SKINNING',
    'USE_INSTANCING',
    'USE_MAP',
    'USE_COLOR',
    'USE_SHADOWMAP',
    'USE_FOG',
    'ST_DECAL',
    'USE_NORMALMAP',
    'USE_EMISSIVEMAP',
    'USE_ALPHAMAP',
    'FLAT_SHADED',
    'DOUBLE_SIDED',
    'USE_ENVMAP',
    'USE_AOMAP',
    'DEPTH_PACKING',
  ];
  for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) {
    const P = C.prototype;
    const src = new WeakMap();
    const ss = P.shaderSource;
    P.shaderSource = function (sh, s) {
      src.set(sh, s);
      return ss.call(this, sh, s);
    };
    const at = P.attachShader;
    P.attachShader = function (pg, sh) {
      pg.__src = (pg.__src || '') + (src.get(sh) || '');
      return at.call(this, pg, sh);
    };
    const lk = P.linkProgram;
    P.linkProgram = function (pg) {
      pg.__t0 = performance.now();
      return lk.call(this, pg);
    };
    const gpp = P.getProgramParameter;
    P.getProgramParameter = function (pg, k) {
      const r = gpp.call(this, pg, k);
      if (pg.__t0 && !pg.__done) {
        pg.__done = 1;
        const v = pg.__src || '';
        const name = (/#define SHADER_NAME (\S+)/.exec(v) || [])[1] || '?';
        window.__sh.push({
          t: performance.now(),
          ms: Math.round(performance.now() - pg.__t0),
          name,
          len: v.length,
          defs: DEFS.filter((d) => v.includes('#define ' + d)).join(','),
          // 出擊的著色器預熱（載入畫面蓋著）編的記成 prep，不算任務中
          st: window.__game
            ? window.__inWarm ||
              window.__game.warmBusy ||
              (window.__game.world && window.__game.warmWorld !== window.__game.world)
              ? 'prep'
              : window.__game.state
            : '',
        });
        pg.__src = null;
      }
      return r;
    };
  }
  window.__gpc = new Map();
  window.__gpOn = false;
  window.__gp = (m, o, why) => {
    if (!window.__gpOn) return;
    const k =
      why +
      ' | ' +
      m.type +
      (m.name ? '「' + m.name + '」' : '') +
      ' | ' +
      (o.isInstancedMesh ? 'InstancedMesh' : o.isSkinnedMesh ? 'SkinnedMesh' : o.type);
    window.__gpc.set(k, (window.__gpc.get(k) || 0) + 1);
  };
}

// 出擊後包裝各段的計時
function instrument() {
  const g = window.__game,
    P = Object.getPrototypeOf(g),
    R = g.renderer;
  const W = (window.__prof = { frames: [], ev: [], cur: null, on: false });
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
        if (W.on && (ms > 4 || tag[0] === '!')) W.ev.push({ f: W.frames.length, tag, ms: +ms.toFixed(1) });
      }
    };
    f.__perf = 1;
    obj[name] = f;
  };
  for (const n of [
    'renderMain',
    'drawHud',
    'updatePlayer',
    'aiDirectorTick',
    'updateCamera',
    'updateMapExtras',
    'updateSupport',
    'updateHazards',
    'crowdTick',
    'waveTick',
    'devTick',
    'devVisTick',
    'cacheTick',
    'tickPopups',
    'updateLoops',
    'lodTick',
    'separateMechs',
    'tfxTick',
    'bgmFrame',
    'propCrushTick',
    'waterTick',
    'fxAmbientTick',
    'propDmgTick',
    'aiStep',
    'campTick',
    'encWakeTick',
    'spawnQTick',
    'hudTick',
    'updateOcclusion',
    'wrapTick', // 無邊界地圖的搬移與通用的掃描（game/torus.js）
    'mvTick', // 地圖載具（game/map-veh.js）
  ])
    wrap(P, n, n);
  // 機體每格的方法（全部機體加起來）：AI、移動、閃避、身體部位破壞、特效
  // （機體的原型等第一台機體出現時才包裝：見下面的 loop）
  const wrapE = (e) => {
    const EP = Object.getPrototypeOf(e);
    for (const n of ['updateAI', 'move', 'dgMove', 'bodyTick', 'specialFx', 'mvfxTick'])
      wrap(EP, n, 'e.' + n);
    W.ep = true;
  };
  // AI 音效包：base64 轉成 ArrayBuffer 在主執行緒（敵人生成時才載入的群組，docs/sfx-gen-design.md）
  if (window.__sfx) for (const n of ['b64', 'needGroup']) wrap(window.__sfx, n, 'sfx.' + n);
  if (g.world)
    for (const n of ['updateOcclusion', 'poolTick']) wrap(Object.getPrototypeOf(g.world), n, 'world.' + n);
  for (const n of [
    'spawnEnemy',
    'waveSpawn',
    'waveLaunch',
    'onEnemyKilled',
    'flashMsg',
    'showBanner',
    'shaderWarm',
    'warmLateNow',
    'campEnterSeg',
    'campCleared',
    'campSpawnExits',
    'campLeave',
    'encWake',
    'damageProp',
    'propCollapse',
    'propDrop',
    'cacheOpen',
    'campComm',
    'voiceCue',
    'dropAmmo',
    'goalIntro',
    'tfx',
    'flashAlert',
    'bossPhaseShift',
    'beastSpawn',
  ])
    wrap(P, n, '!' + n);
  const fxP = Object.getPrototypeOf(g.fx);
  for (const n of ['explosion', 'killBurst', 'collapse']) wrap(fxP, n, '!fx.' + n);
  wrap(fxP, 'update', 'fx.update');
  const spP = Object.getPrototypeOf(g.stylePipe);
  for (const n of ['renderSoft', 'renderNormals', 'heatPass', 'raysPass']) wrap(spP, n, 'pipe.' + n);
  if (g.stylePipe.bloom) wrap(g.stylePipe.bloom, 'render', 'pipe.bloom');
  // 哪個材質觸發了新的風格著色器程式（onBeforeCompile 只在建立新程式時呼叫）：記下材質，結束時找它屬於哪個物件
  W.nb = [];
  const SP = THREE.MeshStandardMaterial.prototype,
    obc = SP.onBeforeCompile;
  SP.onBeforeCompile = function (sh, r) {
    if (W.on) {
      // --owner：編譯當下就找它屬於哪個物件（之後碎片、特效可能已經不在場景裡；走訪整個場景，會拖慢那一格）
      const m = this;
      let at = null;
      if (window.__probeOwner)
        g.scene.traverse((o) => {
          if (
            !at &&
            o.material &&
            (o.material === m || (Array.isArray(o.material) && o.material.includes(m)))
          )
            at = o;
        });
      W.nb.push({ f: W.frames.length, m, st: g.state, at });
    }
    return obc.call(this, sh, r);
  };
  // 預熱（shaderWarm／warmPrime）進行中：那一格是載入畫面蓋著的準備，不算任務中的卡頓與編譯
  window.__warmN = 0;
  for (const n of ['shaderWarm', 'warmPrime']) {
    const f = P[n];
    if (typeof f !== 'function') continue;
    P[n] = function (...a) {
      window.__inWarm = (window.__inWarm || 0) + 1;
      window.__warmN++;
      try {
        return f.apply(this, a);
      } finally {
        window.__inWarm--;
      }
    };
  }
  const loop = P.loop;
  let lastHeap = 0,
    lastT = performance.now();
  P.loop = function () {
    if (!W.ep && this.player && this.player.updateAI) wrapE(this.player);
    const t0 = performance.now();
    const rec = { t0, gap: t0 - lastT, sec: {}, st: this.state };
    const wn0 = window.__warmN;
    const prep0 = this.warmBusy || (this.world && this.warmWorld !== this.world);
    lastT = t0;
    W.cur = rec;
    const p0 = R.info.programs ? R.info.programs.length : 0;
    R.info.autoReset = false; // 一格裡的全部算繪（管線的每一次）加起來
    R.info.reset();
    const g0 = R.info.memory.geometries,
      x0 = R.info.memory.textures;
    try {
      loop.call(this);
    } finally {
      rec.ms = performance.now() - t0;
      rec.prog = (R.info.programs ? R.info.programs.length : 0) - p0;
      rec.geo = R.info.memory.geometries - g0;
      rec.tex = R.info.memory.textures - x0;
      rec.calls = R.info.render.calls;
      rec.tris = R.info.render.triangles;
      let en = 0;
      for (const e of this.enemies || []) if (!e.dead) en++;
      rec.en = en;
      if (window.__botFlag) rec.bot = window.__botFlag;
      // 「戰場準備中」還蓋著（預熱的編譯、warmPrime）：畫面本來就停著，卡頓另外算
      if (prep0 || window.__warmN !== wn0 || this.warmBusy || (this.world && this.warmWorld !== this.world)) {
        rec.prep = 1;
        if (rec.st === 'play') rec.st = 'prep';
      }
      const hp = performance.memory ? performance.memory.usedJSHeapSize : 0;
      rec.gc = lastHeap && hp < lastHeap - 2e6 ? +((lastHeap - hp) / 1e6).toFixed(1) : 0;
      lastHeap = hp;
      rec.hp = +(hp / 1e6).toFixed(1);
      W.cur = null;
      if (W.on) W.frames.push(rec);
    }
  };
}

module.exports = { launch, initScript, instrument };
