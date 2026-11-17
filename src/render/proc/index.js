// 照 GLB 量測重建的程式模型（scripts/glb-to-proc.mjs 產生；批次 scripts/proc-batch.js）：槽位 id → 基本形體清單。
// PROC_PRIMS：槽位 → 清單（render/mech-model.js 的 makeProcPiece0 用它取代原本手寫的程式模型）。GRANITE 系列的頭、核心、手臂、腳。
import { cStdPrims } from './c_std.js';
import { p_head_h_stdPrims } from './head_h_std.js';
import { p_arms_a_std_l_upperPrims } from './arms_a_std_l_upper.js';
import { p_arms_a_std_l_forePrims } from './arms_a_std_l_fore.js';
import { p_arms_a_std_l_handPrims } from './arms_a_std_l_hand.js';
import { p_arms_a_std_r_upperPrims } from './arms_a_std_r_upper.js';
import { p_arms_a_std_r_forePrims } from './arms_a_std_r_fore.js';
import { p_arms_a_std_r_handPrims } from './arms_a_std_r_hand.js';
import { p_legs_l_bp_pelvisPrims } from './legs_l_bp_pelvis.js';
import { p_legs_l_bp_l_thighPrims } from './legs_l_bp_l_thigh.js';
import { p_legs_l_bp_l_shinPrims } from './legs_l_bp_l_shin.js';
import { p_legs_l_bp_l_footPrims } from './legs_l_bp_l_foot.js';
import { p_legs_l_bp_r_thighPrims } from './legs_l_bp_r_thigh.js';
import { p_legs_l_bp_r_shinPrims } from './legs_l_bp_r_shin.js';
import { p_legs_l_bp_r_footPrims } from './legs_l_bp_r_foot.js';

export const PROC_PRIMS = {
  'core/c_std': cStdPrims, // BD-100 GRANITE
  'head/h_std': p_head_h_stdPrims,
  'arms/a_std/l_upper': p_arms_a_std_l_upperPrims,
  'arms/a_std/l_fore': p_arms_a_std_l_forePrims,
  'arms/a_std/l_hand': p_arms_a_std_l_handPrims,
  'arms/a_std/r_upper': p_arms_a_std_r_upperPrims,
  'arms/a_std/r_fore': p_arms_a_std_r_forePrims,
  'arms/a_std/r_hand': p_arms_a_std_r_handPrims,
  'legs/l_bp/pelvis': p_legs_l_bp_pelvisPrims,
  'legs/l_bp/l_thigh': p_legs_l_bp_l_thighPrims,
  'legs/l_bp/l_shin': p_legs_l_bp_l_shinPrims,
  'legs/l_bp/l_foot': p_legs_l_bp_l_footPrims,
  'legs/l_bp/r_thigh': p_legs_l_bp_r_thighPrims,
  'legs/l_bp/r_shin': p_legs_l_bp_r_shinPrims,
  'legs/l_bp/r_foot': p_legs_l_bp_r_footPrims,
};
