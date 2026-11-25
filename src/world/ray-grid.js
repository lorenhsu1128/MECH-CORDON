// 鏡頭遮擋用的線段檢測（world.js 的 fadeRay／mergedBlocks）：合併過的大網格一塊有幾千到幾萬個三角形，
// three.js 的 Raycaster 逐一檢查每個三角形（低標的電腦一次 10～25 ms，2026-11-25 的效能檢查）。
// 第一次檢查某個幾何時把三角形依局部座標的 XZ 分格（CSR：每格的三角形編號），之後只檢查線段經過的格子。
// 只處理不動的網格（幾何不變；網格可以整個搬動：線段先換到局部座標）。蒙皮、InstancedMesh、morph 不用這裡
const GRIDS = new WeakMap();
const MIN_TRIS = 600; // 三角形比這少的照 three.js 原本的做法
const MAX_SIDE = 96;
const _inv = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();
const _ray = new THREE.Ray();
const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _best = new THREE.Vector3();
let stampN = 1;

export function gridable(o) {
  if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.morphTargetInfluences) return false;
  const g = o.geometry;
  if (!g || !g.attributes.position || g.morphAttributes.position) return false;
  const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  return n >= MIN_TRIS;
}

function build(geo) {
  const pos = geo.attributes.position,
    idx = geo.index;
  const nt = Math.floor((idx ? idx.count : pos.count) / 3);
  if (!geo.boundingBox) geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const sx = bb.max.x - bb.min.x,
    sz = bb.max.z - bb.min.z;
  // 每格平均約 24 個三角形，邊長上限 MAX_SIDE 格
  const area = Math.max(1e-6, sx * sz);
  let cs = Math.sqrt((area * 24) / Math.max(1, nt));
  cs = Math.max(cs, sx / MAX_SIDE, sz / MAX_SIDE, 1e-3);
  const nx = Math.max(1, Math.ceil(sx / cs)),
    nz = Math.max(1, Math.ceil(sz / cs));
  const vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  const cnt = new Uint32Array(nx * nz + 1);
  const rng = new Int32Array(nt * 4);
  const cx = (x) => Math.min(nx - 1, Math.max(0, Math.floor((x - bb.min.x) / cs)));
  const cz = (z) => Math.min(nz - 1, Math.max(0, Math.floor((z - bb.min.z) / cs)));
  for (let t = 0; t < nt; t++) {
    let x0 = Infinity,
      x1 = -Infinity,
      z0 = Infinity,
      z1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const i = vi(t, k);
      const x = pos.getX(i),
        z = pos.getZ(i);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (z < z0) z0 = z;
      if (z > z1) z1 = z;
    }
    const a = cx(x0),
      b = cx(x1),
      c = cz(z0),
      d = cz(z1);
    rng[t * 4] = a;
    rng[t * 4 + 1] = b;
    rng[t * 4 + 2] = c;
    rng[t * 4 + 3] = d;
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) cnt[j * nx + i + 1]++;
  }
  for (let i = 0; i < nx * nz; i++) cnt[i + 1] += cnt[i];
  const fill = cnt.slice(0, nx * nz);
  const list = new Uint32Array(cnt[nx * nz]);
  for (let t = 0; t < nt; t++) {
    const a = rng[t * 4],
      b = rng[t * 4 + 1],
      c = rng[t * 4 + 2],
      d = rng[t * 4 + 3];
    for (let j = c; j <= d; j++) for (let i = a; i <= b; i++) list[fill[j * nx + i]++] = t;
  }
  return { geo, nx, nz, cs, x0: bb.min.x, z0: bb.min.z, start: cnt, list, stamp: new Uint32Array(nt), vi };
}

// 線段 a→b（世界座標）有沒有打到網格 o 的三角形；打到時 test(世界座標的命中點) 為 true 才算（地面上的東西不算之類）。
// 回傳命中點（世界座標，共用的向量）或 null
export function segHitMesh(o, a, b, test) {
  const geo = o.geometry;
  let G = GRIDS.get(geo);
  if (!G || G.geo !== geo) GRIDS.set(geo, (G = build(geo)));
  _inv.copy(o.matrixWorld).invert();
  _a.copy(a).applyMatrix4(_inv);
  _b.copy(b).applyMatrix4(_inv);
  _d.copy(_b).sub(_a);
  const len = _d.length();
  if (len < 1e-6) return null;
  _ray.origin.copy(_a);
  _ray.direction.copy(_d).divideScalar(len);
  const pos = geo.attributes.position;
  const st = G.stamp;
  const stamp = (stampN = (stampN + 1) >>> 0 || 1);
  const side = o.material && !Array.isArray(o.material) ? o.material.side : THREE.FrontSide;
  const cull = side === THREE.FrontSide;
  // 2D 的 DDA：沿著線段在 XZ 的投影走過的格子（局部座標）
  const fx = (_a.x - G.x0) / G.cs,
    fz = (_a.z - G.z0) / G.cs;
  const dx = _d.x / G.cs,
    dz = _d.z / G.cs;
  let ix = Math.floor(fx),
    iz = Math.floor(fz);
  const stepX = dx > 0 ? 1 : -1,
    stepZ = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity,
    tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmx = dx !== 0 ? (dx > 0 ? ix + 1 - fx : fx - ix) * tdx : Infinity,
    tmz = dz !== 0 ? (dz > 0 ? iz + 1 - fz : fz - iz) * tdz : Infinity;
  let best = Infinity;
  for (let guard = 0; guard < 4096; guard++) {
    if (ix >= 0 && iz >= 0 && ix < G.nx && iz < G.nz) {
      const c = iz * G.nx + ix;
      for (let k = G.start[c], e = G.start[c + 1]; k < e; k++) {
        const t = G.list[k];
        if (st[t] === stamp) continue;
        st[t] = stamp;
        _v0.fromBufferAttribute(pos, G.vi(t, 0));
        _v1.fromBufferAttribute(pos, G.vi(t, 1));
        _v2.fromBufferAttribute(pos, G.vi(t, 2));
        const h = _ray.intersectTriangle(_v0, _v1, _v2, cull, _hit);
        if (!h) continue;
        const dd = h.distanceTo(_a);
        if (dd > len || dd >= best) continue;
        h.applyMatrix4(o.matrixWorld);
        if (test && !test(h)) continue;
        best = dd;
        _best.copy(h); // 記下最近的命中點（世界座標）
      }
    }
    // 這一格之後不會有更近的命中：已經找到時停
    const tNext = Math.min(tmx, tmz);
    if (tNext > 1 || best <= tNext * len) break;
    if (tmx < tmz) {
      ix += stepX;
      tmx += tdx;
    } else {
      iz += stepZ;
      tmz += tdz;
    }
  }
  if (best === Infinity) return null;
  return _hit.copy(_best);
}
