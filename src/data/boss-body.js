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
  // 劍齒虎：頭（劍齒）、前肢、後腿、尾巴
  beast_tiger: [
    { id: 'fang', name: '劍齒', nodes: ['head'], at: 'head', tip: '咬擊變弱', fx: { melee: { tFang: 0.7 } } },
    {
      id: 'fore',
      name: '前肢',
      nodes: ['fl_fore', 'fl_meta', 'fl_paw', 'fr_fore', 'fr_meta', 'fr_paw'],
      at: 'fl_paw',
      at2: 'fr_paw',
      tip: '爪擊變弱',
      fx: { melee: { tDodgeClawL: 0.75, tDodgeClawR: 0.75 } },
    },
    {
      id: 'hind',
      name: '後腿',
      nodes: ['bl_thigh', 'bl_shin', 'bl_meta', 'bl_paw', 'br_thigh', 'br_shin', 'br_meta', 'br_paw'],
      at: 'bl_shin',
      at2: 'br_shin',
      tip: '突進與衝刺變慢',
      fx: { spd: 0.8, reach: { tLunge: 0.8 } },
    },
    {
      id: 'tail',
      name: '尾巴',
      nodes: ['tail3', 'tail4', 'tail5', 'tail_tip'],
      cut: ['tail4'],
      at: 'tail3',
      tip: '迴旋變弱',
      fx: { melee: { tSpinL: 0.7, tSpinR: 0.7 } },
    },
  ],
  // 熊：頭甲（大弱點）、前掌、後腿
  beast_bear: [
    { id: 'head', name: '頭甲', nodes: ['head'], at: 'head', weak: 1.4, tip: '頭部是大弱點' },
    {
      id: 'paw',
      name: '前掌',
      nodes: ['fl_meta', 'fl_paw', 'fr_meta', 'fr_paw'],
      at: 'fl_paw',
      at2: 'fr_paw',
      tip: '拍擊變弱',
      fx: { melee: { bSlam3: 0.75, bGround: 0.75 } },
    },
    {
      id: 'hind',
      name: '後腿',
      nodes: ['bl_thigh', 'bl_shin', 'bl_meta', 'bl_paw', 'br_thigh', 'br_shin', 'br_meta', 'br_paw'],
      at: 'bl_shin',
      at2: 'br_shin',
      tip: '衝撞與移動變慢',
      fx: { spd: 0.8, reach: { bCharge: 0.8 } },
    },
  ],
  // 鱷龜：頭頸（顎）、前肢、後肢、尾巴
  beast_turtle: [
    {
      id: 'jaw',
      name: '頭頸',
      nodes: ['neck', 'neck2', 'head'],
      at: 'head',
      tip: '咬合變弱',
      fx: { melee: { uSnap: 0.7 } },
    },
    {
      id: 'fore',
      name: '前肢',
      nodes: ['fl_fore', 'fl_meta', 'fl_paw', 'fr_fore', 'fr_meta', 'fr_paw'],
      at: 'fl_paw',
      at2: 'fr_paw',
      tip: '踩踏變弱',
      fx: { melee: { uStomp: 0.75 } },
    },
    {
      id: 'hind',
      name: '後肢',
      nodes: ['bl_thigh', 'bl_shin', 'bl_meta', 'bl_paw', 'br_thigh', 'br_shin', 'br_meta', 'br_paw'],
      at: 'bl_shin',
      at2: 'br_shin',
      tip: '移動變慢',
      fx: { spd: 0.8 },
    },
    {
      id: 'tail',
      name: '尾巴',
      nodes: ['tail3', 'tail4', 'tail5', 'tail_tip'],
      cut: ['tail4'],
      at: 'tail3',
      tip: '尾掃停用',
      fx: { off: ['uTail'] },
    },
  ],
  // 猩猩：左拳、右拳、下顎（頭是大弱點）、後腿
  beast_gorilla: [
    {
      id: 'fistL',
      name: '左拳',
      nodes: ['fl_meta', 'fl_paw'],
      at: 'fl_paw',
      tip: '左手的橫掃與捶地變弱',
      fx: { melee: { gSweepL: 0.7, gSlam: 0.85 } },
    },
    {
      id: 'fistR',
      name: '右拳',
      nodes: ['fr_meta', 'fr_paw'],
      at: 'fr_paw',
      tip: '右手的橫掃與捶地變弱',
      fx: { melee: { gSweepR: 0.7, gSlam: 0.85 } },
    },
    {
      id: 'head',
      name: '頭部',
      nodes: ['head', 'jaw'],
      cut: ['jaw'],
      at: 'head',
      weak: 1.4,
      tip: '頭部是大弱點',
    },
    {
      id: 'hind',
      name: '後腿',
      nodes: ['bl_thigh', 'bl_shin', 'bl_meta', 'bl_paw', 'br_thigh', 'br_shin', 'br_meta', 'br_paw'],
      at: 'bl_shin',
      at2: 'br_shin',
      tip: '跳躍砸地與移動變慢',
      fx: { spd: 0.8, reach: { gLeap: 0.8 } },
    },
  ],
  // 蠍：左螯、右螯、尾針、步足
  beast_scorpion: [
    {
      id: 'chelL',
      name: '左螯',
      nodes: ['cl_hand', 'cl_finger'],
      cut: ['cl_finger'],
      at: 'cl_hand',
      tip: '左螯的夾擊變弱',
      fx: { melee: { sPinchL: 0.7, sGrab: 0.85 } },
    },
    {
      id: 'chelR',
      name: '右螯',
      nodes: ['cr_hand', 'cr_finger'],
      cut: ['cr_finger'],
      at: 'cr_hand',
      tip: '右螯的夾擊變弱',
      fx: { melee: { sPinchR: 0.7, sGrab: 0.85 } },
    },
    {
      id: 'sting',
      name: '尾針',
      nodes: ['tail4', 'tail5', 'sting'],
      cut: ['sting'],
      at: 'tail5',
      tip: '尾刺停用',
      fx: { off: ['sSting'] },
    },
    {
      id: 'legs',
      name: '步足',
      nodes: [
        'l1_a',
        'l1_b',
        'l1_c',
        'l2_a',
        'l2_b',
        'l2_c',
        'l3_a',
        'l3_b',
        'l3_c',
        'l4_a',
        'l4_b',
        'l4_c',
        'r1_a',
        'r1_b',
        'r1_c',
        'r2_a',
        'r2_b',
        'r2_c',
        'r3_a',
        'r3_b',
        'r3_c',
        'r4_a',
        'r4_b',
        'r4_c',
      ],
      at: 'l2_b',
      at2: 'r2_b',
      tip: '移動變慢',
      fx: { spd: 0.8 },
    },
  ],
  // 螳螂：左鐮、右鐮、翅、腹部（大弱點）
  beast_mantis: [
    {
      id: 'scyL',
      name: '左鐮',
      nodes: ['sl_femur', 'sl_blade'],
      at: 'sl_blade',
      tip: '左鐮的斬擊變弱、變短',
      fx: { melee: { mSlashL: 0.8, mCross: 0.9 }, reach: { mSlashL: 0.7 } },
    },
    {
      id: 'scyR',
      name: '右鐮',
      nodes: ['sr_femur', 'sr_blade'],
      at: 'sr_blade',
      tip: '右鐮的斬擊變弱、變短',
      fx: { melee: { mSlashR: 0.8, mCross: 0.9 }, reach: { mSlashR: 0.7 } },
    },
    {
      id: 'wing',
      name: '翅',
      nodes: ['wing_l', 'wing_r', 'fan_l', 'fan_r'],
      cut: ['wing_l', 'wing_r'],
      at: 'fan_l',
      at2: 'fan_r',
      tip: '滑翔突進變短',
      fx: { reach: { mDive: 0.7 } },
    },
    { id: 'abdomen', name: '腹部', nodes: ['abdomen'], at: 'abdomen', weak: 1.4, tip: '腹部是大弱點' },
  ],
  // 猛禽：左翼、右翼、尾舵、腳爪
  beast_raptor: [
    {
      id: 'wingL',
      name: '左翼',
      nodes: ['wl_fore', 'wl_hand'],
      cut: ['wl_hand'],
      at: 'wl_fore',
      tip: '左翼的斬擊變弱、飛得慢一點',
      fx: { melee: { rWingSlashL: 0.7 }, spd: 0.9 },
    },
    {
      id: 'wingR',
      name: '右翼',
      nodes: ['wr_fore', 'wr_hand'],
      cut: ['wr_hand'],
      at: 'wr_fore',
      tip: '右翼的斬擊變弱、飛得慢一點',
      fx: { melee: { rWingSlashR: 0.7 }, spd: 0.9 },
    },
    { id: 'tail', name: '尾舵', nodes: ['tail'], at: 'tail', tip: '飛得慢一點', fx: { spd: 0.9 } },
    {
      id: 'talon',
      name: '腳爪',
      nodes: ['l_tarsus', 'l_foot', 'l_toes', 'r_tarsus', 'r_foot', 'r_toes'],
      cut: ['l_toes', 'r_toes'],
      at: 'l_foot',
      at2: 'r_foot',
      tip: '踢擊與俯衝變弱',
      fx: { melee: { rKick: 0.7, rDive: 0.8 } },
    },
  ],
};
