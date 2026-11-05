// three.js 的打包進入點（scripts/build.js 以 esbuild 打包成 IIFE 的 dist/lib/three/three.js，docs/perf-threejs-upgrade.md 第 1 期）：
// r160 起沒有 UMD 的 build/three.js、r148 起沒有 examples/js，只剩 ES module；遊戲與模型庫照舊以全域 THREE 使用，
// 所以把核心與用到的 addons 合成一個物件掛在 window.THREE（addons 用 r128 時代 examples/js 的名稱），SimplexNoise 另外掛全域。
// 頁面以 <script src="lib/three/three.js"> 載入（直接開檔也能用）。新增 addon 時在這裡加 import 並放進 ADDONS
import * as CORE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader.js';
import { LuminosityHighPassShader } from 'three/examples/jsm/shaders/LuminosityHighPassShader.js';
import { SSAOShader } from 'three/examples/jsm/shaders/SSAOShader.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';

const ADDONS = {
  GLTFLoader,
  DRACOLoader,
  GLTFExporter,
  SkeletonUtils,
  RoundedBoxGeometry,
  EffectComposer,
  RenderPass,
  ShaderPass,
  UnrealBloomPass,
  SSAOPass,
  CopyShader,
  GammaCorrectionShader,
  LuminosityHighPassShader,
  SSAOShader,
  FXAAShader,
  OrbitControls,
  TransformControls,
};
// ===== 畫面模式（docs/perf-threejs-upgrade.md 第 4 期）=====
// localStorage rubicon_render＝{ mode: 'classic'｜'hdr'（預設）, cm: 布林（預設 true） }（設定畫面的「畫面模式」「色彩管理」，重新整理後生效：
// 色彩管理要在建立任何顏色之前決定）。classic＝r128 的畫面（第 1 期的相容設定）；hdr＝場景以半浮點畫、色調映射在後處理最後
// 做一次（render/legacy-rt.js、render/style/pipeline.js）、環境貼圖的漫射光照照 r187。光照單位兩種模式都照 r128（×π 在著色器裡，
// 和把各處的強度 ×π 完全相同）
const RENDER = (() => {
  let o = {};
  try {
    o = JSON.parse(localStorage.getItem('rubicon_render') || '{}') || {};
  } catch (e) {
    /* 壞掉的設定：用預設 */
  }
  // iblK：HDR 時環境貼圖漫射光照的倍率（預設 0＝和經典一樣沒有：加了陰影會被提亮、畫面偏灰，2026-11-05 使用者定案不加）
  const k = Number(o.iblK);
  return {
    hdr: o.mode !== 'classic',
    cm: o.cm !== false,
    iblK: Number.isFinite(k) ? Math.max(0, Math.min(1, k)) : 0,
  };
})();
// ===== 相容設定：畫面維持 r128 的樣子（docs/perf-threejs-upgrade.md 第 1 期）=====
// 1. 色彩管理：預設關掉，Color.set(hex) 不做 sRGB → 線性的轉換（遊戲的配色值是照 r128 的行為調的，例如 PALETTES.white 是線性值）；
//    設定「色彩管理」打開時照 sRGB 解讀（畫面整個變暗、變飽和，配色要重調）
CORE.ColorManagement.enabled = RENDER.cm;
// 2. 光照單位：r155 起是物理單位，r165 拿掉舊模式。照 r128 的舊單位改 chunk：方向光、點光、聚光、半球光、環境光的強度
//    ×π（r128 在光照計算裡乘 π），點光與聚光的距離衰減用舊公式 (1－距離／範圍)^decay（沒有平方反比）
const legacy = (name, pairs) => {
  let c = CORE.ShaderChunk[name];
  for (const [a, b] of pairs) {
    if (!c.includes(a)) throw new Error(`three-bundle：${name} 找不到「${a}」（three.js 的 chunk 改了）`);
    c = c.split(a).join(b);
  }
  CORE.ShaderChunk[name] = c;
};
legacy('lights_pars_begin', [
  ['vec3 irradiance = ambientLightColor;', 'vec3 irradiance = ambientLightColor * PI;'],
  [
    'float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );',
    'float distanceFalloff = ( cutoffDistance > 0.0 && decayExponent > 0.0 ) ? pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent ) : 1.0;',
  ],
  ['distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );', ''],
  ['light.color = directionalLight.color;', 'light.color = directionalLight.color * PI;'],
  ['light.color = pointLight.color;', 'light.color = pointLight.color * PI;'],
  [
    'light.color = spotLight.color * spotAttenuation;',
    'light.color = spotLight.color * spotAttenuation * PI;',
  ],
  [
    'vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );',
    'vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight ) * PI;',
  ],
]);

// 3. 環境貼圖的漫射：r128 只有 PMREM（cubeUV）的環境貼圖才加漫射的 IBL，遊戲用的是一般的 CubeTexture
//    （render/environment.js），所以只有鏡面反射；r187 會自動轉成 PMREM、多一整份漫射的環境光（畫面整個變亮）
legacy('lights_fragment_maps', [
  [
    'iblIrradiance += getIBLIrradiance( geometryNormal );',
    RENDER.hdr && RENDER.iblK > 0
      ? `iblIrradiance += getIBLIrradiance( geometryNormal ) * ${RENDER.iblK.toFixed(3)};`
      : '',
  ],
]);

// 4. 色彩管理打開時，光源的顏色照舊不轉換（光色和天空一樣是照線性值調的；材質的配色才照 sRGB 解讀）：
//    光源的 color／groundColor 換成 RawColor（setHex／setStyle 預設線性），各種場景（夜晚、黃昏的過場）變暗的比例才一致
const LIGHTS = {};
if (RENDER.cm) {
  class RawColor extends CORE.Color {
    setHex(hex, colorSpace = CORE.LinearSRGBColorSpace) {
      return super.setHex(hex, colorSpace);
    }
    setStyle(style, colorSpace = CORE.LinearSRGBColorSpace) {
      return super.setStyle(style, colorSpace);
    }
  }
  const raw = (c, d) => new RawColor(c === undefined || c === null ? d : c);
  const wrap = (Base, two) =>
    class extends Base {
      constructor(c, a, ...rest) {
        super(c, a, ...rest);
        this.color = raw(c, 0xffffff);
        if (two) this.groundColor = raw(a, 0xffffff);
      }
    };
  LIGHTS.DirectionalLight = wrap(CORE.DirectionalLight);
  LIGHTS.PointLight = wrap(CORE.PointLight);
  LIGHTS.SpotLight = wrap(CORE.SpotLight);
  LIGHTS.AmbientLight = wrap(CORE.AmbientLight);
  LIGHTS.HemisphereLight = wrap(CORE.HemisphereLight, true);
  LIGHTS.RawColor = RawColor;
}

// 模組的命名空間是唯讀的：複製成一般物件（程式裡會在 THREE 上找 addon、少數地方會補屬性）
const THREE = Object.assign({}, CORE, ADDONS, LIGHTS, { RUBICON_RENDER: RENDER });
window.THREE = THREE;
window.SimplexNoise = SimplexNoise;
