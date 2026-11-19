// 機獸接成遊戲的實體用的模型（docs/beast-design.md 的「接成敵人」）：把 buildBeast 的回傳包成 Boss 程式模型的介面（boss-models.js 的 rigOf），
// 登記在 buildBossModel 的 BUILDERS（vehKey＝'beast_<獸>'）。機獸的模型是實際的公尺，所以除掉實體帶進來的建模倍率 MS。
// rig.beast＝buildBeast 的回傳（nodes、piv、eyeMat…），實體每格交給 animateBeast（entities/mech-beast.js）；
// 每個區塊的關節群組都被 rig 參照到，網格合併時當成會動的錨點（mesh-merge.js 的 rigRefs）。
import { MS } from '../core/scale.js';
import {
  buildBear,
  buildGorilla,
  buildLion,
  buildMantis,
  buildRaptor,
  buildScorpion,
  buildTiger,
  buildTurtle,
} from './beast-lion.js';

function beastRig(b, o) {
  const N = b.nodes,
    M = b.mats;
  // 手持武器槽的發射點：左右可以各自一個節點（handL／handR；猩猩兩隻前臂的機砲）
  const handOf = (k) => {
    const h = N[o['hand' + k]] || N[o.hand] || N.chest;
    if (o.handMz && !h.userData.mz) h.userData.mz = o.handMz;
    return h;
  };
  // 肩上武器的發射點：左右各自的節點（合併網格之後量不到槍口，所以寫 userData.mz＝節點座標的槍口；muzzle.js 的 rigMuzzle）
  const arm = (k) => {
    const back = N[o['back' + k]] || N[o.back] || N.chest;
    if (o.backMz && !back.userData.mz) back.userData.mz = o.backMz;
    return { hand: handOf(k), back, sh: new THREE.Group(), up: new THREE.Group(), fore: new THREE.Group() };
  };
  return {
    group: b.group,
    legsG: new THREE.Group(),
    torso: N.chest,
    head: N.head || N.chest,
    arms: { r: arm('R'), l: arm('L') },
    legs: [],
    nozzles: [],
    hipY: 0,
    type: o.type,
    cls: 'boss',
    vehicle: true,
    height: o.height,
    coreH: o.height * 0.5,
    mats: [M.main, M.main2, M.main3, M.sub, M.acc, M.joint, M.gun].filter(Boolean),
    flashT: 0,
    mounts: [],
    body: null,
    legNodes: [],
    rotor: null,
    beast: b,
  };
}
const make = (build, o) => (pal, scale) => {
  const k = scale / MS;
  const b = build(pal, k);
  return beastRig(b, { ...o, height: o.h * k });
};
export const BEAST_BUILDERS = {
  // 猛禽：肩上武器槽＝翼下的導彈（左右各自的區塊）；炸彈從同一個槽出來
  beast_raptor: make(buildRaptor, {
    ...{
      type: 'beast_raptor',
      h: 5.8,
      hand: 'head',
      backL: 'msl_l',
      backR: 'msl_r',
      backMz: [0, -0.65, -0.7],
    },
  }),
  // 蠍：肩上武器槽＝背上的迫擊筒（迫擊砲彈與毒液彈從這裡出來）
  beast_scorpion: make(buildScorpion, {
    type: 'beast_scorpion',
    h: 6,
    hand: 'sting',
    back: 'mortar',
    backMz: [0, 2.6, -0.6],
  }),
  // 螳螂：手持武器槽＝前胸盾兩側的脈衝雷射機砲、肩上武器槽＝腹下的空雷發射器
  beast_mantis: make(buildMantis, {
    ...{ type: 'beast_mantis', h: 12, handL: 'pg_l', handR: 'pg_r', handMz: [0, 0, -2.7] },
    ...{ back: 'ootheca', backMz: [0, 0, 1.4] },
  }),
  // 猩猩：手持武器槽＝兩隻前臂的轉管機砲（各自的區塊）
  beast_gorilla: make(buildGorilla, {
    ...{ type: 'beast_gorilla', h: 8.8, handL: 'rot_l', handR: 'rot_r', handMz: [0, -2.6, -2.9] },
  }),
  // 鱷龜：手持武器槽＝背甲砲塔的重機砲、肩上武器槽＝左右的魚雷架
  beast_turtle: make(buildTurtle, {
    ...{ type: 'beast_turtle', h: 7.6, hand: 'guns', handMz: [0.78, 0, -3.5] },
    ...{ backL: 'rack_l', backR: 'rack_r', backMz: [0, 0.8, -2.6] },
  }),
  // 熊：肩上武器槽＝背上的榴彈砲（迫擊砲彈從這裡出來；砲管仰 20°）
  beast_bear: make(buildBear, {
    type: 'beast_bear',
    h: 9.4,
    hand: 'head',
    back: 'how_gun',
    backMz: [0, 1.42, -3.9],
  }),
  // 劍齒虎：手持武器槽＝背上的電磁機砲、肩上武器槽＝電漿導彈莢艙（左右在同一塊 guns 裡）
  beast_tiger: make(buildTiger, {
    ...{ type: 'beast_tiger', h: 8.0, hand: 'mg_gun', handMz: [0, 0.12, -3.8] },
    ...{ back: 'guns', backMz: [0, 0.05, -1.2] },
  }),
  beast_lion: make(buildLion, {
    type: 'beast_lion',
    h: 8.6,
    hand: 'guns',
    backL: 'pod_l',
    backR: 'pod_r',
    backMz: [0, 0.7, -1.3],
  }),
};
