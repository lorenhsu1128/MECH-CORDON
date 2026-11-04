// 固定砲台與重武器的模型（docs/map-devices-design.md 的 G；純函式，不呼叫亂數；品質標準照 docs/model-detail.md）。
// 舊尺度建模（遊戲裡乘 MS）；砲台的 head 節點繞 Y 轉（砲口朝 +Z），GUN_MUZZLE＝砲口在砲台座標裡的位置
// （砲塔沒有轉的時候）。四種砲台的輪廓、基座、配色都不同，遠遠就認得出來：
//   重機砲台＝低矮的裝甲砲塔、斜面防盾、雙聯六管機砲與側面的彈藥箱（橄欖綠）
//   電磁砲台＝高架的叉形砲架、細長的雙軌砲身與發光的線圈環、後方的電容器組與散熱鰭片（白色）
//   導彈陣列＝方形平台與四支液壓腳、仰起的 2×3 發射箱、側面的相控陣雷達（沙色）
//   防空砲台＝十字支架、弧形防盾、仰角的雙聯長砲管與砲口制退器、頂上的彈夾與搜索雷達（藍灰）
// 重武器（沿 +Z）：巨型加農砲＝粗砲管與制退器、火焰放射器＝兩個燃料槽與噴嘴、導彈莢艙＝2×2 發射筒的箱子。
import { bakeAll, gSph, P } from './geometry.js';
import { D } from './detail.js';
import { providedModel } from './model-provider.js';
import { tagStyle } from './style/shader.js';
import {
  HP,
  arc,
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
  piston,
  pipe,
  railing,
  rod,
  vents,
} from './dev-kit.js';

const TINT = { tint: { ao: 0.85, grime: 0.35, gh: 0.55 } };
export const GUN_MUZZLE = {
  hmg: [0, 1.95, 3.0],
  rail: [0, 2.05, 4.3],
  msl: [0, 2.6, 1.1],
  flak: [0, 3.0, 3.55],
};
const FLAK_EL = 0.22; // 防空砲的仰角

// 共用：後方的操作台（機體站的地方，z＝−2.4）：踏板＋護欄＋控制箱
function seat(b, M, glow) {
  bx(b, M.dark, 1.5, 0.22, 1.1, 0, 0.11, -2.4);
  bx(b, M.sub, 1.36, 0.06, 0.96, 0, 0.25, -2.4, 0, 0, 0, 0.02);
  hazard(b, M.yel, M.dark, 1.4, 0.06, 0.05, 0, 0.2, -2.94);
  // 踏板到基座的走道
  bx(b, M.dark, 0.8, 0.12, 0.9, 0, 0.1, -1.6);
  fine(() => {
    for (let i = -3; i <= 3; i++) bx(b, M.sub, 0.06, 0.03, 0.88, i * 0.1, 0.17, -1.6, 0, 0, 0, 0.005);
    bx(b, M.dark, 0.28, 0.5, 0.2, 0.62, 0.5, -2.85);
    bx(b, M.sub, 0.22, 0.14, 0.04, 0.62, 0.66, -2.74, -0.3);
    P(b, D.box(0.14, 0.05, 0.02, 0.005), glow, 0.62, 0.68, -2.72, -0.3);
  });
}

// ---------- 重機砲台 ----------
function turretHmg(g, color) {
  const M = {
    body: mStd(0x59614a, { roughness: 0.7, metalness: 0.35 }),
    sub: mStd(0x7a8064, { roughness: 0.7, metalness: 0.35 }),
    dark: mStd(0x262923, { metalness: 0.55 }),
    steel: mStd(0x7c8288, { roughness: 0.35, metalness: 0.85 }),
    gun: mStd(0x1c1e20, { roughness: 0.4, metalness: 0.8 }),
    brass: mStd(0xb88a38, { roughness: 0.35, metalness: 0.9 }),
    yel: mStd(0xd8a628, { roughness: 0.6, metalness: 0.2 }),
  };
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 八角形的裝甲基座＋四隻固定腳
  cy(b, M.body, 1.5, 0.55, 0, 0.3, 0, 8, 0.08, 1.7, 0, Math.PI / 8, 0);
  cy(b, M.dark, 1.22, 0.2, 0, 0.66, 0, 8, 0.04, undefined, 0, Math.PI / 8, 0);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2,
      c = Math.cos(a),
      s = Math.sin(a);
    bx(b, M.body, 0.5, 0.3, 0.7, c * 1.5, 0.15, s * 1.5, 0, -a + HP, 0);
    bx(b, M.dark, 0.7, 0.08, 0.8, c * 1.62, 0.04, s * 1.62, 0, -a + HP, 0);
    fine(() => {
      for (const o of [-0.22, 0.22]) cy(b, M.steel, 0.045, 0.06, c * 1.7 - s * o, 0.1, s * 1.7 + c * o, 6);
    });
  }
  // 砲塔環
  cy(b, M.steel, 1.08, 0.5, 0, 1.0, 0, 28, 0.04);
  P(b, D.gear(1.12, 40, 0.12, 0.9), M.dark, 0, 1.18, 0, 0, 0, HP);
  fine(() => boltRing(b, M.steel, 1.38, 0.6, 16, 0.04));
  hazard(b, M.yel, M.dark, 1.1, 0.12, 0.05, 0, 0.42, 1.5, 0);
  seat(b, M, glow);
  bakeAll(b, { ...TINT, cache: 'gun_base_hmg' });

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.5;
  g.add(head);
  const h = new THREE.Group();
  head.add(h);
  // 砲塔本體：側面輪廓（前面斜、後面高）往 X 擠出
  const prof = [
    [-1.0, -0.25],
    [0.85, -0.25],
    [1.1, 0.15],
    [0.7, 0.9],
    [-0.75, 0.95],
    [-1.05, 0.7],
  ].map(([z, y]) => [-z, y]);
  P(h, D.extrude(prof, 1.9, 0.06), M.body, 0, 0, 0, 0, HP, 0);
  // 頂上的副裝甲與艙口
  bx(h, M.sub, 1.3, 0.12, 1.0, 0, 1.0, -0.25);
  cy(h, M.dark, 0.3, 0.12, 0.35, 1.1, -0.35, 18, 0.03);
  cy(h, M.sub, 0.26, 0.06, 0.35, 1.18, -0.35, 18, 0.02);
  // 斜面防盾（兩片，中間是兩個砲口）
  for (const s of [-1, 1]) bx(h, M.sub, 1.05, 1.15, 0.14, s * 0.62, 0.38, 1.2, -0.32, s * 0.12, 0);
  bx(h, M.body, 0.3, 1.1, 0.16, 0, 0.4, 1.24, -0.32);
  for (const x of [-0.42, 0.42]) {
    cz(h, M.dark, 0.22, 0.24, x, 0.45, 1.28, 20, 0.03);
    cz(h, M.steel, 0.17, 0.1, x, 0.45, 1.42, 20);
  }
  hazard(h, M.yel, M.dark, 2.0, 0.09, 0.05, 0, 0.92, 1.0, 0);
  // 雙聯六管機砲（6 根砲管繞一圈、前中兩個夾環、後面的馬達）
  for (const x of [-0.42, 0.42]) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      cz(h, M.gun, 0.045, 1.7, x + Math.cos(a) * 0.1, 0.45 + Math.sin(a) * 0.1, 2.15, 10);
    }
    cz(h, M.gun, 0.06, 1.7, x, 0.45, 2.15, 10);
    for (const [z, r, l] of [
      [1.62, 0.18, 0.12],
      [2.25, 0.17, 0.08],
      [2.92, 0.18, 0.1],
    ])
      cz(h, M.steel, r, l, x, 0.45, z, 20, 0.02);
    lathe(
      h,
      M.dark,
      [
        [0, 0],
        [0.2, 0],
        [0.22, 0.1],
        [0.22, 0.4],
        [0.16, 0.5],
        [0, 0.5],
      ],
      x,
      0.45,
      0.95,
      'z',
      18,
    );
    // 彈殼的導槽（往下）
    bx(h, M.dark, 0.14, 0.2, 0.3, x, 0.22, 1.5, 0.3);
  }
  // 側面的彈藥箱＋送彈帶的導槽
  for (const s of [-1, 1]) {
    bx(h, M.sub, 0.42, 0.7, 1.1, s * 1.18, 0.3, 0.05);
    bx(h, M.dark, 0.46, 0.08, 1.14, s * 1.18, 0.7, 0.05);
    fine(() => {
      handle(h, M.steel, 0.4, s * 1.4, 0.35, 0.05, s * HP, 0.07);
      for (const z of [-0.3, 0.4]) bx(h, M.dark, 0.44, 0.06, 0.1, s * 1.18, 0.1, z);
    });
    pipe(
      h,
      M.dark,
      [
        [s * 1.18, 0.6, 0.5],
        [s * 1.0, 0.75, 0.9],
        [s * 0.62, 0.62, 1.1],
      ],
      0.07,
      6,
    );
    fine(() => {
      for (let i = 0; i < 6; i++)
        cx(h, M.brass, 0.025, 0.16, s * (1.08 - i * 0.07), 0.79 - i * 0.012, 0.75 + i * 0.06, 6);
    });
  }
  // 後方：艙門、通風口、狀態燈條
  bx(h, M.dark, 0.9, 0.55, 0.06, 0, 0.45, -1.06);
  fine(() => {
    handle(h, M.steel, 0.3, 0, 0.3, -1.1, Math.PI, 0.06);
    vents(h, M.dark, M.sub, 0.4, 0.3, -0.62, 0.5, -1.05, Math.PI);
    vents(h, M.dark, M.sub, 0.4, 0.3, 0.62, 0.5, -1.05, Math.PI);
  });
  P(h, D.box(1.4, 0.07, 0.04, 0.01), glow, 0, 0.85, -1.06);
  // 頂上：瞄準鏡、天線、扶手
  bx(h, M.dark, 0.3, 0.25, 0.4, -0.55, 1.15, 0.3);
  cz(h, M.steel, 0.07, 0.12, -0.55, 1.18, 0.52, 12);
  P(h, D.box(0.1, 0.06, 0.02, 0.005), mLamp(0x8fd8ff, 1.2), -0.55, 1.18, 0.59);
  fine(() => {
    rod(h, M.dark, [0.75, 1.0, -0.7], [0.75, 1.9, -0.75], 0.018, 5);
    cy(h, M.dark, 0.04, 0.1, 0.75, 1.0, -0.7, 8);
    railing(
      h,
      M.steel,
      [
        [-0.85, -0.85],
        [-0.85, -0.2],
      ],
      1.0,
      0.18,
      0.018,
    );
    boltRow(h, M.steel, -0.8, 0.8, 0.85, 0.82, 8);
  });
  bakeAll(h, { ...TINT, cache: 'gun_head_hmg' });
  return head;
}

// ---------- 電磁砲台 ----------
function turretRail(g, color) {
  const M = {
    body: mStd(0xd6dade, { roughness: 0.45, metalness: 0.35 }),
    sub: mStd(0x9aa2aa, { roughness: 0.4, metalness: 0.55 }),
    dark: mStd(0x2a3038, { roughness: 0.4, metalness: 0.7 }),
    steel: mStd(0x8a929a, { roughness: 0.25, metalness: 0.9 }),
    cap: mStd(0x3a5a78, { roughness: 0.35, metalness: 0.6 }),
    yel: mStd(0xe0b030, { roughness: 0.5, metalness: 0.2 }),
  };
  const glow = mGlow(color, 1.5);
  const b = new THREE.Group();
  g.add(b);
  // 階梯狀的圓形底座（剖面旋轉）＋三束導管
  lathe(
    b,
    M.sub,
    [
      [0, 0],
      [1.62, 0],
      [1.62, 0.18],
      [1.45, 0.26],
      [1.3, 0.26],
      [1.2, 0.55],
      [0.95, 0.62],
      [0.9, 1.2],
      [0, 1.2],
    ],
    0,
    0,
    0,
    'y',
    32,
  );
  P(b, D.cyl(1.38, 1.38, 0.04, 32), glow, 0, 0.29, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    bx(b, M.body, 0.34, 0.5, 0.18, Math.sin(a) * 1.18, 0.48, Math.cos(a) * 1.18, -0.35, a, 0);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.9;
    const c = Math.sin(a),
      s = Math.cos(a);
    pipe(
      b,
      M.cap,
      [
        [c * 1.55, 0.12, s * 1.55],
        [c * 1.25, 0.32, s * 1.25],
        [c * 0.98, 0.65, s * 0.98],
        [c * 0.95, 1.15, s * 0.95],
      ],
      0.07,
      8,
    );
  }
  fine(() => boltRing(b, M.steel, 1.54, 0.2, 20, 0.035));
  seat(b, M, glow);
  bakeAll(b, { ...TINT, cache: 'gun_base_rail' });

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.5;
  g.add(head);
  const h = new THREE.Group();
  head.add(h);
  // 轉台與叉形砲架
  cy(h, M.dark, 0.95, 0.24, 0, -0.18, 0, 28, 0.04);
  cy(h, M.body, 0.85, 0.16, 0, 0.02, 0, 28, 0.04);
  for (const s of [-1, 1]) {
    const prof = [
      [-0.55, 0],
      [0.55, 0],
      [0.35, 0.95],
      [-0.25, 0.95],
    ].map(([z, y]) => [-z, y]);
    P(h, D.extrude(prof, 0.2, 0.03), M.body, s * 0.72, 0.05, 0, 0, HP, 0);
    cx(h, M.dark, 0.2, 0.32, s * 0.72, 0.55, 0, 20, 0.03);
    cx(h, M.steel, 0.12, 0.36, s * 0.72, 0.55, 0, 16);
    fine(() => fins(h, M.sub, 4, 0.5, 0.35, 0.02, s * 0.83, 0.42, -0.1, HP, 0.02));
  }
  // 砲身（搖架）：雙軌、線圈環、前方的導向
  const cr = new THREE.Group();
  h.add(cr);
  bx(cr, M.body, 1.0, 0.6, 1.4, 0, 0.55, -0.1);
  bx(cr, M.sub, 1.04, 0.1, 1.2, 0, 0.88, -0.1);
  for (const s of [-1, 1]) {
    bx(cr, M.dark, 0.2, 0.56, 3.9, s * 0.22, 0.55, 2.3, 0, 0, 0, 0.04);
    bx(cr, M.steel, 0.04, 0.4, 3.85, s * 0.11, 0.55, 2.32, 0, 0, 0, 0.01);
    bx(cr, M.body, 0.08, 0.1, 3.7, s * 0.22, 0.86, 2.25);
    bx(cr, M.body, 0.08, 0.1, 3.7, s * 0.22, 0.24, 2.25);
    fine(() => {
      for (let k = 0; k < 14; k++)
        bx(cr, M.sub, 0.22, 0.04, 0.06, s * 0.22, 0.83, 0.8 + k * 0.26, 0, 0, 0, 0.005);
    });
  }
  for (let i = 0; i < 5; i++) {
    const z = 1.0 + i * 0.75;
    bx(cr, M.body, 0.92, 0.92, 0.1, 0, 0.55, z, 0, 0, 0, 0.03);
    P(cr, D.box(0.8, 0.8, 0.14, 0.02), glow, 0, 0.55, z);
    bx(cr, M.dark, 0.68, 0.68, 0.18, 0, 0.55, z, 0, 0, 0, 0.02);
    fine(() => {
      for (const [x, y] of [
        [-0.4, -0.4],
        [0.4, -0.4],
        [-0.4, 0.4],
        [0.4, 0.4],
      ])
        cz(cr, M.steel, 0.025, 0.14, x, 0.55 + y, z, 6);
    });
  }
  cz(cr, M.dark, 0.32, 0.3, 0, 0.55, 4.25, 4, 0.04);
  bx(cr, M.body, 0.7, 0.18, 0.4, 0, 0.88, 4.15);
  bx(cr, M.body, 0.7, 0.18, 0.4, 0, 0.22, 4.15);
  P(cr, D.box(0.08, 0.08, 3.5, 0.01), glow, 0, 0.55, 2.4);
  // 後方：電容器組（8 根）＋上方散熱鰭片＋導管
  bx(cr, M.sub, 1.3, 0.7, 1.0, 0, 0.55, -1.15);
  for (let i = 0; i < 8; i++)
    cy(
      cr,
      M.cap,
      0.12,
      0.6,
      -0.48 + (i % 4) * 0.32,
      0.55,
      -1.45 + Math.floor(i / 4) * 0.55,
      16,
      0.03,
      undefined,
      HP,
      0,
      0,
    );
  fins(cr, M.steel, 12, 1.1, 0.3, 0.9, 0, 1.06, -1.15, 0, 0.025);
  P(cr, D.box(1.32, 0.05, 0.04, 0.01), glow, 0, 0.3, -1.66);
  for (const s of [-1, 1])
    pipe(
      cr,
      M.cap,
      [
        [s * 0.55, 0.85, -0.7],
        [s * 0.48, 1.0, 0.2],
        [s * 0.4, 0.92, 0.85],
      ],
      0.06,
      8,
    );
  fine(() => {
    for (const s of [-1, 1]) {
      cable(cr, M.dark, [s * 0.6, 0.35, -1.6], [s * 0.72, 0.1, -0.4], 0.035, 0.12);
      boltRow(cr, M.steel, s * 0.3 - 0.15, s * 0.3 + 0.15, 0.6, 0.6, 2);
    }
    hazard(cr, M.yel, M.dark, 0.66, 0.07, 0.03, 0, 0.98, 4.15, 0, 6);
    cy(cr, M.dark, 0.08, 0.2, 0.4, 1.0, 0.4, 12);
    lathe(
      cr,
      M.sub,
      [
        [0, 0],
        [0.12, 0],
        [0.05, 0.12],
        [0, 0.12],
      ],
      0.4,
      1.1,
      0.4,
      'y',
      12,
    );
  });
  bakeAll(cr, { ...TINT, cache: 'gun_head_rail' });
  bakeAll(h, { ...TINT, cache: 'gun_head_rail_yoke' });
  return head;
}

// ---------- 導彈陣列 ----------
function turretMsl(g, color) {
  const M = {
    body: mStd(0xa48f62, { roughness: 0.75, metalness: 0.25 }),
    sub: mStd(0x7c6c4a, { roughness: 0.75, metalness: 0.25 }),
    dark: mStd(0x2e2b26, { metalness: 0.55 }),
    steel: mStd(0x80848a, { roughness: 0.3, metalness: 0.85 }),
    nose: mStd(0xe8e4dc, { roughness: 0.4, metalness: 0.2 }),
    red: mStd(0xb83a2a, { roughness: 0.5, metalness: 0.2 }),
    yel: mStd(0xdcae30, { roughness: 0.55, metalness: 0.2 }),
  };
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 方形平台＋四支液壓支撐腳
  bx(b, M.body, 2.5, 0.5, 2.5, 0, 0.35, 0, 0, 0, 0, 0.08);
  bx(b, M.sub, 2.2, 0.16, 2.2, 0, 0.66, 0);
  for (let i = 0; i < 4; i++) {
    const sx = i & 1 ? 1 : -1,
      sz = i & 2 ? 1 : -1;
    bx(b, M.dark, 0.36, 0.4, 0.36, sx * 1.2, 0.35, sz * 1.2);
    piston(b, M.dark, M.steel, [sx * 1.35, 0.5, sz * 1.35], [sx * 1.62, 0.08, sz * 1.62], 0.07);
    cy(b, M.dark, 0.26, 0.08, sx * 1.62, 0.04, sz * 1.62, 16, 0.02);
  }
  for (const s of [-1, 1]) {
    hazard(b, M.yel, M.dark, 2.2, 0.12, 0.05, 0, 0.42, s * 1.26, 0);
    fine(() => vents(b, M.dark, M.sub, 0.5, 0.25, s * 1.26, 0.38, 0.5, s * HP, 4));
  }
  cy(b, M.steel, 1.0, 0.45, 0, 0.95, 0, 28, 0.04);
  fine(() => boltRing(b, M.steel, 1.02, 1.18, 18, 0.035));
  seat(b, M, glow);
  bakeAll(b, { ...TINT, cache: 'gun_base_msl' });

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.5;
  g.add(head);
  const h = new THREE.Group();
  head.add(h);
  // 轉台＋兩側的仰角臂
  cy(h, M.body, 1.05, 0.28, 0, -0.1, 0, 28, 0.05);
  bx(h, M.sub, 1.2, 0.3, 1.3, 0, 0.15, -0.2);
  for (const s of [-1, 1]) {
    bx(h, M.body, 0.22, 0.9, 0.7, s * 1.18, 0.5, -0.1, 0, 0, 0, 0.05);
    cx(h, M.dark, 0.2, 0.3, s * 1.18, 0.85, 0.05, 20, 0.03);
    piston(h, M.dark, M.steel, [s * 0.9, 0.1, -0.7], [s * 0.9, 0.62, 0.32], 0.06);
  }
  // 發射箱（仰起 0.25 弧度）：外殼、六個發射筒（筒口、彈頭）、頂上打開的蓋子
  const box = new THREE.Group();
  box.position.set(0, 0.9, 0.2);
  box.rotation.x = -0.25;
  h.add(box);
  bx(box, M.body, 2.1, 1.3, 1.7, 0, 0, 0, 0, 0, 0, 0.08);
  for (const s of [-1, 1]) {
    for (const z of [-0.5, 0, 0.5]) bx(box, M.sub, 0.06, 1.34, 0.12, s * 1.06, 0, z);
    fine(() => handle(box, M.steel, 0.4, s * 1.1, 0.35, -0.2, s * HP, 0.07));
  }
  bx(box, M.dark, 1.98, 1.18, 0.08, 0, 0, 0.84);
  for (let i = 0; i < 6; i++) {
    const x = -0.62 + (i % 3) * 0.62,
      y = 0.28 - Math.floor(i / 3) * 0.56;
    cz(box, M.sub, 0.25, 0.1, x, y, 0.87, 20, 0.02);
    cz(box, M.dark, 0.2, 0.12, x, y, 0.87, 20);
    lathe(
      box,
      M.nose,
      [
        [0, 0],
        [0.15, 0],
        [0.15, 0.08],
        [0.11, 0.2],
        [0.04, 0.3],
        [0, 0.33],
      ],
      x,
      y,
      0.72,
      'z',
      16,
    );
    P(box, D.cyl(0.035, 0.035, 0.03, 8), glow, x, y, 1.06, HP, 0, 0);
    fine(() => {
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        bx(box, M.red, 0.015, 0.06, 0.1, x + Math.cos(a) * 0.16, y + Math.sin(a) * 0.16, 0.86, 0, 0, a);
      }
    });
  }
  for (const x of [-0.7, 0, 0.7]) bx(box, M.sub, 0.5, 0.06, 1.5, x, 0.67, 0);
  fine(() => {
    for (const x of [-0.7, 0.7]) handle(box, M.steel, 0.3, x, 0.7, -0.55, 0, 0.0, 0.02);
  });
  bx(box, M.dark, 2.0, 0.6, 0.3, 0, -0.1, -0.95);
  fine(() => {
    vents(box, M.dark, M.sub, 1.6, 0.4, 0, 0.3, -0.87, Math.PI, 6);
    boltRow(box, M.steel, -0.95, 0.95, 0.62, 0.84, 10);
    boltRow(box, M.steel, -0.95, 0.95, -0.62, 0.84, 10);
  });
  P(box, D.box(1.9, 0.06, 0.04, 0.01), glow, 0, -0.68, 0.86);
  // 側面的相控陣雷達（在 −X 側的支架上）
  bx(h, M.dark, 0.18, 1.2, 0.18, -1.45, 0.75, -0.55);
  bx(h, M.sub, 0.12, 0.9, 1.0, -1.58, 1.5, -0.55, 0, 0, 0.12);
  bx(h, M.dark, 0.04, 0.78, 0.88, -1.66, 1.5, -0.55, 0, 0, 0.12, 0.01);
  fine(() => {
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++)
        bx(
          h,
          M.steel,
          0.02,
          0.12,
          0.14,
          -1.69 + 0.012 * i,
          1.2 + i * 0.19,
          -0.88 + j * 0.22,
          0,
          0,
          0.12,
          0.004,
        );
    cable(h, M.dark, [-1.4, 0.3, -0.5], [-1.0, 0.25, -0.75], 0.03, 0.06);
    cy(h, mLamp(0xff3020, 1.4), 0.05, 0.08, -1.45, 1.42, -0.55, 8);
  });
  bakeAll(box, { ...TINT, cache: 'gun_head_msl_box' });
  bakeAll(h, { ...TINT, cache: 'gun_head_msl' });
  return head;
}

// ---------- 防空砲台 ----------
function turretFlak(g, color) {
  const M = {
    body: mStd(0x4e5d6a, { roughness: 0.55, metalness: 0.45 }),
    sub: mStd(0x76869a, { roughness: 0.5, metalness: 0.45 }),
    dark: mStd(0x20262c, { metalness: 0.6 }),
    steel: mStd(0x8a9096, { roughness: 0.3, metalness: 0.9 }),
    gun: mStd(0x2a2e33, { roughness: 0.35, metalness: 0.85 }),
    brass: mStd(0xc09040, { roughness: 0.35, metalness: 0.9 }),
    yel: mStd(0xd8b030, { roughness: 0.55, metalness: 0.2 }),
  };
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  // 十字支架（四支長臂＋腳墊）＋圓柱的砲座
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2,
      c = Math.sin(a),
      s = Math.cos(a);
    bx(b, M.body, 0.34, 0.3, 1.5, c * 0.85, 0.2, s * 0.85, 0, a, 0, 0.05);
    bx(b, M.dark, 0.6, 0.1, 0.6, c * 1.62, 0.05, s * 1.62, 0, a, 0);
    cy(b, M.steel, 0.1, 0.35, c * 1.62, 0.25, s * 1.62, 12, 0.02);
    cy(b, M.dark, 0.13, 0.06, c * 1.62, 0.45, s * 1.62, 12);
    piston(b, M.dark, M.steel, [c * 0.55, 0.65, s * 0.55], [c * 1.3, 0.3, s * 1.3], 0.045);
  }
  lathe(
    b,
    M.body,
    [
      [0, 0],
      [0.8, 0],
      [0.8, 0.3],
      [0.62, 0.45],
      [0.62, 1.0],
      [0.9, 1.08],
      [0.9, 1.25],
      [0, 1.25],
    ],
    0,
    0,
    0,
    'y',
    28,
  );
  fine(() => {
    boltRing(b, M.steel, 0.82, 1.27, 16, 0.035);
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      hazard(b, M.yel, M.dark, 0.5, 0.1, 0.03, Math.sin(a) * 0.63, 0.7, Math.cos(a) * 0.63, a, 4);
    }
  });
  seat(b, M, glow);
  bakeAll(b, { ...TINT, cache: 'gun_base_flak' });

  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.5;
  g.add(head);
  const h = new THREE.Group();
  head.add(h);
  // 轉台、弧形的防盾（剖面旋轉的一段）、兩側的砲耳座
  cy(h, M.body, 1.0, 0.2, 0, -0.15, 0, 28, 0.04);
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + i * 0.3,
      mid = Math.abs(a) < 0.35;
    const hh = mid ? 0.55 : 1.1;
    bx(
      h,
      M.sub,
      0.36,
      hh,
      0.08,
      Math.sin(a) * 1.12,
      -0.05 + hh / 2,
      Math.cos(a) * 1.12 - 0.1,
      -0.12,
      a,
      0,
      0.02,
    );
  }
  fine(() => {
    for (let i = 0; i < 9; i++) {
      const a = -0.85 + i * 0.2125;
      cz(h, M.steel, 0.025, 0.04, Math.sin(a) * 1.16, 0.85, Math.cos(a) * 1.16 - 0.1, 6);
    }
  });
  for (const s of [-1, 1]) {
    bx(h, M.body, 0.2, 0.9, 0.9, s * 0.8, 0.4, 0.2, 0, 0, 0, 0.05);
    cx(h, M.dark, 0.18, 0.3, s * 0.8, 0.75, 0.3, 20, 0.03);
  }
  // 雙聯長砲管（仰角）：砲身、復進簧、砲口制退器、頂上的彈夾
  const gun = new THREE.Group();
  gun.position.set(0, 0.75, 0.3);
  gun.rotation.x = -FLAK_EL;
  h.add(gun);
  bx(gun, M.body, 1.25, 0.5, 1.2, 0, 0, -0.1);
  for (const x of [-0.42, 0.42]) {
    lathe(
      gun,
      M.gun,
      [
        [0, 0],
        [0.12, 0],
        [0.11, 0.6],
        [0.075, 0.7],
        [0.07, 2.6],
        [0, 2.6],
      ],
      x,
      0.05,
      0.4,
      'z',
      14,
    );
    // 砲口制退器（有槽）
    cz(gun, M.dark, 0.13, 0.36, x, 0.05, 3.15, 16, 0.02);
    for (const s of [-1, 1]) bx(gun, M.gun, 0.03, 0.1, 0.22, x + s * 0.125, 0.05, 3.15, 0, 0, 0, 0.005);
    cz(gun, M.dark, 0.1, 0.1, x, 0.05, 3.38, 16);
    for (const s of [-1, 1]) cz(gun, M.steel, 0.035, 0.75, x + s * 0.13, -0.08, 0.95, 8);
    cz(gun, M.steel, 0.1, 0.1, x, 0.05, 1.35, 16);
    // 彈夾（四發砲彈插在頂上）
    bx(gun, M.dark, 0.28, 0.1, 0.62, x, 0.32, -0.15);
    for (let k = 0; k < 4; k++) {
      cy(gun, M.brass, 0.05, 0.32, x, 0.53, -0.4 + k * 0.17, 10);
      lathe(
        gun,
        M.steel,
        [
          [0, 0],
          [0.05, 0],
          [0.02, 0.1],
          [0, 0.12],
        ],
        x,
        0.68,
        -0.4 + k * 0.17,
        'y',
        10,
      );
    }
  }
  fine(() => {
    for (const s of [-1, 1]) vents(gun, M.dark, M.sub, 0.4, 0.24, s * 0.63, 0, -0.1, s * HP, 4);
    boltRow(gun, M.steel, -0.55, 0.55, -0.2, 0.5, 6);
  });
  P(gun, D.box(1.1, 0.05, 0.04, 0.01), glow, 0, 0.2, -0.71);
  bakeAll(gun, { ...TINT, cache: 'gun_head_flak_gun' });
  // 後方：搜索雷達（網格碟）與瞄準環
  bx(h, M.body, 0.6, 0.5, 0.5, 0, 0.25, -0.75);
  rod(h, M.dark, [0, 0.5, -0.8], [0, 1.65, -0.85], 0.06, 10);
  const dish = [
    [0, 0],
    [0.25, 0.02],
    [0.5, 0.1],
    [0.62, 0.18],
    [0.6, 0.2],
    [0.48, 0.13],
    [0.24, 0.06],
    [0, 0.04],
  ];
  lathe(h, M.sub, dish, 0, 1.7, -0.85, 'y', 20, 1.0, 0, 0);
  fine(() => {
    rod(h, M.dark, [0, 1.75, -0.8], [0, 2.05, -0.4], 0.02, 5);
    P(h, gSph(0.06, 8), M.dark, 0, 2.06, -0.38);
    P(
      h,
      D.sweep(
        D.ring(0.28, 20).map(([x, y]) => [x, y, 0]),
        D.ring(0.018, 5),
        true,
      ),
      M.steel,
      -0.55,
      1.05,
      0.95,
    );
    rod(h, M.steel, [-0.55, 0.75, 0.9], [-0.55, 0.78, 0.95], 0.02, 5);
    cy(h, mLamp(0xff3020, 1.5), 0.04, 0.07, 0, 1.68, -0.85, 8);
  });
  bakeAll(h, { ...TINT, cache: 'gun_head_flak' });
  return head;
}

const TURRETS = { hmg: turretHmg, rail: turretRail, msl: turretMsl, flak: turretFlak };

// 固定砲台：基座（不轉）＋ head（繞 Y 轉）
export function buildGunTurret(kind, color) {
  const g = new THREE.Group();
  const glb = providedModel('device/gun_' + kind);
  if (glb) {
    g.add(glb);
    g.head = glb.getObjectByName('head') || null;
    return g;
  }
  g.head = (TURRETS[kind] || turretHmg)(g, color);
  tagStyle(g);
  return g;
}

// ---------- 重武器（沿 +Z；撿起的台座上與掛在手臂旁共用） ----------
function hwCannon(b, color) {
  const M = {
    body: mStd(0x3e444a, { roughness: 0.5, metalness: 0.6 }),
    sub: mStd(0xc87a22, { roughness: 0.55, metalness: 0.35 }),
    dark: mStd(0x1e2124, { roughness: 0.4, metalness: 0.75 }),
    steel: mStd(0x8a9096, { roughness: 0.25, metalness: 0.9 }),
    brass: mStd(0xc09040, { roughness: 0.3, metalness: 0.9 }),
  };
  const glow = mGlow(color);
  // 砲尾（大方塊、橘色的側板）
  bx(b, M.body, 0.62, 0.66, 1.0, 0, 0, -0.55, 0, 0, 0, 0.07);
  for (const s of [-1, 1]) bx(b, M.sub, 0.05, 0.5, 0.86, s * 0.33, 0, -0.55);
  bx(b, M.dark, 0.5, 0.2, 0.3, 0, -0.38, -0.85);
  // 砲身：搖架套筒、抽煙器的鼓起、前段漸細
  cz(b, M.body, 0.27, 0.8, 0, 0.02, 0.3, 20, 0.04);
  lathe(
    b,
    M.dark,
    [
      [0, 0],
      [0.2, 0],
      [0.19, 0.6],
      [0.24, 0.72],
      [0.24, 1.0],
      [0.18, 1.12],
      [0.16, 1.9],
      [0, 1.9],
    ],
    0,
    0.02,
    0.6,
    'z',
    20,
  );
  for (const z of [1.45, 1.95]) cz(b, M.body, 0.21, 0.1, 0, 0.02, z, 20, 0.02);
  fine(() => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      bx(b, M.body, 0.03, 0.03, 0.55, Math.cos(a) * 0.235, 0.02 + Math.sin(a) * 0.235, 1.07, 0, 0, a, 0.005);
    }
  });
  // 砲口制退器（兩側開槽）
  bx(b, M.body, 0.48, 0.4, 0.5, 0, 0.02, 2.65, 0, 0, 0, 0.06);
  for (const z of [2.55, 2.72])
    for (const s of [-1, 1]) bx(b, M.dark, 0.06, 0.26, 0.08, s * 0.24, 0.02, z, 0, 0, 0, 0.01);
  P(b, D.cyl(0.13, 0.13, 0.04, 16), glow, 0, 0.02, 2.91, HP, 0, 0);
  // 頂上的彈匣（砲彈的底部露出）＋側面的握把架、瞄準器
  bx(b, M.sub, 0.5, 0.36, 0.7, 0, 0.5, -0.5);
  fine(() => {
    for (let i = 0; i < 3; i++) cz(b, M.brass, 0.07, 0.04, -0.15 + i * 0.15, 0.5, -0.86, 12);
    boltRow(b, M.steel, -0.25, 0.25, 0.25, -0.04, 4);
    for (const s of [-1, 1]) cz(b, M.steel, 0.035, 0.6, s * 0.2, -0.2, 0.3, 8);
    handle(b, M.steel, 0.3, -0.36, 0.1, -0.4, -HP, 0.08);
  });
  bx(b, M.dark, 0.16, 0.18, 0.4, 0.25, 0.42, 0.0);
  cz(b, M.steel, 0.06, 0.1, 0.25, 0.44, 0.24, 12);
  P(b, D.box(0.5, 0.05, 0.03, 0.01), glow, 0, 0.36, -0.15);
  // 掛架（往 −X，接到肩膀）
  bx(b, M.body, 0.5, 0.3, 0.5, -0.5, -0.05, -0.5);
  cx(b, M.dark, 0.18, 0.3, -0.78, -0.05, -0.5, 16, 0.02);
}
function hwFlame(b, color) {
  const M = {
    tank: mStd(0xa42a20, { roughness: 0.45, metalness: 0.4 }),
    body: mStd(0x34383c, { roughness: 0.5, metalness: 0.6 }),
    dark: mStd(0x1c1e20, { roughness: 0.45, metalness: 0.7 }),
    steel: mStd(0x9aa0a6, { roughness: 0.25, metalness: 0.9 }),
    heat: mStd(0x6a5a4a, { roughness: 0.6, metalness: 0.7 }),
    yel: mStd(0xdcae30, { roughness: 0.5, metalness: 0.2 }),
  };
  const glow = mGlow(color, 1.8);
  // 兩個燃料槽（膠囊形）＋固定帶
  const tank = [
    [0, 0],
    [0.12, 0.02],
    [0.2, 0.1],
    [0.22, 0.24],
    [0.22, 0.86],
    [0.2, 1.0],
    [0.12, 1.08],
    [0, 1.1],
  ];
  for (const s of [-1, 1]) {
    lathe(b, M.tank, tank, s * 0.24, 0, -1.25, 'z', 20);
    for (const z of [-0.95, -0.5]) cz(b, M.dark, 0.235, 0.06, s * 0.24, 0, z, 20);
    fine(() => {
      cz(b, M.steel, 0.05, 0.08, s * 0.24, 0, -1.29, 10);
      cy(b, M.steel, 0.06, 0.06, s * 0.24, 0.23, -0.6, 12);
      cy(b, mLamp(0xffe0a0, 0.6), 0.045, 0.02, s * 0.24, 0.265, -0.6, 12);
    });
  }
  hazard(b, M.yel, M.dark, 0.7, 0.06, 0.02, 0, 0.23, -0.72, 0, 6);
  // 中段：泵浦本體＋從燃料槽接過來的管子
  bx(b, M.body, 0.42, 0.36, 0.5, 0, 0, 0.0, 0, 0, 0, 0.05);
  for (const s of [-1, 1])
    pipe(
      b,
      M.dark,
      [
        [s * 0.24, -0.12, -0.18],
        [s * 0.26, -0.2, 0.0],
        [s * 0.14, -0.14, 0.18],
      ],
      0.045,
      8,
    );
  // 噴嘴：隔熱的散熱套筒（一圈槽）＋前端的漏斗＋點火燈
  cz(b, M.body, 0.14, 0.4, 0, 0.0, 0.42, 16, 0.02);
  cz(b, M.heat, 0.16, 0.9, 0, 0.0, 1.05, 16, 0.02);
  fine(() => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      bx(b, M.dark, 0.03, 0.03, 0.7, Math.cos(a) * 0.162, Math.sin(a) * 0.162, 1.05, 0, 0, a, 0.005);
    }
  });
  lathe(
    b,
    M.dark,
    [
      [0, 0],
      [0.1, 0],
      [0.1, 0.12],
      [0.17, 0.32],
      [0.15, 0.34],
      [0.08, 0.16],
      [0, 0.16],
    ],
    0,
    0,
    1.48,
    'z',
    16,
  );
  P(b, D.cyl(0.075, 0.075, 0.03, 12), glow, 0, 0, 1.66, HP, 0, 0);
  cz(b, M.steel, 0.03, 0.4, 0, -0.17, 1.45, 8);
  P(b, gSph(0.035, 8), glow, 0, -0.17, 1.66);
  // 掛架（往 −X）
  bx(b, M.body, 0.4, 0.25, 0.4, -0.45, 0.0, -0.1);
  cx(b, M.dark, 0.16, 0.3, -0.7, 0.0, -0.1, 16, 0.02);
}
function hwPod(b, color) {
  const M = {
    body: mStd(0x5a4a64, { roughness: 0.55, metalness: 0.4 }),
    sub: mStd(0x8a7a96, { roughness: 0.55, metalness: 0.4 }),
    dark: mStd(0x1e1c22, { roughness: 0.45, metalness: 0.65 }),
    steel: mStd(0x9aa0a6, { roughness: 0.25, metalness: 0.9 }),
    nose: mStd(0xe6e2dc, { roughness: 0.4, metalness: 0.2 }),
  };
  const glow = mGlow(color);
  // 箱子：斜切的前緣、側面的鰭與補強
  const prof = [
    [-0.75, -0.42],
    [0.55, -0.42],
    [0.72, -0.25],
    [0.72, 0.3],
    [0.55, 0.45],
    [-0.75, 0.45],
  ].map(([z, y]) => [-z, y]);
  P(b, D.extrude(prof, 0.86, 0.05), M.body, 0, 0, 0, 0, HP, 0);
  for (const s of [-1, 1]) {
    // 側面的追加裝甲（三片，中間有溝）、後方的安定翼
    for (const z of [-0.45, 0.0, 0.45]) bx(b, M.sub, 0.06, 0.66, 0.4, s * 0.45, 0.02, z, 0, 0, 0, 0.02);
    bx(b, M.dark, 0.04, 0.14, 1.3, s * 0.49, -0.3, 0.0);
    P(
      b,
      D.extrude(
        [
          [0, 0],
          [0.35, 0],
          [0.35, 0.08],
          [0.05, 0.3],
        ],
        0.04,
        0.01,
      ),
      M.dark,
      s * 0.45,
      0.2,
      -0.75,
      0,
      s * HP - HP,
      0,
    );
    bx(b, M.dark, 0.25, 0.05, 0.5, s * 0.55, -0.42, -0.45, 0, 0, s * -0.4);
  }
  // 頂上的補強條
  for (const z of [-0.5, -0.15, 0.2]) bx(b, M.sub, 0.9, 0.05, 0.1, 0, 0.47, z);
  // 2×2 發射筒：筒口、彈頭、紅色的封蓋環
  bx(b, M.dark, 0.78, 0.66, 0.04, 0, 0.02, 0.73);
  for (let i = 0; i < 4; i++) {
    const x = -0.2 + (i % 2) * 0.4,
      y = 0.18 - Math.floor(i / 2) * 0.34;
    cz(b, M.sub, 0.15, 0.06, x, y, 0.75, 18, 0.01);
    cz(b, M.dark, 0.12, 0.08, x, y, 0.75, 18);
    lathe(
      b,
      M.nose,
      [
        [0, 0],
        [0.1, 0],
        [0.1, 0.06],
        [0.07, 0.15],
        [0.02, 0.22],
        [0, 0.24],
      ],
      x,
      y,
      0.58,
      'z',
      14,
    );
    P(b, D.cyl(0.025, 0.025, 0.02, 8), glow, x, y, 0.83, HP, 0, 0);
  }
  // 頂上的感測器、後方的排氣格柵、掛架
  bx(b, M.dark, 0.26, 0.16, 0.34, 0, 0.53, 0.42);
  cz(b, M.dark, 0.08, 0.08, 0, 0.53, 0.62, 14);
  P(b, D.cyl(0.05, 0.05, 0.02, 12), mLamp(0xff6a8a, 1.0), 0, 0.53, 0.665, HP, 0, 0);
  fine(() => rod(b, M.dark, [0.3, 0.45, -0.6], [0.3, 0.85, -0.65], 0.015, 5));
  vents(b, M.dark, M.sub, 0.7, 0.6, 0, 0.02, -0.77, Math.PI, 6);
  P(b, D.box(0.6, 0.04, 0.03, 0.01), glow, 0, -0.3, 0.74);
  fine(() => {
    for (const s of [-1, 1]) {
      boltRow(b, M.steel, -0.3, 0.3, s * 0.38, 0.74, 4);
      handle(b, M.steel, 0.3, s * 0.48, 0.0, 0.3, s * HP, 0.06);
    }
  });
  bx(b, M.body, 0.4, 0.3, 0.4, -0.62, 0.0, -0.2);
  cx(b, M.dark, 0.17, 0.3, -0.88, 0.0, -0.2, 16, 0.02);
}
const HW = { hw_cannon: hwCannon, hw_flame: hwFlame, hw_pod: hwPod };
export function buildHwMesh(wk, color) {
  const g = new THREE.Group();
  const glb = providedModel('device/' + wk);
  if (glb) {
    g.add(glb);
    return g;
  }
  const b = new THREE.Group();
  g.add(b);
  (HW[wk] || hwCannon)(b, color);
  bakeAll(b, { ...TINT, cache: 'hw_' + wk });
  tagStyle(g);
  return g;
}

// 撿起的重武器：六角形的台座（固定夾具、四角的燈柱、發光的環）＋浮在上面的武器（item 節點轉動）
export function buildHwPick(wk, color) {
  const g = new THREE.Group();
  const M = {
    body: mStd(0x3a4048, { metalness: 0.55 }),
    sub: mStd(0x5a626c, { metalness: 0.5 }),
    dark: mStd(0x1e2226, { metalness: 0.6 }),
    yel: mStd(0xd8a628, { roughness: 0.55, metalness: 0.2 }),
  };
  const glow = mGlow(color);
  const b = new THREE.Group();
  g.add(b);
  cy(b, M.body, 0.85, 0.3, 0, 0.15, 0, 6, 0.05, 0.95);
  cy(b, M.dark, 0.72, 0.08, 0, 0.33, 0, 6, 0.02);
  P(b, D.cyl(0.6, 0.6, 0.03, 24), glow, 0, 0.38, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    hazard(
      b,
      M.yel,
      M.dark,
      0.7,
      0.08,
      0.03,
      Math.sin(a + Math.PI / 6) * 0.84,
      0.2,
      Math.cos(a + Math.PI / 6) * 0.84,
      a + Math.PI / 6,
      5,
    );
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const x = Math.sin(a) * 0.62,
      z = Math.cos(a) * 0.62;
    bx(b, M.sub, 0.16, 0.42, 0.16, x, 0.55, z, 0, a, 0);
    bx(b, M.dark, 0.24, 0.1, 0.12, x * 0.85, 0.74, z * 0.85, 0, a, 0);
    P(b, D.box(0.06, 0.2, 0.06, 0.01), glow, x * 1.12, 0.55, z * 1.12, 0, a, 0);
  }
  bakeAll(b, { ...TINT, cache: 'hw_pad' });
  const item = new THREE.Group();
  item.name = 'item';
  item.position.y = 1.3;
  item.add(buildHwMesh(wk, color));
  g.add(item);
  g.item = item;
  return g;
}
