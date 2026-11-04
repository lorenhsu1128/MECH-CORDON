// 大型地形事件的模型（docs/map-devices-design.md 的 F；純函式，不呼叫亂數；品質標準照 docs/model-detail.md）。
// 舊尺度（遊戲裡乘 MS），原點＝事件的中心（地面）。會動的節點：tower＝倒下（繞原點的 X 轉向 +Z）、
// sink＝沉下去、slide＝往 +Z 滑下、hole＝觸發後出現（流沙、水）；wp＝弱點；命名為 glow 的材質依狀態發光。
// 碰撞（solid）、弱點（wp）、控制台（use）的位置在 data/devices.js，模型要對齊它們。
import { P, bakeAll, gSph } from './geometry.js';
import { D } from './detail.js';
import { providedModel } from './model-provider.js';
import { tagStyle } from './style/shader.js';
import {
  HP,
  boltRing,
  boltRow,
  bx,
  cable,
  consoleAt,
  cx,
  cy,
  cz,
  fine,
  fins,
  handle,
  hazard,
  lathe,
  loop,
  mGlow,
  mLamp,
  mStd,
  metalSet,
  pipe,
  piston,
  railing,
  rod,
  vents,
} from './dev-kit.js';

const TINT = { tint: { ao: 0.85, grime: 0.4, gh: 0.7 } };
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
  for (const k of ['wp', 'tower', 'sink', 'slide', 'hole']) g[k] = glb.getObjectByName(k) || null;
  return true;
};
// 弱點：綁在結構上的爆破炸藥（三支炸藥筒＋固定帶、起爆器的螢幕與閃燈、導線），放在 (x, y, z)，正面朝 +Z（ry 轉向）
const wpNode = (g, color, x, y, z, s = 1, cache = 'ev_wp', ry = 0) => {
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  w.position.set(x, y, z);
  w.rotation.y = ry;
  w.scale.setScalar(s);
  wp.add(w);
  const red = mStd(0xa82a1e, { roughness: 0.55, metalness: 0.15 }),
    dark = mStd(0x24282d, { metalness: 0.6 }),
    tape = mStd(0x3a3a34, { roughness: 0.9, metalness: 0 }),
    glow = mGlow(color, 1.5);
  for (let k = 0; k < 3; k++) cy(w, red, 0.17, 1.0, -0.36 + k * 0.36, 0, 0, 14, 0.04);
  for (const yy of [-0.3, 0.3]) bx(w, tape, 1.15, 0.1, 0.42, 0, yy, 0, 0, 0, 0, 0.02);
  bx(w, dark, 0.5, 0.36, 0.14, 0, 0.05, 0.24, 0, 0, 0, 0.03);
  P(w, D.box(0.36, 0.2, 0.02, 0.005), glow, 0, 0.08, 0.32);
  P(w, D.box(1.18, 0.12, 0.44, 0.01), glow, 0, -0.1, 0);
  P(w, gSph(0.06, 10), mLamp(0xff2010, 2), 0.18, 0.28, 0.3);
  fine(() => {
    cable(w, red, [-0.2, -0.1, 0.3], [-0.6, -0.5, 0.25], 0.02, 0.1);
    cable(w, dark, [0.2, -0.1, 0.3], [0.6, -0.5, 0.25], 0.02, 0.12);
    rod(w, dark, [-0.2, 0.25, 0.3], [-0.25, 0.55, 0.3], 0.012, 4);
  });
  bakeAll(w, { ...TINT, cache });
  g.wp = wp;
};
// 地上的水面／流沙（hole）
const flat = (hole, geo, mat, y) => {
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  hole.add(m);
  return m;
};

// ---------- 貨運集散場：大型龍門吊（高 12、跨 14），弱點＝一隻腳的底座，往 +Z 倒下 ----------
export function buildEvGantry(color = 0xffb040) {
  const g = new THREE.Group();
  if (glbOr('device/gantry', g)) return g;
  const M = metalSet(0xd0a020, { roughness: 0.55 });
  M.glass = mStd(0x2a4a5a, { roughness: 0.1, metalness: 0.6 });
  const lamp = mLamp(0xff3020, 1.8);
  const tower = node(g, 'tower');
  const t = new THREE.Group();
  tower.add(t);
  // 兩隻腳：前後兩根柱子（往上收）＋斜撐＋橫樑
  for (const x of [-7, 7]) {
    for (const z of [-0.9, 0.9]) rod(t, M.body, [x, 0.5, z * 1.2], [x, 11.9, z * 0.6], 0.32, 8);
    for (let y = 1.5; y < 11; y += 2.4) {
      const k0 = 1.2 - (y / 11.4) * 0.6,
        k1 = 1.2 - ((y + 2.4) / 11.4) * 0.6;
      rod(t, M.body, [x, y, -0.9 * k0], [x, Math.min(11.5, y + 2.4), 0.9 * k1], 0.1, 6);
      rod(t, M.body, [x, y, 0.9 * k0], [x, y, -0.9 * k0], 0.12, 6);
    }
    bx(t, M.body, 1.2, 0.5, 2.4, x, 0.6, 0, 0, 0, 0, 0.08);
  }
  // 頂上的箱型大樑（腹板、加勁材）、走道、欄杆
  bx(t, M.body, 16.4, 1.1, 1.7, 0, 12.4, 0, 0, 0, 0, 0.1);
  for (let x = -7.5; x <= 7.5; x += 1.0) bx(t, M.sub, 0.1, 0.9, 1.76, x, 12.4, 0, 0, 0, 0, 0.01);
  bx(t, M.dark, 16.4, 0.08, 2.4, 0, 13.0, 0, 0, 0, 0, 0.02);
  fine(() => {
    for (const z of [-1.15, 1.15])
      railing(
        t,
        M.yel,
        [
          [-8.1, z],
          [8.1, z],
        ],
        13.04,
        0.4,
        0.03,
      );
    for (const z of [-0.2, 0.2])
      rod(t, M.steel, [-7.0 + z * 0.1, 1.0, 1.25], [-7.0 + z * 0.1, 11.8, 0.75], 0.02, 4);
  });
  // 台車（機房）、捲揚鼓輪、吊具與鋼索
  bx(t, M.body, 2.6, 1.3, 2.2, -2, 11.3, 0, 0, 0, 0, 0.08);
  bx(t, M.dark, 2.7, 0.1, 2.3, -2, 11.95, 0);
  cx(t, M.dark, 0.4, 1.8, -2, 10.6, 0, 20, 0.04);
  fine(() => {
    vents(t, M.dark, M.sub, 0.8, 0.5, -2, 11.3, 1.11, 0, 5);
    fins(t, M.dark, 8, 1.2, 0.6, 0.03, -2, 11.3, -1.13, 0, 0.025);
  });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      rod(t, M.steel, [-2 + sx * 0.4, 10.3, sz * 0.3], [-2 + sx * 1.6, 7.4, sz * 0.9], 0.04, 5);
  bx(t, M.yel, 3.6, 0.3, 2.0, -2, 7.25, 0, 0, 0, 0, 0.04);
  // 操作室（+X 的腳上）＋警示燈
  bx(t, M.body, 1.6, 1.5, 1.6, 8.2, 9.6, 0, 0, 0, 0, 0.1);
  bx(t, M.glass, 0.05, 0.8, 1.3, 9.02, 9.8, 0, 0, 0, 0, 0.01);
  bx(t, M.glass, 1.3, 0.8, 0.05, 8.2, 9.8, 0.82, 0, 0, 0, 0.01);
  bx(t, M.dark, 1.7, 0.12, 1.7, 8.2, 10.4, 0);
  for (const x of [-8, 8]) P(t, gSph(0.15, 10), lamp, x, 13.3, 0);
  bakeAll(t, { ...TINT, cache: 'ev_gantry' });
  // 不倒的部分：行走台車（車輪）、軌道、緩衝器
  const b = new THREE.Group();
  g.add(b);
  for (const x of [-7, 7]) {
    bx(b, M.dark, 2.0, 0.55, 2.8, x, 0.3, 0, 0, 0, 0, 0.06);
    hazard(b, M.yel, M.dark, 2.6, 0.2, 0.04, x - 1.02, 0.3, 0, HP, 8);
    for (const z of [-0.9, 0.9]) cx(b, M.steel, 0.3, 0.4, x, 0.3, z, 20, 0.03);
    bx(b, M.steel, 0.3, 0.12, 6, x, 0.06, 0, 0, 0, 0, 0.02);
    for (const z of [-2.6, 2.6]) bx(b, M.yel, 0.6, 0.6, 0.3, x, 0.35, z, 0, 0, 0, 0.05);
  }
  bakeAll(b, { ...TINT, cache: 'ev_gantry_base' });
  wpNode(g, color, 7, 1.2, -1.45, 1.4, 'ev_wp_g', Math.PI);
  g.tower = tower;
  tagStyle(g);
  return g;
}

// ---------- 模擬訓練場：場地重組的控制台＋三面會沉下去的模擬牆（sink） ----------
export function buildEvReshape(color = 0x7fc8ff) {
  const g = new THREE.Group();
  if (glbOr('device/reshape', g)) return g;
  const M = metalSet(0x3a4450);
  M.wall = mStd(0xd8dde2, { roughness: 0.5, metalness: 0.1 });
  const glow = mGlow(color);
  const sink = node(g, 'sink');
  const s = new THREE.Group();
  sink.add(s);
  for (const [x, z, w, d] of [
    [0, 6, 10, 1],
    [-6, 0, 1, 8],
    [6, -2, 1, 6],
  ]) {
    const along = w > d;
    const L = along ? w : d;
    bx(s, M.wall, w, 4, d, x, 2, z, 0, 0, 0, 0.1);
    // 牆面的面板分割、上緣與下緣的發光條、底座、側面的支撐
    const n = Math.round(L / 2);
    for (let i = 0; i < n; i++) {
      const u = -L / 2 + (L / n) * (i + 0.5);
      const px = along ? x + u : x,
        pz = along ? z : z + u;
      for (const side of [-1, 1]) {
        const ox = along ? 0 : side * (w / 2 + 0.01),
          oz = along ? side * (d / 2 + 0.01) : 0;
        bx(
          s,
          M.sub,
          along ? L / n - 0.12 : 0.04,
          3.0,
          along ? 0.04 : L / n - 0.12,
          px + ox,
          2.1,
          pz + oz,
          0,
          0,
          0,
          0.01,
        );
      }
    }
    P(
      s,
      D.box(along ? w * 0.95 : w + 0.06, 0.1, along ? d + 0.06 : d * 0.95, 0.01),
      glow,
      x,
      3.8,
      z,
      0,
      0,
      0,
    );
    P(
      s,
      D.box(along ? w * 0.95 : w + 0.06, 0.06, along ? d + 0.06 : d * 0.95, 0.01),
      glow,
      x,
      0.5,
      z,
      0,
      0,
      0,
    );
    bx(s, M.dark, along ? w + 0.2 : w + 0.5, 0.3, along ? d + 0.5 : d + 0.2, x, 0.15, z, 0, 0, 0, 0.04);
  }
  bakeAll(s, { ...TINT, cache: 'ev_reshape' });
  const b = new THREE.Group();
  g.add(b);
  consoleAt(b, M, glow, 0, -4, -HP);
  // 地上的升降口（牆沉下去的地方）
  for (const [x, z, w, d] of [
    [0, 6, 10.4, 1.4],
    [-6, 0, 1.4, 8.4],
    [6, -2, 1.4, 6.4],
  ])
    hazard(
      b,
      M.yel,
      M.dark,
      w > d ? w : d,
      0.03,
      0.2,
      x + (w > d ? 0 : -w / 2),
      0.02,
      z + (w > d ? -d / 2 : 0),
      w > d ? 0 : HP,
      Math.round((w > d ? w : d) / 0.6),
    );
  bakeAll(b, { ...TINT, cache: 'ev_reshape_c' });
  g.sink = sink;
  g.wp = null;
  tagStyle(g);
  return g;
}

// ---------- 礦坑遺跡：封住坑道的岩石堵塞（sink：炸開後沉下去），弱點＝埋在岩石裡的炸藥 ----------
export function buildEvTunnel(color = 0xff6a3a) {
  const g = new THREE.Group();
  if (glbOr('device/tunnel', g)) return g;
  const M = metalSet(0x4a4038);
  M.wood = mStd(0x5a3e24, { roughness: 0.9, metalness: 0 });
  M.wood2 = mStd(0x6e4e2e, { roughness: 0.9, metalness: 0 });
  M.rock = mStd(0x7a6a58, { roughness: 0.95, metalness: 0 });
  M.rock2 = mStd(0x665848, { roughness: 0.95, metalness: 0 });
  const b = new THREE.Group();
  g.add(b);
  // 坑口的坑木框（柱、橫樑、背板）、兩側的岩壁、軌道、礦燈、警告牌
  for (const x of [-5.5, 5.5]) {
    bx(b, M.wood, 1.1, 6, 1.1, x, 3, 0, 0, 0, 0, 0.08);
    for (const y of [1.5, 4.5]) bx(b, M.dark, 1.16, 0.14, 1.16, x, y, 0, 0, 0, 0, 0.02);
  }
  bx(b, M.wood, 12.6, 1.0, 1.3, 0, 6.3, 0, 0, 0, 0, 0.1);
  for (let k = 0; k < 10; k++) bx(b, M.wood2, 0.5, 0.25, 2.2, -5.4 + k * 1.2, 6.9, -0.4, 0.1, 0, 0, 0.04);
  for (const [x, y, z, sx, sy, sz, sd] of [
    [-8.2, 2.5, -0.5, 2.4, 3.0, 2.2, 1],
    [8.2, 2.3, -0.4, 2.3, 2.8, 2.2, 2],
    [-7.0, 6.2, -1.0, 2.6, 2.0, 2.0, 3],
    [7.2, 6.4, -1.0, 2.6, 2.2, 2.0, 4],
    [0, 8.2, -1.5, 6.5, 1.8, 2.4, 5],
  ])
    P(b, D.rock(20 + sd, 2, 0.35, 0.4, 0.4), M.rock2, x, y, z, 0, sd, 0, sx, sy, sz);
  for (const x of [-1.0, 1.0]) bx(b, M.steel, 0.15, 0.12, 9, x, 0.06, 3.5, 0, 0, 0, 0.02);
  fine(() => {
    for (let z = -0.5; z < 8; z += 0.8) bx(b, M.wood2, 2.8, 0.1, 0.3, 0, 0.03, z, 0, 0, 0, 0.02);
    rod(b, M.dark, [2.5, 5.8, 0.7], [2.5, 5.2, 0.7], 0.02, 4);
    P(b, gSph(0.12, 10), mLamp(0xffc070, 1.6), 2.5, 5.1, 0.7);
    bx(b, M.yel, 1.2, 0.8, 0.05, -5.5, 3.6, 0.58, 0, 0, 0, 0.02);
    bx(b, mStd(0xb02020), 0.9, 0.12, 0.06, -5.5, 3.75, 0.6, 0, 0, 0, 0.01);
  });
  bakeAll(b, { ...TINT, cache: 'ev_tunnel' });
  const sink = node(g, 'sink');
  const s = new THREE.Group();
  sink.add(s);
  const R = [
    [-3, 1.5, 0, 2.4, 1.8, 1.6, 1],
    [0, 2.0, 0.3, 2.8, 2.2, 1.7, 2],
    [3, 1.6, -0.2, 2.3, 1.8, 1.6, 3],
    [-1.6, 4.1, 0, 1.9, 1.5, 1.4, 4],
    [1.8, 4.2, 0.2, 1.8, 1.4, 1.4, 5],
    [0.1, 5.4, -0.2, 1.6, 0.9, 1.2, 6],
    [-4.2, 0.6, 1.1, 1.0, 0.7, 0.9, 7],
    [4.0, 0.5, 1.2, 0.9, 0.6, 0.8, 8],
    [1.4, 0.4, 1.8, 0.7, 0.5, 0.6, 9],
  ];
  for (const [x, y, z, sx, sy, sz, sd] of R)
    P(s, D.rock(40 + sd, 2, 0.4, 0.4, 0.3), sd % 3 ? M.rock : M.rock2, x, y, z, 0, sd * 1.3, 0, sx, sy, sz);
  for (const [a, e] of [
    [
      [-3.5, 3.5, 0.8],
      [-1.0, 5.4, 1.0],
    ],
    [
      [2.0, 1.0, 1.4],
      [3.8, 3.4, 0.8],
    ],
  ])
    rod(s, M.wood2, a, e, 0.18, 6);
  bakeAll(s, { ...TINT, cache: 'ev_tunnel_rock' });
  wpNode(g, color, 0.5, 1.4, 2.0, 1.4, 'ev_wp_t');
  g.sink = sink;
  tagStyle(g);
  return g;
}

// ---------- 冰原：冰崖（slide：崩落時往 +Z 滑下），弱點＝冰崖底部的裂縫核心 ----------
export function buildEvAvalanche(color = 0x9fe8ff) {
  const g = new THREE.Group();
  if (glbOr('device/avalanche', g)) return g;
  const ice = mStd(0xd8eef6, { roughness: 0.25, metalness: 0.05 }),
    ice2 = mStd(0xa8cfe0, { roughness: 0.2, metalness: 0.1 }),
    snow = mStd(0xf2f6f8, { roughness: 0.9, metalness: 0 }),
    rock = mStd(0x5a5e64, { roughness: 0.95, metalness: 0 });
  const glow = mGlow(color);
  const slide = node(g, 'slide');
  const s = new THREE.Group();
  slide.add(s);
  // 冰崖本體：一排大冰塊（層理）＋上面的積雪（雪簷）＋夾在裡面的岩石＋前緣的冰柱
  for (let k = 0; k < 6; k++) {
    const x = -6 + k * 2.4;
    P(s, D.rock(60 + k, 2, 0.25, 0.4, 0.55), k % 2 ? ice : ice2, x, 3.0, -2.6, 0, k * 0.7, 0, 1.6, 3.4, 2.6);
  }
  for (let k = 0; k < 5; k++)
    P(
      s,
      D.rock(70 + k, 2, 0.3, 0.5, 0.2),
      snow,
      -5.2 + k * 2.6,
      6.6,
      -2.4 + (k % 2) * 0.4,
      0.15,
      k,
      0,
      1.9,
      1.0,
      2.4,
    );
  for (const [x, y, z, sc, sd] of [
    [-4.5, 1.2, -0.6, 0.9, 1],
    [3.8, 2.4, -0.4, 0.8, 2],
    [0.6, 4.6, -0.3, 0.7, 3],
  ])
    P(s, D.rock(80 + sd, 1, 0.35, 0.3, 0.3), rock, x, y, z, 0, sd, 0, sc, sc * 0.8, sc);
  for (let k = 0; k < 9; k++) {
    const x = -5.6 + k * 1.4,
      L = 0.8 + ((k * 7) % 5) * 0.25;
    lathe(
      s,
      ice2,
      [
        [0, 0],
        [0.12, L * 0.4],
        [0.22, L],
        [0, L],
      ],
      x,
      6.0 - L,
      -0.2 + (k % 3) * 0.1,
      'y',
      6,
    );
  }
  // 冰崖腳的裂縫（發光）
  for (let k = 0; k < 5; k++) {
    const a = -0.6 + k * 0.3;
    P(
      s,
      D.box(0.08, 2.0 - Math.abs(k - 2) * 0.4, 0.06, 0.01),
      glow,
      Math.sin(a) * 1.4,
      1.2,
      0.15,
      0,
      0,
      a * 0.8,
    );
  }
  bakeAll(s, { ...TINT, cache: 'ev_aval' });
  // 弱點：卡在冰崖腳的冰晶核心（發光、周圍的碎冰）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  const xt = [
    [0, 0],
    [0.45, 0],
    [0.5, 1.0],
    [0.24, 1.5],
    [0, 1.6],
  ];
  P(w, D.lathe(xt, 6), ice, 0, 0.4, 0.4, 0.3, 0, 0.1, 1, 1, 1);
  P(w, D.lathe(xt, 6), glow, 0, 0.6, 0.6, 0.35, 0.4, 0.05, 0.55, 0.7, 0.55);
  for (const [x, rz, sc] of [
    [-0.8, 0.6, 0.6],
    [0.8, -0.55, 0.65],
    [0.3, -0.2, 0.45],
  ])
    P(w, D.lathe(xt, 6), sc > 0.5 ? ice2 : glow, x, 0.1, 0.5, 0.4, x, rz, sc, sc, sc);
  bakeAll(w, { ...TINT, cache: 'ev_aval_wp' });
  g.wp = wp;
  g.slide = slide;
  tagStyle(g);
  return g;
}

// ---------- 荒野：大煙囪（高 16），弱點＝底部的爆破炸藥，往 +Z 倒下 ----------
export function buildEvChimney(color = 0xff8a40) {
  const g = new THREE.Group();
  if (glbOr('device/chimney', g)) return g;
  const M = metalSet(0x4a4038);
  M.brick = mStd(0x8a5a44, { roughness: 0.9, metalness: 0 });
  M.brick2 = mStd(0x6e4434, { roughness: 0.9, metalness: 0 });
  M.soot = mStd(0x2a2422, { roughness: 0.95, metalness: 0 });
  const lamp = mLamp(0xff3020, 1.8);
  const tower = node(g, 'tower');
  const t = new THREE.Group();
  tower.add(t);
  // 漸細的磚造筒身（剖面旋轉）＋頂上的冠帶（燻黑）＋每隔一段的鋼箍
  lathe(
    t,
    M.brick,
    [
      [0, 1.2],
      [1.72, 1.2],
      [1.25, 15.2],
      [1.42, 15.4],
      [1.42, 16.1],
      [1.1, 16.1],
      [1.05, 15.6],
      [0, 15.6],
    ],
    0,
    0,
    0,
    'y',
    20,
  );
  lathe(
    t,
    M.soot,
    [
      [1.29, 14.4],
      [1.33, 14.4],
      [1.45, 15.4],
      [1.45, 16.12],
      [1.4, 16.12],
      [1.29, 14.4],
    ],
    0,
    0,
    0,
    'y',
    20,
  );
  for (const y of [3.5, 6.5, 9.5, 12.5]) {
    const r = 1.72 - ((y - 1.2) / 14) * 0.47 + 0.03;
    P(t, loop(r, 0.06, 24), M.dark, 0, y, 0);
  }
  fine(() => {
    // 磚的層（細的環）、爬梯、避雷針、航空警示燈
    for (let y = 2.0; y < 14.5; y += 0.75) {
      const r = 1.72 - ((y - 1.2) / 14) * 0.47 + 0.01;
      if (Math.round(y / 0.75) % 4) P(t, loop(r, 0.02, 20), M.brick2, 0, y, 0);
    }
    for (let y = 1.6; y < 15.4; y += 0.45) {
      const r = 1.72 - ((y - 1.2) / 14) * 0.47 + 0.18;
      rod(t, M.steel, [-0.25, y, -r], [0.25, y, -r], 0.025, 4);
    }
    for (const x of [-0.25, 0.25]) rod(t, M.steel, [x, 1.6, -1.9], [x, 15.4, -1.42], 0.03, 4);
    rod(t, M.steel, [0.9, 16.1, 0], [0.9, 17.4, 0], 0.03, 4);
    for (const a of [0, 2.1, 4.2]) P(t, gSph(0.12, 8), lamp, Math.cos(a) * 1.45, 15.9, Math.sin(a) * 1.45);
  });
  bakeAll(t, { ...TINT, cache: 'ev_chimney' });
  // 不倒的基座：混凝土台座、煙道的入口（管道）、小門
  const b = new THREE.Group();
  g.add(b);
  bx(b, M.con, 4.2, 1.2, 4.2, 0, 0.6, 0, 0, 0, 0, 0.12);
  bx(b, M.con, 3.8, 0.2, 3.8, 0, 1.3, 0, 0, 0, 0, 0.04);
  bx(b, M.body, 2.4, 1.6, 1.6, -3.2, 0.8, 0, 0, 0, 0, 0.08);
  cx(b, M.body, 0.55, 1.2, -4.6, 1.2, 0, 16, 0.04);
  bx(b, M.dark, 0.9, 1.0, 0.08, 1.2, 0.55, -2.11, 0, 0, 0, 0.02);
  fine(() => {
    handle(b, M.steel, 0.2, 1.55, 0.6, -2.14, Math.PI, 0.05);
    hazard(b, M.yel, M.dark, 4.0, 0.12, 0.04, 0, 1.1, 2.11, 0, 14);
    boltRow(b, M.steel, -1.6, 1.6, 1.2, 1.9, 6);
  });
  bakeAll(b, { ...TINT, cache: 'ev_chimney_b' });
  wpNode(g, color, 0, 1.75, 2.05, 1.2, 'ev_wp_c');
  g.tower = tower;
  tagStyle(g);
  return g;
}

// ---------- 沙丘：抽沙機（三腳井架、泵浦管、排沙管），打壞後地面塌陷成流沙；弱點＝馬達 ----------
export function buildEvSinkhole(color = 0xffb060) {
  const g = new THREE.Group();
  if (glbOr('device/sinkhole', g)) return g;
  const M = metalSet(0x8a7048, { roughness: 0.6 });
  M.sand = mStd(0xc8a870, { roughness: 1, metalness: 0 });
  const b = new THREE.Group();
  g.add(b);
  // 底座的鋼架＋沙包
  bx(b, M.dark, 3.2, 0.45, 3.2, 0, 0.22, 0, 0, 0, 0, 0.06);
  hazard(b, M.yel, M.dark, 3.0, 0.12, 0.03, 0, 0.36, 1.61, 0, 10);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    P(
      b,
      D.rock(90 + k, 1, 0.15, 0.4, 0),
      M.sand,
      Math.cos(a) * 2.1,
      0.2,
      Math.sin(a) * 2.1,
      0,
      a,
      0,
      0.5,
      0.25,
      0.32,
    );
  }
  // 三腳井架（主腳＋橫桿）＋頂上的天車
  const legs = [
    [-1.3, -1.1],
    [1.3, -1.1],
    [0, 1.4],
  ];
  for (const [x, z] of legs) rod(b, M.body, [x, 0.4, z], [0, 6.6, 0], 0.13, 8);
  for (const y of [2.2, 4.2]) {
    const k = 1 - (y - 0.4) / 6.2;
    for (let i = 0; i < 3; i++) {
      const p = legs[i],
        q = legs[(i + 1) % 3];
      rod(b, M.body, [p[0] * k, y, p[1] * k], [q[0] * k, y, q[1] * k], 0.05, 6);
    }
  }
  bx(b, M.dark, 0.7, 0.5, 0.7, 0, 6.75, 0, 0, 0, 0, 0.05);
  cz(b, M.steel, 0.3, 0.12, 0, 6.75, 0.4, 16);
  // 泵浦管（直立、法蘭）＋排沙的軟管（往外彎到地上）
  cy(b, M.steel, 0.25, 6.3, 0, 3.4, 0, 14);
  for (const y of [0.8, 2.6, 4.4, 6.0]) cy(b, M.body, 0.36, 0.14, 0, y, 0, 16, 0.02);
  pipe(
    b,
    M.dark,
    [
      [0, 5.6, 0.3],
      [-0.6, 5.7, 1.2],
      [-1.8, 4.6, 2.6],
      [-2.8, 2.0, 3.6],
      [-3.4, 0.3, 4.4],
      [-4.6, 0.15, 5.0],
    ],
    0.22,
    10,
  );
  fine(() => {
    boltRing(b, M.steel, 0.3, 0.8, 8, 0.03);
    cable(b, M.steel, [0, 6.8, 0.2], [0.4, 1.0, 0.6], 0.025, 0.05);
  });
  bakeAll(b, { ...TINT, cache: 'ev_sinkhole' });
  // 弱點：馬達（機殼、散熱片、飛輪、發光的過熱警示）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  const glow = mGlow(color, 1.4);
  bx(w, M.yel, 1.1, 0.9, 0.9, 1.4, 0.75, 0.4, 0, 0, 0, 0.08);
  fins(w, M.dark, 7, 0.8, 0.6, 0.2, 1.4, 0.8, 0.9, 0, 0.03);
  cx(w, M.dark, 0.38, 0.15, 2.05, 0.8, 0.4, 20, 0.02);
  cx(w, M.steel, 0.12, 0.3, 2.0, 0.8, 0.4, 12);
  P(w, D.box(1.12, 0.14, 0.92, 0.01), glow, 1.4, 1.1, 0.4);
  P(w, D.box(0.4, 0.25, 0.03, 0.005), glow, 1.4, 0.55, 0.86);
  pipe(
    w,
    M.dark,
    [
      [0.9, 0.9, 0.4],
      [0.5, 1.0, 0.3],
      [0.25, 1.2, 0.1],
    ],
    0.08,
    8,
  );
  bakeAll(w, { ...TINT, cache: 'ev_sinkhole_wp' });
  g.wp = wp;
  // 流沙（觸發後出現）：外圈的沙、往中心旋轉的紋路
  const hole = node(g, 'hole');
  flat(
    hole,
    new THREE.CircleGeometry(13, 48),
    new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1, transparent: true, opacity: 0.85 }),
    0.08,
  );
  const hs = new THREE.Group();
  hole.add(hs);
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2;
    const r = 3 + (k % 3) * 3;
    P(
      hs,
      D.box(2.4, 0.06, 0.25, 0.02),
      mStd(0x6e5230, { roughness: 1, metalness: 0 }),
      Math.cos(a) * r,
      0.1,
      Math.sin(a) * r,
      0,
      -a - 1.1,
      0,
    );
  }
  bakeAll(hs, { ...TINT, cache: 'ev_sinkhole_h' });
  hole.visible = false;
  g.hole = hole;
  tagStyle(g);
  return g;
}

// ---------- 水沒市街：抽水站（控制台：逆轉 → 水位上升） ----------
export function buildEvPump(color = 0x6ad8ff) {
  const g = new THREE.Group();
  if (glbOr('device/pump', g)) return g;
  const M = metalSet(0x4a6a6a);
  M.con = mStd(0x7a807e, { roughness: 0.95, metalness: 0.02 });
  M.glass = mStd(0x2a3a44, { roughness: 0.1, metalness: 0.6 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 建物：主體、壁柱、屋頂的女兒牆、屋頂設備（排風扇、管線）
  bx(b, M.con, 6, 4, 5, 0, 2, -1, 0, 0, 0, 0.15);
  for (const x of [-2.9, -0.95, 0.95, 2.9]) bx(b, M.con, 0.3, 4.1, 0.2, x, 2.05, 1.55, 0, 0, 0, 0.04);
  bx(b, M.dark, 6.4, 0.35, 5.4, 0, 4.15, -1, 0, 0, 0, 0.04);
  bx(b, M.con, 6.4, 0.4, 0.2, 0, 4.5, 1.6, 0, 0, 0, 0.03);
  for (const x of [-1.6, 1.6]) {
    cy(b, M.sub, 0.6, 0.5, x, 4.6, -1.6, 20, 0.04);
    fine(() => {
      P(b, loop(0.5, 0.03, 16), M.dark, x, 4.86, -1.6);
      for (let k = 0; k < 4; k++)
        bx(b, M.dark, 0.9, 0.02, 0.08, x, 4.86, -1.6, 0, (k * Math.PI) / 4, 0, 0.005);
    });
  }
  pipe(
    b,
    M.body,
    [
      [-2.6, 4.3, -3.2],
      [-2.6, 4.9, -3.2],
      [2.6, 4.9, -3.2],
      [2.6, 4.3, -3.2],
    ],
    0.15,
    8,
  );
  // 前面：窗、門、看板、發光條
  for (const x of [-1.9, 0, 1.9]) {
    bx(b, M.glass, 1.2, 0.7, 0.05, x, 3.1, 1.52, 0, 0, 0, 0.01);
    fine(() => vents(b, M.dark, M.sub, 1.1, 0.5, x, 2.35, 1.53, 0, 4));
  }
  bx(b, M.dark, 1.0, 1.9, 0.08, 2.0, 0.95, -3.53, 0, 0, 0, 0.02);
  P(b, D.box(4.8, 0.12, 0.08, 0.01), glow, 0, 3.6, 1.54);
  bx(b, mStd(0x2a5aa0, { roughness: 0.5 }), 2.2, 0.4, 0.05, 0, 3.95, 1.55, 0, 0, 0, 0.01);
  // 三支出水管（法蘭、往下彎進水裡）＋管座
  for (const x of [-1.8, 0, 1.8]) {
    pipe(
      b,
      M.body,
      [
        [x, 1.0, 1.4],
        [x, 1.0, 2.6],
        [x, 0.75, 3.3],
        [x, 0.1, 3.6],
      ],
      0.5,
      18,
    );
    for (const z of [1.7, 2.5]) cz(b, M.sub, 0.6, 0.12, x, 1.0, z, 20, 0.02);
    bx(b, M.con, 1.2, 0.5, 0.6, x, 0.25, 2.1, 0, 0, 0, 0.04);
    fine(() => {
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        cz(b, M.steel, 0.03, 0.16, x + Math.cos(a) * 0.56, 1.0 + Math.sin(a) * 0.56, 1.7, 6);
      }
    });
  }
  consoleAt(b, M, glow, 3.8, 1.5, HP);
  bakeAll(b, { ...TINT, cache: 'ev_pump' });
  const hole = node(g, 'hole');
  flat(
    hole,
    new THREE.CircleGeometry(20, 48),
    new THREE.MeshStandardMaterial({
      color: 0x2a4a50,
      roughness: 0.15,
      metalness: 0.2,
      transparent: true,
      opacity: 0.7,
    }),
    0.3,
  );
  hole.visible = false;
  g.hole = hole;
  g.wp = null;
  tagStyle(g);
  return g;
}

// ---------- 多重水壩：洩洪閘（sink：閘門沉下去＝打開），控制台在旁邊 ----------
export function buildEvSpillway(color = 0x7fd0ff) {
  const g = new THREE.Group();
  if (glbOr('device/spillway', g)) return g;
  const M = metalSet(0x4a525a);
  M.gate = mStd(0x3a5a6a, { metalness: 0.55 });
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 兩座閘墩（前面是三角的分水尖）＋頂上的橋面＋兩座捲揚機房＋欄杆
  for (const x of [-6, 6]) {
    bx(b, M.con, 2, 7, 4, x, 3.5, -1, 0, 0, 0, 0.15);
    P(
      b,
      D.extrude(
        [
          [-1, 0],
          [1, 0],
          [0, 1.2],
        ],
        6.8,
        0.05,
      ),
      M.con,
      x,
      3.4,
      1.0,
      -HP,
      0,
      0,
    );
    bx(b, M.dark, 0.3, 6.6, 0.4, x - Math.sign(x) * 1.0, 3.4, -0.6, 0, 0, 0, 0.02);
    fine(() => {
      for (let y = 1; y < 7; y += 1.5) bx(b, M.con, 2.02, 0.03, 4.02, x, y, -1, 0, 0, 0, 0.005);
    });
  }
  bx(b, M.con, 14, 1.2, 4, 0, 7.4, -1, 0, 0, 0, 0.1);
  for (const x of [-3.2, 3.2]) {
    bx(b, M.body, 2.6, 1.8, 2.2, x, 8.9, -1.4, 0, 0, 0, 0.08);
    bx(b, M.dark, 2.8, 0.14, 2.4, x, 9.85, -1.4, 0, 0, 0, 0.02);
    P(b, D.gear(0.6, 20, 0.2, 0.85), M.steel, x, 8.9, -0.25, 0, HP, 0);
    fine(() => vents(b, M.dark, M.sub, 1.2, 0.6, x, 9.0, -2.5, Math.PI, 5));
  }
  fine(() =>
    railing(
      b,
      M.yel,
      [
        [-7, 0.9],
        [7, 0.9],
      ],
      8.0,
      0.45,
      0.03,
    ),
  );
  consoleAt(b, M, glow, 8.4, -2, 0);
  bakeAll(b, { ...TINT, cache: 'ev_spill' });
  // 閘門：鋼板、橫肋、發光條、兩側的滾輪
  const sink = node(g, 'sink');
  const s = new THREE.Group();
  sink.add(s);
  bx(s, M.gate, 10, 6.4, 0.6, 0, 3.4, -0.6, 0, 0, 0, 0.04);
  for (let y = 0.6; y < 6.5; y += 0.9) bx(s, M.gate, 10.1, 0.14, 0.9, 0, y, -0.6, 0, 0, 0, 0.02);
  for (let x = -4; x <= 4; x += 2) bx(s, M.gate, 0.14, 6.2, 0.8, x, 3.4, -0.6, 0, 0, 0, 0.02);
  for (let y = 1.2; y < 6.5; y += 1.8) P(s, D.box(9.6, 0.1, 0.92, 0.01), glow, 0, y, -0.6);
  for (const x of [-5.05, 5.05]) for (const y of [1, 3.4, 5.8]) cz(s, M.steel, 0.25, 0.3, x, y, -0.6, 14);
  bakeAll(s, { ...TINT, cache: 'ev_spill_gate' });
  const hole = node(g, 'hole');
  const water = flat(
    hole,
    new THREE.PlaneGeometry(18, 28),
    new THREE.MeshStandardMaterial({
      color: 0x3a6a80,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.65,
    }),
    0.3,
  );
  water.position.z = 14;
  hole.visible = false;
  g.sink = sink;
  g.hole = hole;
  g.wp = null;
  tagStyle(g);
  return g;
}

// ---------- 舊宇宙港：火箭的發射架（高 18），弱點＝底座的固定夾，往 +Z 倒下 ----------
export function buildEvLaunchTower(color = 0xff9a40) {
  const g = new THREE.Group();
  if (glbOr('device/launchtower', g)) return g;
  const M = metalSet(0xa83a2a, { roughness: 0.55 });
  M.white = mStd(0xdfe2e4, { roughness: 0.5, metalness: 0.2 });
  const lamp = mLamp(0xff3020, 1.8);
  const tower = node(g, 'tower');
  const t = new THREE.Group();
  tower.add(t);
  // 四根主柱＋每層的橫桿與 K 型斜撐
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) bx(t, M.body, 0.34, 18, 0.34, sx * 1.4, 9.4, sz * 1.4, 0, 0, 0, 0.04);
  for (let y = 1.0; y < 18; y += 2.2) {
    for (const [ax, az, bx2, bz] of [
      [-1, -1, 1, -1],
      [1, -1, 1, 1],
      [1, 1, -1, 1],
      [-1, 1, -1, -1],
    ]) {
      rod(t, M.body, [ax * 1.4, y, az * 1.4], [bx2 * 1.4, y, bz * 1.4], 0.08, 6);
      const mx = (ax + bx2) * 0.7,
        mz = (az + bz) * 0.7;
      if (y + 2.2 < 18.4) {
        rod(t, M.sub, [ax * 1.4, y, az * 1.4], [mx, y + 1.1, mz], 0.05, 5);
        rod(t, M.sub, [mx, y + 1.1, mz], [bx2 * 1.4, y + 2.2, bz * 1.4], 0.05, 5);
      }
    }
  }
  // 工作平台（三層，欄杆）、頂上的平台與避雷針、兩支服務臂、電梯井
  for (const y of [6.6, 11.0, 15.4]) {
    bx(t, M.dark, 3.6, 0.14, 3.6, 0, y, 0, 0, 0, 0, 0.02);
    fine(() =>
      railing(
        t,
        M.yel,
        [
          [-1.8, -1.8],
          [1.8, -1.8],
          [1.8, 1.8],
          [-1.8, 1.8],
          [-1.8, -1.8],
        ],
        y + 0.07,
        0.5,
        0.03,
      ),
    );
  }
  bx(t, M.white, 4, 0.6, 4, 0, 18.6, 0, 0, 0, 0, 0.08);
  rod(t, M.steel, [0, 18.9, 0], [0, 21.5, 0], 0.08, 6);
  P(t, gSph(0.15, 10), lamp, 0, 21.6, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(t, gSph(0.12, 8), lamp, sx * 1.9, 19.0, sz * 1.9);
  for (const y of [9, 14]) {
    bx(t, M.white, 4.6, 0.5, 0.6, 3.6, y, 0, 0, 0, 0, 0.05);
    rod(t, M.white, [1.4, y - 1.6, 0], [4.2, y - 0.2, 0], 0.08, 6);
    fine(() =>
      pipe(
        t,
        M.dark,
        [
          [1.4, y + 0.3, 0.2],
          [3.0, y + 0.35, 0.2],
          [5.6, y + 0.1, 0.2],
          [5.9, y - 0.4, 0.2],
        ],
        0.08,
        6,
      ),
    );
  }
  fine(() => {
    for (const x of [-0.6, 0.6]) rod(t, M.steel, [x, 0.5, -1.45], [x, 18, -1.45], 0.04, 4);
  });
  bakeAll(t, { ...TINT, cache: 'ev_ltower' });
  // 不倒的底座：混凝土的發射台、火焰導流槽的格柵、固定夾
  const b = new THREE.Group();
  g.add(b);
  bx(b, M.con, 5.2, 0.8, 5.2, 0, 0.4, 0, 0, 0, 0, 0.1);
  for (let k = 0; k < 7; k++) bx(b, M.dark, 0.12, 0.06, 4.6, -1.8 + k * 0.6, 0.82, 0, 0, 0, 0, 0.01);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      bx(b, M.dark, 0.7, 0.5, 0.7, sx * 1.4, 1.05, sz * 1.4, 0, 0, 0, 0.05);
      fine(() => boltRing(b, M.steel, 0.28, 1.32, 6, 0.04, sx * 1.4, sz * 1.4));
    }
  hazard(b, M.yel, M.dark, 5.0, 0.14, 0.04, 0, 0.55, 2.61, 0, 16);
  bakeAll(b, { ...TINT, cache: 'ev_ltower_b' });
  wpNode(g, color, 0, 1.4, 2.0, 1.3, 'ev_wp_l');
  g.tower = tower;
  tagStyle(g);
  return g;
}

// ---------- Grid 086：直立收起的吊橋（tower：放下時往 +Z 倒），兩側的絞盤座，控制台在後方 ----------
export function buildEvDrawbridge(color = 0xffc060) {
  const g = new THREE.Group();
  if (glbOr('device/drawbridge', g)) return g;
  const M = metalSet(0x6a6258, { roughness: 0.6 });
  const glow = mGlow(color);
  const tower = node(g, 'tower');
  const t = new THREE.Group();
  tower.add(t);
  // 橋面：兩側的桁架主樑、面板（止滑的肋）、發光的邊線、底部的鉸鏈筒
  for (const x of [-3.7, 3.7]) {
    bx(t, M.body, 0.6, 15, 1.2, x, 7.6, 0, 0, 0, 0, 0.06);
    for (let y = 1; y < 15; y += 1.5) rod(t, M.sub, [x, y, -0.5], [x, y + 1.5, 0.5], 0.05, 5);
  }
  bx(t, M.dark, 7, 15, 0.5, 0, 7.6, -0.2, 0, 0, 0, 0.04);
  for (let y = 0.8; y < 15; y += 0.6) bx(t, M.body, 6.8, 0.08, 0.1, 0, y, 0.1, 0, 0, 0, 0.01);
  for (let y = 2; y < 15; y += 3) bx(t, M.body, 7.2, 0.3, 1.0, 0, y, -0.3, 0, 0, 0, 0.03);
  P(t, D.box(0.15, 14.4, 0.06, 0.01), glow, -3.35, 7.6, 0.2);
  P(t, D.box(0.15, 14.4, 0.06, 0.01), glow, 3.35, 7.6, 0.2);
  cx(t, M.steel, 0.55, 8.4, 0, 0.6, 0, 20, 0.04);
  // 頂端往後拉的鋼索
  for (const x of [-3.7, 3.7]) rod(t, M.steel, [x, 14.8, -0.5], [x * 1.3, 3.2, -0.9], 0.04, 5);
  fine(() => {
    for (let y = 1.5; y < 15; y += 2) boltRow(t, M.steel, -3.2, 3.2, y, 0.15, 8);
  });
  bakeAll(t, { ...TINT, cache: 'ev_dbridge' });
  // 不動的部分：兩座絞盤座（鋼索的鼓輪、齒輪、液壓缸）＋控制台
  const b = new THREE.Group();
  g.add(b);
  for (const x of [-4.8, 4.8]) {
    bx(b, M.body, 1.3, 3.0, 1.7, x, 1.5, -0.6, 0, 0, 0, 0.08);
    cx(b, M.dark, 0.55, 1.4, x, 3.2, -0.9, 20, 0.04);
    P(b, D.gear(0.7, 22, 0.15, 0.88), M.steel, x + Math.sign(x) * 0.72, 3.2, -0.9);
    piston(b, M.dark, M.steel, [x, 0.6, -1.4], [x * 0.85, 2.4, -0.3], 0.1);
    hazard(b, M.yel, M.dark, 1.6, 0.18, 0.04, x, 0.4, 0.26, 0, 6);
  }
  consoleAt(b, M, glow, 6.6, -3, 0);
  bakeAll(b, { ...TINT, cache: 'ev_dbridge_b' });
  g.tower = tower;
  g.wp = null;
  tagStyle(g);
  return g;
}

// ---------- 洋上都市：防波閘（觸發後由臨時障礙物升起），底座的閘槽、兩端的導軌塔、繫船柱、控制台 ----------
export function buildEvSeawall(color = 0x6ad8ff) {
  const g = new THREE.Group();
  if (glbOr('device/seawall', g)) return g;
  const M = metalSet(0x3a5a6a);
  M.con = mStd(0x8a9090, { roughness: 0.95, metalness: 0.02 });
  const glow = mGlow(color);
  const lamp = mLamp(0xffa020, 1.8);
  const b = new THREE.Group();
  g.add(b);
  bx(b, M.con, 18, 0.4, 2.4, 0, 0.2, 0, 0, 0, 0, 0.06);
  bx(b, M.dark, 17.6, 0.06, 1.5, 0, 0.42, 0, 0, 0, 0, 0.01);
  P(b, D.box(17.4, 0.06, 0.2, 0.01), glow, 0, 0.44, 0);
  hazard(b, M.yel, M.dark, 17.6, 0.04, 0.24, 0, 0.42, 0.95, 0, 40);
  hazard(b, M.yel, M.dark, 17.6, 0.04, 0.24, 0, 0.42, -0.95, 0, 40);
  for (const x of [-9.4, 9.4]) {
    bx(b, M.body, 0.8, 5, 1.6, x, 2.5, 0, 0, 0, 0, 0.06);
    bx(b, M.dark, 0.2, 4.6, 0.5, x - Math.sign(x) * 0.42, 2.5, 0, 0, 0, 0, 0.02);
    bx(b, M.body, 1.4, 0.8, 2.0, x, 5.3, 0, 0, 0, 0, 0.06);
    cy(b, M.dark, 0.12, 0.2, x, 5.8, 0, 12);
    lathe(
      b,
      lamp,
      [
        [0, 0],
        [0.16, 0],
        [0.16, 0.2],
        [0.08, 0.3],
        [0, 0.3],
      ],
      x,
      5.9,
      0,
      'y',
      12,
    );
    fine(() => {
      for (let y = 0.6; y < 4.6; y += 0.35)
        rod(b, M.steel, [x + 0.42, y, -0.25], [x + 0.42, y, 0.25], 0.02, 4);
      vents(b, M.dark, M.sub, 1.0, 0.5, x, 5.3, 1.01, 0, 4);
    });
  }
  // 繫船柱
  for (const x of [-6, -2, 2, 6])
    lathe(
      b,
      M.dark,
      [
        [0, 0],
        [0.24, 0],
        [0.2, 0.3],
        [0.18, 0.45],
        [0.3, 0.55],
        [0.3, 0.62],
        [0, 0.62],
      ],
      x,
      0.4,
      -1.0,
      'y',
      14,
    );
  consoleAt(b, M, glow, 0, -3.2, -HP);
  bakeAll(b, { ...TINT, cache: 'ev_seawall' });
  g.wp = null;
  tagStyle(g);
  return g;
}

// ---------- 高空軌道：對接艙（slide：脫離後往 +Z 滑出並掉下去），弱點＝固定夾 ----------
export function buildEvDock(color = 0xffd060) {
  const g = new THREE.Group();
  if (glbOr('device/dock', g)) return g;
  const M = metalSet(0xc8ccd0, { roughness: 0.5 });
  M.glass = mStd(0x22344a, { roughness: 0.1, metalness: 0.6 });
  M.gold = mStd(0xc89a3a, { roughness: 0.35, metalness: 0.9 });
  const lamp = mLamp(0xff3020, 1.6);
  const slide = node(g, 'slide');
  const s = new THREE.Group();
  slide.add(s);
  // 艙體：剖面旋轉（前後收窄、對接環）、肋、窗、姿態控制噴嘴、天線、太陽能板
  lathe(
    s,
    M.body,
    [
      [0, -0.4],
      [2.2, -0.4],
      [2.4, -0.2],
      [3.0, 0.4],
      [3.0, 7.6],
      [2.6, 8.4],
      [1.6, 8.8],
      [1.4, 9.1],
      [0, 9.1],
    ],
    0,
    3,
    0,
    'z',
    28,
  );
  for (const z of [0.5, 2.5, 4.5, 6.5]) P(s, loop(3.03, 0.1, 28), M.sub, 0, 3, z, HP, 0, 0);
  for (const z of [1.5, 5.5]) {
    P(s, D.cyl(3.06, 3.06, 1.2, 28, 0.02), M.gold, 0, 3, z, HP, 0, 0);
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(a) * 3.0,
      y = 3 + Math.sin(a) * 3.0;
    bx(s, M.dark, 0.4, 0.4, 0.4, x, y, 7.2, 0, 0, a, 0.04);
    fine(() => {
      for (const [ox, oy] of [
        [0.25, 0],
        [-0.25, 0],
        [0, 0.25],
      ])
        cz(
          s,
          M.steel,
          0.06,
          0.18,
          x + ox * Math.cos(a) - oy * Math.sin(a),
          y + ox * Math.sin(a) + oy * Math.cos(a),
          7.2,
          8,
          0,
          0.09,
        );
    });
  }
  for (let k = 0; k < 5; k++) {
    const a = -0.4 + k * 0.2;
    bx(s, M.glass, 0.45, 0.35, 0.05, Math.sin(a) * 3.02, 3 + Math.cos(a) * 3.02, 3.5, -0.0, a, 0, 0.02);
  }
  for (const sx of [-1, 1]) {
    bx(s, M.dark, 0.2, 0.2, 1.4, sx * 3.15, 3, 3.5, 0, 0, 0, 0.02);
    bx(
      s,
      mStd(0x1e2a50, { roughness: 0.3, metalness: 0.5 }),
      3.0,
      0.06,
      1.8,
      sx * 4.7,
      3,
      3.5,
      0,
      0,
      0,
      0.01,
    );
    fine(() => {
      for (let k = 1; k < 4; k++)
        bx(s, M.sub, 0.03, 0.07, 1.82, sx * (3.2 + k * 0.75), 3, 3.5, 0, 0, 0, 0.004);
    });
  }
  rod(s, M.steel, [0, 6.0, 6.0], [0, 7.4, 6.4], 0.04, 5);
  P(s, gSph(0.1, 8), lamp, 0, 7.45, 6.42);
  hazard(s, M.yel, M.dark, 4.0, 0.25, 0.05, 0, 0.6, -0.42, 0, 10);
  bakeAll(s, { ...TINT, cache: 'ev_dock' });
  // 不動的部分：對接口的框（環）、兩支夾臂柱
  const b = new THREE.Group();
  g.add(b);
  for (const x of [-3.4, 3.4]) {
    bx(b, M.dark, 0.8, 3, 1.2, x, 1.5, -0.6, 0, 0, 0, 0.06);
    bx(b, M.body, 1.0, 0.8, 1.4, x, 3.2, -0.6, 0, 0, 0, 0.06);
    piston(b, M.dark, M.steel, [x, 3.4, -1.1], [x * 0.75, 4.6, -0.3], 0.08);
  }
  P(b, loop(3.3, 0.25, 32), M.body, 0, 3.2, -0.9, HP, 0, 0);
  bakeAll(b, { ...TINT, cache: 'ev_dock_b' });
  // 弱點：固定夾的鎖（右邊的柱子上）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  const glow = mGlow(color, 1.5);
  bx(w, M.dark, 0.9, 0.8, 0.9, 3.4, 3.4, -0.4, 0, 0, 0, 0.06);
  P(w, D.box(0.92, 0.2, 0.92, 0.01), glow, 3.4, 3.5, -0.4);
  cx(w, M.steel, 0.25, 1.1, 3.0, 3.4, -0.4, 14, 0.02);
  P(w, D.box(0.3, 0.3, 0.03, 0.005), glow, 3.4, 3.4, 0.07);
  bakeAll(w, { ...TINT, cache: 'ev_dock_wp' });
  g.wp = wp;
  g.slide = slide;
  tagStyle(g);
  return g;
}

// ---------- 地下技研都市：防爆門（sink：打開時沉下去），控制台在旁邊；門後有補給箱與一群敵人 ----------
export function buildEvBlastDoor(color = 0xff6a6a) {
  const g = new THREE.Group();
  if (glbOr('device/blastdoor', g)) return g;
  const M = metalSet(0x4a4e56);
  M.white = mStd(0xc8ccd0, { roughness: 0.5, metalness: 0.3 });
  const glow = mGlow(color);
  const lamp = mLamp(0xff3020, 1.8);
  const b = new THREE.Group();
  g.add(b);
  // 門框：兩側的牆（內緣斜切）、上面的橫樑、警示斜紋、補強板、門號
  for (const s of [-1, 1]) {
    bx(b, M.body, 3, 9, 3, s * 7.5, 4.5, 0, 0, 0, 0, 0.15);
    P(
      b,
      D.extrude(
        [
          [0, 0],
          [0.6, 0],
          [0, 0.6],
        ],
        8.6,
        0.02,
      ),
      M.sub,
      s * 6.0,
      4.3,
      1.5,
      -HP,
      s > 0 ? 0 : 0,
      s > 0 ? HP : 0,
    );
    for (let y = 1; y < 8.5; y += 1.4) bx(b, M.sub, 3.04, 0.1, 3.04, s * 7.5, y, 0, 0, 0, 0, 0.01);
    for (let k = 0; k < 12; k++)
      bx(b, k % 2 ? M.dark : M.yel, 0.2, 0.7, 0.05, s * 6.15, 0.35 + k * 0.7, 1.52, 0, 0, 0, 0.005);
    P(b, gSph(0.2, 10), lamp, s * 6.3, 9.0, 1.6);
  }
  bx(b, M.body, 18, 2, 3, 0, 9.4, 0, 0, 0, 0, 0.15);
  bx(b, M.white, 3.0, 1.0, 0.06, 0, 9.4, 1.52, 0, 0, 0, 0.02);
  bx(b, mStd(0x2a2a2a), 2.2, 0.6, 0.07, 0, 9.4, 1.53, 0, 0, 0, 0.01);
  for (const x of [-4, 4]) {
    bx(b, M.dark, 1.6, 0.8, 1.6, x, 10.8, 0, 0, 0, 0, 0.06);
    piston(b, M.dark, M.steel, [x, 10.4, 0], [x, 8.6, 0], 0.15);
  }
  fine(() => {
    boltRow(b, M.steel, -8.5, 8.5, 10.25, 1.5, 24);
    boltRow(b, M.steel, -8.5, 8.5, 8.55, 1.5, 24);
  });
  consoleAt(b, M, glow, 10.2, -2.4, 0);
  bakeAll(b, { ...TINT, cache: 'ev_bdoor' });
  // 門板：厚重的鋼板、山形的肋、中央的接縫與鎖栓、發光的縱條
  const sink = node(g, 'sink');
  const s = new THREE.Group();
  sink.add(s);
  bx(s, M.dark, 12, 8.4, 1.4, 0, 4.2, 0, 0, 0, 0, 0.08);
  for (let y = 1.0; y < 8; y += 1.6) {
    for (const sx of [-1, 1]) bx(s, M.body, 5.6, 0.35, 0.2, sx * 3.0, y, 0.75, 0, 0, sx * -0.22, 0.04);
  }
  bx(s, M.sub, 0.3, 8.2, 0.25, 0, 4.2, 0.78, 0, 0, 0, 0.03);
  for (let y = 1.5; y < 8; y += 2) cx(s, M.steel, 0.2, 1.2, 0, y, 0.85, 14, 0.02);
  for (let k = -2; k <= 2; k++) if (k) P(s, D.box(0.2, 7.6, 1.45, 0.01), glow, k * 2.4, 4.2, 0);
  hazard(s, M.yel, M.dark, 12, 0.3, 0.06, 0, 0.25, 0.72, 0, 24);
  fine(() => {
    for (let x = -5.5; x <= 5.5; x += 1.1) cz(s, M.steel, 0.06, 0.06, x, 8.2, 0.72, 8);
  });
  bakeAll(s, { ...TINT, cache: 'ev_bdoor_d' });
  g.sink = sink;
  g.wp = null;
  tagStyle(g);
  return g;
}

export const EVENT_BUILDERS = {
  spillway: buildEvSpillway,
  launchtower: buildEvLaunchTower,
  drawbridge: buildEvDrawbridge,
  seawall: buildEvSeawall,
  dock: buildEvDock,
  blastdoor: buildEvBlastDoor,
  gantry: buildEvGantry,
  reshape: buildEvReshape,
  tunnel: buildEvTunnel,
  avalanche: buildEvAvalanche,
  chimney: buildEvChimney,
  sinkhole: buildEvSinkhole,
  pump: buildEvPump,
};
