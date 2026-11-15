// 過場的載具（docs/cine-redesign-design.md 第十一節「載具 v2」）：真實尺寸（公尺），原點＝底面中心、車頭一律朝 +Z。
// buildCineVeh(key, o) → { group, wheels: [{ o, r }], parts: { fork 貨叉的升降群組… }, len 車長 }
//   truck 箱型貨車（會轉的車輪）、semi 聯結車、car 轎車、bus 巴士、forklift 堆高機（貨叉會升降、有駕駛）、
//   pallet 棧板貨物（堆高機叉的那一份）、tank 坦克（敵方的戰鬥載具）、
//   pickup 皮卡、ambulance 救護車、jeep 吉普車、apc 裝甲運兵車、snowcat 雪地車（履帶）、tanker 油罐車（加注車）
// 地圖的掩體車輛（world/cover-models.js）車頭朝 −Z，這裡轉 180°；它們的車輪是合併的（遠景用），近景的動作用 truck／forklift。
import { P, bakeAll, fine, gBox } from './geometry.js';
import { D } from './detail.js';
import { treadMat, vCab, vExhaust, vLamp, vLight, vMirror, vTrack, vWheel } from './vehicle-kit.js';
import { buildTransport } from './extra-models.js';
import { buildVehicle } from './vehicle-models.js';
import { PALETTES } from './materials.js';
import { tagStyle } from './style/shader.js';
import { mergeRig } from './mesh-merge.js';
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
    white: M(0xcfd2d4, { roughness: 0.65, metalness: 0.1 }),
    red: M(0xc02a24, { roughness: 0.5, metalness: 0.2 }),
    olive: M(0x56603e, { roughness: 0.7, metalness: 0.2 }),
    orange: M(0xe06a18, { roughness: 0.55, metalness: 0.25 }),
    tankSteel: M(0xa8acb0, { roughness: 0.5, metalness: 0.45 }),
    // 警示燈（救護車的紅、藍）
    lightR: M(0xff3030, { emissive: 0xff2020, emissiveIntensity: 1.2 }),
    lightB: M(0x3060ff, { emissive: 0x2050ff, emissiveIntensity: 1.2 }),
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
    0, // D.extrude 已經在厚度方向置中
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

// ---------- 第一批（docs/cine-redesign-design.md 第十一節「載具 v2」）：車頭 +Z、原點＝底面中心 ----------
// 車輪：兩側各一個（zs＝前後位置；dual＝後輪雙胎）
function axles(g, WM, zs, x, R, w, wheels, dual = []) {
  for (const z of zs)
    for (const s of [-1, 1]) {
      const wh = vWheel(g, WM, s * x, R, z, R, w, { lugs: 12, depth: R * 0.08 });
      if (wh) wheels.push({ o: wh, r: R });
      if (dual.includes(z)) {
        const w2 = vWheel(g, WM, s * (x - w * 1.05), R, z, R, w * 0.95, { lugs: 12, depth: R * 0.08 });
        if (w2) wheels.push({ o: w2, r: R });
      }
    }
}
// 擋泥板（輪拱上方的板子）
function fenders(g, m, zs, x, R, w) {
  for (const z of zs)
    for (const s of [-1, 1]) P(g, D.box(w + 0.12, 0.06, R * 2.2, 0.02), m, s * x, R * 2 + 0.06, z);
}
// 正面的頭燈、方向燈、水箱護罩、保險桿（z＝車頭的面、w＝車寬、y＝燈的高度）
function nose(g, T, WM, z, w, y, grille = true) {
  for (const s of [-1, 1]) {
    vLight(g, WM, T.lamp, s * w * 0.36, y, z, 0.11, Math.PI, false);
    vLamp(g, WM, T.amber, s * w * 0.46, y - 0.12, z, 0.1, 0.08, Math.PI);
  }
  if (grille) P(g, D.box(w * 0.42, 0.3, 0.05, 0.02), T.dark, 0, y, z);
  P(g, D.box(w + 0.06, 0.22, 0.2, 0.05), T.dark, 0, y - 0.32, z + 0.06);
}
function tail(g, T, WM, z, w, y) {
  for (const s of [-1, 1]) vLamp(g, WM, T.lightR, s * w * 0.42, y, z, 0.14, 0.2, 0);
}

// 皮卡（雙門、長 5.3 m）：駕駛室＋引擎蓋＋開放的貨斗
function buildPickup(color) {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const body = M(color, { roughness: 0.4, metalness: 0.45 });
  P(g, D.box(1.5, 0.22, 5.0, 0.04), T.dark, 0, 0.55, 0);
  vCab(g, WM, -0.4, 1.4, 1.9, 0.72, 1.85, {
    body,
    glass: T.glass,
    lamp: T.lamp,
    amber: T.amber,
    steps: false,
  });
  P(g, D.box(1.88, 0.42, 1.25, 0.1), body, 0, 0.95, 2.02); // 引擎蓋
  nose(g, T, WM, 2.66, 1.88, 0.92);
  // 貨斗：底板、兩側與前板、尾門
  P(g, D.box(1.8, 0.08, 2.25, 0.02), T.dark, 0, 0.82, -1.55);
  for (const s of [-1, 1]) P(g, D.box(0.08, 0.5, 2.25, 0.02), body, s * 0.88, 1.08, -1.55);
  P(g, D.box(1.84, 0.5, 0.08, 0.02), body, 0, 1.08, -0.45);
  P(g, D.box(1.84, 0.5, 0.08, 0.02), body, 0, 1.08, -2.66);
  tail(g, T, WM, -2.72, 1.88, 1.1);
  axles(g, WM, [1.8, -1.7], 0.82, 0.4, 0.3, wheels);
  fenders(g, body, [1.8, -1.7], 0.82, 0.4, 0.3);
  bakeAll(g, { tint: { ao: 0.85, grime: 0.3, gh: 0.8 }, cache: 'cineveh:pickup' });
  return { group: g, wheels, parts: {}, len: 5.3 };
}

// 救護車（廂型，長 6.4 m）：白色車廂、紅色腰線與十字、車頂的紅藍警示燈
function buildAmbulance() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  P(g, D.box(1.6, 0.22, 6.0, 0.04), T.dark, 0, 0.55, 0);
  vCab(g, WM, 1.3, 3.15, 2.1, 0.75, 2.3, { body: T.white, glass: T.glass, lamp: T.lamp, amber: T.amber });
  P(g, D.box(2.3, 2.45, 4.4, 0.1), T.white, 0, 1.9, -0.9); // 車廂
  for (const s of [-1, 1]) {
    P(g, D.box(0.02, 0.22, 4.3, 0.005), T.red, s * 1.16, 1.45, -0.9); // 腰線
    // 十字
    P(g, D.box(0.02, 0.62, 0.2, 0.005), T.red, s * 1.16, 2.25, -1.4);
    P(g, D.box(0.02, 0.2, 0.62, 0.005), T.red, s * 1.16, 2.25, -1.4);
    P(g, D.box(0.02, 1.05, 0.03, 0.005), T.dark, s * 1.16, 1.75, 0.6); // 側門縫
  }
  // 後門（兩片）＋把手、尾燈
  P(g, D.box(0.03, 2.2, 0.03, 0.005), T.dark, 0, 1.85, -3.11);
  P(g, D.box(2.0, 0.6, 0.03, 0.005), T.glass, 0, 2.5, -3.11);
  tail(g, T, WM, -3.12, 2.3, 1.05);
  // 車頂：警示燈條（紅藍交錯）、空調箱
  P(g, D.box(1.6, 0.1, 0.3, 0.03), T.dark, 0, 2.38, 2.1);
  for (let i = 0; i < 4; i++)
    P(g, D.box(0.36, 0.14, 0.26, 0.04), i % 2 ? T.lightB : T.lightR, -0.6 + i * 0.4, 2.5, 2.1);
  P(g, D.box(0.9, 0.25, 0.9, 0.06), T.white, 0, 3.25, -1.6);
  for (const z of [0.85, -3.05])
    for (const s of [-1, 1]) vLamp(g, WM, T.lightR, s * 1.0, 3.0, z, 0.18, 0.14, z > 0 ? Math.PI : 0);
  axles(g, WM, [2.35, -1.9], 0.9, 0.42, 0.3, wheels, [-1.9]);
  bakeAll(g, { tint: { ao: 0.85, grime: 0.3, gh: 0.8 }, cache: 'cineveh:ambulance' });
  return { group: g, wheels, parts: {}, len: 6.4 };
}

// 吉普車（軍用、敞篷，長 4.3 m）：方形車身、平的引擎蓋、擋風框、防滾架、後面的備胎
function buildJeep(color = 0x56603e) {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const body = M(color, { roughness: 0.7, metalness: 0.2 });
  P(g, D.box(1.45, 0.2, 4.0, 0.04), T.dark, 0, 0.55, 0);
  P(g, D.box(1.75, 0.75, 2.7, 0.06), body, 0, 1.0, -0.65); // 車身的浴缸
  P(g, D.box(1.6, 0.5, 1.45, 0.08), body, 0, 1.1, 1.45); // 引擎蓋
  nose(g, T, WM, 2.2, 1.6, 1.0, false);
  for (let i = 0; i < 7; i++) P(g, D.box(0.08, 0.36, 0.04, 0.01), T.dark, -0.42 + i * 0.14, 1.05, 2.19); // 直條的水箱護罩
  // 擋風框（玻璃＋框）、座椅、方向盤
  P(g, D.box(1.6, 0.06, 0.06, 0.02), T.dark, 0, 1.88, 0.72);
  for (const s of [-1, 1]) P(g, D.box(0.06, 0.55, 0.06, 0.02), T.dark, s * 0.78, 1.6, 0.72);
  P(g, D.box(1.5, 0.5, 0.02, 0.01), T.glass, 0, 1.6, 0.72);
  for (const s of [-1, 1]) {
    P(g, D.box(0.5, 0.12, 0.5, 0.04), T.dark, s * 0.4, 1.12, -0.05);
    P(g, D.box(0.5, 0.55, 0.1, 0.04), T.dark, s * 0.4, 1.42, -0.32);
  }
  P(
    g,
    D.lathe(
      [
        [0.17, -0.015],
        [0.19, 0],
        [0.17, 0.015],
      ],
      16,
    ),
    T.dark,
    0.4,
    1.45,
    0.45,
    1.0,
  );
  // 防滾架（兩根立柱＋橫桿）
  for (const s of [-1, 1]) P(g, D.cyl(0.04, 0.04, 0.9, 8), T.dark, s * 0.8, 1.8, -0.7);
  P(g, D.cyl(0.04, 0.04, 1.6, 8), T.dark, 0, 2.25, -0.7, 0, 0, HP);
  // 備胎（立在車尾）
  const sp = new THREE.Group();
  sp.position.set(0, 1.05, -2.1);
  sp.rotation.y = HP;
  g.add(sp);
  vWheel(sp, WM, 0, 0, 0, 0.4, 0.28, { lugs: 12 });
  tail(g, T, WM, -2.01, 1.7, 1.0);
  axles(g, WM, [1.4, -1.3], 0.82, 0.42, 0.32, wheels);
  fenders(g, body, [1.4, -1.3], 0.82, 0.42, 0.32);
  bakeAll(g, { tint: { ao: 0.85, grime: 0.3, gh: 0.8 }, cache: 'cineveh:jeep' });
  return { group: g, wheels, parts: {}, len: 4.3 };
}

// 裝甲運兵車（8 輪，長 7.4 m）：斜面車頭的車體、小砲塔、艙門、潛望鏡、側面的裙板
function buildApc(color = 0x56603e) {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const body = M(color, { roughness: 0.75, metalness: 0.25 });
  // 車體：側面輪廓擠出（u＝往前、y），寬 2.6 m
  P(
    g,
    D.extrude(
      [
        [-3.6, 0.95],
        [2.9, 0.95],
        [3.7, 1.35],
        [3.0, 2.15],
        [-3.4, 2.2],
        [-3.7, 1.7],
      ],
      2.6,
      0.06,
    ),
    body,
    0,
    0,
    0,
    0,
    -HP,
    0,
  );
  // 砲塔：底座、扁的塔身、砲管、同軸機槍
  P(g, D.cyl(0.8, 0.85, 0.2, 18, 0.03), body, 0, 2.3, 0.4);
  P(
    g,
    D.lathe(
      [
        [0, 0],
        [0.75, 0],
        [0.62, 0.42],
        [0, 0.45],
      ],
      14,
    ),
    body,
    0,
    2.4,
    0.4,
  );
  P(g, D.cyl(0.07, 0.07, 1.9, 10), T.dark, 0, 2.6, 1.95, HP);
  P(g, D.cyl(0.04, 0.04, 0.6, 8), T.dark, 0.25, 2.6, 1.2, HP);
  // 艙門、潛望鏡、天線
  for (const z of [-1.4, -2.5]) P(g, D.cyl(0.32, 0.32, 0.06, 14), T.dark, 0, 2.23, z);
  for (const x of [-0.6, 0.6]) P(g, D.box(0.18, 0.12, 0.12, 0.02), T.glass, x, 2.25, 2.4);
  P(g, D.cyl(0.015, 0.01, 1.6, 6), T.dark, -1.0, 3.0, -2.8);
  // 側面：裙板、工具箱、後門
  for (const s of [-1, 1]) {
    P(g, D.box(0.05, 0.3, 6.4, 0.02), T.dark, s * 1.36, 1.38, 0);
    P(g, D.box(0.2, 0.3, 1.0, 0.03), T.dark, s * 1.42, 1.75, -1.6);
  }
  P(g, D.box(1.2, 1.1, 0.04, 0.02), T.dark, 0, 1.4, -3.72);
  for (const s of [-1, 1]) vLight(g, WM, T.lamp, s * 0.9, 1.75, 3.3, 0.1, Math.PI, true);
  tail(g, T, WM, -3.72, 2.4, 1.9);
  axles(g, WM, [2.3, 0.8, -0.8, -2.3], 1.42, 0.58, 0.42, wheels);
  bakeAll(g, { tint: { ao: 0.85, grime: 0.3, gh: 0.8 }, cache: 'cineveh:apc' });
  return { group: g, wheels, parts: {}, len: 7.4 };
}

// 雪地車（履帶，長 5.4 m）：橘色的駕駛艙、前面的推雪鏟、車頂燈、後面的貨架
function buildSnowcat() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group();
  const wheels = [];
  // 履帶（vTrack 的前方是 −Z：整個履帶群組轉 180°）
  const tr = new THREE.Group();
  tr.rotation.y = Math.PI;
  g.add(tr);
  const tread = treadMat(WM);
  for (const s of [-1, 1]) {
    const r = vTrack(tr, WM, s * 1.05, 0, 4.8, 1.0, 0.8, 5, tread);
    for (const w of r.wheels) wheels.push({ o: w.o, r: -w.r }); // 轉了 180°：往前走時反方向轉
  }
  P(g, D.box(1.4, 0.3, 4.6, 0.04), T.dark, 0, 0.95, 0);
  // 駕駛艙：車身、大片的窗、車頂
  P(g, D.box(2.1, 0.9, 2.6, 0.08), T.orange, 0, 1.55, 0.6);
  P(g, D.box(2.0, 0.85, 2.3, 0.06), T.orange, 0, 2.4, 0.5);
  for (const s of [-1, 1]) P(g, D.box(0.02, 0.62, 1.9, 0.01), T.glass, s * 1.01, 2.42, 0.55);
  P(g, D.box(1.8, 0.62, 0.02, 0.01), T.glass, 0, 2.42, 1.66);
  P(g, D.box(2.06, 0.08, 2.4, 0.03), T.dark, 0, 2.86, 0.5);
  for (let i = 0; i < 4; i++) vLight(g, WM, T.lamp, -0.6 + i * 0.4, 2.98, 1.6, 0.08, Math.PI, false);
  // 推雪鏟（彎的板＋兩支臂）
  P(
    g,
    D.extrude(
      [
        [0, 0],
        [0.1, 0],
        [0.45, 0.9],
        [0.32, 0.95],
      ],
      2.7,
      0.02,
    ),
    T.orange,
    0,
    0.15,
    2.65,
    0,
    -HP,
    0,
  );
  for (const s of [-1, 1]) P(g, D.box(0.1, 0.12, 0.8, 0.02), T.dark, s * 0.6, 0.7, 2.3);
  // 後面的貨架
  P(g, D.box(2.0, 0.08, 1.6, 0.02), T.dark, 0, 1.45, -1.6);
  for (const s of [-1, 1]) P(g, D.box(0.05, 0.4, 1.6, 0.01), T.dark, s * 0.98, 1.68, -1.6);
  P(g, D.box(0.9, 0.5, 0.7, 0.04), T.olive, -0.4, 1.74, -1.5);
  bakeAll(g, { tint: { ao: 0.85, grime: 0.3, gh: 0.8 }, cache: 'cineveh:snowcat' });
  return { group: g, wheels, parts: {}, len: 5.4 };
}

// 油罐車（加注車，長 9.6 m）：駕駛室＋圓筒形的油罐（鋼）、罐頂的走道與欄杆、後面的管線捲盤、危險品標示
function buildTanker() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  P(g, D.box(1.5, 0.25, 9.0, 0.04), T.dark, 0, 0.62, 0);
  vCab(g, WM, 2.7, 4.75, 2.4, 0.85, 2.85, { body: T.red, glass: T.glass, lamp: T.lamp, amber: T.amber });
  // 油罐：圓筒＋兩端的半球蓋＋固定帶
  const L = 6.4,
    z0 = -0.75;
  P(g, D.cyl(1.12, 1.12, L, 24, 0.02), T.tankSteel, 0, 2.0, z0, HP);
  for (const sg of [-1, 1])
    P(
      g,
      D.lathe(
        [
          [0, 0],
          [1.12, 0],
          [1.0, 0.25],
          [0.55, 0.42],
          [0, 0.46],
        ],
        24,
      ),
      T.tankSteel,
      0,
      2.0,
      z0 + (sg * L) / 2,
      sg * HP,
    );
  for (let i = 0; i < 4; i++)
    P(g, D.cyl(1.15, 1.15, 0.1, 24), T.dark, 0, 2.0, z0 - L / 2 + 0.6 + (i * (L - 1.2)) / 3, HP);
  // 罐頂：走道、欄杆、人孔
  P(g, D.box(0.6, 0.05, L - 0.6, 0.01), T.dark, 0, 3.16, z0);
  for (const s of [-1, 1]) P(g, D.cyl(0.02, 0.02, L - 0.6, 6), T.dark, s * 0.32, 3.55, z0, HP);
  for (let i = 0; i < 3; i++) P(g, D.cyl(0.25, 0.25, 0.12, 14), T.dark, 0, 3.2, z0 - 2 + i * 2);
  // 後面：管線捲盤、爬梯、危險品的菱形標示、尾燈
  P(g, D.cyl(0.38, 0.38, 0.9, 16), T.dark, 0, 1.0, -4.45, 0, 0, HP);
  for (let i = 0; i < 6; i++) P(g, gBox(0.5, 0.04, 0.04), T.dark, 0.6, 1.0 + i * 0.35, -4.2);
  for (const s of [-1, 1]) P(g, D.box(0.02, 0.5, 0.5, 0.005), T.orange, s * 1.14, 2.0, z0 - 1.5, Math.PI / 4);
  tail(g, T, WM, -4.6, 2.2, 1.05);
  axles(g, WM, [3.75, -2.4, -3.6], 0.95, 0.52, 0.34, wheels, [-2.4, -3.6]);
  fenders(g, T.dark, [-2.4, -3.6], 0.95, 0.52, 0.34);
  bakeAll(g, { tint: { ao: 0.85, grime: 0.3, gh: 0.8 }, cache: 'cineveh:tanker' });
  return { group: g, wheels, parts: {}, len: 9.6 };
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
  else if (key === 'pickup') r = buildPickup(o.color || [0x8a2a22, 0xd8d8d0, 0x2a4a6a, 0x4a4a42][v % 4]);
  else if (key === 'ambulance') r = buildAmbulance();
  else if (key === 'jeep') r = buildJeep(o.color);
  else if (key === 'apc') r = buildApc(o.color);
  else if (key === 'snowcat') r = buildSnowcat();
  else if (key === 'tanker') r = buildTanker();
  else if (key === 'tank') {
    const m = buildVehicle(PALETTES[o.pal || 'enemy'] || PALETTES.enemy, 1, 'tank');
    r = { group: m.group || m, wheels: [], parts: {}, len: 8 };
  } else return null;
  // 靜態的網格依材質合併（rig 參照到的車輪、貨叉照舊獨立，render/mesh-merge.js），過場裡車一多時繪製次數才不會爆
  mergeRig(r);
  tagStyle(r.group);
  return r;
}
