// 過場動畫的目錄：鍵和故事畫面相同（p<周目>＝序章、i<周目>_<章>＝章節開場、o<周目>_<章>＝章末），
// 值是產生器 (ctx：{ cycle, choices }) => 劇本（沒有內容時回傳 null）。播放在 game/cine.js
import { chapterCine } from './chapters.js';
import { c2Aetheric, c2Castron, c2Pre } from './ch2.js';
import { c4Pre, c4Sancta, c4Veerwell } from './ch4.js';
import { c6Beyond, c6Open, c6Pre, c6Seal } from './ch6.js';
import { memoryCine, trueEndCine } from './memory.js';
import { prologueCine } from './prologue.js';
import { withRecap, withTalk } from './talks.js';

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
// 過場改版第 9 期：選前的最前面是兩邊委託方的對峙（talks.js 的 pre_<抉擇>），選後的最後是代價的漫畫頁（withRecap）
const pre = (f, k) => (ctx) => withTalk(f(ctx), k, ctx);
const post = (f, o) => (ctx) => withRecap(f(ctx), o);
Object.assign(CINES, {
  x_c2_pre: pre(c2Pre, 'pre_c2'),
  x_c2_castron: post(c2Castron, {
    title: '主壩：卡斯特隆',
    line: '工廠的燈亮了。下游的三座城鎮，沒有撐過那個冬天。',
  }),
  x_c2_aetheric: post(c2Aetheric, { title: '主壩：艾瑟立克', line: '研究所的燈亮了。下游的河道，乾了。' }),
  x_c4_pre: pre(c4Pre, 'pre_c4'),
  x_c4_veerwell: post(c4Veerwell, {
    title: '發射設施：維爾威',
    line: '人類回到了天空。外圍的聚落，回不來了。',
  }),
  x_c4_sancta: post(c4Sancta, { title: '發射設施：聖域', line: '門守住了。可是維爾威，沒有走遠。' }),
  x_c6_pre: pre(c6Pre, 'pre_c6'),
  x_c6_open: post(c6Open, { title: '軌道站：交出', line: '站交出去了。這一次，按下按鈕的是別人。' }),
  x_c6_seal: post(c6Seal, { title: '軌道站：墜落', line: '站墜落了。天空，安靜了下來。' }),
  x_c6_beyond: post(c6Beyond, { title: '第三扇門', line: '第三扇門，打開了。' }),
});

// 過場改版第 10 期：ECHO 的記憶片段 m1～m8 與真結局 e_beyond（方案 E 的雙色調 2D 短片，data/cine/memory.js）
for (let k = 1; k <= 8; k++) CINES['m' + k] = () => memoryCine(k);
CINES.e_beyond = (ctx) => trueEndCine(ctx);
