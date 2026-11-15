// 過場人物的動作檢視（docs/cine-redesign-design.md 第十一節「人物 v2」）：把 src/assets/people/anims/ 的動作
// 套到幾個不同的人物上（照遊戲的規則：男女骨架各用自己的那一份），每個動作拍幾個時間點拼成總表。
//   node scripts/people-shots.js Carry,Push,Call,Talk,Fix   → test-results/people/review.png
/* global window, document -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const NAMES = (process.argv[2] || 'Carry,Push,Call,Talk,Fix').split(',');
const WHO = [
  ['hangar', 'worker'],
  ['hangar', 'crew'],
  ['hangar', 'soldier'],
  ['people', 'hoodie'],
  ['people', 'suitw'],
];
const PH = [0.25, 0.65]; // 動作長度的幾成
(async () => {
  const b = await chromium.launch({
    executablePath: [
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
    ].find((p) => fs.existsSync(p)),
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const W = 1500,
    H = 420;
  const page = await b.newPage({ viewport: { width: W, height: H } });
  page.on('pageerror', (e) => console.log('[頁面錯誤]', e.message));
  await page.setContent('<body style="margin:0"></body>');
  await page.addScriptTag({ path: path.join(ROOT, 'dist', 'lib', 'three', 'three.js') });
  const rd = (p) => fs.readFileSync(path.join(ROOT, 'src', 'assets', p)).toString('base64');
  const data = {
    chars: WHO.map(([d, n]) => [n, rd(`${d}/${n}.glb`)]),
    m: rd('people/anims/ual.glb'),
    f: rd('people/anims/ual_f.glb'),
  };
  const shots = await page.evaluate(
    async ({ data, NAMES, PH, W, H }) => {
      const T = window.THREE;
      const buf = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;
      const parse = (s) => new Promise((ok, no) => new T.GLTFLoader().parse(buf(s), '', ok, no));
      const clips = { m: (await parse(data.m)).animations, f: (await parse(data.f)).animations };
      const R = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      R.setSize(W, H);
      document.body.appendChild(R.domElement);
      const scene = new T.Scene();
      scene.background = new T.Color(0x3a3d44);
      scene.add(new T.HemisphereLight(0xffffff, 0x404048, 2.4));
      const dl = new T.DirectionalLight(0xffffff, 1.8);
      dl.position.set(2, 4, 4);
      scene.add(dl);
      const cam = new T.PerspectiveCamera(17, W / H, 0.1, 80);
      cam.position.set(0, 0.95, 8.2);
      cam.lookAt(0, 0.85, 0);
      const ppl = [];
      for (let i = 0; i < data.chars.length; i++) {
        const g = await parse(data.chars[i][1]);
        const o = g.scene;
        o.updateMatrixWorld(true);
        let top = 0;
        const v = new T.Vector3();
        o.traverse((c) => c.isBone && (top = Math.max(top, c.getWorldPosition(v).y)));
        const hold = new T.Group();
        hold.add(o);
        hold.scale.setScalar(1.75 / (top * 1.06));
        hold.position.x = (i - (data.chars.length - 1) / 2) * 1.5;
        hold.rotation.y = 0.35;
        scene.add(hold);
        const body = o.getObjectByName('Body');
        const set = clips[body && body.position.y > 0.0089 ? 'f' : 'm'];
        ppl.push({ mixer: new T.AnimationMixer(o), set });
      }
      const out = [];
      for (const name of NAMES) {
        for (const ph of PH) {
          for (const p of ppl) {
            const clip = p.set.find((c) => c.name === name);
            p.mixer.stopAllAction();
            if (!clip) continue;
            p.mixer.clipAction(clip).reset().play();
            p.mixer.setTime(clip.duration * ph);
          }
          R.render(scene, cam);
          out.push([name, ph, R.domElement.toDataURL('image/jpeg', 0.85)]);
        }
      }
      return out;
    },
    { data, NAMES, PH, W, H },
  );
  await b.close();
  // 總表：每個動作一列、每個時間點一欄（用 sharp 拼）
  const sharp = require('sharp');
  const tw = 1000,
    th = 280,
    cols = PH.length;
  const comps = [];
  shots.forEach(([name, ph, url], i) => {
    const r = Math.floor(i / cols),
      c = i % cols;
    comps.push({ input: Buffer.from(url.split(',')[1], 'base64'), left: c * tw, top: r * th, resize: true });
    comps.push({
      input: Buffer.from(
        `<svg width="260" height="26"><rect width="260" height="26" fill="#000" opacity="0.6"/><text x="6" y="19" font-size="16" fill="#ff6" font-family="monospace">${name} ${Math.round(ph * 100)}%</text></svg>`,
      ),
      left: c * tw,
      top: r * th,
    });
  });
  const rows = Math.ceil(shots.length / cols);
  const resized = await Promise.all(
    comps.map(async (x) => (x.resize ? { ...x, input: await sharp(x.input).resize(tw, th).toBuffer() } : x)),
  );
  const dir = path.join(ROOT, 'test-results', 'people');
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'review.png');
  await sharp({ create: { width: tw * cols, height: th * rows, channels: 3, background: '#000' } })
    .composite(resized.map(({ input, left, top }) => ({ input, left, top })))
    .png()
    .toFile(f);
  console.log('總表：' + path.relative(ROOT, f));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
