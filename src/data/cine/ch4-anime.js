// 第 4 章的開場與章末（3D 動畫化，docs/cine-redesign-design.md 第十節）。
// 場景：Lattice-9（grid086，多層平台的巨型構造體）、舊宇宙港（spaceport）、維爾威的調度室（room veerwell）、
// 聖域的救援站（room sancta）、霍斯特的辦公室（room castron）。配樂 cine_c5（開場 0 秒起、章末 60 秒起）。
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

const LIME = '#9be070';
const LAT = W('grid086', { seed: 6411, clear: 14 });
const PORT = W('spaceport', { seed: 6412, clear: 14 });
const DAYG = {
  sunAz: 90,
  sunEl: 32,
  temp: 0.5,
  contrast: 1.28,
  sat: 0.78,
  tintHi: '#fff0d8',
  tintHiK: 0.3,
  tintLo: '#18202a',
  tintLoK: 0.4,
  grain: 0.3,
  vignette: 0.5,
  fogK: 1.1,
  bloom: 1.05,
};
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
const OFFG = { ...ROOM_GRADE, tintHi: '#ffb070', tintHiK: 0.4, tintLo: '#101826', tintLoK: 0.5 };
const PIKE = (o) => ACT('veerwell', o);
const NORA = (o) => ACT('sancta', o);
const HORST = (o) => ACT('castron', o);
const COCKPIT = (pose, s) => [
  { k: 'art', art: 'cockpit', q: [-40, -20, 1680, 940] },
  { k: 'actor', who: 'echo', pose, at: [1360, 1060], h: 740, in: 'fade', holo: '#7fc8ff', noBub: true, s },
];

// ---------- 開場 ----------
export function ch4Intro(ctx) {
  const T0 = pickLines(CHAPTER_TEXT[4].intro, (ctx && ctx.choices) || {});
  const TK = TALKS.intro_4.lines;
  const T = timeline();

  // Lattice-9：平台底下往上的仰角，鏡頭慢慢升起（地點字卡）
  T.add(
    {
      set: LAT,
      grade: DAYG,
      fi: 1.5,
      lb: false,
      st: { els: [...LOC('北部構造體', 'LATTICE-9', LIME)] },
      cam: {
        fov: 50,
        hand: 0.02,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [-12, 12], h: 1.2 }, l: { g: [6, -6], h: 6 } },
          { t: 7, p: { g: [-10, 10], h: 5 }, l: { g: [6, -6], h: 8 } },
        ],
      },
      ev: [{ t: 0.3, sfx: 'distant', vol: 0.3, rate: 0.6 }],
    },
    7,
  );
  // 舊宇宙港：塔台的仰角＋宇宙港的插畫格
  T.add(
    {
      set: PORT,
      grade: DAYG,
      lb: false,
      st: {
        els: [
          PANEL(
            [
              [1010, 470],
              [1560, 470],
              [1560, 840],
              [960, 840],
            ],
            {
              img: 'c4/c4i_port',
              t0: 2.6,
              kb: [
                { t: 2.6, z: 1.12 },
                { t: 6, z: 1.2 },
              ],
            },
          ),
        ],
      },
      cam: {
        fov: 44,
        hand: 0.02,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [-12, 12], h: 1.5 }, l: { g: [8, -10], h: 6 } },
          { t: 6, p: { g: [-11, 10], h: 1.6 }, l: { g: [8, -10], h: 9 } },
        ],
      },
    },
    6,
  );
  // 維爾威想要它：調度室的顯示牆前，派克背對著（暗）
  T.add(
    {
      set: DISPATCH,
      grade: DSG,
      lb: false,
      fi: 0.2,
      st: { els: [PIKE({ pose: 'p9', at: [1120, 1240], h: 1180, dim: 0.2 })] },
      cam: {
        fov: 46,
        dof: 1,
        focus: 1.6,
        range: 0.8,
        ease: 'lin',
        keys: [
          { t: 0, p: [-1.2, 1.6, -0.6], l: [0.4, 1.9, 4.5] },
          { t: 6, p: [-0.9, 1.65, 0.4], l: [0.6, 2.0, 4.5] },
        ],
      },
    },
    6,
  );
  // 聖域想守住它：宇宙港旁邊的難民（3D 的人群）＋諾拉的格子
  T.add(
    {
      set: PORT,
      grade: { ...DAYG, sat: 0.6 },
      lb: false,
      actors: [
        {
          id: 'rf',
          k: 'people',
          who: ['farmer', 'casual', 'hoodie', 'hooded', 'man', 'suitw'],
          n: 12,
          p: [2, 2],
          box: [6, 4],
          anim: ['Idle', 'Idle_Neutral', 'Sitting'],
          face: 'rnd',
        },
      ],
      st: {
        els: [
          PANEL(
            [
              [1080, 70],
              [1540, 70],
              [1540, 470],
              [1020, 470],
            ],
            {
              t0: 1.6,
              fill: '#1a1408',
              dots: 0.15,
              kids: [NORA({ pose: 'p8', at: [1290, faceY(270, 1800)], h: 1800, in: null })],
            },
          ),
        ],
      },
      cam: {
        fov: 40,
        hand: 0.02,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [-6, 10], h: 1.4 }, l: { g: [2, 2], h: 1 } },
          { t: 6, p: { g: [-8, 9], h: 1.5 }, l: { g: [2, 2], h: 1.1 } },
        ],
      },
    },
    6,
  );
  // 掘骸者：平台底下的人影（3D）＋插畫格
  T.add(
    {
      set: LAT,
      grade: { ...DAYG, contrast: 1.38, sat: 0.6 },
      lb: false,
      actors: [
        {
          id: 'sc',
          k: 'people',
          who: ['soldier', 'hooded', 'worker'],
          n: 7,
          p: [4, -2],
          box: [5, 3],
          anim: ['Idle_Gun_Pointing', 'Idle', 'Interact'],
          dark: 0.5,
          face: 'rnd',
        },
      ],
      st: {
        els: [
          PANEL(
            [
              [60, 60],
              [700, 60],
              [650, 520],
              [60, 520],
            ],
            { img: 'c4/c4i_scav', t0: 2.0, in: 'left', dots: 0.3 },
          ),
        ],
      },
      cam: {
        fov: 40,
        hand: 0.03,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [12, 8], h: 1.2 }, l: { g: [4, -2], h: 1.4 } },
          { t: 6, p: { g: [11, 6], h: 1.3 }, l: { g: [4, -2], h: 1.6 } },
        ],
      },
    },
    6,
  );

  // ---------- 派克 ----------
  const TALK0 = T.at;
  T.add(
    {
      set: DISPATCH,
      grade: DSG,
      lb: false,
      st: { els: [PIKE({ pose: 'p3', at: [560, 1240], h: 1180 })] },
      cam: {
        fov: 42,
        dof: 1,
        focus: 1.2,
        range: 0.6,
        ease: 'lin',
        keys: [
          { t: 0, p: [1.6, 1.65, 3.4], l: [-0.8, 1.3, -5] },
          { t: 6, p: [1.1, 1.65, 2.6], l: [-0.8, 1.3, -5] },
        ],
      },
    },
    6,
  );
  // 插入：構造體的大遠景（往上看）＋派克的臉
  T.add(
    {
      set: LAT,
      grade: DAYG,
      lb: false,
      st: {
        els: [
          PANEL(
            [
              [1080, 70],
              [1540, 70],
              [1540, 470],
              [1020, 470],
            ],
            {
              t0: 1.0,
              fill: '#0c160a',
              dots: 0.15,
              kids: [PIKE({ pose: 'p9', at: [1290, faceY(270, 1800)], h: 1800, in: null })],
            },
          ),
        ],
      },
      cam: {
        fov: 52,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [-20, 24], h: 3 }, l: { g: [10, -10], h: 14 } },
          { t: 6.4, p: { g: [-18, 21], h: 3.4 }, l: { g: [10, -10], h: 16 } },
        ],
      },
    },
    6.4,
  );
  // ECHO：駕駛艙（擋風窗外是宇宙港）
  T.add(
    {
      set: PORT,
      grade: DAYG,
      lb: false,
      actors: [{ id: 'hc', k: 'hero', p: [-8, 12], yaw: 200 }],
      st: { els: COCKPIT('p3') },
      cam: {
        fov: 62,
        hand: 0.03,
        keys: [
          { t: 0, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [4, -6], h: 3 } },
          { t: 4.6, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [6, -6], h: 3.2 } },
        ],
      },
      ev: [{ t: 0.05, sfx: 'glitch', vol: 0.3, rate: 0.9 }],
    },
    4.6,
  );
  // 派克的近景（變焦衝擊）
  T.add(
    {
      set: DISPATCH,
      grade: { ...DSG, contrast: 1.36 },
      lb: false,
      st: {
        els: [
          PIKE({ pose: 'p9', at: [720, 1820], h: 1900, in: null }),
          FOCUS(0, 0.35, 'rgba(200,255,200,0.3)'),
        ],
      },
      cam: {
        fov: 34,
        dof: 1,
        focus: 0.9,
        range: 0.4,
        ease: 'out',
        keys: [
          { t: 0, p: [0.9, 1.6, 1.8], l: [-1.4, 1.4, -5], fov: 40 },
          { t: 0.35, p: [0.9, 1.6, 1.5], l: [-1.4, 1.4, -5], fov: 30 },
          { t: 5, p: [0.85, 1.6, 1.35], l: [-1.4, 1.42, -5], fov: 29 },
        ],
      },
    },
    5,
  );
  // 所有人都在往上看：宇宙港，鏡頭沿著塔台往天空搖＋插畫格
  T.add(
    {
      set: PORT,
      grade: { ...DAYG, exposure: 1.1 },
      lb: false,
      st: {
        els: [
          PANEL(
            [
              [380, 560],
              [1220, 560],
              [1220, 860],
              [380, 860],
            ],
            { img: 'c4/c4i_up', t0: 3.4, in: 'drop', dots: 0.25 },
          ),
        ],
      },
      cam: {
        fov: 50,
        ease: 'io',
        keys: [
          { t: 0, p: { g: [-4, 8], h: 1.2 }, l: { g: [8, -10], h: 2 } },
          { t: 7.4, p: { g: [-4, 8], h: 1.4 }, l: { g: [8, -10], h: 40 } },
        ],
      },
    },
    7.4,
  );
  // SPIRE 登場（構造體の平台の上、仰角・一拍二）
  T.add(
    {
      set: LAT,
      // SPIRE 是白色的機體：曝光壓低、光暈弱一點
      grade: { ...DAYG, contrast: 1.3, exposure: 0.7, bloom: 0.6, sunK: 0.5 },
      lb: false,
      koma: 2,
      actors: [{ id: 'sp', k: 'ace', key: 'spire', p: [-4, -4], yaw: 160, s: [{ t: 0, scan: 0.5, per: 3 }] }],
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
            color: LIME,
            in: 'wipe',
            ind: 0.25,
            t0: 1.6,
            a: 0.92,
          },
          ACT('spire', { pose: 'p1', at: [1360, 1180], h: 1250, t0: 1.7, in: 'right', par: 0 }),
          {
            k: 'text',
            s: 'SPIRE',
            at: [80, 760],
            size: 130,
            font: 'title',
            al: 'left',
            color: '#f4ffe8',
            stroke: '#000',
            sw: 8,
            t0: 2.0,
            in: 'stamp',
            ls: 12,
          },
          {
            k: 'text',
            s: 'RIVAL ／ 掘骸者的首領',
            at: [86, 820],
            size: 26,
            al: 'left',
            color: LIME,
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
          { t: 0, p: { a: 'sp', at: 'base', o: [-3, 0.4, 7] }, l: { a: 'sp', o: [0, 1.5, 0] } },
          { t: 5, p: { a: 'sp', at: 'base', o: [-2.4, 0.35, 5.2] }, l: { a: 'sp', o: [1, 2.2, 0] }, fov: 26 },
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
  // R-07 出發（一拍二）
  T.add(
    {
      set: LAT,
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
  // 章名卡：構造體的剪影
  const TT = T.at;
  const cb = (t) => +(snapBeat('cine_c5', TT + t) - TT).toFixed(3);
  T.add(
    {
      set: LAT,
      grade: DAYG,
      lb: false,
      fo: 0.8,
      st: {
        bg: LIME,
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
            s: 'THE LATTICE',
            at: [1530, 600],
            size: 36,
            font: 'mono',
            al: 'right',
            color: LIME,
            stroke: null,
            t0: 0.5,
            in: 'fade',
            ls: 8,
          },
          {
            k: 'text',
            s: 'CHAPTER 4',
            at: [140, 690],
            size: 54,
            font: 'title',
            al: 'left',
            color: '#f4ffe8',
            stroke: null,
            t0: 0.55,
            in: 'left',
            ls: 12,
          },
          {
            k: 'text',
            s: '構造體',
            at: [130, 790],
            size: 120,
            al: 'left',
            color: '#f4ffe8',
            stroke: null,
            t0: cb(0.8),
            in: 'stamp',
            ls: 14,
          },
        ],
      },
      cam: {
        fov: 46,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [-10, 10], h: 0.8 }, l: { g: [6, -6], h: 10 } },
          { t: 5, p: { g: [-10, 9.5], h: 0.8 }, l: { g: [6, -6], h: 10.5 } },
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
    [1.0, T0[0], 5.6, null],
    [7.4, T0[1], 4.8, null],
    [13.4, T0[2], 5.4, null],
    [19.4, T0[3], 5.6, null],
    [25.4, T0[4], 5.4, null],
    [TALK0 + 0.4, TK[0][1], 5.4, TK[0][0]],
    [TALK0 + 6.4, TK[1][1], 5.8, TK[1][0]],
    [TALK0 + 12.6, TK[2][1], 4.2, TK[2][0]],
    [TALK0 + 17.2, TK[3][1], 4.4, TK[3][0]],
    [TALK0 + 22.2, T0[5], 7.0, null],
  ]);
  dropAll(T);
  return T.def({
    title: '第四章　開場',
    music: [{ at: 0, track: 'cine_c5', vol: 0.8, fadeIn: 1, fadeOut: [T.at - 2.5, 2.5] }],
  });
}

// ---------- 章末（依抉擇 c4：veerwell＝發射設施交給維爾威、sancta＝聖域守住了門）----------
const PORTN = W('spaceport', {
  seed: 6412,
  tod: 'night',
  clear: 14,
  light: { sky: 0x060a14, fog: 0x0a1426, sun: 0x9ab8ff, sunI: 1.0, hemi: 0x6a7a9a, hemiI: 0.85 },
});
const NIGHT = {
  sunAz: 90,
  sunEl: 24,
  sunK: 0.7,
  temp: 0.62,
  contrast: 1.32,
  sat: 0.7,
  tintHi: '#bcd8ff',
  tintHiK: 0.4,
  tintLo: '#081020',
  tintLoK: 0.55,
  grain: 0.35,
  vignette: 0.6,
  fogK: 1.2,
  bloom: 1.3,
  exposure: 1.35,
  sky: 'theme',
  fogColor: '#0a1426',
  fogColorK: 0.92,
  hfog: 0,
};
export function ch4Outro(ctx) {
  const veer = ((ctx && ctx.choices) || {}).c4 !== 'sancta';
  const T0 = pickLines(CHAPTER_TEXT[4].outro, {
    ...((ctx && ctx.choices) || {}),
    c4: veer ? 'veerwell' : 'sancta',
  });
  const TK = TALKS.outro_4[veer ? 'veerwell' : 'sancta'].lines;
  const ROOM = veer ? DISPATCH : STATION;
  const RG = veer ? DSG : STG;
  const CLIENT = (o) => ACT(veer ? 'veerwell' : 'sancta', o);
  const bust = veer
    ? [
        { t: 0, p: [1.6, 1.65, 3.4], l: [-0.8, 1.3, -5] },
        { t: 6, p: [1.1, 1.65, 2.6], l: [-0.8, 1.3, -5] },
      ]
    : [
        { t: 0, p: [1.4, 1.6, 4.4], l: [-0.6, 1.2, -6] },
        { t: 6, p: [1.0, 1.6, 3.6], l: [-0.6, 1.2, -6] },
      ];
  const close = veer
    ? [
        { t: 0, p: [0.9, 1.6, 1.8], l: [-1.4, 1.4, -5], fov: 40 },
        { t: 0.35, p: [0.9, 1.6, 1.5], l: [-1.4, 1.4, -5], fov: 30 },
        { t: 4.5, p: [0.85, 1.6, 1.35], l: [-1.4, 1.42, -5], fov: 29 },
      ]
    : [
        { t: 0, p: [0.8, 1.55, 2.8], l: [-1.6, 1.3, -4], fov: 40 },
        { t: 0.35, p: [0.8, 1.55, 2.5], l: [-1.6, 1.3, -4], fov: 30 },
        { t: 4.5, p: [0.75, 1.55, 2.3], l: [-1.6, 1.32, -4], fov: 28 },
      ];
  const T = timeline();
  T.add(
    {
      set: ROOM,
      grade: RG,
      lb: false,
      fi: 0.6,
      st: { els: [CLIENT({ pose: veer ? 'p3' : 'p1', at: [560, 1240], h: 1180 })] },
      cam: { fov: 42, dof: 1, focus: 1.2, range: 0.6, ease: 'lin', keys: bust },
    },
    6,
  );
  T.add(
    {
      set: PORTN,
      grade: NIGHT,
      lb: false,
      actors: [{ id: 'hc', k: 'hero', p: [-8, 12], yaw: 200 }],
      st: { els: COCKPIT('p8') },
      cam: {
        fov: 62,
        hand: 0.03,
        keys: [
          { t: 0, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [4, -6], h: 3 } },
          { t: 5, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [6, -6], h: 3.2 } },
        ],
      },
      ev: [{ t: 0.05, sfx: 'glitch', vol: 0.3, rate: 0.9 }],
    },
    5,
  );
  T.add(
    {
      set: ROOM,
      grade: { ...RG, contrast: 1.36 },
      lb: false,
      st: { els: [CLIENT({ pose: veer ? 'p9' : 'p5', at: [720, 1820], h: 1900, in: null }), FOCUS(0, 0.35)] },
      cam: { fov: 34, dof: 1, focus: 0.9, range: 0.4, ease: 'out', keys: close },
    },
    4.5,
  );
  // 後果：發射設施的燈／封起來的門 → 燒掉的聚落／往東岸飛的運輸機 → 校準需要電纜（插畫格疊在夜的宇宙港上）
  const after = veer
    ? ['cx/x4_press', 'cx/x4_ash', 'c4/c4o_cable']
    : ['cx/x4_gate', 'cx/x4_planes', 'c4/c4o_cable'];
  after.forEach((img, i) =>
    T.add(
      {
        set: PORTN,
        grade: NIGHT,
        lb: false,
        st: {
          els: [
            PANEL(
              i % 2
                ? [
                    [60, 80],
                    [720, 80],
                    [660, 560],
                    [60, 560],
                  ]
                : [
                    [900, 80],
                    [1540, 80],
                    [1540, 560],
                    [840, 560],
                  ],
              { img, t0: 1.4, in: i % 2 ? 'left' : 'right', dots: 0.25 },
            ),
          ],
        },
        cam: {
          fov: 44,
          hand: 0.02,
          ease: 'lin',
          keys: [
            { t: 0, p: { g: [-12 + i * 6, 12], h: 2 + i }, l: { g: [8, -10], h: 5 + i * 2 } },
            { t: 6, p: { g: [-11 + i * 6, 10], h: 2.2 + i }, l: { g: [8, -10], h: 5.5 + i * 2 } },
          ],
        },
        ev:
          veer && i === 1 ? [{ t: 0.2, fx: 'smoke', at: { g: [6, -8], h: 0 }, r: 4, life: 8, rise: 6 }] : [],
      },
      6,
    ),
  );
  // 那天晚上，所有勢力的頻道都在討論東岸：東岸的插畫格（夜的宇宙港，往東看）
  T.add(
    {
      set: PORTN,
      grade: NIGHT,
      lb: false,
      st: {
        els: [
          PANEL(
            [
              [380, 120],
              [1220, 120],
              [1220, 780],
              [380, 780],
            ],
            { img: 'c4/c4o_coast', t0: 0.8, in: 'fade', ind: 0.6, dots: 0.25 },
          ),
        ],
      },
      cam: {
        fov: 46,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [0, 16], h: 8 }, l: { g: [30, 0], h: 4 } },
          { t: 5.6, p: { g: [0, 15], h: 8.5 }, l: { g: [30, 0], h: 4 } },
        ],
      },
    },
    5.6,
  );
  // 只有卡斯特隆寄了一封私人信：霍斯特的辦公室（信的插畫格 → 霍斯特的近景，他自己說）
  T.add(
    {
      set: OFFICE,
      grade: { ...OFFG, exposure: 1.25 },
      lb: false,
      actors: [PARKED('stevedore')],
      st: {
        els: [
          PANEL(
            [
              [900, 80],
              [1540, 80],
              [1540, 820],
              [820, 820],
            ],
            { img: 'c4/c4o_letter', t0: 0.6, dots: 0.2, tone: '#a0602a' },
          ),
        ],
      },
      cam: {
        fov: 50,
        ease: 'lin',
        keys: [
          { t: 0, p: [3.4, 2.4, 3.3], l: [-0.6, 1.2, -4] },
          { t: 5, p: [3.9, 2.6, 3.6], l: [-0.6, 1.2, -4] },
        ],
      },
    },
    5,
  );
  T.add(
    {
      set: OFFICE,
      grade: { ...OFFG, contrast: 1.36 },
      lb: false,
      fo: 1.5,
      actors: [PARKED('stevedore')],
      st: { els: [HORST({ pose: 'p9', at: [720, 1820], h: 1900, in: 'fade' })] },
      cam: {
        fov: 32,
        dof: 1,
        focus: 0.9,
        range: 0.4,
        ease: 'lin',
        keys: [
          { t: 0, p: [0.9, 1.6, 1.5], l: [-1.4, 1.4, -4] },
          { t: 11, p: [0.85, 1.6, 1.2], l: [-1.4, 1.42, -4] },
        ],
      },
    },
    11,
  );
  placeLines(T, [
    [0.6, TK[0][1], 5, TK[0][0]],
    [6.4, TK[1][1], 4.4, TK[1][0]],
    [11.3, TK[2][1], 4, TK[2][0]],
    [15.9, T0[0], 5.6, null],
    [21.9, T0[1], 5.6, null],
    [27.9, T0[2], 5.4, null],
    [33.8, T0[3], 5, null],
    [39.4, T0[4], 4.4, null],
    [44.6, T0[5], 9, 'castron'],
  ]);
  dropAll(T);
  return T.def({
    title: '第四章　章末',
    music: [{ at: 0, track: 'cine_c5', off: 60, vol: 0.8, fadeIn: 1, fadeOut: [T.at - 3, 3] }],
  });
}
