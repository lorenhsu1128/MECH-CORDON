// MechEntity 擴充：空域的飛行（docs/air-combat-design.md）。高推力機甲：沒有重力、推力撐住，不會失速（減速到底＝懸停）。
// move() 在 this.air 時改呼叫 airMove（計時、近戰的取消照 move 前段），姿勢與動作照 poseTail（airOrient 換掉地面的傾斜）。
//   方向：機首轉向 airAim（玩家＝鏡頭的方向；Game 每格設定），轉向速度依速度，急轉彎（跳躍鍵按住）×2、掉速、耗 EN
//   推力：airIn.thr 前＝推進、後＝減速（到底懸停）、沒按＝巡航；airIn.side＝橫移
//   機動（QB 鍵＋方向）：左右＝側滾翻（瞬間側移、短暫無敵）、前＝前滾翻（爆發加速）、後＝後空翻（翻一圈、機首轉 180°）；
//     機動的時機剛好＝甩掉導彈（mech-weak.js 的 missileDodge）＋完美迴避（pqbDodge），所以不另做熱焰彈
//   撞到地形或海面：依速度受傷並彈開；高度上限 AIR_CEIL
//   內建的空戰標準導彈（aam*，第 2 期）：不佔機甲庫的武器槽，兩條發射軌輪流裝填；機首前方 AAM_CONE 內、AAM_R 內的鎖定目標才追蹤
//   敵人的空戰 AI（airAI，updateAI 選好目標後呼叫）：同一套飛行模型，追擊（前置量）、迎面太近時拉開、繞到背後用急轉彎、
//     低空拉起、導彈快打到時翻滾閃避；手持武器在機首前方才開火，敵對 AC 另外帶空戰導彈；自殺無人機直接撞上來
//   地面的防空（airSamTick）：防空砲另外定期發射空戰導彈
// 只在單機（空域只有單人）；數值是公尺與秒（已經是新尺度的公尺，不再乘 DS）。
import { SFX } from '../audio/audio.js';
import { clamp, lerp, rnd } from '../core/math.js';
import { AIR } from '../data/air.js';
import { START_ASM, asmStats } from '../data/parts.js';
import { MechEntity } from './mech-entity.js';
import { Projectile } from './projectile.js';

let REF_SPD = 0; // 起始機體的速度（airSpeedK 的基準）
const _f = new THREE.Vector3(),
  _r = new THREE.Vector3(),
  _a = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _qx = new THREE.Quaternion(),
  _qr = new THREE.Quaternion(),
  _X = new THREE.Vector3(1, 0, 0),
  _Y = new THREE.Vector3(0, 1, 0),
  _Z = new THREE.Vector3(0, 0, 1),
  _t = new THREE.Vector3();
const ZERO = new THREE.Vector3();
const BOMB_G = 30; // 轟炸機的炸彈的重力（m/s²）

// 方向（yaw、俯仰）→ 單位向量（機體的正面是 −Z）
function dirOf(yaw, pit, out) {
  const c = Math.cos(pit);
  return out.set(-Math.sin(yaw) * c, Math.sin(pit), -Math.cos(yaw) * c);
}

Object.assign(MechEntity.prototype, {
  // 進入空域：沿目前的朝向巡航
  airInit(alt) {
    this.air = true;
    this.airV = AIR.CRUISE * 0.8;
    this.airPit = 0;
    this.airRoll = 0;
    this.airYawV = 0;
    this.airImp = new THREE.Vector3();
    this.airRev = null;
    this.airIn = { thr: 0, side: 0 };
    this.airCrashCD = 0;
    this.pos.y = alt;
    this.vel.copy(dirOf(this.yaw, 0, _f)).multiplyScalar(this.airV);
    this.grounded = false;
    this.hover = true;
    this.jumpT = 0;
    this.hoverMode = 0;
  },
  // 機首的方向（HUD 的機首標記）
  airDirNow() {
    return dirOf(this.yaw, this.airPit || 0, new THREE.Vector3());
  },
  // 動作層要的翻轉（animExtra 的 flipGo，取一次就清掉）
  airFlipTake() {
    const f = this.airFlip;
    if (f) this.airFlip = null;
    return f || null;
  },
  // 機體的速度倍率（輕量機快、重量機慢）
  airSpeedK() {
    if (this.airSk === undefined) {
      if (!REF_SPD) REF_SPD = asmStats(START_ASM).speed || 1;
      this.airSk = clamp((this.stats.speed || REF_SPD) / REF_SPD, 0.85, 1.18); // 以起始的機體為 1
    }
    return this.airSk;
  },
  airMove(dt, wish, wantG, wantQB, wantAB, targetEnt) {
    const g = this.game,
      w = g.world,
      P = this.stats.parts;
    const In = this.airIn || { thr: 0, side: 0 };
    const sk = this.airSpeedK();
    const down = this.downed || this.staggerT > 0 || this.hitStunT > 0;
    let thr = down ? 0 : In.thr,
      side = down ? 0 : In.side;
    if (this.edHold) thr = side = 0;
    // EN 回復（推進、急轉彎時停）照 move 前段；這裡只扣
    const useEn = (k) => {
      const c = this.enMax * k * dt;
      if (this.en < c) return false;
      this.en -= c;
      this.enDelay = 0.35;
      return true;
    };
    // ---- 機動（QB 鍵＋方向）----
    if (wantQB && !down && this.qbT <= 0 && !this.airRev && this.useEn(P.booster.qbCost)) {
      const ax = Math.abs(side),
        az = Math.abs(thr);
      const kind = ax > 0.4 && ax >= az ? 's' : thr < -0.4 ? 'b' : 'f';
      dirOf(this.yaw, 0, _f);
      _r.set(-_f.z, 0, _f.x); // 右
      this.qbT = 0.16;
      this.qbStartT = this.t; // 甩掉導彈、完美迴避（mech-weak.js、pqbDodge）
      if (this.pilotEnt()) this.cueArmSet('q');
      this.iFrames = kind === 'b' ? 0.32 : 0.26;
      if (kind === 's') {
        const sg = Math.sign(side);
        this.airImp.addScaledVector(_r, sg * AIR.ROLL_IMP);
        this.qbDir.copy(_r).multiplyScalar(sg);
        this.airFlip = { f: 0, s: sg, T: AIR.FLIP_T };
      } else if (kind === 'f') {
        this.airV = Math.min(AIR.AB * sk, this.airV + AIR.FWD_IMP);
        this.qbDir.copy(dirOf(this.yaw, this.airPit, _a));
        this.airFlip = { f: 1, s: 0, T: AIR.FLIP_T };
      } else {
        // 後空翻：翻一圈、機首轉 180°（像殷麥曼迴旋）；玩家的鏡頭一起轉過去
        this.airRev = { t: 0, y0: this.yaw, p0: this.airPit, y1: this.yaw + Math.PI, p1: -this.airPit * 0.5 };
        this.airV = Math.min(this.airV, 40);
        this.qbDir.copy(dirOf(this.yaw, this.airPit, _a)).negate();
        this.airFlip = { f: -1, s: 0, T: AIR.REV_T };
        if (this.isPlayer && g.airRevCam) g.airRevCam();
      }
      this.tutE('qb', {});
      SFX.qb(this.isPlayer ? null : this.center());
      if (this.isPlayer) g.rumble(0.12, 0.4, 90);
    }
    if (this.qbT > 0) this.qbT -= dt;
    // ---- 目標的速度 ----
    let vT =
      (thr > 0.3
        ? AIR.BOOST
        : thr < -0.3
          ? lerp(AIR.CRUISE, AIR.HOVER, clamp((-thr - 0.3) / 0.6, 0, 1))
          : AIR.CRUISE) * sk;
    if (thr > 0.3 && !useEn(AIR.EN_BOOST)) vT = AIR.CRUISE * sk;
    let abTo = null;
    if (wantAB && !down && this.en > 5 && useEn(AIR.EN_AB)) {
      if (this.abT <= 0) SFX.ab(this.isPlayer ? null : this.center());
      this.abT = 0.1;
      vT = AIR.AB * sk;
      if (targetEnt && !targetEnt.dead) abTo = targetEnt.center().sub(this.center());
    } else if (this.abT > 0) this.abT -= dt;
    const gTurn = !!wantG && !down && this.airV > 25 && useEn(AIR.EN_G);
    this.airG = gTurn;
    // ---- 方向 ----
    let yawT = this.yaw,
      pitT = this.airPit;
    const aim = abTo || this.airAim;
    if (aim && aim.lengthSq() > 1e-6) {
      yawT = Math.atan2(-aim.x, -aim.z);
      pitT = clamp(Math.atan2(aim.y, Math.hypot(aim.x, aim.z)), -AIR.PITCH_MAX, AIR.PITCH_MAX);
    }
    const yaw0 = this.yaw,
      pit0 = this.airPit;
    if (this.airRev) {
      const R = this.airRev;
      R.t += dt / AIR.REV_T;
      const e = Math.min(1, R.t),
        s = e * e * (3 - 2 * e);
      this.yaw = R.y0 + (R.y1 - R.y0) * s;
      this.airPit = lerp(R.p0, R.p1, s);
      if (R.t >= 1) this.airRev = null;
    } else if (!down) {
      // 轉向速度：懸停時原地轉身最快，中速其次，高速變慢
      const v = this.airV;
      let rate =
        v < 25 ? lerp(AIR.TURN_HOVER, AIR.TURN, v / 25) : AIR.TURN * (1 - 0.35 * clamp((v - 70) / 80, 0, 1));
      this.airRate = rate; // 右搖桿的轉向速度跟著它（game/air.js 的 airStickTurn）
      if (gTurn) rate *= AIR.GTURN;
      if (this.melee.active) rate *= 0.4;
      const dy = ((((yawT - this.yaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI,
        dp = pitT - this.airPit;
      const L = Math.hypot(dy, dp),
        step = rate * dt;
      const k = L > step ? step / L : 1;
      this.yaw += dy * k;
      this.airPit += dp * k;
    }
    this.airYawV = lerp(
      this.airYawV,
      (((((this.yaw - yaw0 + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI) /
        Math.max(dt, 1e-3),
      Math.min(1, dt * 8),
    );
    // 直線飛了多久（敵人的預判照它：轉彎、翻滾、急轉、橫移就重來；airAimK）
    const turning =
      Math.abs(this.airYawV) > 0.25 ||
      Math.abs(this.airPit - pit0) > 0.25 * dt ||
      this.qbT > 0 ||
      !!this.airRev ||
      gTurn ||
      Math.abs(side) > 0.3;
    this.airSteady = turning ? 0 : (this.airSteady || 0) + dt;
    this.aimYaw = this.aimYaw === undefined ? this.yaw : this.aimYaw;
    // ---- 速度 ----
    if (gTurn) vT = Math.min(vT, Math.max(45 * sk, this.airV - AIR.GDRAG * dt * 4));
    const acc = vT > this.airV ? AIR.ACC : AIR.DEC;
    this.airV += clamp(vT - this.airV, -acc * dt, acc * dt);
    if (gTurn) this.airV = Math.max(40 * sk, this.airV - AIR.GDRAG * dt);
    dirOf(this.yaw, this.airPit, _f);
    _r.set(-Math.cos(this.yaw), 0, Math.sin(this.yaw)).negate(); // 右（水平）
    const imp = this.airImp;
    imp.multiplyScalar(Math.exp(-dt * 5));
    this.boost = this.airV > AIR.CRUISE * sk + 8 || this.abT > 0 || this.qbT > 0;
    if (this.melee.active) this.updateMelee(dt);
    else {
      const tv = _a
        .copy(_f)
        .multiplyScalar(this.airV)
        .addScaledVector(_r, side * AIR.SIDE)
        .add(imp);
      // 低速（懸停）時照輸入慢慢停下；高速時速度一直沿機首（推力很大）
      this.vel.lerp(tv, Math.min(1, dt * (this.airV < 25 ? 3 : 7)));
    }
    if (this.pilotEnt()) this.oobPush(w, dt);
    // ---- 積分與地面 ----
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y > AIR.CEIL) {
      this.pos.y = AIR.CEIL;
      if (this.vel.y > 0) this.vel.y = 0;
      if (this.airPit > 0) this.airPit *= 0.9;
      if (this.isPlayer && !(this.altWarnT > 0)) {
        this.altWarnT = 1.5;
        g.flashAlert('已達飛行高度上限');
      }
    }
    if (this.altWarnT > 0) this.altWarnT -= dt;
    this.airFloorTick(dt, w);
    this.grounded = false;
    this.hover = true;
    this.jumpT = 0;
  },
  // 地面或海面（比較高的那個）
  airFloor(x, z) {
    const w = this.game.world;
    const W = w.theme.water;
    return Math.max(w.terrainHeight(x, z), W ? W.level : -1e9);
  },
  // 撞到地形或海面：依速度受傷並彈開（不直接擊破）；慢慢貼近時只是擋住
  airFloorTick(dt, w) {
    const g = this.game;
    if (this.airCrashCD > 0) this.airCrashCD -= dt;
    const fl = this.airFloor(this.pos.x, this.pos.z),
      pad = 1.2 * this.scale;
    this.airLow = this.pos.y - fl; // HUD 的低空警告
    if (this.pos.y >= fl + pad) return;
    const into = Math.max(-this.vel.y, 0),
      v = this.vel.length();
    this.pos.y = fl + pad;
    if ((into > 12 || v > 45) && this.airCrashCD <= 0) {
      this.airCrashCD = 1.2;
      const k = clamp(v / AIR.AB, 0.25, 1);
      if (!(g.net && g.net.role === 'client'))
        this.takeDamage(
          this.maxHp * 0.14 * k,
          300,
          null,
          this.center(),
          new THREE.Vector3(0, 1, 0),
          null,
          null,
          'none',
        );
      this.airPit = Math.max(this.airPit, 0.45);
      this.airV *= 0.55;
      this.vel.y = Math.abs(this.vel.y) * 0.5 + 12;
      const W = w.theme.water;
      const wet = W && W.level >= w.terrainHeight(this.pos.x, this.pos.z);
      if (wet && g.water && g.water.g) g.water.drop(this.pos.x, this.pos.z, 4 * this.scale, -1.2);
      g.fx.dust(this.pos.clone(), 3.5 * this.scale, 12);
      SFX.land(this.isPlayer ? null : this.center(), 1);
      if (this.isPlayer) {
        g.fpPitch = Math.max(g.fpPitch, 0.3); // 機首跟著鏡頭：彈開時鏡頭也抬起來
        g.camShake = Math.max(g.camShake, 0.35);
        g.rumble(0.8, 0.6, 220);
        g.flashAlert(wet ? '墜海！機體受損' : '撞地！機體受損');
      }
    } else if (this.vel.y < 0) this.vel.y = 0;
  },
  // 姿勢（poseTail 呼叫，取代地面的傾斜）：一律是機甲站立微蹲的姿勢（不是前傾的超人姿勢；使用者 2026-10-31 定案），
  // 速度快時只微微前傾、爬升俯衝時稍微跟著仰俯，轉彎與橫移時繞前後軸往內側傾
  airOrient(dt) {
    const v = this.airV || 0;
    const T = clamp((v - 20) / 60, 0, 1);
    this.airTilt = lerp(this.airTilt || 0, T, Math.min(1, dt * 4));
    let x = -0.16 * this.airTilt + clamp(this.airPit * 0.22, -0.3, 0.3);
    x += -clamp((this.leanX || 0) * 0.35, -0.2, 0.2);
    if (this.staggerT > 0 || this.downed) x += Math.sin(this.t * 9) * 0.12;
    const side = (this.airIn && this.airIn.side) || 0;
    const rollT = clamp(
      this.airYawV * 0.45 - side * 0.22 + (this.airG ? Math.sign(this.airYawV) * 0.2 : 0),
      -0.65,
      0.65,
    );
    this.airRoll = lerp(this.airRoll || 0, rollT, Math.min(1, dt * 5));
    _q.setFromAxisAngle(_Y, this.yaw);
    _qx.setFromAxisAngle(_X, x);
    _qr.setFromAxisAngle(_Z, this.airRoll);
    this.mesh.quaternion.copy(_q).multiply(_qx).multiply(_qr);
  },
  // ---------- 內建的空戰標準導彈 ----------
  aamInit(n) {
    this.aam = { n, rail: [0, 0], side: 0 };
  },
  // 每格：兩條軌的裝填
  aamTick(dt) {
    const A = this.aam;
    if (!A) return;
    for (let i = 0; i < 2; i++) if (A.rail[i] > 0) A.rail[i] = Math.max(0, A.rail[i] - dt);
  },
  aamReady() {
    const A = this.aam;
    return !!A && A.n > 0 && (A.rail[0] <= 0 || A.rail[1] <= 0);
  },
  // 這個目標鎖不鎖得到（機首前方、射程內、雙方都不在雲裡）
  aamCan(t) {
    if (!t || t.dead || t.noLock) return false;
    const g = this.game;
    const to = t.center().sub(this.center());
    const d = to.length();
    if (d > AIR.AAM_R || d < 15) return false;
    if (g.airInCloud && (g.airInCloud(t.center()) || g.airInCloud(this.center()))) return false;
    return dirOf(this.yaw, this.airPit || 0, _a).angleTo(to) < AIR.AAM_CONE;
  },
  // 發射一枚（鎖不到時直線飛出）；回傳 true＝發射了
  aamLaunch(t) {
    const A = this.aam,
      g = this.game;
    if (!this.aamReady() || !this.canAct()) return false;
    const i = A.rail[A.side] <= 0 ? A.side : 1 - A.side;
    A.rail[i] = AIR.AAM_RAIL * (this.isPlayer ? 1 : 1.4);
    A.side = 1 - i;
    A.n--;
    const tgt = this.aamCan(t) ? t : null;
    const f = dirOf(this.yaw, this.airPit || 0, new THREE.Vector3());
    _r.set(-f.z, 0, f.x).normalize();
    const pos = this.center()
      .addScaledVector(_r, (i ? 1 : -1) * 1.6 * this.scale)
      .addScaledVector(f, 2 * this.scale);
    const npc = !this.isPlayer;
    const dmg = (npc ? AIR.NPC_AAM_DMG : AIR.AAM_DMG) * this.dmgMul;
    g.projectiles.push(
      new Projectile(g, {
        pos,
        vel: f.clone().multiplyScalar(AIR.AAM_V),
        kind: 'missile',
        dmg,
        impactV: AIR.AAM_IMP * this.dmgMul,
        team: this.team,
        owner: this,
        color: npc ? 0xff9a7a : 0xd8f0ff,
        life: AIR.AAM_R / AIR.AAM_V + 0.8,
        target: tgt,
        turn: npc ? AIR.NPC_AAM_TURN : AIR.AAM_TURN,
        splash: AIR.AAM_SPLASH,
        attr: 'exp',
        aam: true,
        ...(npc ? this.foeShotOpt(dmg, 'missile') : {}),
      }),
    );
    g.fx.muzzle(pos, f, 0xffc0a0, 1, 'ms');
    SFX.shot('missile', undefined, pos, this);
    if (this.isPlayer) g.rumble(0.2, 0.5, 120);
    return true;
  },
  // ---------- 敵人的空戰 AI ----------
  // 生成時：進入飛行狀態（role：'ace' 敵對 AC、'drone' 無人機、'kami' 自殺無人機），機首朝 face
  airFoeInit(role, alt, face) {
    this.airInit(alt);
    this.airRole = role;
    if (role === 'drone') this.airSk = 0.8;
    if (role === 'kami') this.airSk = 1.2;
    if (role === 'bomber') this.airSk = 0.75;
    if (role === 'ace') {
      this.aamInit(999);
      this.airSk = Math.max(1.1, this.airSpeedK()); // 敵對 AC：巡航比玩家快一點，追得上
    }
    if (face) {
      this.yaw = Math.atan2(-(face.x - this.pos.x), -(face.z - this.pos.z));
      this.vel.copy(dirOf(this.yaw, 0, _f)).multiplyScalar(this.airV);
    }
    this.airAiS = { cd: rnd(2, 4), ext: 0, side: Math.random() < 0.5 ? 1 : -1, rollCD: 0, sideT: 0, sv: 0 };
  },
  // updateAI 選好目標後（pl 可能是 null；aimPos＝含前置量的瞄準點）
  // 攻擊名額（game/air.js 的 airDirTick）：airTok 為 false＝沒拿到，在 ORBIT_R 外繞圈、不開火；airIdle＝第一波還沒察覺，照巡邏航線飛
  airAI(dt, pl, aimPos) {
    const g = this.game;
    const S = this.airAiS || (this.airAiS = { cd: 3, ext: 0, side: 1, rollCD: 0, sideT: 0, sv: 0 });
    if (this.airRole === 'bomber') return this.airBomberAI(dt);
    if (this.airIdle) return this.airPatrol(dt);
    // 友軍雷達站只有轟炸機去炸；其他的一律追玩家
    if (pl && pl.ai === 'objective') {
      pl = g.player && !g.player.dead ? g.player : null;
      aimPos = pl ? pl.center() : null;
    }
    const hold = this.airTok !== false;
    const sk = clamp(this.aiSkill || 1, 0.5, 1.6);
    const me = this.center();
    const fwd = dirOf(this.yaw, this.airPit || 0, _f);
    let thr = 0,
      side = 0,
      G = false,
      qb = false;
    const aim = _t.copy(fwd);
    let d = 1e9,
      ang = Math.PI;
    if (pl && !pl.dead) {
      const tc = pl.center();
      const to = tc.clone().sub(me);
      d = to.length();
      ang = fwd.angleTo(to);
      if (!hold) {
        // 沒拿到攻擊名額：在玩家周圍 ORBIT_R 的圈上繞（往自己這一側偏一點），太遠就推進回來
        const b = Math.atan2(me.z - tc.z, me.x - tc.x) + S.side * 0.45;
        aim.set(
          tc.x + Math.cos(b) * AIR.ORBIT_R - me.x,
          tc.y + 80 - me.y,
          tc.z + Math.sin(b) * AIR.ORBIT_R - me.z,
        );
        if (this.en < this.enMax * 0.15) S.enLow = true;
        else if (this.en > this.enMax * 0.45) S.enLow = false;
        thr = d > AIR.ORBIT_R * 1.6 && !S.enLow ? 1 : 0;
      } else {
        // 前置量：照彈速（或撞上來）的飛行時間
        const lead = clamp(d / (this.airRole === 'kami' ? 160 : 260), 0, 1.6);
        aim
          .copy(tc)
          .addScaledVector(pl.vel, lead * 0.7)
          .sub(me);
      }
      if (hold && this.airRole === 'kami') {
        thr = 1;
        if (d < 10 * this.scale + (this.radius || 2)) {
          this.die(pl);
          return;
        }
      } else if (hold) {
        // 迎面太近：先拉開（往側上方飛一段），之後再回頭
        if (S.ext <= 0 && d < AIR.AI_EXTEND && ang < 0.8) S.ext = rnd(2, 3.2);
        if (S.ext > 0) {
          S.ext -= dt;
          aim
            .copy(fwd)
            .addScaledVector(_r.set(-fwd.z, 0, fwd.x).normalize(), S.side * 0.7)
            .setY(0.25);
          thr = 1;
        } else {
          // 追擊：遠的時候推進追上（EN 用到 15% 就停，回到 45% 再推），太近就減速咬住
          if (this.en < this.enMax * 0.15) S.enLow = true;
          else if (this.en > this.enMax * 0.45) S.enLow = false;
          thr = d > 320 && !S.enLow ? 1 : d < 160 ? -0.5 : 0;
          // 目標在側面或背後：急轉彎繞過去（敵對 AC）
          G = this.airRole === 'ace' && ang > 1.1 && d < 700 && this.en > this.enMax * 0.3;
        }
      }
      // 偶爾橫移，不要一直直線飛
      if ((S.sideT -= dt) <= 0) {
        S.sideT = rnd(1.5, 3.5);
        S.sv = Math.random() < 0.5 ? rnd(-1, 1) : 0;
      }
      if (this.airRole !== 'kami' || !hold) side = S.sv;
    }
    this.airSafeAim(aim, fwd);
    // 導彈快打到：翻滾閃避（敵對 AC；無人機不會）
    if (this.airRole === 'ace' && (S.rollCD -= dt) <= 0) {
      for (const pr of g.projectiles) {
        if (pr.dead || pr.kind !== 'missile' || pr.target !== this || pr.dodged) continue;
        if (pr.pos.distanceTo(me) / Math.max(1, pr.vel.length()) > 0.75) continue;
        S.rollCD = rnd(1.2, 2.2) / sk;
        if (Math.random() < AIR.AI_DODGE * sk) {
          qb = true;
          side = Math.random() < 0.5 ? 1 : -1;
          pr.dodged = true;
          pr.target = null; // 甩掉了
        }
        break;
      }
    }
    this.airAim = aim.clone();
    this.airIn = { thr, side };
    this.move(dt, ZERO, G, qb, false, null);
    if (this.aam) this.aamTick(dt);
    if (!pl || pl.dead || !hold) return;
    if (g.airInCloud && g.airInCloud(pl.center())) return; // 目標躲在雲裡：看不到、不開火
    // 開火：武器在機首前方、射程內
    if (ang < AIR.AI_FIRE_CONE && this.airRole !== 'kami') {
      for (const slot of ['rarm', 'larm', 'rback', 'lback']) {
        const wd = this.weapons[slot].def;
        if (!wd || wd.type === 'none' || wd.type === 'melee' || wd.type === 'shield') continue;
        if (d < (wd.range || 0) * 1.1) this.fire(slot, aimPos, pl);
      }
    }
    // 空戰導彈（敵對 AC）
    if (this.aam && (S.cd -= dt) <= 0 && this.aamCan(pl) && this.aamLaunch(pl))
      S.cd = rnd(AIR.NPC_AAM_CD[0], AIR.NPC_AAM_CD[1]) / sk;
  },
  // 留在空域裡、低空或前方有山時拉起、不超過高度上限（改 aim）
  airSafeAim(aim, fwd) {
    const lim = this.game.world.lim * 0.85;
    if (Math.abs(this.pos.x) > lim || Math.abs(this.pos.z) > lim)
      aim.set(-this.pos.x, 0, -this.pos.z).normalize().setY(0.1);
    const floor = Math.max(
      this.airFloor(this.pos.x, this.pos.z),
      this.airFloor(this.pos.x + fwd.x * 220, this.pos.z + fwd.z * 220),
    );
    if (this.pos.y - floor < AIR.AI_FLOOR) {
      aim.normalize();
      aim.y = Math.max(aim.y, clamp((AIR.AI_FLOOR - (this.pos.y - floor)) / AIR.AI_FLOOR, 0.2, 0.9));
    }
    if (this.pos.y > AIR.CEIL - 60) aim.y = Math.min(aim.y, -0.1);
  },
  // 第一波還沒察覺（airIdle＝{ c 巡邏的中心, a 角度, dir }）：繞著中心慢慢巡邏、不開火（game/air.js 的 airDirTick 叫醒）
  airPatrol(dt) {
    const I = this.airIdle;
    if (I.a === undefined) I.a = Math.atan2(this.pos.z - I.c.z, this.pos.x - I.c.x);
    I.a += dt * 0.16 * (I.dir || 1);
    const fwd = dirOf(this.yaw, this.airPit || 0, _f);
    const aim = _t.set(
      I.c.x + Math.cos(I.a + 0.5 * (I.dir || 1)) * AIR.PATROL_R - this.pos.x,
      I.c.y - this.pos.y,
      I.c.z + Math.sin(I.a + 0.5 * (I.dir || 1)) * AIR.PATROL_R - this.pos.z,
    );
    this.airSafeAim(aim, fwd);
    this.airAim = aim.clone();
    this.airIn = { thr: -0.4, side: 0 };
    this.move(dt, ZERO, false, false, false, null);
  },
  // 敵人瞄準飛行中的目標（B1）：[預判的倍率, 擴散的倍率]。目標直線飛越久越準；不在目標背後（咬尾）時預判差；越遠越散
  airAimK(t, dist) {
    const st = clamp((t.airSteady || 0) / AIR.AIM_STEADY, 0, 1);
    const tf = dirOf(t.yaw, t.airPit || 0, _a);
    const tail = tf.dot(_r.copy(this.center()).sub(t.center()).normalize()) < AIR.TAIL_DOT;
    const L = AIR.AIM_LEAD,
      P = AIR.AIM_SPREAD;
    return [
      (L[0] + (L[1] - L[0]) * st) * (tail ? 1 : AIR.AIM_SIDE),
      (P[0] + (P[1] - P[0]) * st) * (1 + dist / AIR.AIM_DIST),
    ];
  },
  // 敵人的雷射打飛行中的目標（B2）：先拉 BEAM_WARN 秒的預警線，之後射向預警時的位置；回傳 null＝這次不射
  airBeamGate(w, d, muzzle, t) {
    const W = w.airW,
      el = W ? this.t - W.t0 : 1e9;
    if (el < AIR.BEAM_WARN) return null;
    if (el < AIR.BEAM_WARN + (d.type === 'empbeam' ? 1.2 : 1)) {
      if (d.type !== 'empbeam') w.airW = null;
      return W.at.clone();
    }
    const at = t.center().addScaledVector(t.vel, AIR.BEAM_WARN * 0.5);
    w.airW = { t0: this.t, at };
    const end = muzzle.clone().add(
      at
        .clone()
        .sub(muzzle)
        .setLength(at.distanceTo(muzzle) * 0.6), // 只畫到 60%：目標往前飛時終點會跑到鏡頭旁邊，透視下變得很粗
    );
    this.game.fx.warnLine(muzzle.clone(), end, AIR.BEAM_WARN, 0xff3030, 0.06);
    return null;
  },
  // MS-4／MS-8 在空域的齊射（C3）：回傳鎖定的目標（可能是空陣列＝打目前的鎖定目標）；不是這兩把時回傳 null
  airMlTargets(d) {
    if (!this.air || !this.pilotEnt() || !AIR.ML_IDS.includes(d.id)) return null;
    return (this.airML || []).filter((x) => x.t >= AIR.ML_LOCK && !x.e.dead).map((x) => x.e);
  },
  // 轟炸機（第 3 期，airAI 呼叫）：飛到友軍雷達站上空 220 m 投下 4 枚炸彈，之後飛遠一點再回頭；不閃避、不開槍
  airBomberAI(dt) {
    const g = this.game,
      S = this.airAiS,
      B = g.airBase;
    const fwd = dirOf(this.yaw, this.airPit || 0, _f);
    const aim = _t.copy(fwd);
    if (B && !B.dead) {
      const bc = B.center();
      const alt = Math.max(bc.y + 220, this.airFloor(bc.x, bc.z) + 200);
      S.away = (S.away || 0) - dt;
      if (S.away > 0) aim.setY(0);
      else aim.set(bc.x - this.pos.x, alt - this.pos.y, bc.z - this.pos.z);
      const hd = Math.hypot(bc.x - this.pos.x, bc.z - this.pos.z);
      if (hd < 45 && S.away <= 0 && this.canAct()) {
        S.away = 9;
        const fall = Math.sqrt((2 * Math.max(20, this.pos.y - bc.y)) / BOMB_G);
        for (let i = 0; i < 4; i++) {
          const p0 = this.center().add(_a.set(rnd(-4, 4), -2 * this.scale, rnd(-4, 4)));
          const v = new THREE.Vector3(
            (bc.x - p0.x) / fall + rnd(-3, 3),
            0,
            (bc.z - p0.z) / fall + rnd(-3, 3),
          );
          g.projectiles.push(
            new Projectile(g, {
              pos: p0,
              vel: v,
              kind: 'shell',
              gravity: BOMB_G,
              dmg: B.maxHp * 0.07,
              impactV: 300,
              team: this.team,
              owner: this,
              color: 0xffa060,
              life: fall + 3,
              splash: 20, // 雷達站在坡上時，落在旁邊的也炸得到
              attr: 'exp',
            }),
          );
        }
        g.alertAll('轟炸機投彈！');
      }
    }
    const floor = Math.max(
      this.airFloor(this.pos.x, this.pos.z),
      this.airFloor(this.pos.x + fwd.x * 220, this.pos.z + fwd.z * 220),
    );
    if (this.pos.y - floor < AIR.AI_FLOOR) aim.normalize().y = 0.6;
    const lim = g.world.lim * 0.85;
    if (Math.abs(this.pos.x) > lim || Math.abs(this.pos.z) > lim) aim.set(-this.pos.x, 0, -this.pos.z);
    this.airAim = aim.clone();
    this.airIn = { thr: 0, side: 0 };
    this.move(dt, ZERO, false, false, false, null);
  },
  // 地面的防空（防空砲，aiSpecialFire 之前）與空中要塞：空域裡另外定期發射空戰導彈（被山擋住時不打）
  // o：{ r0 最近, r1 最遠, h 目標比自己高不到多少才打 }
  airSamTick(dt, pl, o = {}) {
    if (!pl || pl.dead || !pl.air) return;
    if (!this.aam) this.aamInit(999);
    this.aamTick(dt);
    const S = this.airAiS || (this.airAiS = { cd: rnd(3, 6) });
    if ((S.cd -= dt) > 0) return;
    S.cd = rnd(AIR.NPC_AAM_CD[0] + 2, AIR.NPC_AAM_CD[1] + 3);
    const me = this.center(),
      tc = pl.center();
    const dd = me.distanceTo(tc);
    if (dd > (o.r1 || AIR.AAM_R * 0.9) || dd < (o.r0 || 0)) return;
    if (o.h !== undefined && tc.y - me.y > o.h) return;
    if (this.game.world.losBlocked(me, tc)) return;
    // 地面的發射架沒有機首：直接朝目標
    const to = tc.sub(me);
    const y0 = this.yaw;
    this.yaw = Math.atan2(-to.x, -to.z);
    this.airPit = Math.atan2(to.y, Math.hypot(to.x, to.z));
    this.aamLaunch(pl);
    this.yaw = y0;
  },
  // 防空砲的範圍（A3）：目標在這裡面才發射空戰導彈（HUD 的「防空區」、紅色的網格圓頂）
  airFlakIn(pl) {
    const me = this.center(),
      tc = pl.center();
    const h = Math.hypot(tc.x - me.x, tc.z - me.z) / AIR.FLAK_SAM_R,
      v = Math.max(0, tc.y - me.y) / AIR.FLAK_SAM_H;
    return h * h + v * v < 1; // 圓頂（橢球）裡面
  },
  // ---------- 空中要塞（D，fortressAI 在空域呼叫；回傳後不投彈） ----------
  // 機首轉得很慢：主砲（預警線 → 光束）與彈幕（慢速大顆彈）只打前方 FZ_GUN_R 內；空戰導彈不打 FZ_SAM_MIN 內；
  // 懸吊砲塔不打正後方（mech-boss.js 的 partAI → airTurretOk）。所以貼近要塞的正後方或機腹＝安全區
  airFortressTick(dt, d, perp, wish, pl) {
    const g = this.game,
      S = this.airFz || (this.airFz = { cn: 5, br: 3, tur: -1 });
    const p2 = this.phase2();
    if (this.tierOn()) {
      const ts = this.tierState();
      if (ts.openT > 0) ts.openT -= dt; // 破綻的計時（空域不放 tierTick 的大招）
    }
    // 砲塔全毀：引擎失去掩護
    const tur = this.partsOf('fturret').length;
    if (S.tur > 0 && !tur) g.msgAll('懸吊砲塔全毀 — 引擎失去掩護', 0x7ee081);
    S.tur = tur;
    // 慢慢轉向目標（move 的轉向關掉：yawRate 很小）
    this.yawRate = 1e-4;
    const me = this.center(),
      tc = pl.center();
    const want = Math.atan2(-(tc.x - me.x), -(tc.z - me.z));
    const dy = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
    this.yaw += clamp(dy, -AIR.FZ_YAW * dt, AIR.FZ_YAW * dt);
    this.aimYaw = this.yaw;
    // 移動：遠的時候慢慢靠近，近了就橫移
    if (d > 450) wish.copy(tc.clone().sub(me).setY(0).normalize()).multiplyScalar(0.6);
    else wish.copy(perp).multiplyScalar(0.5);
    // 空戰導彈：遠距離也打，但很慢；貼近（FZ_SAM_MIN 內）不打
    this.airSamTick(dt * (p2 ? 1.4 : 1), pl, { r0: AIR.FZ_SAM_MIN });
    if (!this.canAct()) {
      S.ch = null;
      return;
    }
    const fwd = dirOf(this.yaw, 0, _f);
    const to = tc.clone().sub(me);
    const dd = to.length();
    const front = fwd.angleTo(_a.copy(to).setY(0)) < AIR.FZ_FRONT && dd < AIR.FZ_GUN_R;
    const nose = me.clone().addScaledVector(fwd, (this.radius || 6) + 4);
    // 主砲：預警線 FZ_CH 秒（方向在預警時就固定）→ 光束；之後短暫的破綻
    if (S.ch) {
      if ((S.ch.t -= dt) <= 0) {
        g.beamAttack(this, S.ch.from, S.ch.dir, {
          range: (AIR.FZ_GUN_R * 1.4) / g.fx.k,
          dmg: 2000 * this.dmgMul,
          im: 900 * this.dmgMul,
          w: 2.5,
          color: 0xff5040,
          width: 0.5,
        });
        g.fx.shockwave(S.ch.from, 6, 0xff7050, 0.4);
        SFX.play('laser2', 1, 0.5, 0.05, 0.05, S.ch.from);
        this.bossOpen(2.5);
        S.ch = null;
      }
      return;
    }
    if ((S.cn -= dt) <= 0 && front) {
      S.cn = AIR.FZ_CN[p2 ? 1 : 0];
      const at = tc.clone().addScaledVector(pl.vel, 0.35);
      const aimD = at.distanceTo(nose);
      const dir = at.sub(nose).normalize();
      S.ch = { t: AIR.FZ_CH, from: nose.clone(), dir };
      g.fx.warnLine(
        nose.clone(),
        nose.clone().addScaledVector(dir, aimD * 0.6), // 只畫到 60%（玩家往前飛時終點會跑到追尾鏡頭旁邊）
        AIR.FZ_CH,
        0xff3030,
        0.12,
      );
      g.alertAll('空中要塞主砲充能 — 離開紅線！');
      return;
    }
    // 彈幕：慢速、大顆的彈往前方扇形射出，從縫隙飛過去
    if ((S.br -= dt) <= 0 && front) {
      S.br = AIR.FZ_BR[p2 ? 1 : 0];
      const n = AIR.FZ_BAR_N[p2 ? 1 : 0];
      const base = to.clone().normalize();
      for (let i = 0; i < n; i++) {
        const k = n > 1 ? i / (n - 1) - 0.5 : 0;
        const v = base
          .clone()
          .applyAxisAngle(_Y, k * 1.0 + rnd(-0.03, 0.03))
          .add(_a.set(0, rnd(-0.08, 0.08), 0))
          .normalize()
          .multiplyScalar(AIR.FZ_BAR_V);
        g.projectiles.push(
          new Projectile(g, {
            pos: nose.clone(),
            vel: v,
            kind: 'shell',
            dmg: 300 * this.dmgMul,
            impactV: 300 * this.dmgMul,
            team: this.team,
            owner: this,
            color: 0xff60d0,
            life: (AIR.FZ_GUN_R * 1.3) / AIR.FZ_BAR_V,
            splash: 4,
            scale: 5,
            attr: 'en',
          }),
        );
      }
      g.fx.muzzle(nose, base, 0xff60d0, 3, 'bz');
      SFX.shot('shell', 'air_cannon', nose, this);
    }
  },
  // 懸吊砲塔（部位）在空域能不能打：不打正後方、太近（機腹）與射程外
  airTurretOk(par, pl) {
    if (!par || par.dead) return false;
    const me = this.center(),
      tc = pl.center();
    const dd = me.distanceTo(tc);
    const R = (this.weapons.rarm.def.range || 200) * 0.95;
    if (dd < AIR.FZ_MIN || dd > R) return false;
    const pf = dirOf(par.yaw, 0, _f);
    return pf.angleTo(_a.copy(tc).sub(par.center()).setY(0)) < AIR.FZ_REAR;
  },
  // 空域結束（離開任務、clearMission）
  airOff() {
    this.air = false;
    this.airAim = null;
    this.mesh.rotation.set(0, this.yaw, 0, 'YXZ');
  },
});
