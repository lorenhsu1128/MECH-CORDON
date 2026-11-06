// ============================================================
//  能量的外觀（docs/vfx-design.md 第 9 期）：護罩、Boss 的大招、預警標示用的著色器材質。只有外觀，各端自己畫。
//  時間一律用特效時鐘（fx.time：暫停時停住），由擁有者每格寫進 uTime。
//  - armorMat：貼著機體的能量層（脈衝裝甲、無敵時間）：沿法線往外推一點、可以蒙皮，kind 0＝流動的斜紋、1＝往上掃的掃描線
//  - barrierMat：弧面的屏障（Boss 的正面護盾、脈衝盾擋下時的閃光）：經線的肋條、往上掃的亮帶、邊緣淡出、命中的波紋
// ============================================================
export const ENERGY_COL = { ally: 0x5fe0ff, enemy: 0xff3c8c };
export const energyCol = (team) => (team === 'enemy' ? ENERGY_COL.enemy : ENERGY_COL.ally);

const NOISE = /* glsl */ `
float hash1(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash1(i), hash1(i + vec2(1.0, 0.0)), u.x), mix(hash1(i + vec2(0.0, 1.0)), hash1(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) { return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.1 + 3.7) + 0.15 * vnoise(p * 4.3 + 7.1); }
`;

// ---------- 貼身的能量層 ----------
const ARMOR_VS = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
uniform float uThick;
varying vec3 vW;
varying vec3 vN;
varying vec3 vV;
void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vec3 wn = normalize(mat3(modelMatrix) * objectNormal);
  wp.xyz += wn * uThick;
  vW = wp.xyz;
  vN = wn;
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const ARMOR_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOp, uTime, uK, uKind, uHit;
varying vec3 vW;
varying vec3 vN;
varying vec3 vV;
${NOISE}
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  vec3 w = vW / uK;
  float a;
  if (uKind < 0.5) {
    // 脈衝裝甲：斜向流動的能量紋＋雜訊的脈動
    float s = fract(dot(w, vec3(0.55, 1.0, 0.35)) * 0.9 - uTime * 1.2);
    float band = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.12, 0.3, s));
    float n = fbm(w.xz * 1.3 + w.y * 0.7 + uTime * 0.6);
    a = 0.02 + 0.7 * fres + 0.38 * band + 0.14 * smoothstep(0.6, 0.85, n);
  } else {
    // 無敵時間：往上掃的細掃描線＋一條亮的掃描帶
    float l = smoothstep(0.75, 1.0, fract(w.y * 2.2 - uTime * 1.5));
    float sweep = exp(-pow((fract(w.y * 0.18 - uTime * 0.9) - 0.5) * 9.0, 2.0));
    a = 0.03 + 0.7 * fres + 0.3 * l + 0.5 * sweep;
  }
  a += uHit * (0.6 + fres);
  vec3 c = mix(uColor, vec3(1.0), clamp(fres * 0.25 + uHit * 0.5, 0.0, 0.8));
  gl_FragColor = vec4(c * a * uOp, 1.0);
}`;

export function armorMat(color, kind, k) {
  return new THREE.ShaderMaterial({
    vertexShader: ARMOR_VS,
    fragmentShader: ARMOR_FS,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOp: { value: 0 },
      uTime: { value: 0 },
      uK: { value: k || 1 },
      uKind: { value: kind },
      uHit: { value: 0 },
      uThick: { value: 0.06 * (k || 1) },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// ---------- 弧面的屏障 ----------
const BAR_VS = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vUv = uv;
  vP = normalize(position);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const BAR_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOp, uTime, uRibs;
uniform vec4 uHit[3];
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
${NOISE}
void main() {
  // uv：x＝經度、y＝緯度（SphereGeometry 的部分球面，0～1）
  float edge = smoothstep(0.0, 0.14, vUv.x) * smoothstep(1.0, 0.86, vUv.x) * smoothstep(0.0, 0.12, vUv.y) *
    smoothstep(1.0, 0.88, vUv.y);
  float rib = smoothstep(0.42, 0.5, abs(fract(vUv.x * uRibs) - 0.5));
  float scan = exp(-pow((fract(vUv.y * 0.8 - uTime * 0.7) - 0.5) * 7.0, 2.0));
  float n = fbm(vec2(vUv.x * 9.0, vUv.y * 6.0 - uTime * 1.6));
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
  float hit = 0.0;
  for (int i = 0; i < 3; i++) {
    float age = uTime - uHit[i].w;
    if (age < 0.0 || age > 0.7) continue;
    float d = acos(clamp(dot(vP, uHit[i].xyz), -1.0, 1.0));
    hit += exp(-pow((d - age * 2.4) / 0.1, 2.0)) * (1.0 - age / 0.7) + smoothstep(0.35, 0.0, d) * max(0.0, 1.0 - age / 0.35);
  }
  float a = (0.1 + 0.32 * rib + 0.35 * scan + 0.22 * n + 0.3 * fres + hit * 0.8) * edge;
  vec3 c = mix(uColor, vec3(1.0), clamp(scan * 0.3 + hit * 0.5, 0.0, 0.8));
  gl_FragColor = vec4(c * a * uOp, 1.0);
}`;

export function barrierMat(color, ribs = 14) {
  const hit = [];
  for (let i = 0; i < 3; i++) hit.push(new THREE.Vector4(0, 0, -1, -99));
  const m = new THREE.ShaderMaterial({
    vertexShader: BAR_VS,
    fragmentShader: BAR_FS,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOp: { value: 1 },
      uTime: { value: 0 },
      uRibs: { value: ribs },
      uHit: { value: hit },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  m.userData.hitI = 0;
  return m;
}
// 命中的波紋：dir＝屏障網格的物件座標裡、從球心往命中點的方向
export function barrierHit(m, dir) {
  const U = m.uniforms;
  const v = U.uHit.value[m.userData.hitI++ % 3];
  const d = dir.clone().normalize();
  v.set(d.x, d.y, d.z, U.uTime.value);
}
// 弧面：以 −Z 為正面的部分球面（寬 w、高 h 弧度）；單位半徑，呼叫端縮放
const CAPS = {};
export function capGeo(w, h) {
  const key = w.toFixed(2) + ',' + h.toFixed(2);
  if (CAPS[key]) return CAPS[key];
  // SphereGeometry 的 phi 從 −X 往 +Z 轉：phiStart＝π/2＋π−w/2 讓中心在 −Z（three.js：x＝−cos(phi)·sin(theta)、z＝sin(phi)·sin(theta)）
  const g = new THREE.SphereGeometry(1, 24, 12, Math.PI * 1.5 - w / 2, w, Math.PI / 2 - h / 2, h);
  g.userData.shared = true;
  return (CAPS[key] = g);
}

// 著色器預熱（game/render-setup.js 的 shaderWarm）：每種材質一個假網格，新地圖第一次算繪前一起編好
export function energyWarm(k) {
  const g = new THREE.Group();
  const box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  for (const m of [armorMat(0xffffff, 0, k), barrierMat(0xffffff)]) {
    const o = new THREE.Mesh(box, m);
    o.frustumCulled = false;
    g.add(o);
  }
  return g;
}
