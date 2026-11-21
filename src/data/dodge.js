// 敵人與 Boss 的閃避（docs/enemy-dodge-design.md）：數值與各種類的設定，純資料
export const DG = {
  SCAN: 0.08, // 掃描威脅的間隔（秒，各台錯開）
  WIN: [0.08, 0.75], // 投射物到達最接近點的時間窗（秒）
  MSL_LAST: 0.35, // 導彈：在打到前幾秒內閃開才甩得掉
  PAD: 1.4, // 會打中的餘裕（舊尺度的公尺，×dk；再加自己的半徑與爆炸半徑）
  REACT: [0.1, 0.26], // 反應時間（秒；技巧高的短）
  REROLL: 0.5, // 擲失敗後幾秒內不再擲（機槍一串子彈不會每顆都擲）
  QB_T: 0.26, // 閃避的 QB 秒數（一般 QB 0.16；長一點才看得出來）
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
};

// 各種類（dgClass）：p＝每次威脅的基本機率、cd＝冷卻（秒）、kinds＝會的閃避（權重）
// side 側閃、back 後撤、jump 跳躍閃避
export const DG_CLASS = {
  ace: { p: 0.8, cd: [0.8, 1.6], kinds: { side: 6, back: 2, jump: 2 } }, // 敵對 AC、精英、具名 AC
  mt: { p: 0.45, cd: [1.8, 3.2], kinds: { side: 6, back: 2, jump: 1 } }, // 一般的人形步行機
  heavy: { p: 0.3, cd: [2.8, 4.5], kinds: { side: 5, back: 2 } }, // 戰車腳（不能跳）
  quad: { p: 0.45, cd: [1.6, 3], kinds: { side: 5, back: 2, jump: 2 } }, // 四足
  fly: { p: 0.5, cd: [1.4, 2.6], kinds: { side: 5, back: 2 } }, // 會飛的人形（偵察機）
};
