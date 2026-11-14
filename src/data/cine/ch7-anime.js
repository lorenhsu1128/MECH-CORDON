// 第 7 章的開場與章末、第 8 章的開場（3D 動畫化，docs/cine-redesign-design.md 第十節）。
// 場景：火山熔爐帶（volcano）、移動要塞方舟的甲板（ark）、霍斯特的辦公室、維爾威的調度室、聖域的救援站。
// 配樂：第 7 章開場 cine_drive 0 秒起、第 7 章章末 cine_c6 60 秒起、第 8 章開場 cine_c6 150 秒起。
import { CHAPTER_TEXT, pickLines } from '../story.js';
import { snapBeat } from './beats.js';
import { W, timeline } from './kit.js';
import { TALKS } from './talks.js';
import {
  ACT,
  FOCUS,
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

const LAVA = '#ff6a20',
  SAND = '#c8b080';
const VOLC = W('volcano', { seed: 6711, clear: 12 });
const ARK = W('ark', { seed: 6712, clear: 12 });
const FORGE = {
  sunAz: 90,
  sunEl: 18,
  temp: 0.25,
  contrast: 1.34,
  sat: 0.85,
  tintHi: '#ffb070',
  tintHiK: 0.4,
  tintLo: '#2a0a04',
  tintLoK: 0.45,
  grain: 0.35,
  vignette: 0.55,
  fogK: 1.0,
  bloom: 1.25,
};
const ARKG = { ...FORGE, temp: 0.4, sat: 0.7, tintHi: '#ffd8a0', tintLo: '#180c08' };
const OFFG = { ...ROOM_GRADE, tintHi: '#ffb070', tintHiK: 0.4, tintLo: '#101826', tintLoK: 0.5 };
const DISPATCH = {
  k: 'room',
  kind: 'veerwell',
  sky: 0x040810,
  key: 0xe0f0ff,
  keyI: 1.2,
  hemi: 0xa0b0c0,
  hemiG: 0x505050,
  hemiI: 1.0,
  far: 400,
};
const DSG = { ...ROOM_GRADE, temp: 0.55, tintHi: '#c8ffd0', tintHiK: 0.25, tintLo: '#081018', tintLoK: 0.5 };
const STATION = {
  k: 'room',
  kind: 'sancta',
  sky: 0x060918,
  key: 0xffc080,
  keyI: 1.4,
  hemi: 0xffe0b0,
  hemiG: 0x8a6040,
  hemiI: 1.0,
};
const STG = {
  ...ROOM_GRADE,
  sunEl: 60,
  exposure: 1.2,
  temp: 0.3,
  tintHi: '#ffc890',
  tintHiK: 0.35,
  tintLo: '#141020',
  tintLoK: 0.45,
};
const HORST = (o) => ACT('castron', o);
const COCKPIT = (pose, s) => [
  { k: 'art', art: 'cockpit', q: [-40, -20, 1680, 940] },
  { k: 'actor', who: 'echo', pose, at: [1360, 1060], h: 740, in: 'fade', holo: '#7fc8ff', noBub: true, s },
];
const RIGHT = (img, t0, o = {}) =>
  PANEL(
    [
      [900, 80],
      [1540, 80],
      [1540, 560],
      [840, 560],
    ],
    { img, t0, dots: 0.25, ...o },
  );
const LEFT = (img, t0, o = {}) =>
  PANEL(
    [
      [60, 80],
      [720, 80],
      [660, 560],
      [60, 560],
    ],
    { img, t0, in: 'left', dots: 0.25, ...o },
  );
// 宿敵登場（仰角、一拍二、色塊＋立繪＋名牌）
function rivalShot(set, grade, key, who, name, tag, color) {
  return {
    set,
    grade: { ...grade, contrast: 1.26, sunEl: 40, exposure: 0.72, bloom: 0.45, tintLoK: 0.3 },
    lb: false,
    koma: 2,
    actors: [
      { id: 'rv', k: 'ace', key, pal: key + '_lit', p: [-4, -4], yaw: 160, s: [{ t: 0, scan: 0.5, per: 3 }] },
    ],
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
          color,
          in: 'wipe',
          ind: 0.25,
          t0: 1.6,
          a: 0.92,
        },
        ACT(who, { pose: 'p1', at: [1360, 1180], h: 1250, t0: 1.7, in: 'right', par: 0 }),
        {
          k: 'text',
          s: name,
          at: [80, 760],
          size: 130,
          font: 'title',
          al: 'left',
          color: '#ffffff',
          stroke: '#000',
          sw: 8,
          t0: 2.0,
          in: 'stamp',
          ls: 12,
        },
        {
          k: 'text',
          s: 'RIVAL ／ ' + tag,
          at: [86, 820],
          size: 26,
          al: 'left',
          color,
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
        { t: 0, p: { a: 'rv', at: 'base', o: [-3, 0.4, 7] }, l: { a: 'rv', o: [0, 1.5, 0] } },
        { t: 5, p: { a: 'rv', at: 'base', o: [-2.4, 0.35, 5.2] }, l: { a: 'rv', o: [1, 2.2, 0] }, fov: 26 },
      ],
    },
    ev: [
      { t: 0.2, sfx: 'heavy', vol: 0.7, rate: 0.6 },
      { t: 2.0, sfx: 'thud1', vol: 0.7, rate: 0.6 },
      { t: 2.05, shake: 0.2 },
    ],
  };
}
function boostShot(set, grade) {
  return {
    set,
    grade: { ...grade, contrast: 1.32 },
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
  };
}
function titleShot(set, grade, track, at, ch, name, en, color) {
  const cb = (t) => +(snapBeat(track, at + t) - at).toFixed(3);
  return {
    set,
    grade,
    lb: false,
    fo: 0.8,
    st: {
      bg: color,
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
          s: en,
          at: [1530, 600],
          size: 36,
          font: 'mono',
          al: 'right',
          color,
          stroke: null,
          t0: 0.5,
          in: 'fade',
          ls: 8,
        },
        {
          k: 'text',
          s: 'CHAPTER ' + ch,
          at: [140, 690],
          size: 54,
          font: 'title',
          al: 'left',
          color: '#ffffff',
          stroke: null,
          t0: 0.55,
          in: 'left',
          ls: 12,
        },
        {
          k: 'text',
          s: name,
          at: [130, 790],
          size: 120,
          al: 'left',
          color: '#ffffff',
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
        { t: 0, p: [0, 1.2, 14], l: [0, 7, -10] },
        { t: 5, p: [0, 1.2, 13], l: [0, 7.5, -10] },
      ],
    },
    ev: [
      { t: 0.2, sfx: 'heavy', vol: 0.9, rate: 0.45 },
      { t: cb(0.8), sfx: 'thud1', vol: 0.8, rate: 0.6 },
    ],
  };
}

// ---------- 第 7 章 開場 ----------
export function ch7Intro(ctx) {
  const T0 = pickLines(CHAPTER_TEXT[7].intro, (ctx && ctx.choices) || {});
  const TK = TALKS.intro_7.lines;
  const T = timeline();
  T.add(
    {
      set: VOLC,
      grade: FORGE,
      fi: 1.5,
      lb: false,
      st: { els: [...LOC('火山熔爐帶', 'THE FORGE', LAVA)] },
      cam: {
        fov: 50,
        ease: 'lin',
        keys: [
          { t: 0, p: [-50, 34, 70], l: [-70, 0, -40] },
          { t: 7, p: [-42, 16, 52], l: [-70, 2, -30], fov: 44 },
        ],
      },
      ev: [{ t: 0.3, sfx: 'distant', vol: 0.35, rate: 0.4 }],
    },
    7,
  );
  T.add(
    {
      set: VOLC,
      grade: FORGE,
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
              img: 'c7/c7i_ark',
              in: 'drop',
              t0: 0.6,
              dots: 0.25,
              kids: [
                {
                  k: 'text',
                  s: '轟',
                  at: [1180, 320],
                  size: 220,
                  color: '#ffe0b0',
                  stroke: '#300800',
                  rot: -0.1,
                  t0: 1.0,
                  in: 'stamp',
                },
              ],
            },
          ),
        ],
      },
      cam: {
        fov: 46,
        ease: 'lin',
        keys: [
          { t: 0, p: [-10, 4, 16], l: [10, 6, -20] },
          { t: 6, p: [-9, 4.2, 14], l: [10, 6.4, -20] },
        ],
      },
      ev: [
        { t: 1.0, sfx: 'boom1', vol: 0.6, rate: 0.5 },
        { t: 1.05, shake: 0.3 },
      ],
    },
    6,
  );
  T.add(
    {
      set: ARK,
      grade: ARKG,
      lb: false,
      st: { els: [RIGHT('c7/c7i_memory', 1.4)] },
      cam: {
        fov: 46,
        ease: 'lin',
        keys: [
          { t: 0, p: [0, 3, 18], l: [0, 2, -20] },
          { t: 6, p: [0, 3.4, 14], l: [0, 2.2, -20] },
        ],
      },
    },
    6,
  );
  T.add(
    {
      set: ARK,
      grade: ARKG,
      lb: false,
      st: { els: [LEFT('c7/c7i_elevator', 1.4)] },
      cam: {
        fov: 50,
        keys: [
          { t: 0, p: [-10, 3, 30], l: [4, 4, -30] },
          { t: 6, p: [-10, 3, 30], l: [4, 40, -30] },
        ],
      },
    },
    6,
  );
  // 霍斯特第一次主動打來：辦公室（窗邊、暗）
  T.add(
    {
      set: OFFICE,
      grade: { ...OFFG, exposure: 1.0 },
      lb: false,
      fi: 0.2,
      actors: [PARKED('stevedore')],
      st: { els: [HORST({ pose: 'p9', at: [1120, 1240], h: 1180, dim: 0.2 })] },
      cam: {
        fov: 42,
        dof: 1,
        focus: 1.4,
        range: 0.7,
        ease: 'lin',
        keys: [
          { t: 0, p: [-1.8, 1.7, 2.6], l: [1.6, 2.6, -8] },
          { t: 6, p: [-1.4, 1.7, 2.0], l: [1.6, 2.8, -8] },
        ],
      },
    },
    6,
  );
  const TALK0 = T.at;
  T.add(
    {
      set: OFFICE,
      grade: OFFG,
      lb: false,
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
          { t: 4.5, p: [1.2, 1.65, 2.0], l: [-0.6, 1.35, -4] },
        ],
      },
    },
    4.5,
  );
  T.add(
    {
      set: OFFICE,
      grade: { ...OFFG, contrast: 1.38 },
      lb: false,
      actors: [PARKED('stevedore')],
      st: { els: [HORST({ pose: 'p9', at: [720, 1820], h: 1900, in: null }), FOCUS(0, 0.35)] },
      cam: {
        fov: 32,
        dof: 1,
        focus: 0.9,
        range: 0.4,
        ease: 'lin',
        keys: [
          { t: 0, p: [0.9, 1.6, 1.5], l: [-1.4, 1.4, -4] },
          { t: 7, p: [0.85, 1.6, 1.2], l: [-1.4, 1.42, -4] },
        ],
      },
    },
    7,
  );
  T.add(
    {
      set: VOLC,
      grade: FORGE,
      lb: false,
      actors: [{ id: 'hc', k: 'hero', p: [-6, 8], yaw: 220 }],
      st: { els: COCKPIT('p3') },
      cam: { fov: 62, keys: [{ t: 0, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: [10, 3, -12] }] },
      ev: [{ t: 0.05, sfx: 'glitch', vol: 0.3, rate: 0.9 }],
    },
    3.6,
  );
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
          { t: 7, p: [-1.4, 1.7, 2.0], l: [1.6, 2.8, -8] },
        ],
      },
    },
    7,
  );
  T.add(rivalShot(VOLC, FORGE, 'kiln', 'kiln', 'KILN', '熔爐的守衛', LAVA), 5);
  T.add(boostShot(VOLC, FORGE), 2.5);
  T.add(titleShot(VOLC, FORGE, 'cine_drive', T.at, 7, '熔爐', 'THE FORGE', LAVA), 5);
  placeLines(T, [
    [1.0, T0[0], 5.4, null],
    [7.4, T0[1], 5.4, null],
    [13.4, T0[2], 5.4, null],
    [19.4, T0[3], 5.6, null],
    [25.4, T0[4], 5.4, null],
    [TALK0 + 0.4, TK[0][1], 4, TK[0][0]],
    [TALK0 + 4.8, TK[1][1], 6.4, TK[1][0]],
    [TALK0 + 11.7, TK[2][1], 3.2, TK[2][0]],
    [TALK0 + 15.4, TK[3][1], 6.4, TK[3][0]],
  ]);
  dropAll(T);
  return T.def({
    title: '第七章　開場',
    music: [{ at: 0, track: 'cine_drive', vol: 0.8, fadeIn: 1, fadeOut: [T.at - 2.5, 2.5] }],
  });
}

// ---------- 第 7 章 章末：方舟起航 ----------
export function ch7Outro(ctx) {
  const veer = ((ctx && ctx.choices) || {}).c4 !== 'sancta';
  const T0 = pickLines(CHAPTER_TEXT[7].outro, {
    ...((ctx && ctx.choices) || {}),
    c4: veer ? 'veerwell' : 'sancta',
  });
  const TK = TALKS.outro_7.lines;
  const T = timeline();
  // 方舟起航：甲板在震動（煙、轟）＋起航的插畫格
  T.add(
    {
      set: ARK,
      grade: ARKG,
      fi: 0.6,
      lb: false,
      st: {
        els: [
          RIGHT('c7/c7o_launch', 0.6, {
            kids: [
              {
                k: 'text',
                s: '轟',
                at: [1300, 300],
                size: 200,
                color: '#ffe0b0',
                stroke: '#300800',
                rot: -0.1,
                t0: 0.8,
                in: 'stamp',
              },
            ],
          }),
        ],
      },
      cam: {
        fov: 46,
        hand: 0.15,
        ease: 'lin',
        keys: [
          { t: 0, p: [0, 3, 18], l: [0, 2, -20] },
          { t: 5, p: [0, 3.2, 16], l: [0, 2.2, -20] },
        ],
      },
      ev: [
        { t: 0.6, sfx: 'boom1', vol: 0.8, rate: 0.4 },
        { t: 0.6, shake: 0.6 },
        { t: 0.8, fx: 'smoke', at: [0, 2, -12], r: 6, life: 8, rise: 8 },
        { t: 2.4, shake: 0.4 },
      ],
    },
    5,
  );
  // 撞開閘門、往軌道電梯的基座前進：熔岩河、往上搖＋插畫格
  T.add(
    {
      set: VOLC,
      grade: FORGE,
      lb: false,
      st: { els: [LEFT('c7/c7i_elevator', 1.6)] },
      cam: {
        fov: 50,
        keys: [
          { t: 0, p: [28, 10, 36], l: [80, 2, 60] },
          { t: 7, p: [28, 10, 36], l: [80, 34, 60] },
        ],
      },
      ev: [{ t: 0.4, sfx: 'heavy', vol: 0.6, rate: 0.4 }],
    },
    7,
  );
  // 派克與諾拉（各自的室內，交替）
  const TALK0 = T.at;
  const PK = { pose: 'p3', at: [560, 1240], h: 1180 },
    NR = { pose: 'p1', at: [560, 1240], h: 1180 };
  const dispCam = [
    { t: 0, p: [1.6, 1.65, 3.4], l: [-0.8, 1.3, -5] },
    { t: 5, p: [1.2, 1.65, 2.8], l: [-0.8, 1.3, -5] },
  ];
  const statCam = [
    { t: 0, p: [1.4, 1.6, 4.4], l: [-0.6, 1.2, -6] },
    { t: 5, p: [1.1, 1.6, 3.8], l: [-0.6, 1.2, -6] },
  ];
  [
    [DISPATCH, DSG, 'veerwell', PK, dispCam, 4.4],
    [STATION, STG, 'sancta', NR, statCam, 3.6],
    [DISPATCH, DSG, 'veerwell', { pose: 'p9', at: [720, 1820], h: 1900 }, dispCam, 6.4],
    [STATION, STG, 'sancta', { pose: 'p7', at: [720, 1820], h: 1900 }, statCam, 6.4],
  ].forEach(([set, grade, who, a, keys, d]) =>
    T.add(
      {
        set,
        grade,
        lb: false,
        fi: 0.12,
        st: { els: [ACT(who, { ...a, in: 'fade' })] },
        cam: { fov: a.h > 1500 ? 34 : 42, dof: 1, focus: 1.0, range: 0.5, ease: 'lin', keys },
      },
      d,
    ),
  );
  // 依抉擇的一句（派克的船票／諾拉的「你還能上去」）
  const who = veer ? 'veerwell' : 'sancta';
  T.add(
    {
      set: veer ? DISPATCH : STATION,
      grade: veer ? DSG : STG,
      lb: false,
      st: { els: [ACT(who, { pose: veer ? 'p9' : 'p8', at: [720, 1820], h: 1900 }), FOCUS(0, 0.35)] },
      cam: { fov: 32, dof: 1, focus: 0.9, range: 0.4, ease: 'lin', keys: veer ? dispCam : statCam },
    },
    5,
  );
  // ECHO：「這是最後一章了，傭兵。」（駕駛艙、方舟的甲板）
  T.add(
    {
      set: ARK,
      grade: ARKG,
      lb: false,
      fo: 1.5,
      actors: [{ id: 'hc', k: 'hero', p: [-6, 8], yaw: 200, s: [{ t: 0, lower: true }] }],
      st: { els: COCKPIT('p10') },
      cam: { fov: 62, keys: [{ t: 0, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: [4, 3, -20] }] },
    },
    7,
  );
  placeLines(T, [
    [0.6, T0[0], 3.4, null],
    [5.4, T0[1], 6.4, null],
    [TALK0 + 0.4, TK[0][1], 3.6, TK[0][0]],
    [TALK0 + 4.6, TK[1][1], 3.2, TK[1][0]],
    [TALK0 + 8.2, TK[2][1], 5.8, TK[2][0]],
    [TALK0 + 14.6, TK[3][1], 5.8, TK[3][0]],
    [TALK0 + 21.2, T0[2], 4.4, who],
    [TALK0 + 26.2, T0[3], 5.4, 'echo'],
  ]);
  dropAll(T);
  return T.def({
    title: '第七章　章末',
    music: [{ at: 0, track: 'cine_c6', off: 60, vol: 0.8, fadeIn: 1, fadeOut: [T.at - 3, 3] }],
  });
}

// ---------- 第 8 章 開場：方舟 ----------
export function ch8Intro(ctx) {
  const T0 = pickLines(CHAPTER_TEXT[8].intro, (ctx && ctx.choices) || {});
  const TK = TALKS.intro_8.lines;
  const T = timeline();
  T.add(
    {
      set: ARK,
      grade: ARKG,
      fi: 1.5,
      lb: false,
      st: { els: [...LOC('方舟', 'THE ARK', SAND)] },
      cam: {
        fov: 50,
        ease: 'lin',
        keys: [
          { t: 0, p: [0, 30, 50], l: [0, 2, -10] },
          { t: 7, p: [0, 8, 26], l: [0, 2, -20], fov: 44 },
        ],
      },
      ev: [{ t: 0.3, sfx: 'heavy', vol: 0.4, rate: 0.35 }],
    },
    7,
  );
  T.add(
    {
      set: ARK,
      grade: ARKG,
      lb: false,
      st: { els: [LEFT('c8/c8i_wake', 1.2)] },
      cam: {
        fov: 46,
        hand: 0.05,
        ease: 'lin',
        keys: [
          { t: 0, p: [10, 2, -18], l: [-4, 2, 20] },
          { t: 6, p: [10, 2.2, -16], l: [-4, 2, 20] },
        ],
      },
      ev: [{ t: 0.3, shake: 0.2 }],
    },
    6,
  );
  T.add(
    {
      set: ARK,
      grade: { ...ARKG, exposure: 0.8 },
      lb: false,
      st: { els: [RIGHT('cm/m_button', 1.2, { tone: '#c04030' })] },
      cam: {
        fov: 40,
        ease: 'lin',
        keys: [
          { t: 0, p: [0, 1.4, 6], l: [0, 1.4, -30] },
          { t: 6, p: [0, 1.4, 2], l: [0, 1.4, -30] },
        ],
      },
    },
    6,
  );
  // 四家的頻道又亮了起來：四格一格一格亮（第 6 章章末的反過來）
  const F4 = [
    ['castron', 'p1'],
    ['aetheric', 'p3'],
    ['veerwell', 'p3'],
    ['sancta', 'p1'],
  ];
  T.add(
    {
      set: { k: 'black' },
      lb: false,
      st: {
        bg: '#030303',
        els: F4.map(([who, pose], i) =>
          PANEL(
            [
              [40 + i * 390, 120],
              [400 + i * 390, 120],
              [380 + i * 390, 780],
              [20 + i * 390, 780],
            ],
            {
              in: 'fade',
              ind: 0.3,
              t0: 0.5 + i * 0.7,
              fill: '#121216',
              dots: 0.12,
              kids: [ACT(who, { pose, at: [210 + i * 390, faceY(450, 2000)], h: 2000, in: null })],
            },
          ),
        ),
      },
      ev: [0, 1, 2, 3].map((i) => ({ t: 0.5 + i * 0.7, sfx: 'glitch', vol: 0.25, rate: 1.1 })),
    },
    6,
  );
  const TALK0 = T.at;
  T.add(
    {
      set: STATION,
      grade: STG,
      lb: false,
      st: { els: [ACT('sancta', { pose: 'p1', at: [560, 1240], h: 1180 })] },
      cam: {
        fov: 42,
        dof: 1,
        focus: 1.2,
        range: 0.6,
        ease: 'lin',
        keys: [
          { t: 0, p: [1.4, 1.6, 4.4], l: [-0.6, 1.2, -6] },
          { t: 10, p: [1.0, 1.6, 3.4], l: [-0.6, 1.2, -6] },
        ],
      },
    },
    10,
  );
  T.add(
    {
      set: ARK,
      grade: ARKG,
      lb: false,
      actors: [{ id: 'hc', k: 'hero', p: [-6, 8], yaw: 200 }],
      st: { els: COCKPIT('p10') },
      cam: { fov: 62, keys: [{ t: 0, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: [4, 3, -20] }] },
      ev: [{ t: 0.05, sfx: 'glitch', vol: 0.3, rate: 0.9 }],
    },
    8,
  );
  T.add(rivalShot(ARK, ARKG, 'keel', 'keel', 'KEEL', '方舟的守衛', SAND), 5);
  T.add(boostShot(ARK, ARKG), 2.5);
  T.add(titleShot(ARK, ARKG, 'cine_c6', T.at + 150, 8, '方舟', 'THE ARK', SAND), 5);
  placeLines(T, [
    [1.0, T0[0], 5.4, null],
    [7.4, T0[1], 5.4, null],
    [13.4, T0[2], 5.6, null],
    [19.4, T0[3], 5.6, null],
    [TALK0 + 0.4, TK[0][1], 4.6, TK[0][0]],
    [TALK0 + 5.4, TK[1][1], 4.4, TK[1][0]],
    [TALK0 + 10.4, TK[2][1], 3.4, TK[2][0]],
    [TALK0 + 14.0, TK[3][1], 3.6, TK[3][0]],
  ]);
  dropAll(T);
  return T.def({
    title: '第八章　開場',
    music: [{ at: 0, track: 'cine_c6', off: 150, vol: 0.8, fadeIn: 1, fadeOut: [T.at - 2.5, 2.5] }],
  });
}
