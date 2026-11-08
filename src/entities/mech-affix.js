// ---------- MechEntity 擴充：敵人詞綴（主線擴充 B4，data/affix.js、docs/campaign-expansion-design.md） ----------
// af＝詞綴位元（生成時決定，生成紀錄同步）；afs＝執行中的狀態（隱形中、狂暴中、反射中；快照同步）。
// 判定（護盾、反射、指揮的減傷、隱形與狂暴的切換、再生、磁力）只在房主／單機；外觀（正面護盾、隱形的透明、
// 狂暴的紅色光殼、反射的光殼、指揮的地面光環）各端照 af／afs 做（afFx，specialFx 每格呼叫）。擊破時的分裂、殉爆在 game/affix.js。
import { SFX } from '../audio/audio.js';
import { AF, AFFIXES, AFS } from '../data/affix.js';
import { hexShieldMat, hexShieldHit } from '../render/hex-shield.js';
import { MechEntity } from './mech-entity.js';

const B = (k) => AFFIXES[k].bit;
// 正面護盾的幾何：單位球的前方（−Z）±70° 的球冠
let CAP_GEO = null;
const capGeo = () =>
  CAP_GEO ||
  (CAP_GEO = (() => {
    const geo = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, 1.22);
    geo.rotateX(-Math.PI / 2); // 球冠的軸由 +Y 轉到 −Z（機體的正面）
    return geo;
  })());
let BALL_GEO = null;

Object.assign(MechEntity.prototype, {
  afHas(k) {
    return !!(this.af && this.af & B(k));
  },
  // 受傷前（takeDamage，specialDefense 之後）：回傳 [傷害, 衝擊]，null＝完全擋下。A＝屬性
  afDefense(dmg, impact, from, at, melee, A) {
    const g = this.game;
    // 指揮：範圍內的友軍（不含自己）受到的傷害減少
    if (g.afLeaders && g.afLeaders.length && this.team === 'enemy')
      for (const L of g.afLeaders)
        if (L !== this && !L.dead && L.pos.distanceTo(this.pos) < AF.LEADER_R) {
          dmg *= AF.LEADER_K;
          break;
        }
    if (!this.af) return [dmg, impact];
    this.afHitT = this.t;
    this.afShowT = this.t; // 隱形：被打到現形
    // 反射：反射中彈開實彈（近戰、爆發、能量照常）
    if (this.afs & AFS.REFLECT && !melee && A === 'kin') {
      if ((this.afRefT || 0) < this.t) {
        this.afRefT = this.t + 0.25;
        g.fx.spark(at || this.center(), 0xbfe8ff);
        SFX.play('shield', 0.6, 1.5, 0.05, 0.05, this.center());
        g.popDamage(at || this.center(), '反射', false, false, false, 0, this.id);
      }
      return null;
    }
    // 正面護盾：從正面打來的遠程攻擊（攻擊者沒有高很多）大幅減傷；近戰照常
    if (this.afHas('shield') && !melee && from && from.pos) {
      const to = (at && at.distanceTo(this.center()) > this.radius * 0.6 ? at : from.pos)
        .clone()
        .sub(this.pos);
      to.y = 0;
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const hi = from.center ? from.center().y - this.center().y : 0;
      if (to.lengthSq() > 0.01 && to.normalize().dot(fwd) > AF.SHIELD_DOT && hi < 4 * this.dk) {
        this.afShieldHit = (this.afShieldHit || 0) + 1; // 客機的漣漪靠快照（afs 不帶，各端只在房主看得到漣漪）
        if (this.afCap && this.afCap.material.uniforms)
          hexShieldHit(this.afCap.material, new THREE.Vector3(0, 0, -1));
        return [dmg * AF.SHIELD_K, impact * 0.4];
      }
    }
    return [dmg, impact];
  },
  // 每格（房主／單機的判定＋各端的外觀；specialFx 呼叫）
  afFx(dt) {
    if (!this.af) return;
    const g = this.game,
      host = !this.remote;
    if (this.afShowT === undefined) {
      this.afShowT = this.t;
      this.afHitT = this.t;
      this.afRefPh = Math.random() * AF.REFLECT_CD;
    }
    if (host && !this.dead) {
      let s = this.afs || 0;
      // 隱形：停火 CLOAK_IDLE 秒後
      if (this.afHas('cloak')) {
        if (this.t - this.afShowT > AF.CLOAK_IDLE && this.staggerT <= 0) s |= AFS.CLOAK;
        else s &= ~AFS.CLOAK;
      }
      // 狂暴：AP 剩一半（一次）
      if (this.afHas('berserk') && !(s & AFS.BERSERK) && this.hp < this.maxHp * AF.BERSERK_AT) {
        s |= AFS.BERSERK;
        this.speedMul *= AF.BERSERK_SPD;
        this.dmgMul *= AF.BERSERK_DMG;
        g.fx.shockwave(this.center(), 5 * this.dk, 0xff4030, 0.4);
        SFX.play('alarm', 0.4, 1.2, 0.05, 0.3, this.center());
      }
      // 反射：每 REFLECT_CD 秒有 REFLECT_T 秒
      if (this.afHas('reflect')) {
        const ph = (this.t + this.afRefPh) % AF.REFLECT_CD;
        if (ph < AF.REFLECT_T) s |= AFS.REFLECT;
        else s &= ~AFS.REFLECT;
      }
      // 再生：REGEN_WAIT 秒沒被打
      if (this.afHas('regen') && this.t - this.afHitT > AF.REGEN_WAIT && this.hp < this.maxHp)
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * AF.REGEN_RATE * dt);
      // 磁力：附近玩家的導彈改追自己
      if (this.afHas('magnet'))
        for (const pr of g.projectiles || []) {
          if (pr.dead || pr.kind !== 'missile' || pr.team === this.team || pr.target === this) continue;
          if (pr.pos.distanceTo(this.pos) < AF.MAGNET_R) pr.target = this;
        }
      this.afs = s;
    }
    const s = this.afs || 0;
    // 隱形：透明、不能鎖定（房主與客機各自依 afs）
    if (this.afHas('cloak')) {
      const want = s & AFS.CLOAK ? 0.12 : 1;
      this.afCloakA =
        this.afCloakA === undefined ? 1 : this.afCloakA + (want - this.afCloakA) * Math.min(1, dt * 6);
      this.applyCloak(this.afCloakA);
      this.noLock = !!(s & AFS.CLOAK);
    }
    const mesh = this.mesh;
    if (!mesh) return;
    const sc = mesh.scale.x || 1;
    const R = Math.max(this.radius * 1.5, (this.model ? this.model.height : 3) * 0.7);
    const cy = (this.model ? this.model.height * 0.5 : this.radius) / sc;
    // 正面護盾
    if (this.afHas('shield')) {
      if (!this.afCap) {
        const mat = g.fx.rich
          ? hexShieldMat(0x5cc8ff)
          : new THREE.MeshBasicMaterial({
              color: 0x5cc8ff,
              transparent: true,
              opacity: 0.25,
              side: THREE.DoubleSide,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
            });
        this.afCap = new THREE.Mesh(capGeo(), mat);
        this.afCap.userData.noFade = true;
        this.afCap.userData.helper = true;
        this.afCap.renderOrder = 4;
        mesh.add(this.afCap);
      }
      this.afCap.position.set(0, cy, 0);
      this.afCap.scale.setScalar(R / sc);
      this.afCap.visible = !(s & AFS.CLOAK);
      const U = this.afCap.material.uniforms;
      if (U) {
        U.uTime.value = g.fx.time;
        U.uOp.value = 0.85;
      }
    }
    // 反射中：整個罩一層淡藍的光殼；狂暴中：紅色的光殼（材質可能和同型的敵人共用，所以不改機體的材質）
    if (this.afHas('reflect') || this.afHas('berserk')) {
      if (!this.afBall) {
        BALL_GEO = BALL_GEO || new THREE.SphereGeometry(1, 20, 12);
        this.afBall = new THREE.Mesh(
          BALL_GEO,
          new THREE.MeshBasicMaterial({
            color: 0xbfe8ff,
            transparent: true,
            opacity: 0.22,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        this.afBall.userData.noFade = true;
        this.afBall.userData.helper = true;
        mesh.add(this.afBall);
      }
      const ref = !!(s & AFS.REFLECT),
        ber = !!(s & AFS.BERSERK);
      this.afBall.visible = (ref || ber) && !(s & AFS.CLOAK);
      this.afBall.material.color.setHex(ref ? 0xbfe8ff : 0xff3020);
      this.afBall.position.set(0, cy, 0);
      this.afBall.scale.setScalar((R * (ref ? 1.05 : 0.95)) / sc);
      this.afBall.material.opacity = (ref ? 0.16 : 0.1) + 0.08 * Math.sin(this.t * (ref ? 14 : 9));
      if (ber && !ref) {
        this.afFireT = (this.afFireT || 0) - dt;
        if (this.afFireT <= 0) {
          this.afFireT = 0.18;
          g.fx.spark(this.center(), 0xff5020);
        }
      }
    }
    // 指揮：地面的範圍光環
    if (this.afHas('leader')) {
      if (!this.afRing) {
        this.afRing = new THREE.Mesh(
          new THREE.RingGeometry(0.96, 1, 64),
          new THREE.MeshBasicMaterial({
            color: 0xffc040,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        this.afRing.rotation.x = -Math.PI / 2;
        this.afRing.userData.noFade = true;
        this.afRing.userData.helper = true;
        mesh.add(this.afRing);
      }
      this.afRing.position.set(0, 0.3 / sc, 0);
      this.afRing.scale.setScalar(AF.LEADER_R / sc);
      this.afRing.visible = !(s & AFS.CLOAK);
    }
    // 再生中：綠色的小光點
    if (this.afHas('regen') && this.hp < this.maxHp && this.t - (this.afHitT || 0) > AF.REGEN_WAIT) {
      this.afSpT = (this.afSpT || 0) - dt;
      if (this.afSpT <= 0) {
        this.afSpT = 0.25;
        g.fx.spark(this.center(), 0x7ee081);
      }
    }
  },
});
