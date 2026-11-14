// 抉擇的選後＝代價的漫畫蒙太奇（過場改版第 9 期重做，docs/cine-redesign-design.md 第五節「抉擇（選後）A」）：
// 整段是漫畫頁（舊的分割畫面／倒數長鏡頭／錄影帶的演出已經拿掉）。每頁 2～4 格，格子是場景插畫
// （第 2 期的流程，src/assets/cine-art/cx/），一格一句（旁白＝narr 的語音、角色＝立繪＋氣泡），
// 格子照配樂的拍點落下，整頁的鏡頭推到正在說話的那一格；最後是黑底的大字卡。台詞沿用原本的（語音已經有）。
import { film } from './film.js';

// o：{ key, music: [曲名, 開始秒], color 主色, pages: [[格…]…], card: [大字, 小字] }（格的寫法見 film.js 的 page）
const montage = (o) =>
  film({
    key: o.key,
    title: o.card[0],
    music: o.music,
    blocks: [...o.pages.map((p) => ({ page: p })), { card: o.card, color: o.color }],
  });

const N = (t) => [null, t];
const CAST_C = '#d8903a',
  AETH_C = '#5ab8ff',
  VEER_C = '#9be070',
  SANC_C = '#e0d070';

// 抉擇 1：主壩交給卡斯特隆
export const c2CastronPost = () =>
  montage({
    key: 'x2c',
    music: ['cine_c2', 30],
    color: CAST_C,
    card: ['你守住了合約。', 'CONTRACT FULFILLED'],
    pages: [
      [
        { img: 'cx/x2_gate', line: N('閘門，一道一道關上。'), sfx: '轟' },
        { img: 'cx/x2_dry', line: N('下游的河道，開始乾涸。') },
        { img: 'cx/x2_lights', line: N('工業帶的燈，一盞一盞亮起。') },
      ],
      [
        {
          img: 'cx/x2_feast',
          focus: [0.5, 0.35],
          line: N('工廠的燈亮了。霍斯特在慶功宴上說：「這個傭兵守約。」'),
        },
        { img: 'cx/x2_dry', tone: '#8090a0', line: N('下游的閘門一直沒開。那個冬天，三座城鎮撐不下去。') },
        { img: 'cx/x2_refugees', line: N('數千人背著行李往西走，走進冰原。') },
      ],
    ],
  });
// 抉擇 1：主壩交給艾瑟立克（背叛卡斯特隆）
export const c2AethericPost = () =>
  montage({
    key: 'x2a',
    music: ['cine_c2', 30],
    color: AETH_C,
    card: ['你背叛了委託方。', 'CONTRACT BROKEN'],
    pages: [
      [
        { img: 'cx/x2_cooling', line: N('主壩的電力，轉向研究機構。') },
        { img: 'cx/x2_dry', line: N('水庫變成冷卻槽，下游的河道乾了。') },
        {
          img: 'cx/x2_sakki',
          focus: [0.3, 0.4],
          line: N('研究所的燈亮了。薩奇在報告上寫：「樣本的選擇符合預測。」'),
        },
      ],
      [
        { img: 'cx/x2_wanted', line: N('卡斯特隆的懸賞令，貼滿了工業帶。') },
        {
          fill: '#1a0c04',
          dots: 0.45,
          actor: { who: 'stevedore', pose: 'p1', expr: 'angry' },
          line: ['stevedore', '叛徒。我會親手把你拆了。'],
          sfx: '！',
        },
        { img: 'cx/x2_refugees', line: N('數千人背著行李往西走，走進冰原。') },
      ],
    ],
  });
// 抉擇 2：發射設施交給維爾威
export const c4VeerwellPost = () =>
  montage({
    key: 'x4v',
    music: ['cine_c4', 20],
    color: VEER_C,
    card: ['人類回到了天空。', 'LAUNCH AUTHORIZED'],
    pages: [
      [
        {
          img: 'cx/x4_press',
          focus: [0.5, 0.35],
          line: N('發射設施的燈亮了。派克在記者會上說：「人類重新回到了天空。」'),
        },
        { img: 'cx/x4_launch', line: N('外圍的聚落，被尾焰掃過。'), sfx: '轟' },
      ],
      [
        { img: 'cx/x4_ash', line: N('聖域的人，在灰裡找名字。') },
        { fill: '#0c0c0c', dots: 0.4, tone: '#c0b890', actor: { who: 'sancta', pose: 'p6' } },
      ],
    ],
  });
// 抉擇 2：發射設施交給聖域
export const c4SanctaPost = () =>
  montage({
    key: 'x4s',
    music: ['cine_c4', 20],
    color: SANC_C,
    card: ['發射台沉默了。', 'LAUNCH SEALED'],
    pages: [
      [
        { img: 'cx/x4_gate', line: N('發射設施的大門，關上了。'), sfx: '鏗' },
        { img: 'cm/m_shelter', line: N('發射設施被封了起來，聖域的人輪流守著門。') },
        {
          fill: '#1c160c',
          dots: 0.35,
          actor: { who: 'sancta', pose: 'p9' },
          line: ['sancta', '……謝謝你。我不知道該怎麼……謝謝你。'],
        },
      ],
      [
        { img: 'cx/x4_planes', line: N('維爾威的運輸機，一架一架往東飛。') },
        { fill: '#0c1c14', dots: 0.4, actor: { who: 'veerwell', pose: 'p7' } },
      ],
    ],
  });
// 最後的抉擇：交出軌道站
export const c6OpenPost = () =>
  montage({
    key: 'x6o',
    music: ['cine_c6', 40],
    color: '#e8eef4',
    card: ['這顆星球有一段訊號。', 'PROTOCOL EXECUTED'],
    pages: [
      [
        { img: 'cx/x6_core', line: N('四家代表，走進中樞。') },
        { img: 'cm/m_button', tone: '#c04030', line: ['station', '認證完成。KEY-07。封鎖線協定，執行。'] },
        { img: 'cx/x6_signal', sfx: '——' },
      ],
    ],
  });
// 最後的抉擇：讓軌道站墜落
export const c6SealPost = () =>
  montage({
    key: 'x6s',
    music: ['cine_c6', 40],
    color: '#ffb070',
    card: ['天空，安靜了。', 'SILENT SKY'],
    pages: [
      [
        { img: 'cm/m_station', line: N('你切斷了站的姿態控制。') },
        { img: 'cx/x6_fall', line: N('軌道站拖著長長的火光，往雲海落下去。'), sfx: '轟' },
      ],
      [
        {
          fill: '#1c160c',
          dots: 0.35,
          actor: { who: 'sancta', pose: 'p9' },
          line: ['sancta', '……謝謝你。結束了。終於結束了。'],
        },
        { img: 'cx/x6_signal', tone: '#c04030', line: ['station', '封鎖線協定，強制執行。'] },
        { img: 'cx/x6_sky' },
      ],
    ],
  });
// 最後的抉擇：第三扇門（真結局）。四家的頻道一格一格斷訊，ECHO 說「我們走吧」，站離開
export const c6BeyondPost = () =>
  montage({
    key: 'x6b',
    music: ['cine_c6', 40],
    color: '#ffd7a0',
    card: ['這一次，照我們的節奏來。', 'BEYOND'],
    pages: [
      [
        {
          img: 'c1/c1_office',
          dots: 0.4,
          actor: { who: 'castron', pose: 'p6' },
          line: ['castron', '傭兵，等等——'],
          out: true,
        },
        {
          img: 'cm/m_lab',
          dots: 0.4,
          actor: { who: 'aetheric', pose: 'p9' },
          line: ['aetheric', 'R-07，你沒有權限——'],
          out: true,
        },
        {
          img: 'cm/m_dispatch',
          dots: 0.4,
          actor: { who: 'veerwell', pose: 'p8' },
          line: ['veerwell', '喂，你要把它開去哪——'],
          out: true,
        },
        {
          img: 'cm/m_shelter',
          dots: 0.4,
          actor: { who: 'sancta', pose: 'p9' },
          line: ['sancta', '……去吧。我會記下你的名字。'],
          out: true,
        },
      ],
      [
        {
          fill: '#140c08',
          dots: 0.35,
          actor: { who: 'echo_true', sp: 'echo', pose: 'p8' },
          line: ['echo', '我們走吧。'],
        },
        { img: 'cx/x6_thrust', line: N('軌道站的推進器，一個接一個亮起。') },
        { img: 'cm/m_station', line: N('星球在背後，慢慢變小。') },
      ],
    ],
  });
