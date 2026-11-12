// 方舟的變體「艦內維修機庫」（docs/ark-redesign.md）：四面有牆、不蓋頂的巨大機庫——沿兩條長邊的維修架
// （格架塔、橫樑、維修平台、管線，部分架上站著裝飾用的機甲）、地上的標線、牆頂橫跨的天車軌道、一面牆上的巨大閘門。
// 牆、控制台、上層走道、坡道由 ark-hull.js 依版面建；這裡只加維修架與裝飾。純外觀的部分用自己的亂數串。
import { makeRng } from '../../core/math.js';
import { MB, MS } from '../../core/scale.js';
import { START_ASM } from '../../data/parts.js';
import { animateMech, buildMech } from '../../render/mech-model.js';
import { PALETTES } from '../../render/materials.js';
import { PK, mat } from './kit.js';
import { GM, HULL, HULL_D } from './ark-hull.js';

// 裝飾機甲的模型來源（Game 設定：和電腦的 AC 一樣用伺服器預設組或內建的預設機甲；沒設定時是程式模型）
let MECH_SRC = null;
export function setArkMechSource(fn) {
  MECH_SRC = fn;
}
const POSE = { pose: 'garage', moving: false, grounded: true, hover: false, boost: false, aimPitch: 0 };
const ASMS = [
  { ...START_ASM, head: 'h_hv', core: 'c_hv', arms: 'a_hv', legs: 'l_hv', rback: 'bw_gr', lback: null },
  { ...START_ASM, head: 'h_lt', core: 'c_lt', arms: 'a_lt', legs: 'l_bp2', rarm: 'w_mg', larm: 'w_blade' },
  { ...START_ASM },
  { ...START_ASM, head: 'h_scan', core: 'c_nat', arms: 'a_ml', legs: 'l_rj' },
];
const PALS = ['white', 'gravel', 'nightfall', 'white'];
const DECO_MAX = 5; // 裝飾機甲最多幾台（每台幾十個網格，合併後約十個）

// 依材質合併（保留頂點色）：裝飾機甲建好擺好姿勢後，整台合成少數幾個網格
function mergeKeep(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const by = new Map();
  const drop = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || Array.isArray(o.material) || !o.visible) return;
    const g = o.geometry;
    if (!g || !g.attributes.position || g.morphAttributes.position) return;
    const k = o.material.uuid + (g.attributes.color ? 'c' : '') + (g.attributes.uv ? 'u' : '');
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(o);
  });
  const mm = new THREE.Matrix4();
  for (const list of by.values()) {
    if (list.length < 2) continue;
    const parts = [];
    for (const o of list) {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const a of Object.keys(g.attributes))
        if (!['position', 'normal', 'uv', 'color'].includes(a)) g.deleteAttribute(a);
      mm.multiplyMatrices(inv, o.matrixWorld);
      g.applyMatrix4(mm);
      if (!g.attributes.normal) g.computeVertexNormals();
      parts.push(g);
      drop.push(o);
    }
    const n = parts.reduce((a, g) => a + g.attributes.position.count, 0);
    const out = new THREE.BufferGeometry();
    for (const [a, sz] of [
      ['position', 3],
      ['normal', 3],
      ['uv', 2],
      ['color', parts[0].attributes.color ? parts[0].attributes.color.itemSize : 3],
    ]) {
      if (!parts.every((g) => g.attributes[a])) continue;
      const arr = new Float32Array(n * sz);
      let off = 0;
      for (const g of parts) {
        const src = g.attributes[a];
        for (let i = 0; i < src.count; i++)
          for (let c = 0; c < sz; c++) arr[off++] = src.array[i * src.itemSize + c];
      }
      out.setAttribute(a, new THREE.BufferAttribute(arr, sz));
    }
    for (const g of parts) g.dispose();
    out.computeBoundingSphere();
    const m = new THREE.Mesh(out, list[0].material);
    m.castShadow = list.some((o) => o.castShadow);
    m.receiveShadow = true;
    m.renderOrder = list[0].renderOrder;
    root.add(m);
  }
  for (const o of drop) if (o.parent) o.parent.remove(o);
}

function decoMech(r, x, z, ry) {
  const i = Math.floor(r() * ASMS.length);
  let m = null;
  try {
    m = buildMech(ASMS[i], PALETTES[PALS[i]] || PALETTES.white, MS / MB, {
      source: MECH_SRC ? MECH_SRC() : null,
    });
  } catch {
    return null;
  }
  for (let k = 0; k < 40; k++) animateMech(m, 1 / 60, { ...POSE, t: k / 60 });
  m.group.position.set(x, 1.2, z);
  m.group.rotation.y = ry;
  mergeKeep(m.group);
  return m.group;
}

export function buildHangar(w) {
  const P = w.arkP,
    Hg = P.hangar;
  if (!Hg) return;
  const r = makeRng(w.seed * 53 + 17);
  const Hw = Hg.Hw,
    top = Hg.top;
  const k = new PK(false);
  const L = GM.light(),
    Md = GM.mid(),
    Dk = GM.dark(),
    lamp = GM.lamp(),
    stripe = GM.stripe(),
    red = GM.red();
  // 維修架：格架塔（每格的兩側共用）、兩層維修平台、頂上的橫樑、維修台、管線、地上的標線
  const towers = new Set();
  const tower = (x, z) => {
    const key = Math.round(x / 4) + ',' + Math.round(z / 4);
    if (towers.has(key)) return;
    towers.add(key);
    const H = 34;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) k.box(Md, 0.7, H, 0.7, x + sx * 2.6, H / 2, z + sz * 2.6);
    for (let y = 4; y < H; y += 6) {
      k.box(L, 6, 0.5, 0.5, x, y, z - 2.6);
      k.box(L, 6, 0.5, 0.5, x, y, z + 2.6);
      k.box(L, 0.5, 0.5, 6, x - 2.6, y, z);
      k.box(L, 0.5, 0.5, 6, x + 2.6, y, z);
    }
    k.box(red, 0.5, 0.5, 0.5, x, H + 0.4, z);
    w.obstacles.push({
      kind: 'box',
      x,
      z,
      w: 6.2,
      d: 6.2,
      y: 0,
      top: H,
      box: new THREE.Box3(new THREE.Vector3(x - 3.1, 0, z - 3.1), new THREE.Vector3(x + 3.1, H, z + 3.1)),
      hull: true,
    });
  };
  const bays = Hg.bays || [];
  // 裝飾機甲放在哪幾格（平均分散）
  const deco = new Set();
  for (let t = 0; t < 40 && deco.size < Math.min(DECO_MAX, bays.length); t++)
    deco.add(Math.floor(r() * bays.length));
  const mechs = [];
  bays.forEach((b, bi) => {
    const f = b.f,
      z = b.z,
      X = (d) => b.bx + f * d; // 從背面往前 d 公尺
    const half = 21;
    const tx = X(14);
    tower(tx, z - half - 2);
    tower(tx, z + half + 2);
    // 頂上的橫樑（背面 → 塔）＋塔之間的橫樑
    for (const zz of [z - half - 2, z + half + 2]) k.box(Md, 14, 2, 2, X(7), 34, zz);
    k.box(Md, 2, 2, 2 * half + 4, tx, 34, z);
    // 兩層的維修平台（機甲兩側）
    for (const y of [11, 21])
      for (const zz of [z - half + 3, z + half - 3]) {
        k.box(L, 14, 0.5, 5, X(8), y, zz);
        k.box(stripe, 14, 0.15, 0.2, X(8), y + 1.1, zz + (zz < z ? 2.4 : -2.4));
      }
    // 維修台（機甲站在上面）＋黃色的邊
    const mx = X(20);
    k.box(Dk, 16, 1.2, 16, mx, 0.6, z);
    for (const s of [-1, 1]) {
      k.box(stripe, 16, 0.1, 0.5, mx, 1.25, z + s * 7.8);
      k.box(stripe, 0.5, 0.1, 16, mx + s * 7.8, 1.25, z);
    }
    // 背面垂下的管線
    const ph = b.wall ? 30 : 13;
    for (let q = 0; q < 3; q++) {
      const zz = z + (r() - 0.5) * 24,
        y0 = ph - 8 + r() * 8;
      k.pipe(Dk, [X(0.5), y0, zz], [X(10), 2, zz + (r() - 0.5) * 6], 0.35, 6);
    }
    // 地上的標線：格子的前緣與兩側
    k.box(stripe, 0.6, 0.05, 2 * half, X(40), 0.08, z);
    for (const s of [-1, 1]) k.box(stripe, 12, 0.05, 0.6, X(34), 0.08, z + s * half);
    // 格號燈
    k.box(lamp, 0.4, 0.4, 3, X(0.3), ph - 2, z);
    if (deco.has(bi)) {
      const g = decoMech(r, mx, z, f > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (g) {
        mechs.push(g);
        w.obstacles.push({ kind: 'circle', x: mx, z, r: 4.5, h: 11, top: 11.5, hull: true });
      }
    } else if (r() < 0.6) {
      // 空的格子：零件箱與工作推車
      for (let q = 0; q < 3; q++)
        k.box(r() < 0.5 ? Md : mat(0x8a2a22), 3, 2, 2.4, mx + (r() - 0.5) * 10, 1, z + (r() - 0.5) * 12);
    }
  });
  // 天車：橫跨機庫的軌道（架在兩側的牆頂）＋吊車
  for (let z = -Hw + 90; z < Hw - 60; z += 150) {
    k.box(Md, 2 * Hw + 20, 3, 4, 0, top + 2, z);
    k.box(Dk, 2 * Hw + 20, 0.6, 1, 0, top + 0.2, z - 2.2);
    k.box(Dk, 2 * Hw + 20, 0.6, 1, 0, top + 0.2, z + 2.2);
    const cx = (r() - 0.5) * Hw;
    k.box(L, 12, 5, 10, cx, top - 1, z);
    k.pipe(Dk, [cx, top - 3, z], [cx, top - 18 - r() * 10, z], 0.3, 6);
  }
  // 牆頂的燈帶、兩端的巨大閘門（裝飾）
  for (const s of [-1, 1]) {
    k.box(lamp, 2 * Hw, 0.5, 0.4, 0, top - 2, s * (Hw - 0.3));
    k.box(lamp, 0.4, 0.5, 2 * Hw, s * (Hw - 0.3), top - 2, 0);
  }
  const gz = -(Hw - 0.6);
  k.box(mat(HULL_D, { roughness: 0.55, metalness: 0.5 }), 120, 42, 1, 0, 21, gz);
  for (let x = -55; x <= 55; x += 10)
    k.box(mat(HULL, { roughness: 0.55, metalness: 0.4 }), 0.8, 40, 1.4, x, 21, gz);
  k.box(stripe, 120, 2, 1.6, 0, 1, gz);
  k.box(Dk, 2, 42, 1.6, 0, 21, gz);
  for (const x of [-64, 64]) k.box(red, 1.2, 1.2, 1.4, x, 40, gz);
  const g = k.build(new THREE.Group(), false);
  g.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = m.geometry.boundingSphere ? m.geometry.boundingSphere.radius > 20 : true;
      m.receiveShadow = true;
    }
  });
  g.userData.noFade = true;
  g.userData.cat = 'struct';
  w.scene.add(g);
  w.meshes.push(g);
  for (const m of mechs) {
    m.userData.noFade = true;
    m.userData.cat = 'struct';
    w.scene.add(m);
    w.meshes.push(m);
  }
}
