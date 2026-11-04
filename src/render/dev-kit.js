// 地圖互動裝置的建模工具（docs/map-devices-design.md、docs/model-detail.md 的品質標準）：純函式，不呼叫亂數。
// 以 geometry.js 的 P（零件清單）＋ detail.js 的精細幾何（倒角方塊、圓角圓柱、剖面旋轉、掃出）拼出零件，
// 最後由呼叫端 bakeAll(群組, { tint }) 合併並烘焙頂點色。小細節包在 fine(() => …) 裡（遠了隱藏）。
import { P, fine } from './geometry.js';
import { D } from './detail.js';

export const HP = Math.PI / 2;
export { fine };

// 材質：c＝顏色，o＝覆寫（roughness、metalness…）；名為 glow 的是狀態燈（devices.js 依狀態改發光）
export const mStd = (color, o = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.45, ...o });
export const mGlow = (color, k = 1.3) =>
  Object.assign(
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.35 }),
    { name: 'glow' },
  );
// 不隨狀態變的燈（白光、紅色警示燈）
export const mLamp = (color, k = 1.6) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.3 });

// 倒角方塊（c 沒給時依最短邊）
export function bx(n, m, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, c) {
  const cc = c === undefined ? Math.min(0.06, Math.min(w, h, d) * 0.18) : c;
  P(n, D.box(w, h, d, cc), m, x, y, z, rx, ry, rz);
}
// 圓柱（軸沿 Y）：r 頂、r2 底（沒給＝同 r），c＝上下倒角
export function cy(n, m, r, h, x = 0, y = 0, z = 0, seg = 16, c = 0, r2, rx = 0, ry = 0, rz = 0) {
  P(n, D.cyl(r, r2 === undefined ? r : r2, h, seg, c), m, x, y, z, rx, ry, rz);
}
// 沿 +Z 的圓柱（砲管、管子）：r＝前端半徑、r2＝後端
export function cz(n, m, r, len, x = 0, y = 0, z = 0, seg = 16, c = 0, r2) {
  P(n, D.cyl(r, r2 === undefined ? r : r2, len, seg, c), m, x, y, z, HP, 0, 0);
}
// 沿 X 的圓柱
export function cx(n, m, r, len, x = 0, y = 0, z = 0, seg = 16, c = 0) {
  P(n, D.cyl(r, r, len, seg, c), m, x, y, z, 0, 0, -HP);
}
// 剖面旋轉：prof＝[[半徑, 位置]…]（由後往前／由下往上，頭尾半徑 0 就封口）；ax＝'y'（直立）或 'z'（往前）
export function lathe(n, m, prof, x = 0, y = 0, z = 0, ax = 'y', seg = 18, rx = 0, ry = 0, rz = 0) {
  if (ax === 'z') P(n, D.lathe(prof, seg), m, x, y, z, HP + rx, ry, rz);
  else P(n, D.lathe(prof, seg), m, x, y, z, rx, ry, rz);
}
// 只轉一段角度的剖面（弧形的護盾、圓環的一段）：a0／a1 繞 Y
export function arc(n, m, prof, a0, a1, x = 0, y = 0, z = 0, seg = 16, rx = 0, ry = 0, rz = 0) {
  P(n, D.lathe(prof, seg, a0, a1), m, x, y, z, rx, ry, rz);
}
// 兩點之間的桿子
const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _e = new THREE.Euler(),
  _up = new THREE.Vector3(0, 1, 0);
export function rod(n, m, a, b, r, seg = 8) {
  _a.set(...a);
  _b.set(...b);
  const L = _a.distanceTo(_b);
  _q.setFromUnitVectors(_up, _b.clone().sub(_a).normalize());
  _e.setFromQuaternion(_q);
  P(n, D.cyl(r, r, L, seg), m, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, _e.x, _e.y, _e.z);
}
// 沿折線的管子
export function pipe(n, m, pts, r, seg = 8) {
  P(n, D.sweep(pts, D.ring(r, seg)), m);
}
// 下垂的纜線
export function cable(n, m, a, b, r = 0.03, sag = 0.15) {
  P(n, D.cable(a, b, r, sag), m);
}
// 圓周上的螺栓（軸沿 Y 的圓周，r＝半徑、y＝高度）
export function boltRing(n, m, r, y, cnt, br = 0.035, x = 0, z = 0, a0 = 0) {
  for (let i = 0; i < cnt; i++) {
    const a = a0 + (i / cnt) * Math.PI * 2;
    cy(n, m, br, 0.05, x + Math.cos(a) * r, y, z + Math.sin(a) * r, 6);
  }
}
// 正面的一排螺栓（沿 X，朝 +Z 或 −Z）
export function boltRow(n, m, x0, x1, y, z, cnt, br = 0.03, face = 1) {
  for (let i = 0; i < cnt; i++) {
    const x = cnt > 1 ? x0 + ((x1 - x0) * i) / (cnt - 1) : x0;
    cz(n, m, br, 0.04, x, y, z + face * 0.015, 6);
  }
}
// 警示斜紋帶：沿 X 長 len 的帶子，黃黑交錯（ry 轉向）
export function hazard(n, mY, mK, len, h, d, x, y, z, ry = 0, cnt) {
  const k = cnt || Math.max(4, Math.round(len / (h * 1.2)));
  const w = len / k;
  const c = Math.cos(ry),
    s = Math.sin(ry);
  for (let i = 0; i < k; i++) {
    const t = -len / 2 + w * (i + 0.5);
    P(n, D.box(w * 0.98, h, d, 0.004), i % 2 ? mK : mY, x + t * c, y, z - t * s, 0, ry, 0);
  }
}
// 百葉通風口（正面朝 +Z，ry 轉向）：w×h 的框＋cnt 片斜葉片
export function vents(n, mF, mS, w, h, x, y, z, ry = 0, cnt = 5) {
  P(n, D.box(w, h, 0.05, 0.012), mF, x, y, z, 0, ry, 0);
  const c = Math.cos(ry),
    s = Math.sin(ry);
  for (let i = 0; i < cnt; i++) {
    const t = -h / 2 + (h / cnt) * (i + 0.5);
    P(n, D.box(w * 0.9, 0.025, h / cnt, 0.004), mS, x + s * 0.035, y + t, z + c * 0.035, -0.6, ry, 0);
  }
}
// 散熱鰭片（沿 X 排 cnt 片，每片 t 厚、h 高、d 深）
export function fins(n, m, cnt, len, h, d, x, y, z, ry = 0, t = 0.03) {
  const c = Math.cos(ry),
    s = Math.sin(ry);
  for (let i = 0; i < cnt; i++) {
    const u = cnt > 1 ? -len / 2 + (len * i) / (cnt - 1) : 0;
    P(n, D.box(t, h, d, 0.004), m, x + u * c, y, z - u * s, 0, ry, 0);
  }
}
// 把手（ㄇ形的細管），正面朝 +Z，沿 X 寬 w
export function handle(n, m, w, x, y, z, ry = 0, out = 0.08, r = 0.025) {
  const c = Math.cos(ry),
    s = Math.sin(ry);
  const L = (u, f) => [x + u * c + f * s, y, z - u * s + f * c];
  pipe(n, m, [L(-w / 2, 0), L(-w / 2, out), L(w / 2, out), L(w / 2, 0)], r, 6);
}
// 扶手欄杆：沿 pts（[x, z] 折線）、高 h 的欄杆，posts＝立柱間距
export function railing(n, m, pts, y, h = 0.36, r = 0.022) {
  pipe(
    n,
    m,
    pts.map(([x, z]) => [x, y + h, z]),
    r,
    6,
  );
  pipe(
    n,
    m,
    pts.map(([x, z]) => [x, y + h * 0.5, z]),
    r * 0.8,
    6,
  );
  for (const [x, z] of pts) cy(n, m, r, h, x, y + h / 2, z, 6);
}
// 液壓缸：a → b（外筒在 a 端）
export function piston(n, mA, mB, a, b, r = 0.06) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  rod(n, mA, a, m, r * 1.6, 10);
  rod(n, mB, a, b, r, 8);
  rod(
    n,
    mA,
    [a[0], a[1], a[2]],
    [a[0] + (b[0] - a[0]) * 0.04, a[1] + (b[1] - a[1]) * 0.04, a[2] + (b[2] - a[2]) * 0.04],
    r * 2.1,
    10,
  );
}
