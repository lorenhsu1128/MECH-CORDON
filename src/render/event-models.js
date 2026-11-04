// 大型地形事件的模型（docs/map-devices-design.md 的 F；純函式，不呼叫亂數）。
// 舊尺度（遊戲裡乘 MS），原點＝事件的中心（地面）。會動的節點：tower＝倒下（繞原點的 X 轉向 +Z）、
// sink＝沉下去、slide＝往 +Z 滑下；wp＝弱點；命名為 glow 的材質依狀態發光。
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
const TINT = { tint: { ao: 0.8, grime: 0.35, gh: 0.7 } };
const node = (parent, name, y = 0) => {
  const n = new THREE.Group();
  n.name = name;
  n.position.y = y;
  parent.add(n);
  return n;
};
const glbOr = (slot, g) => {
  const glb = providedModel(slot);
  if (!glb) return false;
  g.add(glb);
  for (const k of ['wp', 'tower', 'sink', 'slide']) g[k] = glb.getObjectByName(k) || null;
  return true;
};
// 弱點（發光的炸藥／接頭）：放在 parent 的 (x, y, z)
const wpNode = (g, color, x, y, z, s = 1, cache = 'ev_wp') => {
  const wp = node(g, 'wp');
  const w = new THREE.Group();
  wp.add(w);
  CB(w, 1.0 * s, 1.0 * s, 1.0 * s, std(0x3a2a22), x, y, z);
  P(w, gBox(1.05 * s, 0.25 * s, 1.05 * s), glowMat(color), x, y + 0.1 * s, z);
  bakeAll(w, { ...TINT, cache: cache + s });
  g.wp = wp;
};

// 貨運集散場：大型龍門吊（高 12、跨 14），弱點＝一隻腳的底座，往 +Z 倒下
export function buildEvGantry(color = 0xffb040) {
  const g = new THREE.Group();
  if (glbOr('device/gantry', g)) return g;
  const steel = std(0xd0a020, { metalness: 0.5 }),
    dark = std(0x2a2e33);
  const tower = node(g, 'tower');
  const t = new THREE.Group();
  tower.add(t);
  for (const x of [-7, 7]) {
    CB(t, 0.9, 12, 0.9, steel, x, 6, 0);
    for (let y = 2; y < 11; y += 2.5) P(t, gBox(0.15, 0.15, 1.6), steel, x, y, 0);
  }
  CB(t, 16, 1.0, 1.6, steel, 0, 12.4, 0);
  CB(t, 2.4, 1.2, 2.0, dark, -2, 11.4, 0);
  P(t, gCyl(0.06, 0.06, 6, 6), dark, -2, 8, 0);
  bakeAll(t, { ...TINT, cache: 'ev_gantry' });
  const b = new THREE.Group();
  g.add(b);
  for (const x of [-7, 7]) CB(b, 2.6, 0.5, 2.6, dark, x, 0.25, 0);
  bakeAll(b, { ...TINT, cache: 'ev_gantry_base' });
  wpNode(g, color, 7, 1.2, -1.2);
  g.tower = tower;
  tagStyle(g);
  return g;
}

// 模擬訓練場：場地重組的控制台＋三面會沉下去的牆（sink）
export function buildEvReshape(color = 0x7fc8ff) {
  const g = new THREE.Group();
  if (glbOr('device/reshape', g)) return g;
  const wall = std(0xd8dde2, { metalness: 0.1 }),
    dark = std(0x24282d),
    glow = glowMat(color);
  const sink = node(g, 'sink');
  const s = new THREE.Group();
  sink.add(s);
  for (const [x, z, w, d] of [
    [0, 6, 10, 1],
    [-6, 0, 1, 8],
    [6, -2, 1, 6],
  ]) {
    CB(s, w, 4, d, wall, x, 2, z, 0, 0, 0, 0.08);
    P(s, gBox(w * 0.9, 0.1, d + 0.04), glow, x, 3.6, z);
  }
  bakeAll(s, { ...TINT, cache: 'ev_reshape' });
  const b = new THREE.Group();
  g.add(b);
  CB(b, 1.2, 1.6, 0.9, dark, 0, 0.8, -4);
  P(b, gBox(0.9, 0.5, 0.08), glow, 0, 1.3, -3.53);
  bakeAll(b, { ...TINT, cache: 'ev_reshape_c' });
  g.sink = sink;
  g.wp = null;
  tagStyle(g);
  return g;
}

// 礦坑遺跡：封住坑道的岩石堵塞（sink：炸開後沉下去），弱點＝埋在岩石裡的炸藥
export function buildEvTunnel(color = 0xff6a3a) {
  const g = new THREE.Group();
  if (glbOr('device/tunnel', g)) return g;
  const rock = std(0x7a6a58, { metalness: 0 }),
    wood = std(0x5a3e24, { metalness: 0 });
  const b = new THREE.Group();
  g.add(b);
  for (const x of [-5.5, 5.5]) CB(b, 1.2, 6, 1.2, wood, x, 3, 0);
  CB(b, 12.4, 1.0, 1.4, wood, 0, 6.2, 0);
  bakeAll(b, { ...TINT, cache: 'ev_tunnel' });
  const sink = node(g, 'sink');
  const s = new THREE.Group();
  sink.add(s);
  const R = [
    [-3, 1.5, 0, 2.4],
    [0, 2.0, 0.3, 2.8],
    [3, 1.6, -0.2, 2.3],
    [-1.5, 4.0, 0, 1.9],
    [1.8, 4.2, 0.2, 1.8],
  ];
  for (const [x, y, z, r] of R) P(s, gSph(r, 7), rock, x, y, z, x, y, z, 1, 0.9, 0.8);
  bakeAll(s, { ...TINT, cache: 'ev_tunnel_rock' });
  wpNode(g, color, 0.5, 1.4, 2.4, 1.2);
  g.sink = sink;
  tagStyle(g);
  return g;
}

// 冰原：冰崖（slide：崩落時往 +Z 滑下），弱點＝冰崖底部的裂縫核心
export function buildEvAvalanche(color = 0x9fe8ff) {
  const g = new THREE.Group();
  if (glbOr('device/avalanche', g)) return g;
  const ice = std(0xd8eef6, { roughness: 0.3, metalness: 0.05 }),
    snow = std(0xf2f6f8, { metalness: 0 });
  const slide = node(g, 'slide');
  const s = new THREE.Group();
  slide.add(s);
  CB(s, 14, 7, 5, ice, 0, 3.5, -2.5, 0.1, 0, 0, 0.6);
  CB(s, 12, 2, 4, snow, 0, 7.6, -3, 0.15, 0, 0, 0.5);
  for (const x of [-5, -1.5, 2, 5.5]) P(s, gSph(1.8, 6), ice, x, 5.5 + (x % 2), -0.4, x, 0, 0, 1, 1.3, 0.7);
  bakeAll(s, { ...TINT, cache: 'ev_aval' });
  wpNode(g, color, 0, 1.2, 0.4, 1.2);
  g.slide = slide;
  tagStyle(g);
  return g;
}

// 荒野：大煙囪（高 16），弱點＝底部，往 +Z 倒下
export function buildEvChimney(color = 0xff8a40) {
  const g = new THREE.Group();
  if (glbOr('device/chimney', g)) return g;
  const brick = std(0x8a5a44, { metalness: 0 }),
    dark = std(0x2a2622);
  const tower = node(g, 'tower');
  const t = new THREE.Group();
  tower.add(t);
  P(t, gCyl(1.2, 1.7, 16, 12), brick, 0, 8, 0);
  for (const y of [4, 8, 12, 15.6]) P(t, gCyl(1.75 - y * 0.03, 1.75 - y * 0.03, 0.3, 12), dark, 0, y, 0);
  bakeAll(t, { ...TINT, cache: 'ev_chimney' });
  const b = new THREE.Group();
  g.add(b);
  CB(b, 4.2, 1.2, 4.2, dark, 0, 0.6, 0);
  bakeAll(b, { ...TINT, cache: 'ev_chimney_b' });
  wpNode(g, color, 0, 1.5, 2.0, 1.1);
  g.tower = tower;
  tagStyle(g);
  return g;
}

// 沙丘：抽沙機（打壞後地面塌陷成流沙），弱點＝馬達
export function buildEvSinkhole(color = 0xffb060) {
  const g = new THREE.Group();
  if (glbOr('device/sinkhole', g)) return g;
  const steel = std(0x8a7048, { metalness: 0.5 }),
    dark = std(0x2e2a26);
  const b = new THREE.Group();
  g.add(b);
  CB(b, 3, 0.5, 3, dark, 0, 0.25, 0);
  for (const [x, z] of [
    [-1.2, -1.2],
    [1.2, -1.2],
    [0, 1.3],
  ])
    P(b, gBox(0.2, 6.5, 0.2), steel, x * 0.6, 3.2, z * 0.6, z * 0.12, 0, -x * 0.12);
  P(b, gCyl(0.25, 0.25, 7, 8), steel, 0, 3.5, 0);
  bakeAll(b, { ...TINT, cache: 'ev_sinkhole' });
  wpNode(g, color, 1.4, 0.9, 0.4, 1.0);
  const hole = node(g, 'hole');
  const sand = new THREE.Mesh(
    new THREE.CircleGeometry(13, 40),
    new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1, transparent: true, opacity: 0.85 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = 0.08;
  hole.add(sand);
  hole.visible = false;
  g.hole = hole;
  tagStyle(g);
  return g;
}

// 水沒市街：抽水站（控制台：水位上升），sink＝排水口的閘門
export function buildEvPump(color = 0x6ad8ff) {
  const g = new THREE.Group();
  if (glbOr('device/pump', g)) return g;
  const conc = std(0x7a807e, { metalness: 0 }),
    pipe = std(0x4a6a6a, { metalness: 0.5 }),
    dark = std(0x24282d),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  CB(b, 6, 4, 5, conc, 0, 2, -1, 0, 0, 0, 0.15);
  CB(b, 6.4, 0.4, 5.4, dark, 0, 4.2, -1);
  for (const x of [-1.8, 0, 1.8]) P(b, gCyl(0.5, 0.5, 3, 10), pipe, x, 1.0, 2.6, Math.PI / 2, 0, 0);
  CB(b, 1.0, 1.4, 0.8, dark, 3.8, 0.7, 1.5);
  P(b, gBox(0.08, 0.45, 0.6), glow, 3.28, 1.1, 1.5);
  P(b, gBox(4.8, 0.12, 0.1), glow, 0, 3.5, 1.52);
  bakeAll(b, { ...TINT, cache: 'ev_pump' });
  const hole = node(g, 'hole');
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(20, 48),
    new THREE.MeshStandardMaterial({
      color: 0x2a4a50,
      roughness: 0.15,
      metalness: 0.2,
      transparent: true,
      opacity: 0.7,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.3;
  hole.add(water);
  hole.visible = false;
  g.hole = hole;
  g.wp = null;
  tagStyle(g);
  return g;
}

// ---------- 第 6 期：後 6 個主題 ----------
const consoleBox = (b, dark, glow, x, z) => {
  CB(b, 1.1, 1.5, 0.9, dark, x, 0.75, z);
  P(b, gBox(0.08, 0.5, 0.7), glow, x - 0.56, 1.15, z);
};

// 多重水壩：洩洪閘（sink：閘門升起＝往下沉的反向，這裡用沉下去表示打開），控制台在旁邊
export function buildEvSpillway(color = 0x7fd0ff) {
  const g = new THREE.Group();
  if (glbOr('device/spillway', g)) return g;
  const conc = std(0x8a8a84, { metalness: 0 }),
    dark = std(0x2a2e33, { metalness: 0.6 }),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  for (const x of [-6, 6]) CB(b, 2, 7, 4, conc, x, 3.5, -1, 0, 0, 0, 0.15);
  CB(b, 14, 1.2, 4, conc, 0, 7.4, -1);
  consoleBox(b, dark, glow, 8.4, -2);
  bakeAll(b, { ...TINT, cache: 'ev_spill' });
  const sink = node(g, 'sink');
  const s = new THREE.Group();
  sink.add(s);
  CB(s, 10, 6.4, 0.8, dark, 0, 3.4, -0.6);
  for (let y = 1; y < 6.5; y += 1.4) P(s, gBox(10.1, 0.12, 0.85), glow, 0, y, -0.6);
  bakeAll(s, { ...TINT, cache: 'ev_spill_gate' });
  const hole = node(g, 'hole');
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 28),
    new THREE.MeshStandardMaterial({
      color: 0x3a6a80,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.65,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.3, 14);
  hole.add(water);
  hole.visible = false;
  g.sink = sink;
  g.hole = hole;
  g.wp = null;
  tagStyle(g);
  return g;
}

// 舊宇宙港：火箭的發射架（高 18），弱點＝底座的固定夾，往 +Z 倒下
export function buildEvLaunchTower(color = 0xff9a40) {
  const g = new THREE.Group();
  if (glbOr('device/launchtower', g)) return g;
  const steel = std(0xa0a6ac, { metalness: 0.6 }),
    red = std(0xa83a2a, { metalness: 0.4 }),
    dark = std(0x2a2e33);
  const tower = node(g, 'tower');
  const t = new THREE.Group();
  tower.add(t);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) P(t, gBox(0.3, 18, 0.3), red, sx * 1.4, 9, sz * 1.4);
  for (let y = 2; y < 18; y += 2.2) {
    P(t, gBox(3.1, 0.18, 0.18), red, 0, y, 1.4);
    P(t, gBox(3.1, 0.18, 0.18), red, 0, y, -1.4);
  }
  CB(t, 4, 0.6, 4, steel, 0, 18.2, 0);
  CB(t, 5, 0.4, 0.6, steel, 2.4, 14, 0);
  bakeAll(t, { ...TINT, cache: 'ev_ltower' });
  const b = new THREE.Group();
  g.add(b);
  CB(b, 5, 0.8, 5, dark, 0, 0.4, 0);
  bakeAll(b, { ...TINT, cache: 'ev_ltower_b' });
  wpNode(g, color, 0, 1.4, 2.6, 1.1);
  g.tower = tower;
  tagStyle(g);
  return g;
}

// Grid 086：直立收起的吊橋（tower：放下時往 +Z 倒），控制台在後方
export function buildEvDrawbridge(color = 0xffc060) {
  const g = new THREE.Group();
  if (glbOr('device/drawbridge', g)) return g;
  const steel = std(0x6a6258, { metalness: 0.55 }),
    dark = std(0x2a2622, { metalness: 0.6 }),
    glow = glowMat(color);
  const tower = node(g, 'tower');
  const t = new THREE.Group();
  tower.add(t);
  CB(t, 8, 15, 1.0, steel, 0, 7.5, 0);
  for (let y = 1.5; y < 15; y += 2.5) P(t, gBox(8.1, 0.2, 1.1), dark, 0, y, 0);
  P(t, gBox(0.2, 14, 1.12), glow, -3.9, 7.5, 0);
  P(t, gBox(0.2, 14, 1.12), glow, 3.9, 7.5, 0);
  bakeAll(t, { ...TINT, cache: 'ev_dbridge' });
  const b = new THREE.Group();
  g.add(b);
  for (const x of [-4.8, 4.8]) CB(b, 1.2, 3, 1.6, dark, x, 1.5, -0.6);
  consoleBox(b, dark, glow, 6.6, -3);
  bakeAll(b, { ...TINT, cache: 'ev_dbridge_b' });
  g.tower = tower;
  g.wp = null;
  tagStyle(g);
  return g;
}

// 洋上都市：防波閘（sink 反過來：觸發後升起，這裡由 cover 的臨時障礙物表現），控制台＋閘門的軌道
export function buildEvSeawall(color = 0x6ad8ff) {
  const g = new THREE.Group();
  if (glbOr('device/seawall', g)) return g;
  const conc = std(0x8a9090, { metalness: 0 }),
    dark = std(0x24282d),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  CB(b, 18, 0.4, 2.4, conc, 0, 0.2, 0);
  P(b, gBox(17.6, 0.1, 0.3), glow, 0, 0.42, 0);
  for (const x of [-9.4, 9.4]) CB(b, 0.8, 5, 1.6, dark, x, 2.5, 0);
  consoleBox(b, dark, glow, 0, -3.2);
  bakeAll(b, { ...TINT, cache: 'ev_seawall' });
  g.wp = null;
  tagStyle(g);
  return g;
}

// 高空軌道：對接艙（slide：脫離後往 +Z 滑出並掉下去），弱點＝固定夾
export function buildEvDock(color = 0xffd060) {
  const g = new THREE.Group();
  if (glbOr('device/dock', g)) return g;
  const hull = std(0xc8ccd0, { metalness: 0.4 }),
    dark = std(0x2a2e33, { metalness: 0.6 });
  const slide = node(g, 'slide');
  const s = new THREE.Group();
  slide.add(s);
  P(s, gCyl(3, 3, 9, 16), hull, 0, 3, 4, Math.PI / 2, 0, 0);
  for (const z of [0.5, 4, 7.5]) P(s, gCyl(3.15, 3.15, 0.5, 16), dark, 0, 3, z, Math.PI / 2, 0, 0);
  CB(s, 2, 2, 1, dark, 0, 3, 8.8);
  bakeAll(s, { ...TINT, cache: 'ev_dock' });
  const b = new THREE.Group();
  g.add(b);
  for (const x of [-3.4, 3.4]) CB(b, 0.8, 3, 1.2, dark, x, 1.5, -0.6);
  bakeAll(b, { ...TINT, cache: 'ev_dock_b' });
  wpNode(g, color, 3.4, 3.4, -0.4, 1.0);
  g.slide = slide;
  tagStyle(g);
  return g;
}

// 地下技研都市：防爆門（sink：打開時沉下去），控制台在旁邊；門後有補給箱與一群敵人
export function buildEvBlastDoor(color = 0xff6a6a) {
  const g = new THREE.Group();
  if (glbOr('device/blastdoor', g)) return g;
  const wall = std(0x4a4e56, { metalness: 0.5 }),
    dark = std(0x24272b, { metalness: 0.6 }),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  for (const x of [-7.5, 7.5]) CB(b, 3, 9, 3, wall, x, 4.5, 0);
  CB(b, 18, 2, 3, wall, 0, 9.4, 0);
  consoleBox(b, dark, glow, 10.2, -2.4);
  bakeAll(b, { ...TINT, cache: 'ev_bdoor' });
  const sink = node(g, 'sink');
  const s = new THREE.Group();
  sink.add(s);
  CB(s, 12, 8.4, 1.4, dark, 0, 4.2, 0);
  for (let k = -2; k <= 2; k++) P(s, gBox(0.3, 8, 1.45), glow, k * 2.4, 4.2, 0);
  bakeAll(s, { ...TINT, cache: 'ev_bdoor_d' });
  g.sink = sink;
  g.wp = null;
  tagStyle(g);
  return g;
}

export const EVENT_BUILDERS = {
  spillway: buildEvSpillway,
  launchtower: buildEvLaunchTower,
  drawbridge: buildEvDrawbridge,
  seawall: buildEvSeawall,
  dock: buildEvDock,
  blastdoor: buildEvBlastDoor,
  gantry: buildEvGantry,
  reshape: buildEvReshape,
  tunnel: buildEvTunnel,
  avalanche: buildEvAvalanche,
  chimney: buildEvChimney,
  sinkhole: buildEvSinkhole,
  pump: buildEvPump,
};
