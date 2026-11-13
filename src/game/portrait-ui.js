// 劇情角色的立繪顯示（docs/portrait-design.md 第四節）：通訊框的胸像、簡報與劇情畫面的立繪、通訊紀錄的小頭像。
// 有立繪的角色（lib/portraits/index.js）把字母徽章換成畫布；沒有的照舊是徽章。只改外觀、各端自己顯示。
// 畫布由自己的 requestAnimationFrame 更新（選單畫面也要動），離開畫面（不在 DOM 裡）就拿掉。
import { SFX } from '../audio/audio.js';
import { lineExpr } from '../data/line-expr.js';
import { BRIEFINGS, SPEAKERS } from '../data/story.js';
import { escHtml } from '../core/html.js';
import { Portrait, Portraits, drawStationWave } from '../render/portraits.js';
import { Game } from './game.js';

const DPR_MAX = 2;
// 立繪清單先載入（插入畫面要同步知道有沒有立繪）
if (typeof document !== 'undefined') Portraits.ids();

Object.assign(Game.prototype, {
  // 把 host 換成 sp 的立繪。o：{ w, h 畫布的 CSS 尺寸, fit 'bust'／'face'／'full', pose, expr, act 一開始的動作,
  //   priv ECHO 的私人頻道（第 3 周目：不閃格）,
  //   talk() → 音量 0～1（null＝不說話）, still 只畫一次（小頭像）, cls 額外的 class, replace 取代 host（否則放進 host 裡）}
  // 回傳 Promise<view|null>（沒有立繪或 host 已經不在畫面上＝null）
  async ptView(host, sp, o = {}) {
    if (!host || !sp) return null;
    if (sp === 'station') return this.ptWaveView(host, o);
    let pk;
    // ECHO 的私人頻道：第 3 周目「真實的樣子」（echo_true，沒有時照舊用 echo）
    const id = sp === 'echo' && o.priv && (await Portraits.has('echo_true')) ? 'echo_true' : sp;
    try {
      pk = await Portraits.get(id);
    } catch (e) {
      pk = null;
    }
    if (!pk || !host.isConnected) return null;
    const P = new Portrait(pk, this.ptPose(id, o.expr, o.pose));
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
      id,
      kind: o.pose,
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
  // 軌道站（機械語音，不畫臉）：同樣的畫布與更新，畫的是聲波（render/portraits.js 的 drawStationWave）
  ptWaveView(host, o) {
    if (!host.isConnected) return null;
    const wrap = document.createElement('span');
    wrap.className = 'ptView ptWave' + (o.cls ? ' ' + o.cls : '');
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
      sp: 'station',
      id: 'station',
      wave: true,
      cv,
      ctx: cv.getContext('2d'),
      wrap,
      talk: o.talk,
      t: 0,
      lv: 0,
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
    if (v.wave) {
      // 有語音＝照音量；說話中但沒有語音＝模擬起伏；不說話＝慢慢歸零
      const raw = v.talk ? v.talk() : null;
      v.t += dt;
      const want =
        raw === -1 ? 0.35 + 0.35 * Math.abs(Math.sin(v.t * 7.3) * Math.sin(v.t * 2.9)) : raw > 0 ? raw : 0;
      v.lv += (want - v.lv) * Math.min(1, dt * 14);
      drawStationWave(v.ctx, v.cv.width, v.cv.height, v.t, v.lv);
      return;
    }
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
  // 依表情挑姿勢：ECHO 專注的句子＝管制台 p4；真實的樣子的悲傷、猶豫、困惑＝坦白 p3；其他＝指定的（通訊框 p2）或 p1。
  // 角色沒有那個姿勢時播放器退回第一個姿勢
  ptPose(id, expr, want) {
    if (id === 'echo' && expr === 'focus') return 'p4';
    if (id === 'echo_true' && ['sad', 'hesitate', 'puzzled'].includes(expr)) return 'p3';
    return want || 'p1';
  },
  // 換表情（同時依表情換姿勢、做動作）
  ptSetExpr(v, x) {
    if (!v || !x) return;
    v.P.setPose(this.ptPose(v.id, x.e, v.kind));
    v.P.setExpr(x.e);
    if (x.a) v.P.act(x.a);
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
    if (sp === 'station') {
      const cv = document.createElement('canvas');
      cv.width = cv.height = size * 2;
      drawStationWave(cv.getContext('2d'), cv.width, cv.height, 1.3, 0.45);
      return (C[k] = cv.toDataURL('image/png'));
    }
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
  // 插入畫面（機戰式，docs/portrait-design.md 第 5 期）：斜的色帶＋胸像滑入＋名字與一句台詞，約 2 秒、不暫停。
  // o：{ tag 小標, name 名字（預設＝說話者）, line 台詞, expr, color, side 'r'／'l' }。設定 ctrl.cutin 'off'、
  // 過場動畫、地圖預覽器、沒有立繪＝不顯示（回傳 false，呼叫端照原本的畫面）。後來的取代前一個
  ptCutIn(sp, o = {}) {
    if ((this.ctrl && this.ctrl.cutin) === 'off' || this.cine || this.mapv || !sp) return false;
    const S = SPEAKERS[sp] || {};
    const ui = document.getElementById('ui');
    if (!ui || !Portraits.known(sp)) return false;
    const old = document.getElementById('ptCut');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'ptCut';
    el.className = 'side' + (o.side === 'l' ? 'L' : 'R');
    el.style.setProperty('--c', o.color || S.color || '#7fc8ff');
    const nm = o.name || S.name || sp;
    el.innerHTML =
      `<div class="ptcBand"></div><span class="ptcHost"></span><div class="ptcTxt">` +
      (o.tag ? `<small>${escHtml(o.tag)}</small>` : '') +
      `<b>${escHtml(nm)}</b>` +
      (o.line ? `<p>${escHtml(o.line)}</p>` : '') +
      `</div>`;
    ui.appendChild(el);
    const small = innerHeight < 540;
    const t0 = performance.now();
    this.ptView(el.querySelector('.ptcHost'), sp, {
      w: small ? 150 : 250,
      h: small ? 170 : 290,
      fit: 'bust',
      expr: o.expr,
      act: o.act || 'lean',
      cls: 'ptComm ptCutV',
      // 台詞的語音在唸就對口型，沒有語音時前 1.2 秒模擬說話
      talk: () => this.ptTalk(sp, !!o.line && performance.now() - t0 < 1200),
    });
    clearTimeout(this.ptCutTo);
    this.ptCutTo = setTimeout(() => el.classList.add('out'), 1900);
    setTimeout(() => el.remove(), 2400);
    return true;
  },
  // 宿敵 AC 的通訊（segStart 的登場、aceDown 的擊破）：第一句宿敵自己說的台詞做插入畫面
  ptCutInAce(e, event) {
    const ace = e && e.ace;
    if (!ace || typeof ace !== 'string') return;
    const ln = e.lines.find(([sp]) => sp === ace);
    if (!ln) return;
    const down = event === 'aceDown';
    const x = lineExpr(ln[1], { ev: event, sp: ace });
    this.ptCutIn(ace, {
      tag: down ? 'DEFEATED — 擊破' : 'RIVAL — 宿敵',
      line: ln[1],
      expr: x.e || (down ? 'sad' : 'angry'),
      act: down ? 'back' : x.a,
      side: down ? 'l' : 'r',
    });
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
