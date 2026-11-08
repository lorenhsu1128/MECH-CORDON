// 委託板（主線擴充 C2，docs/campaign-expansion-design.md）：作戰室的短委託，1～2 段、帶一條特殊規則，不算進整章完成、可以重複接。
// 存在 save.story.board＝{ chapter, seq, jobs }；每個委託登記成 SORTIES 的「不可列舉」項目 jb_<id>（boardRegister），
// 所以主線的流程（campBegin、紀錄點、結果畫面）照用，但總覽圖、整章完成、作戰紀錄等列舉出擊的地方看不到它。
// 規則的效果在各處以 Game.campRule(鍵) 判斷（game/board.js 的說明）。
import { AC_ROSTER } from './enemies.js';
import { SEG_TYPES, SORTIES } from './campaign.js';

export const RULES = {
  timed: {
    name: '限時作戰',
    desc: '5 分鐘內完成，超過就失敗',
    types: ['battle', 'destroy', 'front'],
    segs: 2,
  },
  noMissile: { name: '禁用導彈', desc: '導彈類武器不能使用', types: ['battle', 'elite', 'destroy'], segs: 2 },
  noMelee: { name: '禁用近戰', desc: '近戰武器不能使用', types: ['battle', 'destroy', 'extract'], segs: 2 },
  meleeOnly: { name: '只能近戰', desc: '只有近戰武器能用', types: ['battle', 'elite'], segs: 1 },
  loaner: {
    name: '借用的機體',
    desc: '用委託方準備的機體出擊（不是你的組裝）',
    types: ['battle', 'destroy', 'chase'],
    segs: 2,
  },
  lowAp: {
    name: '帶傷出擊',
    desc: 'AP 30% 開始、沒有修復套件',
    types: ['battle', 'elite', 'intel'],
    segs: 1,
  },
  allAffix: { name: '精英部隊', desc: '所有敵人都帶詞綴', types: ['battle', 'destroy'], segs: 1 },
  oneShot: { name: '一擊必殺', desc: '雙方受到的傷害 ×5', types: ['battle', 'elite'], segs: 1 },
  noQB: { name: '推進器故障', desc: '不能 QB', types: ['battle', 'front'], segs: 1 },
  fog: { name: '濃霧', desc: '視野很短', types: ['battle', 'stealth', 'intel'], segs: 2 },
  stealthStrict: { name: '絕對隱密', desc: '潛入作業，被發現就失敗', types: ['stealth'], segs: 1 },
  extractRich: { name: '大宗物資', desc: '撤離作業，回收物資加倍', types: ['extract'], segs: 1 },
};
export const RULE_KEYS = Object.keys(RULES);
export const BOARD_N = 4; // 委託板上同時有幾個
export const HIRE_COST = [6000, 2000]; // 雇用僚機：a＋b×章

// 這一章的主題（主線出擊用過的）與基準等級
function chapterInfo(ch) {
  const themes = new Set();
  let lv = 0,
    n = 0;
  for (const sid in SORTIES) {
    const so = SORTIES[sid];
    if (so.chapter !== ch) continue;
    for (const s of so.segs) if (s.theme) themes.add(s.theme);
    lv += so.level;
    n++;
  }
  return { themes: [...themes], level: n ? Math.round(lv / n) + 1 : ch * 2 + 1 };
}
// 產生一個委託（rng＝0～1 的亂數函式）
export function genJob(ch, id, rng) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  const k = pick(RULE_KEYS),
    R = RULES[k];
  const info = chapterInfo(ch);
  const theme = pick(info.themes.length ? info.themes : ['wasteland']);
  const t1 = pick(R.types);
  const segs = [{ theme, pool: [t1] }];
  if (R.segs > 1) segs.push({ theme: pick(info.themes) || theme, pool: [pick(R.types)] });
  const job = {
    id,
    ch,
    rule: k,
    theme,
    segs,
    level: info.level,
    coam: Math.round((12000 + 6000 * ch) / 1000) * 1000,
    mats: { alloy: 2 + ch, circuit: 1 + Math.floor(ch / 2), core: ch >= 4 ? 1 : 0 },
    part: 0.3,
    name: `${R.name}：${SEG_TYPES[t1].name}`,
  };
  if (k === 'loaner') job.asm = { ...pick(Object.values(AC_ROSTER)).asm };
  return job;
}
// 委託 → 出擊（SORTIES 的不可列舉項目 jb_<id>）
export function jobSortie(job) {
  return {
    name: `委託板 — ${job.name}`,
    chapter: job.ch,
    level: job.level,
    reward: job.coam,
    segs: job.segs.map((s) => ({ ...s })),
    job: true,
    rule: job.rule,
    asm: job.asm,
  };
}
// 把存檔裡委託板上的委託登記成出擊（讀檔、紀錄點的檢查之前）
export function boardRegister(story) {
  const B = story && story.board;
  if (!B || !Array.isArray(B.jobs)) return;
  for (const job of B.jobs) {
    const sid = 'jb_' + job.id;
    if (Object.prototype.hasOwnProperty.call(SORTIES, sid)) continue;
    Object.defineProperty(SORTIES, sid, { value: jobSortie(job), enumerable: false, configurable: true });
  }
}
