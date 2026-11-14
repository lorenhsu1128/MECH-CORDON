// 過場的室內：聖域互助同盟在冰原邊緣的救援站（諾拉的據點；3D 動畫化，docs/cine-redesign-design.md 第十節）。
// 半圓拱的組合式帳篷（拱肋、保溫帆布、天窗帶），棧板木地板與橡膠墊；−Z 是入口（門外是風雪的夜，門口積雪、掛著外套與靴子），
// 中央是長摺疊桌（急救箱、保溫瓶、杯子、無線電、地圖、登記簿），兩側是上下舖的行軍床與補給箱，煤油暖爐＋煙囪，串燈與提燈，
// 醫療區（點滴架、擔架、布簾），牆上釘著孩子的畫與名單白板。原點＝地板中央，公尺。發光只用材質（不加點光源）。
import { SceneKit, canvasTex, noiseFill, rng } from './cine-kit.js';

const W = 9, // 寬（X）：拱的直徑
  L = 14, // 長（Z）
  RA = W / 2; // 拱的半徑（高 4.5 m）

// ---------- 貼圖 ----------
const canvasCloth = () =>
  canvasTex(
    256,
    256,
    (c, w, h) => {
      c.fillStyle = '#9a9a86';
      c.fillRect(0, 0, w, h);
      // 縫線（保溫板的格子）
      c.strokeStyle = 'rgba(60,60,50,0.45)';
      c.lineWidth = 2;
      for (let y = 0; y < h; y += 64) c.strokeRect(-2, y, w + 4, 64);
      noiseFill(c, w, h, 3, 900, '#5a5a4a', 0.04, 0.12, 1, 3);
      noiseFill(c, w, h, 4, 300, '#c8c8b0', 0.04, 0.1, 1, 2);
    },
    [6, 2],
  );
const plankTex = () =>
  canvasTex(
    512,
    512,
    (c, w, h) => {
      const R = rng(9);
      for (let i = 0; i < 10; i++) {
        const v = 110 + R() * 40;
        c.fillStyle = `rgb(${v},${v * 0.78},${v * 0.55})`;
        c.fillRect(0, (i * h) / 10, w, h / 10);
        c.fillStyle = 'rgba(30,20,10,0.6)';
        c.fillRect(0, (i * h) / 10, w, 3);
        for (let k = 0; k < 2; k++) c.fillRect(R() * w, (i * h) / 10, 3, h / 10);
        // 釘子
        c.fillStyle = 'rgba(40,40,40,0.8)';
        c.fillRect(20, (i * h) / 10 + 8, 4, 4);
        c.fillRect(w - 24, (i * h) / 10 + 8, 4, 4);
      }
      noiseFill(c, w, h, 10, 2500, '#3a2a18', 0.05, 0.18, 1, 4);
    },
    [3, 5],
  );
const matTex = () =>
  canvasTex(
    128,
    128,
    (c, w, h) => {
      c.fillStyle = '#2a2c2e';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(80,84,88,0.6)';
      for (let i = -h; i < w; i += 10) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i + h, h);
        c.stroke();
      }
    },
    [4, 8],
  );
// 補給箱的面：綠色的漆、白色的聖域標誌（交握的手＋圓）、模板噴字
const crateTex = (seed) =>
  canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = seed % 2 ? '#4a5a3a' : '#5a6248';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(20,24,16,0.6)';
    c.lineWidth = 6;
    c.strokeRect(6, 6, w - 12, h - 12);
    c.strokeStyle = '#e8e4d8';
    c.lineWidth = 8;
    c.beginPath();
    c.arc(w / 2, h * 0.42, 46, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#e8e4d8';
    c.fillRect(w / 2 - 34, h * 0.42 - 6, 68, 12);
    c.font = 'bold 26px monospace';
    c.textAlign = 'center';
    c.fillText(['SANCTA AID', 'WATER 20L', 'MEDICAL', 'RATIONS'][seed % 4], w / 2, h * 0.82);
    noiseFill(c, w, h, seed, 400, '#2a2a1a', 0.05, 0.2, 1, 5);
  });
// 毯子（格紋）
const blanketTex = (col) =>
  canvasTex(128, 128, (c, w, h) => {
    c.fillStyle = col;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < w; i += 32) c.fillRect(i, 0, 10, h);
    c.fillStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < h; i += 32) c.fillRect(0, i, w, 10);
  });
// 地圖（等高線＋路線＋紅圈）
const mapTex = () =>
  canvasTex(256, 192, (c, w, h) => {
    c.fillStyle = '#e8e0c8';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(80,110,140,0.6)';
    for (let k = 0; k < 9; k++) {
      c.beginPath();
      for (let a = 0; a <= 40; a++) {
        const t = (a / 40) * Math.PI * 2,
          r = 12 + k * 10 + Math.sin(t * 3 + k) * 5;
        const x = w * 0.45 + Math.cos(t) * r * 1.4,
          y = h * 0.5 + Math.sin(t) * r;
        if (a) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
    }
    c.strokeStyle = '#c03020';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(w * 0.72, h * 0.3, 14, 0, Math.PI * 2);
    c.stroke();
    c.setLineDash([5, 4]);
    c.beginPath();
    c.moveTo(10, h - 10);
    c.lineTo(w * 0.72, h * 0.3);
    c.stroke();
  });
// 名單白板（手寫的名字＋打勾）
const boardTex = () =>
  canvasTex(512, 320, (c, w, h) => {
    c.fillStyle = '#f2f2ee';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#20406a';
    c.font = 'bold 28px sans-serif';
    c.fillText('CAMP 3 — ROSTER', 16, 36);
    c.font = '18px sans-serif';
    const R = rng(77);
    for (let i = 0; i < 22; i++) {
      const x = 16 + Math.floor(i / 11) * 250,
        y = 70 + (i % 11) * 22;
      c.fillStyle = '#2a2a2a';
      c.fillRect(x + 22, y - 6, 80 + R() * 90, 3);
      c.strokeStyle = R() < 0.7 ? '#2a8a3a' : '#c03020';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(x, y - 6);
      c.lineTo(x + 6, y);
      c.lineTo(x + 14, y - 12);
      c.stroke();
    }
  });
// 孩子的畫（太陽、房子、人）
const drawingTex = (seed) =>
  canvasTex(128, 96, (c, w, h) => {
    c.fillStyle = '#fbf8ee';
    c.fillRect(0, 0, w, h);
    const R = rng(seed);
    c.lineWidth = 3;
    c.strokeStyle = '#f0a020';
    c.beginPath();
    c.arc(100, 20, 12, 0, Math.PI * 2);
    c.stroke();
    c.strokeStyle = ['#3060c0', '#c03050', '#30a050'][seed % 3];
    c.strokeRect(20 + R() * 10, 45, 40, 35);
    c.beginPath();
    c.moveTo(18, 45);
    c.lineTo(40, 25);
    c.lineTo(62, 45);
    c.stroke();
    for (let i = 0; i < 3; i++) {
      const x = 70 + i * 14;
      c.beginPath();
      c.arc(x, 60, 4, 0, Math.PI * 2);
      c.moveTo(x, 64);
      c.lineTo(x, 80);
      c.stroke();
    }
  });
// 門外：風雪的夜（藍色的漸層＋雪點）
const stormTex = () =>
  canvasTex(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a1424');
    g.addColorStop(1, '#2a3a52');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    noiseFill(c, w, h, 12, 700, '#dfe8f4', 0.3, 0.9, 1, 3);
  });

export function buildSanctaStation() {
  const B = new SceneKit('sanctaStation');
  const M = {
    cloth: B.mat(0xffffff, 0.92, 0, { map: canvasCloth() }),
    rib: B.mat(0x6c7278, 0.45, 0.7),
    plank: B.mat(0xffffff, 0.8, 0, { map: plankTex() }),
    rubber: B.mat(0xffffff, 0.9, 0, { map: matTex() }),
    steel: B.mat(0x8a9096, 0.4, 0.75),
    dark: B.mat(0x2a2e32, 0.6, 0.4),
    olive: B.mat(0x4a5440, 0.7, 0.2),
    tableTop: B.mat(0xb8b4a8, 0.6, 0.05),
    wood: B.mat(0x8a6040, 0.7, 0),
    red: B.mat(0xb02a22, 0.5, 0.1),
    white: B.mat(0xe8e6e0, 0.6, 0),
    orange: B.mat(0xd06a20, 0.6, 0.1),
    blue: B.mat(0x2a5a9a, 0.6, 0.1),
    canvas2: B.mat(0x6a5a40, 0.9, 0),
    jerry: B.mat(0x3a5a3a, 0.5, 0.3),
    sack: B.mat(0xb8a880, 0.95, 0),
    rope: B.mat(0x8a7a5a, 0.95, 0),
    snow: B.mat(0xe8eef6, 0.9, 0),
    map: B.mat(0xffffff, 0.85, 0, { map: mapTex() }),
    board: B.mat(0xffffff, 0.5, 0, { map: boardTex() }),
    storm: new THREE.MeshBasicMaterial({ map: stormTex() }),
    bulb: B.glow(0xffd8a0, 2.2),
    flame: B.glow(0xff8a30, 2.4),
    radioG: B.glow(0x7fff9a, 1.6),
    crate: [0, 1, 2, 3].map((k) => B.mat(0xffffff, 0.75, 0.1, { map: crateTex(k) })),
    blanket: ['#7a2a24', '#2a4a6a', '#5a5a3a', '#6a4a2a'].map((c) =>
      B.mat(0xffffff, 0.95, 0, { map: blanketTex(c) }),
    ),
    drawing: [0, 1, 2, 3, 4].map((k) => B.mat(0xffffff, 0.9, 0, { map: drawingTex(k) })),
  };
  const R = rng(31);

  // ===== 帳篷的殼：半圓拱（帆布）、兩端的牆、地板 =====
  // 圓柱的軸轉到 Z（rx 90°）：θ 從 90° 到 270° 的那一半（z ≤ 0）轉過去是上半圓
  const arch = new THREE.CylinderGeometry(RA, RA, L, 40, 1, true, Math.PI / 2, Math.PI);
  B.mesh(arch, M.cloth, [0, 0, 0], [Math.PI / 2, 0, 0], 1, B.shell).material.side = THREE.DoubleSide;
  // 地板：棧板木地板＋中央的橡膠墊
  B.box(W, 0.12, L, M.plank, [0, -0.06, 0], null, 0.01, B.shell);
  B.box(2.2, 0.02, L - 2, M.rubber, [0, 0.01, 0], null, 0.005, B.shell);
  // +Z 的端牆（帆布）
  const endWall = new THREE.CircleGeometry(RA, 40, 0, Math.PI);
  B.mesh(endWall, M.cloth, [0, 0, L / 2], [0, Math.PI, 0], 1, B.shell).material.side = THREE.DoubleSide;
  // −Z 的端牆：中間是門口（左右兩片＋上方的拱）
  for (const sx of [-1, 1]) {
    const g = new THREE.Shape();
    g.moveTo(sx * 0.9, 0);
    for (let a = 0; a <= 20; a++) {
      const t = (a / 20) * (Math.PI / 2);
      g.lineTo(sx * Math.cos(t) * RA, Math.sin(t) * RA);
    }
    g.lineTo(sx * 0.9, RA);
    g.lineTo(sx * 0.9, 0);
    const m = B.mesh(new THREE.ShapeGeometry(g), M.cloth, [0, 0, -L / 2], [0, 0, 0], 1, B.shell);
    m.material.side = THREE.DoubleSide;
  }
  B.box(1.8, RA - 2.3, 0.04, M.cloth, [0, 2.3 + (RA - 2.3) / 2, -L / 2], null, 0.005, B.shell);
  // 門外的風雪（一張發光的板，門口亮著藍光）
  B.plane(2.2, 2.6, M.storm, [0, 1.25, -L / 2 - 1.2], null, B.dyn);
  // 拱肋（每 1.75 m 一道，管材）
  for (let i = 0; i <= 8; i++) {
    const z = -L / 2 + 0.2 + (i * (L - 0.4)) / 8;
    const tor = new THREE.TorusGeometry(RA - 0.06, 0.05, 8, 40, Math.PI);
    B.mesh(tor, M.rib, [0, 0, z], [0, 0, 0]);
    // 肋的底座
    for (const sx of [-1, 1]) B.box(0.2, 0.12, 0.2, M.dark, [sx * (RA - 0.08), 0.06, z], null, 0.02);
  }
  // 屋脊的縱樑與兩條側樑
  B.rod([0, RA - 0.1, -L / 2], [0, RA - 0.1, L / 2], 0.05, M.rib);
  for (const sx of [-1, 1]) {
    const y = Math.sin(Math.PI / 4) * (RA - 0.1),
      x = Math.cos(Math.PI / 4) * (RA - 0.1);
    B.rod([sx * x, y, -L / 2], [sx * x, y, L / 2], 0.035, M.rib);
  }
  // ===== 串燈（兩條沿著屋脊、燈泡發光）＋吊掛的提燈 =====
  for (const sx of [-1.1, 1.1]) {
    const y0 = Math.sqrt(RA * RA - sx * sx) - 0.25;
    for (let i = 0; i < 6; i++) {
      const z0 = -L / 2 + 1 + i * 2,
        z1 = z0 + 2;
      B.cable([sx, y0, z0], [sx, y0, z1], 0.008, 0.25, M.dark);
      for (let k = 0; k < 4; k++) {
        const t = (k + 0.5) / 4,
          z = z0 + (z1 - z0) * t,
          y = y0 - 0.25 * 4 * t * (1 - t);
        B.sph(0.035, M.bulb, [sx, y - 0.05, z], 1, B.dyn, 10);
      }
    }
  }
  const lantern = (x, y, z) =>
    B.group([x, y, z], null, (g) => {
      B.cyl(0.09, 0.11, 0.04, M.dark, [0, 0.02, 0], null, 16, 0, g);
      B.cyl(0.06, 0.06, 0.16, B.glow(0xffc070, 2), [0, 0.12, 0], null, 14, 0, g);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        B.rod(
          [Math.cos(a) * 0.08, 0.04, Math.sin(a) * 0.08],
          [Math.cos(a) * 0.08, 0.22, Math.sin(a) * 0.08],
          0.006,
          M.dark,
          g,
        );
      }
      B.cyl(0.1, 0.08, 0.04, M.dark, [0, 0.24, 0], null, 16, 0, g);
      B.mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 16), M.dark, [0, 0.3, 0], [Math.PI / 2, 0, 0], 1, g);
    });
  lantern(-0.9, 2.1, -1.0);
  B.rod([-0.9, 2.42, -1.0], [-0.9, 4.2, -1.0], 0.005, M.dark);
  lantern(1.2, 2.3, 3.2);
  B.rod([1.2, 2.62, 3.2], [1.2, 4.2, 3.2], 0.005, M.dark);

  // ===== 中央：長摺疊桌×2（急救箱、保溫瓶、杯子、無線電、地圖、登記簿）=====
  const table = (z, fn) =>
    B.group([0, 0, z], null, (g) => {
      B.box(2.4, 0.04, 0.8, M.tableTop, [0, 0.74, 0], null, 0.01, g);
      for (const sx of [-1, 1]) {
        B.rod([sx * 1.05, 0, -0.32], [sx * 1.05, 0.72, -0.32], 0.018, M.steel, g);
        B.rod([sx * 1.05, 0, 0.32], [sx * 1.05, 0.72, 0.32], 0.018, M.steel, g);
        B.rod([sx * 1.05, 0.15, -0.32], [sx * 1.05, 0.15, 0.32], 0.012, M.steel, g);
      }
      fn(g);
    });
  table(-1.6, (g) => {
    // 無線電：機身、旋鈕、天線、發光的頻率窗
    B.box(0.42, 0.22, 0.28, M.olive, [-0.7, 0.87, -0.15], null, 0.02, g);
    B.plane(0.16, 0.05, M.radioG, [-0.76, 0.92, -0.008], null, g);
    for (let i = 0; i < 3; i++)
      B.cyl(0.022, 0.022, 0.03, M.dark, [-0.58 + i * 0.07, 0.84, -0.005], [Math.PI / 2, 0, 0], 12, 0, g);
    B.rod([-0.55, 0.98, -0.25], [-0.45, 1.6, -0.3], 0.006, M.steel, g);
    B.box(0.12, 0.2, 0.07, M.dark, [-0.35, 0.86, 0.1], [0, 0.4, 0.3], 0.02, g); // 手持話筒
    B.cable([-0.5, 0.85, -0.05], [-0.36, 0.84, 0.08], 0.006, 0.05, M.dark, g);
    // 地圖（釘在桌上）＋登記簿
    B.plane(0.6, 0.45, M.map, [0.15, 0.765, 0.05], [-Math.PI / 2, 0, 0.1], g);
    B.box(0.32, 0.03, 0.24, M.blue, [0.75, 0.775, 0.1], [0, -0.3, 0], 0.005, g);
    B.box(0.3, 0.005, 0.22, M.white, [0.75, 0.792, 0.1], [0, -0.3, 0], 0.002, g);
    B.cyl(0.006, 0.006, 0.16, M.red, [0.72, 0.8, 0.22], [0, 0, Math.PI / 2], 6, 0, g); // 筆
    // 保溫瓶與杯子
    B.cyl(0.05, 0.05, 0.3, M.red, [0.45, 0.91, -0.25], null, 18, 0.01, g);
    B.cyl(0.045, 0.045, 0.05, M.dark, [0.45, 1.08, -0.25], null, 18, 0, g);
    for (let i = 0; i < 3; i++)
      B.cyl(0.04, 0.035, 0.09, M.white, [0.2 + i * 0.1, 0.81, -0.28 + (i % 2) * 0.08], null, 14, 0, g);
  });
  table(1.6, (g) => {
    // 急救箱、繃帶、藥瓶
    B.box(0.45, 0.2, 0.3, M.white, [-0.6, 0.86, -0.1], null, 0.03, g);
    B.box(0.12, 0.03, 0.04, M.red, [-0.6, 0.97, -0.1], null, 0.005, g);
    B.box(0.04, 0.03, 0.12, M.red, [-0.6, 0.97, -0.1], null, 0.005, g);
    for (let i = 0; i < 4; i++)
      B.cyl(0.035, 0.035, 0.06, M.white, [-0.1 + i * 0.09, 0.79, 0.15], [Math.PI / 2, 0, 0], 12, 0, g);
    for (let i = 0; i < 5; i++)
      B.cyl(
        0.02,
        0.02,
        0.08,
        M.orange,
        [0.4 + (i % 3) * 0.05, 0.8, -0.2 + Math.floor(i / 3) * 0.06],
        null,
        10,
        0,
        g,
      );
    // 一疊毯子
    for (let i = 0; i < 4; i++)
      B.box(0.6, 0.06, 0.4, M.blanket[i], [0.55, 0.79 + i * 0.065, 0.12], [0, i * 0.05, 0], 0.02, g);
  });
  // 長凳
  for (const z of [-2.25, -0.95, 0.95, 2.25])
    B.group([0, 0, z], null, (g) => {
      B.box(2.2, 0.04, 0.28, M.wood, [0, 0.45, 0], null, 0.01, g);
      for (const sx of [-1, 1]) B.box(0.05, 0.45, 0.24, M.steel, [sx * 0.95, 0.22, 0], null, 0.01, g);
    });

  // ===== 兩側：上下舖的行軍床（毯子、枕頭、睡袋）=====
  const bunk = (x, z, i) =>
    B.group([x, 0, z], null, (g) => {
      for (const y of [0.42, 1.35]) {
        B.box(0.8, 0.05, 1.9, M.canvas2, [0, y, 0], null, 0.02, g);
        B.rod([-0.38, y, -0.95], [-0.38, y, 0.95], 0.02, M.steel, g);
        B.rod([0.38, y, -0.95], [0.38, y, 0.95], 0.02, M.steel, g);
        // 毯子（有起伏）＋枕頭
        B.box(
          0.74,
          0.08,
          1.2,
          M.blanket[(i + (y > 1 ? 1 : 0)) % 4],
          [0, y + 0.07, 0.25],
          [0.02, 0, 0.03],
          0.04,
          g,
        );
        B.box(0.5, 0.1, 0.3, M.white, [0, y + 0.08, -0.72], [0, 0.1, 0], 0.05, g);
      }
      for (const sx of [-1, 1])
        for (const sz of [-1, 1])
          B.rod([sx * 0.38, 0, sz * 0.95], [sx * 0.38, 1.6, sz * 0.95], 0.022, M.steel, g);
    });
  for (let i = 0; i < 3; i++) {
    bunk(-3.3, -4 + i * 2.6, i);
    if (i !== 1) bunk(3.3, -4 + i * 2.6, i + 2);
  }
  // 地上的睡袋與行李
  for (let i = 0; i < 4; i++) {
    const m = B.cyl(
      0.18,
      0.18,
      0.7,
      M.blanket[i % 4],
      [-2.2 + (i % 2) * 0.4, 0.18, 4.6 + Math.floor(i / 2) * 0.5],
      [0, 0, Math.PI / 2],
      14,
      0.04,
    );
    m.rotation.y = R() * 0.6;
  }

  // ===== 補給箱、水桶、麻袋（+X 側、入口旁）=====
  const crate = (p, s, k, ry = 0) => {
    const g = B.group(p, [0, ry, 0], (gg) => {
      B.box(s[0], s[1], s[2], M.crate[k % 4], [0, s[1] / 2, 0], null, 0.02, gg);
      // 綁帶與角的護鐵
      B.box(s[0] + 0.01, 0.04, s[2] + 0.01, M.dark, [0, s[1] * 0.3, 0], null, 0.005, gg);
      B.box(s[0] + 0.01, 0.04, s[2] + 0.01, M.dark, [0, s[1] * 0.75, 0], null, 0.005, gg);
    });
    return g;
  };
  let k = 0;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3 - i; j++)
      crate([3.2, i * 0.5, 1.2 + j * 0.62 + i * 0.3], [0.7, 0.5, 0.6], k++, (R() - 0.5) * 0.15);
  crate([2.6, 0, -5.6], [0.8, 0.55, 0.6], k++, 0.2);
  crate([2.6, 0.55, -5.55], [0.6, 0.4, 0.5], k++, -0.1);
  // 水桶（jerrycan：機身＋把手＋蓋子）
  for (let i = 0; i < 5; i++)
    B.group([2.0 + (i % 3) * 0.32, 0, 4.4 + Math.floor(i / 3) * 0.4], [0, (R() - 0.5) * 0.3, 0], (g) => {
      B.box(0.18, 0.45, 0.32, M.jerry, [0, 0.225, 0], null, 0.03, g);
      B.box(0.05, 0.06, 0.2, M.jerry, [0, 0.5, 0], null, 0.01, g);
      B.cyl(0.03, 0.03, 0.05, M.dark, [0, 0.47, 0.12], null, 10, 0, g);
    });
  // 麻袋（壓扁的球）
  for (let i = 0; i < 6; i++)
    B.sph(
      0.28,
      M.sack,
      [3.4 - (i % 3) * 0.45, 0.18 + Math.floor(i / 3) * 0.3, -3.2],
      [1, 0.62, 0.8],
      undefined,
      14,
    );

  // ===== 煤油暖爐（中央走道的 +Z 端）＋煙囪＋水壺 =====
  B.group([1.7, 0, 4.4], null, (g) => {
    B.lathe(
      [
        [0.001, 0],
        [0.3, 0],
        [0.32, 0.06],
        [0.3, 0.5],
        [0.26, 0.6],
        [0.001, 0.62],
      ],
      M.dark,
      [0, 0, 0],
      null,
      28,
      g,
    );
    B.plane(0.26, 0.16, M.flame, [0, 0.22, 0.305], null, B.dyn).position.set(1.7, 0.22, 4.705);
    for (let i = 0; i < 5; i++) B.box(0.26, 0.012, 0.01, M.dark, [0, 0.16 + i * 0.03, 0.31], null, 0.002, g);
    B.cyl(0.08, 0.08, 3.4, M.steel, [0, 2.3, 0], null, 14, 0, g);
    B.cyl(0.11, 0.11, 0.06, M.steel, [0, 0.62, 0], null, 16, 0, g);
    B.cyl(0.1, 0.12, 0.16, M.steel, [0.12, 0.7, -0.05], null, 18, 0.01, g); // 水壺
    B.mesh(new THREE.TorusGeometry(0.07, 0.008, 6, 14, Math.PI), M.dark, [0.12, 0.8, -0.05], [0, 0, 0], 1, g);
  });

  // ===== 醫療區（+Z 端的 −X 側）：點滴架、擔架、布簾 =====
  B.group([-2.2, 0, 3.2], null, (g) => {
    B.box(0.6, 0.06, 1.9, M.canvas2, [0, 0.55, 0], null, 0.02, g);
    for (const sx of [-1, 1]) B.rod([sx * 0.28, 0.55, -1.1], [sx * 0.28, 0.55, 1.1], 0.02, M.steel, g);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        B.rod([sx * 0.28, 0, sz * 0.85], [sx * 0.28, 0.55, sz * 0.85], 0.02, M.steel, g);
    B.box(0.5, 0.12, 1.1, M.blanket[1], [0, 0.64, 0.2], null, 0.05, g);
    // 點滴架
    B.rod([0.5, 0, -0.6], [0.5, 1.9, -0.6], 0.012, M.steel, g);
    B.rod([0.4, 1.85, -0.6], [0.6, 1.85, -0.6], 0.01, M.steel, g);
    B.box(0.08, 0.16, 0.03, B.mat(0xd8eef6, 0.2, 0), [0.45, 1.72, -0.6], null, 0.01, g); // 點滴袋（放在醫療區的群組裡）
    // 布簾（掛在桿子上，有波浪）
    B.rod([-0.6, 2.1, -1.2], [-0.6, 2.1, 1.2], 0.015, M.steel, g);
    for (let i = 0; i < 8; i++)
      B.box(
        0.02,
        1.9,
        0.32,
        M.white,
        [-0.6 + (i % 2 ? 0.05 : -0.05), 1.1, -1.05 + i * 0.3],
        [0, i % 2 ? 0.4 : -0.4, 0],
        0.01,
        g,
      );
  });

  // ===== 名單白板與孩子的畫：兩座立著的板子（−X 側，斜對著中央走道）=====
  const easel = (p, ry, fn) =>
    B.group(p, [0, ry, 0], (g) => {
      for (const sx of [-1, 1]) B.rod([sx * 0.7, 0, 0.12], [sx * 0.66, 1.9, 0], 0.025, M.steel, g);
      B.rod([0, 0, -0.45], [0, 1.6, -0.02], 0.02, M.steel, g);
      B.box(1.5, 0.05, 0.1, M.steel, [0, 0.6, 0.06], null, 0.01, g);
      fn(g);
    });
  easel([-2.5, 0, -2.6], Math.PI / 2 - 0.5, (g) => {
    B.box(1.44, 0.92, 0.03, M.white, [0, 1.15, 0.04], null, 0.01, g);
    B.plane(1.38, 0.86, M.board, [0, 1.15, 0.06], null, g);
  });
  easel([-2.6, 0, 0.6], Math.PI / 2 + 0.35, (g) => {
    B.box(1.44, 0.92, 0.03, B.mat(0xa8784a, 0.9, 0), [0, 1.15, 0.04], null, 0.01, g); // 軟木板
    for (let i = 0; i < 5; i++) {
      const x = -0.48 + (i % 3) * 0.48,
        y = 1.36 - Math.floor(i / 3) * 0.42;
      B.plane(0.36, 0.27, M.drawing[i], [x, y, 0.065], [0, 0, (R() - 0.5) * 0.2], g);
      B.sph(0.015, M.red, [x, y + 0.11, 0.07], 1, g, 8); // 圖釘
    }
  });
  // 外套與靴子（入口旁的掛勾）
  B.rod([-0.95, 1.8, -L / 2 + 0.15], [-2.2, 1.8, -L / 2 + 0.15], 0.02, M.wood);
  for (let i = 0; i < 4; i++) {
    const x = -1.1 - i * 0.32;
    B.box(
      0.42,
      0.85,
      0.16,
      M.blanket[(i + 2) % 4],
      [x, 1.35, -L / 2 + 0.25],
      [0, 0, (R() - 0.5) * 0.1],
      0.06,
    );
    B.box(0.12, 0.22, 0.26, M.dark, [x, 0.11, -L / 2 + 0.5], null, 0.03);
  }
  // 門口的積雪（被吹進來的雪堆）
  for (let i = 0; i < 6; i++)
    B.sph(
      0.5 + R() * 0.3,
      M.snow,
      [(R() - 0.5) * 1.6, 0, -L / 2 + 0.2 + R() * 0.6],
      [1, 0.16, 0.8],
      undefined,
      14,
    );

  return B.done();
}
