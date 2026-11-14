// 第 3 章的開場（3D 動畫化，docs/cine-redesign-design.md 第十節）：照第 2 章的做法。
// 場景：白天暴風雪的冰原（snow）、聖域在冰原邊緣的救援站（room sancta，render/cine-sancta.js）。
// 台詞＝CHAPTER_TEXT[3].intro（旁白）與 talks.js 的 intro_3（諾拉與 ECHO）；配樂 cine_c3。
import { CHAPTER_TEXT, pickLines } from '../story.js';
import { snapBeat } from './beats.js';
import { W, timeline } from './kit.js';
import { TALKS } from './talks.js';
import { ACT, FOCUS, LIVE, LOC, PANEL, ROOM_GRADE, SPEED, faceY, placeLines, dropAll } from './anime.js';

const ICE = '#8ec8f0';
// 白天的暴風雪（冰原）
// 原點在營地（半圓拱的小屋群）旁邊的平地；西邊是高丘
const SNOWD = W('snow', { seed: 6311, tod: 'day', anchor: [-43, -17], clear: 10 });
const STORM = {
  sunAz: 90, // 南邊（+Z）打光：鏡頭多半從南邊拍，機甲的正面是亮的
  sunEl: 18,
  sunK: 0.8,
  temp: 0.62,
  contrast: 1.25,
  sat: 0.6,
  tintHi: '#dceaff',
  tintHiK: 0.35,
  tintLo: '#1a2436',
  tintLoK: 0.45,
  grain: 0.35,
  vignette: 0.55,
  fogK: 0.7,
  bloom: 1.1,
};
// 救援站（暖色的提燈與串燈）
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
const NORA = (o) => ACT('sancta', o);

export function ch3Intro(ctx) {
  const T0 = pickLines(CHAPTER_TEXT[3].intro, (ctx && ctx.choices) || {});
  const TK = TALKS.intro_3.lines;
  const T = timeline();

  // 0:00 冰原的建立鏡頭（暴風雪）＋地點字卡＋地區的插畫格
  T.add(
    {
      set: SNOWD,
      grade: STORM,
      fi: 1.5,
      lb: false,
      st: {
        els: [
          ...LOC('西部冰原', 'WESTERN ICEFIELD', ICE),
          PANEL(
            [
              [1010, 470],
              [1560, 470],
              [1560, 840],
              [960, 840],
            ],
            {
              img: 'c3/c3i_region',
              t0: 4.2,
              kb: [
                { t: 4.2, z: 1.12 },
                { t: 7, z: 1.22 },
              ],
            },
          ),
        ],
      },
      cam: {
        fov: 44,
        hand: 0.03,
        keys: [
          { t: 0, p: { g: [-24, 30], h: 18 }, l: { g: [10, -20], h: 2 } },
          { t: 7, p: { g: [-12, 18], h: 6 }, l: { g: [10, -20], h: 3 }, fov: 38 },
        ],
      },
      ev: [{ t: 0.3, sfx: 'distant', vol: 0.3, rate: 0.5 }],
    },
    7,
  );
  // 0:07 失聯的營地：雪裡的人群（不動、背對）＋營地的插畫格
  T.add(
    {
      set: SNOWD,
      grade: { ...STORM, sat: 0.45 },
      lb: false,
      actors: [
        {
          id: 'cp',
          k: 'people',
          who: ['farmer', 'hooded', 'casual'],
          n: 6,
          p: [4, -4],
          box: [4, 2],
          anim: ['Idle'],
          dark: 0.6,
          s: [{ t: 0, face: [4, -40] }],
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
            { img: 'c3/c3i_camp', t0: 2.2, in: 'left', dots: 0.3, tone: '#6080a0' },
          ),
        ],
      },
      cam: {
        fov: 40,
        hand: 0.02,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [8, 6], h: 1.4 }, l: { g: [2, -8], h: 1.2 } },
          { t: 7, p: { g: [7, 4.5], h: 1.5 }, l: { g: [2, -8], h: 1.4 } },
        ],
      },
    },
    7,
  );
  // 0:14 救援站：鏡頭穿過帳篷（旁白：聖域第一次向傭兵發出委託）
  T.add(
    {
      set: STATION,
      grade: STG,
      lb: false,
      fi: 0.25,
      cam: {
        fov: 52,
        ease: 'lin',
        keys: [
          { t: 0, p: [0, 1.7, -6.2], l: [0, 1.3, 4] },
          { t: 5, p: [0, 1.6, -3.8], l: [0, 1.3, 4] },
        ],
      },
      ev: [{ t: 0.2, sfx: 'door', vol: 0.25, rate: 0.7 }],
    },
    5,
  );

  // ---------- 0:19 諾拉 ----------
  const TALK0 = T.at;
  T.add(
    {
      set: STATION,
      grade: STG,
      lb: false,
      st: { els: [NORA({ pose: 'p1', at: [560, 1240], h: 1180 })] },
      cam: {
        fov: 42,
        dof: 1,
        focus: 1.2,
        range: 0.6,
        ease: 'lin',
        keys: [
          { t: 0, p: [1.4, 1.6, 4.4], l: [-0.6, 1.2, -6] },
          { t: 6, p: [1.0, 1.6, 3.6], l: [-0.6, 1.2, -6] },
        ],
      },
    },
    6,
  );
  // 插入：走進風雪的人（3D）＋諾拉的臉的格子
  T.add(
    {
      set: SNOWD,
      grade: STORM,
      lb: false,
      actors: [
        {
          id: 'rf',
          k: 'people',
          who: ['farmer', 'casual', 'hoodie', 'hooded', 'man', 'suitw'],
          n: 12,
          p: [6, 0],
          box: [6, 3],
          anim: ['Walk'],
          go: [-26, -4],
          s: [{ t: 0, face: [-40, -4] }],
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
              t0: 1.4,
              fill: '#16121a',
              dots: 0.15,
              kids: [NORA({ pose: 'p7', at: [1290, faceY(270, 1800)], h: 1800, in: null })],
            },
          ),
        ],
      },
      cam: {
        fov: 38,
        hand: 0.03,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [-8, 8], h: 1.3 }, l: { g: [4, 0], h: 0.9 } },
          { t: 8, p: { g: [-12, 7], h: 1.4 }, l: { g: [-6, -2], h: 1 } },
        ],
      },
    },
    8,
  );
  // ECHO：駕駛艙（擋風窗外是暴風雪）
  T.add(
    {
      set: SNOWD,
      grade: STORM,
      lb: false,
      actors: [{ id: 'hc', k: 'hero', p: [12, 10], yaw: 240 }],
      st: {
        els: [
          { k: 'art', art: 'cockpit', q: [-40, -20, 1680, 940] },
          {
            k: 'actor',
            who: 'echo',
            pose: 'p3',
            expr: 'think',
            at: [1360, 1060],
            h: 740,
            in: 'fade',
            holo: '#7fc8ff',
            noBub: true,
          },
        ],
      },
      cam: {
        fov: 62,
        hand: 0.04,
        keys: [
          { t: 0, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [-20, -10], h: 2 } },
          { t: 4.5, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [-22, -10], h: 2.4 } },
        ],
      },
      ev: [{ t: 0.05, sfx: 'glitch', vol: 0.35, rate: 0.9 }],
    },
    4.5,
  );
  // 救援站：諾拉的近景（變焦衝擊）
  T.add(
    {
      set: STATION,
      grade: { ...STG, contrast: 1.36 },
      lb: false,
      st: {
        els: [
          NORA({ pose: 'p5', at: [720, 1820], h: 1900, in: null }),
          FOCUS(0, 0.35, 'rgba(255,230,200,0.3)'),
        ],
      },
      cam: {
        fov: 34,
        dof: 1,
        focus: 0.9,
        range: 0.4,
        ease: 'out',
        keys: [
          { t: 0, p: [0.8, 1.55, 2.8], l: [-1.6, 1.3, -4], fov: 40 },
          { t: 0.35, p: [0.8, 1.55, 2.5], l: [-1.6, 1.3, -4], fov: 30 },
          { t: 7.5, p: [0.75, 1.55, 2.3], l: [-1.6, 1.32, -4], fov: 28 },
        ],
      },
      ev: [{ t: 0, sfx: 'thud1', vol: 0.3, rate: 1.2 }],
    },
    7.5,
  );
  // 0:45 名單白板（3D 的特寫：打勾與紅叉）
  T.add(
    {
      set: STATION,
      grade: STG,
      lb: false,
      cam: {
        fov: 34,
        dof: 1,
        focus: 1.6,
        range: 0.5,
        ease: 'lin',
        keys: [
          { t: 0, p: [-1.0, 1.35, -1.6], l: [-2.6, 1.15, -2.7] },
          { t: 6, p: [-1.25, 1.3, -1.85], l: [-2.6, 1.15, -2.7] },
        ],
      },
    },
    6,
  );
  // 0:51 暴風雪裡的 R-07（仰角）：武器垂下、頭左右張望
  T.add(
    {
      set: SNOWD,
      grade: STORM,
      lb: false,
      actors: [{ id: 'hx', k: 'hero', p: [2, 2], yaw: 180, s: [{ t: 0, lower: true, scan: 0.6, per: 4 }] }],
      cam: {
        fov: 32,
        hand: 0.05,
        ease: 'lin',
        keys: [
          { t: 0, p: { a: 'hx', at: 'base', o: [1.5, 0.35, 8] }, l: { a: 'hx', o: [0, 1.7, 0] } },
          { t: 6, p: { a: 'hx', at: 'base', o: [1.2, 0.3, 6.4] }, l: { a: 'hx', o: [0, 2, 0] } },
        ],
      },
    },
    6,
  );
  // 0:57 WHITEOUT 登場（雪地的狙擊手；仰角推近、一拍二）＋立繪與名牌
  T.add(
    {
      set: SNOWD,
      grade: { ...STORM, contrast: 1.38 },
      lb: false,
      koma: 2,
      actors: [
        { id: 'wo', k: 'ace', key: 'whiteout', p: [-6, -6], yaw: 160, s: [{ t: 0, scan: 0.4, per: 3 }] },
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
            color: ICE,
            in: 'wipe',
            ind: 0.25,
            t0: 1.6,
            a: 0.92,
          },
          ACT('whiteout', { pose: 'p1', at: [1360, 1180], h: 1250, t0: 1.7, in: 'right', par: 0 }),
          {
            k: 'text',
            s: 'WHITEOUT',
            at: [80, 760],
            size: 120,
            font: 'title',
            al: 'left',
            color: '#f4f8ff',
            stroke: '#000',
            sw: 8,
            t0: 2.0,
            in: 'stamp',
            ls: 10,
          },
          {
            k: 'text',
            s: 'RIVAL ／ 難民營出身的狙擊手',
            at: [86, 820],
            size: 26,
            al: 'left',
            color: ICE,
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
          { t: 0, p: { a: 'wo', at: 'base', o: [-3, 0.4, 7] }, l: { a: 'wo', o: [0, 1.5, 0] } },
          { t: 5, p: { a: 'wo', at: 'base', o: [-2.4, 0.35, 5.2] }, l: { a: 'wo', o: [1, 2.2, 0] }, fov: 26 },
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
  // R-07 出發：側面跟拍＋速度線（一拍二）
  T.add(
    {
      set: SNOWD,
      grade: { ...STORM, contrast: 1.32 },
      lb: false,
      koma: 2,
      actors: [{ id: 'hx2', k: 'hero', p: [6, 14], yaw: 0, s: [{ t: 0, go: [6, -30], ab: true }] }],
      st: { els: [SPEED(0, 2.5, 0.3)] },
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
  // PV 式章名卡：冰原的剪影（乘上冰藍）
  const TT = T.at;
  const cb = (t) => +(snapBeat('cine_c3', TT + t) - TT).toFixed(3);
  T.add(
    {
      set: SNOWD,
      grade: STORM,
      lb: false,
      fo: 0.8,
      st: {
        bg: ICE,
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
            s: 'BENEATH THE ICE',
            at: [1530, 600],
            size: 36,
            font: 'mono',
            al: 'right',
            color: ICE,
            stroke: null,
            t0: 0.5,
            in: 'fade',
            ls: 8,
          },
          {
            k: 'text',
            s: 'CHAPTER 3',
            at: [140, 690],
            size: 54,
            font: 'title',
            al: 'left',
            color: '#f4f8ff',
            stroke: null,
            t0: 0.55,
            in: 'left',
            ls: 12,
          },
          {
            k: 'text',
            s: '冰原之下',
            at: [130, 790],
            size: 120,
            al: 'left',
            color: '#f4f8ff',
            stroke: null,
            t0: cb(0.8),
            in: 'stamp',
            ls: 14,
          },
        ],
      },
      cam: {
        fov: 40,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [0, 20], h: 0.6 }, l: { g: [0, -30], h: 8 } },
          { t: 5, p: { g: [0, 19], h: 0.6 }, l: { g: [0, -30], h: 8.5 } },
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
    [1.0, T0[0], 5, null],
    [7.4, T0[1], 6.6, null],
    [14.4, T0[2], 4.5, null],
    [TALK0 + 0.4, TK[0][1], 5.2, TK[0][0]],
    [TALK0 + 6.4, TK[1][1], 7.4, TK[1][0]],
    [TALK0 + 14.4, TK[2][1], 4, TK[2][0]],
    [TALK0 + 18.9, TK[3][1], 7, TK[3][0]],
    [TALK0 + 26.3, T0[3], 5.6, null],
    [TALK0 + 32.3, T0[4], 5.6, null],
  ]);
  dropAll(T);
  return T.def({
    title: '第三章　開場',
    music: [{ at: 0, track: 'cine_c3', vol: 0.8, fadeIn: 1, fadeOut: [T.at - 2.5, 2.5] }],
  });
}
