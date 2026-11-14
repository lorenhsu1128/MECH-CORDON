// 過場的組件（過場改版的新格式，docs/cine-redesign-design.md 第五節；第 1 章開場以外的過場都用它重製）：
// 一段過場＝依序的「段落」：
//   page   漫畫頁（2～4 格，格子是場景插畫或立繪，一格一句，照拍點落下，頁面鏡頭跟著說話的格子）
//   still  整張的固定插畫（單色、網點、慢慢推近），配幾句旁白
//   talk   對話分格（talks.js 的 talkShot）
//   echo   ECHO 的通訊（右邊是 ECHO 的立繪，第 3 周目是 echo_true；台詞是氣泡）
//   rival  宿敵登場（PV 式：斜切的色塊、宿敵的立繪、名牌大字；第五節「宿敵登場用 D 的名牌大字」）
//   title  PV 式的章名卡（委託方的色塊與黑色斜線、插畫的剪影、CHAPTER n／章名）
//   card   黑底的大字卡（選後的結尾）
//   live   照原樣放一個 3D 鏡頭（抉擇的選前：目前的戰場上的出口與倒數）
// 台詞：[說話者（null＝旁白，narr 的語音）, 字]；格子落下與章名蓋章都對齊配樂（beats.js）。
import { snapBeat } from './beats.js';
import { lineDur, parseLine } from './kit.js';
import { talkShot } from './talks.js';

// 一句的秒數：照語音的長度估（一秒約 4 個字）
export const say = (t) =>
  Math.max(lineDur(t), 0.8 + t.replace(/[，。、！？…「」—\s：]/g, '').length / 4) + 0.5;
// 「名字：「…」」→ [說話者, 字]；其他＝旁白
export const L = (line) => {
  const p = parseLine(line);
  // 認不出說話者（「霍斯特在慶功宴上說：「…」」這種敘述）＝整句當旁白
  return p.who ? [p.who, p.text] : [null, line];
};

const LAYOUT = {
  1: [
    [
      [60, 60],
      [1540, 60],
      [1540, 840],
      [60, 840],
    ],
  ],
  2: [
    [
      [40, 40],
      [1560, 40],
      [1560, 430],
      [40, 470],
    ],
    [
      [40, 500],
      [1560, 460],
      [1560, 860],
      [40, 860],
    ],
  ],
  3: [
    [
      [40, 40],
      [1020, 40],
      [960, 420],
      [40, 420],
    ],
    [
      [1050, 40],
      [1560, 40],
      [1560, 860],
      [921, 860],
    ],
    [
      [40, 450],
      [955, 450],
      [891, 860],
      [40, 860],
    ],
  ],
  4: [
    [
      [40, 40],
      [790, 40],
      [770, 440],
      [40, 440],
    ],
    [
      [820, 40],
      [1560, 40],
      [1560, 440],
      [800, 440],
    ],
    [
      [40, 470],
      [765, 470],
      [745, 860],
      [40, 860],
    ],
    [
      [795, 470],
      [1560, 470],
      [1560, 860],
      [775, 860],
    ],
  ],
};
const center = (q) => [
  q.reduce((a, p) => a + p[0], 0) / q.length,
  q.reduce((a, p) => a + p[1], 0) / q.length,
];

// ---------- 段落 → [鏡頭, 秒數] ----------
// 漫畫頁。格：{ img, art, fill, focus, tone, dots, line: [說話者, 字], actor: { who, sp, pose, expr }, sfx, out }
function pageShot(cells, ctx) {
  const { at, beat, key } = ctx;
  const Q = LAYOUT[cells.length] || LAYOUT[3];
  const els = [],
    ev = [],
    keys = [];
  let t = 0.3;
  cells.forEach((c, i) => {
    const t0 = +(beat(at + t) - at).toFixed(3);
    const q = Q[i];
    const [cx, cy] = center(q);
    const dur = c.line ? say(c.line[1]) : c.hold || 1.6;
    const zz = cells.length >= 4 ? 1.45 : cells.length === 1 ? 1.04 : 1.3;
    keys.push({ t: t0 + 0.3, x: cx, y: cy, z: zz }, { t: t0 + dur + 0.05, x: cx, y: cy, z: zz + 0.03 });
    const kids = [];
    const top = Math.min(...q.map((p) => p[1])),
      ph = Math.max(...q.map((p) => p[1])) - top;
    const ah = ph * (c.actor && c.actor.h ? c.actor.h : 1.9);
    if (c.actor)
      kids.push({
        k: 'actor',
        who: c.actor.who,
        sp: c.actor.sp,
        pose: c.actor.pose,
        expr: c.actor.expr,
        tone: c.actor.tone,
        dim: c.actor.dim,
        at: [cx + (c.actor.dx || 0), top + ph * 0.03 + ah],
        h: ah,
        t0,
        in: 'fade',
        bub: [cx < 800 ? 260 : -260, -60],
        bubW: 420,
        noBub: !c.line || c.line[0] !== (c.actor.sp || c.actor.who),
      });
    if (c.out)
      kids.push({ k: 'block', q, color: '#050505', t0: t0 + dur - 0.1, in: 'fade', ind: 0.35, a: 0.92 });
    els.push({
      k: 'panel',
      id: `p${i}`,
      q,
      t0,
      in: i % 2 ? 'drop' : 'stamp',
      rot0: i % 2 ? -0.04 : 0.04,
      img: c.img,
      art: c.art,
      fill: c.fill || '#141414',
      focus: c.focus,
      kb: [
        { t: t0, z: 1.02 },
        { t: t0 + 14, z: 1.14 },
      ],
      tone: c.tone,
      dots: c.dots ?? 0.28,
      vig: 0.45,
      kids,
    });
    if (c.sfx)
      els.push({
        k: 'text',
        s: c.sfx,
        at: [cx + 60, cy - 40],
        size: 170,
        color: '#ffe6b0',
        stroke: '#1a0800',
        rot: -0.1,
        t0: t0 + 0.25,
        t1: t0 + dur,
        in: 'stamp',
      });
    ev.push({ t: t0 + 0.05, sfx: i % 2 ? 'thud2' : 'thud1', vol: 0.5, rate: 0.7 });
    if (c.line) ev.push({ t: t0 + 0.35, sub: c.line[1], who: c.line[0], dur: dur - 0.3 });
    t = t0 + dur;
  });
  keys.push({ t: t + 0.2, x: 800, y: 450, z: 1 }, { t: t + 1.4, x: 800, y: 450, z: 0.97 });
  return [
    { set: { k: 'black' }, lb: false, fi: 0.25, st: { page: key, bg: '#0c0c0c', pg: { keys }, els }, ev },
    t + 1.6,
  ];
}
// 整張的插畫＋幾句旁白
function stillShot(b) {
  let t = 0.6;
  const ev = [];
  for (const [who, s] of b.lines || []) {
    const d = say(s);
    ev.push({ t, sub: s, who, dur: d - 0.2 });
    t += d + 0.2;
  }
  const dur = Math.max(b.min || 4, t + 0.6);
  return [
    {
      set: { k: 'black' },
      lb: false,
      fi: 0.8,
      fo: 0.4,
      st: {
        bg: '#000',
        els: [
          {
            k: 'panel',
            q: [0, 0, 1600, 900],
            bd: 0,
            img: b.img,
            art: b.art,
            fill: b.fill || '#101010',
            focus: b.focus,
            tone: b.tone,
            dots: b.dots ?? 0.3,
            dotSz: 7,
            vig: 0.7,
            kb: [
              { t: 0, z: 1.02 },
              { t: dur, z: 1.14 },
            ],
          },
          ...(b.loc
            ? [
                { k: 'block', q: [40, 60, 8, 74], color: b.color || '#fff', t0: 0.4, in: 'fade' },
                {
                  k: 'text',
                  s: b.loc[0],
                  at: [66, 84],
                  size: 40,
                  al: 'left',
                  color: '#f4ece0',
                  stroke: '#000',
                  sw: 6,
                  t0: 0.5,
                  in: 'left',
                  ls: 6,
                },
                {
                  k: 'text',
                  s: b.loc[1],
                  at: [68, 122],
                  size: 18,
                  font: 'mono',
                  al: 'left',
                  color: b.color || '#ccc',
                  stroke: null,
                  t0: 0.8,
                  in: 'fade',
                  ls: 8,
                },
              ]
            : []),
        ],
      },
      ev,
    },
    dur,
  ];
}
// ECHO 的通訊：背景插畫（暗）＋右邊的 ECHO＋氣泡
function echoShot(b, cyc) {
  const who = cyc >= 3 ? 'echo_true' : 'echo';
  let t = 0.8;
  const ev = [],
    s = [];
  for (const [, text] of b.lines) {
    const d = say(text);
    ev.push({ t, sub: text, who: 'echo', dur: d - 0.2 });
    s.push({ t, pose: b.poses ? b.poses[s.length % b.poses.length] : undefined });
    t += d + 0.3;
  }
  const dur = t + 0.8;
  return [
    {
      set: { k: 'black' },
      lb: false,
      fi: 0.5,
      fo: 0.5,
      st: {
        bg: '#05080c',
        els: [
          {
            k: 'panel',
            q: [0, 0, 1600, 900],
            bd: 0,
            img: b.img,
            art: b.art,
            fill: '#06101a',
            tone: b.tone,
            dots: 0.35,
            vig: 0.85,
            a: 0.55,
          },
          { k: 'lines', kind: 'speed', q: [800, 0, 800, 900], color: 'rgba(127,200,255,0.10)', n: 26 },
          {
            k: 'actor',
            who,
            sp: 'echo',
            pose: who === 'echo_true' ? 'p3' : 'p2',
            expr: b.expr,
            at: [1180, 1200],
            h: 1150,
            in: 'fade',
            ind: 0.5,
            bub: [-420, -60],
            bubW: 520,
            s,
          },
        ],
      },
      ev: [{ t: 0.2, sfx: 'glitch', vol: 0.25, rate: 0.9 }, ...ev],
    },
    dur,
  ];
}
// 宿敵登場（PV）：斜切的色塊＋宿敵的立繪＋名牌
function rivalShot(b, ctx) {
  const t0 = +(ctx.beat(ctx.at + 0.2) - ctx.at).toFixed(3);
  return [
    {
      set: { k: 'black' },
      lb: false,
      fi: 0.15,
      fo: 0.3,
      st: {
        bg: '#0a0a0a',
        els: [
          {
            k: 'block',
            q: [
              [0, 0],
              [1050, 0],
              [870, 900],
              [0, 900],
            ],
            color: b.color,
            in: 'wipe',
            ind: 0.25,
            t0,
          },
          { k: 'lines', kind: 'focus', q: [0, 0, 1600, 900], color: 'rgba(0,0,0,0.5)', r: 0.3, n: 80, t0 },
          {
            k: 'actor',
            who: b.who,
            pose: b.pose || 'p1',
            at: [560, 1180],
            h: 1250,
            t0: t0 + 0.1,
            in: 'left',
            ind: 0.3,
            noBub: true,
          },
          {
            k: 'text',
            s: 'RIVAL',
            at: [1120, 330],
            size: 30,
            font: 'mono',
            al: 'left',
            color: b.color,
            stroke: null,
            t0: t0 + 0.3,
            in: 'fade',
            ls: 16,
          },
          {
            k: 'text',
            s: b.name,
            at: [1110, 430],
            size: Math.min(120, Math.round(440 / (b.name.length * 0.8))), // 名字長的縮小，不超出畫面
            font: 'title',
            al: 'left',
            color: '#f4ece0',
            stroke: '#000',
            sw: 10,
            t0: t0 + 0.45,
            in: 'stamp',
            ls: 6,
          },
          {
            k: 'text',
            s: b.tag,
            at: [1116, 520],
            size: 30,
            al: 'left',
            color: '#f4ece0',
            stroke: null,
            t0: t0 + 0.8,
            in: 'fade',
            ls: 4,
          },
        ],
      },
      ev: [
        { t: t0, sfx: 'heavy', vol: 0.9, rate: 0.55 },
        { t: t0 + 0.45, sfx: 'thud1', vol: 0.8, rate: 0.6 },
        ...(b.line ? [{ t: t0 + 1.0, sub: b.line, who: b.who, dur: say(b.line) }] : []),
      ],
    },
    Math.max(3.8, b.line ? t0 + 1.2 + say(b.line) : 0),
  ];
}
// PV 式的章名卡
function titleShot(b, ctx) {
  const t0 = +(ctx.beat(ctx.at + 0.5) - ctx.at).toFixed(3);
  return [
    {
      set: { k: 'black' },
      lb: false,
      fo: 1,
      st: {
        bg: b.color,
        els: [
          {
            k: 'panel',
            q: [0, 0, 1600, 900],
            bd: 0,
            img: b.img,
            fill: b.color,
            gco: 'multiply',
            flt: 'grayscale(1) contrast(1.6) brightness(0.9)',
            a: 0.85,
          },
          {
            k: 'block',
            q: [
              [0, 640],
              [1600, 520],
              [1600, 900],
              [0, 900],
            ],
            color: '#0a0a0a',
            in: 'wipe',
            ind: 0.35,
            t0: 0.2,
          },
          {
            k: 'text',
            s: b.en || '',
            at: [1530, 600],
            size: 36,
            font: 'mono',
            al: 'right',
            color: b.color,
            stroke: null,
            t0: 0.5,
            in: 'fade',
            ls: 10,
          },
          {
            k: 'text',
            s: `CHAPTER ${b.ch}`,
            at: [140, 690],
            size: 54,
            font: 'title',
            al: 'left',
            color: '#f4ece0',
            stroke: null,
            t0: t0 - 0.25,
            in: 'left',
            ls: 12,
          },
          {
            k: 'text',
            s: b.name,
            at: [130, 790],
            size: 120,
            al: 'left',
            color: '#f4ece0',
            stroke: null,
            t0,
            in: 'stamp',
            ls: 16,
          },
        ],
      },
      ev: [
        { t: 0.2, sfx: 'heavy', vol: 0.8, rate: 0.45 },
        { t: t0, sfx: 'thud1', vol: 0.8, rate: 0.6 },
        ...(b.line ? [{ t: t0 + 0.8, sub: b.line[1], who: b.line[0], dur: say(b.line[1]) }] : []),
      ],
    },
    Math.max(4.6, b.line ? t0 + 1.2 + say(b.line[1]) : 0),
  ];
}
// 黑底的大字卡
function cardShot(b) {
  return [
    {
      set: { k: 'black' },
      lb: false,
      fo: 1.2,
      st: {
        bg: '#050505',
        els: [
          { k: 'block', q: [0, 418, 1600, 6], color: b.color, in: 'wipe', ind: 0.4, t0: 0.2 },
          {
            k: 'text',
            s: b.card[0],
            at: [800, 380],
            size: 76,
            color: '#f4ece0',
            stroke: null,
            t0: 0.5,
            in: 'stamp',
            ls: 10,
          },
          {
            k: 'text',
            s: b.card[1],
            at: [800, 470],
            size: 26,
            font: 'mono',
            color: b.color,
            stroke: null,
            t0: 0.9,
            in: 'fade',
            ls: 14,
          },
        ],
      },
      ev: [{ t: 0.5, sfx: 'heavy', vol: 0.8, rate: 0.5 }],
    },
    4.2,
  ];
}

// o：{ key, title, music: [曲名, 從曲子的第幾秒], blocks: [...], cycle }
export function film(o) {
  const [track, off] = o.music;
  const beat = (t) => snapBeat(track, t, off);
  const shots = [];
  let at = 0;
  o.blocks.forEach((b, i) => {
    if (!b) return;
    const ctx = { at, beat, key: `${o.key}_${i}` };
    let r;
    if (b.page) r = pageShot(b.page, ctx);
    else if (b.still) r = stillShot(b.still);
    else if (b.talk) r = talkShot({ ...b.talk, cycle: o.cycle || 1 });
    else if (b.echo) r = echoShot(b.echo, o.cycle || 1);
    else if (b.rival) r = rivalShot(b.rival, ctx);
    else if (b.title) r = titleShot(b.title, ctx);
    else if (b.card) r = cardShot(b);
    else if (b.live) r = [b.live, b.dur || 3];
    if (!r) return;
    const [s, d] = r;
    shots.push({ ...s, at: +at.toFixed(2) });
    at += d;
  });
  return {
    title: o.title || '',
    dur: +at.toFixed(2),
    lb: false,
    music: [{ at: 0, track, off, vol: o.vol || 0.8, fadeIn: 0.8, fadeOut: [at - 2.5, 2.5] }],
    shots,
  };
}
