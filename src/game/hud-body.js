// Game：HUD 的顯示模式「機體周邊」（設定 ctrl.hudMode＝body；docs/zzz-ui-design.md 的「HUD 精簡」）
// 俯視時把 AP／EN／BAL 畫成機體旁的弧線、四把武器的彈數畫在機體兩側，角落的狀態欄與武器卡片收起
// （只留任務資訊一行與消耗品）。追尾、第一人稱、空域照精簡的版面（準星旁本來就有彈數）。
import { clamp } from '../core/math.js';
import { usesAmmo } from '../data/parts.js';
import { Game } from './game.js';

const R_MIN = 46, // 弧線的半徑（像素）：機體在畫面上的大小＋間距，夾在這個範圍
  R_MAX = 150,
  R_PAD = 22;
const DEG = Math.PI / 180;
const FONT = 'Rubik, Noto Sans TC';

Object.assign(Game.prototype, {
  // 這一格是不是用機體周邊的 HUD（hud.js 每 16 格寫到 body[data-hudbody]，CSS 依它收起角落的面板）
  hudBodyOn() {
    return (
      this.ctrl.hudMode === 'body' &&
      !this.chase &&
      !this.fp &&
      !this.airMode &&
      !this.spectator &&
      !!this.player &&
      !this.player.dead
    );
  },
  // 一段弧：底（暗）＋值。a0→a1 順時針（canvas 的角度），k＝0～1
  hbArc(c, x, y, r, a0, a1, k, w, col, rev) {
    c.lineCap = 'butt';
    c.lineWidth = w + 2.5;
    c.strokeStyle = 'rgba(0,0,0,.5)';
    c.beginPath();
    c.arc(x, y, r, a0, a1);
    c.stroke();
    c.lineWidth = w;
    c.strokeStyle = 'rgba(255,255,255,.14)';
    c.beginPath();
    c.arc(x, y, r, a0, a1);
    c.stroke();
    if (k <= 0) return;
    c.strokeStyle = col;
    c.beginPath();
    if (rev) c.arc(x, y, r, a1 - (a1 - a0) * k, a1);
    else c.arc(x, y, r, a0, a0 + (a1 - a0) * k);
    c.stroke();
  },
  hbText(c, txt, x, y, font, col, al) {
    c.font = font;
    c.textAlign = al;
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0,0,0,.75)';
    c.strokeText(txt, x, y);
    c.fillStyle = col;
    c.fillText(txt, x, y);
  },
  bodyHud(c, p, W, H) {
    if (!this.hudBodyOn()) return;
    const b = this.popBox(p);
    if (!b) return;
    const small = H < 540;
    const cx = b.cx,
      cy = (b.top + b.bot) / 2;
    const r = clamp(Math.max(b.w, (b.bot - b.top) / 2) + R_PAD, R_MIN, small ? 96 : R_MAX);
    c.save();
    c.textBaseline = 'alphabetic';
    // 左側：AP（由下往上；30% 以下變紅），外圈細的＝結構損傷看不到的部分不畫
    const hp = clamp(p.hp / (p.maxHp || 1), 0, 1);
    const hpCol = hp < 0.3 ? '#ff4d4d' : hp < 0.6 ? '#ffd21a' : '#7ee081';
    this.hbArc(c, cx, cy, r, 125 * DEG, 235 * DEG, hp, 5, hpCol, true);
    // 右側：EN（由下往上）、內圈 BAL（有累積時才畫）
    const en = clamp(p.en / (p.enMax || 1), 0, 1);
    this.hbArc(c, cx, cy, r, -55 * DEG, 55 * DEG, en, 4, en < 0.25 ? '#ff5a5a' : '#59c8ff', true);
    const acs = clamp(p.acs / (p.acsMax || 1), 0, 1);
    if (acs > 0.01 || p.staggerT > 0)
      this.hbArc(
        c,
        cx,
        cy,
        r - 8,
        -40 * DEG,
        40 * DEG,
        p.staggerT > 0 ? 1 : acs,
        3,
        p.staggerT > 0 ? '#ff4d4d' : p.stagGuardT > 0 ? '#6fb8ff' : acs > 0.75 ? '#ff7a3a' : '#ffb020',
        true,
      );
    // 破甲充能（Boss 戰；boss-tier.js 寫在 #bkBar）：下方的短弧
    const bk = document.getElementById('bkWrap');
    if (bk && bk.style.display !== 'none') {
      const f = clamp(parseFloat(document.getElementById('bkBar').style.width) / 100 || 0, 0, 1);
      this.hbArc(c, cx, cy, r, 70 * DEG, 110 * DEG, f, 3, f >= 1 ? '#ff90ff' : '#d070ff', false);
    }
    // AP 的數字與修復套件：AP 弧的左下
    const fs = small ? 10 : 11.5;
    const ax = cx + Math.cos(125 * DEG) * (r + 4),
      ay = cy + Math.sin(125 * DEG) * (r + 4) + 12;
    this.hbText(c, String(Math.max(0, Math.round(p.hp))), ax, ay, `800 ${fs}px ${FONT}`, hpCol, 'right');
    const kits = p.kits || 0,
      km = Math.max(kits, p.kitsMax || 3);
    for (let i = 0; i < km; i++) {
      const kx = ax - 4 - i * 7,
        ky = ay + 5;
      c.fillStyle = 'rgba(0,0,0,.6)';
      c.fillRect(kx - 5, ky - 1, 6, 8);
      c.fillStyle = i < kits ? '#c8f03c' : 'rgba(255,255,255,.22)';
      c.fillRect(kx - 4, ky, 4, 6);
    }
    // 四把武器：左右手在下方兩側、背部在上方兩側（和追尾視角準星旁的排法一樣）
    const slot = (s, ang, al) => {
      const wp = p.weapons[s];
      if (!wp || !wp.def || wp.def.type === 'none') return;
      const d = wp.def;
      const x = cx + Math.cos(ang) * (r + 12),
        y = cy + Math.sin(ang) * (r + 12) + 4;
      let txt;
      if (d.type === 'melee') txt = p.melee.active && p.melee.slot === s ? `連 ${p.melee.stage + 1}` : '近戰';
      else if (d.type === 'shield') txt = '盾';
      else if (d.type === 'emp') txt = wp.cd > 0 ? Math.ceil(wp.cd) + 's' : '就緒';
      else if (d.type === 'empbeam') txt = p.empLock ? '過載' : 'EN';
      else if (!usesAmmo(d))
        txt = wp.charging ? Math.round(clamp(wp.charge / (d.chargeT || 1), 0, 1) * 100) + '%' : '∞';
      else txt = wp.reloadT > 0 ? '裝填' : String(wp.mag);
      const out = usesAmmo(d) && wp.ammo <= 0 && wp.mag <= 0;
      const low = usesAmmo(d) && wp.reloadT <= 0 && wp.mag <= Math.max(1, (d.mag || 0) * 0.25);
      const col = out ? '#ff5a5a' : wp.reloadT > 0 ? '#ffb020' : low ? '#ffd21a' : '#f2f2ee';
      this.hbText(c, txt, x, y, `800 ${small ? 12 : 14}px ${FONT}`, col, al);
      if (usesAmmo(d) && !small) {
        const tw = c.measureText(txt).width;
        this.hbText(
          c,
          '×' + wp.ammo,
          al === 'right' ? x - tw - 4 : x + tw + 4,
          y,
          `700 9.5px ${FONT}`,
          'rgba(235,235,230,.7)',
          al,
        );
      }
      const k =
        wp.reloadT > 0 ? 1 - wp.reloadT / (d.reload || 1) : wp.cd > 0 && d.rof > 0.25 ? 1 - wp.cd / d.rof : 1;
      if (k < 1) {
        const bw = 40,
          x0 = al === 'right' ? x - bw : x;
        c.fillStyle = 'rgba(0,0,0,.55)';
        c.fillRect(x0 - 1, y + 3, bw + 2, 5);
        c.fillStyle = '#c8f03c';
        c.fillRect(x0, y + 4, bw * clamp(k, 0, 1), 3);
      }
      // 強力彈充滿：小菱形
      if (wp.pwReady || (wp.pwc || 0) >= 1) {
        const dx = al === 'right' ? x + 7 : x - 7;
        c.fillStyle = '#7fe8ff';
        c.beginPath();
        c.moveTo(dx, y - 9);
        c.lineTo(dx + 4, y - 5);
        c.lineTo(dx, y - 1);
        c.lineTo(dx - 4, y - 5);
        c.closePath();
        c.fill();
      }
    };
    slot('lback', 208 * DEG, 'right');
    slot('larm', 152 * DEG, 'right');
    slot('rback', -28 * DEG, 'left');
    slot('rarm', 28 * DEG, 'left');
    c.restore();
  },
});
