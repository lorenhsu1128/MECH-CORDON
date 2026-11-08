// 宿敵（主線擴充 D2，docs/campaign-expansion-design.md）：擊倒玩家的敵對 AC、精英、帶詞綴的敵人會被記住，
// 之後升級、換更好的零件、對玩家常用的武器加抗性，在之後的出擊闖進來。存在 save.story.nemesis（最多 NEM.MAX 個）。
// Game 端在 game/nemesis.js。台詞用模板（{名}、{地}、{次}），講話的是說話者 enemy、名字換成宿敵的。

export const NEM = {
  MAX: 3, // 同時記住幾個
  LV_MAX: 5,
  HP_K: 0.15, // 每升一級的 AP 倍率
  DMG_K: 0.1,
  RES_K: 0.08, // 每升一級，對玩家常用的武器屬性的抗性（最多 RES_MAX）
  RES_MAX: 0.3,
  CHANCE: 0.14, // 一般區段闖進來的機率（一次出擊最多一次）
  DELAY: [18, 40], // 區段開始後幾秒闖進來
  BOUNTY: [8000, 4000], // 擊破的獎金：a＋b×等級
  RETIRE: 2, // 被玩家擊破幾次退場
};
// 雜兵升格成宿敵時的稱號（依擊倒玩家的方式）
export const NEM_TITLES = ['灰燼', '斷刃', '鐵鏽', '無聲', '餓狼', '殘響', '黑潮', '碎骨', '夜鴉', '寒鋼'];
export const NEM_CALLS = ['ASH', 'EDGE', 'RUST', 'MUTE', 'WOLF', 'ECHO', 'TIDE', 'BONE', 'CROW', 'STEEL'];
// 台詞的模板
export const NEM_LINES = {
  born: ['RAVEN，記住這個名字——{名}。', '原來傳說中的傭兵也不過如此。', '這一仗我會一直記得。你也是。'],
  back: [
    '又見面了，RAVEN。上次在{地}，你可沒這麼難纏。',
    '找到你了。這次別讓我太快結束。',
    '{次}次了。你還沒學乖嗎？',
    '我為了你換了新的零件。好好看著。',
  ],
  win: ['又倒下了？無聊。', '你的打法我已經看穿了。', '下次再來吧——如果你還有下次。'],
  down: ['……這次算你贏。', '不可能……我記住你了。', '哈……總算有點意思了。'],
  retire: ['夠了……這個戰場不需要我了。', '你贏了，RAVEN。徹底地。'],
};
export const fill = (t, o) =>
  t
    .replace(/\{名\}/g, o.name)
    .replace(/\{地\}/g, o.place || '那裡')
    .replace(/\{次\}/g, String(o.n || 1));
