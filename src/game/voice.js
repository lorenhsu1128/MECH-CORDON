// ============================================================
//  ECHO 的語音（docs/audio-design.md）：通訊、序章與章節畫面、過場動畫的字幕、駕駛艙的系統提示。
//  兩個聲音（VoxCPM2 產生，scripts/voice-gen.py）：設定 ctrl.voice＝gentle 溫柔知性／ai AI 系統感／off。
//  語音檔在 lib/voice-<聲音>.js（window.MECH_CORDON_VOICE_<聲音>＝{ 鍵: base64 mp3 }），第一次要說話時只載入選的那個，
//  每句第一次播時才解碼。同一時間只說一句：優先度高的打斷低的（系統提示的「導彈接近」打斷通訊）。
//  語言：設定 ctrl.voiceLang＝zh 中文／ja 日文（日文的聲音在 <聲音>_ja 資料夾；沒有日文的句子改唸中文）。
//  字幕：設定 ctrl.sub＝zh 繁體中文／ja 日文／off 不顯示（通訊框只留說話者，唸不出來的照樣顯示文字），ctrl.subSize 大小；
//  字幕跟著語音：語音開始播才顯示、顯示到唸完（通訊框、過場字幕、系統提示與敵兵喊話的字幕條 #subBar）。
//  音色：俯視與追尾＝輕微的無線電（帶通、一點點飽和），第一人稱＝駕駛艙內（乾淨）。多人各端依自己的設定播。
// ============================================================
import { lineExpr } from '../data/line-expr.js';
import { Game } from './game.js';
import { SFX } from '../audio/audio.js';
import {
  vkey,
  storyQuote,
  VOICE_CUES,
  cueKey,
  LINE_POOLS,
  VOICE_IDS,
  CAST_IDS,
  BARKS,
  GRUNTS,
  JA_DISP,
  SPEAKER_JA,
} from '../data/voice.js';
import { SPEAKERS } from '../data/story.js';
import { escHtml } from '../core/html.js';
import LINES_JA from '../assets/voice/lines-ja.json';

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

// 日文字幕的顯示寫法（lines-ja.json 是唸給 TTS 的寫法）
const jaDisp = (t) => JA_DISP.reduce((a, [x, y]) => a.split(x).join(y), t);

// 聲音資料夾 → 說話者（ECHO 的聲音資料夾是選的聲音名稱）
function folderSp(f) {
  const b = String(f || '').replace(/_ja$/, '');
  return CAST_IDS.includes(b) ? b : 'echo';
}

Object.assign(Game.prototype, {
  // ---------- 字幕 ----------
  // 字幕的語言：zh／ja／off
  subLang() {
    const v = this.ctrl && this.ctrl.sub;
    return v === 'ja' || v === 'off' ? v : 'zh';
  },
  // 台詞的字幕文字：日文時查翻譯（鍵＝中文台詞的 vkey；沒有翻譯的照中文）
  subText(text, sp = 'echo', key = null) {
    if (this.subLang() !== 'ja') return text;
    const L = LINES_JA[sp];
    const t = L && L[key || vkey(text)];
    return t ? jaDisp(t) : text;
  },
  // 說話者的名稱（日文字幕時換成日文的寫法）
  subName(sp, name) {
    return (this.subLang() === 'ja' && SPEAKER_JA[sp]) || name;
  },
  // 這句有沒有語音（lines-ja.json 收了所有產生過語音的台詞，鍵相同，所以拿它當索引；不用等語音包載入）
  voiceHas(text, sp = 'echo') {
    const L = LINES_JA[sp];
    return !!(this.voiceFolder(sp) && SFX.on && SFX.ctx && L && L[vkey(text)]);
  },
  // 字幕大小：body 的 data-sub（styles.css 的 --subK）
  subApply() {
    const z = this.ctrl && this.ctrl.subSize;
    document.body.dataset.sub = z === 's' || z === 'l' ? z : 'm';
  },
  // 畫面下方中央的字幕條（系統提示、敵兵喊話）：最多兩行，各自顯示到唸完；who＝echo／grunt；
  // ex＝表情（有立繪的角色在名字前面放小頭像，game/portrait-ui.js 的 ptFaceUrl）
  subBar(text, who, dur, ex) {
    if (this.subLang() === 'off' || !text) return;
    const el = document.getElementById('subBar');
    if (!el) return;
    const now = performance.now();
    const rows = (this.subRows = (this.subRows || []).filter((r) => r.until > now && r.text !== text));
    rows.push({ text, who, ex, until: now + (dur + 0.4) * 1000 });
    if (rows.length > 2) rows.shift();
    const draw = () => {
      const t = performance.now();
      this.subRows = (this.subRows || []).filter((r) => r.until > t);
      el.innerHTML = this.subRows
        .map((r) => {
          // 敵兵（grunt1～3＝三個聲音、各自的立繪）：名字一律「敵兵」、紅色
          const grunt = /^grunt/.test(r.who);
          const S = grunt ? { name: '敵兵', color: '#ff6b6b' } : SPEAKERS[r.who] || SPEAKERS.echo;
          const nm = r.who === 'echo' ? 'ECHO' : this.subName(grunt ? 'grunt' : r.who, S.name);
          const face = r.who !== 'grunt' && this.ptFaceUrl ? this.ptFaceUrl(r.who, r.ex, 28) : null;
          return `<p>${face ? `<img class="sbFace" src="${face}" alt="">` : ''}<b style="color:${S.color}">${escHtml(nm)}</b>${escHtml(r.text)}</p>`;
        })
        .join('');
      el.classList.toggle('on', this.subRows.length > 0);
      clearTimeout(this.subBarTo);
      if (this.subRows.length)
        this.subBarTo = setTimeout(draw, Math.max(50, Math.min(...this.subRows.map((r) => r.until)) - t));
    };
    this.ptFaceReady = () => this.subRows && this.subRows.length && draw(); // 小頭像畫好了：重畫一次
    draw();
  },
  subBarClear() {
    this.subRows = [];
    clearTimeout(this.subBarTo);
    const el = document.getElementById('subBar');
    if (el) el.classList.remove('on');
  },

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
    const G = 'MECH_CORDON_VOICE_' + id.toUpperCase();
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
    const b64 = (await this.voiceLoad(folder)) && window['MECH_CORDON_VOICE_' + folder.toUpperCase()][key];
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
    // 立繪的對口型（game/portrait-ui.js 的 voiceLevel）：分一路給量測音量
    const an = c.createAnalyser();
    an.fftSize = 512;
    g.connect(an);
    s.start(t + 0.05);
    const dur = b.duration;
    this.voiceCur = { s, g, an, prio, end: t + 0.05 + dur, sp: folderSp(folder) };
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
  // 洗牌輪流：同一組的 n 句整輪播完才重複，新的一輪第一句不會和上一句相同
  bagPick(name, n) {
    if (n <= 1) return 0;
    const B = (this.voiceBags = this.voiceBags || {});
    let b = B[name];
    if (!b || !b.q.length || b.n !== n) {
      const q = [...Array(n).keys()];
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q[i], q[j]] = [q[j], q[i]];
      }
      // pop 從尾端拿：新的一輪第一句（尾端）和上一句相同時跟開頭交換
      if (b && q[q.length - 1] === b.last) [q[0], q[q.length - 1]] = [q[q.length - 1], q[0]];
      b = B[name] = { q, n, last: b && b.last };
    }
    return (b.last = b.q.pop());
  },
  // 程式裡重複的台詞（data/voice.js 的 LINE_POOLS）：輪流挑一句（交給 commSay，語音以台詞的 vkey 找）
  poolLine(id) {
    const P = LINE_POOLS[id];
    return P ? P.t[this.bagPick('pool:' + id, P.t.length)] : '';
  },
  // 系統提示的一句：{ key 語音鍵, t 台詞 }（輪流換說法）
  cuePick(id) {
    const C = VOICE_CUES[id];
    const n = this.bagPick('cue:' + id, C.t.length);
    return { key: cueKey(id, n), t: C.t[n] };
  },
  // 播系統提示的一句；這個說法沒有語音檔時改唸第 0 句 → [秒數, 實際的鍵]
  async cueSay(id, key, prio) {
    const d = await this.voicePlay(key, prio, 'sys');
    const k0 = cueKey(id, 0);
    if (d || key === k0 || !this.voiceFolder() || (await this.voiceBuf(key))) return [d, key];
    return [await this.voicePlay(k0, prio, 'sys'), k0];
  },
  // 系統提示（data/voice.js 的 VOICE_CUES）：每種有冷卻、10 種說法輪流
  voiceCue(id) {
    const C = VOICE_CUES[id];
    if (!C || !this.voiceOn('sys') || this.cine) return;
    const now = performance.now() / 1000;
    this.voiceCd = this.voiceCd || {};
    if (C.cd && now - (this.voiceCd[id] || -999) < C.cd) return;
    this.voiceCd[id] = now;
    const { key, t } = this.cuePick(id);
    this.cueSay(id, key, C.p).then(
      ([d, k]) =>
        d &&
        this.subBar(this.subText(k === key ? t : C.t[0], 'echo', k), 'echo', d, lineExpr('', { cue: id }).e),
    );
  },
  // 依序播幾句（增援預告：方向＋敵對 AC＋最後一波）
  async voiceSeq(ids, prio = 2) {
    const sq = this.voiceSeqN;
    for (const id of ids) {
      if (sq !== this.voiceSeqN) return;
      if (!VOICE_CUES[id]) continue;
      const [d] = await this.cueSay(id, this.cuePick(id).key, prio);
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
    for (const [i, l] of lines.entries()) {
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
        this.voiceSeqTo.push(
          setTimeout(
            () =>
              this.voicePlay(key, 2, 'comm', f).then((d) => {
                // 劇情畫面：正在唸的那一行亮起來（字幕跟著語音）
                const p = d && document.querySelectorAll('#stLines p')[i];
                if (!p || sq !== this.voiceSeqN) return;
                p.classList.add('speaking');
                this.voiceSeqTo.push(setTimeout(() => p.classList.remove('speaking'), d * 1000 + 200));
              }),
            wait,
          ),
        );
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
    const n = this.bagPick('bark:' + ev, BARKS[ev].length);
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
    // 字幕：40 m 內的敵兵才顯示（遠的只聽得到聲音）
    const me = this.player;
    const m = /^b_([a-zA-Z]+)(\d+)$/.exec(k);
    if (m && me && !me.dead && pos && me.pos.distanceTo(pos) < 40 * (me.dk || 1) && BARKS[m[1]])
      this.subBar(this.subText(BARKS[m[1]][+m[2]], 'grunt', k), folder, b.duration, BARK_EXPR[m[1]]);
  },
});
// 喊話的表情（字幕條的小頭像，敵兵的立繪 grunt1～3）
const BARK_EXPR = {
  spot: 'surprised',
  search: 'think',
  attack: 'shout',
  hurt: 'panic',
  allyDown: 'shout',
  cmdDown: 'panic',
};
const BARK_CD = { spot: 5, search: 9, attack: 7, hurt: 4, allyDown: 5, cmdDown: 8 };
