// 主線擴充的新 Boss（第 7、8 章；docs/campaign-expansion-design.md 第 11 節）的程式模型。
// 舊尺度建模（1＝3 m，生成時整台乘 MS），原點在地面、正面 −Z。會動的節點放在 rig 的欄位（entities/mech-boss4.js 的 boss4Fx 驅動）。
import { P, bakeAll, gBox, gCyl, gSph } from './geometry.js';
import { greeble } from './greeble.js';
import { mechMats } from './materials.js';
import { tagStyle } from './style/shader.js';

const HP = Math.PI / 2;
const glow = (color, k = 1.6) =>
  new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.4 });
function sub(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}
function rigOf(root, torso, M, o) {
  const hand = o.hand || new THREE.Group();
  const back = o.back || new THREE.Group();
  if (!hand.parent) torso.add(hand);
  if (!back.parent) torso.add(back);
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
    cls: 'boss',
    vehicle: true,
    height: o.height,
    coreH: (o.coreK || 0.5) * o.height,
    mats: [M.main, M.main2, M.main3, M.sub, M.acc, M.joint, M.gun],
    flashT: 0,
    mounts: [],
    dmg: o.dmg || null,
    body: null,
    legNodes: [],
    rotor: null,
    ...(o.extra || {}),
  };
}
const TINT = { ao: 0.8, grime: 0.28 };
function finish(root, scale, key) {
  greeble(root, { k: scale, maxTris: 40000, maxFaces: 48 });
  bakeAll(root, { tint: TINT, cache: 'boss:' + key, k: scale });
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

// ---------- ANVIL 鍛造巨人：四隻粗短的腳、寬大的軀幹、右手的巨鎚（arm 繞 X 舉起／砸下）、背後的鼓風爐與左肩的冷卻槽（高約 9）----------
function buildAnvil(pal, scale) {
  const { M, root, torso } = base(pal);
  const hot = glow(0xff7a20, 1.4);
  // 腳
  const legs = [];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const l = sub(torso, sx * 2.4, 0, sz * 1.8);
    P(l, gBox(1.6, 3.2, 1.8), M.main2, 0, 1.6, 0);
    P(l, gBox(2, 0.6, 2.4), M.joint, 0, 0.3, -0.1);
    P(l, gCyl(0.7, 0.7, 1.9, 10), M.sub, 0, 3.1, 0, 0, 0, HP);
    legs.push(l);
  }
  // 軀幹
  const body = sub(torso, 0, 3.4, 0);
  P(body, gBox(5.8, 3.6, 4.4), M.main, 0, 1.8, 0);
  P(body, gBox(6.2, 0.5, 4.8), M.main3, 0, 3.7, 0);
  P(body, gBox(3.2, 1.6, 0.5), M.sub, 0, 2.1, -2.3);
  P(body, gBox(2.4, 0.3, 0.2), hot, 0, 2.2, -2.56); // 胸前的爐口
  // 頭
  const head = sub(body, 0, 4, -0.8);
  P(head, gBox(1.8, 1.1, 1.6), M.main2, 0, 0.5, 0);
  P(head, gBox(1.3, 0.2, 0.1), glow(0xffb060, 1.8), 0, 0.6, -0.82);
  // 背後的鼓風爐（煙囪兩根）
  const furnace = sub(body, 0, 2, 2.6);
  P(furnace, gBox(3.4, 2.8, 1.6), M.main3, 0, 0.6, 0);
  for (const s of [-1, 1]) P(furnace, gCyl(0.45, 0.55, 3.6, 10), M.joint, s * 1.1, 3.4, 0.2);
  const vent = new THREE.Mesh(gBox(2.6, 0.3, 0.1), hot);
  vent.position.set(0, 0.8, 0.82);
  furnace.add(vent);
  // 左肩的冷卻槽
  const tank = sub(body, -3.4, 3, 0.4);
  P(tank, gCyl(1, 1, 2.6, 14), glow(0x60c8ff, 0.5), 0, 0.6, 0);
  P(tank, gCyl(1.1, 1.1, 0.3, 14), M.joint, 0, 2, 0);
  P(tank, gCyl(1.1, 1.1, 0.3, 14), M.joint, 0, -0.7, 0);
  // 右手的巨鎚（arm：肩的轉軸）
  const arm = sub(body, 3.6, 3, -0.4);
  P(arm, gSph(1.1, 12), M.joint, 0, 0, 0);
  P(arm, gBox(1.2, 3.2, 1.2), M.main2, 0, -1.6, 0);
  const fore = sub(arm, 0, -3.2, 0);
  P(fore, gBox(1, 1, 3.6), M.main, 0, 0, -1.8);
  const hammer = sub(fore, 0, 0, -3.8);
  P(hammer, gBox(2.6, 2.2, 2.6), M.gun, 0, 0, 0);
  P(hammer, gBox(2.8, 0.4, 2.8), M.main3, 0, 1.1, 0);
  const face = new THREE.Mesh(gBox(2.4, 0.2, 2.4), hot);
  face.position.set(0, -1.15, 0);
  hammer.add(face);
  const hand = new THREE.Group();
  hand.position.set(0, -1.4, 0);
  hammer.add(hand);
  const back = new THREE.Group();
  back.position.set(0, 3.8, 2.8);
  body.add(back);
  finish(root, scale, 'anvil');
  return rigOf(root, torso, M, {
    hand,
    back,
    type: 'anvil',
    height: 9 * scale,
    dmg: {
      smoke: [
        [0, 7.6, 2.6],
        [-3.4, 6.4, 0.4],
        [1, 7, -1],
      ],
      plates: [],
      chunks: [furnace, tank],
    },
    extra: { arm, fore, hammer, hot, vent, legsA: legs, bodyN: body },
  });
}

// ---------- SALAMANDER 熔岩潛龍：頭部（下顎 jaw 開合、噴火口）＋ 8 節身體（segs，boss4Fx 依頭的軌跡排列）＋背鰭 ----------
function buildSalamander(pal, scale) {
  const { M, root, torso } = base(pal);
  const hot = glow(0xff6a20, 1.2);
  const headN = sub(torso, 0, 1.4, 0);
  P(headN, gBox(2.6, 1.6, 4), M.main, 0, 0.4, -0.6);
  P(headN, gBox(2.2, 0.4, 3.2), M.main3, 0, 1.3, -0.4);
  for (const s of [-1, 1]) P(headN, gSph(0.32, 8), glow(0xffd060, 2), s * 0.9, 0.8, -2.4);
  const jaw = sub(headN, 0, -0.2, 0.6);
  P(jaw, gBox(2.2, 0.6, 3.4), M.main2, 0, -0.2, -1.6);
  const mouth = new THREE.Mesh(gBox(1.6, 0.2, 2.4), hot);
  mouth.position.set(0, 0.15, -1.6);
  jaw.add(mouth);
  for (let i = 0; i < 4; i++) P(headN, gBox(0.3, 0.9, 0.5), M.sub, 0, 1.6, 0.8 - i * 0.9, -0.3);
  const segs = [];
  for (let i = 0; i < 8; i++) {
    const k = 1 - i * 0.07;
    const sg = sub(torso, 0, 1.2, 2.2 + i * 2.2);
    P(sg, gBox(2.4 * k, 1.5 * k, 2.2), i % 2 ? M.main2 : M.main, 0, 0.3, 0);
    P(sg, gBox(0.3, 1.2 * k, 1.2), M.sub, 0, 1.3 * k, 0); // 背鰭
    const g2 = new THREE.Mesh(gBox(2.5 * k, 0.12, 0.3), hot);
    g2.position.set(0, -0.2, 1);
    sg.add(g2);
    for (const s of [-1, 1]) P(sg, gBox(0.5, 0.4, 0.8), M.joint, s * 1.3 * k, -0.4, 0);
    segs.push(sg);
  }
  const hand = new THREE.Group();
  hand.position.set(0, 0.3, -2.9);
  headN.add(hand);
  const back = new THREE.Group();
  back.position.set(0, 1.5, 0);
  headN.add(back);
  finish(root, scale, 'salamander');
  return rigOf(root, torso, M, {
    hand,
    back,
    type: 'salamander',
    height: 3.2 * scale,
    dmg: {
      smoke: [
        [0, 3, 0],
        [0, 3, 4],
        [0, 3, 8],
      ],
      plates: [],
      chunks: segs.slice(0, 3),
    },
    extra: { headN, jaw, segs, hot },
  });
}

// ---------- GANTRY 船塢起重要塞：原點＝吊車（trolley）正下方的地面。橫梁 beam（boss4Fx 依作戰區域拉長、對齊場地中心）、
// 兩支腳 legL／legR、吊車 trolley（在橫梁上）、吊索與電磁鐵 magnet（往下放）、吊著的貨櫃 crate（放下時隱藏）----------
function buildGantry(pal, scale) {
  const { M, root, torso } = base(pal);
  const hot = glow(0x80d0ff, 1.2);
  const H = 10; // 橫梁的高度（舊尺度）
  const frame = sub(torso);
  const beam = sub(frame, 0, H, 0);
  P(beam, gBox(20, 1.2, 2.4), M.main3, 0, 0, 0);
  P(beam, gBox(20, 0.3, 2.8), M.joint, 0, 0.75, 0);
  for (let i = -9; i <= 9; i += 1.5) P(beam, gBox(0.15, 1, 2.3), M.sub, i, -0.1, 0);
  const legs = [];
  for (const s of [-1, 1]) {
    const lg = sub(frame, s * 10, 0, 0);
    P(lg, gBox(1.2, H, 1.4), M.main3, 0, H / 2, -1.2);
    P(lg, gBox(1.2, H, 1.4), M.main3, 0, H / 2, 1.2);
    P(lg, gBox(1.4, 0.4, 3.6), M.joint, 0, H * 0.5, 0);
    P(lg, gBox(2, 1, 4.4), M.main2, 0, 0.5, 0);
    for (const z of [-1.6, 1.6]) P(lg, gCyl(0.5, 0.5, 2.2, 10), M.sub, 0, 0.5, z, 0, 0, HP);
    legs.push(lg);
  }
  // 吊車（原點的正上方）
  const trolley = sub(torso, 0, H + 1, 0);
  P(trolley, gBox(2.6, 1.6, 3.4), M.main, 0, 0, 0);
  P(trolley, gBox(1.2, 0.6, 1.2), M.sub, 0, 1, 0);
  P(trolley, gBox(2, 0.3, 0.1), glow(0xffb040, 1.6), 0, 0.2, -1.72);
  // 吊索＋電磁鐵（magnet 的 y 依放下的程度改變）
  const cable = sub(trolley, 0, -0.8, 0);
  const rope = new THREE.Mesh(gCyl(0.08, 0.08, 1, 6), M.joint);
  rope.position.y = -0.5;
  cable.add(rope);
  const magnet = sub(trolley, 0, -4, 0);
  P(magnet, gCyl(1.4, 1.6, 0.9, 16), M.gun, 0, 0, 0);
  P(magnet, gCyl(1.5, 1.5, 0.2, 16), M.main3, 0, 0.5, 0);
  const coil = new THREE.Mesh(gCyl(1.2, 1.2, 0.12, 16), hot);
  coil.position.y = -0.5;
  magnet.add(coil);
  // 吊著的貨櫃
  const crate = sub(magnet, 0, -1.9, 0);
  P(crate, gBox(4, 2.6, 2), M.acc, 0, 0, 0);
  for (let i = -1.6; i <= 1.6; i += 0.4) P(crate, gBox(0.08, 2.4, 2.05), M.main2, i, 0, 0);
  const hand = new THREE.Group();
  hand.position.set(0, -0.8, 0);
  magnet.add(hand);
  const back = new THREE.Group();
  back.position.set(0, -0.6, -1.8);
  trolley.add(back);
  finish(root, scale, 'gantry');
  return rigOf(root, torso, M, {
    hand,
    back,
    type: 'gantry',
    height: 12 * scale,
    coreK: 0.62,
    dmg: {
      smoke: [
        [0, 11, 0],
        [-6, 10.5, 0],
        [6, 10.5, 0],
      ],
      plates: [],
      chunks: [trolley],
    },
    extra: { frame, beam, legsG2: legs, trolley, rope, magnet, coil, crate, beamH: H },
  });
}

// ---------- COLOSSUS 主砲塔：固定的圓形砲座、會旋轉的砲塔 tur（boss4Fx 依 bx[0] 的方位轉）、三聯裝主砲 guns（齊射時後座）、
// 兩側的副砲、背後的彈藥升降機（高約 7）----------
function buildDeckGun(pal, scale) {
  const { M, root, torso } = base(pal);
  const hot = glow(0xffb040, 1);
  P(torso, gCyl(7, 7.6, 1.6, 24), M.main2, 0, 0.8, 0);
  P(torso, gCyl(7.2, 7.2, 0.3, 24), M.joint, 0, 1.7, 0);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    P(torso, gBox(0.6, 1.2, 0.6), M.sub, Math.cos(a) * 7.2, 0.8, Math.sin(a) * 7.2);
  }
  const tur = sub(torso, 0, 1.8, 0);
  P(tur, gBox(9, 3.6, 10), M.main, 0, 1.8, 0.6);
  P(tur, gBox(9.4, 0.5, 10.4), M.main3, 0, 3.8, 0.6);
  P(tur, gBox(7, 2.4, 1), M.sub, 0, 1.6, -4.6);
  P(tur, gBox(2.2, 1.2, 2.2), M.main2, -2.6, 4.6, 2.4); // 測距儀
  P(tur, gBox(4.2, 0.5, 0.5), M.main2, -2.6, 5.4, 2.4);
  const guns = sub(tur, 0, 2, -4.6);
  const barrels = [];
  for (const x of [-2.4, 0, 2.4]) {
    const b = sub(guns, x, 0, 0);
    P(b, gCyl(0.45, 0.6, 12, 12), M.gun, 0, 0, -6, HP);
    P(b, gCyl(0.7, 0.7, 1.2, 12), M.joint, 0, 0, -0.4, HP);
    P(b, gCyl(0.5, 0.5, 0.4, 12), M.sub, 0, 0, -11.8, HP);
    barrels.push(b);
  }
  for (const s of [-1, 1]) {
    const sec = sub(tur, s * 5, 2.2, -1);
    P(sec, gBox(1.6, 1.4, 2), M.main2, 0, 0, 0);
    P(sec, gCyl(0.18, 0.2, 3, 8), M.gun, -0.3, 0, -2, HP);
    P(sec, gCyl(0.18, 0.2, 3, 8), M.gun, 0.3, 0, -2, HP);
  }
  // 背後的彈藥升降機
  const hoist = sub(tur, 0, 0, 6);
  P(hoist, gBox(3, 5, 2.4), M.main3, 0, 2.5, 0);
  const lamp = new THREE.Mesh(gBox(2, 0.3, 0.1), hot);
  lamp.position.set(0, 4.2, 1.25);
  hoist.add(lamp);
  const hand = new THREE.Group();
  hand.position.set(0, 0, -12.2);
  guns.add(hand);
  const back = new THREE.Group();
  back.position.set(5, 2.2, -3.5);
  tur.add(back);
  finish(root, scale, 'deckgun');
  return rigOf(root, torso, M, {
    hand,
    back,
    type: 'deckgun',
    height: 7 * scale,
    dmg: {
      smoke: [
        [0, 6, 1],
        [-3, 6, 3],
        [3, 5, -2],
      ],
      plates: [],
      chunks: [hoist],
    },
    extra: { tur, guns, barrels, hot, lamp },
  });
}

// ---------- HEARTH 機關心臟：底座、發光的核心 core（過載時變亮）、繞著轉的四片護盾板 plates（bx[0] 的角度）、四根冷卻柱（高約 8）----------
function buildReactor(pal, scale) {
  const { M, root, torso } = base(pal);
  const coreM = glow(0x80e0ff, 1.4);
  P(torso, gCyl(6, 6.6, 1.2, 24), M.main2, 0, 0.6, 0);
  P(torso, gCyl(3, 3.6, 2, 18), M.main, 0, 2, 0);
  const core = new THREE.Mesh(gSph(2.2, 20), coreM);
  core.position.y = 4.6;
  torso.add(core);
  for (const y of [3.2, 6]) {
    const ring = new THREE.Mesh(gCyl(2.6, 2.6, 0.3, 20), M.joint);
    ring.position.y = y;
    torso.add(ring);
  }
  P(torso, gCyl(1.2, 1.6, 2, 14), M.main3, 0, 7.4, 0);
  // 冷卻柱
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    P(torso, gCyl(0.6, 0.7, 7, 12), M.main3, Math.cos(a) * 5, 3.5, Math.sin(a) * 5);
    P(torso, gCyl(0.75, 0.75, 0.3, 12), glow(0x80e0ff, 0.8), Math.cos(a) * 5, 6.6, Math.sin(a) * 5);
  }
  // 護盾板：四片弧形的板（每片約 60°，之間的縫隙 30°）
  const plates = sub(torso, 0, 4.6, 0);
  for (let i = 0; i < 4; i++) {
    const pg = sub(plates);
    pg.rotation.y = (i / 4) * Math.PI * 2;
    for (let j = -2; j <= 2; j++) {
      const a = (j * Math.PI) / 15;
      P(pg, gBox(1.4, 5, 0.4), M.main, Math.sin(a) * 3.6, 0, -Math.cos(a) * 3.6, 0, -a, 0);
    }
    P(pg, gBox(0.4, 0.2, 0.2), glow(0xffb040, 1.2), 0, 2.4, -3.85);
  }
  const hand = new THREE.Group();
  hand.position.set(0, 4.6, 0);
  torso.add(hand);
  finish(root, scale, 'reactor');
  return rigOf(root, torso, M, {
    hand,
    type: 'reactor',
    height: 8 * scale,
    coreK: 0.58,
    dmg: {
      smoke: [
        [0, 8, 0],
        [3.5, 7, 3.5],
        [-3.5, 7, -3.5],
      ],
      plates: [],
      chunks: [plates],
    },
    extra: { core, coreM, plates },
  });
}

export const BOSS4_BUILDERS = {
  anvil: buildAnvil,
  salamander: buildSalamander,
  gantry: buildGantry,
  deckgun: buildDeckGun,
  reactor: buildReactor,
};
