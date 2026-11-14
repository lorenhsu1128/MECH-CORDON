// Game：過場的 2D 舞台（docs/cine-redesign-design.md 第 1 期；格式見 docs/cinematics.md 的「2D 舞台」）。
// 鏡頭的 st＝{ bg, pg, els }：畫在 #cine2d（3D 畫面之上、淡入淡出的黑幕之下），座標是 1600×900 的舞台（cover 對齊畫面）。
//   - 分格 panel：多邊形的格子（白邊＋黑線），落下／蓋章／滑入，裡面放顏色、程式插畫、即時的 3D 畫面（live：
//     渲染器的畫布直接畫進格子，snap 的時間定格）、子元素；tone＝單色、dots＝網點、flt＝濾鏡（反白線稿等）
//   - 立繪演員 actor：角色產生器的立繪（分層動畫、眨眼、對口型），照時間軸換姿勢（保持＋兩格模糊的過渡格，
//     到位的方式照角色個性表 data/cine/persona.js）、表情、動作、位置；holo＝全像（ECHO 的駕駛艙插入）
//   - 氣泡：字幕的說話者在舞台上時，字幕改成他旁邊的氣泡（語音、字幕語言、對口型照舊）；bubble 元素＝沒有語音的氣泡
//   - text（狀聲詞、大字）、block（PV 的色塊）、art（程式插畫）、lines（集中線、速度線）
// 每一格的畫面只由「鏡頭的時間」決定（暫停、跳時間一致）；立繪自己的眨眼與呼吸用 dt。
import { clamp, lerp } from '../core/math.js';
import { PERSONA, PERSONA_DEF } from '../data/cine/persona.js';
import { SPEAKERS } from '../data/story.js';
import { drawArt, dotPattern } from '../render/cine-art.js';
import { Portrait, Portraits } from '../render/portraits.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const VW = 1600,
  VH = 900;
const IMG_W = 832,
  IMG_H = 1216; // 立繪 v2 的主圖尺寸（寬高比）
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeIO = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
// 從 [x, y, w, h] 或點陣列取得多邊形
const polyOf = (q) =>
  q.length === 4 && typeof q[0] === 'number'
    ? [
        [q[0], q[1]],
        [q[0] + q[2], q[1]],
        [q[0] + q[2], q[1] + q[3]],
        [q[0], q[1] + q[3]],
      ]
    : q;
const bboxOf = (pts) => {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1 - x0, y1 - y0];
};
// 關鍵影格的插值：keys＝[{ t, ...數值 }]，回傳 t 時的各欄位
function keyAt(keys, t, ease = easeIO) {
  if (!keys || !keys.length) return null;
  if (t <= keys[0].t) return keys[0];
  for (let i = 1; i < keys.length; i++)
    if (t < keys[i].t) {
      const a = keys[i - 1],
        b = keys[i];
      const k = ease((t - a.t) / Math.max(1e-6, b.t - a.t));
      const o = {};
      for (const n in b) if (typeof b[n] === 'number' && typeof a[n] === 'number') o[n] = lerp(a[n], b[n], k);
      return { ...a, ...o };
    }
  return keys[keys.length - 1];
}
// 字串依寬度換行（中文一字一字、英文單字不切）
function wrap(x, s, maxW) {
  const out = [];
  let line = '';
  for (const tok of s.match(/[A-Za-z0-9'’\-.,!?]+|\s+|./gu) || []) {
    const t = line + tok;
    if (x.measureText(t).width > maxW && line) {
      out.push(line);
      line = tok.trimStart();
    } else line = t;
  }
  if (line) out.push(line);
  return out;
}

Object.assign(Game.prototype, {
  // 劇本裡用到的立繪先載入（cinePlay 等配樂時一起等）
  // 場景插畫（img：'<章>/<id>'，第 2 期 scripts/cine-art.js 產生）：載入那一章的 lib/cine-art-<章>.js、解碼成圖片
  cine2dPreload(def) {
    const ids = new Set(),
      imgs = new Set();
    const walk = (els) => {
      for (const e of els || []) {
        if (e.k === 'actor' && e.who) ids.add(e.who);
        if (e.img) imgs.add(e.img);
        if (e.kids) walk(e.kids);
      }
    };
    for (const S of def.shots)
      if (S.st) {
        walk(S.st.els);
        if (S.st.bg && S.st.bg.img) imgs.add(S.st.bg.img);
      }
    return Promise.all([
      ...[...ids].map((id) => Portraits.get(id).catch(() => null)),
      ...[...imgs].map((r) => this.cine2dLoadImg(r)),
    ]);
  },
  cine2dLoadImg(ref) {
    const C = (this.cineImgs = this.cineImgs || {});
    if (C[ref]) return C[ref].p;
    const [ch, id] = ref.split('/');
    const E = (C[ref] = { im: null });
    E.p = this.cine2dArtLib(ch).then(
      () =>
        new Promise((res) => {
          const d = window.MECH_CORDON_CINE_ART && window.MECH_CORDON_CINE_ART[ch];
          if (!d || !d[id]) return res(null);
          const im = new Image();
          im.onload = () => res((E.im = im));
          im.onerror = () => res(null);
          im.src = d[id];
        }),
    );
    return E.p;
  },
  // lib/cine-art-<章>.js（一章一個檔，載不到＝沒有插畫，改畫 art 的程式插畫）
  cine2dArtLib(ch) {
    const L = (this.cineArtLibs = this.cineArtLibs || {});
    if (!L[ch])
      L[ch] = new Promise((res) => {
        if (window.MECH_CORDON_CINE_ART && window.MECH_CORDON_CINE_ART[ch]) return res(true);
        const s = document.createElement('script');
        s.src = `lib/cine-art-${ch}.js`;
        s.onload = () => res(true);
        s.onerror = () => res(false);
        document.head.appendChild(s);
      });
    return L[ch];
  },
  // 插畫（已載入的）cover 對齊 (bx, by, bw, bh)；focus＝圖的哪一點對準中心；kb＝推近 { z, x, y }。沒有圖＝false
  cine2dImgDraw(x, ref, bx, by, bw, bh, kb, focus) {
    const E = this.cineImgs && this.cineImgs[ref];
    const im = E && E.im;
    if (!im) {
      if (ref) this.cine2dLoadImg(ref);
      return false;
    }
    const z = (kb && kb.z) || 1;
    const sc = Math.max(bw / im.width, bh / im.height) * z;
    const f = focus || [0.5, 0.5];
    const dw = im.width * sc,
      dh = im.height * sc;
    const dx = clamp(bx + bw / 2 - f[0] * dw + ((kb && kb.x) || 0), bx + bw - dw, bx),
      dy = clamp(by + bh / 2 - f[1] * dh + ((kb && kb.y) || 0), by + bh - dh, by);
    x.drawImage(im, dx, dy, dw, dh);
    return true;
  },
  // 清空舞台（跳時間、結束）
  cine2dClear() {
    const cv = $('cine2d');
    if (cv) cv.getContext('2d').clearRect(0, 0, cv.width, cv.height);
    if (this.cine) this.cine.s2 = null;
  },
  // 字幕的說話者在舞台上：改成氣泡（cineSub 呼叫；回傳 true＝字幕條不顯示）
  cine2dBubble(who, text) {
    const c = this.cine;
    if (!c || !who) return false;
    const S = c.def.shots[c.shot];
    if (!S || !S.st || !this.cine2dFind(S.st.els, (e) => e.k === 'actor' && e.who === who && !e.noBub))
      return false;
    c.bub = { who, text, t0: c.t, tok: c.subTok + 1 };
    return true;
  },
  cine2dFind(els, f) {
    for (const e of els || []) {
      if (f(e)) return e;
      const k = e.kids && this.cine2dFind(e.kids, f);
      if (k) return k;
    }
    return null;
  },
  // 每格（renderMain 之後，所以 live 的格子拿得到這一格的 3D 畫面）
  cine2dDraw(S, lt, dt) {
    const c = this.cine;
    const cv = $('cine2d');
    if (!cv) return;
    const W = innerWidth,
      H = innerHeight;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
    }
    const x = cv.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, cv.width, cv.height);
    const st = S && S.st;
    if (!st) {
      if (c.s2) c.s2 = null;
      return;
    }
    // 同一頁（st.page 相同）連續的鏡頭共用舞台：定格的格子、立繪演員都留著，元素的時間從這一頁的第一鏡算
    let p0 = S.at;
    if (st.page) {
      let j = c.shot;
      while (j > 0 && c.def.shots[j - 1].st && c.def.shots[j - 1].st.page === st.page) j--;
      p0 = c.def.shots[j].at;
    }
    if (!c.s2 || (st.page ? c.s2.page !== st.page : c.s2.si !== c.shot))
      c.s2 = { si: c.shot, page: st.page || null, act: new Map(), snap: new Map() };
    const s2 = c.s2;
    s2.si = c.shot;
    const shotLt = lt;
    lt = c.t - p0;
    // 自己有鏡頭的格子（cam）：每一格各畫一次 3D、複製下來，所以同一頁好幾格可以同時是即時的
    this.cine2dCams(S, st, shotLt, lt);
    s2.dt = c.paused ? 0 : dt;
    s2.lt = lt;
    s2.dur = (c.def.shots[c.shot + 1] ? c.def.shots[c.shot + 1].at : c.def.dur) - S.at;
    // 舞台：1600×900 cover 對齊畫面
    const k = Math.max(W / VW, H / VH);
    s2.k = k * dpr;
    s2.ox = ((W - VW * k) / 2) * dpr;
    s2.oy = ((H - VH * k) / 2) * dpr;
    x.setTransform(s2.k, 0, 0, s2.k, s2.ox, s2.oy);
    // 整頁的鏡頭（在格子之間平移、推近）：pg.keys＝[{ t, x, y, z, r }]（舞台座標的中心、倍率、旋轉）
    const pg = st.pg && keyAt(st.pg.keys, lt);
    let sh = 0;
    if (st.shake)
      for (const [t0, a, d] of st.shake)
        if (lt >= t0 && lt < t0 + d) sh = Math.max(sh, a * (1 - (lt - t0) / d));
    if (pg || sh) {
      const p = pg || {};
      x.translate(VW / 2 + (Math.random() - 0.5) * sh * 30, VH / 2 + (Math.random() - 0.5) * sh * 30);
      x.scale(p.z || 1, p.z || 1);
      x.rotate(p.r || 0);
      x.translate(-(p.x ?? VW / 2), -(p.y ?? VH / 2));
    }
    // 背景：顏色／{ art, ...參數 }／{ grad: [上, 下] }；沒有＝透明（看得到 3D）
    if (st.bg) {
      const B = -VW; // 多畫一圈：頁面鏡頭拉遠或晃動時不露邊
      if (typeof st.bg === 'string') {
        x.fillStyle = st.bg;
        x.fillRect(B, B, VW - 3 * B, VH - 3 * B);
      } else if (st.bg.grad) {
        const g = x.createLinearGradient(0, 0, 0, VH);
        g.addColorStop(0, st.bg.grad[0]);
        g.addColorStop(1, st.bg.grad[1]);
        x.fillStyle = g;
        x.fillRect(B, B, VW - 3 * B, VH - 3 * B);
      } else if (st.bg.img && this.cine2dImgDraw(x, st.bg.img, 0, 0, VW, VH, null, st.bg.focus)) {
        // 場景插畫
      } else if (st.bg.art) drawArt(x, st.bg.art, VW, VH, lt, st.bg);
    }
    for (const e of st.els || []) this.cine2dEl(x, e, lt);
    // 字幕的氣泡（最上層）
    if (c.bub && !c.bub.hide && c.subUntil && c.t < c.subUntil && c.bub.tok === c.subTok)
      this.cine2dBubbleDraw(x, lt);
  },
  // 元素出現的進度：t0 之前不畫；in 的動畫長度 ind（預設 0.28 秒）；t1 之後收掉（out 的動畫 0.2 秒）
  cine2dVis(e, lt) {
    const t0 = e.t0 || 0;
    if (lt < t0) return null;
    if (e.t1 != null && lt >= e.t1 + 0.2) return null;
    const kin = clamp((lt - t0) / (e.ind || 0.28), 0, 1);
    const kout = e.t1 != null ? clamp((lt - e.t1) / 0.2, 0, 1) : 0;
    return { kin, kout };
  },
  cine2dEl(x, e, lt) {
    const v = this.cine2dVis(e, lt);
    if (!v) return;
    const fn = this['cine2d_' + e.k];
    if (!fn) return;
    x.save();
    if (e.gco) x.globalCompositeOperation = e.gco;
    fn.call(this, x, e, lt, v);
    x.restore();
  },
  // 出場的變換：繞中心 (cx, cy)
  cine2dIn(x, e, v, cx, cy) {
    const k = v.kin;
    const a = (1 - v.kout) * (e.in === 'fade' || e.in === 'stamp' ? clamp(k * 2.5, 0, 1) : 1);
    x.globalAlpha *= a * (e.a ?? 1);
    const m = e.in || 'none';
    let dx = 0,
      dy = 0,
      s = 1,
      r = 0;
    const back = 1 - easeOut(k);
    if (m === 'drop') {
      dy = -VH * 0.7 * back;
      r = (e.rot0 ?? 0.05) * back;
    } else if (m === 'up') dy = VH * 0.7 * back;
    else if (m === 'left') dx = -VW * 0.6 * back;
    else if (m === 'right') dx = VW * 0.6 * back;
    else if (m === 'stamp') s = 1 + 0.18 * (1 - easeOut(clamp(k * 1.6, 0, 1)));
    else if (m === 'pop') s = k < 1 ? 0.6 + 0.4 * easeOut(k) + Math.sin(k * Math.PI) * 0.08 : 1;
    if (v.kout) dy += VH * 0.05 * v.kout;
    if (dx || dy || s !== 1 || r) {
      x.translate(cx + dx, cy + dy);
      x.rotate(r);
      x.scale(s, s);
      x.translate(-cx, -cy);
    }
  },
  // ---------- 分格 ----------
  cine2d_panel(x, e, lt, v) {
    const pts = polyOf(e.q);
    const [bx, by, bw, bh] = bboxOf(pts);
    this.cine2dIn(x, e, v, bx + bw / 2, by + bh / 2);
    const path = () => {
      x.beginPath();
      pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
      x.closePath();
    };
    // 外框：白邊（漫畫的格線）＋細黑線；bd 0＝沒有框
    const bd = e.bd ?? 9;
    if (bd) {
      path();
      x.lineJoin = 'miter';
      x.strokeStyle = e.bdc || '#f4f0e8';
      x.lineWidth = bd * 2;
      x.stroke();
    }
    x.save();
    path();
    x.clip();
    // 內容
    if (e.fill) {
      x.fillStyle = e.fill;
      x.fillRect(bx, by, bw, bh);
    }
    // 場景插畫（img）優先，沒有圖時畫程式插畫（art）
    const kb0 = e.kb ? keyAt(e.kb, lt, (q) => q) : null;
    const hasImg = e.img && this.cine2dImgDraw(x, e.img, bx, by, bw, bh, kb0, e.focus);
    if (e.art && !hasImg) {
      const kb = kb0;
      x.save();
      x.translate(bx, by);
      if (kb) {
        x.translate(bw / 2, bh / 2);
        x.scale(kb.z || 1, kb.z || 1);
        x.translate(-bw / 2 + (kb.x || 0), -bh / 2 + (kb.y || 0));
      }
      drawArt(x, e.art, bw, bh, lt, e.ao || {});
      x.restore();
    }
    if (e.live && !hasImg) this.cine2dLive(x, e, lt, bx, by, bw, bh); // 有插畫時不畫 3D（插畫優先，3D 是沒有圖時的代替）
    for (const kid of e.kids || []) this.cine2dEl(x, kid, lt);
    // 單色（保留亮度、換成這個顏色）、網點、反白
    if (e.tone) {
      x.globalCompositeOperation = 'color';
      x.fillStyle = e.tone;
      x.fillRect(bx, by, bw, bh);
      x.globalCompositeOperation = 'source-over';
    }
    if (e.dots) {
      x.globalCompositeOperation = 'multiply';
      x.globalAlpha *= e.dots;
      x.fillStyle = dotPattern(x, e.dotSz || 9, 0.55);
      x.fillRect(bx, by, bw, bh);
      x.globalCompositeOperation = 'source-over';
    }
    if (e.vig) {
      const g = x.createRadialGradient(
        bx + bw / 2,
        by + bh / 2,
        Math.min(bw, bh) * 0.3,
        bx + bw / 2,
        by + bh / 2,
        Math.hypot(bw, bh) * 0.6,
      );
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(0,0,0,${e.vig})`);
      x.fillStyle = g;
      x.fillRect(bx, by, bw, bh);
    }
    x.restore();
    if (bd) {
      path();
      x.strokeStyle = e.lc || '#0a0a0a';
      x.lineWidth = e.lw ?? 3;
      x.stroke();
    }
  },
  // 格子自己的鏡頭（第 3 期）：live 的格子有 cam（和鏡頭的 cam 同樣的寫法，keys 的時間＝這一頁的時間）時，
  // 換成那個鏡頭畫一次 3D（渲染風格的管線照舊），複製到這一格的畫布 s2.lc；畫完再換回這一鏡的鏡頭。
  // 只畫看得到、還沒定格的格子；一格多畫一次整個場景，所以一頁同時即時的格子不要太多（2～3 格）
  cine2dCams(S, st, shotLt, lt) {
    const c = this.cine,
      s2 = c.s2;
    const list = [];
    const walk = (els) => {
      for (const e of els || []) {
        if (e.k === 'panel' && e.live && e.cam && lt >= (e.t0 || 0) && !(e.t1 != null && lt > e.t1 + 0.2))
          if (!(e.snap != null && lt >= e.snap && s2.snap.has(e.id || JSON.stringify(e.q)))) list.push(e);
        if (e.kids) walk(e.kids);
      }
    };
    walk(st.els);
    if (!list.length || !this.renderer) return;
    const src = this.renderer.domElement;
    s2.lc = s2.lc || new Map();
    const look = c.look.clone();
    for (const e of list) {
      c.cut = true;
      this.cineCamera({ cam: { snap: true, ...e.cam } }, lt, 0);
      this.stylePipe.resetHistory();
      this.renderMain();
      const key = e.id || JSON.stringify(e.q);
      let cv = s2.lc.get(key);
      if (!cv) s2.lc.set(key, (cv = document.createElement('canvas')));
      if (cv.width !== src.width || cv.height !== src.height) {
        cv.width = src.width;
        cv.height = src.height;
      }
      cv.getContext('2d').drawImage(src, 0, 0);
    }
    // 換回這一鏡的鏡頭（下一格的追焦從原本的注視點接著走）
    c.look.copy(look);
    c.cut = false;
    this.cineCamera(S, shotLt, 0);
    c.look.copy(look);
    this.stylePipe.resetHistory();
    // 渲染器的畫布換回這一鏡的畫面（沒有自己鏡頭的 live 格子與透明的背景用它）
    this.renderMain();
  },
  // 即時的 3D 畫面放進格子：渲染器的畫布（這一格剛畫好）cover 對齊格子的外框；focus＝畫面的哪一點對準格子中心
  // snap：格子的時間到了就定格（之後 3D 鏡頭可以去拍別的格子）
  cine2dLive(x, e, lt, bx, by, bw, bh) {
    const s2 = this.cine.s2;
    const key = e.id || JSON.stringify(e.q);
    let src = (s2.lc && s2.lc.get(key)) || (this.renderer && this.renderer.domElement);
    if (e.snap != null && lt >= e.snap) {
      let im = s2.snap.get(key);
      if (!im && src && src.width) {
        im = document.createElement('canvas');
        im.width = src.width;
        im.height = src.height;
        im.getContext('2d').drawImage(src, 0, 0);
        s2.snap.set(key, im);
      }
      src = im;
    }
    if (!src || !src.width) return;
    const sw = src.width,
      sh = src.height;
    const zz = e.zoom ? keyAt(e.zoom, lt, (q) => q).z : 1;
    const sc = Math.max(bw / sw, bh / sh) * (e.lz || 1) * zz;
    const f = e.focus || [0.5, 0.5];
    const dw = sw * sc,
      dh = sh * sc;
    const dx = clamp(bx + bw / 2 - f[0] * dw, bx + bw - dw, bx),
      dy = clamp(by + bh / 2 - f[1] * dh, by + bh - dh, by);
    if (e.flt) x.filter = e.flt;
    x.drawImage(src, dx, dy, dw, dh);
    x.filter = 'none';
  },
  // ---------- 立繪演員 ----------
  // e：{ who, pose, expr, at: [x, 底部 y], h 高度（舞台單位，整張主圖）, mirror, in, holo: 顏色, tone, dim 0～1 變暗（沒說話的人）,
  //   s: [{ t, pose, expr, act, at, h, dim, mv 移動秒數 }] }
  cine2d_actor(x, e, lt, v) {
    const s2 = this.cine.s2;
    const id = e.id || e.who;
    let A = s2.act.get(id);
    if (!A) {
      A = { P: null, fired: new Set(), who: e.who };
      s2.act.set(id, A);
      Portraits.get(e.who).then((pk) => {
        if (pk && !A.P) A.P = new Portrait(pk, e.pose || 'p1');
      });
    }
    if (!A.P) return;
    // unless：那張插畫載入了就不畫（插畫裡已經有這個角色；沒有插畫時才用立繪代替）
    if (e.unless && this.cineImgs && this.cineImgs[e.unless] && this.cineImgs[e.unless].im) return;
    const P = A.P;
    const per = PERSONA[e.who] || PERSONA_DEF;
    // 時間軸：到 lt 為止的姿勢、表情、位置（每格重算，跳時間也一致）
    let pose = e.pose || 'p1',
      prevPose = pose,
      tPose = -99,
      expr = e.expr || 'neutral',
      at = e.at || [VW / 2, VH],
      h = e.h || VH * 1.1,
      dim = e.dim || 0,
      from = null,
      tMove = 0,
      mv = 0.4;
    for (const s of e.s || []) {
      if (s.t > lt) break;
      if (s.pose && s.pose !== pose) {
        prevPose = pose;
        pose = s.pose;
        tPose = s.t;
      }
      if (s.expr) expr = s.expr;
      if (s.dim != null) dim = s.dim;
      if (s.at || s.h) {
        from = { at, h };
        at = s.at || at;
        h = s.h || h;
        tMove = s.t;
        mv = s.mv ?? 0.4;
      }
      if (s.act && !A.fired.has(s.t)) {
        A.fired.add(s.t);
        if (lt - s.t < 0.5) P.act(s.act);
      }
    }
    if (from && lt - tMove < mv) {
      const k = easeIO((lt - tMove) / mv);
      at = [lerp(from.at[0], at[0], k), lerp(from.at[1], at[1], k)];
      h = lerp(from.h, h, k);
    }
    // 說話：字幕的氣泡是他、或語音是他 → 對口型
    const c = this.cine;
    const talking = !!(c.bub && c.bub.who === e.who && c.subUntil && c.t < c.subUntil);
    const lv = this.ptTalk ? this.ptTalk(e.who, talking) : null;
    P.talkSim(lv === -1);
    P.update(s2.dt, lv > 0 ? lv : 0);
    // 換姿勢：保持＋兩格模糊的過渡格（各 1/12 秒），之後依角色個性到位
    const tr = lt - tPose;
    let drawPose = pose,
      blur = 0,
      sx = 0,
      sy = 0,
      ss = 1;
    if (tr < 1 / 12) {
      drawPose = prevPose;
      blur = per.blur;
      sx = (e.mirror ? -1 : 1) * 6;
    } else if (tr < 2 / 12) blur = per.blur * 0.6;
    else if (tr < 0.6) {
      const q = (tr - 2 / 12) / (0.6 - 2 / 12);
      if (per.w === 'heavy') sy = Math.sin(Math.min(1, q * 1.4) * Math.PI) * h * 0.008;
      else if (per.w === 'light') ss = 1 + Math.sin(q * Math.PI * 2) * 0.012 * (1 - q);
      else ss = 1 + Math.sin(q * Math.PI) * 0.006;
    }
    if (A.pose !== drawPose) {
      P.setPose(drawPose);
      A.pose = drawPose;
      A.expr = null;
    }
    if (A.expr !== expr) {
      P.setExpr(expr);
      A.expr = expr;
    }
    // 待機：輕的角色多晃一點
    sy += Math.sin(this.cine.t * 1.3 + (e.at ? e.at[0] : 0)) * h * 0.0015 * per.idle;
    const w = (h * IMG_W) / IMG_H;
    const cx = at[0] + sx,
      by = at[1] + sy;
    A.box = { x: at[0] - w / 2, y: at[1] - h, w, h, P }; // 給氣泡找臉
    this.cine2dIn(x, e, v, cx, by - h / 2);
    if (ss !== 1) {
      x.translate(cx, by);
      x.scale(ss, ss);
      x.translate(-cx, -by);
    }
    if (e.holo || e.tone) return this.cine2dActorFx(x, e, A, cx, by, w, h, blur);
    if (blur) x.filter = `blur(${blur * s2.k}px)`;
    x.translate(cx - w / 2, by - h);
    P.draw(x, w, h, { fit: 'full', mirror: !!e.mirror });
    x.filter = 'none';
    if (dim) {
      // 沒說話的人變暗：再疊一次自己（source-atop 不能用在主畫布上，所以用黑色的剪影疊上去）
      this.cine2dActorFx(x, { ...e, tone: null, holo: null, sil: dim }, A, w / 2, h, w, h, 0, true);
    }
  },
  // 單色、全像、剪影：先畫到暫存畫布再上色
  cine2dActorFx(x, e, A, cx, by, w, h, blur, local) {
    const s2 = this.cine.s2;
    const k = s2.k;
    const cw = Math.ceil(w * k),
      ch = Math.ceil(h * k);
    const off = (A.off =
      A.off && A.off.width === cw && A.off.height === ch ? A.off : document.createElement('canvas'));
    if (off.width !== cw) off.width = cw;
    if (off.height !== ch) off.height = ch;
    const g = off.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.scale(k, k);
    A.P.draw(g, w, h, { fit: 'full', mirror: !!e.mirror });
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    if (e.sil) {
      g.fillStyle = `rgba(0,0,0,${e.sil})`;
      g.fillRect(0, 0, cw, ch);
    } else if (e.tone) {
      g.globalCompositeOperation = 'color';
      g.fillStyle = e.tone;
      g.fillRect(0, 0, cw, ch);
      g.globalCompositeOperation = 'destination-in';
      A.P.draw(g, cw, ch, { fit: 'full', mirror: !!e.mirror });
    } else if (e.holo) {
      g.fillStyle = e.holo;
      g.globalAlpha = 0.55;
      g.fillRect(0, 0, cw, ch);
      g.globalAlpha = 1;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (let y = (this.cine.t * 40) % 4; y < ch; y += 4) g.fillRect(0, y, cw, 1.5);
    }
    g.globalCompositeOperation = 'source-over';
    const px = local ? 0 : cx - w / 2,
      py = local ? 0 : by - h;
    if (blur) x.filter = `blur(${blur * k}px)`;
    if (e.holo) {
      // 全像：加色、閃爍、偶爾橫向錯位
      const t = this.cine.t;
      const fl = 0.75 + 0.25 * Math.sin(t * 23) * Math.sin(t * 7.1);
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha *= fl;
      const gl = Math.sin(t * 3.3) > 0.97 ? 8 : 0;
      x.drawImage(off, px + gl, py, w, h);
      x.globalCompositeOperation = 'source-over';
    } else x.drawImage(off, px, py, w, h);
    x.filter = 'none';
  },
  // ---------- 氣泡 ----------
  cine2dBubbleDraw(x, lt) {
    const c = this.cine;
    const B = c.bub;
    const A = [...c.s2.act.values()].find((a) => a.who === B.who && a.box);
    let at,
      tail = null,
      side = 1;
    const spec = this.cine2dFind(c.def.shots[c.shot].st.els, (e) => e.k === 'actor' && e.who === B.who);
    if (A && A.box && A.P) {
      const f = A.P.P.boxes.face || [IMG_W * 0.3, IMG_H * 0.12, IMG_W * 0.4, IMG_H * 0.22];
      const s = A.box.h / IMG_H;
      let fx = f[0] + f[2] / 2;
      if (spec && spec.mirror) fx = IMG_W - fx;
      const hx = A.box.x + fx * s,
        hy = A.box.y + (f[1] + f[3] * 0.8) * s;
      side = spec && spec.bubSide ? spec.bubSide : hx < VW / 2 ? 1 : -1;
      const off = (spec && spec.bub) || [side * 330, -150];
      at = [hx + off[0], hy + off[1]];
      tail = [hx + side * f[2] * s * 0.45, hy];
    } else at = (spec && spec.bubAt) || [VW / 2, VH * 0.2];
    const text = this.subText ? this.subText(B.text, B.who) : B.text;
    const S = SPEAKERS[B.who] || {};
    const name =
      B.who === 'echo'
        ? 'ECHO'
        : (this.subName ? this.subName(B.who, S.name || '') : S.name || '').replace(/（.*）/, '');
    this.cine2dBalloon(x, {
      at,
      tail,
      text,
      name,
      color: S.color,
      t: c.t - B.t0,
      w: (spec && spec.bubW) || 460,
    });
  },
  // 氣泡（白底黑框、往說話的人拉一條尾巴、名字的小標籤）；字一個一個出來
  cine2dBalloon(x, o) {
    const fs = o.fs || 30;
    x.save();
    x.font = `700 ${fs}px "Noto Sans TC", sans-serif`;
    const lines = wrap(x, o.text, o.w - 48);
    const lh = fs * 1.42;
    const bw = Math.min(o.w, Math.max(...lines.map((l) => x.measureText(l).width)) + 56),
      bh = lines.length * lh + 34;
    let [cx, cy] = o.at;
    cx = clamp(cx, bw / 2 + 30, VW - bw / 2 - 30);
    cy = clamp(cy, bh / 2 + 40, VH - bh / 2 - 40);
    const k = clamp(o.t / 0.16, 0, 1);
    const s = 0.7 + 0.3 * easeOut(k) + Math.sin(k * Math.PI) * 0.05;
    x.translate(cx, cy);
    x.scale(s, s);
    x.rotate(o.rot ?? -0.012);
    x.globalAlpha *= k;
    const L = -bw / 2,
      T = -bh / 2;
    // 尾巴
    if (o.tail) {
      const tx = (o.tail[0] - cx) / s,
        ty = (o.tail[1] - cy) / s;
      const bx0 = clamp(tx * 0.3, L + 40, -L - 40);
      x.beginPath();
      x.moveTo(bx0 - 22, ty > 0 ? -T - 4 : T + 4);
      x.lineTo(tx * 0.72, ty * 0.72);
      x.lineTo(bx0 + 22, ty > 0 ? -T - 4 : T + 4);
      x.closePath();
      x.fillStyle = '#fff';
      x.strokeStyle = '#0a0a0a';
      x.lineWidth = 5;
      x.stroke();
      x.fill();
    }
    x.beginPath();
    x.roundRect(L, T, bw, bh, 18);
    x.fillStyle = '#fff';
    x.strokeStyle = '#0a0a0a';
    x.lineWidth = 5;
    x.stroke();
    x.fill();
    // 名字的標籤（說話者的顏色）
    if (o.name) {
      x.font = `800 ${fs * 0.62}px "Rubik", "Noto Sans TC", sans-serif`;
      const nw = x.measureText(o.name).width + 26;
      x.fillStyle = o.color || '#222';
      x.beginPath();
      x.moveTo(L + 16, T - 16);
      x.lineTo(L + 16 + nw + 10, T - 16);
      x.lineTo(L + 16 + nw, T + 12);
      x.lineTo(L + 6, T + 12);
      x.closePath();
      x.fill();
      x.fillStyle = '#0a0a0a';
      x.textBaseline = 'middle';
      x.fillText(o.name, L + 26, T - 2);
    }
    // 內文：逐字
    x.font = `700 ${fs}px "Noto Sans TC", sans-serif`;
    x.fillStyle = '#111';
    x.textBaseline = 'top';
    let n = Math.floor(o.t * (o.cps || 26));
    lines.forEach((l, i) => {
      const ch = [...l];
      const shown = ch.slice(0, Math.max(0, n)).join('');
      n -= ch.length;
      x.fillText(shown, L + 28, T + 18 + i * lh);
    });
    x.restore();
  },
  // 沒有語音的氣泡：{ k: 'bubble', s 文字, at, tail, name, color, t0, t1, w }
  cine2d_bubble(x, e, lt) {
    this.cine2dBalloon(x, { ...e, text: e.s, t: lt - (e.t0 || 0) });
  },
  // ---------- 字 ----------
  // 狀聲詞與大字：{ s, at, size, color, stroke 描邊顏色, sw 描邊寬, rot, font 'sfx'|'title'|'mono', al, in, sub 小字 }
  cine2d_text(x, e, lt, v) {
    const [px, py] = e.at || [VW / 2, VH / 2];
    this.cine2dIn(x, e, v, px, py);
    const fam =
      e.font === 'mono'
        ? '"Share Tech Mono", monospace'
        : e.font === 'title'
          ? '"Rubik", "Noto Sans TC", sans-serif'
          : '"Noto Sans TC", sans-serif';
    const sz = e.size || 160;
    x.font = `${e.wt || 900} ${sz}px ${fam}`;
    x.textAlign = e.al || 'center';
    x.textBaseline = 'middle';
    x.translate(px, py);
    x.rotate(e.rot || 0);
    // 蓋章之後抖一下
    const sk = e.in === 'stamp' ? Math.max(0, 1 - (lt - (e.t0 || 0)) / 0.35) : 0;
    if (sk) x.translate((Math.random() - 0.5) * 14 * sk, (Math.random() - 0.5) * 14 * sk);
    if (e.ls) x.letterSpacing = e.ls + 'px';
    if (e.stroke !== null) {
      x.lineJoin = 'round';
      x.strokeStyle = e.stroke || '#0a0a0a';
      x.lineWidth = e.sw ?? sz * 0.12;
      x.strokeText(e.s, 0, 0);
    }
    x.fillStyle = e.color || '#fff';
    x.fillText(e.s, 0, 0);
    if (e.sub) {
      x.font = `700 ${sz * 0.26}px ${fam}`;
      x.letterSpacing = '6px';
      x.fillStyle = e.subColor || e.color || '#fff';
      x.fillText(e.sub, 0, sz * 0.72);
    }
  },
  // ---------- 色塊（PV 的平面設計）----------
  // { q, color, in: 'left'|'right'|'drop'|'wipe', t0 }；wipe＝從左往右展開
  cine2d_block(x, e, lt, v) {
    const pts = polyOf(e.q);
    const [bx, by, bw, bh] = bboxOf(pts);
    if (e.in === 'wipe') {
      x.beginPath();
      x.rect(bx, by, bw * easeOut(v.kin), bh);
      x.clip();
      x.globalAlpha *= 1 - v.kout;
    } else this.cine2dIn(x, e, v, bx + bw / 2, by + bh / 2);
    x.beginPath();
    pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
    x.closePath();
    if (e.live) {
      x.save();
      x.clip();
      this.cine2dLive(x, e, lt, bx, by, bw, bh);
      x.restore();
    } else {
      x.fillStyle = e.color || '#000';
      x.fill();
    }
  },
  // 程式插畫：{ art, q: [x, y, w, h], ao 參數, kb 推近 }
  cine2d_art(x, e, lt, v) {
    const [bx, by, bw, bh] = e.q || [0, 0, VW, VH];
    this.cine2dIn(x, e, v, bx + bw / 2, by + bh / 2);
    const kb = e.kb ? keyAt(e.kb, lt, (q) => q) : null;
    if (e.img && this.cine2dImgDraw(x, e.img, bx, by, bw, bh, kb, e.focus)) return;
    x.translate(bx, by);
    drawArt(x, e.art, bw, bh, lt, e.ao || {});
  },
  // 集中線、速度線：{ kind 'focus'|'speed', q, color, n, cx, cy, r }
  cine2d_lines(x, e, lt, v) {
    const [bx, by, bw, bh] = e.q || [0, 0, VW, VH];
    x.globalAlpha *= v.kin * (1 - v.kout) * (e.a ?? 1);
    x.translate(bx, by);
    drawArt(x, e.kind || 'focus', bw, bh, lt, e);
  },
});
