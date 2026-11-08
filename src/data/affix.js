// 敵人詞綴（主線擴充 B4，docs/campaign-expansion-design.md）：一般敵人有機率帶 1～2 個詞綴，各有對應的打法。
// 位元存在實體的 af（生成紀錄同步給客機）；執行中的狀態（隱形中、狂暴中、反射中）在 afs（快照同步）。
// 判定在房主／單機（entities/mech-affix.js），外觀各端照 af／afs 自己做。
import { DS } from '../core/scale.js';

export const AFFIXES = {
  shield: { bit: 1, name: '護盾', icon: '⬢', tip: '正面有能量護盾 — 繞到背後打或近戰' },
  split: { bit: 2, name: '分裂', icon: '✣', tip: '擊破時分成兩台小型的 — 用範圍攻擊收尾' },
  cloak: { bit: 4, name: '隱形', icon: '◌', tip: '沒開火時隱形、不能鎖定 — 看到它開火就反擊' },
  berserk: { bit: 8, name: '狂暴', icon: '▲', tip: 'AP 剩一半時速度與火力大增 — 一口氣打完' },
  reflect: { bit: 16, name: '反射', icon: '◇', tip: '每隔幾秒彈開實彈 — 看準空檔或用能量武器' },
  regen: { bit: 32, name: '再生', icon: '✚', tip: '幾秒沒被打就回復 AP — 持續施壓' },
  volatile: { bit: 64, name: '殉爆', icon: '✸', tip: '擊破後大爆炸 — 保持距離' },
  swift: { bit: 128, name: '疾風', icon: '»', tip: '移動很快 — 用霰彈或預判' },
  magnet: { bit: 256, name: '磁力', icon: '⊛', tip: '把附近的導彈吸過去 — 先打掉它再用導彈' },
  leader: { bit: 512, name: '指揮', icon: '★', tip: '附近的敵人受到的傷害減少 — 先打它' },
};
export const AF_KEYS = Object.keys(AFFIXES);
// 執行中的狀態（afs）
export const AFS = { CLOAK: 1, BERSERK: 2, REFLECT: 4 };

export const AF = {
  HP: 1.5, // 帶詞綴的 AP
  BOUNTY: 1.35, // 擊破獎金（AP 已經 ×1.5，合計約 ×2）
  SHIELD_K: 0.2, // 正面護盾的傷害倍率
  SHIELD_DOT: 0.35, // 正面的角度（cos，約 ±70°）
  SPLIT_HP: 0.35, // 分裂出來的每台 AP（本體的比例）
  SPLIT_SC: 0.75, // 分裂出來的大小
  CLOAK_IDLE: 1.6, // 停火幾秒後隱形
  BERSERK_AT: 0.5, // 狂暴的 AP 門檻
  BERSERK_SPD: 1.35,
  BERSERK_DMG: 1.4,
  REFLECT_CD: 6, // 反射的週期
  REFLECT_T: 2, // 反射持續
  REGEN_WAIT: 3, // 幾秒沒被打開始回復
  REGEN_RATE: 0.05, // 每秒回復最大 AP 的比例
  VOL_DELAY: 1.1, // 擊破到爆炸的秒數
  VOL_R: 9 * DS, // 爆炸半徑
  VOL_FRAC: 0.14, // 中心的傷害（目標最大 AP 的比例）
  SWIFT_SPD: 1.45,
  MAGNET_R: 32 * DS, // 吸導彈的距離
  LEADER_R: 26 * DS, // 指揮的範圍
  LEADER_K: 0.7, // 範圍內的友軍受到的傷害
};

// 不帶詞綴的敵人（行為特殊、目標物、支援類）
const NO_AF = new Set([
  'objective',
  'part',
  'convoy',
  'holo',
  'holoproj',
  'repair',
  'dome',
  'dropship',
  'minelayer',
  'crane',
  'gategun',
  'laserpost',
  'testrig',
  'lamp',
  'bpart',
]);
// 互斥（同一台不同時帶）與類型限制
const PAIR_BAN = [
  ['cloak', 'leader'],
  ['shield', 'reflect'],
  ['split', 'volatile'],
];
const FLY_BAN = new Set(['shield']); // 飛行的不帶正面護盾（從下方打不到正面）
// 隱形改材質的透明度：只給機甲模型（每台自己的材質；載具與專屬敵人的程式模型可能和同型的共用材質）

// 這種敵人可以帶詞綴嗎
export function affixable(d, t) {
  return !!d && t !== 'ac' && !d.roster && !d.support && !d.decoy && !d.spawnOnly && !NO_AF.has(d.ai);
}
// 機率：主線依章與周目、自由出擊依等級
export function affixChance({ chapter = 0, cycle = 1, level = 1 }) {
  const base = chapter ? 0.03 + 0.02 * chapter : Math.min(0.15, 0.02 + 0.01 * level);
  return Math.min(0.35, base + 0.05 * (cycle - 1));
}
// 抽詞綴（回傳位元；0＝沒有）：two＝第二個詞綴的機率
export function rollAffix(d, rng, two) {
  const pool = AF_KEYS.filter((k) => !(d.flying && FLY_BAN.has(k)) && !(k === 'cloak' && d.modelKind));
  const a = pool[Math.floor(rng() * pool.length)];
  let mask = AFFIXES[a].bit;
  if (rng() < two) {
    const ok = pool.filter(
      (k) => k !== a && !PAIR_BAN.some(([x, y]) => (x === a && y === k) || (y === a && x === k)),
    );
    if (ok.length) mask |= AFFIXES[ok[Math.floor(rng() * ok.length)]].bit;
  }
  return mask;
}
export const affixList = (mask) => AF_KEYS.filter((k) => mask & AFFIXES[k].bit);
export const affixNames = (mask) => affixList(mask).map((k) => AFFIXES[k].name);
