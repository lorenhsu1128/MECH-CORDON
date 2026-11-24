// 敵方專用外觀「WARDEN 警備機」（2026-11-24，docs/mech-looks-design.md）。
// 使用者定案：外型要照現有機甲的模型來設計（精緻度與造型一致）——所以不從零手刻，而是拿現有區塊的清單
// （照內建 GLB 重建的那些）拼裝、變形、加掛：整套 HAWK 重裝機型當底，換上觀測頭、加掛別的機型的裝甲。
// 座標：glTF（+Z 正面、機體的右側＝−x）、公尺、區塊座標；右側的手臂與腳照這裡寫，左側是鏡像。
import { EYE_COLS } from './head_eyes.js';
import { pick, recolor, xf } from './look_kit.js';

// P＝proc/index.js 的 PROC_PRIMS（全部登記完之後才呼叫，拿得到對稱化與加了眼睛的清單）
const pieces = (P) => ({
  // 頭：觀測頭放大一點
  head: xf(P['head/h_scan'], { s: 1.12 }),
  // 核心：HAWK 的核心＋胸前加掛 AEGIS 核心的前半（當第二層胸甲）
  core: [
    ...P['core/c_hv'],
    ...xf(
      pick(P['core/c_aeg'], (x, y, z) => z > 0.45 && y > 0.5),
      { s: [1.08, 1.0, 1.1], t: [0, 0.3, 0.75] },
    ),
  ],
  // 上臂：HAWK 的上臂＋外面再罩一層 SEQ 的尖肩甲（放大）
  r_upper: [
    ...P['arms/a_hv/r_upper'],
    ...xf(
      pick(P['arms/a_lt/r_upper'], (x, y) => y > -0.75),
      { s: 1.4, t: [-0.3, 0.3, 0] },
    ),
  ],
  // 大腿：HAWK 的大腿＋外側掛 GRANITE 的方肩塊當側裙
  r_thigh: [
    ...P['legs/l_hv/r_thigh'],
    ...recolor(
      xf(
        pick(P['arms/a_std/r_upper'], (x, y) => y > -0.6),
        { s: 1.25, t: [-1.15, 0.2, 0] },
      ),
      {},
    ),
  ],
});

export const LOOK_WARDEN = {
  name: 'WARDEN 警備機',
  // 照哪些零件的骨架（展示與之後的敵方機甲用這組零件的數值；腳只能是二足）
  base: { head: 'h_hv', core: 'c_hv', arms: 'a_hv', legs: 'l_hv' },
  cols: EYE_COLS,
  pieces,
  joints: {},
};
