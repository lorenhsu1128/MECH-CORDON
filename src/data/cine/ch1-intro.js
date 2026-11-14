// 第 1 章開場〈荒野的鐘聲〉（過場改版第 1 期的試做：docs/cine-redesign-design.md 第 0 期的分鏡台本，約 86 秒）。
// 格式照第五節的組合：固定插畫（3D＋單色網點）→ 動態漫畫（一頁三格，3D 進格子後定格）→ 對話分格（霍斯特與 ECHO，
// 立繪演員、氣泡）→ 霍斯特一個人的單色插畫 → 3D 機甲（空降、砲擊預警、快速推進、駕駛艙裡 ECHO 的全像、反白的衝擊畫格）
// → PV 式章名卡。2D 的部分是鏡頭的 st（game/cine-2d.js）；3D 的地圖整段都是同一張荒野（不重建）。
// 主角不露臉；別人對主角說話時看著鏡頭。
import { WASTE, WEST, SCOPE, bare, sub } from './ch1.js';
import { timeline } from './kit.js';

// 砲兵陣地 BASTILLE 在北邊的台地上（局部 x 60～90、z ≤ −50，高 16 m），卡斯特隆的車隊沿 z ≈ −27 由東往西
const GUN = [67, 21, -50],
  GUN2 = [79, 21, -51];
const OCHRE = '#b8562a';
// 夜裡的荒野：單色前先壓暗（插畫感）
const NIGHTW = { ...WEST, exposure: 0.75, sunK: 0.6, bloom: 1.35, grain: 0.3, vignette: 0.5 };
const BASTILLE = [
  { id: 'gun1', k: 'model', key: 'cannon', p: [68, -52], yaw: -104, scale: 1.0, pal: 'boss' },
  { id: 'gun2', k: 'model', key: 'cannon', p: [80, -53], yaw: -110, scale: 1.0, pal: 'boss' },
  { id: 'bunk', k: 'model', key: 'bunker', p: [76, -80], yaw: 0, scale: 1.2, pal: 'boss' },
];
const convoy = [
  ['cv1', 'tank', 80, -27],
  ['cv2', 'mt', 89, -28],
  ['cv3', 'mt', 98, -26],
].map(([id, key, x, z]) => ({
  id,
  k: 'type',
  key,
  p: [x, z],
  yaw: 90,
  s: [{ t: 0, go: [x - 30, z] }],
  pal: 'castron',
}));

// 漫畫一頁三格（1600×900 的舞台；格線斜切，三格之間留 30 的間隔）
const P1 = [
  [50, 40],
  [1020, 40],
  [960, 420],
  [50, 420],
];
const P2 = [
  [1050, 40],
  [1550, 40],
  [1550, 860],
  [921, 860],
];
const P3 = [
  [50, 450],
  [955, 450],
  [891, 860],
  [50, 860],
];
const PAGE = {
  page: 'c1page',
  bg: '#0c0c0c',
  // 整頁的鏡頭：第一格 → 第二格 → 第三格 → 拉遠看整頁
  pg: {
    keys: [
      { t: 0, x: 505, y: 230, z: 1.55 },
      { t: 4.3, x: 505, y: 230, z: 1.6 },
      { t: 4.9, x: 1240, y: 450, z: 1.06 },
      { t: 9.0, x: 1240, y: 450, z: 1.08 },
      { t: 9.6, x: 470, y: 655, z: 1.6 },
      { t: 11.6, x: 470, y: 655, z: 1.62 },
      { t: 12.4, x: 800, y: 450, z: 1 },
      { t: 14, x: 800, y: 450, z: 0.97 },
    ],
  },
  shake: [
    [5.7, 0.5, 0.4],
    [6.4, 0.35, 0.3],
  ],
  els: [
    // ① 砲台抬起砲管（3D 進格子、網點）
    {
      k: 'panel',
      id: 'p1',
      q: P1,
      t0: 0.05,
      in: 'drop',
      live: true,
      snap: 4.5,
      flt: 'contrast(1.25) saturate(0.7)',
      dots: 0.35,
      vig: 0.5,
    },
    // ② 車隊被炸翻
    {
      k: 'panel',
      id: 'p2',
      q: P2,
      t0: 4.65,
      in: 'drop',
      rot0: -0.05,
      live: true,
      snap: 9.15,
      focus: [0.5, 0.55],
      flt: 'contrast(1.3) saturate(0.8)',
      dots: 0.25,
    },
    {
      k: 'text',
      s: '轟',
      at: [1250, 300],
      size: 260,
      color: '#ffe0a0',
      stroke: '#2a0a00',
      rot: -0.12,
      t0: 5.75,
      in: 'stamp',
      t1: 9.4,
    },
    {
      k: 'lines',
      kind: 'focus',
      q: [921, 40, 629, 820],
      t0: 5.7,
      t1: 6.6,
      color: 'rgba(255,240,200,0.9)',
      r: 0.28,
      n: 70,
    },
    // ③ 工人們的剪影抬頭看
    {
      k: 'panel',
      id: 'p3',
      q: P3,
      t0: 9.3,
      in: 'left',
      live: true,
      flt: 'contrast(1.35) saturate(0.6)',
      dots: 0.3,
      vig: 0.4,
      kids: [
        {
          k: 'bubble',
          s: '補給線……斷了！',
          name: '工頭',
          color: '#d8903a',
          at: [640, 560],
          tail: [470, 700],
          w: 420,
          t0: 10.3,
          t1: 13.6,
        },
      ],
    },
  ],
};

// 對話分格的舞台：霍斯特（整個畫面，夜裡的辦公室）→ ECHO 從右邊加入（斜切的格子）
const TALK = {
  bg: '#080808',
  els: [
    {
      k: 'panel',
      q: [0, 0, 1600, 900],
      bd: 0,
      art: 'office',
      kb: [
        { t: 0, z: 1.04, x: 0 },
        { t: 32, z: 1.1, x: -30 },
      ],
      dots: 0.12,
      kids: [
        {
          k: 'actor',
          who: 'castron',
          pose: 'p8',
          at: [600, 1240],
          h: 1180,
          in: 'fade',
          bub: [330, -120],
          bubW: 520,
          s: [
            { t: 5.0, pose: 'p1' },
            { t: 10.2, at: [470, 1240], mv: 0.6 },
            { t: 10.6, dim: 0.45 },
            { t: 15.0, pose: 'p4', expr: 'smug', dim: 0 },
            { t: 19.0, pose: 'p6', expr: 'neutral' }, // p6 只有平常的臉；語氣照 line-expr 的 angry
            { t: 24.6, pose: 'p1', expr: 'scheme' },
          ],
        },
      ],
    },
    {
      k: 'panel',
      q: [
        [1010, -20],
        [1640, -20],
        [1640, 920],
        [870, 920],
      ],
      t0: 10.2,
      in: 'right',
      fill: '#0a1824',
      dots: 0.3,
      kids: [
        {
          k: 'lines',
          kind: 'speed',
          q: [870, 0, 770, 900],
          color: 'rgba(127,200,255,0.12)',
          n: 30,
          t0: 10.2,
        },
        {
          k: 'actor',
          who: 'echo',
          pose: 'p3',
          at: [1300, 1210],
          h: 1150,
          t0: 10.2,
          expr: 'focus',
          bub: [-300, -140],
          bubW: 460,
          s: [
            { t: 15.0, dim: 0.45 },
            { t: 24.6, expr: 'think' },
          ],
        },
      ],
    },
  ],
};

export function ch1Intro() {
  const T = timeline();
  // 0:00 固定插畫：夜裡的荒野、沙裡半埋的舊天線頂端亮起紅光。整張只用赭紅一色，慢慢推近
  T.add(
    {
      set: WASTE,
      grade: NIGHTW,
      fi: 2,
      lb: false,
      hook: 'c1antenna',
      antenna: { at: [116, -30], tilt: 0.32 },
      st: {
        els: [
          {
            k: 'panel',
            q: [0, 0, 1600, 900],
            bd: 0,
            live: true,
            tone: OCHRE,
            dots: 0.32,
            dotSz: 7,
            vig: 0.75,
          },
        ],
      },
      cam: {
        fov: 30,
        hand: 0.015,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [128, -21], h: 0.6 }, l: { g: [116, -30], h: 3.6 } },
          { t: 10, p: { g: [124, -24], h: 1.4 }, l: { g: [116, -30], h: 5 }, fov: 24 },
        ],
      },
      ev: [
        { t: 0.3, sfx: 'bell', vol: 0.35, rate: 0.35 },
        { t: 4.6, sfx: 'bell', vol: 0.3, rate: 0.33 },
        { t: 0.6, sfx: 'distant', vol: 0.25, rate: 0.4 },
        sub('ECHO：「南部荒野。三天前，這座天線自己醒了。」', 2.6, 5.4),
      ],
    },
    10,
  );

  // 0:10 動態漫畫（一頁三格）：每格先是即時的 3D，下一格落下前定格
  T.add(
    {
      set: WASTE,
      grade: { ...SCOPE, sat: 0.6 },
      lb: false,
      st: PAGE,
      actors: [...BASTILLE],
      cam: {
        fov: 30,
        hand: 0.02,
        ease: 'lin',
        keys: [
          { t: 0, p: [64, 2.5, -34], l: [68, 18, -52] },
          { t: 4.6, p: [64.5, 2.2, -35], l: [68, 19.5, -52], fov: 26 },
        ],
      },
      ev: [
        { t: 0.3, sfx: 'thud1', vol: 0.5, rate: 0.8 },
        { t: 1.2, sfx: 'heavy', vol: 0.6, rate: 0.45 },
        { t: 3.6, fx: 'flash', at: GUN, r: 4, color: 0xffc070 },
        { t: 3.6, fx: 'smoke', at: GUN, r: 2, life: 3, rise: 2 },
        { t: 3.6, sfx: 'boom1', vol: 0.9, rate: 0.5 },
        { t: 3.7, shake: 0.4 },
      ],
    },
    4.6,
  );
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.38, sat: 0.7 },
      lb: false,
      keep: true,
      st: PAGE,
      actors: convoy,
      cam: {
        fov: 40,
        hand: 0.04,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [72, -9], h: 5 }, l: { g: [74, -27], h: 1 } },
          { t: 4.6, p: { g: [72, -10], h: 5.4 }, l: { g: [68, -27], h: 1.5 } },
        ],
      },
      ev: [
        { t: 0.3, sfx: 'thud1', vol: 0.5, rate: 0.75 },
        { t: 0.3, fx: 'warnLine', at: GUN, to: { a: 'cv2' }, color: 0xff3020, life: 0.9 },
        { t: 1.1, boom: { a: 'cv2' }, big: true, kill: true },
        { t: 1.15, a: 'cv2', die: true },
        { t: 1.2, fx: 'smoke', at: { a: 'cv2', at: 'base' }, r: 3, life: 7, rise: 9 },
        { t: 1.8, boom: { a: 'cv1' }, big: true, kill: true },
        { t: 1.85, a: 'cv1', die: true },
        { t: 2.4, boom: { a: 'cv3' }, big: true, kill: true },
        { t: 2.45, a: 'cv3', die: true },
        { t: 2.5, fx: 'smoke', at: { a: 'cv1', at: 'base' }, r: 3, life: 6, rise: 9 },
      ],
    },
    4.6,
  );
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.4, sat: 0.6, exposure: 1.25 },
      lb: false,
      keep: true,
      st: PAGE,
      actors: [
        {
          id: 'wk',
          k: 'people',
          who: ['worker', 'worker', 'soldier', 'farmer'],
          n: 8,
          p: [44, -25],
          box: [6, 1.4],
          anim: ['Idle', 'Idle_Neutral'],
          dark: 0.9,
          s: [{ t: 0, face: [44, -60] }],
        },
      ],
      cam: {
        fov: 36,
        hand: 0.03,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [44, -21], h: 0.35 }, l: [44, 5, -60] },
          { t: 4.8, p: { g: [44, -21.3], h: 0.4 }, l: [44, 6, -60] },
        ],
      },
      ev: [
        { t: 0.25, sfx: 'thud1', vol: 0.45, rate: 0.85 },
        { t: 0.3, fx: 'smoke', at: { g: [52, -34], h: 0 }, r: 5, life: 6, rise: 8 },
        { t: 0.4, fx: 'fire', at: { g: [50, -32], h: 0 }, r: 2, life: 5 },
        { t: 1.1, sfx: 'distant', vol: 0.4, rate: 0.6 },
      ],
    },
    4.8,
  );

  // 0:24 對話分格：霍斯特看鏡頭（＝看著主角）；ECHO 從右邊加入、兩人面對面
  T.add(
    {
      set: WASTE,
      lb: false,
      fi: 0.25,
      st: TALK,
      cam: { fov: 40, keys: [{ t: 0, p: { g: [0, 60], h: 3 }, l: { g: [0, 0], h: 3 } }] },
      ev: [
        { t: 0.1, sfx: 'door', vol: 0.25, rate: 0.8 },
        sub('霍斯特：「我是卡斯特隆的霍斯特。客套話就免了。」', 0.7, 4.0),
        sub('霍斯特：「礦坑那座陣地，是我們幾十年前封存的資產。它自己醒了。」', 5.1, 4.9),
        { t: 10.2, sfx: 'glitch', vol: 0.3, rate: 0.9 },
        sub('ECHO：「天線的訊號和陣地甦醒，只差了四秒。」', 10.7, 4.1),
        sub('霍斯特：「……妳的系統管得太多了。」', 15.1, 3.7),
        sub('霍斯特：「從荒野推到礦坑，把它拆了。打得越深，拿得越多。」', 19.1, 5.3),
        sub('霍斯特：「你是新登錄的？檔案上什麼都沒有。……也好，乾淨的人好辦事。」', 24.7, 6.6),
      ],
    },
    32,
  );
  // 0:56 通訊切斷後：霍斯特一個人摸著後頸，桌上一張舊的礦工合照。單色的暗橘，沒有台詞
  T.add(
    {
      set: WASTE,
      lb: false,
      st: {
        bg: '#000',
        pg: {
          keys: [
            { t: 0, z: 1 },
            { t: 6, z: 1.07, x: 760, y: 470 },
          ],
        },
        els: [
          {
            k: 'panel',
            q: [0, 0, 1600, 900],
            bd: 0,
            art: 'desk',
            ao: { px: 0.8 },
            tone: '#a0602a',
            dots: 0.22,
            vig: 0.75,
            kids: [{ k: 'actor', who: 'castron', pose: 'p9', at: [560, 1250], h: 1200, noBub: true }],
          },
        ],
      },
      fi: 0.6,
      fo: 0.5,
      cam: { fov: 40, keys: [{ t: 0, p: { g: [0, 60], h: 3 }, l: { g: [0, 0], h: 3 } }] },
      ev: [{ t: 0.2, sfx: 'distant', vol: 0.2, rate: 0.5 }],
    },
    6,
  );

  // 1:02 3D 機甲：主角往礦坑推進 → BASTILLE 的砲擊預警 → 快速推進閃開 → 駕駛艙裡的 ECHO → 衝擊畫格
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.3 },
      fi: 0.4,
      hook: 'c1fxclear',
      actors: [
        {
          id: 'hx',
          k: 'hero',
          p: [0, 46],
          yaw: 0,
          s: [
            { t: 0, go: [6, -22], ab: true },
            { t: 4.2, ab: false },
          ],
        },
        ...BASTILLE,
      ],
      cam: {
        fov: 42,
        hand: 0.12,
        follow: 8,
        keys: [
          { t: 0, p: { a: 'hx', at: 'base', o: [-9, 2, 10] }, l: { a: 'hx', o: [0, 1, -4] } },
          { t: 4.5, p: { a: 'hx', at: 'base', o: [-7, 2.4, 9] }, l: { a: 'hx', o: [0, 1.2, -6] } },
        ],
      },
      ev: [
        { t: 0.1, sfx: 'boostUp', vol: 0.9, rate: 0.8 },
        { t: 0.2, shake: 0.2 },
      ],
    },
    4.5,
  );
  T.add(
    {
      set: WASTE,
      grade: { ...SCOPE, sat: 0.55 },
      keep: true,
      cam: {
        fov: 24,
        hand: 0.03,
        follow: 4,
        keys: [
          { t: 0, p: [72, 24, -46], l: { a: 'hx', o: [0, 1, 0] } },
          { t: 3.5, p: [72.5, 24.5, -46], l: { a: 'hx', o: [0, 1, 0] } },
        ],
      },
      ev: [
        { t: 0.2, sfx: 'alarm', vol: 0.4, rate: 0.6 },
        { t: 0.5, fx: 'ring', at: { a: 'hx', at: 'base', o: [0, 0, -6] }, r: 7, color: 0xff2a1a },
        { t: 0.9, fx: 'flash', at: GUN, r: 4, color: 0xffc070 },
        { t: 0.9, sfx: 'heavy', vol: 1, rate: 0.6 },
        { t: 1.0, fx: 'warnLine', at: GUN, to: { a: 'hx' }, color: 0xff3020, life: 1.6 },
        { t: 1.6, fx: 'flash', at: GUN2, r: 4, color: 0xffc070 },
        { t: 1.6, sfx: 'boom1', vol: 0.8, rate: 0.5 },
      ],
    },
    3.5,
  );
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.35, chroma: 0.35 },
      keep: true,
      cam: {
        fov: 38,
        hand: 0.2,
        follow: 10,
        keys: [
          { t: 0, p: { a: 'hx', at: 'base', o: [6, 1.4, 6] }, l: { a: 'hx', o: [0, 1, 0] } },
          { t: 2, p: { a: 'hx', at: 'base', o: [7, 1.6, 7] }, l: { a: 'hx', o: [0, 1, 0] } },
        ],
      },
      ev: [
        { t: 0.15, a: 'hx', qb: [-1, 0] },
        { t: 0.15, sfx: 'boostUp', vol: 1, rate: 1.2 },
        { t: 0.55, boom: { a: 'hx', at: 'base', o: [5, 0, -2] }, big: true },
        { t: 0.6, slow: 0.35, dur: 0.5 },
        { t: 1.2, boom: { a: 'hx', at: 'base', o: [8, 0, 3] } },
      ],
    },
    2,
  );
  // 駕駛艙：擋風窗外是 3D，右下是 ECHO 的全像（氣泡＝她的台詞）
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.2 },
      keep: true,
      lb: false,
      st: {
        els: [
          { k: 'art', art: 'cockpit', q: [-40, -20, 1680, 940] },
          {
            k: 'actor',
            who: 'echo',
            pose: 'p2',
            at: [1360, 1060],
            h: 740,
            in: 'fade',
            holo: '#7fc8ff',
            bub: [-460, 40],
            bubW: 520,
          },
        ],
      },
      cam: {
        fov: 62,
        hand: 0.08,
        follow: 12,
        keys: [
          { t: 0, p: { a: 'hx', at: 'head', o: [0, 0.4, 0] }, l: [74, 9, -56] },
          { t: 5, p: { a: 'hx', at: 'head', o: [0, 0.4, 0] }, l: [74, 10, -56] },
        ],
      },
      ev: [
        { t: 0.1, a: 'hx', go: [20, -26], ab: true },
        { t: 0.05, sfx: 'glitch', vol: 0.35, rate: 1.1 },
        sub('ECHO：「目標在礦坑深處。照你的節奏來。」', 0.6, 4.0),
      ],
    },
    5,
  );
  // 衝擊畫格：反白的線稿，一瞬間
  T.add(
    {
      set: WASTE,
      grade: WEST,
      keep: true,
      lb: false,
      st: {
        els: [
          { k: 'panel', q: [0, 0, 1600, 900], bd: 0, live: true, flt: 'grayscale(1) contrast(6) invert(1)' },
          { k: 'lines', kind: 'focus', q: [0, 0, 1600, 900], color: '#000', r: 0.22, n: 110 },
        ],
      },
      cam: {
        fov: 30,
        keys: [{ t: 0, p: { a: 'hx', at: 'base', o: [-6, 1.2, 8] }, l: { a: 'hx', o: [0, 1, 0] } }],
      },
      ev: [
        { t: 0, boom: { a: 'hx', at: 'base', o: [3, 0, -4] }, big: true, near: true },
        { t: 0, shake: 0.7 },
      ],
    },
    0.45,
  );
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.3 },
      keep: true,
      cam: {
        fov: 30,
        hand: 0.05,
        follow: 6,
        ease: 'out',
        keys: [
          { t: 0, p: { a: 'hx', at: 'base', o: [-6, 1.2, 8] }, l: { a: 'hx', o: [0, 1, 0] } },
          { t: 4.55, p: { a: 'hx', at: 'base', o: [-20, 6, 26] }, l: { g: [70, -52], h: 14 }, fov: 36 },
        ],
      },
      ev: [{ t: 0.3, sfx: 'debris', vol: 0.5, rate: 0.8 }],
    },
    4.55,
  );

  // 1:22 PV 式章名卡：赭紅與黑的色塊、BASTILLE 的剪影（3D 的天空變白、剪影變黑，乘上赭紅）、大字
  T.add(
    {
      set: WASTE,
      grade: WEST,
      lb: false,
      fo: 0.8,
      actors: [...BASTILLE],
      st: {
        bg: OCHRE,
        els: [
          {
            k: 'block',
            q: [0, 0, 1600, 900],
            live: true,
            gco: 'multiply',
            flt: 'grayscale(1) contrast(14) brightness(1.5)',
            focus: [0.5, 0.6],
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
            t0: 0.2,
            ind: 0.35,
          },
          {
            k: 'text',
            s: 'BASTILLE',
            at: [1530, 600],
            size: 44,
            font: 'mono',
            al: 'right',
            color: OCHRE,
            stroke: null,
            t0: 0.5,
            in: 'fade',
            ls: 10,
          },
          {
            k: 'text',
            s: 'CHAPTER 1',
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
            s: '南部荒野',
            at: [130, 790],
            size: 132,
            al: 'left',
            color: '#f4ece0',
            stroke: null,
            t0: 0.8,
            in: 'stamp',
            ls: 18,
          },
        ],
      },
      cam: {
        fov: 34,
        ease: 'lin',
        keys: [
          { t: 0, p: [66, 1.5, -30], l: [73, 17, -52] },
          { t: 4.5, p: [65.5, 1.4, -29], l: [73, 17.5, -52] },
        ],
      },
      ev: [
        { t: 0.2, sfx: 'heavy', vol: 0.9, rate: 0.45 },
        { t: 0.8, sfx: 'thud1', vol: 0.8, rate: 0.6 },
        { t: 0.85, shake: 0.2 },
      ],
    },
    4.5,
  );
  return bare(T).def({
    title: '第一章　開場',
    music: [{ at: 0, track: 'cine_c1', vol: 0.85, fadeIn: 2, fadeOut: [T.at - 3, 3] }],
  });
}
