// 環境陷阱的模型（第二版：docs/map-devices-design.md 的「第二版」——陷阱一律是圓形擴散的波）。
// 純函式、不呼叫亂數，品質標準照 docs/model-detail.md；舊尺度建模（1＝3 m，遊戲裡整個乘 MS），
// 原點＝擴散波的中心（地面）。會動的節點：wp＝弱點（發光，打壞就觸發）；命名為 glow 的材質依狀態發光。
// 弱點的位置（wp）、控制台的位置（use）、碰撞（solid）在 data/devices.js，模型要對齊它們。
import { P, bakeAll } from './geometry.js';
import { D } from './detail.js';
import { providedModel } from './model-provider.js';
import { tagStyle } from './style/shader.js';
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
  consoleAt,
  loop,
  metalSet,
} from './dev-kit.js';

const TINT = { tint: { ao: 0.85, grime: 0.4, gh: 0.6 } };
const node = (parent, name, y = 0) => {
  const n = new THREE.Group();
  n.name = name;
  n.position.y = y;
  parent.add(n);
  return n;
};
const glbOr = (slot, g) => {
  const glb = providedModel(slot);
  if (!glb) return false;
  g.add(glb);
  g.wp = glb.getObjectByName('wp') || null;
  return true;
};
// 地上一圈警示的發光環（擴散波的中心）
function centerRing(n, glow, r, y = 0.04) {
  P(n, loop(r, 0.035, 40), glow, 0, y, 0, HP, 0, 0);
}

// ---------- 舊宇宙港：垂直試車台——四腳的台架上吊著朝下的引擎，底下是導焰盤；控制台在旁邊 ----------
export function buildTrapTestRig(color = 0xff9a40) {
  const g = new THREE.Group();
  if (glbOr('device/testrig', g)) return g;
  const M = metalSet(0x9aa0a6, { roughness: 0.45 });
  M.burn = mStd(0x4a3e36, { roughness: 0.55, metalness: 0.8 });
  M.copper = mStd(0xb86a3a, { roughness: 0.35, metalness: 0.9 });
  M.white = mStd(0xe2e4e6, { roughness: 0.5, metalness: 0.2 });
  M.red = mStd(0xb83020, { roughness: 0.5, metalness: 0.3 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 導焰盤：燒黑的圓形鋼板、放射狀的導流溝、外圈的混凝土
  lathe(
    b,
    M.con,
    [
      [0, 0],
      [3.0, 0],
      [3.0, 0.12],
      [2.4, 0.18],
      [0, 0.18],
    ],
    0,
    0,
    0,
    'y',
    32,
  );
  cy(b, M.burn, 2.2, 0.06, 0, 0.21, 0, 32);
  fine(() => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      bx(b, M.dark, 1.6, 0.04, 0.12, Math.cos(a) * 1.2, 0.25, Math.sin(a) * 1.2, 0, -a, 0, 0.01);
    }
  });
  centerRing(b, glow, 2.7, 0.2);
  // 台架：四根桁架腳（主柱＋斜撐）、上方的平台與欄杆
  const L = 1.35;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      bx(b, M.white, 0.26, 5.2, 0.26, sx * L, 2.6, sz * L, 0, 0, 0, 0.03);
      bx(b, M.dark, 0.5, 0.2, 0.5, sx * L, 0.1, sz * L, 0, 0, 0, 0.04);
      fine(() => {
        for (const y of [1.3, 2.6, 3.9]) {
          rod(b, M.steel, [sx * L, y - 0.6, sz * L], [sx * L, y + 0.6, -sz * L * 0.98], 0.04, 5);
          rod(b, M.steel, [sx * L, y - 0.6, sz * L], [-sx * L * 0.98, y + 0.6, sz * L], 0.04, 5);
        }
      });
    }
  bx(b, M.dark, 3.2, 0.24, 3.2, 0, 5.3, 0, 0, 0, 0, 0.05);
  hazard(b, M.yel, M.dark, 3.0, 0.1, 0.03, 0, 5.3, 1.61, 0, 10);
  railing(
    b,
    M.yel,
    [
      [-1.55, -1.55],
      [1.55, -1.55],
      [1.55, 1.55],
      [-1.55, 1.55],
      [-1.55, -1.55],
    ],
    5.42,
  );
  // 平台上的兩個燃料球槽與管線
  for (const s of [-1, 1]) {
    P(b, new THREE.SphereGeometry(0.62, 18, 12), M.white, s * 0.75, 6.1, 0);
    cy(b, M.dark, 0.66, 0.08, s * 0.75, 6.1, 0, 20);
    for (const sz of [-1, 1])
      rod(b, M.steel, [s * 0.75, 5.45, sz * 0.4], [s * 0.75, 5.75, sz * 0.4], 0.05, 6);
    pipe(
      b,
      M.copper,
      [
        [s * 0.75, 5.5, 0],
        [s * 0.3, 5.0, 0],
        [0, 4.6, 0],
      ],
      0.07,
      8,
    );
  }
  // 引擎（噴口朝下）：萬向架、燃燒室、喉部、噴嘴鐘（下緣是發光的環＝點火的狀態）
  lathe(
    b,
    M.steel,
    [
      [0, 5.15],
      [0.5, 5.15],
      [0.6, 4.9],
      [0.6, 4.4],
      [0.42, 4.2],
      [0.34, 3.9],
      [0.5, 3.6],
      [0.8, 3.0],
      [1.05, 2.3],
      [1.12, 2.0],
      [1.05, 2.0],
      [0.98, 2.3],
      [0.74, 3.0],
      [0.44, 3.6],
      [0, 3.6],
    ],
    0,
    0,
    0,
    'y',
    28,
  );
  P(b, loop(1.1, 0.05, 32), glow, 0, 2.02, 0, HP, 0, 0);
  fine(() => {
    for (const y of [2.4, 2.8, 3.2])
      P(b, loop(0.98 - (y - 2.4) * 0.35, 0.025, 28), M.copper, 0, y, 0, HP, 0, 0);
    boltRing(b, M.dark, 0.58, 4.7, 12, 0.03);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      pipe(
        b,
        M.copper,
        [
          [Math.cos(a) * 0.62, 4.6, Math.sin(a) * 0.62],
          [Math.cos(a) * 0.85, 4.2, Math.sin(a) * 0.85],
          [Math.cos(a) * 0.55, 3.75, Math.sin(a) * 0.55],
        ],
        0.04,
        6,
      );
    }
  });
  // 控制台到台架的纜線（控制台在 use＝[-4.5, 0, -1.5]）
  consoleAt(b, M, glow, -4.5, -1.5, 0);
  fine(() => cable(b, M.dark, [-3.9, 0.1, -1.4], [-1.4, 0.2, -1.2], 0.05, 0.05));
  bakeAll(b, { ...TINT, cache: 'trap2_testrig' });
  tagStyle(g);
  return g;
}

// ---------- 洋上都市：高壓海水閥——甲板上的豎管、法蘭、手輪，管口朝上；控制台在旁邊 ----------
export function buildTrapValve(color = 0x6ad8ff) {
  const g = new THREE.Group();
  if (glbOr('device/valve', g)) return g;
  const M = metalSet(0x3a6a7a, { roughness: 0.5 });
  M.rust = mStd(0x7a4a32, { roughness: 0.8, metalness: 0.4 });
  M.red = mStd(0xb83020, { roughness: 0.5, metalness: 0.3 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 甲板上的方形基座、排水格柵、四角的繫纜柱
  bx(b, M.con, 2.8, 0.3, 2.8, 0, 0.15, 0, 0, 0, 0, 0.06);
  fine(() => {
    for (let k = -4; k <= 4; k++) bx(b, M.dark, 2.2, 0.03, 0.06, 0, 0.31, k * 0.25, 0, 0, 0, 0.005);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        lathe(
          b,
          M.rust,
          [
            [0, 0.3],
            [0.14, 0.3],
            [0.11, 0.55],
            [0.17, 0.62],
            [0, 0.66],
          ],
          sx * 1.2,
          0,
          sz * 1.2,
          'y',
          10,
        );
  });
  hazard(b, M.yel, M.dark, 2.6, 0.1, 0.03, 0, 0.26, 1.41, 0, 10);
  centerRing(b, glow, 3.2, 0.32);
  // 豎管：從甲板下冒出的粗管、三段法蘭、主閥體、往上的噴口（內緣發光）
  lathe(
    b,
    M.body,
    [
      [0, 0.3],
      [0.62, 0.3],
      [0.62, 0.45],
      [0.46, 0.5],
      [0.46, 1.1],
      [0.66, 1.12],
      [0.66, 1.26],
      [0.5, 1.3],
      [0.5, 1.8],
      [0.72, 1.85],
      [0.72, 2.05],
      [0.44, 2.1],
      [0.44, 2.6],
      [0.6, 2.75],
      [0.6, 2.85],
      [0.38, 2.85],
      [0.38, 2.4],
      [0, 2.4],
    ],
    0,
    0,
    0,
    'y',
    24,
  );
  P(b, loop(0.48, 0.05, 28), glow, 0, 2.84, 0, HP, 0, 0);
  fine(() => {
    for (const y of [0.38, 1.19, 1.95]) boltRing(b, M.steel, 0.58, y, 12, 0.035);
  });
  // 主閥的手輪（側面）與兩條往甲板下的進水管
  bx(b, M.red, 0.5, 0.5, 0.5, 0.7, 1.55, 0, 0, 0, 0, 0.05);
  rod(b, M.steel, [0.95, 1.55, 0], [1.25, 1.55, 0], 0.04, 6);
  P(b, loop(0.36, 0.04, 20), M.red, 1.27, 1.55, 0, 0, HP, 0);
  for (const s of [-1, 1])
    pipe(
      b,
      M.body,
      [
        [0, 0.9, s * 0.45],
        [0, 0.9, s * 1.0],
        [0, 0.5, s * 1.25],
        [0, 0.1, s * 1.25],
      ],
      0.16,
      10,
    );
  // 控制台（use＝[0, 0, -4.5]）
  consoleAt(b, M, glow, 0, -4.5, HP);
  fine(() => cable(b, M.dark, [0, 0.1, -3.9], [0, 0.2, -1.4], 0.05, 0.05));
  bakeAll(b, { ...TINT, cache: 'trap2_valve' });
  tagStyle(g);
  return g;
}

// ---------- 模擬訓練場：脈衝發生器——六角基座上的電極塔（三組線圈、頂上的電極球），四個電容櫃；控制台在旁邊 ----------
export function buildTrapPulse(color = 0x7fc8ff) {
  const g = new THREE.Group();
  if (glbOr('device/pulse', g)) return g;
  const M = metalSet(0xc8ccd2, { roughness: 0.45 });
  M.copper = mStd(0xb86a3a, { roughness: 0.3, metalness: 0.9 });
  M.ins = mStd(0xe8e2d0, { roughness: 0.4, metalness: 0.05 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 六角基座（訓練場的白色＋藍色的標線）
  lathe(
    b,
    M.body,
    [
      [0, 0],
      [1.7, 0],
      [1.7, 0.3],
      [1.4, 0.45],
      [0, 0.45],
    ],
    0,
    0,
    0,
    'y',
    6,
  );
  centerRing(b, glow, 3.4, 0.03);
  centerRing(b, glow, 1.85, 0.32);
  // 塔身：絕緣子堆疊、三組線圈（發光的銅線圈＝充能）、頂上的電極球與避雷針
  cy(b, M.dark, 0.42, 0.5, 0, 0.7, 0, 16, 0.04);
  for (let k = 0; k < 9; k++) cy(b, M.ins, 0.3 - (k % 2) * 0.08, 0.16, 0, 1.05 + k * 0.17, 0, 14, 0.03);
  for (const y of [2.7, 3.25, 3.8]) {
    cy(b, M.dark, 0.32, 0.4, 0, y, 0, 16, 0.03);
    P(b, loop(0.55, 0.11, 28), M.copper, 0, y, 0, HP, 0, 0);
    P(b, loop(0.55, 0.05, 28), glow, 0, y + 0.13, 0, HP, 0, 0);
  }
  cy(b, M.dark, 0.18, 0.3, 0, 4.15, 0, 12);
  P(b, new THREE.SphereGeometry(0.45, 20, 14), glow, 0, 4.55, 0);
  rod(b, M.steel, [0, 4.9, 0], [0, 5.5, 0], 0.03, 5);
  // 四個電容櫃（散熱片、警示燈）與連到塔底的纜線
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 1.25,
      z = Math.sin(a) * 1.25;
    bx(b, M.sub, 0.5, 0.9, 0.5, x, 0.9, z, 0, -a, 0, 0.04);
    fine(() => {
      fins(b, M.dark, 4, 0.4, 0.5, 0.04, x, 0.95, z, -a, 0.02);
      cy(b, mLamp(0xff4030, 0.9), 0.05, 0.06, x, 1.38, z, 8);
      cable(b, M.dark, [x * 0.8, 0.5, z * 0.8], [x * 0.3, 0.6, z * 0.3], 0.04, 0.05);
    });
  }
  // 控制台（use＝[4.5, 0, 0]）
  consoleAt(b, M, glow, 4.5, 0, 0);
  fine(() => cable(b, M.dark, [3.9, 0.1, 0.1], [1.6, 0.4, 0.1], 0.05, 0.05));
  bakeAll(b, { ...TINT, cache: 'trap2_pulse' });
  tagStyle(g);
  return g;
}

// ---------- 荒野：廢棄變電站——大型變壓器（散熱片、三支套管、儲油櫃），弱點＝側面的冷卻油槽；外圍的圍欄 ----------
export function buildTrapSubstation(color = 0xffe060) {
  const g = new THREE.Group();
  if (glbOr('device/substation', g)) return g;
  const M = metalSet(0x6a7a6a, { roughness: 0.6 });
  M.rust = mStd(0x7a4a32, { roughness: 0.85, metalness: 0.35 });
  M.ins = mStd(0x6a4a3a, { roughness: 0.35, metalness: 0.05 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 混凝土基礎、碎石地
  bx(b, M.con, 4.2, 0.25, 3.4, 0, 0.12, 0, 0, 0, 0, 0.05);
  // 變壓器本體、兩側的散熱片組、頂上的三支套管（絕緣子的裙）、儲油櫃
  bx(b, M.body, 2.4, 1.8, 1.6, 0, 1.15, 0, 0, 0, 0, 0.06);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 7; k++) bx(b, M.sub, 0.06, 1.4, 0.7, -0.9 + k * 0.3, 1.1, s * 1.15, 0, 0, 0, 0.01);
    rod(b, M.steel, [-1.0, 1.85, s * 0.8], [1.0, 1.85, s * 0.8], 0.05, 6);
    rod(b, M.steel, [-1.0, 0.4, s * 0.8], [1.0, 0.4, s * 0.8], 0.05, 6);
  }
  for (const x of [-0.7, 0, 0.7]) {
    cy(b, M.dark, 0.12, 0.2, x, 2.15, 0.2, 10);
    for (let k = 0; k < 6; k++) cy(b, M.ins, 0.16 - (k % 2) * 0.05, 0.1, x, 2.3 + k * 0.12, 0.2, 12);
    cy(b, M.steel, 0.05, 0.2, x, 3.1, 0.2, 8);
  }
  cx(b, M.body, 0.3, 1.8, 0, 2.5, -0.5, 16, 0.04);
  rod(b, M.steel, [-0.6, 2.05, -0.5], [-0.6, 2.25, -0.5], 0.05, 6);
  rod(b, M.steel, [0.6, 2.05, -0.5], [0.6, 2.25, -0.5], 0.05, 6);
  fine(() => {
    vents(b, M.dark, M.sub, 0.8, 0.5, 0, 0.8, 0.81, 0, 5);
    bx(b, M.yel, 0.5, 0.35, 0.02, -0.7, 1.6, 0.81);
    // 圍欄：柱子＋上方的帶刺鐵絲（缺了一段）
    const F = [
      [-2.6, -2.2],
      [2.6, -2.2],
      [2.6, 2.2],
      [-0.4, 2.2],
    ];
    railing(b, M.rust, F, 0.2, 1.3, 0.025);
    for (const [x, z] of F) cy(b, M.rust, 0.05, 1.6, x, 0.8, z, 6);
  });
  // 弱點：冷卻油槽（+X 側，橫放的筒、發光的警示帶、壓力表）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  cz(w, M.rust, 0.45, 1.3, 1.9, 1.0, 0, 18, 0.05);
  P(w, D.cyl(0.47, 0.47, 0.14, 18), glow, 1.9, 1.0, 0.25, HP, 0, 0);
  P(w, D.cyl(0.47, 0.47, 0.14, 18), glow, 1.9, 1.0, -0.25, HP, 0, 0);
  for (const z of [-0.45, 0.45]) bx(w, M.dark, 0.7, 0.55, 0.12, 1.9, 0.35, z, 0, 0, 0, 0.02);
  pipe(
    w,
    M.steel,
    [
      [1.9, 1.45, 0],
      [1.9, 1.7, 0],
      [1.25, 1.7, 0],
    ],
    0.06,
    8,
  );
  bakeAll(b, { ...TINT, cache: 'trap2_sub' });
  bakeAll(w, { ...TINT, cache: 'trap2_sub_wp' });
  g.wp = wp;
  tagStyle(g);
  return g;
}

// ---------- 階梯水壩：壩頂蓄水塔——四腳的高架水槽（斜撐、梯子、圓錐頂），弱點＝豎管底部的洩壓閥 ----------
export function buildTrapWaterTower(color = 0x7fd0ff) {
  const g = new THREE.Group();
  if (glbOr('device/watertower', g)) return g;
  const M = metalSet(0x7a8a96, { roughness: 0.55 });
  M.rust = mStd(0x7a5a42, { roughness: 0.85, metalness: 0.35 });
  M.red = mStd(0xb83020, { roughness: 0.5, metalness: 0.3 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  const L = 1.4;
  // 四根腳（基礎座、往內斜的柱、X 斜撐、水平環梁）
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      bx(b, M.con, 0.6, 0.3, 0.6, sx * L, 0.15, sz * L, 0, 0, 0, 0.04);
      rod(b, M.body, [sx * L, 0.3, sz * L], [sx * 1.05, 3.6, sz * 1.05], 0.12, 8);
    }
  for (const y of [1.3, 2.5]) {
    const k = L - ((y - 0.3) / 3.3) * 0.35;
    railing(
      b,
      M.steel,
      [
        [-k, -k],
        [k, -k],
        [k, k],
        [-k, k],
        [-k, -k],
      ],
      y,
      0.01,
      0.04,
    );
  }
  fine(() => {
    for (const [a, c] of [
      [
        [-1, -1],
        [1, -1],
      ],
      [
        [1, -1],
        [1, 1],
      ],
      [
        [1, 1],
        [-1, 1],
      ],
      [
        [-1, 1],
        [-1, -1],
      ],
    ]) {
      rod(b, M.steel, [a[0] * 1.35, 0.5, a[1] * 1.35], [c[0] * 1.2, 2.4, c[1] * 1.2], 0.03, 5);
      rod(b, M.steel, [c[0] * 1.35, 0.5, c[1] * 1.35], [a[0] * 1.2, 2.4, a[1] * 1.2], 0.03, 5);
    }
  });
  // 水槽：圓筒、圓錐頂、走道與欄杆、側面的水位計（發光）
  lathe(
    b,
    M.body,
    [
      [0, 3.55],
      [1.5, 3.6],
      [1.65, 3.75],
      [1.65, 5.5],
      [1.7, 5.55],
      [0.2, 6.3],
      [0, 6.35],
    ],
    0,
    0,
    0,
    'y',
    28,
  );
  P(b, loop(1.9, 0.04, 32), M.steel, 0, 3.85, 0, HP, 0, 0);
  railing(
    b,
    M.yel,
    Array.from({ length: 17 }, (_, i) => {
      const a = (i / 16) * Math.PI * 2;
      return [Math.cos(a) * 1.95, Math.sin(a) * 1.95];
    }),
    3.85,
  );
  P(b, D.box(0.12, 1.5, 0.05, 0.01), glow, 0, 4.6, 1.67);
  fine(() => {
    for (const y of [4.1, 4.7, 5.3]) P(b, loop(1.66, 0.025, 32), M.dark, 0, y, 0, HP, 0, 0);
    // 梯子（−X 側的腳上）
    for (const s of [-0.12, 0.12])
      rod(b, M.steel, [-1.4 + s * 0, 0.3, -1.4 + s], [-1.05, 3.8, -1.05 + s], 0.025, 5);
  });
  hazard(b, M.yel, M.dark, 3.2, 0.12, 0.03, 0, 3.62, 1.66, 0, 12);
  // 中央的豎管（從水槽底往下到地面）
  cy(b, M.rust, 0.25, 3.3, 0, 1.9, 0, 14);
  boltRing(b, M.steel, 0.3, 3.3, 8, 0.03);
  // 弱點：豎管底部的洩壓閥（紅色閥體、發光的壓力環、手輪、往外的洩壓口）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  bx(w, M.red, 0.55, 0.55, 0.55, 0.45, 1.0, 0.45, 0, Math.PI / 4, 0, 0.05);
  P(w, loop(0.34, 0.06, 20), glow, 0.45, 1.0, 0.45, 0, 0, 0);
  P(w, loop(0.34, 0.06, 20), glow, 0.45, 1.0, 0.45, HP, 0, 0);
  rod(w, M.steel, [0.45, 1.27, 0.45], [0.45, 1.5, 0.45], 0.035, 6);
  P(w, loop(0.22, 0.03, 16), M.red, 0.45, 1.52, 0.45, HP, 0, 0);
  pipe(
    w,
    M.rust,
    [
      [0.2, 1.0, 0.2],
      [0.05, 1.0, 0.05],
    ],
    0.1,
    8,
  );
  bakeAll(b, { ...TINT, cache: 'trap2_wt' });
  bakeAll(w, { ...TINT, cache: 'trap2_wt_wp' });
  g.wp = wp;
  tagStyle(g);
  return g;
}

// ---------- 高空軌道：高壓氣瓶組——框架裡兩排六支高壓氣瓶、上方的集流管，弱點＝頂上的主閥 ----------
export function buildTrapO2Tank(color = 0xffd060) {
  const g = new THREE.Group();
  if (glbOr('device/o2tank', g)) return g;
  const M = metalSet(0xd8dce0, { roughness: 0.45 });
  M.green = mStd(0x3a8a5a, { roughness: 0.4, metalness: 0.3 });
  M.white = mStd(0xeceef0, { roughness: 0.45, metalness: 0.15 });
  M.red = mStd(0xc83a2a, { roughness: 0.45, metalness: 0.3 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 底板（磁吸的固定座）＋框架（四根角柱、上下的環梁、束帶）
  bx(b, M.dark, 3.0, 0.2, 2.0, 0, 0.1, 0, 0, 0, 0, 0.05);
  hazard(b, M.yel, M.dark, 2.8, 0.08, 0.03, 0, 0.18, 1.01, 0, 10);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) bx(b, M.body, 0.14, 2.4, 0.14, sx * 1.35, 1.3, sz * 0.85, 0, 0, 0, 0.02);
  for (const y of [0.6, 1.5, 2.45]) {
    bx(b, M.sub, 2.84, 0.1, 0.1, 0, y, 0.85, 0, 0, 0, 0.02);
    bx(b, M.sub, 2.84, 0.1, 0.1, 0, y, -0.85, 0, 0, 0, 0.02);
    bx(b, M.sub, 0.1, 0.1, 1.74, 1.35, y, 0, 0, 0, 0, 0.02);
    bx(b, M.sub, 0.1, 0.1, 1.74, -1.35, y, 0, 0, 0, 0, 0.02);
  }
  // 六支氣瓶（綠／白交錯、圓頂、頸部的閥）
  for (let i = 0; i < 3; i++)
    for (const sz of [-1, 1]) {
      const x = -0.85 + i * 0.85,
        z = sz * 0.42;
      lathe(
        b,
        (i + (sz > 0 ? 1 : 0)) % 2 ? M.green : M.white,
        [
          [0, 0.2],
          [0.34, 0.22],
          [0.38, 0.35],
          [0.38, 1.95],
          [0.3, 2.15],
          [0.12, 2.25],
          [0, 2.25],
        ],
        x,
        0,
        z,
        'y',
        18,
      );
      cy(b, M.steel, 0.07, 0.18, x, 2.33, z, 8);
      fine(() => P(b, loop(0.39, 0.02, 20), M.dark, x, 1.2, z, HP, 0, 0));
    }
  // 集流管：每支氣瓶接到中間的主管
  for (const sz of [-1, 1]) {
    rod(b, M.steel, [-0.85, 2.42, sz * 0.42], [0.85, 2.42, sz * 0.42], 0.05, 6);
    rod(b, M.steel, [0, 2.42, sz * 0.42], [0, 2.55, 0], 0.05, 6);
  }
  fine(() => {
    for (let i = 0; i < 3; i++)
      for (const sz of [-1, 1])
        rod(b, M.steel, [-0.85 + i * 0.85, 2.38, sz * 0.42], [-0.85 + i * 0.85, 2.44, sz * 0.42], 0.03, 5);
    cy(b, mLamp(0xff3020, 1.2), 0.06, 0.08, 1.35, 2.6, 0.85, 8);
    cy(b, mLamp(0xff3020, 1.2), 0.06, 0.08, -1.35, 2.6, -0.85, 8);
  });
  // 弱點：頂上的主閥（紅色閥體、發光的壓力環、手輪、壓力表）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  bx(w, M.red, 0.45, 0.35, 0.45, 0, 2.7, 0, 0, 0, 0, 0.05);
  P(w, loop(0.3, 0.05, 20), glow, 0, 2.7, 0, HP, 0, 0);
  rod(w, M.steel, [0, 2.88, 0], [0, 3.05, 0], 0.03, 6);
  P(w, loop(0.2, 0.025, 16), M.red, 0, 3.06, 0, HP, 0, 0);
  cz(w, M.steel, 0.1, 0.06, 0.25, 2.72, 0.24, 14);
  cz(w, mLamp(0xf0f0e0, 0.5), 0.08, 0.065, 0.25, 2.72, 0.25, 14);
  bakeAll(b, { ...TINT, cache: 'trap2_o2' });
  bakeAll(w, { ...TINT, cache: 'trap2_o2_wp' });
  g.wp = wp;
  tagStyle(g);
  return g;
}

// ---------- 火山熔爐帶：熔渣釜——A 字形的吊架、橫梁上吊著盛滿熔渣的大鍋，弱點＝傾倒用的吊鏈齒輪箱 ----------
export function buildTrapSlagPot(color = 0xff6a20) {
  const g = new THREE.Group();
  if (glbOr('device/slagpot', g)) return g;
  const M = metalSet(0x4a4440, { roughness: 0.7 });
  M.burn = mStd(0x2e2622, { roughness: 0.75, metalness: 0.6 });
  M.rust = mStd(0x7a4a32, { roughness: 0.85, metalness: 0.35 });
  const glow = mGlow(color, 1.6);
  const b = new THREE.Group();
  g.add(b);
  // 燒黑的地面與擋渣的矮牆（缺口朝外）
  cy(b, M.burn, 3.0, 0.08, 0, 0.04, 0, 32);
  centerRing(b, glow, 2.6, 0.1);
  // A 字形吊架（兩側各兩根斜柱＋橫撐）與頂上的橫梁
  for (const s of [-1, 1]) {
    bx(b, M.con, 0.8, 0.3, 1.9, s * 2.2, 0.15, 0, 0, 0, 0, 0.05);
    for (const sz of [-1, 1]) rod(b, M.body, [s * 2.2, 0.3, sz * 0.8], [s * 2.0, 4.4, 0], 0.13, 8);
    rod(b, M.steel, [s * 2.15, 1.6, -0.6], [s * 2.15, 1.6, 0.6], 0.06, 6);
    hazard(b, M.yel, M.dark, 1.6, 0.1, 0.03, s * 2.2, 0.36, 0.96, 0, 6);
  }
  bx(b, M.body, 4.6, 0.4, 0.5, 0, 4.5, 0, 0, 0, 0, 0.05);
  fine(() => {
    for (let x = -2; x <= 2; x += 0.5) bx(b, M.dark, 0.06, 0.4, 0.52, x, 4.5, 0, 0, 0, 0, 0.005);
  });
  // 鍋：外殼（加強環）、兩側的耳軸、吊鏈、表面發光的熔渣
  lathe(
    b,
    M.rust,
    [
      [0, 1.3],
      [0.7, 1.32],
      [1.15, 1.6],
      [1.45, 2.2],
      [1.6, 2.9],
      [1.7, 3.0],
      [1.58, 3.0],
      [1.48, 2.85],
      [0, 2.85],
    ],
    0,
    0,
    0,
    'y',
    28,
  );
  cy(b, glow, 1.47, 0.04, 0, 2.86, 0, 28);
  for (const y of [1.9, 2.5]) P(b, loop(1.42 + (y - 1.9) * 0.18, 0.06, 32), M.dark, 0, y, 0, HP, 0, 0);
  for (const s of [-1, 1]) {
    cx(b, M.dark, 0.18, 0.4, s * 1.75, 2.6, 0, 12);
    for (let k = 0; k < 6; k++)
      P(b, loop(0.09, 0.025, 10), M.steel, s * 1.75, 2.85 + k * 0.27, 0, k % 2 ? HP : 0, k % 2 ? 0 : HP, 0);
  }
  fine(() => {
    // 鍋口垂下的凝固熔渣
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + 0.3;
      cy(b, M.burn, 0.08, 0.35 + (k % 3) * 0.12, Math.cos(a) * 1.62, 2.75, Math.sin(a) * 1.62, 6, 0, 0.03);
    }
  });
  // 弱點：橫梁中央的傾倒齒輪箱（齒輪、發光的離合器、往鍋邊的吊鏈）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  bx(w, M.yel, 0.7, 0.6, 0.6, 0, 4.1, 0.5, 0, 0, 0, 0.05);
  P(w, loop(0.32, 0.07, 20), glow, 0, 4.1, 0.82, 0, 0, 0);
  cz(w, M.dark, 0.2, 0.2, 0, 4.1, 0.86, 14);
  fine(() => {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      bx(w, M.steel, 0.06, 0.08, 0.1, Math.cos(a) * 0.36, 4.1 + Math.sin(a) * 0.36, 0.82, 0, 0, a, 0.005);
    }
  });
  for (let k = 0; k < 5; k++)
    P(w, loop(0.08, 0.022, 10), M.steel, 0.2 + k * 0.3, 3.95 - k * 0.22, 0.5, 0, k % 2 ? HP : 0, 0.6);
  bakeAll(b, { ...TINT, cache: 'trap2_slag' });
  bakeAll(w, { ...TINT, cache: 'trap2_slag_wp' });
  g.wp = wp;
  tagStyle(g);
  return g;
}

// ---------- 方舟：甲板彈藥架——三層的砲彈架（橫放的大口徑砲彈）、彈藥箱，弱點＝前面的引信盒 ----------
export function buildTrapAmmoRack(color = 0xff7a40) {
  const g = new THREE.Group();
  if (glbOr('device/ammorack', g)) return g;
  const M = metalSet(0x5a6066, { roughness: 0.55 });
  M.brass = mStd(0xc89a40, { roughness: 0.3, metalness: 0.9 });
  M.olive = mStd(0x4a5a3a, { roughness: 0.6, metalness: 0.3 });
  M.red = mStd(0xb83020, { roughness: 0.5, metalness: 0.3 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 甲板上的底座（防滑鋼板）＋架子（四根立柱、三層托架）
  bx(b, M.dark, 3.6, 0.2, 2.0, 0, 0.1, 0, 0, 0, 0, 0.05);
  hazard(b, M.yel, M.dark, 3.4, 0.08, 0.03, 0, 0.18, 1.01, 0, 12);
  centerRing(b, glow, 2.4, 0.04);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) bx(b, M.body, 0.16, 2.1, 0.16, sx * 1.6, 1.25, sz * 0.75, 0, 0, 0, 0.02);
  for (const y of [0.45, 1.05, 1.65]) {
    for (const sz of [-1, 1]) bx(b, M.sub, 3.36, 0.1, 0.12, 0, y, sz * 0.75, 0, 0, 0, 0.02);
    fine(() => {
      for (const x of [-1.0, 0, 1.0]) bx(b, M.sub, 0.1, 0.08, 1.5, x, y, 0, 0, 0, 0, 0.01);
    });
  }
  bx(b, M.body, 3.4, 0.12, 1.66, 0, 2.3, 0, 0, 0, 0, 0.03);
  // 砲彈：每層四發（彈體、黃銅彈殼、彈帶、尖頭）
  for (const y of [0.72, 1.32, 1.92])
    for (let i = 0; i < 4; i++) {
      const x = -1.15 + i * 0.77;
      lathe(
        b,
        M.olive,
        [
          [0, -0.7],
          [0.22, -0.7],
          [0.24, -0.66],
          [0.24, 0.15],
          [0.2, 0.4],
          [0.1, 0.62],
          [0, 0.7],
        ],
        x,
        y,
        0,
        'z',
        14,
      );
      cz(b, M.brass, 0.245, 0.06, x, y, -0.1, 14);
      cz(b, M.brass, 0.25, 0.14, x, y, -0.72, 14);
    }
  // 旁邊的彈藥箱
  for (const [x, z, ry] of [
    [2.3, 0.4, 0.2],
    [2.35, -0.5, -0.1],
  ]) {
    bx(b, M.olive, 0.7, 0.45, 0.5, x, 0.43, z, 0, ry, 0, 0.03);
    fine(() => handle(b, M.steel, 0.25, x, 0.7, z, ry, 0.05, 0.015));
  }
  // 弱點：前面的引信盒（紅色箱、發光的警示燈與面板、往砲彈的導線）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  bx(w, M.red, 0.6, 0.5, 0.25, 0, 1.0, 0.95, 0, 0, 0, 0.04);
  P(w, D.box(0.42, 0.3, 0.02, 0.005), glow, 0, 1.0, 1.08);
  cy(w, glow, 0.07, 0.1, 0, 1.3, 0.95, 10);
  fine(() => {
    for (const x of [-0.2, 0.2]) cable(w, M.dark, [x, 0.8, 0.85], [x * 3, 0.72, 0.6], 0.025, 0.05);
  });
  bakeAll(b, { ...TINT, cache: 'trap2_ammo' });
  bakeAll(w, { ...TINT, cache: 'trap2_ammo_wp' });
  g.wp = wp;
  tagStyle(g);
  return g;
}

export const TRAP_BUILDERS2 = {
  testrig: buildTrapTestRig,
  valve: buildTrapValve,
  pulse: buildTrapPulse,
  substation: buildTrapSubstation,
  watertower: buildTrapWaterTower,
  o2tank: buildTrapO2Tank,
  slagpot: buildTrapSlagPot,
  ammorack: buildTrapAmmoRack,
};
