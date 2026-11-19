// ---------- MechEntity 擴充：機獸（每章最後的大 Boss；docs/beast-design.md 的「接成敵人」）----------
// mech-boss4.js 的 boss4Move 不認得的 ai 轉到這裡：beastMove（ai 'beast'：自己算位置與朝向，不經過 move()，計時器在 bossTick）；
// beastFx（房主與客機，bossFx 呼叫）：把移動狀態與動作片段交給 render/beast-anim.js 的 animateBeast。
// 四足的走法：沿著自己的朝向前進、轉身有速度上限（不像機甲可以橫移）；遠了奔跑、近了繞著目標走，冷卻好了放一個動作片段。
// 同步：bossVis 的低 5 位＝動作片段的編號＋1（data/beasts.js 的 clips 的順序），客機自己算片段的時間、由位置的變化算步伐的速度。
import { clamp } from '../core/math.js';
import { DS, MS } from '../core/scale.js';
import { beastDefOf } from '../data/beasts.js';
import { animateBeast, clipDur } from '../render/beast-anim.js';
import { MechEntity } from './mech-entity.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

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
        else if (s.go <= 0) c = d > R + 26 ? 'roar' : null;
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
    }
    this.pos.y = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6 * MS); // 只跨得上矮的東西，高的由碰撞擋住
    const ci = s.clip ? B.clips.indexOf(s.clip) + 1 : 0;
    this.bossVis = ((this.bossVis || 0) & ~31) | ci;
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
      },
      dt,
    );
    this.mesh.position.y = this.pos.y + (rig.rootY || 0) * sc;
    this.mesh.rotation.y = this.yaw + (rig.rootYaw || 0);
  },
});
