// Game：主線的通訊（data/story.js 的 COMMS）——依事件與條件挑一則，台詞依序顯示在右下角（不暫停遊戲），
// 播過的寫進存檔的通訊紀錄。也用在失敗畫面與機庫。
import { revealDom, revealFinish } from '../render/textfx.js';
import { SFX } from '../audio/audio.js';
import { COMMS, SPEAKERS, speakerBadge } from '../data/story.js';
import { escHtml } from '../core/html.js';
import { Game } from './game.js';

const COND = [
  'sid',
  'seg',
  'type',
  'theme',
  'chapter',
  'fails',
  'killedBy',
  'cycle',
  'ace',
  'pick',
  'c2',
  'c4',
  'prevC2',
  'prevC4',
  'prevEnd',
  'truth',
  'wing', // 僚機（game/wing.js）
  'bondHi', // 僚機的好感度高
];
const PREV = ['prevC2', 'prevC4', 'prevEnd'];
const keyOf = (e) => e.event + '|' + e.lines[0][1];

Object.assign(Game.prototype, {
  // 找出符合的通訊：條件全部成立；once 的播過就跳過；條件越多越優先（同分隨機）
  commPick(event, ctx = {}) {
    const st = this.save.story || {};
    const seen = new Set(st.seen || []);
    const ok = (e) => {
      if (e.event !== event) return false;
      if (e.once && seen.has(keyOf(e))) return false;
      for (const k of COND) {
        if (e[k] === undefined) continue;
        const v = ctx[k];
        if (k === 'fails') {
          if (!(v >= e.fails)) return false;
        } else if (k === 'killedBy') {
          if (!v || !String(v).includes(e.killedBy)) return false;
        } else if (v !== e[k]) return false;
      }
      return true;
    };
    const cand = COMMS.filter(ok);
    if (!cand.length) return null;
    // 依上一周目的抉擇（prev*）比一般的周目台詞優先，但不蓋過第 3 周目真結局的條件
    const score = (e) =>
      COND.filter((k) => e[k] !== undefined).length +
      PREV.filter((k) => e[k] !== undefined).length * 0.75 +
      (e.once ? 0.5 : 0);
    const best = Math.max(...cand.map(score));
    const top = cand.filter((e) => score(e) === best);
    return top[Math.floor(Math.random() * top.length)];
  },
  // 觸發事件：挑一則、記錄、排進右下角的播放佇列（show＝false 時只記錄並回傳，失敗畫面自己顯示）
  campComm(event, ctx = {}, show = true) {
    const e = this.commPick(event, ctx);
    if (!e) return null;
    const st = this.save.story || (this.save.story = {});
    st.seen = st.seen || [];
    const k = keyOf(e);
    if (!st.seen.includes(k)) st.seen.push(k);
    st.log = st.log || [];
    for (const [sp, text] of e.lines) st.log.push({ sp, text, sid: ctx.sid || '', t: Date.now() });
    if (st.log.length > 200) st.log = st.log.slice(-200);
    this.writeSave();
    if (show) {
      this.commQ = (this.commQ || []).concat(e.lines);
      if (!this.commBusy) this.commNext();
    }
    return e;
  },
  // 播放下一句：顯示時間依台詞長度
  commNext() {
    const el = document.getElementById('comm');
    if (!el) return;
    const q = this.commQ || [];
    const ln = q.shift();
    if (!ln) {
      this.commBusy = false;
      el.classList.remove('on');
      return;
    }
    this.commBusy = true;
    this.commPlace();
    const [sp, text, nm] = ln;
    const S0 = SPEAKERS[sp] || SPEAKERS.echo;
    const S = nm ? { ...S0, name: nm } : S0; // 自訂關卡的自訂名字
    const fx = this.textfx && this.textfx.on;
    const rival = /宿敵/.test(S.note || '');
    // 字幕（game/voice.js）：語言依設定；「不顯示」時只留說話者（唸不出來的照樣顯示文字）
    const sub = this.subLang ? this.subLang() : 'zh';
    const shown = this.subText ? this.subText(text, sp) : text;
    const name = this.subName ? this.subName(sp, S.name) : S.name;
    el.innerHTML = `${speakerBadge(sp)}<div><b style="color:${S.color}">${escHtml(name)}</b><span><p>${escHtml(shown)}</p></span></div>`;
    el.classList.toggle('echo', fx && sp === 'echo');
    el.classList.toggle('rival', fx && rival);
    el.style.borderLeftColor = fx && S.faction ? S.color : '';
    el.classList.add('on');
    SFX.radio();
    let show = 1.8 + text.length * 0.09;
    this.commCur = ln;
    // 文字演出：預告「打字機」的逐字（沒有語音＝最多花顯示時間的 45%；有語音＝語音開始時才開始、花唸的時間的 80%）
    const span = el.querySelector('span');
    let shownYet = false;
    const reveal = (limit) => {
      if (shownYet || this.commCur !== ln) return;
      shownYet = true;
      span.style.visibility = '';
      el.classList.remove('subOff');
      this.commTypeEnd = fx ? performance.now() + revealDom(span, 'comm', { limit }) * 1000 : 0;
    };
    this.commTypeEnd = 0;
    clearTimeout(this.commRevealTo);
    // 角色的語音（game/voice.js）：解碼完開始唸時字幕才出現，顯示時間至少到唸完
    const voiced = !!(this.voiceHas && this.voiceHas(text, sp));
    this.commWait = voiced ? reveal : null; // 等語音的時候點一下＝整句顯示
    if (voiced) {
      span.style.visibility = 'hidden';
      el.classList.toggle('subOff', sub === 'off');
      const t0 = performance.now();
      this.voiceSay(text, sp).then((d) => {
        if (this.commCur !== ln) return;
        if (!d) return reveal(show * 0.45); // 沒有這句的語音：照舊顯示文字
        if (sub !== 'off') reveal(Math.max(0.3, d * 0.8));
        const need = d + 0.6;
        if (need <= show) return;
        show = need;
        clearTimeout(this.commTo);
        this.commTo = setTimeout(() => this.commNext(), Math.max(0, need * 1000 - (performance.now() - t0)));
      });
      // 語音包還在載入（第一次）：等太久就先顯示文字
      if (sub !== 'off') this.commRevealTo = setTimeout(() => reveal(show * 0.45), 1500);
    } else reveal(show * 0.45);
    clearTimeout(this.commTo);
    this.commTo = setTimeout(() => this.commNext(), show * 1000);
  },
  // 即時的一句（增援預告等）：插到最前面立刻顯示，不寫進通訊紀錄
  commSay(sp, text, name) {
    this.commQ = [[sp, text, name || '']].concat(this.commQ || []);
    this.commNext();
  },
  // 位置：任務中＝右下角（觸控時下方中央，styles.css），選單畫面與暫停＝右上角
  commPlace() {
    const el = document.getElementById('comm');
    if (el) el.classList.toggle('menu', this.state !== 'play');
  },
  // 點一下：直接換下一句
  commTap() {
    if (!this.commBusy) return;
    // 還在等語音開始：整句顯示（「不顯示」字幕時照常換下一句）
    const sp = document.querySelector('#comm span');
    if (this.commWait && sp && sp.style.visibility === 'hidden' && this.subLang() !== 'off') {
      this.commWait(0.01);
      this.commWait = null;
      this.commTypeEnd = 0;
      return revealFinish(sp);
    }
    if (this.commTypeEnd > performance.now()) {
      this.commTypeEnd = 0;
      return revealFinish(document.querySelector('#comm span'));
    }
    clearTimeout(this.commTo);
    if (this.voiceStop) this.voiceStop();
    this.commNext();
  },
  commClear() {
    clearTimeout(this.commTo);
    clearTimeout(this.commRevealTo);
    if (this.voiceStop) this.voiceStop();
    this.commQ = [];
    this.commBusy = false;
    const el = document.getElementById('comm');
    if (el) el.classList.remove('on');
  },
});
