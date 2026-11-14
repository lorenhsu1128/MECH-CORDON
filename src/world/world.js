// ============================================================
//  WORLD — 隨機關卡生成
// ============================================================
import { rawColor } from '../render/color-cm.js';
import { RNG, clamp, lerp, makeNoise, makeRng, pick, rnd, rndi, withRng } from '../core/math.js';
import { DS, MS, WS } from '../core/scale.js';
import {
  JERSEY,
  SEMI,
  TWALL,
  buildJersey,
  buildSemiTruck,
  buildTWall,
  buildWarehouse,
  warehouseRidge,
} from './cover-models.js';
import { attrSig, mergeList, mergeStatic } from '../render/mesh-merge.js';
import { isFine } from '../render/detail.js';
import { isOutline } from '../render/geometry.js';
import { markSmoothable, styleCat, tagStyle } from '../render/style/shader.js';
import { propHpFor, propMatOf } from '../data/destruct.js';
import { buildWreck } from './prop-wreck.js';
import { tessellate } from './prop-split.js';
import {
  LANE_MARK,
  RAIL_STRIPS,
  RAIL_TIE,
  ROAD_STRIPS,
  box,
  ISO,
  buildContainerStack,
  buildDebris,
  buildDeck,
  buildGridPillar,
  buildLampPost,
  buildPillar,
  buildRock,
  buildTunnelPortal,
  buildDerrick,
  buildIceSheet,
  buildMiningRig,
  buildPipeline,
  derrickBase,
  floodW,
  buildPipeSupport,
  buildWreckArch,
  buildWreckHull,
  buildFloodlight,
  buildMtWreck,
  buildOreHopper,
  buildRockSpire,
  buildSandFence,
  buildSandstone,
  buildScrap,
  buildStorageTank,
  HOPPER,
  MT_WRECK,
  DOME_R,
  QUONSET,
  buildBeacon,
  buildIceChunk,
  buildIceShard,
  buildObsDome,
  buildQuonset,
  buildRadarDish,
  RADAR_S,
  buildThemeDeck,
  buildThemePillar,
  buildThemePlatform,
  buildThemeRamp,
  buildThemeTunnel,
  buildThemeWall,
  SAND_FENCE_H,
  MINING_RIG,
  PIPE,
  WRECK_ARCH,
  WRECK_HULL,
  propMats,
  corridorPiece,
  deckMats,
  mat,
  stripMesh,
} from './prop-models.js';
import { propShape, shapeContains, shapeSegT } from './prop-hit.js';
import { Weather } from './weather.js';
import { buildWaterMesh, disposeWater } from '../fx/water/surface.js';
import { FAR_R, OOB_BUF, buildBackdrop, edgeDelta, planEdges } from './edges.js';

// 鏡頭遮擋：擋住時淡到的不透明度。大型建築（外框高 FADE_BIG_H 以上）有很多層樓板與牆，每層都留一點就疊成一片白霧，
// 所以淡得更透明（2026-11-03 使用者定案）
const FADE_OP = 0.15,
  FADE_OP_BIG = 0.04,
  FADE_BIG_H = 15;
const fadeTo = (b) => (b.max.y - b.min.y >= FADE_BIG_H ? FADE_OP_BIG : FADE_OP);
const BOUND_R = 20 * DS; // 作戰區域的邊界線：機體離邊界這麼近才顯示、亮的半徑
const OPEN_KEEP = 0.2; // Boss 關（opt.open）：地圖物件只留這個比例當掩體
const OPEN_MID = 0.4; // Boss 關：地圖中央這個半徑（× lim）內的物件全部拿掉
import { LANDMARKS } from './landmarks.js';
import { buildLandingZone, buildLiftPad, variantOf } from './variants.js';
import { DAM } from './themes/dam.js';
import { FLOODED } from './themes/flooded.js';
import { GRID086 } from './themes/grid086.js';
import { INSTITUTE } from './themes/institute.js';
import { ORBIT } from './themes/orbit.js';
import { SPACEPORT } from './themes/spaceport.js';
import { XYLEM } from './themes/xylem.js';
import { VOLCANO } from './themes/volcano.js';
import { ARK } from './themes/ark.js';
import { AIRSPACE } from './themes/airspace.js';

const _seg = new THREE.Vector3(); // propBlocks 的暫存
const _fdir = new THREE.Vector3(), // fadeRay 的暫存
  _fpt = new THREE.Vector3();
// 障礙物的空間格子（obsAt；docs/perf-threejs-upgrade.md 第 8 期）：格子邊長、每個障礙物外框往外加寬的距離
// （查詢的半徑在這之內時只看所在的那一格；collide 的機體半徑最大約 5 MS）
const OG_C = 8 * WS,
  OG_PAD = 6 * MS;
const OG_EMPTY = [];
// 網格建造在 prop-models.js（純函式）；這裡只用亂數決定參數與位置，亂數呼叫順序不可改變
// 主題的公路／鐵路設定：{ p 出現機率, kinds 可出現的種類 }（noCorridor 時沒有）
export function corridorSpec(T) {
  if (T.noCorridor) return { p: 0, kinds: [] };
  return T.corridor || { p: 0.6, kinds: ['road', 'rail'] };
}
// 局部座標 (lx, lz) 繞 Y 轉 q×90° 後的位置（與 Object3D.rotation.y = q×π/2 一致）
const rotQ = (q, lx, lz) =>
  [
    [lx, lz],
    [lz, -lx],
    [-lx, -lz],
    [-lz, lx],
  ][q];
// 群組裡可透明的材質（鏡頭遮擋時半透明）
// 正方形高度圖（row-major，j × N + i）雙線性重新取樣成 N2 × N2：兩者都涵蓋整張地圖（自訂關卡的舊格子）
function resampleGrid(src, N2) {
  const N = Math.round(Math.sqrt(src.length));
  const out = new Float32Array(N2 * N2);
  const at = (i, j) => src[Math.min(N - 1, j) * N + Math.min(N - 1, i)];
  for (let j = 0; j < N2; j++)
    for (let i = 0; i < N2; i++) {
      const fx = (i * (N - 1)) / (N2 - 1),
        fz = (j * (N - 1)) / (N2 - 1);
      const x0 = Math.floor(fx),
        z0 = Math.floor(fz),
        u = fx - x0,
        v = fz - z0;
      out[j * N2 + i] = lerp(
        lerp(at(x0, z0), at(x0 + 1, z0), u),
        lerp(at(x0, z0 + 1), at(x0 + 1, z0 + 1), u),
        v,
      );
    }
  return out;
}
// 物件的代表顏色（殘骸、碎片用）：第一個有顏色的材質（頂點色的類別材質是白色，改取頂點色的平均）
function groupColor(g) {
  let c = null;
  g.traverse((o) => {
    if (c || !o.isMesh || !o.visible) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    const ca = o.geometry && o.geometry.attributes.color;
    if (ca && m.vertexColors) {
      let r = 0,
        gg = 0,
        b = 0;
      const n = Math.min(ca.count, 600);
      for (let i = 0; i < n; i++) {
        r += ca.getX(i);
        gg += ca.getY(i);
        b += ca.getZ(i);
      }
      c = new THREE.Color(r / n, gg / n, b / n);
    } else if (m && m.color && !m.transparent) c = m.color.clone();
  });
  return c ? c.getHex() : 0x80827f;
}
function fadeMatsOf(g) {
  const out = [];
  g.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material])
      if (m.transparent && !out.includes(m)) out.push(m);
  });
  return out;
}
// 場地：邊長預設 MAP_SIZE（主題可用 size 另訂）；k＝size／150（原本的場地 150 m），
// 場地內的位置範圍都乘上 k、物件數量乘上 (k／G)²（cnt）。機甲三倍高改版（core/scale.js）：場地與地形放大 G 倍，
// 地形的尺寸寫成「舊數字 * G」；物件照現實尺寸（docs/world-scale.md）
const G = WS;
const ARENA = 150,
  MAP_SIZE = 230 * G,
  // 大地圖（docs/map-pacing-design.md）：自由出擊與主線的一般戰鬥區段（opt.big）；Boss、精英、護送、防衛、
  // 自訂關卡、模擬器等照舊用 MAP_SIZE
  MAP_BIG = 320 * G,
  CELL = 5; // 地形格子：舊尺度 2.5 m（機甲 3.2 m）；地形照舊的形狀放大，5 m 相對機甲反而更細
// 冰原的冰湖：冰面高度
const ICE_Y = -0.7 * G;
// 機體站得上去的高低差（方塊的頂面在腳底這麼高以內就踩上去，否則擋住）
const STEP_H = 0.6 * MS;
// 地形的上色：岩石的高度（預設）、山頂的雪
const ROCK_Y = [9 * G, 6 * G],
  SNOW_C = new THREE.Color(0xf2f5f8);
// 主題的高度（水面、岩頂、虛空）跟著地形放大，霧跟著視距放大
function scaleTheme(T) {
  const o = { ...T };
  if (T.water) o.water = { ...T.water, level: T.water.level * G };
  if (T.roof) o.roof = { ...T.roof, y: T.roof.y * G, bump: (T.roof.bump || 8) * G };
  if (T.void)
    o.void = {
      ...T.void,
      y: T.void.y * G,
      fall: T.void.fall * G,
      fallP: (T.void.fallP ?? T.void.fall) * G,
      ref: T.void.ref * G,
    };
  o.fogNear = (T.fogNear || 60) * DS;
  o.fogFar = (T.fogFar || 190) * DS;
  return o;
}
export const THEMES = {
  snow: {
    name: '極地封鎖區',
    corridor: { p: 0.6, kinds: ['road', 'rail'] },
    ground: 0xbfc8d1,
    slope: 0x3a4048,
    rock: 0x2c3238,
    fog: 0xb3bfcb,
    sky: 0xb7c4d0,
    sun: 0xfff2dc,
    amb: 0x8fa0b4,
    container: 0x6b7d6a,
    container2: 0xd7a23c,
    hasRocks: true,
    weather: 'snow',
    iceLake: true, // 冰湖用獨立的亂數串
    props: 'snow',
  },
  industrial: {
    name: '貨運集散場',
    corridor: { p: 0.85, kinds: ['road', 'rail'] },
    ground: 0x5c626a,
    slope: 0x40454c,
    rock: 0x4a4f56,
    fog: 0x9aa3ad,
    sky: 0xa9b3bc,
    sun: 0xfff0d0,
    amb: 0x8894a2,
    container: 0xe0a020,
    container2: 0x2b4fb0,
    hasRocks: false,
  },
  grid: {
    name: '模擬訓練場',
    corridor: { p: 0.5, kinds: ['road'] },
    ground: 0x9ea6b3,
    slope: 0x7a828e,
    rock: 0x6f757f,
    fog: 0xc4cbd6,
    sky: 0xcdd4de,
    sun: 0xfff6ea,
    amb: 0xa8b0bc,
    container: 0xd2d6de,
    container2: 0xc8ccd4,
    hasRocks: false,
    flat: true,
    grid: true,
  },
  desert: {
    name: '礦坑遺跡',
    corridor: { p: 0.6, kinds: ['road', 'rail'] },
    ground: 0x9c8360,
    slope: 0x5a4636,
    rock: 0x5a4636,
    fog: 0xd8c7a8,
    sky: 0xe3d4b7,
    sun: 0xffe8c0,
    amb: 0xb8a48a,
    container: 0x7c8790,
    container2: 0xb8452a,
    hasRocks: true,
  },
  // 以下為 AC6 風格的主題（各自走新的生成路徑，上面四個主題的亂數順序不變）
  // terrain：地形輪廓（canyon 峽谷台地、dunes 沙丘）；weather：天氣粒子（只有外觀）；
  // props：專屬的物件組（buildThemeProps）與主題版的地形特徵；size：場地邊長（m，預設 MAP_SIZE）
  wasteland: {
    name: '荒涼工業荒野',
    corridor: { p: 0.7, kinds: ['rail', 'rail', 'road'] },
    ground: 0x8a6f52,
    slope: 0x5e4a3a,
    rock: 0x4e3e33,
    fog: 0xc9b394,
    sky: 0xd2bfa0,
    sun: 0xffe2b8,
    amb: 0xa48d72,
    container: 0x6f7a80,
    container2: 0xa8482c,
    hasRocks: true,
    terrain: 'canyon',
    weather: 'dust',
    props: 'wasteland',
  },
  dunes: {
    name: '沙丘地帶',
    corridor: { p: 0.4, kinds: ['road'] },
    ground: 0xc9a06a,
    slope: 0xa77c4c,
    rock: 0x7a5a3c,
    fog: 0xe6cfa6,
    sky: 0xeedcb8,
    sun: 0xfff0d0,
    amb: 0xd0b48a,
    container: 0x8c8f86,
    container2: 0xc05a30,
    hasRocks: false,
    terrain: 'dunes',
    weather: 'sand',
    props: 'dunes',
  },
  flooded: FLOODED,
  dam: DAM,
  spaceport: SPACEPORT,
  grid086: GRID086,
  xylem: XYLEM,
  orbit: ORBIT,
  institute: INSTITUTE,
  volcano: VOLCANO, // 主線第 7 章（docs/campaign-expansion-design.md）
  ark: ARK, // 主線第 8 章
};
// 線性色調映射（賽璐璐類渲染風格）時的曝光補正：線性不壓高光，白色的場景容易爆白、暗的場景補亮一點
// （render/style/pipeline.js 的 applyScene；ACES 等會壓高光的不套用）。變體可以用 theme.linExp 覆寫
const LIN_EXP = {
  snow: 0.7,
  grid: 0.86,
  dunes: 0.88,
  xylem: 0.82,
  orbit: 0.82,
  industrial: 0.94,
  spaceport: 0.9,
  flooded: 1.15,
  grid086: 1.2,
  institute: 1.15,
  volcano: 1.1,
  ark: 1,
};
for (const k in LIN_EXP) THEMES[k].linExp = LIN_EXP[k];
// 設定「色彩管理」打開時的曝光補正（docs/perf-threejs-upgrade.md 第 4 期）：配色照 sRGB 解讀後顏色變深（越暗的顏色變得越多），
// 以各主題在 5 個內建渲染風格的畫面亮度比（之前的畫面／色彩管理）補回整體亮度；色調變得較深、較飽和（新的色調）。
// 變體可以用 theme.cmExp 覆寫（render/style/pipeline.js 的 applyScene）
const CM_EXP = {
  dam: 2.41,
  desert: 2.14,
  dunes: 2.01,
  flooded: 1.96,
  grid: 1.9,
  grid086: 2.58,
  industrial: 2.73,
  institute: 2.03,
  orbit: 1.98,
  snow: 1.62,
  spaceport: 2.18,
  wasteland: 2.39,
  xylem: 1.93,
  volcano: 2.2,
  ark: 2.3,
};
for (const k in CM_EXP) THEMES[k].cmExp = CM_EXP[k];
// 換色調但亮度不低於參考色（docs/brightness-design.md：夜間的變體、主線的黃昏與夜間保留色調、亮度照白天）：
// 整個顏色等比放大到最大的通道和參考色一樣（HSV 的明度），色相與飽和度不變（HSL 的明度拉到 1 會變成純白）
function keepLC(c, ref) {
  const m = Math.max(c.r, c.g, c.b),
    mr = Math.max(ref.r, ref.g, ref.b);
  if (m > 1e-4 && m < mr) c.multiplyScalar(mr / m);
  else if (m <= 1e-4) c.setRGB(mr, mr, mr);
  return c;
}
function keepL(hex, refHex) {
  if (hex === undefined || refHex === undefined) return hex;
  return keepLC(new THREE.Color(hex), new THREE.Color(refHex)).getHex();
}
// 色彩管理＋線性色調映射（賽璐璐類風格）時再乘上：線性不壓暗部，暗色的主題地面會接近全黑
const CM_LIN_EXP = { institute: 1.5, grid086: 1.15 };
for (const k in CM_LIN_EXP) THEMES[k].cmLinExp = CM_LIN_EXP[k];
// 空域（空戰，docs/air-combat-design.md）：不可列舉——THEMES.airspace 照樣讀得到，但隨機選圖、編輯器、實驗室、
// 多人、各種「全部主題」的清單都不會列出（只在自由出擊的單人選得到，mapOptionsHtml）
Object.defineProperty(THEMES, 'airspace', { value: AIRSPACE, enumerable: false });
AIRSPACE.cmExp = 1.78; // 色彩管理的曝光補正（同高空軌道：天空占大部分畫面）

// 合併池、地形裝飾的合併依區域分格：格子邊長＝limOut／POOL_CELL（場地 ±limOut：每邊 2×POOL_CELL 格）。
// 2026-11-13 從 2 改成 4（4×4 → 8×8 格）：一格太大時畫面外的部分照畫（每道算繪 45～90 萬個三角形）
const POOL_CELL = 4;
const WRECK_TILT = 0.44; // 殘骸順著坡度傾斜的上限（約 25°）
const _decorBox = new THREE.Box3();
// 材質的外觀（合併池與地形裝飾的合併用：同樣外觀的不同材質物件可以合併）
function propMatSig(m) {
  return isOutline(m)
    ? 'outline:' + m.uuid
    : [
        m.type,
        m.color ? m.color.getHexString() : '',
        m.emissive ? m.emissive.getHexString() : '',
        m.emissiveIntensity,
        m.roughness,
        m.metalness,
        m.map ? m.map.uuid : '',
        m.normalMap ? m.normalMap.uuid : '',
        m.roughnessMap ? m.roughnessMap.uuid : '',
        m.metalnessMap ? m.metalnessMap.uuid : '',
        m.emissiveMap ? m.emissiveMap.uuid : '',
        m.aoMap ? m.aoMap.uuid : '',
        m.alphaMap ? m.alphaMap.uuid : '',
        m.envMap ? m.envMap.uuid : '',
        m.envMapIntensity,
        m.vertexColors,
        m.side,
        m._stFlat,
        m.transparent,
        m.opacity,
        m.alphaTest,
        m.depthWrite,
        m.polygonOffset,
        m.polygonOffsetFactor,
        m.visible,
        styleCat(m),
        m.customProgramCacheKey ? m.customProgramCacheKey() : '',
      ].join(',');
}

export class World {
  constructor(scene, theme, seed, level, feat, opt = {}) {
    this.scene = scene;
    this.forceRail = !!opt.rail; // 武裝列車的關卡：一定有鐵路（主題允許時）
    this.forceRoad = !!opt.road; // 主線的護送區段：一定有公路（主題允許時）
    this.opt = opt;
    // 自訂關卡（level/format.js）：opt.level＝{ blank 空白底圖, props 產生器物件 all／big／none, h 高度圖, water 水面,
    // removed 移除的產生器物件 [[x, z]] }；全部在原本的亂數呼叫之外套用，一般地圖與主線不受影響
    const LV = (this.lvl = opt.level || null);
    // 主題變體（world/variants.js）：覆寫主題欄位、改地形、加結構；沒有變體時完全照原本生成
    this.variant = LV && LV.blank ? null : variantOf(theme, opt.variant);
    this.variantKey = this.variant ? opt.variant : '';
    this.theme =
      this.variant && this.variant.theme ? { ...THEMES[theme], ...this.variant.theme } : THEMES[theme];
    this.theme = scaleTheme(this.theme);
    if (LV && LV.water !== null && LV.water !== undefined) {
      const W0 = this.theme.water || { color: 0x37586a, opacity: 0.85, rough: 0.12 };
      this.theme = { ...this.theme, water: { ...W0, level: LV.water } };
    }
    this.tod = opt.tod || ''; // 時間（主線）：'' 或 day／dusk／night／dawn
    this.depth = opt.depth || 0; // 垂直下降的深度（主線）：越深越暗
    this.themeKey = theme;
    this.size = this.theme.size || (opt.big && !LV ? MAP_BIG : MAP_SIZE);
    this.k = this.size / ARENA;
    this.cell = this.theme.cell || CELL; // 空域的格子比較粗（themes/airspace.js）
    this.cells = Math.round(this.size / this.cell);
    this.lim = 62 * this.k; // 作戰區域（電腦機體 collide 限制在 ±lim）
    this.limOut = this.lim + OOB_BUF; // 玩家可以超出作戰區域到這裡（警告並推回），collide 的 soft
    this.setZone(opt.zone, opt.zoneAxis);
    this.trackS = (this.size / 2) * 0.86; // 公路／鐵路兩端隧道口
    this.level = level;
    this.seed = seed;
    this.noise = makeNoise(seed);
    this.noise2 = makeNoise(seed * 7 + 3);
    this.rng = makeRng(seed * 13 + 7);
    this.obstacles = [];
    this.occluders = [];
    this.meshes = [];
    // 純裝飾的小物件（碎石、廢鐵…）：建好地圖後依材質合併成少數網格（自訂關卡不合併：編輯器要能逐一移除）
    this.decorG = new THREE.Group();
    this.decorG.userData.noFade = true;
    scene.add(this.decorG);
    this.meshes.push(this.decorG);
    this.h = new Float32Array((this.cells + 1) * (this.cells + 1));
    withRng(seed * 31 + 11, () => {
      if (feat) {
        this.features = feat.map((f) => ({
          k: f.k,
          kind: f.kind,
          dir: f.dir ? new THREE.Vector2(f.dir[0], f.dir[1]) : undefined,
          perp: f.perp ? new THREE.Vector2(f.perp[0], f.perp[1]) : undefined,
          off: f.off,
          width: f.width,
          depth: f.depth,
          bridges: f.bridges,
          deckW: f.deckW,
          center: f.center,
          span: f.span,
          rampL: f.rampL,
          deckH: f.deckH,
          count: f.count,
          len: f.len,
          bend: f.bend,
        }));
        this.featureNames = this.features
          .filter((f) => f.k !== 'corridor')
          .map(
            (f) =>
              ({
                river_bridge: '河道與橋梁',
                overpass: '高架橋',
                bunkers: '掩體群',
                trench: '壕溝',
                platforms: '高台',
              })[f.k],
          );
        const cf = this.features.find((f) => f.k === 'corridor');
        if (cf) {
          this.corridor = {
            kind: cf.kind,
            dir: cf.dir,
            perp: cf.perp,
            off: cf.off,
            width: 10,
            len: cf.len,
            bend: cf.bend || null,
          };
          this.featureNames.push(cf.kind === 'road' ? '穿越公路' : '穿越鐵路');
        }
      } else if (LV && LV.blank) {
        this.features = [];
        this.featureNames = [];
      } else {
        this.planFeatures();
      }
      this.buildTerrain();
      if (!(LV && LV.blank)) this.buildFeatures();
      // 地形特徵與主題的大型結構：承重柱倒塌、局部打穿另外處理（docs/destruction-design.md），不併進一般物件
      for (const o of this.obstacles) o.struct = true;
      const ob0 = this.obstacles.length,
        me0 = this.meshes.length;
      if (!(LV && (LV.blank || LV.props === 'none'))) this.buildProps();
      // Boss 關（opt.open）：物件太多會一直擋住 Boss 的攻擊，依位置挑掉大部分（不用亂數，各端一樣）
      if (opt.open && !LV) this.openArena(ob0, opt.open);
      // 以下只在主線（或選了變體）時有：接在原本的亂數呼叫之後，不影響一般地圖
      if (this.variant && this.variant.build) this.variant.build(this);
      if (opt.landmark) this.addLandmark(opt.landmark);
      // 邊緣進場（opt.edge）：玩家從作戰區域的一側出發（planStart 用自己的亂數串，不影響生成）
      if (opt.edge && !LV) this.start = this.planStart();
      if (opt.entry) this.addEntry(opt.entry);
      if (LV) this.levelGenItems(ob0, me0);
      else if (!opt.sample)
        mergeStatic(this.decorG, new Set(), true, {
          cell: this.limOut / POOL_CELL,
          cellTris: 50000,
          matKey: propMatSig,
        }); // 很大的合併分成 8×8 格（視錐剔除剔得掉）；同外觀的不同材質物件也合併
    });
    // 只取樣地形與障礙物（作戰室的全像戰略桌，game/hub-holo.js）：生成到這裡就夠了，之後的登記、合併、遠景、天氣都不呼叫地圖的亂數
    if (opt.sample) return;
    // 其他打得到的物件也登記成可破壞（不用亂數，照障礙物的順序；現有物件的編號不變）
    // 改版後才登記的物件（legacy＝false）：設定「不可破壞」時打不壞
    this.regNew = true;
    this.regRest();
    this.regStructs();
    this.regDecks();
    this.regSegs();
    this.regNew = false;
    if (!LV && !opt.noMerge) {
      // 自訂關卡與編輯器不合併（產生器物件的移除與還原直接切換顯示）；過場動畫的地圖（opt.noMerge）也不合併：
      // 合併池的網格＋原本的網格＋還原用的頂點各一份，常駐好幾張地圖時記憶體太大（game/cine-prep.js）
      this.mergeGridPillars();
      this.mergeProps();
    }
    // 邊界外的遠景地形與剪影物件（edges.js，獨立的亂數串，不影響上面的生成）
    withRng(seed * 97 + 41, () => {
      for (const o of buildBackdrop(this) || []) {
        o.userData.noFade = true; // 鏡頭遮擋不淡出（fadeMeshes）
        o.userData.cat = 'far'; // 地圖預覽器的場景分類（game/map-view-perf.js）
        scene.add(o);
        this.meshes.push(o);
      }
    });
    this.buildBoundary();
    // 天氣粒子：只有外觀，各端各自用 Math.random（不影響地圖）
    const wk = opt.weather === 'none' ? null : opt.weather || this.theme.weather;
    this.weather = wk ? new Weather(scene, wk, this.theme) : null;
  }
  hAt(i, j) {
    i = clamp(i, 0, this.cells);
    j = clamp(j, 0, this.cells);
    return this.h[j * (this.cells + 1) + i];
  }
  terrainHeight(x, z) {
    const fx = (x + this.size / 2) / this.cell,
      fz = (z + this.size / 2) / this.cell;
    const i = Math.floor(fx),
      j = Math.floor(fz),
      u = fx - i,
      v = fz - j;
    return lerp(
      lerp(this.hAt(i, j), this.hAt(i + 1, j), u),
      lerp(this.hAt(i, j + 1), this.hAt(i + 1, j + 1), u),
      v,
    );
  }
  buildTerrain() {
    const T = this.theme,
      n = this.noise,
      n2 = this.noise2;
    // 新主題的地形輪廓（canyon／dunes）取代原本的起伏＋台地＋土丘；自訂關卡的空白底圖是平地（有水面時高出水面）
    const blankH = T.water ? Math.max(0, T.water.level + 1.2 * G) : 0;
    const prof =
      this.lvl && this.lvl.blank
        ? () => blankH
        : T.planTerrain
          ? T.planTerrain(this)
          : T.terrain === 'canyon'
            ? this.planCanyon()
            : T.terrain === 'dunes'
              ? this.planDunes()
              : null;
    const plateaus = [];
    const cliffPts = [];
    if (!prof) {
      const pc = T.flat ? this.cnt(0, 1) : this.cnt(2, 4);
      for (let k = 0; k < pc; k++)
        plateaus.push({
          x: rnd(-45 * this.k, 45 * this.k),
          z: rnd(-45 * this.k, 45 * this.k),
          w: rnd(14, 30) * G,
          d: rnd(14, 30) * G,
          h: rnd(3, 7) * G,
          r: rnd(4, 8) * G,
        });
      for (let k = 0, nc = T.flat ? 0 : this.cnt(2, 4); k < nc; k++)
        cliffPts.push({
          x: rnd(-55 * this.k, 55 * this.k),
          z: rnd(-55 * this.k, 55 * this.k),
          r: rnd(9, 16) * G,
          h: rnd(6, 10) * G,
        });
    }
    const lake = T.iceLake && !(this.lvl && this.lvl.blank) ? this.planIceLake() : null;
    // 基本輪廓（地圖外的遠景地形也用它往外延伸，farHeight）
    this.baseH = (x, z) =>
      prof
        ? prof(x, z)
        : T.flat
          ? 0
          : (n((x / G) * 0.03, (z / G) * 0.03) * 1.2 + n2((x / G) * 0.1, (z / G) * 0.1) * 0.3) * G;
    this.edges = planEdges(this);
    const vt = this.variant && this.variant.terrain ? this.variant.terrain(this) : null;
    for (let j = 0; j <= this.cells; j++)
      for (let i = 0; i <= this.cells; i++) {
        const x = i * this.cell - this.size / 2,
          z = j * this.cell - this.size / 2;
        let h = this.baseH(x, z);
        for (const p of plateaus) {
          const dx = Math.max(Math.abs(x - p.x) - p.w / 2, 0),
            dz = Math.max(Math.abs(z - p.z) - p.d / 2, 0);
          const d = Math.sqrt(dx * dx + dz * dz);
          const t = clamp(1 - d / p.r, 0, 1);
          h += p.h * (t * t * (3 - 2 * t));
        }
        for (const c of cliffPts) {
          const d = Math.hypot(x - c.x, z - c.z);
          const t = clamp(1 - d / c.r, 0, 1);
          h += c.h * t * t;
        }
        if (lake) h = lake.apply(x, z, h);
        if (vt) h = vt(x, z, h);
        h += edgeDelta(this, x, z); // 邊界外：依段落隆起、下降或延伸（edges.js）
        h = this.featureHeight(x, z, h);
        this.h[j * (this.cells + 1) + i] = h;
      }
    // smooth a little（方舟的船體不平滑：甲板各層的邊緣要俐落，docs/ark-redesign.md）
    const s = new Float32Array(this.h);
    if (!T.noSmooth)
      for (let j = 1; j < this.cells; j++)
        for (let i = 1; i < this.cells; i++) {
          s[j * (this.cells + 1) + i] =
            (this.hAt(i, j) * 4 +
              this.hAt(i - 1, j) +
              this.hAt(i + 1, j) +
              this.hAt(i, j - 1) +
              this.hAt(i, j + 1)) /
            8;
        }
    this.h = s;
    // 自訂關卡：整張高度圖（存的是平滑後的最終值）
    const LH = this.lvl && this.lvl.h;
    if (LH && LH.length === this.h.length) this.h = Float32Array.from(LH);
    else if (LH && Math.sqrt(LH.length) % 1 === 0)
      this.h = resampleGrid(LH, Math.round(Math.sqrt(this.h.length))); // 舊格子（三倍高改版前的關卡）
    this.buildTerrainMesh();
    if (T.water) this.addWater(T.water);
    if (T.roof) this.addRoof(T.roof);
    if (lake) {
      const ice = buildIceSheet(lake.rx, lake.rz, lake.rng);
      ice.position.set(lake.x, lake.level + 0.05, lake.z);
      ice.rotation.y = lake.rot;
      ice.userData.noFade = true;
      this.scene.add(ice);
      this.meshes.push(ice);
    }
    if (T.grid) {
      const gh = new THREE.GridHelper(this.size * 3, (this.size * 3) / (2.5 * G), 0x6b7280, 0x8b93a0);
      gh.position.y = 0.04;
      gh.material.transparent = true;
      gh.material.opacity = 0.35;
      this.scene.add(gh);
      this.meshes.push(gh);
    }
  }
  // 地形網格（關卡編輯器的筆刷改了高度後重建：keepMesh 時沿用同一個網格，只換幾何）
  buildTerrainMesh(keepMesh) {
    const T = this.theme;
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.cells, this.cells);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k),
        z = pos.getZ(k);
      pos.setY(k, this.terrainHeight(x, z));
    }
    const ng = geo.toNonIndexed();
    ng.computeVertexNormals();
    const col = new Float32Array(ng.attributes.position.count * 3);
    const cg = new THREE.Color(T.ground),
      cs = new THREE.Color(T.slope),
      cr = new THREE.Color(T.rock),
      tmp = new THREE.Color();
    const nr = ng.attributes.normal,
      pp = ng.attributes.position;
    for (let f = 0; f < pp.count; f += 3) {
      const ny = (nr.getY(f) + nr.getY(f + 1) + nr.getY(f + 2)) / 3;
      const y = (pp.getY(f) + pp.getY(f + 1) + pp.getY(f + 2)) / 3;
      const steep = clamp((0.93 - ny) * 6, 0, 1);
      tmp.copy(cg).lerp(cs, steep);
      // 岩石的高度（主題可以另訂 rockY＝[開始, 漸變]）；空域另有海岸的沙灘 shore 與山頂的雪 snowY（themes/airspace.js）
      const RY = T.rockY || ROCK_Y;
      if (T.shore && y < T.shore[0]) tmp.lerp(T.shoreC || (T.shoreC = new THREE.Color(T.shore[1])), 0.75);
      if (y > RY[0]) tmp.lerp(cr, clamp((y - RY[0]) / RY[1], 0, 0.7));
      if (T.snowY && y > T.snowY) tmp.lerp(SNOW_C, clamp((y - T.snowY) / 60, 0, 0.85) * (1 - steep * 0.6));
      tmp.offsetHSL(0, 0, keepMesh ? ((f * 0.618) % 1) * 0.04 - 0.02 : rnd(-0.02, 0.02));
      for (let q = 0; q < 3; q++) {
        col[(f + q) * 3] = tmp.r;
        col[(f + q) * 3 + 1] = tmp.g;
        col[(f + q) * 3 + 2] = tmp.b;
      }
    }
    ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
    // 平滑的法線（另一個屬性 stNrm2；原本的 normal 照舊是面法線，SSAO 的法線等其他地方不變）：
    // 渲染風格的「場景平滑」（絕區零）才用（style/shader.js，docs/zzz-style-design.md）
    geo.computeVertexNormals();
    ng.setAttribute('stNrm2', geo.toNonIndexed().attributes.normal);
    // 平滑的顏色（每個頂點取周圍面的平均，沒有每個面的明暗跳動）：同樣只給「場景平滑」用
    const vn = (this.cells + 1) * (this.cells + 1),
      acc = new Float32Array(vn * 4),
      idx = geo.index;
    for (let t = 0; t < idx.count; t++) {
      const v = idx.getX(t),
        f = t - (t % 3);
      acc[v * 4] += col[f * 3];
      acc[v * 4 + 1] += col[f * 3 + 1];
      acc[v * 4 + 2] += col[f * 3 + 2];
      acc[v * 4 + 3]++;
    }
    const col2 = new Float32Array(col.length);
    for (let t = 0; t < idx.count; t++) {
      const v = idx.getX(t),
        n = acc[v * 4 + 3] || 1;
      col2[t * 3] = acc[v * 4] / n;
      col2[t * 3 + 1] = acc[v * 4 + 1] / n;
      col2[t * 3 + 2] = acc[v * 4 + 2] / n;
    }
    ng.setAttribute('stCol2', new THREE.BufferAttribute(col2, 3));
    if (keepMesh && this.terrainMesh) {
      this.terrainMesh.geometry.dispose();
      this.terrainMesh.geometry = ng;
      this.waterDirty = true; // 水面的地形高度貼圖要重烘（fx/water/index.js）
      return;
    }
    const m = new THREE.Mesh(
      ng,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        roughness: 0.95,
        metalness: 0.02,
      }),
    );
    m.receiveShadow = true;
    m.castShadow = true;
    markSmoothable(m.material);
    this.scene.add(m);
    this.meshes.push(m);
    this.terrainMesh = m;
  }
  // 峽谷台地（荒野）：低緩的谷底＋數座陡峭的平頂台地與孤峰（邊緣以雜訊打亂）
  planCanyon() {
    const n = this.noise,
      n2 = this.noise2;
    const mesas = [];
    const add = (big) => {
      for (let t = 0; t < 12; t++) {
        const x = rnd(-50 * this.k, 50 * this.k),
          z = rnd(-50 * this.k, 50 * this.k);
        if (Math.hypot(x, z) < (big ? 26 : 18) * G) continue;
        if (mesas.some((m) => Math.hypot(m.x - x, m.z - z) < (big ? 26 : 14) * G)) continue;
        const m = {
          x,
          z,
          w: (big ? rnd(14, 24) : rnd(4, 7)) * G,
          d: (big ? rnd(12, 22) : rnd(4, 7)) * G,
          h: (big ? rnd(9, 14) : rnd(7, 11)) * G,
          r: (big ? rnd(2.8, 4.5) : rnd(1.8, 2.8)) * G,
        };
        const a = rnd(0, Math.PI);
        m.c = Math.cos(a);
        m.s = Math.sin(a);
        mesas.push(m);
        return;
      }
    };
    for (let k = this.cnt(3, 5); k > 0; k--) add(true);
    for (let k = this.cnt(3, 5); k > 0; k--) add(false);
    return (x0, z0) => {
      const x = x0 / G,
        z = z0 / G; // 雜訊照舊尺度取樣
      let h = (n(x * 0.022, z * 0.022) * 1.8 + n2(x * 0.09, z * 0.09) * 0.45) * G;
      for (const m of mesas) {
        const dx0 = x0 - m.x,
          dz0 = z0 - m.z;
        const lx = dx0 * m.c - dz0 * m.s,
          lz = dx0 * m.s + dz0 * m.c;
        const dx = Math.max(Math.abs(lx) - m.w / 2, 0),
          dz = Math.max(Math.abs(lz) - m.d / 2, 0);
        const d = Math.hypot(dx, dz) + (n2(x * 0.17 + 3, z * 0.17) - 0.5) * 3 * G;
        const t = clamp(1 - d / m.r, 0, 1);
        // 台地中段一道階梯：t 介於 0.45～0.6 時停在 55% 的高度
        const k = t < 0.45 ? (t / 0.45) * 0.55 : t < 0.6 ? 0.55 : 0.55 + ((t - 0.6) / 0.4) * 0.45;
        h = Math.max(h, m.h * k * (1 - 0.06 * n(x * 0.3, z * 0.3)));
      }
      return h;
    };
  }
  // 沙丘：兩組不對稱的沙丘波（迎風緩、背風陡），走向以雜訊扭曲，高度以低頻雜訊調變
  planDunes() {
    const n = this.noise,
      n2 = this.noise2;
    const a = rnd(0, Math.PI * 2),
      a2 = a + rnd(0.5, 0.9);
    const d1 = [Math.cos(a), Math.sin(a)],
      d2 = [Math.cos(a2), Math.sin(a2)];
    const lam1 = rnd(24, 32),
      lam2 = rnd(10, 14),
      amp1 = rnd(5, 7) * G,
      amp2 = rnd(0.6, 1.1) * G,
      ph = rnd(0, 1);
    const dune = (p) => {
      const f = p - Math.floor(p);
      const s = f < 0.72 ? f / 0.72 : (1 - f) / 0.28;
      return s * s * (3 - 2 * s);
    };
    return (x0, z0) => {
      const x = x0 / G,
        z = z0 / G; // 波長與雜訊照舊尺度取樣
      const warp = n(x * 0.018, z * 0.018) * 1.1;
      const am = amp1 * (0.35 + 0.65 * n2(x * 0.012 + 7, z * 0.012 - 3));
      let h = dune((x * d1[0] + z * d1[1]) / lam1 + warp + ph) * am;
      h += dune((x * d2[0] + z * d2[1]) / lam2 + warp * 0.6) * amp2;
      return h + (n(x * 0.01 + 5, z * 0.01) * 2.5 + n2(x * 0.07, z * 0.07) * 0.25 - 1.5) * G;
    };
  }
  // 冰湖（冰原）：以獨立的亂數串決定，不動原本的亂數順序；湖面壓平到 level，邊緣以雜訊打亂成自然湖岸
  planIceLake() {
    const rng = makeRng(this.seed * 53 + 19);
    const ang = rng() * Math.PI * 2,
      dist = (30 + rng() * 14) * G;
    const L = {
      x: Math.cos(ang) * dist,
      z: Math.sin(ang) * dist,
      rx: (12 + rng() * 6) * G,
      rz: (9 + rng() * 5) * G,
      rot: rng() * Math.PI,
      level: ICE_Y,
      rng,
    };
    const c = Math.cos(L.rot),
      s = Math.sin(L.rot),
      n2 = this.noise2;
    L.apply = (x, z, h) => {
      const dx = x - L.x,
        dz = z - L.z;
      const lx = dx * c - dz * s,
        lz = dx * s + dz * c;
      const d = Math.hypot(lx / L.rx, lz / L.rz) + (n2((x / G) * 0.08, (z / G) * 0.08) - 0.5) * 0.24;
      const t = clamp((1.15 - d) / 0.35, 0, 1);
      return lerp(h, L.level, t * t * (3 - 2 * t));
    };
    return L;
  }
  // 地圖外（遠景地形）的高度：同樣的輪廓＋邊界處理＋地形特徵；地圖裡就是 terrainHeight
  farHeight(x, z) {
    const S = this.size / 2;
    if (Math.abs(x) <= S && Math.abs(z) <= S) return this.terrainHeight(x, z);
    return this.featureHeight(x, z, this.baseH(x, z) + edgeDelta(this, x, z));
  }
  onCorridor(x, z, margin = 2) {
    const c = this.corridor;
    if (!c) return false;
    return Math.abs(this.corridorU(x, z)) < c.width / 2 + margin;
  }
  // 通道中心線：沿 dir 的參數 s，橫向偏移 off＋bend(s)。bend＝[幅度, 0 弓形／1 S 形]，null＝直線
  corridorBend(s) {
    const b = this.corridor && this.corridor.bend;
    if (!b) return 0;
    const t = clamp(s / (this.corridor.len / 2 + 18), -1, 1);
    return b[1] ? b[0] * Math.sin(Math.PI * t) : b[0] * (1 - t * t);
  }
  corridorSlope(s) {
    const b = this.corridor && this.corridor.bend;
    const L = this.corridor ? this.corridor.len / 2 + 18 : 1;
    if (!b || Math.abs(s) > L) return 0;
    const t = s / L;
    return b[1] ? ((b[0] * Math.PI) / L) * Math.cos(Math.PI * t) : (-2 * b[0] * t) / L;
  }
  // (x, z) 離通道中心線的橫向距離（有正負，沿 perp）
  corridorU(x, z) {
    const c = this.corridor;
    return x * c.perp.x + z * c.perp.y - c.off - this.corridorBend(x * c.dir.x + z * c.dir.y);
  }
  corridorPoint(s, u = 0) {
    const c = this.corridor;
    const o = c.off + this.corridorBend(s) + u;
    const x = c.dir.x * s + c.perp.x * o,
      z = c.dir.y * s + c.perp.y * o;
    return new THREE.Vector3(x, this.terrainHeight(x, z), z);
  }
  // 參數 s 處的行進方向（單位向量，XZ）
  corridorDir(s) {
    const c = this.corridor,
      k = this.corridorSlope(s);
    return new THREE.Vector2(c.dir.x + c.perp.x * k, c.dir.y + c.perp.y * k).normalize();
  }
  slopeOK(x, z) {
    const s =
      Math.abs(this.terrainHeight(x + 2 * G, z) - this.terrainHeight(x - 2 * G, z)) +
      Math.abs(this.terrainHeight(x, z + 2 * G) - this.terrainHeight(x, z - 2 * G));
    return s < 1.6 * G;
  }
  buildProps() {
    const T = this.theme;
    if (T.grid) {
      // 模擬訓練場的方塊（虛擬空間，本來就是機甲的尺寸：跟著放大 G 倍；數量依面積多一些）
      const pm = mat(0xc9cdd5, { roughness: 0.9, metalness: 0.05 });
      for (let k = 0, n = this.cnt(34, 50); k < n; k++) {
        let x = rnd(-55 * this.k, 55 * this.k),
          z = rnd(-55 * this.k, 55 * this.k);
        if (
          Math.hypot(x, z) < 10 * G ||
          this.onCorridor(x, z, 3) ||
          this.obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < 9 * G)
        )
          continue;
        const w = rnd(3, 7) * G,
          d = rnd(3, 7) * G,
          h = (RNG() < 0.3 ? rnd(2.5, 4) : rnd(9, 18)) * G;
        const { mesh: g, mat: m2 } = buildGridPillar(w, h, d, pm);
        g.position.set(x, h / 2, z);
        this.scene.add(g);
        this.meshes.push(g);
        const ob = {
          kind: 'box',
          x,
          z,
          w,
          d,
          top: h,
          y: 0,
          group: g,
          mats: propMats(g) || [m2],
          box: new THREE.Box3(
            new THREE.Vector3(x - w / 2, 0, z - d / 2),
            new THREE.Vector3(x + w / 2, h, z + d / 2),
          ),
        };
        this.obstacles.push(ob);
        this.regProp('pillarBlock', ob, 4000, 0xc9cdd5);
        this.occluders.push(ob);
      }
      return;
    }
    // 新主題有自己的一套物件（不用舊主題的貨櫃、卡車、路燈、岩石、碎塊）
    if (T.buildProps) return T.buildProps(this);
    if (T.props) return this.buildThemeProps(T.props);
    this.buildYardProps();
  }
  // 貨運集散場與礦坑遺跡（現實尺寸，docs/world-scale.md）：貨櫃區（貨櫃堆排成格子、堆與堆之間 8–12 m 的通道，
  // 疊 1–5 層：疊 2＝半身掩體、疊 4 以上＝全身掩體）、倉庫（全身）、聯結車與護欄（雜物）、T 型牆（低掩體）、
  // 照明桿；hasRocks 的主題另有巨石（雜物）與岩塊（掩體）。貨櫃堆與倉庫各自一份材質（擋住鏡頭時各自淡出）
  buildYardProps() {
    const T = this.theme,
      ind = this.themeKey === 'industrial';
    const COLS = [T.container, T.container2, 0x8b8f94, 0x8a3a2a, 0x2b4fb0, 0x6b7d6a];
    const own = (c, o) => {
      const m = mat(c, o).clone();
      m.transparent = true;
      return m;
    };
    // 貨櫃區
    for (let b = this.cnt(ind ? 5 : 2, ind ? 7 : 3); b > 0; b--) {
      const nx = rndi(2, 4),
        nz = rndi(1, 3),
        rows = rndi(2, 4),
        lane = rnd(8, 12);
      const L = ISO.L40,
        D = rows * ISO.W + (rows - 1) * 0.3;
      const bw = nx * L + (nx - 1) * lane,
        bd = nz * D + (nz - 1) * lane;
      const spot = this.findSpot([-bw / 2, bw / 2, -bd / 2, bd / 2], 2.5, 40);
      if (!spot) continue;
      const base = spot.lo - 0.1;
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < nz; j++) {
          const skip = RNG() < 0.12, // 空位（通道變寬）
            lv = rndi(1, ind ? 5 : 3);
          const tops = [];
          for (let r = 0; r < rows; r++) tops.push(clamp(lv + rndi(-1, 1), 1, 5));
          const cms = [];
          for (let n = 0; n < 3; n++) cms.push(own(pick(COLS), { roughness: 0.6 })); // 每堆 3 種顏色（合併成少數網格）
          if (skip) continue;
          const lx = -bw / 2 + L / 2 + i * (L + lane),
            lz = -bd / 2 + D / 2 + j * (D + lane);
          const [px, pz] = rotQ(spot.q, lx, lz);
          const st = buildContainerStack(L, rows, 5, cms, own(0x2a2d31, { roughness: 0.7 }), tops);
          st.group.position.y = base;
          const sp = { x: spot.x + px, z: spot.z + pz, q: spot.q, rotY: spot.rotY };
          const low = Math.max(...tops) <= 2 && tops.every((t) => t === tops[0]);
          const shapes = low
            ? [{ box: [-L / 2, L / 2, -D / 2, D / 2], y: base, top: base + st.h }]
            : tops.map((t, r) => {
                const z0 = -D / 2 + r * (ISO.W + 0.3);
                return { box: [-L / 2, L / 2, z0, z0 + ISO.W], y: base, top: base + t * ISO.H };
              });
          const obs = this.addBig(st.group, sp, shapes);
          // 疊 2 層以下的貨櫃堆打得壞（整堆一起）；更高的不會壞
          if (low) this.regProp('container', obs[0], 2600 * tops[0] * rows, cms[0].color.getHex());
        }
    }
    // 倉庫
    for (let k = this.cnt(ind ? 2 : 1, ind ? 4 : 2); k > 0; k--) {
      const w = rnd(30, 50),
        d = rnd(20, 30),
        h = rnd(10, 13);
      const spot = this.findSpot([-w / 2 - 1, w / 2 + 1, -d / 2 - 6, d / 2 + 6], 2, 40);
      if (!spot) continue;
      const y = spot.lo - 0.2;
      const g = buildWarehouse(w, d, h, pick([0x8a9096, 0x9a8a72, 0x6a7a8a, 0x8a6a5a]));
      g.position.y = y;
      this.addBig(g, spot, [{ box: [-w / 2, w / 2, -d / 2, d / 2], y, top: y + warehouseRidge(d, h) }]);
    }
    // 聯結車（雜物，打得壞）
    this.scatter(this.cnt(ind ? 5 : 2, ind ? 8 : 4), 6, (x, z, y) => {
      const rot = RNG() < 0.5;
      const cm = own(pick(COLS), { roughness: 0.6 });
      const g = buildSemiTruck(cm);
      if (rot) g.rotation.y = Math.PI / 2;
      const sh = rot ? { w: SEMI[2], h: SEMI[1], d: SEMI[0] } : { w: SEMI[0], h: SEMI[1], d: SEMI[2] };
      this.addSmall(g, x, y - 0.05, z, sh, 'truck', 1600, cm.color.getHex());
    });
    // T 型牆（低掩體，成排）
    this.scatter(this.cnt(ind ? 4 : 3, ind ? 7 : 5), 8, (x, z, y) => {
      const n = rndi(4, 10),
        rot = RNG() < 0.5,
        len = n * TWALL.w;
      const g = buildTWall(n);
      if (rot) g.rotation.y = Math.PI / 2;
      const sh = rot ? { w: TWALL.d, h: TWALL.h, d: len } : { w: len, h: TWALL.h, d: TWALL.d };
      this.addSmall(g, x, y - 0.05, z, sh, 'twall', 600 * n, 0x8c8a84);
    });
    // 紐澤西護欄（雜物，機甲跨得過去）
    this.scatter(this.cnt(5, 9), 5, (x, z, y) => {
      const n = rndi(2, 6),
        rot = RNG() < 0.5,
        len = n * JERSEY.l;
      const g = buildJersey(n);
      if (rot) g.rotation.y = Math.PI / 2;
      const sh = rot ? { w: JERSEY.d, h: JERSEY.h, d: len } : { w: len, h: JERSEY.h, d: JERSEY.d };
      this.addSmall(g, x, y - 0.02, z, sh, 'barrier', 300 * n, 0xc8c4bc);
    });
    // 照明桿（高 10–14 m；細柱不擋子彈的視線判定）
    const pm = mat(0x33373c);
    for (let k = 0, n = this.cnt(10, 16); k < n; k++) {
      const x = rnd(-55 * this.k, 55 * this.k),
        z = rnd(-55 * this.k, 55 * this.k);
      if (Math.hypot(x, z) < 8 * MS || this.onCorridor(x, z, 2) || !this.slopeOK(x, z)) continue;
      const h = rnd(10, 14);
      const m = buildLampPost(h, pm);
      m.position.set(x, this.terrainHeight(x, z) + h / 2 - 0.3, z);
      this.scene.add(m);
      this.meshes.push(m);
      const ob = { kind: 'circle', x, z, r: 0.4, group: m, mats: [], box: null, h };
      this.obstacles.push(ob);
      this.regProp('pillar', ob, 800, 0x33373c);
    }
    // 岩石：巨石（1–3 m，雜物）與岩塊（6–14 m，掩體）
    if (T.hasRocks) {
      const rm = mat(T.rock, { roughness: 1 });
      const rock = (x, z, r, big) => {
        const m = buildRock(r, rm.clone());
        const rmats = propMats(m) || [m.material];
        for (const mm of rmats) mm.transparent = true;
        m.scale.set(rnd(0.8, 1.5), rnd(0.5, 1.0), rnd(0.8, 1.5));
        m.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
        m.position.set(x, this.terrainHeight(x, z) + r * 0.2, z);
        this.scene.add(m);
        this.meshes.push(m);
        const ob = {
          kind: 'circle',
          x,
          z,
          r: r * 1.05,
          group: m,
          mats: rmats,
          box: new THREE.Box3().setFromObject(m),
        };
        this.obstacles.push(ob);
        if (big) this.occluders.push(ob);
        this.regProp('rock', ob, big ? 9000 : 1500, T.rock);
      };
      for (let k = 0, n = this.cnt(8, 14); k < n; k++) {
        const x = rnd(-58 * this.k, 58 * this.k),
          z = rnd(-58 * this.k, 58 * this.k);
        if (Math.hypot(x, z) < 12 * MS || this.onCorridor(x, z, 6)) continue;
        rock(x, z, rnd(6, 14), true);
      }
      for (let k = 0, n = this.cnt(20, 30); k < n; k++) {
        const x = rnd(-58 * this.k, 58 * this.k),
          z = rnd(-58 * this.k, 58 * this.k);
        if (Math.hypot(x, z) < 6 * MS || this.onCorridor(x, z, 3)) continue;
        rock(x, z, rnd(1, 3), false);
      }
    }
    // 碎屑（純裝飾，合併）
    const dm = mat(0x55595e);
    for (let k = 0, n = Math.round(60 * this.kk); k < n; k++) {
      const x = rnd(-60 * this.k, 60 * this.k),
        z = rnd(-60 * this.k, 60 * this.k);
      const m = buildDebris(rnd(0.3, 1.2), rnd(0.2, 0.5), rnd(0.3, 1.2), dm);
      m.position.set(x, this.terrainHeight(x, z) + 0.1, z);
      m.rotation.y = rnd(0, 3);
      m.castShadow = false;
      this.addDecorMesh(m);
    }
  }

  // ---------- 主題機制：虛空、保留區、水面、岩頂、光照 ----------
  // 虛空（主題的 void：{ y：低於這個地形高度＝虛空, fall：機體低於這個高度時拉回, ref：虛空上方的參考地面 }）
  get voidY() {
    return this.theme.void ? this.theme.void.fall : undefined;
  }
  // 地形低於 void.y 且上方沒有橋面（平台）的地方；接住墜落的下層平台（ledge，themes/xylem.js 的 buildLedges）照樣算虛空
  isVoid(x, z) {
    if (!this.theme.void || this.terrainHeight(x, z) >= this.theme.void.y) return false;
    return !this.obstacles.some(
      (o) => o.deck && !o.ledge && Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2,
    );
  }
  // 站在下層平台上（虛空地圖）
  onLedge(x, z, y) {
    return this.obstacles.some(
      (o) =>
        o.ledge && Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2 && Math.abs(y - o.top) < 1.5,
    );
  }
  // 高度上限、飛行高度用的地面：虛空上方以 void.ref 為準
  groundRef(x, z, y) {
    const g = this.groundAt(x, z, y);
    return this.theme.void ? Math.max(g, this.theme.void.ref) : g;
  }
  // 最靠近中心、不是虛空也不在保留區的平地（出生點找不到時、墜落沒有紀錄時用）
  safePoint() {
    for (let r = 0; r < 60 * this.k; r += 3 * G)
      for (let a = 0; a < 12; a++) {
        const x = Math.cos(a * 0.5236) * r,
          z = Math.sin(a * 0.5236) * r;
        if (
          !this.isVoid(x, z) &&
          !this.isReserved(x, z, 2 * G) &&
          this.slopeOK(x, z) &&
          !this.offLimits(x, z)
        )
          return new THREE.Vector3(x, this.terrainHeight(x, z), z);
      }
    return new THREE.Vector3(0, this.terrainHeight(0, 0), 0);
  }
  // 從 (x, z) 往外找最近不是虛空的位置（不是虛空地圖時原樣回傳）
  // firm：周圍 2G 也都不是虛空（街區邊緣的斜坡上放不住機體：玩家墜落後放回去的位置）
  nearSolid(x, z, firm) {
    const ok = (px, pz) =>
      !this.isVoid(px, pz) &&
      (!firm ||
        [
          [2, 0],
          [-2, 0],
          [0, 2],
          [0, -2],
        ].every(([dx, dz]) => !this.isVoid(px + dx * G, pz + dz * G)));
    if (ok(x, z)) return [x, z];
    for (let r = 3 * G; r < 80 * this.k; r += 3 * G)
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos(a * 0.3927) * r,
          pz = z + Math.sin(a * 0.3927) * r;
        if (Math.abs(px) < this.lim - 2 * G && Math.abs(pz) < this.lim - 2 * G && ok(px, pz)) return [px, pz];
      }
    const p = this.safePoint();
    return [p.x, p.z];
  }
  // 保留區：大型結構（壩體…）佔的範圍 [x0, x1, z0, z1]，地形特徵與物件都避開
  reserve(x0, x1, z0, z1) {
    (this.reserved = this.reserved || []).push([x0, x1, z0, z1]);
  }
  isReserved(x, z, m = 0) {
    if (!this.reserved) return false;
    return this.reserved.some((r) => x > r[0] - m && x < r[1] + m && z > r[2] - m && z < r[3] + m);
  }
  // 水面（只有外觀）：{ level, color, opacity, rough, wide, cloud }。網格與著色器在 fx/water/surface.js，
  // 模擬、焦散、反射由遊戲的水面系統（fx/water/index.js）接上（docs/water-design.md）。
  // cloud（高空軌道的雲海）：只是一片雲底的平面，雲由粒子的煙霧畫（fx/cloudsea.js，this.cloud）
  addWater(W) {
    const ext = (FAR_R + 40) * 2; // 一律延伸到遠景地形外（wide 的海面、雲海也是）
    if (W.cloud) {
      const geo = new THREE.PlaneGeometry(ext, ext);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: W.color, fog: true }));
      m.material.color.multiplyScalar(0.7).lerp(new THREE.Color(0x7d8aa4), 0.25); // 雲底：比雲團暗一點
      m.position.y = W.level - 2 * G;
      m.renderOrder = 0;
      m.userData.noFade = true;
      m.userData.noAO = true;
      this.scene.add(m);
      this.meshes.push(m);
      this.waterMesh = m;
      this.cloud = { level: W.level, color: W.color };
      return;
    }
    const g = buildWaterMesh(W, ext, G);
    this.scene.add(g);
    this.meshes.push(g);
    this.waterMesh = g;
  }
  // 冰原的冰面（冰湖：地形在冰面高度 −0.7 附近）
  onIce(x, z) {
    return this.themeKey === 'snow' && Math.abs(this.terrainHeight(x, z) - ICE_Y) < 0.25 * G;
  }
  // 水深（主題的水面以下多深；沒有水面時 0）
  waterDepth(x, z) {
    const W = this.theme.water;
    return W ? W.level - this.terrainHeight(x, z) : 0;
  }
  // 岩頂（地下）：朝下的平面，只從下方看得到（俯視的鏡頭看得穿），不擋陰影
  addRoof(R) {
    const geo = new THREE.PlaneGeometry((FAR_R + 40) * 2, (FAR_R + 40) * 2, 48, 48);
    geo.rotateX(Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++)
      pos.setY(i, -this.noise((pos.getX(i) / G) * 0.02 + 9, (pos.getZ(i) / G) * 0.02) * (R.bump || 8 * G));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({ color: R.color, roughness: 1, flatShading: true }),
    );
    m.position.y = R.y;
    m.userData.noFade = true; // 岩頂：俯視鏡頭本來就看得穿
    // 岩頂開洞（game/destruct.js 的 roofDamage）：格子＝平面的一格
    this.roofMesh = m;
    this.roofY = R.y;
    this.roofLow = R.y - (R.bump || 8 * G);
    this.roofCell = ((FAR_R + 40) * 2) / 48;
    this.scene.add(m);
    this.meshes.push(m);
  }
  // 把主題的天空、霧、光源套到遊戲場景（任務、客機開局、實驗室共用）
  applyLight(g) {
    const T0 = this.theme;
    // 夜間的變體（nightV，docs/brightness-design.md）：保留色調，亮度照這個主題白天的（光的強度取較大的、天空／霧／
    // 地面反光色／陽光的顏色保留色相、明度不低於白天）
    const B = THEMES[this.themeKey] || T0;
    let T = T0.nightV
      ? {
          ...T0,
          sky: keepL(T0.sky, B.sky),
          fog: keepL(T0.fog, B.fog),
          amb: keepL(T0.amb, B.amb),
          sun: keepL(T0.sun, B.sun),
          sunI: Math.max(T0.sunI !== undefined ? T0.sunI : 1, B.sunI !== undefined ? B.sunI : 1),
          hemiI: Math.max(T0.hemiI !== undefined ? T0.hemiI : 1, B.hemiI !== undefined ? B.hemiI : 1),
          fogFar: Math.max(T0.fogFar || 0, (B.fogFar || 190) * DS), // T0 已經乘過 DS（scaleTheme），THEMES 的沒有
        }
      : T0;
    // 最低亮度（lightFloor，docs/brightness-design.md）：偏暗的主題與變體（地下的岩頂看不到天空、環境光的顏色＝天空色
    // 接近黑色）——天空／地面反光／霧／陽光的顏色保留色相、亮度不低於下限，陽光與環境光的強度不低於下限。
    // 變體繼承主題的下限（停電區、浸水區一起拉上來），變體也可以自己訂
    const F = T.lightFloor;
    if (F)
      T = {
        ...T,
        sky: F.sky !== undefined ? keepL(T.sky, F.sky) : T.sky,
        fog: F.fog !== undefined ? keepL(T.fog, F.fog) : T.fog,
        amb: F.amb !== undefined ? keepL(T.amb, F.amb) : T.amb,
        sun: F.sun !== undefined ? keepL(T.sun, F.sun) : T.sun,
        sunI: Math.max(T.sunI !== undefined ? T.sunI : 1, F.sunI || 0),
        hemiI: Math.max(T.hemiI !== undefined ? T.hemiI : 1, F.hemiI || 0),
      };
    g.scene.background = new THREE.Color(T.sky);
    g.scene.fog = new THREE.Fog(T.fog, T.fogNear || 60 * DS, T.fogFar || 190 * DS);
    g.sun.color.set(T.sun);
    g.sun.intensity = T.sunI !== undefined ? T.sunI : 1;
    g.hemi.color.set(T.sky);
    g.hemi.groundColor.set(T.amb);
    g.hemi.intensity = 0.48 * (T.hemiI !== undefined ? T.hemiI : 1);
    // 主線：時間與深度（有岩頂的地下不受時間影響）。黃昏與夜間（2026-11-12 改版 B2）：只換色調（天空、霧、光色往
    // 那個時間的顏色靠、明度不變），光的強度與霧的距離照白天；黎明照舊（稍暗一點）
    const TOD = {
      dusk: { sun: 0xffa060, sky: 0xc8805a, k: 0.45, sk: 0.6, keep: true, si: 1, hi: 1, ff: 1 },
      night: { sun: 0x9ab0ff, sky: 0x3050a0, k: 0.55, sk: 0.55, keep: true, si: 1, hi: 1, ff: 1 },
      dawn: { sun: 0xffc8a0, sky: 0xd8a8a0, k: 0.35, sk: 0.7, si: 0.75, hi: 0.85, ff: 0.95 },
    }[T.roof || T.noTod ? '' : this.tod]; // noTod：本身就是夜間的變體
    // 垂直下降的深度：每層暗 5%、最多 15%（以前 18%／60%，地下的主題太暗）
    const dk = clamp(this.depth * 0.05, 0, 0.15);
    if (TOD || dk) {
      const sky = new THREE.Color(T.sky),
        fog = new THREE.Color(T.fog);
      let si = g.sun.intensity,
        hi = g.hemi.intensity,
        ff = T.fogFar || 190 * DS;
      if (TOD) {
        const sky0 = sky.clone(),
          fog0 = fog.clone(),
          sun0 = g.sun.color.clone();
        sky.lerp(new THREE.Color(TOD.sky), TOD.k);
        fog.lerp(new THREE.Color(TOD.sky), TOD.k * 0.85);
        g.sun.color.lerp(new THREE.Color(TOD.sun), TOD.sk);
        if (TOD.keep) {
          keepLC(sky, sky0);
          keepLC(fog, fog0);
          keepLC(g.sun.color, sun0);
        }
        si *= TOD.si;
        hi *= TOD.hi;
        ff *= TOD.ff;
      }
      if (dk) {
        sky.lerp(new THREE.Color(0x000000), dk);
        fog.lerp(new THREE.Color(0x000000), dk * 0.8);
        si *= 1 - dk;
        hi *= 1 - dk * 0.6;
        ff *= 1 - dk * 0.5;
      }
      g.scene.background = sky;
      g.scene.fog = new THREE.Fog(fog, Math.min(T.fogNear || 60 * DS, ff * 0.4), ff);
      g.sun.intensity = si;
      g.hemi.color.copy(rawColor(sky)); // 光色照舊不轉換（色彩管理時換回原本的值，render/color-cm.js）
      g.hemi.intensity = hi;
    }
  }
  // 多人開局訊息：客機以同樣的參數生成（主線的變體、地標、時間…）與地形特徵
  netOpt() {
    const o = this.opt || {};
    const out = {};
    for (const k of [
      'rail',
      'road',
      'variant',
      'landmark',
      'tod',
      'weather',
      'depth',
      'zone',
      'zoneAxis',
      'entry',
      'open',
      'big',
      'edge',
    ])
      if (o[k] !== undefined && o[k] !== null && o[k] !== '') out[k] = o[k];
    return out;
  }
  netFeat() {
    return this.features.map((f) => ({
      k: f.k,
      kind: f.kind,
      dir: f.dir ? [f.dir.x, f.dir.y] : 0,
      perp: f.perp ? [f.perp.x, f.perp.y] : 0,
      off: f.off,
      width: f.width,
      depth: f.depth,
      bridges: f.bridges,
      deckW: f.deckW,
      center: f.center,
      span: f.span,
      rampL: f.rampL,
      deckH: f.deckH,
      count: f.count,
      len: f.len,
      bend: f.bend,
    }));
  }
  // ---------- 作戰區域（主線可以是狹長、小型或分段開放的矩形；一般任務是 ±lim） ----------
  setZone(shape = 'full', axis = 0) {
    const L = this.lim;
    let z = [-L, L, -L, L];
    if (shape && typeof shape === 'object') {
      // 自訂關卡畫的矩形（限制在場地內）
      z = [
        clamp(shape.x0, -L, L - 20 * G),
        clamp(shape.x1, -L + 20 * G, L),
        clamp(shape.z0, -L, L - 20 * G),
        clamp(shape.z1, -L + 20 * G, L),
      ];
      shape = 'rect';
    } else if (shape === 'long') {
      const n = L * 0.42;
      z = axis ? [-L, L, -n, n] : [-n, n, -L, L];
    } else if (shape === 'arena') {
      const n = L * 0.55;
      z = [-n, n, -n, n];
    } else if (shape === 'staged') {
      // 先開出生點這一半，之後 expandZone 擴大到全區
      z = axis ? [-L, L, -L, L * 0.2] : [-L, L * 0.2, -L, L];
    }
    this.zoneShape = shape || 'full';
    this.zone = z;
    this.zoneGoal = null;
    this.zoneBase = null; // Boss 改版的作戰區域縮小前的範圍（game/boss-tier.js 的 tierShrinkZone）
  }
  expandZone() {
    const L = this.lim;
    this.zoneGoal = [-L, L, -L, L];
  }
  // 分段開放：作戰區域慢慢擴大（每秒 90 m）
  tickZone(dt) {
    if (!this.zoneGoal) return;
    let done = true;
    for (let i = 0; i < 4; i++) {
      const d = this.zoneGoal[i] - this.zone[i];
      if (Math.abs(d) > 0.01) {
        done = false;
        this.zone[i] += Math.sign(d) * Math.min(Math.abs(d), 30 * DS * dt);
      }
    }
    if (done) this.zoneGoal = null;
  }
  inZone(x, z, m = 0) {
    const Z = this.zone;
    return x > Z[0] + m && x < Z[1] - m && z > Z[2] + m && z < Z[3] - m;
  }
  // 超出作戰區域的距離（場內為 0）
  zoneExcess(x, z) {
    const Z = this.zone;
    return Math.max(0, Z[0] - x, x - Z[1], Z[2] - z, z - Z[3]);
  }
  // 自訂關卡：產生器放的物件（buildProps 之後的障礙物，依群組）＝可以在編輯器裡移除的項目；
  // props 'big' 時拿掉小型的，removed 的位置（[x, z]，比對群組位置 1.5 m 內）拿掉
  levelGenItems(ob0, me0) {
    const byG = new Map();
    for (const ob of this.obstacles.slice(ob0)) {
      if (!ob.group) continue;
      if (!byG.has(ob.group)) byG.set(ob.group, []);
      byG.get(ob.group).push(ob);
    }
    this.genItems = [];
    for (const [g, obs] of byG) {
      const b = new THREE.Box3().setFromObject(g);
      const sz = b.getSize(new THREE.Vector3());
      const c = b.getCenter(new THREE.Vector3());
      this.genItems.push({
        g,
        obs,
        x: g.position.x,
        z: g.position.z,
        c,
        small: Math.max(sz.x, sz.z) < 7 && sz.y < 7,
      });
    }
    // 沒有障礙物的裝飾也列進來（純外觀，不碰撞）
    for (const m of this.meshes.slice(me0))
      if (!byG.has(m) && !m.userData.noFade && m !== this.terrainMesh && m.position)
        this.genItems.push({ g: m, obs: [], x: m.position.x, z: m.position.z, small: true, decor: true });
    const L = this.lvl;
    for (const it of this.genItems.slice()) {
      if (
        (L.props === 'big' && it.small) ||
        (L.removed || []).some((r) => Math.hypot(r[0] - it.x, r[1] - it.z) < 1.5)
      )
        this.removeGenItem(it);
    }
  }
  // Boss 關：buildProps 放的物件（依群組）只留約 keep 的比例當掩體，地圖中央一圈全部拿掉；
  // 以群組位置的雜湊決定（不呼叫亂數，房主與客機一樣），地形特徵與大型結構不動
  openArena(ob0, open) {
    const keep = typeof open === 'number' && open < 1 ? open : OPEN_KEEP;
    const byG = new Map();
    for (const ob of this.obstacles.slice(ob0)) {
      if (!ob.group) continue;
      if (!byG.has(ob.group)) byG.set(ob.group, []);
      byG.get(ob.group).push(ob);
    }
    const mid = this.lim * OPEN_MID;
    let n = 0;
    for (const [g, obs] of byG) {
      const x = g.position.x,
        z = g.position.z;
      const h = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      if (Math.hypot(x, z) > mid && h < keep) continue;
      this.removeGenItem({ g, obs });
      n++;
    }
    this.openRemoved = n;
  }
  removeGenItem(it) {
    it.g.visible = false;
    it.removed = true;
    for (const ob of it.obs) {
      const i = this.obstacles.indexOf(ob);
      if (i >= 0) this.obstacles.splice(i, 1);
      const j = this.occluders.indexOf(ob);
      if (j >= 0) this.occluders.splice(j, 1);
      if (ob.prop) ob.prop.dead = true;
    }
  }
  restoreGenItem(it) {
    it.g.visible = true;
    it.removed = false;
    for (const ob of it.obs) {
      if (!this.obstacles.includes(ob)) this.obstacles.push(ob);
      if (ob.mats && ob.mats.length && !this.occluders.includes(ob)) this.occluders.push(ob);
      if (ob.prop) ob.prop.dead = false;
    }
  }
  // 變體不能放東西的地方（坑道網的岩壁…）
  offLimits(x, z) {
    // 主題自己的（火山熔爐帶的熔岩）＋變體的
    if (this.theme.offLimits && this.theme.offLimits(this, x, z)) return true;
    return !!(this.variant && this.variant.offLimits && this.variant.offLimits(this, x, z));
  }
  // 地標（world/landmarks.js）：找一塊夠平的地方放大型物件。地標是機甲尺度的大型場景物件，
  // 三倍高改版以舊尺度的造型整體放大 G 倍（外框、碰撞形狀、埋深一起放大）
  addLandmark(key) {
    const L0 = (LANDMARKS[this.themeKey] || {})[key];
    if (!L0) return null;
    const G = this.theme.void ? 2 : WS; // 虛空地圖（洋上都市、高空軌道）的平台有限，地標放大 2 倍
    const L = {
      ...L0,
      bx: L0.bx.map((v) => v * G),
      range: L0.range * G,
      sink: (L0.sink || 0) * G,
      shapes: L0.shapes.map((sh) =>
        sh.box
          ? { ...sh, box: sh.box.map((v) => v * G), y: sh.y * G, top: sh.top * G }
          : { ...sh, c: sh.c.map((v) => v * G), r: sh.r * G, h: sh.h * G },
      ),
      build: () => {
        const o = new THREE.Group();
        const g = L0.build();
        g.scale.multiplyScalar(G);
        o.add(g);
        return o;
      },
    };
    // 只避開大型障礙物（找不到時放寬地面高低差，大型地標可以部分埋進地面）；佔到位置的小物件移除
    // 平台很密的地圖（Lattice-9）找不到時，佔到位置的平台也移除
    let big = (o) => (o.kind === 'box' ? o.deck || o.w * o.d > 60 * G : o.r > 3 * G);
    const all = this.obstacles;
    let spot = null;
    // 再找不到（洋上都市的街區被高樓佔滿）時，佔到位置的大型物件也移除
    for (const level of [0, 1, 2]) {
      if (spot) break;
      if (level === 1) big = (o) => (o.kind === 'box' ? !o.deck && o.w * o.d > 60 * G : o.r > 3 * G);
      if (level === 2) big = () => false;
      this.obstacles = all.filter(big);
      for (const k of [1, 1.8, 3]) if (!spot) spot = this.findSpot(L.bx, L.range * k, 90);
    }
    this.obstacles = all;
    if (!spot) return null;
    const [x0, x1, z0, z1] = spot.aabb;
    const hit = (o) =>
      o.kind === 'box'
        ? o.x + o.w / 2 > x0 - 1 && o.x - o.w / 2 < x1 + 1 && o.z + o.d / 2 > z0 - 1 && o.z - o.d / 2 < z1 + 1
        : o.x + o.r > x0 - 1 && o.x - o.r < x1 + 1 && o.z + o.r > z0 - 1 && o.z - o.r < z1 + 1;
    const gone = new Set(all.filter((o) => !big(o) && hit(o)));
    for (const o of gone) if (o.group) this.scene.remove(o.group);
    this.obstacles = all.filter((o) => !gone.has(o));
    this.occluders = this.occluders.filter((o) => !gone.has(o));
    for (const p of this.props || []) if (gone.has(p.ob)) p.dead = true;
    const g = L.build();
    const y = spot.lo - (L.sink || 0);
    g.position.y = y;
    g.userData.cat = 'lm'; // 地圖預覽器的場景分類（game/map-view-perf.js）
    for (const o of this.addBig(
      g,
      spot,
      L.shapes.map((sh) => (sh.box ? { ...sh, y: y + sh.y, top: y + sh.top } : { ...sh })),
    ))
      o.struct = 'lm';
    this.landmark = { key, name: L.name, x: spot.x, z: spot.z };
    // 地標的特效點（建造函式的 userData.fxSpots：[{ k 特效預設, p [x, y, z] 地標座標, rate 每秒幾次 }]）→ 世界座標，
    // 地圖的持續特效（game/fx-ambient.js）照它產生；只有外觀，不影響亂數
    const inner = g.children[0];
    if (inner && inner.userData.fxSpots) {
      g.updateMatrixWorld(true);
      this.landmark.fx = inner.userData.fxSpots.map((f) => ({
        k: f.k,
        rate: f.rate,
        p: inner.localToWorld(new THREE.Vector3(...f.p)),
      }));
    }
    return this.landmark;
  }
  // 主線的入口結構（出生點）：lift 升降梯平台、lz 降落區標示；不碰撞
  addEntry(kind) {
    const g = kind === 'lift' ? buildLiftPad() : kind === 'lz' ? buildLandingZone() : null;
    if (!g) return;
    const s = this.start || { x: 0, z: 0 };
    g.position.set(s.x, this.terrainHeight(s.x, s.z), s.z);
    this.scene.add(g);
    this.meshes.push(g);
  }
  // 邊緣進場的起點（docs/map-pacing-design.md）：作戰區域一側的空地，往前＝(fx, fz) 朝向另一側。
  // 狹長地帶從長軸的一端、分段開放從先開的那一半的外側、全區隨機一側。以種子決定（自己的亂數串），各端一樣
  planStart() {
    const r = makeRng(this.seed * 71 + 5);
    const Z = this.zone,
      sh = this.zoneShape,
      ax0 = this.opt.zoneAxis;
    let ax, sg;
    if (sh === 'long') {
      ax = ax0 ? 0 : 1;
      sg = r() < 0.5 ? 1 : -1;
    } else if (sh === 'staged') {
      ax = ax0 ? 1 : 0;
      sg = 1;
    } else {
      ax = r() < 0.5 ? 0 : 1;
      sg = r() < 0.5 ? 1 : -1;
    }
    const lo = ax ? Z[2] : Z[0],
      hi = ax ? Z[3] : Z[1],
      plo = ax ? Z[0] : Z[2],
      phi = ax ? Z[1] : Z[3];
    const span = hi - lo,
      pc = (plo + phi) / 2,
      ph = (phi - plo) / 2;
    // 前 80 次要求周圍 8 台身寬沒有障礙物，之後放寬到 3（洋上都市這類密集的街區）
    const ok = (x, z, mg) =>
      this.inZone(x, z, 8 * MS) &&
      !this.isVoid(x, z) &&
      this.slopeOK(x, z) &&
      !this.isReserved(x, z, 3 * MS) &&
      !this.offLimits(x, z) &&
      !this.onCorridor(x, z, 4 * MS) &&
      !this.obstacles.some((o) =>
        o.kind === 'box'
          ? Math.abs(x - o.x) < o.w / 2 + mg && Math.abs(z - o.z) < o.d / 2 + mg
          : Math.hypot(x - o.x, z - o.z) < o.r + mg,
      );
    const lat0 = pc + (r() - 0.5) * ph * 0.5;
    for (let t = 0; t < 320; t++) {
      // 從外側往內、從中線往兩旁慢慢放寬
      const d = (0.1 + Math.min(0.4, t * 0.003) * r()) * span;
      const a = sg > 0 ? lo + d : hi - d;
      const b = clamp(lat0 + (r() - 0.5) * ph * Math.min(1.6, 0.3 + t * 0.02), plo + 10 * MS, phi - 10 * MS);
      const x = ax ? b : a,
        z = ax ? a : b;
      if (ok(x, z, (t < 80 ? 8 : 3) * MS)) return { x, z, fx: ax ? 0 : sg, fz: ax ? sg : 0 };
    }
    const p = this.safePoint();
    return { x: p.x, z: p.z, fx: ax ? 0 : sg, fz: ax ? sg : 0 };
  }

  // ---------- 新主題的物件 ----------
  // 數量依場地面積放大（舊尺度的 k²：三倍高改版的場地放大不增加數量，物件的密度由各主題另外決定）
  cnt(a, b) {
    return Math.round(rndi(a, b) * this.kk);
  }
  // 數量的面積倍率（舊尺度的 k²）
  get kk() {
    const k = this.k / G;
    return k * k;
  }
  // 散布：找 n 個位置（避開出生點、公路／鐵路、其他障礙物間距 gap；slope 時避開斜坡），各呼叫 place(x, z, y)
  scatter(n, gap, place, slope = true) {
    for (let k = 0; k < n; k++) {
      let x,
        z,
        tries = 0;
      do {
        x = rnd(-52 * this.k, 52 * this.k);
        z = rnd(-52 * this.k, 52 * this.k);
        tries++;
      } while (
        tries < 20 &&
        (Math.hypot(x, z) < 10 * MS ||
          this.onCorridor(x, z, 4) ||
          this.offLimits(x, z) ||
          this.isVoid(x, z) ||
          this.isReserved(x, z, 3) ||
          (slope && !this.slopeOK(x, z)) ||
          this.obstacles.some((o) =>
            o.kind === 'box'
              ? Math.abs(x - o.x) < o.w / 2 + gap / 2 && Math.abs(z - o.z) < o.d / 2 + gap / 2
              : Math.hypot(o.x - x, o.z - z) < gap + (o.r > 3 ? o.r : 0),
          ))
      );
      if (tries >= 20) continue;
      place(x, z, this.terrainHeight(x, z));
    }
  }
  // 放一個小型物件並登記成障礙物：shape 為 { w, h, d }（方盒，底面在 y）或 { r, h }（圓柱）；
  // kind 有值時可破壞（regProp）
  addSmall(g, x, y, z, shape, kind, hp, color) {
    g.position.set(x, y, z);
    y = this.settleDown(g, x, y, z, shape.h);
    this.scene.add(g);
    this.meshes.push(g);
    const mats = propMats(g) || fadeMatsOf(g);
    const ob = shape.r
      ? {
          kind: 'circle',
          x,
          z,
          r: shape.r,
          group: g,
          mats,
          box: new THREE.Box3().setFromObject(g),
          h: shape.h,
        }
      : {
          kind: 'box',
          x,
          z,
          w: shape.w,
          d: shape.d,
          top: y + shape.h,
          y,
          group: g,
          mats,
          box: new THREE.Box3(
            new THREE.Vector3(x - shape.w / 2, y, z - shape.d / 2),
            new THREE.Vector3(x + shape.w / 2, y + shape.h, z + shape.d / 2),
          ),
        };
    this.obstacles.push(ob);
    if (mats.length) this.occluders.push(ob);
    if (kind) this.regProp(kind, ob, hp, color);
    return ob;
  }
  // 純裝飾（不碰撞）：n 個 make() 的網格，避開虛空；sink：往下埋的深度
  addDecor(n, make, sink = 0) {
    for (let k = 0; k < n; k++) {
      const x = rnd(-60 * this.k, 60 * this.k),
        z = rnd(-60 * this.k, 60 * this.k);
      const m = make();
      if (this.isVoid(x, z)) continue;
      m.position.set(x, this.terrainHeight(x, z) - sink, z);
      m.rotation.y = rnd(0, 6.28);
      this.addDecorMesh(m);
    }
  }
  // 純裝飾加進場景：一般地圖放進裝飾群組（之後合併），自訂關卡照舊各自一個（編輯器可以移除）
  addDecorMesh(m) {
    if (this.lvl) {
      this.scene.add(m);
      this.meshes.push(m);
      return;
    }
    // box()／cyl() 的 BoxGeometry／CylinderGeometry 帶材質分組（單一材質用不到），mergeStatic 不合併有分組的幾何：
    // 這些幾何每次都是新建的，清掉分組
    m.traverse((o) => {
      if (o.isMesh && !Array.isArray(o.material) && o.geometry && o.geometry.groups.length)
        o.geometry.clearGroups();
    });
    // 貼地的裝飾（鐵軌、地上的廢鐵、標線…，高不到 0.6 m）不投影：俯視看不到這麼矮的影子，
    // 每格的陰影卻要畫一次（貨運調度場的側線整張圖 250 萬個三角形；2026-11-13）
    m.updateMatrixWorld(true);
    const hb = _decorBox.setFromObject(m);
    // 貼地的長條（鐵軌、管線…）順著坡度傾斜：以前放在中心的地面高度，地面起伏時一端懸空（貨運調度場的側線最多 5.8 m；2026-11-13）
    if (
      !hb.isEmpty() &&
      hb.max.y - hb.min.y < 0.8 &&
      Math.max(hb.max.x - hb.min.x, hb.max.z - hb.min.z) > 3
    ) {
      const c = hb.getCenter(new THREE.Vector3());
      const tc = this.terrainHeight(c.x, c.z);
      if (Math.abs(hb.min.y - tc) < 0.8) {
        const ax = (hb.max.x - hb.min.x) * 0.45,
          az = (hb.max.z - hb.min.z) * 0.45;
        const sx =
            ax > 0.5 ? (this.terrainHeight(c.x + ax, c.z) - this.terrainHeight(c.x - ax, c.z)) / (2 * ax) : 0,
          sz =
            az > 0.5 ? (this.terrainHeight(c.x, c.z + az) - this.terrainHeight(c.x, c.z - az)) / (2 * az) : 0;
        // 先轉成世界的傾斜再乘上原本的朝向（只繞 Y 轉的長條）
        const q = new THREE.Quaternion().setFromEuler(
          new THREE.Euler(-Math.atan(clamp(sz, -0.6, 0.6)), 0, Math.atan(clamp(sx, -0.6, 0.6))),
        );
        m.quaternion.premultiply(q);
        m.updateMatrixWorld(true);
        _decorBox.setFromObject(m);
      }
    }
    if (!hb.isEmpty() && hb.max.y - hb.min.y < 0.6)
      m.traverse((o) => {
        if (o.isMesh) o.castShadow = false;
      });
    this.decorG.add(m);
  }
  // 純裝飾的廢鐵（不碰撞）
  addScrap(n, color) {
    for (let k = 0; k < n; k++) {
      const x = rnd(-60 * this.k, 60 * this.k),
        z = rnd(-60 * this.k, 60 * this.k);
      const m = buildScrap(rnd(0.8, 2), rnd(0.4, 1), rnd(0.6, 1.6), color);
      m.position.set(x, this.terrainHeight(x, z), z);
      m.rotation.y = rnd(0, 6.28);
      this.addDecorMesh(m);
    }
  }
  buildThemeProps(kind) {
    const T = this.theme;
    if (kind === 'wasteland') {
      this.buildMachinery();
      // 現實尺寸：料斗 12 × 15 m（全身）、儲槽直徑 10–24 m（全身）、岩柱 15–35 m、照明塔 20–35 m
      this.scatter(this.cnt(7, 11), 16, (x, z, y) => {
        const color = pick([0xb08a3e, 0x8c8f86, 0xa0522d]);
        const g = buildOreHopper(color);
        if (RNG() < 0.5) g.rotation.y = Math.PI / 2;
        this.addSmall(g, x, y - 0.4, z, { w: HOPPER[0], h: HOPPER[1], d: HOPPER[2] }, 'hopper', 7000, color);
      });
      this.scatter(this.cnt(4, 7), 18, (x, z, y) => {
        const r = rnd(5, 12),
          h = rnd(10, 18),
          color = pick([0x8a5a3a, 0x9a8f7a, 0x6f7a80]);
        this.addSmall(buildStorageTank(r, h, color), x, y - 0.3, z, { r: r * 1.02, h }, 'tank', 9000, color);
      });
      this.scatter(
        this.cnt(10, 16),
        14,
        (x, z, y) => {
          const r = rnd(4, 9),
            h = rnd(15, 35);
          const g = buildRockSpire(r, h, T.rock);
          g.rotation.y = rnd(0, 6.28);
          this.addSmall(g, x, y - 1.5, z, { r, h }, 'spire', 12000, T.rock);
        },
        false,
      );
      this.scatter(this.cnt(5, 8), 10, (x, z, y) => {
        const h = rnd(20, 35);
        const g = buildFloodlight(h, 0x4a4540);
        g.rotation.y = rnd(0, 6.28);
        this.addSmall(g, x, y - 0.3, z, { r: floodW(h), h }, 'floodlight', 1500, 0x4a4540);
      });
      this.addScrap(Math.round(60 * this.kk), 0x5a4a3e);
    } else if (kind === 'dunes') {
      this.buildWrecks();
      // 現實尺寸：MT 殘骸（MT 放大 3 倍）約 12 m、風蝕砂岩 15–25 m、防風牆高 3 m（低掩體）長 20–40 m
      this.scatter(this.cnt(6, 9), 16, (x, z, y) => {
        const color = pick([0x6a6f66, 0x7d7466, 0x5c6470]);
        const g = buildMtWreck(color);
        g.rotation.y = rnd(0, 6.28);
        const s = Math.max(MT_WRECK[0], MT_WRECK[2]);
        this.addSmall(g, x, y - 1.8, z, { w: s, h: MT_WRECK[1], d: s }, 'mtwreck', 6000, color);
      });
      this.scatter(
        this.cnt(8, 13),
        16,
        (x, z, y) => {
          const r = rnd(6, 10),
            h = rnd(15, 25);
          const g = buildSandstone(r, h, T.rock);
          g.rotation.y = rnd(0, 6.28);
          this.addSmall(g, x, y - 1.2, z, { r: r * 0.6, h }, 'sandstone', 12000, T.rock);
        },
        false,
      );
      this.scatter(
        this.cnt(6, 10),
        12,
        (x, z) => {
          const len = rnd(20, 40),
            rot = RNG() < 0.5,
            color = 0x9a8a72;
          const ex = rot ? 0 : len / 2,
            ez = rot ? len / 2 : 0;
          const y = Math.min(
            this.terrainHeight(x - ex, z - ez),
            this.terrainHeight(x + ex, z + ez),
            this.terrainHeight(x, z),
          );
          const g = buildSandFence(len, color);
          if (rot) g.rotation.y = Math.PI / 2;
          const shape = { w: rot ? 0.5 : len, h: SAND_FENCE_H, d: rot ? len : 0.5 };
          this.addSmall(g, x, y - 0.3, z, shape, 'fence', 1500, color);
        },
        false,
      );
      this.addScrap(Math.round(50 * this.kk), 0x8a7458);
    } else if (kind === 'snow') {
      this.buildIceField();
      // 現實尺寸：拱屋 12 × 18 m（半身）、冰塊 2–5 m 與冰丘 7–12 m、雷達天線約 17 m、信號燈桿 10–15 m
      this.scatter(this.cnt(7, 11), 16, (x, z, y) => {
        const color = pick([0x8a949e, 0x6b7d6a, 0xb8763a]);
        const g = buildQuonset(color);
        const rot = RNG() < 0.5;
        if (rot) g.rotation.y = Math.PI / 2;
        const [qw, qh, qd] = QUONSET;
        this.addSmall(
          g,
          x,
          y - 0.4,
          z,
          { w: rot ? qd : qw, h: qh, d: rot ? qw : qd },
          'quonset',
          6000,
          color,
        );
      });
      this.scatter(
        this.cnt(14, 22),
        10,
        (x, z, y) => {
          const big = RNG() < 0.35,
            r = big ? rnd(7, 12) : rnd(2, 5);
          const g = buildIceChunk(r);
          g.rotation.y = rnd(0, 6.28);
          this.addSmall(
            g,
            x,
            y - r * 0.15,
            z,
            { r: r * 0.95, h: r * 1.4 },
            'ice',
            big ? 10000 : 3000,
            0xbfe0f0,
          );
        },
        false,
      );
      this.scatter(this.cnt(3, 5), 18, (x, z, y) => {
        const color = 0xd8dde2;
        const g = buildRadarDish(color);
        g.rotation.y = rnd(0, 6.28);
        this.addSmall(g, x, y - 0.3, z, { r: 1.6 * RADAR_S, h: 7 * RADAR_S }, 'radar', 5000, color);
      });
      this.scatter(this.cnt(6, 10), 8, (x, z, y) => {
        const h = rnd(10, 15);
        this.addSmall(buildBeacon(h), x, y - 0.2, z, { r: 0.6, h }, 'beacon', 1000, 0xc8322a);
      });
      for (let k = 0, n = Math.round(30 * this.kk); k < n; k++) {
        const x = rnd(-60 * this.k, 60 * this.k),
          z = rnd(-60 * this.k, 60 * this.k);
        const m = buildIceShard(rnd(0.6, 1.6), rnd(0.2, 0.5), rnd(0.5, 1.3));
        m.position.set(x, this.terrainHeight(x, z), z);
        m.rotation.y = rnd(0, 6.28);
        this.scene.add(m);
        this.meshes.push(m);
      }
    }
  }
  // 冰原：舊時代觀測圓頂（大型，不可破壞）
  buildIceField() {
    for (let k = this.cnt(1, 2); k > 0; k--) {
      const R = DOME_R + 1.2;
      const spot = this.findSpot([-R, R, -R, R + 3], 3 * G, 40);
      if (!spot) continue;
      const g = buildObsDome(0xc8d0d8);
      g.position.y = spot.lo - 0.6;
      this.addBig(g, spot, [{ c: [0, 0], r: R, h: 7 + DOME_R }]);
    }
  }
  // ---------- 大型物件的擺放（新主題）----------
  // 找一個放得下的位置：局部外框 [x0, x1, z0, z1]、繞 Y 轉 q×90°；避開出生點、公路／鐵路、其他障礙物，
  // 地面高低差不超過 maxRange。回傳 { x, z, q, rotY, lo, avg, aabb } 或 null
  findSpot(bx, maxRange, tries = 24) {
    for (let t = 0; t < tries; t++) {
      const x = rnd(-46 * this.k, 46 * this.k),
        z = rnd(-46 * this.k, 46 * this.k),
        q = rndi(0, 3);
      const c = [
        [bx[0], bx[2]],
        [bx[1], bx[2]],
        [bx[0], bx[3]],
        [bx[1], bx[3]],
      ].map(([lx, lz]) => rotQ(q, lx, lz));
      const a = [
        x + Math.min(...c.map((p) => p[0])),
        x + Math.max(...c.map((p) => p[0])),
        z + Math.min(...c.map((p) => p[1])),
        z + Math.max(...c.map((p) => p[1])),
      ];
      if (Math.max(Math.abs(a[0]), Math.abs(a[1]), Math.abs(a[2]), Math.abs(a[3])) > 56 * this.k) continue;
      const nx = clamp(0, a[0], a[1]),
        nz = clamp(0, a[2], a[3]);
      if (Math.hypot(nx, nz) < 16 * MS) continue;
      let ok = true,
        lo = 1e9,
        hi = -1e9,
        sum = 0,
        cnt = 0;
      for (let sx = a[0]; sx <= a[1] + 1e-6 && ok; sx += Math.max(1, (a[1] - a[0]) / 6))
        for (let sz = a[2]; sz <= a[3] + 1e-6; sz += Math.max(1, (a[3] - a[2]) / 6)) {
          if (
            this.onCorridor(sx, sz, 3) ||
            this.isVoid(sx, sz) ||
            this.isReserved(sx, sz, 3) ||
            this.offLimits(sx, sz)
          ) {
            ok = false;
            break;
          }
          const h = this.terrainHeight(sx, sz);
          lo = Math.min(lo, h);
          hi = Math.max(hi, h);
          sum += h;
          cnt++;
        }
      if (!ok || hi - lo > maxRange) continue;
      if (
        this.obstacles.some((o) =>
          o.kind === 'box'
            ? o.x + o.w / 2 + 3 > a[0] &&
              o.x - o.w / 2 - 3 < a[1] &&
              o.z + o.d / 2 + 3 > a[2] &&
              o.z - o.d / 2 - 3 < a[3]
            : o.x + o.r + 3 > a[0] && o.x - o.r - 3 < a[1] && o.z + o.r + 3 > a[2] && o.z - o.r - 3 < a[3],
        )
      )
        continue;
      return { x, z, q, rotY: (q * Math.PI) / 2, lo, avg: sum / cnt, aabb: a };
    }
    return null;
  }
  // 把群組加進場景並登記成障礙物（box 為局部的碰撞箱 [x0, x1, z0, z1]、底、頂；circle 為局部圓心與半徑）
  addBig(g, spot, shapes, occlude = true) {
    g.position.set(spot.x, g.position.y, spot.z);
    g.rotation.y = spot.rotY;
    this.scene.add(g);
    this.meshes.push(g);
    const mats = propMats(g) || fadeMatsOf(g);
    const obs = [];
    for (const s of shapes) {
      if (s.box) {
        const c = [rotQ(spot.q, s.box[0], s.box[2]), rotQ(spot.q, s.box[1], s.box[3])];
        const x0 = spot.x + Math.min(c[0][0], c[1][0]),
          x1 = spot.x + Math.max(c[0][0], c[1][0]),
          z0 = spot.z + Math.min(c[0][1], c[1][1]),
          z1 = spot.z + Math.max(c[0][1], c[1][1]);
        obs.push({
          kind: 'box',
          x: (x0 + x1) / 2,
          z: (z0 + z1) / 2,
          w: x1 - x0,
          d: z1 - z0,
          top: s.top,
          y: s.y,
          group: g,
          mats,
          deck: !!s.deck,
          box: new THREE.Box3(new THREE.Vector3(x0, s.y, z0), new THREE.Vector3(x1, s.top, z1)),
        });
      } else {
        const [px, pz] = rotQ(spot.q, s.c[0], s.c[1]);
        obs.push({
          kind: 'circle',
          x: spot.x + px,
          z: spot.z + pz,
          r: s.r,
          group: g,
          mats,
          box: null,
          h: s.h,
        });
      }
    }
    for (const o of obs) this.obstacles.push(o);
    if (occlude) {
      // 鏡頭遮擋用整個物件的外框（第一個障礙物代表）
      const o = obs[0];
      o.box = o.box || new THREE.Box3().setFromObject(g);
      this.occluders.push(o);
    }
    return obs;
  }
  // 荒野（現實尺寸）：斗輪採掘機殘骸（地標，長約 140 m）、高架輸送管線（管底離地 12 m 以上，機甲從底下通過）、
  // 鑽井架（30–45 m）
  buildMachinery() {
    const R = MINING_RIG;
    const [bw, bh, bd] = R.body;
    for (let k = this.cnt(1, 2); k > 0; k--) {
      const spot = this.findSpot([-bw * 0.6, bw * 0.6, R.wheelZ - R.wheelR - 2, bd * 1.3], 4.5 * G, 40);
      if (!spot) continue;
      const g = buildMiningRig(pick([0xc8a040, 0xb07a38, 0x8c8f86]));
      g.position.y = spot.lo - 1.2;
      this.addBig(g, spot, [
        { box: [-bw / 2, bw / 2, -bd / 2, bd / 2], y: spot.lo - 1.2, top: spot.lo - 1.2 + bh },
        { c: [0, R.wheelZ], r: R.wheelR - 1.6, h: R.wheelY + R.wheelR },
      ]);
    }
    // 高架管線：試幾條軸向的直線，取沿線最高點最低的一條，管底在最高點上方 12 m（機甲 9.7 m 從底下通過）
    for (let k = this.cnt(1, 2); k > 0; k--) {
      let best = null;
      for (let t = 0; t < 6; t++) {
        const axis = rndi(0, 1),
          off = rnd(-40 * this.k, 40 * this.k);
        let maxH = -1e9;
        for (let s = -50 * this.k; s <= 50 * this.k; s += 3 * G) {
          const x = axis ? s : off,
            z = axis ? off : s;
          maxH = Math.max(maxH, this.terrainHeight(x, z));
        }
        if (this.obstacles.some((o) => o.pipeAxis === axis && Math.abs(o.pipeOff - off) < 20 * G)) continue;
        if (!best || maxH < best.maxH) best = { axis, off, maxH };
      }
      if (!best) continue;
      const len = Math.floor((99 * this.k) / PIPE.seg) * PIPE.seg,
        y0 = best.maxH + 12,
        color = 0xb89a5a;
      const g = buildPipeline(len, color);
      g.position.set(best.axis ? 0 : best.off, y0 + PIPE.r, best.axis ? best.off : 0);
      if (best.axis) g.rotation.y = Math.PI / 2;
      this.scene.add(g);
      this.meshes.push(g);
      const half = len / 2;
      const ob = {
        kind: 'box',
        x: best.axis ? 0 : best.off,
        z: best.axis ? best.off : 0,
        w: best.axis ? len : 1.8,
        d: best.axis ? 1.8 : len,
        top: y0 + PIPE.r * 2,
        y: y0,
        group: g,
        mats: [],
        deck: true,
        pipeAxis: best.axis,
        pipeOff: best.off,
        box: null,
      };
      this.obstacles.push(ob);
      for (let s = -half + PIPE.seg; s < half - 1; s += PIPE.seg * 2) {
        const x = best.axis ? s : best.off,
          z = best.axis ? best.off : s;
        if (this.onCorridor(x, z, 1.5) || Math.max(Math.abs(x), Math.abs(z)) > 56 * this.k) continue;
        const gy = this.terrainHeight(x, z);
        const sp = buildPipeSupport(y0 - gy + 0.3, 0x5a4a3a);
        sp.position.set(x, gy - 0.3, z);
        if (best.axis) sp.rotation.y = Math.PI / 2;
        this.decorSupport(sp);
        this.obstacles.push({ kind: 'circle', x, z, r: 1.1, group: sp, mats: [], box: null, h: y0 - gy });
      }
    }
    for (let k = this.cnt(2, 4); k > 0; k--) {
      const h = rnd(30, 45),
        B = derrickBase(h),
        color = 0x9a6a3a;
      const spot = this.findSpot([-B * 1.1, B * 1.1, -B * 1.1, B * 1.1], 1.5 * G);
      if (!spot) continue;
      const g = buildDerrick(h, color);
      g.position.y = spot.lo - 0.2;
      const [ob] = this.addBig(g, spot, [{ c: [0, 0], r: B, h }]);
      this.regProp('derrick', ob, 6000, color);
    }
  }
  // 不碰撞也不淡出的結構零件（管線支架）：照一般網格加進場景（地圖建好後和裝飾一起合併）
  decorSupport(m) {
    this.addDecorMesh(m);
  }
  // 沙丘：半埋的艦體殘骸與拱形殘骸
  buildWrecks() {
    const H = WRECK_HULL;
    for (let k = this.cnt(1, 2); k > 0; k--) {
      const spot = this.findSpot([-H.box[0] / 2, H.box[0] / 2, -H.box[1] / 2, H.box[1] / 2], 3.5 * G, 40);
      if (!spot) continue;
      const g = buildWreckHull(pick([0x7d7466, 0x6a6f74, 0x8a6e52]));
      g.position.y = spot.avg - H.sink;
      this.addBig(g, spot, [
        {
          box: [-H.box[0] / 2, H.box[0] / 2, -H.box[1] / 2, H.box[1] / 2],
          y: spot.lo - 3,
          top: spot.avg + H.box[2],
        },
      ]);
    }
    const A = WRECK_ARCH;
    for (let k = this.cnt(1, 2); k > 0; k--) {
      const ex = A.feet[0] + A.feet[1];
      const spot = this.findSpot([-ex, ex, -A.feet[1], A.feet[1]], 3 * G, 40);
      if (!spot) continue;
      const g = buildWreckArch(pick([0x6f675c, 0x847a6a]));
      g.position.y = spot.avg;
      this.addBig(g, spot, [
        { c: [-A.feet[0], 0], r: A.feet[1], h: 12 },
        { c: [A.feet[0], 0], r: A.feet[1], h: 12 },
      ]);
    }
  }

  // ---------- 地形特徵：橋梁／高架／掩體／壕溝 ----------
  planFeatures() {
    withRng(this.seed * 17 + 5, () => this.planFeatures0());
  }
  planFeatures0() {
    this.features = [];
    this.featureNames = [];
    const kinds = this.theme.featureKinds || ['river_bridge', 'overpass', 'bunkers', 'trench', 'platforms'];
    const n = Math.min(kinds.length, this.theme.flat ? rndi(1, 3) : rndi(2, 4));
    const chosen = [];
    while (chosen.length < n) {
      const k = pick(kinds);
      if (!chosen.includes(k)) chosen.push(k);
    }
    // 穿越的公路／鐵路：主題的 corridor（{ p 出現機率, kinds 可出現的種類 }）；方向斜向或沿 X／Z，偏離中心，一半有緩彎
    const CO = corridorSpec(this.theme);
    const force = this.forceRail && CO.kinds.includes('rail');
    const forceR = !force && this.forceRoad && CO.kinds.includes('road');
    if (force || forceR || (CO.kinds.length && RNG() < CO.p)) {
      const kind = force ? 'rail' : forceR ? 'road' : pick(CO.kinds);
      const a = pick([Math.PI / 4, -Math.PI / 4, 0, Math.PI / 2]);
      const d = new THREE.Vector2(Math.cos(a), Math.sin(a));
      const bend = RNG() < 0.5 ? [rnd(8, 14) * this.k * (RNG() < 0.5 ? 1 : -1), RNG() < 0.5 ? 1 : 0] : null;
      // 公路與鐵路照現實的寬度（不跟著地形放大）
      this.corridor = {
        kind,
        dir: d,
        perp: new THREE.Vector2(-d.y, d.x),
        off: rnd(-22 * this.k, 22 * this.k),
        width: 10,
        len: this.size * 0.75,
        bend,
      };
      this.featureNames.push(this.corridor.kind === 'road' ? '穿越公路' : '穿越鐵路');
    }
    for (const k of chosen) {
      const ang = RNG() < 0.5 ? 0 : Math.PI / 2;
      const dir = new THREE.Vector2(Math.cos(ang), Math.sin(ang)),
        perp = new THREE.Vector2(-dir.y, dir.x);
      const off = rnd(-25 * this.k, 25 * this.k);
      if (k === 'river_bridge') {
        this.features.push({
          k,
          dir,
          perp,
          off,
          width: rnd(13, 18) * G,
          depth: rnd(4.5, 6.5) * G,
          bridges: [rnd(-38 * this.k, -8 * G), rnd(8 * G, 38 * this.k)],
          deckW: 9 * G,
        });
        this.featureNames.push('河道與橋梁');
      } else if (k === 'overpass') {
        this.features.push({
          k,
          dir,
          perp,
          off,
          center: rnd(-15 * this.k, 15 * this.k),
          span: rnd(34, 46) * G,
          rampL: 18 * G,
          deckH: 7.5 * G,
          deckW: 10 * G,
        });
        this.featureNames.push('高架橋');
      } else if (k === 'bunkers') {
        this.features.push({ k, count: this.cnt(3, 5) });
        this.featureNames.push('掩體群');
      } else if (k === 'trench') {
        this.features.push({
          k,
          dir,
          perp,
          off: rnd(-30 * this.k, 30 * this.k),
          width: rnd(6, 9) * G,
          depth: rnd(2.5, 3.5) * G,
          len: rnd(50 * this.k, 90 * this.k),
        });
        this.featureNames.push('壕溝');
      } else {
        this.features.push({ k, count: this.cnt(2, 4) });
        this.featureNames.push('高台');
      }
    }
    if (this.corridor)
      this.features.push({
        k: 'corridor',
        dir: this.corridor.dir,
        perp: this.corridor.perp,
        off: this.corridor.off,
        width: 10,
        len: this.corridor.len,
        kind: this.corridor.kind,
        bend: this.corridor.bend,
      });
  }
  featureHeight(x, z, h) {
    for (const f of this.features) {
      if (f.k === 'river_bridge') {
        const u = x * f.perp.x + z * f.perp.y - f.off;
        const t = clamp(1 - (Math.abs(u) - f.width / 2 + 2 * G) / (3 * G), 0, 1);
        h -= f.depth * t * t * (3 - 2 * t);
      } else if (f.k === 'overpass') {
        const u = x * f.perp.x + z * f.perp.y - f.off,
          v = x * f.dir.x + z * f.dir.y - f.center;
        const lat = clamp(1 - (Math.abs(u) - f.deckW / 2) / (2.5 * G), 0, 1);
        const half = f.span / 2;
        if (lat > 0 && Math.abs(v) > half && Math.abs(v) < half + f.rampL) {
          const t = 1 - (Math.abs(v) - half) / f.rampL;
          h = lerp(h, Math.max(h, f.deckH * t + h * (1 - t)), lat);
        }
      } else if (f.k === 'trench') {
        const u = x * f.perp.x + z * f.perp.y - f.off,
          v = x * f.dir.x + z * f.dir.y;
        if (Math.abs(v) < f.len / 2) {
          const t = clamp(1 - (Math.abs(u) - f.width / 2 + 1.5 * G) / (2 * G), 0, 1);
          h -= f.depth * t;
        }
      }
    }
    if (this.corridor) {
      const c = this.corridor;
      const u = this.corridorU(x, z);
      const inside = clamp(1 - (Math.abs(u) - c.width / 2) / (3.5 * G), 0, 1); // 路肩的整地（地形的起伏放大了，過渡帶跟著加寬）
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (inside > 0 && edge < (this.size / 2) * 0.88) {
        const t = inside * inside * (3 - 2 * inside);
        h = lerp(h, 0.25, t);
      }
    }
    return h;
  }
  addDeck(x, z, w, d, y, thick, rotY, mats) {
    // elevated slab you can stand on AND walk under（新主題用主題版的外觀，碰撞相同）
    const fs = this.theme.props;
    const {
      group: g,
      dm,
      rm,
    } = fs
      ? { group: buildThemeDeck(fs, w, d, thick, rotY), dm: null, rm: null }
      : buildDeck(w, d, thick, rotY, mats || deckMats());
    g.position.set(x, y, z);
    this.scene.add(g);
    this.meshes.push(g);
    const ob = {
      kind: 'box',
      x,
      z,
      w,
      d,
      top: y,
      y: y - thick,
      group: g,
      mats: propMats(g) || (dm ? [dm, rm] : fadeMatsOf(g)),
      box: new THREE.Box3(
        new THREE.Vector3(x - w / 2, y - thick, z - d / 2),
        new THREE.Vector3(x + w / 2, y + 0.9, z + d / 2),
      ),
      deck: true,
    };
    this.obstacles.push(ob);
    this.occluders.push(ob);
    return ob;
  }
  // 放在地形上的物件貼地（2026-11-13）：以前一律放在中心的地面高度（往下埋一點），斜坡上下坡那一側懸空（岩柱、砂岩、
  // 儲槽…最多 10 m 以上）。量外框底下最低的地面，比原本的底部低就往下移（最多高度的 40%，不會整個埋掉）；
  // 放在甲板、平台上的（底部比中心的地形高）不動。不用亂數。回傳新的 y
  settleDown(g, x, y, z, h) {
    const tc = this.terrainHeight(x, z);
    if (y > tc + 0.5) return y;
    g.updateMatrixWorld(true);
    let b = _decorBox.setFromObject(g);
    if (b.isEmpty()) return y;
    // 長而矮的（卡車、貨櫃、護欄、貨物艙…）順著坡度傾斜，最多約 20°；高的（塔、燈桿）不傾斜
    const bw = b.max.x - b.min.x,
      bd = b.max.z - b.min.z,
      bh = b.max.y - b.min.y;
    if (Math.max(bw, bd) > 6 && bh < Math.max(bw, bd) * 0.5) {
      const cx = (b.min.x + b.max.x) / 2,
        cz = (b.min.z + b.max.z) / 2,
        ax = bw * 0.42,
        az = bd * 0.42;
      const sx = (this.terrainHeight(cx + ax, cz) - this.terrainHeight(cx - ax, cz)) / (2 * ax),
        sz = (this.terrainHeight(cx, cz + az) - this.terrainHeight(cx, cz - az)) / (2 * az);
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-Math.atan(clamp(sz, -0.36, 0.36)), 0, Math.atan(clamp(sx, -0.36, 0.36))),
      );
      g.quaternion.premultiply(q);
      g.updateMatrixWorld(true);
      b = _decorBox.setFromObject(g);
    }
    const lo = this.footMin(
      (b.min.x + b.max.x) / 2,
      (b.min.z + b.max.z) / 2,
      (b.max.x - b.min.x) * 0.9,
      (b.max.z - b.min.z) * 0.9,
    );
    const base = b.min.y;
    const H = h || b.max.y - b.min.y;
    const dy = Math.min(base - lo, Math.max(0.5, H * 0.4));
    if (!(dy > 0.3)) return y;
    g.position.y -= dy;
    g.updateMatrixWorld(true);
    return y - dy;
  }
  // 長方形範圍（中心、寬、深）底下最低的地形高度（四角、邊的中點與中心；不用亂數）
  footMin(x, z, w, d) {
    let m = Infinity;
    for (const u of [-0.5, -0.25, 0, 0.25, 0.5])
      for (const v of [-0.5, 0, 0.5]) m = Math.min(m, this.terrainHeight(x + u * w, z + v * d));
    return m;
  }
  addPillar(x, z, r, y0, y1, m) {
    const h = y1 - y0;
    const c = this.theme.props
      ? buildThemePillar(this.theme.props, r, h)
      : buildPillar(r, h, m || deckMats().pillar);
    c.position.set(x, y0 + h / 2, z);
    this.scene.add(c);
    this.meshes.push(c);
    this.obstacles.push({ kind: 'circle', x, z, r: r * 1.1, group: c, mats: [], box: null, top: y1 });
  }
  regProp(kind, ob, hp, color, obs) {
    this.props = this.props || [];
    const id = this.props.length;
    const c = ob.box
      ? ob.box.getCenter(new THREE.Vector3())
      : new THREE.Vector3(ob.x, this.terrainHeight(ob.x, ob.z) + (ob.h || 3) / 2, ob.z);
    const r = ob.box ? ob.box.getSize(new THREE.Vector3()).length() * 0.5 : ob.r + 0.5;
    const p = {
      id: 800000 + id,
      idx: id,
      kind,
      ob,
      hp,
      maxHp: hp,
      color,
      dead: false,
      team: 'prop',
      isProp: true,
      radius: Math.max(1.2, r * 0.85),
      name:
        {
          container: '貨櫃',
          rock: '岩石',
          pillar: '柱子',
          truck: '卡車',
          pillarBlock: '高柱',
          derrick: '鑽井架',
          hopper: '礦石料斗',
          tank: '儲槽',
          spire: '岩柱',
          floodlight: '照明塔',
          mtwreck: '步行機殘骸',
          sandstone: '砂岩',
          fence: '防風牆',
          quonset: '拱屋',
          ice: '冰塊',
          radar: '雷達天線',
          beacon: '信號燈桿',
          lamppost: '照明柱',
          rockpile: '落石堆',
          twall: '防爆牆',
          barrier: '護欄',
          pine: '針葉樹',
        }[kind] || (this.theme.propNames || {})[kind],
      pos: c,
      center: () => c.clone(),
      flashT: 0,
      shape: propShape(this, ob), // 命中形狀＝碰撞障礙物（world/prop-hit.js）；radius 只剩粗略的用途
      mat: propMatOf(String(kind).replace(/^ed\//, ''), this.themeKey), // 材質（data/destruct.js）
      obs: obs || [ob], // 這個物件的全部障礙物（產生器放的大型物件可能有好幾個）
      legacy: !this.regNew, // 改版前就打得壞的（設定「不可破壞」時只有這些打得壞）
      col: ob.group ? groupColor(ob.group) : 0x202224, // 實際的顏色（線性值；碎片與殘骸用）
    };
    for (const o of p.obs) o.prop = p;
    ob.prop = p;
    this.props.push(p);
    return p;
  }
  // 其他打得到的物件（以前打不壞的：倉庫、高的貨櫃堆、變體與主題放的大型物件…）登記成可破壞：同一個群組的障礙物
  // 算一個物件（命中形狀＝它們的外框）。地形特徵、主題的大型結構、地標、甲板（上面站得了東西）、承重柱與很大的
  // （高 30 m 以上或長 50 m 以上）在之後的倒塌與局部打穿處理（docs/destruction-design.md）
  regRest() {
    const byG = new Map();
    // 已經是可破壞物件的群組：同一個群組的其他障礙物併進那個物件（低的貨櫃堆：一堆有好幾個）
    const owner = new Map();
    for (const p of this.props || []) if (p.ob.group && !p.dead) owner.set(p.ob.group, p);
    for (const o of this.obstacles) {
      if (o.prop || o.struct || !o.group || o.group === this.decorG) continue;
      const own = owner.get(o.group);
      if (own) {
        own.obs.push(o);
        o.prop = own;
        continue;
      }
      let L = byG.get(o.group);
      if (!L) byG.set(o.group, (L = []));
      L.push(o);
    }
    const nearRamp = (b) =>
      (this.ramps || []).some(
        (r) =>
          Math.abs(r.x - (b.min.x + b.max.x) / 2) < r.w / 2 + (b.max.x - b.min.x) / 2 + 2 &&
          Math.abs(r.z - (b.min.z + b.max.z) / 2) < r.d / 2 + (b.max.z - b.min.z) / 2 + 2,
      );
    for (const [g, L] of byG) {
      if (L.some((o) => o.deck || o.struct || (o.kind === 'circle' && o.top !== undefined))) continue;
      const b = new THREE.Box3();
      for (const o of L) {
        if (o.box && !o.box.isEmpty()) b.union(o.box);
        else {
          const gy = this.terrainHeight(o.x, o.z);
          const h = o.top !== undefined ? o.top - gy : o.h || (o.r || 1) * 2;
          const hx = o.kind === 'box' ? o.w / 2 : o.r,
            hz = o.kind === 'box' ? o.d / 2 : o.r;
          b.union(
            new THREE.Box3(
              new THREE.Vector3(o.x - hx, gy, o.z - hz),
              new THREE.Vector3(o.x + hx, gy + h, o.z + hz),
            ),
          );
        }
      }
      if (b.isEmpty()) continue;
      const sz = b.getSize(new THREE.Vector3());
      if (sz.y > 30 || Math.max(sz.x, sz.z) > 50 || nearRamp(b)) continue;
      let ob = L[0];
      if (L.length > 1) {
        // 好幾個障礙物：命中形狀用它們的外框（一個方塊）
        ob = {
          kind: 'box',
          x: (b.min.x + b.max.x) / 2,
          z: (b.min.z + b.max.z) / 2,
          w: sz.x,
          d: sz.z,
          y: b.min.y,
          top: b.max.y,
          group: g,
          mats: L[0].mats,
          box: b,
        };
      }
      const kind = 'misc';
      const mat0 = propMatOf(kind, this.themeKey);
      const p = this.regProp(kind, ob, propHpFor(sz.y, sz.x, sz.z, mat0), 0x80827f, L);
      p.name = sz.y >= 10 ? '大型建築' : sz.y >= 4.5 ? '建築物' : '掩體';
    }
  }
  // 高聳的結構與大型建築（地形特徵、主題的大型結構、地標、很大的物件；docs/destruction-design.md 第 4 期）：
  // 結構本體（打得到、會受損，但不會因為傷害而損毀：noDie）＋底部 1～4 根承重柱（各自的可破壞物件，沒有自己的碰撞）。
  // 承重柱全壞時由 Game 的 propCollapse 讓本體倒下。有甲板（上面站得了東西）、承重柱（有頂的圓柱）、坡道旁的、
  // 壩體（局部打穿）不在這裡。不用亂數，照障礙物的順序
  regStructs() {
    const byG = new Map();
    for (const o of this.obstacles) {
      if (o.prop || !o.group || o.group === this.decorG) continue;
      let L = byG.get(o.group);
      if (!L) byG.set(o.group, (L = []));
      L.push(o);
    }
    for (const [g, L] of byG) {
      if (L.some((o) => o.seg || (o.kind === 'circle' && o.top !== undefined))) continue;
      // 只有甲板的群組（橋面、高架、掩體頂）由 regDecks 處理；甲板＋牆（機庫、有平台的地標）整個往下塌
      const hasDeck = L.some((o) => o.deck);
      if (hasDeck && L.every((o) => o.deck)) continue;
      const b = new THREE.Box3();
      for (const o of L) b.union(this.obBox(o));
      if (b.isEmpty()) continue;
      const sz = b.getSize(new THREE.Vector3());
      if (this.underDeck(b, g)) continue;
      const ramps = this.rampsNear(b);
      const mat0 = propMatOf('struct', this.themeKey);
      if (sz.y < 4 && !ramps.length) {
        const p = this.regProp(
          'misc',
          this.unionOb(L, b, g, b.min.y),
          propHpFor(sz.y, sz.x, sz.z, mat0),
          0,
          L,
        );
        p.name = '掩體';
        continue;
      }
      // 承重柱的高度與配置：小的 1 根（中央）、長的 2 根（長邊兩端）、大的 4 根（四角）
      const hs = Math.max(2.5, Math.min(9, sz.y * 0.22));
      const big = Math.max(sz.x, sz.z),
        small = Math.min(sz.x, sz.z);
      const n = big < 14 ? 1 : small < 14 ? 2 : 4;
      const body = this.regProp('struct', this.unionOb(L, b, g, b.min.y + hs), 1, 0, L);
      body.name = sz.y > big * 2 ? '高塔' : sz.y >= 12 ? '大型建築' : '建築物';
      body.body = true;
      body.noDie = true;
      body.noCut = true;
      body.y0 = b.min.y;
      body.base = b.clone();
      body.sup = [];
      // 上面站得了東西的（甲板＋牆、接著坡道的高台）：一律往下塌，坡道一起拿掉
      if (hasDeck || ramps.length) body.forceSink = true;
      body.ramps = ramps;
      const cells =
        n === 1
          ? [[0, 0, 1, 1]]
          : n === 2
            ? sz.x >= sz.z
              ? [
                  [0, 0, 0.5, 1],
                  [0.5, 0, 1, 1],
                ]
              : [
                  [0, 0, 1, 0.5],
                  [0, 0.5, 1, 1],
                ]
            : [
                [0, 0, 0.5, 0.5],
                [0.5, 0, 1, 0.5],
                [0, 0.5, 0.5, 1],
                [0.5, 0.5, 1, 1],
              ];
      let hpSum = 0;
      for (const [u0, v0, u1, v1] of cells) {
        const x0 = b.min.x + sz.x * u0,
          x1 = b.min.x + sz.x * u1,
          z0 = b.min.z + sz.z * v0,
          z1 = b.min.z + sz.z * v1;
        const sb = new THREE.Box3(
          new THREE.Vector3(x0, b.min.y, z0),
          new THREE.Vector3(x1, b.min.y + hs, z1),
        );
        const sob = {
          kind: 'box',
          x: (x0 + x1) / 2,
          z: (z0 + z1) / 2,
          w: x1 - x0,
          d: z1 - z0,
          y: b.min.y,
          top: b.min.y + hs,
          group: g,
          mats: L[0].mats,
          box: sb,
        };
        const hp = Math.max(4000, Math.min(12000, propHpFor(sz.y, x1 - x0, z1 - z0, mat0)));
        hpSum += hp;
        const sp = this.regProp('support', sob, hp, 0, []);
        sp.name = body.name + '的支柱';
        sp.support = true;
        sp.body = null;
        sp.of = body;
        sp.ofs = [body];
        body.sup.push(sp);
      }
      body.hp = body.maxHp = Math.round(hpSum * 1.5);
    }
  }
  // 障礙物的外框（沒有網格外框的圓柱、方塊依尺寸算）
  obBox(o) {
    if (o.box && !o.box.isEmpty()) return o.box.clone();
    const gy = this.terrainHeight(o.x, o.z);
    const h = o.top !== undefined ? o.top - gy : o.h || (o.r || 1) * 2;
    const hx = o.kind === 'box' ? o.w / 2 : o.r,
      hz = o.kind === 'box' ? o.d / 2 : o.r;
    return new THREE.Box3(
      new THREE.Vector3(o.x - hx, gy, o.z - hz),
      new THREE.Vector3(o.x + hx, gy + h, o.z + hz),
    );
  }
  // 撐著甲板的（橋墩、高架管線的腳、甲板下的牆）：頂在甲板底附近、水平重疊（第 5 期和甲板一起處理）
  underDeck(b, g) {
    const cx = (b.min.x + b.max.x) / 2,
      cz = (b.min.z + b.max.z) / 2;
    const hx = (b.max.x - b.min.x) / 2,
      hz = (b.max.z - b.min.z) / 2;
    return this.obstacles.some(
      (d) =>
        d.deck &&
        d.group !== g &&
        Math.abs(d.x - cx) < d.w / 2 + hx + 1 &&
        Math.abs(d.z - cz) < d.d / 2 + hz + 1 &&
        Math.abs(d.y - b.max.y) < 4,
    );
  }
  // 接著這個外框的坡道（坡道的高端在外框的頂附近、水平相接）
  rampsNear(b) {
    return (this.ramps || []).filter(
      (r) =>
        Math.abs(r.x - (b.min.x + b.max.x) / 2) < r.w / 2 + (b.max.x - b.min.x) / 2 + 2 &&
        Math.abs(r.z - (b.min.z + b.max.z) / 2) < r.d / 2 + (b.max.z - b.min.z) / 2 + 2 &&
        Math.abs(r.y1 - b.max.y) < 3,
    );
  }
  // 甲板（橋面、高架、掩體頂、虛空上的橋；docs/destruction-design.md 第 5 期）：甲板本體（noDie）＋撐著它的
  // 橋墩、支柱、牆（各自的物件，有自己的碰撞與模型：sep）；找不到時在甲板上沿長邊分 2～4 段當承重的區段。
  // 承重的全壞時甲板掉到地上（propDrop）。虛空上的橋不會斷：沒有承重、最多打到第 3 階段
  regDecks() {
    const decks = this.obstacles.filter(
      (o) => o.deck && !o.prop && (!o.seg || o.seg === 'grid') && o.group && o.group !== this.decorG,
    );
    const claimed = new Set();
    for (const ob of decks) {
      const L = this.obstacles.filter((o) => o.group === ob.group);
      if (L.some((o) => !o.deck || o.prop)) continue;
      const b = new THREE.Box3();
      for (const o of L) b.union(this.obBox(o));
      const sz = b.getSize(new THREE.Vector3());
      const mat0 = propMatOf('deck', this.themeKey);
      const body = this.regProp('deck', this.unionOb(L, b, ob.group, b.min.y), 1, 0, L);
      body.name = '橋面';
      body.body = true;
      body.noDie = true;
      body.noCut = true;
      body.base = b.clone();
      body.sup = [];
      body.mode = 'drop';
      body.ramps = this.rampsNear(b);
      // Lattice-9 的甲板格子：直接打得壞（整格掉下去），四角的支柱和旁邊的格子共用
      const grid = ob.seg === 'grid';
      if (grid) {
        body.grid = true;
        body.seg = 'grid';
        body.noDie = false;
        body.name = '甲板格子';
      }
      // 虛空上的橋：不會斷
      let vd = false;
      for (const [u, v] of [
        [0.5, 0.5],
        [0.2, 0.5],
        [0.8, 0.5],
        [0.5, 0.2],
        [0.5, 0.8],
      ])
        if (this.theme.void && this.terrainHeight(b.min.x + sz.x * u, b.min.z + sz.z * v) < this.theme.void.y)
          vd = true; // 只看地形（isVoid 會把橋面本身當成地面）
      if (vd) {
        body.noCollapse = true;
        body.hp = body.maxHp = propHpFor(8, sz.x, sz.z, mat0) * 3;
        continue;
      }
      // 撐著它的：頂在甲板底附近、水平重疊（橋墩、支柱、牆）
      const hx = sz.x / 2 + 1,
        hz = sz.z / 2 + 1,
        cx = (b.min.x + b.max.x) / 2,
        cz = (b.min.z + b.max.z) / 2;
      const under = this.obstacles.filter(
        (o) =>
          !o.deck &&
          (grid ? o.seg === 'grid' : !o.prop && !o.seg && !claimed.has(o)) &&
          o.group &&
          o.group !== this.decorG &&
          Math.abs(o.x - cx) < hx + (o.kind === 'box' ? o.w / 2 : o.r) &&
          Math.abs(o.z - cz) < hz + (o.kind === 'box' ? o.d / 2 : o.r) &&
          Math.abs(this.obBox(o).max.y - ob.y) < 4,
      );
      let hpSum = 0;
      for (const o of under) {
        claimed.add(o);
        if (o.prop) {
          // 共用的支柱（Lattice-9）：撐著好幾格
          o.prop.ofs.push(body);
          body.sup.push(o.prop);
          continue;
        }
        const ob2 = this.obBox(o);
        const s2 = ob2.getSize(new THREE.Vector3());
        const hp = Math.max(3000, Math.min(9000, propHpFor(Math.min(s2.y, 8), s2.x, s2.z, mat0) * 1.5));
        const sp = this.regProp('support', o, hp, 0, [o]);
        sp.name = '橋墩';
        sp.support = true;
        sp.sep = true; // 有自己的模型與碰撞：損毀時照一般的物件換成殘骸
        sp.of = body;
        sp.ofs = [body];
        body.sup.push(sp);
        hpSum += hp;
      }
      if (grid) {
        body.hp = body.maxHp = 12000;
        continue;
      }
      if (!under.length) {
        // 沒有找到：甲板沿長邊分段（打斷這幾段就掉下來）
        const n = Math.max(2, Math.min(4, Math.round(Math.max(sz.x, sz.z) / 30)));
        for (let i = 0; i < n; i++) {
          const ax = sz.x >= sz.z;
          const x0 = ax ? b.min.x + (sz.x * i) / n : b.min.x,
            x1 = ax ? b.min.x + (sz.x * (i + 1)) / n : b.max.x,
            z0 = ax ? b.min.z : b.min.z + (sz.z * i) / n,
            z1 = ax ? b.max.z : b.min.z + (sz.z * (i + 1)) / n;
          const sob = {
            kind: 'box',
            x: (x0 + x1) / 2,
            z: (z0 + z1) / 2,
            w: x1 - x0,
            d: z1 - z0,
            y: ob.y,
            top: ob.top,
            group: ob.group,
            mats: ob.mats,
            box: new THREE.Box3(new THREE.Vector3(x0, ob.y, z0), new THREE.Vector3(x1, ob.top + 0.9, z1)),
          };
          const hp = Math.max(3000, Math.min(9000, propHpFor(4, x1 - x0, z1 - z0, mat0)));
          const sp = this.regProp('support', sob, hp, 0, []);
          sp.name = '橋面的接縫';
          sp.support = true;
          sp.of = body;
          sp.ofs = [body];
          body.sup.push(sp);
          hpSum += hp;
        }
      }
      body.hp = body.maxHp = Math.round(hpSum * 1.5);
    }
  }
  // Lattice-9 的甲板格子的支柱（一張大地圖幾百根、一根一個網格，主線的大地圖每格多幾百次繪製；2026-11-07）：
  // 依區域（4×4 格）與材質合併成少數幾個網格，原本的網格隱藏、不在 meshes 裡（不做鏡頭遮擋的淡出）。
  // 某一根損毀時 propUnmerge 把它在合併網格裡的頂點縮成一點（不畫），原本的網格顯示回來，之後照原本的做法切開、隱藏
  mergeGridPillars(ex = null) {
    const P = (this.props || []).filter(
      (p) =>
        p.ob && p.ob.seg === 'grid' && p.ob.kind === 'circle' && p.ob.group && !(ex && ex.has(p.ob.group)),
    );
    if (P.length < 8) return;
    const cell = this.limOut / POOL_CELL;
    const buckets = new Map();
    for (const p of P) {
      const g = p.ob.group;
      if (!g.parent || !g.visible) continue;
      g.updateMatrixWorld(true);
      const ms = [];
      let ok = true;
      g.traverse((o) => {
        if (!o.isMesh) return;
        const m = o.material,
          geo = o.geometry;
        if (o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(m) || !o.visible || geo.groups.length)
          ok = false;
        else if (m.transparent && m.depthWrite) ok = false;
        else ms.push(o);
      });
      if (!ok || !ms.length) continue;
      const cx = Math.floor(p.ob.x / cell),
        cz = Math.floor(p.ob.z / cell);
      for (const o of ms) {
        const key = [o.material.uuid, attrSig(o.geometry), +o.castShadow, +o.receiveShadow, cx, cz].join('|');
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = []));
        b.push({ p, o });
      }
      p.pillarMerge = [];
    }
    if (!buckets.size) return;
    const root = (this.pillarG = new THREE.Group());
    root.userData.noFade = true;
    root.userData.cat = 'prop'; // 地圖預覽器的場景分類（game/map-view-perf.js）
    this.scene.add(root);
    this.meshes.push(root); // dispose 時一起拿掉（noFade：不做遮擋的淡出）
    this.pillarHide = [];
    for (const list of buckets.values()) {
      const geo = mergeList(list.map(({ o }) => ({ geo: o.geometry, mm: o.matrixWorld.clone() })));
      const o0 = list[0].o;
      const mesh = new THREE.Mesh(geo, o0.material);
      mesh.castShadow = o0.castShadow;
      mesh.receiveShadow = o0.receiveShadow;
      root.add(mesh);
      let v = 0;
      for (const { p, o } of list) {
        const n = o.geometry.attributes.position.count;
        p.pillarMerge.push({ mesh, v, n });
        v += n;
      }
    }
    for (const p of P) {
      if (!p.pillarMerge) continue;
      const g = p.ob.group;
      g.visible = false;
      const k = this.meshes.indexOf(g);
      if (k >= 0) this.meshes.splice(k, 1);
      this.pillarHide.push(g);
    }
  }
  // ---------- 地圖物件的合併池（2026-11-07）----------
  // 地圖物件（甲板、棚屋、油桶、貨櫃…）各有自己的材質（鏡頭遮擋時單獨淡出、受擊閃光、焦黑），一個物件幾個網格，
  // 大地圖每格上千次繪製。依區域（4×4 格）與材質的外觀（顏色、粗糙度、貼圖…，不看是不是同一個材質物件）合併成
  // 少數幾個網格，原本的網格隱藏（群組照常顯示：依距離切換的小細節 fineReg 不合併）。要動到某一個物件的外觀時
  // 「拿出來」（poolOut：它在合併網格裡的頂點縮成一點、原本的網格顯示），之後照原本的做法淡出、閃光、受損：
  // 鏡頭遮擋淡回不透明、沒有受損時放回去（poolIn）；受損、損毀、倒塌之後一直在外面（propUnmerge）
  mergeProps(ex = null) {
    const cell = this.limOut / POOL_CELL;
    const buckets = new Map();
    const sig = propMatSig;
    const byG = new Map();
    // 巨型結構的局部打穿（p.seg）的群組不合併（壩體、隧道口、平台外緣：切開的是整段共用的網格）
    const segG = new Set();
    for (const p of this.props || []) if (p.seg && !p.grid && p.ob && p.ob.group) segG.add(p.ob.group);
    // 承重柱與結構本體（2026-11-13 起也合併：受損、損毀、倒塌之前都會 propUnmerge 拿出來；研究特區的橋墩一格上千次繪製）
    for (const p of this.props || []) {
      const g = p.ob && p.ob.group;
      if (!g || p.dead || p.pillarMerge || segG.has(g) || (ex && ex.has(g))) continue;
      if (!g.parent || !g.visible || g === this.decorG || g === this.pillarG) continue;
      let L = byG.get(g);
      if (!L) byG.set(g, (L = []));
      L.push(p);
    }
    // 打不壞的圓柱（支柱林、甲板下沒登記的支柱：有頂的圓柱障礙物、不是物件）：只會被鏡頭遮擋拿出來淡出
    for (const o of this.obstacles) {
      const g = o.group;
      if (o.prop || o.kind !== 'circle' || o.top === undefined || !g || byG.has(g) || segG.has(g)) continue;
      if (ex && ex.has(g)) continue;
      if (!g.parent || !g.visible || g === this.decorG || g === this.pillarG) continue;
      byG.set(g, []);
    }
    for (const [g, props] of byG) {
      g.updateMatrixWorld(true);
      const ms = [];
      let ok = true;
      g.traverse((o) => {
        if (!ok || !o.isMesh) return;
        if (o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material) || o.children.length)
          ok = false;
        if (!ok || isFine(o)) return;
        for (let q = o; q && q !== g.parent; q = q.parent) if (!q.visible) return;
        const m = o.material,
          geo = o.geometry;
        if (!m || !geo || !geo.attributes.position || geo.groups.length) return void (ok = false);
        if (geo.morphAttributes && Object.keys(geo.morphAttributes).length) return void (ok = false);
        if (m.transparent && m.depthWrite && m.opacity < 1) return; // 真的半透明的（玻璃）照舊
        ms.push(o);
      });
      if (!ok || !ms.length) continue;
      const e = g.matrixWorld.elements;
      const ck = Math.floor(e[12] / cell) + ',' + Math.floor(e[14] / cell);
      for (const o of ms) {
        const key = [sig(o.material), attrSig(o.geometry), +o.castShadow, +o.receiveShadow, ck].join('|');
        let b = buckets.get(key);
        if (!b) buckets.set(key, (b = []));
        b.push({ g, o });
      }
    }
    const root = (this.poolG = new THREE.Group());
    root.userData.noFade = true;
    root.userData.cat = 'prop'; // 地圖預覽器的場景分類（game/map-view-perf.js）
    this.scene.add(root);
    this.meshes.push(root);
    this.pool = new Map(); // 群組 → { items, props, in, no }
    this.poolOf = new WeakMap(); // 原本的網格 → 群組
    for (const list of buckets.values()) {
      if (list.length < 2) continue;
      const geo = mergeList(list.map(({ o }) => ({ geo: o.geometry, mm: o.matrixWorld.clone() })));
      const o0 = list[0].o;
      const mat = isOutline(o0.material) ? o0.material : o0.material.clone();
      if (mat !== o0.material) {
        mat.opacity = o0.material.opacity;
        tagStyle(new THREE.Mesh(undefined, mat), styleCat(o0.material));
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = o0.castShadow;
      mesh.receiveShadow = o0.receiveShadow;
      root.add(mesh);
      const pos = geo.attributes.position;
      let v = 0;
      for (const { g, o } of list) {
        const n = o.geometry.attributes.position.count;
        let P = this.pool.get(g);
        if (!P) this.pool.set(g, (P = { items: [], in: true, no: false, t: 0 }));
        P.items.push({ mesh, v, n, src: o, save: pos.array.slice(v * 3, (v + n) * 3) });
        this.poolOf.set(o, g);
        o.visible = false;
        v += n;
      }
    }
    this.poolOutSet = new Set();
  }
  // 自訂關卡的遊玩（不是編輯器；2026-11-13）：建圖時不合併（編輯器要切換產生器物件的顯示），遊玩時擺好物件之後
  // 才合併產生器放的物件、甲板格子的支柱與地形裝飾。玩家擺的物件（level/build.js 的 lvProps：觸發器會顯示／隱藏）不合併。
  // 已移除的產生器物件是隱藏的，合併時略過
  mergeLevelPlay() {
    if (!this.lvl || this.lvMerged) return;
    this.lvMerged = true;
    const ex = new Set((this.lvProps || []).map((r) => r.group).filter(Boolean));
    mergeStatic(this.decorG, new Set(), true, {
      cell: this.limOut / POOL_CELL,
      cellTris: 50000,
      matKey: propMatSig,
    });
    this.mergeGridPillars(ex);
    this.mergeProps(ex);
  }
  // 拿出來：合併網格裡縮成一點、原本的網格顯示
  poolOut(g, no) {
    const P = this.pool && this.pool.get(g);
    if (!P) return;
    if (no) P.no = true;
    if (!P.in) return;
    P.in = false;
    P.t = performance.now();
    for (const it of P.items) {
      const a = it.mesh.geometry.attributes.position;
      const arr = a.array,
        b = it.v * 3;
      for (let i = 0; i < it.n; i++) {
        arr[b + i * 3] = it.save[0];
        arr[b + i * 3 + 1] = it.save[1];
        arr[b + i * 3 + 2] = it.save[2];
      }
      a.addUpdateRange(b, it.n * 3);
      a.needsUpdate = true;
      it.src.visible = true;
    }
    if (!P.no) this.poolOutSet.add(g);
  }
  // 放回去
  poolIn(g) {
    const P = this.pool && this.pool.get(g);
    if (!P || P.in || P.no) return;
    P.in = true;
    this.poolOutSet.delete(g);
    for (const it of P.items) {
      const a = it.mesh.geometry.attributes.position;
      a.array.set(it.save, it.v * 3);
      a.addUpdateRange(it.v * 3, it.n * 3);
      a.needsUpdate = true;
      it.src.visible = false;
    }
  }
  // 每格（updateOcclusion 之後）：拿出來淡出的，淡回不透明、不再被擋住 1 秒後放回去
  poolTick() {
    if (!this.poolOutSet || !this.poolOutSet.size) return;
    const now = performance.now();
    const fading = this._fading;
    for (const g of this.poolOutSet) {
      const P = this.pool.get(g);
      if (!P || P.no) {
        this.poolOutSet.delete(g);
        continue;
      }
      if (now - P.t < 1000) continue;
      let busy = false;
      for (const it of P.items) {
        const m = it.src.material;
        if (m.opacity < 0.999 || (fading && fading.has(it.src))) {
          busy = true;
          break;
        }
      }
      if (busy) P.t = now;
      else this.poolIn(g);
    }
  }
  propUnmerge(p) {
    if (this.pool && p.ob && p.ob.group) this.poolOut(p.ob.group, true);
    const L = p.pillarMerge;
    if (!L) return;
    p.pillarMerge = null;
    for (const { mesh, v, n } of L) {
      const a = mesh.geometry.attributes.position;
      const x = a.getX(v),
        y = a.getY(v),
        z = a.getZ(v);
      for (let i = v; i < v + n; i++) a.setXYZ(i, x, y, z);
      a.needsUpdate = true;
    }
    const g = p.ob.group;
    g.visible = true;
    if (!this.meshes.includes(g)) this.meshes.push(g);
  }
  // 跟地形連在一起的巨型結構的局部打穿（docs/destruction-design.md 第 6 期）：每一段各自是一個物件（沒有自己的碰撞，
  // p.seg）——壩體每 12～16 m 一段、隧道口、洋上都市與高空軌道的平台外緣每 ~30 m 一段。岩頂不在這裡（Game 的 roofDamage
  // 依格子記血量，不進 props，不拖慢投射物的判定）。不用亂數
  regSegs() {
    // 壩體：沿 X 分段
    this.damRecs = [];
    for (const ob of this.obstacles.filter((o) => o.seg === 'dam')) {
      const x0 = ob.x - ob.w / 2,
        x1 = ob.x + ob.w / 2;
      const n = Math.max(1, Math.round(ob.w / 14));
      const rec = { ob, obs: [ob], x0, x1, secs: [], seg: 'dam' };
      tessellate(ob.group, 7); // 一片牆是整段長的三角形：細分才切得出缺口
      for (let i = 0; i < n; i++) {
        const a = x0 + (ob.w * i) / n,
          b = x0 + (ob.w * (i + 1)) / n;
        if (Math.abs((a + b) / 2) > this.limOut || Math.abs(ob.z) > this.limOut) continue; // 場地外的不登記
        const sob = {
          kind: 'box',
          x: (a + b) / 2,
          z: ob.z,
          w: b - a,
          d: ob.d,
          y: ob.y,
          top: ob.top,
          group: ob.group,
          mats: ob.mats,
          box: new THREE.Box3(
            new THREE.Vector3(a, ob.y, ob.z - ob.d / 2),
            new THREE.Vector3(b, ob.top, ob.z + ob.d / 2),
          ),
        };
        const sp = this.regProp('damseg', sob, 14000, 0, []);
        sp.name = '壩體';
        sp.seg = 'dam';
        sp.rec = rec;
        sp.a = a;
        sp.b = b;
        sp.lowWreck = true;
        rec.secs.push(sp);
      }
      this.damRecs.push(rec);
    }
    // 隧道口：拱門與門柱（外框的下面 30 m）
    for (const g of this.tunnels || []) {
      g.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(g);
      if (b.isEmpty()) continue;
      b.max.y = Math.min(b.max.y, b.min.y + 30);
      tessellate(g, 6);
      const sob = this.unionOb([{ mats: fadeMatsOf(g) }], b, g, b.min.y);
      const sp = this.regProp('tunnel', sob, 16000, 0, []);
      sp.name = '隧道口';
      sp.seg = 'tunnel';
      sp.lowWreck = true;
      sp.mat = 'rock';
    }
    // 平台外緣：每個街區的四邊，每 ~30 m 一段（外側 3 m 寬的帶）
    if (this.islands && this.rimMeshes && this.rimMeshes.length) {
      // 整條的方塊（洋上都市的護欄）細分：三角形的重心要分散在各段裡才切得開
      for (const m of this.rimMeshes) {
        const P = m.geometry && m.geometry.parameters;
        if (m.geometry && m.geometry.type === 'BoxGeometry' && P) {
          const L = Math.max(P.width, P.depth);
          const n = Math.max(1, Math.round(L / 4));
          m.geometry = new THREE.BoxGeometry(
            P.width,
            P.height,
            P.depth,
            P.width >= P.depth ? n : 1,
            1,
            P.width >= P.depth ? 1 : n,
          );
        }
      }
      for (const bk of this.islands.blocks) {
        const top = this.terrainHeight((bk.x0 + bk.x1) / 2, (bk.z0 + bk.z1) / 2);
        const edges = [
          [bk.x0, bk.z0, bk.x1, bk.z0, 0, -1],
          [bk.x0, bk.z1, bk.x1, bk.z1, 0, 1],
          [bk.x0, bk.z0, bk.x0, bk.z1, -1, 0],
          [bk.x1, bk.z0, bk.x1, bk.z1, 1, 0],
        ];
        for (const [ax, az, bx, bz, nx, nz] of edges) {
          const len = Math.hypot(bx - ax, bz - az);
          const n = Math.max(1, Math.round(len / 30));
          for (let i = 0; i < n; i++) {
            const t0 = i / n,
              t1 = (i + 1) / n;
            const px0 = ax + (bx - ax) * t0,
              px1 = ax + (bx - ax) * t1,
              pz0 = az + (bz - az) * t0,
              pz1 = az + (bz - az) * t1;
            const box = new THREE.Box3(
              new THREE.Vector3(
                Math.min(px0, px1) - (nx ? 3 : 0),
                top - 8,
                Math.min(pz0, pz1) - (nz ? 3 : 0),
              ),
              new THREE.Vector3(
                Math.max(px0, px1) + (nx ? 3 : 0),
                top + 2.5,
                Math.max(pz0, pz1) + (nz ? 3 : 0),
              ),
            );
            const meshes = this.rimMeshes.filter((m) => {
              m.updateMatrixWorld(true);
              return new THREE.Box3().setFromObject(m).intersectsBox(box);
            });
            if (!meshes.length) continue;
            const sob = this.unionOb([{ mats: [] }], box, null, box.min.y);
            const sp = this.regProp('rim', sob, 5000, 0, []);
            sp.name = '平台外緣';
            sp.seg = 'rim';
            sp.mat = 'metal';
            sp.meshes = meshes;
            sp.noWreckSeg = true;
          }
        }
      }
    }
  }
  // 壩體的一段打穿：沒打穿的部分重新做成碰撞方塊（每一個連續的區間一個）
  damBreach(sp) {
    const rec = sp.rec;
    for (const ob of rec.obs) {
      const i = this.obstacles.indexOf(ob);
      if (i >= 0) this.obstacles.splice(i, 1);
      const j = this.occluders.indexOf(ob);
      if (j >= 0) this.occluders.splice(j, 1);
    }
    const o0 = rec.ob;
    rec.obs = [];
    let a = null;
    const flush = (b) => {
      if (a === null || b - a < 0.5) return;
      const ob = {
        ...o0,
        x: (a + b) / 2,
        w: b - a,
        box: new THREE.Box3(
          new THREE.Vector3(a, o0.y, o0.z - o0.d / 2),
          new THREE.Vector3(b, o0.top, o0.z + o0.d / 2),
        ),
      };
      this.obstacles.push(ob);
      this.occluders.push(ob);
      rec.obs.push(ob);
    };
    for (const s of rec.secs) {
      if (s.dead) {
        flush(s.a);
        a = null;
      } else if (a === null) a = s.a;
    }
    flush(rec.x1);
  }
  nearRamp(b) {
    return (this.ramps || []).some(
      (r) =>
        Math.abs(r.x - (b.min.x + b.max.x) / 2) < r.w / 2 + (b.max.x - b.min.x) / 2 + 2 &&
        Math.abs(r.z - (b.min.z + b.max.z) / 2) < r.d / 2 + (b.max.z - b.min.z) / 2 + 2,
    );
  }
  // 好幾個障礙物合成一個命中形狀（外框的方塊，底在 y0）
  unionOb(L, b, g, y0) {
    return {
      kind: 'box',
      x: (b.min.x + b.max.x) / 2,
      z: (b.min.z + b.max.z) / 2,
      w: b.max.x - b.min.x,
      d: b.max.z - b.min.z,
      y: y0,
      top: b.max.y,
      group: g,
      mats: L[0].mats,
      box: new THREE.Box3(new THREE.Vector3(b.min.x, y0, b.min.z), b.max.clone()),
    };
  }
  // 完全損毀：拿掉碰撞與原本的模型，換成殘骸（prop-wreck.js）與殘骸的碰撞；o.quiet＝不播碎裂（重連時直接套用）
  destroyProp(p, fx, o = {}) {
    if (p.dead) return;
    this.propUnmerge(p); // 合併過的支柱：先還原成原本的網格（切開、隱藏照原本的做法）
    p.dead = true;
    p.hp = Math.min(p.hp, 0);
    if (p.seg && !p.grid) return; // 巨型結構的一段（壩體、隧道口、平台外緣）：Game 的 propSegDown 演出
    if (p.support && !p.sep) return; // 承重柱：結構的碰撞與模型不動（Game 的 propSupportDown 演出、全壞時倒塌）
    for (const ob of p.obs || [p.ob]) {
      const i = this.obstacles.indexOf(ob);
      if (i >= 0) this.obstacles.splice(i, 1);
      const j = this.occluders.indexOf(ob);
      if (j >= 0) this.occluders.splice(j, 1);
    }
    const g = p.ob.group;
    if (g) {
      g.visible = false;
      const k = this.meshes.indexOf(g);
      if (k >= 0) this.meshes.splice(k, 1);
    }
    if (o.cr) p.crushed = true; // 被踩平：殘骸是扁的（prop-wreck.js）
    if (fx && !o.quiet) fx.shatterProp(p, this, o);
    if (!o.noWreck) this.addWreck(p);
  }
  // 第 3 階段：y 以上塌掉（docs/destruction-design.md 第 2 期）：碰撞的頂與命中形狀降到 y，站在上面的機體掉下來
  propCut(p, y) {
    for (const ob of new Set([p.ob, ...(p.obs || [])])) {
      if (ob.kind === 'box') ob.top = Math.min(ob.top !== undefined ? ob.top : y, y);
      else ob.top = Math.min(ob.top !== undefined ? ob.top : y, y);
      if (ob.box && ob.box.max.y > y) ob.box.max.y = Math.max(ob.box.min.y, y);
      if (ob.h !== undefined) ob.h = Math.min(ob.h, Math.max(0.5, y - this.terrainHeight(ob.x, ob.z)));
    }
    p.shape0 = p.shape0 || p.shape;
    p.shape = propShape(this, p.ob);
    p.cutY = y;
  }
  addWreck(p) {
    const sh = p.shape0 || p.shape; // 損毀前的外形（切掉上段、結構本體的命中形狀從承重柱以上開始）
    const cx = (sh.x0 + sh.x1) / 2,
      cz = (sh.z0 + sh.z1) / 2;
    // 壓在倒塌的瓦礫堆底下的（客機比較晚收到 propDie）：不放殘骸
    if (!p.body)
      for (const o of this.obstacles)
        if (
          o.rubble &&
          cx > o.box.min.x &&
          cx < o.box.max.x &&
          cz > o.box.min.z &&
          cz < o.box.max.z &&
          sh.y0 < o.top - 0.5
        ) {
          p.wreck = null;
          return null;
        }
    const wr = buildWreck(p, this.seed, STEP_H);
    // 放的高度：中央的地面（原本撐著它的東西不在了也一樣往下掉）；斜坡上往低的那一側放（不浮起來），
    // 但不掉下平台、甲板的邊緣（結構的瓦礫堆可以一路到最低的角）
    const gC = this.groundAt(cx, cz, sh.y0 + STEP_H);
    const lim = p.body ? Infinity : Math.max(1.2, wr.h * 0.8);
    let gy = gC;
    for (const [u, v] of [
      [-0.4, -0.4],
      [0.4, -0.4],
      [-0.4, 0.4],
      [0.4, 0.4],
    ]) {
      const g = this.groundAt(cx + (sh.x1 - sh.x0) * u, cz + (sh.z1 - sh.z0) * v, sh.y0 + STEP_H);
      if (g < gy && g >= gC - lim) gy = g;
    }
    // 長條的殘骸（防風牆、卡車、倒下的路燈與桅杆…）順著坡度傾斜（以前整塊放在同一個高度：斜坡上一端懸空 2～10 m；
    // 2026-11-13）。用殘骸模型自己的外框量兩端（倒下的桿子會伸出原本物件的範圍）；原本在平台、甲板上的：
    // 量到邊緣外（掉下去）的點不算，免得翻下去
    wr.group.updateMatrixWorld(true);
    const wb = _decorBox.setFromObject(wr.group);
    if (!p.body && !wb.isEmpty() && Math.max(wb.max.x - wb.min.x, wb.max.z - wb.min.z) > 4) {
      const onBox = gC > this.terrainHeight(cx, cz) + 0.3;
      const gAt = (x, z) => {
        const g = this.groundAt(x, z, sh.y0 + STEP_H);
        return onBox && g < gC - lim ? gC : g;
      };
      const x0 = cx + wb.min.x * 0.85,
        x1 = cx + wb.max.x * 0.85,
        z0 = cz + wb.min.z * 0.85,
        z1 = cz + wb.max.z * 0.85;
      const gx0 = gAt(x0, cz),
        gx1 = gAt(x1, cz),
        gz0 = gAt(cx, z0),
        gz1 = gAt(cx, z1);
      const T = WRECK_TILT;
      const sx = x1 - x0 > 1 ? (gx1 - gx0) / (x1 - x0) : 0,
        sz = z1 - z0 > 1 ? (gz1 - gz0) / (z1 - z0) : 0;
      wr.group.rotation.set(-clamp(Math.atan(sz), -T, T), 0, clamp(Math.atan(sx), -T, T));
      // 原點（中心）的高度：兩條地面線在中心的高度（偏一邊的模型照比例內插），不高過中心的地面
      const lx = x1 - x0 > 1 ? gx0 + (gx1 - gx0) * ((cx - x0) / (x1 - x0)) : gC,
        lz = z1 - z0 > 1 ? gz0 + (gz1 - gz0) * ((cz - z0) / (z1 - z0)) : gC;
      gy = Math.min(gC, (lx + lz) / 2);
    }
    wr.group.position.set(cx, gy, cz);
    this.scene.add(wr.group);
    this.meshes.push(wr.group); // 擋住鏡頭時淡出（fadeMeshes；殘骸不再受傷，但不能一直擋住視野）
    const box = (x, z, w, d, h) => ({
      kind: 'box',
      x,
      z,
      w,
      d,
      y: gy - 0.5,
      top: gy + h,
      group: wr.group,
      mats: [],
      box: new THREE.Box3(
        new THREE.Vector3(x - w / 2, gy - 0.5, z - d / 2),
        new THREE.Vector3(x + w / 2, gy + h, z + d / 2),
      ),
      wreck: p,
    });
    const ob = box(cx, cz, wr.w, wr.d, wr.h);
    if (p.body) ob.rubble = true; // 結構倒塌的瓦礫堆
    this.obstacles.push(ob);
    // 高出殘骸的斷口另外給碰撞（以前機甲會穿過去）
    const st = wr.stub;
    if (st && st.h > wr.h + 0.3) {
      const so = box(cx + st.x, cz + st.z, st.w, st.d, st.h);
      so.stub = true;
      this.obstacles.push(so);
      p.wreckStub = so;
    } else p.wreckStub = null;
    p.wreck = ob;
    return ob;
  }
  buildCorridor() {
    const c = this.corridor;
    if (!c) return;
    const half = c.len / 2 + 18;
    const L = [];
    const pts = (u) => {
      const out = [];
      for (let s = -half; s <= half; s += 2)
        out.push(this.corridorPoint(s, u).add(new THREE.Vector3(0, 0.06, 0)));
      return out;
    };
    const road = c.kind === 'road';
    for (const [u0, u1, color, rough, y] of road ? ROAD_STRIPS : RAIL_STRIPS) {
      const m = stripMesh(pts(u0), pts(u1), color, rough, y);
      this.scene.add(m);
      this.meshes.push(m);
    }
    // 公路中線標線／鐵路枕木：一個 InstancedMesh（地圖放大後數量很多）
    const P = road ? LANE_MARK : RAIL_TIE;
    const piece = corridorPiece(P);
    const n = Math.ceil((2 * half) / P.step);
    const im = new THREE.InstancedMesh(piece.geometry, piece.material, n);
    const o3 = new THREE.Object3D();
    let i = 0;
    for (let s = -half; s < half && i < n; s += P.step, i++) {
      const p = this.corridorPoint(s),
        t = this.corridorDir(s);
      o3.position.set(p.x, p.y + P.y, p.z);
      o3.rotation.set(0, Math.atan2(t.x, t.y), 0);
      o3.updateMatrix();
      im.setMatrixAt(i, o3.matrix);
    }
    im.count = i;
    im.receiveShadow = true;
    im.userData.noFade = true; // 貼在地面上，不擋鏡頭
    this.scene.add(im);
    this.meshes.push(im);
    // 隧道口：地圖兩端各一座（拱門＋門柱＋黑洞＋山體）
    for (const sgn of [-1, 1]) {
      const s = sgn * ((this.size / 2) * 0.86);
      const p = this.corridorPoint(s),
        t = this.corridorDir(s);
      const x = p.x,
        z = p.z,
        y = p.y;
      const g = this.theme.props ? buildThemeTunnel(this.theme.props) : buildTunnelPortal(this.theme.rock);
      g.position.set(x, y - 0.1, z);
      g.rotation.y = Math.atan2(t.x, t.y) + (sgn > 0 ? Math.PI : 0);
      this.scene.add(g);
      this.meshes.push(g);
      (this.tunnels = this.tunnels || []).push(g); // 隧道口（坍方：docs/destruction-design.md 第 6 期）
    }
    this.corridorHalf = half;
  }
  buildFeatures() {
    this.buildCorridor();
    if (this.theme.buildStructures) this.theme.buildStructures(this);
    const T = this.theme;
    const mats = deckMats();
    for (const f of this.features) {
      if (f.k === 'river_bridge') {
        for (let bpos of f.bridges) {
          {
            let tries = 0;
            while (tries++ < 12) {
              const cx0 = f.perp.x * f.off + f.dir.x * bpos,
                cz0 = f.perp.y * f.off + f.dir.y * bpos;
              let clear = true;
              for (const q of [-1, -0.5, 0, 0.5, 1])
                if (
                  this.onCorridor(
                    cx0 + f.dir.x * q * (f.deckW / 2 + 2 * G),
                    cz0 + f.dir.y * q * (f.deckW / 2 + 2 * G),
                    9 * G,
                  )
                )
                  clear = false;
              if (clear) break;
              bpos += (bpos < 0 ? -1 : 1) * 6 * G;
              if (Math.abs(bpos) > 52 * this.k) {
                bpos = NaN;
                break;
              }
            }
            if (isNaN(bpos)) continue;
          } // 橋梁避開公路／鐵路走廊
          const cx = f.perp.x * f.off + f.dir.x * bpos,
            cz = f.perp.y * f.off + f.dir.y * bpos;
          const rot = Math.abs(f.perp.x) > 0.5;
          const span = f.width + 8 * G;
          const deckY =
            Math.max(
              this.terrainHeight(cx + f.perp.x * (span / 2), cz + f.perp.y * (span / 2)),
              this.terrainHeight(cx - f.perp.x * (span / 2), cz - f.perp.y * (span / 2)),
            ) +
            0.3 * G;
          this.addDeck(cx, cz, rot ? span : f.deckW, rot ? f.deckW : span, deckY, 0.7 * G, !rot, mats);
          for (const s of [-1, 1])
            for (const q of [-1, 1]) {
              const px = cx + f.perp.x * s * f.width * 0.28 + f.dir.x * q * f.deckW * 0.35,
                pz = cz + f.perp.y * s * f.width * 0.28 + f.dir.y * q * f.deckW * 0.35;
              if (this.onCorridor(px, pz, 1)) continue;
              this.addPillar(px, pz, 0.6 * G, deckY - f.depth - 1.5 * G, deckY - 0.7 * G, mats.pillar);
            }
        }
      } else if (f.k === 'overpass') {
        const cx = f.perp.x * f.off + f.dir.x * f.center,
          cz = f.perp.y * f.off + f.dir.y * f.center;
        const rot = Math.abs(f.dir.x) > 0.5;
        const deckY = f.deckH + this.terrainHeight(cx, cz) * 0;
        const base = this.terrainHeight(cx, cz);
        const dy = Math.max(deckY, base + 5 * G, 7.2 * G);
        this.addDeck(cx, cz, rot ? f.span : f.deckW, rot ? f.deckW : f.span, dy, 0.8 * G, !rot, mats);
        const np = Math.floor(f.span / (12 * G));
        for (let i = 0; i <= np; i++) {
          const v = -f.span / 2 + 4 * G + (i * (f.span - 8 * G)) / np;
          for (const s of [-1, 1]) {
            const px = cx + f.dir.x * v + f.perp.x * s * f.deckW * 0.32,
              pz = cz + f.dir.y * v + f.perp.y * s * f.deckW * 0.32;
            if (this.onCorridor(px, pz, 1.5)) continue;
            this.addPillar(px, pz, 0.55 * G, this.terrainHeight(px, pz) - 0.5 * G, dy - 0.8 * G, mats.pillar);
          }
        }
      } else if (f.k === 'bunkers') {
        for (let i = 0; i < f.count; i++) {
          let x = rnd(-48 * this.k, 48 * this.k),
            z = rnd(-48 * this.k, 48 * this.k);
          const w = rnd(9, 14) * G,
            d = rnd(9, 14) * G;
          {
            let tr = 0;
            while (
              tr++ < 10 &&
              (Math.hypot(x, z) < 10 * G ||
                this.onCorridor(x, z, Math.max(w, d) * 0.72 + 2) ||
                this.isVoid(x, z) ||
                this.isReserved(x, z, Math.max(w, d) * 0.72) ||
                !this.slopeOK(x, z))
            ) {
              x = rnd(-48 * this.k, 48 * this.k);
              z = rnd(-48 * this.k, 48 * this.k);
            }
            if (tr > 10) continue;
          }
          const y0 = this.terrainHeight(x, z);
          const h = rnd(5, 6.5) * G;
          this.addDeck(x, z, w, d, y0 + h, 0.8 * G, false, mats);
          // 柱子各自從腳下的地面蓋起（以前一律從中心的地面高度：斜坡上低的那一側整根懸空；2026-11-13）
          for (const sx of [-1, 1])
            for (const sz of [-1, 1]) {
              const px = x + sx * (w / 2 - G),
                pz = z + sz * (d / 2 - G);
              this.addPillar(
                px,
                pz,
                0.5 * G,
                this.terrainHeight(px, pz) - 0.5 * G,
                y0 + h - 0.8 * G,
                mats.pillar,
              );
            }
          // one side wall for cover
          const side = RNG() < 0.5;
          const wm = mats.pillar.clone();
          wm.transparent = true;
          const ww = side ? w - 2 * G : 0.8 * G,
            wd = side ? 0.8 * G : d - 2 * G;
          const wx = x + (side ? 0 : (w / 2 - 0.4 * G) * (RNG() < 0.5 ? 1 : -1)),
            wz = z + (side ? (d / 2 - 0.4 * G) * (RNG() < 0.5 ? 1 : -1) : 0);
          // 牆的底部＝整面牆底下最低的地面再往下埋一點（以前從中心的地面高度：斜坡上懸空，打壞後的殘骸也浮著）；頂部照舊
          const wb = this.footMin(wx, wz, ww, wd) - 0.3 * G;
          const wh = y0 + h - 0.8 * G - wb;
          let wall;
          if (T.props) {
            wall = buildThemeWall(T.props, ww, wh, wd);
            wall.position.set(wx, wb + wh / 2, wz);
          } else wall = box(ww, wh, wd, wm, wx, wb + wh / 2, wz);
          this.scene.add(wall);
          this.meshes.push(wall);
          const bb = new THREE.Box3().setFromObject(wall);
          this.obstacles.push({
            kind: 'box',
            x: wall.position.x,
            z: wall.position.z,
            w: bb.max.x - bb.min.x,
            d: bb.max.z - bb.min.z,
            top: bb.max.y,
            y: bb.min.y,
            group: wall,
            mats: T.props ? propMats(wall) || fadeMatsOf(wall) : [wm],
            box: bb,
          });
          this.occluders.push(this.obstacles[this.obstacles.length - 1]);
        }
      } else if (f.k === 'platforms') {
        const pm = mat(0x7a7f88, { roughness: 0.8 });
        for (let i = 0; i < f.count; i++) {
          let x = rnd(-45 * this.k, 45 * this.k),
            z = rnd(-45 * this.k, 45 * this.k);
          const w = rnd(10, 18) * G,
            d = rnd(10, 18) * G,
            h = rnd(4, 7) * G;
          {
            let tr = 0;
            while (
              tr++ < 10 &&
              (Math.hypot(x, z) < 12 * G ||
                this.onCorridor(x, z, Math.max(w, d) * 0.72 + 8 * G) ||
                this.isVoid(x, z) ||
                this.isReserved(x, z, Math.max(w, d) * 0.72 + 4 * G))
            ) {
              x = rnd(-45 * this.k, 45 * this.k);
              z = rnd(-45 * this.k, 45 * this.k);
            }
            if (tr > 10) continue;
          }
          const y0 = this.terrainHeight(x, z);
          const m2 = pm.clone();
          m2.transparent = true;
          const sk = 0.5 * G; // 埋進地面
          // 底部＝整個平台底下最低的地面再埋 sk（以前從中心的地面高度：斜坡上低的一側懸空；2026-11-13），頂部照舊
          const top = y0 + h - sk,
            bot = Math.min(y0, this.footMin(x, z, w, d)) - sk,
            ph = top - bot;
          let g;
          if (T.props) {
            g = buildThemePlatform(T.props, w, ph, d);
            g.position.set(x, bot, z);
          } else g = box(w, ph, d, m2, x, bot + ph / 2, z);
          this.scene.add(g);
          this.meshes.push(g);
          const ob = {
            kind: 'box',
            x,
            z,
            w,
            d,
            top,
            y: bot,
            group: g,
            mats: T.props ? propMats(g) || fadeMatsOf(g) : [m2],
            box: new THREE.Box3(
              new THREE.Vector3(x - w / 2, bot, z - d / 2),
              new THREE.Vector3(x + w / 2, top, z + d / 2),
            ),
          };
          this.obstacles.push(ob);
          this.occluders.push(ob);
          // ramp: a tilted slab up to the platform (walkable via terrain-like ground function)
          const side = pick([
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]);
          const rl = h * 2.2;
          const rx = x + side[0] * (w / 2 + rl / 2),
            rz = z + side[1] * (d / 2 + rl / 2);
          const rw = side[0] ? rl : 6 * G,
            rd = side[1] ? rl : 6 * G;
          // 坡道的腳＝低端那一點的地面（以前用平台中心的地面高度：斜坡上坡道的腳懸空；2026-11-13）
          const ry0 =
            Math.min(this.terrainHeight(rx + (side[0] * rl) / 2, rz + (side[1] * rl) / 2), top - 0.5 * G) -
            sk;
          const ra = Math.atan2(top - ry0, rl);
          const rg = T.props ? buildThemeRamp(T.props, rw, rd) : box(rw, 0.4 * G, rd, pm, 0, 0, 0);
          rg.position.set(rx, (ry0 + top) / 2 - 0.2 * G, rz);
          rg.rotation.z = side[0] ? -side[0] * ra : 0;
          rg.rotation.x = side[1] ? side[1] * ra : 0;
          this.scene.add(rg);
          this.meshes.push(rg);
          this.ramps = this.ramps || [];
          this.ramps.push({
            x: rx,
            z: rz,
            w: rw,
            d: rd,
            side,
            y0: ry0,
            y1: top,
            len: rl,
            mesh: rg,
          });
        }
      }
    }
  }
  // 坡道高度；y 有值時，懸空的坡道（lift：多層地圖從平台接到上一層）只對站在坡面附近的機體算數
  rampHeight(x, z, y) {
    if (!this.ramps) return -1e9;
    let best = -1e9;
    for (const r of this.ramps) {
      if (Math.abs(x - r.x) > r.w / 2 || Math.abs(z - r.z) > r.d / 2) continue;
      const along = r.side[0] ? (r.x - x) * r.side[0] : (r.z - z) * r.side[1];
      const t = clamp((along + r.len / 2) / r.len, 0, 1);
      const h = lerp(r.y0, r.y1, t);
      if (r.lift && y !== undefined && y < h - 1.2 * MS) continue;
      best = Math.max(best, h);
    }
    return best;
  }
  ceiling(x, z, y, h) {
    let c = 1e9;
    for (const o of this.obstacles) {
      if (o.kind !== 'box' || !o.deck) continue;
      if (Math.abs(x - o.x) < o.w / 2 && Math.abs(z - o.z) < o.d / 2 && y < o.y - 0.2 * MS && y + h > o.y)
        c = Math.min(c, o.y);
    }
    return c;
  }
  // ground height incl. box tops for an entity at (x,z) currently at height y
  // 障礙物的空間格子：每個障礙物登記到它的外框（加寬 OG_PAD）碰到的格子，格子裡照陣列的順序。
  // 障礙物陣列換掉、數量或最後一個改變時重建（增減障礙物的地方很多，不一一通知；原地改位置的沒有）
  obsGrid() {
    const L = this.obstacles,
      last = L[L.length - 1];
    const G = this._og;
    if (G && G.ref === L && G.n === L.length && G.last === last) return G;
    const m = new Map();
    let bad = false;
    for (const o of L) {
      const hw = o.kind === 'box' ? o.w / 2 : o.r,
        hd = o.kind === 'box' ? o.d / 2 : o.r;
      if (!(hw >= 0 && hd >= 0) || !isFinite(o.x) || !isFinite(o.z)) {
        bad = true; // 認不得的形狀：查詢一律退回整個陣列
        continue;
      }
      const x0 = Math.floor((o.x - hw - OG_PAD) / OG_C),
        x1 = Math.floor((o.x + hw + OG_PAD) / OG_C),
        z0 = Math.floor((o.z - hd - OG_PAD) / OG_C),
        z1 = Math.floor((o.z + hd + OG_PAD) / OG_C);
      for (let i = x0; i <= x1; i++)
        for (let j = z0; j <= z1; j++) {
          const k = i * 65536 + j;
          let c = m.get(k);
          if (!c) m.set(k, (c = []));
          c.push(o);
        }
    }
    return (this._og = { ref: L, n: L.length, last, m, bad });
  }
  // 點 (x, z) 半徑 r 以內可能碰到的障礙物（照陣列的順序）；r 超過 OG_PAD 時是整個陣列
  obsAt(x, z, r = 0) {
    const G = this.obsGrid();
    if (G.bad || r > OG_PAD) return this.obstacles;
    return G.m.get(Math.floor(x / OG_C) * 65536 + Math.floor(z / OG_C)) || OG_EMPTY;
  }
  groundAt(x, z, y) {
    let g = Math.max(this.terrainHeight(x, z), this.rampHeight(x, z, y));
    for (const o of this.obsAt(x, z, 0.3 * MS)) {
      if (o.kind !== 'box') continue;
      if (
        Math.abs(x - o.x) < o.w / 2 + 0.3 * MS &&
        Math.abs(z - o.z) < o.d / 2 + 0.3 * MS &&
        y >= o.top - STEP_H &&
        o.top > g
      )
        g = o.top;
    }
    return g;
  }
  // horizontal collision push-out; returns [x,z]
  // soft：玩家機體可以超出作戰區域到 limOut（MechEntity.oobPush 推回）
  collide(x, z, y, r, soft = false) {
    // 只看所在那一格的障礙物；被推出那一格時再用新的那一格檢查一次（推出去之後碰到的鄰居）
    const x0 = x,
      z0 = z;
    const L0 = this.obsAt(x, z, r);
    for (let pass = 0; pass < 2; pass++) {
      const L = pass ? this.obsAt(x, z, r) : L0;
      if (
        pass &&
        (L === L0 ||
          (Math.floor(x / OG_C) === Math.floor(x0 / OG_C) && Math.floor(z / OG_C) === Math.floor(z0 / OG_C)))
      )
        break;
      for (const o of L) {
        if (o.kind === 'box') {
          if (y >= o.top - STEP_H) continue;
          if (o.deck && y + 3.2 * MS < o.y) continue; // 從甲板底下通過（舊尺度的機甲身高 3.2 m）
          if (o.deck && y < o.y - 0.2 * MS) continue;
          const hw = o.w / 2 + r,
            hd = o.d / 2 + r;
          const dx = x - o.x,
            dz = z - o.z;
          if (Math.abs(dx) < hw && Math.abs(dz) < hd) {
            const px = hw - Math.abs(dx),
              pz = hd - Math.abs(dz);
            if (px < pz) x = o.x + Math.sign(dx || 1) * hw;
            else z = o.z + Math.sign(dz || 1) * hd;
          }
        } else {
          if (o.top !== undefined && y >= o.top - STEP_H) continue;
          const dx = x - o.x,
            dz = z - o.z;
          const d = Math.hypot(dx, dz);
          const rr = o.r + r;
          if (d < rr) {
            const k = d < 1e-3 ? 1 : rr / d;
            x = o.x + dx * k;
            z = o.z + dz * k;
          }
        }
      }
    }
    // 場地邊界：電腦機體限制在作戰區域（一般任務 ±lim）、玩家可以再往外 OOB_BUF（±limOut）
    const Z = this.zone,
      b = soft ? OOB_BUF : 0;
    x = clamp(x, Math.max(Z[0] - b, -this.limOut), Math.min(Z[1] + b, this.limOut));
    z = clamp(z, Math.max(Z[2] - b, -this.limOut), Math.min(Z[3] + b, this.limOut));
    // 回傳共用的陣列（每格呼叫很多次，不要每次配置；呼叫端一律立刻解構，不要留著它）
    const out = this._col || (this._col = [0, 0]);
    out[0] = x;
    out[1] = z;
    return out;
  }
  // 線段 a → b 碰到還在的可破壞物件（命中形狀加寬 pad）：點取樣的視線（rayClear／losClear）補上細的柱子與薄牆
  propBlocks(a, b, pad = 0) {
    return !!this.propFirst(a, _seg.subVectors(b, a), pad);
  }
  // 線段 a → a+v 第一個碰到的可破壞物件：[物件, t（0～1）]，沒有時 null（光束停在物件上）
  propFirst(a, v, pad = 0) {
    if (!this.props) return null;
    let best = null,
      bt = 2;
    for (const p of this.props) {
      if (p.dead || !p.shape) continue;
      const t = shapeSegT(p.shape, a, v, pad);
      if (t >= 0 && t < bt) {
        best = p;
        bt = t;
      }
    }
    return best ? [best, bt] : null;
  }
  // projectile vs world
  hitsWorld(p) {
    // 地圖外用遠景地形的高度（山脊、斷崖）
    const S = this.size / 2;
    const th =
      Math.abs(p.x) > S || Math.abs(p.z) > S ? this.farHeight(p.x, p.z) : this.terrainHeight(p.x, p.z);
    if (p.y < th || p.y < this.rampHeight(p.x, p.z, p.y)) return true;
    for (const o of this.obsAt(p.x, p.z)) {
      if (o.prop && o.prop.shape && !o.prop.dead) {
        // 可破壞物件：和子彈、光束相同的命中形狀（world/prop-hit.js；細的柱子也算）
        if (shapeContains(o.prop.shape, p)) return true;
      } else if (o.kind === 'box') {
        if (Math.abs(p.x - o.x) < o.w / 2 && Math.abs(p.z - o.z) < o.d / 2 && p.y < o.top && p.y > o.y)
          return true;
      } else if (
        o.r > 1 &&
        Math.hypot(p.x - o.x, p.z - o.z) < o.r * 0.9 &&
        p.y < this.terrainHeight(o.x, o.z) + o.r * 2
      )
        return true;
    }
    return false;
  }
  // near：在這一點附近找（增援波次的進入地點，找不到時範圍慢慢放大）；minD：離 minDistFrom 至少幾公尺
  spawnPoint(minDistFrom, others, near = null, minD = 28 * DS) {
    const Z = this.zone,
      R = 50 * this.k,
      M = 4 * MS;
    for (let t = 0; t < (near ? 60 : 40); t++) {
      let x, z;
      if (near) {
        const r = (6 + t * 0.6) * DS;
        x = clamp(near.x + rnd(-r, r), Z[0] + M, Z[1] - M);
        z = clamp(near.z + rnd(-r, r), Z[2] + M, Z[3] - M);
      } else {
        x = rnd(Math.max(-R, Z[0] + M), Math.min(R, Z[1] - M));
        z = rnd(Math.max(-R, Z[2] + M), Math.min(R, Z[3] - M));
      }
      if (this.onCorridor(x, z, 2 * MS) || this.offLimits(x, z)) continue;
      if (!this.slopeOK(x, z)) continue;
      if (this.isVoid(x, z) || this.isReserved(x, z, 3 * MS)) continue;
      if (Math.hypot(x - minDistFrom.x, z - minDistFrom.z) < minD) continue;
      if (others.some((o) => Math.hypot(o.x - x, o.z - z) < 6 * MS)) continue;
      if (
        this.obstacles.some((o) =>
          o.kind === 'box'
            ? Math.abs(x - o.x) < o.w / 2 + 1.5 * MS && Math.abs(z - o.z) < o.d / 2 + 1.5 * MS
            : Math.hypot(x - o.x, z - o.z) < o.r + 1.5 * MS,
        )
      )
        continue;
      return { x, z };
    }
    const sp = this.safePoint();
    return { x: sp.x, z: sp.z };
  }
  // 換天候（自訂關卡的觸發器；只有外觀）
  setWeather(wk) {
    if (this.weather) this.weather.dispose();
    this.weather = wk && wk !== 'none' ? new Weather(this.scene, wk, this.theme) : null;
  }
  // 水面高度（關卡編輯器）：沒有水面時建立
  setWaterLevel(y) {
    const W0 = this.theme.water || { color: 0x37586a, opacity: 0.85, rough: 0.12 };
    this.theme = { ...this.theme, water: { ...W0, level: y } };
    if (this.waterMesh) this.waterMesh.position.y = this.cloud ? y - 2 * G : y;
    else this.addWater(this.theme.water);
    if (this.cloud) this.cloud.level = y;
  }
  dispose() {
    if (this.weather) this.weather.dispose();
    disposeWater(this.waterMesh);
    if (this._fading) for (const f of this._fading.values()) f.m.dispose();
    for (const m of [...this.meshes, ...(this.pillarHide || [])]) {
      this.scene.remove(m);
      m.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
      });
    }
  }
  // 作戰區域的邊界線：貼在地面上的發光線（往外有一條淡出的光暈帶、流動的斜紋），只在機體附近亮起，
  // 離邊界越近越亮；不立牆（2026-10-28 使用者定案：拿掉大片的警示光幕，改成地面線＋HUD 提示 game/hud.js 的 zoneEdgeHud）
  buildBoundary() {
    this.bLine = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        uniforms: {
          uP: { value: new THREE.Vector3(0, -1e6, 0) },
          uR: { value: BOUND_R },
          uK: { value: 0 },
          uT: { value: 0 },
          uC: { value: new THREE.Color(0xff7a28) },
        },
        vertexShader: `attribute vec2 aB; varying vec2 vB; varying vec3 vW;
          void main() {
            vec4 w = modelMatrix * vec4(position, 1.0);
            vW = w.xyz; vB = aB;
            gl_Position = projectionMatrix * viewMatrix * w;
          }`,
        fragmentShader: `uniform vec3 uP; uniform float uR; uniform float uK; uniform float uT; uniform vec3 uC;
          varying vec2 vB; varying vec3 vW;
          void main() {
            float near = 1.0 - smoothstep(uR * 0.3, uR, distance(vW.xz, uP.xz));
            if (near <= 0.0) discard;
            float s = vB.y; // 0＝內側、0.2＝邊界線、1＝外側
            float core = 1.0 - smoothstep(0.0, 0.07, abs(s - 0.2));
            float glow = s > 0.2 ? pow(1.0 - (s - 0.2) / 0.8, 2.0) * 0.35 : (s / 0.2) * 0.2;
            float dash = step(0.5, fract(vB.x / ${(8 * DS).toFixed(1)} + s * 0.6 - uT * 0.5));
            float a = (core * (0.55 + 0.45 * dash) + glow * (0.6 + 0.4 * dash)) * near * (0.3 + 0.7 * uK);
            gl_FragColor = vec4(uC * (0.9 + core * 0.8), a);
          }`,
        transparent: true,
        depthWrite: false,
        // 加色，但不寫 alpha（後處理以 alpha 分辨材質種類：描線、動態模糊；同 render/hangar.js 的 keepAlpha）
        blending: THREE.CustomBlending,
        blendSrc: THREE.SrcAlphaFactor,
        blendDst: THREE.OneFactor,
        blendSrcAlpha: THREE.ZeroFactor,
        blendDstAlpha: THREE.OneFactor,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    const m = this.bLine;
    m.frustumCulled = false;
    m.renderOrder = 3;
    m.visible = false;
    m.userData.noFade = true;
    m.userData.helper = true;
    m.userData.noAO = true; // SSAO 的法線不畫它（style/pipeline.js 的 renderNormals）
    m.raycast = () => {};
    this.scene.add(m);
    this.meshes.push(m);
  }
  // 作戰區域（矩形）的四條邊：每條沿著邊取樣、貼地形，往內 1 格、往外 5 格寬的帶狀網格
  boundaryGeom() {
    const Z = this.zone,
      step = 3 * DS,
      w0 = 0.8 * DS,
      w1 = 3.2 * DS,
      lift = 0.35 * DS;
    const pos = [],
      ab = [],
      idx = [];
    // 每條邊：起點、方向、往外的法線
    const E = [
      [Z[0], Z[2], 0, 1, -1, 0],
      [Z[1], Z[2], 0, 1, 1, 0],
      [Z[0], Z[2], 1, 0, 0, -1],
      [Z[0], Z[3], 1, 0, 0, 1],
    ];
    for (const [x0, z0, dx, dz, nx, nz] of E) {
      const len = dx ? Z[1] - Z[0] : Z[3] - Z[2];
      const n = Math.max(1, Math.ceil(len / step));
      const v0 = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const u = (len * i) / n;
        for (const [o, t] of [
          [-w0, 0],
          [0, 0.2],
          [w1, 1],
        ]) {
          // 線心（0.2）在邊界上，內外兩條邊依寬度換算
          const x = x0 + dx * u + nx * o,
            z = z0 + dz * u + nz * o;
          pos.push(x, this.terrainHeight(x, z) + lift, z);
          ab.push(u, t);
        }
        if (i < n) {
          const a = v0 + i * 3,
            b = a + 3;
          idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aB', new THREE.Float32BufferAttribute(ab, 2));
    g.setIndex(idx);
    return g;
  }
  // 每格：機體的位置（p）決定亮的範圍；作戰區域改變（分段開放）時重建網格
  updateBoundary(p) {
    const m = this.bLine;
    if (!m || !p) return;
    const key = this.zone.join(',');
    if (this.bZone !== key) {
      this.bZone = key;
      m.geometry.dispose();
      m.geometry = this.boundaryGeom();
    }
    const Z = this.zone;
    const d = Math.min(p.x - Z[0], Z[1] - p.x, p.z - Z[2], Z[3] - p.z);
    const k = clamp(1 - d / BOUND_R, 0, 1);
    m.visible = d < BOUND_R;
    const U = m.material.uniforms;
    U.uP.value.copy(p);
    U.uK.value = k * k;
    U.uT.value = (performance.now() / 1000) % 1000;
  }
  // fade objects between camera and player
  // 鏡頭和機體之間的物件淡出；pts＝機體上要看得到的點（頭、中心、腳，沒給時只用 playerPos）。
  // 回傳有沒有物件擋住（給機體的透視輪廓用）
  updateOcclusion(camPos, playerPos, dt, pts) {
    this.updateBoundary(playerPos);
    // 每格呼叫：射線物件、材質表重複使用，不每格配置（GC，docs/perf-threejs-upgrade.md）
    const P = pts || [playerPos];
    const rays = this._occR || (this._occR = []);
    while (rays.length < P.length) rays.push({ ray: new THREE.Ray(), dist: 0 });
    for (let i = 0; i < P.length; i++) {
      const R = rays[i];
      R.ray.origin.copy(camPos);
      R.ray.direction.copy(P[i]).sub(camPos).normalize();
      R.dist = camPos.distanceTo(P[i]);
    }
    const nR = P.length;
    const tmp = this._occV || (this._occV = new THREE.Vector3());
    let any = false;
    // 由這裡管理淡出的群組與材質（fadeMeshes 略過這些；其他半透明的由 fadeMeshes 處理）：遮擋物的數量改變時才重建
    const og = this._occG || (this._occG = new Map());
    this._occK = (this._occK || 0) + 1;
    if (this._occGN !== this.occluders.length || this._occK % 120 === 0) {
      this._occGN = this.occluders.length;
      og.clear();
      for (const o of this.occluders) if (o.box && o.group && o.mats.length) og.set(o.group, o.mats);
    }
    // 每個材質的目標不透明度：記在材質上（這一格的戳記＋目標），同一個材質被好幾個物件共用時取最透明的
    const stamp = (this._occS = (this._occS || 0) + 1);
    const mats = this._occM || (this._occM = []);
    mats.length = 0;
    for (const o of this.occluders) {
      if (!o.box) continue;
      // 判定框：碰撞的方塊＋模型實際的外框（橋面上的結構、高出碰撞的部分擋住時也要淡出；fadeMeshes 不管這些群組）
      if (!o.fbox) {
        o.fbox = o.box.clone();
        if (o.group && o.group.parent) o.fbox.union(new THREE.Box3().setFromObject(o.group));
      }
      let hit = false;
      for (let i = 0; i < nR; i++) {
        const R = rays[i];
        const r = R.ray.intersectBox(o.fbox, tmp);
        if (r && r.distanceTo(camPos) < R.dist - MS) {
          hit = true;
          break;
        }
      }
      if (hit) any = true;
      if (hit && this.pool && o.group) this.poolOut(o.group); // 合併池裡的：拿出來才淡得了
      // 擋住的那個優先
      const target = hit ? fadeTo(o.fbox) : 1;
      for (const m of o.mats)
        if (m._occS !== stamp) {
          m._occS = stamp;
          m._occTo = target;
          mats.push(m);
        } else if (target < m._occTo) m._occTo = target;
    }
    for (const m of mats) {
      m.opacity = lerp(m.opacity, m._occTo, Math.min(1, dt * 10));
      m.depthWrite = m.opacity > 0.9;
    }
    this.poolTick();
    return any;
  }
  // 沒有登記成 occluders 的網格（大型結構、地標、起重機、支柱、殘骸、倒下的結構…）擋住機體時，各自換成可以淡出的材質副本，
  // 不再擋住、淡回原本的不透明度後還原原本的材質。射線每 3 格打一次；地形、水面、岩頂、遠景與 InstancedMesh 略過。
  // 半透明材質只略過 updateOcclusion 管理的（occluders 的群組）與特效類的（很淡、加色）：可以淡出的材質（fadeMat）沒登記
  // 成 occluders 時（岩石、橋墩、研究特區的高塔、倒下的結構…）以前會被當成已經處理而永遠不淡出。
  // 用群組判斷、不用材質：同一個材質可能也被別的 occluder 用到（那個沒擋住時這個就永遠不淡出）。回傳有沒有網格擋住
  fadeMeshes(camPos, pts, dt) {
    const rc = this._rc || (this._rc = new THREE.Raycaster());
    const last = this.meshes[this.meshes.length - 1];
    const key = this.meshes.length + ':' + (last ? last.id : 0);
    if (!this._occCands || this._occN !== key) {
      this._occN = key; // 之後加進來的網格（地標等）也算
      this._occCands = this.meshes.filter(
        (m) => m !== this.terrainMesh && m !== this.waterMesh && !m.userData.noFade,
      );
    }
    // 每格只打一條射線（輪流檢查 pts 的各點），結果記在各點自己的集合、合併成 _fadeHit；以前每 3 格一次打全部，
    // 打的那一格在平台很多的地圖（grid086）要 5～20 ms，畫面一格順一格卡（docs/perf-threejs-upgrade.md 第 6 期）
    const n = pts.length;
    const hp =
      this._fadeHitP && this._fadeHitP.length === n
        ? this._fadeHitP
        : (this._fadeHitP = pts.map(() => new Set()));
    this._fadeN = (this._fadeN || 0) + 1;
    const first = !this._fadeHit;
    const floor = Math.min(...pts.map((p) => p.y)) - 0.1 * MS; // 比腳底低的命中是地面上的東西（道路、貼花），不淡出
    for (let k = 0; k < n; k++)
      if (first || k === this._fadeN % n) this.fadeRay(rc, camPos, pts[k], floor, hp[k]);
    const hit = this._fadeHit || (this._fadeHit = new Set());
    hit.clear();
    for (const h of hp) for (const o of h) hit.add(o);
    // 合併池裡的（原本的網格隱藏著）：拿出來才淡得了
    if (this.poolOf)
      for (const o of hit) {
        const g = this.poolOf.get(o);
        if (g) this.poolOut(g);
      }
    const act = this._fading || (this._fading = new Map());
    for (const o of this._fadeHit)
      if (!act.has(o)) {
        // 淡出用的半透明複本：每個網格一份、留著重複使用（不釋放）。釋放的話 three.js 會連同半透明的著色器程式
        // 一起刪掉，下次再擋住又要現場編譯（約 0.15 秒的停頓；docs/perf-threejs-upgrade.md 第 5 期）
        const fc = this._fadeCopy || (this._fadeCopy = new WeakMap());
        let c = fc.get(o);
        if (!c || c.src !== o.material) fc.set(o, (c = { src: o.material, m: o.material.clone() }));
        else c.m.copy(o.material); // 原本的材質之後可能改過顏色
        const m = c.m;
        m.transparent = true;
        act.set(o, {
          orig: o.material,
          m,
          op0: o.material.opacity,
          to: fadeTo(new THREE.Box3().setFromObject(o)),
        });
        o.material = m;
      }
    for (const [o, f] of act) {
      const on = this._fadeHit.has(o);
      f.m.opacity = lerp(f.m.opacity, on ? Math.min(f.to, f.op0) : f.op0, Math.min(1, dt * 10));
      f.m.depthWrite = f.m.opacity > 0.9 * f.op0;
      if (!on && f.m.opacity > f.op0 - 0.02) {
        o.material = f.orig;
        act.delete(o);
      }
    }
    return this._fadeHit.size > 0;
  }
  // 鏡頭 → 點 p 的一條射線：擋住的網格放進 hit（先清空）。候選的群組先用快取的外框篩選（射線沒穿過外框的不逐一
  // 檢查三角形），命中結果用同一個陣列（不每次配置）
  fadeRay(rc, camPos, p, floor, hit) {
    hit.clear();
    const dir = _fdir.copy(p).sub(camPos);
    const dist = dir.length();
    rc.set(camPos, dir.normalize());
    rc.far = dist - 0.8 * MS;
    if (rc.far <= 0) return;
    const out = this._fadeOut || (this._fadeOut = []);
    const cands = this._occCands;
    // 外框每格輪流更新一部分（倒下、被推動的結構）；群組移動了（根的矩陣改變）時立刻重算
    const nb = cands.length;
    for (let k = 0; k < 12 && nb; k++)
      this.occBox(cands[(this._occBi = ((this._occBi || 0) + 1) % nb)], true);
    for (const root of cands) {
      if (!root.visible || !root.parent) continue;
      const b = this.occBox(root);
      if (!b || !rc.ray.intersectBox(b, _fpt) || _fpt.distanceTo(camPos) > rc.far) continue;
      out.length = 0;
      rc.intersectObject(root, true, out);
      for (const h of out) {
        const o = h.object;
        if (!o.isMesh || o.isInstancedMesh || !o.visible || h.point.y < floor) continue;
        const f = this._fading && this._fading.get(o);
        const m = o.material;
        if (
          !f &&
          (!m ||
            Array.isArray(m) ||
            (m.transparent &&
              (m.opacity < 0.5 || m.blending !== THREE.NormalBlending || this.occOwned(o, m))))
        )
          continue;
        hit.add(o);
      }
    }
    out.length = 0;
  }
  // 候選群組的世界外框（快取；根的矩陣改變或 force 時重算，稍微加寬）
  occBox(root, force = false) {
    const C = this._occBoxes || (this._occBoxes = new WeakMap());
    let c = C.get(root);
    const e = root.matrixWorld.elements;
    if (!c) C.set(root, (c = { b: new THREE.Box3(), k: NaN, k2: 0, k3: 0, k4: 0 }));
    else if (!force && c.k === e[0] && c.k2 === e[12] && c.k3 === e[13] && c.k4 === e[14])
      return c.empty ? null : c.b;
    c.k = e[0];
    c.k2 = e[12];
    c.k3 = e[13];
    c.k4 = e[14];
    c.b.setFromObject(root);
    c.empty = c.b.isEmpty();
    if (!c.empty) c.b.expandByScalar(0.2 * MS);
    return c.empty ? null : c.b;
  }
  // 網格 o 的材質 m 由 updateOcclusion 淡出（屬於 occluders 的群組，而且在它登記的材質清單裡）
  occOwned(o, m) {
    const og = this._occG;
    if (!og || !og.size) return false;
    for (let a = o; a && a !== this.scene; a = a.parent) {
      const L = og.get(a);
      if (L) return L.includes(m);
    }
    return false;
  }
  // 線段 a→b 是否被地形擋住（鏡頭用；取樣檢查）
  terrainBlocks(a, b, n = 16) {
    for (let i = 1; i < n; i++) {
      const t = i / n;
      const x = a.x + (b.x - a.x) * t,
        y = a.y + (b.y - a.y) * t,
        z = a.z + (b.z - a.z) * t;
      if (this.terrainHeight(x, z) > y - 0.3 * MS) return true;
    }
    return false;
  }
  // 視線（敵人 AI 的感知，game/ai-director.js）：地形＋障礙物（方塊以外框、圓柱以垂直圓柱）擋住 a→b 時為 true；
  // 方塊略縮 0.85 倍，邊角擦過不算擋住；細的柱子（半徑 1 m 以下）不擋
  losBlocked(a, b) {
    if (this.terrainBlocks(a, b, 12)) return true;
    if (this.losHook && this.losHook(a, b)) return true; // 煙霧（game/hazards2.js 的區域效果）
    if (this.losHook2 && this.losHook2(a, b)) return true; // Boss 改版的煙霧與蒸氣（game/boss-field.js）
    const dx = b.x - a.x,
      dy = b.y - a.y,
      dz = b.z - a.z;
    const minX = Math.min(a.x, b.x),
      maxX = Math.max(a.x, b.x),
      minZ = Math.min(a.z, b.z),
      maxZ = Math.max(a.z, b.z);
    for (const o of this.obstacles) {
      if (o.kind === 'box') {
        const hw = (o.w / 2) * 0.85,
          hd = (o.d / 2) * 0.85;
        if (o.x + hw < minX || o.x - hw > maxX || o.z + hd < minZ || o.z - hd > maxZ) continue;
        // 線段與外框的 slab 測試
        let t0 = 0,
          t1 = 1;
        const lo = [o.x - hw, o.y === undefined ? -1e9 : o.y, o.z - hd],
          hi = [o.x + hw, o.top, o.z + hd],
          p = [a.x, a.y, a.z],
          v = [dx, dy, dz];
        let hit = true;
        for (let k = 0; k < 3 && hit; k++) {
          if (Math.abs(v[k]) < 1e-6) {
            if (p[k] < lo[k] || p[k] > hi[k]) hit = false;
          } else {
            let ta = (lo[k] - p[k]) / v[k],
              tb = (hi[k] - p[k]) / v[k];
            if (ta > tb) [ta, tb] = [tb, ta];
            t0 = Math.max(t0, ta);
            t1 = Math.min(t1, tb);
            if (t0 > t1) hit = false;
          }
        }
        if (hit) return true;
      } else if (o.r > 1) {
        if (o.x + o.r < minX || o.x - o.r > maxX || o.z + o.r < minZ || o.z - o.r > maxZ) continue;
        const L2 = dx * dx + dz * dz;
        const t = L2 > 1e-6 ? clamp(((o.x - a.x) * dx + (o.z - a.z) * dz) / L2, 0, 1) : 0;
        const cx = a.x + dx * t - o.x,
          cz = a.z + dz * t - o.z;
        if (cx * cx + cz * cz > o.r * o.r * 0.8) continue;
        const top = o.top !== undefined ? o.top : this.terrainHeight(o.x, o.z) + o.r * 2;
        if (a.y + dy * t < top) return true;
      }
    }
    return false;
  }
}
