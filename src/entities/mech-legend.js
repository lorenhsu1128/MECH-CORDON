// ---------- MechEntity 擴充：傳說模組與 lg* 行為模組（data/modules.js、docs/gear-rarity-design.md 第 8 節） ----------
// 2026-11-10 改版：傳說模組改規則、不加數值（效果以自己這一擊為基礎，放大裝備），任何區段都能用、只有單人；
// 從傳說降成一般模組的 lg*（補給回收、能源導管、補給專家、增援壁壘…）以 pmv 的值（LV_MUL）當等級倍率 x。
// 都由持有者的加成表（pmv）決定，只有主線的玩家機體會有；判定只在房主／單機，外觀用會轉送給客機的 fx。
// 機體端的掛勾：fire 的傷害（lgShotK）、能量武器與 QB 的 EN（lgEnK、lgQbK）、受傷（lgDefense、lgBufTake）、
// 擊破（lgKill）、事件（lgEv：tutE 的 stag／pqb／rx…）、每格（lgTick）、撿到彈藥箱（lgPickup）、地圖裝置（lgDevUse）、
// 修復套件（lgKit）、補給箱（lgCacheOpen）、增援抵達（lgWaveShield）。
// Game 端（game/tactics.js）：lgAny／lgMax、停滯力場的 lgFieldK、敵人的投射物 lgHostileShot。
import { DS } from '../core/scale.js';
import { usesAmmo } from '../data/parts.js';
import { MechEntity } from './mech-entity.js';

const LG = {
  SALVO_T: 10, // 補給回收
  BUF_K: 0.4, // 緩衝裝甲：延後扣的比例
  BUF_T: 4,
  CIWS_CD: 3, // 近迫防禦
  CIWS_R: 34 * DS,
  CIWS_MIN: 5 * DS,
  DROP_HP: 0.35, // 緊急空投
  DROP_SH: 0.2,
  DROP_T: 6,
  FIELD_R: 12 * DS, // 停滯力場
  FIELD_T: 6,
  FIELD_K: 0.3, // 力場裡的時間倍率（game/tactics.js 的 lgFieldK）
};

Object.assign(MechEntity.prototype, {
  lg(k) {
    return this.pm ? this.pmv(k) > 0 : false;
  },
  // 這一發的傷害倍率（fire）：補給回收（實彈）
  lgShotK(d) {
    let k = 1;
    if (this.lgSalvoT > 0 && usesAmmo(d)) k *= 1 + 0.12 * this.pmv('lgSalvo');
    return k;
  },
  // 子彈的額外欄位（fire 的 shoot）
  lgShotX() {
    return null;
  },
  lgLaserHits() {},
  // 能量武器的 EN 消耗倍率（能源導管中＝0）
  lgEnK() {
    return this.lgConduitT > 0 ? 0 : 1;
  },
  lgQbStart() {
    this.lgQbAt = this.t;
  },
  // QB 的 EN 消耗倍率（能源導管中＝0）
  lgQbK() {
    return this.lgConduitT > 0 ? 0 : 1;
  },
  lgLand() {},
  lgEnCheck() {},
  // 受傷前（takeDamage，無敵判斷之後）：增援壁壘、緊急空投的護盾；回傳 null＝躲掉
  lgDefense(dmg, impact, from) {
    if (!this.pm) return [dmg, impact];
    const foe = from && from.team && from.team !== this.team;
    if (this.lgShieldT !== undefined && this.lgShieldT <= 0) this.lgShield = 0;
    if (foe && this.lgShield > 0) {
      const a = Math.min(this.lgShield, dmg);
      this.lgShield -= a;
      dmg -= a;
      if (this.lgShield <= 0) this.game.fx.ring(this.center(), 4, 0xe0d070);
    }
    return [dmg, impact];
  },
  // 實際扣 AP 的地方（takeDamage）：緩衝裝甲把敵人造成的傷害 40% 改成 4 秒內慢慢扣；回傳現在要扣的
  lgBufTake(real, from) {
    if (!this.lg('lgBuffer') || !from || !from.team || from.team === this.team) return real;
    const d = real * LG.BUF_K;
    (this.lgDebt = this.lgDebt || []).push({ v: d, t: LG.BUF_T });
    return real - d;
  },
  // 還沒扣的緩衝傷害
  lgDebtSum() {
    return (this.lgDebt || []).reduce((a, o) => a + o.v, 0);
  },
  // 緩衝裝甲：擊破敵人或打出失衡時一筆勾銷
  lgDebtClear() {
    if (!this.lgDebt || !this.lgDebt.length) return;
    const v = this.lgDebtSum();
    this.lgDebt.length = 0;
    if (v > 1) {
      this.game.fx.ring(this.center(), 3, 0x7ee081);
      if (this.isPlayer) this.game.flashMsg(`緩衝裝甲：抵銷 ${Math.round(v).toLocaleString()}`, 0x7ee081, 1);
    }
  },
  lgAbsorbed() {},
  lgCheatDeath() {
    return false;
  },
  // 事件（tutE）：stag＝打出失衡、pqb＝完美 QB、rx＝屬性反應…
  lgEv(k) {
    if (k === 'stag' && this.lg('lgBuffer')) this.lgDebtClear();
  },
  // 擊破（tactics.js 的 modKillFx）
  lgKill() {
    if (this.lg('lgBuffer')) this.lgDebtClear();
  },
  // 撿到彈藥箱（map-extras.js 的 collectPickup）：補給回收
  lgPickup(kind) {
    if (kind !== 'ammo' || !this.lg('lgSalvo')) return;
    for (const w of Object.values(this.weapons || {}))
      if (w && w.def && usesAmmo(w.def) && !w.dropped) {
        const need = Math.min(w.def.mag - w.mag, w.ammo);
        if (need > 0) {
          w.mag += need;
          w.ammo -= need;
        }
        w.reloadT = 0;
      }
    this.lgSalvoT = LG.SALVO_T;
    if (this.isPlayer)
      this.game.flashMsg(
        `補給回收：彈匣裝滿、實彈傷害 +${Math.round(12 * this.pmv('lgSalvo'))}%`,
        0xffc040,
        1.6,
      );
  },
  // 使用地圖裝置（devices.js、devices-guns.js）：能源導管
  lgDevUse() {
    if (!this.lg('lgConduit')) return;
    const T = 4 * this.pmv('lgConduit');
    if (!(this.lgConduitT > 0) && this.isPlayer)
      this.game.flashMsg(`能源導管：EN 全滿、${Math.round(T)} 秒不耗 EN`, 0x7fc8ff, 1.6);
    this.lgConduitT = T;
    this.en = this.enMax;
  },
  // 用修復套件（mission.js、mp-host.js）：停滯力場
  lgKit() {
    if (!this.lg('lgStasis')) return;
    const g = this.game;
    const f = { owner: this, pos: this.center(), r: LG.FIELD_R, t: LG.FIELD_T, ringT: 0 };
    (g.lgFields = g.lgFields || []).push(f);
    if (this.isPlayer) g.flashMsg('停滯力場：敵人的子彈變慢', 0x9fe8d0, 1.4);
  },
  // 打開補給箱（outposts.js）：補給專家
  lgCacheOpen() {
    if (!this.lg('lgCache')) return;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.12 * this.pmv('lgCache'));
    this.kits = Math.min((this.kitsMax || 3) + 1, (this.kits || 0) + 1);
    this.game.fx.ring(this.center(), 5, 0x7ee081);
  },
  // 增援抵達（waves.js）：增援壁壘
  lgWaveShield() {
    if (!this.lg('lgBulwark')) return;
    const k = 0.08 * this.pmv('lgBulwark');
    this.lgShield = Math.max(this.lgShield || 0, this.maxHp * k);
    this.lgShieldT = undefined;
    this.game.fx.ring(this.center(), 5, 0xe0d070);
    if (this.isPlayer) this.game.flashMsg(`增援壁壘：護盾 AP ${Math.round(k * 100)}%`, 0xe0d070, 1.4);
  },
  // 近迫防禦：擊落一發飛向自己的投射物
  lgCiwsTick() {
    const g = this.game;
    const c = this.center();
    let best = null,
      bd = LG.CIWS_R;
    for (const p of g.projectiles) {
      if (p.dead || p.visual || !g.lgHostileShot(p, this)) continue;
      const big = p.owner && p.owner.isBoss && ((p.scale || 1) > 1.5 || p.splash > 8 * DS);
      if (big || !(p.kind === 'missile' || p.kind === 'grenade' || p.kind === 'shell' || p.shootable))
        continue;
      const d = p.pos.distanceTo(c);
      if (d < LG.CIWS_MIN || d > bd) continue;
      // 飛向自己：導彈追著自己，或速度朝向自己
      const to = c.clone().sub(p.pos).normalize();
      if (p.target !== this && p.vel.clone().normalize().dot(to) < 0.6) continue;
      best = p;
      bd = d;
    }
    if (!best) return false;
    g.fx.bolt(c, best.pos.clone(), 0xffe080, 0.15);
    g.fx.explosion(best.pos.clone(), 1.2, 0xffc060);
    best.dead = true;
    g.scene.remove(best.mesh);
    if (best.netId) g.netEv({ t: 'pend', i: best.netId });
    return true;
  },
  // 緊急空投：彈藥全滿、修復套件 +1、護盾
  lgDropNow() {
    const g = this.game;
    this.lgDropUsed = true;
    for (const w of Object.values(this.weapons || {}))
      if (w && w.def && usesAmmo(w.def) && !w.dropped) {
        w.ammo = w.def.ammo;
        w.mag = w.def.mag;
        w.reloadT = 0;
      }
    this.kits = Math.min((this.kitsMax || 3) + 1, (this.kits || 0) + 1);
    this.lgShield = Math.max(this.lgShield || 0, this.maxHp * LG.DROP_SH);
    this.lgShieldT = LG.DROP_T;
    const c = this.center();
    g.fx.pillarStrike(c.clone().setY(this.pos.y), 3 * DS, 0x7ee081);
    g.fx.ring(c, 6, 0x7ee081);
    if (this.isPlayer) {
      g.flashMsg('緊急空投：彈藥全滿、修復套件 +1、護盾', 0x7ee081, 1.8);
      g.renderWeaponHud(true);
    }
  },
  // 每格（move）：計時、緩衝裝甲的扣血、近迫防禦、緊急空投、停滯力場
  lgTick(dt) {
    if (!this.pm) return;
    const g = this.game;
    if (this.lgSalvoT > 0) this.lgSalvoT -= dt;
    if (this.lgConduitT > 0) this.lgConduitT -= dt;
    if (this.lgShieldT > 0) this.lgShieldT -= dt;
    // 緩衝裝甲：每筆在 4 秒內平均扣完，這部分不會讓 AP 掉到 1 以下
    if (this.lgDebt && this.lgDebt.length && !this.dead) {
      let pay = 0;
      for (const o of this.lgDebt) {
        const x = Math.min(o.v, (o.v / Math.max(dt, o.t)) * dt);
        o.v -= x;
        o.t -= dt;
        pay += x;
      }
      this.lgDebt = this.lgDebt.filter((o) => o.v > 0.01 && o.t > -0.5);
      if (pay > 0) this.hp = Math.max(Math.min(this.hp, 1), this.hp - pay);
    }
    if (this.lg('lgCiws')) {
      this.lgCiwsCd = (this.lgCiwsCd || 0) - dt;
      if (this.lgCiwsCd <= 0 && this.lgCiwsTick()) this.lgCiwsCd = LG.CIWS_CD;
    }
    if (
      this.lg('lgDrop') &&
      !this.lgDropUsed &&
      !this.dead &&
      this.hp > 0 &&
      this.hp < this.maxHp * LG.DROP_HP
    )
      this.lgDropNow();
    if (g.lgFields) {
      for (const f of g.lgFields) {
        if (f.owner !== this) continue;
        f.t -= dt;
        f.ringT -= dt;
        if (f.ringT <= 0 && f.t > 0) {
          f.ringT = 0.5;
          g.fx.ring(f.pos, f.r, 0x9fe8d0);
        }
      }
      g.lgFields = g.lgFields.filter((f) => f.t > 0 && !f.owner.dead);
      if (!g.lgFields.length) g.lgFields = null;
    }
  },
});
