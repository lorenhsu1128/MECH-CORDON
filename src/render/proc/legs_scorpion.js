// 蠍型機獸的附肢（原生建模，不經過縮放；左側 +x）：四對步足、一對螯肢（觸肢）、五節的尾與毒針。
// 步足照蠍子的樣子往兩側張開：腿節從身體下緣往外上方到高過背的膝、脛節往外下方、跗節幾乎垂直踩地；四對由前到後越來越長，
// 方向由前斜到後斜。每一對照自己的骨架產生（長度、角度都不同），不是拿一對去縮放。
// 螯肢：腿節往外前方、膝節往前、大而扁的螯（內側固定指、外側可動指，水平開合），指間有採礦用的電漿切割器。
// 尾：往後上方捲過背，五節一節比一節長，背面朝捲的內側；末節是毒囊與往前下方彎的毒針。
// 關節一律是正圓的圓柱（步足的軸水平、和腿的方向垂直；螯肢的軸垂直；尾的軸左右）。
import {
  box,
  cyl,
  hull,
  lathe,
  loft,
  oct,
  panel,
  piston,
  roundJoint,
  seg,
  vadd,
  vlerp,
  vmul,
  vnorm,
  vsub,
} from './beast_kit.js';

const MAIN = 0,
  SUB = 1,
  JOINT = 2,
  ACC = 3,
  GUN = 6,
  STEEL = 7,
  BURN = 8;
const UP = [0, 1, 0];
const rad = Math.PI / 180;

// ---- 骨架 ----
const LEG_Z = [2.3, 0.95, -0.55, -2.1], // 髖在身體上的前後位置
  LEG_ANG = [52, 16, -22, -54], // 腿的水平方向（從正左方往前轉的角度）
  LEG_REACH = [4.9, 5.3, 5.8, 6.7], // 髖到腳尖的水平距離
  LEG_KNEE = [3.7, 4.0, 4.2, 4.5]; // 膝的高度
export const SCORP_LEGS = LEG_Z.map((z, i) => {
  const a = LEG_ANG[i] * rad;
  const d = [Math.cos(a), 0, Math.sin(a)]; // 往外
  const h = [-Math.sin(a), 0, Math.cos(a)]; // 關節的軸
  const hip = [2.15, 2.0, z];
  const at = (k, y) => [hip[0] + d[0] * LEG_REACH[i] * k, y, hip[2] + d[2] * LEG_REACH[i] * k];
  return { d, h, hip, knee: at(0.36, LEG_KNEE[i]), ankle: at(0.84, 1.2), foot: at(1, 0), k: 0.92 + i * 0.05 };
});
export const SCORP_ARM = {
  P0: [1.5, 2.3, 3.3], // 肩
  P1: [4.3, 2.85, 4.9], // 肘
  P2: [4.15, 2.65, 7.4], // 腕
  F: [5.0, 2.65, 9.0], // 可動指的根
};
export const SCORP_TAIL = [
  [0, 2.75, -4.4],
  [0, 3.5, -6.4],
  [0, 5.4, -7.7],
  [0, 7.7, -7.5],
  [0, 9.4, -6.0],
  [0, 9.95, -3.6], // 毒囊的根
];

// 關節：軸 h、半徑 r、半寬 hw；兩端各一片飾蓋
const hinge = (c, h, r, hw) => [
  cyl(JOINT, vsub(c, vmul(h, hw)), vadd(c, vmul(h, hw)), r, 16),
  cyl(ACC, vsub(c, vmul(h, hw + 0.07)), vadd(c, vmul(h, hw + 0.07)), r * 0.52, 12),
];

// ---- 步足（第 i 對，0＝最前）----
export function scorpLegA(i) {
  const { hip, knee, d, h, k } = SCORP_LEGS[i];
  const R = seg(
    hip,
    knee,
    [
      [-0.1, oct(0.4 * k, 0.42 * k, 0.42 * k)],
      [0.15, oct(0.56 * k, 0.62 * k, 0.55 * k)],
      [0.75, oct(0.5 * k, 0.52 * k, 0.46 * k)],
      [1.06, oct(0.36 * k, 0.38 * k, 0.36 * k)],
    ],
    UP,
  );
  return [
    loft(JOINT, R),
    // 腿節的甲：蓋住上面與前後兩側
    panel(MAIN, R, 0.35, 2.6, 5.6, 10.4, { t: 0.17, ch: 0.07 }),
    panel(ACC, R, 2.62, 2.8, 5.6, 10.4, { t: 0.14, gap: 0, ch: 0.03 }),
    ...piston(
      GUN,
      STEEL,
      vadd(vlerp(hip, knee, 0.12), vadd(vmul(d, 0.25), [0, -0.5 * k, 0])),
      vadd(vlerp(hip, knee, 0.88), [0, -0.5 * k, 0]),
      0.1,
    ),
    ...hinge(knee, h, 0.52 * k, 0.5 * k),
  ];
}
export function scorpLegB(i) {
  const { knee, ankle, d, h, k } = SCORP_LEGS[i];
  const R = seg(
    knee,
    ankle,
    [
      [0, oct(0.4 * k, 0.44 * k, 0.4 * k)],
      [0.3, oct(0.5 * k, 0.6 * k, 0.45 * k)],
      [0.8, oct(0.38 * k, 0.4 * k, 0.36 * k)],
      [1.04, oct(0.28 * k, 0.3 * k, 0.28 * k)],
    ],
    UP,
  );
  const m = vlerp(knee, ankle, 0.32);
  const n = vnorm(vadd(d, [0, 0.9, 0])); // 脛節的外上方
  return [
    loft(JOINT, R),
    panel(MAIN, R, 0.25, 2.5, 5.6, 10.4, { t: 0.15, ch: 0.06 }),
    // 脛節外緣的刃
    hull(STEEL, [
      vadd(m, vadd(vmul(n, 0.5 * k), vmul(h, 0.12))),
      vadd(m, vadd(vmul(n, 0.5 * k), vmul(h, -0.12))),
      vadd(vlerp(knee, ankle, 0.62), vadd(vmul(n, 0.42 * k), vmul(h, 0.08))),
      vadd(vlerp(knee, ankle, 0.62), vadd(vmul(n, 0.42 * k), vmul(h, -0.08))),
      vadd(vlerp(knee, ankle, 0.5), vmul(n, 1.05 * k)),
    ]),
    ...hinge(ankle, h, 0.36 * k, 0.4 * k),
  ];
}
export function scorpLegC(i) {
  const { ankle, foot, d, h, k } = SCORP_LEGS[i];
  const tip = [foot[0], 0.42, foot[2]];
  const R = seg(
    ankle,
    tip,
    [
      [0, oct(0.28 * k, 0.3 * k, 0.28 * k)],
      [0.45, oct(0.3 * k, 0.36 * k, 0.26 * k)],
      [1, oct(0.2 * k, 0.22 * k, 0.2 * k)],
    ],
    d,
  );
  const g = (a, b, y) => [foot[0] + d[0] * a + h[0] * b, y, foot[2] + d[2] * a + h[2] * b];
  return [
    loft(JOINT, R),
    panel(MAIN, R, 0.15, 1.8, 6.4, 9.6, { t: 0.1, ch: 0.04 }),
    // 腳尖：往外下方的尖爪，兩側各一根小爪
    hull(STEEL, [
      g(-0.2, 0.2, 0.5),
      g(-0.2, -0.2, 0.5),
      g(0.2, 0.18, 0.55),
      g(0.2, -0.18, 0.55),
      g(0.32, 0, 0),
    ]),
    hull(SUB, [g(-0.25, 0.3, 0.45), g(-0.1, 0.14, 0.5), g(-0.25, 0.14, 0.5), g(-0.05, 0.42, 0)]),
    hull(SUB, [g(-0.25, -0.3, 0.45), g(-0.1, -0.14, 0.5), g(-0.25, -0.14, 0.5), g(-0.05, -0.42, 0)]),
  ];
}

// ---- 螯肢 ----
const Y = [0, 1, 0];
export function scorpArmUpper() {
  const { P0, P1 } = SCORP_ARM;
  const R = seg(
    P0,
    P1,
    [
      [-0.05, oct(0.5, 0.5, 0.5)],
      [0.25, oct(0.72, 0.68, 0.62)],
      [0.8, oct(0.66, 0.62, 0.56)],
      [1.03, oct(0.5, 0.48, 0.46)],
    ],
    UP,
  );
  return [
    loft(JOINT, R),
    panel(MAIN, R, 0.3, 2.6, 5.5, 10.5, { t: 0.2, ch: 0.08 }),
    ...piston(GUN, STEEL, vadd(P0, [0.5, -0.45, 0.75]), vadd(P1, [-0.4, -0.5, 0.2]), 0.12),
    ...hinge(P1, Y, 0.78, 0.62),
  ];
}
export function scorpArmFore() {
  const { P1, P2 } = SCORP_ARM;
  const R = seg(
    P1,
    P2,
    [
      [0, oct(0.6, 0.55, 0.5)],
      [0.35, oct(0.85, 0.75, 0.62)],
      [0.8, oct(0.74, 0.66, 0.56)],
      [1.02, oct(0.56, 0.5, 0.46)],
    ],
    UP,
  );
  const m = vlerp(P1, P2, 0.4);
  return [
    loft(JOINT, R),
    // 膝節的厚甲，分前後兩截
    panel(MAIN, R, 0.25, 1.45, 5.5, 10.5, { t: 0.24, ch: 0.09 }),
    panel(MAIN, R, 1.55, 2.7, 5.5, 10.5, { t: 0.2, ch: 0.08 }),
    panel(ACC, R, 1.44, 1.56, 5.5, 10.5, { t: 0.16, gap: 0, ch: 0.03 }),
    // 外側的棘
    hull(STEEL, [
      vadd(m, [0.95, 0.25, -0.3]),
      vadd(m, [0.95, -0.2, -0.3]),
      vadd(m, [0.95, 0.25, 0.4]),
      vadd(m, [0.95, -0.2, 0.4]),
      vadd(m, [1.75, 0.05, 0.75]),
    ]),
    ...hinge(P2, Y, 0.66, 0.6),
  ];
}
// 螯的本體（掌）與內側的固定指
export function scorpHand() {
  const { P2, F } = SCORP_ARM;
  const yc = P2[1];
  const out = [
    // 掌：扁而寬的方塊體，後窄前寬
    hull(MAIN, [
      [3.45, yc + 0.6, 7.5],
      [4.85, yc + 0.6, 7.5],
      [3.45, yc - 0.6, 7.5],
      [4.85, yc - 0.6, 7.5],
      [3.0, yc + 0.85, 8.4],
      [5.5, yc + 0.85, 8.4],
      [3.0, yc - 0.8, 8.4],
      [5.5, yc - 0.8, 8.4],
      [3.05, yc + 0.75, 9.3],
      [5.55, yc + 0.6, 9.1],
      [3.05, yc - 0.7, 9.3],
      [5.55, yc - 0.6, 9.1],
      [4.25, yc + 1.05, 8.5],
    ]),
    // 掌背的肋與外緣的護條
    box(ACC, [4.25, yc + 0.98, 8.45], [1.7, 0.14, 0.22], null, 0.03),
    box(SUB, [4.25, yc + 0.95, 7.95], [1.3, 0.16, 0.5], null, 0.05),
    box(SUB, [2.98, yc, 8.6], [0.14, 1.1, 1.2], null, 0.04),
    // 固定指（內側）：兩截，往外彎
    hull(MAIN, [
      [3.05, yc + 0.7, 9.2],
      [3.95, yc + 0.62, 9.2],
      [3.05, yc - 0.65, 9.2],
      [3.95, yc - 0.6, 9.2],
      [3.2, yc + 0.5, 10.5],
      [3.9, yc + 0.45, 10.5],
      [3.2, yc - 0.45, 10.5],
      [3.9, yc - 0.42, 10.5],
    ]),
    hull(MAIN, [
      [3.2, yc + 0.5, 10.45],
      [3.9, yc + 0.45, 10.45],
      [3.2, yc - 0.45, 10.45],
      [3.9, yc - 0.42, 10.45],
      [3.75, yc + 0.2, 11.3],
      [4.2, yc + 0.18, 11.25],
      [3.75, yc - 0.2, 11.3],
      [4.2, yc - 0.18, 11.25],
      [4.3, yc, 11.75],
    ]),
    // 指間的電漿切割器（採礦用）
    lathe(
      GUN,
      [4.25, yc, 9.0],
      [0, 0, 1],
      [
        [0, 0.34],
        [0.35, 0.34],
        [0.45, 0.24],
        [0.7, 0.2],
      ],
      10,
    ),
    cyl(BURN, [4.25, yc, 9.68], [4.25, yc, 9.78], 0.15, 8),
    // 可動指的座
    cyl(JOINT, [F[0], yc - 0.72, F[2]], [F[0], yc + 0.72, F[2]], 0.5, 16),
  ];
  // 固定指內緣的齒
  for (let k = 0; k < 4; k++)
    out.push(box(STEEL, [4.0 + k * 0.03, yc, 9.55 + k * 0.4], [0.2, 0.5 - k * 0.06, 0.22], [0, 20, 0]));
  return out;
}
// 可動指（外側）：以 F 為軸水平開合
export function scorpFinger() {
  const { P2, F } = SCORP_ARM;
  const yc = P2[1];
  const out = [
    hull(SUB, [
      [4.55, yc + 0.55, 8.75],
      [5.5, yc + 0.5, 8.75],
      [4.55, yc - 0.52, 8.75],
      [5.5, yc - 0.48, 8.75],
      [4.75, yc + 0.45, 10.4],
      [5.45, yc + 0.4, 10.4],
      [4.75, yc - 0.42, 10.4],
      [5.45, yc - 0.38, 10.4],
    ]),
    hull(SUB, [
      [4.75, yc + 0.45, 10.35],
      [5.45, yc + 0.4, 10.35],
      [4.75, yc - 0.42, 10.35],
      [5.45, yc - 0.38, 10.35],
      [4.5, yc + 0.18, 11.25],
      [4.95, yc + 0.18, 11.3],
      [4.5, yc - 0.18, 11.25],
      [4.95, yc - 0.18, 11.3],
      [4.4, yc, 11.7],
    ]),
    box(ACC, [5.5, yc, 9.6], [0.12, 0.6, 1.3], [0, -3, 0], 0.03),
    ...hinge(F, Y, 0.34, 0.66),
  ];
  for (let k = 0; k < 4; k++)
    out.push(box(STEEL, [4.68 - k * 0.03, yc, 9.5 + k * 0.4], [0.2, 0.46 - k * 0.06, 0.22], [0, -20, 0]));
  return out;
}

// ---- 尾 ----
// 第 i 節（0＝最靠身體）。背面（捲的內側）＝切線轉 90°
export function scorpTailSeg(i) {
  const a = SCORP_TAIL[i],
    b = SCORP_TAIL[i + 1];
  const d = vnorm(vsub(b, a));
  const n = [0, -d[2], d[1]]; // 背面
  const w = 1.0 - i * 0.05,
    t = 0.72 - i * 0.03;
  const R = seg(
    a,
    b,
    [
      [0.02, oct(w * 0.7, t * 0.8, t * 0.8)],
      [0.3, oct(w, t, t * 1.05)],
      [0.8, oct(w * 1.05, t * 1.05, t * 1.1)],
      [1.0, oct(w * 0.72, t * 0.8, t * 0.8)],
    ],
    n,
  );
  const P = (k, s, f) => vadd(vlerp(a, b, k), vadd([s, 0, 0], vmul(n, f)));
  const out = [
    loft(JOINT, R),
    // 背面的甲（中間留一道溝）、兩側的甲、腹面的龍骨
    panel(MAIN, R, 0.25, 2.75, 7.05, 9.95, { t: 0.16, ch: 0.06 }),
    panel(SUB, R, 0.35, 2.65, 1.1, 2.9, { t: 0.12, ch: 0.05 }),
    panel(SUB, R, 0.35, 2.65, 5.1, 6.9, { t: 0.12, ch: 0.05 }),
    panel(MAIN, R, 0.5, 2.5, 3.1, 4.9, { t: 0.14, ch: 0.05 }),
    hull(ACC, [
      P(0.3, 0.09, t + 0.12),
      P(0.3, -0.09, t + 0.12),
      P(0.3, 0.09, t + 0.24),
      P(0.3, -0.09, t + 0.24),
      P(0.72, 0.09, t + 0.14),
      P(0.72, -0.09, t + 0.14),
      P(0.72, 0.09, t + 0.26),
      P(0.72, -0.09, t + 0.26),
    ]),
    ...roundJoint(a, 0.62 - i * 0.03, w * 0.86),
  ];
  // 節末背面的一對棘
  for (const s of [1, -1])
    out.push(
      hull(STEEL, [
        P(0.7, s * w * 0.75, t * 0.9),
        P(0.7, s * w * 0.45, t * 0.9),
        P(0.95, s * w * 0.75, t * 0.85),
        P(0.95, s * w * 0.45, t * 0.85),
        P(1.02, s * w * 0.62, t + 0.55),
      ]),
    );
  return out;
}
// 毒囊與毒針
export function scorpSting() {
  const a = SCORP_TAIL[5];
  const e = vnorm([0, -0.22, 1]);
  const B = vadd(a, vmul(e, 2.3));
  const mid = [0, 8.95, -0.75],
    tip = [0, 7.75, -0.45];
  const cone = (slot, p, q, r0, r1) => {
    const v = vsub(q, p);
    return lathe(
      slot,
      p,
      v,
      [
        [0, r0],
        [Math.hypot(...v), r1],
      ],
      10,
    );
  };
  return [
    ...roundJoint(a, 0.5, 0.72),
    // 毒囊
    lathe(
      MAIN,
      a,
      e,
      [
        [0.1, 0.5],
        [0.6, 1.02],
        [1.4, 1.08],
        [2.0, 0.72],
        [2.4, 0.4],
      ],
      10,
    ),
    lathe(
      ACC,
      vadd(a, vmul(e, 0.95)),
      e,
      [
        [0, 1.12],
        [0.16, 1.12],
      ],
      10,
    ),
    // 兩側的毒液罐（發光）
    cyl(BURN, [0.98, a[1] - 0.3, a[2] + 0.85], [0.98, a[1] - 0.52, a[2] + 1.85], 0.26, 10, true),
    cyl(GUN, [0.98, a[1] - 0.26, a[2] + 0.68], [0.98, a[1] - 0.31, a[2] + 0.9], 0.31, 10, true),
    cyl(GUN, [0.98, a[1] - 0.51, a[2] + 1.8], [0.98, a[1] - 0.56, a[2] + 2.02], 0.31, 10, true),
    // 毒針：兩截，往前下方彎
    cone(STEEL, B, mid, 0.4, 0.24),
    cone(STEEL, mid, tip, 0.24, 0.02),
    lathe(
      BURN,
      vlerp(B, mid, 0.1),
      vsub(mid, B),
      [
        [0, 0.43],
        [0.12, 0.43],
      ],
      10,
    ),
  ];
}
