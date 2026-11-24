// 手寫外型（敵方專用外觀，docs/mech-looks-design.md）的造型工具：全部回傳 proc-prims.js 的基本形體清單（純函式）。
// 座標是 glTF（+Z 正面、+Y 上、機體的右側＝−x）、公尺、區塊座標（原點＝這個區塊的旋轉中心）。
import { mirrorPrims, primsTris } from '../proc-prims.js';

const r4 = (x) => Math.round(x * 10000) / 10000;
const D2R = Math.PI / 180;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const mid = (loop) => {
  const c = [0, 0, 0];
  for (const p of loop) for (let k = 0; k < 3; k++) c[k] += p[k] / loop.length;
  return c;
};
// 多邊形的法線（Newell）
const loopN = (loop) => {
  const n = [0, 0, 0];
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i],
      b = loop[(i + 1) % loop.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
};

// 軸向方塊
export const box = (s, a, b) => ['B', s, a, b];
// 放樣：rings＝一串頂點數相同的環（每個環是 [x, y, z] 的陣列），相鄰的環接成側面、頭尾各補一個面。
// 環的繞向自動判斷（照第一個環往第二個環的方向）；o.open0／open1＝頭／尾不補面
export function loft(s, rings, o = {}) {
  const n = rings[0].length;
  const dir = sub(mid(rings[rings.length - 1]), mid(rings[0]));
  const flip = dot(loopN(rings[0]), dir) < 0; // 從行進方向的前面看要是逆時針
  const R = flip ? rings.map((r) => r.slice().reverse()) : rings;
  const pts = [];
  for (const r of R) for (const p of r) pts.push(p.map(r4));
  const faces = [];
  const ring = (k) => Array.from({ length: n }, (_, i) => k * n + i);
  if (!o.open0) faces.push(ring(0).reverse());
  for (let k = 0; k + 1 < R.length; k++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push([k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i]);
    }
  if (!o.open1) faces.push(ring(R.length - 1));
  return ['H', s, pts, faces];
}
// 截面（2D 的點）：八角的矩形（w、d＝半寬、半深；c＝切角）、正多邊形／橢圓
export const oct = (w, d, c = Math.min(w, d) * 0.3) => [
  [w - c, d],
  [-(w - c), d],
  [-w, d - c],
  [-w, -(d - c)],
  [-(w - c), -d],
  [w - c, -d],
  [w, -(d - c)],
  [w, d - c],
];
export const ngon = (rx, ry = rx, n = 10, rot = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2;
    return [r4(Math.cos(a) * rx), r4(Math.sin(a) * ry)];
  });
// 沿 y 疊起來的環：secs＝[[y, 截面（[x, z] 的陣列）, 中心 x?, 中心 z?]…]
export const stackY = (s, secs, o) =>
  loft(
    s,
    secs.map(([y, prof, cx = 0, cz = 0]) => prof.map(([x, z]) => [x + cx, y, z + cz])),
    o,
  );
// 沿 z（前後）的環：secs＝[[z, 截面（[x, y]）, 中心 x?, 中心 y?]…]
export const stackZ = (s, secs, o) =>
  loft(
    s,
    secs.map(([z, prof, cx = 0, cy = 0]) => prof.map(([x, y]) => [x + cx, y + cy, z])),
    o,
  );
// 沿 x（左右）的環：secs＝[[x, 截面（[z, y]）, 中心 z?, 中心 y?]…]
export const stackX = (s, secs, o) =>
  loft(
    s,
    secs.map(([x, prof, cz = 0, cy = 0]) => prof.map(([z, y]) => [x, y + cy, z + cz])),
    o,
  );
// 圓柱（n 邊）：沿 axis（'x'／'y'／'z'）從 a0 到 a1，c＝另外兩個座標的中心（照 stackX／Y／Z 的截面順序）
export function cyl(s, axis, a0, a1, r, c = [0, 0], n = 12, r1 = r) {
  const st = axis === 'x' ? stackX : axis === 'y' ? stackY : stackZ;
  return st(s, [
    [a0, ngon(r, r, n), c[0], c[1]],
    [a1, ngon(r1, r1, n), c[0], c[1]],
  ]);
}
// 旋轉＋位移（r＝繞 x、y、z 的角度，依 x → y → z 的順序；p＝繞著轉的中心；t＝位移）：結果攤成三角形
export function tf(prims, { r = [0, 0, 0], t = [0, 0, 0], p = [0, 0, 0] } = {}) {
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(r[0] * D2R),
    Math.sin(r[0] * D2R),
    Math.cos(r[1] * D2R),
    Math.sin(r[1] * D2R),
    Math.cos(r[2] * D2R),
    Math.sin(r[2] * D2R),
  ];
  const one = (v) => {
    let x = v[0] - p[0],
      y = v[1] - p[1],
      z = v[2] - p[2];
    [y, z] = [y * cx - z * sx, y * sx + z * cx];
    [x, z] = [x * cy + z * sy, -x * sy + z * cy];
    [x, y] = [x * cz - y * sz, x * sz + y * cz];
    return [r4(x + p[0] + t[0]), r4(y + p[1] + t[1]), r4(z + p[2] + t[2])];
  };
  const list = [];
  primsTris(prims).forEach((pos, s) => {
    for (let i = 0; i < pos.length; i += 9)
      list.push([
        s,
        one([pos[i], pos[i + 1], pos[i + 2]]),
        one([pos[i + 3], pos[i + 4], pos[i + 5]]),
        one([pos[i + 6], pos[i + 7], pos[i + 8]]),
      ]);
  });
  return [['T', list]];
}
// 左右各一份（x → −x）
export const both = (prims) => [...prims, ...mirrorPrims(prims)];
// 斜放的板（厚 th）：中心 c、寬 w（x）、高 h（y）、傾斜 r（度）；四個角切掉 ch
export function plate(s, c, w, h, th, r = [0, 0, 0], ch = 0.08) {
  const prof = oct(w / 2, h / 2, ch);
  return tf(
    [
      stackZ(s, [
        [-th / 2, prof],
        [th / 2, prof],
      ]),
    ],
    { r, t: c },
  );
}
export { norm, cross };
