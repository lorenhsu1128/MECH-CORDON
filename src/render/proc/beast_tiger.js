// 劍齒虎型機獸（原創設計，2026-11-19；docs/beast-design.md）：格式與做法同獅型機獸（beast_lion.js）。
// 和獅型的差別：沒有鬃甲、身形低伏而修長、扁寬的頭與兩頰的鰭、長劍齒、背上與腿上的條紋、肩上一對飛彈莢艙、尾端是穩定翼。
// 四肢與尾巴的節沿用獅型的零件（LION_PARTS），以 tf 調整比例（腿壓低 8%、前肢特別粗壯）；區塊名稱和獅型相同，動作（beast-anim.js）共用。
import { LION_PARTS, assembler } from './beast_lion.js';
import {
  ball,
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
export const TIGER_COLS = ['#ff3524!', '#0e1319', '#3a3d45', '#c8ccd3', '#ffb050!'];
const {
  J: LJ,
  sec,
  fin,
  nozzle,
  flUpper,
  flFore,
  flMeta,
  paw,
  blThigh,
  blShin,
  blMeta,
  tailSeg,
} = LION_PARTS;

// 骨架（站姿，套用 tf 之前的世界座標）
const T = {
  chest: [0, 4.9, 1.5],
  hips: [0, 5.0, -0.4],
  neck: [0, 5.15, 3.0],
  head: [0, 5.75, 4.3],
  jawL: [0, -0.3, 0.15], // 下顎的轉軸（頭的座標）
  turret: [0, 6.15, 1.4],
  guns: [0, 6.8, 1.4],
  hipZ: -3.65, // 髖關節的座（套用 REAR 之前）
  tail: [0, 5.45, -5.0],
};
const LEG_Y = 0.917; // 腿壓低的比例（肩高 5.4 → 4.95）
// 條紋：橫過背甲的細長凸條
const stripe = (R, i, j0 = 0.4, j1 = 3.6) =>
  panel(ACC, R, i, i + 0.2, j0, j1, { mir: true, t: 0.19, sink: -0.09, gap: 0.01, ch: 0.02 });

function chest() {
  const R = [
    sec(0.1, 1.3, 6.0, 3.6),
    sec(1.8, 1.38, 6.15, 3.45),
    sec(2.8, 1.25, 6.05, 3.7),
    sec(3.5, 0.9, 5.7, 4.3),
  ];
  const m = { mir: true };
  return [
    loft(JOINT, R),
    panel(MAIN, R, 0, 2, 0, 2, { ...m, t: 0.14 }),
    panel(MAIN, R, 2, 3, 0, 2, { ...m, t: 0.12 }),
    panel(SUB, R, 0, 2, 2, 4, { ...m, t: 0.07 }),
    panel(MAIN, R, 2, 3, 2, 4, { ...m, t: 0.1 }),
    stripe(R, 0.25),
    stripe(R, 0.62),
    stripe(R, 2.25, 0.4, 3.2),
    stripe(R, 2.6, 0.4, 3.0),
    // 腹（露出骨架：管線與橫肋）
    cyl(GUN, [0.58, 3.68, 0.7], [0.5, 3.94, 3.0], 0.13, 8, true),
    cyl(STEEL, [0.9, 4.0, 0.7], [0.76, 4.25, 3.1], 0.07, 6, true),
    ...[1.0, 1.6, 2.2, 2.8].map((z) => box(SUB, [0, 3.74, z], [2.0, 0.18, 0.16], null, 0.04)),
    // 低矮的脊鰭
    ...[0.6, 1.3, 2.0, 2.7].map((z) => fin(SUB, z, 6.2 - Math.abs(z - 1.8) * 0.1, 0.62, 0.17)),
    // 胸前的護板與楔形飾板
    hullS(MAIN, [
      [0, 5.3, 3.95],
      [0.64, 5.15, 3.74],
      [0.8, 4.4, 3.56],
      [0.5, 3.7, 3.36],
      [0, 3.85, 3.74],
      [0, 4.6, 4.04],
      [0.56, 5.05, 3.4],
      [0.7, 4.35, 3.25],
      [0.4, 3.75, 3.1],
    ]),
    hullS(ACC, [
      [0, 4.98, 4.07],
      [0.3, 4.92, 3.97],
      [0.34, 4.66, 3.94],
      [0, 4.44, 4.09],
      [0, 4.7, 3.92],
    ]),
    cyl(JOINT, [0.9, 4.95, 2.3], [1.42, 4.95, 2.3], 0.55, 12, true),
    // 莢艙座的座圈
    lathe(
      SUB,
      [0, 6.0, 1.4],
      [0, 1, 0],
      [
        [0, 0.7],
        [0.18, 0.7],
        [0.26, 0.58],
      ],
      12,
    ),
  ];
}

function hips() {
  const R = [
    sec(-0.4, 1.2, 5.95, 3.8, 0.95),
    sec(-1.9, 1.05, 5.85, 4.05),
    sec(-3.3, 1.2, 5.95, 3.95),
    sec(-4.3, 1.15, 5.9, 4.1),
    sec(-5.0, 0.75, 5.7, 4.7),
  ];
  const m = { mir: true };
  return [
    loft(JOINT, R),
    panel(MAIN, R, 0, 1, 0, 2, { ...m, t: 0.1 }),
    panel(MAIN, R, 1, 3, 0, 2, { ...m, t: 0.14 }),
    panel(MAIN, R, 3, 4, 0, 2, { ...m, t: 0.12 }),
    panel(SUB, R, 1, 3, 2, 4, { ...m, t: 0.07 }),
    panel(MAIN, R, 3, 4, 2, 4, { ...m, t: 0.1 }),
    panel(SUB, R, 3, 4, 4, 6, { ...m, t: 0.08 }),
    stripe(R, 0.35),
    stripe(R, 0.7),
    stripe(R, 1.2),
    stripe(R, 1.65),
    stripe(R, 2.4),
    stripe(R, 3.15, 0.4, 3.3),
    stripe(R, 3.5, 0.4, 3.0),
    // 腰露出骨架：三道肋環
    ...[-0.75, -1.1, -1.45].map((z) => box(SUB, [1.08, 4.95, z], [0.12, 1.2, 0.12], [0, 0, 4], 0.03, true)),
    ...[-0.9, -1.9, -2.9, -3.9].map((z) => fin(SUB, z, 6.0, 0.62, 0.17)),
    cyl(JOINT, [0.8, 5.04, T.hipZ], [1.3, 5.04, T.hipZ], 0.6, 12, true),
    ball(JOINT, T.tail, 0.42, 10),
    // 臀部兩側的大型噴嘴（高速型）
    ...nozzle([0.66, 5.1, -4.75], [0.12, -0.1, -1], 0.42, 0.9, true),
    hull(
      MAIN,
      [
        [0.3, 5.65, -4.7],
        [1.05, 5.6, -4.65],
        [1.08, 5.4, -5.35],
        [0.32, 5.45, -5.4],
        [0.34, 5.5, -4.7],
        [1.02, 5.45, -4.65],
      ],
      true,
    ),
  ];
}

function neck() {
  const R = tubeRings(
    [
      { p: [0, 5.0, 2.9], prof: oct(0.8, 0.85, 0.85) },
      { p: [0, 5.3, 3.6], prof: oct(0.8, 0.85, 0.85) },
      { p: [0, 5.55, 4.2], prof: oct(0.82, 0.85, 0.82) },
    ],
    [0, 1, 0],
  );
  return [
    loft(JOINT, R),
    panel(MAIN, R, 0, 2, 7.5, 9, { mir: true, t: 0.1 }),
    panel(SUB, R, 0, 2, 1, 2, { mir: true, t: 0.07 }),
    stripe(R, 0.5, 7.6, 9.6),
    stripe(R, 1.2, 7.6, 9.6),
  ];
}

// 頭（頭自己的座標：原點＝後腦的轉軸、+z 往前）。造型照自然界的豹頭（使用者定案）：流線——額頭到鼻尖一條斜線、沒有突出的眉骨，
// 吻往前收窄；雙眼偏在頭的兩側（朝前外方）、內眼角在前下、外眼角往後上方吊；內眼角往下到嘴邊一道淚紋
function headLocal() {
  const out = [
    ball(JOINT, [0, -0.05, -0.15], 0.62, 10),
    // 顱：圓順、後寬前窄
    hullS(MAIN, [
      [0, 0.92, -0.3],
      [0, 1.0, 0.3],
      [0, 0.9, 1.0],
      [0.62, 0.82, -0.25],
      [0.68, 0.85, 0.4],
      [0.55, 0.74, 1.05],
      [0.92, 0.2, 0.3],
      [0.9, 0.1, -0.3],
      [0.78, 0.25, 1.1],
      [0.7, -0.45, -0.2],
      [0.72, -0.42, 0.6],
      [0.62, -0.36, 1.15],
      [0, -0.5, -0.25],
    ]),
    // 吻：從額頭一路斜到鼻尖的楔形
    hullS(MAIN, [
      [0, 0.86, 1.05],
      [0.5, 0.7, 1.05],
      [0.72, 0.2, 1.1],
      [0.62, -0.38, 1.1],
      [0, 0.42, 2.15],
      [0.3, 0.36, 2.2],
      [0.42, 0.0, 2.3],
      [0.42, -0.36, 2.28],
      [0, -0.36, 2.4],
      [0, 0.05, 2.46],
      [0, 0.3, 2.36],
    ]),
    // 鼻
    hullS(SUB, [
      [0, 0.3, 2.33],
      [0.2, 0.27, 2.28],
      [0.24, 0.02, 2.4],
      [0, -0.08, 2.5],
      [0, 0.1, 2.52],
      [0.1, -0.08, 2.32],
    ]),
    // 眼窩與眼：在頭的側面，內眼角（前下）→ 外眼角（後上）
    hull(
      GLASS,
      [
        [0.47, 0.56, 1.62],
        [0.56, 0.36, 1.66],
        [0.74, 0.88, 1.0],
        [0.92, 0.56, 1.0],
        [0.5, 0.45, 1.2],
        [0.7, 0.5, 1.0],
      ],
      true,
    ),
    hull(
      GLOW,
      [
        [0.51, 0.52, 1.58],
        [0.57, 0.42, 1.6],
        [0.79, 0.84, 1.06],
        [0.91, 0.64, 1.05],
        [0.77, 0.6, 1.35],
        [0.6, 0.5, 1.2],
      ],
      true,
    ),
    // 淚紋：內眼角往下到嘴邊
    hull(
      ACC,
      [
        [0.5, 0.34, 1.7],
        [0.57, 0.34, 1.62],
        [0.6, -0.2, 1.9],
        [0.53, -0.2, 1.99],
        [0.62, 0.05, 1.78],
        [0.45, 0.05, 1.8],
      ],
      true,
    ),
    // 耳：小而圓、往後貼
    hull(
      SUB,
      [
        [0.5, 0.88, 0.2],
        [0.85, 0.72, 0.15],
        [0.78, 0.76, -0.3],
        [0.92, 1.25, -0.25],
        [0.7, 1.33, -0.3],
        [0.55, 0.82, -0.25],
        [0.86, 1.12, -0.42],
      ],
      true,
    ),
    // 上唇
    hull(
      SUB,
      [
        [0.6, -0.26, 1.15],
        [0.72, -0.26, 1.15],
        [0.72, -0.48, 1.15],
        [0.6, -0.48, 1.15],
        [0.36, -0.26, 2.3],
        [0.46, -0.26, 2.3],
        [0.46, -0.46, 2.28],
        [0.36, -0.46, 2.3],
      ],
      true,
    ),
    // 劍齒：兩段、往後微彎
    lathe(
      STEEL,
      [0.5, -0.36, 2.02],
      [0.02, -1, 0.14],
      [
        [0, 0.14],
        [0.45, 0.115],
        [0.8, 0.085],
      ],
      6,
      true,
    ),
    lathe(
      STEEL,
      [0.516, -1.15, 2.13],
      [0.02, -1, -0.06],
      [
        [0, 0.085],
        [0.4, 0.05],
        [0.68, 0.006],
      ],
      6,
      true,
    ),
    // 劍齒的齒座
    box(ACC, [0.5, -0.36, 2.02], [0.33, 0.2, 0.34], null, 0.05, true),
  ];
  // 額頭的條紋（貼著額頭的斜面）
  for (const z of [0.95, 0.55, 0.15]) {
    const y = Math.min(1.0, 0.9 + (1.0 - z) * 0.14) + 0.03;
    out.push(
      hullS(ACC, [
        [0, y, z],
        [0.34, y - 0.1, z - 0.1],
        [0.34, y - 0.08, z - 0.26],
        [0, y + 0.02, z - 0.16],
        [0, y - 0.15, z - 0.08],
      ]),
    );
  }
  // 兩頰的鰭（兩片，貼著往後掃）
  for (let k = 0; k < 2; k++) {
    const x0 = 0.9 - k * 0.04,
      y0 = 0.0 - k * 0.3,
      z0 = 0.15 - k * 0.08;
    out.push(
      hull(
        k === 1 ? ACC : SUB,
        [
          [x0, y0 + 0.18, z0 + 0.3],
          [x0, y0 - 0.18, z0 + 0.25],
          [x0 - 0.12, y0, z0 - 0.2],
          [x0 + 0.08, y0, z0 + 0.1],
          [1.3 - k * 0.1, y0 - 0.15 - k * 0.1, -0.85],
        ],
        true,
      ),
    );
  }
  // 臼齒與門齒
  for (let k = 0; k < 3; k++)
    out.push(box(STEEL, [0.63 - k * 0.05, -0.52, 1.25 + k * 0.2], [0.06, 0.14, 0.12], null, 0, true));
  for (const x of [0.08, 0.22]) out.push(box(STEEL, [x, -0.42, 2.35], [0.11, 0.14, 0.06], null, 0, true));
  return out;
}
function jawLocal() {
  const out = [
    hullS(MAIN, [
      [0.64, -0.42, 0.05],
      [0.68, -0.85, 0.3],
      [0, -1.0, 0.35],
      [0.54, -0.46, 1.2],
      [0.52, -0.95, 1.3],
      [0, -1.05, 1.3],
      [0.32, -0.5, 2.2],
      [0.3, -0.82, 2.18],
      [0, -0.85, 2.27],
      [0, -0.5, 2.3],
      [0, -0.42, 0.05],
    ]),
    hullS(ACC, [
      [0, -0.83, 2.3],
      [0.2, -0.81, 2.24],
      [0.22, -0.64, 2.25],
      [0, -0.62, 2.34],
      [0, -0.95, 1.7],
      [0.24, -0.93, 1.7],
    ]),
    cyl(JOINT, [0.6, T.jawL[1], T.jawL[2]], [0.9, T.jawL[1], T.jawL[2]], 0.22, 10, true),
    lathe(
      STEEL,
      [0.24, -0.5, 2.15],
      [0, 1, 0.05],
      [
        [0, 0.07],
        [0.18, 0.045],
        [0.3, 0.006],
      ],
      6,
      true,
    ),
  ];
  for (let k = 0; k < 3; k++)
    out.push(box(STEEL, [0.5 - k * 0.04, -0.4, 1.25 + k * 0.2], [0.06, 0.13, 0.12], null, 0, true));
  return out;
}

// 肩上的飛彈莢艙：座（偏航）與莢艙（俯仰）
function turret() {
  const [, y, z] = T.turret;
  return [
    lathe(
      MAIN,
      [0, y, z],
      [0, 1, 0],
      [
        [0, 0.55],
        [0.2, 0.55],
        [0.34, 0.4],
      ],
      12,
    ),
    box(SUB, [0, y + 0.45, z], [0.6, 0.5, 0.7], null, 0.08),
    box(SUB, [0, T.guns[1], z], [2.9, 0.3, 0.42], null, 0.06),
    cyl(JOINT, [-1.3, T.guns[1], z], [1.3, T.guns[1], z], 0.2, 10),
  ];
}
function guns() {
  const [, y, z] = T.guns;
  const out = [
    box(MAIN, [1.78, y + 0.05, z + 0.1], [0.96, 0.82, 2.0], null, 0.1, true),
    box(SUB, [1.78, y + 0.05, z - 0.95], [0.8, 0.66, 0.16], null, 0.04, true),
    box(ACC, [1.78, y + 0.47, z + 0.1], [0.5, 0.06, 1.5], null, 0, true),
    box(GLASS, [1.78, y + 0.05, z + 1.1], [0.84, 0.7, 0.04], null, 0, true),
  ];
  for (const dx of [-0.26, 0, 0.26])
    for (const dy of [-0.17, 0.17])
      out.push(
        cyl(GUN, [1.78 + dx, y + 0.05 + dy, z + 1.1], [1.78 + dx, y + 0.05 + dy, z + 1.16], 0.1, 8, true),
      );
  return out;
}
// 尾端：上下兩片穩定翼＋感測器（照獅型的尾端位置建，之後和尾巴一起平移）
function tailTip() {
  const local = [
    hullS(MAIN, [
      [0, 0.14, 0],
      [0.14, 0, 0],
      [0, -0.14, 0],
      [0.1, 0, -0.9],
      [0, 0.1, -0.9],
      [0, -0.1, -0.9],
    ]),
    hullS(ACC, [
      [0, 0.1, -0.15],
      [0.04, 0.1, -0.5],
      [0, 0.75, -0.95],
      [0, 0.7, -1.15],
      [0, 0.08, -0.85],
    ]),
    hullS(SUB, [
      [0, -0.1, -0.2],
      [0.04, -0.1, -0.5],
      [0, -0.5, -0.9],
      [0, -0.46, -1.05],
      [0, -0.08, -0.8],
    ]),
    lathe(
      GLOW,
      [0, 0, 0.06],
      [0, 0, -1],
      [
        [0, 0.2],
        [0.07, 0.2],
      ],
      8,
    ),
  ];
  return xf(local, [18, 0, 0], LJ.tail[5]);
}

let DEF = null;
export function tigerDef() {
  if (DEF) return DEF;
  const { add, pair, done } = assembler();
  const REAR = { d: [0, 0, 0.6] };
  // 腿：以腳下的地面為中心縮放（壓低 LEG_Y、放寬加厚），往外張開，再平移（sh 以地面為基準，所以 x 另外補回肩高 × sh）
  const SH = 0.09;
  const FL = {
    k: [1.75, LEG_Y, 1.48],
    about: [LJ.S[0], 0, LJ.S[2]],
    d: [0.22 + LJ.S[1] * LEG_Y * SH, 0, 0.3],
    sh: SH,
  };
  const BL = {
    k: [1.5, LEG_Y, 1.3],
    about: [LJ.H[0], 0, LJ.H[2]],
    d: [0.22 + LJ.H[1] * LEG_Y * SH, 0, REAR.d[2] + (T.hipZ - LJ.H[2])],
    sh: SH,
  };
  const TAIL = {
    d: [T.tail[0] - LJ.tail[0][0], T.tail[1] - LJ.tail[0][1], T.tail[2] - LJ.tail[0][2] + REAR.d[2]],
  };
  add('chest', null, T.chest, chest());
  add('hips', 'chest', T.hips, hips(), REAR);
  add('neck', 'chest', T.neck, neck());
  // 頭與下顎整個放大（頭要有份量）
  const HK = [1.22, 1.22, 1.16];
  add('head', 'neck', T.head, moved(scaled(headLocal(), HK), T.head));
  add(
    'jaw',
    'head',
    [T.head[0], T.head[1] + T.jawL[1] * HK[1], T.head[2] + T.jawL[2] * HK[2]],
    moved(scaled(jawLocal(), HK), T.head),
  );
  add('turret', 'chest', T.turret, turret());
  add('guns', 'turret', T.guns, guns());
  pair('fl_upper', 'fr_upper', 'chest', 'chest', LJ.S, flUpper(), FL);
  pair('fl_fore', 'fr_fore', 'fl_upper', 'fr_upper', LJ.E, flFore(), FL);
  pair('fl_meta', 'fr_meta', 'fl_fore', 'fr_fore', LJ.W, flMeta(), FL);
  pair('fl_paw', 'fr_paw', 'fl_meta', 'fr_meta', LJ.K, paw(LJ.K), FL);
  pair('bl_thigh', 'br_thigh', 'hips', 'hips', LJ.H, blThigh(), BL);
  pair('bl_shin', 'br_shin', 'bl_thigh', 'br_thigh', LJ.N, blShin(), BL);
  pair('bl_meta', 'br_meta', 'bl_shin', 'br_shin', LJ.T, blMeta(), BL);
  pair('bl_paw', 'br_paw', 'bl_meta', 'br_meta', LJ.A, paw(LJ.A), BL);
  for (let k = 0; k < 5; k++) add('tail' + (k + 1), k ? 'tail' + k : 'hips', LJ.tail[k], tailSeg(k), TAIL);
  add('tail_tip', 'tail5', LJ.tail[5], tailTip(), TAIL);
  DEF = done(TIGER_COLS);
  return DEF;
}
