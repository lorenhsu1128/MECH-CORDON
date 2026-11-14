// 立繪的播放器：角色產生器的預覽與遊戲（之後由 esbuild 打包進遊戲）共用，不依賴 DOM 以外的東西
// 疊三層：表情底圖（主圖＋該表情的臉）→ 眼睛小圖（眨眼）→ 嘴巴小圖（對口型）；動作（呼吸、點頭、搖頭…）是畫的時候的變換。
// 有分層（pub 的 layers：後髮／身體／頭／前髮）時改用分層動畫（drawLayers）
//   const pk = await PortraitPack.load(card.pub, (name) => 圖片網址);
//   const p = new Portrait(pk, 'p1'); p.setExpr('smile'); p.act('nod');
//   每格：p.update(dt, 音量 0～1)；p.draw(ctx, 畫布的寬, 高, { fit: 'bust' })
export class PortraitPack {
  constructor(pub, imgs) {
    this.pub = pub;
    this.imgs = imgs; // 檔名 → HTMLImageElement／ImageBitmap
  }
  static async load(pub, urlOf) {
    const names = new Set();
    for (const P of pub.poses) {
      names.add(P.img);
      for (const ex of Object.values(P.ex)) for (const f of Object.values(ex)) names.add(f);
      for (const f of Object.values(P.layers || {})) names.add(f);
    }
    const imgs = {};
    await Promise.all(
      [...names].map(
        (n) =>
          new Promise((res) => {
            const im = new Image();
            im.onload = () => res((imgs[n] = im));
            im.onerror = () => res(null);
            im.src = urlOf(n);
          }),
      ),
    );
    return new PortraitPack(pub, imgs);
  }
  pose(id) {
    return this.pub.poses.find((p) => p.id === id) || this.pub.poses[0];
  }
  // 分層動畫的四層（pub 的 layers，四張都載入了才用）：{ 層: { img, box 有像素的範圍 } }，第一次用到時量範圍
  layers(P) {
    if (!P.layers) return null;
    if (P._L !== undefined) return P._L;
    const L = {};
    for (const g of ['hairb', 'body', 'head', 'hairf']) {
      const im = this.imgs[P.layers[g]];
      if (!im) return (P._L = null);
      L[g] = { img: P.layers[g], box: alphaBox(im) };
    }
    return (P._L = L);
  }
  // 臉／眼／嘴的小圖只留「不動的時候看得到臉」的部分（頭那一層 − 前髮），所以前髮晃開時下面是補畫的額頭、不會有兩層頭髮
  patchIn(P, L, name, box) {
    const k = P.id + '|' + name;
    // 快取放在立繪套件上（同一個角色的每個演員共用；以前每個 Portrait 各做一次，過場換鏡頭時重算）
    const C = (this.pack.masked = this.pack.masked || {});
    if (C[k]) return C[k];
    const p = this.imgs[name];
    if (!p) return null;
    const [x, y, w, h] = box;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    g.drawImage(p, 0, 0, w, h);
    g.globalCompositeOperation = 'destination-in';
    g.drawImage(this.imgs[L.head.img], x, y, w, h, 0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(this.imgs[L.hairf.img], x, y, w, h, 0, 0, w, h);
    return (C[k] = c);
  }
}

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
// 圖片裡不透明的範圍 [x, y, w, h]
function alphaBox(im) {
  const W = im.naturalWidth || im.width,
    H = im.naturalHeight || im.height;
  const g = canvas(W, H).getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W,
    y0 = H,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (d[(y * W + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? [0, 0, 1, 1] : [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

// 動作：時間長度與每個時間點的變換（dx、dy 以主圖高度為單位，s 縮放，r 旋轉弧度）
const ACTS = {
  nod: { t: 0.42, f: (k) => ({ dy: Math.sin(k * Math.PI) * 0.012 }) },
  shake: { t: 0.5, f: (k) => ({ dx: Math.sin(k * Math.PI * 4) * 0.01 * (1 - k) }) },
  lean: { t: 0.9, f: (k) => ({ s: 1 + Math.sin(k * Math.PI) * 0.035, dy: Math.sin(k * Math.PI) * 0.01 }) },
  back: { t: 0.7, f: (k) => ({ s: 1 - Math.sin(k * Math.PI) * 0.03, dy: -Math.sin(k * Math.PI) * 0.006 }) },
  turn: { t: 0.8, f: (k) => ({ dx: Math.sin(k * Math.PI) * 0.018, r: Math.sin(k * Math.PI) * 0.015 }) },
  bounce: { t: 0.5, f: (k) => ({ dy: -Math.abs(Math.sin(k * Math.PI * 2)) * 0.01 }) },
  flinch: {
    t: 0.35,
    f: (k) => ({ dx: (Math.random() - 0.5) * 0.012 * (1 - k), dy: (Math.random() - 0.5) * 0.008 * (1 - k) }),
  },
};
export const ACT_NAMES = {
  nod: '點頭',
  shake: '搖頭',
  lean: '往前靠',
  back: '往後縮',
  turn: '轉開',
  bounce: '跳一下',
  flinch: '被打中',
};

export class Portrait {
  constructor(pack, poseId) {
    this.pack = pack;
    this.setPose(poseId);
    this.expr = 'neutral';
    this.t = 0;
    this.blinkIn = 1.5 + Math.random() * 3;
    this.blinkT = -1;
    this.mouth = null; // 目前的嘴型影格
    this.mouthHold = 0;
    this.lvl = 0;
    this.acts = [];
    this.sim = false; // 沒有語音時模擬說話（預覽用）
    this.layersOn = true; // 有分層時用分層動畫（關掉＝主圖＋小圖）
    this.simT = 0;
  }
  setPose(id) {
    this.P = this.pack.pose(id);
  }
  setExpr(id) {
    this.expr = this.P.ex[id] ? id : 'neutral';
  }
  act(name) {
    if (ACTS[name]) this.acts.push({ a: ACTS[name], t: 0 });
  }
  talkSim(on) {
    this.sim = on;
  }
  update(dt, level = 0) {
    this.t += dt;
    // 眨眼：半閉 0.05 → 閉 0.07 → 半閉 0.05 秒，間隔 2～6 秒，偶爾連眨兩次
    if (this.blinkT < 0) {
      this.blinkIn -= dt;
      if (this.blinkIn <= 0) {
        this.blinkT = 0;
        this.blinkIn = Math.random() < 0.15 ? 0.25 : 2 + Math.random() * 4;
      }
    } else {
      this.blinkT += dt;
      if (this.blinkT > 0.17) this.blinkT = -1;
    }
    // 模擬說話：音節 0.09～0.2 秒、句子之間停頓
    if (this.sim) {
      this.simT -= dt;
      if (this.simT <= 0) {
        this.simLvl = Math.random() < 0.12 ? 0 : 0.2 + Math.random() * 0.8;
        this.simT = this.simLvl ? 0.09 + Math.random() * 0.11 : 0.25 + Math.random() * 0.4;
      }
      level = Math.max(level, this.simLvl || 0);
    }
    // 對口型：音量 → 嘴型，每個嘴型至少維持 0.07 秒（避免閃爍）
    this.lvl += (level - this.lvl) * Math.min(1, dt * 30);
    this.mouthHold -= dt;
    if (this.mouthHold <= 0) {
      const L = this.lvl;
      const want = L < 0.08 ? null : L < 0.3 ? 'm1' : L < 0.65 ? (Math.random() < 0.3 ? 'm3' : 'm2') : 'm2';
      if (want !== this.mouth) {
        this.mouth = want;
        this.mouthHold = 0.07;
      }
    }
    for (const a of this.acts) a.t += dt;
    this.acts = this.acts.filter((a) => a.t < a.a.t);
  }
  frame(kind) {
    const ex = this.P.ex[this.expr] || {};
    if (kind === 'eye') {
      if (this.blinkT < 0) return null;
      const id = this.blinkT < 0.05 || this.blinkT > 0.12 ? 'e1' : 'e2';
      return ex[id] || ex.e2 || ex.e1 || null;
    }
    if (!this.mouth) return null;
    return ex[this.mouth] || ex.m2 || ex.m1 || null;
  }
  // fit：'full'＝整張主圖放進畫布；'bust'＝以臉為中心的胸像；'face'＝臉的特寫
  // 回傳畫在畫布上的臉的範圍（給特效用）
  draw(ctx, cw, ch, { fit = 'full', mirror = false, align = 0.5 } = {}) {
    const P = this.P;
    const im = this.pack.imgs[P.img];
    if (!im) return null;
    const W = P.w || im.width;
    const H = P.h || im.height;
    const face = P.boxes.face || [W * 0.3, H * 0.12, W * 0.4, H * 0.22];
    // 來源範圍 [sx, sy, sw, sh]
    let src;
    if (fit === 'full') src = [0, 0, W, H];
    else {
      // 胸像：寬＝臉框寬的 1.7 倍；臉：1.15 倍（臉框通常含一點頭髮）。不超出主圖
      const k = fit === 'face' ? 1.15 : 1.7;
      // 寬與高都要放得下臉框 × k（很扁的插入畫面以高度為準）
      let sw = Math.min(Math.max(face[2] * k, (face[3] * k * cw) / ch), W);
      let sh = (sw * ch) / cw;
      if (sh > H) {
        sh = H;
        sw = (sh * cw) / ch;
      }
      // 臉的中心放在畫面高度的 36%（胸像）／50%（臉）
      const cx = face[0] + face[2] / 2;
      const cy = face[1] + face[3] / 2;
      const ky = fit === 'face' ? 0.5 : 0.36;
      src = [Math.max(0, Math.min(W - sw, cx - sw / 2)), Math.max(0, Math.min(H - sh, cy - sh * ky)), sw, sh];
    }
    const sc = Math.min(cw / src[2], ch / src[3]);
    // 動作與呼吸
    let dx = 0,
      dy = Math.sin(this.t * 1.7) * 0.0025,
      s = 1 + Math.sin(this.t * 1.7) * 0.003,
      r = 0;
    for (const a of this.acts) {
      const v = a.a.f(a.t / a.a.t);
      dx += v.dx || 0;
      dy += v.dy || 0;
      s *= v.s || 1;
      r += v.r || 0;
    }
    ctx.save();
    ctx.translate(cw * align, ch);
    if (mirror) ctx.scale(-1, 1);
    ctx.translate(dx * H * sc, dy * H * sc);
    ctx.rotate(r);
    ctx.scale(s * sc, s * sc);
    ctx.translate(-(src[0] + src[2] / 2), -(src[1] + src[3]));
    const ex = P.ex[this.expr] || {};
    const patches = [
      [ex.f, P.boxes.face],
      [this.frame('eye'), P.boxes.eyes],
      [this.frame('mouth'), P.boxes.mouth],
    ];
    const L = this.layersOn && this.pack.layers(P);
    if (L) this.drawLayers(ctx, P, L, patches);
    else {
      ctx.drawImage(im, 0, 0, W, H);
      for (const [name, box] of patches) {
        const p = name && this.pack.imgs[name];
        if (p && box) ctx.drawImage(p, box[0], box[1], box[2], box[3]);
      }
    }
    ctx.restore();
    return { src, sc };
  }
  // 分層動畫（docs/portrait-design.md 第 6 期）：後髮 → 身體 → 頭（＋表情／眼／嘴的小圖，只貼在不動時看得到臉的地方）→ 前髮。
  // 頭、頭髮繞脖子微微轉動；頭髮由上往下越來越晃（橫向切成細條、各自位移）。不動的時候四層疊起來＝主圖
  drawLayers(ctx, P, L, patches) {
    const t = this.t;
    const face = P.boxes.face;
    // 頭的轉動：繞脖子（臉框下緣再往下一點），很慢的兩個正弦相加；說話時跟著音量點一點
    const piv = [face[0] + face[2] / 2, face[1] + face[3] * 1.12];
    const th = Math.sin(t * 0.63) * 0.007 + Math.sin(t * 1.71 + 1) * 0.0025 + this.lvl * 0.006;
    const headT = () => {
      ctx.translate(piv[0], piv[1]);
      ctx.rotate(th);
      ctx.translate(-piv[0], -piv[1]);
    };
    // 頭轉動時頭髮跟著，另外再晃：振幅（主圖高度的比例）、速度、相位
    const sway = (g, amp, spd, ph) => {
      const im = this.pack.imgs[L[g].img];
      const [bx, by, bw, bh] = L[g].box;
      const H = P.h || im.height;
      // 在原尺寸的暫存畫布上變形（條與條重疊 1 px），再整張畫上去：直接在縮放過的畫布上一條一條畫，條的邊緣會露出細縫
      const m = Math.ceil(amp * H * 1.5) + 2;
      const key = P.id + '|' + g;
      const C = (this.swayCv = this.swayCv || {});
      const off = (C[key] = C[key] || canvas(bw + m * 2, bh));
      const o = off.getContext('2d');
      o.clearRect(0, 0, off.width, off.height);
      const step = 4;
      for (let y = by; y < by + bh; y += step) {
        const k = Math.pow((y - by) / bh, 1.6);
        const dx =
          k * amp * H * (Math.sin(t * spd + ph + y * 0.006) + 0.35 * Math.sin(t * spd * 2.3 + y * 0.013));
        const h = Math.min(step + 1, by + bh - y);
        o.drawImage(im, bx, y, bw, h, m + dx, y - by, bw, h);
      }
      ctx.drawImage(off, bx - m, by);
    };
    ctx.save();
    headT();
    sway('hairb', 0.0045, 1.3, 0);
    ctx.restore();
    const body = this.pack.imgs[L.body.img];
    ctx.drawImage(body, 0, 0, P.w || body.width, P.h || body.height);
    ctx.save();
    headT();
    const head = this.pack.imgs[L.head.img];
    ctx.drawImage(head, 0, 0, P.w || head.width, P.h || head.height);
    for (const [name, box] of patches) {
      const p = name && box && this.pack.patchIn(P, L, name, box);
      if (p) ctx.drawImage(p, box[0], box[1], box[2], box[3]);
    }
    sway('hairf', 0.003, 1.5, 0.8);
    ctx.restore();
  }
}
