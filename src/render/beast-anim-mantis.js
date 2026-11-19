// 螳螂型機獸的動作（四隻步足＋兩把鐮刀；由 beast-anim.js 的 animateBeast 依 rig.kind 轉過來，做法同蠍型 beast-anim-scorpion.js）。
// 步伐：對角兩腳一組交替；待機時整個身體前後搖（螳螂像枝葉被風吹的搖晃），腳留在原地。每隻腳在自己的垂直平面裡解兩段骨頭，跗節保持原本的朝向。
// 旋轉的方向：繞 X 正的＝在（往前, 往上）平面逆時針，往前的東西往上抬。
// 片段的頻道（沒寫＝0）：
//   by 身體高度、pitch／roll／yaw 身體、shake 顫抖、glow 複眼、fire 能量刃與推進的光（−1～2）、ry／rf／rs／ryaw 整隻的位移與轉向
//   thx 前胸（正＝更直立、負＝往前撲）、thy 前胸左右扭、hx／hy／hz 頭（點頭、轉頭、歪頭）、ab 腹（正＝腹尾翹起）、ant 觸角抖動
//   slC／srC 鐮刀的基節（正＝往前上方舉）、slO／srO 往外張、slF／srF 腿節（負＝往前伸直）、slB／srB 鐮刃張開（弧度）
//   wing 翅張開（0～1）、flut 膜翅振動（0～1）、curl 腳蜷起（0～1）
import { spring } from './mech-spring.js';

const TAU = Math.PI * 2;
const GAITS = {
  walk: { T: 1.3, b: 0.64, lift: 1.3 },
  run: { T: 0.62, b: 0.5, lift: 1.5 },
};
const RUN_V = 8,
  MAX_STRIDE = 4.6;
const S_LEG = [36, 0.85],
  S_BODY = [12, 0.6],
  S_ACT = [30, 0.6],
  S_ARM = [14, 0.6],
  S_STRIKE = [60, 0.55]; // 鐮刀出手：非常快

// ---------- 片段 ----------
const mirror = (clip) =>
  clip.map((k) => {
    const o = {};
    for (const [c, v] of Object.entries(k)) {
      if (/^sl[A-Z]$/.test(c)) o['sr' + c[2]] = v;
      else if (/^sr[A-Z]$/.test(c)) o['sl' + c[2]] = v;
      else o[c] = ['roll', 'yaw', 'thy', 'hy', 'hz', 'rs', 'ryaw'].includes(c) ? -v : v;
    }
    return o;
  });
const both = (o) => {
  const r = {};
  for (const [k, v] of Object.entries(o)) {
    r['sl' + k] = v;
    r['sr' + k] = v;
  }
  return r;
};
// 鐮刀的幾個姿勢
const RAISE = { C: 1.15, F: -0.25, B: 1.9 }, // 高舉、刃張開
  REACH = { C: 0.8, F: -1.45, B: 1.85 }, // 往前伸到最遠、刃張開
  CLOSE = { C: 0.8, F: -1.45, B: 0.35 }, // 伸出去之後夾合
  CHOP = { C: 0.35, F: -1.25, B: 0.75 }; // 往前下方劈到底
const one = (side, o) => Object.fromEntries(Object.entries(o).map(([k, v]) => ['s' + side + k, v]));
const THREAT = {
  thx: 0.3,
  by: 0.4,
  pitch: 0.1,
  ...both({ C: 1.0, O: 0.75, F: -0.5, B: 1.7 }),
  wing: 1,
  flut: 0.5,
  ab: 0.3,
  glow: 1,
  fire: 1.2,
};
const HOVER = { ry: 7, by: 0.3, pitch: 0.12, curl: 0.7, wing: 1, flut: 1, fire: 1.6, ab: -0.15 };
const DOWN = {
  by: -2.6,
  thx: -0.85,
  hx: 0.3,
  ...both({ C: 1.5, F: -1.3, B: 2.3, O: 0.25 }),
  wing: 0.3,
  ab: -0.1,
  glow: -0.6,
  fire: -0.7,
};
const DEAD = {
  by: -3.0,
  roll: 1.25,
  rs: -1.5,
  thx: -0.5,
  hx: 0.4,
  hz: 0.4,
  curl: 1,
  ...both({ C: -0.3, F: 0.2, B: 0 }),
  wing: 0.45,
  ab: -0.35,
  glow: -1,
  fire: -1,
};
export const MANTIS_CLIPS = {
  // 威嚇：前胸立起、雙鐮高舉往外張、展翅振動、腹尾翹起
  mThreat: [
    { t: 0.4, ...THREAT },
    { t: 0.5, ...THREAT, shake: 0.6, ant: 1 },
    { t: 1.8, ...THREAT, shake: 0.6, ant: 1 },
    { t: 2.4 },
  ],
  // 單鐮斬（左）：高舉 → 往前下方劈
  mSlashL: [
    { t: 0.4, thx: 0.2, yaw: 0.2, thy: 0.25, ...one('l', RAISE), glow: 0.6, fire: 1 },
    { t: 0.5, thx: -0.35, yaw: -0.2, thy: -0.3, rf: 1.5, ...one('l', CHOP), fire: 2, shake: 0.6 },
    { t: 0.85, thx: -0.3, yaw: -0.15, thy: -0.25, rf: 1.5, ...one('l', CHOP) },
    { t: 1.4, rf: 1.5 },
  ],
  // 雙鐮交叉斬：雙鐮往兩側大張 → 往中間交叉掃過
  mCross: [
    { t: 0.45, thx: 0.25, ...both({ C: 0.75, O: 0.95, F: -1.0, B: 1.6 }), glow: 0.7, fire: 1.2 },
    { t: 0.56, thx: -0.2, rf: 1.8, ...both({ C: 0.55, O: -0.55, F: -1.3, B: 1.1 }), fire: 2, shake: 0.7 },
    { t: 0.9, thx: -0.15, rf: 1.8, ...both({ C: 0.5, O: -0.5, F: -1.2, B: 0.9 }) },
    { t: 1.5, rf: 1.8 },
  ],
  // 捕捉（招牌技）：身體往後縮蓄力 → 雙鐮瞬間彈出去夾合（出手 0.1 秒）→ 拉回嘴邊啃 → 放開
  mGrab: [
    { t: 0.55, thx: 0.22, by: -0.3, rf: -0.6, ...both({ C: -0.1, F: 0.15, B: 0.1 }), glow: 1, ant: 1 },
    { t: 0.63, thx: -0.45, by: -0.2, rf: 1.6, ...both(REACH), fire: 2 },
    { t: 0.69, thx: -0.45, by: -0.2, rf: 1.6, ...both(CLOSE), fire: 2, shake: 0.8 },
    { t: 1.0, thx: -0.1, rf: 1.6, ...both({ C: 0.1, F: -0.2, B: 0.25 }) },
    { t: 1.15, thx: -0.05, rf: 1.6, hx: -0.3, ...both({ C: 0.1, F: -0.2, B: 0.25 }), shake: 0.4 },
    { t: 1.3, thx: -0.05, rf: 1.6, hx: 0.05, ...both({ C: 0.1, F: -0.2, B: 0.25 }) },
    { t: 1.45, thx: -0.05, rf: 1.6, hx: -0.3, ...both({ C: 0.1, F: -0.2, B: 0.25 }), shake: 0.4 },
    { t: 1.8, rf: 1.6, ...both({ C: 0.5, F: -0.9, B: 1.4 }) },
    { t: 2.4, rf: 1.6 },
  ],
  // 斬擊波：右鐮往外後方拉滿 → 水平掃過正面（能量刃甩出去是特效）
  mWave: [
    {
      t: 0.5,
      thx: 0.15,
      yaw: -0.35,
      thy: -0.4,
      ...one('r', { C: 0.7, O: 1.1, F: -1.2, B: 1.5 }),
      glow: 0.8,
      fire: 1.6,
    },
    {
      t: 0.6,
      thx: -0.1,
      yaw: 0.35,
      thy: 0.45,
      ...one('r', { C: 0.6, O: -0.6, F: -1.35, B: 1.3 }),
      fire: 2,
      shake: 0.6,
    },
    { t: 0.95, yaw: 0.3, thy: 0.4, ...one('r', { C: 0.5, O: -0.5, F: -1.2, B: 1.0 }), fire: 0.6 },
    { t: 1.5 },
  ],
  // 升空懸停：展翅、振翅、離地，腳收起
  mHover: [
    { t: 0.4, by: -0.9, wing: 1, flut: 0.6, fire: 1 },
    { t: 1.0, ...HOVER },
    { t: 2.6, ...HOVER, hy: 0.4 },
    { t: 3.1, ry: 1.5, wing: 1, flut: 0.8, curl: 0.2 },
    { t: 3.35, by: -0.8, wing: 0.4, shake: 0.5 },
    { t: 3.9 },
  ],
  // 俯衝斬：升空 → 雙鐮高舉 → 往前下方俯衝、落地時雙鐮劈下
  mDive: [
    { t: 0.35, by: -0.9, wing: 1, flut: 0.6, fire: 1 },
    { t: 0.8, ...HOVER, ry: 8, rf: 1, thx: 0.2, ...both(RAISE), glow: 1 },
    { t: 1.1, ...HOVER, ry: 8.5, rf: 2, thx: 0.25, ...both(RAISE), glow: 1, fire: 2 },
    {
      t: 1.36,
      ry: 2.5,
      rf: 15,
      pitch: -0.3,
      thx: -0.2,
      curl: 0.3,
      wing: 1,
      flut: 1,
      ...both(RAISE),
      fire: 2,
    },
    { t: 1.46, by: -1.0, rf: 18, pitch: -0.08, thx: -0.4, wing: 0.5, ...both(CHOP), fire: 2, shake: 1 },
    { t: 1.9, by: -0.5, rf: 18, thx: -0.3, ...both(CHOP) },
    { t: 2.5, rf: 18 },
  ],
  // 小受擊：前胸往後一仰、觸角抖
  mHit: [{ t: 0.07, thx: 0.15, hx: -0.15, by: -0.1, ant: 1, ...both({ C: 0.1 }) }, { t: 0.45 }],
  // 失衡：前胸整個往前栽、雙鐮撐在地上、翅半張垂著（頭與頸暴露）
  mStagger: [{ t: 0.3, ...DOWN, shake: 0.6 }, { t: 2.4, ...DOWN, hx: 0.35 }, { t: 3.1 }],
  // 擊破：最後一次威嚇 → 光熄滅 → 往側面倒下、腳與鐮刀蜷起
  mDeath: [
    { t: 0.4, ...THREAT, shake: 1, ant: 1 },
    { t: 1.0, ...THREAT, shake: 1, ant: 1, fire: 2 },
    {
      t: 1.5,
      by: -0.8,
      thx: -0.3,
      roll: 0.25,
      wing: 0.6,
      glow: -0.7,
      fire: -1,
      ...both({ C: 0.2, F: -0.6, B: 0.8 }),
    },
    { t: 2.0, ...DEAD, shake: 0.8 },
    { t: 2.5, ...DEAD },
  ],
};
MANTIS_CLIPS.mSlashR = mirror(MANTIS_CLIPS.mSlashL);

// ---------- 初始化 ----------
function init(rig) {
  const P = rig.piv,
    N = rig.nodes;
  const legs = [];
  for (const [pre, ph] of [
    ['ml', 0],
    ['hr', 0.04],
    ['mr', 0.5],
    ['hl', 0.54],
  ]) {
    const hip = P[pre + '_a'],
      knee = P[pre + '_b'],
      ank = P[pre + '_c'];
    const gx = -hip[0],
      gz = -hip[2];
    let dx = -(ank[0] - hip[0]),
      dz = -(ank[2] - hip[2]);
    const ra = Math.hypot(dx, dz);
    dx /= ra;
    dz /= ra;
    const rk = Math.hypot(knee[0] - hip[0], knee[2] - hip[2]);
    const K = [rk, knee[1] - hip[1]],
      A = [ra, ank[1] - hip[1]];
    legs.push({
      n: [N[pre + '_a'], N[pre + '_b'], N[pre + '_c']],
      gx,
      gz,
      d: [dx, dz],
      h: new THREE.Vector3(-dz, 0, dx),
      phi: Math.atan2(-dz, dx),
      R: ra / 0.887, // 腳尖比踝再往外一點
      A,
      l1: Math.hypot(K[0], K[1]),
      l2: Math.hypot(A[0] - K[0], A[1] - K[1]),
      a1: Math.atan2(K[1], K[0]),
      a2: Math.atan2(A[1] - K[1], A[0] - K[0]),
      ph,
      q: { x: 0, y: 0, z: 0 },
    });
  }
  return { legs, y0: N.chest.position.y, z0: N.chest.position.z, ph: 0, mv: 0, gait: 'walk', A: {} };
}
const QY = new THREE.Quaternion(),
  QH = new THREE.Quaternion(),
  YAX = new THREE.Vector3(0, 1, 0);

export function animateMantis(rig, st, dt, clipAt) {
  const an = rig.an || (rig.an = init(rig));
  const N = rig.nodes;
  const t = st.t || 0;
  const v = st.v || 0,
    w = st.w || 0;
  const moving = Math.abs(v) > 0.3 || Math.abs(w) > 0.05;
  const A = an.A;
  const clip = st.act && MANTIS_CLIPS[st.act.name];
  let aw = 0;
  if (clip) {
    clipAt(clip, st.act.t, A);
    aw = Math.min(1, st.act.t / 0.08);
  } else for (const k in A) delete A[k];
  const ch = (k) => A[k] || 0;
  const SB = clip ? S_ACT : S_BODY;
  an.gait = Math.abs(v) > RUN_V * (an.gait === 'run' ? 0.9 : 1.05) ? 'run' : 'walk';
  const G = GAITS[an.gait];
  // 腳著地的那一段要和地面的速度一致（不滑）：超過腿伸得到的 MAX_STRIDE 時先把步頻加快到 0.72 倍，
  // 再縮短著地的比例（最低 0.14），還不夠才繼續加快步頻（同 beast-anim.js）
  let T = G.T,
    gb = G.b;
  if (Math.abs(v) * T * gb > MAX_STRIDE) {
    T = Math.max(G.T * 0.72, MAX_STRIDE / (Math.abs(v) * gb));
    gb = Math.max(0.14, Math.min(G.b, MAX_STRIDE / (Math.abs(v) * T)));
    if (Math.abs(v) * T * gb > MAX_STRIDE) T = MAX_STRIDE / (Math.abs(v) * gb);
  }
  if (moving) an.ph = (an.ph + dt / T) % 1;
  an.mv += ((moving ? 1 : 0) - an.mv) * Math.min(1, dt * 6);
  const mv = an.mv * (1 - aw),
    p2 = an.ph * TAU,
    still = (1 - an.mv) * (1 - aw);
  const stanceT = T * gb;
  const shake = ch('shake');
  const jit = shake * Math.sin(t * 47);
  // 待機的搖晃：整個身體前後搖（腳不動），有時停一下
  const rock = still * Math.sin(t * 1.9) * (0.55 + 0.45 * Math.sin(t * 0.31));

  // ---- 身體 ----
  const bob = 0.1 * Math.sin(2 * p2) * mv + ch('by');
  spring(N.chest.position, 'y', an.y0 + bob, SB[0] * 1.5, 0.8, dt);
  spring(N.chest.position, 'z', an.z0 - 0.45 * rock, 10, 0.7, dt);
  spring(
    N.chest.rotation,
    'x',
    ch('pitch') + 0.02 * rock + 0.015 * Math.sin(2 * p2 + 1) * mv + jit * 0.008,
    SB[0],
    SB[1],
    dt,
  );
  spring(N.chest.rotation, 'z', ch('roll') + 0.04 * Math.sin(p2) * mv, SB[0], SB[1], dt);
  spring(N.chest.rotation, 'y', ch('yaw') + 0.03 * Math.sin(p2) * mv, SB[0], SB[1], dt);
  const bobR = N.chest.position.y - an.y0,
    swz = N.chest.position.z - an.z0,
    pR = N.chest.rotation.x,
    rR = N.chest.rotation.z,
    yR = N.chest.rotation.y;

  // ---- 步足 ----
  const curl = ch('curl');
  for (const L of an.legs) {
    const ph = (an.ph + L.ph) % 1;
    let s,
      lift = 0;
    if (ph < gb) s = ph / gb;
    else {
      const u = (ph - gb) / (1 - gb);
      s = 1 - u * u * (3 - 2 * u);
      lift = G.lift * Math.sin(Math.PI * Math.pow(u, 0.8));
    }
    const k = (0.5 - s) * stanceT * mv;
    const fx0 = L.d[0] * L.R,
      fz0 = L.d[1] * L.R;
    const wx = L.gx + fx0,
      wz = L.gz + fz0;
    // 前進與轉向的步伐；身體前後搖、偏航時腳留在原地
    const ax = wx + w * wz * k,
      az = wz - v * k - w * wx * k - swz;
    const cy = Math.cos(-yR),
      sy = Math.sin(-yR);
    const px = ax * cy + az * sy - L.gx,
      pz = -ax * sy + az * cy - L.gz;
    const r = Math.hypot(px, pz) * (1 - 0.4 * curl);
    const psi = Math.atan2(-pz, px) - L.phi;
    const hipDy = bobR + pR * -L.gz + rR * L.gx;
    const tx = r - (L.R - L.A[0]),
      ty = L.A[1] + lift * mv - hipDy * (1 - curl);
    const dd = Math.min(Math.hypot(tx, ty), (L.l1 + L.l2) * 0.995);
    const base = Math.atan2(ty, tx);
    const ca = Math.max(-1, Math.min(1, (L.l1 * L.l1 + dd * dd - L.l2 * L.l2) / (2 * L.l1 * dd)));
    const th1 = base + Math.acos(ca);
    const th2 = Math.atan2(
      Math.sin(base) * dd - Math.sin(th1) * L.l1,
      Math.cos(base) * dd - Math.cos(th1) * L.l1,
    );
    spring(L.q, 'x', th1 - L.a1 + curl * 0.3, S_LEG[0], S_LEG[1], dt);
    spring(L.q, 'y', th2 - L.a2 - curl * 1.2, S_LEG[0], S_LEG[1], dt);
    spring(L.q, 'z', psi, S_LEG[0], S_LEG[1], dt);
    QY.setFromAxisAngle(YAX, L.q.z);
    L.n[0].quaternion.copy(QY).multiply(QH.setFromAxisAngle(L.h, L.q.x));
    L.n[1].quaternion.setFromAxisAngle(L.h, L.q.y - L.q.x);
    L.n[2].quaternion.setFromAxisAngle(L.h, -L.q.y - curl * 0.5);
  }

  // ---- 前胸、頭、觸角、腹 ----
  const thx = ch('thx');
  spring(
    N.thorax.rotation,
    'x',
    thx - pR * 0.5 - 0.03 * rock + 0.02 * Math.sin(2 * p2) * mv,
    SB[0],
    SB[1],
    dt,
  );
  spring(N.thorax.rotation, 'y', ch('thy'), SB[0], SB[1], dt);
  // 頭：抵銷前胸的俯仰；待機時轉頭張望、偶爾歪頭
  const look = still * (0.5 * Math.sin(t * 0.43) + 0.25 * Math.sin(t * 1.07 + 1));
  const tilt = still * 0.3 * Math.max(0, Math.sin(t * 0.27 + 2)) * Math.sin(t * 0.9);
  spring(N.head.rotation, 'x', -thx * 0.7 + ch('hx') + jit * 0.01, 22, 0.6, dt);
  spring(N.head.rotation, 'y', ch('hy') + look + w * 0.2 * (1 - aw), 22, 0.6, dt);
  spring(N.head.rotation, 'z', ch('hz') + tilt, 22, 0.6, dt);
  const ant = ch('ant');
  for (const [name, sg] of [
    ['ant_l', 1],
    ['ant_r', -1],
  ]) {
    spring(
      N[name].rotation,
      'x',
      0.12 * Math.sin(t * 1.3 + sg) * (still + mv) + ant * 0.2 * Math.sin(t * 33 + sg),
      16,
      0.4,
      dt,
    );
    spring(
      N[name].rotation,
      'z',
      0.1 * Math.sin(t * 0.9 + sg * 2) * sg + ant * 0.12 * Math.sin(t * 29),
      16,
      0.4,
      dt,
    );
  }
  spring(
    N.abdomen.rotation,
    'x',
    -ch('ab') + 0.03 * Math.sin(t * 1.1) * still - 0.04 * Math.sin(2 * p2) * mv + pR * 0.3,
    SB[0],
    SB[1],
    dt,
  );

  // ---- 鐮刀 ----
  for (const [s, sg] of [
    ['l', 1],
    ['r', -1],
  ]) {
    const c = (k) => ch('s' + s + k);
    const fast = clip && Math.abs(c('F')) + Math.abs(c('B')) > 0.05;
    const SA = fast ? S_STRIKE : S_ARM;
    const idle = still * 0.05 * Math.sin(t * 1.9 + sg);
    spring(N[`s${s}_coxa`].rotation, 'x', c('C') + idle + 0.04 * Math.sin(p2 + sg) * mv, SA[0], SA[1], dt);
    spring(N[`s${s}_coxa`].rotation, 'y', c('O') * sg, SA[0], SA[1], dt);
    spring(N[`s${s}_femur`].rotation, 'x', c('F') - idle, SA[0], SA[1], dt);
    spring(
      N[`s${s}_blade`].rotation,
      'x',
      Math.max(0, c('B') + 0.06 * still * (1 + Math.sin(t * 0.8 + sg))),
      SA[0],
      SA[1],
      dt,
    );
  }

  // ---- 翅 ----
  const wing = ch('wing'),
    flut = ch('flut') * Math.sin(t * 70);
  for (const [s, sg] of [
    ['l', 1],
    ['r', -1],
  ]) {
    spring(N['wing_' + s].rotation, 'x', -0.6 * wing, 16, 0.6, dt);
    spring(N['wing_' + s].rotation, 'z', -1.0 * wing * sg, 16, 0.6, dt);
    spring(N['fan_' + s].rotation, 'x', -0.22 * wing, 16, 0.6, dt);
    N['fan_' + s].rotation.z = (-1.4 * wing + 0.22 * flut) * sg * Math.min(1, wing * 3);
  }

  // ---- 光 ----
  if (rig.eyeMat) rig.eyeMat.emissiveIntensity = Math.max(0, 1.6 * (1 + 1.6 * ch('glow')));
  if (rig.burnMat)
    rig.burnMat.emissiveIntensity = Math.max(0, 1.6 * (1 + 1.2 * ch('fire')) * (1 + jit * 0.15));
  rig.rootY = ch('ry');
  rig.rootF = ch('rf');
  rig.rootS = ch('rs');
  rig.rootYaw = ch('ryaw');
  if (st.root) {
    rig.group.position.y = rig.rootY * rig.group.scale.y;
    rig.group.position.z = -rig.rootF * rig.group.scale.z;
    rig.group.position.x = rig.rootS * rig.group.scale.x;
    rig.group.rotation.y = rig.rootYaw;
  }
  if (st.spin) rig.group.rotation.y += w * dt;
}
