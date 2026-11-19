// 螳螂型機獸（原創設計，2026-11-19；docs/beast-design.md，第 6 章高空軌道的大 Boss）：格式與做法同獅型機獸（beast_lion.js）。
// 造型取真實螳螂的特徵：高高斜舉的細長前胸、能轉動的倒三角形頭與一對大複眼、頭頂三顆單眼與長觸角、收在胸前的一對鐮刀（捕捉足）、
// 兩對細長的步足、長而分節的腹、蓋在腹上的翅鞘與底下的膜翅。配合高空軌道的主題：鐮刃的刃口是能量刃、膜翅是發光的推進翼、腹側與腹尾有推進器。
// 大小：照自然界的比例只有半公尺，當不了 Boss，所以和鱷龜、蠍一樣做成 Boss 的大小（頭高約 10.5 m、全長約 19 m、腳張開寬約 13 m）。
// 所有部位各自建模（附肢在 legs_mantis.js）；沒有用別隻的零件。
import { assembler } from './beast_lion.js';
import {
  MANTIS_ARM,
  MANTIS_LEGS,
  mantisBlade,
  mantisCoxa,
  mantisFemur,
  mantisLegA,
  mantisLegB,
  mantisLegC,
} from './legs_mantis.js';
import { ball, bodyRing, box, cyl, hull, hullS, lathe, loft, moved, oct, panel, seg } from './beast_kit.js';

const MAIN = 0,
  SUB = 1,
  JOINT = 2,
  ACC = 3,
  GLOW = 4,
  GLASS = 5,
  GUN = 6,
  STEEL = 7,
  BURN = 8;
// 複眼（青綠）、玻璃（膜翅）、槍鐵、亮鋼、能量刃與推進的光（洋紅）
export const MANTIS_COLS = ['#2fd69a!', '#1a2233', '#3a3d45', '#c8ccd3', '#ff4fd8!'];

const T = {
  chest: [0, 4.2, 0],
  abdomen: [0, 4.3, -1.4],
  thorax: [0, 4.6, 1.3], // 前胸的根
  head: [0, 10.6, 5.5], // 頸
  ant: [0.45, 11.75, 6.35],
  wing: [0.7, 5.2, -0.3],
};

// 中後胸：短而結實的方塊體，四隻步足與翅都接在這裡
function chest() {
  const out = [
    hullS(MAIN, [
      [0.9, 5.1, 1.5],
      [1.25, 4.6, 1.5],
      [1.2, 3.6, 1.5],
      [0.7, 3.3, 1.4],
      [1.05, 5.25, 0],
      [1.45, 4.6, 0],
      [1.35, 3.5, 0],
      [0.8, 3.2, 0],
      [0.9, 5.15, -1.5],
      [1.3, 4.6, -1.5],
      [1.2, 3.6, -1.5],
      [0.7, 3.35, -1.4],
      [0, 5.3, 0],
      [0, 3.15, 0],
    ]),
    // 背上的脊與翅根的座
    hullS(SUB, [
      [0.45, 5.2, 1.2],
      [0.45, 5.25, -1.2],
      [0, 5.5, 1.0],
      [0, 5.55, -1.1],
    ]),
    cyl(JOINT, [0.3, T.wing[1] - 0.05, T.wing[2]], [1.15, T.wing[1] - 0.05, T.wing[2]], 0.32, 14, true),
    // 腹面的板
    box(SUB, [0, 3.2, 0.7], [1.5, 0.16, 0.9], null, 0.05),
    box(SUB, [0, 3.2, -0.7], [1.5, 0.16, 0.9], null, 0.05),
    box(ACC, [1.42, 4.6, 0], [0.1, 0.5, 2.2], null, 0.03, true),
    // 前胸的座
    cyl(JOINT, [-0.85, T.thorax[1], T.thorax[2]], [0.85, T.thorax[1], T.thorax[2]], 0.7, 16),
    cyl(ACC, [-0.92, T.thorax[1], T.thorax[2]], [0.92, T.thorax[1], T.thorax[2]], 0.36, 12),
  ];
  for (const L of Object.values(MANTIS_LEGS)) {
    const { hip, h } = L;
    out.push(
      cyl(
        JOINT,
        [hip[0] - h[0] * 0.45, hip[1], hip[2] - h[2] * 0.45],
        [hip[0] + h[0] * 0.45, hip[1], hip[2] + h[2] * 0.45],
        0.5,
        16,
        true,
      ),
    );
  }
  return out;
}

// 腹：長而分節，中段最寬；背板一片壓一片，腹尾有推進器與一對尾毛
const AB = [
  [-1.4, 1.0, 5.0, 4.3, 3.5],
  [-3.0, 1.4, 5.1, 4.2, 3.2],
  [-5.5, 1.55, 5.0, 4.05, 3.0],
  [-8.0, 1.15, 4.75, 4.0, 3.3],
  [-9.6, 0.55, 4.5, 4.1, 3.75],
];
const abProf = (z) => {
  let i = 0;
  while (i < AB.length - 2 && z < AB[i + 1][0]) i++;
  const a = AB[i],
    b = AB[i + 1];
  const u = Math.max(0, Math.min(1, (z - a[0]) / (b[0] - a[0])));
  return a.map((v, k) => v + (b[k] - v) * u);
};
function abdomen() {
  const out = [
    loft(
      JOINT,
      AB.map(([z, w, yt, ym, yb]) =>
        bodyRing(z, [
          [0, yt],
          [w * 0.6, yt - 0.1],
          [w, ym + 0.1],
          [w, ym - 0.3],
          [w * 0.6, yb + 0.08],
          [0, yb],
        ]),
      ),
    ),
  ];
  for (let k = 0; k < 6; k++) {
    const z0 = -1.5 - k * 1.33,
      z1 = z0 - 1.5;
    const [, w0, , m0, b0] = abProf(z0),
      [, w1, , m1, b1] = abProf(z1);
    out.push(
      // 側板（背面被翅蓋住，所以甲做在兩側與腹面）
      hull(
        MAIN,
        [
          [w0 + 0.1, m0 + 0.35, z0],
          [w0 + 0.1, m0 - 0.4, z0],
          [w0 * 0.62, b0 + 0.02, z0],
          [w1 + 0.16, m1 + 0.4, z1],
          [w1 + 0.16, m1 - 0.45, z1],
          [w1 * 0.62, b1 - 0.04, z1],
          [w0 * 0.9, m0 + 0.35, z0],
          [w1 * 0.9, m1 + 0.4, z1],
        ],
        true,
      ),
      // 腹板
      hullS(SUB, [
        [w0 * 0.58, b0 + 0.04, z0 - 0.08],
        [w1 * 0.58, b1 - 0.02, z1 + 0.08],
        [0, b0 - 0.1, z0 - 0.08],
        [0, b1 - 0.16, z1 + 0.08],
        [w0 * 0.5, b0 + 0.2, z0 - 0.08],
        [w1 * 0.5, b1 + 0.2, z1 + 0.08],
      ]),
      box(ACC, [w1 + 0.2, m1, z1 + 0.1], [0.08, 0.7, 0.12], null, 0, true),
    );
  }
  out.push(
    // 腹側的推進器：一對，往後下方
    lathe(
      GUN,
      [1.75, 3.7, -3.6],
      [0.25, -0.35, -1],
      [
        [0, 0.34],
        [0.5, 0.4],
        [0.58, 0.46],
        [0.72, 0.46],
        [0.8, 0.38],
        [1.3, 0.44],
      ],
      12,
      true,
    ),
    lathe(
      BURN,
      [2.04, 3.29, -4.77],
      [0.25, -0.35, -1],
      [
        [0, 0.36],
        [0.05, 0.36],
      ],
      10,
      true,
    ),
    // 腹尾的推進器與尾毛
    lathe(
      GUN,
      [0, 4.1, -9.4],
      [0, -0.1, -1],
      [
        [0, 0.5],
        [0.4, 0.55],
        [0.5, 0.62],
        [0.62, 0.62],
        [0.7, 0.5],
        [1.1, 0.58],
      ],
      12,
    ),
    lathe(
      BURN,
      [0, 4.0, -10.4],
      [0, -0.1, -1],
      [
        [0, 0.48],
        [0.05, 0.48],
      ],
      10,
    ),
    hull(
      STEEL,
      [
        [0.5, 4.45, -9.3],
        [0.75, 4.4, -9.3],
        [0.5, 4.2, -9.3],
        [0.75, 4.2, -9.3],
        [1.1, 4.7, -11.2],
      ],
      true,
    ),
    cyl(JOINT, [-0.8, T.abdomen[1], T.abdomen[2] - 0.1], [0.8, T.abdomen[1], T.abdomen[2] - 0.1], 0.6, 16),
  );
  return out;
}

// 前胸：細長、斜舉；上段兩側張開成盾（捕捉足接在盾的下面）
function thorax() {
  const a = T.thorax,
    b = T.head;
  const n = [0, 0.6, -0.8]; // 背面
  const R = seg(
    a,
    b,
    [
      [0.02, oct(0.8, 0.6, 0.6)],
      [0.3, oct(0.68, 0.55, 0.55)],
      [0.6, oct(0.8, 0.55, 0.6)],
      [0.76, oct(1.3, 0.6, 0.7)],
      [0.9, oct(0.95, 0.55, 0.6)],
      [1.0, oct(0.6, 0.5, 0.5)],
    ],
    n,
  );
  return [
    loft(JOINT, R),
    // 背面的長甲（分三截）、兩側的甲、腹面
    panel(MAIN, R, 0.15, 1.9, 6.55, 9.45, { t: 0.16, ch: 0.06 }),
    panel(MAIN, R, 2.05, 3.9, 6.3, 9.7, { t: 0.22, ch: 0.08 }),
    panel(MAIN, R, 4.05, 4.85, 6.55, 9.45, { t: 0.14, ch: 0.05 }),
    panel(SUB, R, 0.2, 2.6, 1.1, 2.9, { t: 0.1, ch: 0.04 }),
    panel(SUB, R, 0.2, 2.6, 5.1, 6.9, { t: 0.1, ch: 0.04 }),
    panel(SUB, R, 0.3, 4.6, 3.1, 4.9, { t: 0.1, ch: 0.04 }),
    panel(ACC, R, 1.92, 2.04, 6.3, 9.7, { t: 0.2, gap: 0, ch: 0.03 }),
    // 盾緣的一對短角
    ...moved(
      [
        hull(
          STEEL,
          [
            [1.25, 8.25, 3.4],
            [1.25, 7.85, 3.7],
            [1.1, 8.4, 3.8],
            [1.1, 8.0, 4.1],
            [2.0, 8.75, 3.35],
          ],
          true,
        ),
      ],
      [0, 1.2, 0.68],
    ),
    // 捕捉足的座
    cyl(
      JOINT,
      [0.35, MANTIS_ARM.S[1], MANTIS_ARM.S[2]],
      [1.1, MANTIS_ARM.S[1], MANTIS_ARM.S[2]],
      0.6,
      16,
      true,
    ),
    // 頸
    ball(JOINT, b, 0.58, 10),
  ];
}

// 頭：倒三角形，上寬下尖；兩個上角是鼓出來的大複眼
// 頭與觸角的座標是照頸在 [0, 9.0, 4.6] 寫的，前胸加長之後整個平移
const HD = [0, 1.6, 0.9];
function head() {
  return moved(
    [
      hullS(MAIN, [
        [0, 10.3, 4.65],
        [1.2, 10.25, 4.7],
        [1.45, 10.15, 5.1],
        [1.6, 9.6, 5.3],
        [0.95, 8.85, 6.05],
        [0.38, 8.2, 6.3],
        [0, 8.12, 6.4],
        [0, 9.95, 5.95],
        [0.7, 9.9, 5.9],
        [0.6, 8.8, 4.95],
        [0, 8.7, 4.85],
        [1.25, 9.7, 4.55],
        [0, 9.9, 4.4],
      ]),
      // 複眼
      hull(
        GLOW,
        [
          [1.15, 10.3, 5.25],
          [1.8, 10.0, 5.1],
          [1.98, 9.55, 5.45],
          [1.55, 9.2, 5.95],
          [1.05, 9.5, 6.15],
          [0.9, 10.0, 5.95],
          [1.75, 9.75, 5.9],
          [1.55, 10.2, 5.65],
          [1.3, 9.3, 5.4],
          [1.3, 10.0, 5.0],
        ],
        true,
      ),
      // 額上的三顆單眼
      box(GLOW, [0, 9.9, 6.0], [0.16, 0.16, 0.08], [-32, 0, 0]),
      box(GLOW, [0.26, 10.02, 5.9], [0.14, 0.14, 0.08], [-32, 0, 0], 0, true),
      // 臉中央的脊與上唇
      hullS(SUB, [
        [0.2, 9.75, 6.02],
        [0.3, 8.9, 6.25],
        [0, 9.75, 6.2],
        [0, 8.85, 6.5],
        [0.25, 8.5, 6.3],
        [0, 8.4, 6.52],
      ]),
      // 大顎：一對往下的鉤
      hull(
        STEEL,
        [
          [0.18, 8.3, 6.3],
          [0.5, 8.35, 6.15],
          [0.2, 8.25, 6.05],
          [0.46, 8.2, 6.35],
          [0.16, 7.65, 6.4],
        ],
        true,
      ),
      // 後腦的甲
      hullS(SUB, [
        [1.0, 10.2, 4.7],
        [1.05, 9.5, 4.45],
        [0, 10.25, 4.6],
        [0, 9.4, 4.3],
        [0.9, 10.35, 4.95],
        [0, 10.45, 4.95],
      ]),
      // 觸角的座
      ball(JOINT, [0.45, 10.15, 5.45], 0.2, 8, true),
    ],
    HD,
  );
}
// 觸角（左）：細長三節，往上往後
function antenna() {
  const p = [
    [0.45, 10.15, 5.45],
    [0.9, 11.6, 5.0],
    [1.3, 12.7, 3.7],
    [1.5, 13.1, 1.9],
  ];
  return moved(
    [
      cyl(GUN, p[0], p[1], 0.08, 6, false, 0.07),
      cyl(GUN, p[1], p[2], 0.07, 6, false, 0.05),
      cyl(STEEL, p[2], p[3], 0.05, 6, false, 0.02),
      ball(ACC, p[1], 0.11, 6),
      ball(ACC, p[2], 0.09, 6),
    ],
    HD,
  );
}
// 翅鞘（左）：蓋在腹上的長板，以翅根為軸往外上方張開
function wingCover() {
  const top = [
    [0.12, 5.3, -0.2],
    [1.35, 5.2, -0.2],
    [0.08, 5.52, -4.5],
    [1.95, 5.1, -4.5],
    [0.25, 5.2, -10.3],
    [1.25, 4.98, -10.1],
    [1.75, 5.05, -7.6],
  ];
  const out = [hull(MAIN, [...top, ...top.map(([x, y, z]) => [x, y - 0.14, z])])];
  // 翅脈：縱向三條、橫向幾道
  for (const [x0, x1] of [
    [0.35, 0.45],
    [0.9, 1.0],
    [1.4, 1.2],
  ])
    out.push(
      hull(ACC, [
        [x0 - 0.05, 5.33, -0.6],
        [x0 + 0.05, 5.33, -0.6],
        [x1 - 0.05, 5.42 - x1 * 0.14, -4.5],
        [x1 + 0.05, 5.42 - x1 * 0.14, -4.5],
        [x1 * 0.8 - 0.04, 5.2 - x1 * 0.1, -9.2],
        [x1 * 0.8 + 0.04, 5.2 - x1 * 0.1, -9.2],
        [x0, 5.27, -0.6],
        [x1 * 0.8, 5.12 - x1 * 0.1, -9.2],
      ]),
    );
  for (const z of [-2.2, -6.4, -8.4])
    out.push(box(SUB, [1.0, 5.36 - Math.abs(z + 4.5) * 0.03, z], [1.6, 0.06, 0.14]));
  out.push(cyl(JOINT, [0.4, T.wing[1], T.wing[2] + 0.25], [1.0, T.wing[1], T.wing[2] - 0.25], 0.26, 12));
  return out;
}
// 膜翅（左）：翅鞘底下發光的推進翼
function wingFan() {
  const top = [
    [0.15, 5.1, -0.4],
    [1.2, 5.02, -0.4],
    [0.1, 5.22, -4.6],
    [1.8, 4.9, -4.6],
    [0.3, 4.98, -9.8],
    [1.15, 4.84, -9.6],
  ];
  const out = [hull(GLASS, [...top, ...top.map(([x, y, z]) => [x, y - 0.05, z])])];
  for (const x1 of [0.35, 0.95, 1.5])
    out.push(
      hull(BURN, [
        [0.5, 5.11, -0.6],
        [0.6, 5.11, -0.6],
        [x1 - 0.04, 5.2 - x1 * 0.17, -4.6],
        [x1 + 0.04, 5.2 - x1 * 0.17, -4.6],
        [x1 * 0.75 - 0.03, 5.0 - x1 * 0.12, -9.3],
        [x1 * 0.75 + 0.03, 5.0 - x1 * 0.12, -9.3],
        [0.55, 5.07, -0.6],
        [x1 * 0.75, 4.96 - x1 * 0.12, -9.3],
      ]),
    );
  return out;
}

let DEF = null;
export function mantisDef() {
  if (DEF) return DEF;
  const { add, pair, done } = assembler();
  add('chest', null, T.chest, chest());
  add('abdomen', 'chest', T.abdomen, abdomen());
  add('thorax', 'chest', T.thorax, thorax());
  add('head', 'thorax', T.head, head());
  pair('ant_l', 'ant_r', 'head', 'head', T.ant, antenna());
  // 捕捉足：基節 → 腿節 → 鐮刃
  pair('sl_coxa', 'sr_coxa', 'thorax', 'thorax', MANTIS_ARM.S, mantisCoxa());
  pair('sl_femur', 'sr_femur', 'sl_coxa', 'sr_coxa', MANTIS_ARM.C, mantisFemur());
  pair('sl_blade', 'sr_blade', 'sl_femur', 'sr_femur', MANTIS_ARM.F, mantisBlade());
  // 步足：m＝中足、h＝後足；_a 腿節、_b 脛節、_c 跗節
  for (const [which, p] of [
    ['mid', 'm'],
    ['hind', 'h'],
  ]) {
    const L = MANTIS_LEGS[which];
    pair(`${p}l_a`, `${p}r_a`, 'chest', 'chest', L.hip, mantisLegA(which));
    pair(`${p}l_b`, `${p}r_b`, `${p}l_a`, `${p}r_a`, L.knee, mantisLegB(which));
    pair(`${p}l_c`, `${p}r_c`, `${p}l_b`, `${p}r_b`, L.ankle, mantisLegC(which));
  }
  // 翅：膜翅在下、翅鞘在上
  pair('fan_l', 'fan_r', 'chest', 'chest', T.wing, wingFan());
  pair('wing_l', 'wing_r', 'chest', 'chest', T.wing, wingCover());
  DEF = done(MANTIS_COLS, 'mantis');
  return DEF;
}
