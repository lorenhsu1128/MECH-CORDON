// 戰車腳的會動零件（2026-11-17）：照 GLB 重建的程式模型（render/proc/legs_l_tk_body.js 的 …Parts，
// scripts/glb-to-proc.mjs --tank 產生）裡的輪子與履帶片。輪子＝12 邊形的圓柱（另外加上輪轂與 5 顆螺栓，
// 轉動才看得出來），履帶片＝GLB 的一片當範本、沿每條履帶的封閉路徑排一圈（上方的回程藏在側裙裡）。
// 全部是 InstancedMesh（輪子本體、輪子的細節、履帶片的每個色槽各一個），座標是 glTF（+Z 正面）。
// tankPartsPose 依每條履帶走過的距離更新：輪子繞 X 軸轉、履帶片沿路徑移動。純函式（不碰遊戲狀態）。
import { PRIM_SLOTS, posGeo } from './proc-prims.js';

const WHEEL_N = 12;
// 沿 X 軸的柱體（ring＝[y, z]… 的凸多邊形）加進 pos；面一律朝外
function prism(pos, x0, x1, ring) {
  const cy = ring.reduce((s, q) => s + q[0], 0) / ring.length,
    cz = ring.reduce((s, q) => s + q[1], 0) / ring.length,
    cx = (x0 + x1) / 2;
  const tri = (a, b, c) => {
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2],
      vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    const nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx;
    const out =
      nx * ((a[0] + b[0] + c[0]) / 3 - cx) +
      ny * ((a[1] + b[1] + c[1]) / 3 - cy) +
      nz * ((a[2] + b[2] + c[2]) / 3 - cz);
    if (out < 0) [b, c] = [c, b];
    pos.push(...a, ...b, ...c);
  };
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const p = ring[i],
      q = ring[(i + 1) % n];
    tri([x0, p[0], p[1]], [x0, q[0], q[1]], [x1, q[0], q[1]]);
    tri([x0, p[0], p[1]], [x1, q[0], q[1]], [x1, p[0], p[1]]);
    if (i > 0 && i < n - 1) {
      tri([x0, ring[0][0], ring[0][1]], [x0, p[0], p[1]], [x0, q[0], q[1]]);
      tri([x1, ring[0][0], ring[0][1]], [x1, p[0], p[1]], [x1, q[0], q[1]]);
    }
  }
}
const ngon = (n, r, cy = 0, cz = 0, a0 = 0) =>
  Array.from({ length: n }, (_, i) => {
    const a = a0 + (i / n) * Math.PI * 2;
    return [cy + Math.cos(a) * r, cz + Math.sin(a) * r];
  });
// 單位輪子（半徑 1、寬 1、軸＝X）：本體與細節（輪轂＋螺栓，兩面都有）的幾何
let WHEEL_GEO = null;
function wheelGeo() {
  if (WHEEL_GEO) return WHEEL_GEO;
  const body = [],
    det = [];
  prism(body, -0.5, 0.5, ngon(WHEEL_N, 1));
  for (const s of [1, -1]) {
    prism(det, s * 0.5, s * 0.62, ngon(6, 0.34));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.3;
      prism(det, s * 0.5, s * 0.56, ngon(4, 0.11, Math.cos(a) * 0.68, Math.sin(a) * 0.68, a));
    }
  }
  return (WHEEL_GEO = [posGeo(body), posGeo(det)]);
}
// 每份零件資料算一次：履帶路徑的累積長度、每個輪子屬於哪一條履帶、履帶片各色槽的幾何
const CACHE = new WeakMap();
function prep(parts) {
  let c = CACHE.get(parts);
  if (c) return c;
  const tracks = parts.tracks.map((t) => {
    const cum = [0];
    for (let i = 0; i < t.pts.length; i++) {
      const p = t.pts[i],
        q = t.pts[(i + 1) % t.pts.length];
      cum.push(cum[i] + Math.hypot(q[0] - p[0], q[1] - p[1]));
    }
    const z = t.pts.map((p) => p[1]);
    return { ...t, cum, len: cum[cum.length - 1], zc: (Math.min(...z) + Math.max(...z)) / 2 };
  });
  // 輪子 → 同一側、前後最近的那一條履帶
  const wt = parts.wheels.map((w) => {
    let best = 0,
      bd = 1e9;
    tracks.forEach((t, i) => {
      const d = Math.abs(w[2] - t.zc) + (Math.sign(w[0]) === Math.sign(t.x) ? 0 : 100);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  });
  const lg = PRIM_SLOTS.map((_, s) => {
    const pos = [];
    for (const [sl, a, b, c2] of parts.link) if (sl === s) pos.push(...a, ...b, ...c2);
    return pos.length ? posGeo(pos) : null;
  });
  CACHE.set(parts, (c = { tracks, wt, lg, nl: tracks.reduce((s, t) => s + t.n, 0) }));
  return c;
}
// 路徑上距離 s 的點（寫進 out＝[y, z]）
function at(t, s, out) {
  s = ((s % t.len) + t.len) % t.len;
  let lo = 0,
    hi = t.pts.length - 1;
  while (lo < hi) {
    const m = (lo + hi + 1) >> 1;
    if (t.cum[m] <= s) lo = m;
    else hi = m - 1;
  }
  const p = t.pts[lo],
    q = t.pts[(lo + 1) % t.pts.length],
    k = (s - t.cum[lo]) / (t.cum[lo + 1] - t.cum[lo] || 1);
  out[0] = p[0] + (q[0] - p[0]) * k;
  out[1] = p[1] + (q[1] - p[1]) * k;
}

// 會動零件的群組（glTF 座標）。mats＝{ main, sub, joint, acc }
export function tankPartsGroup(parts, mats) {
  const c = prep(parts);
  const g = new THREE.Group();
  g.name = 'tankParts';
  const add = (geo, mat, n, name) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.name = name;
    m.castShadow = m.receiveShadow = true;
    m.frustumCulled = false; // 實例一直在動，不重算包圍球；跟著機甲本體（很少在畫面外）
    g.add(m);
  };
  const [wb, wd] = wheelGeo();
  add(wb, mats.sub, parts.wheels.length, 'tkW0');
  add(wd, mats.main, parts.wheels.length, 'tkW1');
  c.lg.forEach((geo, s) => geo && add(geo, mats[PRIM_SLOTS[s]], c.nl, 'tkL' + s));
  tankPartsPose(g, parts, null);
  return g;
}
const _m = new THREE.Matrix4(),
  _p = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _s = new THREE.Vector3(),
  _x = new THREE.Vector3(1, 0, 0),
  _a = [0, 0],
  _b = [0, 0],
  _c = [0, 0];
// dist＝每條履帶走過的距離（公尺，往前為正；null＝全部 0）
export function tankPartsPose(g, parts, dist) {
  const c = prep(parts);
  const w0 = g.getObjectByName('tkW0'),
    w1 = g.getObjectByName('tkW1');
  parts.wheels.forEach((w, i) => {
    const d = dist ? dist[c.wt[i]] : 0;
    _q.setFromAxisAngle(_x, d / w[3]);
    _m.compose(_p.set(w[0], w[1], w[2]), _q, _s.set(w[4], w[3], w[3]));
    w0.setMatrixAt(i, _m);
    w1.setMatrixAt(i, _m);
  });
  w0.instanceMatrix.needsUpdate = w1.instanceMatrix.needsUpdate = true;
  const L = PRIM_SLOTS.map((_, s) => g.getObjectByName('tkL' + s));
  let k = 0;
  _s.set(1, 1, 1);
  c.tracks.forEach((t, ti) => {
    const pitch = t.len / t.n,
      d = dist ? dist[ti] : 0;
    for (let i = 0; i < t.n; i++, k++) {
      // 往前走＝底部的履帶片相對車身往後：路徑的方向是底部往前，所以距離是減的
      const s = i * pitch - d;
      at(t, s, _a);
      at(t, s + 0.13, _b);
      at(t, s - 0.13, _c);
      _q.setFromAxisAngle(_x, Math.atan2(-(_b[0] - _c[0]), _b[1] - _c[1]));
      _m.compose(_p.set(t.x, _a[0], _a[1]), _q, _s);
      for (const m of L) if (m) m.setMatrixAt(k, _m);
    }
  });
  for (const m of L) if (m) m.instanceMatrix.needsUpdate = true;
}
