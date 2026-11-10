// 僚機（主線擴充 D1，docs/campaign-expansion-design.md）：兩位新角色，各自跟一條陣營路線。
// 行為在 entities/mech-wing.js，生成、救援、指令、好感度在 game/wing.js；台詞在 data/story-comms.js（說話者 basalt／wren）。
import { AC_ROSTER } from './enemies.js';

export const WINGMEN = {
  // 老練的傭兵：卡斯特隆／維爾威路線
  basalt: {
    name: 'BASALT',
    title: '老練的傭兵',
    routes: ['castron', 'veerwell'],
    roster: 'volker', // 組裝沿用具名 AC 的（零件一定合法）
    pal: 'ally',
    wantDist: 24,
    hpMul: 1.6,
    dmgMul: 0.75,
  },
  // 新人：艾瑟立克／聖域路線
  wren: {
    name: 'WREN',
    title: '新人',
    routes: ['aetheric', 'sancta'],
    roster: 'hornet',
    pal: 'ally',
    wantDist: 18,
    hpMul: 1.4,
    dmgMul: 0.7,
  },
};
export const wingAsm = (k) => ({ ...AC_ROSTER[WINGMEN[k].roster].asm });
// 有僚機同行的出擊（簡報寫「僚機同行」；每章一個，第 2 章起）
export const WING_SORTIES = new Set(['c2s2', 'c3s1', 'c4s2', 'c5s1', 'c6s2', 'c7s1', 'c8s1']);
// 依路線決定哪一位：最近的抉擇（castron／aetheric／veerwell／sancta）；還沒抉擇時是 BASALT
export function wingFor(pick) {
  for (const k in WINGMEN) if (WINGMEN[k].routes.includes(pick)) return k;
  return 'basalt';
}
// 指令（Z 鍵／手把十字鍵左依序切換）
export const WING_MODES = [
  { k: 'focus', name: '集中攻擊', tip: '攻擊你鎖定的目標' },
  { k: 'free', name: '自由攻擊', tip: '自己找目標' },
  { k: 'follow', name: '跟著我', tip: '待在你附近，只打靠近的敵人' },
  { k: 'hold', name: '守在這裡', tip: '守住下指令的位置' },
];
export const WING = {
  REVIVE_R: 7, // 救援的距離（× MS，只看水平距離；地上的綠色圈就是這個範圍）
  REVIVE_Y: 12, // 救援的高度容許（× MS）：跳起來、懸浮躲攻擊不會中斷
  REVIVE_T: 3, // 站在圈裡幾秒救起來（被打不會中斷）
  REVIVE_DECAY: 0.5, // 離開圈的時候進度每秒退回幾秒（不會一下子歸零）
  REVIVE_HP: 0.4,
  LEASH: { focus: 70, free: 70, follow: 28, hold: 12 }, // 離錨點（玩家或守住的位置）多遠就回去（× DS）
  BOND_HI: 3, // 好感度到這裡，台詞改變
};
