// 第 1 章開場（ch1-intro.js）用的場景、調色與小工具：荒野的地圖、夕陽的調色、BASTILLE 瞄準鏡的調色、
// 藏地圖物件的 bare、字幕 sub。效果在 game/cine-c1.js（c1antenna、c1bare、c1fxclear）。
import { W, parseLine } from './kit.js';

// 場景：開場整段在同一張荒野（只建一次地圖，換鏡頭不會卡住）
// 荒野（seed 6121）：原點在地圖的西北角，+X／+Z 是地圖內，北邊（−Z）與西邊（−X）是邊界外的空曠沙地；
// 演員要留在地圖內（局部 x ≥ −5、z ≥ −28）。局部 x 60～90、z ≤ −50 是高 16 m 的台地（BASTILLE 的砲台），
// 西緣 x ≈ −2 一帶是平的（遠景、對決）。地圖物件由 c1bare 藏起來，只剩地形
export const WASTE = W('wasteland', { seed: 6121, tod: 'dusk', clear: 45 });

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
