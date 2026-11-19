// 獅型機獸（原創設計；之後當敵人／Boss）的組裝：render/proc/beast_lion.js 的區塊（基本形體清單）→ 關節群組的階層。
// 每個區塊一個群組（原點＝轉軸、名稱＝區塊名稱），站姿＝旋轉全 0；pose＝{ 區塊名稱: [rx, ry, rz]（角度）}。遊戲的座標（−Z 正面），原點在地面。
import { OUTLINE_MAT } from './geometry.js';
import { mechMats } from './materials.js';
import { fixMat, primsGroup } from './proc-prims.js';
import { bearDef } from './proc/beast_bear.js';
import { gorillaDef } from './proc/beast_gorilla.js';
import { lionDef } from './proc/beast_lion.js';
import { mantisDef } from './proc/beast_mantis.js';
import { raptorDef } from './proc/beast_raptor.js';
import { scorpionDef } from './proc/beast_scorpion.js';
import { tigerDef } from './proc/beast_tiger.js';
import { turtleDef } from './proc/beast_turtle.js';
import { tagStyle } from './style/shader.js';

// 展示用的姿勢
export const LION_POSES = {
  stand: {},
  // 咆哮：張嘴、抬頭、壓低前半身、尾巴揚起、砲管上仰
  roar: {
    neck: [14, 0, 0],
    head: [16, 0, 0],
    jaw: [-34, 0, 0],
    guns: [18, 0, 0],
    turret: [0, 20, 0],
    fl_upper: [-16, 0, 0],
    fl_fore: [22, 0, 0],
    fl_meta: [-6, 0, 0],
    fr_upper: [14, 0, 0],
    fr_fore: [-18, 0, 0],
    fr_meta: [10, 0, 0],
    bl_thigh: [10, 0, 0],
    bl_shin: [-14, 0, 0],
    bl_meta: [8, 0, 0],
    tail1: [-22, 8, 0],
    tail2: [-18, 10, 0],
    tail3: [-14, 12, 0],
    tail4: [-10, 10, 0],
    tail5: [-8, 8, 0],
  },
};

export const buildLion = (pal, scale = 1, pose = null) => buildBeast(lionDef(), pal, scale, pose);
export const buildTiger = (pal, scale = 1, pose = null) => buildBeast(tigerDef(), pal, scale, pose);
export const buildBear = (pal, scale = 1, pose = null) => buildBeast(bearDef(), pal, scale, pose);
export const buildGorilla = (pal, scale = 1, pose = null) => buildBeast(gorillaDef(), pal, scale, pose);
export const buildMantis = (pal, scale = 1, pose = null) => buildBeast(mantisDef(), pal, scale, pose);
export const buildRaptor = (pal, scale = 1, pose = null) => buildBeast(raptorDef(), pal, scale, pose);
export const buildScorpion = (pal, scale = 1, pose = null) => buildBeast(scorpionDef(), pal, scale, pose);
export const buildTurtle = (pal, scale = 1, pose = null) => buildBeast(turtleDef(), pal, scale, pose);
// def＝區塊表（lionDef／tigerDef）
export function buildBeast(def, pal, scale = 1, pose = null) {
  const M = mechMats(pal);
  const root = new THREE.Group();
  const nodes = {},
    pivots = {};
  for (const pc of def.pieces) {
    const g = new THREE.Group();
    g.name = pc.name;
    const pp = pc.parent ? pivots[pc.parent] : [0, 0, 0];
    g.position.set(-(pc.pivot[0] - pp[0]), pc.pivot[1] - pp[1], -(pc.pivot[2] - pp[2]));
    const pg = primsGroup(pc.prims, M, true, def.cols);
    const pos = [];
    for (const c of pg.children) pos.push(...c.geometry.attributes.position.array);
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    og.computeVertexNormals();
    const o = new THREE.Mesh(og, OUTLINE_MAT);
    o.castShadow = false;
    pg.add(o);
    g.add(pg);
    (pc.parent ? nodes[pc.parent] : root).add(g);
    nodes[pc.name] = g;
    pivots[pc.name] = pc.pivot;
  }
  const d = Math.PI / 180;
  for (const [k, r] of Object.entries(pose || {}))
    if (nodes[k]) nodes[k].rotation.set(r[0] * d, r[1] * d, r[2] * d);
  root.scale.setScalar(scale);
  tagStyle(root);
  // eyeMat＝眼睛與感測器的自發光材質（動作改它的亮度）
  return {
    group: root,
    nodes,
    piv: pivots,
    mats: M,
    eyeMat: fixMat(M, def.cols[0]),
    // burnMat＝噴嘴、排煙管、爐門的火光（動作改它的亮度）
    burnMat: def.cols[4] ? fixMat(M, def.cols[4]) : null,
    tris: def.tris,
    kind: def.kind,
  };
}
