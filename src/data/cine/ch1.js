// 第 1 章 荒野的訊號：章末（開場在 ch1-intro.js，過場改版第 1 期的 2D 舞台試做）（docs/cinematics-storyboard.md 第二版「西部對決」）。台詞＝CHAPTER_TEXT[1]
// 鏡頭語言照 Leone 的西部片：極遠景的剪影、長停留（8～12 秒）、對決時在眼燈／武器／遠景之間來回切、越切越短，
// 槍響 → 全黑 → 宿敵跪倒；章名是西部片的大字直接壓在遠景上；章末是營火旁一鏡到底拉遠到星空。
// 專用的效果在 game/cine-c1.js（c1ecu、c1antenna、c1fire、c1sand、c1glint、c1scope、c1pulse、c1title、c1chan、c1stars、c1heat）。
import { CHAPTER_TEXT, pickLines } from '../story.js';
import { W, parseLine, timeline } from './kit.js';

// 場景：開場整段在同一張荒野（只建一次地圖，換鏡頭不會卡住）；章末是夜裡的沙丘
// 荒野（seed 6121）：原點在地圖的西北角，+X／+Z 是地圖內，北邊（−Z）與西邊（−X）是邊界外的空曠沙地；
// 演員要留在地圖內（局部 x ≥ −5、z ≥ −28）。局部 x 60～90、z ≤ −50 是高 16 m 的台地（BASTILLE 的砲台），
// 西緣 x ≈ −2 一帶是平的（遠景、對決）。地圖物件由 c1bare 藏起來，只剩地形
export const WASTE = W('wasteland', { seed: 6121, tod: 'dusk', clear: 45 });
const NIGHT = W('dunes', { seed: 6115, tod: 'night', clear: 30 });

// 調色：暖橘、高對比、顆粒、暗角。太陽的方向每一鏡依鏡頭擺（逆光剪影）：WEST 在 −Z（sunAz 270）、EAST 在 +X
export const WEST = {
  sunAz: 270,
  sunEl: 6,
  sunWarm: 0.95,
  sunK: 1.15,
  temp: 0.42,
  contrast: 1.3,
  sat: 0.82,
  tintHi: '#ffa050',
  tintHiK: 0.5,
  tintLo: '#2a1206',
  tintLoK: 0.45,
  grain: 0.42,
  vignette: 0.62,
  chroma: 0.1,
  fogK: 2.2,
  fogColor: '#d08850',
  fogColorK: 0.55,
  dust: 0.5,
  bloom: 1.05,
};
// BASTILLE 的瞄準鏡：紅、低彩度
export const SCOPE = {
  ...WEST,
  sat: 0.35,
  temp: 0.2,
  tintHi: '#ff6040',
  tintHiK: 0.6,
  contrast: 1.45,
  grain: 0.6,
  vignette: 0.3,
};
// 營火的夜：冷藍的暗部＋火光的暖色
const FIRE = {
  sunAz: 270,
  sunEl: 30,
  sunK: 0.22,
  hemiK: 0.4,
  exposure: 0.9,
  sky: 'cloud',
  skyTop: '#0a1636',
  cloud: 0.06,
  fogColor: '#0c1220',
  fogColorK: 0.75,
  fogK: 1.6,
  tintLo: '#0c1630',
  tintLoK: 0.55,
  tintHi: '#ffa060',
  tintHiK: 0.35,
  contrast: 1.2,
  sat: 0.85,
  grain: 0.4,
  vignette: 0.6,
  bloom: 1.2,
  dust: 0,
};

// 每個地圖鏡頭都掛 c1bare：原點附近的地圖物件藏起來（空無一物的荒野）；半徑依場景
const BARE_R = { wasteland: 130, desert: 70, dunes: 60 };
// 同時把 drop 補齊：同一張地圖前面所有鏡頭的演員（不只上一鏡）都列進去，
// 這樣跳著看（劇場的下一鏡、換場景卡住跳過幾鏡）也不會留下別鏡的演員；keep 的鏡頭保留同一組的演員
export function bare(T) {
  let key = '',
    seen = new Set(),
    group = new Set();
  for (const s of T.shots) {
    const k = JSON.stringify(s.set || { k: 'black' });
    if (k !== key) {
      key = k;
      seen = new Set();
      group = new Set();
    }
    const own = (s.actors || []).map((a) => a.id);
    if (!s.keep) group = new Set();
    const drop = [...seen].filter((id) => !group.has(id) && !own.includes(id));
    if (drop.length) s.drop = drop;
    for (const id of own) {
      seen.add(id);
      group.add(id);
    }
    if (s.set && s.set.k === 'world') {
      s.hook = ['c1bare', ...[].concat(s.hook || [])];
      if (s.bare == null) s.bare = BARE_R[s.set.theme] || 80;
    }
  }
  return T;
}
export const sub = (line, t, dur, who) => {
  const L = parseLine(line);
  return { t, sub: L.text, who: who === undefined ? L.who : who, dur };
};
// 章末：營火旁的一鏡到底（不剪接），從火光裡的主角慢慢拉遠、抬到星空；四家委託方只有聲音（攔截的頻道），
// 最後 3 秒軌道站的光點閃一下
export function ch1Outro() {
  const L = pickLines(CHAPTER_TEXT[1].outro);
  const T = timeline();
  const D = 38;
  T.add(
    {
      set: NIGHT,
      grade: FIRE,
      fi: 3,
      fo: 2.5,
      hook: ['c1fire', 'c1kneel'],
      kneel: { hk: [1.0, -0.14] },
      fire: { at: [0, 0] },
      ov: ['c1stars', 'c1chan'],
      stars: { on: [10, 22], station: [33, 36], dir: [-0.44, 0.5, -0.74] },
      chans: [
        { t: 11.6, d: 4, who: 'castron', n: 1 },
        { t: 15.8, d: 4, who: 'aetheric', n: 2 },
        { t: 20, d: 3.6, who: 'veerwell', n: 3 },
        { t: 23.8, d: 4.4, who: 'sancta', n: 4 },
      ],
      actors: [
        { id: 'hk', k: 'hero', p: [-3.2, 0], yaw: 270, s: [] },
        // 營火旁的拾荒者：坐著，軌道站的光點閃一下時一個人站起來
        {
          id: 'sc1',
          k: 'human',
          who: 'man',
          p: [0.75, -0.55],
          anim: 'Sitting',
          s: [
            { t: 0, face: [0, 0] },
            { t: 32.6, anim: 'Standing' },
          ],
        },
        {
          id: 'sc2',
          k: 'human',
          who: 'womanc',
          p: [0.25, 0.85],
          anim: 'Sitting',
          s: [{ t: 0, face: [0, 0] }],
        },
      ],
      cam: {
        fov: 30,
        hand: 0.03,
        ease: 'lin',
        keys: [
          { t: 0, p: [4.4, 1.1, 0.9], l: { a: 'hk', at: 'head', o: [0, -0.6, 0] } },
          { t: 9, p: [6.5, 3.6, 6], l: { a: 'hk', o: [0, 1.2, 0] }, fov: 33 },
          { t: 19, p: [12, 8, 14], l: [-2, 0.5, 0], fov: 40 },
          { t: 29, p: [18, 13, 22], l: [-10, 14, -18], fov: 46 },
          { t: D, p: [21, 16, 26], l: [-30, 62, -56], fov: 50 },
        ],
      },
      ev: [
        { t: 0.2, sfx: 'distant', vol: 0.2, rate: 0.35 },
        sub(L[0], 1.6, 4.4),
        sub(L[1], 6.4, 4.6),
        sub(L[2], 11.8, 3.8, null),
        sub(L[3], 16, 3.8, null),
        sub(L[4], 20.2, 3.4, null),
        sub(L[5], 24, 4.2, null),
        sub(L[6], 28.6, 3.4),
        sub(L[7], 32.4, 4.2),
        { t: 34.2, sfx: 'glitch', vol: 0.25, rate: 0.5 },
      ],
    },
    D,
  );
  return bare(T).def({
    title: '第一章　章末',
    music: [{ at: 0, track: 'cine_c1', vol: 0.8, fadeIn: 3, fadeOut: [T.at - 4, 4] }],
  });
}
