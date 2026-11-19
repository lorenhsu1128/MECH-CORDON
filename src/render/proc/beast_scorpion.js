// 蠍型機獸（原創設計，2026-11-19；docs/beast-design.md，第 1 章荒野／沙丘／礦坑的大 Boss）：格式與做法同獅型機獸（beast_lion.js）。
// 造型取真實蠍子的特徵：低而扁的身體（前體的背甲＋七片疊瓦的背板）、背甲上一對中眼與兩側各三顆側眼、嘴前的一對螯肢（小鉗）、
// 一對大螯、四對往兩側張開的步足、往後上方捲過背的五節尾與毒針。配合採礦的主題：螯的指間有電漿切割器、背上一對排熱的煙囪、毒囊兩側的毒液罐。
// 大小：照自然界的比例只有 1 m 左右，當不了 Boss，所以和鱷龜一樣做成 Boss 的大小（身體長約 8 m、連螯與尾約 19 m、尾高約 10 m、腳張開寬約 15 m）。
// 所有部位各自建模（附肢在 legs_scorpion.js）；沒有用別隻的零件。
import { assembler } from './beast_lion.js';
import {
  SCORP_ARM,
  SCORP_LEGS,
  SCORP_TAIL,
  scorpArmFore,
  scorpArmUpper,
  scorpFinger,
  scorpHand,
  scorpLegA,
  scorpLegB,
  scorpLegC,
  scorpSting,
  scorpTailSeg,
} from './legs_scorpion.js';
import { bodyRing, box, cyl, hull, hullS, lathe, loft } from './beast_kit.js';

const MAIN = 0,
  SUB = 1,
  JOINT = 2,
  ACC = 3,
  GLOW = 4,
  GUN = 6,
  STEEL = 7,
  BURN = 8,
  WAR = 9; // 迫擊砲彈的彈頭（警示黃）
// 眼（紅）、玻璃、槍鐵、亮鋼、毒液與切割器的光（螢光綠）
export const SCORPION_COLS = ['#ff3b2e!', '#0e1319', '#3a3d45', '#c8ccd3', '#9dff3a!', '#e8a81e'];

// 身體的輪廓：z → [半寬, 背的高度, 側緣的高度, 腹的高度]
const ST = [
  [-4.6, 1.25, 2.95, 2.45, 1.95],
  [-3.5, 2.05, 3.15, 2.5, 1.65],
  [-1.5, 2.6, 3.3, 2.5, 1.5],
  [0.5, 2.55, 3.25, 2.45, 1.5],
  [2.0, 2.3, 3.1, 2.4, 1.6],
  [3.5, 1.7, 2.8, 2.35, 1.85],
];
const prof = (z) => {
  let i = 0;
  while (i < ST.length - 2 && z > ST[i + 1][0]) i++;
  const a = ST[i],
    b = ST[i + 1];
  const u = Math.max(0, Math.min(1, (z - a[0]) / (b[0] - a[0])));
  return a.map((v, k) => v + (b[k] - v) * u);
};
const ring = ([z, w, yt, ym, yb]) =>
  bodyRing(z, [
    [0, yt],
    [w * 0.62, yt - 0.08],
    [w, ym + 0.15],
    [w, ym - 0.3],
    [w * 0.7, yb + 0.05],
    [0, yb],
  ]);

function trunk() {
  const out = [loft(JOINT, ST.map(ring))];
  // 中體的七片背板：前緣壓在前一片底下、後緣翹起，像疊瓦
  for (let k = 0; k < 7; k++) {
    const z0 = 1.05 - k * 0.8,
      z1 = z0 - 0.98;
    const [, w0, t0, m0] = prof(z0),
      [, w1, t1, m1] = prof(z1);
    out.push(
      hullS(MAIN, [
        [0, t0 + 0.2, z0],
        [w0 * 0.62, t0 + 0.12, z0],
        [w0 + 0.12, m0 + 0.2, z0],
        [w0 + 0.12, m0 - 0.3, z0],
        [0, t1 + 0.34, z1],
        [w1 * 0.62, t1 + 0.26, z1],
        [w1 + 0.16, m1 + 0.24, z1],
        [w1 + 0.16, m1 - 0.34, z1],
      ]),
      // 後緣的飾條與中線的脊
      box(ACC, [0, t1 + 0.37, z1 + 0.07], [w1 * 1.1, 0.07, 0.12]),
      hullS(SUB, [
        [0.16, t0 + 0.22, z0 - 0.25],
        [0.16, t1 + 0.34, z1 + 0.15],
        [0, t0 + 0.4, z0 - 0.3],
        [0, t1 + 0.62, z1 + 0.12],
      ]),
    );
    // 側緣的小鉚塊
    out.push(box(SUB, [w1 + 0.2, m1 - 0.05, z1 + 0.45], [0.14, 0.34, 0.42], null, 0.04, true));
  }
  out.push(
    // 前體的背甲：一整塊的厚殼，前緣寬而鈍
    hullS(MAIN, [
      [0, 3.52, 1.0],
      [1.55, 3.44, 1.0],
      [2.55, 2.72, 1.0],
      [2.55, 2.1, 1.0],
      [0, 3.42, 2.5],
      [1.35, 3.32, 2.7],
      [2.25, 2.62, 3.25],
      [2.25, 2.1, 3.25],
      [1.3, 2.95, 3.95],
      [1.3, 2.2, 3.95],
      [0, 3.05, 4.0],
      [0, 2.2, 4.0],
    ]),
    // 背甲的中脊與兩道斜肋
    hullS(SUB, [
      [0.5, 3.48, 1.3],
      [0.42, 3.4, 2.3],
      [0, 3.66, 1.3],
      [0, 3.58, 2.3],
    ]),
    box(ACC, [1.45, 3.22, 2.2], [0.12, 0.12, 1.9], [8, 22, -28], 0.03, true),
    // 中眼：背甲頂上的眼座，一對往前上方看的眼
    hullS(SUB, [
      [0.75, 3.38, 2.55],
      [0.75, 3.38, 3.35],
      [0.55, 3.78, 2.7],
      [0.55, 3.72, 3.3],
      [0, 3.82, 2.7],
      [0, 3.75, 3.35],
    ]),
    hull(
      GLOW,
      [
        [0.14, 3.44, 3.34],
        [0.7, 3.44, 3.34],
        [0.14, 3.74, 3.3],
        [0.6, 3.7, 3.3],
        [0.4, 3.58, 3.48],
      ],
      true,
    ),
    // 上唇與嘴
    hullS(SUB, [
      [1.0, 2.3, 3.9],
      [1.0, 1.9, 3.7],
      [0, 2.3, 3.95],
      [0, 1.85, 3.75],
      [0.9, 2.2, 3.2],
      [0.9, 1.8, 3.2],
    ]),
    // 腹面的板
    ...[-3.4, -2.3, -1.2, -0.1, 1.0, 2.1].map((z) =>
      box(SUB, [0, prof(z)[4] - 0.02, z], [prof(z)[1] * 1.25, 0.16, 0.8], null, 0.05),
    ),
    // 螯肢（大螯）的肩座
    cyl(
      JOINT,
      [SCORP_ARM.P0[0], 1.75, SCORP_ARM.P0[2]],
      [SCORP_ARM.P0[0], 2.9, SCORP_ARM.P0[2]],
      0.8,
      16,
      true,
    ),
    cyl(
      ACC,
      [SCORP_ARM.P0[0], 2.9, SCORP_ARM.P0[2]],
      [SCORP_ARM.P0[0], 2.98, SCORP_ARM.P0[2]],
      0.45,
      12,
      true,
    ),
    // 尾的座
    cyl(
      JOINT,
      [-1.0, SCORP_TAIL[0][1], SCORP_TAIL[0][2] + 0.1],
      [1.0, SCORP_TAIL[0][1], SCORP_TAIL[0][2] + 0.1],
      0.72,
      16,
    ),
    // 背上的排熱煙囪：一對，往後上方
    lathe(
      GUN,
      [1.45, 3.25, -2.9],
      [0.18, 1, -0.55],
      [
        [0, 0.42],
        [0.5, 0.36],
        [0.56, 0.42],
        [0.68, 0.42],
        [0.74, 0.34],
        [1.25, 0.3],
        [1.3, 0.36],
        [1.42, 0.36],
      ],
      12,
      true,
    ),
    lathe(
      BURN,
      [1.69, 4.58, -3.63],
      [0.18, 1, -0.55],
      [
        [0, 0.27],
        [0.04, 0.27],
      ],
      10,
      true,
    ),
    hullS(SUB, [
      [0.95, 3.3, -2.3],
      [1.95, 3.2, -2.3],
      [0.95, 3.25, -3.4],
      [1.9, 3.1, -3.4],
      [1.45, 3.75, -2.7],
      [0, 3.4, -2.3],
      [0, 3.35, -3.4],
    ]),
  );
  // 側眼：背甲前側緣各三顆
  for (const [x, y, z] of [
    [1.62, 2.88, 3.72],
    [1.86, 2.82, 3.52],
    [2.08, 2.76, 3.3],
  ])
    out.push(box(GLOW, [x, y, z], [0.22, 0.2, 0.2], [0, 38, 0], 0, true));
  // 步足的髖座
  for (const L of SCORP_LEGS) {
    const { hip, h } = L;
    out.push(
      cyl(
        JOINT,
        [hip[0] - h[0] * 0.55, hip[1], hip[2] - h[2] * 0.55],
        [hip[0] + h[0] * 0.55, hip[1], hip[2] + h[2] * 0.55],
        0.6,
        16,
        true,
      ),
      box(SUB, [hip[0] - 0.45, hip[1] - 0.25, hip[2]], [1.1, 0.5, 0.95], null, 0.08, true),
    );
  }
  return out;
}
// 嘴前的螯肢（小鉗）：左側；以根部為軸上下動
const CHEL = [0.55, 2.25, 3.85];
function chelicera() {
  return [
    hull(SUB, [
      [0.2, 2.5, 3.8],
      [0.9, 2.5, 3.8],
      [0.2, 2.0, 3.8],
      [0.9, 2.0, 3.8],
      [0.25, 2.4, 4.7],
      [0.85, 2.4, 4.7],
      [0.25, 2.05, 4.7],
      [0.85, 2.05, 4.7],
    ]),
    // 上下兩根小鉗
    hull(STEEL, [
      [0.3, 2.4, 4.65],
      [0.8, 2.4, 4.65],
      [0.3, 2.25, 4.65],
      [0.8, 2.25, 4.65],
      [0.5, 2.2, 5.3],
    ]),
    hull(STEEL, [
      [0.3, 2.18, 4.65],
      [0.8, 2.18, 4.65],
      [0.3, 2.05, 4.65],
      [0.8, 2.05, 4.65],
      [0.55, 2.12, 5.15],
    ]),
    cyl(JOINT, [0.12, CHEL[1], CHEL[2]], [0.98, CHEL[1], CHEL[2]], 0.3, 14),
  ];
}

// ---------- 外掛武器一（能量）：螯臂上的電漿切割砲（左；右＝鏡像）----------
// 壓在前臂背上的長匣：後段的電容鼓、中段的匣體與散熱縫、前段三爪的聚焦器夾著發光的電漿芯
function cutter() {
  const x = 4.22,
    y = 3.85;
  const out = [
    // 鞍座（跨在前臂背上）
    hull(SUB, [
      [x - 0.62, y - 0.62, 5.25],
      [x + 0.62, y - 0.62, 5.25],
      [x - 0.62, y - 0.62, 7.0],
      [x + 0.62, y - 0.62, 7.0],
      [x - 0.4, y - 0.3, 5.2],
      [x + 0.4, y - 0.3, 5.2],
      [x - 0.4, y - 0.3, 7.1],
      [x + 0.4, y - 0.3, 7.1],
    ]),
    // 匣體：前窄後寬的六角長匣
    hull(MAIN, [
      ...[
        [5.0, 0.5, 0.42],
        [6.9, 0.44, 0.38],
        [7.5, 0.3, 0.28],
      ].flatMap(([z, w, h]) => [
        [x - w, y + h * 0.3, z],
        [x + w, y + h * 0.3, z],
        [x - w, y - h * 0.8, z],
        [x + w, y - h * 0.8, z],
        [x - w * 0.5, y + h, z],
        [x + w * 0.5, y + h, z],
      ]),
    ]),
    box(ACC, [x, y + 0.42, 5.9], [0.22, 0.05, 1.3]),
    ...[5.4, 5.75, 6.1, 6.45].map((z) => box(GUN, [x + 0.5, y - 0.1, z], [0.05, 0.3, 0.16], null, 0, false)),
    // 後段的電容鼓與纜線
    cyl(JOINT, [x, y, 4.35], [x, y, 5.05], 0.46, 12),
    cyl(ACC, [x, y, 4.5], [x, y, 4.62], 0.5, 12),
    cyl(GUN, [x, y, 4.2], [x, y, 4.35], 0.3, 12),
    cyl(GUN, [x - 0.35, y - 0.3, 4.6], [x - 0.5, y - 0.95, 5.3], 0.07, 6),
    // 砲管與聚焦器：三片爪夾著電漿芯
    cyl(GUN, [x, y, 7.4], [x, y, 8.0], 0.24, 12),
    cyl(STEEL, [x, y, 8.0], [x, y, 8.12], 0.3, 12),
    cyl(BURN, [x, y, 8.1], [x, y, 9.0], 0.1, 8),
    lathe(
      BURN,
      [x, y, 9.0],
      [0, 0, 1],
      [
        [0, 0.1],
        [0.12, 0.16],
        [0.24, 0.1],
        [0.32, 0.02],
      ],
      8,
    ),
  ];
  for (const a of [90, 210, 330]) {
    const c = Math.cos((a * Math.PI) / 180),
      sn = Math.sin((a * Math.PI) / 180);
    const q = (r, z) => [x + c * r, y + sn * r, z];
    const t = [-sn * 0.07, c * 0.07, 0];
    const pts = [q(0.2, 8.05), q(0.34, 8.05), q(0.3, 8.7), q(0.4, 8.7), q(0.2, 9.25), q(0.26, 9.25)];
    out.push(
      hull(GUN, [
        ...pts.map((v) => [v[0] + t[0], v[1] + t[1], v[2]]),
        ...pts.map((v) => [v[0] - t[0], v[1] - t[1], v[2]]),
      ]),
    );
  }
  return out;
}

// ---------- 外掛武器二（爆發）：背上的採礦爆破迫擊筒 ----------
// 一座轉盤上左右兩排各三支粗短的筒，往前上方斜；筒口露出警示黃的彈頭，後方是裝彈的彈匣箱
function mortar() {
  const y0 = 3.5,
    z0 = 0.1;
  const out = [
    lathe(
      JOINT,
      [0, y0, z0],
      [0, 1, 0],
      [
        [0, 1.5],
        [0.14, 1.5],
        [0.26, 1.2],
        [0.4, 1.2],
      ],
      16,
    ),
    // 底座：低矮的梯形台
    hullS(MAIN, [
      [1.55, y0 + 0.35, z0 + 1.05],
      [1.55, y0 + 0.35, z0 - 1.25],
      [1.2, y0 + 0.9, z0 + 0.8],
      [1.2, y0 + 1.05, z0 - 1.1],
      [0, y0 + 0.95, z0 + 0.9],
      [0, y0 + 1.15, z0 - 1.15],
    ]),
    box(ACC, [0, y0 + 1.08, z0 - 0.15], [0.3, 0.06, 1.5], [-6, 0, 0]),
    // 後方的彈匣箱
    box(SUB, [0, y0 + 0.85, z0 - 1.55], [2.3, 0.9, 0.7], null, 0.1),
    ...[-0.75, 0, 0.75].map((x) => box(GUN, [x, y0 + 0.85, z0 - 1.92], [0.5, 0.6, 0.05])),
  ];
  const dir = (sx) => {
    const d = [sx * 0.2, 1, 0.42];
    const n = Math.hypot(...d);
    return d.map((v) => v / n);
  };
  for (const sx of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const b = [sx * 0.82, y0 + 0.8, z0 + 0.62 - k * 0.72];
      const d = dir(sx);
      out.push(
        lathe(
          GUN,
          b,
          d,
          [
            [0, 0.36],
            [0.3, 0.36],
            [0.36, 0.3],
            [1.5, 0.3],
            [1.55, 0.37],
            [1.75, 0.37],
            [1.8, 0.3],
          ],
          12,
        ),
        lathe(
          STEEL,
          b,
          d,
          [
            [0.7, 0.33],
            [0.82, 0.33],
          ],
          12,
        ),
        lathe(
          WAR,
          b,
          d,
          [
            [1.5, 0.22],
            [1.78, 0.2],
            [1.95, 0.12],
            [2.0, 0.03],
          ],
          10,
        ),
      );
    }
  return out;
}

let DEF = null;
export function scorpionDef() {
  if (DEF) return DEF;
  const { add, pair, done } = assembler();
  add('chest', null, [0, 2.5, 0], trunk());
  pair('chel_l', 'chel_r', 'chest', 'chest', CHEL, chelicera());
  // 大螯
  pair('cl_arm', 'cr_arm', 'chest', 'chest', SCORP_ARM.P0, scorpArmUpper());
  pair('cl_fore', 'cr_fore', 'cl_arm', 'cr_arm', SCORP_ARM.P1, [...scorpArmFore(), ...cutter()]);
  pair('cl_hand', 'cr_hand', 'cl_fore', 'cr_fore', SCORP_ARM.P2, scorpHand());
  pair('cl_finger', 'cr_finger', 'cl_hand', 'cr_hand', SCORP_ARM.F, scorpFinger());
  // 四對步足：l<對>_a 腿節、_b 脛節、_c 跗節
  SCORP_LEGS.forEach((L, i) => {
    const n = i + 1;
    pair(`l${n}_a`, `r${n}_a`, 'chest', 'chest', L.hip, scorpLegA(i));
    pair(`l${n}_b`, `r${n}_b`, `l${n}_a`, `r${n}_a`, L.knee, scorpLegB(i));
    pair(`l${n}_c`, `r${n}_c`, `l${n}_b`, `r${n}_b`, L.ankle, scorpLegC(i));
  });
  // 尾
  for (let i = 0; i < 5; i++) add('tail' + (i + 1), i ? 'tail' + i : 'chest', SCORP_TAIL[i], scorpTailSeg(i));
  add('mortar', 'chest', [0, 3.5, 0.1], mortar());
  add('sting', 'tail5', SCORP_TAIL[5], scorpSting());
  DEF = done(SCORPION_COLS, 'scorpion');
  return DEF;
}
