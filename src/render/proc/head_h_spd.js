// HD-ARACHNE 複眼頭（草模，2026-11-17）：GRANITE 頭（head_h_std.js 的清單）＋手寫的蜘蛛眼、螯肢與毒牙、感測剛毛。
// 兩種排列給使用者比較：A＝跳蛛（正面一排 4 顆：中間特大、兩旁中型；頭側 2 顆極小；兩頰的艙 2 顆中型）、
// B＝狼蛛（三排 4-2-2：下排 4 顆小的、中排 2 顆特大、上排 2 顆中型往後退）。
// 座標是 glTF（+Z 正面）、公尺，和 GRANITE 頭相同；色槽 4＝螢光紅的鏡片（自發光）、5＝眼窩的深色（SPD_COLS）。
import { p_head_h_stdPrims } from './head_h_std.js';

export const p_head_h_spdCols = ['#ff1030!', '#1b1216'];
const LENS = 4,
  SOCKET = 5;

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const r3 = (x) => Math.round(x * 1000) / 1000;
// 繞 dir 的旋轉體（凸）：rings＝[[沿 dir 的距離, 半徑]…]（由後往前），n 邊；mir＝左右鏡射再放一份
function lathe(slot, c, dir, rings, n, mir) {
  const d = norm(dir);
  const u = norm(cross(Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], d));
  const v = cross(d, u);
  const pts = [];
  for (const [off, r] of rings)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2,
        cu = Math.cos(a) * r,
        cv = Math.sin(a) * r;
      pts.push([0, 1, 2].map((k) => r3(c[k] + d[k] * off + u[k] * cu + v[k] * cv)));
    }
  const faces = [];
  const ring = (k) => Array.from({ length: n }, (_, i) => k * n + i);
  faces.push(ring(0).reverse());
  for (let k = 0; k + 1 < rings.length; k++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push([k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i]);
    }
  faces.push(ring(rings.length - 1));
  return mir ? ['H', slot, pts, faces, 1] : ['H', slot, pts, faces];
}
// 一顆眼：深色的眼窩（短圓筒，後段埋進表面）＋螢光紅的圓頂鏡片。c＝表面上的位置、dir＝看的方向、R＝眼窩半徑
function eye(c, dir, R, n = 14) {
  return [
    lathe(
      SOCKET,
      c,
      dir,
      [
        [-1.1 * R, R],
        [0.55 * R, R],
        [0.72 * R, 0.9 * R],
      ],
      n,
      1,
    ),
    lathe(
      LENS,
      c,
      dir,
      [
        [0.5 * R, 0.8 * R],
        [0.86 * R, 0.74 * R],
        [1.08 * R, 0.56 * R],
        [1.2 * R, 0.3 * R],
      ],
      n,
      1,
    ),
  ];
}
// GRANITE 的大斜面（正面的楔形面板）：t＝0 上緣（眉）→ 1 下緣（鼻樑），半寬 0.28 → 0.15
const face = (t, x) => [x, 0.71 - 0.39 * t, 0.38 + 0.43 * t];
const FWD = [0, 0.34, 0.94]; // 正面的眼睛：往前、略往上 20°（斜面本身朝上 48°）

// 螯肢（下巴前端往下的一對粗節）＋毒牙（尖端往內收）；k＝大小
function fangs(k) {
  const base = [0.075, 0.03, 0.8];
  const d1 = norm([0.05, -0.9, 0.42]);
  const L = 0.17 * k;
  const tip = base.map((b, i) => b + d1[i] * L);
  return [
    lathe(
      1,
      base,
      d1,
      [
        [-0.03, 0.04 * k],
        [0.03, 0.055 * k],
        [L * 0.8, 0.05 * k],
        [L, 0.034 * k],
      ],
      8,
      1,
    ),
    lathe(
      3,
      tip,
      [-0.5, -0.82, -0.25],
      [
        [-0.02, 0.03 * k],
        [0.06 * k, 0.02 * k],
        [0.14 * k, 0.004],
      ],
      6,
      1,
    ),
  ];
}
// 感測剛毛：後腦上方往後上方的細刺
function bristles() {
  const out = [];
  for (const [x, z, l] of [
    [0.1, -0.3, 0.3],
    [0.2, -0.38, 0.24],
    [0.05, -0.44, 0.2],
  ])
    out.push(
      lathe(
        3,
        [x, 0.87, z],
        [x * 0.6, 0.75, -0.6],
        [
          [-0.03, 0.016],
          [l * 0.5, 0.011],
          [l, 0.003],
        ],
        4,
        1,
      ),
    );
  return out;
}

// A 跳蛛
export const p_head_h_spdAPrims = [
  ...p_head_h_stdPrims,
  ...eye(face(0.62, 0.098), FWD, 0.086, 18), // 前中眼（特大）
  ...eye(face(0.3, 0.186), [0.18, 0.36, 0.92], 0.05), // 前側眼（中）
  ...eye([0.262, 0.83, 0.2], [0.45, 0.62, 0.64], 0.024, 10), // 後中眼（極小，耳的斜面上）
  ...eye([0.325, 0.37, 0.26], [0.86, 0.12, 0.5], 0.05), // 後側眼（中，兩頰的艙）
  ...fangs(1),
];
// B 狼蛛
export const p_head_h_spdBPrims = [
  ...p_head_h_stdPrims,
  ...eye(face(0.3, 0.113), FWD, 0.1, 18), // 中排（特大）
  ...eye(face(0.76, 0.041), FWD, 0.03, 10), // 下排 4 顆小的
  ...eye(face(0.74, 0.116), [0.12, 0.34, 0.93], 0.03, 10),
  ...eye([0.255, 0.95, 0.0], [0.4, 0.72, 0.56], 0.056), // 上排（中，往後退到耳的頂端）
  ...fangs(1.25),
  ...bristles(),
];
