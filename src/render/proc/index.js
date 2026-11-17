// 照 GLB 量測重建的程式模型（scripts/glb-to-proc.mjs 產生；批次 scripts/proc-batch.js）：槽位 id → 基本形體清單。
// PROC_PRIMS：槽位 → 清單（render/mech-model.js 的 makeProcPiece0 用它取代原本手寫的程式模型）。GRANITE 系列與 SEQ 輕量機型的頭、核心、手臂、腳。
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
import { p_core_c_ltPrims } from './core_c_lt.js';
import { p_head_h_ltPrims } from './head_h_lt.js';
import { p_arms_a_lt_l_upperPrims } from './arms_a_lt_l_upper.js';
import { p_arms_a_lt_l_forePrims } from './arms_a_lt_l_fore.js';
import { p_arms_a_lt_l_handPrims } from './arms_a_lt_l_hand.js';
import { p_arms_a_lt_r_upperPrims } from './arms_a_lt_r_upper.js';
import { p_arms_a_lt_r_forePrims } from './arms_a_lt_r_fore.js';
import { p_arms_a_lt_r_handPrims } from './arms_a_lt_r_hand.js';
import { p_legs_l_bp2_pelvisPrims } from './legs_l_bp2_pelvis.js';
import { p_legs_l_bp2_l_thighPrims } from './legs_l_bp2_l_thigh.js';
import { p_legs_l_bp2_l_shinPrims } from './legs_l_bp2_l_shin.js';
import { p_legs_l_bp2_l_footPrims } from './legs_l_bp2_l_foot.js';
import { p_legs_l_bp2_r_thighPrims } from './legs_l_bp2_r_thigh.js';
import { p_legs_l_bp2_r_shinPrims } from './legs_l_bp2_r_shin.js';
import { p_legs_l_bp2_r_footPrims } from './legs_l_bp2_r_foot.js';

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
  // SEQ 輕量機型
  'core/c_lt': p_core_c_ltPrims,
  'head/h_lt': p_head_h_ltPrims,
  'arms/a_lt/l_upper': p_arms_a_lt_l_upperPrims,
  'arms/a_lt/l_fore': p_arms_a_lt_l_forePrims,
  'arms/a_lt/l_hand': p_arms_a_lt_l_handPrims,
  'arms/a_lt/r_upper': p_arms_a_lt_r_upperPrims,
  'arms/a_lt/r_fore': p_arms_a_lt_r_forePrims,
  'arms/a_lt/r_hand': p_arms_a_lt_r_handPrims,
  'legs/l_bp2/pelvis': p_legs_l_bp2_pelvisPrims,
  'legs/l_bp2/l_thigh': p_legs_l_bp2_l_thighPrims,
  'legs/l_bp2/l_shin': p_legs_l_bp2_l_shinPrims,
  'legs/l_bp2/l_foot': p_legs_l_bp2_l_footPrims,
  'legs/l_bp2/r_thigh': p_legs_l_bp2_r_thighPrims,
  'legs/l_bp2/r_shin': p_legs_l_bp2_r_shinPrims,
  'legs/l_bp2/r_foot': p_legs_l_bp2_r_footPrims,
};
