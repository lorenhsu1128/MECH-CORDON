// 過場 2D 舞台的程式插畫（game/cine-2d.js 的 art 元素與背景；docs/cine-redesign-design.md 第 1 期）。
// 第 2 期的場景插畫（角色產生器產生的圖）還沒有之前，用這裡的幾種程式畫：純函式 draw(x, w, h, t, o)，畫在 (0,0)～(w,h)。
// t＝這一鏡的秒數（窗外的燈閃、雲飄），o＝劇本給的參數。所有亂數用固定的種子（每格畫出來一樣）。

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// 網點（漫畫的網點紙）：疊在格子上，mode multiply
const DOT = {};
export function dotPattern(x, size = 9, a = 0.5) {
  const k = size + '|' + a;
  if (!DOT[k]) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, size, size);
    g.fillStyle = `rgba(0,0,0,${a})`;
    g.beginPath();
    g.arc(size / 2, size / 2, size * 0.28, 0, Math.PI * 2);
    g.fill();
    DOT[k] = c;
  }
  return x.createPattern(DOT[k], 'repeat');
}

// 夜裡的辦公室（卡斯特隆）：大片窗戶、窗外礦場的燈（散景）、窗框、牆
function office(x, w, h, t, o) {
  const R = rng(o.seed || 7);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, o.top || '#1a1410');
  g.addColorStop(1, o.bot || '#0c0806');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  // 窗：佔上面 70%
  const wx = w * 0.06,
    wy = h * 0.06,
    ww = w * 0.88,
    wh = h * 0.62;
  const sky = x.createLinearGradient(0, wy, 0, wy + wh);
  sky.addColorStop(0, '#0a1020');
  sky.addColorStop(0.7, '#2a1a14');
  sky.addColorStop(1, '#5a2a10');
  x.fillStyle = sky;
  x.fillRect(wx, wy, ww, wh);
  // 遠處的礦場：剪影的山與井架
  x.fillStyle = '#120c0a';
  x.beginPath();
  x.moveTo(wx, wy + wh);
  for (let i = 0; i <= 12; i++) x.lineTo(wx + (ww * i) / 12, wy + wh * (0.72 + 0.12 * Math.sin(i * 1.7 + 1)));
  x.lineTo(wx + ww, wy + wh);
  x.fill();
  for (let i = 0; i < 3; i++) {
    const fx = wx + ww * (0.2 + i * 0.28),
      fy = wy + wh * 0.62;
    x.strokeStyle = '#120c0a';
    x.lineWidth = w * 0.004;
    x.beginPath();
    x.moveTo(fx - w * 0.02, wy + wh * 0.8);
    x.lineTo(fx, fy);
    x.lineTo(fx + w * 0.02, wy + wh * 0.8);
    x.stroke();
  }
  // 散景的燈：橘色、少數白色，慢慢閃
  x.save();
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < (o.n || 46); i++) {
    const lx = wx + R() * ww,
      ly = wy + wh * (0.55 + R() * 0.4),
      r = w * (0.006 + R() * 0.018);
    const tw = 0.55 + 0.45 * Math.sin(t * (0.6 + R()) + i);
    const c = R() < 0.8 ? '255,150,60' : '230,230,255';
    const gg = x.createRadialGradient(lx, ly, 0, lx, ly, r);
    gg.addColorStop(0, `rgba(${c},${0.55 * tw})`);
    gg.addColorStop(1, `rgba(${c},0)`);
    x.fillStyle = gg;
    x.fillRect(lx - r, ly - r, r * 2, r * 2);
  }
  x.restore();
  // 窗框（直的與橫的）
  x.fillStyle = '#060404';
  for (let i = 0; i <= 4; i++) x.fillRect(wx + (ww * i) / 4 - w * 0.006, wy, w * 0.012, wh);
  x.fillRect(wx, wy + wh * 0.42, ww, h * 0.012);
  x.fillRect(wx - w * 0.01, wy - h * 0.012, ww + w * 0.02, h * 0.02);
  x.fillRect(wx - w * 0.01, wy + wh - h * 0.006, ww + w * 0.02, h * 0.03);
  // 室內的暖光從下面照上來
  const lg = x.createRadialGradient(w * 0.5, h * 1.1, 0, w * 0.5, h * 1.1, h * 0.9);
  lg.addColorStop(0, 'rgba(216,144,58,0.35)');
  lg.addColorStop(1, 'rgba(216,144,58,0)');
  x.fillStyle = lg;
  x.fillRect(0, 0, w, h);
}

// 辦公桌的一角：桌面、檯燈的光、一張舊的礦工合照（相框）
function desk(x, w, h, t, o) {
  office(x, w, h, t, { ...o, n: 24 });
  // 桌面
  x.fillStyle = '#20140c';
  x.beginPath();
  x.moveTo(0, h * 0.78);
  x.lineTo(w, h * 0.72);
  x.lineTo(w, h);
  x.lineTo(0, h);
  x.fill();
  x.fillStyle = 'rgba(255,170,90,0.12)';
  x.fillRect(0, h * 0.75, w, h * 0.012);
  // 相框（右下，微微傾斜）
  x.save();
  x.translate(w * (o.px || 0.78), h * 0.8);
  x.rotate(-0.08);
  const fw = w * 0.14,
    fh = fw * 0.75;
  x.fillStyle = '#3a2614';
  x.fillRect(-fw / 2 - 6, -fh - 6, fw + 12, fh + 12);
  const pg = x.createLinearGradient(0, -fh, 0, 0);
  pg.addColorStop(0, '#b89a70');
  pg.addColorStop(1, '#6a5038');
  x.fillStyle = pg;
  x.fillRect(-fw / 2, -fh, fw, fh);
  // 照片裡的五個礦工的剪影（戴頭盔）
  x.fillStyle = 'rgba(40,24,12,0.8)';
  for (let i = 0; i < 5; i++) {
    const px = -fw / 2 + fw * (0.14 + i * 0.18),
      ph = fh * (0.5 + ((i * 37) % 5) * 0.03);
    x.fillRect(px - fw * 0.05, -ph * 0.8, fw * 0.1, ph * 0.8);
    x.beginPath();
    x.arc(px, -ph * 0.85, fw * 0.045, 0, Math.PI * 2);
    x.fill();
    x.fillRect(px - fw * 0.06, -ph * 0.9, fw * 0.12, fw * 0.02);
  }
  x.restore();
  // 檯燈的光
  const lg = x.createRadialGradient(w * 0.82, h * 0.6, 0, w * 0.82, h * 0.6, w * 0.4);
  lg.addColorStop(0, 'rgba(255,190,110,0.28)');
  lg.addColorStop(1, 'rgba(255,190,110,0)');
  x.save();
  x.globalCompositeOperation = 'lighter';
  x.fillStyle = lg;
  x.fillRect(0, 0, w, h);
  x.restore();
}

// 駕駛艙（ECHO 的全像插入）：暗色的座艙框、儀表的光點、前方的擋風窗留空（透出 3D）
function cockpit(x, w, h, t, o) {
  x.save();
  x.fillStyle = '#05080c';
  x.beginPath();
  x.rect(0, 0, w, h);
  // 擋風窗：梯形挖空
  x.moveTo(w * 0.16, h * 0.08);
  x.lineTo(w * 0.12, h * 0.6);
  x.lineTo(w * 0.88, h * 0.6);
  x.lineTo(w * 0.84, h * 0.08);
  x.closePath();
  x.fill('evenodd');
  const R = rng(o.seed || 3);
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    const lx = w * (0.08 + R() * 0.84),
      ly = h * (0.68 + R() * 0.26);
    const on = Math.sin(t * (1 + R() * 3) + i) > -0.3;
    x.fillStyle = on ? (R() < 0.7 ? 'rgba(120,220,255,0.7)' : 'rgba(255,140,60,0.7)') : 'rgba(60,90,110,0.3)';
    x.fillRect(lx, ly, w * (0.006 + R() * 0.03), h * 0.008);
  }
  x.restore();
}

// 放射的集中線（漫畫）：中心 (cx, cy)，o.n 條，留空的半徑 o.r
function focus(x, w, h, t, o) {
  const R = rng((o.seed || 11) + Math.floor(t * 12));
  const cx = w * (o.cx ?? 0.5),
    cy = h * (o.cy ?? 0.5);
  const r0 = Math.min(w, h) * (o.r ?? 0.32),
    r1 = Math.hypot(w, h);
  x.save();
  x.fillStyle = o.color || '#000';
  for (let i = 0; i < (o.n || 90); i++) {
    const a = R() * Math.PI * 2,
      da = 0.004 + R() * 0.012,
      rr = r0 * (1 + R() * 0.5);
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    x.lineTo(cx + Math.cos(a - da) * r1, cy + Math.sin(a - da) * r1);
    x.lineTo(cx + Math.cos(a + da) * r1, cy + Math.sin(a + da) * r1);
    x.fill();
  }
  x.restore();
}

// 橫向的速度線
function speed(x, w, h, t, o) {
  const R = rng((o.seed || 5) + Math.floor(t * 15));
  x.save();
  x.fillStyle = o.color || 'rgba(255,255,255,0.8)';
  for (let i = 0; i < (o.n || 40); i++) {
    const y = R() * h,
      l = w * (0.2 + R() * 0.6),
      x0 = R() * w - l * 0.5;
    x.fillRect(x0, y, l, Math.max(1, h * 0.002 * (1 + R() * 2)));
  }
  x.restore();
}

// 瞄準鏡（動畫的主觀鏡頭）：外圈暗角、圓框、十字線與刻度、中央的小框；o.color、o.r（半徑比例）、o.lock 0～1（鎖定時框變紅並縮小）
function reticle(x, w, h, t, o) {
  const cx = w / 2,
    cy = h / 2,
    R = Math.min(w, h) * (o.r || 0.42);
  const col = o.color || 'rgba(255,90,60,0.9)';
  x.save();
  // 圓框外面塗黑（瞄準鏡的視野）
  x.fillStyle = 'rgba(0,0,0,0.88)';
  x.beginPath();
  x.rect(-w, -h, w * 3, h * 3);
  x.arc(cx, cy, R, 0, Math.PI * 2, true);
  x.fill('evenodd');
  x.strokeStyle = col;
  x.lineWidth = 3;
  x.beginPath();
  x.arc(cx, cy, R, 0, Math.PI * 2);
  x.stroke();
  x.lineWidth = 2;
  x.beginPath();
  x.moveTo(cx - R, cy);
  x.lineTo(cx - R * 0.12, cy);
  x.moveTo(cx + R * 0.12, cy);
  x.lineTo(cx + R, cy);
  x.moveTo(cx, cy - R);
  x.lineTo(cx, cy - R * 0.12);
  x.moveTo(cx, cy + R * 0.12);
  x.lineTo(cx, cy + R);
  x.stroke();
  for (let i = -8; i <= 8; i++) {
    if (!i) continue;
    const L = i % 4 ? 8 : 18;
    x.beginPath();
    x.moveTo(cx + i * R * 0.1, cy - L / 2);
    x.lineTo(cx + i * R * 0.1, cy + L / 2);
    x.moveTo(cx - L / 2, cy + i * R * 0.1);
    x.lineTo(cx + L / 2, cy + i * R * 0.1);
    x.stroke();
  }
  const k = o.lock || 0,
    b = R * (0.22 - 0.1 * k);
  x.strokeStyle = k > 0.5 && Math.floor(t * 8) % 2 ? '#ffffff' : col;
  x.lineWidth = 3;
  x.strokeRect(cx - b, cy - b, b * 2, b * 2);
  x.restore();
}

export const CINE_ART = { office, desk, cockpit, focus, speed, reticle };

// 畫一張程式插畫到 (0,0)～(w,h)；沒有這個名字＝畫一塊灰色（劇本寫錯時看得出來）
export function drawArt(x, name, w, h, t, o = {}) {
  const f = CINE_ART[name];
  if (f) f(x, w, h, t, o);
  else {
    x.fillStyle = '#444';
    x.fillRect(0, 0, w, h);
  }
}
