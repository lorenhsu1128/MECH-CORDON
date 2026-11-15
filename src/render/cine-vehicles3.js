// 過場的載具：第三批（水上與太空，docs/cine-redesign-design.md 第十一節「載具 v2」）。規則同 render/cine-vehicles.js：
// 真實尺寸、原點＝底面中心（船＝吃水線的中心、太空的＝機體中心）、船頭／機頭 +Z、三層細節。
//   patrolboat 巡邏小艇、cargoship 貨輪（甲板上的貨櫃、艦橋、吊桿）、lander 登陸艇（parts.ramp 艏門，繞底邊放下）、
//   shuttle 穿梭機（parts.bay 貨艙門）、workpod 太空作業艇（parts.armL／armR 機械臂）、cargopod 貨物吊艙
import { P, bakeAll, fine } from './geometry.js';
import { D } from './detail.js';
import { vLight } from './vehicle-kit.js';
import * as K from './dev-kit.js';
import { HP, M, mats, wheelM } from './cine-vehicles.js';

const TINT = { ao: 0.85, grime: 0.3, gh: 0.8 };
// 船殼：每個站位（z）一個 U 形截面（半寬 w、甲板高 h、船底深 d、底部的圓弧），沿 z 連起來（船頭收窄）
// st＝[[z, 半寬, 甲板高, 船底]...]（由船尾到船頭）
function hull(st, seg = 10) {
  const pos = [];
  const ring = (z, w, h, d) => {
    const pts = [];
    for (let i = 0; i <= seg; i++) {
      const a = Math.PI * (i / seg); // 0＝右舷甲板、π＝左舷甲板
      const x = Math.cos(a) * w,
        y = -Math.sin(a) * d;
      pts.push([x, y, z]);
    }
    // 甲板邊緣：兩側往上到甲板高
    return [[w, h, z], ...pts, [-w, h, z]];
  };
  const R = st.map(([z, w, h, d]) => ring(z, w, h, d));
  const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let k = 0; k < R.length - 1; k++) {
    const A = R[k],
      B = R[k + 1];
    for (let i = 0; i < A.length - 1; i++) quad(A[i], A[i + 1], B[i + 1], B[i]);
  }
  // 船尾的封板
  const S = R[0];
  for (let i = 1; i < S.length - 1; i++) pos.push(...S[0], ...S[i + 1], ...S[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// 甲板：照船殼的寬度的平面（略低於舷緣）
function deck(st, inset = 0.15) {
  const pos = [];
  for (let k = 0; k < st.length - 1; k++) {
    const [z0, w0, h0] = st[k],
      [z1, w1, h1] = st[k + 1];
    const a = [-w0 + inset, h0 - 0.1, z0],
      b = [w0 - inset, h0 - 0.1, z0],
      c = [Math.max(0, w1 - inset), h1 - 0.1, z1],
      d = [-Math.max(0, w1 - inset), h1 - 0.1, z1];
    pos.push(...a, ...c, ...b, ...a, ...d, ...c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- 巡邏小艇（長 12 m）：灰色船殼、駕駛艙、雷達桅杆、船頭的機槍、救生圈、碰墊 ----------
export function buildPatrolBoat() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group();
  const grey = M(0x6a7076, { roughness: 0.6, metalness: 0.35 }),
    red = M(0x8a2a22, { roughness: 0.7 });
  const st = [
    [-6, 1.6, 1.1, 0.7],
    [-3, 1.75, 1.1, 0.85],
    [1, 1.7, 1.15, 0.85],
    [3.5, 1.3, 1.25, 0.75],
    [5.3, 0.6, 1.35, 0.5],
    [6.1, 0.02, 1.45, 0.2],
  ];
  P(g, hull(st), grey);
  P(g, deck(st), T.dark);
  // 吃水線下的紅色防污漆（略大一圈的船殼，只露出水線下）
  P(g, hull(st.map(([z, w, h, d]) => [z, w + 0.02, -0.05, d + 0.02])), red);
  // 駕駛艙：艙體、窗、頂上的雷達桅杆與天線
  K.bx(g, grey, 2.6, 1.6, 3.0, 0, 1.95, -0.6, 0, 0, 0, 0.08);
  K.bx(g, T.glass, 2.5, 0.55, 0.04, 0, 2.35, 0.92, -0.25, 0, 0, 0.01);
  for (const s of [-1, 1]) K.bx(g, T.glass, 0.04, 0.5, 2.2, s * 1.31, 2.35, -0.6, 0, 0, 0, 0.01);
  K.rod(g, T.dark, [0, 2.75, -1.2], [0, 4.6, -1.4], 0.06);
  K.bx(g, T.dark, 1.4, 0.08, 0.25, 0, 4.2, -1.35, 0, 0, 0, 0.02);
  K.cy(g, T.white, 0.25, 0.2, 0, 4.7, -1.45, 14);
  fine(() => {
    K.cy(g, T.dark, 0.01, 1.2, 0.6, 3.4, -1.6, 6);
    K.cy(g, T.amber, 0.06, 0.08, 0, 4.85, -1.45, 10);
    for (const s of [-1, 1])
      vLight(
        g,
        WM,
        s < 0 ? T.lightR : M(0x30ff60, { emissive: 0x20ff40, emissiveIntensity: 1.2 }),
        s * 1.32,
        2.8,
        0.6,
        0.06,
        s * HP,
        false,
      );
  });
  // 船頭的機槍（底座＋槍管＋護盾）、船尾的舷外機兩具
  K.cy(g, T.dark, 0.25, 0.5, 0, 1.6, 3.6, 14);
  K.cz(g, T.dark, 0.05, 1.3, 0, 1.95, 4.2, 10);
  K.bx(g, T.dark, 0.8, 0.5, 0.05, 0, 2.0, 3.85, 0, 0, 0, 0.01);
  for (const s of [-1, 1]) {
    K.bx(g, T.dark, 0.5, 1.0, 0.6, s * 0.6, 0.9, -6.25, 0, 0, 0, 0.08);
    K.bx(g, T.dark, 0.18, 0.9, 0.3, s * 0.6, 0.1, -6.25, 0, 0, 0, 0.03);
  }
  // 舷緣的欄杆、救生圈、碰墊、繫纜樁
  K.railing(
    g,
    T.metal,
    [
      [-1.55, -5.8],
      [-1.55, 1.5],
      [-1.0, 4.0],
      [0, 5.6],
      [1.0, 4.0],
      [1.55, 1.5],
      [1.55, -5.8],
    ],
    1.15,
    0.5,
    0.02,
  );
  for (const s of [-1, 1]) {
    K.lathe(
      g,
      T.orange,
      [
        [0.22, -0.05],
        [0.28, 0],
        [0.22, 0.05],
        [0.16, 0],
      ],
      s * 1.4,
      2.0,
      -2.0,
      'y',
      14,
      0,
      0,
      s * HP,
    );
    for (const z of [-4, -1.5, 1]) K.cy(g, T.dark, 0.12, 0.5, s * 1.78, 0.75, z, 10);
  }
  fine(() => {
    for (const [x, z] of [
      [-1.2, -5.5],
      [1.2, -5.5],
      [0, 5.2],
    ])
      K.cy(g, T.metal, 0.08, 0.25, x, 1.25, z, 10);
    K.boltRow(g, T.dark, -1.0, 1.0, 1.3, 0.92, 6, 0.025, 1);
  });
  bakeAll(g, { tint: TINT, cache: 'cineveh:patrolboat' });
  return { group: g, wheels: [], parts: {}, len: 12.2 };
}

// ---------- 貨輪（近海、長 60 m）：深色船殼＋紅色船底、甲板上一排貨櫃、船尾的上層建築（艦橋、煙囪）、兩支吊桿 ----------
export function buildCargoShip() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group();
  const hullM = M(0x2a3a52, { roughness: 0.7, metalness: 0.3 }),
    red = M(0x8a2a22, { roughness: 0.75 }),
    house = M(0xb4b8bb, { roughness: 0.75, metalness: 0.08 });
  const st = [
    [-30, 6.5, 4.5, 3.5],
    [-20, 7.2, 4.5, 4.2],
    [15, 7.2, 4.5, 4.2],
    [24, 5.6, 5.0, 3.6],
    [29, 2.4, 5.6, 2.4],
    [31, 0.05, 6.0, 1.0],
  ];
  P(g, hull(st, 12), hullM);
  P(
    g,
    hull(
      st.map(([z, w, h, d]) => [z, w + 0.05, -0.2, d + 0.05]),
      12,
    ),
    red,
  );
  P(g, deck(st, 0.3), T.dark);
  // 吃水標記與船名的字塊（船頭兩側）
  fine(() => {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++)
        K.bx(g, T.white, 0.02, 0.12, 0.25, s * 5.7, -1.2 + i * 0.6, 26.5, 0, 0, 0, 0);
      for (let i = 0; i < 8; i++) K.bx(g, T.white, 0.02, 0.6, 0.45, s * 7.22, 3.4, 8 - i * 0.6, 0, 0, 0, 0);
    }
  });
  // 貨櫃：3 列 × 2 層 × 7 排（顏色輪替）
  const cc = [0x8a2a22, 0x2a5a8a, 0x3a6a3a, 0xc88a2a, 0x6a6a6a].map((c) =>
    M(c, { roughness: 0.7, metalness: 0.3 }),
  );
  let k = 0;
  for (let r = 0; r < 7; r++)
    for (const x of [-2.5, 0, 2.5])
      for (let y = 0; y < 2; y++) {
        k = (k * 7 + 3) % 11;
        if (y === 1 && k % 4 === 0) continue;
        const z = 14 - r * 6.3;
        K.bx(g, cc[k % 5], 2.44, 2.59, 6.06, x, 4.5 + 1.3 + y * 2.59, z, 0, 0, 0, 0.04);
        fine(() => {
          for (let i = 0; i < 8; i++)
            K.bx(g, T.dark, 2.46, 2.4, 0.04, x, 4.5 + 1.3 + y * 2.59, z - 2.6 + i * 0.74, 0, 0, 0, 0);
        });
      }
  // 吊桿兩支（立柱＋斜臂＋鋼索）
  for (const z of [6, -16]) {
    K.cy(g, house, 0.45, 9, -4.8, 9.0, z, 14);
    K.rod(g, house, [-4.8, 6.0, z], [1.5, 13.5, z + 2], 0.3);
    K.cable(g, T.steel, [-4.8, 13.4, z], [1.5, 13.5, z + 2], 0.03, 0.2);
    K.rod(g, T.steel, [1.5, 13.5, z + 2], [1.5, 9.5, z + 2], 0.025);
  }
  // 上層建築（船尾）：4 層、艦橋的窗、兩側的翼橋、煙囪、雷達桅杆、救生艇
  for (let lv = 0; lv < 4; lv++) {
    const w = 12 - lv * 0.6,
      d = 8 - lv * 0.4;
    K.bx(g, house, w, 2.8, d, 0, 4.5 + 1.4 + lv * 2.8, -24, 0, 0, 0, 0.06);
    fine(() => {
      for (let i = 0; i < 8; i++)
        K.bx(
          g,
          T.glass,
          0.8,
          0.9,
          0.04,
          -w / 2 + 1 + i * ((w - 2) / 7),
          4.5 + 1.6 + lv * 2.8,
          -24 + d / 2 + 0.02,
          0,
          0,
          0,
          0.01,
        );
    });
  }
  K.bx(g, T.glass, 11, 1.2, 0.05, 0, 16.0, -20.3, -0.15, 0, 0, 0.01);
  for (const s of [-1, 1]) K.bx(g, house, 2.5, 0.25, 2.5, s * 7.2, 15.3, -21.5, 0, 0, 0, 0.04);
  K.lathe(
    g,
    red,
    [
      [1.6, 0],
      [1.4, 4.0],
      [0, 4.0],
    ],
    0,
    17.6,
    -27,
    'y',
    16,
  );
  K.lathe(
    g,
    T.dark,
    [
      [1.42, 0],
      [1.42, 0.6],
      [0, 0.6],
    ],
    0,
    21.6,
    -27,
    'y',
    16,
  );
  K.rod(g, T.dark, [0, 16.5, -23], [0, 22.0, -23], 0.12);
  K.bx(g, T.dark, 3.5, 0.15, 0.4, 0, 21.0, -23, 0, 0, 0, 0.02);
  for (const s of [-1, 1]) {
    K.bx(g, T.orange, 1.8, 1.2, 5.5, s * 6.7, 9.5, -24, 0, 0, 0, 0.3);
    K.rod(g, T.metal, [s * 6.0, 8.0, -26], [s * 7.2, 11.2, -26], 0.06);
    K.rod(g, T.metal, [s * 6.0, 8.0, -22], [s * 7.2, 11.2, -22], 0.06);
  }
  // 舷緣欄杆、船頭的錨與絞盤、桅燈
  for (const s of [-1, 1]) K.rod(g, T.metal, [s * 7.0, 5.4, -29], [s * 7.0, 5.4, 22], 0.04);
  for (const s of [-1, 1]) {
    K.bx(g, T.dark, 0.9, 0.6, 1.0, s * 3.0, 5.0, 27, 0, 0, 0, 0.06);
    K.lathe(
      g,
      T.dark,
      [
        [0.5, 0],
        [0.5, 0.3],
        [0, 0.3],
      ],
      s * 3.0,
      6.0 - 0.6,
      28,
      'z',
      14,
    );
  }
  vLight(g, WM, T.lamp, 0, 9.0, 29.5, 0.2, Math.PI, false);
  bakeAll(g, { tint: TINT, cache: 'cineveh:cargoship' });
  return { group: g, wheels: [], parts: {}, len: 61 };
}

// ---------- 登陸艇（長 22 m）：平底、兩側的高舷牆、船尾的駕駛室、艏門 parts.ramp（繞底邊往前放下） ----------
export function buildLander() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group();
  const body = M(0x4a5560, { roughness: 0.65, metalness: 0.35 });
  P(g, D.box(7.0, 1.2, 20, 0.15), body, 0, -0.2, -0.5); // 平底的船殼
  P(g, D.box(6.4, 0.1, 15, 0.02), T.dark, 0, 0.45, 1.5); // 貨艙的甲板
  for (const s of [-1, 1]) {
    K.bx(g, body, 0.3, 2.4, 20, s * 3.35, 1.6, -0.5, 0, 0, 0, 0.05);
    fine(() => {
      for (let i = 0; i < 12; i++)
        K.bx(g, T.dark, 0.08, 2.2, 0.15, s * 3.18, 1.6, -9 + i * 1.6, 0, 0, 0, 0.01);
    });
    K.railing(
      g,
      T.metal,
      [
        [s * 3.35, -10],
        [s * 3.35, 9],
      ],
      2.8,
      0.4,
      0.02,
    );
    for (let i = 0; i < 4; i++)
      K.cy(g, T.tire, 0.25, 0.5, s * 3.55, 0.8, -7 + i * 4.5, 12, 0, 0.25, 0, 0, HP);
  }
  // 船尾：駕駛室兩層、雷達、煙囪
  K.bx(g, body, 6.6, 2.6, 3.6, 0, 1.6, -8.7, 0, 0, 0, 0.08);
  K.bx(g, body, 3.6, 2.0, 2.6, 0, 3.9, -8.9, 0, 0, 0, 0.06);
  K.bx(g, T.glass, 3.4, 0.6, 0.04, 0, 4.3, -7.58, -0.2, 0, 0, 0.01);
  K.rod(g, T.dark, [0, 4.9, -9.2], [0, 6.6, -9.4], 0.06);
  K.bx(g, T.dark, 1.6, 0.1, 0.3, 0, 6.3, -9.4, 0, 0, 0, 0.02);
  for (const s of [-1, 1]) K.cy(g, T.dark, 0.3, 1.6, s * 2.3, 3.6, -9.8, 12);
  // 艏門：繞前端的底邊轉（rotation.x 正＝往前放下）
  const ramp = new THREE.Group();
  ramp.position.set(0, 0.4, 9.5);
  g.add(ramp);
  K.bx(ramp, body, 6.2, 2.9, 0.25, 0, 1.45, 0, 0, 0, 0, 0.05);
  fine(() => {
    for (let i = 0; i < 8; i++) K.bx(ramp, T.dark, 5.9, 0.06, 0.06, 0, 0.3 + i * 0.32, -0.14, 0, 0, 0, 0.01);
  });
  for (const s of [-1, 1]) {
    K.cable(g, T.steel, [s * 3.0, 2.9, 7.5], [s * 2.9, 2.85, 9.4], 0.03, 0.1);
    K.cx(g, T.steel, 0.12, 0.3, s * 3.0, 0.4, 9.5, 12);
  }
  K.hazard(ramp, T.yellow, T.dark, 6.0, 0.2, 0.02, 0, 2.85, 0.14, 0, 14);
  vLight(g, WM, T.lamp, 0, 4.5, -7.5, 0.12, Math.PI, true);
  bakeAll(g, { tint: TINT, cache: 'cineveh:lander' });
  return { group: g, wheels: [], parts: { ramp }, len: 22 };
}

// ---------- 穿梭機（長 24 m）：機身（剖面旋轉）、三角翼、垂直尾翼、駕駛艙的窗、背上的貨艙門 parts.bay、主引擎三具、RCS ----------
export function buildShuttle() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group();
  const white = M(0xb4b8bb, { roughness: 0.75, metalness: 0.08 }),
    tile = M(0x2a2c30, { roughness: 0.85, metalness: 0.05 });
  // 機身：沿 Z 的剖面旋轉（機頭圓、機尾平）
  K.lathe(
    g,
    white,
    [
      [0, -12],
      [2.4, -11.6],
      [2.6, -6],
      [2.6, 6],
      [2.3, 9.5],
      [1.5, 11.3],
      [0, 12.2],
    ],
    0,
    3.0,
    0,
    'z',
    24,
  );
  // 機腹的隔熱瓦（貼在下方的黑色板）
  K.bx(g, tile, 3.6, 0.2, 19, 0, 0.62, -1.0, 0, 0, 0, 0.08);
  // 三角翼與翼前緣（黑）、升降副翼
  for (const s of [-1, 1]) {
    P(
      g,
      D.extrude(
        [
          [0, -10.5],
          [s * 8.5, -10.5],
          [s * 8.8, -8.5],
          [s * 2.4, 4.0],
          [0, 6.0],
        ],
        0.35,
        0.08,
      ),
      white,
      0,
      2.0,
      0,
      HP,
      0,
      0,
    ); // 兩側都只繞 X 轉（形狀的 y→z）；另一側用 x 乘 s，不要再繞 Z 轉 180°（會把翼尖翻到前面）
    K.rod(g, tile, [s * 2.4, 2.0, 4.0], [s * 8.8, 2.0, -8.5], 0.2);
    K.bx(g, T.dark, 3.5, 0.3, 1.0, s * 5.5, 2.0, -11.0, 0, 0, 0, 0.04);
  }
  // 垂直尾翼＋方向舵
  P(
    g,
    D.extrude(
      [
        [0, 0],
        [3.2, 0],
        [5.5, 6.5],
        [3.8, 6.8],
      ],
      0.35,
      0.06,
    ),
    white,
    0,
    5.2,
    -11.0,
    0,
    HP,
    0,
  );
  // 駕駛艙的窗（六片）
  for (let i = 0; i < 6; i++) {
    const a = -0.9 + i * 0.36;
    K.bx(g, T.glass, 0.55, 0.32, 0.04, Math.sin(a) * 1.7, 4.65, 9.6 - Math.abs(a) * 0.3, -0.7, a, 0, 0.01);
  }
  // 貨艙門（背上兩片，parts.bay：x 轉＝打開）
  const bay = new THREE.Group();
  bay.position.set(0, 5.45, -1.5);
  g.add(bay);
  for (const s of [-1, 1]) {
    K.bx(bay, white, 1.9, 0.12, 12, s * 1.0, 0.0, 0, 0, 0, s * -0.25, 0.03);
    fine(() => {
      for (let i = 0; i < 6; i++)
        K.bx(bay, T.dark, 1.8, 0.02, 0.03, s * 1.0, 0.07, -5.5 + i * 2.2, 0, 0, s * -0.25, 0);
    });
  }
  // 主引擎三具（噴嘴）、OMS 莢艙、RCS 噴嘴
  for (const [x, y] of [
    [0, 4.2],
    [-1.2, 2.4],
    [1.2, 2.4],
  ])
    K.lathe(
      g,
      T.dark,
      [
        [0.35, 0],
        [0.55, -0.4],
        [0.95, -1.4],
        [0.85, -1.4],
        [0.45, -0.4],
        [0.3, 0],
      ],
      x,
      y,
      -12.0,
      'z',
      18,
    );
  for (const s of [-1, 1])
    K.lathe(
      g,
      white,
      [
        [0, -2],
        [0.9, -1.6],
        [0.9, 2.5],
        [0, 3.2],
      ],
      s * 1.6,
      4.6,
      -10.0,
      'z',
      14,
    );
  fine(() => {
    for (const s of [-1, 1])
      for (let i = 0; i < 4; i++)
        K.cy(g, T.dark, 0.08, 0.1, s * (1.1 + i * 0.22), 4.2, 10.3, 8, 0, 0.08, 0, 0, HP);
    for (let i = 0; i < 6; i++)
      K.bx(
        g,
        T.dark,
        0.25,
        0.25,
        0.04,
        0.6 - (i % 3) * 0.6,
        3.0 + Math.floor(i / 3) * 0.6,
        -12.05,
        0,
        0,
        0,
        0.01,
      );
    for (let i = 0; i < 10; i++)
      K.bx(g, M(0x203a6a, { roughness: 0.6 }), 0.02, 0.3, 0.6, 2.62, 3.2, 3 - i * 0.65, 0, 0, 0, 0);
  });
  // 起落架（收起：只有艙門的縫）
  fine(() => {
    for (const [x, z] of [
      [0, 8],
      [-2.5, -3],
      [2.5, -3],
    ])
      K.bx(g, T.dark, 1.0, 0.02, 2.0, x, 0.62, z, 0, 0, 0, 0);
  });
  bakeAll(g, { tint: TINT, cache: 'cineveh:shuttle' });
  return { group: g, wheels: [], parts: { bay }, len: 24.5 };
}

// ---------- 太空作業艇（直徑 3 m 的作業球）：球形艙＋大片的窗、左右的機械臂 parts.armL／armR、RCS、燈、推進器的支架 ----------
export function buildWorkPod() {
  const T = mats(),
    WM = wheelM(T),
    g = new THREE.Group();
  const shell = M(0xc8901a, { roughness: 0.72, metalness: 0.12 });
  K.lathe(
    g,
    shell,
    [
      [0, -1.5],
      [1.0, -1.15],
      [1.5, -0.2],
      [1.45, 0.5],
      [1.0, 1.15],
      [0, 1.45],
    ],
    0,
    1.5,
    0,
    'y',
    24,
  );
  K.lathe(
    g,
    T.glass,
    [
      [0, -0.6],
      [0.7, -0.45],
      [0.95, 0],
      [0.7, 0.45],
      [0, 0.6],
    ],
    0,
    1.65,
    1.15,
    'z',
    18,
  );
  K.lathe(
    g,
    T.dark,
    [
      [0.95, -0.08],
      [1.02, 0],
      [0.95, 0.08],
    ],
    0,
    1.65,
    1.15,
    'z',
    18,
  );
  K.bx(g, T.dark, 2.2, 0.35, 2.2, 0, 0.2, 0, 0, 0, 0, 0.06); // 底下的推進器框
  for (const [x, z] of [
    [-0.9, -0.9],
    [0.9, -0.9],
    [-0.9, 0.9],
    [0.9, 0.9],
  ])
    K.lathe(
      g,
      T.dark,
      [
        [0.1, 0],
        [0.2, -0.25],
        [0.18, -0.25],
        [0.08, 0],
      ],
      x,
      0.05,
      z,
      'y',
      10,
    );
  // 機械臂：肩（繞 X 轉）→ 前臂 → 夾爪
  const arms = {};
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 1.25, 1.2, 0.7);
    a.rotation.x = -0.4;
    g.add(a);
    K.cy(a, T.dark, 0.18, 0.3, 0, 0, 0, 14, 0.02, 0.18, 0, 0, HP);
    K.rod(a, shell, [0, 0, 0], [0, -0.2, 1.4], 0.11);
    K.rod(a, shell, [0, -0.2, 1.4], [0, 0.25, 2.4], 0.09);
    K.cy(a, T.dark, 0.12, 0.25, 0, -0.2, 1.4, 12, 0.02, 0.12, 0, 0, HP);
    for (const d of [-1, 1]) K.rod(a, T.steel, [0, 0.25, 2.4], [d * 0.12, 0.3, 2.75], 0.035);
    K.piston(a, T.steel, T.metal, [0, -0.15, 0.2], [0, -0.25, 1.1], 0.04);
    arms[s < 0 ? 'armL' : 'armR'] = a;
  }
  // 燈、天線、RCS、標示
  for (const s of [-1, 1]) vLight(g, WM, T.lamp, s * 0.7, 2.5, 0.9, 0.1, Math.PI, true);
  K.cy(g, T.dark, 0.012, 0.9, 0.4, 3.3, -0.3, 6);
  fine(() => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      K.bx(g, T.dark, 0.12, 0.12, 0.12, Math.cos(a) * 1.42, 2.2, Math.sin(a) * 1.42, 0, -a, 0, 0.02);
    }
    K.hazard(g, T.yellow, T.dark, 2.2, 0.1, 0.02, 0, 0.42, 1.11, 0, 10);
  });
  bakeAll(g, { tint: TINT, cache: 'cineveh:workpod' });
  return { group: g, wheels: [], parts: arms, len: 3 };
}

// ---------- 貨物吊艙（太空用的貨櫃：八角筒、兩端的對接環、吊掛點、標示） ----------
export function buildCargoPod(v = 0) {
  const T = mats(),
    g = new THREE.Group();
  const body = M([0xb4b8bb, 0xc8902a, 0x6a7a8a][v % 3], { roughness: 0.6, metalness: 0.3 });
  K.cz(g, body, 1.4, 6.0, 0, 1.5, 0, 8, 0.08);
  for (const z of [-3.05, 3.05]) {
    K.cz(g, T.dark, 1.1, 0.25, 0, 1.5, z, 18);
  }
  for (let i = 0; i < 4; i++) K.cz(g, T.dark, 1.43, 0.12, 0, 1.5, -2.2 + i * 1.45, 8);
  for (const z of [-2.4, 2.4])
    K.lathe(
      g,
      T.steel,
      [
        [0.08, -0.04],
        [0.16, 0],
        [0.08, 0.04],
      ],
      0,
      2.95,
      z,
      'y',
      12,
    );
  fine(() => {
    K.hazard(g, T.yellow, T.dark, 2.0, 0.18, 0.02, 0, 1.5, 1.35, 0, 8);
    for (let i = 0; i < 6; i++) K.bx(g, T.dark, 0.02, 0.3, 0.22, 1.3, 1.9, -1.5 + i * 0.3, 0, 0, 0, 0);
  });
  bakeAll(g, { tint: TINT, cache: 'cineveh:cargopod' + (v % 3) });
  return { group: g, wheels: [], parts: {}, len: 6.3 };
}
