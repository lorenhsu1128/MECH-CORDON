// ---------- 無邊界地圖（上下左右相接）的共用工具：純函式，不是 mixin（docs/torus-map-design.md）----------
// 地圖的內容只有一格（邊長 S，產生時的座標 −S/2～S/2）；遊戲中的座標不取餘數，所有東西搬到離參考點最近的那一份：
// - seamBlend：不相接的地形函式 → 在接縫兩側交叉淡化成相接的
// - splitMeshCells／splitInstanced：跨整張地圖的網格依格子切成小塊（每塊各自搬）
// - wrapData：障礙物、可破壞物件的命中形狀、坡道搬到參考點 F 附近
// - wrapView：World 的網格搬到鏡頭附近＋遠景地形（同一份高度圖的低解析度塊，補在看得到、但物件不出現的地方）
import { lerp } from '../core/math.js';
import { WS } from '../core/scale.js';

export const TORUS_SIZE = 320 * WS; // 一般的地圖（960 m；要是地形格子 5 m 與障礙物格子 24 m 的整數倍）
export const TORUS_BIG = 400 * WS; // 大地圖（1200 m）
export const TORUS_K = 124; // k＝S／124：原本寫成 ±62k 的範圍＝整格
export const SEAM_B = 20 * WS; // 接縫兩側交叉淡化的寬度（各 60 m）
export const WRAP_HYS = 8 * WS; // 超過半格再多這麼遠才搬（切口附近不來回跳）
export const TILE_N = 8; // 分塊：每邊幾塊
const FAR_STEP = 4; // 遠景地形：每幾個地形格子取一點

const sm = (t) => t * t * (3 - 2 * t);
// H(x, z)（定義域比原格大 B）→ 週期 S 的函式（只在原格 −S/2～S/2 裡取值）
export function seamBlend(H, S, B) {
  const h = S / 2,
    a = h - B;
  const bx = (x, z) => {
    if (x > a) return lerp(H(x, z), H(x - S, z), sm((x - a) / (2 * B)));
    if (x < -a) return lerp(H(x + S, z), H(x, z), sm((x + S - a) / (2 * B)));
    return H(x, z);
  };
  return (x, z) => {
    if (z > a) return lerp(bx(x, z), bx(x, z - S), sm((z - a) / (2 * B)));
    if (z < -a) return lerp(bx(x, z + S), bx(x, z), sm((z + S - a) / (2 * B)));
    return bx(x, z);
  };
}

// 要搬幾公尺：d＝參考點 − 自己；超過半格（＋緩衝）才搬
function hop(d, S, H) {
  return d > H || d < -H ? S * Math.round(d / S) : 0;
}

// ---------- 網格分塊 ----------
// 頂點是世界座標的網格（位置在原點）依三角形重心分到 cell 的格子；回傳新的網格（材質共用、userData 與陰影照抄）
export function splitMeshCells(mesh, cell) {
  let geo = mesh.geometry;
  if (geo.index) geo = geo.toNonIndexed();
  mesh.updateMatrix();
  const pos = geo.attributes.position,
    M = mesh.matrix,
    e = M.elements;
  const ident = M.equals(_I);
  const tri = pos.count / 3;
  const mats = Array.isArray(mesh.material) ? mesh.material : null;
  const groups = mats && geo.groups.length ? geo.groups : [{ start: 0, count: pos.count, materialIndex: 0 }];
  const out = [];
  for (const gr of groups) {
    const cells = new Map();
    for (let t = gr.start / 3; t < (gr.start + gr.count) / 3 && t < tri; t++) {
      let x = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3,
        z = (pos.getZ(t * 3) + pos.getZ(t * 3 + 1) + pos.getZ(t * 3 + 2)) / 3;
      if (!ident) {
        const y = (pos.getY(t * 3) + pos.getY(t * 3 + 1) + pos.getY(t * 3 + 2)) / 3;
        const wx = e[0] * x + e[4] * y + e[8] * z + e[12];
        z = e[2] * x + e[6] * y + e[10] * z + e[14];
        x = wx;
      }
      const k = Math.floor(x / cell) * 65536 + Math.floor(z / cell);
      let L = cells.get(k);
      if (!L) cells.set(k, (L = []));
      L.push(t);
    }
    for (const L of cells.values()) {
      const g = new THREE.BufferGeometry();
      for (const name of Object.keys(geo.attributes)) {
        const A = geo.attributes[name],
          n = A.itemSize;
        const arr = new A.array.constructor(L.length * 3 * n);
        let o = 0;
        for (const t of L) {
          const s = t * 3 * n;
          for (let q = 0; q < 3 * n; q++) arr[o++] = A.array[s + q];
        }
        g.setAttribute(name, new THREE.BufferAttribute(arr, n, A.normalized));
      }
      const m = new THREE.Mesh(g, mats ? mats[gr.materialIndex] : mesh.material);
      m.position.copy(mesh.position);
      m.quaternion.copy(mesh.quaternion);
      m.scale.copy(mesh.scale);
      m.castShadow = mesh.castShadow;
      m.receiveShadow = mesh.receiveShadow;
      m.renderOrder = mesh.renderOrder;
      m.frustumCulled = mesh.frustumCulled;
      Object.assign(m.userData, mesh.userData);
      out.push(m);
    }
  }
  return out;
}
const _I = new THREE.Matrix4();
const _m4 = new THREE.Matrix4();

// InstancedMesh（實例的矩陣是世界座標）依實例的位置分格
export function splitInstanced(im, cell) {
  const cells = new Map();
  for (let i = 0; i < im.count; i++) {
    im.getMatrixAt(i, _m4);
    const k = Math.floor(_m4.elements[12] / cell) * 65536 + Math.floor(_m4.elements[14] / cell);
    let L = cells.get(k);
    if (!L) cells.set(k, (L = []));
    L.push(i);
  }
  const out = [];
  for (const L of cells.values()) {
    const m = new THREE.InstancedMesh(im.geometry, im.material, L.length);
    L.forEach((i, q) => {
      im.getMatrixAt(i, _m4);
      m.setMatrixAt(q, _m4);
      if (im.instanceColor) {
        im.getColorAt(i, _c);
        m.setColorAt(q, _c);
      }
    });
    m.castShadow = im.castShadow;
    m.receiveShadow = im.receiveShadow;
    m.renderOrder = im.renderOrder;
    Object.assign(m.userData, im.userData);
    m.computeBoundingSphere();
    out.push(m);
  }
  return out;
}
const _c = new THREE.Color();

// 產生之後：World 的網格裡跨太大的（頂點是世界座標、位置在原點）切成小塊。回傳切不了的大群組（測試時列出來）
export function tileize(w) {
  const cell = w.size / TILE_N,
    big = [];
  const L = w.meshes;
  for (let i = L.length - 1; i >= 0; i--) {
    const o = L[i];
    if (o.userData.wrapKids || o.userData.uniform || !o.parent) continue;
    _b.setFromObject(o);
    if (_b.isEmpty()) continue;
    const sx = _b.max.x - _b.min.x,
      sz = _b.max.z - _b.min.z;
    if (Math.max(sx, sz) <= cell * 1.5) continue;
    let parts = null;
    if (o.isInstancedMesh) parts = splitInstanced(o, cell);
    else if (o.isMesh && !o.isSkinnedMesh) parts = splitMeshCells(o, cell);
    if (!parts) {
      big.push(o);
      continue;
    }
    const par = o.parent;
    par.remove(o);
    if (!o.isInstancedMesh) o.geometry.dispose();
    L.splice(i, 1, ...parts);
    for (const p of parts) par.add(p);
    if (w.terrainMesh === o) {
      w.terrainMesh = parts[0];
      w.terrainChunks = parts;
    }
  }
  return big;
}
const _b = new THREE.Box3();

// ---------- 搬資料 ----------
function shiftOb(o, dx, dz, done) {
  o.x += dx;
  o.z += dz;
  for (const k of BOX_KEYS) {
    const b = o[k];
    if (b && b.isBox3 && !done.has(b)) {
      done.add(b);
      b.min.x += dx;
      b.max.x += dx;
      b.min.z += dz;
      b.max.z += dz;
    }
  }
}
const BOX_KEYS = ['box', 'fbox'];
const SHAPE_X = ['x', 'x0', 'x1', 'cx'],
  SHAPE_Z = ['z', 'z0', 'z1', 'cz'];
// 障礙物、可破壞物件、坡道搬到 (fx, fz) 附近；回傳搬了幾個
export function wrapData(w, fx, fz) {
  const S = w.size,
    H = S / 2 + WRAP_HYS;
  w.fx = fx;
  w.fz = fz;
  let n = 0;
  const done = (w._wd = w._wd || new Set());
  done.clear();
  const obs = (L) => {
    for (const o of L) {
      if (done.has(o)) continue;
      const dx = hop(fx - o.x, S, H),
        dz = hop(fz - o.z, S, H);
      if (dx || dz) {
        done.add(o);
        shiftOb(o, dx, dz, done);
        n++;
      }
    }
  };
  obs(w.obstacles);
  if (w.occluders) obs(w.occluders);
  if (w.ramps) obs(w.ramps);
  if (w.props)
    for (const p of w.props) {
      const dx = hop(fx - p.pos.x, S, H),
        dz = hop(fz - p.pos.z, S, H);
      if (!dx && !dz) continue;
      n++;
      p.pos.x += dx;
      p.pos.z += dz;
      const sh = p.shape;
      if (sh && !done.has(sh)) {
        done.add(sh);
        for (const k of SHAPE_X) sh[k] += dx;
        for (const k of SHAPE_Z) sh[k] += dz;
      }
    }
  for (const fn of w.wrapHooks || []) n += fn(fx, fz, S, H, hop) || 0;
  return n;
}

// ---------- 搬畫面 ----------
// 網格的中心（相對它的位置）：位置不在原點的當成在地建模的；在原點的量外框（頂點是世界座標的合併網格、分塊）
function ctrOf(w, o) {
  let c = w._ctr.get(o);
  if (c) return c;
  c = { x: 0, z: 0 };
  if (o.position.x === 0 && o.position.z === 0 && !o.userData.uniform) {
    _b.setFromObject(o);
    if (!_b.isEmpty()) {
      c.x = (_b.min.x + _b.max.x) / 2;
      c.z = (_b.min.z + _b.max.z) / 2;
    }
  }
  w._ctr.set(o, c);
  return c;
}
function hopObj(w, o, cx, cz, S, H) {
  const c = ctrOf(w, o);
  const dx = hop(cx - o.position.x - c.x, S, H),
    dz = hop(cz - o.position.z - c.z, S, H);
  if (dx || dz) {
    o.position.x += dx;
    o.position.z += dz;
    o.updateMatrix();
    o.updateMatrixWorld(true);
    return 1;
  }
  return 0;
}
// World 的網格搬到 (cx, cz) 附近；R＝看得到多遠（遠景地形補到這裡）
export function wrapView(w, cx, cz, R) {
  const S = w.size,
    H = S / 2 + WRAP_HYS;
  if (!w._ctr) w._ctr = new WeakMap();
  let n = 0;
  for (const o of w.meshes) {
    if (o.userData.wrapKids) for (const k of o.children) n += hopObj(w, k, cx, cz, S, H);
    else if (o.userData.uniform) {
      // 整片一樣的大平面（水面、岩頂、格線）：跟著鏡頭以整格移動
      const dx = hop(cx - o.position.x, S, S / 2),
        dz = hop(cz - o.position.z, S, S / 2);
      if (dx || dz) {
        o.position.x += dx;
        o.position.z += dz;
        o.updateMatrix();
        n++;
      }
    } else n += hopObj(w, o, cx, cz, S, H);
  }
  farTick(w, cx, cz, R);
  return n;
}

// ---------- 遠景地形 ----------
// 每一塊一份低解析度的幾何（以塊的中心為原點）；離鏡頭 S/2 以外、R 以內的「另外幾份」用它補上（最多 3 份）
export function buildFarTerrain(w, colorAt) {
  const N = TILE_N,
    cs = w.size / N,
    step = w.cell * FAR_STEP,
    q = Math.round(cs / step);
  const far = (w.far = { tiles: [], mat: w.terrainMesh.material, cs });
  for (let tj = 0; tj < N; tj++)
    for (let ti = 0; ti < N; ti++) {
      const ox = -w.size / 2 + (ti + 0.5) * cs,
        oz = -w.size / 2 + (tj + 0.5) * cs;
      const geo = new THREE.PlaneGeometry(cs, cs, q, q);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position;
      for (let k = 0; k < pos.count; k++)
        pos.setY(k, w.terrainHeight(ox + pos.getX(k), oz + pos.getZ(k)) - 0.3 * WS);
      geo.computeVertexNormals();
      const nr = geo.attributes.normal,
        col = new Float32Array(pos.count * 3);
      for (let k = 0; k < pos.count; k++) {
        colorAt(nr.getY(k), pos.getY(k), _c);
        col[k * 3] = _c.r;
        col[k * 3 + 1] = _c.g;
        col[k * 3 + 2] = _c.b;
      }
      const ng = geo.toNonIndexed(),
        c2 = new THREE.BufferAttribute(col, 3);
      // 分面的顏色與法線照地形網格的屬性（平滑版 stNrm2／stCol2 也要有：場景平滑的風格讀它們）
      const idx = geo.index,
        fc = new Float32Array(idx.count * 3),
        fn = new Float32Array(idx.count * 3);
      for (let t = 0; t < idx.count; t++) {
        const v = idx.getX(t);
        fc[t * 3] = c2.getX(v);
        fc[t * 3 + 1] = c2.getY(v);
        fc[t * 3 + 2] = c2.getZ(v);
        fn[t * 3] = nr.getX(v);
        fn[t * 3 + 1] = nr.getY(v);
        fn[t * 3 + 2] = nr.getZ(v);
      }
      ng.setAttribute('color', new THREE.BufferAttribute(fc, 3));
      ng.setAttribute('stCol2', new THREE.BufferAttribute(fc, 3));
      ng.setAttribute('stNrm2', new THREE.BufferAttribute(fn, 3));
      geo.dispose();
      far.tiles.push({ ox, oz, geo: ng, ghosts: [] });
    }
}
function farTick(w, cx, cz, R) {
  const far = w.far;
  if (!far) return;
  const S = w.size,
    reach = R + far.cs / 2;
  for (const t of far.tiles) {
    // 最近的那一份（高解析度的分塊在那裡）
    const nx = t.ox + S * Math.round((cx - t.ox) / S),
      nz = t.oz + S * Math.round((cz - t.oz) / S);
    const sx = nx > cx ? -S : S,
      sz = nz > cz ? -S : S;
    let g = 0;
    for (let q = 1; q < 4; q++) {
      const x = nx + (q & 1 ? sx : 0),
        z = nz + (q & 2 ? sz : 0);
      if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) > reach) continue;
      let m = t.ghosts[g];
      if (!m) {
        m = t.ghosts[g] = new THREE.Mesh(t.geo, far.mat);
        m.receiveShadow = true;
        m.userData.noFade = true;
        m.userData.cat = 'far';
        m.userData.far = true;
        w.scene.add(m);
      }
      m.visible = true;
      if (m.position.x !== x || m.position.z !== z) {
        m.position.set(x, 0, z);
        m.updateMatrixWorld(true);
      }
      g++;
    }
    for (; g < t.ghosts.length; g++) t.ghosts[g].visible = false;
  }
}
export function disposeFar(w) {
  if (!w.far) return;
  for (const t of w.far.tiles) {
    for (const m of t.ghosts) w.scene.remove(m);
    t.geo.dispose();
  }
  w.far = null;
}
