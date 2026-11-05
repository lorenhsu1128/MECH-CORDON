// 著色器預熱的「學習」（docs/perf-threejs-upgrade.md）：
// three.js 要等網格第一次畫到才編譯著色器，風格著色器在 Windows 上一個變體要 0.2～0.4 秒，畫面整個停住。
// 新地圖第一次算繪前 Game.shaderWarm 以 renderer.compile 編好場景裡現有的東西；之後才出現的（碎片、殘骸、增援、
// 特效）在任務中第一次出現時記下它的變體（程式的參數：貼圖、頂點色、雙面、蒙皮、instancing…，不含光源與霧，
// 那些跟著場景），存在 localStorage；下次載入地圖時以假網格把記下的變體也編好。
// 只記風格著色器（MeshStandardMaterial／MeshPhysicalMaterial，onBeforeCompile 呼叫 noteStyleVariant）。

const KEY = 'rubicon_shader_warm';
const MAX = 48;
// 變體的欄位（three.js r128 WebGLPrograms.getParameters 的名稱）
const FIELDS = [
  'instancing',
  'instancingColor',
  'skinning',
  'map',
  'mapEncoding',
  'normalMap',
  'objectSpaceNormalMap',
  'emissiveMap',
  'emissiveMapEncoding',
  'roughnessMap',
  'metalnessMap',
  'alphaMap',
  'aoMap',
  'vertexColors',
  'vertexAlphas',
  'doubleSided',
  'flipSided',
  'alphaTest',
  'premultipliedAlpha',
];

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
function dummyTex(enc) {
  const k = enc || THREE.LinearEncoding;
  let t = TEX.get(k);
  if (!t) {
    t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
    t.encoding = k;
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
  if (d.map) m.map = dummyTex(d.mapEncoding);
  if (d.normalMap) {
    m.normalMap = dummyTex();
    if (d.objectSpaceNormalMap) m.normalMapType = THREE.ObjectSpaceNormalMap;
  }
  if (d.emissiveMap) m.emissiveMap = dummyTex(d.emissiveMapEncoding);
  if (d.roughnessMap) m.roughnessMap = dummyTex();
  if (d.metalnessMap) m.metalnessMap = dummyTex();
  if (d.alphaMap) m.alphaMap = dummyTex();
  if (d.aoMap) m.aoMap = dummyTex();
  if (d.vertexColors) m.vertexColors = true;
  if (d.doubleSided) m.side = THREE.DoubleSide;
  else if (d.flipSided) m.side = THREE.BackSide;
  if (d.alphaTest) m.alphaTest = d.alphaTest;
  if (d.premultipliedAlpha) m.premultipliedAlpha = true;
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
