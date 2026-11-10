// Game：ECHO 的語音試聽（標題的「ECHO 語音試聽」，docs/audio-design.md 的語音重做）。
// 候選聲音（VoxCPM2 的聲音設計：6 種類型 × 3 個）× 試聽台詞的格子，scripts/voice-audition.py 產生，
// 建置成 lib/voice-audition.js（window.MECH_CORDON_VOICE_AUD＝{ '@index': 說明, '<候選>-<台詞>': base64 mp3 }），
// 打開這個畫面時才載入。音色可以切換原音／駕駛艙／無線電；評分與備註存在 localStorage mech_cordon_voice_aud，
// 「複製評分」把結果整理成文字（貼給開發者決定 ECHO 用哪個聲音）。不寫存檔。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const KEY = 'mech_cordon_voice_aud';
const FX_NAMES = { raw: '原音', cockpit: '駕駛艙', radio: '無線電' };

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
function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch (e) {
    return {};
  }
}

Object.assign(Game.prototype, {
  openVoiceLab() {
    SFX.ui();
    SFX.init();
    this.state = 'voicelab';
    this.showScreen('voiceLab');
    const V = (this.vlab = this.vlab || { fx: 'radio', buf: {}, notes: loadNotes() });
    $('btnVlBack').onclick = () => {
      SFX.ui('back');
      this.vlabStop();
      this.state = 'title';
      this.showScreen('title');
    };
    if (V.idx) return this.vlabRender();
    $('vlList').innerHTML = '<p class="dim">載入試聽音檔…</p>';
    this.vlabLoad().then((ok) => {
      if (this.state !== 'voicelab') return;
      if (!ok) {
        $('vlList').innerHTML =
          '<p class="dim">找不到試聽音檔（lib/voice-audition.js）。用 scripts/voice-audition.py 產生後重新建置。</p>';
        return;
      }
      V.idx = window.MECH_CORDON_VOICE_AUD['@index'];
      this.vlabRender();
    });
  },
  vlabLoad() {
    if (window.MECH_CORDON_VOICE_AUD) return Promise.resolve(true);
    if (this.vlabLoading) return this.vlabLoading;
    return (this.vlabLoading = new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'lib/voice-audition.js';
      s.onload = () => res(!!window.MECH_CORDON_VOICE_AUD);
      s.onerror = () => {
        this.vlabLoading = null;
        res(false);
      };
      document.head.appendChild(s);
    }));
  },
  vlabRender() {
    const V = this.vlab,
      I = V.idx;
    let h = `<div class="row" id="vlOpts"><label>音色 <select id="vlFx">${Object.keys(FX_NAMES)
      .map((k) => `<option value="${k}"${k === V.fx ? ' selected' : ''}>${FX_NAMES[k]}</option>`)
      .join('')}</select></label>
      <label>同一句比較 <select id="vlLineSel">${I.lines
        .map((l, i) => `<option value="${l.id}">${i + 1}. ${escHtml(l.tag)}</option>`)
        .join('')}</select></label>
      <button id="vlCmpAll" title="依序播放所有候選的這一句">全部候選依序播放</button>
      <button id="vlStop">停止</button>
      <button id="vlCopy" title="把評分與備註整理成文字並複製">複製評分</button></div>`;
    h += '<ol class="vlLines">';
    for (const l of I.lines)
      h += `<li><b>${escHtml(l.tag)}</b>　${escHtml(l.text)}${l.style ? ` <span class="dim">（${escHtml(l.style)}）</span>` : ''}</li>`;
    h += '</ol>';
    for (const t of I.types) {
      h += `<h3>${escHtml(t.name)}</h3><p class="dim vlDesc">${escHtml(t.desc)}</p>`;
      for (const c of I.cands.filter((c) => c.type === t.id)) {
        const n = V.notes[c.id] || {};
        h += `<div class="vlCand" data-c="${c.id}"><span class="vlName">${escHtml(t.name)} #${c.n}</span><span class="vlBtns">`;
        I.lines.forEach((l, i) => {
          h += `<button data-p="${c.id}-${l.id}" title="${escHtml(l.text)}">${i + 1}</button>`;
        });
        h += `<button data-all="${c.id}" title="依序播放全部台詞">全部</button></span>
          <select data-r="${c.id}" title="評分">${['', '1', '2', '3', '4', '5']
            .map(
              (s) =>
                `<option value="${s}"${String(n.r || '') === s ? ' selected' : ''}>${s ? '★'.repeat(+s) : '評分'}</option>`,
            )
            .join('')}</select>
          <input data-n="${c.id}" placeholder="備註" value="${escHtml(n.t || '')}" /></div>`;
      }
    }
    $('vlList').innerHTML = h;
    $('vlFx').onchange = (e) => (V.fx = e.target.value);
    $('vlStop').onclick = () => this.vlabStop();
    $('vlCmpAll').onclick = () => {
      const lid = $('vlLineSel').value;
      this.vlabSeq(I.cands.map((c) => `${c.id}-${lid}`));
    };
    $('vlCopy').onclick = () => this.vlabCopy();
    for (const b of $('vlList').querySelectorAll('button[data-p]'))
      b.onclick = () => this.vlabSeq([b.dataset.p]);
    for (const b of $('vlList').querySelectorAll('button[data-all]'))
      b.onclick = () => this.vlabSeq(I.lines.map((l) => `${b.dataset.all}-${l.id}`));
    for (const s of $('vlList').querySelectorAll('select[data-r]'))
      s.onchange = () => this.vlabNote(s.dataset.r, 'r', s.value);
    for (const s of $('vlList').querySelectorAll('input[data-n]'))
      s.onchange = () => this.vlabNote(s.dataset.n, 't', s.value.trim());
  },
  vlabNote(id, k, v) {
    const N = this.vlab.notes;
    N[id] = N[id] || {};
    N[id][k] = v;
    try {
      localStorage.setItem(KEY, JSON.stringify(N));
    } catch (e) {}
  },
  vlabCopy() {
    const V = this.vlab,
      I = V.idx;
    const rows = [];
    for (const c of I.cands) {
      const n = V.notes[c.id];
      if (!n || (!n.r && !n.t)) continue;
      const t = I.types.find((t) => t.id === c.type);
      rows.push(`${t.name} #${c.n}（${c.id}）：${n.r ? n.r + ' 星' : '未評分'}${n.t ? '｜' + n.t : ''}`);
    }
    const txt = rows.length ? 'ECHO 語音試聽評分\n' + rows.join('\n') : '還沒有評分';
    const done = () => ($('vlOut').textContent = '已複製到剪貼簿：\n' + txt);
    $('vlOut').textContent = txt;
    if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done, () => {});
  },
  async vlabBuf(key) {
    const V = this.vlab;
    if (key in V.buf) return V.buf[key];
    const b64 = window.MECH_CORDON_VOICE_AUD && window.MECH_CORDON_VOICE_AUD[key];
    if (!b64 || !SFX.ctx) return null;
    const b = await new Promise((res) => SFX.ctx.decodeAudioData(SFX.b64(b64), res, () => res(null)));
    return (V.buf[key] = b);
  },
  // 依序播放幾個片段（新的播放取代舊的）
  async vlabSeq(keys) {
    this.vlabStop();
    const tok = this.vlab.tok;
    for (const k of keys) {
      const b = await this.vlabBuf(k);
      if (tok !== this.vlab.tok || this.state !== 'voicelab') return;
      if (!b) continue;
      this.vlabMark(k);
      await this.vlabPlay(b);
      if (tok !== this.vlab.tok) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (tok === this.vlab.tok) this.vlabMark(null);
  },
  vlabMark(k) {
    for (const b of $('vlList').querySelectorAll('button.on')) b.classList.remove('on');
    if (!k) return;
    const b = $('vlList').querySelector(`button[data-p="${k}"]`);
    if (b) b.classList.add('on');
  },
  vlabPlay(b) {
    const c = SFX.ctx,
      V = this.vlab;
    if (c.state === 'suspended') c.resume();
    const s = c.createBufferSource(),
      g = c.createGain();
    s.buffer = b;
    let head = s;
    if (V.fx === 'radio') {
      // 無線電：帶通＋一點點飽和（和舊版 game/voice.js 相同）
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
    } else if (V.fx === 'cockpit') {
      // 駕駛艙：低頻乾淨一點，加一點很短的金屬空間感
      const hp = c.createBiquadFilter(),
        d = c.createDelay(),
        fb = c.createGain(),
        wet = c.createGain();
      hp.type = 'highpass';
      hp.frequency.value = 110;
      d.delayTime.value = 0.018;
      fb.gain.value = 0.35;
      wet.gain.value = 0.18;
      s.connect(hp);
      hp.connect(d).connect(fb).connect(d);
      d.connect(wet).connect(g);
      head = hp;
    }
    head.connect(g);
    g.connect(SFX.master);
    s.start();
    return new Promise((r) => {
      s.onended = r;
      V.cur = { s, g, done: r };
    });
  },
  vlabStop() {
    const V = this.vlab;
    if (!V) return;
    V.tok = (V.tok || 0) + 1;
    const cur = V.cur;
    V.cur = null;
    if (cur)
      try {
        cur.s.onended = null;
        cur.s.stop();
      } catch (e) {}
    if (cur) cur.done();
    if ($('vlList')) this.vlabMark(null);
  },
});
