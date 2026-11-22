// ============================================================
//  無邊界地圖（上下左右相接）：遊戲端的東西搬到參考點附近（Game 的 mixin；docs/torus-map-design.md）
//  World 的資料與網格由 world.wrap／wrapSee 搬（world/torus.js）；這裡搬機體、投射物、掉落物…等遊戲端的位置。
//  座標不取餘數：玩家永遠不會被搬，被搬的都離參考點半張地圖以上（看不到、也超出互動距離）。
// ============================================================
import { WRAP_HYS } from '../world/torus.js';
import { Game } from './game.js';

// 測試：?tile=K 從第 K 格開始玩（座標都很大，抓得到「以原點為中心」的假設）
const TILE0 =
  typeof location !== 'undefined' ? +(new URLSearchParams(location.search).get('tile') || 0) || 0 : 0;

// 一般的東西：資料位置 pos＋自己掛在場景上的網格
const MESH_KEYS = ['mesh', 'group', 'g', 'ring', 'beam', 'mark'];
function shiftThing(o, dx, dz) {
  const p = o.pos || o.p;
  if (p && typeof p.x === 'number') {
    p.x += dx;
    p.z += dz;
  }
  for (const k of MESH_KEYS) {
    const m = o[k];
    if (m && m.isObject3D && m.position !== p) {
      m.position.x += dx;
      m.position.z += dz;
    }
  }
  if (o.wrapShift) o.wrapShift(dx, dz);
}

Object.assign(Game.prototype, {
  // 參考點：自己的機體（沒有時＝鏡頭注視的位置）
  wrapRef() {
    const p = this.player;
    if (p && p.pos && !this.cine) return p.pos;
    return this.camTarget || this.camera.position;
  },
  // 每格（renderMain 開頭）：地圖資料 → 遊戲端的東西 → 網格與遠景地形
  wrapTick() {
    const w = this.world;
    if (!w || !w.torus) return;
    if (TILE0 && w._tile0 !== TILE0 && this.player && this.player.pos) {
      w._tile0 = TILE0;
      this.player.shiftBy(TILE0 * w.size, TILE0 * w.size);
    }
    const F = this.wrapRef(),
      fx = F.x,
      fz = F.z,
      S = w.size,
      H = S / 2 + WRAP_HYS;
    w.wrap(fx, fz);
    const hop = (d) => (d > H || d < -H ? S * Math.round(d / S) : 0);
    // 機體（玩家、敵人、友軍、載具）
    for (const L of [this.players, this.enemies, this.allies, this.vehicles])
      if (L)
        for (const e of L) {
          if (!e || !e.pos) continue;
          const dx = hop(fx - e.pos.x),
            dz = hop(fz - e.pos.z);
          if (!dx && !dz) continue;
          if (e.shiftBy) e.shiftBy(dx, dz);
          else shiftThing(e, dx, dz);
        }
    // 投射物：位置、發射點、網格
    for (const p of this.projectiles) {
      const dx = hop(fx - p.pos.x),
        dz = hop(fz - p.pos.z);
      if (!dx && !dz) continue;
      p.pos.x += dx;
      p.pos.z += dz;
      if (p.p0) {
        p.p0.x += dx;
        p.p0.z += dz;
      }
      if (p.mesh) {
        p.mesh.position.x += dx;
        p.mesh.position.z += dz;
      }
      if (p.tp && typeof p.tp.x === 'number') {
        p.tp.x += dx;
        p.tp.z += dz;
      }
    }
    // 其他有位置的東西（掉落物、地雷、區域效果、燃燒地面…）：清單在 WRAP_LISTS，各類自己的欄位用 wrapShift
    for (const key of WRAP_LISTS) {
      const L = this[key];
      if (!L || !L.length) continue;
      for (const o of L) {
        const p = o && (o.pos || o.p);
        if (!p || typeof p.x !== 'number') continue;
        const dx = hop(fx - p.x),
          dz = hop(fz - p.z);
        if (dx || dz) shiftThing(o, dx, dz);
      }
    }
    for (const fn of this.wrapHooks || []) fn.call(this, fx, fz, hop);
    const fog = this.scene.fog;
    if (fog && fog.far > w._fogCap) fog.far = w._fogCap; // 更遠的物件不出現：霧不超過半格多一點
    w.wrapSee(fx, fz, fog ? fog.far : S / 2);
  },
});
// Game 上「每一項有 pos（＋網格）」的陣列
const WRAP_LISTS = ['pickups', 'mines', 'zones', 'pools', 'shocks'];
