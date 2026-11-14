// 艾瑟立克的研究所的細節層（cine-lab.js 的房間與主要設備之上；docs/cine-redesign-design.md 第十節「場景的建模要很精細」）。
// 房間：寬 12（X ±6）、深 10（Z ±5）、高 4.2，原點＝地板中央；封存艙在 (0, −1.2)、全像桌在 (−3.6, 0.6)、
// 機械臂在 (−4.6, −2.6)、機櫃沿 +X 牆（z −3.9～2.1）、觀察窗在 −Z（x −3～3）、窗邊兩張工作站 (±2.2, −3.9)。
// 這裡補：天花板的格柵燈板、風管、纜線槽與垂下的纜線，牆面的面板肋條、管線與標示，地板的格柵與封存艙周圍的警示環，
// 封存艙的螺栓環、導管與操作台，兩側的實驗台與儀器，−X 牆的白板與樣本櫃，+Z 牆的門、置物櫃、沖淋站。
import { SceneKit, canvasTex, noiseFill, rng } from './cine-kit.js';

const W = 12,
  DEP = 10,
  H = 4.2;

// 白板：公式、波形、黏貼的便條
const boardTex = () =>
  canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#eef1f2';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(30,60,120,0.75)';
    c.lineWidth = 2;
    c.font = '18px serif';
    c.fillStyle = 'rgba(30,60,120,0.85)';
    const L = ['Σ ψ(t) = A·e^{-λt}', 'KEY-07 → σ = 0.973', 'cycle n+1 ?', 'Δf / f₀ < 10⁻⁴'];
    L.forEach((s, i) => c.fillText(s, 20, 40 + i * 34));
    c.beginPath();
    for (let x = 260; x < 490; x += 3) {
      const y = 90 + Math.sin(x * 0.08) * 26 * Math.sin(x * 0.012);
      x === 260 ? c.moveTo(x, y) : c.lineTo(x, y);
    }
    c.stroke();
    c.strokeStyle = 'rgba(200,40,40,0.8)';
    c.beginPath();
    c.arc(380, 92, 40, 0, Math.PI * 2);
    c.stroke();
    const R = rng(5);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = ['#ffe680', '#ffb0c0', '#a8e8ff'][i % 3];
      c.fillRect(30 + i * 90 + R() * 20, 180 + R() * 30, 46, 40);
    }
  });
// 警示的條紋（黃黑）
const hazardTex = () =>
  canvasTex(
    128,
    32,
    (c, w, h) => {
      c.fillStyle = '#1a1a1a';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#e8b820';
      for (let x = -h; x < w; x += 32) {
        c.beginPath();
        c.moveTo(x, h);
        c.lineTo(x + 16, h);
        c.lineTo(x + 16 + h, 0);
        c.lineTo(x + h, 0);
        c.fill();
      }
    },
    [12, 1],
  );
// 格柵（地板的通風口）
const grateTex = () =>
  canvasTex(
    64,
    64,
    (c, w, h) => {
      c.fillStyle = '#2a3036';
      c.fillRect(0, 0, w, h);
      c.fillStyle = '#0a0c0e';
      for (let y = 4; y < h; y += 8) c.fillRect(4, y, w - 8, 4);
    },
    [1, 1],
  );
// 小螢幕（顯示器）：數據的圖表
const monTex = (seed, hue) =>
  canvasTex(256, 160, (c, w, h) => {
    c.fillStyle = '#05121a';
    c.fillRect(0, 0, w, h);
    const R = rng(seed);
    c.strokeStyle = hue;
    c.lineWidth = 2;
    c.beginPath();
    for (let x = 0; x < w; x += 6) {
      const y = h * 0.55 + (R() - 0.5) * 40 * Math.sin(x * 0.05);
      x ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke();
    c.fillStyle = hue;
    for (let i = 0; i < 6; i++) c.fillRect(10 + i * 40, h - 20 - R() * 40, 24, 4);
    c.font = 'bold 14px monospace';
    c.fillText('SAMPLE ' + (100 + seed), 10, 18);
  });
// 標示牌
const signTex = (txt, bg, fg) =>
  canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = fg;
    c.font = 'bold 28px sans-serif';
    c.textAlign = 'center';
    c.fillText(txt, w / 2, 42);
    noiseFill(c, w, h, 3, 120, '#000', 0.02, 0.06, 1, 3);
  });

export function buildLabDetail() {
  const B = new SceneKit('labDetail');
  const M = {
    white: B.mat(0xe4e8ec, 0.35, 0.15),
    panel: B.mat(0xd4dade, 0.5, 0.1),
    steel: B.mat(0x9aa4ae, 0.3, 0.8),
    dark: B.mat(0x3a424a, 0.5, 0.5),
    black: B.mat(0x14181c, 0.5, 0.4),
    rubber: B.mat(0x1a1c1e, 0.9, 0),
    duct: B.mat(0xb8c0c6, 0.45, 0.6),
    cable: B.mat(0x101214, 0.7, 0.2),
    cableB: B.mat(0x1a3a5a, 0.6, 0.2),
    orange: B.mat(0xd86a2a, 0.5, 0.2),
    red: B.mat(0xb02a22, 0.5, 0.2),
    yellow: B.mat(0xe8b820, 0.5, 0.2),
    green: B.mat(0x3a7a4a, 0.5, 0.2),
    paper: B.mat(0xeeeae0, 0.9, 0),
    binder: [
      B.mat(0x2a4a7a, 0.6, 0),
      B.mat(0x7a2a2a, 0.6, 0),
      B.mat(0x2a6a4a, 0.6, 0),
      B.mat(0x5a5a5a, 0.6, 0),
    ],
    board: B.mat(0xffffff, 0.6, 0, { map: boardTex() }),
    hazard: B.mat(0xffffff, 0.6, 0.1, { map: hazardTex() }),
    grate: B.mat(0xffffff, 0.6, 0.6, { map: grateTex() }),
    sign1: B.mat(0xffffff, 0.6, 0, { map: signTex('BIOHAZARD  LV.3', '#e8b820', '#1a1a1a') }),
    sign2: B.mat(0xffffff, 0.6, 0, { map: signTex('KEY PROJECT / 07', '#1a2a3a', '#9fe8ff') }),
    sign3: B.mat(0xffffff, 0.6, 0, { map: signTex('EMERGENCY SHOWER', '#2a8a4a', '#ffffff') }),
    lightG: B.glow(0xe8f6ff, 1.6),
    cyanG: B.glow(0x5fe0ff, 1.8),
    amberG: B.glow(0xffb040, 1.8),
    redG: B.glow(0xff4030, 1.8),
    greenG: B.glow(0x60ff90, 1.6),
    vial: [B.glow(0x5fe0ff, 1.2), B.glow(0xff7a30, 1.3), B.glow(0x9aff70, 1.1), B.glow(0xd8a0ff, 1.1)],
    mon: [0, 1, 2, 3].map(
      (k) =>
        new THREE.MeshBasicMaterial({ map: monTex(k + 3, ['#5fe0ff', '#ff9a50', '#7fff9a', '#d8a0ff'][k]) }),
    ),
    glass: new THREE.MeshStandardMaterial({
      color: 0xbfe8ff,
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  };
  const R = rng(73);
  // 螢幕：在 p（世界座標）、朝向 ry 的設備往前 off 公尺的發光平面（放在 dyn，不合併）
  const scr = (mat, w, h, p, ry, off, rx = 0) =>
    B.plane(w, h, mat, [p[0] + Math.sin(ry) * off, p[1], p[2] + Math.cos(ry) * off], [rx, ry, 0], B.dyn);

  // ===== 天花板：格柵、嵌入的燈板、風管、纜線槽 =====
  for (let i = -2; i <= 2; i++) B.box(W - 0.4, 0.06, 0.06, M.dark, [0, H - 0.04, i * 2], null, 0.01, B.shell);
  for (let i = -2; i <= 2; i++)
    B.box(0.06, 0.06, DEP - 0.4, M.dark, [i * 2.4, H - 0.04, 0], null, 0.01, B.shell);
  for (const x of [-3.6, 3.6])
    for (const z of [-3, 1, 3.4]) {
      B.box(1.6, 0.05, 0.9, M.steel, [x, H - 0.06, z], null, 0.01, B.shell);
      B.box(1.44, 0.02, 0.74, M.lightG, [x, H - 0.09, z], null, 0.005, B.dyn);
    }
  // 風管（沿 Z，+X 側）與出風口
  B.box(0.7, 0.45, DEP - 0.6, M.duct, [3.2, H - 0.36, 0.2], null, 0.03);
  for (let i = -2; i <= 2; i++) {
    B.box(0.72, 0.04, 0.06, M.dark, [3.2, H - 0.36, i * 2 + 0.2], null, 0.01); // 接縫的箍
    B.box(0.5, 0.03, 0.3, M.grate, [3.2, H - 0.6, i * 2 + 1.1], null, 0.01);
  }
  // 纜線槽（沿 X，靠窗）＋垂下的纜線（到封存艙的頂）
  B.box(W - 1, 0.08, 0.4, M.steel, [0, H - 0.5, -3.2], null, 0.01);
  for (const sz of [-1, 1]) B.box(W - 1, 0.12, 0.02, M.steel, [0, H - 0.44, -3.2 + sz * 0.19], null, 0.005);
  for (let i = 0; i < 6; i++)
    B.cyl(
      0.035,
      0.035,
      W - 1.2,
      i % 2 ? M.cableB : M.cable,
      [0, H - 0.42, -3.35 + i * 0.06],
      [0, 0, Math.PI / 2],
      8,
    );
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    B.cable(
      [Math.cos(a) * 0.9, 3.8, -1.2 + Math.sin(a) * 0.9],
      [Math.cos(a) * 2.2, H - 0.45, -3.2],
      0.04,
      0.35,
      i % 2 ? M.cableB : M.cable,
    );
  }
  // 吊掛的監視器（兩台，朝著房間）
  for (const x of [-2, 2]) {
    const ry = x < 0 ? 0.5 : -0.5;
    B.group([x, H - 0.1, 1.4], [0, ry, 0], (g) => {
      B.cyl(0.03, 0.03, 0.6, M.steel, [0, -0.3, 0], null, 8, 0, g);
      B.box(0.9, 0.55, 0.06, M.black, [0, -0.85, 0], [-0.25, 0, 0], 0.01, g);
    });
    scr(M.mon[x < 0 ? 0 : 1], 0.84, 0.49, [x, H - 0.95, 1.4], ry, 0.035, -0.25);
  }

  // ===== 牆面：面板的肋條、腰帶、管線 =====
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.12);
    for (let i = 0; i < 9; i++)
      B.box(0.06, H - 0.3, 0.08, M.panel, [x, H / 2, -4.6 + i * 1.15], null, 0.01, B.shell);
    B.box(0.08, 0.14, DEP - 0.4, M.panel, [x, 1.05, 0], null, 0.01, B.shell);
    B.box(0.05, 0.03, DEP - 0.4, M.cyanG, [x - sx * 0.03, 1.12, 0], null, 0.005, B.dyn);
    // 牆上的管線（三根，沿 Z，靠天花板）
    for (let k = 0; k < 3; k++)
      B.cyl(
        0.05 + k * 0.012,
        0.05 + k * 0.012,
        DEP - 0.6,
        [M.steel, M.yellow, M.dark][k],
        [x - sx * (0.14 + k * 0.13), H - 0.3, 0],
        [Math.PI / 2, 0, 0],
        12,
      );
    for (let i = -3; i <= 3; i++)
      B.box(0.5, 0.06, 0.08, M.dark, [x - sx * 0.3, H - 0.3, i * 1.4], null, 0.01);
  }
  // 窗邊兩側的牆：控制面板（按鍵與燈）
  for (const sx of [-1, 1])
    B.group([sx * 4.5, 1.55, -4.86], null, (g) => {
      B.box(1.4, 0.9, 0.08, M.dark, [0, 0, 0], null, 0.02, g);
      for (let i = 0; i < 12; i++)
        B.box(
          0.12,
          0.08,
          0.03,
          [M.black, M.steel][i % 2],
          [-0.55 + (i % 6) * 0.22, -0.2 + Math.floor(i / 6) * 0.16, 0.05],
          null,
          0.01,
          g,
        );
      const mats = [M.greenG, M.amberG, M.redG, M.cyanG];
      for (let i = 0; i < 8; i++)
        B.sph(0.025, mats[i % 4], [sx * 4.5 - 0.55 + i * 0.15, 1.55 + 0.25, -4.8], 1, B.dyn, 8);
      B.plane(0.6, 0.32, M.mon[2 + (sx > 0 ? 1 : 0)], [sx * 4.5 + 0.3, 1.55 + 0.05, -4.81], null, B.dyn);
    });
  // 標示
  B.plane(1.2, 0.3, M.sign2, [0, H - 0.75, -4.86], null, B.dyn);
  B.plane(0.9, 0.22, M.sign1, [W / 2 - 0.2, 2.75, 3.4], [0, -Math.PI / 2, 0], B.dyn);

  // ===== 地板：高架地板的格柵、封存艙周圍的警示環、纜線的蓋板 =====
  for (const [x, z] of [
    [-2.4, 2.2],
    [2.4, 2.2],
    [-1.2, 3.6],
    [1.2, 3.6],
    [4.2, -1.2],
    [-1.8, -3.0],
  ])
    B.box(0.6, 0.02, 0.6, M.grate, [x, 0.01, z], null, 0.005);
  {
    const ring = new THREE.RingGeometry(1.75, 2.0, 48, 1);
    const uv = ring.attributes.uv;
    const pos = ring.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const a = Math.atan2(pos.getY(i), pos.getX(i));
      uv.setXY(i, ((a / (Math.PI * 2)) * 12) % 12, Math.hypot(pos.getX(i), pos.getY(i)) > 1.85 ? 1 : 0);
    }
    B.mesh(ring, M.hazard, [0, 0.012, -1.2], [-Math.PI / 2, 0, 0], 1, B.shell);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    B.box(
      2.6,
      0.03,
      0.34,
      M.steel,
      [Math.cos(a) * 2.6, 0.015, -1.2 + Math.sin(a) * 2.6],
      [0, -a, 0],
      0.01,
      B.shell,
    );
  }

  // ===== 封存艙：底座的螺栓環、上下的導管、旁邊的操作台 =====
  B.group([0, 0, -1.2], null, (g) => {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      B.cyl(0.035, 0.035, 0.05, M.steel, [Math.cos(a) * 1.42, 0.52, Math.sin(a) * 1.42], null, 8, 0, g);
      B.cyl(0.035, 0.035, 0.05, M.steel, [Math.cos(a) * 1.24, 3.82, Math.sin(a) * 1.24], null, 8, 0, g);
    }
    // 頂部的散熱鰭片與往上的導管
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      B.box(0.04, 0.3, 0.32, M.steel, [Math.cos(a) * 1.05, 4.0, Math.sin(a) * 1.05], [0, -a, 0], 0.005, g);
    }
    B.cyl(0.35, 0.45, 0.4, M.dark, [0, 4.0, 0], null, 20, 0.03, g);
    // 側面的冷卻管（彎上去）
    for (const sx of [-1, 1]) {
      B.cyl(0.07, 0.07, 3.0, M.duct, [sx * 1.45, 2.05, 0.4], null, 12, 0, g);
      B.box(0.2, 0.2, 0.2, M.dark, [sx * 1.45, 0.65, 0.4], null, 0.02, g);
      B.box(0.2, 0.2, 0.2, M.dark, [sx * 1.45, 3.5, 0.4], null, 0.02, g);
    }
    // 操作台（艙的右前方）：斜面的控制板、螢幕、拉桿
    B.group([1.9, 0, 1.2], [0, -0.7, 0], (h) => {
      B.box(0.9, 0.95, 0.55, M.white, [0, 0.475, 0], null, 0.03, h);
      B.box(0.92, 0.06, 0.6, M.dark, [0, 0.98, 0.04], [-0.35, 0, 0], 0.01, h);
      for (let i = 0; i < 8; i++)
        B.box(
          0.08,
          0.03,
          0.06,
          i % 3 ? M.black : M.orange,
          [-0.32 + i * 0.09, 1.01, 0.02],
          [-0.35, 0, 0],
          0.005,
          h,
        );
      B.cyl(0.015, 0.015, 0.22, M.steel, [0.36, 1.12, -0.12], [0.3, 0, 0], 8, 0, h);
      B.sph(0.035, M.red, [0.36, 1.23, -0.09], 1, h, 10);
      B.box(0.6, 0.4, 0.04, M.black, [0, 1.35, -0.25], [0.15, 0, 0], 0.01, h);
    });
  });
  scr(M.mon[1], 0.56, 0.36, [1.9, 1.35, 0], -0.7, -0.225, 0.15);

  // ===== +X 牆的機櫃上面：纜線槽、空調機 =====
  B.box(0.5, 0.08, 6.0, M.steel, [W / 2 - 0.65, 2.55, -0.9], null, 0.01);
  for (let i = 0; i < 6; i++)
    B.cable(
      [W / 2 - 0.65, 2.55, -3.4 + i],
      [W / 2 - 0.65, 2.42, -3.4 + i + 0.4],
      0.03,
      0.08,
      i % 2 ? M.cableB : M.cable,
    );
  B.group([W / 2 - 0.65, 0, 3.4], null, (g) => {
    B.box(0.9, 2.0, 1.4, M.white, [0, 1.0, 0], null, 0.04, g);
    for (let i = 0; i < 8; i++) B.box(0.02, 0.05, 1.2, M.dark, [-0.46, 0.5 + i * 0.16, 0], null, 0.005, g);
    B.box(0.02, 0.3, 0.5, M.black, [-0.46, 1.75, 0], null, 0.005, g);
  });
  B.plane(0.46, 0.26, M.mon[0], [W / 2 - 1.12, 1.75, 3.4], [0, -Math.PI / 2, 0], B.dyn);

  // ===== 實驗台（−X 側、全像桌的後面；+X 側、窗邊）：儀器、試管架、離心機、顯示器、文件 =====
  const bench = (p, ry, seed) =>
    B.group(p, [0, ry, 0], (g) => {
      const r = rng(seed);
      B.box(2.4, 0.06, 0.8, M.white, [0, 0.92, 0], null, 0.02, g);
      B.box(2.3, 0.86, 0.72, M.panel, [0, 0.45, 0.02], null, 0.02, g);
      for (let i = 0; i < 3; i++)
        B.box(0.72, 0.02, 0.02, M.steel, [-0.78 + i * 0.78, 0.7, 0.39], null, 0.005, g); // 抽屜的把手
      // 試管架與試管（發光的液體）
      B.box(0.5, 0.05, 0.16, M.steel, [-0.8, 0.98, -0.1], null, 0.01, g);
      for (let i = 0; i < 6; i++) {
        B.cyl(0.02, 0.02, 0.16, M.glass, [-1.0 + i * 0.08, 1.06, -0.1], null, 8, 0, g);
        B.cyl(0.016, 0.016, 0.06 + r() * 0.06, M.vial[i % 4], [-1.0 + i * 0.08, 1.01, -0.1], null, 8, 0, g);
      }
      // 離心機（圓的蓋子）
      B.cyl(0.18, 0.2, 0.22, M.white, [-0.15, 1.06, 0.05], null, 20, 0.02, g);
      B.cyl(0.16, 0.16, 0.02, M.dark, [-0.15, 1.18, 0.05], null, 20, 0, g);
      B.sph(0.015, M.greenG, [-0.02, 1.04, 0.22], 1, g, 6);
      // 顯微鏡（簡化：底座、柱、鏡筒）
      B.box(0.2, 0.04, 0.26, M.dark, [0.4, 0.97, 0], null, 0.01, g);
      B.box(0.05, 0.3, 0.05, M.dark, [0.4, 1.12, -0.09], null, 0.01, g);
      B.cyl(0.03, 0.03, 0.22, M.black, [0.4, 1.2, -0.02], [0.4, 0, 0], 10, 0, g);
      // 顯示器與鍵盤
      B.box(0.6, 0.38, 0.03, M.black, [0.85, 1.25, -0.25], null, 0.01, g);
      B.box(0.06, 0.2, 0.06, M.dark, [0.85, 1.02, -0.27], null, 0.01, g);
      B.box(0.42, 0.02, 0.14, M.black, [0.85, 0.96, 0.08], null, 0.005, g);
      // 文件、夾板、杯子
      B.box(0.22, 0.01, 0.3, M.paper, [0.25, 0.955, 0.2], [0, 0.3, 0], 0.002, g);
      B.box(0.23, 0.012, 0.32, M.dark, [-0.5, 0.955, 0.22], [0, -0.2, 0], 0.002, g);
      B.cyl(0.04, 0.035, 0.1, M.white, [1.05, 1.0, 0.18], null, 12, 0, g);
    });
  bench([-5.4, 0, 2.6], Math.PI / 2, 11);
  bench([3.4, 0, 4.4], Math.PI, 12);
  // 實驗台的顯示器畫面（在 dyn：世界座標）
  B.plane(0.56, 0.34, M.mon[2], [-5.4 + 0.235, 1.25, 2.6 - 0.85], [0, Math.PI / 2, 0], B.dyn);
  B.plane(0.56, 0.34, M.mon[3], [3.4 - 0.85, 1.25, 4.4 + 0.235], [0, Math.PI, 0], B.dyn);

  // ===== −X 牆：白板、樣本櫃（玻璃門、裡面的樣本罐）=====
  B.box(2.6, 1.3, 0.05, M.white, [-W / 2 + 0.18, 2.0, -1.4], [0, Math.PI / 2, 0], 0.02);
  B.plane(2.5, 1.2, M.board, [-W / 2 + 0.21, 2.0, -1.4], [0, Math.PI / 2, 0], B.dyn);
  B.box(0.06, 0.04, 2.4, M.steel, [-W / 2 + 0.3, 1.33, -1.4], null, 0.01); // 筆槽
  B.group([-W / 2 + 0.45, 0, 4.2], [0, Math.PI / 2, 0], (g) => {
    B.box(1.4, 2.2, 0.55, M.white, [0, 1.1, 0], null, 0.03, g);
    for (let s = 0; s < 4; s++) {
      B.box(1.3, 0.03, 0.48, M.steel, [0, 0.4 + s * 0.5, 0.02], null, 0.005, g);
      for (let i = 0; i < 6; i++) {
        const t = R();
        if (t < 0.3) continue;
        B.cyl(0.07, 0.07, 0.18 + R() * 0.1, M.glass, [-0.5 + i * 0.2, 0.52 + s * 0.5, 0.05], null, 10, 0, g);
        B.cyl(0.055, 0.055, 0.08, M.binder[i % 4], [-0.5 + i * 0.2, 0.46 + s * 0.5, 0.05], null, 10, 0, g);
      }
    }
    B.box(1.36, 2.1, 0.02, M.glass, [0, 1.1, 0.28], null, 0.005, g);
  });

  // ===== +Z 牆（鏡頭背後）：氣密門、置物櫃、緊急沖淋站 =====
  B.group([0, 0, DEP / 2 - 0.12], [0, Math.PI, 0], (g) => {
    B.box(2.0, 3.0, 0.2, M.dark, [0, 1.5, 0], null, 0.03, g);
    for (const sx of [-1, 1]) B.box(0.9, 2.7, 0.08, M.white, [sx * 0.47, 1.4, 0.12], null, 0.03, g);
    B.box(0.06, 2.7, 0.1, M.yellow, [0, 1.4, 0.14], null, 0.01, g);
    B.box(0.18, 0.28, 0.05, M.black, [1.25, 1.35, 0.12], null, 0.01, g);
  });
  B.sph(0.03, M.greenG, [-1.25, 1.42, DEP / 2 - 0.3], 1, B.dyn, 8);
  for (let i = 0; i < 5; i++)
    B.group([-4.6 + i * 0.5, 0, DEP / 2 - 0.4], [0, Math.PI, 0], (g) => {
      B.box(0.48, 1.9, 0.5, i % 2 ? M.panel : M.white, [0, 0.95, 0], null, 0.02, g);
      for (let k = 0; k < 4; k++) B.box(0.3, 0.012, 0.02, M.dark, [0, 1.6 + k * 0.04, 0.26], null, 0.003, g);
      B.box(0.03, 0.12, 0.03, M.steel, [0.17, 1.0, 0.27], null, 0.005, g);
    });
  B.group([4.4, 0, DEP / 2 - 0.3], [0, Math.PI, 0], (g) => {
    B.cyl(0.03, 0.03, 2.4, M.green, [0, 1.2, 0], null, 10, 0, g);
    B.cyl(0.25, 0.05, 0.12, M.green, [0, 2.4, 0.25], null, 16, 0, g);
    B.cyl(0.02, 0.02, 0.3, M.green, [0, 2.45, 0.12], [Math.PI / 2, 0, 0], 8, 0, g);
    B.box(0.5, 0.05, 0.4, M.green, [0.3, 1.2, 0.2], null, 0.01, g);
    B.box(0.03, 0.6, 0.03, M.yellow, [0.18, 1.8, 0.05], [0, 0, 0.3], 0.005, g);
  });
  B.plane(0.9, 0.22, M.sign3, [4.4, 2.75, DEP / 2 - 0.17], [0, Math.PI, 0], B.dyn);
  // 消防栓箱、滅火器
  B.box(0.5, 0.7, 0.18, M.red, [W / 2 - 0.2, 1.3, 4.3], [0, -Math.PI / 2, 0], 0.02);
  B.cyl(0.08, 0.08, 0.5, M.red, [-W / 2 + 0.3, 0.3, -4.4], null, 14, 0.01);
  return B.done();
}
