// 劇情角色的立繪顯示（docs/portrait-design.md 第四節）：通訊框的胸像、簡報與劇情畫面的立繪、通訊紀錄的小頭像。
// 有立繪的角色（lib/portraits/index.js）把字母徽章換成畫布；沒有的照舊是徽章。只改外觀、各端自己顯示。
// 畫布由自己的 requestAnimationFrame 更新（選單畫面也要動），離開畫面（不在 DOM 裡）就拿掉。
import { SFX } from '../audio/audio.js';
import { lineExpr } from '../data/line-expr.js';
import { BRIEFINGS } from '../data/story.js';
import { Portrait, Portraits } from '../render/portraits.js';
import { Game } from './game.js';

const DPR_MAX = 2;

Object.assign(Game.prototype, {
  // 把 host 換成 sp 的立繪。o：{ w, h 畫布的 CSS 尺寸, fit 'bust'／'face'／'full', pose, expr, act 一開始的動作,
  //   priv ECHO 的私人頻道（第 3 周目：不閃格）,
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
    if (o.act) P.act(o.act);
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
      priv: !!o.priv,
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
    if (v.sp === 'echo' && dt > 0) this.ptGlitch(v, dt);
  },
  // ECHO 依周目的外觀（docs/portrait-design.md 第 6 期）：第 1 周目＝偶爾閃一格（幾條橫向錯位）；第 2 周目＝閃得更頻繁、
  // 錯位更大，偶爾變成全像的線框（淡藍的掃描線蓋過去）；第 3 周目的私人頻道＝真實的樣子，不閃。「干擾」表情一律一直閃
  ptGlitch(v, dt) {
    const { P, cv, ctx } = v;
    const lv = v.priv ? 0 : this.ptCycle();
    const glitch = P.expr === 'glitch';
    if (!lv && !glitch) return;
    v.gl -= dt;
    if (!(v.gl < 0 || (glitch && Math.random() < 0.25))) return;
    const hi = lv >= 2;
    const n = (hi ? 3 : 2) + Math.floor(Math.random() * (hi ? 5 : 3));
    for (let i = 0; i < n; i++) {
      const h = Math.max(2, Math.round(cv.height * (0.01 + Math.random() * 0.04)));
      const y = Math.floor(Math.random() * (cv.height - h));
      const dx = Math.round((Math.random() - 0.5) * cv.width * (hi ? 0.11 : 0.06));
      ctx.drawImage(cv, 0, y, cv.width, h, dx, y, cv.width, h);
    }
    // 第 2 周目：全像線框（只蓋在人物上）
    if (hi && (v.wire || (v.gl < 0 && Math.random() < 0.35))) {
      v.wire = v.wire || 0.12;
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(70, 170, 255, 0.55)';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = 'rgba(200, 240, 255, 0.5)';
      const st = Math.max(3, Math.round(cv.height / 90));
      for (let y = (performance.now() / 30) % st; y < cv.height; y += st) ctx.fillRect(0, y, cv.width, 1);
      ctx.restore();
    }
    if (v.gl < -0.08) {
      v.gl = hi ? 0.8 + Math.random() * 2.2 : 3 + Math.random() * 5;
      v.wire = 0; // 這一次閃格結束
    }
  },
  // 台詞的表情與動作（data/line-expr.js；ev＝通訊事件）
  ptLineExpr(text, ev) {
    return lineExpr(text, { ev });
  },
  // ECHO 的私人頻道：ECHO 的私人委託（第 3 周目的金色委託）出擊中
  ptPriv() {
    const c = this.camp;
    return !!(c && c.sid && BRIEFINGS[c.sid] && BRIEFINGS[c.sid].client === 'echo');
  },
  // 目前的周目（主線的存檔；沒有＝1）
  ptCycle() {
    const st = this.save && this.save.story;
    return Math.max(1, Math.min(3, (st && st.cycle) || 1));
  },
  // 一張靜態的臉（data URL，依說話者、表情、大小快取）：字幕條這種會一直重畫的地方用 <img>
  ptFaceUrl(sp, expr, size = 28) {
    const k = sp + '|' + (expr || '') + '|' + size;
    const C = (this.ptFaces = this.ptFaces || {});
    if (k in C) return C[k];
    C[k] = null;
    Portraits.get(sp).then((pk) => {
      if (!pk) return;
      const P = new Portrait(pk, 'p1');
      if (expr) P.setExpr(expr);
      const cv = document.createElement('canvas');
      cv.width = cv.height = size * 2;
      P.draw(cv.getContext('2d'), cv.width, cv.height, { fit: 'face' });
      C[k] = cv.toDataURL('image/png');
      if (this.ptFaceReady) this.ptFaceReady();
    });
    return null;
  },
  // 給自己畫的地方（過場的通訊視窗）用的播放器：第一次呼叫開始載入，之前回傳 null
  ptPlayer(sp, pose) {
    const C = (this.ptPlayers = this.ptPlayers || {});
    const k = sp + '|' + pose;
    if (k in C) return C[k];
    C[k] = null;
    Portraits.get(sp).then((pk) => {
      if (pk) C[k] = new Portrait(pk, pk.pose(pose) ? pose : 'p1');
    });
    return null;
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
