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
  for (let i = 0; i < L.length; i++) {
    const h = L[i];
    if (!h.ok || !h.node.visible || !isUnder(h.node, root)) continue; // 丟出去的武器
    const e = h.node.matrixWorld.elements;
    _m.copy(h.node.matrixWorld).invert();
    _a.copy(a).applyMatrix4(_m);
    _d.copy(a).add(v).applyMatrix4(_m).sub(_a);
    const p = pad / scaleOf(e);
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
  if (!m || !m.hb || !(i >= 0) || i >= m.hb.length) return;
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
  window.__HITP = { hitRay, nearestPiece, partPoint, partFlash, measureHitBoxes, BOX_CACHE };
