// ---------- MechEntity 擴充：傳說模組的行為（主線擴充 B3，data/modules.js 的 lg_*、docs/campaign-expansion-design.md） ----------
// 都由持有者的加成表（pmv）決定，只有主線的玩家機體會有；判定只在房主／單機（各掛勾點本來就只在房主跑），
// 外觀用會轉送給客機的 fx。掛勾：fire 的傷害（lgLastK）、子彈（lgShotX、projectile.js 的貫穿與分裂）、雷射（lgLaserHits）、
// 近戰命中（lgMeleeHit）、QB（lgQbStart）、落地（lgLand）、EN（useEn 的 lgEnCheck）、受傷（lgDefense、lgAbsorbed、lgCheatDeath）、
// 擊破（tactics.js 的 modKillFx）、每格（lgTick，move 裡）。
import { SFX } from '../audio/audio.js';
import { DS, MS } from '../core/scale.js';
import { MechEntity } from './mech-entity.js';
import { Projectile } from './projectile.js';

const LG = {
  LAST_DMG: 3, // 終彈強化
  LAST_IMP: 2,
  REFRACT_R: 30 * DS, // 折射的距離
  REFRACT_K: 0.6,
  ARC_R: 18 * DS, // 電弧刃
  ARC_K: 0.35, // 近戰傷害的比例
  ARC_N: 2,
  RESO_T: 3, // 蓄力共鳴
  OVER_R: 14 * DS, // 過載核心
  OVER_CD: 8,
  GHOST_T: 1.5, // 殘影
  ARCQB_R: 6 * DS, // 電弧推進
  STOMP_V: 30, // 落雷踐踏：落地速度（舊尺度的 m/s）門檻
  STOMP_R: 12 * DS,
  CHASE_T: 2, // 追擊推進
  REACT_CD: 3, // 反應裝甲
  ABSORB_K: 0.3, // 護盾轉化
  PHOENIX_HP: 0.3, // 不死鳥
  FORT_T: 1, // 堡壘
  FORT_K: 0.6,
};
const near = (g, ent, pos, R, skip) =>
  g
    .hostilesOfEnt(ent)
    .filter((e) => !e.dead && !e.isProp && !(skip && skip.includes(e)) && e.pos.distanceTo(pos) < R)
    .sort((a, b) => a.pos.distanceTo(pos) - b.pos.distanceTo(pos));

Object.assign(MechEntity.prototype, {
  lg(k) {
    return this.pm ? this.pmv(k) > 0 : false;
  },
  // 終彈強化：彈匣的最後一發（fire 的傷害、衝擊）
  lgLastK(w, d, imp) {
    if (!this.lg('lgLast') || !w || !(w.mag === 1) || !(d.mag > 1)) return 1;
    return imp ? LG.LAST_IMP : LG.LAST_DMG;
  },
  // 子彈的額外欄位（fire 的 shoot）：貫穿彈、分裂彈頭
  lgShotX(kind) {
    if (!this.pm) return null;
    const o = {};
    if ((kind === 'bullet' || kind === 'pellet') && this.lg('lgPierce')) o.pierce = true;
    if (kind === 'missile' && this.lg('lgSplit')) o.lgSplit = true;
    return Object.keys(o).length ? o : null;
  },
  // 分裂彈頭（projectile.js 的 impact）：在命中點分裂成 3 枚小導彈，追蹤附近其他的敵人
  lgSplitAt(pr, hit) {
    const g = this.game;
    const ts = near(g, this, pr.pos, 40 * DS, hit ? [hit] : []).slice(0, 3);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0.8, Math.sin(a)).normalize().multiplyScalar(30 * DS);
      g.projectiles.push(
        new Projectile(g, {
          pos: pr.pos.clone().add(new THREE.Vector3(0, 1 * MS, 0)),
          vel: v,
          kind: 'missile',
          dmg: pr.dmg * 0.35,
          impactV: pr.impactV * 0.3,
          team: this.team,
          owner: this,
          color: 0xffd080,
          life: 3,
          target: ts[i % Math.max(1, ts.length)] || null,
          turn: 7,
          splash: (pr.splash || 2 * MS) * 0.6,
          wid: pr.wid,
          scale: 0.6,
        }),
      );
    }
  },
  // 雷射命中之後（fire 的 laser）：折射、蓄力共鳴
  lgLaserHits(hits, dmg, imp, d, charged) {
    const g = this.game;
    const tgts = hits.filter((h) => !h.t.isProp).map((h) => h.t);
    if (charged && tgts.length && this.lg('lgReso')) {
      this.lgResoT = LG.RESO_T;
      if (this.isPlayer) g.flashMsg('蓄力共鳴：能量武器 3 秒不耗 EN', 0x7fc8ff, 1.2);
    }
    if (!this.lg('lgRefract') || !tgts.length) return;
    const from = tgts[tgts.length - 1];
    const t = near(g, this, from.pos, LG.REFRACT_R, tgts)[0];
    if (!t) return;
    g.fx.beam(from.center(), t.center(), d.color, 0.15, this.team);
    t.takeDamage(dmg * LG.REFRACT_K, imp * LG.REFRACT_K, this, t.center(), null, undefined, d.id);
  },
  // 能量武器的 EN 消耗倍率（蓄力共鳴中＝0）
  lgEnK() {
    return this.lgResoT > 0 ? 0 : 1;
  },
  // 近戰命中（updateMelee）：電弧刃
  lgMeleeHit(t, dmg, d) {
    if (!this.lg('lgArc')) return;
    const g = this.game;
    for (const o of near(g, this, t.pos, LG.ARC_R, [t]).slice(0, LG.ARC_N)) {
      g.fx.bolt(t.center(), o.center(), 0x9fe0ff, 0.3);
      o.takeDamage(dmg * LG.ARC_K, 200, this, o.center(), null, undefined, d.id, 'en');
    }
  },
  // QB 開始（move）
  lgQbStart() {
    this.lgQbAt = this.t;
  },
  // QB 的 EN 消耗倍率（追擊推進中＝0）
  lgQbK() {
    return this.lgChaseT > 0 ? 0 : 1;
  },
  // 落地（move）：落雷踐踏
  lgLand(v) {
    if (v < LG.STOMP_V || !this.lg('lgStomp')) return;
    const g = this.game;
    const c = this.pos.clone();
    g.fx.shockwave(c.clone().setY(c.y + 0.3), LG.STOMP_R / DS, 0x9fd8ff, 0.5);
    g.fx.bolt(c.clone().setY(c.y + 30 * MS), c, 0xbfe8ff, 0.3, 's');
    SFX.explode(false, c);
    for (const e of near(g, this, c, LG.STOMP_R)) {
      const k = 1 - e.pos.distanceTo(c) / LG.STOMP_R / 2;
      e.takeDamage(
        900 * this.dmgMul * k,
        1400 * k,
        this,
        e.center(),
        e.pos.clone().sub(c).normalize(),
        null,
        null,
        'exp',
      );
    }
  },
  // EN 用完（useEn）：過載核心
  lgEnCheck() {
    if (!this.lg('lgOverload') || this.en > this.enMax * 0.03 || (this.lgOverT || 0) > this.t) return;
    this.lgOverT = this.t + LG.OVER_CD;
    const g = this.game,
      c = this.center();
    g.fx.shockwave(c, LG.OVER_R / DS, 0x7fc8ff, 0.5);
    g.fx.arc(c, 4, 0x9fe0ff);
    SFX.play('emp', 0.8, 1, 0.05, 0.2, c);
    for (const e of near(g, this, c, LG.OVER_R)) {
      e.takeDamage(
        500 * this.dmgMul,
        1800,
        this,
        e.center(),
        e.pos.clone().sub(this.pos).normalize(),
        null,
        null,
        'en',
      );
      e.acs = Math.min(e.acsMax, e.acs + e.acsMax * 0.5);
    }
    if (this.isPlayer) g.flashMsg('過載核心：電磁脈衝', 0x7fc8ff, 1.2);
  },
  // 受傷前（takeDamage，無敵判斷之後）：殘影、堡壘、反應裝甲；回傳 null＝躲掉
  lgDefense(dmg, impact, from, melee) {
    if (!this.pm) return [dmg, impact];
    const g = this.game;
    const foe = from && from.team && from.team !== this.team;
    if (
      foe &&
      !melee &&
      this.lg('lgGhost') &&
      this.t - (this.lgQbAt || -9) < LG.GHOST_T &&
      Math.random() < 0.5
    ) {
      g.fx.flash(this.center(), 1, 0x9fe0ff, 0.1);
      return null;
    }
    if (foe && melee && this.lg('lgReact') && (this.lgReactT || 0) <= this.t) {
      this.lgReactT = this.t + LG.REACT_CD;
      const c = this.center();
      g.explodeAt(c, 1200 * this.dmgMul, 1600, 7 * DS, this, false);
      g.fx.shockwave(c, 7, 0xffa040, 0.4);
    }
    if (this.lg('lgFort') && (this.lgStillT || 0) >= LG.FORT_T) return [dmg * LG.FORT_K, 0];
    return [dmg, impact];
  },
  // 脈衝盾擋下的傷害（takeDamage 的 shield）：護盾轉化
  lgAbsorbed(v) {
    if (v > 0 && this.lg('lgAbsorb')) this.hp = Math.min(this.maxHp, this.hp + v * LG.ABSORB_K);
  },
  // AP 歸零（die 之前）：不死鳥；回傳 true＝復活
  lgCheatDeath() {
    if (!this.lg('lgPhoenix') || this.lgPhx) return false;
    this.lgPhx = true;
    this.hp = Math.round(this.maxHp * LG.PHOENIX_HP);
    this.iFrames = Math.max(this.iFrames, 2);
    const g = this.game,
      c = this.center();
    g.fx.shockwave(c, 12, 0xffb040, 0.7);
    g.fx.explosion(c, 6, 0xffb040, true);
    g.explodeAt(c, 1500 * this.dmgMul, 2400, 12 * DS, this, false);
    g.invShow(this, 2);
    if (this.isPlayer)
      g.flashMsg('不死鳥：AP 30% 復活', 0xffb040, 2.2, { k: 'good', m: '不死鳥', s: 'AP 30% 復活' });
    return true;
  },
  // 擊破（tactics.js 的 modKillFx）：連鎖引爆、追擊推進
  lgKill(e) {
    const g = this.game;
    if (this.lg('lgChase')) this.lgChaseT = LG.CHASE_T;
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
  },
  // 每格（move）：計時、堡壘的靜止時間、電弧推進
  lgTick(dt) {
    if (!this.pm) return;
    if (this.lgResoT > 0) this.lgResoT -= dt;
    if (this.lgChaseT > 0) this.lgChaseT -= dt;
    const still = this.grounded && Math.hypot(this.vel.x, this.vel.z) < 1.5 * DS;
    this.lgStillT = still ? (this.lgStillT || 0) + dt : 0;
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
