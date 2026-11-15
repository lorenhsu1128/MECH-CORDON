// 過場與地圖的載具：第四批（地圖上會動的載具新增的車種，docs/map-vehicles-design.md）。規則同 render/cine-vehicles.js：
// 真實尺寸（公尺）、原點＝底面中心、車頭 +Z、照 docs/model-detail.md 的三層細節（大形、中層的門窗框架、fine 裡的小細節）。
// 會動的部件是獨立的群組，放在 parts：
//   bulldozer 推土機（parts.blade 推土鏟，繞支臂的後端升降；ripper 後面的松土器）、
//   mixer 水泥攪拌車（parts.drum 攪拌筒，繞自己斜放的軸轉）
// 由 render/cine-vehicles.js 的 buildCineVeh 分派（這裡只匯出建模函式）。
import { P, bakeAll, fine } from './geometry.js';
import { D } from './detail.js';
import { treadMat, vCab, vExhaust, vLight, vTrack } from './vehicle-kit.js';
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
  plate,
  tail,
  underbody,
  wheelM,
  wipers,
} from './cine-vehicles.js';

const TINT = { ao: 0.85, grime: 0.34, gh: 0.9 };
const yel = () => M(0xc8901a, { roughness: 0.72, metalness: 0.12 }); // 工程黃（和第二批相同）

// ---------- 推土機（履帶、長 5.0 m＋推土鏟）：低的履帶架、前方的引擎室（散熱格柵、排氣管）、後方的 ROPS 駕駛室、
//            前面的推土鏟（parts.blade：兩支推臂＋液壓缸，繞推臂的後端升降）、後面的松土器（parts.ripper） ----------
export function buildBulldozer() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const body = yel();
  // 履帶（vTrack 的前方是 −Z：整個履帶群組轉 180°）＋履帶上方的護板
  const tr = new THREE.Group();
  tr.rotation.y = Math.PI;
  g.add(tr);
  const tread = treadMat(WM);
  for (const s of [-1, 1]) {
    const r = vTrack(tr, WM, s * 1.0, -0.1, 3.9, 1.05, 0.6, 6, tread);
    for (const w of r.wheels) wheels.push({ o: w.o, r: -w.r });
    P(g, D.box(0.66, 0.06, 3.7, 0.02), T.dark, s * 1.0, 1.1, 0.1);
  }
  P(g, D.box(1.4, 0.55, 3.6, 0.06), T.dark, 0, 0.9, 0.05); // 車架
  // 引擎室（前）：箱體、前面的散熱格柵與護欄、頂上的進氣與排氣管
  P(g, D.box(1.55, 1.05, 1.9, 0.08), body, 0, 1.68, 0.95);
  P(g, D.box(1.3, 0.85, 0.06, 0.02), T.dark, 0, 1.62, 1.92);
  K.vents(g, T.dark, T.steel, 1.2, 0.75, 0, 1.62, 1.96, 0, 9);
  for (const s of [-1, 1]) {
    P(g, D.box(0.06, 0.95, 1.7, 0.02), T.dark, s * 0.79, 1.66, 0.95); // 側板的接縫
    K.vents(g, T.dark, T.steel, 0.9, 0.35, s * 0.8, 1.85, 0.9, s * HP, 6);
  }
  vExhaust(g, WM, 0.45, 2.2, 1.35, 0.85, 0.08);
  K.cy(g, T.dark, 0.13, 0.4, -0.45, 2.4, 1.3, 14); // 進氣（預濾器）
  K.cy(g, T.steel, 0.16, 0.12, -0.45, 2.66, 1.3, 14);
  // 駕駛室（後）：底座、ROPS 的四根柱與頂棚、四面的大窗、駕駛
  P(g, D.box(1.8, 0.35, 1.7, 0.06), body, 0, 1.33, -0.75);
  P(g, D.box(1.5, 1.35, 1.45, 0.06), body, 0, 2.15, -0.75);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) P(g, D.box(0.1, 1.5, 0.1, 0.02), T.dark, sx * 0.76, 2.2, -0.75 + sz * 0.74);
  P(g, D.box(1.7, 0.1, 1.65, 0.03), T.dark, 0, 2.95, -0.75);
  P(g, D.box(1.3, 0.95, 0.03, 0.01), T.glass, 0, 2.3, -0.02);
  P(g, D.box(1.3, 0.9, 0.03, 0.01), T.glass, 0, 2.3, -1.48);
  for (const s of [-1, 1]) P(g, D.box(0.03, 0.95, 1.25, 0.01), T.glass, s * 0.76, 2.3, -0.75);
  driver(g, T, 0, 1.75, -0.8);
  for (const s of [-1, 1]) vLight(g, WM, T.lamp, s * 0.55, 3.05, -0.05, 0.08, Math.PI, true);
  vLight(g, WM, T.lamp, 0, 3.05, -1.45, 0.08, 0, true);
  K.cy(g, T.amber, 0.07, 0.1, 0.5, 3.05, -1.1, 10); // 旋轉警示燈
  // 推土鏟：推臂的後端在履帶外側中段（parts.blade 的原點），鏟子在前方 2.5 m
  const blade = new THREE.Group();
  blade.position.set(0, 0.75, -0.2);
  g.add(blade);
  for (const s of [-1, 1]) {
    K.bx(blade, body, 0.16, 0.24, 2.6, s * 1.42, 0, 1.3, 0, 0, 0, 0.03); // 推臂
    K.cx(blade, T.steel, 0.09, 0.34, s * 1.42, 0, 0, 12); // 後端的樞軸
  }
  K.bx(blade, body, 2.9, 0.14, 0.14, 0, 0.05, 2.45, 0, 0, 0, 0.02); // 橫樑
  // 鏟子：弧形的板（擠出的剖面）＋底下的刃口＋兩側的端板
  P(
    blade,
    D.extrude(
      [
        [0, 0],
        [0.12, 0],
        [0.42, 0.55],
        [0.4, 1.1],
        [0.28, 1.15],
        [0.28, 0.6],
        [0, 0.08],
      ],
      3.3,
      0.02,
    ),
    body,
    0,
    -0.6,
    2.5,
    0,
    -HP,
    0,
  );
  K.bx(blade, T.steel, 3.3, 0.08, 0.16, 0, -0.56, 2.58, 0, 0, 0, 0.01);
  for (const s of [-1, 1]) K.bx(blade, T.dark, 0.06, 1.1, 0.5, s * 1.66, -0.05, 2.75, 0, 0, 0, 0.02);
  // 升降液壓缸：從引擎室的側面到鏟子的上緣（跟著鏟子動，接在推土鏟的群組裡）
  for (const s of [-1, 1])
    K.piston(blade, T.steel, T.metal, [s * 0.95, 1.15, 1.2], [s * 0.95, 0.35, 2.4], 0.07);
  // 松土器（後）：架子＋一支齒
  const ripper = new THREE.Group();
  ripper.position.set(0, 0.85, -1.75);
  g.add(ripper);
  K.bx(ripper, T.dark, 1.5, 0.18, 0.5, 0, 0, -0.3, 0, 0, 0, 0.03);
  K.bx(ripper, body, 0.18, 1.0, 0.24, 0, -0.35, -0.6, 0.15, 0, 0, 0.03);
  K.bx(ripper, T.steel, 0.12, 0.25, 0.3, 0, -0.85, -0.68, 0.5, 0, 0, 0.02);
  for (const s of [-1, 1])
    K.piston(ripper, T.steel, T.metal, [s * 0.5, 0.65, 0.35], [s * 0.5, 0.05, -0.35], 0.05);
  // 中層：駕駛室的門把、爬梯、扶手；小細節：螺栓列、警示斜紋、型號牌
  K.railing(
    g,
    T.yellow,
    [
      [-0.9, 0.2],
      [-0.9, -1.6],
    ],
    1.55,
    0.6,
    0.02,
  );
  for (let i = 0; i < 3; i++) K.bx(g, T.dark, 0.4, 0.04, 0.12, -1.15, 0.55 + i * 0.3, -0.6, 0, 0, 0, 0.005); // 爬梯
  fine(() => {
    K.boltRow(g, T.steel, -0.6, 0.6, 2.18, 1.93, 6, 0.02, 1);
    for (const s of [-1, 1]) K.handle(g, T.dark, 0.25, s * 0.78, 2.0, -0.4, s * HP);
    K.hazard(g, T.yellow, T.dark, 1.4, 0.1, 0.02, 0, 1.2, -1.62, Math.PI, 8);
    K.bx(g, T.white, 0.35, 0.1, 0.01, 0.4, 1.95, 1.93); // 型號牌
  });
  bakeAll(g, { tint: TINT, cache: 'cineveh:bulldozer' });
  return { group: g, wheels, parts: { blade, ripper }, len: 5.6 };
}

// ---------- 水泥攪拌車（3 軸、長 9.2 m）：前方的駕駛室、斜放的攪拌筒（parts.drum：筒身＋螺旋葉片的外露端、驅動的齒圈，
//            繞筒的軸轉）、筒後方的進料斗與卸料槽、水箱、爬梯與平台 ----------
export function buildMixer() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group(),
    wheels = [];
  const cabC = M(0xa4a8aa, { roughness: 0.78, metalness: 0.1 }); // 白色的駕駛室：太亮會在攝影棚光線下泛光
  const drumC = M(0xc84a20, { roughness: 0.62, metalness: 0.25 });
  P(g, D.box(1.4, 0.3, 8.8, 0.04), T.dark, 0, 0.72, -0.1);
  vCab(g, WM, 2.6, 4.55, 2.4, 0.9, 2.9, { body: cabC, glass: T.glass, lamp: T.lamp, amber: T.amber });
  // 攪拌筒：軸從前上往後下斜（前端高），parts.drum 的 Z 軸＝筒的軸
  const drum = new THREE.Group();
  drum.position.set(0, 2.25, -1.0);
  drum.rotation.x = 0.24; // 後端（−Z）往上翹：實際的攪拌車開口在後上方
  g.add(drum);
  P(
    drum,
    D.lathe(
      [
        [0.1, -2.75],
        [0.62, -2.55],
        [1.05, -1.7],
        [1.22, -0.4],
        [1.18, 0.9],
        [0.95, 1.85],
        [0.5, 2.35],
        [0.1, 2.45],
      ],
      26,
    ),
    drumC,
    0,
    0,
    0,
    HP,
  );
  // 筒身的螺旋線（外面看得到的焊縫）與筒口
  for (let i = 0; i < 10; i++) {
    const a = i * 0.9,
      z = -2.0 + i * 0.42,
      r = 1.2 - Math.abs(i - 4) * 0.035;
    K.bx(drum, T.dark, 0.06, 0.06, 0.5, Math.cos(a) * r, Math.sin(a) * r, z, 0, 0, a, 0.01);
  }
  K.cz(drum, T.steel, 0.55, 0.25, 0, 0, -2.75, 20); // 筒口（後）
  K.cz(drum, T.dark, 1.24, 0.12, 0, 0, 1.2, 26); // 驅動的齒圈
  // 筒的支架：前面的減速機座、後面的托輪架
  P(g, D.box(1.0, 1.3, 0.4, 0.05), T.dark, 0, 1.55, 1.95);
  K.cz(g, T.steel, 0.35, 0.4, 0, 2.0, 1.75, 16);
  for (const s of [-1, 1]) P(g, D.box(0.18, 1.6, 0.3, 0.03), T.dark, s * 0.75, 1.8, -3.55);
  P(g, D.box(1.7, 0.2, 0.4, 0.03), T.dark, 0, 2.6, -3.55);
  // 進料斗、卸料槽（後）
  P(
    g,
    D.lathe(
      [
        [0.25, 0],
        [0.62, 0.6],
        [0.7, 0.7],
      ],
      14,
    ),
    T.dark,
    0,
    3.3,
    -4.05,
  );
  K.bx(g, T.steel, 0.42, 0.12, 1.6, 0, 2.2, -4.55, 0.55, 0, 0, 0.02);
  for (const s of [-1, 1]) K.bx(g, T.steel, 0.04, 0.22, 1.6, s * 0.22, 2.3, -4.55, 0.55, 0, 0, 0.01);
  // 水箱（駕駛室後面）、後面的爬梯與平台
  K.cz(g, T.white, 0.42, 1.0, 0.85, 1.55, 2.05, 16);
  for (let i = 0; i < 6; i++) K.bx(g, T.dark, 0.5, 0.04, 0.05, 0.6, 1.0 + i * 0.38, -4.3, 0, 0, 0, 0.005);
  for (const s of [0.35, 0.85]) K.bx(g, T.dark, 0.04, 2.4, 0.05, s, 2.0, -4.3, 0, 0, 0, 0.005);
  P(g, D.box(0.8, 0.06, 0.6, 0.01), T.dark, 0.6, 3.2, -4.25);
  K.railing(
    g,
    T.yellow,
    [
      [0.25, -4.0],
      [0.25, -4.55],
      [0.95, -4.55],
    ],
    3.22,
    0.5,
    0.02,
  );
  axles(g, WM, [3.7, -2.0, -3.2], 0.95, 0.52, 0.34, wheels, [-2.0, -3.2]);
  fenders(g, T.dark, [-2.0, -3.2], 0.95, 0.52, 0.34);
  for (const s of [-1, 1]) door(g, T, s, s * 1.21, 2.75, 3.75, 1.0, 2.5);
  wipers(g, T, 2.2, 2.25, 4.55, -0.3);
  plate(g, T, 0.7, 4.62, 1);
  plate(g, T, 0.75, -4.48, -1);
  tail(g, T, WM, -4.5, 2.0, 1.0);
  mudflaps(g, T, 0.95, -3.75, 0.52);
  markers(g, T, 1.22, 1.0, [3.0, 0.5, -1.5, -3.8]);
  underbody(g, T, 3.7, -3.2, 0.5, [3.7, -2.0, -3.2], 1.8);
  fine(() => {
    K.boltRow(g, T.steel, -0.4, 0.4, 2.6, -3.34, 5, 0.02, 1);
    K.hazard(g, T.yellow, T.dark, 2.2, 0.14, 0.02, 0, 0.62, -4.52, Math.PI, 10);
  });
  bakeAll(g, { tint: TINT, cache: 'cineveh:mixer' });
  return { group: g, wheels, parts: { drum }, len: 9.2 };
}
