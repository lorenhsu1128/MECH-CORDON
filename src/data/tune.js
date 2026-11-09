// 素材與零件調校（主線擴充 E1／E2，docs/campaign-expansion-design.md）。
// 素材：save.mats＝{ alloy, circuit, core, shard }；調校：save.tune＝{ 零件 id: { 項目: 級數 } }（同一種零件全部一樣）。
// 調校的效果經過駕駛員的加成表（pm.tn，data/pilot.js 的 applyPilotStats／pilotWeaponDef 套用），PvP 不套用。

export const MATS = {
  alloy: { name: '合金', icon: '▣', color: '#b8c4cc' },
  circuit: { name: '電子零件', icon: '◫', color: '#7fc8ff' },
  core: { name: '能量核心', icon: '◆', color: '#ffb040' },
  shard: { name: '傳說殘片', icon: '✦', color: '#ffd060' },
};
export const MAT_KEYS = Object.keys(MATS);

// 調校項目：每個零件分類 1～3 項，每項 1～3 級；fx＝每級的增量，和駕駛員加成的鍵相同、**正＝變好**（data/pilot.js 的
// upF／downF：rof 正＝射擊間隔變短、rld 正＝裝填變快、spread 正＝擴散變小、mEn 正＝EN 消耗變少、qbc 正＝QB 消耗變少）。
// 武器：dmg、rof、spread、mag、rld、ammo、imp、range；近戰：mDmg、mImp、mRch、mEn；機體：ap、stab、spd、qb、qbc、enCap、rch、lock
export const TUNE = {
  gun: [
    { k: 'pow', name: '高壓彈藥', desc: '傷害提高、總彈數減少', fx: { dmg: 0.06, ammo: -0.08 } },
    { k: 'rate', name: '速射機構', desc: '射速提高、擴散變大', fx: { rof: 0.06, spread: -0.1 } },
    { k: 'mag', name: '擴充彈匣', desc: '彈匣變大、裝填變慢', fx: { mag: 0.12, rld: -0.08 } },
  ],
  energy: [
    { k: 'pow', name: '增幅線圈', desc: '傷害提高、射擊間隔變長', fx: { dmg: 0.07, rof: -0.04 } },
    { k: 'imp', name: '集束透鏡', desc: '衝擊提高、射程縮短', fx: { imp: 0.1, range: -0.04 } },
  ],
  melee: [
    { k: 'cut', name: '研磨刃', desc: '斬擊傷害提高、EN 消耗變多', fx: { mDmg: 0.06, mEn: -0.06 } },
    { k: 'hit', name: '重心配重', desc: '衝擊提高、傷害略降', fx: { mImp: 0.08, mDmg: -0.025 } },
    { k: 'reach', name: '延伸機構', desc: '攻擊距離變長、衝擊略降', fx: { mRch: 0.06, mImp: -0.04 } },
  ],
  frame: [
    { k: 'armor', name: '追加裝甲', desc: 'AP 提高、速度略降', fx: { ap: 0.03, spd: -0.012 } },
    { k: 'stab', name: '平衡器', desc: '姿勢穩定提高、AP 略降', fx: { stab: 0.05, ap: -0.015 } },
  ],
  booster: [
    { k: 'thrust', name: '推力強化', desc: 'QB 推力提高、QB 消耗變多', fx: { qb: 0.05, qbc: -0.06 } },
    { k: 'eco', name: '節能噴嘴', desc: 'QB 消耗減少、推力略降', fx: { qbc: 0.06, qb: -0.025 } },
  ],
  generator: [
    { k: 'cap', name: '擴充電容', desc: 'EN 容量提高、回復變慢', fx: { enCap: 0.06, rch: -0.04 } },
    { k: 'rch', name: '快速迴路', desc: 'EN 回復變快、容量略降', fx: { rch: 0.06, enCap: -0.03 } },
  ],
  fcs: [{ k: 'lock', name: '感測器校正', desc: '鎖定距離提高', fx: { lock: 0.05 } }],
};
// 零件分類 → 調校表的鍵（arm／back 依武器種類）
export function tuneGroup(cat, p) {
  if (!p || /_none$/.test(p.id)) return null;
  if (cat === 'arm' || cat === 'back') {
    if (p.type === 'melee') return 'melee';
    if (p.type === 'shield' || p.type === 'none') return null;
    return p.type === 'laser' || p.type === 'empbeam' || p.attr === 'en' ? 'energy' : 'gun';
  }
  if (['head', 'core', 'arms', 'legs'].includes(cat)) return 'frame';
  if (cat === 'booster' || cat === 'generator' || cat === 'fcs') return cat;
  return null;
}
export const TUNE_MAX = 3; // 每一項的最高級數
export const TUNE_TOTAL = 5; // 每個零件全部項目加起來的上限
// 限界突破（傳說殘片的用途，2026-11-09）：每次讓這個零件的合計上限 +1，最多 2 次（5 → 7）；突破是永久的，重置調校不退。
// 存在調校表的 _x（save.tune[零件 id]._x＝突破次數），項目的級數上限 TUNE_MAX 不變
export const TUNE_BREAK = [
  { coam: 15000, shard: 1 },
  { coam: 30000, shard: 2 },
];
export const tuneBreaks = (t) => Math.max(0, Math.min(TUNE_BREAK.length, (t && t._x) | 0));
export const tuneCap = (t) => TUNE_TOTAL + tuneBreaks(t);
// 已經調了幾級（不含突破次數）
export const tuneLevels = (t) =>
  t ? Object.keys(t).reduce((a, k) => a + (k === '_x' ? 0 : Math.max(0, t[k] | 0)), 0) : 0;
// 升到 lv 級的費用
export function tuneCost(lv) {
  return [
    null,
    { coam: 3000, alloy: 2 },
    { coam: 8000, alloy: 4, circuit: 2 },
    { coam: 18000, alloy: 6, circuit: 3, core: 1 },
  ][lv];
}
// 這個零件的調校 → 增量表（給 pilot.js）
export function tuneFx(group, t) {
  const out = {};
  if (!group || !t) return out;
  for (const o of TUNE[group] || []) {
    const lv = Math.max(0, Math.min(TUNE_MAX, t[o.k] | 0));
    if (!lv) continue;
    for (const k in o.fx) out[k] = (out[k] || 0) + o.fx[k] * lv;
  }
  return out;
}
// 存檔的調校表整理（讀檔、多人房主校正客機送來的）：只留認得的項目與合法的級數
export function sanitizeTune(t, groupOf) {
  const out = {};
  if (!t || typeof t !== 'object') return out;
  for (const id in t) {
    const row = sanitizeTuneRow(t[id], groupOf(id));
    if (row) out[id] = row;
  }
  return out;
}
// 一個零件的調校表（零件品級的每件裝備各自一份，data/gear.js）；沒有內容時回傳 null
export function sanitizeTuneRow(src, g) {
  if (!g || !TUNE[g] || !src || typeof src !== 'object') return null;
  const row = {};
  let sum = 0;
  const x = tuneBreaks(src);
  if (x) row._x = x;
  for (const o of TUNE[g]) {
    const lv = Math.max(0, Math.min(TUNE_MAX, src[o.k] | 0));
    if (lv && sum + lv <= TUNE_TOTAL + x) {
      row[o.k] = lv;
      sum += lv;
    }
  }
  return Object.keys(row).length ? row : null;
}

// ---------- 掉落（E1） ----------
// 擊破時的素材：一般敵人的機率與數量；帶詞綴、敵對 AC、精英、Boss 較多
export const DROP = {
  base: 0.12, // 一般敵人掉合金的機率
  circuit: 0.35, // 帶詞綴／敵對 AC 掉電子零件的機率
  core: 0.5, // 精英、宿敵、大型兵器、Boss 掉能量核心的機率
  shard: 0.25, // Boss 掉傳說殘片的機率
  part: 0.35, // 具名 AC、宿敵、Boss 掉它裝備的零件（還沒擁有的）的機率
  salvage: { alloy: 1, circuit: 0.4 }, // 撤離區段每箱回收物資另外給的素材（期望值）
};
