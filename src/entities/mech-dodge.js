// MechEntity 擴充：敵人與 Boss 的閃避（docs/enemy-dodge-design.md）。
// 只在房主／單機：move() 開頭的 dgMove 看威脅（投射物、導彈、蓄力、雷射、近戰）→ 擲機率 → 反應時間（推進器的預兆）
// → 閃避（側閃、後撤、跳躍）→ 破綻（wpOpen＝CRITICAL、快照的 aw 32）。閃開的子彈失去彈道修正、導彈失去追蹤。
// 客機看快照的 QB 狀態與 aw；「閃避」字是房主的 popDamage（會轉送）。
import { clamp, rnd } from '../core/math.js';
import { DG, DG_ANIM, DG_CLASS } from '../data/dodge.js';
import { PW } from '../data/charge.js';
import { MechEntity } from './mech-entity.js';
import { hexShieldHit, hexShieldMat } from '../render/hex-shield.js';

const _r = new THREE.Vector3(),
  _c = new THREE.Vector3(),
  _d = new THREE.Vector3();
const SLOTS = ['rarm', 'larm', 'rback', 'lback'];
const HUMAN_EV = new Set(['cart', 'slide', 'bflip', 'aflip']); // 人形的動作（animateMech 的 st.evade）
let _shGeo = null;
const SHIELD_GEO = () => _shGeo || (_shGeo = new THREE.SphereGeometry(1, 28, 18));
const SHOT_KINDS = new Set(['bullet', 'shell', 'grenade', 'missile', 'rocket', 'pellet', 'shotgun']);

function pickKind(kinds, allow) {
  let sum = 0;
  for (const k in kinds) if (allow(k)) sum += kinds[k];
  let r = Math.random() * sum;
  for (const k in kinds) {
    if (!allow(k)) continue;
    r -= kinds[k];
    if (r <= 0) return k;
  }
  return 'side';
}

Object.assign(MechEntity.prototype, {
  // 這台用哪一種閃避（null＝這一期還沒有：載具、專屬敵人、Boss、機獸…之後的期數）
  dgClass() {
    if (this.dgCls === undefined) this.dgCls = this.dgClass0();
    return this.dgCls;
  },
  dgClass0() {
    const m = this.model,
      ai = this.ai || '';
    if (this.team !== 'enemy' || this.isBoss || this.themeFoe || this.decoy || this.isProp || !m) return null;
    if (/^(part|objective|convoy|colossus|holo|sub)$/.test(ai)) return null;
    const mk = this.opts.modelKind;
    if (mk === 'vehicle') return 'veh'; // 裝甲車
    if (mk === 'heli') return 'heli'; // 武裝直升機、運輸機
    if (mk === 'drone') return 'drone'; // 導彈無人機、布雷、修理
    if (mk || !m.type) return null; // 專屬敵人、Boss 的程式模型（之後的期數）
    if (ai === 'turret' || ai === 'dome') return 'fixed'; // 固定砲台、護盾產生器：架起護盾
    if (this.ace || this.isElite || /^(ac|duelist|rain|sniper|bastion)$/.test(ai)) return 'ace';
    if (m.type === 'tank') return 'heavy';
    if (this.flying) return 'fly';
    if (m.type === 'quad') return 'quad';
    return 'mt';
  },
  // 這一台現在要不要算閃避（房主／單機的電腦敵人）
  dgOn() {
    const g = this.game;
    if (
      this.remote ||
      this.pilotEnt() ||
      this.air ||
      this.cine ||
      this.rangeTgt ||
      this.tutD ||
      g.lab ||
      g.pvp
    )
      return false;
    if (g.net && g.net.role === 'client') return false;
    return !!this.dgClass();
  },
  dgSetK() {
    const g = this.game;
    const v = (g.ctrl && g.ctrl.dodge) || 'std';
    return DG.SET[v] !== undefined ? DG.SET[v] : 1;
  },
  // move() 開頭：回傳 [wish, wantHover, wantQB]（沒有閃避時原樣）
  dgMove(dt, wish, hover, qb) {
    let s = this.dg;
    if (!s)
      s = this.dg = {
        scan: Math.random() * DG.SCAN,
        cd: rnd(0.5, 1.5),
        roll: 0,
        pend: null,
        act: null,
        open: 0,
        popT: -9,
      };
    if (s.cd > 0) s.cd -= dt;
    if (s.roll > 0) s.roll -= dt;
    if (s.open > 0) {
      s.open -= dt;
      if (s.open <= 0) s.read = false;
    }
    // 閃避中：照決定的方向移動
    if (s.act) {
      const A = s.act;
      A.t += dt;
      const C = DG_CLASS[this.dgClass()];
      if (A.k === 'jump') {
        hover = A.t < DG.JUMP_T;
        wish = _d.copy(A.dir).multiplyScalar(0.8);
      } else if (A.k === 'guard') wish = _d.set(0, 0, 0);
      else wish = _d.copy(A.dir);
      qb = A.t <= dt * 1.5 && A.k !== 'jump' && A.k !== 'guard'; // 第一格按 QB
      // 升降（會飛的）：目標高度暫時改變，結束時還原
      if ((A.k === 'rise' || A.k === 'dive') && A.h0 === undefined) {
        A.h0 = this.hoverH;
        this.hoverH = Math.max(2 * this.dk, A.h0 + (A.k === 'rise' ? 1 : -1) * DG.HOV_D * this.dk);
      }
      const end =
        A.k === 'jump'
          ? DG.JUMP_T + 0.15
          : A.k === 'guard'
            ? DG.GUARD_T
            : A.k === 'rise' || A.k === 'dive'
              ? DG.HOV_T
              : (C.qb || DG.QB_T) + 0.04;
      if (A.t >= end) {
        if (A.h0 !== undefined) this.hoverH = A.h0;
        s.act = null;
        s.open = DG.OPEN; // 破綻
        s.cd = rnd(...DG_CLASS[this.dgClass()].cd);
        if (this.grounded) this.game.fx.dust(this.pos.clone(), (1.6 * this.scale) / this.game.fx.k, 5);
      }
      return [wish, hover, qb];
    }
    // 反應時間：推進器先亮一下（預兆），時間到才閃
    if (s.pend) {
      s.pend.t -= dt;
      if (!this.canAct() || this.melee.active) s.pend = null;
      else if (s.pend.t <= 0) {
        this.dgStart(s.pend);
        s.pend = null;
        return this.dgMove(0, wish, hover, qb);
      }
      return [wish, hover, qb];
    }
    if ((s.scan -= dt) > 0) return [wish, hover, qb];
    s.scan = DG.SCAN;
    if (s.cd > 0 || s.roll > 0 || s.open > 0 || !this.dgReady()) return [wish, hover, qb];
    const th = this.dgThreat();
    if (!th) return [wish, hover, qb];
    // 擲一次
    const g = this.game;
    const C = DG_CLASS[this.dgClass()];
    let p = C.p * clamp(this.aiSkill || 1, 0.6, 1.4) * this.dgSetK() * (th.k || 1);
    const tgt = th.from && th.from.isPlayer !== undefined ? th.from : g.player;
    if (tgt && g.aiStress) p *= 1 - (1 - DG.STRESS_K) * g.aiStress(tgt);
    if (g.dgForce !== undefined) p = g.dgForce; // 自動化測試：直接指定機率
    if (!(Math.random() < p) || !this.dgCapOk()) {
      s.roll = DG.REROLL;
      return [wish, hover, qb];
    }
    const react = th.now ? 0.02 : rnd(...DG.REACT) / clamp(this.aiSkill || 1, 0.7, 1.4);
    if (th.t !== undefined && th.t - react < 0.03 && !th.now) {
      s.roll = DG.REROLL * 0.5; // 來不及
      return [wish, hover, qb];
    }
    s.pend = { t: react, th };
    this.dgCapAdd();
    // 預兆：推進器亮一下
    if (!th.now) {
      const c = this.center();
      g.fx.boostFlame(c.setY(c.y - 0.2 * this.scale), new THREE.Vector3(0, -1, 0), 0xffd080);
    }
    return [wish, hover, qb];
  },
  // 可以閃嗎：察覺玩家（交戰中）、沒有在出招的準備、失衡、硬直、近戰、被處決
  dgReady() {
    if (!this.canAct() || this.melee.active || this.execBy != null) return false;
    if (this.sn && this.sn.on && this.sn.st !== 2) return false;
    if (this.sn && this.sn.mv && this.sn.mv.ph === 'wind') return false;
    if (this.empLockT > 0) return false;
    return true;
  },
  dgCapOk() {
    const g = this.game;
    if (g.dgForce !== undefined) return true;
    const L = (g.dgRecent || []).filter((t) => g.time - t < DG.CAP_T);
    g.dgRecent = L;
    const np = (g.playersAlive ? g.playersAlive().length : 1) || 1;
    return L.length < DG.CAP + np;
  },
  dgCapAdd() {
    const g = this.game;
    (g.dgRecent || (g.dgRecent = [])).push(g.time);
  },
  // 找威脅：{ t 到達的秒數, dir 威脅的方向（水平、單位）, p 投射物, k 機率倍率, kind, from, now }
  dgThreat() {
    const g = this.game;
    const c = _c.copy(this.center());
    const dk = this.dk;
    let best = null;
    // 投射物
    const R0 = this.radius * 1.1 + DG.PAD * dk;
    for (const p of g.projectiles) {
      if (p.dead || p.visual || p.team === this.team || p.dgDodged === this) continue;
      if (p.owner && p.owner.team === this.team) continue;
      if (!SHOT_KINDS.has(p.kind) && p.kind !== 'beam') continue;
      const v = p.vel;
      const vv = v.lengthSq();
      if (vv < 1) continue;
      _r.copy(c).sub(p.pos);
      let t;
      const homing = p.kind === 'missile' && p.target === this;
      if (homing) {
        t = _r.length() / Math.sqrt(vv);
        if (t > DG.MSL_LAST + DG.REACT[1] + DG.SCAN) continue; // 最後一刻才閃（太早閃，導彈會轉回來）
      } else {
        if (_r.lengthSq() > vv * DG.WIN[1] * DG.WIN[1] + 400 * dk * dk) continue;
        t = _r.dot(v) / vv;
        if (t < DG.WIN[0] || t > DG.WIN[1]) continue;
        const mx = _r.x - v.x * t,
          my = _r.y - v.y * t,
          mz = _r.z - v.z * t;
        const R = R0 + (p.splash || 0) * 0.6 + (p.hitR || 0) * dk;
        if (mx * mx + my * my + mz * mz > R * R) continue;
      }
      if (!best || t < best.t) {
        const h = Math.hypot(v.x, v.z) || 1;
        best = {
          t,
          dir: new THREE.Vector3(v.x / h, 0, v.z / h),
          p,
          kind: homing ? 'msl' : 'shot',
          from: p.owner,
        };
      }
    }
    if (best) return best;
    // 玩家：蓄力快滿、剛被雷射打中、近戰／突擊推進衝過來
    for (const h of g.playersAlive ? g.playersAlive() : g.player ? [g.player] : []) {
      if (!h || h.dead) continue;
      _d.copy(this.pos).sub(h.pos).setY(0);
      const dist = _d.length();
      if (dist < 1e-3) continue;
      _d.multiplyScalar(1 / dist);
      if (h.lock === this) {
        for (const sl of SLOTS) {
          const w = h.weapons && h.weapons[sl];
          if (!w || !w.def) continue;
          const lc = w.charging && w.def.chargeT > 0 && w.charge / w.def.chargeT > 0.75;
          const pc = (w.pwCh || 0) >= PW.CH_T * 0.85;
          if (lc || pc) return { t: 0.25, dir: _d.clone(), kind: 'charge', from: h, k: 1 };
        }
        if (this.dgLaserT && g.time - this.dgLaserT < 0.4)
          return { t: 0.3, dir: _d.clone(), kind: 'laser', from: h, k: DG.LASER_K };
      }
      const m = h.melee;
      if (m && m.active && dist < 22 * dk && (m.target === this || dist < 12 * dk))
        return { t: 0.2, dir: _d.clone(), kind: 'melee', from: h, k: DG.MELEE_K };
      if (h.abT > 0 && dist < 30 * dk && h.lock === this) {
        const vx = h.vel.x,
          vz = h.vel.z;
        const vh = Math.hypot(vx, vz);
        if (vh > 1 && (vx * _d.x + vz * _d.z) / vh > 0.8)
          return { t: dist / vh, dir: _d.clone(), kind: 'melee', from: h, k: DG.MELEE_K };
      }
    }
    return null;
  },
  // 開始閃避：決定種類與方向
  dgStart(pend) {
    const g = this.game;
    const s = this.dg;
    const th = pend.th;
    const C = DG_CLASS[this.dgClass()];
    const melee = th.kind === 'melee' || th.kind === 'charge';
    let k = pickKind(C.kinds, (kk) =>
      kk === 'jump'
        ? this.grounded && th.kind !== 'msl'
        : kk === 'rise' || kk === 'dive'
          ? this.flying
          : true,
    );
    if (melee && k === 'jump' && Math.random() < 0.5) k = 'back';
    if (k === 'guard') return this.dgGuardStart(th);
    // 側閃的方向：和威脅垂直、往遠離軌跡的那一側
    const f = th.dir;
    const side = _r.set(-f.z, 0, f.x);
    let sg = Math.random() < 0.5 ? 1 : -1;
    if (th.p) {
      _c.copy(this.pos).sub(th.p.pos);
      const off = _c.x * side.x + _c.z * side.z;
      if (Math.abs(off) > 0.3 * this.dk) sg = Math.sign(off);
    }
    const dist = (k === 'back' ? 14 : 16) * this.dk;
    const cand = [];
    if (k === 'side' || k === 'jump')
      cand.push(side.clone().multiplyScalar(sg), side.clone().multiplyScalar(-sg));
    cand.push(f.clone()); // 往後（順著威脅的方向離開）
    let dir = null;
    for (const d of cand)
      if (this.dgSafe(d, dist)) {
        dir = d;
        break;
      }
    if (!dir) dir = cand[0];
    if (dir === cand[cand.length - 1] && k === 'side') k = 'back';
    // 反制（第 3 期）：導彈打過來時載具丟煙幕彈、會飛的丟熱焰彈（導彈一律失去追蹤）
    if (th.kind === 'msl' && C.msl) this.dgCounter(C.msl, th.p);
    s.act = { k, t: 0, dir: dir.normalize(), kind: th.kind };
    // 閃開的子彈失去彈道修正；追著自己的導彈在最後一刻閃開時失去追蹤
    for (const p of g.projectiles) {
      if (p.dead || p.target !== this) continue;
      if (p.kind === 'missile') {
        const tt = p.pos.distanceTo(this.center()) / Math.max(1, p.vel.length());
        if (tt < DG.MSL_LAST + 0.3) {
          p.target = null;
          p.dodged = true;
        }
      } else if (p.bend) p.bend = 0;
    }
    if (th.p) th.p.dgDodged = this;
    if (k === 'jump') this.iFrames = Math.max(this.iFrames, DG.QB_IF * 0.6);
    // 動作（第 2 期）：人形的二足／逆關節依種類挑側翻、滑鏟、後空翻、空中側翻；其他照 QB 的姿勢
    const ev = this.dgAnimPick(k);
    if (ev) {
      const y = this.yaw || 0;
      const df = dir.x * -Math.sin(y) + dir.z * -Math.cos(y),
        ds = dir.x * Math.cos(y) + dir.z * -Math.sin(y);
      this.evadeGo(ev, df, ds);
      if (g.net && g.net.role === 'host')
        g.netEv({ t: 'dgv', i: this.id, k: ev, f: +df.toFixed(2), s: +ds.toFixed(2) });
      if (ev !== 'slide') this.iFrames = Math.max(this.iFrames, DG.FLIP_IF); // 翻轉中子彈穿過去（看得到在翻）
    }
    // 「閃避」字
    if (th.from && th.from.pilotEnt && th.from.pilotEnt() && this.t - s.popT > DG.POP_GAP) {
      s.popT = this.t;
      const h = (this.model && this.model.height) || 3;
      g.popDamage(
        this.center().setY(this.pos.y + h + 1.2 * this.dk),
        '閃避',
        false,
        false,
        false,
        0,
        this.id,
      );
    }
    this.dgN = (this.dgN || 0) + 1; // 測試用
    this.dgLast = th; // 測試用
  },
  // 閃避的動作：qb＝只有 QB 的姿勢（null）
  dgAnimPick(k) {
    const m = this.model;
    const cls = this.dgClass();
    // 載具甩尾、直升機傾斜急閃、無人機橫滾（evBody 轉整台）
    if (cls === 'veh') return 'drift';
    if (cls === 'heli') return 'bank';
    if (cls === 'drone') return k === 'side' && Math.random() < 0.6 ? 'broll' : 'bank';
    if (!m || (m.type !== 'biped' && m.type !== 'reverse')) return null;
    const F = this.game.dgAnimForce; // 自動化測試
    if (F) return F === 'qb' ? null : F;
    const W = DG_ANIM[this.dgClass()] || DG_ANIM.mt;
    const L = !this.grounded ? W.air : k === 'back' ? W.back : k === 'jump' ? W.jump : W.side;
    const r = Math.random();
    let acc = 0;
    for (const [ev, w] of L) {
      acc += w;
      if (r < acc) return ev === 'qb' ? null : ev;
    }
    return null;
  },
  // 閃避的動作（房主在 dgStart、客機收到 dgv 事件）：人形交給動作層一次（animExtra 的 evade）；
  // 其他的由 evBody 轉整台；殘影與護盾也在 evBody（poseTail／remoteUpdate 每格，各端）
  evadeGo(k, f, s) {
    if (HUMAN_EV.has(k)) this.evQ = { k, f, s };
    this.evK = { k, f, s, t: 0, gT: 0, T: DG.EV_T[k] || DG.GHOST_T };
  },
  evadeTake() {
    const q = this.evQ;
    this.evQ = null;
    return q;
  },
  // 整台的轉動先扣掉（poseTail／remoteUpdate 的前傾 lerp 之前）
  evBodyRestore() {
    const o = this.evOff;
    if (!o || !this.mesh) return;
    this.mesh.rotation.x -= o.x;
    this.mesh.rotation.y -= o.y;
    this.mesh.rotation.z -= o.z;
    this.evOff = null;
  },
  // 每格（前傾 lerp 之後）：甩尾、傾斜急閃、橫滾、殘影、防禦的護盾
  evBody(dt) {
    const E = this.evK;
    if (E || this.dgShield) this.dgShieldTick();
    if (!E) return;
    E.t += dt;
    const g = this.game;
    const ph = clamp(E.t / E.T, 0, 1);
    const sg = (E.s || 0) >= 0 ? 1 : -1;
    let x = 0,
      y = 0,
      z = 0;
    const bell = Math.sin(ph * Math.PI);
    if (E.k === 'drift') {
      y = -sg * 0.55 * bell; // 車尾甩出去
      z = -sg * 0.12 * bell;
    } else if (E.k === 'bank') {
      z = -sg * 0.7 * bell; // 往閃的方向傾斜
      x = 0.15 * bell;
    } else if (E.k === 'broll') z = -sg * Math.PI * 2 * (ph * ph * (3 - 2 * ph)); // 橫滾一圈
    if ((x || y || z) && this.mesh) {
      this.mesh.rotation.x += x;
      this.mesh.rotation.y += y;
      this.mesh.rotation.z += z;
      this.evOff = { x, y, z };
    }
    // 殘影（設定「殘影」關閉時不留；防禦不留）
    if (E.k !== 'guard' && E.t < DG.GHOST_T && g.ctrl.ghost !== 'off' && g.fx.ghosts && this.model) {
      if ((E.gT -= dt) <= 0) {
        E.gT = DG.GHOST_GAP;
        g.fx.ghosts.snap(this.model.group, DG.GHOST_COL);
      }
    }
    if (E.k === 'drift' && this.grounded && Math.random() < dt * 30)
      g.fx.dust(this.pos.clone(), (1.4 * this.scale) / g.fx.k, 2);
    if (E.t >= Math.max(E.T, DG.GHOST_T)) this.evK = null;
  },
  // 防禦（固定砲台、護盾產生器；之後的巨型 Boss）：架起六角護盾 GUARD_T 秒，傷害 ×GUARD_K
  dgGuardStart(th) {
    const s = this.dg;
    const g = this.game;
    s.act = { k: 'guard', t: 0, dir: new THREE.Vector3(), kind: th.kind };
    this.evadeGo('guard', 0, 0);
    if (g.net && g.net.role === 'host') g.netEv({ t: 'dgv', i: this.id, k: 'guard', f: 0, s: 0 });
    this.dgN = (this.dgN || 0) + 1; // 測試用
    this.dgLast = th;
    if (th.from && th.from.pilotEnt && th.from.pilotEnt() && this.t - s.popT > DG.POP_GAP) {
      s.popT = this.t;
      const h = (this.model && this.model.height) || 3;
      g.popDamage(
        this.center().setY(this.pos.y + h + 1.2 * this.dk),
        '防禦',
        false,
        false,
        false,
        0,
        this.id,
      );
    }
  },
  // 護盾的外觀（各端）：evK 是 guard 時顯示，淡入淡出
  dgShieldTick() {
    const E = this.evK;
    const on = !!(E && E.k === 'guard' && E.t < E.T);
    let M = this.dgShield;
    if (!M && on && this.mesh) {
      M = this.dgShield = new THREE.Mesh(SHIELD_GEO(), hexShieldMat(DG.GUARD_COL));
      M.userData.noFade = true;
      M.userData.helper = true;
      M.renderOrder = 4;
      this.mesh.add(M);
    }
    if (!M) return;
    M.visible = on;
    if (!on) return;
    const sc = this.mesh.scale.x || 1;
    const h = (this.model && this.model.height) || this.radius * 2;
    const R = Math.max(this.radius * 1.6, h * 0.75);
    M.position.set(0, (h * 0.5) / sc, 0);
    M.scale.setScalar(R / sc);
    const U = M.material.uniforms;
    if (U) {
      const ph = E.t / E.T;
      U.uTime.value = this.game.fx.time;
      U.uOp.value = 0.9 * Math.min(1, ph / 0.1) * Math.min(1, (1 - ph) / 0.15);
    }
  },
  // 導彈的反制：smoke 煙幕彈（煙幕區域：裡面不能鎖定）、flare 熱焰彈；追著自己的導彈失去追蹤
  dgCounter(kind, p) {
    const g = this.game;
    const c = this.center();
    if (kind === 'smoke') {
      if (g.addZone)
        g.addZone('smoke', this.pos.clone(), DG.SMOKE_R * this.dk, DG.SMOKE_T, { team: this.team });
      g.popDamage(c.clone().setY(c.y + 3 * this.dk), '煙幕', false, false, false, 0, this.id);
    } else {
      for (let i = 0; i < 8; i++) {
        const d = new THREE.Vector3(rnd(-1, 1), rnd(-1, -0.2), rnd(-1, 1)).normalize();
        g.fx.spark(c.clone().addScaledVector(d, 1.5 * this.dk), 0xfff0b0, d);
      }
      g.fx.flash(c, (3 * this.scale) / g.fx.k, 0xffe090, 0.3);
      g.popDamage(c.clone().setY(c.y + 3 * this.dk), '熱焰彈', false, false, false, 0, this.id);
    }
    for (const q of g.projectiles)
      if (!q.dead && q.kind === 'missile' && q.target === this) {
        q.target = null;
        q.dodged = true;
      }
    if (p) p.dgDodged = this;
  },
  // 往 d 方向閃 dist 遠安全嗎：作戰區域內、不是虛空、沒被障礙物擋住
  dgSafe(d, dist) {
    const W = this.game.world;
    if (!W) return true;
    for (const f of [0.5, 1]) {
      const x = this.pos.x + d.x * dist * f,
        z = this.pos.z + d.z * dist * f;
      if (W.inZone && W.zone && !W.inZone(x, z, 2 * this.dk)) return false;
      if (W.isVoid && W.isVoid(x, z)) return false;
      if (W.collide) {
        const r = W.collide(x, z, this.pos.y + 1 * this.dk, this.radius);
        if (Math.abs(r[0] - x) > 0.5 * this.dk || Math.abs(r[1] - z) > 0.5 * this.dk) return false;
      }
      if (W.lavaAt && W.lavaAt(x, z)) return false;
    }
    return true;
  },
  // 閃避的 QB 比一般的長、無敵也長一點（move 的 QB 開始時呼叫）
  dgQbStart() {
    const A = this.dg && this.dg.act;
    if (!A) return;
    this.qbT = DG_CLASS[this.dgClass()].qb || DG.QB_T;
    this.iFrames = Math.max(this.iFrames, DG.QB_IF);
    const g = this.game;
    if (this.grounded) g.fx.dust(this.pos.clone(), (2.6 * this.scale) / g.fx.k, 10);
  },
  // 破綻中（mech-weak.js 的 wpOpen、mech-sense.js 的 senseAw）
  dgOpenNow() {
    return !!(this.dg && this.dg.open > 0);
  },
  // takeDamage：玩家打中破綻中的敵人 → 讀招（第一下）；Boss 的破綻是傷害倍率
  dgHit(dmg, from, melee) {
    const s = this.dg;
    // 防禦中：傷害 ×GUARD_K，護盾亮起
    if (s && s.act && s.act.k === 'guard') {
      if (this.dgShield && this.dgShield.material.uniforms && from && from.center)
        hexShieldHit(this.dgShield.material, from.center().sub(this.center()));
      return dmg * DG.GUARD_K;
    }
    if (!s || !(s.open > 0) || !from || !from.pilotEnt || !from.pilotEnt() || from.team === this.team)
      return dmg;
    if (!s.read) {
      s.read = true;
      if (from.syEvent) from.syEvent('read');
      const h = (this.model && this.model.height) || 3;
      this.game.popDamage(
        this.center().setY(this.pos.y + h + 2.2 * this.dk),
        '讀招',
        false,
        true,
        false,
        0,
        this.id,
      );
    }
    if (this.isBoss || melee) return dmg * DG.OPEN_K_BOSS;
    return dmg;
  },
  // 閃避中被打（無敵吸收）
  dgAbsorb(from) {
    const s = this.dg;
    if (!s || !s.act || !from || !from.pilotEnt || !from.pilotEnt()) return;
    if (this.t - s.popT > DG.POP_GAP) {
      s.popT = this.t;
      const h = (this.model && this.model.height) || 3;
      this.game.popDamage(
        this.center().setY(this.pos.y + h + 1.2 * this.dk),
        '閃避',
        false,
        false,
        false,
        0,
        this.id,
      );
    }
  },
});
