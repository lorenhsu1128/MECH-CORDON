// 過場的室內：軌道站的中樞（第 6 章章末「中樞是空的」；3D 動畫化，docs/cine-redesign-design.md 第十節）。
// 巨大的圓形殿堂（機甲的尺度：半徑 22 m、高 28 m）：放射狀的肋拱、牆的面板與燈條、地板的同心圓與放射的發光溝，
// 中央是空的台座（本來該有控制台或王座的地方）、上方的圓頂開口（看得到星空與地球的邊）、垂下的纜線，
// 入口（+Z）是一道巨大的門；一行全像的字在台座上方跳動（劇本的 2D 字另外疊）。原點＝地板中心，公尺。
import { SceneKit, canvasTex, noiseFill, rng } from './cine-kit.js';

const R0 = 22,
  H = 28;

const panelTex = () =>
  canvasTex(
    256,
    256,
    (c, w, h) => {
      c.fillStyle = '#5a6068';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(20,24,30,0.7)';
      c.lineWidth = 3;
      c.strokeRect(2, 2, w - 4, h - 4);
      c.strokeRect(w * 0.1, h * 0.1, w * 0.35, h * 0.3);
      c.fillStyle = 'rgba(200,210,220,0.12)';
      c.fillRect(w * 0.55, h * 0.6, w * 0.35, 6);
      noiseFill(c, w, h, 3, 900, '#20242a', 0.05, 0.15, 1, 3);
    },
    [8, 4],
  );
const floorTex = () =>
  canvasTex(
    512,
    512,
    (c, w, h) => {
      c.fillStyle = '#2a2e34';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(10,12,16,0.8)';
      c.lineWidth = 2;
      for (let i = 0; i <= 8; i++) {
        c.strokeRect(0, (i * h) / 8, w, 0.5);
        c.strokeRect((i * w) / 8, 0, 0.5, h);
      }
      noiseFill(c, w, h, 4, 2000, '#14161a', 0.05, 0.2, 1, 4);
    },
    [6, 6],
  );
const textTex = () =>
  canvasTex(1024, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,110,80,0.95)';
    c.font = 'bold 56px monospace';
    c.textAlign = 'center';
    c.fillText('AUTH TERMINAL: NOT HERE', w / 2, 60);
    c.font = 'bold 40px monospace';
    c.fillText('LOCATION: ARK', w / 2, 112);
  });
const skyTex = () =>
  canvasTex(512, 512, (c, w, h) => {
    c.fillStyle = '#01020a';
    c.fillRect(0, 0, w, h);
    const R = rng(7);
    for (let i = 0; i < 400; i++) {
      c.fillStyle = '#ffffff';
      c.globalAlpha = 0.3 + R() * 0.7;
      c.fillRect(R() * w, R() * h, 1 + (R() < 0.1), 1 + (R() < 0.1));
    }
    c.globalAlpha = 1;
    // 地球的邊（藍色的弧）
    const g = c.createRadialGradient(w * 0.5, h * 1.6, h * 0.9, w * 0.5, h * 1.6, h * 1.25);
    g.addColorStop(0, 'rgba(40,110,200,0.9)');
    g.addColorStop(0.5, 'rgba(120,190,255,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });

export function buildOrbitCore() {
  const B = new SceneKit('orbitCore');
  const M = {
    panel: B.mat(0xffffff, 0.55, 0.5, { map: panelTex() }),
    floor: B.mat(0xffffff, 0.4, 0.5, { map: floorTex() }),
    rib: B.mat(0x7a828c, 0.35, 0.8),
    dark: B.mat(0x1a1c20, 0.5, 0.5),
    steel: B.mat(0xa0a8b0, 0.3, 0.85),
    cable: B.mat(0x101214, 0.7, 0.2),
    stripG: B.glow(0xbfe4ff, 1.5),
    redG: B.glow(0xff5a3a, 1.8),
    floorG: B.glow(0x5fb8ff, 1.2),
    text: new THREE.MeshBasicMaterial({
      map: textTex(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    sky: new THREE.MeshBasicMaterial({ map: skyTex(), side: THREE.DoubleSide }),
  };
  const R = rng(13);
  // ===== 殼：地板、圓牆、圓頂（開口）=====
  B.cyl(R0, R0, 0.3, M.floor, [0, -0.15, 0], null, 72, 0, B.shell);
  const wall = new THREE.CylinderGeometry(R0, R0, H, 72, 1, true);
  B.mesh(wall, M.panel, [0, H / 2, 0], null, 1, B.shell).material.side = THREE.DoubleSide;
  // 圓頂：中間開一個洞（環形的頂）
  const ring = new THREE.RingGeometry(7, R0, 72, 1);
  B.mesh(ring, M.dark, [0, H, 0], [Math.PI / 2, 0, 0], 1, B.shell).material.side = THREE.DoubleSide;
  // 開口外的星空與地球的邊
  B.plane(60, 60, M.sky, [0, H + 18, 0], [Math.PI / 2, 0, 0], B.dyn);
  // ===== 放射狀的肋拱（24 道，從牆的下面拱到圓頂的開口）=====
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const r = R0 - 0.6 - t * t * (R0 - 7.6);
      pts.push([Math.cos(a) * r, t * H, Math.sin(a) * r]);
    }
    for (let k = 0; k < 10; k++) B.rod(pts[k], pts[k + 1], i % 2 ? 0.25 : 0.4, M.rib);
    // 牆腳的基座＋燈條
    B.box(1.4, 1.2, 1.2, M.dark, [Math.cos(a) * (R0 - 0.8), 0.6, Math.sin(a) * (R0 - 0.8)], [0, -a, 0], 0.08);
    if (i % 2 === 0)
      B.box(
        0.12,
        H * 0.6,
        0.12,
        M.stripG,
        [Math.cos(a + 0.13) * (R0 - 0.3), H * 0.4, Math.sin(a + 0.13) * (R0 - 0.3)],
        [0, -a, 0],
        0.01,
        B.dyn,
      );
  }
  // 兩圈環形的走道（牆上的）
  for (const y of [9, 17]) {
    B.mesh(new THREE.TorusGeometry(R0 - 1.4, 0.5, 8, 96), M.steel, [0, y, 0], [Math.PI / 2, 0, 0]);
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      B.rod(
        [Math.cos(a) * (R0 - 2), y, Math.sin(a) * (R0 - 2)],
        [Math.cos(a) * (R0 - 2), y + 1.2, Math.sin(a) * (R0 - 2)],
        0.05,
        M.steel,
      );
    }
    B.mesh(new THREE.TorusGeometry(R0 - 2, 0.05, 6, 96), M.steel, [0, y + 1.2, 0], [Math.PI / 2, 0, 0]);
  }
  // ===== 地板：同心圓與放射的發光溝 =====
  for (const r of [5, 9, 14])
    B.mesh(new THREE.TorusGeometry(r, 0.06, 6, 96), M.floorG, [0, 0.03, 0], [Math.PI / 2, 0, 0], 1, B.dyn);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    B.box(
      0.1,
      0.02,
      R0 - 6,
      M.floorG,
      [Math.cos(a) * (R0 / 2 + 2.5), 0.02, Math.sin(a) * (R0 / 2 + 2.5)],
      [0, -a + Math.PI / 2, 0],
      0.005,
      B.dyn,
    );
  }
  // ===== 中央：空的台座（三層的圓台、上面什麼都沒有）=====
  B.cyl(4.5, 5, 0.6, M.dark, [0, 0.3, 0], null, 64, 0.05);
  B.cyl(3.2, 3.5, 0.6, M.rib, [0, 0.9, 0], null, 64, 0.05);
  B.cyl(1.8, 2.1, 0.5, M.dark, [0, 1.45, 0], null, 48, 0.04);
  B.mesh(new THREE.TorusGeometry(1.8, 0.05, 6, 48), M.redG, [0, 1.72, 0], [Math.PI / 2, 0, 0], 1, B.dyn);
  // 跳動的全像字（台座的上方）
  const txt = B.plane(10, 1.25, M.text, [0, 6.5, 0], null, B.dyn);
  // ===== 從圓頂垂下的纜線 =====
  for (let i = 0; i < 18; i++) {
    const a = R() * Math.PI * 2,
      r = 6 + R() * 10;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    B.cable([x, H - 0.5, z], [x * 0.7, 6 + R() * 10, z * 0.7], 0.08 + R() * 0.1, 0.6, M.cable);
  }
  // ===== 入口（+Z）：巨大的門（兩片門扇半開）=====
  B.group([0, 0, R0 - 0.5], [0, Math.PI, 0], (g) => {
    B.box(14, 16, 1.2, M.dark, [0, 8, 0.6], null, 0.1, g);
    for (const sx of [-1, 1]) B.box(5.4, 14, 0.8, M.rib, [sx * 4.6, 7, -0.2], [0, sx * 0.25, 0], 0.08, g);
    B.box(14.4, 0.4, 0.4, M.redG, [0, 15.6, -0.3], null, 0.02, B.dyn);
  });
  const root = B.done();
  root.userData.core = { txt };
  return root;
}

// 每格：跳動的字（偶爾閃一下、整排抖動）
export function tickOrbitCore(root, t) {
  const C = root.userData.core;
  if (!C) return;
  const j = Math.sin(t * 23) > 0.92;
  C.txt.visible = !(Math.sin(t * 7.3) > 0.96);
  C.txt.position.x = j ? Math.sin(t * 91) * 0.15 : 0;
  C.txt.material.opacity = 0.75 + Math.sin(t * 5) * 0.2;
}
