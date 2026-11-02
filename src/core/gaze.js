// 眼動追蹤的純函式（docs/gaze-design.md）：MediaPipe Face Landmarker 的結果 → 特徵、校正（嶺迴歸）、平滑（One-Euro）、頭部轉向。
// 不碰 DOM 與遊戲狀態，冒煙測試直接拿合成的資料驗證。

// 眼睛的特徵點（MediaPipe 臉部網格的索引）：外眼角、內眼角、上眼瞼、下眼瞼；虹膜中心 468／473（哪一個屬於哪隻眼睛以距離配對）
const EYES = [
  [33, 133, 159, 145],
  [263, 362, 386, 374],
];
const IRIS = [468, 473];

// 臉部轉換矩陣（4×4，column-major，平移單位 cm）→ 頭的左右／上下轉向（弧度）與位置。
// 鏡頭座標：x＝畫面右、y＝上、z＝朝向鏡頭；臉的 +z＝鼻子方向。yaw > 0＝使用者往自己的左邊轉頭，pitch > 0＝抬頭
export function headPose(m) {
  if (!m || m.length < 16) return null;
  const yaw = Math.atan2(m[8], m[10]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, m[9])));
  const roll = Math.atan2(m[1], m[0]);
  return { yaw, pitch, roll, x: m[12], y: m[13], z: m[14] };
}

const bsMap = (bs) => {
  const o = {};
  if (bs) for (const c of bs) o[c.categoryName] = c.score;
  return o;
};

// 一隻眼睛：虹膜在眼睛裡的位置（沿眼角連線 0＝內眼角、1＝外眼角；垂直＝離連線的距離 ÷ 眼寬），先扣掉頭的翻滾
function eyeFeat(lm, E, iris) {
  const o = lm[E[0]],
    n = lm[E[1]];
  const ax = o.x - n.x,
    ay = o.y - n.y;
  const w2 = ax * ax + ay * ay;
  if (w2 < 1e-8) return null;
  const w = Math.sqrt(w2);
  const ix = iris.x - n.x,
    iy = iris.y - n.y;
  const u = (ix * ax + iy * ay) / w2;
  const v = (ix * -ay + iy * ax) / w2; // 垂直方向（以眼寬正規化）
  const up = lm[E[2]],
    dn = lm[E[3]];
  const open = Math.hypot(up.x - dn.x, up.y - dn.y) / w; // 眼睛張開的程度（往下看時眼瞼跟著閉）
  return { u, v, open };
}

// 特徵向量（不含常數項；校正時另外標準化）＋眨眼與頭部姿勢；看不到臉時回傳 null
export function gazeFeatures(lm, blend, mat) {
  if (!lm || lm.length < 478) return null;
  const bs = bsMap(blend);
  const blink = Math.max(bs.eyeBlinkLeft || 0, bs.eyeBlinkRight || 0);
  const hp = headPose(mat) || { yaw: 0, pitch: 0, roll: 0, x: 0, y: 0, z: -50 };
  const ir = IRIS.map((i) => lm[i]);
  const e = EYES.map((E) => {
    const c = lm[E[0]];
    const d0 = Math.hypot(ir[0].x - c.x, ir[0].y - c.y),
      d1 = Math.hypot(ir[1].x - c.x, ir[1].y - c.y);
    return eyeFeat(lm, E, d0 < d1 ? ir[0] : ir[1]);
  });
  if (!e[0] || !e[1]) return null;
  // 兩眼的 u 方向相反（內眼角在中間）：換成同一個方向（畫面右＝正）再平均
  const ex = (e[1].u - e[0].u) / 2;
  const ey = (e[0].v - e[1].v) / 2; // 兩眼的垂直軸也相反
  const open = (e[0].open + e[1].open) / 2;
  const bh =
    ((bs.eyeLookOutLeft || 0) -
      (bs.eyeLookInLeft || 0) +
      (bs.eyeLookInRight || 0) -
      (bs.eyeLookOutRight || 0)) /
    2;
  const bv =
    ((bs.eyeLookUpLeft || 0) +
      (bs.eyeLookUpRight || 0) -
      (bs.eyeLookDownLeft || 0) -
      (bs.eyeLookDownRight || 0)) /
    2;
  const z = Math.min(-10, hp.z);
  const f = [
    ex,
    ey,
    open,
    bh,
    bv,
    hp.yaw,
    hp.pitch,
    hp.x / -z,
    hp.y / -z,
    ex * ex,
    ey * ey,
    ex * hp.yaw,
    ey * hp.pitch,
  ];
  return { f, blink, head: hp };
}

// 嶺迴歸：X（n×d，每列一筆特徵）→ Y（n×2，畫面座標 0～1）。特徵先標準化，回傳 { mu, sd, w }（w：(d+1)×2，第 0 列是常數項）
export function gazeFit(X, Y, lambda = 0.02) {
  const n = X.length;
  if (n < 4) return null;
  const d = X[0].length;
  const mu = new Array(d).fill(0),
    sd = new Array(d).fill(0);
  for (const r of X) for (let j = 0; j < d; j++) mu[j] += r[j] / n;
  for (const r of X) for (let j = 0; j < d; j++) sd[j] += (r[j] - mu[j]) ** 2 / n;
  for (let j = 0; j < d; j++) sd[j] = Math.sqrt(sd[j]) || 1;
  const D = d + 1;
  const A = Array.from({ length: D }, () => new Array(D).fill(0));
  const B = Array.from({ length: D }, () => [0, 0]);
  for (let i = 0; i < n; i++) {
    const z = [1, ...X[i].map((v, j) => (v - mu[j]) / sd[j])];
    for (let a = 0; a < D; a++) {
      for (let b = 0; b < D; b++) A[a][b] += z[a] * z[b];
      B[a][0] += z[a] * Y[i][0];
      B[a][1] += z[a] * Y[i][1];
    }
  }
  for (let a = 1; a < D; a++) A[a][a] += lambda * n; // 常數項不懲罰
  // 高斯消去（部分選主元）
  for (let c = 0; c < D; c++) {
    let p = c;
    for (let r = c + 1; r < D; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    [B[c], B[p]] = [B[p], B[c]];
    const v = A[c][c];
    if (Math.abs(v) < 1e-12) return null;
    for (let r = 0; r < D; r++) {
      if (r === c) continue;
      const k = A[r][c] / v;
      if (!k) continue;
      for (let j = c; j < D; j++) A[r][j] -= k * A[c][j];
      B[r][0] -= k * B[c][0];
      B[r][1] -= k * B[c][1];
    }
  }
  const w = B.map((b, i) => [b[0] / A[i][i], b[1] / A[i][i]]);
  return { mu, sd, w };
}

// 特徵 → 畫面座標（0～1，可以稍微超出）
export function gazePredict(M, f) {
  if (!M || !f || f.length !== M.mu.length) return null;
  let x = M.w[0][0],
    y = M.w[0][1];
  for (let j = 0; j < f.length; j++) {
    const z = (f[j] - M.mu[j]) / M.sd[j];
    x += z * M.w[j + 1][0];
    y += z * M.w[j + 1][1];
  }
  return { x, y };
}

// One-Euro 濾波：移動慢時強力平滑（壓住抖動），移動快時跟得上（掃視到別的目標）
export class OneEuro {
  constructor(minCut = 1.2, beta = 0.6, dCut = 1) {
    this.minCut = minCut;
    this.beta = beta;
    this.dCut = dCut;
    this.x = null;
    this.dx = 0;
  }
  static a(cut, dt) {
    const r = 2 * Math.PI * cut * dt;
    return r / (r + 1);
  }
  reset() {
    this.x = null;
    this.dx = 0;
  }
  filter(v, dt) {
    if (this.x === null || !(dt > 0)) {
      this.x = v;
      return v;
    }
    const d = (v - this.x) / dt;
    this.dx += OneEuro.a(this.dCut, dt) * (d - this.dx);
    const cut = this.minCut + this.beta * Math.abs(this.dx);
    this.x += OneEuro.a(cut, dt) * (v - this.x);
    return this.x;
  }
}

// 頭部延伸視角：頭的轉向（扣掉中心）→ 鏡頭的轉動速度（-1～1）；dead 以內不動、dead＋span 以上全速
export function headRate(off, dead, span) {
  const a = Math.abs(off) - dead;
  if (a <= 0) return 0;
  return Math.sign(off) * Math.min(1, a / span) ** 1.4;
}
