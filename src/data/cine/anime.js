// 3D 動畫化（docs/cine-redesign-design.md 第十節）的劇本小工具：第 2 章起的各段共用。
// 第 1 章開場（ch1-intro.js）是試做，有自己的一份；新的段落用這裡的。
import { parseLine } from './kit.js';

// 全畫面的 3D（舞台上的格子）；o 可以加 flt、tone、dots…
export const LIVE = (o = {}) => ({ k: 'panel', q: [0, 0, 1600, 900], bd: 0, live: true, ...o });
// 立繪疊在 3D 上（對白用字幕條：noBub）
export const ACT = (who, o = {}) => ({ k: 'actor', who, noBub: true, in: 'fade', ...o });
// 速度線（橫的，跟拍時）、集中線
export const SPEED = (t0, t1, a = 0.22) => ({
  k: 'lines',
  kind: 'speed',
  q: [0, 0, 1600, 900],
  color: `rgba(255,236,210,${a})`,
  n: 34,
  t0,
  t1,
});
export const FOCUS = (t0, t1, color = 'rgba(255,230,200,0.3)', r = 0.4) => ({
  k: 'lines',
  kind: 'focus',
  q: [0, 0, 1600, 900],
  color,
  r,
  n: 60,
  t0,
  t1,
});
// 衝擊畫格（反白的線稿＋集中線）：鏡頭的 st
export const IMPACT = () => ({
  els: [
    LIVE({ flt: 'grayscale(1) contrast(6) invert(1)' }),
    { k: 'lines', kind: 'focus', q: [0, 0, 1600, 900], color: '#000', r: 0.2, n: 120 },
  ],
});
// 地點的字卡（左上：色條＋地名＋英文）
export const LOC = (name, en, color = '#fff', t0 = 0.4) => [
  { k: 'block', q: [40, 60, 8, 74], color, t0, in: 'fade' },
  {
    k: 'text',
    s: name,
    at: [66, 84],
    size: 40,
    al: 'left',
    color: '#f4ece0',
    stroke: '#000',
    sw: 6,
    t0: t0 + 0.1,
    in: 'left',
    ls: 6,
  },
  {
    k: 'text',
    s: en,
    at: [68, 122],
    size: 18,
    font: 'mono',
    al: 'left',
    color,
    stroke: null,
    t0: t0 + 0.4,
    in: 'fade',
    ls: 8,
  },
];
// 斜切的格子（插畫或立繪）：q＝四個點；img 或 kids
export const PANEL = (q, o = {}) => ({ k: 'panel', q, in: 'right', dots: 0.25, ...o });
// 立繪放大當特寫格：臉在主圖上緣約 15～20%，格子中心 cy、高 h → at 的 y
export const faceY = (cy, h) => Math.round(cy + 0.82 * h);

// 對白放進當時的那一鏡：lines＝[[過場的秒數, 台詞（「名字：「…」」或旁白）, 字幕的秒數, 說話者（可省）]]
export function placeLines(T, lines) {
  for (const [at, line, dur, who] of lines) {
    let S = T.shots[0];
    for (const s of T.shots) if (s.at <= at) S = s;
    const p = parseLine(line);
    (S.ev = S.ev || []).push({
      t: +(at - S.at).toFixed(2),
      sub: p.text,
      who: who === undefined ? p.who : who,
      dur,
    });
  }
}

// 室內的調色（第 1 章的辦公室調出來的）：主光從右上方、曝光補一點、不畫風格的天空（game/cine.js 的 room）
export const ROOM_GRADE = {
  sunAz: 150,
  sunEl: 50,
  sunK: 1.1,
  exposure: 1.15,
  temp: 0.35,
  contrast: 1.3,
  sat: 0.82,
  fogK: 0,
  dust: 0,
  grain: 0.3,
  vignette: 0.55,
  chroma: 0.1,
  bloom: 1.05,
};
// 新建的室內：霍斯特的辦公室（render/cine-office.js）、艾瑟立克的研究所（render/cine-lab.js）
export const OFFICE = {
  k: 'room',
  kind: 'castron',
  sky: 0x070a12,
  key: 0xffb070,
  keyI: 1.5,
  hemi: 0x6a7a9a,
  hemiI: 0.9,
  far: 500,
};
export const LAB = {
  k: 'room',
  kind: 'aetheric',
  sky: 0x04070d,
  key: 0xdff4ff,
  keyI: 1.3,
  hemi: 0x9ab8d8,
  hemiI: 1.0,
  far: 400,
};
// 辦公室窗外停機坪上的具名 AC（模型演員；室內的倍率是 1，所以機甲 scale 3）
export const PARKED = (ace, o = {}) => ({
  id: 'parked',
  k: 'model',
  mech: true,
  ace,
  p: [3.2, -4, -14],
  yaw: 165,
  scale: 3,
  ...o,
});

// 同一個場景前面所有鏡頭的演員，不屬於這一鏡（也不是 keep 的同一組）的都移除（timeline 只移除上一鏡的）；
// 劇場跳鏡頭、換場景後回來也不會留下別鏡的演員。T.def 之前呼叫
export function dropAll(T) {
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
  }
  return T;
}
