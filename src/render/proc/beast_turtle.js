// 鱷龜型機獸（原創設計，2026-11-19；docs/beast-design.md，第 2 章的大 Boss）：格式與做法同獅型機獸（beast_lion.js）。
// 造型取真實鱷龜的特徵：三道稜狀的背甲（每片盾板一個往後的尖錐）、鋸齒狀的後緣、大而呈三角形的頭與鉤狀的喙、嘴裡一條發光的誘餌、
// 往外撐的粗短四肢、拖地的粗尾；背甲上一座低矮的雙管砲塔。大小不照自然界（真的鱷龜換算只有 3.7 m）：當 Boss，背甲長約 9 m。
// 四肢與尾巴的節沿用獅型的零件（壓短、放寬、往外撐）；區塊名稱和獅型相同（腰臀是背甲下的骨盆）。
import { LION_PARTS, assembler } from './beast_lion.js';
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
  STEEL = 7;
export const TURTLE_COLS = ['#b4ff3a!', '#0e1319', '#3a3d45', '#c8ccd3', '#ffb050!'];
const { J: LJ, flUpper, flFore, flMeta, paw, blThigh, blShin, blMeta, tailSeg } = LION_PARTS;

const T = {
  chest: [0, 3.0, 1.0],
  hips: [0, 2.6, -1.5],
  neck: [0, 2.9, 3.9],
  head: [0, 3.0, 5.3],
  jawL: [0, -0.35, 0.2],
  turret: [0, 5.2, -1.4],
  guns: [0, 5.85, -1.4],
  tail: [0, 2.5, -4.9],
};
const RIM = 3.0, // 背甲邊緣的高度
  BOT = 1.7; // 腹甲

// 背甲的截面：半寬 w、頂 top
const shellSec = (z, w, top) => {
  const h = top - RIM;
  return bodyRing(z, [
    [0, top],
    [0.35 * w, top - 0.08 * h],
    [0.7 * w, top - 0.38 * h],
    [0.94 * w, RIM + 0.3],
    [w, RIM],
    [0.9 * w, RIM - 0.4],
    [0.6 * w, BOT],
    [0, BOT],
  ]);
};
const shellRings = () =>
  [
    [-5.0, 1.5, 3.4],
    [-4.0, 3.1, 4.4],
    [-2.3, 4.1, 5.1],
    [-0.5, 4.4, 5.3],
    [1.4, 4.1, 5.0],
    [3.0, 3.2, 4.3],
    [4.2, 1.9, 3.5],
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
      [0, 5.1, -1.4],
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
function turret() {
  const [, y, z] = T.turret;
  return [
    lathe(
      MAIN,
      [0, y, z],
      [0, 1, 0],
      [
        [0, 0.9],
        [0.3, 0.9],
        [0.75, 0.6],
        [0.85, 0.3],
      ],
      12,
    ),
    box(SUB, [0, y + 0.55, z + 0.55], [0.5, 0.3, 0.3], null, 0.05),
    box(GLOW, [0, y + 0.55, z + 0.71], [0.26, 0.1, 0.03]),
    cyl(JOINT, [-0.95, T.guns[1], z], [0.95, T.guns[1], z], 0.2, 10),
  ];
}
function guns() {
  const [, y, z] = T.guns;
  return [
    box(SUB, [0.72, y, z - 0.1], [0.5, 0.56, 1.3], null, 0.08, true),
    cyl(GUN, [0.72, y, z + 0.5], [0.72, y, z + 2.2], 0.2, 10, true),
    cyl(STEEL, [0.72, y, z + 0.55], [0.72, y, z + 1.0], 0.24, 10, true),
    lathe(
      GUN,
      [0.72, y, z + 2.2],
      [0, 0, 1],
      [
        [0, 0.27],
        [0.3, 0.27],
        [0.36, 0.2],
      ],
      10,
      true,
    ),
    box(ACC, [0.72, y + 0.3, z - 0.1], [0.3, 0.06, 0.9], null, 0, true),
  ];
}
// 尾端：一根粗的尖錐（照獅型的尾端位置建，之後和尾巴一起平移）
function tailTip() {
  const local = [
    hullS(MAIN, [
      [0, 0.16, 0],
      [0.16, 0, 0],
      [0, -0.16, 0],
      [0, 0, -1.3],
    ]),
    hullS(SUB, [
      [0, 0.14, -0.1],
      [0.05, 0.14, -0.4],
      [0, 0.5, -0.5],
      [0, 0.12, -0.7],
    ]),
  ];
  return xf(local, [10, 0, 0], LJ.tail[5]);
}
// 尾巴每一節上面的稜刺（照獅型的尾巴位置建）
function tailSpike(k) {
  const a = LJ.tail[k],
    b = LJ.tail[k + 1];
  const c = vmul(vadd(a, b), 0.5);
  const r = 0.3 - k * 0.035;
  return hullS(SUB, [
    [0.1, c[1] + r, c[2] + 0.3],
    [0.1, c[1] + r, c[2] - 0.2],
    [0, c[1] + r + 0.5 - k * 0.06, c[2] - 0.35],
    [0, c[1] + r - 0.1, c[2] - 0.4],
  ]);
}

let DEF = null;
export function turtleDef() {
  if (DEF) return DEF;
  const { add, pair, done } = assembler();
  // 腿：以腳下的地面為中心壓短 LEG_Y、放寬加厚，再大幅往外撐（sh）；d 把肩／髖放到背甲下的關節座
  // 身體整個壓低 DOWN（龜是貼著地面的）、腿跟著更短；頭放大 HK
  const DOWN = { d: [0, -0.6, 0] },
    HK = [1.25, 1.25, 1.2];
  const LEG_Y = 0.435,
    SH = 0.5;
  const FL = {
    k: [1.9, LEG_Y, 1.6],
    about: [LJ.S[0], 0, LJ.S[2]],
    d: [2.9 - LJ.S[0] + LJ.S[1] * LEG_Y * SH, 0, 3.0 - LJ.S[2]],
    sh: SH,
  };
  const BL = {
    k: [1.9, LEG_Y, 1.5],
    about: [LJ.H[0], 0, LJ.H[2]],
    d: [2.7 - LJ.H[0] + LJ.H[1] * LEG_Y * SH, 0, -3.2 - LJ.H[2]],
    sh: SH,
  };
  const TAIL = {
    k: [1.9, 1, 1],
    about: LJ.tail[0],
    d: [T.tail[0] - LJ.tail[0][0], T.tail[1] - LJ.tail[0][1] + DOWN.d[1], T.tail[2] - LJ.tail[0][2]],
  };
  add('chest', null, T.chest, shell(), DOWN);
  add('hips', 'chest', T.hips, hips(), DOWN);
  add('neck', 'chest', T.neck, neck(), DOWN);
  add('head', 'neck', T.head, moved(scaled(headLocal(), HK), T.head), DOWN);
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
  pair('fl_upper', 'fr_upper', 'chest', 'chest', LJ.S, flUpper(), FL);
  pair('fl_fore', 'fr_fore', 'fl_upper', 'fr_upper', LJ.E, flFore(), FL);
  pair('fl_meta', 'fr_meta', 'fl_fore', 'fr_fore', LJ.W, flMeta(), FL);
  pair('fl_paw', 'fr_paw', 'fl_meta', 'fr_meta', LJ.K, paw(LJ.K), FL);
  pair('bl_thigh', 'br_thigh', 'hips', 'hips', LJ.H, blThigh(), BL);
  pair('bl_shin', 'br_shin', 'bl_thigh', 'br_thigh', LJ.N, blShin(), BL);
  pair('bl_meta', 'br_meta', 'bl_shin', 'br_shin', LJ.T, blMeta(), BL);
  pair('bl_paw', 'br_paw', 'bl_meta', 'br_meta', LJ.A, paw(LJ.A), BL);
  for (let k = 0; k < 5; k++)
    add('tail' + (k + 1), k ? 'tail' + k : 'hips', LJ.tail[k], [...tailSeg(k), tailSpike(k)], TAIL);
  add('tail_tip', 'tail5', LJ.tail[5], tailTip(), TAIL);
  DEF = done(TURTLE_COLS, 'turtle');
  return DEF;
}
