// ============================================================
//  程式合成的音效（docs/audio-design.md）：超低頻的重擊、子彈掠過、跳彈、彈殼、伺服馬達、液壓、QB 的吸氣與收尾、
//  雷射、EMP、空扳機、裝填、BREAK 的重音。全部是純函式：輸入取樣率與亂數，回傳 Float32Array；
//  SFX.init 時算一次放進 SFX.buf（鍵名以 ~ 開頭），之後和一般樣本一樣經過 play()（發聲上限、3D、轉送都相同）。
// ============================================================

// 一階的狀態變數濾波器（帶通／低通／高通，頻率可以每個取樣改）
function svf() {
  let lp = 0,
    bp = 0;
  return (x, f, q, sr) => {
    const k = 2 * Math.sin((Math.PI * Math.min(f, sr * 0.45)) / sr);
    const hp = x - lp - q * bp;
    bp += k * hp;
    lp += k * bp;
    return { lp, bp, hp };
  };
}
const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));

// 超低頻的重擊：正弦往下滑（f0 → f1），快速衰減；開頭一點點雜訊當起音
function thump(sr, rnd, f0, f1, dur) {
  const n = Math.floor(sr * dur),
    y = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      u = t / dur;
    const f = f1 + (f0 - f1) * Math.exp(-u * 5);
    ph += (2 * Math.PI * f) / sr;
    const click = t < 0.006 ? (rnd() * 2 - 1) * (1 - t / 0.006) * 0.35 : 0;
    y[i] = (Math.sin(ph) * 0.9 + Math.sin(ph * 2) * 0.12) * env(t, 0.004, dur * 0.32) + click;
  }
  return y;
}

// 子彈掠過：帶通雜訊，中心頻率與音量照「接近 → 遠離」掃過（k＝實彈 0／能量 1）
function whiz(sr, rnd, k, dur) {
  const n = Math.floor(sr * dur),
    y = new Float32Array(n),
    F = svf(),
    F2 = svf();
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const a = Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.25)), 2) * (u < 0.8 ? 1 : (1 - u) / 0.2);
    const f = 3200 - 2300 * u; // 都卜勒：往下掃
    const x = rnd() * 2 - 1;
    let s = F(x, f, 0.25, sr).bp * 1.6;
    if (k) {
      ph += (2 * Math.PI * (330 - 160 * u)) / sr;
      s = s * 0.45 + (Math.sin(ph) + 0.4 * Math.sin(ph * 3.01)) * 0.5;
      s = F2(s, 2400, 0.6, sr).lp;
    }
    y[i] = s * a;
  }
  return y;
}

// 跳彈：高頻正弦往下掃＋泛音，開頭一個短的雜訊
function ricochet(sr, rnd, f0, dur) {
  const n = Math.floor(sr * dur),
    y = new Float32Array(n);
  let p1 = 0,
    p2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      u = t / dur;
    const f = f0 * (1 - 0.55 * u) * (1 + 0.04 * Math.sin(t * 90));
    p1 += (2 * Math.PI * f) / sr;
    p2 += (2 * Math.PI * f * 1.51) / sr;
    const tone = (Math.sin(p1) + 0.35 * Math.sin(p2)) * env(t, 0.003, dur * 0.4);
    const hit = t < 0.012 ? (rnd() * 2 - 1) * (1 - t / 0.012) : 0;
    y[i] = tone * 0.6 + hit * 0.8;
  }
  return y;
}

// 金屬的模態合成（彈殼落地、金屬的叮）：幾個不成倍數的衰減正弦；bounces＝彈跳次數
function modal(sr, rnd, f0, decay, bounces) {
  const R = [1, 2.76, 5.4, 8.93],
    G = [1, 0.55, 0.3, 0.14];
  const dur = decay * 3 + bounces * 0.12,
    n = Math.floor(sr * dur),
    y = new Float32Array(n);
  for (let b = 0; b <= bounces; b++) {
    const t0 = b === 0 ? 0 : 0.07 + b * 0.075 + rnd() * 0.03,
      amp = Math.pow(0.45, b),
      fj = 1 + (rnd() - 0.5) * 0.04;
    const i0 = Math.floor(t0 * sr);
    for (let i = i0; i < n; i++) {
      const t = (i - i0) / sr;
      let s = 0;
      for (let m = 0; m < R.length; m++)
        s += G[m] * Math.sin(2 * Math.PI * f0 * fj * R[m] * t) * Math.exp(-t / (decay / (1 + m * 0.6)));
      const tick = t < 0.002 ? (rnd() * 2 - 1) * 0.5 : 0;
      y[i] += (s * 0.35 + tick) * amp;
    }
  }
  return y;
}

// 伺服馬達：鋸齒＋方波經過共振的帶通，音高滑動（up＝往上），尾巴帶一點機構的咔
function servo(sr, rnd, f0, f1, dur) {
  const n = Math.floor(sr * dur),
    y = new Float32Array(n),
    F = svf();
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      u = t / dur;
    const f = f0 + (f1 - f0) * (1 - Math.pow(1 - u, 2)) + 6 * Math.sin(t * 47);
    ph = (ph + f / sr) % 1;
    const raw = (ph * 2 - 1) * 0.6 + (ph < 0.5 ? 0.3 : -0.3) + (rnd() * 2 - 1) * 0.08;
    const a = Math.min(1, t / 0.03) * Math.min(1, (dur - t) / 0.08);
    y[i] = F(raw, 900 + f * 3, 0.35, sr).bp * a * 0.9;
  }
  return y;
}

// 液壓的嘶：雜訊經過低通與高通，起伏的包絡
function hiss(sr, rnd, dur, bright) {
  const n = Math.floor(sr * dur),
    y = new Float32Array(n),
    F = svf(),
    G = svf();
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const x = rnd() * 2 - 1;
    const s = G(F(x, bright, 0.7, sr).lp, 400, 0.7, sr).hp;
    y[i] = s * env(t, 0.02, dur * 0.35) * 1.4;
  }
  return y;
}

// QB 的吸氣（預備）：高通雜訊往上掃＋往上的音
function qbPre(sr, rnd) {
  const dur = 0.09,
    n = Math.floor(sr * dur),
    y = new Float32Array(n),
    F = svf();
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      u = t / dur;
    ph += (2 * Math.PI * (180 + 700 * u * u)) / sr;
    const s = F(rnd() * 2 - 1, 1200 + 5000 * u, 0.5, sr).hp;
    y[i] = (s * 0.7 + Math.sin(ph) * 0.25) * u * u;
  }
  return y;
}

// 推進器的收尾：低通雜訊，濾波往下掃
function jetTail(sr, rnd, dur) {
  const n = Math.floor(sr * dur),
    y = new Float32Array(n),
    F = svf();
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      u = t / dur;
    y[i] = F(rnd() * 2 - 1, 3500 * (1 - u) + 250, 0.6, sr).lp * Math.pow(1 - u, 1.6) * 1.8;
  }
  return y;
}

// 推進器的高頻層（可循環）：帶通雜訊，慢慢起伏；頭尾交叉淡化
function jetLoop(sr, rnd, dur) {
  const n = Math.floor(sr * dur),
    y = new Float32Array(n),
    F = svf(),
    G = svf();
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 2600 + 700 * Math.sin((2 * Math.PI * t) / dur) + 300 * Math.sin((2 * Math.PI * 3 * t) / dur);
    const s = F(rnd() * 2 - 1, f, 0.5, sr).bp + G(rnd() * 2 - 1, 700, 0.8, sr).lp * 0.5;
    y[i] = s;
  }
  const m = Math.floor(sr * 0.08);
  for (let i = 0; i < m; i++) y[n - m + i] = y[n - m + i] * (1 - i / m) + y[i] * (i / m);
  return y.subarray(m);
}

// 雷射的「啾」：鋸齒波快速往下掃＋短雜訊
function zap(sr, rnd, f0, f1, dur) {
  const n = Math.floor(sr * dur),
    y = new Float32Array(n),
    F = svf();
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      u = t / dur;
    const f = f1 + (f0 - f1) * Math.exp(-u * 4);
    ph = (ph + f / sr) % 1;
    const s = (ph * 2 - 1) * 0.7 + Math.sin(ph * Math.PI * 2) * 0.3 + (t < 0.01 ? (rnd() * 2 - 1) * 0.5 : 0);
    y[i] = F(s, f * 4, 0.6, sr).lp * env(t, 0.002, dur * 0.4);
  }
  return y;
}

// EMP：低頻的嗡聲＋電弧的雜訊爆裂
function emp(sr, rnd, dur) {
  const n = Math.floor(sr * dur),
    y = new Float32Array(n),
    F = svf();
  let ph = 0,
    crack = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      u = t / dur;
    ph += (2 * Math.PI * (62 - 20 * u)) / sr;
    if (rnd() < 0.0018) crack = 1;
    crack *= 0.9965;
    const arc = F(rnd() * 2 - 1, 2600, 0.3, sr).bp * crack;
    const hum = (Math.sin(ph) + 0.5 * Math.sin(ph * 2) + 0.25 * Math.sin(ph * 3)) * 0.5;
    y[i] = (hum + arc * 1.5) * env(t, 0.03, dur * 0.45);
  }
  return y;
}

// 空扳機：兩個很短的咔
function click(sr, rnd) {
  const n = Math.floor(sr * 0.12),
    y = new Float32Array(n),
    F = svf();
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const a = (t < 0.004 ? 1 - t / 0.004 : 0) + (t > 0.05 && t < 0.053 ? 0.6 : 0);
    y[i] = F((rnd() * 2 - 1) * a, 3200, 0.2, sr).bp * 2.2;
  }
  return y;
}

// 裝填：拔出（滑動的刮聲）→ 卡上（金屬的咔＋叮）
function reload(sr, rnd, heavy) {
  const dur = heavy ? 0.7 : 0.5,
    n = Math.floor(sr * dur),
    y = new Float32Array(n),
    F = svf();
  const tc = heavy ? 0.42 : 0.3;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const slide =
      t < tc ? F(rnd() * 2 - 1, 1400 + 1800 * (t / tc), 0.4, sr).bp * 0.5 * Math.sin((Math.PI * t) / tc) : 0;
    const tt = t - tc;
    const lock =
      tt >= 0
        ? ((tt < 0.006 ? rnd() * 2 - 1 : 0) +
            Math.sin(2 * Math.PI * (heavy ? 520 : 880) * tt) * 0.35 * Math.exp(-tt / 0.05)) *
          1.1
        : 0;
    y[i] = slide + lock;
  }
  return y;
}

// BREAK 的重音（stinger）：低音的鈍擊＋鋸齒和弦經過下降的低通（銅管的「轟」）
function stinger(sr, rnd, dur, root) {
  const n = Math.floor(sr * dur),
    y = new Float32Array(n),
    F = svf();
  const fr = [root, root * 1.5, root * 2, root * 2.52, root * 3];
  const ph = fr.map(() => rnd());
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      u = t / dur;
    let s = 0;
    for (let k = 0; k < fr.length; k++) {
      ph[k] = (ph[k] + (fr[k] * (1 + 0.003 * Math.sin(t * 5 + k))) / sr) % 1;
      s += (ph[k] * 2 - 1) / (1 + k * 0.4);
    }
    const lp = F(s * 0.4, 300 + 4200 * Math.exp(-u * 4), 0.5, sr).lp;
    const boom = Math.sin(2 * Math.PI * (root * 0.5) * t) * Math.exp(-t / 0.25);
    y[i] = (lp + boom * 0.8) * env(t, 0.008, dur * 0.4);
  }
  return y;
}

// 正規化到峰值 0.9
function norm(y) {
  let p = 0;
  for (let i = 0; i < y.length; i++) p = Math.max(p, Math.abs(y[i]));
  if (p > 0) for (let i = 0; i < y.length; i++) y[i] *= 0.9 / p;
  return y;
}

// 全部的合成音：鍵名 → 產生函式
export const SYNTH = {
  '~thA': (sr, r) => thump(sr, r, 72, 40, 0.22), // 步槍、手槍
  '~thB': (sr, r) => thump(sr, r, 58, 32, 0.38), // 霰彈、重武器、QB
  '~thC': (sr, r) => thump(sr, r, 48, 24, 0.7), // 爆炸、落地、Boss
  '~thD': (sr, r) => thump(sr, r, 95, 50, 0.12), // 腳步、機槍
  '~whizK1': (sr, r) => whiz(sr, r, 0, 0.32),
  '~whizK2': (sr, r) => whiz(sr, r, 0, 0.42),
  '~whizE': (sr, r) => whiz(sr, r, 1, 0.45),
  '~ric1': (sr, r) => ricochet(sr, r, 2900, 0.38),
  '~ric2': (sr, r) => ricochet(sr, r, 2100, 0.5),
  '~ric3': (sr, r) => ricochet(sr, r, 3600, 0.3),
  '~tink1': (sr, r) => modal(sr, r, 780, 0.09, 2), // 機甲尺度的彈殼（比真的低）
  '~tink2': (sr, r) => modal(sr, r, 610, 0.11, 3),
  '~tink3': (sr, r) => modal(sr, r, 430, 0.16, 2), // 大口徑
  '~servoU': (sr, r) => servo(sr, r, 160, 340, 0.32),
  '~servoD': (sr, r) => servo(sr, r, 300, 150, 0.3),
  '~servoS': (sr, r) => servo(sr, r, 220, 260, 0.18),
  '~hiss': (sr, r) => hiss(sr, r, 0.45, 5200),
  '~hissL': (sr, r) => hiss(sr, r, 0.8, 2600),
  '~qbPre': (sr, r) => qbPre(sr, r),
  '~jetTail': (sr, r) => jetTail(sr, r, 0.5),
  '~jetTailL': (sr, r) => jetTail(sr, r, 1.1),
  '~jetLoop': (sr, r) => jetLoop(sr, r, 2.2),
  '~zapA': (sr, r) => zap(sr, r, 1600, 260, 0.16),
  '~zapB': (sr, r) => zap(sr, r, 900, 140, 0.28),
  '~zapC': (sr, r) => zap(sr, r, 2400, 600, 0.09),
  '~emp': (sr, r) => emp(sr, r, 0.9),
  '~empS': (sr, r) => emp(sr, r, 0.45),
  '~click': (sr, r) => click(sr, r),
  '~reload': (sr, r) => reload(sr, r, false),
  '~reloadH': (sr, r) => reload(sr, r, true),
  '~sting': (sr, r) => stinger(sr, r, 1.3, 98),
  '~stingL': (sr, r) => stinger(sr, r, 2.6, 73.4),
};

export function synthAll(sr, rnd) {
  const out = {};
  for (const k in SYNTH) out[k] = norm(SYNTH[k](sr, rnd));
  return out;
}
