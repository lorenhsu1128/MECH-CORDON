// 人形機甲的部位判定與部位閃紅（2026-11-18 使用者定案，docs/hit-react-design.md 的「部位判定」）。
// - 每個區塊（buildMech 的 rig.pieces：頭、核心、襠部、上臂／前臂／手、大腿／小腿／腳掌、武器、肩上武器、背包）
//   在合併網格之前量一次自己座標裡的外框（measureHitBoxes，rig.hb：順序＝rig.pieces 的順序，房主與客機一致）；
//   判定時把彈道換到區塊的座標做方塊的射線檢查（hitRay），外框跟著動作與 IK。只在命中（或靠近）時才算。
// - 部位閃紅（partFlash）：遊戲的機甲合併成蒙皮網格（render/mesh-merge.js），所以每個網格掛一個共用幾何的
//   子網格（和透視輪廓 camXray 同樣的做法），蒙皮的那份在著色器裡只留屬於這個區塊的骨頭；平時隱藏、不畫。
import { isUnder } from './mesh-merge.js';
import { isOutline } from './geometry.js';

// 部位（瞄準與之後的依部位受擊反應用）
export const HP = {
  core: 0,
  head: 1,
  waist: 2,
  armR: 3,
  armL: 4,
  legR: 5,
  legL: 6,
  backR: 7,
  backL: 8,
  pack: 9,
};
function partOfSlot(slot) {
  const s = slot.split('/');
  const cat = s[0],
    last = s[s.length - 1];
  if (cat === 'head') return HP.head;
  if (cat === 'core') return HP.core;
  if (cat === 'booster') return HP.pack;
  if (cat === 'arms') return last.startsWith('r_') ? HP.armR : HP.armL;
  if (cat === 'weapon') return last === 'r' ? HP.armR : HP.armL;
  if (cat === 'back') return last === 'r' ? HP.backR : HP.backL;
  if (cat === 'legs') {
    if (last === 'pelvis' || last === 'body') return HP.waist;
    const k = last.split('_')[0]; // r／l，四足 fl／fr／bl／br
    return k.endsWith('r') ? HP.legR : HP.legL;
  }
  return HP.core;
}

const _m = new THREE.Matrix4(),
  _a = new THREE.Vector3(),
  _d = new THREE.Vector3(),
  _v = new THREE.Vector3(),
  _box = new THREE.Box3();

// 量每個區塊的外框（區塊座標）：只算區塊自己的網格（子區塊、連接點、輔助標示、描邊、加色發光不算）。
// 外框取頂點分布的 1.5%～98.5%（細長的天線、刀尖不會把外框撐大），InstancedMesh（戰車的輪子與履帶）用它的外框。
// 同樣的網格組合（程式模型的區塊快取、同一個 GLB）結果相同：依幾何快取，生成增援時不重算
const BOX_CACHE = new Map();
const TRIM = 0.015,
  SAMPLE = 1500;
function pieceBox(node, set) {
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
  const meshes = [];
  const walk = (o) => {
    for (const c of o.children) {
      if (set.has(c) || !c.visible) continue;
      const u = c.userData || {};
      if (u.conn || u.helper || u.xray) continue;
      const mt = c.material;
      if (
        c.isMesh &&
        c.geometry &&
        mt &&
        !Array.isArray(mt) &&
        !isOutline(mt) &&
        mt.blending !== THREE.AdditiveBlending
      )
        meshes.push(c);
      walk(c);
    }
  };
  walk(node);
  if (!meshes.length) return null;
  const rel = meshes.map((c) => new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
  const key = meshes
    .map((c, k) => c.geometry.uuid + ':' + rel[k].elements.map((x) => x.toFixed(3)).join(','))
    .join('|');
  const hit = BOX_CACHE.get(key);
  if (hit) return hit;
  const xs = [],
    ys = [],
    zs = [];
  const hard = new THREE.Box3();
  meshes.forEach((c, k) => {
    if (c.isInstancedMesh) {
      c.computeBoundingBox();
      hard.union(_box.copy(c.boundingBox).applyMatrix4(rel[k]));
      return;
    }
    const pa = c.geometry.attributes.position;
    if (!pa) return;
    const step = Math.max(1, Math.floor(pa.count / SAMPLE));
    for (let i = 0; i < pa.count; i += step) {
      _v.fromBufferAttribute(pa, i).applyMatrix4(rel[k]);
      xs.push(_v.x);
      ys.push(_v.y);
      zs.push(_v.z);
    }
  });
  const min = new THREE.Vector3(Infinity, Infinity, Infinity),
    max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  if (xs.length) {
    const n = xs.length,
      lo = n >= 60 ? Math.floor(n * TRIM) : 0,
      hi = n >= 60 ? n - 1 - lo : n - 1;
    for (const [arr, k] of [
      [xs, 'x'],
      [ys, 'y'],
      [zs, 'z'],
    ]) {
      const a = Float32Array.from(arr).sort();
      min[k] = a[lo];
      max[k] = a[hi];
    }
  }
  if (!hard.isEmpty()) {
    min.min(hard.min);
    max.max(hard.max);
  }
  const out = min.x <= max.x ? { min, max } : null;
  if (BOX_CACHE.size > 400) BOX_CACHE.clear();
  BOX_CACHE.set(key, out);
  return out;
}
export function measureHitBoxes(rig) {
  if (!rig || !rig.pieces || rig.hb || rig.merged) return;
  rig.group.updateMatrixWorld(true);
  const nodes = Object.entries(rig.pieces);
  const set = new Set(nodes.map((x) => x[1]));
  rig.hb = nodes.map(([slot, node]) => {
    const b = pieceBox(node, set);
    return { node, slot, part: partOfSlot(slot), min: b ? b.min : _v, max: b ? b.max : _v, ok: !!b };
  });
}

// 區塊的世界縮放（射線檢查的外擴量換到區塊座標）
const scaleOf = (e) => Math.sqrt(e[0] * e[0] + e[1] * e[1] + e[2] * e[2]) || 1;

// 線段 a → a＋v（世界座標）打到的第一個區塊：{ i（區塊）, part, t（0～1）, n（世界座標的表面法線） }，沒有＝null。
// pad＝外框往外擴（公尺）
const _hit = { i: -1, part: 0, t: 0, n: new THREE.Vector3() };
export function hitRay(rig, a, v, pad = 0) {
  const L = rig && rig.hb;
  if (!L) return null;
  const root = rig.group;
  let best = -1,
    bt = Infinity,
    bax = 0,
    bsg = 0;
  let ln = null,
    lok = false,
    p = 0;
  for (let i = 0; i < L.length; i++) {
    const h = L[i];
    if (!h.ok) continue;
    if (h.node !== ln) {
      // 同一個節點的外框連在一起（體素化的外框一個節點很多個）：反矩陣只算一次
      ln = h.node;
      lok = ln.visible && isUnder(ln, root); // 丟出去的武器、藏起來的部位
      if (lok) {
        _m.copy(ln.matrixWorld).invert();
        _a.copy(a).applyMatrix4(_m);
        _d.copy(a).add(v).applyMatrix4(_m).sub(_a);
        p = pad / scaleOf(ln.matrixWorld.elements);
      }
    }
    if (!lok) continue;
    let t0 = 0,
      t1 = 1,
      ax = -1,
      sg = 0,
      miss = false;
    for (let k = 0; k < 3; k++) {
      const o = _a.getComponent(k),
        d = _d.getComponent(k),
        lo = h.min.getComponent(k) - p,
        hi = h.max.getComponent(k) + p;
      if (Math.abs(d) < 1e-9) {
        if (o < lo || o > hi) {
          miss = true;
          break;
        }
        continue;
      }
      let ta = (lo - o) / d,
        tb = (hi - o) / d,
        s = -1;
      if (ta > tb) {
        const x = ta;
        ta = tb;
        tb = x;
        s = 1;
      }
      if (ta > t0) {
        t0 = ta;
        ax = k;
        sg = s;
      }
      if (tb < t1) t1 = tb;
      if (t0 > t1) {
        miss = true;
        break;
      }
    }
    if (miss || t0 >= bt) continue;
    best = i;
    bt = t0;
    bax = ax;
    bsg = sg;
  }
  if (best < 0) return null;
  _hit.i = best;
  _hit.part = L[best].part;
  _hit.t = bt;
  if (bax < 0)
    _hit.n.copy(v).normalize().negate(); // 起點就在外框裡
  else {
    _hit.n.set(0, 0, 0).setComponent(bax, bsg);
    _hit.n.transformDirection(L[best].node.matrixWorld);
  }
  return _hit;
}

// 區塊外框上離 src 最近的點 outP 與朝 src 的方向 outN（沒有彈道的攻擊：近戰、爆炸…的火花與碎片從這裡噴出）；
// src 在外框裡時 outN＝0（呼叫端自己決定方向）
const _ps = new THREE.Vector3();
export function pieceSurface(rig, i, src, outP, outN) {
  const h = rig && rig.hb && rig.hb[i];
  if (!h || !h.ok) return false;
  _m.copy(h.node.matrixWorld).invert();
  _ps.copy(src).applyMatrix4(_m).clamp(h.min, h.max);
  outP.copy(_ps).applyMatrix4(h.node.matrixWorld);
  outN.copy(src).sub(outP);
  if (outN.lengthSq() < 1e-4) outN.set(0, 0, 0);
  else outN.normalize();
  return true;
}

// ---------- 沒有區塊的模型（載具、專屬敵人、Boss、機獸、Boss 的部位）：體素化的外框（2026-11-21）----------
// 每個錨點（根、會動的節點＝網格合併的錨點）把自己的網格切成格子，表面經過的格子各一個外框
// （縮到表面在那一格裡實際佔的範圍、沿 x 相鄰又差不多大的併起來），所以外框貼著表面，不是整台一個大方塊。
// 格子的邊長：小的錨點＝最長邊的 1/GRID_N（不小於 CELL_MIN），大的（機身、船體）約 CELL_BIG、每個軸最多 GRID_MAX 格；
// 大的三角形（比半格大）在面上取樣，斜的薄板（機翼、腳）不會把整個外接方塊都算進去。
// rig.hb 的格式和人形機甲的相同（part＝−1），hitRay／nearestSurface 共用；rig.hbGen＝true、rig.hbR＝蓋住全部外框的半徑
const GEN_CACHE = new Map();
const GRID_N = 6,
  GRID_MAX = 14,
  CELL_MIN = 0.6, // 格子最小的邊長（公尺）
  CELL_BIG = 1.2, // 大的錨點的格子（公尺）
  TRI_MAX = 40000;
const hitMesh = (c) => {
  const mt = c.material;
  return (
    c.isMesh &&
    c.geometry &&
    mt &&
    !Array.isArray(mt) &&
    !isOutline(mt) &&
    mt.blending !== THREE.AdditiveBlending &&
    // 護盾罩、光束、雷射柵欄這類特效（半透明而且不寫深度、很淡、或不受光的）不算機體
    !(mt.transparent && (mt.depthWrite === false || mt.opacity < 0.5 || mt.isMeshBasicMaterial))
  );
};
function anchorBoxes(node, aset) {
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
  const meshes = [];
  const walk = (o) => {
    for (const c of o.children) {
      if (aset.has(c) || !c.visible) continue;
      const u = c.userData || {};
      if (u.conn || u.helper || u.xray) continue;
      if (hitMesh(c)) meshes.push(c);
      walk(c);
    }
  };
  if (hitMesh(node)) meshes.push(node);
  walk(node);
  if (!meshes.length) return [];
  const rel = meshes.map((c) => new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld));
  const key = meshes
    .map((c, k) => c.geometry.uuid + ':' + rel[k].elements.map((x) => x.toFixed(3)).join(','))
    .join('|');
  const hit = GEN_CACHE.get(key);
  if (hit) return hit;
  // 每個網格的頂點換到錨點座標
  const P = [];
  const U = new THREE.Box3();
  meshes.forEach((c, k) => {
    if (c.isInstancedMesh) {
      c.computeBoundingBox();
      const b = new THREE.Box3().copy(c.boundingBox).applyMatrix4(rel[k]);
      U.union(b);
      P.push({ box: b });
      return;
    }
    const pa = c.geometry.attributes.position;
    if (!pa || !pa.count) return;
    const a = new Float32Array(pa.count * 3);
    for (let i = 0; i < pa.count; i++) {
      _v.fromBufferAttribute(pa, i).applyMatrix4(rel[k]);
      a[i * 3] = _v.x;
      a[i * 3 + 1] = _v.y;
      a[i * 3 + 2] = _v.z;
      U.expandByPoint(_v);
    }
    P.push({ a, ix: c.geometry.index ? c.geometry.index.array : null, n: pa.count });
  });
  if (U.isEmpty()) return [];
  const sz = U.getSize(new THREE.Vector3());
  const wsc = scaleOf(node.matrixWorld.elements),
    big = Math.max(sz.x, sz.y, sz.z);
  const cell = Math.max(CELL_MIN / wsc, Math.min(big / GRID_N, Math.max(CELL_BIG / wsc, big / GRID_MAX)));
  const nx = Math.min(GRID_MAX, Math.max(1, Math.ceil(sz.x / cell))),
    ny = Math.min(GRID_MAX, Math.max(1, Math.ceil(sz.y / cell))),
    nz = Math.min(GRID_MAX, Math.max(1, Math.ceil(sz.z / cell)));
  const N = [nx, ny, nz],
    o0 = [U.min.x, U.min.y, U.min.z],
    cs = [sz.x / nx || 1, sz.y / ny || 1, sz.z / nz || 1];
  const cells = new Array(nx * ny * nz).fill(null);
  const lo = [0, 0, 0],
    hi = [0, 0, 0],
    i0 = [0, 0, 0],
    i1 = [0, 0, 0];
  // 一個軸對齊的範圍（三角形的外框）：經過的格子各自記下它在格子裡佔的範圍
  const mark = () => {
    for (let k = 0; k < 3; k++) {
      i0[k] = Math.min(N[k] - 1, Math.max(0, Math.floor((lo[k] - o0[k]) / cs[k])));
      i1[k] = Math.min(N[k] - 1, Math.max(0, Math.floor((hi[k] - o0[k]) / cs[k])));
    }
    for (let x = i0[0]; x <= i1[0]; x++)
      for (let y = i0[1]; y <= i1[1]; y++)
        for (let z = i0[2]; z <= i1[2]; z++) {
          const id = (x * ny + y) * nz + z;
          let c = cells[id];
          if (!c) c = cells[id] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
          const g = [x, y, z];
          for (let k = 0; k < 3; k++) {
            const a = o0[k] + g[k] * cs[k];
            c[k] = Math.min(c[k], Math.max(lo[k], a));
            c[k + 3] = Math.max(c[k + 3], Math.min(hi[k], a + cs[k]));
          }
        }
  };
  for (const m of P) {
    if (m.box) {
      m.box.min.toArray(lo);
      m.box.max.toArray(hi);
      mark();
      continue;
    }
    const tris = (m.ix ? m.ix.length : m.n) / 3,
      step = Math.max(1, Math.ceil(tris / TRI_MAX));
    const half = Math.min(cs[0], cs[1], cs[2]) * 0.5;
    const A = m.a;
    for (let t = 0; t < tris; t += step) {
      const ia = (m.ix ? m.ix[t * 3] : t * 3) * 3,
        ib = (m.ix ? m.ix[t * 3 + 1] : t * 3 + 1) * 3,
        ic = (m.ix ? m.ix[t * 3 + 2] : t * 3 + 2) * 3;
      let edge = 0;
      for (let k = 0; k < 3; k++) {
        const a = A[ia + k],
          b = A[ib + k],
          c = A[ic + k];
        lo[k] = Math.min(a, b, c);
        hi[k] = Math.max(a, b, c);
        edge = Math.max(edge, hi[k] - lo[k]);
      }
      const n = Math.min(24, Math.ceil(edge / half));
      if (n <= 1) {
        mark();
        continue;
      }
      // 大的三角形：在面上取樣（間隔不超過半格），每個取樣點記到它所在的格子
      for (let u = 0; u <= n; u++)
        for (let w = 0; w <= n - u; w++) {
          const fu = u / n,
            fw = w / n;
          for (let k = 0; k < 3; k++)
            lo[k] = hi[k] = A[ia + k] + (A[ib + k] - A[ia + k]) * fu + (A[ic + k] - A[ia + k]) * fw;
          mark();
        }
    }
  }
  // 沿 x 相鄰、y／z 的範圍差不多的併成一個
  const tol = 0.25;
  const out = [];
  for (let y = 0; y < ny; y++)
    for (let z = 0; z < nz; z++) {
      let run = null;
      for (let x = 0; x < nx; x++) {
        const c = cells[(x * ny + y) * nz + z];
        if (!c) {
          run = null;
          continue;
        }
        if (
          run &&
          Math.abs(run[1] - c[1]) < tol * cs[1] &&
          Math.abs(run[4] - c[4]) < tol * cs[1] &&
          Math.abs(run[2] - c[2]) < tol * cs[2] &&
          Math.abs(run[5] - c[5]) < tol * cs[2]
        ) {
          run[3] = c[3];
          run[1] = Math.min(run[1], c[1]);
          run[2] = Math.min(run[2], c[2]);
          run[4] = Math.max(run[4], c[4]);
          run[5] = Math.max(run[5], c[5]);
        } else out.push((run = c.slice()));
      }
    }
  const res = out.map((c) => ({
    min: new THREE.Vector3(c[0], c[1], c[2]),
    max: new THREE.Vector3(c[3], c[4], c[5]),
  }));
  if (GEN_CACHE.size > 1500) GEN_CACHE.clear();
  GEN_CACHE.set(key, res);
  return res;
}
// moving＝會動的節點（網格合併的錨點：render/mesh-merge.js 的 rigRefs、foe-merge.js 的 moving）；要在合併網格之前量
export function measureBodyBoxes(rig, moving) {
  if (!rig || !rig.group || rig.hb) return;
  const root = rig.group;
  root.updateMatrixWorld(true);
  const anchors = [root];
  if (moving)
    for (const o of moving) if (o && o.isObject3D && o !== root && isUnder(o, root)) anchors.push(o);
  const aset = new Set(anchors);
  const hb = [];
  let r2 = 0;
  _a.setFromMatrixPosition(root.matrixWorld);
  _a.y += (rig.height || 0) * 0.5; // 實體的 center()
  for (const node of anchors)
    for (const b of anchorBoxes(node, aset)) {
      hb.push({ node, slot: '', part: -1, min: b.min, max: b.max, ok: true });
      for (let i = 0; i < 8; i++) {
        _v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
        r2 = Math.max(r2, _v.applyMatrix4(node.matrixWorld).distanceToSquared(_a));
      }
    }
  if (!hb.length) return;
  rig.hb = hb;
  rig.hbGen = true;
  rig.hbR = Math.sqrt(r2);
}

// 外框表面上離 src 最近的點 outP 與朝 src 的方向 outN（全部的外框裡找）：回傳外框的索引，沒有＝−1。
// src 在外框裡時 outN＝0（呼叫端自己決定方向）
export function nearestSurface(rig, src, outP, outN) {
  const L = rig && rig.hb;
  if (!L) return -1;
  let best = -1,
    bd = Infinity,
    ln = null,
    lok = false,
    sc = 1;
  for (let i = 0; i < L.length; i++) {
    const h = L[i];
    if (!h.ok) continue;
    if (h.node !== ln) {
      ln = h.node;
      lok = ln.visible && isUnder(ln, rig.group);
      if (lok) {
        _m.copy(ln.matrixWorld).invert();
        _a.copy(src).applyMatrix4(_m);
        sc = scaleOf(ln.matrixWorld.elements);
      }
    }
    if (!lok) continue;
    const d = _ps.copy(_a).clamp(h.min, h.max).distanceToSquared(_a) * sc * sc;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  if (best >= 0) pieceSurface(rig, best, src, outP, outN);
  return best;
}

// 離 p 最近的區塊（爆炸、近戰、沒打中外框時）：比外框中心的距離
export function nearestPiece(rig, p) {
  const L = rig && rig.hb;
  if (!L) return -1;
  let best = -1,
    bd = Infinity;
  for (let i = 0; i < L.length; i++) {
    const h = L[i];
    if (!h.ok || !h.node.visible || !isUnder(h.node, rig.group)) continue;
    _v.copy(h.min).add(h.max).multiplyScalar(0.5).applyMatrix4(h.node.matrixWorld);
    const d = _v.distanceToSquared(p);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// 部位的世界座標（瞄準用）：手臂取前臂、腳取小腿（四足取前腳），其他取那一塊的外框中心；沒有時回傳 false
const REP = {
  [HP.armR]: /r_fore$/,
  [HP.armL]: /l_fore$/,
  [HP.legR]: /(^|\/)(r|fr)_shin$/,
  [HP.legL]: /(^|\/)(l|fl)_shin$/,
};
export function partPoint(rig, part, out) {
  const L = rig && rig.hb;
  if (!L) return false;
  const c = rig.hbRep || (rig.hbRep = {});
  let i = c[part];
  if (i === undefined) {
    i = -1;
    const re = REP[part];
    for (let k = 0; k < L.length; k++)
      if (L[k].ok && L[k].part === part && (i < 0 || (re && re.test(L[k].slot)))) i = k;
    c[part] = i;
  }
  if (i < 0) return false;
  const h = L[i];
  if (!h.node.visible || !isUnder(h.node, rig.group)) return false;
  out.copy(h.min).add(h.max).multiplyScalar(0.5).applyMatrix4(h.node.matrixWorld);
  return true;
}

// ---------- 部位閃紅 ----------
const FLASH_T = 0.16,
  FLASH_A = 0.85;
// 每台一份（骨頭的編號是每台自己的）；著色器的程式共用（customProgramCacheKey 相同）
function redMat() {
  const m = new THREE.MeshBasicMaterial({
    color: 0xff2a14,
    transparent: true,
    opacity: FLASH_A,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    fog: false,
    toneMapped: false,
    // 不改目標的 alpha（渲染風格的後處理用 alpha 分辨材質分類）
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
  });
  const uB = { value: new THREE.Vector4(-9, -9, -9, -9) };
  m.userData.uB = uB;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uB = uB;
    sh.vertexShader =
      'uniform vec4 uB;\nvarying float vHp;\n' +
      sh.vertexShader.replace(
        '#include <skinning_vertex>',
        `#include <skinning_vertex>
#ifdef USE_SKINNING
  float hpB = skinIndex.x;
  vHp = (abs(hpB - uB.x) < 0.5 || abs(hpB - uB.y) < 0.5 || abs(hpB - uB.z) < 0.5 || abs(hpB - uB.w) < 0.5) ? 1.0 : 0.0;
#else
  vHp = 1.0;
#endif`,
      );
    sh.fragmentShader =
      'varying float vHp;\n' +
      sh.fragmentShader.replace('void main() {', 'void main() {\n  if (vHp < 0.5) discard;');
  };
  m.customProgramCacheKey = () => 'mc-hitpart';
  return m;
}
const flagOv = (x) => {
  x.userData.xray = true; // 透視輪廓、冰殼、殘影都略過
  x.userData.helper = true;
  x.renderOrder = 21;
  x.castShadow = x.receiveShadow = false;
  x.raycast = () => {};
  x.visible = false;
};
// 著色器預熱（Game.shaderWarm）：一般與蒙皮各一個
export function partFlashWarm() {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  g.add(new THREE.Mesh(geo, redMat()));
  const sg = geo.clone();
  const n = sg.attributes.position.count;
  sg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
  sg.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).fill(0.25), 4));
  const b = new THREE.Bone();
  const sm = new THREE.SkinnedMesh(sg, redMat());
  sm.add(b);
  sm.bind(new THREE.Skeleton([b]));
  g.add(sm);
  return g;
}
function buildFlash(m) {
  const old = m.pfx;
  if (old) for (const o of old.ov) if (o.x.parent) o.x.parent.remove(o.x);
  const root = m.group;
  const nodes = m.hb.map((h) => h.node);
  const pieceOf = (o) => {
    for (let p = o; p && p !== root; p = p.parent) {
      const i = nodes.indexOf(p);
      if (i >= 0) return i;
    }
    return -1;
  };
  const F = { mat: old ? old.mat : redMat(), ov: [], bones: new Map() };
  const list = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.geometry || o.userData.xray || o.userData.helper) return;
    const mt = o.material;
    if (!mt || Array.isArray(mt) || mt.transparent || isOutline(mt) || mt.blending === THREE.AdditiveBlending)
      return;
    list.push(o);
  });
  let sk = null;
  for (const o of list) {
    let x;
    if (o.isSkinnedMesh) {
      x = new THREE.SkinnedMesh(o.geometry, F.mat);
      x.bind(o.skeleton, o.bindMatrix);
      sk = o.skeleton;
    } else x = new THREE.Mesh(o.geometry, F.mat);
    flagOv(x);
    o.add(x);
    F.ov.push({ x, pi: o.isSkinnedMesh ? -2 : pieceOf(o) });
  }
  if (sk)
    sk.bones.forEach((b, bi) => {
      const pi = pieceOf(b);
      if (pi < 0) return;
      let a = F.bones.get(pi);
      if (!a) F.bones.set(pi, (a = []));
      a.push(bi);
    });
  m.pfx = F;
  return F;
}
// 被打中的區塊閃紅（i＝rig.hb 的索引）；整台閃白在 2026-11-21 拿掉，改成命中點的火花與碎片（MechEntity.hitSparks）
export function partFlash(m, i) {
  if (!m || !m.hb || m.hbGen || !(i >= 0) || i >= m.hb.length) return; // 體素化的外框（載具、Boss…）沒有閃紅
  let F = m.pfx;
  if (!F || F.ov.some((o) => !isUnder(o.x, m.group))) F = buildFlash(m); // 合併改過（丟武器、碎裂）就重掛
  const b = F.bones.get(i) || [];
  F.mat.userData.uB.value.set(b[0] ?? -9, b[1] ?? -9, b[2] ?? -9, b[3] ?? -9);
  for (const o of F.ov) o.x.visible = o.pi === -2 ? b.length > 0 : o.pi === i;
  F.mat.opacity = FLASH_A;
  m.pfT = FLASH_T;
}
// animateMech 每格
export function partFlashTick(m, dt) {
  m.pfT -= dt;
  const F = m.pfx;
  if (!F) return;
  if (m.pfT <= 0) {
    m.pfT = 0;
    for (const o of F.ov) o.x.visible = false;
  } else F.mat.opacity = FLASH_A * Math.min(1, (m.pfT / FLASH_T) * 1.8);
}

// 冒煙測試與量測
if (typeof location !== 'undefined' && /[?&]test\b/.test(location.search))
  window.__HITP = {
    hitRay,
    nearestPiece,
    nearestSurface,
    partPoint,
    partFlash,
    measureHitBoxes,
    measureBodyBoxes,
    BOX_CACHE,
  };
