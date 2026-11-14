// 過場的室內：維爾威動態的航運調度室（派克的據點；3D 動畫化，docs/cine-redesign-design.md 第十節）。
// 塔台式的調度室：−Z 是斜面的大窗（窗外是夜裡的貨運機場：跑道燈、機棚、停機坪上閃燈的運輸機、北邊遠處的發射塔），
// 中央兩排弧形的控制台（每座 3 台螢幕、鍵盤、搖桿、耳機、馬克杯、檯燈），+Z 是大型顯示牆（航線圖、航班看板、各地時鐘），
// 側邊是咖啡機的吧台、飲水機、販賣機、置物櫃、GO／NO-GO 白板；天花板的線槽、風管、嵌燈；高架地板；綠色霓虹的標誌。
// 原點＝地板中央，公尺。發光只用材質（不加點光源）。
import { SceneKit, canvasTex, noiseFill, rng } from './cine-kit.js';

const W = 12,
  DEP = 9,
  H = 3.6;
const GREEN = '#9be070';

// ---------- 貼圖 ----------
const floorTex = () =>
  canvasTex(
    256,
    256,
    (c, w, h) => {
      c.fillStyle = '#4a4e54';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(20,22,26,0.8)';
      c.lineWidth = 3;
      c.strokeRect(1, 1, w - 2, h - 2);
      c.fillStyle = 'rgba(160,170,180,0.15)';
      for (let i = 0; i < 4; i++) c.fillRect(i * 64 + 20, 20, 24, 24);
      noiseFill(c, w, h, 5, 600, '#1a1c20', 0.05, 0.15, 1, 3);
    },
    [6, 4.5],
  );
const wallTex = () =>
  canvasTex(
    256,
    256,
    (c, w, h) => {
      c.fillStyle = '#5a6068';
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(20,24,28,0.5)';
      c.fillRect(0, 0, 4, h);
      c.fillRect(0, h / 2, w, 3);
      noiseFill(c, w, h, 6, 300, '#30343a', 0.05, 0.12, 1, 3);
    },
    [6, 2],
  );
// 螢幕的畫面（幾種：雷達、表格、波形、地圖）
const screenTex = (kind) =>
  canvasTex(256, 160, (c, w, h) => {
    c.fillStyle = '#04100a';
    c.fillRect(0, 0, w, h);
    const R = rng(kind * 13 + 1);
    c.strokeStyle = 'rgba(150,240,120,0.85)';
    c.fillStyle = 'rgba(150,240,120,0.85)';
    c.font = '11px monospace';
    if (kind === 0) {
      for (let r = 20; r < 80; r += 20) {
        c.beginPath();
        c.arc(w / 2, h / 2, r, 0, Math.PI * 2);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(w / 2, h / 2);
      c.lineTo(w / 2 + 70, h / 2 - 30);
      c.stroke();
      for (let i = 0; i < 6; i++) c.fillRect(w / 2 + (R() - 0.5) * 140, h / 2 + (R() - 0.5) * 120, 4, 4);
    } else if (kind === 1) {
      for (let i = 0; i < 9; i++) {
        c.fillStyle = i % 3 === 2 ? '#ffb040' : 'rgba(150,240,120,0.85)';
        c.fillText(
          `VW-${100 + Math.floor(R() * 800)}  ${['NORTH', 'ORBIT', 'LAT-9', 'PORT'][i % 4]}  ${['READY', 'TAXI', 'HOLD', 'GO'][i % 4]}`,
          8,
          16 + i * 16,
        );
      }
    } else if (kind === 2) {
      for (let k = 0; k < 3; k++) {
        c.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const y = h * (0.3 + k * 0.22) + Math.sin(x * (0.05 + k * 0.02) + k) * 12;
          if (x) c.lineTo(x, y);
          else c.moveTo(x, y);
        }
        c.stroke();
      }
    } else {
      c.strokeStyle = 'rgba(120,200,255,0.8)';
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.moveTo(R() * w, R() * h);
        c.quadraticCurveTo(w / 2, R() * h, R() * w, R() * h);
        c.stroke();
      }
    }
  });
// 顯示牆：航線圖（大陸的輪廓、綠色的航線、北邊的紅點＝軌道站的座標）
const routeTex = () =>
  canvasTex(1024, 384, (c, w, h) => {
    c.fillStyle = '#03100a';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(80,140,80,0.35)';
    for (let x = 0; x < w; x += 32) c.strokeRect(x, 0, 0.5, h);
    for (let y = 0; y < h; y += 32) c.strokeRect(0, y, w, 0.5);
    c.fillStyle = 'rgba(60,110,60,0.5)';
    c.beginPath();
    c.moveTo(120, 300);
    c.bezierCurveTo(200, 80, 520, 40, 700, 120);
    c.bezierCurveTo(860, 180, 920, 320, 760, 340);
    c.bezierCurveTo(500, 370, 260, 360, 120, 300);
    c.fill();
    c.strokeStyle = GREEN;
    c.lineWidth = 2;
    const R = rng(4);
    for (let i = 0; i < 9; i++) {
      c.beginPath();
      const x0 = 200 + R() * 500,
        y0 = 160 + R() * 160;
      c.moveTo(x0, y0);
      c.quadraticCurveTo((x0 + 640) / 2, 20, 640, 60);
      c.stroke();
    }
    c.fillStyle = '#ff4030';
    c.beginPath();
    c.arc(640, 60, 10, 0, Math.PI * 2);
    c.fill();
    c.font = 'bold 22px monospace';
    c.fillText('ORBITAL STATION  ▲ 71.3N', 664, 66);
    c.fillStyle = GREEN;
    c.font = 'bold 26px monospace';
    c.fillText('VEERWELL DYNAMICS — NETWORK', 20, 34);
  });
const boardTex = () =>
  canvasTex(512, 256, (c, w, h) => {
    c.fillStyle = '#0a0c0e';
    c.fillRect(0, 0, w, h);
    c.font = 'bold 18px monospace';
    c.fillStyle = '#ffd040';
    c.fillText('FLIGHT  DEST     STATUS', 12, 26);
    const R = rng(9);
    for (let i = 0; i < 9; i++) {
      c.fillStyle = i < 6 ? '#ffd040' : '#ff6040';
      c.fillText(
        `VW${300 + i * 7}  ${['NORTH', 'LAT-9', 'PORT', 'ORBIT'][i % 4].padEnd(8)} ${i < 6 ? 'BOARDING' : 'DELAYED'}`,
        12,
        54 + i * 22,
      );
      void R;
    }
  });
const clockTex = (n) =>
  canvasTex(128, 48, (c, w, h) => {
    c.fillStyle = '#060606';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ff5a3a';
    c.font = 'bold 28px monospace';
    c.fillText(`${String((n * 5 + 2) % 24).padStart(2, '0')}:4${n}`, 14, 34);
  });
const logoTex = () =>
  canvasTex(512, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = GREEN;
    c.lineWidth = 8;
    c.beginPath();
    c.moveTo(20, 20);
    c.lineTo(64, 108);
    c.lineTo(108, 20);
    c.stroke();
    c.fillStyle = GREEN;
    c.font = 'bold 64px "Chakra Petch", sans-serif';
    c.fillText('VEERWELL', 132, 88);
  });
const goTex = () =>
  canvasTex(256, 192, (c, w, h) => {
    c.fillStyle = '#f4f4f0';
    c.fillRect(0, 0, w, h);
    c.font = 'bold 22px sans-serif';
    c.fillStyle = '#20402a';
    c.fillText('GO / NO-GO', 12, 30);
    c.font = '16px sans-serif';
    ['WX', 'FUEL', 'CARGO', 'ROUTE', 'CREW'].forEach((s, i) => {
      c.fillStyle = '#222';
      c.fillText(s, 16, 60 + i * 26);
      c.fillStyle = i === 3 ? '#c03020' : '#2a8a3a';
      c.fillText(i === 3 ? 'NO-GO' : 'GO', 150, 60 + i * 26);
    });
  });
// 窗外：夜裡的機場（遠景的發光點與機棚的剪影）
const fieldTex = () =>
  canvasTex(1024, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#03060c');
    g.addColorStop(0.55, '#0a1420');
    g.addColorStop(1, '#060a0e');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // 遠方的發射塔
    c.fillStyle = '#05080c';
    c.fillRect(w * 0.7, h * 0.18, 18, h * 0.42);
    c.fillRect(w * 0.7 + 30, h * 0.08, 26, h * 0.52);
    for (let i = 0; i < 8; i++) {
      c.fillStyle = i % 2 ? '#ff4030' : '#ffd080';
      c.fillRect(w * 0.7 + 34, h * 0.1 + i * 14, 4, 4);
    }
    // 機棚的剪影
    c.fillStyle = '#04070a';
    for (let i = 0; i < 6; i++) c.fillRect(40 + i * 110, h * 0.42, 90, h * 0.18);
    const R = rng(3);
    for (let i = 0; i < 80; i++) {
      c.fillStyle = R() < 0.3 ? '#9be070' : R() < 0.6 ? '#ffd890' : '#ffffff';
      c.fillRect(R() * w, h * 0.55 + R() * h * 0.1, 2, 2);
    }
  });

export function buildVeerwellDispatch() {
  const B = new SceneKit('veerwellDispatch');
  const M = {
    floor: B.mat(0xffffff, 0.5, 0.3, { map: floorTex() }),
    wall: B.mat(0xffffff, 0.6, 0.2, { map: wallTex() }),
    ceil: B.mat(0x3a3e44, 0.8, 0.2),
    console: B.mat(0x2a2e34, 0.45, 0.5),
    consoleTop: B.mat(0x5a6068, 0.35, 0.4),
    steel: B.mat(0x9aa2aa, 0.35, 0.8),
    dark: B.mat(0x16181c, 0.5, 0.4),
    black: B.mat(0x0a0a0c, 0.4, 0.3),
    green: B.mat(0x5a8a3a, 0.5, 0.2),
    chair: B.mat(0x22262c, 0.7, 0.1),
    mug: B.mat(0xe8e4dc, 0.4, 0),
    mug2: B.mat(0x9be070, 0.4, 0),
    locker: B.mat(0x5a7a5a, 0.45, 0.5),
    vend: B.mat(0x2a3a2a, 0.4, 0.4),
    glass: new THREE.MeshStandardMaterial({
      color: 0x9fd0e8,
      roughness: 0.05,
      metalness: 0.3,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    screens: [0, 1, 2, 3].map((k) => new THREE.MeshBasicMaterial({ map: screenTex(k) })),
    route: new THREE.MeshBasicMaterial({ map: routeTex() }),
    board: new THREE.MeshBasicMaterial({ map: boardTex() }),
    clocks: [0, 1, 2, 3, 4].map((k) => new THREE.MeshBasicMaterial({ map: clockTex(k) })),
    logo: new THREE.MeshBasicMaterial({ map: logoTex(), transparent: true }),
    go: B.mat(0xffffff, 0.6, 0, { map: goTex() }),
    field: new THREE.MeshBasicMaterial({ map: fieldTex() }),
    panelG: B.glow(0xdfe8f0, 1.4),
    lampG: B.glow(0xffe0a0, 2),
    vendG: B.glow(0x9be070, 1.4),
    redG: B.glow(0xff4030, 2),
  };
  const R = rng(17);

  // ===== 殼：高架地板、牆、天花板（不投射陰影）=====
  B.box(W, 0.1, DEP, M.floor, [0, -0.05, 0], null, 0.005, B.shell);
  B.box(W, 0.1, DEP, M.ceil, [0, H + 0.05, 0], null, 0.005, B.shell);
  B.box(0.2, H, DEP, M.wall, [-W / 2, H / 2, 0], null, 0.01, B.shell);
  B.box(0.2, H, DEP, M.wall, [W / 2, H / 2, 0], null, 0.01, B.shell);
  B.box(W, H, 0.2, M.wall, [0, H / 2, DEP / 2], null, 0.01, B.shell);
  // −Z：斜面的大窗（腰牆＋往外傾的玻璃＋窗框）
  const zw = -DEP / 2;
  B.box(W, 0.9, 0.3, M.console, [0, 0.45, zw], null, 0.02, B.shell);
  for (let i = 0; i <= 6; i++) {
    const x = -W / 2 + (i * W) / 6;
    const m = B.box(0.12, H - 0.9, 0.14, M.dark, [x, 0.9 + (H - 0.9) / 2, zw - 0.35], [-0.2, 0, 0]);
    m.castShadow = false;
  }
  const gl = B.plane(W, H - 0.8, M.glass, [0, 0.9 + (H - 0.9) / 2, zw - 0.3], [-0.2, 0, 0], B.dyn);
  gl.castShadow = false;
  // 窗外的機場（一張大的背景板）＋停機坪上閃燈的運輸機（發光的點，會閃：dyn）
  B.plane(260, 50, M.field, [0, 6, zw - 70], null, B.dyn);
  const blink = [];
  for (let i = 0; i < 4; i++) {
    const x = -14 + i * 9,
      z = zw - 18 - (i % 2) * 6;
    // 運輸機的剪影（機身、機翼、垂直尾翼）
    B.box(2.4, 1.0, 7, M.dark, [x, -3.3, z], [0, 0.3 * (i - 1.5), 0], 0.2);
    B.box(9, 0.2, 1.6, M.dark, [x, -3.0, z + 0.4], [0, 0.3 * (i - 1.5), 0], 0.05);
    B.box(0.2, 1.8, 1.4, M.dark, [x, -2.2, z + 3.0], [0, 0.3 * (i - 1.5), 0], 0.05);
    const b = B.sph(0.12, M.redG, [x, -2.6, z], 1, B.dyn, 8);
    blink.push(b);
  }
  // 跑道燈（兩排）
  for (let i = 0; i < 24; i++)
    for (const sx of [-1, 1])
      B.sph(
        0.06,
        B.glow(i % 4 === 0 ? 0xffd080 : 0x9be070, 1.6),
        [sx * 5 + i * 1.6 - 18, -3.9, zw - 30 - i * 0.8],
        1,
        B.dyn,
        6,
      );
  // ===== 天花板：嵌燈面板、線槽、風管 =====
  for (let i = 0; i < 3; i++)
    for (const x of [-3.5, 0, 3.5])
      B.box(1.6, 0.04, 0.6, M.panelG, [x, H - 0.02, -2.6 + i * 2.6], null, 0.005, B.dyn).castShadow = false;
  B.box(W - 0.6, 0.12, 0.4, M.steel, [0, H - 0.3, 1.4], null, 0.01); // 線槽
  for (let i = 0; i < 8; i++)
    B.cable([-5 + i * 1.4, H - 0.24, 1.3], [-4.6 + i * 1.4, H - 0.24, 1.5], 0.02, 0.05, M.black);
  B.cyl(0.28, 0.28, W - 0.6, M.steel, [0, H - 0.45, 3.6], [0, 0, Math.PI / 2], 18); // 風管
  for (let i = 0; i < 5; i++)
    B.cyl(0.31, 0.31, 0.08, M.dark, [-4.5 + i * 2.2, H - 0.45, 3.6], [0, 0, Math.PI / 2], 18);

  // ===== 控制台兩排（弧形：每座轉一點角度）=====
  const desk = (x, z, ry, k, y = 0) =>
    B.group([x, y, z], [0, ry, 0], (g) => {
      B.box(1.6, 0.74, 0.8, M.console, [0, 0.37, 0], null, 0.03, g);
      B.box(1.66, 0.05, 0.86, M.consoleTop, [0, 0.765, 0], null, 0.015, g);
      // 3 台螢幕（中間的最大、兩側往內轉）
      [
        [-0.52, 0.35],
        [0, 0],
        [0.52, -0.35],
      ].forEach(([sx, sr], i) => {
        B.group(
          [sx, 0.79, -0.22],
          [0, sr, 0],
          (s) => {
            B.box(0.5, 0.32, 0.03, M.black, [0, 0.3, 0], null, 0.008, s);
            B.plane(0.46, 0.28, M.screens[(k + i) % 4], [0, 0.3, 0.017], null, s);
            B.box(0.04, 0.16, 0.04, M.steel, [0, 0.1, -0.03], null, 0.005, s);
            B.box(0.2, 0.012, 0.14, M.steel, [0, 0.006, -0.03], null, 0.004, s);
          },
          g,
        );
      });
      B.box(0.44, 0.02, 0.14, M.dark, [0, 0.8, 0.18], null, 0.004, g); // 鍵盤
      B.box(0.1, 0.03, 0.12, M.dark, [0.42, 0.8, 0.2], null, 0.01, g); // 搖桿的底座
      B.cyl(0.015, 0.02, 0.12, M.dark, [0.42, 0.87, 0.2], null, 10, 0, g);
      B.cyl(0.04, 0.035, 0.09, k % 2 ? M.mug : M.mug2, [-0.6, 0.83, 0.25], null, 14, 0, g);
      // 耳機（掛在螢幕邊）
      B.mesh(
        new THREE.TorusGeometry(0.08, 0.012, 6, 16, Math.PI),
        M.dark,
        [0.78, 0.98, -0.2],
        [0, Math.PI / 2, 0],
        1,
        g,
      );
      for (const sz of [-1, 1])
        B.cyl(0.04, 0.04, 0.03, M.dark, [0.78, 0.9, -0.2 + sz * 0.08], [Math.PI / 2, 0, 0], 12, 0, g);
      // 椅子
      B.group(
        [0, 0, 0.75],
        [0, Math.PI + (R() - 0.5) * 0.6, 0],
        (c) => {
          B.box(0.5, 0.08, 0.5, M.chair, [0, 0.48, 0], null, 0.04, c);
          B.box(0.48, 0.6, 0.08, M.chair, [0, 0.82, 0.22], [-0.1, 0, 0], 0.04, c);
          B.cyl(0.03, 0.03, 0.4, M.steel, [0, 0.25, 0], null, 10, 0, c);
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            B.box(
              0.28,
              0.03,
              0.04,
              M.steel,
              [Math.cos(a) * 0.14, 0.04, Math.sin(a) * 0.14],
              [0, -a, 0],
              0.005,
              c,
            );
          }
        },
        g,
      );
    });
  let k = 0;
  for (let i = -2; i <= 2; i++) desk(i * 1.75, -2.4 + Math.abs(i) * 0.25, -i * 0.08, k++);
  // 第二排（高一階的平台）
  B.box(W - 1.2, 0.25, 2.2, M.consoleTop, [0, 0.125, 0.4], null, 0.02);
  B.box(W - 1.2, 0.04, 0.06, B.glow(0x9be070, 1.2), [0, 0.26, -0.7], null, 0.005, B.dyn).castShadow = false;
  for (let i = -1; i <= 1; i++) desk(i * 2.2, 0.2 + Math.abs(i) * 0.2, -i * 0.1, k++, 0.25);

  // ===== +Z：大型顯示牆（航線圖、航班看板、各地時鐘）、標誌 =====
  const zb = DEP / 2 - 0.12;
  B.box(6.4, 2.2, 0.1, M.black, [0, 1.9, zb], null, 0.02);
  B.plane(6.2, 2.05, M.route, [0, 1.9, zb - 0.06], [0, Math.PI, 0], B.dyn);
  B.box(2.4, 1.3, 0.08, M.black, [-4.4, 1.7, zb], null, 0.02);
  B.plane(2.3, 1.18, M.board, [-4.4, 1.7, zb - 0.05], [0, Math.PI, 0], B.dyn);
  for (let i = 0; i < 5; i++) {
    B.box(0.8, 0.32, 0.06, M.black, [-2.6 + i * 1.3, 3.25, zb], null, 0.01);
    B.plane(0.74, 0.26, M.clocks[i], [-2.6 + i * 1.3, 3.25, zb - 0.04], [0, Math.PI, 0], B.dyn);
  }
  B.plane(2.6, 0.65, M.logo, [4.3, 2.9, zb - 0.05], [0, Math.PI, 0], B.dyn);

  // ===== 側邊：咖啡吧台、飲水機、販賣機、置物櫃、GO／NO-GO 白板 =====
  const xs = W / 2 - 0.4;
  B.group([xs, 0, 2.6], [0, -Math.PI / 2, 0], (g) => {
    B.box(2.2, 0.9, 0.6, M.console, [0, 0.45, 0], null, 0.03, g);
    B.box(2.26, 0.05, 0.66, M.consoleTop, [0, 0.92, 0], null, 0.01, g);
    B.box(0.4, 0.5, 0.36, M.black, [-0.6, 1.2, 0], null, 0.03, g); // 咖啡機
    B.box(0.3, 0.06, 0.04, M.redG, [-0.6, 1.35, 0.18], null, 0.005, g);
    B.cyl(0.08, 0.08, 0.2, M.steel, [-0.6, 1.02, 0.08], null, 14, 0, g);
    for (let i = 0; i < 6; i++)
      B.cyl(
        0.04,
        0.035,
        0.09,
        i % 2 ? M.mug : M.mug2,
        [0.1 + (i % 3) * 0.12, 0.99, -0.1 + Math.floor(i / 3) * 0.12],
        null,
        12,
        0,
        g,
      );
    // 飲水機
    B.box(0.36, 1.1, 0.36, M.mug, [0.9, 0.55, 0], null, 0.04, g);
    B.cyl(0.15, 0.15, 0.42, B.mat(0x8ac8f0, 0.15, 0.1), [0.9, 1.31, 0], null, 16, 0, g); // 水桶（不透明：放在吧台的群組裡）
  });
  // 販賣機（發光的面板）
  B.group([xs - 0.05, 0, -0.4], [0, -Math.PI / 2, 0], (g) => {
    B.box(1.0, 1.9, 0.8, M.vend, [0, 0.95, 0], null, 0.04, g);
    B.plane(0.7, 1.2, M.vendG, [-0.08, 1.15, 0.41], null, g);
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++)
        B.box(
          0.12,
          0.2,
          0.04,
          [M.mug2, M.mug, M.green, M.redG][(r + c) % 4],
          [-0.32 + c * 0.16, 0.7 + r * 0.28, 0.42],
          null,
          0.01,
          g,
        );
  });
  // 置物櫃（−X）
  for (let i = 0; i < 5; i++)
    B.group([-W / 2 + 0.35, 0, -1 + i * 0.62], [0, Math.PI / 2, 0], (g) => {
      B.box(0.6, 1.9, 0.5, M.locker, [0, 0.95, 0], null, 0.015, g);
      for (let v = 0; v < 6; v++) B.box(0.3, 0.015, 0.01, M.dark, [0, 1.5 + v * 0.04, 0.26], null, 0.003, g);
      B.box(0.03, 0.12, 0.03, M.steel, [0.2, 1.1, 0.27], null, 0.005, g);
    });
  // GO／NO-GO 白板（−X 牆，靠窗）
  B.group([-W / 2 + 0.15, 1.6, -3.0], [0, Math.PI / 2, 0], (g) => {
    B.box(1.4, 1.0, 0.04, M.mug, [0, 0, 0], null, 0.01, g);
    B.plane(1.3, 0.92, M.go, [0, 0, 0.03], null, g);
  });
  // 地上的貨單夾板、紙箱
  for (let i = 0; i < 3; i++)
    B.box(
      0.5,
      0.35,
      0.4,
      B.mat(0x9a7a50, 0.9, 0),
      [W / 2 - 0.9, 0.175 + i * 0.35, -2.8],
      [0, R() * 0.3, 0],
      0.02,
    );

  const root = B.done();
  root.userData.vw = { blink };
  return root;
}

// 每格：停機坪的運輸機閃燈
export function tickVeerwellDispatch(root, t) {
  const V = root.userData.vw;
  if (!V) return;
  V.blink.forEach((b, i) => (b.visible = Math.sin(t * 3 + i * 1.7) > 0.3));
}
