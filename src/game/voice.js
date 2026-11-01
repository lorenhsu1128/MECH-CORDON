// ============================================================
//  ECHO 的語音（docs/audio-design.md）：通訊、序章與章節畫面、過場動畫的字幕、駕駛艙的系統提示。
//  兩個聲音（VoxCPM2 產生，scripts/voice-gen.py）：設定 ctrl.voice＝gentle 溫柔知性／ai AI 系統感／off。
//  語音檔在 lib/voice-<聲音>.js（window.RUBICON_VOICE_<聲音>＝{ 鍵: base64 mp3 }），第一次要說話時只載入選的那個，
//  每句第一次播時才解碼。同一時間只說一句：優先度高的打斷低的（系統提示的「導彈接近」打斷通訊）。
//  語言：設定 ctrl.voiceLang＝zh 中文／ja 日文（日文的聲音在 <聲音>_ja 資料夾；沒有日文的句子改唸中文）。
//  音色：俯視與追尾＝輕微的無線電（帶通、一點點飽和），第一人稱＝駕駛艙內（乾淨）。多人各端依自己的設定播。
// ============================================================
import { Game } from './game.js';
import { SFX } from '../audio/audio.js';
import { vkey, storyQuote, VOICE_CUES, VOICE_IDS, CAST_IDS, BARKS, GRUNTS } from '../data/voice.js';

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
  // 語音的語言 → 資料夾的後綴（日文＝_ja）
  voiceSuf() {
    return this.ctrl && this.ctrl.voiceLang === 'ja' ? '_ja' : '';
  },
  // 說話者 → 聲音資料夾（ECHO＝設定選的聲音；其他角色在 CAST_IDS 裡、設定 ctrl.voiceCast 沒關時＝說話者 id）＋語言的後綴
  voiceFolder(sp = 'echo') {
    if (sp === 'echo') {
      const v = this.voiceId();
      return v && v + this.voiceSuf();
    }
    if (!CAST_IDS.includes(sp) || (this.ctrl && this.ctrl.voiceCast === 'off')) return null;
    return sp + this.voiceSuf();
  },
  // 第一次要說話時以 <script> 載入 lib/voice-<聲音>.js（ECHO 約 11 MB、其他角色 0.1～1.5 MB，不內嵌）
  voiceLoad(id = this.voiceFolder()) {
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
  // 鍵 → AudioBuffer（沒有這句的語音＝null）；folder＝聲音資料夾（預設＝ECHO 目前的聲音）
  async voiceBuf(key, folder = this.voiceFolder()) {
    if (!SFX.ctx || !folder) return null;
    this.vbuf = this.vbuf || {};
    this.vbufId = folder;
    const ck = folder + '/' + key;
    if (ck in this.vbuf) return this.vbuf[ck];
    // 日文的聲音沒有這句（還沒翻譯、載不到）時改唸中文
    const zh = folder.endsWith('_ja') ? folder.slice(0, -3) : null;
    const b64 = (await this.voiceLoad(folder)) && window['RUBICON_VOICE_' + folder.toUpperCase()][key];
    if (!b64) return (this.vbuf[ck] = zh ? await this.voiceBuf(key, zh) : null);
    const b = await new Promise((res) => SFX.ctx.decodeAudioData(SFX.b64(b64), res, () => res(null)));
    // 解碼過的最多留 80 句（先解碼的先丟）
    const ks = Object.keys(this.vbuf);
    if (ks.length >= 80) delete this.vbuf[ks[0]];
    return (this.vbuf[ck] = b);
  },
  // 播一句：回傳語音的長度（秒；沒有語音或被擋下＝0）。prio＝優先度（正在說的比較高就不播）；folder＝聲音資料夾
  async voicePlay(key, prio = 1, kind = 'comm', folder = this.voiceFolder()) {
    if (!SFX.ctx || !SFX.on || !folder) return 0;
    const tok = (this.voiceTok = (this.voiceTok || 0) + 1);
    const b = await this.voiceBuf(key, folder);
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
  // 通訊、過場字幕的一句（comms.js 的 commNext、cine.js 的 cineSub）：sp＝說話者（沒有語音的角色＝0）
  voiceSay(text, sp = 'echo') {
    const f = this.voiceFolder(sp);
    return f ? this.voicePlay(vkey(text), 2, 'comm', f) : Promise.resolve(0);
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
  // 序章與章節畫面：角色的句子在逐字顯示到那一行時開始唸（前一句沒唸完就接在後面）；total＝逐字的總秒數
  voiceStory(lines, total) {
    this.voiceStop();
    const sq = this.voiceSeqN;
    const all = lines.reduce((a, l) => a + l.length, 0) || 1;
    let pos = 0,
      at = 0.6;
    const t0 = performance.now();
    for (const l of lines) {
      const r = storyQuote(l);
      const start = (pos / all) * (total || 0) + 0.3;
      pos += l.length;
      const f = r && this.voiceFolder(r.sp);
      if (!f) continue;
      const q = r.q;
      const key = vkey(q);
      at = Math.max(at, start);
      const when = at;
      this.voiceBuf(key, f).then((b) => {
        if (!b || sq !== this.voiceSeqN) return;
        const wait = Math.max(0, when * 1000 - (performance.now() - t0));
        this.voiceSeqTo = this.voiceSeqTo || [];
        this.voiceSeqTo.push(setTimeout(() => this.voicePlay(key, 2, 'comm', f), wait));
      });
      // 估計長度：每秒約 4 個字（實際長度要解碼之後才知道，所以排程用估計值，播的時候照實際的）
      at += q.length / 4 + 0.5;
    }
  },
  // 設定畫面改語音音量時試聽一句
  voiceTest() {
    this.voicePlay('s_success', 9, 'comm');
  },

  // ---------- 敵兵的無線電喊話（data/voice.js 的 BARKS） ----------
  // 房主／單機在 AI 的事件呼叫（察覺、搜索、拿到攻擊權杖、受傷、同伴被擊毀、指揮官倒下）；
  // 冷卻與距離在這裡判斷，SFX.bark 是 NET_FNS 的高階呼叫（客機照自己的距離重播），播放由 barkPlay（SFX.barkSrc）。
  barkSay(e, ev) {
    if (!e || e.dead || this.isClient || this.lab || this.cine || this.range || this.tut || !BARKS[ev])
      return;
    if (e.team !== 'enemy' || e.isBoss || e.isElite || e.ace || e.ai === 'part' || e.flying) return;
    if (!(e.stats && e.stats.parts && e.stats.parts.legs)) return; // 有腳的機體（MT、AC）才有駕駛員
    const L = this.player && !this.player.dead ? this.player : null;
    if (L && e.pos.distanceTo(L.pos) > 70 * e.dk) return;
    const now = this.time || 0;
    const cd = (this.barkCd = this.barkCd || { all: -9 });
    const big = ev === 'cmdDown' || ev === 'allyDown';
    if (now - cd.all < (big ? 1.2 : 3.5) || now - (cd[ev] || -99) < BARK_CD[ev]) return;
    if (now - (e.barkT || -99) < 6) return;
    cd.all = cd[ev] = e.barkT = now;
    const n = Math.floor(Math.random() * BARKS[ev].length);
    SFX.bark(`${GRUNTS[e.id % GRUNTS.length]}/b_${ev}${n}`, e.center ? e.center() : e.pos);
  },
  // 同伴被擊毀：附近 40 m 內最近的敵兵喊
  barkAllyDown(e) {
    let best = null,
      bd = 40 * (e.dk || 1);
    for (const o of this.enemies || []) {
      if (o === e || o.dead) continue;
      const d = o.pos.distanceTo(e.pos);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    if (best) this.barkSay(best, 'allyDown');
  },
  // SFX.barkSrc：載入那個敵兵的聲音、解碼後在位置上播（設定 ctrl.barks 'off'＝不播）
  async barkPlay(key, pos) {
    if ((this.ctrl && this.ctrl.barks === 'off') || !SFX.ctx || !SFX.on) return;
    const [folder, k] = key.split('/');
    const b = await this.voiceBuf(k, folder + this.voiceSuf());
    if (!b) return;
    SFX.barkPlay(b, pos);
  },
});
const BARK_CD = { spot: 5, search: 9, attack: 7, hurt: 4, allyDown: 5, cmdDown: 8 };
