// 過場動畫的目錄：鍵和故事畫面相同（p<周目>＝序章、i<周目>_<章>＝章節開場、o<周目>_<章>＝章末），
// 值是產生器 (ctx：{ cycle, choices }) => 劇本（沒有內容時回傳 null）。播放在 game/cine.js
import { chapterCine } from './chapters.js';
import {
  c2AethericPost,
  c2CastronPost,
  c4SanctaPost,
  c4VeerwellPost,
  c6BeyondPost,
  c6OpenPost,
  c6SealPost,
} from './aftermath.js';
import { memoryCine, trueEndCine } from './memory.js';
import { prologueCine } from './prologue.js';
import { choicePreFilm } from './chfilm.js';

export const CINES = {};
for (let cyc = 1; cyc <= 3; cyc++) {
  CINES['p' + cyc] = (ctx) => prologueCine({ ...ctx, cycle: cyc });
  // 第 8 章沒有章末（接結局畫面）；第 6 章的章末是主線擴充的轉折
  for (let ch = 1; ch <= 8; ch++) {
    CINES[`i${cyc}_${ch}`] = (ctx) => chapterCine(ch, 'intro', { ...ctx, cycle: cyc });
    if (ch < 8) CINES[`o${cyc}_${ch}`] = (ctx) => chapterCine(ch, 'outro', { ...ctx, cycle: cyc });
  }
}

// 抉擇演出：x_<抉擇>_pre（選前，在目前的戰場上播）、x_<抉擇>_<選項>（選後的代價）
// 過場改版第 9 期：選前的最前面是兩邊委託方的對峙（talks.js 的 pre_<抉擇>）；選後整段是代價的漫畫蒙太奇（aftermath.js）
const pre = (id) => (ctx) => choicePreFilm(id, ctx);
Object.assign(CINES, {
  x_c2_pre: pre('c2'),
  x_c2_castron: c2CastronPost,
  x_c2_aetheric: c2AethericPost,
  x_c4_pre: pre('c4'),
  x_c4_veerwell: c4VeerwellPost,
  x_c4_sancta: c4SanctaPost,
  x_c6_pre: pre('c6'),
  x_c6_open: c6OpenPost,
  x_c6_seal: c6SealPost,
  x_c6_beyond: c6BeyondPost,
});

// 過場改版第 10 期：ECHO 的記憶片段 m1～m8 與真結局 e_beyond（方案 E 的雙色調 2D 短片，data/cine/memory.js）
for (let k = 1; k <= 8; k++) CINES['m' + k] = () => memoryCine(k);
CINES.e_beyond = (ctx) => trueEndCine(ctx);
