// MechEntity 擴充：零件品級的進階詞條、專屬詞條、金色特殊詞條的判定（docs/gear-rarity-design.md）。
// 加成表 pm.gr（data/gear.js）在建立實體時整理成：gxW[槽位]＝這把武器的詞條、gx＝整台的詞條（同名取最大）、
// gxF＝零件的專屬（紫）與特殊（金）詞條。敵人只用「敵人可用」的（en），金色用弱化版。
// 判定只在房主／單機（takeDamage、fire、擊破都在那裡），客機只顯示。
import { ADV } from '../data/gear.js';
import { usesAmmo } from '../data/parts.js';
import { MechEntity } from './mech-entity.js';

const max = (o, k, v) => {
  if (!(o[k] >= v)) o[k] = v;
};
// 武器種類 → 同類專精的鍵
const SPEC = {
  bullet: 'fSpK',
  shotgun: 'fSpS',
  shell: 'fSpX',
  grenade: 'fSpX',
  missile: 'fSpM',
  laser: 'fSpL',
  empbeam: 'fSpL',
  melee: 'fSpMe',
};

Object.assign(MechEntity.prototype, {
  // 建立實體的最後（constructor）：整理詞條
  gearSetup() {
    this.gx = null;
    const gr = this.pm && this.pm.gr;
    if (!gr) return;
    const foe = this.team !== 'player';
    const gx = {},
      gxW = {},
      gxF = {};
    for (const k in gr) {
      const g = gr[k];
      if (!g || this.asm[k] !== g.id) continue;
      if (g.q >= 3)
        for (const [x, v] of g.ax || []) {
          const A = ADV[x];
          if (!A || (foe && !A.en)) continue;
          if (A.sc === 'w') (gxW[k] = gxW[k] || {})[x] = v;
          else max(gx, x, v);
          if (A.efx) {
            const o = A.efx(v);
            if (o.kitHeal) this.kitHeal += o.kitHeal;
          }
        }
      if (g.q >= 3 && this.gearFixedSetup) this.gearFixedSetup(k, g, gxF, foe); // 專屬與金色（mech-gear-fx.js）
    }
    if (!Object.keys(gx).length && !Object.keys(gxW).length && !Object.keys(gxF).length) return;
    this.gx = gx;
    this.gxW = gxW;
    this.gxF = Object.keys(gxF).length ? gxF : null;
    this.gs = { ramp: 0, rampT: 0 };
  },
  // 這個武器 id 在哪一個槽位（兩手同一種時取第一個）
  gearSlotOf(wid) {
    for (const s of ['rarm', 'larm', 'rback', 'lback']) {
      const w = this.weapons[s];
      if (w && w.def && w.def.id === wid) return s;
    }
    return null;
  },
  gearW(slot) {
    return (slot && this.gxW && this.gxW[slot]) || {};
  },
  // ---------- 開火（fire：這一發的傷害、衝擊、擴散） ----------
  gearShotK(slot, w, d, dist, rb, tgt) {
    const o = { d: 1, i: 1, cd: 1, c: 1 };
    if (!this.gx) return o;
    const W = this.gearW(slot),
      G = this.gx,
      gs = this.gs,
      t = this.t;
    const dk = this.dk;
    // 冷槍：記下上一發的時間（fire 已經改過 lastShot）
    const cold = t - (w.gPrev === undefined ? -99 : w.gPrev) > (d.rof || 0) + 1.5;
    w.gPrev = t;
    if (W.aKill && w.gKillMag) o.d *= 1 + W.aKill;
    if (W.aRamp && gs.ramp && gs.rampT > t) o.d *= 1 + W.aRamp * gs.ramp;
    if (W.aDodge && rb) o.i *= 1 + W.aDodge;
    if (W.aHigh && (this.hoverMode || this.gearAlt() > 8 * dk)) o.d *= 1 + W.aHigh;
    if (W.aCat && gs.catT > t) o.d *= 1 + W.aCat;
    if (W.aLast && usesAmmo(d) && d.mag >= 10 && w.mag <= Math.ceil(d.mag * W.aLast)) o.d *= 1.4;
    if (W.aAr && w.arN > 0) o.d *= 1 + W.aAr;
    if (W.aCold && cold) o.d *= 1 + W.aCold;
    if (W.aNear && dist < 20 * dk) o.d *= 1 + W.aNear;
    if (W.aFar && dist > 80 * dk) o.d *= 1 + W.aFar;
    // 整台
    if (G.bShot && gs.qbT > t) o.d *= 1 + G.bShot;
    if (G.fLast && this.hp < this.maxHp * 0.3) o.d *= 1 + G.fLast;
    if (G.fStyle && this.sy && this.sy.rank >= 4) o.d *= 1 + G.fStyle;
    const sp = SPEC[d.type === 'shotgun' && d.attr === 'en' ? 'laser' : d.type];
    if (sp && G[sp]) o.d *= 1 + G[sp];
    if (
      G.gFull &&
      this.en >= this.enMax * 0.99 &&
      (d.attr === 'en' || d.type === 'laser' || d.type === 'empbeam')
    )
      o.d *= 1 + G.gFull;
    if (G.sCounter && gs.shT > t) o.d *= 1 + G.sCounter;
    if (G.bRam && this.abT > 0) o.i *= 1 + G.bRam;
    if (this.gxF) this.gearShotFixed(slot, w, d, dist, o, tgt); // 專屬與金色（mech-gear-fx.js）
    return o;
  },
  // 擴散的倍率（遠距校正）
  gearSpreadK(dist, slot) {
    let k = 1;
    if (this.gx.cFar && dist > 60 * this.dk) k *= 1 - this.gx.cFar;
    if (this.gxF) k *= this.gearSpreadFixed(dist, slot);
    return k;
  },
  // 目標端的易傷（takeDamage，任何攻擊者）：電漿灼燒、弱化脈衝、電磁標記、粉碎、標定射擊
  gearVulnK(attr, from) {
    const now = this.game.time;
    let k = 1;
    if (this.gEnVulnUntil > now && attr === 'en') k *= 1 + (this.gEnVulnK || 0);
    if (this.gKinVulnUntil > now && attr === 'kin') k *= 1 + (this.gKinVulnK || 0);
    if (this.gMarkUntil > now && from && from.team !== this.team) k *= 1 + (this.gMarkK || 0);
    return k;
  },
  // 離地高度（高處優勢）
  gearAlt() {
    const W = this.game.world;
    if (!W) return 0;
    return this.pos.y - W.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
  },
  // ---------- 打中別人（takeDamage 的開頭，目標端呼叫） ----------
  gearOutK(tgt, dmg, imp, wid, melee, attr) {
    if (!this.gx || !tgt || tgt.team === this.team) return [dmg, imp];
    const slot = melee ? (this.melee && this.melee.slot) || this.gearSlotOf(wid) : this.gearSlotOf(wid);
    const W = this.gearW(slot),
      G = this.gx,
      gs = this.gs,
      t = this.t;
    const stag = tgt.staggerT > 0;
    if (W.aStag && stag) dmg *= 1 + W.aStag;
    // 壓制：有刁鑽度的 Boss 只有一半（docs/boss-design.md 第 8 節）
    if (W.aSup)
      tgt.acsDecayDelay = Math.max(tgt.acsDecayDelay || 0, W.aSup * (tgt.isBoss && tgt.tierOn() ? 0.5 : 1));
    if (melee) {
      const m = this.melee || {};
      if (W.mChain && m.stage > 0) dmg *= 1 + W.mChain * Math.min(3, m.stage);
      if (W.mParry && gs.parryT > t) dmg *= 1 + W.mParry;
      if (W.mPqb && gs.pqbHit) {
        imp *= 1 + W.mPqb;
        gs.pqbHit = 0;
      }
      if (W.mBreak && tgt.acsMax && tgt.acs >= tgt.acsMax * 0.5) imp *= 1 + W.mBreak;
      if (W.mGuard) gs.guardT = t + 1;
      if (W.mGuard) gs.guardV = W.mGuard;
      if (W.mSlashQb) {
        gs.slashT = t + 1;
        gs.slashV = W.mSlashQb;
      }
      // 近戰的整台加成（開火的在 gearShotK）
      if (G.fSpMe) dmg *= 1 + G.fSpMe;
      if (G.fLast && this.hp < this.maxHp * 0.3) dmg *= 1 + G.fLast;
      if (G.bShot && gs.qbT > t) dmg *= 1 + G.bShot;
      if (G.sCounter && gs.shT > t) dmg *= 1 + G.sCounter;
      if (G.bRam && this.abT > 0) imp *= 1 + G.bRam;
    }
    if (G.fExe && tgt.maxHp && tgt.hp < tgt.maxHp * 0.3) dmg *= 1 + G.fExe;
    if (G.eShock && tgt.gEmpUntil > this.game.time) dmg *= 1 + G.eShock;
    if (G.cMark && this.lkId === tgt.id && this.t - (this.lkT0 || 0) >= 3) dmg *= 1 + G.cMark;
    if (this.gxF) [dmg, imp] = this.gearOutFixed(tgt, dmg, imp, slot, melee, wid, attr);
    return [dmg, imp];
  },
  // ---------- 被打（takeDamage 的開頭） ----------
  gearInK(from, dmg, imp, attr) {
    if (!this.gx || (from && from.team === this.team)) return [dmg, imp];
    const G = this.gx,
      gs = this.gs,
      t = this.t;
    let k = 1;
    for (const s in this.gxW) if (this.gxW[s].aGlass) k = 1.15; // 玻璃大砲（代價）
    if (G.fStill && gs.stillT >= 1) k *= 1 - G.fStill;
    if (G.sWall && gs.stillT >= 1) k *= 1 - G.sWall;
    if (G.fReset && gs.resetT > t) k *= 1 - G.fReset;
    if (G.bDodge && (this.qbT > 0 || t - (this.qbStartT || -9) < 0.3)) k *= 1 - G.bDodge;
    if (gs.guardT > t) k *= 1 - (gs.guardV || 0);
    let ki = 1;
    if (G.fAir && !this.grounded) ki *= 1 - G.fAir;
    if (G.sFirm) ki *= 1 - G.sFirm;
    if (this.gxF) [k, ki] = this.gearInFixed(from, k, ki, attr, dmg);
    return [dmg * k, imp * ki];
  },
  // ---------- 事件（tutE 轉過來的，與其他掛勾） ----------
  gearEv(k, o) {
    if (!this.gx) return;
    const gs = this.gs,
      t = this.t,
      G = this.gx;
    if (k === 'qb') gs.qbT = t + 1;
    else if (k === 'pqb') {
      gs.pqbHit = 1;
      if (G.bPqb) this.en = Math.min(this.enMax, this.en + this.enMax * G.bPqb);
    } else if (k === 'parry') gs.parryT = t + 3;
    else if (k === 'exec') {
      for (const s in this.gxW)
        if (this.gxW[s].mExec) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.gxW[s].mExec);
    } else if (k === 'crit') gs.fastT = t + 8;
    else if (k === 'rx') gs.catT = t + 5;
    else if (k === 'shieldHit') gs.shT = t + 1;
    if (this.gxF) this.gearEvFixed(k, o);
  },
  // 擊破（tactics.js 的 modKillFx，房主／單機）
  gearKill(e) {
    if (!this.gx || this.dead) return;
    const gs = this.gs,
      t = this.t;
    for (const s in this.gxW) {
      const W = this.gxW[s];
      const w = this.weapons[s];
      if (W.aKill && w && !w.dropped && usesAmmo(w.def) && w.ammo > 0) {
        // 殺戮彈匣：立刻裝滿，下一個彈匣（到下次開始裝填為止）傷害加成
        const need = Math.min(w.def.mag - w.mag, w.ammo);
        w.mag += need;
        w.ammo -= need;
        w.reloadT = 0;
        w.gKillMag = true;
      }
      if (W.aRamp) {
        gs.ramp = Math.min(3, (gs.rampT > t ? gs.ramp : 0) + 1);
        gs.rampT = t + 10;
      }
    }
    const G = this.gx;
    if (G.fRecycle && this.game.killHealOk(this))
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * G.fRecycle);
    if (G.gRecycle) this.en = Math.min(this.enMax, this.en + this.enMax * G.gRecycle);
    if (this.gxF) this.gearKillFixed(e);
    if (this.isPlayer && this.game.renderWeaponHud) this.game.renderWeaponHud(true);
  },
  // 開始裝填（reloadT 的倍率）：速裝；殺戮彈匣的加成在這裡結束
  gearRldK(slot) {
    const w = this.weapons[slot];
    if (w) w.gKillMag = false;
    if (!this.gx) return 1;
    const W = this.gearW(slot);
    let k = 1;
    if (W.aFast && this.gs.fastT > this.t) k *= 1 - W.aFast;
    if (this.gxF) k *= this.gearRldFixed(slot);
    return k;
  },
  // QB 的消耗倍率：斬後推進、後撤脈衝
  gearQbK() {
    if (!this.gx) return 1;
    const gs = this.gs,
      t = this.t;
    let k = 1;
    if (gs.slashT > t) k *= 1 - (gs.slashV || 0);
    if (this.gx.eBack && gs.empT > t) k *= 1 - this.gx.eBack;
    if (this.gxF) k *= this.gearQbFixed();
    return Math.max(0, k);
  },
  // QB 的速度倍率（地面推進）
  gearQbSpdK() {
    if (!this.gx) return 1;
    let k = 1;
    if (this.gx.bGround && this.grounded) k *= 1 + this.gx.bGround;
    return k;
  },
  // 空中跳的消耗倍率
  gearAirJK() {
    return this.gx && this.gx.bAirJ ? 1 - this.gx.bAirJ : 1;
  },
  // EN 回復的倍率：待機充能、過載
  gearRchK() {
    let k = this.gEnSlowUntil > this.game.time ? 0.7 : 1; // 電漿灼燒（敵人身上的版本）
    if (!this.gx) return k;
    if (this.gx.gIdle && this.gs.stillT >= 0.5) k *= 1 + this.gx.gIdle;
    if (this.gx.gOver && this.en < this.enMax * 0.2) k *= 0.8;
    return k;
  },
  // 速度的倍率：過載
  gearSpdK() {
    if (!this.gx) return 1;
    let k = 1;
    if (this.gx.gOver && this.en < this.enMax * 0.2) k *= 1 + this.gx.gOver;
    if (this.gxF) k *= this.gearSpdFixed();
    return k;
  },
  // 導彈的鎖定數
  gearMissileN(d) {
    let n = this.gx && this.gx.cMulti ? Math.round(this.gx.cMulti) : 0;
    if (this.gxF) n += this.gearGoldMissileN(d);
    return n;
  },
  // 預判準度的加成
  gearLeadK(dist, tgt) {
    if (!this.gx) return 0;
    let k = 0;
    if (this.gx.cNear && dist < 20 * this.dk) k += this.gx.cNear;
    if (this.gx.cChase && tgt && tgt.qbStartT !== undefined && tgt.t - tgt.qbStartT < 0.5)
      k += this.gx.cChase;
    if (this.gxF) k += this.gearLeadFixed(dist, tgt);
    return k;
  },
  // EMP 放出（fire 的 emp）：n＝擊中的台數
  gearEmp(slot, n) {
    if (!this.gx) return;
    const W = this.gearW(slot);
    const w = this.weapons[slot];
    if (W.eChain && n >= 3 && w) w.cd *= 1 - W.eChain;
    if (this.gx.eBack) this.gs.empT = this.t + 2;
    if (this.gxF) this.gearGoldEmp(); // 脈衝護層（mech-gear-gold.js）
  },
  // 每格（update）：停下的時間、失衡結束、EN 用完
  gearTick(dt) {
    if (!this.gx) return;
    const gs = this.gs;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    gs.stillT = sp < 1.5 * this.dk ? (gs.stillT || 0) + dt : 0;
    if (gs.stag0 && this.staggerT <= 0) gs.resetT = this.t + 3;
    gs.stag0 = this.staggerT > 0;
    const out = this.en <= 1;
    if (out && !gs.enOut && this.gx.gFastRec) this.enDelay *= 1 - this.gx.gFastRec;
    gs.enOut = out;
    if (this.gxF) this.gearTickFixed(dt);
  },
});
