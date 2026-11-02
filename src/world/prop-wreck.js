// 地圖物件的殘骸（docs/destruction-design.md）：完全損毀之後留在原地的造型與碰撞。純函式、不呼叫亂數：
// 形狀由物件編號與地圖種子的雜湊決定，所以各端一樣（房主、客機、重連時直接換成殘骸）。
//   通用殘骸：壓扁、傾斜的底座＋依材質的碎塊堆（混凝土與岩石＝岩塊、金屬類＝鐵板與彎掉的型鋼、木＝木條、冰、Coral 結晶）
//   ＋高的物件剩一截斷口＋地上的焦痕。專屬造型 WRECK[種類]（方案二，第 7 期）沒有時用通用殘骸。
//   碰撞：比原本矮的方塊（雜物 ≤ 0.5 m、一般 ≤ 跨越的高度、全身掩體以上 ≤ 5 m 的半身掩體），機甲跨得過去的就只擋子彈。
import { PMAT, propDebrisCol } from '../data/destruct.js';
import { PK, mat } from './prop-models.js';
import { providedModel } from '../render/model-provider.js';

export const WRECK = {}; // 種類 → (k: PK, o) => void（專屬的殘骸造型；o 見 buildWreck）

// 32 位元的雜湊亂數（不碰全域 RNG）
function hrng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const darken = (c, k) => {
  const r = (c >> 16) & 255,
    g = (c >> 8) & 255,
    b = c & 255;
  return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k);
};
const mix = (a, b, t) => {
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const SOOT = 0x1d1a17;

// 殘骸的高度（碰撞的頂面離地多高）
export function wreckHeight(H, step) {
  if (H <= 2.2) return Math.min(0.5, H * 0.4);
  if (H < 10) return Math.min(step * 0.9, Math.max(0.8, H * 0.22));
  return Math.min(5, Math.max(step, H * 0.18));
}

// p＝物件（shape 是損毀前的外形）、seed＝地圖種子、step＝跨越的高度；回傳 { group（原點在地面中心）, w, d, h }
// prog＝只用程式模型（模型庫的預覽）
export function buildWreck(p, seed, step, prog) {
  const sh = p.shape0 || p.shape; // 損毀前的外形（第 3 階段切掉上段之前）
  const W = Math.max(0.6, sh.x1 - sh.x0),
    D = Math.max(0.6, sh.z1 - sh.z0),
    H = Math.max(0.5, sh.y1 - sh.y0);
  const M = PMAT[p.mat] || PMAT.metal;
  const base = typeof p.col === 'number' ? p.col : 0x202224;
  const col = propDebrisCol(p, false);
  const R = hrng((p.idx + 1) * 2654435761 + (seed | 0) * 97 + 13);
  const r = (a, b) => a + (b - a) * R();
  // 模型庫的 GLB（prop/wreck_<類>）：水平縮放到外框、高度等比例（最多殘骸高度的 1.6 倍）
  const slot = WRECK_SLOT[p.kind];
  const glb = !prog && slot ? providedModel('prop/wreck_' + slot, null, true) : null;
  if (glb) return fitWreckGlb(glb, W, D, wreckHeight(H, step));
  const hw = p.crushed
    ? Math.min(0.45, wreckHeight(H, step))
    : p.lowWreck
      ? Math.min(step * 0.9, wreckHeight(H, step))
      : wreckHeight(H, step);
  const k = new PK();
  const o = { W, D, H: p.crushed ? Math.min(H, 2) : H, hw, col, base, M, r };
  if (WRECK[p.kind]) WRECK[p.kind](k, o);
  else wreckGeneric(k, o);
  // 地上的焦痕（可燃的比較黑、比較大）
  const sR = Math.max(W, D) * (M.fire ? 0.5 : 0.42);
  const sR2 = Math.min(sR, M.fire ? 7 : 5);
  k.cyl(mat(M.fire ? SOOT : darken(col, 0.35)), sR2, sR2, 0.06, 0, 0.03, 0, 0, 0, 0, 12);
  const group = k.build(new THREE.Group(), true);
  return { group, w: W * 0.9, d: D * 0.9, h: hw };
}

function fitWreckGlb(obj, W, D, hw) {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  const sz = b.getSize(new THREE.Vector3());
  const sx = (W * 0.9) / Math.max(0.01, sz.x),
    sz2 = (D * 0.9) / Math.max(0.01, sz.z);
  const sy = Math.min((sx + sz2) / 2, (hw * 1.6) / Math.max(0.01, sz.y));
  obj.scale.multiply(new THREE.Vector3(sx, sy, sz2));
  obj.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(obj);
  const c = b2.getCenter(new THREE.Vector3());
  obj.position.sub(new THREE.Vector3(c.x, b2.min.y, c.z));
  const group = new THREE.Group();
  group.add(obj);
  return { group, w: W * 0.9, d: D * 0.9, h: Math.min(hw, b2.max.y - b2.min.y) };
}
export function wreckGeneric(k, o) {
  const { W, D, H, hw, col, M, r } = o;
  const mBase = mat(darken(col, 0.55), { roughness: 0.9 });
  const mDark = mat(mix(darken(col, 0.4), SOOT, 0.4), { roughness: 0.95 });
  const mDarkB = mat(mix(darken(col, 0.6), SOOT, 0.3), { roughness: 0.92 });
  // 壓扁、裂成幾塊、各自傾斜的底座（沿長邊分 2～3 塊，塊與塊之間有縫）
  const nb = Math.max(W, D) > 6 ? 3 : 2;
  const alongX = W >= D;
  const L = (alongX ? W : D) * 0.86;
  for (let i = 0; i < nb; i++) {
    const seg = (L / nb) * r(0.82, 0.95);
    const off = -L / 2 + (L / nb) * (i + 0.5);
    const hh = hw * r(0.6, 1);
    const sw = alongX ? seg : W * r(0.7, 0.84),
      sd = alongX ? D * r(0.7, 0.84) : seg;
    k.box(
      i === 1 ? mDarkB : mBase,
      sw,
      hh,
      sd,
      alongX ? off : r(-0.05, 0.05) * W,
      hh / 2,
      alongX ? r(-0.05, 0.05) * D : off,
      r(-0.12, 0.12),
      r(-0.12, 0.12),
      r(-0.12, 0.12),
    );
  }
  // 高的物件：剩一截斷口（在一個角落）
  if (H > 4.5) {
    const sw = W * r(0.22, 0.34),
      sd = D * r(0.22, 0.34);
    const sx = (W / 2 - sw / 2) * (R2(r) ? 1 : -1) * 0.8,
      sz = (D / 2 - sd / 2) * (R2(r) ? 1 : -1) * 0.8;
    const stub = Math.min(H * 0.45, hw * r(1.8, 2.6));
    k.box(mDark, sw, stub, sd, sx, stub / 2, sz, r(-0.12, 0.12), r(-0.3, 0.3), r(-0.12, 0.12));
  }
  // 碎塊堆
  const n = Math.max(4, Math.min(16, Math.round(Math.sqrt(W * D) / 1.6) + 3));
  const s0 = Math.min(W, D);
  const mA = mat(col, { roughness: 0.85 }),
    mB = mat(darken(col, 0.7), { roughness: 0.9 });
  const glow = M.deb === 'crystal' ? mat(0xd03040, { emissive: 0x801020, roughness: 0.4 }) : null;
  for (let i = 0; i < n; i++) {
    const m = glow && i % 3 === 0 ? glow : i % 2 ? mA : mB;
    const s = Math.max(0.3, Math.min(3.5, s0 * r(0.14, 0.32)));
    const a = r(0, Math.PI * 2),
      rr = r(0.15, 0.62);
    const x = Math.cos(a) * rr * W * 0.6,
      z = Math.sin(a) * rr * D * 0.6;
    const y = hw * r(0.5, 1.05);
    const rx = r(-1, 1),
      ry = r(0, 3),
      rz = r(-1, 1);
    switch (M.deb) {
      case 'rock':
      case 'chunk':
      case 'ice':
        k.cb(m, s, s * r(0.5, 0.9), s * r(0.6, 1.1), x, y, z, rx, ry, rz, s * 0.18);
        if (M.deb === 'chunk' && i % 4 === 0)
          k.bar(mDark, [x, y, z], [x + r(-1, 1) * s, y + s, z + r(-1, 1) * s], 0.06); // 鋼筋
        break;
      case 'plank':
        k.box(m, s * 0.18, s * 0.14, s * 1.6, x, y, z, rx * 0.4, ry, rz * 0.4);
        break;
      case 'crystal':
        k.cyl(m, 0, s * 0.35, s * 1.2, x, y, z, rx * 0.6, ry, rz * 0.6, 5);
        break;
      default:
        // 鐵板
        k.box(m, s * 1.1, s * 0.08, s * 0.8, x, y, z, rx * 0.5, ry, rz * 0.5);
    }
  }
  // 金屬類：彎掉的型鋼伸出來
  if (M.deb === 'plate' && H > 2.2) {
    const L = Math.max(W, D) * 0.45;
    for (let i = 0; i < 3; i++) {
      const x = r(-0.3, 0.3) * W,
        z = r(-0.3, 0.3) * D;
      const a = r(0, Math.PI * 2),
        t = r(0.35, 0.9);
      k.bar(
        mDark,
        [x, hw * 0.6, z],
        [
          x + Math.cos(a) * L * Math.cos(t),
          hw * 0.6 + L * Math.sin(t) * 0.6,
          z + Math.sin(a) * L * Math.cos(t),
        ],
        Math.max(0.08, s0 * 0.025),
      );
    }
  }
}
const R2 = (r) => r() < 0.5;

// ---------- 專屬的殘骸造型（docs/destruction-design.md 第 7 期）----------
// o＝{ W, D, H（外框）, hw（殘骸高度）, col（顏色）, M（材質）, r（雜湊亂數 r()）}；原點在地面中心。長邊依外框
const SOOTY = (c, k = 0.45) => mix(darken(c, k), SOOT, 0.35);
function longAxis(o) {
  return o.W >= o.D ? { L: o.W, S: o.D, ax: 'x' } : { L: o.D, S: o.W, ax: 'z' };
}
// 沿長邊放一個方塊（u＝長邊上的位置，v＝短邊上的位置）
function along(k, a, m, l, h, s, u, y, v, rl = 0, ry = 0, rs = 0) {
  // rl＝繞長邊轉、rs＝繞短邊轉
  if (a.ax === 'x') k.box(m, l, h, s, u, y, v, rl, ry, rs);
  else k.box(m, s, h, l, v, y, u, rs, ry, rl);
}
// 貨櫃類：壓扁、側板翹起、門掉在旁邊
function wreckContainer(k, o) {
  const a = longAxis(o),
    r = o.r;
  const m = mat(SOOTY(o.col, 0.6), { roughness: 0.8, metalness: 0.4 }),
    d = mat(SOOTY(o.col, 0.35), { roughness: 0.9 });
  const n = Math.max(1, Math.round(a.L / 12.2));
  for (let i = 0; i < n; i++) {
    const u = -a.L / 2 + (a.L / n) * (i + 0.5);
    const h = Math.min(o.hw, 1.2) * r(0.7, 1);
    along(
      k,
      a,
      i % 2 ? d : m,
      (a.L / n) * 0.94,
      h,
      a.S * r(0.85, 0.98),
      u,
      h / 2,
      r(-0.2, 0.2),
      r(-0.05, 0.05),
      r(-0.06, 0.06),
      r(-0.08, 0.08),
    );
    // 翹起的側板
    along(
      k,
      a,
      m,
      (a.L / n) * 0.7,
      0.08,
      a.S * 0.8,
      u,
      h + 0.5,
      (a.S / 2) * (i % 2 ? 1 : -1),
      r(-0.1, 0.1),
      0,
      0.5 * (i % 2 ? 1 : -1),
    );
  }
  // 門掉在一端
  for (const s of [-1, 1])
    along(
      k,
      a,
      d,
      0.1,
      a.S * 0.45,
      2.4,
      a.L / 2 + 1.2,
      0.3,
      s * a.S * 0.3,
      0,
      r(-0.4, 0.4),
      Math.PI / 2 - 0.15,
    );
}
// 車輛：燒黑的車身塌下去、車頂歪、輪胎掉在旁邊
function wreckVehicle(k, o) {
  const a = longAxis(o),
    r = o.r;
  const body = mat(SOOTY(o.col, 0.5), { roughness: 0.85, metalness: 0.3 }),
    burnt = mat(SOOT, { roughness: 1 }),
    tire = mat(0x141414, { roughness: 1 });
  const L = a.L * 0.92,
    S = a.S * 0.85;
  const h = Math.min(Math.max(0.6, o.H * 0.35), 1.4);
  along(k, a, body, L, h, S, 0, h / 2 + 0.2, 0, r(-0.04, 0.04), 0, r(-0.06, 0.06));
  along(
    k,
    a,
    burnt,
    L * 0.4,
    h * 0.6,
    S * 0.8,
    L * 0.22,
    h + 0.2,
    0,
    r(-0.15, 0.15),
    r(-0.2, 0.2),
    r(-0.12, 0.12),
  );
  const nw = a.L > 8 ? 3 : 2;
  for (let i = 0; i < nw; i++)
    for (const s of [-1, 1]) {
      const u = -L / 2 + (L / (nw - 1 || 1)) * i;
      const off = r() < 0.35;
      const v = s * (S / 2 + (off ? r(0.8, 2.2) : 0));
      const x = a.ax === 'x' ? u : v,
        z = a.ax === 'x' ? v : u;
      k.cyl(
        tire,
        0.5,
        0.5,
        0.35,
        x,
        off ? 0.18 : 0.45,
        z,
        off ? 0 : Math.PI / 2,
        a.ax === 'x' ? 0 : Math.PI / 2,
        off ? 0 : 0,
        10,
      );
    }
}
// 燈桿、天線、信號燈：底座的斷口＋倒在地上的桿子
function wreckPole(k, o) {
  const r = o.r;
  const m = mat(SOOTY(o.col, 0.6), { roughness: 0.7, metalness: 0.5 });
  const R = Math.max(0.15, Math.min(o.W, o.D) * 0.3);
  k.cyl(m, R * 0.9, R, 1.4, 0, 0.7, 0, r(-0.08, 0.08), 0, r(-0.08, 0.08), 8);
  const len = Math.min(o.H * 0.85, 16),
    a = r(0, Math.PI * 2);
  const ex = Math.cos(a) * len,
    ez = Math.sin(a) * len;
  k.bar(m, [Math.cos(a) * 0.8, R + 0.1, Math.sin(a) * 0.8], [ex, R + 0.05, ez], R * 1.6);
  k.box(mat(0x2a2a2a, { roughness: 0.9 }), 0.9, 0.4, 0.6, ex, 0.3, ez, 0, -a, 0.2);
}
// 儲槽、球形槽：破裂的殼一圈往外翻，中間燒黑
function wreckTank(k, o) {
  const r = o.r;
  const m = mat(SOOTY(o.col, 0.55), { roughness: 0.75, metalness: 0.4 });
  const R = Math.min(o.W, o.D) * 0.45;
  const n = 10;
  const h = Math.max(1.2, Math.min(o.hw * 1.6, o.H * 0.3));
  for (let i = 0; i < n; i++) {
    if (r() < 0.25) continue; // 缺口
    const t = (i / n) * Math.PI * 2;
    const hh = h * r(0.5, 1.2);
    k.box(
      m,
      ((Math.PI * 2 * R) / n) * 1.02,
      hh,
      0.15,
      Math.sin(t) * R,
      hh / 2,
      Math.cos(t) * R,
      r(0.1, 0.45),
      t,
      0,
    );
  }
  k.cyl(mat(SOOT, { roughness: 1 }), R * 0.95, R * 0.95, 0.12, 0, 0.06, 0, 0, 0, 0, 16);
}
// 牆類：斷成幾塊、倒在地上，斷口露出鋼筋
function wreckWall(k, o) {
  const a = longAxis(o),
    r = o.r;
  const m = mat(SOOTY(o.col, 0.7), { roughness: 0.95 }),
    d = mat(SOOTY(o.col, 0.45), { roughness: 0.95 });
  const n = Math.max(2, Math.round(a.L / 3));
  const th = Math.max(0.3, a.S);
  for (let i = 0; i < n; i++) {
    const u = -a.L / 2 + (a.L / n) * (i + 0.5);
    const lay = r() < 0.6;
    const hh = lay ? th : Math.min(o.H * r(0.25, 0.5), o.hw * 2);
    along(
      k,
      a,
      i % 2 ? m : d,
      (a.L / n) * 0.9,
      lay ? Math.min(o.H, 3) * 0.5 : hh,
      lay ? Math.min(o.H, 3) : th,
      u,
      (lay ? th : hh) / 2,
      lay ? (r() < 0.5 ? -1 : 1) * Math.min(o.H, 3) * 0.4 : 0,
      0,
      r(-0.3, 0.3),
      lay ? 0 : r(-0.15, 0.15),
    );
    if (i % 2)
      k.bar(
        d,
        [a.ax === 'x' ? u : 0, th, a.ax === 'x' ? 0 : u],
        [a.ax === 'x' ? u + r(-1, 1) : r(-1, 1), th + 1.2, a.ax === 'x' ? r(-1, 1) : u + r(-1, 1)],
        0.05,
      );
  }
}
// 樹：倒下的樹幹＋樹樁
function wreckTree(k, o) {
  const r = o.r;
  const bark = mat(0x3a2a1c, { roughness: 1 }),
    leaf = mat(SOOTY(0x2e4a2a, 0.6), { roughness: 1 });
  const R = Math.max(0.2, Math.min(o.W, o.D) * 0.08);
  k.cyl(bark, R, R * 1.1, 0.9, 0, 0.45, 0, 0, 0, 0, 7);
  const a = r(0, Math.PI * 2),
    len = Math.min(o.H * 0.9, 18);
  k.bar(bark, [0, R, 0], [Math.cos(a) * len, R, Math.sin(a) * len], R * 1.8);
  k.cyl(
    leaf,
    0,
    Math.max(1, o.W * 0.35),
    len * 0.5,
    Math.cos(a) * len * 0.7,
    Math.max(1, o.W * 0.3),
    Math.sin(a) * len * 0.7,
    Math.PI / 2,
    -a,
    0,
    7,
  );
}
for (const kd of ['container', 'stack', 'boxcar', 'cargopod']) WRECK[kd] = wreckContainer;
for (const kd of ['car', 'bus', 'truck', 'mtwreck', 'fueltruck']) WRECK[kd] = wreckVehicle;
for (const kd of ['lamppost', 'streetlamp', 'lamp', 'floodlight', 'beacon', 'mast', 'commmast', 'pillar'])
  WRECK[kd] = wreckPole;
for (const kd of ['tank', 'fuelsphere', 'coraltank']) WRECK[kd] = wreckTank;
for (const kd of ['twall', 'blastwall', 'barrier', 'ruinwall', 'fence', 'snowwall']) WRECK[kd] = wreckWall;
WRECK.pine = wreckTree;
// 模型庫的預覽與 GLB 槽位（prop/wreck_<種類>）：代表的外形尺寸 [寬, 高, 深]
export const WRECK_REF = {
  container: [12.2, 2.6, 2.4],
  car: [4.4, 1.5, 1.8],
  bus: [12, 3.2, 2.5],
  truck: [16, 4, 2.5],
  lamppost: [0.6, 12, 0.6],
  tank: [12, 14, 12],
  twall: [3, 4, 1],
  pine: [5, 14, 5],
};
export const WRECK_NAME = {
  container: '貨櫃類（貨櫃、疊放貨櫃、有蓋貨車、貨物艙）',
  car: '車輛（車、MT 殘骸）',
  bus: '公車',
  truck: '卡車、燃料車',
  lamppost: '燈桿與天線（路燈、照明塔、信號燈桿、天線桿）',
  tank: '儲槽（儲槽、燃料槽、Coral 收容槽）',
  twall: '牆（T 型牆、防爆牆、護欄、斷牆、防風牆、雪牆）',
  pine: '針葉樹',
};
// 種類 → GLB 槽位（同一類共用一個槽位）
export const WRECK_SLOT = {};
for (const kd of ['container', 'stack', 'boxcar', 'cargopod']) WRECK_SLOT[kd] = 'container';
for (const kd of ['car', 'mtwreck']) WRECK_SLOT[kd] = 'car';
WRECK_SLOT.bus = 'bus';
for (const kd of ['truck', 'fueltruck']) WRECK_SLOT[kd] = 'truck';
for (const kd of ['lamppost', 'streetlamp', 'lamp', 'floodlight', 'beacon', 'mast', 'commmast', 'pillar'])
  WRECK_SLOT[kd] = 'lamppost';
for (const kd of ['tank', 'fuelsphere', 'coraltank']) WRECK_SLOT[kd] = 'tank';
for (const kd of ['twall', 'blastwall', 'barrier', 'ruinwall', 'fence', 'snowwall']) WRECK_SLOT[kd] = 'twall';
WRECK_SLOT.pine = 'pine';
// 模型庫的預覽：代表尺寸的殘骸
export function wreckPreview(slot) {
  const [W, H, D] = WRECK_REF[slot];
  const kind = slot === 'twall' ? 'twall' : slot;
  const p = {
    kind,
    idx: 7,
    shape: { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2, y0: 0, y1: H },
    mat: {
      container: 'metal',
      car: 'vehicle',
      bus: 'vehicle',
      truck: 'vehicle',
      lamppost: 'electric',
      tank: 'fuel',
      twall: 'concrete',
      pine: 'wood',
    }[slot],
    col: 0x3a3c40,
  };
  return buildWreck(p, 1, 1.8, true).group;
}
