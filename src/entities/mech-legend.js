// ---------- MechEntity 擴充：傳說模組與 lg* 行為模組（data/modules.js、docs/gear-rarity-design.md 第 8 節） ----------
// 2026-11-10 改版：傳說模組改規則、不加數值（效果以自己這一擊為基礎，放大裝備），任何區段都能用、只有單人；
// 從傳說降成一般模組的 lg*（補給回收、能源導管、補給專家、增援壁壘…）以 pmv 的值（LV_MUL）當等級倍率 x。
// 都由持有者的加成表（pmv）決定，只有主線的玩家機體會有；判定只在房主／單機，外觀用會轉送給客機的 fx。
// 機體端的掛勾：fire 的傷害（lgShotK）、能量武器與 QB 的 EN（lgEnK、lgQbK）、受傷（lgDefense、lgBufTake）、
// 擊破（lgKill）、事件（lgEv：tutE 的 stag／pqb／rx…）、每格（lgTick）、撿到彈藥箱（lgPickup）、地圖裝置（lgDevUse）、
// 修復套件（lgKit）、補給箱（lgCacheOpen）、增援抵達（lgWaveShield）。
// Game 端（game/tactics.js）：lgAny／lgMax、停滯力場的 lgFieldK、敵人的投射物 lgHostileShot。
import { DS } from '../core/scale.js';
import { weaponAttr } from '../data/attrs.js';
import { usesAmmo } from '../data/parts.js';
import { RX } from '../data/react.js';
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
  XFER_K: 1.5, // 衝擊傳導
  XFER_N: 2,
  XFER_R: 15 * DS,
  BAR_N: 10, // 火力支援：層數
  BAR_BOSS: 0.04, // 對 Boss 造成 AP 4% 的傷害＝1 層
  BAR_K: 1.5, // 每發＝最高單發 ×1.5
  BAR_SHOTS: 6,
  SUP_GAP: 0.45, // 火力封鎖：兩次命中的間隔在這之內算持續
  SUP_T: 1.5,
  SUP_HOLD: 1.0,
  FLANK_T: 0.4, // 繞背
  FLANK_CD: 4,
  FLANK_MAX: 60 * DS,
  FLANK_SIDE: 0.5, // 繞到正後方偏一側（弧度）
  ZERO_T: 2, // 零式加速
  ZERO_CD: 8,
  ZERO_K: 0.35,
  ZERO_R: 30 * DS,
  DECOY_T: 2, // 殘影誘餌
  DECOY_CD: 5,
  DECOY_R: 60 * DS,
  RXS_R: 12 * DS, // 反應擴散
  LINK_T: 6, // 量子鏈結
  LINK_K: 0.3,
  BITS_K: 0.25, // 浮游砲「回聲」：每座每發＝那一發的 25%
  BITS_CD: 0.2,
  BITS_DOWN: 10,
  OVER_CD: 6, // 過載脈衝
  OVER_R: 12 * DS,
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
  // QB 的 EN 消耗倍率（能源導管中＝0）
  lgQbK() {
    return this.lgConduitT > 0 ? 0 : 1;
  },
  lgLand() {},
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
  lgEv(k, o) {
    if (k === 'stag') {
      if (this.lg('lgBuffer')) this.lgDebtClear();
      if (this.lg('lgTransfer') && o && o.tgt) this.lgTransfer(o.tgt, o.over);
    }
    if (k === 'pqb' && this.lg('lgZero') && !(this.lgZeroCd > 0)) this.lgZeroOn();
  },
  // 擊破（tactics.js 的 modKillFx）
  lgKill() {
    if (this.lg('lgBuffer')) this.lgDebtClear();
    if (this.lg('lgBarrage')) this.lgBarAdd(1);
  },
  // ================= 第 2 期：卡斯特隆、維爾威 =================
  // 打到敵人（takeDamage，扣 AP 之前）：火力支援（Boss 的傷害累積層數）、火力封鎖（持續命中）
  lgDealt(t, real) {
    if (!t || t.team === this.team || t.isProp) return;
    if (this.lg('lgBarrage') && t.isBoss) {
      this.lgBossAcc = (this.lgBossAcc || 0) + real / Math.max(1, t.maxHp);
      while (this.lgBossAcc >= LG.BAR_BOSS - 1e-9) {
        this.lgBossAcc -= LG.BAR_BOSS;
        this.lgBarAdd(1);
      }
    }
    if (this.lg('lgSuppress') && !t.isBoss) {
      // 兩次命中的間隔在 SUP_GAP 內＝持續命中；累積 SUP_T 秒後封鎖，持續命中一直延長
      const now = t.t;
      const gap = now - t.lgSupLast;
      if (t.lgSupBy === this.id && gap >= 0 && gap <= LG.SUP_GAP) t.lgSupAcc += gap;
      else t.lgSupAcc = 0;
      t.lgSupBy = this.id;
      t.lgSupLast = now;
      if (t.lgSupAcc >= LG.SUP_T) {
        if (!(t.lgSupUntil > now)) this.game.fx.ring(t.center(), 3, 0xffb040);
        t.lgSupUntil = now + LG.SUP_HOLD;
      }
    }
  },
  // 火力支援：層數，滿了對鎖定目標砲擊
  lgBarAdd(n) {
    this.lgBar = Math.min(LG.BAR_N, (this.lgBar || 0) + n);
  },
  // 目前最高的單發傷害（武器定義已含駕駛員與零件品級的加成）
  lgTopShot() {
    let v = 0;
    for (const w of Object.values(this.weapons || {})) {
      const d = w && w.def;
      if (!d || d.type === 'none' || d.type === 'shield') continue;
      v = Math.max(v, (d.dmg || 0) * (d.pellets || 1), d.chargeDmg || 0);
    }
    return Math.max(300, v) * this.dmgMul;
  },
  lgBarrageFire(tgt) {
    const g = this.game;
    this.lgBar = 0;
    const dmg = this.lgTopShot() * LG.BAR_K;
    const R = 4 * DS;
    g.fx.warnCircle(tgt.pos.clone(), R * 2.2, 1.0, 0xffb040);
    if (this.isPlayer) g.flashMsg('火力支援：砲擊', 0xffb040, 1.4);
    for (let i = 0; i < LG.BAR_SHOTS; i++)
      g.later(1.0 + i * 0.18, () => {
        if (this.dead) return;
        const c = tgt.dead ? null : tgt.pos;
        const base = c || this.lgBarLast || this.pos;
        this.lgBarLast = base.clone();
        const a = Math.random() * Math.PI * 2,
          r = Math.random() * R * 1.2;
        const p = base.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
        p.y = g.world.groundAt(p.x, p.z, p.y + 4 * DS) + 0.5;
        g.explodeAt(p, dmg, 900, R, this, false);
      });
  },
  // 衝擊傳導：打出失衡的那一擊，超過門檻的衝擊 ×150% 傳給附近 2 台（Boss 傳給它的部位）
  lgTransfer(tgt, over) {
    if (!(over > 0) || this.lgXfer) return;
    const g = this.game;
    const c = tgt.center();
    let list;
    if (tgt.isBoss) list = g.enemies.filter((e) => !e.dead && e.opts && e.opts.parent === tgt.id);
    else
      list = g
        .hostilesOfEnt(this)
        .filter(
          (e) =>
            e !== tgt &&
            !e.dead &&
            !e.isProp &&
            !(e.staggerT > 0) &&
            e.pos.distanceTo(tgt.pos) < LG.XFER_R &&
            !(e.opts && e.opts.parent !== undefined),
        )
        .sort((a, b) => a.pos.distanceTo(tgt.pos) - b.pos.distanceTo(tgt.pos));
    list = list.slice(0, LG.XFER_N);
    if (!list.length) return;
    this.lgXfer = true;
    try {
      for (const e of list) {
        g.fx.bolt(c, e.center(), 0xffb040, 0.25);
        e.iFrames = 0;
        e.takeDamage(1, over * LG.XFER_K, this, e.center(), null, null, null, 'none');
      }
    } finally {
      this.lgXfer = false;
    }
  },
  // QB 開始（move，方向決定之後）：繞背、殘影誘餌
  lgQbStart(tgt) {
    this.lgQbAt = this.t;
    if (this.lg('lgDecoy') && !(this.lgDecoyCd > 0)) this.lgDecoyMake();
    if (!this.lg('lgFlank') || !(this.lgFlankCd <= 0 || this.lgFlankCd === undefined)) return;
    if (!tgt || tgt.dead || this.qbDir.lengthSq() < 0.5) return;
    const dx = this.pos.x - tgt.pos.x,
      dz = this.pos.z - tgt.pos.z;
    const R = Math.hypot(dx, dz);
    if (R < 4 * DS || R > LG.FLANK_MAX) return;
    // 往左右：QB 方向和「往目標」夾角大
    const tx = -dx / R,
      tz = -dz / R;
    if (Math.abs(this.qbDir.x * tx + this.qbDir.z * tz) > 0.55) return;
    const a0 = Math.atan2(dx, dz);
    // 角度往正方向增加時的切線＝(cos a, −sin a)；QB 往哪一邊就往哪一邊繞
    const sgn = Math.sign(this.qbDir.x * Math.cos(a0) - this.qbDir.z * Math.sin(a0)) || 1;
    const back = tgt.yaw !== undefined ? tgt.yaw : a0 + Math.PI; // 目標的背後（正面是 −sin、−cos）
    if (Math.abs(Math.atan2(Math.sin(a0 - back), Math.cos(a0 - back))) < 0.6) return; // 已經在背後
    const goal = back - sgn * LG.FLANK_SIDE; // 從 QB 的方向先到的那一側
    const T = Math.PI * 2;
    let d = sgn > 0 ? (((goal - a0) % T) + T) % T : -((((a0 - goal) % T) + T) % T);
    if (Math.abs(d) > Math.PI) d = sgn * Math.PI; // 最多繞半圈
    this.lgArc = { tgt, a0, d, R: Math.max(8 * DS, Math.min(R, 30 * DS)), t: 0 };
    this.qbT = LG.FLANK_T;
    this.lgFlankCd = LG.FLANK_CD;
    this.iFrames = Math.max(this.iFrames, LG.FLANK_T * 0.8);
  },
  // 繞背：QB 的目標速度改成沿圓弧前進（move 的 qbT 那一段）
  lgArcSteer(target, dt) {
    const A = this.lgArc;
    if (!A || A.tgt.dead || this.qbT <= 0) {
      this.lgArc = null;
      return;
    }
    A.t += dt;
    const u = Math.min(1, (A.t + dt) / LG.FLANK_T);
    const a = A.a0 + A.d * u;
    const px = A.tgt.pos.x + Math.sin(a) * A.R,
      pz = A.tgt.pos.z + Math.cos(a) * A.R;
    const vx = (px - this.pos.x) / Math.max(dt, 1 / 30),
      vz = (pz - this.pos.z) / Math.max(dt, 1 / 30);
    const cap = 220 * DS;
    const k = Math.min(1, cap / Math.max(1, Math.hypot(vx, vz)));
    target.x = vx * k;
    target.z = vz * k;
    if (u >= 1) this.lgArc = null;
  },
  // 殘影誘餌：QB 的起點留下殘影，附近一般敵人 50% 改打殘影
  lgDecoyMake() {
    const g = this.game;
    this.lgDecoyCd = LG.DECOY_CD;
    const id = (this.lgDecoySeq = (this.lgDecoySeq || 0) + 1);
    this.lgDecoy = { id, pos: this.center(), t: LG.DECOY_T, ringT: 0 };
    if (this.model && g.fx.ghosts) g.fx.ghosts.snap(this.model.group, 0x9fe8ff);
    for (const e of g.hostilesOfEnt(this))
      if (!e.dead && !e.isBoss && !e.isProp && e.pos.distanceTo(this.pos) < LG.DECOY_R && Math.random() < 0.5)
        e.lgFooled = id;
  },
  // 零式加速：完美 QB 之後周圍的敵人與子彈變慢（Game.lgZero；只有單人）
  lgZeroOn() {
    const g = this.game;
    this.lgZeroCd = LG.ZERO_CD;
    g.lgZero = { owner: this, t: LG.ZERO_T };
    g.fx.shockwave(this.center(), 10, 0x9fe8ff, 0.5);
    if (this.isPlayer) g.flashMsg('零式加速', 0x9fe8ff, 1.2);
  },
  // 蹬牆：空中、身邊有牆或大型物件 → 空中跳次數回滿、往牆的反方向蹬出去（jumpMove）
  lgWallKick(J) {
    if (!this.lg('lgWall')) return false;
    const W = this.game.world;
    const c = this.center();
    const r = (this.radius || 1.5 * this.dk) + 1.2 * this.dk;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dx = Math.sin(a),
        dz = Math.cos(a);
      const p = new THREE.Vector3(c.x + dx * r, c.y, c.z + dz * r);
      if (!W.hitsWorld(p)) continue;
      this.airJumps = J.air;
      const spd = 30 * this.dk;
      this.vel.x = -dx * spd;
      this.vel.z = -dz * spd;
      this.game.fx.ring(p, 2.5, 0x9fe8ff);
      if (this.isPlayer) this.game.flashMsg('蹬牆', 0x9fe8ff, 0.6);
      return true;
    }
    return false;
  },
  // ================= 第 3 期：艾瑟立克 =================
  // 觸發屬性反應之後（mech-react.js 的 rxFire）：反應擴散、量子鏈結
  lgRxFire(r, tgt) {
    const g = this.game;
    if (this.lg('lgLink')) this.lgLinkAdd(tgt);
    if (!this.lg('lgRxSpread')) return;
    const c = tgt.center();
    for (const e of g.hostilesOfEnt(this)) {
      if (e === tgt || e.dead || e.isProp || !e.pos || e.pos.distanceTo(tgt.pos) > LG.RXS_R) continue;
      g.fx.bolt(c, e.center(), parseInt(r.color.slice(1), 16), 0.25);
      e.rxFire(r, this, true);
      if (this.lg('lgLink')) this.lgLinkAdd(e);
    }
  },
  // 量子鏈結：被反應打中的敵人鏈結 6 秒（Boss 本體與部位一起）
  lgLinkAdd(e) {
    const g = this.game;
    let list = [e];
    const bossId = e.isBoss ? e.id : e.opts && e.opts.parent !== undefined ? e.opts.parent : null;
    if (bossId !== null)
      list = g.enemies.filter((x) => !x.dead && (x.id === bossId || (x.opts && x.opts.parent === bossId)));
    for (const x of list) {
      x.lgLinkOwner = this;
      x.lgLinkUntil = x.t + LG.LINK_T;
    }
  },
  // 量子鏈結：鏈結中的敵人受到的傷害 30% 分給其他鏈結中的敵人（takeDamage，扣 AP 之後）
  lgLinkShare(src, real) {
    const g = this.game;
    const others = g.enemies.filter(
      (e) => e !== src && !e.dead && e.lgLinkOwner === this && e.lgLinkUntil > e.t,
    );
    if (!others.length) return;
    const c = src.center();
    const show = !(src.lgLinkFxT > src.t);
    if (show) src.lgLinkFxT = src.t + 0.25;
    for (const e of others) {
      if (show) g.fx.bolt(c, e.center(), 0xb890ff, 0.18);
      e.lgLinkNo = true;
      e.iFrames = 0;
      try {
        e.takeDamage(real * LG.LINK_K, 0, this, e.center(), null, null, null, 'none');
      } finally {
        e.lgLinkNo = false;
      }
    }
  },
  // 開火（fire，擊發之前）：浮游砲跟著能量武器開火
  lgFired(d, tgt) {
    if (!this.lg('lgBits') || !tgt || tgt.dead || !tgt.center || weaponAttr(d) !== 'en') return;
    if (!this.lgBits || this.lgBitsDown > 0 || this.lgBitsCd > 0) return;
    const g = this.game;
    this.lgBitsCd = LG.BITS_CD;
    const dmg = ((d.dmg || 0) * (d.pellets || 1) || (d.chargeDmg || 0) * 0.5) * this.dmgMul * LG.BITS_K;
    if (!(dmg > 0)) return;
    const tc = tgt.center();
    for (const b of this.lgBits) {
      const p = b.position.clone();
      g.fx.beam(p, tc.clone(), 0xb8a0ff, 0.08, this.team);
      tgt.iFrames = 0;
      tgt.takeDamage(dmg, (d.impact || 0) * LG.BITS_K, this, tc, null, null, null, 'en');
      if (tgt.dead) break;
    }
  },
  // 浮游砲的模型與位置（繞著機體轉；被 EMP 打中掉下來 10 秒）
  lgBitsTick(dt) {
    const g = this.game;
    if (!this.lgBits) {
      this.lgBits = [0, 1].map(() => {
        const m = new THREE.Mesh(
          g.fx.sharedGeo('lgBit', () => new THREE.OctahedronGeometry(0.45 * DS)),
          new THREE.MeshBasicMaterial({ color: 0xc8b0ff }),
        );
        g.scene.add(m);
        return m;
      });
      this.lgBitsA = 0;
    }
    if (this.lgBitsCd > 0) this.lgBitsCd -= dt;
    const emp = this.empLockT > 0 || this.rxJamT > 0;
    if (emp && !(this.lgBitsDown > 0)) {
      this.lgBitsDown = LG.BITS_DOWN;
      if (this.isPlayer) g.flashMsg('浮游砲被 EMP 打下來了（10 秒）', 0x8a97a6, 1.4);
    }
    if (this.lgBitsDown > 0) this.lgBitsDown -= dt;
    this.lgBitsA += dt * 1.6;
    const c = this.center();
    this.lgBits.forEach((m, i) => {
      const a = this.lgBitsA + i * Math.PI;
      m.visible = !(this.lgBitsDown > 0) && !this.dead;
      m.position.set(
        c.x + Math.sin(a) * 3 * DS,
        c.y + 1.4 * DS + Math.sin(a * 2) * 0.3 * DS,
        c.z + Math.cos(a) * 3 * DS,
      );
      m.rotation.y = a * 2;
    });
  },
  lgBitsClear() {
    if (!this.lgBits) return;
    for (const m of this.lgBits) this.game.scene.remove(m);
    this.lgBits = null;
  },
  // EN 用完（useEn）：過載脈衝
  lgEnCheck() {
    if (!this.lg('lgOverload') || this.en > this.enMax * 0.02 || this.lgOverCd > 0) return;
    const g = this.game;
    this.lgOverCd = LG.OVER_CD;
    let top = 0;
    for (const w of Object.values(this.weapons || {})) {
      const d = w && w.def;
      if (d && weaponAttr(d) === 'en') top = Math.max(top, (d.dmg || 0) * (d.pellets || 1), d.chargeDmg || 0);
    }
    const dmg = (top > 0 ? top : this.lgTopShot() * 0.5) * this.dmgMul;
    const c = this.center();
    g.fx.shockwave(c, LG.OVER_R / DS, 0x7fc8ff, 0.45);
    if (this.isPlayer) g.flashMsg('過載脈衝', 0x7fc8ff, 1);
    for (const e of g.hostilesOfEnt(this)) {
      if (e.dead || e.isProp || !e.pos || e.pos.distanceTo(this.pos) > LG.OVER_R) continue;
      e.rxJamT = Math.max(e.rxJamT || 0, RX.JAM_T * (e.isBoss ? RX.BOSS : 1));
      e.iFrames = 0;
      e.takeDamage(dmg, 300, this, e.center(), null, null, null, 'en');
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
    // 計時：繞背、零式加速、殘影誘餌、過載脈衝；浮游砲
    if (this.lgOverCd > 0) this.lgOverCd -= dt;
    if (this.lg('lgBits')) this.lgBitsTick(dt);
    if (this.lgFlankCd > 0) this.lgFlankCd -= dt;
    if (this.lgZeroCd > 0) this.lgZeroCd -= dt;
    if (this.lgDecoyCd > 0) this.lgDecoyCd -= dt;
    if (g.lgZero && g.lgZero.owner === this && (g.lgZero.t -= dt) <= 0) g.lgZero = null;
    if (this.lgDecoy) {
      const D = this.lgDecoy;
      D.t -= dt;
      D.ringT -= dt;
      if (D.ringT <= 0 && D.t > 0) {
        D.ringT = 0.5;
        g.fx.ring(D.pos, 3, 0x9fe8ff);
      }
      if (D.t <= 0) this.lgDecoy = null;
    }
    // 火力支援：滿層時對鎖定目標砲擊（沒有目標時留著）
    if (this.lgBar >= LG.BAR_N) {
      const t = this.lock;
      if (t && !t.dead && !t.isProp) this.lgBarrageFire(t);
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
