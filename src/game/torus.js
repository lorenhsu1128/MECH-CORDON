// ============================================================
//  無邊界地圖（上下左右相接）：遊戲端的東西搬到參考點附近（Game 的 mixin；docs/torus-map-design.md）
//  World 的資料與網格由 world.wrap／wrapSee 搬（world/torus.js）；這裡搬機體、投射物、鏡頭，
//  其他子系統記著的位置（掉落物、地雷、裝置、小人、地圖載具、機體身上的錨點…）由通用的掃描 deepWrap 搬：
//  遊戲從第 TILE0 格開始，真正的位置數值都很大，和速度、方向分得出來，不用逐一列舉欄位。
//  座標不取餘數：玩家永遠不會被搬，被搬的都離參考點半張地圖以上（看不到、也超出互動距離）。
// ============================================================
import { WRAP_HYS, deepCtx, deepWrap } from '../world/torus.js';
import { Game } from './game.js';

// 測試：?tile=K 再多搬 K 格（確認不靠起始的那一格）
const TILE_X =
  typeof location !== 'undefined' ? +(new URLSearchParams(location.search).get('tile') || 0) || 0 : 0;
// Game 上不進去掃的鍵：地圖與畫面的物件、存檔、連線、各個選單場景、特效（只在玩家附近）
const SKIP_G =
  /^(world|scene|renderer|camera|save|net|fx|sfx|stylePipe|garagePipe|post|water|garageScene|hub|hubS|hangar|hg|cine|cineSets|lab|mapv|ed|ctrl|keys|pad|mouse|touch|styleP|tfx|textFx|gaze|player|players|enemies|allies|vehicles|projectiles|popups|bountyPops|wrapHooks|crushW)$/;
// 機體上不進去掃的鍵：模型、零件與數值的定義、其他機體的參照（各自掃）
const SKIP_E =
  /^(game|world|model|def|defs|asm|stats|pilot|weapons|opts0|target|lock|lockTarget|lastHitEnt|lastHitBy|parent|owner|src|pos|vel)$/;

Object.assign(Game.prototype, {
  // 參考點：自己的機體（過場、沒有機體時＝鏡頭注視的位置）
  wrapRef() {
    const p = this.player;
    if (p && p.pos && !this.cine) return p.pos;
    return this.camTarget || this.camera.position;
  },
  // 每格（renderMain 開頭）：地圖資料 → 遊戲端的東西 → 網格與遠景地形
  wrapTick() {
    const w = this.world;
    if (!w || !w.torus) return;
    const S = w.size,
      H = S / 2 + WRAP_HYS;
    const hopTo = (v, c) => {
      const d = c - v;
      return d > H || d < -H ? S * Math.round(d / S) : 0;
    };
    const F = this.wrapRef();
    // 參考點自己跳了半格以上（出生、被放回原格算出來的位置）：把它搬回上一格的參考點附近，世界不動
    const jx = hopTo(F.x, w.fx),
      jz = hopTo(F.z, w.fz);
    if (jx || jz) {
      const p = this.player;
      if (p && F === p.pos && p.shiftBy) p.shiftBy(jx, jz);
      else {
        F.x += jx;
        F.z += jz;
      }
    }
    if (TILE_X && w._tx !== TILE_X && this.player && F === this.player.pos) {
      w._tx = TILE_X;
      this.player.shiftBy(TILE_X * S, TILE_X * S);
    }
    const fx = F.x,
      fz = F.z;
    w.wrap(fx, fz);
    // 機體（玩家、敵人、友軍、載具）
    for (const L of [this.players, this.enemies, this.allies, this.vehicles])
      if (L)
        for (const e of L) {
          if (!e || !e.pos) continue;
          const dx = hopTo(e.pos.x, fx),
            dz = hopTo(e.pos.z, fz);
          if (!dx && !dz) continue;
          if (e.shiftBy) e.shiftBy(dx, dz);
          else {
            e.pos.x += dx;
            e.pos.z += dz;
            const m = e.group || e.mesh;
            if (m && m.position !== e.pos) {
              m.position.x += dx;
              m.position.z += dz;
            }
          }
        }
    // 投射物：位置、發射點、網格
    for (const p of this.projectiles) {
      const dx = hopTo(p.pos.x, fx),
        dz = hopTo(p.pos.z, fz);
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
    }
    // 鏡頭
    for (const v of [this.camera.position, this.camTarget]) {
      if (!v || v === F) continue;
      v.x += hopTo(v.x, fx);
      v.z += hopTo(v.z, fz);
    }
    // 其他記著的位置：參考點每走 WRAP_HYS 的一半掃一次（或每半秒）
    const t = performance.now();
    if (
      w._gs === undefined ||
      Math.abs(fx - w._gsx) + Math.abs(fz - w._gsz) > WRAP_HYS / 2 ||
      t - w._gs > 500
    ) {
      w._gs = t;
      w._gsx = fx;
      w._gsz = fz;
      this.wrapDeep(fx, fz, hopTo);
    }
    const fog = this.scene.fog;
    if (fog && fog.far > w._fogCap) fog.far = w._fogCap; // 更遠的物件不出現：霧不超過半格多一點
    w.wrapSee(fx, fz, fog ? fog.far : S / 2);
  },
  // 通用的掃描：Game 與每台機體記著的位置、直接掛在場景上的遊戲端網格
  wrapDeep(fx, fz, hopTo) {
    const w = this.world;
    const C = deepCtx(w, fx, fz, SKIP_E, 3);
    if (!C) return;
    // 從別的物件繞回 Game、World、場景的參照不進去（各自從最上層掃）
    C.seen.add(this);
    C.seen.add(w);
    C.seen.add(this.scene);
    for (const L of [this.players, this.enemies, this.allies, this.vehicles])
      if (L)
        for (const e of L)
          if (e && typeof e === 'object') {
            C.seen.add(e);
            for (const k in e) {
              if (SKIP_E.test(k)) continue;
              const v = e[k];
              if (v && typeof v === 'object') deepWrap(v, C, 1);
            }
          }
    for (const p of this.projectiles) C.seen.add(p);
    C.skip = SKIP_G;
    C.depth = 4;
    for (const k in this) {
      if (SKIP_G.test(k)) continue;
      const v = this[k];
      if (v && typeof v === 'object') deepWrap(v, C, 1);
    }
    // 場景最上層的網格（World 的由 wrapSee 搬；位置在原點的＝頂點是世界座標的特效，不動）
    if (!w._ms) w._ms = new WeakSet();
    const own = w._ms;
    if (w._msN !== w.meshes.length) {
      w._msN = w.meshes.length;
      for (const o of w.meshes) own.add(o);
    }
    for (const o of this.scene.children) {
      if (own.has(o) || o.userData.far) continue;
      const p = o.position;
      if (Math.abs(p.x) < C.T || Math.abs(p.z) < C.T) continue;
      const dx = hopTo(p.x, fx),
        dz = hopTo(p.z, fz);
      if (dx || dz) {
        p.x += dx;
        p.z += dz;
        o.updateMatrix();
      }
    }
    for (const fn of this.wrapHooks || []) fn.call(this, fx, fz, hopTo);
  },
});
