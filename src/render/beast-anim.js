// 獅型機獸的動作（第 1 期：待機、走、小跑、奔跑、原地轉身）。和機甲的動作同樣的分層：
// 步伐（依相位算每隻腳的落點，腿用解析解）→ 身體的起伏、俯仰、脊椎伸縮 → 頭、頸、尾、砲塔的附加動作，全部經過彈簧（mech-spring.js）。
// rig＝buildLion 的回傳（nodes、piv）；st＝{ t 時間, v 前進速度（公尺／秒）, w 轉向速度（弧度／秒，正＝往左轉）}。只改關節群組的旋轉與胸的高度。
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
const rot = (a, p) => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
};
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
const ang = (p) => Math.atan2(p[1], p[0]);
const fy = (p) => [p[2], p[1]]; // glTF 的點 → (f, y)

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
    ph: 0,
    gait: 'walk',
    mv: 0,
    yaw: 0,
  };
}

const S_LEG = [48, 0.85],
  S_BODY = [14, 0.6],
  S_HEAD = [9, 0.55],
  S_TAIL = [7, 0.4];
const sp = (node, key, to, s, dt) => spring(node.rotation, key, to, s[0], s[1], dt);

export function animateBeast(rig, st, dt) {
  const an = rig.an || (rig.an = init(rig));
  const N = rig.nodes;
  const t = st.t || 0;
  const v = Math.abs(st.v || 0),
    w = st.w || 0;
  const moving = v > 0.3 || Math.abs(w) > 0.05;
  // 步態（切換有一點遲滯）
  const up = an.gait === 'walk' ? 1.05 : 0.95;
  an.gait = v > RUN_V * (an.gait === 'run' ? 0.92 : 1.05) ? 'run' : v > TROT_V * up ? 'trot' : 'walk';
  const G = GAITS[an.gait];
  let T = G.T;
  if (v * T * G.b > MAX_STRIDE) T = MAX_STRIDE / (v * G.b);
  if (moving) an.ph = (an.ph + dt / T) % 1;
  an.mv += ((moving ? 1 : 0) - an.mv) * Math.min(1, dt * 6);
  const mv = an.mv,
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
    // 奔跑：後腳蹬出（0～0.3）→ 伸展騰空 → 前腳著地（0.48～0.96）→ 收攏騰空
    bob = 0.24 * Math.sin(p2 - 0.4) - 0.12;
    pitch = -0.08 * Math.cos(TAU * (an.ph - 0.56));
    flex = 0.26 * Math.cos(TAU * (an.ph - 0.97));
  }
  const breath = Math.sin(t * 1.5);
  bob = bob * mv + 0.03 * breath * (1 - mv);
  pitch *= mv;
  flex *= mv;
  roll *= mv;
  spring(N.chest.position, 'y', an.y0 + bob, S_BODY[0] * 1.6, 0.8, dt);
  sp(N.chest, 'x', pitch, S_BODY, dt);
  sp(N.chest, 'z', roll + 0.012 * Math.sin(t * 0.5) * (1 - mv), S_BODY, dt);
  sp(N.hips, 'x', flex, S_BODY, dt);
  sp(N.hips, 'y', -0.05 * Math.sin(p2) * mv * (an.gait === 'walk' ? 1 : 0.4), S_BODY, dt);
  // 用彈簧之後實際的值算腿（腳才踩得穩）
  const bobR = N.chest.position.y - an.y0,
    pR = N.chest.rotation.x,
    fR = N.hips.rotation.x;
  const HpW = add2(add2(an.C, rot(pR, sub2(an.Hp, an.C))), [0, bobR]);

  // ---- 腿 ----
  for (const L of an.legs) {
    const front = L.parent === 'chest';
    const Ap = front ? pR : pR + fR;
    const A = front
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
    const df = (v + w * L.gx) * k, // 轉身時這隻腳所在的位置相對地面的速度（前後分量）
      dx = w * L.gz * k; // （橫向分量，遊戲座標 +x）
    lift *= mv;
    curl *= mv;
    const A3 = -(front ? 0.95 : 0.6) * curl; // 掌骨往後收
    const Kt = add2(L.d, [df, lift]);
    const Wt = sub2(Kt, rot(A3, L.m0));
    const q = sub2(Wt, A);
    const d = Math.min(Math.hypot(q[0], q[1]), (L.l1 + L.l2) * 0.995);
    const base = ang(q);
    const ca = Math.max(-1, Math.min(1, (L.l1 * L.l1 + d * d - L.l2 * L.l2) / (2 * L.l1 * d)));
    const th1 = base - L.side * Math.acos(ca);
    const e1 = [Math.cos(th1) * L.l1, Math.sin(th1) * L.l1];
    const dir = [Math.cos(base) * d, Math.sin(base) * d];
    const th2 = ang(sub2(dir, e1));
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const A1 = wrap(th1 - L.a1),
      A2 = wrap(th2 - L.a2);
    const A4 = A3 * 1.1; // 腳掌垂下
    sp(L.n[0], 'x', A1 - Ap, S_LEG, dt);
    sp(L.n[1], 'x', wrap(A2 - A1), S_LEG, dt);
    sp(L.n[2], 'x', wrap(A3 - A2), S_LEG, dt);
    sp(L.n[3], 'x', wrap(A4 - A3), S_LEG, dt);
    sp(L.n[0], 'z', Math.asin(Math.max(-0.5, Math.min(0.5, dx / L.len))), S_LEG, dt);
  }

  // ---- 頸、頭：抵銷身體的俯仰，待機時左右張望 ----
  const look = (1 - mv) * (0.28 * Math.sin(t * 0.37) + 0.12 * Math.sin(t * 0.83 + 1));
  const nod =
    an.gait === 'walk' ? 0.03 * Math.sin(2 * p2 + 0.5) : an.gait === 'trot' ? 0.02 * Math.sin(2 * p2) : 0;
  sp(N.neck, 'x', -pR * 0.6 + nod * mv - 0.06 * mv * (an.gait === 'run' ? 1 : 0), S_HEAD, dt);
  sp(N.neck, 'y', look * 0.5 + w * 0.12, S_HEAD, dt);
  sp(N.head, 'x', -pR * 0.4 + 0.02 * breath * (1 - mv), S_HEAD, dt);
  sp(N.head, 'y', look * 0.5 + w * 0.1, S_HEAD, dt);
  sp(N.head, 'z', -roll * 0.8, S_HEAD, dt);
  sp(N.jaw, 'x', -(0.03 + 0.03 * breath) * (1 - mv) - (an.gait === 'run' ? 0.1 : 0) * mv, S_HEAD, dt);

  // ---- 尾：一節一節延遲的擺動；跑起來往後平伸 ----
  const run = an.gait === 'run' ? mv : 0;
  for (let i = 1; i <= 5; i++) {
    const n = N['tail' + i];
    const lag = i * 0.55;
    const sway = mv ? 0.1 * Math.sin(p2 - lag) * mv : 0;
    const idle = 0.14 * Math.sin(t * 0.9 - lag) * (1 - mv);
    sp(n, 'y', sway + idle - w * 0.08, S_TAIL, dt);
    sp(
      n,
      'x',
      -(i < 3 ? 0.14 : -0.02) * run - fR * 0.25 + 0.02 * Math.sin(t * 0.7 - lag) * (1 - mv),
      S_TAIL,
      dt,
    );
  }
  // ---- 砲塔：待機時慢慢掃視 ----
  sp(N.turret, 'y', 0.5 * Math.sin(t * 0.23) * (1 - mv), S_HEAD, dt);
  sp(N.guns, 'x', 0.05 + 0.04 * Math.sin(t * 0.31) * (1 - mv), S_HEAD, dt);
  // 原地轉身的預覽：整隻跟著轉
  if (st.spin) {
    an.yaw += w * dt;
    rig.group.rotation.y = an.yaw;
  }
}
