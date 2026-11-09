// Game：零件品級的機甲庫介面（docs/gear-rarity-design.md）——零件格子的品級、小卡片的裝備清單與詞條、
// 「背包」頁（篩選、鎖定、分解；升階與重骰在 gear-forge.js）。資料與計算在 data/gear.js。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { SLOTS, partById } from '../data/parts.js';
import { MATS } from '../data/tune.js';
import {
  ADV,
  DISMANTLE,
  GEAR_CAT,
  GRADES,
  INV_MAX,
  STD,
  axText,
  gearPart,
  gearTileInfo,
  isWeaponCat,
  mainText,
} from '../data/gear.js';
import { tuneLevels } from '../data/tune.js';
import { fixedLines } from '../data/gear-excl.js';
import { Game } from './game.js';

const CAT_N = {
  arm: '手持武器',
  back: '肩上武器',
  head: '頭部',
  core: '核心',
  arms: '手臂',
  legs: '腳部',
  booster: '推進器',
  generator: '發電機',
  fcs: '火控',
};
const CAT_F = [
  ['', '全部'],
  ['w', '武器'],
  ['f', '機體'],
  ['o', '推進器・發電機・火控'],
];
const catGroup = (c) => (isWeaponCat(c) ? 'w' : ['head', 'core', 'arms', 'legs'].includes(c) ? 'f' : 'o');
const matTxt = (m) =>
  Object.keys(m)
    .filter((k) => m[k])
    .map((k) => `${MATS[k].name}×${m[k]}`)
    .join('、');

Object.assign(Game.prototype, {
  // ---------- 零件格子 ----------
  // 格子的品級：背包裡最高的品級與件數
  gearTileHtml(id) {
    const { n, q } = gearTileInfo(this.save.inv, id);
    if (!n) return { cls: '', html: '', style: '' };
    return {
      cls: ` gq${q}`,
      style: `--gq:${GRADES[q].c}`,
      html: `<i class="pQn" style="color:${GRADES[q].c}" title="背包裡有 ${n} 件，最高「${GRADES[q].n}」">${n}</i>`,
    };
  },
  // ---------- 小卡片 ----------
  // 小卡片看的是哪一件：點過的（gTipU）、裝備中的、背包裡最好的
  gearTipPick(id) {
    if (this.gTipU && this.gTipU.id === id) return this.gTipU.u === null ? null : this.gearByU(this.gTipU.u);
    const [key] = SLOTS.find(([k]) => k === this.garageSlot) || [];
    const pick = this.gearNow();
    if (key && this.save.asm[key] === id) return pick[key] || null;
    return this.gearForId(id);
  },
  // 詞條不生效的原因（空字串＝有效）：PvP、被另一件的同名詞條蓋過、這台機甲用不到
  gearAxNa(g, a) {
    if (this.pilotCtxMode && this.pilotCtxMode() === 'pvp') return 'PvP 不套用';
    const A = ADV[a[0]];
    if (!A || g.q < 3) return '';
    const S = this.save;
    const pick = this.gearNow();
    const mine = Object.keys(pick).find((k) => pick[k] && pick[k].u === g.u);
    if (!mine) return '';
    // 整台的詞條：同名取最強
    if (A.sc === 'g')
      for (const k in pick) {
        const o = pick[k];
        if (!o || o.u === g.u || o.q < 3) continue;
        const b = o.ax.find((x) => x[0] === a[0]);
        if (b && (b[1] > a[1] || (b[1] === a[1] && k < mine)))
          return `被${gearPart(o.id).name}的同名詞條蓋過`;
      }
    // 同類專精：沒有裝備那一類的武器
    const SPT = {
      fSpK: ['bullet'],
      fSpS: ['shotgun'],
      fSpX: ['shell', 'grenade'],
      fSpM: ['missile'],
      fSpL: ['laser', 'empbeam'],
      fSpMe: ['melee'],
    };
    if (SPT[a[0]]) {
      const ok = ['rarm', 'larm', 'rback', 'lback'].some((s) => {
        const p = gearPart(S.asm[s]);
        if (!p) return false;
        const t = p.type === 'shotgun' && p.attr === 'en' ? 'laser' : p.type;
        return SPT[a[0]].includes(t);
      });
      if (!ok) return '沒有裝備這一類的武器';
    }
    return '';
  },
  // 這一件的品級、主要數值、詞條（小卡片、背包頁共用）
  gearLinesHtml(g) {
    if (!g || (!g.q && !g.ax.length)) return '';
    const main = mainText(g.id, g.q);
    const ax = g.ax
      .map((a) => {
        const na = this.gearAxNa(g, a);
        return `<div class="gAx${a[2] ? ' star' : ''}${na ? ' na' : ''}"${na ? ` title="${escHtml(na)}"` : ''}>◆ ${escHtml(axText(a))}${na ? `<small>（${escHtml(na)}）</small>` : ''}</div>`;
      })
      .join('');
    return `<div class="gLines">${main ? `<div class="gMain">${escHtml(main)}</div>` : ''}${ax}${this.gearFixedHtml(g)}</div>`;
  },
  // 特製／傳說的固定詞條（data/gear-excl.js）：紫色專屬、金色特殊
  gearFixedHtml(g) {
    return fixedLines(g.id, g.q)
      .map(
        (x) =>
          `<div class="gFx${x.k === 'g' ? ' gold' : ''}">${x.k === 'g' ? '★' : '◇'} ${escHtml(x.n)}：${escHtml(x.txt)}</div>`,
      )
      .join('');
  },
  gearTag(g) {
    const q = (g && g.q) || 0;
    return `<span class="gTag" style="color:${GRADES[q].c};border-color:${GRADES[q].c}">${GRADES[q].n}</span>`;
  },
  // 這個型號的裝備清單（小卡片）：點一下換上、游標停留預覽量表
  gearListHtml(id) {
    const S = this.save;
    const list = S.inv.filter((g) => g.id === id).sort((a, b) => b.q - a.q);
    const sel0 = this.gearTipPick(id);
    // 升階與重骰（gear-forge.js）：看的那一件；標準版可以升階成改良
    const forge = `<div class="fgTip">${sel0 ? this.forgeBtnsHtml(sel0) : this.forgeStdHtml(id)}</div>`;
    if (!list.length) return `<div class="gIList">${forge}</div>`;
    const key = this.garageSlot;
    const pick = this.gearNow();
    const cur = S.asm[key] === id ? pick[key] : undefined;
    const used = new Set(
      Object.keys(pick)
        .filter((k) => k !== key && pick[k])
        .map((k) => pick[k].u),
    );
    const sel = this.gearTipPick(id);
    const row = (g) => {
      const q = g ? g.q : 0;
      const on = cur !== undefined && (cur ? cur.u : null) === (g ? g.u : null);
      const other = g && used.has(g.u);
      const tl = tuneLevels(g ? g.t : (S.tune || {})[id]);
      const ax = g ? g.ax.map((a) => axText(a)).join('・') : '詞條無';
      return `<button class="gIl${on ? ' on' : ''}${(sel ? sel.u : null) === (g ? g.u : null) ? ' sel' : ''}" data-u="${g ? g.u : ''}" style="--gq:${GRADES[q].c}"${other ? ' disabled title="裝在另一個槽位"' : ''}><b>${GRADES[q].n}</b><span>${escHtml(ax)}</span>${tl ? `<em>調+${tl}</em>` : ''}${on ? '<em>裝備中</em>' : other ? '<em>另一手</em>' : ''}${g && g.nw ? '<em class="nw">新</em>' : ''}</button>`;
    };
    return `<div class="gIList"><div class="dim">這個型號的裝備（${list.length} 件＋標準版）：點一下換上</div>${list.map(row).join('')}${row(null)}${forge}</div>`;
  },
  // 小卡片的清單：換上那一件
  gearListBind(tip, cat, p) {
    this.forgeBind(tip, null);
    this.forgeStdBind(tip);
    for (const b of tip.querySelectorAll('.gIl')) {
      const u = b.dataset.u || null;
      b.onclick = () => this.gearEquip(this.garageSlot, p.id, u);
      const on = () => {
        this.gTipU = { id: p.id, u };
        this.garageStatsUi(null, { id: p.id, slot: this.garageSlot, gear: u ? this.gearByU(u) : null });
      };
      b.onpointerenter = on;
      b.onfocus = on;
      b.onpointerleave = () => this.garageStatsUi(null);
    }
  },
  // 換上某一件（u＝null：標準版）
  gearEquip(slot, id, u) {
    const S = this.gearEnsure();
    if (!S.owned.includes(id)) return;
    S.asm[slot] = id;
    S.eq[slot] = u || STD + id;
    // 同一件不能同時在兩個槽位：另一個槽位改回自動挑選
    if (u) for (const k in S.eq) if (k !== slot && S.eq[k] === u) delete S.eq[k];
    const g = this.gearByU(u);
    if (g && g.nw) delete g.nw;
    this.gTipU = { id, u: u || null };
    this.gTipPid = id;
    this.gTipPin = id;
    SFX.ui();
    this.writeSave();
    this.renderGarage();
  },
  // ---------- 背包頁 ----------
  invUi() {
    const box = document.getElementById('gInv');
    if (!box) return;
    const S = this.gearEnsure();
    const f = (this.invF = this.invF || { q: -1, c: '' });
    const pick = this.gearNow();
    const eqU = new Map();
    for (const k in pick) if (pick[k]) eqU.set(pick[k].u, k);
    const list = S.inv
      .filter((g) => (f.q < 0 || g.q === f.q) && (!f.c || catGroup(GEAR_CAT.get(g.id)) === f.c))
      .sort((a, b) => b.q - a.q || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const qBtn = [[-1, '全部'], ...GRADES.map((G, i) => [i, G.n])]
      .map(
        ([q, n]) =>
          `<button class="invQ${f.q === q ? ' on' : ''}" data-q="${q}"${q >= 0 ? ` style="color:${GRADES[q].c}"` : ''}>${n}</button>`,
      )
      .join('');
    const cBtn = CAT_F.map(
      ([c, n]) => `<button class="invC${f.c === c ? ' on' : ''}" data-c="${c}">${n}</button>`,
    ).join('');
    const SN = Object.fromEntries(SLOTS.map(([k, n]) => [k, n]));
    const rows = list
      .map((g) => {
        const p = gearPart(g.id);
        const slot = eqU.get(g.u);
        const tl = tuneLevels(g.t);
        const forge = this.forgeBtnsHtml ? this.forgeBtnsHtml(g) : '';
        return `<div class="invR" style="--gq:${GRADES[g.q].c}"><div class="invN">${this.gearTag(g)}<b>${escHtml(p.name)}</b><span class="dim">${CAT_N[GEAR_CAT.get(g.id)]}</span>${slot ? `<em class="invEq">裝備中：${SN[slot]}</em>` : ''}${tl ? `<em class="invTu">調校 +${tl}</em>` : ''}${g.nw ? '<em class="nw">新</em>' : ''}</div>${this.gearLinesHtml(g)}<div class="invA"><button class="invEqB" data-u="${g.u}"${slot ? ' disabled' : ''}>裝備</button>${forge}<button class="invLk" data-u="${g.u}">${g.lk ? '解除鎖定' : '鎖定'}</button><button class="invDs" data-u="${g.u}"${slot || g.lk ? ' disabled' : ''}>分解（${escHtml(matTxt(DISMANTLE[g.q]))}${tl ? '＋退還調校的一半' : ''}）</button></div></div>`;
      })
      .join('');
    const bulk = [1, 2]
      .map((q) => `<button class="invBulk" data-q="${q}">分解全部「${GRADES[q].n}」</button>`)
      .join('');
    box.innerHTML = `<div class="gPageH"><h2>背包</h2><span class="dim">${this.invCount()}／${INV_MAX} 件（裝備中的不算）</span></div><div class="invMats">${this.lootMatsHtml()}</div><div class="invF" data-padtabs=".invQ">${qBtn}</div><div class="invF">${cBtn}</div><div class="invBulkRow">${bulk}<span class="dim">鎖定、裝備中的不分解</span></div><div class="invList">${rows || '<p class="dim">背包是空的：擊破敵人、開補給箱、委託的報酬都會掉裝備。商店只賣標準版。</p>'}</div>`;
    for (const b of box.querySelectorAll('.invQ'))
      b.onclick = () => {
        SFX.ui();
        f.q = Number(b.dataset.q);
        this.invUi();
      };
    for (const b of box.querySelectorAll('.invC'))
      b.onclick = () => {
        SFX.ui();
        f.c = b.dataset.c;
        this.invUi();
      };
    for (const b of box.querySelectorAll('.invEqB'))
      b.onclick = () => {
        const g = this.gearByU(b.dataset.u);
        const cat = GEAR_CAT.get(g.id);
        // 武器：目前選的部位同分類就裝在那裡，否則裝在那一類的第一格
        const sl = (SLOTS.find(([k, , c]) => k === this.garageSlot && c === cat) ||
          SLOTS.find(([, , c]) => c === cat))[0];
        this.gearEquip(sl, g.id, g.u);
        this.invUi();
      };
    for (const b of box.querySelectorAll('.invLk'))
      b.onclick = () => {
        const g = this.gearByU(b.dataset.u);
        if (g.lk) delete g.lk;
        else g.lk = 1;
        SFX.ui();
        this.writeSave();
        this.invUi();
      };
    for (const b of box.querySelectorAll('.invDs'))
      b.onclick = () => {
        const g = this.gearByU(b.dataset.u);
        const p = gearPart(g.id);
        this.uiConfirm(
          `分解「${GRADES[g.q].n}」${p.name}？得到 ${matTxt(DISMANTLE[g.q])}${tuneLevels(g.t) ? '，並退還調校費用的一半' : ''}。`,
          () => {
            this.invDismantle([g.u]);
            this.invUi();
          },
          '分解',
          '取消',
        );
      };
    for (const b of box.querySelectorAll('.invBulk'))
      b.onclick = () => {
        const q = Number(b.dataset.q);
        const us = this.invDisposable().filter((g) => g.q === q);
        if (!us.length) return this.flashMsg(`沒有可以分解的「${GRADES[q].n}」`, 0x8a97a6, 1.2);
        this.uiConfirm(
          `分解 ${us.length} 件「${GRADES[q].n}」？（鎖定、裝備中的不分解）`,
          () => {
            this.invDismantle(us.map((g) => g.u));
            this.invUi();
          },
          '分解',
          '取消',
        );
      };
    this.forgeBind(box, () => this.invUi()); // 升階與重骰（gear-forge.js）
    // 看過的「新」標記拿掉（下次打開就不顯示）
    let ch = false;
    for (const g of S.inv)
      if (g.nw) {
        delete g.nw;
        ch = true;
      }
    if (ch) this.writeSave();
  },
  // 可以分解的（不是鎖定、不是裝備中）
  invDisposable() {
    const S = this.gearEnsure();
    const eq = new Set(
      Object.values(this.gearNow())
        .filter(Boolean)
        .map((g) => g.u),
    );
    return S.inv.filter((g) => !g.lk && !eq.has(g.u));
  },
  invDismantle(us) {
    const S = this.gearEnsure();
    const ok = new Set(this.invDisposable().map((g) => g.u));
    const got = {};
    S.mats = S.mats || {};
    for (const u of us) {
      if (!ok.has(u)) continue;
      const g = this.gearByU(u);
      for (const k in DISMANTLE[g.q]) {
        S.mats[k] = (S.mats[k] || 0) + DISMANTLE[g.q][k];
        got[k] = (got[k] || 0) + DISMANTLE[g.q][k];
      }
      if (g.t) this.tuneRefund(g.t);
      S.inv = S.inv.filter((x) => x.u !== u);
    }
    this.writeSave();
    SFX.cue('pickup');
    if (Object.keys(got).length) this.flashMsg(`分解：得到 ${matTxt(got)}`, 0x7fc8ff, 1.6);
    this.renderGarage();
  },
  // 背包加一件（掉落、委託、獎勵）；滿了回傳 false
  invAdd(g, o = {}) {
    const S = this.gearEnsure();
    if (!g) return false;
    if (!o.force && this.invFull()) return false;
    g.nw = 1;
    S.inv.push(g);
    this.gearOwn(g.id);
    this.writeSave();
    return true;
  },
  // 零件的名稱（含品級）
  gearName(g) {
    const p = gearPart(g.id) || partById('arm', g.id);
    return `${GRADES[g.q].n}・${p.name}`;
  },
});
