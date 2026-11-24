// ============================================================
//  遊戲內的效能紀錄（Game 的 mixin；docs/perf-full-plan.md）：給平板等實機量卡頓。
//  標題「工具與其他」的「效能紀錄」或網址帶 ?perfrec 開始：逐格記兩格的間隔與主迴圈的耗時、
//  卡頓（間隔 ≥ PRF_HITCH ms）時那一格與上一格各段的耗時、前 2 秒的事件、著色器編譯、GC、長任務，
//  每秒一筆記憶體與繪製次數，畫面（state、地圖、主線的出擊與區段、視角）改變時記一筆情境。
//  從伺服器網址開時每分鐘上傳一次到 /api/perf/<id>（server-models/perf/），停止時上傳；也可以下載 JSON。
//  沒在紀錄時完全不包裝任何方法（不影響效能）。
// ============================================================
import { Game } from './game.js';
import { SFX } from '../audio/audio.js';
import { MechEntity } from '../entities/mech-entity.js';

const PRF_HITCH = 50; // 這麼長的間隔算一次卡頓（ms）
const PRF_MAX_F = 60 * 60 * 90; // 最多記這麼多格（約 90 分鐘）
const PRF_MAX_H = 3000; // 卡頓的細節最多幾筆
// 每格的各段（記在目前這一格，卡頓時附上）
const SEC_G = [
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
  'cacheTick',
  'tickPopups',
  'updateLoops',
  'lodTick',
  'separateMechs',
  'tfxTick',
  'bgmFrame',
  'waterTick',
  'fxAmbientTick',
  'propDmgTick',
  'campTick',
  'wrapTick',
  'mvTick',
  'hubTick',
  'cineTick',
  'tickHangar',
];
// 事件（卡頓前 2 秒內發生的，附在卡頓上）
const EV_G = [
  'spawnEnemy',
  'waveSpawn',
  'onEnemyKilled',
  'shaderWarm',
  'warmLateNow',
  'campEnterSeg',
  'campCleared',
  'campLeave',
  'encWake',
  'damageProp',
  'propCollapse',
  'cacheOpen',
  'campComm',
  'voiceCue',
  'dropAmmo',
  'tfx',
  'bossPhaseShift',
  'showScreen',
  'startMission',
  'openHub',
  'openGarage',
  'cinePlay',
  'beastSpawn',
];
// 機體每格的方法（全部機體加起來記成一段）
const SEC_E = ['updateAI', 'move', 'dgMove', 'bodyTick', 'specialFx', 'mvfxTick', 'trailsTick'];
// 音效：AI 音效包的解碼（base64 → ArrayBuffer 在主執行緒）
const SEC_S = ['b64', 'needGroup', 'loadAiPack'];

Object.assign(Game.prototype, {
  // 標題「工具與其他」的「效能紀錄」面板
  prfUi() {
    const el = document.getElementById('perfRecBox');
    if (!el) return;
    const R = this.prf;
    const st = document.getElementById('perfRecSt');
    if (st)
      st.textContent = R
        ? `紀錄中：${Math.round((performance.now() - R.t0) / 1000)} 秒、${R.n} 格、卡頓 ${R.hitch.length} 次`
        : this.prfLast
          ? `上一次：${this.prfLast.n} 格、卡頓 ${this.prfLast.hitch.length} 次` +
            (this.prfLast.up ? `（已上傳 ${this.prfLast.id}）` : '')
          : '還沒有紀錄';
    document.getElementById('perfRecGo').textContent = R ? '停止並上傳' : '開始紀錄';
    document.getElementById('perfRecDl').disabled = !(R || this.prfLast);
  },
  prfInitUi() {
    const go = document.getElementById('perfRecGo');
    if (!go) return;
    document.getElementById('btnPerfRec').onclick = () => {
      document.getElementById('perfRecBox').classList.add('on');
      this.prfUi();
    };
    document.getElementById('perfRecClose').onclick = () =>
      document.getElementById('perfRecBox').classList.remove('on');
    go.onclick = () => {
      if (this.prf) this.prfStop();
      else this.prfStart();
      this.prfUi();
    };
    document.getElementById('perfRecDl').onclick = () => this.prfDownload();
    if (/[?&]perfrec\b/.test(location.search)) this.prfStart();
  },
  prfStart() {
    if (this.prf) return;
    const gl = this.renderer.getContext();
    let glr = '';
    try {
      const x = gl.getExtension('WEBGL_debug_renderer_info');
      glr = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch (e) {}
    const d = new Date(),
      pad = (v) => String(v).padStart(2, '0');
    const touch = matchMedia('(pointer: coarse)').matches;
    const R = (this.prf = {
      id:
        `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}` +
        `${pad(d.getSeconds())}-${touch ? 'touch' : 'desk'}`,
      t0: performance.now(),
      date: d.toISOString(),
      n: 0,
      gap: new Uint16Array(PRF_MAX_F), // 0.1 ms
      ms: new Uint16Array(PRF_MAX_F),
      ctx: [],
      hitch: [],
      mem: [],
      lt: [],
      ev: [], // 最近的事件 [格, 名稱, ms]
      sh: 0, // 這一格的著色器編譯（次、ms）
      shMs: 0,
      shN: 0,
      cur: null,
      prev: null,
      lastT: performance.now(),
      lastHeap: 0,
      memT: 0,
      ctxKey: '',
      dev: {
        ua: navigator.userAgent,
        w: innerWidth,
        h: innerHeight,
        dpr: devicePixelRatio,
        cores: navigator.hardwareConcurrency || 0,
        mem: navigator.deviceMemory || 0,
        gl: glr,
        touch,
        server: !!window.MECH_CORDON_SERVER,
      },
      ctrl: JSON.parse(JSON.stringify(this.ctrl || {})),
      undo: [],
    });
    delete R.ctrl.gaze;
    const W = (obj, name, tag, ev) => {
      const o = obj && obj[name];
      if (typeof o !== 'function' || o.__prf) return;
      const f = function (...a) {
        const t0 = performance.now();
        try {
          return o.apply(this, a);
        } finally {
          const ms = performance.now() - t0;
          const c = R.cur;
          if (c) c.sec[tag] = (c.sec[tag] || 0) + ms;
          if (ev || ms > 8) {
            R.ev.push([R.n, tag, +ms.toFixed(1)]);
            if (R.ev.length > 400) R.ev.splice(0, 200);
          }
        }
      };
      f.__prf = 1;
      obj[name] = f;
      R.undo.push(() => (obj[name] = o));
    };
    const P = Game.prototype;
    for (const n of SEC_G) W(P, n, n);
    for (const n of EV_G) W(P, n, '!' + n, true);
    for (const n of SEC_E) W(MechEntity.prototype, n, 'e.' + n);
    for (const n of SEC_S) W(SFX, n, 'sfx.' + n);
    if (this.fx) {
      const fxP = Object.getPrototypeOf(this.fx);
      W(fxP, 'update', 'fx.update');
      for (const n of ['explosion', 'killBurst', 'collapse']) W(fxP, n, '!fx.' + n, true);
    }
    if (this.stylePipe) {
      const sp = Object.getPrototypeOf(this.stylePipe);
      for (const n of ['renderSoft', 'renderNormals', 'heatPass', 'raysPass']) W(sp, n, 'pipe.' + n);
    }
    // 著色器的連結（包裝這個 context 自己的方法）
    const lk = gl.linkProgram,
      gpp = gl.getProgramParameter;
    gl.linkProgram = function (pg) {
      pg.__prf0 = performance.now();
      return lk.call(this, pg);
    };
    gl.getProgramParameter = function (pg, k) {
      const r = gpp.call(this, pg, k);
      if (pg.__prf0) {
        R.shN++;
        R.shMs += performance.now() - pg.__prf0;
        pg.__prf0 = 0;
      }
      return r;
    };
    R.undo.push(() => {
      gl.linkProgram = lk;
      gl.getProgramParameter = gpp;
    });
    try {
      const ob = new PerformanceObserver((l) => {
        for (const e of l.getEntries())
          if (R.lt.length < 5000) R.lt.push([Math.round(e.startTime - R.t0), Math.round(e.duration)]);
      });
      ob.observe({ type: 'longtask' });
      R.undo.push(() => ob.disconnect());
    } catch (e) {}
    // 主迴圈
    const loop = P.loop,
      g = this;
    P.loop = function () {
      const t0 = performance.now();
      const rec = { sec: {} };
      const gap = t0 - R.lastT;
      R.lastT = t0;
      R.cur = rec;
      R.shN = 0;
      R.shMs = 0;
      try {
        loop.call(this);
      } finally {
        R.cur = null;
        const ms = performance.now() - t0;
        g.prfFrame(R, rec, gap, ms);
      }
    };
    R.undo.push(() => (P.loop = loop));
    this.prfBadge(true);
    this.prfUp = setInterval(() => this.prfUpload(false), 60000);
  },
  prfFrame(R, rec, gap, ms) {
    if (R.n >= PRF_MAX_F) return this.prfStop();
    const i = R.n++;
    R.gap[i] = Math.min(65535, Math.round(gap * 10));
    R.ms[i] = Math.min(65535, Math.round(ms * 10));
    const now = performance.now(),
      t = Math.round(now - R.t0);
    // 情境
    const w = this.world,
      c = this.camp;
    const view = this.fp ? 'fps' : this.chase ? 'chase' : 'tps';
    const key = [
      this.state,
      w ? w.themeKey : '',
      w ? w.variantKey : '',
      c ? c.sid : '',
      c ? c.seg : '',
      view,
    ].join('|');
    if (key !== R.ctxKey) {
      R.ctxKey = key;
      R.ctx.push({ f: i, t, k: key });
    }
    const hp = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const gc = R.lastHeap && hp < R.lastHeap - 2e6 ? +((R.lastHeap - hp) / 1e6).toFixed(1) : 0;
    R.lastHeap = hp;
    rec.sh = R.shN;
    rec.shMs = +R.shMs.toFixed(1);
    rec.gc = gc;
    if (gap >= PRF_HITCH && R.hitch.length < PRF_MAX_H) {
      const r1 = (o) => {
        const s = {};
        for (const k in o.sec) if (o.sec[k] >= 0.5) s[k] = +o.sec[k].toFixed(1);
        return { ms: o.ms, sec: s, sh: o.sh, shMs: o.shMs, gc: o.gc };
      };
      let en = 0;
      for (const e of this.enemies || []) if (!e.dead) en++;
      R.hitch.push({
        f: i,
        t,
        gap: +gap.toFixed(1),
        prev: R.prev ? r1(R.prev) : null, // 卡頓的那一格多半是上一格（間隔量在這一格開始時）
        cur: r1(Object.assign(rec, { ms: +ms.toFixed(1) })),
        ev: R.ev.filter((e) => e[0] >= i - 120),
        en,
        k: key,
      });
    }
    rec.ms = +ms.toFixed(1);
    R.prev = rec;
    if (now - R.memT >= 1000) {
      R.memT = now;
      const I = this.renderer.info;
      R.mem.push([
        t,
        Math.round(hp / 1e5) / 10,
        I.memory.geometries,
        I.memory.textures,
        I.programs ? I.programs.length : 0,
        I.render.calls,
        Math.round(I.render.triangles / 1000),
      ]);
    }
    if ((i & 31) === 0) this.prfBadge();
  },
  // 畫面角落的紀錄標示：fps 與卡頓次數
  prfBadge(on) {
    let b = document.getElementById('perfBadge');
    const R = this.prf;
    if (!R) return b && b.remove();
    if (!b) {
      b = document.createElement('div');
      b.id = 'perfBadge';
      b.style.cssText =
        'position:fixed;left:6px;bottom:6px;z-index:9999;pointer-events:none;font:11px/1.2 monospace;' +
        'color:#fff;background:rgba(200,0,40,.75);padding:2px 6px;border-radius:4px';
      document.body.appendChild(b);
    }
    if (on) return;
    const n = Math.min(R.n, 60);
    let s = 0;
    for (let i = R.n - n; i < R.n; i++) s += R.gap[i];
    const fps = s ? Math.round((n * 10000) / s) : 0;
    b.textContent = `● REC ${fps} fps　卡頓 ${R.hitch.length}`;
  },
  prfData(R) {
    const enc = (a) => {
      const u = new Uint8Array(a.buffer, 0, R.n * 2);
      let s = '';
      for (let i = 0; i < u.length; i += 0x8000)
        s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      return btoa(s);
    };
    return {
      v: 1,
      id: R.id,
      date: R.date,
      secs: Math.round((performance.now() - R.t0) / 1000),
      dev: R.dev,
      ctrl: R.ctrl,
      hitchMs: PRF_HITCH,
      n: R.n,
      gap: enc(R.gap), // Uint16 小端，0.1 ms
      ms: enc(R.ms),
      ctx: R.ctx,
      hitch: R.hitch,
      mem: R.mem, // [ms, heap MB, 幾何, 貼圖, 程式, 繪製次數, 千三角形]
      lt: R.lt,
    };
  },
  prfUpload(final) {
    const R = this.prf || (final ? this.prfLast : null);
    if (!R || !window.MECH_CORDON_SERVER) return Promise.resolve(false);
    return fetch('/api/perf/' + R.id, { method: 'PUT', body: JSON.stringify(this.prfData(R)) })
      .then((r) => {
        if (r.ok) R.up = true;
        this.prfUi();
        return r.ok;
      })
      .catch(() => false);
  },
  prfStop() {
    const R = this.prf;
    if (!R) return;
    for (const u of R.undo.reverse()) u();
    R.undo = [];
    clearInterval(this.prfUp);
    this.prf = null;
    this.prfLast = R;
    this.prfBadge();
    this.prfUpload(true);
  },
  prfDownload() {
    const R = this.prf || this.prfLast;
    if (!R) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(this.prfData(R))], { type: 'application/json' }));
    a.download = 'mech-cordon-perf-' + R.id + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  },
});
