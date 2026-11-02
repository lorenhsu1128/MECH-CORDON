// 地圖物件的破壞（docs/destruction-design.md）：材質表、各物件種類的材質、受損的階段、血量的換算。純資料與純函式。
//   材質決定：對三種屬性的傷害倍率 k＝[實彈, 爆發, 能量]、第 2 階段起的持續效果 fx、會不會起火 fire、
//   損毀時的演出 boom（'fire' 火球、'arc' 電弧、'coral' Coral 光）、碎片的形狀 deb、碎片的顏色 col（沒有時用物件的顏色）。
//   只有 fuel、vehicle、wood 會起火（2026-11-02 使用者定案：不是所有物件都會起火）。

export const PMAT = {
  concrete: { name: '混凝土', k: [0.6, 1.6, 0.5], fx: 'dust', deb: 'chunk', col: 0x8a8780 },
  metal: { name: '金屬', k: [0.8, 1.3, 0.7], fx: 'smoke', spark: true, deb: 'plate' },
  fuel: { name: '燃料', k: [1, 1.5, 1], fx: 'smoke', fire: true, boom: 'fire', deb: 'plate' },
  vehicle: { name: '車輛', k: [0.9, 1.4, 0.9], fx: 'smoke', fire: true, boom: 'fire', deb: 'plate' },
  electric: { name: '電氣', k: [0.8, 1.3, 1.2], fx: 'spark', spark: true, boom: 'arc', deb: 'plate' },
  rock: { name: '岩石', k: [0.5, 1.6, 0.4], fx: 'dust', deb: 'rock', col: 0x8c7f6c },
  ice: { name: '冰', k: [0.7, 1.3, 1.5], fx: 'ice', deb: 'ice', col: 0xcfe6f2 },
  wood: { name: '木', k: [1, 1.3, 1.2], fx: 'smoke', fire: true, deb: 'plank', col: 0x6b5236 },
  glass: { name: '玻璃帷幕', k: [1, 1.4, 1], fx: 'dust', deb: 'plate', col: 0x7d8a96 },
  coral: { name: 'Coral', k: [0.8, 1.2, 0.6], fx: 'coral', boom: 'coral', deb: 'crystal', col: 0xc0303a },
  pipe: { name: '管線', k: [0.9, 1.4, 0.9], fx: 'steam', deb: 'plate' },
};

// 材質表的顏色（sRGB 的色碼）換成遊戲裡用的線性值（r128 的 setHex 不轉換；地圖物件的頂點色是線性值）
const LIN = new Map();
export function linHex(hex) {
  let v = LIN.get(hex);
  if (v === undefined) LIN.set(hex, (v = new THREE.Color(hex).convertSRGBToLinear().getHex()));
  return v;
}
// 碎片、殘骸的顏色：材質有固定顏色的（混凝土、岩石、冰…）用它，其他用物件自己的顏色（p.col，線性值）
export function propDebrisCol(p, plate) {
  const M = PMAT[p.mat] || PMAT.metal;
  if (M.col !== undefined && !(plate && M.deb === 'plate')) return linHex(M.col);
  return typeof p.col === 'number' ? p.col : 0x202224;
}

// 物件種類 → 材質（沒有列的：主題的 propMat，再沒有時 metal）
export const PROP_MAT = {
  container: 'metal',
  stack: 'metal',
  boxcar: 'metal',
  cargopod: 'metal',
  hullplate: 'metal',
  scrapheap: 'metal',
  quonset: 'metal',
  hopper: 'metal',
  derrick: 'metal',
  pylon: 'metal',
  tower: 'metal',
  solar: 'metal',
  radiator: 'metal',
  dock: 'metal',
  fence: 'metal',
  truck: 'vehicle',
  car: 'vehicle',
  bus: 'vehicle',
  mtwreck: 'vehicle',
  fueltruck: 'fuel',
  tank: 'fuel',
  fuelsphere: 'fuel',
  barrels: 'fuel',
  drum: 'fuel',
  pillar: 'electric',
  lamppost: 'electric',
  streetlamp: 'electric',
  lamp: 'electric',
  floodlight: 'electric',
  beacon: 'electric',
  radar: 'electric',
  transformer: 'electric',
  mast: 'electric',
  commmast: 'electric',
  aaturret: 'electric',
  pillarBlock: 'concrete',
  twall: 'concrete',
  barrier: 'concrete',
  blastwall: 'concrete',
  ruinwall: 'concrete',
  control: 'concrete',
  tetrapod: 'concrete',
  planter: 'concrete',
  rock: 'rock',
  rockpile: 'rock',
  spire: 'rock',
  sandstone: 'rock',
  salt: 'rock',
  ice: 'ice',
  snowwall: 'ice',
  pine: 'wood',
  shack: 'wood',
  pipestack: 'pipe',
  piperun: 'pipe',
  coraltank: 'coral',
  crystal: 'coral',
};
// 主題的預設材質（產生器放的、沒有種類的物件）
const THEME_MAT = {
  desert: 'rock',
  dunes: 'rock',
  snow: 'concrete',
  flooded: 'concrete',
  institute: 'concrete',
  xylem: 'glass',
  dam: 'concrete',
};
export function propMatOf(kind, themeKey) {
  return PROP_MAT[kind] || THEME_MAT[themeKey] || 'metal';
}
const ATTR_I = { kin: 0, exp: 1, en: 2 };
// 屬性的傷害倍率（'none'＝撞碎、吸附這類不看材質的）
export function propAttrK(mat, attr) {
  const M = PMAT[mat] || PMAT.metal;
  const i = ATTR_I[attr];
  return i === undefined ? 1 : M.k[i];
}

// 受損的階段：0 完好、1 ≤ 75%、2 ≤ 50%、3 ≤ 25%、4 殘骸（0）
export function propStage(hp, maxHp) {
  if (hp <= 0) return 4;
  const f = hp / maxHp;
  return f <= 0.25 ? 3 : f <= 0.5 ? 2 : f <= 0.75 ? 1 : 0;
}
// 各階段的焦黑程度（顏色 ×(1−值)）
export const PROP_CHAR = [0, 0.16, 0.3, 0.44, 0.55];
// 依材質的耐久（血量的倍率）
const MAT_HP = { rock: 1.3, concrete: 1.2, metal: 1, pipe: 0.9, fuel: 0.8, vehicle: 0.8, electric: 0.8 };
// 新加入的物件（以前打不壞的）的血量：依高度的尺寸等級（docs/world-scale.md）與水平面積，再乘材質
export function propHpFor(h, w, d, mat) {
  const area = w * d;
  const [lo, hi] = h <= 2.2 ? [300, 1500] : h <= 4.5 ? [1500, 4000] : h <= 8 ? [3000, 9000] : [8000, 20000];
  const base = lo + Math.min(1, Math.sqrt(area) / 30) * (hi - lo);
  return Math.round((base * (MAT_HP[mat] || 0.7)) / 50) * 50;
}

// 踩平（docs/destruction-design.md）：機甲走過、QB 撞到就直接變成殘骸的雜物——高 2.6 m 以下且不太長的，
// 再加上這些細高的（燈桿、樹、護欄）
export const CRUSH = new Set([
  'barrier',
  'lamppost',
  'streetlamp',
  'lamp',
  'beacon',
  'pillar',
  'pine',
  'planter',
  'barrels',
  'drum',
  'car',
  'fence',
  'mast',
]);
export function propCrushable(p) {
  const sh = p.shape0 || p.shape;
  if (CRUSH.has(p.kind)) return true;
  return sh.y1 - sh.y0 <= 2.6 && Math.max(sh.x1 - sh.x0, sh.z1 - sh.z0) <= 14;
}
