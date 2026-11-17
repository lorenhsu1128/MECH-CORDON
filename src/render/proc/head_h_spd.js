// HD-ARACHNE 複眼頭（草模，2026-11-17）：GRANITE 頭（head_h_std.js 的清單）＋手寫的蜘蛛眼。
// 排列照跳蛛（使用者選定）：最大的一對跨在正面斜面與側面的稜線上（一半在側面）、它的上方一對中型、下方一對小的（使用者追加）、
// 耳的斜面上一對極小、兩頰的艙上一對中型。
// 座標是 glTF（+Z 正面）、公尺，和 GRANITE 頭相同；色槽 4＝螢光紅的鏡片（自發光）、5＝眼窩的深色（p_head_h_spdCols）。
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
// 一顆眼：深色的眼窩（幾乎和表面齊平的圓環，後段埋進表面）＋螢光紅的低圓頂鏡片（貼著頭部，dir 照表面的法線）。c＝表面上的位置、dir＝看的方向、R＝眼窩半徑
function eye(c, dir, R, n = 14) {
  return [
    lathe(
      SOCKET,
      c,
      dir,
      [
        [-1.1 * R, R],
        [0.08 * R, R],
        [0.16 * R, 0.93 * R],
      ],
      n,
      1,
    ),
    lathe(
      LENS,
      c,
      dir,
      [
        [0.06 * R, 0.86 * R],
        [0.26 * R, 0.76 * R],
        [0.38 * R, 0.54 * R],
        [0.44 * R, 0.28 * R],
      ],
      n,
      1,
    ),
  ];
}
// GRANITE 的大斜面（正面的楔形面板）：t＝0 上緣（眉）→ 1 下緣（鼻樑），半寬 0.28 → 0.15
const face = (t, x) => [x, 0.71 - 0.39 * t, 0.38 + 0.43 * t];

// 圓球形的眼（主眼）：球心從表面上的 c 沿 out（往外的方向）往裡退 sink×R，露出來的是貼著頭部的球冠，從正面、側面看都是圓的；
// 外面套一層稍大、再退一點的球當基座（機體的主色，使用者定案），只在眼睛和表面交接的地方露出一圈
function ball(c, out, R, sink = 0.5, n = 18) {
  const o = norm(out);
  const dome = (r) => [
    [-0.45 * r, 0.89 * r],
    [0, r],
    [0.38 * r, 0.925 * r],
    [0.71 * r, 0.71 * r],
    [0.92 * r, 0.38 * r],
    [1.0 * r, 0.1 * r],
  ];
  const at = (k) => c.map((v, i) => v - o[i] * k * R);
  return [lathe(0, at(sink + 0.17), o, dome(R * 1.09), n, 1), lathe(LENS, at(sink), o, dome(R), n, 1)];
}
export const p_head_h_spdPrims = [
  ...p_head_h_stdPrims,
  ...ball(face(0.62, 0.199), [0.7, 0.41, 0.585], 0.108), // 主眼（特大）：圓球埋在正面斜面與側面的轉角裡，正面與側面都露出半球
  ...eye(face(0.9, 0.112), [0.06, 0.74, 0.67], 0.034, 12), // 主眼下方的小眼（使用者追加）：斜面的下緣、靠近稜線
  ...eye(face(0.22, 0.19), [0.06, 0.74, 0.67], 0.05), // 前側眼（中）：照斜面的法線
  ...eye([0.262, 0.83, 0.2], [0.08, 0.83, 0.55], 0.024, 10), // 後中眼（極小，耳的斜面上）
  ...eye([0.316, 0.37, 0.25], [0.92, 0.05, 0.38], 0.05), // 後側眼（中，兩頰的艙）
];
