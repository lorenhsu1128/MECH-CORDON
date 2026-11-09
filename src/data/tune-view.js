// 零件調校的數值顯示（純函式；game/tune-ui.js 的調校視窗、總覽，game/garage-ui.js 的小卡片）。
// 調校的效果一律經過 data/pilot.js 的 applyPilotStats／pilotWeaponDef 計算，和遊戲裡套用的方式相同。
import { applyPilotStats, pilotWeaponDef } from './pilot.js';
import { SLOTS, asmStats, partById, usesAmmo } from './parts.js';
import { effectiveAp, weaponDps } from './firepower.js';
import { TUNE, tuneFx, tuneGroup } from './tune.js';

const WSLOTS = ['rarm', 'larm', 'rback', 'lback'];
const sum = (a, f) => (a || []).reduce((s, x) => s + (f(x) || 0), 0);
const isW = (cat) => cat === 'arm' || cat === 'back';

// fx 的鍵 → 顯示：n 名稱、down＝鍵是正值時實際數值變小（射擊間隔、擴散…）、good＝實際數值越大越好（1）或越小越好（−1）、
// get(V)＝從計算結果取實際數值（V＝{ d 調校後的武器定義, ef 調校後的整台數值 }；沒有這個數值＝undefined）、u 單位
export const TUNE_KEY = {
  dmg: { n: '傷害', good: 1, get: (V) => V.d && V.d.type !== 'melee' && V.d.dmg },
  rof: { n: '射擊間隔', down: 1, good: -1, u: ' 秒', get: (V) => V.d && V.d.rof },
  spread: { n: '擴散', down: 1, good: -1, get: (V) => V.d && V.d.spread },
  mag: { n: '彈匣', good: 1, get: (V) => V.d && usesAmmo(V.d) && V.d.mag },
  rld: { n: '裝填時間', down: 1, good: -1, u: ' 秒', get: (V) => V.d && usesAmmo(V.d) && V.d.reload },
  ammo: { n: '總彈數', good: 1, get: (V) => V.d && usesAmmo(V.d) && V.d.ammo },
  imp: { n: '衝擊', good: 1, get: (V) => V.d && V.d.type !== 'melee' && V.d.impact },
  range: { n: '射程', good: 1, u: ' m', get: (V) => V.d && V.d.range },
  mDmg: { n: '斬擊傷害', good: 1, get: (V) => V.d && V.d.combo && sum(V.d.combo, (c) => c.dmg) },
  mImp: { n: '近戰衝擊', good: 1, get: (V) => V.d && V.d.combo && sum(V.d.combo, (c) => c.impact) },
  mRch: {
    n: '攻擊距離',
    good: 1,
    u: ' m',
    get: (V) => V.d && V.d.combo && V.d.combo[0] && V.d.combo[0].reach,
  },
  mEn: { n: 'EN 消耗', down: 1, good: -1, get: (V) => V.d && V.d.enCost },
  ap: { n: '整台 AP', good: 1, get: (V) => V.ef.ap },
  stab: { n: '整台姿勢穩定', good: 1, get: (V) => V.ef.stab },
  spd: { n: '整台速度', good: 1, get: (V) => V.ef.speed },
  qb: { n: 'QB 速度', good: 1, get: (V) => V.ef.parts.booster.qb },
  qbc: { n: 'QB 消耗', down: 1, good: -1, get: (V) => V.ef.parts.booster.qbCost },
  enCap: { n: 'EN 容量', good: 1, get: (V) => V.ef.enCap },
  rch: { n: 'EN 回復', good: 1, get: (V) => V.ef.parts.generator.recharge },
  lock: { n: '鎖定距離', good: 1, u: ' m', get: (V) => V.ef.lockRange },
};
const num = (v) => typeof v === 'number' && Number.isFinite(v) && v !== 0;
// 數值的格式：大的取整數、小的留小數
export function tuneNum(v, u = '') {
  const a = Math.abs(v);
  const s =
    a >= 100 || Number.isInteger(v)
      ? Math.round(v).toLocaleString()
      : a >= 10
        ? v.toFixed(1)
        : a >= 1
          ? v.toFixed(2)
          : v.toFixed(3);
  return s + u;
}
const pctTxt = (v) => (v > 0 ? '+' : '−') + (Math.round(Math.abs(v) * 10) / 10).toString() + '%';

// 每 lv 級的效果，以實際數值的變化表示：[{ k, n, v（百分比，帶正負）, good（這個變化是不是變好） }]
export function tuneFxList(fx, lv = 1) {
  const out = [];
  for (const k in fx) {
    const K = TUNE_KEY[k];
    if (!K) continue;
    const v = (K.down ? -fx[k] : fx[k]) * lv * 100;
    out.push({ k, n: K.n, v, good: fx[k] > 0, txt: `${K.n} ${pctTxt(v)}` });
  }
  return out;
}

// 零件在組裝裡的槽位（裝備中就用那一格；沒裝備時用 pref，再沒有就用這個分類的第一格）
export function tuneSlotOf(asm, cat, id, pref) {
  for (const [k, , c] of SLOTS) if (c === cat && asm[k] === id) return k;
  if (pref && SLOTS.some(([k, , c]) => k === pref && c === cat)) return pref;
  const s = SLOTS.find(([, , c]) => c === cat);
  return s ? s[0] : null;
}

// 組裝裡用到的零件的調校（tn）：save.tune 只取這台的，override＝{ 零件 id: 調校表 } 取代
export function tuneTnOf(asm, tuneAll, override) {
  const out = {};
  for (const k in asm) {
    const id = asm[k];
    if (tuneAll && tuneAll[id]) out[id] = tuneAll[id];
  }
  for (const id in override || {}) {
    if (override[id] && Object.keys(override[id]).some((k) => k !== '_x')) out[id] = override[id];
    else delete out[id];
  }
  return out;
}

// 套用調校之後的數值：V＝{ d 這個零件（武器）的定義, ef 整台, dps 這把武器的持續 DPS }
// pm0＝駕駛員加成（不含調校的部分，tn 會被取代），asm 必須已經裝著這個零件
export function tuneValues(asm, cat, id, tn, pm0) {
  const pm = { ...(pm0 || {}), tn };
  const ef = applyPilotStats(asmStats(asm), pm);
  let d = null,
    dps = 0;
  if (isW(cat)) {
    d = pilotWeaponDef(partById(cat, id), pm);
    const v = weaponDps(d, ef.parts.generator, pm.enWpn || 0);
    dps = v ? v.sus : 0;
  }
  return { d, ef, dps };
}

// 整台的指標（調校總覽的比較用）
export function tuneMetrics(asm, tn, pm0) {
  const pm = { ...(pm0 || {}), tn };
  const st = asmStats(asm);
  const ef = applyPilotStats(st, pm);
  let sus = 0,
    imp = 0;
  for (const k of WSLOTS) {
    const p = st.parts[k];
    if (!p || p.type === 'none') continue;
    const v = weaponDps(pilotWeaponDef(p, pm), ef.parts.generator, pm.enWpn || 0);
    if (v) {
      sus += v.sus;
      imp += v.imp || 0;
    }
  }
  return {
    sus,
    imp,
    eap: effectiveAp(ef.ap, ef.def),
    stab: ef.stab,
    speed: ef.speed,
    qb: ef.parts.booster.qb,
    qbc: ef.parts.booster.qbCost,
    enCap: ef.enCap,
    rch: ef.parts.generator.recharge,
    lock: ef.lockRange,
  };
}
// 指標的名稱與好壞（QB 消耗越小越好）
export const METRIC = {
  sus: { n: '持續 DPS', good: 1 },
  imp: { n: '衝擊／秒', good: 1 },
  eap: { n: '有效 AP', good: 1 },
  stab: { n: '姿勢穩定', good: 1 },
  speed: { n: '速度', good: 1 },
  qb: { n: 'QB 速度', good: 1 },
  qbc: { n: 'QB 消耗', good: -1 },
  enCap: { n: 'EN 容量', good: 1 },
  rch: { n: 'EN 回復', good: 1 },
  lock: { n: '鎖定距離', good: 1 },
};
const MOB = ['speed', 'qb', 'qbc', 'enCap', 'rch'];
// 兩組指標的變化（百分比，正＝變好）與三個分數：火力＝持續 DPS、耐久＝有效 AP、機動＝速度、QB 速度、QB 消耗、EN 容量、EN 回復的合計
export function metricDiff(a, b) {
  const d = {};
  for (const k in METRIC) {
    if (!a[k]) continue;
    const v = ((b[k] - a[k]) / a[k]) * 100 * METRIC[k].good;
    if (Math.abs(v) >= 0.05) d[k] = v;
  }
  return {
    d,
    fire: d.sus || 0,
    tough: d.eap || 0,
    mob: MOB.reduce((s, k) => s + (d[k] || 0), 0),
  };
}

// 小卡片用：調校之後的零件定義（武器、推進器、發電機、火控的數值本身會變；頭／核心／手臂／腳的調校加在整台上，零件不變）
export function tunedPart(cat, p, t) {
  if (!p || !t) return p;
  const g = tuneGroup(cat, p);
  if (!g) return p;
  const fx = tuneFx(g, t);
  if (!Object.keys(fx).length) return p;
  const up = (k) => 1 + (fx[k] || 0),
    dn = (k) => Math.max(0.2, 1 - (fx[k] || 0));
  if (isW(cat)) return pilotWeaponDef(p, { tn: { [p.id]: t } });
  if (cat === 'booster') return { ...p, qb: p.qb * up('qb'), qbCost: p.qbCost * dn('qbc') };
  if (cat === 'generator') return { ...p, cap: p.cap * up('enCap'), recharge: p.recharge * up('rch') };
  if (cat === 'fcs') return { ...p, range: p.range * up('lock') };
  return p;
}
// 這個調校表的效果合計文字（小卡片的「調校：整台 AP +6%」）
export function tuneFxTxt(cat, p, t) {
  const g = tuneGroup(cat, p);
  return g && t ? tuneFxList(tuneFx(g, t)).map((x) => x.txt) : [];
}
// 調校表的項目（給 UI 依序列出）
export const tuneItems = (cat, p) => TUNE[tuneGroup(cat, p)] || [];
export { num as tuneHasNum };
