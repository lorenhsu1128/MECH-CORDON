// Game：任務配樂的試聽（標題的「配樂試聽」，docs/audio-design.md 的配樂重選）。
// 候選曲（CC0／CC-BY，多種樂器合奏）由 scripts/bgm-audition.py 剪成 60 秒的片段，建置成 lib/bgm-audition.js
// （window.MECH_CORDON_BGM_AUD＝{ '@index': [曲子的說明], '<id>': base64 mp3 }），打開這個畫面時才載入。
// 每首可以勾選要用在哪一級（探索／警戒／交戰／Boss／空域）、打星、寫備註，存在 localStorage mech_cordon_bgm_aud；
// 「複製勾選結果」依用途整理成文字（貼給開發者決定換哪些曲子）。最下面可以聽遊戲中實際使用的循環段（lib/bgm-assets.js）。不寫存檔。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { Game } from './game.js';
import { SEG_TYPES } from '../data/campaign.js';

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
// AI 配樂（lib/bgm-c<章>.js，scripts/bgm-gen.py）：每章的類型順序與名稱
const AI_TYPES = [
  'theme',
  'battle',
  'front',
  'elite',
  'destroy',
  'colossus',
  'defend',
  'escort',
  'extract',
].concat(['breakthrough', 'chase', 'intel', 'supply', 'boss', 'air']);
const VOICE_NAME = { girl: '少女型', diva: '歌姬型', duet: '二重唱' };
const aiTypeName = (t) => (t === 'theme' ? '主題歌' : SEG_TYPES[t] ? SEG_TYPES[t].name : t);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

Object.assign(Game.prototype, {
  // ai＝標題的「AI 配樂試聽」：依章列出遊戲用的 AI 配樂（lib/bgm-c<章>.js）；否則是外部的候選曲（lib/bgm-audition.js）
  openBgmLab(ai = false) {
    SFX.ui();
    SFX.init();
    this.state = 'bgmlab';
    this.showScreen('bgmLab');
    const B = (this.blab = this.blab || { filter: '', buf: {}, notes: loadNotes() });
    B.ai = !!ai;
    if (!$('blIntro').dataset.org) $('blIntro').dataset.org = $('blIntro').innerHTML;
    $('blTitle').textContent = ai ? 'AI 配樂試聽' : '配樂試聽';
    $('blIntro').innerHTML = ai
      ? '本地 AI（ACE-Step 1.5）產生的任務配樂：每章每種區段類型一首日文歌，曲風是絕區零 × 尼爾 自動人形（憂傷的鋼琴與弦樂、空靈的女聲 × 碎拍、Drum &amp; Bass、放克 bass），聲線有歌姬型、少女型與二重唱。每首有交戰版與輕快版（探索、警戒時播，同樣的歌詞、速度與調）；Boss 的最終型態會切到主題歌的副歌。可以打星與寫備註，按「複製評分」貼給開發者。'
      : $('blIntro').dataset.org;
    $('btnBlBack').onclick = () => {
      SFX.ui('back');
      this.blabStop();
      this.state = 'title';
      this.showScreen('title');
    };
    if (ai) return this.blabAiRender();
    if (B.idx) return this.blabRender();
    $('blList').innerHTML = '<p class="dim">載入試聽曲（約 28 MB）…</p>';
    if (!this.blabLoading)
      // 伺服器給 lib/ 的檔案 1 小時快取：試聽曲常常更新（AI 配樂），從伺服器開時網址帶時間、一律拿最新的
      this.blabLoading = loadScript(
        'lib/bgm-audition.js' + (location.protocol.startsWith('http') ? '?t=' + Date.now() : ''),
        () => !!window.MECH_CORDON_BGM_AUD,
      ).then((ok) => {
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
      if (c.id.startsWith('ai_') !== !!B.ai) continue;
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
  // AI 配樂：選一章，載入 lib/bgm-c<章>.js，列出每種類型的歌（交戰版、輕快版、主題歌的副歌）
  async blabAiRender() {
    const B = this.blab;
    B.aiCh = B.aiCh || 1;
    const ch = B.aiCh;
    const h = `<div class="row" id="blOpts"><label>章 <select id="blCh">${[1, 2, 3, 4, 5, 6, 7, 8]
      .map((c) => `<option value="${c}"${c === ch ? ' selected' : ''}>第 ${c} 章</option>`)
      .join('')}</select></label>
      <button id="blStop">停止</button>
      <button id="blCopy" title="把評分與備註整理成文字並複製">複製評分</button>
      <span id="blNow" class="dim"></span></div>
      <div id="blBar" title="點一下跳到那裡"><div id="blFill"></div></div><div id="blAi"><p class="dim">載入第 ${ch} 章的配樂…</p></div>
      <div id="blCand"></div>`;
    $('blList').innerHTML = h;
    $('blCh').onchange = (e) => {
      this.blabStop();
      B.aiCh = +e.target.value;
      this.blabAiRender();
    };
    $('blStop').onclick = () => this.blabStop();
    $('blCopy').onclick = () => this.blabAiCopy();
    $('blBar').onclick = (e) => {
      const cur = B.cur;
      if (!cur) return;
      const r = $('blBar').getBoundingClientRect();
      this.blabStart(cur.key, cur.buf, ((e.clientX - r.left) / r.width) * cur.buf.duration);
    };
    const k = 'MECH_CORDON_BGM_C' + ch;
    const ok = await this.bgmLoadCh(ch); // game/bgm.js：先看 lib/bgm-ai.js 有沒有這一章
    if (this.state !== 'bgmlab' || B.aiCh !== ch || !B.ai) return;
    const P = window[k],
      I = ok && P && P['@index'];
    B.aiNames = {};
    this.blabCandRender(ch);
    if (!I) {
      $('blAi').innerHTML = `<p class="dim">第 ${ch} 章的正式配樂還沒完成（npm run bgm:all）。</p>`;
      return;
    }
    let rows = '';
    for (const t of AI_TYPES) {
      const c = I[t];
      if (!c) continue;
      const id = `aic${ch}_${t}`;
      const n = B.notes[id] || {};
      B.aiNames[id] = `${c.title}（${aiTypeName(t)}・交戰版）`;
      B.aiNames[id + '_calm'] = `${c.title}（${aiTypeName(t)}・輕快版）`;
      B.aiNames[id + '_chorus'] = `${c.title}（主題歌・副歌）`;
      const btn = (key, lbl, tip) =>
        `<button class="blPlay" data-p="${key}" data-lbl="${lbl}" title="${tip}">▶ ${lbl}</button>`;
      const btns =
        btn(id, t === 'supply' || t === 'theme' || t === 'boss' ? '播放' : '交戰', '播放（完整的歌）') +
        (c.calm ? btn(id + '_calm', '輕快', '探索、警戒時播的輕快版') : '') +
        (t === 'theme' && c.chorus ? btn(id + '_chorus', '副歌', 'Boss 最終型態從這裡開始播') : '');
      const info = `${escHtml(c.zh)}・${VOICE_NAME[c.voice] || c.voice}・${c.bpm} BPM・${escHtml(c.key)}・${fmt(c.dur)}`;
      const stars = ['', '1', '2', '3', '4', '5']
        .map(
          (s) =>
            `<option value="${s}"${String(n.r || '') === s ? ' selected' : ''}>${s ? '★'.repeat(+s) : '評分'}</option>`,
        )
        .join('');
      rows += `<div class="blRow" data-c="${id}"><div class="blBtns">${btns}</div>
        <div class="blInfo"><b>【${escHtml(aiTypeName(t))}】${escHtml(c.title)}</b> <span class="dim">— ${info}</span></div>
        <div class="blPick"><select data-r="${id}" title="評分">${stars}</select>
          <input data-n="${id}" placeholder="備註" value="${escHtml(n.t || '')}" /></div></div>`;
    }
    $('blAi').innerHTML = rows;
    for (const b of $('blAi').querySelectorAll('button[data-p]')) {
      const key = b.dataset.p;
      const t = key.slice(`aic${ch}_`.length).replace(/_chorus$/, '');
      b.onclick = async () => {
        if (key.endsWith('_chorus')) {
          await this.blabToggle(key, () => P.theme);
          if (B.cur && B.cur.key === key) this.blabStart(key, B.cur.buf, I.theme.chorus || 0);
        } else this.blabToggle(key, () => P[t]);
      };
    }
    for (const s of $('blAi').querySelectorAll('select[data-r]'))
      s.onchange = () => this.blabNote(s.dataset.r, 'r', s.value);
    for (const s of $('blAi').querySelectorAll('input[data-n]'))
      s.onchange = () => this.blabNote(s.dataset.n, 't', s.value.trim());
    this.blabMark();
  },
  // 產生中的曲子（scripts/bgm-preview.py 每產生一首就更新 lib/bgm-cand-c<章>.js）：每一個候選與輕快版，挑中的標出來。
  // 每次都重新載入（網址帶時間），按「重新整理」看新產生的
  async blabCandRender(ch) {
    const B = this.blab;
    const el = $('blCand');
    if (!el) return;
    const http = location.protocol.startsWith('http');
    const js = (src) => loadScript(src + (http ? '?t=' + Date.now() : ''), () => false).then(() => true);
    const k = 'MECH_CORDON_BGM_CAND_C' + ch;
    delete window[k];
    await js('lib/bgm-cand.js');
    if ((window.MECH_CORDON_BGM_CAND || {})[ch]) await js(`lib/bgm-cand-c${ch}.js`);
    if (this.state !== 'bgmlab' || B.aiCh !== ch || !B.ai) return;
    const P = window[k];
    const head = `<h3>產生中的曲子 <button id="blCandRe" title="載入新產生的曲子">重新整理</button></h3>`;
    if (!P || !P['@index']) {
      el.innerHTML = head + '<p class="dim">這一章還沒有產生的曲子。</p>';
    } else {
      const order = (t) => AI_TYPES.indexOf(t);
      const list = P['@index']
        .slice()
        .sort((a, b) => order(a.type) - order(b.type) || (a.cand < b.cand ? -1 : 1));
      let rows = '';
      for (const c of list) {
        const key = `cand${ch}_${c.id}`;
        const lbl = c.ver === 'calm' ? '輕快版' : '候選 ' + (+c.cand.slice(1) + 1);
        B.aiNames[key] = `${c.title}（${aiTypeName(c.type)}・${lbl}）`;
        const sc =
          c.score != null
            ? `・分數 ${c.score.toFixed(2)}（歌詞 ${Math.round((c.lyric || 0) * 100)}%）`
            : '・評分中';
        rows += `<div class="blRow" data-c="${key}"><div class="blBtns"><button class="blPlay" data-p="${key}" data-cid="${c.id}" data-lbl="${lbl}">▶ ${lbl}</button></div>
          <div class="blInfo"><b>【${escHtml(aiTypeName(c.type))}】${escHtml(c.title)}</b>${c.picked ? ' <span class="blSug">★ 挑中</span>' : ''} <span class="dim">— ${escHtml(c.zh || '')}・${VOICE_NAME[c.voice] || c.voice}・${c.bpm} BPM${c.ver === 'calm' ? '' : sc}</span></div></div>`;
      }
      el.innerHTML =
        head +
        `<p class="dim">共 ${list.length} 首（每產生一首就加上；★＝自動評分挑中、會用在遊戲裡的）。</p>` +
        rows;
      for (const b of el.querySelectorAll('button[data-p]'))
        b.onclick = () => this.blabToggle(b.dataset.p, () => P[b.dataset.cid]);
    }
    $('blCandRe').onclick = () => this.blabCandRender(ch);
    this.blabMark();
  },
  blabAiCopy() {
    const B = this.blab;
    const rows = ['AI 配樂的評分'];
    for (const [id, n] of Object.entries(B.notes)) {
      const m = id.match(/^aic(\d)_(\w+)$/);
      if (!m || !(n.r || n.t)) continue;
      rows.push(
        `  第 ${m[1]} 章【${aiTypeName(m[2])}】${n.r ? '　' + n.r + ' 星' : ''}${n.t ? '｜' + n.t : ''}`,
      );
    }
    if (rows.length === 1) rows.push('（還沒有評分或備註）');
    const txt = rows.join('\n');
    $('blOut').textContent = txt;
    if (navigator.clipboard)
      navigator.clipboard.writeText(txt).then(
        () => ($('blOut').textContent = '已複製到剪貼簿：\n' + txt),
        () => {},
      );
  },
  blabName(key) {
    if (this.blab.aiNames && this.blab.aiNames[key]) return this.blab.aiNames[key];
    if (key.startsWith('cur:')) {
      const r = CURRENT.find((x) => x[0] === key.slice(4));
      return '目前：' + (r ? r[1] : key);
    }
    const c = (this.blab.idx || []).find((x) => x.id === key);
    return c ? c.title : key;
  },
  blabMark() {
    const B = this.blab,
      k = B && B.cur ? B.cur.key : null;
    if (!$('blList')) return;
    for (const b of $('blList').querySelectorAll('button[data-p], button[data-cur]')) {
      const on = b.dataset.p ? b.dataset.p === k : 'cur:' + b.dataset.cur === k;
      b.classList.toggle('on', on);
      if (b.dataset.p) b.textContent = (on ? '■' : '▶') + (b.dataset.lbl ? ' ' + b.dataset.lbl : '');
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
