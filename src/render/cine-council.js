// 過場的室內：四家委託方的會議室（第 5 章章末「四家在那一晚談好了」；3D 動畫化，docs/cine-redesign-design.md 第十節）。
// 圓形的議事廳：中央是大圓桌與全像投影台（軌道站的全像、72 小時的倒數），四個委託方的席位（各自的顏色的旗幟、名牌、
// 麥克風、水杯、文件、皮椅），周圍一圈階梯的旁聽席，天花板的環狀燈與吊頂，−Z 是夜海的大窗。原點＝桌子的中心（地板），公尺。
import { SceneKit, canvasTex, noiseFill, rng } from './cine-kit.js';

const RR = 7.5; // 房間的半徑
const H = 5.2;
const FACT = [
  ['CASTRON', '#d8903a', -Math.PI * 0.75],
  ['AETHERIC', '#5fd0ff', -Math.PI * 0.25],
  ['VEERWELL', '#9be070', Math.PI * 0.25],
  ['SANCTA', '#e0d070', Math.PI * 0.75],
];

const marbleTex = () =>
  canvasTex(
    512,
    512,
    (c, w, h) => {
      c.fillStyle = '#2a2c30';
      c.fillRect(0, 0, w, h);
      const R = rng(8);
      c.strokeStyle = 'rgba(200,205,215,0.12)';
      for (let i = 0; i < 40; i++) {
        c.lineWidth = 1 + R() * 2;
        c.beginPath();
        let x = R() * w,
          y = R() * h;
        c.moveTo(x, y);
        for (let k = 0; k < 8; k++) c.lineTo((x += (R() - 0.5) * 120), (y += (R() - 0.3) * 80));
        c.stroke();
      }
      noiseFill(c, w, h, 9, 1500, '#101114', 0.05, 0.15, 1, 3);
    },
    [3, 3],
  );
const woodTex = () =>
  canvasTex(
    512,
    512,
    (c, w, h) => {
      c.fillStyle = '#4a2c1c';
      c.fillRect(0, 0, w, h);
      const R = rng(5);
      for (let i = 0; i < 80; i++) {
        c.strokeStyle = `rgba(${R() < 0.5 ? '20,10,6' : '110,70,40'},${0.12 + R() * 0.2})`;
        c.lineWidth = 1 + R() * 3;
        c.beginPath();
        const y = R() * h;
        c.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x * 0.015 + i) * 8 * R());
        c.stroke();
      }
    },
    [2, 2],
  );
const bannerTex = (name, col) =>
  canvasTex(128, 384, (c, w, h) => {
    c.fillStyle = col;
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(0, h * 0.85, w, h * 0.15);
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 6;
    c.beginPath();
    c.arc(w / 2, h * 0.3, 34, 0, Math.PI * 2);
    c.stroke();
    c.save();
    c.translate(w / 2, h * 0.62);
    c.rotate(-Math.PI / 2);
    c.fillStyle = '#ffffff';
    c.font = 'bold 30px "Chakra Petch", sans-serif';
    c.textAlign = 'center';
    c.fillText(name, 0, 10);
    c.restore();
  });
const plateTex = (name, col) =>
  canvasTex(256, 64, (c, w, h) => {
    c.fillStyle = '#121214';
    c.fillRect(0, 0, w, h);
    c.fillStyle = col;
    c.fillRect(0, h - 6, w, 6);
    c.fillStyle = '#f0f0f0';
    c.font = 'bold 30px "Chakra Petch", sans-serif';
    c.textAlign = 'center';
    c.fillText(name, w / 2, 40);
  });
const docTex = () =>
  canvasTex(128, 180, (c, w, h) => {
    c.fillStyle = '#f2efe6';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#20202a';
    c.font = 'bold 12px sans-serif';
    c.fillText('ACCORD — DRAFT', 10, 18);
    for (let i = 0; i < 12; i++) c.fillRect(10, 30 + i * 11, 90 + ((i * 37) % 20), 2);
    c.fillStyle = '#c03020';
    c.fillRect(10, h - 26, 60, 3);
  });
// 倒數（全像的文字）
const countTex = () =>
  canvasTex(512, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = 'rgba(255,90,70,0.95)';
    c.font = 'bold 84px monospace';
    c.textAlign = 'center';
    c.fillText('71:59:58', w / 2, 92);
  });
// 窗外的夜海（地平線上的洋上都市的燈）
const seaTex = () =>
  canvasTex(1024, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#02050c');
    g.addColorStop(0.5, '#0a1624');
    g.addColorStop(0.52, '#06101a');
    g.addColorStop(1, '#02060a');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    const R = rng(4);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = R() < 0.3 ? '#40c0c0' : '#ffd890';
      const x = R() * w;
      c.fillRect(x, h * 0.48 + R() * 8, 2, 2);
      c.globalAlpha = 0.3;
      c.fillRect(x, h * 0.56 + R() * 30, 1, 6); // 海面的倒影
      c.globalAlpha = 1;
    }
    for (let i = 0; i < 90; i++) {
      c.fillStyle = '#ffffff';
      c.globalAlpha = 0.3 + R() * 0.6;
      c.fillRect(R() * w, R() * h * 0.4, 1, 1);
    }
    c.globalAlpha = 1;
  });

export function buildCouncilChamber() {
  const B = new SceneKit('councilChamber');
  const M = {
    marble: B.mat(0xffffff, 0.25, 0.1, { map: marbleTex() }),
    wood: B.mat(0xffffff, 0.4, 0.05, { map: woodTex() }),
    wall: B.mat(0x4a4a52, 0.7, 0.2),
    wallP: B.mat(0x6a5a48, 0.55, 0.1),
    ceil: B.mat(0x2a2a30, 0.8, 0.2),
    brass: B.mat(0xc8a060, 0.3, 0.9),
    steel: B.mat(0x8a929a, 0.35, 0.8),
    dark: B.mat(0x18181c, 0.5, 0.4),
    leather: B.mat(0x2a1a14, 0.55, 0.05),
    carpet: B.mat(0x3a1c1c, 0.95, 0),
    seat: B.mat(0x302830, 0.8, 0.05),
    glass: new THREE.MeshStandardMaterial({
      color: 0xcfe8f6,
      roughness: 0.05,
      metalness: 0.2,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
    doc: B.mat(0xffffff, 0.8, 0, { map: docTex() }),
    sea: new THREE.MeshBasicMaterial({ map: seaTex() }),
    ringG: B.glow(0xfff0d8, 1.6),
    holoG: new THREE.MeshBasicMaterial({
      color: 0x7fd8ff,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
    count: new THREE.MeshBasicMaterial({
      map: countTex(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  };

  // ===== 殼：大理石地板（中央的地毯圓）、圓牆、天花板 =====
  B.cyl(RR, RR, 0.1, M.marble, [0, -0.05, 0], null, 64, 0, B.shell);
  B.cyl(4.2, 4.2, 0.02, M.carpet, [0, 0.01, 0], null, 64, 0, B.shell);
  // 圓柱的 θ：x＝r·sinθ、z＝r·cosθ；缺口（窗）在 θ＝π（−Z），左右各 0.12π
  const wall = new THREE.CylinderGeometry(RR, RR, H, 64, 1, true, Math.PI * 1.12, Math.PI * 1.76);
  B.mesh(wall, M.wall, [0, H / 2, 0], null, 1, B.shell).material.side = THREE.DoubleSide;
  B.cyl(RR, RR, 0.1, M.ceil, [0, H, 0], null, 64, 0, B.shell);
  // 牆的直條面板
  for (let i = 0; i < 28; i++) {
    const a = Math.PI * 1.15 + (i / 28) * Math.PI * 1.7;
    B.box(
      0.06,
      H - 1.2,
      0.6,
      M.wallP,
      [Math.sin(a) * (RR - 0.08), H / 2 + 0.3, Math.cos(a) * (RR - 0.08)],
      [0, a, 0],
      0.01,
      B.shell,
    );
  }
  // −Z 的大窗（弧形的玻璃＋窗框）＋窗外的夜海
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI * 0.88 + (i / 6) * Math.PI * 0.24;
    B.box(0.12, H, 0.16, M.dark, [Math.sin(a) * RR, H / 2, Math.cos(a) * RR], [0, a, 0], 0.01);
  }
  B.box(
    2 * RR * Math.sin(Math.PI * 0.12) + 0.4,
    0.5,
    0.3,
    M.dark,
    [0, 0.25, -RR * Math.cos(Math.PI * 0.12)],
    null,
    0.02,
  );
  B.plane(300, 70, M.sea, [0, 8, -RR - 90], null, B.dyn);

  // ===== 中央：大圓桌（木頭的桌面＋黃銅的邊）、全像投影台 =====
  B.cyl(3.2, 3.2, 0.08, M.wood, [0, 0.76, 0], null, 64, 0.02);
  B.mesh(new THREE.TorusGeometry(3.2, 0.03, 8, 96), M.brass, [0, 0.76, 0], [Math.PI / 2, 0, 0]);
  B.cyl(1.4, 1.4, 0.06, M.dark, [0, 0.78, 0], null, 48, 0.01); // 中央的開口（投影台）
  B.cyl(2.4, 2.6, 0.7, M.dark, [0, 0.36, 0], null, 48, 0.02); // 桌腳的底座
  // 投影台：環形的發光圈＋軌道站的全像（環＋脊柱＋模組，線框）＋倒數
  B.mesh(new THREE.TorusGeometry(1.3, 0.02, 6, 64), M.ringG, [0, 0.82, 0], [Math.PI / 2, 0, 0], 1, B.dyn);
  const holo = new THREE.Group();
  holo.position.set(0, 1.9, 0);
  B.dyn.add(holo);
  const hw = (geo, p, r) => {
    const m = new THREE.Mesh(geo, M.holoG);
    m.position.set(...p);
    if (r) m.rotation.set(...r);
    holo.add(m);
    return m;
  };
  hw(new THREE.TorusGeometry(0.75, 0.025, 6, 48), [0, 0, 0], [Math.PI / 2 - 0.3, 0, 0]);
  hw(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 8), [0, 0, 0], [0.3, 0, 0]);
  for (let i = 0; i < 4; i++)
    hw(new THREE.BoxGeometry(0.22, 0.14, 0.14), [0, -0.5 + i * 0.32, 0.15 * (i - 1.5) * 0.3], [0.3, 0, 0]);
  const cone = hw(new THREE.ConeGeometry(0.9, 0.9, 24, 1, true), [0, -0.55, 0], null);
  cone.material = M.holoG.clone();
  cone.material.opacity = 0.12; // 投影的光錐：很淡
  // 倒數不跟著全像轉（固定朝 +Z：鏡頭多半在這一側）
  const cnt = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), M.count);
  cnt.position.set(0, 2.95, 0);
  B.dyn.add(cnt);

  // ===== 四個席位：皮椅、名牌、麥克風、水杯、文件；背後的旗幟 =====
  FACT.forEach(([name, col], i) => {
    const a = FACT[i][2];
    const sx = Math.sin(a),
      sz = Math.cos(a);
    B.group([sx * 3.0, 0.8, sz * 3.0], [0, a + Math.PI, 0], (g) => {
      B.box(
        0.6,
        0.12,
        0.05,
        B.mat(0xffffff, 0.5, 0.1, { map: plateTex(name, col) }),
        [0, 0.07, -0.05],
        [-0.4, 0, 0],
        0.01,
        g,
      );
      B.cyl(0.05, 0.06, 0.03, M.dark, [0.3, 0.015, 0.05], null, 12, 0, g);
      B.rod([0.3, 0.02, 0.05], [0.24, 0.32, -0.08], 0.006, M.dark, g);
      B.sph(0.02, M.dark, [0.24, 0.33, -0.08], 1, g, 8);
      B.cyl(0.035, 0.03, 0.12, M.glass, [-0.35, 0.06, 0.05], null, 12, 0, g);
      B.box(0.21, 0.004, 0.3, M.doc, [-0.05, 0.004, 0.15], [0, 0.15 * (i - 1.5), 0], 0.001, g);
      B.box(0.21, 0.004, 0.3, M.doc, [0.02, 0.008, 0.18], [0, -0.2, 0], 0.001, g);
      B.cyl(0.006, 0.006, 0.14, M.brass, [0.12, 0.012, 0.2], [0, 0, Math.PI / 2], 6, 0, g);
    });
    // 皮椅
    B.group([sx * 3.75, 0, sz * 3.75], [0, a, 0], (g) => {
      B.box(0.62, 0.14, 0.58, M.leather, [0, 0.5, 0], null, 0.05, g);
      B.box(0.62, 1.0, 0.14, M.leather, [0, 1.05, 0.26], [-0.1, 0, 0], 0.06, g);
      for (const xx of [-1, 1]) B.box(0.08, 0.2, 0.5, M.leather, [xx * 0.33, 0.66, 0.02], null, 0.03, g);
      B.cyl(0.04, 0.04, 0.42, M.steel, [0, 0.24, 0], null, 10, 0, g);
      for (let k = 0; k < 5; k++) {
        const b = (k / 5) * Math.PI * 2;
        B.box(0.3, 0.03, 0.05, M.steel, [Math.cos(b) * 0.15, 0.04, Math.sin(b) * 0.15], [0, -b, 0], 0.005, g);
      }
    });
    // 旗幟（牆前的旗桿）
    B.group([sx * (RR - 0.7), 0, sz * (RR - 0.7)], [0, a + Math.PI, 0], (g) => {
      B.cyl(0.04, 0.05, 3.4, M.brass, [0, 1.7, 0], null, 12, 0, g);
      B.sph(0.07, M.brass, [0, 3.45, 0], 1, g, 10);
      B.cyl(0.18, 0.22, 0.08, M.dark, [0, 0.04, 0], null, 18, 0, g);
      B.box(0.9, 0.04, 0.04, M.brass, [0.45, 3.25, 0], null, 0.005, g);
      const f = B.plane(
        0.85,
        2.4,
        B.mat(0xffffff, 0.85, 0, { map: bannerTex(name, col) }),
        [0.45, 2.02, 0.02],
        null,
        g,
      );
      f.material.side = THREE.DoubleSide;
    });
  });

  // ===== 旁聽席：周圍一圈階梯（三層）＋座位 =====
  for (let tier = 0; tier < 3; tier++) {
    const r = 5.3 + tier * 0.65;
    for (let i = 0; i < 24; i++) {
      const a = Math.PI * 1.2 + (i / 24) * Math.PI * 1.6;
      B.box(
        0.6,
        0.35 + tier * 0.35,
        0.62,
        M.marble,
        [Math.sin(a) * r, (0.35 + tier * 0.35) / 2, Math.cos(a) * r],
        [0, a, 0],
        0.01,
      );
      if (i % 2 === 0)
        B.box(
          0.44,
          0.12,
          0.4,
          M.seat,
          [Math.sin(a) * r, 0.4 + tier * 0.35, Math.cos(a) * r],
          [0, a, 0],
          0.03,
        );
    }
  }

  // ===== 天花板：吊頂的圓盤＋環狀燈＋垂下的細索 =====
  B.cyl(3.6, 3.6, 0.2, M.dark, [0, H - 0.6, 0], null, 64, 0.02);
  B.mesh(new THREE.TorusGeometry(3.5, 0.05, 8, 96), M.ringG, [0, H - 0.72, 0], [Math.PI / 2, 0, 0], 1, B.dyn);
  B.mesh(new THREE.TorusGeometry(2.2, 0.04, 8, 72), M.ringG, [0, H - 0.72, 0], [Math.PI / 2, 0, 0], 1, B.dyn);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    B.rod(
      [Math.cos(a) * 3.3, H - 0.5, Math.sin(a) * 3.3],
      [Math.cos(a) * 3.3, H, Math.sin(a) * 3.3],
      0.012,
      M.steel,
    );
  }

  const root = B.done();
  root.userData.cc = { holo };
  return root;
}

// 每格：全像慢慢轉
export function tickCouncilChamber(root, t) {
  const C = root.userData.cc;
  if (!C) return;
  C.holo.rotation.y = t * 0.3;
  C.holo.position.y = 1.9 + Math.sin(t * 1.2) * 0.03;
}
