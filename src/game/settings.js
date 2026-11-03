// Game：設定畫面與按鍵綁定
import { escHtml } from '../core/html.js';
import { SFX } from '../audio/audio.js';
import { IK, IK_ITEMS, setIK } from '../render/mech-ik.js';
import { StyleStore } from '../render/style/store.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);

// 設定畫面的分頁（docs/settings-ui.md）：上方分頁＋下方說明欄，第一頁是快速設定
const SET_TABS = {
  quick: '快速設定',
  ctrl: '操作',
  keys: '按鍵',
  cam: '鏡頭',
  gfx: '畫面',
  ui: '介面與演出',
  snd: '聲音',
  adv: '遊戲與進階',
};
// 快速設定的組合：{ 控制項 id: 值 }；值寫進原本的控制項再觸發 change，所以和在各分頁改的完全一樣
const PRESETS = {
  gfx: {
    name: '畫面品質',
    tip: '一次調整解析度、水面、機甲特效、文字演出與殘影；效能＝比較慢的電腦、平板與手機',
    list: [
      [
        '效能',
        { styleRes: '0.7', ctrlWater: 'low', ctrlMechFx: 'simple', ctrlTfx: 'simple', ctrlGhost: 'off' },
      ],
      ['平衡', { styleRes: '1', ctrlWater: '', ctrlMechFx: 'full', ctrlTfx: 'full', ctrlGhost: 'on' }],
      ['品質', { styleRes: '1', ctrlWater: 'high', ctrlMechFx: 'full', ctrlTfx: 'full', ctrlGhost: 'on' }],
    ],
    def: 1,
  },
  assist: {
    name: '操作輔助',
    tip: '新手＝自動瞄準鎖定的目標、自動攻擊、遊戲節奏慢；老手＝近戰的時機要抓準、原速',
    list: [
      ['新手', { ctrlAim: 'auto', ctrlAuto: true, ctrlMeleeAssist: 'easy', ctrlPace: '0.7' }],
      ['標準', { ctrlAim: 'mouse', ctrlAuto: false, ctrlMeleeAssist: 'easy', ctrlPace: '0.85' }],
      ['老手', { ctrlAim: 'mouse', ctrlAuto: false, ctrlMeleeAssist: 'std', ctrlPace: '1' }],
    ],
    def: 1,
  },
};
// 快速設定裡的常用項目：[名稱, 原本控制項的選擇器]
const QUICK = [
  ['主音量', '#volBox [data-vol="m"]'],
  ['預設視角', '#ctrlView'],
  ['鏡頭距離（第三人稱）', '#ctrlCamDist'],
  ['字幕', '#ctrlSub'],
  ['ECHO 的聲音', '#ctrlVoice'],
  ['傷害數字', '#ctrlDmgNum'],
  ['劇情動畫', '#ctrlCine'],
  ['地圖物件的破壞', '#ctrlDestruct'],
];
let lastTab = 'quick';

// 控制項的預設值：data-def，否則是文字含「預設」的選項；都沒有＝不比較（勾選框＝'1'／'0'）
const defOf = (el) => {
  if (el.dataset.def !== undefined) return el.dataset.def;
  if (el.tagName === 'SELECT') {
    const o = [...el.options].find((o) => o.textContent.includes('預設'));
    if (o) return o.value;
  }
  return null;
};
const sameVal = (a, b) =>
  a === b || (a !== '' && b !== '' && !isNaN(+a) && !isNaN(+b) && Math.abs(+a - +b) < 1e-6);
const isChanged = (el) => {
  const d = defOf(el);
  if (d === null) return false;
  return !sameVal(el.type === 'checkbox' ? (el.checked ? '1' : '0') : String(el.value), d);
};
const setVal = (el, v) => {
  if (el.type === 'checkbox') el.checked = v === true || v === '1';
  else el.value = String(v);
  el.dispatchEvent(new Event('change', { bubbles: true }));
};
const isVal = (el, v) => (el.type === 'checkbox' ? el.checked === !!v : sameVal(String(el.value), String(v)));

Object.assign(Game.prototype, {
  openSettings(from, tab) {
    this.settingsFrom = from;
    this.setNoteT = 0;
    this.state = 'settings';
    this.showScreen('settings');
    this.setUiInit();
    this.renderSettings();
    this.settingsTab(tab || lastTab);
  },
  // 第一次開啟時接上分頁、說明欄與標記（各控制項自己的 onchange 先跑，冒泡到 #settings 時設定已經寫好）
  setUiInit() {
    if (this.setUiDone) return;
    this.setUiDone = true;
    const root = $('settings');
    for (const b of $('setTabs').querySelectorAll('button')) b.onclick = () => this.settingsTab(b.dataset.st);
    root.addEventListener('change', () => {
      this.setMarks();
      if (lastTab === 'quick') this.renderQuick();
    });
    const show = (e) => this.setDescFor(e.target);
    root.addEventListener('pointerover', show);
    root.addEventListener('focusin', show);
    $('btnKeysReset').onclick = () => this.settingsReset();
  },
  settingsTab(k) {
    if (!SET_TABS[k]) k = 'quick';
    lastTab = k;
    for (const b of $('setTabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.st === k);
    for (const pg of document.querySelectorAll('#setBody .setPage'))
      pg.classList.toggle('on', pg.dataset.st === k);
    $('setBody').scrollTop = 0;
    if (k === 'quick') this.renderQuick();
    this.setDescFor(null);
  },
  // 說明欄：滑鼠停留、鍵盤或手把焦點所在的項目；title 搬進 data-desc（不再跳出瀏覽器的提示，觸控與手把也看得到）
  setDescFor(t) {
    const box = $('setDesc');
    if (!box || performance.now() < (this.setNoteT || 0)) return;
    const take = (el) => {
      if (el && el.hasAttribute('title')) {
        el.dataset.desc = el.getAttribute('title');
        el.removeAttribute('title');
      }
      return el && el.dataset.desc;
    };
    let txt = '';
    const el = t && t.closest && t.closest('#setBody [data-desc], #setBody [title], #setBody .krow');
    if (el) {
      const row = el.closest('.krow');
      txt = take(el) || (row && (take(row) || take(row.querySelector('[title], [data-desc]')))) || '';
      if (!txt && row) {
        const lb = row.querySelector('label');
        txt = lb ? lb.textContent.trim() : '';
      }
      if (txt && row && row.dataset.next && this.settingsFrom === 'pause')
        txt += '（任務中改的話，下次出擊生效）';
    }
    if (!txt) {
      const pg = this.setPageEl();
      txt = pg ? pg.dataset.intro || '' : '';
    }
    box.textContent = txt;
  },
  // 操作結果：在說明欄停留 1.5 秒（不被滑鼠停留的說明蓋掉）
  setNote(t) {
    $('setDesc').textContent = t;
    this.setNoteT = performance.now() + 1500;
  },
  setPageEl() {
    return document.querySelector('#setBody .setPage.on');
  },
  // 和預設值不同的項目標小圓點；分頁按鈕也標（那一頁有改過的）
  setMarks() {
    const rows = new Map();
    const sel = '#setBody .setPage:not([data-st="quick"])';
    for (const el of document.querySelectorAll(`${sel} select, ${sel} input`)) {
      if (el.closest('#lmBox')) continue;
      const row = el.closest('.krow') || el.closest('label');
      if (row) rows.set(row, rows.get(row) || isChanged(el));
    }
    for (const [row, c] of rows) row.classList.toggle('chg', c);
    for (const pg of document.querySelectorAll('#setBody .setPage')) {
      const b = document.querySelector(`#setTabs button[data-st="${pg.dataset.st}"]`);
      if (b) b.classList.toggle('chg', pg.dataset.st !== 'quick' && !!pg.querySelector('.chg'));
    }
  },
  // 恢復這一頁的預設（先確認）：逐項寫回預設值並觸發 change；重新產生的區塊（眼動、IK）每次重新找
  settingsReset() {
    const pg = this.setPageEl();
    if (!pg) return;
    const k = pg.dataset.st;
    const note = {
      quick: '（畫面品質回到平衡、操作輔助回到標準）',
      adv: '（眼動追蹤的校準結果與本地模型庫保留）',
      gfx: '（任務中不能換的渲染風格保留）',
    };
    this.uiConfirm(
      `把「${SET_TABS[k]}」這一頁恢復成預設值？${note[k] && (k !== 'gfx' || this.settingsFrom === 'pause') ? note[k] : ''}`,
      () => {
        if (k === 'keys') {
          this.keymap = this.defaultKeys();
          this.padmap = this.defaultPad();
          this.saveKeys();
        }
        if (k === 'quick') for (const P of Object.values(PRESETS)) this.applyPreset(P.list[P.def][1]);
        const q =
          k === 'quick'
            ? '#setQuick select[data-mirror]'
            : `#setBody .setPage[data-st="${k}"] select, #setBody .setPage[data-st="${k}"] input`;
        const skip = (el) => (el.disabled && !el.closest('#gazeBox, #ikBox')) || el.closest('#lmBox');
        for (let i = 0; i < 80; i++) {
          const el = [...document.querySelectorAll(q)].find((e) => !skip(e) && isChanged(e));
          if (!el) break;
          setVal(el, defOf(el));
        }
        this.renderSettings();
        this.settingsTab(k);
        this.setNote('已恢復成預設值');
      },
      '恢復預設',
      '取消',
    );
  },
  applyPreset(map) {
    for (const id in map) {
      const el = $(id);
      if (el && !el.disabled && !isVal(el, map[id])) setVal(el, map[id]);
    }
  },
  // 目前符合哪一個組合（-1＝自訂）
  presetNow(P) {
    return P.list.findIndex(([, map]) => Object.keys(map).every((id) => !$(id) || isVal($(id), map[id])));
  },
  // 快速設定：兩組組合＋常用項目（複製原本的下拉選單，改的時候寫回原本的控制項）
  renderQuick() {
    const box = $('setQuick');
    if (!box) return;
    let h = '';
    for (const [key, P] of Object.entries(PRESETS)) {
      const cur = this.presetNow(P);
      h +=
        `<div class="krow" data-desc="${escHtml(P.tip)}"><span>${P.name}</span><span class="qPres">` +
        P.list
          .map(
            ([n], i) =>
              `<button class="qPre ${i === cur ? 'on' : ''}" data-pre="${key}:${i}">${n}${i === P.def ? '（預設）' : ''}</button>`,
          )
          .join('') +
        (cur < 0 ? '<span class="dim qCustom">自訂</span>' : '') +
        '</span></div>';
    }
    h += '<h4>常用</h4>';
    for (const [name, selr] of QUICK) {
      const o = document.querySelector(selr);
      if (!o) continue;
      const row = o.closest('.krow');
      const d = o.getAttribute('title') || o.dataset.desc || (row && row.dataset.desc) || '';
      const def = defOf(o);
      h +=
        `<div class="krow ${isChanged(o) ? 'chg' : ''}" data-desc="${escHtml(d)}"${row && row.dataset.next ? ' data-next="1"' : ''}>` +
        `<span>${name}</span><select data-mirror="${escHtml(selr)}"${def !== null ? ` data-def="${escHtml(def)}"` : ''}${o.disabled ? ' disabled' : ''}>${o.innerHTML}</select></div>`;
    }
    h += '<p class="dim" style="font-size:11px">其他設定在上方的分頁（手把：LB／RB 切換）。</p>';
    box.innerHTML = h;
    for (const s of box.querySelectorAll('select[data-mirror]')) {
      const o = document.querySelector(s.dataset.mirror);
      s.value = o.value;
      s.onchange = () => setVal(o, s.value);
    }
    for (const b of box.querySelectorAll('.qPre'))
      b.onclick = () => {
        const [key, i] = b.dataset.pre.split(':');
        const P = PRESETS[key];
        this.applyPreset(P.list[+i][1]);
        this.setMarks();
        this.renderQuick();
        this.setNote(`已套用「${P.name}：${P.list[+i][0]}」`);
      };
  },
  renderSettings() {
    const $ = (id) => document.getElementById(id);
    const rows = [
      ['up', '向前'],
      ['down', '向後'],
      ['left', '向左'],
      ['right', '向右'],
      ['qb', 'Quick Boost'],
      ['jump', '跳躍／懸浮'],
      ['ab', '突擊推進'],
      ['fireR', '右手武器'],
      ['fireL', '左手武器'],
      ['backL', '左背武器'],
      ['backR', '右背武器'],
      ['lock', '切換鎖定'],
      ['assist', '目標輔助（追尾視角）'],
      ['kit', '修復套件'],
      ['cs1', '消耗品 1'],
      ['cs2', '消耗品 2'],
      ['aam', '空戰導彈（空域）'],
      ['pause', '暫停'],
    ];
    const padOnly = { up: '左搖桿', down: '左搖桿', left: '左搖桿', right: '左搖桿' };
    const defK = this.defaultKeys(),
      defP = this.defaultPad();
    const chg = (k) => this.keymap[k] !== defK[k] || (!padOnly[k] && this.padmap[k] !== defP[k]);
    $('keyRows').innerHTML =
      `<div class="krow dim" style="font-size:11px"><span>動作</span><span style="display:flex;gap:8px"><span style="min-width:120px;text-align:center">鍵盤／滑鼠</span><span style="min-width:120px;text-align:center">手把</span></span></div>` +
      rows
        .map(
          ([k, l]) =>
            `<div class="krow ${chg(k) ? 'chg' : ''}"><span>${l}</span><span style="display:flex;gap:8px"><button data-k="${k}" class="kbtn ${this.rebinding === k ? 'wait' : ''}">${this.rebinding === k ? '請按鍵…' : this.keyLabel(this.keymap[k])}</button><span class="kbtn dim" style="display:inline-block;text-align:center;padding:8px 6px;border:1px solid var(--line)">${padOnly[k] || this.padLabel(this.padmap[k])}</span></span></div>`,
        )
        .join('') +
      `<p class="dim" style="font-size:11px">手把：左搖桿移動、右搖桿瞄準（放開時自動瞄準鎖定目標）；選單畫面：十字鍵／左搖桿移動、A 決定、B 返回、LB／RB 切換分頁、左右改選項、右搖桿捲動；改鍵時直接按手把按鈕即可指定給手把。${this.padConnected ? '　✔ 已連接' : '　（尚未偵測到手把，按任一鍵喚醒）'}</p>`;
    for (const b of $('keyRows').querySelectorAll('.kbtn'))
      b.onclick = (ev) => {
        ev.stopPropagation();
        this.rebinding = b.dataset.k;
        this.renderSettings();
      };
    $('ctrlAim').value = this.ctrl.aim;
    $('ctrlMove').value = this.ctrl.moveRel;
    $('ctrlHold').checked = this.ctrl.holdFire;
    $('ctrlRumble').checked = this.ctrl.rumble;
    $('ctrlTouch').value = this.ctrl.touch || 'auto';
    $('ctrlAuto').checked = !!this.ctrl.autoFire;
    $('ctrlView').value = this.ctrl.view || 'tps';
    $('ctrlSens').value = this.ctrl.sens || 1;
    $('ctrlSway').value = String(this.ctrl.chaseSway === undefined ? 1 : this.ctrl.chaseSway);
    $('ctrlChaseDist').value = String(this.ctrl.chaseDist || 1);
    $('ctrlChaseFov').value = String(this.ctrl.chaseFov || 62);
    $('ctrlInvY').checked = !!this.ctrl.invY;
    $('ctrlPace').value = String(this.ctrl.pace || 0.85);
    $('ctrlCamMax').value = String(this.ctrl.camMax || 1.8);
    $('ctrlCamDist').value = this.ctrl.camDist || 'std';
    $('ctrlCamCU').value = this.ctrl.camCU || 'on';
    $('ctrlMechFx').value = this.ctrl.mechFx || 'full';
    $('ctrlGhost').value = this.ctrl.ghost || 'on';
    $('ctrlWater').value = this.ctrl.water || '';
    $('ctrlTfx').value = this.ctrl.tfx || 'full';
    $('ctrlCine').value = this.ctrl.cine || 'on';
    $('ctrlVoice').value = this.voiceId() || 'off';
    $('ctrlSub').value = this.subLang();
    $('ctrlSubSize').value = ['s', 'l'].includes(this.ctrl.subSize) ? this.ctrl.subSize : 'm';
    $('ctrlVoiceLang').value = this.ctrl.voiceLang === 'ja' ? 'ja' : 'zh';
    $('ctrlVoiceCast').value = this.ctrl.voiceCast === 'off' ? 'off' : 'on';
    $('ctrlBarks').value = this.ctrl.barks === 'off' ? 'off' : 'on';
    $('ctrlBgm').value = this.ctrl.bgm || 'on';
    this.renderVolSettings();
    $('ctrlExec').value = this.ctrl.exec || 'on';
    $('ctrlMeleeAssist').value = this.ctrl.meleeAssist || 'easy';
    $('ctrlCharge').value = this.ctrl.chargeMode || 'auto';
    $('ctrlAR').value = this.ctrl.activeReload || 'on';
    $('ctrlDmgNum').value = this.ctrl.dmgNum || 'full';
    $('ctrlPopTag').value = this.ctrl.popTag || 'imp';
    $('ctrlDestruct').value = this.ctrl.destruct || 'normal';
    $('ctrlBlood').value = this.ctrl.blood || 'red';
    $('ctrlDmgSelf').value = this.ctrl.dmgSelf === false ? 'off' : 'on';
    $('ctrlHangar').value = this.hangarFx();
    this.renderLocalModels();
    this.renderStyleSettings();
    this.renderIkSettings();
    this.renderGazeSettings();
    $('settings').classList.toggle('inMission', this.settingsFrom === 'pause');
    this.setMarks();
  },
  // 聲音的音量（ctrl.vol：m 主音量、s 音效、b 配樂、v 語音、u 介面；docs/audio-design.md）：下拉選單，手把左右就能改
  renderVolSettings() {
    const V = Object.assign({ m: 1, s: 1, b: 1, v: 1, u: 1 }, this.ctrl.vol || {});
    const opts = (x) =>
      Array.from({ length: 11 }, (_, i) => i / 10)
        .map(
          (v) =>
            `<option value="${v}" ${Math.abs(v - x) < 0.01 ? 'selected' : ''}>${Math.round(v * 100)}%</option>`,
        )
        .join('');
    const rows = [
      ['m', '主音量'],
      ['s', '音效（槍聲、爆炸、環境音）'],
      ['b', '配樂（任務中與過場）'],
      ['v', '語音（ECHO）'],
      ['u', '介面音'],
    ];
    const box = $('volBox');
    box.innerHTML = rows
      .map(
        ([k, l]) =>
          `<div class="krow"><span>${l}</span><select data-vol="${k}" data-def="1">${opts(V[k])}</select></div>`,
      )
      .join('');
    box.onchange = (e) => {
      const k = e.target.dataset && e.target.dataset.vol;
      if (!k) return;
      this.ctrl.vol = Object.assign({}, V, this.ctrl.vol || {}, { [k]: +e.target.value });
      SFX.setVol(this.ctrl.vol);
      this.saveKeys();
      if (k === 'v' && this.voiceTest) this.voiceTest();
      else SFX.ui('ok');
    };
  },
  // 動作 IK：和渲染風格實驗室的面板共用開關（rubicon_ik），任務中也能改、立即生效
  renderIkSettings() {
    const box = $('ikBox');
    box.innerHTML =
      `<div class="krow"><span>啟用</span><label><input type="checkbox" data-ik="on" data-def="1" ${IK.on ? 'checked' : ''} /> 機甲動作的 IK 修正（總開關）</label></div>` +
      `<div class="ikGrid">${IK_ITEMS.map(
        ([k, name, tip]) =>
          `<label title="${escHtml(tip)}"><input type="checkbox" data-ik="${k}" data-def="1" ${IK[k] ? 'checked' : ''} ${IK.on ? '' : 'disabled'} /> ${escHtml(name)}</label>`,
      ).join('')}</div>` +
      `<p class="dim" style="font-size: 11px">選到項目時下方顯示說明。手臂瞄準與壓低骨盆會移動子彈發射點（多人以房主的設定為準）；可在渲染風格實驗室按 I 鍵比較前後。</p>`;
    box.onchange = (e) => {
      const k = e.target.dataset && e.target.dataset.ik;
      if (!k) return;
      setIK(k, e.target.checked);
      this.renderIkSettings();
    };
  },
  // 渲染風格：任務中（從暫停選單開啟）不能換風格，只能改解析度
  renderStyleSettings() {
    const d = StyleStore.data;
    const lbl = { builtin: '內建', mine: '我的', server: '伺服器' };
    const sel = $('styleSel');
    sel.innerHTML = StyleStore.choices()
      .map(
        (c) =>
          `<option value="${c.k}:${escHtml(c.id)}">${lbl[c.k]}・${escHtml(c.name)}${c.author ? '（' + escHtml(c.author) + '）' : ''}</option>`,
      )
      .join('');
    sel.value = d.sel.k + ':' + d.sel.id;
    const inMission = this.settingsFrom === 'pause';
    sel.disabled = inMission;
    $('styleMetal').checked = d.metal;
    $('styleMetal').disabled = inMission;
    $('styleRes').value = String(d.res);
    $('btnStyleLab2').disabled = inMission || !!(this.net && this.net.role);
    $('styleNote').textContent = inMission ? '任務中不能切換風格（回機甲庫或標題再改）' : '';
    if (StyleStore.serverOn && !this.styleFetched) {
      this.styleFetched = true;
      StyleStore.fetchServer()
        .then(() => this.state === 'settings' && this.renderStyleSettings())
        .catch(() => {});
    }
  },
  captureBinding(code) {
    if (!this.rebinding) return false;
    if (code === 'Escape') {
      this.rebinding = null;
      this.renderSettings();
      return true;
    }
    const map = code.startsWith('Pad') ? this.padmap : this.keymap;
    for (const k in map) if (map[k] === code && k !== this.rebinding) map[k] = '';
    map[this.rebinding] = code;
    this.rebinding = null;
    this.saveKeys();
    this.renderSettings();
    return true;
  },
  closeSettings() {
    this.rebinding = null;
    if (this.settingsFrom === 'pause') {
      this.state = 'pause';
      this.showScreen('pause');
    } else {
      this.state = 'title';
      this.showScreen('title');
    }
  },
});
