// GLB 與照它重建的程式模型（scripts/glb-to-proc.mjs）的逐視角比對（實驗，2026-11-17）：
// 各視角的「螢幕空間線稿」（深度與面法線的不連續，和遊戲的描線同樣的原理）並排＋疊圖，並算出吻合的數字
// （兩邊的線互相對得到的比例、輪廓重疊、顏色相同、深度差）。
//   node scripts/proc-compare.js [--glb=src/assets/player-mech/core/c_std.glb] [--mod=c_std] [--exp=cStdPrims]
//        [--out=test-results/proc-compare/c_std] [--size=640] [--only=front,right]
// 輸出每個視角一張圖：左＝GLB、中＝程式模型、右＝疊圖（黑＝兩邊都有、紅＝只有 GLB、藍＝只有程式模型）。需要先 npm run build
/* global window, document, THREE -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { launch } = require('./perf-lib');

const ROOT = path.join(__dirname, '..');
const A = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) A[m[1]] = m[2] === undefined ? true : m[2];
}
const SIZE = +(A.size || 640);
const MOD = A.mod || 'c_std',
  EXP = A.exp || 'cStdPrims',
  GLB = A.glb || 'src/assets/player-mech/core/c_std.glb';
const OUT = path.resolve(ROOT, A.out || `test-results/proc-compare/${MOD}`);
const VIEWS = {
  front: [0, 0, 1],
  back: [0, 0, -1],
  right: [1, 0, 0],
  left: [-1, 0, 0],
  top: [0, 1, 0.0001],
  bottom: [0, -1, 0.0001],
  fr: [0.7, 0.45, 0.9],
  bl: [-0.7, 0.5, -0.9],
  fl: [-0.7, 0.45, 0.9],
  br: [0.7, 0.5, -0.9],
};

// 瀏覽器端：建立兩個模型與比對函式 window.__cmp(方向)
async function setup(N) {
  const R = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: false });
  const bin = Uint8Array.from(atob(window.GLB), (c) => c.charCodeAt(0)).buffer;
  const g = await new Promise((res, rej) => new THREE.GLTFLoader().parse(bin, '', res, rej));
  const proc = window.buildProc();
  const bx = new THREE.Box3().setFromObject(g.scene);
  const cen = bx.getCenter(new THREE.Vector3());
  const half = Math.max(...bx.getSize(new THREE.Vector3()).toArray()) * 0.62;
  // 面法線（鏡頭座標）＋到鏡頭的距離
  const mat = new THREE.ShaderMaterial({
    vertexShader:
      'varying vec3 vP;void main(){vec4 m=modelViewMatrix*vec4(position,1.0);vP=m.xyz;gl_Position=projectionMatrix*m;}',
    fragmentShader:
      'varying vec3 vP;void main(){vec3 n=normalize(cross(dFdx(vP),dFdy(vP)));gl_FragColor=vec4(n,-vP.z);}',
  });
  const SC = { main: [1, 0, 0], sub: [0, 1, 0], joint: [0, 0, 1], acc: [1, 1, 0] };
  const pass = (src, dir, kind) => {
    const G = new THREE.Group();
    src.updateMatrixWorld(true);
    src.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (o.isInstancedMesh) {
        // 會動的零件（戰車腳的輪子與履帶片）：每個實例各放一份
        const im = new THREE.Matrix4();
        const mt =
          kind === 'n'
            ? mat
            : new THREE.MeshBasicMaterial({ color: new THREE.Color(...(SC[mats[0].name] || [1, 0, 1])) });
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, im);
          const gi = o.geometry.clone();
          gi.applyMatrix4(im.premultiply(o.matrixWorld));
          G.add(new THREE.Mesh(gi, mt));
        }
        return;
      }
      const geo = o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      const mm =
        kind === 'n'
          ? mats.map(() => mat)
          : mats.map((x) =>
              window.TEX
                ? new THREE.MeshBasicMaterial({ map: x.map || null, color: x.map ? 0xffffff : x.color })
                : new THREE.MeshBasicMaterial({ color: new THREE.Color(...(SC[x.name] || [1, 0, 1])) }),
            );
      G.add(new THREE.Mesh(geo, mats.length > 1 ? mm : mm[0]));
    });
    const sc = new THREE.Scene();
    sc.add(G);
    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, 100);
    cam.position.copy(cen).addScaledVector(new THREE.Vector3(...dir).normalize(), 30);
    cam.lookAt(cen);
    const rt = new THREE.WebGLRenderTarget(N, N, {
      type: THREE.FloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    });
    R.setRenderTarget(rt);
    R.setClearColor(0x000000, 0);
    R.clear();
    R.render(sc, cam);
    const px = new Float32Array(N * N * 4);
    R.readRenderTargetPixels(rt, 0, 0, N, N, px);
    R.setRenderTarget(null);
    rt.dispose();
    return px;
  };
  // 線：和右、上的鄰居比，深度差 > 4 cm 或法線夾角 > 22°
  const edges = (px) => {
    const E = new Uint8Array(N * N);
    const C = Math.cos((22 * Math.PI) / 180);
    for (let y = 0; y < N - 1; y++)
      for (let x = 0; x < N - 1; x++) {
        const i = (y * N + x) * 4;
        for (const j of [i + 4, i + N * 4]) {
          const a = px[i + 3] > 0,
            b = px[j + 3] > 0;
          if (a !== b) {
            E[y * N + x] = 1;
            break;
          }
          if (!a) continue;
          if (
            Math.abs(px[i + 3] - px[j + 3]) > 0.04 ||
            px[i] * px[j] + px[i + 1] * px[j + 1] + px[i + 2] * px[j + 2] < C
          ) {
            E[y * N + x] = 1;
            break;
          }
        }
      }
    return E;
  };
  const dil = (E, r) => {
    const D = new Uint8Array(N * N);
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (!E[y * N + x]) continue;
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            const X = x + dx,
              Y = y + dy;
            if (X >= 0 && Y >= 0 && X < N && Y < N) D[Y * N + X] = 1;
          }
      }
    return D;
  };
  window.__cmp = (dir) => {
    const a = pass(g.scene, dir, 'n'),
      b = pass(proc, dir, 'n');
    const ea = edges(a),
      eb = edges(b);
    const da = dil(ea, 2),
      db = dil(eb, 2);
    let na = 0,
      nb = 0,
      ha = 0,
      hb = 0;
    for (let i = 0; i < N * N; i++) {
      if (ea[i]) {
        na++;
        if (db[i]) ha++;
      }
      if (eb[i]) {
        nb++;
        if (da[i]) hb++;
      }
    }
    const ca = pass(g.scene, dir, 'c'),
      cb = pass(proc, dir, 'c');
    let inter = 0,
      uni = 0,
      same = 0;
    for (let i = 0; i < N * N * 4; i += 4) {
      const fa = ca[i + 3] > 0,
        fb = cb[i + 3] > 0;
      if (fa || fb) uni++;
      if (fa && fb) {
        inter++;
        if (
          Math.abs(ca[i] - cb[i]) + Math.abs(ca[i + 1] - cb[i + 1]) + Math.abs(ca[i + 2] - cb[i + 2]) <
          (window.TEX ? 0.12 : 0.5)
        )
          same++;
      }
    }
    let ds = 0,
      dn = 0,
      d1 = 0;
    for (let i = 0; i < N * N * 4; i += 4)
      if (a[i + 3] > 0 && b[i + 3] > 0) {
        const d = Math.abs(a[i + 3] - b[i + 3]);
        ds += d;
        dn++;
        if (d > 0.03) d1++;
      }
    const o = document.getElementById('o').getContext('2d');
    const im = o.createImageData(N * 3, N);
    const put = (x, y, r, g2, b2) => {
      const k = ((N - 1 - y) * N * 3 + x) * 4;
      im.data[k] = r;
      im.data[k + 1] = g2;
      im.data[k + 2] = b2;
      im.data[k + 3] = 255;
    };
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const fa = a[i * 4 + 3] > 0,
          fb = b[i * 4 + 3] > 0;
        let v = ea[i] ? 20 : fa ? 238 : 205;
        put(x, y, v, v, v);
        v = eb[i] ? 20 : fb ? 238 : 205;
        put(x + N, y, v, v, v);
        if ((ea[i] && db[i]) || (eb[i] && da[i])) put(x + 2 * N, y, 20, 20, 20);
        else if (ea[i]) put(x + 2 * N, y, 235, 30, 30);
        else if (eb[i]) put(x + 2 * N, y, 30, 90, 240);
        else {
          const w = fa || fb ? 245 : 205;
          put(x + 2 * N, y, w, w, w);
        }
      }
    o.putImageData(im, 0, 0);
    if (window.TEX) {
      // 顏色的對照圖（左＝GLB、右＝程式模型），畫在第二張畫布
      const o2 = document.getElementById('o2').getContext('2d');
      const im2 = o2.createImageData(N * 2, N);
      const g8 = (v) => Math.round(255 * Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2));
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) {
          const i = (y * N + x) * 4;
          [ca, cb].forEach((c, k) => {
            const q = ((N - 1 - y) * N * 2 + x + k * N) * 4;
            const on = c[i + 3] > 0;
            im2.data[q] = on ? g8(c[i]) : 205;
            im2.data[q + 1] = on ? g8(c[i + 1]) : 205;
            im2.data[q + 2] = on ? g8(c[i + 2]) : 205;
            im2.data[q + 3] = 255;
          });
        }
      o2.putImageData(im2, 0, 0);
    }
    return {
      lineRef: (100 * ha) / na,
      lineProc: (100 * hb) / nb,
      sil: (100 * inter) / uni,
      col: (100 * same) / inter,
      dAvg: (1000 * ds) / dn,
      dBad: (100 * d1) / dn,
    };
  };
  let t = 0,
    t0 = 0;
  proc.traverse((o) => {
    if (o.isMesh) t += (o.geometry.attributes.position.count / 3) * (o.isInstancedMesh ? o.count : 1);
  });
  g.scene.traverse((o) => {
    if (o.isMesh)
      t0 += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  return [t0, t];
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const es = require('esbuild');
  const r = await es.build({
    stdin: {
      contents:
        `import { primsGroup } from './src/render/proc-prims.js';import { tankPartsGroup } from './src/render/proc-tank.js';import * as MODX from './src/render/proc/${MOD}.js';const PR=MODX['${EXP}'],PT=MODX['${EXP.replace(/Prims$/, 'Parts')}'],PC=MODX['${EXP.replace(/Prims$/, 'Cols')}'];` +
        `window.buildProc=()=>{const M={};for(const n of ['main','sub','joint','acc']){M[n]=new THREE.MeshStandardMaterial({flatShading:true});M[n].name=n}window.TEX=!!PC;const g=primsGroup(PR,M,false,PC);if(PT)g.add(tankPartsGroup(PT,M));return g};`,
      resolveDir: ROOT,
    },
    bundle: true,
    format: 'iife',
    write: false,
    logLevel: 'error',
  });
  const glb = fs.readFileSync(path.resolve(ROOT, GLB)).toString('base64');
  const three = 'file:///' + path.join(ROOT, 'dist/lib/three/three.js').split(path.sep).join('/');
  const html =
    `<html><body style="margin:0;background:#fff"><canvas id=c width=${SIZE} height=${SIZE} style="display:none"></canvas>` +
    `<canvas id=o width=${SIZE * 3} height=${SIZE}></canvas><br><canvas id=o2 width=${SIZE * 2} height=${SIZE}></canvas><script src="${three}"></script>` +
    `<script>window.GLB="${glb}";</script><script>${r.outputFiles[0].text.replace(/<\/script>/g, '<\\/script>')}</script></body></html>`;
  const hp = path.join(OUT, '_page.html');
  fs.writeFileSync(hp, html);
  const b = await launch();
  try {
    const page = await b.newPage({ viewport: { width: SIZE * 3, height: SIZE } });
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.goto(require('url').pathToFileURL(hp).href);
    const tris = await page.evaluate(setup, SIZE);
    console.log(`三角形：GLB ${tris[0]} → 程式模型 ${tris[1]}`);
    const only = A.only ? String(A.only).split(',') : Object.keys(VIEWS);
    const sum = { lineRef: 0, lineProc: 0, sil: 0, col: 0, dAvg: 0, dBad: 0 };
    const row = (m) =>
      `GLB 的線對到 ${m.lineRef.toFixed(1)}%　程式模型的線對到 ${m.lineProc.toFixed(1)}%　輪廓 ${m.sil.toFixed(2)}%　` +
      `顏色 ${m.col.toFixed(1)}%　深度差平均 ${m.dAvg.toFixed(1)} mm、超過 3 cm 的 ${m.dBad.toFixed(2)}%`;
    for (const v of only) {
      const m = await page.evaluate((d) => window.__cmp(d), VIEWS[v]);
      for (const k in sum) sum[k] += m[k] / only.length;
      console.log(v.padEnd(7), row(m));
      await page.screenshot({ path: path.join(OUT, v + '.png') });
      if (await page.evaluate(() => window.TEX))
        await (await page.$('#o2')).screenshot({ path: path.join(OUT, v + '-color.png') });
    }
    console.log('平均'.padEnd(5), row(sum));
  } finally {
    await b.close();
    fs.unlinkSync(hp);
  }
  console.log('圖：' + OUT);
})();
