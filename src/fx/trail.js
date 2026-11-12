// ============================================================
//  帶狀軌跡（機甲動作改版第四期，docs/mech-animation.md）：近戰武器刀尖的刀光、滑行／QB 時地面的推進氣流帶。
//  呼叫端每格以 push(key, a, b, o) 加一對點（帶子的兩個邊），每個點存活 o.life 秒、越舊越透明；
//  同一個 key 是同一條帶子，一段時間沒有新的點就移除。只有外觀，房主與客機各自算、不轉送。
//  o.ground：地面的帶子（滑行的氣流與痕跡，entities/mech-trails.js）改用 GVS／GFS：橫向的柔和邊緣、
//  沿著帶子的條紋（以世界距離算，痕跡不會跟著滑動；flow＝條紋往後流動的速度）、越舊越窄（shrink）。
// ============================================================
import { isOutline } from '../render/geometry.js';

const VS = `
attribute float alpha;
varying float vA;
void main() {
  vA = alpha;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FS = `
uniform vec3 color;
uniform float opacity;
varying float vA;
void main() {
  gl_FragColor = vec4(color, opacity * vA);
}`;

// 地面的帶子：cu.x＝橫向（0～1）、cu.y＝沿著帶子的世界距離（÷機體倍率）
const GVS = `
attribute float alpha;
attribute vec2 cu;
varying float vA;
varying vec2 vC;
void main() {
  vA = alpha;
  vC = cu;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const GFS = `
uniform vec3 color;
uniform float opacity;
uniform float soft;
uniform float streak;
uniform float freq;
uniform float flow;
uniform float time;
uniform float core;
uniform float along;
varying float vA;
varying vec2 vC;
float h1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h1(i), h1(i + vec2(1.0, 0.0)), f.x), mix(h1(i + vec2(0.0, 1.0)), h1(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float e = 1.0 - abs(vC.x * 2.0 - 1.0);
  float a = smoothstep(0.0, soft, e);
  // 條紋：橫向分成幾條，沿著帶子慢慢變化（拉長的雜訊＝速度線）
  float y = vC.y * along - time * flow;
  float n = vn(vec2(vC.x * freq, y)) * 0.65 + vn(vec2(vC.x * freq * 2.3 + 7.0, y * 1.7)) * 0.35;
  a *= mix(1.0, smoothstep(0.28, 0.72, n), streak);
  // 中線比較亮（氣流的核心）
  vec3 c = color + vec3(core) * smoothstep(0.55, 1.0, e);
  gl_FragColor = vec4(c, opacity * vA * a);
}`;

class Ribbon {
  constructor(scene, max, o) {
    this.max = max;
    this.pts = []; // { a, b, t }（t＝已經存在的秒數）
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 2 * 3);
    this.alp = new Float32Array(max * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alp, 1).setUsage(THREE.DynamicDrawUsage));
    const G = o.ground;
    if (G) {
      this.cu = new Float32Array(max * 2 * 2);
      g.setAttribute('cu', new THREE.BufferAttribute(this.cu, 2).setUsage(THREE.DynamicDrawUsage));
      this.dist = 0; // 沿著帶子累積的距離
    }
    const idx = [];
    for (let i = 0; i < max - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    g.setDrawRange(0, 0);
    const U = { color: { value: new THREE.Color(o.color) }, opacity: { value: o.opacity } };
    if (G)
      Object.assign(U, {
        soft: { value: G.soft != null ? G.soft : 0.6 },
        streak: { value: G.streak != null ? G.streak : 0.6 },
        freq: { value: G.freq || 6 },
        flow: { value: G.flow || 0 },
        core: { value: G.core || 0 },
        along: { value: G.along || 0.7 },
        time: { value: 0 },
      });
    this.mat = new THREE.ShaderMaterial({
      vertexShader: G ? GVS : VS,
      fragmentShader: G ? GFS : FS,
      uniforms: U,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = G ? (o.additive ? 3 : 2) : o.additive ? 6 : 4;
    this.mesh.userData.noFade = true;
    this.mesh.userData.helper = true;
    scene.add(this.mesh);
    this.idle = 0;
    this.o = o;
  }
}

export class RibbonFx {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
    this.time = 0;
  }
  // a、b：世界座標（會複製）；o：{ color, opacity, life（秒）, max（點數）, additive,
  //   ground（地面的帶子：{ soft, streak, freq 橫向條數, along 沿著帶子的變化, flow, core, k 機體倍率 }）, shrink（越舊越窄的比例）,
  //   minD（和前一個點的距離小於它時只移動最新的點，點數不會因為慢速而用完） }
  push(key, a, b, o) {
    let r = this.map.get(key);
    if (!r) {
      r = new Ribbon(this.scene, o.max || 16, o);
      this.map.set(key, r);
    }
    r.o.life = o.life;
    r.mat.uniforms.color.value.set(o.color);
    r.mat.uniforms.opacity.value = o.opacity;
    r.idle = 0;
    r.o.shrink = o.shrink || 0;
    const P = r.pts;
    if (o.minD && P.length >= 2) {
      // 最新的點跟著腳走；離前一個固定的點夠遠才固定下來
      const q = P[P.length - 2],
        L = P[P.length - 1];
      const d = Math.hypot((a.x + b.x - q.a.x - q.b.x) / 2, (a.z + b.z - q.a.z - q.b.z) / 2);
      if (d < o.minD) {
        L.a.copy(a);
        L.b.copy(b);
        L.t = 0;
        L.d = q.d + d / ((o.ground && o.ground.k) || 1);
        return;
      }
    }
    let d = 0;
    if (r.cu && P.length) {
      const q = P[P.length - 1];
      d =
        q.d +
        Math.hypot((a.x + b.x - q.a.x - q.b.x) / 2, (a.z + b.z - q.a.z - q.b.z) / 2) /
          ((o.ground && o.ground.k) || 1);
    }
    P.push({ a: a.clone(), b: b.clone(), t: 0, d });
    if (P.length > r.max) P.shift();
  }
  // 中斷這條帶子（下一個點從新的一段開始）：例如刀光的一招結束、離地
  cut(key) {
    const r = this.map.get(key);
    if (r) r.pts.length = 0;
  }
  update(dt) {
    this.time += dt;
    for (const [key, r] of this.map) {
      if (r.cu) r.mat.uniforms.time.value = this.time;
      r.idle += dt;
      const life = r.o.life;
      let n = 0;
      for (const p of r.pts) p.t += dt;
      while (r.pts.length && r.pts[0].t >= life) r.pts.shift();
      const P = r.pts;
      for (let i = 0; i < P.length; i++) {
        const p = P[i],
          j = n * 6,
          // 越舊越透明；最新的一點也稍微淡一點，帶子的頭比較尖
          f = (1 - p.t / life) * (i === P.length - 1 ? 0.6 : 1);
        // 越舊越窄（往中線收）
        const sh = r.o.shrink ? (r.o.shrink * p.t) / life / 2 : 0;
        r.pos[j] = p.a.x + (p.b.x - p.a.x) * sh;
        r.pos[j + 1] = p.a.y + (p.b.y - p.a.y) * sh;
        r.pos[j + 2] = p.a.z + (p.b.z - p.a.z) * sh;
        r.pos[j + 3] = p.b.x + (p.a.x - p.b.x) * sh;
        r.pos[j + 4] = p.b.y + (p.a.y - p.b.y) * sh;
        r.pos[j + 5] = p.b.z + (p.a.z - p.b.z) * sh;
        if (r.cu) {
          const c = n * 4;
          r.cu[c] = 0;
          r.cu[c + 1] = p.d;
          r.cu[c + 2] = 1;
          r.cu[c + 3] = p.d;
        }
        r.alp[n * 2] = f;
        r.alp[n * 2 + 1] = f * (r.o.edge !== undefined ? r.o.edge : 1);
        n++;
      }
      const g = r.mesh.geometry;
      g.attributes.position.needsUpdate = true;
      g.attributes.alpha.needsUpdate = true;
      if (r.cu) g.attributes.cu.needsUpdate = true;
      g.setDrawRange(0, Math.max(0, n - 1) * 6);
      if (!P.length && r.idle > 1) {
        this.scene.remove(r.mesh);
        g.dispose();
        r.mat.dispose();
        this.map.delete(key);
      }
    }
  }
  clear() {
    for (const r of this.map.values()) {
      this.scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mat.dispose();
    }
    this.map.clear();
  }
}

// 近戰武器的刀尖與刀根（武器持握層的區域座標）：在合併網格之前量（MechEntity.mergeModel）。
// 刀身沿著持握層的 Z 軸（−Z 是刀尖），取外框在 Z 上離握點最遠的那一端
export function measureBlades(rig) {
  if (!rig || rig.vehicle || !rig.arms) return;
  rig.group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4(),
    m = new THREE.Matrix4(),
    box = new THREE.Box3(),
    bb = new THREE.Box3();
  for (const k of ['l', 'r']) {
    const a = rig.arms[k];
    if (!a || !a.weapon) continue;
    const ref = a.aim || a.weapon;
    inv.copy(ref.matrixWorld).invert();
    box.makeEmpty();
    ref.traverse((o) => {
      if (!o.isMesh || !o.geometry || o.userData.helper || isOutline(o.material) || !o.visible) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      m.multiplyMatrices(inv, o.matrixWorld);
      bb.copy(o.geometry.boundingBox).applyMatrix4(m);
      box.union(bb);
    });
    if (box.isEmpty()) continue;
    const z = Math.abs(box.min.z) >= Math.abs(box.max.z) ? box.min.z : box.max.z;
    const cx = (box.min.x + box.max.x) / 2,
      cy = (box.min.y + box.max.y) / 2;
    a.bladeRef = ref;
    a.bladeTip = new THREE.Vector3(cx, cy, z);
    a.bladeBase = new THREE.Vector3(cx, cy, z * 0.45);
  }
}
