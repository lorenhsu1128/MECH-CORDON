// 立繪的品管量測（docs/portrait-studio-design.md 第 2 期；從 scripts/portrait-qa.py 移植），網頁與命令列共用。
// 圖一律是 { w, h, data }（RGBA 的 Uint8ClampedArray／Uint8Array）：瀏覽器用 canvas 的 getImageData，Node 用 sharp 的 raw。
// 每個影格（眨眼 e1／e2、嘴型 m1～m3）和它的表情底圖比：
//   chg   範圍（眼睛／嘴巴框）裡改了多少的比例（太少＝沒閉眼、沒張嘴）
//   out   範圍外（往外 3 px）改了多少的比例（應該是 0）
//   alien 改過的像素裡「臉上原本沒有的顏色」的比例（綠色愛心、條碼、色塊）
//   side  e2：左右兩半強烈改變的比例（一邊很少＝只閉一隻眼；側臉的姿勢和同一個姿勢的中位數比）
//   iris  眨眼：底圖的虹膜色在這一格還剩多少（e1 的目標約 0.4）
//   resid 嘴型：原本那張嘴的深色線條沒被改到、離新改的地方又超過 5 px 的像素數（只供參考，不算不合格）

export const QA_REASONS = {
  out: '範圍外有改變',
  alien: '外來的顏色（色塊、異物）',
  nochg: '沒有改變（沒閉眼、沒張嘴）',
  oneeye: '只閉一隻眼',
};
// 看圖的檢查清單（docs/portrait-qa-workflow.md 第五節）：網頁標記不合格時的原因、命令列 mark 的 --why
export const QA_CHECKS = {
  ghost: '殘影（兩雙眼疊在一起）／殘線（原本的嘴、眼線）',
  ring: '白圈、補錯顏色（頭髮色、粉紅、灰）',
  half: '半閉不夠閉／閉眼沒閉好／只閉一隻',
  expr: '表情跑掉（眉毛、笑眼、生氣、嘴型和表情不符）',
  iris: '虹膜顏色變了、異色瞳互換',
  glasses: '眼鏡不見或多出來',
  thing: '異物（愛心、條碼、色塊、多的牙）',
  edge: '下巴線、麥克風、手被改到',
  mark: '疤、OK 繃、配件不見、移位或多出來',
  seam: '方塊接縫、亮度不同的補丁',
  other: '其他',
};

const MOUTH_HUES = [0.55, 0.12, 0.15, 0.85, 0.35, 0.4, 0.95, 0.6, 0.62, 0.35, 0.05, 0.08];

// RGB（0～1）→ [色相 0～1、飽和、亮度]（和 portrait-qa.py 的 hsv 一樣：飽和＝(max−min)/max）
function hsv(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn + 1e-6;
  let h;
  if (mx === r) h = ((((g - b) / d) % 6) + 6) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, d / (mx + 1e-6), mx];
}
const hueDist = (a, b) => {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
};
const clampBox = (b, W, H) => {
  const [x, y, w, h] = b.map((v) => Math.round(v));
  return [Math.max(0, x), Math.max(0, y), Math.min(W, x + w), Math.min(H, y + h)];
};

// 臉上（與範圍裡）飽和的顏色的色相：10° 一格的直方圖，佔飽和像素 0.5% 以上的格子（取代 portrait-qa.py 的中位切割色盤）
function faceHues(img, boxes) {
  const bins = new Float64Array(36);
  let n = 0;
  for (const b of boxes) {
    if (!b) continue;
    const [x0, y0, x1, y1] = clampBox(b, img.w, img.h);
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const i = (y * img.w + x) * 4;
        const [h, s, v] = hsv(img.data[i] / 255, img.data[i + 1] / 255, img.data[i + 2] / 255);
        if (s > 0.22 && v > 0.15) {
          bins[Math.floor(h * 36) % 36]++;
          n++;
        }
      }
  }
  const out = [];
  for (let k = 0; k < 36; k++) if (n && bins[k] / n > 0.005) out.push((k + 0.5) / 36);
  return out;
}

// 方形的膨脹（迭代 k 次＝切比雪夫距離 k 以內）：兩次一維的最大值濾波
function dilate(m, w, h, k) {
  const t = new Uint8Array(m.length);
  const o = new Uint8Array(m.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dx = -k; dx <= k && !v; dx++) {
        const xx = x + dx;
        if (xx >= 0 && xx < w && m[y * w + xx]) v = 1;
      }
      t[y * w + x] = v;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -k; dy <= k && !v; dy++) {
        const yy = y + dy;
        if (yy >= 0 && yy < h && t[yy * w + x]) v = 1;
      }
      o[y * w + x] = v;
    }
  return o;
}
// 連通塊（8 連通），回傳每個像素的編號（0＝背景）
function label(m, w, h) {
  const lab = new Int32Array(m.length);
  let n = 0;
  const st = [];
  for (let i = 0; i < m.length; i++) {
    if (!m[i] || lab[i]) continue;
    lab[i] = ++n;
    st.push(i);
    while (st.length) {
      const j = st.pop();
      const x = j % w;
      const y = (j / w) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const q = yy * w + xx;
          if (m[q] && !lab[q]) {
            lab[q] = n;
            st.push(q);
          }
        }
    }
  }
  return lab;
}

// 一格的量測。base／cand：同樣大小的整張圖；inner：眼睛框或嘴框；fid：e1、e2、m1…；
// o.face：臉框（取臉上的顏色）、o.mbox：原本的小嘴框（找原本那張嘴的殘線）
export function frameMetrics(base, cand, inner, fid, o = {}) {
  const W = base.w;
  const H = base.h;
  if (cand.w !== W || cand.h !== H) return { err: `大小不同（${cand.w}×${cand.h}，底圖 ${W}×${H}）` };
  const [x0, y0, x1, y1] = clampBox(inner, W, H);
  const B = base.data;
  const C = cand.data;
  const diff = (i) =>
    Math.max(Math.abs(C[i] - B[i]), Math.abs(C[i + 1] - B[i + 1]), Math.abs(C[i + 2] - B[i + 2])) / 255;
  // 範圍外：整張圖裡（範圍往外 3 px 以外）改變超過 0.07 的比例
  let outN = 0;
  let outT = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (x >= x0 - 3 && x < x1 + 3 && y >= y0 - 3 && y < y1 + 3) continue;
      outT++;
      if (diff((y * W + x) * 4) > 0.07) outN++;
    }
  const r = { out: outT ? outN / outT : 0 };
  const iw = x1 - x0;
  const ih = y1 - y0;
  if (iw <= 0 || ih <= 0) return { ...r, chg: 0, alien: 0, err: '範圍是空的' };
  const ci = new Uint8Array(iw * ih); // 範圍裡改了的像素
  const strong = new Uint8Array(iw * ih); // 強烈的改變（線條、虹膜）
  let nc = 0;
  for (let y = 0; y < ih; y++)
    for (let x = 0; x < iw; x++) {
      const d = diff(((y + y0) * W + x + x0) * 4);
      if (d > 0.07) {
        ci[y * iw + x] = 1;
        nc++;
      }
      if (d > 0.22) strong[y * iw + x] = 1;
    }
  r.chg = nc / (iw * ih);
  // 外來的顏色
  const hues = faceHues(base, [o.face, inner]);
  if (fid[0] === 'm')
    for (let k = 0; k < MOUTH_HUES.length; k += 3) hues.push(hsv(...MOUTH_HUES.slice(k, k + 3))[0]);
  let al = 0;
  for (let y = 0; y < ih; y++)
    for (let x = 0; x < iw; x++) {
      if (!ci[y * iw + x]) continue;
      const i = ((y + y0) * W + x + x0) * 4;
      const [h, s, v] = hsv(C[i] / 255, C[i + 1] / 255, C[i + 2] / 255);
      if (s > 0.35 && v > 0.2 && hues.every((q) => hueDist(h, q) > 30 / 360 + 1 / 72)) al++;
    }
  r.alien = nc ? al / nc : 0;
  // 殘線：原本那張嘴（和原本的小嘴框相交的深色線條）沒被改到、離改過的地方超過 5 px
  r.resid = 0;
  if (fid[0] === 'm' && o.mbox) {
    const L = new Float32Array(iw * ih);
    for (let y = 0; y < ih; y++)
      for (let x = 0; x < iw; x++) {
        const i = ((y + y0) * W + x + x0) * 4;
        L[y * iw + x] = (0.299 * B[i] + 0.587 * B[i + 1] + 0.114 * B[i + 2]) / 255;
      }
    const sorted = Float32Array.from(L).sort();
    const med = sorted[sorted.length >> 1];
    const line = new Uint8Array(iw * ih);
    for (let k = 0; k < L.length; k++) line[k] = L[k] < med - 0.18 ? 1 : 0;
    const lab = label(dilate(line, iw, ih, 1), iw, ih);
    const [mx, my, mw, mh] = o.mbox.map((v) => Math.round(v));
    const hit = new Set();
    for (let y = Math.max(0, my - y0); y < Math.min(ih, my - y0 + mh); y++)
      for (let x = Math.max(0, mx - x0); x < Math.min(iw, mx - x0 + mw); x++)
        if (lab[y * iw + x]) hit.add(lab[y * iw + x]);
    const near = dilate(ci, iw, ih, 5);
    for (let k = 0; k < L.length; k++) if (line[k] && hit.has(lab[k]) && !ci[k] && !near[k]) r.resid++;
  }
  if (fid[0] === 'e') {
    const mid = iw >> 1;
    let a = 0;
    let b = 0;
    for (let y = 0; y < ih; y++)
      for (let x = 0; x < iw; x++) if (strong[y * iw + x]) x < mid ? (a += 1) : (b += 1);
    a /= Math.max(1, mid * ih);
    b /= Math.max(1, (iw - mid) * ih);
    r.side = Math.min(a, b) / Math.max(1e-6, Math.max(a, b));
    // 虹膜：底圖裡被大幅改掉而且飽和的像素的色相中位數，閉眼之後框裡還剩多少那個顏色
    const hs = [];
    for (let y = 0; y < ih; y++)
      for (let x = 0; x < iw; x++) {
        if (!strong[y * iw + x]) continue;
        const i = ((y + y0) * W + x + x0) * 4;
        const [h, s, v] = hsv(B[i] / 255, B[i + 1] / 255, B[i + 2] / 255);
        if (s > 0.3 && v > 0.25) hs.push(h);
      }
    if (hs.length > 30) {
      hs.sort((p, q) => p - q);
      const ihue = hs[hs.length >> 1];
      const cnt = (D) => {
        let n = 0;
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            const i = (y * W + x) * 4;
            const [h, s, v] = hsv(D[i] / 255, D[i + 1] / 255, D[i + 2] / 255);
            if (hueDist(h, ihue) < 18 / 360 && s > 0.3 && v > 0.2) n++;
          }
        return n;
      };
      r.iris = cnt(C) / Math.max(1, cnt(B));
    }
  }
  return r;
}

// 自動判斷：回傳不合格的原因（空的＝通過）。closed＝這個表情不眨眼
export function qaJudge(fid, r, closed = false) {
  const bad = [];
  if (r.err) return ['nochg'];
  if (r.out > 0.002) bad.push('out');
  if (r.alien > 0.03) bad.push('alien');
  if (fid === 'e2' && !closed) {
    if (r.chg < 0.1) bad.push('nochg');
    if ((r.side ?? 1) < Math.min(0.35, (r.sideMed ?? 1) * 0.5)) bad.push('oneeye');
  }
  if (fid === 'e1' && !closed && r.chg < 0.03) bad.push('nochg');
  if (fid[0] === 'm' && r.chg < 0.015) bad.push('nochg');
  return bad;
}

// 量一個姿勢的全部影格。load(檔名) → Promise<圖>；exprIds：表情 id（含 neutral）；frames：影格 id；noBlink：不眨眼的表情
// 回傳 { '<表情>.<影格>': { chg, out, alien, …, bad: [原因], pick } }
export async function qaPose(pose, load, { exprIds, frames, noBlink = [], onCell } = {}) {
  const B = pose.boxes || {};
  const rep = {};
  if (!pose.master || !B.face) return rep;
  for (const e of exprIds) {
    const bf = e === 'neutral' ? pose.master : pose.ex[e]?.pick;
    if (!bf) continue;
    const base = await load(bf);
    for (const fid of frames) {
      if (fid[0] === 'e' && noBlink.includes(e)) continue;
      const s = pose.ex[`${e}.${fid}`];
      if (!s || s.skip || !s.pick) continue;
      const cand = await load(s.pick);
      const inner = fid[0] === 'e' ? B.eyes : pose.ex[e]?.mb || B.mouth;
      if (!inner) continue;
      const r = frameMetrics(base, cand, inner, fid, { face: B.face, mbox: B.mouth0 || B.mouth });
      r.pick = s.pick;
      rep[`${e}.${fid}`] = r;
      if (onCell) onCell(`${e}.${fid}`, r);
    }
  }
  // 側臉的姿勢有一隻眼睛被頭髮擋住，左右比本來就低：「只閉一隻眼」和同一個姿勢的中位數比
  const sides = Object.entries(rep)
    .filter(([k, v]) => k.endsWith('.e2') && v.side != null)
    .map(([, v]) => v.side)
    .sort((a, b) => a - b);
  const med = sides.length ? sides[sides.length >> 1] : 1;
  for (const [k, v] of Object.entries(rep)) {
    if (k.endsWith('.e2')) v.sideMed = med;
    v.bad = qaJudge(k.split('.')[1], v);
  }
  return rep;
}

// 看圖用的範圍：眼睛框或這個表情的嘴框，往外留一點（左右 15%、上下 25%）
export function viewBox(pose, e, kind) {
  const B = pose.boxes || {};
  const b = kind === 'mouth' ? pose.ex[e]?.mb || B.mouth : B[kind];
  if (!b) return null;
  const [x, y, w, h] = b;
  const px = w * 0.15;
  const py = h * 0.25;
  return [Math.round(x - px), Math.round(y - py), Math.round(w + px * 2), Math.round(h + py * 2)];
}
// 一格的品管狀態：ok（看過、合格）／ng（看過、不合格）／auto（量測抓到、還沒看）／''（還沒看）
// 選定的圖換過之後，之前的標記就不算（qa.pick 和現在的 pick 不同）
export function qaState(slot) {
  if (!slot || !slot.pick) return '';
  if (slot.qa && slot.qa.pick === slot.pick) return slot.qa.st;
  if (slot.qm && slot.qm.pick === slot.pick && slot.qm.bad && slot.qm.bad.length) return 'auto';
  return '';
}

// 這個表情自己的嘴框（從 scripts/portrait-mouthbox.py 移植）：表情和主圖不一樣、而且和原本的小嘴框相連的範圍（眼睛以下），
// 外框＋8 px，再和姿勢的嘴巴框合併；大笑、得意這類大嘴才放得下。回傳 null＝和姿勢的嘴巴框一樣
export function exprMouthBox(master, pick, B) {
  const W = master.w;
  const H = master.h;
  const [fx, fy, fw, fh] = B.face;
  const ey = B.eyes ? B.eyes[1] + B.eyes[3] + 2 : fy + fh * 0.5;
  const m0 = B.mouth0 || B.mouth;
  const x0 = Math.max(0, Math.floor(fx - fw * 0.1));
  const x1 = Math.min(W, Math.floor(fx + fw * 1.1));
  const y0 = Math.max(0, Math.floor(ey));
  const y1 = Math.min(H, Math.floor(fy + fh * 1.15));
  const rw = x1 - x0;
  const rh = y1 - y0;
  if (rw <= 0 || rh <= 0) return null;
  const d = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++)
    for (let x = 0; x < rw; x++) {
      const i = ((y + y0) * W + x + x0) * 4;
      const v = Math.max(
        Math.abs(pick.data[i] - master.data[i]),
        Math.abs(pick.data[i + 1] - master.data[i + 1]),
        Math.abs(pick.data[i + 2] - master.data[i + 2]),
      );
      if (v > 0.08 * 255) d[y * rw + x] = 1;
    }
  const lab = label(dilate(d, rw, rh, 3), rw, rh);
  const [mx, my, mw, mh] = m0.map((v) => Math.round(v));
  const hit = new Set();
  for (let y = Math.max(0, my - 10 - y0); y < Math.min(rh, my + mh + 10 - y0); y++)
    for (let x = Math.max(0, mx - 10 - x0); x < Math.min(rw, mx + mw + 10 - x0); x++)
      if (lab[y * rw + x]) hit.add(lab[y * rw + x]);
  if (!hit.size) return null;
  let ax0 = Infinity;
  let ax1 = -Infinity;
  let ay0 = Infinity;
  let ay1 = -Infinity;
  for (let y = 0; y < rh; y++)
    for (let x = 0; x < rw; x++)
      if (d[y * rw + x] && hit.has(lab[y * rw + x])) {
        ax0 = Math.min(ax0, x + x0);
        ax1 = Math.max(ax1, x + x0);
        ay0 = Math.min(ay0, y + y0);
        ay1 = Math.max(ay1, y + y0);
      }
  if (ax0 === Infinity) return null;
  ax0 -= 8;
  ax1 += 8;
  // 太大（整個下巴的陰影都變了）就只取到臉寬的 0.8
  if (ax1 - ax0 > fw * 0.8) {
    const c = mx + mw / 2;
    ax0 = c - fw * 0.4;
    ax1 = c + fw * 0.4;
  }
  const bx = B.mouth;
  const bx0 = Math.max(0, Math.min(bx[0], ax0));
  const by0 = Math.max(Math.min(bx[1], ay0 - 8), ey);
  const bx1 = Math.min(W, Math.max(bx[0] + bx[2], ax1));
  const by1 = Math.min(H, Math.max(bx[1] + bx[3], ay1 + 8));
  const r = [Math.round(bx0), Math.round(by0), Math.round(bx1 - bx0), Math.round(by1 - by0)];
  return r.every((v, i) => v === Math.round(bx[i])) ? null : r;
}
