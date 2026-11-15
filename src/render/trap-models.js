// 環境陷阱的模型（docs/map-devices-design.md 的 C；純函式，不呼叫亂數；品質標準照 docs/model-detail.md）。
// 舊尺度建模（1＝3 m，遊戲裡整個乘 MS）；原點＝效果範圍的中心（地面）。會動的節點放在回傳群組的屬性上：
// wp＝弱點（發光，打壞就觸發）、load＝吊掛的貨櫃、tower＝會倒下的鐵塔（繞底部轉）、hole＝冰面破洞、
// grid＝通電的地板、arcs＝通電時的電光；命名為 glow 的材質依狀態發光（devices.js）。
// 弱點的位置（wp）、控制台的位置（use）、碰撞（solid）在 data/devices.js，模型要對齊它們。
import { P, bakeAll, gSph } from './geometry.js';
import { D } from './detail.js';
import { providedModel } from './model-provider.js';
import { tagStyle } from './style/shader.js';
import { TRAP_BUILDERS2 } from './trap-models2.js';
import {
  HP,
  boltRing,
  boltRow,
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
  piston,
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
  for (const k of ['wp', 'load', 'tower', 'hole', 'grid', 'arcs']) g[k] = glb.getObjectByName(k) || null;
  return true;
};
// 貨櫃（長 L 沿 X）：本體、波浪板、門端的鎖桿、八個角件
function container(n, m, M, L, H, W, x, y, z) {
  bx(n, m, L, H, W, x, y, z, 0, 0, 0, 0.03);
  fine(() => {
    for (let u = -L / 2 + 0.25; u < L / 2 - 0.2; u += 0.22)
      for (const s of [-1, 1])
        bx(n, m, 0.1, H * 0.86, 0.03, x + u, y, z + s * (W / 2 + 0.005), 0, 0, 0, 0.006);
    for (const v of [-0.22, -0.07, 0.07, 0.22])
      rod(
        n,
        M.steel,
        [x + L / 2 + 0.02, y - H * 0.42, z + v * W * 2],
        [x + L / 2 + 0.02, y + H * 0.42, z + v * W * 2],
        0.012,
        5,
      );
  });
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1])
        bx(
          n,
          M.dark,
          0.1,
          0.08,
          0.1,
          x + sx * (L / 2 - 0.04),
          y + sy * (H / 2 - 0.035),
          z + sz * (W / 2 - 0.04),
          0,
          0,
          0,
          0.01,
        );
}

// ---------- 貨運集散場：門型吊架吊著一捆貨櫃（4 個），弱點＝滑輪組（打斷就砸下來） ----------
export function buildTrapCrane(color = 0xffb040) {
  const g = new THREE.Group();
  if (glbOr('device/crane', g)) return g;
  const M = metalSet(0xd0a02a, { roughness: 0.55 });
  M.glass = mStd(0x2a4a5a, { roughness: 0.1, metalness: 0.6 });
  const glow = mGlow(color);
  const lamp = mLamp(0xff8a20, 1.8);
  const b = new THREE.Group();
  g.add(b);
  // 兩側的腳：兩根柱子＋X 型斜撐、底下的行走台車與軌道
  for (const x of [-4.2, 4.2]) {
    for (const z of [-0.55, 0.55]) bx(b, M.body, 0.38, 8.3, 0.38, x, 4.25, z, 0, 0, 0, 0.05);
    for (let y = 1.0; y < 7.8; y += 1.7) {
      rod(b, M.body, [x, y, -0.55], [x, y + 1.7, 0.55], 0.06, 6);
      rod(b, M.body, [x, y, 0.55], [x, y + 1.7, -0.55], 0.06, 6);
      bx(b, M.body, 0.16, 0.16, 1.1, x, y, 0);
    }
    bx(b, M.body, 1.0, 0.5, 1.9, x, 0.45, 0, 0, 0, 0, 0.06);
    hazard(b, M.yel, M.dark, 1.9, 0.18, 0.03, x + 0.51, 0.45, 0, HP);
    hazard(b, M.yel, M.dark, 1.9, 0.18, 0.03, x - 0.51, 0.45, 0, HP);
    for (const z of [-0.6, 0.6]) cx(b, M.dark, 0.22, 0.5, x, 0.22, z, 18, 0.03);
    bx(b, M.dark, 0.3, 0.08, 3.2, x, 0.04, 0, 0, 0, 0, 0.01);
    fine(() => {
      for (const z of [-1.3, -0.65, 0, 0.65, 1.3]) bx(b, M.con, 0.6, 0.06, 0.18, x, 0.02, z, 0, 0, 0, 0.01);
    });
  }
  // 頂上的大樑（兩根箱型樑）＋走道＋欄杆
  for (const z of [-0.45, 0.45]) bx(b, M.body, 9.6, 0.62, 0.32, 0, 8.7, z, 0, 0, 0, 0.05);
  bx(b, M.dark, 9.6, 0.06, 1.5, 0, 9.04, 0, 0, 0, 0, 0.01);
  for (let x = -4.4; x <= 4.4; x += 1.1) bx(b, M.body, 0.14, 0.5, 1.0, x, 8.7, 0);
  fine(() => {
    railing(
      b,
      M.yel,
      [
        [-4.6, 0.72],
        [4.6, 0.72],
      ],
      9.07,
      0.32,
      0.02,
    );
    railing(
      b,
      M.yel,
      [
        [-4.6, -0.72],
        [4.6, -0.72],
      ],
      9.07,
      0.32,
      0.02,
    );
    // 爬梯（−X 的腳）
    for (const z of [-0.18, 0.18]) rod(b, M.steel, [-4.62, 0.9, z], [-4.62, 8.4, z], 0.02, 5);
    for (let y = 1.1; y < 8.4; y += 0.25) rod(b, M.steel, [-4.62, y, -0.18], [-4.62, y, 0.18], 0.012, 4);
  });
  // 吊車（台車）：機殼、捲揚的鼓輪、馬達、車輪
  bx(b, M.body, 1.5, 0.55, 1.4, 0, 9.35, 0, 0, 0, 0, 0.06);
  cx(b, M.dark, 0.32, 1.0, 0, 9.1, 0, 20, 0.03);
  bx(b, M.dark, 0.5, 0.4, 0.5, 0.95, 9.3, 0.3);
  fine(() => {
    fins(b, M.dark, 6, 0.38, 0.3, 0.02, 0.95, 9.3, 0.56, 0, 0.018);
    for (const x of [-0.6, 0.6]) for (const z of [-0.45, 0.45]) cx(b, M.steel, 0.12, 0.08, x, 9.08, z, 12);
  });
  // 操作室（+X 的腳上）
  bx(b, M.body, 1.1, 1.1, 1.1, 5.1, 6.6, 0, 0, 0, 0, 0.08);
  bx(b, M.glass, 0.04, 0.6, 0.9, 5.66, 6.75, 0, 0, 0, 0, 0.01);
  bx(b, M.glass, 0.9, 0.6, 0.04, 5.1, 6.75, 0.56, 0, 0, 0, 0.01);
  bx(b, M.dark, 1.2, 0.1, 1.2, 5.1, 7.2, 0);
  bx(b, M.dark, 0.6, 0.12, 1.1, 4.7, 6.0, 0);
  // 四角的警示燈
  for (const x of [-4.7, 4.7]) for (const z of [-0.6, 0.6]) P(b, gSph(0.09, 10), lamp, x, 9.15, z);
  bakeAll(b, { ...TINT, cache: 'trap_crane' });
  // 弱點：滑輪組（發光）、四條鋼索、吊具（打斷後藏起來）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  bx(w, M.dark, 0.7, 0.55, 0.45, 0, 7.6, 0, 0, 0, 0, 0.05);
  for (const s of [-1, 1]) P(w, D.box(0.6, 0.42, 0.04, 0.01), glow, 0, 7.6, s * 0.24);
  cz(w, M.steel, 0.2, 0.5, 0, 7.6, 0, 16);
  for (const x of [-0.12, 0.12]) rod(w, M.steel, [x, 7.9, 0], [x, 8.85, 0], 0.03, 6);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) rod(w, M.steel, [0, 7.35, 0], [sx * 1.8, 5.25, sz * 0.8], 0.025, 5);
  bx(w, M.yel, 4.0, 0.16, 0.2, 0, 5.15, 0.8);
  bx(w, M.yel, 4.0, 0.16, 0.2, 0, 5.15, -0.8);
  for (const x of [-1.9, 0, 1.9]) bx(w, M.yel, 0.2, 0.16, 1.8, x, 5.15, 0);
  bakeAll(w, { ...TINT, cache: 'trap_crane_wp' });
  // 一捆貨櫃（2×2，每個 4×0.88×0.9）
  const load = node(g, 'load', 3.2);
  const Lg = new THREE.Group();
  load.add(Lg);
  const cols = [0xb8562a, 0x2f5f8a, 0x7a8a3a, 0xa83a3a];
  let i = 0;
  for (const y of [0.45, 1.35])
    for (const z of [-0.46, 0.46])
      container(Lg, mStd(cols[i++ % 4], { metalness: 0.35, roughness: 0.7 }), M, 4, 0.88, 0.9, 0, y, z);
  bakeAll(Lg, { ...TINT, cache: 'trap_crane_load' });
  g.wp = wp;
  g.load = load;
  tagStyle(g);
  return g;
}

// ---------- 礦坑遺跡：撐著岩壁的坑木框架＋炸藥箱（弱點），打壞就坍方 ----------
export function buildTrapMine(color = 0xff6a3a) {
  const g = new THREE.Group();
  if (glbOr('device/mine', g)) return g;
  const M = metalSet(0x4a4038);
  M.wood = mStd(0x6a4a2a, { roughness: 0.9, metalness: 0 });
  M.wood2 = mStd(0x523822, { roughness: 0.9, metalness: 0 });
  M.rock = mStd(0x7a6a58, { roughness: 0.95, metalness: 0 });
  M.red = mStd(0xa82a1e, { roughness: 0.6, metalness: 0.1 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 背後的岩壁（雜訊岩石）
  const R = [
    [-2.3, 1.1, -2.4, 1.5, 1.2, 1.2, 1],
    [0.1, 1.5, -2.7, 1.9, 1.6, 1.3, 2],
    [2.4, 1.0, -2.3, 1.4, 1.1, 1.2, 3],
    [-1.1, 2.8, -2.8, 1.4, 1.0, 1.1, 4],
    [1.4, 2.9, -2.9, 1.3, 0.9, 1.0, 5],
    [0.2, 3.3, -3.1, 1.2, 0.7, 1.0, 6],
    [-3.0, 0.5, -1.6, 0.8, 0.6, 0.7, 7],
    [3.1, 0.4, -1.5, 0.7, 0.5, 0.6, 8],
  ];
  for (const [x, y, z, sx, sy, sz, seed] of R)
    P(b, D.rock(seed + 11, 2, 0.35, 0.5, 0.45), M.rock, x, y, z, 0, seed, 0, sx, sy, sz);
  // 坑木框架：兩根柱子、上面的橫樑、背板（橫木）、楔子、鐵扣件
  for (const x of [-1.8, 1.8]) {
    bx(b, M.wood, 0.34, 3.6, 0.34, x, 1.8, -0.6, 0, 0, 0, 0.04);
    bx(b, M.dark, 0.4, 0.12, 0.4, x, 3.45, -0.6);
    bx(b, M.wood2, 0.5, 0.15, 0.5, x, 0.08, -0.6);
    fine(() => {
      for (const y of [0.8, 2.2]) bx(b, M.dark, 0.38, 0.08, 0.38, x, y, -0.6, 0, 0, 0, 0.01);
      cy(b, M.steel, 0.03, 0.04, x, 3.45, -0.39, 6, 0, undefined, HP, 0, 0);
    });
  }
  bx(b, M.wood, 4.4, 0.36, 0.42, 0, 3.78, -0.6, 0, 0, 0, 0.04);
  for (let k = 0; k < 7; k++) bx(b, M.wood2, 0.22, 0.12, 1.4, -1.5 + k * 0.5, 4.0, -1.1, 0.12, 0, 0, 0.02);
  bx(b, M.wood, 0.26, 3.1, 0.26, -0.7, 1.55, -0.95, 0, 0, 0.28, 0.03);
  for (let k = 0; k < 5; k++) bx(b, M.wood2, 3.4, 0.22, 0.08, 0, 0.6 + k * 0.6, -1.1, 0, 0, 0, 0.02);
  // 吊著的礦燈
  rod(b, M.dark, [0.6, 3.6, -0.5], [0.6, 3.2, -0.5], 0.012, 4);
  cy(b, M.dark, 0.08, 0.14, 0.6, 3.12, -0.5, 10, 0.02, 0.12);
  P(b, gSph(0.07, 10), mLamp(0xffc070, 1.6), 0.6, 3.02, -0.5);
  // 地上的軌道與礦車
  for (const z of [1.05, 1.55]) bx(b, M.steel, 7.0, 0.06, 0.06, 0, 0.1, z, 0, 0, 0, 0.01);
  for (let x = -3.3; x <= 3.3; x += 0.5) bx(b, M.wood2, 0.18, 0.06, 0.8, x, 0.04, 1.3, 0, 0, 0, 0.01);
  lathe(
    b,
    M.body,
    [
      [0, 0.0],
      [0.38, 0.0],
      [0.48, 0.5],
      [0.44, 0.5],
      [0.34, 0.06],
      [0, 0.06],
    ],
    2.6,
    0.32,
    1.3,
    'y',
    4,
    0,
    Math.PI / 4,
    0,
  );
  for (const x of [2.35, 2.85]) for (const z of [1.05, 1.55]) cz(b, M.dark, 0.1, 0.06, x, 0.22, z, 12);
  fine(() => {
    for (let k = 0; k < 4; k++)
      P(
        b,
        D.rock(30 + k, 1, 0.3, 0.3, 0),
        M.rock,
        2.5 + (k % 2) * 0.2,
        0.82,
        1.2 + (k >> 1) * 0.2,
        0,
        k,
        0,
        0.18,
        0.14,
        0.18,
      );
  });
  bakeAll(b, { ...TINT, cache: 'trap_mine' });
  // 弱點：炸藥箱（三個，發光的警示漆）、上面的炸藥束、起爆器與導線
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  for (const [x, z, y, ry] of [
    [-0.5, 0.2, 0.3, 0.1],
    [0.45, 0.25, 0.3, -0.15],
    [0.0, 0.2, 0.85, 0.05],
  ]) {
    bx(w, M.wood, 0.8, 0.56, 0.6, x, y, z, 0, ry, 0, 0.03);
    P(w, D.box(0.82, 0.12, 0.62, 0.01), glow, x, y + 0.04, z, 0, ry, 0);
    fine(() => {
      for (const u of [-0.32, 0.32])
        bx(w, M.wood2, 0.06, 0.58, 0.62, x + u * Math.cos(ry), y, z - u * Math.sin(ry), 0, ry, 0, 0.01);
    });
  }
  for (let k = 0; k < 6; k++)
    cz(w, M.red, 0.06, 0.5, -0.13 + (k % 3) * 0.13, 1.17 + Math.floor(k / 3) * 0.12, 0.2, 10, 0.01);
  cz(w, M.dark, 0.2, 0.06, 0, 1.2, 0.2, 14);
  bx(w, M.dark, 0.3, 0.25, 0.25, 1.1, 0.13, 0.8, 0, 0.3, 0);
  rod(w, M.steel, [1.1, 0.25, 0.8], [1.1, 0.55, 0.8], 0.02, 5);
  bx(w, M.steel, 0.25, 0.04, 0.05, 1.1, 0.56, 0.8);
  fine(() => {
    cable(w, M.red, [0.15, 1.2, 0.45], [1.0, 0.2, 0.75], 0.015, 0.25);
    cable(w, M.dark, [0.05, 1.2, 0.45], [1.05, 0.22, 0.85], 0.015, 0.3);
  });
  bakeAll(w, { ...TINT, cache: 'trap_mine_wp' });
  g.wp = wp;
  tagStyle(g);
  return g;
}

// ---------- 冰原：冰湖的裂縫（地面的發光裂紋）＋冰晶的核心（弱點）；破洞（hole）平常藏起來 ----------
export function buildTrapIce(color = 0x9fe8ff) {
  const g = new THREE.Group();
  if (glbOr('device/ice', g)) return g;
  const ice = mStd(0xcfe6f0, { roughness: 0.2, metalness: 0.1 }),
    ice2 = mStd(0xa8d0e4, { roughness: 0.15, metalness: 0.15 }),
    snow = mStd(0xf0f4f8, { roughness: 0.9, metalness: 0 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 放射狀的裂縫：每條 4 段折線＋分岔
  for (let k = 0; k < 8; k++) {
    const a0 = (k / 8) * Math.PI * 2 + 0.3;
    let x = Math.cos(a0) * 0.6,
      z = Math.sin(a0) * 0.6;
    const L = 3.6 + (k % 3) * 0.6;
    for (let s = 0; s < 4; s++) {
      const a = a0 + Math.sin(k * 3.1 + s * 1.7) * 0.35;
      const l = L / 4;
      const nx = x + Math.cos(a) * l,
        nz = z + Math.sin(a) * l;
      P(b, D.box(l + 0.06, 0.03, 0.08 - s * 0.012, 0.005), glow, (x + nx) / 2, 0.04, (z + nz) / 2, 0, -a, 0);
      if (s === 1 || s === 2) {
        const ba = a + (s === 1 ? 0.7 : -0.6);
        P(
          b,
          D.box(l * 0.6, 0.03, 0.04, 0.005),
          glow,
          nx + Math.cos(ba) * l * 0.3,
          0.04,
          nz + Math.sin(ba) * l * 0.3,
          0,
          -ba,
          0,
        );
      }
      x = nx;
      z = nz;
    }
  }
  // 中央周圍隆起的冰塊與積雪
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.6;
    P(
      b,
      D.rock(40 + k, 1, 0.3, 0.5, 0.2),
      k % 2 ? ice2 : snow,
      Math.cos(a) * 1.3,
      0.05,
      Math.sin(a) * 1.3,
      0,
      a,
      0.2,
      0.55,
      0.22,
      0.4,
    );
  }
  bakeAll(b, { ...TINT, cache: 'trap_ice' });
  // 弱點：冰晶的核心（中央的大晶柱與周圍斜放的小晶柱，裡面發光）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  const xtal = [
    [0, 0],
    [0.4, 0],
    [0.42, 0.9],
    [0.2, 1.3],
    [0, 1.4],
  ];
  lathe(w, ice, xtal, 0, 0, 0, 'y', 6, 0, 0.3, 0);
  lathe(
    w,
    glow,
    [
      [0, 0.1],
      [0.22, 0.1],
      [0.24, 0.9],
      [0, 1.2],
    ],
    0,
    0,
    0,
    'y',
    6,
    0,
    0.8,
    0,
  );
  for (const [x, z, s, rz, rx] of [
    [0.55, 0.2, 0.7, -0.45, 0.1],
    [-0.5, -0.25, 0.6, 0.5, -0.1],
    [0.1, -0.55, 0.55, 0.1, 0.5],
    [-0.2, 0.55, 0.5, -0.2, -0.45],
  ]) {
    P(w, D.lathe(xtal, 6), s > 0.6 ? glow : ice2, x, 0, z, rx, x * 3, rz, s, s, s);
  }
  bakeAll(w, { ...TINT, cache: 'trap_ice_wp' });
  // 破洞：水面＋一圈翹起來的碎冰
  const hole = node(g, 'hole');
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(5, 40),
    new THREE.MeshStandardMaterial({ color: 0x0a2a3a, roughness: 0.08, metalness: 0.3 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.06;
  hole.add(water);
  const hb = new THREE.Group();
  hole.add(hb);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const r = 4.9 + Math.sin(k * 2.3) * 0.25;
    P(
      hb,
      D.rock(60 + k, 1, 0.25, 0.2, 0.1),
      k % 3 ? ice : ice2,
      Math.cos(a) * r,
      0.1,
      Math.sin(a) * r,
      0.25 + Math.sin(k) * 0.15,
      -a,
      0.15,
      0.9,
      0.2,
      0.6,
    );
  }
  for (let k = 0; k < 5; k++) {
    const a = k * 1.3 + 0.4;
    P(
      hb,
      D.rock(80 + k, 1, 0.3, 0.2, 0.1),
      ice2,
      Math.cos(a) * 2.6,
      0.04,
      Math.sin(a) * 2.6,
      0.1,
      a,
      0.05,
      0.5,
      0.1,
      0.4,
    );
  }
  bakeAll(hb, { ...TINT, cache: 'trap_ice_hole' });
  hole.visible = false;
  g.wp = wp;
  g.hole = hole;
  tagStyle(g);
  return g;
}

// ---------- 沙丘：天然氣井的井口（耶誕樹閥組、管線、手輪），弱點＝壓力槽 ----------
function wheel(n, m, r, x, y, z, rx = 0, ry = 0, rz = 0, spokes = 4) {
  P(n, loop(r, r * 0.12, 18), m, x, y, z, rx, ry, rz);
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.set(rx, ry, rz);
  g.updateMatrix();
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2;
    const v = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r).applyMatrix4(g.matrix);
    rod(n, m, [x, y, z], [v.x, v.y, v.z], r * 0.07, 5);
  }
}
export function buildTrapGas(color = 0xff8a30) {
  const g = new THREE.Group();
  if (glbOr('device/gas', g)) return g;
  const M = metalSet(0x8a6a3a, { roughness: 0.55 });
  M.red = mStd(0xb83020, { roughness: 0.5, metalness: 0.4 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  bx(b, M.con, 2.6, 0.3, 2.6, 0, 0.15, 0, 0, 0, 0, 0.06);
  hazard(b, M.yel, M.dark, 2.4, 0.08, 0.03, 0, 0.26, 1.31, 0, 10);
  // 井口：一節節的法蘭、主閥、十字頭、兩側翼閥、頂上的帽
  lathe(
    b,
    M.body,
    [
      [0, 0.3],
      [0.42, 0.3],
      [0.42, 0.42],
      [0.28, 0.45],
      [0.28, 0.85],
      [0.45, 0.88],
      [0.45, 1.0],
      [0.26, 1.03],
      [0.26, 1.55],
      [0.42, 1.58],
      [0.42, 1.7],
      [0.24, 1.73],
      [0.24, 2.3],
      [0.36, 2.33],
      [0.36, 2.45],
      [0.18, 2.5],
      [0, 2.5],
    ],
    0,
    0,
    0,
    'y',
    20,
  );
  fine(() => {
    for (const y of [0.36, 0.94, 1.64, 2.39]) boltRing(b, M.steel, 0.37, y, 10, 0.03);
  });
  for (const y of [1.25, 2.0]) {
    bx(b, M.red, 0.5, 0.36, 0.5, 0, y, 0, 0, 0, 0, 0.04);
    rod(b, M.steel, [0, y, 0.25], [0, y, 0.55], 0.03, 6);
    wheel(b, M.red, 0.26, 0, y, 0.56, HP, 0, 0);
  }
  for (const s of [-1, 1]) {
    cx(b, M.body, 0.15, 0.8, s * 0.6, 2.0, 0, 14, 0.02);
    cx(b, M.body, 0.25, 0.08, s * 0.95, 2.0, 0, 16);
    bx(b, M.red, 0.3, 0.3, 0.3, s * 0.65, 2.0, 0, 0, 0, 0, 0.03);
    rod(b, M.steel, [s * 0.65, 2.15, 0], [s * 0.65, 2.4, 0], 0.025, 5);
    wheel(b, M.red, 0.17, s * 0.65, 2.42, 0, 0, 0, 0);
  }
  // 往 +X 的出油管（彎到地下）與壓力表
  pipe(
    b,
    M.body,
    [
      [1.0, 2.0, 0],
      [1.45, 2.0, 0],
      [1.6, 1.85, 0],
      [1.6, 0.6, 0],
      [1.75, 0.35, 0],
      [2.4, 0.25, 0],
    ],
    0.14,
    10,
  );
  fine(() => {
    rod(b, M.steel, [-0.25, 2.3, 0.2], [-0.25, 2.55, 0.3], 0.02, 5);
    cz(b, M.steel, 0.1, 0.05, -0.25, 2.6, 0.32, 14);
    cz(b, mLamp(0xf0f0e0, 0.4), 0.08, 0.055, -0.25, 2.6, 0.33, 14);
    for (const [x, z] of [
      [1.6, 0.4],
      [1.6, -0.4],
    ])
      bx(b, M.dark, 0.25, 0.4, 0.06, x, 0.5, z);
  });
  bakeAll(b, { ...TINT, cache: 'trap_gas' });
  // 弱點：壓力槽（直立的槽、圓頂的兩端、四支腳、發光的警示帶、安全閥）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  lathe(
    w,
    M.yel,
    [
      [0, 0.25],
      [0.3, 0.27],
      [0.48, 0.36],
      [0.55, 0.5],
      [0.55, 1.4],
      [0.48, 1.54],
      [0.3, 1.63],
      [0, 1.65],
    ],
    -1.3,
    0,
    0.6,
    'y',
    20,
  );
  P(w, D.cyl(0.57, 0.57, 0.18, 20), glow, -1.3, 1.1, 0.6);
  P(w, D.cyl(0.57, 0.57, 0.08, 20), glow, -1.3, 0.75, 0.6);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    rod(
      w,
      M.dark,
      [-1.3 + Math.cos(a) * 0.4, 0.4, 0.6 + Math.sin(a) * 0.4],
      [-1.3 + Math.cos(a) * 0.5, 0.0, 0.6 + Math.sin(a) * 0.5],
      0.05,
      6,
    );
  }
  cy(w, M.red, 0.08, 0.25, -1.3, 1.75, 0.6, 10, 0.02);
  pipe(
    w,
    M.body,
    [
      [-0.8, 0.5, 0.6],
      [-0.45, 0.45, 0.45],
      [-0.3, 0.6, 0.2],
    ],
    0.07,
    8,
  );
  fine(() => {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      cy(w, M.steel, 0.025, 0.04, -1.3 + Math.cos(a) * 0.5, 1.48, 0.6 + Math.sin(a) * 0.5, 6);
    }
  });
  bakeAll(w, { ...TINT, cache: 'trap_gas_wp' });
  g.wp = wp;
  tagStyle(g);
  return g;
}

// ---------- 淹沒城區：電線桿＋柱上變壓器（弱點），斷掉的電纜垂到水裡 ----------
export function buildTrapCable(color = 0x8fd8ff) {
  const g = new THREE.Group();
  if (glbOr('device/cable', g)) return g;
  const M = metalSet(0x5a6068);
  M.pole = mStd(0x8a8478, { roughness: 0.9, metalness: 0.02 });
  M.cer = mStd(0xc8c2b4, { roughness: 0.35, metalness: 0.05 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 漸細的混凝土電線桿、腳釘、橫擔與斜撐、針式絕緣子
  lathe(
    b,
    M.pole,
    [
      [0, 0],
      [0.24, 0],
      [0.22, 3.0],
      [0.16, 7.6],
      [0, 7.7],
    ],
    0,
    0,
    0,
    'y',
    14,
  );
  bx(b, M.body, 2.6, 0.16, 0.18, 0, 7.0, 0, 0, 0, 0, 0.03);
  for (const s of [-1, 1]) rod(b, M.body, [s * 0.8, 6.95, 0], [0, 6.4, 0], 0.03, 5);
  for (const x of [-1.15, -0.5, 0.5, 1.0])
    lathe(
      b,
      M.cer,
      [
        [0, 0],
        [0.05, 0],
        [0.12, 0.06],
        [0.08, 0.12],
        [0.12, 0.18],
        [0.05, 0.26],
        [0, 0.26],
      ],
      x,
      7.08,
      0,
      'y',
      10,
    );
  // 往左的路燈
  pipe(
    b,
    M.body,
    [
      [0, 6.0, 0],
      [-0.6, 6.25, 0],
      [-1.2, 6.25, 0],
    ],
    0.05,
    6,
  );
  bx(b, M.dark, 0.5, 0.12, 0.25, -1.35, 6.2, 0, 0, 0, 0, 0.03);
  P(b, D.box(0.36, 0.02, 0.16, 0.005), mLamp(0xffe0a0, 0.9), -1.35, 6.13, 0);
  // 斷掉垂到水裡的電纜（末端在冒火花：發光）
  pipe(
    b,
    M.dark,
    [
      [1.0, 7.3, 0],
      [1.4, 6.4, 0.3],
      [1.8, 5.0, 0.6],
      [2.2, 3.6, 0.95],
      [2.5, 2.2, 1.3],
      [2.75, 0.9, 1.7],
      [2.85, 0.2, 1.95],
    ],
    0.05,
    6,
  );
  P(b, gSph(0.12, 10), glow, 2.85, 0.2, 1.95);
  // 另一條往遠方的電線（下垂）、拉線、警告牌、腳釘
  cable(b, M.dark, [-1.15, 7.3, 0], [-4.5, 6.6, -0.5], 0.03, 0.5);
  fine(() => {
    rod(b, M.steel, [0, 5.0, -0.1], [0, 0, -2.4], 0.015, 4);
    bx(b, M.con, 0.3, 0.2, 0.3, 0, 0.1, -2.4);
    bx(b, M.yel, 0.4, 0.4, 0.03, 0, 2.6, 0.22, 0, 0, Math.PI / 4, 0.01);
    for (let y = 2.0; y < 6.5; y += 0.35) cx(b, M.steel, 0.02, 0.5, 0, y, 0, 5);
  });
  bakeAll(b, { ...TINT, cache: 'trap_cable' });
  // 弱點：柱上變壓器（筒身、散熱片、頂上兩支套管、支架、發光帶）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  lathe(
    w,
    M.sub,
    [
      [0, 5.05],
      [0.38, 5.08],
      [0.42, 5.15],
      [0.42, 6.05],
      [0.36, 6.15],
      [0, 6.18],
    ],
    0,
    0,
    0.45,
    'y',
    18,
  );
  P(w, D.cyl(0.44, 0.44, 0.12, 18), glow, 0, 5.85, 0.45);
  fine(() => {
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * 0.2 + (k / 5) * Math.PI * 0.6;
      bx(w, M.body, 0.04, 0.7, 0.14, Math.cos(a) * 0.48, 5.55, 0.45 + Math.sin(a) * 0.48, 0, -a, 0, 0.01);
    }
  });
  for (const x of [-0.15, 0.15])
    lathe(
      w,
      M.cer,
      [
        [0, 0],
        [0.04, 0],
        [0.08, 0.05],
        [0.04, 0.1],
        [0.08, 0.15],
        [0.03, 0.22],
        [0, 0.22],
      ],
      x,
      6.16,
      0.45,
      'y',
      10,
    );
  for (const y of [5.3, 5.9]) bx(w, M.dark, 0.2, 0.08, 0.35, 0, y, 0.18, 0, 0, 0, 0.01);
  bakeAll(w, { ...TINT, cache: 'trap_cable_wp' });
  g.wp = wp;
  tagStyle(g);
  return g;
}

// ---------- Lattice-9：單柱懸臂吊著一捆廢料（弱點＝吊鉤） ----------
export function buildTrapScrap(color = 0xffa040) {
  const g = new THREE.Group();
  if (glbOr('device/scrap', g)) return g;
  const M = metalSet(0x6a6258, { roughness: 0.7 });
  M.rust = mStd(0x8a4a2a, { roughness: 0.85, metalness: 0.3 });
  M.rust2 = mStd(0x6a3a26, { roughness: 0.85, metalness: 0.3 });
  M.blue = mStd(0x3a5068, { roughness: 0.7, metalness: 0.35 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // H 型鋼的柱子＋底板＋加勁板
  const H = [
    [-0.4, -0.35],
    [0.4, -0.35],
    [0.4, -0.25],
    [0.06, -0.25],
    [0.06, 0.25],
    [0.4, 0.25],
    [0.4, 0.35],
    [-0.4, 0.35],
    [-0.4, 0.25],
    [-0.06, 0.25],
    [-0.06, -0.25],
    [-0.4, -0.25],
  ];
  P(b, D.extrude(H, 8.8, 0.02), M.body, -4.2, 4.6, 0, HP, 0, 0);
  bx(b, M.dark, 1.8, 0.3, 1.8, -4.2, 0.15, 0, 0, 0, 0, 0.04);
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    bx(b, M.body, 0.06, 0.6, 0.5, -4.2 + Math.sin(a) * 0.45, 0.6, Math.cos(a) * 0.45, 0, a, 0, 0.01);
  }
  fine(() => {
    for (const [x, z] of [
      [-0.75, -0.75],
      [0.75, -0.75],
      [-0.75, 0.75],
      [0.75, 0.75],
    ])
      cy(b, M.steel, 0.06, 0.1, -4.2 + x, 0.32, z, 8);
  });
  // 懸臂（上下弦＋斜材的桁架）、後方的配重、柱頂的斜拉桿
  for (const y of [8.55, 9.15])
    for (const z of [-0.3, 0.3]) bx(b, M.body, 6.2, 0.14, 0.14, -1.6, y, z, 0, 0, 0, 0.02);
  for (let x = -4.6; x < 1.4; x += 0.6)
    for (const z of [-0.3, 0.3]) rod(b, M.sub, [x, 8.55, z], [x + 0.6, 9.15, z], 0.035, 5);
  for (let x = -4.4; x < 1.4; x += 1.2) bx(b, M.sub, 0.08, 0.08, 0.6, x, 8.55, 0, 0, 0, 0, 0.01);
  bx(b, M.con, 1.0, 1.0, 1.0, -5.4, 8.6, 0, 0, 0, 0, 0.06);
  rod(b, M.steel, [-4.2, 9.2, 0], [-4.2, 10.4, 0], 0.08, 8);
  for (const x of [-2.6, 0.4]) rod(b, M.steel, [-4.2, 10.4, 0], [x, 9.15, 0], 0.03, 5);
  rod(b, M.steel, [-4.2, 10.4, 0], [-5.4, 9.1, 0], 0.03, 5);
  // 台車（懸臂下）
  bx(b, M.dark, 0.9, 0.35, 0.8, 0, 8.4, 0, 0, 0, 0, 0.04);
  for (const x of [-0.3, 0.3]) for (const z of [-0.3, 0.3]) cx(b, M.steel, 0.08, 0.06, x, 8.6, z, 10);
  fine(() => {
    for (let y = 0.8; y < 8.4; y += 0.3) bx(b, M.steel, 0.3, 0.025, 0.025, -4.2, y, 0.4, 0, 0, 0, 0.004);
    hazard(b, M.yel, M.dark, 0.9, 0.12, 0.03, -4.2, 1.2, 0.37, 0, 6);
  });
  bakeAll(b, { ...TINT, cache: 'trap_scrap' });
  // 弱點：吊鉤組（發光的滑輪殼、鋼索、鏈條吊索）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  bx(w, M.dark, 0.6, 0.5, 0.42, 0, 8.0, 0, 0, 0, 0, 0.05);
  for (const s of [-1, 1]) P(w, D.box(0.5, 0.4, 0.04, 0.01), glow, 0, 8.0, s * 0.22);
  for (const x of [-0.1, 0.1]) rod(w, M.steel, [x, 8.2, 0], [x, 8.3, 0], 0.03, 5);
  rod(w, M.steel, [0, 7.75, 0], [0, 5.9, 0], 0.035, 6);
  P(
    w,
    D.sweep(
      D.ring(0.18, 14).map(([p, q]) => [p, q, 0]),
      D.ring(0.05, 6),
      true,
    ),
    M.dark,
    0,
    5.75,
    0,
  );
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    rod(w, M.dark, [0, 5.65, 0], [sx * 1.0, 5.15, sz * 0.7], 0.03, 5);
  bakeAll(w, { ...TINT, cache: 'trap_scrap_wp' });
  // 一捆廢料：壓扁的車殼方塊、鋼筋、輪胎、捆起來的鏈條
  const load = node(g, 'load', 3.2);
  const L = new THREE.Group();
  load.add(L);
  const parts = [
    [0, 0.5, 0, 3.2, 1.0, 2.0, 0.08, M.rust],
    [-0.7, 1.3, 0.3, 1.8, 0.7, 1.4, -0.25, M.blue],
    [0.8, 1.25, -0.35, 1.4, 0.8, 1.2, 0.35, M.rust2],
    [0.1, 1.85, 0.0, 1.3, 0.55, 1.0, 0.15, M.rust],
  ];
  for (const [x, y, z, w0, h0, d0, r, m] of parts) {
    bx(L, m, w0, h0, d0, x, y, z, r * 0.3, r, r * 0.4, 0.05);
    fine(() => {
      bx(L, M.dark, w0 * 0.6, h0 * 0.35, 0.03, x, y + h0 * 0.1, z + d0 / 2 + 0.01, r * 0.3, r, r * 0.4, 0.01);
      bx(L, M.dark, 0.03, h0 * 0.5, d0 * 0.5, x + w0 / 2 + 0.01, y, z, r * 0.3, r, r * 0.4, 0.01);
    });
  }
  for (const [a, e] of [
    [
      [-1.4, 0.8, 0.9],
      [-2.0, 1.4, 1.3],
    ],
    [
      [1.2, 1.5, 0.4],
      [1.9, 2.1, 0.7],
    ],
    [
      [0.3, 2.0, -0.4],
      [0.6, 2.6, -0.9],
    ],
    [
      [-0.9, 0.3, -0.9],
      [-1.6, 0.6, -1.5],
    ],
  ])
    rod(L, M.dark, a, e, 0.03, 5);
  P(L, D.tire(0.4, 0.25, 12, 0.03), M.dark, 1.5, 0.45, 0.9, 0, 0.4, 0.2);
  P(L, D.tire(0.35, 0.22, 12, 0.03), M.dark, -1.5, 1.6, -0.5, 0.9, 0, 0.3);
  for (const x of [-0.9, 0.9])
    P(
      L,
      D.sweep(
        [
          [x, -0.02, -1.05],
          [x, 2.25, -1.05],
          [x, 2.25, 1.05],
          [x, -0.02, 1.05],
        ],
        D.ring(0.04, 5),
        true,
      ),
      M.steel,
      0,
      0,
      0,
    );
  bakeAll(L, { ...TINT, cache: 'trap_scrap_load' });
  g.wp = wp;
  g.load = load;
  tagStyle(g);
  return g;
}

// ---------- 地下研究特區：深脈收容槽（玻璃筒裡紅色的深脈，弱點＝筒身） ----------
export function buildTrapCoral(color = 0xff4a5a) {
  const g = new THREE.Group();
  if (glbOr('device/coral', g)) return g;
  const M = metalSet(0x5a6068);
  M.white = mStd(0xd8dce0, { roughness: 0.45, metalness: 0.25 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 底座（剖面旋轉：台階與發光的接縫）＋頂蓋（管線的接頭）＋四根框柱
  lathe(
    b,
    M.white,
    [
      [0, 0],
      [1.45, 0],
      [1.45, 0.25],
      [1.3, 0.35],
      [1.3, 0.55],
      [1.15, 0.62],
      [0, 0.62],
    ],
    0,
    0,
    0,
    'y',
    32,
  );
  P(b, D.cyl(1.32, 1.32, 0.05, 32), glow, 0, 0.3, 0);
  lathe(
    b,
    M.white,
    [
      [0, 3.15],
      [1.2, 3.15],
      [1.25, 3.3],
      [1.1, 3.55],
      [0.6, 3.7],
      [0.5, 3.85],
      [0, 3.85],
    ],
    0,
    0,
    0,
    'y',
    32,
  );
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    bx(b, M.body, 0.2, 2.7, 0.2, Math.cos(a) * 1.15, 1.9, Math.sin(a) * 1.15, 0, -a, 0, 0.03);
    fine(() => {
      for (const y of [1.0, 2.0, 2.8])
        bx(b, M.dark, 0.26, 0.08, 0.26, Math.cos(a) * 1.15, y, Math.sin(a) * 1.15, 0, -a, 0, 0.01);
    });
  }
  // 頂蓋的管線、側面的監控箱、往外的導管
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    pipe(
      b,
      M.dark,
      [
        [Math.cos(a) * 0.4, 3.85, Math.sin(a) * 0.4],
        [Math.cos(a) * 0.45, 4.1, Math.sin(a) * 0.45],
        [Math.cos(a) * 0.9, 4.1, Math.sin(a) * 0.9],
        [Math.cos(a) * 1.0, 3.6, Math.sin(a) * 1.0],
      ],
      0.06,
      8,
    );
  }
  bx(b, M.body, 0.5, 0.9, 0.5, 1.75, 0.75, 0, 0, 0, 0, 0.05);
  P(b, D.box(0.02, 0.3, 0.36, 0.005), glow, 2.01, 0.95, 0);
  pipe(
    b,
    M.dark,
    [
      [1.5, 0.45, 0.15],
      [2.3, 0.45, 0.15],
      [2.6, 0.2, 0.15],
      [3.1, 0.15, 0.15],
    ],
    0.16,
    10,
  );
  fine(() => {
    boltRing(b, M.steel, 1.38, 0.58, 16, 0.03);
    vents(b, M.dark, M.sub, 0.3, 0.3, 2.01, 0.55, 0, HP, 4);
    hazard(b, M.yel, M.dark, 1.2, 0.1, 0.03, 0, 0.45, 1.36, 0, 6);
  });
  bakeAll(b, { ...TINT, cache: 'trap_coral' });
  // 弱點：玻璃筒（半透明）＋裡面發光的深脈（分枝的團塊）與筒內的支架
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  const blobs = [
    [0, 1.0, 0, 0.55, 0.6, 0.5, 1],
    [0.25, 1.65, 0.1, 0.4, 0.5, 0.35, 2],
    [-0.3, 1.8, -0.15, 0.35, 0.55, 0.3, 3],
    [0.05, 2.35, -0.05, 0.3, 0.45, 0.28, 4],
    [-0.15, 2.85, 0.15, 0.22, 0.3, 0.2, 5],
    [0.35, 2.55, 0.25, 0.18, 0.28, 0.16, 6],
  ];
  for (const [x, y, z, sx, sy, sz, s] of blobs)
    P(w, D.rock(100 + s, 2, 0.5, 0.2, 0), glow, x, y, z, s, s * 2, 0, sx, sy, sz);
  for (const [a, e] of [
    [
      [0, 1.3, 0],
      [0.55, 2.0, 0.3],
    ],
    [
      [0, 1.4, 0],
      [-0.6, 2.2, -0.2],
    ],
    [
      [0, 2.0, 0],
      [0.15, 3.0, -0.4],
    ],
  ])
    rod(w, glow, a, e, 0.06, 6);
  cy(w, M.dark, 0.6, 0.12, 0, 0.68, 0, 20, 0.02);
  bakeAll(w, { ...TINT, cache: 'trap_coral_wp' });
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.05, 2.55, 32, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xa8d8ff,
      transparent: true,
      opacity: 0.22,
      roughness: 0.05,
      metalness: 0.2,
    }),
  );
  glass.position.y = 1.88;
  wp.add(glass);
  g.wp = wp;
  tagStyle(g);
  return g;
}

export const TRAP_BUILDERS = {
  crane: buildTrapCrane,
  mine: buildTrapMine,
  ice: buildTrapIce,
  gas: buildTrapGas,
  cable: buildTrapCable,
  scrap: buildTrapScrap,
  coral: buildTrapCoral,
  ...TRAP_BUILDERS2, // 第二版的新陷阱（trap-models2.js）
};
