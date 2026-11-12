// 主題：移動要塞「方舟」（主線第 8 章；docs/campaign-expansion-design.md 第 10 節）——行進中的巨大要塞的甲板：
// 幾塊甲板分區以連接通道相連，甲板外是虛空（底下很遠的熔岩地表往後流動＝要塞在前進）。艦橋塔、主砲塔、排氣煙囪、
// 甲板的防空砲座與貨櫃。虛空的處理和高空軌道相同（World.isVoid、MechEntity.voidCheck、下層平台 buildLedges）。
import { RNG, pick } from '../../core/math.js';
import { WS } from '../../core/scale.js';
import { DETAIL, HOLE, PK, fadeMat, hazard, mat, propGlb, registerFeatureStyle } from './kit.js';
import { buildBridges, buildLedges, planIslands } from './xylem.js';

const G = WS;
const H = 0.5; // 甲板的高度（舊尺度）
const M = {
  hull: () => mat(0x4a4e52, { roughness: 0.55, metalness: 0.6 }),
  deck: () => mat(0x3a3e42, { roughness: 0.7, metalness: 0.5 }),
  dark: () => mat(0x22262a, { roughness: 0.6, metalness: 0.6 }),
  red: () => mat(0x8a2a22, { roughness: 0.6, metalness: 0.4 }),
};
const lamp = (c = 0xffb040, k = 1.4) =>
  new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });

// ---------- 大型結構 ----------
// 艦橋塔（機甲尺度）：階梯式的上層結構、窗帶（發光）、雷達桅杆；原點在底面中心，約 30 × 48 × 24 m
export const BRIDGE = { w: 30, h: 48, d: 24 };
export function buildBridgeTower() {
  const glb = propGlb('ark_bridge', { ref: [30, 48, 24], size: [30, 48, 24], fade: true });
  if (glb) return glb;
  const k = new PK();
  const hull = fadeMat(0x4a4e52, { roughness: 0.55, metalness: 0.6 }),
    dark = M.dark(),
    win = lamp(0x9fd8ff, 0.9);
  k.cb(hull, 30, 20, 24, 0, 10, 0, 0, 0, 0, 0.6);
  k.cb(hull, 24, 12, 18, 0, 26, 1, 0, 0, 0, 0.5);
  k.cb(hull, 16, 8, 12, 0, 36, 2, 0, 0, 0, 0.4);
  for (const [y, w] of [
    [16, 30],
    [29, 24],
    [37.5, 16],
  ])
    k.box(win, w - 2, 1.2, 0.3, 0, y, -(y < 20 ? 12 : y < 33 ? 8 : 4) - 0.2);
  k.cyl(dark, 0.6, 0.8, 10, 4, 45, 4, 0, 0, 0, 8);
  k.fine(() => {
    k.box(DETAIL.steel, 6, 0.3, 0.3, 4, 49, 4);
    for (const s of [-1, 1]) k.box(DETAIL.red, 0.5, 0.5, 0.5, s * 14.6, 19.6, -11.6);
    hazard(k, DETAIL.yellow, DETAIL.black, 28, 1, 0, 1.2, -12.1);
  });
  return k.build();
}
// 主砲塔（機甲尺度）：圓形的砲座、砲塔、三根長砲管；原點在底面中心，砲座半徑 10、砲管往 −Z
export const MAIN_GUN = { r: 10, h: 14 };
export function buildMainGun() {
  const glb = propGlb('ark_maingun', { ref: [20, 14, 40], size: [20, 14, 40] });
  if (glb) return glb;
  const k = new PK();
  const hull = M.hull(),
    dark = M.dark();
  k.cyl(dark, 10, 10.5, 3, 0, 1.5, 0, 0, 0, 0, 24);
  k.cb(hull, 16, 8, 18, 0, 7, 1, 0, 0, 0, 0.8);
  k.cb(hull, 13, 3, 12, 0, 12, 2, 0, 0, 0, 0.6);
  for (const x of [-4.5, 0, 4.5]) {
    k.cyl(dark, 1.1, 1.3, 22, x, 7, -18, Math.PI / 2, 0, 0, 12);
    k.cyl(hull, 1.5, 1.5, 3, x, 7, -8, Math.PI / 2, 0, 0, 12);
  }
  k.fine(() => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      k.box(DETAIL.steel, 0.4, 0.4, 0.4, Math.cos(a) * 10.2, 3.1, Math.sin(a) * 10.2);
    }
  });
  return k.build();
}

// ---------- 小物件（可破壞） ----------
// 排氣煙囪（直徑 5、高 14 m）：方形的底座、圓筒、頂部的格柵與發光的熱
export function buildExhaust() {
  const glb = propGlb('ark_exhaust', { ref: [5, 14, 5], size: [5, 14, 5] });
  if (glb) return glb;
  const k = new PK();
  k.cb(M.hull(), 6, 2, 6, 0, 1, 0, 0, 0, 0, 0.2);
  k.cyl(M.dark(), 2.3, 2.5, 12, 0, 8, 0, 0, 0, 0, 16);
  k.cyl(lamp(0xff6a20, 0.9), 2.1, 2.1, 0.2, 0, 14.05, 0, 0, 0, 0, 16);
  for (const y of [4, 8, 12]) k.cyl(M.hull(), 2.6, 2.6, 0.3, 0, y, 0, 0, 0, 0, 16);
  return k.build();
}
// 甲板的防空砲座（現實尺寸 4 × 3.2 × 4 m）：環形的掩體、雙管機砲
export const DECK_AA = [4, 3.2, 4];
export function buildDeckAA() {
  const glb = propGlb('ark_aa', { ref: DECK_AA, size: DECK_AA });
  if (glb) return glb;
  const k = new PK().bounds(-2, 0, -2, 2, 3.2, 2);
  k.cyl(M.hull(), 2, 2, 1.2, 0, 0.6, 0, 0, 0, 0, 14);
  k.cb(M.dark(), 1.6, 1, 1.6, 0, 1.7, 0, 0, 0, 0, 0.1);
  for (const s of [-1, 1]) k.cyl(M.dark(), 0.12, 0.14, 2.2, s * 0.35, 2.2, -1.2, Math.PI / 2 - 0.4, 0, 0, 8);
  hazard(k, DETAIL.yellow, DETAIL.black, 3, 0.25, 0, 1, -2.02);
  return k.build();
}
// 裝甲艙蓋（低掩體，現實尺寸 6 × 1.6 × 4 m）
export const HATCH = [6, 1.6, 4];
export function buildArmorHatch() {
  const glb = propGlb('ark_hatch', { ref: HATCH, size: HATCH });
  if (glb) return glb;
  const k = new PK().bounds(-3, 0, -2, 3, 1.6, 2);
  k.cb(M.hull(), 6, 1.2, 4, 0, 0.6, 0, 0, 0, 0, 0.15);
  k.cb(M.dark(), 5, 0.4, 3, 0, 1.4, 0, 0, 0, 0, 0.08);
  for (const s of [-1, 1]) k.box(DETAIL.steel, 0.3, 0.3, 3.4, s * 2.6, 1.35, 0);
  return k.build();
}
// 補給貨櫃（現實尺寸 6 × 2.6 × 2.4 m，長沿 X）
export const CRATE = [6, 2.6, 2.4];
export function buildArkCrate(color) {
  const glb = propGlb('ark_crate', { ref: CRATE, size: CRATE });
  if (glb) return glb;
  const k = new PK().bounds(-3, 0, -1.2, 3, 2.6, 1.2);
  k.cb(mat(color, { roughness: 0.7, metalness: 0.4 }), 6, 2.6, 2.4, 0, 1.3, 0, 0, 0, 0, 0.05);
  for (let x = -2.5; x <= 2.5; x += 0.5) k.box(M.dark(), 0.06, 2.3, 2.45, x, 1.3, 0);
  return k.build();
}

// ---------- 底下的地表（裝飾）：很遠的熔岩地表往後流動，要塞在前進 ----------
let GROUND_TEX = null;
function groundTexture() {
  if (GROUND_TEX) return GROUND_TEX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#2a201c';
  c.fillRect(0, 0, 256, 256);
  let s = 11;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  c.strokeStyle = 'rgba(255,110,30,0.85)';
  for (let i = 0; i < 26; i++) {
    c.lineWidth = 1 + r() * 4;
    c.beginPath();
    let x = r() * 256,
      y = r() * 256;
    c.moveTo(x, y);
    for (let j = 0; j < 6; j++) c.lineTo((x += (r() - 0.5) * 60), (y += (r() - 0.5) * 60));
    c.stroke();
  }
  GROUND_TEX = new THREE.CanvasTexture(cv);
  GROUND_TEX.colorSpace = THREE.SRGBColorSpace;
  GROUND_TEX.wrapS = GROUND_TEX.wrapT = THREE.RepeatWrapping;
  return GROUND_TEX;
}
function addGroundBelow(w) {
  const S = w.size * 4;
  const t = groundTexture().clone();
  t.needsUpdate = true;
  t.repeat.set(S / 90, S / 90);
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: t,
    emissive: 0xff7a30,
    emissiveMap: t,
    emissiveIntensity: 0.9,
    roughness: 1,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(S, S), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -70 * G;
  mesh.userData.noFade = true;
  mesh.userData.noAO = true;
  mesh.onBeforeRender = () => {
    t.offset.y = (performance.now() * 0.00004) % 1; // 往後流（要塞往 −Z 前進）
  };
  w.scene.add(mesh);
  w.meshes.push(mesh);
}

// ---------- 地形特徵的外觀（艦上的鋼構） ----------
const C = {
  deck: 0x3a3e42,
  trim: 0xd8a020,
  pillar: 0x4a4e52,
  wall: 0x5a5e62,
  plat: 0x44484c,
  rock: 0x2a2e32,
};
registerFeatureStyle('ark', C, {
  deck(w, d, thick, rotY, C) {
    const L = rotY ? d : w,
      D = rotY ? w : d;
    const k = new PK();
    k.at(0, 0, 0, 0, rotY ? -Math.PI / 2 : 0, 0, () => {
      k.ob(L, thick, D, 0, -thick / 2, 0);
      k.cb(fadeMat(C.deck, { roughness: 0.6, metalness: 0.6 }), L, thick, D, 0, -thick / 2, 0, 0, 0, 0, 0.05);
      for (const s of [-1, 1]) k.box(fadeMat(C.trim), L, 0.12, 0.12, 0, 1, s * (D / 2 - 0.15));
    });
    return k.build();
  },
  pillar(r, h, C) {
    const k = new PK().bounds(-r, -h / 2, -r, r, h / 2, r);
    k.box(mat(C.pillar, { roughness: 0.5, metalness: 0.6 }), r * 1.8, h, r * 1.8, 0, 0, 0);
    return k.build();
  },
  wall(w, h, d, C) {
    const k = new PK();
    const along = w > d,
      L = along ? w : d,
      T = along ? d : w;
    k.at(0, 0, 0, 0, along ? 0 : -Math.PI / 2, 0, () => {
      k.ob(L, h, T + 0.05);
      k.cb(fadeMat(C.wall, { roughness: 0.5, metalness: 0.5 }), L, h, T, 0, 0, 0, 0, 0, 0, 0.1);
      hazard(k, DETAIL.yellow, DETAIL.black, L - 0.4, 0.4, 0, -h / 2 + 0.4, T / 2 + 0.02);
    });
    return k.build();
  },
  platform(w, h, d, C) {
    const k = new PK().bounds(-w / 2, 0, -d / 2, w / 2, h, d / 2);
    k.cb(fadeMat(C.plat, { roughness: 0.5, metalness: 0.6 }), w, h, d, 0, h / 2, 0, 0, 0, 0, 0.12);
    return k.build();
  },
  ramp(rw, rd, C) {
    const along = rw >= rd;
    const L = along ? rw : rd,
      D = along ? rd : rw;
    const k = new PK().ob(rw, 0.35, rd);
    k.at(0, 0, 0, 0, along ? 0 : Math.PI / 2, 0, () => {
      k.cb(mat(C.deck, { roughness: 0.6, metalness: 0.6 }), L, 0.35, D, 0, 0, 0, 0, 0, 0, 0.05);
    });
    return k.build();
  },
  tunnel(C) {
    const k = new PK();
    k.cb(mat(C.wall, { roughness: 0.5, metalness: 0.5 }), 18, 12, 8, 0, 5, -5, 0, 0, 0, 0.6);
    k.box(HOLE, 8, 6.5, 2.8, 0, 3.25, 0);
    k.box(mat(C.trim), 9, 0.4, 2.9, 0, 6.8, 0);
    return k.build();
  },
});

// ---------- 甲板 ----------
function planTerrain(w) {
  // 一大塊主甲板（艦橋與主砲）＋幾塊外圍的甲板分區
  return planIslands(w, { h: H, deep: -50, central: 64, n: [4, 6], size: [26, 38], span: 30, gap: 10 });
}
function placeBig(w, g, spot, shapes) {
  g.position.y = spot.lo;
  w.addBig(
    g,
    spot,
    shapes.map((s) => (s.box ? { ...s, y: spot.lo + s.y, top: spot.lo + s.top } : s)),
  );
  w.reserve(spot.aabb[0], spot.aabb[1], spot.aabb[2], spot.aabb[3]);
}
function buildStructures(w) {
  buildBridges(w, 12);
  buildLedges(w, 6, 3);
  addGroundBelow(w);
  const B = BRIDGE;
  const spot = w.findSpot([-B.w / 2, B.w / 2, -B.d / 2, B.d / 2], 1.5 * G, 40);
  if (spot)
    placeBig(w, buildBridgeTower(), spot, [{ box: [-B.w / 2, B.w / 2, -B.d / 2, B.d / 2], y: 0, top: B.h }]);
  for (let k = w.cnt(1, 2); k > 0; k--) {
    const r = MAIN_GUN.r;
    const s2 = w.findSpot([-r, r, -r - 22, r], 1.5 * G, 40);
    if (s2) placeBig(w, buildMainGun(), s2, [{ c: [0, 0], r, h: MAIN_GUN.h }]);
  }
}
function buildProps(w) {
  w.scatter(w.cnt(5, 8), 10, (x, z, y) => {
    w.addSmall(buildExhaust(), x, y, z, { r: 2.6, h: 14 }, 'exhaust', 4200, 0x22262a);
  });
  w.scatter(w.cnt(6, 9), 8, (x, z, y) => {
    const [a, h, b] = DECK_AA;
    w.addSmall(buildDeckAA(), x, y, z, { w: a, h, d: b }, 'deckaa', 1600, 0x4a4e52);
  });
  w.scatter(w.cnt(8, 12), 7, (x, z, y) => {
    const g = buildArmorHatch();
    const rot = RNG() < 0.5;
    if (rot) g.rotation.y = Math.PI / 2;
    const [a, h, b] = HATCH;
    w.addSmall(g, x, y, z, { w: rot ? b : a, h, d: rot ? a : b }, 'hatch', 2400, 0x4a4e52);
  });
  w.scatter(w.cnt(8, 12), 7, (x, z, y) => {
    const color = pick([0x8a2a22, 0x3a5a6a, 0x6a6a3a]);
    const g = buildArkCrate(color);
    const rot = RNG() < 0.5;
    if (rot) g.rotation.y = Math.PI / 2;
    const [a, h, b] = CRATE;
    w.addSmall(g, x, y, z, { w: rot ? b : a, h, d: rot ? a : b }, 'arkcrate', 1400, color);
  });
}

export const ARK = {
  lightFloor: { sky: 0xa88878, amb: 0x9a8478, sunI: 1.45, hemiI: 2.15 }, // 最低亮度（World.applyLight，docs/brightness-design.md）
  name: '移動要塞「方舟」',
  ground: 0x4a4e52,
  slope: 0x3a3e42,
  rock: 0x2a2e32,
  fog: 0x6a4a3a,
  sky: 0x5a3a2c,
  sun: 0xffc890,
  amb: 0x6a5048,
  container: 0x4a4e52,
  container2: 0x8a2a22,
  hasRocks: false,
  weather: 'ash',
  props: 'ark',
  void: { y: -4, fall: -7, fallP: -14, ref: H },
  sunI: 0.85,
  fogNear: 60,
  fogFar: 240,
  featureKinds: [],
  noCorridor: true,
  bossBan: ['worm', 'rampart', 'train', 'artillery'],
  planTerrain,
  buildStructures,
  buildProps,
  propNames: { exhaust: '排氣煙囪', deckaa: '防空砲座', hatch: '裝甲艙蓋', arkcrate: '補給貨櫃' },
  catalog: [
    [
      'ark_bridge',
      '方舟的艦橋塔',
      '移動要塞的地標；約 30 × 48 × 24 m，窗帶發光，不可破壞',
      () => buildBridgeTower(),
    ],
    [
      'ark_maingun',
      '方舟的主砲塔',
      '移動要塞；砲座半徑 10 m、三根砲管往 −Z 伸約 30 m，不可破壞',
      () => buildMainGun(),
    ],
    ['ark_exhaust', '排氣煙囪', '移動要塞；直徑 5、高 14 m，可破壞', () => buildExhaust()],
    ['ark_aa', '防空砲座', '移動要塞；現實尺寸 4 × 3.2 × 4 m，可破壞', () => buildDeckAA()],
    ['ark_hatch', '裝甲艙蓋', '移動要塞的低掩體；6 × 1.6 × 4 m（沿 X），可破壞', () => buildArmorHatch()],
    ['ark_crate', '補給貨櫃', '移動要塞；6 × 2.6 × 2.4 m（沿 X），可破壞', () => buildArkCrate(0x8a2a22)],
  ],
};
