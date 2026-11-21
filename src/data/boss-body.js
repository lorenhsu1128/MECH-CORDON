// Boss 的身體部位破壞（docs/boss-part-break-design.md，2026-11-21 使用者定案）：
// 和 Boss 改版的外掛部位（data/boss-kit.js 的 parts：可以鎖定的獨立實體）不同，身體區域不是實體、不用鎖定——
// 打在哪一塊（render/hit-parts.js 的外框）就把這一下的傷害記到那個區域，累積到門檻就壞：
// 能拆的節點拆掉（cut）、之後一直冒火花與煙、那一塊變成弱點、每個區域一個輕量的削弱（flag，各 Boss 的 AI 看 bodyFlag）。
// 不重建、換型態也不修。判定與效果在 entities/mech-body.js。
//
// BODY[種類]＝區域的清單（種類＝MechEntity.boss3Key()，和 BOSS_KIT 相同）：
//   id     旗標的名稱（bodyFlag(id)）
//   name   畫面上的名稱
//   nodes  屬於這個區域的節點（名稱；節點底下的外框都算，子節點另外屬於別的區域時以最近的祖先為準）
//   cut    打壞時拆掉的節點（nodes 的子集合或它們的子節點；沒有＝只有火花與煙）
//   at     冒火花與煙的節點（預設 nodes[0]）
//   weak   打壞之後這一塊的傷害倍率（預設 BODY_WEAK）
//   tip    打壞時畫面上寫的效果
//   fx     削弱（AI 端以 bodyMeleeK／bodyOff／bodyK／bodyOf 讀）：
//          melee { 招式: 傷害倍率 }、off [停用的招式]、spd 移動速度倍率、reach { 招式: 出手距離倍率 }、gunN { 武器 id: 發數 }
export const BODY_WEAK = 1.25;
// 耐久＝本體最大 AP 的比例（刁鑽度 1～4／5～8；沒有刁鑽度時用前者）
export const BODY_HP = [0.09, 0.11];
export const BODY_STUN = 1.2; // 打壞的那一刻的硬直（秒）
export const BODY_SMOKE_DT = 0.35; // 壞掉的區域每隔幾秒冒一次火花與煙

export const BODY = {
  // 獅型（樣本）：鬃甲的外環、前爪、後腿、尾巴
  beast_lion: [
    {
      id: 'mane',
      name: '鬃甲',
      nodes: ['mane_a', 'mane_b'],
      cut: ['mane_b'],
      at: 'mane_a',
      tip: '鬃甲的雷射減少',
      fx: { gunN: { mane: 3 } }, // 雷射扇形 5 道 → 3 道
    },
    {
      id: 'claw',
      name: '前爪',
      nodes: ['fl_meta', 'fl_paw', 'fr_meta', 'fr_paw'],
      at: 'fl_paw',
      at2: 'fr_paw',
      tip: '爪擊變弱',
      fx: { melee: { clawL: 0.75, clawR: 0.75 } },
    },
    {
      id: 'hind',
      name: '後腿',
      nodes: ['bl_thigh', 'bl_shin', 'bl_meta', 'bl_paw', 'br_thigh', 'br_shin', 'br_meta', 'br_paw'],
      at: 'bl_shin',
      at2: 'br_shin',
      tip: '撲擊與衝刺變慢',
      fx: { spd: 0.8, reach: { pounce: 0.8 } },
    },
    {
      id: 'tail',
      name: '尾巴',
      nodes: ['tail3', 'tail4', 'tail5', 'tail_tip'],
      cut: ['tail4'],
      at: 'tail3',
      tip: '掃尾停用',
      fx: { off: ['tail'] },
    },
  ],
};
