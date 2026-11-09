// MechEntity 擴充：零件品級的固定詞條——每個零件的紫色「專屬詞條」與金色「特殊詞條」（data/gear-excl.js）。
// mech-gear.js 的各個掛勾呼叫這裡的 gear*Fixed。gxF[零件 id]＝{ slot, k 數值倍率（金色 1.5）, gold, foe }。
// 判定只在房主／單機。金色的效果在 gearGold*（mech-gear-gold.js）。
import { EXCL } from '../data/gear-excl.js';
import { MechEntity } from './mech-entity.js';

const HEAVY = new Set(['shell', 'grenade']);
const HEAVY_ID = new Set(['w_lc', 'bw_lc', 'w_bz', 'w_gl', 'bw_gr']);
const isEn = (d) => d && (d.attr === 'en' || d.type === 'laser' || d.type === 'empbeam');
const isKin = (d) => d && (d.type === 'bullet' || d.type === 'shotgun') && d.attr !== 'en';

Object.assign(MechEntity.prototype, {
  gearFixedSetup(slot, g, gxF, foe) {
    if (!EXCL[g.id]) return;
    gxF[g.id] = { slot, k: g.q === 4 ? 1.5 : 1, gold: g.q === 4, foe };
    if (g.q === 4 && this.gearGoldSetup) this.gearGoldSetup(g.id, gxF[g.id]);
  },
  // 紫色專屬詞條的數值（金色 ×1.5；偏向場的冷卻 ÷1.5）
  gfv(id) {
    const F = this.gxF && this.gxF[id];
    if (!F) return 0;
    const v = EXCL[id].p.v;
    return id === 'c_aeg' ? v / F.k : v * F.k;
  },
  gF(id) {
    return this.gxF && this.gxF[id];
  },
  // ---------- 開火 ----------
  gearShotFixed(slot, w, d, dist, o, tgt) {
    const F = this.gxF,
      t = this.t,
      gs = this.gs,
      dk = this.dk;
    if (F.c_std && this.hp >= this.maxHp * 0.5) o.d *= 1 + this.gfv('c_std');
    if (F.a_hv && (HEAVY.has(d.type) || HEAVY_ID.has(d.id))) o.i *= 1.1;
    if (F.l_rj && gs.airjT > t) o.d *= 1 + this.gfv('l_rj');
    if (F.g_hi && isEn(d) && this.en >= this.enMax * 0.5) o.cd *= 1 - this.gfv('g_hi');
    if (F.f_far && isKin(d) && dist > 100 * dk) o.d *= 1 + this.gfv('f_far');
    if (F.f_mid && dist >= 40 * dk && dist <= 90 * dk) o.d *= 1 + this.gfv('f_mid');
    if (F.f_snipe && F.f_snipe.foe && dist > 60 * dk) o.d *= 1.1;
    const own = F[d.id] && F[d.id].slot === slot ? F[d.id] : null;
    if (own) {
      const v = this.gfv(d.id);
      switch (d.id) {
        case 'w_rifle':
          if (w.streak >= 9 * d.rof) o.i *= 1 + v;
          break;
        case 'w_mg':
          if (w.streak >= 3) o.cd /= 1 + v;
          break;
        case 'w_sg':
          if (dist < 10 * dk) o.i *= 1 + v;
          break;
        case 'w_lr':
        case 'w_lc':
          if (own.foe) o.d *= 1 + (d.id === 'w_lr' ? 0.12 : 0.15);
          else o.c = (o.c || 1) * (1 + v);
          break;
        case 'w_lsg':
          if (dist < 15 * dk) o.d *= 1 + v;
          break;
        case 'bw_lc':
          if (this.en >= this.enMax * 0.8) o.cd *= 1 - v;
          break;
      }
    }
    this.gearGoldShot(slot, w, d, dist, o, tgt);
  },
  // 擴散（fire）
  gearSpreadFixed(dist, slot) {
    const F = this.gxF,
      t = this.t;
    const w = slot && this.weapons[slot];
    const d = w && w.def;
    let k = 1;
    if (F.a_std && w && w.streak >= 2) k *= 1 - this.gfv('a_std');
    if (F.a_hv && d && (HEAVY.has(d.type) || HEAVY_ID.has(d.id))) k *= 1 - this.gfv('a_hv');
    if (F.l_qd && this.hoverMode) k *= 1 - this.gfv('l_qd');
    if (F.b_std && t - (this.qbStartT === undefined ? -9 : this.qbStartT) < 0.5) k *= 1 - this.gfv('b_std');
    if (F.f_cqb && dist < 20 * this.dk) k *= 1 - this.gfv('f_cqb');
    if (d && F[d.id] && F[d.id].slot === slot) {
      if (d.id === 'w_rifle' && w.streak >= 9 * d.rof) k *= 0.8;
      if (d.id === 'bw_gat' && d.spin && w.streak >= d.spin) k *= 1 - this.gfv('bw_gat');
    }
    k *= this.gearGoldSpread(dist, slot);
    return k;
  },
  // ---------- 打中別人 ----------
  gearOutFixed(tgt, dmg, imp, slot, melee, wid, attr) {
    const F = this.gxF,
      t = this.t,
      gs = this.gs;
    const d = slot && this.weapons[slot] ? this.weapons[slot].def : null;
    const own = d && F[d.id] && F[d.id].slot === slot ? F[d.id] : null;
    if (melee) {
      const m = this.melee || {};
      if (F.c_std && this.hp >= this.maxHp * 0.5) dmg *= 1 + this.gfv('c_std');
      if (F.a_ml && melee.finisher) imp *= 1 + this.gfv('a_ml');
      if (F.l_rj && gs.airjT > t) dmg *= 1 + this.gfv('l_rj');
      if (F.bw_sh && gs.shT2 > t) imp *= 1 + this.gfv('bw_sh');
      if (own) {
        const v = this.gfv(d.id);
        if (d.id === 'w_blade' && m.stage === 2) this.en = Math.min(this.enMax, this.en + this.enMax * v);
        if (d.id === 'w_saber' && m.stage >= 2) dmg *= 1 + v;
        if (d.id === 'w_pile' && m.stage === 0) imp *= 1 + v;
        if (d.id === 'w_claw') {
          if (tgt.staggerT > 0) {
            if ((tgt.gClawN || 0) < 3) {
              tgt.staggerT += v;
              tgt.gClawN = (tgt.gClawN || 0) + 1;
            }
          } else tgt.gClawN = 0;
        }
      }
    } else if (own) {
      const v = this.gfv(d.id);
      if (d.id === 'w_emp') {
        if (gs.empbId !== tgt.id || t - (gs.empbLast || -9) > 0.3) {
          gs.empbId = tgt.id;
          gs.empbT0 = t;
        }
        gs.empbLast = t;
        if (t - gs.empbT0 >= 1.5) imp *= 1 + v;
      }
      if (d.id === 'bw_pm') {
        const now = this.game.time;
        if (own.foe) tgt.gEnSlowUntil = now + 3;
        else {
          tgt.gEnVulnUntil = now + 3;
          tgt.gEnVulnK = Math.max(tgt.gEnVulnUntil > now ? tgt.gEnVulnK || 0 : 0, v);
        }
      }
    }
    // 電弧：能量武器命中時機率連鎖
    if (F.g_arc && !this.gChain && (attr === 'en' || isEn(d)) && Math.random() < this.gfv('g_arc'))
      this.gearChain(tgt, dmg * 0.4, 0, 1, 15, 0x9fe0ff);
    [dmg, imp] = this.gearGoldOut(tgt, dmg, imp, slot, melee, d, own);
    return [dmg, imp];
  },
  // 連鎖：tgt 附近（r m）另外 n 個敵人受到 dmg（電弧、跳彈、分岔…）
  gearChain(tgt, dmg, imp, n, r, col, attr) {
    const g = this.game;
    if (!g.hostilesOfEnt) return;
    const c = tgt.center();
    const R = r * this.dk;
    const cand = g
      .hostilesOfEnt(this)
      .filter((h) => h !== tgt && !h.dead && !h.isProp && h.center && h.center().distanceTo(c) < R)
      .sort((a, b) => a.center().distanceTo(c) - b.center().distanceTo(c))
      .slice(0, n);
    this.gChain = true;
    try {
      for (const h of cand) {
        if (g.fx.bolt) g.fx.bolt(c, h.center(), col || 0x9fe0ff);
        h.takeDamage(
          dmg,
          imp,
          this,
          h.center(),
          h.center().sub(c).normalize(),
          undefined,
          undefined,
          attr || 'en',
        );
      }
    } finally {
      this.gChain = false;
    }
  },
  // 弱點直取：20 m 內 CRITICAL 不看方向（mech-weak.js 的 wpTake）
  gearCritAll(tgt) {
    const G = this.gG('f_cqb');
    return !!(G && !G.foe && tgt && tgt.pos.distanceTo(this.pos) < 20 * this.dk);
  },
  // CRITICAL 的倍率（mech-weak.js 的 wpTake）
  gearCritK(tgt) {
    const F = this.gxF;
    let k = 1;
    if (F.h_scan && !F.h_scan.foe) k *= 1 + this.gfv('h_scan');
    if (F.f_snipe && !F.f_snipe.foe && tgt && tgt.pos.distanceTo(this.pos) > 60 * this.dk)
      k *= 1 + this.gfv('f_snipe');
    return k;
  },
  // ---------- 被打 ----------
  gearInFixed(from, k, ki, attr, dmg) {
    const F = this.gxF,
      t = this.t,
      gs = this.gs;
    if (F.h_std && from && from.pos && gs.omniCd <= t) {
      // 背後（面向的反方向 ±70°）打來
      const dx = from.pos.x - this.pos.x,
        dz = from.pos.z - this.pos.z;
      const fx = -Math.sin(this.yaw || 0),
        fz = -Math.cos(this.yaw || 0); // 機體的正面
      const c = (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1);
      if (c < -0.34) {
        gs.omniT = t + 2;
        gs.omniCd = t + 8 / F.h_std.k;
      }
    }
    if (F.h_std && gs.omniT > t) k *= 1 - this.gfv('h_std');
    if (F.h_hv && attr === 'exp') ki *= 1 - this.gfv('h_hv');
    if (F.c_std && this.hp >= this.maxHp * 0.5) k *= 1 - this.gfv('c_std');
    if (F.c_hv) ki *= 1 - this.gfv('c_hv');
    if (F.c_aeg && attr === 'en' && !(gs.aegT > t)) {
      gs.aegT = t + this.gfv('c_aeg');
      k = 0;
      ki = 0;
      this.game.popDamage(this.center(), '偏向', this.isPlayer, false, false, 0, this.id);
      if (this.game.fx.ring) this.game.fx.ring(this.center(), 4, 0x80c8ff);
      this.gearGoldReflect(from, dmg);
    }
    if (F.l_tk) ki *= 1 - this.gfv('l_tk');
    if (F.l_hv && gs.stillT >= 0.5) ki /= 1 + this.gfv('l_hv');
    [k, ki] = this.gearGoldIn(from, k, ki, attr, dmg);
    return [k, ki];
  },
  // ---------- 其他掛勾 ----------
  gearQbFixed() {
    const F = this.gxF;
    let k = 1;
    if (F.c_lt) k *= (1 - this.gfv('c_lt')) * (this.grounded ? 1 : 1 - this.gfv('c_lt'));
    if (F.l_bp && this.grounded && this.landT < 0.5) k *= 1 - this.gfv('l_bp');
    if (F.b_eff && this.en < this.enMax * 0.3) k *= 1 - this.gfv('b_eff');
    k *= this.gearGoldQb();
    return k;
  },
  gearSpdFixed() {
    const F = this.gxF;
    let k = 1;
    if (F.l_bp2 && this.gs.moveT >= 2) k *= 1 + this.gfv('l_bp2');
    k *= this.gearGoldSpd();
    return k;
  },
  gearRldFixed(slot) {
    const F = this.gxF,
      gs = this.gs;
    const w = this.weapons[slot];
    let k = 1;
    if (F.a_lt && /arm$/.test(slot)) k *= 1 - this.gfv('a_lt');
    if (F.w_hg && w && w.def.id === 'w_hg' && F.w_hg.slot === slot && gs.hgQuick) {
      gs.hgQuick = false;
      k *= 0.02;
    }
    k *= this.gearGoldRld(slot);
    return k;
  },
  // 預判準度
  gearLeadFixed(dist, tgt) {
    const F = this.gxF;
    let k = 0;
    if (F.f_std && tgt && this.lkId === tgt.id && this.t - (this.lkT0 || 0) >= 2) k += this.gfv('f_std');
    if (F.h_scan && F.h_scan.foe) k += 0.1;
    return k;
  },
  // 導彈的鎖定時間倍率（>1＝鎖得快）
  gearLockK(d, tgt) {
    const F = this.gxF;
    if (!F) return 1;
    let k = 1;
    if (F.f_near && tgt && tgt.pos.distanceTo(this.pos) < 30 * this.dk) k *= this.gfv('f_near');
    if (F.bw_ms && d && d.id === 'bw_ms') k /= 1 - this.gfv('bw_ms');
    k *= this.gearGoldLock(d, tgt);
    return k;
  },
  gearEvFixed(k, o) {
    const F = this.gxF,
      t = this.t,
      gs = this.gs;
    if (k === 'qb' && F.b_hi) this.iFrames = Math.max(this.iFrames, this.gfv('b_hi'));
    if (k === 'stag' && F.w_hg) gs.hgQuick = true;
    if (k === 'shieldHit') gs.shT2 = t + 2;
    if (k === 'airj') gs.airjT = t + 1;
    if (k === 'land' && F.g_fast) this.enDelay = 0;
    this.gearGoldEv(k, o);
  },
  gearKillFixed() {},
  // EMP 打中一台（game.js 的 empPulse）
  gearEmpHit(tgt, s) {
    const F = this.gxF;
    if (!F) return;
    const now = this.game.time;
    if (F.bw_emp_s) {
      tgt.gKinVulnUntil = now + s + 3;
      tgt.gKinVulnK = this.gfv('bw_emp_s');
    }
    this.gearGoldEmpHit(tgt, s);
  },
  gearTickFixed(dt) {
    const F = this.gxF,
      t = this.t,
      gs = this.gs;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    gs.moveT = sp > (this.stats.speed || 1) * 0.3 ? (gs.moveT || 0) + dt : 0;
    if (F.h_lt) {
      if (gs.lr0 === undefined) gs.lr0 = this.stats.lockRange;
      this.stats.lockRange = gs.lr0 * (gs.moveT > 0.2 ? 1 + this.gfv('h_lt') : 1);
    }
    // 切返：這一次 QB 的方向和上一次相反（0.8 秒內）→ 退還消耗
    if (F.c_nat && this.qbStartT !== undefined && this.qbStartT !== gs.qbS) {
      gs.qbS = this.qbStartT;
      const dx = this.qbDir.x,
        dz = this.qbDir.z;
      if (gs.qbPd && t - gs.qbPt < 0.8 && dx * gs.qbPd[0] + dz * gs.qbPd[1] < -0.5)
        this.en = Math.min(this.enMax, this.en + this.stats.parts.booster.qbCost * this.gfv('c_nat'));
      gs.qbPd = [dx, dz];
      gs.qbPt = t;
    }
    // 穩定輸出：EN 用完時保留一些
    if (F.g_std && this.en <= 1 && !(gs.gstdT > t)) {
      gs.gstdT = t + 10 / F.g_std.k;
      if (!this.gearGoldEnOut()) {
        this.en = Math.max(this.en, this.enMax * this.gfv('g_std'));
        this.enDelay = 0;
      }
    }
    this.gearGoldTick(dt);
  },
});
