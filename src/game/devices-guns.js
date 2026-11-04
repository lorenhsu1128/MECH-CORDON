// Game：G 搶來用的武器（docs/map-devices-design.md）——
// G1 固定砲台：敵方佔著的有 MT 操作（打掉操作員就能搶）、中立的直接搶；按住互動鍵上砲台（機體不能移動、
//   自己的武器不能用），射擊鍵開火、會過熱，再按一次互動鍵離開；上砲台時受到的傷害一半由砲台承受，
//   砲台被打壞就下來；對 Boss（本體與部位）的傷害 ×0.5（MechEntity.takeDamage 看攻擊者的 devMount）。
// G2 撿重武器：重型敵人擊破時掉落，按住互動鍵撿起；掛在右手、自動對鎖定目標發射（沒有鎖定時按射擊鍵往準星），
//   彈藥打完就丟掉。
// 判定都在房主／單機；砲台的狀態隨裝置表（mis.dv）、重武器隨 mis.hw 同步，顯示各端自己做。
import { SFX } from '../audio/audio.js';
import { DS, MS } from '../core/scale.js';
import {
  GUNS_BY_THEME,
  GUN_BOSS_K,
  GUN_COOL,
  GUN_MOUNT_ABSORB,
  GUN_NPC,
  HEAVY_WEAPONS,
  HW_DROP,
  HW_DROP_ACE,
  HW_DROP_PART,
  OVERHEAT_T,
} from '../data/devices.js';
import { ENEMY_TYPES } from '../data/enemies.js';
import { Projectile } from '../entities/projectile.js';
import { GUN_MUZZLE, buildHwMesh } from '../render/gun-models.js';
import { Game } from './game.js';

const ST_IDLE = 0, // 中立（沒有人用）
  ST_ON = 1, // 玩家在砲台上
  ST_USED = 2, // 打壞了
  ST_FOE = 5; // 敵人操作中
const HW_KEYS = Object.keys(HEAVY_WEAPONS);
const SHOT_KIND = { bullet: 'bullet', shell: 'shell', missile: 'missile' };

Object.assign(Game.prototype, {
  // ---------- 規畫（devPlan 呼叫） ----------
  gunPlan(used) {
    const list = GUNS_BY_THEME[this.worldTheme];
    if (!list) return;
    const W = this.world,
      G = this.encGroups || [],
      s = W.start;
    const want = [];
    if (this.isBossLevel) want.push([list[0], null, false], [list[1], null, false]);
    else {
      // 一座敵人佔著（在某一群那裡）、一半的場次再多一座中立的（在路途中段）
      if (G.length) want.push([list[0], G[Math.floor(Math.random() * G.length)].pos, true]);
      if (!G.length || Math.random() < 0.5)
        want.push([list[1], s && G.length ? this.devLerp(s, G[G.length >> 1].pos, 0.6) : null, false]);
    }
    for (const [k, at, foe] of want) {
      const pt = this.devSpot(at, used, 3, !!at && foe) || (at && foe ? null : this.devSpot(null, used, 3));
      if (!pt) continue;
      used.push(pt);
      // 砲口預設朝作戰區域的中心（操作台在後面）
      const Zn = W.zone;
      const a = Math.atan2((Zn[0] + Zn[1]) / 2 - pt.x, (Zn[2] + Zn[3]) / 2 - pt.z);
      const y = ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4;
      const d = this.devAdd({ i: ++this.devSeq, k, x: pt.x, z: pt.z, y, v: 1 });
      if (d && foe) this.gunGunner(d);
    }
  },
  // 敵方的操作員：一台 MT 站在操作台上（edHold：不移動）
  gunGunner(d) {
    this.waveAt = { pos: d.usePos.clone(), drop: false };
    let e = null;
    try {
      e = this.spawnType('mt', this.scaleHp, this.scaleDmg);
    } finally {
      this.waveAt = null;
    }
    if (!e) return;
    e.pos.copy(d.usePos);
    e.pos.y = this.world.groundAt(e.pos.x, e.pos.z, e.pos.y + 3 * MS);
    e.mesh.position.copy(e.pos);
    e.edHold = true;
    e.devGun = d.id;
    d.st = ST_FOE;
    d.user = e.id;
  },
  // devAdd 呼叫（房主與客機）
  gunInit(d) {
    d.hp = (d.val || 1) * d.def.hp;
    d.heat = 0;
    d.ohT = 0;
    d.cd = 0;
    d.aim = d.yaw || 0; // 砲塔的世界朝向（+Z 轉 aim）
    const g = this;
    const c = d.pos.clone().setY(d.pos.y + 2 * MS);
    d.tgt = {
      id: 960000 + d.id,
      isProp: true,
      isTrap: true,
      dev: d,
      name: d.def.name,
      team: 'prop',
      pos: c,
      vel: new THREE.Vector3(),
      radius: 2.2 * MS,
      scale: 1,
      laserK: 1,
      res: null,
      get dead() {
        return d.st !== ST_FOE || !g.devs || !g.devs.includes(d);
      },
      get hp() {
        return d.hp;
      },
      get maxHp() {
        return d.def.hp;
      },
      center() {
        return c.clone();
      },
    };
  },
  // 子彈打到敵方佔著的砲台（trapDamage 轉過來）
  gunDamage(d, dmg, at) {
    if (d.st === ST_USED) return;
    d.hp -= Math.max(1, Math.round(dmg));
    this.popDamage(at || d.tgt.center(), Math.round(dmg), false, false, false, 0, d.tgt.id);
    if (d.hp <= 0) this.gunDestroy(d);
  },
  gunDestroy(d) {
    const p = d.st === ST_ON ? this.entById(d.user) : null;
    if (p) this.gunDismount(d, p);
    d.st = ST_USED;
    d.hp = 0;
    d.user = 0;
    const c = d.pos.clone().setY(d.pos.y + 1.5 * MS);
    this.fx.explosion(c, 4, 0xffa040, true);
    this.fx.shockwave(c, 5, 0xffd090, 0.4);
    SFX.explode(true, c);
    this.flashMsg(`${d.def.name}被摧毀`, 0xff8040, 1.6);
  },
  // 上砲台受到的傷害：砲台分擔一半（MechEntity.takeDamage 呼叫，回傳自己要受的）
  gunAbsorb(p, dmg) {
    const d = (this.devs || []).find((o) => o.id === p.devMount && o.st === ST_ON);
    if (!d) return dmg;
    const share = dmg * GUN_MOUNT_ABSORB;
    d.hp -= share;
    if (d.hp <= 0) this.gunDestroy(d);
    return dmg - share;
  },
  // MechEntity.takeDamage：砲台上的玩家打 Boss（本體與部位）
  gunBossK() {
    return GUN_BOSS_K;
  },
  gunSeat(d) {
    return d.usePos;
  },
  gunMount(d, p) {
    d.st = ST_ON;
    d.user = p.id;
    d.prog = 0;
    d.mountT = 0;
    d.itPrev = true;
    p.devMount = d.id;
    p.vel.set(0, 0, 0);
    if (p.isPlayer) this.flashMsg(`上${d.def.name} — 射擊鍵開火，再按一次互動鍵離開`, d.def.color, 2);
    SFX.ui();
  },
  gunDismount(d, p) {
    p.devMount = 0;
    if (d.st === ST_ON) {
      d.st = ST_IDLE;
      d.user = 0;
    }
    // 往後退一點，不要卡在操作台上
    const back = this.devRot(d, [0, 0, -1.5]);
    p.pos.add(back);
  },
  // ---------- 判定（房主／單機；devTick 呼叫） ----------
  gunTick(d, dt, holder) {
    const def = d.def,
      W = def.w;
    if (d.cd < -0.5) d.heat = Math.max(0, d.heat - GUN_COOL * dt); // 停火 0.5 秒後才散熱
    if (d.ohT > 0) d.ohT -= dt;
    d.cd -= dt;
    if (d.st === ST_FOE) {
      const e = this.entById(d.user);
      if (!e || e.dead) {
        d.st = ST_IDLE;
        d.user = 0;
        this.flashMsg(`${def.name}的操作員被擊破 — 可以搶過來用`, def.color, 2);
        return;
      }
      // 敵人操作：射程內、看得到的最近的玩家
      const R = W.range * DS;
      const eye = d.pos.clone().setY(d.pos.y + 2.8 * MS); // 砲塔上方（自己的碰撞方塊高 2.2）
      let best = null,
        bd = R;
      for (const p of this.playersAlive()) {
        if (p.downed) continue;
        const dd = p.pos.distanceTo(d.pos);
        if (dd < bd && !this.world.losBlocked(eye, p.center())) {
          bd = dd;
          best = p;
        }
      }
      if (best) {
        d.aim = Math.atan2(best.pos.x - d.pos.x, best.pos.z - d.pos.z);
        if (d.cd <= 0 && d.ohT <= 0) this.gunFire(d, best.center(), e, 'enemy', best, true);
      }
      return;
    }
    if (d.st === ST_IDLE) {
      if (holder && !holder.devMount) {
        d.prog = Math.min(1, d.prog + dt / def.hold);
        if (d.prog >= 1) this.gunMount(d, holder);
      } else d.prog = Math.max(0, d.prog - dt / def.hold);
      return;
    }
    if (d.st !== ST_ON) return;
    const p = this.entById(d.user);
    if (!p || p.dead || p.downed || p.devMount !== d.id) {
      if (p) p.devMount = 0;
      d.st = ST_IDLE;
      d.user = 0;
      return;
    }
    d.mountT = (d.mountT || 0) + dt;
    // 再按一次互動鍵（放開後再按）離開
    if (p.itHeld && !d.itPrev && d.mountT > 0.4) {
      this.gunDismount(d, p);
      d.itPrev = true;
      return;
    }
    d.itPrev = !!p.itHeld;
    this.gunPin(d, p);
    const lk = p.lock && !p.lock.dead && p.lock.pos.distanceTo(d.pos) < W.range * DS ? p.lock : null;
    const aimPos = lk ? lk.center() : p.aimPoint();
    d.aim = Math.atan2(aimPos.x - d.pos.x, aimPos.z - d.pos.z);
    if (p.devTrig && d.cd <= 0 && d.ohT <= 0) {
      this.gunFire(d, aimPos, p, p.team, lk, false);
      // 敵人集火砲台上的玩家（仇恨）
      for (const e of this.enemies)
        if (e.sn && e.sn.th && !e.dead && e.pos.distanceTo(d.pos) < 120 * DS)
          e.sn.th.set(p.id, (e.sn.th.get(p.id) || 0) + 2);
      this.aiNoise(p, 90 * DS);
    }
  },
  // 機體固定在操作台上（房主每格；客機的自己由 devVisTick）
  gunPin(d, p) {
    const s = this.gunSeat(d);
    p.pos.x = s.x;
    p.pos.z = s.z;
    p.vel.x = p.vel.z = 0;
    p.yaw = d.aim;
  },
  // 開火：砲口在砲塔的前方（依 d.aim 轉）
  gunFire(d, aimPos, owner, team, tgt, npc) {
    const def = d.def,
      W = def.w;
    const m = GUN_MUZZLE[d.kind.slice(4)] || [0, 2, 2];
    const a = d.aim,
      c = Math.cos(a),
      s = Math.sin(a);
    const mz = d.pos
      .clone()
      .add(new THREE.Vector3((m[0] * c + m[2] * s) * MS, m[1] * MS, (-m[0] * s + m[2] * c) * MS));
    const n = W.n || 1;
    for (let i = 0; i < n; i++) {
      const dir = aimPos.clone().sub(mz).normalize();
      const sp = W.spread || 0;
      dir.x += (Math.random() - 0.5) * sp * 2;
      dir.y += (Math.random() - 0.5) * sp * 2;
      dir.z += (Math.random() - 0.5) * sp * 2;
      if (W.kind === 'missile') dir.y += 0.35 + i * 0.05; // 導彈先往上噴、再轉向
      dir.normalize();
      const spd = W.speed * DS;
      this.projectiles.push(
        new Projectile(this, {
          pos: mz
            .clone()
            .add(new THREE.Vector3((i - (n - 1) / 2) * 0.5 * MS * c, 0, -(i - (n - 1) / 2) * 0.5 * MS * s)),
          vel: dir.multiplyScalar(spd),
          kind: W.kind,
          attr: W.attr,
          dmg: W.dmg * (npc ? GUN_NPC.dmg : 1),
          impactV: W.imp,
          team,
          owner,
          color: def.color,
          life: (W.range * DS) / spd + (W.kind === 'missile' ? 1.5 : 0.3),
          splash: (W.splash || 0) * MS,
          target: W.turn && tgt ? tgt : null,
          turn: W.turn && tgt ? W.turn : 0,
        }),
      );
    }
    const fd = aimPos.clone().sub(mz).normalize();
    this.fx.muzzle(mz, fd, def.color, W.kind === 'bullet' ? 1.6 : 3);
    SFX.shot(SHOT_KIND[W.kind] || 'bullet', undefined, mz, owner && owner.isPlayer ? owner : null);
    d.cd = W.rof * (npc ? GUN_NPC.rof : 1);
    d.shots = (d.shots || 0) + 1;
    d.heat += W.heat;
    if (d.heat >= 1) {
      d.heat = 1;
      d.ohT = OVERHEAT_T;
      if (owner && owner.isPlayer) this.flashMsg('砲台過熱', 0xff8040, 1.2);
    }
  },
  // ---------- G2 撿重武器 ----------
  // 擊破時掉落（onEnemyKilled 呼叫；房主／單機）
  hwDrop(e) {
    if (!this.devAllowed() || !e || !e.pos) return;
    const t = ENEMY_TYPES[e.etype] || {};
    const ch = t.roster || e.isAce ? HW_DROP_ACE : e.ai === 'part' ? HW_DROP_PART : HW_DROP[e.etype] || 0;
    if (!(Math.random() < ch)) return;
    const W = this.world;
    if (W.isVoid(e.pos.x, e.pos.z)) return;
    const idx = Math.floor(Math.random() * HW_KEYS.length);
    this.devAdd({ i: ++this.devSeq, k: 'hwpick', x: e.pos.x, z: e.pos.z, y: 0, v: idx });
  },
  hwName(d) {
    return HEAVY_WEAPONS[HW_KEYS[Math.round(d.val) % HW_KEYS.length]].name;
  },
  hwPickTick(d, dt, holder) {
    if (holder) {
      d.prog = Math.min(1, d.prog + dt / d.def.hold);
      if (d.prog >= 1) {
        const k = HW_KEYS[Math.round(d.val) % HW_KEYS.length];
        const H = HEAVY_WEAPONS[k];
        holder.hw = { k, ammo: H.ammo, cd: 0.3 };
        if (holder.isPlayer)
          this.flashMsg(`撿起${H.name} — 自動攻擊鎖定的目標（彈藥 ${H.ammo}）`, H.color, 2.2);
        SFX.ui();
        d.st = ST_USED;
        d.gone = true;
      }
    } else d.prog = Math.max(0, d.prog - dt / d.def.hold);
  },
  // 每格（房主／單機）：帶著重武器的玩家自動開火
  hwTick(dt) {
    for (const p of this.playersAlive()) {
      const h = p.hw;
      if (!h || p.downed) continue;
      const H = HEAVY_WEAPONS[h.k];
      h.cd -= dt;
      if (h.cd > 0 || p.devMount) continue;
      const R = (H.flame ? H.range * MS : H.range * DS) * 1.0;
      const lk = p.lock && !p.lock.dead && !p.lock.isProp && p.lock.pos.distanceTo(p.pos) < R ? p.lock : null;
      if (!lk && !p.hwTrig) continue;
      const mz = p.muzzle('rarm');
      const aimPos = lk ? lk.center() : p.aimPoint();
      const dir = aimPos.clone().sub(mz).normalize();
      h.cd = H.rof;
      h.ammo--;
      if (H.flame) {
        this.fx.flameCone(mz, dir, R * 0.5, H.ang * 0.5, 6);
        for (const e of this.hostilesOfEnt(p)) {
          if (e.dead || e.isProp) continue;
          const to = e.center().sub(mz);
          const dd = to.length();
          if (dd > R + (e.radius || 0) || to.normalize().dot(dir) < Math.cos(H.ang)) continue;
          e.takeDamage(H.dmg, H.imp, p, e.center(), dir.clone(), undefined, undefined, H.attr);
        }
      } else {
        const n = H.n || 1;
        for (let i = 0; i < n; i++) {
          const v = dir.clone();
          if (H.kind === 'missile') {
            v.y += 0.3 + i * 0.06;
            v.x += (i - (n - 1) / 2) * 0.12;
            v.normalize();
          }
          const spd = H.speed * DS;
          this.projectiles.push(
            new Projectile(this, {
              pos: mz.clone(),
              vel: v.multiplyScalar(spd),
              kind: H.kind,
              attr: H.attr,
              dmg: H.dmg,
              impactV: H.imp,
              team: p.team,
              owner: p,
              color: H.color,
              life: (H.range * DS) / spd + (H.kind === 'missile' ? 1.5 : 0.3),
              splash: (H.splash || 0) * MS,
              target: H.turn && lk ? lk : null,
              turn: H.turn && lk ? H.turn : 0,
            }),
          );
        }
        this.fx.muzzle(mz, dir, H.color, 2.4);
        SFX.shot(SHOT_KIND[H.kind] || 'shell', undefined, mz, p.isPlayer ? p : null);
      }
      if (h.ammo <= 0) {
        p.hw = null;
        if (p.isPlayer) this.flashMsg(`${H.name}的彈藥打完了`, 0x8a97a6, 1.6);
      }
    }
  },
  hwSnap() {
    const out = [];
    for (const p of this.playersAlive()) if (p.hw) out.push([p.id, HW_KEYS.indexOf(p.hw.k), p.hw.ammo]);
    return out.length ? out : 0;
  },
  hwApply(arr) {
    const map = new Map((arr || []).map((r) => [r[0], r]));
    const ps = this.players && this.players.length ? this.players : [this.player];
    for (const p of ps) {
      if (!p) continue;
      const r = map.get(p.id);
      p.hw = r ? { k: HW_KEYS[r[1]], ammo: r[2], cd: 0 } : null;
    }
  },
  // 顯示（各端每格）：手上的重武器、砲台的砲塔方向、自己在砲台上
  gunVis(d, dt) {
    const m = d.mesh;
    if (m.head) {
      const want = (d.aim || 0) - (d.yaw || 0);
      let da = want - m.head.rotation.y;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      m.head.rotation.y += da * Math.min(1, dt * 10);
      m.visible = true;
    }
    if (m.item) {
      m.item.rotation.y += dt * 1.2;
      m.item.position.y = 1.3 + Math.sin(this.time * 2) * 0.12;
    }
    const lit = d.st === ST_USED ? 0.05 : d.ohT > 0 ? 2.5 : d.st === ST_FOE ? 0.5 : 1.2;
    for (const g of d.glow) {
      g.emissiveIntensity = lit;
      if (d.def.gun) g.emissive.setHex(d.st === ST_FOE ? 0xff4040 : d.ohT > 0 ? 0xff8040 : d.def.color);
    }
    if (d.st === ST_USED && d.def.gun && m.head)
      m.head.rotation.x = Math.min(0.5, (m.head.rotation.x || 0) + dt);
  },
  hwVis() {
    const ps = this.players && this.players.length ? this.players : [this.player];
    for (const p of ps) {
      if (!p) continue;
      const k = p.hw && !p.dead ? p.hw.k : null;
      if (p.hwMesh && p.hwMesh.k !== k) {
        this.scene.remove(p.hwMesh);
        p.hwMesh = null;
      }
      if (!k) continue;
      if (!p.hwMesh) {
        p.hwMesh = buildHwMesh(k, HEAVY_WEAPONS[k].color);
        p.hwMesh.k = k;
        p.hwMesh.scale.setScalar(MS * 0.9);
        this.scene.add(p.hwMesh);
      }
      // 右肩外側、朝瞄準方向
      const y = p.aimYaw || p.yaw || 0;
      const c = p.center();
      p.hwMesh.position.set(c.x + Math.cos(y) * 1.5 * MS, c.y + 0.6 * MS, c.z - Math.sin(y) * 1.5 * MS);
      p.hwMesh.rotation.set(0, y + Math.PI, 0);
    }
  },
  hwClear() {
    const ps = this.players && this.players.length ? this.players : [this.player];
    for (const p of ps)
      if (p && p.hwMesh) {
        this.scene.remove(p.hwMesh);
        p.hwMesh = null;
      }
  },
  // HUD：砲台上（耐久、熱量）與重武器的彈藥
  gunHud(c, W, H, p) {
    const d = p.devMount ? (this.devs || []).find((o) => o.id === p.devMount) : null;
    c.save();
    c.textAlign = 'center';
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0,0,0,.7)';
    if (d) {
      const y = H * 0.78,
        w = 220;
      c.fillStyle = 'rgba(0,0,0,.45)';
      c.fillRect(W / 2 - w / 2 - 8, y - 30, w + 16, 52);
      c.font = 'bold 13px Chakra Petch';
      c.fillStyle = '#' + d.def.color.toString(16).padStart(6, '0');
      c.fillText(`${d.def.name}　${this.devKeyLabel()} 離開`, W / 2, y - 14);
      const bar = (yy, k, col) => {
        c.fillStyle = 'rgba(255,255,255,.15)';
        c.fillRect(W / 2 - w / 2, yy, w, 6);
        c.fillStyle = col;
        c.fillRect(W / 2 - w / 2, yy, w * Math.max(0, Math.min(1, k)), 6);
      };
      bar(y - 6, d.hp / d.def.hp, '#7ee081');
      bar(y + 4, d.ohT > 0 ? 1 : d.heat, d.ohT > 0 ? '#ff5040' : '#ffb040');
      c.font = 'bold 10px Chakra Petch';
      c.fillStyle = '#c8d0d8';
      c.fillText(d.ohT > 0 ? 'OVERHEAT' : '耐久／熱量', W / 2, y + 20);
    }
    if (p.hw) {
      const Hd = HEAVY_WEAPONS[p.hw.k];
      c.font = 'bold 13px Chakra Petch';
      c.textAlign = 'right';
      const t = `重武器 ${Hd.name}　${p.hw.ammo}／${Hd.ammo}`;
      c.strokeText(t, W - 20, H - 200);
      c.fillStyle = '#' + Hd.color.toString(16).padStart(6, '0');
      c.fillText(t, W - 20, H - 200);
    }
    c.restore();
  },
});
