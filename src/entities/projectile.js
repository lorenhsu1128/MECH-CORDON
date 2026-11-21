import { pv, strictHit } from '../data/pace.js';
import { KIN_FALL_MIN, weaponAttr } from '../data/attrs.js';
import { weaponById } from '../data/parts.js';
// ============================================================
//  PROJECTILES
// ============================================================
import { SFX } from '../audio/audio.js';
import { clamp } from '../core/math.js';
import { DS, MS } from '../core/scale.js';
import { buildProjectileMesh } from '../render/extra-models.js';
import { shotColor } from '../fx/palette.js';
import { targetDist, targetSegT } from '../world/prop-hit.js';
import { hitRay, nearestPiece, nearestSurface } from '../render/hit-parts.js';

const _pjS = new THREE.Vector3(),
  _pjN = new THREE.Vector3(),
  _pjC = new THREE.Vector3();

const AAM_LOSE = 1.3; // 空戰導彈失去追蹤的夾角（data/air.js 的 AAM_LOSE）
const BEND_CONE = 0.25; // 彈道修正只修正這個角度（弧度）以內的偏差：差一點擦過的會修正，大幅閃避照樣打不中

// 每格的暫存（子彈很多，docs/perf-campaign-plan.md 第 3 期）
const _pjSeg = new THREE.Vector3(),
  _pjMid = new THREE.Vector3();
export class Projectile {
  constructor(game, o) {
    Object.assign(this, { life: 3, splash: 0, gravity: 0, target: null, turn: 0, dead: false, trailT: 0 }, o);
    this.game = game;
    this.p0 = this.pos.clone(); // 發射點（實彈的距離衰減）
    const col = o.color || 0xffe0a0;
    // 屬性（顯示用的換色）：房主依武器算、隨 proj 事件的 at 給客機
    if (!this.visual && !this.at && (this.wid || this.attr))
      this.at = this.attr || weaponAttr(weaponById(this.wid));
    // 砲火特效「華麗」：子彈、砲彈、榴彈、導彈依陣營＋屬性換色（fx/palette.js，各端依自己的設定；
    // 主題專屬敵人的特殊彈體（冰錐、魚雷、貨櫃…）沒有屬性，照原本的顏色）
    const rich = !!(game.fx && game.fx.rich);
    const tint = rich && !!this.at && /^(bullet|shell|grenade|missile)$/.test(o.kind);
    if (tint) this.color = shotColor(this.team, this.at);
    // 發光的彈體用粒子批次（fx/batch.js），每顆子彈不再各自一個網格與材質
    // 彈體的外觀照舊尺度建（曳光的長度依舊尺度的彈速），再整體放大 MS
    const K = MS;
    this.mesh = buildProjectileMesh(
      o.kind,
      tint ? this.color : col,
      this.vel.length() / K,
      game.fx && game.fx.projPart,
      rich ? { rich: true, team: this.team, at: this.at } : null,
    );
    this.mesh.scale.setScalar((o.scale || 1) * K); // o.scale：外觀的放大（誘導飛彈架的大型飛彈；客機以 proj 事件的 sc 照做）
    this.mesh.position.copy(this.pos);
    game.scene.add(this.mesh);
    this.orient();
    if (game.net && game.net.role === 'host' && !this.visual) {
      this.netId = ++game.projSeq;
      game.netEv({
        t: 'proj',
        i: this.netId,
        p: [+this.pos.x.toFixed(2), +this.pos.y.toFixed(2), +this.pos.z.toFixed(2)],
        v: [+this.vel.x.toFixed(2), +this.vel.y.toFixed(2), +this.vel.z.toFixed(2)],
        k: this.kind,
        tm: this.team,
        c: col,
        l: +this.life.toFixed(2),
        s: this.splash,
        g: this.gravity,
        tg: this.target ? this.target.id : -1,
        tn: this.turn,
        bd: this.bend ? +this.bend.toFixed(3) : undefined,
        sh: this.shootable || undefined, // 可以打掉的投射物：血量與判定半徑（game/hazards2.js）
        sr: this.shootable ? this.shotR : undefined,
        sc: this.scale || undefined,
        at: this.at || undefined, // 屬性（客機的換色）
      });
    }
    if (this.shootable) game.shotInit(this); // 代理目標（鎖定、子彈與爆炸打得到）
  }
  // 導彈、砲彈、榴彈的尾煙與尾焰（各端自己畫、不轉送）；砲火特效「華麗」時煙更粗更白、導彈多一道火焰尾巴
  trailFx(dt) {
    this.trailT += dt;
    if (this.trailT <= 0.045) return;
    this.trailT = 0;
    const fx = this.game.fx,
      R = fx.rich;
    const back = this.vel.clone().normalize().negate();
    const ms = this.kind === 'missile';
    if (R && ms && this.at === 'en') {
      fx.plasmaTrail(this.pos, back, this.color); // 電漿彈：紫色的光點尾巴、沒有煙
      return;
    }
    // 華麗的導彈：彎曲的白煙帶（fx.ribbons，每顆導彈一條；key＝這顆導彈）
    if (R && ms) fx.smokeRibbon(this, this.pos);
    fx.smoke(
      this.pos.clone(),
      // 華麗的導彈：煙團小一點（尾跡交給白煙帶），砲彈的煙粗一點
      ms ? (R ? 0.3 : 0.45) : 0.7 * (R ? 1.35 : 1),
      R ? (ms ? 0xc4c8ce : 0xa0a4aa) : 0x8a8f96,
      R ? (ms ? 0.9 : 1.25) : 0.7,
      R ? 0.6 : 1.2,
    );
    if (this.kind === 'grenade') return;
    const fc = R && this.color ? this.color : 0xffb060;
    fx.boostFlame(this.pos.clone(), back, fc);
    if (R) fx.tailFlame(this.pos, back, fc, ms ? 1 : 0.7);
  }
  orient() {
    if (this.kind === 'crate') {
      this.mesh.rotation.x += 0.025; // 貨櫃：慢慢翻滾，不朝速度方向
      return;
    }
    const v = this.vel;
    if (v.lengthSq() > 0.01) {
      this.mesh.lookAt(this.pos.x + v.x, this.pos.y + v.y, this.pos.z + v.z);
      if (this.kind === 'missile' && !this.mesh.userData.glb) this.mesh.rotateX(Math.PI / 2);
    }
  }
  update(dt) {
    const g = this.game;
    // 傳說模組「停滯力場」「零式加速」：敵人的投射物變慢（entities/mech-legend.js；只有單人）
    if ((g.lgFields || g.lgZero) && !this.visual) dt *= g.lgFieldK(this);
    this.age = (this.age || 0) + dt;
    // 追著玩家的導彈：快打到時 QB＝甩掉追蹤，算完美 QB（mech-weak.js；只在房主／單機）
    if (this.kind === 'missile' && this.target && !this.target.dead && this.target.missileDodge)
      this.target.missileDodge(this);
    if (this.kind === 'missile' && this.target && !this.target.dead) {
      const tc = this.target.center();
      const d0 = tc.distanceTo(this.pos);
      const tt = clamp(d0 / Math.max(1, this.vel.length()), 0, 1.2);
      const to = tc.addScaledVector(this.target.vel, tt * 0.8).sub(this.pos);
      const d = to.length();
      to.normalize();
      const sp = this.vel.length();
      const cur = this.vel.clone().normalize();
      const ang = cur.angleTo(to);
      // 空戰導彈（entities/mech-air.js）：擦身而過（夾角太大）就失去追蹤；轉向不會在近距離加快，急轉彎甩得掉
      if (this.aam && ((ang > AAM_LOSE && this.age > 0.3) || (g.airInCloud && g.airInCloud(tc)))) {
        this.target = null;
        this.dodged = true;
      }
      const maxA = this.turn * dt * (this.aam ? 1 : d < 10 * DS ? 2.2 : this.age > 0.5 ? 1.4 : 1);
      if (ang > maxA) {
        const axis = cur.clone().cross(to).normalize();
        if (axis.lengthSq() > 0.5) cur.applyAxisAngle(axis, maxA);
      } else cur.copy(to);
      this.vel.copy(cur.multiplyScalar(sp));
    } else if (this.bend && this.target && !this.target.dead) {
      // 彈道修正（玩家的實彈，mech-entity.js 的 fire）：每秒最多轉 bend 弧度
      const to = this.target.center().sub(this.pos).normalize();
      const sp = this.vel.length();
      const cur = this.vel.clone().divideScalar(sp);
      const ang = cur.angleTo(to);
      if (ang > 1e-4 && ang < BEND_CONE) {
        const axis = cur.clone().cross(to).normalize();
        if (axis.lengthSq() > 0.5)
          this.vel.copy(cur.applyAxisAngle(axis, Math.min(ang, this.bend * dt)).multiplyScalar(sp));
      }
    }
    if (this.gravity) this.vel.y -= this.gravity * dt;
    const prev = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);
    this.life -= dt;
    this.mesh.position.copy(this.pos);
    this.orient();
    if (g.waterCross) g.waterCross(prev, this.pos, this.kind); // 穿過水面：水花與漣漪（game/water.js，只有外觀）
    if (!this.whz && !g.airMode && g.projWhiz) g.projWhiz(this, prev); // 子彈從身邊飛過（game/feedback.js，各端自己算）
    // 追著自機的導彈接近：ECHO 提醒（game/voice.js，各端自己算）
    if (this.kind === 'missile' && !this.mcue && g.player && this.target === g.player && !g.player.dead) {
      if (this.pos.distanceTo(g.player.pos) < 80 * g.player.dk) {
        this.mcue = true;
        g.voiceCue('missile');
      }
    }
    if (this.visual) {
      if (this.life <= 0) {
        this.dead = true;
        g.scene.remove(this.mesh);
      }
      if (this.kind === 'missile' || this.kind === 'shell' || this.kind === 'grenade') this.trailFx(dt);
      return;
    }
    if (this.kind === 'missile' || this.kind === 'shell' || this.kind === 'grenade') this.trailFx(dt);
    // 空域：敵人的子彈擦過玩家身邊（game/air.js 的 airWhiz）
    if (g.airMode && !this.whz && this.team === 'enemy' && (this.kind === 'bullet' || this.kind === 'shell'))
      g.airWhiz(this, prev);
    // 護盾產生器的護盾、盾牌 MT 的盾（game/support.js）；路徑經過地雷時引爆
    if (g.projBlock(this, prev)) return;
    // swept hits: closest point on segment prev→pos to target sphere
    // 目標：敵對的機體＋同一格共用的可破壞物件清單（不再每顆子彈串一個新陣列，第 3 期）
    const hs = this.allTeams ? g.everyone(this.owner) : g.hostilesOf(this.team, this.owner);
    const ds = g.destructiblesF(this.team);
    const seg = _pjSeg.copy(this.pos).sub(prev);
    let best = null,
      bestT = 2,
      bestP = -1; // 打中的區塊（render/hit-parts.js 的 rig.hb 索引；-1＝還沒算）
    const pad = 0.4 + (this.hitR || 0); // hitR：玩家實彈加大的判定（對物件不加：物件用命中形狀，world/prop-hit.js）
    const eK = this.team === 'enemy' ? pv('eSize') : 1; // 節奏調整室的敵人子彈大小（data/pace.js）
    // 部位判定的「擦過不算」（調整室的開關）：人形機甲只看各區塊的外框；玩家的子彈外擴 0.5 m＋hitR、其他 0.25 m
    const strict = strictHit();
    const fpad = strict
      ? this.owner && this.owner.pilotEnt && this.owner.pilotEnt()
        ? 0.5 + (this.hitR || 0)
        : 0.25 * eK
      : 0;
    for (let li = 0; li < 2; li++) {
      const L = li ? ds : hs;
      for (let i = 0; i < L.length; i++) {
        const t = L[i];
        if (t.dead || t.id === this.pierced) continue; // 貫穿彈已經打過的（mech-legend.js）
        if (strict && !li && t.model && t.model.hb) {
          // 外接球放大到蓋住整台（頭頂、腳掌）只當粗判定，再對區塊的外框
          const rc = Math.max(t.radius, t.model.hbR || t.model.height * 0.62);
          if (targetSegT(t, prev, seg, rc - t.radius + fpad) < 0) continue;
          const h = hitRay(t.model, prev, seg, fpad);
          if (!h || h.t >= bestT) continue;
          best = t;
          bestT = h.t;
          bestP = h.i;
          _pjN.copy(h.n);
          continue;
        }
        const tt = targetSegT(t, prev, seg, eK === 1 || li ? pad : (t.radius + pad) * eK - t.radius);
        if (tt >= 0 && tt < bestT) {
          best = t;
          bestT = tt;
          bestP = -1;
        }
      }
    }
    if (best) {
      let snap = false;
      // 人形機甲：打中哪一塊、真正的表面位置（外框）與法線；彈道沒碰到外框（擦過外接球）時取最近的區塊
      if (bestP < 0 && !best.isProp && best.model && best.model.hb) {
        const h = hitRay(best.model, prev, seg, 0);
        if (h) {
          bestP = h.i;
          bestT = h.t;
          _pjN.copy(h.n);
        } else if (best.model.hbGen) {
          // 載具、專屬敵人、Boss、機獸：彈道只碰到判定球、沒碰到外框 → 命中點移到最近的表面上
          _pjC.copy(prev).addScaledVector(seg, bestT);
          bestP = nearestSurface(best.model, _pjC, _pjS, _pjN);
          if (bestP >= 0) {
            if (_pjN.lengthSq() < 0.5) _pjN.copy(seg).normalize().negate();
            snap = true;
          }
        } else {
          _pjC.copy(prev).addScaledVector(seg, bestT);
          bestP = nearestPiece(best.model, _pjC);
          _pjN.copy(seg).normalize().negate();
        }
      }
      this.hitPI = bestP;
      if (bestP >= 0) (this.hitN || (this.hitN = new THREE.Vector3())).copy(_pjN);
      if (snap) this.pos.copy(_pjS);
      else this.pos.copy(prev).addScaledVector(seg, bestT);
      // 傳說模組「貫穿彈」：第一個目標打中後繼續飛
      if (this.pierce && !best.isProp && !(this.splash > 0)) {
        this.pierce = false;
        this.pierced = best.id;
        this.impact(best, true);
        return;
      }
      this.impact(best);
      return;
    }
    const mid = _pjMid.copy(prev).addScaledVector(seg, 0.5);
    // 打到地下的岩頂（docs/destruction-design.md 第 6 期）
    // （拋物線的砲彈不算：照舊越過岩頂打到目標）
    if (
      g.world.roofMesh &&
      !this.gravity &&
      this.pos.y > g.world.roofLow &&
      g.roofDamage(this.pos, this.dmg, this.attr || 'kin')
    ) {
      this.impact(null);
      return;
    }
    if (g.world.hitsWorld(this.pos) || g.world.hitsWorld(mid) || this.life <= 0) {
      this.impact(null);
    }
  }
  // keep＝貫穿彈：只算這一下的傷害，子彈繼續飛
  impact(direct, keep) {
    const g = this.game;
    if (!keep) {
      this.dead = true;
      g.scene.remove(this.mesh);
      if (this.netId) g.netEv({ t: 'pend', i: this.netId });
    }
    // 臨時障礙物受傷、爆炸點燃油漬（game/hazards2.js）
    if (!direct || this.splash > 0) g.hz2Blast(this.pos, this.dmg, this.splash, this.attr);
    if (g.crowd && this.splash > 0) g.crowdBlast(this.pos, this.splash, this.owner); // 爆炸炸到小人（crowd.js）
    if (this.splash > 0) {
      // 第 5 個參數：'pl'＝能量的爆炸（電漿導彈；砲火特效「華麗」時畫成紫色的電漿爆炸，隨轉送帶給客機）
      g.fx.explosion(
        this.pos,
        (this.splash * 0.9) / g.fx.k,
        0xffa040,
        this.splash > 4 * MS,
        this.at === 'en' ? 'pl' : undefined,
      );
      SFX.explode(this.splash > 4 * MS, this.pos);
      g.rumbleAt(
        this.pos,
        this.splash > 4 ? 0.9 : 0.5,
        0.4,
        this.splash > 4 ? 260 : 150,
        this.splash * 4 + 14,
      );
      const targets = (this.allTeams ? g.everyone(this.owner) : g.hostilesOf(this.team, this.owner)).concat(
        g.destructibles(this.team),
      );
      for (const t of targets) {
        if (t.dead) continue;
        // 物件以外形最近點算距離；直接打中的一律 0（部位判定把爆炸點放在區塊外框的表面，可能在外接球外面，不能因此少算）
        const d = t === direct ? 0 : targetDist(t, this.pos);
        if (d < this.splash) {
          let k = clamp(1 - (d / this.splash) * 0.5, 0.4, 1) * g.groundBlastK(t, this.pos);
          let im = this.impactV * k;
          if (
            t.team === 'player' &&
            this.owner &&
            this.owner.team === 'player' &&
            t !== this.owner &&
            !g.isHostile(this.owner, t)
          ) {
            k *= 0.3;
            im = 0;
          }
          if (t.isProp)
            g.damageProp(
              t,
              this.dmg * k,
              im,
              this.pos,
              this.owner,
              this.attr || (this.wid ? undefined : 'exp'),
              this.wid,
            );
          else {
            t.rbGold = !!this.rb; // 邊閃邊打的加成：金色的傷害數字（mech-ranged.js）
            t.hrPw = !!this.pwk; // 蓄力強力彈：受擊反應放大（mech-hit-react.js）
            if (t === direct && this.hitPI >= 0) t.hitPart = this.hitPI; // 直接打中的區塊（render/hit-parts.js）
            t.takeDamage(
              this.dmg * k,
              im,
              this.owner,
              this.pos,
              undefined,
              undefined,
              this.wid,
              this.attr || (this.wid ? undefined : 'exp'), // 沒有武器 id 的爆炸（迫擊砲、魚雷…）算爆發
            );
            t.rbGold = false;
            t.hrPw = false;
            if (this.rb && this.owner && this.owner.rbHit && g.isHostile(this.owner, t)) {
              this.owner.rbHit(t, this.rb);
              this.rb = 0; // 一顆只提示一次
            }
            if (this.wty && this.owner && this.owner.feelHit && g.isHostile(this.owner, t))
              this.owner.feelHit(t, this.kind, t.pos.clone().sub(this.pos), im); // 手感：爆炸把小型敵人打飛（mech-feel.js）
            if ((this.pwSlot || this.pwk) && this.owner && this.owner.pwGain && g.isHostile(this.owner, t)) {
              if (this.pwSlot) this.owner.pwGain(this.pwSlot, this.pwGrp); // 蓄力射擊的充能（mech-charge.js）
              if (this.pwk) this.owner.pwHitPop(t, this.pwk);
              this.pwSlot = this.pwk = null;
            }
          }
        }
      }
    } else if (direct) {
      const dir = this.vel.clone().normalize();
      g.hitFxOff = true; // 直接打中的：火花與碎片在下面自己噴（知道彈道與表面）
      if (direct.isProp)
        g.damageProp(direct, this.dmg, this.impactV, this.pos, this.owner, this.attr, this.wid);
      else {
        // 實彈：超過理想射程遞減（data/attrs.js）
        let fk = 1;
        if (this.fall) {
          const dd = this.pos.distanceTo(this.p0);
          if (dd > this.fall[0])
            fk =
              1 -
              (1 - KIN_FALL_MIN) *
                Math.min(1, (dd - this.fall[0]) / Math.max(1, this.fall[1] - this.fall[0]));
        }
        direct.rbGold = !!this.rb;
        direct.wpAimK = this.wpk || null; // 準星壓在弱點上射出的（mech-weak.js）
        direct.hrPw = !!this.pwk; // 蓄力強力彈：受擊反應放大（mech-hit-react.js）
        if (this.hitPI >= 0) direct.hitPart = this.hitPI; // 打中的區塊（render/hit-parts.js）：那一塊閃紅
        direct.takeDamage(
          this.dmg * fk,
          this.impactV,
          this.owner,
          this.pos,
          dir,
          undefined,
          this.wid,
          this.attr,
        );
        direct.rbGold = false;
        direct.wpAimK = null;
        direct.hrPw = false;
        if (this.rb && this.owner && this.owner.rbHit) this.owner.rbHit(direct, this.rb);
        if (this.wty && this.owner && this.owner.feelHit && !direct.isShot && g.isHostile(this.owner, direct))
          this.owner.feelHit(direct, this.wty, dir, this.impactV, { mg: this.mg, slug: this.pwk === 'slug' }); // 手感
        if (this.owner && this.owner.pwGain && !direct.isShot && g.isHostile(this.owner, direct)) {
          if (this.pwSlot) this.owner.pwGain(this.pwSlot, this.pwGrp); // 蓄力射擊的充能（mech-charge.js）
          if (this.pwk) this.owner.pwHitPop(direct, this.pwk);
        }
      }
      g.hitFxOff = false;
      if (this.hitPI >= 0 && this.hitN) {
        // 人形機甲：火花沿表面法線往外濺，加上小碎片（從真正的命中點）
        g.fx.spark(this.pos, this.color || 0xffe0a0, _pjC.copy(this.hitN).negate());
        g.fx.mechChips(this.pos, this.hitN);
      } else {
        // 其他（載具、專屬敵人、Boss、地圖物件）：命中點在判定的表面上，碎片往外（中心 → 命中點）
        g.fx.spark(this.pos, this.color || 0xffe0a0, dir);
        _pjC.copy(this.pos);
        if (direct.center) _pjC.sub(direct.center());
        if (!direct.center || _pjC.lengthSq() < 1e-4) _pjC.copy(dir).negate();
        g.fx.mechChips(this.pos, _pjC.normalize());
      }
      this.hitPI = -1;
      // 能量武器打中機體：電弧（docs/vfx-design.md）
      if ((this.attr || (this.wid && weaponAttr(weaponById(this.wid)))) === 'en')
        g.fx.arc(this.pos, 0.7, this.color || 0x9fe0ff);
      SFX.hit(direct.isPlayer ? null : this.pos, direct);
      if (this.owner && this.owner.isPlayer && !direct.isPlayer) g.rumble(0.05, 0.25, 40);
    } else {
      // 打在地形上（不是物件）：spark 的第 4 個參數 'g'＝依地面材質（第 8.4 期，docs/vfx-design.md）
      const gy = g.world ? g.world.terrainHeight(this.pos.x, this.pos.z) : -1e9;
      g.fx.spark(
        this.pos,
        0xfff0d0,
        this.vel.clone().normalize(),
        Math.abs(this.pos.y - gy) < 1.2 * g.fx.k ? 'g' : undefined,
      );
      SFX.hitWorld(this.pos);
      if (this.wty && this.kind === 'bullet' && g.bulletMark) g.bulletMark(this.pos, this.wty); // 地面的彈痕（game/feel.js）
    }
  }
}
