// 鱷龜型機獸（原創設計，2026-11-19；docs/beast-design.md，第 2 章的大 Boss）：格式與做法同獅型機獸（beast_lion.js）。
// 造型取真實鱷龜的特徵：三道稜狀的背甲（每片盾板一個往後的尖錐）、鋸齒狀的後緣、大而呈三角形的頭與鉤狀的喙、嘴裡一條發光的誘餌、
// 往外撐的粗短四肢、拖地的粗尾；背甲上一座低矮的雙管砲塔。大小不照自然界（真的鱷龜換算只有 3.7 m）：當 Boss，背甲長約 9 m。
// 四肢與尾巴在 legs_turtle.js 原生建模（不沿用別隻的零件）；區塊名稱和獅型相同（腰臀是背甲下的骨盆）。
import { assembler } from './beast_lion.js';
import {
  TURTLE_LEG,
  turtleBlMeta,
  turtleBlShin,
  turtleBlThigh,
  turtleFlFore,
  turtleFlMeta,
  turtleFlUpper,
  turtlePaw,
  turtleTailSeg,
  turtleTailTip,
} from './legs_turtle.js';
import {
  ball,
  bodyRing,
  box,
  cyl,
  hull,
  hullS,
  lathe,
  loft,
  moved,
  oct,
  panel,
  scaled,
  tubeRings,
  vadd,
  vcross,
  vdot,
  vmul,
  vnorm,
  vsub,
  xf,
} from './beast_kit.js';

const MAIN = 0,
  SUB = 1,
  JOINT = 2,
  ACC = 3,
  GLOW = 4,
  GLASS = 5,
  GUN = 6,
  STEEL = 7,
  WAR = 9; // 魚雷與深水炸彈的彈頭
export const TURTLE_COLS = ['#b4ff3a!', '#0e1319', '#3a3d45', '#c8ccd3', '#ffb050!', '#d8342c'];
const G = TURTLE_LEG;

const T = {
  chest: [0, 3.0, 1.0],
  hips: [0, 2.6, -1.5],
  neck: [0, 2.9, 3.9],
  neck2: [0, 2.95, 4.9], // 伸縮的內頸（沿前後滑動）
  head: [0, 3.0, 5.3],
  jawL: [0, -0.35, 0.2],
  turret: [0, 6.6, -1.4],
  guns: [0, 7.25, -1.4],
  tail: [0, 2.5, -4.9],
};
const RIM = 3.0, // 背甲邊緣的高度
  BOT = 1.7; // 腹甲

// 背甲的截面：半寬 w、頂 top
const shellSec = (z, w, top) => {
  const h = top - RIM;
  return bodyRing(z, [
    [0, top],
    [0.38 * w, top - 0.07 * h],
    [0.74 * w, top - 0.34 * h],
    [0.94 * w, RIM + 0.3],
    [w, RIM],
    [0.9 * w, RIM - 0.4],
    [0.6 * w, BOT],
    [0, BOT],
  ]);
};
const shellRings = () =>
  [
    [-5.0, 1.5, 3.5],
    [-4.0, 3.1, 5.1],
    [-2.3, 4.1, 6.4],
    [-0.5, 4.4, 6.8],
    [1.4, 4.1, 6.3],
    [3.0, 3.2, 5.0],
    [4.2, 1.9, 3.7],
  ].map(([z, w, top]) => shellSec(z, w, top));
// 盾板：貼在背甲第 i 段、第 j0～j1 點之間的一片上，中央一個往後的尖錐（高 h）
function scute(slot, R, i, j0, j1, h, mir) {
  const m = R[0].length;
  const g = (a, b) => R[a][((b % m) + m) % m];
  const q = [g(i, j0), g(i, j1), g(i + 1, j1), g(i + 1, j0)];
  const cen = vmul(q.reduce(vadd, [0, 0, 0]), 0.25);
  let n = vnorm(vcross(vsub(q[1], q[0]), vsub(q[3], q[0])));
  if (vdot(n, vsub(cen, [0, 2.4, cen[2]])) < 0) n = vmul(n, -1);
  const inset = (p, k) => vadd(cen, vmul(vsub(p, cen), k));
  return hull(
    slot,
    [
      ...q.map((p) => vadd(inset(p, 0.9), vmul(n, 0.08))),
      ...q.map((p) => vadd(inset(p, 0.9), vmul(n, -0.12))),
      ...q.map((p) => vadd(inset(p, 0.55), vmul(n, h * 0.35))),
      vadd(vadd(cen, vmul(n, h)), [0, 0, -h * 0.45]),
    ],
    mir,
  );
}

function shell() {
  const R = shellRings();
  const m = { mir: true };
  const out = [loft(JOINT, R)];
  for (let i = 0; i < 6; i++) {
    const k = 1 - Math.abs(i - 2.5) * 0.14;
    if (i !== 2)
      out.push(scute(MAIN, R, i, -1, 1, 1.0 * k)); // 中央的稜（砲塔的位置空下來）
    else out.push(panel(MAIN, R, i, i + 1, -1, 1, { t: 0.14, ch: 0.08 }));
    out.push(scute(MAIN, R, i, 1, 2, 0.8 * k, true)); // 兩側的稜
    out.push(scute(SUB, R, i, 2, 3, 0.45 * k, true));
    out.push(panel(MAIN, R, i, i + 1, 3, 4, { ...m, t: 0.16, ch: 0.07 })); // 邊緣的盾板
    out.push(panel(ACC, R, i + 0.3, i + 0.7, 4, 4.8, { ...m, t: 0.12, gap: 0.02, ch: 0.03 }));
    out.push(panel(SUB, R, i, i + 1, 5, 7, { ...m, t: 0.1 })); // 腹甲
  }
  // 後緣的鋸齒
  for (const [x, z, s] of [
    [0, -5.0, 1],
    [1.1, -4.85, 0.9],
    [2.2, -4.45, 0.8],
    [3.1, -3.8, 0.7],
  ])
    out.push(
      hull(
        MAIN,
        [
          [x - 0.45 * s, RIM + 0.25, z + 0.5],
          [x + 0.45 * s, RIM + 0.25, z + 0.5],
          [x - 0.4 * s, RIM - 0.2, z + 0.5],
          [x + 0.4 * s, RIM - 0.2, z + 0.5],
          [x * 1.12, RIM + 0.1, z - 0.9 * s],
        ],
        x > 0,
      ),
    );
  out.push(
    // 肩與髖的關節座（在背甲下）
    cyl(JOINT, [1.9, 2.95, 3.0], [2.9, 2.95, 3.0], 0.75, 12, true),
    // 頸的開口：一圈護環
    lathe(
      SUB,
      [0, 2.75, 4.0],
      [0, 0.05, 1],
      [
        [0, 1.45],
        [0.35, 1.45],
        [0.5, 1.25],
      ],
      12,
    ),
    // 砲塔的座圈
    lathe(
      SUB,
      [0, 6.5, -1.4],
      [0, 1, 0],
      [
        [0, 1.0],
        [0.2, 1.0],
        [0.3, 0.85],
      ],
      14,
    ),
    // 兩側的排氣口
    ...[-1.0, -0.5, 0].map((z) =>
      box(GLASS, [4.3, RIM + 0.05, z - 0.5], [0.12, 0.32, 0.3], [0, 4, 0], 0, true),
    ),
  );
  return out;
}

// 背甲下的骨盆
function hips() {
  return [
    hullS(SUB, [
      [0, 2.9, -1.6],
      [1.6, 2.9, -1.7],
      [1.9, 2.8, -3.2],
      [1.2, 2.8, -4.6],
      [0, 2.9, -4.9],
      [1.4, 1.75, -1.8],
      [1.6, 1.75, -3.2],
      [0.9, 1.9, -4.5],
      [0, 1.75, -1.8],
      [0, 1.95, -4.7],
    ]),
    cyl(JOINT, [1.7, 2.9, -3.2], [2.7, 2.9, -3.2], 0.75, 12, true),
    ball(JOINT, T.tail, 0.6, 10),
  ];
}

function neck() {
  const R = tubeRings(
    [
      { p: [0, 2.8, 3.5], prof: oct(1.05, 0.95, 0.95) },
      { p: [0, 2.9, 4.4], prof: oct(1.0, 0.92, 0.92) },
      { p: [0, 3.0, 5.25], prof: oct(1.0, 0.9, 0.9) },
    ],
    [0, 1, 0],
  );
  const out = [loft(JOINT, R), panel(MAIN, R, 0.1, 1.9, 7.5, 9, { mir: true, t: 0.12 })];
  // 伸縮的環節
  for (const z of [4.1, 4.5, 4.9])
    out.push(
      lathe(
        SUB,
        [0, 2.9 + (z - 4.4) * 0.11, z],
        [0, 0.11, 1],
        [
          [-0.07, 1.08],
          [0.07, 1.08],
        ],
        10,
      ),
    );
  return out;
}

// 伸縮的內頸：平時藏在外頸裡，咬合時整節往前滑出去（動作的 ext），縮殼時往後收
function neck2() {
  const R = tubeRings(
    [
      { p: [0, 2.72, 2.2], prof: oct(0.82, 0.76, 0.76) },
      { p: [0, 2.98, 5.2], prof: oct(0.82, 0.76, 0.76) },
    ],
    [0, 1, 0],
  );
  const out = [loft(SUB, R)];
  for (const z of [2.8, 3.4, 4.0, 4.6])
    out.push(
      lathe(
        JOINT,
        [0, 2.72 + (z - 2.2) * 0.087, z],
        [0, 0.087, 1],
        [
          [-0.06, 0.9],
          [0.06, 0.9],
        ],
        10,
      ),
    );
  return out;
}

// 頭（頭自己的座標：原點＝後腦的轉軸、+z 往前）：後面寬（咬肌）、往前收成鉤狀的喙
function headLocal() {
  const out = [
    ball(JOINT, [0, -0.05, -0.1], 0.85, 10),
    hullS(MAIN, [
      [0, 0.95, -0.2],
      [0, 1.0, 0.8],
      [0, 0.72, 1.9],
      [0.9, 0.82, -0.2],
      [1.0, 0.82, 0.7],
      [0.6, 0.62, 1.9],
      [1.38, 0.1, -0.1],
      [1.32, 0.15, 0.9],
      [0.76, 0.15, 2.0],
      [1.1, -0.5, 0],
      [1.05, -0.45, 1.0],
      [0.7, -0.35, 2.0],
      [0, -0.55, -0.1],
    ]),
    // 上喙：往前下方鉤
    hullS(MAIN, [
      [0, 0.72, 1.9],
      [0.6, 0.62, 1.9],
      [0.76, 0.15, 2.0],
      [0.7, -0.35, 2.0],
      [0, 0.5, 2.7],
      [0.34, 0.34, 2.7],
      [0.38, -0.2, 2.75],
      [0, 0.12, 3.08],
      [0, -0.5, 3.02],
      [0.14, -0.4, 2.95],
      [0, -0.35, 2.6],
    ]),
    // 喙尖（鋼）
    hullS(STEEL, [
      [0, 0.0, 3.1],
      [0.16, -0.3, 2.96],
      [0, -1.0, 2.98],
      [0, -0.45, 2.72],
      [0.1, -0.5, 2.85],
    ]),
    // 喙緣的刃
    hull(
      STEEL,
      [
        [0.72, -0.3, 2.0],
        [0.76, -0.3, 1.2],
        [0.72, -0.5, 2.0],
        [0.76, -0.52, 1.2],
        [0.42, -0.25, 2.72],
        [0.42, -0.45, 2.7],
        [0.6, -0.4, 1.6],
      ],
      true,
    ),
    // 眼窩與眼：頭的兩側偏前
    hull(
      GLASS,
      [
        [0.78, 0.55, 1.78],
        [0.86, 0.3, 1.84],
        [1.16, 0.62, 1.15],
        [1.26, 0.36, 1.2],
        [0.9, 0.4, 1.3],
      ],
      true,
    ),
    hull(
      GLOW,
      [
        [0.86, 0.5, 1.72],
        [0.92, 0.36, 1.76],
        [1.17, 0.56, 1.27],
        [1.24, 0.42, 1.3],
        [1.1, 0.46, 1.55],
        [0.95, 0.42, 1.4],
      ],
      true,
    ),
    // 眉脊
    hull(
      MAIN,
      [
        [0.5, 0.78, 1.95],
        [0.82, 0.62, 1.85],
        [1.25, 0.7, 1.05],
        [1.05, 0.95, 0.9],
        [0.55, 1.02, 1.2],
        [1.2, 0.6, 1.1],
        [0.84, 0.56, 1.82],
      ],
      true,
    ),
    // 兩頰的突刺
    hull(
      SUB,
      [
        [1.3, 0.3, 0.5],
        [1.3, -0.2, 0.5],
        [1.25, 0.05, -0.05],
        [1.2, 0.05, 0.8],
        [1.95, -0.1, -0.5],
      ],
      true,
    ),
  ];
  // 頭頂的瘤刺（兩排各三顆）
  for (let k = 0; k < 3; k++)
    out.push(
      hull(
        SUB,
        [
          [0.3, 0.95, 0.75 - k * 0.45],
          [0.7, 0.9, 0.75 - k * 0.45],
          [0.3, 0.95, 0.4 - k * 0.45],
          [0.7, 0.88, 0.4 - k * 0.45],
          [0.52, 1.3, 0.4 - k * 0.45],
        ],
        true,
      ),
    );
  // 鼻孔
  out.push(box(GLASS, [0.14, 0.36, 2.86], [0.1, 0.07, 0.12], [-25, 0, 0], 0, true));
  return out;
}
function jawLocal() {
  return [
    hullS(MAIN, [
      [1.0, -0.5, 0.1],
      [1.05, -1.02, 0.3],
      [0, -1.18, 0.3],
      [0.7, -0.46, 2.0],
      [0.7, -0.96, 1.9],
      [0, -1.02, 2.0],
      [0, -0.55, 2.74],
      [0.25, -0.5, 2.6],
      [0, -0.9, 2.6],
      [0, -0.5, 0.1],
    ]),
    // 下喙尖
    hullS(STEEL, [
      [0, -0.52, 2.78],
      [0.14, -0.52, 2.62],
      [0, -0.2, 2.82],
      [0, -0.62, 2.6],
    ]),
    hullS(ACC, [
      [0, -1.0, 2.05],
      [0.5, -0.97, 1.95],
      [0.5, -1.02, 1.2],
      [0, -1.1, 1.2],
      [0, -0.9, 1.6],
    ]),
    cyl(JOINT, [0.95, T.jawL[1], T.jawL[2]], [1.3, T.jawL[1], T.jawL[2]], 0.28, 10, true),
    // 嘴裡的誘餌：一條發光的細舌
    cyl(GLOW, [0, -0.5, 1.2], [0, -0.38, 1.75], 0.07, 6),
    ball(GLOW, [0, -0.34, 1.82], 0.13, 8),
    box(GLASS, [0, -0.52, 1.2], [1.2, 0.06, 1.6]),
  ];
}

// 背甲上的砲塔：低矮的座（偏航）＋雙管短砲（俯仰）
// ---------- 外掛武器一（實彈）：背甲頂上的雙管重機砲 ----------
// 低矮的圓形砲座＋多角的砲郭；左右各一支粗短的砲：開孔的冷卻套、三段式砲口制退器、外側的彈鏈箱
function turret() {
  const [, y, z] = T.turret;
  const yg = T.guns[1];
  const p = (x, dy, dz) => [x, y + dy, z + dz];
  return [
    lathe(
      JOINT,
      [0, y - 0.1, z],
      [0, 1, 0],
      [
        [0, 1.45],
        [0.2, 1.45],
        [0.32, 1.2],
      ],
      16,
    ),
    // 砲郭：前面是斜的防盾，後面收窄
    hullS(MAIN, [
      p(0.75, 0.2, 1.2),
      p(1.25, 0.2, 0.3),
      p(1.2, 0.2, -1.0),
      p(0.7, 0.2, -1.5),
      p(0.55, 0.95, 0.75),
      p(0.95, 1.2, 0.1),
      p(0.9, 1.2, -0.8),
      p(0.5, 1.0, -1.35),
    ]),
    box(ACC, [0, y + 1.22, z - 0.35], [0.5, 0.05, 0.9]),
    // 觀瞄窗
    box(SUB, [0, y + 0.72, z + 1.02], [0.7, 0.3, 0.2], [-32, 0, 0], 0.04),
    box(GLOW, [0, y + 0.74, z + 1.13], [0.4, 0.1, 0.04], [-32, 0, 0]),
    // 耳軸與兩側的彈鏈箱
    cyl(JOINT, [-1.5, yg, z], [1.5, yg, z], 0.24, 14),
    box(SUB, [1.5, y + 0.45, z - 0.55], [0.5, 0.8, 1.1], null, 0.08, true),
    ...[-0.85, -0.55, -0.25].map((dz) => box(GUN, [1.76, y + 0.5, z + dz], [0.03, 0.5, 0.16], null, 0, true)),
    // 後方的排殼斜槽
    hull(
      GUN,
      [
        p(0.3, 0.3, -1.4),
        p(0.7, 0.3, -1.4),
        p(0.3, 0.7, -1.4),
        p(0.7, 0.7, -1.4),
        p(0.35, 0.1, -1.9),
        p(0.65, 0.1, -1.9),
        p(0.35, 0.3, -1.95),
        p(0.65, 0.3, -1.95),
      ],
      true,
    ),
  ];
}
function guns() {
  const [, y, z] = T.guns;
  const X = 0.78;
  const out = [
    box(SUB, [0, y, z - 0.1], [1.0, 0.44, 1.0], null, 0.07),
    // 機匣
    box(GUN, [X, y, z - 0.2], [0.6, 0.66, 1.6], null, 0.09, true),
    box(MAIN, [X, y + 0.36, z - 0.1], [0.46, 0.14, 1.1], null, 0.04, true),
    // 冷卻套（八角）與砲管
    lathe(
      SUB,
      [X, y, z + 0.6],
      [0, 0, 1],
      [
        [0, 0.36],
        [1.5, 0.33],
        [1.56, 0.26],
      ],
      8,
      true,
    ),
    cyl(GUN, [X, y, z + 2.1], [X, y, z + 2.9], 0.2, 12, true),
    // 砲口制退器：三道環
    ...[2.9, 3.12, 3.34].map((dz) =>
      lathe(
        GUN,
        [X, y, z + dz],
        [0, 0, 1],
        [
          [0, 0.3],
          [0.13, 0.3],
          [0.16, 0.2],
          [0.22, 0.2],
        ],
        12,
        true,
      ),
    ),
    cyl(STEEL, [X, y, z + 0.5], [X, y, z + 0.62], 0.4, 12, true),
  ];
  // 冷卻套上的開孔（上、外側各一排）
  for (const dz of [0.9, 1.2, 1.5, 1.8]) {
    out.push(box(GLASS, [X, y + 0.33, z + dz], [0.12, 0.04, 0.18], null, 0, true));
    out.push(box(GLASS, [X + 0.33, y, z + dz], [0.04, 0.12, 0.18], null, 0, true));
  }
  return out;
}

// ---------- 外掛武器二（爆發）：背甲兩側的魚雷／深水炸彈架（左；右＝鏡像）----------
// 斜掛在背甲側坡上的托架：前段兩支並排的魚雷管（管口露出紅色彈頭）、後段一條滑軌上三顆深水炸彈的圓桶
const RACK = [3.55, 5.05, 0.2];
function rack() {
  const L = [
    // 托架的底板與兩道肋
    box(SUB, [0, 0.1, -0.2], [1.5, 0.2, 4.2], null, 0.06),
    box(JOINT, [0, 0.28, 1.5], [1.6, 0.26, 0.3], null, 0.05),
    box(JOINT, [0, 0.28, 0.1], [1.6, 0.26, 0.3], null, 0.05),
    // 魚雷管（兩支）
    ...[-0.38, 0.38].flatMap((x) => [
      lathe(
        MAIN,
        [x, 0.66, -0.2],
        [0, 0, 1],
        [
          [0, 0.3],
          [0.1, 0.36],
          [2.2, 0.36],
          [2.3, 0.4],
          [2.5, 0.4],
        ],
        12,
      ),
      lathe(
        WAR,
        [x, 0.66, 2.2],
        [0, 0, 1],
        [
          [0, 0.26],
          [0.3, 0.25],
          [0.5, 0.16],
          [0.58, 0.04],
        ],
        10,
      ),
      cyl(GUN, [x, 0.66, -0.34], [x, 0.66, -0.2], 0.24, 10),
    ]),
    box(ACC, [0, 1.04, 1.0], [0.9, 0.05, 1.6]),
    box(MAIN, [0, 0.96, 1.0], [1.0, 0.12, 2.0], null, 0.04),
    // 深水炸彈的滑軌與三顆圓桶（軸沿左右）
    box(GUN, [0.62, 0.3, -1.5], [0.1, 0.2, 1.7]),
    box(GUN, [-0.62, 0.3, -1.5], [0.1, 0.2, 1.7]),
    ...[-0.85, -1.5, -2.15].flatMap((zz) => [
      cyl(MAIN, [-0.56, 0.68, zz], [0.56, 0.68, zz], 0.3, 12),
      cyl(WAR, [-0.6, 0.68, zz], [-0.56, 0.68, zz], 0.2, 10),
      cyl(WAR, [0.56, 0.68, zz], [0.6, 0.68, zz], 0.2, 10),
      cyl(ACC, [-0.1, 0.68, zz], [0.1, 0.68, zz], 0.32, 12),
    ]),
    // 尾端的擋板
    box(SUB, [0, 0.55, -2.55], [1.4, 0.7, 0.1], null, 0.03),
  ];
  return xf(L, [0, 0, -34], RACK);
}

let DEF = null;
export function turtleDef() {
  if (DEF) return DEF;
  const { add, pair, done } = assembler();
  // 身體整個壓低 DOWN（龜是貼著地面的；只有平移）、頭的大小 HK（等比）；四肢與尾巴在 legs_turtle.js 原生建模
  const DOWN = { d: [0, -0.6, 0] },
    HK = [0.95, 0.95, 0.95];
  add('chest', null, T.chest, shell(), DOWN);
  add('hips', 'chest', T.hips, hips(), DOWN);
  add('neck', 'chest', T.neck, neck(), DOWN);
  add('neck2', 'neck', T.neck2, neck2(), DOWN);
  add('head', 'neck2', T.head, moved(scaled(headLocal(), HK), T.head), DOWN);
  add(
    'jaw',
    'head',
    vadd(
      T.head,
      T.jawL.map((v, i) => v * HK[i]),
    ),
    moved(scaled(jawLocal(), HK), T.head),
    DOWN,
  );
  add('turret', 'chest', T.turret, turret(), DOWN);
  add('guns', 'turret', T.guns, guns(), DOWN);
  pair('rack_l', 'rack_r', 'chest', 'chest', RACK, rack(), DOWN);
  pair('fl_upper', 'fr_upper', 'chest', 'chest', G.S, turtleFlUpper());
  pair('fl_fore', 'fr_fore', 'fl_upper', 'fr_upper', G.E, turtleFlFore());
  pair('fl_meta', 'fr_meta', 'fl_fore', 'fr_fore', G.W, turtleFlMeta());
  pair('fl_paw', 'fr_paw', 'fl_meta', 'fr_meta', G.K, turtlePaw(G.K));
  pair('bl_thigh', 'br_thigh', 'hips', 'hips', G.H, turtleBlThigh());
  pair('bl_shin', 'br_shin', 'bl_thigh', 'br_thigh', G.N, turtleBlShin());
  pair('bl_meta', 'br_meta', 'bl_shin', 'br_shin', G.Tk, turtleBlMeta());
  pair('bl_paw', 'br_paw', 'bl_meta', 'br_meta', G.A, turtlePaw(G.A));
  for (let k = 0; k < 5; k++) add('tail' + (k + 1), k ? 'tail' + k : 'hips', G.tail[k], turtleTailSeg(k));
  add('tail_tip', 'tail5', G.tail[5], turtleTailTip());
  DEF = done(TURTLE_COLS, 'turtle');
  return DEF;
}
