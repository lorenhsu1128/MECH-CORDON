// 各章開場與章末的對話分格（過場改版第 5～8 期，docs/cine-redesign-design.md）：委託方與 ECHO（或兩位委託方）面對面，
// 照第五節的組合（開場＝B 的「委託方與 ECHO 的對話分格」、章末＝C「對話分格講人物之間的關係」）。
// film.js 的 talk 段落（chfilm.js 的各章、選前的對峙 pre_<抉擇>）用 talkShot 產生畫面。
// 台詞的表情在 data/line-expr.js，語音照語音 v2 產生（voice-lines.js 會收集過場的字幕）。
import { lineExpr } from '../line-expr.js';
import { lineDur } from './kit.js';

// 委託方的場景插畫（第 2 期的 scripts/cine-art.js；沒有圖時畫程式插畫）與顏色
const PLACE = {
  castron: { img: 'c1/c1_office', art: 'office' },
  aetheric: { img: 'cm/m_lab', fill: '#0a1a2c' },
  veerwell: { img: 'cm/m_dispatch', fill: '#0c1c14' },
  sancta: { img: 'cm/m_shelter', fill: '#1c160c' },
  echo: { fill: '#0a1824' },
  echo_true: { fill: '#1c1410' },
};
// 3/4 側的姿勢（全部表情都有）：l＝面向左（站在右邊）、r＝面向右（站在左邊）
const Q3 = {
  echo: { l: 'p3', r: 'p5' },
  echo_true: { l: 'p4', r: 'p5' },
  // 諾拉的 p3／p4 產生時朝向和名稱相反（p4 實際面向左）
  sancta: { l: 'p4', r: 'p3' },
};
const q3 = (who, side) => (Q3[who] || { l: 'p3', r: 'p4' })[side];

// o：{ L: 左邊的人, R: 右邊的人, lines: [[說話者, 台詞, { pose, act }?]], cycle }；回傳 [鏡頭, 秒數]
// 說話者 'echo' 在第 3 周目畫成 echo_true（私人頻道的樣子）
export function talkShot(o) {
  const look = (who) => (who === 'echo' && o.cycle >= 3 ? 'echo_true' : who);
  const Lw = look(o.L),
    Rw = look(o.R);
  let t = 0.9;
  const ev = [];
  const sL = [],
    sR = [];
  let rIn = null;
  for (const [sp, text, x = {}] of o.lines) {
    const d = lineDur(text) + 0.2;
    const isL = sp === o.L;
    const e = lineExpr(text, { sp }).e || 'neutral';
    if (!isL && rIn == null) rIn = Math.max(0.3, t - 0.5);
    const me = isL ? sL : sR,
      other = isL ? sR : sL;
    me.push({ t, dim: 0, expr: e, pose: x.pose || q3(isL ? Lw : Rw, isL ? 'r' : 'l'), act: x.act });
    other.push({ t, dim: 0.45 });
    ev.push({ t, sub: text, who: sp, dur: d });
    t += d + 0.35;
  }
  const dur = t + 0.9;
  const PL = PLACE[Lw] || PLACE.castron,
    PR = PLACE[Rw] || PLACE.echo;
  const actor = (who, sp, x, side, s) => ({
    k: 'actor',
    who,
    sp,
    pose: q3(who, side),
    at: [x, 1240],
    h: 1180,
    in: 'fade',
    bub: [side === 'r' ? 330 : -320, -120],
    bubW: 500,
    s,
  });
  const st = {
    bg: '#080808',
    els: [
      {
        k: 'panel',
        q: [0, 0, 1600, 900],
        bd: 0,
        img: PL.img,
        art: PL.art,
        fill: PL.fill || '#101010',
        kb: [
          { t: 0, z: 1.04 },
          { t: dur, z: 1.1, x: -20 },
        ],
        dots: 0.12,
        vig: 0.45,
        kids: [actor(Lw, o.L, rIn == null ? 640 : 470, 'r', sL)],
      },
      ...(rIn == null
        ? []
        : [
            {
              k: 'panel',
              q: [
                [1010, -20],
                [1640, -20],
                [1640, 920],
                [870, 920],
              ],
              t0: rIn,
              in: 'right',
              img: PR.img,
              fill: PR.fill || '#0a1824',
              dots: 0.3,
              vig: 0.35,
              kids: [
                ...(PR.img
                  ? []
                  : [
                      {
                        k: 'lines',
                        kind: 'speed',
                        q: [870, 0, 770, 900],
                        color: 'rgba(127,200,255,0.12)',
                        n: 30,
                        t0: rIn,
                      },
                    ]),
                { ...actor(Rw, o.R, 1300, 'l', sR), t0: rIn },
              ],
            },
          ]),
    ],
  };
  return [
    {
      set: o.set || { k: 'black' }, // 抉擇的選前在目前的戰場上播：set＝live（舞台蓋住整個畫面）
      lb: false,
      fi: 0.5,
      fo: 0.45,
      st,
      ev: [{ t: 0.15, sfx: 'glitch', vol: 0.25, rate: 0.9 }, ...ev],
    },
    dur,
  ];
}

// 每一段的對話（鍵＝chapters.js 的 `${kind}_${章}`）；choice＝依抉擇換人（c2／c4 的選項 → 劇本）
export const TALKS = {
  outro_1: {
    L: 'castron',
    R: 'echo',
    lines: [
      ['castron', '天線核心收到了。報酬已經匯過去，一毛不少。'],
      ['echo', '付得這麼爽快，代表這東西比合約上寫的值錢。'],
      ['castron', '……合約就是合約。值多少，不是傭兵該問的。'],
      ['castron', '下一份工作在工業帶。到時候再聯絡。'],
    ],
  },
  intro_2: {
    L: 'aetheric',
    R: 'echo',
    lines: [
      ['aetheric', '初次見面，傭兵。我是艾瑟立克的薩奇。你在荒野的戰鬥紀錄，非常有意思。'],
      ['echo', '她說的「有意思」，意思是「想拿去研究」。'],
      ['aetheric', '我們需要主壩的電力。卡斯特隆也一樣——所以，我們出更高的價。'],
      ['aetheric', '你的每一個選擇，我都會好好記錄下來。'],
    ],
  },
  outro_2: {
    choice: 'c2',
    castron: {
      L: 'castron',
      R: 'echo',
      lines: [
        ['castron', '工廠的燈亮了。你守了約，卡斯特隆也會守。'],
        ['echo', '下游的閘門沒開。三座城鎮的人正在往西走。'],
        ['castron', '……那不在合約裡。'],
      ],
    },
    aetheric: {
      L: 'aetheric',
      R: 'echo',
      lines: [
        ['aetheric', '主壩的電力，夠我們解開核心了。你的選擇，完全符合預測。'],
        ['echo', '預測裡有沒有寫，下游的河會乾掉？'],
        ['aetheric', '有。……那是必要的成本。'],
      ],
    },
  },
  intro_3: {
    L: 'sancta',
    R: 'echo',
    lines: [
      ['sancta', '我是聖域的諾拉。……我知道你是誰。'],
      ['sancta', '冰原營地的那些人，是從工業帶逃出來的。讓他們走進冰原的，是你。'],
      ['echo', '那你為什麼還找我們？'],
      ['sancta', '因為在這片冰原上，沒有別人能去。……我會記下來，你救了幾個人。'],
    ],
  },
  outro_3: {
    L: 'veerwell',
    R: 'echo',
    lines: [
      ['veerwell', '嘿，傭兵！軌道站的座標，四家同時收到。時間就是錢，我們先飛了！'],
      ['echo', '卡斯特隆和艾瑟立克，一點反應都沒有。'],
      ['veerwell', '那不是很好嗎？少兩個搶生意的。'],
      ['echo', '……或是，他們早就知道了。'],
    ],
  },
  intro_4: {
    L: 'veerwell',
    R: 'echo',
    lines: [
      ['veerwell', '歡迎來到北部！構造體、宇宙港，這顆星球唯一能上天的路。'],
      ['veerwell', '誰控制這條路，誰就控制一切。所以——我們要它。'],
      ['echo', '聖域的難民，就住在宇宙港旁邊。'],
      ['veerwell', '所以要快呀。時間就是錢，傭兵。'],
    ],
  },
  outro_4: {
    choice: 'c4',
    veerwell: {
      L: 'veerwell',
      R: 'echo',
      lines: [
        ['veerwell', '發射設施拿下了！記者會的稿子，我都寫好了。'],
        ['echo', '外圍的聚落燒掉了。聖域的人還在灰裡找名字。'],
        ['veerwell', '……人類要回到天空，總得付點代價嘛。'],
      ],
    },
    sancta: {
      L: 'sancta',
      R: 'echo',
      lines: [
        ['sancta', '門守住了。……謝謝你。'],
        ['sancta', '維爾威的運輸機往東岸飛了。他們還沒放棄。'],
        ['echo', '她第一次向傭兵道謝。記下來吧。'],
      ],
    },
  },
  intro_5: {
    L: 'castron',
    R: 'echo',
    lines: [
      ['castron', '東岸的洋上都市。卡斯特隆要在那裡插旗，你就是旗桿。'],
      ['echo', '上一封私人信裡，你叫傭兵別回應「上面」。'],
      ['castron', '……我說過那種話？忘了吧。'],
      ['castron', '合約就是合約。上陸吧。'],
    ],
  },
  outro_5: {
    L: 'aetheric',
    R: 'echo',
    lines: [
      ['aetheric', '四家終於談好了。很少見，對吧？'],
      ['aetheric', '我們出技術，送你到中樞。你是最合適的人選。'],
      ['echo', '最合適？……你們從一開始就知道是他。'],
      ['aetheric', '有意思。你的管制官，比紀錄上更敏銳。'],
    ],
  },
  intro_6: {
    L: 'sancta',
    R: 'echo',
    lines: [
      ['sancta', '他們都說你最強、最合適、最紅。'],
      ['sancta', '我只想問一件事：上去之後，你還會回來嗎？'],
      ['echo', '……我會把他帶回來。'],
      ['sancta', '那我會記下來。這是你說的。'],
    ],
  },
  outro_6: {
    L: 'castron',
    R: 'echo',
    lines: [
      ['echo', '中樞是空的。認證終端，在方舟。'],
      ['echo', '霍斯特。你知道方舟，對吧？'],
      ['castron', '……先回來吧，傭兵。這件事，我不想用通訊說。'],
    ],
  },
  intro_7: {
    L: 'castron',
    R: 'echo',
    lines: [
      ['castron', '我有話要說。……不是用合約說。'],
      ['castron', '方舟上存著簽署者的記憶。我父親……也在那艘船上。'],
      ['echo', '所以你一直都知道。'],
      ['castron', '知道，但不敢說。這一次，我付的不是報酬，是道歉。'],
    ],
  },
  outro_7: {
    L: 'veerwell',
    R: 'sancta',
    lines: [
      ['veerwell', '船開走了！我的船票呢？！'],
      ['sancta', '……我們沒能攔住它。'],
      ['veerwell', '名冊、記憶、按鈕……那些人到底把我們當成什麼？'],
      ['sancta', '可是，傭兵還能上去。……這一次，我們一起送他。'],
    ],
  },
  intro_8: {
    L: 'sancta',
    R: 'echo',
    lines: [
      ['sancta', '甲板比荒野還寬。它不打仗，只是一直往前走。'],
      ['sancta', '我只是想知道，它要把我們帶去哪裡。'],
      ['echo', '傭兵，心臟在船的最深處。'],
      ['echo', '最後一段路了。照你的節奏來。'],
    ],
  },
  // 第 9 期：抉擇的選前＝兩邊的委託方左右對峙（在目前的戰場上播，舞台蓋住整個畫面），之後接原本的倒數演出
  pre_c2: {
    set: { k: 'live' },
    L: 'castron',
    R: 'aetheric',
    lines: [
      ['castron', '主壩的舊合約在卡斯特隆手上。傭兵，你知道該往哪走。'],
      ['aetheric', '合約只是紙。主壩的電力，才是解開核心的鑰匙。'],
      ['castron', '工業帶的工廠在等。……合約就是合約。'],
      ['aetheric', '選吧。我會好好記錄下來。'],
    ],
  },
  pre_c4: {
    set: { k: 'live' },
    L: 'veerwell',
    R: 'sancta',
    lines: [
      ['veerwell', '發射設施交給維爾威，人類就能回到天空！'],
      ['sancta', '那扇門後面，住著從冰原逃來的人。'],
      ['veerwell', '感人歸感人，時間就是錢，傭兵。'],
      ['sancta', '……我會記下來，你選了哪一邊。'],
    ],
  },
  pre_c6: {
    set: { k: 'live' },
    L: 'castron',
    R: 'zenith',
    lines: [
      ['castron', '把站交給四家，至少大家還能活下去。……這是我最後一次求你。'],
      ['zenith', '不要交出去。上一個週期，我就是在這裡停下來的。'],
      ['castron', '……最後要怎麼做，你自己決定吧，傭兵。'],
    ],
  },
};
