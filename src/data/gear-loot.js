// 零件品級的掉落（docs/gear-rarity-design.md 第 6 節）：各來源的機率、各章的品級上限、Boss 的掉落表。純資料與純函式。
import { GEAR_CAT } from './gear.js';

// 掉落機率
export const GEAR_DROP = {
  grunt: 0.02, // 一般敵人（白～綠）
  affix: 0.1, // 帶詞綴的敵人
  ac: 0.25, // 敵對 AC（掉它身上的一件）
  ace: 0.6, // 精英、具名 AC、宿敵（掉它身上的一件，ACE_UP 機率高一級）
  aceUp: 0.2,
  cache: 0.3, // 據點的補給箱
};
// 金色（只有 Boss）：依章；殘響 Boss（第 3 周目）另外
export function goldChance(ch, echo) {
  if (echo) return 0.25;
  return ch <= 2 ? 0.03 : ch <= 4 ? 0.05 : 0.12;
}
// 各章能掉的最高品級（金色另外算）
export const qCap = (ch) => (ch <= 2 ? 1 : ch <= 4 ? 2 : 3);
// 品級的權重：標準 45、改良 35、精製 15、特製 5（超過上限的不算，再依 min 去掉低的）
const QW = [45, 35, 15, 5];
export function rollQ(cap, min, rng) {
  min = Math.min(min || 0, cap);
  let sum = 0;
  for (let q = min; q <= cap; q++) sum += QW[q];
  let r = rng() * sum;
  for (let q = min; q <= cap; q++) {
    r -= QW[q];
    if (r < 0) return q;
  }
  return cap;
}
// 敵人身上的零件的品級範圍（依章）；Boss 的 AC 高一級（第 5 章以後可能是金色）
export function enemyQRange(ch, boss) {
  const r = ch <= 2 ? [0, 1] : ch <= 4 ? [1, 2] : [2, 3];
  if (boss) return [r[0] + 1, Math.min(ch >= 5 ? 4 : 3, r[1] + 1)];
  return r;
}
// Boss 的掉落表：和它的攻擊方式相關的零件（機甲 Boss 另外加上它身上的零件）
export const BOSS_GEAR = {
  JUGGERNAUT: ['w_bz', 'bw_ms8', 'l_tk', 'c_hv'],
  mirror: ['h_scan', 'f_mid'],
  flagship: ['c_aeg', 'bw_sh', 'g_hi'],
  interceptor: ['b_hi', 'c_nat', 'w_mg'],
  STRIDER: ['l_qd', 'bw_gat', 'a_hv'],
  railgun: ['w_lc', 'bw_lc', 'f_snipe'],
  worm: ['w_pile', 'w_claw', 'l_hv'],
  funnel: ['bw_pm', 'f_near', 'g_arc'],
  heli: ['bw_ms', 'w_mg', 'b_eff'],
  furnace: ['w_gl', 'bw_gr', 'h_hv'],
  artillery: ['bw_gr', 'w_bz', 'f_far'],
  rampart: ['l_tk', 'w_pile', 'c_hv'],
  duo: ['w_rifle', 'w_lr', 'a_std'],
  phantom: ['h_lt', 'w_emp', 'bw_emp_s'],
  spider: ['l_qd', 'bw_ms', 'a_hv'],
  orbital: ['bw_lc', 'f_far', 'h_scan'],
  BALTEUS: ['w_saber', 'bw_ms8', 'c_std'],
  trinity: ['w_blade', 'w_rifle', 'f_mid'],
  hunter: ['w_emp', 'bw_emp_l', 'g_fast'],
  train: ['bw_gat', 'l_hv', 'h_std'],
  fortress: ['bw_ms8', 'b_std', 'f_std'],
  ibis: ['w_blade', 'w_lsg', 'b_hi'],
  anvil: ['w_pile', 'a_hv', 'l_hv'],
  salamander: ['w_gl', 'g_std', 'l_rj'],
  gantry: ['bw_gr', 'w_claw', 'a_std'],
  deckgun: ['bw_lc', 'w_lc', 'f_snipe'],
  reactor: ['g_hi', 'g_arc', 'bw_emp_l'],
  sovereign: ['w_saber', 'c_aeg', 'l_bp2'],
};
export const ALL_GEAR = [...GEAR_CAT.keys()];
// 這隻 Boss 能掉的零件 id（key＝bossKind 或名稱開頭；asm＝它身上的）
export function bossPool(key, asm) {
  const out = (BOSS_GEAR[key] || []).filter((id) => GEAR_CAT.has(id));
  for (const id of Object.values(asm || {})) if (GEAR_CAT.has(id) && !out.includes(id)) out.push(id);
  return out.length ? out : ALL_GEAR;
}
// 主線的章（自由出擊依等級對應）
export const chOfLevel = (L) => Math.max(1, Math.min(8, Math.round((L || 1) / 2)));
