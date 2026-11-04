// Game：地圖節奏改版的敵人分群（docs/map-pacing-design.md）——邊緣進場（World.start）的地圖上，
// 第一波與據點守衛分成幾群放在地圖各處（越往深處越遠），群與群之間留空檔；清掉一群才派下一波增援；
// HUD 標出遠處的敵軍（各端依自己看到的敵人分群，不同步）。規畫與生成只在房主／單機。
import { clamp } from '../core/math.js';
import { DS, MS } from '../core/scale.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { ENC_MARK_MIN } from './constants.js';
import { Game } from './game.js';

const isAce = (t) => t === 'ac' || !!(ENEMY_TYPES[t] || {}).roster;
const GROUP_SHARE = 0.7; // 開場放在各群的比例（其餘是之後的增援波次）
const MARK_LINK = 30 * DS; // HUD 的分群：彼此這麼近的敵人算同一群
const MARK_MIN = ENC_MARK_MIN; // 這麼遠以上的敵群才標示（近的有名牌與畫面外箭頭）
const MARK_MAX = 6;

Object.assign(Game.prototype, {
  // 規畫 nG 個敵群與 nC 個據點的位置：作戰區域裡離起點夠遠的空地，以最遠點取樣讓彼此分散；
  // 回傳 { groups, caches }（依離起點的深度排序），沒有起點時 null
  encPlan(nG, nC) {
    const w = this.world,
      s = w.start;
    if (!s) return null;
    const Z = w.zone,
      m = 10 * MS;
    // 起點往前到作戰區域另一側的距離
    const D = s.fx ? (s.fx > 0 ? Z[1] - s.x : s.x - Z[0]) : s.fz > 0 ? Z[3] - s.z : s.z - Z[2];
    const prog = (x, z) => (x - s.x) * s.fx + (z - s.z) * s.fz;
    const free = (x, z) =>
      w.slopeOK(x, z) &&
      !w.isVoid(x, z) &&
      !w.isReserved(x, z, 3 * MS) &&
      !w.offLimits(x, z) &&
      !w.onCorridor(x, z, 2 * MS) &&
      !w.obstacles.some((o) =>
        o.kind === 'box'
          ? Math.abs(x - o.x) < o.w / 2 + 3 * MS && Math.abs(z - o.z) < o.d / 2 + 3 * MS
          : Math.hypot(x - o.x, z - o.z) < o.r + 3 * MS,
      );
    const cand = [];
    for (let t = 0; t < 600 && cand.length < 260; t++) {
      const x = Z[0] + m + Math.random() * (Z[1] - Z[0] - 2 * m),
        z = Z[2] + m + Math.random() * (Z[3] - Z[2] - 2 * m);
      const p = prog(x, z);
      if (p < Math.max(D * 0.28, 55 * DS) || Math.hypot(x - s.x, z - s.z) < 60 * DS) continue;
      if (!free(x, z)) continue;
      cand.push({ x, z, p });
    }
    if (!cand.length) return null;
    const K = Math.min(cand.length, nG + nC);
    // 第一個是最深的（最後一群），之後每次挑離已選的點（與起點）最遠的
    const pick = [cand.reduce((a, b) => (b.p > a.p ? b : a))];
    while (pick.length < K) {
      let best = null,
        bd = -1;
      for (const c of cand) {
        if (pick.includes(c)) continue;
        let d = Math.hypot(c.x - s.x, c.z - s.z) * 0.8;
        for (const q of pick) d = Math.min(d, Math.hypot(c.x - q.x, c.z - q.z));
        if (d > bd) {
          bd = d;
          best = c;
        }
      }
      if (!best) break;
      pick.push(best);
    }
    pick.sort((a, b) => a.p - b.p);
    // 敵群平均分布在深度上（含最深的），其餘是據點
    const n = pick.length,
      g = Math.min(nG, n);
    const gi = new Set();
    for (let j = 0; j < g; j++) gi.add(g === 1 ? n - 1 : Math.round((j * (n - 1)) / (g - 1)));
    const V = (c) => new THREE.Vector3(c.x, w.terrainHeight(c.x, c.z), c.z);
    return {
      groups: pick.filter((c, i) => gi.has(i)).map(V),
      caches: pick.filter((c, i) => !gi.has(i)).map(V),
    };
  },
  // spawnComp 的分群版：開場的 GROUP_SHARE 放進各群（待機），其餘分成 1～3 波增援（敵對 AC 在最後一波）。
  // 回傳 false＝不適用（沒有起點、規畫失敗），照原本的分波
  encSpawn(comp, np, scaleHp, scaleDmg) {
    const aces = comp.filter(isAce),
      body = comp.filter((t) => !isAce(t));
    if (!body.length) return false;
    const nG = Math.min(body.length, clamp(Math.round(body.length / 3.5), 2, 4));
    const nC = Math.random() < 0.5 ? 3 : 2; // 據點（outpostsPlan）
    const plan = this.encPlan(nG, nC);
    if (!plan || !plan.groups.length) return false;
    const G = plan.groups.length;
    const m = Math.max(G, Math.ceil(body.length * GROUP_SHARE));
    const grp = Array.from({ length: G }, () => []);
    // 越深的群越多：從最深的開始輪流放
    body.slice(0, m).forEach((t, i) => grp[G - 1 - (i % G)].push(t));
    const rest = body.slice(m);
    const per = 3 + (np - 1) * 2;
    const W = rest.length ? clamp(Math.round(rest.length / per), 1, 3) : aces.length ? 1 : 0;
    const waves = Array.from({ length: W }, () => []);
    rest.forEach((t, i) => waves[i % W].push(t));
    if (W) waves[W - 1].push(...aces);
    this.waves = waves.filter((x) => x.length);
    this.waveN = this.waves.length + 1;
    this.waveI = 1;
    this.waveSize = Math.max(1, Math.ceil(rest.length / Math.max(1, W)));
    this.waveGap = 2.5;
    this.wavePend = null;
    this.encGroups = plan.groups.map((pos) => ({ pos }));
    this.encCaches = plan.caches;
    this.spawnIdle = true;
    try {
      grp.forEach((list, gi) => {
        this.waveAt = { pos: plan.groups[gi], drop: false };
        this.encG = gi;
        for (const t of list) this.spawnType(t, scaleHp, scaleDmg);
      });
    } finally {
      this.waveAt = null;
      this.encG = null;
      this.spawnIdle = false;
    }
    return true;
  },
  // 清掉了幾群（那一群的敵人全部擊破或離場）
  encCleared() {
    if (!this.encGroups) return 0;
    const alive = new Set();
    for (const e of this.enemies) if (!e.dead && e.encG !== undefined && e.encG !== null) alive.add(e.encG);
    return this.encGroups.length - alive.size;
  },
  // waveTick 用：分群時下一波要等清掉對應數量的群；場上的戰力只算交戰中的群裡的敵人與其他敵人
  encWaveGate() {
    if (!this.encGroups) return null;
    const cl = this.encCleared();
    if (cl < Math.min(this.waveI, this.encGroups.length)) return -1;
    return this.enemies.filter(
      (e) =>
        !e.dead &&
        e.ai !== 'objective' &&
        e.ai !== 'part' &&
        !e.guardOf &&
        !e.decoy &&
        (e.encG === undefined || e.encG === null || (e.sn && e.sn.st === 2)),
    ).length;
  },
  // ---------- HUD：遠處的敵群（邊緣進場的地圖；各端依自己的敵人清單） ----------
  encMarksTick() {
    const p = this.player;
    if (!this.world || !this.world.start || !p) return (this.encMarks = null);
    const list = this.enemies.filter(
      (e) =>
        !e.dead &&
        !e.decoy &&
        !e.noLock &&
        e.ai !== 'part' &&
        e.ai !== 'objective' &&
        e.mesh &&
        e.mesh.visible,
    );
    const seen = new Set(),
      out = [];
    for (const e of list) {
      if (seen.has(e)) continue;
      const g = [e];
      seen.add(e);
      for (let i = 0; i < g.length; i++)
        for (const o of list)
          if (!seen.has(o) && Math.hypot(o.pos.x - g[i].pos.x, o.pos.z - g[i].pos.z) < MARK_LINK) {
            seen.add(o);
            g.push(o);
          }
      const c = new THREE.Vector3();
      for (const o of g) c.add(o.pos);
      c.multiplyScalar(1 / g.length);
      const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z);
      if (d < MARK_MIN) continue;
      c.y += 6 * MS;
      out.push({ pos: c, n: g.length, d });
    }
    out.sort((a, b) => a.d - b.d);
    this.encMarks = out.slice(0, MARK_MAX);
  },
  drawEncMarks(c, W, H, p, dt) {
    this.encMarkT = (this.encMarkT || 0) - dt;
    if (this.encMarkT <= 0) {
      this.encMarkT = 0.4;
      this.encMarksTick();
    }
    if (!this.encMarks || !this.encMarks.length) return;
    c.save();
    c.font = 'bold 11px Chakra Petch';
    c.textAlign = 'center';
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0,0,0,.7)';
    for (const m of this.encMarks) {
      const s = this.proj(m.pos);
      const txt = `敵軍 ×${m.n}　${Math.round(m.d)}m`;
      c.globalAlpha = 0.8;
      c.fillStyle = '#ffb040';
      if (!s.in || s.x < 0 || s.x > W || s.y < 0 || s.y > H) {
        let dx = s.x - W / 2,
          dy = s.y - H / 2;
        if (!s.in) {
          dx = -dx;
          dy = -dy;
        }
        // 和名牌的畫面外箭頭相同的邊界（hud.js：下方留給狀態欄與武器欄）
        const ang = Math.atan2(dy, dx),
          mg = 44;
        const tx = clamp(W / 2 + Math.cos(ang) * 9999, mg, W - mg),
          tyy = clamp(H / 2 + Math.sin(ang) * 9999, mg + 30, H - mg - 120);
        const k = Math.abs(
          Math.min((tx - W / 2) / (Math.cos(ang) || 1e-6), (tyy - H / 2) / (Math.sin(ang) || 1e-6)),
        );
        const ax = W / 2 + Math.cos(ang) * k,
          ay = H / 2 + Math.sin(ang) * k;
        c.save();
        c.translate(ax, ay);
        c.rotate(ang);
        c.beginPath();
        c.moveTo(12, 0);
        c.lineTo(-6, -8);
        c.lineTo(-6, 8);
        c.closePath();
        c.stroke();
        c.fill();
        c.restore();
        const ty = ay < H / 2 ? ay + 22 : ay - 14,
          lx = clamp(ax, 64, W - 64);
        c.strokeText(txt, lx, ty);
        c.fillText(txt, lx, ty);
      } else {
        c.beginPath();
        c.moveTo(s.x, s.y - 9);
        c.lineTo(s.x + 7, s.y);
        c.lineTo(s.x, s.y + 9);
        c.lineTo(s.x - 7, s.y);
        c.closePath();
        c.stroke();
        c.fill();
        c.strokeText(txt, s.x, s.y - 14);
        c.fillText(txt, s.x, s.y - 14);
      }
    }
    c.restore();
  },
});
