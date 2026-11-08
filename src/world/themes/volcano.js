// 主題：火山熔爐帶（主線第 7 章；docs/campaign-expansion-design.md 第 10 節）——玄武岩台地、蜿蜒的熔岩河
// （踩進去持續受傷：game/lava.js 的 lavaTick；World.offLimits 讓出生點、散布、大型物件避開）、卡斯特隆的熔爐工廠、
// 艾瑟立克的地熱設施、火山灰。熔岩面的高度 LAVA_Y（舊尺度，× G）。
import { RNG, clamp, rnd } from '../../core/math.js';
import { WS } from '../../core/scale.js';
import { DETAIL, HOLE, PK, fadeMat, hazard, mat, propGlb, registerFeatureStyle } from './kit.js';

const G = WS;
export const LAVA_Y = -1.4; // 熔岩面（舊尺度 × G）
const LAVA_COL = 0xff5a10;
const M = {
  basalt: () => mat(0x2e2826, { roughness: 1, metalness: 0 }),
  rust: () => mat(0x6a3a24, { roughness: 0.85, metalness: 0.35 }),
  iron: () => mat(0x3c3a38, { roughness: 0.6, metalness: 0.6 }),
  brick: () => mat(0x5a3428, { roughness: 0.95, metalness: 0.02 }),
  steel: () => mat(0x8a8e92, { roughness: 0.4, metalness: 0.8 }),
  yellow: () => mat(0xd09a20, { roughness: 0.6 }),
};
// 發光的熔融金屬／熔岩（emissive）
const glow = (c = LAVA_COL, k = 1.6) =>
  new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: k, roughness: 0.5 });

// ---------- 大型結構 ----------
// 熔爐塔（機甲尺度）：基座、往上收的爐身、出鐵口（發光）、頂部的煙囪、環形步道、側面的熱風管；原點在底面中心
export const SMELTER = { r: 11, h: 62 };
export function buildSmelter() {
  const glb = propGlb('volcano_smelter', { ref: [26, 62, 26], size: [26, 62, 26] });
  if (glb) return glb;
  const k = new PK();
  const rust = M.rust(),
    iron = M.iron(),
    brick = M.brick(),
    hot = glow(0xff6a20, 1.8);
  k.cb(brick, 26, 4, 26, 0, 2, 0, 0, 0, 0, 0.4);
  k.cyl(rust, 9, 11, 34, 0, 21, 0, 0, 0, 0, 20);
  k.cyl(iron, 6.5, 9, 10, 0, 43, 0, 0, 0, 0, 20);
  k.cyl(rust, 3, 3.6, 18, 2.5, 57, 1.5, 0, 0, 0, 14);
  // 出鐵口與流槽（發光）
  k.cb(iron, 6, 5, 3, 0, 6.5, 11.2, 0, 0, 0, 0.2);
  k.box(hot, 3.4, 2.4, 0.4, 0, 6.2, 12.75);
  k.box(hot, 1.6, 0.4, 7, 0, 4.1, 16);
  // 爐身的補強環與環形步道
  for (const y of [10, 18, 26, 34]) k.cyl(iron, 11.3 - y * 0.06, 11.3 - y * 0.06, 0.6, 0, y, 0, 0, 0, 0, 20);
  k.fine(() => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.box(M.yellow(), 0.15, 1.1, 0.15, Math.cos(a) * 11.6, 27, Math.sin(a) * 11.6);
    }
    // 熱風管：從地面爬到爐身中段
    for (const s of [-1, 1]) {
      k.pipe(iron, [s * 13, 0.5, -4], [s * 13, 20, -4], 1.1, 10);
      k.pipe(iron, [s * 13, 20, -4], [s * 9.5, 24, -4], 1.1, 10);
    }
    k.box(hot, 0.3, 4, 3, 9.3, 30, 0); // 觀察窗
  });
  return k.build();
}
// 熔爐工廠的廠房（w × h × d）：三面牆、前方（−Z）開口、屋頂可以站；地面有發光的鑄造溝
export function buildFoundryHall(w, h, d) {
  const glb = propGlb('volcano_foundry', { ref: [48, 22, 36], size: [w, h, d], fade: true });
  if (glb) return glb;
  const k = new PK();
  const wall = fadeMat(0x4a3a32, { roughness: 0.9 }),
    roof = fadeMat(0x3a3634, { roughness: 0.8, metalness: 0.4 }),
    iron = M.iron(),
    hot = glow();
  const t = 1.2;
  k.cb(wall, w, h, t, 0, h / 2, d / 2 - t / 2, 0, 0, 0, 0.1);
  for (const s of [-1, 1]) k.cb(wall, t, h, d, s * (w / 2 - t / 2), h / 2, 0, 0, 0, 0, 0.1);
  k.cb(roof, w + 1, 1.4, d + 1, 0, h - 0.7, 0, 0, 0, 0, 0.1);
  // 鋸齒屋頂的天窗
  for (let x = -w / 2 + 6; x < w / 2 - 3; x += 8) k.box(iron, 1.2, 2.4, d - 2, x, h + 1, 0, 0, 0, 0.5);
  // 地面的鑄造溝（發光）與門楣的警示條紋
  k.box(hot, w * 0.6, 0.15, 1.2, 0, 0.1, 0);
  hazard(k, DETAIL.yellow, DETAIL.black, w - 2, 1, 0, h - 2.2, -d / 2 + 0.2);
  k.fine(() => {
    for (let x = -w / 2 + 4; x < w / 2 - 2; x += 6)
      k.box(iron, 0.8, h - 1.4, 0.8, x, (h - 1.4) / 2, -d / 2 + 0.6);
  });
  return k.build();
}

// ---------- 小物件（可破壞） ----------
// 熔渣車（現實尺寸 6 × 3.2 × 3.4 m，長沿 X）：台車、車輪、裝著發光熔渣的斗
export const SLAG_CART = [6, 3.2, 3.4];
export function buildSlagCart() {
  const glb = propGlb('volcano_slagcart', { ref: SLAG_CART, size: SLAG_CART });
  if (glb) return glb;
  const k = new PK().bounds(-3, 0, -1.7, 3, 3.2, 1.7);
  const iron = M.iron(),
    hot = glow(0xff7a20, 1.3);
  k.cb(iron, 5.6, 0.6, 2.6, 0, 0.9, 0, 0, 0, 0, 0.06);
  for (const sx of [-1.8, 1.8])
    for (const sz of [-1.25, 1.25]) k.cyl(DETAIL.dark, 0.55, 0.55, 0.3, sx, 0.55, sz, Math.PI / 2, 0, 0, 12);
  k.cyl(M.rust(), 1.6, 1.1, 1.8, 0, 2.1, 0, 0, 0, 0, 14);
  k.cyl(hot, 1.45, 1.45, 0.12, 0, 3.0, 0, 0, 0, 0, 14);
  return k.build();
}
// 礦石堆（s＝倍率；原點在底面中心）
export function buildOreHeap(s = 1) {
  const glb = propGlb('volcano_ore', { ref: [6, 3, 6], size: [6 * s, 3 * s, 6 * s] });
  if (glb) return glb;
  const k = new PK();
  const b = M.basalt(),
    ore = mat(0x6a5040, { roughness: 0.9 });
  k.cyl(b, 1.2 * s, 3 * s, 2.4 * s, 0, 1.2 * s, 0, 0, 0, 0, 7);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3;
    k.cb(
      ore,
      1.2 * s,
      0.9 * s,
      1.1 * s,
      Math.cos(a) * 1.8 * s,
      0.45 * s,
      Math.sin(a) * 1.8 * s,
      0.2,
      a,
      0.1,
      0.15 * s,
    );
  }
  return k.build();
}
// 地熱噴氣口（現實尺寸：直徑約 3、高 6 m）：粗管、法蘭、發光的環
export const HEAT_VENT = { r: 1.6, h: 6 };
export function buildHeatVent() {
  const glb = propGlb('volcano_vent', { ref: [3.2, 6, 3.2], size: [3.2, 6, 3.2] });
  if (glb) return glb;
  const k = new PK();
  const iron = M.iron();
  k.cyl(M.basalt(), 2.2, 2.8, 1, 0, 0.5, 0, 0, 0, 0, 10);
  k.cyl(iron, 1.3, 1.5, 5, 0, 3.5, 0, 0, 0, 0, 14);
  k.cyl(iron, 1.7, 1.7, 0.4, 0, 6, 0, 0, 0, 0, 14);
  k.cyl(glow(0xff8030, 1.2), 1.35, 1.35, 0.1, 0, 6.25, 0, 0, 0, 0, 14);
  k.fine(() => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.box(DETAIL.steel, 0.12, 0.2, 0.12, Math.cos(a) * 1.55, 6.2, Math.sin(a) * 1.55);
    }
  });
  return k.build();
}
// 冷卻水槽（半徑 r、高 1.4r）：圓槽、補強的肋、爬梯
export function buildCoolTank(r = 4) {
  const glb = propGlb('volcano_tank', { ref: [8, 5.6, 8], size: [2 * r, 1.4 * r, 2 * r] });
  if (glb) return glb;
  const k = new PK();
  const st = M.steel();
  k.cyl(st, r, r, 1.4 * r, 0, 0.7 * r, 0, 0, 0, 0, 18);
  k.cyl(DETAIL.dark, r * 1.02, r * 1.02, 0.2, 0, 1.4 * r, 0, 0, 0, 0, 18);
  for (const y of [0.35, 0.7, 1.05]) k.cyl(M.iron(), r * 1.03, r * 1.03, 0.18, 0, y * r, 0, 0, 0, 0, 18);
  return k.build();
}

// ---------- 熔岩面（裝飾：跟著時間流動的發光平面，buildStructures 加到場景） ----------
let LAVA_TEX = null;
function lavaTexture() {
  if (LAVA_TEX) return LAVA_TEX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#ff4a08';
  c.fillRect(0, 0, 256, 256);
  // 冷卻的硬殼（暗色的斑塊）與亮的裂縫
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 140; i++) {
    c.fillStyle = `rgba(40,12,6,${0.35 + r() * 0.45})`;
    c.beginPath();
    c.ellipse(r() * 256, r() * 256, 6 + r() * 26, 4 + r() * 16, r() * 3, 0, Math.PI * 2);
    c.fill();
  }
  c.strokeStyle = 'rgba(255,220,120,0.8)';
  for (let i = 0; i < 40; i++) {
    c.lineWidth = 1 + r() * 2;
    c.beginPath();
    let x = r() * 256,
      y = r() * 256;
    c.moveTo(x, y);
    for (let j = 0; j < 4; j++) c.lineTo((x += (r() - 0.5) * 40), (y += (r() - 0.5) * 40));
    c.stroke();
  }
  LAVA_TEX = new THREE.CanvasTexture(cv);
  LAVA_TEX.colorSpace = THREE.SRGBColorSpace;
  LAVA_TEX.wrapS = LAVA_TEX.wrapT = THREE.RepeatWrapping;
  return LAVA_TEX;
}
export function addLava(w) {
  const S = w.size * 3;
  const t = lavaTexture().clone();
  t.needsUpdate = true;
  t.repeat.set(S / 60, S / 60);
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: t,
    emissive: 0xff6a20,
    emissiveMap: t,
    emissiveIntensity: 1.25,
    roughness: 0.9,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(S, S), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = LAVA_Y * G;
  mesh.userData.noFade = true;
  mesh.userData.noAO = true;
  mesh.receiveShadow = false;
  // 緩慢流動
  mesh.onBeforeRender = () => {
    t.offset.x = (performance.now() * 0.000006) % 1;
    t.offset.y = (performance.now() * 0.000004) % 1;
  };
  w.scene.add(mesh);
  w.meshes.push(mesh);
  w.lavaMesh = mesh;
}

// ---------- 地形特徵的外觀（玄武岩與鏽鐵） ----------
const C = {
  deck: 0x4a3c34,
  trim: 0xd09a20,
  pillar: 0x3c3a38,
  wall: 0x5a3428,
  plat: 0x3a3230,
  rock: 0x2a2422,
};
registerFeatureStyle('volcano', C, {
  deck(w, d, thick, rotY, C) {
    const L = rotY ? d : w,
      D = rotY ? w : d;
    const k = new PK();
    k.at(0, 0, 0, 0, rotY ? -Math.PI / 2 : 0, 0, () => {
      k.ob(L, thick, D, 0, -thick / 2, 0);
      k.cb(fadeMat(C.deck, { roughness: 0.7, metalness: 0.5 }), L, thick, D, 0, -thick / 2, 0, 0, 0, 0, 0.05);
      for (const s of [-1, 1]) k.box(fadeMat(C.trim), L, 0.12, 0.12, 0, 1, s * (D / 2 - 0.15));
    });
    return k.build();
  },
  pillar(r, h, C) {
    const k = new PK().bounds(-r, -h / 2, -r, r, h / 2, r);
    k.cyl(mat(C.pillar, { roughness: 0.6, metalness: 0.5 }), r * 0.8, r, h, 0, 0, 0, 0, 0, 0, 10);
    k.cb(DETAIL.dark, r * 2.2, 0.6, r * 2.2, 0, -h / 2 + 0.3, 0, 0, 0, 0, 0.08);
    return k.build();
  },
  wall(w, h, d, C) {
    const k = new PK();
    const along = w > d,
      L = along ? w : d,
      T = along ? d : w;
    k.at(0, 0, 0, 0, along ? 0 : -Math.PI / 2, 0, () => {
      k.ob(L, h, T + 0.05);
      k.cb(fadeMat(C.wall, { roughness: 0.95 }), L, h, T, 0, 0, 0, 0, 0, 0, 0.12);
      k.box(DETAIL.dark, L + 0.04, 0.3, T + 0.1, 0, h / 2 - 0.15, 0);
    });
    return k.build();
  },
  platform(w, h, d, C) {
    const k = new PK().bounds(-w / 2, 0, -d / 2, w / 2, h, d / 2);
    k.cb(fadeMat(C.plat, { roughness: 1 }), w, h, d, 0, h / 2, 0, 0, 0, 0, 0.3);
    k.box(glow(LAVA_COL, 0.8), w * 0.5, 0.06, 0.4, 0, h + 0.03, 0);
    return k.build();
  },
  ramp(rw, rd, C) {
    const along = rw >= rd;
    const L = along ? rw : rd,
      D = along ? rd : rw;
    const k = new PK().ob(rw, 0.35, rd);
    k.at(0, 0, 0, 0, along ? 0 : Math.PI / 2, 0, () => {
      k.cb(mat(C.deck, { roughness: 0.7, metalness: 0.4 }), L, 0.35, D, 0, 0, 0, 0, 0, 0, 0.05);
    });
    return k.build();
  },
  tunnel(C) {
    const k = new PK();
    k.cb(mat(C.rock, { roughness: 1 }), 24, 14, 10, 0, 5, -6, 0, 0, 0, 1.6);
    k.cb(mat(0x4a3c34, { roughness: 0.9 }), 16, 10, 2.5, 0, 5, 0, 0, 0, 0, 0.15);
    k.box(HOLE, 10, 7.5, 2.8, 0, 3.75, 0);
    k.box(glow(0xff8030, 0.9), 10.6, 0.4, 2.9, 0, 7.8, 0);
    return k.build();
  },
});

// ---------- 地形：玄武岩台地＋蜿蜒的熔岩河 ----------
// 熔岩河的強度（0～1，1＝河的中央）：給地形與 World.offLimits 共用
function lavaChan(w, x, z) {
  const xo = x / G,
    zo = z / G;
  const r = Math.abs(w.noise(xo * 0.009 + 31.7, zo * 0.009 - 17.3) - 0.5);
  return clamp(1 - r / 0.055, 0, 1);
}
function planTerrain(w) {
  const n = w.noise,
    n2 = w.noise2;
  return (x, z) => {
    const xo = x / G,
      zo = z / G;
    const base = (n(xo * 0.02, zo * 0.02) - 0.5) * 7 + (n2(xo * 0.09, zo * 0.09) - 0.5) * 1.4;
    // 台地：高的地方壓平成階梯
    let h = 1.6 + base * 0.7;
    if (h > 3) h = 3 + (h - 3) * 0.35;
    const ch = lavaChan(w, x, z);
    h = h * (1 - ch) + (LAVA_Y - 1.4) * ch;
    return h * G;
  };
}

function buildStructures(w) {
  addLava(w);
  // 熔爐塔 1～2 座、廠房 1～2 棟、冷卻水槽群
  for (let k = w.cnt(1, 2); k > 0; k--) {
    const r = SMELTER.r + 2;
    const spot = w.findSpot([-r, r, -r, r + 6], 1.5 * G, 40);
    if (!spot) continue;
    const g = buildSmelter();
    g.position.y = spot.lo;
    w.addBig(g, spot, [
      { box: [-13, 13, -13, 13], y: spot.lo, top: spot.lo + 4 },
      { c: [0, 0], r: SMELTER.r, h: SMELTER.h },
    ]);
    w.reserve(spot.aabb[0], spot.aabb[1], spot.aabb[2], spot.aabb[3]);
  }
  for (let k = w.cnt(1, 2); k > 0; k--) {
    const fw = rnd(40, 56),
      fd = rnd(30, 40),
      fh = rnd(18, 24);
    const spot = w.findSpot([-fw / 2, fw / 2, -fd / 2 - 10, fd / 2], 1.5 * G, 40);
    if (!spot) continue;
    const g = buildFoundryHall(fw, fh, fd);
    g.position.y = spot.lo;
    const t = 1.2;
    w.addBig(g, spot, [
      { box: [-fw / 2, fw / 2, fd / 2 - t, fd / 2], y: spot.lo, top: spot.lo + fh },
      { box: [-fw / 2, -fw / 2 + t, -fd / 2, fd / 2], y: spot.lo, top: spot.lo + fh },
      { box: [fw / 2 - t, fw / 2, -fd / 2, fd / 2], y: spot.lo, top: spot.lo + fh },
      { box: [-fw / 2, fw / 2, -fd / 2, fd / 2], y: spot.lo + fh - 1.4, top: spot.lo + fh, deck: true },
    ]);
    w.reserve(spot.aabb[0], spot.aabb[1], spot.aabb[2], spot.aabb[3]);
  }
}
function buildProps(w) {
  w.scatter(w.cnt(6, 10), 8, (x, z, y) => {
    const g = buildSlagCart();
    const rot = RNG() < 0.5;
    if (rot) g.rotation.y = Math.PI / 2;
    const [a, h, b] = SLAG_CART;
    w.addSmall(g, x, y, z, { w: rot ? b : a, h, d: rot ? a : b }, 'slagcart', 1600, 0x6a3a24);
  });
  w.scatter(w.cnt(8, 12), 10, (x, z, y) => {
    const s = rnd(1, 2.2);
    const g = buildOreHeap(s);
    g.rotation.y = rnd(0, 6.28);
    w.addSmall(g, x, y - 0.3, z, { r: 3 * s, h: 2.4 * s }, 'oreheap', 2200 * s, 0x2e2826);
  });
  w.scatter(w.cnt(6, 9), 6, (x, z, y) => {
    w.addSmall(buildHeatVent(), x, y - 0.2, z, { r: HEAT_VENT.r, h: HEAT_VENT.h }, 'vent', 1200, 0x3c3a38);
  });
  w.scatter(w.cnt(3, 5), 14, (x, z, y) => {
    const r = rnd(3.5, 5.5);
    w.addSmall(buildCoolTank(r), x, y - 0.1, z, { r: r * 1.02, h: 1.4 * r }, 'cooltank', 4000, 0x8a8e92);
  });
}
// 熔岩的地方不能放東西、不生成（World.offLimits）
export function volcanoOff(w, x, z) {
  return w.terrainHeight(x, z) < (LAVA_Y + 0.6) * G || lavaChan(w, x, z) > 0.15;
}

export const VOLCANO = {
  name: '火山熔爐帶',
  ground: 0x3a302c,
  slope: 0x2a2220,
  rock: 0x1e1a18,
  fog: 0x5a3a2c,
  sky: 0x7a4a34,
  sun: 0xffc48a,
  amb: 0x6a4434,
  container: 0x5a4a42,
  container2: 0x8a4a28,
  hasRocks: false,
  weather: 'ash',
  props: 'volcano',
  fogNear: 40,
  fogFar: 190,
  sunI: 0.75,
  hemiI: 0.8,
  lava: { y: LAVA_Y, dps: 0.05 }, // 熔岩：每秒扣最大 AP 的比例（game/lava.js）
  featureKinds: ['bunkers', 'platforms', 'overpass'],
  corridor: { p: 0.55, kinds: ['road', 'rail'] },
  bossBan: ['worm', 'train'],
  planTerrain,
  buildStructures,
  buildProps,
  offLimits: volcanoOff,
  propNames: { slagcart: '熔渣車', oreheap: '礦石堆', vent: '地熱噴氣口', cooltank: '冷卻水槽' },
  catalog: [
    [
      'smelter',
      '熔爐塔',
      '火山熔爐帶的地標；高約 62 m、底座 26 m 見方，出鐵口與流槽發光，不可破壞',
      () => buildSmelter(),
    ],
    [
      'foundry_hall',
      '熔爐廠房',
      '火山熔爐帶；寬 40–56、深 30–40、高 18–24 m，前方（−Z）開口、屋頂可站，不可破壞；GLB 依尺寸縮放',
      () => buildFoundryHall(48, 22, 36),
    ],
    [
      'slag_cart',
      '熔渣車',
      '火山熔爐帶的雜物；現實尺寸 6 × 3.2 × 3.4 m（沿 X），可破壞',
      () => buildSlagCart(),
    ],
    ['ore_heap', '礦石堆', '火山熔爐帶；6 × 3 m 的 1～2.2 倍，可破壞', () => buildOreHeap(1)],
    ['heat_vent', '地熱噴氣口', '火山熔爐帶；直徑約 3、高 6 m，可破壞', () => buildHeatVent()],
    ['cool_tank', '冷卻水槽', '火山熔爐帶；半徑 3.5–5.5 m，可破壞；GLB 依尺寸縮放', () => buildCoolTank(4)],
  ],
};
