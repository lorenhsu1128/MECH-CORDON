// 過場新建的 3D 場景（委託方的室內、地點）共用的建模工具（docs/cine-redesign-design.md 第十節；使用者要求建模要很精細）。
// 用法：const B = new SceneKit(); B.box(...)、B.cyl(...)…；會動的東西加到 B.dyn；最後 B.done() 把靜態的部分依材質合併並
// 烘焙頂點色（遮蔽、凸邊磨亮、貼地髒污：world/prop-models.js 的 bakeGroup），回傳整個場景的群組。
// 座標一律公尺；材質用 B.mat(顏色, 粗糙度, 金屬感, 其他) 建立並快取。
import { D } from './detail.js';
import { bakeGroup } from '../world/prop-models.js';

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
// canvas 貼圖
export function canvasTex(w, h, draw, rep) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (rep) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
  }
  return t;
}
// 雜訊（髒污、布紋用）
export function noiseFill(c, w, h, seed, n, col, a0, a1, s0, s1) {
  const R = rng(seed);
  for (let i = 0; i < n; i++) {
    c.fillStyle = col;
    c.globalAlpha = a0 + R() * (a1 - a0);
    const s = s0 + R() * (s1 - s0);
    c.fillRect(R() * w, R() * h, s, s);
  }
  c.globalAlpha = 1;
}

const _e = new THREE.Euler();
export class SceneKit {
  constructor(name) {
    this.root = new THREE.Group();
    this.root.name = name || 'cineScene';
    this.st = new THREE.Group(); // 靜態：最後合併烘焙
    this.dyn = new THREE.Group(); // 會動的、透明的、發光的：不合併
    this.shell = new THREE.Group(); // 房間的殼（地板、牆、天花板）：合併烘焙、不投射陰影（否則主光整個被擋掉）
    this.root.add(this.st, this.dyn, this.shell);
    this.mats = new Map();
  }
  // 標準材質（快取：同參數同一個材質）
  mat(color, rough = 0.6, metal = 0.1, o = {}) {
    const k = [color, rough, metal, o.map ? o.map.uuid : '', o.emissive || '', o.key || ''].join('|');
    let m = this.mats.get(k);
    if (!m) {
      const { key, ...rest } = o;
      void key;
      m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...rest });
      this.mats.set(k, m);
    }
    return m;
  }
  glow(color, k = 1) {
    return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
  }
  // 加一個網格：p＝[x, y, z]、r＝[rx, ry, rz]（弧度）、s＝縮放；parent 預設靜態
  mesh(geo, mat, p = [0, 0, 0], r = [0, 0, 0], s = 1, parent = this.st) {
    const m = new THREE.Mesh(geo, mat);
    p = p || [0, 0, 0];
    r = r || [0, 0, 0];
    m.position.set(p[0], p[1], p[2]);
    m.rotation.copy(_e.set(r[0], r[1], r[2]));
    if (s != null && s !== 1) Array.isArray(s) ? m.scale.set(s[0], s[1], s[2]) : m.scale.setScalar(s);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  // 倒角方塊（c＝倒角）；p 是中心
  box(w, h, d, mat, p, r, c = 0.015, parent) {
    return this.mesh(D.box(w, h, d, Math.min(c, w * 0.3, h * 0.3, d * 0.3)), mat, p, r, 1, parent);
  }
  // 圓柱（c＝邊緣倒角）
  cyl(rt, rb, h, mat, p, r, seg = 20, c = 0, parent) {
    return this.mesh(
      c ? D.cyl(rt, rb, h, seg, c) : new THREE.CylinderGeometry(rt, rb, h, seg),
      mat,
      p,
      r,
      1,
      parent,
    );
  }
  sph(rad, mat, p, s = 1, parent, seg = 16) {
    return this.mesh(new THREE.SphereGeometry(rad, seg, seg >> 1), mat, p, [0, 0, 0], s, parent);
  }
  // 旋轉剖面：prof＝[[半徑, 高度]…]
  lathe(prof, mat, p, r, seg = 24, parent) {
    return this.mesh(D.lathe(prof, seg), mat, p, r, 1, parent);
  }
  // 兩點之間的圓柱（管線、桿子）
  rod(a, b, rad, mat, parent = this.st, seg = 10) {
    const A = new THREE.Vector3(...a),
      Bv = new THREE.Vector3(...b);
    const len = A.distanceTo(Bv);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, seg), mat);
    m.position.copy(A).add(Bv).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize());
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  // 下垂的纜線
  cable(a, b, rad, sag, mat, parent = this.st) {
    const m = new THREE.Mesh(D.cable(a, b, rad, sag, 10), mat); // a、b 是 [x, y, z] 陣列
    m.castShadow = false;
    parent.add(m);
    return m;
  }
  // 平面（貼圖用）：面朝 +Z，r 轉向
  plane(w, h, mat, p, r, parent = this.st) {
    const m = this.mesh(new THREE.PlaneGeometry(w, h), mat, p, r, 1, parent);
    m.castShadow = false;
    return m;
  }
  // 子群組（一組道具一起擺）：fn(g) 裡用 parent＝g
  group(p, r, fn, parent = this.st) {
    const g = new THREE.Group();
    g.position.set(p[0], p[1], p[2]);
    g.rotation.set(r ? r[0] : 0, r ? r[1] : 0, r ? r[2] : 0);
    parent.add(g);
    fn(g);
    return g;
  }
  // 靜態的部分與房間的殼各自合併＋烘焙頂點色（殼不投射陰影）
  done(o = {}) {
    bakeGroup(this.st, o.tint);
    if (this.shell.children.length) {
      bakeGroup(this.shell, o.tint);
      this.shell.traverse((m) => m.isMesh && (m.castShadow = false));
    }
    return this.root;
  }
}

// 舊的場景（沒有用 SceneKit 建的辦公室、研究所）補上合併烘焙：root 底下不透明的標準材質網格，
// 依「投不投射陰影」分成兩組（房間的殼不投射）合併烘焙（遮蔽、凸邊、髒污的頂點色，和 SceneKit 的 done 相同）；
// skip 裡的物件與它們底下的網格（會動的）不動，透明、發光（MeshBasic）的也不動。
export function bakeStatic(root, skip = []) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const no = new Set(skip.filter(Boolean));
  const groups = { cast: new THREE.Group(), flat: new THREE.Group() };
  const rm = [];
  const walk = (o) => {
    if (no.has(o)) return;
    if (o.isMesh) {
      const m = o.material;
      if (
        !o.isInstancedMesh &&
        !o.isSkinnedMesh &&
        m &&
        !Array.isArray(m) &&
        m.isMeshStandardMaterial &&
        !m.transparent &&
        !m.map
      ) {
        const c = new THREE.Mesh(o.geometry, m);
        new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld).decompose(c.position, c.quaternion, c.scale);
        (o.castShadow ? groups.cast : groups.flat).add(c);
        rm.push(o);
      }
    }
    for (const k of o.children.slice()) walk(k);
  };
  walk(root);
  for (const o of rm) o.parent.remove(o);
  for (const [k, g] of Object.entries(groups)) {
    if (!g.children.length) continue;
    root.add(g);
    bakeGroup(g);
    g.traverse((m) => {
      if (!m.isMesh) return;
      m.castShadow = k === 'cast';
      m.receiveShadow = true;
    });
  }
  return root;
}
