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
  // 第 3 期：載具、直升機、無人機、固定的
  EV_T: { drift: 0.55, bank: 0.6, broll: 0.45, guard: 1.4, hop: 0.45 }, // 整台的動作（evBody）的秒數
  HOP_H: 2.2, // 步行的專屬敵人側跳的高度（舊尺度的公尺，×dk；只有外觀）
  BLINK_D: 14, // 瞬移的距離（舊尺度的公尺）
  BEAST_IF: 0.35, // 機獸閃避的無敵
  // 第 6 期：Boss
  BOSS_READ_TIER: 3, // 刁鑽度這個以上才讀蓄力射擊、雷射，才用熱焰彈反制導彈
  CHAIN_TIER: 5, // 刁鑽度這個以上的機甲型 Boss 會連續閃避
  CHAIN_P: 0.5,
  HOV_D: 5, // 升降閃避：目標高度改變（舊尺度的公尺，×dk）
  HOV_T: 0.6, // 升降閃避的秒數
  GUARD_T: 1.4, // 防禦：護盾架起的秒數
  GUARD_K: 0.3, // 防禦中的傷害倍率
  GUARD_COL: 0xffb060, // 防禦護盾的顏色（敵人：橘）
  SMOKE_R: 9, // 煙幕彈的半徑（舊尺度的公尺）
  SMOKE_T: 4, // 煙幕彈的秒數
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
  // 第 3 期：msl＝導彈打過來時的反制（smoke 煙幕彈、flare 熱焰彈）
  veh: { p: 0.4, cd: [2.2, 3.8], qb: 0.12, msl: 'smoke', kinds: { side: 5, back: 3 } }, // 裝甲車：甩尾
  heli: { p: 0.5, cd: [1.8, 3], qb: 0.14, msl: 'flare', kinds: { side: 5, rise: 2, dive: 2 } }, // 直升機：傾斜急閃、升降
  drone: { p: 0.5, cd: [1.4, 2.6], qb: 0.12, msl: 'flare', kinds: { side: 5, rise: 2, dive: 2 } }, // 無人機：橫滾、升降
  fixed: { p: 0.45, cd: [2.5, 4], kinds: { guard: 1 } }, // 固定砲台、護盾產生器：架起護盾
  // 第 4 期：專屬敵人（程式模型）
  fwalk: { p: 0.45, cd: [1.8, 3.2], qb: 0.1, kinds: { side: 6, back: 2 } }, // 步行、爬行的：側跳（整台跳起來傾斜）
  fveh: { p: 0.4, cd: [2.2, 3.8], qb: 0.11, msl: 'smoke', kinds: { side: 5, back: 3 } }, // 車輛類：甩尾、煙幕彈
  ffly: { p: 0.5, cd: [1.4, 2.6], qb: 0.12, msl: 'flare', kinds: { side: 5, rise: 2, dive: 2 } }, // 飛的：傾斜、橫滾、熱焰彈
  fguard: { p: 0.45, cd: [2.5, 4], kinds: { guard: 1 } }, // 固定的、重裝的：架起護盾
  fspec: { p: 0.6, cd: [3, 5], kinds: { spec: 1 } }, // 有自己的躲藏的：潛航、鑽地、埋雪、潛入熔岩、收回甲板、瞬移
  // 第 5 期：機獸（片段：dgSideL／R、dgBack、dgDuck）；機率另外依刁鑽度
  beast: { p: 0.4, cd: [2.4, 4], kinds: { side: 6, back: 3, duck: 2 } },
  // 第 6 期：Boss（機率另外依刁鑽度）
  bmech: { p: 0.5, cd: [1.6, 3], chain: true, kinds: { side: 6, back: 2, jump: 2 } }, // 機甲型：連續閃避
  bheli: { p: 0.45, cd: [2.2, 3.6], qb: 0.14, msl: 'flare', kinds: { side: 5, rise: 2, dive: 2 } }, // 母艦直升機、刃翼
  bjet: { p: 0.45, cd: [2.2, 3.6], qb: 0.12, msl: 'flare', kinds: { side: 5, rise: 2, dive: 2 } }, // 高速突擊機：橫滾
  bguard: { p: 0.4, cd: [5, 8], kinds: { guard: 1 } }, // 巨型：防禦（冷卻長：防禦的時間約占一成五）
  bworm: { p: 0.35, cd: [6, 9], kinds: { spec: 1 } }, // 鑽地蟲：提早下潛
};

// Boss 的種類（boss3Key：kind 或名稱開頭）；沒列的＝bguard 巨型的防禦
export const DG_BOSS = {
  ARCHON: 'bmech',
  mirror: 'bmech', // DOPPEL
  funnel: 'bmech', // SERAPHIM
  phantom: 'bmech', // MIRAGE
  hunter: 'bmech', // NULLIFIER
  duo: 'bmech', // KESTREL & BRANT
  trinity: 'bmech', // CERBERUS（合體中）
  sovereign: 'bmech',
  heli: 'bheli', // HELIOS
  ibis: 'bheli', // PULSAR
  interceptor: 'bjet', // VIPER
  worm: 'bworm', // SANDWORM
  fortress: 'bguard', // LEVIATHAN
};

// 專屬敵人（themeFoe）依 ai 的種類；人形（buildMech）的專屬敵人用一般的 mt
export const DG_FOE = {
  mt: 'mt', // 拾荒步行機
  boarder: 'mt',
  railgunner: 'mt',
  heatguard: 'fguard', // 耐熱重裝：架盾
  junk: 'fguard', // 廢鐵合成體：外殼硬化
  forklift: 'fguard', // 叉架：舉起貨櫃擋
  crane: 'fguard',
  gategun: 'fguard',
  laserpost: 'fguard',
  testrig: 'fguard',
  flak: 'fguard',
  focus: 'fguard',
  missilerack: 'fguard',
  turbine: 'fguard',
  anchor: 'fguard',
  twister: 'fguard',
  lamp: 'fguard',
  bellows: 'fguard',
  underturret: 'fguard',
  strider: 'fveh', // 壩頂巡邏砲車
  skater: 'fveh',
  kamikaze: 'fveh', // 炸藥礦車
  harpoon: 'fveh',
  smoker: 'fveh',
  watercannon: 'fveh',
  fueler: 'fveh',
  drill: 'fveh',
  sprayer: 'fwalk',
  blob: 'fwalk',
  crawler: 'fwalk',
  hopper: 'fwalk',
  ridgesniper: 'fwalk',
  blaster: 'fwalk',
  riveter: 'fwalk',
  welder: 'fwalk',
  cryo: 'fwalk',
  icemortar: 'fwalk',
  parasite: 'fwalk',
  zipline: 'fwalk',
  slagger: 'fwalk',
  rammer: 'ffly',
  vacuum: 'ffly',
  marker: 'ffly',
  drone: 'ffly', // 沙暴干擾機、結晶寄生無人機
  eel: 'ffly',
  netter: 'ffly',
  boomer: 'ffly',
  mirror: 'ffly',
  spotter: 'ffly',
  gunboat: 'fspec', // 下潛
  burrow: 'fspec', // 鑽回沙裡
  lurker: 'fspec', // 埋回雪裡
  magmadrone: 'fspec', // 潛入熔岩
  popturret: 'fspec', // 收回甲板下
  holoproj: 'fspec', // 瞬移
  // buoy 漂流水雷浮標：不閃
};
export const DG_SPEC_POP = {
  gunboat: '下潛',
  worm: '下潛',
  burrow: '鑽地',
  lurker: '潛伏',
  magmadrone: '潛入熔岩',
  popturret: '收回',
  holoproj: '瞬移',
};
