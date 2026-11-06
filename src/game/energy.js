// ============================================================
//  護罩（docs/vfx-design.md 第 9.2 期，砲火特效「華麗」）：
//  - 貼身的能量層（fx/energy.js 的 armorMat）：Boss 的脈衝裝甲（kind 0）、無敵時間（kind 1：緊急障壁、Boss 換型態、虛空拉回）
//  - Boss 的正面護盾（打斷大招時的 guard）：機體前方的弧面屏障（barrierMat），命中時 fx.shieldFlare
//  各端每格自己畫（MechEntity.specialFx → energyTick）；無敵時間由房主 invShow 送 inv 事件，脈衝裝甲隨快照的 bt 旗標 8。
// ============================================================
import { Game } from './game.js';
import { armorMat, barrierMat, capGeo, energyCol } from '../fx/energy.js';
import { isOutline } from '../render/geometry.js';

const KINDS = 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

Object.assign(Game.prototype, {
  // 房主／單機：無敵時間的外觀（sec 秒）；客機收到 inv 事件
  invShow(ent, sec) {
    if (!ent) return;
    ent.invT = Math.max(ent.invT || 0, sec);
    if (this.net && this.net.role === 'host') this.netEv({ t: 'inv', i: ent.id, s: +sec.toFixed(2) });
  },
  // 機體的能量層：在每個不透明網格底下掛一個共用幾何的網格（和 camera.js 的透視輪廓同樣的做法），kind 各一份材質
  energyLayer(ent, kind) {
    const L = (ent.enL = ent.enL || []);
    if (L[kind] && L[kind].for === ent.mesh) return L[kind];
    if (L[kind]) for (const o of L[kind].list) if (o.parent) o.parent.remove(o);
    const mat = armorMat(energyCol(ent.team), kind, this.fx.k);
    const list = [];
    const src = [];
    ent.mesh.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.xray || o.userData.enL || !o.geometry) return;
      const m = o.material;
      if (!m || Array.isArray(m) || m.transparent || isOutline(m) || m.blending === THREE.AdditiveBlending)
        return;
      if (!o.geometry.attributes.normal) return;
      src.push(o);
    });
    for (const o of src) {
      const x = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, mat) : new THREE.Mesh(o.geometry, mat);
      if (o.isSkinnedMesh) x.bind(o.skeleton, o.bindMatrix);
      x.userData.enL = true;
      x.userData.helper = true;
      x.renderOrder = 6;
      x.castShadow = x.receiveShadow = false;
      x.raycast = () => {};
      o.add(x);
      list.push(x);
    }
    mat.visible = false;
    return (L[kind] = { for: ent.mesh, mat, list, op: 0 });
  },
  // 每格（房主與客機，MechEntity.specialFx）
  energyTick(ent, dt) {
    if (ent.invT > 0) ent.invT -= dt;
    const rich = this.fx.rich && !ent.dead && ent.mesh && ent.mesh.visible !== false;
    const tv = ent.isBoss && ent.tierView ? ent.tierView() : null;
    const want = [rich && tv && tv.pa ? 1 : 0, rich && ent.invT > 0 ? 1 : 0];
    for (let k = 0; k < KINDS; k++) {
      const L = ent.enL && ent.enL[k];
      if (!want[k] && !(L && L.op > 0.01)) {
        if (L) L.mat.visible = false;
        continue;
      }
      const R = this.energyLayer(ent, k);
      R.op += ((want[k] ? 1 : 0) - R.op) * Math.min(1, dt * (want[k] ? 8 : 5));
      let op = R.op;
      // 無敵時間快結束時閃爍
      if (k === 1 && ent.invT > 0 && ent.invT < 0.6)
        op *= 0.45 + 0.55 * (Math.sin(this.fx.time * 40) > 0 ? 1 : 0);
      const U = R.mat.uniforms;
      U.uOp.value = op * (k === 0 ? 0.75 : 0.7);
      U.uTime.value = this.fx.time;
      U.uHit.value = Math.max(0, U.uHit.value - dt * 4);
      R.mat.visible = op > 0.01;
    }
    this.guardTick(ent, rich && tv && tv.guard && tv.chg >= 0, dt);
  },
  // 脈衝裝甲被打中：整層閃一下（房主在 tierArmorK，客機看不到命中，只有房主的畫面閃）
  energyHit(ent, k = 0) {
    const L = ent.enL && ent.enL[k];
    if (L) L.mat.uniforms.uHit.value = 1;
  },
  // Boss 的正面護盾：蓄力大招時擋住正面（mech-boss-tier.js 的 tierGuardK），弧面朝蓄力開始時面向的方向
  guardTick(ent, on, dt) {
    let G = ent.enG;
    if (!on && !(G && G.op > 0.01)) {
      if (G) G.mesh.visible = false;
      if (G) G.face = null;
      return;
    }
    if (!G) {
      const m = new THREE.Mesh(capGeo(2.0, 1.5), barrierMat(energyCol(ent.team), 18));
      m.renderOrder = 5;
      m.frustumCulled = false;
      m.userData.helper = true;
      G = ent.enG = { mesh: m, op: 0, face: null };
    }
    if (G.mesh.parent !== this.scene) this.scene.add(G.mesh);
    // 方向：房主＝蓄力的 face；客機＝第一次看到時的機體朝向
    const ch = ent.bt && ent.bt.ch;
    if (ch && ch.face) G.face = ch.face.clone();
    else if (on && !G.face) G.face = V(-Math.sin(ent.yaw || 0), 0, -Math.cos(ent.yaw || 0));
    G.op += ((on ? 1 : 0) - G.op) * Math.min(1, dt * (on ? 6 : 4));
    const r = Math.max(ent.radius * 1.6, ent.model.height * 0.75);
    const c = ent.center();
    const m = G.mesh;
    m.position.copy(c);
    if (G.face) m.lookAt(c.clone().sub(G.face));
    m.scale.setScalar(r);
    m.visible = G.op > 0.01;
    const U = m.material.uniforms;
    U.uOp.value = G.op * 0.85;
    U.uTime.value = this.fx.time;
  },
  // 實體被移除時（clearMission、擊破）：屏障從場景拿掉
  energyDrop(ent) {
    if (ent.enG && ent.enG.mesh.parent) ent.enG.mesh.parent.remove(ent.enG.mesh);
  },
});
