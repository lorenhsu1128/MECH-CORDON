// 鱷龜型機獸的四肢與尾巴（原生建模，不經過縮放；左側 +x）。爬行類往外撐的肢：肱骨／股骨從背甲下往外伸、前臂／小腿往下，都很短；掌骨極短。
// 造型：圓柱形的粗短肢節、整圈交錯的鱗甲、肘與膝外側的瘤刺、寬而扁的蹼掌與五支粗短的爪。關節是正圓的圓球（往外撐的肢從哪個方向看都要是圓的）。
// 尾巴：由粗到細的節，每一節上面三道稜刺（中間高、兩側低），末端一根尖錐。
import { ball, box, hull, hullS, lathe, loft, oct, panel, rel, seg, vadd, vlerp } from './beast_kit.js';

const MAIN = 0,
  SUB = 1,
  JOINT = 2,
  ACC = 3,
  STEEL = 7;
export const TURTLE_LEG = {
  S: [2.9, 2.35, 3.0],
  E: [4.0, 1.8, 2.5],
  W: [4.4, 0.85, 3.0],
  K: [4.5, 0.4, 3.15],
  H: [2.7, 2.3, -3.2],
  N: [3.8, 1.75, -2.7],
  Tk: [4.2, 0.9, -3.45],
  A: [4.3, 0.4, -3.25],
  tail: [
    [0, 1.9, -4.9],
    [0, 1.55, -6.1],
    [0, 1.15, -7.2],
    [0, 0.85, -8.2],
    [0, 0.65, -9.1],
    [0, 0.55, -9.9],
  ],
};
const L = TURTLE_LEG;
// 整圈交錯的鱗甲：R 的每一段繞一圈四片，隔一段錯開半片
const scales = (R, t = 0.1) => {
  const out = [];
  for (let i = 0; i + 1 < R.length; i++)
    for (let j = 0; j < 4; j++) {
      const j0 = j * 2 + (i % 2);
      out.push(
        panel((i + j) % 2 ? SUB : MAIN, R, i + 0.03, i + 0.97, j0, j0 + 2, { t, gap: 0.05, ch: 0.05 }),
      );
    }
  return out;
};
// 圓錐形的瘤刺：底在 o、往 dir 突出
const knob = (slot, o, dir, r, h) =>
  lathe(
    slot,
    o,
    dir,
    [
      [-0.05, r],
      [h * 0.3, r * 0.75],
      [h, 0.02],
    ],
    7,
  );

// 一節肢：a → b，半徑 r0 → r1
function limb(a, b, r0, r1, n = 3) {
  const list = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n,
      r = r0 + (r1 - r0) * t;
    list.push([0.08 + t * 0.84, oct(r, r, r, 0.6)]);
  }
  const R = seg(a, b, list);
  return [loft(JOINT, R), ...scales(R)];
}
export function turtleFlUpper() {
  const { S, E } = L;
  return [
    ball(JOINT, S, 0.72, 12),
    ...limb(S, E, 0.66, 0.6),
    ball(JOINT, E, 0.62, 12),
    lathe(
      ACC,
      vadd(E, [0.45, 0.25, -0.1]),
      [1, 0.55, -0.2],
      [
        [0, 0.32],
        [0.1, 0.32],
        [0.15, 0.2],
      ],
      10,
    ),
    knob(SUB, vadd(E, [0.2, 0.3, -0.45]), [0.5, 0.6, -1], 0.26, 0.75),
  ];
}
export function turtleFlFore() {
  const { E, W } = L;
  return [
    ...limb(E, W, 0.58, 0.52),
    knob(SUB, vadd(vlerp(E, W, 0.35), [0.5, 0.1, 0]), [1, 0.2, 0], 0.2, 0.5),
    knob(SUB, vadd(vlerp(E, W, 0.7), [0.46, 0.05, 0]), [1, 0.1, 0], 0.17, 0.42),
    ball(JOINT, W, 0.52, 12),
  ];
}
export function turtleFlMeta() {
  const { W, K } = L;
  const R = seg(W, K, [
    [0.1, oct(0.48, 0.5, 0.5, 0.6)],
    [0.95, oct(0.52, 0.56, 0.52, 0.6)],
  ]);
  return [loft(JOINT, R), panel(ACC, R, 0.2, 0.8, 0, 8, { t: 0.09, gap: 0, ch: 0.03 })];
}
// 蹼掌：c＝踝的位置；寬而扁的扇形、趾間有蹼、五支粗短的爪
export function turtlePaw(c) {
  const g = (pts) => pts.map(([a, b, d]) => [c[0] + a, b, c[2] + d]);
  const sym = (pts) =>
    g(
      pts.flatMap(([a, b, d]) =>
        a
          ? [
              [a, b, d],
              [-a, b, d],
            ]
          : [[a, b, d]],
      ),
    );
  const out = [
    ball(JOINT, c, 0.5, 12),
    hull(
      MAIN,
      sym([
        [0.55, 0.05, -0.5],
        [0.5, 0.55, -0.4],
        [0.85, 0.05, 0.45],
        [0.75, 0.42, 0.4],
        [0.35, 0.7, 0.0],
        [0, 0.5, 0.7],
      ]),
    ),
    // 蹼
    hull(
      SUB,
      sym([
        [0.6, 0.03, 0.2],
        [1.02, 0.03, 0.75],
        [0.55, 0.03, 1.2],
        [0, 0.03, 1.32],
        [0.6, 0.16, 0.3],
        [0.5, 0.14, 1.0],
        [0, 0.16, 1.1],
      ]),
    ),
    box(SUB, [c[0], 0.03, c[2] - 0.05], [1.2, 0.06, 0.9], null, 0.02),
  ];
  for (const deg of [-52, -26, 0, 26, 52]) {
    const a = (deg * Math.PI) / 180;
    const o = [c[0] + Math.sin(a) * 0.88, 0.2, c[2] + 0.25 + Math.cos(a) * 0.82];
    out.push(
      lathe(
        STEEL,
        o,
        [Math.sin(a), -0.22, Math.cos(a)],
        [
          [-0.1, 0.15],
          [0.2, 0.12],
          [0.62, 0.015],
        ],
        7,
      ),
    );
  }
  return out;
}
export function turtleBlThigh() {
  const { H, N } = L;
  return [
    ball(JOINT, H, 0.74, 12),
    ...limb(H, N, 0.68, 0.62),
    ball(JOINT, N, 0.64, 12),
    lathe(
      ACC,
      vadd(N, [0.46, 0.26, 0.1]),
      [1, 0.55, 0.2],
      [
        [0, 0.33],
        [0.1, 0.33],
        [0.15, 0.2],
      ],
      10,
    ),
    knob(SUB, vadd(N, [0.2, 0.3, 0.45]), [0.5, 0.6, 1], 0.26, 0.7),
  ];
}
export function turtleBlShin() {
  const { N, Tk } = L;
  return [
    ...limb(N, Tk, 0.6, 0.54),
    knob(SUB, vadd(vlerp(N, Tk, 0.4), [0.5, 0.1, -0.1]), [1, 0.2, -0.3], 0.2, 0.5),
    ball(JOINT, Tk, 0.54, 12),
  ];
}
export function turtleBlMeta() {
  const { Tk, A } = L;
  const R = seg(Tk, A, [
    [0.1, oct(0.5, 0.52, 0.52, 0.6)],
    [0.95, oct(0.54, 0.58, 0.54, 0.6)],
  ]);
  return [loft(JOINT, R), panel(ACC, R, 0.2, 0.8, 0, 8, { t: 0.09, gap: 0, ch: 0.03 })];
}

// 尾巴的節：由粗到細，上面三道稜刺
export function turtleTailSeg(k) {
  const a = L.tail[k],
    b = L.tail[k + 1];
  const r0 = 0.66 - k * 0.1,
    r1 = r0 - 0.1;
  const R = seg(
    a,
    b,
    [
      [0.05, oct(r0, r0 * 0.85, r0 * 0.85, 0.6)],
      [0.95, oct(r1, r1 * 0.85, r1 * 0.85, 0.6)],
    ],
    [0, 1, 0],
  );
  const m = vlerp(a, b, 0.5),
    rm = (r0 + r1) / 2;
  return [
    loft(JOINT, R),
    panel(MAIN, R, 0, 1, 5.5, 10.5, { t: 0.08, gap: 0.04, ch: 0.04 }),
    panel(SUB, R, 0, 1, 1.5, 4.5, { t: 0.06, gap: 0.04, ch: 0.04 }),
    hullS(
      MAIN,
      rel(m, [
        [0.14, rm * 0.8, 0.35],
        [0.14, rm * 0.8, -0.3],
        [0, rm * 0.8 + 0.75 - k * 0.1, -0.45],
        [0, rm * 0.7, -0.5],
      ]),
    ),
    hull(
      SUB,
      rel(m, [
        [rm * 0.7, rm * 0.5, 0.3],
        [rm * 0.7, rm * 0.5, -0.25],
        [rm * 0.5, rm * 0.75, 0.0],
        [rm * 1.0, rm * 0.5 + 0.42 - k * 0.06, -0.4],
        [rm * 0.9, rm * 0.3, 0.0],
      ]),
      true,
    ),
    ball(JOINT, b, r1 * 1.05, 10),
  ];
}
export function turtleTailTip() {
  const o = L.tail[5];
  return [
    hullS(
      MAIN,
      rel(o, [
        [0, 0.17, 0.05],
        [0.17, 0, 0.05],
        [0, -0.17, 0.05],
        [0, -0.05, -1.4],
      ]),
    ),
    hullS(
      SUB,
      rel(o, [
        [0, 0.15, -0.1],
        [0.05, 0.15, -0.4],
        [0, 0.55, -0.55],
        [0, 0.12, -0.75],
      ]),
    ),
  ];
}
