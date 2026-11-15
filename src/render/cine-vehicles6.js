// 過場與地圖的載具：第六批（地圖上會動的載具第 4 期新增的車種，docs/map-vehicles-design.md）。規則同 render/cine-vehicles.js：
// 真實尺寸（公尺）、原點＝底面中心（氣墊船是裙圍的底）、車頭 +Z、照 docs/model-detail.md 的三層細節。會動的部件放在 parts：
//   hovercraft 氣墊船（parts.propL／propR 後方導管裡的螺旋槳，繞 Z 軸轉；rudL／rudR 方向舵）
// 由 render/cine-vehicles.js 的 buildCineVeh 分派（這裡只匯出建模函式）。
import { P, bakeAll, fine } from './geometry.js';
import { D } from './detail.js';
import { vLight } from './vehicle-kit.js';
import * as K from './dev-kit.js';
import { HP, M, markers, mats, wheelM } from './cine-vehicles.js';

const TINT = { ao: 0.85, grime: 0.28, gh: 0.7 };

// ---------- 氣墊船（長 11 m、寬 5 m）：黑色的橡膠裙圍（圓角的環）、甲板、前方的客艙（大片窗、雷達桅杆）、
//            後方兩個導管風扇（螺旋槳 parts.propL／propR、後面的方向舵 rudL／rudR）、兩側的走道與欄杆 ----------
export function buildHovercraft() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group();
  const hull = M(0x3a5a6e, { roughness: 0.6, metalness: 0.3 });
  const skirtM = M(0x1e2022, { roughness: 0.95, metalness: 0 });
  const L = 11,
    B = 5;
  // 裙圍：跑道形的環（兩側直線段＋前後的半圓；半圓的角度 x＝sinφ、z＝cosφ）
  for (const s of [-1, 1]) P(g, D.box(0.6, 0.9, L - B, 0.25), skirtM, s * (B / 2 - 0.3), 0.45, 0);
  const ring = [
    [B / 2 - 0.6, 0],
    [B / 2, 0.05],
    [B / 2, 0.85],
    [B / 2 - 0.6, 0.9],
  ];
  K.arc(g, skirtM, ring, -HP, HP, 0, 0, L / 2 - B / 2, 14); // 前
  K.arc(g, skirtM, ring, HP, Math.PI + HP, 0, 0, -(L / 2 - B / 2), 14); // 後
  // 船體＋甲板
  P(g, D.box(B - 0.5, 0.7, L - B, 0.15), hull, 0, 1.25, 0);
  P(g, D.box(B - 0.7, 0.06, L - B, 0.02), T.dark, 0, 1.62, 0);
  // 前後的半圓（跟著裙圍的形狀）
  const disc = (r, h) => [
    [0, 0],
    [r, 0],
    [r, h],
    [0, h],
  ];
  for (const [a0, z] of [
    [-HP, L / 2 - B / 2],
    [HP, -(L / 2 - B / 2)],
  ]) {
    K.arc(g, hull, disc(B / 2 - 0.25, 0.7), a0, a0 + Math.PI, 0, 0.9, z, 14);
    K.arc(g, T.dark, disc(B / 2 - 0.35, 0.06), a0, a0 + Math.PI, 0, 1.59, z, 14);
  }
  // 客艙（前）：箱體、斜的前窗、側窗、頂上的雷達桅杆與燈
  P(g, D.box(3.4, 1.7, 4.6, 0.12), M(0x9ea4a8, { roughness: 0.8, metalness: 0.1 }), 0, 2.5, 1.6);
  P(g, D.box(3.0, 0.9, 0.04, 0.01), T.glass, 0, 2.75, 3.93, -0.35, 0, 0);
  for (const s of [-1, 1]) {
    P(g, D.box(0.03, 0.6, 3.6, 0.01), T.glass, s * 1.71, 2.75, 1.5);
    vLight(g, WM, T.lamp, s * 1.2, 2.1, 3.95, 0.09, Math.PI, false);
  }
  K.cy(g, T.dark, 0.06, 1.4, 0, 4.05, 0.8, 8);
  K.bx(g, T.dark, 0.9, 0.08, 0.2, 0, 4.7, 0.8, 0, 0, 0, 0.02); // 雷達
  K.cy(g, T.amber, 0.07, 0.1, 0, 4.82, 0.8, 10);
  // 後方：兩個導管風扇（環＋中心軸＋螺旋槳）＋方向舵
  const parts = {};
  for (const [s, k] of [
    [-1, 'L'],
    [1, 'R'],
  ]) {
    const x = s * 1.25,
      y = 2.95,
      z = -4.1;
    K.lathe(
      g,
      hull,
      [
        [1.0, -0.35],
        [1.12, -0.3],
        [1.12, 0.3],
        [1.0, 0.35],
      ],
      x,
      y,
      z,
      'z',
      22,
    );
    K.bx(g, T.dark, 0.14, 1.6, 0.25, x, 2.1, z, 0, 0, 0, 0.02); // 支架
    const pr = new THREE.Group();
    pr.position.set(x, y, z);
    g.add(pr);
    K.cz(pr, T.dark, 0.16, 0.3, 0, 0, 0, 12);
    for (let i = 0; i < 4; i++)
      K.bx(
        pr,
        T.metal,
        0.16,
        0.92,
        0.04,
        Math.sin((i * Math.PI) / 2) * 0.48,
        Math.cos((i * Math.PI) / 2) * 0.48,
        0,
        0.25,
        0,
        -(i * Math.PI) / 2,
        0.01,
      );
    parts['prop' + k] = pr;
    const rud = new THREE.Group();
    rud.position.set(x, y, z - 0.55);
    g.add(rud);
    K.bx(rud, hull, 0.06, 1.9, 0.6, 0, 0, -0.3, 0, 0, 0, 0.01);
    parts['rud' + k] = rud;
  }
  // 兩側的走道與欄杆、繫纜樁；小細節：舷號、螺栓
  for (const s of [-1, 1]) {
    K.railing(
      g,
      T.yellow,
      [
        [s * 2.15, -3.2],
        [s * 2.15, 3.8],
      ],
      1.65,
      0.55,
      0.02,
    );
    K.cy(g, T.dark, 0.09, 0.25, s * 1.9, 1.78, 4.3, 10);
  }
  markers(g, T, 2.25, 1.3, [4.5, 0, -4.5]);
  fine(() => {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++)
        K.bx(g, T.white, 0.01, 0.32, 0.22, s * 2.26, 1.3, 2.2 - i * 0.3, 0, 0, 0, 0);
      K.boltRow(g, T.steel, -1.4, 1.4, 1.62, s * 5.15, 9, 0.02, s);
    }
  });
  bakeAll(g, { tint: TINT, cache: 'cineveh:hovercraft' });
  return { group: g, wheels: [], parts, len: 11 };
}
