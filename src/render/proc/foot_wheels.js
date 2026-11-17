// 腳掌的輪子（2026-11-17，使用者要求）：照 GLB 重建的腳掌上都有輪子，但它只是腳掌清單裡的一堆三角形、不會轉，
// 側面也看不出輪圈與胎皮。這裡把每隻腳掌的輪子換成另外建的輪子（胎皮＋輪圈＋輪蓋），
// 掛成會轉的子群組（mech-model.js 的 procPrimPiece／animateMech 的 footWheels：滑行時依走過的距離轉）。
//   FOOT_WHEELS[槽位]＝[{ c 中心, axis 輪軸方向, r 半徑, w 胎寬 }…]（glTF 座標：+Z 正面、公尺；照清單量的）
//   stripWheels(清單, 輪子)＝把原本的輪子（整個落在輪子圓柱裡的三角形）從清單拿掉
//   wheelPrims(r, w)＝輪子本身的清單（輪軸＝x、中心在原點）；固定色 WHEEL_COLS（色槽 4 胎皮、5 輪圈）
// 四足後腳在 GLB 裡是兩個大小不同、彼此不平行的圓盤：依使用者定案改成同一根軸上、直徑相同、互相平行的內外兩輪。
// GRANITE、WISP、JACKAL 大輪前方的小圓盤是蓋子（使用者確認），不是輪子，留在腳掌上不動。
import { primsTris } from '../proc-prims.js';

export const WHEEL_COLS = ['#15161a', '#a3a8b0'];
const TYRE = 4,
  RIM = 5;

const norm = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const r4 = (x) => Math.round(x * 10000) / 10000;

// 四足後腳：兩輪的中點、輪軸方向、兩輪中心的間距
const BL_MID = [0.085, -0.35, 0.11],
  BL_AXIS = norm([0.66, 0, 0.75]),
  BL_GAP = 1.62;
const blWheel = (s) => ({
  c: BL_MID.map((v, i) => r4(v + BL_AXIS[i] * s * BL_GAP * 0.5)),
  axis: BL_AXIS,
  r: 1.12,
  w: 0.42,
  // 原本的兩個圓盤大小不同、也不平行，超出新輪子的部分比較多：拿掉的範圍放寬
  padR: 0.42,
  padW: 0.75,
  hub: 0.85,
});

export const FOOT_WHEELS = {
  // GRANITE：原本的輪子外側的輪蓋比新輪子凸出一截（軸向到 +0.62），還有斜穿過輪子的長條碎片（span）：拿掉的範圍放寬
  'legs/l_bp/r_foot': [
    {
      c: [0.269, -0.47, -1.163],
      axis: norm([0.959, -0.044, 0.278]),
      r: 0.773,
      w: 0.62,
      padW: 0.36,
      padR: 0.15,
      span: true,
    },
  ],
  'legs/l_bp2/r_foot': [
    { c: [0.291, -0.486, -1.533], axis: norm([0.978, 0, 0.208]), r: 0.797, w: 0.7, hub: 1.0, padW: 0.42 },
  ],
  'legs/l_hv/r_foot': [{ c: [0.055, -0.47, -1.291], axis: norm([0.952, 0, 0.305]), r: 0.784, w: 0.8 }],
  'legs/l_rj/r_foot': [{ c: [0.195, -0.298, -0.624], axis: norm([0.973, -0.11, 0.204]), r: 0.8, w: 0.6 }],
  // 四足前腳：原本的輪胎比量到的輪圈大一圈（外徑約 0.85）、往內側寬到軸向 −0.86：新輪子照它的大小與位置，否則舊輪胎會包在外面
  'legs/l_qd/fl_foot': [
    { c: [0.017, -0.265, -0.705], axis: norm([0.969, 0, -0.246]), r: 0.86, w: 1.26, padR: 0.1, padW: 0.12 },
  ],
  'legs/l_qd/bl_foot': [blWheel(1), blWheel(-1)],
};
// 留在腳掌上不轉的零件（glTF 座標）：四足後腳兩輪之間的輪軸（原本的被當成輪蓋一起拿掉了）
export const FOOT_EXTRA = {
  'legs/l_qd/bl_foot': () => {
    const a = BL_AXIS;
    const u = norm([-a[2], 0, a[0]]);
    const v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    const h = BL_GAP / 2 - 0.15;
    const H = lathe(
      2,
      [
        [-h, 0.26],
        [-h * 0.5, 0.32],
        [h * 0.5, 0.32],
        [h, 0.26],
      ],
      12,
    );
    // 輪軸＝x 的旋轉體擺到兩輪的中點：(x, y, z) → 軸、v、u（右手系）
    H[2] = H[2].map((p) => [0, 1, 2].map((q) => r4(BL_MID[q] + a[q] * p[0] + v[q] * p[1] + u[q] * p[2])));
    return [H];
  },
};
// 左右鏡像的槽位（proc/index.js 的 MIRRORS）：輪子跟著鏡射
export const mirrorWheels = (ws) =>
  ws.map((k) => ({ ...k, c: [-k.c[0], k.c[1], k.c[2]], axis: [-k.axis[0], k.axis[1], k.axis[2]] }));

// 把原本的輪子從清單拿掉：三個頂點都在某個輪子的範圍（輪胎的圓柱，半徑與寬各放寬一點；加上兩側原本的輪蓋）裡的三角形。結果是一個 'T'
export function stripWheels(prims, wheels, padR = 0.04, padW = 0.16) {
  const list = [];
  const inside = (v) =>
    wheels.some((k) => {
      const d = [v[0] - k.c[0], v[1] - k.c[1], v[2] - k.c[2]];
      const ax = d[0] * k.axis[0] + d[1] * k.axis[1] + d[2] * k.axis[2];
      const rr = Math.hypot(d[0] - k.axis[0] * ax, d[1] - k.axis[1] * ax, d[2] - k.axis[2] * ax);
      // 輪胎的圓柱，加上兩側輪軸附近的輪蓋（半徑 0.66r 以內、往外到 hub）
      if (Math.abs(ax) <= k.w / 2 + (k.padW || padW) && rr <= k.r + (k.padR || padR)) return true;
      return Math.abs(ax) <= (k.hub === undefined ? 0.75 : k.hub) && rr <= k.r * 0.66;
    });
  // span：斜穿過整個輪子的長條碎片（頂點分在輪子兩側、離輪軸都不遠）也拿掉
  const crosses = (t) =>
    wheels.some((k) => {
      if (!k.span) return false;
      let lo = 0,
        hi = 0;
      for (const v of t) {
        const d = [v[0] - k.c[0], v[1] - k.c[1], v[2] - k.c[2]];
        const ax = d[0] * k.axis[0] + d[1] * k.axis[1] + d[2] * k.axis[2];
        const rr = Math.hypot(d[0] - k.axis[0] * ax, d[1] - k.axis[1] * ax, d[2] - k.axis[2] * ax);
        if (rr > k.r * 1.6) return false;
        lo = Math.min(lo, ax);
        hi = Math.max(hi, ax);
      }
      return lo < -k.w / 2 && hi > k.w / 2;
    });
  primsTris(prims).forEach((pos, s) => {
    for (let i = 0; i < pos.length; i += 9) {
      const a = pos.slice(i, i + 3),
        b = pos.slice(i + 3, i + 6),
        c = pos.slice(i + 6, i + 9);
      if (inside(a) && inside(b) && inside(c)) continue;
      if (crosses([a, b, c])) continue;
      list.push([s, a, b, c]);
    }
  });
  return [['T', list]];
}

// 繞 x 軸的旋轉體（凸）：rings＝[[x, 半徑]…]（x 由小到大），n 邊
function lathe(slot, rings, n) {
  const pts = [];
  for (const [x, r] of rings)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([r4(x), r4(Math.cos(a) * r), r4(Math.sin(a) * r)]);
    }
  const faces = [];
  const ring = (k) => Array.from({ length: n }, (_, i) => k * n + i);
  // 從 +x 看，角度增加（y → z）是逆時針
  faces.push(ring(0).reverse());
  for (let k = 0; k + 1 < rings.length; k++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      faces.push([k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i]);
    }
  faces.push(ring(rings.length - 1));
  return ['H', slot, pts, faces];
}
// 輪子：胎皮（深色橡膠，胎肩有倒角、胎面平滑）＋兩側的輪圈（淺色金屬的外緣、深色的凹盤）＋輪蓋（機體主色）；胎塊與輪輻依使用者要求拿掉
export function wheelPrims(r, w) {
  const h = w / 2;
  const N = 20;
  const out = [];
  out.push(
    lathe(
      TYRE,
      [
        [-h, 0.84 * r],
        [-h * 0.86, 0.95 * r],
        [-h * 0.6, r],
        [h * 0.6, r],
        [h * 0.86, 0.95 * r],
        [h, 0.84 * r],
      ],
      N,
    ),
  );
  // 輪圈的外緣（穿過整個輪子的一塊，兩側各凸出一點）
  const e = 0.03;
  out.push(
    lathe(
      RIM,
      [
        [-h - e, 0.6 * r],
        [-h - e * 0.4, 0.68 * r],
        [h + e * 0.4, 0.68 * r],
        [h + e, 0.6 * r],
      ],
      N,
    ),
  );
  // 凹盤（深色）、輪蓋（主色）：兩側各一份
  out.push(
    lathe(
      2,
      [
        [-h - e - 0.012, 0.52 * r],
        [h + e + 0.012, 0.52 * r],
      ],
      N,
    ),
  );
  for (const s of [-1, 1]) {
    const x0 = s * (h + e + 0.012);
    out.push(
      lathe(
        0,
        s > 0
          ? [
              [x0, 0.21 * r],
              [x0 + 0.035, 0.19 * r],
              [x0 + 0.05, 0.12 * r],
            ]
          : [
              [x0 - 0.05, 0.12 * r],
              [x0 - 0.035, 0.19 * r],
              [x0, 0.21 * r],
            ],
        10,
      ),
    );
  }
  return out;
}

// 檢查用（暫存區的三視圖工具）：把輪子擺回腳掌的座標，合成一份清單
export function debugFoot(name, prims) {
  const slot = name.replace(/^legs_(l_[a-z0-9]+)_/, 'legs/$1/');
  const ws = FOOT_WHEELS[slot];
  if (!ws) return { prims };
  const tris = [];
  for (const k of ws) {
    const a = k.axis;
    const u = norm([-a[2], 0, a[0]]); // 水平、垂直於輪軸
    const v = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]];
    primsTris(wheelPrims(k.r, k.w)).forEach((pos, s) => {
      for (let i = 0; i < pos.length; i += 9) {
        const t = [s];
        for (let j = 0; j < 9; j += 3) {
          const p = [pos[i + j], pos[i + j + 1], pos[i + j + 2]];
          t.push([0, 1, 2].map((q) => r4(k.c[q] + a[q] * p[0] + u[q] * p[2] + v[q] * p[1])));
        }
        // (x, y, z) → 軸、v、u：這組基底是左手系時翻面
        tris.push(t);
      }
    });
  }
  return { prims: [...stripWheels(prims, ws), ['T', tris]] };
}
