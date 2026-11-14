// 第 6 章的開場與章末（3D 動畫化，docs/cine-redesign-design.md 第十節）。
// 場景：高空軌道（orbit）、四家委託方的室內（辦公室、研究所、調度室、救援站）、軌道站的中樞（room core，render/cine-core.js）。
// 配樂 cine_c6（開場 0 秒起、章末 120 秒起）。
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

const WHITE = '#e8eef4';
const ORB = W('orbit', { seed: 6611, clear: 12 });
const ORBG = {
  sunAz: 90,
  sunEl: 28,
  temp: 0.6,
  contrast: 1.3,
  sat: 0.7,
  tintHi: '#f0f6ff',
  tintHiK: 0.3,
  tintLo: '#101a30',
  tintLoK: 0.45,
  grain: 0.3,
  vignette: 0.55,
  fogK: 1.2,
  bloom: 1.15,
};
const OFFG = { ...ROOM_GRADE, tintHi: '#ffb070', tintHiK: 0.4, tintLo: '#101826', tintLoK: 0.5 };
const LABG = { ...ROOM_GRADE, temp: 0.62, tintHi: '#d8f4ff', tintHiK: 0.35, tintLo: '#0a1622', tintLoK: 0.5 };
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
const CORE = {
  k: 'room',
  kind: 'core',
  sky: 0x010204,
  key: 0xe0f0ff,
  keyI: 1.1,
  hemi: 0x8aa8b8,
  hemiG: 0x303030,
  hemiI: 0.9,
  far: 600,
};
const COREG = {
  ...ROOM_GRADE,
  sunEl: 70,
  temp: 0.6,
  tintHi: '#c8e4ff',
  tintHiK: 0.3,
  tintLo: '#04060c',
  tintLoK: 0.55,
  contrast: 1.38,
};
const COCKPIT = (pose, s) => [
  { k: 'art', art: 'cockpit', q: [-40, -20, 1680, 940] },
  { k: 'actor', who: 'echo', pose, at: [1360, 1060], h: 740, in: 'fade', holo: '#7fc8ff', noBub: true, s },
];
// 「某人說：「…」」→ 引號裡的話（由那個人自己說）
const quoted = (l) => (/說：「(.+)」$/.exec(l) || [0, l])[1];
// 四家的室內與近景的鏡頭
const ROOMS4 = [
  ['castron', OFFICE, OFFG, 'p6', [0.9, 1.6, 1.6], [-1.4, 1.4, -4], [PARKED('stevedore')]],
  ['aetheric', LAB, LABG, 'p9', [-1.2, 1.7, 2.6], [1.2, 1.8, -3], []],
  ['veerwell', DISPATCH, DSG, 'p9', [0.9, 1.6, 1.8], [-1.4, 1.4, -5], []],
  ['sancta', STATION, STG, 'p5', [0.8, 1.55, 2.8], [-1.6, 1.3, -4], []],
];

// ---------- 開場 ----------
export function ch6Intro(ctx) {
  const T0 = pickLines(CHAPTER_TEXT[6].intro, (ctx && ctx.choices) || {});
  const TK = TALKS.intro_6.lines;
  const T = timeline();
  // 雲海之上的站（地點字卡）→ 地區的插畫格
  T.add(
    {
      set: ORB,
      grade: ORBG,
      fi: 1.5,
      lb: false,
      st: {
        els: [
          ...LOC('高空軌道', 'HIGH ORBIT', WHITE),
          PANEL(
            [
              [1010, 470],
              [1560, 470],
              [1560, 840],
              [960, 840],
            ],
            {
              img: 'c6/c6i_region',
              t0: 5.6,
              kb: [
                { t: 5.6, z: 1.12 },
                { t: 10.5, z: 1.22 },
              ],
            },
          ),
        ],
      },
      cam: {
        fov: 50,
        ease: 'lin',
        keys: [
          { t: 0, p: [0, 30, 60], l: [0, 2, 0] },
          { t: 10.5, p: [-6, 12, 30], l: [0, 3, 0], fov: 44 },
        ],
      },
      ev: [{ t: 0.3, sfx: 'distant', vol: 0.3, rate: 0.5 }],
    },
    10.5,
  );
  // 你問：為什麼是我？（駕駛艙，擋風窗外是雲海上的平台）
  T.add(
    {
      set: ORB,
      grade: { ...ORBG, exposure: 0.8 },
      lb: false,
      actors: [{ id: 'hc', k: 'hero', p: [-6, 8], yaw: 220 }],
      st: { els: [{ k: 'art', art: 'cockpit', q: [-40, -20, 1680, 940] }] },
      cam: { fov: 62, keys: [{ t: 0, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: [10, 2, -12] }] },
    },
    4.5,
  );
  // 四家的回答：各自的室內、近景（他們自己說）
  ROOMS4.forEach(([who, set, grade, pose, p, l, actors]) =>
    T.add(
      {
        set,
        grade: { ...grade, contrast: 1.36 },
        lb: false,
        fi: 0.15,
        actors,
        st: { els: [ACT(who, { pose, at: [720, 1820], h: 1900, in: 'fade' }), FOCUS(0, 0.3)] },
        cam: {
          fov: 32,
          dof: 1,
          focus: 0.9,
          range: 0.4,
          ease: 'lin',
          keys: [
            { t: 0, p, l },
            { t: who === 'sancta' ? 7 : 5.5, p: [p[0] * 0.95, p[1], p[2] - 0.25], l },
          ],
        },
        ev: [{ t: 0, sfx: 'thud1', vol: 0.25, rate: 1.2 }],
      },
      who === 'sancta' ? 7 : 5.5,
    ),
  );
  // 只有 ECHO 什麼都沒說：駕駛艙、ECHO 低著頭（沒有台詞）
  T.add(
    {
      set: ORB,
      grade: { ...ORBG, exposure: 0.8 },
      lb: false,
      actors: [{ id: 'hc2', k: 'hero', p: [-6, 8], yaw: 220 }],
      st: { els: COCKPIT('p8') },
      cam: { fov: 62, keys: [{ t: 0, p: { a: 'hc2', at: 'head', o: [0, 0.4, 0] }, l: [10, 2, -12] }] },
    },
    4,
  );
  // 諾拉的對話（救援站、駕駛艙、近景）
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
      set: ORB,
      grade: ORBG,
      lb: false,
      actors: [{ id: 'hc3', k: 'hero', p: [-6, 8], yaw: 220 }],
      st: { els: COCKPIT('p3') },
      cam: { fov: 62, keys: [{ t: 0, p: { a: 'hc3', at: 'head', o: [0, 0.4, 0] }, l: [10, 3, -12] }] },
    },
    4,
  );
  T.add(
    {
      set: STATION,
      grade: { ...STG, contrast: 1.36 },
      lb: false,
      st: { els: [ACT('sancta', { pose: 'p7', at: [720, 1820], h: 1900, in: null }), FOCUS(0, 0.35)] },
      cam: {
        fov: 34,
        dof: 1,
        focus: 0.9,
        range: 0.4,
        ease: 'out',
        keys: [
          { t: 0, p: [0.8, 1.55, 2.8], l: [-1.6, 1.3, -4], fov: 40 },
          { t: 0.35, p: [0.8, 1.55, 2.5], l: [-1.6, 1.3, -4], fov: 30 },
          { t: 4.5, p: [0.75, 1.55, 2.3], l: [-1.6, 1.32, -4], fov: 28 },
        ],
      },
    },
    4.5,
  );
  // ZENITH 登場（雲海的平台、仰角、一拍二）
  T.add(
    {
      set: ORB,
      grade: { ...ORBG, contrast: 1.38, exposure: 0.85 },
      lb: false,
      koma: 2,
      actors: [
        { id: 'zn', k: 'ace', key: 'zenith', p: [-4, -4], yaw: 160, s: [{ t: 0, scan: 0.5, per: 3 }] },
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
            color: '#8aa0c0',
            in: 'wipe',
            ind: 0.25,
            t0: 1.6,
            a: 0.92,
          },
          ACT('zenith', { pose: 'p1', at: [1360, 1180], h: 1250, t0: 1.7, in: 'right', par: 0 }),
          {
            k: 'text',
            s: 'ZENITH',
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
            s: 'RIVAL ／ 軌道上的傭兵',
            at: [86, 820],
            size: 26,
            al: 'left',
            color: WHITE,
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
          { t: 0, p: { a: 'zn', at: 'base', o: [-3, 0.4, 7] }, l: { a: 'zn', o: [0, 1.5, 0] } },
          { t: 5, p: { a: 'zn', at: 'base', o: [-2.4, 0.35, 5.2] }, l: { a: 'zn', o: [1, 2.2, 0] }, fov: 26 },
        ],
      },
      ev: [
        { t: 0.2, sfx: 'heavy', vol: 0.7, rate: 0.6 },
        { t: 2.0, sfx: 'thud1', vol: 0.7, rate: 0.6 },
      ],
    },
    5,
  );
  T.add(
    {
      set: ORB,
      grade: { ...ORBG, contrast: 1.32 },
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
  // 章名卡（旁白：只有 ECHO 什麼都沒說）
  const TT = T.at;
  const cb = (t) => +(snapBeat('cine_c6', TT + t) - TT).toFixed(3);
  T.add(
    {
      set: ORB,
      grade: ORBG,
      lb: false,
      fo: 0.8,
      st: {
        bg: '#9ab0d0',
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
            s: 'ORBIT',
            at: [1530, 600],
            size: 36,
            font: 'mono',
            al: 'right',
            color: '#9ab0d0',
            stroke: null,
            t0: 0.5,
            in: 'fade',
            ls: 8,
          },
          {
            k: 'text',
            s: 'CHAPTER 6',
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
            s: '軌道',
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
          { t: 0, p: [0, 1.2, 14], l: [0, 6, -10] },
          { t: 6, p: [0, 1.2, 13], l: [0, 6.5, -10] },
        ],
      },
      ev: [
        { t: 0.2, sfx: 'heavy', vol: 0.9, rate: 0.45 },
        { t: cb(0.8), sfx: 'thud1', vol: 0.8, rate: 0.6 },
      ],
    },
    6,
  );
  const W4 = [10.5 + 4.5, 15 + 5.5, 20.5 + 5.5, 26 + 5.5];
  placeLines(T, [
    [1.0, T0[0], 4.6, null],
    [5.8, T0[1], 4.6, null],
    [10.9, T0[2], 3.4, null],
    [W4[0] + 0.4, quoted(T0[3]), 3.4, 'castron'],
    [W4[1] + 0.4, quoted(T0[4]), 3.4, 'aetheric'],
    [W4[2] + 0.4, quoted(T0[5]), 3.4, 'veerwell'],
    [W4[3] + 0.4, quoted(T0[6]), 5.4, 'sancta'],
    [TALK0 + 0.4, TK[0][1], 4.6, TK[0][0]],
    [TALK0 + 5.2, TK[1][1], 4.6, TK[1][0]],
    [TALK0 + 10.3, TK[2][1], 3.4, TK[2][0]],
    [TALK0 + 14.4, TK[3][1], 4, TK[3][0]],
    [TT + 1.2, T0[7], 4, null],
  ]);
  dropAll(T);
  return T.def({
    title: '第六章　開場',
    music: [{ at: 0, track: 'cine_c6', vol: 0.8, fadeIn: 1, fadeOut: [T.at - 2.5, 2.5] }],
  });
}

// ---------- 章末：中樞是空的 ----------
export function ch6Outro(ctx) {
  const T0 = pickLines(CHAPTER_TEXT[6].outro, (ctx && ctx.choices) || {});
  const TK = TALKS.outro_6.lines;
  const T = timeline();
  // R-07 站在中樞裡（巨大的門 → 空的殿堂）
  const R07 = {
    id: 'r7',
    k: 'model',
    mech: true,
    pal: 'player',
    scale: 3,
    p: [0, 0, 12],
    yaw: 180, // 模型演員的腿不會動：站著（待機），由鏡頭推過去
  };
  T.add(
    {
      set: CORE,
      grade: { ...COREG, exposure: 1.4 },
      lb: false,
      fi: 1.2,
      actors: [R07],
      cam: {
        fov: 50,
        ease: 'lin',
        keys: [
          { t: 0, p: [3, 1.2, 4], l: [0, 6, 19] },
          { t: 5.5, p: [2.4, 1.4, 6], l: [0, 6, 16] },
        ],
      },
      ev: [
        { t: 0.4, sfx: 'heavy', vol: 0.6, rate: 0.4 },
        { t: 2.4, sfx: 'thud1', vol: 0.4, rate: 0.5 },
        { t: 4.4, sfx: 'thud1', vol: 0.4, rate: 0.5 },
      ],
    },
    5.5,
  );
  // 中樞是空的：空的台座＋跳動的字（背後的 R-07）
  T.add(
    {
      set: CORE,
      grade: COREG,
      lb: false,
      keep: true,
      cam: {
        fov: 46,
        ease: 'lin',
        keys: [
          { t: 0, p: [-10, 3, 2], l: [0, 3, 0] },
          { t: 7, p: [-8, 3.4, 5], l: [0, 4, 0] },
        ],
      },
      ev: [{ t: 2, sfx: 'glitch', vol: 0.25, rate: 0.7 }],
    },
    7,
  );
  // 「認證終端：不在此處。所在地：方舟。」：字的特寫（2D 的字疊在 3D 上、抖動）
  T.add(
    {
      set: CORE,
      grade: { ...COREG, chroma: 0.4 },
      lb: false,
      keep: true,
      st: {
        els: [
          {
            k: 'text',
            s: '認證終端：不在此處',
            at: [800, 660],
            size: 64,
            color: '#ff6a4a',
            stroke: '#200000',
            sw: 6,
            t0: 0.4,
            in: 'stamp',
            ls: 6,
          },
          {
            k: 'text',
            s: '所在地：方舟',
            at: [800, 760],
            size: 64,
            color: '#ff6a4a',
            stroke: '#200000',
            sw: 6,
            t0: 1.6,
            in: 'stamp',
            ls: 6,
          },
        ],
      },
      cam: {
        fov: 30,
        ease: 'lin',
        keys: [
          { t: 0, p: [0, 3, 8], l: [0, 6.4, 0] },
          { t: 5.5, p: [0, 3.2, 7], l: [0, 6.5, 0] },
        ],
      },
      ev: [
        { t: 0.4, sfx: 'glitch', vol: 0.4, rate: 0.6 },
        { t: 1.6, sfx: 'glitch', vol: 0.45, rate: 0.5 },
        { t: 1.65, shake: 0.2 },
      ],
    },
    5.5,
  );
  // 倒數沒有停：雲海上的站＋大字的倒數
  T.add(
    {
      set: ORB,
      grade: { ...ORBG, exposure: 0.75, sat: 0.5 },
      lb: false,
      st: {
        els: [
          {
            k: 'text',
            s: '47:12:09',
            at: [800, 470],
            size: 150,
            font: 'mono',
            color: '#ff5a3a',
            stroke: '#200000',
            sw: 8,
            t0: 0.3,
            in: 'fade',
            ls: 10,
          },
        ],
      },
      cam: {
        fov: 50,
        ease: 'lin',
        keys: [
          { t: 0, p: [0, 30, 60], l: [0, 2, 0] },
          { t: 5, p: [0, 34, 66], l: [0, 2, 0] },
        ],
      },
      ev: [{ t: 0.3, sfx: 'alarm', vol: 0.25, rate: 0.5 }],
    },
    5,
  );
  // 委託方的頻道全部沉默：三格的立繪一格一格斷訊（變黑）
  const CH3 = [
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
        els: CH3.flatMap(([who, pose], i) => {
          const q = [
            [40 + i * 390, 120],
            [400 + i * 390, 120],
            [380 + i * 390, 780],
            [20 + i * 390, 780],
          ];
          return [
            PANEL(q, {
              in: 'fade',
              t0: 0,
              fill: '#121216',
              dots: 0.12,
              kids: [ACT(who, { pose, at: [210 + i * 390, faceY(450, 2000)], h: 2000, in: null })],
            }),
            {
              k: 'block',
              q: [20 + i * 390, 120, 380, 660],
              color: '#030303',
              t0: 1.2 + i * 0.8,
              in: 'fade',
              ind: 0.15,
            },
            {
              k: 'text',
              s: 'NO SIGNAL',
              at: [210 + i * 390, 460],
              size: 30,
              font: 'mono',
              color: '#5a5a5a',
              stroke: null,
              t0: 1.25 + i * 0.8,
              in: 'fade',
              ls: 4,
            },
          ];
        }),
      },
      ev: [0, 1, 2, 3].map((i) => ({ t: 1.2 + i * 0.8, sfx: 'glitch', vol: 0.3, rate: 0.6 + i * 0.1 })),
    },
    5.4,
  );
  // 對話：駕駛艙的 ECHO（中樞）→ 霍斯特（辦公室）
  const TALK0 = T.at;
  T.add(
    {
      set: CORE,
      grade: COREG,
      lb: false,
      st: { els: COCKPIT('p9') },
      cam: { fov: 62, keys: [{ t: 0, p: [0, 6, 12], l: [0, 6, 0] }] },
      ev: [{ t: 0.05, sfx: 'glitch', vol: 0.3, rate: 0.9 }],
    },
    9,
  );
  T.add(
    {
      set: OFFICE,
      grade: { ...OFFG, contrast: 1.36, exposure: 1.0 },
      lb: false,
      actors: [PARKED('stevedore')],
      st: { els: [ACT('castron', { pose: 'p9', at: [720, 1820], h: 1900, in: 'fade' })] },
      cam: {
        fov: 32,
        dof: 1,
        focus: 0.9,
        range: 0.4,
        ease: 'lin',
        keys: [
          { t: 0, p: [0.9, 1.6, 1.5], l: [-1.4, 1.4, -4] },
          { t: 6, p: [0.85, 1.6, 1.25], l: [-1.4, 1.42, -4] },
        ],
      },
    },
    6,
  );
  // ECHO：「方舟。我以為它早就沉在熔岩裡了。」＋方舟的插畫格、淡出
  T.add(
    {
      set: CORE,
      grade: { ...COREG, exposure: 0.8 },
      lb: false,
      fo: 1.5,
      st: {
        els: [
          ...COCKPIT('p9'),
          PANEL(
            [
              [300, 150],
              [1000, 150],
              [1000, 620],
              [300, 620],
            ],
            { img: 'c7/c7i_ark', t0: 1.4, in: 'fade', ind: 0.6, dots: 0.3, tone: '#a04020' },
          ),
        ],
      },
      cam: { fov: 62, keys: [{ t: 0, p: [0, 6, 12], l: [0, 6, 0] }] },
    },
    8,
  );
  placeLines(T, [
    [0.8, T0[0], 4.4, null],
    [5.9, T0[1], 6.4, null],
    [12.9, T0[2], 4.8, null],
    [18.4, T0[3], 4, null],
    [23.3, T0[4], 4.4, null],
    [TALK0 + 0.4, TK[0][1], 4, TK[0][0]],
    [TALK0 + 4.8, TK[1][1], 3.8, TK[1][0]],
    [TALK0 + 9.3, TK[2][1], 5.4, TK[2][0]],
    [TALK0 + 15.4, T0[5], 5, 'echo'],
  ]);
  dropAll(T);
  return T.def({
    title: '第六章　章末',
    music: [{ at: 0, track: 'cine_c6', off: 120, vol: 0.8, fadeIn: 1, fadeOut: [T.at - 3, 3] }],
  });
}
