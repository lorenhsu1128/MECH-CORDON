// 第 1 章開場〈荒野的鐘聲〉（3D 動畫化的試做，2026-11-14；docs/cine-redesign-design.md 的「3D 動畫化」）。
// 使用者的定案：日本動畫的感覺、3D 與 2D 漫畫混合（3D 上疊漫畫、漫畫格嵌 3D）、動作鏡頭一拍二（koma）、
// 對白用字幕（立繪不出氣泡）。台詞、語音、配樂（cine_c1）與卡點照第 1 期的版本，鏡頭全部重拍：
//   0:00 吊臂鏡頭降到半埋的天線 → 信號燈的特寫 → 插畫的格子滑進來
//   0:10 砲台的仰角（一拍二）→ 瞄準鏡的主觀 → 反白的衝擊畫格 → 燃燒的車隊上疊一頁漫畫（三格各有自己的 3D 鏡頭）
//   0:24 霍斯特的辦公室（3D 室內＋立繪、景深）與插入鏡頭（陣地、駕駛艙的 ECHO、往礦坑的航拍、眼睛的特寫格）
//   0:56 霍斯特一個人：辦公室的遠景＋插畫的格子
//   1:02 R-07 推進（一拍二的仰角、側面跟拍＋速度線）→ 瞄準鏡鎖定 → 快速推進閃開 → 駕駛艙 → 衝擊畫格 → 拉遠
//   1:22 PV 式章名卡
// 地圖：荒野（ch1.js 的 WASTE）與辦公室（room），開頭的載入畫面先建好（game/cine-prep.js）。主角不露臉。
import { WASTE, WEST, SCOPE, bare, sub } from './ch1.js';
import { snapBeat } from './beats.js';
import { timeline } from './kit.js';

// 卡點：章名卡從第 82 秒開始；漫畫頁從 PAGE_AT 開始，格子落下、狀聲詞蓋章對齊配樂（cine_c1）的拍點
const PAGE_AT = 13.95;
const cb = (t) => +(snapBeat('cine_c1', 82 + t) - 82).toFixed(3);
const pb = (t) => +(snapBeat('cine_c1', PAGE_AT + t) - PAGE_AT).toFixed(3);

// 砲兵陣地 BASTILLE 在北邊的台地上（局部 x 60～90、z ≤ −50，高 16 m），卡斯特隆的車隊沿 z ≈ −27 由東往西
const GUN = [67, 21, -50],
  GUN2 = [79, 21, -51];
const OCHRE = '#b8562a';
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
// 霍斯特的辦公室：作戰室的指揮室模型（render/hub-room.js）、夜裡、暖色的檯燈
const OFFICE = {
  k: 'room',
  echo: false,
  signs: false,
  sky: 0x060910,
  key: 0xffa45a,
  keyI: 1.05,
  hemi: 0x5a6a8a,
  hemiI: 0.3,
};
const ROOMG = {
  ...WEST,
  temp: 0.35,
  fogK: 0,
  dust: 0,
  grain: 0.3,
  vignette: 0.55,
  tintHi: '#ffb070',
  tintLo: '#101826',
  tintLoK: 0.5,
};
// 全畫面的 3D（舞台上的格子）；o 可以加 flt、tone、dots…
const LIVE = (o = {}) => ({ k: 'panel', q: [0, 0, 1600, 900], bd: 0, live: true, ...o });
// 霍斯特的立繪疊在 3D 上（對白用字幕：noBub）
const HORST = (o) => ({ k: 'actor', who: 'castron', noBub: true, in: 'fade', ...o });
// 速度線（橫的，跟拍時）
const SPEED = (t0, t1, a = 0.22) => ({
  k: 'lines',
  kind: 'speed',
  q: [0, 0, 1600, 900],
  color: `rgba(255,236,210,${a})`,
  n: 34,
  t0,
  t1,
});

// 對白（照第 1 期的時間；唸出來的長度由語音決定）：[過場的秒數, 台詞, 字幕的秒數]
const LINES = [
  [2.6, 'ECHO：「南部荒野。三天前，這座天線自己醒了。」', 5.4],
  [24.7, '霍斯特：「我是卡斯特隆的霍斯特。客套話就免了。」', 4.0],
  [29.1, '霍斯特：「礦坑那座陣地，是我們幾十年前封存的資產。它自己醒了。」', 4.9],
  [34.7, 'ECHO：「天線的訊號和陣地甦醒，只差了四秒。」', 4.1],
  [39.1, '霍斯特：「……妳的系統管得太多了。」', 3.7],
  [43.1, '霍斯特：「從荒野推到礦坑，把它拆了。打得越深，拿得越多。」', 5.3],
  [48.7, '霍斯特：「你是新登錄的？檔案上什麼都沒有。……也好，乾淨的人好辦事。」', 6.6],
  [72.6, 'ECHO：「目標在礦坑深處。照你的節奏來。」', 4.0],
];

export function ch1Intro() {
  const T = timeline();

  // ---------- 0:00 天線 ----------
  // 吊臂鏡頭從高處降到半埋的天線（4.2 秒）→ 切到信號燈的仰角特寫 → 7.4 秒插畫的格子從右邊滑進來（3D 上疊漫畫）
  T.add(
    {
      set: WASTE,
      grade: NIGHTW,
      fi: 2,
      lb: false,
      hook: 'c1antenna',
      antenna: { at: [116, -30], tilt: 0.32 },
      ov: 'c1sand',
      sand: 0.6,
      st: {
        els: [
          {
            k: 'text',
            s: '噹——',
            at: [300, 300],
            size: 120,
            color: '#ffd0a0',
            stroke: '#2a0a00',
            rot: -0.08,
            t0: 4.5,
            t1: 7.2,
            in: 'stamp',
          },
          {
            k: 'panel',
            q: [
              [930, 60],
              [1560, 60],
              [1560, 840],
              [820, 840],
            ],
            img: 'c1/c1_antenna',
            focus: [0.3, 0.8],
            kb: [
              { t: 7.4, z: 1.3 },
              { t: 10, z: 1.42 },
            ],
            tone: OCHRE,
            dots: 0.3,
            dotSz: 6,
            t0: 7.4,
            in: 'right',
          },
        ],
      },
      cam: {
        fov: 40,
        hand: 0.015,
        keys: [
          { t: 0, p: { g: [138, -12], h: 16 }, l: { g: [116, -28.5], h: 3 }, fov: 38 },
          { t: 4.18, p: { g: [127, -22], h: 3.2 }, l: { g: [116, -30], h: 3.6 }, fov: 30 },
          // 切：信號燈的仰角特寫
          { t: 4.2, p: { g: [120.5, -25.6], h: 0.6 }, l: { g: [116, -28.3], h: 3.4 }, fov: 26, lin: true },
          { t: 10, p: { g: [119.8, -26.0], h: 0.75 }, l: { g: [116, -28.3], h: 3.5 }, fov: 21, lin: true },
        ],
      },
      ev: [
        { t: 0.3, sfx: 'bell', vol: 0.35, rate: 0.35 },
        { t: 4.6, sfx: 'bell', vol: 0.3, rate: 0.33 },
        { t: 0.6, sfx: 'distant', vol: 0.25, rate: 0.4 },
        { t: 7.4, sfx: 'thud1', vol: 0.35, rate: 0.9 },
      ],
    },
    10,
  );

  // ---------- 0:10 砲擊 ----------
  // 砲台的仰角（一拍二、鏡頭往上搖）
  T.add(
    {
      set: WASTE,
      grade: { ...SCOPE, sat: 0.55, vignette: 0.55 },
      lb: false,
      koma: 2,
      actors: [...BASTILLE, ...convoy],
      cam: {
        fov: 26,
        hand: 0.03,
        keys: [
          { t: 0, p: { a: 'gun1', at: 'base', o: [4, 0.6, 6] }, l: { a: 'gun1', at: 'base', o: [0, 2, 0] } },
          {
            t: 1.7,
            p: { a: 'gun1', at: 'base', o: [3.6, 0.5, 5.6] },
            l: { a: 'gun1', at: 'base', o: [0, 2.8, -1] },
            fov: 22,
          },
        ],
      },
      ev: [
        { t: 0.1, sfx: 'heavy', vol: 0.7, rate: 0.45 },
        { t: 0.6, sfx: 'thud1', vol: 0.5, rate: 0.7 },
      ],
    },
    1.7,
  );
  // 瞄準鏡的主觀：車隊在十字線裡，鎖定
  T.add(
    {
      set: WASTE,
      grade: { ...SCOPE, sat: 0.3, contrast: 1.5 },
      lb: false,
      keep: true,
      koma: 2,
      st: {
        els: [
          { k: 'lines', kind: 'reticle', lock: 0, t1: 1.1 },
          { k: 'lines', kind: 'reticle', lock: 1, t0: 1.1 },
          {
            k: 'text',
            s: 'TARGET LOCK',
            at: [800, 760],
            size: 34,
            font: 'mono',
            color: '#ff5a3c',
            stroke: null,
            ls: 8,
            t0: 1.15,
            in: 'fade',
          },
        ],
      },
      cam: {
        fov: 12,
        hand: 0.004,
        follow: 20,
        keys: [
          { t: 0, p: [66, 23, -48], l: { a: 'cv2', o: [1, 0.6, 0] } },
          { t: 1.9, p: [66, 23, -48], l: { a: 'cv2', o: [0, 0.6, 0] }, fov: 10 },
        ],
      },
      ev: [
        { t: 0.2, sfx: 'alarm', vol: 0.3, rate: 0.7 },
        { t: 1.1, sfx: 'thud1', vol: 0.4, rate: 1.4 },
      ],
    },
    1.9,
  );
  // 衝擊畫格：開砲的一瞬間（反白的線稿＋集中線）
  T.add(
    {
      set: WASTE,
      grade: WEST,
      lb: false,
      keep: true,
      st: {
        els: [
          LIVE({ flt: 'grayscale(1) contrast(6) invert(1)' }),
          { k: 'lines', kind: 'focus', q: [0, 0, 1600, 900], color: '#000', r: 0.2, n: 120 },
        ],
      },
      cam: {
        fov: 34,
        keys: [
          {
            t: 0,
            p: { a: 'gun1', at: 'base', o: [-3, 1.2, 5] },
            l: { a: 'gun1', at: 'base', o: [1, 1.5, -3] },
          },
        ],
      },
      ev: [
        { t: 0, fx: 'flash', at: GUN, r: 5, color: 0xffc070 },
        { t: 0, sfx: 'boom1', vol: 1, rate: 0.5 },
        { t: 0, fx: 'smoke', at: GUN, r: 2, life: 3, rise: 2 },
        { t: 0, shake: 0.6 },
      ],
    },
    0.35,
  );
  // 燃燒的車隊（一拍二）上疊一頁漫畫：格子之間看得到後面的 3D；三格各有自己的 3D 鏡頭
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.38, sat: 0.72 },
      lb: false,
      keep: true,
      koma: 2,
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
      st: {
        page: 'c1page',
        // 整頁慢慢推近；格子落下時晃一下
        pg: {
          keys: [
            { t: 0, z: 1 },
            { t: 10, z: 1.05, x: 820, y: 450 },
          ],
        },
        shake: [
          [pb(0.55), 0.6, 0.4],
          [pb(4.9), 0.3, 0.3],
          [pb(7.4), 0.3, 0.3],
        ],
        els: [
          // 第一格落下時後面的 3D 壓暗
          {
            k: 'block',
            q: [-200, -200, 2000, 1300],
            color: 'rgba(8,4,2,0.45)',
            t0: pb(0.5),
            in: 'fade',
          },
          // ① 炸翻的車輛（特寫）
          {
            k: 'panel',
            id: 'p1',
            q: [
              [60, 50],
              [900, 50],
              [840, 470],
              [60, 470],
            ],
            t0: pb(0.5),
            in: 'drop',
            live: true,
            cam: {
              fov: 34,
              hand: 0.05,
              ease: 'lin',
              keys: [
                { t: 0, p: { g: [86, -18], h: 3 }, l: { g: [88, -28], h: 1 } },
                { t: 10, p: { g: [85, -19], h: 3.6 }, l: { g: [84, -28], h: 2 } },
              ],
            },
            flt: 'contrast(1.3) saturate(0.85)',
            dots: 0.22,
            kids: [
              {
                k: 'text',
                s: '轟',
                at: [470, 300],
                size: 240,
                color: '#ffe0a0',
                stroke: '#2a0a00',
                rot: -0.12,
                t0: pb(0.55),
                in: 'stamp',
              },
              {
                k: 'lines',
                kind: 'focus',
                q: [60, 50, 840, 420],
                color: 'rgba(255,240,200,0.85)',
                r: 0.3,
                n: 60,
                t0: pb(0.5),
                t1: pb(0.5) + 1,
              },
            ],
          },
          // ② 工人們的剪影抬頭看
          {
            k: 'panel',
            id: 'p2',
            q: [
              [930, 50],
              [1540, 50],
              [1540, 520],
              [880, 520],
            ],
            t0: pb(4.9),
            in: 'right',
            live: true,
            cam: {
              fov: 36,
              hand: 0.03,
              ease: 'lin',
              keys: [
                { t: 0, p: { g: [44, -21], h: 0.35 }, l: [44, 5, -60] },
                { t: 10, p: { g: [44, -21.3], h: 0.4 }, l: [44, 6.5, -60] },
              ],
            },
            flt: 'contrast(1.35) saturate(0.6)',
            dots: 0.3,
            vig: 0.4,
            kids: [
              {
                k: 'bubble',
                s: '補給線……斷了！',
                name: '工頭',
                color: '#d8903a',
                at: [1230, 160],
                tail: [1120, 330],
                w: 380,
                t0: pb(5.3),
                t1: 10,
              },
            ],
          },
          // ③ 冒煙的砲口
          {
            k: 'panel',
            id: 'p3',
            q: [
              [60, 500],
              [800, 500],
              [760, 850],
              [60, 850],
            ],
            t0: pb(7.4),
            in: 'left',
            live: true,
            cam: {
              fov: 22,
              hand: 0.01,
              ease: 'lin',
              keys: [
                { t: 0, p: [57, 19, -39], l: [67, 21.3, -51] },
                { t: 10, p: [57.6, 19.2, -39.5], l: [67, 21.6, -51] },
              ],
            },
            tone: OCHRE,
            dots: 0.3,
          },
        ],
      },
      cam: {
        fov: 40,
        hand: 0.04,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [72, -9], h: 5 }, l: { g: [74, -27], h: 1 } },
          { t: 10.05, p: { g: [72, -11], h: 6.5 }, l: { g: [64, -27], h: 2 } },
        ],
      },
      ev: [
        { t: 0.2, fx: 'warnLine', at: GUN, to: { a: 'cv2' }, color: 0xff3020, life: 0.5 },
        { t: pb(0.55), boom: { a: 'cv2' }, big: true, kill: true },
        { t: pb(0.55) + 0.05, a: 'cv2', die: true },
        { t: pb(0.55) + 0.1, fx: 'smoke', at: { a: 'cv2', at: 'base' }, r: 3, life: 9, rise: 9 },
        { t: pb(2.2), boom: { a: 'cv1' }, big: true, kill: true },
        { t: pb(2.2) + 0.05, a: 'cv1', die: true },
        { t: pb(3.1), boom: { a: 'cv3' }, big: true, kill: true },
        { t: pb(3.1) + 0.05, a: 'cv3', die: true },
        { t: pb(3.2), fx: 'smoke', at: { a: 'cv1', at: 'base' }, r: 3, life: 8, rise: 9 },
        { t: pb(4.9), sfx: 'thud1', vol: 0.45, rate: 0.85 },
        { t: pb(5), fx: 'fire', at: { g: [50, -32], h: 0 }, r: 2, life: 5 },
        { t: pb(5.2), sfx: 'distant', vol: 0.4, rate: 0.6 },
        { t: pb(7.4), sfx: 'thud1', vol: 0.45, rate: 0.7 },
        { t: pb(7.4), fx: 'smoke', at: GUN, r: 1.5, life: 4, rise: 3 },
      ],
    },
    10.05,
  );

  // ---------- 0:24 霍斯特 ----------
  // 辦公室：立繪疊在 3D 的室內（景深），鏡頭慢慢推近（多層次：背景移得多、人物不動）
  T.add(
    {
      set: OFFICE,
      grade: ROOMG,
      lb: false,
      fi: 0.25,
      st: {
        els: [
          HORST({
            pose: 'p8',
            at: [560, 1240],
            h: 1180,
            s: [{ t: 0.5, pose: 'p1' }],
          }),
        ],
      },
      cam: {
        fov: 40,
        dof: 1,
        focus: 1.2,
        range: 0.6,
        keys: [
          { t: 0, p: [1.8, 1.75, 5.2], l: [-1.5, 1.6, -6] },
          { t: 5, p: [1.2, 1.7, 4.2], l: [-1.5, 1.6, -6] },
        ],
      },
      ev: [{ t: 0.1, sfx: 'door', vol: 0.25, rate: 0.8 }],
    },
    5,
  );
  // 插入：台地上的陣地（3D），右邊滑進霍斯特的臉的格子（漫畫格嵌立繪）
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, exposure: 0.85, contrast: 1.3 },
      lb: false,
      actors: [...BASTILLE],
      st: {
        els: [
          {
            k: 'panel',
            q: [
              [1080, 70],
              [1540, 70],
              [1540, 470],
              [1020, 470],
            ],
            t0: 2.6,
            in: 'right',
            fill: '#1a0e08',
            dots: 0.18,
            kids: [HORST({ pose: 'p1', at: [1290, 1760], h: 1800, in: null })],
          },
        ],
      },
      cam: {
        fov: 30,
        hand: 0.02,
        ease: 'lin',
        keys: [
          { t: 0, p: [52, 10, -26], l: [72, 18, -55] },
          { t: 5.2, p: [55, 11, -31], l: [72, 19, -55] },
        ],
      },
      ev: [{ t: 0.2, fx: 'smoke', at: GUN, r: 1.5, life: 6, rise: 3 }],
    },
    5.2,
  );
  // 插入：駕駛艙（擋風窗外是 3D 的荒野）、ECHO 的全像
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.2, exposure: 0.85 },
      lb: false,
      actors: [{ id: 'hc', k: 'hero', p: [20, 6], yaw: 20 }],
      st: {
        els: [
          { k: 'art', art: 'cockpit', q: [-40, -20, 1680, 940] },
          {
            k: 'lines',
            kind: 'speed',
            q: [0, 0, 1600, 900],
            color: 'rgba(127,200,255,0.1)',
            n: 20,
            t0: 0,
            t1: 0.4,
          },
          {
            k: 'actor',
            who: 'echo',
            pose: 'p3',
            expr: 'focus',
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
          { t: 0, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: [70, 18, -52] },
          { t: 4.8, p: { a: 'hc', at: 'head', o: [0, 0.4, 0] }, l: [70, 19, -52] },
        ],
      },
      ev: [{ t: 0.05, sfx: 'glitch', vol: 0.35, rate: 0.9 }],
    },
    4.8,
  );
  // 辦公室：霍斯特的近景，鏡頭一下推近（動畫的變焦衝擊）
  T.add(
    {
      set: OFFICE,
      grade: { ...ROOMG, contrast: 1.38 },
      lb: false,
      st: {
        els: [
          HORST({ pose: 'p4', expr: 'smug', at: [720, 1820], h: 1900, in: null }),
          {
            k: 'lines',
            kind: 'focus',
            q: [0, 0, 1600, 900],
            color: 'rgba(255,220,180,0.35)',
            r: 0.4,
            n: 50,
            t0: 0,
            t1: 0.35,
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
          { t: 0, p: [0.4, 1.7, 3.2], l: [-2, 1.7, -6], fov: 40 },
          { t: 0.35, p: [0.4, 1.7, 2.9], l: [-2, 1.7, -6], fov: 30 },
          { t: 4, p: [0.35, 1.7, 2.75], l: [-2, 1.7, -6], fov: 29 },
        ],
      },
      ev: [{ t: 0, sfx: 'thud1', vol: 0.3, rate: 1.2 }],
    },
    4,
  );
  // 插入：往礦坑的航拍（荒野上空往北），左邊是霍斯特的格子
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.32 },
      lb: false,
      st: {
        els: [
          {
            k: 'panel',
            q: [
              [50, 60],
              [520, 60],
              [470, 840],
              [50, 840],
            ],
            t0: 0.6,
            in: 'left',
            fill: '#120a06',
            dots: 0.15,
            kids: [HORST({ pose: 'p6', at: [290, 1320], h: 1300, in: null })],
          },
        ],
      },
      cam: {
        fov: 46,
        hand: 0.05,
        ease: 'lin',
        keys: [
          { t: 0, p: { g: [40, 60], h: 30 }, l: { g: [62, -40], h: 8 } },
          { t: 5.4, p: { g: [52, 20], h: 26 }, l: { g: [70, -60], h: 10 } },
        ],
      },
      ev: [{ t: 0.2, sfx: 'distant', vol: 0.3, rate: 0.7 }],
    },
    5.4,
  );
  // 辦公室：霍斯特看著鏡頭（＝看著主角）；最後一句「乾淨的人好辦事」時眼睛的特寫格橫過畫面
  T.add(
    {
      set: OFFICE,
      grade: ROOMG,
      lb: false,
      st: {
        els: [
          HORST({ pose: 'p1', expr: 'scheme', at: [800, 1320], h: 1300, in: null }),
          {
            k: 'panel',
            q: [
              [-20, 300],
              [1620, 250],
              [1620, 520],
              [-20, 570],
            ],
            t0: 5.6,
            in: 'left',
            fill: '#0c0806',
            kids: [HORST({ pose: 'p1', expr: 'scheme', at: [800, 3260], h: 3400, in: null })],
          },
        ],
      },
      cam: {
        fov: 38,
        dof: 1,
        focus: 1,
        range: 0.5,
        ease: 'lin',
        keys: [
          { t: 0, p: [0.2, 1.7, 4.6], l: [0.2, 1.65, -6] },
          { t: 7.5, p: [0.2, 1.7, 3.6], l: [0.2, 1.65, -6] },
        ],
      },
      ev: [{ t: 5.6, sfx: 'thud1', vol: 0.4, rate: 0.8 }],
    },
    7.5,
  );
  // 0:56 通訊切斷：辦公室的遠景（霍斯特一個人、燈暗下來）→ 插畫的格子（他摸著後頸、桌上的舊合照）
  T.add(
    {
      set: OFFICE,
      grade: { ...ROOMG, exposure: 0.62, sat: 0.6 },
      lb: false,
      fo: 0.5,
      st: {
        els: [
          HORST({ pose: 'p9', at: [380, 900], h: 560, dim: 0.35, t1: 2.7 }), // 插畫的格子出來時退場
          {
            k: 'panel',
            q: [
              [880, 80],
              [1540, 80],
              [1540, 820],
              [800, 820],
            ],
            img: 'c1/c1_alone',
            focus: [0.35, 0.5],
            art: 'desk',
            tone: '#a0602a',
            dots: 0.22,
            t0: 2.4,
            in: 'fade',
            ind: 0.8,
          },
        ],
      },
      cam: {
        fov: 50,
        ease: 'lin',
        keys: [
          { t: 0, p: [3.5, 3.2, 5.6], l: [-1, 1.4, -2] },
          { t: 6, p: [4.2, 3.6, 5.8], l: [-1, 1.4, -2] },
        ],
      },
      ev: [{ t: 0.2, sfx: 'distant', vol: 0.2, rate: 0.5 }],
    },
    6,
  );

  // ---------- 1:02 R-07 ----------
  const HX = {
    id: 'hx',
    k: 'hero',
    p: [0, 46],
    yaw: 0,
    s: [
      { t: 0, go: [6, -22], ab: true },
      { t: 4.4, ab: false },
    ],
  };
  // 仰角：推進中的 R-07 從鏡頭上方掠過（一拍二）
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.32 },
      lb: false,
      koma: 2,
      hook: 'c1fxclear',
      actors: [HX, ...BASTILLE],
      st: {
        els: [
          {
            k: 'lines',
            kind: 'focus',
            q: [0, 0, 1600, 900],
            color: 'rgba(255,230,200,0.18)',
            r: 0.45,
            n: 40,
          },
        ],
      },
      cam: {
        fov: 30,
        hand: 0.06,
        follow: 10,
        keys: [
          { t: 0, p: { g: [3, 24], h: 0.4 }, l: { a: 'hx', o: [0, 1.5, 0] } },
          { t: 2, p: { g: [3, 24], h: 0.4 }, l: { a: 'hx', o: [0, 1.5, 0] }, fov: 36 },
        ],
      },
      ev: [
        { t: 0.1, sfx: 'boostUp', vol: 0.9, rate: 0.8 },
        { t: 0.2, shake: 0.2 },
      ],
    },
    2,
  );
  // 側面跟拍＋速度線
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.3 },
      lb: false,
      koma: 2,
      keep: true,
      st: { els: [SPEED(0, 2.5)] },
      cam: {
        fov: 34,
        hand: 0.1,
        follow: 14,
        keys: [
          { t: 0, p: { a: 'hx', at: 'base', o: [-12, 2, 1] }, l: { a: 'hx', o: [0, 1.2, -2] } },
          { t: 2.5, p: { a: 'hx', at: 'base', o: [-11, 2.2, -1] }, l: { a: 'hx', o: [0, 1.2, -3] } },
        ],
      },
      ev: [{ t: 0.1, sfx: 'boostUp', vol: 0.6, rate: 1 }],
    },
    2.5,
  );
  // BASTILLE 的瞄準鏡：鎖定 R-07、預警、開砲
  T.add(
    {
      set: WASTE,
      grade: { ...SCOPE, sat: 0.4 },
      lb: false,
      keep: true,
      koma: 2,
      st: {
        els: [
          { k: 'lines', kind: 'reticle', lock: 0, t1: 0.9 },
          { k: 'lines', kind: 'reticle', lock: 1, t0: 0.9 },
        ],
      },
      cam: {
        fov: 14,
        hand: 0.006,
        follow: 5,
        keys: [
          { t: 0, p: [72, 24, -46], l: { a: 'hx', o: [0, 1, 0] } },
          { t: 3.5, p: [72.3, 24.2, -46], l: { a: 'hx', o: [0, 1, 0] } },
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
  // 快速推進閃開（一拍二＋速度線＋慢動作）
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.35, chroma: 0.35 },
      lb: false,
      keep: true,
      koma: 2,
      st: { els: [SPEED(0.15, 0.9, 0.4)] },
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
  // 駕駛艙：擋風窗外是 3D，右下是 ECHO 的全像
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
            noBub: true,
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
          LIVE({ flt: 'grayscale(1) contrast(6) invert(1)' }),
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
  // 拉遠：煙裡衝出去的 R-07、遠方的陣地（一拍二）
  T.add(
    {
      set: WASTE,
      grade: { ...WEST, contrast: 1.3 },
      lb: false,
      keep: true,
      koma: 2,
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

  // ---------- 1:22 PV 式章名卡 ----------
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
            t0: cb(0.8),
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
        { t: cb(0.8), sfx: 'thud1', vol: 0.8, rate: 0.6 },
        { t: cb(0.8) + 0.05, shake: 0.2 },
      ],
    },
    4.5,
  );

  // 對白放進當時的那一鏡（時間換成鏡頭裡的秒數）
  for (const [at, line, dur] of LINES) {
    let S = T.shots[0];
    for (const s of T.shots) if (s.at <= at) S = s;
    (S.ev = S.ev || []).push(sub(line, +(at - S.at).toFixed(2), dur));
  }
  return bare(T).def({
    title: '第一章　開場',
    music: [{ at: 0, track: 'cine_c1', vol: 0.85, fadeIn: 2, fadeOut: [T.at - 3, 3] }],
  });
}
