// 環境陷阱的模型（docs/map-devices-design.md 的 C；純函式，不呼叫亂數）。
// 舊尺度建模（1＝3 m，遊戲裡整個乘 MS）；原點＝效果範圍的中心（地面）。會動的節點放在回傳群組的屬性上：
// wp＝弱點（發光，打壞就觸發）、load＝吊掛的貨櫃、tower＝會倒下的鐵塔（繞底部轉）、hole＝冰面破洞、
// grid＝通電的地板、arcs＝通電時的電光；命名為 glow 的材質依狀態發光（devices.js）。
import { CB, P, bakeAll, gBox, gCyl, gSph } from './geometry.js';
import { providedModel } from './model-provider.js';
import { tagStyle } from './style/shader.js';

const std = (color, o = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.35, flatShading: true, ...o });
const glowMat = (color) =>
  Object.assign(
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.3, roughness: 0.4 }),
    {
      name: 'glow',
    },
  );
const TINT = { tint: { ao: 0.8, grime: 0.35, gh: 0.6 } };
const node = (parent, name, y = 0) => {
  const n = new THREE.Group();
  n.name = name;
  n.position.y = y;
  parent.add(n);
  return n;
};
const glbOr = (slot, g, fn) => {
  const glb = providedModel(slot);
  if (!glb) return false;
  g.add(glb);
  for (const k of ['wp', 'load', 'tower', 'hole', 'grid', 'arcs']) g[k] = glb.getObjectByName(k) || null;
  return true;
};

// 貨運集散場：門型吊架吊著一捆貨櫃（4 個），弱點＝吊鉤（打斷就砸下來）
export function buildTrapCrane(color = 0xffb040) {
  const g = new THREE.Group();
  if (glbOr('device/crane', g)) return g;
  const steel = std(0xc89a2a, { metalness: 0.5 }),
    dark = std(0x2a2e33, { metalness: 0.6 }),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  for (const x of [-4.2, 4.2]) {
    CB(b, 0.5, 8.4, 0.5, steel, x, 4.2, -0.5);
    CB(b, 0.5, 8.4, 0.5, steel, x, 4.2, 0.5);
    CB(b, 1.4, 0.35, 1.8, dark, x, 0.18, 0);
    for (let y = 1.5; y < 8; y += 2) P(b, gBox(0.12, 0.12, 1.0), steel, x, y, 0);
  }
  CB(b, 9.2, 0.6, 1.5, steel, 0, 8.6, 0);
  CB(b, 1.2, 0.5, 1.2, dark, 0, 8.1, 0);
  bakeAll(b, { ...TINT, cache: 'trap_crane' });
  // 吊鉤與鋼索（打斷後藏起來）
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  P(w, gCyl(0.05, 0.05, 2.6, 6), dark, 0, 6.5, 0);
  P(w, gBox(0.5, 0.45, 0.5), glow, 0, 7.55, 0);
  P(w, gBox(2.4, 0.15, 0.5), dark, 0, 5.15, 0);
  bakeAll(w, { ...TINT, cache: 'trap_crane_wp' });
  // 一捆貨櫃（2×2，每個 4×0.9×0.9）
  const load = node(g, 'load', 3.2);
  const L = new THREE.Group();
  load.add(L);
  const cols = [0xb8562a, 0x2f5f8a, 0x7a8a3a, 0xa83a3a];
  let i = 0;
  for (const y of [0.45, 1.35])
    for (const z of [-0.46, 0.46]) {
      const m = std(cols[i++ % 4], { metalness: 0.3 });
      CB(L, 4, 0.88, 0.9, m, 0, y, z, 0, 0, 0, 0.04);
      for (let x = -1.8; x <= 1.8; x += 0.3) P(L, gBox(0.05, 0.8, 0.92), m, x, y, z);
    }
  P(L, gBox(4.1, 0.1, 2.0), dark, 0, 1.85, 0);
  bakeAll(L, { ...TINT, cache: 'trap_crane_load' });
  g.wp = wp;
  g.load = load;
  tagStyle(g);
  return g;
}

// 模擬訓練場：一片通電地板（10×10）＋旁邊的控制台
export function buildTrapShock(color = 0x7fc8ff) {
  const g = new THREE.Group();
  if (glbOr('device/shock', g)) return g;
  const base = std(0x3a4450, { metalness: 0.5 }),
    dark = std(0x22262c, { metalness: 0.6 }),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  P(b, gBox(10.4, 0.08, 10.4), base, 0, 0.04, 0);
  for (const s of [-1, 1]) {
    P(b, gBox(10.6, 0.16, 0.2), dark, 0, 0.08, s * 5.2);
    P(b, gBox(0.2, 0.16, 10.6), dark, s * 5.2, 0.08, 0);
  }
  // 控制台（在 +X 側）
  CB(b, 0.9, 1.3, 0.7, dark, 6.3, 0.65, 0);
  CB(b, 0.7, 0.12, 0.6, base, 6.3, 1.35, 0, 0, 0, 0.35);
  P(b, gBox(0.08, 0.4, 0.5), glow, 5.84, 1.0, 0);
  bakeAll(b, { ...TINT, cache: 'trap_shock' });
  const grid = node(g, 'grid');
  const gr = new THREE.Group();
  grid.add(gr);
  for (let k = -4; k <= 4; k += 2) {
    P(gr, gBox(10, 0.03, 0.1), glow, 0, 0.1, k);
    P(gr, gBox(0.1, 0.03, 10), glow, k, 0.1, 0);
  }
  bakeAll(gr, { ...TINT, cache: 'trap_shock_grid' });
  g.grid = grid;
  g.wp = null;
  tagStyle(g);
  return g;
}

// 礦坑遺跡：撐著岩壁的支撐木＋炸藥箱（弱點），打壞就坍方
export function buildTrapMine(color = 0xff6a3a) {
  const g = new THREE.Group();
  if (glbOr('device/mine', g)) return g;
  const wood = std(0x6a4a2a, { metalness: 0 }),
    rock = std(0x7a6a58, { metalness: 0 }),
    dark = std(0x2a2622),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  // 背後的岩堆
  const R = [
    [-2.2, 1.2, -2.2, 1.6],
    [0.2, 1.6, -2.6, 2.0],
    [2.4, 1.1, -2.1, 1.5],
    [-1.0, 2.8, -2.8, 1.3],
    [1.5, 2.9, -2.9, 1.2],
  ];
  for (const [x, y, z, s] of R) P(b, gSph(s, 6), rock, x, y, z, x, y * 2, z, 1, 0.8, 1);
  for (const x of [-1.8, 1.8]) CB(b, 0.32, 3.6, 0.32, wood, x, 1.8, -0.6);
  CB(b, 4.2, 0.35, 0.4, wood, 0, 3.7, -0.6);
  CB(b, 0.25, 3.0, 0.25, wood, -0.6, 1.5, -0.9, 0, 0, 0.25);
  bakeAll(b, { ...TINT, cache: 'trap_mine' });
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  for (const [x, z] of [
    [-0.5, 0.2],
    [0.45, 0.25],
  ]) {
    CB(w, 0.8, 0.6, 0.6, wood, x, 0.3, z);
    P(w, gBox(0.82, 0.12, 0.62), glow, x, 0.38, z);
  }
  CB(w, 0.7, 0.5, 0.55, wood, 0, 0.85, 0.2);
  P(w, gBox(0.72, 0.1, 0.57), glow, 0, 0.9, 0.2);
  bakeAll(w, { ...TINT, cache: 'trap_mine_wp' });
  g.wp = wp;
  tagStyle(g);
  return g;
}

// 冰原：冰湖的裂縫（地面的發光裂紋）＋冰晶的核心（弱點）；破洞（hole）平常藏起來
export function buildTrapIce(color = 0x9fe8ff) {
  const g = new THREE.Group();
  if (glbOr('device/ice', g)) return g;
  const ice = std(0xcfe6f0, { roughness: 0.25, metalness: 0.1 }),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.3;
    const L = 2.4 + (k % 3) * 0.9;
    P(b, gBox(L, 0.03, 0.09), glow, Math.cos(a) * L * 0.5, 0.04, Math.sin(a) * L * 0.5, 0, -a, 0);
  }
  bakeAll(b, { ...TINT, cache: 'trap_ice' });
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  P(w, gCyl(0.0, 0.5, 1.2, 6), ice, 0, 0.6, 0);
  P(w, gCyl(0.0, 0.32, 0.9, 6), glow, 0.55, 0.45, 0.2, 0, 0, 0.3);
  P(w, gCyl(0.0, 0.3, 0.8, 6), ice, -0.5, 0.4, -0.2, 0, 0, -0.35);
  bakeAll(w, { ...TINT, cache: 'trap_ice_wp' });
  const hole = node(g, 'hole');
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(5, 32),
    new THREE.MeshStandardMaterial({ color: 0x0a2a3a, roughness: 0.1, metalness: 0.2 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.06;
  hole.add(water);
  const hb = new THREE.Group();
  hole.add(hb);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    P(hb, gBox(1.2, 0.3, 0.8), ice, Math.cos(a) * 5.1, 0.1, Math.sin(a) * 5.1, 0.2, -a, 0.15);
  }
  bakeAll(hb, { ...TINT, cache: 'trap_ice_hole' });
  hole.visible = false;
  g.wp = wp;
  g.hole = hole;
  tagStyle(g);
  return g;
}

// 荒野：輸電鐵塔（高 12），弱點＝底部的變電箱；打壞後往 +Z 倒下（tower 繞底部轉）
export function buildTrapPylon(color = 0xffe060) {
  const g = new THREE.Group();
  if (glbOr('device/pylon', g)) return g;
  const steel = std(0x7a8288, { metalness: 0.6 }),
    dark = std(0x2a2e33),
    glow = glowMat(color);
  const tower = node(g, 'tower');
  const t = new THREE.Group();
  tower.add(t);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      P(t, gBox(0.18, 12.4, 0.18), steel, sx * 0.75, 6.0, sz * 0.75, sz * -0.07, 0, sx * 0.07);
      for (let y = 1.5; y < 11; y += 1.8)
        P(t, gBox(0.08, 0.08, 1.6 - y * 0.08), steel, sx * (0.8 - y * 0.04), y, 0);
    }
  CB(t, 5.2, 0.25, 0.3, steel, 0, 10.2, 0);
  CB(t, 3.6, 0.25, 0.3, steel, 0, 11.4, 0);
  for (const x of [-2.4, 2.4, -1.6, 1.6])
    P(t, gCyl(0.08, 0.08, 0.6, 6), glow, x, Math.abs(x) > 2 ? 9.8 : 11.0, 0);
  bakeAll(t, { ...TINT, cache: 'trap_pylon' });
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  CB(w, 1.0, 1.1, 0.8, dark, 1.6, 0.55, -0.4);
  P(w, gBox(0.6, 0.3, 0.82), glow, 1.6, 0.8, -0.4);
  bakeAll(w, { ...TINT, cache: 'trap_pylon_wp' });
  g.tower = tower;
  g.wp = wp;
  tagStyle(g);
  return g;
}

// 沙丘：天然氣井的井口（管線、閥門），弱點＝壓力槽
export function buildTrapGas(color = 0xff8a30) {
  const g = new THREE.Group();
  if (glbOr('device/gas', g)) return g;
  const pipe = std(0x8a6a3a, { metalness: 0.55 }),
    dark = std(0x2e2a26),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  CB(b, 2.4, 0.3, 2.4, dark, 0, 0.15, 0);
  P(b, gCyl(0.3, 0.3, 2.4, 10), pipe, 0, 1.4, 0);
  for (const y of [1.0, 1.9]) P(b, gCyl(0.45, 0.45, 0.18, 10), dark, 0, y, 0);
  P(b, gCyl(0.15, 0.15, 2.0, 8), pipe, 1.0, 1.2, 0, 0, 0, Math.PI / 2);
  P(b, gCyl(0.35, 0.35, 0.08, 10), dark, 0.6, 1.6, 0.35, Math.PI / 2, 0, 0);
  bakeAll(b, { ...TINT, cache: 'trap_gas' });
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  P(w, gCyl(0.55, 0.55, 1.6, 12), pipe, -1.3, 0.9, 0.6);
  P(w, gCyl(0.57, 0.57, 0.2, 12), glow, -1.3, 1.1, 0.6);
  bakeAll(w, { ...TINT, cache: 'trap_gas_wp' });
  g.wp = wp;
  tagStyle(g);
  return g;
}

// 水沒市街：電線桿＋變壓器（弱點），斷掉的電纜垂到水裡
export function buildTrapCable(color = 0x8fd8ff) {
  const g = new THREE.Group();
  if (glbOr('device/cable', g)) return g;
  const pole = std(0x5a5048, { metalness: 0.1 }),
    dark = std(0x24272b),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  P(b, gCyl(0.16, 0.22, 7.6, 8), pole, 0, 3.8, 0);
  CB(b, 2.4, 0.18, 0.18, pole, 0, 7.0, 0);
  for (const x of [-1, 1]) P(b, gCyl(0.07, 0.07, 0.3, 6), dark, x, 7.25, 0);
  // 垂下來的電纜（幾段斜線）
  const pts = [
    [1, 7.1, 0],
    [1.8, 5.0, 0.6],
    [2.4, 2.6, 1.2],
    [2.8, 0.2, 1.9],
  ];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = new THREE.Vector3(...pts[k]),
      c = new THREE.Vector3(...pts[k + 1]);
    const m = a.clone().add(c).multiplyScalar(0.5),
      d = c.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const e = new THREE.Euler().setFromQuaternion(q);
    P(b, gCyl(0.05, 0.05, d.length(), 6), dark, m.x, m.y, m.z, e.x, e.y, e.z);
  }
  bakeAll(b, { ...TINT, cache: 'trap_cable' });
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  P(w, gCyl(0.42, 0.42, 1.0, 10), dark, 0, 5.6, 0.45);
  P(w, gCyl(0.44, 0.44, 0.15, 10), glow, 0, 5.85, 0.45);
  bakeAll(w, { ...TINT, cache: 'trap_cable_wp' });
  g.wp = wp;
  tagStyle(g);
  return g;
}

// ---------- 第 3 期：後 6 個主題 ----------
// 控制台（互動型共用）：在 (x, z)，螢幕朝 −X
function consoleAt(b, dark, base, glow, x, z) {
  CB(b, 0.9, 1.3, 0.7, dark, x, 0.65, z);
  CB(b, 0.7, 0.12, 0.6, base, x, 1.35, z, 0, 0, 0.35);
  P(b, gBox(0.08, 0.4, 0.5), glow, x - 0.46, 1.0, z);
}

// 多重水壩：放水的閘口（往 +Z 噴水）＋旁邊的控制台
export function buildTrapSluice(color = 0x7fd0ff) {
  const g = new THREE.Group();
  if (glbOr('device/sluice', g)) return g;
  const conc = std(0x8a8a84, { metalness: 0 }),
    dark = std(0x2a2e33, { metalness: 0.6 }),
    base = std(0x4a525a),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  CB(b, 3.4, 2.6, 2.2, conc, 0, 1.3, -1.6, 0, 0, 0, 0.12);
  CB(b, 2.2, 1.5, 0.3, dark, 0, 1.0, -0.45);
  P(b, gBox(2.0, 0.12, 0.32), glow, 0, 1.85, -0.42);
  for (const x of [-1.25, 1.25]) CB(b, 0.3, 2.2, 0.5, conc, x, 1.1, -0.35);
  consoleAt(b, dark, base, glow, 3.4, -1.2);
  bakeAll(b, { ...TINT, cache: 'trap_sluice' });
  g.wp = null;
  tagStyle(g);
  return g;
}

// 舊宇宙港：推進器的試車台（噴口朝 +Z）＋控制台
export function buildTrapTestRig(color = 0xff9a40) {
  const g = new THREE.Group();
  if (glbOr('device/testrig', g)) return g;
  const steel = std(0x9aa0a6, { metalness: 0.6 }),
    dark = std(0x2a2e33, { metalness: 0.6 }),
    base = std(0x4a525a),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  CB(b, 2.6, 0.4, 3.2, dark, 0, 0.2, -0.6);
  for (const x of [-1, 1]) CB(b, 0.25, 1.8, 0.25, steel, x, 1.1, -1.2);
  P(b, gCyl(0.9, 0.9, 2.2, 14), steel, 0, 1.7, -1.0, Math.PI / 2, 0, 0);
  P(b, gCyl(0.7, 1.15, 1.2, 14), dark, 0, 1.7, 0.6, Math.PI / 2, 0, 0);
  P(b, gCyl(0.62, 0.62, 0.05, 14), glow, 0, 1.7, 1.15, Math.PI / 2, 0, 0);
  consoleAt(b, dark, base, glow, -3.2, -1.2);
  bakeAll(b, { ...TINT, cache: 'trap_testrig' });
  g.wp = null;
  tagStyle(g);
  return g;
}

// Grid 086：單柱懸臂吊著一捆廢料（弱點＝吊鉤）
export function buildTrapScrap(color = 0xffa040) {
  const g = new THREE.Group();
  if (glbOr('device/scrap', g)) return g;
  const steel = std(0x6a6258, { metalness: 0.55 }),
    dark = std(0x2a2622, { metalness: 0.6 }),
    rust = std(0x8a4a2a, { metalness: 0.3 }),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  CB(b, 0.8, 9, 0.8, steel, -4.2, 4.5, 0);
  CB(b, 1.8, 0.4, 1.8, dark, -4.2, 0.2, 0);
  CB(b, 5.4, 0.6, 0.6, steel, -1.8, 8.8, 0);
  P(b, gBox(0.1, 2.6, 0.1), steel, -3.4, 7.6, 0, 0, 0, 0.75);
  bakeAll(b, { ...TINT, cache: 'trap_scrap' });
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  P(w, gCyl(0.05, 0.05, 3.3, 6), dark, 0, 6.8, 0);
  P(w, gBox(0.5, 0.45, 0.5), glow, 0, 8.3, 0);
  bakeAll(w, { ...TINT, cache: 'trap_scrap_wp' });
  const load = node(g, 'load', 3.2);
  const L = new THREE.Group();
  load.add(L);
  const parts = [
    [0, 0.5, 0, 3.2, 1.0, 2.0, 0.1],
    [-0.6, 1.3, 0.3, 1.8, 0.7, 1.4, -0.3],
    [0.8, 1.2, -0.4, 1.4, 0.8, 1.2, 0.4],
    [0.1, 1.9, 0, 1.2, 0.6, 1.0, 0.2],
  ];
  parts.forEach(([x, y, z, w0, h0, d0, r], i) =>
    CB(L, w0, h0, d0, i % 2 ? rust : dark, x, y, z, r * 0.4, r, r * 0.5),
  );
  P(L, gBox(0.12, 0.12, 2.4), steel, 0, 2.3, 0);
  bakeAll(L, { ...TINT, cache: 'trap_scrap_load' });
  g.wp = wp;
  g.load = load;
  tagStyle(g);
  return g;
}

// 洋上都市：海水的大閥門（噴口朝 +Z），閥門本身是控制台
export function buildTrapValve(color = 0x6ad8ff) {
  const g = new THREE.Group();
  if (glbOr('device/valve', g)) return g;
  const pipe = std(0x3a6a7a, { metalness: 0.55 }),
    dark = std(0x24272b, { metalness: 0.6 }),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  P(b, gCyl(0.9, 0.9, 3.2, 14), pipe, 0, 0.9, -1.4, Math.PI / 2, 0, 0);
  P(b, gCyl(1.1, 1.1, 0.25, 14), dark, 0, 0.9, -0.2, Math.PI / 2, 0, 0);
  P(b, gCyl(0.7, 0.9, 0.6, 14), pipe, 0, 0.9, 0.2, Math.PI / 2, 0, 0);
  P(b, gCyl(0.6, 0.6, 0.05, 14), glow, 0, 0.9, 0.52, Math.PI / 2, 0, 0);
  P(b, gCyl(0.15, 0.15, 1.2, 8), dark, 0, 2.1, -1.6);
  P(b, gCyl(0.75, 0.75, 0.1, 16), glow, 0, 2.7, -1.6);
  CB(b, 2.2, 0.3, 3.6, dark, 0, 0.15, -1.4);
  bakeAll(b, { ...TINT, cache: 'trap_valve' });
  g.wp = null;
  tagStyle(g);
  return g;
}

// 高空軌道：氣閘（門框朝 +Z）＋控制台
export function buildTrapAirlock(color = 0xffd060) {
  const g = new THREE.Group();
  if (glbOr('device/airlock', g)) return g;
  const hull = std(0xc8ccd0, { metalness: 0.4 }),
    dark = std(0x2a2e33, { metalness: 0.6 }),
    base = std(0x4a525a),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  for (const x of [-2.4, 2.4]) CB(b, 0.6, 4.4, 1.2, hull, x, 2.2, 0);
  CB(b, 5.4, 0.7, 1.2, hull, 0, 4.55, 0);
  CB(b, 4.2, 3.9, 0.2, dark, 0, 2.0, -0.1);
  for (let k = -1; k <= 1; k++) P(b, gBox(0.12, 3.6, 0.22), glow, k * 1.3, 2.0, 0.05);
  P(b, gBox(5.0, 0.15, 0.22), glow, 0, 4.25, 0.5);
  consoleAt(b, dark, base, glow, 3.6, -1.0);
  bakeAll(b, { ...TINT, cache: 'trap_airlock' });
  g.wp = null;
  tagStyle(g);
  return g;
}

// 地下技研都市：Coral 收容槽（玻璃筒裡紅色的 Coral，弱點＝筒身）
export function buildTrapCoral(color = 0xff4a5a) {
  const g = new THREE.Group();
  if (glbOr('device/coral', g)) return g;
  const steel = std(0x5a6068, { metalness: 0.6 }),
    dark = std(0x24272b),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  P(b, gCyl(1.3, 1.5, 0.6, 16), steel, 0, 0.3, 0);
  P(b, gCyl(1.2, 1.2, 0.4, 16), dark, 0, 3.4, 0);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    P(b, gBox(0.18, 2.8, 0.18), steel, Math.cos(a) * 1.15, 1.9, Math.sin(a) * 1.15);
  }
  P(b, gCyl(0.2, 0.2, 2.4, 8), dark, 1.9, 1.2, 0, 0, 0, Math.PI / 2);
  bakeAll(b, { ...TINT, cache: 'trap_coral' });
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  P(w, gCyl(0.75, 0.75, 2.4, 12), glow, 0, 1.8, 0);
  bakeAll(w, { ...TINT, cache: 'trap_coral_wp' });
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.05, 2.7, 16, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.25, roughness: 0.05 }),
  );
  glass.position.y = 1.85;
  wp.add(glass);
  g.wp = wp;
  tagStyle(g);
  return g;
}

export const TRAP_BUILDERS = {
  sluice: buildTrapSluice,
  testrig: buildTrapTestRig,
  scrap: buildTrapScrap,
  valve: buildTrapValve,
  airlock: buildTrapAirlock,
  coral: buildTrapCoral,
  crane: buildTrapCrane,
  shock: buildTrapShock,
  mine: buildTrapMine,
  ice: buildTrapIce,
  pylon: buildTrapPylon,
  gas: buildTrapGas,
  cable: buildTrapCable,
};
