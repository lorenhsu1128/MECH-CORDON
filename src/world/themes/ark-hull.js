// 移動要塞「方舟」的船體（docs/ark-redesign.md）：星際大戰帝國艦風格的巨艦表面——
// 地圖是船身的一段（艦首往 −Z），甲板分好幾層：舷側甲板 −10、主甲板 0、中央脊／高台 +15、上層建築 +30，
// 另有凹下的維修井 −8 與側舷的壕溝 −26；上層甲板（addDeck，可以從下面走過）與坡道連接各層，船邊外是虛空。
//
// 做法：
// - 各層是地形高度圖（planTerrain 回傳的函式；矩形依序蓋上去，後蓋的優先），格子 5 m、不平滑（theme.noSmooth），
//   所以每一層的邊緣只有一格寬的斜面。這一格做成不可破壞的牆（沒有 group 的方塊障礙物：站得上去、擋得住）。
// - 外觀不用地形網格：平的格子依高度合併成矩形，蓋上甲板貼圖（死星表面的面板明暗交錯）；牆、船側蓋上艦壁貼圖
//   （窗燈、橫帶、肋條）。全部合併成少數幾個網格（甲板、牆、船側各一個），小零件依區域（3×3）合併。
// - 版面（各層的矩形、坡道、上層甲板、大型結構的位置）用地圖的亂數（withRng 裡的 rnd）；
//   純外觀的小零件、明暗用自己的亂數串（makeRng），不影響地圖與物件的位置（作戰室的全像戰略桌只取樣到物件為止）。
import { RNG, clamp, makeRng, rnd } from '../../core/math.js';
import { WS } from '../../core/scale.js';
import { PK, fadeMat, mat, hashRng } from './kit.js';

const G = WS;
const SN = 5; // 版面對齊地形格子（World 的 CELL）
const snap = (v) => Math.round(v / SN) * SN;
// 各層的高度（公尺，現實尺寸）
export const LV = { gun: -10, deck: 0, pit: -8, trench: -26, spine: 15, super: 30, deep: -150 };
// 虛空（主題的 void，乘 G 之前）：−30 m 以下是虛空，船側的拉回照洋上都市
export const ARK_VOID = { y: -10, fall: -13, fallP: -20, ref: 0 };
const VOID_Y = ARK_VOID.y * G;
const HULL_BOT = -140; // 船側往下到哪裡（之下是遠方的地表）
const TP = 30; // 甲板貼圖一張的公尺數（也是明暗交錯的區塊大小）
const TW = 30; // 艦壁貼圖一張的公尺數

// ---------- 貼圖（canvas，依參數快取；各端一樣：hashRng） ----------
const TEX = {};
function canvasTex(key, size, draw) {
  if (TEX[key]) return TEX[key];
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return (TEX[key] = t);
}
// 甲板：遞迴切分的面板（明暗不同）、凹下的面板、格柵、艙口、面板縫；四邊都有縫，所以接起來看不出接縫
function drawPlate(c, S, emi) {
  const r = hashRng(9173);
  c.fillStyle = emi ? '#000' : '#b4b7ba';
  c.fillRect(0, 0, S, S);
  const leaf = (x, y, w, h) => {
    if (emi) {
      if (r() < 0.06 && w > 20) {
        c.fillStyle = r() < 0.7 ? '#ffd9a0' : '#ff4a30';
        c.fillRect(x + w / 2 - 1, y + h / 2 - 1, 2, 2);
      }
      return;
    }
    const v = 158 + Math.floor(r() * 50);
    c.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
    c.fillRect(x, y, w, h);
    const q = r();
    if (q < 0.18 && w > 14 && h > 14) {
      // 凹下的面板：暗的內框＋亮邊
      c.fillStyle = 'rgba(40,44,50,0.35)';
      c.fillRect(x + 3, y + 3, w - 6, h - 6);
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(x + 3, y + h - 4, w - 6, 1);
    } else if (q < 0.3 && w > 18 && h > 10) {
      // 格柵
      c.fillStyle = 'rgba(30,34,40,0.45)';
      for (let k = x + 4; k < x + w - 4; k += 3) c.fillRect(k, y + 4, 1, h - 8);
    } else if (q < 0.36 && w > 16 && h > 16) {
      // 圓形艙口
      c.strokeStyle = 'rgba(40,44,50,0.5)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.3, 0, Math.PI * 2);
      c.stroke();
    }
    // 小鉚釘
    c.fillStyle = 'rgba(30,34,40,0.35)';
    if (w > 10 && h > 10)
      for (const [px, py] of [
        [x + 2, y + 2],
        [x + w - 3, y + 2],
        [x + 2, y + h - 3],
        [x + w - 3, y + h - 3],
      ])
        c.fillRect(px, py, 1, 1);
  };
  const split = (x, y, w, h, d) => {
    if (d > 3 || (d > 1 && r() < 0.25) || w < 16 || h < 16) return leaf(x, y, w, h);
    if (w >= h) {
      const k = Math.round(w * (0.3 + r() * 0.4));
      split(x, y, k, h, d + 1);
      split(x + k, y, w - k, h, d + 1);
    } else {
      const k = Math.round(h * (0.3 + r() * 0.4));
      split(x, y, w, k, d + 1);
      split(x, y + k, w, h - k, d + 1);
    }
  };
  // 先切成 4×4 的大面板，再各自細分
  const q = S / 4;
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) split(i * q, j * q, q, q, 0);
  if (emi) return;
  // 面板縫（深色細線）：重畫一次切分的邊太麻煩，改成依明暗差描邊——這裡直接畫 4×4 的主縫與隨機的次縫
  c.fillStyle = 'rgba(20,24,30,0.55)';
  for (let i = 0; i <= 4; i++) {
    c.fillRect(Math.min(S - 1, i * q), 0, 1, S);
    c.fillRect(0, Math.min(S - 1, i * q), S, 1);
  }
}
function drawWall(c, S, emi) {
  const r = hashRng(4421);
  c.fillStyle = emi ? '#000' : '#a6a9ac';
  c.fillRect(0, 0, S, S);
  const band = S / 4; // 每 7.5 m 一層
  for (let b = 0; b < 4; b++) {
    const y0 = b * band;
    if (!emi) {
      const v = 138 + Math.floor(r() * 44);
      c.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
      c.fillRect(0, y0, S, band);
      // 橫帶（凸出的樓板邊）＋陰影
      c.fillStyle = 'rgba(255,255,255,0.22)';
      c.fillRect(0, y0, S, 2);
      c.fillStyle = 'rgba(20,24,30,0.5)';
      c.fillRect(0, y0 + 2, S, 2);
      // 直的肋條
      for (let x = 0; x < S; x += S / 8) {
        c.fillStyle = 'rgba(20,24,30,0.28)';
        c.fillRect(x, y0 + 4, 2, band - 4);
      }
      // 凹下的區塊與格柵
      for (let k = 0; k < 3; k++) {
        const w = 10 + r() * 40,
          x = r() * (S - w);
        c.fillStyle = 'rgba(30,34,40,0.35)';
        c.fillRect(x, y0 + band * 0.55, w, band * 0.3);
      }
    }
    // 窗（一排，點亮的比例 0.4）
    const wy = y0 + band * 0.28;
    for (let x = 3; x < S - 4; x += 6) {
      if (r() < 0.25) continue;
      const lit = r() < 0.45;
      if (emi) {
        if (!lit) continue;
        c.fillStyle = r() < 0.8 ? '#ffe2b0' : '#bfe2ff';
      } else c.fillStyle = lit ? '#fff4dc' : '#2a2e34';
      c.fillRect(x, wy, 3, 2);
    }
  }
}
export const plateTex = () => canvasTex('plate', 512, (c, S) => drawPlate(c, S, false));
export const wallTex = () => canvasTex('wall', 512, (c, S) => drawWall(c, S, false));
const wallEmi = () => canvasTex('wallE', 512, (c, S) => drawWall(c, S, true));

// ---------- 材質（模組內共用；換色的地方不改它們） ----------
export const HULL = 0x8e9298; // 帝國艦的灰
export const HULL_D = 0x5c6167;
export const HULL_K = 0x24282d;
const MM = {};
function M(key, make) {
  return MM[key] || (MM[key] = make());
}
export const plateMat = () =>
  M(
    'plate',
    () =>
      new THREE.MeshStandardMaterial({
        color: HULL,
        map: plateTex(), // 甲板蓋滿畫面：只用一張貼圖（燈點的發光貼圖拿掉，效能）
        roughness: 0.62,
        metalness: 0.35,
        vertexColors: true,
      }),
  );
export const wallMat = () =>
  M(
    'wall',
    () =>
      new THREE.MeshStandardMaterial({
        color: 0x878b90,
        map: wallTex(),
        emissive: 0xffffff,
        emissiveMap: wallEmi(),
        emissiveIntensity: 1.1,
        roughness: 0.6,
        metalness: 0.35,
      }),
  );
export const GM = {
  light: () => mat(0x9ea2a7, { roughness: 0.55, metalness: 0.35 }),
  mid: () => mat(HULL_D, { roughness: 0.6, metalness: 0.4 }),
  dark: () => mat(HULL_K, { roughness: 0.7, metalness: 0.4 }),
  lamp: () => mat(0xfff0d0, { emissive: 0xffe0a8, emissiveIntensity: 1.4, roughness: 0.4 }),
  red: () => mat(0xff5040, { emissive: 0xff3020, emissiveIntensity: 1.2, roughness: 0.4 }),
  blue: () => mat(0xbfe4ff, { emissive: 0x8fd0ff, emissiveIntensity: 1.6, roughness: 0.3 }),
  stripe: () => mat(0xd8b040, { roughness: 0.6, metalness: 0.2 }),
};

// ---------- 版面 ----------
function mk(w, kind) {
  const L = w.lim;
  return {
    kind,
    L,
    s: L / 285, // 大地圖（MAP_BIG）的版面跟著放大
    Z: w.size / 2 + 60, // 船身沿 Z 延伸到地圖外
    W: w.size / 2 + 60,
    rects: [],
    decks: [],
    ramps: [],
    props: [], // 版面指定的物件（渦輪雷射砲塔…）：{ k, x, z, y, ry }
    big: [], // 大型結構：{ k, x, z, y }
    walls: [], // 額外的牆（機庫的四面）：{ x0, x1, z0, z1, y, top }
    pits: [], // 維修井（外觀：發光的格柵）
  };
}
const rect = (P, x0, x1, z0, z1, y, k) =>
  P.rects.push({ x0: snap(x0), x1: snap(x1), z0: snap(z0), z1: snap(z1), y, k });
// 坡道：高的一端在 e（上層平的邊緣），往 dir 延伸 len；c＝另一軸的中心
function ramp(P, axis, e, dir, c, wd, len, yHi, yLo) {
  if (axis === 'x')
    P.ramps.push({ x: e + (dir * len) / 2, z: c, w: len, d: wd, side: [dir, 0], y0: yLo, y1: yHi, len });
  else P.ramps.push({ x: c, z: e + (dir * len) / 2, w: wd, d: len, side: [0, dir], y0: yLo, y1: yHi, len });
}
const rampHit = (P, x0, x1, z0, z1, m = 0) =>
  P.ramps.some(
    (r) =>
      r.x + r.w / 2 + m > x0 && r.x - r.w / 2 - m < x1 && r.z + r.d / 2 + m > z0 && r.z - r.d / 2 - m < z1,
  );
const deckHit = (P, z0, z1, m = 0) => P.decks.some((d) => d.z + d.d / 2 + m > z0 && d.z - d.d / 2 - m < z1);

// 舷側甲板的渦輪雷射砲塔與坡道（side＝±1；x＝舷側甲板的中線；D＝主甲板的邊緣）
function gunwale(P, side, D, z0, z1, nRamp) {
  const s = P.s;
  const rz = [];
  for (let t = 0; t < 40 && rz.length < nRamp; t++) {
    const z = snap(rnd(z0 + 30, z1 - 30));
    if (rz.some((q) => Math.abs(q - z) < 90 * s)) continue;
    rz.push(z);
    ramp(P, 'x', side * D, side, z, 20, 30, LV.deck, LV.gun);
  }
  for (let z = z0 + rnd(10, 40); z < z1 - 10; z += 55 * s)
    if (rz.every((q) => Math.abs(q - z) > 22))
      P.props.push({
        k: 'tlaser',
        x: side * (D + 22),
        z,
        y: LV.gun,
        ry: side > 0 ? -Math.PI / 2 : Math.PI / 2,
      });
}
// 一條帶狀區域裡的高台（+15）與維修井（−8）：沿 Z 排，每個在 z1 那一端接一條坡道
// side：鏡像（±1；0＝不鏡像，x0／x1 是實際的座標）。回傳高台（給中央脊接上層甲板）
function band(P, x0, x1, side, mirror = 0.75, zA = -P.L, zB = P.L) {
  const s = P.s;
  const out = [];
  let z = zA + rnd(0, 40) * s;
  while (z < zB - 70 * s) {
    const len = snap(rnd(45, 80) * s);
    const one = (xa, xb, kind) => {
      const z0 = snap(z),
        z1 = snap(z + len);
      if (kind === 'mesa') {
        rect(P, xa, xb, z0, z1, LV.spine, 'mesa');
        ramp(P, 'z', z1, 1, snap((xa + xb) / 2), 20, 45, LV.spine, LV.deck);
      } else {
        rect(P, xa, xb, z0, z1, LV.pit, 'pit');
        ramp(P, 'z', z0 - SN, 1, snap((xa + xb) / 2), 20, 35, LV.deck, LV.pit);
        P.pits.push({ x0: xa, x1: xb, z0: z0 + 35, z1 });
      }
      return { x0: snap(xa), x1: snap(xb), z0, z1, kind };
    };
    const wdt = rnd(30, Math.max(31, x1 - x0));
    const xa = rnd(x0, x1 - wdt);
    const kind = RNG() < 0.65 || len < 55 ? 'mesa' : 'pit';
    out.push(one(xa, xa + wdt, kind));
    if (side) {
      if (RNG() < mirror) out.push(one(-(xa + wdt), -xa, kind));
      else {
        const w2 = rnd(30, Math.max(31, x1 - x0)),
          a2 = rnd(x0, x1 - w2);
        out.push(one(-(a2 + w2), -a2, RNG() < 0.65 || len < 55 ? 'mesa' : 'pit'));
      }
    }
    z += len + rnd(55, 85) * s;
  }
  return out;
}
// 中央脊邊緣的坡道（主甲板 → +15）：edges＝[[邊緣的 x, 往外的方向]]；避開通道、上層甲板、其他坡道
function spineRamps(P, edges, n, skip = []) {
  const s = P.s,
    L = P.L;
  for (const [e, sd] of edges) {
    let k = 0;
    for (let t = 0; t < 80 && k < n; t++) {
      const z = snap(rnd(-L + 40 * s, L - 40 * s));
      if (skip.some((q) => Math.abs(q - z) < 50)) continue;
      if (deckHit(P, z - 10, z + 10, 14)) continue;
      const x0 = Math.min(e, e + sd * 45),
        x1 = Math.max(e, e + sd * 45);
      if (rampHit(P, x0, x1, z - 10, z + 10, 40 * s)) continue;
      ramp(P, 'x', e, sd, z, 20, 45, LV.spine, LV.deck);
      k++;
    }
  }
}

// 中央艦體（標準、火山灰暴、夜航）：中央脊＋上層建築（艦橋）＋兩側的高台與維修井＋舷側甲板
function planBase(w, P) {
  const s = P.s,
    L = P.L,
    Z = P.Z;
  const B = snap(L - 30),
    D = snap(B - 40 * s);
  rect(P, -B, B, -Z, Z, LV.gun, 'gun');
  rect(P, -D, D, -Z, Z, LV.deck, 'deck');
  const S = snap(rnd(55, 68) * s);
  rect(P, -S, S, -Z, Z, LV.spine, 'spine');
  // 橫穿中央脊的通道（上面架上層甲板：從底下走過）
  const pass = [];
  for (let t = 0; t < 60 && pass.length < (s > 1.2 ? 3 : 2); t++) {
    const zc = snap(rnd(-L + 70 * s, L - 70 * s));
    if (pass.some((q) => Math.abs(q - zc) < 150 * s)) continue;
    pass.push(zc);
  }
  for (const zc of pass) {
    rect(P, -S, S, zc - 20, zc + 20, LV.deck, 'pass');
    P.decks.push({ x: 0, z: zc, w: 2 * S - 20, d: 66, y: LV.spine });
  }
  // 上層建築（+30）：艦橋塔站在上面；前後各一條坡道接中央脊，兩側伸出高架走道
  let zs = null;
  for (let t = 0; t < 40 && zs === null; t++) {
    const z = snap(rnd(-0.45 * L, 0.45 * L));
    if (pass.every((q) => Math.abs(q - z) > 125 * s)) zs = z;
  }
  if (zs !== null) {
    const hw = S - 15;
    rect(P, -hw, hw, zs - 40, zs + 40, LV.super, 'super');
    ramp(P, 'z', zs + 40, 1, 0, 20, 45, LV.super, LV.spine);
    ramp(P, 'z', zs - 40, -1, 0, 20, 45, LV.super, LV.spine);
    P.big.push({ k: 'bridge', x: 0, z: zs, y: LV.super });
    for (const sd of [-1, 1]) {
      const xa = hw - 5,
        xb = S + 40;
      P.decks.push({
        x: (sd * (xa + xb)) / 2,
        z: zs + 12,
        w: xb - xa,
        d: 20,
        y: LV.super,
        pil: [[sd * (S + 34), zs + 12, LV.deck]],
      });
    }
  }
  // 兩側：高台與維修井；高台有一半接一條從中央脊過來的上層甲板
  const x0 = S + 55 * s,
    x1 = D - 15 * s;
  for (const f of band(P, x0, x1, 1)) {
    if (f.kind !== 'mesa' || f.z1 - f.z0 < 35 || RNG() > 0.55) continue;
    const sd = f.x0 > 0 ? 1 : -1;
    const xa = S - 5,
      xb = (sd > 0 ? f.x0 : -f.x1) + 5;
    const zc = snap((f.z0 + f.z1) / 2),
      d = Math.min(22, f.z1 - f.z0 - 10);
    if (zs !== null && Math.abs(zc - zs) < 60) continue;
    P.decks.push({ x: (sd * (xa + xb)) / 2, z: zc, w: xb - xa, d, y: LV.spine });
  }
  spineRamps(
    P,
    [
      [S, 1],
      [-S, -1],
    ],
    Math.round(3 * s),
    pass,
  );
  for (const sd of [-1, 1]) gunwale(P, sd, D, -L, L, Math.round(3 * s));
  P.edgeY = LV.gun;
  P.S = S;
  return P;
}
// 艦首（前甲板）：船身往前分三段變窄、中央開闊（Boss 的擂台），兩側的主砲座與前方的艦首主砲，中央脊只在後段
function planFore(w, P) {
  const s = P.s,
    L = P.L,
    Z = P.Z;
  const B = snap(L - 30);
  const segs = [
    [-Z, snap(-0.45 * L), snap(0.62 * B)],
    [snap(-0.45 * L), snap(0.15 * L), snap(0.82 * B)],
    [snap(0.15 * L), Z, B],
  ].map(([z0, z1, b]) => [z0, z1, b, snap(b - 40 * s)]);
  for (const [z0, z1, b] of segs) rect(P, -b, b, z0, z1, LV.gun, 'gun');
  for (const [z0, z1, , d] of segs) rect(P, -d, d, z0, z1, LV.deck, 'deck');
  const S = snap(rnd(50, 60) * s),
    zsp = snap(0.4 * L);
  rect(P, -S, S, zsp, Z, LV.spine, 'spine');
  ramp(P, 'z', zsp, -1, 0, 20, 45, LV.spine, LV.deck);
  // 主砲座（+15 的高台＋主砲塔）：兩側＋艦首
  const D2 = segs[1][3];
  const bar = (x, z, h) => {
    rect(P, x - h, x + h, z - h, z + h, LV.spine, 'barbette');
    ramp(P, 'z', snap(z + h), 1, snap(x), 20, 45, LV.spine, LV.deck);
    P.big.push({ k: 'gun', x: snap(x), z: snap(z), y: LV.spine });
  };
  const bx = snap(0.64 * D2),
    bz = snap(-0.12 * L);
  for (const sd of [-1, 1]) bar(sd * bx, bz, 25);
  // 兩座主砲座之間的上層甲板（橫跨中央的擂台：從下面走過）
  P.decks.push({ x: 0, z: bz, w: 2 * (bx - 25) + 10, d: 20, y: LV.spine, pil: [[0, bz, LV.deck]] });
  bar(0, snap(-0.72 * L), 22);
  // 後段兩側的高台與維修井
  band(P, S + 55 * s, segs[2][3] - 15 * s, 1, 0.75, snap(0.22 * L), L);
  spineRamps(
    P,
    [
      [S, 1],
      [-S, -1],
    ],
    1,
  );
  for (const [z0, z1, , d] of segs)
    for (const sd of [-1, 1]) gunwale(P, sd, d, Math.max(z0, -L), Math.min(z1, L), z1 - z0 > 200 ? 1 : 0);
  P.edgeY = LV.gun;
  P.S = S;
  return P;
}
// 艦尾機關區：船身在 +Z 結束（後面是巨大的引擎噴口），中央是寬的反應爐艙（+15），兩側的散熱井
function planEngine(w, P) {
  const s = P.s,
    L = P.L,
    Z = P.Z;
  const B = snap(L - 30),
    D = snap(B - 40 * s),
    Zs = snap(0.86 * L);
  rect(P, -B, B, -Z, Zs, LV.gun, 'gun');
  rect(P, -D, D, -Z, Zs - 30, LV.deck, 'deck');
  const S = snap(rnd(75, 90) * s);
  rect(P, -S, S, -Z, Zs - 75, LV.spine, 'spine');
  ramp(P, 'z', Zs - 75, 1, 0, 20, 40, LV.spine, LV.deck);
  for (const x of [-0.6 * D, 0, 0.6 * D]) ramp(P, 'z', Zs - 30, 1, snap(x), 20, 25, LV.deck, LV.gun);
  const pass = [];
  const zc = snap(rnd(-0.5 * L, 0.2 * L));
  rect(P, -S, S, zc - 20, zc + 20, LV.deck, 'pass');
  P.decks.push({ x: 0, z: zc, w: 2 * S - 20, d: 66, y: LV.spine });
  pass.push(zc);
  band(P, S + 55 * s, D - 15 * s, 1, 0.9, -L, Zs - 60);
  spineRamps(
    P,
    [
      [S, 1],
      [-S, -1],
    ],
    Math.round(2 * s),
    pass,
  );
  for (const sd of [-1, 1]) gunwale(P, sd, D, -L, Zs - 30, Math.round(2 * s));
  P.engine = { z: Zs, B };
  P.edgeY = LV.gun;
  P.S = S;
  return P;
}
// 側舷：地圖在船身的右舷——左邊遠處是中央脊，中間是沿船身的壕溝（−26，上面有橫跨的走道），右邊是舷側甲板與船邊
function planFlank(w, P) {
  const s = P.s,
    L = P.L,
    Z = P.Z,
    W = P.W;
  const B = snap(0.84 * L),
    D = snap(B - 40 * s);
  rect(P, -W, B, -Z, Z, LV.gun, 'gun');
  rect(P, -W, D, -Z, Z, LV.deck, 'deck');
  const sx = snap(-0.74 * L);
  rect(P, -W, sx, -Z, Z, LV.spine, 'spine');
  // 壕溝
  const tx0 = snap(0.1 * L),
    tx1 = tx0 + snap(70 * s),
    tc = snap((tx0 + tx1) / 2);
  rect(P, tx0, tx1, -Z, Z, LV.trench, 'trench');
  const zb = snap(rnd(-0.3 * L, 0.3 * L));
  rect(P, tx0, tx1, zb - 20, zb + 20, LV.deck, 'bulk');
  ramp(P, 'z', zb + 20, 1, tc, 20, 60, LV.deck, LV.trench);
  ramp(P, 'z', zb - 20, -1, tc, 20, 60, LV.deck, LV.trench);
  P.trench = { x0: tx0, x1: tx1, zb };
  // 橫跨壕溝的走道（主甲板的高度：壕溝裡從底下走過）
  const cw = [];
  for (let t = 0; t < 60 && cw.length < Math.round(3 * s); t++) {
    const z = snap(rnd(-L + 30, L - 30));
    if (Math.abs(z - zb) < 110 || cw.some((q) => Math.abs(q - z) < 90 * s)) continue;
    cw.push(z);
    P.decks.push({ x: tc, z, w: tx1 - tx0 + 24, d: 14, y: LV.deck, thick: 1.6 });
  }
  // 壕溝邊的渦輪雷射砲塔（兩側交錯）
  let k = 0;
  for (let z = -L + rnd(10, 40); z < L - 10; z += 40 * s, k++) {
    if (cw.some((q) => Math.abs(q - z) < 18) || Math.abs(z - zb) < 30) continue;
    const sd = k % 2 ? 1 : -1;
    P.props.push({
      k: 'tlaser',
      x: sd > 0 ? tx1 + 14 : tx0 - 14,
      z,
      y: LV.deck,
      ry: sd > 0 ? -Math.PI / 2 : Math.PI / 2,
    });
  }
  // 中央脊與壕溝之間的高台、維修井
  band(P, sx + 55 * s, tx0 - 35 * s, 0);
  spineRamps(P, [[sx, 1]], Math.round(3 * s));
  gunwale(P, 1, D, -L, L, Math.round(3 * s));
  P.edgeY = LV.gun;
  P.S = -sx;
  return P;
}
// 艦內維修機庫：四面有牆（不蓋頂）；中央的指揮台（+15）、兩道維修島（+15 的矮牆，兩面都是維修格）、
// 指揮台伸到維修島的上層走道（從下面走過）、沿長邊的牆面維修格、兩端的高架走道
function planHangar(w, P) {
  const s = P.s,
    L = P.L,
    W = P.W;
  rect(P, -W, W, -W, W, LV.deck, 'floor');
  const Hw = snap(L - 15);
  P.hangar = { Hw, top: 50, bays: [] };
  // 四面的牆（厚 10 m）
  P.walls.push(
    { x0: -Hw - 10, x1: -Hw, z0: -Hw - 10, z1: Hw + 10, y: 0, top: 50 },
    { x0: Hw, x1: Hw + 10, z0: -Hw - 10, z1: Hw + 10, y: 0, top: 50 },
    { x0: -Hw, x1: Hw, z0: -Hw - 10, z1: -Hw, y: 0, top: 50 },
    { x0: -Hw, x1: Hw, z0: Hw, z1: Hw + 10, y: 0, top: 50 },
  );
  // 中央的指揮台
  const cz = snap(rnd(-0.1 * L, 0.1 * L)),
    hz = snap(55 * s),
    hx = snap(30 * s);
  rect(P, -hx, hx, cz - hz, cz + hz, LV.spine, 'mesa');
  ramp(P, 'z', cz + hz, 1, 0, 20, 45, LV.spine, LV.deck);
  ramp(P, 'z', cz - hz, -1, 0, 20, 45, LV.spine, LV.deck);
  // 維修島（+15、寬 10 m 的矮牆）
  const Xi = snap(0.5 * L),
    zi = Hw - 70;
  for (const sd of [-1, 1]) rect(P, sd * Xi - 5, sd * Xi + 5, -zi, zi, LV.spine, 'divider');
  // 指揮台 → 維修島的上層走道
  const dz = [cz - 30, cz + 30];
  for (const sd of [-1, 1])
    for (const z of dz) P.decks.push({ x: (sd * (hx - 5 + Xi)) / 2, z, w: Xi - hx + 5, d: 16, y: LV.spine });
  // 兩端（短邊）的高架走道：沿牆、兩段，內側的端點接坡道
  for (const sz of [-1, 1]) {
    const z = sz * (Hw - 8);
    for (const sx of [-1, 1]) {
      const a = 65,
        b = Hw - 4;
      const pil = [];
      for (let x = a + 30; x < b - 10; x += 55) pil.push([sx * x, z + sz * 2, LV.deck]);
      P.decks.push({ x: (sx * (a + b)) / 2, z, w: b - a, d: 14, y: LV.spine, pil });
      ramp(P, 'x', sx * a, -sx, z, 14, 45, LV.spine, LV.deck);
    }
  }
  // 維修格：{ bx 背面（牆面或維修島的面）, f 朝向（±1，沿 X）, z }，每 46 m 一格
  const bays = P.hangar.bays;
  for (const sd of [-1, 1]) {
    for (let z = -Hw + 40; z <= Hw - 40; z += 46 * s)
      bays.push({ bx: sd * Hw, f: -sd, z: snap(z), wall: true });
    for (let z = -zi + 25; z <= zi - 25; z += 46 * s) {
      bays.push({ bx: sd * (Xi + 5), f: sd, z: snap(z) });
      // 內側（朝指揮台）：上層走道底下不放（格架塔比走道高）
      if (dz.every((q) => Math.abs(q - z) > 40)) bays.push({ bx: sd * (Xi - 5), f: -sd, z: snap(z) });
    }
  }
  P.edgeY = LV.deck;
  P.S = 0;
  return P;
}
const PLANS = { base: planBase, fore: planFore, engine: planEngine, flank: planFlank, hangar: planHangar };
// 主題／變體的 planTerrain：版面記在 w.arkP，回傳 (x, z) → 高度
export function planArk(kind) {
  return (w) => {
    const P = PLANS[kind](w, mk(w, kind));
    w.arkP = P;
    // 虛空的提示（HUD voidHud）與下層平台用：船邊的高度
    w.islands = { blocks: [], bridges: [], h: P.edgeY * 1 };
    const R = P.rects;
    return (x, z) => {
      for (let i = R.length - 1; i >= 0; i--) {
        const r = R[i];
        if (x >= r.x0 - 0.01 && x <= r.x1 + 0.01 && z >= r.z0 - 0.01 && z <= r.z1 + 0.01) return r.y;
      }
      return LV.deep;
    };
  };
}

// ---------- 幾何的累加器 ----------
class Acc {
  constructor(color, cs = 3) {
    this.p = [];
    this.n = [];
    this.u = [];
    this.c = color ? [] : null;
    this.cs = cs;
  }
  // 四邊形（a→b→c→d 的順序；法線不對時自動反過來）；uv 是四個角的 [u, v]
  quad(a, b, c, d, nrm, uv, col) {
    const ux = b[0] - a[0],
      uy = b[1] - a[1],
      uz = b[2] - a[2],
      vx = c[0] - a[0],
      vy = c[1] - a[1],
      vz = c[2] - a[2];
    const cx = uy * vz - uz * vy,
      cy = uz * vx - ux * vz,
      cz = ux * vy - uy * vx;
    let P = [a, b, c, d],
      U = uv,
      Cv = col && Array.isArray(col[0]) ? col : [col, col, col, col];
    if (cx * nrm[0] + cy * nrm[1] + cz * nrm[2] < 0) {
      P = [a, d, c, b];
      U = [uv[0], uv[3], uv[2], uv[1]];
      Cv = [Cv[0], Cv[3], Cv[2], Cv[1]];
    }
    for (const i of [0, 1, 2, 0, 2, 3]) {
      this.p.push(P[i][0], P[i][1], P[i][2]);
      this.n.push(nrm[0], nrm[1], nrm[2]);
      this.u.push(U[i][0], U[i][1]);
      if (this.c) for (let q = 0; q < this.cs; q++) this.c.push(Cv[i][q]);
    }
  }
  get empty() {
    return !this.p.length;
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    if (this.c) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, this.cs));
    g.computeBoundingSphere();
    return g;
  }
}
// 平面的頂面（甲板貼圖；uv 以世界座標，rot＝0～3 轉 90° 打散重複）
function topQuad(A, x0, x1, z0, z1, y, col, rot = 0) {
  const uv = [
    [x0 / TP, z0 / TP],
    [x0 / TP, z1 / TP],
    [x1 / TP, z1 / TP],
    [x1 / TP, z0 / TP],
  ];
  for (let k = 0; k < rot; k++) uv.push(uv.shift());
  A.quad([x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0], [0, 1, 0], uv, col);
}
// 垂直的面（艦壁貼圖）：沿 X（at＝z）或沿 Z（at＝x）
function sideQuad(A, axis, at, a0, a1, y0, y1, nrm) {
  const uv = [
    [a0 / TW, y0 / TW],
    [a1 / TW, y0 / TW],
    [a1 / TW, y1 / TW],
    [a0 / TW, y1 / TW],
  ];
  if (axis === 'x') A.quad([a0, y0, at], [a1, y0, at], [a1, y1, at], [a0, y1, at], nrm, uv);
  else A.quad([at, y0, a0], [at, y0, a1], [at, y1, a1], [at, y1, a0], nrm, uv);
}
// 格子上的矩形合併（greedy）：cells[i][j] 有值的格子，依值相同合併
function greedy(n, get) {
  const used = new Uint8Array(n * n);
  const out = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      if (used[j * n + i]) continue;
      const v = get(i, j);
      if (v === null) continue;
      let i1 = i;
      while (i1 + 1 < n && !used[j * n + i1 + 1] && get(i1 + 1, j) === v) i1++;
      let j1 = j;
      outer: while (j1 + 1 < n) {
        for (let q = i; q <= i1; q++) if (used[(j1 + 1) * n + q] || get(q, j1 + 1) !== v) break outer;
        j1++;
      }
      for (let jj = j; jj <= j1; jj++) for (let ii = i; ii <= i1; ii++) used[jj * n + ii] = 1;
      out.push({ i0: i, i1, j0: j, j1, v });
    }
  return out;
}

// ---------- 建造 ----------
// 甲板（平的格子）、牆（一格寬的高低差：不可破壞的方塊障礙物）、船側（往虛空的邊）
function buildSurfaces(w, R) {
  const n = w.cells,
    c = w.cell,
    o = -w.size / 2;
  const P = w.arkP;
  const H = (i, j) => w.h[j * (n + 1) + i];
  const inRamp = (x, z) =>
    P.ramps.some((r) => Math.abs(x - r.x) < r.w / 2 - 0.5 && Math.abs(z - r.z) < r.d / 2 - 0.5);
  const flat = [],
    step = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = H(i, j),
        b = H(i + 1, j),
        d = H(i, j + 1),
        e = H(i + 1, j + 1);
      const lo = Math.min(a, b, d, e),
        hi = Math.max(a, b, d, e);
      if (lo < VOID_Y) {
        flat.push(null);
        step.push(null);
        continue;
      }
      if (hi - lo < 0.05) {
        flat.push(Math.round(hi * 10) / 10);
        step.push(null);
      } else {
        flat.push(null);
        const x = o + (i + 0.5) * c,
          z = o + (j + 0.5) * c;
        step.push(
          hi - lo < 1.5 || inRamp(x, z) ? null : `${Math.round(lo * 10) / 10}|${Math.round(hi * 10) / 10}`,
        );
      }
    }
  // 甲板：依高度合併，再切成 30 m 的區塊（每塊明暗不同、貼圖轉向不同：死星表面的面板交錯）
  const A = new Acc(true);
  const tone = new THREE.Color();
  for (const r of greedy(n, (i, j) => flat[j * n + i])) {
    const X0 = o + r.i0 * c,
      X1 = o + (r.i1 + 1) * c,
      Z0 = o + r.j0 * c,
      Z1 = o + (r.j1 + 1) * c;
    const y = r.v + 0.06;
    const lift = r.v > 20 ? 1.06 : r.v > 10 ? 1.03 : r.v < -20 ? 0.72 : r.v < -5 ? 0.86 : 1;
    for (let x = Math.floor(X0 / TP) * TP; x < X1; x += TP)
      for (let z = Math.floor(Z0 / TP) * TP; z < Z1; z += TP) {
        const a0 = Math.max(x, X0),
          a1 = Math.min(x + TP, X1),
          b0 = Math.max(z, Z0),
          b1 = Math.min(z + TP, Z1);
        if (a1 - a0 < 0.1 || b1 - b0 < 0.1) continue;
        // 區塊的明暗以座標雜湊（同一塊在相鄰的矩形裡一樣）
        const hsh = hashRng(((x / TP + 999) * 7919) ^ ((z / TP + 999) * 104729))();
        const k = (0.86 + hsh * 0.2) * lift;
        tone.setRGB(k, k, k * 1.01);
        topQuad(A, a0, a1, b0, b1, y, [tone.r, tone.g, tone.b], Math.floor(hsh * 4));
      }
  }
  const plate = new THREE.Mesh(A.geo(), plateMat());
  plate.receiveShadow = true;
  hullMesh(w, plate, 'terrain');
  // 牆：合併、登記成方塊障礙物（沒有 group：不可破壞、不做鏡頭的淡出）
  const WA = new Acc(false),
    TA = new Acc(true);
  const wallRects = [];
  for (const r of greedy(n, (i, j) => step[j * n + i])) {
    const [lo, hi] = r.v.split('|').map(Number);
    wallRects.push({
      x0: o + r.i0 * c,
      x1: o + (r.i1 + 1) * c,
      z0: o + r.j0 * c,
      z1: o + (r.j1 + 1) * c,
      lo,
      hi,
    });
  }
  for (const q of P.walls) wallRects.push({ ...q, lo: q.y, hi: q.top, tall: true });
  for (const q of wallRects) {
    w.obstacles.push({
      kind: 'box',
      x: (q.x0 + q.x1) / 2,
      z: (q.z0 + q.z1) / 2,
      w: q.x1 - q.x0,
      d: q.z1 - q.z0,
      y: q.lo,
      top: q.hi,
      box: new THREE.Box3(new THREE.Vector3(q.x0, q.lo, q.z0), new THREE.Vector3(q.x1, q.hi, q.z1)),
      hull: true,
    });
    topQuad(TA, q.x0, q.x1, q.z0, q.z1, q.hi + 0.06, [0.72, 0.72, 0.74]);
    sideQuad(WA, 'x', q.z0, q.x0, q.x1, q.lo, q.hi, [0, 0, -1]);
    sideQuad(WA, 'x', q.z1, q.x0, q.x1, q.lo, q.hi, [0, 0, 1]);
    sideQuad(WA, 'z', q.x0, q.z0, q.z1, q.lo, q.hi, [-1, 0, 0]);
    sideQuad(WA, 'z', q.x1, q.z0, q.z1, q.lo, q.hi, [1, 0, 0]);
  }
  P.wallRects = wallRects;
  // 牆腳的接觸陰影：低的那一側的甲板上 6 m 寬、由黑漸淡（透明的帶子，讓各層的高低一眼看得出來）
  const AO = new Acc(true, 4);
  const near = (x, z, y) => Math.abs(w.terrainHeight(x, z) - y) < 1;
  const k0 = [1, 1, 1, 0.55],
    k1 = [1, 1, 1, 0];
  for (const q of wallRects) {
    const y = q.lo + 0.09,
      zc = (q.z0 + q.z1) / 2,
      xc = (q.x0 + q.x1) / 2;
    const U = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    if (near(q.x0 - 2.5, zc, q.lo))
      AO.quad([q.x0, y, q.z0], [q.x0, y, q.z1], [q.x0 - 6, y, q.z1], [q.x0 - 6, y, q.z0], [0, 1, 0], U, [
        k0,
        k0,
        k1,
        k1,
      ]);
    if (near(q.x1 + 2.5, zc, q.lo))
      AO.quad([q.x1, y, q.z0], [q.x1, y, q.z1], [q.x1 + 6, y, q.z1], [q.x1 + 6, y, q.z0], [0, 1, 0], U, [
        k0,
        k0,
        k1,
        k1,
      ]);
    if (near(xc, q.z0 - 2.5, q.lo))
      AO.quad([q.x0, y, q.z0], [q.x1, y, q.z0], [q.x1, y, q.z0 - 6], [q.x0, y, q.z0 - 6], [0, 1, 0], U, [
        k0,
        k0,
        k1,
        k1,
      ]);
    if (near(xc, q.z1 + 2.5, q.lo))
      AO.quad([q.x0, y, q.z1], [q.x1, y, q.z1], [q.x1, y, q.z1 + 6], [q.x0, y, q.z1 + 6], [0, 1, 0], U, [
        k0,
        k0,
        k1,
        k1,
      ]);
  }
  if (!AO.empty) {
    const ao = new THREE.Mesh(
      AO.geo(),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
      }),
    );
    ao.renderOrder = 1;
    hullMesh(w, ao, 'terrain');
  }
  // 船側：實地的格點旁邊是虛空的格點時，在實地外 1 m 立一面往下的艦壁（沿著格線合併）
  const edge = new Map();
  const solid = (i, j) => i >= 0 && j >= 0 && i <= n && j <= n && H(i, j) >= VOID_Y;
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      if (!solid(i, j)) continue;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const ni = i + di,
          nj = j + dj;
        if (ni < 0 || nj < 0 || ni > n || nj > n || solid(ni, nj)) continue;
        // 線的鍵：方向＋所在的格線；值：沿線的格點
        const key = di ? `x${di}|${i}|${H(i, j)}` : `z${dj}|${j}|${H(i, j)}`;
        if (!edge.has(key)) edge.set(key, []);
        edge.get(key).push(di ? j : i);
      }
    }
  P.hullEdges = [];
  for (const [key, list] of edge) {
    const [d, line, top] = key.split('|');
    const dir = Number(d.slice(1)),
      ax = d[0];
    const y = Number(top);
    list.sort((a, b) => a - b);
    let s0 = list[0],
      prev = list[0];
    const flush = (a, b) => {
      const p0 = o + a * c - c / 2,
        p1 = o + b * c + c / 2;
      const at = o + Number(line) * c + dir * 1;
      // 上半：垂直的艦壁；下半：往內收的船底
      const nrm = ax === 'x' ? [dir, 0, 0] : [0, 0, dir];
      if (ax === 'x') {
        sideQuad(WA, 'z', at, p0, p1, -60, y, nrm);
        WA.quad(
          [at, -60, p0],
          [at, -60, p1],
          [at - dir * 70, HULL_BOT, p1],
          [at - dir * 70, HULL_BOT, p0],
          [dir * 0.8, -0.6, 0],
          [
            [p0 / TW, -60 / TW],
            [p1 / TW, -60 / TW],
            [p1 / TW, -166 / TW],
            [p0 / TW, -166 / TW],
          ],
        );
      } else {
        sideQuad(WA, 'x', at, p0, p1, -60, y, nrm);
        WA.quad(
          [p0, -60, at],
          [p1, -60, at],
          [p1, HULL_BOT, at - dir * 70],
          [p0, HULL_BOT, at - dir * 70],
          [0, -0.6, dir * 0.8],
          [
            [p0 / TW, -60 / TW],
            [p1 / TW, -60 / TW],
            [p1 / TW, -166 / TW],
            [p0 / TW, -166 / TW],
          ],
        );
      }
      P.hullEdges.push({ ax, dir, at, p0, p1, y });
    };
    for (let k = 1; k < list.length; k++) {
      if (list[k] !== prev + 1) {
        flush(s0, prev);
        s0 = list[k];
      }
      prev = list[k];
    }
    flush(s0, prev);
  }
  if (!WA.empty) {
    const wall = new THREE.Mesh(WA.geo(), wallMat());
    wall.castShadow = true;
    wall.receiveShadow = true;
    hullMesh(w, wall, 'terrain');
  }
  if (!TA.empty) {
    const tops = new THREE.Mesh(TA.geo(), plateMat());
    tops.receiveShadow = true;
    tops.castShadow = true;
    hullMesh(w, tops, 'terrain');
  }
}
function hullMesh(w, m, cat) {
  m.userData.noFade = true;
  m.userData.cat = cat;
  w.scene.add(m);
  w.meshes.push(m);
  return m;
}

// 坡道：鋼板＋橫的防滑條＋兩側的護欄與警示線、燈（現實尺寸）；長度沿 X（alongZ 時沿 Z）
function buildRampMesh(len, wd, alongZ) {
  const k = new PK(false);
  const B = (m, a, h, b, x, y, z) => (alongZ ? k.box(m, b, h, a, z, y, x) : k.box(m, a, h, b, x, y, z));
  B(GM.mid(), len, 0.6, wd, 0, 0, 0);
  for (let x = -len / 2 + 2; x < len / 2 - 1; x += 3) B(GM.dark(), 0.35, 0.12, wd - 1.2, x, 0.33, 0);
  for (const s of [-1, 1]) {
    B(GM.dark(), len, 1.2, 0.6, 0, 0.6, s * (wd / 2 - 0.3));
    B(GM.stripe(), len, 0.12, 0.3, 0, 1.25, s * (wd / 2 - 0.3));
    for (let x = -len / 2 + 3; x < len / 2; x += 6) B(GM.lamp(), 0.4, 0.2, 0.2, x, 1.3, s * (wd / 2 - 0.3));
  }
  return k.build();
}
function buildRamps(w) {
  const P = w.arkP;
  w.ramps = w.ramps || [];
  for (const r of P.ramps) {
    const alongX = !!r.side[0];
    const g = buildRampMesh(r.len, alongX ? r.d : r.w, !alongX);
    const a = Math.atan2(r.y1 - r.y0, r.len);
    // 斜面：中心在兩端高度的中間；高的一端在 −side 那一邊（Lattice-9 的坡道同樣的轉法），水平投影＝len
    g.position.set(r.x, (r.y0 + r.y1) / 2 - 0.25, r.z);
    if (alongX) {
      g.rotation.z = -r.side[0] * a;
      g.scale.x = 1 / Math.cos(a);
    } else {
      g.rotation.x = r.side[1] * a;
      g.scale.z = 1 / Math.cos(a);
    }
    g.userData.noFade = true;
    g.userData.cat = 'terrain';
    w.scene.add(g);
    w.meshes.push(g);
    w.ramps.push({
      x: r.x,
      z: r.z,
      w: r.w,
      d: r.d,
      side: r.side,
      y0: r.y0,
      y1: r.y1,
      len: r.len,
      lift: false,
    });
    w.reserve(r.x - r.w / 2, r.x + r.w / 2, r.z - r.d / 2, r.z + r.d / 2);
  }
}
// 上層甲板（addDeck：可以從下面走過、可破壞）＋支柱
function buildDecks(w) {
  const P = w.arkP;
  for (const d of P.decks) {
    w.addDeck(d.x, d.z, d.w, d.d, d.y, d.thick || 2, false, null);
    for (const [x, z, y0] of d.pil || []) w.addPillar(x, z, 1.6, y0, d.y - (d.thick || 2));
  }
}
// 船側的下層平台（掉下去時接住：洋上都市的做法，標 ledge）：沿長的船側，每段 60 m、間隔 25 m
function buildSponsons(w) {
  const P = w.arkP;
  const lim = w.lim + 6 * G;
  for (const e of P.hullEdges || []) {
    if (e.p1 - e.p0 < 50) continue;
    const y = e.y - 12,
      wd = 15;
    for (let a = Math.max(e.p0 + 5, -lim); a + 40 < Math.min(e.p1 - 5, lim); a += 85) {
      const b = Math.min(a + 60, e.p1 - 5, lim);
      const c = e.at + (e.dir * wd) / 2;
      const ob =
        e.ax === 'x'
          ? w.addDeck(c, (a + b) / 2, wd, b - a, y, 1.6, true, null)
          : w.addDeck((a + b) / 2, c, b - a, wd, y, 1.6, false, null);
      ob.ledge = true;
      ob.group.traverse((m) => {
        if (m.isMesh) m.castShadow = false;
      });
    }
  }
}

// ---------- 小零件（純外觀，自己的亂數串；依 3×3 區域合併） ----------
function buildGreebles(w) {
  const P = w.arkP;
  const r = makeRng(w.seed * 71 + 5);
  const R = (a, b) => a + r() * (b - a);
  const N = 3,
    half = w.size / 2,
    cs = w.size / N;
  const chunks = [];
  const at = (x, z) => {
    const i = clamp(Math.floor((x + half) / cs), 0, N - 1),
      j = clamp(Math.floor((z + half) / cs), 0, N - 1);
    return chunks[j * N + i] || (chunks[j * N + i] = new PK(false));
  };
  const L = GM.light(),
    Md = GM.mid(),
    Dk = GM.dark(),
    lamp = GM.lamp(),
    red = GM.red(),
    blue = GM.blue();
  const lim = w.lim + 20;
  const inRamp = (x, z, m = 3) =>
    P.ramps.some((q) => Math.abs(x - q.x) < q.w / 2 + m && Math.abs(z - q.z) < q.d / 2 + m);
  // 1) 牆頂的邊（矮的護欄）、牆面的燈帶與直肋、牆腳的管線
  for (const q of P.wallRects || []) {
    if (q.tall) continue;
    const H = q.hi - q.lo;
    const long = q.x1 - q.x0 >= q.z1 - q.z0;
    const a0 = long ? q.x0 : q.z0,
      a1 = long ? q.x1 : q.z1;
    const mid = long ? (q.z0 + q.z1) / 2 : (q.x0 + q.x1) / 2;
    if (Math.abs(mid) > lim + 40 || a1 - a0 < 4) continue;
    // 只畫低的那一側（高的一側埋在上層的甲板裡）
    const th = long ? q.z1 - q.z0 : q.x1 - q.x0;
    for (const sd of [-1, 1]) {
      const face = mid + (sd * th) / 2;
      const ca = (a0 + a1) / 2;
      const gy = long ? w.terrainHeight(ca, face + sd * 3) : w.terrainHeight(face + sd * 3, ca);
      if (Math.abs(gy - q.lo) > 1) continue;
      for (let a = a0 + R(1, 4); a < a1 - 1; a += R(5, 9)) {
        if (Math.abs(a) > lim + 40) continue;
        const [x, z] = long ? [a, face] : [face, a];
        if (inRamp(x, z, 1)) continue;
        const k = at(x, z);
        const rib = R(0.6, 1.2);
        // 沿 Z 的牆轉 90°：局部的 +Z 朝世界的 +X
        const ry = long ? 0 : Math.PI / 2;
        k.at(x, 0, z, 0, ry, 0, () => {
          // 直肋（從牆腳到牆頂）
          k.box(Md, rib, H * 0.9, 0.7, 0, q.lo + H * 0.45, sd * 0.35);
          if (r() < 0.5) k.box(Dk, R(2, 4), R(1, 2.2), 0.5, R(1.5, 3), q.lo + R(0.3, 0.7) * H, sd * 0.3);
          if (r() < 0.35)
            k.box(r() < 0.8 ? lamp : red, R(1, 3), 0.25, 0.3, R(2, 4), q.lo + H * 0.72, sd * 0.4);
        });
      }
      // 牆腳的管線
      if (r() < 0.6 && H > 6) {
        const f2 = face + sd * 0.9;
        const [xa, za, xb, zb] = long ? [a0 + 2, f2, a1 - 2, f2] : [f2, a0 + 2, f2, a1 - 2];
        if (!inRamp((xa + xb) / 2, (za + zb) / 2, 2))
          at((xa + xb) / 2, (za + zb) / 2).pipe(Md, [xa, q.lo + 1.2, za], [xb, q.lo + 1.2, zb], 0.55, 6);
      }
    }
    // 牆頂的燈點（每 14 m，低的那一側的邊上）
    for (let a = a0 + 5; a < a1 - 3; a += 14) {
      const [x, z] = long ? [a, mid] : [mid, a];
      if (inRamp(x, z, 2) || Math.abs(a) > lim + 40) continue;
      at(x, z).box(lamp, 0.6, 0.25, 0.6, x, q.hi + 0.15, z);
    }
  }
  // 2) 甲板上：每 30 m 的區塊幾組小零件（通風箱、艙口框、感測器、燈點、散熱鰭）
  const n = w.cells,
    c = w.cell,
    o = -w.size / 2;
  for (let x = -lim; x < lim; x += TP)
    for (let z = -lim; z < lim; z += TP) {
      const cnt = Math.floor(R(0, 3.6));
      for (let t = 0; t < cnt; t++) {
        const px = x + R(3, TP - 3),
          pz = z + R(3, TP - 3);
        const i = Math.floor((px - o) / c),
          j = Math.floor((pz - o) / c);
        if (i < 1 || j < 1 || i >= n - 1 || j >= n - 1) continue;
        const y = w.terrainHeight(px, pz);
        if (y < VOID_Y || !w.slopeOK(px, pz) || inRamp(px, pz)) continue;
        // 版面指定的物件附近不放
        if (P.props.some((p) => Math.hypot(p.x - px, p.z - pz) < 8)) continue;
        if (P.big.some((p) => Math.hypot(p.x - px, p.z - pz) < 30)) continue;
        const k = at(px, pz);
        const q = r();
        const ry = r() < 0.5 ? 0 : Math.PI / 2;
        k.at(px, y, pz, 0, ry, 0, () => {
          if (q < 0.3) {
            // 通風箱＋格柵
            const a = R(2, 5),
              b = R(1.5, 3);
            k.box(Md, a, 0.6, b, 0, 0.3, 0);
            for (let u = -a / 2 + 0.4; u < a / 2 - 0.2; u += 0.5) k.box(Dk, 0.15, 0.1, b - 0.3, u, 0.62, 0);
          } else if (q < 0.5) {
            // 艙口框
            const a = R(3, 6);
            k.box(Dk, a, 0.15, a * 0.7, 0, 0.08, 0);
            k.box(Md, a - 0.6, 0.22, a * 0.7 - 0.6, 0, 0.1, 0);
          } else if (q < 0.65) {
            // 感測器（短柱＋圓頂）
            k.cyl(Md, 0.5, 0.6, 1.2, 0, 0.6, 0, 0, 0, 0, 8);
            k.cyl(Md, 0.7, 0.7, 0.3, 0, 1.3, 0, 0, 0, 0, 8);
            k.box(red, 0.2, 0.2, 0.2, 0, 1.55, 0);
          } else if (q < 0.82) {
            // 一排燈點（甲板的導引燈）
            const m = lamp;
            for (let u = -6; u <= 6; u += 3) k.box(m, 0.35, 0.12, 0.35, u, 0.06, 0);
          } else {
            // 散熱鰭
            const a = R(3, 6);
            for (let u = -a / 2; u <= a / 2; u += 0.6) k.box(Md, 0.12, R(0.6, 1.2), 2.4, u, 0.4, 0);
            k.box(Dk, a + 0.4, 0.2, 2.6, 0, 0.1, 0);
          }
        });
      }
    }
  // 3) 維修井的發光格柵
  for (const p of P.pits) {
    const k = at((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
    const cx = (p.x0 + p.x1) / 2,
      cz = (p.z0 + p.z1) / 2;
    const a = Math.min(p.x1 - p.x0, p.z1 - p.z0) - 12;
    if (a < 8) continue;
    k.box(Dk, a + 1, 0.2, a + 1, cx, LV.pit + 0.1, cz);
    k.box(P.kind === 'engine' ? blue : GM.red(), a, 0.08, a, cx, LV.pit + 0.22, cz);
    for (let u = -a / 2; u <= a / 2; u += 1.2) k.box(Dk, 0.3, 0.3, a, cx + u, LV.pit + 0.35, cz);
  }
  // 4) 船側：一排一排的窗台與突出的艙室
  for (const e of P.hullEdges || []) {
    for (let a = e.p0 + R(2, 8); a < e.p1 - 2; a += R(10, 22)) {
      if (Math.abs(a) > lim + 120) continue;
      const out = e.at + e.dir * 0.6;
      const [x, z] = e.ax === 'x' ? [out, a] : [a, out];
      const k = at(clamp(x, -half + 1, half - 1), clamp(z, -half + 1, half - 1));
      const y = R(-55, e.y - 4);
      const ry = e.ax === 'x' ? Math.PI / 2 : 0;
      k.at(x, y, z, 0, ry, 0, () => {
        const bw = R(3, 9),
          bh = R(1.5, 4);
        k.box(Md, bw, bh, 1.2, 0, 0, e.dir * (e.ax === 'x' ? -1 : 1) * 0.6);
        k.box(lamp, bw - 1, 0.4, 0.2, 0, bh * 0.2, e.dir * (e.ax === 'x' ? -1 : 1) * 1.25);
      });
    }
  }
  for (const k of chunks) {
    if (!k) continue;
    const g = k.build(new THREE.Group(), false);
    g.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = false;
        m.receiveShadow = true;
      }
    });
    hullMesh(w, g, 'struct');
  }
}

// ---------- 地圖外：船身的延伸、艦首、引擎、護衛艦、底下往後流的地表與雲 ----------
function buildFar(w) {
  const P = w.arkP;
  if (P.kind === 'hangar') return;
  const r = makeRng(w.seed * 37 + 3);
  const half = w.size / 2;
  const far = new THREE.Group();
  const pm = plateMat();
  const wm = wallMat();
  const A = new Acc(true),
    WA = new Acc(false);
  const T = [1, 1, 1];
  // 沿 Z 往外延伸：依地圖邊緣那一列的橫斷面（各層的甲板與層之間的牆）；艦首往前收成尖的
  const ext = (zN, zF, bow) => {
    const zr = zN < 0 ? -half + 3 : half - 3;
    const xs = [];
    for (let x = -half; x <= half; x += 5) xs.push([x, w.terrainHeight(x, zr)]);
    const za = Math.min(zN, zF),
      zb = Math.max(zN, zF);
    const kF = bow ? 0.06 : 1;
    let a = 0,
      e0 = null,
      e1 = null;
    for (let k = 1; k <= xs.length; k++) {
      if (k < xs.length && Math.abs(xs[k][1] - xs[a][1]) < 0.1) continue;
      const y = xs[a][1];
      if (y >= VOID_Y) {
        const x0 = xs[a][0],
          x1 = xs[k - 1][0] + 5;
        if (e0 === null) e0 = [x0, y];
        e1 = [x1, y];
        const uv = [
          [x0 / TP, zN / TP],
          [x1 / TP, zN / TP],
          [(x1 * kF) / TP, zF / TP],
          [(x0 * kF) / TP, zF / TP],
        ];
        A.quad(
          [x0, y + 0.06, zN],
          [x1, y + 0.06, zN],
          [x1 * kF, y + 0.06, zF],
          [x0 * kF, y + 0.06, zF],
          [0, 1, 0],
          uv,
          T,
        );
        if (k < xs.length && xs[k][1] >= VOID_Y && !bow) {
          const y2 = xs[k][1];
          sideQuad(WA, 'z', x1, za, zb, Math.min(y, y2), Math.max(y, y2), [y > y2 ? 1 : -1, 0, 0]);
        }
      }
      a = k;
    }
    // 艦首的兩舷：從地圖邊緣斜向尖端
    if (bow && e0)
      for (const [x, y, d] of [
        [e0[0], e0[1], -1],
        [e1[0], e1[1], 1],
      ])
        WA.quad(
          [x, -60, zN],
          [x * kF, -60, zF],
          [x * kF, y, zF],
          [x, y, zN],
          [d, 0, 0],
          [
            [zN / TW, -2],
            [zF / TW, -2],
            [zF / TW, y / TW],
            [zN / TW, y / TW],
          ],
        );
  };
  if (P.kind === 'fore') ext(-half, -1700, true);
  else ext(-half, -1400, false);
  if (P.kind === 'engine') {
    // 艦尾：引擎噴口（藍白的光）
    const E = P.engine;
    const g = new PK(false);
    const glow = farGlow();
    for (let k = -2; k <= 2; k++) {
      const x = k * E.B * 0.36,
        R0 = k === 0 ? 55 : 42;
      g.cyl(GM.mid(), R0, R0 * 1.12, 70, x, -70, E.z + 35, Math.PI / 2, 0, 0, 24);
      g.cyl(GM.dark(), R0 * 0.8, R0 * 0.8, 4, x, -70, E.z + 71, Math.PI / 2, 0, 0, 24);
      g.cyl(glow, R0 * 0.74, R0 * 0.74, 1, x, -70, E.z + 73, Math.PI / 2, 0, 0, 24);
    }
    g.box(GM.mid(), E.B * 2, 110, 60, 0, -75, E.z + 20);
    const gg = g.build(new THREE.Group(), false);
    far.add(gg);
  } else ext(half, 1500, false);
  // 船側往外延伸（地圖外的部分）
  for (const e of P.hullEdges || []) {
    if (e.ax !== 'x' || e.p1 < half - 10) continue;
    if (P.kind === 'engine') continue;
    sideQuad(WA, 'z', e.at, half, 1500, -60, e.y, [e.dir, 0, 0]);
  }
  for (const e of P.hullEdges || []) {
    if (e.ax !== 'x' || e.p0 > -half + 10 || P.kind === 'fore') continue;
    sideQuad(WA, 'z', e.at, -1400, -half, -60, e.y, [e.dir, 0, 0]);
  }
  if (!A.empty) far.add(new THREE.Mesh(A.geo(), pm));
  if (!WA.empty) far.add(new THREE.Mesh(WA.geo(), wm));
  // 遠方的上層建築剪影（艦橋在後方）
  if (P.kind !== 'engine') {
    const g = new PK(false);
    const z = 900 + r() * 200;
    g.box(GM.mid(), 220, 60, 160, 0, 45, z);
    g.box(GM.mid(), 150, 50, 110, 0, 100, z + 10);
    g.box(GM.mid(), 70, 40, 60, 0, 145, z + 20);
    g.box(GM.mid(), 160, 14, 40, 0, 172, z + 20);
    for (const s of [-1, 1]) {
      g.cyl(GM.mid(), 4, 4, 22, s * 50, 188, z + 20, 0, 0, 0, 8);
      g.cyl(GM.light(), 14, 14, 14, s * 50, 205, z + 20, 0, 0, 0, 16);
    }
    for (let y = 30; y < 180; y += 12) g.box(GM.lamp(), 140 - y * 0.5, 0.8, 0.6, 0, y, z - 80 + y * 0.35);
    far.add(g.build(new THREE.Group(), false));
  }
  far.traverse((m) => {
    if (m.isMesh) {
      m.castShadow = false;
      m.receiveShadow = false;
    }
  });
  hullMesh(w, far, 'far');
  // 護衛艦：兩側遠方的楔形艦影（不受霧影響，顏色預先混了天空色；受光、慢慢上下浮動）
  const sky = new THREE.Color(w.theme.fog);
  const em = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x8a8e94).lerp(sky, 0.45),
    emissive: sky.clone().multiplyScalar(0.25),
    roughness: 0.8,
    metalness: 0.2,
    fog: false,
  });
  const el = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xcfeaff).lerp(sky, 0.25), fog: false });
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    const L0 = 420 + r() * 160;
    const sh = new THREE.Shape([
      new THREE.Vector2(0, -L0 / 2),
      new THREE.Vector2(L0 * 0.32, L0 / 2),
      new THREE.Vector2(-L0 * 0.32, L0 / 2),
    ]);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 30, bevelEnabled: false });
    geo.rotateX(Math.PI / 2);
    geo.translate(0, 30, 0);
    const hull = new THREE.Mesh(geo, em);
    g.add(hull);
    // 中央的階梯式上層建築與艦橋
    for (const [w0, h0, d0, y0, z0] of [
      [0.32, 14, 0.5, 37, 0.12],
      [0.2, 14, 0.3, 51, 0.2],
      [0.1, 14, 0.12, 65, 0.3],
    ]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w0 * L0, h0, d0 * L0), em);
      b.position.set(0, y0, z0 * L0);
      g.add(b);
    }
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.22 * L0, 6, 12), em);
    t.position.set(0, 76, 0.32 * L0);
    g.add(t);
    for (const x of [-0.18, 0, 0.18]) {
      const e = new THREE.Mesh(new THREE.CircleGeometry(10, 12), el);
      e.position.set(x * L0, 15, L0 / 2 + 0.5);
      g.add(e);
    }
    g.position.set(s * (1150 + r() * 250), 40 + r() * 120, -200 + r() * 600);
    const y0 = g.position.y,
      ph = r() * 6;
    hull.onBeforeRender = () => {
      g.position.y = y0 + Math.sin(performance.now() * 0.00025 + ph) * 8;
    };
    g.userData.noFade = true;
    g.userData.cat = 'far';
    w.scene.add(g);
    w.meshes.push(g);
  }
}
function farGlow() {
  return M('glow', () => new THREE.MeshBasicMaterial({ color: 0xcfeaff }));
}

// 底下很遠的熔岩地表（往後流＝要塞在前進）＋中間一層往後飄的灰雲
let GROUND_TEX = null,
  CLOUD_TEX = null;
function groundTexture() {
  if (GROUND_TEX) return GROUND_TEX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  c.fillStyle = '#2a201c';
  c.fillRect(0, 0, 256, 256);
  const r = hashRng(11);
  c.strokeStyle = 'rgba(255,110,30,0.85)';
  for (let i = 0; i < 26; i++) {
    c.lineWidth = 1 + r() * 4;
    c.beginPath();
    let x = r() * 256,
      y = r() * 256;
    c.moveTo(x, y);
    for (let j = 0; j < 6; j++) c.lineTo((x += (r() - 0.5) * 60), (y += (r() - 0.5) * 60));
    c.stroke();
  }
  GROUND_TEX = new THREE.CanvasTexture(cv);
  GROUND_TEX.colorSpace = THREE.SRGBColorSpace;
  GROUND_TEX.wrapS = GROUND_TEX.wrapT = THREE.RepeatWrapping;
  return GROUND_TEX;
}
function cloudTexture() {
  if (CLOUD_TEX) return CLOUD_TEX;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 256;
  const c = cv.getContext('2d');
  const r = hashRng(23);
  for (let i = 0; i < 70; i++) {
    const x = r() * 256,
      y = r() * 256,
      R0 = 10 + r() * 40;
    for (const [ox, oy] of [
      [0, 0],
      [256, 0],
      [-256, 0],
      [0, 256],
      [0, -256],
    ]) {
      const gr = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, R0);
      gr.addColorStop(0, 'rgba(255,255,255,0.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr;
      c.fillRect(x + ox - R0, y + oy - R0, R0 * 2, R0 * 2);
    }
  }
  CLOUD_TEX = new THREE.CanvasTexture(cv);
  CLOUD_TEX.wrapS = CLOUD_TEX.wrapT = THREE.RepeatWrapping;
  return CLOUD_TEX;
}
function buildBelow(w) {
  if (w.arkP.kind === 'hangar') return;
  const S = w.size * 5;
  const t = groundTexture().clone();
  t.needsUpdate = true;
  t.repeat.set(S / 300, S / 300);
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: t,
    emissive: 0xff7a30,
    emissiveMap: t,
    emissiveIntensity: 0.9,
    roughness: 1,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(S, S), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -420;
  mesh.onBeforeRender = () => {
    t.offset.y = (performance.now() * 0.00006) % 1; // 往後流（要塞往 −Z 前進）
  };
  hullMesh(w, mesh, 'far');
  // 灰雲：比船底低、比地表高，流得比地表快（近的東西看起來比較快）
  const ct = cloudTexture().clone();
  ct.needsUpdate = true;
  ct.repeat.set(S / 900, S / 900);
  const cm = new THREE.MeshBasicMaterial({
    color: new THREE.Color(w.theme.fog).lerp(new THREE.Color(0xffffff), 0.25),
    alphaMap: ct,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const cloud = new THREE.Mesh(new THREE.PlaneGeometry(S, S), cm);
  cloud.rotation.x = -Math.PI / 2;
  cloud.position.y = -230;
  cloud.onBeforeRender = () => {
    ct.offset.y = (performance.now() * 0.00009) % 1;
  };
  hullMesh(w, cloud, 'far');
}

// 主題的 buildStructures：船體的表面、牆、船側、坡道、上層甲板、下層平台、小零件、地圖外
export function buildHull(w) {
  buildSurfaces(w);
  buildRamps(w);
  buildDecks(w);
  buildSponsons(w);
  if (w.opt && w.opt.sample) return; // 作戰室的全像戰略桌：只要地形與障礙物
  buildGreebles(w);
  buildFar(w);
  buildBelow(w);
}
// 渦輪雷射砲塔等版面指定的位置（主題的 buildProps 用）
export function hullProps(w) {
  return (w.arkP && w.arkP.props) || [];
}
