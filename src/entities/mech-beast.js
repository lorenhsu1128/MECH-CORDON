// ---------- MechEntity 擴充：機獸（每章最後的大 Boss；docs/beast-design.md 的「接成敵人」）----------
// mech-boss4.js 的 boss4Move 不認得的 ai 轉到這裡：beastMove（ai 'beast'：自己算位置與朝向，不經過 move()，計時器在 bossTick）；
// beastFx（房主與客機，bossFx 呼叫）：把移動狀態與動作片段交給 render/beast-anim.js 的 animateBeast。
// 四足的走法：沿著自己的朝向前進、轉身有速度上限（不像機甲可以橫移）；遠了奔跑、近了繞著目標走，冷卻好了放一個動作片段。
// 同步：bossVis 的低 5 位＝動作片段的編號＋1（data/beasts.js 的 clips 的順序），客機自己算片段的時間、由位置的變化算步伐的速度。
import { SFX } from '../audio/audio.js';
import { clamp } from '../core/math.js';
import { DS, MS } from '../core/scale.js';
import { beastDefOf } from '../data/beasts.js';
import { animateBeast, clipDur } from '../render/beast-anim.js';
import { MechEntity } from './mech-entity.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

Object.assign(MechEntity.prototype, {
  beastInfo() {
    return this.beastDef || (this.beastDef = beastDefOf(this.opts.bossKind));
  },
  // 開始一個動作片段（房主）
  beastClip(name) {
    const s = this.aiState;
    s.clip = name;
    s.clipT = 0;
    s.rf = 0;
    s.hitDone = false;
    const B = this.beastInfo();
    const M = B && B.melee && B.melee[name];
    if (M) {
      // 地面的預警（出手時長滿）＋目標玩家的紅色「!」（彈刀／完美 QB 的提示）
      const g = this.game,
        c = this.beastSpot(M);
      if (M.path) g.fx.warnPath(this.pos.clone(), c, M.R * 2 * this.beastK(), M.t, 0xff4020);
      else g.fx.warnCircle(c, M.R * this.beastK(), M.t, 0xff4020);
      const pl = this.aiState.tgt;
      if (pl && !pl.dead && this.atkCue) this.atkCue(pl, M.t, 0.3);
    }
  },
  // 體型的倍率（模型的公尺 → 實際的公尺）
  beastK() {
    const rig = this.model && this.model.beast;
    return (rig && rig.group.scale.x) || 1;
  },
  // 近戰判定圓的中心（地面）
  beastSpot(M) {
    const k = this.beastK(),
      y = this.yaw;
    const x = this.pos.x - Math.sin(y) * M.f * k - Math.cos(y) * M.side * k,
      z = this.pos.z - Math.cos(y) * M.f * k + Math.sin(y) * M.side * k;
    return V(x, this.game.world.groundAt(x, z, this.pos.y + 2 * MS), z);
  },
  // 近戰出手：判定圓裡、離地不太高的敵對機體受傷並被打飛（房主）
  beastStrike(M) {
    const g = this.game,
      k = this.beastK(),
      dm = this.dmgMul;
    const c = this.beastSpot(M);
    let hit = false;
    for (const t of g.hostilesOfEnt(this)) {
      if (!t || t.dead || !t.pos || t.pos.y - c.y > M.high * k) continue;
      const dx = t.pos.x - c.x,
        dz = t.pos.z - c.z;
      if (Math.hypot(dx, dz) > M.R * k + (t.radius || 0) * 0.6) continue;
      const dir = V(t.pos.x - this.pos.x, 0, t.pos.z - this.pos.z);
      if (dir.lengthSq() < 1e-4) dir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      dir.normalize();
      t.takeDamage(M.dmg * dm, M.im * dm, this, t.center(), dir.clone(), undefined, undefined, 'kin');
      if (t.vel && !t.dead) {
        t.vel.addScaledVector(dir, M.kb || 0);
        if (M.up) {
          t.vel.y = Math.max(t.vel.y, M.up);
          t.grounded = false;
        }
      }
      hit = true;
    }
    g.fx.dust && g.fx.dust(c, M.R * k * 0.5);
    g.camShake = Math.max(g.camShake || 0, hit ? 0.35 : 0.15);
    SFX.play('heavy', hit ? 0.8 : 0.5, 0.8, 0.05, 0.05, c);
  },
  // ---------- 三把武器（房主）----------
  // 磁軌砲的砲口（世界座標）
  beastGunPos() {
    const N = this.model.beast.nodes;
    const p = V(0, 0, 0);
    (N.guns || N.chest).getWorldPosition(p);
    return p;
  },
  beastRanged(dt, d, pl) {
    const B = this.beastInfo(),
      s = this.aiState,
      g = this.game;
    // 磁軌砲進行中：先瞄準（砲塔跟著目標）→ 鎖住方向並畫預警線 → 發射
    const R = s.rail;
    if (R) {
      R.t += dt;
      const C = B.rail;
      const mz = this.beastGunPos();
      if (!R.dir) {
        const tp = pl.center().addScaledVector(pl.vel, 0.12);
        this.bx = [
          wrap(yawTo(this.pos, tp) - this.yaw),
          Math.atan2(tp.y - mz.y, Math.hypot(tp.x - mz.x, tp.z - mz.z)),
        ];
        if (R.t >= C.track) {
          R.dir = tp.sub(mz).normalize();
          g.fx.warnLine(mz, mz.clone().addScaledVector(R.dir, C.range * DS), C.warn, 0xffd060, 0.14);
          SFX.play('charge', 0.6, 1.2, 0.02, 0.02, mz);
        }
      } else if (R.t >= C.track + C.warn) {
        if (this.canAct())
          g.beamAttack(this, mz, R.dir, {
            range: C.range,
            dmg: C.dmg * this.dmgMul,
            im: C.im * this.dmgMul,
            w: 0.8,
            color: 0xfff2c0,
            width: 0.3,
            attr: 'kin',
          });
        SFX.play('heavy', 0.9, 1.3, 0.03, 0.03, mz);
        g.camShake = Math.max(g.camShake || 0, 0.25);
        s.rail = null;
        s.rCd = 3.5 + Math.random() * 2;
      }
      if (!this.canAct()) s.rail = null;
      return;
    }
    this.bx = null;
    s.rCd = (s.rCd === undefined ? 4 : s.rCd) - dt;
    if (s.rCd > 0 || s.clip || !this.canAct() || s.go > 0) return;
    const far = d > 28 * DS;
    const r = Math.random();
    if (far ? r < 0.45 : r < 0.2) {
      s.rail = { t: 0, dir: null };
    } else if (far ? r < 0.8 : r < 0.65) {
      // 導彈莢艙：左右各一輪（asm 的肩上武器）
      this.b3Volley(pl, B.missile.n, B.missile.gap, ['rback', 'lback']);
      s.rCd = 4 + Math.random() * 2;
    } else {
      // 鬃甲的雷射陣列：咆哮（鬃甲張開）＋扇形光束
      this.beastClip('roar');
      // 扇形（同 mech-boss3.js 的 b3Fan，傷害照定義）：從頭的高度朝目標 n 道，預警 1.1 秒
      const from = this.center();
      const d0 = pl.center().sub(from);
      const yw = Math.atan2(d0.x, d0.z),
        pt = Math.atan2(d0.y, Math.hypot(d0.x, d0.z) || 1);
      for (let i = 0; i < B.mane.n; i++) {
        const y = yw + (i - (B.mane.n - 1) / 2) * B.mane.step;
        this.b3Beam(
          from.clone(),
          V(Math.sin(y) * Math.cos(pt), Math.sin(pt), Math.cos(y) * Math.cos(pt)),
          1.1,
          {
            range: 120,
            dmg: B.mane.dmg,
            im: B.mane.im,
          },
        );
      }
      s.rCd = 5 + Math.random() * 2;
    }
  },
  beastMove(dt, d, dir, perp, wish, pl, r) {
    if (this.ai !== 'beast') return null;
    const B = this.beastInfo();
    if (!B) return null;
    const s = this.aiState,
      w = this.game.world;
    wish.set(0, 0, 0);
    if (s.bCd === undefined) {
      s.bCd = 2.5;
      s.orb = Math.random() < 0.5 ? 1 : -1;
      s.spd = 0;
      s.orbT = 6;
    }
    s.tgt = pl; // 近戰提示的對象
    const tyaw = yawTo(this.pos, pl.pos);
    const off = wrap(tyaw - this.yaw); // 目標在我的哪一邊（正＝左）
    let goalSpd = 0,
      turn = 0,
      fwdStep = 0;
    if (!this.canAct()) {
      // 失衡：站不穩（片段播完停在最後的姿勢）
      if (s.clip !== 'stagger') this.beastClip('stagger');
      s.clipT += dt;
    } else if (s.clip === 'stagger') {
      s.clip = null;
      s.bCd = 1.2;
    } else if (s.clip) {
      // 動作片段中：不走；片段自己的前進量（撲擊）照 rootF 的變化移動
      s.clipT += dt;
      const rig = this.model.beast;
      const rf = ((rig && rig.rootF) || 0) * ((rig && rig.group.scale.x) || 1);
      fwdStep = rf - (s.rf || 0);
      s.rf = rf;
      if (s.clipT < 0.25) turn = clamp(off, -1, 1) * B.turn * 1.5; // 出手前還會對準
      const M = B.melee && B.melee[s.clip];
      if (M && !s.hitDone && s.clipT >= M.t) {
        s.hitDone = true;
        this.beastStrike(M);
      }
      if (s.clipT >= clipDur(s.clip)) {
        s.clip = null;
        s.bCd = 0.9 + Math.random() * 0.9;
      }
    } else {
      // 走位：遠了直接追；近了繞著目標走（每隔一陣子換方向）
      s.orbT -= dt;
      if (s.orbT <= 0) {
        s.orbT = 5 + Math.random() * 5;
        s.orb *= -1;
      }
      const want = B.wantDist * DS;
      s.bCd -= dt;
      // 冷卻好了：不再繞，直接衝向目標找出手的機會（最多 3.5 秒）
      if (s.bCd <= 0 && !(s.go > 0)) s.go = 3.5;
      let head = tyaw;
      if (!(s.go > 0) && d < want * 2.2) head = tyaw + s.orb * (d < want ? 1.9 : 1.2);
      const err = wrap(head - this.yaw);
      goalSpd = d > 30 * DS ? B.run : d > 12 * DS || s.go > 0 ? B.trot : B.walk;
      // 轉彎半徑＝速度÷轉身速度：方向差得多時先慢下來（差越多越慢），貼近目標要出手時也放慢，低速時轉得更快
      goalSpd *= clamp(1.25 - Math.abs(err) * 0.9, 0.12, 1);
      if (s.go > 0 && d < this.radius + (pl.radius || 0) + 10) goalSpd = Math.min(goalSpd, B.walk * 0.6);
      turn = clamp(err * 4, -1, 1) * B.turn * (1 + 1.6 * (1 - Math.min(1, s.spd / B.run)));
      if (s.go > 0) {
        s.go -= dt;
        // 出手的距離是實際的公尺（機獸的模型不乘建模倍率）
        const a = Math.abs(off),
          R = this.radius + (pl.radius || 0);
        let c = null;
        if (d < R + 7 && a > 2.2) c = 'tail';
        else if (d < R + 5 && a < 0.6) c = Math.random() < 0.4 ? 'bite' : off > 0 ? 'clawL' : 'clawR';
        else if (d > R + 9 && d < R + 26 && a < 0.3 && s.go < 3) c = 'pounce';
        if (c) {
          this.beastClip(c);
          s.go = 0;
        } else if (s.go <= 0) s.bCd = 1;
      }
    }
    // 速度與位置
    s.spd += clamp(goalSpd - s.spd, -B.dec * dt, B.acc * dt);
    if (s.clip) s.spd = Math.max(0, s.spd - B.dec * 1.5 * dt);
    this.yaw = wrap(this.yaw + turn * dt);
    this.aimYaw = this.yaw;
    const step = s.spd * dt + fwdStep;
    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    const px = this.pos.x,
      pz = this.pos.z;
    if (step) {
      const [cx, cz] = w.collide(px + fx * step, pz + fz * step, this.pos.y, this.radius * 0.8);
      const lim = w.lim - 3 * MS;
      this.pos.x = clamp(cx, -lim, lim);
      this.pos.z = clamp(cz, -lim, lim);
      // 被擋住（實際走的不到該走的三成）：累積 0.35 秒就換繞行的方向並往旁邊轉開一陣子
      const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
      s.blk = moved < Math.abs(step) * 0.3 && Math.abs(step) > 0.02 ? (s.blk || 0) + dt : 0;
      if (s.blk > 0.35) {
        s.blk = 0;
        s.orb *= -1;
        s.avoid = 0.7;
        s.go = 0;
      }
      // 路上的可破壞物件直接撞碎（每 0.15 秒檢查一次前方）
      s.smT = (s.smT || 0) - dt;
      if (s.smT <= 0 && s.spd > B.walk * 0.5) {
        s.smT = 0.15;
        const g = this.game;
        const fp = V(this.pos.x + fx * this.radius, this.pos.y, this.pos.z + fz * this.radius);
        for (const q of g.destructibles()) {
          if (!q.isProp || q.dead || !q.center) continue;
          if (q.center().setY(fp.y).distanceTo(fp) < this.radius + (q.radius || 1))
            g.damageProp(q, 1e5, 2000, q.center(), this, 'none');
        }
      }
    }
    if (s.avoid > 0) {
      s.avoid -= dt;
      this.yaw = wrap(this.yaw + s.orb * B.turn * 1.2 * dt);
    }
    this.pos.y = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6 * MS); // 只跨得上矮的東西，高的由碰撞擋住
    const ci = s.clip ? B.clips.indexOf(s.clip) + 1 : 0;
    this.bossVis = ((this.bossVis || 0) & ~31) | ci;
    this.beastRanged(dt, d, pl);
    this.bossTick(dt);
    if (dt > 0) this.vel.set((this.pos.x - px) / dt, 0, (this.pos.z - pz) / dt);
    this.grounded = true;
    r.done = true;
    return r;
  },
  beastFx(dt) {
    const rig = this.model && this.model.beast;
    if (!rig || !(dt > 0)) return;
    const B = this.beastInfo();
    const F =
      this.bf || (this.bf = { x: this.pos.x, z: this.pos.z, yaw: this.yaw, v: 0, w: 0, ci: 0, ct: 0, t: 0 });
    F.t += dt;
    // 步伐的速度：位置沿著朝向的變化（客機也一樣算）
    const fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    const k = Math.min(1, dt * 10);
    F.v += (((this.pos.x - F.x) * fx + (this.pos.z - F.z) * fz) / dt - F.v) * k;
    F.w += (wrap(this.yaw - F.yaw) / dt - F.w) * k;
    F.x = this.pos.x;
    F.z = this.pos.z;
    F.yaw = this.yaw;
    let ci = (this.bossVis || 0) & 31;
    if (this.dead && B) ci = B.clips.indexOf('death') + 1;
    if (ci !== F.ci) {
      F.ci = ci;
      F.ct = 0;
    } else F.ct += dt;
    const name = ci && B ? B.clips[ci - 1] : null;
    const sc = rig.group.scale.x || 1;
    animateBeast(
      rig,
      {
        t: F.t,
        v: name ? 0 : F.v / sc,
        w: name ? 0 : F.w,
        act: name ? { name, t: F.ct } : null,
        aim: this.bx && this.bx.length >= 2 ? [this.bx[0], this.bx[1]] : null,
      },
      dt,
    );
    this.mesh.position.y = this.pos.y + (rig.rootY || 0) * sc;
    this.mesh.rotation.y = this.yaw + (rig.rootYaw || 0);
  },
});
