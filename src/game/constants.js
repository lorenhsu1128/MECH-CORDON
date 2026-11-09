import { DS } from '../core/scale.js';

// ---------- 第一人稱 ----------
export const FP_FOV = 75,
  TP_FOV = 42,
  CHASE_FOV = 62,
  FP_CONE = (15 * Math.PI) / 180;

// ---------- PVP ----------
export const PVP_TEAM_COLORS = ['#5cc8ff', '#ff6a6a'];
export const AI_DIFF = {
  easy: { hp: 0.8, dmg: 0.8, skill: 0.6, name: '簡單' },
  std: { hp: 1.0, dmg: 1.0, skill: 1.0, name: '標準' },
  hard: { hp: 1.2, dmg: 1.1, skill: 1.4, name: '困難' },
};

// ---------- 據點（outposts.js） ----------
export const GUARD_ALERT_R = 38 * DS; // 守衛發現玩家的距離
export const GUARD_MIN_D = GUARD_ALERT_R + 6 * DS; // 守衛生成時離玩家至少這麼遠（否則一開場就出動）
// 地圖節奏改版（game/encounters.js）：這麼遠以上的敵人改用敵群的標示，不畫各自的畫面外箭頭
export const ENC_MARK_MIN = 38 * DS;

// ---------- 作戰紀錄與自由出擊的危險條款（sim.js、free-ops.js）：k＝報酬加成 ----------
export const HEAT = {
  shield: { name: '敵人強化', desc: '敵人 AP ×1.35', k: 0.25 },
  p2: { name: 'Boss 第二型態', desc: 'Boss 一開始就是第二型態', k: 0.25 },
  timed: { name: '限時作戰', desc: '25 分鐘內完成，超過就失敗', k: 0.2 },
  nosupply: { name: '補給中斷', desc: '沒有補給區段', k: 0.15 },
};
