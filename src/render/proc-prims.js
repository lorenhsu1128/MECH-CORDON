// 基本形體清單 → 網格（實驗，2026-11-17）：scripts/glb-to-proc.mjs 照 GLB 量測重建的程式模型用。
// 形體：['B', 色槽, 最小角, 最大角]＝軸向方塊、['P', 色槽, 軸, 起, 訖, 截面]＝沿軸擠出的凸多邊形柱（截面逆時針）、
// ['H', 色槽, 頂點, 面]＝凸塊（面＝頂點編號的多邊形，從外面看逆時針）、['T', [[色槽, a, b, c]…]]＝沒有補面的表面（單面：凹處、圍著洞的面）、['D', …]＝貼在表面的色片（比表面高 2.5 mm）；
// 最後一個元素是 1＝左右鏡射（x → −x）再放一份。色槽 0 main／1 sub／2 joint／3 acc。純函式。
export const PRIM_SLOTS = ['main', 'sub', 'joint', 'acc'];
const AX = { x: 0, y: 1, z: 2 };

// 每個色槽的三角形座標（[x,y,z,…]，沒有索引）
export function primsTris(prims) {
  const out = PRIM_SLOTS.map(() => []);
  const tri = (s, a, b, c, mir) => {
    if (mir) out[s].push(-a[0], a[1], a[2], -c[0], c[1], c[2], -b[0], b[1], b[2]);
    else out[s].push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  };
  const poly = (s, loop, mir) => {
    for (let i = 1; i < loop.length - 1; i++) tri(s, loop[0], loop[i], loop[i + 1], mir);
  };
  for (const p of prims) {
    const k = p[0];
    const m = p[p.length - 1] === 1;
    for (const mir of m ? [false, true] : [false]) {
      if (k === 'B') {
        const [, s, a, b] = p;
        const c = (i) => [i & 1 ? b[0] : a[0], i & 2 ? b[1] : a[1], i & 4 ? b[2] : a[2]];
        // 六個面（從外面看逆時針）
        for (const f of [
          [1, 3, 7, 5],
          [0, 4, 6, 2],
          [2, 6, 7, 3],
          [0, 1, 5, 4],
          [4, 5, 7, 6],
          [0, 2, 3, 1],
        ])
          poly(s, f.map(c), mir);
      } else if (k === 'P') {
        const [, s, axn, a0, a1, prof] = p;
        const ax = AX[axn],
          u = (ax + 1) % 3,
          w = (ax + 2) % 3;
        const at = (e, q) => {
          const v = [0, 0, 0];
          v[ax] = e;
          v[u] = q[0];
          v[w] = q[1];
          return v;
        };
        const n = prof.length;
        // 截面在 (u, w) 平面逆時針＝從 +軸 看逆時針
        poly(
          s,
          prof.map((q) => at(a1, q)),
          mir,
        );
        poly(s, prof.map((q) => at(a0, q)).reverse(), mir);
        for (let i = 0; i < n; i++) {
          const q0 = prof[i],
            q1 = prof[(i + 1) % n];
          poly(s, [at(a0, q0), at(a0, q1), at(a1, q1), at(a1, q0)], mir);
        }
      } else if (k === 'H') {
        const [, s, pts, faces] = p;
        for (const f of faces)
          poly(
            s,
            f.map((i) => pts[i]),
            mir,
          );
      } else if (k === 'T' || k === 'D') {
        for (const [s, a, b, c] of p[1]) tri(s, a, b, c, false);
      }
    }
  }
  return out;
}

// 網格群組：每個色槽一個網格（平面著色的法線）。mats＝{ main, sub, joint, acc }；flip＝轉成遊戲的座標（−Z 正面）
export function primsGroup(prims, mats, flip = false) {
  const g = new THREE.Group();
  primsTris(prims).forEach((pos, i) => {
    if (!pos.length) return;
    if (flip) for (let k = 0; k < pos.length; k += 3) ((pos[k] = -pos[k]), (pos[k + 2] = -pos[k + 2]));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    const uv = new Float32Array((pos.length / 3) * 2);
    const N = geo.attributes.normal;
    for (let v = 0; v < pos.length / 3; v++) {
      const ax = Math.abs(N.getX(v)),
        ay = Math.abs(N.getY(v)),
        az = Math.abs(N.getZ(v));
      const [a, b] = ay >= ax && ay >= az ? [0, 2] : ax >= az ? [2, 1] : [0, 1];
      uv[v * 2] = pos[v * 3 + a] * 0.5;
      uv[v * 2 + 1] = pos[v * 3 + b] * 0.5;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const m = new THREE.Mesh(geo, mats[PRIM_SLOTS[i]]);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  });
  return g;
}
