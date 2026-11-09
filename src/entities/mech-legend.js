// ---------- MechEntity 擴充：傳說模組的行為（主線擴充 B3，data/modules.js 的 lg_*、docs/campaign-expansion-design.md） ----------
// 2026-11-09 改版（docs/gear-rarity-design.md 第 8 節）：和零件品級詞條重疊的換成「只有一次出擊才有」的效果。
// 都由持有者的加成表（pmv）決定，只有主線的玩家機體會有；判定只在房主／單機，外觀用會轉送給客機的 fx。
// 機體端的掛勾：fire 的傷害（lgShotK）、雷射（lgLaserHits：蓄力共鳴）、能量武器與 QB 的 EN（lgEnK、lgQbK）、
// 受傷（lgDefense：反應裝甲、戰地醫護、增援壁壘）、擊破（lgKill：連鎖引爆、懸賞）、每格（lgTick：電弧推進、計時）、
// 撿到彈藥箱（lgPickup）、使用地圖裝置（lgDevUse）、修復套件（lgKit）、補給箱（lgCacheOpen）、增援抵達（lgWaveShield）、速度（lgSpdK）。
// Game 端（掉落、增援硬直、察覺、出口、陷阱）用 Game.lgAny（game/tactics.js）。
import { DS } from '../core/scale.js';
import { usesAmmo } from '../data/parts.js';
import { MechEntity } from './mech-entity.js';

const LG = {
  RESO_T: 3, // 蓄力共鳴
  ARCQB_R: 6 * DS, // 電弧推進
  REACT_CD: 3, // 反應裝甲
  SALVO_T: 10, // 補給回收
  SALVO_K: 1.2,
  OVER_K: 1.15, // 超頻（能量武器）
  CONDUIT_T: 8, // 能源導管
  MEDIC_T: 3, // 戰地醫護
  MEDIC_R: 40 * DS,
  BOUNTY_N: 5, // 懸賞
  EXIT_T: 15, // 急行軍：開場的加速
};
const near = (g, ent, pos, R, skip) =>
  g
    .hostilesOfEnt(ent)
    .filter((e) => !e.dead && !e.isProp && !(skip && skip.includes(e)) && e.pos.distanceTo(pos) < R)
    .sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos));
const isEn = (d) => d && (d.attr === 'en' || d.type === 'laser' || d.type === 'empbeam');

Object.assign(MechEntity.prototype, {
  lg(k) {
    return this.pm ? this.pmv(k) > 0 : false;
  },
  // 這一發的傷害倍率（fire）：補給回收（實彈）、超頻（能量武器）
  lgShotK(d) {
    let k = 1;
    if (this.lgSalvoT > 0 && usesAmmo(d)) k *= LG.SALVO_K;
    if (this.lg('lgOverclock') && isEn(d) && this.sy && this.sy.rank >= 3) k *= LG.OVER_K;
    return k;
  },
  // 子彈的額外欄位（fire 的 shoot）：目前沒有
  lgShotX() {
    return null;
  },
  // 雷射命中之後（fire 的 laser）：蓄力共鳴
  lgLaserHits(hits, dmg, imp, d, charged) {
    const tgts = hits.filter((h) => !h.t.isProp);
    if (charged && tgts.length && this.lg('lgReso')) {
      this.lgResoT = LG.RESO_T;
      if (this.isPlayer) this.game.flashMsg('蓄力共鳴：能量武器 3 秒不耗 EN', 0x7fc8ff, 1.2);
    }
  },
  // 能量武器的 EN 消耗倍率（蓄力共鳴、能源導管中＝0）
  lgEnK() {
    return this.lgResoT > 0 || this.lgConduitT > 0 ? 0 : 1;
  },
  lgMeleeHit() {},
  lgQbStart() {
    this.lgQbAt = this.t;
  },
  // QB 的 EN 消耗倍率（能源導管中＝0）
  lgQbK() {
    return this.lgConduitT > 0 ? 0 : 1;
  },
  lgLand() {},
  lgEnCheck() {},
  // EN 回復的倍率（超頻）
  lgRchK() {
    return this.lg('lgOverclock') && this.sy && this.sy.rank >= 3 ? 1.5 : 1;
  },
  // 速度的倍率（急行軍：每一段開場 15 秒；實體每一段重建）
  lgSpdK() {
    return this.lg('lgExit') && this.t < LG.EXIT_T ? 1.2 : 1;
  },
  // 受傷前（takeDamage，無敵判斷之後）：反應裝甲、戰地醫護、增援壁壘；回傳 null＝躲掉
  lgDefense(dmg, impact, from, melee) {
    if (!this.pm) return [dmg, impact];
    const g = this.game;
    const foe = from && from.team && from.team !== this.team;
    if (foe && melee && this.lg('lgReact') && (this.lgReactT || 0) <= this.t) {
      this.lgReactT = this.t + LG.REACT_CD;
      const c = this.center();
      g.explodeAt(c, 1200 * this.dmgMul, 1600, 7 * DS, this, false);
      g.fx.shockwave(c, 7, 0xffa040, 0.4);
    }
    if (this.lgMedicT > 0) dmg *= 0.5;
    if (foe && this.lgShield > 0) {
      const a = Math.min(this.lgShield, dmg);
      this.lgShield -= a;
      dmg -= a;
      if (this.lgShield <= 0) g.fx.ring(this.center(), 4, 0xe0d070);
    }
    return [dmg, impact];
  },
  lgAbsorbed() {},
  lgCheatDeath() {
    return false;
  },
  // 擊破（tactics.js 的 modKillFx）：連鎖引爆、懸賞
  lgKill(e) {
    const g = this.game;
    if (this.lg('lgChain')) {
      const c = e.center();
      const R = 9 * DS;
      g.explodeAt(c, Math.min(e.maxHp * 0.3, 2400), 900, R, this, false);
      for (const o of near(g, this, c, R, [e])) {
        if (o.isBoss || o.hp > o.maxHp * 0.2) continue;
        g.fx.bolt(c, o.center(), 0xffa040, 0.25);
        o.takeDamage(o.hp + 1, 600, this, o.center(), null, null, null, 'exp');
      }
    }
    if (this.lg('lgBounty') && (this.lgKills = (this.lgKills || 0) + 1) % LG.BOUNTY_N === 0) {
      const L = g.camp && g.campLevel ? g.campLevel() : g.save.level || 1;
      const v = 300 + L * 60;
      if (this.isPlayer) g.cacheCoam(v);
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.08);
      g.fx.ring(this.center(), 5, 0xffc040);
      if (this.isPlayer) g.flashMsg(`懸賞：COAM +${v.toLocaleString()}、AP 回復`, 0xffc040, 1.6);
    }
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
    if (this.isPlayer) this.game.flashMsg('補給回收：彈匣裝滿、實彈傷害 +20%', 0xffc040, 1.6);
  },
  // 使用地圖裝置（devices.js、devices-guns.js）：能源導管
  lgDevUse() {
    if (!this.lg('lgConduit')) return;
    if (!(this.lgConduitT > 0) && this.isPlayer)
      this.game.flashMsg('能源導管：EN 全滿、8 秒不耗 EN', 0x7fc8ff, 1.6);
    this.lgConduitT = LG.CONDUIT_T;
    this.en = this.enMax;
  },
  // 用修復套件（mission.js、mp-host.js）：戰地醫護
  lgKit() {
    if (!this.lg('lgMedic')) return;
    const g = this.game;
    this.lgMedicT = LG.MEDIC_T;
    for (const a of [...(g.players || []), ...(g.allies || [])]) {
      if (!a || a === this || a.dead || a.team !== this.team || a.pos.distanceTo(this.pos) > LG.MEDIC_R)
        continue;
      a.hp = Math.min(a.maxHp, a.hp + a.maxHp * 0.3);
      g.fx.ring(a.center(), 4, 0x7ee081);
    }
  },
  // 打開補給箱（outposts.js）：補給專家
  lgCacheOpen() {
    if (!this.lg('lgCache')) return;
    this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.25);
    this.kits = Math.min((this.kitsMax || 3) + 1, (this.kits || 0) + 1);
    this.game.fx.ring(this.center(), 5, 0x7ee081);
  },
  // 增援抵達（waves.js）：增援壁壘
  lgWaveShield() {
    if (!this.lg('lgBulwark')) return;
    this.lgShield = this.maxHp * 0.15;
    this.game.fx.ring(this.center(), 5, 0xe0d070);
    if (this.isPlayer) this.game.flashMsg('增援壁壘：護盾 AP 15%', 0xe0d070, 1.4);
  },
  // 每格（move）：計時、電弧推進
  lgTick(dt) {
    if (!this.pm) return;
    if (this.lgResoT > 0) this.lgResoT -= dt;
    if (this.lgSalvoT > 0) this.lgSalvoT -= dt;
    if (this.lgConduitT > 0) this.lgConduitT -= dt;
    if (this.lgMedicT > 0) this.lgMedicT -= dt;
    if (this.qbT > 0 && this.lg('lgArcQB')) {
      this.lgArcT = (this.lgArcT || 0) - dt;
      if (this.lgArcT <= 0) {
        this.lgArcT = 0.08;
        const g = this.game;
        for (const e of near(g, this, this.pos, LG.ARCQB_R)) {
          g.fx.bolt(this.center(), e.center(), 0x9fe0ff, 0.2);
          e.takeDamage(160 * this.dmgMul, 300, this, e.center(), null, null, null, 'en');
        }
      }
    }
  },
});
