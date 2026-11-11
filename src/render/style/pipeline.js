// 渲染風格：後處理管線（取代原本的 EffectComposer 組合）。
// 場景 → 自己的 render target（含深度貼圖）→［SSAO］→ 合成（AO、動態模糊、描線）→ Bloom → 調色（含 gamma、
// 色偏、暗角、色差、顆粒、紙紋）→［FXAA］→ 畫面。左右比較時整條管線跑兩次再合成。
// 原本的組合是 RenderPass＋SSAOPass（SSAOPass 自己又畫一次場景），這裡只畫一次場景＋SSAO 的法線。
// 陰影貼圖每格只畫一次：renderer.shadowMap.autoUpdate 關掉，由使用的地方每格設一次 needsUpdate（shadowFrame），
// 第一次畫有光源的場景時更新，之後同一格的 SSAO 法線、分割畫面的另一半都沿用。
import { linColor, rawColor, srgbColor } from '../color-cm.js';
import { OUTLINE_MAT, OUTLINE_SKIN, isOutline } from '../geometry.js';
import { StyleAtmos } from './atmos.js';
import { STYLE_DEFAULTS } from './params.js';
import { setStyleUniforms } from './shader.js';
import { HDR, legacyTarget } from '../legacy-rt.js';
import { FX_LAYER, FX_MESHES, FXU, fxLight } from '../../fx/gpu.js';

// 著色器 uniform 與描邊材質是全域共用的：同一頁有其他畫面（模型庫）時，畫完風格預覽後恢復預設
export function resetStyleGlobals() {
  setStyleUniforms(STYLE_DEFAULTS);
  OUTLINE_MAT.visible = OUTLINE_SKIN.visible = true;
  OUTLINE_MAT.uniforms.th.value = 0.012;
}

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }';

// 熱扭曲（docs/vfx-design.md 第 8.3 期）：tHeat＝熱源的強度圖（半解析度，加色），依它把畫面往兩個正弦組合的方向偏移
const HEAT_FRAG = /* glsl */ `
uniform sampler2D tColor, tHeat;
uniform vec2 px;
uniform float time, amt;
varying vec2 vUv;
void main() {
  float s = min(texture2D( tHeat, vUv ).r, 1.5);
  vec2 o = vec2( 0.0 );
  if ( s > 0.003 ) {
    vec2 q = vUv / px / 38.0;
    o = vec2( sin( q.y * 1.7 + time * 8.0 ) + 0.6 * sin( q.x * 1.1 - time * 5.3 ),
              cos( q.x * 1.5 + time * 7.1 ) + 0.6 * sin( q.y * 0.9 + time * 9.7 ) ) * s * amt * px;
  }
  gl_FragColor = texture2D( tColor, vUv + o );
}`;

// 光束（docs/vfx-design.md 第 8.6 期）：半解析度，從每個像素往太陽在畫面上的位置走 24 步，累計天空（深度＝1）的比例
const RAYS_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 sun;
uniform float aspect;
varying vec2 vUv;
void main() {
  vec2 d = ( sun - vUv ) / 24.0;
  vec2 uv = vUv;
  float acc = 0.0, w = 1.0;
  for ( int i = 0; i < 24; i ++ ) {
    uv += d;
    vec2 c = clamp( uv, 0.0, 1.0 );
    acc += step( 0.99999, texture2D( tDepth, c ).x ) * w;
    w *= 0.94;
  }
  float fall = 1.0 - smoothstep( 0.0, 0.6, length( ( vUv - sun ) * vec2( aspect, 1.0 ) ) );
  gl_FragColor = vec4( vec3( acc / 13.0 * fall ), 1.0 );
}`;
// 光束疊回畫面＋鏡頭光斑（太陽附近的天空比例 vis 決定光斑的亮度：被建築擋住就消失）
const FLARE_FRAG = /* glsl */ `
uniform sampler2D tColor, tRays, tDepth;
uniform vec2 sun;
uniform vec3 sunC;
uniform float amt, aspect, edge;
varying vec2 vUv;
float sky( vec2 p ) { return step( 0.99999, texture2D( tDepth, clamp( p, 0.0, 1.0 ) ).x ); }
vec3 ghost( vec2 gp, float r, vec3 col ) {
  float d = length( ( vUv - gp ) * vec2( aspect, 1.0 ) ) / r;
  return col * ( smoothstep( 1.0, 0.55, d ) * 0.55 + smoothstep( 1.05, 0.95, d ) * smoothstep( 0.85, 0.95, d ) * 0.6 );
}
void main() {
  vec3 c = texture2D( tColor, vUv ).rgb;
  // 光束主要疊在太陽前面被擋住的地方（越過建築與地形邊緣的光芒），天空本身只留一點
  c += texture2D( tRays, vUv ).r * sunC * amt * mix( 1.0, 0.12, sky( vUv ) );
  float o = 0.012;
  float vis = ( sky( sun ) + sky( sun + vec2( o, 0.0 ) ) + sky( sun - vec2( o, 0.0 ) ) + sky( sun + vec2( 0.0, o ) ) + sky( sun - vec2( 0.0, o ) ) ) * 0.2;
  vis *= edge;
  if ( vis > 0.01 ) {
    vec2 ax = vec2( 0.5 ) - sun;
    vec3 f = ghost( sun + ax * 0.55, 0.035, vec3( 1.0, 0.75, 0.45 ) )
      + ghost( sun + ax * 1.15, 0.075, vec3( 0.45, 0.65, 1.0 ) )
      + ghost( sun + ax * 1.5, 0.02, vec3( 1.0 ) )
      + ghost( sun + ax * 1.9, 0.12, vec3( 0.5, 1.0, 0.65 ) ) * 0.6;
    float hd = length( ( vUv - sun ) * vec2( aspect, 1.0 ) );
    float halo = exp( - pow( ( hd - 0.24 ) * 22.0, 2.0 ) ) * 0.35 + exp( - hd * 9.0 ) * 0.6;
    c += ( f * 0.16 + halo * 0.18 ) * sunC * vis;
  }
  gl_FragColor = vec4( c, 1.0 );
}`;

// 軟粒子用的深度（docs/vfx-design.md 第 8.1 期）：線性的視線深度÷far，RGBA 打包（RGBA8 的目標就夠）
const DCOPY_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform float cNear, cFar;
varying vec2 vUv;
void main() {
  float z = - perspectiveDepthToViewZ( texture2D( tDepth, vUv ).x, cNear, cFar );
  gl_FragColor = packDepthToRGBA( clamp( z / cFar, 0.0, 0.9999 ) );
}`;

const COMP_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor, tDepth, tAO;
uniform vec2 px;
uniform float cNear, cFar, useAO, aoK;
uniform vec4 inkA, inkB, inkC, mbA, rimA, rimB;
uniform mat4 invVP, prevVP;
varying vec2 vUv;
float vz( vec2 uv ) { return - perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, cNear, cFar ); }
vec3 scol( vec2 uv ) {
	vec3 c = texture2D( tColor, uv ).rgb;
	if ( useAO > 0.5 ) c *= mix( 1.0, texture2D( tAO, uv ).r, aoK );
	return c;
}
float lap( vec2 o, float iz ) { return 2.0 * iz - 1.0 / vz( vUv + o ) - 1.0 / vz( vUv - o ); }
void main() {
	vec4 c0 = texture2D( tColor, vUv );
	float isMech = step( c0.a, 0.75 );
	float z = vz( vUv );
	vec3 col;
	if ( mbA.x > 0.0 ) {
		float d = texture2D( tDepth, vUv ).x;
		vec4 wp = invVP * vec4( vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0 );
		wp /= wp.w;
		vec4 pp = prevVP * wp;
		vec2 vel = ( vUv - ( pp.xy / pp.w * 0.5 + 0.5 ) ) * mbA.x * ( 1.0 - isMech * mbA.y );
		float L = length( vel );
		if ( L > 0.04 ) vel *= 0.04 / L;
		col = vec3( 0.0 );
		for ( int i = 0; i < 8; i ++ ) col += scol( vUv - vel * ( float( i ) / 7.0 - 0.5 ) );
		col /= 8.0;
	} else col = scol( vUv );
	// 螢幕空間的邊緣光（機體類）：往光源方向偏移一點的像素是遠處（背景）＝向光的輪廓，加一條亮線
	if ( rimA.w > 0.0 && isMech > 0.5 && z < cFar * 0.97 ) {
		float zn = vz( vUv + rimA.xy * px * rimA.z );
		float rr = smoothstep( rimB.w, rimB.w * 2.5, ( zn - z ) / z );
		float fade = 1.0 - smoothstep( inkC.x, inkC.y, z );
		col += rimB.rgb * rimA.w * rr * fade * ( 0.35 + 0.65 * clamp( dot( col, vec3( 0.333 ) ) * 2.0, 0.0, 1.0 ) );
	}
	if ( inkA.x > 0.0 && z < cFar * 0.97 ) {
		float iz = 1.0 / z;
		float eo = 0.0;
		if ( inkA.y > 0.0 ) {
			vec2 r = px * inkA.y;
			float L = max( max( lap( vec2( r.x, 0.0 ), iz ), lap( vec2( 0.0, r.y ), iz ) ), max( lap( r * 0.7071, iz ), lap( vec2( r.x, - r.y ) * 0.7071, iz ) ) );
			eo = smoothstep( 0.06, 0.14, L * z );
		}
		float ei = 0.0;
		if ( inkA.z > 0.0 ) {
			vec2 r = px * inkA.z;
			float a = lap( vec2( r.x, 0.0 ), iz ) * z, b = lap( vec2( 0.0, r.y ), iz ) * z;
			float th = mix( 0.06, 0.0025, inkA.w );
			float m = max( abs( a ), abs( b ) );
			ei = smoothstep( th, th * 1.8, m ) * step( - 0.05, min( a, b ) );
		}
		float fade = 1.0 - smoothstep( inkC.x, inkC.y, z );
		float amt = clamp( max( eo, ei ) * inkA.x * fade * mix( inkC.z, 1.0, isMech ), 0.0, 1.0 );
		col = mix( col, mix( inkB.rgb, col * 0.28, inkB.w ), amt );
	}
	gl_FragColor = vec4( col, c0.a );
}
`;

// 畫面模式 HDR（render/legacy-rt.js）：場景是半浮點、沒做色調映射，在 Bloom 之前以這一段做一次
// （Bloom 照經典的方式作用在色調映射後的值；粒子的加色混合照樣在 HDR 裡疊加）
const TONEMAP_FRAG = /* glsl */ `
uniform sampler2D tDiffuse, tDepth;
uniform int tmMode, useDepth;
varying vec2 vUv;
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
${THREE.ShaderChunk.tonemapping_pars_fragment}
void main() {
	vec3 c = texture2D( tDiffuse, vUv ).rgb;
	// 沒有東西擋住的像素（天空的球、背景色：不寫深度）照經典不做色調映射與曝光（r128 的天空著色器沒有色調映射）
	if ( useDepth == 1 && texture2D( tDepth, vUv ).x >= 0.99999 ) {
		gl_FragColor = vec4( c, 1.0 );
		return;
	}
	if ( tmMode == 1 ) c = LinearToneMapping( c );
	else if ( tmMode == 2 ) c = ReinhardToneMapping( c );
	else if ( tmMode == 3 ) c = CineonToneMapping( c );
	else if ( tmMode == 6 ) c = AgXToneMapping( c );
	else if ( tmMode == 7 ) c = NeutralToneMapping( c );
	else c = ACESFilmicToneMapping( c );
	gl_FragColor = vec4( c, 1.0 );
}
`;
const GRADE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 px;
uniform float time, aspect;
uniform vec4 gA, gL, gH, gB, gC, gI, gP;
varying vec2 vUv;
float h21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vn( vec2 p ) {
	vec2 i = floor( p ), f = fract( p );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( h21( i ), h21( i + vec2( 1.0, 0.0 ) ), f.x ), mix( h21( i + vec2( 0.0, 1.0 ) ), h21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
void main() {
	vec3 c;
	if ( gB.y > 0.0 ) {
		vec2 d = ( vUv - 0.5 ) * gB.y * 0.012;
		c = vec3( texture2D( tDiffuse, vUv + d ).r, texture2D( tDiffuse, vUv ).g, texture2D( tDiffuse, vUv - d ).b );
	} else c = texture2D( tDiffuse, vUv ).rgb;
	c = sRGBTransferOETF( vec4( c, 1.0 ) ).rgb;
	c *= vec3( 1.0 + 0.1 * gA.w, 1.0 + 0.015 * gA.w, 1.0 - 0.12 * gA.w );
	c += gA.z;
	c = ( c - 0.5 ) * gA.y + 0.5;
	float l = clamp( dot( c, vec3( 0.299, 0.587, 0.114 ) ), 0.0, 1.0 );
	c = mix( vec3( l ), c, gA.x );
	c += ( gL.rgb - 0.5 ) * gL.w * ( 1.0 - l ) * ( 1.0 - l ) * 0.9;
	c += ( gH.rgb - 0.5 ) * gH.w * l * l * 0.7;
	vec2 v = ( vUv - 0.5 ) * vec2( aspect, 1.0 );
	c *= 1.0 - gB.x * smoothstep( 0.25, 1.05, length( v ) * 1.15 );
	vec2 sp = vUv / px;
	// 漫畫的衝擊畫格（docs/zzz-style-design.md）：墨色與紙色的兩色＋45° 的網點，第一拍反色；很亮的部分（特效）保留原色
	if ( gC.x > 0.0 ) {
		float lc = clamp( dot( c, vec3( 0.299, 0.587, 0.114 ) ), 0.0, 1.0 );
		vec2 hq = mat2( 0.7071, - 0.7071, 0.7071, 0.7071 ) * sp / gC.z;
		// 紙色為主：只有暗的地方有大的網點、很暗的地方是實心的墨
		float hr = pow( 1.0 - lc, 1.8 ) * 0.62;
		float hd = 1.0 - smoothstep( hr - 0.06, hr + 0.06, length( fract( hq ) - 0.5 ) );
		float ink = max( hd, 1.0 - smoothstep( 0.05, 0.1, lc ) );
		vec3 cm = mix( gP.rgb, gI.rgb, ink );
		if ( gC.y > 0.5 ) cm = vec3( 1.0 ) - cm;
		cm = mix( cm, c, smoothstep( 0.8, 0.97, lc ) * 0.7 );
		// 放射狀的速度線
		float ang = atan( v.y, v.x );
		float ray = step( 0.82, fract( sin( floor( ang * 38.0 + gC.w ) * 91.7 ) * 4375.5 ) ) * smoothstep( 0.32, 0.75, length( v ) );
		cm = mix( cm, gC.y > 0.5 ? gP.rgb : gI.rgb, ray * 0.85 );
		c = mix( c, cm, gC.x );
	}
	if ( gB.z > 0.0 ) c += ( h21( sp + fract( time ) * vec2( 113.1, 71.7 ) ) - 0.5 ) * gB.z * 0.14 * ( 1.0 - 0.5 * l );
	if ( gB.w > 0.0 ) {
		float p = vn( sp / 160.0 ) * 0.6 + vn( sp / 47.0 ) * 0.3 + vn( sp / 9.0 ) * 0.1;
		float fib = h21( floor( sp / 1.5 ) );
		c *= 1.0 - gB.w * ( 0.13 * p + 0.05 * fib );
		c = mix( c, c * vec3( 1.03, 1.0, 0.93 ) + vec3( 0.02, 0.015, 0.0 ), gB.w * 0.6 );
	}
	gl_FragColor = vec4( clamp( c, 0.0, 1.0 ), 1.0 );
}
`;

const SPLIT_FRAG = /* glsl */ `
uniform sampler2D tA, tB;
uniform float split, pxX;
varying vec2 vUv;
void main() {
	vec4 c = vUv.x < split ? texture2D( tA, vUv ) : texture2D( tB, vUv );
	if ( abs( vUv.x - split ) < pxX * 1.5 ) c = vec4( 1.0, 0.85, 0.3, 1.0 );
	gl_FragColor = c;
}
`;

// 景深（過場動畫用，P.dof > 0 才做）：依深度算模糊圈，圓盤取樣；只拿比自己更模糊或更遠的樣本，前景不會糊進背景
const DOF_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tColor, tDepth;
uniform vec2 px;
uniform float cNear, cFar, focus, range, amt;
varying vec2 vUv;
float vz( vec2 uv ) { return - perspectiveDepthToViewZ( texture2D( tDepth, uv ).x, cNear, cFar ); }
float coc( float z ) { return clamp( ( abs( z - focus ) - range ) / max( focus * 0.6, 1.0 ), 0.0, 1.0 ) * amt; }
void main() {
	float z0 = vz( vUv );
	float c0 = coc( z0 );
	vec3 sum = texture2D( tColor, vUv ).rgb;
	float w = 1.0;
	for ( int i = 0; i < 24; i ++ ) {
		float fi = float( i );
		float r = sqrt( ( fi + 0.5 ) / 24.0 );
		float a = fi * 2.39996;
		vec2 o = vec2( cos( a ), sin( a ) ) * r;
		vec2 uv = vUv + o * px * c0;
		float zs = vz( uv );
		float cs = coc( zs );
		float k = ( zs >= z0 - 0.5 ) ? 1.0 : smoothstep( 0.0, 1.0, cs / max( c0, 0.001 ) );
		sum += texture2D( tColor, uv ).rgb * k;
		w += k;
	}
	gl_FragColor = vec4( sum / w, 1.0 );
}
`;

// 低特效的 SSAO（setLowFx 的 'depth'）：不重畫場景的法線，從場景的深度貼圖重建視角空間的法線（取左右／上下深度差較小的一邊，
// 避免邊緣），編碼同 MeshNormalMaterial（packNormalToRGB），交給 SSAOPass 的 AO 計算
const NRM_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 px;
uniform mat4 invP;
varying vec2 vUv;
vec3 vpos( vec2 uv ) {
	vec4 v = invP * vec4( uv * 2.0 - 1.0, texture2D( tDepth, uv ).x * 2.0 - 1.0, 1.0 );
	return v.xyz / v.w;
}
void main() {
	vec3 p = vpos( vUv );
	vec3 r = vpos( vUv + vec2( px.x, 0.0 ) ) - p, l = p - vpos( vUv - vec2( px.x, 0.0 ) );
	vec3 u = vpos( vUv + vec2( 0.0, px.y ) ) - p, d = p - vpos( vUv - vec2( 0.0, px.y ) );
	vec3 dx = abs( r.z ) < abs( l.z ) ? r : l;
	vec3 dy = abs( u.z ) < abs( d.z ) ? u : d;
	vec3 n = normalize( cross( dx, dy ) );
	if ( n.z < 0.0 ) n = - n;
	gl_FragColor = vec4( n * 0.5 + 0.5, 1.0 );
}
`;

// HDR 模式的色調映射（調色著色器的 tmMode，同 three.js 的常數值）
const TM_ID = { linear: 1, reinhard: 2, cineon: 3, aces: 4, agx: 6, neutral: 7 };
const TM = () => ({
  aces: THREE.ACESFilmicToneMapping,
  linear: THREE.LinearToneMapping,
  reinhard: THREE.ReinhardToneMapping,
  cineon: THREE.CineonToneMapping,
  neutral: THREE.NeutralToneMapping,
});

function quad(frag, uniforms) {
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: frag,
    depthTest: false,
    depthWrite: false,
  });
  m.toneMapped = false; // 畫到畫面時 three.js 不另外加色調映射（調色自己做，docs/perf-threejs-upgrade.md 第 4 期）
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  mesh.frustumCulled = false;
  return { m, mesh };
}

const lin = linColor;
const srgb = srgbColor;
const warm = (k) =>
  k >= 0 ? new THREE.Color(1, 1 - 0.18 * k, 1 - 0.42 * k) : new THREE.Color(1 + 0.25 * k, 1 + 0.08 * k, 1);

// SSAOPass 的法線是整個場景套同一個覆蓋材質畫的；three.js r128 的同一個材質不會依物件換蒙皮／非蒙皮的程式，
// 所以場景裡有 SkinnedMesh（render/foe-merge.js 合併的專屬敵人）時改成逐個網格換材質：蒙皮網格用蒙皮版的法線材質。
// 沒有蒙皮網格時照原本的覆蓋材質畫（結果相同）。
export function skinAwareSSAO(pass) {
  const orig = pass._renderOverride;
  const skinN = pass.normalMaterial.clone();
  skinN.skinning = true;
  const list = [],
    mats = [];
  pass._renderOverride = function (renderer, mat, rt, cc, ca) {
    if (mat !== this.normalMaterial) return orig.call(this, renderer, mat, rt, cc, ca);
    let any = false;
    list.length = mats.length = 0;
    this.scene.traverseVisible((o) => {
      if (!o.material || !(o.isMesh || o.isSprite)) return;
      list.push(o);
      mats.push(o.material);
      if (o.isSkinnedMesh) any = true;
    });
    if (!any) return orig.call(this, renderer, mat, rt, cc, ca);
    for (const o of list) o.material = o.isSkinnedMesh ? skinN : mat;
    // 同 SSAOPass.renderOverride，只是不設覆蓋材質
    const oc = renderer.getClearColor(new THREE.Color()),
      oa = renderer.getClearAlpha(),
      ac = renderer.autoClear;
    try {
      renderer.setRenderTarget(rt);
      renderer.autoClear = false;
      renderer.setClearColor(mat.clearColor || cc);
      renderer.setClearAlpha(mat.clearAlpha || ca || 0);
      renderer.clear();
      renderer.render(this.scene, this.camera);
    } finally {
      renderer.autoClear = ac;
      renderer.setClearColor(oc);
      renderer.setClearAlpha(oa);
      for (let i = 0; i < list.length; i++) list[i].material = mats[i];
      list.length = mats.length = 0;
    }
  };
}

// 陰影貼圖改成手動更新（每格一次）：建立 renderer 後呼叫一次，之後每格在算繪前呼叫 shadowFrame
export function manualShadows(renderer) {
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
}
// 這一格要更新陰影貼圖：下一次畫有投影光源的場景時更新（只有後處理四邊形的算繪沒有光源，不會用掉）
export function shadowFrame(renderer) {
  renderer.shadowMap.needsUpdate = true;
}

export class StylePipeline {
  // ctx：{ scene, camera, sun, hemi, sunOff（Vector3，太陽相對位置，鏡頭程式每格用它擺太陽），
  //   wscale（場景的尺度：數字或函式；遊戲＝DS，風格參數裡的公尺數乘上它）}
  constructor(renderer, ctx) {
    this.R = renderer;
    this.ctx = ctx;
    this.scene = ctx.scene;
    this.camera = ctx.camera;
    this.atmos = ctx.indoor ? null : new StyleAtmos(ctx.scene);
    const depthOk = renderer.capabilities.isWebGL2 || renderer.extensions.has('WEBGL_depth_texture');
    this.depthOk = depthOk;
    const rt = (depth) => {
      const t = new THREE.WebGLRenderTarget(4, 4, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RGBAFormat,
      });
      legacyTarget(t);
      if (depth && depthOk) {
        t.depthTexture = new THREE.DepthTexture(4, 4);
        t.depthTexture.type = renderer.capabilities.isWebGL2
          ? THREE.UnsignedIntType
          : THREE.UnsignedShortType;
      }
      return t;
    };
    this.rtScene = rt(true);
    this.rtPrev = null; // 上一格的場景（keepPrev：水面的螢幕空間反射，fx/water/index.js）
    this.keepPrev = false;
    this.prevOk = false;
    this.rtA = rt(false);
    this.rtB = rt(false);
    this.rtL = rt(false);
    this.rtR = rt(false);
    this.cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.comp = quad(COMP_FRAG, {
      tColor: { value: null },
      tDepth: { value: null },
      tAO: { value: null },
      px: { value: new THREE.Vector2() },
      cNear: { value: 0.5 },
      cFar: { value: 400 },
      useAO: { value: 0 },
      aoK: { value: 1 },
      inkA: { value: new THREE.Vector4() },
      inkB: { value: new THREE.Vector4() },
      inkC: { value: new THREE.Vector4() },
      mbA: { value: new THREE.Vector4() },
      rimA: { value: new THREE.Vector4() },
      rimB: { value: new THREE.Vector4() },
      invVP: { value: new THREE.Matrix4() },
      prevVP: { value: new THREE.Matrix4() },
    });
    this.grade = quad(GRADE_FRAG, {
      tDiffuse: { value: null },
      px: { value: new THREE.Vector2() },
      time: { value: 0 },
      aspect: { value: 1 },
      gA: { value: new THREE.Vector4(1, 1, 0, 0) },
      gL: { value: new THREE.Vector4() },
      gH: { value: new THREE.Vector4() },
      gB: { value: new THREE.Vector4() },
      gC: { value: new THREE.Vector4() },
      gI: { value: new THREE.Vector4() },
      gP: { value: new THREE.Vector4() },
    });
    this.tonemap = quad(TONEMAP_FRAG, {
      tDiffuse: { value: null },
      tDepth: { value: null },
      useDepth: { value: 0 },
      tmMode: { value: 4 },
      toneMappingExposure: { value: 1 },
    });
    this.dof = quad(DOF_FRAG, {
      tColor: { value: null },
      tDepth: { value: null },
      px: { value: new THREE.Vector2() },
      cNear: { value: 0.5 },
      cFar: { value: 400 },
      focus: { value: 20 },
      range: { value: 4 },
      amt: { value: 0 },
    });
    this.split = quad(SPLIT_FRAG, {
      tA: { value: null },
      tB: { value: null },
      split: { value: 0.5 },
      pxX: { value: 0.001 },
    });
    this.fxaa = THREE.FXAAShader
      ? quad(THREE.FXAAShader.fragmentShader, THREE.UniformsUtils.clone(THREE.FXAAShader.uniforms))
      : null;
    // 軟粒子：不透明場景的深度拷貝（粒子另外畫一次時讀它）
    this.rtD = depthOk
      ? new THREE.WebGLRenderTarget(4, 4, {
          minFilter: THREE.NearestFilter,
          magFilter: THREE.NearestFilter,
          format: THREE.RGBAFormat,
          depthBuffer: false,
        })
      : null;
    this.rtH = depthOk
      ? legacyTarget(
          new THREE.WebGLRenderTarget(4, 4, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            depthBuffer: false,
          }),
        )
      : null;
    this.heatQ = quad(HEAT_FRAG, {
      tColor: { value: null },
      tHeat: { value: null },
      px: { value: new THREE.Vector2() },
      time: { value: 0 },
      amt: { value: 6 },
    });
    this.rtRay = depthOk
      ? new THREE.WebGLRenderTarget(4, 4, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          depthBuffer: false,
        })
      : null;
    this.raysQ = quad(RAYS_FRAG, {
      tDepth: { value: null },
      sun: { value: new THREE.Vector2() },
      aspect: { value: 1 },
    });
    this.flareQ = quad(FLARE_FRAG, {
      tColor: { value: null },
      tRays: { value: null },
      tDepth: { value: null },
      sun: { value: new THREE.Vector2() },
      sunC: { value: new THREE.Color() },
      amt: { value: 0.35 },
      aspect: { value: 1 },
      edge: { value: 1 },
    });
    this.dcopy = quad(DCOPY_FRAG, { tDepth: { value: null }, cNear: { value: 0.5 }, cFar: { value: 400 } });
    this.nrm = quad(NRM_FRAG, {
      tDepth: { value: null },
      px: { value: new THREE.Vector2() },
      invP: { value: new THREE.Matrix4() },
    });
    this.qScene = new THREE.Scene();
    this.ssao = null;
    if (THREE.SSAOPass && ctx.ssao !== false) {
      this.ssao = new THREE.SSAOPass(ctx.scene, ctx.camera, 4, 4);
      this.ssao.output = THREE.SSAOPass.OUTPUT.Default;
      // 蒙皮網格（render/foe-merge.js、mesh-merge.js）的法線也照動作：用蒙皮版的法線材質（renderNormals）
      this.skinN = this.ssao.normalMaterial.clone();
      this.skinN.skinning = true;
      // InstancedMesh 另用一份（同一個材質在 InstancedMesh／一般網格之間切換時，three.js 每次都要重找程式）
      this.instN = this.ssao.normalMaterial.clone();
      this.nHide = [];
      this.nList = [];
      this.nMats = [];
      this.ssaoBase = ctx.ssaoBase || { kernelRadius: 1.6, minDistance: 0.0004, maxDistance: 0.012 };
    }
    this.bloom = THREE.UnrealBloomPass
      ? new THREE.UnrealBloomPass(new THREE.Vector2(4, 4), 0.45, 0.4, 0.9)
      : null;
    this.low = null; // 低特效（setLowFx）
    this.hullOff = false; // true＝暫時不畫描邊外殼
    this.prevVP = new THREE.Matrix4();
    this.hasPrev = false;
    this.base = null;
    this.w = this.h = 0;
  }
  setSize(w, h) {
    const pr = this.R.getPixelRatio();
    const W = Math.max(1, Math.round(w * pr)),
      H = Math.max(1, Math.round(h * pr));
    if (W === this.w && H === this.h) return;
    this.w = W;
    this.h = H;
    for (const t of [this.rtScene, this.rtPrev, this.rtA, this.rtB, this.rtL, this.rtR, this.rtD])
      if (t) t.setSize(W, H);
    this.prevOk = false;
    if (this.rtH) this.rtH.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1));
    if (this.rtRay) this.rtRay.setSize(Math.max(1, W >> 1), Math.max(1, H >> 1));
    this.sizeSSAO();
    if (this.bloom) this.bloom.setSize(W, H);
  }
  sizeSSAO() {
    if (!this.ssao || !this.w) return;
    const k = this.low && (this.low.ssao === 'half' || this.low.ssao === 'depth') ? 2 : 1;
    this.ssao.setSize(Math.max(1, Math.ceil(this.w / k)), Math.max(1, Math.ceil(this.h / k)));
  }
  // 低特效（給大量單位的場面）：o＝{ ssao, mblur: 是否保留動態模糊（預設 false）}；ssao：
  // 'off'（預設）關掉、'depth' 半解析度且法線從深度貼圖重建（不重畫場景，最省）、'half' 半解析度、'full' 照原本。
  // null／false＝恢復（照風格參數）。只影響這條管線，風格參數不變。
  setLowFx(o) {
    const prev = this.low && this.low.ssao;
    this.low = o ? { ssao: o.ssao || 'off', mblur: !!o.mblur } : null;
    if ((this.low && this.low.ssao) !== prev) this.sizeSSAO();
  }
  // 鏡頭切換（瞬移）後呼叫：動態模糊不要拿上一格的位置
  resetHistory() {
    this.hasPrev = false;
    this.prevOk = false;
  }
  // 上一格的場景（顏色＋深度；keepPrev 開著、而且上一格有畫的時候）。投影用 prevVP
  get prev() {
    if (!this.keepPrev || !this.prevOk || !this.rtPrev || !this.rtPrev.depthTexture) return null;
    return { color: this.rtPrev.texture, depth: this.rtPrev.depthTexture };
  }
  // 依場景目前的戰區設定記下基準值（霧、太陽、環境光）；換戰區（新的 Fog 物件）時重新記錄
  captureBase() {
    const s = this.scene,
      c = this.ctx;
    const fog = s.fog;
    if (this.base && this.base.fog === fog) return this.base;
    this.base = {
      fog,
      near: fog ? fog.near : 0,
      far: fog ? fog.far : 0,
      fogColor: fog ? fog.color.clone() : new THREE.Color(0x888888),
      bg: s.background && s.background.isColor ? s.background.clone() : null,
      sunColor: c.sun ? c.sun.color.clone() : null,
      sunI: c.sun ? c.sun.intensity : 1,
      hemiI: c.hemi ? c.hemi.intensity : 1,
    };
    return this.base;
  }
  // 戰區設定改了（例如重新開始任務但沿用同一個 Fog 物件）時強制重新記錄
  rebase() {
    this.base = null;
  }
  // 套用不需要重新編譯的場景參數（每格、比較時每半邊各一次）
  // 場景的尺度（風格參數的公尺數：高度霧、描線淡出、SSAO 半徑、太陽距離）
  wscale() {
    const w = this.ctx.wscale;
    return typeof w === 'function' ? w() : w || 1;
  }
  applyScene(P, time) {
    setStyleUniforms(P, this.wscale());
    const R = this.R,
      s = this.scene,
      c = this.ctx;
    // Neutral（Khronos PBR Neutral）中間調和線性一樣、只壓亮部（爆炸等疊加的特效不會一片純白），所以照線性的補正
    const linTm = P.toneMap === 'linear' || P.toneMap === 'neutral';
    // 線性色調映射不壓高光：依場景補正曝光（白色場景調暗、暗的場景調亮；World 主題的 linExp）
    R.toneMappingExposure =
      P.exposure *
      (linTm && c.sceneExp ? c.sceneExp() : 1) *
      (THREE.ColorManagement.enabled ? (P.cmExp || 1) * (c.cmExp ? c.cmExp(linTm) : 1) : 1); // 色彩管理：配色變深，依風格與主題補回亮度
    const B = this.captureBase();
    const out = !c.indoor;
    if (out && s.fog && B.fog) {
      // 鏡頭拉遠多少，霧就往外推多少（機體附近保持清楚；遠景照樣有霧）
      const push = c.fogPush ? c.fogPush() : 0;
      s.fog.near = B.near * P.fogK + push;
      s.fog.far = B.far * P.fogK + push;
      s.fog.color.copy(B.fogColor).lerp(lin(P.fogColor), P.fogColorK);
    }
    if (out && B.bg && s.background && s.background.isColor) {
      // 背景色不經過色調映射與曝光：色彩管理時（色碼變深）換回原本的值（rawColor）
      if (P.sky === 'theme') s.background.copy(rawColor(B.bg)).lerp(lin(P.fogColor), P.fogColorK * 0.6);
      else s.background.copy(rawColor(s.fog ? s.fog.color : B.bg));
    }
    if (c.sun && B.sunColor) {
      c.sun.color.copy(B.sunColor).multiply(warm(P.sunWarm));
      c.sun.intensity = B.sunI * P.sunK;
    }
    if (c.hemi) c.hemi.intensity = B.hemiI * P.hemiK;
    if (out && c.sceneTweak) c.sceneTweak(s); // 水面下的霧（fx/water/index.js）
    if (c.sunOff) {
      const az = (P.sunAz * Math.PI) / 180,
        el = (P.sunEl * Math.PI) / 180,
        r = 94.3 * this.wscale();
      c.sunOff.set(Math.cos(el) * Math.cos(az) * r, Math.sin(el) * r, Math.cos(el) * Math.sin(az) * r);
    }
    OUTLINE_MAT.visible = OUTLINE_SKIN.visible = P.hull > 0 && !this.hullOff;
    OUTLINE_MAT.uniforms.th.value = 0.012 * P.hull;
    fxLight(c.sunOff, c.sun, c.hemi); // 煙的受光（fx/gpu.js）
    if (!this.atmos) return;
    const fc = s.fog ? s.fog.color : B.fogColor;
    this.atmos.update(
      P,
      this.camera,
      time,
      fc,
      c.sunOff || new THREE.Vector3(40, 80, 30),
      c.sun ? c.sun.color : new THREE.Color(1, 1, 1),
      R.getPixelRatio(),
    );
  }
  // 需要重新編譯的設定（色調映射、陰影種類）：改變時回傳 true，呼叫端把場景材質標成 needsUpdate
  applyStructural(P) {
    const R = this.R;
    const tm = TM()[P.toneMap] || THREE.ACESFilmicToneMapping;
    // r182 起 PCFSoftShadowMap 移除、PCFShadowMap 本身就是柔邊：「硬」與「柔」都用它（docs/perf-threejs-upgrade.md 第 1 期）
    const st = THREE.PCFShadowMap;
    let ch = false;
    if (R.toneMapping !== tm) {
      R.toneMapping = tm;
      ch = true;
    }
    if (R.shadowMap.type !== st) {
      R.shadowMap.type = st;
      R.shadowMap.needsUpdate = true;
      ch = true;
    }
    return ch;
  }
  // 整條管線；out 為 null 時畫到畫面。
  // 場景的世界矩陣只在這裡算一次：之後這條管線裡的算繪（場景、陰影、SSAO 法線）都關掉 scene.matrixWorldAutoUpdate
  run(P, out, time) {
    const s = this.scene;
    this.applyScene(P, time);
    s.updateMatrixWorld();
    const au = s.matrixWorldAutoUpdate;
    s.matrixWorldAutoUpdate = false;
    try {
      this.runInner(P, out, time);
    } finally {
      s.matrixWorldAutoUpdate = au;
    }
  }
  runInner(P, out, time) {
    const R = this.R,
      cam = this.camera,
      s = this.scene;
    const W = this.w,
      H = this.h;
    // 1. 場景（軟粒子：先畫粒子以外的東西、拷貝深度、再只畫粒子）
    R.setRenderTarget(this.rtScene);
    this.softUsed = false;
    if (this.softOk()) this.renderSoft(s, cam);
    else {
      FXU.uSoftOn.value = 0;
      R.render(s, cam);
    }
    // 2. SSAO（只畫法線＋算 AO，不再重畫一次場景）
    const low = this.low;
    const ao = this.ssao && P.ssao > 0 && !(low && low.ssao === 'off');
    if (ao) {
      const S = this.ssao,
        b = this.ssaoBase;
      S.kernelRadius = b.kernelRadius * this.wscale();
      S.minDistance = b.minDistance;
      S.maxDistance = b.maxDistance;
      const fromDepth = low && low.ssao === 'depth' && this.rtScene.depthTexture;
      if (fromDepth) {
        const n = this.nrm.m.uniforms;
        n.tDepth.value = this.rtScene.depthTexture;
        n.px.value.set(1 / W, 1 / H);
        n.invP.value.copy(cam.projectionMatrixInverse);
        this.draw(this.nrm, S.normalRenderTarget);
        S.ssaoMaterial.uniforms.tDepth.value = this.rtScene.depthTexture;
      } else {
        S.ssaoMaterial.uniforms.tDepth.value = S.normalRenderTarget.depthTexture;
        this.renderNormals(S);
      }
      S.ssaoMaterial.uniforms.kernelRadius.value = S.kernelRadius;
      S.ssaoMaterial.uniforms.minDistance.value = S.minDistance;
      S.ssaoMaterial.uniforms.maxDistance.value = S.maxDistance;
      S._renderPass(R, S.ssaoMaterial, S.ssaoRenderTarget);
      S._renderPass(R, S.blurMaterial, S.blurRenderTarget);
    }
    // 3. 合成：AO、動態模糊、描線
    const u = this.comp.m.uniforms;
    u.tColor.value = this.rtScene.texture;
    u.tDepth.value = this.rtScene.depthTexture || null;
    u.tAO.value = ao ? this.ssao.blurRenderTarget.texture : null;
    u.useAO.value = ao ? 1 : 0;
    u.aoK.value = P.ssao;
    u.px.value.set(1 / W, 1 / H);
    u.cNear.value = cam.near;
    u.cFar.value = cam.far;
    const pr = R.getPixelRatio();
    const depth = !!this.rtScene.depthTexture;
    u.inkA.value.set(depth ? P.ink : 0, P.inkOuter * pr, P.inkInner * pr, P.crease);
    const ic = lin(P.inkColor);
    u.inkB.value.set(ic.r, ic.g, ic.b, P.inkObj);
    const wk = this.wscale();
    u.inkC.value.set(P.inkNear * wk, Math.max(P.inkFar, P.inkNear + 1) * wk, P.inkEnv, 0);
    // 螢幕空間的邊緣光：太陽方向投影到畫面上的方向（docs/zzz-style-design.md）
    if (depth && P.srim > 0 && this.ctx.sunOff) {
      const sd = this.ctx.sunOff.clone().normalize().transformDirection(cam.matrixWorldInverse);
      const L = Math.hypot(sd.x, sd.y);
      const dx = L > 0.05 ? sd.x / L : 0.6,
        dy = L > 0.05 ? sd.y / L : 0.8;
      u.rimA.value.set(dx, dy, P.srimW * pr, P.srim);
      const rc = lin(P.srimColor);
      u.rimB.value.set(rc.r, rc.g, rc.b, 0.06);
    } else u.rimA.value.set(0, 0, 0, 0);
    const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    const mb = depth && P.mblur && P.mblurK > 0 && this.hasPrev && !(low && !low.mblur);
    u.mbA.value.set(mb ? P.mblurK * 1.2 : 0, P.mblurMech, 0, 0);
    u.invVP.value.copy(vp).invert();
    u.prevVP.value.copy(this.prevVP);
    this.draw(this.comp, this.rtA);
    // 3.5 景深（過場動畫的 P.dof；rtA → rtB，之後改用 rtB）
    let src = this.rtA,
      tmp = this.rtB;
    // 3.4 熱扭曲（第 8.3 期）：這一格有軟粒子的深度、有熱源時
    if (this.softUsed && this.heatPass(src, tmp, time)) {
      const t = src;
      src = tmp;
      tmp = t;
    }
    // 3.45 光束與鏡頭光斑（第 8.6 期）：太陽在畫面上（或剛出畫面）時
    if (depth && this.raysPass(src, tmp)) {
      const t = src;
      src = tmp;
      tmp = t;
    }
    if (depth && P.dof > 0) {
      const d = this.dof.m.uniforms;
      d.tColor.value = this.rtA.texture;
      d.tDepth.value = this.rtScene.depthTexture;
      d.px.value.set((1 / W) * 14 * pr, (1 / H) * 14 * pr);
      d.cNear.value = cam.near;
      d.cFar.value = cam.far;
      d.focus.value = P.dofF || 20;
      d.range.value = P.dofR || 3;
      d.amt.value = Math.min(1.5, P.dof);
      this.draw(this.dof, this.rtB);
      src = this.rtB;
      tmp = this.rtA;
    }
    // 3.9 HDR：色調映射（之後的 Bloom、調色照經典處理色調映射後的值）
    if (HDR) {
      const t = this.tonemap.m.uniforms;
      t.tDiffuse.value = src.texture;
      t.tDepth.value = this.rtScene.depthTexture || null;
      t.useDepth.value = this.rtScene.depthTexture ? 1 : 0;
      t.tmMode.value = TM_ID[P.toneMap] || 4;
      t.toneMappingExposure.value = R.toneMappingExposure;
      this.draw(this.tonemap, tmp);
      const x = src;
      src = tmp;
      tmp = x;
    }
    // 4. Bloom（疊加回 src）
    if (this.bloom && P.bloom > 0) {
      const b = this.bloom;
      b.strength = P.bloom;
      b.radius = P.bloomR;
      b.threshold = P.bloomTh;
      b.render(R, null, src, 0, false);
    }
    // 5. 調色（含 gamma）→ 6. FXAA
    const g = this.grade.m.uniforms;
    g.tDiffuse.value = src.texture;
    g.px.value.set(1 / W, 1 / H);
    g.time.value = time;
    g.aspect.value = W / H;
    g.gA.value.set(P.sat * (THREE.ColorManagement.enabled ? P.cmSat || 1 : 1), P.contrast, P.bright, P.temp);
    const tl = srgb(P.tintLo),
      th = srgb(P.tintHi);
    g.gL.value.set(tl.r, tl.g, tl.b, P.tintLoK);
    g.gH.value.set(th.r, th.g, th.b, P.tintHiK);
    const cp = this.ctx && this.ctx.chromaPush ? this.ctx.chromaPush() : 0; // 受到重擊時的色差
    g.gB.value.set(P.vignette, Math.min(1, P.chroma + cp), P.grain, P.paper);
    // 漫畫的衝擊畫格：ctx.comicPush() → { k 強度 0～1, inv 反色, seed }（game/juice.js 的 comicHit）
    const cm = P.comic > 0 && this.ctx && this.ctx.comicPush ? this.ctx.comicPush() : null;
    if (cm && cm.k > 0) {
      const ci = srgb(P.comicInk),
        cpp = srgb(P.comicPaper);
      g.gC.value.set(cm.k * P.comic, cm.inv ? 1 : 0, 7 * this.R.getPixelRatio(), cm.seed || 0);
      g.gI.value.set(ci.r, ci.g, ci.b, 0);
      g.gP.value.set(cpp.r, cpp.g, cpp.b, 0);
    } else g.gC.value.set(0, 0, 1, 0);

    if (this.fxaa && P.fxaa) {
      this.draw(this.grade, tmp);
      const f = this.fxaa.m.uniforms;
      f.tDiffuse.value = tmp.texture;
      f.resolution.value.set(1 / W, 1 / H);
      this.draw(this.fxaa, out);
    } else this.draw(this.grade, out);
  }
  // 光束與鏡頭光斑（ctx.rays() 為 true 時；砲火特效「華麗」、不在地下）：太陽方向投影到畫面，在鏡頭後面或離畫面太遠時不做
  raysPass(src, dst) {
    const c = this.ctx;
    if (!this.rtRay || this.noRays || !c.rays || !c.rays() || !c.sunOff || !this.camera.isPerspectiveCamera)
      return false;
    const cam = this.camera;
    const dir = (this._sd || (this._sd = new THREE.Vector3())).copy(c.sunOff).normalize();
    const fw = this._fw || (this._fw = new THREE.Vector3());
    cam.getWorldDirection(fw);
    if (dir.dot(fw) < 0.05) return false;
    const sp = (this._sp || (this._sp = new THREE.Vector3()))
      .copy(cam.position)
      .addScaledVector(dir, cam.far * 0.5);
    sp.project(cam);
    const sx = sp.x * 0.5 + 0.5,
      sy = sp.y * 0.5 + 0.5;
    const out = Math.max(0, -sx, sx - 1, -sy, sy - 1);
    if (out > 0.35) return false;
    const edge = 1 - Math.min(1, out / 0.35);
    const aspect = this.w / this.h;
    const r = this.raysQ.m.uniforms;
    r.tDepth.value = this.rtScene.depthTexture;
    r.sun.value.set(sx, sy);
    r.aspect.value = aspect;
    this.draw(this.raysQ, this.rtRay);
    const f = this.flareQ.m.uniforms;
    f.tColor.value = src.texture;
    f.tRays.value = this.rtRay.texture;
    f.tDepth.value = this.rtScene.depthTexture;
    f.sun.value.set(sx, sy);
    f.aspect.value = aspect;
    f.edge.value = edge;
    f.amt.value = 0.3 * edge;
    if (c.sun) f.sunC.value.copy(c.sun.color).multiplyScalar(Math.min(1.2, c.sun.intensity));
    this.draw(this.flareQ, dst);
    this.raysN = (this.raysN || 0) + 1; // 冒煙測試數畫了幾次
    return true;
  }
  // 熱扭曲：熱源的場景（ctx.heat() → { scene, on }）畫成半解析度的強度圖（用這一格的深度拷貝遮住牆後的熱源），
  // 再把 src 扭曲到 dst。沒有熱源時回傳 false
  heatPass(src, dst, time) {
    const H = this.ctx.heat && this.ctx.heat();
    if (!H || !H.on || !this.rtH || this.noHeat) return false;
    const R = this.R,
      cam = this.camera;
    const oc = R.getClearColor(new THREE.Color()),
      oa = R.getClearAlpha(),
      ac = R.autoClear;
    const res = FXU.uRes.value.clone();
    FXU.uSoftOn.value = 1;
    FXU.uRes.value.set(this.rtH.width, this.rtH.height);
    try {
      R.setClearColor(0x000000, 0);
      R.autoClear = true;
      R.setRenderTarget(this.rtH);
      R.render(H.scene, cam);
    } finally {
      R.setClearColor(oc, oa);
      R.autoClear = ac;
      FXU.uSoftOn.value = 0;
      FXU.uRes.value.copy(res);
    }
    const u = this.heatQ.m.uniforms;
    u.tColor.value = src.texture;
    u.tHeat.value = this.rtH.texture;
    u.px.value.set(1 / this.w, 1 / this.h);
    u.time.value = time;
    u.amt.value = 6 * R.getPixelRatio();
    this.draw(this.heatQ, dst);
    this.heatN = (this.heatN || 0) + 1; // 冒煙測試數畫了幾次
    return true;
  }
  // 軟粒子可以用的時候：有深度貼圖、透視鏡頭、不是低特效的場面
  softOk() {
    const dt = this.rtScene.depthTexture;
    return !!(
      this.rtD &&
      dt &&
      this.camera.isPerspectiveCamera &&
      !this.low &&
      !this.noSoft &&
      FX_MESHES.size
    );
  }
  // 第二次只看粒子圖層時，three.js 只收集圖層看得到的光源：光源不在粒子圖層上的話，這一次「沒有光源」，
  // 光源的版本每格改兩次，每個受光的材質每格都要重新找程式（每格約 80 次、大量的記憶體配置，
  // docs/perf-threejs-upgrade.md）。所以把場景裡的光源也加進粒子圖層（光源本身不畫東西，不影響畫面）；
  // 每 60 格重新掃一次場景，新加的光源最多晚 60 格
  fxLights(s) {
    if (this.lightScene === s && this.lightN++ % 60) return;
    this.lightScene = s;
    this.lightN = 1;
    if (!this.lightVisit) this.lightVisit = (o) => o.isLight && o.layers.enable(FX_LAYER);
    s.traverse(this.lightVisit);
  }
  // 粒子另外畫：第一次隱藏粒子，深度拷貝到 rtD，第二次鏡頭只看粒子的圖層（不清除、不畫背景、不更新陰影）
  renderSoft(s, cam) {
    const R = this.R,
      hid = [];
    for (const m of FX_MESHES)
      if (m.visible) {
        m.visible = false;
        hid.push(m);
      }
    try {
      R.render(s, cam);
    } finally {
      for (const m of hid) m.visible = true;
    }
    this.softUsed = false;
    if (!hid.length) return;
    this.softUsed = true;
    const u = this.dcopy.m.uniforms;
    u.tDepth.value = this.rtScene.depthTexture;
    u.cNear.value = cam.near;
    u.cFar.value = cam.far;
    this.draw(this.dcopy, this.rtD);
    FXU.uDepth.value = this.rtD.texture;
    FXU.uSoftOn.value = 1;
    FXU.uRes.value.set(this.w, this.h);
    FXU.uFar.value = cam.far;
    this.fxLights(s);
    const mask = cam.layers.mask,
      ac = R.autoClear,
      bg = s.background,
      sm = R.shadowMap.needsUpdate;
    cam.layers.set(FX_LAYER);
    R.autoClear = false;
    s.background = null;
    R.shadowMap.needsUpdate = false;
    try {
      R.setRenderTarget(this.rtScene);
      R.render(s, cam);
    } finally {
      cam.layers.mask = mask;
      R.autoClear = ac;
      s.background = bg;
      R.shadowMap.needsUpdate = sm;
      FXU.uSoftOn.value = 0;
    }
  }
  // SSAO 的法線（同 SSAOPass 的 overrideVisibility＋renderOverride＋restoreVisibility，但只走訪場景一次）：
  // 隱藏點、線（SSAOPass 原本就隱藏），以及描邊外殼（覆蓋材質下它和本體是同一份幾何、同樣的深度與法線，畫了結果相同，
  // 只是多一倍 draw call）、userData.noAO 的網格。沒有蒙皮網格時用覆蓋材質；有的話逐個網格換材質（蒙皮網格用蒙皮版：three.js r128 的同一個
  // 材質不會依物件換蒙皮／非蒙皮的程式）。
  renderNormals(S) {
    const R = this.R,
      s = this.scene,
      mat = S.normalMaterial;
    const hide = this.nHide,
      list = this.nList,
      mats = this.nMats;
    // 走訪的回呼只建一次（每格新建閉包是 GC 的來源之一，docs/perf-threejs-upgrade.md）
    if (!this.nVisit)
      this.nVisit = (o) => {
        if (o.isPoints || o.isLine || o.userData.noAO)
          this.nHide.push(o); // noAO：貼地的半透明標示（作戰區域的邊界線）
        else if (o.material && (o.isMesh || o.isSprite)) {
          if (o.isMesh && isOutline(o.material)) this.nHide.push(o);
          else this.nList.push(o);
        }
      };
    s.traverseVisible(this.nVisit);
    for (const o of hide) o.visible = false;
    // 一律逐個網格換材質（蒙皮、InstancedMesh、一般各一份）：用同一個覆蓋材質畫的話，
    // InstancedMesh 與一般網格交替時 three.js 每次都重新找程式
    const skinN = this.skinN,
      instN = this.instN;
    for (const o of list) {
      mats.push(o.material);
      o.material = o.isSkinnedMesh ? skinN : o.isInstancedMesh ? instN : mat;
    }
    const oc = R.getClearColor(this.tmpC || (this.tmpC = new THREE.Color())),
      oa = R.getClearAlpha(),
      ac = R.autoClear;
    try {
      R.setRenderTarget(S.normalRenderTarget);
      R.autoClear = false;
      R.setClearColor(0x7777ff);
      R.setClearAlpha(1);
      R.clear();
      R.render(s, this.camera);
    } finally {
      R.autoClear = ac;
      R.setClearColor(oc);
      R.setClearAlpha(oa);
      for (const o of hide) o.visible = true;
      for (let i = 0; i < list.length; i++) list[i].material = mats[i];
      hide.length = list.length = mats.length = 0;
    }
  }
  // 著色器預熱（Game.shaderWarm）：後處理的各段（熱扭曲、光束、景深…只在需要時才畫，第一次畫時才編譯）與熱扭曲的場景。
  // async 時回傳 compileAsync 的 Promise 陣列
  warm(async = false) {
    const R = this.R;
    const out = [];
    const go = (scene, cam) => {
      if (async) out.push(R.compileAsync(scene, cam));
      else R.compile(scene, cam);
    };
    const s = new THREE.Scene();
    for (const k in this) {
      const q = this[k];
      if (q && q.mesh && q.m && q.m.isShaderMaterial && q.mesh.isMesh) s.children.push(q.mesh);
    }
    try {
      go(s, this.cam2); // 只走訪，不改它們的 parent（draw 會放進 qScene）
    } finally {
      s.children.length = 0;
    }
    const H = this.ctx.heat && this.ctx.heat();
    if (H && H.scene) go(H.scene, this.camera);
    return out;
  }
  draw(q, target) {
    this.qScene.children.length = 0;
    this.qScene.add(q.mesh);
    this.R.setRenderTarget(target);
    this.R.render(this.qScene, this.cam2);
  }
  // P：目前的參數；cmp：{ P, split }（左半邊顯示 cmp.P）
  render(P, time, cmp) {
    const R = this.R;
    const cam = this.camera;
    cam.updateMatrixWorld();
    if (cmp && cmp.P) {
      this.run(cmp.P, this.rtL, time);
      this.run(P, this.rtR, time);
      const u = this.split.m.uniforms;
      u.tA.value = this.rtL.texture;
      u.tB.value = this.rtR.texture;
      u.split.value = cmp.split;
      u.pxX.value = 1 / this.w;
      this.draw(this.split, null);
    } else {
      // 上一格的場景留著（水面的螢幕空間反射）：兩張輪流用
      if (this.keepPrev && this.depthOk) {
        if (!this.rtPrev) {
          this.rtPrev = legacyTarget(this.rtScene.clone());
          this.rtPrev.depthTexture = new THREE.DepthTexture(this.w || 4, this.h || 4);
          this.rtPrev.depthTexture.type = this.rtScene.depthTexture.type;
          this.rtPrev.setSize(this.w || 4, this.h || 4);
        }
      } else this.prevOk = false;
      this.run(P, null, time);
      if (this.keepPrev && this.rtPrev) {
        const t = this.rtPrev;
        this.rtPrev = this.rtScene;
        this.rtScene = t;
        this.prevOk = true;
      }
    }
    R.setRenderTarget(null);
    this.prevVP.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.hasPrev = true;
  }
  // 不做後處理時：直接畫到畫面（設定裡關掉後製特效）
  renderPlain(P, time) {
    this.prevOk = false;
    FXU.uSoftOn.value = 0;
    this.applyScene(P, time);
    this.R.setRenderTarget(null);
    this.R.render(this.scene, this.camera);
    this.hasPrev = false;
  }
}
