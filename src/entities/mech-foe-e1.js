// ---------- MechEntity 擴充：地圖專屬敵人（E1 組：火山熔爐帶，data/foes-e1.js）----------
// slagger 熔渣投擲機：預警圈 1.2 秒 → 熔渣落地（爆炸＋燃燒地面 addPool）。轉身慢，貼近時打不到。
// heatguard 耐熱重裝 MT（機甲模型）：衝到近距離用火焰噴射器（錐形，每 0.2 秒判定）2 秒，之後過熱 2.5 秒＝受傷 ×1.5；
//   踩熔岩不會受傷（game/lava.js）。
// magmadrone 熔岩潛行無人機：潛在地下（bossVis 1：隱藏、不能鎖定、無敵）移動到目標附近，地面冒火光 1 秒後浮出、
//   射一輪熔岩彈（4 發），1.8 秒後再潛下去。
// bellows 熱風鼓風機：蓄氣 1.4 秒（鼓風筒發光、扇葉加速）→ 噴出熱風：前方 ±40°、22 m×DS 內的機體被往外吹＋小傷害。
// 狀態（bossVis）：1＝預警、2＝攻擊／過熱；行為只在房主／單機，顯示（foeFx_e1）房主與客機都跑。
import { SFX } from '../audio/audio.js';
import { DS, MS } from '../core/scale.js';
import { lerp, rnd } from '../core/math.js';
import { FOE_AI_E1 } from '../data/foes-e1.js';
import { MechEntity } from './mech-entity.js';
import { Projectile } from './projectile.js';

const E1 = new Set(FOE_AI_E1);
const SLAG = {
  warn: 1.2,
  cd: [4.5, 6],
  range: 75 * DS,
  dmg: 380,
  im: 700,
  R: 5 * MS,
  pool: 5,
  poolLife: 6,
  poolDps: 80,
};
const FLAME = { range: 14 * DS, ang: 0.5, dps: 260, dur: 2, cool: 2.5, cd: [3, 4], hotK: 1.5 };
const DIVE = { under: [2.5, 4], warn: 1, up: 1.8, shots: 4, sp: 42 * DS, dmg: 160, im: 260 };
const BLOW = { warn: 1.4, cd: [5, 6.5], R: 22 * DS, ang: 0.7, push: 34 * DS, dmg: 120, im: 1100 };

Object.assign(MechEntity.prototype, {
  foeMove_e1(dt, d, dir, perp, wish, pl) {
    if (!E1.has(this.ai)) return undefined;
    const r = { hover: false, qb: false, ab: false, done: false };
    const s = this.aiState;
    if (!s.e1) s.e1 = { ph: 0, t: 0 };
    const c = s.e1;
    switch (this.ai) {
      case 'slagger':
        this.slaggerAI_e1(dt, d, dir, perp, wish, pl, c);
        this.stuckJump(dt, r);
        break;
      case 'heatguard':
        this.heatAI_e1(dt, d, dir, perp, wish, pl, c, r);
        this.stuckJump(dt, r);
        break;
      case 'magmadrone':
        this.diveAI_e1(dt, d, dir, perp, wish, pl, c);
        break;
      case 'bellows':
        this.bellowsAI_e1(dt, d, dir, perp, wish, pl, c);
        break;
    }
    return r;
  },
  // 一般武器：耐熱重裝 MT 與潛行無人機的機槍照常（無人機潛行時不開火）
  foeFire_e1() {
    if (!E1.has(this.ai)) return undefined;
    if (this.ai === 'heatguard') return (this.aiState.e1 || {}).ph === 1; // 噴火時不開槍
    if (this.ai === 'magmadrone') return (this.bossVis & 3) !== 2;
    return true;
  },
  // 受傷前：潛行中無敵；耐熱重裝過熱時 ×1.5
  foeDefense_e1(dmg, impact) {
    if (!E1.has(this.ai)) return undefined;
    if (this.ai === 'magmadrone' && (this.bossVis & 3) === 0 && this.aiState.e1 && this.aiState.e1.under)
      return [0, 0];
    if (this.ai === 'heatguard' && (this.bossVis & 3) === 2) return [dmg * FLAME.hotK, impact * 1.3];
    return [dmg, impact];
  },
  // ---------- 熔渣投擲機 ----------
  slaggerAI_e1(dt, d, dir, perp, wish, pl, c) {
    const g = this.game;
    const want = this.aiState.want;
    if (d > want + 6 * DS) wish.copy(dir).multiplyScalar(0.7);
    else if (d < want - 10 * DS) wish.copy(dir).multiplyScalar(-0.6);
    else wish.copy(perp).multiplyScalar(0.3);
    if (c.t === 0) c.t = rnd(2, 3.5);
    c.t -= dt;
    if (c.ph === 0) {
      this.bossVis = 0;
      if (c.t <= 0 && d < SLAG.range && d > 12 * DS && this.canAct()) {
        c.ph = 1;
        c.t = SLAG.warn;
        const lead = pl.vel.clone().setY(0).multiplyScalar(0.6);
        if (lead.length() > 8 * DS) lead.setLength(8 * DS);
        c.at = pl.pos.clone().add(lead);
        c.at.y = g.world.groundAt(c.at.x, c.at.z, c.at.y + 2 * MS);
        g.fx.warnCircle(c.at, SLAG.R, SLAG.warn, 0xff6a20);
        SFX.play('ui2', 0.6, 0.8, 0.05, 0.05, this.center());
      } else if (c.t <= 0) c.t = 0.6;
    } else if (c.ph === 1) {
      this.bossVis = 1;
      if (c.t <= 0) {
        c.ph = 2;
        c.t = 0.5;
        if (this.canAct()) this.slagHit_e1(c.at);
      }
    } else {
      this.bossVis = 2;
      if (c.t <= 0) {
        c.ph = 0;
        c.t = rnd(...SLAG.cd);
      }
    }
  },
  slagHit_e1(at) {
    const g = this.game;
    g.fx.explosion(at.clone().setY(at.y + 1), 3, 0xff6a20, true);
    SFX.explode(false, at);
    g.explodeAt(at, SLAG.dmg * this.dmgMul, SLAG.im * this.dmgMul, SLAG.R, this, false);
    g.addPool(this, at.clone(), SLAG.pool, SLAG.poolLife, SLAG.poolDps * this.dmgMul);
  },
  // ---------- 耐熱重裝 MT ----------
  heatAI_e1(dt, d, dir, perp, wish, pl, c, r) {
    const g = this.game;
    if (c.ph !== 1) {
      if (d > FLAME.range * 0.6) wish.copy(dir);
      else wish.copy(perp).multiplyScalar(0.4).addScaledVector(dir, 0.3);
      if (d > 30 * DS && Math.random() < dt * 0.5) r.qb = true;
    } else wish.copy(dir).multiplyScalar(0.25);
    if (c.t === 0) c.t = rnd(1.5, 2.5);
    c.t -= dt;
    if (c.ph === 0) {
      this.bossVis = 0;
      if (c.t <= 0 && d < FLAME.range && this.canAct()) {
        c.ph = 1;
        c.t = FLAME.dur;
        c.tick = 0;
        SFX.play('ab', 0.8, 0.8, 0.05, 0.1, this.center());
      }
    } else if (c.ph === 1) {
      this.bossVis = 1;
      c.tick -= dt;
      if (c.tick <= 0) {
        c.tick = 0.2;
        const o = this.muzzle('rarm');
        const fd = pl.center().sub(o).normalize();
        g.fx.flameCone(o, fd, FLAME.range * 0.55, FLAME.ang * 0.6, 8);
        for (const t of g.hostilesOfEnt(this)) {
          if (t.dead) continue;
          const v = t.center().sub(o);
          const L = v.length();
          if (L > FLAME.range || v.normalize().dot(fd) < Math.cos(FLAME.ang)) continue;
          t.takeDamage(FLAME.dps * 0.2 * this.dmgMul, 60, this, t.center(), fd.clone(), null, null, 'exp');
        }
      }
      if (c.t <= 0) {
        c.ph = 2;
        c.t = FLAME.cool;
      }
    } else {
      this.bossVis = 2; // 過熱：受傷 ×1.5
      if (c.t <= 0) {
        c.ph = 0;
        c.t = rnd(...FLAME.cd);
      }
    }
  },
  // ---------- 熔岩潛行無人機 ----------
  diveAI_e1(dt, d, dir, perp, wish, pl, c) {
    const g = this.game;
    this.flying = false;
    if (c.t === 0) {
      c.under = true;
      c.t = rnd(...DIVE.under);
    }
    c.t -= dt;
    if (c.under) {
      // 潛在地下：往目標附近移動
      this.bossVis = 0;
      if (d > 18 * DS) wish.copy(dir).multiplyScalar(1.2);
      else wish.copy(perp).multiplyScalar(0.8);
      if (c.t <= 0 && d < 50 * DS) {
        c.under = false;
        c.ph = 1;
        c.t = DIVE.warn;
        g.fx.warnCircle(this.pos.clone(), 3 * MS, DIVE.warn, 0xff7a20);
      } else if (c.t <= 0) c.t = 0.5;
      return;
    }
    wish.set(0, 0, 0);
    if (c.ph === 1) {
      this.bossVis = 1; // 地面冒火光
      if (c.t <= 0) {
        c.ph = 2;
        c.t = DIVE.up;
        c.n = DIVE.shots;
        c.st = 0.15;
        g.fx.explosion(this.pos.clone().setY(this.pos.y + 1), 2, 0xff7a20, false);
      }
    } else {
      this.bossVis = 2; // 浮出：射熔岩彈
      c.st -= dt;
      if (c.n > 0 && c.st <= 0 && this.canAct()) {
        c.st = 0.28;
        c.n--;
        const o = this.muzzle('rarm');
        const v = pl.center().sub(o).normalize().multiplyScalar(DIVE.sp);
        g.projectiles.push(
          new Projectile(g, {
            pos: o,
            vel: v,
            kind: 'grenade',
            dmg: DIVE.dmg * this.dmgMul,
            impactV: DIVE.im * this.dmgMul,
            team: this.team,
            owner: this,
            color: 0xff6a20,
            life: 3,
            gravity: 6 * DS,
            splash: 2.5 * MS,
            attr: 'exp',
          }),
        );
      }
      if (c.t <= 0) {
        c.under = true;
        c.ph = 0;
        c.t = rnd(...DIVE.under);
      }
    }
  },
  // ---------- 熱風鼓風機 ----------
  bellowsAI_e1(dt, d, dir, perp, wish, pl, c) {
    const g = this.game;
    if (d > BLOW.R * 0.7) wish.copy(dir).multiplyScalar(0.6);
    else wish.set(0, 0, 0);
    if (c.t === 0) c.t = rnd(2, 3);
    c.t -= dt;
    if (c.ph === 0) {
      this.bossVis = 0;
      if (c.t <= 0 && d < BLOW.R && this.canAct()) {
        c.ph = 1;
        c.t = BLOW.warn;
        c.dir = dir.clone();
        SFX.play('charge', 0.6, 0.6, 0.05, 0.1, this.center());
      } else if (c.t <= 0) c.t = 0.5;
    } else if (c.ph === 1) {
      this.bossVis = 1;
      if (c.t <= 0) {
        c.ph = 2;
        c.t = 0.6;
        if (this.canAct()) this.blow_e1(c.dir);
      }
    } else {
      this.bossVis = 2;
      if (c.t <= 0) {
        c.ph = 0;
        c.t = rnd(...BLOW.cd);
      }
    }
  },
  blow_e1(dir) {
    const g = this.game;
    const o = this.center();
    g.fx.streaks(o, 26, 0xffb070, 18, 0.7, 20, dir, 0.6);
    g.fx.flameCone(o, dir, BLOW.R * 0.4, BLOW.ang * 0.5, 6);
    SFX.play('explode', 0.5, 0.6, 0.05, 0.1, o);
    for (const t of g.hostilesOfEnt(this)) {
      if (t.dead || t.isProp) continue;
      const v = t.pos.clone().sub(this.pos).setY(0);
      const L = v.length();
      if (L > BLOW.R || L < 0.1) continue;
      v.normalize();
      if (v.dot(dir) < Math.cos(BLOW.ang)) continue;
      const k = 1 - L / BLOW.R / 2;
      // 往外吹：直接加速度（玩家的 QB 可以抵抗）
      t.vel.addScaledVector(v, BLOW.push * k);
      t.vel.y = Math.max(t.vel.y, 4 * DS * k);
      t.takeDamage(
        BLOW.dmg * k * this.dmgMul,
        BLOW.im * k * this.dmgMul,
        this,
        t.center(),
        v,
        null,
        null,
        'exp',
      );
    }
  },
  // ---------- 顯示（房主與客機） ----------
  foeFx_e1(dt = 0) {
    if (!E1.has(this.ai)) return;
    const m = this.model,
      g = this.game,
      v = this.bossVis & 3,
      t = this.t || 0;
    if (this.dead) {
      if (m && this.ai === 'magmadrone') m.group.visible = true;
      return;
    }
    switch (this.ai) {
      case 'slagger':
        if (m.arm)
          m.arm.rotation.x = lerp(m.arm.rotation.x, v === 1 ? 0.7 : v === 2 ? -0.9 : 0, Math.min(1, dt * 8));
        if (m.turret) {
          // 旋轉台慢慢轉向瞄準的方向（相對於車身）
          const a = (this.aimYaw || 0) - this.yaw;
          m.turret.rotation.y = lerp(
            m.turret.rotation.y,
            Math.atan2(Math.sin(a), Math.cos(a)),
            Math.min(1, dt * 1.5),
          );
        }
        if (m.hot) m.hot.emissiveIntensity = v === 1 ? 1.5 + Math.abs(Math.sin(t * 12)) : 0.5;
        if (m.slag) m.slag.visible = v !== 2;
        break;
      case 'magmadrone': {
        const hide = v === 0 && !!(this.aiState.e1 ? this.aiState.e1.under : true);
        // 潛行中：隱藏、不能鎖定（客機照 bossVis：0 一律當成潛行）
        const under = this.remote ? v === 0 : hide;
        m.group.visible = !under;
        this.noLock = under;
        if (m.hot) m.hot.emissiveIntensity = v === 1 ? 2.5 : 0.8;
        if (m.finG) m.finG.rotation.z = Math.sin(t * 6) * 0.15;
        if (m.gun) m.gun.rotation.x = lerp(m.gun.rotation.x, v === 2 ? -0.3 : 0, Math.min(1, dt * 6));
        if (v === 1 && Math.random() < dt * 20) g.fx.spark(this.pos.clone().setY(this.pos.y + 0.3), 0xff7a20);
        if (under && Math.random() < dt * 3) g.fx.dust(this.pos.clone(), 1, 2, 0x5a3424);
        break;
      }
      case 'bellows':
        if (m.fan) m.fan.rotation.z += dt * (v === 1 ? 26 : v === 2 ? 40 : 4);
        if (m.hot)
          m.hot.emissiveIntensity = v === 1 ? 1 + Math.abs(Math.sin(t * 10)) * 1.5 : v === 2 ? 2.5 : 0.4;
        break;
      case 'heatguard':
        if (v === 1 && Math.random() < dt * 8) g.fx.spark(this.muzzle('rarm'), 0xff8030);
        if (v === 2 && Math.random() < dt * 6) g.fx.dust(this.center(), 1.2, 2, 0x8a8a8a);
        break;
    }
  },
});
