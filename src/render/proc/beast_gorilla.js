// 猩猩型機獸（原創設計，2026-11-19；docs/beast-design.md，第 4 章 Lattice-9／舊宇宙港的大 Boss）：格式與做法同獅型機獸（beast_lion.js）。
// 造型取真實銀背大猩猩的特徵：指節著地、前高後低的斜背、極寬的肩與厚實的胸、小的臀、幾乎沒有的頸、頭頂高聳的矢狀嵴、厚重的眉骨、
// 扁平的臉與寬鼻、巨大的下顎；下背一片亮鋼色的「銀背」。配合多層平台的主題：背上一對跳躍用的噴射筒、胸前兩面鼓板（搥胸）、前臂的絞盤與鉤。
// 大小照自然界的比例（銀背指節著地的肩高約 1.25 m → 約 7 m、站立約 9.5 m）。所有部位各自建模（四肢在 legs_gorilla.js）；沒有尾巴、沒有砲塔。
import { LION_PARTS, assembler } from './beast_lion.js';
import {
  GORILLA_LEG,
  gorillaBlMeta,
  gorillaBlShin,
  gorillaBlThigh,
  gorillaFist,
  gorillaFlFore,
  gorillaFlMeta,
  gorillaFlUpper,
  gorillaFoot,
} from './legs_gorilla.js';
import { ball, box, cyl, hull, hullS, lathe, loft, moved, oct, panel, tubeRings, vadd } from './beast_kit.js';

const MAIN = 0,
  SUB = 1,
  JOINT = 2,
  ACC = 3,
  GLOW = 4,
  GLASS = 5,
  GUN = 6,
  STEEL = 7,
  BURN = 8;
export const GORILLA_COLS = ['#ffd23a!', '#0e1319', '#3a3d45', '#c8ccd3', '#48d0ff!'];
const { sec } = LION_PARTS; // 只用身體截面的輪廓工具
// 噴射筒（這隻自己的造型）：粗短的筒身、兩道箍、筒口一圈亮鋼與裡面的火光
const jet = (c, dir, r, len, mir) => [
  lathe(
    GUN,
    c,
    dir,
    [
      [0, r * 0.85],
      [len * 0.15, r],
      [len * 0.3, r],
      [len * 0.33, r * 1.1],
      [len * 0.4, r * 1.1],
      [len * 0.43, r],
      [len * 0.9, r],
    ],
    12,
    mir,
  ),
  lathe(
    STEEL,
    c,
    dir,
    [
      [len * 0.9, r * 1.12],
      [len, r * 1.12],
      [len * 1.02, r * 0.95],
    ],
    12,
    mir,
  ),
  lathe(
    BURN,
    c,
    dir,
    [
      [len * 0.98, r * 0.86],
      [len * 1.04, r * 0.8],
    ],
    12,
    mir,
  ),
];
const G = GORILLA_LEG;

const T = {
  chest: [0, 6.2, 1.2],
  hips: [0, 5.0, -0.3],
  neck: [0, 6.9, 2.6],
  head: [0, 7.15, 3.1],
  jawL: [0, -0.5, 0.1],
};

function chest() {
  const R = [
    sec(-0.3, 2.3, 6.5, 3.6),
    sec(1.0, 2.9, 7.5, 3.9),
    sec(2.0, 3.0, 7.85, 4.3),
    sec(2.9, 2.3, 7.35, 4.9),
    sec(3.4, 1.4, 6.8, 5.4),
  ];
  const m = { mir: true };
  return [
    loft(JOINT, R),
    // 背與斜方肌的厚甲
    panel(MAIN, R, 0, 1, 0, 2, { ...m, t: 0.16 }),
    panel(MAIN, R, 1, 3, 0, 2, { ...m, t: 0.2 }),
    panel(MAIN, R, 3, 4, 0, 2.5, { ...m, t: 0.14 }),
    panel(MAIN, R, 1.15, 2.85, 0.3, 1.7, { ...m, t: 0.4, sink: -0.14, ch: 0.1 }),
    panel(SUB, R, 0, 3, 2, 4, { ...m, t: 0.09 }),
    // 胸肌：兩大片板，各一面鼓板（搥胸）
    panel(MAIN, R, 1.05, 3.0, 4.1, 6, { ...m, t: 0.22, ch: 0.1 }),
    lathe(
      GUN,
      [1.15, 4.35, 2.05],
      [0.25, -1, 0.35],
      [
        [0, 0.7],
        [0.22, 0.7],
        [0.3, 0.55],
      ],
      14,
      true,
    ),
    lathe(
      ACC,
      [1.215, 4.07, 2.14],
      [0.25, -1, 0.35],
      [
        [0, 0.48],
        [0.06, 0.48],
        [0.1, 0.3],
      ],
      12,
      true,
    ),
    // 胸骨的反應爐縫
    box(BURN, [0, 4.4, 2.6], [0.22, 0.1, 1.5], [-22, 0, 0]),
    box(GUN, [0, 4.44, 2.6], [0.4, 0.12, 1.7], [-22, 0, 0], 0.03),
    // 腹（露出骨架）
    ...[0.2, 0.8].map((z) => box(SUB, [0, 3.75, z], [3.2, 0.2, 0.2], null, 0.05)),
    cyl(GUN, [0.9, 3.7, -0.2], [0.9, 3.9, 1.2], 0.15, 8, true),
    // 肩關節的座
    cyl(JOINT, [2.2, G.S[1], G.S[2]], [3.2, G.S[1], G.S[2]], 0.95, 14, true),
    // 背上的噴射筒（跳躍用）：一對，往後下方
    ...jet([1.15, 7.3, 0.6], [0.12, -0.55, -1], 0.5, 1.5, true),
    hull(
      MAIN,
      [
        [0.55, 7.75, 1.6],
        [1.75, 7.65, 1.6],
        [1.8, 7.3, 0.0],
        [0.5, 7.4, 0.0],
        [0.6, 7.2, 1.5],
        [1.7, 7.1, 1.5],
        [1.15, 7.95, 0.9],
      ],
      true,
    ),
    box(SUB, [0, 7.55, 0.9], [1.0, 0.4, 1.3], null, 0.08),
  ];
}

function hips() {
  const R = [
    sec(-0.3, 2.2, 6.4, 3.6, 0.95),
    sec(-1.2, 2.0, 5.8, 3.3),
    sec(-2.2, 1.9, 5.2, 3.0),
    sec(-3.0, 1.5, 4.6, 3.2),
    sec(-3.5, 0.9, 4.2, 3.5),
  ];
  const m = { mir: true };
  return [
    loft(JOINT, R),
    // 銀背：下背一整片亮鋼色
    panel(STEEL, R, 0.05, 2, 0, 2.6, { ...m, t: 0.18, ch: 0.08 }),
    panel(STEEL, R, 2, 3.2, 0, 2.4, { ...m, t: 0.15, ch: 0.07 }),
    panel(MAIN, R, 3.2, 4, 0, 3, { ...m, t: 0.12 }),
    panel(SUB, R, 0.1, 3, 2.7, 4.5, { ...m, t: 0.09 }),
    panel(SUB, R, 1, 3.5, 4.6, 6, { ...m, t: 0.09 }),
    // 腰的肋環
    ...[-0.6, -0.95].map((z) => box(SUB, [2.05, 4.9, z], [0.14, 1.5, 0.14], [0, 0, 5], 0.04, true)),
    cyl(JOINT, [0.9, G.H[1], G.H[2]], [1.75, G.H[1], G.H[2]], 0.85, 14, true),
  ];
}

// 頸：幾乎沒有，是一圈斜方肌的厚環
function neck() {
  const R = tubeRings(
    [
      { p: [0, 6.55, 2.3], prof: oct(1.6, 1.3, 1.2) },
      { p: [0, 7.05, 3.0], prof: oct(1.35, 1.15, 1.1) },
    ],
    [0, 1, 0],
  );
  return [
    loft(JOINT, R),
    panel(MAIN, R, 0, 1, 6.6, 9.4, { t: 0.16 }),
    panel(SUB, R, 0, 1, 1.4, 2.6, { mir: true, t: 0.1 }),
  ];
}

// 頭（頭自己的座標：原點＝後腦的轉軸、+z 往前）
function headLocal() {
  const out = [
    ball(JOINT, [0, -0.1, -0.2], 0.9, 10),
    // 顱
    hullS(MAIN, [
      [0, 1.3, -0.6],
      [0, 1.5, 0.1],
      [0, 1.0, 0.8],
      [0.8, 1.05, -0.5],
      [0.9, 1.1, 0.2],
      [0.8, 0.8, 0.85],
      [1.05, 0.2, -0.4],
      [1.1, 0.2, 0.5],
      [0.9, 0.1, 0.95],
      [0.9, -0.6, -0.2],
      [0.95, -0.55, 0.6],
      [0.8, -0.45, 1.0],
      [0, -0.7, -0.3],
    ]),
    // 矢狀嵴：頭頂往後高起的一道
    hullS(SUB, [
      [0, 1.5, 0.35],
      [0.15, 1.3, 0.25],
      [0, 2.0, -0.5],
      [0.17, 1.45, -0.5],
      [0, 1.75, -1.05],
      [0.15, 1.2, -0.95],
      [0, 1.2, 0.75],
    ]),
    // 眉骨：橫過整個額頭的厚梁
    hullS(MAIN, [
      [0, 1.02, 1.0],
      [0.95, 0.94, 0.85],
      [1.08, 0.7, 0.6],
      [0, 0.72, 1.28],
      [0.9, 0.64, 1.12],
      [0, 0.56, 1.22],
      [0.9, 0.5, 1.06],
      [1.02, 0.92, 0.4],
    ]),
    // 眼：深陷在眉骨下
    hull(
      GLASS,
      [
        [0.24, 0.56, 1.13],
        [0.26, 0.34, 1.15],
        [0.82, 0.5, 1.02],
        [0.82, 0.32, 1.04],
        [0.5, 0.45, 0.85],
      ],
      true,
    ),
    hull(
      GLOW,
      [
        [0.36, 0.5, 1.15],
        [0.38, 0.4, 1.16],
        [0.7, 0.47, 1.07],
        [0.7, 0.38, 1.08],
        [0.53, 0.44, 1.14],
        [0.53, 0.44, 0.95],
      ],
      true,
    ),
    // 臉與吻：短而往前突
    hullS(MAIN, [
      [0, 0.4, 1.0],
      [0.6, 0.3, 0.95],
      [0.75, -0.2, 0.9],
      [0.7, -0.6, 0.9],
      [0, 0.2, 1.7],
      [0.45, 0.1, 1.65],
      [0.6, -0.25, 1.75],
      [0.58, -0.6, 1.7],
      [0, -0.6, 1.85],
      [0, -0.15, 1.9],
    ]),
    // 寬鼻
    box(SUB, [0, 0.02, 1.84], [0.74, 0.4, 0.12], [-12, 0, 0], 0.04),
    box(JOINT, [0.19, -0.02, 1.92], [0.2, 0.14, 0.04], [-12, 0, 0], 0, true),
    // 耳：貼著頭的小片
    hull(
      SUB,
      [
        [1.08, 0.55, 0.1],
        [1.1, 0.1, 0.1],
        [1.08, 0.5, -0.35],
        [1.1, 0.15, -0.35],
        [1.28, 0.35, -0.2],
      ],
      true,
    ),
    // 上唇
    hull(
      SUB,
      [
        [0.72, -0.5, 0.9],
        [0.8, -0.5, 0.9],
        [0.8, -0.72, 0.9],
        [0.72, -0.72, 0.9],
        [0.52, -0.5, 1.74],
        [0.62, -0.5, 1.74],
        [0.62, -0.7, 1.72],
        [0.52, -0.7, 1.74],
      ],
      true,
    ),
    // 上犬齒
    lathe(
      STEEL,
      [0.5, -0.6, 1.6],
      [0.02, -1, 0.06],
      [
        [0, 0.1],
        [0.28, 0.065],
        [0.48, 0.008],
      ],
      8,
      true,
    ),
  ];
  for (const x of [0.1, 0.3]) out.push(box(STEEL, [x, -0.68, 1.8], [0.16, 0.16, 0.06], null, 0, true));
  for (let k = 0; k < 3; k++)
    out.push(box(STEEL, [0.74 - k * 0.05, -0.76, 1.0 + k * 0.2], [0.07, 0.14, 0.14], null, 0, true));
  return out;
}
function jawLocal() {
  const out = [
    // 巨大的下顎
    hullS(MAIN, [
      [0.9, -0.6, 0],
      [0.95, -1.3, 0.2],
      [0, -1.45, 0.2],
      [0.75, -0.62, 1.0],
      [0.78, -1.3, 1.1],
      [0, -1.4, 1.1],
      [0.55, -0.62, 1.75],
      [0.55, -1.15, 1.75],
      [0, -1.2, 1.85],
      [0, -0.62, 1.86],
      [0, -0.6, 0],
    ]),
    hullS(ACC, [
      [0, -1.18, 1.87],
      [0.36, -1.14, 1.8],
      [0.38, -0.9, 1.81],
      [0, -0.88, 1.9],
      [0, -1.36, 1.3],
      [0.36, -1.32, 1.3],
    ]),
    cyl(JOINT, [0.85, T.jawL[1], T.jawL[2]], [1.15, T.jawL[1], T.jawL[2]], 0.28, 14, true),
    lathe(
      STEEL,
      [0.42, -0.62, 1.66],
      [0, 1, 0.04],
      [
        [0, 0.09],
        [0.2, 0.055],
        [0.34, 0.008],
      ],
      8,
      true,
    ),
  ];
  for (let k = 0; k < 3; k++)
    out.push(box(STEEL, [0.66 - k * 0.05, -0.56, 1.0 + k * 0.2], [0.07, 0.13, 0.14], null, 0, true));
  return out;
}

let DEF = null;
export function gorillaDef() {
  if (DEF) return DEF;
  const { add, pair, done } = assembler();
  add('chest', null, T.chest, chest());
  add('hips', 'chest', T.hips, hips());
  add('neck', 'chest', T.neck, neck());
  add('head', 'neck', T.head, moved(headLocal(), T.head));
  add('jaw', 'head', vadd(T.head, T.jawL), moved(jawLocal(), T.head));
  pair('fl_upper', 'fr_upper', 'chest', 'chest', G.S, gorillaFlUpper());
  pair('fl_fore', 'fr_fore', 'fl_upper', 'fr_upper', G.E, gorillaFlFore());
  pair('fl_meta', 'fr_meta', 'fl_fore', 'fr_fore', G.W, gorillaFlMeta());
  pair('fl_paw', 'fr_paw', 'fl_meta', 'fr_meta', G.K, gorillaFist(G.K));
  pair('bl_thigh', 'br_thigh', 'hips', 'hips', G.H, gorillaBlThigh());
  pair('bl_shin', 'br_shin', 'bl_thigh', 'br_thigh', G.N, gorillaBlShin());
  pair('bl_meta', 'br_meta', 'bl_shin', 'br_shin', G.Tk, gorillaBlMeta());
  pair('bl_paw', 'br_paw', 'bl_meta', 'br_meta', G.A, gorillaFoot(G.A));
  DEF = done(GORILLA_COLS, 'gorilla');
  return DEF;
}
