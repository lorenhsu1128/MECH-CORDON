// 固定砲台與重武器的模型（docs/map-devices-design.md 的 G；純函式，不呼叫亂數）。
// 舊尺度建模（遊戲裡乘 MS）；砲台的 head 節點繞 Y 轉（砲口朝 +Z），muzzle＝砲口在 head 裡的位置。
import { CB, P, bakeAll, gBox, gCyl } from './geometry.js';
import { providedModel } from './model-provider.js';
import { tagStyle } from './style/shader.js';

const std = (color, o = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.5, flatShading: true, ...o });
const glowMat = (color) =>
  Object.assign(
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: 0.4 }),
    {
      name: 'glow',
    },
  );
const TINT = { tint: { ao: 0.8, grime: 0.3, gh: 0.6 } };
export const GUN_MUZZLE = {
  hmg: [0, 1.95, 3.0],
  rail: [0, 1.95, 4.2],
  msl: [0, 2.3, 1.2],
  flak: [0, 2.1, 3.4],
};

// 固定砲台：圓形基座＋旋轉的砲塔（依種類換砲身）
export function buildGunTurret(kind, color) {
  const g = new THREE.Group();
  const glb = providedModel('device/gun_' + kind);
  if (glb) {
    g.add(glb);
    g.head = glb.getObjectByName('head') || null;
    return g;
  }
  const body = std(0x55606a),
    dark = std(0x262a2f, { metalness: 0.65 }),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  P(b, gCyl(1.5, 1.8, 0.6, 16), body, 0, 0.3, 0);
  P(b, gCyl(1.1, 1.3, 0.9, 14), dark, 0, 1.05, 0);
  P(b, gCyl(1.32, 1.32, 0.08, 16), glow, 0, 0.62, 0);
  // 後方的操作台（機體站的地方）
  CB(b, 1.4, 0.25, 1.0, dark, 0, 0.12, -2.4);
  bakeAll(b, { ...TINT, cache: 'gun_base' });
  const head = new THREE.Group();
  head.name = 'head';
  head.position.y = 1.5;
  g.add(head);
  const h = new THREE.Group();
  head.add(h);
  CB(h, 1.9, 0.9, 2.0, body, 0, 0.45, 0.1);
  P(h, gBox(1.6, 0.1, 0.4), glow, 0, 0.75, -0.75);
  if (kind === 'hmg') {
    for (const x of [-0.35, 0.35]) {
      P(h, gCyl(0.12, 0.12, 2.4, 8), dark, x, 0.45, 1.8, Math.PI / 2, 0, 0);
      P(h, gCyl(0.18, 0.18, 0.5, 8), body, x, 0.45, 1.0, Math.PI / 2, 0, 0);
    }
    CB(h, 0.5, 0.6, 0.8, dark, -1.15, 0.4, 0.1);
  } else if (kind === 'rail') {
    for (const x of [-0.28, 0.28]) CB(h, 0.18, 0.5, 4.0, dark, x, 0.45, 2.0);
    P(h, gBox(0.12, 0.12, 3.6), glow, 0, 0.45, 2.1);
    CB(h, 1.2, 0.7, 0.9, body, 0, 0.5, -0.9);
  } else if (kind === 'msl') {
    CB(h, 2.2, 1.4, 1.6, body, 0, 0.9, 0.2, -0.25, 0, 0);
    for (let i = 0; i < 6; i++)
      P(
        h,
        gCyl(0.18, 0.18, 0.1, 8),
        glow,
        -0.6 + (i % 3) * 0.6,
        0.6 + Math.floor(i / 3) * 0.55,
        1.05,
        Math.PI / 2 - 0.25,
        0,
        0,
      );
  } else {
    for (const x of [-0.45, 0.45]) {
      P(h, gCyl(0.16, 0.16, 2.8, 8), dark, x, 0.6, 1.9, Math.PI / 2 - 0.2, 0, 0);
      P(h, gCyl(0.22, 0.22, 0.4, 8), glow, x, 0.92, 3.2, Math.PI / 2 - 0.2, 0, 0);
    }
  }
  bakeAll(h, { ...TINT, cache: 'gun_head_' + kind });
  g.head = head;
  tagStyle(g);
  return g;
}

// 重武器的外形（撿起的箱子上與掛在手臂上共用）：沿 +Z
export function buildHwMesh(wk, color) {
  const g = new THREE.Group();
  const glb = providedModel('device/' + wk);
  if (glb) {
    g.add(glb);
    return g;
  }
  const body = std(0x4a525a),
    dark = std(0x24282d, { metalness: 0.65 }),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  if (wk === 'hw_cannon') {
    CB(b, 0.6, 0.6, 1.2, body, 0, 0, -0.2);
    P(b, gCyl(0.2, 0.24, 2.0, 10), dark, 0, 0.05, 1.2, Math.PI / 2, 0, 0);
    P(b, gCyl(0.26, 0.26, 0.12, 10), glow, 0, 0.05, 2.2, Math.PI / 2, 0, 0);
  } else if (wk === 'hw_flame') {
    P(b, gCyl(0.3, 0.3, 1.0, 10), body, 0, 0.1, -0.4, Math.PI / 2, 0, 0);
    P(b, gCyl(0.1, 0.16, 1.4, 8), dark, 0, 0, 0.8, Math.PI / 2, 0, 0);
    P(b, gCyl(0.12, 0.12, 0.1, 8), glow, 0, 0, 1.5, Math.PI / 2, 0, 0);
  } else {
    CB(b, 0.9, 0.7, 1.2, body, 0, 0, 0);
    for (let i = 0; i < 4; i++)
      P(
        b,
        gCyl(0.14, 0.14, 0.08, 8),
        glow,
        -0.2 + (i % 2) * 0.4,
        -0.15 + Math.floor(i / 2) * 0.3,
        0.62,
        Math.PI / 2,
        0,
        0,
      );
  }
  bakeAll(b, { ...TINT, cache: 'hw_' + wk });
  tagStyle(g);
  return g;
}

// 撿起的重武器：小台座＋浮在上面的武器（item 節點轉動）
export function buildHwPick(wk, color) {
  const g = new THREE.Group();
  const dark = std(0x2a2e33),
    glow = glowMat(color);
  const b = new THREE.Group();
  g.add(b);
  CB(b, 1.6, 0.4, 1.6, dark, 0, 0.2, 0);
  P(b, gBox(1.62, 0.08, 1.62), glow, 0, 0.36, 0);
  bakeAll(b, { ...TINT, cache: 'hw_pad' });
  const item = new THREE.Group();
  item.name = 'item';
  item.position.y = 1.3;
  item.add(buildHwMesh(wk, color));
  g.add(item);
  g.item = item;
  return g;
}
