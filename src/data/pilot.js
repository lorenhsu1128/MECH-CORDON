// 駕駛員成長：等級、技能配點驗證、加成計算與套用（純函式，房主與客機共用）
import { PARTS, REMOVED_PARTS, usesAmmo } from './parts.js';
import { tuneFx, tuneGroup } from './tune.js';
import { defCut } from './attrs.js';
import { GEAR_CAT, gearFrameFx, gearGr, gearPart, gearResolve, gearWeaponFx, sanitizeGr } from './gear.js';
import {
  PILOT_MAX_LEVEL,
  PRESET_MAX,
  PROF_BONUS,
  PROF_MAX,
  PROF_THRESH,
  SKILLS,
  SKILL_BY_ID,
  TIER_REQ,
  skillView,
  xpToNext,
} from './skills.js';

export const PILOT_MODES = ['pve', 'pvp'];
export const WEAPON_SLOTS = ['rarm', 'larm', 'rback', 'lback'];
// 可累積熟練度的武器零件（不含空槽）
export const WEAPON_IDS = new Set(
  [...PARTS.arm, ...PARTS.back].filter((p) => p.type !== 'none').map((p) => p.id),
);
export const weaponPart = (id) => PARTS.arm.find((p) => p.id === id) || PARTS.back.find((p) => p.id === id);
const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(v) || 0)));

// ---------- 等級 ----------
export function levelOf(xp) {
  let L = 1,
    left = Math.max(0, xp || 0);
  while (L < PILOT_MAX_LEVEL && left >= xpToNext(L)) {
    left -= xpToNext(L);
    L++;
  }
  return L;
}
// 目前等級內的進度（滿級時 need 為 0）
export function xpProgress(xp) {
  let L = 1,
    left = Math.max(0, xp || 0);
  while (L < PILOT_MAX_LEVEL && left >= xpToNext(L)) {
    left -= xpToNext(L);
    L++;
  }
  return { level: L, into: L < PILOT_MAX_LEVEL ? left : 0, need: L < PILOT_MAX_LEVEL ? xpToNext(L) : 0 };
}
export const pointsAt = (level) => Math.max(0, level - 1);
export const spentPoints = (skills) => Object.values(skills || {}).reduce((a, r) => a + (r || 0), 0);

// ---------- 配點驗證 ----------
// 同分支中階層低於 tier 的已投點數
function lowerSpent(skills, br, tier) {
  let n = 0;
  for (const s of SKILLS) if (s.br === br && s.tier < tier) n += skills[s.id] || 0;
  return n;
}
// 技能目前是否滿足解鎖條件（不含點數），不滿足時回傳原因
export function gateReason(skills, id) {
  const s = SKILL_BY_ID[id];
  const need = TIER_REQ[s.tier];
  if (lowerSpent(skills, s.br, s.tier) < need) return `本分支前段需投入 ${need} 點`;
  if (s.req && (skills[s.req] || 0) < SKILL_BY_ID[s.req].max) return `需要「${SKILL_BY_ID[s.req].name}」滿級`;
  return '';
}
export function isValidAlloc(skills, level) {
  let total = 0;
  for (const id in skills) {
    const s = SKILL_BY_ID[id],
      r = skills[id];
    if (!s || !Number.isInteger(r) || r < 0 || r > s.max) return false;
    if (!r) continue;
    total += r;
    if (gateReason(skills, id)) return false;
  }
  return total <= pointsAt(level);
}
const withRank = (skills, id, r) => {
  const o = { ...skills };
  if (r > 0) o[id] = r;
  else delete o[id];
  return o;
};
export const canInc = (skills, id, level) =>
  (skills[id] || 0) < SKILL_BY_ID[id].max && isValidAlloc(withRank(skills, id, (skills[id] || 0) + 1), level);
export const canDec = (skills, id, level) =>
  (skills[id] || 0) > 0 && isValidAlloc(withRank(skills, id, skills[id] - 1), level);
export const incSkill = (skills, id) => withRank(skills, id, (skills[id] || 0) + 1);
export const decSkill = (skills, id) => withRank(skills, id, (skills[id] || 0) - 1);

// 修正不合法的配點（技能表改版、等級不足、資料損壞）：先移除解鎖條件不符的技能，再從高階層往回退點
export function sanitizeSkills(skills, level) {
  const out = {};
  for (const id in skills || {}) {
    const s = SKILL_BY_ID[id];
    const r = s ? clampInt(skills[id], 0, s.max) : 0;
    if (r) out[id] = r;
  }
  const dropGated = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const s of SKILLS)
        if (out[s.id] && gateReason(out, s.id)) {
          delete out[s.id];
          changed = true;
        }
    }
  };
  dropGated();
  let over = spentPoints(out) - pointsAt(level);
  for (const s of [...SKILLS].reverse().sort((a, b) => b.tier - a.tier)) {
    while (over > 0 && out[s.id]) {
      out[s.id]--;
      if (!out[s.id]) delete out[s.id];
      over--;
    }
  }
  dropGated();
  return out;
}

// ---------- 熟練度 ----------
// prof 存累積的有效傷害；每 10 點 = 1 熟練度點
export function profLevel(v) {
  const pts = (v || 0) / 10;
  let n = 0;
  for (const t of PROF_THRESH) if (pts >= t) n++;
  return n;
}
export function profProgress(v) {
  const pts = (v || 0) / 10;
  const lv = profLevel(v);
  if (lv >= PROF_MAX) return { lv, into: 0, need: 0 };
  const lo = lv ? PROF_THRESH[lv - 1] : 0;
  return { lv, into: pts - lo, need: PROF_THRESH[lv] - lo };
}

// ---------- 存檔 ----------
const newModePilot = () => ({ xp: 0, skills: {}, prof: {}, presets: Array(PRESET_MAX).fill(null) });
export const newPilot = () => ({ v: 1, pve: newModePilot(), pvp: newModePilot() });
function normalizePreset(p) {
  if (!p || typeof p !== 'object' || !p.asm || typeof p.asm !== 'object') return null;
  return {
    name: String(p.name || '').slice(0, 16),
    asm: Object.fromEntries(Object.entries(p.asm).map(([k, v]) => [k, REMOVED_PARTS[v] || v])),
    skills: p.skills && typeof p.skills === 'object' ? { ...p.skills } : {},
    t: p.t || 0,
  };
}
// 讀檔時補齊欄位並修正配點；舊存檔沒有 pilot 時從 Lv1 開始
export function normalizePilot(p) {
  if (!p || typeof p !== 'object') return newPilot();
  const out = { v: 1 };
  for (const mode of PILOT_MODES) {
    const m = p[mode] && typeof p[mode] === 'object' ? p[mode] : {};
    const xp = Math.max(0, Number(m.xp) || 0);
    const prof = {};
    for (const id in m.prof || {}) if (WEAPON_IDS.has(id)) prof[id] = Math.max(0, Number(m.prof[id]) || 0);
    const presets = Array.from({ length: PRESET_MAX }, (_, i) =>
      normalizePreset(Array.isArray(m.presets) ? m.presets[i] : null),
    );
    out[mode] = { xp, skills: sanitizeSkills(m.skills, levelOf(xp)), prof, presets };
  }
  return out;
}

// ---------- 零件調校（data/tune.js；主線擴充 E2） ----------
// 零件 id → [分類, 零件]（調校只看零件 id）
const PART_CAT = new Map();
for (const cat in PARTS) for (const p of PARTS[cat]) if (!PART_CAT.has(p.id)) PART_CAT.set(p.id, [cat, p]);
export const tuneGroupOf = (id) => {
  const r = PART_CAT.get(id);
  return r ? tuneGroup(r[0], r[1]) : null;
};
// 裝備中的零件的品級、詞條與調校（data/gear.js；save.inv、save.eq、save.tune）→ { 槽位: { id, q, ax, t } }
export function gearOfSave(save) {
  if (!save || !save.asm) return {};
  return gearGr(save, save.asm, gearResolve(save));
}
// 調校表 → 增量
const tuneOf = (id, t) => (t ? tuneFx(tuneGroupOf(id), t) : {});

// ---------- 網路傳送 ----------
// 客機送給房主：兩種模式的等級、配點，以及目前裝備武器的熟練度等級
export function pilotPayload(save) {
  const out = {};
  for (const mode of PILOT_MODES) {
    const m = save.pilot[mode];
    const pf = {};
    for (const s of WEAPON_SLOTS) {
      const id = save.asm[s];
      if (WEAPON_IDS.has(id)) {
        const lv = profLevel(m.prof[id]);
        if (lv) pf[id] = lv;
      }
    }
    out[mode] = { lv: levelOf(m.xp), s: { ...m.skills }, pf };
  }
  out.pve.gr = gearOfSave(save); // 零件的品級、詞條與調校（PvP 不套用）
  return out;
}
// 房主收到後修正範圍，避免異常資料
export function sanitizePayload(p) {
  if (!p || typeof p !== 'object') return null;
  const out = {};
  for (const mode of PILOT_MODES) {
    const m = p[mode] && typeof p[mode] === 'object' ? p[mode] : {};
    const lv = clampInt(m.lv, 1, PILOT_MAX_LEVEL);
    const pf = {};
    for (const id in m.pf || {}) if (WEAPON_IDS.has(id)) pf[id] = clampInt(m.pf[id], 0, PROF_MAX);
    out[mode] = { lv, s: sanitizeSkills(m.s, lv), pf };
    if (mode === 'pve' && m.gr) out[mode].gr = sanitizeGr(m.gr);
  }
  return out;
}

// ---------- 加成 ----------
// 把配點展開成扁平的增量表 pm（例如 { dmg: 0.06, kits: 1, pf: { w_rifle: 2 } }）
// PvE 的攜彈量加成（敵人分波、數量多，第 13 期起）：所有實彈武器的總彈數 +40%（彈匣不變）
export const PVE_AMMO_K = 0.4;
export function computePilotMods(mp, mode) {
  if (!mp) return null;
  const pm = { pf: { ...(mp.pf || {}) } };
  if (mode === 'pve') pm.ammo = PVE_AMMO_K;
  if (mode === 'pve' && mp.gr && Object.keys(mp.gr).length) pm.gr = mp.gr; // 零件的品級、詞條與調校（data/gear.js）
  for (const id in mp.s || {}) {
    const s = SKILL_BY_ID[id];
    if (!s) continue;
    const fx = skillView(s, mode).fx;
    for (const k in fx) pm[k] = (pm[k] || 0) + fx[k] * mp.s[id];
  }
  return pm;
}
const upF = (f, k) => 1 + (f[k] || 0);
const downF = (f, k) => Math.max(0.2, 1 - (f[k] || 0));

// 回傳套用技能後的新 stats（parts 內會修改的零件先複製，不動共用的 PARTS 資料）
export function applyPilotStats(st, pm) {
  if (!pm) return st;
  const P = st.parts;
  // 零件的品級、詞條、調校（data/gear.js）：整台的加進同一套增量（不改 pm 本身），零件自己的另外記
  const G = pm.gr ? gearStatFx(P, pm.gr) : null;
  if (G && Object.keys(G.m).length) {
    pm = { ...pm };
    for (const k in G.m) pm[k] = (pm[k] || 0) + G.m[k];
  }
  const parts = {
    ...P,
    legs: {
      ...P.legs,
      jumpH: P.legs.jumpH * upF(pm, 'jump'),
      airH: P.legs.airH * upF(pm, 'jump'),
      airN: P.legs.airN + Math.round(pm.airN || 0), // 主線的戰術模組
    },
    booster: {
      ...P.booster,
      qb: P.booster.qb * (1 + ((G && G.bst) || 0)) * upF(pm, 'qb'),
      qbCost: P.booster.qbCost * downF(pm, 'qbc'),
    },
    arms: G && G.arms ? { ...P.arms, ...G.arms } : P.arms,
    fcs: G && G.fcs ? { ...P.fcs, ...G.fcs } : P.fcs,
    generator: {
      ...P.generator,
      cap: P.generator.cap * (1 + ((G && G.gen) || 0)) * upF(pm, 'enCap'),
      recharge: P.generator.recharge * (1 + ((G && G.gen) || 0)) * upF(pm, 'rch'),
      delay: P.generator.delay * downF(pm, 'dly'),
    },
  };
  return {
    ...st,
    parts,
    ap: Math.round((st.ap + ((G && G.ap) || 0)) * upF(pm, 'ap')),
    stab: Math.round((st.stab + ((G && G.stab) || 0)) * upF(pm, 'stab')),
    def: Math.min(0.35, st.def + (pm.def || 0)),
    // 三種防禦（data/attrs.js）：def 加到全部、defKin／defExp／defEn 各自
    defs: st.defs && {
      kin: Math.min(0.5, gDef(st, G, 0, 'kin') + (pm.def || 0) + (pm.defKin || 0)),
      exp: Math.min(0.5, gDef(st, G, 1, 'exp') + (pm.def || 0) + (pm.defExp || 0)),
      en: Math.min(0.5, gDef(st, G, 2, 'en') + (pm.def || 0) + (pm.defEn || 0)),
    },
    enAdapt: (st.enAdapt || 1) + (pm.enAd || 0),
    speed: st.speed * upF(pm, 'spd'),
    jump: st.jump * upF(pm, 'jump'),
    enCap: Math.round(st.enCap * upF(pm, 'enCap')),
    lockRange: st.lockRange * (1 + ((G && G.lock) || 0)) * upF(pm, 'lock'),
  };
}
// 零件品級與詞條對機體的影響：{ m 整台的增量（加進 pm）, ap／stab 加到合計的數值, dv 三種防禦值的增加,
// gen 發電機容量與回復、bst QB 推力、lock 鎖定距離（品級，乘在零件上）, arms／fcs 改過的欄位 }
const FRAME = ['head', 'core', 'arms', 'legs'];
function gearStatFx(P, gr) {
  const o = { m: {}, ap: 0, stab: 0, dv: [0, 0, 0], gen: 0, bst: 0, lock: 0 };
  for (const k in gr) {
    const g = gr[k],
      part = P[k];
    if (!g || !part || part.id !== g.id) continue;
    // 調校（武器的在 pilotWeaponDef）
    if (!/arm$|back$/.test(k)) {
      const t = tuneOf(g.id, g.t);
      for (const x in t) o.m[x] = (o.m[x] || 0) + t[x];
    }
    const F = gearFrameFx(g, GEAR_CAT.get(g.id));
    for (const x in F.m) o.m[x] = (o.m[x] || 0) + F.m[x];
    const q = F.p.q || 0;
    if (FRAME.includes(k)) {
      o.ap += (part.ap || 0) * q;
      if (k === 'legs' || k === 'head') o.stab += k === 'legs' ? (part.stab || 0) * q : 0;
      const d = part.defs || [0, 0, 0];
      const dq = k === 'core' || k === 'arms' ? q : 0;
      o.dv[0] += d[0] * (dq + (F.p.dfK || 0));
      o.dv[1] += d[1] * (dq + (F.p.dfE || 0));
      o.dv[2] += d[2] * (dq + (F.p.dfN || 0));
      if (k === 'head') o.lock += q;
      if (k === 'arms' && (F.p.aim || F.p.mel))
        o.arms = {
          aim: Math.min(1, (part.aim || 0.6) + (F.p.aim || 0)),
          melee: (part.melee || 1) * (1 + (F.p.mel || 0)),
        };
    } else if (k === 'booster') o.bst += q;
    else if (k === 'generator') o.gen += q;
    else if (k === 'fcs') {
      o.lock += q;
      const as = (part.assist || [0.6, 0.6, 0.45]).slice();
      const add = [F.p.asN || 0, F.p.asM || 0, F.p.asF || 0];
      for (let i = 0; i < 3; i++) as[i] = Math.min(1, as[i] * (1 + q) + add[i]);
      o.fcs = { assist: as, lockSpeed: (part.lockSpeed || 1) * (1 + (F.p.lks || 0)) };
    }
  }
  return o;
}
// 防禦：零件的防禦值增加時重新換算減傷
function gDef(st, G, i, key) {
  if (!G || !G.dv[i] || !st.defV) return st.defs[key];
  return defCut(st.defV[i] + G.dv[i]);
}

// 會影響武器定義的技能效果
const WEAPON_KEYS = [
  'dmg',
  'ideal',
  'rld',
  'mag',
  'ammo',
  'turn',
  'spread',
  'pspd',
  'mDmg',
  'mEn',
  'mImp',
  'mRch',
  'chg',
  'enWpn',
  'imp',
  'range',
];
// 武器熟練度 lv 級的累積加成
export function profBonus(type, lv) {
  const f = {};
  const list = PROF_BONUS[type] || [];
  for (let i = 0; i < Math.min(lv, list.length); i++)
    for (const k in list[i]) f[k] = (f[k] || 0) + list[i][k];
  return f;
}
// 回傳套用技能與熟練度後的武器定義副本；沒有任何加成時回傳原物件
export function pilotWeaponDef(def, pm, slot) {
  if (!pm || !def || def.type === 'none') return def;
  const f = profBonus(def.type, (pm.pf && pm.pf[def.id]) || 0);
  for (const k of WEAPON_KEYS) if (pm[k]) f[k] = (f[k] || 0) + pm[k];
  // 這個槽位的裝備：品級、詞條、調校（data/gear.js；零件 id 和槽位裡的相同才套用）
  const g = slot && pm.gr && pm.gr[slot];
  if (g && g.id === def.id) {
    const w = gearWeaponFx(g, gearPart(g.id));
    for (const k in w) f[k] = (f[k] || 0) + w[k];
    const t = tuneOf(g.id, g.t);
    for (const k in t) f[k] = (f[k] || 0) + t[k];
  }
  if (!Object.keys(f).length) return def;
  const d = { ...def };
  if (d.type === 'melee') {
    d.enCost = d.enCost * downF(f, 'mEn');
    const mk = (st) => ({
      ...st,
      dmg: st.dmg * upF(f, 'mDmg'),
      impact: st.impact * upF(f, 'mImp'),
      reach: st.reach * upF(f, 'mRch'),
    });
    d.combo = def.combo.map(mk);
    if (def.moves) d.moves = def.moves.map(mk); // 派生招式（data/melee.js）
    return d;
  }
  if (d.dmg) d.dmg *= upF(f, 'dmg');
  if (d.chargeDmg) d.chargeDmg *= upF(f, 'dmg');
  if (d.impact) d.impact *= upF(f, 'imp');
  if (d.reload) d.reload *= downF(f, 'rld');
  if (d.rof) d.rof *= downF(f, 'rof');
  if (usesAmmo(d)) {
    d.mag = Math.max(1, Math.round(d.mag * upF(f, 'mag')));
    d.ammo = Math.max(d.mag, Math.round(d.ammo * upF(f, 'ammo')));
  }
  if (d.spread) d.spread *= downF(f, 'spread');
  if (d.ideal) d.ideal *= upF(f, 'ideal'); // 實彈的理想射程
  if (d.speed) d.speed *= upF(f, 'pspd');
  if (d.range) d.range *= upF(f, 'range');
  if (d.turn) d.turn *= upF(f, 'turn');
  if (d.splash) d.splash *= upF(f, 'splash');
  if (d.chargeT) d.chargeT *= downF(f, 'chg');
  if (d.enPerSec) d.enPerSec *= downF(f, 'eps') * downF(f, 'enWpn') * downF(f, 'enc');
  if (d.enShot) d.enShot *= downF(f, 'enc');
  if (d.radius) d.radius *= upF(f, 'radius');
  if (d.stun) d.stun *= upF(f, 'stun');
  if (d.absorb) d.absorb = Math.min(0.65, d.absorb + (f.absorb || 0));
  return d;
}
