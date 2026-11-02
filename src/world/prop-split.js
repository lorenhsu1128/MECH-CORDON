// 地圖物件的零件分批脫落（docs/destruction-design.md 第 2 期）：執行時把物件的三角形依條件切出來。
// 地圖物件的網格是 PK 依材質合併的（每個物件幾個網格），附件沒有自己的網格，所以依「三角形的重心在哪裡」分：
//   - 建模時標出的區域（PK.dmgTier(n, fn) 加入的零件外框、PK.dmgCut(y) 的切線，DMG_INFO）
//   - 沒有標出時自動：小細節（render/detail.js 的 fine 網格：欄杆、爬梯、天線…）分兩批；高的物件切掉最上面一段
// 切出來的三角形依位置分成幾塊（世界座標的格子），每塊一個網格交給呼叫端拋出；剩下的換成新的幾何
// （不改原本的幾何：可能是共用的）。頂點色的原始值（焦黑用，CH0）跟著切。只有外觀，碰撞另外由 world 處理。
import { isFine } from '../render/detail.js';
import { isOutline } from '../render/geometry.js';

export const CH0 = new WeakMap(); // 幾何 → 原本的頂點色（game/destruct.js 的焦黑）
const DMG_INFO = new WeakMap(); // PK 建出來的群組 → { tiers: { n: [Box3（群組座標）] }, cut: y（群組座標）}
export function setDmgInfo(group, info) {
  DMG_INFO.set(group, info);
}
// 物件群組（含子孫）裡建模時標出的分批資訊：回傳 { obj, info } 或 null
export function findDmgInfo(root) {
  let r = null;
  root.traverse((o) => {
    if (!r && DMG_INFO.has(o)) r = { obj: o, info: DMG_INFO.get(o) };
  });
  return r;
}
// 標出的第 n 批的區域（世界座標的外框）
export function tierBoxes(root, n) {
  const f = findDmgInfo(root);
  if (!f || !f.info.tiers || !f.info.tiers[n]) return null;
  f.obj.updateMatrixWorld(true);
  return f.info.tiers[n].map((b) => b.clone().applyMatrix4(f.obj.matrixWorld));
}
// 標出的切線（世界座標的高度）
export function cutHeight(root) {
  const f = findDmgInfo(root);
  if (!f || f.info.cut === undefined) return null;
  f.obj.updateMatrixWorld(true);
  return new THREE.Vector3(0, f.info.cut, 0).applyMatrix4(f.obj.matrixWorld).y;
}

const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const hash = (x, y, z) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
};
export const cellHash = (c, s) => hash(Math.floor(c.x / s), Math.floor(c.y / s), Math.floor(c.z / s));

// 把 root 底下網格裡 pred(重心（世界）, 網格, 是不是小細節) 為真的三角形切出來（回傳 2＝只拿掉、不切成塊）。o＝{ cell 分塊的格子大小（公尺）, max 最多幾塊, keepOut 不要切出來的塊（只拿掉）}
// 回傳切出來的塊 [{ geo（世界座標、以重心為原點）, at（重心）, mat, n（三角形數）}]（依大小排序，最多 max 塊）與切掉的三角形數
export function splitTris(root, pred, o = {}) {
  const cell = o.cell || 2.5,
    max = o.max === undefined ? 6 : o.max;
  root.updateMatrixWorld(true);
  const pieces = new Map();
  let cutN = 0;
  const meshes = [];
  root.traverse((m) => {
    if (!m.isMesh || !m.geometry || m.isInstancedMesh || m.isSkinnedMesh || !m.visible) return;
    if (Array.isArray(m.material) || isOutline(m.material) || !m.geometry.attributes.position) return;
    meshes.push(m);
  });
  for (const m of meshes) {
    const src = m.geometry;
    const g = src.index ? src.toNonIndexed() : src;
    const P = g.attributes.position;
    const T = Math.floor(P.count / 3);
    if (!T) continue;
    const mw = m.matrixWorld;
    const take = new Uint8Array(T);
    let nt = 0;
    const fine = isFine(m);
    for (let t = 0; t < T; t++) {
      _a.fromBufferAttribute(P, t * 3);
      _b.fromBufferAttribute(P, t * 3 + 1);
      _c.fromBufferAttribute(P, t * 3 + 2);
      _a.add(_b)
        .add(_c)
        .multiplyScalar(1 / 3)
        .applyMatrix4(mw);
      const v = pred(_a, m, fine);
      if (v) {
        take[t] = v === 2 ? 2 : 1; // 2＝只拿掉、不切出來（小細節）
        nt++;
      }
    }
    if (!nt) continue;
    cutN += nt;
    const names = Object.keys(g.attributes);
    const c0 = CH0.get(src);
    // 留下的
    const keep = new THREE.BufferGeometry();
    const kc0 = c0 && !src.index ? [] : null;
    for (const nm of names) {
      const A = g.attributes[nm],
        is = A.itemSize;
      const out = new A.array.constructor((T - nt) * 3 * is);
      let j = 0;
      for (let t = 0; t < T; t++) {
        if (take[t]) continue;
        for (let v = 0; v < 3; v++)
          for (let q = 0; q < is; q++) {
            const i = (t * 3 + v) * is + q;
            out[j] = A.array[i];
            if (nm === 'color' && kc0) kc0.push(c0[i]);
            j++;
          }
      }
      keep.setAttribute(nm, new THREE.BufferAttribute(out, is, A.normalized));
    }
    if (kc0) CH0.set(keep, Float32Array.from(kc0));
    if (src.boundingBox) keep.boundingBox = src.boundingBox.clone();
    keep.computeBoundingSphere();
    if (o.clipTop !== undefined && keep.boundingBox) {
      // 切掉上段：外框的頂也降下來（mesh 座標）
      const inv = new THREE.Matrix4().copy(mw).invert();
      const ly = _n.set(0, o.clipTop, 0).applyMatrix4(inv).y;
      if (ly < keep.boundingBox.max.y) keep.boundingBox.max.y = Math.max(keep.boundingBox.min.y, ly);
    }
    m.geometry = keep;
    if (nt === T) m.visible = false;
    if (o.keepOut) continue;
    // 切出來的：依世界座標的格子分塊（同一塊同一個材質）
    _nm.getNormalMatrix(mw);
    const N = g.attributes.normal;
    for (let t = 0; t < T; t++) {
      if (take[t] !== 1) continue;
      _a.fromBufferAttribute(P, t * 3);
      _b.fromBufferAttribute(P, t * 3 + 1);
      _c.fromBufferAttribute(P, t * 3 + 2);
      _a.add(_b)
        .add(_c)
        .multiplyScalar(1 / 3)
        .applyMatrix4(mw);
      const key = `${Math.floor(_a.x / cell)},${Math.floor(_a.y / cell)},${Math.floor(_a.z / cell)}`;
      let pc = pieces.get(key + '|' + m.material.uuid);
      if (!pc)
        pieces.set(
          key + '|' + m.material.uuid,
          (pc = { mat: m.material, pos: [], nor: [], col: [], n: 0, vc: !!g.attributes.color }),
        );
      pc.n++;
      for (let v = 0; v < 3; v++) {
        const i = t * 3 + v;
        _b.fromBufferAttribute(P, i).applyMatrix4(mw);
        pc.pos.push(_b.x, _b.y, _b.z);
        if (N) {
          _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
          pc.nor.push(_n.x, _n.y, _n.z);
        }
        if (pc.vc) {
          const C = g.attributes.color;
          pc.col.push(C.getX(i), C.getY(i), C.getZ(i));
        }
      }
    }
  }
  const list = [...pieces.values()].sort((a, b) => b.n - a.n).slice(0, max);
  const out = list.map((pc) => {
    const geo = new THREE.BufferGeometry();
    const pos = Float32Array.from(pc.pos);
    const at = new THREE.Vector3();
    for (let i = 0; i < pos.length; i += 3) {
      at.x += pos[i];
      at.y += pos[i + 1];
      at.z += pos[i + 2];
    }
    at.multiplyScalar(3 / pos.length);
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] -= at.x;
      pos[i + 1] -= at.y;
      pos[i + 2] -= at.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (pc.nor.length) geo.setAttribute('normal', new THREE.BufferAttribute(Float32Array.from(pc.nor), 3));
    else geo.computeVertexNormals();
    if (pc.vc) geo.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(pc.col), 3));
    geo.computeBoundingSphere();
    return { geo, at, mat: pc.mat, n: pc.n };
  });
  return { pieces: out, n: cutN };
}

// 長的三角形細分到每條邊不超過 maxEdge（局部打穿的壩體、隧道口：一片牆是整段長的三角形，重心不會落在各段裡）。
// 沿最長的邊從中點切開，所有頂點屬性一起內插；換成新的幾何（不改原本的：可能是共用的）
export function tessellate(root, maxEdge, maxTris = 60000) {
  root.traverse((m) => {
    if (!m.isMesh || !m.geometry || m.isInstancedMesh || m.isSkinnedMesh || Array.isArray(m.material)) return;
    if (isOutline(m.material) || !m.geometry.attributes.position) return;
    const g0 = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    const names = Object.keys(g0.attributes);
    const A = names.map((n) => g0.attributes[n]);
    const sc = new THREE.Vector3();
    m.updateMatrixWorld(true);
    m.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), sc);
    const k = Math.max(sc.x, sc.y, sc.z) || 1;
    const lim2 = (maxEdge / k) * (maxEdge / k);
    // 每個頂點＝各屬性的值（攤平）
    const tris = [];
    const P = g0.attributes.position;
    for (let t = 0; t < P.count / 3; t++) {
      const v = [0, 1, 2].map((j) =>
        A.map((a) => Array.from({ length: a.itemSize }, (_, q) => a.array[(t * 3 + j) * a.itemSize + q])),
      );
      tris.push(v);
    }
    const out = [];
    const d2 = (a, b) => {
      const p = a[names.indexOf('position')],
        r = b[names.indexOf('position')];
      return (p[0] - r[0]) ** 2 + (p[1] - r[1]) ** 2 + (p[2] - r[2]) ** 2;
    };
    const mid = (a, b) => a.map((arr, i) => arr.map((x, q) => (x + b[i][q]) / 2));
    let changed = false;
    while (tris.length) {
      const v = tris.pop();
      if (out.length + tris.length > maxTris) {
        out.push(v);
        continue;
      }
      const e = [d2(v[0], v[1]), d2(v[1], v[2]), d2(v[2], v[0])];
      const i = e.indexOf(Math.max(...e));
      if (e[i] <= lim2) {
        out.push(v);
        continue;
      }
      changed = true;
      const a = v[i],
        b = v[(i + 1) % 3],
        c = v[(i + 2) % 3];
      const mm = mid(a, b);
      tris.push([a, mm, c], [mm, b, c]);
    }
    if (!changed) return;
    const geo = new THREE.BufferGeometry();
    names.forEach((n, i) => {
      const a = A[i];
      const arr = new a.array.constructor(out.length * 3 * a.itemSize);
      let o = 0;
      for (const v of out) for (const vert of v) for (const x of vert[i]) arr[o++] = x;
      geo.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
    });
    if (m.geometry.boundingBox) geo.boundingBox = m.geometry.boundingBox.clone();
    geo.computeBoundingSphere();
    m.geometry = geo;
  });
}
