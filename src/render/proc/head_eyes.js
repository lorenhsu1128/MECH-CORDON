// 各頭部的眼睛（2026-11-17，使用者要求）：照 GLB 重建的頭部沒有發光的眼睛，這裡替每一顆加上螢光紅的眼睛。
// 眼睛不是圓的：每顆頭依自己的造型給不同的多邊形，從正面把多邊形「投影」到頭部的表面上——
// 多邊形蓋到的每個三角形裁出那一塊、沿法線浮起 4 mm，所以眼睛順著表面的轉折貼在頭上（跨過幾個面也一樣）。
// 清單檔是產生器的輸出、不手改，眼睛在 proc/index.js 載入時接在清單後面（色槽 4＝EYE_COLS 的自發光紅）。
// 複眼頭 h_spd 有自己的眼睛（head_h_spd.js），不經過這裡。
import { primsTris } from '../proc-prims.js';

export const EYE_COLS = ['#ff1030!'];
const EYE = 4;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const r4 = (x) => Math.round(x * 10000) / 10000;

// 凸多邊形 clip（逆時針）裁切多邊形 subj（Sutherland–Hodgman，2D）
function clip2(subj, clip) {
  let out = subj;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i],
      b = clip[(i + 1) % clip.length];
    const side = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const inp = out;
    out = [];
    for (let k = 0; k < inp.length; k++) {
      const p = inp[k],
        q = inp[(k + 1) % inp.length];
      const sp = side(p),
        sq = side(q);
      if (sp >= 0) out.push(p);
      if (sp >= 0 !== sq >= 0) {
        const t = sp / (sp - sq);
        out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
      }
    }
  }
  return out;
}
// 射線（o 往 d）有沒有打到三角形（Möller–Trumbore）
function rayHits(o, d, [a, b, c]) {
  const e1 = sub(b, a),
    e2 = sub(c, a);
  const h = cross(d, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return false;
  const s = sub(o, a);
  const u = dot(s, h) / det;
  if (u < 0 || u > 1) return false;
  const q = cross(s, e1);
  const v = dot(d, q) / det;
  if (v < 0 || u + v > 1) return false;
  return dot(e2, q) / det > 1e-4;
}

// 把多邊形（從 dir 的方向看過去的 2D 座標：橫軸＝右、縱軸＝上；正面 dir [0,0,1] 看就是 x, y；從右側 dir [1,0,0] 看是 −z, y）貼到表面上。
// polys＝凸多邊形的清單（凹的形狀拆成幾個凸的）；o.slots＝只貼在這些色槽的面上（例如只貼深色的凹處）；
// o.mirror＝左右對稱再貼一份；被別的面擋住（從 dir 看不到）的部分不貼
export function projectEyes(prims, polys, o = {}) {
  const tris = [];
  primsTris(prims).forEach((pos, s) => {
    for (let i = 0; i < pos.length; i += 9)
      tris.push({ s, p: [pos.slice(i, i + 3), pos.slice(i + 3, i + 6), pos.slice(i + 6, i + 9)] });
  });
  const list = [];
  const d0 = norm(o.dir || [0, 0, 1]);
  // 鏡像的那一份：方向的 x 反號、多邊形的橫軸反號（正面與側面的投影都適用）
  const all = polys.map((p) => [p, d0]);
  if (o.mirror !== false)
    for (const p of polys) all.push([p.map(([x, y]) => [-x, y]), [-d0[0], d0[1], d0[2]]]);
  for (const [poly0, d] of all) {
    let poly = poly0;
    const up = norm(
      sub(
        [0, 1, 0],
        d.map((x) => x * d[1]),
      ),
    );
    const right = cross(up, d);
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length];
      area += a[0] * b[1] - a[1] * b[0];
    }
    if (area < 0) poly = poly.slice().reverse();
    for (const t of tris) {
      if (o.slots && !o.slots.includes(t.s)) continue;
      const [a, b, c] = t.p;
      const n = norm(cross(sub(b, a), sub(c, a)));
      if (dot(n, d) < (o.minFacing === undefined ? 0.08 : o.minFacing)) continue;
      const P2 = t.p.map((v) => [dot(v, right), dot(v, up)]);
      const cut = clip2(P2, poly);
      if (cut.length < 3) continue;
      // 2D → 3D：三角形內的重心座標
      const [A, B, C] = P2;
      const den = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]);
      if (Math.abs(den) < 1e-10) continue;
      const lift = o.lift || 0.004;
      const to3 = (q) => {
        const u = ((q[0] - A[0]) * (C[1] - A[1]) - (q[1] - A[1]) * (C[0] - A[0])) / den;
        const v = ((B[0] - A[0]) * (q[1] - A[1]) - (B[1] - A[1]) * (q[0] - A[0])) / den;
        return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * u + (c[k] - a[k]) * v + n[k] * lift);
      };
      const pts = cut.map(to3);
      for (let i = 1; i + 1 < pts.length; i++) {
        const tri = [pts[0], pts[i], pts[i + 1]];
        const cen = [0, 1, 2].map((k) => (tri[0][k] + tri[1][k] + tri[2][k]) / 3);
        if (tris.some((x) => x !== t && rayHits(cen, d, x.p))) continue; // 被擋住
        list.push([EYE, ...tri.map((v) => v.map(r4))]);
      }
    }
  }
  return list.length ? [['D', list]] : [];
}

// 每顆頭的眼睛（正面看的 x, y；只寫右半邊，左半邊是鏡像）
export const EYES = {
  // GRANITE：楔形面板上緣一對直角梯形（外側順著面板的斜邊）
  h_std: (p) =>
    projectEyes(
      p,
      [
        [
          [0.035, 0.655],
          [0.232, 0.655],
          [0.214, 0.6],
          [0.035, 0.6],
        ],
      ],
      { slots: [0] },
    ),
  // SEQ 輕量：圓頂帽簷下方 V 形的深色凹處，一對往外收尖的刀狀細縫
  h_lt: (p) =>
    projectEyes(
      p,
      [
        [
          [0.022, 0.305],
          [0.19, 0.428],
          [0.11, 0.33],
          [0.022, 0.25],
        ],
      ],
      { slots: [1, 2] },
    ),
  // HAWK 重裝：兜帽蓋住了正面，眼睛分兩處——鼻樑方塊正面一條扁六角形的單眼縫，
  // 加上兜帽下緣兩側深色的側壁上各一片往前收窄的刀狀梯形（從側面投影，座標是 −z, y）
  h_hv: (p) => [
    ...projectEyes(
      p,
      [
        [
          [-0.086, 0.3],
          [-0.068, 0.272],
          [0.068, 0.272],
          [0.086, 0.3],
          [0.068, 0.328],
          [-0.068, 0.328],
        ],
      ],
      { slots: [0], mirror: false },
    ),
    ...projectEyes(
      p,
      [
        [
          [-0.84, 0.322],
          [-0.44, 0.408],
          [-0.44, 0.362],
          [-0.76, 0.288],
        ],
      ],
      { slots: [1, 2], dir: [1, 0, 0] },
    ),
  ],
  // 觀測頭：頂面深色的五角形感測窗，沿著下方兩條斜邊的 V 形光帶
  h_scan: (p) =>
    projectEyes(
      p,
      [
        [
          [0, 0.5],
          [0.162, 0.635],
          [0.162, 0.7],
          [0, 0.565],
        ],
      ],
      { slots: [1, 2] },
    ),
};
export const withEyes = (id, prims) => (EYES[id] ? [...prims, ...EYES[id](prims)] : prims);
