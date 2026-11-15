// 過場動畫的文字風格（docs/cinematics.md 的「文字風格」）：絕區零的介面語言＋標題頁 LOGO 的元素。
// 字型三層：FD＝標題與狀聲詞（Dela Gothic One 的子集，缺字由 Noto Sans TC 900 補）、FL＝英數與標籤（Rubik 900 斜體）、
// FB＝對白（Noto Sans TC）；FM＝機器文字（開機、系統日誌、座標）。字型在建置時子集化內嵌（scripts/cine-font.js）。
// 這裡都是純繪製函式（畫在 2D context 上，單位＝目前座標系的像素），game/cine-type.js 與 cine-2d.js 共用。
import MC_DISPLAY from '../assets/fonts/mc-display.woff2';
import MC_LATIN from '../assets/fonts/mc-latin.woff2';

export const FD = '"MC Display", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
export const FL = '"MC Latin", "Rubik", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
export const FB = '"Noto Sans TC", "Microsoft JhengHei", sans-serif';
export const FM = '"Chakra Petch", "Noto Sans TC", ui-monospace, monospace';
// LOGO 與介面的色票（styles.css 的 :root）
export const BC = {
  yel: '#fcc800',
  red: '#f01818',
  red2: '#a80c0c',
  acc: '#cdeb2a',
  cyan: '#3ec3ff',
  org: '#ff9a2e',
  char: '#242424',
  ink: '#0a0a0a',
  white: '#ffffff',
};

let fontP = null;
// 內嵌的字型註冊成 FontFace（第一次播過場時；之後立即完成）
export function loadBrandFonts() {
  if (fontP) return fontP;
  const face = (fam, b64) => {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const f = new FontFace(fam, u.buffer, { weight: '100 900' });
    document.fonts.add(f);
    return f.load();
  };
  fontP = Promise.all([
    face('MC Display', MC_DISPLAY),
    face('MC Latin', MC_LATIN),
    // 補字與對白用的 Noto Sans TC（Google Fonts；連不到時用系統字型）
    document.fonts.load('900 20px "Noto Sans TC"', '噹沉挖').catch(() => {}),
    document.fonts.load('700 20px "Noto Sans TC"', '的').catch(() => {}),
  ]).catch(() => {});
  return fontP;
}

// 固定的亂數（同一個種子每格一樣，墨漬與擦痕不會閃）
const hash = (n) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

// ---------- 字 ----------
// 網點的填色（顏色＋深色的點），依顏色快取
const PAT = new Map();
export function halftone(x, color, dot = 'rgba(0,0,0,0.28)', step = 7) {
  const key = color + '|' + dot + '|' + step;
  let p = PAT.get(key);
  if (!p) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = step;
    const g = cv.getContext('2d');
    g.fillStyle = color;
    g.fillRect(0, 0, step, step);
    g.fillStyle = dot;
    g.beginPath();
    g.arc(step / 2, step / 2, step * 0.2, 0, Math.PI * 2);
    g.fill();
    p = cv;
    PAT.set(key, p);
  }
  return x.createPattern(p, 'repeat');
}

// 文字的設定（字型、對齊、字距）
function setFont(x, o, size) {
  x.font = `${o.weight || 900} ${size}px ${o.font || FD}`;
  x.textAlign = o.align || 'left';
  x.textBaseline = o.base || 'middle';
  x.letterSpacing = (o.ls || 0) + 'px';
}
export function measure(x, text, o = {}) {
  x.save();
  setFont(x, o, o.size || 64);
  const w = x.measureText(text).width;
  x.restore();
  return w;
}

// 貼紙字（LOGO 的做法）：硬陰影 → 白色外圈 → 黑描邊 → 填色。
// o：{ size, font, weight, fill（顏色、漸層或 pattern）, ink, edge, inkW, edgeW, shadow（往右下的距離，0＝沒有）, align, base,
//      ls 字距, rot, skew（水平傾斜，弧度）, halftone（填色疊網點）, scale }
export function sticker(x, text, px, py, o = {}) {
  const size = o.size || 64;
  x.save();
  x.translate(px, py);
  if (o.rot) x.rotate(o.rot);
  if (o.skew) x.transform(1, 0, Math.tan(o.skew), 1, 0, 0);
  if (o.scale && o.scale !== 1) x.scale(o.scale, o.scale);
  setFont(x, o, size);
  x.lineJoin = 'round';
  x.miterLimit = 2;
  const edgeW = o.edgeW ?? size * 0.22,
    inkW = o.inkW ?? size * 0.1,
    sh = o.shadow ?? size * 0.06;
  if (sh) {
    x.fillStyle = x.strokeStyle = o.shadowCol || 'rgba(0,0,0,0.55)';
    x.lineWidth = edgeW || inkW;
    if (x.lineWidth) x.strokeText(text, sh, sh);
    x.fillText(text, sh, sh);
  }
  if (edgeW) {
    x.strokeStyle = o.edge || BC.white;
    x.lineWidth = edgeW;
    x.strokeText(text, 0, 0);
  }
  if (inkW) {
    x.strokeStyle = o.ink || BC.ink;
    x.lineWidth = inkW;
    x.strokeText(text, 0, 0);
  }
  const fill = o.fill || BC.white;
  x.fillStyle = o.halftone && typeof fill === 'string' ? halftone(x, fill) : fill;
  x.fillText(text, 0, 0);
  x.restore();
}

// 一般的描邊字（字幕條、小標籤用）：o 同 sticker，只有黑描邊
export function inked(x, text, px, py, o = {}) {
  sticker(x, text, px, py, { edgeW: 0, shadow: 0, inkW: (o.size || 24) * 0.18, ...o });
}

// ---------- 標籤 ----------
// 斜切的名牌（說話者、類別）：說話者顏色的平行四邊形、黑邊、白外框；回傳 { w, h }。
// o：{ size, bg, fg, font, sub（右邊的小字）, subFont, skew（預設 −12°）, align: 'left'|'center'|'right', edge }
export function slantTag(x, text, px, py, o = {}) {
  const size = o.size || 22;
  const sk = o.skew ?? -0.21;
  x.save();
  x.font = `900 ${size}px ${o.font || FL}`;
  x.letterSpacing = '0px';
  const tw = x.measureText(text).width;
  let sw = 0;
  const subSize = size * 0.5;
  if (o.sub) {
    x.font = `600 ${subSize}px ${o.subFont || FM}`;
    sw = x.measureText(o.sub).width + size * 0.45;
  }
  const padX = size * 0.62,
    padY = size * 0.32;
  const w = tw + sw + padX * 2,
    h = size + padY * 2;
  const ox = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0;
  x.translate(px + ox, py - h / 2);
  const off = Math.tan(-sk) * h; // 上邊往右移
  const quad = () => {
    x.beginPath();
    x.moveTo(off, 0);
    x.lineTo(w + off, 0);
    x.lineTo(w, h);
    x.lineTo(0, h);
    x.closePath();
  };
  quad();
  x.lineJoin = 'miter';
  if (o.edge !== false) {
    x.strokeStyle = BC.white;
    x.lineWidth = size * 0.36;
    x.stroke();
  }
  x.strokeStyle = BC.ink;
  x.lineWidth = size * 0.2;
  x.stroke();
  x.fillStyle = o.bg || BC.acc;
  x.fill();
  x.fillStyle = o.fg || BC.ink;
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  x.font = `900 ${size}px ${o.font || FL}`;
  x.fillText(text, padX + off * 0.5, h / 2 + size * 0.04);
  if (o.sub) {
    x.font = `600 ${subSize}px ${o.subFont || FM}`;
    x.globalAlpha *= 0.85;
    x.fillText(o.sub, padX + off * 0.5 + tw + size * 0.45, h / 2 + size * 0.12);
  }
  x.restore();
  return { w: w + off, h };
}

// 膠囊（黑底的標籤、說明）：回傳 { w, h }。o：{ size, bg, fg, border, bw, font, weight, padX, align, ls }
export function capsule(x, text, px, py, o = {}) {
  const size = o.size || 20;
  x.save();
  x.font = `${o.weight || 900} ${size}px ${o.font || FL}`;
  x.letterSpacing = (o.ls || 0) + 'px';
  const tw = x.measureText(text).width;
  const padX = o.padX ?? size * 0.8;
  const w = tw + padX * 2,
    h = size * 1.6;
  const ox = o.align === 'center' ? -w / 2 : o.align === 'right' ? -w : 0;
  x.translate(px + ox, py - h / 2);
  x.beginPath();
  x.roundRect(0, 0, w, h, h / 2);
  if (o.border !== null) {
    x.strokeStyle = o.border || BC.white;
    x.lineWidth = o.bw ?? Math.max(2, size * 0.16);
    x.stroke();
  }
  x.fillStyle = o.bg || BC.ink;
  x.fill();
  x.fillStyle = o.fg || BC.yel;
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  x.fillText(text, padX, h / 2 + size * 0.05);
  x.restore();
  return { w, h };
}

// ---------- LOGO 的元素 ----------
// 封鎖膠帶：從 (x0, y0) 沿角度 ang 拉長 len 的帶子（y0 是帶子的中線），字重複排；scroll＝字往左流動的距離。
// o：{ h, words, bg, fg, edge（白外框寬，0＝沒有）, size, gap }
export const TAPE_WORDS = ['CAUTION', 'KEEP OUT'];
export function tape(x, x0, y0, len, ang, o = {}) {
  const h = o.h || 44;
  const size = o.size || h * 0.5;
  x.save();
  x.translate(x0, y0);
  x.rotate(ang);
  const e = o.edge ?? 5;
  if (e) {
    x.fillStyle = BC.white;
    x.fillRect(0, -h / 2 - e, len, h + e * 2);
  }
  x.fillStyle = BC.ink;
  x.fillRect(0, -h / 2, len, h);
  x.fillStyle = o.bg || BC.yel;
  const lb = Math.max(2, h * 0.09);
  x.fillRect(0, -h / 2 + lb, len, h - lb * 2);
  x.beginPath();
  x.rect(0, -h / 2 + lb, len, h - lb * 2);
  x.clip();
  x.font = `900 ${size}px ${FL}`;
  x.letterSpacing = size * 0.06 + 'px';
  x.textBaseline = 'middle';
  x.textAlign = 'left';
  x.fillStyle = o.fg || BC.ink;
  const words = o.words || TAPE_WORDS;
  const gap = o.gap ?? size * 1.6;
  const ws = words.map((w) => x.measureText(w).width + gap);
  const period = ws.reduce((a, b) => a + b, 0);
  let px = -(((o.scroll || 0) % period) + period) % period;
  for (let i = 0; px < len; i++) {
    const k = i % words.length;
    x.fillText(words[k], px + gap * 0.5, size * 0.04);
    px += ws[k];
  }
  x.restore();
}

// 警戒斜紋的條（倒數條、分隔）：o：{ c1, c2, stripe, off（流動）, edge }
export function hazard(x, px, py, w, h, o = {}) {
  x.save();
  x.beginPath();
  x.rect(px, py, w, h);
  x.clip();
  x.fillStyle = o.c2 || BC.ink;
  x.fillRect(px, py, w, h);
  x.fillStyle = o.c1 || BC.yel;
  const s = o.stripe || Math.max(6, h * 0.7);
  const off = ((o.off || 0) % (s * 2)) - s * 2;
  for (let u = px + off - h; u < px + w + h; u += s * 2) {
    x.beginPath();
    x.moveTo(u, py + h);
    x.lineTo(u + s, py + h);
    x.lineTo(u + s + h, py);
    x.lineTo(u + h, py);
    x.closePath();
    x.fill();
  }
  x.restore();
  if (o.edge) {
    x.save();
    x.strokeStyle = BC.ink;
    x.lineWidth = o.edge;
    x.strokeRect(px, py, w, h);
    x.restore();
  }
}

// 齒輪（LOGO 四角的線稿齒輪）：o：{ teeth, col, lw, fill }
export function gear(x, cx, cy, r, rot = 0, o = {}) {
  const n = o.teeth || 10;
  x.save();
  x.translate(cx, cy);
  x.rotate(rot);
  x.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2,
      d = (Math.PI * 2) / n;
    const pts = [
      [a - d * 0.5, r],
      [a - d * 0.22, r],
      [a - d * 0.16, r * 1.24],
      [a + d * 0.16, r * 1.24],
      [a + d * 0.22, r],
    ];
    pts.forEach(([aa, rr], j) => x[i || j ? 'lineTo' : 'moveTo'](Math.cos(aa) * rr, Math.sin(aa) * rr));
  }
  x.closePath();
  x.moveTo(r * 0.44, 0);
  x.arc(0, 0, r * 0.44, 0, Math.PI * 2, true);
  x.lineJoin = 'round';
  if (o.fill) {
    x.fillStyle = o.fill;
    x.fill('evenodd');
  }
  x.strokeStyle = o.col || BC.white;
  x.lineWidth = o.lw || r * 0.1;
  x.stroke();
  x.restore();
}

// 準星的「+」（中間斷開）
export function cross(x, cx, cy, s = 18, o = {}) {
  x.save();
  x.strokeStyle = o.col || BC.white;
  x.lineWidth = o.lw || Math.max(2, s * 0.2);
  x.lineCap = 'butt';
  x.beginPath();
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    x.moveTo(cx + dx * s * 0.35, cy + dy * s * 0.35);
    x.lineTo(cx + dx * s, cy + dy * s);
  }
  x.stroke();
  x.restore();
}

// 警告三角（黑底、白邊、黃色驚嘆號）
export function warnTri(x, cx, cy, s = 30) {
  x.save();
  x.beginPath();
  x.moveTo(cx, cy - s);
  x.lineTo(cx + s * 1.1, cy + s * 0.8);
  x.lineTo(cx - s * 1.1, cy + s * 0.8);
  x.closePath();
  x.lineJoin = 'round';
  x.strokeStyle = BC.white;
  x.lineWidth = s * 0.3;
  x.stroke();
  x.fillStyle = BC.ink;
  x.fill();
  x.fillStyle = BC.yel;
  x.font = `900 ${s * 1.05}px ${FL}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.letterSpacing = '0px';
  x.fillText('!', cx, cy + s * 0.2);
  x.restore();
}

// 墨漬：中心一團＋噴濺的小點（seed 固定形狀）；k＝噴開的進度 0～1
export function splat(x, cx, cy, s, seed = 1, o = {}) {
  const k = o.k ?? 1;
  x.save();
  x.fillStyle = o.col || BC.ink;
  x.beginPath();
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = s * (0.8 + hash(seed * 7 + i) * 0.35) * (0.4 + 0.6 * k);
    x[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  x.fill();
  for (let i = 0; i < 16; i++) {
    const a = hash(seed * 13 + i) * Math.PI * 2;
    const d = s * (1.1 + hash(seed * 17 + i) * 1.8) * k;
    const r = s * (0.06 + hash(seed * 19 + i) * 0.26);
    x.beginPath();
    x.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, 0, Math.PI * 2);
    x.fill();
  }
  x.restore();
}

// 橡皮章（結語的英文、評價）：外框＋字，邊緣有缺口
export function stamp(x, text, px, py, o = {}) {
  const size = o.size || 26;
  const col = o.col || BC.red;
  x.save();
  x.translate(px, py);
  x.rotate(o.rot ?? -0.12);
  x.font = `900 ${size}px ${FL}`;
  x.letterSpacing = size * 0.12 + 'px';
  const w = x.measureText(text).width + size * 1.2,
    h = size * 1.7;
  x.strokeStyle = x.fillStyle = col;
  x.lineWidth = size * 0.14;
  x.strokeRect(-w / 2, -h / 2, w, h);
  x.lineWidth = size * 0.05;
  x.strokeRect(-w / 2 + size * 0.22, -h / 2 + size * 0.22, w - size * 0.44, h - size * 0.44);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(text, size * 0.06, size * 0.06);
  // 缺口（墨沒沾到的地方）
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 12; i++) {
    x.fillStyle = `rgba(0,0,0,${0.5 + hash(i + (o.seed || 0)) * 0.5})`;
    x.fillRect(
      (hash(i * 3 + 1) - 0.5) * w,
      (hash(i * 3 + 2) - 0.5) * h,
      size * (0.2 + hash(i * 3 + 3) * 1.2),
      size * 0.08,
    );
  }
  x.restore();
}

// 網點的區塊（章名卡的斜切色塊）：多邊形 pts 填色＋網點
export function dotBlock(x, pts, color, o = {}) {
  x.save();
  x.beginPath();
  pts.forEach(([px, py], i) => x[i ? 'lineTo' : 'moveTo'](px, py));
  x.closePath();
  x.fillStyle = halftone(x, color, o.dot || 'rgba(0,0,0,0.3)', o.step || 8);
  x.fill();
  x.restore();
}
