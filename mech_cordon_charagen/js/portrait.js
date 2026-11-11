// 立繪的播放器：角色產生器的預覽與遊戲（之後由 esbuild 打包進遊戲）共用，不依賴 DOM 以外的東西
// 疊三層：表情底圖（主圖＋該表情的臉）→ 眼睛小圖（眨眼）→ 嘴巴小圖（對口型）；動作（呼吸、點頭、搖頭…）是畫的時候的變換
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
    ctx.drawImage(im, 0, 0, W, H);
    const ex = P.ex[this.expr] || {};
    const put = (name, box) => {
      const p = name && this.pack.imgs[name];
      if (p && box) ctx.drawImage(p, box[0], box[1], box[2], box[3]);
    };
    put(ex.f, P.boxes.face);
    put(this.frame('eye'), P.boxes.eyes);
    put(this.frame('mouth'), P.boxes.mouth);
    ctx.restore();
    return { src, sc };
  }
}
