// 地圖專屬敵人（E2 組：移動要塞「方舟」）的程式模型：甲板升降砲塔、艦橋觀測無人機（登艦突擊兵與甲板軌道砲兵是機甲模型）。
// 介面同 foe-models.js（vehicle: true；原點在地面，飛行的在機體中心下方，正面 −Z）。
// 會動的節點放在 extra（entities/mech-foe-e2.js 的 foeFx_e2 依 bossVis 驅動：待機／預警／攻擊），
// dmg＝受損狀態（冒煙點、AP 低時脫落的裝甲板、擊破時飛散的區塊群組）。
import { P, bakeAll, gBox, gCyl, gSph } from './geometry.js';
import { greeble } from './greeble.js';
import { mechMats } from './materials.js';
import { tagStyle } from './style/shader.js';
import { rod } from './foe-models.js';

const HP = Math.PI / 2;

const glow = (color, k = 1.6) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
function sub(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function looseBox(n, m, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(gBox(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  n.add(mesh);
  return mesh;
}
function rig(root, torso, M, o) {
  const hand = o.hand || new THREE.Group();
  const back = new THREE.Group();
  if (!hand.parent) torso.add(hand);
  torso.add(back);
  const arm = () => ({ hand, back, sh: new THREE.Group(), up: new THREE.Group(), fore: new THREE.Group() });
  return {
    group: root,
    legsG: new THREE.Group(),
    torso,
    head: torso,
    arms: { r: arm(), l: arm() },
    legs: [],
    nozzles: [],
    hipY: 0,
    type: o.type,
    cls: 'foe',
    vehicle: true,
    height: o.height,
    coreH: o.height * 0.5,
    mats: [M.main, M.main2, M.main3, M.sub, M.acc, M.joint, M.gun],
    flashT: 0,
    mounts: [],
    body: null,
    legNodes: [],
    rotor: null,
    dmg: o.dmg || null,
    ...(o.extra || {}),
  };
}
const FOE_TINT = { ao: 0.8, grime: 0.32 };
function finish(root, scale) {
  greeble(root, { k: scale, maxTris: 8000, maxFaces: 28 });
  bakeAll(root, { tint: FOE_TINT, cache: true, k: scale });
  root.scale.setScalar(scale);
  root.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  tagStyle(root);
}
function base(pal) {
  const M = mechMats(pal);
  const root = new THREE.Group();
  const torso = new THREE.Group();
  root.add(torso);
  return { M, root, torso };
}

// ---------- 甲板升降砲塔：埋在甲板的井框、會升起的砲塔（lift）、雙聯裝砲（gun 抬起）（升起時高約 3.5 m）----------
function buildPopTurret(pal, scale) {
  const { M, root, torso } = base(pal);
  // 甲板上的井框（不動，一直看得到）
  const well = sub(torso);
  P(well, gCyl(2, 2.1, 0.3, 16), M.joint, 0, 0.15, 0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    P(
      well,
      gBox(0.5, 0.08, 0.2),
      glow(0xffb040, 1.1),
      Math.cos(a) * 1.85,
      0.32,
      Math.sin(a) * 1.85,
      0,
      -a,
      0,
    );
  }
  // 升降的砲塔
  const lift = sub(torso, 0, 0, 0);
  P(lift, gCyl(1.4, 1.6, 1.6, 14), M.main, 0, 1, 0);
  P(lift, gCyl(1.5, 1.5, 0.15, 14), M.acc, 0, 1.85, 0);
  const head = sub(lift, 0, 2.2, 0);
  P(head, gBox(2.2, 1.1, 2), M.main2, 0, 0, 0);
  P(head, gBox(2.3, 0.12, 2.1), M.main3, 0, 0.6, 0);
  P(head, gBox(0.5, 0.2, 0.05), glow(0xff4030, 1.4), 0, 0.2, -1.02);
  const gun = sub(head, 0, 0.05, -0.9);
  for (const s of [-1, 1]) {
    P(gun, gCyl(0.14, 0.18, 1.8, 10), M.gun, s * 0.45, 0, -0.9, HP);
    P(gun, gCyl(0.2, 0.2, 0.3, 10), M.joint, s * 0.45, 0, -0.05, HP);
  }
  rod(lift, M.joint, [0.9, 0.4, 0.9], [0.6, 1.9, 0.6], 0.07, 6);
  rod(lift, M.joint, [-0.9, 0.4, 0.9], [-0.6, 1.9, 0.6], 0.07, 6);
  const plates = [looseBox(head, M.main3, 0.9, 0.06, 0.8, 0.55, 0.62, 0.4)];
  const hand = new THREE.Group();
  hand.position.set(0, 0, -1.9);
  gun.add(hand);
  finish(root, scale);
  return rig(root, torso, M, {
    hand,
    type: 'popturret',
    height: 3.5 * scale,
    dmg: { smoke: [[0, 2.4, 0]], plates, chunks: [head, lift] },
    extra: { lift, head, gun },
  });
}

// ---------- 艦橋觀測無人機：圓盤形的機身、下方的探照燈（lamp 轉向目標）、兩側的旋翼（rotors）----------
function buildSpotter(pal, scale) {
  const { M, root, torso } = base(pal);
  torso.position.y = 1;
  const body = sub(torso);
  P(body, gSph(1, 14), M.main, 0, 0, 0, 0, 0, 0, 1.3, 0.4, 1.3);
  P(body, gCyl(1.25, 1.3, 0.14, 16), M.joint, 0, -0.08, 0);
  P(body, gSph(0.5, 12), M.main2, 0, 0.3, 0.2, 0, 0, 0, 1, 0.6, 1.2);
  P(body, gBox(0.7, 0.08, 0.05), glow(0x60e0ff, 1.2), 0, 0.15, -1.25);
  const rot = sub(body),
    rotors = [];
  for (const s of [-1, 1]) {
    P(body, gBox(0.9, 0.12, 0.2), M.joint, s * 1.6, 0.05, 0);
    const r = sub(rot, s * 2.1, 0.12, 0);
    rotors.push(r);
    P(r, gCyl(0.7, 0.7, 0.03, 14), M.sub, 0, 0, 0);
    P(r, gCyl(0.12, 0.12, 0.2, 8), M.joint, 0, 0, 0);
  }
  // 探照燈（lamp：瞄準時轉向目標，鏡面發光）
  const lamp = sub(body, 0, -0.35, -0.3);
  P(lamp, gCyl(0.32, 0.4, 0.5, 12), M.main3, 0, 0, -0.1, HP);
  const lens = glow(0xfff0c0, 0.6);
  P(lamp, gCyl(0.3, 0.3, 0.05, 12), lens, 0, 0, -0.37, HP);
  const plates = [looseBox(body, M.main3, 0.6, 0.05, 0.5, 0.5, 0.36, 0.3)];
  const hand = new THREE.Group();
  hand.position.set(0, 0, -0.45);
  lamp.add(hand);
  finish(root, scale);
  return rig(root, torso, M, {
    hand,
    type: 'spotter',
    height: 2 * scale,
    dmg: { smoke: [[0, 1.4, 0]], plates, chunks: [body] },
    extra: { body, rotors, lamp, lens },
  });
}

export const FOE_BUILDERS_E2 = {
  popturret: buildPopTurret,
  spotter: buildSpotter,
};
// 模型庫登記：[key, 名稱, 備註]
export const FOE_CATALOG_E2 = [
  ['popturret', '甲板升降砲塔', '方舟專屬；埋在甲板下時打不到，升起來射一輪砲彈再降下去'],
  ['spotter', '艦橋觀測無人機', '方舟專屬；探照燈照到就引導砲擊落下'],
];
