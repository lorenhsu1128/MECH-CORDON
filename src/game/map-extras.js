// ---------- Game 整合 ----------
import { SFX } from '../audio/audio.js';
import { rnd } from '../core/math.js';
import { MS } from '../core/scale.js';
import { PICKUP_DEFS, Pickup, Vehicle } from '../world/map-extras.js';
import { Game } from './game.js';

Object.assign(Game.prototype, {
  mapExtrasInit() {
    this.vehicles = [];
    this.pickups = [];
    this.vehPlan = [];
  },
  planVehicles() {
    this.vehicles = [];
    this.pickups = [];
    this.vehPlan = [];
    if (!this.world.corridor) return;
    let t = rnd(12, 30);
    for (let i = 0; i < 3; i++) {
      this.vehPlan.push(t);
      t += rnd(35, 70);
    }
  },
  // 運輸車輛的模型先建好（隱藏、在場景裡，讓著色器預熱也編到它們；Vehicle.build 取用）：
  // 新地圖第一次算繪前（Game.shaderWarm）呼叫。客機照房主的事件建車輛，也先建好
  vehPrebuild() {
    this.vehClear();
    const c = this.world && this.world.corridor;
    if (!c) return;
    const client = this.net && this.net.role === 'client';
    const n = client ? 2 : Math.min(2, this.vehPlan.length);
    const kind = c.kind === 'rail' ? 'train' : 'truck';
    for (let i = 0; i < n; i++) {
      // 列車的節數（Vehicle 的 rndi(3, 5)+1）：先建好的固定 5 節，不動亂數
      const M = Vehicle.model(kind, kind === 'train' ? 5 : 1, Vehicle.carLenOf(kind));
      M.g.visible = false;
      this.scene.add(M.g);
      this.vehPool.push(M);
    }
  },
  vehClear() {
    for (const M of this.vehPool || []) this.scene.remove(M.g);
    this.vehPool = [];
  },
  // team：攻擊者的隊伍（有給時另外加上它打得到的投射物，game/hazards2.js）
  destructibles(team) {
    const out = [];
    if (this.world && this.world.props) for (const p of this.world.props) if (this.propLive(p)) out.push(p); // 不可破壞時改版後的物件不算
    for (const v of this.vehicles) if (!v.dead) for (const pt of v.parts) out.push(pt);
    if (team) out.push(...this.shotTargets(team));
    if (team !== 'prop' && this.devs && this.devs.length) out.push(...this.trapTargets()); // 環境陷阱的弱點（敵人的流彈也算）
    return out;
  },
  // 同一格裡共用的 destructibles（docs/perf-campaign-plan.md 第 3 期：每顆子彈每格都要找一次目標，以前每次新建
  // 幾百個元素的陣列，是戰鬥中 GC 的大宗）。主迴圈每格開頭換一次（loopN）；同一格中途被打壞的照舊由呼叫端的
  // t.dead 略過，中途新增的（可以打掉的投射物）下一格才加入。回傳的陣列不能改
  destructiblesF(team) {
    const c = this.dCache || (this.dCache = { n: -1, m: new Map() });
    if (c.n !== this.loopN) {
      c.n = this.loopN;
      c.m.clear();
    }
    let a = c.m.get(team);
    if (!a) c.m.set(team, (a = this.destructibles(team)));
    return a;
  },
  // 地圖物件受傷（房主／單機）：attr＝屬性、wid＝武器 id（依材質的倍率，game/destruct.js）
  damageProp(p, dmg, impact, at, from, attr, wid) {
    this.propDamage(p, dmg, impact, at, from, attr, wid);
  },
  spawnPickup(kind, pos, id) {
    const pk = new Pickup(this, kind, pos, id);
    this.pickups.push(pk);
    if (this.net.role === 'host')
      this.netEv({
        t: 'pk',
        i: pk.id,
        k: kind,
        p: [+pos.x.toFixed(2), +pos.y.toFixed(2), +pos.z.toFixed(2)],
      });
    return pk;
  },
  collectPickup(pk, ent) {
    pk.remove();
    const d = PICKUP_DEFS[pk.kind];
    if (pk.kind === 'repair') {
      ent.hp = Math.min(ent.maxHp, ent.hp + Math.round(ent.maxHp * 0.4));
      this.fx.ring(ent.center(), 5, 0x7ee081);
    } else if (pk.kind === 'bossPart') {
      // 部位殘骸：彈藥 35%＋AP 12%
      for (const w of Object.values(ent.weapons || {}))
        if (w && w.def && w.def.ammo > 0)
          w.ammo = Math.min(w.def.ammo, w.ammo + Math.ceil(w.def.ammo * 0.35));
      ent.hp = Math.min(ent.maxHp, ent.hp + Math.round(ent.maxHp * 0.12));
      this.fx.ring(ent.center(), 5, 0xffe070);
      if (ent.isPlayer) this.renderWeaponHud(true);
    } else if (pk.kind.startsWith('mat_')) {
      this.lootPickup(pk, ent); // 素材（loot.js）
      this.fx.ring(ent.center(), 4, d.color);
    } else if (pk.kind === 'salvage') {
      this.segSalvage(ent); // 撤離區段的回收物資（seg-ops.js）
      this.fx.ring(ent.center(), 5, 0xffc040);
      if (this.net.role === 'host') this.netEv({ t: 'pkr', i: pk.id });
      return ent.isPlayer ? SFX.cue('pickup') : SFX.kit();
    } else if (pk.kind === 'ammo') {
      // 彈藥箱：每個實彈武器補充總彈數的 35%（彈數隨快照同步給客機）
      for (const w of Object.values(ent.weapons || {}))
        if (w && w.def && w.def.ammo > 0)
          w.ammo = Math.min(w.def.ammo, w.ammo + Math.ceil(w.def.ammo * 0.35));
      this.fx.ring(ent.center(), 5, 0xffc040);
      if (ent.isPlayer) this.renderWeaponHud(true);
    } else {
      if (ent.isPlayer) {
        this.save.items[pk.kind] = (this.save.items[pk.kind] || 0) + 1;
        this.writeSave();
        this.renderWeaponHud(true);
      }
    }
    if (ent.isPlayer) SFX.cue('pickup');
    else SFX.kit();
    this.flashMsg(`${ent.name} 取得 ${d.name}`, d.color, 1.5);
    if (this.net.role === 'host') {
      this.netEv({ t: 'pkr', i: pk.id });
      if (!ent.isPlayer && ent.slot !== undefined) this.netEv({ t: 'pkGot', slot: ent.slot, k: pk.kind });
    }
  },
  // 擊破敵人時掉落彈藥箱（房主／單機）：敵對 AC 一定掉，其他 18%；有玩家彈藥剩不到三成時機率加倍
  dropAmmo(e) {
    if (this.pvp || this.lab || this.cine || !this.world || e.isBoss) return;
    if (['objective', 'part', 'holo', 'convoy'].includes(e.ai)) return;
    const low = this.playersAlive().some((p) => {
      const ws = Object.values(p.weapons || {}).filter((w) => w && w.def && w.def.ammo > 0);
      return ws.length && ws.reduce((a, w) => a + w.ammo / w.def.ammo, 0) / ws.length < 0.3;
    });
    const ace = e.ai === 'ac' || (this.bosses || []).includes(e); // 敵對 AC、精英區段的專屬 AC
    if (!ace && !e.af && Math.random() > (low ? 0.36 : 0.18)) return; // 帶詞綴的一定掉
    const [x, z] = this.world.nearSolid ? this.world.nearSolid(e.pos.x, e.pos.z) : [e.pos.x, e.pos.z];
    this.spawnPickup('ammo', new THREE.Vector3(x, this.world.groundAt(x, z, e.pos.y + 1) + 0.6, z));
  },
  updateMapExtras(dt) {
    const isHost = !(this.net && this.net.role === 'client');
    if (isHost && this.vehPlan.length && this.missionT >= this.vehPlan[0]) {
      this.vehPlan.shift();
      const kind = this.world.corridor.kind === 'rail' ? 'train' : 'truck';
      const v = new Vehicle(this, kind, Math.random() < 0.5 ? 1 : -1);
      this.vehicles.push(v);
      this.flashAlert((kind === 'train' ? '運輸列車' : '運輸貨車') + ' 從隧道駛出 — 擊破可獲得補給');
    }
    for (const v of this.vehicles) {
      if (v.dead) continue;
      v.update(dt);
      if (isHost) {
        // 撞擊機體：100 傷害＋大擊退（每台每 1.5 秒一次）
        for (const e of [...(this.players || []), ...this.enemies, ...this.allies]) {
          if (!e || e.dead) continue;
          const t = this.time;
          if (v.hitCd[e.id] && t - v.hitCd[e.id] < 1.5) continue;
          for (let i = 0; i < v.cars; i++) {
            const cp = v.carPos(i);
            if (Math.hypot(e.pos.x - cp.x, e.pos.z - cp.z) < 3.2 + e.radius && Math.abs(e.pos.y - cp.y) < 4) {
              v.hitCd[e.id] = t;
              const c = this.world.corridor;
              const td = this.world.corridorDir(v.s);
              const dir = new THREE.Vector3(td.x * v.dirSign, 0.3, td.y * v.dirSign);
              const side = new THREE.Vector3(c.perp.x, 0, c.perp.y).multiplyScalar(
                (e.pos.x - cp.x) * c.perp.x + (e.pos.z - cp.z) * c.perp.y > 0 ? 1 : -1,
              );
              e.takeDamage(100, 600, null, e.center(), dir);
              e.vel.add(dir.multiplyScalar(18).add(side.multiplyScalar(14)));
              e.iFrames = Math.max(e.iFrames, 0.3);
              break;
            }
          }
        }
      }
      if (v.gone) {
        v.dead = true;
        v.cleanup();
        this.netEv({ t: 'vehGone', i: v.id });
      }
    }
    this.vehicles = this.vehicles.filter((v) => !v.dead || (v.mesh.visible === false && !v.gone));
    for (const pk of this.pickups) {
      if (pk.dead) continue;
      pk.update(dt);
      if (isHost) {
        for (const e of this.players || []) {
          if (!e || e.dead || e.downed) continue;
          if (e.pos.distanceTo(pk.pos) < 2.4 * MS) {
            this.collectPickup(pk, e);
            break;
          }
        }
      }
    }
    this.pickups = this.pickups.filter((p) => !p.dead);
    if (isHost) this.gearDropsTick(dt); // 地上的裝備（gear-loot.js，只有單人）
  },
  // 客機：從快照／事件同步車輛與物件
  clientMapEvent(e) {
    switch (e.t) {
      case 'veh': {
        let v = this.vehicles.find((x) => x.id === e.i);
        if (!v && this.world.corridor) {
          v = new Vehicle(this, e.k, e.d, e.i);
          this.vehicles.push(v);
        }
        if (v && !v.dead) {
          v.s = e.s;
          v.hp = e.h;
          v.update(0);
        }
        return true;
      }
      case 'vehDie': {
        const v = this.vehicles.find((x) => x.id === e.i);
        if (v && !v.dead) {
          v.dead = true;
          const c = v.center();
          this.fx.explosion(c, 5, 0xffa040, true);
          SFX.explode(true, c);
          this.rumbleAt(c, 0.8, 0.5, 300, 40);
          this.fx.shatterVehicle(v);
          v.mesh.visible = false;
        }
        return true;
      }
      case 'vehGone': {
        const v = this.vehicles.find((x) => x.id === e.i);
        if (v) {
          v.dead = true;
          v.cleanup();
        }
        return true;
      }
      case 'propHp': {
        // 這一格血量有變的物件（game/destruct.js）；舊格式的單一物件 { i, h }
        if (e.l) for (const [i, h] of e.l) this.propApplyHp(i, h, true);
        else this.propApplyHp(e.i, e.h, true);
        return true;
      }
      case 'propDie': {
        this.propApplyDie(e);
        return true;
      }
      case 'roofx': {
        this.roofBreak(e.k, false); // 岩頂開洞（game/destruct.js）
        return true;
      }
      case 'pcol': {
        this.propApplyCollapse(e); // 結構倒下（game/destruct.js）
        return true;
      }
      case 'pk': {
        if (!this.pickups.find((p) => p.id === e.i))
          this.pickups.push(new Pickup(this, e.k, new THREE.Vector3(e.p[0], e.p[1], e.p[2]), e.i));
        return true;
      }
      case 'pkr': {
        const p = this.pickups.find((p) => p.id === e.i);
        if (p) p.remove();
        return true;
      }
      case 'gear':
        return this.gearNetEvent(e); // 零件品級的掉落：每位玩家各自得到（gear-loot.js）
      case 'pkGot': {
        if (e.slot === this.net.me && e.k.startsWith('mat_')) {
          this.lootMat(e.k.slice(4), 1); // 素材（loot.js）
          return true;
        }
        if (e.slot === this.net.me && e.k !== 'repair') {
          this.save.items[e.k] = (this.save.items[e.k] || 0) + 1;
          this.writeSave();
          this.renderWeaponHud(true);
        }
        return true;
      }
    }
    return false;
  },
  serVehicles() {
    return this.vehicles
      .filter((v) => !v.dead)
      .map((v) => ({ i: v.id, k: v.kind, d: v.dirSign, s: +v.s.toFixed(2), h: v.hp }));
  },
});
