// 螳螂型機獸的附肢（原生建模，不經過縮放；左側 +x）：一對捕捉足（鐮刀）與兩對步足。
// 捕捉足照螳螂的樣子收在胸前：基節從前胸的上段往前下方、腿節粗壯往前上方折回、脛節是一把往回收的鐮刃（刃口朝腿節，合起來夾住獵物），
// 腿節內側一排棘。步足細長：腿節往外上方到高過背的膝、脛節往外下方、跗節踩地；中足略往前、後足往後伸得遠。
// 關節一律是正圓的圓柱（捕捉足的軸左右；步足的軸水平、和腿的方向垂直）。
import {
  cyl,
  hull,
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

// ---- 骨架 ----
export const MANTIS_ARM = {
  S: [1.05, 9.5, 4.85], // 基節的根（前胸的上段）
  C: [1.5, 7.1, 7.2], // 基節 → 腿節
  F: [1.6, 10.3, 9.6], // 腿節 → 脛節（鐮刃）
  T: [1.6, 7.1, 8.55], // 鐮刃收起時的末端
};
const leg = (hip, knee, ankle, foot) => {
  const d = vnorm([ankle[0] - hip[0], 0, ankle[2] - hip[2]]);
  return { hip, knee, ankle, foot, d, h: [-d[2], 0, d[0]] };
};
export const MANTIS_LEGS = {
  mid: leg([1.15, 4.0, 0.9], [4.1, 6.3, 1.9], [6.1, 1.0, 2.7], [6.7, 0, 2.95]),
  hind: leg([1.15, 4.0, -0.9], [3.9, 6.8, -2.7], [5.9, 1.0, -5.3], [6.4, 0, -6.0]),
};
const hinge = (c, h, r, hw) => [
  cyl(JOINT, vsub(c, vmul(h, hw)), vadd(c, vmul(h, hw)), r, 16),
  cyl(ACC, vsub(c, vmul(h, hw + 0.06)), vadd(c, vmul(h, hw + 0.06)), r * 0.5, 12),
];

// ---- 捕捉足 ----
export function mantisCoxa() {
  const { S, C } = MANTIS_ARM;
  const R = seg(
    S,
    C,
    [
      [-0.04, oct(0.42, 0.45, 0.45)],
      [0.2, oct(0.55, 0.62, 0.55)],
      [0.8, oct(0.5, 0.55, 0.5)],
      [1.03, oct(0.4, 0.42, 0.42)],
    ],
    [0, 0.6, 1],
  );
  return [
    loft(JOINT, R),
    panel(MAIN, R, 0.3, 2.6, 5.1, 10.9, { t: 0.16, ch: 0.06 }),
    panel(ACC, R, 2.62, 2.8, 5.1, 10.9, { t: 0.13, gap: 0, ch: 0.03 }),
    ...piston(GUN, STEEL, vadd(S, [0.1, -0.7, -0.2]), vadd(C, [0, 0.5, -0.75]), 0.1),
    ...roundJoint(S, 0.62, 0.52),
    ...roundJoint(C, 0.6, 0.6),
  ];
}
// 腿節：根部粗、往末端收；內側（朝鐮刃）一排棘
export function mantisFemur() {
  const { C, F } = MANTIS_ARM;
  const d = vnorm(vsub(F, C));
  const g = [0, d[2], -d[1]]; // 外側（背對鐮刃）
  const R = seg(
    C,
    F,
    [
      [0.02, oct(0.5, 0.55, 0.55)],
      [0.25, oct(0.72, 0.85, 0.8)],
      [0.65, oct(0.62, 0.7, 0.62)],
      [1.0, oct(0.42, 0.45, 0.45)],
    ],
    g,
  );
  const P = (u, v, x) => vadd(vadd(C, vmul(d, u)), vadd(vmul(g, v), [x, 0, 0]));
  const out = [
    loft(JOINT, R),
    // 外側與兩側的厚甲，分兩截
    panel(MAIN, R, 0.25, 1.45, 5.1, 10.9, { t: 0.2, ch: 0.08 }),
    panel(MAIN, R, 1.55, 2.8, 5.1, 10.9, { t: 0.17, ch: 0.07 }),
    panel(ACC, R, 1.44, 1.56, 5.1, 10.9, { t: 0.14, gap: 0, ch: 0.03 }),
    ...roundJoint(F, 0.5, 0.5),
  ];
  // 內側的棘：兩排，往末端變短
  for (let k = 0; k < 5; k++) {
    const u = 0.9 + k * 0.55,
      len = 0.34 - k * 0.03;
    for (const x of [0.28, -0.28])
      out.push(
        hull(STEEL, [
          P(u - 0.14, -0.5, x + 0.1),
          P(u - 0.14, -0.5, x - 0.1),
          P(u + 0.14, -0.48, x + 0.1),
          P(u + 0.14, -0.48, x - 0.1),
          P(u + 0.12, -0.5 - len, x),
        ]),
      );
  }
  return out;
}
// 脛節＝鐮刃：以 F 為軸開合；刃口朝腿節，末端一個鉤
export function mantisBlade() {
  const { F, T } = MANTIS_ARM;
  const e = vnorm(vsub(T, F));
  const g = [0, -e[2], e[1]]; // 朝腿節（刃口）
  const P = (u, v, x = 0) => vadd(vadd(F, vmul(e, u)), vadd(vmul(g, v), [x, 0, 0]));
  const both = (pts) => pts.flatMap(([u, v, x]) => [P(u, v, x), P(u, v, -x)]);
  const out = [
    // 刃背（厚）
    hull(
      MAIN,
      both([
        [0.15, -0.5, 0.26],
        [0.15, -0.1, 0.26],
        [1.6, -0.55, 0.22],
        [1.6, -0.2, 0.2],
        [2.9, -0.42, 0.16],
        [2.9, -0.15, 0.14],
      ]),
    ),
    // 刃身（薄的鋼片）：中段最寬
    hull(
      STEEL,
      both([
        [0.3, -0.2, 0.1],
        [0.35, 0.4, 0.03],
        [1.8, -0.25, 0.1],
        [1.8, 0.62, 0.03],
        [3.1, -0.2, 0.08],
        [3.2, 0.42, 0.03],
      ]),
    ),
    // 末端的鉤：往刃口那一側彎
    hull(
      STEEL,
      both([
        [3.0, -0.38, 0.1],
        [3.05, 0.4, 0.03],
        [3.7, -0.2, 0.07],
        [3.75, 0.5, 0.03],
        [4.25, 0.95, 0.01],
      ]),
    ),
    // 刃口的能量刃
    hull(
      BURN,
      both([
        [0.4, 0.38, 0.05],
        [0.4, 0.5, 0.01],
        [1.8, 0.6, 0.05],
        [1.8, 0.74, 0.01],
        [3.2, 0.4, 0.05],
        [3.2, 0.54, 0.01],
      ]),
    ),
    hull(
      BURN,
      both([
        [3.2, 0.4, 0.05],
        [3.2, 0.54, 0.01],
        [3.75, 0.5, 0.04],
        [3.8, 0.66, 0.01],
        [4.3, 1.02, 0.01],
      ]),
    ),
    // 刃背的能量導管
    cyl(GUN, P(0.3, -0.62, 0), P(2.7, -0.52, 0), 0.11, 8),
    ...roundJoint(F, 0.4, 0.62, ACC),
  ];
  return out;
}

// ---- 步足（which＝'mid'／'hind'）----
// 步足的截面：比照真實比例再粗兩成（機獸要有份量）
const lo = (a, b, c) => oct(a * 1.22, b * 1.22, c * 1.22);
export function mantisLegA(which) {
  const { hip, knee, d, h } = MANTIS_LEGS[which];
  const R = seg(
    hip,
    knee,
    [
      [-0.06, lo(0.36, 0.38, 0.38)],
      [0.15, lo(0.46, 0.5, 0.46)],
      [0.8, lo(0.38, 0.4, 0.36)],
      [1.04, lo(0.3, 0.32, 0.3)],
    ],
    UP,
  );
  return [
    loft(JOINT, R),
    panel(MAIN, R, 0.3, 2.6, 5.6, 10.4, { t: 0.14, ch: 0.05 }),
    ...piston(
      GUN,
      STEEL,
      vadd(vlerp(hip, knee, 0.1), vadd(vmul(d, 0.2), [0, -0.42, 0])),
      vadd(vlerp(hip, knee, 0.85), [0, -0.42, 0]),
      0.08,
    ),
    ...hinge(knee, h, 0.42, 0.42),
  ];
}
export function mantisLegB(which) {
  const { knee, ankle, d, h } = MANTIS_LEGS[which];
  const R = seg(
    knee,
    ankle,
    [
      [0, lo(0.32, 0.36, 0.32)],
      [0.2, lo(0.38, 0.44, 0.36)],
      [0.85, lo(0.28, 0.3, 0.27)],
      [1.03, lo(0.22, 0.24, 0.22)],
    ],
    UP,
  );
  const n = vnorm(vadd(d, [0, 0.5, 0]));
  const m = vlerp(knee, ankle, 0.18);
  return [
    loft(JOINT, R),
    panel(MAIN, R, 0.2, 2.5, 5.6, 10.4, { t: 0.12, ch: 0.05 }),
    panel(ACC, R, 2.55, 2.72, 5.6, 10.4, { t: 0.1, gap: 0, ch: 0.02 }),
    // 膝下的短棘
    hull(STEEL, [
      vadd(m, vadd(vmul(n, 0.36), vmul(h, 0.1))),
      vadd(m, vadd(vmul(n, 0.36), vmul(h, -0.1))),
      vadd(vlerp(knee, ankle, 0.36), vadd(vmul(n, 0.3), vmul(h, 0.07))),
      vadd(vlerp(knee, ankle, 0.36), vadd(vmul(n, 0.3), vmul(h, -0.07))),
      vadd(vlerp(knee, ankle, 0.24), vmul(n, 0.85)),
    ]),
    ...hinge(ankle, h, 0.3, 0.32),
  ];
}
export function mantisLegC(which) {
  const { ankle, foot, d, h } = MANTIS_LEGS[which];
  const tip = [foot[0], 0.36, foot[2]];
  const R = seg(
    ankle,
    tip,
    [
      [0, lo(0.22, 0.24, 0.22)],
      [0.5, lo(0.24, 0.28, 0.2)],
      [1, lo(0.17, 0.18, 0.17)],
    ],
    d,
  );
  const g = (a, b, y) => [foot[0] + d[0] * a + h[0] * b, y, foot[2] + d[2] * a + h[2] * b];
  return [
    loft(JOINT, R),
    panel(MAIN, R, 0.15, 1.8, 6.4, 9.6, { t: 0.08, ch: 0.03 }),
    // 腳尖：前面一對小爪、後面一個踵
    hull(STEEL, [g(-0.15, 0.2, 0.42), g(-0.15, 0.04, 0.42), g(0.1, 0.12, 0.46), g(0.42, 0.26, 0)]),
    hull(STEEL, [g(-0.15, -0.2, 0.42), g(-0.15, -0.04, 0.42), g(0.1, -0.12, 0.46), g(0.42, -0.26, 0)]),
    hull(SUB, [g(-0.18, 0.14, 0.44), g(-0.18, -0.14, 0.44), g(0, 0, 0.46), g(-0.4, 0, 0)]),
  ];
}
