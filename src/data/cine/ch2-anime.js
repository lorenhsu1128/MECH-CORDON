// 第 2 章的開場與章末（3D 動畫化，docs/cine-redesign-design.md 第十節）：照第 1 章開場的試做的做法——
// 3D 與 2D 漫畫混合、動作鏡頭一拍二、對白用字幕條、立繪疊在 3D 的室內（景深、視差）。
// 台詞＝CHAPTER_TEXT（旁白）與 talks.js 的對話（語音以台詞的字為鍵，所以字要一樣）；配樂 cine_c2。
// 場景：開場＝集散場（industrial）、水壩（dam）、艾瑟立克的研究所（room aetheric）＋霍斯特的辦公室（room castron，窗外停著
// STEVEDORE）；章末＝依抉擇 c2。
import { CHAPTER_TEXT, pickLines } from '../story.js';
import { snapBeat } from './beats.js';
import { W, timeline } from './kit.js';
import { TALKS } from './talks.js';
import {
  ACT,
  FOCUS,
  IMPACT,
  LAB,
  LIVE,
  LOC,
  OFFICE,
  PANEL,
  PARKED,
  ROOM_GRADE,
  SPEED,
  faceY,
  placeLines,
  dropAll,
} from './anime.js';

const ORANGE = '#d8903a',
  CYAN = '#5fd0ff';
// 集散場（黃昏）、水壩（入夜前）
const YARD = W('industrial', { seed: 6211, tod: 'dusk', clear: 14 });
// 水壩：原點在下游的河岸（壩頂在北邊約 20 單位、−Z 是水庫），電磁砲台架在壩前
const DAM = W('dam', { seed: 6212, tod: 'dusk', anchor: [35, -20], clear: 10 });
const DUSK = {
  sunAz: 250,
  sunEl: 10,
  sunWarm: 0.9,
  temp: 0.38,
  contrast: 1.3,
  sat: 0.85,
  tintHi: '#ffb070',
  tintHiK: 0.45,
  tintLo: '#1a1420',
  tintLoK: 0.4,
  grain: 0.3,
  vignette: 0.5,
  fogK: 1.1,
  bloom: 1.1,
};
const LABG = { ...ROOM_GRADE, temp: 0.62, tintHi: '#d8f4ff', tintHiK: 0.35, tintLo: '#0a1622', tintLoK: 0.5 };
const OFFG = { ...ROOM_GRADE, tintHi: '#ffb070', tintHiK: 0.4, tintLo: '#101826', tintLoK: 0.5 };
// 薩奇（艾瑟立克）的立繪；霍斯特
const SAKKI = (o) => ACT('aetheric', o);
const HORST = (o) => ACT('castron', o);
// 電磁砲台：壩前的河岸，砲口朝南（下游、集散場的方向）
const RAIL = { id: 'rg', k: 'model', key: 'railgun', p: [0, -8], yaw: 180, scale: 2.5, pal: 'boss' };
// 水壩的鏡頭：太陽從南邊（+Z）照，壩的下游面與砲台的正面是亮的（WEST 那種北邊的夕陽會讓整面壩變成黑的）
const DAMG = { ...DUSK, sunAz: 90, sunEl: 16 };

// ---------- 開場 ----------
export function ch2Intro(ctx) {
  const T0 = pickLines(CHAPTER_TEXT[2].intro, (ctx && ctx.choices) || {});
  const TK = TALKS.intro_2.lines;
  const T = timeline();
  const B = (t) => +snapBeat('cine_c2', t).toFixed(3);

  // 0:00 集散場的建立鏡頭（吊臂鏡頭降下）＋地點字卡；4.6 秒地區的插畫格滑進來
  T.add(
    {
      set: YARD,
      grade: DUSK,
      fi: 1.5,
      lb: false,
      st: {
        els: [
          ...LOC('中部工業帶', 'CENTRAL INDUSTRIAL BELT', ORANGE),
          PANEL(
            [
              [1010, 470],
              [1560, 470],
              [1560, 840],
              [960, 840],
            ],
            {
              img: 'c2/c2i_region',
              t0: B(4.6),
              kb: [
                { t: 4.6, z: 1.15 },
                { t: 8, z: 1.25 },
              ],
            },
          ),
        ],
      },
      cam: {
        fov: 44,
        hand: 0.02,
        keys: [
          { t: 0, p: { g: [-18, 26], h: 14 }, l: { g: [8, -18], h: 3 } },
          { t: 8, p: { g: [-8, 14], h: 4.5 }, l: { g: [8, -18], h: 4 }, fov: 38 },
        ],
      },
      ev: [{ t: 0.4, sfx: 'distant', vol: 0.3, rate: 0.6 }],
    },
    8,
  );
  // 0:08 艾瑟立克的研究所：封存艙裡的天線核心（鏡頭慢慢繞過去）
  T.add(
    {
      set: LAB,
      grade: LABG,
      lb: false,
      fi: 0.2,
      st: { els: [...LOC('艾瑟立克研究所', 'AETHERIC LABORATORY', CYAN, 0.6)] },
      cam: {
        fov: 40,
        ease: 'lin',
        keys: [
          { t: 0, p: [3.6, 1.5, 3.0], l: [0, 2.0, -1.2] },
          { t: 6, p: [2.2, 1.9, 2.4], l: [0, 2.1, -1.2], fov: 34 },
        ],
      },
      ev: [{ t: 0.1, sfx: 'glitch', vol: 0.2, rate: 0.6 }],
    },
    6,
  );
  // 0:14 霍斯特的辦公室：窗外停著 STEVEDORE；霍斯特背對鏡頭看著窗外（立繪暗一點）
  T.add(
    {
      set: OFFICE,
      grade: OFFG,
      lb: false,
      actors: [PARKED('stevedore')],
      st: { els: [HORST({ pose: 'p7', at: [1120, 1240], h: 1180, dim: 0.25 })] },
      cam: {
        fov: 42,
        dof: 1,
        focus: 1.4,
        range: 0.7,
        ease: 'lin',
        keys: [
          { t: 0, p: [-1.8, 1.7, 2.6], l: [1.6, 2.6, -8] },
          { t: 6, p: [-1.3, 1.7, 1.9], l: [1.6, 2.8, -8] },
        ],
      },
    },
    6,
  );
  // 0:20 水壩的河谷：電磁砲台的仰角（一拍二）→ 砲身蓄力 → 衝擊畫格 → 漫畫頁疊在 3D 上
  T.add(
    {
      set: DAM,
      grade: { ...DAMG, contrast: 1.38, sat: 0.7 },
      lb: false,
      koma: 2,
      actors: [RAIL],
      cam: {
        fov: 30,
        hand: 0.03,
        keys: [
          { t: 0, p: { a: 'rg', at: 'base', o: [5, 0.4, 13] }, l: { a: 'rg', at: 'base', o: [0, 2.2, 0] } },
          {
            t: 1.8,
            p: { a: 'rg', at: 'base', o: [4.4, 0.35, 11.5] },
            l: { a: 'rg', at: 'base', o: [0, 3.2, 0] },
            fov: 26,
          },
        ],
      },
      ev: [
        { t: 0.1, sfx: 'heavy', vol: 0.7, rate: 0.5 },
        { t: 0.8, sfx: 'alarm', vol: 0.25, rate: 0.6 },
      ],
    },
    1.8,
  );
  T.add(
    {
      set: DAM,
      grade: { ...DAMG, contrast: 1.45, sat: 0.6, chroma: 0.3 },
      lb: false,
      koma: 2,
      keep: true,
      st: { els: [FOCUS(0, 1.6, 'rgba(160,230,255,0.35)', 0.35)] },
      cam: {
        fov: 24,
        hand: 0.02,
        keys: [
          {
            t: 0,
            p: { a: 'rg', at: 'base', o: [-3.2, 2.6, 2.5] },
            l: { a: 'rg', at: 'base', o: [0.3, 1.8, 11] },
          },
          {
            t: 1.6,
            p: { a: 'rg', at: 'base', o: [-3, 2.7, 3] },
            l: { a: 'rg', at: 'base', o: [0.3, 1.9, 11] },
          },
        ],
      },
      ev: [
        { t: 0.1, fx: 'ring', at: { a: 'rg', at: 'base', o: [0, 2, 5.5] }, r: 3, color: 0x7fd8ff },
        { t: 0.6, fx: 'flash', at: { a: 'rg', at: 'base', o: [0, 2, 6] }, r: 2, color: 0x9ff0ff },
        { t: 0.2, sfx: 'boostUp', vol: 0.5, rate: 0.5 },
      ],
    },
    1.6,
  );
  T.add(
    {
      set: DAM,
      grade: DUSK,
      lb: false,
      keep: true,
      st: IMPACT(),
      cam: {
        fov: 34,
        keys: [
          { t: 0, p: { a: 'rg', at: 'base', o: [7, 1, 12] }, l: { a: 'rg', at: 'base', o: [0, 2.4, 3] } },
        ],
      },
      ev: [
        { t: 0, fx: 'flash', at: { a: 'rg', at: 'base', o: [0, 2, 6.5] }, r: 6, color: 0xbff4ff },
        { t: 0, sfx: 'boom1', vol: 1, rate: 0.7 },
        { t: 0, shake: 0.6 },
      ],
    },
    0.35,
  );
  const PG = T.at; // 漫畫頁從這裡開始（卡點用）
  const pb = (t) => +(snapBeat('cine_c2', PG + t) - PG).toFixed(3);
  T.add(
    {
      set: DAM,
      grade: { ...DAMG, contrast: 1.35 },
      lb: false,
      keep: true,
      koma: 2,
      actors: [
        {
          id: 'gd',
          k: 'people',
          who: ['soldier', 'soldier', 'soldier'],
          n: 5,
          p: [-8, 4],
          box: [4, 1.2],
          anim: ['Idle_Gun_Pointing', 'Idle'],
          s: [{ t: 0, face: [0, -30] }],
        },
      ],
      st: {
        page: 'c2page',
        pg: {
          keys: [
            { t: 0, z: 1 },
            { t: 8.3, z: 1.05, x: 820, y: 450 },
          ],
        },
        shake: [[pb(0.4), 0.5, 0.4]],
        els: [
          { k: 'block', q: [-200, -200, 2000, 1300], color: 'rgba(4,8,14,0.45)', t0: pb(0.35), in: 'fade' },
          // ① 河谷裡的爆炸
          PANEL(
            [
              [60, 50],
              [900, 50],
              [840, 470],
              [60, 470],
            ],
            {
              in: 'drop',
              t0: pb(0.35),
              live: true,
              dots: 0.2,
              flt: 'contrast(1.3)',
              cam: {
                fov: 36,
                hand: 0.05,
                ease: 'lin',
                keys: [
                  { t: 0, p: { g: [-4, -2], h: 3 }, l: { g: [6, -16], h: 3 } },
                  { t: 9, p: { g: [-3.5, -3], h: 3.4 }, l: { g: [5, -16], h: 4 } },
                ],
              },
              kids: [
                {
                  k: 'text',
                  s: '轟',
                  at: [470, 290],
                  size: 230,
                  color: '#d8f4ff',
                  stroke: '#04121c',
                  rot: -0.1,
                  t0: pb(0.4),
                  in: 'stamp',
                },
              ],
            },
          ),
          // ② 封鎖：電磁砲台的插畫
          PANEL(
            [
              [930, 50],
              [1540, 50],
              [1540, 520],
              [880, 520],
            ],
            { img: 'c2/c2i_railgun', t0: pb(2.6), dots: 0.3, tone: '#3a7aa0' },
          ),
          // ③ 艾瑟立克的警衛（3D、自己的鏡頭）
          PANEL(
            [
              [60, 500],
              [800, 500],
              [760, 850],
              [60, 850],
            ],
            {
              in: 'left',
              t0: pb(4.6),
              live: true,
              dots: 0.25,
              flt: 'contrast(1.3) saturate(0.7)',
              cam: {
                fov: 32,
                hand: 0.02,
                ease: 'lin',
                keys: [
                  { t: 0, p: { g: [-8, 10], h: 1.2 }, l: { g: [-8, 4], h: 1.4 } },
                  { t: 9, p: { g: [-7.6, 9.4], h: 1.25 }, l: { g: [-8, 4], h: 1.5 } },
                ],
              },
            },
          ),
        ],
      },
      cam: {
        fov: 42,
        hand: 0.04,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [-10, 14], h: 7 }, l: { g: [4, -16], h: 4 } },
          { t: 8.3, p: { g: [-12, 13], h: 8 }, l: { g: [2, -16], h: 5 } },
        ],
      },
      ev: [
        { t: 0.1, boom: { g: [6, -16], h: 0 }, big: true },
        { t: 0.2, fx: 'smoke', at: { g: [6, -16], h: 0 }, r: 4, life: 8, rise: 9 },
        { t: pb(2.6), sfx: 'thud1', vol: 0.45, rate: 0.8 },
        { t: pb(4.6), sfx: 'thud1', vol: 0.45, rate: 0.7 },
      ],
    },
    8.3,
  );

  // ---------- 0:32 薩奇 ----------
  const TALK0 = T.at;
  T.add(
    {
      set: LAB,
      grade: LABG,
      lb: false,
      fi: 0.2,
      st: { els: [SAKKI({ pose: 'p1', at: [560, 1240], h: 1180, s: [{ t: 5.5, pose: 'p3' }] })] },
      cam: {
        fov: 40,
        dof: 1,
        focus: 1.2,
        range: 0.6,
        ease: 'lin',
        keys: [
          { t: 0, p: [-2.6, 1.7, 4.2], l: [0, 2.0, -1.2] },
          { t: 9.8, p: [-1.8, 1.7, 3.4], l: [0, 2.0, -1.2] },
        ],
      },
    },
    9.8,
  );
  // ECHO：駕駛艙（擋風窗外是 3D 的集散場）
  T.add(
    {
      set: YARD,
      grade: { ...DUSK, exposure: 0.9 },
      lb: false,
      actors: [{ id: 'hc', k: 'hero', p: [0, 6], yaw: 200 }],
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
        hand: 0.03,
        keys: [
          { t: 0, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [10, -40], h: 6 } },
          { t: 5.8, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [12, -40], h: 7 } },
        ],
      },
      ev: [{ t: 0.05, sfx: 'glitch', vol: 0.35, rate: 0.9 }],
    },
    5.8,
  );
  // 插入：主壩（3D 的大遠景）＋薩奇的臉的格子
  T.add(
    {
      set: DAM,
      grade: { ...DAMG, exposure: 0.85 },
      lb: false,
      actors: [RAIL],
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
              t0: 1.2,
              fill: '#06121c',
              dots: 0.15,
              kids: [SAKKI({ pose: 'p1', at: [1290, faceY(270, 1800)], h: 1800, in: null })],
            },
          ),
        ],
      },
      cam: {
        fov: 46,
        hand: 0.02,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [-22, 22], h: 12 }, l: { g: [0, -20], h: 4 } },
          { t: 7.2, p: { g: [-18, 18], h: 10 }, l: { g: [0, -20], h: 5 } },
        ],
      },
    },
    7.2,
  );
  // 研究所：薩奇的近景（變焦衝擊）→ 「觀察紀錄」的字蓋上來
  T.add(
    {
      set: LAB,
      grade: { ...LABG, contrast: 1.38 },
      lb: false,
      st: {
        els: [
          SAKKI({ pose: 'p9', at: [720, 1820], h: 1900, in: null }),
          FOCUS(0, 0.35, 'rgba(200,240,255,0.35)'),
          {
            k: 'text',
            s: 'SUBJECT: R-07 ／ OBSERVATION LOG',
            at: [1540, 820],
            size: 26,
            font: 'mono',
            al: 'right',
            color: CYAN,
            stroke: null,
            ls: 6,
            t0: 3.6,
            in: 'fade',
          },
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
          { t: 5.8, p: [-1.15, 1.7, 2.1], l: [1.2, 1.82, -3], fov: 28 },
        ],
      },
      ev: [{ t: 0, sfx: 'thud1', vol: 0.3, rate: 1.2 }],
    },
    5.8,
  );

  // ---------- 1:00 兩家都要你 ----------
  // 集散場：R-07 站在貨櫃之間（仰角）；左右兩格是霍斯特與薩奇
  const HX = {
    id: 'hx',
    k: 'hero',
    p: [3, 0],
    yaw: 180,
    s: [{ t: 0, lower: true, scan: 0.5, per: 4 }],
  };
  T.add(
    {
      set: YARD,
      grade: DUSK,
      lb: false,
      actors: [HX],
      st: {
        els: [
          PANEL(
            [
              [40, 60],
              [520, 60],
              [470, 840],
              [40, 840],
            ],
            {
              in: 'left',
              t0: 1.0,
              fill: '#1a0e06',
              kids: [HORST({ pose: 'p7', at: [280, 1320], h: 1300, in: null })],
            },
          ),
          PANEL(
            [
              [1130, 60],
              [1560, 60],
              [1560, 840],
              [1080, 840],
            ],
            { t0: 2.2, fill: '#061420', kids: [SAKKI({ pose: 'p3', at: [1330, 1320], h: 1300, in: null })] },
          ),
        ],
      },
      cam: {
        fov: 34,
        hand: 0.03,
        ease: 'lin',
        keys: [
          { t: 0, p: { a: 'hx', at: 'base', o: [1.5, 0.4, 8] }, l: { a: 'hx', o: [0, 1.6, 0] } },
          { t: 6, p: { a: 'hx', at: 'base', o: [1.2, 0.35, 6.5] }, l: { a: 'hx', o: [0, 1.9, 0] } },
        ],
      },
      ev: [
        { t: 1.0, sfx: 'thud1', vol: 0.4, rate: 0.9 },
        { t: 2.2, sfx: 'thud1', vol: 0.4, rate: 0.8 },
      ],
    },
    6,
  );
  // STEVEDORE 登場：貨櫃堆前的仰角推近（一拍二）→ 立繪格與名牌
  T.add(
    {
      set: YARD,
      grade: { ...DUSK, contrast: 1.4, sat: 0.8 },
      lb: false,
      koma: 2,
      actors: [{ id: 'sv', k: 'ace', key: 'stevedore', p: [-5, -4], yaw: 160, s: [{ t: 0, chk: true }] }],
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
            color: ORANGE,
            in: 'wipe',
            ind: 0.25,
            t0: 1.8,
            a: 0.92,
          },
          ACT('stevedore', { pose: 'p1', at: [1360, 1180], h: 1250, t0: 1.9, in: 'right', par: 0 }),
          {
            k: 'text',
            s: 'STEVEDORE',
            at: [80, 760],
            size: 120,
            font: 'title',
            al: 'left',
            color: '#f4ece0',
            stroke: '#000',
            sw: 8,
            t0: 2.2,
            in: 'stamp',
            ls: 10,
          },
          {
            k: 'text',
            s: 'RIVAL ／ 卡斯特隆的碼頭工頭',
            at: [86, 820],
            size: 26,
            al: 'left',
            color: ORANGE,
            stroke: '#000',
            sw: 4,
            t0: 2.5,
            in: 'fade',
            ls: 4,
          },
        ],
      },
      cam: {
        fov: 30,
        hand: 0.04,
        keys: [
          { t: 0, p: { a: 'sv', at: 'base', o: [-3, 0.4, 7] }, l: { a: 'sv', o: [0, 1.5, 0] } },
          {
            t: 5,
            p: { a: 'sv', at: 'base', o: [-2.4, 0.35, 5.2] },
            l: { a: 'sv', o: [1, 2.2, 0] },
            fov: 26,
          },
        ],
      },
      ev: [
        { t: 0.2, sfx: 'heavy', vol: 0.8, rate: 0.55 },
        { t: 2.2, sfx: 'thud1', vol: 0.7, rate: 0.6 },
        { t: 2.25, shake: 0.2 },
      ],
    },
    5,
  );
  // R-07 出發：側面跟拍＋速度線（一拍二）
  T.add(
    {
      set: YARD,
      grade: { ...DUSK, contrast: 1.32 },
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
  // PV 式章名卡：水壩與電磁砲台的剪影（3D 的天空變白、剪影變黑，乘上橘色）
  const TT = T.at;
  const cb = (t) => +(snapBeat('cine_c2', TT + t) - TT).toFixed(3);
  T.add(
    {
      set: DAM,
      grade: DUSK,
      lb: false,
      fo: 0.8,
      actors: [RAIL],
      st: {
        bg: ORANGE,
        els: [
          LIVE({ gco: 'multiply', flt: 'grayscale(1) contrast(14) brightness(1.5)', k: 'block' }),
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
            s: 'THE INDUSTRIAL CONTRACT',
            at: [1530, 600],
            size: 36,
            font: 'mono',
            al: 'right',
            color: ORANGE,
            stroke: null,
            t0: 0.5,
            in: 'fade',
            ls: 8,
          },
          {
            k: 'text',
            s: 'CHAPTER 2',
            at: [140, 690],
            size: 54,
            font: 'title',
            al: 'left',
            color: '#f4ece0',
            stroke: null,
            t0: 0.55,
            in: 'left',
            ls: 12,
          },
          {
            k: 'text',
            s: '工業帶的契約',
            at: [130, 790],
            size: 120,
            al: 'left',
            color: '#f4ece0',
            stroke: null,
            t0: cb(0.8),
            in: 'stamp',
            ls: 14,
          },
        ],
      },
      cam: {
        fov: 34,
        ease: 'lin',
        keys: [
          { t: 0, p: { a: 'rg', at: 'base', o: [6, 0.3, 30] }, l: { a: 'rg', at: 'base', o: [0, 7, 0] } },
          { t: 5, p: { a: 'rg', at: 'base', o: [5.6, 0.3, 29] }, l: { a: 'rg', at: 'base', o: [0, 7.3, 0] } },
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

  // 對白（旁白用 narr 的語音；薩奇與 ECHO 的對話照 talks.js）
  placeLines(T, [
    [1.0, T0[0], 5, null],
    [8.4, T0[1], 5.4, null],
    [14.4, T0[2], 5.4, null],
    [20.3, T0[3], 9.5, null],
    [TALK0 + 0.5, TK[0][1], 8.8, TK[0][0]],
    [TALK0 + 10.2, TK[1][1], 5, TK[1][0]],
    [TALK0 + 16.0, TK[2][1], 6.6, TK[2][0]],
    [TALK0 + 23.3, TK[3][1], 5, TK[3][0]],
    [TALK0 + 29.2, T0[4], 5.2, null],
  ]);
  dropAll(T);
  return T.def({
    title: '第二章　開場',
    music: [{ at: 0, track: 'cine_c2', vol: 0.8, fadeIn: 1, fadeOut: [T.at - 2.5, 2.5] }],
  });
}

// ---------- 章末（依抉擇 c2：castron＝守了卡斯特隆的約、aetheric＝把主壩交給艾瑟立克）----------
// 委託方在自己的室內 → ECHO 在夜裡的水壩回話 → 燈亮了的室內（插畫格）→ 閘門／乾掉的河道 → 雪原上往西走的難民（3D 的人群）
// → 車隊／懸賞 → 駕駛艙的 ECHO → 冰原的難民營停止回訊
// 夜的光線（World.applyLight 之後蓋上去：深藍的天空與霧、弱的月光）
const NIGHT_L = { sky: 0x060a14, fog: 0x0a1426, sun: 0x9ab8ff, sunI: 0.7, hemi: 0x5a6a8a, hemiI: 0.55 };
const SNOW = W('snow', { seed: 6221, tod: 'night', clear: 30, light: NIGHT_L });
const DAMN = W('dam', { seed: 6212, tod: 'night', anchor: [35, -20], clear: 10, light: NIGHT_L });
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
  // 夜：壓暗（地圖有最低亮度，docs/brightness-design.md）、天空用主題的顏色
  exposure: 1.0,
  sky: 'theme',
  fogColor: '#0a1426',
  fogColorK: 0.92,
  hfog: 0,
};
const OUT_CAM = {
  castron: {
    bust: [
      { t: 0, p: [1.7, 1.7, 2.8], l: [-0.6, 1.35, -4] },
      { t: 6, p: [1.1, 1.65, 1.9], l: [-0.6, 1.35, -4] },
    ],
    close: [
      { t: 0, p: [0.9, 1.6, 1.6], l: [-1.4, 1.4, -4], fov: 40 },
      { t: 0.35, p: [0.9, 1.6, 1.3], l: [-1.4, 1.4, -4], fov: 30 },
      { t: 4, p: [0.85, 1.6, 1.15], l: [-1.4, 1.42, -4], fov: 29 },
    ],
    wide: [
      { t: 0, p: [3.4, 2.4, 3.3], l: [-0.6, 1.2, -4] },
      { t: 6, p: [3.9, 2.6, 3.6], l: [-0.6, 1.2, -4] },
    ],
  },
  aetheric: {
    bust: [
      { t: 0, p: [-2.6, 1.7, 4.2], l: [0, 2.0, -1.2] },
      { t: 6, p: [-1.8, 1.7, 3.4], l: [0, 2.0, -1.2] },
    ],
    close: [
      { t: 0, p: [-1.2, 1.7, 2.6], l: [1.2, 1.8, -3], fov: 40 },
      { t: 0.35, p: [-1.2, 1.7, 2.3], l: [1.2, 1.8, -3], fov: 30 },
      { t: 4, p: [-1.15, 1.7, 2.1], l: [1.2, 1.82, -3], fov: 28 },
    ],
    wide: [
      { t: 0, p: [4.5, 2.6, 4], l: [0, 1.8, -1.2] },
      { t: 6, p: [5, 2.9, 4.3], l: [0, 1.8, -1.2] },
    ],
  },
};
const COCKPIT = (pose, s) => [
  { k: 'art', art: 'cockpit', q: [-40, -20, 1680, 940] },
  { k: 'actor', who: 'echo', pose, at: [1360, 1060], h: 740, in: 'fade', holo: '#7fc8ff', noBub: true, s },
];
export function ch2Outro(ctx) {
  const cas = ((ctx && ctx.choices) || {}).c2 !== 'aetheric';
  // 沒有抉擇紀錄（劇場、測試）時照這一條路線補上
  const T0 = pickLines(CHAPTER_TEXT[2].outro, {
    ...((ctx && ctx.choices) || {}),
    c2: cas ? 'castron' : 'aetheric',
  });
  const TK = TALKS.outro_2[cas ? 'castron' : 'aetheric'].lines;
  const who = cas ? 'castron' : 'aetheric';
  const ROOM = cas ? OFFICE : LAB;
  const RG = cas ? { ...OFFG, exposure: 1.25 } : LABG;
  const CC = OUT_CAM[who];
  const CLIENT = (o) => ACT(who, o);
  const roomActors = cas ? [PARKED('stevedore')] : [];
  const T = timeline();

  // 委託方（近景，景深）
  T.add(
    {
      set: ROOM,
      grade: RG,
      lb: false,
      fi: 0.6,
      actors: roomActors,
      st: { els: [CLIENT({ pose: cas ? 'p1' : 'p3', at: [560, 1240], h: 1180 })] },
      cam: { fov: 40, dof: 1, focus: 1.2, range: 0.6, ease: 'lin', keys: CC.bust },
    },
    6,
  );
  // ECHO：駕駛艙（擋風窗外是夜裡的水壩）
  T.add(
    {
      set: DAMN,
      grade: NIGHT,
      lb: false,
      actors: [{ id: 'hc', k: 'hero', p: [-6, 14], yaw: 0 }],
      st: { els: COCKPIT('p8') },
      cam: {
        fov: 62,
        hand: 0.03,
        keys: [
          { t: 0, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [0, -24], h: 8 } },
          { t: 5, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: { g: [2, -24], h: 9 } },
        ],
      },
      ev: [{ t: 0.05, sfx: 'glitch', vol: 0.35, rate: 0.9 }],
    },
    5,
  );
  // 委託方的近景（變焦衝擊）
  T.add(
    {
      set: ROOM,
      grade: { ...RG, contrast: 1.38 },
      lb: false,
      actors: roomActors,
      st: {
        els: [
          CLIENT({ pose: cas ? 'p6' : 'p9', at: [720, 1820], h: 1900, in: null }),
          FOCUS(0, 0.35, 'rgba(220,230,255,0.3)'),
        ],
      },
      cam: { fov: 34, dof: 1, focus: 0.9, range: 0.4, ease: 'out', keys: CC.close },
    },
    4,
  );
  // 燈亮了：室內的遠景＋插畫格（慶功宴／寫報告的薩奇）
  T.add(
    {
      set: ROOM,
      grade: { ...RG, exposure: 1.35 },
      lb: false,
      actors: roomActors,
      st: {
        els: [
          PANEL(
            [
              [900, 80],
              [1540, 80],
              [1540, 820],
              [820, 820],
            ],
            {
              img: cas ? 'cx/x2_feast' : 'cx/x2_sakki',
              t0: 1.6,
              dots: 0.25,
              kb: [
                { t: 1.6, z: 1.1 },
                { t: 6, z: 1.2 },
              ],
            },
          ),
        ],
      },
      cam: { fov: 50, ease: 'lin', keys: CC.wide },
    },
    6,
  );
  // 閘門一直沒開（卡斯特隆）／水庫變成冷卻槽、河道乾了（艾瑟立克）：夜裡的水壩＋插畫格
  T.add(
    {
      set: DAMN,
      grade: NIGHT,
      lb: false,
      st: {
        els: [
          PANEL(
            [
              [60, 60],
              [700, 60],
              [650, 520],
              [60, 520],
            ],
            { img: cas ? 'cx/x2_dry' : 'cx/x2_cooling', t0: 1.8, in: 'left', dots: 0.3, tone: '#4a6a8a' },
          ),
        ],
      },
      cam: {
        fov: 40,
        hand: 0.02,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [10, 30], h: 4 }, l: { g: [0, -24], h: 10 } },
          { t: 6, p: { g: [8, 26], h: 4.4 }, l: { g: [0, -24], h: 11 } },
        ],
      },
      ev: [{ t: 0.3, sfx: 'distant', vol: 0.25, rate: 0.5 }],
    },
    6,
  );
  // 雪原：往西走的人（3D 的人群）＋插畫格
  const REF = {
    id: 'rf',
    k: 'people',
    who: ['farmer', 'casual', 'hoodie', 'hooded', 'man', 'suitw'],
    n: 14,
    p: [6, 0],
    box: [7, 3],
    anim: ['Walk'],
    go: [-30, 0],
    s: [{ t: 0, face: [-40, 0] }],
  };
  T.add(
    {
      set: SNOW,
      grade: { ...NIGHT, exposure: 1.05 },
      lb: false,
      actors: [REF],
      st: {
        els: [
          PANEL(
            [
              [1000, 470],
              [1560, 470],
              [1560, 850],
              [940, 850],
            ],
            { img: 'cx/x2_refugees', t0: 2.0, dots: 0.3, tone: '#6080a0' },
          ),
        ],
      },
      cam: {
        fov: 38,
        hand: 0.03,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [-6, 8], h: 1.2 }, l: { g: [6, 0], h: 0.8 } },
          { t: 6, p: { g: [-10, 8], h: 1.3 }, l: { g: [0, 0], h: 0.9 } },
        ],
      },
      ev: [{ t: 0.2, sfx: 'distant', vol: 0.3, rate: 0.5 }],
    },
    6,
  );
  // 車隊也往西走（卡斯特隆）／懸賞（艾瑟立克）
  T.add(
    {
      set: SNOW,
      grade: { ...NIGHT, exposure: 1.05 },
      lb: false,
      keep: true,
      actors: cas
        ? [0, 1, 2].map((i) => ({
            id: 'cv' + i,
            k: 'type',
            key: 'tank',
            p: [20 + i * 9, -12],
            yaw: 270,
            pal: 'aetheric',
            s: [{ t: 0, go: [-30 + i * 9, -12] }],
          }))
        : [],
      st: {
        els: [
          PANEL(
            cas
              ? [
                  [60, 470],
                  [640, 470],
                  [600, 850],
                  [60, 850],
                ]
              : [
                  [540, 120],
                  [1060, 120],
                  [1060, 800],
                  [540, 800],
                ],
            {
              img: cas ? 'c2/c2o_convoy' : 'cx/x2_wanted',
              t0: cas ? 1.6 : 0.8,
              in: cas ? 'left' : 'drop',
              dots: 0.3,
              tone: cas ? '#6080a0' : null,
            },
          ),
        ],
      },
      cam: {
        fov: 42,
        hand: 0.03,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [0, 10], h: 4 }, l: { g: [10, -12], h: 1 } },
          { t: 6, p: { g: [-4, 10], h: 4.5 }, l: { g: [0, -12], h: 1 } },
        ],
      },
    },
    6,
  );
  // 駕駛艙：冰原的邊緣，擋風窗外是走遠的人群；ECHO 的兩句
  T.add(
    {
      set: SNOW,
      grade: NIGHT,
      lb: false,
      actors: [{ id: 'hs', k: 'hero', p: [14, 14], yaw: 250, s: [{ t: 0, lower: true }] }],
      st: { els: COCKPIT('p8', [{ t: 6.5, pose: 'p9' }]) },
      cam: {
        fov: 62,
        hand: 0.03,
        keys: [
          { t: 0, p: { a: 'hs', at: 'head', o: [0, 0.4, 0] }, l: { g: [-20, 0], h: 2 } },
          { t: 10, p: { a: 'hs', at: 'head', o: [0, 0.4, 0] }, l: { g: [-24, 0], h: 2 } },
        ],
      },
      ev: [{ t: 0.05, sfx: 'glitch', vol: 0.3, rate: 0.9 }],
    },
    10,
  );
  // 冰原那邊，一個難民營停止了回訊：夜的雪原大遠景＋插畫格（藍）
  T.add(
    {
      set: SNOW,
      grade: { ...NIGHT, sat: 0.5 },
      lb: false,
      fo: 1.4,
      st: {
        els: [
          PANEL(
            [
              [400, 160],
              [1200, 160],
              [1200, 740],
              [400, 740],
            ],
            { img: 'c2/c2o_camp', t0: 2.2, in: 'fade', ind: 1, dots: 0.35, tone: '#6080a0' },
          ),
        ],
      },
      cam: {
        fov: 46,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [20, 30], h: 18 }, l: { g: [-40, -20], h: 2 } },
          { t: 8, p: { g: [18, 28], h: 20 }, l: { g: [-40, -20], h: 2 } },
        ],
      },
      ev: [{ t: 0.4, sfx: 'distant', vol: 0.35, rate: 0.4 }],
    },
    8,
  );

  placeLines(T, [
    [0.6, TK[0][1], 5, TK[0][0]],
    [6.4, TK[1][1], 4.4, TK[1][0]],
    [11.3, TK[2][1], 3.4, TK[2][0]],
    [15.3, T0[0], 5.6, null],
    [21.3, T0[1], 5.4, null],
    [27.3, T0[2], 5, null],
    [33.3, T0[3], 5.4, null],
    [39.4, T0[4], 6, 'echo'],
    [46.2, T0[5], 3.2, 'echo'],
    [49.6, T0[6], 5, null],
  ]);
  dropAll(T);
  return T.def({
    title: '第二章　章末',
    music: [{ at: 0, track: 'cine_c2', off: 60, vol: 0.8, fadeIn: 1, fadeOut: [T.at - 3, 3] }],
  });
}
