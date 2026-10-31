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
    const yaw0 = this.yaw;
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
    SFX.shot('missile', undefined, this.isPlayer ? null : pos);
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
  airAI(dt, pl, aimPos) {
    const g = this.game,
      w = g.world;
    const S = this.airAiS || (this.airAiS = { cd: 3, ext: 0, side: 1, rollCD: 0, sideT: 0, sv: 0 });
    if (this.airRole === 'bomber') return this.airBomberAI(dt);
    // 友軍雷達站只有轟炸機去炸；其他的一律追玩家
    if (pl && pl.ai === 'objective') {
      pl = g.player && !g.player.dead ? g.player : null;
      aimPos = pl ? pl.center() : null;
    }
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
      // 前置量：照彈速（或撞上來）的飛行時間
      const lead = clamp(d / (this.airRole === 'kami' ? 160 : 260), 0, 1.6);
      aim
        .copy(tc)
        .addScaledVector(pl.vel, lead * 0.7)
        .sub(me);
      if (this.airRole === 'kami') {
        thr = 1;
        if (d < 10 * this.scale + (this.radius || 2)) {
          this.die(pl);
          return;
        }
      } else {
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
        // 偶爾橫移，不要一直直線飛
        if ((S.sideT -= dt) <= 0) {
          S.sideT = rnd(1.5, 3.5);
          S.sv = Math.random() < 0.5 ? rnd(-1, 1) : 0;
        }
        side = S.sv;
      }
    }
    // 留在空域裡
    const lim = w.lim * 0.85;
    if (Math.abs(this.pos.x) > lim || Math.abs(this.pos.z) > lim)
      aim.set(-this.pos.x, 0, -this.pos.z).normalize().setY(0.1);
    // 低空或前方有山：拉起
    const floor = Math.max(
      this.airFloor(this.pos.x, this.pos.z),
      this.airFloor(this.pos.x + fwd.x * 220, this.pos.z + fwd.z * 220),
    );
    if (this.pos.y - floor < AIR.AI_FLOOR) {
      aim.normalize();
      aim.y = Math.max(aim.y, clamp((AIR.AI_FLOOR - (this.pos.y - floor)) / AIR.AI_FLOOR, 0.2, 0.9));
    }
    if (this.pos.y > AIR.CEIL - 60) aim.y = Math.min(aim.y, -0.1);
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
    if (!pl || pl.dead) return;
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
    if (this.aam) {
      this.aamTick(dt);
      if ((S.cd -= dt) <= 0 && this.aamCan(pl) && this.aamLaunch(pl))
        S.cd = rnd(AIR.NPC_AAM_CD[0], AIR.NPC_AAM_CD[1]) / sk;
    }
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
  // 地面的防空（防空砲，aiSpecialFire 之前）：空域裡另外定期發射空戰導彈（被山擋住時不打）
  airSamTick(dt, pl) {
    if (!pl || pl.dead || !pl.air) return;
    if (!this.aam) this.aamInit(999);
    this.aamTick(dt);
    const S = this.airAiS || (this.airAiS = { cd: rnd(3, 6) });
    if ((S.cd -= dt) > 0) return;
    S.cd = rnd(AIR.NPC_AAM_CD[0] + 2, AIR.NPC_AAM_CD[1] + 3);
    const me = this.center(),
      tc = pl.center();
    if (me.distanceTo(tc) > AIR.AAM_R * 0.9 || this.game.world.losBlocked(me, tc)) return;
    // 地面的發射架沒有機首：直接朝目標
    const to = tc.sub(me);
    const y0 = this.yaw;
    this.yaw = Math.atan2(-to.x, -to.z);
    this.airPit = Math.atan2(to.y, Math.hypot(to.x, to.z));
    this.aamLaunch(pl);
    this.yaw = y0;
  },
  // 空域結束（離開任務、clearMission）
  airOff() {
    this.air = false;
    this.airAim = null;
    this.mesh.rotation.set(0, this.yaw, 0, 'YXZ');
  },
});
