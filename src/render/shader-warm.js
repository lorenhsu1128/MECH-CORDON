// 著色器預熱的「學習」（docs/perf-threejs-upgrade.md）：
// three.js 要等網格第一次畫到才編譯著色器，風格著色器在 Windows 上一個變體要 0.2～0.4 秒，畫面整個停住。
// 新地圖第一次算繪前 Game.shaderWarm 以 renderer.compile 編好場景裡現有的東西；之後才出現的（碎片、殘骸、增援、
// 特效）在任務中第一次出現時記下它的變體（程式的參數：貼圖、頂點色、雙面、蒙皮、instancing…，不含光源與霧，
// 那些跟著場景），存在 localStorage；下次載入地圖時以假網格把記下的變體也編好。
// 只記風格著色器（MeshStandardMaterial／MeshPhysicalMaterial，onBeforeCompile 呼叫 noteStyleVariant）。

const KEY = 'rubicon_shader_warm2'; // r187 的參數名稱（r128 時的紀錄 rubicon_shader_warm 不再用）
const MAX = 96;
// 變體的欄位（three.js r187 WebGLPrograms.getParameters 的名稱）
const FIELDS = [
  'instancing',
  'instancingColor',
  'batching',
  'skinning',
  'map',
  'normalMap',
  'normalMapObjectSpace',
  'emissiveMap',
  'roughnessMap',
  'metalnessMap',
  'alphaMap',
  'aoMap',
  'vertexColors',
  'vertexAlphas',
  'vertexTangents',
  'doubleSided',
  'flipSided',
  'alphaTest',
  'alphaToCoverage',
  'premultipliedAlpha',
  'decodeVideoTexture',
];
// 半透明（r187 的程式參數 opaque＝false）：淡出的遮擋物、拋出的碎塊、受損掉板都是即時複製的半透明材質，
// 也是另一個變體；紀錄裡寫成 transparent: 1
const TRANSP = 'transparent';

export const WARM = {
  rec: false, // Game.renderMain 畫任務場景的期間為 true：只記任務中的
  list: null,
  dirty: false,
};

function load() {
  if (WARM.list) return WARM.list;
  WARM.list = [];
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (Array.isArray(a)) WARM.list = a.filter((s) => typeof s === 'string').slice(0, MAX);
  } catch (e) {
    /* 壞掉的紀錄：重來 */
  }
  return WARM.list;
}

// p：onBeforeCompile 收到的程式參數；mat：材質
export function noteStyleVariant(p, mat) {
  // 貼花與 MeshPhysicalMaterial 不記（r128 的標準材質的 shaderID 也是 'physical'，所以看材質本身）
  if (!WARM.rec || !p || mat.isMeshPhysicalMaterial || p.customProgramCacheKey !== 'rubicon-style-2') return;
  const d = {};
  for (const k of FIELDS) if (p[k]) d[k] = p[k];
  if (p.opaque === false) d[TRANSP] = 1;
  const s = JSON.stringify(d);
  const L = load();
  const i = L.indexOf(s);
  if (i === 0) return;
  if (i > 0) L.splice(i, 1);
  L.unshift(s);
  if (L.length > MAX) L.length = MAX;
  WARM.dirty = true;
}

// 有新的紀錄時寫回（呼叫端在不忙的時候呼叫）
export function saveWarm() {
  if (!WARM.dirty) return;
  WARM.dirty = false;
  try {
    localStorage.setItem(KEY, JSON.stringify(load()));
  } catch (e) {
    /* 存不下就算了 */
  }
}

const TEX = new Map();
function dummyTex() {
  const k = 0;
  let t = TEX.get(k);
  if (!t) {
    t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    TEX.set(k, t);
  }
  return t;
}

let GEO = null;
function baseGeo() {
  if (!GEO) GEO = new THREE.BoxGeometry(0.01, 0.01, 0.01);
  return GEO;
}

// 照一筆紀錄做一個假網格（不加進場景，只給 renderer.compile 走訪）
function dummy(d) {
  let geo = baseGeo();
  if (d.vertexColors || d.skinning) {
    geo = geo.clone();
    const n = geo.attributes.position.count;
    if (d.vertexColors) {
      const sz = d.vertexAlphas ? 4 : 3;
      geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * sz).fill(1), sz));
    }
    if (d.skinning) {
      geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
      const w = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) w[i * 4] = 1;
      geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    }
  }
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff });
  if (d.map) m.map = dummyTex();
  if (d.normalMap) {
    m.normalMap = dummyTex();
    if (d.normalMapObjectSpace) m.normalMapType = THREE.ObjectSpaceNormalMap;
  }
  if (d.emissiveMap) m.emissiveMap = dummyTex();
  if (d.roughnessMap) m.roughnessMap = dummyTex();
  if (d.metalnessMap) m.metalnessMap = dummyTex();
  if (d.alphaMap) m.alphaMap = dummyTex();
  if (d.aoMap) m.aoMap = dummyTex();
  if (d.vertexColors) m.vertexColors = true;
  if (d.doubleSided) m.side = THREE.DoubleSide;
  else if (d.flipSided) m.side = THREE.BackSide;
  if (d.alphaTest) m.alphaTest = d.alphaTest;
  if (d.premultipliedAlpha) m.premultipliedAlpha = true;
  if (d[TRANSP]) m.transparent = true;
  let o;
  if (d.skinning) {
    o = new THREE.SkinnedMesh(geo, m);
    const b = new THREE.Bone();
    o.add(b);
    o.bind(new THREE.Skeleton([b]));
  } else if (d.instancing) {
    o = new THREE.InstancedMesh(geo, m, 1);
    if (d.instancingColor) o.setColorAt(0, new THREE.Color(1, 1, 1));
  } else o = new THREE.Mesh(geo, m);
  return o;
}

// 記下的變體＋額外的材質（SSAO 法線的蒙皮版、InstancedMesh 版）各一個假網格，放在一個群組裡
export function warmGroup(extra = []) {
  const g = new THREE.Group();
  for (const s of load()) {
    try {
      g.add(dummy(JSON.parse(s)));
    } catch (e) {
      /* 不認得的紀錄略過 */
    }
  }
  for (const m of extra) {
    if (!m) continue;
    g.add(m.skinning ? dummy({ skinning: true }) : dummy({ instancing: true }));
    g.children[g.children.length - 1].material = m;
  }
  return g;
}

// 場景裡現有的風格材質的「半透明版」各一個（第 5 期，docs/perf-threejs-upgrade.md）：
// 鏡頭遮擋的淡出（World.fadeMeshes）、可破壞物件拋出的碎塊（destruct.js 的 propFling）、受損掉板（foe-damage.js）
// 都在任務中才複製材質並設成半透明，r187 的 opaque 是程式的參數，第一次出現就要現場編譯（Windows 上約 0.15 秒）。
// 依變體去重（同一個變體只要一個），用原本的幾何（頂點色、切線照原樣）；複製的材質不釋放，程式就一直留在快取裡。
const sigOf = (o, m) =>
  [
    o.isSkinnedMesh ? 's' : o.isInstancedMesh ? 'i' + (o.instanceColor ? 'c' : '') : 'm',
    m.map ? 1 : 0,
    m.normalMap ? m.normalMapType : '-',
    m.emissiveMap ? 1 : 0,
    m.roughnessMap ? 1 : 0,
    m.metalnessMap ? 1 : 0,
    m.alphaMap ? 1 : 0,
    m.aoMap ? 1 : 0,
    m.vertexColors && o.geometry.attributes.color ? o.geometry.attributes.color.itemSize : 0,
    o.geometry.attributes.tangent ? 1 : 0,
    m.side,
    m.alphaTest > 0 ? 1 : 0,
    m.premultipliedAlpha ? 1 : 0,
    m.customProgramCacheKey ? m.customProgramCacheKey() : '',
  ].join(',');
const TW = new Map(); // 變體 → 留著的半透明材質（不釋放）
export function transpWarm(root) {
  const g = new THREE.Group();
  const seen = new Set();
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || o.userData.helper) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) {
      if (!m || !m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.transparent) continue;
      let k;
      try {
        k = sigOf(o, m);
      } catch (e) {
        continue;
      }
      if (seen.has(k)) continue;
      seen.add(k);
      let t = TW.get(k);
      if (!t) {
        t = m.clone();
        t.transparent = true;
        TW.set(k, t);
      }
      const d = new THREE.Mesh(o.geometry, t);
      d.frustumCulled = false;
      g.add(d);
    }
  });
  return g;
}
