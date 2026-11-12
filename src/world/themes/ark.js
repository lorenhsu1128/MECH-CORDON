// 主題：移動要塞「方舟」（主線第 8 章；docs/campaign-expansion-design.md 第 10 節）——行進中的巨艦表面，
// 2026-11-12 改版（docs/ark-redesign.md）：星際大戰帝國艦風格的多層甲板（中央脊、上層建築與艦橋塔、高台、
// 維修井、舷側甲板、側舷的壕溝、可以從下面走過的上層甲板），船邊外是虛空（底下很遠的熔岩地表往後流＝要塞在前進）。
// 船體的版面與外觀在 ark-hull.js，艦內維修機庫在 ark-hangar.js；這裡是主題定義、大型結構與可破壞的物件。
import { RNG, pick } from '../../core/math.js';
import { DETAIL, PK, fadeMat, hazard, mat, propGlb, registerFeatureStyle } from './kit.js';
import { ARK_VOID, GM, HULL, HULL_D, HULL_K, buildHull, hullProps, planArk } from './ark-hull.js';
import { buildHangar } from './ark-hangar.js';

const M = {
  hull: () => mat(HULL, { roughness: 0.55, metalness: 0.4 }),
  mid: () => mat(HULL_D, { roughness: 0.6, metalness: 0.45 }),
  dark: () => mat(HULL_K, { roughness: 0.65, metalness: 0.5 }),
  red: () => mat(0x8a2a22, { roughness: 0.6, metalness: 0.4 }),
};
const lamp = (c = 0xfff0d0, k = 1.4) =>
  new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.4 });

// ---------- 大型結構 ----------
// 艦橋塔（帝國艦的 T 字形艦橋）：三層往上收的上層建築、窄的頸部、橫長的指揮艦橋與兩顆護盾圓頂；
// 原點在底面中心，約 46 × 60 × 28 m（站在上層建築 +30 上，頂端約 90 m）
export const BRIDGE = { w: 40, h: 34, d: 28 };
const BRIDGE_K = 1.35;
export function buildBridgeTower() {
  const glb = propGlb('ark_bridge', { ref: [46, 60, 28], size: [46, 60, 28], fade: true });
  if (glb) return glb;
  const k = new PK();
  const hull = fadeMat(HULL, { roughness: 0.55, metalness: 0.4 }),
    mid = fadeMat(HULL_D, { roughness: 0.6, metalness: 0.45 }),
    dark = fadeMat(HULL_K, { roughness: 0.65, metalness: 0.5 }),
    win = lamp(0xfff0d0, 1.2),
    blue = lamp(0xbfe4ff, 1.4);
  // 三層：每層的前緣是窗帶
  const tiers = [
    [40, 14, 28, 0],
    [32, 11, 22, 14],
    [24, 9, 16, 25],
  ];
  for (const [w, h, d, y] of tiers) {
    k.cb(hull, w, h, d, 0, y + h / 2, 0, 0, 0, 0, 0.4);
    k.box(dark, w - 1, 1.2, 0.4, 0, y + h * 0.62, -d / 2 - 0.15);
    k.box(win, w - 3, 0.5, 0.3, 0, y + h * 0.62, -d / 2 - 0.3);
    k.box(mid, w + 0.6, 0.8, d + 0.6, 0, y + h - 0.4, 0);
  }
  // 頸部與 T 字形的指揮艦橋
  k.cb(mid, 10, 10, 9, 0, 39, 2, 0, 0, 0, 0.3);
  k.cb(hull, 46, 6, 10, 0, 47, 2, 0, 0, 0, 0.4);
  k.box(dark, 44, 1.2, 0.4, 0, 47.2, -3.1);
  k.box(win, 42, 0.5, 0.3, 0, 47.2, -3.3);
  // 護盾圓頂（兩側，細的支柱上）
  for (const s of [-1, 1]) {
    k.cyl(mid, 0.9, 1.2, 5, s * 17, 52.5, 2, 0, 0, 0, 10);
    k.geo(hull, new THREE.SphereGeometry(4.2, 16, 10), s * 17, 57, 2);
  }
  k.fine(() => {
    // 側面的肋條、後方的天線、頂上的感測器與紅燈
    for (const [w, h, d, y] of tiers)
      for (let z = -d / 2 + 2; z < d / 2 - 1; z += 3)
        for (const s of [-1, 1]) k.box(mid, 0.5, h - 2, 0.6, s * (w / 2 + 0.2), y + h / 2, z);
    k.cyl(dark, 0.3, 0.4, 14, 6, 57, 6, 0, 0, 0, 6);
    k.box(DETAIL.steel, 6, 0.3, 0.3, 6, 63, 6);
    for (const s of [-1, 1]) k.box(DETAIL.red, 0.6, 0.6, 0.6, s * 22.5, 50.4, 2);
    for (let x = -20; x <= 20; x += 5) k.box(blue, 0.5, 0.5, 0.5, x, 50.2, 6.8);
  });
  return k.build();
}
// 主砲塔（重渦輪雷射砲）：圓形的砲座、砲塔、兩根長砲管；原點在底面中心，砲座半徑 18、砲管往 −Z
export const MAIN_GUN = { r: 18, h: 16 };
export function buildMainGun() {
  const glb = propGlb('ark_maingun', { ref: [36, 16, 76], size: [36, 16, 76] });
  if (glb) return glb;
  const k = new PK();
  const hull = M.hull(),
    mid = M.mid(),
    dark = M.dark();
  k.cyl(mid, 18, 18.5, 3, 0, 1.5, 0, 0, 0, 0, 32);
  k.cyl(dark, 16.5, 16.5, 0.6, 0, 3.2, 0, 0, 0, 0, 32);
  k.cb(hull, 26, 9, 26, 0, 7.5, 2, 0, 0, 0, 1.2);
  k.cb(hull, 18, 4, 16, 0, 13.5, 4, 0, 0, 0, 0.8);
  k.box(dark, 20, 2.2, 0.5, 0, 9, -11.1);
  for (const x of [-5, 5]) {
    k.cyl(mid, 2.2, 2.4, 8, x, 8, -14, Math.PI / 2, 0, 0, 14);
    k.cyl(dark, 1.3, 1.5, 30, x, 8, -32, Math.PI / 2, 0, 0, 12);
    k.cyl(mid, 1.8, 1.8, 3, x, 8, -46, Math.PI / 2, 0, 0, 12);
    k.cyl(lamp(0x9fff9a, 1.2), 1, 1, 0.3, x, 8, -47.6, Math.PI / 2, 0, 0, 10);
  }
  k.fine(() => {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      k.box(DETAIL.steel, 0.6, 0.5, 0.6, Math.cos(a) * 17.4, 3.2, Math.sin(a) * 17.4);
    }
    k.cyl(dark, 1.2, 1.2, 3, 7, 17, 8, 0, 0, 0, 10);
    k.box(DETAIL.red, 0.5, 0.5, 0.5, 7, 18.8, 8);
    for (let z = -6; z <= 12; z += 3) for (const s of [-1, 1]) k.box(mid, 0.5, 7, 0.6, s * 13.2, 7.5, z);
  });
  return k.build();
}

// ---------- 小物件（可破壞） ----------
// 渦輪雷射砲塔（現實尺寸 8 × 9 × 8 m）：方形的底座、可轉的砲塔、雙管、測距儀；舷側甲板與壕溝邊一排一排
export const TLASER = [8, 9, 8];
export function buildTurbolaser() {
  const glb = propGlb('ark_tlaser', { ref: TLASER, size: TLASER });
  if (glb) return glb;
  const k = new PK().bounds(-4, 0, -4, 4, 9, 4);
  const hull = M.hull(),
    mid = M.mid(),
    dark = M.dark();
  k.cb(mid, 7.4, 3, 7.4, 0, 1.5, 0, 0, 0, 0, 0.3);
  k.cb(hull, 6, 0.6, 6, 0, 3.3, 0, 0, 0, 0, 0.1);
  k.cyl(dark, 2.2, 2.4, 1.4, 0, 4.1, 0, 0, 0, 0, 14);
  k.cb(hull, 5, 3.4, 4.6, 0, 6.2, 0.3, 0, 0, 0, 0.35);
  k.box(dark, 4.2, 0.6, 0.3, 0, 7, -2.05);
  for (const x of [-1.1, 1.1]) {
    k.cyl(mid, 0.45, 0.55, 2, x, 6.2, -3, Math.PI / 2, 0, 0, 8);
    k.cyl(dark, 0.28, 0.3, 4.4, x, 6.2, -5.8, Math.PI / 2, 0, 0, 8);
  }
  k.fine(() => {
    k.cyl(mid, 0.8, 0.8, 0.4, 1.6, 8.1, 1.2, 0, 0, 0, 10);
    k.box(DETAIL.red, 0.3, 0.3, 0.3, -1.8, 8.05, 1.6);
    for (const s of [-1, 1]) k.box(mid, 0.4, 2.6, 4.2, s * 2.55, 6.2, 0.3);
    hazard(k, DETAIL.yellow, DETAIL.black, 6.8, 0.3, 0, 0.5, -3.72);
  });
  return k.build();
}
// 排氣煙囪（直徑 5、高 14 m）：方形的底座、圓筒、頂部發光的熱
export function buildExhaust() {
  const glb = propGlb('ark_exhaust', { ref: [5, 14, 5], size: [5, 14, 5] });
  if (glb) return glb;
  const k = new PK();
  k.cb(M.mid(), 6, 2, 6, 0, 1, 0, 0, 0, 0, 0.2);
  k.cyl(M.hull(), 2.3, 2.5, 12, 0, 8, 0, 0, 0, 0, 16);
  k.cyl(lamp(0xff8a40, 0.9), 2.1, 2.1, 0.2, 0, 14.05, 0, 0, 0, 0, 16);
  for (const y of [4, 8, 12]) k.cyl(M.dark(), 2.6, 2.6, 0.3, 0, y, 0, 0, 0, 0, 16);
  return k.build();
}
// 甲板的防空砲座（現實尺寸 4 × 3.2 × 4 m）：環形的掩體、雙管機砲
export const DECK_AA = [4, 3.2, 4];
export function buildDeckAA() {
  const glb = propGlb('ark_aa', { ref: DECK_AA, size: DECK_AA });
  if (glb) return glb;
  const k = new PK().bounds(-2, 0, -2, 2, 3.2, 2);
  k.cyl(M.hull(), 2, 2, 1.2, 0, 0.6, 0, 0, 0, 0, 14);
  k.cb(M.mid(), 1.6, 1, 1.6, 0, 1.7, 0, 0, 0, 0, 0.1);
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
  k.cb(M.mid(), 6, 1.2, 4, 0, 0.6, 0, 0, 0, 0, 0.15);
  k.cb(M.hull(), 5, 0.4, 3, 0, 1.4, 0, 0, 0, 0, 0.08);
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
const CRATE_COLORS = [0x8a2a22, 0x5a6068, 0xb8bcc0];

// ---------- 地形特徵的外觀（上層甲板、支柱；addDeck／addPillar 用） ----------
const C = {
  deck: HULL,
  trim: 0xd8a020,
  pillar: HULL_D,
  wall: 0x8a8e93,
  plat: 0x9a9ea3,
  rock: HULL_K,
};
registerFeatureStyle('ark', C, {
  // 上層甲板：淺灰的鋼板、底面的橫樑（從下面走過時看得到）、兩側的燈
  deck(w, d, thick, rotY, C) {
    const L = rotY ? d : w,
      D = rotY ? w : d;
    const k = new PK();
    k.at(0, 0, 0, 0, rotY ? -Math.PI / 2 : 0, 0, () => {
      k.ob(L, thick, D, 0, -thick / 2, 0);
      k.cb(
        fadeMat(C.deck, { roughness: 0.55, metalness: 0.4 }),
        L,
        thick,
        D,
        0,
        -thick / 2,
        0,
        0,
        0,
        0,
        0.08,
      );
      const dk = fadeMat(HULL_K, { roughness: 0.65, metalness: 0.5 }),
        md = fadeMat(HULL_D, { roughness: 0.6, metalness: 0.45 });
      for (const s of [-1, 1]) {
        k.box(md, L, 0.5, 0.6, 0, -0.1, s * (D / 2 - 0.3));
        k.box(DETAIL.yellow, L, 0.06, 0.4, 0, 0.03, s * (D / 2 - 1.2));
      }
      // 面板縫（每 6 m）、中線的導引、底面的橫樑
      for (let x = -L / 2 + 6; x < L / 2 - 1; x += 6) k.box(dk, 0.25, 0.05, D - 2.6, x, 0.03, 0);
      for (let x = -L / 2 + 4; x < L / 2 - 2; x += 8) k.box(md, 3, 0.05, 0.5, x, 0.03, 0);
      for (let x = -L / 2 + 3; x < L / 2 - 1; x += 7) k.box(dk, 0.8, 1.2, D - 1, x, -thick - 0.6, 0);
      k.fine(() => {
        const lm = lamp(0xfff0d0, 1.3);
        for (let x = -L / 2 + 2; x < L / 2; x += 6)
          for (const s of [-1, 1]) k.box(lm, 0.5, 0.2, 0.3, x, 0.12, s * (D / 2 - 0.4));
      });
    });
    return k.build();
  },
  pillar(r, h, C) {
    const k = new PK().bounds(-r, -h / 2, -r, r, h / 2, r);
    k.box(mat(C.pillar, { roughness: 0.55, metalness: 0.5 }), r * 1.8, h, r * 1.8, 0, 0, 0);
    for (const s of [-1, 1]) k.box(mat(HULL_K, { roughness: 0.6 }), r * 0.3, h, r * 2, s * r * 0.95, 0, 0);
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
    k.cb(fadeMat(C.plat, { roughness: 0.5, metalness: 0.5 }), w, h, d, 0, h / 2, 0, 0, 0, 0, 0.12);
    return k.build();
  },
  ramp(rw, rd, C) {
    const along = rw >= rd;
    const L = along ? rw : rd,
      D = along ? rd : rw;
    const k = new PK().ob(rw, 0.35, rd);
    k.at(0, 0, 0, 0, along ? 0 : Math.PI / 2, 0, () => {
      k.cb(mat(C.deck, { roughness: 0.6, metalness: 0.5 }), L, 0.35, D, 0, 0, 0, 0, 0, 0, 0.05);
    });
    return k.build();
  },
  tunnel(C) {
    const k = new PK();
    k.cb(mat(C.wall, { roughness: 0.5, metalness: 0.5 }), 18, 12, 8, 0, 5, -5, 0, 0, 0, 0.6);
    k.box(DETAIL.dark, 8, 6.5, 2.8, 0, 3.25, 0);
    k.box(mat(C.trim), 9, 0.4, 2.9, 0, 6.8, 0);
    return k.build();
  },
});

// ---------- 船體與大型結構 ----------
function placeAt(w, g, b, half, shapes) {
  g.position.y = b.y;
  const spot = {
    x: b.x,
    z: b.z,
    q: 0,
    rotY: 0,
    lo: b.y,
    aabb: [b.x - half[0], b.x + half[0], b.z - half[1], b.z + half[1]],
  };
  w.addBig(
    g,
    spot,
    shapes.map((s) => (s.box ? { ...s, y: b.y + s.y, top: b.y + s.top } : s)),
  );
  w.reserve(spot.aabb[0], spot.aabb[1], spot.aabb[2], spot.aabb[3]);
}
function buildStructures(w) {
  buildHull(w);
  const P = w.arkP;
  for (const b of P.big) {
    if (b.k === 'bridge') {
      // 艦橋塔放大 1.35 倍（帝國艦的艦橋比例）
      const g = buildBridgeTower();
      g.scale.setScalar(BRIDGE_K);
      const k = BRIDGE_K;
      placeAt(w, g, b, [32, 22], [{ box: [-20 * k, 20 * k, -14 * k, 14 * k], y: 0, top: BRIDGE.h * k }]);
    } else if (b.k === 'gun')
      placeAt(w, buildMainGun(), b, [20, 50], [{ c: [0, 0], r: MAIN_GUN.r, h: MAIN_GUN.h }]);
  }
  if (P.kind === 'hangar' && !(w.opt && w.opt.sample)) buildHangar(w);
}
function buildProps(w) {
  // 版面指定的渦輪雷射砲塔（舷側甲板、壕溝邊）
  for (const p of hullProps(w)) {
    if (p.k !== 'tlaser' || w.isVoid(p.x, p.z) || w.isReserved(p.x, p.z, 2)) continue;
    const g = buildTurbolaser();
    g.rotation.y = p.ry || 0;
    const [a, h, b] = TLASER;
    w.addSmall(g, p.x, w.terrainHeight(p.x, p.z), p.z, { w: a, h, d: b }, 'tlaser', 3600, HULL);
  }
  const hangar = w.arkP && w.arkP.kind === 'hangar';
  if (!hangar)
    w.scatter(w.cnt(3, 5), 10, (x, z, y) => {
      w.addSmall(buildExhaust(), x, y, z, { r: 2.6, h: 14 }, 'exhaust', 4200, HULL_K);
    });
  w.scatter(w.cnt(5, 8), 8, (x, z, y) => {
    const [a, h, b] = DECK_AA;
    w.addSmall(buildDeckAA(), x, y, z, { w: a, h, d: b }, 'deckaa', 1600, HULL);
  });
  w.scatter(w.cnt(8, 12), 7, (x, z, y) => {
    const g = buildArmorHatch();
    const rot = RNG() < 0.5;
    if (rot) g.rotation.y = Math.PI / 2;
    const [a, h, b] = HATCH;
    w.addSmall(g, x, y, z, { w: rot ? b : a, h, d: rot ? a : b }, 'hatch', 2400, HULL);
  });
  w.scatter(w.cnt(hangar ? 14 : 8, hangar ? 20 : 12), 7, (x, z, y) => {
    const color = pick(CRATE_COLORS);
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
  ground: HULL,
  slope: HULL_D,
  rock: HULL_K,
  fog: 0x6a4a3a,
  sky: 0x5a3a2c,
  sun: 0xffd8b0,
  amb: 0x6a5048,
  container: HULL,
  container2: 0x8a2a22,
  hasRocks: false,
  weather: 'arkwind',
  props: 'ark',
  void: ARK_VOID,
  noSmooth: true, // 船體各層的邊緣要俐落（World.buildTerrain）
  rockY: [1e4, 1],
  sunI: 0.85,
  fogNear: 60,
  fogFar: 240,
  featureKinds: [],
  noCorridor: true,
  bossBan: ['worm', 'rampart', 'train', 'artillery'],
  planTerrain: planArk('base'),
  buildStructures,
  buildProps,
  propNames: {
    exhaust: '排氣煙囪',
    deckaa: '防空砲座',
    hatch: '裝甲艙蓋',
    arkcrate: '補給貨櫃',
    tlaser: '渦輪雷射砲塔',
  },
  catalog: [
    [
      'ark_bridge',
      '方舟的艦橋塔',
      '移動要塞的地標；帝國艦的 T 字形艦橋，約 46 × 60 × 28 m，站在上層建築上，不可破壞',
      () => buildBridgeTower(),
    ],
    [
      'ark_maingun',
      '方舟的主砲塔',
      '移動要塞「艦首」；砲座半徑 18 m、雙管往 −Z 伸約 48 m，不可破壞',
      () => buildMainGun(),
    ],
    [
      'ark_tlaser',
      '渦輪雷射砲塔',
      '移動要塞的舷側與壕溝邊；現實尺寸 8 × 9 × 8 m，可破壞',
      () => buildTurbolaser(),
    ],
    ['ark_exhaust', '排氣煙囪', '移動要塞；直徑 5、高 14 m，可破壞', () => buildExhaust()],
    ['ark_aa', '防空砲座', '移動要塞；現實尺寸 4 × 3.2 × 4 m，可破壞', () => buildDeckAA()],
    ['ark_hatch', '裝甲艙蓋', '移動要塞的低掩體；6 × 1.6 × 4 m（沿 X），可破壞', () => buildArmorHatch()],
    ['ark_crate', '補給貨櫃', '移動要塞；6 × 2.6 × 2.4 m（沿 X），可破壞', () => buildArkCrate(0x8a2a22)],
  ],
};
// 變體用（variants.js）
export { GM, planArk };
