// 照 GLB 量測重建的程式模型（scripts/glb-to-proc.mjs 產生；批次 scripts/proc-batch.js）：槽位 id → 基本形體清單。
// PROC_PRIMS：槽位 → 清單（render/mech-model.js 的 makeProcPiece0 用它取代原本手寫的程式模型）。GRANITE 系列、SEQ 輕量機型、HAWK 重裝機型、逆足機型的頭、核心、手臂、腳，四足腳、核心 BD-AEGIS、三種背包推進器、戰車腳。
// PROC_TEMP：還在給使用者檢查的（模型庫的暫時分類），還沒有換成預設：手持武器 14 把與肩上武器 9 種（右側照 GLB 重建、左側是右側的鏡像）。
// PROC_SPIN：槽位 → 會轉的槍管（GLB 的 spin 節點：格林機槍、背部加特林）{ prims, cols, at }，procPrimPiece 掛成名稱 spin 的子群組。
// PROC_COLS：槽位 → 固定色（顏色在貼圖上的 GLB：背包推進器）。PROC_PARTS：槽位 → 會動的零件（戰車腳的輪子與履帶片，render/proc-tank.js）。
import { mirrorPrims } from '../proc-prims.js';
import { cStdPrims } from './c_std.js';
import { p_head_h_stdPrims } from './head_h_std.js';
import { p_arms_a_std_r_upperPrims } from './arms_a_std_r_upper.js';
import { p_arms_a_std_r_forePrims } from './arms_a_std_r_fore.js';
import { p_arms_a_std_r_handPrims } from './arms_a_std_r_hand.js';
import { p_legs_l_bp_pelvisPrims } from './legs_l_bp_pelvis.js';
import { p_legs_l_bp_r_thighPrims } from './legs_l_bp_r_thigh.js';
import { p_legs_l_bp_r_shinPrims } from './legs_l_bp_r_shin.js';
import { p_legs_l_bp_r_footPrims } from './legs_l_bp_r_foot.js';
import { p_core_c_ltPrims } from './core_c_lt.js';
import { p_head_h_ltPrims } from './head_h_lt.js';
import { p_arms_a_lt_r_upperPrims } from './arms_a_lt_r_upper.js';
import { p_arms_a_lt_r_forePrims } from './arms_a_lt_r_fore.js';
import { p_arms_a_lt_r_handPrims } from './arms_a_lt_r_hand.js';
import { p_legs_l_bp2_pelvisPrims } from './legs_l_bp2_pelvis.js';
import { p_legs_l_bp2_r_thighPrims } from './legs_l_bp2_r_thigh.js';
import { p_legs_l_bp2_r_shinPrims } from './legs_l_bp2_r_shin.js';
import { p_legs_l_bp2_r_footPrims } from './legs_l_bp2_r_foot.js';
import { p_core_c_hvPrims } from './core_c_hv.js';
import { p_head_h_hvPrims } from './head_h_hv.js';
import { p_arms_a_hv_r_upperPrims } from './arms_a_hv_r_upper.js';
import { p_arms_a_hv_r_forePrims } from './arms_a_hv_r_fore.js';
import { p_arms_a_hv_r_handPrims } from './arms_a_hv_r_hand.js';
import { p_legs_l_hv_pelvisPrims } from './legs_l_hv_pelvis.js';
import { p_legs_l_hv_r_thighPrims } from './legs_l_hv_r_thigh.js';
import { p_legs_l_hv_r_shinPrims } from './legs_l_hv_r_shin.js';
import { p_legs_l_hv_r_footPrims } from './legs_l_hv_r_foot.js';
import { p_core_c_natPrims } from './core_c_nat.js';
import { p_head_h_scanPrims } from './head_h_scan.js';
import { p_arms_a_ml_r_upperPrims } from './arms_a_ml_r_upper.js';
import { p_arms_a_ml_r_forePrims } from './arms_a_ml_r_fore.js';
import { p_arms_a_ml_r_handPrims } from './arms_a_ml_r_hand.js';
import { p_legs_l_rj_pelvisPrims } from './legs_l_rj_pelvis.js';
import { p_legs_l_rj_r_thighPrims } from './legs_l_rj_r_thigh.js';
import { p_legs_l_rj_r_shinPrims } from './legs_l_rj_r_shin.js';
import { p_legs_l_rj_r_metaPrims } from './legs_l_rj_r_meta.js';
import { p_legs_l_rj_r_footPrims } from './legs_l_rj_r_foot.js';
import { p_legs_l_qd_bodyPrims } from './legs_l_qd_body.js';
import { p_legs_l_qd_fl_thighPrims } from './legs_l_qd_fl_thigh.js';
import { p_legs_l_qd_fl_shinPrims } from './legs_l_qd_fl_shin.js';
import { p_legs_l_qd_fl_footPrims } from './legs_l_qd_fl_foot.js';
import { p_legs_l_qd_bl_thighPrims } from './legs_l_qd_bl_thigh.js';
import { p_legs_l_qd_bl_shinPrims } from './legs_l_qd_bl_shin.js';
import { p_legs_l_qd_bl_footPrims } from './legs_l_qd_bl_foot.js';
import { p_core_c_aegPrims } from './core_c_aeg.js';
import { p_booster_b_stdPrims, p_booster_b_stdCols } from './booster_b_std.js';
import { p_booster_b_hiPrims, p_booster_b_hiCols } from './booster_b_hi.js';
import { p_booster_b_effPrims, p_booster_b_effCols } from './booster_b_eff.js';
import { p_legs_l_tk_bodyPrims, p_legs_l_tk_bodyParts } from './legs_l_tk_body.js';
import { p_weapon_w_blade_rPrims, p_weapon_w_blade_rCols } from './weapon_w_blade_r.js';
import { p_weapon_w_bz_rPrims, p_weapon_w_bz_rCols } from './weapon_w_bz_r.js';
import { p_weapon_w_claw_rPrims, p_weapon_w_claw_rCols } from './weapon_w_claw_r.js';
import { p_weapon_w_emp_rPrims, p_weapon_w_emp_rCols } from './weapon_w_emp_r.js';
import { p_weapon_w_gl_rPrims, p_weapon_w_gl_rCols } from './weapon_w_gl_r.js';
import { p_weapon_w_hg_rPrims, p_weapon_w_hg_rCols } from './weapon_w_hg_r.js';
import { p_weapon_w_lc_rPrims, p_weapon_w_lc_rCols } from './weapon_w_lc_r.js';
import { p_weapon_w_lr_rPrims, p_weapon_w_lr_rCols } from './weapon_w_lr_r.js';
import { p_weapon_w_lsg_rPrims, p_weapon_w_lsg_rCols } from './weapon_w_lsg_r.js';
import { p_weapon_w_mg_rPrims, p_weapon_w_mg_rCols } from './weapon_w_mg_r.js';
import {
  p_weapon_w_mg_rSpinPrims,
  p_weapon_w_mg_rSpinCols,
  p_weapon_w_mg_rSpinAt,
} from './weapon_w_mg_r_spin.js';
import { p_weapon_w_pile_rPrims, p_weapon_w_pile_rCols } from './weapon_w_pile_r.js';
import { p_weapon_w_rifle_rPrims, p_weapon_w_rifle_rCols } from './weapon_w_rifle_r.js';
import { p_weapon_w_saber_rPrims, p_weapon_w_saber_rCols } from './weapon_w_saber_r.js';
import { p_weapon_w_sg_rPrims, p_weapon_w_sg_rCols } from './weapon_w_sg_r.js';
import { p_back_bw_emp_l_rPrims, p_back_bw_emp_l_rCols } from './back_bw_emp_l_r.js';
import { p_back_bw_emp_s_rPrims, p_back_bw_emp_s_rCols } from './back_bw_emp_s_r.js';
import { p_back_bw_gat_rPrims, p_back_bw_gat_rCols } from './back_bw_gat_r.js';
import {
  p_back_bw_gat_rSpinPrims,
  p_back_bw_gat_rSpinCols,
  p_back_bw_gat_rSpinAt,
} from './back_bw_gat_r_spin.js';
import { p_back_bw_gr_rPrims, p_back_bw_gr_rCols } from './back_bw_gr_r.js';
import { p_back_bw_lc_rPrims, p_back_bw_lc_rCols } from './back_bw_lc_r.js';
import { p_back_bw_ms_rPrims, p_back_bw_ms_rCols } from './back_bw_ms_r.js';
import { p_back_bw_ms8_rPrims, p_back_bw_ms8_rCols } from './back_bw_ms8_r.js';
import { p_back_bw_pm_rPrims, p_back_bw_pm_rCols } from './back_bw_pm_r.js';
import { p_back_bw_sh_rPrims, p_back_bw_sh_rCols } from './back_bw_sh_r.js';

export const PROC_PRIMS = {
  'core/c_std': cStdPrims, // BD-100 GRANITE
  'head/h_std': p_head_h_stdPrims,
  'arms/a_std/r_upper': p_arms_a_std_r_upperPrims,
  'arms/a_std/r_fore': p_arms_a_std_r_forePrims,
  'arms/a_std/r_hand': p_arms_a_std_r_handPrims,
  'legs/l_bp/pelvis': p_legs_l_bp_pelvisPrims,
  'legs/l_bp/r_thigh': p_legs_l_bp_r_thighPrims,
  'legs/l_bp/r_shin': p_legs_l_bp_r_shinPrims,
  'legs/l_bp/r_foot': p_legs_l_bp_r_footPrims,
  // SEQ 輕量機型
  'core/c_lt': p_core_c_ltPrims,
  'head/h_lt': p_head_h_ltPrims,
  'arms/a_lt/r_upper': p_arms_a_lt_r_upperPrims,
  'arms/a_lt/r_fore': p_arms_a_lt_r_forePrims,
  'arms/a_lt/r_hand': p_arms_a_lt_r_handPrims,
  'legs/l_bp2/pelvis': p_legs_l_bp2_pelvisPrims,
  'legs/l_bp2/r_thigh': p_legs_l_bp2_r_thighPrims,
  'legs/l_bp2/r_shin': p_legs_l_bp2_r_shinPrims,
  'legs/l_bp2/r_foot': p_legs_l_bp2_r_footPrims,
  // HAWK 重裝機型
  'core/c_hv': p_core_c_hvPrims,
  'head/h_hv': p_head_h_hvPrims,
  'arms/a_hv/r_upper': p_arms_a_hv_r_upperPrims,
  'arms/a_hv/r_fore': p_arms_a_hv_r_forePrims,
  'arms/a_hv/r_hand': p_arms_a_hv_r_handPrims,
  'legs/l_hv/pelvis': p_legs_l_hv_pelvisPrims,
  'legs/l_hv/r_thigh': p_legs_l_hv_r_thighPrims,
  'legs/l_hv/r_shin': p_legs_l_hv_r_shinPrims,
  'legs/l_hv/r_foot': p_legs_l_hv_r_footPrims,
  // 逆足機型
  'core/c_nat': p_core_c_natPrims,
  'head/h_scan': p_head_h_scanPrims,
  'arms/a_ml/r_upper': p_arms_a_ml_r_upperPrims,
  'arms/a_ml/r_fore': p_arms_a_ml_r_forePrims,
  'arms/a_ml/r_hand': p_arms_a_ml_r_handPrims,
  'legs/l_rj/pelvis': p_legs_l_rj_pelvisPrims,
  'legs/l_rj/r_thigh': p_legs_l_rj_r_thighPrims,
  'legs/l_rj/r_shin': p_legs_l_rj_r_shinPrims,
  'legs/l_rj/r_meta': p_legs_l_rj_r_metaPrims,
  'legs/l_rj/r_foot': p_legs_l_rj_r_footPrims,
  // 四足腳、核心 BD-AEGIS、背包推進器、戰車腳
  'legs/l_qd/body': p_legs_l_qd_bodyPrims,
  'legs/l_qd/fl_thigh': p_legs_l_qd_fl_thighPrims,
  'legs/l_qd/fl_shin': p_legs_l_qd_fl_shinPrims,
  'legs/l_qd/fl_foot': p_legs_l_qd_fl_footPrims,
  'legs/l_qd/bl_thigh': p_legs_l_qd_bl_thighPrims,
  'legs/l_qd/bl_shin': p_legs_l_qd_bl_shinPrims,
  'legs/l_qd/bl_foot': p_legs_l_qd_bl_footPrims,
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
// 左右鏡像（2026-11-17 使用者定案）：鏡像出來的槽位沒有自己的清單檔，載入時由來源的清單鏡射。[鏡像出來的槽位, 來源的槽位]。手臂與腳以右側為準、四足腳以左側為準（和內建 GLB 原本的做法一樣）
const MIRRORS = [];
for (const a of ['a_std', 'a_lt', 'a_hv', 'a_ml'])
  for (const k of ['upper', 'fore', 'hand']) MIRRORS.push([`arms/${a}/l_${k}`, `arms/${a}/r_${k}`]);
for (const l of ['l_bp', 'l_bp2', 'l_hv', 'l_rj'])
  for (const k of ['thigh', 'shin', 'meta', 'foot']) MIRRORS.push([`legs/${l}/l_${k}`, `legs/${l}/r_${k}`]);
for (const [d, s2] of [
  ['fr', 'fl'],
  ['br', 'bl'],
])
  for (const k of ['thigh', 'shin', 'foot']) MIRRORS.push([`legs/l_qd/${d}_${k}`, `legs/l_qd/${s2}_${k}`]);
for (const [d, s2] of MIRRORS) if (PROC_PRIMS[s2]) PROC_PRIMS[d] = mirrorPrims(PROC_PRIMS[s2]);
// 武器（手持、肩上）：顏色在貼圖上（固定色）；右側照 GLB 重建，左側＝右側的鏡像（2026-11-17 使用者定案）
const WEAPONS = {
  'weapon/w_blade': [p_weapon_w_blade_rPrims, p_weapon_w_blade_rCols],
  'weapon/w_bz': [p_weapon_w_bz_rPrims, p_weapon_w_bz_rCols],
  'weapon/w_claw': [p_weapon_w_claw_rPrims, p_weapon_w_claw_rCols],
  'weapon/w_emp': [p_weapon_w_emp_rPrims, p_weapon_w_emp_rCols],
  'weapon/w_gl': [p_weapon_w_gl_rPrims, p_weapon_w_gl_rCols],
  'weapon/w_hg': [p_weapon_w_hg_rPrims, p_weapon_w_hg_rCols],
  'weapon/w_lc': [p_weapon_w_lc_rPrims, p_weapon_w_lc_rCols],
  'weapon/w_lr': [p_weapon_w_lr_rPrims, p_weapon_w_lr_rCols],
  'weapon/w_lsg': [p_weapon_w_lsg_rPrims, p_weapon_w_lsg_rCols],
  'weapon/w_mg': [
    p_weapon_w_mg_rPrims,
    p_weapon_w_mg_rCols,
    { prims: p_weapon_w_mg_rSpinPrims, cols: p_weapon_w_mg_rSpinCols, at: p_weapon_w_mg_rSpinAt },
  ],
  'weapon/w_pile': [p_weapon_w_pile_rPrims, p_weapon_w_pile_rCols],
  'weapon/w_rifle': [p_weapon_w_rifle_rPrims, p_weapon_w_rifle_rCols],
  'weapon/w_saber': [p_weapon_w_saber_rPrims, p_weapon_w_saber_rCols],
  'weapon/w_sg': [p_weapon_w_sg_rPrims, p_weapon_w_sg_rCols],
  'back/bw_emp_l': [p_back_bw_emp_l_rPrims, p_back_bw_emp_l_rCols],
  'back/bw_emp_s': [p_back_bw_emp_s_rPrims, p_back_bw_emp_s_rCols],
  'back/bw_gat': [
    p_back_bw_gat_rPrims,
    p_back_bw_gat_rCols,
    { prims: p_back_bw_gat_rSpinPrims, cols: p_back_bw_gat_rSpinCols, at: p_back_bw_gat_rSpinAt },
  ],
  'back/bw_gr': [p_back_bw_gr_rPrims, p_back_bw_gr_rCols],
  'back/bw_lc': [p_back_bw_lc_rPrims, p_back_bw_lc_rCols],
  'back/bw_ms': [p_back_bw_ms_rPrims, p_back_bw_ms_rCols],
  'back/bw_ms8': [p_back_bw_ms8_rPrims, p_back_bw_ms8_rCols],
  'back/bw_pm': [p_back_bw_pm_rPrims, p_back_bw_pm_rCols],
  'back/bw_sh': [p_back_bw_sh_rPrims, p_back_bw_sh_rCols],
};
export const PROC_TEMP = {};
export const PROC_SPIN = {};
for (const k in WEAPONS) {
  const [pr, cols, spin] = WEAPONS[k];
  PROC_TEMP[k + '/r'] = pr;
  PROC_TEMP[k + '/l'] = mirrorPrims(pr);
  PROC_COLS[k + '/r'] = PROC_COLS[k + '/l'] = cols;
  if (spin) {
    PROC_SPIN[k + '/r'] = spin;
    PROC_SPIN[k + '/l'] = {
      prims: mirrorPrims(spin.prims),
      cols: spin.cols,
      at: [-spin.at[0], spin.at[1], spin.at[2]],
    };
  }
}
