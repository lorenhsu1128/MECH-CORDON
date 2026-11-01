// ============================================================
//  ECHO 的語音（docs/audio-design.md）：通訊、序章與章節畫面、過場動畫的字幕、駕駛艙的系統提示。
//  兩個聲音（VoxCPM2 產生，scripts/voice-gen.py）：設定 ctrl.voice＝gentle 溫柔知性／ai AI 系統感／off。
//  語音檔在 lib/voice-<聲音>.js（window.RUBICON_VOICE_<聲音>＝{ 鍵: base64 mp3 }），第一次要說話時只載入選的那個，
//  每句第一次播時才解碼。同一時間只說一句：優先度高的打斷低的（系統提示的「導彈接近」打斷通訊）。
//  音色：俯視與追尾＝輕微的無線電（帶通、一點點飽和），第一人稱＝駕駛艙內（乾淨）。多人各端依自己的設定播。
// ============================================================
import { Game } from './game.js';
import { SFX } from '../audio/audio.js';
import { vkey, echoQuote, VOICE_CUES, VOICE_IDS } from '../data/voice.js';

// 飽和的曲線（無線電的一點點破音）
let SAT = null;
function satCurve() {
  if (SAT) return SAT;
  SAT = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    SAT[i] = Math.tanh(x * 1.8) / Math.tanh(1.8);
  }
  return SAT;
}

Object.assign(Game.prototype, {
  // 目前的聲音（gentle／ai；關閉＝null）。舊設定的 on／comm 當成預設的溫柔知性
  voiceId() {
    const v = (this.ctrl && this.ctrl.voice) || VOICE_IDS[0];
    if (v === 'off') return null;
    return VOICE_IDS.includes(v) ? v : VOICE_IDS[0];
  },
  voiceOn() {
    return !!this.voiceId();
  },
  // 第一次要說話時以 <script> 載入 lib/voice-<聲音>.js（每個約 8 MB，不內嵌）
  voiceLoad(id = this.voiceId()) {
    if (!id) return Promise.resolve(false);
    const G = 'RUBICON_VOICE_' + id.toUpperCase();
    if (window[G]) return Promise.resolve(true);
    this.voiceLoading = this.voiceLoading || {};
    if (this.voiceLoading[id]) return this.voiceLoading[id];
    return (this.voiceLoading[id] = new Promise((res) => {
      const s = document.createElement('script');
      s.src = `lib/voice-${id}.js`;
      s.onload = () => res(!!window[G]);
      s.onerror = () => {
        this.voiceLoading[id] = null;
        res(false);
      };
      document.head.appendChild(s);
      setTimeout(() => res(!!window[G]), 15000);
    }));
  },
  // 鍵 → AudioBuffer（沒有這句的語音＝null）；換了聲音就清掉解碼過的
  async voiceBuf(key) {
    if (!SFX.ctx) return null;
    const id = this.voiceId();
    if (!id) return null;
    if (this.vbufId !== id) {
      this.vbuf = {};
      this.vbufId = id;
    }
    if (key in this.vbuf) return this.vbuf[key];
    if (!(await this.voiceLoad(id))) return null;
    if (this.vbufId !== id) return null;
    const b64 = window['RUBICON_VOICE_' + id.toUpperCase()][key];
    if (!b64) return (this.vbuf[key] = null);
    const b = await new Promise((res) => SFX.ctx.decodeAudioData(SFX.b64(b64), res, () => res(null)));
    // 解碼過的最多留 60 句（先解碼的先丟）
    const ks = Object.keys(this.vbuf);
    if (ks.length >= 60) delete this.vbuf[ks[0]];
    return (this.vbuf[key] = b);
  },
  // 播一句：回傳語音的長度（秒；沒有語音或被擋下＝0）。prio＝優先度（正在說的比較高就不播）
  async voicePlay(key, prio = 1, kind = 'comm') {
    if (!SFX.ctx || !SFX.on || !this.voiceOn(kind)) return 0;
    const tok = (this.voiceTok = (this.voiceTok || 0) + 1);
    const b = await this.voiceBuf(key);
    if (!b || tok !== this.voiceTok) return 0;
    const c = SFX.ctx,
      t = c.currentTime;
    const cur = this.voiceCur;
    if (cur && cur.end > t && cur.prio > prio) return 0;
    this.voiceHalt();
    const s = c.createBufferSource(),
      g = c.createGain();
    s.buffer = b;
    let head = s;
    if (!this.fp) {
      // 無線電：帶通＋一點點飽和（溫柔的聲音不要壓得太扁）
      const hp = c.createBiquadFilter(),
        lp = c.createBiquadFilter(),
        sh = c.createWaveShaper();
      hp.type = 'highpass';
      hp.frequency.value = 260;
      lp.type = 'lowpass';
      lp.frequency.value = 5200;
      sh.curve = satCurve();
      s.connect(hp).connect(sh).connect(lp);
      head = lp;
    } else {
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 110;
      s.connect(hp);
      head = hp;
    }
    head.connect(g);
    g.gain.value = 1;
    g.connect(SFX.voiceBus);
    s.start(t + 0.05);
    const dur = b.duration;
    this.voiceCur = { s, g, prio, end: t + 0.05 + dur };
    s.onended = () => {
      if (this.voiceCur && this.voiceCur.s === s) this.voiceCur = null;
    };
    // 說話時世界的聲音與配樂壓低
    SFX.duck(0.22, dur * 0.9);
    SFX.duckBgm(0.45, dur);
    return dur;
  },
  // 全部停掉（包括排好的下一句）
  voiceStop() {
    if (this.voiceSeqTo) for (const to of this.voiceSeqTo) clearTimeout(to);
    this.voiceSeqTo = [];
    this.voiceTok = (this.voiceTok || 0) + 1;
    this.voiceSeqN = (this.voiceSeqN || 0) + 1; // 解碼中的排程作廢
    this.voiceHalt();
  },
  // 停掉正在說的這一句
  voiceHalt() {
    const v = this.voiceCur;
    this.voiceCur = null;
    if (!v || !SFX.ctx) return;
    try {
      const t = SFX.ctx.currentTime;
      v.g.gain.setTargetAtTime(0, t, 0.03);
      v.s.stop(t + 0.15);
    } catch (e) {}
  },
  // 通訊的一句（comms.js 的 commNext）：ECHO 的台詞才有語音
  voiceSay(text) {
    return this.voicePlay(vkey(text), 2, 'comm');
  },
  // 系統提示（data/voice.js 的 VOICE_CUES）：每種有冷卻
  voiceCue(id) {
    const C = VOICE_CUES[id];
    if (!C || !this.voiceOn('sys') || this.cine) return;
    const now = performance.now() / 1000;
    this.voiceCd = this.voiceCd || {};
    if (C.cd && now - (this.voiceCd[id] || -999) < C.cd) return;
    this.voiceCd[id] = now;
    this.voicePlay('s_' + id, C.p, 'sys');
  },
  // 依序播幾句（增援預告：方向＋敵對 AC＋最後一波）
  async voiceSeq(ids, prio = 2) {
    const sq = this.voiceSeqN;
    for (const id of ids) {
      if (sq !== this.voiceSeqN) return;
      const d = await this.voicePlay('s_' + id, prio, 'sys');
      if (!d) return;
      this.voiceSeqTo = this.voiceSeqTo || [];
      await new Promise((r) => this.voiceSeqTo.push(setTimeout(r, d * 1000 + 120)));
    }
  },
  // 序章與章節畫面：ECHO 的句子在逐字顯示到那一行時開始唸（前一句沒唸完就接在後面）；total＝逐字的總秒數
  voiceStory(lines, total) {
    this.voiceStop();
    if (!this.voiceOn('comm')) return;
    const sq = this.voiceSeqN;
    const all = lines.reduce((a, l) => a + l.length, 0) || 1;
    let pos = 0,
      at = 0.6;
    const t0 = performance.now();
    for (const l of lines) {
      const q = echoQuote(l);
      const start = (pos / all) * (total || 0) + 0.3;
      pos += l.length;
      if (!q) continue;
      const key = vkey(q);
      at = Math.max(at, start);
      const when = at;
      this.voiceBuf(key).then((b) => {
        if (!b || sq !== this.voiceSeqN) return;
        const wait = Math.max(0, when * 1000 - (performance.now() - t0));
        this.voiceSeqTo = this.voiceSeqTo || [];
        this.voiceSeqTo.push(setTimeout(() => this.voicePlay(key, 2, 'comm'), wait));
      });
      // 估計長度：每秒約 4 個字（實際長度要解碼之後才知道，所以排程用估計值，播的時候照實際的）
      at += q.length / 4 + 0.5;
    }
  },
  // 設定畫面改語音音量時試聽一句
  voiceTest() {
    this.voicePlay('s_success', 9, 'comm');
  },
});
