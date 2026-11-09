// 零件品級與詞條（docs/gear-rarity-design.md）：純資料與純函式。
// 每件裝備＝{ u 編號, id 零件, q 品級 0～4, ax: [[詞條鍵, 數值, 極品?]], t 調校表, lk 鎖定, nw 新取得, ch 取得的章 }，存在 save.inv；
// 機體的每個槽位裝哪一件記在 save.eq[槽位]＝u（沒有＝那個零件的標準版，擁有零件 id 就能無限裝備，它的調校在 save.tune[零件 id]）。
// 計算：gearPick 依組裝挑出每個槽位的裝備 → 駕駛員的加成表 pm.gr[槽位]＝{ id, q, ax, t }（data/pilot.js 的
// applyPilotStats／pilotWeaponDef 依槽位套用；零件 id 和組裝不同時不套用）。PvP 不套用。
import { PARTS, SLOTS } from './parts.js';
import { TUNE, TUNE_TOTAL, sanitizeTuneRow, tuneBreaks, tuneGroup, tuneLevels } from './tune.js';

export const GRADES = [
  { n: '標準', c: '#c9d2da' },
  { n: '改良', c: '#5fd38a' },
  { n: '精製', c: '#5aa8ff' },
  { n: '特製', c: '#b77bff' },
  { n: '傳說', c: '#ffc040' },
];
export const Q_MAX = 4;
export const GRADE_K = 0.04; // 每一級的主要數值
export const INV_MAX = 80; // 背包上限（裝備中的不算）
// 隨機詞條數：綠 1、藍 2 條數值詞條；紫、金 2 條進階詞條（data/gear-adv.js）
export const AX_N = [0, 1, 2, 2, 2];

// 可以裝備的零件（不含空的、消耗品）
const GEAR_CATS = ['head', 'core', 'arms', 'legs', 'booster', 'generator', 'fcs', 'arm', 'back'];
export const GEAR_CAT = new Map(); // 零件 id → 分類
for (const c of GEAR_CATS) for (const p of PARTS[c] || []) if (!/_none$/.test(p.id)) GEAR_CAT.set(p.id, c);
export const gearPart = (id) => {
  const c = GEAR_CAT.get(id);
  return c ? PARTS[c].find((p) => p.id === id) : null;
};
export const isWeaponCat = (c) => c === 'arm' || c === 'back';
// 詞條用的種類：武器依類型（實彈 kin、爆發 exp、能量 enw、近戰、EMP、盾），其他就是分類
export function gearKind(cat, p) {
  if (!p) return null;
  if (!isWeaponCat(cat)) return cat;
  const t = p.type;
  if (t === 'melee') return 'melee';
  if (t === 'emp') return 'emp';
  if (t === 'shield') return 'shield';
  if (t === 'laser' || t === 'empbeam' || (t === 'shotgun' && p.attr === 'en')) return 'enw';
  if (t === 'shell' || t === 'grenade' || t === 'missile') return 'exp';
  return 'kin';
}
export const GEAR_SLOTS = SLOTS.filter(([, , c]) => GEAR_CATS.includes(c)).map(([k, , c]) => [k, c]);

// ---------- 數值詞條（綠、藍） ----------
// k＝套用的鍵：武器（w）進 pilotWeaponDef 的增量（正＝變好）；整台（m）進加成表；零件（p）改這個零件自己的數值
// r＝範圍；abs＝絕對值（不是百分比）；when(p)＝這個零件有這個數值才抽
const has = (k) => (p) => typeof p[k] === 'number' && p[k] > 0;
const ammoW = (p) => p.type !== 'laser' && p.type !== 'empbeam' && !(p.enShot > 0) && p.mag < 99;
export const AX = {
  // 武器
  dmg: { n: '傷害', at: 'w', k: 'dmg', r: [0.08, 0.15], kinds: ['kin', 'exp', 'enw'] },
  imp: { n: '衝擊', at: 'w', k: 'imp', r: [0.1, 0.2], kinds: ['kin', 'exp', 'enw'], when: has('impact') },
  rld: { n: '裝填時間', at: 'w', k: 'rld', r: [0.1, 0.2], down: 1, kinds: ['kin', 'exp'], when: ammoW },
  mag: { n: '彈匣', at: 'w', k: 'mag', r: [0.15, 0.3], kinds: ['kin'], when: (p) => ammoW(p) && p.mag >= 10 },
  ammo: { n: '總彈數', at: 'w', k: 'ammo', r: [0.15, 0.3], kinds: ['kin', 'exp'], when: ammoW },
  spread: {
    n: '擴散',
    at: 'w',
    k: 'spread',
    r: [0.1, 0.2],
    down: 1,
    kinds: ['kin', 'enw'],
    when: has('spread'),
  },
  ideal: { n: '理想射程', at: 'w', k: 'ideal', r: [0.1, 0.2], kinds: ['kin'], when: has('ideal') },
  pspd: { n: '彈速', at: 'w', k: 'pspd', r: [0.1, 0.2], kinds: ['kin'], when: has('speed') },
  splash: { n: '爆炸範圍', at: 'w', k: 'splash', r: [0.1, 0.2], kinds: ['exp'], when: has('splash') },
  turn: { n: '導彈追蹤', at: 'w', k: 'turn', r: [0.1, 0.2], kinds: ['exp'], when: has('turn') },
  rof: { n: '射擊間隔', at: 'w', k: 'rof', r: [0.06, 0.12], down: 1, kinds: ['enw'], when: has('rof') },
  chg: { n: '充能時間', at: 'w', k: 'chg', r: [0.1, 0.2], down: 1, kinds: ['enw'], when: has('chargeT') },
  enc: {
    n: 'EN 消耗',
    at: 'w',
    k: 'enc',
    r: [0.1, 0.2],
    down: 1,
    kinds: ['enw'],
    when: (p) => p.enPerSec > 0 || p.enShot > 0,
  },
  rng: { n: '射程', at: 'w', k: 'range', r: [0.08, 0.15], kinds: ['enw'] },
  mDmg: { n: '斬擊傷害', at: 'w', k: 'mDmg', r: [0.08, 0.15], kinds: ['melee'] },
  mImp: { n: '近戰衝擊', at: 'w', k: 'mImp', r: [0.1, 0.2], kinds: ['melee'] },
  mRch: { n: '攻擊距離', at: 'w', k: 'mRch', r: [0.08, 0.15], kinds: ['melee'] },
  mEn: { n: 'EN 消耗', at: 'w', k: 'mEn', r: [0.1, 0.2], down: 1, kinds: ['melee'] },
  ecd: { n: '冷卻時間', at: 'w', k: 'rof', r: [0.08, 0.15], down: 1, kinds: ['emp'] },
  rad: { n: '範圍', at: 'w', k: 'radius', r: [0.08, 0.15], kinds: ['emp'] },
  stun: { n: '硬直時間', at: 'w', k: 'stun', r: [0.1, 0.2], kinds: ['emp'] },
  abs: { n: '減傷', at: 'w', k: 'absorb', r: [0.02, 0.04], abs: 1, kinds: ['shield'] },
  // 整台
  ap: { n: '整台 AP', at: 'm', k: 'ap', r: [0.03, 0.06], kinds: ['head', 'core', 'arms', 'legs', 'shield'] },
  stab: { n: '整台姿勢穩定', at: 'm', k: 'stab', r: [0.05, 0.1], kinds: ['head', 'core', 'legs'] },
  lock: { n: '鎖定距離', at: 'm', k: 'lock', r: [0.08, 0.15], kinds: ['head'] },
  lockF: { n: '鎖定距離', at: 'm', k: 'lock', r: [0.1, 0.2], kinds: ['fcs'] },
  enCapC: { n: 'EN 容量', at: 'm', k: 'enCap', r: [0.05, 0.1], kinds: ['core'] },
  spd: { n: '速度', at: 'm', k: 'spd', r: [0.03, 0.06], kinds: ['legs'] },
  jump: { n: '跳躍', at: 'm', k: 'jump', r: [0.1, 0.2], kinds: ['legs', 'booster'] },
  qb: { n: 'QB 推力', at: 'm', k: 'qb', r: [0.06, 0.12], kinds: ['booster'] },
  qbc: { n: 'QB 消耗', at: 'm', k: 'qbc', r: [0.1, 0.2], down: 1, kinds: ['booster'] },
  enCap: { n: 'EN 容量', at: 'm', k: 'enCap', r: [0.08, 0.15], kinds: ['generator'] },
  rch: { n: 'EN 回復', at: 'm', k: 'rch', r: [0.1, 0.2], kinds: ['generator'] },
  dly: { n: 'EN 回復延遲', at: 'm', k: 'dly', r: [0.15, 0.3], down: 1, kinds: ['generator'] },
  enAd: { n: '能量適性', at: 'm', k: 'enAd', r: [0.03, 0.06], abs: 1, kinds: ['generator'] },
  // 這個零件自己的數值
  dfK: { n: '實彈防禦', at: 'p', k: 'dfK', r: [0.2, 0.4], kinds: ['head', 'core', 'arms', 'legs'] },
  dfE: { n: '爆發防禦', at: 'p', k: 'dfE', r: [0.2, 0.4], kinds: ['head', 'core', 'arms', 'legs'] },
  dfN: { n: '能量防禦', at: 'p', k: 'dfN', r: [0.2, 0.4], kinds: ['head', 'core', 'arms', 'legs'] },
  aim: { n: '射擊適性', at: 'p', k: 'aim', r: [0.05, 0.1], abs: 1, kinds: ['arms'] },
  mel: { n: '近戰適性', at: 'p', k: 'mel', r: [0.08, 0.15], kinds: ['arms'] },
  asN: { n: '近距離輔助', at: 'p', k: 'asN', r: [0.05, 0.1], abs: 1, kinds: ['fcs'] },
  asM: { n: '中距離輔助', at: 'p', k: 'asM', r: [0.05, 0.1], abs: 1, kinds: ['fcs'] },
  asF: { n: '遠距離輔助', at: 'p', k: 'asF', r: [0.05, 0.1], abs: 1, kinds: ['fcs'] },
  lks: { n: '導彈鎖定速度', at: 'p', k: 'lks', r: [0.15, 0.3], kinds: ['fcs'] },
};
// 進階詞條（紫、金）的表由 data/gear-adv.js 登記進來（避免互相 import）
export const ADV = {};
export const axDef = (k) => AX[k] || ADV[k] || null;

// 這個零件可以抽的數值詞條
export function axPool(cat, p, adv) {
  const kind = gearKind(cat, p);
  const T = adv ? ADV : AX;
  return Object.keys(T).filter((k) => T[k].kinds.includes(kind) && (!T[k].when || T[k].when(p)));
}
const r3 = (v) => Math.round(v * 1000) / 1000;
// 抽一條（rng＝0～1 的亂數函式）；排除已有的鍵
export function rollAx(cat, p, adv, rng, except = [], star) {
  const pool = axPool(cat, p, adv).filter((k) => !except.includes(k));
  if (!pool.length) return null;
  const k = pool[Math.floor(rng() * pool.length)];
  const D = axDef(k);
  let v = D.r[0] + (D.r[1] - D.r[0]) * rng();
  const st = adv && (star || rng() < 0.1);
  if (st) v *= 1.5;
  return st ? [k, r3(v), 1] : [k, r3(v)];
}
// 產生一件裝備（o.enemy＝敵人身上的：隨機詞條只帶 1 條）
export function rollGear(id, q, rng, o = {}) {
  const cat = GEAR_CAT.get(id),
    p = gearPart(id);
  if (!cat) return null;
  q = Math.max(0, Math.min(Q_MAX, q | 0));
  const ax = [];
  let n = AX_N[q];
  if (o.enemy) n = Math.min(1, n);
  for (let i = 0; i < n; i++) {
    const a = rollAx(
      cat,
      p,
      q >= 3,
      rng,
      ax.map((x) => x[0]),
      q === 4 && i === 0,
    );
    if (a) ax.push(a);
  }
  const g = { u: newUid(rng), id, q, ax };
  if (o.ch) g.ch = o.ch;
  return g;
}
export function newUid(rng = Math.random) {
  return Date.now().toString(36).slice(-6) + Math.floor(rng() * 46656 * 36).toString(36);
}

// ---------- 整理（讀檔、房主校正客機送來的） ----------
function sanitizeAx(ax, cat, p, q) {
  const out = [];
  if (!Array.isArray(ax)) return out;
  const adv = q >= 3;
  const pool = axPool(cat, p, adv);
  for (const a of ax) {
    if (!Array.isArray(a) || out.length >= AX_N[q]) continue;
    const k = a[0];
    if (!pool.includes(k) || out.some((x) => x[0] === k)) continue;
    const D = axDef(k);
    const st = adv && a[2] ? 1 : 0;
    const hi = D.r[1] * (st ? 1.5 : 1);
    const v = Math.max(D.r[0], Math.min(hi, Number(a[1]) || 0));
    out.push(st ? [k, r3(v), 1] : [k, r3(v)]);
  }
  return out;
}
// 一件裝備（背包裡的；沒有 u 時不收）
export function sanitizeGear(g) {
  if (!g || typeof g !== 'object' || typeof g.u !== 'string') return null;
  const cat = GEAR_CAT.get(g.id);
  if (!cat) return null;
  const p = gearPart(g.id);
  const q = Math.max(0, Math.min(Q_MAX, g.q | 0));
  const out = { u: g.u.slice(0, 24), id: g.id, q, ax: sanitizeAx(g.ax, cat, p, q) };
  const t = sanitizeTuneRow(g.t, tuneGroup(cat, p));
  if (t) out.t = t;
  if (g.lk) out.lk = 1;
  if (g.nw) out.nw = 1;
  if (g.ch) out.ch = Math.max(0, g.ch | 0);
  if (g.rr) out.rr = { k: String(g.rr.k || ''), n: Math.max(0, (g.rr && g.rr.n) | 0) }; // 重骰：鎖定的那一條與次數
  return out;
}
export function sanitizeInv(inv) {
  const out = [],
    seen = new Set();
  for (const g of Array.isArray(inv) ? inv : []) {
    const s = sanitizeGear(g);
    if (s && !seen.has(s.u)) {
      seen.add(s.u);
      out.push(s);
    }
  }
  return out;
}
// 加成表用的一個槽位（多人時客機送來的）：{ id, q, ax, t }
export function sanitizeSlotGear(g) {
  if (!g || typeof g !== 'object') return null;
  const cat = GEAR_CAT.get(g.id);
  if (!cat) return null;
  const p = gearPart(g.id);
  const q = Math.max(0, Math.min(Q_MAX, g.q | 0));
  const out = { id: g.id, q, ax: sanitizeAx(g.ax, cat, p, q) };
  const t = sanitizeTuneRow(g.t, tuneGroup(cat, p));
  if (t) out.t = t;
  return out.q || out.ax.length || out.t ? out : null;
}
export function sanitizeGr(gr) {
  const out = {};
  if (!gr || typeof gr !== 'object') return out;
  for (const [k] of GEAR_SLOTS) {
    const s = sanitizeSlotGear(gr[k]);
    if (s) out[k] = s;
  }
  return out;
}

// ---------- 裝備的選擇 ----------
// 比較好的一件：品級 → 調校 → 詞條數
const score = (g) => g.q * 1000 + tuneLevels(g.t) * 10 + g.ax.length;
export function gearBest(inv, id, used) {
  let best = null;
  for (const g of inv || [])
    if (g.id === id && !(used && used.has(g.u)) && (!best || score(g) > score(best))) best = g;
  return best;
}
// 依組裝挑出每個槽位的裝備：{ 槽位: 裝備或 null（標準版） }。pref＝{ 槽位: u }（save.eq），有效時優先
export function gearPick(S, asm, pref) {
  const inv = S.inv || [];
  const used = new Set(),
    out = {};
  pref = pref || {};
  // 先處理有指定的（避免被前面的槽位搶走）；'-:零件 id'＝指定用標準版
  const std = {};
  for (const [k] of GEAR_SLOTS) {
    if (pref[k] && pref[k] === STD + asm[k]) {
      std[k] = 1;
      out[k] = null;
      continue;
    }
    const g = pref[k] && inv.find((x) => x.u === pref[k]);
    if (g && g.id === asm[k] && !used.has(g.u)) {
      out[k] = g;
      used.add(g.u);
    }
  }
  for (const [k] of GEAR_SLOTS) {
    if (out[k] || std[k] || !GEAR_CAT.has(asm[k])) continue;
    const g = gearBest(inv, asm[k], used);
    out[k] = g || null;
    if (g) used.add(g.u);
  }
  return out;
}
// 目前組裝的選擇寫回 save.eq（回傳 gearPick 的結果）
export function gearResolve(S) {
  const pick = gearPick(S, S.asm, S.eq);
  const eq = {};
  for (const k in pick) {
    if (pick[k]) eq[k] = pick[k].u;
    else if (S.eq && S.eq[k] === STD + S.asm[k]) eq[k] = S.eq[k];
  }
  S.eq = eq;
  return pick;
}
export const STD = '-:';
// 分解得到的素材（調校過的另外退還一半的調校費用，game/gear-ui.js）
export const DISMANTLE = [
  { alloy: 1 },
  { alloy: 3 },
  { alloy: 2, circuit: 2 },
  { circuit: 2, core: 1 },
  { shard: 1 },
];
// 機甲庫的零件格子：這個零件 id 在背包裡的件數與最高品級
export function gearTileInfo(inv, id) {
  let n = 0,
    q = 0;
  for (const g of inv || [])
    if (g.id === id) {
      n++;
      q = Math.max(q, g.q);
    }
  return { n, q };
}
// 加成表 pm.gr：{ 槽位: { id, q, ax, t } }；標準版只帶調校（save.tune[零件 id]）
export function gearGr(S, asm, pick) {
  asm = asm || S.asm;
  pick = pick || gearPick(S, asm, S.eq);
  const out = {};
  for (const [k] of GEAR_SLOTS) {
    const id = asm[k];
    if (!GEAR_CAT.has(id)) continue;
    const g = pick[k];
    const t = g ? g.t : (S.tune || {})[id];
    const e = { id, q: g ? g.q : 0, ax: g ? g.ax : [] };
    if (t && tuneLevels(t) + tuneBreaks(t)) e.t = t;
    if (e.q || e.ax.length || e.t) out[k] = e;
  }
  return out;
}

// ---------- 套用 ----------
const WKEY_MAIN = { melee: 'mDmg', emp: 'stun' };
// 武器槽位的增量（正＝變好）：品級＋數值詞條（調校另外在 pilotWeaponDef 加）
export function gearWeaponFx(g, p) {
  const f = {};
  if (!g || !p) return f;
  const kind = gearKind(GEAR_CAT.get(g.id), p);
  if (g.q) {
    if (kind === 'shield') f.absorb = 0.01 * g.q;
    else f[WKEY_MAIN[kind] || 'dmg'] = GRADE_K * g.q;
  }
  for (const [k, v] of g.ax || []) {
    const D = AX[k];
    if (D && D.at === 'w') f[D.k] = (f[D.k] || 0) + v;
  }
  return f;
}
// 機體零件（與盾的整台詞條）：{ m 整台的增量, p 零件自己的增量 }
export function gearFrameFx(g, cat) {
  const m = {},
    p = {};
  if (!g) return { m, p };
  for (const [k, v] of g.ax || []) {
    const D = AX[k];
    if (!D) continue;
    if (D.at === 'm') m[D.k] = (m[D.k] || 0) + v;
    else if (D.at === 'p') p[D.k] = (p[D.k] || 0) + v;
  }
  if (g.q) p.q = GRADE_K * g.q; // 品級：這個零件的主要數值
  return { m, p, cat };
}

// ---------- 顯示 ----------
export function axText(a) {
  const D = axDef(a[0]);
  if (!D) return '';
  if (D.txt) return D.txt(a[1]);
  const v = a[1];
  const s = D.abs
    ? D.k === 'absorb' || D.k === 'enAd'
      ? `+${Math.round(v * 1000) / 10}%`
      : `+${v.toFixed(2)}`
    : null;
  const pct = `${D.down ? '−' : '+'}${Math.round(v * 1000) / 10}%`;
  return `${D.n} ${s || pct}${a[2] ? ' ★' : ''}`;
}
// 這件的主要數值文字
const MAIN_TXT = {
  head: '頭部 AP、鎖定距離',
  core: '核心 AP、防禦',
  arms: '手臂 AP、防禦',
  legs: '腳部 AP、姿勢穩定',
  booster: 'QB 推力',
  generator: 'EN 容量、回復',
  fcs: '鎖定距離、距離輔助',
};
export function mainText(id, q) {
  if (!q) return '';
  const cat = GEAR_CAT.get(id);
  const kind = gearKind(cat, gearPart(id));
  if (kind === 'shield') return `減傷 +${q}%`;
  const n = isWeaponCat(cat)
    ? kind === 'melee'
      ? '斬擊傷害'
      : kind === 'emp'
        ? '硬直時間'
        : '傷害'
    : MAIN_TXT[cat];
  return `${n} +${Math.round(GRADE_K * q * 100)}%`;
}
export const gradeOf = (g) => GRADES[(g && g.q) || 0];
export const tuneTotalOf = (t) => tuneLevels(t);
export { TUNE, TUNE_TOTAL };
