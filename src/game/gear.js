// Game：零件品級與詞條（docs/gear-rarity-design.md）——背包 save.inv、裝備的選擇 save.eq、裝備的加成。
// 純函式與資料在 data/gear.js；這裡是存檔的操作與機甲庫用的小工具。
import { GEAR_CAT, INV_MAX, gearBest, gearGr, gearPick, gearResolve } from '../data/gear.js';
import * as GD from '../data/gear.js';
import { Game } from './game.js';

// 自動化測試（網址帶 ?test）：data/gear.js 的函式放在 window.__gear
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('test')) window.__gear = GD;

Object.assign(Game.prototype, {
  // 背包與裝備的欄位（讀檔後、新存檔）
  gearEnsure() {
    const S = this.save;
    if (!Array.isArray(S.inv)) S.inv = [];
    if (!S.eq || typeof S.eq !== 'object') S.eq = {};
    return S;
  },
  // 依組裝挑出的裝備（不寫回 save.eq）
  gearPickFor(asm) {
    const S = this.gearEnsure();
    return gearPick(S, asm || S.asm, S.eq);
  },
  // 目前組裝的裝備（寫回 save.eq）
  gearNow() {
    return gearResolve(this.gearEnsure());
  },
  // 加成表換成另一個組裝的裝備（機甲庫的換零件預覽）；pm 是 null 時照舊回傳 null
  gearPmFor(asm, pm) {
    if (!pm) return pm;
    const S = this.gearEnsure();
    return { ...pm, gr: gearGr(S, asm, gearPick(S, asm, S.eq)) };
  },
  // 這個零件 id 目前用的那一件：裝備中的、背包裡最好的，都沒有＝null（標準版）
  gearForId(id) {
    const S = this.gearEnsure();
    const pick = gearPick(S, S.asm, S.eq);
    for (const k in pick) if (pick[k] && pick[k].id === id) return pick[k];
    return gearBest(S.inv, id);
  },
  gearByU(u) {
    return u ? this.gearEnsure().inv.find((g) => g.u === u) || null : null;
  },
  // 調校表：u＝那一件（null＝標準版，存在 save.tune[零件 id]）；make＝沒有時建立
  gearTune(id, u, make) {
    const S = this.gearEnsure();
    const g = this.gearByU(u);
    if (g) {
      if (!g.t && make) g.t = {};
      return g.t || null;
    }
    S.tune = S.tune || {};
    if (!S.tune[id] && make) S.tune[id] = {};
    return S.tune[id] || null;
  },
  gearTuneSet(id, u, t) {
    const S = this.gearEnsure();
    const g = this.gearByU(u);
    const empty = !t || !Object.keys(t).length;
    if (g) {
      if (empty) delete g.t;
      else g.t = t;
      return;
    }
    S.tune = S.tune || {};
    if (empty) delete S.tune[id];
    else S.tune[id] = t;
  },
  // 背包的件數（裝備中的不算）
  invCount() {
    const S = this.gearEnsure();
    const eq = new Set(
      Object.values(this.gearNow())
        .filter(Boolean)
        .map((g) => g.u),
    );
    return S.inv.filter((g) => !eq.has(g.u)).length;
  },
  invFull() {
    return this.invCount() >= INV_MAX;
  },
  // 擁有的零件清單（save.owned）：零件 id 第一次拿到時加進去
  gearOwn(id) {
    const S = this.save;
    if (GEAR_CAT.has(id) && !S.owned.includes(id)) S.owned.push(id);
  },
});
