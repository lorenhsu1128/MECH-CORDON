// Game：自由出擊的作戰設定（docs/free-sortie-design.md）——作戰設定畫面 #freeOps（state 'freeops'）、機甲庫的摘要 #gOps、
// 把設定決定成實際的區段（隨機的項目、地圖合不合用）並組成臨時的出擊 SORTIES.fr，交給主線的流程 campBegin(…, { free })。
// 模式「戰鬥（依等級）」照舊走 startMission。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { pick } from '../core/math.js';
import { SEG_TYPES, SORTIES, THEME_MODE } from '../data/campaign.js';
import { TODS, TOD_NAMES, ZONE_NAMES } from '../data/campaign-plan.js';
import { RULES } from '../data/board.js';
import { AC_ROSTER, BOSS_DEFS, bossForLevel, isBossLevel } from '../data/enemies.js';
import { ACES, THEME_ACE } from '../data/foes.js';
import {
  COL_NAMES,
  FO_CHAIN_TYPES,
  FO_KEY,
  FO_MODES,
  FO_MODE_DESC,
  FO_ROAD,
  FO_SOLO,
  FO_TYPES,
  WEATHER_NAMES,
  foDefault,
  foReward,
  foSanitize,
  foSegSanitize,
  freeSortie,
} from '../data/free-ops.js';
import { BRIEFINGS } from '../data/story.js';
import { WINGMEN } from '../data/wingmen.js';
import { LANDMARKS, landmarkKeys } from '../world/landmarks.js';
import { VARIANTS, variantKeys } from '../world/variants.js';
import { THEMES, corridorSpec } from '../world/world.js';
import { HEAT } from './constants.js';
import { Game } from './game.js';

const opt = (v, name, cur) =>
  `<option value="${escHtml(String(v))}"${String(v) === String(cur) ? ' selected' : ''}>${escHtml(name)}</option>`;
// 主題合併變體之後的欄位
const themeOf = (th, v) =>
  v && VARIANTS[th] && VARIANTS[th][v] ? { ...THEMES[th], ...(VARIANTS[th][v].theme || {}) } : THEMES[th];
const hasRoad = (T) => corridorSpec(T).kinds.includes('road');
const hasRail = (T) => corridorSpec(T).kinds.includes('rail');
// 這個主題（＋變體）能不能放這種區段、這隻 Boss
function fitsTheme(th, v, type, bd) {
  const T = themeOf(th, v);
  if (FO_ROAD.includes(type) && !hasRoad(T)) return false;
  if (type === 'boss' && bd) {
    if ((T.bossBan || []).includes(bd.kind)) return false;
    if (bd.rail && !hasRail(T)) return false;
  }
  return true;
}
// 連續出擊、主線出擊重現時的章節分組
const sortieIds = () => Object.keys(SORTIES).filter((k) => SORTIES[k].segs && SORTIES[k].segs.length);

Object.assign(Game.prototype, {
  // ---------- 設定的讀寫 ----------
  foLoad() {
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(FO_KEY) || 'null');
    } catch (e) {}
    this.fo = foSanitize(raw, this.save.level || 1);
    return this.fo;
  },
  foSave() {
    try {
      localStorage.setItem(FO_KEY, JSON.stringify(this.fo));
    } catch (e) {}
  },
  foCur() {
    return this.fo || this.foLoad();
  },
  // 資料表（冒煙測試用：頁面裡拿不到模組的匯出）
  foRef() {
    return { sorties: SORTIES, landmarks: LANDMARKS };
  },
  // 機甲庫的摘要（單人的自由出擊才顯示）
  // mp＝多人大廳的摘要（沒有「依等級」：那是房間模式的 PVE 合作）
  foSummary(mp = false) {
    const fo = this.foCur();
    const L = this.save.level || 1;
    if (fo.mode === 'level' && !mp) {
      const b = isBossLevel(L) ? `（決戰：${bossForLevel(L).name.split(' ')[0]}）` : '';
      return `${FO_MODES.level}・任務 ${String(L).padStart(2, '0')}${b}・${this.mapName(this.mapPref())}`;
    }
    if (fo.mode === 'sortie') {
      const so = SORTIES[fo.sid];
      return `${FO_MODES.sortie}・${so ? so.name : '（未選）'}`;
    }
    if (fo.mode === 'chain')
      return `${FO_MODES.chain}・${fo.chainRandom ? `隨機 ${fo.n} 段` : fo.segs.map((s) => SEG_TYPES[s.type].name).join('→')}・Lv${fo.level}`;
    const type = mp && FO_SOLO.includes(fo.type) ? 'battle' : fo.type;
    if (mp && fo.mode === 'level')
      return `${SEG_TYPES.battle.name}・${fo.theme ? THEMES[fo.theme].name : '隨機地圖'}・Lv${fo.level}`;
    const th = type === 'air' ? THEMES.airspace.name : fo.theme ? THEMES[fo.theme].name : '隨機地圖';
    return `${SEG_TYPES[type].name}・${th}・Lv${fo.level}`;
  },
  garageOpsUi() {
    const el = document.getElementById('gOps');
    if (!el) return;
    const mp = !!(this.net && this.net.role);
    const inG = !!(this.camp && this.camp.inGarage);
    const show = !mp && !inG && !this.fromHub && !this.fromLevels;
    el.style.display = show ? '' : 'none';
    // 機甲庫設定頁的地圖選單照舊（＝「戰鬥（依等級）」的地圖，作戰設定裡也能選）
    if (!show) return;
    // 作戰卡（出擊鍵正上方、同寬，整張可以點）：上行＝模式，下行＝內容
    const fo = this.foCur();
    const sum = this.foSummary();
    const title = FO_MODES[fo.mode];
    const det = sum.startsWith(title + '・') ? sum.slice(title.length + 1) : sum;
    el.innerHTML = `<button id="btnFreeOps" title="作戰設定：選任務、地圖、對手與等級"><span class="gOpsK">作戰</span><span class="gOpsT"><b>${escHtml(title)}</b><small>${escHtml(det)}</small></span><span class="gOpsE">⚙ 變更</span></button>`;
    document.getElementById('btnFreeOps').onclick = () => this.openFreeOps();
  },

  // ---------- 作戰設定畫面 ----------
  // from＝'lobby'：多人大廳的房主（房間模式「任務」）；沒有「依等級」、空戰，按鈕回大廳
  openFreeOps(from = '') {
    SFX.ui();
    this.foLoad();
    this.foFrom = from;
    if (from === 'lobby' && this.fo.mode === 'level') this.fo.mode = 'seg';
    this.state = 'freeops';
    this.showScreen('freeOps');
    const lobby = from === 'lobby';
    document.getElementById('btnFoGo').style.display = lobby ? 'none' : '';
    document.getElementById('btnFoBack').textContent = lobby ? '返回大廳' : '返回機甲庫';
    this.renderFreeOps();
  },
  foMp() {
    return this.foFrom === 'lobby';
  },
  freeOpsBack() {
    SFX.ui();
    this.foSave();
    if (this.foMp() && this.net && this.net.role) {
      this.foFrom = '';
      this.state = 'lobby';
      this.showScreen('lobby');
      return this.renderLobby();
    }
    this.foFrom = '';
    this.openGarage();
  },
  // 「出擊」：回機甲庫照一般的出擊流程（讀本地模型、出擊演出）
  freeOpsGo() {
    this.foSave();
    this.foFrom = '';
    this.openGarage();
    const b = document.getElementById('btnSortie');
    if (b && !b.disabled) b.onclick();
  },
  // 機甲庫的「出擊」（出擊演出之後）
  freeGo() {
    const fo = this.foCur();
    if ((this.net && this.net.role) || fo.mode === 'level') return this.startMission();
    return this.foBegin();
  },
  renderFreeOps() {
    const fo = this.foCur();
    const $ = (id) => document.getElementById(id);
    $('foModes').innerHTML = Object.keys(FO_MODES)
      .filter((k) => !(this.foMp() && k === 'level'))
      .map(
        (k) =>
          `<button data-mode="${k}" class="${fo.mode === k ? 'on' : ''}">${escHtml(FO_MODES[k])}</button>`,
      )
      .join('');
    for (const b of $('foModes').querySelectorAll('button'))
      b.onclick = () => {
        SFX.ui();
        fo.mode = b.dataset.mode;
        if (fo.mode === 'chain' && !fo.segs.length) fo.segs = [0, 1, 2].map(() => foSegSanitize(foDefault()));
        this.foSave();
        this.renderFreeOps();
      };
    $('foDesc').textContent = FO_MODE_DESC[fo.mode];
    let h = '';
    if (fo.mode === 'level') h = this.foLevelHtml();
    else if (fo.mode === 'seg')
      h =
        this.foSegHtml(
          fo,
          '',
          FO_TYPES.filter((t) => !(this.foMp() && FO_SOLO.includes(t))),
        ) +
        this.foLevelSel() +
        this.foRulesHtml();
    else if (fo.mode === 'chain') h = this.foChainHtml() + this.foLevelSel() + this.foRulesHtml();
    else h = this.foSortieHtml() + this.foRulesHtml();
    $('foBody').innerHTML = h;
    $('foInfo').innerHTML = this.foInfoHtml();
    this.foBind();
  },
  // 一列下拉選單
  foSel(label, path, opts, cur, title = '') {
    return `<label class="foRow"${title ? ` title="${escHtml(title)}"` : ''}><span>${escHtml(label)}</span><select data-fo="${path}">${opts.map(([v, n]) => opt(v, n, cur)).join('')}</select></label>`;
  },
  foLevelSel() {
    const fo = this.fo,
      max = this.save.level || 1;
    const ls = [];
    for (let i = max; i >= 1; i--) ls.push([i, `Lv ${i}${i === max ? '（目前）' : ''}`]);
    return this.foSel('敵人等級', 'level', ls, fo.level, '手動選的等級不推進自由出擊的等級');
  },
  // 模式「戰鬥（依等級）」：地圖與變體（原本機甲庫設定頁的那兩個選單）
  foLevelHtml() {
    const L = this.save.level || 1;
    const map = this.mapPref();
    const vs = map ? variantKeys(map).filter((k) => !VARIANTS[map][k].border) : [];
    const v = this.variantPref();
    const next = isBossLevel(L) ? `決戰任務：${bossForLevel(L).name}` : '一般任務（分波增援、據點）';
    return (
      `<div class="foNote">任務 ${String(L).padStart(2, '0')}：${escHtml(next)}</div>` +
      this.foSel(
        '地圖',
        '@map',
        [
          ['', '隨機'],
          ...Object.keys(THEMES).map((k) => [k, THEMES[k].name]),
          ['airspace', THEMES.airspace.name],
        ],
        map,
      ) +
      (map && map !== 'airspace'
        ? this.foSel(
            '主題變體',
            '@variant',
            [['', '隨機'], ['base', '標準'], ...vs.map((k) => [k, VARIANTS[map][k].name])],
            v === 'base' || vs.includes(v) ? v : '',
          )
        : '')
    );
  },
  // 一個區段的欄位（單一區段：path＝''；連續出擊：'segs.<i>.'）
  foSegHtml(s, path, types, compact = false) {
    const th = s.theme;
    const rows = [];
    rows.push(
      this.foSel(
        '任務',
        path + 'type',
        types.map((t) => [t, SEG_TYPES[t].name]),
        s.type,
      ),
    );
    if (s.type !== 'air') {
      rows.push(
        this.foSel(
          '地圖',
          path + 'theme',
          [['', '隨機'], ...Object.keys(THEMES).map((k) => [k, THEMES[k].name])],
          th,
        ),
      );
      if (th && variantKeys(th).length)
        rows.push(
          this.foSel(
            '主題變體',
            path + 'variant',
            [
              ['', '隨機'],
              ['base', '標準'],
              ...variantKeys(th).map((k) => [
                k,
                VARIANTS[th][k].name + (VARIANTS[th][k].border ? '（交界）' : ''),
              ]),
            ],
            s.variant,
          ),
        );
    }
    if (s.type === 'boss')
      rows.push(
        this.foSel('Boss', path + 'boss', [['', '隨機'], ...BOSS_DEFS.map((b, i) => [i, b.name])], s.boss) +
          `<label class="foRow foChk"><span></span><span><input type="checkbox" data-fo="${path}echo"${s.echo ? ' checked' : ''}> 殘響化（AP ×1.1、能量減傷、一開始就是第二型態）</span></label>`,
      );
    if (s.type === 'elite')
      rows.push(
        this.foSel(
          '敵對機甲',
          path + 'ace',
          [
            ['', '地圖的專屬機甲'],
            ...Object.keys(ACES).map((k) => ['a:' + k, `${ACES[k].name}（專屬）`]),
            ...Object.keys(AC_ROSTER).map((k) => ['r:' + k, AC_ROSTER[k].name]),
          ],
          s.ace,
        ),
      );
    if (s.type === 'colossus')
      rows.push(
        this.foSel(
          '大型兵器',
          path + 'col',
          [['', '隨機'], ...Object.keys(COL_NAMES).map((k) => [k, COL_NAMES[k]])],
          s.col,
        ),
      );
    if (compact || s.type === 'air') return rows.join('');
    // 地圖細項
    const lms = th ? landmarkKeys(th) : [];
    if (s.type !== 'boss' && lms.length)
      rows.push(
        this.foSel(
          '地標',
          path + 'landmark',
          [['', '隨機'], ['none', '沒有'], ...lms.map((k) => [k, LANDMARKS[th][k].name])],
          s.landmark,
        ),
      );
    rows.push(this.foSel('時間', path + 'tod', [['', '隨機'], ...TODS.map((k) => [k, TOD_NAMES[k]])], s.tod));
    rows.push(
      this.foSel(
        '天候',
        path + 'weather',
        [['', '地圖預設'], ...Object.keys(WEATHER_NAMES).map((k) => [k, WEATHER_NAMES[k]])],
        s.weather,
      ),
    );
    if (!['boss', 'elite', 'escort', 'defend', 'supply', 'chase', 'colossus'].includes(s.type))
      rows.push(
        this.foSel(
          '作戰區域',
          path + 'zone',
          [['', '隨機'], ...Object.keys(ZONE_NAMES).map((k) => [k, ZONE_NAMES[k]])],
          s.zone,
        ),
      );
    if (th && ['down'].includes(THEME_MODE[th]))
      rows.push(
        this.foSel(
          '深度',
          path + 'depth',
          [0, 1, 2, 3, 4].map((d) => [d, d ? `第 ${d} 層（越深越暗、專屬敵人越多）` : '地表附近']),
          s.depth,
        ),
      );
    return rows.join('');
  },
  foChainHtml() {
    const fo = this.fo;
    let h = this.foSel(
      '段數',
      'n',
      [2, 3, 4, 5].map((n) => [n, `${n} 段`]),
      fo.chainRandom ? fo.n : fo.segs.length,
    );
    h += `<label class="foRow foChk"><span></span><span><input type="checkbox" data-fo="chainRandom"${fo.chainRandom ? ' checked' : ''}> 隨機排程（每段的任務與地圖隨機，出口選下一段）</span></label>`;
    if (!fo.chainRandom) {
      while (fo.segs.length < fo.n) fo.segs.push(foSegSanitize(foDefault()));
      fo.segs.length = fo.n;
      h += fo.segs
        .map(
          (s, i) =>
            `<div class="foSeg"><div class="foSegH">第 ${i + 1} 段</div>${this.foSegHtml(
              s,
              `segs.${i}.`,
              FO_CHAIN_TYPES.filter((t) => !(this.foMp() && FO_SOLO.includes(t))),
              true,
            )}</div>`,
        )
        .join('');
    }
    return h;
  },
  foSortieHtml() {
    const fo = this.fo;
    const ids = sortieIds();
    if (!SORTIES[fo.sid]) fo.sid = ids[0];
    const grp = {};
    for (const k of ids) (grp[SORTIES[k].chapter] = grp[SORTIES[k].chapter] || []).push(k);
    const tag = (k) => {
      const B = BRIEFINGS[k] || {};
      return B.cycle === 3 ? '（ECHO）' : B.cycle === 2 ? '（第 2 周目）' : '';
    };
    let h = `<label class="foRow"><span>出擊</span><select data-fo="sid">`;
    for (const ch of Object.keys(grp).sort((a, b) => a - b))
      h += `<optgroup label="第 ${ch} 章">${grp[ch].map((k) => opt(k, SORTIES[k].name + tag(k), fo.sid)).join('')}</optgroup>`;
    return h + '</select></label>';
  },
  // 規則類：委託板的規則、危險條款、詞綴、宿敵、僚機
  foRulesHtml() {
    const fo = this.fo;
    let h = '<div class="foSegH">規則</div>';
    h += this.foSel(
      '特殊規則',
      'rule',
      [['', '無'], ...Object.keys(RULES).map((k) => [k, `${RULES[k].name}：${RULES[k].desc}`])],
      fo.rule,
    );
    h += this.foSel(
      '敵人詞綴',
      'affix',
      [
        ['auto', '依等級（主線的機率）'],
        ['off', '沒有'],
        ['all', '全部帶詞綴'],
      ],
      fo.affix,
    );
    // 僚機與宿敵只有單人（wing.js、nemesis.js）
    if (!this.foMp())
      h +=
        this.foSel(
          '僚機',
          'wing',
          [['', '不帶'], ...Object.keys(WINGMEN).map((k) => [k, WINGMEN[k].name])],
          fo.wing,
        ) +
        `<label class="foRow foChk"><span></span><span><input type="checkbox" data-fo="nem"${fo.nem ? ' checked' : ''}> 宿敵闖入（擊倒過你的敵人會在區段中途出現，被擊倒時也會記成宿敵）</span></label>`;
    else h += '<div class="dim foNote">多人時沒有僚機與宿敵闖入；空戰只有單人。</div>';
    h += Object.keys(HEAT)
      .map(
        (k) =>
          `<label class="foRow foChk"><span></span><span><input type="checkbox" data-heat="${k}"${fo.heat[k] ? ' checked' : ''}> ${escHtml(HEAT[k].name)}：${escHtml(HEAT[k].desc)}（報酬 +${Math.round(HEAT[k].k * 100)}%）</span></label>`,
      )
      .join('');
    return h;
  },
  foBind() {
    const fo = this.fo;
    const set = (path, v) => {
      if (path === '@map') {
        this.setMapPref(v);
        return;
      }
      if (path === '@variant') return this.setVariantPref(v);
      const ks = path.split('.');
      let o = fo;
      for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
      const k = ks[ks.length - 1];
      o[k] = typeof o[k] === 'number' ? +v : v;
      // 換主題時清掉不屬於它的變體與地標
      if (k === 'theme') {
        o.variant = '';
        o.landmark = '';
        o.depth = 0;
      }
      if (k === 'n') fo.n = +v;
    };
    for (const el of document.querySelectorAll('#foBody [data-fo]'))
      el.onchange = () => {
        set(el.dataset.fo, el.type === 'checkbox' ? el.checked : el.value);
        this.fo = foSanitize(fo, this.save.level || 1);
        this.foSave();
        this.renderFreeOps();
      };
    for (const el of document.querySelectorAll('#foBody [data-heat]'))
      el.onchange = () => {
        if (el.checked) fo.heat[el.dataset.heat] = true;
        else delete fo.heat[el.dataset.heat];
        this.foSave();
        this.renderFreeOps();
      };
  },
  // 右側的說明：任務目標、地圖、對手、報酬
  foInfoHtml() {
    const fo = this.fo;
    const L = this.save.level || 1;
    const rows = [];
    const line = (k, v) =>
      rows.push(
        `<div class="foInfoRow"><span class="dim">${escHtml(k)}</span><span>${escHtml(v)}</span></div>`,
      );
    if (fo.mode === 'level') {
      line('等級', `任務 ${String(L).padStart(2, '0')}（完成後推進）`);
      if (isBossLevel(L)) line('Boss', bossForLevel(L).intro || bossForLevel(L).name);
      return rows.join('');
    }
    if (fo.mode === 'sortie') {
      const so = SORTIES[fo.sid];
      if (!so) return '';
      line('等級', `Lv ${so.level}（主線的設定）`);
      line('段數', `${so.segs.length} 段：${so.segs.map((s) => THEMES[s.theme].name).join('→')}`);
      const b = so.segs[so.segs.length - 1];
      if (b.pool[0] === 'boss' && b.boss) line('終點', String(b.boss));
      line('完成報酬', `${so.reward.toLocaleString()} SP`);
      return (
        rows.join('') + '<div class="dim foNote">不播劇情、不寫主線的進度與抉擇；戰術模組從零開始。</div>'
      );
    }
    const n = fo.mode === 'chain' ? (fo.chainRandom ? fo.n : fo.segs.length) : 1;
    if (fo.mode === 'seg') {
      line('目標', SEG_TYPES[fo.type].goal);
      if (fo.type === 'boss' && fo.boss !== '') {
        const bd = BOSS_DEFS[+fo.boss];
        if (bd) line('Boss', bd.intro || bd.name);
      }
      if (fo.type === 'elite') {
        const a = fo.ace.startsWith('a:')
          ? ACES[fo.ace.slice(2)]
          : fo.ace.startsWith('r:')
            ? AC_ROSTER[fo.ace.slice(2)]
            : fo.theme && THEME_ACE[fo.theme]
              ? ACES[THEME_ACE[fo.theme]]
              : null;
        if (a) line('敵對機甲', a.intro || a.name);
      }
      if (fo.theme && fo.landmark && fo.landmark !== 'none' && LANDMARKS[fo.theme][fo.landmark])
        line('地標', LANDMARKS[fo.theme][fo.landmark].name);
      if (FO_SOLO.includes(fo.type)) line('注意', '空戰只有單人（地圖換成空域）');
    }
    line('等級', `Lv ${fo.level}（不推進自由出擊的等級）`);
    const hk = 1 + Object.keys(fo.heat).reduce((a, k) => a + (HEAT[k] ? HEAT[k].k : 0), 0);
    line('完成報酬', `${Math.round(foReward(fo.level, n) * hk).toLocaleString()} SP`);
    return rows.join('');
  },

  // ---------- 出擊 ----------
  // 把一個區段的設定決定成實際的內容（隨機的項目、地圖合不合用）；msgs 收集換掉的原因
  foResolveSeg(s, L, msgs, mp) {
    let type = s.type;
    if (FO_SOLO.includes(type) && mp) type = 'battle';
    const all = Object.keys(THEMES);
    let bd = null,
      boss = null;
    if (type === 'boss') {
      boss = s.boss !== '' && BOSS_DEFS[+s.boss] ? +s.boss : Math.floor(Math.random() * BOSS_DEFS.length);
      bd = BOSS_DEFS[boss];
    }
    // 主題：沒選＝隨機；選的不合用（公路、鐵路、bossBan）時換一個
    let th = THEMES[s.theme] ? s.theme : '';
    let v =
      th && s.variant && s.variant !== 'base' && VARIANTS[th] && VARIANTS[th][s.variant] ? s.variant : '';
    if (th && !fitsTheme(th, v, type, bd)) {
      if (v && fitsTheme(th, '', type, bd)) v = '';
      else {
        const alt = pick(all.filter((k) => fitsTheme(k, '', type, bd)));
        msgs.push(
          `${type === 'boss' ? bd.name.split(' ')[0] : SEG_TYPES[type].name}不適合在「${THEMES[th].name}」作戰，改到「${THEMES[alt].name}」`,
        );
        th = alt;
        v = '';
      }
    }
    if (!th) th = pick(all.filter((k) => fitsTheme(k, '', type, bd)));
    // 變體：沒選＝隨機（主線一律有變體，這裡一半標準）；交界變體要明確選
    if (!s.variant && th !== s.theme) v = '';
    if (!s.variant) {
      const ks = variantKeys(th).filter((k) => !VARIANTS[th][k].border && fitsTheme(th, k, type, bd));
      v = ks.length && Math.random() < 0.5 ? pick(ks) : '';
    }
    const border = !!(v && VARIANTS[th][v].border);
    // 地標：Boss 區段沒有
    const lms = landmarkKeys(th);
    let lm = null;
    if (type !== 'boss' && lms.length) {
      if (s.landmark && s.landmark !== 'none' && lms.includes(s.landmark)) lm = s.landmark;
      else if (!s.landmark) lm = pick(lms);
    }
    const r = {
      theme: th,
      type,
      variant: v || null,
      border,
      landmark: lm,
      tod: TODS.includes(s.tod) ? s.tod : pick(TODS),
      weather: WEATHER_NAMES[s.weather] ? s.weather : null,
      zone: ZONE_NAMES[s.zone] ? s.zone : pick(Object.keys(ZONE_NAMES)),
      zoneAxis: Math.random() < 0.5 ? 0 : 1,
      depth: THEME_MODE[th] === 'down' ? s.depth || 0 : 0,
      col: COL_NAMES[s.col] ? s.col : '',
    };
    if (boss != null) {
      r.boss = boss;
      r.echo = !!s.echo;
    }
    if (type === 'elite' && s.ace) {
      if (s.ace.startsWith('a:') && ACES[s.ace.slice(2)]) r.ace = s.ace.slice(2);
      else if (s.ace.startsWith('r:') && AC_ROSTER[s.ace.slice(2)]) r.acr = s.ace.slice(2);
    }
    return r;
  },
  // 連續出擊的隨機排程：中間的段從一般的類型抽、最後一段是 Boss 或精英（出口選下一段時改成那個出口的類型）
  foChainSegs(fo, mp) {
    if (!fo.chainRandom) return fo.segs.slice(0, 5);
    const n = fo.n;
    const mid = [
      'battle',
      'destroy',
      'defend',
      'intel',
      'elite',
      'breakthrough',
      'extract',
      'front',
      'escort',
      'chase',
      'supply',
    ];
    const out = [];
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const type = last ? pick(['boss', 'boss', 'elite', 'colossus']) : i === 0 ? 'battle' : pick(mid);
      out.push({
        ...foSegSanitize({ type }),
        pool: last ? null : mid.filter((t) => !(mp && FO_SOLO.includes(t))),
      });
    }
    return out;
  },
  foBegin() {
    if (this.srvGate(() => this.foBegin())) return; // 伺服器預設組還在讀（local-lib.js）
    const fo = this.foCur();
    const mp = !!(this.net && this.net.role);
    const msgs = [];
    if (fo.mode === 'sortie') {
      const sid = SORTIES[fo.sid] ? fo.sid : sortieIds()[0];
      const asm = fo.rule === 'loaner' ? { ...pick(Object.values(AC_ROSTER)).asm } : undefined;
      this.campBegin(sid, { free: { ...fo, sortie: sid, asm }, heat: { ...fo.heat } });
      return;
    }
    const L = Math.max(1, Math.min(this.save.level || 1, fo.level));
    // 多人沒有「依等級」（房間模式的 PVE 合作就是）：當成單一區段
    const src =
      fo.mode === 'chain'
        ? this.foChainSegs(fo, mp)
        : [{ ...fo, type: fo.mode === 'level' ? 'battle' : fo.type }];
    const rs = src.map((s) => this.foResolveSeg(s, L, msgs, mp));
    const { so, plan } = freeSortie(fo, rs, L);
    // 隨機排程：中間的段可以由出口改成別的類型（pool），第一段照抽到的
    src.forEach((s, i) => {
      if (s.pool) so.segs[i].pool = [rs[i].type, ...s.pool.filter((t) => t !== rs[i].type && t !== 'boss')];
    });
    if (fo.rule === 'loaner') so.asm = { ...pick(Object.values(AC_ROSTER)).asm };
    Object.defineProperty(SORTIES, 'fr', {
      value: so,
      enumerable: false,
      configurable: true,
      writable: true,
    });
    this.campBegin('fr', { free: { ...fo }, plan, types: [rs[0].type], heat: { ...fo.heat } });
    for (const [i, m] of msgs.entries()) setTimeout(() => this.flashMsg(m, 0xffb020, 4), 300 + i * 1500);
  },
});
