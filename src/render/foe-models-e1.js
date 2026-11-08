// 地圖專屬敵人（E1 組：火山熔爐帶）的程式模型：熔渣投擲機、熔岩潛行無人機、熱風鼓風機（耐熱重裝 MT 是機甲模型）。
// 介面同 foe-models.js（vehicle: true；原點在地面，飛行的在機體中心下方，正面 −Z）。
// 會動的節點放在 extra（entities/mech-foe-e1.js 的 foeFx_e1 依 bossVis 驅動：待機／預警／攻擊），
// dmg＝受損狀態（冒煙點、AP 低時脫落的裝甲板、擊破時飛散的區塊群組）。
import { P, bakeAll, decal, gBox, gCyl, gSph, kitCable } from './geometry.js';
import { greeble } from './greeble.js';
import { mechMats } from './materials.js';
import { tagStyle } from './style/shader.js';
import { beam, piston, rod, slats, wheel } from './foe-models.js';

const PI = Math.PI,
  HP = Math.PI / 2;

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

// ---------- 熔渣投擲機：履帶底盤、旋轉台、投石機式的長臂與熔渣斗（發光），後方的熔渣槽（高約 4 m）----------
function buildSlagger(pal, scale) {
  const { M, root, torso } = base(pal);
  const chassis = sub(torso),
    turret = sub(torso, 0, 1.3, 0.2);
  const hot = glow(0xff6a20, 0.5);
  // 履帶：兩條長方體＋負重輪＋擋板
  for (const s of [-1, 1]) {
    P(chassis, gBox(0.7, 0.9, 4.6), M.joint, s * 1.25, 0.45, 0);
    for (const z of [-1.6, -0.8, 0, 0.8, 1.6]) wheel(chassis, M, s * 1.25, 0.45, z, 0.32, 0.36);
    P(chassis, gBox(0.12, 0.3, 4.6), M.main2, s * 1.62, 0.95, 0);
  }
  P(chassis, gBox(2.2, 0.6, 4.0), M.main, 0, 1.0, 0);
  // 旋轉台與駕駛艙
  P(turret, gCyl(1.2, 1.3, 0.35, 12), M.joint, 0, 0, 0);
  P(turret, gBox(1.4, 1.1, 1.3), M.main, -0.5, 0.75, -0.9);
  P(turret, gBox(1.1, 0.4, 0.05), glow(0x7fc8ff, 0.4), -0.5, 0.95, -1.56);
  slats(turret, M.joint, 0.3, 0.7, -0.4, 0.6, 4, 0.1, HP);
  // 熔渣槽（後方：發光的開口）
  P(turret, gCyl(0.9, 0.7, 1.2, 12), M.main3, 0, 0.75, 1.3);
  P(turret, gCyl(0.75, 0.75, 0.05, 12), hot, 0, 1.36, 1.3);
  // 投擲臂：樞軸（arm 節點，預警時往後拉、出手時甩向前）＋臂身＋熔渣斗
  const arm = sub(turret, 0.55, 0.9, 0.2);
  P(arm, gCyl(0.22, 0.22, 0.8, 8), M.joint, 0, 0, 0, 0, 0, HP);
  beam(arm, M.main2, [0, 0, 0], [0, 2.6, -1.4], 0.22, 0.3);
  const bucket = sub(arm, 0, 2.6, -1.4);
  P(bucket, gCyl(0.55, 0.4, 0.55, 10), M.joint, 0, 0, 0);
  const slag = new THREE.Mesh(gSph(0.42, 8), hot);
  slag.position.y = 0.2;
  bucket.add(slag);
  piston(turret, M, [0.55, 0.3, 0.8], [0.55, 1.6, -0.3], 0.07);
  kitCable(
    turret,
    M,
    [
      [0.2, 0.6, 1.3],
      [0.4, 0.9, 0.6],
      [0.55, 1.0, 0.2],
    ],
    0.05,
  );
  decal(turret, 2, 0.8, 0.4, -1.21, 0.75, -0.9, 0, -HP, 0);
  const plates = [
    looseBox(chassis, M.main3, 0.08, 0.5, 1.6, 1.12, 1.05, -0.8),
    looseBox(chassis, M.main3, 0.08, 0.5, 1.6, -1.12, 1.05, 0.8),
    looseBox(turret, M.main3, 1.2, 0.06, 0.9, -0.5, 1.33, -0.9),
  ];
  const hand = new THREE.Group();
  hand.position.set(0, 2.2, -1.6);
  turret.add(hand);
  finish(root, scale);
  return rig(root, torso, M, {
    hand,
    type: 'slagger',
    height: 4 * scale,
    dmg: {
      smoke: [
        [0, 2.4, 1.3],
        [-0.5, 2.0, -0.9],
        [0.8, 1.2, 0],
      ],
      plates,
      chunks: [chassis, turret, arm],
    },
    extra: { turret, arm, slag, hot },
  });
}

// ---------- 熔岩潛行無人機：扁平的耐熱外殼、下方的熔岩噴口、兩側的鰭、前方的熔岩砲（機身直徑約 2.4 m）----------
function buildMagmaDrone(pal, scale) {
  const { M, root, torso } = base(pal);
  torso.position.y = 1.2;
  const shell = sub(torso),
    fins = sub(torso);
  const hot = glow(0xff7a20, 0.8);
  P(shell, gSph(1.2, 14), M.main, 0, 0, 0, 0, 0, 0, 1, 0.45, 1.25);
  P(shell, gCyl(1.05, 1.2, 0.18, 14), M.joint, 0, -0.18, 0);
  P(shell, gSph(0.75, 12), M.main2, 0, 0.32, 0.15, 0, 0, 0, 1, 0.5, 1.1);
  // 下方的熔岩噴口（發光，潛行時拖著火）
  const vent = new THREE.Mesh(gCyl(0.45, 0.6, 0.2, 12), hot);
  vent.position.y = -0.42;
  shell.add(vent);
  // 熔岩砲：前方的砲管（gun 節點：浮出時抬起）
  const gun = sub(shell, 0, 0.05, -1.25);
  P(gun, gCyl(0.16, 0.2, 0.9, 10), M.gun, 0, 0, -0.35, HP);
  P(gun, gCyl(0.22, 0.22, 0.12, 10), M.joint, 0, 0, 0.05, HP);
  P(gun, gCyl(0.12, 0.12, 0.04, 10), hot, 0, 0, -0.82, HP);
  // 眼（感測器）與側面的鰭（fins：游動時擺動）
  P(shell, gBox(0.6, 0.1, 0.05), glow(0xffd060, 1.2), 0, 0.22, -1.2);
  for (const s of [-1, 1]) {
    P(fins, gBox(0.9, 0.06, 0.7), M.main3, s * 1.45, -0.05, 0.2, 0, 0, s * 0.25);
    rod(fins, M.joint, [s * 1.0, 0, 0.2], [s * 1.85, -0.05, 0.45], 0.04, 5);
  }
  P(shell, gBox(0.3, 0.12, 0.9), M.joint, 0, 0.55, 0.5);
  const plates = [looseBox(shell, M.main3, 0.7, 0.06, 0.6, 0.5, 0.42, 0.4, 0, 0, 0.25)];
  const hand = new THREE.Group();
  hand.position.set(0, 0.05, -1.7);
  shell.add(hand);
  finish(root, scale);
  return rig(root, torso, M, {
    hand,
    type: 'magmadrone',
    height: 2 * scale,
    dmg: { smoke: [[0, 1.6, 0.2]], plates, chunks: [shell, fins] },
    extra: { shell, gun, finG: fins, vent, hot },
  });
}

// ---------- 熱風鼓風機：四支腳的底座、大口徑的鼓風筒（扇葉轉動）、後方的加熱爐與管（高約 4.5 m）----------
function buildBellows(pal, scale) {
  const { M, root, torso } = base(pal);
  const frame = sub(torso),
    head = sub(torso, 0, 2.6, 0);
  const hot = glow(0xff5a10, 0.4);
  // 底座與四支腳（腳掌）
  P(frame, gBox(2.6, 0.5, 2.6), M.joint, 0, 1.2, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      beam(frame, M.main2, [sx * 1.0, 1.1, sz * 1.0], [sx * 1.8, 0.1, sz * 1.8], 0.22, 0.28);
      P(frame, gCyl(0.4, 0.45, 0.15, 8), M.joint, sx * 1.8, 0.08, sz * 1.8);
    }
  // 加熱爐（後方，發光的爐門）與連到鼓風筒的管
  P(frame, gBox(1.6, 1.4, 1.2), M.main3, 0, 2.1, 1.3);
  P(frame, gBox(0.8, 0.6, 0.05), hot, 0, 2.0, 1.92);
  kitCable(
    frame,
    M,
    [
      [0.5, 2.8, 1.3],
      [0.6, 3.1, 0.6],
      [0.4, 2.9, 0.1],
    ],
    0.12,
  );
  // 鼓風筒（head：轉向目標）：筒身、前方的格柵、扇葉（fan：轉動）
  P(head, gCyl(1.2, 1.4, 2.2, 16), M.main, 0, 0, -0.4, HP);
  for (const z of [-1.0, 0.0, 0.6]) P(head, gCyl(1.45, 1.45, 0.14, 16), M.joint, 0, 0, z, HP);
  const fan = sub(head, 0, 0, -1.3);
  P(fan, gCyl(0.3, 0.3, 0.2, 10), M.joint, 0, 0, 0, HP);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2;
    const b = new THREE.Mesh(gBox(0.32, 1.0, 0.05), M.main2);
    b.position.set(Math.cos(a) * 0.6, Math.sin(a) * 0.6, 0);
    b.rotation.set(0.3, 0, a - HP);
    fan.add(b);
  }
  const mouth = new THREE.Mesh(gCyl(1.15, 1.15, 0.04, 16), hot);
  mouth.position.z = -1.52;
  mouth.rotation.x = HP;
  head.add(mouth);
  for (let i = -2; i <= 2; i++) P(head, gBox(0.05, 2.3, 0.05), M.joint, i * 0.45, 0, -1.55);
  piston(frame, M, [0, 1.4, -0.6], [0, 2.3, -0.9], 0.08);
  decal(frame, 1, 0.9, 0.45, 0, 1.2, -1.31, 0, PI, 0);
  const plates = [
    looseBox(head, M.main3, 0.08, 0.9, 1.2, 1.25, 0.1, -0.2),
    looseBox(frame, M.main3, 1.4, 0.06, 1.0, 0, 2.82, 1.3),
  ];
  const hand = new THREE.Group();
  hand.position.set(0, 0, -1.6);
  head.add(hand);
  finish(root, scale);
  return rig(root, torso, M, {
    hand,
    type: 'bellows',
    height: 4.2 * scale,
    dmg: {
      smoke: [
        [0, 3.0, 1.3],
        [0.8, 2.6, -0.4],
      ],
      plates,
      chunks: [frame, head],
    },
    extra: { head, fan, mouth, hot },
  });
}

export const FOE_BUILDERS_E1 = {
  slagger: buildSlagger,
  magmadrone: buildMagmaDrone,
  bellows: buildBellows,
};
// 模型庫登記：[key, 名稱, 備註]
export const FOE_CATALOG_E1 = [
  ['slagger', '熔渣投擲機', '火山熔爐帶專屬；把熔渣拋到預警圈，落地後燒一陣子'],
  ['magmadrone', '熔岩潛行無人機', '火山熔爐帶專屬；潛在地下時打不到，浮出射一輪熔岩彈'],
  ['bellows', '熱風鼓風機', '火山熔爐帶專屬；蓄氣後噴出熱風，把附近的機體往外吹'],
];
