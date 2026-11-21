// 敵人與 Boss 的閃避（docs/enemy-dodge-design.md）：數值與各種類的設定，純資料
export const DG = {
  SCAN: 0.08, // 掃描威脅的間隔（秒，各台錯開）
  WIN: [0.08, 0.75], // 投射物到達最接近點的時間窗（秒）
  MSL_LAST: 0.35, // 導彈：在打到前幾秒內閃開才甩得掉
  PAD: 1.4, // 會打中的餘裕（舊尺度的公尺，×dk；再加自己的半徑與爆炸半徑）
  REACT: [0.1, 0.26], // 反應時間（秒；技巧高的短）
  REROLL: 0.5, // 擲失敗後幾秒內不再擲（機槍一串子彈不會每顆都擲）
  QB_T: 0.15, // 閃避的 QB 秒數（一般 QB 0.16＝約 30 m；看得出來靠動作與殘影，不靠拉長距離）
  QB_IF: 0.18, // 閃避的無敵
  JUMP_T: 0.55, // 跳躍閃避按住跳的秒數
  OPEN: 0.55, // 閃完的破綻（秒）：玩家打中＝CRITICAL
  OPEN_K_BOSS: 1.4, // Boss 的破綻：傷害倍率
  CAP: 2, // 全場在 CAP_T 秒內最多幾台開始閃避（＋玩家人數）
  CAP_T: 0.6,
  STRESS_K: 0.45, // 玩家吃緊（壓力 1）時機率的倍率
  MELEE_K: 0.6, // 近戰的威脅：機率再乘這個（近戰照樣好打）
  LASER_K: 0.5, // 被雷射打中後的提前閃避：機率再乘這個
  POP_GAP: 0.6, // 「閃避」字的最短間隔（秒）
  SET: { off: 0, low: 0.5, std: 1, high: 1.6 }, // 設定「敵人的閃避」ctrl.dodge
  FLIP_IF: 0.32, // 翻轉的閃避：無敵（看得到在翻、子彈穿過去）
  GHOST_T: 0.4, // 閃避的殘影：留幾秒
  GHOST_GAP: 0.07, // 殘影的間隔
  GHOST_COL: 0xff9a66, // 殘影的顏色（敵人：橘紅）
};

// 閃避的動作（第 2 期，人形的二足／逆關節）：[動作, 機率]，剩下的＝只有 QB 的姿勢
// cart 地面側翻、slide 滑鏟、bflip 後空翻、aflip 空中側翻
export const DG_ANIM = {
  ace: {
    side: [
      ['cart', 0.35],
      ['slide', 0.2],
    ],
    back: [['bflip', 0.45]],
    jump: [['aflip', 0.7]],
    air: [['aflip', 0.6]],
  },
  mt: {
    side: [
      ['cart', 0.2],
      ['slide', 0.25],
    ],
    back: [['bflip', 0.25]],
    jump: [['aflip', 0.45]],
    air: [['aflip', 0.4]],
  },
};

// 各種類（dgClass）：p＝每次威脅的基本機率、cd＝冷卻（秒）、qb＝閃避的 QB 秒數（距離；預設 DG.QB_T）、
// kinds＝會的閃避（權重）：side 側閃、back 後撤、jump 跳躍閃避
export const DG_CLASS = {
  ace: { p: 0.8, cd: [0.8, 1.6], kinds: { side: 6, back: 2, jump: 2 } }, // 敵對 AC、精英、具名 AC
  mt: { p: 0.45, cd: [1.8, 3.2], qb: 0.11, kinds: { side: 6, back: 2, jump: 1 } }, // 一般的人形步行機
  heavy: { p: 0.3, cd: [2.8, 4.5], qb: 0.11, kinds: { side: 5, back: 2 } }, // 戰車腳（不能跳）
  quad: { p: 0.45, cd: [1.6, 3], qb: 0.12, kinds: { side: 5, back: 2, jump: 2 } }, // 四足
  fly: { p: 0.5, cd: [1.4, 2.6], qb: 0.12, kinds: { side: 5, back: 2 } }, // 會飛的人形（偵察機）
};
