// 手寫的程式模型（機獸）的建模工具：產生 render/proc-prims.js 的基本形體清單（一律是 'H'：頂點＋多邊形面）。
// 座標是 glTF（+Z 正面、+Y 上、+X＝機體的左側）、公尺。純函式（不用 THREE），所以清單可以在載入時或第一次用到時算。
export const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vmul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vcross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
export const vnorm = (a) => {
  const l = vlen(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const vlerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const r4 = (x) => Math.round(x * 10000) / 10000;
const rp = (p) => [r4(p[0]), r4(p[1]), r4(p[2])];

// 面的繞向：算體積，負的＝全部反過來（所以各產生器不用管繞向；形體要封閉）
function fixWind(pts, faces) {
  let vol = 0;
  for (const f of faces)
    for (let i = 1; i + 1 < f.length; i++) vol += vdot(pts[f[0]], vcross(pts[f[i]], pts[f[i + 1]]));
  return vol < 0 ? faces.map((f) => f.slice().reverse()) : faces;
}
const H = (slot, pts, faces, mir, fsl) => {
  const P = pts.map(rp);
  // 原點可能在形體外面：體積用相對於第一個頂點的座標算
  const rel = P.map((p) => vsub(p, P[0]));
  const fixed = fixWind(rel, faces);
  const out = ['H', slot, P, fixed];
  if (fsl) out.push(fsl);
  if (mir) out.push(1);
  return out;
};

// 凸包（點少，用三點定面的窮舉；共面的點合成一個多邊形）
function hullFaces(P) {
  const n = P.length,
    eps = 1e-4;
  const seen = new Set(),
    faces = [];
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      for (let k = j + 1; k < n; k++) {
        let N = vcross(vsub(P[j], P[i]), vsub(P[k], P[i]));
        const l = vlen(N);
        if (l < 1e-9) continue;
        N = vmul(N, 1 / l);
        let pos = 0,
          neg = 0;
        const on = [];
        for (let m = 0; m < n && !(pos && neg); m++) {
          const d = vdot(N, vsub(P[m], P[i]));
          if (d > eps) pos++;
          else if (d < -eps) neg++;
          else on.push(m);
        }
        if (pos && neg) continue;
        const key = on.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        if (pos) N = vmul(N, -1);
        let c = [0, 0, 0];
        for (const m of on) c = vadd(c, P[m]);
        c = vmul(c, 1 / on.length);
        const u = vnorm(vsub(P[on[0]], c)),
          v = vcross(N, u);
        const ang = (m) => {
          const d = vsub(P[m], c);
          return Math.atan2(vdot(d, v), vdot(d, u));
        };
        faces.push(on.slice().sort((a, b) => ang(a) - ang(b)));
      }
  return faces;
}
// 凸塊：pts 的凸包。mir＝左右鏡射再放一份
export function hull(slot, pts, mir) {
  const P = [];
  for (const p of pts.map(rp)) if (!P.some((q) => vlen(vsub(p, q)) < 2e-4)) P.push(p);
  return H(slot, P, hullFaces(P), mir);
}
// 左右對稱的凸塊：只給 x ≥ 0 的點，自動補上鏡像
export const hullS = (slot, half) =>
  hull(slot, [...half, ...half.filter((p) => p[0] > 1e-4).map((p) => [-p[0], p[1], p[2]])]);

// 旋轉矩陣（角度，依序繞 X、Y、Z）與套用
export function rotM(rx = 0, ry = 0, rz = 0) {
  const d = Math.PI / 180;
  const [cx, sx, cy, sy, cz, sz] = [
    Math.cos(rx * d),
    Math.sin(rx * d),
    Math.cos(ry * d),
    Math.sin(ry * d),
    Math.cos(rz * d),
    Math.sin(rz * d),
  ];
  // R = Rz · Ry · Rx
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}
export const mapply = (M, p) => [vdot(M[0], p), vdot(M[1], p), vdot(M[2], p)];
// 清單整個旋轉再平移（只收 'H'）
export function xf(prims, rot, pos = [0, 0, 0]) {
  const M = rot ? rotM(...rot) : null;
  return prims.map((p) => {
    const q = p.slice();
    q[2] = p[2].map((v) => rp(vadd(M ? mapply(M, v) : v, pos)));
    return q;
  });
}
export const moved = (prims, d) => xf(prims, null, d);

// 方塊（中心 c、全尺寸 s、可旋轉）；ch > 0＝12 條邊倒角
export function box(slot, c, s, rot, ch = 0, mir) {
  const [hx, hy, hz] = [s[0] / 2, s[1] / 2, s[2] / 2];
  const pts = [];
  const sg = [-1, 1];
  if (ch > 0) {
    const k = Math.min(ch, hx * 0.9, hy * 0.9, hz * 0.9);
    for (const a of sg)
      for (const b of sg)
        for (const d of sg) {
          pts.push([a * hx, b * (hy - k), d * (hz - k)]);
          pts.push([a * (hx - k), b * hy, d * (hz - k)]);
          pts.push([a * (hx - k), b * (hy - k), d * hz]);
        }
  } else for (const a of sg) for (const b of sg) for (const d of sg) pts.push([a * hx, b * hy, d * hz]);
  const M = rot ? rotM(...rot) : null;
  return hull(
    slot,
    pts.map((p) => vadd(M ? mapply(M, p) : p, c)),
    mir,
  );
}

// 繞 dir 的旋轉體：rings＝[[沿 dir 的距離, 半徑]…]，n 邊
export function lathe(slot, c, dir, rings, n = 12, mir, phase = 0) {
  const d = vnorm(dir);
  const u = vnorm(vcross(Math.abs(d[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0], d));
  const v = vcross(d, u);
  const pts = [];
  for (const [off, r] of rings)
    for (let i = 0; i < n; i++) {
      const a = ((i + phase) / n) * Math.PI * 2,
        cu = Math.cos(a) * r,
        cv = Math.sin(a) * r;
      pts.push([0, 1, 2].map((k) => c[k] + d[k] * off + u[k] * cu + v[k] * cv));
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
  return H(slot, pts, faces, mir);
}
// 圓柱：a → b，半徑 r（r2＝b 端的半徑）
export const cyl = (slot, a, b, r, n = 10, mir, r2 = r) =>
  lathe(
    slot,
    a,
    vsub(b, a),
    [
      [0, r],
      [vlen(vsub(b, a)), r2],
    ],
    n,
    mir,
  );
// 圓球（半徑 r）
export const ball = (slot, c, r, n = 10, mir) =>
  lathe(
    slot,
    c,
    [0, 1, 0],
    [
      [-r, r * 0.05],
      [-r * 0.8, r * 0.6],
      [-r * 0.35, r * 0.94],
      [r * 0.35, r * 0.94],
      [r * 0.8, r * 0.6],
      [r, r * 0.05],
    ],
    n,
    mir,
  );
// 液壓桿：a → b，粗的缸體（前 55%）＋細的桿
export const piston = (slotA, slotB, a, b, r = 0.07, mir) => [
  cyl(slotA, a, vlerp(a, b, 0.55), r, 8, mir),
  cyl(slotB, vlerp(a, b, 0.5), b, r * 0.55, 6, mir),
];

// 放樣：rings＝每一圈的頂點（數量相同、同方向繞）。回傳 'H'；faceSlot(i, j)＝第 i 段第 j 個面的色槽（沒有＝整塊 slot）
export function loft(slot, rings, mir, faceSlot) {
  const m = rings[0].length;
  const pts = rings.flat();
  const faces = [],
    fsl = [];
  faces.push(Array.from({ length: m }, (_, i) => i).reverse());
  fsl.push(slot);
  for (let k = 0; k + 1 < rings.length; k++)
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      faces.push([k * m + i, k * m + j, (k + 1) * m + j, (k + 1) * m + i]);
      fsl.push(faceSlot ? faceSlot(k, i) : slot);
    }
  faces.push(Array.from({ length: m }, (_, i) => (rings.length - 1) * m + i));
  fsl.push(slot);
  return H(slot, pts, faces, mir, faceSlot ? fsl : null);
}
// 沿路徑的管：stations＝[{ p, prof: [[側, 前]…], d?: 切線 }…]；hint＝「前」的方向（和切線垂直的分量）。回傳每一圈的頂點（給 loft 與 panel）
// 側 S＝hint⊥ × 切線：往下的骨頭、hint +Z 時 S＝+X
export function tubeRings(stations, hint = [0, 0, 1]) {
  return stations.map((st, i) => {
    const a = stations[Math.max(0, i - 1)].p,
      b = stations[Math.min(stations.length - 1, i + 1)].p;
    const d = vnorm(st.d || vsub(b, a));
    const F = vnorm(vsub(hint, vmul(d, vdot(hint, d))));
    const S = vcross(F, d);
    return st.prof.map(([s, f]) => vadd(st.p, vadd(vmul(S, s), vmul(F, f))));
  });
}
// 八邊形截面：半寬 hw、往前 f、往後 b；k＝斜角的比例。點 0 在「前外」，依序 外前、外後、後外、後內、內後、內前、前內
export const oct = (hw, f, b, k = 0.55) => [
  [hw * k, f],
  [hw, f * k],
  [hw, -b * k],
  [hw * k, -b],
  [-hw * k, -b],
  [-hw, -b * k],
  [-hw, f * k],
  [-hw * k, f],
];
// 左右對稱的身體截面：z 處，half＝x ≥ 0 的點 [x, y]（由上到下；第一點與最後一點在中線上 x＝0）
export function bodyRing(z, half) {
  const out = half.map(([x, y]) => [x, y, z]);
  for (let i = half.length - 2; i >= 1; i--) out.push([-half[i][0], half[i][1], z]);
  return out;
}

// 裝甲板：貼在放樣表面（grid＝rings）第 i0～i1 圈、第 j0～j1 點之間的那一片上；四周留縫 gap、倒角 ch、厚 t（往外）。j 可以超過一圈的點數（繞回去）
export function panel(slot, grid, i0, i1, j0, j1, o = {}) {
  const { t = 0.1, gap = 0.06, ch = 0.05, mir = false, sink = 0.05 } = o;
  const m = grid[0].length;
  const g = (i, j) => grid[i][((j % m) + m) % m];
  const cen = grid.map((r) => vmul(r.reduce(vadd, [0, 0, 0]), 1 / m));
  const at = (fi, fj) => {
    const a = Math.min(Math.max(Math.floor(fi), 0), grid.length - 2),
      ti = fi - a;
    const b = Math.floor(fj),
      tj = fj - b;
    return vlerp(vlerp(g(a, b), g(a, b + 1), tj), vlerp(g(a + 1, b), g(a + 1, b + 1), tj), ti);
  };
  const nrm = (fi, fj) => {
    const e = 0.02;
    const du = vsub(at(Math.min(fi + e, grid.length - 1), fj), at(Math.max(fi - e, 0), fj));
    const dv = vsub(at(fi, fj + e), at(fi, fj - e));
    let N = vnorm(vcross(du, dv));
    const a = Math.min(Math.max(Math.floor(fi), 0), grid.length - 2);
    const c = vlerp(cen[a], cen[a + 1], fi - a);
    if (vdot(N, vsub(at(fi, fj), c)) < 0) N = vmul(N, -1);
    return N;
  };
  const im = (i0 + i1) / 2,
    jm = (j0 + j1) / 2;
  const li = vlen(vsub(at(i1, jm), at(i0, jm))) / (i1 - i0),
    lj = vlen(vsub(at(im, j1), at(im, j0))) / (j1 - j0);
  const span = (a0, a1, inset) => {
    const out = [a0 + inset];
    for (let a = Math.floor(a0) + 1; a < a1; a++)
      if (a > a0 + inset + 0.02 && a < a1 - inset - 0.02) out.push(a);
    out.push(a1 - inset);
    return out;
  };
  const gi = Math.min(gap / li, 0.3),
    gj = Math.min(gap / lj, 0.3),
    ci = Math.min(ch / li, 0.15),
    cj = Math.min(ch / lj, 0.15);
  const It = span(i0, i1, gi + ci),
    Jt = span(j0, j1, gj + cj),
    Ib = span(i0, i1, gi),
    Jb = span(j0, j1, gj);
  const na = It.length,
    nb = Jt.length;
  const pts = [];
  for (let a = 0; a < na; a++)
    for (let b = 0; b < nb; b++) pts.push(vadd(at(It[a], Jt[b]), vmul(nrm(It[a], Jt[b]), t)));
  const faces = [];
  for (let a = 0; a + 1 < na; a++)
    for (let b = 0; b + 1 < nb; b++)
      faces.push([a * nb + b, a * nb + b + 1, (a + 1) * nb + b + 1, (a + 1) * nb + b]);
  // 外圈（上層與底層同樣的順序）
  const loop = [];
  for (let b = 0; b < nb; b++) loop.push([0, b]);
  for (let a = 1; a < na; a++) loop.push([a, nb - 1]);
  for (let b = nb - 2; b >= 0; b--) loop.push([na - 1, b]);
  for (let a = na - 2; a >= 1; a--) loop.push([a, 0]);
  const base = pts.length;
  for (const [a, b] of loop) pts.push(vadd(at(Ib[a], Jb[b]), vmul(nrm(Ib[a], Jb[b]), -sink)));
  const L = loop.length;
  for (let k = 0; k < L; k++) {
    const [a, b] = loop[k],
      [a2, b2] = loop[(k + 1) % L];
    faces.push([a * nb + b, a2 * nb + b2, base + ((k + 1) % L), base + k]);
  }
  // 上面的面與側面的繞向要一致：上面是 (a,b)→(a,b+1)→(a+1,b+1)，外圈也是先沿 b 增加 → 側面 [上k, 上k+1, 底k+1, 底k] 反向，改過來
  for (let k = faces.length - L; k < faces.length; k++) faces[k].reverse();
  faces.push(Array.from({ length: L }, (_, k) => base + k).reverse());
  return H(slot, pts, faces, mir);
}

// 平移成區塊自己的座標（原點＝轉軸）
export const toLocal = (prims, pivot) => moved(prims, vmul(pivot, -1));
// 左右鏡射（x → −x）：只收 'H'
export const mirrored = (prims) =>
  prims.map((p) => {
    const q = p.slice();
    q[2] = p[2].map((v) => [-v[0], v[1], v[2]]);
    q[3] = p[3].map((f) => f.slice().reverse());
    return q;
  });
export function primTris(prims) {
  let n = 0;
  for (const p of prims) {
    let k = 0;
    for (const f of p[3]) k += f.length - 2;
    n += p[p.length - 1] === 1 ? k * 2 : k;
  }
  return n;
}
// 以 about 為中心逐軸縮放（只收 'H'）
export const scaled = (prims, k, about = [0, 0, 0]) =>
  prims.map((p) => {
    const q = p.slice();
    q[2] = p[2].map((v) => v.map((x, i) => r4(about[i] + (x - about[i]) * k[i])));
    return q;
  });
