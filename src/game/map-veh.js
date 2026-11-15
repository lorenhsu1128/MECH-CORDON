// Game 的 mixin：地圖上會動的載具（docs/map-vehicles-design.md）——各主題放哪些車、環狀路線的規畫、每格的更新
// （前方被擋住就停、倒車、掉頭）、機甲踩扁小車、大車擋住機甲、打壞時的駕駛與掉落。載具本身在 world/map-veh.js。
// 第 1 期：只有單機（多人第 5 期）；路線用自己的亂數串（不動關卡生成的亂數）。
import { makeRng } from '../core/math.js';
import { MV_DROP, MV_THEMES, MV_TYPES } from '../data/map-veh.js';
import { MapVeh } from '../world/map-veh.js';
import { Game } from './game.js';

const STEP = 2.5; // 檢查路線的取樣間隔（公尺）
const SLOPE = 1.3; // 每個取樣間隔最多高低差（公尺；約 27°，沙丘也開得上去）
const WADE = 1.1; // 涉水：水深幾公尺以內開得過（淹沒城區）
const START_FAR = 28; // 開場時離玩家至少幾公尺

Object.assign(Game.prototype, {
  // 生成（crowdPlan 開頭呼叫：地圖建好、玩家放好之後）；o.ambient＝false 時不放（自訂關卡「只有擺放的」）
  mvPlan(o = {}) {
    this.mvClear();
    const W = this.world;
    if (!W || !this.scene || o.ambient === false) return;
    if (this.airMode || this.sim || this.range || this.tut || this.lab || this.cine || this.pvp) return;
    if (this.net && this.net.role) return; // 多人之後（第 5 期）
    const list = MV_THEMES[W.themeKey];
    if (!list || !list.length) return;
    const rng = makeRng(((W.seed | 0) * 173 + 11) >>> 0);
    const Z = W.zone;
    const area = Math.max(1, (Z[1] - Z[0]) * (Z[3] - Z[2]));
    let n = Math.round((4 + rng() * 4) * Math.min(1.4, Math.sqrt(area / (230 * 230))));
    if (W.opt && W.opt.open) n = Math.min(n, 2); // Boss 關：地圖要開闊
    n = Math.max(2, Math.min(9, n));
    const used = {};
    const pl = this.player;
    this.mvs = [];
    for (let i = 0, tries = 0; i < n && tries < n * 3; tries++) {
      const key = list[Math.floor(rng() * list.length)];
      if ((used[key] || 0) >= 2) continue;
      const T = MV_TYPES[key];
      const route = this.mvRoute(rng, T);
      if (!route) continue;
      // 起點：離玩家至少 START_FAR、不和已經放的車重疊的路線點（離玩家越遠越優先）
      const dist = ([x, z]) => (pl ? Math.hypot(x - pl.pos.x, z - pl.pos.z) : 99);
      const order = route.map((p, j) => j).sort((a, b) => dist(route[b]) - dist(route[a]));
      const si = order.find(
        (j) =>
          dist(route[j]) >= START_FAR &&
          this.mvs.every(
            (o) => Math.hypot(o.pos.x - route[j][0], o.pos.z - route[j][1]) > (o.len + (T.len || 5)) / 2 + 4,
          ),
      );
      if (si === undefined) continue;
      used[key] = (used[key] || 0) + 1;
      const v = new MapVeh(this, key, route, {
        i: si,
        dir: rng() < 0.5 ? 1 : -1,
        v: Math.floor(rng() * (T.vars || 1)),
      });
      this.mvs.push(v);
      i++;
    }
    if (!this.mvs.length) this.mvs = null;
  },
  mvClear() {
    for (const v of this.mvs || []) v.cleanup();
    this.mvs = null;
  },
  // 這一點車子開得過：作戰區域裡、不是禁區／虛空／深水、不在高台或橋面底下、沒有障礙物（半寬 hw）
  mvFree(x, z, hw) {
    const W = this.world,
      Z = W.zone;
    const m = hw + 4;
    if (x < Z[0] + m || x > Z[1] - m || z < Z[2] + m || z > Z[3] - m) return null;
    if (W.offLimits(x, z) || (W.isVoid && W.isVoid(x, z))) return null;
    if (W.waterDepth && W.waterDepth(x, z) > WADE) return null;
    if (W.onLedge && W.onLedge(x, z)) return null;
    const y = W.groundAt(x, z, W.terrainHeight(x, z) + 0.5);
    if (W.groundAt(x, z, 999) > y + 2.2) return null;
    const [cx, cz] = W.collide(x, z, y + 0.6, hw);
    if (Math.abs(cx - x) + Math.abs(cz - z) > 0.05) return null;
    return y;
  },
  // 一段路（a → b）每 STEP 公尺都開得過、坡度不陡
  mvSegOk(a, b, hw) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / STEP));
    let py = null;
    for (let s = 0; s <= n; s++) {
      const x = a[0] + ((b[0] - a[0]) * s) / n,
        z = a[1] + ((b[1] - a[1]) * s) / n;
      const y = this.mvFree(x, z, hw);
      if (y === null) return false;
      if (py !== null && Math.abs(y - py) > SLOPE) return false;
      py = y;
    }
    return true;
  },
  // 環狀路線：在作戰區域裡挑一個中心，繞一圈放 6～8 個點（碰到障礙物就往內縮），開不過的段落把點拿掉
  mvRoute(rng, T) {
    const W = this.world,
      Z = W.zone;
    const hw = T.w / 2 + 1.2;
    const k = Math.sqrt(W.k || 1);
    for (let tries = 0; tries < 30; tries++) {
      // 後半改試小一點的環線（洋上都市的街區、狹長的作戰區域）
      const small = tries >= 15;
      const R = (small ? 12 + rng() * 14 : 24 + rng() * 34) * k + T.len * 0.8;
      const mx = Math.min(R * 0.7, (Z[1] - Z[0]) / 2 - 10),
        mz = Math.min(R * 0.7, (Z[3] - Z[2]) / 2 - 10);
      const cx = Z[0] + 10 + mx + rng() * Math.max(1, Z[1] - Z[0] - 20 - mx * 2);
      const cz = Z[2] + 10 + mz + rng() * Math.max(1, Z[3] - Z[2] - 20 - mz * 2);
      const n = 6 + Math.floor(rng() * 3);
      const a0 = rng() * Math.PI * 2;
      const pts = [];
      for (let j = 0; j < n; j++) {
        const a = a0 + (j / n) * Math.PI * 2 + (rng() - 0.5) * 0.4;
        const r = R * (0.65 + rng() * 0.35);
        for (const f of [1, 0.8, 0.6]) {
          const x = cx + Math.cos(a) * r * f,
            z = cz + Math.sin(a) * r * f;
          if (this.mvFree(x, z, hw) !== null) {
            pts.push([x, z]);
            break;
          }
        }
      }
      // 開不過的段落：拿掉後一個點，再檢查新的段落
      let bad = true;
      while (bad && pts.length >= 4) {
        bad = false;
        for (let i = 0; i < pts.length; i++) {
          const j = (i + 1) % pts.length;
          if (!this.mvSegOk(pts[i], pts[j], hw)) {
            pts.splice(j, 1);
            bad = true;
            break;
          }
        }
      }
      if (pts.length < 4) continue;
      let per = 0;
      for (let i = 0; i < pts.length; i++) {
        const b = pts[(i + 1) % pts.length];
        per += Math.hypot(b[0] - pts[i][0], b[1] - pts[i][1]);
      }
      if (per > (small ? 45 : 70) + T.len * (small ? 2 : 3)) return pts;
    }
    return null;
  },
  // 命中目標（map-extras.js 的 destructibles）
  mvTargets(out) {
    for (const v of this.mvs || []) if (!v.dead) for (const pt of v.parts) out.push(pt);
  },
  // 每格（updateMapExtras）：單機／房主判定
  mvTick(dt) {
    const L = this.mvs;
    if (!L || !(dt > 0)) return;
    if (this.net && this.net.role === 'client') return;
    const mechs = this.crowdMechs();
    const C = this.crowd;
    for (const v of L) {
      if (!v.dead) v.tick(dt, this.mvBlocked(v, mechs, C));
      else v.tick(dt, true);
    }
    this.mvMechTick(mechs);
  },
  // 前方（車頭到煞車距離）有機甲、人、別的車、障礙物
  mvBlocked(v, mechs, C) {
    if (v.mode === 'rev') return false;
    if (v.hitWall) return true;
    const ahead = v.len / 2 + 2.5 + Math.max(0, v.spd) * 1.1;
    const half = v.w / 2 + 0.8;
    const hit = (x, z, r) => {
      const [lx, lz] = v.local(x, z);
      return lz > v.len * 0.3 && lz < ahead + r && Math.abs(lx) < half + r;
    };
    for (const m of mechs) if (hit(m.pos.x, m.pos.z, (m.radius || 2) * 0.8)) return true;
    if (C && C.list)
      for (const h of C.list)
        if (h.alive && h.st !== 'chute' && Math.abs(h.y - v.pos.y) < 3 && hit(h.x, h.z, 0.5)) return true;
    for (const o of this.mvs) {
      if (o === v) continue;
      for (const pt of o.parts) {
        const c = pt.center();
        if (hit(c.x, c.z, pt.radius)) return true;
      }
    }
    return false;
  },
  // 機甲踩扁小車（走過、QB 撞到）；大車與大車的殘骸擋住機甲
  mvMechTick(mechs) {
    for (const v of this.mvs) {
      if (v.crushed) continue;
      for (const m of mechs) {
        if (m.flying || !m.vel) continue;
        if (m.pos.y > v.pos.y + v.h + 1) continue; // 站在上面、飛過去的不算
        const [lx, lz] = v.local(m.pos.x, m.pos.z);
        if (v.T.crush) {
          const v2 = m.vel.x * m.vel.x + m.vel.z * m.vel.z;
          if (v2 < 1) continue;
          const R = Math.max(this.crowdCrushR(m) + 0.3, (m.radius || 2) * 0.8 + 0.3);
          if (Math.abs(lx) < v.w / 2 + R && Math.abs(lz) < v.len / 2 + R) {
            const dir = new THREE.Vector3(m.vel.x, 0, m.vel.z).normalize();
            this.mvKill(v, m, { cr: true, dir });
            m.vel.x *= 0.85;
            m.vel.z *= 0.85;
            if (m === this.player) this.rumbleAt(v.center(), 0.3, 0.2, 90, 20);
            break;
          }
        } else {
          // 擋住：往穿入最淺的那一邊推出去
          const r = (m.radius || 2) * 0.8;
          const px = v.w / 2 + r - Math.abs(lx),
            pz = v.len / 2 + r - Math.abs(lz);
          if (px <= 0 || pz <= 0) continue;
          const s = Math.sin(v.yaw),
            c = Math.cos(v.yaw);
          let ox, oz;
          if (px < pz) {
            const d = Math.sign(lx || 1) * px;
            ox = d * c;
            oz = -d * s;
          } else {
            const d = Math.sign(lz || 1) * pz;
            ox = d * s;
            oz = d * c;
          }
          m.pos.x += ox;
          m.pos.z += oz;
          // 往車子裡的速度拿掉
          const L = Math.hypot(ox, oz) || 1;
          const nx = ox / L,
            nz = oz / L;
          const vin = m.vel.x * nx + m.vel.z * nz;
          if (vin < 0) {
            m.vel.x -= vin * nx;
            m.vel.z -= vin * nz;
          }
        }
      }
    }
  },
  // 損毀（房主／單機）：by＝動手的（玩家的算進人員擊殺數：駕駛還在車上）；o.cr＝被踩扁
  mvKill(v, by, o = {}) {
    if (v.dead && (!o.cr || v.crushed)) return;
    const wasDead = v.dead;
    if (wasDead) {
      // 殘骸再被踩：只是變扁
      v.dead = false;
      v.wreck(o);
      return;
    }
    v.wreck(o);
    const c = v.center();
    if (v.occ && by && by === this.player) {
      if (!this.hk) this.hkReset();
      this.hkOn = true;
      this.hk.civ = (this.hk.civ || 0) + v.occ;
      const S = this.save;
      if (S) {
        S.hk = S.hk || { civ: 0, foe: 0 };
        S.hk.civ = (S.hk.civ || 0) + v.occ;
      }
    }
    v.occ = 0;
    if (this.crowd) this.crowdScare(c, 22);
    if (Math.random() < MV_DROP) {
      const W = this.world;
      const x = v.pos.x + (Math.random() - 0.5) * 3,
        z = v.pos.z + (Math.random() - 0.5) * 3;
      this.spawnPickup('repair', new THREE.Vector3(x, W.groundAt(x, z, v.pos.y + 2) + 0.6, z));
    }
  },
});
