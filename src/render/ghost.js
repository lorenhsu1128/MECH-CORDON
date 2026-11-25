// 殘影（docs/vfx-design.md 第 6 期，只給玩家自己）：複製機體當下的姿勢，畫成淡的加色剪影，GHOST_T 秒淡出。
// 網格共用原本的幾何；蒙皮網格（mesh-merge.js 的合併：每個錨點一根骨頭）另建一副骨架，骨頭的世界矩陣凍結在複製的那一刻
// （骨頭不在場景裡，不會被更新）。描邊外殼、加色與半透明的網格（推進器光暈等）略過。同時最多 MAX 個。
// 材質用完放回池子、不 dispose：dispose 會讓 three.js 釋放著色器程式，下一次 QB 又要重新編譯
// （低標的電腦一次 50～400 ms，2026-11-25 的效能檢查）；出擊的預熱（ghostWarm）先編好
import { isOutline } from './geometry.js';

const POOL = { b: [], s: [] };
function poolMat(skin, color) {
  const m =
    POOL[skin ? 's' : 'b'].pop() ||
    new THREE.MeshBasicMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  m.color.set(color);
  m.opacity = OPACITY;
  m.userData.ghostSkin = skin;
  return m;
}
// 著色器預熱（Game.shaderWarm）：一般與蒙皮各一個（材質用完放回池子，程式一直留著）
export function ghostWarm() {
  const g = new THREE.Group();
  const geo = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  const mb = poolMat(false, 0xffffff);
  g.add(new THREE.Mesh(geo, mb));
  const sg = geo.clone();
  const n = sg.attributes.position.count;
  sg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
  sg.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).fill(0.25), 4));
  const b = new THREE.Bone();
  const ms = poolMat(true, 0xffffff);
  const sm = new THREE.SkinnedMesh(sg, ms);
  sm.add(b);
  sm.bind(new THREE.Skeleton([b]));
  sm.renderOrder = 3;
  g.add(sm);
  POOL.b.push(mb);
  POOL.s.push(ms);
  return g;
}

const GHOST_T = 0.25;
const MAX = 6;
const OPACITY = 0.24;

export class GhostFx {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
  }
  // root：機體的模型群組；color：殘影的顏色（推進器的顏色）
  snap(root, color) {
    if (this.list.length >= MAX) this.drop(this.list.shift());
    root.updateMatrixWorld(true);
    const grp = new THREE.Group();
    const mats = [],
      skels = [];
    const mk = (skin) => {
      const m = poolMat(skin, color);
      mats.push(m);
      return m;
    };
    let mBasic = null,
      mSkin = null;
    root.traverseVisible((o) => {
      if (
        !o.isMesh ||
        o.isInstancedMesh ||
        !o.geometry ||
        (o.userData && (o.userData.helper || o.userData.xray))
      )
        return;
      const om = Array.isArray(o.material) ? o.material[0] : o.material;
      if (
        !om ||
        isOutline(om) ||
        om.blending === THREE.AdditiveBlending ||
        (om.transparent && om.opacity < 0.9)
      )
        return;
      let g;
      if (o.isSkinnedMesh && o.skeleton) {
        const bones = o.skeleton.bones.map((b) => {
          const nb = new THREE.Bone();
          nb.matrixAutoUpdate = false;
          nb.matrixWorld.copy(b.matrixWorld);
          return nb;
        });
        const sk = new THREE.Skeleton(bones, o.skeleton.boneInverses);
        skels.push(sk);
        g = new THREE.SkinnedMesh(o.geometry, mSkin || (mSkin = mk(true)));
        g.bindMode = o.bindMode;
        g.bind(sk, o.bindMatrix);
      } else g = new THREE.Mesh(o.geometry, mBasic || (mBasic = mk(false)));
      g.matrixAutoUpdate = false;
      g.matrix.copy(o.matrixWorld);
      g.matrixWorld.copy(o.matrixWorld);
      g.frustumCulled = false;
      g.renderOrder = 3;
      g.userData.noAO = true; // 不進 SSAO 的法線圖
      g.userData.noFade = true;
      grp.add(g);
    });
    grp.matrixAutoUpdate = false;
    this.scene.add(grp);
    this.list.push({ grp, mats, skels, t: 0 });
  }
  update(dt) {
    for (const e of this.list) {
      e.t += dt;
      const o = OPACITY * Math.max(0, 1 - e.t / GHOST_T);
      for (const m of e.mats) m.opacity = o;
    }
    while (this.list.length && this.list[0].t >= GHOST_T) this.drop(this.list.shift());
  }
  drop(e) {
    this.scene.remove(e.grp);
    for (const m of e.mats) POOL[m.userData.ghostSkin ? 's' : 'b'].push(m);
    for (const s of e.skels) if (s.dispose) s.dispose();
  }
  clear() {
    for (const e of this.list) this.drop(e);
    this.list.length = 0;
  }
}
