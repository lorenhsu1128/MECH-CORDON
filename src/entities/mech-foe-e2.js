// ---------- MechEntity 擴充：地圖專屬敵人（E2 組：移動要塞「方舟」，data/foes-e2.js）----------
// popturret 甲板升降砲塔：降在甲板下（bossVis 0：不能鎖定、無敵）→ 井框的燈亮 0.9 秒（1）→ 升起射 6 發砲彈（2）→ 降下。不會移動。
// boarder 登艦突擊兵（機甲模型）：目標腳下預警圈 0.9 秒（1）→ 突擊推進撲過去、落點爆炸（2）→ 停 1.2 秒（受傷 ×1.3）。
// railgunner 甲板軌道砲兵（機甲模型）：瞄準線跟著目標充能 1.8 秒，最後 0.35 秒停住（1）→ 貫穿光束 → 散熱 2.5 秒（2：受傷 ×1.4）。
// spotter 艦橋觀測無人機（飛行）：探照燈照目標 1.4 秒（1）→ 標定（spotted）並引導 3 發砲擊（預警圈 1.3 秒後落下）（2）。
// 行為只在房主／單機，顯示（foeFx_e2）房主與客機都跑。
import { SFX } from '../audio/audio.js';
import { DS, MS } from '../core/scale.js';
import { lerp, rnd } from '../core/math.js';
import { FOE_AI_E2 } from '../data/foes-e2.js';
import { MechEntity } from './mech-entity.js';
import { Projectile } from './projectile.js';

const E2 = new Set(FOE_AI_E2);
const POP = {
  under: [2, 3.5],
  warn: 0.9,
  up: 3,
  shots: 6,
  gap: 0.42,
  sp: 70 * DS,
  dmg: 150,
  im: 220,
  range: 80 * DS,
};
const LEAP = {
  warn: 0.9,
  dash: 0.55,
  rest: 1.2,
  cd: [3.5, 5],
  dmg: 420,
  im: 900,
  R: 6 * MS,
  min: 12 * DS,
  max: 48 * DS,
};
const RAIL = { charge: 1.8, lock: 0.35, cool: 2.5, cd: [3, 4.5], dmg: 900, im: 1200, range: 60, hotK: 1.4 };
const SPOT = { aim: 1.4, cd: [6, 8], n: 3, warn: 1.3, R: 5 * MS, dmg: 320, im: 500, mark: 4, range: 70 * DS };

Object.assign(MechEntity.prototype, {
  foeMove_e2(dt, d, dir, perp, wish, pl) {
    if (!E2.has(this.ai)) return undefined;
    const r = { hover: false, qb: false, ab: false, done: false };
    const s = this.aiState;
    if (!s.e2) s.e2 = { ph: 0, t: 0 };
    const c = s.e2;
    switch (this.ai) {
      case 'popturret':
        this.popAI_e2(dt, d, dir, pl, c, wish);
        break;
      case 'boarder':
        this.leapAI_e2(dt, d, dir, perp, wish, pl, c, r);
        if (c.ph !== 2) this.stuckJump(dt, r);
        break;
      case 'railgunner':
        this.railAI_e2(dt, d, dir, perp, wish, pl, c);
        this.stuckJump(dt, r);
        break;
      case 'spotter':
        this.spotAI_e2(dt, d, dir, perp, wish, pl, c);
        break;
    }
    return r;
  },
  // 一般武器：突擊兵的霰彈照常（撲擊時不開槍）；其他自己處理
  foeFire_e2() {
    if (!E2.has(this.ai)) return undefined;
    if (this.ai === 'boarder') return (this.aiState.e2 || {}).ph !== 0;
    return true;
  },
  // 受傷前：砲塔降下時無敵；突擊兵落地後、軌道砲兵散熱時受傷變重
  foeDefense_e2(dmg, impact) {
    if (!E2.has(this.ai)) return undefined;
    const c = this.aiState.e2;
    if (this.ai === 'popturret' && c && c.under) return [0, 0];
    if (this.ai === 'boarder' && (this.bossVis & 3) === 3) return [dmg * 1.3, impact * 1.3];
    if (this.ai === 'railgunner' && (this.bossVis & 3) === 2) return [dmg * RAIL.hotK, impact * 1.2];
    return [dmg, impact];
  },
  // ---------- 甲板升降砲塔 ----------
  popAI_e2(dt, d, dir, pl, c, wish) {
    const g = this.game;
    wish.set(0, 0, 0);
    if (c.t === 0 && !c.started) {
      c.started = true;
      c.under = true;
      c.t = rnd(...POP.under);
    }
    c.t -= dt;
    if (c.under) {
      this.bossVis = 0;
      if (c.t <= 0 && d < POP.range && this.canAct()) {
        c.under = false;
        c.ph = 1;
        c.t = POP.warn;
        SFX.play('ui2', 0.5, 0.6, 0.05, 0.05, this.center());
      } else if (c.t <= 0) c.t = 0.5;
      return;
    }
    if (c.ph === 1) {
      this.bossVis = 1;
      if (c.t <= 0) {
        c.ph = 2;
        c.t = POP.up;
        c.n = POP.shots;
        c.st = 0.3;
      }
    } else {
      this.bossVis = 2;
      c.st -= dt;
      if (c.n > 0 && c.st <= 0 && this.canAct()) {
        c.st = POP.gap;
        c.n--;
        const o = this.muzzle('rarm');
        const v = pl.center().sub(o).normalize().multiplyScalar(POP.sp);
        g.projectiles.push(
          new Projectile(g, {
            pos: o,
            vel: v,
            kind: 'bullet',
            dmg: POP.dmg * this.dmgMul,
            impactV: POP.im * this.dmgMul,
            team: this.team,
            owner: this,
            color: 0xffb040,
            life: 2,
            attr: 'exp',
            splash: 1.5 * MS,
          }),
        );
        g.fx.muzzle?.(o, v.clone().normalize(), 0xffb040);
        SFX.play('heavy', 0.5, 1.1, 0.05, 0.05, o);
      }
      if (c.t <= 0) {
        c.under = true;
        c.ph = 0;
        c.t = rnd(...POP.under);
      }
    }
  },
  // ---------- 登艦突擊兵 ----------
  leapAI_e2(dt, d, dir, perp, wish, pl, c, r) {
    const g = this.game;
    if (c.t === 0) c.t = rnd(1.5, 3);
    c.t -= dt;
    if (c.ph === 0) {
      this.bossVis = 0;
      if (d > this.aiState.want) wish.copy(dir);
      else wish.copy(perp).multiplyScalar(0.7);
      if (c.t <= 0 && d > LEAP.min && d < LEAP.max && this.canAct()) {
        c.ph = 1;
        c.t = LEAP.warn;
        c.at = pl.pos.clone();
        c.at.y = g.world.groundAt(c.at.x, c.at.z, c.at.y + 2 * MS);
        g.fx.warnCircle(c.at, LEAP.R, LEAP.warn, 0xff3020);
        SFX.play('charge', 0.5, 1.2, 0.05, 0.1, this.center());
      } else if (c.t <= 0) c.t = 0.6;
    } else if (c.ph === 1) {
      this.bossVis = 1;
      wish.set(0, 0, 0);
      if (c.t <= 0) {
        c.ph = 2;
        c.t = LEAP.dash;
      }
    } else if (c.ph === 2) {
      this.bossVis = 2;
      // 撲過去：朝落點突擊推進
      const v = c.at.clone().sub(this.pos).setY(0);
      if (v.length() > 2 * MS) {
        wish.copy(v.normalize());
        r.qb = true;
        r.ab = true;
      } else wish.set(0, 0, 0);
      if (c.t <= 0 || v.length() <= 2 * MS) {
        c.ph = 3;
        c.t = LEAP.rest;
        if (this.canAct()) {
          const p = this.pos.clone();
          g.fx.shockwave(p.clone().setY(p.y + 0.3), LEAP.R, 0xff6040, 0.4);
          SFX.explode(false, p);
          g.explodeAt(p, LEAP.dmg * this.dmgMul, LEAP.im * this.dmgMul, LEAP.R, this, false);
        }
      }
    } else {
      this.bossVis = 3; // 落地後的空檔：受傷 ×1.3
      wish.set(0, 0, 0);
      if (c.t <= 0) {
        c.ph = 0;
        c.t = rnd(...LEAP.cd);
      }
    }
  },
  // ---------- 甲板軌道砲兵 ----------
  railAI_e2(dt, d, dir, perp, wish, pl, c) {
    const g = this.game;
    if (c.t === 0) c.t = rnd(2, 3.5);
    c.t -= dt;
    if (c.ph === 0) {
      this.bossVis = 0;
      const want = this.aiState.want;
      if (d > want + 8 * DS) wish.copy(dir).multiplyScalar(0.7);
      else if (d < want - 15 * DS) wish.copy(dir).multiplyScalar(-0.7);
      else wish.copy(perp).multiplyScalar(0.4);
      if (c.t <= 0 && g.losClear(this.center(), pl.center()) && this.canAct()) {
        c.ph = 1;
        c.t = RAIL.charge;
        c.tp = pl.center();
        SFX.play('charge', 0.6, 0.7, 0.05, 0.1, this.center());
      } else if (c.t <= 0) c.t = 0.5;
    } else if (c.ph === 1) {
      this.bossVis = 1;
      wish.set(0, 0, 0);
      // 瞄準線跟著目標，最後 RAIL.lock 秒停住
      if (c.t > RAIL.lock) c.tp.lerp(pl.center(), Math.min(1, dt * 6));
      const mz = this.muzzle('rarm');
      if (!c.lt || c.lt <= 0) {
        c.lt = 0.12;
        g.fx.warnLine(mz, c.tp.clone(), 0.14, c.t > RAIL.lock ? 0x60c0ff : 0xffffff, 0.08);
      }
      c.lt -= dt;
      if (c.t <= 0) {
        c.ph = 2;
        c.t = RAIL.cool;
        c.lt = 0;
        if (this.canAct()) {
          const dirv = c.tp.clone().sub(mz).normalize();
          g.beamAttack(this, mz, dirv, {
            range: RAIL.range,
            dmg: RAIL.dmg * this.dmgMul,
            im: RAIL.im * this.dmgMul,
            w: 0.7,
            color: 0x9fe8ff,
            width: 0.5,
          });
          SFX.play('laserBig', 0.7, 0.8, 0.05, 0.05, mz);
        }
      }
    } else {
      this.bossVis = 2; // 散熱：受傷 ×1.4
      wish.copy(perp).multiplyScalar(0.3);
      if (c.t <= 0) {
        c.ph = 0;
        c.t = rnd(...RAIL.cd);
      }
    }
  },
  // ---------- 艦橋觀測無人機 ----------
  spotAI_e2(dt, d, dir, perp, wish, pl, c) {
    const g = this.game;
    if (c.t === 0) c.t = rnd(2, 3.5);
    c.t -= dt;
    if (d > this.aiState.want + 6 * DS) wish.copy(dir);
    else wish.copy(perp).multiplyScalar(0.8);
    if (c.ph === 0) {
      this.bossVis = 0;
      if (c.t <= 0 && d < SPOT.range && g.losClear(this.center(), pl.center()) && this.canAct()) {
        c.ph = 1;
        c.t = SPOT.aim;
        SFX.play('ui2', 0.5, 1.4, 0.05, 0.05, this.center());
      } else if (c.t <= 0) c.t = 0.6;
    } else if (c.ph === 1) {
      this.bossVis = 1;
      wish.multiplyScalar(0.3);
      if (c.t <= 0) {
        c.ph = 2;
        c.t = SPOT.warn + 0.6;
        if (this.canAct() && g.losClear(this.center(), pl.center())) this.spotStrike_e2(pl);
      }
    } else {
      this.bossVis = 2;
      if (c.t <= 0) {
        c.ph = 0;
        c.t = rnd(...SPOT.cd);
      }
    }
  },
  spotStrike_e2(pl) {
    const g = this.game;
    pl.addStatus?.('spotted', SPOT.mark, { src: this.id });
    for (let i = 0; i < SPOT.n; i++) {
      const a = Math.random() * Math.PI * 2,
        rr = i === 0 ? 0 : rnd(4, 9) * MS;
      const at = pl.pos.clone().add(new THREE.Vector3(Math.cos(a) * rr, 0, Math.sin(a) * rr));
      at.y = g.world.groundAt(at.x, at.z, at.y + 3 * MS);
      const dl = SPOT.warn + i * 0.25;
      g.fx.warnCircle(at, SPOT.R, dl, 0xffd040);
      const dmg = SPOT.dmg * this.dmgMul,
        im = SPOT.im * this.dmgMul,
        R = SPOT.R;
      g.later(dl, () => {
        g.fx.explosion(at.clone().setY(at.y + 1), 3, 0xffa040, true);
        SFX.explode(false, at);
        g.explodeAt(at, dmg, im, R, this, false);
      });
    }
  },
  // ---------- 顯示（房主與客機） ----------
  foeFx_e2(dt = 0) {
    if (!E2.has(this.ai)) return;
    const m = this.model,
      g = this.game,
      v = this.bossVis & 3,
      t = this.t || 0;
    if (this.dead) {
      if (m && m.lift) m.lift.visible = true;
      return;
    }
    switch (this.ai) {
      case 'popturret': {
        // 降下時砲塔收進甲板（只剩井框）、不能鎖定（客機照 bossVis：0 一律當成降下）
        const up = v !== 0;
        this.noLock = !up;
        if (m.lift) {
          const y = up ? 0 : -2.6;
          m.lift.position.y = lerp(m.lift.position.y, y, Math.min(1, dt * 6));
          m.lift.visible = m.lift.position.y > -2.4;
        }
        if (m.gun) m.gun.rotation.x = lerp(m.gun.rotation.x, v === 2 ? 0.08 : -0.4, Math.min(1, dt * 6));
        if (m.head) {
          const a = (this.aimYaw || this.yaw) - this.yaw;
          m.head.rotation.y = lerp(
            m.head.rotation.y,
            Math.atan2(Math.sin(a), Math.cos(a)),
            Math.min(1, dt * 4),
          );
        }
        if (v === 1 && Math.random() < dt * 14) g.fx.spark(this.pos.clone().setY(this.pos.y + 0.4), 0xffb040);
        break;
      }
      case 'spotter': {
        if (m.rotors) for (const r of m.rotors) r.rotation.y += dt * 30;
        if (m.lens)
          m.lens.emissiveIntensity = v === 1 ? 2.5 + Math.abs(Math.sin(t * 14)) : v === 2 ? 1.2 : 0.6;
        if (m.lamp) m.lamp.rotation.x = lerp(m.lamp.rotation.x, v === 1 ? -0.5 : -0.15, Math.min(1, dt * 4));
        // 探照燈的光圈（各端自己畫：照向最近的敵人）
        if (v === 1 && Math.random() < dt * 8) {
          const tg = g.hostilesOfEnt(this).find((e) => !e.dead && e.pos.distanceTo(this.pos) < SPOT.range);
          if (tg) g.fx.spark(tg.pos.clone().setY(tg.pos.y + 0.3), 0xfff0c0);
        }
        break;
      }
      case 'railgunner':
        if (v === 1 && Math.random() < dt * 10) g.fx.spark(this.muzzle('rarm'), 0x9fe8ff);
        if (v === 2 && Math.random() < dt * 6) g.fx.dust(this.center(), 1.2, 2, 0x9aa8b0);
        break;
      case 'boarder':
        if (v === 1 && Math.random() < dt * 10) g.fx.spark(this.pos.clone().setY(this.pos.y + 0.5), 0xff3020);
        break;
    }
  },
});
