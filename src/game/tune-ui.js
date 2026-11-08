// Game：機甲庫的零件調校（主線擴充 E2，data/tune.js、docs/campaign-expansion-design.md）——零件小卡片的「調校」按鈕開啟
// #tuneBox：每個項目的級數、效果、費用（COAM＋素材），升級、重置（退還一半）。存在 save.tune[零件 id]（同一種零件全部一樣）。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { partById } from '../data/parts.js';
import { MATS, TUNE, TUNE_MAX, TUNE_TOTAL, tuneCost, tuneGroup } from '../data/tune.js';
import { Game } from './game.js';

const costTxt = (c) =>
  [
    `${c.coam.toLocaleString()} C`,
    ...Object.keys(MATS)
      .filter((k) => c[k])
      .map((k) => `${MATS[k].name}×${c[k]}`),
  ].join('＋');

Object.assign(Game.prototype, {
  // 這個零件已經調了幾級（小卡片的標示）
  tuneSum(id) {
    const t = (this.save.tune || {})[id];
    return t ? Object.values(t).reduce((a, b) => a + b, 0) : 0;
  },
  tuneOpen(cat, id) {
    const p = partById(cat, id);
    const g = tuneGroup(cat, p);
    if (!g) return;
    this.tuneCur = { cat, id };
    let box = document.getElementById('tuneBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tuneBox';
      document.getElementById('garage').appendChild(box);
    }
    const S = this.save;
    const t = (S.tune || {})[id] || {};
    const sum = this.tuneSum(id);
    const rows = TUNE[g]
      .map((o) => {
        const lv = t[o.k] || 0;
        const next = lv < TUNE_MAX && sum < TUNE_TOTAL ? tuneCost(lv + 1) : null;
        const can = next && this.tuneAfford(next);
        const pips = Array.from({ length: TUNE_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join(
          '',
        );
        return `<div class="tuRow"><div class="tuN"><b>${escHtml(o.name)}</b><span class="dim">${escHtml(o.desc)}</span></div><div class="tuP">${pips}</div><button class="tuUp" data-k="${o.k}"${can ? '' : ' disabled'}>${next ? `升級（${escHtml(costTxt(next))}）` : lv >= TUNE_MAX ? '已到最高' : '已到上限'}</button></div>`;
      })
      .join('');
    box.innerHTML = `<div class="tuH"><b>調校：${escHtml(p.name)}</b><span class="dim">全部項目合計最多 ${TUNE_TOTAL} 級（目前 ${sum}）・同一種零件共用</span></div><div class="tuMats">COAM ${S.coam.toLocaleString()}　${this.lootMatsHtml()}</div>${rows}<div class="tuA"><button class="tuReset"${sum ? '' : ' disabled'}>重置（退還一半）</button><button class="tuClose">關閉</button></div>`;
    box.classList.add('on');
    for (const b of box.querySelectorAll('.tuUp')) b.onclick = () => this.tuneUp(id, g, b.dataset.k);
    box.querySelector('.tuReset').onclick = () =>
      this.uiConfirm(
        '重置這個零件的調校？花費的 COAM 與素材退還一半。',
        () => this.tuneReset(id),
        '重置',
        '取消',
      );
    box.querySelector('.tuClose').onclick = () => this.tuneClose();
  },
  tuneClose() {
    const box = document.getElementById('tuneBox');
    if (box) box.classList.remove('on');
    this.tuneCur = null;
    SFX.ui();
  },
  tuneAfford(c) {
    const S = this.save,
      M = S.mats || {};
    return S.coam >= c.coam && Object.keys(MATS).every((k) => (M[k] || 0) >= (c[k] || 0));
  },
  tuneUp(id, g, k) {
    const S = this.save;
    S.tune = S.tune || {};
    const t = S.tune[id] || (S.tune[id] = {});
    const lv = t[k] || 0;
    if (lv >= TUNE_MAX || this.tuneSum(id) >= TUNE_TOTAL) return;
    const c = tuneCost(lv + 1);
    if (!this.tuneAfford(c)) return this.flashMsg('COAM 或素材不足', 0xff4d4d, 1.2);
    S.coam -= c.coam;
    for (const m of Object.keys(MATS)) if (c[m]) S.mats[m] -= c[m];
    t[k] = lv + 1;
    this.writeSave();
    SFX.cue('pickup');
    const o = TUNE[g].find((x) => x.k === k);
    this.flashMsg(`調校：${o.name} Lv${lv + 1}`, 0x7ee081, 1.4);
    this.renderGarage();
    this.tuneOpen(this.tuneCur.cat, id);
  },
  // 重置：退還一半（COAM 與素材都是）
  tuneReset(id) {
    const S = this.save,
      t = (S.tune || {})[id];
    if (!t) return;
    const back = { coam: 0 };
    for (const k in t)
      for (let lv = 1; lv <= t[k]; lv++) {
        const c = tuneCost(lv);
        for (const m in c) back[m] = (back[m] || 0) + c[m];
      }
    S.coam += Math.floor(back.coam / 2);
    for (const m of Object.keys(MATS)) if (back[m]) S.mats[m] = (S.mats[m] || 0) + Math.floor(back[m] / 2);
    delete S.tune[id];
    this.writeSave();
    this.flashMsg('調校已重置', 0x7fc8ff, 1.2);
    this.renderGarage();
    if (this.tuneCur) this.tuneOpen(this.tuneCur.cat, id);
  },
});
