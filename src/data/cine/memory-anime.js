// ECHO 的記憶片段與真結局（3D 動畫化，docs/cine-redesign-design.md 第十節）：2D 混合 3D。
// 每一片有一個相關的 3D 地點，整個畫面調成那一片的雙色調（彩度 0、亮部＝亮色、暗部＝暗色），3D 一拍三（每秒 8 格的有限動畫）；
// ECHO「真實的樣子」（echo_true，台詞與語音照 echo）的雙色調立繪疊在 3D 上，旁白配單色的插畫格。
// 台詞＝data/story.js 的 MEMORIES／ENDINGS（語音已經有）。
import { ENDINGS, MEMORIES } from '../story.js';
import { W, lineDur, parseLine, timeline } from './kit.js';
import { CORE, LAB, LIVE, OFFICE, PANEL, PARKED, ROOM_GRADE, dropAll, placeLines } from './anime.js';
import { WASTE } from './ch1.js';

const DAM = W('dam', { seed: 6212, tod: 'dusk', anchor: [35, -20], clear: 10 });
const PORT = W('spaceport', { seed: 6412, clear: 14 });
const ORB = W('orbit', { seed: 6611, clear: 12 });
const VOLC = W('volcano', { seed: 6711, clear: 12 });
const ARK = W('ark', { seed: 6712, clear: 12 });
const ANT = { hook: 'c1antenna', antenna: { at: [116, -30], tilt: 0.32 } };

// 雙色調：彩度 0，亮部與暗部各推向一個顏色
const duo = (L, room) => ({
  ...(room ? ROOM_GRADE : { sunAz: 90, sunEl: 30, fogK: 1.1, bloom: 1.0 }),
  sat: 0,
  temp: 0.5,
  contrast: 1.42,
  tintHi: L.light,
  tintHiK: 0.85,
  tintLo: L.dark,
  tintLoK: 0.9,
  grain: 0.55,
  vignette: 0.75,
  chroma: 0.15,
  ...(room ? {} : { sky: 'theme' }),
});
// 每一片：雙色調、插畫、3D 的地點與兩個鏡頭（[位置, 看的點] 的開始與結束）
const LOOK = {
  1: {
    dark: '#1e0806',
    light: '#ff7050',
    img: 'c1/c1_antenna',
    set: WASTE,
    extra: ANT,
    cams: [
      [
        [
          { g: [138, -12], h: 16 },
          { g: [116, -28.5], h: 3 },
        ],
        [
          { g: [127, -22], h: 3.2 },
          { g: [116, -30], h: 3.6 },
        ],
      ],
      [
        [
          { g: [120.5, -25.6], h: 0.6 },
          { g: [116, -28.3], h: 3.4 },
        ],
        [
          { g: [119.8, -26.0], h: 0.75 },
          { g: [116, -28.3], h: 3.5 },
        ],
      ],
    ],
  },
  2: {
    dark: '#06121c',
    light: '#7fc8ff',
    img: 'cm/m_shelter',
    set: DAM,
    cams: [
      [
        [
          { g: [-12, 12], h: 1.5 },
          { g: [8, -10], h: 6 },
        ],
        [
          { g: [-11, 10], h: 1.6 },
          { g: [8, -10], h: 9 },
        ],
      ],
      [
        [
          { g: [-6, 14], h: 2 },
          { g: [0, -24], h: 8 },
        ],
        [
          { g: [-6, 14], h: 2 },
          { g: [2, -24], h: 16 },
        ],
      ],
    ],
  },
  3: {
    dark: '#0c0c16',
    light: '#c8c8ff',
    img: 'cm/m_lab',
    set: LAB,
    room: true,
    cams: [
      [
        [
          [-2.4, 1.7, 4.2],
          [1.2, 1.8, -3],
        ],
        [
          [-1.8, 1.7, 3.2],
          [1.2, 1.8, -3],
        ],
      ],
      [
        [
          [2.2, 2.4, 3.6],
          [-1, 1.2, -3],
        ],
        [
          [1.8, 2.2, 3.0],
          [-1, 1.2, -3],
        ],
      ],
    ],
  },
  4: {
    dark: '#160c04',
    light: '#ffb050',
    img: 'cm/m_dispatch',
    set: PORT,
    cams: [
      [
        [
          [0, 30, 60],
          [0, 2, 0],
        ],
        [
          [-6, 12, 30],
          [0, 3, 0],
        ],
      ],
      [
        [
          [-8, 2, 18],
          [6, 4, -30],
        ],
        [
          [-8, 2, 18],
          [6, 40, -30],
        ],
      ],
    ],
  },
  5: {
    dark: '#08140a',
    light: '#a8e080',
    img: 'c1/c1_office',
    set: OFFICE,
    room: true,
    actors: () => [PARKED('stevedore')],
    cams: [
      [
        [
          [-1.8, 1.7, 2.6],
          [1.6, 2.6, -8],
        ],
        [
          [-1.3, 1.7, 1.9],
          [1.6, 2.8, -8],
        ],
      ],
      [
        [
          [1.7, 1.7, 2.8],
          [-0.6, 1.35, -4],
        ],
        [
          [1.1, 1.65, 1.9],
          [-0.6, 1.35, -4],
        ],
      ],
    ],
  },
  6: {
    dark: '#100818',
    light: '#d8b0ff',
    img: 'cm/m_station',
    set: CORE,
    room: true,
    cams: [
      [
        [
          [-10, 3, 2],
          [0, 3, 0],
        ],
        [
          [-8, 3.4, 5],
          [0, 4, 0],
        ],
      ],
      [
        [
          [3, 1.2, 4],
          [0, 6, 19],
        ],
        [
          [2.4, 1.4, 6],
          [0, 6, 16],
        ],
      ],
    ],
  },
  7: {
    dark: '#1c0600',
    light: '#ff8a30',
    img: 'cm/m_forge',
    set: VOLC,
    cams: [
      [
        [
          [-50, 34, 70],
          [-70, 0, -40],
        ],
        [
          [-42, 16, 52],
          [-70, 2, -30],
        ],
      ],
      [
        [
          [28, 10, 36],
          [80, 2, 60],
        ],
        [
          [28, 10, 36],
          [80, 20, 60],
        ],
      ],
    ],
  },
  8: {
    dark: '#0a0a0a',
    light: '#f4ece0',
    img: 'cm/m_button',
    set: ARK,
    cams: [
      [
        [
          [0, 30, 50],
          [0, 2, -10],
        ],
        [
          [0, 8, 26],
          [0, 2, -20],
        ],
      ],
      [
        [
          [-10, 3, 30],
          [4, 4, -30],
        ],
        [
          [-10, 3, 30],
          [4, 30, -30],
        ],
      ],
    ],
  },
  end: {
    dark: '#04060e',
    light: '#ffd7a0',
    img: 'cm/m_station',
    set: ORB,
    cams: [
      [
        [
          [0, 30, 60],
          [0, 2, 0],
        ],
        [
          [-6, 12, 30],
          [0, 3, 0],
        ],
      ],
      [
        [
          [0, 4, 20],
          [0, 20, -40],
        ],
        [
          [0, 4, 18],
          [0, 34, -40],
        ],
      ],
    ],
  },
};
// echo_true 的姿勢（一句一個，輪流）
const POSES = ['p1', 'p3', 'p6', 'p9', 'p7', 'p8'];

function shortFilm({ title, tag, look, lines, music }) {
  const L = look;
  const grade = duo(L, L.room);
  const T = timeline();
  const cam = (i, d) => {
    const [a, b] = L.cams[i % L.cams.length];
    return {
      fov: 42,
      ease: 'lin',
      keys: [
        { t: 0, p: a[0], l: a[1] },
        { t: d, p: b[0], l: b[1] },
      ],
    };
  };
  const base = (d, i) => ({
    set: L.set,
    grade,
    lb: false,
    koma: 3,
    actors: L.actors ? L.actors() : undefined,
    ...(L.extra || {}),
    cam: cam(i, d),
  });
  // 雙色調：3D 的畫面拷貝進舞台、灰階後乘上亮色（底色），再以暗色濾色把黑提起來；最後是膠卷的邊
  const film = () => [
    LIVE({ k: 'block', gco: 'multiply', flt: 'grayscale(1) contrast(1.25) brightness(1.08)' }),
    { k: 'block', q: [0, 0, 1600, 900], color: L.dark, gco: 'screen' },
    { k: 'block', q: [0, 0, 1600, 14], color: L.light, a: 0.5 },
    { k: 'block', q: [0, 886, 1600, 14], color: L.light, a: 0.5 },
  ];
  // 片段的標題（3D 的地點＋標題）
  T.add(
    {
      ...base(4, 0),
      fi: 0.5,
      st: {
        els: [
          ...film(),
          {
            k: 'text',
            s: tag,
            at: [800, 380],
            size: 30,
            font: 'mono',
            color: L.light,
            stroke: null,
            t0: 0.4,
            in: 'fade',
            ls: 14,
          },
          {
            k: 'text',
            s: title,
            at: [800, 460],
            size: 96,
            color: L.light,
            stroke: L.dark,
            sw: 12,
            t0: 0.8,
            in: 'stamp',
            ls: 20,
          },
        ],
      },
      ev: [{ t: 0.2, sfx: 'glitch', vol: 0.3, rate: 0.6 }],
    },
    3.6,
  );
  const subs = [];
  let pi = 0;
  lines.forEach((l, i) => {
    const P = parseLine(l);
    const echo = P.who === 'echo';
    const d = lineDur(P.text) + 0.9;
    const els = [...film()];
    if (echo)
      els.push({
        k: 'actor',
        who: 'echo_true',
        sp: 'echo',
        pose: POSES[pi++ % POSES.length],
        at: i % 2 ? [460, 1180] : [1160, 1180],
        h: 1120,
        in: 'fade',
        ind: 0.4,
        tone: L.light,
        noBub: true,
      });
    // 旁白：單色的插畫格
    else
      els.push(
        PANEL(
          i % 2
            ? [
                [80, 90],
                [760, 90],
                [700, 620],
                [80, 620],
              ]
            : [
                [860, 90],
                [1520, 90],
                [1520, 620],
                [800, 620],
              ],
          { img: L.img, tone: L.light, dots: 0.5, t0: 0.4, in: i % 2 ? 'left' : 'right' },
        ),
      );
    subs.push([T.at + 0.4, P.text, d - 0.6, echo ? 'echo' : null]);
    T.add({ ...base(d, i + 1), fi: 0.25, st: { bg: L.light, els } }, d);
  });
  T.add(
    {
      set: { k: 'black' },
      lb: false,
      fo: 1.4,
      st: {
        bg: L.dark,
        els: [
          { k: 'block', q: [0, 0, 1600, 14], color: L.light, a: 0.5 },
          { k: 'block', q: [0, 886, 1600, 14], color: L.light, a: 0.5 },
        ],
      },
    },
    2,
  );
  placeLines(T, subs);
  dropAll(T);
  return T.def({
    title,
    music: [{ at: 0, track: music || 'cine_ident', vol: 0.55, fadeIn: 1.5, fadeOut: [T.at - 2.5, 2.5] }],
  });
}

// 記憶片段 k（1～8）：m<k>
export function memoryAnime(k) {
  const M = MEMORIES[k];
  if (!M) return null;
  return shortFilm({
    title: M.title,
    tag: `MEMORY ${k} / ${Object.keys(MEMORIES).length}`,
    look: LOOK[k] || LOOK[8],
    lines: M.lines,
  });
}

// 真結局：ECHO 說的幾句＋（記憶片段全部回收時）多出的結尾；結局畫面（文字）之前播
export function trueEndAnime(ctx = {}) {
  const E = ENDINGS.beyond;
  const lines = E.lines.filter((l) => /^ECHO：/.test(l) || /星球|推進器|最後一份工作/.test(l));
  return shortFilm({
    title: '彼岸',
    tag: 'TRUE ENDING',
    look: LOOK.end,
    lines: lines.concat(ctx.full ? E.full : []),
    music: 'cine_e4', // 第 8 章的結尾（scripts/cine-intro-music.py）
  });
}
