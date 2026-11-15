// 地圖互動裝置的模型（docs/map-devices-design.md；純函式，不呼叫亂數）。
// 以舊尺度建模（和補給箱相同），遊戲裡整個乘 MS。會動的節點放在回傳群組的屬性上（dish、core…），
// 不放 userData（GLTFExporter 會寫進檔案）。命名為 glow 的材質是狀態的顏色（devices.js 依狀態改）。
import { P, bakeAll, gSph } from './geometry.js';
import { D } from './detail.js';
import {
  HP,
  boltRing,
  bx,
  cable,
  cx,
  cy,
  cz,
  fine,
  fins,
  handle,
  hazard,
  lathe,
  mGlow,
  mLamp,
  mStd,
  pipe,
  railing,
  rod,
  vents,
} from './dev-kit.js';
import { providedModel } from './model-provider.js';
import { tagStyle } from './style/shader.js';
import { TRAP_BUILDERS } from './trap-models.js';
import { EVENT_BUILDERS } from './event-models.js';
import { buildGunTurret, buildHwPick } from './gun-models.js';
import { HEAVY_WEAPONS } from '../data/devices.js';

const TINT = { tint: { ao: 0.8, grime: 0.3, gh: 0.6 } };

// 回復站：圓形平台（放射狀的地板、格柵）＋四座導電塔（絕緣子、線圈、頂上的放電器）＋外側的電源櫃＋
// 中央浮著的能量核心（core 節點：發光的膠囊包在框架與環裡）（直徑約 5.6 m）
const loop = (r, t, n = 24) =>
  D.sweep(
    D.ring(r, n).map(([p, q]) => [p, 0, q]),
    D.ring(t, 6),
    true,
  );
export function buildRechargeStation(color = 0x7ee081) {
  const g = new THREE.Group();
  const glb = providedModel('device/recharge');
  if (glb) {
    g.add(glb);
    g.core = glb.getObjectByName('core') || null;
    return g;
  }
  const M = {
    body: mStd(0x4c5864, { metalness: 0.5 }),
    sub: mStd(0x7e8a96, { metalness: 0.5 }),
    dark: mStd(0x22282e, { metalness: 0.6 }),
    steel: mStd(0x8e949a, { roughness: 0.3, metalness: 0.9 }),
    cer: mStd(0xc8c2b4, { roughness: 0.35, metalness: 0.05 }),
    copper: mStd(0xb86a3a, { roughness: 0.35, metalness: 0.9 }),
    yel: mStd(0xd8a628, { roughness: 0.6, metalness: 0.2 }),
  };
  const glow = mGlow(color, 1.4);
  const b = new THREE.Group();
  g.add(b);
  // 平台：外圈的斜面＋放射狀的 12 片地板（格柵）＋發光的內圈＋中央的發射座
  lathe(
    b,
    M.body,
    [
      [0, 0],
      [2.85, 0],
      [2.85, 0.12],
      [2.6, 0.32],
      [0, 0.32],
    ],
    0,
    0,
    0,
    'y',
    36,
  );
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const px = Math.sin(a) * 1.85,
      pz = Math.cos(a) * 1.85;
    bx(b, M.sub, 0.7, 0.05, 0.95, px, 0.34, pz, 0, a, 0, 0.015);
    fine(() => {
      for (let k = -2; k <= 2; k++)
        bx(
          b,
          M.dark,
          0.04,
          0.02,
          0.8,
          px + Math.cos(a) * k * 0.12,
          0.37,
          pz - Math.sin(a) * k * 0.12,
          0,
          a,
          0,
          0.004,
        );
    });
  }
  P(b, D.cyl(1.25, 1.25, 0.05, 36), glow, 0, 0.35, 0);
  cy(b, M.dark, 1.1, 0.12, 0, 0.38, 0, 36, 0.02);
  lathe(
    b,
    M.body,
    [
      [0, 0.3],
      [0.75, 0.3],
      [0.75, 0.5],
      [0.55, 0.62],
      [0.4, 0.62],
      [0.35, 0.7],
      [0, 0.7],
    ],
    0,
    0,
    0,
    'y',
    28,
  );
  P(b, D.cyl(0.3, 0.3, 0.04, 20), glow, 0, 0.71, 0);
  fine(() => boltRing(b, M.steel, 0.65, 0.52, 12, 0.03));
  // 四座導電塔：方形底座、絕緣子疊、銅線圈、頂上的放電球
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4,
      x = Math.sin(a) * 2.35,
      z = Math.cos(a) * 2.35;
    bx(b, M.body, 0.55, 0.4, 0.55, x, 0.5, z, 0, a, 0);
    hazard(b, M.yel, M.dark, 0.5, 0.08, 0.03, x - Math.sin(a) * 0.28, 0.5, z - Math.cos(a) * 0.28, a, 4);
    cy(b, M.dark, 0.16, 0.5, x, 0.95, z, 14, 0.02);
    for (let k = 0; k < 5; k++)
      lathe(
        b,
        M.cer,
        [
          [0, 0],
          [0.1, 0],
          [0.24, 0.05],
          [0.24, 0.08],
          [0.1, 0.14],
          [0, 0.14],
        ],
        x,
        1.2 + k * 0.17,
        z,
        'y',
        16,
      );
    cy(b, M.steel, 0.07, 0.95, x, 1.65, z, 10);
    fine(() => {
      for (let k = 0; k < 5; k++) P(b, loop(0.13, 0.026, 10), M.copper, x, 2.16 + k * 0.085, z);
    });
    P(b, D.box(0.08, 0.5, 0.08, 0.02), glow, x - Math.sin(a) * 0.12, 1.62, z - Math.cos(a) * 0.12, 0, a, 0);
    lathe(
      b,
      M.steel,
      [
        [0, 0],
        [0.1, 0],
        [0.24, 0.12],
        [0.26, 0.22],
        [0.2, 0.34],
        [0.08, 0.4],
        [0, 0.4],
      ],
      x,
      2.58,
      z,
      'y',
      18,
    );
    // 往中央的導管
    fine(() =>
      pipe(
        b,
        M.dark,
        [
          [x * 0.9, 0.38, z * 0.9],
          [x * 0.6, 0.42, z * 0.6],
          [x * 0.32, 0.42, z * 0.32],
        ],
        0.05,
        6,
      ),
    );
  }
  // 外側的電源櫃（儀表、開關、管線）
  bx(b, M.body, 0.9, 1.1, 0.5, 0, 0.55, -3.15);
  bx(b, M.dark, 0.95, 0.08, 0.55, 0, 1.12, -3.15);
  P(b, D.box(0.6, 0.12, 0.02, 0.005), glow, 0, 0.92, -2.89);
  fine(() => {
    for (const x of [-0.25, 0, 0.25]) {
      cz(b, M.steel, 0.07, 0.04, x, 0.68, -2.89, 14);
      cz(b, mLamp(0xf0f0e0, 0.5), 0.055, 0.045, x, 0.68, -2.885, 14);
    }
    vents(b, M.dark, M.sub, 0.6, 0.25, 0, 0.3, -2.89, 0, 4);
    pipe(
      b,
      M.copper,
      [
        [0.3, 0.2, -2.9],
        [0.3, 0.2, -2.75],
        [0.2, 0.3, -2.55],
      ],
      0.04,
      6,
    );
  });
  bakeAll(b, { ...TINT, cache: 'dev_recharge' });
  // 中央的能量核心：發光的膠囊＋上下的框架＋兩個環
  const core = new THREE.Group();
  core.name = 'core';
  core.position.y = 1.6;
  g.add(core);
  const c = new THREE.Group();
  core.add(c);
  lathe(
    c,
    glow,
    [
      [0, -0.62],
      [0.18, -0.58],
      [0.34, -0.42],
      [0.4, -0.2],
      [0.4, 0.2],
      [0.34, 0.42],
      [0.18, 0.58],
      [0, 0.62],
    ],
    0,
    0,
    0,
    'y',
    10,
  );
  for (const s of [-1, 1]) {
    cy(c, M.dark, 0.32, 0.12, 0, s * 0.66, 0, 20, 0.03);
    cy(c, M.steel, 0.22, 0.12, 0, s * 0.76, 0, 16, 0.03);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const s0 = Math.sin(a),
      c0 = Math.cos(a);
    rod(c, M.sub, [s0 * 0.3, -0.66, c0 * 0.3], [s0 * 0.52, 0, c0 * 0.52], 0.03, 6);
    rod(c, M.sub, [s0 * 0.52, 0, c0 * 0.52], [s0 * 0.3, 0.66, c0 * 0.3], 0.03, 6);
  }
  P(c, loop(0.56, 0.035), M.steel, 0, 0, 0);
  P(c, loop(0.62, 0.03), M.copper, 0, 0, 0, HP, 0, 0);
  bakeAll(c, { ...TINT, cache: 'dev_recharge_core' });
  g.core = core;
  tagStyle(g);
  return g;
}

const HW_KEYS = Object.keys(HEAVY_WEAPONS);
export const DEVICE_BUILDERS = {
  recharge: buildRechargeStation,
  ...TRAP_BUILDERS,
  ...EVENT_BUILDERS,
  gun_hmg: (c) => buildGunTurret('hmg', c),
  gun_rail: (c) => buildGunTurret('rail', c),
  gun_msl: (c) => buildGunTurret('msl', c),
  gun_flak: (c) => buildGunTurret('flak', c),
  // 撿起的重武器：spec.v＝重武器的索引
  hwpick: (c, spec) => {
    const k = HW_KEYS[Math.round((spec && spec.v) || 0) % HW_KEYS.length];
    return buildHwPick(k, HEAVY_WEAPONS[k].color);
  },
};
