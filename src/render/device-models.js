// 地圖互動裝置的模型（docs/map-devices-design.md；純函式，不呼叫亂數）。
// 以舊尺度建模（和補給箱相同），遊戲裡整個乘 MS。會動的節點放在回傳群組的屬性上（dish、core…），
// 不放 userData（GLTFExporter 會寫進檔案）。命名為 glow 的材質是狀態的顏色（devices.js 依狀態改）。
import { CB, P, bakeAll, gBox, gCyl } from './geometry.js';
import { providedModel } from './model-provider.js';
import { tagStyle } from './style/shader.js';

const mats = (color) => ({
  body: new THREE.MeshStandardMaterial({
    color: 0x4d5864,
    roughness: 0.6,
    metalness: 0.45,
    flatShading: true,
  }),
  frame: new THREE.MeshStandardMaterial({
    color: 0x272d33,
    roughness: 0.5,
    metalness: 0.65,
    flatShading: true,
  }),
  glow: Object.assign(
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.4 }),
    { name: 'glow' },
  ),
});
const TINT = { tint: { ao: 0.8, grime: 0.3, gh: 0.6 } };

// 雷達站：方形基座＋桅杆＋會轉的碟形天線（約 3.6 m 寬、5 m 高）
export function buildRadarStation(color = 0x5cc8ff) {
  const g = new THREE.Group();
  const glb = providedModel('device/radar');
  if (glb) {
    g.add(glb);
    g.dish = glb.getObjectByName('dish') || null;
    return g;
  }
  const m = mats(color);
  const b = new THREE.Group();
  g.add(b);
  CB(b, 3.6, 0.5, 3.6, m.body, 0, 0.25, 0);
  CB(b, 2.4, 0.9, 2.4, m.body, 0, 0.95, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      P(b, gBox(0.22, 0.6, 0.22), m.frame, sx * 1.65, 0.6, sz * 1.65);
      P(b, gBox(0.5, 0.08, 0.05), m.glow, sx * 0.6, 1.0, sz * 1.22);
    }
  P(b, gCyl(0.22, 0.32, 3.2, 10), m.frame, 0, 3.0, 0);
  P(b, gCyl(0.55, 0.55, 0.2, 12), m.body, 0, 4.5, 0);
  P(b, gBox(0.9, 0.5, 0.06), m.glow, 0, 1.2, 1.21);
  bakeAll(b, { ...TINT, cache: 'dev_radar' });
  const dish = new THREE.Group();
  dish.name = 'dish';
  dish.position.y = 4.65;
  g.add(dish);
  const d = new THREE.Group();
  dish.add(d);
  P(d, gCyl(1.6, 0.25, 0.5, 14), m.body, 0, 0.9, 0.25, -1.1, 0, 0);
  P(d, gCyl(0.06, 0.06, 1.4, 6), m.frame, 0, 0.9, -0.35, -1.1, 0, 0);
  P(d, gBox(0.18, 0.18, 0.18), m.glow, 0, 1.2, -0.95);
  P(d, gBox(0.3, 0.7, 0.3), m.frame, 0, 0.3, 0.2);
  bakeAll(d, { ...TINT, cache: 'dev_radar_dish' });
  g.dish = dish;
  tagStyle(g);
  return g;
}

// 回復站：圓形平台＋四根導電柱＋中央發光的核心（直徑約 5 m）
export function buildRechargeStation(color = 0x7ee081) {
  const g = new THREE.Group();
  const glb = providedModel('device/recharge');
  if (glb) {
    g.add(glb);
    g.core = glb.getObjectByName('core') || null;
    return g;
  }
  const m = mats(color);
  const b = new THREE.Group();
  g.add(b);
  P(b, gCyl(2.6, 2.8, 0.35, 20), m.body, 0, 0.17, 0);
  P(b, gCyl(2.2, 2.2, 0.06, 20), m.glow, 0, 0.37, 0);
  P(b, gCyl(1.9, 1.9, 0.08, 20), m.body, 0, 0.4, 0);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4,
      x = Math.cos(a) * 2.35,
      z = Math.sin(a) * 2.35;
    CB(b, 0.36, 2.4, 0.36, m.frame, x, 1.4, z, 0, -a, 0);
    P(b, gBox(0.12, 1.4, 0.4), m.glow, x * 0.94, 1.6, z * 0.94, 0, -a, 0);
    P(b, gCyl(0.24, 0.24, 0.3, 8), m.body, x, 2.7, z);
  }
  bakeAll(b, { ...TINT, cache: 'dev_recharge' });
  const core = new THREE.Group();
  core.name = 'core';
  core.position.y = 1.6;
  g.add(core);
  const c = new THREE.Group();
  core.add(c);
  P(c, gCyl(0.45, 0.45, 1.2, 8), m.glow, 0, 0, 0);
  P(c, gCyl(0.6, 0.6, 0.12, 8), m.frame, 0, 0.66, 0);
  P(c, gCyl(0.6, 0.6, 0.12, 8), m.frame, 0, -0.66, 0);
  bakeAll(c, { ...TINT, cache: 'dev_recharge_core' });
  g.core = core;
  tagStyle(g);
  return g;
}

export const DEVICE_BUILDERS = { radar: buildRadarStation, recharge: buildRechargeStation };
