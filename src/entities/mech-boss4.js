// ---------- MechEntity 擴充：主線擴充的新 Boss（第 7 章：ANVIL、SALAMANDER、GANTRY；docs/campaign-expansion-design.md 第 11 節）----------
// mech-boss2.js 的掛勾不認得的 ai 轉到這裡：boss4Move（移動，null＝不是這裡的）、boss4Fire、boss4Defense（倍率／null 擋下／undefined）、
// boss4Open（原本的弱點時機＝破綻）、boss4Fx（房主與客機）、boss4Die、boss4Cleanup。判定只在房主／單機。
// bossVis：
//   anvil      1 舉鎚預警、2 鎚子卡在地上（破綻）、4 淬火（減傷）
//   salamander 1 潛在地下（打不到、不能鎖定）、2 擱淺（破綻）、4 噴火、8 鑽出前的火光
//   gantry     1 電磁鐵吸引、2 電磁鐵過熱（破綻）；bx＝[放下的程度 0～1, 吊著貨櫃 0／1]
import { SFX } from '../audio/audio.js';
import { clamp, lerp, rnd } from '../core/math.js';
import { DS, MS } from '../core/scale.js';
import { MechEntity } from './mech-entity.js';

const B4 = new Set(['anvil', 'salamander', 'gantry', 'deckgun', 'reactor', 'sovereign']);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const fwd = (yaw) => V(-Math.sin(yaw), 0, -Math.cos(yaw));
const _ws = new THREE.Vector3();

Object.assign(MechEntity.prototype, {
  altOf4(t) {
    return t.pos.y - this.game.world.groundAt(t.pos.x, t.pos.z, t.pos.y + 1 * MS);
  },
  boss4Move(dt, d, dir, perp, wish, pl, r) {
    switch (this.ai) {
      case 'anvil':
        this.anvilAI(dt, d, dir, perp, wish, pl);
        return r;
      case 'salamander':
        this.salaAI(dt, d, dir, perp, wish, pl);
        return r;
      case 'gantry':
        this.gantryAI(dt, pl);
        r.done = true;
        return r;
      case 'deckgun':
        this.deckgunAI(dt, pl);
        r.done = true;
        return r;
      case 'reactor':
        this.reactorAI(dt, pl);
        r.done = true;
        return r;
      case 'sovereign':
        this.sovereignAI(dt, d, dir, perp, wish, pl, r);
        return r;
    }
    return null;
  },
  boss4Fire(dt, d, aimPos, pl) {
    if (!B4.has(this.ai)) return false;
    const auto = (slot, range, rate) => {
      const w = this.weapons[slot];
      if (!w || w.def.type === 'none' || d > range * DS || !this.canAct()) return;
      if (Math.random() < dt * rate) this.fire(slot, aimPos, pl);
      if (w.mag <= 0 && w.reloadT <= 0 && w.ammo > 0) w.reloadT = w.def.reload;
    };
    if (this.ai === 'anvil' && !this.aiState.act) auto('rarm', 40, 2.5);
    if (this.ai === 'gantry' && !(this.bossVis & 2)) {
      auto('rarm', 55, 3);
      auto('larm', 55, 3);
    }
    if (this.ai === 'deckgun' && !this.tierFlag('sec')) {
      // 副砲：只打砲塔前方 ±60° 的
      const ty = this.bx ? this.bx[0] : this.yaw;
      const a = yawTo(this.pos, pl.pos);
      if (Math.abs(Math.atan2(Math.sin(a - ty), Math.cos(a - ty))) < 1) {
        auto('rarm', 60, 3);
        auto('larm', 60, 3);
      }
    }
    if (this.ai === 'sovereign' && this.aiState.act !== 'down') {
      auto('rarm', 70, 2.5);
      auto('larm', 60, 3);
      auto('rback', 80, 0.6);
      auto('lback', 70, 0.5);
    }
    return true;
  },
  boss4Defense(dmg, impact, from, at) {
    if (!this.isBoss || !B4.has(this.ai)) return undefined;
    const s = this.aiState,
      g = this.game;
    const hint = (txt) => {
      if (from && from.isPlayer && !s.hinted) {
        s.hinted = true;
        g.flashAlert(txt);
      }
    };
    const tier = this.tierOn();
    switch (this.ai) {
      case 'anvil':
        if (this.bossVis & 4) {
          hint('淬火中 — 先打壞左肩的冷卻槽');
          return 0.4;
        }
        if (tier) return 1;
        if (this.bossVis & 2) return 1.7;
        hint('鍛造巨人的裝甲很厚 — 等鎚子砸下卡住');
        return 0.6;
      case 'salamander': {
        if (this.bossVis & 1) return null; // 潛在地下
        const cool = 0.8 + Math.min(0.7, (s.cool || 0) * 0.1); // 浮出越久越冷
        if (tier) return cool;
        return this.bossVis & 2 ? cool * 1.6 : cool;
      }
      case 'gantry':
        if (tier) return 1;
        if (this.bossVis & 2) return 1.7;
        hint('起重要塞的電磁鐵在冷卻時才脆弱 — 等它放下貨櫃');
        return 0.6;
      case 'deckgun': {
        const src = from && from.pos && from !== this ? from.pos : at;
        const ty = this.bx ? this.bx[0] : this.yaw;
        const behind = src ? fwd(ty).dot(src.clone().sub(this.pos).setY(0).normalize()) < -0.4 : false;
        if (tier) return behind ? 1.25 : 1;
        if (this.bossVis & 2) return behind ? 2 : 1.6;
        if (!behind) hint('主砲塔的正面很硬 — 繞到背後的彈藥升降機');
        return behind ? 1.3 : 0.55;
      }
      case 'reactor': {
        const src = from && from.pos && from !== this ? from.pos : at;
        if (this.reactorBlocked_(src)) {
          hint('護盾板擋住了 — 從板之間的縫隙打進去');
          return null;
        }
        if (tier) return 1;
        return this.bossVis & 2 ? 1.8 : 0.85;
      }
      case 'sovereign':
        if (tier) return 1;
        return this.bossVis & 2 ? 1.7 : 0.8;
    }
    return undefined;
  },
  boss4Open() {
    if (!B4.has(this.ai)) return false;
    return !!(this.bossVis & 2);
  },
  // ---------- ANVIL 鍛造巨人 ----------
  anvilAI(dt, d, dir, perp, wish, pl) {
    const g = this.game,
      s = this.aiState,
      dm = this.dmgMul;
    const p2 = this.phase2(),
      p3 = this.bossPhase && this.bossPhase() >= 3;
    if (s.qCd === undefined) s.qCd = 12;
    s.qCd -= dt;
    if (!s.act) {
      this.bossVis &= ~7;
      if (d > s.want + 4 * DS) wish.copy(dir).multiplyScalar(0.6);
      else if (d < s.want - 6 * DS) wish.copy(dir).multiplyScalar(-0.3);
      else wish.copy(perp).multiplyScalar(0.25);
      s.cd = (s.cd === undefined ? 2.5 : s.cd) - dt;
      if (s.cd <= 0 && this.canAct()) {
        // 淬火：AP 七成以下、冷卻槽還在（Boss 改版的部位；沒有刁鑽度時一律可以）
        if (s.qCd <= 0 && this.hp < this.maxHp * 0.7 && !this.tierFlag('quench')) s.act = 'quench';
        else if (p3 && Math.random() < 0.4) s.act = 'march';
        else if (d < 9 * DS && Math.random() < 0.6) s.act = 'sweep';
        else if (d < 40 * DS && Math.random() < 0.65) s.act = 'slam';
        else s.act = 'ingot';
        s.actT = 0;
        s.done = false;
      }
      return;
    }
    wish.set(0, 0, 0);
    if (!this.canAct() && s.act !== 'stuck') s.act = null;
    s.actT += dt;
    const end = (cd) => {
      s.act = null;
      s.cd = cd;
    };
    switch (s.act) {
      case 'slam': {
        if (!s.done) {
          s.done = true;
          const lead = pl.vel.clone().setY(0).multiplyScalar(0.5);
          if (lead.length() > 6 * DS) lead.setLength(6 * DS);
          s.at = pl.pos.clone().add(lead);
          s.at.y = g.world.groundAt(s.at.x, s.at.z, s.at.y + 2 * MS);
          // 鎚子搆得到的地方：本體前方 6～24 m
          const v = s.at.clone().sub(this.pos).setY(0);
          const L = clamp(v.length(), 6 * DS, 24 * DS);
          if (v.lengthSq() > 0.01) s.at.copy(this.pos).addScaledVector(v.normalize(), L);
          s.at.y = g.world.groundAt(s.at.x, s.at.z, this.pos.y + 4 * MS);
          this.yaw = yawTo(this.pos, s.at);
          g.fx.warnCircle(s.at, 7 * MS, 1.1, 0xff4020);
          SFX.play('heavy', 0.9, 0.6, 0.05, 0.05, this.center());
          this.bossVis |= 1;
        }
        if (s.actT >= 1.1) {
          this.anvilHit_(s.at, 520 * dm, 1100 * dm, 7);
          // 熔岩裂地：本體到落點之間
          for (let i = 1; i <= 3; i++) {
            const p = this.pos.clone().lerp(s.at, i / 4);
            g.addPool(this, p, 2.6, p2 ? 9 : 7, 150 * dm);
          }
          this.anvilStuck_(this.tierFlag('furnace') ? 3.5 : 2.5);
        }
        break;
      }
      case 'march': {
        // 第三型態：連續鎚擊沿直線推進
        if (!s.done) {
          s.done = true;
          const f = dir.clone().setY(0).normalize();
          this.yaw = yawTo(this.pos, this.pos.clone().add(f));
          this.bossVis |= 1;
          for (let i = 0; i < 4; i++) {
            const p = this.pos.clone().addScaledVector(f, (10 + i * 9) * DS);
            p.y = g.world.groundAt(p.x, p.z, this.pos.y + 6 * MS);
            const dl = 0.9 + i * 0.35;
            g.fx.warnCircle(p, 6 * MS, dl, 0xff4020);
            g.later(dl, () => {
              if (this.dead) return;
              this.anvilHit_(p, 420 * dm, 900 * dm, 6);
              g.addPool(this, p, 2.6, 8, 150 * dm);
            });
          }
          g.alertAll('鍛造巨人連續鎚擊 — 離開直線！');
        }
        if (s.actT >= 2.4) this.anvilStuck_(2);
        break;
      }
      case 'stuck':
        if (s.actT >= s.stuckT) {
          this.bossVis &= ~2;
          end(p2 ? rnd(1.8, 2.8) : rnd(2.8, 4));
        }
        break;
      case 'ingot':
        if (!s.done && s.actT > 0.8) {
          s.done = true;
          const n = p2 ? 4 : 3;
          for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2,
              rr = i ? rnd(3, 8) * DS : 0;
            const tp = pl.pos.clone().add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr));
            g.mortarShot(this, tp, { dmg: 340 * dm, im: 600 * dm, R: 4.5 * MS });
          }
          SFX.play('heavy', 0.8, 0.8, 0.05, 0.05, this.center());
        }
        if (s.actT > 1.6) end(p2 ? rnd(1.5, 2.5) : rnd(2.5, 3.5));
        break;
      case 'sweep':
        if (!s.done && s.actT > 0.6) {
          s.done = true;
          this.b3Shock(16);
        }
        if (s.actT > 1.2) end(rnd(2, 3));
        break;
      case 'quench':
        if (!s.done) {
          s.done = true;
          s.qCd = 20;
          this.bossVis |= 4;
          g.alertAll('鍛造巨人淬火 — 減傷中，打壞冷卻槽就不能再淬火');
          SFX.play('heavy', 0.9, 0.8, 0.05, 0.05, this.center());
        }
        if (s.actT > 4) {
          this.bossVis &= ~4;
          end(1.5);
        }
        break;
      default:
        s.act = null;
    }
  },
  anvilHit_(at, dmg, im, R) {
    const g = this.game;
    g.fx.explosion(at.clone().setY(at.y + 1), 4, 0xff8030, true);
    g.fx.shockwave(at.clone().setY(at.y + 0.3), R * MS, 0xffa060, 0.45);
    SFX.explode(true, at);
    g.explodeAt(at, dmg, im, R * MS, this, false);
    g.camShake = Math.max(g.camShake || 0, 0.35);
  },
  anvilStuck_(sec) {
    const s = this.aiState;
    s.act = 'stuck';
    s.actT = 0;
    s.stuckT = sec;
    this.bossVis = (this.bossVis & ~1) | 2;
    this.bossOpen(sec, true);
  },
  // ---------- SALAMANDER 熔岩潛龍 ----------
  salaAI(dt, d, dir, perp, wish, pl) {
    const g = this.game,
      s = this.aiState,
      dm = this.dmgMul;
    const p2 = this.phase2();
    this.flying = false;
    if (s.under === undefined) {
      s.under = true;
      s.t = rnd(1.5, 2.5);
    }
    s.t -= dt;
    if (s.under) {
      this.bossVis = 1;
      this.noPush = true;
      if (d > 8 * DS) wish.copy(dir).multiplyScalar(1.3);
      else wish.copy(perp);
      if (Math.random() < dt * 4) g.fx.dust(this.pos.clone(), 1.5, 2, 0x5a3424);
      if (s.t <= 0 && d < 50 * DS && this.canAct()) {
        // 鑽出：在目標附近（地面冒火光 1 秒）
        const lead = pl.vel.clone().setY(0).multiplyScalar(0.4);
        const at = pl.pos.clone().add(lead);
        const [x, z] = g.world.collide(at.x, at.z, 0, 4 * MS);
        this.pos.set(x, g.world.groundAt(x, z, pl.pos.y + 3 * MS), z);
        this.yaw = yawTo(this.pos, pl.pos);
        s.under = false;
        s.ph = 'warn';
        s.t = 1;
        s.trail = null; // 身體重新排
        g.fx.warnCircle(this.pos.clone(), 6 * MS, 1, 0xff6a20);
        SFX.play('heavy', 0.9, 0.7, 0.05, 0.05, this.pos);
      } else if (s.t <= 0) s.t = 0.5;
      return;
    }
    this.noPush = false;
    if (s.ph === 'warn') {
      wish.set(0, 0, 0);
      this.bossVis = 8;
      if (Math.random() < dt * 20) g.fx.spark(this.pos.clone().setY(this.pos.y + 0.5), 0xff7a20);
      if (s.t <= 0) {
        s.ph = 'up';
        s.t = p2 ? 9 : 7;
        s.cool = 0;
        s.atk = 1.2;
        g.fx.explosion(this.pos.clone().setY(this.pos.y + 1), 5, 0xff6a20, true);
        SFX.explode(true, this.pos);
        g.explodeAt(this.pos.clone(), 450 * dm, 900 * dm, 6 * MS, this, false);
        g.addPool(this, this.pos.clone(), 4, 8, 140 * dm);
      }
      return;
    }
    // 浮出：越久越冷（背鰭的散熱片壞了冷得更快）；被打出失衡＝擱淺，留在地面
    const beached = this.staggerT > 0;
    if (beached) s.t = Math.max(s.t, 2);
    s.cool = (s.cool || 0) + dt * (this.tierFlag('fin') ? 1.6 : 1);
    this.bossVis = beached ? 2 : 0;
    if (d > s.want + 4 * DS) wish.copy(dir).multiplyScalar(0.6);
    else if (d < s.want - 6 * DS) wish.copy(dir).multiplyScalar(-0.5);
    else wish.copy(perp).multiplyScalar(0.5);
    s.atk -= dt;
    if (s.atk <= 0 && this.canAct()) {
      s.atk = p2 ? rnd(1.6, 2.2) : rnd(2.2, 3);
      const flame = d < 18 * DS && !this.tierFlag('jaw');
      if (flame) {
        s.flameT = 1.6;
        this.yaw = yawTo(this.pos, pl.pos);
      } else if (d < 10 * DS)
        this.b3Shock(12); // 甩尾
      else {
        const n = p2 ? 4 : 3;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2,
            rr = i ? rnd(3, 7) * DS : 0;
          g.slagShot(this, pl.pos.clone().add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr)), {
            dmg: 280 * dm,
            im: 450 * dm,
            R: 3.5,
            poolR: 3.4,
            life: 7,
            dps: 140 * dm,
          });
        }
      }
    }
    if (s.flameT > 0) {
      s.flameT -= dt;
      this.bossVis |= 4;
      wish.set(0, 0, 0);
      const mz = this.muzzle('rarm');
      const f = fwd(this.yaw);
      s.flT = (s.flT || 0) - dt;
      if (s.flT <= 0) {
        s.flT = 0.08;
        g.fx.flameCone(mz, f.clone().setY(-0.08).normalize(), 9 * DS, 0.45, 5);
      }
      s.tickT = (s.tickT || 0) - dt;
      if (s.tickT <= 0) {
        s.tickT = 0.2;
        for (const t of g.hostilesOfEnt(this)) {
          if (t.dead || !t.pos) continue;
          const rel = t.pos.clone().sub(this.pos).setY(0);
          const dd = rel.length();
          if (dd > 16 * DS + t.radius || dd < 0.1 || rel.normalize().dot(f) < 0.7) continue;
          t.takeDamage(55 * dm, 40 * dm, this, t.center(), f.clone(), null, null, 'exp');
        }
      }
    }
    if (s.t <= 0 && this.canAct() && !beached) {
      s.under = true;
      s.t = p2 ? rnd(1.5, 2.5) : rnd(2.5, 3.5);
      g.fx.dust(this.pos.clone(), 3, 6, 0x5a3424);
      SFX.play('heavy', 0.8, 0.9, 0.05, 0.05, this.pos);
    }
  },
  // ---------- GANTRY 船塢起重要塞 ----------
  gantryAI(dt, pl) {
    const g = this.game,
      s = this.aiState,
      dm = this.dmgMul,
      w = g.world;
    const p2 = this.phase2();
    const Z = w.zone || [-w.lim, w.lim, -w.lim, w.lim];
    if (s.fz === undefined) {
      s.fz = this.pos.z;
      s.tx = this.pos.x;
      s.baseY = w.groundAt((Z[0] + Z[1]) / 2, this.pos.z, 999);
      s.drop = 0;
      s.crate = 1;
      s.cd = 3;
      s.crateT = 0;
    }
    // 橫梁沿 Z 追目標、吊車沿 X 追目標（腳輪壞了變慢）
    const lost = (this.tierFlag('wheelL') ? 1 : 0) + (this.tierFlag('wheelR') ? 1 : 0);
    const vz = (p2 ? 7 : 5) * DS * (1 - 0.3 * lost),
      vx = 10 * DS;
    const busy = s.act === 'drop' || s.act === 'slam';
    const tz = clamp(pl.pos.z, Z[2] + 6 * MS, Z[3] - 6 * MS),
      tx = clamp(pl.pos.x, Z[0] + 6 * MS, Z[1] - 6 * MS);
    if (!busy) {
      s.fz += clamp(tz - s.fz, -vz * dt, vz * dt);
      s.tx += clamp(tx - s.tx, -vx * dt, vx * dt);
    }
    this.pos.set(s.tx, s.baseY, s.fz);
    this.yaw = this.aimYaw = 0;
    // 貨櫃重新吊上來
    if (!s.crate) {
      s.crateT -= dt;
      if (s.crateT <= 0) s.crate = 1;
    }
    s.cd -= dt;
    const under = Math.hypot(pl.pos.x - s.tx, pl.pos.z - s.fz);
    if (!s.act && s.cd <= 0 && this.canAct()) {
      if (s.crate && under < 10 * DS) s.act = 'drop';
      else if (!this.tierFlag('magnet') && under < 30 * DS && Math.random() < 0.5) s.act = 'magnet';
      else if (p2 && under < 12 * DS) s.act = 'slam';
      else s.act = s.crate ? 'drop' : 'magnet';
      if (s.act === 'magnet' && this.tierFlag('magnet')) s.act = 'slam';
      s.actT = 0;
      s.done = false;
    }
    const at = V(s.tx, w.groundAt(s.tx, s.fz, s.baseY + 30 * MS), s.fz);
    if (s.act) s.actT += dt;
    switch (s.act) {
      case 'drop':
        if (!s.done) {
          s.done = true;
          g.fx.warnCircle(at, 6 * MS, 1.2, 0xff4020);
          SFX.play('heavy', 0.9, 0.5, 0.05, 0.05, this.center());
        }
        s.drop = Math.min(1, s.actT / 1.2);
        if (s.actT >= 1.2) {
          // 貨櫃落下：爆炸＋留下掩體；之後電磁鐵過熱（破綻）
          g.fx.explosion(at.clone().setY(at.y + 1), 4, 0xffb060, true);
          SFX.explode(true, at);
          g.explodeAt(at, 600 * dm, 1200 * dm, 5.5 * MS, this, false);
          g.camShake = Math.max(g.camShake || 0, 0.3);
          g.addTempWall(at, {
            kind: 'crate',
            w: (12 * MS) / 3,
            h: (8 * MS) / 3,
            d: (6 * MS) / 3,
            hp: 3000,
            life: 30,
          });
          s.crate = 0;
          s.crateT = 7;
          s.act = 'hot';
          s.actT = 0;
          this.bossVis |= 2;
          this.bossOpen(3, true);
        }
        break;
      case 'hot':
        s.drop = Math.max(0, 1 - s.actT / 2);
        if (Math.random() < dt * 10) g.fx.spark(this.center(), 0x80d0ff);
        if (s.actT > 3) {
          this.bossVis &= ~2;
          s.act = null;
          s.cd = p2 ? rnd(1.5, 2.5) : rnd(2.5, 3.5);
        }
        break;
      case 'magnet':
        this.bossVis |= 1;
        if (!s.done) {
          s.done = true;
          if (!s.magSaid) {
            s.magSaid = true;
            g.alertAll('電磁鐵吸引 — 按 QB 掙脫！');
          }
          SFX.play('charge', 0.8, 0.6, 0.05, 0.05, this.center());
        }
        s.tickT = (s.tickT || 0) - dt;
        if (s.tickT <= 0 && s.actT > 0.5) {
          s.tickT = 0.25;
          for (const t of g.hostilesOfEnt(this)) {
            if (t.dead || !t.pos || this.altOf4(t) > 10 * MS) continue;
            const dd = Math.hypot(t.pos.x - s.tx, t.pos.z - s.fz);
            if (dd > 32 * DS) continue;
            t.addStatus?.('hook', 0.6, { src: this.id, pull: 10 });
            if (dd < 6 * DS) t.takeDamage(60 * dm, 80 * dm, this, t.center(), null, null, null, 'en');
          }
        }
        if (s.actT > 2.8) {
          this.bossVis &= ~1;
          s.act = null;
          s.cd = p2 ? rnd(1.5, 2.5) : rnd(2.5, 3.5);
        }
        break;
      case 'slam':
        s.drop = Math.min(1, s.actT / 0.7);
        if (!s.done) {
          s.done = true;
          g.fx.warnCircle(at, 10 * MS, 0.7, 0xff4020);
        }
        if (s.actT >= 0.7 && !s.slammed) {
          s.slammed = true;
          g.fx.shockwave(at.clone().setY(at.y + 0.3), 10 * MS, 0x80d0ff, 0.45);
          g.explodeAt(at, 420 * dm, 1000 * dm, 10 * MS, this, false);
          SFX.explode(true, at);
        }
        if (s.actT > 1.6) {
          s.slammed = false;
          s.act = null;
          s.cd = rnd(2, 3);
        }
        break;
      default:
        s.drop = Math.max(0, (s.drop || 0) - dt);
    }
    this.bx = [+s.drop.toFixed(2), s.crate];
    this.bossTick(dt);
  },
  // ---------- 顯示（房主與客機）----------
  boss4Fx(dt) {
    if (!B4.has(this.ai)) return;
    const m = this.model,
      g = this.game,
      v = this.bossVis || 0,
      t = this.t || 0;
    if (!m) return;
    if (this.ai === 'anvil') {
      // 舉鎚：手臂往後上舉；卡在地上：往前砸到底
      const goal = v & 1 ? -2.4 : v & 2 ? 0.9 : -0.3 + Math.sin(t * 1.5) * 0.05;
      if (m.arm) m.arm.rotation.x = lerp(m.arm.rotation.x, goal, Math.min(1, dt * (v & 2 ? 14 : 4)));
      if (m.hot) m.hot.emissiveIntensity = v & 1 ? 2.5 + Math.sin(t * 20) : 1.2;
      if (m.vent) m.vent.visible = !this.dead;
      if (v & 4 && Math.random() < dt * 10)
        g.fx.smoke(this.center().setY(this.pos.y + 7 * MS), 1.4, 0xd0d8e0, 1, 3);
      return;
    }
    if (this.ai === 'salamander') {
      const under = !!(v & 1) && !this.dead;
      this.noLock = under;
      this.mesh.visible = !under;
      if (m.jaw) m.jaw.rotation.x = lerp(m.jaw.rotation.x, v & 4 ? 0.5 : 0.05, Math.min(1, dt * 8));
      if (m.hot) m.hot.emissiveIntensity = v & 4 ? 2.6 : v & 8 ? 2 : 1;
      if (!under) this.salaBody_();
      return;
    }
    if (this.ai === 'deckgun') {
      const bx = this.bx || [this.yaw, 0];
      if (m.tur) m.tur.rotation.y = (bx[0] || 0) - this.yaw;
      if (m.guns) m.guns.position.z = -4.6 + (bx[1] || 0) * 1.4;
      if (m.lamp) m.lamp.visible = !!(v & 2) || Math.sin(t * 4) > 0;
      if (v & 1 && Math.random() < dt * 14) g.fx.spark(this.muzzle('rarm'), 0xffb040);
      return;
    }
    if (this.ai === 'reactor') {
      const rot = this.bx ? this.bx[0] : 0;
      if (m.plates) {
        m.plates.rotation.y = rot;
        const k = v & 2 ? 0.55 : 1;
        m.plates.scale.x = m.plates.scale.z = lerp(m.plates.scale.x, k, Math.min(1, dt * 4));
        m.plates.position.y = lerp(m.plates.position.y, v & 2 ? 1.5 : 4.6, Math.min(1, dt * 4));
      }
      if (m.coreM) m.coreM.emissiveIntensity = v & 2 ? 3.5 + Math.sin(t * 16) : 1.4 + Math.sin(t * 3) * 0.3;
      return;
    }
    if (this.ai === 'gantry') {
      const w = g.world;
      const Z = w.zone || [-w.lim, w.lim, -w.lim, w.lim];
      const cx = (Z[0] + Z[1]) / 2,
        half = (Z[1] - Z[0]) / 2 + 4 * MS;
      this.mesh.updateMatrixWorld();
      m.torso.getWorldScale(_ws);
      const k = _ws.x || 1;
      if (m.frame) m.frame.position.x = (cx - this.pos.x) / k;
      if (m.beam) m.beam.scale.x = half / (10 * k);
      if (m.legsG2) m.legsG2.forEach((lg, i) => (lg.position.x = ((i ? 1 : -1) * half) / k));
      const bx = this.bx || [0, 1];
      const drop = bx[0] || 0;
      const H = m.beamH || 10;
      if (m.magnet) m.magnet.position.y = -4 - drop * (H - 4);
      if (m.rope) {
        const L = Math.max(0.2, -m.magnet.position.y - 1.3);
        m.rope.scale.y = L;
        m.rope.position.y = -L / 2;
      }
      if (m.crate) m.crate.visible = !!bx[1];
      if (m.coil) m.coil.emissiveIntensity = v & 1 ? 2.5 + Math.sin(t * 18) : v & 2 ? 3 : 1;
      if (v & 1 && Math.random() < dt * 12) g.fx.spark(this.center(), 0x80d0ff);
    }
  },
  // ---------- COLOSSUS 主砲塔（第 8 章）：砲塔慢慢轉向目標（bx[0]＝砲塔的方位），正前方的長方形齊射 → 散熱（破綻）----------
  deckgunAI(dt, pl) {
    const g = this.game,
      s = this.aiState,
      dm = this.dmgMul;
    const p2 = this.phase2();
    if (s.ty === undefined) {
      s.ty = this.yaw;
      s.cd = 3;
    }
    const want = yawTo(this.pos, pl.pos);
    let dA = Math.atan2(Math.sin(want - s.ty), Math.cos(want - s.ty));
    const rate = (p2 ? 0.5 : 0.35) * (this.tierFlag('range') ? 0.7 : 1); // 測距儀壞了轉得更慢
    if (s.act !== 'salvo' && s.act !== 'vent') s.ty += clamp(dA, -rate * dt, rate * dt);
    dA = Math.atan2(Math.sin(want - s.ty), Math.cos(want - s.ty));
    s.cd -= dt;
    const d = this.pos.distanceTo(pl.pos);
    if (!s.act && s.cd <= 0 && this.canAct()) {
      const pops = g.enemies.filter((e) => !e.dead && e.ai === 'popturret').length;
      if (Math.abs(dA) < 0.35 && d < 95 * DS) s.act = 'salvo';
      else if (pops < 3 && Math.random() < 0.5) s.act = 'pop';
      else s.act = Math.random() < 0.5 ? 'smoke' : 'salvo';
      s.actT = 0;
      s.done = false;
    }
    if (s.act) s.actT += dt;
    const f = fwd(s.ty);
    switch (s.act) {
      case 'salvo':
        if (!s.done) {
          s.done = true;
          const mid = this.pos.clone().addScaledVector(f, 52 * DS);
          mid.y = g.world.groundAt(mid.x, mid.z, this.pos.y + 10 * MS);
          g.fx.warnRect(mid, s.ty, 10 * MS, 92 * DS, 1.4);
          this.bossVis |= 1;
          SFX.play('charge', 1, 0.5, 0.05, 0.05, this.center());
          if (!s.said) {
            s.said = true;
            g.alertAll('主砲齊射 — 離開正前方！砲塔轉得很慢，繞到背後');
          }
        }
        if (s.actT >= 1.4 && !s.fired) {
          s.fired = true;
          for (let i = 0; i < 12; i++) {
            const p = this.pos.clone().addScaledVector(f, (10 + i * 7.5) * DS);
            p.y = g.world.groundAt(p.x, p.z, this.pos.y + 10 * MS);
            g.later(i * 0.05, () => {
              if (this.dead) return;
              g.fx.explosion(p.clone().setY(p.y + 1), 3.5, 0xffa040, i % 3 === 0);
              g.explodeAt(p, 480 * dm, 1000 * dm, 5 * MS, this, false);
            });
          }
          SFX.explode(true, this.center());
          g.camShake = Math.max(g.camShake || 0, 0.4);
          s.recoil = 1;
        }
        if (s.actT >= 1.8) {
          s.fired = false;
          s.act = 'vent';
          s.actT = 0;
          this.bossVis = (this.bossVis & ~1) | 2;
          this.bossOpen(3, true);
        }
        break;
      case 'vent':
        if (Math.random() < dt * 12) g.fx.smoke(this.muzzle('rarm'), 1.2, 0xc8c8c8, 1, 2);
        if (s.actT > 3) {
          this.bossVis &= ~2;
          s.act = null;
          s.cd = p2 ? rnd(2, 3) : rnd(3, 4.5);
        }
        break;
      case 'pop': {
        // 在目標附近升起兩座甲板升降砲塔
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * Math.PI * 2;
          const x = pl.pos.x + Math.cos(a) * rnd(14, 24) * DS,
            z = pl.pos.z + Math.sin(a) * rnd(14, 24) * DS;
          const [cx, cz] = g.world.nearSolid ? g.world.nearSolid(x, z) : [x, z];
          g.spawnType(
            'popturret',
            g.scaleHp || 1,
            g.scaleDmg || 1,
            V(cx, g.world.groundAt(cx, cz, 999), cz),
            1,
          );
        }
        s.act = null;
        s.cd = rnd(2, 3);
        break;
      }
      case 'smoke':
        g.addZone?.('smoke', this.pos.clone(), 14 * MS, 8);
        this.bossVis |= 4;
        s.smokeT = 8;
        s.act = null;
        s.cd = rnd(2, 3);
        break;
    }
    if (s.smokeT > 0) {
      s.smokeT -= dt;
      if (s.smokeT <= 0) this.bossVis &= ~4;
    }
    s.recoil = Math.max(0, (s.recoil || 0) - dt * 1.5);
    this.bx = [+s.ty.toFixed(3), +s.recoil.toFixed(2)];
    this.bossTick(dt);
  },
  // ---------- HEARTH 機關心臟：護盾板繞著轉（bx[0]），子彈只能從縫隙打進去；定期過載（板收起、核心外露＝破綻）----------
  reactorAI(dt, pl) {
    const g = this.game,
      s = this.aiState,
      dm = this.dmgMul;
    const p2 = this.phase2();
    if (s.rot === undefined) {
      s.rot = 0;
      s.cd = 2.5;
      s.ovT = this.tierFlag('cool') ? 12 : 20;
    }
    s.rot += dt * (p2 ? 0.9 : 0.6) * (this.bossVis & 2 ? 0.3 : 1);
    s.ovT -= dt * (this.tierFlag('cool') ? 1.7 : 1);
    s.cd -= dt;
    if (!s.act && s.ovT <= 0 && this.canAct()) {
      s.act = 'over';
      s.actT = 0;
      s.done = false;
    }
    if (!s.act && s.cd <= 0 && this.canAct()) {
      const r = Math.random();
      s.act = r < 0.35 ? 'ring' : r < 0.7 ? 'vent' : 'beams';
      s.actT = 0;
      s.done = false;
    }
    if (s.act) s.actT += dt;
    const c = this.center();
    switch (s.act) {
      case 'ring':
        if (!s.done) {
          s.done = true;
          g.pulseRing(this, { R: 44, sp: 18, band: 1.8, dmg: 380 * dm, im: 800 * dm });
        }
        if (s.actT > 1) {
          s.act = null;
          s.cd = p2 ? rnd(2, 3) : rnd(3, 4);
        }
        break;
      case 'vent':
        if (!s.done && s.actT > 0.5) {
          s.done = true;
          for (let i = 0; i < (p2 ? 5 : 4); i++) {
            const a = Math.random() * Math.PI * 2,
              rr = i ? rnd(4, 10) * DS : 0;
            g.mortarShot(this, pl.pos.clone().add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr)), {
              dmg: 300 * dm,
              im: 500 * dm,
              R: 4.5 * MS,
            });
          }
          SFX.play('heavy', 0.8, 1.2, 0.05, 0.05, c);
        }
        if (s.actT > 1.4) {
          s.act = null;
          s.cd = rnd(2, 3.5);
        }
        break;
      case 'beams':
        if (!s.done) {
          s.done = true;
          // 從四個縫隙往外的光束（預警 1 秒；方向在預警時決定）
          for (let i = 0; i < 4; i++) {
            const a = s.rot + Math.PI / 4 + (i * Math.PI) / 2;
            this.b3Beam(c.clone(), fwd(a), 1, { range: 75, dmg: 480, im: 800 });
          }
        }
        if (s.actT > 1.6) {
          s.act = null;
          s.cd = p2 ? rnd(2, 3) : rnd(3, 4);
        }
        break;
      case 'over':
        if (!s.done) {
          s.done = true;
          this.bossVis |= 2;
          this.b3Ring(40);
          this.bossOpen(5, true);
          g.alertAll('機關心臟過載 — 護盾板收起，核心外露！');
          SFX.play('laserBig', 1, 0.6, 0.05, 0.05, c);
        }
        if (Math.random() < dt * 14)
          g.fx.spark(c.clone().add(V(rnd(-3, 3), rnd(-2, 3), rnd(-3, 3))), 0x80e0ff);
        if (s.actT > 5) {
          this.bossVis &= ~2;
          s.act = null;
          s.cd = 2;
          s.ovT = 20;
        }
        break;
    }
    this.bx = [+(s.rot % (Math.PI * 2)).toFixed(3)];
    this.bossTick(dt);
  },
  // 機關心臟：攻擊者的方向被護盾板擋住嗎（板的中心在 rot＋i×90°，半寬約 30°；板發生器壞了縫隙變寬）
  reactorBlocked_(src) {
    if (this.bossVis & 2 || !src) return false;
    const rot = this.bx ? this.bx[0] : this.aiState.rot || 0;
    const a = yawTo(this.pos, src);
    const half = this.tierFlag('plates') ? 0.36 : 0.5;
    for (let i = 0; i < 4; i++) {
      const c = rot + (i * Math.PI) / 2;
      if (Math.abs(Math.atan2(Math.sin(a - c), Math.cos(a - c))) < half) return true;
    }
    return false;
  },
  // ---------- SOVEREIGN 方舟的主權者（機甲型）：像 AC 一樣近遠交替；第二型態呼叫光柱與浮游刃；第三型態「認證」格子光束＋上一位鑰匙的殘影 ----------
  sovereignAI(dt, d, dir, perp, wish, pl, r) {
    const g = this.game,
      s = this.aiState,
      dm = this.dmgMul;
    const ph = this.bossPhase ? this.bossPhase() : 1;
    s.mv = (s.mv === undefined ? 2 : s.mv) - dt;
    if (s.mv <= 0) {
      s.mv = rnd(1.5, 3);
      s.side = Math.random() < 0.5 ? -1 : 1;
      if (Math.random() < 0.35) r.qb = true;
    }
    if (s.act === 'auth' || s.act === 'down') wish.set(0, 0, 0);
    else if (d > s.want + 6 * DS) wish.copy(dir);
    else if (d < s.want - 8 * DS) wish.copy(dir).multiplyScalar(-0.8);
    else wish.copy(perp).multiplyScalar(s.side || 1);
    if (ph >= 2 && Math.random() < dt * 0.25) r.hover = true;
    s.cd = (s.cd === undefined ? 4 : s.cd) - dt;
    if (!s.act && s.cd <= 0 && this.canAct()) {
      if (ph >= 3 && !s.echoDone) s.act = 'echo';
      else if (ph >= 3 && Math.random() < 0.5) s.act = 'auth';
      else if (ph >= 2) s.act = Math.random() < 0.5 ? 'pillars' : 'blades';
      else s.act = 'rush';
      if (s.act === 'blades' && this.tierFlag('blades')) s.act = 'pillars';
      s.actT = 0;
      s.done = false;
      s.wave = 0;
    }
    if (s.act) s.actT += dt;
    switch (s.act) {
      case 'rush':
        // 突進＋霰彈般的近距離齊射
        r.ab = s.actT < 0.8;
        if (s.actT > 0.8 && !s.done) {
          s.done = true;
          this.b3Volley(pl, 2, 0.2);
        }
        if (s.actT > 1.4) {
          s.act = null;
          s.cd = rnd(3, 4.5);
        }
        break;
      case 'pillars':
        if (!s.done) {
          s.done = true;
          this.b3Pillars(pl, ph >= 3 ? 7 : 5, 12);
          g.flashAlert('甲板主砲的光柱 — 看地上的圈');
        }
        if (s.actT > 1.5) {
          s.act = null;
          s.cd = rnd(3, 4);
        }
        break;
      case 'blades':
        if (!s.done) {
          s.done = true;
          this.b3Fan(pl, 5, 0.2);
        }
        if (s.actT > 1.2) {
          s.act = null;
          s.cd = rnd(2.5, 3.5);
        }
        break;
      case 'auth': {
        // 認證：五條長方形的光束帶，每波只留一條安全的（天線壞了少一波）
        const waves = this.tierFlag('auth') ? 2 : 3;
        if (s.wave < waves && s.actT >= s.wave * 2.6) {
          if (s.wave === 0) {
            this.bossVis |= 1;
            g.alertAll('認證程序 — 只有一條光帶是安全的！');
          }
          s.wave++;
          const ax = Math.random() < 0.5 ? 0 : Math.PI / 2;
          const n = fwd(ax + Math.PI / 2);
          const safe = Math.floor(Math.random() * 5) - 2;
          for (let k = -2; k <= 2; k++) {
            if (k === safe) continue;
            const mid = pl.pos.clone().addScaledVector(n, k * 13 * MS);
            mid.y = g.world.groundAt(mid.x, mid.z, pl.pos.y + 6 * MS);
            g.fx.warnRect(mid, ax, 12 * MS, 110 * DS, 1.5, 0x80d0ff);
            g.later(1.5, () => {
              if (this.dead) return;
              const f = fwd(ax);
              for (let i = -5; i <= 5; i++) {
                const p = mid.clone().addScaledVector(f, i * 10 * DS);
                p.y = g.world.groundAt(p.x, p.z, mid.y + 6 * MS);
                g.fx.pillarStrike?.(p, 6 * MS, 0x80d0ff);
                g.explodeAt(p, 420 * dm, 900 * dm, 6.5 * MS, this, false);
              }
            });
          }
          // 每波之間停一下（破綻）
          g.later(1.7, () => !this.dead && this.bossOpen(0.8, true));
        }
        if (s.actT > waves * 2.6 + 0.6) {
          this.bossVis &= ~1;
          s.act = null;
          s.cd = rnd(3, 4);
        }
        break;
      }
      case 'echo':
        if (!s.done) {
          s.done = true;
          s.echoDone = true;
          g.sovEcho4(this, pl);
          g.alertAll('上一位鑰匙的殘影 — 主權者停機中，現在打！');
        }
        if (s.actT > 0.5 && s.act === 'echo') {
          s.act = 'down';
          s.actT = 0;
          this.bossVis |= 2;
          this.bossOpen(3, true);
        }
        break;
      case 'down':
        if (s.actT > 3) {
          this.bossVis &= ~2;
          s.act = null;
          s.cd = 2;
        }
        break;
    }
  },
  // 熔岩潛龍的身體：沿頭走過的軌跡排列（各端自己記軌跡）
  salaBody_() {
    const m = this.model,
      g = this.game,
      s = (this.sala4 = this.sala4 || {});
    if (!m.segs) return;
    const step = 2.2 * MS;
    const head = this.pos.clone();
    if (!s.trail || this.aiState.trail === null || head.distanceTo(s.trail[0]) > step * 6) {
      // 重新排：往背後拉直
      const b = fwd(this.yaw).negate();
      s.trail = [];
      for (let i = 0; i <= m.segs.length + 1; i++) s.trail.push(head.clone().addScaledVector(b, i * step));
      this.aiState.trail = undefined;
    }
    if (head.distanceTo(s.trail[0]) > step * 0.25) s.trail.unshift(head.clone());
    // 依距離沿軌跡取點（不改軌跡本身）
    const pts = [head];
    const poly = [head, ...s.trail];
    let need = step,
      acc = 0;
    for (let j = 0; j < poly.length - 1 && pts.length <= m.segs.length; j++) {
      const a = poly[j],
        b = poly[j + 1];
      const L = a.distanceTo(b);
      while (acc + L >= need && pts.length <= m.segs.length) {
        pts.push(a.clone().lerp(b, (need - acc) / Math.max(1e-4, L)));
        need += step;
      }
      acc += L;
    }
    if (s.trail.length > 80) s.trail.length = 80;
    this.mesh.updateMatrixWorld();
    const inv = this.mesh.matrixWorld.clone().invert();
    for (let i = 0; i < m.segs.length; i++) {
      const sg = m.segs[i];
      const p = pts[i + 1];
      if (!p) continue;
      const q = p.clone();
      q.y = g.world.groundAt(q.x, q.z, q.y + 4 * MS);
      const lp = q.clone().applyMatrix4(inv);
      sg.position.set(lp.x, lp.y + 1.2, lp.z);
      const prev = (i === 0 ? head : pts[i]).clone().applyMatrix4(inv);
      sg.rotation.y = Math.atan2(-(prev.x - lp.x), -(prev.z - lp.z));
    }
  },
  boss4Die() {},
  boss4Cleanup() {
    this.sala4 = null;
  },
});
