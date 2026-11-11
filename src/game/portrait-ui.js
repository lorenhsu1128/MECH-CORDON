// 劇情角色的立繪顯示（docs/portrait-design.md 第四節）：通訊框的胸像、簡報與劇情畫面的立繪、通訊紀錄的小頭像。
// 有立繪的角色（lib/portraits/index.js）把字母徽章換成畫布；沒有的照舊是徽章。只改外觀、各端自己顯示。
// 畫布由自己的 requestAnimationFrame 更新（選單畫面也要動），離開畫面（不在 DOM 裡）就拿掉。
import { SFX } from '../audio/audio.js';
import { Portrait, Portraits } from '../render/portraits.js';
import { Game } from './game.js';

const DPR_MAX = 2;

Object.assign(Game.prototype, {
  // 把 host 換成 sp 的立繪。o：{ w, h 畫布的 CSS 尺寸, fit 'bust'／'face'／'full', pose, expr,
  //   talk() → 音量 0～1（null＝不說話）, still 只畫一次（小頭像）, cls 額外的 class, replace 取代 host（否則放進 host 裡）}
  // 回傳 Promise<view|null>（沒有立繪或 host 已經不在畫面上＝null）
  async ptView(host, sp, o = {}) {
    if (!host || !sp) return null;
    let pk;
    try {
      pk = await Portraits.get(sp);
    } catch (e) {
      pk = null;
    }
    if (!pk || !host.isConnected) return null;
    const P = new Portrait(pk, pk.pose(o.pose) ? o.pose : pk.pose('p1') ? 'p1' : undefined);
    if (o.expr) P.setExpr(o.expr);
    const wrap = document.createElement('span');
    wrap.className = 'ptView' + (o.cls ? ' ' + o.cls : '') + (sp === 'echo' ? ' ptEcho' : '');
    const cv = document.createElement('canvas');
    const dpr = Math.min(DPR_MAX, window.devicePixelRatio || 1);
    cv.width = Math.round(o.w * dpr);
    cv.height = Math.round(o.h * dpr);
    cv.style.width = o.w + 'px';
    cv.style.height = o.h + 'px';
    wrap.appendChild(cv);
    if (o.replace) host.replaceWith(wrap);
    else host.appendChild(wrap);
    const v = {
      sp,
      P,
      cv,
      ctx: cv.getContext('2d'),
      wrap,
      fit: o.fit || 'bust',
      talk: o.talk,
      gl: 2 + Math.random() * 4,
    };
    if (o.still) {
      this.ptDraw(v, 0);
      return v;
    }
    (this.ptViews = this.ptViews || []).push(v);
    if (!this.ptRaf) {
      this.ptLast = performance.now();
      this.ptRaf = requestAnimationFrame(() => this.ptTick());
    }
    return v;
  },
  ptTick() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.ptLast) / 1000);
    this.ptLast = now;
    this.ptViews = (this.ptViews || []).filter((v) => v.wrap.isConnected);
    for (const v of this.ptViews) {
      // 畫面隱藏（display: none）時不畫
      if (!v.wrap.offsetParent && getComputedStyle(v.wrap).position !== 'fixed') continue;
      this.ptDraw(v, dt);
    }
    this.ptRaf = this.ptViews.length ? requestAnimationFrame(() => this.ptTick()) : 0;
  },
  ptDraw(v, dt) {
    const { P, cv, ctx } = v;
    const lv = v.talk ? v.talk() : null;
    // 有語音＝照音量；說話中但沒有語音（-1）＝模擬說話
    P.talkSim(lv === -1);
    P.update(dt, lv > 0 ? lv : 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    P.draw(ctx, cv.width, cv.height, { fit: v.fit });
    // ECHO 的「完美得不真實」：偶爾閃一格（幾條橫向錯位），「干擾」表情時一直有
    if (v.sp === 'echo' && dt > 0) {
      v.gl -= dt;
      const glitch = P.expr === 'glitch';
      if (v.gl < 0 || (glitch && Math.random() < 0.25)) {
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const h = Math.max(2, Math.round(cv.height * (0.01 + Math.random() * 0.04)));
          const y = Math.floor(Math.random() * (cv.height - h));
          const dx = Math.round((Math.random() - 0.5) * cv.width * 0.06);
          ctx.drawImage(cv, 0, y, cv.width, h, dx, y, cv.width, h);
        }
        if (v.gl < -0.08) v.gl = 3 + Math.random() * 5;
      }
    }
  },
  // 正在說的語音的音量（0～1）；sp 不是正在說的人＝0
  voiceLevel(sp) {
    const c = this.voiceCur;
    if (!c || !c.an || (sp && c.sp !== sp)) return 0;
    const a = (this.ptBuf =
      this.ptBuf && this.ptBuf.length === c.an.fftSize ? this.ptBuf : new Float32Array(c.an.fftSize));
    c.an.getFloatTimeDomainData(a);
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * a[i];
    return Math.min(1, Math.sqrt(s / a.length) * 6);
  },
  // 說話中：有這個人的語音＝音量，否則 fallback 為真時模擬說話（-1）
  ptTalk(sp, fallback) {
    const c = this.voiceCur;
    if (c && c.sp === sp && SFX.ctx && SFX.ctx.currentTime < c.end + 0.1) return this.voiceLevel(sp);
    return fallback ? -1 : null;
  },
  // 小頭像（通訊紀錄、失敗畫面的通訊）：容器裡的 .cBadge[data-sp] 換成臉
  ptBadges(root, size = 30) {
    if (!root) return;
    for (const b of root.querySelectorAll('.cBadge[data-sp]'))
      this.ptView(b, b.dataset.sp, {
        w: size,
        h: size,
        fit: 'face',
        still: true,
        replace: true,
        cls: 'ptFace',
      });
  },
});
