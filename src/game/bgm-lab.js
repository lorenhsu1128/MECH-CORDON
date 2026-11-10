// Game：任務配樂的試聽（標題的「配樂試聽」，docs/audio-design.md 的配樂重選）。
// 候選曲（CC0／CC-BY，多種樂器合奏）由 scripts/bgm-audition.py 剪成 60 秒的片段，建置成 lib/bgm-audition.js
// （window.MECH_CORDON_BGM_AUD＝{ '@index': [曲子的說明], '<id>': base64 mp3 }），打開這個畫面時才載入。
// 每首可以勾選要用在哪一級（探索／警戒／交戰／Boss／空域）、打星、寫備註，存在 localStorage mech_cordon_bgm_aud；
// 「複製勾選結果」依用途整理成文字（貼給開發者決定換哪些曲子）。最下面可以聽遊戲中實際使用的循環段（lib/bgm-assets.js）。不寫存檔。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const KEY = 'mech_cordon_bgm_aud';
const USES = [
  ['explore', '探索'],
  ['alert', '警戒'],
  ['combat', '交戰'],
  ['boss', 'Boss'],
  ['air', '空域'],
];
const USE_NAME = Object.fromEntries(USES);
// 目前的配樂（src/assets/bgm/CREDITS.txt；2026-11-06 換成試聽裡選的曲子）
const CURRENT = [
  ['explore1', 'Signal To Noise', 'explore'],
  ['explore2', 'Penumbra', 'explore'],
  ['explore3', 'The Long Dark', 'explore'],
  ['alert1', 'Eyes In The Void', 'alert'],
  ['alert2', 'Electrorchestra', 'alert'],
  ['alert3', 'Escape Velocity', 'alert'],
  ['alert4', 'Hidden', 'alert'],
  ['combat1', 'Simulacra', 'combat'],
  ['combat2', 'Terminus', 'combat'],
  ['combat3', 'Chase', 'combat'],
  ['combat4', 'Epic Cyberpunk', 'combat'],
  ['combat5', 'Determined Pursuit', 'combat'],
  ['combat6', 'QaziJamJam', 'combat'],
  ['boss1', 'Goliath', 'boss'],
  ['boss2', 'Vanguard', 'boss'],
  ['boss3', 'Hellfire', 'boss'],
  ['boss4', 'The Great Battle', 'boss'],
  ['boss5', 'Boss Battle #2', 'boss'],
  ['air1', 'Sentinel', 'air'],
  ['air2', 'Born Of The Sky', 'air'],
  ['air3', 'Starfire', 'air'],
];

function loadNotes() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch (e) {
    return {};
  }
}
function loadScript(src, ok) {
  if (ok()) return Promise.resolve(true);
  return new Promise((res) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res(ok());
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

Object.assign(Game.prototype, {
  openBgmLab() {
    SFX.ui();
    SFX.init();
    this.state = 'bgmlab';
    this.showScreen('bgmLab');
    const B = (this.blab = this.blab || { filter: '', buf: {}, notes: loadNotes() });
    $('btnBlBack').onclick = () => {
      SFX.ui('back');
      this.blabStop();
      this.state = 'title';
      this.showScreen('title');
    };
    if (B.idx) return this.blabRender();
    $('blList').innerHTML = '<p class="dim">載入試聽曲（約 28 MB）…</p>';
    if (!this.blabLoading)
      this.blabLoading = loadScript('lib/bgm-audition.js', () => !!window.MECH_CORDON_BGM_AUD).then((ok) => {
        this.blabLoading = null;
        return ok;
      });
    this.blabLoading.then((ok) => {
      if (this.state !== 'bgmlab') return;
      if (!ok) {
        $('blList').innerHTML =
          '<p class="dim">找不到試聽曲（lib/bgm-audition.js）。用 scripts/bgm-audition.py 產生後重新建置。</p>';
        return;
      }
      B.idx = window.MECH_CORDON_BGM_AUD['@index'];
      this.blabRender();
    });
  },
  blabRender() {
    const B = this.blab;
    let h = `<div class="row" id="blOpts"><label>建議用途 <select id="blFilter"><option value="">全部</option>${USES.map(
      ([k, n]) => `<option value="${k}"${B.filter === k ? ' selected' : ''}>${n}</option>`,
    ).join('')}</select></label>
      <button id="blStop">停止</button>
      <button id="blCopy" title="把勾選、評分與備註依用途整理成文字並複製">複製勾選結果</button>
      <span id="blNow" class="dim"></span></div>
      <div id="blBar" title="點一下跳到那裡"><div id="blFill"></div></div>`;
    for (const c of B.idx) {
      if (B.filter && !c.use.includes(B.filter)) continue;
      const n = B.notes[c.id] || {};
      const u = n.u || [];
      h += `<div class="blRow" data-c="${c.id}">
        <button class="blPlay" data-p="${c.id}" title="播放 60 秒的片段">▶</button>
        <div class="blInfo"><b>${escHtml(c.title)}</b> <span class="dim">— ${escHtml(c.artist)}・${escHtml(c.lic)}・全曲 ${fmt(c.dur)}（片段從 ${fmt(c.at)}）</span>
          <div class="blDesc">${escHtml(c.desc)}<span class="blSug">建議：${c.use.map((k) => USE_NAME[k]).join('、')}</span></div></div>
        <div class="blPick">${USES.map(
          ([k, nm]) =>
            `<label class="${c.use.includes(k) ? 'sug' : ''}"><input type="checkbox" data-u="${c.id}" value="${k}"${u.includes(k) ? ' checked' : ''} />${nm}</label>`,
        ).join('')}
          <select data-r="${c.id}" title="評分">${['', '1', '2', '3', '4', '5']
            .map(
              (s) =>
                `<option value="${s}"${String(n.r || '') === s ? ' selected' : ''}>${s ? '★'.repeat(+s) : '評分'}</option>`,
            )
            .join('')}</select>
          <input data-n="${c.id}" placeholder="備註" value="${escHtml(n.t || '')}" /></div></div>`;
    }
    h += `<h3>遊戲中使用的配樂（完整的循環段）</h3><div class="blCur">${CURRENT.map(
      ([k, t, u]) =>
        `<button data-cur="${k}" title="${USE_NAME[u]}">▶ ${escHtml(t)}<span class="dim">（${USE_NAME[u]}）</span></button>`,
    ).join('')}</div>`;
    $('blList').innerHTML = h;
    $('blFilter').onchange = (e) => {
      B.filter = e.target.value;
      this.blabRender();
    };
    $('blStop').onclick = () => this.blabStop();
    $('blCopy').onclick = () => this.blabCopy();
    $('blBar').onclick = (e) => {
      const cur = B.cur;
      if (!cur) return;
      const r = $('blBar').getBoundingClientRect();
      this.blabStart(cur.key, cur.buf, ((e.clientX - r.left) / r.width) * cur.buf.duration);
    };
    for (const b of $('blList').querySelectorAll('button[data-p]'))
      b.onclick = () => this.blabToggle(b.dataset.p, () => window.MECH_CORDON_BGM_AUD[b.dataset.p]);
    for (const b of $('blList').querySelectorAll('button[data-cur]'))
      b.onclick = async () => {
        const k = b.dataset.cur;
        if (!window.MECH_CORDON_BGM) {
          $('blNow').textContent = '載入目前的配樂…';
          await loadScript('lib/bgm-assets.js', () => !!window.MECH_CORDON_BGM);
        }
        this.blabToggle('cur:' + k, () => window.MECH_CORDON_BGM && window.MECH_CORDON_BGM[k]);
      };
    for (const x of $('blList').querySelectorAll('input[data-u]'))
      x.onchange = () => {
        const id = x.dataset.u;
        const u = [...$('blList').querySelectorAll(`input[data-u="${id}"]`)]
          .filter((y) => y.checked)
          .map((y) => y.value);
        this.blabNote(id, 'u', u);
      };
    for (const s of $('blList').querySelectorAll('select[data-r]'))
      s.onchange = () => this.blabNote(s.dataset.r, 'r', s.value);
    for (const s of $('blList').querySelectorAll('input[data-n]'))
      s.onchange = () => this.blabNote(s.dataset.n, 't', s.value.trim());
    this.blabMark();
  },
  blabNote(id, k, v) {
    const N = this.blab.notes;
    N[id] = N[id] || {};
    N[id][k] = v;
    try {
      localStorage.setItem(KEY, JSON.stringify(N));
    } catch (e) {}
  },
  blabCopy() {
    const B = this.blab;
    const rows = ['任務配樂試聽的勾選結果'];
    for (const [k, nm] of USES) {
      const list = B.idx.filter((c) => (B.notes[c.id] && B.notes[c.id].u ? B.notes[c.id].u : []).includes(k));
      rows.push(`【${nm}】` + (list.length ? '' : '（沒有勾選）'));
      for (const c of list) {
        const n = B.notes[c.id];
        rows.push(
          `  ${c.title} — ${c.artist}（${c.id}）${n.r ? '　' + n.r + ' 星' : ''}${n.t ? '｜' + n.t : ''}`,
        );
      }
    }
    const other = B.idx.filter((c) => {
      const n = B.notes[c.id];
      return n && !(n.u && n.u.length) && (n.r || n.t);
    });
    if (other.length) {
      rows.push('【只有評分／備註】');
      for (const c of other) {
        const n = B.notes[c.id];
        rows.push(`  ${c.title}（${c.id}）${n.r ? '　' + n.r + ' 星' : ''}${n.t ? '｜' + n.t : ''}`);
      }
    }
    const txt = rows.join('\n');
    $('blOut').textContent = txt;
    if (navigator.clipboard)
      navigator.clipboard.writeText(txt).then(
        () => ($('blOut').textContent = '已複製到剪貼簿：\n' + txt),
        () => {},
      );
  },
  // 同一首再按一次＝停止；換一首＝從頭播
  async blabToggle(key, b64Of) {
    const B = this.blab;
    if (B.cur && B.cur.key === key) return this.blabStop();
    this.blabStop();
    const tok = B.tok;
    let buf = B.buf[key];
    if (!buf) {
      const b64 = b64Of();
      if (!b64 || !SFX.ctx) return;
      $('blNow').textContent = '解碼中…';
      buf = await new Promise((res) => SFX.ctx.decodeAudioData(SFX.b64(b64), res, () => res(null)));
      if (!buf || tok !== B.tok || this.state !== 'bgmlab') return;
      // 解碼後一首 60 秒約 21 MB：只留最近的兩首
      const keys = Object.keys(B.buf);
      if (keys.length >= 2) delete B.buf[keys[0]];
      B.buf[key] = buf;
    }
    this.blabStart(key, buf, 0);
  },
  blabStart(key, buf, off) {
    const B = this.blab;
    this.blabStop(true);
    const c = SFX.ctx;
    if (c.state === 'suspended') c.resume();
    const s = c.createBufferSource(),
      g = c.createGain();
    s.buffer = buf;
    g.gain.value = 1;
    s.connect(g).connect(SFX.bgmBus);
    off = Math.max(0, Math.min(buf.duration - 0.5, off));
    s.start(0, off);
    const cur = (B.cur = { key, buf, s, g, t0: c.currentTime - off });
    s.onended = () => {
      if (B.cur === cur) this.blabStop();
    };
    this.blabMark();
    const tick = () => {
      if (B.cur !== cur || this.state !== 'bgmlab') return;
      const t = c.currentTime - cur.t0;
      if ($('blFill')) $('blFill').style.width = Math.min(100, (t / buf.duration) * 100) + '%';
      if ($('blNow')) $('blNow').textContent = `${this.blabName(key)}　${fmt(t)} / ${fmt(buf.duration)}`;
      requestAnimationFrame(tick);
    };
    tick();
  },
  blabName(key) {
    if (key.startsWith('cur:')) {
      const r = CURRENT.find((x) => x[0] === key.slice(4));
      return '目前：' + (r ? r[1] : key);
    }
    const c = this.blab.idx.find((x) => x.id === key);
    return c ? c.title : key;
  },
  blabMark() {
    const B = this.blab,
      k = B && B.cur ? B.cur.key : null;
    if (!$('blList')) return;
    for (const b of $('blList').querySelectorAll('button[data-p], button[data-cur]')) {
      const on = b.dataset.p ? b.dataset.p === k : 'cur:' + b.dataset.cur === k;
      b.classList.toggle('on', on);
      if (b.dataset.p) b.textContent = on ? '■' : '▶';
    }
    for (const r of $('blList').querySelectorAll('.blRow')) r.classList.toggle('on', r.dataset.c === k);
  },
  blabStop(keepUi) {
    const B = this.blab;
    if (!B) return;
    B.tok = (B.tok || 0) + 1;
    const cur = B.cur;
    B.cur = null;
    if (cur)
      try {
        cur.s.onended = null;
        const t = SFX.ctx.currentTime;
        cur.g.gain.setTargetAtTime(0, t, 0.05);
        cur.s.stop(t + 0.3);
      } catch (e) {}
    if (keepUi) return;
    if ($('blFill')) $('blFill').style.width = '0%';
    if ($('blNow')) $('blNow').textContent = '';
    this.blabMark();
  },
});
