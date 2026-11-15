// 過場的室內：艾瑟立克的研究所（薩奇的實驗室；3D 動畫化，docs/cine-redesign-design.md 第十節）。
// 全部程式模型、公尺；原點＝地板中央。中央是封存艙裡的天線核心（發光、外面有轉動的環），−Z 是觀察窗（窗外是夜裡的河谷、
// 遠方的主壩亮著燈），+X 是伺服器機櫃（閃爍的指示燈），−X 是全像桌（核心的波形）與機械臂；冷白的牆板、青色的燈條。
// 光只用場景原本的太陽／半球光，發光的都是材質（不加點光源）。
import { D } from './detail.js';
import { bakeStatic } from './cine-kit.js';
import { buildLabDetail } from './cine-lab-detail.js';

const W = 12,
  DEP = 10,
  H = 4.2;

function tex(w, h, draw, rep) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (rep) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rep[0], rep[1]);
  }
  return t;
}
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
// 地板：淺灰的方格板
const floorTex = () =>
  tex(
    256,
    256,
    (c, w, h) => {
      c.fillStyle = '#c8ccd0';
      c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(60,70,80,0.45)';
      c.lineWidth = 2;
      c.strokeRect(1, 1, w - 2, h - 2);
      c.strokeStyle = 'rgba(60,70,80,0.15)';
      c.strokeRect(w / 2, 0, 0.5, h);
      c.strokeRect(0, h / 2, w, 0.5);
    },
    [6, 5],
  );
// 牆板：白色的面板＋細縫
const wallTex = () =>
  tex(
    256,
    256,
    (c, w, h) => {
      c.fillStyle = '#dfe4e8';
      c.fillRect(0, 0, w, h);
      c.fillStyle = 'rgba(40,60,80,0.35)';
      c.fillRect(0, 0, w, 3);
      c.fillRect(0, 0, 3, h);
      c.fillStyle = 'rgba(40,60,80,0.12)';
      c.fillRect(20, 40, w - 40, 2);
    },
    [6, 2],
  );
// 全像：核心的波形與數據
const holoTex = () =>
  tex(512, 256, (c, w, h) => {
    c.fillStyle = 'rgba(0,20,30,0)';
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(120,230,255,0.95)';
    c.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      c.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = h * (0.3 + k * 0.2) + Math.sin(x * (0.03 + k * 0.01)) * (18 - k * 4) * Math.sin(x * 0.007);
        if (x) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
    }
    c.fillStyle = 'rgba(160,240,255,0.9)';
    c.font = 'bold 18px monospace';
    c.fillText('CORE SIGNAL / ANALYSIS', 12, 24);
    c.fillStyle = 'rgba(255,150,80,0.95)';
    c.fillText('PATTERN MATCH 97.3%', 12, h - 14);
  });
// 機櫃的指示燈
const rackTex = (seed) =>
  tex(128, 256, (c, w, h) => {
    c.fillStyle = '#1a2026';
    c.fillRect(0, 0, w, h);
    const R = rng(seed);
    for (let y = 6; y < h; y += 14) {
      c.fillStyle = '#2a323a';
      c.fillRect(6, y, w - 12, 10);
      for (let x = 10; x < w - 10; x += 9)
        if (R() < 0.4) {
          c.fillStyle = R() < 0.7 ? '#5fe0ff' : R() < 0.5 ? '#7fff9a' : '#ffb040';
          c.fillRect(x, y + 3, 4, 4);
        }
    }
  });
// 窗外：夜裡的河谷、遠方的主壩（一排燈）
const valleyTex = () =>
  tex(1024, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#04070d');
    g.addColorStop(0.6, '#0b1420');
    g.addColorStop(1, '#05080c');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    // 山的剪影
    c.fillStyle = '#020305';
    c.beginPath();
    c.moveTo(0, h * 0.62);
    for (let x = 0; x <= w; x += 32)
      c.lineTo(x, h * (0.5 + 0.12 * Math.sin(x * 0.011) + 0.06 * Math.sin(x * 0.037)));
    c.lineTo(w, h);
    c.lineTo(0, h);
    c.fill();
    // 主壩：一道橫的牆＋一排燈
    c.fillStyle = '#10161e';
    c.fillRect(w * 0.42, h * 0.56, w * 0.2, h * 0.08);
    for (let i = 0; i < 18; i++) {
      c.fillStyle = i % 5 === 0 ? '#ff6040' : '#ffd890';
      c.fillRect(w * 0.425 + i * w * 0.011, h * 0.555, 3, 3);
    }
    // 河面的反光
    c.fillStyle = 'rgba(255,210,140,0.25)';
    for (let i = 0; i < 30; i++) c.fillRect(w * 0.48 + (i % 5) * 6, h * 0.7 + i * 2, 18, 1);
  });

export function buildAethericLab() {
  const root = new THREE.Group();
  root.name = 'aethericLab';
  const std = (color, rough = 0.5, metal = 0.1, o = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...o });
  const glow = (color, k = 1) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
  const M = {
    floor: std(0xffffff, 0.35, 0.15, { map: floorTex() }),
    wall: std(0xffffff, 0.45, 0.05, { map: wallTex() }),
    ceil: std(0xb8bec4, 0.8, 0),
    white: std(0xe8ecef, 0.35, 0.15),
    steel: std(0x9aa4ae, 0.3, 0.8),
    dark: std(0x3a424a, 0.5, 0.5),
    black: std(0x14181c, 0.5, 0.4),
    cyanG: glow(0x5fe0ff, 1.8),
    coreG: glow(0xff7a30, 2.6),
    ringG: glow(0x9ff0ff, 1.6),
    glass: new THREE.MeshStandardMaterial({
      color: 0xbfe8ff,
      roughness: 0.04,
      metalness: 0.2,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    holo: new THREE.MeshBasicMaterial({
      map: holoTex(),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
    valley: new THREE.MeshBasicMaterial({ map: valleyTex() }),
  };
  const add = (geo, mat, x, y, z, ry = 0, p = root) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = m.receiveShadow = true;
    p.add(m);
    return m;
  };
  const box = (w, h, d, mat, x, y, z, ry = 0, c = 0.02, p = root) =>
    add(D.box(w, h, d, c), mat, x, y, z, ry, p);
  const cyl = (r0, r1, h, mat, x, y, z, seg = 24, p = root) =>
    add(new THREE.CylinderGeometry(r0, r1, h, seg), mat, x, y, z, 0, p);

  // ===== 房間的殼（不投射陰影）=====
  const shell = new THREE.Group();
  root.add(shell);
  box(W, 0.1, DEP, M.floor, 0, -0.05, 0, 0, 0.005, shell);
  box(W, 0.1, DEP, M.ceil, 0, H + 0.05, 0, 0, 0.005, shell);
  box(0.2, H, DEP, M.wall, -W / 2, H / 2, 0, 0, 0.01, shell);
  box(0.2, H, DEP, M.wall, W / 2, H / 2, 0, 0, 0.01, shell);
  box(W, H, 0.2, M.wall, 0, H / 2, DEP / 2, 0, 0.01, shell);
  // −Z：觀察窗（中間的大窗＋兩側的牆）
  const zw = -DEP / 2;
  box(3, H, 0.25, M.wall, -W / 2 + 1.5, H / 2, zw, 0, 0.01, shell);
  box(3, H, 0.25, M.wall, W / 2 - 1.5, H / 2, zw, 0, 0.01, shell);
  box(W - 6, 1.0, 0.25, M.wall, 0, 0.5, zw, 0, 0.01, shell);
  box(W - 6, 0.5, 0.25, M.wall, 0, H - 0.25, zw, 0, 0.01, shell);
  add(new THREE.PlaneGeometry(W - 6, H - 1.5), M.glass, 0, 1 + (H - 1.5) / 2, zw + 0.05, 0, shell);
  for (let i = 1; i < 3; i++)
    box(0.08, H - 1.5, 0.2, M.steel, -3 + i * 2, 1 + (H - 1.5) / 2, zw, 0, 0.01, shell);
  // 窗外的河谷（一張大的背景板）
  const bg = add(new THREE.PlaneGeometry(260, 65), M.valley, 0, 6, zw - 80, 0, shell);
  bg.castShadow = bg.receiveShadow = false;
  // 天花板的燈條（青色）＋地板邊的燈條
  for (let i = 0; i < 4; i++) box(W - 1, 0.05, 0.12, M.cyanG, 0, H - 0.03, -3.6 + i * 2.4, 0, 0.01, shell);
  for (const sx of [-1, 1]) box(0.06, 0.04, DEP - 0.5, M.cyanG, sx * (W / 2 - 0.15), 0.03, 0, 0, 0.01, shell);
  shell.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });

  // ===== 中央：封存艙裡的天線核心 =====
  const pod = new THREE.Group();
  pod.position.set(0, 0, -1.2);
  root.add(pod);
  cyl(1.3, 1.5, 0.5, M.dark, 0, 0.25, 0, 32, pod);
  cyl(1.15, 1.15, 0.08, M.cyanG, 0, 0.52, 0, 32, pod);
  cyl(1.3, 1.3, 0.4, M.dark, 0, 3.6, 0, 32, pod);
  add(new THREE.CylinderGeometry(1.0, 1.0, 3.0, 32, 1, true), M.glass, 0, 2.05, 0, 0, pod);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    box(0.12, 3.1, 0.12, M.steel, Math.cos(a) * 1.08, 2.05, Math.sin(a) * 1.08, 0, 0.02, pod);
  }
  // 核心（2026-11-15 重做，docs/cine-redesign-design.md 第十一節「建模」）：碟形天線拆下來的發光核心——
  // 中央的晶簇（幾根長短不一的稜柱交錯）＋外圍的晶格籠（二十面體的稜）＋天線碟的殘片（剖面旋轉的一段弧）＋
  // 螺旋的能量絲＋三圈帶刻度的環＋繞著飛的碎片；上下蓋接粗導管
  const core = new THREE.Group();
  core.position.set(0, 2.05, 0);
  pod.add(core);
  const prism = (r, h) => new THREE.CylinderGeometry(r * 0.35, r, h, 6, 1);
  const cryst = [
    [0.13, 0.95, 0, 0, 0],
    [0.09, 0.7, 0.5, 0.3, 0.12],
    [0.1, 0.75, -0.55, 1.9, -0.1],
    [0.07, 0.55, 0.9, 3.4, 0.15],
    [0.08, 0.6, -0.95, 4.6, -0.12],
    [0.06, 0.45, 1.3, 5.6, 0.2],
  ];
  for (const [r, h, tilt, yaw, dy] of cryst) {
    const m = add(prism(r, h), M.coreG, 0, dy, 0, yaw, core);
    m.rotation.z = tilt;
    m.castShadow = false;
    // 每根稜柱的兩端（尖頭）
    const tip = add(new THREE.ConeGeometry(r * 0.35, h * 0.25, 6), M.coreG, 0, dy, 0, yaw, core);
    tip.rotation.z = tilt;
    tip.translateY(h * 0.62);
    tip.castShadow = false;
  }
  // 晶格籠：二十面體的稜（細桿），半徑 0.55
  const ico = new THREE.IcosahedronGeometry(0.55, 0);
  const ep = new THREE.EdgesGeometry(ico).attributes.position;
  const cage = new THREE.Group();
  core.add(cage);
  for (let i = 0; i < ep.count; i += 2) {
    const a = new THREE.Vector3().fromBufferAttribute(ep, i),
      b = new THREE.Vector3().fromBufferAttribute(ep, i + 1);
    const L = a.distanceTo(b);
    const m = add(new THREE.CylinderGeometry(0.007, 0.007, L, 6), M.ringG, 0, 0, 0, 0, cage); // 細的發光稜（深色的桿子逆光時是黑線）
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    m.castShadow = false;
  }
  // 頂點的小節點（發光）
  const vp = ico.attributes.position;
  const seen = new Set();
  for (let i = 0; i < vp.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(vp, i);
    const k = v
      .toArray()
      .map((x) => x.toFixed(2))
      .join();
    if (seen.has(k)) continue;
    seen.add(k);
    const n = add(new THREE.SphereGeometry(0.028, 8, 6), M.ringG, v.x, v.y, v.z, 0, cage);
    n.castShadow = false;
  }
  // 天線碟的殘片：一段拋物面的弧（深色金屬，背後有肋），斜插在籠子的一側
  const dishFrag = add(
    new THREE.LatheGeometry(
      [
        [0.0, 0],
        [0.35, 0.04],
        [0.62, 0.14],
        [0.66, 0.17],
        [0.6, 0.15],
        [0.33, 0.06],
        [0.0, 0.02],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      16,
      0.4,
      1.6,
    ),
    M.dark,
    0.15,
    -0.1,
    -0.25,
    0,
    core,
  );
  dishFrag.rotation.set(-1.1, 0.5, 0.3);
  dishFrag.scale.setScalar(0.55);
  dishFrag.position.set(0.25, -0.35, -0.35);
  // 螺旋的能量絲（三條，繞著晶簇）
  const fil = [];
  for (let k = 0; k < 3; k++) {
    const pts = [];
    for (let i = 0; i <= 48; i++) {
      const u = i / 48,
        a = u * Math.PI * 4 + (k * Math.PI * 2) / 3;
      const r = 0.32 + Math.sin(u * Math.PI) * 0.12;
      pts.push(new THREE.Vector3(Math.cos(a) * r, -0.6 + u * 1.2, Math.sin(a) * r));
    }
    const m = add(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 64, 0.008, 5),
      M.cyanG,
      0,
      0,
      0,
      0,
      core,
    );
    m.castShadow = false;
    fil.push(m);
  }
  // 三圈環（每圈帶刻度塊），各自轉
  const rings = [];
  for (const [r, tilt, n] of [
    [0.78, 0.5, 12],
    [0.9, -0.9, 16],
    [0.68, 1.4, 8],
  ]) {
    const ring = new THREE.Group();
    ring.position.set(0, 2.05, 0);
    ring.rotation.x = tilt;
    pod.add(ring);
    const t = add(new THREE.TorusGeometry(r, 0.018, 8, 72), M.ringG, 0, 0, 0, 0, ring);
    t.castShadow = false;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const b = add(
        new THREE.BoxGeometry(0.05, 0.035, 0.035),
        M.steel,
        Math.cos(a) * r,
        Math.sin(a) * r,
        0,
        0,
        ring,
      );
      b.rotation.z = a;
      b.castShadow = false;
    }
    rings.push(ring);
  }
  // 繞著飛的碎片（天線的小零件）
  const debris = new THREE.Group();
  debris.position.set(0, 2.05, 0);
  pod.add(debris);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2,
      r = 0.72 + (i % 3) * 0.08;
    const d = add(
      new THREE.BoxGeometry(0.06 + (i % 2) * 0.04, 0.02, 0.05),
      i % 3 ? M.steel : M.dark,
      Math.cos(a) * r,
      Math.sin(i * 1.7) * 0.4,
      Math.sin(a) * r,
      a,
      debris,
    );
    d.rotation.x = i;
    d.castShadow = false;
  }
  // 上下蓋接到核心的粗導管（四根，彎曲的管）＋蓋上的螺栓圈
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    for (const sy of [-1, 1]) {
      const pts = [
        new THREE.Vector3(Math.cos(a) * 0.85, 2.05 + sy * 1.45, Math.sin(a) * 0.85),
        new THREE.Vector3(Math.cos(a) * 0.75, 2.05 + sy * 1.0, Math.sin(a) * 0.75),
        new THREE.Vector3(Math.cos(a) * 0.45, 2.05 + sy * 0.75, Math.sin(a) * 0.45),
      ];
      const m = add(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.045, 8),
        M.black,
        0,
        0,
        0,
        0,
        pod,
      );
      m.castShadow = false;
    }
  }
  for (const y of [0.56, 3.38])
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      cyl(0.025, 0.025, 0.04, M.steel, Math.cos(a) * 1.22, y, Math.sin(a) * 1.22, 8, pod);
    }
  // 地上的纜線（往四個方向）
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const c = box(2.4, 0.08, 0.18, M.black, Math.cos(a) * 2.6, 0.04, Math.sin(a) * 2.6, -a, 0.02, pod);
    c.castShadow = false;
  }

  // ===== +X：伺服器機櫃 =====
  const rackMats = [0, 1, 2].map((k) =>
    std(0xffffff, 0.5, 0.3, {
      map: rackTex(40 + k),
      emissive: 0xffffff,
      emissiveMap: rackTex(40 + k),
      emissiveIntensity: 0.9,
    }),
  );
  for (let i = 0; i < 6; i++) {
    const z = -3.4 + i * 1.0;
    box(0.9, 2.4, 0.9, M.dark, W / 2 - 0.65, 1.2, z, 0, 0.02);
    add(new THREE.PlaneGeometry(0.8, 2.2), rackMats[i % 3], W / 2 - 1.11, 1.2, z, -Math.PI / 2);
  }
  // ===== −X：全像桌與機械臂 =====
  const tbl = new THREE.Group();
  tbl.position.set(-3.6, 0, 0.6);
  root.add(tbl);
  box(2.2, 0.9, 1.2, M.white, 0, 0.45, 0, 0, 0.05, tbl);
  box(2.0, 0.04, 1.0, M.cyanG, 0, 0.92, 0, 0, 0.01, tbl);
  const holo = add(new THREE.PlaneGeometry(2.0, 1.0), M.holo, 0, 1.6, 0, Math.PI / 2 + 0.35, tbl);
  holo.castShadow = false;
  const arm = new THREE.Group();
  arm.position.set(-4.6, 0, -2.6);
  root.add(arm);
  cyl(0.35, 0.4, 0.3, M.dark, 0, 0.15, 0, 20, arm);
  const a1 = new THREE.Group();
  a1.position.y = 0.3;
  arm.add(a1);
  box(0.25, 1.6, 0.25, M.white, 0, 0.8, 0, 0, 0.04, a1).rotation.z = 0.3;
  const a2 = box(0.2, 1.3, 0.2, M.white, 0.75, 1.9, 0, 0, 0.04, a1);
  a2.rotation.z = -1.0;
  add(new THREE.SphereGeometry(0.08, 10, 8), M.cyanG, 1.3, 2.25, 0, 0, a1);
  // 椅子與工作站（窗邊）
  for (const x of [-2.2, 2.2]) {
    box(1.4, 0.06, 0.6, M.white, x, 0.75, -3.9, 0, 0.02);
    box(0.06, 0.75, 0.5, M.steel, x - 0.65, 0.375, -3.9, 0, 0.01);
    box(0.06, 0.75, 0.5, M.steel, x + 0.65, 0.375, -3.9, 0, 0.01);
    box(0.7, 0.42, 0.03, M.black, x, 1.05, -4.1, 0, 0.01);
    add(new THREE.PlaneGeometry(0.66, 0.38), M.holo, x, 1.05, -4.08, 0);
  }
  root.userData.lab = { core, rings, holo, a1, debris, fil };
  // 細節層（天花板、牆面、地板、封存艙的零件、實驗台、白板、樣本櫃、門與置物櫃；cine-lab-detail.js，自己合併烘焙）
  root.add(buildLabDetail());
  // 不透明的靜態零件合併烘焙（核心、環、全像、機械臂會動，不合併）
  return bakeStatic(root, [core, ...rings, debris, holo, a1, root.children[root.children.length - 1]]);
}

// 每格：核心脈動、環轉動、全像閃爍、機械臂慢慢擺
export function tickAethericLab(root, t) {
  const L = root.userData.lab;
  if (!L) return;
  const k = 1 + Math.sin(t * 2.4) * 0.05;
  L.core.scale.setScalar(k);
  L.core.rotation.y = t * 0.35;
  L.rings[0].rotation.z = t * 0.9;
  L.rings[1].rotation.z = -t * 0.7;
  if (L.rings[2]) L.rings[2].rotation.z = t * 1.3;
  if (L.debris) {
    L.debris.rotation.y = -t * 0.5;
    L.debris.position.y = 2.05 + Math.sin(t * 0.8) * 0.05;
  }
  // 能量絲閃爍
  if (L.fil) for (let i = 0; i < L.fil.length; i++) L.fil[i].visible = Math.sin(t * 7 + i * 2.1) > -0.6;
  L.holo.material.opacity = 0.75 + Math.sin(t * 9) * 0.05 + (Math.sin(t * 31) > 0.97 ? -0.4 : 0);
  L.a1.rotation.y = Math.sin(t * 0.3) * 0.6;
}
