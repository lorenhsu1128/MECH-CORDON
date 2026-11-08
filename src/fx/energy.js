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

// ---------- 光柱（衛星砲的追蹤光柱、格子砲擊）：開口圓柱，uv.x＝圓周、uv.y＝高度 ----------
const COL_VS = /* glsl */ `
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const PILLAR_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOp, uTime, uLen;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
${NOISE}
void main() {
  // 面向鏡頭的中間最亮、兩側淡掉＝看起來是有體積的光
  float face = abs(dot(normalize(vN), normalize(vV)));
  float body = pow(face, 1.6);
  float core = pow(face, 9.0);
  // 往下流的能量（沿高度的條紋＋雜訊）
  float n = fbm(vec2(vUv.x * 7.0, vUv.y * uLen * 0.12 + uTime * 5.0));
  float streak = smoothstep(0.45, 0.9, fbm(vec2(vUv.x * 18.0, vUv.y * uLen * 0.03 + uTime * 9.0)));
  float top = smoothstep(1.0, 0.55, vUv.y);
  float a = (body * (0.35 + 0.55 * n) + streak * body * 0.6 + core * 0.9) * top;
  vec3 c = mix(uColor, vec3(1.0), clamp(core * 0.9 + n * 0.15, 0.0, 1.0));
  gl_FragColor = vec4(c * a * uOp, 1.0);
}`;
export function pillarMat(color) {
  return new THREE.ShaderMaterial({
    vertexShader: COL_VS,
    fragmentShader: PILLAR_FS,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOp: { value: 1 },
      uTime: { value: 0 },
      uLen: { value: 80 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

// ---------- 地面衝擊波的光牆（沿地形的帶狀網格，uv.x＝圓周、uv.y＝0 地面～1 頂端）----------
const WAVE_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOp, uTime;
varying vec2 vUv;
${NOISE}
void main() {
  float v = vUv.y;
  float n = fbm(vec2(vUv.x * 60.0, v * 2.5 - uTime * 3.0));
  float body = pow(1.0 - v, 1.4) * (0.45 + 0.75 * n);
  float crest = exp(-pow((v - (0.55 + 0.25 * n)) * 9.0, 2.0)) * 0.5;
  float base = exp(-pow(v * 10.0, 2.0)) * 1.2;
  float a = body + crest + base;
  vec3 c = mix(uColor, vec3(1.0), clamp(base * 0.5 + (1.0 - v) * 0.25, 0.0, 0.8));
  gl_FragColor = vec4(c * a * uOp, 1.0);
}`;
export function waveMat(color) {
  return new THREE.ShaderMaterial({
    vertexShader: COL_VS,
    fragmentShader: WAVE_FS,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOp: { value: 1 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

// ---------- 擴散的能量殼（能量環、光柱落地的衝擊）：球面，只有邊緣與波面的雜訊亮 ----------
const SHELL_VS = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vP = position;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const SHELL_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOp, uTime;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
${NOISE}
void main() {
  float fres = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  float rim = pow(fres, 3.0);
  float n = fbm(vec2(atan(vP.z, vP.x) * 4.0 + uTime * 1.5, vP.y * 5.0 - uTime * 4.0));
  float vein = smoothstep(0.62, 0.8, n) * pow(fres, 1.2);
  // 貼近地面的一圈最亮（能量環的波面掃過地面）
  float ground = smoothstep(0.3, 0.0, abs(vP.y)) * 0.6;
  float a = rim * (0.5 + 0.5 * n) + vein * 0.6 + ground * (0.45 + n);
  vec3 c = mix(uColor, vec3(1.0), clamp(rim * 0.4 + ground * 0.3, 0.0, 0.8));
  gl_FragColor = vec4(c * a * uOp, 1.0);
}`;
export function shellMat(color) {
  return new THREE.ShaderMaterial({
    vertexShader: SHELL_VS,
    fragmentShader: SHELL_FS,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOp: { value: 1 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

// ---------- 光束帶（瞄準線、連線光束、預警線）：A → B 的面向鏡頭的帶子 ----------
// geometry 是 ribbonGeo()（x −0.5～0.5、y 0～1），網格的位置一律在原點（頂點著色器直接算世界座標，frustumCulled＝false）
// kind 0＝往前流動的箭頭紋（預警線）、1＝流動的能量（瞄準線、連線光束）
const RIB_VS = /* glsl */ `
uniform vec3 uA, uB;
uniform float uW;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec3 ax = uB - uA;
  vec3 p = uA + ax * position.y;
  vec3 eye = normalize(cameraPosition - p);
  vec3 side = cross(normalize(ax), eye);
  side = length(side) > 1e-4 ? normalize(side) : vec3(1.0, 0.0, 0.0);
  p += side * position.x * uW;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const RIB_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOp, uTime, uLen, uKind, uFill;
varying vec2 vUv;
${NOISE}
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float y = vUv.y * uLen;
  float a;
  vec3 c = uColor;
  if (uKind < 0.5) {
    // 預警線：細的中線＋往前流動的箭頭（V 字），uFill＝充能（從起點亮到終點）
    float line = exp(-x * x * 40.0);
    float chev = fract(y * 0.35 + x * 0.6 - uTime * 2.2);
    float ch = smoothstep(0.0, 0.08, chev) * (1.0 - smoothstep(0.18, 0.3, chev)) * (1.0 - x);
    float filled = step(vUv.y, uFill);
    a = line * 0.9 + ch * (0.5 + 0.5 * filled) + filled * 0.12 * (1.0 - x);
    c = mix(uColor, vec3(1.0), line * 0.4);
  } else if (uKind > 1.5) {
    // 瞄準雷射（2026-11-08 預警改版）：柔和的光芯，充能時收細、變亮，光點從槍口往前跑（越接近發射越快）；沒有外框與箭頭
    float s = mix(0.42, 0.1, uFill);
    float core = exp(-x * x / (s * s));
    float glow = exp(-x * x * 3.0);
    float py = fract(uTime * (0.7 + 2.6 * uFill));
    float pulse = exp(-pow((vUv.y - py) * uLen / max(uLen * 0.06, 1.5), 2.0));
    a = core * (0.3 + 0.7 * uFill) * (1.0 + pulse * 0.8) + glow * (0.12 + 0.18 * uFill);
    a *= mix(1.0, 0.6, vUv.y);
    c = mix(uColor, vec3(1.0), core * (0.25 + 0.5 * uFill)) * (1.0 + core * uFill * 0.6);
  } else {
    // 能量：中間的亮芯＋兩側流動的雜訊
    float core = exp(-x * x * 30.0);
    float glow = exp(-x * x * 4.0);
    float n = fbm(vec2(y * 0.25 - uTime * 6.0, vUv.x * 3.0));
    a = core * 1.1 + glow * (0.25 + 0.5 * n);
    c = mix(uColor, vec3(1.0), core * 0.7);
  }
  float ends = smoothstep(0.0, 0.03, vUv.y) * smoothstep(1.0, 0.97, vUv.y);
  gl_FragColor = vec4(c * a * ends * uOp, 1.0);
}`;
let RIB_GEO = null;
export function ribbonGeo() {
  if (RIB_GEO) return RIB_GEO;
  RIB_GEO = new THREE.PlaneGeometry(1, 1, 1, 1);
  RIB_GEO.translate(0, 0.5, 0);
  RIB_GEO.userData.shared = true;
  return RIB_GEO;
}
export function ribbonMat(color, kind = 1) {
  return new THREE.ShaderMaterial({
    vertexShader: RIB_VS,
    fragmentShader: RIB_FS,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOp: { value: 1 },
      uTime: { value: 0 },
      uLen: { value: 10 },
      uKind: { value: kind },
      uFill: { value: 0 },
      uA: { value: new THREE.Vector3() },
      uB: { value: new THREE.Vector3(0, 0, -1) },
      uW: { value: 0.5 },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}
// 光束帶的網格：set(a, b, 寬)
export function ribbonMesh(color, kind = 1) {
  const m = new THREE.Mesh(ribbonGeo(), ribbonMat(color, kind));
  m.frustumCulled = false;
  m.renderOrder = 4;
  m.userData.helper = true;
  m.setAB = (a, b, w) => {
    const U = m.material.uniforms;
    U.uA.value.copy(a);
    U.uB.value.copy(b);
    U.uW.value = w;
    U.uLen.value = a.distanceTo(b);
  };
  return m;
}

// ---------- 地面的預警與範圍：圓（落點圈、地雷區、範圍圈）----------
// CircleGeometry(1)（平放：呼叫端轉 −90°），vP.xy 是 −1～1；uP＝填滿的進度（0～1，負的＝不填）、uFlash＝閃爍、uMode 0 預警／1 範圍（安靜一點）
const FLAT_VS = /* glsl */ `
varying vec2 vQ;
varying vec2 vUv;
void main() {
  vQ = position.xy;
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const DISC_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOp, uTime, uP, uFlash, uMode;
varying vec2 vQ;
void main() {
  float r = length(vQ);
  if (r > 1.0) discard;
  float ang = atan(vQ.y, vQ.x) / 6.2831853 + 0.5;
  float rim = smoothstep(0.9, 0.955, r) * (1.0 - smoothstep(0.985, 1.0, r));
  // 外圈內側一圈轉動的刻度
  float tk = step(0.5, fract(ang * (uMode > 0.5 ? 90.0 : 36.0) + uTime * (uMode > 0.5 ? 0.15 : 0.6))) * smoothstep(0.8, 0.83, r) * (1.0 - smoothstep(0.87, 0.89, r));
  // 往中心收的掃描環
  float sc = fract(r * 2.2 + uTime * (uMode > 0.5 ? 0.5 : 1.6));
  float scan = smoothstep(0.0, 0.03, sc) * (1.0 - smoothstep(0.05, 0.12, sc)) * (1.0 - r * 0.4);
  float fill = 0.0, front = 0.0;
  if (uP >= 0.0) {
    fill = step(r, uP) * 0.22;
    front = exp(-pow((r - uP) * 30.0, 2.0)) * 0.9;
  }
  float a = rim * 0.95 + tk * 0.55 + scan * (uMode > 0.5 ? 0.15 : 0.35) + fill + front + (uMode > 0.5 ? 0.04 : 0.06);
  a *= uFlash;
  vec3 c = mix(uColor, vec3(1.0), clamp(front * 0.5 + rim * 0.2, 0.0, 0.7));
  gl_FragColor = vec4(c * a * uOp, 1.0);
}`;
export function warnDiscMat(color, mode = 0) {
  return new THREE.ShaderMaterial({
    vertexShader: FLAT_VS,
    fragmentShader: DISC_FS,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOp: { value: 1 },
      uTime: { value: 0 },
      uP: { value: -1 },
      uFlash: { value: 1 },
      uMode: { value: mode },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

// ---------- 地面的預警：長方形（衝撞路線、進場路線、格子砲擊）----------
// PlaneGeometry(1, 1)，uv.y＝0 後端 → 1 前端；uSize＝(寬, 長)（公尺）；往前流動的斜紋、從後往前的填滿、兩側的邊
const RECT_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOp, uTime, uP, uFlash, uK;
uniform vec2 uSize;
varying vec2 vUv;
void main() {
  vec2 m = vUv * uSize / uK;
  float side = min(vUv.x, 1.0 - vUv.x) * uSize.x / uK;
  float endD = min(vUv.y, 1.0 - vUv.y) * uSize.y / uK;
  float edge = 1.0 - smoothstep(0.15, 0.6, min(side, endD));
  float s = fract((m.y + abs(m.x - uSize.x / uK * 0.5) * 0.8) * 0.28 - uTime * 1.6);
  float chev = smoothstep(0.0, 0.06, s) * (1.0 - smoothstep(0.22, 0.32, s));
  float filled = step(vUv.y, uP);
  float front = exp(-pow((vUv.y - uP) * uSize.y / uK * 1.5, 2.0));
  float a = edge * 0.9 + chev * (0.22 + 0.25 * filled) + filled * 0.12 + front * 0.6 * step(0.0, uP);
  a *= uFlash;
  vec3 c = mix(uColor, vec3(1.0), clamp(edge * 0.2 + front * 0.4, 0.0, 0.7));
  gl_FragColor = vec4(c * a * uOp, 1.0);
}`;
export function warnRectMat(color, w, l, k) {
  return new THREE.ShaderMaterial({
    vertexShader: FLAT_VS,
    fragmentShader: RECT_FS,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOp: { value: 1 },
      uTime: { value: 0 },
      uP: { value: 0 },
      uFlash: { value: 1 },
      uK: { value: k || 1 },
      uSize: { value: new THREE.Vector2(w, l) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

// ---------- 地面的預警（2026-11-08 改版，參考 FF14／Lost Ark）：柔和的色面，沒有描邊的實線 ----------
// 幾何是貼著地形的格子（fx/effects.js 的 warnGeo），uv＝圓：−1～1 的平面座標／長方形：0～1（uv.y 0 後端 → 1 前端）。
// 範圍＝淡的底色＋往邊緣漸亮的柔光（邊緣帶一點流動的雜訊）；時間＝裡面一層較亮的填色往外（圓）／往前（長方形）長，
// 前緣最亮，長滿＝命中；uHit＝命中瞬間的閃光。一般混合（不是加色）：雪地上看得到、夜間不刺眼
const AREA_VS = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const AREA_FS = /* glsl */ `
uniform vec3 uColor, uRim;
uniform float uOp, uTime, uP, uHit, uShape, uK, uChev;
uniform vec2 uSize;
varying vec2 vUv;
${NOISE}
void main() {
  float din, prog, len;
  vec2 pm;
  if (uShape < 0.5) {
    float r = length(vUv);
    din = (1.0 - r) * uSize.x;
    prog = r;
    len = uSize.x;
    pm = vUv * uSize.x;
  } else {
    pm = (vUv - 0.5) * uSize;
    vec2 hb = uSize * 0.5;
    float rc = min(min(hb.x, hb.y) * 0.6, 1.5 * uK);
    vec2 q = abs(pm) - hb + rc;
    din = -(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rc);
    prog = vUv.y;
    len = uSize.y;
  }
  // FF14 式的乾淨色面；邊緣淡（使用者 2026-11-08：邊緣不要濃）：中間比較濃，往外一段距離慢慢淡出，沒有亮圈
  vec2 m = pm / uK;
  float n = vnoise(m * 0.5 + vec2(uTime * 0.3, -uTime * 0.2));
  float dn = din + (n - 0.5) * 0.08 * uK;
  if (dn <= 0.0) discard;
  float hs = uShape < 0.5 ? uSize.x : min(uSize.x, uSize.y) * 0.5;
  float fw = clamp(hs * 0.2, 0.5 * uK, 1.6 * uK);
  float aa = smoothstep(0.0, fw, dn);
  float g = clamp(dn / hs, 0.0, 1.0);
  float body = 0.34 + 0.08 * g;
  // 時間：還沒長到的部分淡一點，長滿＝命中；前緣是一條淡淡的淺色（不是白線）
  float fe = 0.4 * uK / len;
  float inside = 1.0 - smoothstep(uP - fe, uP + fe, prog);
  float front = exp(-pow((prog - uP) * len / (0.4 * uK), 2.0)) * step(0.0, uP) * (1.0 - uHit);
  float chev = 0.0;
  if (uChev > 0.5) {
    float s = fract((pm.y + abs(pm.x) * 0.8) / uK * 0.22 - uTime * 1.2);
    chev = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.2, 0.3, s));
  }
  float a = body * mix(0.6, 1.1, inside) + front * 0.08 + chev * 0.035 + uHit * 0.3;
  vec3 c = mix(uColor, uRim, clamp(front * 0.4 + chev * 0.25 + uHit * 0.6, 0.0, 1.0));
  gl_FragColor = vec4(c, clamp(a, 0.0, 1.0) * aa * uOp);
}`;
// 攻擊預警的配色（FF14 的橘色）：呼叫端給的紅色系（紅、橘紅）一律換成這個；其他顏色（藍、紫、黃…）照舊，邊色是它的淺色
export const WARN_ORANGE = 0xff9838;
const WARN_RIM = 0xffd690;
const _hsl = { h: 0, s: 0, l: 0 };
export function warnColors(color) {
  const c = new THREE.Color(color);
  c.getHSL(_hsl);
  if (_hsl.s > 0.35 && (_hsl.h < 0.075 || _hsl.h > 0.9))
    return [new THREE.Color(WARN_ORANGE), new THREE.Color(WARN_RIM)];
  return [c, c.clone().lerp(new THREE.Color(0xffffff), 0.55)];
}
// shape 0＝圓（size＝(R, R)）、1＝長方形（size＝(寬, 長)）；chev＝裡面淡淡的往前箭頭（路線）
export function warnAreaMat(color, shape, sx, sy, k, chev = 0) {
  const [col, rim] = warnColors(color);
  return new THREE.ShaderMaterial({
    vertexShader: AREA_VS,
    fragmentShader: AREA_FS,
    uniforms: {
      uColor: { value: col },
      uRim: { value: rim },
      uOp: { value: 0 },
      uTime: { value: 0 },
      uP: { value: 0 },
      uHit: { value: 0 },
      uShape: { value: shape },
      uK: { value: k || 1 },
      uChev: { value: chev },
      uSize: { value: new THREE.Vector2(sx, sy) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
}

// ---------- 範圍的光幕（重力場、空域的補給區、防空區）：開口圓柱或半球，uv.y＝高度 ----------
// 往上流動的細掃描線、底部最亮、頂端淡出，經線的格子（uMode 1＝半球：格子密一點、沒有往上流）
const CURTAIN_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOp, uTime, uMode, uCols;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vV;
void main() {
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.5);
  float h = vUv.y;
  float lines = smoothstep(0.85, 1.0, fract(h * 14.0 - uTime * (uMode > 0.5 ? 0.2 : 0.8)));
  float cols = smoothstep(0.9, 1.0, abs(fract(vUv.x * uCols) - 0.5) * 2.0);
  float sweep = exp(-pow((fract(h * 0.6 - uTime * 0.25) - 0.5) * 7.0, 2.0));
  float base = exp(-h * 5.0);
  float top = uMode > 0.5 ? 1.0 : smoothstep(1.0, 0.6, h);
  float a = (0.05 + 0.3 * lines + 0.25 * cols + 0.35 * sweep + 0.6 * base) * (0.5 + 0.8 * fres) * top;
  gl_FragColor = vec4(uColor * a * uOp, 1.0);
}`;
export function curtainMat(color, mode = 0, cols = 24) {
  return new THREE.ShaderMaterial({
    vertexShader: COL_VS,
    fragmentShader: CURTAIN_FS,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOp: { value: 1 },
      uTime: { value: 0 },
      uMode: { value: mode },
      uCols: { value: cols },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
}

// 著色器預熱（game/render-setup.js 的 shaderWarm）：每種材質一個假網格，新地圖第一次算繪前一起編好
export function energyWarm(k) {
  const g = new THREE.Group();
  const box = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  for (const m of [
    armorMat(0xffffff, 0, k),
    barrierMat(0xffffff),
    pillarMat(0xffffff),
    waveMat(0xffffff),
    shellMat(0xffffff),
    ribbonMat(0xffffff),
    warnDiscMat(0xffffff),
    warnRectMat(0xffffff, 1, 1, k),
    warnAreaMat(0xffffff, 0, 1, 1, k),
    ribbonMat(0xffffff, 2),
    curtainMat(0xffffff),
  ]) {
    const o = new THREE.Mesh(box, m);
    o.frustumCulled = false;
    g.add(o);
  }
  return g;
}
