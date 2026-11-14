// 過場的室內：霍斯特（卡斯特隆重工）的辦公室（3D 動畫化，docs/cine-redesign-design.md 第十節）。
// 全部程式模型（不載外部素材）；座標是公尺，原點＝地板中央，−Z 是整面的落地窗（窗外是夜裡的工業城市與煉油廠的燃燒塔），
// 辦公桌在窗前（霍斯特站在桌子前面、面向 +Z＝鏡頭），+X 牆是資料櫃與礦石樣本，−X 牆是地形圖的螢幕與沙發。
// 光源只用場景原本的太陽／半球光（game/cine.js 的 room 場景照參數設），檯燈、螢幕、嵌燈、窗外的燈都是發光材質（不加點光源，
// 否則整個場景的著色器要重新編譯，game/cine-prep.js）。
import { D } from './detail.js';
import { bakeStatic } from './cine-kit.js';

const W = 10, // 寬（X）
  DEP = 8, // 深（Z）
  H = 3.4; // 高

// ---------- 貼圖（canvas）----------
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
// 固定的亂數（模型每次一樣）
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
// 木紋（深色的胡桃木）
const woodTex = () =>
  tex(
    512,
    512,
    (c, w, h) => {
      c.fillStyle = '#7a5038';
      c.fillRect(0, 0, w, h);
      const R = rng(7);
      for (let i = 0; i < 90; i++) {
        c.strokeStyle = `rgba(${R() < 0.5 ? '20,10,6' : '90,58,36'},${0.15 + R() * 0.25})`;
        c.lineWidth = 1 + R() * 3;
        c.beginPath();
        const y = R() * h;
        c.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) c.lineTo(x, y + Math.sin(x * 0.02 + i) * 6 * R());
        c.stroke();
      }
    },
    [2, 2],
  );
// 地板：深色的木地板條
const floorTex = () =>
  tex(
    512,
    512,
    (c, w, h) => {
      const R = rng(3);
      for (let i = 0; i < 8; i++) {
        const v = 92 + R() * 26;
        c.fillStyle = `rgb(${v + 8},${v},${v - 6})`;
        c.fillRect(0, (i * h) / 8, w, h / 8);
        c.fillStyle = 'rgba(0,0,0,0.5)';
        c.fillRect(0, (i * h) / 8, w, 2);
        const off = R() * w;
        c.fillRect(off, (i * h) / 8, 2, h / 8);
      }
    },
    [4, 3],
  );
// 窗外大樓的窗格（亮燈的隨機分布）
const cityTex = (seed) =>
  tex(256, 512, (c, w, h) => {
    c.fillStyle = '#0a0d14';
    c.fillRect(0, 0, w, h);
    const R = rng(seed);
    for (let y = 8; y < h - 4; y += 12)
      for (let x = 6; x < w - 4; x += 10) {
        const r = R();
        if (r < 0.32) {
          c.fillStyle = r < 0.05 ? '#9fd8ff' : r < 0.2 ? '#ffc070' : '#ffe2a8';
          c.globalAlpha = 0.5 + R() * 0.5;
          c.fillRect(x, y, 6, 7);
        }
      }
    c.globalAlpha = 1;
  });
// 地形圖的螢幕（荒野與礦坑的等高線、紅點＝陣地）
const mapTex = () =>
  tex(512, 320, (c, w, h) => {
    c.fillStyle = '#061018';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(90,200,255,0.55)';
    for (let k = 0; k < 14; k++) {
      c.beginPath();
      for (let a = 0; a <= 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        const r = 20 + k * 11 + Math.sin(t * 3 + k) * 8 + Math.sin(t * 5 - k * 0.7) * 5;
        const x = w * 0.58 + Math.cos(t) * r * 1.5,
          y = h * 0.5 + Math.sin(t) * r;
        if (a) c.lineTo(x, y);
        else c.moveTo(x, y);
      }
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,170,80,0.8)';
    c.setLineDash([6, 5]);
    c.beginPath();
    c.moveTo(40, h - 40);
    c.lineTo(w * 0.42, h * 0.62);
    c.lineTo(w * 0.62, h * 0.42);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#ff3a2a';
    c.beginPath();
    c.arc(w * 0.62, h * 0.42, 7, 0, Math.PI * 2);
    c.fill();
    c.font = 'bold 18px monospace';
    c.fillStyle = '#9fe0ff';
    c.fillText('SOUTHERN WASTES / SECTOR 07', 16, 26);
    c.fillStyle = '#ff6a50';
    c.fillText('BASTILLE  ▲', w * 0.62 + 12, h * 0.42 - 8);
  });
// 終端機的畫面
const screenTex = () =>
  tex(256, 160, (c, w, h) => {
    c.fillStyle = '#081420';
    c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(120,210,255,0.85)';
    c.font = '11px monospace';
    const L = [
      'CASTRON HEAVY IND.',
      'SUPPLY LINE 03 ... LOST',
      'CONVOY C-12 ... NO SIGNAL',
      'ASSET: BASTILLE',
      'STATUS: ACTIVE ?',
    ];
    L.forEach((s, i) => {
      c.fillStyle = i >= 1 && i <= 2 ? '#ff7a5a' : 'rgba(120,210,255,0.85)';
      c.fillText(s, 10, 22 + i * 18);
    });
    c.fillStyle = 'rgba(120,210,255,0.3)';
    for (let i = 0; i < 20; i++) c.fillRect(10 + i * 11, h - 20 - ((i * 37) % 30), 7, (i * 37) % 30);
  });
// 舊的礦工合照（褪色的棕褐色、一排人的剪影）
const photoTex = () =>
  tex(256, 180, (c, w, h) => {
    c.fillStyle = '#c9b48c';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#8a7350';
    c.fillRect(0, h * 0.62, w, h * 0.38);
    const R = rng(11);
    for (let i = 0; i < 7; i++) {
      const x = 22 + i * 33 + R() * 6,
        s = 0.85 + R() * 0.25;
      c.fillStyle = '#4a3a26';
      c.beginPath();
      c.arc(x, h * 0.42, 10 * s, 0, Math.PI * 2);
      c.fill();
      c.fillRect(x - 13 * s, h * 0.5, 26 * s, h * 0.45);
      c.fillStyle = '#d8a030';
      c.fillRect(x - 11 * s, h * 0.34, 22 * s, 6); // 礦工頭盔
    }
    c.fillStyle = 'rgba(60,40,20,0.35)';
    c.fillRect(0, 0, w, h);
  });
// 卡斯特隆的標誌
const logoTex = () =>
  tex(512, 256, (c, w, h) => {
    c.fillStyle = '#16120e';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#d8903a';
    c.lineWidth = 18;
    c.beginPath();
    c.arc(130, 128, 70, Math.PI * 0.25, Math.PI * 1.75);
    c.stroke();
    c.fillStyle = '#d8903a';
    c.font = 'bold 64px "Chakra Petch", sans-serif';
    c.fillText('CASTRON', 220, 140);
    c.font = '24px "Chakra Petch", sans-serif';
    c.fillStyle = '#a07040';
    c.fillText('HEAVY INDUSTRIES', 222, 180);
  });
// 藍圖（鑽探機）
const blueprintTex = () =>
  tex(256, 192, (c, w, h) => {
    c.fillStyle = '#123a5c';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(200,230,255,0.25)';
    for (let x = 0; x < w; x += 16) c.strokeRect(x, 0, 0.5, h);
    for (let y = 0; y < h; y += 16) c.strokeRect(0, y, w, 0.5);
    c.strokeStyle = 'rgba(230,245,255,0.85)';
    c.lineWidth = 2;
    c.strokeRect(60, 70, 120, 60);
    c.beginPath();
    c.moveTo(180, 100);
    c.lineTo(230, 100);
    c.lineTo(240, 92);
    c.moveTo(80, 130);
    c.arc(80, 140, 12, 0, Math.PI * 2);
    c.moveTo(172, 140);
    c.arc(160, 140, 12, 0, Math.PI * 2);
    c.stroke();
  });

// ---------- 模型 ----------
export function buildCastronOffice() {
  const root = new THREE.Group();
  root.name = 'castronOffice';
  const std = (color, rough = 0.6, metal = 0.1, o = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...o });
  const glow = (color, k = 1) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k) });
  const M = {
    floor: std(0xffffff, 0.55, 0.05, { map: floorTex() }),
    wall: std(0x8a8278, 0.85, 0.05),
    wallP: std(0xa08a72, 0.65, 0.1),
    ceil: std(0x5a5650, 0.9, 0),
    wood: std(0xffffff, 0.45, 0.05, { map: woodTex() }),
    steel: std(0x6c727a, 0.4, 0.75),
    dark: std(0x3a3e44, 0.6, 0.5),
    black: std(0x0a0a0b, 0.6, 0.2),
    leather: std(0x6a3a24, 0.6, 0.05),
    brass: std(0xb08848, 0.35, 0.85),
    orange: std(0xd8903a, 0.6, 0.2),
    paper: std(0xe8e2d4, 0.9, 0),
    rock: std(0x7a5a3a, 0.9, 0.05, { flatShading: true }),
    ore: std(0x4a6a8a, 0.35, 0.6, { flatShading: true }),
    plant: std(0x2f4a28, 0.8, 0),
    pot: std(0x2a2a2c, 0.5, 0.3),
    glass: new THREE.MeshStandardMaterial({
      color: 0x9fc8e8,
      roughness: 0.05,
      metalness: 0.3,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    }),
    lampG: glow(0xffd090, 2.2),
    ledG: glow(0xffe0b0, 1.6),
    mapG: new THREE.MeshBasicMaterial({ map: mapTex() }),
    scrG: new THREE.MeshBasicMaterial({ map: screenTex() }),
    photo: std(0xffffff, 0.8, 0, { map: photoTex() }),
    logo: std(0xffffff, 0.5, 0.2, { map: logoTex(), emissive: 0x2a1a0a }),
    blue: std(0xffffff, 0.8, 0, { map: blueprintTex() }),
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
  const cyl = (r0, r1, h, mat, x, y, z, seg = 16, p = root) =>
    add(new THREE.CylinderGeometry(r0, r1, h, seg), mat, x, y, z, 0, p);

  // ===== 房間（殼：只接收陰影、不投射——天花板與牆會把主光整個擋掉）=====
  box(W, 0.1, DEP, M.floor, 0, -0.05, 0, 0, 0.005);
  box(W, 0.1, DEP, M.ceil, 0, H + 0.05, 0, 0, 0.005);
  box(0.2, H, DEP, M.wall, -W / 2, H / 2, 0, 0, 0.01); // −X
  box(0.2, H, DEP, M.wall, W / 2, H / 2, 0, 0, 0.01); // +X
  box(W, H, 0.2, M.wall, 0, H / 2, DEP / 2, 0, 0.01); // +Z（鏡頭背後）
  // 牆板（直條）與踢腳
  for (const sx of [-1, 1])
    for (let i = 0; i < 7; i++)
      box(0.04, H - 0.5, 0.9, M.wallP, sx * (W / 2 - 0.12), H / 2 + 0.1, -DEP / 2 + 0.8 + i * 1.05, 0, 0.01);
  // 天花板的嵌燈（發光）＋橫樑
  for (let i = 0; i < 3; i++) {
    box(W - 0.4, 0.22, 0.3, M.dark, 0, H - 0.11, -2.5 + i * 2.5, 0, 0.02);
    for (const x of [-3, 0, 3])
      add(new THREE.CircleGeometry(0.16, 20), M.ledG, x, H - 0.005, -1.25 + i * 2.5).rotation.x = Math.PI / 2;
  }
  // ===== 落地窗（−Z）：窗框、玻璃、腰下的金屬板 =====
  const zw = -DEP / 2;
  box(W, 0.45, 0.25, M.dark, 0, 0.22, zw, 0, 0.02);
  box(W, 0.18, 0.3, M.dark, 0, H - 0.09, zw, 0, 0.02);
  for (let i = 0; i <= 5; i++) box(0.09, H, 0.22, M.steel, -W / 2 + (i * W) / 5, H / 2, zw, 0, 0.01);
  box(W, 0.06, 0.18, M.steel, 0, 2.2, zw, 0, 0.01);
  add(new THREE.PlaneGeometry(W, H), M.glass, 0, H / 2, zw + 0.02);
  // 百葉窗（右邊兩格半拉下來）
  for (let i = 0; i < 22; i++) box(3.9, 0.012, 0.07, M.steel, 2.95, H - 0.3 - i * 0.07, zw + 0.25, 0, 0.004);

  root.traverse((o) => {
    if (o.isMesh) o.castShadow = false;
  });
  // ===== 窗外：夜裡的工業城市（大樓的窗格發光）＋煉油廠的燃燒塔 =====
  const out = new THREE.Group();
  root.add(out);
  const R = rng(21);
  const cityMats = [0, 1, 2, 3].map((k) => {
    const t = cityTex(31 + k);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshBasicMaterial({ map: t, color: 0xb0b0b0 });
  });
  for (let i = 0; i < 60; i++) {
    const d = 40 + R() * 160,
      a = (R() - 0.5) * 1.9;
    const w = 8 + R() * 20,
      h = 10 + R() * (d > 120 ? 70 : 45);
    // 窗格約 2.5 m 一格：依大樓的大小放大貼圖座標（貼圖一張是 25×42 格）
    const g = new THREE.BoxGeometry(w, h, w);
    const uv = g.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, uv.getX(j) * (w / 60), uv.getY(j) * (h / 100));
    const m = new THREE.Mesh(g, cityMats[i % 4]);
    m.position.set(Math.sin(a) * d, h / 2 - 25, zw - Math.cos(a) * d);
    out.add(m);
  }
  // 地平線的城市光暈
  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 60),
    new THREE.MeshBasicMaterial({ color: 0x3a2214, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  haze.position.set(0, -2, zw - 210);
  out.add(haze);
  // 燃燒塔（遠處的煉油廠）：細長的塔＋火焰（發光）
  for (const [x, z, h] of [
    [-70, -140, 55],
    [-55, -150, 48],
  ]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.4, h, 8), M.black);
    t.position.set(x, h / 2 - 25, z);
    out.add(t);
    const f = new THREE.Mesh(new THREE.ConeGeometry(1.6, 6, 8), glow(0xff8a30, 2));
    f.position.set(x, h - 25 + 3, z);
    out.add(f);
  }
  root.userData.flames = out.children.filter((o) => o.geometry && o.geometry.type === 'ConeGeometry');

  // ===== 窗外的機甲停機坪（低一層，y −4）：甲板、邊緣燈、探照燈塔、半座吊臂；具名 AC 停在上面（劇本的模型演員）=====
  const pad = new THREE.Group();
  root.add(pad);
  const PY = -4; // 甲板的頂面
  box(22, 0.6, 18, std(0x4a4e54, 0.7, 0.4), 0, PY - 0.3, -15, 0, 0.05, pad);
  // 甲板的標線（黃色的 H 與外框）
  const lineM = std(0xd8a030, 0.6, 0.1, { emissive: 0x3a2808 });
  for (const [w, d, x, z] of [
    [0.3, 6, -2, -14],
    [0.3, 6, 2, -14],
    [4, 0.3, 0, -14],
    [12, 0.15, 0, -9],
    [12, 0.15, 0, -19],
    [0.15, 10, -6, -14],
    [0.15, 10, 6, -14],
  ])
    box(w, 0.02, d, lineM, x, PY + 0.01, z, 0, 0.005, pad);
  // 邊緣的燈（發光）
  const padG = glow(0xff9a40, 1.6);
  for (let i = 0; i < 9; i++)
    for (const [x, z] of [
      [-10.6 + i * 2.65, -6.3],
      [-10.6 + i * 2.65, -23.7],
    ])
      add(new THREE.SphereGeometry(0.12, 8, 6), padG, x, PY + 0.15, z, 0, pad);
  // 探照燈塔（兩座，燈頭朝著機體）
  for (const sx of [-1, 1]) {
    const x = sx * 9.5;
    box(0.4, 9, 0.4, M.steel, x, PY + 4.5, -21, 0, 0.03, pad);
    const head = box(1.2, 0.7, 0.6, M.dark, x - sx * 0.3, PY + 9, -20.6, sx * 0.6, 0.05, pad);
    add(new THREE.PlaneGeometry(1.0, 0.5), glow(0xfff0d0, 2.4), x - sx * 0.6, PY + 9, -20.25, sx * 0.6, pad);
    void head;
  }
  // 半座吊臂（停機坪邊的維修吊臂）
  const crane = new THREE.Group();
  crane.position.set(-8, PY, -11);
  pad.add(crane);
  box(0.6, 12, 0.6, std(0xc8902a, 0.6, 0.3), 0, 6, 0, 0, 0.04, crane);
  const boom = box(8, 0.5, 0.5, std(0xc8902a, 0.6, 0.3), 3.6, 11.6, 0, 0, 0.04, crane);
  boom.rotation.z = -0.08;
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4, 6), M.steel);
  hook.position.set(7, 9.4, 0);
  crane.add(hook);
  pad.traverse((o) => {
    if (o.isMesh) o.castShadow = o.receiveShadow = true;
  });

  // ===== 辦公桌（窗前，霍斯特在桌子前面）=====
  const desk = new THREE.Group();
  desk.position.set(0, 0, -2.3);
  root.add(desk);
  box(2.6, 0.07, 1.1, M.wood, 0, 0.76, 0, 0, 0.015, desk);
  box(2.5, 0.68, 0.06, M.wood, 0, 0.38, 0.5, 0, 0.01, desk); // 正面的擋板
  for (const sx of [-1, 1]) box(0.06, 0.72, 1.0, M.steel, sx * 1.2, 0.36, 0, 0, 0.01, desk);
  box(0.5, 0.6, 0.9, M.wood, -0.95, 0.31, -0.05, 0, 0.01, desk); // 抽屜櫃
  for (let i = 0; i < 3; i++) box(0.04, 0.02, 0.18, M.brass, -0.95, 0.15 + i * 0.2, 0.42, 0, 0.005, desk);
  // 終端機（兩個螢幕）
  for (const [x, r] of [
    [0.35, -0.2],
    [0.95, -0.55],
  ]) {
    const g = new THREE.Group();
    g.position.set(x, 0.8, -0.25);
    g.rotation.y = r;
    desk.add(g);
    box(0.62, 0.38, 0.03, M.black, 0, 0.34, 0, 0, 0.01, g);
    add(new THREE.PlaneGeometry(0.58, 0.34), M.scrG, 0, 0.34, 0.017, 0, g);
    box(0.05, 0.16, 0.05, M.steel, 0, 0.1, -0.03, 0, 0.01, g);
    box(0.24, 0.015, 0.16, M.steel, 0, 0.01, -0.03, 0, 0.005, g);
  }
  box(0.45, 0.02, 0.15, M.dark, 0.5, 0.805, 0.2, 0, 0.005, desk); // 鍵盤
  // 檯燈（彎臂、發光的燈罩）
  const lamp = new THREE.Group();
  lamp.position.set(-0.85, 0.8, -0.2);
  desk.add(lamp);
  cyl(0.11, 0.13, 0.03, M.brass, 0, 0.015, 0, 20, lamp);
  const arm = add(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 8), M.brass, 0.08, 0.26, 0, 0, lamp);
  arm.rotation.z = -0.35;
  const shade = add(new THREE.ConeGeometry(0.14, 0.16, 20, 1, true), M.orange, 0.2, 0.48, 0.05, 0, lamp);
  shade.rotation.z = -0.5;
  add(new THREE.SphereGeometry(0.045, 12, 8), M.lampG, 0.21, 0.43, 0.05, 0, lamp);
  // 文件、合照、礦工頭盔、咖啡杯
  for (let i = 0; i < 4; i++) {
    const p = box(
      0.3,
      0.004,
      0.42,
      M.paper,
      -0.25 + i * 0.06,
      0.8 + i * 0.004,
      0.18,
      0.1 * i - 0.15,
      0.001,
      desk,
    );
    p.castShadow = false;
  }
  const frame = new THREE.Group();
  frame.position.set(-0.45, 0.8, -0.35);
  frame.rotation.y = 0.35;
  desk.add(frame);
  box(0.3, 0.22, 0.02, M.wood, 0, 0.12, 0, 0, 0.004, frame);
  add(new THREE.PlaneGeometry(0.26, 0.18), M.photo, 0, 0.12, 0.012, 0, frame);
  box(0.03, 0.2, 0.08, M.wood, 0, 0.09, -0.05, 0, 0.003, frame).rotation.x = -0.3;
  const helm = new THREE.Group();
  helm.position.set(-0.05, 0.8, -0.3);
  helm.rotation.y = -0.6;
  desk.add(helm);
  const shell = add(
    new THREE.SphereGeometry(0.16, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    std(0xd8a030, 0.5, 0.2),
    0,
    0.02,
    0,
    0,
    helm,
  );
  shell.scale.set(1, 0.85, 1.15);
  box(0.36, 0.015, 0.42, std(0xc08a28, 0.5, 0.2), 0, 0.02, 0.02, 0, 0.005, helm);
  cyl(0.035, 0.035, 0.04, M.lampG, 0, 0.12, 0.16, 12, helm).rotation.x = Math.PI / 2; // 頭燈
  const cup = cyl(0.04, 0.035, 0.1, std(0xeeeeee, 0.4, 0), 0.75, 0.85, 0.25, 16, desk);
  cup.castShadow = false;
  // 辦公椅（桌子後面）
  const chair = new THREE.Group();
  chair.position.set(0, 0, -3.15);
  chair.rotation.y = Math.PI + 0.25;
  root.add(chair);
  box(0.6, 0.12, 0.55, M.leather, 0, 0.5, 0, 0, 0.04, chair);
  box(0.6, 0.85, 0.12, M.leather, 0, 1.0, 0.27, 0, 0.05, chair);
  cyl(0.04, 0.04, 0.4, M.steel, 0, 0.25, 0, 10, chair);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    box(0.32, 0.04, 0.05, M.steel, Math.cos(a) * 0.16, 0.05, Math.sin(a) * 0.16, -a, 0.01, chair);
  }

  // ===== +X 牆：資料櫃、礦石樣本、鑽探機模型、卡斯特隆的標誌 =====
  const xs = W / 2 - 0.45;
  for (let k = 0; k < 3; k++) {
    const z = -1.6 + k * 1.15;
    box(0.55, 2.2, 1.05, M.wood, xs, 1.1, z, 0, 0.02);
    for (let s = 0; s < 4; s++) {
      box(0.5, 0.03, 1.0, M.wood, xs - 0.02, 0.35 + s * 0.52, z, 0, 0.005);
      // 檔案夾
      for (let b = 0; b < 7; b++) {
        if ((b + s + k) % 4 === 3) continue;
        box(
          0.32,
          0.36,
          0.07,
          std([0x2a3a4a, 0x4a2a1a, 0x3a3a3a][(b + s) % 3], 0.8, 0),
          xs - 0.06,
          0.55 + s * 0.52,
          z - 0.4 + b * 0.12,
          0,
          0.005,
        );
      }
    }
  }
  // 礦石樣本（展示台上）
  const R2 = rng(5);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 + R2() * 0.05, 0), i % 2 ? M.ore : M.rock);
    g.position.set(xs - 0.05, 2.32, -2.2 + i * 0.22);
    g.rotation.set(R2() * 3, R2() * 3, R2() * 3);
    g.castShadow = true;
    root.add(g);
  }
  // 牆上的標誌（窗邊的 +X 牆，正對鏡頭的斜面也看得到）
  add(new THREE.PlaneGeometry(1.6, 0.8), M.logo, W / 2 - 0.1, 2.75, 1.3, -Math.PI / 2);
  // 鑽探機的模型（展示台）
  const rig = new THREE.Group();
  rig.position.set(W / 2 - 1.1, 0, 2.6);
  root.add(rig);
  box(0.7, 0.9, 0.7, M.dark, 0, 0.45, 0, 0, 0.02, rig);
  add(new THREE.BoxGeometry(0.62, 0.5, 0.62), M.glass, 0, 1.15, 0, 0, rig);
  box(0.36, 0.12, 0.22, M.orange, 0, 0.98, 0, 0, 0.01, rig);
  const drill = add(new THREE.ConeGeometry(0.05, 0.3, 10), M.steel, 0.2, 1.0, 0, 0, rig);
  drill.rotation.z = -Math.PI / 2;
  for (const sx of [-1, 1]) box(0.08, 0.06, 0.26, M.black, -0.08, 0.93, sx * 0.08, 0, 0.01, rig);

  // ===== −X 牆：地形圖的螢幕、藍圖、沙發與茶几、盆栽 =====
  const scr = new THREE.Group();
  scr.position.set(-W / 2 + 0.15, 1.75, -0.6);
  scr.rotation.y = Math.PI / 2;
  root.add(scr);
  box(2.3, 1.45, 0.06, M.black, 0, 0, 0, 0, 0.01, scr);
  add(new THREE.PlaneGeometry(2.2, 1.35), M.mapG, 0, 0, 0.035, 0, scr);
  add(new THREE.PlaneGeometry(0.9, 0.68), M.blue, -W / 2 + 0.12, 1.8, 1.6, Math.PI / 2);
  const sofa = new THREE.Group();
  sofa.position.set(-W / 2 + 0.8, 0, 2.2);
  sofa.rotation.y = Math.PI / 2;
  root.add(sofa);
  box(2.0, 0.42, 0.85, M.leather, 0, 0.25, 0, 0, 0.08, sofa);
  box(2.0, 0.55, 0.22, M.leather, 0, 0.62, -0.32, 0, 0.08, sofa);
  for (const sx of [-1, 1]) box(0.2, 0.55, 0.85, M.leather, sx * 1.0, 0.4, 0, 0, 0.07, sofa);
  box(1.0, 0.04, 0.55, M.wood, -W / 2 + 1.9, 0.42, 2.2, 0, 0.01);
  for (const [dx, dz] of [
    [-0.42, -0.22],
    [0.42, -0.22],
    [-0.42, 0.22],
    [0.42, 0.22],
  ])
    box(0.04, 0.4, 0.04, M.steel, -W / 2 + 1.9 + dx, 0.2, 2.2 + dz, 0, 0.005);
  // 盆栽（窗邊的兩個角落）
  for (const x of [-W / 2 + 0.6, W / 2 - 1.3]) {
    cyl(0.22, 0.17, 0.45, M.pot, x, 0.22, zw + 0.6, 16);
    for (let i = 0; i < 9; i++) {
      const l = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.7 + (i % 3) * 0.2, 5), M.plant);
      const a = (i / 9) * Math.PI * 2;
      l.position.set(x + Math.cos(a) * 0.08, 0.75, zw + 0.6 + Math.sin(a) * 0.08);
      l.rotation.set(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5);
      l.castShadow = true;
      root.add(l);
    }
  }
  // 窗邊的地毯
  box(3.6, 0.01, 2.6, std(0x7a4430, 0.95, 0), 0, 0.005, -1.4, 0, 0.002);
  // 不透明的靜態零件合併烘焙（遮蔽、凸邊、髒污；窗外的火焰會動但是 MeshBasic，本來就不合併）
  return bakeStatic(root);
}

// 每格：燃燒塔的火焰跳動
export function tickCastronOffice(root, t) {
  const F = root.userData.flames || [];
  F.forEach((f, i) => {
    const k = 1 + Math.sin(t * 7 + i * 2) * 0.12 + Math.sin(t * 17 + i) * 0.06;
    f.scale.set(1, k, 1);
  });
}
