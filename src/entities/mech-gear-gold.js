// MechEntity 擴充：零件品級的金色特殊詞條（data/gear-excl.js 的 g；docs/gear-rarity-design.md 第 5 節）。
// mech-gear-fx.js 的 gear*Fixed 呼叫這裡的 gearGold*；只看金色的零件（gxF[id].gold），敵人用弱化版（foe）。判定只在房主／單機。
import { MechEntity } from './mech-entity.js';

const isEn = (d) => d && (d.attr === 'en' || d.type === 'laser' || d.type === 'empbeam');

Object.assign(MechEntity.prototype, {
  // 金色的零件（沒有＝null）
  gG(id) {
    const F = this.gxF && this.gxF[id];
    return F && F.gold ? F : null;
  },
  // 建立時就決定的
  gearGoldSetup(id, F) {
    const st = this.stats;
    if (id === 'h_scan') st.lockRange *= F.foe ? 1.15 : 1.25;
    if (id === 'f_far') st.lockRange *= F.foe ? 1.15 : 1.3;
    if (id === 'f_std') {
      const lo = F.foe ? 0.6 : 0.7;
      const fcs = st.parts.fcs;
      st.parts = {
        ...st.parts,
        fcs: { ...fcs, assist: (fcs.assist || [0.6, 0.6, 0.45]).map((v) => Math.max(v, lo)) },
      };
    }
  },
  // ---------- 開火 ----------
  gearGoldShot(slot, w, d, dist, o, tgt) {
    const t = this.t,
      gs = this.gs;
    gs.shotT = t; // 拔刀：射擊後的第一刀
    // 雙持協調：兩手 0.3 秒內都開火
    const as = this.gG('a_std');
    if (as && /arm$/.test(slot)) {
      (gs.hand = gs.hand || {})[slot] = t;
      const other = slot === 'rarm' ? 'larm' : 'rarm';
      if (t - (gs.hand[other] === undefined ? -9 : gs.hand[other]) < 0.3) o.cd *= as.foe ? 0.92 : 0.85;
    }
    const ah = this.gG('a_hv');
    if (ah && gs.stillT >= 0.3) {
      o.d *= ah.foe ? 1.1 : 1.2;
      o.cd *= ah.foe ? 0.95 : 0.9;
    }
    const lq = this.gG('l_qd');
    if (lq && /back$/.test(slot) && gs.hoverT >= 1) o.cd *= lq.foe ? 0.88 : 0.75;
    const fn = this.gG('f_near');
    if (fn && d.type === 'missile' && dist < 30 * this.dk) o.d *= fn.foe ? 1.12 : 1.25;
    const own = this.gG(d.id);
    if (!own || own.slot !== slot) return;
    switch (d.id) {
      case 'w_rifle': {
        w.gN = (w.gN || 0) + 1;
        if (w.gN % (own.foe ? 8 : 5) === 0) {
          o.d *= own.foe ? 1.15 : 1.3;
          if (!own.foe) o.pierce = true;
        }
        break;
      }
      case 'w_mg':
        // 無盡彈鏈：連續射擊 6 秒過熱（裝填改成過熱的冷卻，gearGoldRld）
        if (w.streak >= 6) {
          w.streak = 0;
          w.reloadT = own.foe ? 3 : 2;
          w.gHeat = true;
          if (this.isPlayer) this.game.flashMsg('MG-18 過熱', 0xff8040, 1.2);
        }
        break;
      case 'w_hg':
        if (tgt && tgt.staggerT > 0) o.cd *= own.foe ? 0.8 : 0.6;
        break;
      case 'w_lr':
        if (gs.lrGlowT > t) o.d *= own.foe ? 1.15 : 1.3;
        break;
      case 'bw_gat':
        w.gN = (w.gN || 0) + 1;
        if (d.spin && w.streak >= d.spin && w.gN % (own.foe ? 40 : 20) === 0) o.d *= 5;
        break;
    }
  },
  gearGoldSpread(dist, slot) {
    const lb = this.gG('l_bp');
    return lb && this.gs.step ? 1 - (lb.foe ? 0.02 : 0.04) * this.gs.step : 1;
  },
  gearGoldSpd() {
    const lb = this.gG('l_bp');
    return lb && this.gs.step ? 1 + (lb.foe ? 0.015 : 0.03) * this.gs.step : 1;
  },
  // ---------- 打中別人 ----------
  gearGoldOut(tgt, dmg, imp, slot, melee, d, own) {
    const t = this.t,
      gs = this.gs,
      g = this.game,
      now = g.time;
    let G;
    if ((G = this.gG('h_std')) && gs.markId === tgt.id) dmg *= G.foe ? 1.1 : 1.2;
    if (
      (G = this.gG('h_lt')) &&
      t - (gs.hurtT === undefined ? -99 : gs.hurtT) >= 10 &&
      t - (gs.preT || -99) >= 10
    ) {
      dmg *= G.foe ? 1.3 : 1.5;
      gs.preT = t;
    }
    if ((G = this.gG('h_scan')) && !G.foe && this.lock === tgt) dmg *= 1.08;
    if ((G = this.gG('c_std')) && !G.foe) dmg *= 1.08;
    if ((G = this.gG('c_nat')) && gs.windReady) {
      const k = G.foe ? 1.2 : 1.4;
      dmg *= k;
      imp *= k;
      gs.windReady = false;
    }
    if ((G = this.gG('f_cqb')) && G.foe && tgt.pos.distanceTo(this.pos) < 20 * this.dk) dmg *= 1.12;
    if ((G = this.gG('f_snipe')) && !melee && this.lkId === tgt.id) {
      if (t - Math.max(this.lkT0 || 0, gs.snipeT || -99) >= 3) {
        dmg *= G.foe ? 1.5 : 2;
        gs.snipeT = t;
        if (!G.foe) g.popDamage(tgt.center(), 'CRITICAL', false, true, false, 0, tgt.id);
      }
    }
    if ((G = this.gG('f_mid')) && !melee) {
      const dist = tgt.pos.distanceTo(this.pos);
      if (dist >= 40 * this.dk && dist <= 90 * this.dk && (gs.midN = (gs.midN || 0) + 1) >= 10) {
        gs.midN = 0;
        if (G.foe) tgt.addStatus && tgt.addStatus('spotted', 3);
        else {
          tgt.gMarkUntil = now + 5;
          tgt.gMarkK = 0.2;
          g.popDamage(tgt.center(), '標定', false, true, false, 0, tgt.id);
        }
      }
    }
    // 電容放電：能量武器累積傷害
    if ((G = this.gG('g_arc')) && isEn(d)) {
      if (gs.arcReady) {
        gs.arcReady = false;
        if (G.foe) tgt.rxJamT = Math.max(tgt.rxJamT || 0, 2);
        else tgt.staggerT = Math.max(tgt.staggerT, tgt.isBoss ? 0.4 : 1);
        if (g.fx.arc) g.fx.arc(tgt.center(), 2, 0x9fe0ff);
      }
      gs.arcAcc = (gs.arcAcc || 0) + dmg;
      if (gs.arcAcc >= (G.foe ? 6000 : 3000)) {
        gs.arcAcc = 0;
        gs.arcReady = true;
      }
    }
    if (melee) {
      const m = this.melee || {};
      if ((G = this.gG('a_ml')) && t - (gs.shotT === undefined ? -9 : gs.shotT) < 2) {
        dmg *= G.foe ? 1.3 : 1.6;
        gs.shotT = -9;
      }
      if ((G = this.gG('b_std')) && gs.abHitT > t) {
        dmg *= G.foe ? 1.15 : 1.3;
        gs.abHitT = 0;
      }
      if ((G = this.gG('bw_sh')) && gs.shAcc > 0) {
        dmg += gs.shAcc;
        gs.shAcc = 0;
        g.fx.shockwave(tgt.center(), 5, 0x80c8ff, 0.4);
      }
      if (own && own.gold) {
        if (d.id === 'w_saber' && gs.giantT > t) {
          const k = own.foe ? 1.12 : 1.25;
          dmg *= k;
          imp *= k;
        }
        if (d.id === 'w_claw' && m.stage === 4 && tgt.staggerT > 0) {
          tgt.gKinVulnUntil = now + 8;
          tgt.gKinVulnK = own.foe ? 0.12 : 0.25;
        }
        if (d.id === 'w_pile' && m.stage === 1 && g.later) {
          const k = own.foe ? 0.3 : 0.6;
          const dd = dmg * k,
            ii = imp * k;
          g.later(0.6, () => {
            if (!tgt.dead && !this.dead) {
              tgt.takeDamage(dd, ii, this, tgt.center(), tgt.center().sub(this.center()).normalize());
              g.fx.flash(tgt.center(), 1.4, 0xffd080, 0.15);
            }
          });
        }
        if (d.id === 'w_blade' && m.stage % 3 === 2) this.gearWave(tgt, dmg * (own.foe ? 0.4 : 0.6));
      }
      return [dmg, imp];
    }
    if (!own || !own.gold || this.gChain) return [dmg, imp];
    const k = own.foe ? 0.5 : 1;
    switch (d.id) {
      case 'w_sg':
        this.gearChain(tgt, dmg * 0.4 * k, imp * 0.4 * k, 1, 12, 0xffc070, 'kin');
        break;
      case 'w_bz':
        if (!(gs.bzT > t)) {
          gs.bzT = t + 0.3;
          this.gearBlasts(tgt.center(), own.foe ? 2 : 4, dmg * 0.2, imp * 0.2, 3);
        }
        break;
      case 'w_gl':
        if (tgt.addStatus && !tgt.isProp)
          tgt.addStatus('stick', 1, { dmg: dmg * 0.4, impact: imp * 0.4, src: this });
        break;
      case 'w_lr':
        if (dmg > d.dmg * 1.6) gs.lrGlowT = t + 3; // 蓄力射擊
        break;
      case 'w_lc':
        if (dmg > d.dmg * 1.6 && !(gs.lcT > t)) {
          gs.lcT = t + 0.3;
          this.gChain = true;
          try {
            g.explodeAt(tgt.center(), dmg * 0.5, imp * 0.5, (own.foe ? 6 : 10) * this.dk, this, false);
          } finally {
            this.gChain = false;
          }
        }
        break;
      case 'w_lsg':
        tgt.rxHotT = Math.max(tgt.rxHotT || 0, own.foe ? 1.5 : 3);
        break;
      case 'w_emp':
        if (tgt.staggerT > 0 && !(gs.empChT > t)) {
          gs.empChT = t + 0.25;
          this.gearChain(tgt, dmg * 0.5, imp * 0.5, own.foe ? 1 : 2, 20, 0x80c8ff, 'en');
        }
        break;
      case 'bw_ms':
        this.gearChain(tgt, dmg * 0.3, imp * 0.3, own.foe ? 1 : 2, 25, 0xffb080, 'exp');
        break;
      case 'bw_pm':
        if (!(gs.pmT > t) && g.addPool) {
          gs.pmT = t + 0.5;
          g.addPool(this, tgt.center(), own.foe ? 2 : 3, own.foe ? 2 : 4, dmg * 0.12, true);
        }
        break;
      case 'bw_gr':
        if (!(gs.grT > t) && g.addPool) {
          gs.grT = t + 1;
          g.addPool(this, tgt.center(), 5, own.foe ? 3 : 6, dmg * 0.06);
        }
        break;
      case 'bw_lc':
        this.gearChain(tgt, dmg * 0.5, imp * 0.5, own.foe ? 1 : 2, 20, 0x9fb8ff, 'en');
        break;
    }
    return [dmg, imp];
  },
  // 子彈藥：在 c 附近 n 個小爆炸
  gearBlasts(c, n, dmg, imp, r) {
    const g = this.game;
    this.gChain = true;
    try {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random();
        const p = c.clone().add(new THREE.Vector3(Math.cos(a) * r * this.dk, 0, Math.sin(a) * r * this.dk));
        g.explodeAt(p, dmg, imp, 4 * this.dk, this, false);
      }
    } finally {
      this.gChain = false;
    }
  },
  // 斬擊波：前方 30 m 的敵人（打中的那一個除外）
  gearWave(tgt, dmg) {
    const g = this.game;
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const c = this.center();
    if (g.fx.streaks) g.fx.streaks(c, 3, 0xff80c0, 30, 0.3, 30);
    this.gChain = true;
    try {
      for (const h of g.hostilesOfEnt(this)) {
        if (h === tgt || h.dead || h.isProp || !h.center) continue;
        const v = h.center().sub(c);
        const dist = v.length();
        if (dist > 30 * this.dk || v.setY(0).normalize().dot(fwd) < 0.7) continue;
        h.takeDamage(dmg, 0, this, h.center(), fwd.clone(), undefined, undefined, 'en');
      }
    } finally {
      this.gChain = false;
    }
  },
  // ---------- 被打 ----------
  gearGoldIn(from, k, ki, attr, dmg) {
    const t = this.t,
      gs = this.gs,
      g = this.game;
    gs.hurtT = t;
    let G;
    if ((G = this.gG('c_lt')) && t - (this.qbStartT === undefined ? -9 : this.qbStartT) < 0.6)
      k *= G.foe ? 0.75 : 0.5;
    if ((G = this.gG('l_bp2')) && !(gs.evT > t)) {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      if (sp > (this.stats.speed || 1) * 0.8 && Math.random() < (G.foe ? 0.12 : 0.25)) {
        gs.evT = t + 3;
        g.popDamage(this.center(), 'MISS', this.isPlayer, false, false, 0, this.id);
        return [0, 0];
      }
    }
    // 過剩轉換的護盾
    if (gs.gshield > 0 && dmg > 0) {
      const a = Math.min(gs.gshield, dmg * k);
      gs.gshield -= a;
      k *= 1 - a / (dmg * k || 1);
    }
    // 蓄能盾：脈衝盾擋下的傷害累積
    if ((G = this.gG('bw_sh')) && this.shield > 0 && dmg > 0)
      gs.shAcc = Math.min(G.foe ? 1000 : 3000, (gs.shAcc || 0) + dmg * k * this.shield);
    return [k, ki];
  },
  // 反射偏向（偏向場擋下的那一擊）
  gearGoldReflect(from, dmg) {
    const G = this.gG('c_aeg');
    if (!G || !from || !from.takeDamage || from.dead || this.gChain || !(dmg > 0)) return;
    this.gChain = true;
    try {
      from.takeDamage(
        dmg * (G.foe ? 0.5 : 1),
        0,
        this,
        from.center(),
        from.center().sub(this.center()).normalize(),
        undefined,
        undefined,
        'en',
      );
      if (this.game.fx.bolt) this.game.fx.bolt(this.center(), from.center(), 0x80c8ff);
    } finally {
      this.gChain = false;
    }
  },
  // 最後防線（takeDamage：AP 歸零之前）
  gearCheatDeath() {
    const G = this.gG('c_hv');
    if (!G || this.gs.lsUsed) return false;
    this.gs.lsUsed = true;
    this.hp = Math.max(1, Math.round(this.maxHp * (G.foe ? 0.1 : 0.25)));
    this.iFrames = Math.max(this.iFrames, G.foe ? 1 : 3);
    this.game.popDamage(this.center(), 'LAST STAND', this.isPlayer, true, false, 0, this.id);
    this.game.fx.shockwave(this.center(), 6, 0xffd060, 0.5);
    return true;
  },
  // ---------- 其他掛勾 ----------
  gearGoldQb() {
    const G = this.gG('b_eff');
    return G && !this.grounded && !(this.gs.glideT > this.t) ? 0 : 1;
  },
  gearGoldRld(slot) {
    const t = this.t,
      gs = this.gs;
    let k = 1,
      G;
    if ((G = this.gG('l_qd')) && /back$/.test(slot) && gs.hoverT >= 1) k *= G.foe ? 0.88 : 0.75;
    const w = this.weapons[slot];
    // 無盡彈鏈：彈匣打完不用裝填（過熱時照過熱的冷卻）
    if ((G = this.gG('w_mg')) && G.slot === slot && w && w.def.id === 'w_mg' && !w.gHeat) k *= 0.02;
    if (w) w.gHeat = false;
    // 彈匣交換：這隻手開始裝填時，另一隻手立刻裝填完成
    if ((G = this.gG('a_lt')) && /arm$/.test(slot) && !(gs.swapT > t)) {
      const o = this.weapons[slot === 'rarm' ? 'larm' : 'rarm'];
      if (o && o.reloadT > 0.05) {
        o.reloadT = 0.01;
        gs.swapT = t + (G.foe ? 12 : 6);
      }
    }
    return k;
  },
  gearGoldLock(d) {
    return this.gG('f_far') && !this.gG('f_far').foe ? 1 / 0.7 : 1;
  },
  gearGoldMissileN(d) {
    const G = this.gG('bw_ms8');
    return G && d && d.id === 'bw_ms8' ? (G.foe ? 2 : 4) : 0;
  },
  gearGoldEv(k, o) {
    const t = this.t,
      gs = this.gs,
      g = this.game;
    let G;
    if (k === 'qb') {
      if ((G = this.gG('c_nat'))) {
        gs.qbHist = (gs.qbHist || []).filter((x) => t - x < 3);
        gs.qbHist.push(t);
        if (gs.qbHist.length >= 3) {
          gs.windReady = true;
          gs.qbHist = [];
        }
      }
      if ((G = this.gG('b_hi')) && !(gs.boomT > t)) {
        gs.boomT = t + 2;
        const R = (G.foe ? 5 : 8) * this.dk;
        const c = this.center();
        g.fx.shockwave(c, R / this.dk, 0xbfe8ff, 0.3);
        for (const h of g.hostilesOfEnt(this))
          if (!h.dead && !h.isProp && h.center && h.center().distanceTo(c) < R)
            h.takeDamage(
              40,
              500,
              this,
              h.center(),
              h.center().sub(c).normalize(),
              undefined,
              undefined,
              'kin',
            );
      }
      if ((G = this.gG('b_eff')) && !this.grounded) gs.glideT = t + (G.foe ? 3 : 1.5);
    }
    if (k === 'land' && (G = this.gG('l_rj'))) {
      const h = gs.peak || 0;
      gs.peak = 0;
      if (h >= 10 * this.dk) {
        const s = Math.min(3, h / (10 * this.dk));
        const half = G.foe ? 0.5 : 1;
        this.gChain = true;
        try {
          g.explodeAt(this.center(), 260 * s * half, 900 * half, 9 * this.dk * half, this, false);
        } finally {
          this.gChain = false;
        }
      }
    }
    if (
      (k === 'pqb' || k === 'stag') &&
      (G = this.gG('g_fast')) &&
      !(G.foe && k === 'pqb') &&
      !(gs.fastEnT > t)
    ) {
      gs.fastEnT = t + (G.foe ? 16 : 8);
      this.en = this.enMax;
    }
    if ((k === 'stag' || k === 'exec') && (G = this.gG('w_saber'))) gs.giantT = t + (G.foe ? 5 : 8);
  },
  gearGoldEmpHit(tgt) {
    const G = this.gG('bw_emp_l');
    if (!G) return;
    const now = this.game.time;
    tgt.gEnVulnUntil = Math.max(tgt.gEnVulnUntil || 0, now + 10);
    tgt.gEnVulnK = Math.max(tgt.gEnVulnK || 0, G.foe ? 0.12 : 0.25);
  },
  gearGoldEmp() {
    const G = this.gG('bw_emp_s');
    if (G) this.gs.layerT = this.t + (G.foe ? 3 : 4);
  },
  // 緊急電源（EN 用完；回傳 true＝用掉了，穩定輸出不再觸發）
  gearGoldEnOut() {
    const G = this.gG('g_std');
    if (!G || this.gs.eoT > this.t) return false;
    this.gs.eoT = this.t + (G.foe ? 40 : 20);
    this.en = this.enMax * (G.foe ? 0.25 : 0.5);
    this.enDelay = 0;
    return true;
  },
  gearGoldTick(dt) {
    const t = this.t,
      gs = this.gs,
      g = this.game;
    let G;
    // 失衡開始的那一格：不動視線、履帶碾壓縮短失衡；不倒放出衝擊波
    const stag = this.staggerT > 0;
    if (stag && !gs.gst0) {
      let k = 1;
      if ((G = this.gG('h_hv'))) k *= G.foe ? 0.85 : 0.7;
      if ((G = this.gG('l_tk'))) k *= G.foe ? 0.75 : 0.5;
      this.staggerT *= k;
      if ((G = this.gG('l_hv')) && !(gs.standT > t)) {
        gs.standT = t + (G.foe ? 30 : 15);
        const c = this.center();
        g.fx.shockwave(c, 12, 0xffd080, 0.45);
        for (const h of g.hostilesOfEnt(this))
          if (!h.dead && !h.isProp && h.center && h.center().distanceTo(c) < 12 * this.dk) {
            const dir = h.center().sub(c).setY(0).normalize();
            h.takeDamage(80, 700, this, h.center(), dir, undefined, undefined, 'kin');
            if (h.vel) h.vel.addScaledVector(dir, 20 * this.dk);
          }
      }
    }
    gs.gst0 = stag;
    // 戰況判讀：每 10 秒標記 AP 最低的敵人
    if (this.gG('h_std') && !(gs.markT > t)) {
      gs.markT = t + 10;
      let best = null;
      for (const h of g.hostilesOfEnt(this))
        if (!h.dead && !h.isProp && h.maxHp && h.center && h.pos.distanceTo(this.pos) < 200 * this.dk)
          if (!best || h.hp / h.maxHp < best.hp / best.maxHp) best = h;
      gs.markId = best ? best.id : null;
      if (best && this.isPlayer) g.popDamage(best.center(), '標記', false, true, false, 0, best.id);
    }
    // 指揮核心：附近的友軍得到指揮強化
    if ((G = this.gG('c_std')) && !(gs.cmdT > t)) {
      gs.cmdT = t + 0.25;
      const R = (G.foe ? 30 : 40) * this.dk;
      const list = this.team === 'player' ? [...(g.allies || []), ...(g.players || [])] : g.enemies || [];
      for (const a of list) if (a && a !== this && !a.dead && a.pos.distanceTo(this.pos) < R) a.buffT = 0.35;
    }
    // 戰場步伐：在地面移動每 2 秒疊一層
    if (this.gG('l_bp')) {
      if (!this.grounded || stag) {
        gs.step = 0;
        gs.stepT = 0;
      } else if (gs.moveT > 0) {
        gs.stepT = (gs.stepT || 0) + dt;
        if (gs.stepT >= 2) {
          gs.stepT = 0;
          gs.step = Math.min(5, (gs.step || 0) + 1);
        }
      }
    }
    // 空中砲座
    if (this.gG('l_qd')) gs.hoverT = this.hoverMode ? (gs.hoverT || 0) + dt : 0;
    // 落雷：記下空中的最高點
    if (this.gG('l_rj')) gs.peak = this.grounded ? 0 : Math.max(gs.peak || 0, this.gearAlt());
    // 履帶碾壓：高速撞到敵人
    if (
      (G = this.gG('l_tk')) &&
      !G.foe &&
      Math.hypot(this.vel.x, this.vel.z) > (this.stats.speed || 1) * 0.6
    ) {
      gs.ram = gs.ram || {};
      for (const h of g.hostilesOfEnt(this)) {
        if (h.dead || h.isProp || !h.pos || (gs.ram[h.id] || 0) > t) continue;
        if (h.pos.distanceTo(this.pos) < (this.radius || 2) + (h.radius || 2) + 1 * this.dk) {
          gs.ram[h.id] = t + 1;
          h.takeDamage(
            150,
            600,
            this,
            h.center(),
            h.center().sub(this.center()).setY(0).normalize(),
            undefined,
            undefined,
            'kin',
          );
        }
      }
    }
    // 突擊連接：突擊推進撞到目標
    if ((G = this.gG('b_std')) && this.abT > 0 && this.lock && !this.lock.dead && !(gs.abT > t)) {
      const h = this.lock;
      if (h.pos.distanceTo(this.pos) < (this.radius || 2) + (h.radius || 2) + 2 * this.dk) {
        gs.abT = t + 2;
        gs.abHitT = t + 1.5;
        h.takeDamage(
          120,
          G.foe ? 400 : 700,
          this,
          h.center(),
          h.center().sub(this.center()).normalize(),
          undefined,
          undefined,
          'kin',
        );
      }
    }
    // 過剩轉換：EN 滿時溢出的回復轉成護盾
    if ((G = this.gG('g_hi')) && this.en >= this.enMax - 1) {
      const cap = this.maxHp * (G.foe ? 0.05 : 0.1);
      gs.gshield = Math.min(cap, (gs.gshield || 0) + this.stats.parts.generator.recharge * dt * 0.5);
    }
    // 脈衝護層：打掉 20 m 內的敵方導彈
    if (gs.layerT > t && g.projectiles) {
      const R = 20 * this.dk;
      for (const pr of g.projectiles) {
        if (pr.dead || pr.visual || pr.kind !== 'missile' || !pr.owner || pr.owner.team === this.team)
          continue;
        if (pr.pos.distanceTo(this.pos) > R) continue;
        pr.dead = true;
        g.scene.remove(pr.mesh);
        if (pr.netId) g.netEv({ t: 'pend', i: pr.netId });
        g.fx.flash(pr.pos, 1.2, 0x80c8ff, 0.15);
      }
    }
  },
});
