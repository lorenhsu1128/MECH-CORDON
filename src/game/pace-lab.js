// Game：遊戲節奏調整室（2026-11-18 使用者要求，docs/pace-lab-design.md）。標題「工具與其他」進入：選地圖、敵人編成出擊，
// 右側的面板邊玩邊調 data/pace.js 的倍率（機動、射擊、敵人、近戰、每一把武器），改了馬上生效；參數只在這裡生效
// （PACE.on），不寫存檔（不給獎勵、經驗，被擊破就重新出場），敵人清完自動補下一批。設定組存在 localStorage mech_cordon_pace。
import { Game } from './game.js';
import { SFX } from '../audio/audio.js';
import { MechEntity } from '../entities/mech-entity.js';
import { PACE, PACE_GROUPS, PACE_WPN_KEYS, paceDefault } from '../data/pace.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { FOES } from '../data/foes.js';
import { PARTS, START_ASM } from '../data/parts.js';
import { THEMES } from '../world/world.js';
import { VARIANTS } from '../world/variants.js';
import { escHtml } from '../core/html.js';

const KEY = 'mech_cordon_pace';
const $ = (id) => document.getElementById(id);
const CFG0 = {
  theme: 'industrial',
  variant: 'base',
  level: 5,
  foe: 'mix',
  n: 6,
  ace: false,
  loop: true,
  god: false,
  ammo: true,
  aggro: true,
  hand: START_ASM.rarm, // 雙手的手部武器（左右同一把）
  back: START_ASM.rback, // 雙肩的肩部武器
};
const r2 = (x) => Math.round(x * 100) / 100;

function loadStore() {
  let d = null;
  try {
    d = JSON.parse(localStorage.getItem(KEY) || 'null');
  } catch (e) {}
  if (!d || typeof d !== 'object' || !d.sets) d = { cur: '預設', sets: { 預設: { v: {}, w: {} } }, cfg: {} };
  if (!d.sets[d.cur]) d.cur = Object.keys(d.sets)[0] || '預設';
  if (!d.sets[d.cur]) d.sets[d.cur] = { v: {}, w: {} };
  d.cfg = { ...CFG0, ...(d.cfg || {}) };
  return d;
}
function saveStore(d) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch (e) {}
}
// 只留和 1（或預設值）不同的項目
function clean(set) {
  const v = {},
    w = {};
  for (const k in set.v || {}) if (Math.abs(set.v[k] - paceDefault(k)) > 1e-4) v[k] = r2(set.v[k]);
  for (const id in set.w || {}) {
    const o = {};
    for (const k in set.w[id]) if (Math.abs(set.w[id][k] - 1) > 1e-4) o[k] = r2(set.w[id][k]);
    if (Object.keys(o).length) w[id] = o;
  }
  return { v, w };
}
// 武器清單（不含空的）：手部 arm、肩部 back
const weaponList = (cat) => (PARTS[cat] || []).filter((d) => d.type !== 'none');

Object.assign(Game.prototype, {
  // 調整室的機體組合：預設機甲＋面板選的手部武器（雙手）與肩部武器（雙肩）
  paceAsm() {
    const c = this.paceLab.cfg;
    const ok = (cat, id) => weaponList(cat).some((d) => d.id === id);
    const h = ok('arm', c.hand) ? c.hand : START_ASM.rarm;
    const b = ok('back', c.back) ? c.back : START_ASM.rback;
    return { ...START_ASM, rarm: h, larm: h, rback: b, lback: b };
  },
  // 換上新的機體（被擊破後重新出場、換武器）；at＝沿用原本的位置與朝向
  paceRespawn(at) {
    const old = this.player;
    if (old) {
      old.dead = true;
      old.cleanup();
    }
    this.player = new MechEntity(this, this.paceAsm(), this.myPal(), {
      team: 'player',
      name: 'KEYSTONE',
      palKey: this.myPalKey(),
      slot: 0,
    });
    if (at && old) {
      this.player.pos.copy(old.pos);
      this.player.yaw = old.yaw;
      if (old.aimYaw !== undefined) this.player.aimYaw = old.aimYaw;
      this.player.mesh.position.copy(old.pos);
      this.player.lock = old.lock || null;
    } else this.placeStart(this.player);
    this.players = [this.player];
    this.renderWeaponHud(true);
  },
  // ---------- 進入／離開 ----------
  openPace() {
    if (this.net && this.net.role) return;
    SFX.init();
    const st = loadStore();
    this.paceLab = {
      st,
      cfg: st.cfg,
      stats: null,
      wait: 0,
      open: { world: true, pmove: true, pshot: true },
    };
    this.paceApplySet();
    PACE.on = true;
    this.paceBuildUi();
    this.paceStart();
  },
  exitPace() {
    if (!this.paceLab) return;
    PACE.on = false;
    PACE.ver++;
    this.clearMission();
    this.paceLab = null;
    $('pacePanel').hidden = true;
    document.body.classList.remove('paceLab');
    $('btnAbort').textContent = '放棄任務';
    this.state = 'title';
    this.showScreen('title');
  },
  // 目前的設定組 → PACE
  paceApplySet() {
    const P = this.paceLab,
      set = P.st.sets[P.st.cur];
    PACE.v = { ...(set.v || {}) };
    PACE.w = JSON.parse(JSON.stringify(set.w || {}));
    PACE.ver++;
  },
  paceSave() {
    const P = this.paceLab;
    P.st.sets[P.st.cur] = clean({ v: PACE.v, w: PACE.w });
    P.st.cfg = P.cfg;
    saveStore(P.st);
  },
  // 出擊（照自由出擊的流程，mission.js 的 startMission 看 this.paceLab 換成這裡的地圖與編成）
  paceStart() {
    const P = this.paceLab;
    P.stats = { t0: 0, kills: 0, ttk: [], taken: 0, shots: 0, hits: 0, qb: 0, downs: 0, born: new Map() };
    P.wait = 0;
    this.startMission();
    if (!this.paceLab) return;
    $('btnAbort').textContent = '離開節奏調整室';
    document.body.classList.add('paceLab');
    this.levelName = '節奏調整室・' + (THEMES[P.cfg.theme] ? THEMES[P.cfg.theme].name : '');
    this.paceRender();
  },
  // 敵人的編成（startMission 呼叫）：依等級的一般編成，或指定的敵人 n 台；可以加一台敵對 AC
  paceSpawn(np, scaleHp, scaleDmg) {
    const c = this.paceLab.cfg;
    let comp;
    if (c.foe === 'mix') comp = this.foeMix(this.rollComp(c.level, np), this.worldTheme, 0, true);
    else {
      const n = Math.max(1, Math.round(c.n * (PACE.v.eCount ?? 1)));
      comp = Array.from({ length: n }, () => c.foe);
    }
    if (c.ace) comp.push('ac');
    this.spawnComp(comp, np, scaleHp, scaleDmg, !c.aggro); // 一出現就交戰（勾掉時第一波照正常遊戲在原地待機）
  },
  // 主迴圈（state 'play'）：敵人清完補下一批、無敵、彈藥無限、統計
  paceTick(dt) {
    const P = this.paceLab;
    if (!P || !this.player) return;
    const S = P.stats;
    S.t0 += dt;
    const p = this.player;
    if (P.cfg.god && !p.dead && p.hp < p.maxHp * 0.35) p.hp = p.maxHp;
    if (P.cfg.ammo && !p.dead)
      for (const k in p.weapons) {
        const w = p.weapons[k];
        if (w && w.def && w.ammo !== undefined && w.def.mag) w.ammo = Math.max(w.ammo, w.def.mag * 2);
      }
    // 敵人的出生時間（擊破時間）
    for (const e of this.enemies) if (!S.born.has(e)) S.born.set(e, S.t0);
    if (P.wait > 0) {
      P.wait -= dt;
      if (P.wait <= 0 && this.player && this.state === 'play') {
        this.paceSpawn(1, this.scaleHp, this.scaleDmg);
        this.flashMsg('下一批敵人', 0xffb020, 1.4);
      }
    }
    if ((this.frames & 15) === 0) this.paceStatsRender();
  },
  // 主迴圈的清除判定（game.js）：自動補下一批（不結束任務）
  paceCleared() {
    const P = this.paceLab;
    if (P.wait > 0 || !P.cfg.loop) return;
    P.wait = 2.5;
    this.flashMsg('清除 — 2.5 秒後補下一批', 0x7ee081, 1.6);
  },
  paceKill(e) {
    const S = this.paceLab.stats;
    S.kills++;
    const b = S.born.get(e);
    if (b !== undefined) S.ttk.push(S.t0 - b);
    S.born.delete(e);
  },
  paceDead() {
    const S = this.paceLab.stats;
    S.downs++;
    this.flashMsg('機體已被擊破 — 重新出場', 0xff4d4d, 1.6);
    setTimeout(() => {
      if (!this.paceLab || !this.world) return;
      this.paceRespawn(false);
    }, 1500);
  },
  // 鍵盤：面板裡的輸入框不當成遊戲操作；` 鍵開關面板
  paceKey(e) {
    const t = e.target;
    if (t && t.closest && t.closest('#pacePanel') && /INPUT|SELECT|TEXTAREA/.test(t.tagName)) return true;
    if (e.code === 'Backquote') {
      $('pacePanel').classList.toggle('mini');
      return true;
    }
    return false;
  },

  // ---------- 面板 ----------
  paceBuildUi() {
    let el = $('pacePanel');
    if (!el) {
      el = document.createElement('div');
      el.id = 'pacePanel';
      $('ui').appendChild(el);
      // 面板上的滑鼠操作不當成開火（input.js 的 mousedown 看 closest('#pacePanel')）
      el.addEventListener('input', (e) => this.paceInput(e));
      el.addEventListener('change', (e) => this.paceInput(e, true));
      el.addEventListener('click', (e) => this.paceClick(e));
    }
    el.hidden = false;
    // 觸控裝置：一開始收合（面板會蓋住觸控按鈕）
    el.classList.toggle('mini', document.body.classList.contains('touchDev'));
  },
  paceRender() {
    const P = this.paceLab,
      el = $('pacePanel');
    if (!P || !el) return;
    const c = P.cfg;
    const opt = (v, t, cur) =>
      `<option value="${escHtml(String(v))}"${String(v) === String(cur) ? ' selected' : ''}>${escHtml(t)}</option>`;
    const themes = Object.keys(THEMES)
      .map((k) => opt(k, THEMES[k].name, c.theme))
      .join('');
    const vars = [opt('base', '標準', c.variant)]
      .concat(
        Object.keys(VARIANTS[c.theme] || {})
          .filter((k) => !VARIANTS[c.theme][k].border)
          .map((k) => opt(k, VARIANTS[c.theme][k].name, c.variant)),
      )
      .join('');
    const foes =
      opt('mix', '依等級的一般編成', c.foe) +
      Object.keys(ENEMY_TYPES)
        .filter((k) => !k.startsWith('ac'))
        .map((k) => opt(k, ENEMY_TYPES[k].name, c.foe))
        .join('') +
      Object.keys(FOES)
        .filter((k) => !FOES[k].spawnOnly)
        .map((k) => opt(k, '專屬・' + FOES[k].name, c.foe))
        .join('');
    const sets = Object.keys(P.st.sets)
      .map((k) => opt(k, k, P.st.cur))
      .join('');
    const chk = (k, t) =>
      `<label class="pcChk"><input type="checkbox" data-cfg="${k}"${c[k] ? ' checked' : ''}>${t}</label>`;
    let h = `<div class="pcHead"><b>節奏調整室</b><span class="pcHint">\` 鍵收合　改了馬上生效</span><button data-pa="mini">收合</button></div><div class="pcBody">`;
    h += `<section class="pcSec"><h4>設定組</h4><div class="pcRow"><select data-pa="set">${sets}</select></div>
      <div class="pcRow"><input type="text" maxlength="24" placeholder="名稱（另存新的、改名用）" data-pa="name"></div>
      <div class="pcRow pcBtns"><button data-pa="new">另存新的</button><button data-pa="ren">改名</button><button data-pa="del">刪除</button><button data-pa="reset">全部恢復預設</button></div>
      <div class="pcRow pcBtns"><button data-pa="export">匯出 JSON</button><button data-pa="import">匯入 JSON</button></div>
      <textarea class="pcIo" data-pa="io" hidden></textarea></section>`;
    h += `<section class="pcSec"><h4>戰場</h4>
      <div class="pcRow"><span>地圖</span><select data-cfg="theme">${themes}</select></div>
      <div class="pcRow"><span>變體</span><select data-cfg="variant">${vars}</select></div>
      <div class="pcRow"><span>等級</span><input type="number" min="1" max="30" step="1" data-cfg="level" value="${c.level}"></div>
      <div class="pcRow"><span>敵人</span><select data-cfg="foe">${foes}</select></div>
      <div class="pcRow"><span>台數</span><input type="number" min="1" max="30" step="1" data-cfg="n" value="${c.n}"></div>
      <div class="pcRow pcChks">${chk('ace', '加一台敵對 AC')}${chk('aggro', '一出現就交戰')}${chk('loop', '清完自動補')}${chk('god', '不會被擊破')}${chk('ammo', '彈藥無限')}</div>
      <div class="pcRow pcBtns"><button class="primary" data-pa="restart">套用戰場並重新開始</button></div></section>`;
    h += `<section class="pcSec pcStats" id="pcStats"></section>`;
    for (const G of PACE_GROUPS) {
      const on = P.open[G.k];
      h += `<section class="pcSec"><h4 data-pa="fold" data-g="${G.k}">${on ? '▾' : '▸'} ${escHtml(G.name)}</h4>`;
      if (on)
        for (const it of G.items)
          h += this.paceSlider(
            it[0],
            it[1],
            it[2],
            it[3],
            it[4],
            PACE.v[it[0]] ?? paceDefault(it[0]),
            paceDefault(it[0]),
          );
      h += '</section>';
    }
    // 武器：手部（雙手同一把）與肩部（雙肩同一組），選了就換裝；下面是這把武器自己的倍率
    const changed = Object.keys(PACE.w).filter((id) =>
      Object.values(PACE.w[id]).some((x) => Math.abs(x - 1) > 1e-4),
    );
    const asm = this.paceAsm();
    h += `<section class="pcSec"><h4 data-pa="fold" data-g="wpn">${P.open.wpn ? '▾' : '▸'} 武器（換裝＋這把武器的倍率）</h4>`;
    if (P.open.wpn) {
      for (const [cat, key, label, cur] of [
        ['arm', 'hand', '手部武器（雙手）', asm.rarm],
        ['back', 'back', '肩部武器（雙肩）', asm.rback],
      ]) {
        const WL = weaponList(cat);
        h += `<div class="pcRow"><label>${label}</label><select data-pa="wsel" data-wk="${key}">${WL.map((d) => opt(d.id, d.name + (changed.includes(d.id) ? ' ●' : ''), cur)).join('')}</select></div>`;
        const W = PACE.w[cur] || {};
        for (const [k, name] of PACE_WPN_KEYS)
          h += this.paceSlider('w:' + key + ':' + k, name, 0.1, 4, '', W[k] ?? 1, 1);
      }
      const all = [...weaponList('arm'), ...weaponList('back')];
      h += `<div class="pcNote">●＝調過的武器${changed.length ? '：' + changed.map((id) => escHtml((all.find((d) => d.id === id) || {}).name || id)).join('、') : ''}</div>`;
    }
    h += '</section></div>';
    el.innerHTML = h;
    this.paceStatsRender();
  },
  paceSlider(k, name, mn, mx, tip, v, def) {
    const mod = Math.abs(v - def) > 1e-4;
    return `<div class="pcSl${mod ? ' mod' : ''}" title="${escHtml(tip || '')}"><span class="pcN">${escHtml(name)}</span>
      <input type="range" min="${mn}" max="${mx}" step="0.05" value="${v}" data-pk="${k}">
      <input type="number" min="${mn}" max="${mx}" step="0.05" value="${r2(v)}" data-pk="${k}">
      <button data-pa="one" data-pk="${k}" title="恢復預設（${def}）">↺</button></div>`;
  },
  paceSet(k, v) {
    const P = this.paceLab;
    if (k.startsWith('w:')) {
      // w:<hand|back>:<倍率鍵>
      const [, slot, wk] = k.split(':');
      const asm = this.paceAsm();
      const id = slot === 'hand' ? asm.rarm : asm.rback;
      (PACE.w[id] = PACE.w[id] || {})[wk] = v;
    } else PACE.v[k] = v;
    PACE.ver++;
    this.paceSave();
  },
  paceInput(e, commit) {
    const P = this.paceLab;
    if (!P) return;
    const t = e.target;
    if (t.dataset.pk) {
      const v = parseFloat(t.value);
      if (!Number.isFinite(v)) return;
      this.paceSet(t.dataset.pk, v);
      // 滑桿與數字欄位同步、改過的標記
      const row = t.closest('.pcSl');
      for (const o of row.querySelectorAll('input')) if (o !== t) o.value = o.type === 'number' ? r2(v) : v;
      const def = t.dataset.pk.startsWith('w:') ? 1 : paceDefault(t.dataset.pk);
      row.classList.toggle('mod', Math.abs(v - def) > 1e-4);
      return;
    }
    if (t.dataset.cfg && commit) {
      const k = t.dataset.cfg;
      P.cfg[k] =
        t.type === 'checkbox'
          ? t.checked
          : t.type === 'number'
            ? Math.max(1, parseInt(t.value) || 1)
            : t.value;
      if (k === 'theme') P.cfg.variant = 'base';
      this.paceSave();
      if (k === 'theme') this.paceRender();
      return;
    }
    if (t.dataset.pa === 'set' && commit) {
      P.st.cur = t.value;
      this.paceApplySet();
      saveStore(P.st);
      this.paceRender();
    } else if (t.dataset.pa === 'wsel' && commit) {
      P.cfg[t.dataset.wk] = t.value;
      this.paceSave();
      if (this.player && !this.player.dead && this.state === 'play') this.paceRespawn(true);
      this.paceRender();
    }
  },
  paceClick(e) {
    const P = this.paceLab;
    const b = e.target.closest && e.target.closest('[data-pa]');
    if (!P || !b || b.tagName === 'SELECT' || b.tagName === 'TEXTAREA' || b.tagName === 'INPUT') return;
    const a = b.dataset.pa;
    SFX.ui();
    const io = $('pacePanel').querySelector('[data-pa="io"]');
    if (a === 'mini') $('pacePanel').classList.toggle('mini');
    else if (a === 'fold') {
      P.open[b.dataset.g] = !P.open[b.dataset.g];
      this.paceRender();
    } else if (a === 'one') {
      const k = b.dataset.pk;
      this.paceSet(k, k.startsWith('w:') ? 1 : paceDefault(k));
      this.paceRender();
    } else if (a === 'restart') this.paceStart();
    else if (a === 'new' || a === 'ren') {
      const nameEl = $('pacePanel').querySelector('[data-pa="name"]');
      const name = ((nameEl && nameEl.value) || '').trim().slice(0, 24);
      if (!name) return this.flashMsg('先在上面的欄位輸入名稱', 0xffb020, 1.4);
      if (P.st.sets[name] && name !== P.st.cur) return this.flashMsg('已經有同名的設定組', 0xff8a8a, 1.4);
      const cur = clean({ v: PACE.v, w: PACE.w });
      if (a === 'ren') delete P.st.sets[P.st.cur];
      P.st.sets[name] = cur;
      P.st.cur = name;
      saveStore(P.st);
      this.paceRender();
    } else if (a === 'del') {
      if (Object.keys(P.st.sets).length <= 1) return this.flashMsg('至少要留一組', 0xff8a8a, 1.2);
      delete P.st.sets[P.st.cur];
      P.st.cur = Object.keys(P.st.sets)[0];
      this.paceApplySet();
      saveStore(P.st);
      this.paceRender();
    } else if (a === 'reset') {
      PACE.v = {};
      PACE.w = {};
      PACE.ver++;
      this.paceSave();
      this.paceRender();
    } else if (a === 'export') {
      io.hidden = false;
      io.value = JSON.stringify({ name: P.st.cur, ...clean({ v: PACE.v, w: PACE.w }) }, null, 1);
      io.select();
      try {
        navigator.clipboard.writeText(io.value);
        this.flashMsg('已複製到剪貼簿', 0x7ee081, 1.2);
      } catch (x) {}
    } else if (a === 'import') {
      if (io.hidden) {
        io.hidden = false;
        io.value = '';
        io.placeholder = '貼上匯出的 JSON，再按一次「匯入 JSON」';
        return;
      }
      try {
        const d = JSON.parse(io.value);
        const name = String(d.name || '匯入').slice(0, 24);
        P.st.sets[name] = clean({ v: d.v || {}, w: d.w || {} });
        P.st.cur = name;
        this.paceApplySet();
        saveStore(P.st);
        this.paceRender();
        this.flashMsg('已匯入「' + name + '」', 0x7ee081, 1.4);
      } catch (x) {
        this.flashMsg('JSON 格式不對', 0xff8a8a, 1.4);
      }
    }
  },
  // 對照用的數字
  paceStatsRender() {
    const P = this.paceLab,
      el = $('pcStats');
    if (!P || !el || !P.stats) return;
    const S = P.stats;
    const min = Math.max(1 / 60, S.t0 / 60);
    const ttk = S.ttk.length ? S.ttk.slice(-20).reduce((a, x) => a + x, 0) / Math.min(20, S.ttk.length) : 0;
    const hr = S.shots ? Math.round((S.hits / S.shots) * 100) : 0;
    const alive = this.enemies ? this.enemies.filter((e) => !e.dead && e.team === 'enemy').length : 0;
    el.innerHTML = `<h4>這一場的數字 <button data-pa="restart" title="重新開始（數字歸零）">重來</button></h4>
      <div class="pcGrid"><span>時間</span><b>${Math.floor(S.t0 / 60)}:${String(Math.floor(S.t0 % 60)).padStart(2, '0')}</b>
      <span>擊破</span><b>${S.kills}（場上 ${alive}）</b>
      <span>平均擊破時間</span><b>${ttk ? ttk.toFixed(1) + ' 秒' : '—'}</b>
      <span>每分鐘受到的傷害</span><b>${Math.round(S.taken / min)}</b>
      <span>命中率</span><b>${S.shots ? hr + '%（' + S.shots + ' 發）' : '—'}</b>
      <span>每分鐘 QB</span><b>${(S.qb / min).toFixed(1)}</b>
      <span>被擊破</span><b>${S.downs}</b></div>`;
  },
});
