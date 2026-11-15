// 過場與地圖的載具：第五批（地圖上會動的載具第 3 期新增的車種，docs/map-vehicles-design.md）。規則同 render/cine-vehicles.js：
// 真實尺寸（公尺）、原點＝底面中心、車頭 +Z、照 docs/model-detail.md 的三層細節。會動的部件放在 parts：
//   firetruck 消防車（parts.lbR／lbB 車頂的紅藍警示燈，閃爍時輪流顯示）、police 警車（parts.lbR／lbB）、
//   moto 越野機車（騎士；轉彎時整台傾斜由地圖的載具 world/map-veh.js 處理）
// 由 render/cine-vehicles.js 的 buildCineVeh 分派（這裡只匯出建模函式）。
import { P, bakeAll, fine } from './geometry.js';
import { D } from './detail.js';
import { vCab, vExhaust, vLamp, vLight, vWheel } from './vehicle-kit.js';
import * as K from './dev-kit.js';
import {
  HP,
  M,
  axles,
  door,
  fenders,
  markers,
  mats,
  mudflaps,
  plate,
  tail,
  underbody,
  wheelM,
  wipers,
} from './cine-vehicles.js';

const TINT = { ao: 0.85, grime: 0.3, gh: 0.8 };

// 車頂的警示燈條：底座＋左紅右藍（parts.lbR／lbB 是兩組燈，閃爍時輪流顯示）
function lightbar(g, T, y, z, w) {
  K.bx(g, T.dark, w + 0.08, 0.08, 0.32, 0, y, z, 0, 0, 0, 0.02);
  const lbR = new THREE.Group(),
    lbB = new THREE.Group();
  g.add(lbR, lbB);
  K.bx(lbR, T.lightR, w / 2 - 0.06, 0.12, 0.26, -w / 4, y + 0.1, z, 0, 0, 0, 0.02);
  K.bx(lbB, T.lightB, w / 2 - 0.06, 0.12, 0.26, w / 4, y + 0.1, z, 0, 0, 0, 0.02);
  K.bx(g, T.white, 0.12, 0.12, 0.26, 0, y + 0.1, z, 0, 0, 0, 0.02);
  return { lbR, lbB };
}

// ---------- 消防車（2 軸、長 9.4 m）：紅色的駕駛室（白色飾條）、器材箱（捲門）、車頂的雲梯（轉台在後方）、
//            水帶捲盤、側面的泵浦操作盤、車頂的警示燈條 ----------
export function buildFireTruck() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const red = M(0xb02420, { roughness: 0.55, metalness: 0.25 });
  P(g, D.box(1.5, 0.3, 8.8, 0.04), T.dark, 0, 0.7, -0.1);
  vCab(g, WM, 2.7, 4.6, 2.45, 0.85, 2.95, { body: red, glass: T.glass, lamp: T.lamp, amber: T.amber });
  K.bx(g, T.white, 2.47, 0.12, 1.9, 0, 1.55, 3.65, 0, 0, 0, 0.01); // 白色飾條
  const L = lightbar(g, T, 3.86, 3.9, 1.6);
  // 器材箱：左右各三格的捲門（中層的框；小細節的橫條與把手）、箱頂的平台
  P(g, D.box(2.45, 2.0, 6.0, 0.06), red, 0, 1.95, -0.85);
  for (const s of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const z = 1.3 - i * 1.95;
      K.bx(g, T.metal, 0.02, 1.4, 1.7, s * 1.235, 2.0, z, 0, 0, 0, 0.005);
      fine(() => {
        for (let k = 0; k < 7; k++)
          K.bx(g, T.dark, 0.01, 0.02, 1.68, s * 1.25, 1.42 + k * 0.2, z, 0, 0, 0, 0);
        K.handle(g, T.dark, 0.3, s * 1.26, 1.35, z, s * HP);
      });
    }
  K.bx(g, T.white, 2.47, 0.1, 6.0, 0, 1.15, -0.85, 0, 0, 0, 0.01);
  P(g, D.box(2.3, 0.08, 5.6, 0.02), T.dark, 0, 2.99, -0.95);
  // 雲梯：轉台（後）→ 兩支側軌＋梯級，往前平放在箱頂上
  K.cy(g, T.dark, 0.7, 0.3, 0, 3.15, -3.0, 20);
  const lad = new THREE.Group();
  lad.position.set(0, 3.45, -3.0);
  lad.rotation.x = -0.04;
  g.add(lad);
  for (const s of [-1, 1]) K.bx(lad, T.metal, 0.08, 0.22, 7.2, s * 0.42, 0, 3.4, 0, 0, 0, 0.01);
  for (let i = 0; i < 14; i++) K.bx(lad, T.metal, 0.84, 0.05, 0.05, 0, -0.05, 0.2 + i * 0.5, 0, 0, 0, 0);
  K.bx(lad, T.dark, 0.6, 0.5, 0.6, 0, -0.1, -0.1, 0, 0, 0, 0.04); // 雲梯的基座
  // 水帶捲盤（後）、泵浦操作盤（側面：面板＋接頭）
  K.cx(g, T.dark, 0.42, 1.4, 0, 1.4, -4.05, 18);
  K.cx(g, M(0xc8b058, { roughness: 0.8, metalness: 0 }), 0.36, 1.2, 0, 1.4, -4.05, 18);
  for (const s of [-1, 1]) {
    K.bx(g, T.metal, 0.03, 0.7, 0.9, s * 1.24, 1.7, 2.1, 0, 0, 0, 0.005);
    fine(() => {
      for (let k = 0; k < 4; k++)
        K.cy(
          g,
          T.white,
          0.06,
          0.04,
          s * 1.27,
          1.85 - (k % 2) * 0.28,
          1.85 + Math.floor(k / 2) * 0.45,
          12,
          0,
          undefined,
          0,
          0,
          HP,
        );
    });
  }
  axles(g, WM, [3.5, -2.6], 1.0, 0.54, 0.36, wheels, [-2.6]);
  fenders(g, T.dark, [-2.6], 1.0, 0.54, 0.36);
  for (const s of [-1, 1]) door(g, T, s, s * 1.23, 2.9, 3.9, 1.0, 2.6);
  wipers(g, T, 2.2, 2.3, 4.6, -0.3);
  plate(g, T, 0.7, 4.66, 1);
  plate(g, T, 0.7, -4.42, -1);
  tail(g, T, WM, -4.4, 2.2, 1.0);
  mudflaps(g, T, 1.0, -3.3, 0.54);
  markers(g, T, 1.23, 1.0, [3.0, 0.5, -2.0, -3.9]);
  underbody(g, T, 3.5, -2.6, 0.5, [3.5, -2.6], 1.8);
  fine(() => K.hazard(g, T.yellow, T.dark, 2.2, 0.14, 0.02, 0, 0.62, -4.42, Math.PI, 10));
  bakeAll(g, { tint: TINT, cache: 'cineveh:firetruck' });
  return { group: g, wheels, parts: L, len: 9.4 };
}

// ---------- 警車（轎車、長 4.8 m）：黑色的車身＋白色的車門、斜的前後擋風玻璃（梯形擠出的車艙）、車頂的警示燈條、
//            前面的保險桿推架 ----------
export function buildPolice() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const blk = M(0x1c1e22, { roughness: 0.45, metalness: 0.4 });
  const wht = M(0xa8acae, { roughness: 0.6, metalness: 0.2 });
  P(g, D.box(1.82, 0.62, 4.7, 0.1), blk, 0, 0.66, 0); // 下車身（引擎蓋到後車廂）
  for (const s of [-1, 1]) K.bx(g, wht, 0.02, 0.5, 2.2, s * 0.915, 0.7, -0.1, 0, 0, 0, 0.01); // 白色車門
  // 車艙：側面是梯形（前後擋風斜的），沿 X 擠出
  P(
    g,
    D.extrude(
      [
        [1.15, 0],
        [0.55, 0.58],
        [-0.85, 0.58],
        [-1.35, 0],
      ],
      1.62,
      0.04,
    ),
    blk,
    0,
    0.97,
    -0.15,
    0,
    HP,
    0,
  );
  P(g, D.box(1.5, 0.66, 0.02, 0.01), T.glass, 0, 1.27, 0.68, -0.8, 0, 0); // 前擋風
  P(g, D.box(1.5, 0.62, 0.02, 0.01), T.glass, 0, 1.27, -1.25, 0.86, 0, 0); // 後擋風
  for (const s of [-1, 1]) P(g, D.box(0.02, 0.4, 1.7, 0.01), T.glass, s * 0.82, 1.27, -0.2);
  const L = lightbar(g, T, 1.6, -0.25, 1.3);
  // 前後：保險桿、推架、車燈
  K.bx(g, T.dark, 1.86, 0.2, 0.16, 0, 0.45, 2.38, 0, 0, 0, 0.03);
  K.bx(g, T.dark, 1.86, 0.2, 0.16, 0, 0.45, -2.38, 0, 0, 0, 0.03);
  for (const s of [-1, 1]) {
    K.bx(g, T.dark, 0.08, 0.6, 0.08, s * 0.45, 0.62, 2.52, 0, 0, 0, 0.01);
    vLamp(g, WM, T.lamp, s * 0.65, 0.78, 2.36, 0.36, 0.14, 0);
    vLamp(g, WM, T.lightR, s * 0.68, 0.8, -2.36, 0.34, 0.14, Math.PI);
  }
  K.bx(g, T.dark, 0.95, 0.06, 0.08, 0, 0.82, 2.52, 0, 0, 0, 0.01);
  axles(g, WM, [1.45, -1.45], 0.82, 0.34, 0.24, wheels);
  plate(g, T, 0.5, 2.47, 1);
  plate(g, T, 0.62, -2.47, -1);
  fine(() => {
    for (const s of [-1, 1]) {
      K.handle(g, T.dark, 0.16, s * 0.93, 0.92, 0.3, s * HP, 0.03);
      K.handle(g, T.dark, 0.16, s * 0.93, 0.92, -0.8, s * HP, 0.03);
      K.bx(g, T.dark, 0.12, 0.08, 0.2, s * 0.98, 1.0, 0.72, 0, 0, 0, 0.01); // 後照鏡
    }
    K.cy(g, T.dark, 0.008, 0.6, 0.5, 1.75, -1.0, 6); // 天線
  });
  bakeAll(g, { tint: TINT, cache: 'cineveh:police' });
  return { group: g, wheels, parts: L, len: 4.8 };
}

// ---------- 越野機車（長 2.2 m）：車架、油箱、座墊、前叉與把手、兩個越野胎、騎士（安全帽、外套） ----------
export function buildMoto(v = 0) {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const body = M([0xb83020, 0x2a5a9a, 0x5a6a3a][v % 3], { roughness: 0.5, metalness: 0.3 });
  for (const z of [0.72, -0.72]) {
    const wh = vWheel(g, WM, 0, 0.34, z, 0.34, 0.14, { lugs: 18, depth: 0.04, side: 1 });
    if (wh) wheels.push({ o: wh, r: 0.34 });
  }
  K.rod(g, T.steel, [0, 0.34, -0.72], [0, 0.62, -0.1], 0.04); // 後搖臂
  K.rod(g, T.steel, [0, 0.34, 0.72], [0, 1.0, 0.48], 0.035); // 前叉
  K.rod(g, T.dark, [-0.36, 1.05, 0.44], [0.36, 1.05, 0.44], 0.02); // 把手
  P(g, D.box(0.3, 0.32, 0.6, 0.06), T.dark, 0, 0.62, 0.1); // 引擎
  P(g, D.box(0.34, 0.24, 0.5, 0.08), body, 0, 0.92, 0.22); // 油箱
  P(g, D.box(0.26, 0.1, 0.7, 0.04), T.dark, 0, 0.9, -0.32); // 座墊
  P(g, D.box(0.3, 0.06, 0.5, 0.02), body, 0, 0.82, -0.75); // 後土除
  P(g, D.box(0.22, 0.05, 0.32, 0.02), body, 0, 0.72, 0.85); // 前土除
  vExhaust(g, WM, 0.18, 0.55, -0.35, 0.3, 0.04);
  vLight(g, WM, T.lamp, 0, 1.0, 0.6, 0.06, Math.PI, false);
  // 騎士：坐姿、手伸到把手、上身往前傾、安全帽
  const jk = M([0x3a3e44, 0x6a4a2a, 0x2a3a2a][v % 3], { roughness: 0.85, metalness: 0 });
  for (const s of [-1, 1]) {
    K.rod(g, T.cloth, [s * 0.14, 0.95, -0.3], [s * 0.16, 0.7, 0.05], 0.07); // 大腿
    K.rod(g, T.cloth, [s * 0.16, 0.7, 0.05], [s * 0.18, 0.45, -0.05], 0.06); // 小腿
    K.rod(g, jk, [s * 0.18, 1.42, -0.2], [s * 0.34, 1.08, 0.42], 0.05); // 手臂
  }
  P(g, D.box(0.38, 0.55, 0.26, 0.08), jk, 0, 1.25, -0.22, 0.35, 0, 0);
  P(
    g,
    D.lathe(
      [
        [0, -0.13],
        [0.12, -0.12],
        [0.14, 0],
        [0.11, 0.11],
        [0, 0.14],
      ],
      12,
    ),
    M(0x2e3238, { roughness: 0.45, metalness: 0.2 }), // 深色的安全帽（亮黃色在光線下會泛光）
    0,
    1.66,
    -0.08,
  );
  K.bx(g, T.glass, 0.18, 0.06, 0.04, 0, 1.66, 0.04, 0, 0, 0, 0.01); // 護目鏡
  fine(() => {
    K.cy(g, T.dark, 0.03, 0.12, 0, 1.06, 0.4, 8); // 儀表
    for (const s of [-1, 1]) K.bx(g, T.dark, 0.04, 0.12, 0.04, s * 0.38, 1.05, 0.44, 0, 0, 0, 0.005); // 握把
  });
  bakeAll(g, { tint: TINT, cache: 'cineveh:moto' + (v % 3) });
  return { group: g, wheels, parts: {}, len: 2.2 };
}
