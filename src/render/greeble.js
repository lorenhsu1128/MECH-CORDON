// 程式模型的表面細節（docs/model-detail.md 第二輪第 5 期）：Boss、部位、專屬敵人這類以 P（零件清單）拼成的模型，
// 在 bakeAll 合併之前掃過每個零件，對大的方塊面加面板的分割線（內縮的框）與四角的螺栓、對大的圓柱加兩道補強環與螺栓圈。
// 純函式、不呼叫亂數（同樣的模型每次加的一樣）；加的零件標成小細節（fine），掛在原本零件所在的節點上（跟著動作）。
// 選面：依面積由大到小，最多 maxFaces 個，並以三角形預算（o.maxTris＝整個模型的上限）限制；朝下的面不加。
import { gBox, gCyl } from './geometry.js';
import { upgradeGeo } from './detail.js';

const FACE_TRIS = 150,
  CYL_TRIS = 330;
const lum = (m) => m.color.r * 0.3 + m.color.g * 0.59 + m.color.b * 0.11;
const _p = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _s = new THREE.Vector3(),
  _n = new THREE.Vector3(),
  _m = new THREE.Matrix4(),
  _b = new THREE.Box3();

const okMat = (m) =>
  m &&
  m.isMeshStandardMaterial &&
  (!m.transparent || m.opacity >= 1) && // 可以淡出的材質（遮擋時才變透明）也算
  m.depthWrite !== false &&
  m.blending === THREE.NormalBlending &&
  !(m.emissive && m.emissive.r + m.emissive.g + m.emissive.b > 0.05);

// 估計烘焙後的三角形數（基本形體升級之後）
function triOf(geo, mm, k) {
  const [g] = upgradeGeo(geo, mm.clone(), k, false);
  const n = g.index ? g.index.count : g.attributes.position.count;
  return n / 3;
}

export function greeble(root, o = {}) {
  const k = o.k || 1;
  root.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  // 模型的大小與目前的三角形數
  const box = new THREE.Box3();
  let tris = 0;
  const cand = [];
  root.traverse((node) => {
    const prims = node.userData && node.userData.prims;
    if (!prims) return;
    const toRoot = new THREE.Matrix4().multiplyMatrices(rootInv, node.matrixWorld);
    for (const pr of prims) {
      if (!pr.geo) continue;
      tris += triOf(pr.geo, pr.mm, k);
      if (!pr.geo.boundingBox) pr.geo.computeBoundingBox();
      _m.multiplyMatrices(toRoot, pr.mm);
      box.union(_b.copy(pr.geo.boundingBox).applyMatrix4(_m));
      if (pr.fine || !okMat(pr.m) || !pr.geo.parameters) continue;
      const t = pr.geo.type;
      if (t !== 'BoxGeometry' && t !== 'CylinderGeometry') continue;
      cand.push({ node, pr, toRoot });
    }
  });
  run(cand, box, tris, o, (c, geo, m, mm) => c.node.userData.prims.push({ geo, m, mm, fine: true }));
}
function run(cand, box, tris, o, emit) {
  const maxFaces = o.maxFaces || 40;
  if (box.isEmpty() || !cand.length) return;
  // 分割線與螺栓借用模型自己的材質（最深色的、金屬感最高的）：不新增材質，合併之後不多繪製次數
  let SEAM = cand[0].pr.m,
    BOLT = cand[0].pr.m;
  for (const c of cand) {
    if (lum(c.pr.m) < lum(SEAM)) SEAM = c.pr.m;
    if (c.pr.m.metalness > BOLT.metalness || (c.pr.m.metalness === BOLT.metalness && lum(c.pr.m) > lum(BOLT)))
      BOLT = c.pr.m;
  }
  const size = box.getSize(new THREE.Vector3());
  const L = Math.max(size.x, size.y, size.z);
  const minSide = L * (o.minK || 0.1);
  // 候選的面
  const faces = [];
  for (const c of cand) {
    const P = c.pr.geo.parameters;
    c.pr.mm.decompose(_p, _q, _s);
    if (c.pr.geo.type === 'BoxGeometry') {
      const d = [P.width * Math.abs(_s.x), P.height * Math.abs(_s.y), P.depth * Math.abs(_s.z)];
      for (let a = 0; a < 3; a++) {
        const u = d[(a + 1) % 3],
          v = d[(a + 2) % 3];
        if (Math.min(u, v) < minSide || d[a] < minSide * 0.08) continue;
        for (const sg of [-1, 1]) {
          // 面的法線（模型座標）：朝下的不加
          _n.set(0, 0, 0).setComponent(a, sg).applyQuaternion(_q);
          _n.transformDirection(new THREE.Matrix4().extractRotation(c.toRoot));
          if (_n.y < -0.6) continue;
          faces.push({ c, a, sg, d, u, v, area: u * v, pos: _p.clone(), quat: _q.clone() });
        }
      }
    } else {
      const r = Math.max(P.radiusTop, P.radiusBottom) * Math.max(Math.abs(_s.x), Math.abs(_s.z)),
        h = P.height * Math.abs(_s.y);
      if (P.openEnded || Math.abs(P.thetaLength - Math.PI * 2) > 1e-4) continue;
      if (r < minSide * 0.5 || h < minSide * 0.6) continue;
      const mx = Math.max(P.radiusTop, P.radiusBottom);
      faces.push({
        c,
        cyl: true,
        r,
        h,
        rt: P.radiusTop / mx,
        rb: P.radiusBottom / mx,
        area: r * h * 3,
        pos: _p.clone(),
        quat: _q.clone(),
      });
    }
  }
  faces.sort((x, y) => y.area - x.area);
  let budget = o.maxTris ? Math.max(0, o.maxTris - tris) : Infinity;
  let n = 0;
  for (const f of faces) {
    if (n >= maxFaces) break;
    const cost = f.cyl ? CYL_TRIS : FACE_TRIS;
    if (cost > budget) break;
    budget -= cost;
    n++;
    const base = new THREE.Matrix4().compose(f.pos, f.quat, new THREE.Vector3(1, 1, 1));
    const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0) =>
      emit(
        f.c,
        geo,
        m,
        new THREE.Matrix4()
          .compose(
            new THREE.Vector3(x, y, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
            _s.set(1, 1, 1),
          )
          .premultiply(base),
      );
    if (f.cyl) {
      // 兩道補強環＋頂面的螺栓圈（半徑依高度在頂、底半徑之間內插）
      const R = (t) => f.r * (f.rt * (0.5 + t) + f.rb * (0.5 - t)); // t＝沿高度的位置（-0.5～0.5）
      for (const t of [-0.25, 0.25])
        add(gCyl(R(t) * 1.03, R(t) * 1.03, Math.max(0.02, f.h * 0.04), 16), SEAM, 0, t * f.h, 0);
      const br = Math.max(0.012, f.r * 0.05);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        add(
          gCyl(br, br, br * 1.2, 6),
          BOLT,
          Math.cos(a) * R(0.5) * 0.82,
          f.h / 2 + br * 0.4,
          Math.sin(a) * R(0.5) * 0.82,
        );
      }
      continue;
    }
    // 方塊的一面：軸 a 的 sg 側。面內的兩軸 ua＝(a+1)%3、va＝(a+2)%3
    const { a, sg, d, u, v } = f;
    const ua = (a + 1) % 3,
      va = (a + 2) % 3;
    const t = Math.max(0.01, Math.min(u, v) * 0.018),
      off = d[a] / 2 + t * 0.4;
    const P3 = (cu, cv, ca) => {
      const r = [0, 0, 0];
      r[ua] = cu;
      r[va] = cv;
      r[a] = ca;
      return r;
    };
    const S3 = (su, sv, sa) => {
      const r = [0, 0, 0];
      r[ua] = su;
      r[va] = sv;
      r[a] = sa;
      return r;
    };
    const iu = u * 0.38,
      iv = v * 0.38;
    // 內縮的框（四條細條）
    for (const s of [-1, 1]) {
      const [x, y, z] = P3(s * iu, 0, sg * off),
        [w, h, dd] = S3(t, iv * 2, t);
      add(gBox(w, h, dd), SEAM, x, y, z);
      const [x2, y2, z2] = P3(0, s * iv, sg * off),
        [w2, h2, d2] = S3(iu * 2, t, t);
      add(gBox(w2, h2, d2), SEAM, x2, y2, z2);
    }
    // 四角的螺栓（軸沿面的法線）
    const br = Math.max(0.01, Math.min(u, v) * 0.03);
    const rot = a === 0 ? [0, 0, Math.PI / 2] : a === 2 ? [Math.PI / 2, 0, 0] : [0, 0, 0];
    for (const su of [-1, 1])
      for (const sv of [-1, 1]) {
        const [x, y, z] = P3(su * u * 0.45, sv * v * 0.45, sg * (d[a] / 2 + br * 0.4));
        add(gCyl(br, br, br * 1.2, 6), BOLT, x, y, z, ...rot);
      }
  }
}
