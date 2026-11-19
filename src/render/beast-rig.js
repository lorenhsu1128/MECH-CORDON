// 機獸接成遊戲的實體用的模型（docs/beast-design.md 的「接成敵人」）：把 buildBeast 的回傳包成 Boss 程式模型的介面（boss-models.js 的 rigOf），
// 登記在 buildBossModel 的 BUILDERS（vehKey＝'beast_<獸>'）。機獸的模型是實際的公尺，所以除掉實體帶進來的建模倍率 MS。
// rig.beast＝buildBeast 的回傳（nodes、piv、eyeMat…），實體每格交給 animateBeast（entities/mech-beast.js）；
// 每個區塊的關節群組都被 rig 參照到，網格合併時當成會動的錨點（mesh-merge.js 的 rigRefs）。
import { MS } from '../core/scale.js';
import { buildLion } from './beast-lion.js';

function beastRig(b, o) {
  const N = b.nodes,
    M = b.mats;
  const hand = N[o.hand] || N.chest,
    back = N[o.back] || N.chest;
  const arm = () => ({ hand, back, sh: new THREE.Group(), up: new THREE.Group(), fore: new THREE.Group() });
  return {
    group: b.group,
    legsG: new THREE.Group(),
    torso: N.chest,
    head: N.head || N.chest,
    arms: { r: arm(), l: arm() },
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
  beast_lion: make(buildLion, { type: 'beast_lion', h: 8.6, hand: 'guns', back: 'pod_l' }),
};
