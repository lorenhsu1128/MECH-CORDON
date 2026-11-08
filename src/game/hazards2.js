// Game：地圖專屬敵人用的場上機制（區域效果、臨時障礙物、可以打掉的投射物）
// - addZone(kind, pos, r, life, o)：只在房主／單機呼叫；kind：
//     smoke   煙霧：裡面的目標不能鎖定、穿過煙的視線不通（鎖定 lockPool、敵人的感知 World.losBlocked）
//     gravity 重力場：裡面套 'nojump'
//     suction 吸引：往 o.to（預設中心）吸 o.pull m/s（MechEntity.move 的 zonePull，客機的自身預測也一樣）
//     electro 水面電流：在裡面且站在水中（水深 ≥ 0.3 m）每秒 o.dps（能量）
//     fuel    油漬：o.ignite 秒後變成燃燒地面（addPool：o.burn 秒、o.dps）；被爆發攻擊或燃燒地面碰到提早點燃
//     spot    探照燈：錐形（頂點 pos、o.dir、半角 o.ang、長度 o.len），照到的玩家套 'spotted'
//     beam    追蹤光束：從 o.from（實體或位置，沒給時用 pos）追著 o.target（實體或 id），連續照中越久傷害越高
//             （o.dps0 → o.dps1，o.ramp 秒），被地形／障礙物斷開就重來；顏色黃 → 紅；o.track 追蹤速度（m/s）
//   o.src＝擁有者（實體或 id，傷害與狀態的來源）、o.team＝影響誰的敵人（預設擁有者的隊伍或 enemy）。
//   回傳 id；moveZone(id, pos, dir)、removeZone(id)。各端的顯示以事件 zadd／zmv／zrm／zclr 轉送客機，
//   clearMission 與房主遷移（clearHazards → clearZones）時清掉。
// - addTempWall(pos, o)：臨時障礙物（o.kind 'ice'｜'rock'、o.w／h／d、o.yaw（90° 一格）、o.hp＞0 可以打碎、o.life 秒）：
//   方塊障礙物（碰撞、擋子彈與雷射、遮擋淡出）；房主與客機各一份（事件 twall／twHp／twX），房主遷移後照常。
// - 可以打掉的投射物：Projectile 的 shootable＝血量（shotR 判定半徑、popDmg 擊落時的爆炸傷害）：
//   以代理目標（isShot）加進 destructibles(隊伍)，子彈、爆炸、雷射、近戰都打得到；鎖定清單排在敵人後面。
import { SFX } from '../audio/audio.js';
import { COVER_KINDS, buildCover } from '../render/boss-field-models.js';
import { clamp, lerp, rnd } from '../core/math.js';
import { flingDebris } from '../render/foe-damage.js';
import { Game } from './game.js';
import { BOX, ZONE_FX, smokeH } from '../render/zone-fx.js';

const SHOT_BASE = 900000; // 可以打掉的投射物的代理 id（地圖物件是 800000+）
const MV_DT = 0.1; // moveZone 的同步間隔
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const arr = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];

// 區域的顯示（各端）在 render/zone-fx.js（模型庫的地面標示頁也用）
Object.assign(Game.prototype, ZONE_FX);

Object.assign(Game.prototype, {
  hz2Host() {
    return !(this.net && this.net.role === 'client');
  },
  // ================= 區域效果 =================
  addZone(kind, pos, r, life, o = {}) {
    if (!this.hz2Host() || !this.world) return -1;
    this.zoneSeq = (this.zoneSeq || 0) + 1;
    const src = typeof o.src === 'number' ? this.entById(o.src) : o.src || null;
    const tgt = typeof o.target === 'number' ? this.entById(o.target) : o.target || null;
    const fromEnt = o.from && o.from.isPlayer !== undefined && o.from.pos ? o.from : null;
    const z = {
      i: this.zoneSeq,
      k: kind,
      p: pos.clone(),
      r,
      life,
      max: life,
      t: 0,
      team: o.team || (src && src.team) || 'enemy',
      src,
      tgt,
      fromEnt,
      dir: o.dir ? o.dir.clone().normalize() : new THREE.Vector3(0, -1, 0),
      ang: o.ang || 0.35,
      len: o.len || 30,
      to: o.to ? o.to.clone() : null,
      pull: o.pull || 8,
      dps: o.dps || 0,
      ig: o.ignite || 4,
      burn: o.burn || 8,
      dps0: o.dps0 || 60,
      dps1: o.dps1 || 400,
      ramp: o.ramp || 3,
      track: o.track || 9,
      tick: 0,
      mvT: 0,
      lockT: 0,
    };
    if (kind === 'beam') {
      const from = fromEnt ? fromEnt.center() : o.from && o.from.isVector3 ? o.from.clone() : pos.clone();
      z.p.copy(from);
      const aim = tgt ? tgt.center() : from.clone().add(new THREE.Vector3(0, -5, -10));
      z.end = o.at
        ? o.at.clone()
        : aim.add(new THREE.Vector3(rnd(-6, 6), 0, rnd(-6, 6)).multiplyScalar(this.fx.k));
      z.frac = 0;
    }
    if (!this.zones) this.zones = [];
    this.zones.push(z);
    this.zoneVisual(z);
    this.netEv({
      t: 'zadd',
      i: z.i,
      k: kind,
      p: arr(z.p),
      r,
      l: life,
      tm: z.team,
      o: {
        dir: arr(z.dir),
        ang: z.ang,
        len: z.len,
        to: z.to ? arr(z.to) : null,
        pull: z.pull,
        ig: z.ig,
        end: z.end ? arr(z.end) : null,
        fe: fromEnt ? fromEnt.id : -1,
      },
    });
    return z.i;
  },
  zoneById(id) {
    return (this.zones || []).find((z) => z.i === id) || null;
  },
  moveZone(id, pos, dir) {
    const z = this.zoneById(id);
    if (!z) return;
    if (pos) z.p.copy(pos);
    if (dir) z.dir.copy(dir).normalize();
    z.mvDirty = true;
  },
  removeZone(id) {
    const k = (this.zones || []).findIndex((z) => z.i === id);
    if (k < 0) return;
    this.zoneDrop(k);
    this.netEv({ t: 'zrm', i: id });
  },
  zoneDrop(k) {
    const z = this.zones[k];
    this.zones.splice(k, 1);
    if (z.mesh) {
      this.scene.remove(z.mesh);
      z.mesh.traverse((o) => {
        if (o.material) o.material.dispose();
        if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
      });
    }
    this.zoneLosHook();
  },
  clearZones() {
    for (let k = (this.zones || []).length - 1; k >= 0; k--) this.zoneDrop(k);
    this.zones = [];
    this.netEv({ t: 'zclr' });
  },
  // 影響這個機體嗎（區域的隊伍的敵人）
  zoneHits(z, e) {
    return e && !e.dead && !e.isProp && e.team !== z.team && !(e.team === 'ally' && z.team === 'player');
  },
  // 煙霧：World.losBlocked 也要看煙（敵人的感知）
  zoneLosHook() {
    const w = this.world;
    if (!w) return;
    const any = (this.zones || []).some((z) => z.k === 'smoke');
    w.losHook = any ? (a, b) => this.smokeBetween(a, b) : null;
  },
  // 點在煙裡
  inSmoke(p) {
    for (const z of this.zones || []) {
      if (z.k !== 'smoke' || z.fade < 0.3) continue;
      if (
        Math.hypot(p.x - z.p.x, p.z - z.p.z) < z.r &&
        p.y > z.p.y - this.fx.k &&
        p.y < z.p.y + smokeH(z.r, this.fx.k)
      )
        return true;
    }
    return false;
  },
  // 線段 a→b 穿過煙（或兩端在煙裡）
  smokeBetween(a, b) {
    for (const z of this.zones || []) {
      if (z.k !== 'smoke' || z.fade < 0.3) continue;
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const L2 = dx * dx + dz * dz;
      const t = L2 > 1e-6 ? clamp(((z.p.x - a.x) * dx + (z.p.z - a.z) * dz) / L2, 0, 1) : 0;
      const cx = a.x + dx * t - z.p.x,
        cz = a.z + dz * t - z.p.z;
      if (cx * cx + cz * cz > z.r * z.r * 0.8) continue;
      const y = a.y + (b.y - a.y) * t;
      if (y > z.p.y - this.fx.k && y < z.p.y + smokeH(z.r, this.fx.k)) return true;
    }
    return false;
  },
  // 鎖定看不到這個目標（目標或自己在煙裡、或中間隔著煙）
  smokeHides(p, e) {
    if (this.airMode && e && !e.isShot && (this.airInCloud(e.center()) || this.airInCloud(p.center())))
      return true; // 空域：雲裡不能鎖定（game/air.js）
    if (!this.zones || !this.zones.length || !e || e.isShot) return false;
    return this.smokeBetween(p.center(), e.center());
  },
  // 鎖定的候選（player.js、chase.js、input.js）：敵人（扣掉被煙擋住的）＋可以打掉的投射物
  lockPool(p) {
    let L = this.hostilesOfEnt(p);
    if ((this.zones && this.zones.length) || this.airMode) L = L.filter((e) => !this.smokeHides(p, e));
    const S = this.shotTargets(p.team);
    if (p.team === 'player' && this.devs && this.devs.length) S.push(...this.trapTargets()); // 環境陷阱的弱點（devices-traps.js）
    return S.length ? L.concat(S) : L;
  },
  // 吸引（MechEntity.move）：往中心加速度；房主與客機的自身預測都算
  zonePull(e, target) {
    for (const z of this.zones || []) {
      if (z.k !== 'suction' || !this.zoneHits(z, e) || e.noPush) continue;
      const c = z.to || z.p;
      const dx = c.x - e.pos.x,
        dz = c.z - e.pos.z;
      const d = Math.hypot(dx, dz);
      if (Math.hypot(e.pos.x - z.p.x, e.pos.z - z.p.z) > z.r || d < this.fx.k) continue;
      const k = z.pull * (z.fade || 1) * (0.5 + 0.5 * (1 - d / z.r));
      target.x += (dx / d) * k;
      target.z += (dz / d) * k;
    }
  },
  // 爆炸與燃燒：提早點燃油漬、傷害臨時障礙物（Projectile.impact、explodeAt、blastTeam）
  hz2Blast(p, dmg, splash, attr) {
    if (!this.hz2Host()) return;
    if (this.tWalls && this.tWalls.length) this.tempWallHitAt(p, dmg, splash);
    if (!(splash > 0 || attr === 'exp') || !this.zones) return;
    for (const z of [...this.zones])
      if (z.k === 'fuel' && Math.hypot(p.x - z.p.x, p.z - z.p.z) < z.r + (splash || 0) + 0.5 * this.fx.k)
        this.fuelIgnite(z);
  },
  fuelIgnite(z) {
    if (z.lit) return;
    z.lit = true;
    this.addPool(z.src && !z.src.dead ? z.src : null, z.p, z.r / this.fx.k, z.burn, z.dps || 150); // addPool 的半徑照舊尺度
    this.fx.explosion(z.p.clone().setY(z.p.y + 0.8), (z.r * 0.5) / this.fx.k, 0xff7a20, z.r > 5 * this.fx.k);
    SFX.explode(false, z.p);
    this.removeZone(z.i);
  },
  // ----- 每格（房主與客機：updateSupport 呼叫）-----
  hazards2Tick(dt) {
    if (this.zones && this.zones.length) this.zonesTick(dt);
    if (this.tWalls && this.tWalls.length) this.tempWallsTick(dt);
  },
  zonesTick(dt) {
    const host = this.hz2Host();
    const w = this.world;
    for (let k = this.zones.length - 1; k >= 0; k--) {
      const z = this.zones[k];
      z.t += dt;
      z.life -= dt;
      z.fade = Math.min(1, z.t / 0.6, Math.max(0, z.life) / 1.2);
      if (z.life <= 0) {
        this.zoneDrop(k);
        if (host) this.netEv({ t: 'zrm', i: z.i });
        continue;
      }
      if (z.fromEnt) {
        if (z.fromEnt.dead && host) {
          this.removeZone(z.i);
          continue;
        }
        if (!z.fromEnt.dead) z.p.copy(z.fromEnt.center());
      }
      if (host) this.zoneHostTick(z, dt, w);
      if (host && (z.mvDirty || z.k === 'beam')) {
        z.mvT -= dt;
        if (z.mvT <= 0) {
          z.mvT = MV_DT;
          z.mvDirty = false;
          this.netEv({
            t: 'zmv',
            i: z.i,
            p: arr(z.p),
            d: arr(z.k === 'beam' ? z.end : z.dir),
            f: z.k === 'beam' ? +z.frac.toFixed(2) : undefined,
          });
        }
      }
      if (!host && z.pT) {
        // 客機：往最後收到的位置靠近
        const a = Math.min(1, dt * 12);
        z.p.lerp(z.pT, a);
        if (z.k === 'beam') z.end.lerp(z.dT, a);
        else z.dir.lerp(z.dT, a).normalize();
      }
      if (this.zones.includes(z)) this.zoneAnim(z, dt, w);
    }
  },
  zoneHostTick(z, dt, w) {
    const owner = z.src && !z.src.dead ? z.src : null;
    const victims = () =>
      (owner
        ? this.hostilesOfEnt(owner)
        : z.team === 'enemy'
          ? this.hostilesOf('enemy', null)
          : this.enemies
      ).filter((e) => this.zoneHits(z, e));
    const inR = (e) => Math.hypot(e.pos.x - z.p.x, e.pos.z - z.p.z) < z.r + e.radius * 0.3;
    z.tick -= dt;
    switch (z.k) {
      case 'gravity':
        if (z.tick > 0) return;
        z.tick = 0.2;
        for (const e of victims())
          if (inR(e) && e.pos.y < z.p.y + 40 * this.fx.k)
            e.addStatus?.('nojump', 0.5, { src: owner ? owner.id : -1 });
        return;
      case 'electro': {
        if (z.tick > 0) return;
        z.tick = 0.25;
        const wl = w.theme.water ? w.theme.water.level : -1e9;
        for (const e of victims())
          if (inR(e) && w.waterDepth(e.pos.x, e.pos.z) >= 0.3 * this.fx.k && e.pos.y < wl + 1.5 * this.fx.k) {
            e.takeDamage(z.dps * 0.25, 40, owner, e.center(), null, undefined, undefined, 'en');
            if (Math.random() < 0.5) this.fx.spark(e.center(), 0x9ff0ff);
          }
        return;
      }
      case 'fuel':
        if (z.t >= z.ig) return this.fuelIgnite(z);
        for (const P of this.hzPools || [])
          if (Math.hypot(P.p.x - z.p.x, P.p.z - z.p.z) < P.R + z.r) return this.fuelIgnite(z);
        return;
      case 'spot': {
        if (z.tick > 0) return;
        z.tick = 0.2;
        z.lit = false;
        for (const e of victims()) {
          const v = e.center().sub(z.p);
          const d = v.length();
          if (d > z.len || d < 0.5 * this.fx.k || v.divideScalar(d).dot(z.dir) < Math.cos(z.ang)) continue;
          if (w.losBlocked(z.p, e.center())) continue;
          e.addStatus?.('spotted', 0.6, { src: owner ? owner.id : -1 });
          z.lit = true;
        }
        return;
      }
      case 'beam': {
        let T = z.tgt;
        if (!T || T.dead) {
          T = z.tgt = victims().sort((a, b) => a.pos.distanceTo(z.p) - b.pos.distanceTo(z.p))[0] || null;
        }
        if (!T) return;
        const aim = T.center();
        const to = aim.clone().sub(z.end);
        const d = to.length();
        const step = z.track * dt * (1 + d / 12); // 離得越遠追得越快，貼近後只能慢慢跟
        if (d > 1e-3) z.end.addScaledVector(to, Math.min(1, step / d));
        const clear = this.losClear(z.p, z.end);
        const on = clear && z.end.distanceTo(aim) < T.radius + 1.2 * this.fx.k;
        z.lockT = on ? z.lockT + dt : 0; // 斷開或跟丟就重來
        z.frac = clamp(z.lockT / z.ramp, 0, 1);
        if (!on || z.tick > 0) return;
        z.tick = 0.2;
        const dps = lerp(z.dps0, z.dps1, z.frac);
        const dir = z.end.clone().sub(z.p).normalize();
        T.takeDamage(dps * 0.2, 20 + 80 * z.frac, owner, z.end.clone(), dir, undefined, undefined, 'en');
        return;
      }
    }
  },
  // ================= 臨時障礙物 =================
  addTempWall(pos, o = {}) {
    if (!this.hz2Host() || !this.world) return -1;
    this.wallSeq = (this.wallSeq || 0) + 1;
    const rec = {
      i: this.wallSeq,
      p: arr(pos),
      k: o.kind === 'rock' || COVER_KINDS.includes(o.kind) ? o.kind : 'ice', // Boss 改版的掩體（boss-field-models.js）
      w: o.w || 6 * this.fx.k,
      h: o.h || 3.5 * this.fx.k,
      d: o.d || 1.2 * this.fx.k,
      y: Math.round(((o.yaw || 0) / (Math.PI / 2)) % 4),
      hp: o.hp || 0,
      l: o.life || 12,
    };
    this.tempWallBuild(rec);
    this.netEv({ t: 'twall', ...rec });
    return rec.i;
  },
  tempWallBuild(rec) {
    const w = this.world;
    if (!w) return;
    if (!this.tWalls) this.tWalls = [];
    if (this.tWalls.some((x) => x.i === rec.i)) return;
    const odd = Math.abs(rec.y) % 2 === 1;
    const p = v3(rec.p);
    const y0 = w.terrainHeight(p.x, p.z);
    const grp = this.tempWallMesh(rec);
    grp.position.set(p.x, y0, p.z);
    grp.rotation.y = (rec.y * Math.PI) / 2;
    const mats = [];
    grp.traverse((q) => {
      if (q.material && !mats.includes(q.material)) mats.push(q.material);
    });
    const W = odd ? rec.d : rec.w,
      D = odd ? rec.w : rec.d;
    const ob = {
      kind: 'box',
      x: p.x,
      z: p.z,
      w: W,
      d: D,
      y: y0 - 0.5,
      top: y0 + rec.h,
      group: grp,
      mats,
      box: new THREE.Box3(
        new THREE.Vector3(p.x - W / 2, y0, p.z - D / 2),
        new THREE.Vector3(p.x + W / 2, y0 + rec.h, p.z + D / 2),
      ),
    };
    const wall = { ...rec, pos: p, y0, ob, grp, hpMax: rec.hp, t: 0, life: rec.l, dead: false };
    ob.tw = wall;
    w.obstacles.push(ob);
    w.occluders.push(ob);
    this.scene.add(grp);
    grp.scale.y = 0.05;
    this.tWalls.push(wall);
    const nest = this.fx._nested;
    this.fx._nested = true;
    this.fx.dust(
      p.clone().setY(y0 + 0.2),
      Math.max(rec.w, rec.d) * 0.5,
      10,
      rec.k === 'ice' ? 0xdff4ff : 0x9a8a78,
    );
    this.fx._nested = nest;
    if (rec.k === 'ice') SFX.play('shield', 0.6, 1.6, 0.05, 0.03, p);
    else SFX.wreck(p); // 岩牆碎裂
  },
  // 外觀：冰（半透明的冰塊＋上緣的冰刺）、岩（崎嶇的岩塊＋碎石）；原點在底面中心、寬沿 X、厚沿 Z
  tempWallMesh(rec) {
    if (COVER_KINDS.includes(rec.k)) return buildCover(rec); // Boss 改版的掩體：彈坑土堤、碎石、貨櫃、岩柱、混凝土牆
    const g = new THREE.Group();
    const { w, h, d } = rec;
    if (rec.k === 'ice') {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xbfe8ff,
        emissive: 0x2a6a90,
        emissiveIntensity: 0.35,
        roughness: 0.12,
        metalness: 0.1,
        transparent: true,
        opacity: 0.9,
      });
      const base = new THREE.Mesh(BOX, mat);
      base.scale.set(w, h * 0.82, d);
      base.position.y = h * 0.41;
      g.add(base);
      const n = Math.max(3, Math.round(w / 1.2));
      for (let i = 0; i < n; i++) {
        const sh = h * rnd(0.25, 0.45);
        const c = new THREE.Mesh(new THREE.ConeGeometry(d * rnd(0.3, 0.5), sh, 5), mat);
        c.position.set(
          -w / 2 + ((i + 0.5) * w) / n + rnd(-0.2, 0.2),
          h * 0.82 + sh / 2 - 0.1,
          rnd(-0.1, 0.1),
        );
        c.rotation.z = rnd(-0.25, 0.25);
        g.add(c);
      }
      for (const s of [-1, 1]) {
        const c = new THREE.Mesh(new THREE.ConeGeometry(d * 0.5, h * 0.6, 5), mat);
        c.position.set(s * (w / 2 + 0.1), h * 0.3, 0);
        c.rotation.z = s * -0.5;
        g.add(c);
      }
    } else {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x7a6a58,
        roughness: 0.95,
        metalness: 0.02,
        flatShading: true,
        transparent: true,
        opacity: 1,
      });
      const geo = new THREE.BoxGeometry(1, 1, 1, 4, 3, 2);
      const P = geo.attributes.position;
      for (let i = 0; i < P.count; i++)
        P.setXYZ(i, P.getX(i) + rnd(-0.06, 0.06), P.getY(i) + rnd(-0.05, 0.08), P.getZ(i) + rnd(-0.12, 0.12));
      geo.computeVertexNormals();
      const base = new THREE.Mesh(geo, mat);
      base.scale.set(w, h, d);
      base.position.y = h / 2;
      g.add(base);
      for (let i = 0; i < 5; i++) {
        const b = new THREE.Mesh(new THREE.DodecahedronGeometry(rnd(0.4, 0.8) * this.fx.k, 0), mat);
        b.position.set(rnd(-w / 2, w / 2), rnd(0.2, 0.5), (Math.random() < 0.5 ? -1 : 1) * (d / 2 + 0.2));
        g.add(b);
      }
    }
    g.traverse((q) => {
      if (q.isMesh) {
        q.castShadow = true;
        q.receiveShadow = true;
      }
    });
    return g;
  },
  tempWallsTick(dt) {
    const host = this.hz2Host();
    for (let k = this.tWalls.length - 1; k >= 0; k--) {
      const W = this.tWalls[k];
      W.t += dt;
      W.life -= dt;
      if (W.grp.scale.y < 1) W.grp.scale.y = Math.min(1, W.grp.scale.y + dt / 0.3); // 升起
      if (W.flashT > 0) {
        W.flashT -= dt;
        if (W.flashT <= 0)
          for (const m of W.ob.mats) if (m.emissive) m.emissive.setHex(W.k === 'ice' ? 0x2a6a90 : 0);
      }
      if (W.life <= 0) {
        this.tempWallRemove(W, false);
        if (host) this.netEv({ t: 'twX', i: W.i, b: 0 });
      }
    }
  },
  // 點 p（半徑 rad 的爆炸）碰到的臨時障礙物受傷
  tempWallHitAt(p, dmg, rad = 0) {
    if (!this.hz2Host() || !(dmg > 0)) return;
    for (const W of [...(this.tWalls || [])]) {
      if (W.dead || !(W.hpMax > 0)) continue;
      const cp = W.ob.box.clampPoint(p, new THREE.Vector3());
      const d = cp.distanceTo(p);
      if (d > rad + 0.35 * this.fx.k) continue;
      this.tempWallDamage(W, dmg * (rad > 0 ? clamp(1 - (d / Math.max(0.1, rad)) * 0.5, 0.4, 1) : 1), cp);
    }
  },
  // 近戰：揮砍範圍碰到的牆（每一擊一次）
  tempWallMelee(c, reach, dmg, hitSet) {
    if (!this.tWalls || !this.tWalls.length || !this.hz2Host()) return;
    for (const W of [...this.tWalls]) {
      if (W.dead || !(W.hpMax > 0) || hitSet.has('tw' + W.i)) continue;
      const cp = W.ob.box.clampPoint(c, new THREE.Vector3());
      if (cp.distanceTo(c) > reach) continue;
      hitSet.add('tw' + W.i);
      this.tempWallDamage(W, dmg, cp);
    }
  },
  tempWallDamage(W, dmg, at) {
    W.hp -= Math.round(dmg);
    this.twStage(W);
    W.flashT = 0.07;
    for (const m of W.ob.mats) if (m.emissive) m.emissive.setRGB(0.6, 0.6, 0.6);
    this.popDamage(at, Math.round(dmg), false, false, false, 0, -1);
    if (W.hp <= 0) {
      this.tempWallRemove(W, true);
      this.netEv({ t: 'twX', i: W.i, b: 1 });
    } else this.netEv({ t: 'twHp', i: W.i, h: W.hp });
  },
  // 拿掉：broken＝被打碎（碎塊飛散），否則崩落（沉進地面）
  tempWallRemove(W, broken) {
    if (W.dead) return;
    W.dead = true;
    const w = this.world;
    const i = this.tWalls.indexOf(W);
    if (i >= 0) this.tWalls.splice(i, 1);
    if (w) {
      const a = w.obstacles.indexOf(W.ob);
      if (a >= 0) w.obstacles.splice(a, 1);
      const b = w.occluders.indexOf(W.ob);
      if (b >= 0) w.occluders.splice(b, 1);
    }
    const g = W.grp;
    const c = W.pos.clone().setY(W.y0 + W.h / 2);
    const ice = W.k === 'ice';
    const nest = this.fx._nested;
    this.fx._nested = true; // 各端自己演出
    if (broken) {
      this.scene.remove(g);
      const mat = W.ob.mats[0].clone();
      mat.transparent = true;
      const pieces = [];
      const n = Math.max(6, Math.round((W.w * W.h * 0.5) / (this.fx.k * this.fx.k)));
      g.updateMatrixWorld(true);
      for (let k = 0; k < Math.min(14, n); k++) {
        const s = rnd(0.4, 1.1) * this.fx.k;
        const m = new THREE.Mesh(
          ice ? new THREE.OctahedronGeometry(s * 0.7, 0) : new THREE.DodecahedronGeometry(s * 0.6, 0),
          mat.clone(),
        );
        m.position.copy(
          g.localToWorld(new THREE.Vector3(rnd(-W.w / 2, W.w / 2), rnd(0.3, W.h), rnd(-W.d / 2, W.d / 2))),
        );
        m.castShadow = true;
        this.scene.add(m);
        pieces.push(m);
      }
      if (w) flingDebris(this.fx, w, pieces, c.clone().setY(W.y0), 6);
      this.fx.explosion(c, Math.max(2, W.w * 0.35), ice ? 0xcff0ff : 0xc0a080, false);
      this.fx.dust(c.clone().setY(W.y0 + 0.2), Math.max(W.w, W.d) * 0.6, 12, ice ? 0xe8f8ff : 0x9a8a78);
      SFX.explode(false, c);
    } else {
      this.fx.dust(c.clone().setY(W.y0 + 0.2), Math.max(W.w, W.d) * 0.6, 10, ice ? 0xe8f8ff : 0x9a8a78);
      const y0 = g.position.y;
      this.fx.task(0.9, (e, t) => {
        g.position.y = y0 - W.h * t * t;
        for (const m of W.ob.mats) m.opacity = Math.min(m.opacity, 1 - t * 0.6);
        if (t > 0.97) this.scene.remove(g);
      });
    }
    this.fx._nested = nest;
  },
  clearTempWalls() {
    const w = this.world;
    for (const W of this.tWalls || []) {
      W.dead = true;
      this.scene.remove(W.grp);
      // 碰撞與遮擋也一起拿掉（World 沒有重建時，例如測試或編輯器）
      if (w) {
        const a = w.obstacles.indexOf(W.ob);
        if (a >= 0) w.obstacles.splice(a, 1);
        const b = w.occluders.indexOf(W.ob);
        if (b >= 0) w.occluders.splice(b, 1);
      }
    }
    this.tWalls = [];
  },
  // ================= 可以打掉的投射物 =================
  // Projectile 的建構子呼叫（房主與客機）：建立代理目標
  shotInit(pr) {
    pr.hp = pr.hpMax = pr.shootable;
    const id = SHOT_BASE + (pr.netId || (this.shotSeq = (this.shotSeq || 0) + 1));
    pr.tgt = {
      id,
      isShot: true,
      isProp: true,
      proj: pr,
      name: pr.shotName || (pr.kind === 'missile' ? '飛彈' : '投射物'),
      team: pr.team,
      pos: pr.pos,
      vel: pr.vel,
      radius: (pr.shotR || 0.9) * this.fx.k, // shotR 照舊尺度
      scale: 0.6,
      laserK: 1,
      res: null,
      get dead() {
        return pr.dead;
      },
      get hp() {
        return pr.hp;
      },
      get maxHp() {
        return pr.hpMax;
      },
      center() {
        return pr.pos.clone();
      },
    };
  },
  // 這個隊伍打得到的投射物
  shotTargets(team) {
    const out = [];
    if (!team || team === 'prop') return out;
    for (const pr of this.projectiles || [])
      if (pr.tgt && !pr.dead && pr.team !== team && !(team === 'ally' && pr.team === 'player'))
        out.push(pr.tgt);
    return out;
  },
  shotById(id) {
    if (!(id >= SHOT_BASE)) return null;
    const pr = (this.projectiles || []).find((q) => q.tgt && q.tgt.id === id && !q.dead);
    return pr ? pr.tgt : null;
  },
  // damageProp 轉過來（房主／單機）
  shotDamage(t, dmg, at, from) {
    const pr = t.proj;
    if (pr.dead) return;
    pr.hp -= pr.hitsNeed ? 1 : Math.round(dmg); // Boss 改版的 M：要打幾發（不看傷害）
    this.popDamage(at || pr.pos, Math.round(dmg), false, false, false, 0, t.id);
    if (pr.netId) this.netEv({ t: 'shp', i: pr.netId, h: pr.hp });
    if (pr.hp > 0) {
      this.fx.spark(pr.pos.clone(), 0xffe080);
      return;
    }
    // 擊落：引爆（popDmg）或直接消失
    pr.dead = true;
    this.scene.remove(pr.mesh);
    if (pr.netId) this.netEv({ t: 'pend', i: pr.netId });
    const p = pr.pos.clone();
    // Boss 改版的 M：Boss 的彈打掉之後飛回 Boss（mech-boss-tier.js）
    const rb = pr.reflect && this.entById(pr.reflect);
    if (rb && !rb.dead && rb.tierReflect) {
      rb.tierReflect(pr, from);
      return;
    }
    if (pr.popDmg > 0)
      this.explodeAt(p, pr.popDmg, 300, Math.max(3 * this.fx.k, pr.splash || 0), pr.owner, true);
    else {
      this.fx.explosion(p, 1.6, 0xffc060, false);
      SFX.explode(false, p);
    }
    this.popDamage(p.clone().setY(p.y + 1), '擊落', false, false, false, 0, -1);
    if (this.tut && this.player) this.player.tutE('shotDown', {}); // 遠程訓練（只有玩家在開火）
  },
  // 小血條（主 HUD）：畫面上的可以打掉的投射物；鎖定中的另外畫框
  drawShotHud(c, p) {
    for (const pr of this.projectiles || []) {
      if (!pr.tgt || pr.dead) continue;
      const s = this.proj(pr.pos);
      if (!s.in) continue;
      const k = clamp(pr.hp / Math.max(1, pr.hpMax), 0, 1);
      const W = 34;
      c.fillStyle = 'rgba(0,0,0,.6)';
      c.fillRect(s.x - W / 2 - 1, s.y - 17, W + 2, 5);
      c.fillStyle = k > 0.5 ? '#ffb020' : '#ff4d4d';
      c.fillRect(s.x - W / 2, s.y - 16, W * k, 3);
      if (p && p.lock === pr.tgt) {
        c.strokeStyle = '#ffb020';
        c.lineWidth = 1.5;
        c.strokeRect(s.x - 12, s.y - 12, 24, 24);
        c.fillStyle = '#ffb020';
        c.font = 'bold 11px Chakra Petch';
        c.textAlign = 'left';
        c.fillText(pr.tgt.name + '  ' + Math.round(pr.pos.distanceTo(p.pos)) + 'm', s.x + 16, s.y - 6);
      }
    }
  },
  // ================= 客機的事件 =================
  hazards2Event(e) {
    switch (e.t) {
      case 'zadd': {
        if (!this.world) return true;
        if (!this.zones) this.zones = [];
        const o = e.o || {};
        const fe = o.fe >= 0 ? this.entById(o.fe) : null;
        const z = {
          i: e.i,
          k: e.k,
          p: v3(e.p),
          r: e.r,
          life: e.l,
          max: e.l,
          t: 0,
          team: e.tm,
          dir: v3(o.dir || [0, -1, 0]),
          ang: o.ang,
          len: o.len,
          to: o.to ? v3(o.to) : null,
          pull: o.pull,
          ig: o.ig,
          end: o.end ? v3(o.end) : null,
          fromEnt: fe,
          frac: 0,
        };
        this.zones.push(z);
        this.zoneVisual(z);
        return true;
      }
      case 'zmv': {
        const z = this.zoneById(e.i);
        if (z) {
          z.pT = v3(e.p);
          z.dT = v3(e.d);
          if (e.f !== undefined) z.frac = e.f;
        }
        return true;
      }
      case 'zrm': {
        const k = (this.zones || []).findIndex((z) => z.i === e.i);
        if (k >= 0) this.zoneDrop(k);
        return true;
      }
      case 'zclr':
        for (let k = (this.zones || []).length - 1; k >= 0; k--) this.zoneDrop(k);
        return true;
      case 'twall':
        this.tempWallBuild(e);
        return true;
      case 'twHp': {
        const W = (this.tWalls || []).find((x) => x.i === e.i);
        if (W) {
          W.hp = e.h;
          this.twStage(W);
          W.flashT = 0.07;
          for (const m of W.ob.mats) if (m.emissive) m.emissive.setRGB(0.6, 0.6, 0.6);
        }
        return true;
      }
      case 'twX': {
        const W = (this.tWalls || []).find((x) => x.i === e.i);
        if (W) this.tempWallRemove(W, !!e.b);
        return true;
      }
      case 'shp': {
        const pr = (this.projectiles || []).find((q) => q.netId === e.i);
        if (pr && pr.tgt) pr.hp = e.h;
        return true;
      }
    }
    return false;
  },
  // 房主遷移：臨時障礙物照常（各端都有一份），序號接著用
  promoteHazards2() {
    this.wallSeq = Math.max(this.wallSeq || 0, ...(this.tWalls || []).map((W) => W.i), 0);
    this.zoneSeq = Math.max(this.zoneSeq || 0, 1000);
  },
});
