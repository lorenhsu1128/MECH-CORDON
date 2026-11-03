// ============================================================
//  六角格護盾（docs/vfx-design.md 第 7.4 期，參考 Oh! Robot 的能量護盾）：護盾產生器、護盾指揮艦的護盾球。
//  單位球（呼叫端縮放成護盾半徑）的著色器：三軸投影的六角格紋（依法線混合，球面上沒有接縫）、格子各自輕微閃爍、
//  邊緣變亮（菲涅耳）、被打中時那附近的格子亮起來並從命中點往外擴散一圈波紋（最多同時 4 個）。只有外觀，各端自己畫。
// ============================================================
const VS = /* glsl */ `
varying vec3 vP;
varying vec3 vN;
varying vec3 vV;
void main() {
  vP = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const FS = /* glsl */ `
uniform vec3 uColor;
uniform float uOp, uTime;
uniform vec4 uHit[4];
varying vec3 vP;
varying vec3 vN;
varying vec3 vV;
const vec2 HS = vec2(1.0, 1.7320508);
// 六角格：回傳（格子裡的座標 xy、格子的編號 zw）
vec4 hexCoord(vec2 p) {
  vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / HS.xyxy) + 0.5;
  vec4 h = vec4(p - hc.xy * HS, p - (hc.zw + 0.5) * HS);
  return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? vec4(h.xy, hc.xy) : vec4(h.zw, hc.zw + 0.5);
}
// 到格子中心的六角距離：0＝中心、0.5＝邊
float hexD(vec2 h) {
  h = abs(h);
  return max(dot(h, normalize(HS)), h.x);
}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec3 n = normalize(vP);
  vec3 w = pow(abs(n), vec3(4.0));
  w /= (w.x + w.y + w.z);
  const float S = 11.0;
  vec4 hx = hexCoord(vP.zy * S), hy = hexCoord(vP.xz * S), hz = hexCoord(vP.xy * S);
  float edge = smoothstep(0.38, 0.47, hexD(hx.xy)) * w.x + smoothstep(0.38, 0.47, hexD(hy.xy)) * w.y +
    smoothstep(0.38, 0.47, hexD(hz.xy)) * w.z;
  // 主要的投影軸的格子編號：每格自己的閃爍
  vec2 cid = w.x > w.y && w.x > w.z ? hx.zw : (w.y > w.z ? hy.zw + 31.0 : hz.zw + 67.0);
  float hc = hash(cid);
  float fl = 0.5 + 0.5 * sin(uTime * (1.5 + hc * 2.0) + hc * 40.0);
  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float hit = 0.0;
  for (int i = 0; i < 4; i++) {
    float age = uTime - uHit[i].w;
    if (age < 0.0 || age > 0.9) continue;
    float a = acos(clamp(dot(n, uHit[i].xyz), -1.0, 1.0));
    float ring = exp(-pow((a - age * 2.6) / 0.13, 2.0)) * (1.0 - age / 0.9);
    float core = smoothstep(0.45, 0.0, a) * max(0.0, 1.0 - age / 0.55);
    hit += ring * (0.4 + edge) + core * (0.55 + 0.45 * edge);
  }
  float a = (0.04 + 0.06 * fl * hc) * (1.0 - edge) + edge * 0.32 + fres * 0.5 + hit * 1.3;
  a *= gl_FrontFacing ? 1.0 : 0.35;
  vec3 c = mix(uColor, vec3(1.0), clamp(hit * 0.5 + fres * 0.2, 0.0, 0.8));
  gl_FragColor = vec4(c * a * uOp, 1.0);
}`;

export function hexShieldMat(color) {
  const hit = [];
  for (let i = 0; i < 4; i++) hit.push(new THREE.Vector4(0, 1, 0, -99));
  const m = new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOp: { value: 1 },
      uTime: { value: 0 },
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
// 命中：dir＝護盾的物件座標裡、從中心往命中點的方向（會正規化）
export function hexShieldHit(m, dir) {
  const U = m.uniforms;
  const v = U.uHit.value[m.userData.hitI++ % 4];
  const d = dir.clone().normalize();
  v.set(d.x, d.y, d.z, U.uTime.value);
}
