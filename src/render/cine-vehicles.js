// 過場的載具（docs/cine-redesign-design.md 第十一節「載具 v2」）：真實尺寸（公尺），原點＝底面中心、車頭一律朝 +Z。
// buildCineVeh(key, o) → { group, wheels: [{ o, r }], parts: { fork 貨叉的升降群組… }, len 車長 }
//   truck 箱型貨車（會轉的車輪）、semi 聯結車、car 轎車、bus 巴士、forklift 堆高機（貨叉會升降、有駕駛）、
//   pallet 棧板貨物（堆高機叉的那一份）、tank 坦克（敵方的戰鬥載具）
// 地圖的掩體車輛（world/cover-models.js）車頭朝 −Z，這裡轉 180°；它們的車輪是合併的（遠景用），近景的動作用 truck／forklift。
import { P, bakeAll, fine, gBox } from './geometry.js';
import { D } from './detail.js';
import { vExhaust, vLamp, vLight, vMirror, vWheel } from './vehicle-kit.js';
import { buildTransport } from './extra-models.js';
import { buildVehicle } from './vehicle-models.js';
import { PALETTES } from './materials.js';
import { tagStyle } from './style/shader.js';
import { buildBus, buildCar, buildSemiTruck } from '../world/cover-models.js';

const HP = Math.PI / 2;
const M = (c, o) =>
  new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, metalness: 0.25 }, o || {}));
let MATS = null;
function mats() {
  if (MATS) return MATS;
  const lamp = M(0xfff0c0, { emissive: 0xffe0a0, emissiveIntensity: 0.9 });
  const amber = M(0xffa020, { emissive: 0xff8a10, emissiveIntensity: 0.9 });
  MATS = {
    yellow: M(0xe0a818, { roughness: 0.5, metalness: 0.3 }),
    dark: M(0x26292d),
    metal: M(0x8a8f96, { metalness: 0.6, roughness: 0.4 }),
    steel: M(0x4a4e54, { metalness: 0.5, roughness: 0.5 }),
    tire: M(0x1c1e20, { roughness: 0.9, metalness: 0.05 }),
    wood: M(0x9a7448, { roughness: 0.85, metalness: 0 }),
    card: M(0xb89060, { roughness: 0.9, metalness: 0 }),
    wrap: M(0xc8d4dc, { roughness: 0.35, metalness: 0.1 }),
    hivis: M(0xf07a18, { roughness: 0.7, metalness: 0 }),
    cloth: M(0x2c3440, { roughness: 0.85, metalness: 0 }),
    skin: M(0xb08060, { roughness: 0.8, metalness: 0 }),
    helmet: M(0xf2c230, { roughness: 0.5, metalness: 0.1 }),
    glass: M(0x304048, { roughness: 0.15, metalness: 0.6 }),
    lamp,
    amber,
  };
  return MATS;
}
// 車輪零件要的材質名稱
const wheelM = (T) => ({
  joint: T.dark,
  rubber: T.tire,
  gun: T.metal,
  lens: T.glass,
  sub: T.dark,
  main3: T.dark,
});

// 坐著的駕駛（遠看的剪影就好：反光背心、安全帽）；原點＝座椅的坐面
function driver(n, T, x, y, z) {
  P(n, D.box(0.22, 0.42, 0.34, 0.05), T.cloth, x, y + 0.04, z + 0.22); // 大腿
  P(n, D.box(0.42, 0.5, 0.26, 0.06), T.hivis, x, y + 0.33, z - 0.02); // 上身
  P(n, D.box(0.18, 0.1, 0.18, 0.03), T.skin, x, y + 0.63, z - 0.02); // 脖子
  P(
    n,
    D.lathe(
      [
        [0, -0.11],
        [0.09, -0.1],
        [0.11, 0],
        [0.09, 0.09],
        [0, 0.12],
      ],
      10,
    ),
    T.skin,
    x,
    y + 0.75,
    z,
  );
  P(
    n,
    D.lathe(
      [
        [0, -0.02],
        [0.13, -0.02],
        [0.13, 0.03],
        [0.1, 0.1],
        [0, 0.13],
      ],
      12,
    ),
    T.helmet,
    x,
    y + 0.82,
    z,
  );
  for (const s of [-1, 1]) P(n, D.box(0.1, 0.1, 0.4, 0.03), T.hivis, x + s * 0.24, y + 0.38, z + 0.18); // 手臂往前握方向盤
}

// ---------- 堆高機（3 噸級：長 2.6 m（不含貨叉）、寬 1.2 m、護頂架高 2.15 m、門架 2.3 m） ----------
function buildForklift() {
  const T = mats(),
    WM = wheelM(T);
  const g = new THREE.Group();
  const wheels = [];
  // 車身：側面輪廓擠出（後面的配重往上翹、前面低），沿 X 擠出 1.1 m
  P(
    g,
    D.extrude(
      [
        [-1.25, 0.18],
        [0.75, 0.18],
        [0.85, 0.3],
        [0.85, 0.72],
        [0.35, 0.78],
        [-0.55, 0.78],
        [-0.95, 1.05],
        [-1.3, 1.05],
        [-1.38, 0.6],
      ],
      1.1,
      0.04,
    ),
    T.yellow,
    0.55,
    0,
    0,
    0,
    -HP,
    0,
  );
  // 配重（後面的鑄鐵塊，圓角）、後方的牽引孔與尾燈
  P(g, D.box(1.16, 0.62, 0.42, 0.12), T.steel, 0, 0.6, -1.12);
  P(g, D.cyl(0.07, 0.07, 0.12, 10), T.dark, 0, 0.42, -1.35, HP);
  for (const s of [-1, 1]) vLamp(g, WM, T.amber, s * 0.45, 0.95, -1.36, 0.14, 0.08, Math.PI);
  // 座椅、儀表、方向盤
  P(g, D.box(0.5, 0.12, 0.46, 0.05), T.dark, 0, 0.9, -0.42);
  P(g, D.box(0.5, 0.5, 0.1, 0.05), T.dark, 0, 1.18, -0.66);
  P(g, D.box(0.6, 0.32, 0.3, 0.05), T.yellow, 0, 0.95, 0.32);
  P(g, D.cyl(0.03, 0.03, 0.38, 6), T.dark, 0, 1.18, 0.22, -0.6);
  P(
    g,
    D.lathe(
      [
        [0.14, -0.015],
        [0.16, 0],
        [0.14, 0.015],
      ],
      16,
    ),
    T.dark,
    0,
    1.34,
    0.12,
    -0.6 + HP,
  );
  driver(g, T, 0, 0.96, -0.42);
  // 護頂架：四根柱（後面兩根往後斜）＋頂上的格柵
  for (const s of [-1, 1]) {
    P(g, D.box(0.07, 1.45, 0.07, 0.02), T.dark, s * 0.5, 1.48, 0.42, -0.08);
    P(g, D.box(0.07, 1.3, 0.07, 0.02), T.dark, s * 0.5, 1.5, -0.86, 0.12);
  }
  P(g, D.box(1.1, 0.06, 1.4, 0.02), T.dark, 0, 2.17, -0.2);
  fine(() => {
    for (let i = 0; i < 6; i++) P(g, gBox(1.0, 0.04, 0.05), T.steel, 0, 2.2, -0.82 + i * 0.25);
  });
  // 車輪：前輪大（驅動）、後輪小（轉向）
  for (const s of [-1, 1]) {
    const w = vWheel(g, WM, s * 0.5, 0.34, 0.5, 0.34, 0.26, { lugs: 10, depth: 0.04 });
    if (w) wheels.push({ o: w, r: 0.34 });
    const w2 = vWheel(g, WM, s * 0.48, 0.27, -0.85, 0.27, 0.2, { lugs: 8, depth: 0.03 });
    if (w2) wheels.push({ o: w2, r: 0.27 });
  }
  vExhaust(g, WM, -0.5, 1.0, -0.75, 0.9);
  vMirror(g, WM, 0.58, 1.95, 0.4, 0.12);
  // 門架：兩根外柱＋內柱、頂上的橫樑、液壓缸、鏈條
  for (const s of [-1, 1]) {
    P(g, D.box(0.1, 2.3, 0.14, 0.02), T.steel, s * 0.4, 1.3, 0.98);
    P(g, D.box(0.08, 2.1, 0.1, 0.02), T.metal, s * 0.3, 1.25, 1.04);
  }
  P(g, D.box(0.9, 0.12, 0.16, 0.02), T.steel, 0, 2.42, 0.98);
  P(g, D.box(0.9, 0.12, 0.16, 0.02), T.steel, 0, 0.3, 0.98);
  P(g, D.cyl(0.06, 0.06, 1.6, 10), T.metal, 0, 1.0, 0.9);
  fine(() => {
    for (const s of [-1, 1]) P(g, gBox(0.03, 2.0, 0.03), T.dark, s * 0.15, 1.25, 1.08);
  });
  // 貨叉架（會升降）：背板＋兩支貨叉（往 +Z 伸 1.1 m）；原點＝貨叉的上表面、背板的前面
  const fork = new THREE.Group();
  fork.position.set(0, 0.12, 1.12);
  g.add(fork);
  P(fork, D.box(1.0, 0.5, 0.08, 0.02), T.dark, 0, 0.24, -0.04);
  fine(() => {
    for (let i = 0; i < 4; i++) P(fork, gBox(0.96, 0.03, 0.03), T.steel, 0, 0.06 + i * 0.13, 0.01);
  });
  for (const s of [-1, 1]) {
    P(fork, D.box(0.12, 0.05, 1.1, 0.01), T.steel, s * 0.3, -0.025, 0.55);
    P(fork, D.box(0.12, 0.5, 0.05, 0.01), T.steel, s * 0.3, 0.24, 0.0);
  }
  // 頭燈（門架上）與頂上的警示燈
  for (const s of [-1, 1]) vLight(g, WM, T.lamp, s * 0.46, 2.2, 1.06, 0.07);
  P(g, D.cyl(0.07, 0.08, 0.1, 10), T.amber, 0.4, 2.25, -0.75);
  bakeAll(g, { tint: { ao: 0.85, grime: 0.3, gh: 0.6 }, cache: 'cineveh:forklift' });
  return { group: g, wheels, parts: { fork }, len: 3.6 };
}

// ---------- 棧板貨物（1.2 × 1.0 m 的木棧板＋紙箱，外面包收縮膜；高約 1.1 m） ----------
// 原點＝棧板的底面中心（堆高機的貨叉插進棧板的空隙：叉的上表面＝棧板底下 0.02 m）
function buildPallet(seed = 0) {
  const T = mats();
  const g = new THREE.Group();
  // 棧板：三根長的底木、上面的板條
  for (const x of [-0.5, 0, 0.5]) P(g, D.box(0.1, 0.1, 1.2, 0.01), T.wood, x, 0.05, 0);
  for (let i = 0; i < 5; i++) P(g, D.box(1.0, 0.025, 0.14, 0.005), T.wood, 0, 0.115, -0.5 + i * 0.25);
  // 紙箱：2×2×2 疊（依 seed 少一兩個），外面包膜的那一份是半透明的外殼
  const h = 0.32;
  let k = seed;
  for (let y = 0; y < 3; y++)
    for (const x of [-0.24, 0.24])
      for (const z of [-0.29, 0.29]) {
        k = (k * 9301 + 49297) % 233280;
        if (y === 2 && k % 4 === 0) continue;
        P(g, D.box(0.46, h - 0.01, 0.56, 0.02), T.card, x, 0.13 + h / 2 + y * h, z);
      }
  const wrap = T.wrap.clone();
  wrap.transparent = true;
  wrap.opacity = 0.35;
  wrap.depthWrite = false;
  P(g, D.box(1.0, h * 3 - 0.06, 1.2, 0.06), wrap, 0, 0.13 + h * 1.5 - 0.03, 0);
  bakeAll(g, { tint: { ao: 0.8, grime: 0.2, gh: 0.5 }, cache: 'cineveh:pallet' + (seed % 3) });
  return { group: g, wheels: [], parts: {}, len: 1.2 };
}

// 掩體車輛（車頭 −Z）轉成車頭 +Z
function flip(m, len) {
  const g = new THREE.Group();
  m.rotation.y = Math.PI;
  g.add(m);
  return { group: g, wheels: [], parts: {}, len };
}

const COLORS = {
  car: [0x8a2a2a, 0x2a4a7a, 0xc8c8c8, 0x2a2a2a, 0x6a6a5a],
  bus: [0xd8b030, 0x3a6a8a, 0xe8e8e8],
};
export function buildCineVeh(key, o = {}) {
  const v = o.v || 0; // 變化（顏色等，劇本給，不用亂數）
  let r;
  if (key === 'forklift') r = buildForklift();
  else if (key === 'pallet') r = buildPallet(v);
  else if (key === 'truck') {
    const g = buildTransport('truck', 1, 0);
    r = { group: g, wheels: g.wheels || [], parts: {}, len: 9.6 };
  } else if (key === 'semi') {
    const cm = new THREE.MeshStandardMaterial({
      color: [0x2b4a8a, 0x8a2a22, 0x4a5a3a][v % 3],
      roughness: 0.6,
    });
    r = flip(buildSemiTruck(cm), 16.5);
  } else if (key === 'car') r = flip(buildCar(o.color || COLORS.car[v % COLORS.car.length]), 4.5);
  else if (key === 'bus') r = flip(buildBus(o.color || COLORS.bus[v % COLORS.bus.length]), 12);
  else if (key === 'tank') {
    const m = buildVehicle(PALETTES[o.pal || 'enemy'] || PALETTES.enemy, 1, 'tank');
    r = { group: m.group || m, wheels: [], parts: {}, len: 8 };
  } else return null;
  tagStyle(r.group);
  return r;
}
