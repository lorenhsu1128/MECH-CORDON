// 各章的開場／章末過場動畫（game/cine.js 播放；過場改版，docs/cine-redesign-design.md）：
// 第 1 章開場＝ch1-intro.js（第 1 期的試做），其他全部＝chfilm.js 的新格式（舊的 3D 演出已經拿掉）。
import { ch1Intro } from './ch1-intro.js';
import { chapterFilm } from './chfilm.js';

// kind：'intro'｜'outro'
export function chapterCine(ch, kind, ctx) {
  if (ch === 1 && kind === 'intro') return ch1Intro(ctx);
  return chapterFilm(ch, kind, ctx);
}
