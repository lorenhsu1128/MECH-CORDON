// Game：眼動追蹤（docs/gaze-design.md）——筆電的網路攝影機＋MediaPipe Face Landmarker（lib/gaze-assets.js）。
// 兩個各自獨立的功能：看哪鎖哪（注視點附近的敵人停留一下就鎖定）、頭部延伸視角（追尾／第一人稱時轉頭＝鏡頭跟著轉）。
// 影像只在本機處理；攝影機只能在安全環境開啟（file://、localhost、https），區網的 http 網址改用伺服器的 https。
// 只改本機的輸入（鎖定的目標、鏡頭的 yaw／pitch），多人時客機照常把鎖定目標送給房主，不改協定。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { clamp } from '../core/math.js';
import { OneEuro, gazeFeatures, gazeFit, gazePredict, headRate } from '../core/gaze.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const CAL_KEY = 'rubicon_gaze'; // 校準結果（裝置與坐姿相關，不放進設定 rubicon_ctrl）
const DEF = { on: false, lock: true, head: false, dwell: 0.25, headK: 1, dot: false };
const DET_DT = 30; // 偵測間隔（毫秒，約 30 Hz）
const LOST_T = 0.4; // 看不到臉或眨眼超過這麼久，注視點就失效
// 頭部延伸視角：死區、到全速的範圍（弧度）、最快的轉速（弧度／秒）
const HEAD_DEAD = 0.1,
  HEAD_SPAN = 0.2,
  HEAD_YAW_V = 1.8,
  HEAD_PITCH_V = 1.0;
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
  PT_SETTLE = 0.6;
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
        hs: { yaw: 0, pitch: 0 }, // 平滑後的頭部轉向
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
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
            audio: false,
          });
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
        if (!this.gazeCfg().on && !this.gzCal) {
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
    if (!C.on && !this.gzCal) return;
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
      if (!v || v.readyState < 2 || v.currentTime === g.lastVT) return;
      g.lastVT = v.currentTime;
      try {
        const res = g.fl.detectForVideo(v, now);
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
    if (!r || r.blink > 0.5) {
      g.lostT += dt;
      if (g.lostT > LOST_T) g.valid = false;
    } else {
      g.lostT = 0;
      g.head = r.head;
      g.hs.yaw += (r.head.yaw - g.hs.yaw) * Math.min(1, dt * 12);
      g.hs.pitch += (r.head.pitch - g.hs.pitch) * Math.min(1, dt * 12);
      this.gazeNeutralTick(dt);
      const P = g.cal && gazePredict(g.cal.M, r.f);
      if (P) {
        g.x = g.fx.filter(clamp(P.x, -0.05, 1.05) * innerWidth, dt);
        g.y = g.fy.filter(clamp(P.y, -0.05, 1.05) * innerHeight, dt);
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
    const k = Math.min(1, dt / 8);
    if (Math.abs(g.hs.yaw - g.neutral.yaw) < HEAD_DEAD * 0.8) g.neutral.yaw += (g.hs.yaw - g.neutral.yaw) * k;
    if (Math.abs(g.hs.pitch - g.neutral.pitch) < HEAD_DEAD * 0.8)
      g.neutral.pitch += (g.hs.pitch - g.neutral.pitch) * k;
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
  // ---------- 頭部延伸視角（chase.js 的 camAimInput）：回傳 { x, y } 鏡頭的轉速（弧度／秒）或 null ----------
  gazeHeadRate(p) {
    const g = this.gz;
    if (!g || g.st !== 'ready' || !g.face || !g.neutral || g.lostT > LOST_T) return null;
    const C = this.gazeCfg();
    if (!C.on || !C.head || this.spectator || this.lab || this.cine) return null;
    if (this.assistOn() && p.lock && !p.lock.dead) return null; // 目標輔助正在帶鏡頭
    const k = (C.headK || 1) * (this.ctrl.sens || 1);
    const rx = headRate(g.hs.yaw - g.neutral.yaw, HEAD_DEAD, HEAD_SPAN);
    const ry = headRate(g.hs.pitch - g.neutral.pitch, HEAD_DEAD * 1.2, HEAD_SPAN);
    if (!rx && !ry) return null;
    return { x: rx * HEAD_YAW_V * k, y: ry * HEAD_PITCH_V * k * (this.ctrl.invY ? -1 : 1) };
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
      `<select data-gz="${k}" ${C.on ? '' : 'disabled'}>${list
        .map(([v, l]) => `<option value="${v}" ${+C[k] === v ? 'selected' : ''}>${l}</option>`)
        .join('')}</select>`;
    box.innerHTML =
      (ok
        ? ''
        : `<p style="font-size:12px;color:#ffb080">這個網址不能使用攝影機（瀏覽器只在 https、localhost 或直接開檔時允許）。${
            https
              ? `請改用伺服器的安全連線：<a href="${escHtml(https)}" style="color:#5cc8ff">${escHtml(https)}</a>（第一次會出現憑證警告，按「進階 → 繼續前往」）`
              : ''
          }</p>`) +
      `<div class="krow"><span>啟用</span><label><input type="checkbox" data-gz="on" ${C.on ? 'checked' : ''} ${ok ? '' : 'disabled'} /> 用攝影機追蹤眼睛與頭部（影像只在這台電腦處理，不會上傳）</label></div>` +
      `<div class="krow"><span>狀態</span><span id="gazeStatus" class="dim" style="font-size:12px"></span></div>` +
      `<div class="krow"><span>看哪鎖哪</span><span style="display:flex;gap:8px;align-items:center"><label><input type="checkbox" data-gz="lock" ${C.lock ? 'checked' : ''} ${C.on ? '' : 'disabled'} /> 看著敵人一下就鎖定</label>${sel(
        'dwell',
        [
          [0.15, '快（0.15 秒）'],
          [0.25, '標準（0.25 秒）'],
          [0.4, '慢（0.4 秒）'],
        ],
      )}</span></div>` +
      `<div class="krow"><span>頭部延伸視角</span><span style="display:flex;gap:8px;align-items:center"><label title="追尾視角與第一人稱：頭往左右（上下）轉超過一點，鏡頭就往那邊轉；頭擺正就停"><input type="checkbox" data-gz="head" ${C.head ? 'checked' : ''} ${C.on ? '' : 'disabled'} /> 轉頭＝鏡頭跟著轉（追尾／第一人稱）</label>${sel(
        'headK',
        [
          [0.6, '慢'],
          [1, '標準'],
          [1.5, '快'],
        ],
      )}</span></div>` +
      `<div class="krow"><span>顯示注視點</span><label><input type="checkbox" data-gz="dot" ${C.dot ? 'checked' : ''} ${C.on ? '' : 'disabled'} /> 任務中畫出眼睛看的位置（調整用）</label></div>` +
      `<div class="krow"><span>校準</span><button id="gazeCalBtn" ${C.on && ok ? '' : 'disabled'}>開始校準…</button></div>` +
      `<p class="dim" style="font-size:11px">看哪鎖哪要先校準（看著畫面上的 9 個點，約 20 秒）；換位置坐、光線變了或覺得不準時再校準一次。頭部延伸視角不用校準。坐在離螢幕 50～70 cm、臉的光線充足時最準。</p>`;
    box.onchange = (e) => {
      const k = e.target.dataset && e.target.dataset.gz;
      if (!k) return;
      const v = e.target.type === 'checkbox' ? e.target.checked : +e.target.value;
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
  gazeCalOpen() {
    if (this.gzCal) return;
    const g = this.gzState();
    const el = document.createElement('div');
    el.id = 'gazeCal';
    el.innerHTML =
      `<div class="gcPanel"><div class="gcVid"></div><div><h3>眼動追蹤的校準</h3><p id="gcMsg"></p>` +
      `<div class="row"><button class="primary" id="gcGo">開始</button><button id="gcCancel">取消</button></div></div></div>` +
      `<div id="gcDot"><i></i></div>`;
    document.body.appendChild(el);
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
      } else if ((e.key === ' ' || e.key === 'Enter') && cal.ph === 'prep') {
        e.preventDefault();
        this.gazeCalBegin();
      }
    };
    cal.key = key;
    addEventListener('keydown', key, true);
    $('gcCancel').onclick = () => this.gazeCalClose();
    $('gcGo').onclick = () => (cal.ph === 'done' ? this.gazeCalClose(true) : this.gazeCalBegin());
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
    if (g && g.video) document.body.appendChild(g.video); // 預覽放回隱藏的位置
    cal.el.remove();
    if (!keep && cal.prevCal !== undefined && g) g.cal = cal.prevCal; // 取消：還原原本的校準
    if (!this.gazeCfg().on) this.gazeStop();
    this.renderGazeSettings();
  },
  gazeCalBegin() {
    const cal = this.gzCal;
    const g = this.gz;
    if (!cal || !g || g.st !== 'ready') return;
    cal.prevCal = g.cal;
    cal.ph = 'run';
    cal.i = 0;
    cal.t = 0;
    cal.X = [];
    cal.Y = [];
    cal.V = [];
    cal.hacc = [];
    cal.seen = g.frame;
    cal.el.classList.add('run');
  },
  gazeCalTarget(cal) {
    const pts = cal.ph === 'run' ? CAL_PTS : VAL_PTS;
    return pts[cal.i];
  },
  gazeCalStep(cal, dt) {
    const g = this.gz;
    const msg = $('gcMsg'),
      dot = $('gcDot'),
      go = $('gcGo');
    if (!msg) return;
    if (cal.ph === 'prep') {
      msg.textContent =
        !g || g.st === 'loading'
          ? '載入中…（第一次約需數秒）'
          : g.st === 'error'
            ? g.msg
            : g.face
              ? '偵測到臉 ✓　坐好、頭保持自然，按「開始」後用眼睛盯著畫面上的點（點會自己移動，約 20 秒）。'
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
    const tp = this.gazeCalTarget(cal);
    cal.t += dt;
    const W = innerWidth,
      H = innerHeight;
    const prev = cal.i > 0 ? (cal.ph === 'run' ? CAL_PTS : VAL_PTS)[cal.i - 1] : tp;
    const m = clamp(cal.t / 0.35, 0, 1);
    const k = m * m * (3 - 2 * m);
    dot.style.display = 'block';
    dot.classList.remove('live');
    dot.style.left = (prev[0] + (tp[0] - prev[0]) * k) * W + 'px';
    dot.style.top = (prev[1] + (tp[1] - prev[1]) * k) * H + 'px';
    dot.style.setProperty('--k', clamp((cal.t - PT_SETTLE) / (PT_T - PT_SETTLE), 0, 1));
    if (cal.t >= PT_SETTLE && g.frame !== cal.seen && g.r && g.r.blink < 0.5) {
      if (cal.ph === 'run') {
        cal.X.push(g.r.f);
        cal.Y.push(tp);
        cal.hacc.push(g.r.head);
      } else (cal.V[cal.i] = cal.V[cal.i] || []).push(g.r.f);
    }
    cal.seen = g.frame;
    const total = CAL_PTS.length + VAL_PTS.length;
    const done = (cal.ph === 'run' ? 0 : CAL_PTS.length) + cal.i;
    msg.textContent = `盯著點看…（${done + 1}／${total}）`;
    if (cal.t < PT_T) return;
    cal.t = 0;
    cal.i++;
    if (cal.ph === 'run' && cal.i >= CAL_PTS.length) {
      const M = gazeFit(cal.X, cal.Y);
      if (!M) return this.gazeCalFail('資料不夠（臉常常沒偵測到），請調整光線或位置後重新校準。');
      cal.M = M;
      cal.ph = 'val';
      cal.i = 0;
    } else if (cal.ph === 'val' && cal.i >= VAL_PTS.length) this.gazeCalFinish(cal);
  },
  gazeCalFail(text) {
    const cal = this.gzCal;
    cal.ph = 'prep';
    cal.el.classList.remove('run');
    if (cal.prevCal !== undefined) this.gz.cal = cal.prevCal;
    $('gcMsg').textContent = text;
  },
  gazeCalFinish(cal) {
    const g = this.gz;
    const W = innerWidth,
      H = innerHeight;
    // 驗證：每個點的預測取中位數，量到目標的距離（px）
    const errs = [];
    VAL_PTS.forEach((tp, i) => {
      const P = (cal.V[i] || []).map((f) => gazePredict(cal.M, f)).filter(Boolean);
      if (P.length < 3) return;
      const x = median(P.map((q) => q.x)),
        y = median(P.map((q) => q.y));
      errs.push(Math.hypot((x - tp[0]) * W, (y - tp[1]) * H));
    });
    if (errs.length < 3) return this.gazeCalFail('驗證時常常沒偵測到臉，請調整光線或位置後重新校準。');
    const err = errs.reduce((a, b) => a + b, 0) / errs.length;
    // 驗證的資料也加進去重新擬合（誤差照實回報擬合前的數字）
    const X = [...cal.X],
      Y = [...cal.Y];
    VAL_PTS.forEach((tp, i) => {
      for (const f of cal.V[i] || []) {
        X.push(f);
        Y.push(tp);
      }
    });
    const M = gazeFit(X, Y) || cal.M;
    g.cal = { v: 1, M, err, t: Date.now() };
    try {
      localStorage.setItem(CAL_KEY, JSON.stringify(g.cal));
    } catch (e) {}
    if (cal.hacc.length)
      g.neutral = { yaw: median(cal.hacc.map((h) => h.yaw)), pitch: median(cal.hacc.map((h) => h.pitch)) };
    g.fx.reset();
    g.fy.reset();
    cal.prevCal = undefined;
    cal.ph = 'done';
    cal.el.classList.remove('run');
    const pct = (err / H) * 100;
    const grade =
      pct < 6 ? '很好' : pct < 11 ? '可以用（看哪鎖哪足夠）' : '偏大：建議調整光線、坐近一點後重新校準';
    $('gcMsg').textContent =
      `完成！平均誤差約 ${Math.round(err)} px（畫面高度的 ${pct.toFixed(1)}%）——${grade}。藍點是現在眼睛看的位置，可以看看準不準。`;
    $('gcGo').textContent = '完成';
    $('gcCancel').textContent = '重新校準';
    $('gcCancel').onclick = () => {
      $('gcGo').textContent = '開始';
      $('gcCancel').textContent = '取消';
      $('gcCancel').onclick = () => this.gazeCalClose();
      this.gazeCalBegin();
    };
    SFX.ui();
  },
});

if (TEST) window.__gazeConst = { CAL_PTS, VAL_PTS, PT_T, gazeFeatures, gazePredict };
