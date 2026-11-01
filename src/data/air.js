// 空域的飛行（docs/air-combat-design.md）：高推力機甲的數值。公尺與秒（新尺度的公尺，不再乘 DS）。
// entities/mech-air.js（飛行）與 game/air.js（鏡頭、HUD）共用。
export const AIR = {
  CRUISE: 70, // 巡航（m/s）
  BOOST: 110, // 推進（按住前）
  AB: 150, // 突擊推進
  HOVER: 6, // 減速到底（懸停）
  SIDE: 24, // 橫移
  ACC: 32, // 加速（m/s²）
  DEC: 48, // 減速
  TURN: 1.05, // 轉向（rad/s，中速）
  TURN_HOVER: 2.2, // 懸停時原地轉身
  GTURN: 2, // 急轉彎的倍率
  GDRAG: 26, // 急轉彎的掉速（m/s²）
  PITCH_MAX: 1.45,
  CEIL: 1200, // 高度上限（m）
  EN_BOOST: 0.1, // 每秒耗 EN（最大 EN 的比例）
  EN_AB: 0.32,
  EN_G: 0.12,
  ROLL_IMP: 92, // 側滾翻的側移（m/s，之後衰減）
  FWD_IMP: 50, // 前滾翻的加速
  REV_T: 0.75, // 後空翻的秒數
  FLIP_T: 0.5, // 側滾翻、前滾翻的翻轉秒數
  STICK_G: 0.9, // 右搖桿推過這個幅度＝急轉彎（手把、觸控）
  CAM_LEAD: 0.35, // 右搖桿轉向時，鏡頭最多比機首超前多少（弧度）
  // 內建的空戰標準導彈（第 2 期，不佔機甲庫的武器槽）：兩條發射軌輪流裝填
  AAM_N: 72, // 玩家的彈數
  AAM_RAIL: 2.2, // 每條軌的裝填（秒）
  AAM_R: 900, // 射程＝空域的鎖定距離
  AAM_V: 230, // 彈速（m/s）
  AAM_TURN: 1.9, // 追蹤的轉向（rad/s）：急轉彎（約 2.1）或時機剛好的機動甩得掉
  AAM_CONE: 0.6, // 機首前方這個角度（弧度）以內才鎖得到
  AAM_DMG: 3200, // 無人機一發、敵對 AC 約 3 發（閃掉的不算）
  AAM_IMP: 420,
  AAM_SPLASH: 9,
  AAM_LOSE: 1.3, // 導彈和目標的夾角超過這個（擦身而過）就失去追蹤
  // 敵人的空戰導彈（敵對 AC、地面的防空）
  NPC_AAM_DMG: 520,
  NPC_AAM_TURN: 1.45,
  NPC_AAM_CD: [6, 9], // 發射間隔（秒，÷技巧）
  // 敵人的空戰 AI
  AI_FIRE_CONE: 0.3, // 手持武器在機首前方這個角度內才開火
  AI_EXTEND: 140, // 迎面太近：拉開距離再回頭
  AI_FLOOR: 140, // 離地低於這個就拉起
  AI_DODGE: 0.4, // 導彈快打到時翻滾閃避的機率（×技巧）
  // ---------- 空戰的樂趣改版（2026-11-01 使用者定案：A～D） ----------
  // A1 攻擊名額：同時最多 TOK_N 台開火（敵對 AC 另外 TOK_ACE 台），拿著 TOK_HOLD 秒後交出、休息 TOK_REST 秒；
  //   沒拿到的在 ORBIT_R 外繞圈、不開火
  TOK_N: 2,
  TOK_ACE: 1,
  TOK_HOLD: 8,
  TOK_REST: 3,
  ORBIT_R: 650,
  // A2 第一波：在 FIRST_R 外照巡邏航線飛，WAKE_R 內、被打中、同一隊有人交戰才交戰；場上沒有交戰的 STALL_T 秒後最近的一隊來找
  FIRST_R: [1200, 2000],
  WAKE_R: 800,
  PATROL_R: 350,
  STALL_T: 15,
  // A3 防空砲：機砲射程 ×FLAK_R；空戰導彈只打 FLAK_SAM_R 內、比它高不到 FLAK_SAM_H 的（低空飛過）；射程畫成紅色的網格圓頂
  FLAK_R: 1.2,
  FLAK_SAM_R: 650,
  FLAK_SAM_H: 450,
  // B1 敵人的瞄準：目標直線飛 AIM_STEADY 秒後預判才準；不在目標背後（咬尾）時預判 ×AIM_SIDE；越遠越散
  AIM_STEADY: 2.5,
  AIM_LEAD: [0.3, 0.85], // 剛轉彎 → 直線飛滿 AIM_STEADY 秒
  AIM_SIDE: 0.6,
  AIM_SPREAD: [1.8, 1], // 擴散倍率（同上）
  AIM_DIST: 350, // 擴散再 ×(1＋距離／AIM_DIST)
  TAIL_DOT: -0.4, // 敵人在機體背後（機首方向和「目標 → 敵人」的內積小於這個）＝咬尾
  // B2 敵人的雷射：先拉預警線 BEAM_WARN 秒，之後射向預警時的位置
  BEAM_WARN: 0.6,
  // B4 子彈擦身而過的距離
  WHIZ_R: 14,
  // C1 玩家飛行中不會被打出失衡；C2 沒被打中 REGEN_DELAY 秒後 AP 每秒回復 REGEN_RATE，回到 REGEN_CAP 為止
  REGEN_DELAY: 6,
  REGEN_RATE: 0.04,
  REGEN_CAP: 0.7,
  // C3 MS-4／MS-8 在空域：機首前方 ML_CONE、ML_R 內依序鎖定最多 ML_MAX 台（每 ML_STEP 秒一台、ML_LOCK 秒鎖滿），一次齊射分給鎖定的目標
  ML_IDS: ['bw_ms', 'bw_ms8'],
  ML_MAX: 4,
  ML_R: 750,
  ML_CONE: 0.7,
  ML_STEP: 0.2,
  ML_LOCK: 0.35,
  ML_V: 190,
  ML_TURN: 2.4,
  ML_DMG: 18, // 每枚的傷害倍率（MS-4 一枚≈無人機一台）
  ML_CD: 5, // 齊射後的冷卻（MS-8 ×√2）
  // C4 補給：擊墜一台補 KILL_AAM 枚空戰導彈；友軍雷達站上空（水平 BASE_R、高 BASE_H 內）回復 AP 與彈藥
  KILL_AAM: 2,
  BASE_R: 260,
  BASE_H: 500,
  BASE_AP: 0.08, // 每秒（最大 AP 的比例）
  BASE_AAM: 4, // 每秒
  BASE_AMMO: 0.08, // 每秒（總彈數的比例）
  // D 空中要塞：轉向很慢（正後方與機腹是安全區）；主砲與彈幕只打前方 FZ_FRONT、FZ_GUN_R 內；
  //   懸吊砲塔不打正後方（FZ_REAR 以外）與 FZ_MIN 內；空戰導彈不打 FZ_SAM_MIN 內；砲塔還在時引擎 ×FZ_ENG_K
  FZ_YAW: 0.35,
  FZ_FRONT: 1.2,
  FZ_REAR: 2.1,
  FZ_GUN_R: 700,
  FZ_MIN: 90,
  FZ_SAM_MIN: 250,
  FZ_CH: 1.4, // 主砲的預警（秒）
  FZ_CN: [10, 7], // 主砲的間隔（第一型態、第二型態起）
  FZ_BR: [8.5, 6], // 彈幕的間隔
  FZ_BAR_N: [11, 15],
  FZ_BAR_V: 75, // 彈幕的彈速（慢、大顆，飛過縫隙）
  FZ_ENG_K: 0.25,
};
