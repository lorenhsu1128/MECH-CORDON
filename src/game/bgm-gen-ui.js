// Game：配樂產生器（標題「工具與其他」的「配樂產生器」，state 'bgmgen'；docs/audio-design.md 的「配樂產生器」）。
// AI 配樂（每章每種區段類型一首日文歌）的整套流程做成一個畫面：歌曲設定（歌名、聲線、速度、調、編曲、歌詞）與共用設定的編輯、
// 在伺服器那台電腦的顯示卡上產生候選／評分挑選／輕快版／打包／建置、看工作的記錄與顯示卡、試聽每個候選、手動改挑選或刪掉重做。
// 全部經過伺服器的 /api/bgm（server-bgmgen.js，只在開發模式：從專案執行 server.js）；直接開檔或一般的伺服器只顯示說明。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { SEG_TYPES } from '../data/campaign.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const VOICE_NAME = { girl: '少女型', diva: '歌姬型', duet: '二重唱' };
const typeName = (t) => (t === 'theme' ? '主題歌' : SEG_TYPES[t] ? SEG_TYPES[t].name : t);
const MODE_NAME = {
  all: '一次跑完',
  fight: '產生候選',
  score: '評分挑選',
  calm: '產生輕快版',
  pack: '打包',
  build: '建置',
  setup: '安裝',
  sync: '同步',
};
const ago = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60
    ? `${s} 秒`
    : s < 3600
      ? `${Math.floor(s / 60)} 分 ${s % 60} 秒`
      : `${(s / 3600).toFixed(1)} 小時`;
};

Object.assign(Game.prototype, {
  openBgmGen() {
    SFX.ui();
    SFX.init();
    this.state = 'bgmgen';
    this.showScreen('bgmGen');
    const G = (this.bgg = this.bgg || { ch: 1, n: 2 });
    G.edit = null;
    G.sig = '';
    $('btnBgBack').onclick = () => {
      SFX.ui('back');
      this.bggAudioStop();
      clearTimeout(G.timer);
      this.state = 'title';
      this.showScreen('title');
    };
    if (!window.MECH_CORDON_SERVER) {
      $('bgBody').innerHTML =
        '<p class="dim">配樂產生器要從區網伺服器的網址開啟（在有 NVIDIA 顯示卡、從專案執行 server.js 的那台電腦上產生）。</p>';
      return;
    }
    $('bgBody').innerHTML = '<p class="dim">讀取中…</p>';
    this.bggPoll();
  },
  async bggApi(method, url, body) {
    const r = await fetch('/api/bgm/' + url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    let j = {};
    try {
      j = await r.json();
    } catch (e) {}
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  },
  // 每 3 秒更新狀態（工作、記錄、顯示卡、產生結果）；編輯中不重畫歌曲表
  async bggPoll() {
    const G = this.bgg;
    clearTimeout(G.timer);
    if (this.state !== 'bgmgen') return;
    try {
      const s = await this.bggApi('GET', 'state?ch=' + G.ch);
      if (this.state !== 'bgmgen') return;
      if (!s.dev) {
        $('bgBody').innerHTML =
          '<p class="dim">這台伺服器沒有開放配樂產生器：要從專案執行 server.js（npm start），而且沒有用 MECH_CORDON_MODELS_DIR 指定別的資料夾。</p>';
        return;
      }
      G.s = s;
      this.bggRender();
    } catch (e) {
      if ($('bgStatus')) $('bgStatus').textContent = '連不到伺服器：' + e.message;
    }
    G.timer = setTimeout(() => this.bggPoll(), 3000);
  },
  bggRender() {
    const G = this.bgg,
      s = G.s;
    if (!$('bgStatus')) {
      $('bgBody').innerHTML = `<div id="bgTop"><div id="bgStatus"></div><pre id="bgLog"></pre></div>
        <div class="row" id="bgOpts"></div><div id="bgSongs"></div><div id="bgEdit"></div>`;
    }
    // 狀態
    const j = s.job;
    const g = s.gpu;
    $('bgStatus').innerHTML =
      `<div class="bgLine">${s.installed ? '<span class="bgOk">已安裝 ACE-Step</span>' : '<span class="bgBad">還沒安裝</span> <button data-run="setup">安裝（約 15 GB）</button>'}
      ${g ? `・顯示卡 ${escHtml(g.name)}：記憶體 ${(g.used / 1024).toFixed(1)}／${(g.total / 1024).toFixed(1)} GB、使用率 ${g.util}%` : '・讀不到顯示卡（nvidia-smi）'}</div>` +
      `<div class="bgLine">${
        j
          ? j.running
            ? `<b class="bgRun">執行中：${MODE_NAME[j.mode] || j.mode}</b>（${this.bggArgs(j)}，已經 ${ago(Date.now() - j.start)}） <button id="bgStop">停止</button>`
            : `上一個工作：${MODE_NAME[j.mode] || j.mode}（${this.bggArgs(j)}）${j.code === 0 ? '完成' : '結束（' + j.code + '）'}，花了 ${ago(j.end - j.start)}`
          : '沒有工作在跑'
      }</div>`;
    const lg = $('bgLog');
    const atEnd = lg.scrollTop + lg.clientHeight >= lg.scrollHeight - 8;
    lg.textContent = (s.log || []).join('\n') || '（沒有記錄）';
    if (atEnd) lg.scrollTop = lg.scrollHeight;
    // 章與工作的按鈕
    const running = j && j.running;
    const dis = running ? ' disabled' : '';
    const chOpt = Object.entries(s.chapters)
      .map(
        ([c, x]) =>
          `<option value="${c}"${+c === G.ch ? ' selected' : ''}>第 ${c} 章（${x.songs} 首、候選 ${x.cands}、挑好 ${x.picked}${x.packed ? '、已打包' : ''}）</option>`,
      )
      .join('');
    const opts = `<label>章 <select id="bgCh">${chOpt}</select></label>
      <label>每首的候選 <select id="bgN">${[1, 2, 3, 4].map((n) => `<option${n === G.n ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <button data-run="all1"${dis} title="這一章：產生候選 → 評分挑選 → 輕快版 → 打包">一次跑完這章</button>
      <button data-run="allTo"${dis} title="從這一章做到第 8 章">從這章跑到第 8 章</button>
      <button data-run="fight"${dis}>產生候選</button>
      <button data-run="score"${dis}>評分挑選</button>
      <button data-run="calm"${dis}>產生輕快版</button>
      <button data-run="pack"${dis}>打包</button>
      <button data-run="build"${dis} title="npm run build：打包好的配樂放進遊戲（lib/bgm-c<章>.js）">建置</button>
      <button data-run="sync"${dis} title="git pull 之後按：把別台電腦做好、進 git 的候選（tools/bgm-work/）還原到這台">同步</button>
      <button id="bgCommon">共用設定</button>`;
    if ($('bgOpts').dataset.sig !== opts) {
      $('bgOpts').innerHTML = opts;
      $('bgOpts').dataset.sig = opts;
      $('bgCh').onchange = (e) => {
        G.ch = +e.target.value;
        G.edit = null;
        G.sig = '';
        $('bgEdit').innerHTML = '';
        this.bggPoll();
      };
      $('bgN').onchange = (e) => (G.n = +e.target.value);
      $('bgCommon').onclick = () => this.bggCommon();
    }
    for (const b of document.querySelectorAll('#bgmGen button[data-run]'))
      b.onclick = () => this.bggRun(b.dataset.run);
    if ($('bgStop')) $('bgStop').onclick = () => this.bggApi('POST', 'stop').then(() => this.bggPoll());
    // 歌曲表（內容有變才重畫）
    const C = s.chapter;
    if (!C || s.ch !== G.ch) return;
    const sig = JSON.stringify([C.songs, C.out, C.packed && Object.keys(C.packed), running]);
    if (sig === G.sig) return;
    G.sig = sig;
    let h = '';
    for (const t of s.types) {
      const sg = C.songs[t];
      if (!sg) continue;
      const o = C.out[t] || { cands: [], calm: false };
      const voice = sg.voice || s.common.VOICE_OF[t];
      const cands = o.cands
        .map((c) => {
          const sc =
            c.score != null
              ? `${c.score.toFixed(2)}（歌詞 ${Math.round(c.lyric * 100)}%${c.aes ? `、美感 ${c.aes.CE}` : ''}）`
              : '未評分';
          return `<span class="bgCand${c.picked ? ' on' : ''}"><button class="bgPlay" data-a="${c.name}"${c.audio ? '' : ' disabled title="試聽檔轉檔中"'}>▶</button>
            候選 ${+c.name.split('__f')[1] + 1}：${sc}${
              c.picked ? ' <b>★ 挑中</b>' : ` <button data-pick="${c.name}"${dis}>設為挑選</button>`
            } <button data-drop="${c.name}"${dis} title="刪掉這個候選（之後「產生候選」會補上一個新的）">刪除</button></span>`;
        })
        .join('');
      h += `<div class="bgSong" data-t="${t}"><div class="bgHead"><b>【${escHtml(typeName(t))}】${escHtml(sg.title)}</b>
        <span class="dim">${escHtml(sg.zh)}・${VOICE_NAME[voice] || voice}・${sg.bpm || s.common.BPM_OF[t]} BPM・${escHtml(sg.key || C.key)}${o.calm ? '・有輕快版' : ''}${C.packed && C.packed[t] ? '・已打包' : ''}</span>
        <button data-edit="${t}">編輯</button> <button data-one="${t}"${dis}>只產生這首</button>
        ${o.calm ? `<button class="bgPlay" data-a="${t}__calm">▶ 輕快版</button>` : ''}</div>
        <div class="bgCands">${cands || '<span class="dim">還沒有候選</span>'}</div></div>`;
    }
    $('bgSongs').innerHTML = h;
    for (const b of $('bgSongs').querySelectorAll('button[data-edit]'))
      b.onclick = () => this.bggEdit(b.dataset.edit);
    for (const b of $('bgSongs').querySelectorAll('button[data-one]'))
      b.onclick = () => this.bggRun('fight', [b.dataset.one]);
    for (const b of $('bgSongs').querySelectorAll('button.bgPlay'))
      b.onclick = () => this.bggPlay(b.dataset.a, b);
    for (const b of $('bgSongs').querySelectorAll('button[data-pick]'))
      b.onclick = () =>
        this.bggApi('POST', 'pick', { ch: G.ch, type: b.dataset.pick.split('__')[0], name: b.dataset.pick })
          .then(() => this.bggPoll())
          .catch((e) => this.flashMsg('改挑選失敗：' + e.message, '#f66', 2));
    for (const b of $('bgSongs').querySelectorAll('button[data-drop]'))
      b.onclick = () =>
        this.uiConfirm(`刪掉 ${b.dataset.drop} 這個候選？（檔案刪除，不能復原）`, () =>
          this.bggApi('POST', 'drop', { ch: G.ch, name: b.dataset.drop })
            .then(() => this.bggPoll())
            .catch((e) => this.flashMsg('刪除失敗：' + e.message, '#f66', 2)),
        );
  },
  bggArgs(j) {
    const a = j.args || {};
    if (j.mode === 'all') return a.from === a.to ? `第 ${a.from} 章` : `第 ${a.from}～${a.to} 章`;
    if (j.mode === 'build' || j.mode === 'setup' || j.mode === 'sync') return '';
    return `第 ${a.ch} 章${a.songs ? '：' + a.songs.split(',').map(typeName).join('、') : ''}`;
  },
  bggRun(kind, songs) {
    const G = this.bgg;
    const body =
      kind === 'all1'
        ? { mode: 'all', from: G.ch, to: G.ch, n: G.n }
        : kind === 'allTo'
          ? { mode: 'all', from: G.ch, to: 8, n: G.n }
          : { mode: kind, ch: G.ch, n: G.n, songs };
    const go = () =>
      this.bggApi('POST', 'run', body)
        .then(() => this.bggPoll())
        .catch((e) => this.flashMsg('不能開始：' + e.message, '#f66', 2.5));
    if (kind === 'allTo')
      this.uiConfirm(`從第 ${G.ch} 章跑到第 8 章，要好幾個小時（顯示卡會一直滿載）。開始？`, go);
    else go();
  },
  bggPlay(name, btn) {
    const G = this.bgg;
    const same = G.audio && G.audioName === name;
    this.bggAudioStop();
    if (same) return;
    const a = new Audio(`/api/bgm/audio?ch=${G.ch}&name=${encodeURIComponent(name)}&t=${Date.now()}`);
    G.audioName = name;
    a.play().catch(() => this.flashMsg('播放失敗（試聽檔可能還在轉檔）', '#f66', 2));
    a.onended = () => this.bggAudioStop();
    G.audio = a;
    G.audioBtn = btn;
    btn.classList.add('on');
  },
  bggAudioStop() {
    const G = this.bgg;
    if (!G || !G.audio) return;
    G.audio.pause();
    if (G.audioBtn) G.audioBtn.classList.remove('on');
    G.audio = G.audioBtn = null;
  },
  // 一首歌的設定：歌名、聲線、速度、調、編曲（空白＝這種類型的預設）、歌詞；下面即時顯示送給模型的描述與字數
  bggEdit(t) {
    const G = this.bgg,
      s = G.s,
      C = s.chapter,
      sg = C.songs[t],
      cm = s.common;
    G.edit = t;
    const vo = Object.keys(cm.VOICE)
      .map(
        (v) =>
          `<option value="${v}"${(sg.voice || cm.VOICE_OF[t]) === v ? ' selected' : ''}>${VOICE_NAME[v] || v}</option>`,
      )
      .join('');
    $('bgEdit').innerHTML = `<div class="bgEditBox"><h3>編輯：第 ${G.ch} 章【${escHtml(typeName(t))}】</h3>
      <div class="bgGrid">
        <label>日文歌名<input id="bgeTitle" value="${escHtml(sg.title)}" /></label>
        <label>中文名<input id="bgeZh" value="${escHtml(sg.zh)}" /></label>
        <label>聲線<select id="bgeVoice">${vo}</select></label>
        <label>速度（BPM）<input id="bgeBpm" type="number" min="40" max="240" value="${sg.bpm || ''}" placeholder="${cm.BPM_OF[t]}" /></label>
        <label>調<input id="bgeKey" value="${escHtml(sg.key || '')}" placeholder="${escHtml(C.key)}" /></label>
        <label>長度（秒）<input id="bgeDur" type="number" min="30" max="300" value="${sg.dur || ''}" placeholder="${t === 'theme' ? 150 : 120}" /></label>
      </div>
      <label>編曲（空白＝這種類型的預設）<textarea id="bgeArr" rows="2" placeholder="${escHtml(cm.ARR[t])}">${escHtml(sg.arr || '')}</textarea></label>
      <label>歌詞（[段落] 標記；日文漢字，主歌每句句尾押同一個韻、副歌兩兩押韻）<textarea id="bgeLyr" rows="16">${escHtml(sg.lyrics)}</textarea></label>
      <div class="dim" id="bgeCap"></div>
      <div class="row"><button id="bgeSave">儲存</button><button id="bgeCancel">取消</button>
      <span class="dim">儲存後這首要重新產生：刪掉舊的候選再按「只產生這首」。</span></div></div>`;
    const cap = () => {
      const v = $('bgeVoice').value;
      const c = [$('bgeArr').value.trim() || cm.ARR[t], cm.PALETTE[G.ch], cm.VOICE[v], cm.BASE].join(', ');
      $('bgeCap').textContent =
        `送給模型的描述（${c.length}／512 字${c.length > 512 ? '，超過的會被切掉' : ''}）：${c}`;
    };
    for (const id of ['bgeVoice', 'bgeArr']) $(id).oninput = cap;
    cap();
    $('bgeCancel').onclick = () => {
      G.edit = null;
      $('bgEdit').innerHTML = '';
    };
    $('bgeSave').onclick = () => {
      const song = {
        title: $('bgeTitle').value,
        zh: $('bgeZh').value,
        voice: $('bgeVoice').value === cm.VOICE_OF[t] && !sg.voice ? '' : $('bgeVoice').value,
        bpm: $('bgeBpm').value,
        key: $('bgeKey').value,
        dur: $('bgeDur').value,
        arr: $('bgeArr').value,
        lyrics: $('bgeLyr').value,
      };
      this.bggApi('PUT', 'song', { ch: G.ch, type: t, song })
        .then(() => {
          G.edit = null;
          G.sig = '';
          $('bgEdit').innerHTML = '';
          this.flashMsg('已儲存', '#8f8', 1.2);
          this.bggPoll();
        })
        .catch((e) => this.flashMsg('儲存失敗：' + e.message, '#f66', 2.5));
    };
    $('bgEdit').scrollIntoView({ block: 'start' });
  },
  // 共用設定（common.json）：共同曲風、聲線、各類型的編曲與預設、輕快版、各章的音色；JSON 直接編輯
  bggCommon() {
    const G = this.bgg,
      cm = G.s.common;
    G.edit = 'common';
    const o = {};
    for (const k of ['BASE', 'VOICE', 'ARR', 'CALM', 'PALETTE', 'VOICE_OF', 'BPM_OF']) o[k] = cm[k];
    $('bgEdit').innerHTML = `<div class="bgEditBox"><h3>共用設定</h3>
      <p class="dim">BASE＝每首都加的共同曲風；VOICE＝聲線的描述；ARR＝各類型交戰版的編曲；CALM＝輕快版；PALETTE＝各章的音色；VOICE_OF／BPM_OF＝各類型的預設聲線與速度。送給模型的描述＝編曲＋章的音色＋聲線＋BASE，最多 512 字。</p>
      <textarea id="bgcJson" rows="24">${escHtml(JSON.stringify(o, null, 1))}</textarea>
      <div class="row"><button id="bgcSave">儲存</button><button id="bgcCancel">取消</button></div></div>`;
    $('bgcCancel').onclick = () => {
      G.edit = null;
      $('bgEdit').innerHTML = '';
    };
    $('bgcSave').onclick = () => {
      let c;
      try {
        c = JSON.parse($('bgcJson').value);
      } catch (e) {
        return this.flashMsg('JSON 格式不對：' + e.message, '#f66', 2.5);
      }
      this.bggApi('PUT', 'common', { common: c })
        .then(() => {
          G.edit = null;
          $('bgEdit').innerHTML = '';
          this.flashMsg('已儲存', '#8f8', 1.2);
          this.bggPoll();
        })
        .catch((e) => this.flashMsg('儲存失敗：' + e.message, '#f66', 2.5));
    };
    $('bgEdit').scrollIntoView({ block: 'start' });
  },
});
