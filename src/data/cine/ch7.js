// 主線擴充（docs/campaign-expansion-design.md 第 10、11 節）的過場動畫：第 6 章的章末（中樞是空的：轉折）、
// 第 7 章 熔爐 的開場與章末、第 8 章 方舟 的開場（第 8 章沒有章末，接結局畫面）。
// 鏡頭語言：第 6 章章末延續太空的寂靜，最後一鏡切到熔岩；第 7 章是火與鐵的工業片（低角度、熱浪、火花）；
// 第 8 章是巨大感（從遠處飛越甲板、主砲塔的仰拍）。台詞＝data/story.js 的 CHAPTER_TEXT（依抉擇 pickLines）。
import { CHAPTER_TEXT, pickLines } from '../story.js';
import { G, W, black, boss, chapterCard, comm, hero, rival, shootout, timeline, vista } from './kit.js';

const ORBIT = W('orbit', { seed: 6601 });
const VOLC = W('volcano', { seed: 6701, tod: 'dusk' });
const VOLCN = W('volcano', { seed: 6702, tod: 'night' });
const ARK = W('ark', { seed: 6801 });
const ARKN = W('ark', { seed: 6802, tod: 'night' });
// 調色：熔爐（橘紅的高光、深棕的陰影、熱的顆粒）、方舟（灰鋼與警示紅）、空的中樞（褪色、冷）
const FORGE = {
  ...G.dusk,
  tintHi: '#ff7a30',
  tintHiK: 0.55,
  tintLo: '#3a1a10',
  tintLoK: 0.45,
  contrast: 1.2,
  bloom: 1.2,
  grain: 0.12,
};
const FORGEN = { ...G.night, tintHi: '#ff6a20', tintHiK: 0.5, bloom: 1.25, contrast: 1.18 };
const STEEL = {
  ...G.dusk,
  sat: 0.8,
  tintLo: '#30343a',
  tintLoK: 0.4,
  tintHi: '#ffb070',
  tintHiK: 0.3,
  contrast: 1.15,
};
const EMPTY = { ...G.day, sat: 0.45, temp: -0.3, exposure: 0.8, vignette: 0.55, contrast: 1.2 };
const sparks = (n, at, color = 0xffa040) =>
  Array.from({ length: n }, (_, i) => ({ t: 0.4 + i * 0.7, fx: 'streaks', at, n: 24, color }));

// ---------- 第 6 章 章末：中樞是空的 ----------
export function ch6Outro(ctx) {
  const L = pickLines(CHAPTER_TEXT[6].outro, (ctx && ctx.choices) || {});
  const T = timeline();
  T.add(...black('軌道站中樞', 'ORBITAL STATION // CORE', 3));
  T.add(...hero(ORBIT, EMPTY, 'walk', L[0]));
  T.add(...vista(ORBIT, EMPTY, 'push', L[1], { fov: 40 }));
  // 機械文字：認證終端不在這裡
  T.add(
    ...black('認證終端：不在此處', '所在地：方舟', 4, 'card', [
      { t: 0.3, sfx: 'uiErr', vol: 0.6, rate: 0.6 },
      { t: 2.2, sfx: 'uiErr', vol: 0.5, rate: 0.5 },
    ]),
  );
  T.add(...vista(ORBIT, { ...G.red, sat: 0.6 }, 'crane', L[3]));
  T.add(...comm(ORBIT, { ...EMPTY, exposure: 0.7 }, L[4], { yaw: 140 }));
  T.add(...comm(ORBIT, EMPTY, L[5], { yaw: 200, who: 'echo' }));
  // 最後一鏡：雲海的下面，熔岩在發光
  T.add(
    ...vista(VOLCN, FORGEN, 'fly', '', {
      d: 4.5,
      fo: 1.6,
      ev: [{ t: 0.6, card: '方舟', s: 'THE ARK', style: 'name', dur: 3.4 }],
    }),
  );
  return T.def({
    title: '第六章　章末',
    music: [{ at: 0, track: 'cine_tension', vol: 0.8, fadeIn: 2, fadeOut: [Math.max(1, T.at - 3), 3] }],
  });
}

// ---------- 第 7 章 開場 ----------
export function ch7Intro(ctx) {
  const L = pickLines(CHAPTER_TEXT[7].intro, (ctx && ctx.choices) || {});
  const T = timeline();
  T.add(...black('CHAPTER VII', '', 2.6, 'card', [{ t: 0.3, sfx: 'thud1', vol: 0.6, rate: 0.6 }]));
  T.add(...vista(VOLC, FORGE, 'fly', L[0], { ev: sparks(4, [0, 2, -20]) }));
  T.add(...vista(VOLC, FORGE, 'crane', L[1], { fov: 52 }));
  T.add(...boss(VOLC, FORGE, 'anvil', 'ANVIL', '鍛造巨人', L[2], { scale: 1.2 }));
  T.add(...vista(VOLCN, FORGEN, 'pan', L[3]));
  T.add(...comm(VOLC, FORGE, L[4], { yaw: 120 }));
  T.add(...rival(VOLC, FORGE, 'kiln', 'KILN', '熔爐的守衛', 'KILN：「熱嗎？這裡一直都這麼熱。」'));
  for (const s of shootout(VOLC, FORGE, 'kiln', {
    lines: ['', 'ECHO：「貼身壓制型——拉開距離！」'],
  }))
    T.add(...s);
  T.add(...chapterCard(VOLC, FORGE, '第七章　熔爐', 'CHAPTER VII'));
  return T.def({
    title: '第七章　開場',
    music: [{ at: 0, track: 'cine_drive', vol: 0.9, fadeIn: 1, fadeOut: [Math.max(1, T.at - 3), 3] }],
  });
}

// ---------- 第 7 章 章末：方舟起航 ----------
export function ch7Outro(ctx) {
  const L = pickLines(CHAPTER_TEXT[7].outro, (ctx && ctx.choices) || {});
  const T = timeline();
  T.add(...black('第七章　熔爐', 'AFTERMATH', 2.8, 'card', [{ t: 0.3, sfx: 'thud1', vol: 0.6, rate: 0.6 }]));
  T.add(
    ...vista(VOLCN, FORGEN, 'crane', L[0], {
      ev: [
        { t: 0.4, shake: 0.5 },
        { t: 0.5, sfx: 'heavy', vol: 1, rate: 0.45 },
        { t: 1.5, boom: [-14, 2, -24], big: true },
      ],
    }),
  );
  T.add(...boss(VOLCN, FORGEN, 'gantry', 'GANTRY', '船塢起重要塞', L[1], { scale: 0.8 }));
  T.add(...comm(VOLCN, FORGEN, L[2], { yaw: 200 }));
  T.add(...hero(VOLCN, FORGEN, 'boost', L[3]));
  T.add(...vista(ARKN, STEEL, 'fly', '', { d: 4, fo: 1.6 }));
  return T.def({
    title: '第七章　章末',
    music: [{ at: 0, track: 'cine_tension', vol: 0.85, fadeIn: 1, fadeOut: [Math.max(1, T.at - 3), 3] }],
  });
}

// ---------- 第 8 章 開場 ----------
export function ch8Intro(ctx) {
  const L = pickLines(CHAPTER_TEXT[8].intro, (ctx && ctx.choices) || {});
  const T = timeline();
  T.add(...black('CHAPTER VIII', '', 2.6, 'card', [{ t: 0.3, sfx: 'thud1', vol: 0.6, rate: 0.6 }]));
  T.add(...vista(ARK, STEEL, 'fly', L[0], { fov: 54 }));
  T.add(...vista(ARK, STEEL, 'low', L[1]));
  T.add(...boss(ARK, STEEL, 'deckgun', 'COLOSSUS', '主砲塔', L[2], { scale: 1 }));
  T.add(...comm(ARKN, G.night, L[3], { yaw: 160 }));
  T.add(...rival(ARK, STEEL, 'keel', 'KEEL', '方舟的守衛', 'KEEL：「方舟不會停。」'));
  for (const s of shootout(ARK, STEEL, 'keel', {
    lines: ['', 'ECHO：「跳起來躲衝擊波——繞到盾的另一側！」'],
  }))
    T.add(...s);
  T.add(...chapterCard(ARK, STEEL, '第八章　方舟', 'CHAPTER VIII'));
  return T.def({
    title: '第八章　開場',
    music: [{ at: 0, track: 'cine_drive', vol: 0.9, fadeIn: 1, fadeOut: [Math.max(1, T.at - 3), 3] }],
  });
}
