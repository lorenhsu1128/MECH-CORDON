// 各章的開場／章末過場動畫（game/cine.js 播放；過場改版，docs/cine-redesign-design.md）：
// 第 1 章開場＝ch1-intro.js（第 1 期的試做），其他全部＝chfilm.js 的新格式（舊的 3D 演出已經拿掉）。
import { ch1Intro } from './ch1-intro.js';
import { chapterFilm } from './chfilm.js';
import { ch2Intro, ch2Outro } from './ch2-anime.js';
import { ch3Intro, ch3Outro } from './ch3-anime.js';
import { ch4Intro, ch4Outro } from './ch4-anime.js';
import { ch5Intro, ch5Outro } from './ch5-anime.js';
import { ch6Intro, ch6Outro } from './ch6-anime.js';

// kind：'intro'｜'outro'
export function chapterCine(ch, kind, ctx) {
  if (ch === 1 && kind === 'intro') return ch1Intro(ctx);
  // 3D 動畫化（docs/cine-redesign-design.md 第十節）：做好的章換成新的
  if (ch === 2 && kind === 'intro') return ch2Intro(ctx);
  if (ch === 2 && kind === 'outro') return ch2Outro(ctx);
  if (ch === 3 && kind === 'intro') return ch3Intro(ctx);
  if (ch === 3 && kind === 'outro') return ch3Outro(ctx);
  if (ch === 4 && kind === 'intro') return ch4Intro(ctx);
  if (ch === 4 && kind === 'outro') return ch4Outro(ctx);
  if (ch === 5 && kind === 'intro') return ch5Intro(ctx);
  if (ch === 5 && kind === 'outro') return ch5Outro(ctx);
  if (ch === 6 && kind === 'intro') return ch6Intro(ctx);
  if (ch === 6 && kind === 'outro') return ch6Outro(ctx);
  return chapterFilm(ch, kind, ctx);
}
