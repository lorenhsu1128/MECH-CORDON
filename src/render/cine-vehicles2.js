// 過場的載具：第二批（作業與工程車，docs/cine-redesign-design.md 第十一節「載具 v2」）。規則同 render/cine-vehicles.js：
// 真實尺寸（公尺）、原點＝底面中心、車頭 +Z、照 docs/model-detail.md 的三層細節。會動的部件是獨立的群組，放在 parts：
//   hauler 礦用卡車（parts.bed 車斗，繞後端翻起）、excavator 挖土機（parts.turret 上部旋轉、boom 動臂、arm 斗桿、bucket 挖斗）、
//   crane 移動式吊車（parts.turret、boom 吊臂、tip 吊臂前端（吊鉤一直朝下））、lavahauler 熔岩運輸車（熔融的坩堝）、
//   tug 甲板牽引車、lowboy 機甲運輸拖車（低床）、newsvan 轉播車（車頂的衛星碟）
// 由 render/cine-vehicles.js 的 buildCineVeh 分派（這裡只匯出建模函式）。
import { P, bakeAll, fine } from './geometry.js';
import { D } from './detail.js';
import { treadMat, vCab, vExhaust, vLight, vTrack, vWheel } from './vehicle-kit.js';
import * as K from './dev-kit.js';
import {
  HP,
  M,
  axles,
  door,
  driver,
  fenders,
  markers,
  mats,
  mudflaps,
  nose,
  plate,
  tail,
  underbody,
  wheelM,
  wipers,
} from './cine-vehicles.js';

const TINT = { ao: 0.85, grime: 0.32, gh: 0.9 };
// 兩點之間的方樑（在 YZ 平面裡，a、b＝[y, z]；w＝寬、h＝厚）
function beam(n, m, a, b, w, h, x = 0) {
  const dy = b[0] - a[0],
    dz = b[1] - a[1];
  const L = Math.hypot(dy, dz);
  K.bx(n, m, w, h, L, x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, -Math.atan2(dy, dz), 0, 0);
}
const yel = () => M(0xc8901a, { roughness: 0.72, metalness: 0.12 }); // 工程黃（太亮太光滑會在攝影棚光線下泛光）

// ---------- 礦用卡車（長 9 m、寬 4.2 m）：前方的平台與左側的駕駛室、爬梯、車斗（parts.bed，繞後端翻起）、雙胎的後輪 ----------
export function buildHauler() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const body = yel();
  P(g, D.box(2.0, 0.6, 7.6, 0.06), T.dark, 0, 1.3, -0.1); // 大樑
  // 前方：大水箱護罩、保險桿＋斜紋、平台、駕駛室（左）、爬梯（右前）
  P(g, D.box(2.6, 1.6, 1.0, 0.08), body, 0, 2.0, 3.6);
  K.vents(g, T.dark, T.steel, 2.0, 1.2, 0, 2.05, 4.12, 0, 9);
  P(g, D.box(4.0, 0.4, 0.5, 0.06), T.dark, 0, 1.0, 4.25);
  K.hazard(g, T.yellow, T.dark, 3.8, 0.24, 0.02, 0, 1.0, 4.51, 0, 12);
  P(g, D.box(4.2, 0.12, 1.6, 0.03), T.dark, 0, 2.86, 3.4);
  K.railing(
    g,
    T.yellow,
    [
      [-2.05, 2.65],
      [-2.05, 4.15],
      [2.05, 4.15],
      [2.05, 2.65],
    ],
    2.92,
    0.9,
    0.025,
  );
  P(g, D.box(1.5, 1.7, 1.6, 0.08), body, -1.2, 3.77, 3.0);
  P(g, D.box(1.4, 0.75, 0.03, 0.01), T.glass, -1.2, 4.05, 3.81);
  for (const x of [-1.96, -0.44]) P(g, D.box(0.03, 0.7, 1.2, 0.01), T.glass, x, 4.05, 3.0);
  driver(g, T, -1.2, 3.25, 3.0);
  for (let i = 0; i < 6; i++)
    K.bx(g, T.dark, 0.7, 0.04, 0.25, 1.75, 1.0 + i * 0.32, 4.4 - i * 0.2, 0, 0, 0, 0.01);
  K.rod(g, T.yellow, [2.1, 1.2, 4.5], [2.1, 3.6, 3.3], 0.03);
  // 頭燈一排（平台下緣）、排氣管兩根、後照鏡
  for (const x of [-1.6, -1.0, 1.0, 1.6]) vLight(g, WM, T.lamp, x, 2.7, 4.2, 0.13, Math.PI, true);
  vExhaust(g, WM, 0.6, 2.9, 2.75, 1.6, 0.11);
  vExhaust(g, WM, -0.2, 2.9, 2.75, 1.6, 0.11);
  K.rod(g, T.dark, [-2.0, 4.0, 3.6], [-2.4, 4.1, 3.7], 0.02);
  K.bx(g, T.dark, 0.06, 0.4, 0.3, -2.45, 3.95, 3.7, 0, 0, 0, 0.01);
  // 車斗：繞後端（z −3.9、y 2.3）翻起的群組；底板＋梯形的側板（外側的肋）＋延伸到駕駛室上方的遮板
  const bed = new THREE.Group();
  bed.position.set(0, 2.3, -3.9);
  g.add(bed);
  P(bed, D.box(3.8, 0.25, 6.4, 0.06), body, 0, 0.12, 3.2);
  for (const s of [-1, 1]) {
    P(
      bed,
      D.extrude(
        [
          [0, 0],
          [6.4, 0],
          [6.4, 1.7],
          [0.6, 1.5],
        ],
        0.14,
        0.03,
      ),
      body,
      s * 1.9,
      0.2,
      0, // 擠出的形狀已經是 0～6.4（沿 +Z）
      0,
      -HP,
      0,
    );
    for (let i = 0; i < 6; i++)
      K.bx(bed, body, 0.14, 1.4, 0.12, s * 1.99, 0.95, 0.7 + i * 1.05, 0, 0, 0, 0.02);
    K.bx(bed, T.dark, 0.08, 0.1, 6.2, s * 1.98, 1.75, 3.25, 0, 0, 0, 0.02);
  }
  P(bed, D.box(3.9, 1.8, 0.16, 0.04), body, 0, 1.05, 6.35);
  P(bed, D.box(3.9, 0.14, 1.5, 0.04), body, 0, 1.95, 7.05); // 遮板（伸到駕駛室上方）
  fine(() => K.fins(bed, T.dark, 7, 3.5, 0.06, 0.1, 0, 0.27, 3.2, 0, 0.05));
  // 液壓缸（車斗底下的兩支）
  for (const s of [-1, 1]) K.piston(bed, T.steel, T.metal, [s * 0.7, -0.7, 4.4], [s * 0.7, 0.1, 3.3], 0.12);
  // 車輪：前 R 1.05、後雙胎
  axles(g, WM, [2.6, -2.1], 1.62, 1.05, 0.75, wheels, [-2.1]);
  fenders(g, body, [2.6], 1.62, 1.05, 0.8);
  underbody(g, T, 3.0, -3.0, 1.0, [2.6, -2.1], 2.2);
  fine(() => {
    markers(g, T, 2.1, 2.2, [3.4, -3.5]);
    for (const s of [-1, 1]) K.bx(g, T.lightR, 0.3, 0.16, 0.04, s * 1.6, 1.6, -4.0, 0, 0, 0, 0.01);
  });
  bakeAll(g, { tint: TINT, cache: 'cineveh:hauler' });
  return { group: g, wheels, parts: { bed }, len: 9.2 };
}

// ---------- 挖土機（履帶、20 噸級）：下部的履帶、上部旋轉體（駕駛室在左前、引擎蓋、配重）、動臂→斗桿→挖斗 ----------
export function buildExcavator() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const body = yel();
  const tr = new THREE.Group();
  tr.rotation.y = Math.PI;
  g.add(tr);
  const tread = treadMat(WM);
  for (const s of [-1, 1]) {
    const r = vTrack(tr, WM, s * 1.25, 0, 4.4, 0.95, 0.62, 6, tread);
    for (const w of r.wheels) wheels.push({ o: w.o, r: -w.r });
  }
  P(g, D.box(1.6, 0.5, 3.6, 0.06), T.dark, 0, 0.8, 0);
  P(g, D.cyl(0.95, 0.95, 0.2, 20, 0.03), T.dark, 0, 1.1, 0); // 迴轉座
  // 上部旋轉體
  const tu = new THREE.Group();
  tu.position.set(0, 1.2, 0);
  g.add(tu);
  P(tu, D.box(2.6, 0.35, 3.4, 0.06), body, 0, 0.18, -0.2); // 底板
  P(tu, D.box(2.5, 0.95, 1.7, 0.1), body, 0.05, 0.82, -1.0); // 引擎蓋
  P(
    tu,
    D.lathe(
      [
        [0, -0.1],
        [1.25, -0.1],
        [1.3, 0.45],
        [1.2, 0.95],
        [0, 0.95],
      ],
      20,
      Math.PI * 0.5,
      Math.PI * 1.5,
    ),
    T.dark,
    0,
    0.35,
    -1.9,
  ); // 配重（後方的圓弧）
  K.vents(tu, T.dark, T.steel, 1.0, 0.5, 0.6, 0.85, -0.14, 0, 5);
  vExhaust(tu, WM, 0.8, 1.3, -0.9, 0.6, 0.07);
  // 駕駛室（左前）：框＋大片玻璃、頂上的燈、扶手
  P(tu, D.box(0.95, 1.7, 1.5, 0.06), body, -0.75, 1.2, 0.6);
  P(tu, D.box(0.85, 1.25, 0.03, 0.01), T.glass, -0.75, 1.35, 1.36);
  P(tu, D.box(0.03, 1.2, 1.25, 0.01), T.glass, -1.23, 1.35, 0.6);
  driver(tu, T, -0.75, 0.75, 0.6);
  vLight(tu, WM, T.lamp, -0.75, 2.1, 1.3, 0.09, Math.PI, true);
  K.railing(
    tu,
    T.yellow,
    [
      [0.2, 0.0],
      [1.25, 0.0],
      [1.25, -1.6],
    ],
    1.32,
    0.55,
    0.022,
  );
  K.hazard(tu, T.yellow, T.dark, 2.4, 0.12, 0.02, 0, 0.12, -1.88, Math.PI, 10);
  // 動臂（根部在 x 0.25、高 0.6、前 1.0），之後斗桿、挖斗依序接在前端
  const boom = new THREE.Group();
  boom.position.set(0.25, 0.65, 1.05);
  boom.rotation.x = -0.35;
  tu.add(boom);
  beam(boom, body, [0, 0], [1.5, 2.3], 0.42, 0.55);
  beam(boom, body, [1.5, 2.3], [0.9, 4.6], 0.42, 0.5);
  K.cx(boom, T.steel, 0.14, 0.5, 0, 0, 0, 14);
  K.piston(boom, T.steel, T.metal, [0.0, -0.45, 0.2], [0.0, 1.1, 2.0], 0.1);
  const arm = new THREE.Group();
  arm.position.set(0, 0.9, 4.6);
  arm.rotation.x = 1.15;
  boom.add(arm);
  beam(arm, body, [0.3, -0.2], [-2.6, 0.2], 0.34, 0.42);
  K.cx(arm, T.steel, 0.12, 0.45, 0, 0, 0, 14);
  K.piston(arm, T.steel, T.metal, [0, 0.55, -0.35], [0, -1.3, -0.05], 0.08);
  const bucket = new THREE.Group();
  bucket.position.set(0, -2.6, 0.2);
  bucket.rotation.x = 0.3;
  arm.add(bucket);
  // 挖斗：C 形的側板＋底板＋齒
  for (const s of [-1, 1])
    P(
      bucket,
      D.extrude(
        [
          [0, 0],
          [0.9, -0.2],
          [1.0, -0.8],
          [0.4, -1.0],
          [0, -0.5],
        ],
        0.05,
        0.01,
      ),
      T.dark,
      s * 0.45,
      0,
      0,
      0,
      -HP,
      0,
    );
  P(bucket, D.box(0.9, 0.06, 0.9, 0.02), T.dark, 0, -0.95, 0.45, 0.35, 0, 0);
  P(bucket, D.box(0.9, 0.6, 0.06, 0.02), T.dark, 0, -0.5, 0.0, 0, 0, 0);
  for (let i = 0; i < 5; i++)
    K.bx(bucket, T.steel, 0.08, 0.06, 0.22, -0.36 + i * 0.18, -0.85, 1.05, 0.4, 0, 0, 0.01);
  K.cx(bucket, T.steel, 0.07, 0.95, 0, 0, 0, 12);
  bakeAll(g, { tint: TINT, cache: 'cineveh:excavator' });
  return { group: g, wheels, parts: { turret: tu, boom, arm, bucket }, len: 4.6 };
}

// ---------- 移動式吊車（4 軸、長 12 m）：前方的駕駛室、外伸支腳、上部旋轉體（操作室＋配重）、三節的伸縮吊臂、吊鉤 ----------
export function buildCrane() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const body = yel();
  P(g, D.box(2.5, 0.7, 11.2, 0.06), body, 0, 1.05, 0);
  vCab(g, WM, 4.5, 6.0, 2.5, 0.9, 2.6, { body, glass: T.glass, lamp: T.lamp, amber: T.amber });
  K.hazard(g, T.yellow, T.dark, 2.5, 0.2, 0.02, 0, 0.65, 6.12, 0, 10);
  // 外伸支腳（四角）
  for (const z of [3.6, -4.8])
    for (const s of [-1, 1]) {
      K.bx(g, T.dark, 1.6, 0.25, 0.35, s * 1.95, 1.05, z, 0, 0, 0, 0.03);
      K.cy(g, T.steel, 0.1, 0.9, s * 2.7, 0.6, z, 12);
      K.cy(g, T.dark, 0.35, 0.08, s * 2.7, 0.08, z, 18);
    }
  // 上部旋轉體
  const tu = new THREE.Group();
  tu.position.set(0, 1.4, -2.2);
  g.add(tu);
  P(tu, D.cyl(1.1, 1.1, 0.25, 20, 0.03), T.dark, 0, 0.12, 0);
  P(tu, D.box(2.4, 1.0, 3.6, 0.08), body, 0, 0.75, -0.4);
  P(tu, D.box(2.3, 1.1, 1.2, 0.08), T.dark, 0, 0.8, -2.6); // 配重
  P(tu, D.box(0.9, 1.6, 1.4, 0.06), body, -1.4, 1.3, 0.6); // 操作室
  P(tu, D.box(0.8, 1.0, 0.03, 0.01), T.glass, -1.4, 1.55, 1.31);
  P(tu, D.box(0.03, 0.9, 1.1, 0.01), T.glass, -1.86, 1.5, 0.6);
  K.vents(tu, T.dark, T.steel, 1.2, 0.5, 1.2, 0.8, -1.2, HP, 5);
  // 吊臂：根部在旋轉體前方上緣，三節伸縮（往前越細）；tip＝前端（吊鉤，一直朝下）
  const boom = new THREE.Group();
  boom.position.set(0.3, 1.4, 0.6);
  boom.rotation.x = -0.6;
  tu.add(boom);
  K.bx(boom, body, 0.9, 0.95, 5.0, 0, 0, 2.3, 0, 0, 0, 0.06);
  K.bx(boom, body, 0.72, 0.75, 4.5, 0, 0.05, 6.4, 0, 0, 0, 0.05);
  K.bx(boom, body, 0.56, 0.58, 4.0, 0, 0.08, 10.2, 0, 0, 0, 0.04);
  K.cx(boom, T.steel, 0.25, 1.0, 0, 0, 0, 16);
  K.piston(boom, T.steel, T.metal, [0, -1.5, 0.6], [0, -0.45, 3.0], 0.16);
  fine(() => {
    for (const z of [2.0, 3.5, 6.0, 8.0, 10.0])
      for (const s of [-1, 1]) K.bx(boom, T.dark, 0.02, 0.2, 0.2, s * 0.46, 0, z, 0, 0, 0, 0);
  });
  const tip = new THREE.Group();
  tip.position.set(0, 0.1, 12.2);
  tip.rotation.x = 0.6; // 抵銷吊臂的仰角：吊鉤朝下
  boom.add(tip);
  K.cx(tip, T.dark, 0.3, 0.4, 0, 0, 0, 16);
  for (const s of [-0.08, 0.08]) K.rod(tip, T.steel, [s, -0.2, 0], [s, -5.0, 0], 0.012);
  // 吊鉤組：滑輪箱＋鉤
  K.bx(tip, T.yellow, 0.45, 0.6, 0.3, 0, -5.3, 0, 0, 0, 0, 0.05);
  K.lathe(
    tip,
    T.steel,
    [
      [0.02, 0],
      [0.16, 0.02],
      [0.16, 0.05],
      [0.02, 0.07],
    ],
    0,
    -5.8,
    0.1,
    'z',
    14,
  );
  K.cy(tip, T.steel, 0.04, 0.35, 0, -5.75, 0, 8);
  axles(g, WM, [4.6, 3.0, -3.0, -4.4], 1.1, 0.62, 0.5, wheels);
  for (const s of [-1, 1]) door(g, T, s, s * 1.26, 4.6, 5.4, 1.0, 2.4);
  wipers(g, T, 2.3, 2.0, 5.85, -0.5);
  plate(g, T, 0.75, 6.2, 1);
  tail(g, T, WM, -5.62, 2.4, 1.1);
  markers(g, T, 1.27, 1.1, [5.0, 0.0, -5.0]);
  underbody(g, T, 5.0, -5.0, 0.55, [4.6, 3.0, -3.0, -4.4], 2.0);
  bakeAll(g, { tint: TINT, cache: 'cineveh:crane' });
  return { group: g, wheels, parts: { turret: tu, boom, tip }, len: 12.4 };
}

// ---------- 熔岩運輸車（3 軸、長 9 m）：隔熱的駕駛室（擋風前的隔熱格柵）、裝熔岩的坩堝（發光的表面）、隔熱板 ----------
export function buildLavaHauler() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const body = M(0x4a4e54, { roughness: 0.6, metalness: 0.5 });
  const hot = M(0xff7a20, { emissive: 0xff5a10, emissiveIntensity: 2.2, roughness: 0.6 });
  const crust = M(0x2a1a14, { roughness: 0.95, metalness: 0 });
  P(g, D.box(1.8, 0.4, 8.6, 0.05), T.dark, 0, 0.95, 0);
  vCab(g, WM, 2.8, 4.6, 2.5, 1.0, 2.9, { body, glass: T.glass, lamp: T.lamp, amber: T.amber });
  K.fins(g, T.steel, 10, 2.1, 0.7, 0.06, 0, 2.35, 4.7, 0, 0.05); // 擋風前的隔熱格柵
  K.hazard(g, T.yellow, T.dark, 2.5, 0.2, 0.02, 0, 0.8, 4.78, 0, 10);
  // 坩堝：搖架＋剖面旋轉的厚壁鍋（外側的隔熱肋）＋熔岩的表面（發光）與一層殼
  for (const s of [-1, 1]) {
    K.bx(g, T.dark, 0.3, 1.6, 0.4, s * 1.45, 1.9, -1.4, 0, 0, 0, 0.04);
    K.cx(g, T.steel, 0.22, 0.4, s * 1.45, 2.6, -1.4, 14);
  }
  K.lathe(
    g,
    body,
    [
      [0, 0],
      [0.8, 0],
      [1.25, 0.3],
      [1.45, 1.1],
      [1.5, 1.5],
      [1.32, 1.5],
      [1.25, 1.1],
      [0.75, 0.3],
      [0, 0.3],
    ],
    0,
    1.2,
    -1.4,
    'y',
    24,
  );
  K.cy(g, hot, 1.3, 0.04, 0, 2.55, -1.4, 24);
  fine(() => {
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      K.bx(
        g,
        crust,
        0.5 + (i % 2) * 0.3,
        0.05,
        0.35,
        Math.cos(a) * 0.6,
        2.59,
        -1.4 + Math.sin(a) * 0.6,
        0,
        a,
        0,
        0.02,
      );
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      K.bx(g, T.dark, 0.06, 1.0, 0.18, Math.cos(a) * 1.42, 1.85, -1.4 + Math.sin(a) * 1.42, 0, -a, 0, 0.01);
    }
  });
  // 隔熱板（坩堝與駕駛室之間）、管線、噴水的冷卻嘴
  K.bx(g, T.steel, 2.6, 2.0, 0.12, 0, 2.0, 0.6, 0, 0, 0, 0.04);
  K.boltRow(g, T.dark, -1.1, 1.1, 2.8, 0.66, 6, 0.04, 1);
  K.pipe(
    g,
    T.metal,
    [
      [1.2, 1.3, 2.4],
      [1.2, 2.8, 0.9],
      [0.9, 3.0, -0.2],
    ],
    0.06,
  );
  K.cz(g, T.dark, 0.08, 0.3, 0.9, 3.0, -0.35, 10);
  axles(g, WM, [3.6, -2.4, -3.6], 1.0, 0.75, 0.55, wheels);
  fenders(g, T.dark, [-2.4, -3.6], 1.0, 0.75, 0.55);
  for (const s of [-1, 1]) door(g, T, s, s * 1.26, 2.9, 3.8, 1.15, 2.6);
  wipers(g, T, 2.3, 2.05, 4.45, -0.5);
  mudflaps(g, T, 1.0, -4.4, 0.75);
  tail(g, T, WM, -4.32, 2.0, 1.2);
  markers(g, T, 1.27, 1.1, [4.0, -4.0]);
  underbody(g, T, 4.0, -4.0, 0.62, [3.6, -2.4, -3.6], 1.9);
  bakeAll(g, { tint: TINT, cache: 'cineveh:lavahauler' });
  return { group: g, wheels, parts: {}, len: 9.4 };
}

// ---------- 甲板牽引車（低矮、長 4.6 m）：右後的低座位與防滾架、前方的拖桿與掛鉤、琥珀色警示燈、斜紋 ----------
export function buildTug() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const body = M(0x3a3e44, { roughness: 0.6, metalness: 0.4 });
  P(
    g,
    D.extrude(
      [
        [-2.3, 0.35],
        [2.1, 0.35],
        [2.3, 0.6],
        [2.2, 1.05],
        [-2.3, 1.05],
      ],
      2.2,
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
  K.hazard(g, T.yellow, T.dark, 2.2, 0.18, 0.02, 0, 0.82, 2.3, 0, 10);
  K.hazard(g, T.yellow, T.dark, 2.2, 0.18, 0.02, 0, 0.82, -2.32, Math.PI, 10);
  for (const s of [-1, 1]) K.hazard(g, T.yellow, T.dark, 4.4, 0.12, 0.02, s * 1.11, 0.95, 0, s * HP, 18);
  // 座位與防滾架（右後）、方向盤
  K.bx(g, T.dark, 0.6, 0.12, 0.6, 0.6, 1.15, -1.3, 0, 0, 0, 0.04);
  K.bx(g, T.dark, 0.6, 0.6, 0.12, 0.6, 1.45, -1.62, 0, 0, 0, 0.04);
  driver(g, T, 0.6, 1.15, -1.3);
  for (const x of [0.25, 0.95]) {
    K.rod(g, T.yellow, [x, 1.05, -1.75], [x, 2.25, -1.75], 0.035);
    K.rod(g, T.yellow, [x, 2.25, -1.75], [x, 2.25, -0.85], 0.035);
    K.rod(g, T.yellow, [x, 2.25, -0.85], [x, 1.05, -0.75], 0.035);
  }
  K.bx(g, T.dark, 0.9, 0.04, 1.0, 0.6, 2.28, -1.3, 0, 0, 0, 0.01);
  K.lathe(
    g,
    T.dark,
    [
      [0.15, -0.012],
      [0.17, 0],
      [0.15, 0.012],
    ],
    0.6,
    1.5,
    -0.85,
    'y',
    14,
    1.0,
  );
  K.cy(g, T.amber, 0.07, 0.12, 0.25, 2.36, -1.3, 12);
  // 拖桿與掛鉤、前後的燈
  K.rod(g, T.yellow, [0, 0.6, 2.3], [0, 0.45, 3.4], 0.05);
  K.lathe(
    g,
    T.steel,
    [
      [0.06, -0.03],
      [0.1, 0],
      [0.06, 0.03],
    ],
    0,
    0.45,
    3.45,
    'z',
    12,
  );
  for (const s of [-1, 1]) vLight(g, WM, T.lamp, s * 0.75, 0.8, 2.32, 0.08, Math.PI, false);
  tail(g, T, WM, -2.32, 1.8, 0.82);
  fine(() => {
    K.vents(g, T.dark, T.steel, 0.9, 0.3, -0.4, 1.06, -0.5, 0, 4);
    for (const s of [-1, 1]) K.handle(g, T.metal, 0.3, s * 1.12, 0.9, -1.5, s * HP, 0.05, 0.015);
  });
  axles(g, WM, [1.5, -1.5], 0.95, 0.45, 0.34, wheels);
  bakeAll(g, { tint: TINT, cache: 'cineveh:tug' });
  return { group: g, wheels, parts: {}, len: 4.6 };
}

// ---------- 機甲運輸拖車（低床、全長 19 m）：曳引車＋鵝頸＋低床（上面可以放機甲）＋後方 3 軸、固定用的鏈條與輪擋 ----------
export function buildLowboy() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const body = M(0x2b4a8a, { roughness: 0.5, metalness: 0.4 });
  // 曳引車
  P(g, D.box(1.6, 0.4, 5.6, 0.05), T.dark, 0, 0.95, 6.4);
  vCab(g, WM, 7.4, 9.2, 2.5, 1.0, 3.0, { body, glass: T.glass, lamp: T.lamp, amber: T.amber });
  P(g, D.box(2.4, 1.0, 0.8, 0.06), body, 0, 2.6, 6.9); // 臥舖
  vExhaust(g, WM, 1.2, 1.6, 7.1, 2.4, 0.09);
  vExhaust(g, WM, -1.2, 1.6, 7.1, 2.4, 0.09);
  K.cy(g, T.dark, 0.6, 0.1, 0, 1.2, 4.6, 16); // 第五輪
  axles(g, WM, [8.3, 5.2, 4.0], 0.95, 0.55, 0.38, wheels, [5.2, 4.0]);
  // 鵝頸（高）→ 低床（離地 0.9 m）→ 後方的高台與 3 軸
  P(g, D.box(2.8, 0.5, 2.2, 0.06), T.dark, 0, 1.55, 3.6);
  P(
    g,
    D.extrude(
      [
        [0, 1.3],
        [0.9, 1.3],
        [1.8, 0.65],
        [1.8, 1.05],
        [0.9, 1.75],
        [0, 1.75],
      ],
      2.8,
      0.04,
    ),
    T.dark,
    0,
    0,
    1.6,
    0,
    -HP,
    0,
  );
  P(g, D.box(3.0, 0.32, 9.0, 0.05), T.dark, 0, 0.75, -2.8);
  P(g, D.box(3.0, 0.5, 2.8, 0.05), T.dark, 0, 1.1, -8.6);
  K.hazard(g, T.yellow, T.dark, 3.0, 0.24, 0.02, 0, 1.1, -10.02, Math.PI, 12);
  for (const s of [-1, 1]) {
    K.hazard(g, T.yellow, T.dark, 9.0, 0.12, 0.02, s * 1.51, 0.75, -2.8, s * HP, 30);
    for (let i = 0; i < 6; i++)
      K.lathe(
        g,
        T.steel,
        [
          [0.04, -0.02],
          [0.06, 0],
          [0.04, 0.02],
        ],
        s * 1.42,
        0.95,
        -6.6 + i * 1.6,
        'y',
        8,
      ); // 綁鏈的環
  }
  // 木頭的甲板條、輪擋、鏈條（垂在兩側）
  fine(() => K.fins(g, T.wood, 14, 2.7, 0.03, 8.8, 0, 0.92, -2.8, 0, 0.14));
  for (const z of [-0.3, -5.6])
    for (const s of [-1, 1]) K.bx(g, T.wood, 0.5, 0.25, 0.35, s * 0.9, 1.05, z, 0, 0, 0, 0.04);
  for (const s of [-1, 1]) K.cable(g, T.steel, [s * 1.4, 0.95, -1.0], [s * 1.4, 0.95, -4.0], 0.025, 0.35);
  axles(g, WM, [-7.6, -8.6, -9.6], 1.25, 0.48, 0.34, wheels, [-7.6, -8.6, -9.6]);
  for (const s of [-1, 1]) door(g, T, s, s * 1.26, 7.5, 8.4, 1.15, 2.6);
  wipers(g, T, 2.3, 2.1, 9.05, -0.5);
  plate(g, T, 0.75, 9.4, 1);
  tail(g, T, WM, -10.03, 2.6, 1.15);
  markers(g, T, 1.52, 0.9, [0.5, -3.0, -6.0]);
  bakeAll(g, { tint: TINT, cache: 'cineveh:lowboy' });
  return { group: g, wheels, parts: {}, len: 19.6 };
}

// ---------- 轉播車（廂型、長 5.6 m）：車頂的衛星碟（轉台＋饋源）、伸縮桅杆、車頂架、側面的電視台標示、器材門 ----------
export function buildNewsVan() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const body = M(0xd8dadc, { roughness: 0.6, metalness: 0.15 });
  const brand = M(0x2060c0, { roughness: 0.5, metalness: 0.2 });
  P(g, D.box(1.5, 0.22, 5.2, 0.04), T.dark, 0, 0.5, 0);
  vCab(g, WM, 1.1, 2.75, 2.05, 0.65, 2.2, { body, glass: T.glass, lamp: T.lamp, amber: T.amber });
  P(g, D.box(2.1, 2.0, 3.8, 0.1), body, 0, 1.65, -0.85);
  for (const s of [-1, 1]) {
    K.bx(g, brand, 0.02, 0.5, 3.6, s * 1.06, 1.4, -0.85, 0, 0, 0, 0.005);
    K.bx(g, T.orange, 0.02, 0.1, 3.6, s * 1.065, 1.72, -0.85, 0, 0, 0, 0.003);
    fine(() => {
      for (let i = 0; i < 4; i++)
        K.bx(g, T.white, 0.01, 0.2, 0.18, s * 1.075, 1.4, -1.9 + i * 0.26, 0, 0, 0, 0.003);
    });
    door(g, T, s, s * 1.05, -2.3, -1.3, 0.75, 1.15);
    door(g, T, s, s * 1.04, 1.25, 2.1, 0.75, 1.9);
  }
  // 車頂：轉台＋衛星碟（剖面旋轉的拋物面，朝前上方）＋饋源的支架、車頂架、伸縮桅杆
  K.cy(g, T.dark, 0.35, 0.18, 0, 2.75, -1.6, 16);
  const dish = new THREE.Group();
  dish.position.set(0, 3.25, -1.6);
  dish.rotation.x = -0.9;
  g.add(dish);
  K.lathe(
    dish,
    T.white,
    [
      [0, 0],
      [0.4, 0.04],
      [0.75, 0.16],
      [0.78, 0.2],
      [0.72, 0.18],
      [0.38, 0.07],
      [0, 0.03],
    ],
    0,
    0,
    0,
    'y',
    24,
  );
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    K.rod(dish, T.dark, [Math.cos(a) * 0.6, 0.18, Math.sin(a) * 0.6], [0, 0.7, 0], 0.012);
  }
  K.cy(dish, T.dark, 0.05, 0.1, 0, 0.72, 0, 10);
  K.cy(g, T.dark, 0.06, 1.6, 0.7, 3.4, -2.4, 10);
  K.cy(g, T.dark, 0.04, 1.2, 0.7, 4.6, -2.4, 10);
  K.cy(g, T.dark, 0.12, 0.08, 0.7, 5.2, -2.4, 12);
  K.railing(
    g,
    T.dark,
    [
      [-0.95, 0.9],
      [-0.95, -2.65],
      [0.95, -2.65],
      [0.95, 0.9],
    ],
    2.66,
    0.12,
    0.018,
  );
  // 後面的爬梯、尾燈、車牌
  for (const s of [-0.18, 0.18]) K.rod(g, T.metal, [s, 0.7, -2.78], [s, 2.6, -2.78], 0.018);
  fine(() => {
    for (let i = 0; i < 6; i++) K.bx(g, T.metal, 0.36, 0.025, 0.025, 0, 0.85 + i * 0.3, -2.78, 0, 0, 0, 0);
  });
  tail(g, T, WM, -2.77, 2.0, 0.95);
  plate(g, T, 0.55, 2.95, 1);
  plate(g, T, 0.7, -2.8, -1);
  wipers(g, T, 1.9, 1.55, 2.6, -0.6);
  mudflaps(g, T, 0.85, -2.2, 0.38);
  axles(g, WM, [1.9, -1.8], 0.85, 0.38, 0.28, wheels);
  underbody(g, T, 2.3, -2.4, 0.38, [1.9, -1.8], 1.5);
  bakeAll(g, { tint: TINT, cache: 'cineveh:newsvan' });
  return { group: g, wheels, parts: { dish }, len: 5.6 };
}
