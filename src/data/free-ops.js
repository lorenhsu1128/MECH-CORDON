// 自由出擊的作戰設定（docs/free-sortie-design.md）：選項的清單、讀檔整理 foSanitize、把設定組成臨時的出擊 freeSortie。
// 純資料與純函式；隨機的決定、地圖合不合用（公路、鐵路、bossBan）在 game/free-ops.js。
import { SEG_TYPES } from './campaign.js';

export const FO_KEY = 'mech_cordon_freeops';
export const FO_MODES = {
  level: '戰鬥（依等級）',
  seg: '單一區段',
  chain: '連續出擊',
  sortie: '主線出擊重現',
};
export const FO_MODE_DESC = {
  level: '原本的自由出擊：等級依序推進，Boss 關照等級排。',
  seg: '挑一種任務、地圖與對手打一段。可以選等級（不推進等級）。',
  chain: '連續打 2～5 段：區段清除後選出口（獎勵與下一段），中途可以整備。',
  sortie: '照主線的出擊打一次（段落、地圖、Boss 相同），不播劇情、不改主線進度。',
};
// 單一區段可以選的類型（補給只出現在連續出擊；空戰只有單人）
export const FO_TYPES = [
  'battle',
  'elite',
  'destroy',
  'defend',
  'escort',
  'breakthrough',
  'intel',
  'extract',
  'chase',
  'front',
  'colossus',
  'air',
  'boss',
];
export const FO_CHAIN_TYPES = [...FO_TYPES.filter((t) => t !== 'boss'), 'supply', 'boss'];
export const FO_ROAD = ['escort', 'chase']; // 要有公路
export const FO_SOLO = ['air']; // 只有單人
export const WEATHER_NAMES = {
  none: '晴朗（無）',
  rain: '降雨',
  snow: '降雪',
  sand: '沙塵暴',
  dust: '粉塵',
  ash: '火山灰',
  coral: 'Coral 粒子',
};
export const COL_NAMES = { walker: '多足巨兵', ship: '陸上戰艦' };

// 預設：原本的自由出擊
export function foDefault() {
  return {
    v: 1,
    mode: 'level',
    type: 'battle',
    theme: '',
    variant: '',
    landmark: '',
    tod: '',
    weather: '',
    zone: '',
    depth: 0,
    boss: '',
    echo: false,
    ace: '',
    col: '',
    level: 1,
    n: 3,
    chainRandom: true,
    segs: [],
    sid: '',
    rule: '',
    heat: {},
    affix: 'auto',
    nem: false,
    wing: '',
  };
}
const str = (v, n = 40) => (typeof v === 'string' ? v.slice(0, n) : '');
// 區段的欄位（單一區段的本體、連續出擊的每一段共用）
const SEG_KEYS = ['type', 'theme', 'variant', 'landmark', 'tod', 'weather', 'zone', 'boss', 'ace', 'col'];
export function foSegSanitize(s, types = FO_CHAIN_TYPES) {
  const o = {};
  for (const k of SEG_KEYS) o[k] = str(s && s[k]);
  if (!types.includes(o.type)) o.type = 'battle';
  o.depth = Math.max(0, Math.min(4, Math.round(+(s && s.depth) || 0)));
  o.echo = !!(s && s.echo);
  return o;
}
// 讀檔整理：maxLevel＝目前的等級（手動選的等級上限）
export function foSanitize(raw, maxLevel = 1) {
  const d = foDefault();
  const r = raw && typeof raw === 'object' ? raw : {};
  const o = { ...d, ...foSegSanitize({ ...d, ...r }, FO_TYPES) };
  o.mode = FO_MODES[r.mode] ? r.mode : 'level';
  o.level = Math.max(1, Math.min(Math.max(1, maxLevel), Math.round(+r.level || maxLevel)));
  o.n = Math.max(2, Math.min(5, Math.round(+r.n || 3)));
  o.chainRandom = r.chainRandom !== false;
  o.segs = (Array.isArray(r.segs) ? r.segs : []).slice(0, 5).map((s) => foSegSanitize(s));
  o.sid = str(r.sid, 20);
  o.rule = str(r.rule, 20);
  o.heat = {};
  if (r.heat && typeof r.heat === 'object') for (const k in r.heat) if (r.heat[k]) o.heat[str(k, 20)] = true;
  o.affix = ['off', 'auto', 'all'].includes(r.affix) ? r.affix : 'auto';
  o.nem = !!r.nem;
  o.wing = str(r.wing, 20);
  return o;
}
// 等級 → 章（敵人詞綴的機率、Boss 的刁鑽度用；主線大約每章兩級）
export function foChapter(L) {
  return Math.max(1, Math.min(8, Math.floor(L / 2)));
}
// 完成報酬：約等於主線同等級、同段數的出擊（c1s1＝等級 2、5 段、30000）
export function foReward(L, n) {
  return Math.round(((2000 + 2000 * L) * n) / 1000) * 1000;
}
// 已經決定好的區段（game/free-ops.js 的 foResolve）→ 臨時的出擊與排程
// rs：[{ theme, type, variant, landmark, tod, weather, zone, zoneAxis, depth, boss（BOSS_DEFS 索引）, echo, ace, acr, col, border }]
export function freeSortie(fo, rs, L) {
  const names = rs.map((s) => SEG_TYPES[s.type].name);
  const so = {
    name: `自由出擊 — ${rs.length > 1 ? names.join('→') : names[0]}`,
    chapter: foChapter(L),
    level: L,
    reward: foReward(L, rs.length),
    free: true,
    segs: rs.map((s) => {
      const g = { theme: s.theme, pool: [s.type] };
      if (s.boss != null && s.boss !== '') g.boss = '#' + s.boss;
      if (s.echo) g.echo = true;
      if (s.ace) g.ace = s.ace;
      if (s.acr) g.acr = s.acr;
      if (s.border) g.border = true;
      return g;
    }),
  };
  if (fo.rule) so.rule = fo.rule;
  const plan = rs.map((s) => ({
    variant: s.variant || null,
    landmark: s.landmark || null,
    tod: s.tod || 'day',
    weather: s.weather || null,
    zone: s.zone || 'full',
    zoneAxis: s.zoneAxis || 0,
    depth: s.depth || 0,
    col: s.col || undefined,
  }));
  return { so, plan };
}
