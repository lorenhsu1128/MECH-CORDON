// Game：眼動追蹤（docs/gaze-design.md）——筆電的網路攝影機＋MediaPipe Face Landmarker（lib/gaze-assets.js）。
// 兩個各自獨立的功能：看哪鎖哪（注視點附近的敵人停留一下就鎖定）、頭部延伸視角（追尾／第一人稱時轉頭＝鏡頭跟著轉）。
// 影像只在本機處理；攝影機只能在安全環境開啟（file://、localhost、https），區網的 http 網址改用伺服器的 https。
// 只改本機的輸入（鎖定的目標、鏡頭的 yaw／pitch），多人時客機照常把鎖定目標送給房主，不改協定。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { clamp } from '../core/math.js';
import {
  HEAD_V,
  OneEuro,
  TUNE_DEF,
  axisMap,
  gazeFeatures,
  gazeFit,
  gazePredict,
  smoothCut,
  tuneSanitize,
} from '../core/gaze.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const CAL_KEY = 'rubicon_gaze'; // 校準結果（裝置與坐姿相關，不放進設定 rubicon_ctrl）
// headMode：頭部延伸視角的方式 offset＝偏移（頭轉幾度鏡頭多看幾度，擺正回原位）／rate＝速度（頭偏著鏡頭就一直轉）；
// cam：攝影機（id＝裝置、res＝480／720、mirror＝預覽鏡像）；tune：調校（core/gaze.js 的 TUNE_DEF，game/gaze-tune.js 的調校視窗）
const DEF = { on: false, lock: true, head: false, dwell: 0.25, headMode: 'offset', dot: false };
const CAM_DEF = { id: '', res: '480', mirror: true };
const DET_DT = 30; // 偵測間隔（毫秒，約 30 Hz）
const LOST_T = 0.4; // 看不到臉或眨眼超過這麼久，注視點就失效
// 頭部延伸視角：偏移模式鏡頭追上頭的最快速度（弧度／秒；速度模式的轉速是 core/gaze.js 的 HEAD_V）
const OFF_V = 8;
const D2R = Math.PI / 180;
// 校準：9 點（每點 1.6 秒，前 0.6 秒移動與穩定、之後收集）＋驗證 5 點
const CAL_PTS = [
  [0.08, 0.1],
  [0.5, 0.1],
  [0.92, 0.1],
  [0.08, 0.5],
  [0.5, 0.5],
  [0.92, 0.5],
  [0.08, 0.9],
  [0.5, 0.9],
  [0.92, 0.9],
];
const VAL_PTS = [
  [0.3, 0.3],
  [0.7, 0.3],
  [0.5, 0.55],
  [0.3, 0.75],
  [0.7, 0.75],
];
const PT_T = 1.6,
  PT_SETTLE = 0.6,
  MIN_N = 6; // 一個點至少要收到幾筆（太少＝常常沒偵測到臉，重做）
// 驗證的誤差（畫面高度的比例）：這個以上算「差的點」
const BAD_K = 0.11;
const TEST = /[?&]test\b/.test(location.search);

const b64buf = (s) => {
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
};
function loadScript() {
  if (window.RUBICON_GAZE) return Promise.resolve(true);
  return new Promise((res) => {
    const s = document.createElement('script');
    s.src = 'lib/gaze-assets.js';
    s.onload = () => res(!!window.RUBICON_GAZE);
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
}
// MediaPipe（Emscripten 的 printErr）把一般的資訊（INFO:、glog 的 I／W 開頭的行）印到 console.error：濾掉這兩種，其他照常
let quiet = false;
function quietMediaPipe() {
  if (quiet) return;
  quiet = true;
  const err = console.error;
  const MP = /^(INFO: |[IW]\d{4} \d\d:\d\d:\d\d)/;
  console.error = function (...a) {
    if (typeof a[0] === 'string' && MP.test(a[0])) return;
    return err.apply(this, a);
  };
}
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : 0;
};

Object.assign(Game.prototype, {
  gazeCfg() {
    return Object.assign({}, DEF, this.ctrl.gaze || {});
  },
  gazeSet(k, v) {
    this.ctrl.gaze = Object.assign(this.gazeCfg(), { [k]: v });
    this.saveKeys();
  },
  // 調校（整理過的；ctrl.gaze.tune 換了才重新整理）。舊版的速度倍率 headK 搬進全域靈敏度
  gazeTune() {
    const raw = this.gazeCfg().tune;
    if (this.gzTuneSrc === raw && this.gzTuneVal) return this.gzTuneVal;
    let t = raw;
    if (!t) {
      t = JSON.parse(JSON.stringify(TUNE_DEF));
      const hk = this.gazeCfg().headK;
      if (typeof hk === 'number') t.g.sens = hk;
    }
    this.gzTuneSrc = raw;
    this.gzTuneVal = tuneSanitize(t);
    return this.gzTuneVal;
  },
  gazeTuneSet(t) {
    this.gazeSet('tune', tuneSanitize(t));
  },
  gazeCam() {
    return Object.assign({}, CAM_DEF, this.gazeCfg().cam || {});
  },
  // 調校視窗、校準畫面、快速修正開著時攝影機照開（總開關關著也一樣）
  gazeBusy() {
    return !!(this.gzCal || this.gzTune || this.gzDrift);
  },
  // 攝影機只在安全環境（https、localhost、file://）可以用
  gazeSecure() {
    return !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  },
  // 從區網的 http 網址開啟時，伺服器的 https 網址（window.RUBICON_HTTPS＝port，server.js 注入）
  gazeHttpsUrl() {
    const port = window.RUBICON_HTTPS;
    if (!port || location.protocol !== 'http:') return '';
    return `https://${location.hostname}${port === 443 ? '' : ':' + port}${location.pathname}${location.search}`;
  },
  gzState() {
    if (!this.gz) {
      let cal = null;
      try {
        cal = JSON.parse(localStorage.getItem(CAL_KEY) || 'null');
      } catch (e) {}
      this.gz = {
        st: 'off', // off／loading／ready／error
        msg: '',
        cal: cal && cal.M && cal.M.w ? cal : null,
        fx: new OneEuro(),
        fy: new OneEuro(),
        frame: 0,
        face: false,
        valid: false,
        lostT: 9,
        x: 0,
        y: 0,
        head: null,
        hs: { yaw: 0, pitch: 0 }, // 平滑後的頭部轉向（弧度）
        fYaw: new OneEuro(2, 0.02),
        fPitch: new OneEuro(2, 0.02),
        stat: { n: 0, t0: 0, fps: 0, raw: [] }, // 偵測的次數與頻率、最近的原始 yaw（抖動）
        lm: null, // 最近一次的特徵點（調校視窗的預覽）
        applied: null, // 偏移模式：已經加到鏡頭上的角度（弧度）
        paused: false, // 暫停頭部追蹤（鏡頭停在現在的位置）
        neutral: null,
        nAcc: [],
        cand: null,
        candT: 0,
        held: null,
      };
    }
    return this.gz;
  },
  // 開始（載入 MediaPipe、開攝影機）；回傳 Promise<boolean>
  gazeStart() {
    const g = this.gzState();
    if (g.st === 'ready') return Promise.resolve(true);
    if (g.p) return g.p;
    g.st = 'loading';
    g.msg = '';
    this.gazeUiStatus();
    g.p = (async () => {
      // 先讓出一次：不然整段同步跑完時 finally 的 g.p = null 會比外面的 g.p = 這個 Promise 先執行，標記就一直留著
      await null;
      try {
        if (window.__gazeSim) {
          // 冒煙測試：不開攝影機，特徵由測試提供（window.__gazeSim(秒) → { f, blink, head }）
          g.st = 'ready';
          return true;
        }
        if (!this.gazeSecure()) throw new Error('這個網址不能使用攝影機（需要 https）');
        await this.gazeLandmarker();
        let stream;
        try {
          const cam = this.gazeCam();
          const hi = cam.res === '720';
          const video = { width: { ideal: hi ? 1280 : 640 }, height: { ideal: hi ? 720 : 480 } };
          if (cam.id) video.deviceId = { exact: cam.id };
          else video.facingMode = 'user';
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
          } catch (e) {
            if (!cam.id || !e || e.name !== 'OverconstrainedError') throw e;
            // 選的攝影機不見了：改用預設的
            delete video.deviceId;
            video.facingMode = 'user';
            stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
          }
        } catch (e) {
          throw new Error(
            e && e.name === 'NotAllowedError'
              ? '攝影機的權限被拒絕（在網址列左邊的圖示改成允許）'
              : e && e.name === 'NotFoundError'
                ? '找不到攝影機'
                : e && e.name === 'NotReadableError'
                  ? '攝影機被其他程式佔用'
                  : '開啟攝影機失敗：' + ((e && e.message) || e),
          );
        }
        if (!this.gazeCfg().on && !this.gazeBusy()) {
          // 載入途中被關掉
          for (const t of stream.getTracks()) t.stop();
          g.st = 'off';
          return false;
        }
        let v = g.video;
        if (!v) {
          v = g.video = document.createElement('video');
          v.id = 'gazeVideo';
          v.muted = true;
          v.playsInline = true;
          v.setAttribute('playsinline', '');
          document.body.appendChild(v);
        }
        v.srcObject = stream;
        g.stream = stream;
        await v.play();
        g.lastVT = -1;
        g.st = 'ready';
        return true;
      } catch (e) {
        g.st = 'error';
        g.msg = (e && e.message) || String(e);
        console.warn('[gaze] ' + g.msg);
        return false;
      } finally {
        g.p = null;
        this.gazeUiStatus();
      }
    })();
    return g.p;
  },
  // 載入 MediaPipe（lib/gaze-assets.js）並建立 Face Landmarker（只做一次；顯示卡不行時改用 CPU）
  async gazeLandmarker() {
    const g = this.gzState();
    if (g.fl) return g.fl;
    if (!(await loadScript())) throw new Error('找不到 lib/gaze-assets.js');
    quietMediaPipe();
    const G = window.RUBICON_GAZE,
      L = window.RUBICON_GAZE_LIB;
    if (!g.files) {
      // 直接開檔時不能 fetch 本地檔案：wasm 的載入程式與 wasm 改成 blob 網址交給 MediaPipe
      g.files = {
        wasmLoaderPath: URL.createObjectURL(new Blob([G.loader], { type: 'text/javascript' })),
        wasmBinaryPath: URL.createObjectURL(new Blob([b64buf(G.wasm)], { type: 'application/wasm' })),
      };
      g.model = b64buf(G.model);
    }
    const opt = (delegate) => ({
      baseOptions: { modelAssetBuffer: g.model, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
    if (!g.fl) {
      try {
        g.fl = await L.FaceLandmarker.createFromOptions(g.files, opt('GPU'));
      } catch (e) {
        g.fl = await L.FaceLandmarker.createFromOptions(g.files, opt('CPU'));
      }
    }
    return g.fl;
  },
  gazeStop() {
    const g = this.gz;
    if (!g) return;
    if (g.stream) for (const t of g.stream.getTracks()) t.stop();
    g.stream = null;
    if (g.video) g.video.srcObject = null;
    g.st = 'off';
    g.face = g.valid = false;
    g.cand = g.held = null;
    this.gazeUiStatus();
  },
  // 每格（主迴圈）：偵測一次臉（約 30 Hz）→ 注視點、頭部轉向
  gazeTick() {
    const C = this.gazeCfg();
    const g = this.gz;
    if (!C.on && !this.gazeBusy()) return;
    if (!g || g.st === 'off') {
      // 打開了但還沒開始：進任務時才開攝影機（不在載入遊戲時就跳出權限詢問）
      if (C.on && this.state === 'play' && !(g && g.tried)) {
        this.gzState().tried = true;
        this.gazeStart();
      }
      return;
    }
    if (g.st !== 'ready') return;
    const now = performance.now();
    if (g.lastT && now - g.lastT < DET_DT) return;
    let r = null;
    if (window.__gazeSim) r = window.__gazeSim(now / 1000, this);
    else {
      const v = g.video;
      if (v && v.paused && v.srcObject && now - (g.playT || 0) > 1000) {
        g.playT = now;
        v.play().catch(() => {});
      }
      if (!v || v.readyState < 2 || v.currentTime === g.lastVT) return;
      g.lastVT = v.currentTime;
      try {
        const res = g.fl.detectForVideo(v, now);
        g.lm = res.faceLandmarks[0] || null;
        r = res.faceLandmarks.length
          ? gazeFeatures(
              res.faceLandmarks[0],
              res.faceBlendshapes[0] && res.faceBlendshapes[0].categories,
              res.facialTransformationMatrixes[0] && res.facialTransformationMatrixes[0].data,
            )
          : null;
      } catch (e) {
        g.st = 'error';
        g.msg = '偵測失敗：' + ((e && e.message) || e);
        return;
      }
    }
    const dt = g.lastT ? (now - g.lastT) / 1000 : DET_DT / 1000;
    g.lastT = now;
    g.frame++;
    g.r = r;
    g.face = !!r;
    const T = this.gazeTune();
    // 偵測的頻率（每秒更新）與抖動（最近 30 次的原始 yaw）
    const S = g.stat;
    S.n++;
    if (now - S.t0 >= 1000) {
      S.fps = S.t0 ? (S.n * 1000) / (now - S.t0) : 0;
      S.n = 0;
      S.t0 = now;
    }
    if (r) {
      S.raw.push(r.head.yaw / D2R);
      if (S.raw.length > 30) S.raw.shift();
    }
    if (!r || r.blink > T.eye.blink) {
      g.lostT += dt;
      if (g.lostT > LOST_T) g.valid = false;
    } else {
      g.lostT = 0;
      g.head = r.head;
      // 頭部：每個軸各自的 One-Euro（平滑度＝全域 × 軸）
      g.fYaw.minCut = smoothCut(T.g.smooth * T.yaw.smooth);
      g.fPitch.minCut = smoothCut(T.g.smooth * T.pitch.smooth);
      g.hs.yaw = g.fYaw.filter(r.head.yaw / D2R, dt) * D2R;
      g.hs.pitch = g.fPitch.filter(r.head.pitch / D2R, dt) * D2R;
      this.gazeNeutralTick(dt);
      const P = g.cal && gazePredict(g.cal.M, r.f);
      if (P) {
        const b = g.cal.bias || [0, 0]; // 快速修正偏移（gazeDriftOpen）
        g.fx.minCut = g.fy.minCut = 1.2 / T.eye.smooth;
        g.x = g.fx.filter(clamp(P.x + b[0], -0.05, 1.05) * innerWidth, dt);
        g.y = g.fy.filter(clamp(P.y + b[1], -0.05, 1.05) * innerHeight, dt);
        g.valid = true;
      } else g.valid = false;
    }
    if (this.state === 'settings' && (g.frame & 15) === 0) this.gazeUiStatus();
  },
  // 頭部的中心：開始後前 15 次的平均；之後頭擺正時（死區內）慢慢跟上坐姿的改變
  gazeNeutralTick(dt) {
    const g = this.gz;
    if (!g.neutral) {
      g.nAcc.push({ yaw: g.hs.yaw, pitch: g.hs.pitch });
      if (g.nAcc.length >= 15) {
        g.neutral = {
          yaw: median(g.nAcc.map((h) => h.yaw)),
          pitch: median(g.nAcc.map((h) => h.pitch)),
        };
        g.nAcc = [];
      }
      return;
    }
    // 頭擺正（死區內，至少 3°）時中心慢慢跟上坐姿；調校的「自動跟上坐姿」關掉、暫停時不跟
    const T = this.gazeTune();
    if (!T.g.follow || g.paused) return;
    const k = Math.min(1, dt / 8);
    const dz = (a) => Math.max(3, a.dead * T.g.dead * 2) * D2R * 0.8;
    if (Math.abs(g.hs.yaw - g.neutral.yaw) < dz(T.yaw)) g.neutral.yaw += (g.hs.yaw - g.neutral.yaw) * k;
    if (Math.abs(g.hs.pitch - g.neutral.pitch) < dz(T.pitch))
      g.neutral.pitch += (g.hs.pitch - g.neutral.pitch) * k;
  },
  // 置中：現在的頭部姿勢當成中心（快速鍵「眼動：頭部置中」、調校視窗）
  gazeCenter() {
    const g = this.gz;
    if (!g || !g.face) return false;
    g.neutral = { yaw: g.hs.yaw, pitch: g.hs.pitch };
    if (this.state === 'play') this.flashMsg('頭部追蹤：置中', 0x5cc8ff, 0.8);
    return true;
  },
  // 暫停頭部追蹤：鏡頭停在現在的位置（偏移模式保留已經加上的角度），再按一次繼續
  gazePauseToggle() {
    const g = this.gzState();
    g.paused = !g.paused;
    if (this.state === 'play') this.flashMsg(g.paused ? '頭部追蹤：暫停' : '頭部追蹤：繼續', 0x5cc8ff, 1);
    return g.paused;
  },
  // ---------- 看哪鎖哪（player.js 的 autoLock 每格呼叫；單機、房主與客機共用） ----------
  gazeLockTick(p) {
    const g = this.gz;
    if (!g) return;
    const C = this.gazeCfg();
    if (!C.on || !C.lock || !g.valid || this.spectator || !this.camera || this.lab || this.cine) {
      g.cand = null;
      return;
    }
    const dt = this.lastDt || 1 / 60;
    const W = innerWidth,
      H = innerHeight;
    const R = Math.max(60, H * 0.1); // 網路攝影機的誤差約 2～4°（100～150 px）
    const reach = this.lockReach(p);
    let best = null,
      bd = 1e9;
    for (const e of this.lockPool(p)) {
      if (e.dead || e.noLock || e.isShot || e.pos.distanceTo(p.pos) > reach) continue;
      if (this.smokeHides && this.smokeHides(p, e)) continue;
      const c = e.center();
      const s = this.proj(c);
      if (!s.in || s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) continue;
      // 目標在畫面上的大小（中心到頭頂的距離）
      const h = (e.model && e.model.height) || 4;
      const t = this.proj(c.clone().setY(c.y + h * 0.5));
      const rs = clamp(Math.abs(t.y - s.y), 8, H * 0.25);
      let d = Math.hypot(s.x - g.x, s.y - g.y) - rs;
      if (e === p.lock) d -= R * 0.35; // 遲滯：目前的目標優先，不在兩台之間來回跳
      if (d < R && d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best !== g.cand) {
      g.cand = best;
      g.candT = 0;
    } else g.candT += dt;
    if (best && best !== p.lock && g.candT >= C.dwell) {
      p.lock = best;
      p.lockT = 0;
      SFX.ui();
    }
    if (best && best === p.lock) g.held = best;
    if (g.held && (g.held.dead || g.held !== p.lock)) g.held = null;
  },
  // 追尾視角：看著鎖定的目標時，目標離開鎖定框也不換（chase.js 的 chaseAutoLock）
  gazeHolds(p) {
    const g = this.gz;
    return !!(
      g &&
      g.held &&
      g.held === p.lock &&
      this.gazeCfg().on &&
      this.gazeCfg().lock &&
      this.onScreen(p.lock)
    );
  },
  // ---------- 頭部延伸視角 ----------
  // 頭部的輸入：null＝沒有作用（偏移模式時鏡頭回到原位）、false＝停住（暫停、短暫看不到臉、目標輔助正在帶鏡頭）、
  // { rate, x, y }＝速度模式的轉速（弧度／秒）、{ off, yaw, pitch }＝偏移模式要多看的角度（弧度）
  gazeHeadInput(p) {
    const g = this.gz;
    const C = this.gazeCfg();
    if (!g || g.st !== 'ready' || !C.on || !C.head || this.spectator || this.lab || this.cine) return null;
    if (g.paused) return false;
    if (!g.face || !g.neutral || g.lostT > LOST_T) return g.neutral && g.lostT < 1.5 ? false : null;
    if (p && this.assistOn() && p.lock && !p.lock.dead) return false;
    const T = this.gazeTune();
    const mode = C.headMode === 'rate' ? 'rate' : 'offset';
    const ay = T.yaw.on ? axisMap((g.hs.yaw - g.neutral.yaw) / D2R, T.yaw, T.g, mode) : { out: 0 };
    const ap = T.pitch.on ? axisMap((g.hs.pitch - g.neutral.pitch) / D2R, T.pitch, T.g, mode) : { out: 0 };
    const inv = this.ctrl.invY ? -1 : 1;
    if (mode === 'rate') return { rate: true, x: ay.out * HEAD_V.yaw, y: ap.out * HEAD_V.pitch * inv };
    return { off: true, yaw: ay.out * D2R, pitch: ap.out * D2R * inv };
  },
  // chase.js 的 camAimInput：改鏡頭的 fpYaw／fpPitch（lo～hi＝pitch 的範圍）。偏移模式記下已經加上的角度，
  // 每格只加差額（最快 OFF_V），所以頭擺正時鏡頭回到原位，滑鼠與右搖桿照常疊加
  gazeHeadApply(p, dt, lo, hi) {
    const r = this.gazeHeadInput(p);
    const g = this.gz;
    if (!g) return;
    if (r && r.rate) {
      this.fpYaw += r.x * dt;
      this.fpPitch = clamp(this.fpPitch + r.y * dt, lo, hi);
      g.applied = null;
      return;
    }
    if (r === false) return;
    const A = g.applied || (g.applied = { yaw: 0, pitch: 0 });
    const ty = r ? r.yaw : 0,
      tp = r ? r.pitch : 0;
    const mx = OFF_V * dt;
    const dy = clamp(ty - A.yaw, -mx, mx),
      dp = clamp(tp - A.pitch, -mx, mx);
    if (Math.abs(dy) > 1e-7) {
      this.fpYaw += dy;
      A.yaw += dy;
    }
    if (Math.abs(dp) > 1e-7) {
      const p0 = this.fpPitch;
      this.fpPitch = clamp(p0 + dp, lo, hi);
      A.pitch += this.fpPitch - p0;
    }
  },
  // 視角重設（出擊、換視角）：已經加上的角度歸零，下一格從頭加
  gazeHeadReset() {
    if (this.gz) this.gz.applied = null;
  },
  // ---------- HUD（hud.js 的 drawHud） ----------
  gazeHud(c, W, H, p) {
    const g = this.gz;
    const C = this.gazeCfg();
    if (!C.on || !g) return;
    c.save();
    // 停留中：候選目標外面一圈依停留時間畫滿
    if (C.lock && g.cand && g.cand !== p.lock && !g.cand.dead) {
      const s = this.proj(g.cand.center());
      if (s.in) {
        const k = clamp(g.candT / Math.max(0.05, C.dwell), 0, 1);
        c.strokeStyle = 'rgba(255,176,32,.9)';
        c.lineWidth = 2.5;
        c.beginPath();
        c.arc(s.x, s.y, 30, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2);
        c.stroke();
      }
    }
    if (C.dot && g.valid) {
      c.fillStyle = 'rgba(92,200,255,.35)';
      c.strokeStyle = 'rgba(92,200,255,.8)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(g.x, g.y, 9, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    // 狀態提示（右上角、小字）
    let note = '';
    if (g.st === 'loading') note = '眼動追蹤：載入中…';
    else if (g.st === 'error') note = '眼動追蹤：' + g.msg;
    else if (g.st === 'ready' && !g.face && g.lostT > 1.5) note = '眼動追蹤：找不到臉';
    else if (g.st === 'ready' && C.lock && !g.cal) note = '眼動追蹤：尚未校準（設定 → 眼動追蹤）';
    if (note) {
      c.font = '12px "Noto Sans TC", sans-serif';
      c.textAlign = 'right';
      c.fillStyle = 'rgba(255,200,120,.85)';
      c.fillText(note, W - 14, H * 0.2);
    }
    c.restore();
  },
  // ---------- 設定畫面（settings.js 的 renderSettings） ----------
  renderGazeSettings() {
    const box = $('gazeBox');
    if (!box) return;
    const C = this.gazeCfg();
    const ok = this.gazeSecure() || !!window.__gazeSim;
    const https = this.gazeHttpsUrl();
    const sel = (k, list) =>
      `<select data-gz="${k}" data-def="${DEF[k]}" ${C.on ? '' : 'disabled'}>${list
        .map(([v, l]) => `<option value="${v}" ${String(C[k]) === String(v) ? 'selected' : ''}>${l}</option>`)
        .join('')}</select>`;
    box.innerHTML =
      (ok
        ? ''
        : `<p style="font-size:12px;color:#ffb080">這個網址不能使用攝影機（瀏覽器只在 https、localhost 或直接開檔時允許）。${
            https
              ? `請改用伺服器的安全連線：<a href="${escHtml(https)}" style="color:#5cc8ff">${escHtml(https)}</a>（第一次會出現憑證警告，按「進階 → 繼續前往」）`
              : ''
          }</p>`) +
      `<div class="krow"><span>啟用</span><label><input type="checkbox" data-gz="on" data-def="${DEF.on ? 1 : 0}" ${C.on ? 'checked' : ''} ${ok ? '' : 'disabled'} /> 用攝影機追蹤眼睛與頭部（影像只在這台電腦處理，不會上傳）</label></div>` +
      `<div class="krow"><span>狀態</span><span id="gazeStatus" class="dim" style="font-size:12px"></span></div>` +
      `<div class="krow"><span>看哪鎖哪</span><span style="display:flex;gap:8px;align-items:center"><label><input type="checkbox" data-gz="lock" data-def="${DEF.lock ? 1 : 0}" ${C.lock ? 'checked' : ''} ${C.on ? '' : 'disabled'} /> 看著敵人一下就鎖定</label>${sel(
        'dwell',
        [
          [0.15, '快（0.15 秒）'],
          [0.25, '標準（0.25 秒）'],
          [0.4, '慢（0.4 秒）'],
        ],
      )}</span></div>` +
      `<div class="krow"><span>頭部延伸視角</span><span style="display:flex;gap:8px;align-items:center"><label title="追尾視角與第一人稱：偏移＝頭轉幾度鏡頭就多看幾度，頭擺正回到原位；速度＝頭偏著鏡頭就一直往那邊轉，頭擺正就停。靈敏度、曲線、死區在「調校…」"><input type="checkbox" data-gz="head" data-def="${DEF.head ? 1 : 0}" ${C.head ? 'checked' : ''} ${C.on ? '' : 'disabled'} /> 轉頭＝鏡頭跟著轉（追尾／第一人稱）</label>${sel(
        'headMode',
        [
          ['offset', '偏移（預設）'],
          ['rate', '速度'],
        ],
      )}</span></div>` +
      `<div class="krow"><span>顯示注視點</span><label><input type="checkbox" data-gz="dot" data-def="${DEF.dot ? 1 : 0}" ${C.dot ? 'checked' : ''} ${C.on ? '' : 'disabled'} /> 任務中畫出眼睛看的位置（調整用）</label></div>` +
      `<div class="krow" data-desc="校準：看著畫面上的點讓眼睛的位置對上畫面（看哪鎖哪要先校準）；調校：靈敏度、平滑度、死區、對應曲線、攝影機與設定組合，即時看到頭部的輸入與鏡頭的輸出"><span>校準與調校</span><span style="display:flex;gap:8px"><button id="gazeCalBtn" ${C.on && ok ? '' : 'disabled'}>開始校準…</button><button id="gazeTuneBtn" ${ok ? '' : 'disabled'}>調校…</button></span></div>` +
      `<p class="dim" style="font-size:11px">看哪鎖哪要先校準（看著畫面上的 9 個點，約 20 秒）；換位置坐、光線變了或覺得不準時再校準一次。頭部延伸視角不用校準。坐在離螢幕 50～70 cm、臉的光線充足時最準。</p>`;
    box.onchange = (e) => {
      const k = e.target.dataset && e.target.dataset.gz;
      if (!k) return;
      const v =
        e.target.type === 'checkbox' ? e.target.checked : k === 'headMode' ? e.target.value : +e.target.value;
      this.gazeSet(k, v);
      if (k === 'on') {
        if (v) {
          this.gzState().tried = true;
          this.gazeStart();
        } else this.gazeStop();
      }
      this.renderGazeSettings();
    };
    $('gazeCalBtn').onclick = () => this.gazeCalOpen();
    $('gazeTuneBtn').onclick = () => this.gazeTuneOpen();
    this.gazeUiStatus();
  },
  gazeUiStatus() {
    const el = $('gazeStatus');
    if (!el) return;
    const g = this.gz;
    const C = this.gazeCfg();
    const st = !C.on
      ? '未啟用'
      : !g || g.st === 'off'
        ? '待命（進任務時開啟攝影機）'
        : g.st === 'loading'
          ? '載入中…'
          : g.st === 'error'
            ? '錯誤：' + g.msg
            : g.face
              ? '運作中・偵測到臉 ✓'
              : '運作中・找不到臉（請面對攝影機）';
    const cal = g && g.cal;
    el.textContent =
      st +
      '　｜　' +
      (cal
        ? `已校準（平均誤差約 ${Math.round(cal.err)} px，${new Date(cal.t).toLocaleDateString()}）`
        : '尚未校準');
  },
  // ---------- 校準畫面 ----------
  // 校準前的檢查（參考 LookPilot 的入鏡檢查）：臉、距離、位置、正面、亮度；回傳 [{ k, ok, txt }]
  gazeChecks() {
    const g = this.gz;
    const r = g && g.r;
    const out = [];
    out.push({ k: 'face', ok: !!r, txt: r ? '偵測到臉' : '找不到臉：請面對攝影機' });
    if (!r) return out;
    const h = r.head;
    const d = Math.abs(h.z || 50);
    out.push({
      k: 'dist',
      ok: d >= 35 && d <= 85,
      txt:
        `距離約 ${Math.round(d)} cm` +
        (d < 35 ? '：太近，往後坐一點' : d > 85 ? '：太遠，坐近一點（50～70 cm 最準）' : ''),
    });
    const ox = h.x / d,
      oy = h.y / d;
    const cen = Math.abs(ox) < 0.3 && Math.abs(oy) < 0.3;
    out.push({ k: 'pos', ok: cen, txt: cen ? '臉在畫面中間' : '臉偏到畫面邊緣：把攝影機或身體對正' });
    const fr = Math.abs(h.yaw) < 15 * D2R && Math.abs(h.pitch) < 15 * D2R;
    out.push({ k: 'front', ok: fr, txt: fr ? '臉朝向螢幕' : '頭轉得太偏：臉朝向螢幕中央' });
    const L = this.gazeLuma();
    if (L !== null) {
      const ok = L >= 55 && L <= 220;
      out.push({
        k: 'light',
        ok,
        txt:
          `亮度 ${Math.round(L)}` +
          (L < 55 ? '：太暗，臉前面加一點光' : L > 220 ? '：太亮（背光或直射）' : ''),
      });
    }
    return out;
  },
  // 攝影機畫面中央的平均亮度（0～255，每 0.5 秒量一次）；沒有影像時 null
  gazeLuma() {
    const g = this.gz;
    const v = g && g.video;
    if (!v || v.readyState < 2 || !v.videoWidth) return null;
    const now = performance.now();
    if (g.lumaT && now - g.lumaT < 500) return g.luma;
    g.lumaT = now;
    const c = g.lumaC || (g.lumaC = document.createElement('canvas'));
    c.width = 32;
    c.height = 24;
    const x = c.getContext('2d', { willReadFrequently: true });
    try {
      x.drawImage(
        v,
        v.videoWidth * 0.25,
        v.videoHeight * 0.15,
        v.videoWidth * 0.5,
        v.videoHeight * 0.7,
        0,
        0,
        32,
        24,
      );
      const d = x.getImageData(0, 0, 32, 24).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      g.luma = s / (d.length / 4);
    } catch (e) {
      g.luma = null;
    }
    return g.luma;
  },
  // 校準與調校的疊加視窗放在 #ui 裡（手把的選單操作只找 #ui 裡的元素）
  gazeLayer() {
    return document.getElementById('ui') || document.body;
  },
  gazeCalOpen() {
    if (this.gzCal) return;
    const g = this.gzState();
    const el = document.createElement('div');
    el.id = 'gazeCal';
    el.innerHTML =
      `<canvas id="gcPlot"></canvas>` +
      `<div class="gcPanel"><div class="gcVid"></div><div><h3>眼動追蹤的校準</h3><ul id="gcChecks"></ul><p id="gcMsg"></p>` +
      `<div class="row"><button class="primary" id="gcGo">開始</button><button id="gcRedo" hidden>重做差的點</button><button id="gcCancel">取消</button></div></div></div>` +
      `<div id="gcDot"><i></i></div>`;
    this.gazeLayer().appendChild(el);
    const cal = (this.gzCal = {
      el,
      ph: 'prep',
      i: 0,
      t: 0,
      X: [],
      Y: [],
      V: [],
      last: performance.now(),
      hacc: [],
    });
    const key = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        this.gazeCalClose();
      } else if ((e.key === ' ' || e.key === 'Enter') && cal.ph === 'prep' && !$('gcGo').disabled) {
        e.preventDefault();
        this.gazeCalBegin();
      }
    };
    cal.key = key;
    addEventListener('keydown', key, true);
    $('gcCancel').onclick = () => (cal.ph === 'done' ? this.gazeCalBegin() : this.gazeCalClose());
    $('gcGo').onclick = () => (cal.ph === 'done' ? this.gazeCalClose(true) : this.gazeCalBegin());
    $('gcRedo').onclick = () => this.gazeCalRedo();
    this.gazeStart().then(() => {
      if (g.video && this.gzCal === cal) el.querySelector('.gcVid').appendChild(g.video);
    });
    const step = () => {
      if (this.gzCal !== cal) return;
      requestAnimationFrame(step);
      const now = performance.now();
      const dt = Math.min(0.1, (now - cal.last) / 1000);
      cal.last = now;
      this.gazeCalStep(cal, dt);
    };
    requestAnimationFrame(step);
    SFX.ui();
  },
  gazeCalClose(keep) {
    const cal = this.gzCal;
    if (!cal) return;
    this.gzCal = null;
    removeEventListener('keydown', cal.key, true);
    const g = this.gz;
    this.gazeVideoHome();
    cal.el.remove();
    if (!keep && cal.prevCal !== undefined && g) g.cal = cal.prevCal; // 取消：還原原本的校準
    if (!this.gazeCfg().on && !this.gazeBusy()) this.gazeStop();
    this.renderGazeSettings();
    if (this.gzTune) this.gazeTuneRender();
  },
  // 攝影機的影像放回隱藏的位置（調校視窗開著時放回它的預覽）
  gazeVideoHome() {
    const g = this.gz;
    if (!g || !g.video) return;
    const box = this.gzTune && document.querySelector('#gazeTune .gtVid');
    (box || document.body).appendChild(g.video);
  },
  gazeCalBegin() {
    const cal = this.gzCal;
    const g = this.gz;
    if (!cal || !g || g.st !== 'ready') return;
    if (cal.prevCal === undefined) cal.prevCal = g.cal;
    cal.ph = 'run';
    cal.i = 0;
    cal.t = 0;
    cal.n = 0;
    cal.retry = 0;
    cal.X = [];
    cal.Y = [];
    cal.V = [];
    cal.hacc = [];
    cal.seen = g.frame;
    cal.el.classList.add('run');
    cal.el.classList.remove('done');
    $('gcGo').textContent = '開始';
    $('gcCancel').textContent = '取消';
    $('gcRedo').hidden = true;
  },
  // 目前的點：run＝校準 9 點、val＝驗證 5 點、redo＝重做差的驗證點（cal.redo 是驗證點的索引）
  gazeCalPts(cal) {
    return cal.ph === 'run' ? CAL_PTS : cal.ph === 'redo' ? cal.redo.map((i) => VAL_PTS[i]) : VAL_PTS;
  },
  gazeCalTarget(cal) {
    return this.gazeCalPts(cal)[cal.i];
  },
  gazeCalStep(cal, dt) {
    const g = this.gz;
    const msg = $('gcMsg'),
      dot = $('gcDot'),
      go = $('gcGo');
    if (!msg) return;
    if (cal.ph === 'prep') {
      const C = g && g.st === 'ready' ? this.gazeChecks() : [];
      $('gcChecks').innerHTML = C.map(
        (c) => `<li class="${c.ok ? 'ok' : 'ng'}">${c.ok ? '✓' : '！'} ${escHtml(c.txt)}</li>`,
      ).join('');
      const warn = C.length > 1 && C.some((c) => !c.ok);
      msg.textContent =
        !g || g.st === 'loading'
          ? '載入中…（第一次約需數秒）'
          : g.st === 'error'
            ? g.msg
            : g.face
              ? (warn ? '可以開始，但照上面的提示調整會比較準。' : '') +
                '坐好、頭保持自然，按「開始」後用眼睛盯著畫面上的點（點會自己移動，約 25 秒）。'
              : '找不到臉：請面對攝影機，讓臉的光線充足。';
      go.disabled = !(g && g.st === 'ready' && g.face);
      dot.style.display = 'none';
      return;
    }
    if (cal.ph === 'done') {
      dot.style.display = g.valid ? 'block' : 'none';
      dot.classList.add('live');
      dot.style.left = g.x + 'px';
      dot.style.top = g.y + 'px';
      return;
    }
    // 收集：每個新的偵測結果（不是眨眼）算一筆
    const pts = this.gazeCalPts(cal);
    const tp = pts[cal.i];
    cal.t += dt;
    const W = innerWidth,
      H = innerHeight;
    const prev = cal.i > 0 ? pts[cal.i - 1] : tp;
    const m = clamp(cal.t / 0.35, 0, 1);
    const k = m * m * (3 - 2 * m);
    dot.style.display = 'block';
    dot.classList.remove('live');
    dot.style.left = (prev[0] + (tp[0] - prev[0]) * k) * W + 'px';
    dot.style.top = (prev[1] + (tp[1] - prev[1]) * k) * H + 'px';
    dot.style.setProperty('--k', clamp((cal.t - PT_SETTLE) / (PT_T - PT_SETTLE), 0, 1));
    const T = this.gazeTune();
    if (cal.t >= PT_SETTLE && g.frame !== cal.seen && g.r && g.r.blink < T.eye.blink) {
      cal.n++;
      if (cal.ph === 'run') {
        cal.X.push(g.r.f);
        cal.Y.push(tp);
        cal.hacc.push(g.r.head);
      } else {
        const vi = cal.ph === 'redo' ? cal.redo[cal.i] : cal.i;
        (cal.V[vi] = cal.V[vi] || []).push(g.r.f);
      }
    }
    cal.seen = g.frame;
    const total = cal.ph === 'redo' ? pts.length : CAL_PTS.length + VAL_PTS.length;
    const done = (cal.ph === 'val' ? CAL_PTS.length : 0) + cal.i;
    msg.textContent =
      (cal.retry ? '剛才這一點常常沒偵測到臉，再做一次：' : '') +
      (cal.ph === 'redo' ? '重做差的點：' : '') +
      `盯著點看…（${done + 1}／${total}）`;
    if (cal.t < PT_T) return;
    // 這一點的資料太少（臉常常沒偵測到）：丟掉重做，最多 2 次
    if (cal.n < MIN_N && cal.retry < 2) {
      if (cal.ph === 'run') {
        cal.X.splice(cal.X.length - cal.n);
        cal.Y.splice(cal.Y.length - cal.n);
        cal.hacc.splice(cal.hacc.length - cal.n);
      } else {
        const vi = cal.ph === 'redo' ? cal.redo[cal.i] : cal.i;
        if (cal.V[vi]) cal.V[vi].splice(cal.V[vi].length - cal.n);
      }
      cal.retry++;
      cal.t = 0;
      cal.n = 0;
      return;
    }
    cal.t = 0;
    cal.n = 0;
    cal.retry = 0;
    cal.i++;
    if (cal.ph === 'run' && cal.i >= CAL_PTS.length) {
      const M = gazeFit(cal.X, cal.Y);
      if (!M) return this.gazeCalFail('資料不夠（臉常常沒偵測到），請調整光線或位置後重新校準。');
      cal.M = M;
      cal.ph = 'val';
      cal.i = 0;
    } else if (cal.ph === 'val' && cal.i >= VAL_PTS.length) this.gazeCalFinish(cal);
    else if (cal.ph === 'redo' && cal.i >= cal.redo.length) this.gazeCalRedoDone(cal);
  },
  gazeCalFail(text) {
    const cal = this.gzCal;
    cal.ph = 'prep';
    cal.el.classList.remove('run');
    if (cal.prevCal !== undefined) this.gz.cal = cal.prevCal;
    $('gcMsg').textContent = text;
  },
  // 驗證點的結果：每個點的預測取中位數，量到目標的距離（px）；M＝用哪個模型
  gazeCalEval(cal, M, idx) {
    const W = innerWidth,
      H = innerHeight;
    for (const i of idx) {
      const tp = VAL_PTS[i];
      const P = (cal.V[i] || []).map((f) => gazePredict(M, f)).filter(Boolean);
      if (P.length < 3) {
        cal.res[i] = { tp, p: null, err: null };
        continue;
      }
      const x = median(P.map((q) => q.x)),
        y = median(P.map((q) => q.y));
      cal.res[i] = { tp, p: [x, y], err: Math.hypot((x - tp[0]) * W, (y - tp[1]) * H) };
    }
  },
  gazeCalFinish(cal) {
    cal.res = [];
    this.gazeCalEval(
      cal,
      cal.M,
      VAL_PTS.map((_, i) => i),
    );
    const ok = cal.res.filter((r) => r.err !== null);
    if (ok.length < 3) return this.gazeCalFail('驗證時常常沒偵測到臉，請調整光線或位置後重新校準。');
    const g = this.gz;
    if (cal.hacc.length)
      g.neutral = { yaw: median(cal.hacc.map((h) => h.yaw)), pitch: median(cal.hacc.map((h) => h.pitch)) };
    this.gazeCalSave(cal);
  },
  // 訓練資料＝9 點＋除了 skip 以外每個驗證點最新的資料（重做時舊的資料就不用了）
  gazeCalData(cal, skip = []) {
    const X = [...cal.X],
      Y = [...cal.Y];
    VAL_PTS.forEach((tp, i) => {
      if (skip.includes(i)) return;
      for (const f of cal.V[i] || []) {
        X.push(f);
        Y.push(tp);
      }
    });
    return [X, Y];
  },
  // 存檔並顯示結果（每個驗證點的誤差圖）；驗證的資料也加進去重新擬合（誤差照實回報擬合前的數字）
  gazeCalSave(cal) {
    const g = this.gz;
    const H = innerHeight;
    const M = gazeFit(...this.gazeCalData(cal)) || cal.M;
    cal.Mf = M;
    const ok = cal.res.filter((r) => r.err !== null);
    const err = ok.reduce((a, r) => a + r.err, 0) / Math.max(1, ok.length);
    g.cal = {
      v: 2,
      M,
      err,
      t: Date.now(),
      pts: cal.res.map((r) => [r.tp[0], r.tp[1], r.p ? r.p[0] : null, r.p ? r.p[1] : null, r.err]),
    };
    try {
      localStorage.setItem(CAL_KEY, JSON.stringify(g.cal));
    } catch (e) {}
    g.fx.reset();
    g.fy.reset();
    cal.prevCal = undefined;
    cal.ph = 'done';
    cal.el.classList.remove('run');
    cal.el.classList.add('done');
    const bad = this.gazeCalBad(cal);
    const pct = (err / H) * 100;
    const grade =
      pct < 6 ? '很好' : pct < 11 ? '可以用（看哪鎖哪足夠）' : '偏大：建議調整光線、坐近一點後重新校準';
    $('gcChecks').innerHTML = '';
    $('gcMsg').textContent =
      `完成！平均誤差約 ${Math.round(err)} px（畫面高度的 ${pct.toFixed(1)}%）——${grade}。` +
      (bad.length ? `紅色的 ${bad.length} 個點比較不準，可以只重做它們。` : '') +
      '藍點是現在眼睛看的位置。';
    $('gcGo').textContent = '完成';
    $('gcCancel').textContent = '重新校準';
    $('gcRedo').hidden = !bad.length;
    $('gcRedo').textContent = `重做差的點（${bad.length}）`;
    this.gazeCalPlot(cal);
    SFX.ui();
  },
  // 差的點：誤差超過畫面高度的 BAD_K 或沒有資料
  gazeCalBad(cal) {
    return cal.res
      .map((r, i) => (r.err === null || r.err > innerHeight * BAD_K ? i : -1))
      .filter((i) => i >= 0);
  },
  // 只重做差的驗證點：重新收集，先用現在的模型量誤差（公平），再把資料加進去重新擬合
  gazeCalRedo() {
    const cal = this.gzCal;
    if (!cal || cal.ph !== 'done') return;
    const bad = this.gazeCalBad(cal);
    if (!bad.length) return;
    for (const i of bad) cal.V[i] = [];
    cal.redo = bad;
    cal.ph = 'redo';
    cal.i = 0;
    cal.t = 0;
    cal.n = 0;
    cal.retry = 0;
    cal.seen = this.gz.frame;
    cal.el.classList.add('run');
    cal.el.classList.remove('done');
    $('gcRedo').hidden = true;
    const c = $('gcPlot');
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
  },
  gazeCalRedoDone(cal) {
    // 重做的點用「不含這幾點」的模型量誤差，之後全部重新擬合
    const Mx = gazeFit(...this.gazeCalData(cal, cal.redo)) || cal.Mf;
    this.gazeCalEval(cal, Mx, cal.redo);
    this.gazeCalSave(cal);
  },
  // 結果圖：每個驗證點的目標（圈）、預測（點）與誤差線；綠＝很好、黃＝可以用、紅＝差
  gazeCalPlot(cal) {
    const c = $('gcPlot');
    if (!c) return;
    const W = (c.width = innerWidth),
      H = (c.height = innerHeight);
    const x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    for (const r of cal.res) {
      const tx = r.tp[0] * W,
        ty = r.tp[1] * H;
      const col = r.err === null || r.err > H * BAD_K ? '#ff5a5a' : r.err > H * 0.06 ? '#ffb020' : '#7ee081';
      x.strokeStyle = col;
      x.fillStyle = col;
      x.lineWidth = 2;
      x.beginPath();
      x.arc(tx, ty, 14, 0, Math.PI * 2);
      x.stroke();
      if (r.p) {
        const px = r.p[0] * W,
          py = r.p[1] * H;
        x.beginPath();
        x.moveTo(tx, ty);
        x.lineTo(px, py);
        x.stroke();
        x.beginPath();
        x.arc(px, py, 5, 0, Math.PI * 2);
        x.fill();
      }
      x.font = '12px "Noto Sans TC", sans-serif';
      x.textAlign = 'center';
      x.fillText(r.err === null ? '沒有資料' : Math.round(r.err) + ' px', tx, ty + 30);
    }
  },
  // ---------- 快速修正偏移：看著畫面中央的點 2 秒，只修正整體的偏差（不用重新校準） ----------
  gazeDriftOpen(done) {
    const g = this.gz;
    if (this.gzDrift || !g || !g.cal) return false;
    const el = document.createElement('div');
    el.id = 'gazeDrift';
    el.innerHTML = `<div id="gdDot"><i></i></div><p>看著中央的點（約 2 秒）</p>`;
    this.gazeLayer().appendChild(el);
    const d = (this.gzDrift = { el, t: 0, P: [], seen: -1, last: performance.now(), done });
    this.gazeStart();
    const step = () => {
      if (this.gzDrift !== d) return;
      requestAnimationFrame(step);
      const now = performance.now();
      d.t += Math.min(0.1, (now - d.last) / 1000);
      d.last = now;
      el.style.setProperty('--k', clamp((d.t - 0.6) / 1.6, 0, 1));
      const T = this.gazeTune();
      if (d.t > 0.6 && g.frame !== d.seen && g.r && g.r.blink < T.eye.blink) {
        const P = gazePredict(g.cal.M, g.r.f);
        if (P) d.P.push(P);
      }
      d.seen = g.frame;
      if (d.t >= 2.2) this.gazeDriftClose(true);
    };
    requestAnimationFrame(step);
    return true;
  },
  gazeDriftClose(apply) {
    const d = this.gzDrift;
    if (!d) return;
    this.gzDrift = null;
    d.el.remove();
    const g = this.gz;
    let ok = false;
    if (apply && d.P.length >= 5 && g.cal) {
      g.cal.bias = [0.5 - median(d.P.map((p) => p.x)), 0.5 - median(d.P.map((p) => p.y))];
      try {
        localStorage.setItem(CAL_KEY, JSON.stringify(g.cal));
      } catch (e) {}
      g.fx.reset();
      g.fy.reset();
      ok = true;
    }
    if (!this.gazeCfg().on && !this.gazeBusy()) this.gazeStop();
    if (d.done) d.done(ok);
  },
});

if (TEST) window.__gazeConst = { CAL_PTS, VAL_PTS, PT_T, gazeFeatures, gazePredict };
