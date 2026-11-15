// Game 的 mixin：地圖上會動的載具（docs/map-vehicles-design.md）——各主題放哪些車、環狀路線的規畫、每格的更新
// （前方被擋住就停、倒車、掉頭）、機甲踩扁小車、大車擋住機甲、打壞時的駕駛與掉落。載具本身在 world/map-veh.js。
// 第 1 期：只有單機（多人第 5 期）；路線用自己的亂數串（不動關卡生成的亂數）。
import { makeRng } from '../core/math.js';
import { MV_DROP, MV_THEMES, MV_TYPES, MV_WORK } from '../data/map-veh.js';
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
    if (typeof window !== 'undefined' && window.__mvOff) return; // 量測的比較用（scripts/perf-campaign.js --nomv）
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
    this.mvNoGo = []; // 作業的地方：[x, z, 半徑]（巡行的路線避開）
    this.mvSpots = []; // 工人圍著做事的地方（crowdPlan）：{ x, z, r }
    // 作業（第 2 期）：先放，巡行的路線再避開它們
    const wl = (MV_WORK[W.themeKey] || []).slice();
    let nw = wl.length ? 1 + Math.floor(rng() * 2) + (area > 300 * 300 ? 1 : 0) : 0;
    if (W.opt && W.opt.open) nw = 0;
    for (let k = 0; k < nw && wl.length; k++) this.mvJob(rng, wl.splice(Math.floor(rng() * wl.length), 1)[0]);
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
    // 夜間：作業的地方旁邊放照明塔（第 3 期，最多 2 座）
    if (this.mvNight()) {
      const sp = this.mvSpots.slice(0, 2);
      if (!sp.length) {
        const E = this.mvSpot(rng, 3);
        if (E) sp.push({ x: E[0], z: E[1], r: 0 });
      }
      for (const s of sp)
        for (let t = 0; t < 8; t++) {
          const a = rng() * Math.PI * 2,
            r = s.r + 6 + rng() * 3;
          const x = s.x + Math.sin(a) * r,
            z = s.z + Math.cos(a) * r;
          if (this.mvFree(x, z, 1.6) === null) continue;
          this.mvAdd(
            'lighttower',
            [
              [x, z],
              [x + Math.sin(a + Math.PI), z + Math.cos(a + Math.PI)],
            ],
            {
              job: { k: 'static' },
            },
          );
          this.mvNoGo.push([x, z, 3]);
          break;
        }
    }
    if (!this.mvs.length) this.mvs = null;
  },
  // 夜晚的地圖（和過場的 c.night 相同的判斷）
  mvNight() {
    const W = this.world;
    return !!W && (W.tod === 'night' || !!(W.theme && W.theme.noTod && !W.theme.roof));
  },
  // 附近開火、爆炸（crowd.js 的 crowdScare 一起呼叫）：範圍裡的車受驚（world/map-veh.js 的 alarm）
  mvScare(pos, r) {
    if (!this.mvs || (this.net && this.net.role === 'client')) return;
    for (const v of this.mvs) if (!v.dead && Math.hypot(v.pos.x - pos.x, v.pos.z - pos.z) < r) v.alarm(pos);
  },
  // 駕駛下車：車門旁邊放一個平民（小人系統），往遠離威脅的方向逃
  mvDriverOut(v, src) {
    if (!this.crowd || !this.crowdCivAt) return;
    const s = Math.sin(v.yaw),
      c = Math.cos(v.yaw);
    for (const side of [1, -1]) {
      const d = v.w / 2 + 1.1;
      const x = v.pos.x + c * d * side,
        z = v.pos.z - s * d * side;
      if (!this.crowdFree(x, z)) continue;
      this.crowdCivAt(x, z, src ? src.x : v.pos.x, src ? src.z : v.pos.z);
      return;
    }
  },
  mvClear() {
    for (const v of this.mvs || []) v.cleanup();
    this.mvs = null;
    this.mvSpots = null;
    this.mvNoGo = null;
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
    for (const q of this.mvNoGo || []) if (Math.hypot(x - q[0], z - q[1]) < q[2] + hw) return null;
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
  // ---------- 作業（第 2 期）----------
  // 平坦、空曠（半徑 r）、離玩家 30 m 以上的一點：[x, z]
  mvSpot(rng, r) {
    const W = this.world,
      Z = W.zone,
      pl = this.player;
    for (let t = 0; t < 40; t++) {
      const x = Z[0] + r + 6 + rng() * Math.max(1, Z[1] - Z[0] - 2 * r - 12);
      const z = Z[2] + r + 6 + rng() * Math.max(1, Z[3] - Z[2] - 2 * r - 12);
      if (pl && Math.hypot(x - pl.pos.x, z - pl.pos.z) < 30) continue;
      const y = this.mvFree(x, z, r);
      if (y === null) continue;
      let flat = true;
      for (let i = 0; i < 4 && flat; i++) {
        const a = (i * Math.PI) / 2;
        const yy = W.groundAt(x + Math.cos(a) * r, z + Math.sin(a) * r, y + 2);
        if (Math.abs(yy - y) > 1) flat = false;
      }
      if (flat) return [x, z];
    }
    return null;
  },
  // 兩點之間的直線作業：A 空曠（ra）、A → B（長 L）開得過；dir0＝方向（沒有時隨機）
  mvLine(rng, hw, L, ra, A0, dir0) {
    for (let t = 0; t < (A0 ? 10 : 24); t++) {
      const A = A0 || this.mvSpot(rng, ra);
      if (!A) continue;
      const a = dir0 !== undefined ? dir0 + (rng() - 0.5) * 1.2 : rng() * Math.PI * 2;
      const B = [A[0] + Math.sin(a) * L, A[1] + Math.cos(a) * L];
      if (this.mvFree(B[0], B[1], hw + 1) !== null && this.mvSegOk(A, B, hw)) return [A, B];
    }
    return null;
  },
  mvNoGoLine(A, B, r) {
    const L = Math.hypot(B[0] - A[0], B[1] - A[1]),
      n = Math.ceil(L / 3);
    for (let i = 0; i <= n; i++)
      this.mvNoGo.push([A[0] + ((B[0] - A[0]) * i) / n, A[1] + ((B[1] - A[1]) * i) / n, r]);
  },
  mvAdd(key, route, o) {
    const v = new MapVeh(this, key, route, o);
    this.mvs.push(v);
    return v;
  },
  // 一個作業：forklift／crane／dozer／dig
  mvJob(rng, j) {
    const ofs = (A, B, d) => {
      // A 端旁邊（線的側面 d 公尺）：工人站的地方
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
      return { x: A[0] + ((B[1] - A[1]) / L) * d, z: A[1] - ((B[0] - A[0]) / L) * d, r: 1 };
    };
    if (j === 'forklift' || j === 'dozer') {
      const key = j === 'dozer' ? 'bulldozer' : 'forklift';
      const T = MV_TYPES[key];
      const hw = T.w / 2 + 1;
      const AB = this.mvLine(rng, hw, j === 'dozer' ? 14 + rng() * 6 : 11 + rng() * 5, hw + 2);
      if (!AB) return;
      this.mvAdd(key, AB, { job: { k: 'line' } });
      this.mvNoGoLine(AB[0], AB[1], hw + 2);
      this.mvSpots.push(ofs(AB[0], AB[1], j === 'dozer' ? 6 : 4));
    } else if (j === 'crane') {
      const E = this.mvSpot(rng, 8);
      if (!E) return;
      const a = rng() * Math.PI * 2;
      this.mvAdd('crane', [E, [E[0] + Math.sin(a), E[1] + Math.cos(a)]], { job: { k: 'lift' } });
      this.mvNoGo.push([E[0], E[1], 10]);
      this.mvSpots.push({ x: E[0], z: E[1], r: 5 });
    } else if (j === 'dig') {
      // 挖土機＋礦用卡車：卡車在挖土機旁邊的 A 裝貨（車尾朝挖土機）、開到 B 翻斗卸料、倒車回 A
      const E = this.mvSpot(rng, 6);
      if (!E) return;
      let AB = null;
      for (let t = 0; t < 8 && !AB; t++) {
        const a = rng() * Math.PI * 2;
        const A = [E[0] + Math.sin(a) * 8.5, E[1] + Math.cos(a) * 8.5];
        if (this.mvFree(A[0], A[1], 2.6) === null) continue;
        AB = this.mvLine(rng, 2.6, 22 + rng() * 10, 2.6, A, a);
      }
      const ya = AB ? Math.atan2(AB[0][0] - E[0], AB[0][1] - E[1]) + Math.PI / 2 : rng() * Math.PI * 2;
      const ex = this.mvAdd('excavator', [E, [E[0] + Math.sin(ya), E[1] + Math.cos(ya)]], {
        job: { k: 'dig', dump: 1.4 },
      });
      // 卸料轉到卡車的方向（上部旋轉的角度＝卡車在挖土機座標裡的方向）
      if (AB) {
        const [lx, lz] = ex.local(AB[0][0], AB[0][1]);
        ex.job.dump = Math.atan2(lx, lz);
        this.mvAdd('hauler', AB, { job: { k: 'line' } });
        this.mvNoGoLine(AB[0], AB[1], 4.5);
      }
      this.mvNoGo.push([E[0], E[1], 7]);
      this.mvSpots.push({ x: E[0], z: E[1], r: 4 });
    }
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
    // 開走離場的車
    for (let i = L.length - 1; i >= 0; i--)
      if (L[i].gone) {
        L[i].cleanup();
        L.splice(i, 1);
      }
    // 玩家的機甲靠近（16 m）：受驚
    for (const m of mechs)
      if (m.team === 'player')
        for (const v of L)
          if (!v.dead && !v.abandoned && Math.hypot(v.pos.x - m.pos.x, v.pos.z - m.pos.z) < 16)
            v.alarm(m.pos);
    this.mvMechTick(mechs);
    if (this.mvNight()) this.mvLights();
  },
  // 前方（車頭到煞車距離）有機甲、人、別的車、障礙物
  mvBlocked(v, mechs, C) {
    if (v.mode === 'rev') return false;
    if (v.job && v.job.k !== 'line') return false; // 原地作業
    if (v.hitWall && !v.job) return true;
    const sg = v.job && (v.job.ph === 'back' || v.spd < -0.1) ? -1 : 1; // 倒車：看後面
    const ahead = v.len / 2 + 2.5 + Math.abs(v.spd) * 1.1;
    const half = v.w / 2 + 0.8;
    const R = ahead + v.len + 6; // 先用方塊範圍篩掉遠的
    const px = v.pos.x,
      pz = v.pos.z;
    const hit = (x, z, r) => {
      if (Math.abs(x - px) > R || Math.abs(z - pz) > R) return false;
      v.localXZ(x, z);
      const lz = v.lz * sg;
      return lz > v.len * 0.3 && lz < ahead + r && Math.abs(v.lx) < half + r;
    };
    for (const m of mechs) if (hit(m.pos.x, m.pos.z, (m.radius || 2) * 0.8)) return true;
    if (C && C.list && !v.flee)
      // 逃走中不為路上的人停車（被一起逃的人群堵死）

      for (const h of C.list)
        if (h.alive && h.st !== 'chute' && Math.abs(h.y - v.pos.y) < 3 && hit(h.x, h.z, 0.5)) return true;
    for (const o of this.mvs) {
      if (o === v || Math.abs(o.pos.x - px) > R + o.len || Math.abs(o.pos.z - pz) > R + o.len) continue;
      for (const pt of o.parts)
        if (hit(o.pos.x + o.sn * pt.off, o.pos.z + o.cs * pt.off, pt.radius)) return true;
    }
    return false;
  },
  // 夜間的燈（第 3 期）：有人開的車的車頭燈照亮前方的地面、照明塔的燈（特效點光，只有離鏡頭最近的 4 盞會亮）
  mvLights() {
    const fx = this.fx;
    if (!fx || !fx.glow) return;
    for (const v of this.mvs) {
      if (v.dead) continue;
      if (v.key === 'lighttower') {
        const L = v.v.lamp;
        v.mesh.updateWorldMatrix(true, false);
        fx.glow(
          'mv' + v.id,
          v.mesh.localToWorld(new THREE.Vector3(L[0], L[1] - 2, L[2] + 4)),
          2.2,
          0xfff4e0,
          12,
        );
      } else if (v.occ > 0 && v.len > 2) {
        const f = v.fwd();
        const d = v.len / 2 + 3;
        fx.glow(
          'mv' + v.id,
          new THREE.Vector3(v.pos.x + f.x * d, v.pos.y + 1.4, v.pos.z + f.z * d),
          1.3,
          0xfff0d8,
          6,
        );
      }
    }
  },
  // 機甲踩扁小車（走過、QB 撞到）；大車與大車的殘骸擋住機甲
  mvMechTick(mechs) {
    for (const v of this.mvs) {
      if (v.crushed) continue;
      for (const m of mechs) {
        if (m.flying || !m.vel) continue;
        if (m.pos.y > v.pos.y + v.h + 1) continue; // 站在上面、飛過去的不算
        const reach = v.len / 2 + 8;
        if (Math.abs(m.pos.x - v.pos.x) > reach || Math.abs(m.pos.z - v.pos.z) > reach) continue;
        v.localXZ(m.pos.x, m.pos.z);
        const lx = v.lx,
          lz = v.lz;
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
    // 油罐車、熔岩運輸車：大爆炸（範圍裡的機甲、別的車、地圖物件都受傷；連鎖）＋燃燒的地面
    if (v.T.boom && !o.cr) {
      this.explodeAt(c, v.T.boom[0], 600, v.T.boom[1], by || null);
      if (this.addPool) this.addPool(by || null, v.pos, 3.2, 16, 45);
      this.rumbleAt(c, 1, 0.6, 400, 70);
    }
    this.crowdScare(c, 22); // 也會嚇到附近的車（mvScare）
    if (Math.random() < MV_DROP) {
      const W = this.world;
      const x = v.pos.x + (Math.random() - 0.5) * 3,
        z = v.pos.z + (Math.random() - 0.5) * 3;
      this.spawnPickup('repair', new THREE.Vector3(x, W.groundAt(x, z, v.pos.y + 2) + 0.6, z));
    }
  },
});
