// Game：機甲庫的零件調校（主線擴充 E2，data/tune.js、docs/campaign-expansion-design.md）——零件小卡片的「調校」按鈕開啟
// #tuneBox：兩個分頁。
// 「這個零件」：摘要（未調校 → 目前的實際數值）、每個項目的每級效果、Lv3 合計、下一級的實際數值、費用、升級、限界突破、重置（退還一半）；
// 游標停在升級按鈕上時機甲庫的量表預覽升這一級的差異。
// 「總覽」：身上所有可以調校的零件的每個項目，下一級對整台的火力／耐久／機動的影響，依每 1 萬 COAM 的提升排序。
// 存在 save.tune[零件 id]（同一種零件全部一樣）；數值的計算在 data/tune-view.js。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { SLOTS, partById } from '../data/parts.js';
import {
  MATS,
  TUNE,
  TUNE_BREAK,
  TUNE_MAX,
  tuneBreaks,
  tuneCap,
  tuneCost,
  tuneGroup,
  tuneLevels,
} from '../data/tune.js';
import {
  METRIC,
  TUNE_KEY,
  metricDiff,
  tuneFxList,
  tuneHasNum,
  tuneMetrics,
  tuneNum,
  tuneSlotOf,
  tuneTnOf,
  tuneValues,
} from '../data/tune-view.js';
import { Game } from './game.js';

const costTxt = (c) =>
  [
    `${c.coam.toLocaleString()} C`,
    ...Object.keys(MATS)
      .filter((k) => c[k])
      .map((k) => `${MATS[k].name}×${c[k]}`),
  ].join('＋');
const pctTxt = (v) => (v > 0 ? '+' : '−') + (Math.round(Math.abs(v) * 10) / 10).toString() + '%';
// 「a → b」：變好綠、變差紅
const arrow = (a, b, good, u = '') => {
  const d = b - a;
  const cls = Math.abs(d) < 1e-9 ? '' : d * good > 0 ? 'up' : 'dn';
  return `${tuneNum(a, u)} → <b class="${cls}">${tuneNum(b, u)}</b>`;
};
const SORTS = [
  ['fire', '火力'],
  ['tough', '耐久'],
  ['mob', '機動'],
];
const GROUP_NOTE = {
  frame: '頭部、核心、手臂、腳部的調校都加在整台機體上：調哪一個零件效果相同，各自的上限分開算。',
  booster: '推進器的調校改的是 QB 的速度與消耗。',
  generator: '發電機的調校改的是整台的 EN 容量與回復。',
  fcs: '火控的調校改的是整台的鎖定距離。',
};

Object.assign(Game.prototype, {
  // 這個零件已經調了幾級（小卡片的標示）
  tuneSum(id) {
    return tuneLevels((this.save.tune || {})[id]);
  },
  // view：'part'（這個零件）／'ov'（總覽）；沒給時沿用上次的分頁
  tuneOpen(cat, id, view) {
    const p = partById(cat, id);
    if (!tuneGroup(cat, p)) return;
    const prev = this.tuneCur;
    this.tuneCur = {
      cat,
      id,
      view: view || (prev && prev.view) || 'part',
      sort: (prev && prev.sort) || 'fire',
    };
    this.tuneRender();
  },
  tuneRender() {
    const c = this.tuneCur;
    if (!c) return;
    this.tunePreview(null); // 重畫時按鈕換掉了，收不到離開事件：先取消量表的預覽
    let box = document.getElementById('tuneBox');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tuneBox';
      document.getElementById('garage').appendChild(box);
    }
    const p = partById(c.cat, c.id);
    const S = this.save;
    const tabs = `<div class="tuTabs" data-padtabs="button"><button class="tuTab${c.view === 'part' ? ' on' : ''}" data-v="part">這個零件：${escHtml(p.name)}</button><button class="tuTab${c.view === 'ov' ? ' on' : ''}" data-v="ov">總覽（身上的零件）</button></div>`;
    const mats = `<div class="tuMats">COAM ${S.coam.toLocaleString()}　${this.lootMatsHtml()}</div>`;
    const pmOn = this.rangePmOn();
    const note = `<div class="tuNote dim">調校只在裝備時有效・同一種零件共用・PvP 不套用${pmOn ? '・數值含駕駛員加成' : ''}</div>`;
    const body = c.view === 'ov' ? this.tuneOvHtml() : this.tunePartHtml(c.cat, c.id);
    box.innerHTML = `${tabs}${mats}${note}${body}<div class="tuA">${c.view === 'part' ? `<button class="tuReset"${this.tuneSum(c.id) ? '' : ' disabled'}>重置（退還一半）</button>` : ''}<button class="tuClose">關閉</button></div>`;
    box.classList.add('on');
    for (const b of box.querySelectorAll('.tuTab'))
      b.onclick = () => {
        SFX.ui();
        c.view = b.dataset.v;
        this.tuneRender();
      };
    for (const b of box.querySelectorAll('.tuSort'))
      b.onclick = () => {
        SFX.ui();
        c.sort = b.dataset.s;
        this.tuneRender();
      };
    for (const b of box.querySelectorAll('.tuUp')) {
      const id = b.dataset.id || c.id;
      const cat = b.dataset.cat || c.cat;
      b.onclick = () => this.tuneUp(id, tuneGroup(cat, partById(cat, id)), b.dataset.k);
      // 游標停在升級按鈕上（手把的焦點也算）：量表預覽升這一級（只有裝備中的零件）
      const on = () => this.tunePreview(id, b.dataset.k);
      const off = () => this.tunePreview(null);
      b.onpointerenter = on;
      b.onpointerleave = off;
      b.onfocus = on;
      b.onblur = off;
    }
    for (const b of box.querySelectorAll('.tuOpen'))
      b.onclick = () => {
        SFX.ui();
        this.tuneOpen(b.dataset.cat, b.dataset.id, 'part');
      };
    const bk = box.querySelector('.tuBreak');
    if (bk) bk.onclick = () => this.tuneBreak(c.id);
    const rs = box.querySelector('.tuReset');
    if (rs)
      rs.onclick = () =>
        this.uiConfirm(
          '重置這個零件的調校？花費的 COAM 與素材退還一半。',
          () => this.tuneReset(c.id),
          '重置',
          '取消',
        );
    box.querySelector('.tuClose').onclick = () => this.tuneClose();
  },
  // ---------- 這個零件 ----------
  tunePartHtml(cat, id) {
    const S = this.save;
    const p = partById(cat, id);
    const g = tuneGroup(cat, p);
    const t = (S.tune || {})[id] || {};
    const sum = tuneLevels(t);
    const cap = tuneCap(t),
      nx = tuneBreaks(t);
    // 以裝上這個零件的組裝計算（沒裝備時換進目前選的部位）
    const key = tuneSlotOf(S.asm, cat, id, this.garageSlot);
    const asm = { ...S.asm, [key]: id };
    const pm0 = this.rangePm();
    const val = (tt) => tuneValues(asm, cat, id, tuneTnOf(asm, S.tune, { [id]: tt }), pm0);
    const V0 = val({}),
      Vc = val(t);
    const isW = !!Vc.d;
    // 摘要：未調校 → 目前
    const keys = [];
    for (const o of TUNE[g]) for (const k in o.fx) if (!keys.includes(k)) keys.push(k);
    const sRows = [];
    if (isW && V0.dps) sRows.push(['持續 DPS', V0.dps, Vc.dps, 1, '']);
    for (const k of keys) {
      const K = TUNE_KEY[k];
      const a = K.get(V0);
      if (tuneHasNum(a)) sRows.push([K.n, a, K.get(Vc), K.good, K.u || '']);
    }
    const sumHtml = `<div class="tuSum"><div class="tuSH"><span>數值</span><span>未調校 → 目前</span><span></span></div>${sRows
      .map(([n, a, b, good, u]) => {
        const d = a ? ((b - a) / a) * 100 : 0;
        return `<div class="${Math.abs(d) < 0.05 ? 'same' : ''}"><span>${n}</span><span>${arrow(a, b, good, u)}</span><span class="${Math.abs(d) < 0.05 ? '' : d * good > 0 ? 'up' : 'dn'}">${Math.abs(d) < 0.05 ? '' : pctTxt(d)}</span></div>`;
      })
      .join('')}</div>`;
    const head = `<div class="tuH"><b>調校：${escHtml(p.name)}</b><span class="dim">全部項目合計最多 ${cap} 級（目前 ${sum}）・每一項最多 ${TUNE_MAX} 級</span>${GROUP_NOTE[g] ? `<span class="dim">${GROUP_NOTE[g]}</span>` : ''}</div>`;
    const rows = TUNE[g]
      .map((o) => {
        const lv = t[o.k] || 0;
        const next = lv < TUNE_MAX && sum < cap ? tuneCost(lv + 1) : null;
        const can = next && this.tuneAfford(next);
        const pips = Array.from({ length: TUNE_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join(
          '',
        );
        // 每級的效果；這個零件沒有那個數值時（例如導彈沒有擴散）標出無效果
        const per = tuneFxList(o.fx)
          .map((x) => {
            const na = !tuneHasNum(TUNE_KEY[x.k].get(Vc));
            return `<span class="tuFx ${na ? 'na' : x.good ? 'up' : 'dn'}">${escHtml(x.txt)}${na ? '（此零件無效果）' : ''}</span>`;
          })
          .join('');
        const l3 = tuneFxList(o.fx, TUNE_MAX)
          .filter((x) => tuneHasNum(TUNE_KEY[x.k].get(Vc)))
          .map((x) => x.txt)
          .join('　');
        // 下一級的實際數值
        let nxt = '';
        if (lv < TUNE_MAX) {
          const Vn = val({ ...t, [o.k]: lv + 1 });
          const parts = [];
          if (isW && Vc.dps && Math.abs(Vn.dps - Vc.dps) > 1e-6)
            parts.push(`持續 DPS ${arrow(Vc.dps, Vn.dps, 1)}`);
          for (const k in o.fx) {
            const K = TUNE_KEY[k];
            const a = K.get(Vc);
            if (tuneHasNum(a)) parts.push(`${K.n} ${arrow(a, K.get(Vn), K.good, K.u || '')}`);
          }
          nxt = `<div class="tuNx"><i>Lv${lv + 1}</i>${parts.join('　')}</div>`;
        }
        return `<div class="tuRow"><div class="tuN"><b>${escHtml(o.name)}　<span class="tuLv">Lv${lv}</span></b><span class="tuPer"><i>每級</i>${per}</span>${l3 ? `<span class="dim tuL3">Lv${TUNE_MAX} 合計：${escHtml(l3)}</span>` : ''}${nxt}</div><div class="tuP">${pips}</div><button class="tuUp" data-k="${o.k}"${can ? '' : ' disabled'}>${next ? `升級（${escHtml(costTxt(next))}）` : lv >= TUNE_MAX ? '已到最高' : '已到合計上限（可以限界突破）'}</button></div>`;
      })
      .join('');
    // 限界突破（傳說殘片）：合計上限 +1
    const brk = TUNE_BREAK[nx];
    const brkCan = brk && this.tuneAfford(brk);
    const brkRow = `<div class="tuRow tuBrk"><div class="tuN"><b>限界突破${nx ? `（已突破 ${nx} 次）` : ''}</b><span class="dim">用傳說殘片讓這個零件的合計上限 +1（最多 ${TUNE_BREAK.length} 次，永久、重置不退）</span></div><div class="tuP">${TUNE_BREAK.map((_, i) => `<i class="${i < nx ? 'on' : ''}"></i>`).join('')}</div><button class="tuBreak"${brkCan ? '' : ' disabled'}>${brk ? `突破（${escHtml(costTxt(brk))}）` : '已到最高'}</button></div>`;
    return `${head}${sumHtml}${rows}${brkRow}`;
  },
  // ---------- 總覽：身上的零件，下一級對整台的影響 ----------
  tuneOvList() {
    const S = this.save;
    const asm = S.asm;
    const pm0 = this.rangePm();
    const M0 = tuneMetrics(asm, tuneTnOf(asm, S.tune), pm0);
    const seen = new Set();
    const list = [],
      full = [];
    for (const [k, , cat] of SLOTS) {
      const id = asm[k];
      const p = partById(cat, id);
      const g = tuneGroup(cat, p);
      if (!g || seen.has(id) || !S.owned.includes(id)) continue;
      seen.add(id);
      const t = (S.tune || {})[id] || {};
      const sum = tuneLevels(t),
        cap = tuneCap(t);
      if (sum >= cap) {
        full.push(p.name);
        continue;
      }
      for (const o of TUNE[g]) {
        const lv = t[o.k] || 0;
        if (lv >= TUNE_MAX) continue;
        const M1 = tuneMetrics(asm, tuneTnOf(asm, S.tune, { [id]: { ...t, [o.k]: lv + 1 } }), pm0);
        const cost = tuneCost(lv + 1);
        list.push({ id, cat, p, o, lv, cost, diff: metricDiff(M0, M1) });
      }
    }
    return { list, full };
  },
  tuneOvHtml() {
    const c = this.tuneCur;
    const { list, full } = this.tuneOvList();
    const sk = c.sort;
    const per = (x) => x.diff[sk] / (x.cost.coam / 10000);
    list.sort((a, b) => per(b) - per(a));
    const sorts = `<div class="tuSorts" data-padtabs=".tuSort"><span class="dim">排序</span>${SORTS.map(([k, n]) => `<button class="tuSort${k === sk ? ' on' : ''}" data-s="${k}">${n}</button>`).join('')}</div>`;
    const expl =
      '<div class="tuNote dim">依「每 1 萬 COAM 提升多少」排序（素材另計）。火力＝整台持續 DPS、耐久＝有效 AP（AP 依防禦換算）、機動＝速度、QB 速度、QB 消耗、EN 容量、EN 回復的變化合計。</div>';
    let divided = false;
    const rows = list
      .map((x) => {
        let pre = '';
        if (!divided && x.diff[sk] <= 0) {
          divided = true;
          pre = `<div class="tuOvDiv dim">以下對「${SORTS.find((s) => s[0] === sk)[1]}」沒有幫助</div>`;
        }
        const chips = Object.keys(x.diff.d)
          .map(
            (k) =>
              `<span class="tuFx ${x.diff.d[k] > 0 ? 'up' : 'dn'}">${METRIC[k].n} ${pctTxt(x.diff.d[k])}</span>`,
          )
          .join('');
        const v = x.diff[sk];
        const can = this.tuneAfford(x.cost);
        return `${pre}<div class="tuOv"><button class="tuOpen" data-id="${x.id}" data-cat="${x.cat}" title="開啟這個零件的調校"><b>${escHtml(x.p.name)}</b><span>${escHtml(x.o.name)}　Lv${x.lv} → ${x.lv + 1}</span></button><div class="tuOvC">${chips || '<span class="dim">整台的指標沒有變化</span>'}</div><div class="tuOvS ${v > 0 ? 'up' : v < 0 ? 'dn' : ''}">${SORTS.find((s) => s[0] === sk)[1]} ${Math.abs(v) < 0.05 ? '±0%' : pctTxt(v)}<small>每 1 萬 C ${Math.abs(per(x)) < 0.05 ? '±0%' : pctTxt(per(x))}</small></div><button class="tuUp" data-id="${x.id}" data-cat="${x.cat}" data-k="${x.o.k}"${can ? '' : ' disabled'}>升級（${escHtml(costTxt(x.cost))}）</button></div>`;
      })
      .join('');
    const fullTxt = full.length
      ? `<div class="tuNote dim">已到合計上限：${full.map(escHtml).join('、')}（可以限界突破）</div>`
      : '';
    return `${sorts}${expl}${rows || '<p class="dim">身上沒有還能調校的零件</p>'}${fullTxt}`;
  },
  // 量表預覽升級後的差異（tune 按鈕的游標停留）：k＝項目，null＝取消
  tunePreview(id, k) {
    if (!id) return this.garageStatsUi(null);
    const S = this.save;
    if (!Object.values(S.asm).includes(id)) return;
    const t = (S.tune || {})[id] || {};
    const lv = t[k] || 0;
    if (lv >= TUNE_MAX) return;
    this.garageStatsUi(null, { id, t: { ...t, [k]: lv + 1 } });
  },
  tuneClose() {
    const box = document.getElementById('tuneBox');
    if (box) box.classList.remove('on');
    if (this.tuneCur) this.tunePreview(null);
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
    if (lv >= TUNE_MAX || this.tuneSum(id) >= tuneCap(t)) return;
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
    this.tuneRender();
  },
  // 限界突破：花傳說殘片＋COAM，這個零件的合計上限 +1
  tuneBreak(id) {
    const S = this.save;
    S.tune = S.tune || {};
    const t = S.tune[id] || (S.tune[id] = {});
    const nx = tuneBreaks(t);
    const c = TUNE_BREAK[nx];
    if (!c) return;
    if (!this.tuneAfford(c)) return this.flashMsg('COAM 或傳說殘片不足', 0xff4d4d, 1.2);
    S.coam -= c.coam;
    for (const m of Object.keys(MATS)) if (c[m]) S.mats[m] -= c[m];
    t._x = nx + 1;
    this.writeSave();
    SFX.cue('pickup');
    this.flashMsg(`限界突破：合計上限 ${tuneCap(t)} 級`, 0xffd060, 1.6);
    this.renderGarage();
    this.tuneRender();
  },
  // 重置：退還一半（COAM 與素材都是）
  tuneReset(id) {
    const S = this.save,
      t = (S.tune || {})[id];
    if (!t) return;
    const back = { coam: 0 };
    for (const k in t)
      for (let lv = 1; k !== '_x' && lv <= t[k]; lv++) {
        const c = tuneCost(lv);
        for (const m in c) back[m] = (back[m] || 0) + c[m];
      }
    S.coam += Math.floor(back.coam / 2);
    for (const m of Object.keys(MATS)) if (back[m]) S.mats[m] = (S.mats[m] || 0) + Math.floor(back[m] / 2);
    // 限界突破是永久的：重置只清項目的級數
    if (t._x) S.tune[id] = { _x: t._x };
    else delete S.tune[id];
    this.writeSave();
    this.flashMsg('調校已重置', 0x7fc8ff, 1.2);
    this.renderGarage();
    this.tuneRender();
  },
});
