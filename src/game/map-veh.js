// Game 的 mixin：地圖上會動的載具（docs/map-vehicles-design.md）——各主題放哪些車、環狀路線的規畫、每格的更新
// （前方被擋住就停、倒車、掉頭）、機甲踩扁小車、大車擋住機甲、打壞時的駕駛與掉落。載具本身在 world/map-veh.js。
// 第 1 期：只有單機（多人第 5 期）；路線用自己的亂數串（不動關卡生成的亂數）。
import { makeRng } from '../core/math.js';
import { MV_AIR, MV_DROP, MV_SEG, MV_THEMES, MV_TYPES, MV_WATER, MV_WORK } from '../data/map-veh.js';
import { local } from '../render/foe-damage.js';
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
    if (!W || !this.scene || o.mv === false) return; // 自訂關卡的底圖「地圖上的載具：不放」
    const set = (this.ctrl && this.ctrl.mapVeh) || 'many'; // 設定「地圖上的載具」：many／few／off
    if (set === 'off') return;
    const segK = (this.camp && this.camp.ss && MV_SEG[this.camp.ss.type]) ?? 1; // 主線：依區段類型
    const K = (set === 'few' ? 0.5 : 1) * segK;
    if (this.airMode || this.sim || this.range || this.tut || this.lab || this.cine || this.pvp) return;
    if (this.net && this.net.role === 'client') return; // 客機：照房主送來的（mvNetEvent）
    if (typeof window !== 'undefined' && window.__mvOff) return; // 量測的比較用（scripts/perf-campaign.js --nomv）
    const k0 = W.themeKey;
    const list = MV_THEMES[k0] || [];
    if (!list.length && !MV_WORK[k0] && !MV_WATER[k0] && !MV_AIR[k0]) return;
    const rng = makeRng(((W.seed | 0) * 173 + 11) >>> 0);
    const Z = W.zone;
    const area = Math.max(1, (Z[1] - Z[0]) * (Z[3] - Z[2]));
    let n = Math.round((4 + rng() * 4) * Math.min(1.4, Math.sqrt(area / (230 * 230))));
    if (W.opt && W.opt.open) n = Math.min(n, 2); // Boss 關：地圖要開闊
    n = Math.max(K < 0.5 ? 1 : 2, Math.min(9, Math.round(n * K)));
    const used = {};
    const pl = this.player;
    this.mvs = [];
    this.mvNoGo = []; // 作業的地方：[x, z, 半徑]（巡行的路線避開）
    this.mvSpots = []; // 工人圍著做事的地方（crowdPlan）：{ x, z, r }
    // 作業（第 2 期）：先放，巡行的路線再避開它們
    const wl = (MV_WORK[W.themeKey] || []).slice();
    let nw = wl.length ? 1 + Math.floor(rng() * 2) + (area > 300 * 300 ? 1 : 0) : 0;
    nw = Math.round(nw * Math.min(1, K));
    if (W.opt && W.opt.open) nw = 0;
    for (let k = 0; k < nw && wl.length; k++) this.mvJob(rng, wl.splice(Math.floor(rng() * wl.length), 1)[0]);
    for (let i = 0, tries = 0; list.length && i < n && tries < n * 3; tries++) {
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
    // 水上與空中（第 4 期）
    this.mvPlanWater(rng);
    this.mvPlanAir(rng);
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
  // 水上：深 1.8 m 以上、四周 hw 也有 1 m 以上的水、沒有障礙物（橋墩）；氣墊船陸上也行
  mvWaterFree(x, z, hw, hover) {
    const W = this.world,
      Z = W.zone;
    if (!W.theme.water) return null;
    const m = hw + 4;
    if (x < Z[0] + m || x > Z[1] - m || z < Z[2] + m || z > Z[3] - m) return null;
    const L = W.theme.water.level;
    const deep = W.waterDepth(x, z) >= 1.8;
    if (!deep) return hover ? this.mvFree(x, z, hw) : null;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      if (W.waterDepth(x + Math.cos(a) * hw, z + Math.sin(a) * hw) < 1)
        return hover ? this.mvFree(x, z, hw) : null;
    }
    for (const q of this.mvNoGo || []) if (Math.hypot(x - q[0], z - q[1]) < q[2] + hw) return null;
    const [cx, cz] = W.collide(x, z, L + 0.6, hw);
    if (Math.abs(cx - x) + Math.abs(cz - z) > 0.05) return null;
    return L;
  },
  mvPlanWater(rng) {
    const W = this.world;
    const wl = (MV_WATER[W.themeKey] || []).slice();
    if (!wl.length || !W.theme.water || (W.opt && W.opt.open)) return;
    const pl = this.player;
    const n = 1 + Math.floor(rng() * Math.min(3, wl.length));
    for (let k = 0; k < n && wl.length; k++) {
      const key = wl.splice(Math.floor(rng() * wl.length), 1)[0];
      const T = MV_TYPES[key];
      if (key === 'cargoship') {
        this.mvShip(rng, T);
        continue;
      }
      const route = this.mvRoute(rng, T, (x, z, hw) => this.mvWaterFree(x, z, hw, T.hover));
      if (!route) continue;
      const dist = ([x, z]) => (pl ? Math.hypot(x - pl.pos.x, z - pl.pos.z) : 99);
      let si = 0;
      route.forEach((p, j) => {
        if (dist(p) > dist(route[si])) si = j;
      });
      this.mvAdd(key, route, { i: si, dir: rng() < 0.5 ? 1 : -1 });
    }
  },
  // 貨輪：作戰區域外 50～90 m 的海面，沿著那一邊開過去（水夠深的那一邊）
  mvShip(rng, T) {
    const W = this.world,
      Z = W.zone;
    for (let t = 0; t < 8; t++) {
      const side = Math.floor(rng() * 4),
        off = 50 + rng() * 40;
      const along = side < 2;
      const c = side % 2 ? (along ? Z[1] + off : Z[3] + off) : along ? Z[0] - off : Z[2] - off;
      const a0 = along ? Z[2] - 120 : Z[0] - 120,
        a1 = along ? Z[3] + 120 : Z[1] + 120;
      const A = along ? [c, a0] : [a0, c],
        B = along ? [c, a1] : [a1, c];
      let ok = true;
      for (let i = 0; i <= 8 && ok; i++) {
        const x = A[0] + ((B[0] - A[0]) * i) / 8,
          z = A[1] + ((B[1] - A[1]) * i) / 8;
        if (W.waterDepth(x, z) < 6) ok = false;
      }
      if (!ok) continue;
      const v = this.mvAdd('cargoship', [A, B], { job: { k: 'ship' } });
      v.job.s = rng() * v.job.L;
      return;
    }
  },
  mvPlanAir(rng) {
    const W = this.world;
    const al = (MV_AIR[W.themeKey] || []).slice();
    if (!al.length || (W.opt && W.opt.open)) return;
    const Z = W.zone;
    for (const key of al) {
      if (W.themeKey === 'spaceport' && key === 'shuttle') {
        // 停在坪上（平坦、半徑 14 m 空曠）
        const E = this.mvSpot(rng, 14);
        if (!E) continue;
        const a = rng() * Math.PI * 2;
        const v = this.mvAdd('shuttle', [E, [E[0] + Math.sin(a), E[1] + Math.cos(a)]], {
          job: { k: 'pad', ph: 'park', px: E[0], pz: E[1], wait: 40 + rng() * 60 },
        });
        v.job.ph = 'park';
        this.mvNoGo.push([E[0], E[1], 16]);
        this.mvSpots.push({ x: E[0], z: E[1], r: 13 });
      } else if (key === 'shuttle') {
        // 高空軌道：從上空飛過
        const a = rng() * Math.PI * 2;
        const cx = (Z[0] + Z[1]) / 2,
          cz = (Z[2] + Z[3]) / 2;
        const L = Math.max(Z[1] - Z[0], Z[3] - Z[2]) + 200;
        const v = this.mvAdd(
          'shuttle',
          [
            [cx, cz],
            [cx + Math.sin(a), cz + Math.cos(a)],
          ],
          {
            job: {
              k: 'transit',
              cx,
              cz,
              ux: Math.sin(a),
              uz: Math.cos(a),
              L,
              dir: 1,
              y: W.groundRef(cx, cz, 0) + 60,
            },
          },
        );
        v.job.pt = rng() * 20;
      } else {
        // 作業艇、吊艙：平台上空 14～30 m 漂
        let E = null;
        for (let t = 0; t < 20 && !E; t++) {
          const x = Z[0] + 20 + rng() * (Z[1] - Z[0] - 40),
            z = Z[2] + 20 + rng() * (Z[3] - Z[2] - 40);
          if (!(W.isVoid && W.isVoid(x, z))) E = [x, z];
        }
        if (!E) continue;
        const gy = W.groundAt(E[0], E[1], 999);
        const v = this.mvAdd(key, [E, [E[0], E[1] + 1]], {
          v: Math.floor(rng() * 3),
          job: {
            k: 'drift',
            ax: E[0],
            az: E[1],
            ay: gy + 14 + rng() * 16,
            rx: 8 + rng() * 10,
            rz: 8 + rng() * 10,
            yaw0: rng() * Math.PI * 2,
          },
        });
        v.driftTick(0);
      }
    }
  },
  // ---------- 多人（第 5 期）：房主送清單與狀態，客機只顯示 ----------
  // 狀態的階段名稱（送索引）
  mvPhases: ['go', 'opB', 'back', 'opA', 'park', 'up', 'out', 'in', 'down'],
  // 一台的規格（客機照這個建同樣的載具；房主遷移時新房主照它接著跑）
  mvSpec(v) {
    const j = v.job ? {} : null;
    if (j)
      for (const [k, x] of Object.entries(v.job))
        if (typeof x === 'number' || typeof x === 'string') j[k] = typeof x === 'number' ? +x.toFixed(2) : x;
    return { i: v.id, k: v.key, v: v.vv, r: v.route.map((p) => [+p[0].toFixed(1), +p[1].toFixed(1)]), j };
  },
  // 一台的狀態：[編號, x, z, y, 方向, 速度, 旗標（1 損毀 2 扁 4 棄車 8 有人 16 逃走中）＋階段×32, 作業的時間, 作業的階段, 階段的時間]
  mvState(v, out) {
    const J = v.job;
    out.push(
      v.id,
      +v.pos.x.toFixed(2),
      +v.pos.z.toFixed(2),
      +v.pos.y.toFixed(2),
      +v.yaw.toFixed(3),
      +v.spd.toFixed(2),
      (v.dead ? 1 : 0) |
        (v.crushed ? 2 : 0) |
        (v.abandoned ? 4 : 0) |
        (v.occ ? 8 : 0) |
        (v.flee ? 16 : 0) |
        (v.st << 5),
      J ? +J.t.toFixed(2) : 0,
      J ? this.mvPhases.indexOf(J.ph) : -1,
      J ? +(J.opT || 0).toFixed(2) : 0,
    );
  },
  // 完整清單（all：客機移除清單裡沒有的）
  mvNetFull(list = this.mvs || [], all = true) {
    const s = [];
    for (const v of list) this.mvState(v, s);
    this.netEv({ t: 'mvf', a: all ? 1 : 0, l: list.map((v) => this.mvSpec(v)), s });
  },
  // 房主：每 5 秒完整清單（中途加入、房主遷移），每 0.1 秒位置與狀態
  mvSync(dt) {
    this.mvFullT = (this.mvFullT === undefined ? 0.5 : this.mvFullT) - dt;
    this.mvSyncT = (this.mvSyncT || 0) - dt;
    if (this.mvFullT <= 0) {
      this.mvFullT = 5;
      this.mvNetFull();
    } else if (this.mvSyncT <= 0) {
      this.mvSyncT = 0.1;
      const s = [];
      for (const v of this.mvs) if (!v.dead || !v.landed) this.mvState(v, s);
      this.netEv({ t: 'mvw', s });
    }
  },
  // 客機：套用一台的狀態（a＝狀態陣列、k＝起點）
  mvApply(a, k) {
    const v = (this.mvs || []).find((x) => x.id === a[k]);
    if (!v) return;
    const f = a[k + 6];
    v.net = { x: a[k + 1], z: a[k + 2], y: a[k + 3], yaw: a[k + 4], spd: a[k + 5] };
    if (!v.inited) {
      // 第一次：直接放到位置上（不從建立的地方內插過去）
      v.inited = true;
      v.pos.set(a[k + 1], a[k + 3], a[k + 2]);
      v.yaw = a[k + 4];
    }
    if (f & 4) v.abandoned = true;
    v.occ = f & 8 ? 1 : 0;
    v.flee = f & 16 ? v.flee || {} : null;
    v.applyStage(f >> 5, false);
    const J = v.job;
    if (J && a[k + 8] >= 0) {
      const ph = this.mvPhases[a[k + 8]];
      if (J.ph !== ph) J.opT = a[k + 9];
      J.ph = ph;
      if (Math.abs(J.t - a[k + 7]) > 0.5) J.t = a[k + 7];
    }
    if (f & 1 && !v.dead) v.breakDown({ cr: !!(f & 2), quiet: true }); // 中途加入：已經壞掉的
  },
  // 客機：房主的事件（mvf／mvw／mvd／mvg／mvk）；回傳 true＝處理了
  mvNetEvent(e) {
    if (e.t === 'mvf') {
      if (!this.world || !this.scene) return true;
      if (!this.mvs) this.mvs = [];
      const ids = new Set(e.l.map((q) => q.i));
      if (e.a)
        for (let i = this.mvs.length - 1; i >= 0; i--)
          if (!ids.has(this.mvs[i].id)) {
            this.mvs[i].cleanup();
            this.mvs.splice(i, 1);
          }
      for (const q of e.l) {
        if (this.mvs.some((v) => v.id === q.i) || !MV_TYPES[q.k]) continue;
        const v = new MapVeh(this, q.k, q.r, { id: q.i, v: q.v, remote: true, job: q.j ? { ...q.j } : null });
        if (q.j) Object.assign(v.job, q.j);
        this.mvs.push(v);
      }
      for (let k = 0; k + 9 < e.s.length; k += 10) this.mvApply(e.s, k);
      return true;
    }
    if (e.t === 'mvw') {
      for (let k = 0; k + 9 < e.s.length; k += 10) this.mvApply(e.s, k);
      return true;
    }
    const v = (this.mvs || []).find((x) => x.id === e.i);
    if (e.t === 'mvd') {
      if (v) {
        if (v.dead && e.c && !v.crushed) v.dead = false; // 殘骸被踩扁
        if (!v.dead) v.breakDown({ cr: !!e.c });
      }
      return true;
    }
    if (e.t === 'mvg') {
      if (v) {
        v.cleanup();
        this.mvs.splice(this.mvs.indexOf(v), 1);
      }
      return true;
    }
    if (e.t === 'mvk') {
      if (this.net && e.s === this.net.me) this.mvKills = (this.mvKills || 0) + 1;
      return true;
    }
    return false;
  },
  // 房主遷移：客機的載具改成自己判定（位置、作業的階段已經照舊房主最後送來的）
  mvPromote() {
    for (const v of this.mvs || []) {
      v.remote = false;
      v.placed = false;
    }
    this.mvFullT = 0.5;
  },
  // 自訂關卡的單位「地圖載具」（level-play.js）：有路徑時沿路徑開（兩個點的堆高機、推土機、礦用卡車在兩點之間作業），
  // 沒有路徑時挖土機、吊車原地作業，其他停著（駕駛受驚會下車逃）
  mvSpawnUnit(u, at) {
    const T = MV_TYPES[u.type];
    if (!T || !this.world || !this.scene) return null;
    if (!this.mvs) this.mvs = [];
    if (!this.mvNoGo) this.mvNoGo = [];
    if (!this.mvSpots) this.mvSpots = [];
    const P = this.lv && this.lv.L.paths.find((p) => p.id === (u.beh && u.beh.path));
    const pts = P ? P.pts.map((q) => [q[0], q[1]]) : null;
    const yaw = u.yaw || 0;
    let v;
    if (pts && pts.length >= 2) {
      const line = pts.length === 2 && ['forklift', 'bulldozer', 'hauler'].includes(u.type);
      v = this.mvAdd(u.type, pts, line ? { job: { k: 'line' } } : { i: 0, dir: 1 });
    } else {
      const k = u.type === 'excavator' ? 'dig' : u.type === 'crane' ? 'lift' : 'static';
      v = this.mvAdd(
        u.type,
        [
          [at.x, at.z],
          [at.x + Math.sin(yaw), at.z + Math.cos(yaw)],
        ],
        {
          job: { k, dump: 1.4 },
        },
      );
    }
    if (this.net && this.net.role === 'host') this.mvNetFull([v], false);
    return v;
  },
  // 結果畫面的一列（這一場打壞過載具時）
  mvRows() {
    return this.mvKills ? [['載具擊毀', `${this.mvKills} 台`]] : [];
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
    this.mvFullT = 0.5; // 多人：開局的事件會被清掉，0.5 秒後送第一份完整清單
    this.mvPads = null;
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
  mvSegOk(a, b, hw, free) {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(L / STEP));
    let py = null;
    for (let s = 0; s <= n; s++) {
      const x = a[0] + ((b[0] - a[0]) * s) / n,
        z = a[1] + ((b[1] - a[1]) * s) / n;
      const y = free ? free(x, z, hw) : this.mvFree(x, z, hw);
      if (y === null) return false;
      if (py !== null && Math.abs(y - py) > SLOPE) return false;
      py = y;
    }
    return true;
  },
  // 環狀路線：在作戰區域裡挑一個中心，繞一圈放 6～8 個點（碰到障礙物就往內縮），開不過的段落把點拿掉
  mvRoute(rng, T, free) {
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
          if ((free ? free(x, z, hw) : this.mvFree(x, z, hw)) !== null) {
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
          if (!this.mvSegOk(pts[i], pts[j], hw, free)) {
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
    const fx = this.fx;
    if (this.net && this.net.role === 'client') {
      local(fx, () => {
        for (const v of L) v.tick(dt, false);
      });
      if (this.mvNight()) this.mvLights();
      return;
    }
    const mechs = this.crowdMechs();
    const C = this.crowd;
    local(fx, () => {
      for (const v of L) {
        if (!v.dead) v.tick(dt, this.mvBlocked(v, mechs, C));
        else v.tick(dt, true);
      }
    });
    if (this.net && this.net.role === 'host') this.mvSync(dt);
    // 開走離場的車（起飛離場的穿梭機：40 秒後另一架降落到同一個坪）
    for (let i = L.length - 1; i >= 0; i--)
      if (L[i].gone) {
        const v = L[i];
        if (v.job && v.job.k === 'pad')
          (this.mvPads || (this.mvPads = [])).push({ t: 40, J: v.job, yaw: v.yaw });
        v.cleanup();
        L.splice(i, 1);
        this.netEv({ t: 'mvg', i: v.id });
      }
    if (this.mvPads)
      for (let i = this.mvPads.length - 1; i >= 0; i--) {
        const q = this.mvPads[i];
        if ((q.t -= dt) > 0) continue;
        this.mvPads.splice(i, 1);
        const J = q.J,
          d = 180;
        const v = this.mvAdd(
          'shuttle',
          [
            [J.px, J.pz],
            [J.px + Math.sin(q.yaw), J.pz + Math.cos(q.yaw)],
          ],
          {
            job: {
              k: 'pad',
              px: J.px,
              pz: J.pz,
              sx: J.px - Math.sin(q.yaw) * d,
              sz: J.pz - Math.cos(q.yaw) * d,
            },
          },
        );
        v.job.ph = 'in';
        v.job.pt = 0;
        if (this.net && this.net.role === 'host') this.mvNetFull([v], false);
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
    if (v.job && v.job.k !== 'line') return false; // 原地作業、空中、貨輪
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
      if (v.crushed || (v.T.air && !v.onPad() && !v.landed) || v.job?.k === 'ship') continue;
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
          // 推過去會掉進虛空（洋上都市的平台邊緣）：不推（寧可和車重疊，不把機體推下海）
          const W = this.world;
          if (W.isVoid && W.isVoid(m.pos.x + ox, m.pos.z + oz) && !W.isVoid(m.pos.x, m.pos.z)) continue;
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
    this.netEv({ t: 'mvd', i: v.id, c: o.cr ? 1 : 0 });
    if (wasDead) {
      // 殘骸再被踩：只是變扁
      v.dead = false;
      v.breakDown(o);
      return;
    }
    v.breakDown(o);
    // 載具擊毀數（結果畫面）：只算玩家打壞的（多人：記在動手的那位玩家名下）
    if (by && by.team === 'player' && by.slot !== undefined && !by.isAI) {
      if (by === this.player) this.mvKills = (this.mvKills || 0) + 1;
      else this.netEv({ t: 'mvk', s: by.slot });
    }
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
