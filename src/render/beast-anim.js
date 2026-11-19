// 獅型機獸的動作。和機甲的動作同樣的分層：
// 步伐（依相位算每隻腳的落點，腿用解析解）→ 身體的起伏、俯仰、脊椎伸縮 → 動作片段（急停、跳躍、攻擊、受擊、失衡、擊破：關鍵影格，疊在步伐上）
// → 頭、頸、尾、鬃甲、砲塔的附加動作，全部經過彈簧（mech-spring.js）。
// rig＝buildLion 的回傳（nodes、piv）；st＝{ t 時間, v 前進速度（公尺／秒）, w 轉向速度（弧度／秒，正＝往左轉）,
//   act: { name, t } 動作片段與它開始後的秒數, gy: { fl, fr, bl, br } 各腳的地面高度差（貼地形）, root: true 時片段的位移直接套在整隻上（預覽用）}。
// 只改關節群組的旋轉、胸的高度、鬃甲的縮放、眼睛的亮度；片段要整隻移動的量寫在 rig.rootY／rig.rootF（遊戲的實體自己用）。
// 平面的座標：f＝往前（glTF 的 +Z）、y＝往上；繞 X 的旋轉角（遊戲座標）正的＝往前的東西往上抬（在 f–y 平面逆時針）。
import { MANTIS_CLIPS, animateMantis } from './beast-anim-mantis.js';
import { RAPTOR_CLIPS, animateRaptor } from './beast-anim-raptor.js';
import { SCORP_CLIPS, animateScorpion } from './beast-anim-scorpion.js';
import { spring } from './mech-spring.js';

const TAU = Math.PI * 2;
// 步態：T＝一個循環的秒數、b＝著地的比例、ph＝各腳的相位（後左 bl、前左 fl、後右 br、前右 fr）、lift＝抬腳高度
// 每隻機獸一組設定（rig.kind）：步態、速度門檻、站姿的基準、起伏與脊椎伸縮的倍率
const PROFILES = {
  // 獅型：厚重
  lion: {
    gaits: {
      walk: { T: 1.2, b: 0.66, ph: { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 }, lift: 0.55 },
      trot: { T: 0.8, b: 0.5, ph: { bl: 0, fr: 0, br: 0.5, fl: 0.5 }, lift: 0.8 },
      run: { T: 0.62, b: 0.3, ph: { bl: 0, br: 0.1, fr: 0.48, fl: 0.58 }, lift: 1.0 },
    },
    trotV: 7.5,
    runV: 16,
    maxStride: 4.4, // 一步最遠（公尺）；超過就加快步頻
    base: { by: 0, nx: 0, hx: 0 },
    bobK: 1,
    flexK: 1,
  },
  // 劍齒虎型：低伏、步頻快、起伏小、奔跑時脊椎伸縮大；stalk＝潛行（st.stalk）
  tiger: {
    gaits: {
      stalk: { T: 1.7, b: 0.76, ph: { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 }, lift: 0.3 },
      walk: { T: 1.0, b: 0.64, ph: { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 }, lift: 0.42 },
      trot: { T: 0.64, b: 0.5, ph: { bl: 0, fr: 0, br: 0.5, fl: 0.5 }, lift: 0.6 },
      run: { T: 0.5, b: 0.28, ph: { bl: 0, br: 0.1, fr: 0.48, fl: 0.58 }, lift: 0.9 },
    },
    trotV: 7.5,
    runV: 16,
    maxStride: 4.6,
    base: { by: -0.3, nx: -0.1, hx: 0.08 }, // 肩低、頭壓在肩線以下
    stalk: { by: -0.95, nx: -0.16, hx: 0.16 }, // 潛行時再壓低
    bobK: 0.55,
    flexK: 1.3,
  },
  // 猩猩型：指節著地的步行（四拍、肩左右晃）、快的時候前後各一組的躍進；站立與手臂的動作在片段
  gorilla: {
    gaits: {
      walk: { T: 1.25, b: 0.66, ph: { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 }, lift: 0.55 },
      trot: { T: 0.9, b: 0.56, ph: { bl: 0, fr: 0.06, br: 0.5, fl: 0.56 }, lift: 0.7 },
      run: { T: 0.66, b: 0.34, ph: { bl: 0, br: 0.1, fr: 0.48, fl: 0.58 }, lift: 0.9 },
    },
    trotV: 5,
    runV: 10,
    maxStride: 4.2,
    base: { by: 0, nx: 0, hx: 0 },
    bobK: 1.2,
    flexK: 0.55,
    sway: 0.05,
  },
  // 鱷龜型：只會爬（對角兩腳同步、很慢）、背甲左右搖、不跑不跳；待機時嘴微張露出誘餌
  // 熊型：蹠行的沉重步伐、肩峰左右晃；能小跑但不快；沒有脊椎伸縮
  bear: (() => {
    const walk = { T: 1.5, b: 0.68, ph: { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 }, lift: 0.5 };
    const trot = { T: 0.95, b: 0.52, ph: { bl: 0, fr: 0, br: 0.5, fl: 0.5 }, lift: 0.7 };
    return {
      gaits: { walk, trot, run: trot },
      trotV: 5,
      runV: 1e9,
      maxStride: 3.6,
      base: { by: 0, nx: 0, hx: 0 },
      bobK: 1.3,
      flexK: 0,
      sway: 0.055,
    };
  })(),
  turtle: (() => {
    const crawl = { T: 2.0, b: 0.7, ph: { bl: 0, fr: 0.06, br: 0.5, fl: 0.56 }, lift: 0.4 };
    return {
      gaits: { walk: crawl, trot: crawl, run: crawl },
      trotV: 1e9,
      runV: 1e9,
      maxStride: 2.6,
      base: { by: 0, nx: 0, hx: 0 },
      bobK: 0.6,
      flexK: 0,
      sway: 0.07,
      idleJaw: -0.14,
    };
  })(),
};

// ---------- 動作片段 ----------
// 關鍵影格：{ t 秒, 頻道… }，沒寫的頻道＝0；影格之間以平滑曲線內插，最後一格之後停在那一格。頻道：
//   by 身體高度、pitch 俯仰（正＝前半身抬起）、roll 側傾、yaw 胸的偏航、flex 脊椎（正＝臀部往下收）、hy 腰臀的偏航
//   <腳>F／L／C／X／P／R＝那隻腳的落點往前、抬高、掌骨收起（0～1）、往外、腳掌的角度（弧度，正＝腳尖翹起）、腳掌側轉（弧度，正＝往外翻）；nx／ny 頸、hx／hdy／hz 頭、jaw 下顎（負＝張開）
//   tx／ty 尾（tx 負＝揚起）、mane 鬃甲張開（0～1）、glow 眼睛的亮度（−1 熄滅～1）、shake 顫抖
//   ry／rf／rs／ryaw 整隻的高度、往前與往側面的位移、轉向；free 腿放鬆（1＝不貼地，跟著身體）、kick 放鬆時亂蹬
//   bz 身體往前（公尺）、arm 手臂模式（0～1：前肢不貼地，照 <腳>S／A／E／T 擺：肩的前後、往外張、肘彎、上臂繞自己的軸轉（正＝前臂往內））、fire 爐火（−1～2）
//   wig 臀部左右微擺、gun 莢艙／砲管的俯仰、lid 莢艙的蓋子（0～1）、ext 內頸伸縮（公尺）、tuck 四肢與尾巴縮進殼裡（0～1）
const FEET = (o) => ({ flX: o, frX: o, blX: o * 0.8, brX: o * 0.8 });
const ROAR = { by: -0.25, pitch: 0.1, nx: 0.36, hx: 0.28, jaw: -0.78, mane: 1, glow: 1, tx: -0.5, shake: 1 };
export const BEAST_CLIPS = {
  // 急停：前腳前撐、臀部下沉
  brake: [
    {
      t: 0.12,
      by: -0.45,
      pitch: 0.09,
      flex: 0.12,
      flF: 1.0,
      frF: 1.0,
      blF: 0.6,
      brF: 0.6,
      tx: -0.3,
      nx: -0.08,
    },
    { t: 0.4, by: -0.3, pitch: 0.05, flex: 0.08, flF: 0.7, frF: 0.7, blF: 0.4, brF: 0.4, tx: -0.15 },
    { t: 0.75 },
  ],
  // 跳躍：蹲壓 → 前半身先揚起、後腳蹬出 → 空中收腳 → 前腳先著地、壓低緩衝
  jump: [
    { t: 0.3, by: -0.95, pitch: -0.06, flex: 0.1, blF: 0.35, brF: 0.35, tx: 0.2 },
    {
      t: 0.44,
      by: 1.3,
      pitch: 0.72,
      flex: -0.45,
      ry: 0.9,
      flL: 1.6,
      frL: 1.6,
      flF: 0.8,
      frF: 0.8,
      flC: 1,
      frC: 1,
      blF: -1.5,
      brF: -1.5,
      nx: -0.15,
      tx: -0.3,
    },
    {
      t: 0.8,
      ry: 4.2,
      by: 0.4,
      pitch: 0.26,
      flex: 0.2,
      flL: 1.4,
      frL: 1.4,
      blL: 1.3,
      brL: 1.3,
      flC: 1,
      frC: 1,
      blC: 1,
      brC: 1,
      tx: -0.4,
    },
    {
      t: 1.1,
      ry: 1.3,
      pitch: -0.16,
      flF: 1.0,
      frF: 1.0,
      flL: 0.3,
      frL: 0.3,
      blL: 1.0,
      brL: 1.0,
      blC: 0.8,
      brC: 0.8,
    },
    { t: 1.2, by: -0.5, pitch: -0.1, flF: 0.6, frF: 0.6, blL: 0.4, brL: 0.4, blF: 0.5, brF: 0.5 },
    { t: 1.34, by: -0.9, pitch: 0.05, flex: 0.1, blF: 0.3, brF: 0.3, tx: 0.2 },
    { t: 1.7 },
  ],
  // 撲擊：壓低前半身、臀部抬高、尾巴繃直 → 前半身揚起撲出（前腳張開、爪子朝前）→ 落地
  pounce: [
    {
      t: 0.5,
      by: -0.85,
      pitch: -0.13,
      flex: -0.06,
      tx: -0.55,
      mane: 1,
      jaw: -0.12,
      glow: 0.6,
      nx: 0.12,
      shake: 0.4,
    },
    {
      t: 0.62,
      by: 1.2,
      pitch: 0.7,
      flex: -0.42,
      ry: 1.7,
      rf: 4,
      flF: 1.9,
      frF: 1.9,
      flL: 2.4,
      frL: 2.4,
      flP: 0.7,
      frP: 0.7,
      flR: 0.6,
      frR: 0.6,
      flX: 0.3,
      frX: 0.3,
      blF: -1.7,
      brF: -1.7,
      nx: -0.2,
      jaw: -0.55,
      mane: 1,
      glow: 1,
      tx: -0.2,
    },
    {
      t: 0.86,
      ry: 1.4,
      rf: 11.5,
      by: 0.3,
      pitch: 0.05,
      flF: 1.9,
      frF: 1.9,
      flL: 1.2,
      frL: 1.2,
      flP: -0.4,
      frP: -0.4,
      flR: -0.3,
      frR: -0.3,
      blL: 1.0,
      brL: 1.0,
      blC: 0.8,
      brC: 0.8,
      jaw: -0.5,
      mane: 0.6,
      glow: 1,
    },
    { t: 1.0, rf: 14, by: -0.75, pitch: -0.12, flF: 0.7, frF: 0.7, blF: 0.5, brF: 0.5, jaw: -0.1, glow: 0.4 },
    { t: 1.25, rf: 14, by: -0.4, pitch: 0.03 },
    { t: 1.7, rf: 14 },
  ],
  // 爪擊（左前腳）：前半身揚起、前腳高舉、腳掌翹起約 45° → 往前下方揮（腳掌往下扣）→ 拍在地上
  clawL: [
    {
      t: 0.34,
      by: 1.15,
      pitch: 0.58,
      flex: -0.45,
      yaw: 0.2,
      roll: -0.06,
      flL: 3.6,
      flF: 0.2,
      flC: 0.3,
      flX: 0.5,
      flP: 0.8,
      flR: 0.85,
      frL: 1.2,
      frC: 0.3,
      ny: 0.1,
      nx: -0.12,
      mane: 0.6,
      glow: 0.5,
    },
    {
      t: 0.45,
      by: 0.5,
      pitch: 0.2,
      flex: -0.15,
      yaw: -0.22,
      flL: 2.0,
      flF: 2.5,
      flX: -0.5,
      flP: -0.55,
      flR: -0.6,
      frL: 0.2,
      jaw: -0.2,
      mane: 0.5,
      glow: 0.6,
    },
    { t: 0.55, by: -0.35, yaw: -0.26, pitch: -0.12, flF: 1.8, flX: -0.6, jaw: -0.15 },
    { t: 0.8, by: -0.2, yaw: -0.1, flF: 1.0, flX: -0.3 },
    { t: 1.15 },
  ],
  // 咬：頭後縮張嘴 → 往前咬合
  bite: [
    { t: 0.3, by: -0.1, pitch: 0.04, nx: 0.16, hx: 0.12, jaw: -0.62, mane: 0.4, glow: 0.4 },
    { t: 0.4, by: -0.3, pitch: -0.1, nx: -0.3, hx: -0.12, jaw: -0.62, flF: 0.3, frF: 0.3, glow: 0.6 },
    { t: 0.46, by: -0.3, pitch: -0.1, nx: -0.32, hx: -0.14, jaw: 0.06 },
    { t: 0.7, by: -0.15, nx: -0.1 },
    { t: 1.0 },
  ],
  // 甩尾：身體側轉、尾巴捲向另一側 → 橫掃
  tail: [
    { t: 0.4, by: -0.2, yaw: -0.25, hy: -0.3, ty: -0.55, tx: -0.1, ny: 0.2, hdy: 0.2 },
    { t: 0.56, by: -0.25, yaw: 0.2, hy: 0.5, ty: 0.9, tx: -0.15 },
    { t: 0.75, yaw: 0.12, hy: 0.3, ty: 0.5 },
    { t: 1.25 },
  ],
  // 咆哮（範圍技）：四腳撐開、壓低 → 仰頭、鬃甲張開、眼睛變亮
  roar: [
    { t: 0.5, by: -0.55, pitch: -0.05, nx: -0.2, hx: -0.1, jaw: -0.1, mane: 0.3, ...FEET(0.45) },
    { t: 0.8, ...ROAR, ...FEET(0.45) },
    { t: 1.75, ...ROAR, ...FEET(0.45) },
    { t: 2.3 },
  ],
  // 小受擊（從左邊被打）：身體與頭往右甩開
  hitL: [
    { t: 0.07, by: -0.14, roll: -0.09, yaw: -0.07, hdy: -0.32, ny: -0.12, hz: -0.1, jaw: -0.1 },
    { t: 0.5 },
  ],
  // 失衡：前腳跪下、頭垂地、尾巴癱軟（玩家的輸出時機），之後站起來
  stagger: [
    {
      t: 0.3,
      by: -1.2,
      pitch: -0.3,
      nx: -0.32,
      hx: -0.3,
      jaw: -0.25,
      tx: 0.35,
      glow: -0.7,
      roll: 0.04,
      shake: 0.3,
    },
    { t: 2.4, by: -1.25, pitch: -0.31, nx: -0.34, hx: -0.3, jaw: -0.2, tx: 0.4, glow: -0.7, roll: 0.04 },
    { t: 2.75, by: -0.5, pitch: -0.08, nx: 0.05, glow: 0.2, shake: 0.4 },
    { t: 3.1 },
  ],
  // 擊破：前腳跪下 → 側倒 → 掙扎一下 → 熄火（停在最後一格）
  death: [
    { t: 0.35, by: -1.2, pitch: -0.28, nx: -0.3, hx: -0.25, jaw: -0.3, tx: 0.3, glow: -0.3, shake: 0.6 },
    { t: 0.8, by: -1.6, pitch: -0.2, roll: 0.35, nx: -0.2, jaw: -0.35, tx: 0.35, glow: -0.3, free: 0.3 },
    { t: 1.25, by: -3.55, roll: 1.38, nx: -0.1, hx: -0.1, jaw: -0.4, tx: 0.4, glow: 0.2, free: 1, ty: 0.3 },
    {
      t: 1.6,
      by: -3.4,
      roll: 1.3,
      nx: 0.12,
      hx: 0.1,
      jaw: -0.5,
      tx: 0.3,
      glow: 0.4,
      free: 1,
      ty: 0.3,
      shake: 1,
    },
    {
      t: 2.3,
      by: -3.55,
      roll: 1.38,
      nx: -0.12,
      hx: -0.12,
      jaw: -0.28,
      tx: 0.45,
      glow: -1,
      free: 1,
      ty: 0.35,
    },
  ],
};
// ---------- 劍齒虎型的片段（低伏、迅捷）----------
// 連續爪擊：左右左三連，邊打邊往前壓
const claw3 = () => {
  const out = [];
  let t = 0,
    rf = 0;
  for (const [a, b] of [
    ['fl', 'fr'],
    ['fr', 'fl'],
    ['fl', 'fr'],
  ]) {
    const sg = a === 'fl' ? 1 : -1;
    out.push({
      t: t + 0.2,
      by: 0.55,
      pitch: 0.32,
      flex: -0.26,
      yaw: 0.16 * sg,
      rf,
      [a + 'L']: 3.1,
      [a + 'P']: 0.7,
      [a + 'R']: 0.85,
      [a + 'X']: 0.4,
      [b + 'L']: 0.5,
      glow: 0.5,
    });
    out.push({
      t: t + 0.28,
      by: 0.2,
      pitch: 0.08,
      yaw: -0.22 * sg,
      rf: rf + 1,
      [a + 'F']: 2.4,
      [a + 'L']: 1.4,
      [a + 'R']: -0.6,
      [a + 'P']: -0.5,
      [a + 'X']: -0.5,
      jaw: -0.2,
      glow: 0.6,
    });
    out.push({ t: t + 0.36, by: -0.3, pitch: -0.1, yaw: -0.2 * sg, rf: rf + 1.6, [a + 'F']: 1.6 });
    t += 0.34;
    rf += 1.6;
  }
  out.push({ t: t + 0.55, rf });
  return out;
};
// 側跳（往右；rs 正＝遊戲座標 +x）
const DODGE = [
  { t: 0.1, by: -0.7, roll: 0.1, flX: 0.2, blX: 0.2 },
  {
    t: 0.2,
    by: 0.1,
    ry: 1.0,
    rs: 3,
    roll: -0.16,
    flL: 0.8,
    frL: 0.8,
    blL: 0.6,
    brL: 0.6,
    flC: 0.6,
    frC: 0.6,
    tx: -0.2,
    ty: -0.4,
  },
  { t: 0.38, ry: 0.6, rs: 9, roll: -0.08, flL: 0.5, frL: 0.5, blL: 0.5, brL: 0.5, ty: -0.3 },
  { t: 0.48, rs: 11, by: -0.75, roll: 0.12, frX: 0.3, brX: 0.3, ty: 0.3 },
];
Object.assign(BEAST_CLIPS, {
  // 側跳：橫向彈開約一個身長
  tDodgeR: [...DODGE, { t: 0.75, rs: 11 }],
  // 側跳接爪擊：落地瞬間用內側的前腳橫掃
  tDodgeClawR: [
    ...DODGE,
    { t: 0.6, rs: 11, by: -0.3, yaw: -0.3, flL: 1.7, flX: 0.9, flR: 0.7, flP: 0.4, glow: 0.5 },
    { t: 0.7, rs: 11, by: -0.35, yaw: 0.36, flL: 0.9, flF: 1.9, flX: -0.9, flR: -0.7, jaw: -0.2, glow: 0.6 },
    { t: 0.82, rs: 11, by: -0.3, yaw: 0.2, flF: 1.0, flX: -0.4 },
    { t: 1.2, rs: 11 },
  ],
  // 甩身急轉：前腳釘住、後半身甩過去，回頭 180°
  tSpinL: [
    { t: 0.12, by: -0.45, yaw: 0.35, hy: -0.4, ny: 0.3, hdy: 0.3, ty: -0.5 },
    {
      t: 0.3,
      by: -0.3,
      ryaw: 2.1,
      yaw: 0.2,
      hy: 0.6,
      ny: 0.2,
      ty: 0.8,
      blL: 0.5,
      brL: 0.5,
      blX: 0.4,
      brX: -0.2,
    },
    { t: 0.44, by: -0.4, ryaw: 3.1416, hy: 0.2, ty: 0.4 },
    { t: 0.65, ryaw: 3.1416 },
  ],
  // 劍齒下刺（招牌技）：前半身揚起、頭後仰張嘴 → 由上往下把劍齒釘下去
  tFang: [
    {
      t: 0.42,
      by: 1.25,
      pitch: 0.62,
      flex: -0.45,
      nx: 0.32,
      hx: 0.36,
      jaw: -0.95,
      flL: 1.6,
      frL: 1.6,
      flC: 0.5,
      frC: 0.5,
      glow: 0.7,
      shake: 0.4,
      tx: -0.4,
    },
    { t: 0.5, by: -0.3, pitch: -0.22, nx: -0.3, hx: -0.3, jaw: -0.95, flF: 0.8, frF: 0.8, rf: 2, glow: 1 },
    {
      t: 0.56,
      by: -0.8,
      pitch: -0.3,
      nx: -0.42,
      hx: -0.34,
      jaw: -0.85,
      flF: 0.9,
      frF: 0.9,
      rf: 2.6,
      glow: 1,
      shake: 1,
    },
    {
      t: 0.95,
      by: -0.8,
      pitch: -0.3,
      nx: -0.42,
      hx: -0.34,
      jaw: -0.8,
      flF: 0.9,
      frF: 0.9,
      rf: 2.6,
      glow: 0.4,
    },
    { t: 1.35, rf: 2.6 },
  ],
  // 撲咬：伏到最低、臀部微擺、尾端抖動 → 前半身揚起撲出去、落下時咬合
  tLunge: [
    { t: 0.45, by: -1.2, pitch: -0.05, nx: -0.08, hx: 0.12, wig: 1, glow: 0.6, tx: -0.1, shake: 0.2 },
    // 撲出：前半身高高揚起（使用者定案）、前腳舉高張開、腳掌翹起外翻
    {
      t: 0.56,
      by: 1.15,
      pitch: 0.68,
      flex: -0.42,
      ry: 1.2,
      rf: 4.5,
      flF: 2.0,
      frF: 2.0,
      flL: 2.6,
      frL: 2.6,
      flP: 0.7,
      frP: 0.7,
      flR: 0.6,
      frR: 0.6,
      flX: 0.3,
      frX: 0.3,
      blF: -1.9,
      brF: -1.9,
      nx: -0.22,
      jaw: -0.85,
      glow: 1,
      tx: -0.3,
    },
    {
      t: 0.76,
      by: 0.45,
      pitch: 0.22,
      ry: 1.3,
      rf: 14.5,
      flF: 2.0,
      frF: 2.0,
      flL: 1.5,
      frL: 1.5,
      flP: -0.4,
      frP: -0.4,
      flR: -0.3,
      frR: -0.3,
      blL: 0.9,
      brL: 0.9,
      blC: 0.8,
      brC: 0.8,
      jaw: -0.85,
      glow: 1,
    },
    {
      t: 0.86,
      by: -0.65,
      pitch: -0.14,
      rf: 17.5,
      nx: -0.15,
      jaw: 0.06,
      flF: 0.7,
      frF: 0.7,
      blF: 0.4,
      brF: 0.4,
    },
    { t: 1.3, rf: 17.5 },
  ],
  tClaw3: claw3(),
  // 短吼（威嚇）：伏低後抬頭
  tSnarl: [
    { t: 0.2, by: -0.5, nx: -0.15, hx: -0.05 },
    { t: 0.34, by: -0.2, nx: 0.2, hx: 0.2, jaw: -0.75, glow: 1, shake: 1, tx: -0.4 },
    { t: 0.66, by: -0.2, nx: 0.2, hx: 0.2, jaw: -0.75, glow: 1, shake: 1, tx: -0.4 },
    { t: 0.9 },
  ],
  // 小受擊：整隻往後彈一小步、壓低
  tHit: [
    { t: 0.07, by: -0.5, pitch: 0.07, rf: -1.2, nx: -0.12, jaw: -0.12, flF: 0.5, frF: 0.5 },
    { t: 0.2, by: -0.65, rf: -2.6, ry: 0.15 },
    { t: 0.45, rf: -2.6 },
  ],
  // 失衡：側身滑倒、四腳亂蹬
  tStagger: [
    { t: 0.25, by: -1.6, roll: 0.5, free: 0.5, rs: -2, glow: -0.6, jaw: -0.2, shake: 0.5 },
    { t: 0.5, by: -3.25, roll: 1.25, free: 1, rs: -4, kick: 1, glow: -0.6, jaw: -0.3, tx: 0.3 },
    { t: 1.3, by: -3.25, roll: 1.25, free: 1, rs: -4.4, kick: 1, glow: -0.6, jaw: -0.3, tx: 0.3 },
    { t: 2.3, by: -3.25, roll: 1.25, free: 1, rs: -4.4, kick: 0.2, glow: -0.4, jaw: -0.2, tx: 0.35 },
    { t: 2.7, by: -1.0, roll: 0.3, free: 0.2, rs: -4.4, glow: 0.2, shake: 0.4 },
    { t: 3.1, rs: -4.4 },
  ],
  // 擊破：撲到一半失去動力，往前栽倒、滑行、熄火
  tDeath: [
    { t: 0.15, ry: 0.8, rf: 3, pitch: 0.1, flF: 1.5, frF: 1.5, flL: 0.6, frL: 0.6, jaw: -0.5 },
    { t: 0.4, rf: 7, by: -1.8, pitch: -0.36, nx: 0.2, free: 0.6, glow: -0.3, shake: 1, jaw: -0.4 },
    { t: 0.9, rf: 12, by: -2.9, pitch: -0.12, roll: 0.5, free: 1, glow: -0.3, jaw: -0.4, tx: 0.3 },
    { t: 1.5, rf: 14, by: -3.25, roll: 1.3, free: 1, jaw: -0.4, glow: 0.2, tx: 0.4, kick: 0.3 },
    { t: 2.4, rf: 14.5, by: -3.3, roll: 1.32, free: 1, jaw: -0.3, glow: -1, tx: 0.45 },
  ],
});
// 飛彈齊射：莢艙抬起、蓋子打開（只動上半身，可以邊移動邊放）
BEAST_CLIPS.tVolley = [
  { t: 0.3, gun: 0.45, lid: 1, glow: 0.4 },
  { t: 0.45, gun: 0.45, lid: 1, glow: 0.8, shake: 0.6 },
  { t: 1.2, gun: 0.45, lid: 1, glow: 0.8, shake: 0.6 },
  { t: 1.6 },
];
BEAST_CLIPS.tVolley.keepGait = true;

// ---------- 鱷龜型的片段（不動如山的伏擊者）----------
// 縮殼的姿勢：四肢與尾巴縮進去、頭只露出前半部（使用者定案）、整隻貼地
const TUCK = { tuck: 1, ext: -1.75, by: -1.1 };
const UP = { roll: 3.1416, by: 1.5, free: 1, ext: 0.8, jaw: -0.3, glow: -0.6 }; // 四腳朝天
Object.assign(BEAST_CLIPS, {
  // 潛伏：縮成一塊礁石，只有嘴裡的誘餌亮著；之後伸出來
  uHide: [
    { t: 0.9, ...TUCK, jaw: -0.28, glow: -0.6 },
    { t: 3.2, ...TUCK, jaw: -0.28, glow: -0.6 },
    { t: 3.7, tuck: 0.3, ext: -0.6, by: -0.4, jaw: -0.2 },
    { t: 4.2 },
  ],
  // 瞬間咬合（招牌技）：脖子往後縮、嘴張到最大、誘餌變亮 → 內頸瞬間伸長咬下去 → 慢慢收回（破綻）
  uSnap: [
    { t: 0.5, ext: -0.9, jaw: -0.8, glow: 1, by: -0.1, nx: 0.04, shake: 0.4 },
    { t: 0.58, ext: 2.6, jaw: -0.8, glow: 1, pitch: -0.04, flF: 0.4, frF: 0.4 },
    { t: 0.62, ext: 2.6, jaw: 0.06, glow: 0.6, pitch: -0.04, flF: 0.4, frF: 0.4 },
    { t: 1.0, ext: 2.5, jaw: 0.04 },
    { t: 1.7 },
  ],
  // 咬住甩動：咬著左右甩、再丟出去
  uShake: [
    { t: 0.12, ext: 2.4, jaw: 0.04, ny: 0.5, hdy: 0.4, yaw: 0.12 },
    { t: 0.32, ext: 2.4, jaw: 0.04, ny: -0.55, hdy: -0.45, yaw: -0.12 },
    { t: 0.52, ext: 2.4, jaw: 0.04, ny: 0.55, hdy: 0.45, yaw: 0.12 },
    { t: 0.72, ext: 2.4, jaw: 0.04, ny: -0.6, hdy: -0.5, yaw: -0.14 },
    { t: 0.86, ext: 2.2, jaw: -0.65, ny: 0.35, hdy: 0.3 },
    { t: 1.5 },
  ],
  // 咬合撲空的失衡：脖子伸長收不回來、頭垂在地上
  uStagger: [
    { t: 0.25, ext: 2.6, nx: -0.22, hx: -0.14, jaw: -0.25, glow: -0.7, shake: 0.4 },
    { t: 2.3, ext: 2.6, nx: -0.24, hx: -0.14, jaw: -0.2, glow: -0.7 },
    { t: 3.0 },
  ],
  // 縮殼旋轉：四肢、尾巴、頭依序縮進去 → 貼地高速旋轉滑行（撞牆反彈）→ 伸出來
  uSpin: [
    { t: 0.25, tuck: 0.5, by: -0.5, glow: 0.5 },
    { t: 0.55, ...TUCK, glow: 0.8 },
    { t: 0.9, ...TUCK, ryaw: 3, glow: 0.8 },
    { t: 1.7, ...TUCK, ryaw: 22, rf: 14, glow: 0.8 },
    { t: 2.5, ...TUCK, ryaw: 43, rf: 14, rs: 10, glow: 0.8 },
    { t: 2.9, ...TUCK, ryaw: 50.265, rf: 14, rs: 10 },
    { t: 3.5, ryaw: 50.265, rf: 14, rs: 10 },
  ],
  // 旋轉撞牆之後的失衡：翻過來四腳朝天、亂蹬，再翻回來
  uFlip: [
    { t: 0.3, roll: 1.6, by: 0.9, tuck: 0.5, free: 0.5 },
    { t: 0.55, ...UP, kick: 1 },
    { t: 2.6, ...UP, kick: 0.6, shake: 0.3 },
    { t: 3.0, roll: 1.5, by: 0.8, free: 0.5 },
    { t: 3.6 },
  ],
  // 甩尾：帶刺的粗尾抬離地面、往一側捲 → 橫掃後方
  uTail: [
    { t: 0.45, ty: -0.75, tx: -0.38, hy: -0.16, yaw: 0.06 },
    { t: 0.6, ty: 1.15, tx: -0.3, hy: 0.22, yaw: -0.08 },
    { t: 0.8, ty: 0.6, tx: -0.1 },
    { t: 1.3 },
  ],
  // 踏地：前半身撐高 → 前腳重踏（地面的衝擊波）
  uStomp: [
    { t: 0.42, by: 0.55, pitch: 0.24, flL: 1.5, frL: 1.5, ext: -0.4, glow: 0.5 },
    { t: 0.52, by: -0.3, pitch: -0.08, shake: 1 },
    { t: 0.75, by: -0.2 },
    { t: 1.2 },
  ],
  // 小受擊：頭縮一下
  uHit: [{ t: 0.07, ext: -0.7, jaw: -0.1, by: -0.08 }, { t: 0.45 }],
  // 擊破：四肢一軟整隻趴下、頭與誘餌垂地、光閃幾下熄滅
  uDeath: [
    { t: 0.5, by: -0.6, flX: 0.6, frX: 0.6, blX: 0.5, brX: 0.5, ext: 0.5, jaw: -0.2, shake: 0.6 },
    {
      t: 1.0,
      by: -1.1,
      flX: 0.9,
      frX: 0.9,
      blX: 0.8,
      brX: 0.8,
      ext: 1.3,
      nx: -0.24,
      hx: -0.16,
      jaw: -0.45,
      tx: 0.3,
      glow: 0.5,
    },
    {
      t: 1.4,
      by: -1.1,
      flX: 0.9,
      frX: 0.9,
      blX: 0.8,
      brX: 0.8,
      ext: 1.3,
      nx: -0.24,
      hx: -0.16,
      jaw: -0.45,
      tx: 0.3,
      glow: -0.8,
    },
    {
      t: 1.7,
      by: -1.1,
      flX: 0.9,
      frX: 0.9,
      blX: 0.8,
      brX: 0.8,
      ext: 1.3,
      nx: -0.24,
      hx: -0.16,
      jaw: -0.45,
      tx: 0.3,
      glow: 0.3,
    },
    {
      t: 2.3,
      by: -1.1,
      flX: 0.9,
      frX: 0.9,
      blX: 0.8,
      brX: 0.8,
      ext: 1.3,
      nx: -0.24,
      hx: -0.16,
      jaw: -0.45,
      tx: 0.3,
      glow: -1,
    },
  ],
});
// 砲擊：砲管抬高（只動上半身，可以邊爬邊打）
BEAST_CLIPS.uFire = [
  { t: 0.3, gun: 0.5, glow: 0.3 },
  { t: 0.4, gun: 0.5, shake: 0.8 },
  { t: 1.0, gun: 0.5, shake: 0.8 },
  { t: 1.4 },
];
BEAST_CLIPS.uFire.keepGait = true;

// ---------- 熊型的片段（正面硬碰的重拳手；招牌是站起來）----------
// 站立的姿勢：胸立起來約 75°、退到後腳上方，前肢變成手臂（arm），頭轉回正前方
const STAND = { pitch: 1.3, by: 3.3, bz: -3.5, flex: -0.3, arm: 1, nx: -0.85, hx: -0.3 };
const GUARD = { flS: -0.3, frS: -0.3, flE: 0.6, frE: 0.6, flA: 0.15, frA: 0.15 }; // 雙臂的預備姿勢
const UPR = { ...STAND, ...GUARD };
// 掌擊連打：左右掌輪流由上往下拍，每下往前踏一步
const slam3 = () => {
  const out = [{ t: 0.5, ...UPR, fire: 0.4 }];
  let t = 0.5,
    rf = 0;
  for (const a of ['fl', 'fr', 'fl']) {
    const b = a === 'fl' ? 'fr' : 'fl';
    const sg = a === 'fl' ? 1 : -1;
    out.push({
      t: t + 0.26,
      ...UPR,
      rf,
      yaw: 0.18 * sg,
      [a + 'S']: 2.0,
      [a + 'E']: 0.3,
      [a + 'A']: 0.35,
      [a + 'P']: 0.7,
      [a + 'R']: 0.8,
      [b + 'S']: -0.5,
      glow: 0.5,
      fire: 0.8,
    });
    out.push({
      t: t + 0.36,
      ...UPR,
      pitch: 1.12,
      by: 2.3,
      rf: rf + 1.2,
      yaw: -0.2 * sg,
      [a + 'S']: -0.15,
      [a + 'E']: 0.15,
      [a + 'A']: -0.1,
      [a + 'P']: -0.5,
      [a + 'R']: -0.4,
      jaw: -0.3,
      shake: 0.8,
      fire: 0.8,
    });
    out.push({ t: t + 0.5, ...UPR, rf: rf + 1.2, [a + 'S']: -0.4 });
    t += 0.5;
    rf += 1.2;
  }
  out.push({ t: t + 0.7, rf });
  return out;
};
Object.assign(BEAST_CLIPS, {
  // 站起 → 站著 → 落回四足
  bStand: [
    { t: 0.25, by: -0.5, pitch: -0.06, flex: 0.05 },
    { t: 0.7, ...UPR, shake: 0.3 },
    { t: 2.2, ...UPR },
    { t: 2.75, by: -0.5, pitch: -0.05, shake: 0.6 },
    { t: 3.1 },
  ],
  bSlam3: slam3(),
  // 雙掌拍地：雙掌高舉、身體後仰 → 兩掌同時砸下並落回四足（衝擊波、裂縫噴火）
  bGround: [
    { t: 0.5, ...UPR, fire: 0.5 },
    {
      t: 0.9,
      ...STAND,
      pitch: 1.45,
      by: 2.8,
      flS: 2.2,
      frS: 2.2,
      flE: 0.2,
      frE: 0.2,
      flA: 0.3,
      frA: 0.3,
      glow: 0.8,
      fire: 1.2,
      jaw: -0.3,
    },
    { t: 1.04, by: -0.7, pitch: -0.1, fire: 2, shake: 1, jaw: -0.2 },
    { t: 1.3, by: -0.5, pitch: -0.05, fire: 1.2 },
    { t: 1.8 },
  ],
  // 熊抱：雙臂大張 → 往前撲抱住 → 擠壓 → 摔出去
  bHug: [
    { t: 0.5, ...UPR },
    { t: 0.85, ...STAND, flS: 0.3, frS: 0.3, flA: 1.15, frA: 1.15, flE: 0.2, frE: 0.2, glow: 0.6, jaw: -0.2 },
    {
      t: 0.98,
      ...STAND,
      pitch: 1.15,
      rf: 3,
      flS: 0.45,
      frS: 0.45,
      flA: -0.35,
      frA: -0.35,
      flE: 1.1,
      frE: 1.1,
    },
    {
      t: 1.3,
      ...STAND,
      pitch: 1.2,
      rf: 3,
      flS: 0.45,
      frS: 0.45,
      flA: -0.5,
      frA: -0.5,
      flE: 1.2,
      frE: 1.2,
      shake: 0.6,
    },
    { t: 1.55, ...STAND, pitch: 1.15, rf: 3, flS: 0.45, frS: 0.45, flA: -0.3, frA: -0.3, flE: 1.1, frE: 1.1 },
    {
      t: 1.8,
      ...STAND,
      pitch: 1.2,
      rf: 3,
      flS: 0.45,
      frS: 0.45,
      flA: -0.5,
      frA: -0.5,
      flE: 1.2,
      frE: 1.2,
      shake: 0.6,
    },
    {
      t: 2.05,
      ...STAND,
      pitch: 1.35,
      rf: 3,
      yaw: 0.5,
      flS: 1.3,
      frS: 1.3,
      flA: 0.6,
      frA: 0.6,
      flE: 0.2,
      frE: 0.2,
      jaw: -0.5,
    },
    { t: 2.4, ...UPR, rf: 3 },
    { t: 3.0, rf: 3 },
  ],
  // 衝撞（四足）：前腳刨地、頭壓低、排煙管噴火 → 低頭直線衝、用肩峰撞
  bCharge: [
    { t: 0.22, by: -0.4, pitch: -0.08, nx: -0.2, flL: 0.9, flF: 0.6, fire: 0.8 },
    { t: 0.38, by: -0.45, pitch: -0.1, nx: -0.25, flF: -0.9, fire: 1 },
    { t: 0.55, by: -0.5, pitch: -0.12, nx: -0.3, flL: 0.9, flF: 0.6, fire: 1.4, glow: 0.6 },
    {
      t: 0.7,
      by: -0.3,
      pitch: -0.14,
      nx: -0.3,
      rf: 2,
      flF: 1.6,
      frF: -1.2,
      blF: -1.4,
      brF: 1.2,
      fire: 1.6,
      glow: 1,
    },
    {
      t: 0.9,
      by: -0.5,
      pitch: -0.14,
      nx: -0.3,
      rf: 7.5,
      flF: -1.4,
      frF: 1.6,
      blF: 1.2,
      brF: -1.4,
      frL: 0.5,
      fire: 1.6,
      glow: 1,
    },
    {
      t: 1.1,
      by: -0.3,
      pitch: -0.14,
      nx: -0.3,
      rf: 13,
      flF: 1.6,
      frF: -1.2,
      blF: -1.4,
      brF: 1.2,
      flL: 0.5,
      fire: 1.6,
      glow: 1,
    },
    {
      t: 1.3,
      by: -0.5,
      pitch: -0.14,
      nx: -0.3,
      rf: 18.5,
      flF: -1.4,
      frF: 1.6,
      blF: 1.2,
      brF: -1.4,
      frL: 0.5,
      fire: 1.6,
      glow: 1,
    },
    { t: 1.5, by: -0.6, pitch: 0.1, rf: 22, flF: 1.2, frF: 1.2, blF: 0.6, brF: 0.6, shake: 0.8 },
    { t: 2.1, rf: 22 },
  ],
  // 噴火：爐門變亮、吸氣後仰 → 張嘴噴出、頭左右掃
  bFlame: [
    { t: 0.5, by: -0.2, pitch: 0.06, nx: 0.25, hx: 0.12, jaw: -0.1, fire: 1.4, glow: 0.5 },
    {
      t: 0.68,
      by: -0.3,
      pitch: -0.05,
      nx: -0.08,
      jaw: -0.85,
      hdy: -0.5,
      ny: -0.25,
      fire: 2,
      glow: 1,
      shake: 0.5,
    },
    {
      t: 1.5,
      by: -0.3,
      pitch: -0.05,
      nx: -0.08,
      jaw: -0.85,
      hdy: 0.5,
      ny: 0.25,
      fire: 2,
      glow: 1,
      shake: 0.5,
    },
    { t: 1.8, by: -0.3, nx: -0.08, jaw: -0.85, fire: 1.5, glow: 0.6 },
    { t: 2.3 },
  ],
  // 丟熔岩塊：單掌插地挖出一塊 → 舉起 → 丟出
  bLava: [
    { t: 0.5, ...UPR },
    {
      t: 0.9,
      ...STAND,
      pitch: 0.95,
      by: 1.9,
      bz: -3.0,
      nx: -0.5,
      flS: -1.2,
      flE: 0.1,
      frS: -0.4,
      frE: 0.6,
      yaw: 0.15,
    },
    {
      t: 1.3,
      ...STAND,
      pitch: 1.4,
      by: 2.75,
      flS: 2.0,
      flE: 0.5,
      flA: 0.3,
      frS: -0.5,
      frE: 0.6,
      yaw: 0.25,
      fire: 1.2,
      glow: 0.6,
    },
    {
      t: 1.44,
      ...STAND,
      pitch: 1.15,
      by: 2.4,
      flS: 0.2,
      flE: 0.1,
      frS: -0.5,
      frE: 0.6,
      yaw: -0.3,
      jaw: -0.3,
      shake: 0.6,
    },
    { t: 1.8, ...UPR },
    { t: 2.4 },
  ],
  // 咆哮：站直仰頭吼、排煙管全開
  bRoar: [
    { t: 0.55, ...UPR },
    {
      t: 0.85,
      ...STAND,
      pitch: 1.42,
      by: 2.8,
      nx: -0.45,
      hx: -0.1,
      jaw: -0.85,
      flS: -0.2,
      frS: -0.2,
      flA: 0.9,
      frA: 0.9,
      flE: 0.5,
      frE: 0.5,
      fire: 2,
      glow: 1,
      shake: 1,
    },
    {
      t: 1.9,
      ...STAND,
      pitch: 1.42,
      by: 2.8,
      nx: -0.45,
      hx: -0.1,
      jaw: -0.85,
      flS: -0.2,
      frS: -0.2,
      flA: 0.9,
      frA: 0.9,
      flE: 0.5,
      frE: 0.5,
      fire: 2,
      glow: 1,
      shake: 1,
    },
    { t: 2.3, ...UPR },
    { t: 2.9 },
  ],
  // 小受擊：身體幾乎不動，頭甩一下
  bHit: [{ t: 0.07, hdy: -0.3, hz: -0.1, by: -0.06, jaw: -0.12 }, { t: 0.45 }],
  // 失衡（站立時）：往後一屁股坐下、雙掌撐地、頭低垂、胸口的爐門暴露在正面
  bSit: [
    { t: 0.3, ...UPR, pitch: 1.4, shake: 0.6 },
    {
      t: 0.65,
      pitch: 1.0,
      by: -1.7,
      bz: -3.2,
      flex: -0.5,
      arm: 1,
      nx: -1.0,
      hx: -0.25,
      flS: -1.35,
      frS: -1.35,
      flA: 0.45,
      frA: 0.45,
      flE: 0.3,
      frE: 0.3,
      blF: 2.6,
      brF: 2.6,
      blX: 0.4,
      brX: 0.4,
      glow: -0.6,
      fire: -0.5,
      jaw: -0.25,
      shake: 0.5,
    },
    {
      t: 2.6,
      pitch: 1.0,
      by: -1.7,
      bz: -3.2,
      flex: -0.5,
      arm: 1,
      nx: -1.0,
      hx: -0.25,
      flS: -1.35,
      frS: -1.35,
      flA: 0.45,
      frA: 0.45,
      flE: 0.3,
      frE: 0.3,
      blF: 2.6,
      brF: 2.6,
      blX: 0.4,
      brX: 0.4,
      glow: -0.6,
      fire: -0.5,
      jaw: -0.2,
    },
    { t: 3.0, pitch: 0.4, by: -0.6, bz: -1.2, arm: 0.3, shake: 0.4 },
    { t: 3.5 },
  ],
  // 失衡（四足時）：前腳跪下、頭垂地
  bKneel: [
    { t: 0.3, by: -1.5, pitch: -0.3, nx: -0.25, hx: -0.2, jaw: -0.25, glow: -0.6, fire: -0.5, shake: 0.4 },
    { t: 2.3, by: -1.55, pitch: -0.31, nx: -0.27, hx: -0.2, jaw: -0.2, glow: -0.6, fire: -0.5 },
    { t: 3.0 },
  ],
  // 擊破：站起來最後一吼、爐火噴出後熄滅 → 往前直挺挺倒下
  bDeath: [
    { t: 0.5, ...UPR, shake: 0.5 },
    {
      t: 0.8,
      ...STAND,
      pitch: 1.42,
      by: 2.8,
      nx: -0.45,
      jaw: -0.85,
      flS: -0.3,
      frS: -0.3,
      flA: 0.8,
      frA: 0.8,
      fire: 2,
      glow: 1,
      shake: 1,
    },
    {
      t: 1.4,
      ...STAND,
      pitch: 1.4,
      by: 2.75,
      nx: -0.6,
      jaw: -0.5,
      flS: -0.5,
      frS: -0.5,
      flA: 0.3,
      frA: 0.3,
      fire: -1,
      glow: -0.6,
    },
    {
      t: 1.9,
      ...STAND,
      pitch: 0.7,
      by: 1.0,
      bz: -1.8,
      nx: -0.5,
      jaw: -0.4,
      flS: 0.2,
      frS: 0.2,
      fire: -1,
      glow: -0.8,
    },
    {
      t: 2.2,
      pitch: 0,
      by: -3.1,
      bz: 1.5,
      arm: 1,
      flS: 1.35,
      frS: 1.35,
      flA: 0.3,
      frA: 0.3,
      nx: 0.1,
      jaw: -0.3,
      blX: 0.9,
      brX: 0.9,
      blF: -1.2,
      brF: -1.2,
      fire: -1,
      glow: -1,
      shake: 1,
    },
    {
      t: 2.6,
      pitch: 0,
      by: -3.15,
      bz: 1.5,
      arm: 1,
      flS: 1.35,
      frS: 1.35,
      flA: 0.3,
      frA: 0.3,
      nx: 0.1,
      jaw: -0.3,
      blX: 0.9,
      brX: 0.9,
      blF: -1.2,
      brF: -1.2,
      fire: -1,
      glow: -1,
    },
  ],
});
// 站著走：站立的姿勢不擋步伐（後腳照步態踏，前肢是手臂）
BEAST_CLIPS.bStandWalk = [
  { t: 0.5, ...UPR },
  { t: 1e9, ...UPR },
];
BEAST_CLIPS.bStandWalk.keepGait = true;

// ---------- 猩猩型的片段（在平台之間移動的投擲手；招牌是搥胸與噴射跳躍搥地）----------
// 站立：胸立起來約 50°（猩猩站著還是駝的）、退到後腳上方，前肢變成手臂，垂在身體兩側略往前
const G_STAND = { pitch: 0.88, by: 1.55, bz: -2.6, arm: 1, nx: -0.55, hx: -0.2 };
const G_HANG = { flS: -0.75, frS: -0.75, flE: 0.35, frE: 0.35, flA: 0.25, frA: 0.25 };
const GU = { ...G_STAND, ...G_HANG };
// 搥胸：左右拳輪流搥胸前的鼓板
const drum = (n, t0) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i % 2 ? 'fr' : 'fl',
      b = i % 2 ? 'fl' : 'fr';
    out.push({
      t: t0 + i * 0.15,
      ...G_STAND,
      pitch: 1.05,
      by: 1.8,
      nx: -0.35,
      hx: -0.05,
      jaw: -0.8,
      [a + 'S']: -0.9,
      [a + 'E']: 1.9,
      [a + 'A']: 0.35,
      [a + 'T']: 1.35,
      [b + 'S']: -0.9,
      [b + 'E']: 1.4,
      [b + 'A']: 0.6,
      [b + 'T']: 0.3,
      yaw: i % 2 ? -0.08 : 0.08,
      glow: 1,
      fire: 1.5,
      shake: 0.7,
    });
  }
  return out;
};
const G_KNEEL = {
  by: -1.9,
  pitch: -0.3,
  nx: -0.2,
  hx: -0.25,
  flX: 0.7,
  frX: 0.7,
  jaw: -0.3,
  glow: -0.6,
  fire: -0.7,
};
const G_SIT = {
  pitch: 0.75,
  by: -2.3,
  bz: -2.6,
  flex: -0.45,
  arm: 1,
  nx: -0.85,
  hx: -0.3,
  flS: -1.0,
  frS: -1.0,
  flA: 0.5,
  frA: 0.5,
  flE: 0.2,
  frE: 0.2,
  blF: 2.4,
  brF: 2.4,
  blX: 0.5,
  brX: 0.5,
  glow: -0.6,
  fire: -0.7,
  jaw: -0.25,
};
const G_BACK = {
  pitch: 3.0,
  by: -4.1,
  bz: -6.5,
  arm: 1,
  flS: 0.5,
  frS: 0.5,
  flA: 1.1,
  frA: 1.1,
  flE: 0.3,
  frE: 0.3,
  free: 1,
  nx: 0.2,
  jaw: -0.4,
  glow: -1,
  fire: -1,
};
Object.assign(BEAST_CLIPS, {
  // 站起 → 站著 → 落回指節著地
  gStand: [
    { t: 0.22, by: -0.5, pitch: -0.05 },
    { t: 0.6, ...GU, shake: 0.3 },
    { t: 2.0, ...GU },
    { t: 2.45, by: -0.5, pitch: -0.05, shake: 0.6 },
    { t: 2.8 },
  ],
  // 搥胸（威嚇；之後的攻擊變快的預告）：站起、仰頭吼、雙拳輪流搥鼓板
  gDrum: [{ t: 0.5, ...GU, glow: 0.5 }, ...drum(8, 0.72), { t: 2.2, ...GU }, { t: 2.8 }],
  // 雙拳搥地：站起、雙拳高舉過頭 → 砸下並落回指節著地（衝擊波）
  gSlam: [
    { t: 0.45, ...GU },
    {
      t: 0.85,
      ...G_STAND,
      pitch: 1.1,
      by: 2.2,
      flS: 2.5,
      frS: 2.5,
      flE: 0.35,
      frE: 0.35,
      flA: 0.2,
      frA: 0.2,
      glow: 0.8,
      jaw: -0.35,
    },
    { t: 0.97, by: -0.9, pitch: -0.14, rf: 1.5, flF: 0.8, frF: 0.8, jaw: -0.2, shake: 1 },
    { t: 1.3, by: -0.5, pitch: -0.05, rf: 1.5 },
    { t: 1.9, rf: 1.5 },
  ],
  // 噴射跳躍搥地（招牌技）：蹲下、噴射筒點火 → 高高跳起、雙拳舉過頭 → 落到目標處砸下
  gLeap: [
    { t: 0.4, by: -1.1, pitch: 0.06, flex: 0.12, fire: 1.6, glow: 0.6 },
    {
      t: 0.62,
      ...G_STAND,
      pitch: 0.55,
      by: 1,
      bz: -1,
      ry: 5,
      rf: 4,
      flS: 1.0,
      frS: 1.0,
      flE: 0.5,
      frE: 0.5,
      free: 0.9,
      fire: 2,
      shake: 0.4,
    },
    {
      t: 0.98,
      ...G_STAND,
      pitch: 0.85,
      ry: 12,
      rf: 10,
      flS: 2.5,
      frS: 2.5,
      flE: 0.35,
      frE: 0.35,
      flA: 0.2,
      frA: 0.2,
      free: 0.9,
      fire: 0.6,
      glow: 1,
      jaw: -0.4,
    },
    {
      t: 1.24,
      ...G_STAND,
      pitch: 0.5,
      by: 0.6,
      bz: -1,
      ry: 6,
      rf: 15.5,
      flS: 2.3,
      frS: 2.3,
      flE: 0.2,
      frE: 0.2,
      free: 0.6,
      glow: 1,
      jaw: -0.5,
    },
    { t: 1.36, by: -1.1, pitch: -0.16, rf: 17, flF: 0.8, frF: 0.8, jaw: -0.3, shake: 1 },
    { t: 1.75, by: -0.5, pitch: -0.05, rf: 17 },
    { t: 2.4, rf: 17 },
  ],
  // 跳上高處：蹲下、噴射 → 垂直跳到上一層的平台、雙拳先著地
  gJump: [
    { t: 0.35, by: -1.1, pitch: 0.08, flex: 0.12, fire: 1.6, glow: 0.4 },
    {
      t: 0.55,
      ...G_STAND,
      pitch: 0.7,
      by: 1,
      bz: -1,
      ry: 4,
      rf: 1,
      flS: 1.6,
      frS: 1.6,
      flE: 0.4,
      frE: 0.4,
      free: 0.9,
      fire: 2,
    },
    {
      t: 0.95,
      ...G_STAND,
      pitch: 0.5,
      by: 0.6,
      bz: -1,
      ry: 10.5,
      rf: 4.5,
      flS: 1.3,
      frS: 1.3,
      flE: 0.3,
      frE: 0.3,
      free: 0.8,
      fire: 0.4,
    },
    { t: 1.15, by: -0.8, pitch: -0.1, ry: 9, rf: 6.5, shake: 0.7 },
    { t: 1.5, by: -0.3, ry: 9, rf: 6.5 },
    { t: 2.0, ry: 9, rf: 6.5 },
  ],
  // 擺盪：左臂射出鉤索鉤住上方 → 整隻盪過去（腿收起）→ 放開、落地
  gSwing: [
    { t: 0.35, ...G_STAND, flS: 2.6, flE: 0.1, flA: 0.1, frS: -0.7, frE: 0.4, frA: 0.25, glow: 0.5 },
    { t: 0.55, ...G_STAND, flS: 2.6, flE: 0.1, flA: 0.1, frS: -0.7, frE: 0.4, frA: 0.25, shake: 0.4 },
    {
      t: 0.85,
      ...G_STAND,
      pitch: 0.45,
      by: 1.2,
      bz: -1.2,
      ry: 3,
      rf: 2.5,
      flS: 2.2,
      flE: 0.1,
      frS: -1.0,
      frE: 0.5,
      free: 1,
      fire: 0.8,
    },
    {
      t: 1.2,
      ...G_STAND,
      pitch: 0.95,
      ry: 1.8,
      rf: 9,
      flS: 2.6,
      flE: 0.05,
      frS: -0.4,
      frE: 0.6,
      free: 1,
      blC: 1,
      brC: 1,
    },
    {
      t: 1.55,
      ...G_STAND,
      pitch: 1.35,
      by: 2.4,
      ry: 5.5,
      rf: 15.5,
      flS: 3.0,
      flE: 0.3,
      frS: 1.6,
      frE: 0.3,
      free: 1,
      glow: 0.6,
    },
    {
      t: 1.85,
      ...G_STAND,
      pitch: 0.45,
      by: 0.6,
      bz: -1,
      ry: 3,
      rf: 19.5,
      flS: 1.3,
      frS: 1.3,
      flE: 0.3,
      frE: 0.3,
      free: 0.7,
    },
    { t: 2.02, by: -0.9, pitch: -0.1, rf: 21, shake: 0.8 },
    { t: 2.4, by: -0.3, rf: 21 },
    { t: 2.9, rf: 21 },
  ],
  // 投擲：左手往地上抓起一塊（平台的碎塊、貨櫃）→ 舉過頭、右手指向目標 → 丟出
  gThrow: [
    { t: 0.45, ...GU },
    {
      t: 0.8,
      ...G_STAND,
      pitch: 0.45,
      by: 0.3,
      bz: -1.5,
      nx: -0.3,
      flS: -0.3,
      flE: 0.1,
      frS: -0.9,
      frE: 0.5,
      yaw: 0.15,
    },
    {
      t: 1.2,
      ...G_STAND,
      pitch: 1.05,
      by: 2.1,
      flS: 2.3,
      flE: 0.9,
      flA: 0.3,
      frS: 0.35,
      frE: 0.2,
      yaw: 0.35,
      glow: 0.7,
    },
    {
      t: 1.33,
      ...G_STAND,
      pitch: 0.65,
      by: 1.4,
      rf: 0.8,
      flS: 0.45,
      flE: 0.1,
      frS: -1.2,
      frE: 0.5,
      yaw: -0.4,
      jaw: -0.4,
      shake: 0.6,
    },
    { t: 1.75, ...GU, rf: 0.8 },
    { t: 2.3, rf: 0.8 },
  ],
  // 鉤索拉扯：右臂往前射出鉤索 → 鉤住 → 整條手臂往回扯（把目標拉過來）→ 左拳迎上去
  gHook: [
    { t: 0.4, ...GU, yaw: 0.3, frS: -1.0, frE: 1.6, glow: 0.5 },
    { t: 0.52, ...G_STAND, yaw: -0.35, frS: 0.78, frE: 0.05, flS: -1.0, flE: 0.6, flA: 0.25, shake: 0.4 },
    { t: 1.0, ...G_STAND, yaw: -0.35, frS: 0.78, frE: 0.05, flS: -1.0, flE: 0.6, flA: 0.25 },
    {
      t: 1.22,
      ...G_STAND,
      pitch: 1.05,
      yaw: 0.4,
      frS: -0.9,
      frE: 1.7,
      flS: -0.5,
      flE: 1.5,
      flA: 0.2,
      shake: 0.5,
    },
    {
      t: 1.36,
      ...G_STAND,
      pitch: 0.7,
      by: 1.5,
      yaw: -0.3,
      rf: 1,
      flS: 0.75,
      flE: 0.1,
      frS: -1.0,
      frE: 0.8,
      jaw: -0.35,
      shake: 0.8,
    },
    { t: 1.8, ...GU, rf: 1 },
    { t: 2.4, rf: 1 },
  ],
  // 長臂橫掃（左臂由左往右）：半站、上身往左扭、左臂往外張 → 貼著地面掃過正面
  gSweepL: [
    {
      t: 0.42,
      ...G_STAND,
      pitch: 0.65,
      by: 1.2,
      bz: -2,
      yaw: 0.75,
      flS: 0.15,
      flA: 1.25,
      flE: 0.15,
      frS: -0.8,
      frE: 0.6,
      frA: 0.25,
      glow: 0.6,
    },
    {
      t: 0.56,
      ...G_STAND,
      pitch: 0.6,
      by: 1.1,
      bz: -2,
      yaw: -0.8,
      hy: -0.2,
      rf: 0.8,
      flS: 0.5,
      flA: -0.3,
      flE: 0.1,
      frS: -1.1,
      frE: 0.6,
      frA: 0.4,
      jaw: -0.3,
      shake: 0.6,
    },
    {
      t: 0.8,
      ...G_STAND,
      pitch: 0.6,
      by: 1.1,
      bz: -2,
      yaw: -0.95,
      rf: 0.8,
      flS: 0.4,
      flA: -0.5,
      flE: 0.2,
      frS: -1.1,
      frE: 0.6,
      frA: 0.4,
    },
    { t: 1.25, ...GU, rf: 0.8 },
    { t: 1.8, rf: 0.8 },
  ],
  // 小受擊：身體幾乎不動，頭與肩甩一下
  gHit: [{ t: 0.07, hdy: -0.25, hz: -0.1, by: -0.08, yaw: -0.06, jaw: -0.12 }, { t: 0.45 }],
  // 失衡（指節著地時）：雙臂一軟、胸口砸到地上、頭垂下
  gKneel: [{ t: 0.3, ...G_KNEEL, shake: 0.5 }, { t: 2.3, ...G_KNEEL, by: -1.95 }, { t: 3.0 }],
  // 失衡（站立時）：踉蹌往後一屁股坐下、雙拳撐在身後、胸前的鼓板與反應爐縫暴露
  gSit: [
    { t: 0.3, ...GU, pitch: 1.05, shake: 0.6 },
    { t: 0.65, ...G_SIT, shake: 0.5 },
    { t: 2.6, ...G_SIT, jaw: -0.2 },
    { t: 3.0, pitch: 0.3, by: -0.6, bz: -1, arm: 0.3, shake: 0.4 },
    { t: 3.5 },
  ],
  // 擊破：站起來最後一次搥胸、火光熄滅、雙臂垂下 → 往後仰倒
  gDeath: [
    { t: 0.5, ...GU, shake: 0.5 },
    ...drum(3, 0.72),
    {
      t: 1.7,
      ...G_STAND,
      pitch: 1.0,
      nx: -0.7,
      hx: -0.3,
      jaw: -0.4,
      flS: -0.9,
      frS: -0.9,
      flA: 0.2,
      frA: 0.2,
      fire: -1,
      glow: -0.7,
    },
    {
      t: 2.2,
      ...G_STAND,
      pitch: 1.5,
      by: 1.0,
      bz: -3.6,
      nx: -0.2,
      jaw: -0.4,
      flS: -0.3,
      frS: -0.3,
      flA: 0.6,
      frA: 0.6,
      free: 0.4,
      fire: -1,
      glow: -0.9,
    },
    { t: 2.55, ...G_BACK, shake: 1 },
    { t: 3.0, ...G_BACK },
  ],
});
// 站著走：站立的姿勢不擋步伐（後腳照步態踏，前肢是手臂）
BEAST_CLIPS.gStandWalk = [
  { t: 0.5, ...GU },
  { t: 1e9, ...GU },
];
BEAST_CLIPS.gStandWalk.keepGait = true;

// 蠍型（八足）的片段與動作在 beast-anim-scorpion.js
Object.assign(BEAST_CLIPS, SCORP_CLIPS, MANTIS_CLIPS, RAPTOR_CLIPS); // 螳螂型在 beast-anim-mantis.js

// 左右對調的片段（右前腳的爪擊、從右邊被打）
const SWAP = { fl: 'fr', fr: 'fl', bl: 'br', br: 'bl' };
const NEG = new Set(['roll', 'yaw', 'hy', 'ny', 'hdy', 'hz', 'ty', 'rs', 'ryaw']);
const mirrorClip = (clip) =>
  clip.map((k) => {
    const o = {};
    for (const [c, val] of Object.entries(k)) {
      const leg = SWAP[c.slice(0, 2)];
      if (leg && c.length === 3) o[leg + c[2]] = val;
      else o[c] = NEG.has(c) ? -val : val;
    }
    return o;
  });
BEAST_CLIPS.clawR = mirrorClip(BEAST_CLIPS.clawL);
BEAST_CLIPS.hitR = mirrorClip(BEAST_CLIPS.hitL);
BEAST_CLIPS.tDodgeL = mirrorClip(BEAST_CLIPS.tDodgeR);
BEAST_CLIPS.tDodgeClawL = mirrorClip(BEAST_CLIPS.tDodgeClawR);
BEAST_CLIPS.tSpinR = mirrorClip(BEAST_CLIPS.tSpinL);
BEAST_CLIPS.gSweepR = mirrorClip(BEAST_CLIPS.gSweepL);
export const clipDur = (name) => {
  const c = BEAST_CLIPS[name];
  return c ? c[c.length - 1].t : 0;
};
// 片段在 t 秒的各頻道（寫進 out）
function clipAt(clip, t, out) {
  let a = null,
    b = null;
  for (const k of clip) {
    if (t < k.t) {
      b = k;
      break;
    }
    a = k;
  }
  for (const k in out) delete out[k];
  if (!b) {
    Object.assign(out, a);
    return;
  }
  const t0 = a ? a.t : 0;
  let u = (t - t0) / (b.t - t0 || 1);
  u = u * u * (3 - 2 * u);
  if (a) for (const k in a) if (k !== 't') out[k] = a[k] * (1 - u);
  for (const k in b) if (k !== 't') out[k] = (out[k] || 0) + b[k] * u;
}

const rot = (a, p) => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
const ang = (p) => Math.atan2(p[1], p[0]);
const fy = (p) => [p[2], p[1]]; // glTF 的點 → (f, y)
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function init(rig) {
  const P = rig.piv;
  const legs = [];
  for (const [key, names, parent] of [
    ['fl', ['fl_upper', 'fl_fore', 'fl_meta', 'fl_paw'], 'chest'],
    ['fr', ['fr_upper', 'fr_fore', 'fr_meta', 'fr_paw'], 'chest'],
    ['bl', ['bl_thigh', 'bl_shin', 'bl_meta', 'bl_paw'], 'hips'],
    ['br', ['br_thigh', 'br_shin', 'br_meta', 'br_paw'], 'hips'],
  ]) {
    const [a, b, c, d] = names.map((n) => fy(P[n]));
    const u0 = sub2(b, a),
      v0 = sub2(c, b),
      m0 = sub2(d, c);
    legs.push({
      key,
      parent,
      n: names.map((n) => rig.nodes[n]),
      a,
      d,
      m0,
      l1: Math.hypot(u0[0], u0[1]),
      l2: Math.hypot(v0[0], v0[1]),
      a1: ang(u0),
      a2: ang(v0),
      // 彎的方向照站姿（前腳的肘往後、後腳的膝往前）
      side: Math.sign(u0[0] * (c[1] - a[1]) - u0[1] * (c[0] - a[0])) || 1,
      // 腳在遊戲座標的位置（轉身時算橫移）
      gx: -P[names[3]][0],
      gz: -P[names[3]][2],
      len: a[1] - d[1],
    });
  }
  return {
    legs,
    C: fy(P.chest),
    Hp: fy(P.hips),
    y0: rig.nodes.chest.position.y,
    z0: rig.nodes.chest.position.z,
    // 前後腳、左右腳的距離（地形的俯仰與側傾）
    span: Math.abs(legs[0].gz - legs[2].gz),
    track: Math.abs(legs[0].gx - legs[1].gx),
    ph: 0,
    gait: 'walk',
    mv: 0,
    A: {},
  };
}

const S_LEG = [48, 0.85],
  S_BODY = [14, 0.6],
  S_ACT = [30, 0.62], // 動作片段中：身體與頭跟得快、有一點過衝
  S_HEAD = [9, 0.55],
  S_TAIL = [7, 0.4],
  S_TAIL_ACT = [14, 0.45];
const sp = (node, key, to, s, dt) => spring(node.rotation, key, to, s[0], s[1], dt);

export function animateBeast(rig, st, dt) {
  if (rig.kind === 'scorpion') return animateScorpion(rig, st, dt, clipAt);
  if (rig.kind === 'mantis') return animateMantis(rig, st, dt, clipAt);
  if (rig.kind === 'raptor') return animateRaptor(rig, st, dt, clipAt);
  const an = rig.an || (rig.an = init(rig));
  const N = rig.nodes;
  const t = st.t || 0;
  const v = Math.abs(st.v || 0),
    w = st.w || 0;
  const moving = v > 0.3 || Math.abs(w) > 0.05;
  // 動作片段
  const A = an.A;
  const clip = st.act && BEAST_CLIPS[st.act.name];
  let aw = 0;
  if (clip) {
    clipAt(clip, st.act.t, A);
    aw = clip.keepGait ? 0 : Math.min(1, st.act.t / 0.08); // keepGait＝只動上半身的片段（邊移動邊放）
  } else for (const k in A) delete A[k];
  const ch = (k) => A[k] || 0;
  const SB = clip ? S_ACT : S_BODY,
    SH = clip ? S_ACT : S_HEAD,
    ST = clip ? S_TAIL_ACT : S_TAIL;
  // 步態（切換有一點遲滯）
  const up = an.gait === 'walk' ? 1.05 : 0.95;
  const PF = PROFILES[rig.kind] || PROFILES.lion;
  const stalking = !!(st.stalk && PF.gaits.stalk);
  an.gait = stalking
    ? 'stalk'
    : v > PF.runV * (an.gait === 'run' ? 0.92 : 1.05)
      ? 'run'
      : v > PF.trotV * up
        ? 'trot'
        : 'walk';
  const G = PF.gaits[an.gait];
  an.sk = (an.sk || 0) + ((stalking ? 1 : 0) - (an.sk || 0)) * Math.min(1, dt * 3);
  // 腳著地的那一段要和地面的速度一致（不滑）：一步在地上走的距離＝v × T × 著地比例，不能超過腿伸得到的 maxStride。
  // 超過時先把步頻加快到 minT，再縮短著地的比例（騰空變長，像全速奔跑時腳只點一下地）；還不夠才繼續加快步頻。
  let T = G.T,
    gb = G.b;
  if (v * T * gb > PF.maxStride) {
    T = Math.max(G.T * (PF.minT || 0.72), PF.maxStride / (v * gb));
    gb = Math.max(0.1, Math.min(G.b, PF.maxStride / (v * T)));
    if (v * T * gb > PF.maxStride) T = PF.maxStride / (v * gb);
  }
  if (moving) an.ph = (an.ph + dt / T) % 1;
  an.mv += ((moving ? 1 : 0) - an.mv) * Math.min(1, dt * 6);
  const mv = an.mv * (1 - aw),
    p2 = an.ph * TAU;
  const stanceT = T * gb;

  // ---- 身體：起伏、俯仰、脊椎伸縮、左右搖 ----
  let bob = 0,
    pitch = 0,
    flex = 0,
    roll = 0;
  if (an.gait === 'walk' || an.gait === 'stalk') {
    bob = 0.05 * Math.sin(2 * p2);
    roll = 0.03 * Math.sin(p2);
    pitch = 0.012 * Math.sin(2 * p2 + 1);
  } else if (an.gait === 'trot') {
    bob = 0.13 * Math.sin(2 * p2 + 0.6);
    pitch = 0.015 * Math.sin(2 * p2);
  } else {
    // 奔跑：後腳蹬出（0～0.3）→ 伸展騰空 → 前腳著地 → 收攏騰空
    bob = 0.24 * Math.sin(p2 - 0.4) - 0.12;
    pitch = -0.08 * Math.cos(TAU * (an.ph - 0.56));
    flex = 0.26 * Math.cos(TAU * (an.ph - 0.97));
  }
  const still = (1 - an.mv) * (1 - aw);
  const breath = Math.sin(t * 1.5);
  // 地形：各腳的地面高度差 → 身體的高度、俯仰、側傾
  const gy = st.gy || null;
  const g = (k) => (gy && gy[k]) || 0;
  const gAvg = (g('fl') + g('fr') + g('bl') + g('br')) / 4;
  const gPitch = gy ? Math.atan2((g('fl') + g('fr') - g('bl') - g('br')) / 2, an.span) : 0;
  const gRoll = gy ? Math.atan2((g('fr') + g('br') - g('fl') - g('bl')) / 2, an.track) * 0.6 : 0;
  // 站姿的基準（潛行時再壓低）；動作片段中照片段的姿勢、只留一半
  const bk = 1 - aw * 0.5;
  const SKP = PF.stalk || PF.base;
  const baseBy = (PF.base.by + (SKP.by - PF.base.by) * an.sk) * bk,
    baseNx = (PF.base.nx + (SKP.nx - PF.base.nx) * an.sk) * bk,
    baseHx = (PF.base.hx + (SKP.hx - PF.base.hx) * an.sk) * bk;
  bob = bob * mv * PF.bobK + 0.03 * breath * still + ch('by') + gAvg + baseBy;
  pitch = pitch * mv + ch('pitch') + gPitch * 0.85;
  flex = flex * mv * PF.flexK + ch('flex');
  roll =
    roll * mv +
    ch('roll') +
    gRoll +
    (an.gait === 'stalk' ? 0.045 * Math.sin(p2) * mv : 0) +
    (PF.sway || 0) * Math.sin(p2) * mv;
  spring(N.chest.position, 'y', an.y0 + bob, SB[0] * 1.6, 0.8, dt);
  spring(N.chest.position, 'z', an.z0 - ch('bz'), SB[0] * 1.6, 0.8, dt); // 片段的 bz：身體往前（負＝往後；站立時胸要退到後腳上方）
  sp(N.chest, 'x', pitch, SB, dt);
  sp(N.chest, 'z', roll + 0.012 * Math.sin(t * 0.5) * still, SB, dt);
  sp(N.chest, 'y', ch('yaw'), SB, dt);
  sp(N.hips, 'x', flex, SB, dt);
  sp(
    N.hips,
    'y',
    -0.05 * Math.sin(p2) * mv * (an.gait === 'walk' ? 1 : 0.4) +
      ch('hy') +
      ch('wig') * 0.09 * Math.sin(t * 13),
    SB,
    dt,
  );
  // 用彈簧之後實際的值算腿（腳才踩得穩）
  const bobR = N.chest.position.y - an.y0,
    pR = N.chest.rotation.x,
    fR = N.hips.rotation.x;
  const bzR = an.z0 - N.chest.position.z;
  const HpW = add2(add2(an.C, rot(pR, sub2(an.Hp, an.C))), [bzR, bobR]);
  const free = ch('free');

  // ---- 腿 ----
  for (const L of an.legs) {
    const front = L.parent === 'chest';
    const Ap = front ? pR : pR + fR;
    const Aw = front
      ? add2(add2(an.C, rot(pR, sub2(L.a, an.C))), [bzR, bobR])
      : add2(HpW, rot(Ap, sub2(L.a, an.Hp)));
    // 相位 → 落點（df 往前、dx 往側、lift 抬高）與掌骨的收起
    const ph = (an.ph + G.ph[L.key]) % 1;
    let s, lift, curl;
    if (ph < gb) {
      s = ph / gb; // 著地：由前往後
      lift = 0;
      curl = 0;
    } else {
      const u = (ph - gb) / (1 - gb); // 騰空：由後往前
      const e = u * u * (3 - 2 * u);
      s = 1 - e;
      lift = G.lift * Math.sin(Math.PI * Math.pow(u, 0.8));
      curl = Math.sin(Math.PI * u);
    }
    const k = (0.5 - s) * stanceT * mv;
    const out = L.gx > 0 ? 1 : -1; // 這隻腳的外側（遊戲座標 x 的正負）
    const df = (v + w * L.gx) * k + ch(L.key + 'F'), // 轉身時這隻腳所在的位置相對地面的速度（前後分量）
      dx = w * L.gz * k + ch(L.key + 'X') * out; // （橫向分量，遊戲座標 +x）
    lift = lift * mv + ch(L.key + 'L') + g(L.key);
    curl = Math.min(1, curl * mv + ch(L.key + 'C'));
    const A3 = -(front ? 0.95 : 0.6) * curl; // 掌骨往後收
    const Kt = add2(L.d, [df, lift]);
    const Wt = sub2(Kt, rot(A3, L.m0));
    const q = sub2(Wt, Aw);
    const d = Math.min(Math.hypot(q[0], q[1]), (L.l1 + L.l2) * 0.995);
    const base = ang(q);
    const ca = Math.max(-1, Math.min(1, (L.l1 * L.l1 + d * d - L.l2 * L.l2) / (2 * L.l1 * d)));
    const th1 = base - L.side * Math.acos(ca);
    const e1 = [Math.cos(th1) * L.l1, Math.sin(th1) * L.l1];
    const dir = [Math.cos(base) * d, Math.sin(base) * d];
    const th2 = ang(sub2(dir, e1));
    const A1 = wrap(th1 - L.a1),
      A2 = wrap(th2 - L.a2);
    const A4 = A3 * 1.1 + ch(L.key + 'P'); // 腳掌垂下；片段的 P＝腳掌另外轉的角度（正＝腳尖翹起）
    const f1 = 1 - free; // 放鬆：回到站姿的相對角度（跟著身體）
    const kick = ch('kick') * Math.sin(t * 17 + L.gx * 2 + L.gz); // 倒地時亂蹬
    // 手臂模式（片段的 arm，只有前肢）：不貼地，照片段的角度擺——S 肩的前後擺（正＝往前上方舉）、A 往外張、E 肘彎
    const arm = front ? ch('arm') : 0,
      leg = 1 - arm;
    const lat = Math.asin(Math.max(-0.5, Math.min(0.5, dx / L.len))) * f1;
    sp(L.n[0], 'x', ((A1 - Ap) * f1 + kick * 0.45) * leg + ch(L.key + 'S') * arm, S_LEG, dt);
    sp(L.n[1], 'x', (wrap(A2 - A1) * f1 - kick * 0.6) * leg + ch(L.key + 'E') * arm, S_LEG, dt);
    sp(L.n[2], 'x', wrap(A3 - A2) * f1 * leg, S_LEG, dt);
    sp(L.n[3], 'x', wrap(A4 - A3) * f1 * leg + ch(L.key + 'P') * arm, S_LEG, dt);
    // 腳掌側轉（片段的 R，正＝掌心往外翻）：繞腳掌的前後軸翻，並帶一點偏航
    const pr = ch(L.key + 'R') * out;
    sp(L.n[3], 'z', pr, S_LEG, dt);
    sp(L.n[3], 'y', pr * 0.5, S_LEG, dt);
    sp(L.n[0], 'z', lat * leg + ch(L.key + 'A') * out * arm, S_LEG, dt);
    sp(L.n[0], 'y', ch(L.key + 'T') * out * arm, S_LEG, dt); // 上臂繞自己的軸轉（正＝前臂往內，搥胸）
  }

  // ---- 頸、頭：抵銷身體的俯仰，待機時左右張望 ----
  const look = still * (0.28 * Math.sin(t * 0.37) + 0.12 * Math.sin(t * 0.83 + 1));
  const nod =
    an.gait === 'walk' ? 0.03 * Math.sin(2 * p2 + 0.5) : an.gait === 'trot' ? 0.02 * Math.sin(2 * p2) : 0;
  const shake = ch('shake');
  const jit = shake * Math.sin(t * 47),
    jit2 = shake * Math.sin(t * 61 + 1);
  const runW = an.gait === 'run' ? mv : 0;
  sp(N.neck, 'x', -pR * 0.6 * (1 - aw) + nod * mv - 0.06 * runW + ch('nx') + baseNx, SH, dt);
  sp(N.neck, 'y', look * 0.5 + w * 0.12 * (1 - aw) + ch('ny'), SH, dt);
  sp(N.head, 'x', -pR * 0.4 * (1 - aw) + 0.02 * breath * still + ch('hx') + baseHx + jit * 0.012, SH, dt);
  sp(N.head, 'y', look * 0.5 + w * 0.1 * (1 - aw) + ch('hdy'), SH, dt);
  sp(N.head, 'z', -roll * 0.8 * (1 - free) + ch('hz') + jit2 * 0.03, SH, dt);
  sp(
    N.jaw,
    'x',
    (PF.idleJaw || 0) * still - (0.03 + 0.03 * breath) * still - 0.1 * runW + ch('jaw') + jit * 0.02,
    SH,
    dt,
  );

  // ---- 尾：一節一節延遲的擺動；跑起來往後平伸 ----
  for (let i = 1; i <= 5; i++) {
    const n = N['tail' + i];
    if (!n) continue; // 短尾的機獸只有前幾節
    const lag = i * 0.55;
    const sway = 0.1 * Math.sin(p2 - lag) * mv;
    const idle = 0.14 * Math.sin(t * 0.9 - lag) * still;
    sp(n, 'y', sway + idle - w * 0.08 * (1 - aw) + ch('ty') * (0.35 + 0.1 * i), ST, dt);
    const tx = -(i < 3 ? 0.14 : -0.02) * runW - fR * 0.25 + 0.02 * Math.sin(t * 0.7 - lag) * still;
    sp(n, 'x', tx + ch('tx') * 0.32, ST, dt);
  }
  // ---- 砲塔：st.aim＝[偏航, 俯仰]（之後由目標的方向決定）；沒有時待機慢慢掃視 ----
  if (!N.turret || !N.guns) {
    // 沒有砲塔的機獸
  } else if (st.aim) {
    sp(N.turret, 'y', st.aim[0], S_HEAD, dt);
    sp(N.guns, 'x', st.aim[1] + ch('gun'), S_HEAD, dt);
  } else {
    sp(N.turret, 'y', 0.5 * Math.sin(t * 0.23) * still, S_HEAD, dt);
    sp(N.guns, 'x', 0.05 + 0.04 * Math.sin(t * 0.31) * still + ch('gun'), clip ? S_ACT : S_HEAD, dt);
  }
  // ---- 鬃甲的張開、眼睛的亮度 ----
  const mane = ch('mane');
  for (const [name, k] of [
    ['mane_a', 0.16],
    ['mane_b', 0.24],
  ]) {
    const n = N[name];
    if (!n) continue;
    const to = 1 + k * mane + jit * 0.006;
    spring(n.scale, 'x', to, 22, 0.45, dt);
    spring(n.scale, 'y', to, 22, 0.45, dt);
  }
  if (rig.eyeMat) rig.eyeMat.emissiveIntensity = Math.max(0, 1.6 * (1 + 1.6 * ch('glow')));
  // 爐火（片段的 fire：−1 熄滅～2 全開；顫抖時跟著閃）
  if (rig.burnMat)
    rig.burnMat.emissiveIntensity = Math.max(0, 1.6 * (1 + 1.2 * ch('fire')) * (1 + jit * 0.15));
  // 片段要整隻移動的量（遊戲的實體自己用；預覽直接套在整隻上）
  // 伸縮的內頸（片段的 ext：公尺，正＝往前伸、負＝縮進殼裡）
  if (N.neck2) {
    if (an.n2z === undefined) an.n2z = N.neck2.position.z;
    spring(N.neck2.position, 'z', an.n2z - ch('ext'), clip ? 46 : 14, 0.7, dt);
  }
  // 縮進殼裡（片段的 tuck：0～1）：四肢與尾巴往根部縮
  const tuck = ch('tuck');
  if (tuck > 0 || an.tucked) {
    an.tucked = tuck > 0.001;
    for (const L of an.legs) {
      const k = 1 - 0.74 * tuck;
      for (const ax of ['x', 'y', 'z']) spring(L.n[0].scale, ax, k, 20, 0.8, dt);
    }
    const kt = 1 - 0.85 * tuck;
    if (N.tail1) for (const ax of ['x', 'y', 'z']) spring(N.tail1.scale, ax, kt, 20, 0.8, dt);
  }
  // 莢艙的蓋子（片段的 lid：0 關～1 全開）
  for (const name of ['lid_l', 'lid_r']) if (N[name]) sp(N[name], 'x', ch('lid') * 1.9, [26, 0.6], dt);
  rig.rootY = ch('ry');
  rig.rootF = ch('rf');
  rig.rootS = ch('rs'); // 往側面的位移（遊戲座標 +x）
  rig.rootYaw = ch('ryaw'); // 整隻的轉向
  if (st.root) {
    rig.group.position.y = rig.rootY * rig.group.scale.y;
    rig.group.position.z = -rig.rootF * rig.group.scale.z;
    rig.group.position.x = rig.rootS * rig.group.scale.x;
    rig.group.rotation.y = rig.rootYaw;
  }
  if (st.spin) rig.group.rotation.y += w * dt;
}
