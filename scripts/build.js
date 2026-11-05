// 建置：每個頁面打包成 dist/ 下的單一 HTML（CSS／JS／音效／模型全部內嵌，可直接開啟或由伺服器提供）
//   src/index.html          → dist/rubicon-protocol.html（遊戲）
//   src/library/index.html  → dist/model-library.html（模型庫）
// 外部程式庫（three.js、PeerJS）不內嵌：頁面模板裡的 <script src="lib/<套件>/<路徑>"> 由 node_modules
// 複製到 dist/lib/ 同樣的路徑；three.js 例外：lib/three/three.js 由 scripts/three-bundle.js 打包（核心＋用到的 addons，
// IIFE、掛在 window.THREE）。另外產生 dist/lib/draco/draco-decoder.js（Draco 解碼器，見 render/glb.js）
// 與 draco-encoder.js（Draco 編碼器，見 library/editor-opt.js）
// 用法：node scripts/build.js [--dev] [--watch]
//   --dev    不壓縮、附 inline source map，方便在瀏覽器除錯
//   --watch  監看 src/ 變更自動重建（隱含 --dev）
'use strict';
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

const LIB = path.join(DIST, 'lib');
const NODE_MODULES = path.join(ROOT, 'node_modules');
// 頁面引用的程式庫：lib/<套件>/<路徑> → node_modules/<套件>/<路徑>
const LIB_TAG = /<script src="lib\/([^"]+)"><\/script>/g;
// three.js：r160 起沒有 UMD 的建置、r148 起沒有 examples/js，以 esbuild 把 scripts/three-bundle.js 打包成 IIFE（每次建置一次）
const THREE_LIB = 'three/three.js';
let threeBuilt = false;
function buildThree() {
  if (threeBuilt) return;
  threeBuilt = true;
  esbuild.buildSync({
    entryPoints: [path.join(__dirname, 'three-bundle.js')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    legalComments: 'none',
    // DRACOLoader 以 import.meta.url 組出解碼器的預設網址：IIFE 裡沒有 import.meta，給一個假的基底
    // （render/glb.js 覆寫 _loadLibrary，解碼器由 lib/draco/draco-decoder.js 的內容提供，不會真的去讀這些網址）
    define: { 'import.meta.url': '"https://rubicon.local/three/"' },
    outfile: path.join(LIB, THREE_LIB),
    logLevel: 'warning',
  });
}
function copyLibs(html) {
  for (const m of html.matchAll(LIB_TAG)) {
    if (m[1] === THREE_LIB) {
      buildThree();
      continue;
    }
    const from = path.join(NODE_MODULES, m[1]);
    if (!fs.existsSync(from)) throw new Error(`找不到 ${path.relative(ROOT, from)}（請先執行 npm install）`);
    const to = path.join(LIB, m[1]);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
}
// Draco 解碼器：直接開檔（file://）時瀏覽器不讓網頁用 fetch 讀本地的 wasm，所以把 wasm 包裝程式與 wasm（base64）
// 寫成一般的 JS 檔，用 <script> 載入（第一次遇到 Draco 壓縮的 GLB 才載入）
function writeDraco() {
  const dir = path.join(NODE_MODULES, 'three/examples/jsm/libs/draco/gltf');
  const wrapper = fs.readFileSync(path.join(dir, 'draco_wasm_wrapper.js'), 'utf8');
  const wasm = fs.readFileSync(path.join(dir, 'draco_decoder.wasm')).toString('base64');
  const out = path.join(LIB, 'draco', 'draco-decoder.js');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    '// three.js r128 的 Draco 解碼器（examples/js/libs/draco/gltf），由 scripts/build.js 產生\n' +
      `window.RUBICON_DRACO = { wrapper: ${JSON.stringify(wrapper)}, wasm: ${JSON.stringify(wasm)} };\n`,
  );
  // Draco 編碼器（純 JS，定義全域 DracoEncoderModule）：模型庫的 GLB 編輯器輸出 Draco 壓縮時才以 <script> 載入。
  // three.js r1xx 不再附編碼器：用 r128 附的那一份（scripts/vendor/draco_encoder.js，和 three.js 的版本無關）
  fs.copyFileSync(
    path.join(__dirname, 'vendor/draco_encoder.js'),
    path.join(LIB, 'draco', 'draco-encoder.js'),
  );
}

// 過場動畫的配樂：src/assets/music/*.mp3 → dist/lib/cine-music.js（window.RUBICON_MUSIC＝{ 曲名: base64 }）。
// 不內嵌進遊戲的 HTML（約 4 MB）：第一次播過場動畫時才以 <script> 載入（game/cine.js 的 cineMusicLoad）
const MUSIC_DIR = path.join(SRC, 'assets', 'music');
function writeMusic() {
  if (!fs.existsSync(MUSIC_DIR)) return;
  const files = fs.readdirSync(MUSIC_DIR).filter((f) => f.endsWith('.mp3'));
  const data = {};
  for (const f of files)
    data[f.replace(/\.mp3$/, '')] = fs.readFileSync(path.join(MUSIC_DIR, f)).toString('base64');
  const credits = fs.existsSync(path.join(MUSIC_DIR, 'CREDITS.txt'))
    ? fs
        .readFileSync(path.join(MUSIC_DIR, 'CREDITS.txt'), 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => '// ' + l)
        .join('\n') + '\n'
    : '';
  const out = path.join(LIB, 'cine-music.js');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    '// 過場動畫的配樂（src/assets/music/），由 scripts/build.js 產生\n' +
      credits +
      `window.RUBICON_MUSIC = ${JSON.stringify(data)};\n`,
  );
}

// 機甲庫格納庫的外部素材：src/assets/hangar/（*.glb、tex/*.webp）→ dist/lib/hangar-assets.js
// （window.RUBICON_HANGAR＝{ 相對路徑: base64 }）。不內嵌（約 17 MB）：第一次進機甲庫前才以 <script> 載入（render/hangar-assets.js）
const HANGAR_DIR = path.join(SRC, 'assets', 'hangar');
// 過場動畫的人物：src/assets/people/（*.glb）→ dist/lib/people-assets.js（window.RUBICON_PEOPLE），
// 第一次播過場動畫時才載入（render/hangar-assets.js 的 loadPeopleAssets）
const PEOPLE_DIR = path.join(SRC, 'assets', 'people');
// 粒子特效的圖集（docs/vfx-design.md）：src/assets/fx/atlas.png → dist/lib/fx-assets.js（window.RUBICON_FX），
// 遊戲與模型庫啟動後載入（fx/atlas.js 的 loadFxAssets）；atlas.json（格號）直接打包進程式
const FX_DIR = path.join(SRC, 'assets', 'fx');
function writePack(dir, file, name, title) {
  if (!fs.existsSync(dir)) return;
  const data = {};
  const walk = (d, pre) => {
    for (const f of fs.readdirSync(d).sort()) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p, pre + f + '/');
      else if (/\.(glb|webp|png)$/.test(f)) data[pre + f] = fs.readFileSync(p).toString('base64');
    }
  };
  walk(dir, '');
  const cr = path.join(dir, 'CREDITS.txt');
  const credits = fs.existsSync(cr)
    ? fs
        .readFileSync(cr, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => '// ' + l)
        .join('\n') + '\n'
    : '';
  const out = path.join(LIB, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `// ${title}，由 scripts/build.js 產生\n` + credits + `window.${name} = ${JSON.stringify(data)};\n`,
  );
}
// 音效改版（docs/audio-design.md）的音檔：資料夾裡的 *.mp3 → window.<name>＝{ 檔名（不含副檔名）: base64 }，不內嵌，
// 遊戲啟動後（sfx2）、第一次進任務（bgm）、第一次播通訊（voice）才以 <script> 載入
function writeAudio(dir, file, name, title) {
  if (!fs.existsSync(dir)) return;
  const data = {};
  for (const f of fs.readdirSync(dir).sort())
    if (f.endsWith('.mp3'))
      data[f.replace(/\.mp3$/, '')] = fs.readFileSync(path.join(dir, f)).toString('base64');
  // 說明（語音試聽的候選與台詞）放在 '@index'
  const ix = path.join(dir, 'index.json');
  if (fs.existsSync(ix)) data['@index'] = JSON.parse(fs.readFileSync(ix, 'utf8'));
  const cr = path.join(dir, 'CREDITS.txt');
  const credits = fs.existsSync(cr)
    ? fs
        .readFileSync(cr, 'utf8')
        .split(/\r?\n/)
        .filter((l) => l.trim())
        .map((l) => '// ' + l)
        .join('\n') + '\n'
    : '';
  const out = path.join(LIB, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    `// ${title}，由 scripts/build.js 產生\n` + credits + `window.${name} = ${JSON.stringify(data)};\n`,
  );
}
function writeSounds() {
  writeAudio(
    path.join(SRC, 'assets', 'sfx2'),
    'sfx-assets.js',
    'RUBICON_SFX2',
    '分層的音效素材（src/assets/sfx2/）',
  );
  writeAudio(
    path.join(SRC, 'assets', 'bgm'),
    'bgm-assets.js',
    'RUBICON_BGM',
    '任務中的配樂（src/assets/bgm/）',
  );
  writeAudio(
    path.join(SRC, 'assets', 'voice-audition'),
    'voice-audition.js',
    'RUBICON_VOICE_AUD',
    'ECHO 的語音試聽（src/assets/voice-audition/，scripts/voice-audition.py）',
  );
  // ECHO 的語音：每個聲音一個檔案（src/assets/voice/<聲音>/ → lib/voice-<聲音>.js），只載入設定選的那個
  const vdir = path.join(SRC, 'assets', 'voice');
  if (fs.existsSync(vdir))
    for (const v of fs.readdirSync(vdir))
      if (fs.statSync(path.join(vdir, v)).isDirectory() && v !== 'ref')
        writeAudio(
          path.join(vdir, v),
          `voice-${v}.js`,
          `RUBICON_VOICE_${v.toUpperCase()}`,
          `ECHO 的語音（src/assets/voice/${v}/，scripts/voice-gen.py）`,
        );
}
function writeHangar() {
  writePack(HANGAR_DIR, 'hangar-assets.js', 'RUBICON_HANGAR', '機甲庫格納庫的素材（src/assets/hangar/）');
  writePack(PEOPLE_DIR, 'people-assets.js', 'RUBICON_PEOPLE', '過場動畫的人物（src/assets/people/）');
  writePack(FX_DIR, 'fx-assets.js', 'RUBICON_FX', '粒子特效的圖集（src/assets/fx/）');
}

const PAGES = [
  { name: '遊戲', dir: SRC, out: 'rubicon-protocol.html' },
  { name: '模型庫', dir: path.join(SRC, 'library'), out: 'model-library.html' },
];
// src/assets/models/ 下的 GLB 會自動內嵌：import BUILTIN_MODELS from 'virtual:models' 取得 { '槽位 id': Uint8Array }
const MODELS_DIR = path.join(SRC, 'assets', 'models');
function listModels(dir = MODELS_DIR, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listModels(p, out);
    else if (/\.glb$/i.test(e.name)) out.push(p);
  }
  return out;
}
// 內建的玩家預設機甲 src/assets/player-mech/（<槽位 id>.glb＋joints.json）：
// import PLAYER_MECH from 'virtual:player-mech' 取得 { joints, models: { '槽位 id': Uint8Array } }
// 不放在 assets/models：那裡的 GLB 會變成所有用到同一個零件的機甲（含敵人）的內建模型
const PLAYER_MECH_DIR = path.join(SRC, 'assets', 'player-mech');
const modelsPlugin = {
  name: 'models-index',
  setup(build) {
    build.onResolve({ filter: /^virtual:player-mech$/ }, () => ({ path: 'player-mech', namespace: 'pmech' }));
    build.onLoad({ filter: /.*/, namespace: 'pmech' }, () => {
      const files = listModels(PLAYER_MECH_DIR);
      const jf = path.join(PLAYER_MECH_DIR, 'joints.json');
      const joints = fs.existsSync(jf) ? fs.readFileSync(jf, 'utf8') : '{}';
      const imports = files.map((f, i) => `import m${i} from ${JSON.stringify(f)};`);
      const map = files.map((f, i) => {
        const id = path
          .relative(PLAYER_MECH_DIR, f)
          .split(path.sep)
          .join('/')
          .replace(/\.glb$/i, '');
        return `${JSON.stringify(id)}: m${i}`;
      });
      return {
        contents:
          imports.join('\n') +
          `\nexport default { joints: ${joints.trim() || '{}'}, models: { ${map.join(', ')} } };\n`,
        resolveDir: SRC,
        loader: 'js',
        watchDirs: fs.existsSync(PLAYER_MECH_DIR) ? [PLAYER_MECH_DIR] : [],
        watchFiles: fs.existsSync(jf) ? [...files, jf] : files,
      };
    });
    build.onResolve({ filter: /^virtual:models$/ }, () => ({ path: 'models-index', namespace: 'models' }));
    build.onLoad({ filter: /.*/, namespace: 'models' }, () => {
      const files = listModels();
      const imports = files.map((f, i) => `import m${i} from ${JSON.stringify(f)};`);
      const map = files.map((f, i) => {
        const id = path
          .relative(MODELS_DIR, f)
          .split(path.sep)
          .join('/')
          .replace(/\.glb$/i, '');
        return `${JSON.stringify(id)}: m${i}`;
      });
      return {
        contents: imports.join('\n') + `\nexport default { ${map.join(', ')} };\n`,
        resolveDir: SRC,
        loader: 'js',
        watchDirs: fs.existsSync(MODELS_DIR) ? [MODELS_DIR] : [],
        watchFiles: files,
      };
    });
    // 關節設定 src/assets/models/joints.json（沒有則為空物件）：import JOINTS from 'virtual:joints'
    build.onResolve({ filter: /^virtual:joints$/ }, () => ({ path: 'joints', namespace: 'joints' }));
    build.onLoad({ filter: /.*/, namespace: 'joints' }, () => {
      const f = path.join(MODELS_DIR, 'joints.json');
      const has = fs.existsSync(f);
      return {
        contents: has ? fs.readFileSync(f, 'utf8') : '{}',
        loader: 'json',
        watchFiles: has ? [f] : [],
        watchDirs: fs.existsSync(MODELS_DIR) ? [MODELS_DIR] : [],
      };
    });
  },
};

// 頁面模板中的 <link rel="stylesheet" href="./x.css"> 與 <script type="module" src="./x.js"> 會被替換成內嵌內容
const CSS_TAG = /<link rel="stylesheet" href="\.\/([\w-]+\.css)"\s*\/?>/;
const JS_TAG = /<script type="module" src="\.\/([\w-]+\.js)"><\/script>/;

function readTemplate(page) {
  const html = fs.readFileSync(path.join(page.dir, 'index.html'), 'utf8');
  const css = html.match(CSS_TAG),
    js = html.match(JS_TAG);
  if (!css || !js) throw new Error(`${page.dir}/index.html 缺少 styles 或 module script 標籤`);
  return { html, css: path.join(page.dir, css[1]), entry: path.join(page.dir, js[1]) };
}

// 寫檔偶爾被別的程式（防毒、編輯器的索引）短暫鎖住（Windows 的 EBUSY／UNKNOWN）：等一下再試
function writeRetry(file, data) {
  for (let i = 0; ; i++) {
    try {
      return fs.writeFileSync(file, data);
    } catch (e) {
      if (i >= 20 || !['EBUSY', 'UNKNOWN', 'EPERM'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  }
}
async function writeHtml(page, js) {
  const t = readTemplate(page);
  const css = await esbuild.transform(fs.readFileSync(t.css, 'utf8'), {
    loader: 'css',
    minify: !dev,
    charset: 'utf8',
  });
  let html = t.html.replace(CSS_TAG, () => `<style>\n${css.code}</style>`); // 用函式避免 $ 被當成替換樣式
  html = html.replace(JS_TAG, () => `<script>\n${js}</script>`);
  fs.mkdirSync(DIST, { recursive: true });
  copyLibs(t.html);
  const out = path.join(DIST, page.out);
  writeRetry(out, html);
  console.log(
    `[build] ${path.relative(ROOT, out)}  ${(html.length / 1024).toFixed(0)} KB${dev ? '（dev）' : ''}`,
  );
}

const options = (page) => ({
  entryPoints: [readTemplate(page).entry],
  bundle: true,
  format: 'iife', // 一般 <script>：file:// 直接開啟也能執行
  target: 'es2020',
  charset: 'utf8', // 保留中文與全形空白，不轉成 \u 跳脫
  loader: { '.mp3': 'base64', '.glb': 'binary' },
  minify: !dev,
  sourcemap: dev ? 'inline' : false,
  write: false,
  logLevel: 'warning',
  plugins: [
    modelsPlugin,
    {
      name: 'inline-html',
      setup(build) {
        build.onEnd(async (r) => {
          if (r.errors.length) return;
          try {
            await writeHtml(page, r.outputFiles[0].text);
          } catch (e) {
            console.error('[build] ' + e.message);
          }
        });
      },
    },
  ],
});

// 眼動追蹤（docs/gaze-design.md）：MediaPipe Tasks Vision 的 JS（打包成 IIFE，window.RUBICON_GAZE_LIB）＋
// wasm 載入程式（文字）＋wasm 與臉部模型 src/assets/gaze/face_landmarker.task（base64）→ dist/lib/gaze-assets.js
// （window.RUBICON_GAZE）。不內嵌（約 25 MB）：設定裡打開眼動追蹤時才以 <script> 載入（game/gaze.js）。
// 直接開檔時不能 fetch 本地檔案，所以 wasm 與模型都包在 JS 裡，載入程式與 wasm 以 data:／blob: 網址交給 MediaPipe
const GAZE_DIR = path.join(SRC, 'assets', 'gaze');
async function writeGaze() {
  const model = path.join(GAZE_DIR, 'face_landmarker.task');
  const mp = path.join(NODE_MODULES, '@mediapipe/tasks-vision');
  if (!fs.existsSync(model) || !fs.existsSync(mp)) return;
  const r = await esbuild.build({
    stdin: {
      contents:
        "import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';\n" +
        'window.RUBICON_GAZE_LIB = { FaceLandmarker, FilesetResolver };\n',
      resolveDir: ROOT,
    },
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    write: false,
    logLevel: 'warning',
  });
  const loader = fs.readFileSync(path.join(mp, 'wasm/vision_wasm_internal.js'), 'utf8');
  const wasm = fs.readFileSync(path.join(mp, 'wasm/vision_wasm_internal.wasm')).toString('base64');
  const task = fs.readFileSync(model).toString('base64');
  const ver = JSON.parse(fs.readFileSync(path.join(mp, 'package.json'), 'utf8')).version;
  fs.writeFileSync(
    path.join(LIB, 'gaze-assets.js'),
    `// 眼動追蹤：@mediapipe/tasks-vision ${ver}（Apache-2.0）與 Face Landmarker 模型（Apache-2.0），由 scripts/build.js 產生\n` +
      r.outputFiles[0].text +
      `window.RUBICON_GAZE = { loader: ${JSON.stringify(loader)}, wasm: ${JSON.stringify(wasm)}, model: ${JSON.stringify(task)} };\n`,
  );
}

// 子專案（納入本版本庫的純靜態網站，不需建置）原樣複製到 dist/ 底下，伺服器在 /<資料夾>/ 提供：
// 文字動畫 APNG 產生器 rubicon_apng_gen/ → dist/apng/；貼圖繪製 rubicon_paint/ → dist/paint/。
const SUBPROJECTS = [
  { src: 'rubicon_apng_gen', out: 'apng', dirs: ['css', 'js'] },
  { src: 'rubicon_paint', out: 'paint', dirs: ['css', 'js', 'lib'] },
];
function copySubprojects() {
  for (const p of SUBPROJECTS) {
    const src = path.join(ROOT, p.src);
    const out = path.join(DIST, p.out);
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    fs.copyFileSync(path.join(src, 'index.html'), path.join(out, 'index.html'));
    for (const d of p.dirs) fs.cpSync(path.join(src, d), path.join(out, d), { recursive: true });
  }
}

// 伺服器預設組的內建來源（src/assets/server-default/，檔名＝槽位 id）：複製到 dist/server-default/，
// 伺服器啟動時自動匯入（server.js 的 seedDefaults；exe 版要把這個資料夾放在 exe 旁）
// 區網伺服器 https 的自簽憑證（server.js 的 loadCert；提交進 git）：複製到 dist/rubicon-cert/，exe 版讀 exe 旁的這一份
function copyCert() {
  const src = path.join(ROOT, 'rubicon-cert', 'cert.json');
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.join(DIST, 'rubicon-cert'), { recursive: true });
  fs.copyFileSync(src, path.join(DIST, 'rubicon-cert', 'cert.json'));
}
function copyServerDefault() {
  const src = path.join(SRC, 'assets', 'server-default');
  const out = path.join(DIST, 'server-default');
  fs.rmSync(out, { recursive: true, force: true });
  if (fs.existsSync(src)) fs.cpSync(src, out, { recursive: true });
}

async function main() {
  if (!watch) fs.rmSync(LIB, { recursive: true, force: true }); // 重新複製，移除不再使用的程式庫
  writeDraco();
  writeMusic();
  writeHangar();
  writeSounds();
  await writeGaze();
  copySubprojects();
  copyServerDefault();
  copyCert();
  if (!watch) {
    for (const page of PAGES) {
      const r = await esbuild.build(options(page));
      if (r.errors.length) process.exit(1);
    }
    return;
  }
  for (const page of PAGES) {
    const ctx = await esbuild.context(options(page));
    await ctx.watch();
    // esbuild 只監看 JS 相依；HTML／CSS 另外監看
    const t = readTemplate(page);
    for (const f of [path.join(page.dir, 'index.html'), t.css])
      fs.watch(f, () => ctx.rebuild().catch(() => {}));
  }
  console.log('[build] 監看 src/ 中，Ctrl+C 結束');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
