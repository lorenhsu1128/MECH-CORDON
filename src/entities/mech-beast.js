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
const PARRY_FLINCH = 0.9, // 被彈刀：踉蹌的秒數
  PARRY_OPEN = 1.8; // 之後破綻的秒數
const LIVE_WARN = 0.32; // live 的近戰招式：出手前幾秒畫地面的預警

const _dgZ = new THREE.Vector3(); // 閃避的 dgMove 不用的移動

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
    s.rs = 0;
    s.hitDone = false;
    const B = this.beastInfo();
    const M = B && B.melee && B.melee[name];
    s.spot = null;
    s.warned = false;
    s.hitSet = null;
    s.hitN = 0;
    if (M) {
      // 目標玩家的紅色「!」（彈刀／完美 QB 的提示）；地面的預警：一般的招式現在就畫（出手時長滿），判定用這時候算好的位置；
      // live 的招式（先閃到旁邊再出手）等到出手前才知道打哪裡，beastMove 在出手前 LIVE_WARN 秒畫
      if (!M.live && !M.hits) this.beastWarn(M, M.t);
      const pl = this.aiState.tgt;
      if (pl && !pl.dead && this.atkCue) this.atkCue(pl, M.t, 0.3);
    }
  },
  // 開始一招近戰（AI 與冒煙測試都從這裡）：一般的＝播片段；leap＝鑽進地下、從目標腳下鑽出來（沿用躍過障礙物的移動，落地時判定）
  beastMelee(k, pl) {
    const B = this.beastInfo(),
      s = this.aiState,
      M = B.melee[k];
    if (!M.leap) return this.beastClip(k);
    const d = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
    this.beastLeap(pl, d + this.radius + (pl.radius || 0) + 6, yawTo(this.pos, pl.pos), M, k);
    if (!s.leap) return;
    s.spot = V(s.leap.x1, s.leap.y1, s.leap.z1);
    s.warned = true;
    this.game.fx.warnCircle(s.spot.clone(), M.R * this.beastK(), s.leap.dur, 0xff4020);
    if (this.atkCue) this.atkCue(pl, s.leap.dur, 0.3);
  },
  beastWarn(M, sec) {
    const s = this.aiState,
      g = this.game,
      c = this.beastSpot(M);
    s.spot = c;
    s.warned = true;
    if (M.path) g.fx.warnPath(this.pos.clone(), c, M.R * 2 * this.beastK(), sec, 0xff4020);
    else g.fx.warnCircle(c, M.R * this.beastK(), sec, 0xff4020);
  },
  // 躍過障礙物：朝目標跳一段（最多 45 m，落在目標前方），途中不碰撞
  beastLeap(pl, d, tyaw, M, clip) {
    const s = this.aiState,
      w = this.game.world,
      lim = w.lim - 3 * MS;
    const far = Math.max(12, Math.min(d - this.radius - (pl.radius || 0) - 6, 45));
    const tx = clamp(this.pos.x + ((pl.pos.x - this.pos.x) / (d || 1)) * far, -lim, lim),
      tz = clamp(this.pos.z + ((pl.pos.z - this.pos.z) / (d || 1)) * far, -lim, lim);
    const [lx, lz] = w.collide(tx, tz, pl.pos.y, this.radius * 0.8);
    if (w.isVoid && w.isVoid(lx, lz)) return; // 落點是虛空：不跳
    s.leap = {
      t: 0,
      dur: M ? M.t : this.beastInfo().leapT || clipDur(this.beastInfo().jump || 'jump') * 0.75,
      M: M || null,
      x0: this.pos.x,
      z0: this.pos.z,
      y0: this.pos.y,
      x1: lx,
      z1: lz,
      y1: w.groundAt(lx, lz, pl.pos.y + 2 * MS),
      h: (M ? 0 : this.beastInfo().leapH === undefined ? 9 : this.beastInfo().leapH) * this.beastK(), // 鑽地的不走拋物線
      yaw: tyaw,
    };
    this.beastClip(clip || this.beastInfo().jump || 'jump');
    s.pT = 0;
  },
  // 換型態時修復一次：被打壞的外掛武器重新裝上（使用者定案；之後再打壞就不修了）
  beastRepair() {
    const s = this.aiState;
    const ph = this.bossPhase ? this.bossPhase() : 1;
    if (s.ph === undefined) s.ph = ph;
    if (ph === s.ph) return;
    s.ph = ph;
    if (s.repaired || !this.tierOn()) return;
    const kit = this.tierKit();
    const lost = (kit.parts || []).filter((sp) => sp.flag && this.tierFlag(sp.flag));
    if (!lost.length) return;
    s.repaired = true;
    for (const sp of lost) this.game.tierSpawnPart(this, sp, true);
    this.bossSnd('repair', 1);
    this.game.flashAlert && this.game.flashAlert('機獸修復了被打壞的武器');
  },
  // 命中的形狀（world/prop-hit.js 的 targetSegT／targetDist）：沿著身體的幾顆球；不是機獸時回傳 null（照原本的外接球）
  hitBalls() {
    if (this.ai !== 'beast') return null;
    const B = this.beastInfo();
    if (!B || !B.balls || !this.model || !this.model.beast) return null;
    const out = this.beastHb || (this.beastHb = B.balls.map(() => ({ x: 0, y: 0, z: 0, r: 0 })));
    const k = this.beastK(),
      fx = -Math.sin(this.yaw),
      fz = -Math.cos(this.yaw);
    for (let i = 0; i < out.length; i++) {
      const [f, y, r, sd = 0] = B.balls[i]; // sd＝左右的偏移（正＝左；翼）
      out[i].x = this.pos.x + fx * f * k + fz * sd * k;
      out[i].y = this.pos.y + y * k;
      out[i].z = this.pos.z + fz * f * k - fx * sd * k;
      out[i].r = r * k;
    }
    return out;
  },
  // 擊破的演出：先播擊破的片段（倒下、光熄滅）、身上冒火花，播完才碎裂（die／dieVisual 呼叫）
  beastCollapse(end) {
    const g = this.game;
    const T = clipDur(this.beastInfo().death || 'death') + 0.5;
    let acc = 0;
    g.fx.task(
      T,
      (e, t, dt) => {
        this.beastFx(dt);
        acc += dt;
        if (acc > 0.12) {
          acc = 0;
          const B = this.hitBalls();
          const c = B ? B[Math.floor(Math.random() * B.length)] : null;
          if (c) g.fx.spark(new THREE.Vector3(c.x, c.y, c.z), 0xffb040);
        }
      },
      () => {
        this.bossSnd('collapse', 1.2, undefined, 0.5, true); // 倒下後的碎裂（各端自己算，自製音效）
        end();
      },
    );
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
  // ram＝衝撞中（撲擊在空中的那一段）：判定跟著身體的前半走，撞到誰就算（否則身體先把目標推開，落地時判定圓裡已經沒有人）
  beastStrike(M, ram) {
    const g = this.game,
      s = this.aiState,
      k = this.beastK(),
      dm = this.dmgMul * this.bodyMeleeK(s.clip); // 前爪壞了爪擊變弱…（mech-body.js）
    const hs = s.hitSet || (s.hitSet = new Set());
    const c = ram
      ? V(
          this.pos.x - Math.sin(this.yaw) * this.radius * 0.7,
          this.pos.y,
          this.pos.z - Math.cos(this.yaw) * this.radius * 0.7,
        )
      : s.spot || this.beastSpot(M); // 預警畫在哪裡就打哪裡
    const R = ram ? this.radius : M.R * k;
    let hit = false,
      parried = false;
    for (const t of g.hostilesOfEnt(this)) {
      if (!t || t.dead || !t.pos || hs.has(t) || t.pos.y - c.y > M.high * k) continue;
      const dx = t.pos.x - c.x,
        dz = t.pos.z - c.z;
      if (Math.hypot(dx, dz) > R + (t.radius || 0) * 0.6) continue;
      hs.add(t);
      // 彈刀（docs/melee-combo-design.md）：玩家在紅色「!」之後按了近戰、或自己的近戰正對著打過來＝這一下彈開、不受傷。
      // 一般的招式被彈開就中斷、踉蹌一下露出破綻；整隻撞過來的（衝撞、撲擊、鑽出）彈得開但牠不會停
      if (t.meleeClash && t.melee && t.meleeClash(this)) {
        this.hitStunT = 0; // meleeClash 給的硬直由機獸自己的踉蹌處理（機獸不經過 move()，不會倒數）
        if (!ram && M.ram === undefined && !M.leap) parried = true;
        continue;
      }
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
    if (parried) {
      s.flinch = PARRY_FLINCH;
      s.hitDone = true;
      s.hitN = 99; // 連打剩下的幾下不打了
      this.bossOpen(PARRY_OPEN, true);
    }
    // 出手的特效與聲音在 beastLocalFx（mech-beast-fx.js：房主與客機各自算）
  },
  // ---------- 三把武器（房主）----------
  // 磁軌砲的砲口（世界座標）
  beastGunPos() {
    const N = this.model.beast.nodes;
    const p = V(0, 0, 0);
    (N.guns || N.chest).getWorldPosition(p);
    return p;
  },
  // 這把武器還能不能用（負責它的部位全部被打壞了＝不能）
  beastGunOk(G) {
    const f = G.flags || (G.flag ? [G.flag] : []);
    return !f.length || f.some((k) => !this.tierFlag(k));
  },
  // 用 asm 的武器槽射一發（不管冷卻與彈匣）
  beastFire(slot, pl) {
    const w = this.weapons[slot];
    if (!w || !w.def || w.def.type === 'none' || w.tierOff) return;
    w.cd = 0;
    if (w.mag <= 0) w.mag = Math.max(1, Math.min(w.def.mag || 1, w.ammo || 1));
    this.fire(slot, pl.center().addScaledVector(pl.vel, 0.15), pl);
  },
  // 瞄準（砲塔跟著目標）：bx＝[偏航, 俯仰]，隨快照給客機，beastFx 轉砲塔
  beastAim(tp, from) {
    this.bx = [
      wrap(yawTo(this.pos, tp) - this.yaw),
      Math.atan2(tp.y - from.y, Math.hypot(tp.x - from.x, tp.z - from.z)),
    ];
  },
  beastRanged(dt, d, pl) {
    const B = this.beastInfo(),
      s = this.aiState,
      g = this.game;
    const A = s.gun; // 進行中的武器（rail／burst）
    if (A) {
      const G = A.G;
      A.t += dt;
      if (!this.canAct() || !this.beastGunOk(G)) {
        // 失衡或這把武器被打壞：中斷
        s.gun = null;
        this.bx = null;
        return;
      }
      const end = () => {
        s.gun = null;
        s.rCd = G.cd[0] + Math.random() * G.cd[1];
      };
      if (G.type === 'rail') {
        // 砲塔先跟著目標 → 鎖住方向並畫預警線 → 貫穿
        const mz = this.beastGunPos();
        if (!A.dir) {
          const tp = pl.center().addScaledVector(pl.vel, 0.12);
          this.beastAim(tp, mz);
          if (A.t >= G.track) {
            A.dir = tp.sub(mz).normalize();
            g.fx.warnLine(mz, mz.clone().addScaledVector(A.dir, G.range * DS), G.warn, 0xffd060, 0.14);
            if (!this.bossSnd('rail_lock', 0.8, mz)) SFX.play('charge', 0.6, 1.2, 0.02, 0.02, mz);
          }
        } else if (A.t >= G.track + G.warn) {
          g.beamAttack(this, mz, A.dir, {
            range: G.range,
            dmg: G.dmg * this.dmgMul,
            im: G.im * this.dmgMul,
            w: 0.8,
            color: 0xfff2c0,
            width: 0.3,
            attr: G.attr || 'en',
          });
          if (!this.bossSnd('rail_fire', 1, mz)) SFX.play('heavy', 0.9, 1.3, 0.03, 0.03, mz);
          g.camShake = Math.max(g.camShake || 0, 0.25);
          end();
        }
      } else if (G.type === 'burst') {
        // 邊移動邊點放：砲塔跟著目標
        this.beastAim(pl.center(), this.center());
        while (A.t >= A.next && A.next < G.dur) {
          for (const k of G.slots || [G.slot]) this.beastFire(k, pl);
          A.next += G.gap;
        }
        if (A.t >= G.dur) end();
      } else if (G.type === 'cone') {
        // 火焰錐（配合片段：t0～t1 噴）：每 tick 秒打前方 len 公尺、半角 ang 以內的目標
        if (A.t >= G.t1) end();
        else if (A.t >= G.t0 && A.t >= A.next) {
          A.next = A.t + G.tick;
          const k = this.beastK();
          const dir = V(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
          const from = V(this.pos.x, this.pos.y + G.y * k, this.pos.z).addScaledVector(dir, G.f * k);
          if (!G.noFx) g.fx.flameCone(from, dir, G.len, G.ang);
          if (!A.snd) A.snd = this.bossSnd(G.id, 0.9, from, 0.3) || 1; // 火焰錐、強風：噴出的那一下
          for (const t of g.hostilesOfEnt(this)) {
            if (!t || t.dead || !t.center) continue;
            const ap = t.center().sub(from);
            const L = ap.length();
            if (L > G.len + (t.radius || 0) || ap.normalize().dot(dir) < Math.cos(G.ang)) continue;
            t.takeDamage(
              G.dps * G.tick * this.dmgMul,
              G.ips * G.tick * this.dmgMul,
              this,
              t.center(),
              dir.clone(),
              undefined,
              undefined,
              G.attr || 'en',
            );
            if (G.push && t.vel && !t.dead) t.vel.addScaledVector(dir, G.push); // 強風：往外推
          }
        }
      } else end();
      return;
    }
    this.bx = null;
    s.rCd = (s.rCd === undefined ? 4 : s.rCd) - dt;
    if (s.rCd > 0 || s.clip || !this.canAct() || s.go > 0) return;
    const far = d > 28 * DS;
    const list = (B.guns || []).filter(
      (G) =>
        this.beastGunOk(G) &&
        (far ? G.far : G.near) > 0 &&
        (G.air === undefined || !B.fly || !!G.air === !!s.air),
    );
    if (!list.length) {
      s.rCd = 2;
      return;
    }
    let r = Math.random() * list.reduce((a, G) => a + (far ? G.far : G.near), 0);
    let G = list[0];
    for (const q of list) {
      r -= far ? q.far : q.near;
      if (r <= 0) {
        G = q;
        break;
      }
    }
    this.beastGunStart(G, pl);
  },
  // 開始放一把武器（beastRanged 選好之後呼叫；冒煙測試也直接呼叫）
  beastGunStart(G, pl) {
    const s = this.aiState,
      g = this.game;
    const cd = () => (s.rCd = G.cd[0] + Math.random() * G.cd[1]);
    if (G.clip) {
      this.beastClip(G.clip);
      s.clipOpen = G.open || 0;
    }
    if (G.type === 'rail' || G.type === 'burst' || G.type === 'cone') s.gun = { G, t: 0, dir: null, next: 0 };
    else if (G.type === 'volley') {
      this.bossSnd(G.id, 0.9); // 魚雷…：疊在武器本身的槍聲上（自製音效）
      this.b3Volley(pl, G.n, G.gap, G.slots);
      cd();
    } else if (G.type === 'fan') {
      // 扇形（同 mech-boss3.js 的 b3Fan，傷害照定義）：從身體的高度朝目標 n 道，預警 1.1 秒
      const from = this.center();
      const d0 = pl.center().sub(from);
      const yw = Math.atan2(d0.x, d0.z),
        pt = Math.atan2(d0.y, Math.hypot(d0.x, d0.z) || 1);
      const fn = this.bodyOf('gunN', G.id, G.n); // 身體區域壞了發數變少（鬃甲，mech-body.js）
      for (let i = 0; i < fn; i++) {
        // full＝朝四面八方一整圈（背甲的刺彈）；否則以目標為中心、間隔 step
        const y = G.full ? yw + (i / fn) * Math.PI * 2 : yw + (i - (fn - 1) / 2) * G.step;
        const pp = G.full ? 0 : pt;
        this.b3Beam(
          from.clone(),
          V(Math.sin(y) * Math.cos(pp), Math.sin(pp), Math.cos(y) * Math.cos(pp)),
          G.warn || 1.1,
          {
            range: G.range || 120,
            dmg: G.dmg,
            im: G.im,
            attr: G.attr,
            color: G.color,
            snd: G.id, // 自製音效：鬃甲、刺彈、羽刃（mech-boss3.js 的 b3Beam）
          },
        );
      }
      cd();
    } else if (G.type === 'beam') {
      // 從身上的一塊（或幾塊：nodes，nodeFlags＝各自負責的部位，壞了的不射）朝目標各一道光束；
      // 打中的附加狀態效果（預警結束時看目標離光束多近）
      const N = this.model.beast.nodes;
      const names = (G.nodes || [G.node]).filter((n, i) => !(G.nodeFlags && this.tierFlag(G.nodeFlags[i])));
      for (const name of names) {
        const from = V(0, 0, 0);
        (N[name] || N.chest).getWorldPosition(from);
        const dir = pl.center().addScaledVector(pl.vel, 0.2).sub(from).normalize();
        this.b3Beam(from, dir, G.warn, {
          range: G.range,
          dmg: G.dmg,
          im: G.im,
          attr: G.attr,
          color: G.color,
          snd: G.id, // 自製音效：冷凍光束、熱熔砲、魚叉、胸砲、切割砲、斬擊波
        });
        if (G.status)
          g.later(G.warn + 0.02, () => {
            if (this.dead) return;
            for (const t of g.hostilesOfEnt(this)) {
              if (!t || t.dead || !t.addStatus || !t.center) continue;
              const ap = t.center().sub(from);
              const pj = ap.dot(dir);
              if (pj < 0 || pj > G.range * DS) continue;
              if (ap.addScaledVector(dir, -pj).length() < (t.radius || 0) + (G.hitR || 2))
                t.addStatus(G.status.kind, G.status.sec, { ...G.status.o, src: this }); // src：鉤住是往機獸這邊拉
            }
          });
      }
      cd();
    } else if (G.type === 'mines') {
      // 空雷／地雷：目標周圍 n 顆（air＝浮在空中）
      const dm = this.dmgMul;
      this.bossSnd(G.id, 0.9); // 卵鞘空雷（自製音效）
      for (let i = 0; i < G.n; i++) {
        const a = (i / G.n) * Math.PI * 2 + Math.random() * 0.5,
          rr = (0.5 + Math.random() * 0.5) * G.spread;
        const p = pl.pos
          .clone()
          .add(V(Math.cos(a) * rr, G.air ? (2 + Math.random() * 5) * MS : 0, Math.sin(a) * rr));
        g.layMine(this, p, {
          dmg: G.dmg * dm,
          im: G.im * dm,
          R: G.R,
          life: G.life || 9,
          air: !!G.air,
          quiet: i > 0,
        });
      }
      cd();
    } else if (G.type === 'lob') {
      // 拋射（迫擊砲彈：落點有預警圈）：n 發，第一發對準目標、其餘散在 spread 公尺內；pool＝落地後留下燃燒地面
      const dm = this.dmgMul;
      for (let i = 0; i < G.n; i++)
        g.later((G.at || 0) + i * (G.gap || 0.25), () => {
          if (this.dead || pl.dead) return;
          const a = Math.random() * Math.PI * 2,
            rr = i ? Math.random() * (G.spread || 0) : 0;
          const tp = pl.pos
            .clone()
            .addScaledVector(pl.vel, 0.4)
            .add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr));
          g.mortarShot(this, tp, { dmg: G.dmg * dm, im: G.im * dm, R: G.R });
          this.bossSnd(G.id, 0.85, undefined, 0.12); // 熔岩塊、深水炸彈、迫擊筒、毒液、集束炸彈（自製音效）
          if (G.pool)
            g.later(
              2,
              () => !this.dead && g.addPool(this, tp, G.pool.r, G.pool.life, G.pool.dps * dm, !!G.pool.acid),
            );
        });
      cd();
    } else cd();
  },
  // 獅型亂入的進場（game/beast-raid.js 的 raidStart 設定 aiState.raid＝{ v 原本的機獸, st, t }）：
  // run 全速衝向牠 → leap 撲上去（沿用躍過障礙物的拋物線）→ bite 咬住（那一下牠被擊破）→ roar 吼一聲 → 交回一般的行為
  beastRaidMove(dt, r) {
    const s = this.aiState,
      R = s.raid,
      v = R.v,
      g = this.game,
      w = g.world,
      B = this.beastInfo();
    const px0 = this.pos.x,
      pz0 = this.pos.z;
    R.t += dt;
    this.iFrames = Math.max(this.iFrames || 0, 0.5);
    const d = Math.hypot(v.pos.x - this.pos.x, v.pos.z - this.pos.z);
    const tyaw = yawTo(this.pos, v.pos);
    if (R.st === 'run') {
      this.yaw = wrap(this.yaw + clamp(wrap(tyaw - this.yaw), -1, 1) * B.turn * 3 * dt);
      s.spd = Math.min(B.run * 1.15, (s.spd || 0) + B.acc * 2 * dt);
      const fx = -Math.sin(this.yaw),
        fz = -Math.cos(this.yaw);
      const [cx, cz] = w.collide(
        this.pos.x + fx * s.spd * dt,
        this.pos.z + fz * s.spd * dt,
        this.pos.y,
        this.radius * 0.8,
      );
      const blocked = (w.isVoid && w.isVoid(cx, cz)) || Math.hypot(cx - px0, cz - pz0) < s.spd * dt * 0.3;
      if (!blocked) {
        this.pos.x = cx;
        this.pos.z = cz;
      }
      this.pos.y = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6 * MS);
      const reach = this.radius + (v.radius || 0);
      if (d < reach + 34 || R.t > 3 || (blocked && R.t > 0.4)) {
        // 撲上去：落在牠身上靠自己這一側
        const k = Math.max(0, d - reach * 0.7) / (d || 1);
        let lx = this.pos.x + (v.pos.x - this.pos.x) * k,
          lz = this.pos.z + (v.pos.z - this.pos.z) * k;
        if (w.isVoid && w.isVoid(lx, lz) && w.nearSolid) [lx, lz] = w.nearSolid(lx, lz);
        s.leap = {
          t: 0,
          dur: clamp(d / 110, 0.55, 1.1),
          M: null,
          x0: this.pos.x,
          z0: this.pos.z,
          y0: this.pos.y,
          x1: lx,
          z1: lz,
          y1: w.groundAt(lx, lz, v.pos.y + 2 * MS),
          h: clamp(d * 0.16, 6, 16),
          yaw: tyaw,
        };
        s.clip = 'pounce';
        s.clipT = 0;
        R.st = 'leap';
      }
    } else if (R.st === 'leap') {
      // 落地（躍起的那一段由 beastMove 的 leap 處理）：咬住
      this.yaw = this.aimYaw = tyaw;
      s.spd = 0;
      s.clip = 'bite';
      s.clipT = 0;
      R.st = 'bite';
      g.camShake = Math.max(g.camShake || 0, 0.45);
    } else if (R.st === 'bite') {
      s.clipT += dt;
      if (!R.killed && s.clipT >= 0.45) {
        R.killed = true;
        g.raidKill(this, v);
      }
      if (s.clipT >= clipDur('bite')) {
        s.clip = 'roar';
        s.clipT = 0;
        R.st = 'roar';
      }
    } else {
      s.clipT += dt;
      if (s.clipT >= clipDur('roar')) {
        s.clip = null;
        s.raid = null;
        s.bCd = 1.2;
        g.raidDone(this);
      }
    }
    this.aimYaw = this.yaw;
    this.bossVis = ((this.bossVis || 0) & ~63) | (s.clip ? B.clips.indexOf(s.clip) + 1 : 0);
    this.bossTick(dt);
    if (dt > 0) this.vel.set((this.pos.x - px0) / dt, 0, (this.pos.z - pz0) / dt);
    this.grounded = true;
    r.done = true;
    return r;
  },
  beastMove(dt, d, dir, perp, wish, pl, r) {
    if (this.ai !== 'beast') return null;
    const B = this.beastInfo();
    if (!B) return null;
    const s = this.aiState,
      w = this.game.world;
    wish.set(0, 0, 0);
    if (!s.bInit) {
      s.bInit = true;
      if (s.bCd === undefined) s.bCd = 2.5;
      s.orb = Math.random() < 0.5 ? 1 : -1;
      s.spd = 0;
      s.orbT = 6;
    }
    s.tgt = pl; // 近戰提示的對象
    this.beastRepair();
    if (s.raid && !s.leap) return this.beastRaidMove(dt, r); // 獅型亂入的進場（game/beast-raid.js）
    // 會飛的（定義的 fly）：air＝在空中（盤旋、俯衝）／在地面（地面的招式），每隔一陣子降落或起飛；alt＝離地的高度
    const FL = B.fly || null;
    if (FL) {
      if (s.air === undefined) {
        s.air = true;
        s.alt = FL.alt;
        s.modeT = FL.airT[0] + Math.random() * FL.airT[1];
      }
      // 腳下是虛空（洋上都市）：一律留在空中——失衡也不掉下去（掉到底就上不來、玩家也打不到）
      const overVoid = !!(w.isVoid && w.isVoid(this.pos.x, this.pos.z));
      if (overVoid) s.air = true;
      else if (!this.canAct())
        s.air = false; // 失衡：掉下來
      else if (!s.clip && !s.gun && !s.leap && (s.modeT -= dt) <= 0) {
        // 腳下是虛空就不降落（再飛一下）
        if (s.air && w.isVoid && w.isVoid(this.pos.x, this.pos.z)) s.modeT = 1.5;
        else {
          s.air = !s.air;
          const T = s.air ? FL.airT : FL.groundT;
          s.modeT = T[0] + Math.random() * T[1];
          this.beastClip(s.air ? FL.takeoff : FL.land);
        }
      }
      const to = s.air ? FL.alt : 0;
      s.alt += clamp(to - s.alt, (-FL.alt / 0.9) * dt, (FL.alt / 1.3) * dt);
      this.flying = s.alt > 3;
    }
    const tyaw = yawTo(this.pos, pl.pos);
    const off = wrap(tyaw - this.yaw); // 目標在我的哪一邊（正＝左）
    // 躍過障礙物：連續被擋住時直接朝目標跳過去（拋物線，途中不碰撞），落在目標前方
    if (s.leap) {
      const L = s.leap;
      L.t += dt;
      const u = Math.min(1, L.t / L.dur);
      const px0 = this.pos.x,
        pz0 = this.pos.z;
      this.pos.x = L.x0 + (L.x1 - L.x0) * u;
      this.pos.z = L.z0 + (L.z1 - L.z0) * u;
      this.pos.y = L.y0 + (L.y1 - L.y0) * u + 4 * L.h * u * (1 - u);
      this.yaw = wrap(this.yaw + clamp(wrap(L.yaw - this.yaw), -1, 1) * B.turn * 2 * dt);
      this.aimYaw = this.yaw;
      s.spd = 0;
      s.clipT = L.t;
      if (u >= 1) {
        if (L.M) {
          // 鑽地突襲：鑽出來的那一下判定
          s.hitSet = null;
          this.beastStrike(L.M);
          if (L.M.open) this.bossOpen(L.M.open, true);
        }
        s.leap = null;
        s.clip = null;
        s.bCd = L.M ? 1.2 : 0.5;
      }
      this.bossVis = ((this.bossVis || 0) & ~31) | (s.clip ? B.clips.indexOf(s.clip) + 1 : 0);
      this.bossTick(dt);
      if (dt > 0) this.vel.set((this.pos.x - px0) / dt, 0, (this.pos.z - pz0) / dt);
      r.done = true;
      return r;
    }
    const SG = B.stag || 'stagger';
    let goalSpd = 0,
      turn = 0,
      fwdStep = 0,
      sideStep = 0;
    if (this.hitStunT > 0) this.hitStunT = 0; // 機獸不吃一般的硬直（不經過 move()，不會倒數）
    if (this.dgOn()) this.dgMove(dt, _dgZ, false, false); // 敵人的閃避：側跳、後跳、伏低（mech-dodge.js）
    if (s.flinch > 0) s.flinch -= dt;
    if (!this.canAct() || s.flinch > 0) {
      // 失衡、被彈刀：站不穩（片段播完停在最後的姿勢）
      if (s.clip !== SG) this.beastClip(SG);
      s.clipT += dt;
    } else if (s.clip === SG) {
      s.clip = null;
      s.bCd = 1.2;
    } else if (s.clip) {
      // 動作片段中：不走；片段自己的前進量（撲擊）照 rootF 的變化移動
      s.clipT += dt;
      const rig = this.model.beast;
      const k = (rig && rig.group.scale.x) || 1;
      const rf = ((rig && rig.rootF) || 0) * k,
        rs = ((rig && rig.rootS) || 0) * k;
      fwdStep = rf - (s.rf || 0);
      sideStep = rs - (s.rs || 0); // 片段的側移（閃避；+＝機獸的右側）
      s.rf = rf;
      s.rs = rs;
      const M = B.melee && B.melee[s.clip];
      if (s.clipT < ((M && M.track) || 0.25))
        turn = clamp(off * 3, -1, 1) * B.turn * (M && M.track ? 2.5 : 1.5); // 出手前還會對準（track＝閃開之後轉回來對準的秒數）
      if (M && M.hits) {
        // 連打（hits＝每一下的時間）：每一下出手前才畫預警、各自判定
        const n = s.hitN || 0;
        if (n < M.hits.length) {
          if (!s.warned && s.clipT >= M.hits[n] - LIVE_WARN) {
            this.beastWarn(M, Math.max(0.05, M.hits[n] - s.clipT));
            // 第 2 下之後各自的紅色「!」（每一下都能彈刀／完美迴避）
            if (n > 0 && pl && !pl.dead) this.atkCue(pl, Math.max(0.05, M.hits[n] - s.clipT), 0.3);
          }
          if (s.clipT >= M.hits[n]) {
            s.hitSet = null;
            this.beastStrike(M);
            s.hitN = n + 1;
            s.warned = false;
            s.spot = null;
          }
        }
      } else {
        if (M && M.live && !s.warned && s.clipT >= M.t - LIVE_WARN)
          this.beastWarn(M, Math.max(0.05, M.t - s.clipT));
        if (M && M.ram !== undefined && !s.hitDone && s.clipT >= M.ram) this.beastStrike(M, true);
        if (M && !s.hitDone && s.clipT >= M.t) {
          s.hitDone = true;
          this.beastStrike(M);
        }
      }
      if (s.clipT >= clipDur(s.clip)) {
        const op = (M && M.open) || s.clipOpen || 0;
        if (op) this.bossOpen(op, true); // 撲空、放完大動作之後是破綻（Boss 改版的 D）
        s.clipOpen = 0;
        this.yaw = wrap(this.yaw + ((rig && rig.rootYaw) || 0)); // 片段轉了身（迴旋）：結束時接到實體的朝向
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
      // 在空中：不貼到目標頭頂（太近就繞開，拉開距離之後回頭才有俯衝的角度）
      if (FL && s.air && d < this.radius + (pl.radius || 0) + 18) head = tyaw + s.orb * 2.3;
      const err = wrap(head - this.yaw);
      goalSpd = (d > 30 * DS ? B.run : d > 12 * DS || s.go > 0 ? B.trot : B.walk) * this.bodyK('spd'); // 後腿壞了變慢
      // 轉彎半徑＝速度÷轉身速度：方向差得多時先慢下來（差越多越慢），貼近目標要出手時也放慢，低速時轉得更快
      goalSpd *= clamp(1.25 - Math.abs(err) * 0.9, 0.12, 1);
      if (s.go > 0 && d < this.radius + (pl.radius || 0) + 10 && !(FL && s.air))
        goalSpd = Math.min(goalSpd, B.walk * 0.6);
      if (FL && s.air) goalSpd = Math.max(goalSpd, B.walk); // 飛行不會停在半空
      // 追向目標卻沒有進展（被擋住、沿著牆滑）：每 1.2 秒看一次距離，沒縮短 4 m 以上就躍過去
      if (!s.gun && (s.go > 0 || d >= want * 2.2)) {
        s.pT = (s.pT || 0) + dt;
        if (s.pD === undefined || s.pT < dt * 1.5) s.pD = d;
        if (s.pT >= 1.2) {
          if (s.pD - d < 4 && d > this.radius + (pl.radius || 0) + 12) this.beastLeap(pl, d, tyaw);
          s.pT = 0;
          s.pD = d;
        }
      } else s.pT = 0;
      if (s.gun && s.gun.G.hold) goalSpd = 0; // 磁軌砲這類：停下來架砲（邊跑邊放的話鎖住方向之後砲口會跑掉）
      turn = clamp(err * 4, -1, 1) * B.turn * (1 + 1.6 * (1 - Math.min(1, s.spd / B.run)));
      if (s.go > 0) {
        s.go -= dt;
        // 出手的距離是實際的公尺（機獸的模型不乘建模倍率）
        const a = Math.abs(off),
          dd = d - this.radius - (pl.radius || 0);
        let c = null,
          tot = 0;
        const ok = [];
        for (const k in B.melee) {
          const S = B.melee[k].sel;
          if (!S || this.bodyOff(k)) continue; // 身體區域壞了停用的招式（尾巴斷了不掃尾）
          if (
            dd < (S.d0 || -99) ||
            dd > S.d1 * this.bodyOf('reach', k, 1) ||
            a < (S.a0 || 0) ||
            a > (S.a1 || 9)
          )
            continue;
          if (S.sgn && Math.sign(off || 1) !== S.sgn) continue;
          if (FL && !!B.melee[k].air !== !!s.air) continue; // 會飛的：空中的招式只在空中用、地面的只在地面用
          if (S.d0 && s.go > 3) continue; // 撲擊這類中距離的招式：先對準一下再出
          ok.push(k);
          tot += S.w || 1;
        }
        if (ok.length) {
          let q = Math.random() * tot;
          for (const k of ok) {
            q -= B.melee[k].sel.w || 1;
            if (q <= 0) {
              c = k;
              break;
            }
          }
          c = c || ok[0];
        }
        if (c) {
          this.beastMelee(c, pl);
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
    if (step || sideStep) {
      const [cx, cz] = w.collide(
        px + fx * step - fz * sideStep,
        pz + fz * step + fx * sideStep,
        this.pos.y,
        this.radius * 0.8,
      );
      const lim = w.lim - 3 * MS;
      this.pos.x = clamp(cx, -lim, lim);
      this.pos.z = clamp(cz, -lim, lim);
      // 虛空的地圖（洋上都市、高空軌道）：在地面上的不走出去（退回原位，當成被擋住）；飛在空中的不管
      if (!(FL && s.alt > 3) && w.isVoid && w.isVoid(this.pos.x, this.pos.z) && !w.isVoid(px, pz)) {
        this.pos.x = px;
        this.pos.z = pz;
      }
      // 被擋住（實際走的不到該走的三成）：累積 0.35 秒就換繞行的方向並往旁邊轉開一陣子
      const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
      s.blk = !sideStep && moved < Math.abs(step) * 0.3 && Math.abs(step) > 0.02 ? (s.blk || 0) + dt : 0;
      if (s.blk > 0.35) {
        s.blk = 0;
        s.orb *= -1;
        s.avoid = 0.7;
        s.go = 0;
        // 3 秒內第二次被擋住：躍過去
        if (s.blkAt !== undefined && this.t - s.blkAt < 3 && this.canAct() && !s.clip && !s.gun) {
          this.beastLeap(pl, d, tyaw);
          s.blkAt = undefined;
        } else s.blkAt = this.t;
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
    // 不會飛的不知怎麼到了虛空上（被推、招式的位移）：放回最近的實地
    if (!FL && !s.leap && w.isVoid && w.nearSolid && w.isVoid(this.pos.x, this.pos.z)) {
      const [sx, sz] = w.nearSolid(this.pos.x, this.pos.z);
      this.pos.x = sx;
      this.pos.z = sz;
    }
    const al = (FL && s.alt) || 0;
    this.pos.y = w.groundAt(this.pos.x, this.pos.z, this.pos.y - al + 0.6 * MS) + al; // 只跨得上矮的東西，高的由碰撞擋住；飛行的加上離地的高度
    const ci = s.clip ? B.clips.indexOf(s.clip) + 1 : 0;
    this.bossVis = ((this.bossVis || 0) & ~63) | ci | (FL && s.air ? 32 : 0); // 32＝在空中（客機的動作用）
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
    if (this.evK) this.evBody(dt); // 閃避的殘影（mech-dodge.js；各端）
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
    if (this.dead && B) ci = B.clips.indexOf(B.death || 'death') + 1;
    if (ci !== F.ci) {
      F.ci = ci;
      F.ct = 0;
    } else F.ct += dt;
    const name = ci && B ? B.clips[ci - 1] : null;
    const sc = rig.group.scale.x || 1;
    if (B && B.hide)
      for (const f in B.hide) {
        const off = this.tierFlag(f);
        for (const k of B.hide[f]) if (rig.nodes[k]) rig.nodes[k].visible = !off;
      }
    const air = !!((this.bossVis || 0) & 32);
    const gy = this.beastTerrain(dt, F, rig, sc, air); // 腳貼著斜坡（mech-beast-fx.js）
    animateBeast(
      rig,
      {
        gy,
        t: F.t,
        v: name ? 0 : F.v / sc,
        w: name ? 0 : F.w,
        act: name ? { name, t: F.ct } : null,
        fly: !!((this.bossVis || 0) & 32), // 會飛的：在空中（展翼拍動）
        aim: this.bx && this.bx.length >= 2 && !(B && B.aim) ? [this.bx[0], this.bx[1]] : null,
      },
      dt,
    );
    // 自己的砲塔（定義的 aim＝[偏航的區塊, 俯仰的區塊]）：瞄準時轉向目標，沒瞄準時慢慢回正
    if (B && B.aim) {
      const yn = rig.nodes[B.aim[0]],
        pn = rig.nodes[B.aim[1]];
      const on = this.bx && this.bx.length >= 2;
      const kk = Math.min(1, dt * (on ? 12 : 3));
      if (yn) yn.rotation.y += ((on ? this.bx[0] : 0) - yn.rotation.y) * kk;
      if (pn) pn.rotation.x += ((on ? this.bx[1] : 0) - pn.rotation.x) * kk;
    }
    this.mesh.position.y = this.pos.y + (rig.rootY || 0) * sc + (F.dy || 0);
    this.mesh.rotation.y = this.yaw + (rig.rootYaw || 0);
    this.beastLocalFx(dt, F, name, rig, sc, B); // 專屬的音效與特效（mech-beast-fx.js）
  },
});
