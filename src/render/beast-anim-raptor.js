// 猛禽型機獸的動作（兩足＋雙翼；由 beast-anim.js 的 animateBeast 依 rig.kind 轉過來，做法同蠍型、螳螂型）。
// 兩種狀態：地面（收翼、兩腳交替走、頭前後點）與飛行（st.fly 或片段的 air：展翼拍動、腳收起、身體放平、離地 st.alt 公尺）。
// 翼：模型的原始姿勢＝平展；收翼＝上臂往後、前臂折回、手再折回（fold 0～1）；拍翼＝上臂繞前後向的軸上下，前臂與手慢半拍跟上。
// 腿：在前後的平面裡解兩段骨頭（脛＋跗蹠），腳掌保持水平。旋轉的方向：繞 X 正的＝往前的東西往上抬。
// 片段的頻道（沒寫＝0）：
//   by 身體高度、pitch／roll／yaw 身體、shake 顫抖、glow 眼、fire 推進的光（−1～2）、ry／rf／rs／ryaw 整隻的位移與轉向
//   nx 頸（正＝抬起）、hx／hy／hz 頭（抬頭、轉頭、歪頭）、jaw 下喙（負＝張開）、tl 尾翹起
//   spread 展翼（0～1，地面時把收著的翼打開）、fold 收翼（0～1，飛行時把翼收起來＝俯衝）、wu 雙翼上舉（弧度，負＝下壓）、
//   wlU／wrU 單邊上舉、wlS／wrS 單邊往前掃（弧度）、flap 拍翼的幅度（0～1）、tuck 腳收到腹下（0～1）
//   lF／lL、rF／rL 左右腳往前、抬高（公尺）、grip 爪握起（0～1；負＝張開）
import { spring } from './mech-spring.js';

const TAU = Math.PI * 2;
const WALK = { T: 0.95, b: 0.6, lift: 0.75 };
const MAX_STRIDE = 2.6;
const FLAP_W = 5.2; // 拍翼的角速度（約 0.83 次／秒）
const S_BODY = [12, 0.6],
  S_ACT = [28, 0.6],
  S_LEG = [40, 0.85],
  S_WING = [16, 0.6],
  S_WING_ACT = [34, 0.55];

// ---------- 片段 ----------
const mirror = (clip) =>
  clip.map((k) => {
    const o = {};
    for (const [c, v] of Object.entries(k)) {
      if (/^wl[US]$/.test(c)) o['wr' + c[2]] = v;
      else if (/^wr[US]$/.test(c)) o['wl' + c[2]] = v;
      else if (/^l[FL]$/.test(c)) o['r' + c[1]] = v;
      else if (/^r[FL]$/.test(c)) o['l' + c[1]] = v;
      else o[c] = ['roll', 'yaw', 'hy', 'hz', 'rs', 'ryaw'].includes(c) ? -v : v;
    }
    return o;
  });
const MANTLE = { spread: 0.85, wu: 0.5, pitch: -0.12, nx: 0.25, hx: -0.1, tl: 0.3, glow: 1 };
const FLARE = { wu: 0.75, pitch: 0.55, tl: -0.5 }; // 煞車：翼高舉、身體立起、尾往下張
const AIR = 8; // 預覽時飛行片段的高度
const DOWN = {
  by: -1.9,
  pitch: -0.5,
  spread: 0.75,
  wu: -0.25,
  nx: -0.5,
  hx: -0.2,
  jaw: -0.2,
  lF: 0.5,
  rF: 0.5,
  tl: -0.3,
  glow: -0.6,
  fire: -0.7,
};
const DEAD = {
  by: -2.35,
  pitch: -0.62,
  roll: 0.2,
  spread: 1,
  wu: -0.32,
  wlS: 0.3,
  wrS: -0.5,
  nx: -0.7,
  hx: -0.1,
  hz: 0.6,
  jaw: -0.3,
  lF: -0.9,
  rF: -0.6,
  grip: 0.8,
  tl: -0.4,
  glow: -1,
  fire: -1,
};
export const RAPTOR_CLIPS = {
  // 鳴叫（威嚇）：翼半張舉起、頭往前伸、張喙
  rScreech: [
    { t: 0.4, ...MANTLE },
    { t: 0.52, ...MANTLE, nx: 0.1, hx: 0.25, jaw: -0.6, shake: 0.9, fire: 1 },
    { t: 1.5, ...MANTLE, nx: 0.1, hx: 0.25, jaw: -0.6, shake: 0.9, fire: 1 },
    { t: 2.1 },
  ],
  // 啄擊：頸往後縮 → 喙往前下方刺出去
  rPeck: [
    { t: 0.35, nx: 0.45, hx: 0.3, by: 0.1, pitch: 0.12, glow: 0.6 },
    { t: 0.44, nx: -0.7, hx: -0.45, by: -0.5, pitch: -0.38, rf: 0.8, jaw: -0.15, shake: 0.6 },
    { t: 0.75, nx: -0.6, hx: -0.4, by: -0.45, pitch: -0.35, rf: 0.8 },
    { t: 1.2, rf: 0.8 },
  ],
  // 翼刃斬（左翼）：翼打開往後拉 → 貼著地面水平掃到正前方
  rWingSlashL: [
    { t: 0.4, spread: 1, yaw: 0.45, wlS: -0.5, wlU: 0.1, wrU: -0.2, roll: -0.08, glow: 0.6 },
    { t: 0.52, spread: 1, yaw: -0.55, wlS: 1.15, wlU: -0.12, wrU: 0.1, roll: 0.12, rf: 1, shake: 0.6 },
    { t: 0.8, spread: 1, yaw: -0.6, wlS: 1.2, wlU: -0.12, rf: 1 },
    { t: 1.4, rf: 1 },
  ],
  // 爪踢：小跳起來、左腳往前蹬出去、爪張開再握
  rKick: [
    { t: 0.3, by: -0.5, spread: 0.5, wu: 0.4, pitch: 0.1 },
    {
      t: 0.48,
      by: 0.8,
      ry: 1.6,
      rf: 1.5,
      pitch: 0.55,
      spread: 1,
      wu: -0.3,
      lF: 2.2,
      lL: 1.9,
      rF: 0.4,
      rL: 0.5,
      grip: -0.5,
      tl: -0.4,
    },
    {
      t: 0.56,
      by: 0.8,
      ry: 1.4,
      rf: 2.4,
      pitch: 0.55,
      spread: 1,
      wu: 0.2,
      lF: 2.4,
      lL: 1.7,
      rF: 0.4,
      rL: 0.4,
      grip: 0.9,
      shake: 0.7,
      tl: -0.4,
    },
    { t: 0.85, by: -0.4, rf: 3, spread: 0.6, wu: 0.3, shake: 0.4 },
    { t: 1.4, rf: 3 },
  ],
  // 振翅強風：站穩、雙翼全開大力拍三下（把目標往後吹；風是特效）
  rGust: [
    { t: 0.4, spread: 1, wu: 0.8, pitch: 0.25, by: 0.2, tl: -0.4, glow: 0.6 },
    ...[0, 1, 2].flatMap((k) => [
      { t: 0.56 + k * 0.5, spread: 1, wu: -0.55, pitch: 0.12, by: -0.25, tl: -0.4, fire: 1.6, shake: 0.6 },
      { t: 0.9 + k * 0.5, spread: 1, wu: 0.8, pitch: 0.28, by: 0.2, tl: -0.4, fire: 1 },
    ]),
    { t: 2.6 },
  ],
  // 羽刃齊射：雙翼高舉張開 → 往前一甩（翼尖的鋼刃射出去是特效）
  rFeather: [
    { t: 0.45, spread: 1, wu: 0.95, wlS: -0.3, wrS: -0.3, pitch: 0.3, glow: 0.8, fire: 1.2 },
    { t: 0.55, spread: 1, wu: 0.1, wlS: 0.9, wrS: 0.9, pitch: -0.1, by: -0.2, fire: 2, shake: 0.7 },
    { t: 0.9, spread: 1, wu: 0.05, wlS: 0.8, wrS: 0.8, pitch: -0.08 },
    { t: 1.5 },
  ],
  // 起飛：蹲下、展翼 → 大力下拍離地 → 拍著翼升到空中
  rTakeoff: [
    { t: 0.35, by: -0.8, spread: 1, wu: 0.85, pitch: 0.1, fire: 1 },
    { t: 0.5, by: 0.4, ry: 1.2, spread: 1, wu: -0.6, pitch: 0.25, tuck: 0.3, fire: 2, shake: 0.4 },
    { t: 0.85, ry: 3.2, spread: 1, wu: 0.7, pitch: 0.2, tuck: 0.7, fire: 1.6 },
    { t: 1.05, ry: 4.6, spread: 1, wu: -0.55, pitch: 0.15, tuck: 1, fire: 2 },
    { t: 1.4, ry: 6.4, spread: 1, wu: 0.6, tuck: 1, fire: 1.4 },
    { t: 1.6, ry: 7.4, spread: 1, wu: -0.4, pitch: -0.2, tuck: 1 },
    { t: 2.0, ry: AIR, spread: 1, flap: 1, pitch: -0.35, tuck: 1 },
  ],
  // 降落：從空中滑下來、翼高舉煞車、腳往前伸 → 著地、收翼
  rLand: [
    { t: 0.01, ry: AIR, spread: 1, flap: 1, pitch: -0.35, tuck: 1 },
    { t: 0.6, ry: 3.5, rf: 5, spread: 1, wu: 0.3, pitch: -0.1, tuck: 0.8 },
    { t: 0.95, ry: 1.2, rf: 7.5, spread: 1, ...FLARE, lF: 1.0, rF: 1.0, grip: -0.5, fire: 1.6 },
    { t: 1.15, by: -0.8, rf: 8.5, spread: 1, wu: 0.4, pitch: 0.15, shake: 0.6 },
    { t: 1.5, by: -0.2, rf: 8.5, spread: 0.5, wu: 0.2 },
    { t: 2.0, rf: 8.5 },
  ],
  // 俯衝爪擊（招牌技，飛行中）：收翼、頭朝下俯衝 → 接近時展翼煞車、雙爪往前伸出去抓 → 拉升
  rDive: [
    { t: 0.4, ry: 2, pitch: 0.15, wu: 0.5, glow: 1 },
    { t: 0.62, ry: 1.5, rf: 2, fold: 0.6, pitch: -0.95, nx: 0.5, fire: 2 },
    { t: 1.05, ry: -5, rf: 15, fold: 0.6, pitch: -0.85, nx: 0.5, fire: 2 },
    {
      t: 1.18,
      ry: -6.2,
      rf: 18.5,
      ...FLARE,
      tuck: -1,
      lF: 1.6,
      rF: 1.6,
      lL: 0.4,
      rL: 0.4,
      grip: -0.6,
      fire: 1,
    },
    { t: 1.26, ry: -6.3, rf: 20, ...FLARE, tuck: -1, lF: 1.8, rF: 1.8, lL: 0.4, rL: 0.4, grip: 1, shake: 1 },
    { t: 1.6, ry: -5, rf: 22, wu: -0.5, pitch: 0.3, tuck: -0.4, grip: 1, fire: 2 },
    { t: 2.3, ry: 0, rf: 28, pitch: 0.1, grip: 0.3 },
    { t: 2.8, rf: 30 },
  ],
  // 小受擊：身體一縮、翼抖開一下
  rHit: [{ t: 0.07, by: -0.15, spread: 0.25, hx: -0.15, hy: 0.25, jaw: -0.1 }, { t: 0.45 }],
  // 失衡：往前趴下、雙翼攤在地上、頭垂下（背上的推進器暴露）
  rStagger: [{ t: 0.3, ...DOWN, shake: 0.6 }, { t: 2.4, ...DOWN, nx: -0.55 }, { t: 3.1 }],
  // 擊破：最後一聲鳴叫 → 光熄滅 → 往前倒下、雙翼攤開、爪蜷起
  rDeath: [
    { t: 0.4, ...MANTLE, hx: 0.3, jaw: -0.6, shake: 1 },
    { t: 1.0, ...MANTLE, hx: 0.3, jaw: -0.6, shake: 1, fire: 2 },
    { t: 1.5, by: -0.6, pitch: -0.2, spread: 0.8, wu: 0.1, nx: -0.3, glow: -0.7, fire: -1 },
    { t: 2.0, ...DEAD, shake: 0.8 },
    { t: 2.5, ...DEAD },
  ],
};
RAPTOR_CLIPS.rDive.air = true;
RAPTOR_CLIPS.rWingSlashR = mirror(RAPTOR_CLIPS.rWingSlashL);

// ---------- 初始化 ----------
const fy = (p) => [p[2], p[1]]; // glTF 的點 → (往前, 往上)
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const rot2 = (a, p) => [p[0] * Math.cos(a) - p[1] * Math.sin(a), p[0] * Math.sin(a) + p[1] * Math.cos(a)];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function init(rig) {
  const P = rig.piv,
    N = rig.nodes;
  const legs = ['l', 'r'].map((s, i) => {
    const a = fy(P[s + '_thigh']),
      b = fy(P[s + '_tarsus']),
      c = fy(P[s + '_foot']);
    const u = sub2(b, a),
      v = sub2(c, b);
    return {
      s,
      n: [N[s + '_thigh'], N[s + '_tarsus'], N[s + '_foot'], N[s + '_toes']],
      a,
      c,
      l1: Math.hypot(u[0], u[1]),
      l2: Math.hypot(v[0], v[1]),
      a1: Math.atan2(u[1], u[0]),
      a2: Math.atan2(v[1], v[0]),
      side: Math.sign(u[0] * (c[1] - a[1]) - u[1] * (c[0] - a[0])) || 1,
      ph: i * 0.5,
      gx: -P[s + '_thigh'][0],
    };
  });
  return { legs, C: fy(P.chest), y0: N.chest.position.y, ph: 0, mv: 0, fl: 0, A: {} };
}

export function animateRaptor(rig, st, dt, clipAt) {
  const an = rig.an || (rig.an = init(rig));
  const N = rig.nodes;
  const t = st.t || 0;
  const v = st.v || 0,
    w = st.w || 0;
  const A = an.A;
  const clip = st.act && RAPTOR_CLIPS[st.act.name];
  let aw = 0;
  if (clip) {
    clipAt(clip, st.act.t, A);
    aw = Math.min(1, st.act.t / 0.08);
  } else for (const k in A) delete A[k];
  const ch = (k) => A[k] || 0;
  const SB = clip ? S_ACT : S_BODY,
    SW = clip ? S_WING_ACT : S_WING;
  // 飛行的比例（0 地面～1 飛行）
  const flying = !!(st.fly || (clip && clip.air));
  an.fl += ((flying ? 1 : 0) - an.fl) * Math.min(1, dt * 4);
  const fl = an.fl,
    gr = 1 - fl;
  const moving = (Math.abs(v) > 0.3 || Math.abs(w) > 0.05) && !flying;
  let T = WALK.T;
  if (Math.abs(v) * T * WALK.b > MAX_STRIDE) T = MAX_STRIDE / (Math.abs(v) * WALK.b);
  if (moving) an.ph = (an.ph + dt / T) % 1;
  an.mv += ((moving ? 1 : 0) - an.mv) * Math.min(1, dt * 6);
  const mv = an.mv * (1 - aw),
    p2 = an.ph * TAU,
    still = (1 - an.mv) * (1 - aw) * gr;
  const stanceT = T * WALK.b;
  const shake = ch('shake');
  const jit = shake * Math.sin(t * 47);
  const breath = Math.sin(t * 1.5);
  // 拍翼：飛行時自動拍；片段的 flap 另外加
  const flapK = Math.min(1, fl * (clip && clip.air ? 0.35 : 1) + ch('flap'));
  const beat = Math.sin(t * FLAP_W);

  // ---- 身體 ----
  const bob =
    0.1 * Math.sin(2 * p2) * mv +
    0.03 * breath * still +
    ch('by') -
    0.35 * flapK * beat * fl +
    (st.gy ? Math.min(st.gy.l || 0, st.gy.r || 0, 0) * (1 - fl) : 0);
  const pitch = ch('pitch') - 0.35 * fl * (clip ? 0 : 1) + 0.03 * Math.sin(2 * p2 + 1) * mv;
  spring(N.chest.position, 'y', an.y0 + bob, SB[0] * 1.5, 0.8, dt);
  spring(N.chest.rotation, 'x', pitch + jit * 0.008, SB[0], SB[1], dt);
  spring(N.chest.rotation, 'z', ch('roll') + 0.07 * Math.sin(p2) * mv - w * 0.25 * fl, SB[0], SB[1], dt);
  spring(N.chest.rotation, 'y', ch('yaw') + 0.05 * Math.sin(p2) * mv, SB[0], SB[1], dt);
  const bobR = N.chest.position.y - an.y0,
    pR = N.chest.rotation.x;

  // ---- 腿 ----
  // 地形（st.gy＝兩隻腳下面的地面高度）：身體降到低的那隻腳、高的那隻多彎一點
  const gy = st.gy || null;
  const gLow = gy ? Math.min(gy.l || 0, gy.r || 0, 0) * gr : 0;
  const tuck = Math.max(0, Math.min(1, fl + ch('tuck')));
  const grip = ch('grip');
  for (const L of an.legs) {
    const ph = (an.ph + L.ph) % 1;
    let s,
      lift = 0;
    if (ph < WALK.b) s = ph / WALK.b;
    else {
      const u = (ph - WALK.b) / (1 - WALK.b);
      s = 1 - u * u * (3 - 2 * u);
      lift = WALK.lift * Math.sin(Math.PI * Math.pow(u, 0.8));
    }
    const k = (0.5 - s) * stanceT * mv;
    const df = (v + w * L.gx) * k + ch(L.s + 'F'),
      up = lift * mv + ch(L.s + 'L') + ((gy && gy[L.s]) || 0) * gr - gLow;
    // 髖的位置（跟著身體的俯仰與起伏）→ 兩段骨頭
    const hip = [an.C[0] + rot2(pR, sub2(L.a, an.C))[0], an.C[1] + rot2(pR, sub2(L.a, an.C))[1] + bobR];
    const q = [L.c[0] + df - hip[0], L.c[1] + up - hip[1]];
    const d = Math.min(Math.hypot(q[0], q[1]), (L.l1 + L.l2) * 0.995);
    const base = Math.atan2(q[1], q[0]);
    const ca = Math.max(-1, Math.min(1, (L.l1 * L.l1 + d * d - L.l2 * L.l2) / (2 * L.l1 * d)));
    const th1 = base - L.side * Math.acos(ca);
    const th2 = Math.atan2(
      Math.sin(base) * d - Math.sin(th1) * L.l1,
      Math.cos(base) * d - Math.cos(th1) * L.l1,
    );
    const A1 = wrap(th1 - L.a1),
      A2 = wrap(th2 - L.a2);
    // 收腳（飛行）：脛往後貼著腹、跗蹠往前折、爪握起
    const g = 1 - tuck;
    spring(L.n[0].rotation, 'x', (A1 - pR) * g + -0.75 * tuck, S_LEG[0], S_LEG[1], dt);
    spring(L.n[1].rotation, 'x', wrap(A2 - A1) * g + 1.5 * tuck, S_LEG[0], S_LEG[1], dt);
    spring(L.n[2].rotation, 'x', -A2 * g - 0.5 * tuck + Math.max(0, up) * 0.25 * g, S_LEG[0], S_LEG[1], dt);
    spring(
      L.n[3].rotation,
      'x',
      -0.75 * Math.max(-0.6, Math.min(1, grip + 0.7 * tuck * (grip < 0 ? 0 : 1))),
      40,
      0.6,
      dt,
    );
  }

  // ---- 頸、頭、喙、尾 ----
  const look = still * (0.45 * Math.sin(t * 0.5) + 0.2 * Math.sin(t * 1.3 + 1));
  const snap = still * 0.25 * Math.sign(Math.sin(t * 0.37)) * Math.max(0, Math.sin(t * 0.37) ** 8); // 偶爾很快地轉一下頭
  const nod = 0.12 * Math.sin(2 * p2 + 0.6) * mv; // 走路時頭前後點
  spring(N.neck.rotation, 'x', ch('nx') - pR * 0.55 + nod, 18, 0.6, dt);
  spring(N.head.rotation, 'x', ch('hx') - pR * 0.35 - nod * 0.6 + jit * 0.012, 22, 0.6, dt);
  spring(N.head.rotation, 'y', ch('hy') + look + snap + w * 0.25 * (1 - aw), 26, 0.6, dt);
  spring(N.head.rotation, 'z', ch('hz') + still * 0.12 * Math.sin(t * 0.23), 22, 0.6, dt);
  spring(N.jaw.rotation, 'x', ch('jaw') - 0.03 * (1 + breath) * still + jit * 0.02, 30, 0.6, dt);
  spring(
    N.tail.rotation,
    'x',
    -ch('tl') + 0.05 * Math.sin(2 * p2) * mv + 0.03 * breath * still - pR * 0.3 + 0.08 * flapK * beat,
    SB[0],
    SB[1],
    dt,
  );
  spring(N.tail.rotation, 'y', 0.06 * Math.sin(p2) * mv + w * 0.2, SB[0], SB[1], dt);

  // ---- 翼 ----
  const fold = Math.max(0, Math.min(1, gr * (1 - ch('spread')) + ch('fold')));
  for (const [s, sg] of [
    ['l', 1],
    ['r', -1],
  ]) {
    const raise = ch('wu') + ch('w' + s + 'U') + 0.55 * flapK * beat + 0.06 * (1 - fold) * gr; // 往上
    const sweep = ch('w' + s + 'S');
    const open = 1 - fold;
    spring(N[`w${s}_arm`].rotation, 'y', (1.08 * fold - sweep) * sg, SW[0], SW[1], dt);
    spring(N[`w${s}_arm`].rotation, 'z', (-raise * (0.3 + 0.7 * open) + 0.31 * fold) * sg, SW[0], SW[1], dt);
    spring(N[`w${s}_fore`].rotation, 'y', -2.62 * fold * sg, SW[0], SW[1], dt);
    spring(
      N[`w${s}_fore`].rotation,
      'z',
      -0.3 * flapK * Math.sin(t * FLAP_W - 0.7) * open * sg,
      SW[0],
      SW[1],
      dt,
    );
    spring(N[`w${s}_hand`].rotation, 'y', 2.76 * fold * sg, SW[0], SW[1], dt);
    spring(
      N[`w${s}_hand`].rotation,
      'z',
      (-0.4 * flapK * Math.sin(t * FLAP_W - 1.3) - 0.1 * raise) * open * sg,
      SW[0],
      SW[1],
      dt,
    );
  }

  // ---- 光 ----
  if (rig.eyeMat) rig.eyeMat.emissiveIntensity = Math.max(0, 1.6 * (1 + 1.6 * ch('glow')));
  if (rig.burnMat)
    rig.burnMat.emissiveIntensity = Math.max(0, 1.6 * (1 + 1.2 * ch('fire') + 0.8 * fl) * (1 + jit * 0.15));
  rig.rootY = ch('ry');
  rig.rootF = ch('rf');
  rig.rootS = ch('rs');
  rig.rootYaw = ch('ryaw');
  if (st.root || st.alt) {
    rig.group.position.y =
      (rig.rootY + (st.alt || 0) * (st.fly ? fl : clip && clip.air ? 1 : 0)) * rig.group.scale.y;
    rig.group.position.z = -rig.rootF * rig.group.scale.z;
    rig.group.position.x = rig.rootS * rig.group.scale.x;
    rig.group.rotation.y = rig.rootYaw;
  }
  if (st.spin) rig.group.rotation.y += w * dt;
}
