// 獅型機獸的動作。和機甲的動作同樣的分層：
// 步伐（依相位算每隻腳的落點，腿用解析解）→ 身體的起伏、俯仰、脊椎伸縮 → 動作片段（急停、跳躍、攻擊、受擊、失衡、擊破：關鍵影格，疊在步伐上）
// → 頭、頸、尾、鬃甲、砲塔的附加動作，全部經過彈簧（mech-spring.js）。
// rig＝buildLion 的回傳（nodes、piv）；st＝{ t 時間, v 前進速度（公尺／秒）, w 轉向速度（弧度／秒，正＝往左轉）,
//   act: { name, t } 動作片段與它開始後的秒數, gy: { fl, fr, bl, br } 各腳的地面高度差（貼地形）, root: true 時片段的位移直接套在整隻上（預覽用）}。
// 只改關節群組的旋轉、胸的高度、鬃甲的縮放、眼睛的亮度；片段要整隻移動的量寫在 rig.rootY／rig.rootF（遊戲的實體自己用）。
// 平面的座標：f＝往前（glTF 的 +Z）、y＝往上；繞 X 的旋轉角（遊戲座標）正的＝往前的東西往上抬（在 f–y 平面逆時針）。
import { spring } from './mech-spring.js';

const TAU = Math.PI * 2;
// 步態：T＝一個循環的秒數、b＝著地的比例、ph＝各腳的相位（後左 bl、前左 fl、後右 br、前右 fr）、lift＝抬腳高度
const GAITS = {
  walk: { T: 1.2, b: 0.66, ph: { bl: 0, fl: 0.25, br: 0.5, fr: 0.75 }, lift: 0.55 },
  trot: { T: 0.8, b: 0.5, ph: { bl: 0, fr: 0, br: 0.5, fl: 0.5 }, lift: 0.8 },
  run: { T: 0.62, b: 0.3, ph: { bl: 0, br: 0.1, fr: 0.48, fl: 0.58 }, lift: 1.0 },
};
const TROT_V = 7.5,
  RUN_V = 16,
  MAX_STRIDE = 4.4; // 一步最遠（公尺）；超過就加快步頻

// ---------- 動作片段 ----------
// 關鍵影格：{ t 秒, 頻道… }，沒寫的頻道＝0；影格之間以平滑曲線內插，最後一格之後停在那一格。頻道：
//   by 身體高度、pitch 俯仰（正＝前半身抬起）、roll 側傾、yaw 胸的偏航、flex 脊椎（正＝臀部往下收）、hy 腰臀的偏航
//   <腳>F／L／C／X／P／R＝那隻腳的落點往前、抬高、掌骨收起（0～1）、往外、腳掌的角度（弧度，正＝腳尖翹起）、腳掌側轉（弧度，正＝往外翻）；nx／ny 頸、hx／hdy／hz 頭、jaw 下顎（負＝張開）
//   tx／ty 尾（tx 負＝揚起）、mane 鬃甲張開（0～1）、glow 眼睛的亮度（−1 熄滅～1）、shake 顫抖
//   ry／rf 整隻的高度與往前的位移、free 腿放鬆（1＝不貼地，跟著身體）
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
// 左右對調的片段（右前腳的爪擊、從右邊被打）
const SWAP = { fl: 'fr', fr: 'fl', bl: 'br', br: 'bl' };
const NEG = new Set(['roll', 'yaw', 'hy', 'ny', 'hdy', 'hz', 'ty']);
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
    aw = Math.min(1, st.act.t / 0.08);
  } else for (const k in A) delete A[k];
  const ch = (k) => A[k] || 0;
  const SB = clip ? S_ACT : S_BODY,
    SH = clip ? S_ACT : S_HEAD,
    ST = clip ? S_TAIL_ACT : S_TAIL;
  // 步態（切換有一點遲滯）
  const up = an.gait === 'walk' ? 1.05 : 0.95;
  an.gait = v > RUN_V * (an.gait === 'run' ? 0.92 : 1.05) ? 'run' : v > TROT_V * up ? 'trot' : 'walk';
  const G = GAITS[an.gait];
  let T = G.T;
  if (v * T * G.b > MAX_STRIDE) T = MAX_STRIDE / (v * G.b);
  if (moving) an.ph = (an.ph + dt / T) % 1;
  an.mv += ((moving ? 1 : 0) - an.mv) * Math.min(1, dt * 6);
  const mv = an.mv * (1 - aw),
    p2 = an.ph * TAU;
  const stanceT = T * G.b;

  // ---- 身體：起伏、俯仰、脊椎伸縮、左右搖 ----
  let bob = 0,
    pitch = 0,
    flex = 0,
    roll = 0;
  if (an.gait === 'walk') {
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
  bob = bob * mv + 0.03 * breath * still + ch('by') + gAvg;
  pitch = pitch * mv + ch('pitch') + gPitch * 0.85;
  flex = flex * mv + ch('flex');
  roll = roll * mv + ch('roll') + gRoll;
  spring(N.chest.position, 'y', an.y0 + bob, SB[0] * 1.6, 0.8, dt);
  sp(N.chest, 'x', pitch, SB, dt);
  sp(N.chest, 'z', roll + 0.012 * Math.sin(t * 0.5) * still, SB, dt);
  sp(N.chest, 'y', ch('yaw'), SB, dt);
  sp(N.hips, 'x', flex, SB, dt);
  sp(N.hips, 'y', -0.05 * Math.sin(p2) * mv * (an.gait === 'walk' ? 1 : 0.4) + ch('hy'), SB, dt);
  // 用彈簧之後實際的值算腿（腳才踩得穩）
  const bobR = N.chest.position.y - an.y0,
    pR = N.chest.rotation.x,
    fR = N.hips.rotation.x;
  const HpW = add2(add2(an.C, rot(pR, sub2(an.Hp, an.C))), [0, bobR]);
  const free = ch('free');

  // ---- 腿 ----
  for (const L of an.legs) {
    const front = L.parent === 'chest';
    const Ap = front ? pR : pR + fR;
    const Aw = front
      ? add2(add2(an.C, rot(pR, sub2(L.a, an.C))), [0, bobR])
      : add2(HpW, rot(Ap, sub2(L.a, an.Hp)));
    // 相位 → 落點（df 往前、dx 往側、lift 抬高）與掌骨的收起
    const ph = (an.ph + G.ph[L.key]) % 1;
    let s, lift, curl;
    if (ph < G.b) {
      s = ph / G.b; // 著地：由前往後
      lift = 0;
      curl = 0;
    } else {
      const u = (ph - G.b) / (1 - G.b); // 騰空：由後往前
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
    sp(L.n[0], 'x', (A1 - Ap) * f1, S_LEG, dt);
    sp(L.n[1], 'x', wrap(A2 - A1) * f1, S_LEG, dt);
    sp(L.n[2], 'x', wrap(A3 - A2) * f1, S_LEG, dt);
    sp(L.n[3], 'x', wrap(A4 - A3) * f1, S_LEG, dt);
    // 腳掌側轉（片段的 R，正＝掌心往外翻）：繞腳掌的前後軸翻，並帶一點偏航
    const pr = ch(L.key + 'R') * out;
    sp(L.n[3], 'z', pr, S_LEG, dt);
    sp(L.n[3], 'y', pr * 0.5, S_LEG, dt);
    sp(L.n[0], 'z', Math.asin(Math.max(-0.5, Math.min(0.5, dx / L.len))) * f1, S_LEG, dt);
  }

  // ---- 頸、頭：抵銷身體的俯仰，待機時左右張望 ----
  const look = still * (0.28 * Math.sin(t * 0.37) + 0.12 * Math.sin(t * 0.83 + 1));
  const nod =
    an.gait === 'walk' ? 0.03 * Math.sin(2 * p2 + 0.5) : an.gait === 'trot' ? 0.02 * Math.sin(2 * p2) : 0;
  const shake = ch('shake');
  const jit = shake * Math.sin(t * 47),
    jit2 = shake * Math.sin(t * 61 + 1);
  const runW = an.gait === 'run' ? mv : 0;
  sp(N.neck, 'x', -pR * 0.6 * (1 - aw) + nod * mv - 0.06 * runW + ch('nx'), SH, dt);
  sp(N.neck, 'y', look * 0.5 + w * 0.12 * (1 - aw) + ch('ny'), SH, dt);
  sp(N.head, 'x', -pR * 0.4 * (1 - aw) + 0.02 * breath * still + ch('hx') + jit * 0.012, SH, dt);
  sp(N.head, 'y', look * 0.5 + w * 0.1 * (1 - aw) + ch('hdy'), SH, dt);
  sp(N.head, 'z', -roll * 0.8 * (1 - free) + ch('hz') + jit2 * 0.03, SH, dt);
  sp(N.jaw, 'x', -(0.03 + 0.03 * breath) * still - 0.1 * runW + ch('jaw') + jit * 0.02, SH, dt);

  // ---- 尾：一節一節延遲的擺動；跑起來往後平伸 ----
  for (let i = 1; i <= 5; i++) {
    const n = N['tail' + i];
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
    sp(N.guns, 'x', st.aim[1], S_HEAD, dt);
  } else {
    sp(N.turret, 'y', 0.5 * Math.sin(t * 0.23) * still, S_HEAD, dt);
    sp(N.guns, 'x', 0.05 + 0.04 * Math.sin(t * 0.31) * still, S_HEAD, dt);
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
  // 片段要整隻移動的量（遊戲的實體自己用；預覽直接套在整隻上）
  rig.rootY = ch('ry');
  rig.rootF = ch('rf');
  if (st.root) {
    rig.group.position.y = rig.rootY * rig.group.scale.y;
    rig.group.position.z = -rig.rootF * rig.group.scale.z;
  }
  if (st.spin) rig.group.rotation.y += w * dt;
}
