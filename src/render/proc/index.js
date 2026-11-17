// 照 GLB 量測重建的程式模型（scripts/glb-to-proc.mjs 產生；批次 scripts/proc-batch.js）：槽位 id → 基本形體清單。
// PROC_PRIMS：槽位 → 清單（render/mech-model.js 的 makeProcPiece0 用它取代原本手寫的程式模型）。GRANITE 系列、SEQ 輕量機型、HAWK 重裝機型、逆足機型的頭、核心、手臂、腳。
// PROC_TEMP：還在給使用者檢查的（模型庫的暫時分類），還沒有換成預設：四足腳、核心 BD-AEGIS、三種背包推進器、戰車腳。
// PROC_COLS：槽位 → 固定色（顏色在貼圖上的 GLB：背包推進器）。PROC_PARTS：槽位 → 會動的零件（戰車腳的輪子與履帶片，render/proc-tank.js）。
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
import { p_core_c_hvPrims } from './core_c_hv.js';
import { p_head_h_hvPrims } from './head_h_hv.js';
import { p_arms_a_hv_l_upperPrims } from './arms_a_hv_l_upper.js';
import { p_arms_a_hv_l_forePrims } from './arms_a_hv_l_fore.js';
import { p_arms_a_hv_l_handPrims } from './arms_a_hv_l_hand.js';
import { p_arms_a_hv_r_upperPrims } from './arms_a_hv_r_upper.js';
import { p_arms_a_hv_r_forePrims } from './arms_a_hv_r_fore.js';
import { p_arms_a_hv_r_handPrims } from './arms_a_hv_r_hand.js';
import { p_legs_l_hv_pelvisPrims } from './legs_l_hv_pelvis.js';
import { p_legs_l_hv_l_thighPrims } from './legs_l_hv_l_thigh.js';
import { p_legs_l_hv_l_shinPrims } from './legs_l_hv_l_shin.js';
import { p_legs_l_hv_l_footPrims } from './legs_l_hv_l_foot.js';
import { p_legs_l_hv_r_thighPrims } from './legs_l_hv_r_thigh.js';
import { p_legs_l_hv_r_shinPrims } from './legs_l_hv_r_shin.js';
import { p_legs_l_hv_r_footPrims } from './legs_l_hv_r_foot.js';
import { p_core_c_natPrims } from './core_c_nat.js';
import { p_head_h_scanPrims } from './head_h_scan.js';
import { p_arms_a_ml_l_upperPrims } from './arms_a_ml_l_upper.js';
import { p_arms_a_ml_l_forePrims } from './arms_a_ml_l_fore.js';
import { p_arms_a_ml_l_handPrims } from './arms_a_ml_l_hand.js';
import { p_arms_a_ml_r_upperPrims } from './arms_a_ml_r_upper.js';
import { p_arms_a_ml_r_forePrims } from './arms_a_ml_r_fore.js';
import { p_arms_a_ml_r_handPrims } from './arms_a_ml_r_hand.js';
import { p_legs_l_rj_pelvisPrims } from './legs_l_rj_pelvis.js';
import { p_legs_l_rj_l_thighPrims } from './legs_l_rj_l_thigh.js';
import { p_legs_l_rj_l_shinPrims } from './legs_l_rj_l_shin.js';
import { p_legs_l_rj_l_metaPrims } from './legs_l_rj_l_meta.js';
import { p_legs_l_rj_l_footPrims } from './legs_l_rj_l_foot.js';
import { p_legs_l_rj_r_thighPrims } from './legs_l_rj_r_thigh.js';
import { p_legs_l_rj_r_shinPrims } from './legs_l_rj_r_shin.js';
import { p_legs_l_rj_r_metaPrims } from './legs_l_rj_r_meta.js';
import { p_legs_l_rj_r_footPrims } from './legs_l_rj_r_foot.js';
import { p_legs_l_qd_bodyPrims } from './legs_l_qd_body.js';
import { p_legs_l_qd_fl_thighPrims } from './legs_l_qd_fl_thigh.js';
import { p_legs_l_qd_fl_shinPrims } from './legs_l_qd_fl_shin.js';
import { p_legs_l_qd_fl_footPrims } from './legs_l_qd_fl_foot.js';
import { p_legs_l_qd_fr_thighPrims } from './legs_l_qd_fr_thigh.js';
import { p_legs_l_qd_fr_shinPrims } from './legs_l_qd_fr_shin.js';
import { p_legs_l_qd_fr_footPrims } from './legs_l_qd_fr_foot.js';
import { p_legs_l_qd_bl_thighPrims } from './legs_l_qd_bl_thigh.js';
import { p_legs_l_qd_bl_shinPrims } from './legs_l_qd_bl_shin.js';
import { p_legs_l_qd_bl_footPrims } from './legs_l_qd_bl_foot.js';
import { p_legs_l_qd_br_thighPrims } from './legs_l_qd_br_thigh.js';
import { p_legs_l_qd_br_shinPrims } from './legs_l_qd_br_shin.js';
import { p_legs_l_qd_br_footPrims } from './legs_l_qd_br_foot.js';
import { p_core_c_aegPrims } from './core_c_aeg.js';
import { p_booster_b_stdPrims, p_booster_b_stdCols } from './booster_b_std.js';
import { p_booster_b_hiPrims, p_booster_b_hiCols } from './booster_b_hi.js';
import { p_booster_b_effPrims, p_booster_b_effCols } from './booster_b_eff.js';
import { p_legs_l_tk_bodyPrims, p_legs_l_tk_bodyParts } from './legs_l_tk_body.js';

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
  // HAWK 重裝機型
  'core/c_hv': p_core_c_hvPrims,
  'head/h_hv': p_head_h_hvPrims,
  'arms/a_hv/l_upper': p_arms_a_hv_l_upperPrims,
  'arms/a_hv/l_fore': p_arms_a_hv_l_forePrims,
  'arms/a_hv/l_hand': p_arms_a_hv_l_handPrims,
  'arms/a_hv/r_upper': p_arms_a_hv_r_upperPrims,
  'arms/a_hv/r_fore': p_arms_a_hv_r_forePrims,
  'arms/a_hv/r_hand': p_arms_a_hv_r_handPrims,
  'legs/l_hv/pelvis': p_legs_l_hv_pelvisPrims,
  'legs/l_hv/l_thigh': p_legs_l_hv_l_thighPrims,
  'legs/l_hv/l_shin': p_legs_l_hv_l_shinPrims,
  'legs/l_hv/l_foot': p_legs_l_hv_l_footPrims,
  'legs/l_hv/r_thigh': p_legs_l_hv_r_thighPrims,
  'legs/l_hv/r_shin': p_legs_l_hv_r_shinPrims,
  'legs/l_hv/r_foot': p_legs_l_hv_r_footPrims,
  // 逆足機型
  'core/c_nat': p_core_c_natPrims,
  'head/h_scan': p_head_h_scanPrims,
  'arms/a_ml/l_upper': p_arms_a_ml_l_upperPrims,
  'arms/a_ml/l_fore': p_arms_a_ml_l_forePrims,
  'arms/a_ml/l_hand': p_arms_a_ml_l_handPrims,
  'arms/a_ml/r_upper': p_arms_a_ml_r_upperPrims,
  'arms/a_ml/r_fore': p_arms_a_ml_r_forePrims,
  'arms/a_ml/r_hand': p_arms_a_ml_r_handPrims,
  'legs/l_rj/pelvis': p_legs_l_rj_pelvisPrims,
  'legs/l_rj/l_thigh': p_legs_l_rj_l_thighPrims,
  'legs/l_rj/l_shin': p_legs_l_rj_l_shinPrims,
  'legs/l_rj/l_meta': p_legs_l_rj_l_metaPrims,
  'legs/l_rj/l_foot': p_legs_l_rj_l_footPrims,
  'legs/l_rj/r_thigh': p_legs_l_rj_r_thighPrims,
  'legs/l_rj/r_shin': p_legs_l_rj_r_shinPrims,
  'legs/l_rj/r_meta': p_legs_l_rj_r_metaPrims,
  'legs/l_rj/r_foot': p_legs_l_rj_r_footPrims,
};
export const PROC_TEMP = {
  'legs/l_qd/body': p_legs_l_qd_bodyPrims,
  'legs/l_qd/fl_thigh': p_legs_l_qd_fl_thighPrims,
  'legs/l_qd/fl_shin': p_legs_l_qd_fl_shinPrims,
  'legs/l_qd/fl_foot': p_legs_l_qd_fl_footPrims,
  'legs/l_qd/fr_thigh': p_legs_l_qd_fr_thighPrims,
  'legs/l_qd/fr_shin': p_legs_l_qd_fr_shinPrims,
  'legs/l_qd/fr_foot': p_legs_l_qd_fr_footPrims,
  'legs/l_qd/bl_thigh': p_legs_l_qd_bl_thighPrims,
  'legs/l_qd/bl_shin': p_legs_l_qd_bl_shinPrims,
  'legs/l_qd/bl_foot': p_legs_l_qd_bl_footPrims,
  'legs/l_qd/br_thigh': p_legs_l_qd_br_thighPrims,
  'legs/l_qd/br_shin': p_legs_l_qd_br_shinPrims,
  'legs/l_qd/br_foot': p_legs_l_qd_br_footPrims,
  'core/c_aeg': p_core_c_aegPrims,
  'booster/b_std': p_booster_b_stdPrims,
  'booster/b_hi': p_booster_b_hiPrims,
  'booster/b_eff': p_booster_b_effPrims,
  'legs/l_tk/body': p_legs_l_tk_bodyPrims,
};
export const PROC_COLS = {
  'booster/b_std': p_booster_b_stdCols,
  'booster/b_hi': p_booster_b_hiCols,
  'booster/b_eff': p_booster_b_effCols,
};
export const PROC_PARTS = {
  'legs/l_tk/body': p_legs_l_tk_bodyParts,
};
