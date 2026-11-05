// 主題變體：同一個主題的不同場景構成（主線的區段與自由出擊共用；設計見 docs/campaign-design.md 5.5）。
// 欄位：name、theme（覆寫主題欄位：地形特徵、公路、岩頂、光線、顏色…）、terrain(w)（回傳 (x, z, h) → h 的地形修改，
// 參數用自己的亂數串 makeRng）、build(w)（在一般物件之後加的結構，於關卡生成的 withRng 內呼叫）。
// 不帶變體時 World 完全照原本生成（現有地圖不變）。本模組不可 import world.js，World 一律用參數 w。
import { clamp, makeRng, pick, rnd, rndi } from '../core/math.js';
import { MS, WS } from '../core/scale.js';
import {
  DETAIL,
  ISO,
  PK,
  box,
  buildContainer,
  buildContainerStack as buildIsoStack,
  buildIceSheet,
  cyl,
  door,
  humanLadder,
  markText,
  mat,
  propGlb,
  rockPile,
} from './prop-models.js';
import { D, vcMat } from '../render/detail.js';
import * as K from '../render/dev-kit.js';
import { CAR, FLOODED, buildBentLamp, buildRuinTower, buildWreckCar } from './themes/flooded.js';
import { planIslands } from './themes/xylem.js';
import { buildCavePillar, buildCoralTank, buildLab } from './themes/institute.js';
import { buildChimney, buildScrapHeap, buildShack } from './themes/grid086.js';
import {
  BLAST_WALL,
  CARGO_POD,
  ROCKET,
  TOWER,
  buildBlastWall,
  buildCargoPod,
  buildLaunchTower,
} from './themes/spaceport.js';

// 機甲三倍高改版（docs/world-scale.md）：地形與給機甲用的結構乘 G、機甲的通行與間距乘 MS，物件照現實尺寸
const G = WS;
const M = {
  concrete: mat(0x8e8a82, { roughness: 0.95, metalness: 0.02 }),
  concreteD: mat(0x6a665f, { roughness: 0.95, metalness: 0.02 }),
  rust: mat(0x8a5a36, { roughness: 0.85 }),
  rustD: mat(0x5e3e28, { roughness: 0.9 }),
  steel: mat(0x9aa0a6, { metalness: 0.5 }),
  pipe: mat(0xa88c56),
  yellow: mat(0xc8a040),
  stripe: mat(0xd8d2c0),
  dark: mat(0x2a2c2e),
  rock: mat(0x4a3c32, { roughness: 1, metalness: 0 }),
  crystal: new THREE.MeshStandardMaterial({
    color: 0x7fe0ff,
    emissive: 0x3aa8ff,
    emissiveIntensity: 1.1,
    roughness: 0.2,
    metalness: 0.1,
    flatShading: true,
  }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc060, emissiveIntensity: 1.4 }),
};

// ---------- 網格（純函式，尺寸由參數決定） ----------
// 廢工廠廠房：w×d、高 h，屋頂破洞、一側有大門開口（原點在地面中心）
export function buildFactoryHall(w, d, h) {
  // 廢工廠：混凝土的牆（壁柱、窗洞、裂縫、污漬）＋殘存的屋頂桁架與鏽蝕的屋頂板＋大門（門楣、捲門的殘骸）＋煙囪（爬梯、箍）
  const k = new PK();
  const t = 0.8,
    Dt = DETAIL;
  k.box(M.concrete, w, h, t, 0, h / 2, -d / 2);
  k.box(M.concrete, t, h, d, -w / 2, h / 2, 0);
  k.box(M.concrete, t, h, d, w / 2, h / 2, 0);
  const gw = Math.min(18, w * 0.5); // 大門寬（機甲通得過），門楣以下 70% 的高度
  for (const s of [-1, 1]) k.box(M.concrete, (w - gw) / 2, h, t, s * (gw / 2 + (w - gw) / 4), h / 2, d / 2);
  k.box(M.concreteD, gw, h * 0.3, t, 0, h * 0.85, d / 2);
  k.box(M.rustD, w * 0.55, 0.5, d, -w * 0.22, h + 0.25, 0);
  for (let x = -w / 2 + 3; x < w / 2; x += 4) k.box(M.rust, 0.4, 0.6, d, x, h + 0.3, 0);
  k.cyl(M.concreteD, 0.9, 1.1, h * 1.8, w / 2 - 2, h * 0.9, -d / 2 + 2, 0, 0, 0, 14);
  // 壁柱與窗洞
  for (let x = -w / 2 + 4; x < w / 2 - 1; x += 6) {
    k.box(M.concreteD, 0.8, h, 0.4, x, h / 2, -d / 2 - 0.4);
    k.box(M.dark, 2.6, 2.2, t + 0.04, x + 3, h * 0.6, -d / 2);
  }
  for (let z = -d / 2 + 4; z < d / 2 - 1; z += 6)
    for (const s of [-1, 1]) {
      k.box(M.concreteD, 0.4, h, 0.8, s * (w / 2 + 0.4), h / 2, z);
      k.box(M.dark, t + 0.04, 2.2, 2.6, s * (w / 2), h * 0.6, z + 3);
    }
  // 殘存的屋頂桁架（每 4 m，從一側伸出、斷在中途）
  for (let x = -w / 2 + 3; x < w / 2; x += 4) {
    const L = d * (0.45 + ((x * 7) % 5) * 0.08);
    k.at(x, h, -d / 2, 0, 0, 0, () => {
      k.box(M.rust, 0.3, 0.3, L, 0, 0.6, L / 2);
      k.box(M.rust, 0.25, 0.25, L, 0, -0.2, L / 2);
      for (let z = 0; z < L - 1; z += 2) k.bar(M.rust, [0, -0.2, z], [0, 0.6, z + 1], 0.12);
    });
  }
  k.fine(() => {
    // 窗框的殘骸、牆上的裂縫與水漬、門楣的招牌、捲門的殘片、煙囪的爬梯與箍、牆腳的瓦礫
    for (let x = -w / 2 + 4; x < w / 2 - 1; x += 6) {
      for (const dx of [-0.9, 0, 0.9]) k.box(M.rustD, 0.08, 2.2, 0.1, x + 3 + dx, h * 0.6, -d / 2 + 0.45);
      k.box(M.concreteD, 0.06, h * 0.4, 0.02, x + 1.2, h * 0.35, -d / 2 + 0.41, 0, 0, 0.3);
      k.box(mat(0x4e4a44, { roughness: 1 }), 1.2, h * 0.5, 0.02, x + 4.5, h * 0.5, -d / 2 + 0.41);
    }
    k.box(M.stripe, gw * 0.6, 1.6, 0.1, 0, h * 0.85, d / 2 + 0.45);
    markText(k, M.dark, -gw * 0.25, h * 0.85, d / 2 + 0.52, 0.9, gw * 0.5, 0, 2);
    for (let i = 0; i < 5; i++)
      k.box(
        M.rust,
        gw * 0.18,
        0.05,
        0.5,
        -gw / 2 + 1 + i * gw * 0.2,
        h * 0.68 - (i % 2) * 0.4,
        d / 2 + 0.3,
        0.2 * (i % 3),
        0,
        0.1 * i,
      );
    const cx = w / 2 - 2,
      cz = -d / 2 + 2;
    for (let y = 2; y < h * 1.75; y += h * 0.3)
      k.cyl(
        M.rustD,
        1.15 - (y / (h * 1.8)) * 0.2 + 0.05,
        1.15 - (y / (h * 1.8)) * 0.2 + 0.05,
        0.25,
        cx,
        y,
        cz,
        0,
        0,
        0,
        16,
      );
    humanLadder(k, M.rustD, h * 1.7, cx, 0, cz + 1.15, 0, true);
    for (let i = 0; i < 8; i++)
      K.bx(
        k,
        M.concreteD,
        0.6 + (i % 3) * 0.3,
        0.3,
        0.5,
        -w / 2 + 1 + i * (w / 8),
        0.15,
        -d / 2 + 1.2 + (i % 2) * 0.6,
        0,
        i,
        0.15,
        0.03,
      );
  });
  return k.build();
}
// 地面管線一段（長 len，沿 Z；管徑 1.1、離地 1.1；每 6 m 一個支座）
export function buildGroundPipe(len) {
  const k = new PK();
  const X = Math.PI / 2,
    Dt = DETAIL;
  k.cyl(M.pipe, 0.55, 0.55, len, 0, 1.1, 0, X, 0, 0, 16);
  for (let z = -len / 2 + 1; z < len / 2; z += 6) {
    k.cb(M.concreteD, 1.6, 0.6, 0.5, 0, 0.3, z, 0, 0, 0, 0.05);
    k.cyl(M.rust, 0.7, 0.7, 0.3, 0, 1.1, z, X, 0, 0, 16);
  }
  k.fine(() => {
    // 管鞍與 U 型管箍、法蘭的螺栓、保溫外皮的接縫、標示帶與箭頭、支座的錨栓
    for (let z = -len / 2 + 1; z < len / 2; z += 6) {
      k.geo(Dt.steel, new THREE.TorusGeometry(0.6, 0.04, 4, 14, Math.PI), 0, 1.1, z + 0.3);
      for (const s of [-1, 1]) K.cy(k, Dt.steel, 0.04, 0.08, s * 0.6, 0.62, z + 0.3, 6);
      for (let j = 0; j < 10; j++) {
        const a = (j / 10) * Math.PI * 2;
        K.cz(k, Dt.steel, 0.035, 0.36, Math.cos(a) * 0.63, 1.1 + Math.sin(a) * 0.63, z, 6);
      }
    }
    for (let z = -len / 2 + 2.5; z < len / 2; z += 1.5)
      k.cyl(M.rustD, 0.56, 0.56, 0.03, 0, 1.1, z, X, 0, 0, 16);
    for (let z = -len / 2 + 4; z < len / 2; z += 12) {
      k.cyl(M.yellow, 0.565, 0.565, 0.25, 0, 1.1, z, X, 0, 0, 16);
      k.prism(
        M.stripe,
        [
          [-0.12, 0],
          [0.12, 0],
          [0, 0.35],
        ],
        0.02,
        0,
        1.66,
        z + 0.5,
        X,
        0,
        0,
      );
    }
  });
  return k.build();
}
// 泵站：方形機房＋兩座儲槽
export function buildPumpStation() {
  const k = new PK();
  const Dt = DETAIL;
  k.cb(M.concrete, 8, 5, 6, 0, 2.5, 0, 0, 0, 0, 0.1);
  k.cb(M.rustD, 8.4, 0.5, 6.4, 0, 5.2, 0, 0, 0, 0, 0.06);
  k.cyl(M.pipe, 2, 2, 6, -6.5, 3, 0, 0, 0, 0, 20);
  k.cyl(M.pipe, 1.6, 1.6, 5, 6, 2.5, 1, 0, 0, 0, 20);
  k.box(M.yellow, 1, 3, 1, 0, 6.5, 0);
  // 儲槽的頂蓋、機房與儲槽之間的管線、泵浦
  K.lathe(
    k,
    M.pipe,
    [
      [0, 0],
      [2.05, 0],
      [1.6, 0.5],
      [0.3, 0.7],
      [0, 0.7],
    ],
    -6.5,
    6,
    0,
    'y',
    20,
  );
  K.lathe(
    k,
    M.pipe,
    [
      [0, 0],
      [1.65, 0],
      [1.3, 0.4],
      [0.25, 0.55],
      [0, 0.55],
    ],
    6,
    5,
    1,
    'y',
    20,
  );
  K.pipe(
    k,
    M.steel,
    [
      [-4.5, 1.2, 0],
      [-4, 1.2, 0],
    ],
    0.35,
    12,
  );
  K.pipe(
    k,
    M.steel,
    [
      [4, 1.0, 1],
      [4.4, 1.0, 1],
    ],
    0.3,
    12,
  );
  K.pipe(
    k,
    M.steel,
    [
      [-6.5, 6.6, 0],
      [-6.5, 7.4, 0],
      [-3.5, 7.4, 0],
      [-3.5, 5.4, 0],
    ],
    0.25,
    10,
  );
  k.fine(() => {
    // 機房的門、百葉、屋頂的排風扇、儲槽的焊縫與爬梯、法蘭、閥門手輪、配電箱、警示牌
    door(k, M.dark, Dt.steel, 1.5, 0, 3.02, 0);
    K.vents(k, M.dark, M.concreteD, 1.6, 0.8, -1.5, 3.6, 3.02, 0, 5);
    K.vents(k, M.dark, M.concreteD, 1.6, 0.8, 2.5, 3.6, -3.02, Math.PI, 5);
    for (const x of [-2, 2]) {
      K.cy(k, M.steel, 0.6, 0.5, x, 5.7, -1, 16, 0.04);
      K.cy(k, M.dark, 0.5, 0.05, x, 5.97, -1, 16);
    }
    for (const [x, z, r, hh] of [
      [-6.5, 0, 2, 6],
      [6, 1, 1.6, 5],
    ]) {
      for (let y = 1.2; y < hh; y += 1.2) k.cyl(M.rustD, r + 0.02, r + 0.02, 0.04, x, y, z, 0, 0, 0, 20);
      humanLadder(k, M.steel, hh, x, 0, z + r + 0.05, 0, true);
    }
    for (const [x, z] of [
      [-4.4, 0],
      [4.3, 1],
    ]) {
      K.cy(k, Dt.red, 0.3, 0.05, x, 2.0, z, 12);
      K.cy(k, M.steel, 0.05, 0.6, x, 1.6, z, 6);
    }
    K.bx(k, mat(0x8a9096), 1.2, 1.4, 0.4, 3, 1.4, 3.2, 0, 0, 0, 0.04);
    k.box(Dt.yellow, 0.4, 0.4, 0.02, 3, 1.7, 3.41);
    markText(k, M.dark, -3.5, 4.4, 3.02, 0.35, 3, 0, 1);
  });
  return k.build();
}
// 紐澤西護欄（長 4 m）；GLB 原點在底面中心、沿 X
export function buildBarrier() {
  const glb = propGlb('barrier', { fade: true });
  if (glb) return glb;
  const k = new PK().bounds(-2, 0, -0.45, 2, 1.1, 0.45);
  // 紐澤西斷面（擠出）＋缺角露出的鋼筋＋鏽色的擦痕＋連結環＋叉車槽＋反光片
  k.prism(
    M.stripe,
    [
      [-0.45, 0],
      [0.45, 0],
      [0.45, 0.1],
      [0.3, 0.45],
      [0.12, 1.1],
      [-0.12, 1.1],
      [-0.3, 0.45],
      [-0.45, 0.1],
    ],
    3.96,
    0,
    0,
    0,
    0,
    Math.PI / 2,
    0,
  );
  k.box(M.rust, 0.8, 0.4, 0.3, -1, 0.9, 0);
  k.fine(() => {
    for (let i = 0; i < 3; i++)
      K.cy(k, M.rustD, 0.015, 0.5, -1.25 + i * 0.25, 1.05, 0, 5, 0, undefined, 0.3, 0, (i - 1) * 0.3);
    for (const sz of [-1, 1]) {
      for (const x of [-1.1, 1.1]) k.box(M.dark, 0.6, 0.1, 0.02, x, 0.05, sz * 0.452);
      k.box(DETAIL.lamp, 0.1, 0.1, 0.02, 0.6, 0.75, sz * 0.2 + sz * 0.02, sz * 0.25, 0, 0);
      k.box(M.dark, 1.4, 0.05, 0.01, 0.4, 0.3, sz * 0.36, 0, 0, 0.04);
    }
    for (const ex of [-1, 1])
      k.geo(DETAIL.steel, new THREE.TorusGeometry(0.07, 0.018, 4, 8), ex * 1.98, 0.7, 0, 0, Math.PI / 2, 0);
  });
  return k.build();
}
// 燒毀的車輛
export function buildCarWreck() {
  const k = new PK();
  const burnt = mat(0x2a2624, { roughness: 1 });
  // 外框同原本（車身、車廂、4 輪）
  k.ob(2, 0.9, 4.4, 0, 0.75, 0).ob(1.8, 0.7, 2.2, 0, 1.5, -0.3);
  // 車身側面輪廓（引擎蓋、擋風、車頂、後廂）沿 X 擠出、燒焦的車頂、空的車窗、輪框（輪胎燒光）、保險桿掉了一邊
  k.prism(
    M.rustD,
    [
      [-2.2, 0.35],
      [2.2, 0.35],
      [2.2, 1.0],
      [1.4, 1.1],
      [0.8, 1.8],
      [-1.0, 1.85],
      [-1.6, 1.15],
      [-2.2, 1.1],
    ],
    1.9,
    0,
    0,
    0,
    0,
    Math.PI / 2,
    0,
  );
  for (const s of [-1, 1]) k.box(M.dark, 0.04, 0.5, 1.6, s * 0.96, 1.45, -0.1);
  k.box(M.dark, 1.6, 0.55, 0.05, 0, 1.45, 1.1, -0.9, 0, 0);
  k.box(burnt, 1.7, 0.03, 1.6, 0, 1.86, -0.1);
  for (const [x, z] of [
    [-1, -1.4],
    [1, -1.4],
    [-1, 1.4],
    [1, 1.4],
  ]) {
    k.geo(M.dark, D.rim(0.3, 0.22, 5, 5), x, 0.32, z, 0, x > 0 ? 0 : Math.PI, 0);
    k.cyl(burnt, 0.12, 0.12, 0.3, x, 0.32, z, 0, 0, Math.PI / 2, 8);
  }
  k.fine(() => {
    // 鏽斑與燒焦的漸層、彈孔、掉一半的保險桿、打開的引擎蓋、焦黑的地面
    for (const s of [-1, 1]) {
      k.box(burnt, 0.02, 0.4, 3.6, s * 0.955, 0.75, 0);
      for (const [y, z] of [
        [0.8, -0.6],
        [1.0, 0.3],
        [0.65, 1.2],
      ])
        K.cy(k, M.dark, 0.05, 0.02, s * 0.96, y, z, 6, 0, undefined, 0, 0, Math.PI / 2);
    }
    k.box(M.dark, 1.9, 0.2, 0.12, 0.4, 0.3, -2.25, 0, 0, 0.3);
    k.box(M.rustD, 1.7, 0.04, 1.0, 0, 1.35, -1.6, -0.7, 0, 0);
    k.geo(mat(0x1a1816, { roughness: 1 }), D.cyl(2.4, 2.4, 0.02, 16), 0, 0.01, 0);
  });
  return k.build();
}
// 小型結晶簇（發光，高約 h）
export function buildCrystal(h) {
  const k = new PK();
  const C = [
    [0, 0, 0.35, 1, 0, 0],
    [0.45, 0.25, 0.25, 0.7, 0.35, 0.2],
    [-0.4, 0.2, 0.22, 0.6, -0.4, 0.1],
    [0.1, -0.45, 0.2, 0.5, 0.2, -0.4],
  ];
  // 外框同原本（四根錐）；尖柱改成六角稜柱＋錐頂（結晶的形狀）、底下的岩床與細碎的小結晶
  for (const [x, z, r, kk, rx, rz] of C) {
    const R = r * h * 0.5,
      H = h * kk;
    k.obMesh(new THREE.ConeGeometry(R, H, 6), x * h * 0.4, H / 2 - 0.2, z * h * 0.4, rx, 0, rz);
    k.at(x * h * 0.4, H / 2 - 0.2, z * h * 0.4, rx, 0, rz, () => {
      k.geo(
        M.crystal,
        D.lathe(
          [
            [0, -H / 2],
            [R * 0.75, -H / 2],
            [R * 0.85, H * 0.1],
            [R * 0.55, H * 0.3],
            [0, H / 2],
          ],
          6,
        ),
      );
    });
  }
  k.fine(() => {
    for (let i = 0; i < 6; i++) {
      const a = i * 1.1 + 0.3,
        R = h * 0.05,
        H = h * (0.18 + (i % 3) * 0.08);
      k.geo(
        M.crystal,
        new THREE.ConeGeometry(R, H, 6),
        Math.cos(a) * h * 0.35,
        H / 2 - 0.1,
        Math.sin(a) * h * 0.35,
        Math.cos(a) * 0.5,
        0,
        -Math.sin(a) * 0.5,
      );
    }
    k.geo(M.rock, D.rock(7, 1, 0.3, 0.75, 0.3), 0, 0, 0, 0, 0, 0, h * 0.35, h * 0.12, h * 0.32);
  });
  return k.build();
}
// 鹽柱（沙丘「鹽灘平原」；高 h）
export function buildSaltPillar(h) {
  const m = vcMat(mat(0xe8e2d0, { roughness: 0.9, metalness: 0 }));
  // 層理明顯的雜訊岩石（主柱＋側邊的小柱＋腳邊的鹽塊），合併成一個網格
  const sd = (Math.floor(h * 7) % 20) + 2;
  const list = [
    [D.rock(sd, 4, 0.22, 0.95, 0.85), 0, h * 0.5, 0, 0.75, h * 0.5, 0.75, 0],
    [D.rock(sd + 1, 3, 0.25, 0.9, 0.85), 0.5, h * 0.2, 0.3, 0.45, h * 0.2, 0.45, 0.6],
  ];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6;
    list.push([
      D.rock(i + 11, 1, 0.3, 0.7, 0.5),
      Math.cos(a) * 1.1,
      0.08,
      Math.sin(a) * 1.1,
      0.25,
      0.15,
      0.25,
      a,
    ]);
  }
  const g = new THREE.Group();
  g.add(rockPile(list, m));
  return g;
}
// 倉庫：w×d、高 h；長邊兩面各一個 16 m 寬、GATE_H 高的大門（機甲通得過），屋頂只有桁架（俯視鏡頭看得進去）
export const WH_GATE = [16, 13];
export function buildWarehouse(w, d, h, color) {
  const k = new PK();
  const m = mat(color, { roughness: 0.8, metalness: 0.3 });
  const t = 0.6,
    [gw, gh] = WH_GATE;
  for (const s of [-1, 1]) {
    for (const kk of [-1, 1]) k.box(m, (w - gw) / 2, h, t, kk * (gw / 2 + (w - gw) / 4), h / 2, (s * d) / 2);
    k.box(m, gw, h - gh, t, 0, gh + (h - gh) / 2, (s * d) / 2);
    k.box(m, t, h, d, (s * w) / 2, h / 2, 0);
    k.box(M.yellow, w + 0.2, 0.5, 0.2, 0, 0.9, (s * (d + t)) / 2);
  }
  for (let x = -w / 2 + 2; x < w / 2; x += 4) k.box(M.steel, 0.4, 0.8, d, x, h + 0.4, 0);
  k.box(M.dark, w, 0.5, 1.2, 0, h + 0.25, 0);
  // 小細節：浪板的直肋、屋頂桁架的斜桿、大門的導軌與警示斜紋、壁燈、落水管、門邊的人用門
  k.fine(() => {
    for (const s of [-1, 1]) {
      const z = (s * (d + t)) / 2;
      for (let x = -w / 2 + 0.5; x < w / 2; x += 0.9)
        if (Math.abs(x) > gw / 2 + 0.3) k.box(m, 0.1, h - 1.5, 0.05, x, h / 2 + 0.5, z);
      for (const x of [-gw / 2 - 0.2, gw / 2 + 0.2]) k.box(M.dark, 0.3, gh, 0.3, x, gh / 2, z);
      k.box(M.dark, gw + 0.8, 0.4, 0.3, 0, gh + 0.2, z);
      K.hazard(k, M.yellow, M.dark, gw, 0.4, 0.04, 0, gh - 0.3, z + s * 0.2, 0);
      for (const x of [-gw / 2 - 2, gw / 2 + 2]) {
        K.bx(k, M.dark, 0.5, 0.3, 0.4, x, gh + 1.2, z + s * 0.3, 0, 0, 0, 0.03);
        k.box(DETAIL.lamp, 0.4, 0.04, 0.3, x, gh + 1.04, z + s * 0.32);
      }
      door(k, M.dark, DETAIL.steel, -gw / 2 - 4, 0, z + s * 0.05, s > 0 ? 0 : Math.PI);
    }
    for (const sx of [-1, 1])
      K.pipe(
        k,
        M.dark,
        [
          [sx * (w / 2 + 0.4), h, d / 2 - 0.6],
          [sx * (w / 2 + 0.4), 0.2, d / 2 - 0.6],
        ],
        0.1,
        6,
      );
    for (let x = -w / 2 + 2; x < w / 2; x += 4)
      for (let z = -d / 2 + 1; z < d / 2 - 1; z += 3)
        k.bar(M.steel, [x, h + 0.1, z], [x, h + 0.7, z + 1.5], 0.08);
  });
  return k.build();
}
// 有蓋貨車：長 len、寬 3、高 4（含台車）
export function buildBoxcar(len, color) {
  const k = new PK();
  const cm = mat(color, { roughness: 0.75 });
  k.box(cm, 3, 3.2, len, 0, 2.6, 0);
  k.box(M.dark, 3.2, 0.3, len + 0.2, 0, 4.3, 0);
  k.box(M.rustD, 3.05, 2.4, 2.4, 0, 2.5, 0);
  for (const s of [-1, 1]) k.box(M.dark, 2.4, 0.8, 2.6, 0, 0.6, s * len * 0.32);
  // 台車的鋼輪（剖面旋轉、有輪緣）與側架、底盤、聯結器
  for (const s of [-1, 1])
    for (const dz of [-0.85, 0.85])
      for (const sx of [-1, 1])
        k.geo(
          M.steel,
          D.rim(0.42, 0.14, 0, 0),
          sx * 0.75,
          0.42,
          s * len * 0.32 + dz,
          0,
          sx > 0 ? 0 : Math.PI,
          0,
        );
  k.box(M.dark, 2.6, 0.4, len - 0.6, 0, 1.1, 0);
  for (const s of [-1, 1]) {
    k.box(M.dark, 0.4, 0.4, 0.8, 0, 1.0, s * (len / 2 + 0.3));
    K.cy(k, M.dark, 0.2, 0.15, 0, 1.0, s * (len / 2 + 0.7), 10, 0, undefined, Math.PI / 2, 0, 0);
  }
  k.fine(() => {
    // 車身的直肋、滑門的導軌與門閂、爬梯與扶手、車頂的步道、標記與編號、台車的彈簧
    for (const sx of [-1, 1]) {
      for (let z = -len / 2 + 0.4; z < len / 2; z += 0.8)
        if (Math.abs(z) > 1.3) k.box(cm, 0.06, 3.0, 0.12, sx * 1.52, 2.6, z);
      k.box(M.steel, 0.08, 0.1, 5, sx * 1.55, 3.85, 0);
      k.box(M.steel, 0.08, 0.1, 5, sx * 1.55, 1.25, 0);
      K.handle(k, M.steel, 0.4, sx * 1.56, 2.4, 0.9, (sx * Math.PI) / 2, 0.08, 0.02);
      humanLadder(k, M.steel, 3.2, sx * 1.55, 1.0, len / 2 - 0.4, (sx * Math.PI) / 2, false);
      markText(k, M.stripe, len / 2 - 4.5, 3.4, sx * 1.6, 0.3, 3, sx > 0 ? Math.PI / 2 : -Math.PI / 2, 2);
      for (const s of [-1, 1])
        for (const dz of [-0.3, 0.3]) K.cy(k, M.steel, 0.12, 0.35, sx * 0.95, 0.75, s * len * 0.32 + dz, 8);
    }
    k.box(M.rustD, 0.7, 0.08, len - 0.4, 0, 4.48, 0);
  });
  return k.build();
}
// 軌道（裝飾，長 len 沿 Z）
export function buildTrack(len) {
  const k = new PK();
  // 鋼軌（工字斷面擠出）＋枕木（木紋的裂痕）＋扣件＋道碴
  for (const s of [-1, 1])
    k.prism(
      M.steel,
      [
        [-0.075, 0],
        [0.075, 0],
        [0.075, 0.03],
        [0.02, 0.05],
        [0.02, 0.12],
        [0.04, 0.13],
        [0.04, 0.18],
        [-0.04, 0.18],
        [-0.04, 0.13],
        [-0.02, 0.12],
        [-0.02, 0.05],
        [-0.075, 0.03],
      ],
      len,
      s * 0.75,
      0.05,
      0,
    );
  const ballast = mat(0x6e6558, { roughness: 1, metalness: 0 });
  k.prism(
    ballast,
    [
      [-1.6, 0],
      [1.6, 0],
      [1.3, 0.08],
      [-1.3, 0.08],
    ],
    len,
    0,
    -0.02,
    0,
  );
  for (let z = -len / 2 + 0.6; z < len / 2; z += 1.2) k.box(M.rustD, 2.4, 0.1, 0.35, 0, 0.03, z);
  k.fine(() => {
    for (let z = -len / 2 + 0.6; z < len / 2; z += 1.2)
      for (const s of [-1, 1]) {
        k.box(M.dark, 0.3, 0.04, 0.2, s * 0.75, 0.1, z);
        for (const ox of [-0.11, 0.11]) K.cy(k, M.dark, 0.025, 0.06, s * 0.75 + ox, 0.12, z, 6);
      }
    for (let i = 0; i < Math.floor(len / 1.5); i++)
      k.geo(
        ballast,
        D.rock(i + 3, 1, 0.4, 0.6, 0),
        (((i * 7) % 5) - 2) * 0.6,
        0.06,
        -len / 2 + i * 1.5 + 0.7,
        0,
        i,
        0,
        0.12,
        0.06,
        0.12,
      );
  });
  return k.build();
}
// 岸壁起重機：四支腳（沿 Z 相距 16、沿 X 相距 12），吊臂沿 +X 伸向海面（高約 30 m）
export const QUAY_S = 2.2; // 現實尺寸：舊模型放大 2.2 倍（高約 66 m、吊臂 100 m）
export function buildQuayCrane() {
  const k = new PK();
  k.scaled(QUAY_S, () => {
    for (const x of [-6, 6]) for (const z of [-8, 8]) k.box(M.yellow, 1.2, 24, 1.2, x, 12, z);
    for (const z of [-8, 8]) k.box(M.yellow, 14, 1.6, 1.4, 0, 24.5, z);
    k.box(M.yellow, 46, 1.8, 3, 14, 27, 0);
    k.box(M.concrete, 6, 4, 6, -4, 28, 0);
    k.box(M.steel, 0.6, 8, 0.6, -4, 33, 0);
    k.box(M.dark, 4, 1.2, 3, 18, 25.4, 0);
    k.box(M.dark, 0.08, 12, 0.08, 18, 19, 0);
    for (const s of [-1, 1]) k.box(M.steel, 0.5, 0.5, 18, s * 6, 12, 0);
    // 腳的 X 斜撐、吊臂下弦與桁架、A 字形頂架與拉索、行走台車與車輪、機房的窗、吊具
    for (const x of [-6, 6]) {
      k.bar(M.yellow, [x, 2, -8], [x, 22, 8], 0.5);
      k.bar(M.yellow, [x, 2, 8], [x, 22, -8], 0.5);
    }
    for (const z of [-8, 8]) {
      k.bar(M.yellow, [-6, 4, z], [6, 22, z], 0.4);
      k.cb(M.dark, 2, 1.2, 3, -6, 0.6, z, 0, 0, 0, 0.1);
      k.cb(M.dark, 2, 1.2, 3, 6, 0.6, z, 0, 0, 0, 0.1);
    }
    for (const s of [-1, 1]) k.box(M.yellow, 46, 0.5, 0.5, 14, 25.6, s * 1.2);
    for (let x = -8; x < 36; x += 3)
      for (const s of [-1, 1]) k.bar(M.yellow, [x, 25.6, s * 1.2], [x + 1.5, 26.2, s * 1.4], 0.25);
    for (const s of [-1, 1]) {
      k.bar(M.yellow, [-6, 28, s * 1.4], [-2, 38, 0], 0.5);
      k.bar(M.yellow, [2, 28, s * 1.4], [-2, 38, 0], 0.5);
    }
    k.pipe(M.dark, [-2, 38, 0], [30, 27.9, 0], 0.08, 4);
    k.pipe(M.dark, [-2, 38, 0], [-10, 28, 0], 0.08, 4);
    k.box(M.dark, 6.2, 1.2, 6.2, -4, 29, 0);
    k.cb(M.dark, 4, 1.2, 2.4, 18, 12.4, 0, 0, 0, 0, 0.1);
  });
  k.fine(() => {
    k.scaled(QUAY_S, () => {
      for (const s of [-1, 1])
        for (let x = -6.5; x < -1.5; x += 1.2) k.box(DETAIL.glass, 0.9, 1.0, 0.05, x, 28.4, s * 3.02);
      for (const x of [-6, 6])
        for (const z of [-8, 8])
          for (const dz of [-0.8, 0.8]) K.cx(k, M.steel, 0.35, 1.4, x, 0.35, z + dz, 12);
      for (let x = 0; x < 34; x += 6) k.box(M.dark, 0.3, 0.6, 0.3, x, 27.9, 1.6);
      K.cy(k, DETAIL.red, 0.3, 0.4, -2, 38.4, 0, 8);
      for (const s of [-1, 1])
        for (const z of [-8, 8]) K.hazard(k, M.yellow, M.dark, 1.2, 1.2, 0.05, s * 6, 3, z + 0.62, 0);
    });
  });
  return k.build();
}
// 繫船柱（裝飾）
export function buildBollard() {
  const k = new PK();
  // 剖面旋轉的柱身（腰部收窄、頂部的帽）＋底板與錨栓＋纏繞的纜繩
  K.lathe(
    k,
    M.dark,
    [
      [0, 0],
      [0.5, 0],
      [0.5, 0.06],
      [0.42, 0.1],
      [0.36, 0.5],
      [0.4, 0.8],
      [0.52, 0.85],
      [0.5, 1.0],
      [0, 1.02],
    ],
    0,
    0,
    0,
    'y',
    16,
  );
  k.cb(M.dark, 1.1, 0.08, 1.1, 0, 0.04, 0, 0, 0, 0, 0.02);
  k.fine(() => {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) K.cy(k, M.steel, 0.04, 0.08, sx * 0.45, 0.1, sz * 0.45, 6);
    const rope = mat(0xb8a070, { roughness: 1 });
    k.geo(rope, K.loop(0.39, 0.05, 16), 0, 0.55, 0, 0.15, 0, 0);
    K.pipe(
      k,
      rope,
      [
        [0.4, 0.55, 0],
        [1.2, 0.3, 0.2],
        [2.2, 0.06, 0.5],
      ],
      0.05,
      6,
    );
  });
  return k.build();
}
// 攔砂壩一段：長 len（沿 X）、高 h、厚 3（原點在底面中心）
export function buildWeir(len, h) {
  const k = new PK();
  k.cb(M.concrete, len, h, 3, 0, h / 2, 0, 0, 0, 0, 0.06);
  k.cb(M.concreteD, len, 0.3, 3.3, 0, h + 0.15, 0, 0, 0, 0, 0.04);
  for (let x = -len / 2 + 2; x < len / 2; x += 4) k.box(M.dark, 0.6, 0.8, 0.4, x, 0.8, 1.6);
  // 小細節：施工縫、排水孔的水漬與苔、上游側的淤砂、頂部的防護欄
  k.fine(() => {
    for (let x = -len / 2 + 4; x < len / 2; x += 4) k.box(M.concreteD, 0.05, h, 3.04, x, h / 2, 0);
    for (let y = 1.2; y < h; y += 1.2) k.box(M.concreteD, len, 0.03, 3.02, 0, y, 0);
    for (let x = -len / 2 + 2; x < len / 2; x += 4)
      k.box(mat(0x4a5a3a, { roughness: 1 }), 0.5, 0.9, 0.02, x, 0.3, 1.52);
    k.geo(
      mat(0x6a5e4c, { roughness: 1, metalness: 0 }),
      D.rock(6, 1, 0.15, 0.9, 0.2),
      0,
      0.05,
      -2.3,
      0,
      0,
      0,
      len * 0.48,
      h * 0.12,
      1.0,
    );
    for (let x = -len / 2 + 0.5; x < len / 2; x += 1.5) k.box(M.steel, 0.05, 0.9, 0.05, x, h + 0.75, 1.45);
    k.box(M.steel, len, 0.05, 0.05, 0, h + 1.2, 1.45);
  });
  return k.build();
}
// 壓力水管：沿 Z 的粗水管一段（長 len、管徑 2.4），每 8 m 一個鞍座
export function buildPenstock(len) {
  const k = new PK();
  const X = Math.PI / 2;
  k.cyl(M.steel, 1.2, 1.2, len, 0, 2, 0, X, 0, 0, 20);
  for (let z = -len / 2 + 2; z < len / 2; z += 8) k.cb(M.concreteD, 3.2, 1.6, 1, 0, 0.8, z, 0, 0, 0, 0.06);
  // 補強環（每 2 m）、鞍座的弧形托座、伸縮接頭、檢修人孔、頂部的通氣閥
  for (let z = -len / 2 + 1; z < len / 2; z += 2) k.cyl(M.steel, 1.27, 1.27, 0.15, 0, 2, z, X, 0, 0, 20);
  k.fine(() => {
    for (let z = -len / 2 + 2; z < len / 2; z += 8) {
      k.geo(
        M.concreteD,
        D.lathe(
          [
            [1.3, -0.5],
            [1.6, -0.5],
            [1.6, 0.5],
            [1.3, 0.5],
          ],
          16,
          Math.PI * 0.6,
          Math.PI * 1.4,
        ),
        0,
        2,
        z,
        X,
        0,
        0,
      );
      for (const s of [-1, 1]) K.cy(k, DETAIL.steel, 0.05, 0.1, s * 1.3, 1.62, z, 6);
    }
    for (let z = -len / 2 + 6; z < len / 2; z += 16) {
      K.cy(k, M.steel, 0.4, 0.5, 0, 3.35, z, 14, 0.03);
      K.boltRing(k, DETAIL.steel, 0.36, 3.62, 10, 0.03, 0, z);
      K.cy(k, DETAIL.red, 0.12, 0.6, 0, 3.4, z + 3, 10);
    }
    for (let i = 0; i < 6; i++)
      k.box(
        mat(0x6a4a32, { roughness: 1 }),
        0.3,
        0.02,
        2.5,
        Math.cos(i) * 1.21,
        2 + Math.sin(i) * 1.21,
        -len / 2 + 3 + i * 3.1,
        0,
        0,
        i,
      );
  });
  return k.build();
}
// 汙染物桶（發光，高 1.2 m）；GLB 原點在底面中心
export function buildToxicDrum() {
  const glb = propGlb('toxic_drum', { fade: true });
  if (glb) return glb;
  const k = new PK();
  const dm = mat(0x8a9a2a, { roughness: 0.6 });
  // 桶身的波紋與捲邊、桶箍、凹痕、漏出的發光液體與泡泡、生物危害的標籤
  K.lathe(
    k,
    dm,
    [
      [0, 0],
      [0.44, 0],
      [0.45, 0.04],
      [0.45, 1.16],
      [0.44, 1.2],
      [0, 1.2],
    ],
    0,
    0,
    0,
    'y',
    18,
  );
  k.cyl(M.dark, 0.47, 0.47, 0.1, 0, 0.3, 0, 0, 0, 0, 18);
  k.cyl(M.dark, 0.47, 0.47, 0.1, 0, 0.9, 0, 0, 0, 0, 18);
  const glow = new THREE.MeshStandardMaterial({
    color: 0x9aff40,
    emissive: 0x6acc20,
    emissiveIntensity: 1.4,
  });
  k.cyl(glow, 0.3, 0.3, 0.05, 0, 1.22, 0, 0, 0, 0, 14);
  k.fine(() => {
    for (const y of [0.15, 0.6, 1.05]) K.cy(k, dm, 0.455, 0.03, 0, y, 0, 18);
    K.cy(k, M.dark, 0.06, 0.04, 0.25, 1.22, 0.1, 8);
    k.box(M.yellow, 0.35, 0.35, 0.02, 0, 0.6, 0.455);
    K.cy(k, M.dark, 0.1, 0.01, 0, 0.6, 0.47, 3, 0, undefined, Math.PI / 2, 0, 0);
    k.geo(glow, D.cyl(0.55, 0.65, 0.02, 14), 0.35, 0.01, 0.25);
    for (let i = 0; i < 3; i++)
      k.geo(glow, new THREE.SphereGeometry(0.04 + i * 0.015, 6, 4), 0.2 + i * 0.12, 0.03, 0.4 - i * 0.1);
  });
  return k.build();
}
// 防爆牆（冰原「前線基地」）：長 len、高 4.5 m，頂部積雪
export function buildSnowWall(len) {
  const k = new PK();
  const snow = mat(0xf2f6fa, { roughness: 1, metalness: 0 });
  k.cb(M.concrete, len, 4.5, 1.4, 0, 2.25, 0, 0, 0, 0, 0.06);
  k.cb(snow, len + 0.1, 0.35, 1.6, 0, 4.6, 0, 0, 0, 0, 0.12);
  for (let x = -len / 2 + 1.5; x < len / 2; x += 3) k.box(M.concreteD, 0.15, 4.4, 1.45, x, 2.2, 0);
  // 小細節：吊環、叉車槽、腳邊的積雪堆、噴漆的編號、冰柱、鐵絲網
  k.fine(() => {
    for (let x = -len / 2 + 0.75; x < len / 2; x += 3) {
      k.geo(DETAIL.steel, new THREE.TorusGeometry(0.1, 0.025, 4, 8, Math.PI), x, 4.78, 0, 0, Math.PI / 2, 0);
      for (const s of [-1, 1]) {
        k.box(M.dark, 0.6, 0.15, 0.02, x + 0.75, 0.15, s * 0.71);
        for (let i = 0; i < 3; i++)
          k.geo(
            snow,
            new THREE.ConeGeometry(0.05, 0.3 + i * 0.1, 4),
            x + i * 0.35,
            4.25,
            s * 0.78,
            Math.PI,
            0,
            0,
          );
      }
    }
    for (const s of [-1, 1])
      k.geo(snow, D.rock(3, 1, 0.12, 0.85, 0), 0, 0, s * 0.95, 0, 0, 0, len * 0.5, 0.45, 0.5);
    markText(k, M.dark, -len / 2 + 0.8, 2.6, 0.71, 0.5, len * 0.3, 0, 2);
    for (let x = -len / 2 + 0.5; x < len / 2; x += 2) K.cy(k, M.steel, 0.025, 0.8, x, 5.1, 0, 4);
    K.cable(k, M.steel, [-len / 2 + 0.5, 5.4, 0], [len / 2 - 0.5, 5.4, 0], 0.012, 0.1);
  });
  return k.build();
}
// 瞭望塔：四支腳＋小屋（高約 10 m）
export function buildWatchtower() {
  const k = new PK();
  const snow = mat(0xf2f6fa, { roughness: 1, metalness: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(M.steel, 0.3, 8, 0.3, sx * 1.4, 4, sz * 1.4);
  k.cb(M.concreteD, 4, 0.4, 4, 0, 8, 0, 0, 0, 0, 0.04);
  k.cb(M.concrete, 3.4, 2, 3.4, 0, 9.2, 0, 0, 0, 0, 0.06);
  k.cb(snow, 3.8, 0.3, 3.8, 0, 10.35, 0, 0, 0, 0, 0.1);
  k.box(M.lamp, 0.6, 0.4, 0.6, 1.6, 9.6, 1.6);
  // 腳的 X 斜撐與橫材、爬梯、觀察窗、平台的欄杆、探照燈、天線、沙包
  for (let y = 2; y < 8; y += 2.5)
    for (const s of [-1, 1]) {
      k.box(M.steel, 2.8, 0.12, 0.12, 0, y, s * 1.4);
      k.box(M.steel, 0.12, 0.12, 2.8, s * 1.4, y, 0);
      k.bar(M.steel, [-1.4, y - 2.5 < 0 ? 0.2 : y - 2.5, s * 1.4], [1.4, y, s * 1.4], 0.08);
    }
  k.fine(() => {
    humanLadder(k, M.steel, 8, 0, 0, 1.55, 0, true);
    for (const s of [-1, 1]) {
      k.box(DETAIL.glass, 2.6, 0.5, 0.05, 0, 9.6, s * 1.71);
      k.box(DETAIL.glass, 0.05, 0.5, 2.6, s * 1.71, 9.6, 0);
    }
    K.railing(
      k,
      M.steel,
      [
        [-1.95, -1.95],
        [1.95, -1.95],
        [1.95, 1.95],
        [-1.95, 1.95],
        [-1.95, -1.95],
      ],
      8.2,
      1.0,
      0.03,
    );
    K.lathe(
      k,
      M.dark,
      [
        [0, 0],
        [0.22, 0],
        [0.28, 0.35],
        [0, 0.35],
      ],
      -1.6,
      10.6,
      1.6,
      'y',
      10,
      -1.2,
      0,
      0,
    );
    K.cy(k, M.dark, 0.03, 2, 1.2, 11.4, -1.2, 6);
    const bag = mat(0x8a7a5a, { roughness: 1 });
    for (let i = 0; i < 6; i++)
      K.bx(k, bag, 0.6, 0.25, 0.35, -1.5 + i * 0.6, 8.35 + (i % 2) * 0.01, -1.7, 0, 0, 0, 0.1);
  });
  return k.build();
}
// 研究所的地表入口：斜坡往下的大型閘門框（寬 24、高 14；技研都市「地表入口」）
export const GATE_S = 2; // 機甲進出的閘門：舊模型放大 2 倍（寬 48、高 28 m）
export function buildFacilityGate() {
  const k = new PK();
  const red = new THREE.MeshStandardMaterial({ color: 0xff3a30, emissive: 0xff2010, emissiveIntensity: 1.6 });
  k.scaled(GATE_S, () => {
    for (const s of [-1, 1]) k.cb(M.concreteD, 4, 14, 8, s * 12, 7, 0, 0, 0, 0, 0.12);
    k.cb(M.concreteD, 28, 3, 8, 0, 15.5, 0, 0, 0, 0, 0.12);
    k.box(M.dark, 20, 11, 0.4, 0, 5.5, 2);
    for (const s of [-1, 1]) k.box(M.yellow, 0.5, 12, 0.5, s * 10, 6, -4.2);
    k.box(M.yellow, 21, 0.6, 0.6, 0, 12.2, -4.2);
    k.box(red, 6, 1.2, 0.3, 0, 13.6, -4.3);
    // 閘門扇（兩扇的接縫、橫肋）、門柱的扶壁與警示斜紋、上方的監視器與燈、側面的通風口
    for (let y = 1; y < 11; y += 1.6) k.box(M.steel, 19.6, 0.25, 0.2, 0, y, 1.75);
    k.box(M.yellow, 0.2, 10.8, 0.25, 0, 5.5, 1.75);
    for (const s of [-1, 1]) {
      k.prism(
        M.concreteD,
        [
          [0, 0],
          [2.5, 0],
          [0, 10],
        ],
        3,
        s * 14 + (s > 0 ? 0 : 0),
        0,
        -2.5,
        0,
        s > 0 ? 0 : Math.PI,
        0,
      );
      K.hazard(k, M.yellow, M.dark, 3.8, 1.0, 0.05, s * 12, 0.6, -4.05, 0);
    }
  });
  k.fine(() => {
    k.scaled(GATE_S, () => {
      for (const s of [-1, 1]) {
        K.bx(k, M.dark, 0.6, 0.5, 0.8, s * 6, 14.2, -4.3, 0.3, 0, 0, 0.04);
        k.box(DETAIL.glass, 0.3, 0.2, 0.04, s * 6, 14.1, -4.72);
        K.vents(k, M.dark, M.concreteD, 2, 1.2, s * 14.02, 9, 0, (s * Math.PI) / 2, 5);
        k.box(DETAIL.lamp, 1.6, 0.25, 0.4, s * 7, 11.6, -4.5);
      }
      markText(k, DETAIL.white, 7, 15.5, -4.06, 1.2, 14, Math.PI, 5);
    });
  });
  return k.build();
}
// 熔渣坑（Grid 086「熔爐區」的裝飾）：發光的圓形坑
export function buildSlagPit(r) {
  const k = new PK();
  const hot = new THREE.MeshStandardMaterial({ color: 0xff7a20, emissive: 0xff5010, emissiveIntensity: 1.6 });
  // 坑緣（剖面旋轉的焦黑邊）＋熔渣面＋表面的硬殼碎片
  K.lathe(
    k,
    M.dark,
    [
      [r * 0.75, 0.15],
      [r * 0.8, 0.3],
      [r * 1.0, 0.32],
      [r * 1.12, 0.1],
      [r * 1.15, 0],
    ],
    0,
    0,
    0,
    'y',
    24,
  );
  k.cyl(hot, r * 0.8, r * 0.8, 0.12, 0, 0.22, 0, 0, 0, 0, 24);
  k.fine(() => {
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9,
        q = r * (0.2 + (i % 3) * 0.2);
      k.geo(
        M.dark,
        D.rock(i + 4, 1, 0.3, 0.85, 0),
        Math.cos(a) * q,
        0.27,
        Math.sin(a) * q,
        0,
        a,
        0,
        r * 0.14,
        0.05,
        r * 0.1,
      );
    }
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05 + 0.4;
      k.geo(
        M.dark,
        D.rock(i + 14, 1, 0.3, 0.6, 0.2),
        Math.cos(a) * r * 1.2,
        0.1,
        Math.sin(a) * r * 1.2,
        0,
        a,
        0,
        r * 0.12,
        r * 0.08,
        r * 0.1,
      );
    }
  });
  return k.build();
}
// 宇宙港的殘骸：斷掉的機翼或船殼板（「廢墟港」）
export function buildHullPlate(w, d) {
  const k = new PK();
  k.cb(M.concreteD, w, 0.5, d, 0, 0.6, 0, 0, 0, 0, 0.05);
  k.cb(M.rustD, w * 0.3, 1.2, d * 0.9, w * 0.3, 0.9, 0, 0, 0, 0, 0.05);
  // 船殼的肋材、面板線與鉚釘、隔熱瓦、斷口的參差邊緣、垂下的纜線
  for (let x = -w / 2 + 0.6; x < w / 2; x += w / 6) k.box(M.rustD, 0.25, 0.35, d * 0.95, x, 0.95, 0);
  k.fine(() => {
    for (let z = -d / 2 + 0.5; z < d / 2; z += d / 5) k.box(M.dark, w * 0.98, 0.02, 0.04, 0, 0.86, z);
    for (let x = -w / 2 + 0.3; x < w / 2; x += 0.6)
      for (const z of [-d * 0.45, d * 0.45]) k.box(DETAIL.steel, 0.06, 0.03, 0.06, x, 0.86, z);
    for (let i = 0; i < 8; i++)
      k.box(
        M.dark,
        w * 0.08,
        0.02,
        d * 0.12,
        -w * 0.4 + (i % 4) * w * 0.1,
        0.861,
        -d * 0.3 + Math.floor(i / 4) * d * 0.14,
      );
    for (let i = 0; i < 5; i++)
      k.prism(
        M.concreteD,
        [
          [0, 0],
          [0.6, 0],
          [0.2, 0.9],
        ],
        0.4,
        -w / 2 - 0.1,
        0.35 + 0.1 * (i % 2),
        -d / 2 + i * (d / 5) + 0.4,
        0,
        0,
        Math.PI / 2,
      );
    K.cable(k, M.dark, [w * 0.3, 1.5, d * 0.3], [w * 0.55, 0.05, d * 0.5], 0.05, 0.4);
  });
  return k.build();
}
// 礦坑坑口：岩壁上的方形入口與照明（寬 12、高 10）
export const PORTAL_S = 2; // 機甲尺度的坑口：舊模型放大 2 倍（寬 24、高 20 m）
export function buildMinePortal() {
  const k = new PK();
  k.scaled(PORTAL_S, () => {
    // 外框同原本的岩壁（兩側、門楣），岩面換成雜訊岩石
    k.ob(4, 12, 6, -8, 6, 0).ob(4, 12, 6, 8, 6, 0).ob(20, 3, 6, 0, 11.5, 0);
    for (const s of [-1, 1])
      k.geo(M.rock, D.rock(s > 0 ? 5 : 8, 3, 0.3, 0.6, 0.6), s * 8, 6, 0, 0, 0, 0, 2.4, 6.4, 3.4);
    k.geo(M.rock, D.rock(12, 3, 0.3, 0.7, 0.6), 0, 11.6, 0, 0, 0, 0, 10.6, 2, 3.4);
    k.box(M.dark, 12, 10, 0.4, 0, 5, -2.8);
    for (const s of [-1, 1]) {
      k.box(M.yellow, 0.6, 10, 0.6, s * 6, 5, 3);
      k.box(M.lamp, 0.8, 0.5, 0.8, s * 6, 10.3, 3);
    }
    k.box(M.yellow, 13, 0.8, 0.8, 0, 10.2, 3);
    // 坑道的支保工（門型的鋼支柱）、軌道、通風管、警示斜紋、坑口名牌
    for (let z = 2; z > -3; z -= 1.6) {
      for (const s of [-1, 1]) k.box(M.rustD, 0.4, 9.6, 0.4, s * 5.6, 4.8, z);
      k.box(M.rustD, 11.6, 0.4, 0.4, 0, 9.6, z);
    }
  });
  k.fine(() => {
    k.scaled(PORTAL_S, () => {
      for (const s of [-1, 1]) {
        k.box(M.steel, 0.12, 0.12, 7, s * 0.75, 0.06, 0);
        K.hazard(k, M.yellow, M.dark, 9.6, 0.6, 0.05, s * 6, 5, 3.32, Math.PI / 2);
      }
      for (let z = -3.2; z < 3.4; z += 0.8) k.box(M.rustD, 2.2, 0.08, 0.25, 0, 0.04, z);
      K.pipe(
        k,
        M.yellow,
        [
          [-4.8, 8.6, 3.5],
          [-4.8, 8.6, -3],
        ],
        0.4,
        10,
      );
      K.bx(k, DETAIL.white, 4, 0.9, 0.1, 0, 10.2, 3.45, 0, 0, 0, 0.03);
      markText(k, M.dark, -1.6, 10.2, 3.52, 0.5, 3.2, 0, 1);
      for (let i = 0; i < 6; i++)
        k.geo(
          M.rock,
          D.rock(i + 22, 1, 0.3, 0.6, 0.3),
          -9 + i * 3.6,
          0.3,
          3.6 + (i % 2) * 0.5,
          0,
          i,
          0,
          0.7,
          0.45,
          0.6,
        );
    });
  });
  return k.build();
}
// 主線的入口結構：升降梯平台（下降後抵達）／降落區標示（空降）——放在出生點，不碰撞
// 升降梯平台：機甲站的平台，舊模型放大 2.5 倍（25 m 見方、柱高 35 m）
export function buildLiftPad() {
  const k = new PK();
  k.scaled(2.5, () => {
    k.cb(M.concreteD, 10, 0.3, 10, 0, 0.15, 0, 0, 0, 0, 0.05);
    for (const [x, z] of [
      [-5.4, -5.4],
      [5.4, -5.4],
      [-5.4, 5.4],
      [5.4, 5.4],
    ]) {
      k.box(M.yellow, 0.6, 14, 0.6, x, 7, z);
      k.box(M.lamp, 0.7, 0.5, 0.7, x, 14.2, z);
      // 柱的導軌與齒條、配重
      k.box(M.steel, 0.2, 13.6, 0.2, x * 0.93, 7, z * 0.93);
    }
    for (const s of [-1, 1]) k.box(M.yellow, 11.4, 0.5, 0.5, 0, 14, s * 5.4);
    // 平台的格柵與四邊的警示斜紋、頂部的捲揚機、中央的定位標記
    for (let x = -4.5; x <= 4.5; x += 0.5) k.box(M.dark, 0.06, 0.04, 9.6, x, 0.31, 0);
  });
  k.fine(() => {
    k.scaled(2.5, () => {
      for (let i = 0; i < 4; i++)
        k.at(0, 0.32, 0, 0, (i * Math.PI) / 2, 0, () =>
          K.hazard(k, M.yellow, M.dark, 9.6, 0.02, 0.4, 0, 0, 4.7, 0, 16),
        );
      for (const s of [-1, 1]) {
        K.cx(k, M.dark, 0.5, 1.2, s * 3, 14.6, 0, 14);
        K.bx(k, M.dark, 1, 0.8, 0.8, s * 4.2, 14.6, 0, 0, 0, 0, 0.05);
        K.cable(k, M.steel, [s * 3, 14.1, 0.4], [s * 3, 0.4, 0.4], 0.04, 0.01);
      }
      k.geo(M.yellow, K.loop(1.5, 0.08, 24), 0, 0.34, 0);
    });
  });
  return k.build();
}
export function buildLandingZone() {
  const k = new PK();
  const orange = new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0x804000 });
  k.scaled(MS, () => {
    // 圓環（剖面旋轉的薄片）＋ H 字＋四周的燈與方向標示
    k.geo(
      orange,
      D.lathe(
        [
          [4.2, 0.06],
          [5, 0.06],
          [5, 0.1],
          [4.2, 0.1],
        ],
        40,
      ),
      0,
      0,
      0,
    );
    for (const s of [-1, 1]) k.box(M.stripe, 0.5, 0.06, 6, s * 1.5, 0.06, 0);
    k.box(M.stripe, 3.5, 0.06, 0.5, 0, 0.06, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      k.cyl(M.lamp, 0.12, 0.14, 0.12, Math.cos(a) * 5.4, 0.08, Math.sin(a) * 5.4, 0, 0, 0, 8);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      k.prism(
        M.stripe,
        [
          [-0.3, 0],
          [0.3, 0],
          [0, 0.7],
        ],
        0.04,
        Math.cos(a) * 6.3,
        0.05,
        Math.sin(a) * 6.3,
        -Math.PI / 2,
        0,
        -a + Math.PI / 2,
      );
    }
  });
  return k.build();
}

// 儲油槽：半徑 r、高 h，頂部的走道與梯子
export function buildStorageTank(r, h) {
  const k = new PK();
  const body = mat(0xc8c4b8, { roughness: 0.7, metalness: 0.3 });
  k.cyl(body, r, r, h, 0, h / 2, 0, 0, 0, 0, 28);
  k.cyl(M.rustD, r * 1.02, r * 1.02, 0.6, 0, h * 0.3, 0, 0, 0, 0, 28);
  K.lathe(
    k,
    M.steel,
    [
      [0, 0],
      [r * 1.0, 0],
      [r * 0.98, 0.15],
      [r * 0.6, 0.6],
      [0, 0.85],
    ],
    0,
    h,
    0,
    'y',
    28,
  );
  k.box(M.yellow, 0.5, h, 0.5, r + 0.3, h / 2, 0);
  k.box(M.yellow, r * 0.8, 0.2, 1.2, r * 0.5, h + 0.9, 0);
  // 小細節：鋼板的焊縫、繞著槽身的樓梯（斜跑＋欄杆）、頂部的欄杆與通氣閥、泡沫滅火管、底部的管嘴與閥、編號
  k.fine(() => {
    const ring = Math.max(1.5, h / 7);
    for (let y = ring; y < h - 0.2; y += ring) k.cyl(body, r + 0.015, r + 0.015, 0.05, 0, y, 0, 0, 0, 0, 28);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      k.box(body, 0.04, h - 0.2, 0.04, Math.cos(a) * (r + 0.01), h / 2, Math.sin(a) * (r + 0.01));
    }
    const st = [];
    for (let i = 0; i <= 16; i++) {
      const a = -0.3 + i * 0.1,
        y = (i / 16) * h;
      st.push([Math.cos(a) * (r + 0.7), y, Math.sin(a) * (r + 0.7)]);
    }
    K.pipe(k, M.yellow, st, 0.06, 4);
    K.pipe(
      k,
      M.yellow,
      st.map(([x, y, z]) => [x * 1.07, y + 1.1, z * 1.07]),
      0.04,
      4,
    );
    for (let i = 0; i <= 16; i += 2) {
      const [x, y, z] = st[i];
      k.box(M.dark, 0.9, 0.06, 0.4, x, y, z, 0, -(-0.3 + i * 0.1), 0);
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      k.box(M.yellow, 0.05, 1.0, 0.05, Math.cos(a) * r * 0.97, h + 0.6, Math.sin(a) * r * 0.97);
    }
    k.geo(M.yellow, K.loop(r * 0.97, 0.04, 32), 0, h + 1.1, 0);
    for (const a of [0.8, 2.4, 4.2])
      K.cy(k, M.steel, 0.25, 0.5, Math.cos(a) * r * 0.5, h + 0.8, Math.sin(a) * r * 0.5, 10, 0.03);
    K.pipe(
      k,
      DETAIL.red,
      [
        [r + 0.15, 0.3, -1.5],
        [r + 0.15, h - 0.5, -1.5],
        [r * 0.9, h + 0.3, -1.5],
      ],
      0.08,
      6,
    );
    for (const a of [2.6, 3.6]) {
      k.at(Math.cos(a) * r, 1, Math.sin(a) * r, 0, -a, 0, () => {
        K.cx(k, M.steel, 0.3, 1.2, 0.6, 0, 0, 12);
        K.cx(k, M.steel, 0.45, 0.12, 1.15, 0, 0, 14);
        K.cy(k, DETAIL.red, 0.3, 0.04, 0.8, 0.55, 0, 10);
      });
    }
    markText(k, M.dark, -r * 0.5, h * 0.65, r + 0.02, r * 0.18, r, 0, 3);
  });
  return k.build();
}
// 針葉樹（冰原「針葉林」；高 h，枝頭積雪）
export function buildPine(h) {
  const k = new PK();
  const bark = mat(0x4a3a2a, { roughness: 1 });
  // 樹幹（剖面旋轉：根部張開）＋ 5 層枝葉（每層是往下垂的錐、邊緣不規則）＋枝頭的積雪
  K.lathe(
    k,
    bark,
    [
      [0, 0],
      [h * 0.04, 0],
      [h * 0.022, h * 0.05],
      [h * 0.016, h * 0.35],
      [0, h * 0.36],
    ],
    0,
    0,
    0,
    'y',
    8,
  );
  const leaf = mat(0x2a4a3a, { roughness: 1, metalness: 0 }),
    leaf2 = mat(0x22402f, { roughness: 1, metalness: 0 }),
    snow = mat(0xf2f6fa, { roughness: 1, metalness: 0 });
  for (let i = 0; i < 5; i++) {
    const r = h * (0.3 - i * 0.052),
      y = h * (0.26 + i * 0.14),
      hh = h * 0.26;
    k.geo(
      i % 2 ? leaf2 : leaf,
      D.lathe(
        [
          [0, 0],
          [r, hh * 0.05],
          [r * 0.88, hh * 0.22],
          [r * 0.3, hh * 0.75],
          [0, hh],
        ],
        9,
      ),
      0,
      y,
      0,
      0,
      i * 0.7,
      0,
    );
    k.geo(
      snow,
      D.lathe(
        [
          [r * 0.25, hh * 0.78],
          [r * 0.7, hh * 0.38],
          [r * 0.6, hh * 0.45],
          [0, hh * 0.98],
        ],
        9,
      ),
      0,
      y + 0.02,
      0,
      0,
      i * 0.7,
      0,
    );
  }
  return k.build();
}
// 落石堆（尺寸倍率 s，直徑約 4s）；GLB 以 s＝1.2 製作、原點在底面中心，main 材質為岩石色
export function buildRockPile(s, color = 0x5a524a) {
  const glb = propGlb('rock_pile', { color, ref: [1.2, 1.2, 1.2], size: [s, s, s], fade: true });
  if (glb) return glb;
  const g = new THREE.Group();
  const m = vcMat(mat(color, { roughness: 1, metalness: 0 }));
  // 雜訊岩石的大塊（同原本的四塊位置與大小）＋周圍的碎石，合併成一個網格
  const list = [];
  for (const [x, z, r] of [
    [0, 0, 1.5],
    [1.2, 0.6, 1],
    [-1.1, 0.5, 0.9],
    [0.3, -1.2, 0.8],
  ])
    list.push([
      D.rock(Math.round(r * 10) + 1, 2, 0.35, 0.55, 0.3),
      x * s,
      r * s * 0.6,
      z * s,
      r * s,
      r * s * 0.85,
      r * s,
      x + z,
    ]);
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + 0.3,
      q = s * (1.6 + (i % 3) * 0.35),
      rr = s * (0.2 + (i % 3) * 0.1);
    list.push([
      D.rock(i + 30, 1, 0.35, 0.6, 0.2),
      Math.cos(a) * q,
      rr * 0.5,
      Math.sin(a) * q,
      rr,
      rr * 0.7,
      rr,
      a,
    ]);
  }
  g.add(rockPile(list, m));
  return g;
}
// 照明柱（高 h；color＝燈的顏色，停電區用紅色緊急照明）
export function buildLampPost(h, color = 0xffe0a0) {
  const k = new PK();
  const lm = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6 });
  // 底座（法蘭、螺栓）＋錐形桿身＋配電箱＋懸臂與燈頭（散熱鰭片、發光面）
  K.lathe(
    k,
    M.dark,
    [
      [0, 0],
      [0.32, 0],
      [0.32, 0.06],
      [0.25, 0.1],
      [0.25, 0.3],
      [0, 0.3],
    ],
    0,
    0,
    0,
    'y',
    12,
  );
  K.lathe(
    k,
    M.dark,
    [
      [0, 0],
      [0.22, 0],
      [0.15, h - 0.3],
      [0, h - 0.3],
    ],
    0,
    0.3,
    0,
    'y',
    10,
  );
  K.pipe(
    k,
    M.dark,
    [
      [0, h - 0.2, 0],
      [0.2, h + 0.05, 0],
      [0.8, h + 0.1, 0],
    ],
    0.08,
    8,
  );
  K.bx(k, M.dark, 1.0, 0.18, 0.42, 0.9, h + 0.05, 0, 0, 0, 0.05, 0.04);
  k.box(lm, 0.86, 0.04, 0.32, 0.9, h - 0.05, 0, 0, 0, 0.05);
  k.fine(() => {
    K.boltRing(k, DETAIL.steel, 0.27, 0.08, 6, 0.025);
    K.fins(k, M.dark, 7, 0.8, 0.08, 0.34, 0.9, h + 0.18, 0, 0, 0.02);
    K.bx(k, M.dark, 0.3, 0.45, 0.14, 0, 1.4, 0.24, 0, 0, 0, 0.02);
    k.box(DETAIL.yellow, 0.3, 0.05, 0.15, 0, 1.6, 0.24);
    for (const y of [2.6, h * 0.6]) K.cy(k, M.dark, 0.2, 0.05, 0, y, 0, 10);
  });
  return k.build();
}

// ---------- 放置工具 ----------
// 在 World 上放一個大型結構（findSpot＋addBig），回傳是否成功
function place(w, g, bx, range, shapes, sink = 0.3) {
  const spot = w.findSpot(bx, range, 40);
  if (!spot) return null;
  g.position.y = spot.lo - sink;
  return w.addBig(
    g,
    spot,
    shapes.map((s) =>
      s.box ? { ...s, y: spot.lo - sink + (s.y || 0), top: spot.lo - sink + s.top } : { ...s, h: s.h },
    ),
  );
}
const smooth = (t) => t * t * (3 - 2 * t);
const lerpH = (a, b, t) => a + (b - a) * t;
// 隕坑／彈坑的地形：n 個碗形下陷（邊緣隆起），避開中央出生點
function craterTerrain(w, n, rr, dep) {
  const r = makeRng(w.seed * 71 + 13);
  const L = 52 * w.k;
  const cs = [];
  for (let t = 0; t < 80 && cs.length < n; t++) {
    const x = (r() * 2 - 1) * L,
      z = (r() * 2 - 1) * L,
      R = (rr[0] + r() * (rr[1] - rr[0])) * G;
    if (Math.hypot(x, z) < R + 12 * G || cs.some((q) => Math.hypot(q.x - x, q.z - z) < (q.R + R) * 0.8))
      continue;
    cs.push({ x, z, R, D: (dep[0] + r() * (dep[1] - dep[0])) * G });
  }
  return (x, z, h) => {
    let d = 0;
    for (const q of cs) {
      const t = Math.hypot(x - q.x, z - q.z) / q.R;
      if (t < 1) d -= q.D * smooth(1 - t);
      else if (t < 1.4) d += q.D * 0.25 * Math.sin(((t - 1) / 0.4) * Math.PI);
    }
    return h + d;
  };
}
// 發射塔與火箭（舊宇宙港的現實尺寸）
function placeTower(w) {
  const e = -TOWER.x + TOWER.w;
  place(w, buildLaunchTower(), [-e, e, -e, e], 1.5 * G, [
    { box: [TOWER.x - TOWER.w / 2, TOWER.x + TOWER.w / 2, -TOWER.w / 2, TOWER.w / 2], top: TOWER.h },
    { c: [0, 0], r: ROCKET.r + 0.3, h: ROCKET.h },
  ]);
}
// 照明柱散布（可破壞）
function lampPosts(w, n, color) {
  w.scatter(n, 8, (x, z, y) => {
    const h = rnd(8, 12); // 現實的照明柱
    const g = buildLampPost(h, color);
    g.rotation.y = rnd(0, 6.28);
    w.addSmall(g, x, y - 0.2, z, { r: 0.4, h }, 'lamppost', 600, 0x2a2c2e);
  });
}
// 落石堆散布（可破壞）
function rockPiles(w, n, color = 0x5a524a) {
  w.scatter(n, 12, (x, z, y) => {
    const s = rnd(2, 4); // 落石堆（直徑 8–16 m，掩體）
    w.addSmall(
      buildRockPile(s, color),
      x,
      y - 0.3 * s,
      z,
      { r: 2 * s, h: 2.6 * s },
      'rockpile',
      2000 * s,
      color,
    );
  });
}
// 夜間的變體共用的光線（noTod：主線的時間不再疊加上去）
const NIGHT = {
  noTod: true,
  sky: 0x0c1220,
  fog: 0x18202e,
  sun: 0x8aa0d8,
  sunI: 0.38,
  hemiI: 0.6,
  fogFar: 160,
};
// 集散場：矩形範圍內沒有障礙物
const free = (w, x, z, hw, hd, m = 1) =>
  !w.obstacles.some((o) =>
    o.kind === 'box'
      ? Math.abs(o.x - x) < o.w / 2 + hw + m && Math.abs(o.z - z) < o.d / 2 + hd + m
      : Math.abs(o.x - x) < o.r + hw + m && Math.abs(o.z - z) < o.r + hd + m,
  );
// 調度場的貨車：四成的位置留空
const RNG_SKIP = () => rnd(0, 1) > 0.4;
const YARD_COLS = [0xe0a020, 0x2b4fb0, 0xb83a2a, 0x3a7a4a, 0x8b8f94, 0xd8d8d8];
const ownMat = (c, o) => {
  const m = mat(c, o).clone();
  m.transparent = true;
  return m;
};
const stackMats = () =>
  [pick(YARD_COLS), pick(YARD_COLS), pick(YARD_COLS)].map((c) => ownMat(c, { roughness: 0.6 }));
// 一個單層貨櫃（集散場變體的散布物件）
function looseContainers(w, n) {
  w.scatter(n, 6, (x, z, y) => {
    const rot = rndi(0, 1),
      long = rndi(0, 1) ? ISO.L40 : ISO.L20;
    const c = pick(YARD_COLS);
    const g = buildContainer(long, ISO.H, ISO.W, false, ownMat(c, { roughness: 0.6 }), ownMat(0x26282c));
    if (rot) g.rotation.y = Math.PI / 2;
    w.addSmall(
      g,
      x,
      y - 0.15,
      z,
      { w: rot ? ISO.W : long, h: ISO.H, d: rot ? long : ISO.W },
      'container',
      3000,
      c,
    );
  });
}
// 沿 axis（0＝列沿 Z、1＝列沿 X）排一列一列的貨櫃堆（現實尺寸）：每列 2～4 排並排的 40 呎貨櫃、疊 levels 層，
// 列與列之間是 gap（m）寬的通道、同一列每 1～2 個貨櫃長斷開 6–10 m；ok(x, z) 決定要不要放
function containerRows(w, axis, span, gap, levels, ok = () => true) {
  const L = ISO.L40;
  span *= 0.85;
  for (let off = -span; off <= span;) {
    const rows = rndi(2, 4),
      D = rows * ISO.W + (rows - 1) * 0.3,
      lane = rnd(gap[0], gap[1]);
    off += D / 2;
    if (Math.abs(off) >= 7 * MS) {
      let s = -span;
      while (s < span) {
        const n = rndi(1, 2),
          len = n * L + (n - 1) * 0.3;
        const c = s + len / 2;
        const x = axis ? c : off,
          z = axis ? off : c;
        const hw = axis ? len / 2 : D / 2,
          hd = axis ? D / 2 : len / 2;
        const lv = rndi(levels[0], levels[1]);
        const tops = [];
        for (let i = 0; i < rows; i++) tops.push(Math.max(1, lv - rndi(0, 1)));
        if (
          Math.hypot(x, z) > 11 * MS &&
          ok(x, z) &&
          !w.offLimits(x, z) &&
          !w.isReserved(x, z, 3) &&
          free(w, x, z, hw, hd) &&
          ![-1, 0, 1].some((k) =>
            w.onCorridor(x + (axis ? (k * len) / 2 : 0), z + (axis ? 0 : (k * len) / 2), 5),
          )
        ) {
          const cms = stackMats();
          const g = buildIsoStack(L, rows, 5, cms, ownMat(0x26282c), tops, 0.3, n).group;
          g.rotation.y = axis ? 0 : Math.PI / 2;
          w.addSmall(
            g,
            x,
            w.terrainHeight(x, z) - 0.15,
            z,
            { w: hw * 2, h: lv * ISO.H, d: hd * 2 },
            'stack',
            2000 * lv * rows * n,
            cms[0].color.getHex(),
          );
        }
        s += len + rnd(8, 14);
      }
    }
    off += D / 2 + lane;
  }
}

// ---------- 變體 ----------
export const VARIANTS = {
  industrial: {
    stacks: {
      name: '貨櫃迷宮',
      theme: {
        featureKinds: ['platforms'],
        corridor: { p: 0.5, kinds: ['road', 'rail'] },
        propNames: { stack: '貨櫃堆' },
        // 沿一個方向排的高貨櫃堆（2～4 層），之間是走道
        buildProps(w) {
          containerRows(w, rndi(0, 1), 52 * w.k, [10, 16], [2, 4]);
          looseContainers(w, w.cnt(8, 12));
        },
      },
      terrain: () => (x, z, h) => h * 0.2,
    },
    warehouse: {
      name: '倉庫區',
      theme: {
        featureKinds: ['bunkers'],
        corridor: { p: 0.6, kinds: ['road'] },
        ground: 0x60646a,
        buildProps(w) {
          // 現實尺寸的倉庫（寬 40–60、深 30–40、高 16–20 m），大門 16 × 13 m 機甲通得過
          const [gw, gh] = WH_GATE,
            ga = gw / 2;
          for (let k = w.cnt(5, 8); k > 0; k--) {
            const hw = rndi(20, 30),
              hd = rndi(15, 20),
              hh = rnd(16, 20);
            place(
              w,
              buildWarehouse(hw * 2, hd * 2, hh, pick([0x7a8894, 0x8e8a7e, 0x5e7488, 0xa09078])),
              [-hw - 1, hw + 1, -hd - 1, hd + 1],
              2 * G,
              [
                { box: [-hw, -ga, -hd - 0.3, -hd + 0.3], top: hh },
                { box: [ga, hw, -hd - 0.3, -hd + 0.3], top: hh },
                { box: [-hw, -ga, hd - 0.3, hd + 0.3], top: hh },
                { box: [ga, hw, hd - 0.3, hd + 0.3], top: hh },
                { box: [-ga, ga, -hd - 0.3, -hd + 0.3], y: gh, top: hh },
                { box: [-ga, ga, hd - 0.3, hd + 0.3], y: gh, top: hh },
                { box: [-hw - 0.3, -hw + 0.3, -hd, hd], top: hh },
                { box: [hw - 0.3, hw + 0.3, -hd, hd], top: hh },
              ],
              0.2,
            );
          }
          looseContainers(w, w.cnt(14, 20));
        },
      },
      terrain: () => (x, z, h) => h * 0.15,
    },
    railyard: {
      name: '貨運調度場',
      theme: {
        featureKinds: ['overpass'],
        corridor: { p: 1, kinds: ['rail'] },
        propNames: { boxcar: '有蓋貨車' },
        // 平行的側線，停著一列一列的有蓋貨車
        buildProps(w) {
          const axis = rndi(0, 1);
          const span = 54 * w.k;
          // 側線間距 16–24 m（現實的調度場較密，這裡留出機甲的通道並控制物件數量）
          for (let off = -span * 0.7; off <= span * 0.7; off += rnd(16, 24)) {
            if (Math.abs(off) < 6 * MS) continue;
            // 側線（裝飾，合併）：整條鋪過去，經過公路／鐵路的地方略過
            for (let s = -span; s < span; s += 12) {
              const x = axis ? s + 6 : off,
                z = axis ? off : s + 6;
              if (w.onCorridor(x, z, 3) || w.offLimits(x, z)) continue;
              const t = buildTrack(12);
              t.position.set(x, w.terrainHeight(x, z), z);
              if (axis) t.rotation.y = Math.PI / 2;
              w.addDecorMesh(t);
            }
            let s = -span + rnd(0, 10);
            while (s < span) {
              const n = rndi(1, 3),
                len = 12;
              const L = n * (len + 1);
              const c = s + L / 2;
              const x = axis ? c : off,
                z = axis ? off : c;
              const hw = axis ? L / 2 : 1.6,
                hd = axis ? 1.6 : L / 2;
              if (
                RNG_SKIP(w) &&
                Math.hypot(x, z) > 11 * MS &&
                free(w, x, z, hw, hd, 0.5) &&
                !w.isReserved(x, z, 2)
              ) {
                let hit = false;
                for (let q = -L / 2; q <= L / 2; q += 3)
                  if (w.onCorridor(x + (axis ? q : 0), z + (axis ? 0 : q), 3)) hit = true;
                if (!hit)
                  for (let i = 0; i < n; i++) {
                    const p = -L / 2 + (len + 1) * (i + 0.5);
                    const cx = x + (axis ? p : 0),
                      cz = z + (axis ? 0 : p);
                    const color = pick([0x8a3a2a, 0x3a5a7a, 0x5a5a52, 0x7a6a3a]);
                    const g = buildBoxcar(len, color);
                    if (axis) g.rotation.y = Math.PI / 2;
                    w.addSmall(
                      g,
                      cx,
                      w.terrainHeight(cx, cz),
                      cz,
                      { w: axis ? len : 3, h: 4.4, d: axis ? 3 : len },
                      'boxcar',
                      3500,
                      color,
                    );
                  }
              }
              s += L + rnd(10, 22);
            }
          }
          looseContainers(w, w.cnt(6, 10));
        },
      },
      terrain: () => (x, z, h) => h * 0.1,
    },
    docks: {
      name: '港灣碼頭',
      theme: {
        featureKinds: ['bunkers'],
        corridor: { p: 0.4, kinds: ['road'] },
        water: { level: -1.6, color: 0x22394a, opacity: 0.86 },
        fog: 0x9aa8b4,
        sky: 0xb0bcc6,
        propNames: { stack: '貨櫃堆' },
        buildProps(w) {
          const [c, s] = w.sea;
          const u0 = w.seaU;
          // 岸壁起重機：沿岸壁排列，吊臂伸向海面
          const ry = Math.atan2(-s, c);
          const cr = Math.cos(ry),
            sr = Math.sin(ry);
          // 現實的岸壁起重機（高約 66 m）間距 60–90 m
          const Q = QUAY_S;
          for (let v = -48 * w.k + rnd(0, 12) * G; v < 48 * w.k; v += rnd(60, 90)) {
            const cx = c * (u0 - 9 * Q) - s * v,
              cz = s * (u0 - 9 * Q) + c * v;
            if (w.onCorridor(cx, cz, 10 * Q) || Math.hypot(cx, cz) < 18 * MS) continue;
            const g = buildQuayCrane();
            g.position.set(cx, w.terrainHeight(cx, cz) - 0.1, cz);
            g.rotation.y = ry;
            w.scene.add(g);
            w.meshes.push(g);
            for (const lx of [-6 * Q, 6 * Q])
              for (const lz of [-8 * Q, 8 * Q])
                w.obstacles.push({
                  kind: 'circle',
                  x: cx + lx * cr + lz * sr,
                  z: cz - lx * sr + lz * cr,
                  r: 0.9 * Q,
                  group: g,
                  mats: [],
                  box: null,
                  h: 24 * Q,
                });
          }
          // 岸上的貨櫃堆（離岸壁 14 m 以上）、散落的貨櫃與繫船柱
          containerRows(
            w,
            Math.abs(c) > Math.abs(s) ? 0 : 1,
            50 * w.k,
            [10, 16],
            [2, 4],
            (x, z) => x * c + z * s < u0 - 16 * Q,
          );
          looseContainers(w, w.cnt(8, 12));
          // 繫船柱（裝飾，合併）：現實的間距約 24 m
          for (let v = -55 * w.k; v < 55 * w.k; v += 24) {
            const x = c * (u0 - 1.2) - s * v,
              z = s * (u0 - 1.2) + c * v;
            const b = buildBollard();
            b.position.set(x, w.terrainHeight(x, z), z);
            w.addDecorMesh(b);
          }
        },
      },
      // 地圖的一側是海：岸壁往下 7 m
      terrain(w) {
        const r = makeRng(w.seed * 71 + 13);
        const a = r() * Math.PI * 2;
        w.sea = [Math.cos(a), Math.sin(a)];
        w.seaU = (24 + r() * 10) * w.k;
        const [c, s] = w.sea;
        return (x, z, h) => {
          const u = x * c + z * s;
          return h * 0.25 - 7.5 * G * smooth(clamp((u - w.seaU) / (3 * G), 0, 1));
        };
      },
      // 海裡不放東西、不生成
      offLimits: (w, x, z) => w.terrainHeight(x, z) < -1 * G,
    },
    tankfarm: {
      name: '儲油槽區',
      theme: {
        featureKinds: ['bunkers'],
        corridor: { p: 0.5, kinds: ['road'] },
        // 大型儲油槽（不可破壞）之間散落貨櫃
        buildProps(w) {
          // 現實的儲油槽（直徑 20–40、高 12–20 m）
          for (let k = w.cnt(8, 12); k > 0; k--) {
            const r = rnd(10, 20),
              h = rnd(12, 20);
            place(w, buildStorageTank(r, h), [-r - 2, r + 2, -r - 2, r + 2], 2 * G, [{ c: [0, 0], r, h }]);
          }
          looseContainers(w, w.cnt(10, 14));
        },
      },
      terrain: () => (x, z, h) => h * 0.2,
    },
    conveyor: {
      name: '高架輸送帶',
      theme: {
        featureKinds: [],
        corridor: { p: 0.4, kinds: ['rail'] },
        // 兩條平行的高架輸送帶（高 15 m，可以站上去、機甲從底下穿過）
        buildProps(w) {
          const axis = rndi(0, 1);
          const half = w.size / 2;
          const o0 = rnd(14, 22) * w.k;
          const CH = 15;
          for (const off of [-o0, o0 + rnd(-4, 4) * w.k]) {
            for (let s = -half + 10 * G; s < half - 10 * G; s += 24) {
              const x = axis ? s : off,
                z = axis ? off : s;
              if (w.onCorridor(x, z, 8)) continue;
              w.addDeck(x, z, axis ? 24.2 : 8, axis ? 8 : 24.2, CH, 1.2, 0);
              w.addPillar(x, z, 1.2, w.terrainHeight(x, z) - 0.3, CH - 1.2);
            }
            if (axis) w.reserve(-half, half, off - 6, off + 6);
            else w.reserve(off - 6, off + 6, -half, half);
          }
          looseContainers(w, w.cnt(14, 20));
        },
      },
      terrain: () => (x, z, h) => h * 0.15,
    },
  },
  orbit: {
    cluster: {
      name: '密集模組區',
      theme: {
        planTerrain: (w) =>
          planIslands(w, { h: 0.5, deep: -40, central: 36, n: [10, 14], size: [20, 30], span: 30, gap: 10 }),
      },
    },
    span: {
      name: '長距桁架',
      theme: {
        planTerrain: (w) =>
          planIslands(w, { h: 0.5, deep: -40, central: 44, n: [4, 6], size: [26, 40], span: 60, gap: 18 }),
      },
    },
    dock: {
      name: '對接港',
      theme: {
        planTerrain: (w) =>
          planIslands(w, { h: 0.5, deep: -40, central: 84, n: [3, 5], size: [22, 30], span: 40, gap: 12 }),
      },
    },
    nightside: {
      name: '軌道夜側',
      theme: { sky: 0x0a1428, fog: 0x1a2a48, sun: 0x8ab0ff, sunI: 0.5, hemiI: 0.6, fogFar: 220 },
    },
    debris: {
      name: '殘骸帶',
      theme: {
        // 很多小模組、間隔較大
        planTerrain: (w) =>
          planIslands(w, { h: 0.5, deep: -40, central: 30, n: [12, 16], size: [14, 20], span: 46, gap: 9 }),
      },
    },
    sunlit: {
      name: '日照面',
      theme: {
        noTod: true,
        sky: 0x6a90c8,
        fog: 0x8ab0e0,
        sun: 0xfff4e0,
        sunI: 1.25,
        hemiI: 1.05,
        fogFar: 320,
      },
    },
  },
  xylem: {
    dense: {
      name: '密集街區',
      theme: {
        // 小而多的街區、短橋
        planTerrain: (w) =>
          planIslands(w, { h: 0.5, deep: -30, central: 40, n: [9, 13], size: [22, 34], span: 30, gap: 10 }),
      },
    },
    open: {
      name: '外海',
      theme: {
        fogFar: 260,
        // 少數大街區、長橋
        planTerrain: (w) =>
          planIslands(w, { h: 0.5, deep: -30, central: 50, n: [3, 5], size: [40, 64], span: 56, gap: 16 }),
      },
    },
    harbor: {
      name: '中央港區',
      theme: {
        // 很大的中央街區＋周圍幾個小街區
        planTerrain: (w) =>
          planIslands(w, { h: 0.5, deep: -30, central: 80, n: [4, 6], size: [24, 36], span: 40, gap: 12 }),
      },
    },
    squall: {
      name: '海上暴風',
      theme: {
        weather: 'rain',
        fog: 0x7a8a96,
        sky: 0x6a7a88,
        fogNear: 30,
        fogFar: 130,
        sunI: 0.55,
        hemiI: 0.8,
        water: { level: -2.2, color: 0x1a3444, opacity: 0.95, wide: true },
      },
    },
    bridges: {
      name: '橋梁群',
      theme: {
        // 中小街區、長橋多
        planTerrain: (w) =>
          planIslands(w, { h: 0.5, deep: -30, central: 34, n: [8, 12], size: [16, 22], span: 50, gap: 16 }),
      },
    },
    night: { name: '夜景', theme: { ...NIGHT, sky: 0x0a1428, fog: 0x18243a, fogFar: 180 } },
  },
  grid086: {
    foundry: {
      name: '熔爐區',
      theme: { sky: 0x8a5a3a, fog: 0x7a4a32, sun: 0xffa060, weather: 'ash' },
      // 高大的排氣煙囪與地上的熔渣坑
      build(w) {
        // 巨型構造體的煙囪（高 90–120 m）與熔渣坑（直徑 12–21 m）
        for (let k = w.cnt(3, 5); k > 0; k--) {
          const r = rnd(1.6, 2.4) * G,
            h = rnd(30, 40) * G;
          w.scatter(
            1,
            10 * G,
            (x, z, y) => w.addSmall(buildChimney(r, h), x, y - 0.3, z, { r: r * 1.1, h }),
            false,
          );
        }
        w.addDecor(w.cnt(6, 9), () => buildSlagPit(rnd(2, 3.5) * G), 0.05);
      },
    },
    scrapyard: {
      name: '廢料場',
      theme: { featureKinds: [] },
      // 大量的廢料堆與 Doser 棚屋
      build(w) {
        // 廢料堆 10–20 m（掩體）；棚屋照現實尺寸
        w.scatter(w.cnt(12, 18), 14, (x, z, y) => {
          const s = rnd(2, 4);
          w.addSmall(
            buildScrapHeap(s),
            x,
            y - 0.3 * s,
            z,
            { r: 2.4 * s, h: 2.6 * s },
            'scrapheap',
            1100 * s,
            0x6a5a4a,
          );
        });
        w.scatter(w.cnt(10, 16), 7, (x, z, y) => {
          w.addSmall(
            buildShack(pick([0x6a6a5a, 0x7a5a4a, 0x5a6a6a])),
            x,
            y - 0.2,
            z,
            { w: 5, h: 3.6, d: 4 },
            'shack',
            1500,
            0x6a6a5a,
          );
        });
      },
    },
    deep: {
      name: '構造體底層',
      theme: {
        roof: { y: 30, color: 0x2a2622, bump: 4 },
        sunI: 0.35,
        hemiI: 0.6,
        fog: 0x2a2420,
        sky: 0x1a1612,
        fogNear: 25,
        fogFar: 130,
        weather: 'ash',
      },
    },
    catwalks: {
      name: '吊橋區',
      theme: { featureKinds: [] },
      // 第一層平台之間多了細長的吊橋（寬 12 m，機甲走得上去）
      build(w) {
        const Gd = w.grid086;
        if (!Gd) return;
        const T = 24 * G;
        const done = new Set();
        for (const k of Gd.L1) {
          const [i, j] = k.split(',').map(Number);
          for (const [di, dj] of [
            [2, 0],
            [0, 2],
          ]) {
            const nk = Gd.key(i + di, j + dj);
            if (!Gd.L1.has(nk) || Gd.L1.has(Gd.key(i + di / 2, j + dj / 2)) || done.has(nk + k)) continue;
            done.add(nk + k);
            const x = Gd.off + (i + di / 2) * T,
              z = Gd.off + (j + dj / 2) * T;
            if (Math.hypot(x, z) < 14 * G) continue;
            w.addDeck(x, z, di ? T + 0.4 * G : 4 * G, dj ? T + 0.4 * G : 4 * G, 11 * G, 1.2, false, null);
          }
        }
      },
    },
    pillars: {
      name: '支柱林',
      theme: { featureKinds: [], fog: 0x3a3632, fogFar: 150 },
      // 粗大的支柱密集排列（避開平台）
      build(w) {
        w.scatter(w.cnt(14, 20), 9 * G, (x, z, y) =>
          w.addPillar(x, z, rnd(1.4, 2.4) * G, y - 0.3, y + rnd(22, 38) * G),
        );
      },
    },
    rust: {
      name: '鏽蝕區',
      theme: { weather: 'dust', sky: 0x9a7a5a, fog: 0x8a6a4a, sun: 0xffc890, fogNear: 30, fogFar: 140 },
      build(w) {
        w.scatter(w.cnt(7, 11), 14, (x, z, y) => {
          const s = rnd(2, 4);
          w.addSmall(
            buildScrapHeap(s),
            x,
            y - 0.3 * s,
            z,
            { r: 2.4 * s, h: 2.6 * s },
            'scrapheap',
            1100 * s,
            0x7a4a2a,
          );
        });
        rockPiles(w, w.cnt(4, 6), 0x6a4a32);
      },
    },
  },
  spaceport: {
    runway: {
      name: '外圍跑道',
      theme: {
        featureKinds: ['bunkers'],
        corridor: { p: 0.3, kinds: ['road'] },
        // 沒有發射塔與機庫，只有跑道標線與防爆牆
        buildStructures(w) {
          const white = mat(0xe8e8e0, { roughness: 0.8 });
          for (const zr of [-18 * w.k, 18 * w.k])
            for (const s of [-1, 1]) {
              const m = box(w.size * 0.55, 0.04, 1, white, 0, 0.1, zr + s * 30); // 現實的跑道寬 60 m
              w.scene.add(m);
              w.meshes.push(m);
            }
        },
      },
      build(w) {
        w.scatter(w.cnt(12, 18), 8, (x, z, y) => {
          const rot = rndi(0, 1);
          const g = buildBlastWall();
          if (rot) g.rotation.y = Math.PI / 2;
          const [a, h, b] = BLAST_WALL;
          w.addSmall(g, x, y - 0.1, z, { w: rot ? b : a, h, d: rot ? a : b }, 'blastwall', 2400, 0x9a9c9e);
        });
      },
    },
    pads: {
      name: '發射台群',
      theme: { featureKinds: ['platforms', 'trench'] },
      // 再多兩座發射塔
      build(w) {
        for (let k = 0; k < 2; k++) placeTower(w);
      },
    },
    hangar: {
      name: '地下機庫',
      theme: {
        roof: { y: 20, color: 0x3a3c40, bump: 2 },
        sunI: 0.45,
        hemiI: 0.75,
        fog: 0x3a3e44,
        sky: 0x22262a,
        fogNear: 30,
        fogFar: 140,
        ground: 0x5a5c60,
        corridor: { p: 0.5, kinds: ['rail'] },
        // 地下：沒有發射塔，成排的貨艙與防爆牆
        buildStructures() {},
      },
      build(w) {
        const axis = rndi(0, 1),
          P = 2; // 機甲尺度的貨艙：貨物艙放大 2 倍
        for (let off = -40 * w.k; off <= 40 * w.k; off += rnd(30, 40)) {
          if (Math.abs(off) < 8 * MS) continue;
          for (let v = -44 * w.k; v < 44 * w.k; v += rnd(24, 32)) {
            const x = axis ? v : off,
              z = axis ? off : v;
            if (Math.hypot(x, z) < 10 * MS || w.onCorridor(x, z, 4) || !free(w, x, z, 7, 7, 0.5)) continue;
            const color = pick([0xe6e8ea, 0xb04a2a, 0x4a6a8a]);
            const g = buildCargoPod(color);
            g.scale.setScalar(P);
            if (axis) g.rotation.y = Math.PI / 2;
            const [a, h, b] = CARGO_POD;
            w.addSmall(
              g,
              x,
              w.terrainHeight(x, z),
              z,
              { w: (axis ? b : a) * P, h: h * P, d: (axis ? a : b) * P },
              'cargopod',
              3600,
              color,
            );
          }
        }
      },
    },
    ruins: {
      name: '廢墟港',
      theme: { weather: 'dust', fog: 0xb0a898, sky: 0xbab2a2, ground: 0x7a7468 },
      // 散落的船殼板與殘骸
      build(w) {
        w.scatter(w.cnt(12, 18), 12, (x, z, y) => {
          const pw = rnd(4, 9) * G,
            pd = rnd(3, 6) * G;
          const g = buildHullPlate(pw, pd);
          g.scale.y = G;
          const rot = rndi(0, 1);
          if (rot) g.rotation.y = Math.PI / 2;
          w.addSmall(
            g,
            x,
            y - 0.6,
            z,
            { w: rot ? pd : pw, h: 1.6 * G, d: rot ? pw : pd },
            'hullplate',
            2000,
            0x6a665f,
          );
        });
      },
    },
    crash: {
      name: '墜落現場',
      theme: { featureKinds: ['bunkers'], weather: 'ash', fog: 0x8a8070, sky: 0x9a9080, ground: 0x6a645a },
      // 墜落的船體留下的彈坑與大片殘骸
      terrain: (w) => craterTerrain(w, Math.round((7 * w.k) / G), [9, 15], [3, 5]),
      build(w) {
        w.scatter(w.cnt(10, 15), 12, (x, z, y) => {
          const pw = rnd(6, 12) * G,
            pd = rnd(4, 7) * G;
          const g = buildHullPlate(pw, pd);
          g.scale.y = G;
          const rot = rndi(0, 1);
          if (rot) g.rotation.y = Math.PI / 2;
          w.addSmall(
            g,
            x,
            y - 0.6,
            z,
            { w: rot ? pd : pw, h: 1.6 * G, d: rot ? pw : pd },
            'hullplate',
            2000,
            0x6a665f,
          );
        });
      },
    },
    launchnight: {
      name: '夜間發射',
      theme: { ...NIGHT },
      build(w) {
        placeTower(w);
        lampPosts(w, w.cnt(10, 14));
      },
    },
  },
  institute: {
    core: {
      name: '研究核心',
      theme: { featureKinds: ['platforms'], fog: 0x3a1418, fogFar: 120, sunI: 0.35 },
      // 研究棟更多、更高
      build(w) {
        // 現實尺寸的研究棟（寬 40–70、深 30–50、高 30–50 m）
        for (let k = w.cnt(3, 5); k > 0; k--) {
          const bw = rnd(40, 70),
            bd = rnd(30, 50),
            h = rnd(30, 50);
          place(
            w,
            buildLab(bw, h, bd, Math.floor(rnd(0, 1e6))),
            [-bw / 2, bw / 2, -bd / 2, bd / 2],
            2.5 * G,
            [{ box: [-bw / 2, bw / 2, -bd / 2, bd / 2], y: 0, top: h }],
          );
        }
      },
    },
    cavern: {
      name: '巨大空洞',
      theme: {
        featureKinds: ['trench'],
        roof: { y: 60, color: 0x221c1c, bump: 18 },
        fogFar: 190,
        // 沒有研究棟：粗大的岩柱與起伏的地面
        buildStructures(w) {
          for (let k = w.cnt(6, 9); k > 0; k--) {
            const r = rnd(5, 9) * G;
            const spot = w.findSpot([-r, r, -r, r], 5 * G, 30);
            if (!spot) continue;
            const g = buildCavePillar(r, 64 * G - spot.lo);
            g.position.y = spot.lo - 0.5 * G;
            w.addBig(g, spot, [{ c: [0, 0], r: r * 0.9, h: 60 * G }], false);
          }
        },
      },
      terrain: () => (x, z, h) => h * 2.4,
    },
    tanks: {
      name: '收容區',
      theme: { featureKinds: ['bunkers'] },
      // 成排的 Coral 收容槽
      build(w) {
        const axis = rndi(0, 1),
          T = 2.5; // 收容槽放大 2.5 倍（同技研都市）
        for (let off = -40 * w.k; off <= 40 * w.k; off += rnd(30, 40)) {
          if (Math.abs(off) < 8 * MS) continue;
          for (let v = -44 * w.k; v < 44 * w.k; v += 18) {
            const x = axis ? v : off,
              z = axis ? off : v;
            if (Math.hypot(x, z) < 10 * MS || w.onCorridor(x, z, 4) || !free(w, x, z, 5, 5, 0.5)) continue;
            const g = buildCoralTank();
            g.scale.setScalar(T);
            w.addSmall(
              g,
              x,
              w.terrainHeight(x, z) - 0.25,
              z,
              { r: 2 * T, h: 5.6 * T },
              'coraltank',
              5000,
              0xff3a30,
            );
          }
        }
      },
    },
    entrance: {
      name: '地表入口',
      border: true, // 交界區段：冰原往地下技研都市過渡
      theme: {
        roof: null,
        weather: 'snow',
        ground: 0x9aa4ae,
        slope: 0x4a5058,
        sky: 0xa8b4c0,
        fog: 0xa8b4c0,
        sunI: 0.8,
        hemiI: 0.9,
        fogFar: 170,
      },
      // 地面往一側下陷，盡頭是研究所的大型閘門
      terrain(w) {
        const r = makeRng(w.seed * 71 + 13);
        const a = r() * Math.PI * 2;
        w.sinkDir = [Math.cos(a), Math.sin(a)];
        const [c, s] = w.sinkDir;
        return (x, z, h) => h - 10 * G * smooth(clamp((x * c + z * s - 12 * G) / (45 * w.k), 0, 1));
      },
      build(w) {
        const [c, s] = w.sinkDir;
        const d = 48 * w.k,
          x = c * d,
          z = s * d;
        const g = buildFacilityGate();
        g.rotation.y = Math.atan2(-c, -s);
        const ob = w.addSmall(g, x, w.terrainHeight(x, z) - 0.5, z, {
          w: 10 * GATE_S,
          h: 16 * GATE_S,
          d: 10 * GATE_S,
        });
        ob.mats = [];
      },
    },
    flooded: {
      name: '浸水區',
      theme: {
        featureKinds: ['platforms', 'bunkers'],
        water: { level: 0.3, color: 0x3a1e22, opacity: 0.9 },
        fog: 0x2a1418,
      },
      // 整片泡在水裡（水深約 1 m，涉水變慢；平台上是乾的）
      terrain: () => (x, z, h) => h * 0.4 - 1.1 * G,
    },
    blackout: {
      name: '停電區',
      theme: { featureKinds: ['bunkers', 'platforms'], sunI: 0.15, hemiI: 0.4, fog: 0x140606, fogFar: 100 },
      // 只剩紅色的緊急照明
      build(w) {
        lampPosts(w, w.cnt(12, 16), 0xff3020);
      },
    },
  },
  snow: {
    blizzard: {
      name: '暴風雪',
      theme: {
        featureKinds: ['bunkers', 'platforms'],
        fogNear: 10,
        fogFar: 72,
        fog: 0xdfe6ec,
        sky: 0xdfe6ec,
        sunI: 0.5,
        hemiI: 1.05,
      },
    },
    crevasse: {
      name: '冰河裂谷',
      theme: { featureKinds: ['platforms'], corridor: { p: 0.3, kinds: ['road'] }, slope: 0x7a96b0 },
      // 三道深 9 m 的冰河裂縫（避開出生點附近）
      terrain(w) {
        const r = makeRng(w.seed * 71 + 13);
        const cuts = [];
        for (let i = 0; i < 3; i++) {
          const a = r() * Math.PI,
            off = (r() * 2 - 1) * 45 * w.k;
          if (Math.abs(off) < 12 * G) continue;
          cuts.push({ c: Math.cos(a), s: Math.sin(a), off, wd: (4 + r() * 3) * G });
        }
        return (x, z, h) => {
          let k = 0;
          for (const q of cuts) {
            const u = Math.abs(-x * q.s + z * q.c - q.off);
            k = Math.max(k, 1 - smooth(clamp((u - q.wd) / (3 * G), 0, 1)));
          }
          return h - 9 * G * k;
        };
      },
      offLimits: (w, x, z) => w.terrainHeight(x, z) < -3 * G,
    },
    outpost: {
      name: '前線基地',
      theme: { featureKinds: ['bunkers'], corridor: { p: 0.7, kinds: ['road'] } },
      // 圍住中央的防爆牆（留缺口）與四角的瞭望塔
      build(w) {
        const R = rnd(26, 34) * w.k;
        for (const [ax, sgn] of [
          [0, 1],
          [0, -1],
          [1, 1],
          [1, -1],
        ]) {
          for (let v = -R; v < R; v += 20) {
            if (Math.abs(v + 10) < 7 * MS) continue; // 正中央的缺口（機甲通得過）
            const x = ax ? sgn * R : v + 10,
              z = ax ? v + 10 : sgn * R;
            if (
              w.onCorridor(x, z, 6) ||
              w.isReserved(x, z, 2) ||
              !free(w, x, z, ax ? 1 : 10, ax ? 10 : 1, 0.5)
            )
              continue;
            const g = buildSnowWall(19.6);
            if (ax) g.rotation.y = Math.PI / 2;
            w.addSmall(
              g,
              x,
              w.terrainHeight(x, z) - 0.3,
              z,
              { w: ax ? 1.4 : 19.6, h: 4.8, d: ax ? 19.6 : 1.4 },
              'snowwall',
              5000,
              0x8e8a82,
            );
          }
          const tx = sgn * (R + 12) * (ax ? 1 : -1),
            tz = sgn * (R + 12);
          if (!w.onCorridor(tx, tz, 4) && free(w, tx, tz, 2, 2, 0.5))
            w.addSmall(
              buildWatchtower(),
              tx,
              w.terrainHeight(tx, tz) - 0.2,
              tz,
              { r: 2, h: 10.5 },
              'tower',
              3000,
              0x9aa0a6,
            );
        }
      },
    },
    icefield: {
      name: '大冰湖',
      theme: { featureKinds: ['bunkers', 'platforms'], corridor: { p: 0.2, kinds: ['road'] } },
      // 地圖的一大片是結冰的湖面（冰面上滑行砲車更快）
      terrain(w) {
        const r = makeRng(w.seed * 71 + 13);
        const a = r() * Math.PI * 2;
        w.iceBig = { x: Math.cos(a) * 30 * w.k, z: Math.sin(a) * 30 * w.k, r: (34 + r() * 10) * w.k };
        const L = w.iceBig;
        return (x, z, h) => {
          const t = clamp((L.r - Math.hypot(x - L.x, z - L.z)) / (8 * G), 0, 1);
          return h + (-0.7 * G - h) * smooth(t);
        };
      },
      build(w) {
        const L = w.iceBig;
        const ice = buildIceSheet(L.r, L.r, makeRng(w.seed * 71 + 29));
        ice.position.set(L.x, -0.7 * G + 0.05, L.z);
        w.scene.add(ice);
        w.meshes.push(ice);
      },
    },
    forest: {
      name: '針葉林',
      theme: { featureKinds: ['bunkers'], corridor: { p: 0.4, kinds: ['road'] } },
      // 成片的針葉樹（可破壞），視線常被擋住
      build(w) {
        w.scatter(w.cnt(50, 70), 8, (x, z, y) => {
          const h = rnd(15, 30);
          const g = buildPine(h);
          g.rotation.y = rnd(0, 6.28);
          w.addSmall(g, x, y - 0.2, z, { r: h * 0.06, h }, 'pine', 800, 0x2a4a3a);
        });
      },
    },
    polar: {
      name: '極夜',
      theme: {
        ...NIGHT,
        featureKinds: ['bunkers', 'platforms'],
        sky: 0x081020,
        fog: 0x1a2840,
        weather: 'snow',
      },
      build(w) {
        lampPosts(w, w.cnt(6, 9));
        w.scatter(w.cnt(2, 3), 12, (x, z, y) =>
          w.addSmall(buildWatchtower(), x, y - 0.2, z, { r: 2, h: 10.5 }, 'tower', 3000, 0x9aa0a6),
        );
      },
    },
  },
  flooded: {
    highway: {
      name: '高架道路',
      theme: {
        featureKinds: ['bunkers', 'platforms'],
        // 一條橫越市區的高架道路（高 7.5 m，可以站上去），大樓避開它
        buildProps(w) {
          const axis = rndi(0, 1);
          const off = rnd(-30, 30) * w.k;
          const y = 16;
          const half = w.size / 2;
          for (let s = -half + 10 * G; s < half - 10 * G; s += 30) {
            const x = axis ? s : off,
              z = axis ? off : s;
            if (Math.abs(x) < 7 * MS && Math.abs(z) < 7 * MS) continue; // 出生點留空
            w.addDeck(x, z, axis ? 30.2 : 22, axis ? 22 : 30.2, y, 1.8, 0);
            for (const k of [-1, 1]) {
              const px = x + (axis ? 0 : k * 7),
                pz = z + (axis ? k * 7 : 0);
              w.addPillar(px, pz, 1.5, w.terrainHeight(px, pz) - 0.3, y - 1.8);
            }
          }
          const x0 = axis ? -half : off - 12,
            x1 = axis ? half : off + 12,
            z0 = axis ? off - 12 : -half,
            z1 = axis ? off + 12 : half;
          w.reserve(x0, x1, z0, z1);
          FLOODED.buildProps(w);
        },
      },
    },
    canal: {
      name: '水道',
      theme: { featureKinds: ['overpass', 'bunkers'] },
      // 兩條很深的水道（水深約 2.5 m，涉水更慢；潛航砲艇的地盤）
      terrain(w) {
        const r = makeRng(w.seed * 71 + 13);
        const a = (r() * 2 - 1) * 40 * w.k,
          b = (r() * 2 - 1) * 40 * w.k;
        return (x, z, h) => {
          const t = Math.min(Math.abs(x - a), Math.abs(z - b));
          return lerpH(h, -2.4 * G, 1 - smooth(clamp((t - 6 * G) / (3 * G), 0, 1)));
        };
      },
    },
    suburb: {
      name: '郊區',
      theme: {
        featureKinds: ['bunkers', 'overpass'],
        fogFar: 190,
        sunI: 0.85,
        // 低矮的住宅廢墟（4～8 m，屋頂可站）、車輛、路燈；沒有高樓
        buildProps(w) {
          // 現實的住宅（6–12 m 見方、1～2 層），屋頂可站
          w.scatter(w.cnt(34, 48), 7, (x, z, y) => {
            if (w.terrainHeight(x, z) < 0.3 * G) return;
            const bw = rnd(6, 12),
              bd = rnd(6, 10),
              h = rnd(4, 8);
            const g = buildRuinTower(bw, h, bd, rnd(0, 1) < 0.4, Math.floor(rnd(0, 1e6)));
            w.addSmall(g, x, y - 0.3, z, { w: bw, h, d: bd });
          });
          w.scatter(
            w.cnt(16, 24),
            6,
            (x, z, y) => {
              const color = pick([0x7a3a2a, 0x3a4a5a, 0x6a6a5a, 0x8a7a3a]);
              const g = buildWreckCar(color);
              w.addSmall(g, x, y - 0.1, z, { w: CAR[0], h: CAR[1], d: CAR[2] }, 'car', 900, color);
            },
            false,
          );
          w.scatter(
            w.cnt(12, 18),
            6,
            (x, z, y) => {
              const h = rnd(8, 12);
              const g = buildBentLamp(h);
              g.rotation.y = rnd(0, 6.28);
              w.addSmall(g, x, y - 0.2, z, { r: 0.5, h }, 'streetlamp', 600, 0x4a4f52);
            },
            false,
          );
        },
      },
    },
    toxic: {
      name: '汙染沼澤',
      theme: {
        featureKinds: ['bunkers', 'platforms'],
        water: { level: 0.2, color: 0x4e5e1e, opacity: 0.93 },
        fog: 0x8a9a5a,
        sky: 0x9aa86a,
        fogNear: 30,
        fogFar: 140,
        weather: 'ash',
        propNames: { drum: '汙染物桶' },
      },
      // 整片往下沉，大部分街區泡在水裡
      terrain: () => (x, z, h) => h - 0.55 * G,
      build(w) {
        w.scatter(
          w.cnt(24, 34),
          4,
          (x, z, y) => {
            const g = buildToxicDrum();
            g.rotation.set(rnd(-0.3, 0.3), rnd(0, 6), rnd(-0.3, 0.3));
            w.addSmall(g, x, y - 0.2, z, { r: 0.5, h: 1.2 }, 'drum', 300, 0x8a9a2a);
          },
          false,
        );
      },
    },
    stilts: {
      name: '高腳屋區',
      theme: { featureKinds: ['bunkers'] },
      // 水面上的高腳平台（20–30 m 見方、離水面 14 m，可以站上去、機甲從底下涉水穿過）
      build(w) {
        w.scatter(w.cnt(8, 12), 14, (x, z, y) => {
          const s = rnd(20, 30);
          const top = Math.max(y, 0) + 14;
          w.addDeck(x, z, s, s, top, 1.2, 0);
          for (const [dx, dz] of [
            [-1, -1],
            [1, -1],
            [-1, 1],
            [1, 1],
          ]) {
            const px = x + dx * (s / 2 - 1.2),
              pz = z + dz * (s / 2 - 1.2);
            w.addPillar(px, pz, 0.8, w.terrainHeight(px, pz) - 0.3, top - 1.2);
          }
        });
      },
    },
    mist: {
      name: '濃霧街區',
      theme: { fogNear: 8, fogFar: 62, fog: 0xa8b0a0, sky: 0xa8b0a0, sunI: 0.5, hemiI: 1, weather: 'rain' },
    },
  },
  dam: {
    gorge: {
      name: '峽谷段',
      theme: {
        featureKinds: ['bunkers', 'platforms'],
        corridor: { p: 0.3, kinds: ['road'] },
        rock: 0x3e3c36,
      },
      // 洩洪河道兩側（離河道 40 m 外）是陡峭的岩壁，壩體兩端埋進岩壁裡
      terrain: (w) => (x, z, h) =>
        h + 17 * G * smooth(clamp((Math.abs(x - w.dam.xr) - 40 * w.k) / (9 * G), 0, 1)),
      offLimits: (w, x, z) => w.terrainHeight(x, z) > 8 * G,
    },
    weirs: {
      name: '攔砂壩群',
      theme: { featureKinds: ['bunkers'], corridor: { p: 0.4, kinds: ['road', 'rail'] } },
      // 下游兩道攔砂壩（高 12～15 m，機甲跳得過去），河道與公路處留缺口
      build(w) {
        const D = w.dam,
          dn = -D.up;
        const half = w.size / 2;
        for (const off of [26 * w.k, 52 * w.k]) {
          const z = D.zc + dn * (off + rnd(-4, 4) * G);
          const gx = rnd(-w.lim * 0.7, w.lim * 0.7);
          for (let x = -half + 6 * G; x < half - 6 * G; x += 12 * G) {
            if (
              Math.abs(x - D.xr) < 10 * G ||
              Math.abs(x - gx) < 8 * G ||
              w.onCorridor(x, z, 7 * G) ||
              w.isReserved(x, z, 2)
            )
              continue;
            if (Math.abs(x) > w.limOut) continue;
            const h = rnd(4, 5);
            const y = w.terrainHeight(x, z) - 1 * G;
            const g = buildWeir(12, h + 1);
            g.scale.setScalar(G);
            w.addSmall(g, x, y, z, { w: 12 * G, h: (h + 1) * G, d: 3 * G });
          }
        }
      },
    },
    plant: {
      name: '水力發電廠',
      theme: { featureKinds: ['bunkers', 'trench'], corridor: { p: 0.5, kinds: ['road'] } },
      // 壩體下游的發電廠房、從壩體往下游的壓力水管
      build(w) {
        const D = w.dam,
          dn = -D.up;
        // 壓力水管（機甲尺度：放大 G 倍，管徑約 7 m）
        for (let k = 0; k < 2; k++) {
          const x = rnd(-w.lim * 0.6, w.lim * 0.6);
          if (Math.abs(x - D.xr) < 16 * G) continue;
          const z = D.zc + dn * (18 + k * 6) * G;
          const len = 22 * G;
          const cz = z + (dn * len) / 2;
          if (w.onCorridor(x, cz, 6 * G) || !free(w, x, cz, 2 * G, len / 2)) continue;
          for (const s of [-1, 1]) {
            const g = buildPenstock(len / G);
            g.scale.setScalar(G);
            const px = x + s * 3 * G;
            w.addSmall(g, px, w.terrainHeight(px, cz) - 0.9, cz, { w: 3 * G, h: 3.4 * G, d: len });
          }
        }
        // 發電廠房（現實尺寸 60 × 36 × 20 m，大門機甲通得過）
        const [gw, gh] = WH_GATE,
          ga = gw / 2;
        for (let k = w.cnt(1, 2); k > 0; k--) {
          const hw = 30,
            hd = 18,
            hh = 20;
          place(
            w,
            buildWarehouse(hw * 2, hd * 2, hh, 0xa8a49a),
            [-hw - 1, hw + 1, -hd - 1, hd + 1],
            2.5 * G,
            [
              { box: [-hw, -ga, -hd - 0.3, -hd + 0.3], top: hh },
              { box: [ga, hw, -hd - 0.3, -hd + 0.3], top: hh },
              { box: [-hw, -ga, hd - 0.3, hd + 0.3], top: hh },
              { box: [ga, hw, hd - 0.3, hd + 0.3], top: hh },
              { box: [-ga, ga, -hd - 0.3, -hd + 0.3], y: gh, top: hh },
              { box: [-ga, ga, hd - 0.3, hd + 0.3], y: gh, top: hh },
              { box: [-hw - 0.3, -hw + 0.3, -hd, hd], top: hh },
              { box: [hw - 0.3, hw + 0.3, -hd, hd], top: hh },
            ],
          );
        }
      },
    },
    storm: {
      name: '暴雨洩洪',
      theme: {
        featureKinds: ['platforms', 'trench'],
        weather: 'rain',
        fogNear: 22,
        fogFar: 115,
        fog: 0x7a8488,
        sky: 0x6a7478,
        sunI: 0.5,
        hemiI: 0.75,
      },
      // 下游的河道變寬變深
      terrain: (w) => (x, z, h) => {
        const D = w.dam;
        const u = (z - D.zc) * D.up;
        if (u > 0) return h;
        const c = clamp(1 - (Math.abs(x - D.xr) - 12 * G) / (8 * G), 0, 1);
        return h - 2.2 * G * smooth(c) * clamp(-u / (12 * G), 0, 1);
      },
    },
    night: {
      name: '夜間檢修',
      theme: { ...NIGHT, featureKinds: ['bunkers', 'platforms'] },
      build(w) {
        lampPosts(w, w.cnt(10, 14));
      },
    },
    quarry: {
      name: '採石場',
      theme: { featureKinds: ['platforms'], corridor: { p: 0.6, kinds: ['road'] }, ground: 0x8a8478 },
      // 落石堆（可破壞）
      build(w) {
        rockPiles(w, w.cnt(10, 14), 0x7a7468);
      },
    },
  },
  wasteland: {
    factory: {
      name: '廢工廠群',
      theme: { featureKinds: ['bunkers', 'platforms'], corridor: { p: 0.35, kinds: ['road'] } },
      // 廠區整地：地形壓平
      terrain: () => (x, z, h) => h * 0.3,
      build(w) {
        for (let k = w.cnt(6, 9); k > 0; k--) {
          const hw = rndi(15, 25),
            hd = rndi(12, 20),
            hh = rnd(15, 25),
            ga = Math.min(18, hw) / 2;
          place(w, buildFactoryHall(hw * 2, hd * 2, hh), [-hw - 1, hw + 1, -hd - 1, hd + 1], 2.5 * G, [
            { box: [-hw, hw, -hd - 0.4, -hd + 0.4], top: hh },
            { box: [-hw - 0.4, -hw + 0.4, -hd, hd], top: hh },
            { box: [hw - 0.4, hw + 0.4, -hd, hd], top: hh },
            { box: [-hw, -ga, hd - 0.4, hd + 0.4], top: hh },
            { box: [ga, hw, hd - 0.4, hd + 0.4], top: hh },
          ]);
        }
      },
    },
    pipeline: {
      name: '輸油管線帶',
      theme: { featureKinds: ['trench'], corridor: { p: 0.5, kinds: ['rail'] } },
      terrain: () => (x, z, h) => h * 0.55,
      build(w) {
        // 幾條平行的地面管線（中間留缺口可以穿過）＋泵站
        const axis = rndi(0, 1);
        const lines = rndi(3, 4);
        const span = 50 * w.k;
        for (let i = 0; i < lines; i++) {
          const off = -span * 0.8 + ((span * 1.6) / (lines - 1)) * i + rnd(-4, 4);
          if (Math.abs(off) < 8 * MS) continue;
          let s = -span;
          while (s < span) {
            const len = rnd(40, 70);
            const c = s + len / 2;
            const x = axis ? c : off,
              z = axis ? off : c;
            if (!w.onCorridor(x, z, 6) && !w.isReserved(x, z, 3)) {
              const g = buildGroundPipe(len);
              const y = w.terrainHeight(x, z) - 0.2;
              g.position.set(x, y, z);
              if (axis) g.rotation.y = Math.PI / 2;
              w.addDecorMesh(g);
              w.obstacles.push({
                kind: 'box',
                x,
                z,
                w: axis ? len : 1.6,
                d: axis ? 1.6 : len,
                y,
                top: y + 1.7,
                group: g,
                mats: [],
                box: null,
              });
            }
            s += len + rnd(9, 14) * MS;
          }
        }
        for (let k = w.cnt(3, 5); k > 0; k--)
          place(w, buildPumpStation(), [-9, 8, -4, 4], 2 * G, [
            { box: [-4, 4, -3, 3], top: 5.5 },
            { c: [-6.5, 0], r: 2, h: 6 },
            { c: [6, 1], r: 1.6, h: 5 },
          ]);
      },
    },
    slag: {
      name: '礦渣堆場',
      theme: {
        featureKinds: ['platforms'],
        corridor: { p: 0.25, kinds: ['rail'] },
        ground: 0x6a5c52,
        slope: 0x433832,
        rock: 0x2e2824,
        fog: 0xa8988a,
      },
      // 十幾座圓錐形的渣山（避開中央出生點）
      terrain(w) {
        const r = makeRng(w.seed * 71 + 13);
        const heaps = [];
        const L = 52 * w.k;
        for (let t = 0; t < 80 && heaps.length < Math.round((12 * w.k) / G); t++) {
          const x = (r() * 2 - 1) * L,
            z = (r() * 2 - 1) * L;
          if (Math.hypot(x, z) < 22 * G) continue;
          if (heaps.some((q) => Math.hypot(q.x - x, q.z - z) < q.r * 0.8)) continue;
          heaps.push({ x, z, r: (9 + r() * 10) * G, h: (5 + r() * 9) * G });
        }
        return (x, z, h) => {
          let m = h * 0.5;
          for (const q of heaps) {
            const t = clamp(1 - Math.hypot(x - q.x, z - q.z) / q.r, 0, 1);
            m = Math.max(m, h * 0.5 + q.h * smooth(t));
          }
          return m;
        };
      },
    },
    junction: {
      name: '公路交流道',
      theme: { featureKinds: ['overpass', 'bunkers'], corridor: { p: 1, kinds: ['road'] } },
      terrain: () => (x, z, h) => h * 0.4,
      build(w) {
        // 護欄列與燒毀的車輛
        w.scatter(w.cnt(20, 30), 7, (x, z, y) => {
          const g = buildBarrier();
          g.rotation.y = rndi(0, 1) * (Math.PI / 2);
          const a = g.rotation.y ? 1 : 0;
          w.addSmall(g, x, y, z, { w: a ? 0.9 : 4, h: 1.1, d: a ? 4 : 0.9 });
        });
        w.scatter(w.cnt(12, 18), 8, (x, z, y) => {
          const g = buildCarWreck();
          w.addSmall(g, x, y, z, { r: 1.6, h: 1.8 }, 'car', 600, 0x5e3e28);
        });
      },
    },
    craters: {
      name: '隕坑地帶',
      theme: { featureKinds: ['platforms'], corridor: { p: 0.3, kinds: ['road'] } },
      terrain: (w) => craterTerrain(w, Math.round((9 * w.k) / G), [10, 18], [4, 8]),
    },
    town: {
      name: '廢棄城鎮',
      theme: { featureKinds: ['bunkers'], corridor: { p: 0.8, kinds: ['road'] } },
      terrain: () => (x, z, h) => h * 0.35,
      // 低矮的建築廢墟（屋頂可站）與燒毀的車輛
      build(w) {
        w.scatter(w.cnt(24, 34), 8, (x, z, y) => {
          const bw = rnd(7, 14),
            bd = rnd(7, 12),
            h = rnd(5, 12);
          const g = buildRuinTower(bw, h, bd, rnd(0, 1) < 0.5, Math.floor(rnd(0, 1e6)));
          w.addSmall(g, x, y - 0.3, z, { w: bw, h, d: bd });
        });
        w.scatter(w.cnt(10, 16), 8, (x, z, y) =>
          w.addSmall(buildCarWreck(), x, y, z, { r: 1.6, h: 1.8 }, 'car', 600, 0x5e3e28),
        );
      },
    },
  },
  dunes: {
    ridges: {
      name: '巨大沙丘脊',
      theme: { featureKinds: ['platforms'], corridor: { p: 0.25, kinds: ['road'] } },
      // 沙丘的起伏放大：高低差大、視線常被擋住
      terrain: () => (x, z, h) => h * 1.8,
    },
    flats: {
      name: '鹽灘平原',
      theme: {
        featureKinds: ['bunkers', 'trench'],
        corridor: { p: 0.6, kinds: ['road'] },
        ground: 0xd8ceb4,
        slope: 0xb8aa8a,
        fog: 0xe8e0cc,
        sky: 0xf0e8d8,
      },
      terrain: () => (x, z, h) => h * 0.2,
      build(w) {
        // 鹽柱（可破壞）
        // 鹽柱（現實的鹽岩柱 5–15 m）
        w.scatter(w.cnt(20, 30), 10, (x, z, y) => {
          const h = rnd(5, 15);
          const g = buildSaltPillar(h);
          g.scale.set(h / 6, 1, h / 6);
          g.rotation.y = rnd(0, 6.28);
          w.addSmall(g, x, y - 0.2, z, { r: (0.9 * h) / 6, h }, 'salt', 100 * h, 0xe8e2d0);
        });
      },
    },
    wrecks: {
      name: '艦體墓場',
      theme: { featureKinds: ['bunkers'], corridor: { p: 0.3, kinds: ['road'] } },
      build(w) {
        for (let i = 0; i < 2; i++) w.buildWrecks();
      },
    },
    storm: {
      name: '沙暴區',
      theme: {
        featureKinds: ['bunkers', 'platforms'],
        fogNear: 14,
        fogFar: 85,
        fog: 0xc8a878,
        sky: 0xc8a878,
        sunI: 0.55,
        hemiI: 0.85,
        weather: 'sand',
      },
    },
    buried: {
      name: '埋沒都市',
      theme: { featureKinds: ['bunkers'], corridor: { p: 0.3, kinds: ['road'] } },
      // 半埋在沙裡的大樓廢墟
      build(w) {
        // 現實的大樓（寬 20–40、高 20–50 m）半埋在沙裡
        w.scatter(w.cnt(10, 15), 14, (x, z, y) => {
          const bw = rnd(20, 40),
            bd = rnd(20, 35),
            h = rnd(20, 50),
            sink = rnd(2, 5) * G;
          const g = buildRuinTower(bw, h, bd, true, Math.floor(rnd(0, 1e6)));
          w.addSmall(g, x, y - sink, z, { w: bw, h, d: bd });
        });
      },
    },
    night: { name: '沙漠之夜', theme: { ...NIGHT, sky: 0x101428, fog: 0x2a2838, fogFar: 170 } },
  },
  desert: {
    openpit: {
      name: '露天礦場',
      theme: { featureKinds: ['platforms'], corridor: { p: 0.3, kinds: ['rail'] } },
      // 階梯式大坑：中心在出生點附近，4 層平台
      terrain(w) {
        const r = makeRng(w.seed * 71 + 13);
        const cx = (r() - 0.5) * 30 * G,
          cz = (r() - 0.5) * 30 * G,
          R = 58 * w.k,
          D = 20 * G;
        return (x, z, h) => {
          const t = clamp(1 - Math.hypot(x - cx, z - cz) / R, 0, 1);
          const st = 4;
          const f = t * st;
          const i = Math.floor(f),
            fr = f - i;
          const step = (i + smooth(clamp((fr - 0.7) / 0.3, 0, 1))) / st;
          return h * 0.4 - D * step;
        };
      },
    },
    tunnels: {
      name: '坑道網',
      theme: {
        featureKinds: ['bunkers'],
        corridor: { p: 0, kinds: [] },
        roof: { y: 17, color: 0x2e2620, bump: 5 },
        sunI: 0.45,
        hemiI: 0.7,
        fogNear: 25,
        fogFar: 130,
        fog: 0x4a3c30,
        sky: 0x2a2018,
      },
      // 岩壁圍出的坑道：幾條沿 X／Z 的通道（一條經過中心），通道外是岩壁
      terrain(w) {
        const r = makeRng(w.seed * 71 + 13);
        const L = 60 * w.k;
        const xs = [0],
          zs = [0];
        for (let i = 0; i < 2; i++) {
          xs.push((r() * 2 - 1) * L * 0.75);
          zs.push((r() * 2 - 1) * L * 0.75);
        }
        const halls = [];
        for (let i = 0; i < 3; i++)
          halls.push({ x: (r() * 2 - 1) * L * 0.6, z: (r() * 2 - 1) * L * 0.6, r: (12 + r() * 8) * G });
        const half = 7 * G;
        return (x, z, h) => {
          let d = 1e9;
          for (const a of xs) d = Math.min(d, Math.abs(x - a));
          for (const b of zs) d = Math.min(d, Math.abs(z - b));
          for (const q of halls) d = Math.min(d, Math.hypot(x - q.x, z - q.z) - q.r + half);
          const t = clamp((d - half) / (4 * G), 0, 1);
          return h * 0.2 + 21 * G * smooth(t);
        };
      },
      // 岩壁（高過岩頂）上不放東西、不生成
      offLimits: (w, x, z) => w.terrainHeight(x, z) > 6 * G,
    },
    shaft: {
      name: '豎井大廳',
      theme: { featureKinds: ['bunkers'], corridor: { p: 0, kinds: [] }, fogFar: 160 },
      // 中央的大豎井（碗形下陷）與環狀台階
      terrain(w) {
        const R = 40 * w.k,
          D = 18 * G;
        return (x, z, h) => {
          const d = Math.hypot(x, z);
          const t = clamp(1 - d / R, 0, 1);
          const ring = d > R * 0.55 && d < R * 0.7 ? 0.45 : null;
          const k = ring !== null ? Math.min(ring, smooth(t)) : smooth(t);
          return h * 0.6 - D * k;
        };
      },
      build(w) {
        // 豎井壁上的懸空平台
        const R = 40 * w.k;
        const n = rndi(4, 6);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2);
          const x = Math.cos(a) * R * 0.78,
            z = Math.sin(a) * R * 0.78;
          const y = w.terrainHeight(x, z) + rnd(5, 8) * G;
          w.addDeck(x, z, rnd(8, 12) * G, rnd(8, 12) * G, y, 1.2, 0);
        }
      },
    },
    vein: {
      name: '地下礦脈',
      theme: {
        featureKinds: ['bunkers', 'trench'],
        corridor: { p: 0, kinds: [] },
        roof: { y: 22, color: 0x1e1a22, bump: 9 },
        sunI: 0.3,
        hemiI: 0.55,
        fogNear: 20,
        fogFar: 120,
        fog: 0x2a2434,
        sky: 0x16121c,
        ground: 0x5a4a44,
        slope: 0x3e3230,
        rock: 0x2a2226,
      },
      build(w) {
        w.scatter(w.cnt(20, 30), 12, (x, z, y) => {
          const h = rnd(2, 4.5) * G;
          const g = buildCrystal(h);
          g.rotation.y = rnd(0, 6.28);
          w.addSmall(g, x, y, z, { r: h * 0.3, h }, 'crystal', 300 * h, 0x7fe0ff);
        });
      },
    },
    outskirts: {
      name: '礦場外圍',
      border: true, // 交界區段：地表主題往礦坑過渡
      theme: {
        featureKinds: ['bunkers', 'trench'],
        corridor: { p: 0.8, kinds: ['rail'] },
        ground: 0x8a7458,
        slope: 0x5e4a3a,
        weather: 'dust',
      },
      // 地面往一側下陷（礦坑的方向）
      terrain(w) {
        const r = makeRng(w.seed * 71 + 13);
        const a = r() * Math.PI * 2,
          c = Math.cos(a),
          s = Math.sin(a);
        w.sinkDir = [c, s];
        return (x, z, h) => {
          const u = x * c + z * s;
          return h - 12 * G * smooth(clamp((u - 10 * G) / (50 * w.k), 0, 1));
        };
      },
      build(w) {
        const [c, s] = w.sinkDir || [1, 0];
        // 坑口放在下陷的那一側
        for (let t = 0; t < 10; t++) {
          const d = 45 * w.k + rnd(-6, 6) * G,
            x = c * d + rnd(-10, 10) * G,
            z = s * d + rnd(-10, 10) * G;
          if (w.onCorridor(x, z, 8 * G) || w.isReserved(x, z, 6 * G)) continue;
          const g = buildMinePortal();
          const y = w.terrainHeight(x, z);
          g.rotation.y = Math.atan2(-c, -s);
          const P = PORTAL_S;
          const ob = w.addSmall(g, x, y - 0.3, z, { w: 20 * P, h: 13 * P, d: 6 * P });
          ob.mats = [];
          break;
        }
      },
    },
    drowned: {
      name: '浸水坑道',
      theme: {
        featureKinds: ['bunkers', 'platforms'],
        corridor: { p: 0, kinds: [] },
        roof: { y: 19, color: 0x26221e, bump: 6 },
        water: { level: 0.2, color: 0x2a3a3a, opacity: 0.9 },
        sunI: 0.4,
        hemiI: 0.65,
        fogNear: 22,
        fogFar: 125,
        fog: 0x2e3634,
        sky: 0x1a1e1e,
      },
      // 湧水淹過的坑道（水深約 1 m，涉水變慢）
      terrain: () => (x, z, h) => h * 0.3 - 0.8 * G,
    },
    collapse: {
      name: '崩落區',
      theme: {
        featureKinds: ['bunkers'],
        corridor: { p: 0, kinds: [] },
        roof: { y: 15, color: 0x2e2620, bump: 6 },
        sunI: 0.4,
        hemiI: 0.65,
        fogNear: 20,
        fogFar: 115,
        fog: 0x3e3228,
        sky: 0x241c16,
        weather: 'dust',
      },
      terrain: () => (x, z, h) => h * 0.5,
      // 岩頂崩落的落石堆（可破壞）
      build(w) {
        rockPiles(w, w.cnt(14, 20), 0x5a4a3a);
      },
    },
  },
};
export const variantKeys = (theme) => Object.keys(VARIANTS[theme] || {});
export const variantOf = (theme, key) => (VARIANTS[theme] || {})[key] || null;
// 模型庫登記：[key, 名稱, 備註, build]
export const VARIANT_CATALOG = [
  // 貨櫃堆：模型庫列共用的 prop/container_stack（現實尺寸的 40 呎貨櫃）
  ['boxcar', '有蓋貨車', '集散場「貨運調度場」；現實尺寸長 12 m，可破壞', () => buildBoxcar(12, 0x8a3a2a)],
  ['rail_track', '側線軌道', '集散場「貨運調度場」的裝飾；長 12 m', () => buildTrack(12)],
  [
    'quay_crane',
    '岸壁起重機',
    '集散場「港灣碼頭」；現實尺寸高約 66 m（舊模型放大 2.2 倍），吊臂伸向海面，四支腳有碰撞',
    () => buildQuayCrane(),
  ],
  ['bollard', '繫船柱', '集散場「港灣碼頭」的裝飾', () => buildBollard()],
  ['slag_pit', '熔渣坑', 'Grid 086「熔爐區」的裝飾，發光的圓坑（遊戲中直徑 12–21 m）', () => buildSlagPit(3)],
  [
    'hull_plate',
    '船殼板殘骸',
    '舊宇宙港「廢墟港」；太空船的殘骸，寬 12–36 m，可破壞',
    () => buildHullPlate(6, 4),
  ],
  [
    'facility_gate',
    '研究所閘門',
    '技研都市「地表入口」；機甲進出的閘門，寬 56、高 34 m（舊模型放大 2 倍）',
    () => buildFacilityGate(),
  ],
  [
    'snow_blast_wall',
    '防爆牆',
    '冰原「前線基地」；現實的防爆牆，每段 19.6 m、高 4.8 m（半身掩體），可破壞',
    () => buildSnowWall(9.6),
  ],
  ['watchtower', '瞭望塔', '冰原「前線基地」；現實尺寸高約 10.5 m，可破壞', () => buildWatchtower()],
  ['toxic_drum', '汙染物桶', '水沒市街「汙染沼澤」；可破壞', () => buildToxicDrum()],
  [
    'weir',
    '攔砂壩',
    '水壩「攔砂壩群」；機甲尺度（遊戲中放大 3 倍：長 36、高 15–18 m），不可破壞',
    () => buildWeir(12, 5),
  ],
  [
    'penstock',
    '壓力水管',
    '水壩「水力發電廠」；遊戲中放大 3 倍（長 66 m、管徑 7.2 m）',
    () => buildPenstock(22),
  ],
  [
    'factory_hall',
    '廢工廠廠房',
    '荒野「廢工廠群」；現實尺寸寬 30–50、深 24–40、高 15–25 m，大門機甲通得過',
    () => buildFactoryHall(16, 14, 9),
  ],
  [
    'ground_pipe',
    '地面管線',
    '荒野「輸油管線帶」；現實尺寸長 40–70 m、管徑 1.1 m（機甲跨得過）',
    () => buildGroundPipe(24),
  ],
  ['pump_station', '泵站', '荒野「輸油管線帶」；現實尺寸 8 × 6 m', () => buildPumpStation()],
  ['barrier', '紐澤西護欄', '荒野「公路交流道」；長 4 m', () => buildBarrier()],
  ['car_wreck', '燒毀的車輛', '荒野「公路交流道」；可破壞', () => buildCarWreck()],
  ['crystal_s', '結晶簇', '礦坑「地下礦脈」；遊戲中高 6–13.5 m，可破壞', () => buildCrystal(3)],
  ['salt_pillar', '鹽柱', '沙丘「鹽灘平原」；高 5–15 m（依高度等比例），可破壞', () => buildSaltPillar(4)],
  [
    'mine_portal',
    '礦坑坑口',
    '礦坑「礦場外圍」；機甲尺度的坑口，寬 40、高 26 m（舊模型放大 2 倍）',
    () => buildMinePortal(),
  ],
  [
    'storage_tank',
    '儲油槽',
    '集散場「儲油槽區」；現實尺寸半徑 10–20、高 12–20 m，不可破壞',
    () => buildStorageTank(6, 10),
  ],
  ['pine', '針葉樹', '冰原「針葉林」；現實的樹高 15–30 m，可破壞', () => buildPine(9)],
  [
    'rock_pile',
    '落石堆',
    '水壩「採石場」、礦坑「崩落區」等；直徑 8–16 m（遊戲中 2–4 倍），可破壞',
    () => buildRockPile(1.2),
  ],
  [
    'lamp_post',
    '照明柱',
    '夜間的變體、技研都市「停電區」（紅色）；現實高 8–12 m，可破壞',
    () => buildLampPost(7),
  ],
  [
    'lift_pad',
    '升降梯平台',
    '主線：下降後的入口結構（不碰撞；遊戲中放大 2.5 倍，25 m 見方）',
    () => buildLiftPad(),
  ],
  ['landing_zone', '降落區標示', '主線：空降的入口標示（不碰撞；遊戲中放大 3 倍）', () => buildLandingZone()],
];
