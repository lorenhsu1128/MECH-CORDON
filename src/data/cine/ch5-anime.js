// 第 5 章的開場與章末（3D 動畫化，docs/cine-redesign-design.md 第十節）。
// 場景：洋上都市 Reefhold（xylem）、霍斯特的辦公室、四家的會議室（room council，render/cine-council.js）、艾瑟立克的研究所。
// 配樂：開場 cine_i5、章末 cine_o5（AI 做的過場配樂，scripts/cine-intro-music.py）。
import { CHAPTER_TEXT, pickLines } from '../story.js';
import { snapBeat } from './beats.js';
import { W, timeline } from './kit.js';
import { TALKS } from './talks.js';
import {
  ACT,
  FOCUS,
  LAB,
  LIVE,
  LOC,
  OFFICE,
  PANEL,
  PARKED,
  ROOM_GRADE,
  SPEED,
  dropAll,
  faceY,
  placeLines,
} from './anime.js';

const SEA = '#40c0c0';
const REEF = W('xylem', { seed: 6511, clear: 12 });
const REEFN = W('xylem', {
  seed: 6511,
  tod: 'night',
  clear: 12,
  light: { sky: 0x060a14, fog: 0x0a1426, sun: 0x9ab8ff, sunI: 1.0, hemi: 0x6a7a9a, hemiI: 0.85 },
});
const DAYG = {
  sunAz: 90,
  sunEl: 30,
  temp: 0.5,
  contrast: 1.28,
  sat: 0.8,
  tintHi: '#fff4e0',
  tintHiK: 0.3,
  tintLo: '#102030',
  tintLoK: 0.4,
  grain: 0.3,
  vignette: 0.5,
  fogK: 1.2,
  bloom: 1.05,
};
const NIGHT = {
  ...DAYG,
  sunK: 0.7,
  temp: 0.62,
  sat: 0.7,
  tintHi: '#bcd8ff',
  tintLo: '#081020',
  tintLoK: 0.55,
  grain: 0.35,
  vignette: 0.6,
  bloom: 1.3,
  exposure: 1.35,
  sky: 'theme',
  fogColor: '#0a1426',
  fogColorK: 0.92,
  hfog: 0,
};
const OFFG = { ...ROOM_GRADE, tintHi: '#ffb070', tintHiK: 0.4, tintLo: '#101826', tintLoK: 0.5 };
const LABG = { ...ROOM_GRADE, temp: 0.62, tintHi: '#d8f4ff', tintHiK: 0.35, tintLo: '#0a1622', tintLoK: 0.5 };
const COUNCIL = {
  k: 'room',
  kind: 'council',
  sky: 0x02040a,
  key: 0xfff0d8,
  keyI: 1.3,
  hemi: 0xc0c0c0,
  hemiG: 0x505050,
  hemiI: 1.0,
  far: 500,
};
const CCG = {
  ...ROOM_GRADE,
  sunEl: 65,
  temp: 0.45,
  tintHi: '#ffe8c8',
  tintHiK: 0.3,
  tintLo: '#0a0c18',
  tintLoK: 0.5,
};
const HORST = (o) => ACT('castron', o);
const SAKKI = (o) => ACT('aetheric', o);
const COCKPIT = (pose, s) => [
  { k: 'art', art: 'cockpit', q: [-40, -20, 1680, 940] },
  { k: 'actor', who: 'echo', pose, at: [1360, 1060], h: 740, in: 'fade', holo: '#7fc8ff', noBub: true, s },
];

// ---------- 開場 ----------
export function ch5Intro(ctx) {
  const T0 = pickLines(CHAPTER_TEXT[5].intro, (ctx && ctx.choices) || {});
  const TK = TALKS.intro_5.lines;
  const T = timeline();
  // Reefhold 的建立鏡頭（海上的街區、大樓）＋地點字卡
  T.add(
    {
      set: REEF,
      grade: DAYG,
      fi: 1.5,
      lb: false,
      st: { els: [...LOC('東岸洋上都市', 'REEFHOLD', SEA)] },
      cam: {
        fov: 50,
        hand: 0.02,
        keys: [
          { t: 0, p: [0, 34, 60], l: [0, 2, 0] }, // 海面上的 g 會量到虛空的底：用相對原點的座標
          { t: 7, p: [-3, 15, 38], l: [0, 3, 0], fov: 42 },
        ],
      },
      ev: [{ t: 0.3, sfx: 'distant', vol: 0.3, rate: 0.6 }],
    },
    7,
  );
  // 所有勢力都來了：艦隊的插畫格（轟）疊在海上
  T.add(
    {
      set: REEF,
      grade: DAYG,
      lb: false,
      st: {
        els: [
          PANEL(
            [
              [200, 100],
              [1400, 100],
              [1400, 760],
              [200, 760],
            ],
            {
              img: 'c5/c5i_fleet',
              in: 'drop',
              t0: 0.2,
              dots: 0.25,
              kids: [
                {
                  k: 'text',
                  s: '轟',
                  at: [1180, 320],
                  size: 220,
                  color: '#e8fbff',
                  stroke: '#002a30',
                  rot: -0.1,
                  t0: 0.5,
                  in: 'stamp',
                },
              ],
            },
          ),
        ],
      },
      cam: { fov: 46, keys: [{ t: 0, p: { g: [-8, 10], h: 3 }, l: { g: [20, -30], h: 2 } }] },
      ev: [
        { t: 0.5, sfx: 'boom1', vol: 0.6, rate: 0.6 },
        { t: 0.55, shake: 0.3 },
      ],
    },
    4,
  );
  // 插旗、校準、夾在中間的難民：街區上的插畫格＋3D 的人群
  T.add(
    {
      set: REEF,
      grade: DAYG,
      lb: false,
      actors: [
        {
          id: 'pp',
          k: 'people',
          who: ['farmer', 'casual', 'hoodie', 'hooded', 'man', 'suitw'],
          n: 10,
          p: [2, 2],
          box: [5, 3],
          anim: ['Idle', 'Idle_Neutral'],
          face: 'rnd',
        },
      ],
      st: {
        els: [
          PANEL(
            [
              [900, 80],
              [1540, 80],
              [1540, 560],
              [840, 560],
            ],
            { img: 'c5/c5i_flags', t0: 1.0, dots: 0.25 },
          ),
        ],
      },
      cam: {
        fov: 42,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [-6, 10], h: 1.6 }, l: { g: [2, 2], h: 1.2 } },
          { t: 8, p: { g: [-8, 9], h: 1.7 }, l: { g: [2, 2], h: 1.3 } },
        ],
      },
    },
    8,
  );
  // 居民的防線（插畫格）
  T.add(
    {
      set: REEF,
      grade: { ...DAYG, contrast: 1.35 },
      lb: false,
      st: {
        els: [
          PANEL(
            [
              [60, 80],
              [720, 80],
              [660, 560],
              [60, 560],
            ],
            { img: 'c5/c5i_barricade', t0: 0.8, in: 'left', dots: 0.25 },
          ),
        ],
      },
      cam: {
        fov: 44,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [8, 10], h: 1.5 }, l: { g: [-4, -10], h: 5 } },
          { t: 7, p: { g: [7, 8], h: 1.6 }, l: { g: [-4, -10], h: 5.5 } },
        ],
      },
    },
    7,
  );
  // ---------- 霍斯特 ----------
  const TALK0 = T.at;
  T.add(
    {
      set: OFFICE,
      grade: OFFG,
      lb: false,
      fi: 0.2,
      actors: [PARKED('stevedore')],
      st: { els: [HORST({ pose: 'p1', at: [560, 1240], h: 1180 })] },
      cam: {
        fov: 40,
        dof: 1,
        focus: 1.2,
        range: 0.6,
        ease: 'lin',
        keys: [
          { t: 0, p: [1.7, 1.7, 2.8], l: [-0.6, 1.35, -4] },
          { t: 6, p: [1.1, 1.65, 1.9], l: [-0.6, 1.35, -4] },
        ],
      },
    },
    6,
  );
  T.add(
    {
      set: REEF,
      grade: DAYG,
      lb: false,
      actors: [{ id: 'hc', k: 'hero', p: [-8, 10], yaw: 220 }],
      st: { els: COCKPIT('p3') },
      cam: {
        fov: 62,
        hand: 0.03,
        keys: [
          { t: 0, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [8, -8], h: 4 } },
          { t: 5, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [10, -8], h: 4.4 } },
        ],
      },
      ev: [{ t: 0.05, sfx: 'glitch', vol: 0.3, rate: 0.9 }],
    },
    5,
  );
  T.add(
    {
      set: OFFICE,
      grade: { ...OFFG, contrast: 1.38 },
      lb: false,
      actors: [PARKED('stevedore')],
      st: { els: [HORST({ pose: 'p6', at: [720, 1820], h: 1900, in: null }), FOCUS(0, 0.35)] },
      cam: {
        fov: 34,
        dof: 1,
        focus: 0.9,
        range: 0.4,
        ease: 'out',
        keys: [
          { t: 0, p: [0.9, 1.6, 1.6], l: [-1.4, 1.4, -4], fov: 40 },
          { t: 0.35, p: [0.9, 1.6, 1.3], l: [-1.4, 1.4, -4], fov: 30 },
          { t: 4, p: [0.85, 1.6, 1.15], l: [-1.4, 1.42, -4], fov: 29 },
        ],
      },
    },
    4,
  );
  // 合約就是合約：辦公室的窗邊（窗外的 STEVEDORE）
  T.add(
    {
      set: OFFICE,
      grade: OFFG,
      lb: false,
      actors: [PARKED('stevedore')],
      st: { els: [HORST({ pose: 'p7', at: [1120, 1240], h: 1180, in: null })] },
      cam: {
        fov: 42,
        dof: 1,
        focus: 1.4,
        range: 0.7,
        ease: 'lin',
        keys: [
          { t: 0, p: [-1.8, 1.7, 2.6], l: [1.6, 2.6, -8] },
          { t: 4.5, p: [-1.5, 1.7, 2.2], l: [1.6, 2.8, -8] },
        ],
      },
    },
    4.5,
  );
  // 你已經是最有名的傭兵：R-07 的仰角＋插畫格
  T.add(
    {
      set: REEF,
      grade: DAYG,
      lb: false,
      actors: [{ id: 'hx', k: 'hero', p: [2, 2], yaw: 180, s: [{ t: 0, lower: true, scan: 0.4, per: 4 }] }],
      st: {
        els: [
          PANEL(
            [
              [1000, 80],
              [1540, 80],
              [1540, 560],
              [940, 560],
            ],
            { img: 'c5/c5i_famous', t0: 1.2, dots: 0.25 },
          ),
        ],
      },
      cam: {
        fov: 32,
        hand: 0.04,
        ease: 'lin',
        keys: [
          { t: 0, p: { a: 'hx', at: 'base', o: [1.5, 0.35, 8] }, l: { a: 'hx', o: [0, 1.7, 0] } },
          { t: 6, p: { a: 'hx', at: 'base', o: [1.2, 0.3, 6.4] }, l: { a: 'hx', o: [0, 2, 0] } },
        ],
      },
    },
    6,
  );
  // 沒有人問你為什麼總是被選上：駕駛艙裡的暗＋插畫格
  T.add(
    {
      set: REEF,
      grade: { ...DAYG, exposure: 0.7, sat: 0.5 },
      lb: false,
      actors: [{ id: 'hc2', k: 'hero', p: [-8, 10], yaw: 220 }],
      st: {
        els: [
          { k: 'art', art: 'cockpit', q: [-40, -20, 1680, 940] },
          PANEL(
            [
              [460, 180],
              [1140, 180],
              [1140, 700],
              [460, 700],
            ],
            { img: 'c5/c5i_why', t0: 0.8, in: 'fade', ind: 0.6, dots: 0.3 },
          ),
        ],
      },
      cam: {
        fov: 62,
        keys: [{ t: 0, p: { a: 'hc2', at: 'head', o: [0, 0.4, 0] }, l: { g: [8, -8], h: 4 } }],
      },
    },
    5,
  );
  // UNDERTOW 登場（一拍二）
  T.add(
    {
      set: REEF,
      grade: { ...DAYG, contrast: 1.4 },
      lb: false,
      koma: 2,
      actors: [{ id: 'ut', k: 'ace', key: 'undertow', p: [-4, -4], yaw: 160, s: [{ t: 0, chk: true }] }],
      st: {
        els: [
          {
            k: 'block',
            q: [
              [1000, 0],
              [1600, 0],
              [1600, 900],
              [1180, 900],
            ],
            color: SEA,
            in: 'wipe',
            ind: 0.25,
            t0: 1.6,
            a: 0.92,
          },
          ACT('undertow', { pose: 'p1', at: [1360, 1180], h: 1250, t0: 1.7, in: 'right', par: 0 }),
          {
            k: 'text',
            s: 'UNDERTOW',
            at: [80, 760],
            size: 120,
            font: 'title',
            al: 'left',
            color: '#effcff',
            stroke: '#000',
            sw: 8,
            t0: 2.0,
            in: 'stamp',
            ls: 10,
          },
          {
            k: 'text',
            s: 'RIVAL ／ Reefhold 的守衛',
            at: [86, 820],
            size: 26,
            al: 'left',
            color: SEA,
            stroke: '#000',
            sw: 4,
            t0: 2.3,
            in: 'fade',
            ls: 4,
          },
        ],
      },
      cam: {
        fov: 30,
        hand: 0.04,
        keys: [
          { t: 0, p: { a: 'ut', at: 'base', o: [-3, 0.4, 7] }, l: { a: 'ut', o: [0, 1.5, 0] } },
          { t: 5, p: { a: 'ut', at: 'base', o: [-2.4, 0.35, 5.2] }, l: { a: 'ut', o: [1, 2.2, 0] }, fov: 26 },
        ],
      },
      ev: [
        { t: 0.2, sfx: 'heavy', vol: 0.7, rate: 0.6 },
        { t: 2.0, sfx: 'thud1', vol: 0.7, rate: 0.6 },
        { t: 2.05, shake: 0.2 },
      ],
    },
    5,
  );
  T.add(
    {
      set: REEF,
      grade: { ...DAYG, contrast: 1.32 },
      lb: false,
      koma: 2,
      actors: [{ id: 'hx2', k: 'hero', p: [6, 14], yaw: 0, s: [{ t: 0, go: [6, -30], ab: true }] }],
      st: { els: [SPEED(0, 2.5)] },
      cam: {
        fov: 34,
        hand: 0.1,
        follow: 14,
        keys: [
          { t: 0, p: { a: 'hx2', at: 'base', o: [-12, 2, 1] }, l: { a: 'hx2', o: [0, 1.2, -2] } },
          { t: 2.5, p: { a: 'hx2', at: 'base', o: [-11, 2.2, -1] }, l: { a: 'hx2', o: [0, 1.2, -3] } },
        ],
      },
      ev: [{ t: 0.1, sfx: 'boostUp', vol: 0.9, rate: 0.9 }],
    },
    2.5,
  );
  const TT = T.at;
  const cb = (t) => +(snapBeat('cine_i5', TT + t) - TT).toFixed(3);
  T.add(
    {
      set: REEF,
      grade: DAYG,
      lb: false,
      fo: 0.8,
      st: {
        bg: SEA,
        els: [
          LIVE({ k: 'block', gco: 'multiply', flt: 'grayscale(1) contrast(9) brightness(1.3)' }),
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
            t0: 0.2,
            ind: 0.35,
          },
          {
            k: 'text',
            s: 'THE CHOICE AT SEA',
            at: [1530, 600],
            size: 36,
            font: 'mono',
            al: 'right',
            color: SEA,
            stroke: null,
            t0: 0.5,
            in: 'fade',
            ls: 8,
          },
          {
            k: 'text',
            s: 'CHAPTER 5',
            at: [140, 690],
            size: 54,
            font: 'title',
            al: 'left',
            color: '#effcff',
            stroke: null,
            t0: 0.55,
            in: 'left',
            ls: 12,
          },
          {
            k: 'text',
            s: '洋上的抉擇',
            at: [130, 790],
            size: 120,
            al: 'left',
            color: '#effcff',
            stroke: null,
            t0: cb(0.8),
            in: 'stamp',
            ls: 14,
          },
        ],
      },
      cam: {
        fov: 44,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [-10, 10], h: 0.8 }, l: { g: [8, -8], h: 8 } },
          { t: 5, p: { g: [-10, 9.5], h: 0.8 }, l: { g: [8, -8], h: 8.5 } },
        ],
      },
      ev: [
        { t: 0.2, sfx: 'heavy', vol: 0.9, rate: 0.45 },
        { t: cb(0.8), sfx: 'thud1', vol: 0.8, rate: 0.6 },
        { t: cb(0.8) + 0.05, shake: 0.2 },
      ],
    },
    5,
  );
  placeLines(T, [
    [1.0, T0[0], 6, null],
    [7.3, T0[1], 3.2, null],
    [11.3, T0[2], 7.6, null],
    [19.3, T0[3], 6.6, null],
    [TALK0 + 0.4, TK[0][1], 5.4, TK[0][0]],
    [TALK0 + 6.4, TK[1][1], 4.4, TK[1][0]],
    [TALK0 + 11.3, TK[2][1], 3.4, TK[2][0]],
    [TALK0 + 15.3, TK[3][1], 3.6, TK[3][0]],
    [TALK0 + 19.8, T0[4], 5, null],
    [TALK0 + 25.8, T0[5], 4.4, null],
  ]);
  dropAll(T);
  return T.def({
    title: '第五章　開場',
    music: [{ at: 0, track: 'cine_i5', vol: 0.8, fadeIn: 1, fadeOut: [T.at - 2.5, 2.5] }],
  });
}

// ---------- 章末：軌道站的訊息、四家談好了、薩奇、ECHO 第一次主動開口 ----------
export function ch5Outro(ctx) {
  const T0 = pickLines(CHAPTER_TEXT[5].outro, (ctx && ctx.choices) || {});
  const TK = TALKS.outro_5.lines;
  const T = timeline();
  // 夜的洋上都市：鏡頭往天空搖（軌道站的插畫格）
  T.add(
    {
      set: REEFN,
      grade: NIGHT,
      lb: false,
      fi: 1,
      st: {
        els: [
          PANEL(
            [
              [380, 80],
              [1220, 80],
              [1220, 480],
              [380, 480],
            ],
            { img: 'cm/m_station', t0: 3.4, in: 'drop', dots: 0.25, tone: '#6080a0' },
          ),
        ],
      },
      cam: {
        fov: 50,
        keys: [
          { t: 0, p: { g: [-6, 8], h: 1.5 }, l: { g: [8, -8], h: 3 } },
          { t: 6, p: { g: [-6, 8], h: 1.6 }, l: { g: [8, -8], h: 40 } },
        ],
      },
    },
    6,
  );
  // 「KEY-07。請前往中樞。」：黑底的大字（紅色的按鈕的插畫格）
  T.add(
    {
      set: { k: 'black' },
      lb: false,
      st: {
        bg: '#020202',
        els: [
          PANEL(
            [
              [560, 120],
              [1040, 120],
              [1040, 520],
              [560, 520],
            ],
            { img: 'cm/m_button', in: 'fade', ind: 0.4, dots: 0.3, tone: '#c04030' },
          ),
          {
            k: 'text',
            s: 'KEY-07',
            at: [800, 680],
            size: 120,
            font: 'mono',
            color: '#ff5a3a',
            stroke: '#200000',
            sw: 6,
            t0: 0.6,
            in: 'stamp',
            ls: 18,
          },
          {
            k: 'text',
            s: 'PROCEED TO CORE',
            at: [800, 760],
            size: 30,
            font: 'mono',
            color: '#ff9a7a',
            stroke: null,
            t0: 1.2,
            in: 'fade',
            ls: 10,
          },
        ],
      },
      ev: [
        { t: 0.2, sfx: 'glitch', vol: 0.45, rate: 0.6 },
        { t: 0.6, sfx: 'thud1', vol: 0.6, rate: 0.5 },
      ],
    },
    5,
  );
  // 會議室：72 小時的倒數（全像）
  T.add(
    {
      set: COUNCIL,
      grade: CCG,
      lb: false,
      fi: 0.3,
      cam: {
        fov: 45,
        ease: 'lin',
        keys: [
          { t: 0, p: [0, 1.6, 4.4], l: [0, 2.4, 0] },
          { t: 6, p: [0, 1.7, 3.6], l: [0, 2.6, 0] },
        ],
      },
      ev: [{ t: 0.4, sfx: 'alarm', vol: 0.25, rate: 0.5 }],
    },
    6,
  );
  // 四家談好了：會議室的遠景，四個人站在自己的席位（立繪疊在 3D 上）
  const FOUR = [
    ['castron', 'p7', [300, 980], 560],
    ['aetheric', 'p3', [620, 900], 470],
    ['veerwell', 'p3', [980, 900], 470],
    ['sancta', 'p8', [1300, 980], 560],
  ];
  T.add(
    {
      set: COUNCIL,
      grade: CCG,
      lb: false,
      st: {
        els: FOUR.map(([who, pose, at, h], i) => ACT(who, { pose, at, h, t0: 0.4 + i * 0.3, par: 0.06 })),
      },
      cam: {
        fov: 52,
        ease: 'lin',
        keys: [
          { t: 0, p: [0, 3.2, 6.6], l: [0, 1.0, -2] },
          { t: 13, p: [0.6, 3.0, 6.0], l: [0, 1.0, -2] },
        ],
      },
    },
    13,
  );
  // 他們都看著你：四格依序落下（立繪的近景）
  T.add(
    {
      set: COUNCIL,
      grade: CCG,
      lb: false,
      st: {
        bg: '#08080c',
        els: FOUR.map(([who, pose], i) =>
          PANEL(
            [
              [40 + i * 390, 60],
              [400 + i * 390, 60],
              [380 + i * 390, 840],
              [20 + i * 390, 840],
            ],
            {
              t0: 0.3 + i * 0.5,
              in: 'drop',
              fill: '#14141a',
              dots: 0.12,
              kids: [ACT(who, { pose, at: [210 + i * 390, faceY(420, 2200)], h: 2200, in: null })],
            },
          ),
        ),
      },
      ev: [0, 1, 2, 3].map((i) => ({ t: 0.3 + i * 0.5, sfx: 'thud1', vol: 0.4, rate: 0.8 + i * 0.05 })),
    },
    6,
  );
  // 薩奇（研究所）
  const TALK0 = T.at;
  T.add(
    {
      set: LAB,
      grade: LABG,
      lb: false,
      st: { els: [SAKKI({ pose: 'p1', at: [560, 1240], h: 1180 })] },
      cam: {
        fov: 40,
        dof: 1,
        focus: 1.2,
        range: 0.6,
        ease: 'lin',
        keys: [
          { t: 0, p: [-2.6, 1.7, 4.2], l: [0, 2.0, -1.2] },
          { t: 10, p: [-1.8, 1.7, 3.4], l: [0, 2.0, -1.2] },
        ],
      },
    },
    10,
  );
  T.add(
    {
      set: REEFN,
      grade: NIGHT,
      lb: false,
      actors: [{ id: 'hc', k: 'hero', p: [-8, 10], yaw: 220 }],
      st: { els: COCKPIT('p8') },
      cam: {
        fov: 62,
        hand: 0.03,
        keys: [
          { t: 0, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [8, -8], h: 6 } },
          { t: 5, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [8, -8], h: 10 } },
        ],
      },
      ev: [{ t: 0.05, sfx: 'glitch', vol: 0.3, rate: 0.9 }],
    },
    5,
  );
  T.add(
    {
      set: LAB,
      grade: { ...LABG, contrast: 1.38 },
      lb: false,
      st: {
        els: [
          SAKKI({ pose: 'p9', at: [720, 1820], h: 1900, in: null }),
          FOCUS(0, 0.35, 'rgba(200,240,255,0.35)'),
        ],
      },
      cam: {
        fov: 34,
        dof: 1,
        focus: 0.9,
        range: 0.4,
        ease: 'out',
        keys: [
          { t: 0, p: [-1.2, 1.7, 2.6], l: [1.2, 1.8, -3], fov: 40 },
          { t: 0.35, p: [-1.2, 1.7, 2.3], l: [1.2, 1.8, -3], fov: 30 },
          { t: 4.5, p: [-1.15, 1.7, 2.1], l: [1.2, 1.82, -3], fov: 28 },
        ],
      },
    },
    4.5,
  );
  // ECHO：「我在。照你的節奏來。」（駕駛艙、夜）→ 黑底的旁白
  T.add(
    {
      set: REEFN,
      grade: NIGHT,
      lb: false,
      actors: [{ id: 'hc2', k: 'hero', p: [-8, 10], yaw: 220, s: [{ t: 0, lower: true }] }],
      st: { els: COCKPIT('p10') },
      cam: {
        fov: 62,
        hand: 0.02,
        keys: [
          { t: 0, p: { a: 'hc2', at: 'head', o: [0, 0.4, 0] }, l: { g: [8, -8], h: 10 } },
          { t: 6, p: { a: 'hc2', at: 'head', o: [0, 0.4, 0] }, l: { g: [8, -8], h: 12 } },
        ],
      },
    },
    6,
  );
  T.add({ set: { k: 'black' }, lb: false, fo: 1, st: { bg: '#000', els: [] } }, 5);
  placeLines(T, [
    [0.8, T0[0], 5, null],
    [6.4, T0[1], 4, null],
    [11.4, T0[2], 5, null],
    [17.4, T0[3], 6, null],
    [23.6, T0[4], 6.4, null],
    [30.4, T0[5], 5.4, null],
    [TALK0 + 0.4, TK[0][1], 4.4, TK[0][0]],
    [TALK0 + 5.0, TK[1][1], 4.8, TK[1][0]],
    [TALK0 + 10.4, TK[2][1], 4.4, TK[2][0]],
    [TALK0 + 15.3, TK[3][1], 4, TK[3][0]],
    [TALK0 + 20.0, T0[6], 5.4, 'echo'],
    [TALK0 + 26.0, T0[7], 4, null],
  ]);
  dropAll(T);
  return T.def({
    title: '第五章　章末',
    music: [{ at: 0, track: 'cine_o5', vol: 0.8, fadeIn: 1, fadeOut: [T.at - 3, 3] }],
  });
}
