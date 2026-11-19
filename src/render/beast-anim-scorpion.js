// 蠍型機獸的動作（八足，和四足的 animateBeast 分開；由 beast-anim.js 的 animateBeast 依 rig.kind 轉過來）。
// 步伐：兩組交替的四腳步態（左 1、右 2、左 3、右 4 一組，另外四隻一組；同一組裡由前到後稍微錯開）。每隻腳在自己的垂直平面裡用兩段骨頭的解析解
// （腿節＋脛節），跗節保持原本的朝向；腳前後踏＝整隻腳繞髖的垂直軸轉。關節的軸＝水平、和腿的方向垂直（和模型的圓柱一致）。
// 片段的頻道（沒寫＝0）：
//   by 身體高度、pitch 俯仰（正＝前半身抬起）、roll 側傾、yaw 身體的偏航、shake 顫抖、glow 眼睛、fire 毒液與切割器的光（−1～2）
//   ry／rf／rs／ryaw 整隻的高度、往前、往側面的位移與轉向
//   tc 尾往前伸（0＝捲在背上、1＝整條甩到頭的前方刺下去、負＝往後蓄力）、ty 尾左右擺、tw 尾抖動、sx 毒針另外轉（正＝針尖往前挑）
//   cla／cra 大螯的手臂往外張（負＝往內）、clu／cru 往上舉、clf／crf 膝節往外、clh／crh 螯往外、clo／cro 可動指張開（0～1）
//   chew 小鉗開合、curl 腳往身體收（0～1，倒地、鑽地時）、dig 腳扒動
import { spring } from './mech-spring.js';

const TAU = Math.PI * 2;
const GAITS = {
  walk: { T: 1.1, b: 0.62, lift: 0.9 },
  run: { T: 0.55, b: 0.52, lift: 1.1 }, // 疾走
};
const RUN_V = 9,
  MAX_STRIDE = 3.4;
const S_LEG = [40, 0.85],
  S_BODY = [13, 0.6],
  S_ACT = [30, 0.6],
  S_TAIL = [8, 0.42],
  S_TAIL_ACT = [26, 0.5],
  S_CLAW = [12, 0.6];

// ---------- 片段 ----------
const THREAT = {
  pitch: 0.16,
  by: 0.5,
  cla: 0.55,
  cra: 0.55,
  clu: 0.5,
  cru: 0.5,
  clo: 1,
  cro: 1,
  tc: -0.12,
  glow: 1,
  fire: 1,
  chew: 1,
};
const STUCK = { tc: 1, sx: -0.1, pitch: -0.12, by: -0.5, rf: 1.2 };
const FLAT = {
  by: -1.35,
  curl: 0.25,
  tc: 0.95,
  ty: 1.2,
  sx: -0.5,
  cla: 0.5,
  cra: 0.3,
  clu: -0.25,
  cru: -0.25,
  glow: -0.6,
  fire: -0.7,
};
const DEAD = {
  by: -1.5,
  roll: 0.12,
  curl: 1,
  tc: 1.0,
  ty: 1.5,
  sx: -0.8,
  cla: -0.5,
  cra: -0.6,
  clu: -0.3,
  cru: -0.3,
  clf: -0.5,
  crf: -0.4,
  glow: -1,
  fire: -1,
};
const pinch = () => [
  // 左螯：張開、手臂往外往後拉 → 往前內側刺出去 → 夾合
  { t: 0.38, yaw: 0.22, cla: 0.75, clf: 0.3, clo: 1, clu: 0.15, glow: 0.6, cra: 0.2 },
  { t: 0.5, yaw: -0.25, rf: 1.6, cla: -0.45, clf: -0.25, clh: -0.15, clo: 1, by: -0.2, pitch: -0.05 },
  { t: 0.56, yaw: -0.25, rf: 1.6, cla: -0.45, clf: -0.25, clh: -0.15, clo: -0.12, by: -0.2, shake: 0.7 },
  { t: 0.95, yaw: -0.2, rf: 1.6, cla: -0.4, clf: -0.2, clo: -0.12 },
  { t: 1.5, rf: 1.6 },
];
const mirror = (clip) =>
  clip.map((k) => {
    const o = {};
    for (const [c, v] of Object.entries(k)) {
      if (c.startsWith('cl')) o['cr' + c.slice(2)] = v;
      else if (c.startsWith('cr')) o['cl' + c.slice(2)] = v;
      else o[c] = ['roll', 'yaw', 'ty', 'rs', 'ryaw'].includes(c) ? -v : v;
    }
    return o;
  });
export const SCORP_CLIPS = {
  // 威嚇：前半身抬起、雙螯高舉張開、尾豎直抖動、小鉗開合
  sThreat: [
    { t: 0.4, ...THREAT },
    { t: 0.5, ...THREAT, tw: 1, shake: 0.6 },
    { t: 1.7, ...THREAT, tw: 1, shake: 0.6 },
    { t: 2.3 },
  ],
  // 尾刺（招牌技）：尾往後蓄力、身體前壓 → 整條尾甩過頭頂刺進前方的地面 → 針卡在地裡一下（破綻）→ 拔出收回
  sSting: [
    { t: 0.45, tc: -0.3, sx: 0.3, pitch: 0.1, by: 0.3, cla: 0.35, cra: 0.35, glow: 0.8, fire: 1.2 },
    { t: 0.56, ...STUCK, shake: 1, fire: 2 },
    { t: 1.3, ...STUCK, fire: 0.4 },
    { t: 1.5, ...STUCK, tc: 0.9, tw: 0.6, shake: 0.4 },
    { t: 1.75, tc: 0.3, rf: 1.2, by: 0.2 },
    { t: 2.3, rf: 1.2 },
  ],
  // 尾橫掃：尾放平甩到一側 → 貼著地面掃過正面到另一側
  sTailSweep: [
    { t: 0.45, tc: 0.72, ty: 1.3, sx: -0.3, yaw: 0.3, roll: 0.06, glow: 0.6 },
    { t: 0.62, tc: 0.78, ty: -1.3, sx: -0.3, yaw: -0.35, roll: -0.08, shake: 0.6 },
    { t: 0.85, tc: 0.74, ty: -1.45, sx: -0.3, yaw: -0.35 },
    { t: 1.5 },
  ],
  // 單螯夾擊
  sPinchL: pinch(),
  // 雙螯鉗制接尾刺：雙螯大張 → 往前合攏夾住 → 尾刺下來 → 放開
  sGrab: [
    { t: 0.45, cla: 0.8, cra: 0.8, clo: 1, cro: 1, clu: 0.2, cru: 0.2, by: 0.2, tc: -0.2, glow: 0.7 },
    { t: 0.58, rf: 2, cla: -0.5, cra: -0.5, clf: -0.2, crf: -0.2, clo: 1, cro: 1, by: -0.2 },
    { t: 0.64, rf: 2, cla: -0.5, cra: -0.5, clf: -0.2, crf: -0.2, clo: 0, cro: 0, by: -0.2, shake: 0.7 },
    {
      t: 1.0,
      rf: 2,
      cla: -0.5,
      cra: -0.5,
      clf: -0.2,
      crf: -0.2,
      clu: 0.2,
      cru: 0.2,
      tc: -0.3,
      sx: 0.3,
      fire: 1.4,
    },
    {
      t: 1.1,
      rf: 2,
      cla: -0.5,
      cra: -0.5,
      clf: -0.2,
      crf: -0.2,
      clu: 0.2,
      cru: 0.2,
      tc: 0.82,
      shake: 1,
      fire: 2,
    },
    { t: 1.6, rf: 2, cla: -0.5, cra: -0.5, clf: -0.2, crf: -0.2, clu: 0.2, cru: 0.2, tc: 0.82 },
    { t: 1.9, rf: 2, cla: 0.4, cra: 0.4, clo: 1, cro: 1, tc: 0.2 },
    { t: 2.5, rf: 2 },
  ],
  // 電漿切割：雙螯往前伸直張開、切割器點亮 → 身體左右掃
  sCutter: [
    { t: 0.5, cla: -0.25, cra: -0.25, clf: 0.15, crf: 0.15, clo: 1, cro: 1, fire: 1.2, glow: 0.6, by: -0.2 },
    {
      t: 0.65,
      cla: -0.25,
      cra: -0.25,
      clf: 0.15,
      crf: 0.15,
      clo: 1,
      cro: 1,
      fire: 2,
      yaw: 0.5,
      by: -0.2,
      shake: 0.4,
    },
    {
      t: 1.5,
      cla: -0.25,
      cra: -0.25,
      clf: 0.15,
      crf: 0.15,
      clo: 1,
      cro: 1,
      fire: 2,
      yaw: -0.5,
      by: -0.2,
      shake: 0.4,
    },
    { t: 1.8, cla: -0.25, cra: -0.25, clo: 1, cro: 1, fire: 1, by: -0.2 },
    { t: 2.3 },
  ],
  // 毒液噴射：尾舉到頭頂上方、針尖指向前方 → 噴出、左右掃
  sVenom: [
    { t: 0.5, tc: 0.34, sx: 0.55, by: -0.3, pitch: -0.05, fire: 1.4, glow: 0.6, cla: 0.3, cra: 0.3 },
    { t: 0.62, tc: 0.38, sx: 0.55, ty: 0.5, by: -0.3, pitch: -0.05, fire: 2, tw: 0.4, cla: 0.3, cra: 0.3 },
    { t: 1.5, tc: 0.38, sx: 0.55, ty: -0.5, by: -0.3, pitch: -0.05, fire: 2, tw: 0.4, cla: 0.3, cra: 0.3 },
    { t: 1.8, tc: 0.3, sx: 0.4, by: -0.3, fire: 0.6 },
    { t: 2.3 },
  ],
  // 鑽進沙裡：腳扒動、身體往下沉，最後只剩尾尖
  sBurrow: [
    { t: 0.4, by: -0.8, dig: 1, cla: 0.4, cra: 0.4, shake: 0.5 },
    { t: 1.2, by: -1.3, ry: -2.6, dig: 1, curl: 0.4, tc: 0.25, cla: 0.3, cra: 0.3, shake: 0.6 },
    { t: 1.8, by: -1.3, ry: -5.2, dig: 0.6, curl: 0.7, tc: 0.5, sx: -0.4, glow: -0.6 },
    { t: 2.4, by: -1.3, ry: -7.5, curl: 0.8, tc: 0.6, sx: -0.5, glow: -1 },
  ],
  // 從地下鑽出：螯先破土、整隻竄上來、落下
  sEmerge: [
    { t: 0.01, by: -1.3, ry: -7.5, curl: 0.8, tc: 0.5, glow: -1 },
    { t: 0.5, by: -1.3, ry: -7.2, curl: 0.8, tc: 0.5, shake: 1, glow: 0.5 },
    {
      t: 0.72,
      by: 0.3,
      ry: 1.6,
      pitch: 0.3,
      cla: 0.7,
      cra: 0.7,
      clu: 0.6,
      cru: 0.6,
      clo: 1,
      cro: 1,
      curl: 0.3,
      tc: -0.2,
      glow: 1,
    },
    { t: 0.95, by: 0.2, ry: 0.6, pitch: 0.1, cla: 0.6, cra: 0.6, clu: 0.4, cru: 0.4, clo: 1, cro: 1 },
    { t: 1.08, by: -0.7, cla: 0.4, cra: 0.4, shake: 0.9 },
    { t: 1.7 },
  ],
  // 小受擊：身體一沉、尾抖一下
  sHit: [{ t: 0.07, by: -0.15, roll: 0.05, tw: 0.8, cla: 0.15, cra: 0.15 }, { t: 0.45 }],
  // 失衡：腳一軟趴到地上、尾倒向一側、雙螯垂下（背上的煙囪與尾根暴露）
  sStagger: [{ t: 0.3, ...FLAT, shake: 0.6 }, { t: 2.4, ...FLAT, ty: 1.25 }, { t: 3.1 }],
  // 擊破：最後一次舉螯豎尾 → 光熄滅、尾倒下、八隻腳往身體蜷起來
  sDeath: [
    { t: 0.4, ...THREAT, tw: 1, shake: 1 },
    { t: 1.0, ...THREAT, tw: 1, shake: 1, fire: 2 },
    { t: 1.5, by: -0.6, tc: 0.2, ty: 0.4, cla: 0.2, cra: 0.2, glow: -0.7, fire: -1, curl: 0.2 },
    { t: 2.0, ...DEAD, shake: 0.8 },
    { t: 2.5, ...DEAD },
  ],
};
SCORP_CLIPS.sPinchR = mirror(SCORP_CLIPS.sPinchL);

// ---------- 初始化 ----------
function init(rig) {
  const P = rig.piv,
    N = rig.nodes;
  const legs = [];
  for (const side of ['l', 'r'])
    for (let i = 1; i <= 4; i++) {
      const hip = P[`${side}${i}_a`],
        knee = P[`${side}${i}_b`],
        ank = P[`${side}${i}_c`];
      // 遊戲座標（x、z 反向）
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
      // 腳尖（跗節的末端）：比踝再往外一點、在地面
      const R = ra / 0.84;
      const group = (side === 'l') === (i % 2 === 1) ? 0 : 0.5;
      legs.push({
        n: [N[`${side}${i}_a`], N[`${side}${i}_b`], N[`${side}${i}_c`]],
        gx,
        gz,
        d: [dx, dz],
        h: new THREE.Vector3(-dz, 0, dx), // 關節的軸（繞它轉正的＝在（往外, 往上）平面逆時針）
        phi: Math.atan2(-dz, dx),
        R,
        A,
        l1: Math.hypot(K[0], K[1]),
        l2: Math.hypot(A[0] - K[0], A[1] - K[1]),
        a1: Math.atan2(K[1], K[0]),
        a2: Math.atan2(A[1] - K[1], A[0] - K[0]),
        ph: group + (i - 1) * 0.07,
        q: { x: 0, y: 0, z: 0 }, // 彈簧後的角度：x 腿節、y 脛節（世界）、z 偏航
        seed: i * 1.7 + (side === 'l' ? 0 : 0.9),
      });
    }
  return { legs, y0: N.chest.position.y, ph: 0, mv: 0, gait: 'walk', A: {} };
}
const QY = new THREE.Quaternion(),
  QH = new THREE.Quaternion(),
  YAX = new THREE.Vector3(0, 1, 0);

export function animateScorpion(rig, st, dt, clipAt) {
  const an = rig.an || (rig.an = init(rig));
  const N = rig.nodes;
  const t = st.t || 0;
  const v = st.v || 0,
    w = st.w || 0;
  const moving = Math.abs(v) > 0.3 || Math.abs(w) > 0.05;
  const A = an.A;
  const clip = st.act && SCORP_CLIPS[st.act.name];
  let aw = 0;
  if (clip) {
    clipAt(clip, st.act.t, A);
    aw = clip.keepGait ? 0 : Math.min(1, st.act.t / 0.08);
  } else for (const k in A) delete A[k];
  const ch = (k) => A[k] || 0;
  const SB = clip ? S_ACT : S_BODY,
    ST = clip ? S_TAIL_ACT : S_TAIL;
  // 步態
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
  const breath = Math.sin(t * 1.4);
  const shake = ch('shake');
  const jit = shake * Math.sin(t * 47);

  // ---- 身體 ----
  const bob = 0.06 * Math.sin(2 * p2) * mv + 0.04 * breath * still + ch('by');
  const pitch = ch('pitch') + 0.01 * Math.sin(2 * p2 + 1) * mv;
  const roll = ch('roll') + 0.035 * Math.sin(p2) * mv;
  spring(N.chest.position, 'y', an.y0 + bob, SB[0] * 1.5, 0.8, dt);
  spring(N.chest.rotation, 'x', pitch + jit * 0.008, SB[0], SB[1], dt);
  spring(N.chest.rotation, 'z', roll, SB[0], SB[1], dt);
  spring(N.chest.rotation, 'y', ch('yaw') + 0.03 * Math.sin(p2) * mv, SB[0], SB[1], dt);
  const bobR = N.chest.position.y - an.y0,
    pR = N.chest.rotation.x,
    rR = N.chest.rotation.z,
    yR = N.chest.rotation.y;

  // ---- 腳 ----
  const curl = ch('curl'),
    dig = ch('dig');
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
    // 腳尖相對髖的水平位置（遊戲座標：前方＝−z）：原本的位置＋步伐；身體偏航時腳留在原地
    const fx0 = L.d[0] * L.R,
      fz0 = L.d[1] * L.R;
    const wx = L.gx + fx0,
      wz = L.gz + fz0; // 腳尖相對身體中心
    // 前進：腳在著地期由前往後；轉向：繞身體中心的切線方向
    let px = fx0 + w * wz * k,
      pz = fz0 - v * k - w * wx * k;
    // 身體偏航（片段的 yaw）：腳留在地上 → 在身體座標裡反向轉
    const cy = Math.cos(-yR),
      sy = Math.sin(-yR);
    const ax = wx + (px - fx0),
      az = wz + (pz - fz0);
    px = ax * cy + az * sy - L.gx;
    pz = -ax * sy + az * cy - L.gz;
    // 扒動（鑽地）
    const dg = dig * Math.sin(t * 15 + L.seed);
    const r = Math.hypot(px, pz) * (1 - 0.35 * curl) + dg * 0.5;
    const psi = Math.atan2(-pz, px) - L.phi;
    // 髖因為身體的俯仰、側傾、起伏而改變的高度
    const hipDy = bobR + pR * -L.gz + rR * L.gx;
    lift = lift * mv + Math.max(0, dg) * 0.8;
    const tx = r - (L.R - L.A[0]),
      ty = L.A[1] + lift - hipDy * (1 - curl);
    const dd = Math.min(Math.hypot(tx, ty), (L.l1 + L.l2) * 0.995);
    const base = Math.atan2(ty, tx);
    const ca = Math.max(-1, Math.min(1, (L.l1 * L.l1 + dd * dd - L.l2 * L.l2) / (2 * L.l1 * dd)));
    const th1 = base + Math.acos(ca); // 膝在上
    const e1 = [Math.cos(th1) * L.l1, Math.sin(th1) * L.l1];
    const th2 = Math.atan2(Math.sin(base) * dd - e1[1], Math.cos(base) * dd - e1[0]);
    // 蜷起：腿節往上收、脛節往內折
    const a = th1 - L.a1 + curl * 0.35,
      b = th2 - L.a2 - curl * 1.1;
    spring(L.q, 'x', a, S_LEG[0], S_LEG[1], dt);
    spring(L.q, 'y', b, S_LEG[0], S_LEG[1], dt);
    spring(L.q, 'z', psi, S_LEG[0], S_LEG[1], dt);
    QY.setFromAxisAngle(YAX, L.q.z);
    L.n[0].quaternion.copy(QY).multiply(QH.setFromAxisAngle(L.h, L.q.x));
    L.n[1].quaternion.setFromAxisAngle(L.h, L.q.y - L.q.x);
    L.n[2].quaternion.setFromAxisAngle(L.h, -L.q.y - curl * 0.5); // 跗節保持原本的朝向
  }

  // ---- 大螯 ----
  const idleC = still * Math.sin(t * 0.6);
  for (const [s, sg] of [
    ['l', 1],
    ['r', -1],
  ]) {
    const c = (k) => ch('c' + s + k);
    const sway = 0.05 * Math.sin(p2 + (sg > 0 ? 0 : Math.PI)) * mv;
    const SC = clip ? S_ACT : S_CLAW;
    spring(N[`c${s}_arm`].rotation, 'y', (c('a') + 0.06 * idleC * sg + sway * sg) * sg, SC[0], SC[1], dt);
    spring(N[`c${s}_arm`].rotation, 'x', c('u') + 0.03 * breath * still, SC[0], SC[1], dt);
    spring(N[`c${s}_fore`].rotation, 'y', c('f') * sg, SC[0], SC[1], dt);
    spring(N[`c${s}_hand`].rotation, 'y', c('h') * sg, SC[0], SC[1], dt);
    const open = c('o') + 0.25 + 0.2 * still * Math.max(0, Math.sin(t * 0.9 + sg));
    spring(N[`c${s}_finger`].rotation, 'y', Math.max(-0.05, open) * 0.5 * sg, 34, 0.55, dt);
  }
  // 小鉗：待機時偶爾開合
  const chew = ch('chew') * Math.sin(t * 16) + still * Math.max(0, Math.sin(t * 2.3)) * 0.4;
  spring(N.chel_l.rotation, 'x', -0.14 * chew, 30, 0.6, dt);
  spring(N.chel_r.rotation, 'x', 0.14 * chew - 0.06, 30, 0.6, dt);

  // ---- 尾：往前伸＝每一節往前轉（越後面的節轉越多）；一節一節延遲的左右擺 ----
  const tc = ch('tc'),
    tyc = ch('ty'),
    tw = ch('tw');
  // 往前刺：主要是尾根整條往前倒，後面幾節反而稍微伸直（才搆得到前面）
  const TC = [1.9, -0.17, -0.33, -0.37, -0.37];
  for (let i = 1; i <= 5; i++) {
    const n = N['tail' + i];
    const lag = i * 0.5;
    const idle = still * 0.05 * Math.sin(t * 0.8 - lag);
    const wag = tw * 0.07 * Math.sin(t * 38 + i);
    spring(
      n.rotation,
      'x',
      -tc * TC[i - 1] - pR * 0.2 + idle + 0.03 * Math.sin(2 * p2 - lag) * mv + wag,
      ST[0],
      ST[1],
      dt,
    );
    spring(
      n.rotation,
      'y',
      tyc * (i === 1 ? 0.5 : 0.22) +
        still * 0.06 * Math.sin(t * 0.5 - lag) +
        0.05 * Math.sin(p2 - lag) * mv -
        w * 0.06,
      ST[0],
      ST[1],
      dt,
    );
  }
  spring(
    N.sting.rotation,
    'x',
    -tc * 0.3 + ch('sx') + wag2(tw, t) + still * 0.06 * Math.sin(t * 1.1),
    ST[0],
    ST[1],
    dt,
  );

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
const wag2 = (tw, t) => tw * 0.12 * Math.sin(t * 41);
