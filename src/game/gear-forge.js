// Game：零件品級的升階與重骰（docs/gear-rarity-design.md 第 1、6 節）——機甲庫的背包頁與小卡片。
// 升階：標準→改良→精製→特製，每升一級多一條詞條；精製升特製時 2 條數值詞條換成 2 條進階詞條（data/gear-adv.js）。
// 重骰（暗黑 4）：第一次選定一條之後只能重骰那一條，每次給 2 個候選＋保留原本，每重骰一次就變貴。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { AX_N, GEAR_CAT, GRADES, axText, gearPart, newUid, rollAx } from '../data/gear.js';
import { MATS } from '../data/tune.js';
import { Game } from './game.js';

// 升到 q 級的費用
const ASCEND = [
  null,
  { coam: 3000, alloy: 3 },
  { coam: 9000, alloy: 5, circuit: 2 },
  { coam: 24000, alloy: 8, circuit: 4, core: 2 },
];
const rerollCost = (n) => ({ coam: Math.round((2000 * Math.pow(1.5, n || 0)) / 100) * 100, circuit: 1 });
const costTxt = (c) =>
  [
    `${c.coam.toLocaleString()} C`,
    ...Object.keys(MATS)
      .filter((k) => c[k])
      .map((k) => `${MATS[k].name}×${c[k]}`),
  ].join('＋');

Object.assign(Game.prototype, {
  forgePay(c) {
    if (!this.tuneAfford(c)) {
      this.flashMsg('COAM 或素材不足', 0xff4d4d, 1.2);
      return false;
    }
    const S = this.save;
    S.coam -= c.coam;
    for (const m of Object.keys(MATS)) if (c[m]) S.mats[m] -= c[m];
    return true;
  },
  // 背包頁每一列的按鈕
  forgeBtnsHtml(g) {
    let h = '';
    if (g.q < 3) {
      const c = ASCEND[g.q + 1];
      h += `<button class="fgAsc" data-u="${g.u}"${this.tuneAfford(c) ? '' : ' disabled'} title="多一條詞條${g.q === 2 ? '；數值詞條換成進階詞條，並得到專屬詞條' : ''}">升階→${GRADES[g.q + 1].n}（${escHtml(costTxt(c))}）</button>`;
    }
    if (g.ax.length) {
      const c = rerollCost(g.rr && g.rr.n);
      h += `<button class="fgRr" data-u="${g.u}"${this.tuneAfford(c) ? '' : ' disabled'}>重骰（${escHtml(costTxt(c))}）</button>`;
    }
    return h;
  },
  forgeBind(box, after) {
    for (const b of box.querySelectorAll('.fgAsc')) b.onclick = () => this.forgeAscendAsk(b.dataset.u, after);
    for (const b of box.querySelectorAll('.fgRr')) b.onclick = () => this.forgeRerollOpen(b.dataset.u, after);
  },
  // 標準版升階：做出一件改良（小卡片的按鈕）
  forgeStdHtml(id) {
    const c = ASCEND[1];
    return `<button class="fgStd" data-id="${id}"${this.tuneAfford(c) ? '' : ' disabled'}>標準版升階→改良（${escHtml(costTxt(c))}）</button>`;
  },
  forgeStdBind(tip) {
    const b = tip.querySelector('.fgStd');
    if (!b) return;
    b.onclick = () => {
      const id = b.dataset.id;
      if (this.invFull()) return this.flashMsg('背包已滿', 0xff4d4d, 1.4);
      if (!this.forgePay(ASCEND[1])) return;
      const g = { u: newUid(), id, q: 0, ax: [] };
      this.forgeUp(g);
      this.invAdd(g, { force: true });
      delete g.nw;
      this.gearEquip(this.garageSlot, id, g.u);
      this.flashMsg(`升階：改良・${gearPart(id).name}`, 0x5fd38a, 1.6);
    };
  },
  // 升一級（不扣費用）：多抽一條；精製→特製時數值詞條換成進階詞條
  forgeUp(g) {
    const cat = GEAR_CAT.get(g.id),
      p = gearPart(g.id);
    g.q++;
    if (g.q === 3) {
      g.ax = [];
      delete g.rr; // 重骰鎖定的那一條不在了
    }
    while (g.ax.length < AX_N[g.q]) {
      const a = rollAx(
        cat,
        p,
        g.q >= 3,
        Math.random,
        g.ax.map((x) => x[0]),
      );
      if (!a) break;
      g.ax.push(a);
    }
  },
  forgeAscendAsk(u, after) {
    const g = this.gearByU(u);
    if (!g || g.q >= 3) return;
    const c = ASCEND[g.q + 1];
    const p = gearPart(g.id);
    const warn =
      g.q === 2 ? '（2 條數值詞條會換成 2 條新的進階詞條，並得到這個零件的專屬詞條）' : '（多一條數值詞條）';
    this.uiConfirm(
      `把「${GRADES[g.q].n}」${p.name} 升階成「${GRADES[g.q + 1].n}」？${warn}\n費用：${costTxt(c)}`,
      () => {
        if (!this.forgePay(c)) return;
        this.forgeUp(g);
        this.writeSave();
        SFX.cue('pickup');
        this.flashMsg(`升階：${GRADES[g.q].n}・${p.name}`, parseInt(GRADES[g.q].c.slice(1), 16), 1.8);
        this.renderGarage();
        if (after) after();
      },
      '升階',
      '取消',
    );
  },
  // ---------- 重骰 ----------
  forgeRerollOpen(u, after) {
    const g = this.gearByU(u);
    if (!g || !g.ax.length) return;
    this.forgeCur = { u, after, step: g.rr && g.rr.k ? 'roll' : 'pick', k: g.rr && g.rr.k };
    this.forgeRender();
  },
  forgeRender() {
    const c = this.forgeCur;
    const g = c && this.gearByU(c.u);
    let box = document.getElementById('forgeBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'forgeBox';
      document.getElementById('garage').appendChild(box);
    }
    if (!g) return box.classList.remove('on');
    const p = gearPart(g.id);
    const cost = rerollCost(g.rr && g.rr.n);
    let body = '';
    if (c.step === 'pick') {
      body = `<div class="dim">選一條重骰。選定之後，這一件只能重骰同一條。</div>${g.ax
        .map((a) => `<button class="fgLine" data-k="${a[0]}">${escHtml(axText(a))}</button>`)
        .join('')}`;
    } else {
      const cur = g.ax.find((a) => a[0] === c.k);
      if (!c.opts) {
        // 兩個候選：同一個詞條池（不和其他條重複；可以抽到同一條、數值重抽）
        const cat = GEAR_CAT.get(g.id);
        const except = g.ax.filter((a) => a[0] !== c.k).map((a) => a[0]);
        c.opts = [];
        for (let i = 0; i < 2; i++) {
          const a = rollAx(cat, p, g.q >= 3, Math.random, except);
          if (a) c.opts.push(a);
        }
      }
      body = `<div class="dim">重骰「${escHtml(cur ? axText(cur) : c.k)}」：選一個（花費 ${escHtml(costTxt(cost))}，選了才扣）</div>${c.opts
        .map(
          (a, i) =>
            `<button class="fgOpt" data-i="${i}"${this.tuneAfford(cost) ? '' : ' disabled'}>${escHtml(axText(a))}</button>`,
        )
        .join('')}<button class="fgKeep">保留原本（不花費）</button>`;
    }
    box.innerHTML = `<div class="fgH">${this.gearTag(g)}<b>${escHtml(p.name)}</b><span class="dim">重骰 ${(g.rr && g.rr.n) || 0} 次</span></div>${body}<div class="fgA"><button class="fgClose">關閉</button></div>`;
    box.classList.add('on');
    for (const b of box.querySelectorAll('.fgLine'))
      b.onclick = () => {
        SFX.ui();
        c.k = b.dataset.k;
        c.step = 'roll';
        this.forgeRender();
      };
    for (const b of box.querySelectorAll('.fgOpt'))
      b.onclick = () => {
        if (!this.forgePay(cost)) return;
        const a = c.opts[Number(b.dataset.i)];
        const i = g.ax.findIndex((x) => x[0] === c.k);
        if (i >= 0) g.ax[i] = a;
        g.rr = { k: a[0], n: ((g.rr && g.rr.n) || 0) + 1 };
        c.k = a[0];
        c.opts = null;
        this.writeSave();
        SFX.cue('pickup');
        this.flashMsg(`重骰：${axText(a)}`, 0x7fc8ff, 1.6);
        this.forgeDone();
      };
    const kp = box.querySelector('.fgKeep');
    if (kp)
      kp.onclick = () => {
        SFX.ui();
        // 保留原本也算選定了這一條（之後只能重骰它）
        if (!g.rr) g.rr = { k: c.k, n: 0 };
        this.writeSave();
        this.forgeDone();
      };
    box.querySelector('.fgClose').onclick = () => {
      SFX.ui();
      this.forgeDone();
    };
  },
  forgeDone() {
    const c = this.forgeCur;
    this.forgeCur = null;
    const box = document.getElementById('forgeBox');
    if (box) box.classList.remove('on');
    this.renderGarage();
    if (c && c.after) c.after();
  },
});
