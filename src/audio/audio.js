// ============================================================
//  AUDIO — 音效、環境音、配樂的混音（docs/audio-design.md）
// ============================================================
import { clamp, lerp, makeRng } from '../core/math.js';
import { DS } from '../core/scale.js';
import { SFX_DATA } from './sfx-data.js';
import { synthAll } from './synth.js';
import { GUN, GUN_OF_ID, GUN_OF_KIND, ENV } from './recipes.js';

// 音效自己的亂數（音高變化、隨機選檔、雜訊）：不用 Math.random，因為遊戲邏輯共用它，而音效依 AudioContext 的
// 實際時間節流（minGap）——播不播會改變遊戲邏輯之後拿到的亂數（冒煙測試固定種子快轉模擬時結果每次不同）
const arnd = makeRng(0x5f3759df);

const VOICE_MAX = 48; // 同時發聲的上限（超過時搶走優先度最低的）
const KEY_MAX = 4; // 同一個鍵同時最多幾個（配方可以改）
const NEAR_D = 30; // 槍聲的近距離（× dk）：之內只用 near
const FAR_D = 90; // 之外只用 far，中間交叉淡化
const SND_V = 343; // 音速（遠的爆炸晚一點聽到）

// 多人：這些高階的呼叫整個轉送給客機（客機依自己的距離決定播哪幾層）；數字＝位置參數的索引
const NET_FNS = {
  shot: 2,
  charge: 0,
  explode: 1,
  wreck: 0,
  hit: 0,
  hitWorld: 0,
  hitShield: 0,
  hitDome: 0,
  meleeSwing: 3,
  meleeHit: 1,
  clash: 0,
  qb: 0,
  jump: 0,
  land: 0,
  ab: 0,
  stagger: 0,
  bomber: 0,
  ally: 0,
  ricochet: 0,
  casing: 0,
  servo: 1,
  empBlast: 0,
};

// 混音：音效（sfx）與環境音（amb）→ world（音效音量）→ muf（低 AP 時低通變悶）→ duck（大爆炸、通訊時壓低）→ master；
// 介面（ui）、語音（voice）、配樂（mus 過場、bgm 任務中）不受壓低與變悶，各自的音量直接進 master。
// 音效另外送一份到殘響（依地圖主題，地下長、空曠短）與反射（env：兩條延遲線，依主題）。
// master → 壓縮 → 限幅 → 輸出。
export const SFX = {
  dk: DS, // 3D 音效的距離倍率
  ctx: null,
  master: null,
  on: true,
  buf: {},
  ready: false,
  pack: false, // lib/sfx-assets.js（分層的素材）載入並解碼完
  lastT: {},
  mirror: null, // 房主把有位置的音效轉送給客機：(k, vol, rate, pos) => void，由 Game 設定（mp-lobby.js）
  mirrorCall: null, // 房主把高階的呼叫轉送給客機：(名稱, 參數, 位置) => void
  netDepth: 0, // 高階呼叫裡面的 play 不再個別轉送
  vol: { m: 1, s: 1, b: 1, v: 1, u: 1 }, // 主音量、音效、配樂、語音、介面（ctrl.vol）
  voices: [],
  threatOf: null, // (實體) => 1 一般／>1 正在攻擊玩家（威脅導向的混音，Game 設定）
  surfAt: null, // (位置) => 地面材質（命中依材質，Game 設定）
  init() {
    if (this.ctx) return;
    try {
      const c = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -3;
      lim.knee.value = 0;
      lim.ratio.value = 20;
      lim.attack.value = 0.001;
      lim.release.value = 0.12;
      lim.connect(c.destination);
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.ratio.value = 4;
      comp.connect(lim);
      this.master = c.createGain();
      this.master.connect(comp);
      this.duckG = c.createGain();
      this.duckG.connect(this.master);
      this.muf = c.createBiquadFilter();
      this.muf.type = 'lowpass';
      this.muf.frequency.value = 20000;
      this.muf.connect(this.duckG);
      this.world = c.createGain();
      this.world.connect(this.muf);
      this.sfx = c.createGain();
      this.sfx.connect(this.world);
      this.amb = c.createGain();
      this.amb.gain.value = 0;
      this.amb.connect(this.world);
      this.uiBus = c.createGain();
      this.uiBus.connect(this.master);
      this.voiceBus = c.createGain();
      this.voiceBus.connect(this.master);
      // 任務中的配樂（game/bgm.js）：自己的壓低（語音時）與音量
      this.bgmDuck = c.createGain();
      this.bgmBus = c.createGain();
      this.bgmBus.connect(this.bgmDuck);
      this.bgmDuck.connect(this.master);
      // 配樂（過場動畫，game/cine.js）：直接進 master，不受壓低與變悶
      // 曲子的安靜段落（預告片的開頭）與高潮差 20 dB 以上：先壓縮再補增益，整段都聽得到
      this.mus = c.createGain();
      this.mus.gain.value = 1;
      const mc = c.createDynamicsCompressor();
      mc.threshold.value = -32;
      mc.knee.value = 12;
      mc.ratio.value = 3;
      mc.attack.value = 0.05;
      mc.release.value = 0.6;
      this.musOut = c.createGain();
      this.mus.connect(mc);
      mc.connect(this.musOut);
      this.musOut.connect(this.master);
      this.revIn = c.createGain();
      this.revIn.gain.value = 0;
      this.conv = c.createConvolver();
      this.sfx.connect(this.revIn);
      this.revIn.connect(this.conv);
      this.conv.connect(this.world);
      this.setReverb(1.0, 0.1);
      this.buildEnv();
      this.setEnv('open');
      this.setVol(this.vol);
      this.load();
    } catch (e) {
      this.on = false;
    }
  },
  // 音量（0～1）：m 主音量、s 音效與環境音、b 配樂、v 語音、u 介面
  setVol(v) {
    this.vol = Object.assign({ m: 1, s: 1, b: 1, v: 1, u: 1 }, v || {});
    if (!this.ctx) return;
    const t = this.ctx.currentTime,
      V = this.vol;
    this.master.gain.setTargetAtTime(0.7 * V.m, t, 0.03);
    this.world.gain.setTargetAtTime(V.s, t, 0.03);
    this.uiBus.gain.setTargetAtTime(V.u, t, 0.03);
    this.voiceBus.gain.setTargetAtTime(V.v * 1.1, t, 0.03);
    this.bgmBus.gain.setTargetAtTime(V.b * 0.55, t, 0.03);
    this.musOut.gain.setTargetAtTime(V.b * 2.2, t, 0.03);
  },
  b64(s) {
    const bin = atob(s);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr.buffer;
  },
  load() {
    const c = this.ctx;
    let n = 0;
    const keys = Object.keys(SFX_DATA);
    for (const k of keys) {
      c.decodeAudioData(
        this.b64(SFX_DATA[k]),
        (b) => {
          this.buf[k] = b;
          if (++n === keys.length) this.ready = true;
        },
        () => {
          if (++n === keys.length) this.ready = true;
        },
      );
    }
    // 合成音（audio/synth.js）
    const syn = synthAll(c.sampleRate, arnd);
    for (const k in syn) {
      const b = c.createBuffer(1, syn[k].length, c.sampleRate);
      b.getChannelData(0).set(syn[k]);
      this.buf[k] = b;
    }
    this.loadPack();
  },
  // 分層的素材（src/assets/sfx2 → lib/sfx-assets.js，window.RUBICON_SFX2）：遊戲啟動後以 <script> 載入；
  // 載到之前配方退回原本的樣本
  loadPack() {
    if (this.packLoading) return;
    this.packLoading = true;
    const go = () => {
      const P = window.RUBICON_SFX2;
      if (!P) return;
      const keys = Object.keys(P);
      let n = 0;
      for (const k of keys)
        this.ctx.decodeAudioData(
          this.b64(P[k]),
          (b) => {
            this.buf[k] = b;
            if (++n === keys.length) this.pack = true;
          },
          () => {
            if (++n === keys.length) this.pack = true;
          },
        );
    };
    if (window.RUBICON_SFX2) return go();
    if (typeof document === 'undefined') return;
    const s = document.createElement('script');
    s.src = 'lib/sfx-assets.js';
    s.onload = go;
    s.onerror = () => {};
    document.head.appendChild(s);
  },
  // 殘響：以衰減的雜訊產生脈衝響應（decay 秒），wet＝送出量；殘響長度沒變就只改送出量
  setReverb(decay, wet) {
    if (!this.ctx) return;
    if (!this.revDecay || Math.abs(this.revDecay - decay) > 0.05) {
      const c = this.ctx,
        len = Math.max(1, Math.floor(c.sampleRate * decay)),
        b = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        for (let i = 0; i < len; i++) {
          const t = i / len;
          // 前段稀疏的早期反射＋指數衰減的尾巴
          d[i] = (arnd() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 600 && i % 97 ? 0.3 : 1);
        }
      }
      this.conv.buffer = b;
      this.revDecay = decay;
    }
    this.revIn.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.2);
  },
  // 環境的反射（槍聲、爆炸的尾音）：兩條有回授的延遲線，左右分開；依主題換參數（recipes.js 的 ENV）
  buildEnv() {
    const c = this.ctx;
    this.tailIn = c.createGain();
    this.tailOut = c.createGain();
    this.tailOut.connect(this.world);
    this.envL = [];
    for (const pan of [-0.7, 0.7]) {
      const d = c.createDelay(1.5),
        lp = c.createBiquadFilter(),
        hp = c.createBiquadFilter(),
        fb = c.createGain();
      lp.type = 'lowpass';
      hp.type = 'highpass';
      hp.frequency.value = 160;
      this.tailIn.connect(d);
      d.connect(lp);
      lp.connect(hp);
      hp.connect(fb);
      fb.connect(d);
      let out = hp;
      if (c.createStereoPanner) {
        const p = c.createStereoPanner();
        p.pan.value = pan;
        hp.connect(p);
        out = p;
      }
      out.connect(this.tailOut);
      this.envL.push({ d, lp, fb });
    }
  },
  setEnv(name) {
    if (!this.ctx || !this.envL) return;
    const E = ENV[name] || ENV.open,
      t = this.ctx.currentTime;
    this.envName = name;
    this.envL[0].d.delayTime.setTargetAtTime(E.d1, t, 0.1);
    this.envL[1].d.delayTime.setTargetAtTime(E.d2, t, 0.1);
    for (const L of this.envL) {
      L.fb.gain.setTargetAtTime(E.fb, t, 0.1);
      L.lp.frequency.setTargetAtTime(E.lp, t, 0.1);
    }
    this.tailOut.gain.setTargetAtTime(E.wet, t, 0.1);
  },
  // 大爆炸、通訊時把世界的聲音暫時壓低（amt＝壓掉的比例）
  duck(amt, dur = 0.35) {
    if (!this.ctx) return;
    const g = this.duckG.gain,
      t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1 - amt, t + 0.03);
    g.setTargetAtTime(1, t + dur, dur * 0.6);
  },
  // 配樂的壓低（語音說話時）：amt 0～1，dur 秒後恢復
  duckBgm(amt, dur) {
    if (!this.ctx) return;
    const g = this.bgmDuck.gain,
      t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(1 - amt, t + 0.15);
    g.setTargetAtTime(1, t + dur, 0.4);
  },
  // 低 AP：世界的聲音變悶（k 0～1）
  setMuffle(k) {
    if (!this.ctx) return;
    const f = k <= 0 ? 20000 : lerp(4000, 650, k);
    if (Math.abs((this.mufF || 20000) - f) < 50) return;
    this.mufF = f;
    this.muf.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.15);
  },
  // listener follows the player; camera yaw is fixed so world axes == screen axes (x right, -z up-screen)
  setListener(pos) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    this.lpos = pos;
    if (L.positionX) {
      L.positionX.value = pos.x;
      L.positionY.value = pos.y;
      L.positionZ.value = pos.z;
      L.forwardX.value = 0;
      L.forwardY.value = -0.6;
      L.forwardZ.value = -1;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(0, -0.6, -1, 0, 1, 0);
    }
  },
  // 過場動畫：聽者跟著鏡頭（位置與朝向）
  setListenerCam(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener,
      p = cam.position;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion),
      u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    this.lpos = p;
    if (L.positionX) {
      L.positionX.value = p.x;
      L.positionY.value = p.y;
      L.positionZ.value = p.z;
      L.forwardX.value = f.x;
      L.forwardY.value = f.y;
      L.forwardZ.value = f.z;
      L.upX.value = u.x;
      L.upY.value = u.y;
      L.upZ.value = u.z;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
    }
  },
  // ---- 配樂：base64 的 mp3 解碼一次後快取；musicPlay 在 ctx 時間 at 從 offset 秒開始播 ----
  mbuf: {},
  mplay: [],
  musicDecode(name, b64) {
    if (this.mbuf[name]) return Promise.resolve(this.mbuf[name]);
    if (!this.ctx || !b64) return Promise.resolve(null);
    return new Promise((res) =>
      this.ctx.decodeAudioData(
        this.b64(b64),
        (b) => res((this.mbuf[name] = b)),
        () => res(null),
      ),
    );
  },
  musicPlay(name, at, offset = 0, vol = 1, fadeIn = 0) {
    const b = this.mbuf[name];
    if (!this.ctx || !this.on || !b || offset >= b.duration) return null;
    const c = this.ctx,
      s = c.createBufferSource(),
      g = c.createGain();
    s.buffer = b;
    s.connect(g);
    g.connect(this.mus);
    const t = Math.max(at, c.currentTime);
    g.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : vol, t);
    if (fadeIn > 0) g.gain.exponentialRampToValueAtTime(vol, t + fadeIn);
    s.start(t, offset + (t - at));
    const h = { s, g, name };
    this.mplay.push(h);
    s.onended = () => (this.mplay = this.mplay.filter((x) => x !== h));
    return h;
  },
  // 一首曲子在 ctx 時間 at 開始淡出（dur 秒）
  musicFadeAt(h, at, dur) {
    if (!h || !this.ctx) return;
    const g = h.g.gain,
      t = Math.max(at, this.ctx.currentTime);
    try {
      g.setTargetAtTime(0, t, Math.max(0.05, dur / 4));
      h.s.stop(t + dur + 0.1);
    } catch (e) {}
  },
  musicStop(fade = 0.4) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const h of this.mplay) {
      try {
        h.g.gain.cancelScheduledValues(t);
        h.g.gain.setValueAtTime(h.g.gain.value, t);
        h.g.gain.linearRampToValueAtTime(0, t + fade);
        h.s.stop(t + fade + 0.05);
      } catch (e) {}
    }
    this.mplay = [];
  },
  dist(pos) {
    return pos && this.lpos ? Math.hypot(pos.x - this.lpos.x, pos.y - this.lpos.y, pos.z - this.lpos.z) : 0;
  },
  // ---- 發聲上限：同時最多 VOICE_MAX 個，超過時搶走優先度最低的（10 ms 淡出）；同一個鍵最多 max 個 ----
  voiceKill(v, t) {
    try {
      v.g.gain.cancelScheduledValues(t);
      v.g.gain.setValueAtTime(v.g.gain.value, t);
      v.g.gain.linearRampToValueAtTime(0, t + 0.012);
      v.s.stop(t + 0.02);
    } catch (e) {}
    v.dead = true;
  },
  voiceAdmit(k, pr, max, t) {
    const V = (this.voices = this.voices.filter((v) => !v.dead && v.end > t));
    let same = 0,
      oldest = null;
    for (const v of V)
      if (v.k === k) {
        same++;
        if (!oldest || v.t0 < oldest.t0) oldest = v;
      }
    if (same >= max && oldest) this.voiceKill(oldest, t);
    if (V.length - (same >= max ? 1 : 0) < VOICE_MAX) return true;
    let low = null;
    for (const v of V) if (!v.dead && (!low || v.pr < low.pr)) low = v;
    if (!low || low.pr > pr) return false;
    this.voiceKill(low, t);
    return true;
  },
  // bus：'ui' 不受壓低與變悶、'voice' 語音；delay：延遲秒數（分層的尾音）
  // o：{ pr 類別權重（自機 3、威脅 1.6、一般 1）, hp 高通 Hz, send 反射的送出量, vr 音量隨機（dB）, max 同鍵上限 }
  play(k, vol = 1, rate = 1, detune = 0.06, minGap = 0.03, pos = null, bus = null, delay = 0, o = null) {
    if (pos && this.mirror && !this.netDepth) this.mirror(k, vol, rate, pos);
    if (!this.ctx || !this.on) return;
    const b = this.buf[k];
    if (!b) return;
    const t = this.ctx.currentTime;
    const gk = k + (pos ? '@' : '');
    if (this.lastT[gk] && t - this.lastT[gk] < minGap) return;
    const d = pos ? this.dist(pos) : 0;
    if (d > 140 * this.dk) return;
    const rate1 = rate * (1 + (arnd() * 2 - 1) * detune);
    const vr = o && o.vr !== undefined ? o.vr : 1.5;
    const vol1 = vol * Math.pow(10, ((arnd() * 2 - 1) * vr) / 20);
    const ui = bus === 'ui' || bus === 'voice';
    if (!ui) {
      // 優先度＝音量 × 距離衰減 × 類別
      const ref = 7 * this.dk,
        att = pos ? ref / (ref + 1.3 * Math.max(0, d - ref)) : 1;
      const pr = vol1 * att * ((o && o.pr) || (pos ? 1 : 3));
      if (!this.voiceAdmit(k, pr, (o && o.max) || KEY_MAX, t)) return;
      this.lastT[gk] = t;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.voiceStart(k, b, vol1, rate1, pos, d, delay, o, pr, t);
    }
    this.lastT[gk] = t;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate1;
    const g = this.ctx.createGain();
    g.gain.value = vol1;
    s.connect(g);
    g.connect(bus === 'voice' ? this.voiceBus : this.uiBus);
    s.start(t + delay);
  },
  voiceStart(k, b, vol, rate, pos, d, delay, o, pr, t) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.value = vol;
    let head = s;
    if (o && o.hp) {
      const h = c.createBiquadFilter();
      h.type = 'highpass';
      h.frequency.value = o.hp;
      s.connect(h);
      head = h;
    }
    head.connect(g);
    let out = g;
    if (pos) {
      // 3D: distance falloff + stereo direction + far-away low-pass
      const pn = c.createPanner();
      pn.panningModel = 'equalpower';
      pn.distanceModel = 'inverse';
      pn.refDistance = 7 * this.dk;
      pn.maxDistance = 160 * this.dk;
      pn.rolloffFactor = 1.3;
      pn.coneInnerAngle = 360;
      if (pn.positionX) {
        pn.positionX.value = pos.x;
        pn.positionY.value = pos.y;
        pn.positionZ.value = pos.z;
      } else pn.setPosition(pos.x, pos.y, pos.z);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = clamp(16000 - (d / this.dk) * 110, 1800, 16000);
      g.connect(pn);
      pn.connect(lp);
      out = lp;
    }
    out.connect(this.sfx);
    if (o && o.send > 0 && this.tailIn) {
      const sg = c.createGain();
      sg.gain.value = o.send;
      out.connect(sg);
      sg.connect(this.tailIn);
    }
    const v = { s, g, k, pr, t0: t, end: t + delay + b.duration / Math.max(0.1, rate) + 0.05 };
    this.voices.push(v);
    s.onended = () => {
      v.dead = true;
      try {
        out.disconnect();
      } catch (e) {}
    };
    s.start(t + delay);
    return v;
  },
  // 從清單裡輪流挑（不連續兩次同一個）；只挑已經有的素材
  rr: {},
  pickKey(list) {
    const ok = list.filter((k) => this.buf[k]);
    if (!ok.length) return null;
    if (ok.length === 1) return ok[0];
    const id = list.join(',');
    let i = Math.floor(arnd() * ok.length);
    if (ok[i] === this.rr[id]) i = (i + 1) % ok.length;
    return (this.rr[id] = ok[i]);
  },
  pickPlay(list, vol, rate, pos, detune = 0.06, minGap = 0.03) {
    const k = this.pickKey(list) || list[0];
    this.play(k, vol, rate, detune, minGap, pos);
  },
  // 配方的一層：[清單, 音量, 音高] × 倍率
  layer(L, vk, rk, pos, o, delay = 0, detune = 0.05, gap = 0.012) {
    if (!L || vk <= 0.003) return false;
    const k = this.pickKey(L[0]);
    if (!k) return false;
    this.play(k, L[1] * vk, L[2] * rk, detune, gap, pos, null, delay, o);
    return true;
  },
  // ---- 合成音（短促的提示音、心跳、無線電雜訊）----
  noise(dur, freq, vol, type = 'lowpass', bus = 'sfx', q = 1, delay = 0) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx;
    const b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (arnd() * 2 - 1) * (1 - i / d.length);
    const s = c.createBufferSource();
    s.buffer = b;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.value = vol * 0.5;
    s.connect(f);
    f.connect(g);
    g.connect(bus === 'ui' ? this.uiBus : bus === 'voice' ? this.voiceBus : this.sfx);
    s.start(c.currentTime + delay);
  },
  tone(f0, f1, dur, vol, type = 'square', bus = 'sfx', delay = 0) {
    if (!this.ctx || !this.on) return;
    const c = this.ctx,
      t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol * 0.4, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(bus === 'ui' ? this.uiBus : bus === 'voice' ? this.voiceBus : this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  },
  // ---- 循環音（推進器／引擎）：玩家專用，gain 平滑 ----
  loops: {},
  loopSet(name, key, target, rate = 1) {
    if (!this.ctx || !this.on) return;
    let L = this.loops[name];
    const b = this.buf[key];
    if (!b) return;
    if (L && L.key !== key) {
      // 換了素材（例如 sfx2 載入後）：舊的停掉重建
      try {
        L.s.stop();
      } catch (e) {}
      delete this.loops[name];
      L = null;
    }
    if (!L) {
      if (target <= 0.01) return;
      const s = this.ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      s.connect(g);
      g.connect(this.sfx);
      s.start();
      L = this.loops[name] = { s, g, v: 0, key };
    }
    L.v = lerp(L.v, target, 0.15);
    L.g.gain.setTargetAtTime(L.v, this.ctx.currentTime, 0.05);
    L.s.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.1);
    if (target <= 0.01 && L.v < 0.02) {
      try {
        L.s.stop();
      } catch (e) {}
      delete this.loops[name];
    }
  },
  // 有位置的循環音（敵人的推進器，第 3 期）：每格呼叫，沒有再呼叫的由 loopsAtTick 淡出
  loopsAt: {},
  loopAt(name, key, target, rate, pos) {
    if (!this.ctx || !this.on || !this.lpos) return;
    const b = this.buf[key];
    if (!b) return;
    let L = this.loopsAt[name];
    const t = this.ctx.currentTime;
    if (!L) {
      if (target <= 0.01) return;
      const c = this.ctx,
        s = c.createBufferSource(),
        g = c.createGain(),
        pn = c.createPanner(),
        lp = c.createBiquadFilter();
      s.buffer = b;
      s.loop = true;
      s.playbackRate.value = rate;
      g.gain.value = 0;
      pn.panningModel = 'equalpower';
      pn.distanceModel = 'inverse';
      pn.refDistance = 7 * this.dk;
      pn.maxDistance = 120 * this.dk;
      pn.rolloffFactor = 1.6;
      lp.type = 'lowpass';
      s.connect(g);
      g.connect(pn);
      pn.connect(lp);
      lp.connect(this.sfx);
      s.start(t, arnd() * b.duration);
      L = this.loopsAt[name] = { s, g, pn, lp, v: 0 };
    }
    L.seen = t;
    L.v = lerp(L.v, target, 0.2);
    L.g.gain.setTargetAtTime(L.v, t, 0.06);
    L.s.playbackRate.setTargetAtTime(rate, t, 0.1);
    if (L.pn.positionX) {
      L.pn.positionX.setTargetAtTime(pos.x, t, 0.03);
      L.pn.positionY.setTargetAtTime(pos.y, t, 0.03);
      L.pn.positionZ.setTargetAtTime(pos.z, t, 0.03);
    } else L.pn.setPosition(pos.x, pos.y, pos.z);
    L.lp.frequency.setTargetAtTime(clamp(16000 - (this.dist(pos) / this.dk) * 120, 1200, 16000), t, 0.05);
  },
  loopsAtTick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const k in this.loopsAt) {
      const L = this.loopsAt[k];
      if (t - L.seen < 0.12 && L.v > 0.01) continue;
      L.g.gain.setTargetAtTime(0, t, 0.08);
      if (t - L.seen > 0.6 || L.v <= 0.01) {
        try {
          L.s.stop(t + 0.3);
        } catch (e) {}
        delete this.loopsAt[k];
      }
    }
  },
  stopLoops() {
    for (const k in this.loops) {
      try {
        this.loops[k].s.stop();
      } catch (e) {}
    }
    this.loops = {};
    for (const k in this.loopsAt) {
      try {
        this.loopsAt[k].s.stop();
      } catch (e) {}
    }
    this.loopsAt = {};
    this.ambStop();
    this.setMuffle(0);
    this.hbT = 0;
  },
  // ---- 環境音：依地圖主題疊幾層循環（檔案或合成的風聲／海浪），淡入 ----
  ambNodes: [],
  ambKey: '',
  ambient(layers, key) {
    if (!this.ctx || !this.on || key === this.ambKey) return;
    this.ambStop();
    this.ambKey = key;
    const c = this.ctx;
    for (const L of layers) {
      const g = c.createGain();
      g.gain.value = L.v;
      g.connect(this.amb);
      const nodes = [g];
      if (L.k) {
        const b = this.buf[L.k];
        if (!b) continue;
        const s = c.createBufferSource();
        s.buffer = b;
        s.loop = true;
        // mp3 開頭與結尾的編碼補白略過（循環檔本身已交叉淡化）
        s.loopStart = Math.min(0.05, b.duration * 0.1);
        s.loopEnd = b.duration - Math.min(0.05, b.duration * 0.1);
        s.playbackRate.value = L.r || 1;
        s.connect(g);
        s.start(c.currentTime, s.loopStart + arnd() * b.duration * 0.5);
        nodes.push(s);
      } else nodes.push(...this.synthAmb(L.syn, g));
      this.ambNodes.push(nodes);
    }
    this.amb.gain.cancelScheduledValues(c.currentTime);
    this.amb.gain.setValueAtTime(0, c.currentTime);
    this.amb.gain.linearRampToValueAtTime(1, c.currentTime + 2.5);
  },
  ambStop() {
    if (!this.ctx) return;
    this.ambKey = '';
    for (const nodes of this.ambNodes)
      for (const n of nodes) {
        try {
          if (n.stop) n.stop();
          n.disconnect();
        } catch (e) {}
      }
    this.ambNodes = [];
  },
  // 合成環境音：wind／gust（帶通雜訊，中心頻率與音量慢慢飄）、sea（低通雜訊，音量像浪一樣起伏）
  synthAmb(kind, out) {
    const c = this.ctx,
      len = c.sampleRate * 3,
      b = c.createBuffer(1, len, c.sampleRate),
      d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.6 + (arnd() * 2 - 1) * 0.4; // 偏粉紅的雜訊
      d[i] = last;
    }
    // 頭尾交叉淡化，循環不會喀一聲
    const n = 4000;
    for (let i = 0; i < n; i++) d[len - n + i] = d[len - n + i] * (1 - i / n) + d[i] * (i / n);
    const s = c.createBufferSource();
    s.buffer = b;
    s.loop = true;
    s.loopStart = n / c.sampleRate;
    const f = c.createBiquadFilter();
    const g = c.createGain();
    const lfo = c.createOscillator(),
      lg = c.createGain(),
      lfo2 = c.createOscillator(),
      lg2 = c.createGain();
    if (kind === 'sea') {
      f.type = 'lowpass';
      f.frequency.value = 520;
      g.gain.value = 0.9;
      lfo.frequency.value = 0.11;
      lg.gain.value = 0.55;
      lfo.connect(lg).connect(g.gain);
      lfo2.frequency.value = 0.07;
      lg2.gain.value = 260;
      lfo2.connect(lg2).connect(f.frequency);
    } else {
      f.type = 'bandpass';
      f.frequency.value = kind === 'gust' ? 900 : 520;
      f.Q.value = 0.8;
      g.gain.value = 1.1;
      lfo.frequency.value = 0.09;
      lg.gain.value = kind === 'gust' ? 500 : 280;
      lfo.connect(lg).connect(f.frequency);
      lfo2.frequency.value = 0.13;
      lg2.gain.value = 0.45;
      lfo2.connect(lg2).connect(g.gain);
    }
    s.connect(f).connect(g).connect(out);
    s.start();
    lfo.start();
    lfo2.start();
    return [s, lfo, lfo2];
  },
  // ---- 低 AP：心跳與變悶（k 0～1，每格呼叫；越低越快） ----
  hbT: 0,
  heartbeat(k, dt) {
    this.setMuffle(k * 0.85);
    if (k <= 0) {
      this.hbT = 0;
      return;
    }
    this.hbT -= dt;
    if (this.hbT > 0) return;
    this.hbT = lerp(1.05, 0.55, k);
    this.tone(70, 40, 0.16, 0.9 * (0.5 + k * 0.5), 'sine', 'ui');
    this.tone(64, 38, 0.14, 0.6 * (0.5 + k * 0.5), 'sine', 'ui', 0.17);
  },
  // ---- 武器（recipes.js 的配方）----
  // kind＝種類、id＝武器零件 id、pos＝發射點、src＝開火的實體（自機＝不分位置、完整的層；多人時客機收到自己的那一槍也一樣）
  mgHeat: 0,
  mgT: 0,
  shot(kind, id, pos, src) {
    const own = src ? !!src.isPlayer : !pos;
    const P = own ? null : pos || null;
    const R = GUN[GUN_OF_ID[id] || GUN_OF_KIND[kind]];
    if (!R) {
      if (kind === 'blade') {
        this.play('boostUp', 0.6, 1.5, 0.1, 0.03, P);
        this.play('laser2', 0.3, 0.6, 0.06, 0.03, P);
        this.play('thrBurst', 0.3, 2.0, 0.1, 0.05, P);
      }
      return;
    }
    // 機槍連射越打越熱：音高慢慢往上
    let rk = 1;
    if (R === GUN.gatling || R === GUN.gatlingHvy) {
      const t = this.ctx ? this.ctx.currentTime : 0;
      this.mgHeat = t - this.mgT < 0.25 ? Math.min(24, this.mgHeat + 1) : 0;
      this.mgT = t;
      rk = 1 + this.mgHeat * 0.004;
    }
    const gap = R.gap || 0.025;
    const d = P ? this.dist(P) : 0;
    const dn = NEAR_D * this.dk,
      df = FAR_D * this.dk;
    const u = clamp((d - dn) / (df - dn), 0, 1);
    const th = !own && src && this.threatOf ? this.threatOf(src) : 1;
    const vk = own ? 1.1 : th > 1 ? 1.25 : 0.85;
    const o = {
      pr: own ? 3 : th,
      hp: own ? 0 : 120,
      send: (R.tail || 0.3) * (own ? 0.6 : 0.8 + u * 0.8),
      max: R.max || KEY_MAX,
    };
    // 近距離（自機、近的敵人）：near；遠的交叉淡化成 far（晚一點到：音速）
    let ok = false;
    if (u < 1) ok = this.layer(R.near, vk * (1 - u), rk, P, o, 0, 0.05, gap);
    if (u > 0)
      ok =
        this.layer(R.far, vk * (0.35 + 0.65 * u), rk, P, o, (Math.max(0, d - 60) / SND_V) * 0.5, 0.05, gap) ||
        ok;
    if (!ok) this.layer(R.fb, vk * (own ? 1 : 0.9), rk, P, o, 0, 0.06, gap);
    if (own) {
      this.layer(R.body, 1, rk, null, o, 0.004, 0.05, gap);
      this.layer(R.low, 1, 1, null, { pr: 3, max: 3 }, 0, 0.03, gap);
      this.layer(R.mech, 1, rk, null, o, 0.03, 0.08, 0.12); // 機械聲：最多每 0.12 秒一次
    } else if (u < 0.5 && R.body) this.layer(R.body, vk * 0.35 * (1 - u * 2), rk, P, o, 0.004, 0.05, gap);
  },
  charge(pos) {
    this.play('charge', 0.7, 1.0, 0.03, 0.2, pos);
    this.play('phUp', 0.35, 0.7, 0.03, 0.2, pos);
  },
  // EMP 的爆發（電磁脈衝、EMP 光束的命中）
  empBlast(pos, big) {
    this.play('~emp', big ? 0.9 : 0.6, big ? 0.85 : 1.1, 0.05, 0.08, pos, null, 0, { send: 0.4 });
    this.play('overload', 0.5, 1.2, 0.05, 0.08, pos);
    this.play(big ? 'wobble' : 'zap2', 0.5, 1, 0.05, 0.08, pos, null, 0.03);
  },
  // 爆炸（四層：瞬態＋本體＋回響＋碎屑）：false 小、true 大、'huge' Boss 等級（大的近距離時把其他聲音壓低）
  explode(big, pos) {
    const d = this.dist(pos);
    const far = d > 60 * this.dk;
    const dl = (Math.max(0, d - 60) / SND_V) * 0.5;
    if (big === 'huge') {
      this.play('explodeBig', 1.0, 0.8, 0.05, 0.03, pos, null, dl, { pr: 2.5, send: 0.9 });
      this.play('exHuge', 0.9, 0.85, 0.05, 0.05, pos, null, dl, { pr: 2.5, send: 0.6 });
      this.play('boom1', 1.0, 0.8, 0.05, 0.03, pos, null, dl);
      this.play('~thC', 1.0, 0.8, 0.03, 0.05, pos, null, dl, { pr: 2.5 });
      this.play('debris', 0.8, 0.8, 0.05, 0.03, pos, null, dl + 0.08);
      this.play('distant', 0.8, 0.8, 0.05, 0.03, pos, null, dl + 0.15, { send: 0.6 });
      this.pickPlay(['clatter1', 'clatter2'], 0.5, 0.7, pos);
      this.debrisRain(pos, 4, 0.35);
      this.duck(0.55, 0.7);
    } else if (big) {
      if (!far) this.pickPlay(['crunch1', 'crunch2', 'crunch3'], 0.7, 0.9, pos);
      this.play('explodeBig', 1.0, 0.95, 0.05, 0.03, pos, null, dl, { pr: 2, send: 0.7 });
      this.play('exA', far ? 0.5 : 0.8, 0.9, 0.06, 0.04, pos, null, dl, { send: 0.5 });
      this.play('boom2', 0.8, 1.0, 0.06, 0.05, pos, null, dl);
      if (!far) this.play('~thC', 0.8, 1, 0.04, 0.05, pos, null, 0, { pr: 2 });
      this.play('distant', 0.6, 1.0, 0.05, 0.03, pos, null, dl + 0.06, { send: 0.5 });
      this.debrisRain(pos, 2, 0.25);
      if (d < 30 * this.dk) this.duck(0.35, 0.35);
    } else {
      this.pickPlay(['explode', 'explode2', 'explode3'], 0.8, 1.05, pos);
      this.play('exMini', far ? 0.25 : 0.45, 1.15, 0.08, 0.04, pos, null, dl, { send: 0.45 });
      if (!far) {
        this.pickPlay(['crunch1', 'crunch2', 'crunch3'], 0.35, 1.3, pos, 0.1, 0.05);
        this.play('~thB', 0.45, 1.2, 0.05, 0.05, pos, null, 0, { max: 3 });
      }
    }
  },
  // 爆炸之後散在周圍的碎屑落下（金屬與石塊，0.3～0.9 秒後）
  debrisRain(pos, n, vol) {
    if (!pos || this.dist(pos) > 70 * this.dk) return;
    for (let i = 0; i < n; i++) {
      const p = { x: pos.x + (arnd() - 0.5) * 18, y: pos.y, z: pos.z + (arnd() - 0.5) * 18 };
      const k = this.pickKey(['mHit1', 'mHit3', 'mHit5', 'impStone', 'clink1', 'iron3']);
      if (k)
        this.play(k, vol * (0.6 + arnd() * 0.5), 0.6 + arnd() * 0.4, 0.1, 0.01, p, null, 0.3 + arnd() * 0.6, {
          max: 6,
          pr: 0.4,
        });
    }
  },
  // 擊破時的殘骸散落（爆炸之後）
  wreck(pos) {
    this.play('debris', 0.7, 1.0, 0.08, 0.05, pos, null, 0.05);
    this.pickPlay(['clatter1', 'clatter2'], 0.45, 0.9, pos, 0.1, 0.05);
    this.play('mHvy1', 0.5, 0.7, 0.08, 0.05, pos, null, 0.18);
    this.debrisRain(pos, 3, 0.35);
  },
  // 命中：依目標分類（t 是被打中的實體；自己被打中＝駕駛艙的悶響）
  hit(pos, t) {
    if (t && t.isPlayer) {
      this.pickPlay(['hit', 'hit2', 'hit3'], 0.55, 0.9, null);
      this.pickPlay(['punch1', 'punch2'], 0.55, 0.8, null, 0.08, 0.06);
      this.play('thud1', 0.4, 0.8, 0.08, 0.08);
      // 機殼的共鳴（Titanfall 2 的接觸式麥克風）：低沉的金屬
      this.play(this.pickKey(['mHvy1', 'mHvy2', 'mHvy3']) || 'thud2', 0.35, 0.75, 0.08, 0.07);
      return;
    }
    if (t && t.isProp) {
      this.pickPlay(['rock1', 'rock2'], 0.55, 1.0, pos, 0.1, 0.04);
      this.play(this.pickKey(['impStone']) || 'rock2', 0.3, 0.8, 0.1, 0.05, pos);
      return;
    }
    this.pickPlay(['hit', 'hit2', 'hit3'], 0.5, 1.0, pos);
    this.pickPlay(['armor1', 'armor2', 'armor3'], 0.45, 0.85, pos, 0.1, 0.04);
    const k = this.pickKey(['mHit1', 'mHit2', 'mHit3', 'mHit4']);
    if (k && this.dist(pos) < 50 * this.dk) this.play(k, 0.3, 0.75, 0.1, 0.03, pos, null, 0, { max: 5 });
  },
  // 子彈打到地形、建築：依地面材質（Game 的 surfAt）
  hitWorld(pos) {
    const surf = this.surfAt && pos ? this.surfAt(pos) : 'conc';
    if (surf === 'water') this.pickPlay(['splash', 'stepWet1', 'stepWet2'], 0.35, 1.2, pos, 0.12, 0.05);
    else if (surf === 'snow') this.pickPlay(['stepSnow1', 'stepSnow2'], 0.3, 1.3, pos, 0.12, 0.05);
    else if (surf === 'sand') this.pickPlay(['stepSnow1', 'stepSnow2'], 0.32, 0.8, pos, 0.12, 0.05);
    else if (surf === 'metal') {
      const k = this.pickKey(['mHit1', 'mHit2', 'mHit4', 'clink2']);
      this.play(k || 'armor2', 0.3, 1.1, 0.12, 0.05, pos, null, 0, { max: 5 });
    } else this.pickPlay(['rock1', 'rock2'], 0.28, 1.2, pos, 0.12, 0.06);
    // 硬的地面偶爾跳彈
    if ((surf === 'metal' || surf === 'conc' || surf === 'ice') && arnd() < 0.22) this.ricochet(pos);
  },
  ricochet(pos) {
    if (pos && this.dist(pos) > 45 * this.dk) return;
    const k = this.pickKey(['~ric1', '~ric2', '~ric3']);
    if (k) this.play(k, 0.28, 0.85 + arnd() * 0.4, 0.05, 0.12, pos, null, 0.01, { max: 2, pr: 0.6 });
  },
  // 子彈從身邊飛過（projectile.js：敵人的子彈離聽者最近的那一刻）；energy＝雷射、能量彈
  whiz(pos, energy) {
    const k = energy ? '~whizE' : this.pickKey(['~whizK1', '~whizK2']);
    if (k)
      this.play(k, energy ? 0.5 : 0.55, 0.85 + arnd() * 0.35, 0.05, 0.05, pos, null, 0, {
        max: 3,
        pr: 2,
        vr: 2,
      });
  },
  // 彈殼落地（機甲尺度：比真的低），surf＝地面材質
  casing(pos, big, surf) {
    if (pos && this.dist(pos) > 25 * this.dk) return;
    if (surf === 'water') return;
    const soft = surf === 'sand' || surf === 'snow';
    const k = this.pickKey(big ? ['~tink3', 'iron1', 'iron3'] : ['~tink1', '~tink2', 'iron2', 'iron4']);
    if (k)
      this.play(
        k,
        soft ? 0.12 : 0.22,
        (soft ? 0.6 : 1) * (0.9 + arnd() * 0.2),
        0.06,
        0.04,
        pos,
        null,
        0.35 + arnd() * 0.25,
        { max: 4, pr: 0.4 },
      );
  },
  hitShield(pos, big) {
    this.pickPlay(['plate1', 'plate2'], big ? 0.9 : 0.5, big ? 0.7 : 1.0, pos, 0.08, 0.04);
    const k = this.pickKey(['eHi2', 'eHi3']);
    if (k) this.play(k, big ? 0.35 : 0.2, 1.3, 0.08, 0.06, pos);
  },
  hitDome(pos) {
    this.pickPlay(['dome1', 'dome2'], 0.5, 1.4, pos, 0.1, 0.06);
    const k = this.pickKey(['eHi1', 'eHi3']);
    if (k) this.play(k, 0.25, 1.5, 0.08, 0.08, pos);
  },
  // 近戰的揮擊音（docs/melee-combo-design.md 的「打擊感改版」）：fam＝武器的音色（blade／saber／claw／pile／fist），
  // cat＝派生的種類（data/melee.js 的 meleeCat：n 連段、f 前、s 側、b 後（上挑）、a 空中、d 下劈、x 衝刺斬、e 處決、h 盾擊）
  meleeSwing(fam, cat, st, pos) {
    const P = (k, v, r, dl = 0) => this.play(k, v, r, 0.08, 0.02, pos, null, dl);
    switch (fam) {
      case 'saber':
        P('laserBig2', 0.35, 0.75);
        P('boostUp', 0.55, 1.15);
        if (this.buf.eMid1) P('eMid1', 0.3, 1.4);
        break;
      case 'claw':
        P('boostUp', 0.45, 1.9);
        P('crunch1', 0.22, 1.7);
        break;
      case 'pile':
        P('thrBurst', 0.5, 1.0);
        P('heavy', 0.3, 1.35);
        if (this.buf.servo3) P('servo3', 0.4, 0.7);
        break;
      case 'fist':
        P('boostUp', 0.5, 1.3);
        break;
      default:
        P('boostUp', 0.55, 1.5);
        P('laser2', 0.3, 0.65);
    }
    const own = !pos;
    switch (cat) {
      case 'f': // 前派生：短促、尖的突刺聲
        P('laser', 0.28, 1.8);
        P('thrBurst', 0.4, 2.5);
        if (own) this.noise(0.1, 3400, 0.5, 'bandpass', 'sfx', 2);
        break;
      case 's': // 側派生：拉長、轉一圈的風切聲
        P('boostUp', 0.45, 0.85, 0.12);
        P('thrBurst', 0.35, 1.2, 0.05);
        if (own) this.noise(0.42, 900, 0.55, 'bandpass', 'sfx', 1.5);
        break;
      case 'b': // 後派生（上挑）：往上爬的音
        P('charge', 0.32, 2.6);
        P('boostUp', 0.5, 2.1, 0.04);
        break;
      case 'a': // 空中：推進器噴一下
        P('thrBurst', 0.45, 1.5);
        P('laser2', 0.22, 1.25);
        break;
      case 'd': // 下劈：往下衝
        P('boostDown', 0.7, 0.9);
        P('thrBurst', 0.5, 0.85);
        break;
      case 'x': // 衝刺斬：推進器的爆發
        P('boostUp', 0.75, 1.0);
        P('thrBurst', 0.6, 1.3);
        if (own) this.noise(0.25, 600, 0.5, 'lowpass', 'sfx', 1);
        break;
      case 'e': // 處決
        P('charge', 0.5, 1.2);
        P('overload', 0.3, 1.4);
        break;
      case 'h': // 盾擊
        P('shield', 0.5, 1.4);
        P('thud1', 0.5, 0.9);
        break;
      default:
        P('thrBurst', 0.3, st && st.finisher ? 1.5 : 2.0);
    }
  },
  // 近戰命中：big＝終結技；cat／fam 同 meleeSwing；w＝重量（data/melee.js 的 meleeWeight，0 輕～3 極重）
  meleeHit(big, pos, cat, fam, w) {
    if (w === undefined) w = big ? 2 : 1;
    const P = (k, v, r, dl = 0) => this.play(k, v, r, 0.06, 0.02, pos, null, dl);
    this.pickPlay(['hit', 'hit2'], 0.9, 0.8, pos);
    switch (fam) {
      case 'saber':
        P('laserBig', 0.3, 1.7);
        P('armor1', 0.45, 0.95);
        if (this.buf.eLow1) P('eLow1', 0.35, 1.3);
        break;
      case 'claw':
        this.pickPlay(['crunch1', 'crunch2', 'crunch3'], 0.75, 1.1, pos);
        if (this.buf.grit) P('grit', 0.3, 1.2);
        break;
      case 'pile':
        P('heavy', 0.85, 0.9);
        P('armor3', 0.6, 0.8);
        if (this.buf.clashHvy) P('clashHvy', 0.55, 0.6);
        break;
      case 'fist':
        this.pickPlay(['punch1', 'punch2'], 1, 0.8, pos);
        P('thud2', 0.5, 0.9);
        break;
      default:
        this.pickPlay(['punch1', 'punch2'], 0.7, 0.85, pos);
        P('armor1', 0.4, 1.3);
    }
    // 刀刃砍進裝甲：金屬的撞擊（重的用低沉的）
    const mk = this.pickKey(w >= 2 ? ['mHvy1', 'mHvy2', 'mHvy3'] : ['mHit1', 'mHit3', 'mHit4']);
    if (mk) P(mk, 0.55, w >= 2 ? 0.7 : 0.85);
    switch (cat) {
      case 'f': // 突刺：貫穿
        P('armor2', 0.5, 1.5);
        break;
      case 's': // 迴旋：刮過裝甲
        P('plate1', 0.55, 1.2);
        if (this.buf.grit) P('grit', 0.35, 1.0, 0.02);
        break;
      case 'b': // 上挑：鏗一聲＋往上飛
        P('plate2', 0.5, 1.0);
        P('boostUp', 0.3, 2.4, 0.03);
        break;
      case 'd': // 下劈：砸進地面
        P('rock1', 0.7, 0.8);
        P('boom1', 0.7, 0.9);
        P('debris', 0.4, 1.0, 0.05);
        break;
      case 'x': // 衝刺斬：衝撞
        P('thud1', 0.7, 0.75);
        break;
      case 'h':
        P('shield', 0.6, 0.9);
        P('thud2', 0.6, 0.8);
        break;
    }
    if (w <= 0) P('explode3', 0.3, 1.6);
    else if (w === 1) P('explode3', 0.45, 1.4);
    else {
      P('explode2', w >= 3 ? 1 : 0.9, w >= 3 ? 0.75 : 0.9);
      P('boom2', w >= 3 ? 0.8 : 0.6, w >= 3 ? 0.85 : 1.1, 0.02);
      if (w >= 3) P('explodeBig', 0.4, 1.2, 0.03);
    }
    if (!pos)
      this.play(w >= 2 ? '~thC' : '~thB', w >= 2 ? 0.7 : 0.5, 1, 0.03, 0.05, null, null, 0, { pr: 3 });
  },
  // 刀刃互擊（彈刀、盾擋近戰）
  clash(pos, heavy) {
    const k = this.pickKey(heavy ? ['clashHvy', 'clash4'] : ['clash1', 'clash2', 'clash3', 'clash4']);
    if (k) this.play(k, 0.9, heavy ? 0.6 : 0.75, 0.06, 0.05, pos, null, 0, { pr: 2.5, send: 0.4 });
    this.play('plate2', 0.6, 0.7, 0.05, 0.05, pos);
    this.play(this.pickKey(['bing']) || 'bell', 0.35, 0.8, 0.04, 0.08, pos, null, 0.01);
  },
  // QB：預備（吸氣）→ 噴發（＋低頻）→ 收尾的嘶（docs/audio-design.md 第 3 期）
  qb(pos) {
    this.play('~qbPre', 0.4, 1, 0.08, 0.05, pos);
    this.play('boostUp', 0.8, 1.15, 0.08, 0.03, pos, null, 0.04);
    this.play('thrBurst', 0.55, 1.1, 0.08, 0.05, pos, null, 0.04);
    this.play('~thB', pos ? 0.35 : 0.55, 1.2, 0.05, 0.05, pos, null, 0.04);
    this.play('~jetTail', 0.35, 1, 0.08, 0.05, pos, null, 0.18);
  },
  jump(pos) {
    this.play('boostUp', 0.55, 0.9, 0.08, 0.2, pos);
    this.play('thrBurst', 0.3, 0.85, 0.08, 0.2, pos);
    this.play('~hiss', 0.25, 0.8, 0.08, 0.2, pos);
  },
  // 落地：依落下速度決定重量（v 0～1）
  land(pos, v = 0.5) {
    this.play('boostDown', 0.5, 1.1, 0.08, 0.2, pos);
    this.pickPlay(['thud1', 'thud2'], 0.4 + v * 0.6, 0.9 - v * 0.25, pos, 0.06, 0.15);
    if (v > 0.6) this.pickPlay(['plate1', 'plate2'], 0.35, 0.55, pos, 0.06, 0.15);
    this.play('~thC', 0.3 + v * 0.6, 1.15 - v * 0.3, 0.04, 0.15, pos);
    if (this.buf.mStomp && v > 0.4) this.play('mStomp', 0.25 + v * 0.3, 0.75, 0.06, 0.2, pos);
    this.play('~hissL', 0.2 + v * 0.25, 1, 0.06, 0.2, pos, null, 0.12);
  },
  // 腳步：surf＝地面材質，w＝機體重量（0 輕～1 重）；kind＝腳部類型（reverse 逆關節、quad 四足、其他二足）
  step(surf, w, pos, kind) {
    const r = 1.15 - w * 0.4;
    this.pickPlay(['thud1', 'thud2'], 0.32 + w * 0.3, r * 0.9, pos, 0.08, 0.05);
    const v = pos ? 0.5 : 0.35;
    // 機甲的踩踏（Barkovich 的機器人腳步、qubodup 的 stomp）＋超低頻
    const mk = this.pickKey(
      kind === 'reverse'
        ? ['mStep3', 'mStep4']
        : w > 0.7
          ? ['mStep1', 'mStep2', 'qStomp']
          : ['mStep1', 'mStep2', 'mStep3'],
    );
    if (mk)
      this.play(
        mk,
        (pos ? 0.35 : 0.28) * (0.7 + w * 0.6),
        (kind === 'reverse' ? 1.05 : 0.85) - w * 0.2,
        0.08,
        0.05,
        pos,
        null,
        0,
        { max: 3 },
      );
    this.play('~thD', (pos ? 0.3 : 0.4) * (0.6 + w), 1.1 - w * 0.45, 0.05, 0.05, pos, null, 0, { max: 3 });
    if (surf === 'water') this.pickPlay(['stepWet1', 'stepWet2', 'splash'], v * 1.3, r * 0.8, pos, 0.1, 0.05);
    else if (surf === 'snow') this.pickPlay(['stepSnow1', 'stepSnow2'], v * 1.1, r * 0.75, pos, 0.1, 0.05);
    else if (surf === 'sand') this.pickPlay(['stepSnow1', 'stepSnow2'], v * 0.8, r * 0.5, pos, 0.1, 0.05);
    else if (surf === 'metal')
      this.pickPlay(['armor1', 'armor2', 'armor3'], v * 0.45, r * 0.55, pos, 0.1, 0.05);
    else if (surf === 'ice')
      this.pickPlay(['stepConc1', 'stepConc2', 'stepConc3'], v, r * 1.1, pos, 0.1, 0.05);
    else this.pickPlay(['stepConc1', 'stepConc2', 'stepConc3'], v, r * 0.6, pos, 0.1, 0.05);
  },
  // 伺服馬達與液壓（第 3 期）：kind＝'turn' 轉身、'start' 起步、'stop' 急停、'aim' 舉槍；k＝強度 0～1
  servo(kind, pos, k = 1) {
    const sm = this.pickKey(['servo1', 'servo2', 'servo4', 'servo5', 'servo6']);
    const v = (pos ? 0.6 : 1) * k;
    if (kind === 'stop') {
      this.play('~servoD', 0.22 * v, 0.9, 0.06, 0.25, pos, null, 0, { max: 2, pr: 0.8 });
      this.play('~hiss', 0.22 * v, 1.1, 0.08, 0.25, pos, null, 0.05, { max: 2, pr: 0.6 });
    } else if (kind === 'aim') {
      this.play('~servoS', 0.14 * v, 1.2, 0.08, 0.2, pos, null, 0, { max: 2, pr: 0.6 });
    } else {
      this.play(kind === 'turn' ? '~servoU' : '~servoS', 0.2 * v, 0.95, 0.08, 0.22, pos, null, 0, {
        max: 2,
        pr: 0.7,
      });
      if (sm) this.play(sm, 0.16 * v, 0.7, 0.08, 0.3, pos, null, 0.02, { max: 2, pr: 0.6 });
    }
  },
  ab(pos) {
    this.play('~qbPre', 0.5, 0.7, 0.05, 0.3, pos);
    this.play('boostUp', 0.9, 0.75, 0.05, 0.3, pos, null, 0.06);
    this.play('thrBurst', 0.6, 0.7, 0.05, 0.3, pos, null, 0.06);
    this.play('~thC', 0.5, 1.2, 0.05, 0.3, pos, null, 0.06);
  },
  // 突擊推進結束：降頻的收尾
  abEnd(pos) {
    this.play('~jetTailL', 0.45, 0.9, 0.05, 0.3, pos);
    this.play('boostDown', 0.3, 0.7, 0.05, 0.3, pos);
  },
  stagger(pos) {
    this.play('overload', 0.9, 1.0, 0.04, 0.03, pos);
    this.play('stagger', 0.5, 0.9, 0.06, 0.03, pos);
    if (this.buf.wobble) this.play('wobble', 0.35, 1.3, 0.05, 0.1, pos);
  },
  // ---- 武器的狀態音（第 4 期；自機）----
  reloadStart(heavy) {
    this.play(heavy ? '~reloadH' : '~reload', 0.45, 1, 0.05, 0.2, null, 'ui');
  },
  empty() {
    this.play('~click', 0.5, 1, 0.05, 0.12, null, 'ui');
  },
  // EN 用完（推進器過熱）
  overheat() {
    this.play('~hissL', 0.5, 1.3, 0.05, 0.4, null, 'ui');
    this.play('uiErr', 0.3, 0.7, 0.03, 0.4, null, 'ui');
  },
  // ---- 回饋音（自己打出的效果，不分位置） ----
  // 打出失衡：低音重擊＋鐘聲＋碎裂＋上升的「叮」
  breakFx() {
    this.play('bell', 0.55, 0.75, 0.03, 0.1, null, 'ui');
    this.play('glass', 0.6, 0.8, 0.05, 0.1, null, 'ui');
    this.play('boom2', 0.55, 1.2, 0.05, 0.1);
    this.play('~thC', 0.6, 1.1, 0.03, 0.1, null, null, 0, { pr: 3 });
    this.tone(880, 1760, 0.18, 0.18, 'triangle', 'ui', 0.06);
  },
  // Boss 的 BREAK、Boss 擊破：一段短的配樂重音（stinger）
  stinger(big) {
    this.play(big ? '~stingL' : '~sting', big ? 0.75 : 0.6, 1, 0.01, 0.5, null, 'ui');
    this.play('~thC', 0.6, 0.8, 0.02, 0.5, null, 'ui');
    this.duckBgm(0.6, big ? 2.2 : 1.0);
  },
  // 邊閃邊打的加成打中（data/ranged.js 的位元）：清脆的金屬聲，反擊多一聲鐘
  rangedBonus(tags) {
    this.play('uiTick', 0.45, 1.5, 0.03, 0.07, null, 'ui');
    this.play('plate1', 0.35, 1.25, 0.05, 0.07, null, 'ui');
    if (tags & 2) this.play('bell', 0.3, 1.4, 0.02, 0.15, null, 'ui');
  },
  // 屬性反應（data/react.js）：過熱＝低沉的轟、爆裂＝鐘＋碎裂、干擾＝電子的嗶
  reaction(id) {
    if (id === 'hot') this.play('heavy', 0.5, 1.3, 0.05, 0.1, null, 'ui');
    else if (id === 'burst') this.play('bell', 0.45, 1.1, 0.03, 0.1, null, 'ui');
    else this.play('glitch', 0.5, 1.2, 0.05, 0.1, null, 'ui');
    this.play('uiTick', 0.4, 0.8, 0.02, 0.05, null, 'ui');
  },
  // 命中確認（自己打中，data/feel.js）：依武器種類的短音，重擊多一聲低音
  hitConfirm(type, heavy) {
    const r =
      type === 'shotgun'
        ? 0.85
        : type === 'laser'
          ? 1.6
          : type === 'shell' || type === 'grenade'
            ? 0.7
            : 1.25;
    this.play('uiTick', 0.22, r, 0.04, 0.045, null, 'ui');
    if (heavy) {
      this.play('thud1', 0.4, 1.1, 0.04, 0.08, null, 'ui');
      const k = this.pickKey(['mHit2', 'mHit4']);
      if (k) this.play(k, 0.22, 0.9, 0.05, 0.08, null, 'ui');
    }
  },
  // 打在弱點上（CRITICAL）：重一點的金屬碎裂
  crit() {
    this.play('glass', 0.35, 1.5, 0.05, 0.08, null, 'ui');
    this.play('plate2', 0.45, 0.9, 0.05, 0.08, null, 'ui');
  },
  // 擊破確認：連續擊破時音高一級級往上（n＝連擊數），精英／AC 多一聲重音並短暫壓低其他聲音
  killConfirm(n, big) {
    const st = Math.min(Math.max(0, n - 1), 9);
    const f = 660 * Math.pow(2, (st * 2) / 12);
    this.tone(f, f * 0.98, 0.22, 0.32, 'sine', 'ui');
    this.tone(f * 1.5, f * 1.49, 0.16, 0.16, 'triangle', 'ui', 0.04);
    this.play('uiTick', 0.5, 0.9 + st * 0.05, 0, 0.03, null, 'ui');
    this.play('~thB', 0.45, 0.9, 0.03, 0.05, null, 'ui');
    if (big) {
      this.play('bell', 0.7, 0.6, 0.02, 0.1, null, 'ui');
      this.play('boom1', 0.6, 1.0, 0.05, 0.1);
      this.play('~thC', 0.6, 0.85, 0.03, 0.1, null, 'ui', 0.02);
      this.duck(0.5, 0.45);
    }
  },
  // ---- 介面與通訊 ----
  // 按鈕（input.js 的全域監聽，在各按鈕自己的 SFX.ui() 之前）：依按鈕種類換聲音，之後的 SFX.ui() 不重複
  btnT: 0,
  uiBtn(kind) {
    if (!this.ctx) return;
    this.btnT = this.ctx.currentTime;
    this.ui(kind || 'click');
  },
  ui(kind) {
    if (!kind && this.ctx && this.ctx.currentTime - this.btnT < 0.1) return;
    if (kind === 'back') this.play('uiBack', 0.7, 1.0, 0.02, 0.03, null, 'ui');
    else if (kind === 'ok') this.play('uiOk', 0.55, 1.0, 0.02, 0.05, null, 'ui');
    else if (kind === 'err') this.play('uiErr', 0.6, 1.0, 0.02, 0.05, null, 'ui');
    else if (kind === 'tog') this.play('uiTog', 0.6, 1.0, 0.04, 0.03, null, 'ui');
    else if (kind === 'hover') this.play('uiTick', 0.22, 1.2, 0.05, 0.06, null, 'ui');
    else this.play('uiClick', 0.7, 1.0, 0.04, 0.03, null, 'ui');
  },
  kit() {
    this.play('ui2', 0.8, 1.0, 0.06, 0.03, null, 'ui');
    this.play('uiOpen', 0.4, 0.8, 0.03, 0.05, null, 'ui');
  },
  alert() {
    this.play('ui2', 0.6, 0.7, 0.06, 0.03, null, 'ui');
  },
  // 無線電開頭：雜訊＋嗶（通訊期間世界的聲音稍微壓低）
  radio() {
    this.noise(0.09, 2400, 0.35, 'bandpass', 'ui', 1.5);
    this.play('glitch', 0.35, 1.0, 0.1, 0.1, null, 'ui');
    this.tone(1320, 1320, 0.07, 0.25, 'square', 'ui', 0.08);
    this.duck(0.2, 1.2);
  },
  // 增援預告（pan：-1 左～1 右，依預告方向）；last＝最後一波
  waveAlert(pan, last) {
    if (!this.ctx || !this.on) return;
    const b = this.buf[last ? 'alarmBig' : 'alarm'];
    if (!b) return;
    const c = this.ctx,
      s = c.createBufferSource(),
      g = c.createGain();
    s.buffer = b;
    g.gain.value = last ? 0.55 : 0.45;
    s.connect(g);
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = clamp(pan, -1, 1) * 0.8;
      g.connect(p).connect(this.uiBus);
    } else g.connect(this.uiBus);
    s.start();
    if (last) this.play('boom1', 0.5, 0.7, 0.03, 0.2);
  },
  // 事件提示：出口開啟、開箱、拾取、Boss 第二型態、戰術模組、區域清除
  cue(kind) {
    if (kind === 'exit') {
      this.play('uiOpen', 0.6, 0.7, 0.02, 0.1, null, 'ui');
      this.play('dome1', 0.4, 0.9, 0.02, 0.1, null, 'ui');
    } else if (kind === 'cache') {
      this.play('doorOpen', 0.7, 0.8, 0.03, 0.1, null, 'ui');
      this.play('uiOk', 0.5, 1.2, 0.03, 0.1, null, 'ui', 0.15);
    } else if (kind === 'pickup') {
      this.play('uiOk', 0.5, 1.4, 0.03, 0.08, null, 'ui');
    } else if (kind === 'phase') {
      this.play('alarmBig', 0.45, 0.8, 0.02, 0.5, null, 'ui');
      this.play('boom1', 0.8, 0.7, 0.03, 0.5);
      this.stinger(false);
      this.duck(0.4, 0.8);
    } else if (kind === 'mod') {
      this.play('bong', 0.6, 0.8, 0.02, 0.2, null, 'ui');
      this.play('uiOpen', 0.5, 1.0, 0.02, 0.2, null, 'ui', 0.06);
    } else if (kind === 'clear') {
      this.tone(523, 523, 0.25, 0.3, 'triangle', 'ui');
      this.tone(784, 784, 0.4, 0.3, 'triangle', 'ui', 0.12);
    }
  },
  bomber(pos) {
    this.play('engineHi', 0.9, 0.6, 0, 0, pos);
    this.play('door', 0.6, 0.8, 0.06, 0.03, pos);
  },
  ally(pos) {
    this.play('door', 0.8, 1.0, 0.06, 0.03, pos);
    this.play('boostDown', 0.6, 0.8, 0.06, 0.03, pos);
  },
  // ---- 多人：高階呼叫的轉送 ----
  // 參數裡的 Vector3 → { v }、實體 → { e: id }、其他物件只留基本型別的欄位
  ser(a) {
    if (a === null || a === undefined || typeof a !== 'object') return a === undefined ? null : a;
    if (a.isVector3 || (a.x !== undefined && a.y !== undefined && a.z !== undefined && !a.pos))
      return { v: [+a.x.toFixed(1), +a.y.toFixed(1), +a.z.toFixed(1)] };
    if (a.id !== undefined && a.pos) return { e: a.id };
    const o = {};
    for (const k in a) if (typeof a[k] !== 'object' && typeof a[k] !== 'function') o[k] = a[k];
    return { o };
  },
  // 客機：收到的轉送（entById＝實體的查詢）
  netPlay(f, args, entById) {
    if (!Object.prototype.hasOwnProperty.call(NET_FNS, f) || !this[f]) return;
    const a = (args || []).map((x) =>
      x && typeof x === 'object'
        ? x.v
          ? new THREE.Vector3(x.v[0], x.v[1], x.v[2])
          : x.e !== undefined
            ? (entById && entById(x.e)) || null
            : x.o || null
        : x,
    );
    this.netDepth++;
    try {
      this[f](...a);
    } finally {
      this.netDepth--;
    }
  },
};

// 高階呼叫的包裝：房主呼叫時（有位置、不在別的高階呼叫裡）整個轉送一次，裡面的 play 不再個別轉送
for (const f in NET_FNS) {
  const fn = SFX[f],
    pi = NET_FNS[f];
  SFX[f] = function (...a) {
    if (this.mirrorCall && !this.netDepth && a[pi])
      this.mirrorCall(
        f,
        a.map((x) => this.ser(x)),
      );
    this.netDepth++;
    try {
      return fn.apply(this, a);
    } finally {
      this.netDepth--;
    }
  };
}
