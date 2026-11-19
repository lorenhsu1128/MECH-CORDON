// 猛禽型機獸的翼與腿（原生建模，不經過縮放；左側 +x）。
// 翼照鳥的翼骨分三節：上臂（肱骨）、前臂（尺橈骨）、手（腕掌骨）；模型的站姿＝翼往兩側平展（飛行的樣子），收翼靠關節轉（肘與腕的軸垂直）。
// 羽一片一片各自是一塊薄板：上臂後緣的三級飛羽、前臂的次級飛羽、手上的初級飛羽（老鷹的翼尖像手指一樣分開，做成一片片鋼刃），上面蓋著覆羽的甲。
// 腿照鳥的後肢：包著羽毛的粗壯小腿（脛）往前下方、跗蹠往後下方（膝看起來往後彎）、三趾在前一趾在後，每趾一根大鉤爪。
// 關節一律是正圓（圓柱或球）。
import {
  ball,
  box,
  cyl,
  hull,
  lathe,
  loft,
  oct,
  panel,
  roundJoint,
  seg,
  vadd,
  vcross,
  vlerp,
  vmul,
  vnorm,
} from './beast_kit.js';

const MAIN = 0,
  SUB = 1,
  JOINT = 2,
  ACC = 3,
  GUN = 6,
  STEEL = 7,
  BURN = 8;
const FWD = [0, 0, 1],
  Y = [0, 1, 0];

export const RAPTOR_WING = {
  S: [1.0, 4.15, 0.6], // 肩
  E: [3.3, 4.3, 0.2], // 肘
  W: [5.2, 4.3, 0.9], // 腕
  TIP: [6.9, 4.25, 0.5], // 手的末端
};
export const RAPTOR_LEG = {
  H: [0.8, 3.0, -0.2], // 髖（實際是膝，股骨藏在身體裡）
  A: [0.85, 1.55, 0.3], // 踝（跗關節）
  F: [0.85, 0.34, -0.05], // 腳掌
  T: [0.85, 0.3, 0.15], // 前三趾的根
};

// 一片羽：從 root 沿 dir 長 len、根部寬 w；薄板，末端收尖
const feather = (slot, root, dir, len, w, dy = 0) => {
  const n = vnorm(dir);
  const s = vnorm(vcross(Y, n));
  const P = (u, v, y) => vadd(vadd(root, vmul(n, u * len)), vadd(vmul(s, v * w), [0, y + dy, 0]));
  return hull(slot, [
    P(0, 0.4, 0.05),
    P(0, -0.4, 0.05),
    P(0, 0.4, -0.05),
    P(0, -0.4, -0.05),
    P(0.6, 0.5, 0.035),
    P(0.6, -0.5, 0.035),
    P(0.6, 0.5, -0.035),
    P(0.6, -0.5, -0.035),
    P(0.9, 0.28, 0),
    P(0.9, -0.3, 0),
    P(1, -0.05, 0),
  ]);
};
// 覆羽的甲：蓋在翼骨與飛羽根部上面的一片厚板（a、b＝翼骨的兩端；back＝往後蓋多遠）
const covert = (slot, a, b, back0, back1, t = 0.13) => {
  const top = [
    vadd(a, [0, 0.22, 0.3]),
    vadd(b, [0, 0.2, 0.3]),
    vadd(a, [0, 0.14, -back0]),
    vadd(b, [0, 0.12, -back1]),
  ];
  return hull(slot, [...top, ...top.map((p) => [p[0], p[1] - t, p[2]])]);
};
const hingeY = (c, r, hw) => [
  cyl(JOINT, [c[0], c[1] - hw, c[2]], [c[0], c[1] + hw, c[2]], r, 16),
  cyl(ACC, [c[0], c[1] - hw - 0.06, c[2]], [c[0], c[1] + hw + 0.06, c[2]], r * 0.5, 12),
];

// ---- 翼 ----
export function raptorWingArm() {
  const { S, E } = RAPTOR_WING;
  const R = seg(
    S,
    E,
    [
      [0, oct(0.36, 0.42, 0.38)],
      [0.5, oct(0.34, 0.44, 0.4)],
      [1, oct(0.3, 0.36, 0.34)],
    ],
    FWD,
  );
  const out = [
    loft(JOINT, R),
    // 翼前緣的甲
    panel(MAIN, R, 0.1, 1.9, 6.6, 9.4, { t: 0.14, ch: 0.05 }),
    covert(MAIN, vlerp(S, E, 0.08), vlerp(S, E, 0.97), 1.0, 1.15),
    box(ACC, vadd(vlerp(S, E, 0.5), [0, 0.2, -1.0]), [2.0, 0.06, 0.1], [0, 4, 0]),
    // 肩：上下拍的軸（前後向）
    cyl(JOINT, [S[0], S[1], S[2] - 0.5], [S[0], S[1], S[2] + 0.5], 0.5, 16),
    cyl(ACC, [S[0], S[1], S[2] + 0.5], [S[0], S[1], S[2] + 0.57], 0.26, 12),
    ...hingeY(E, 0.38, 0.36),
  ];
  // 三級飛羽
  [0.25, 0.55, 0.85].forEach((t, k) =>
    out.push(
      feather(
        SUB,
        vadd(vlerp(S, E, t), [0, -0.02, -0.5]),
        [-0.12, -0.04, -1],
        2.3 + k * 0.2,
        0.85,
        k * 0.035,
      ),
    ),
  );
  return out;
}
export function raptorWingFore() {
  const { E, W } = RAPTOR_WING;
  const R = seg(
    E,
    W,
    [
      [0, oct(0.3, 0.36, 0.34)],
      [0.5, oct(0.3, 0.38, 0.34)],
      [1, oct(0.26, 0.3, 0.3)],
    ],
    FWD,
  );
  const m = vlerp(E, W, 0.45);
  const out = [
    loft(JOINT, R),
    panel(MAIN, R, 0.1, 1.9, 6.6, 9.4, { t: 0.13, ch: 0.05 }),
    covert(MAIN, vlerp(E, W, 0.05), vlerp(E, W, 0.97), 1.15, 1.05),
    box(ACC, vadd(m, [0, 0.19, -0.9]), [1.8, 0.06, 0.1], [0, -18, 0]),
    // 翼下的推進器
    lathe(
      GUN,
      vadd(m, [0, -0.5, 0.35]),
      [0, 0, -1],
      [
        [0, 0.24],
        [0.12, 0.32],
        [0.9, 0.32],
        [1.0, 0.38],
        [1.15, 0.38],
        [1.22, 0.3],
        [1.6, 0.34],
      ],
      12,
    ),
    cyl(BURN, vadd(m, [0, -0.5, -1.27]), vadd(m, [0, -0.5, -1.32]), 0.27, 10),
    box(SUB, vadd(m, [0, -0.2, -0.2]), [0.3, 0.3, 0.9], null, 0.05),
    ...hingeY(W, 0.32, 0.32),
  ];
  // 次級飛羽
  [0.08, 0.28, 0.48, 0.68, 0.88].forEach((t, k) =>
    out.push(
      feather(
        SUB,
        vadd(vlerp(E, W, t), [0, -0.02, -0.45]),
        [0.02 + k * 0.03, -0.04, -1],
        2.7 + k * 0.08,
        0.8,
        k * 0.03,
      ),
    ),
  );
  return out;
}
export function raptorWingHand() {
  const { W, TIP } = RAPTOR_WING;
  const R = seg(
    W,
    TIP,
    [
      [0, oct(0.26, 0.3, 0.3)],
      [0.6, oct(0.22, 0.26, 0.24)],
      [1, oct(0.12, 0.14, 0.14)],
    ],
    FWD,
  );
  const out = [
    loft(JOINT, R),
    panel(MAIN, R, 0.1, 1.8, 6.6, 9.4, { t: 0.1, ch: 0.04 }),
    covert(MAIN, vlerp(W, TIP, 0.05), vlerp(W, TIP, 0.9), 0.95, 0.6, 0.11),
    // 小翼羽：腕前緣的一根短刃
    hull(STEEL, [
      vadd(W, [0.1, 0.1, 0.3]),
      vadd(W, [0.1, -0.1, 0.3]),
      vadd(W, [0.5, 0.08, 0.32]),
      vadd(W, [0.5, -0.08, 0.32]),
      vadd(W, [1.0, 0, 0.75]),
    ]),
  ];
  // 初級飛羽：六片鋼刃，越往外越朝翼尖，末端分開
  for (let k = 0; k < 6; k++) {
    const u = k / 5;
    const root = vadd(vlerp(W, TIP, 0.05 + u * 0.92), [0, -0.02, -0.3 + u * 0.15]);
    const dir = [0.12 + u * 0.95, -0.03, -1 + u * 0.72];
    const len = 3.0 + Math.sin(u * 2.4) * 0.55 - u * 0.5;
    out.push(feather(STEEL, root, dir, len, 0.6 - u * 0.12, k * 0.03));
    // 羽軸
    out.push(
      cyl(
        GUN,
        vadd(root, [0, 0.07 + k * 0.03, 0]),
        vadd(vadd(root, vmul(vnorm(dir), len * 0.85)), [0, 0.05 + k * 0.03, 0]),
        0.04,
        5,
      ),
    );
  }
  return out;
}

// ---- 腿 ----
// 脛：包著羽毛的粗腿（「褲子」）
export function raptorThigh() {
  const { H, A } = RAPTOR_LEG;
  const R = seg(
    H,
    A,
    [
      [-0.12, oct(0.45, 0.55, 0.55)],
      [0.2, oct(0.62, 0.78, 0.72)],
      [0.7, oct(0.42, 0.46, 0.46)],
      [1.0, oct(0.28, 0.3, 0.3)],
    ],
    FWD,
  );
  return [
    loft(JOINT, R),
    // 羽褲：前後兩片厚甲，下緣三片垂下的羽
    panel(MAIN, R, 0.1, 2.0, 6.3, 9.7, { t: 0.18, ch: 0.07 }),
    panel(MAIN, R, 0.2, 2.0, 2.3, 5.7, { t: 0.16, ch: 0.07 }),
    panel(SUB, R, 0.3, 1.9, 0.2, 1.8, { t: 0.12, ch: 0.05 }),
    panel(SUB, R, 0.3, 1.9, 10.2, 11.8, { t: 0.12, ch: 0.05 }),
    ...[-0.3, 0, 0.3].map((x) =>
      hull(MAIN, [
        vadd(vlerp(H, A, 0.62), [x - 0.16, 0, -0.5]),
        vadd(vlerp(H, A, 0.62), [x + 0.16, 0, -0.5]),
        vadd(vlerp(H, A, 0.62), [x - 0.16, 0, -0.38]),
        vadd(vlerp(H, A, 0.62), [x + 0.16, 0, -0.38]),
        vadd(vlerp(H, A, 0.95), [x, -0.05, -0.62]),
      ]),
    ),
    ...roundJoint(A, 0.34, 0.34),
  ];
}
// 跗蹠：細而硬，前面一排鱗板
export function raptorTarsus() {
  const { A, F } = RAPTOR_LEG;
  const R = seg(
    A,
    F,
    [
      [0, oct(0.26, 0.28, 0.28)],
      [0.5, oct(0.24, 0.27, 0.25)],
      [1, oct(0.28, 0.3, 0.28)],
    ],
    FWD,
  );
  const out = [loft(JOINT, R), ...roundJoint(F, 0.28, 0.32)];
  for (let k = 0; k < 4; k++)
    out.push(panel(ACC, R, 0.2 + k * 0.4, 0.55 + k * 0.4, 6.8, 9.2, { t: 0.07, gap: 0.02, ch: 0.02 }));
  return out;
}
// 鉤爪：從 p 沿 dir 往前、往下彎到地面
const talon = (p, dir, len, r) => {
  const n = vnorm(dir);
  const mid = vadd(vadd(p, vmul(n, len * 0.55)), [0, 0.06, 0]);
  const tip = [p[0] + n[0] * len, 0, p[2] + n[2] * len];
  const cone = (a, b, r0, r1) => {
    const v = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    return lathe(
      STEEL,
      a,
      v,
      [
        [0, r0],
        [Math.hypot(...v), r1],
      ],
      8,
    );
  };
  return [cone(p, mid, r, r * 0.62), cone(mid, tip, r * 0.62, 0.015)];
};
// 腳掌與後趾
export function raptorFoot() {
  const { F } = RAPTOR_LEG;
  return [
    hull(SUB, [
      [F[0] - 0.34, 0.5, F[2] - 0.3],
      [F[0] + 0.34, 0.5, F[2] - 0.3],
      [F[0] - 0.4, 0.5, F[2] + 0.35],
      [F[0] + 0.4, 0.5, F[2] + 0.35],
      [F[0] - 0.3, 0.12, F[2] - 0.25],
      [F[0] + 0.3, 0.12, F[2] - 0.25],
      [F[0] - 0.36, 0.12, F[2] + 0.3],
      [F[0] + 0.36, 0.12, F[2] + 0.3],
    ]),
    // 後趾
    box(SUB, [F[0], 0.3, F[2] - 0.6], [0.3, 0.28, 0.7], [-8, 0, 0], 0.06),
    ball(JOINT, [F[0], 0.32, F[2] - 0.95], 0.2, 8),
    ...talon([F[0], 0.32, F[2] - 0.95], [0, 0, -1], 0.85, 0.17),
  ];
}
// 前三趾：一起以趾根為軸抓握
export function raptorToes() {
  const { T } = RAPTOR_LEG;
  const out = [cyl(JOINT, [T[0] - 0.42, T[1], T[2]], [T[0] + 0.42, T[1], T[2]], 0.2, 14)];
  for (const a of [-0.5, 0, 0.5]) {
    const d = [Math.sin(a), 0, Math.cos(a)];
    const len = a ? 0.95 : 1.15;
    const p0 = [T[0] + d[0] * 0.15, 0.3, T[2] + d[2] * 0.15];
    const p1 = [T[0] + d[0] * len, 0.3, T[2] + d[2] * len];
    out.push(
      box(SUB, vlerp(p0, p1, 0.5), [0.3, 0.27, len - 0.1], [0, (a * 180) / Math.PI, 0], 0.06),
      box(ACC, vadd(vlerp(p0, p1, 0.5), [0, 0.14, 0]), [0.2, 0.05, len * 0.6], [0, (a * 180) / Math.PI, 0]),
      ball(JOINT, p1, 0.2, 8),
      ...talon(p1, d, 0.9, 0.17),
    );
  }
  return out;
}
