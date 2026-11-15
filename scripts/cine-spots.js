// 過場的擺放探測（docs/cine-redesign-design.md 第十一節）：在某一段過場的某一秒，從鏡頭看出去的地面上取樣，
// 標出「畫面裡看得到、地面平坦、附近沒有障礙物」的位置，疊在截圖上並寫出它的劇本座標（[x, z]）。
// 放互動小品（k:'scene'）、人群、載具之前先用它找位置，不要用猜的。
//   node scripts/cine-spots.js i1_2 --t=4                  第 4 秒的鏡頭
//   node scripts/cine-spots.js i1_2 --t=4 --r=8 --step=3   r＝要多大的平地（公尺）、step＝取樣間距（劇本單位）
// 輸出 test-results/cine/spots-<鍵>-<秒>.png；直接開 dist/mech-cordon.html，要先 npm run build。
/* global window, document, innerWidth, innerHeight -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith('--'));
const opt = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.slice(2).split('=');
      return [k, v === undefined ? true : v];
    }),
);
const T = +(opt.t || 2),
  R = +(opt.r || 8),
  STEP = +(opt.step || 2.5);
const [W, H] = (opt.size || '1280x720').split('x').map(Number);
const OUT = path.join(__dirname, '..', 'test-results', 'cine');
const BROWSERS = [
  process.env.BENCH_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
if (!key) {
  console.log('用法：node scripts/cine-spots.js <過場的鍵> --t=<秒>');
  process.exit(1);
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const exe = BROWSERS.find((p) => p && fs.existsSync(p));
  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on('pageerror', (e) => console.log('[頁面錯誤]', e.message));
    const url =
      'file:///' + path.resolve(__dirname, '..', 'dist', 'mech-cordon.html').split(path.sep).join('/');
    await page.goto(url + '?test');
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
      timeout: 60000,
    });
    await page.evaluate(async (key) => {
      const g = window.__game;
      g.cineTest = 1;
      g.cinePlay(key, () => {});
      while (!(g.cine && g.cine.started)) await new Promise((r) => setTimeout(r, 100));
    }, key);
    await page.evaluate((t) => {
      const g = window.__game;
      g.cine.paused = false;
      g.cineSeek(Math.max(0, t - 0.5));
    }, T);
    await page.waitForFunction((t) => window.__game.cine && window.__game.cine.t >= t, T, { timeout: 20000 });
    await page.evaluate(() => (window.__game.cine.paused = true));
    await page.waitForTimeout(200);
    const spots = await page.evaluate(
      ([R, STEP]) => {
        const g = window.__game,
          c = g.cine,
          w = g.world,
          cam = g.camera;
        if (!w || !c.set || !c.set.world) return { err: '這一秒不是 3D 的地圖場景' };
        const K = c.set.k || 1;
        const V = (x, y, z) => new window.THREE.Vector3(x, y, z);
        const camP = cam.getWorldPosition(V(0, 0, 0));
        // 鏡頭看的地面範圍（劇本座標）：從錨點往外 ±90
        const out = [];
        const rM = R; // 公尺
        for (let sx = -90; sx <= 90; sx += STEP)
          for (let sz = -90; sz <= 90; sz += STEP) {
            const p = g.cinePt({ g: [sx, sz], h: 0 }, V(0, 0, 0));
            const y0 = w.groundAt(p.x, p.z, p.y + 50);
            p.y = y0;
            const q = p.clone().project(cam);
            if (q.z > 1 || Math.abs(q.x) > 0.92 || q.y < -0.92 || q.y > 0.8) continue;
            // 平坦：半徑 R 內 8 個點的高低差
            let lo = y0,
              hi = y0;
            for (let a = 0; a < 8; a++) {
              const h = w.groundAt(p.x + Math.cos(a) * rM, p.z + Math.sin(a) * rM, y0 + 20);
              lo = Math.min(lo, h);
              hi = Math.max(hi, h);
            }
            if (hi - lo > 1.2) continue;
            // 附近沒有障礙物（方塊與圓柱的中心在 R 內）
            if (w.obstacles.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < rM + (o.r || 0) * 0.5)) continue;
            if (w.isVoid && w.isVoid(p.x, p.z)) continue;
            if (w.waterDepth && w.waterDepth(p.x, p.z) > 0.3) continue; // 水面上不算
            // 看得到：鏡頭到地面上 2 m 的那一點沒被地形或障礙物擋住
            if (w.losBlocked(camP, V(p.x, y0 + 2, p.z))) continue;
            out.push({
              sx,
              sz,
              x: (q.x * 0.5 + 0.5) * innerWidth,
              y: (-q.y * 0.5 + 0.5) * innerHeight,
              d: camP.distanceTo(p),
            });
          }
        return { spots: out, K };
      },
      [R, STEP],
    );
    // --dump＝id 的開頭（逗號分隔）：列出這些演員的世界座標、畫面位置與是否顯示
    if (opt.dump) {
      const list = await page.evaluate((pre) => {
        const g = window.__game,
          cam = g.camera;
        const out = [];
        for (const [id, A] of g.cine.actors) {
          if (!pre.some((p) => id.startsWith(p)) || !A.obj) continue;
          const p = A.obj.getWorldPosition(new window.THREE.Vector3());
          const q = p.clone().project(cam);
          let vis = A.obj.visible;
          for (let o = A.obj.parent; o; o = o.parent) vis = vis && o.visible;
          out.push(
            id +
              ' (' +
              p.x.toFixed(1) +
              ', ' +
              p.y.toFixed(1) +
              ', ' +
              p.z.toFixed(1) +
              ') 畫面 ' +
              ((q.x * 0.5 + 0.5) * innerWidth).toFixed(0) +
              ',' +
              ((-q.y * 0.5 + 0.5) * innerHeight).toFixed(0) +
              (vis ? '' : ' 隱藏') +
              (A.obj.parent ? '' : ' 不在場景'),
          );
        }
        return out;
      }, String(opt.dump).split(','));
      console.log(list.join(String.fromCharCode(10)));
    }
    if (spots.err) {
      console.log(spots.err);
      return;
    }
    // 疊上標記：綠點＋劇本座標（太密時每隔幾個寫一次字）
    await page.evaluate((list) => {
      const cv = document.createElement('canvas');
      cv.width = innerWidth;
      cv.height = innerHeight;
      Object.assign(cv.style, { position: 'fixed', left: 0, top: 0, zIndex: 99999, pointerEvents: 'none' });
      const x = cv.getContext('2d');
      x.font = 'bold 11px monospace';
      list.forEach((s, i) => {
        x.fillStyle = '#3f6';
        x.beginPath();
        x.arc(s.x, s.y, 4, 0, Math.PI * 2);
        x.fill();
        if (i % 3 === 0) {
          x.fillStyle = '#000';
          x.fillText(`${s.sx},${s.sz}`, s.x + 6, s.y + 1);
          x.fillStyle = '#ff6';
          x.fillText(`${s.sx},${s.sz}`, s.x + 5, s.y);
        }
      });
      document.body.appendChild(cv);
    }, spots.spots);
    const f = path.join(OUT, `spots-${key}-${T.toFixed(1)}.png`);
    await page.screenshot({ path: f });
    console.log(`${spots.spots.length} 個位置（平地半徑 ${R} m）→ ${path.relative(process.cwd(), f)}`);
    // 依離鏡頭的距離列出前幾個（近的動作看得清楚）
    const near = spots.spots.sort((a, b) => a.d - b.d).slice(0, 12);
    console.log('離鏡頭近的：' + near.map((s) => `[${s.sx}, ${s.sz}] ${s.d.toFixed(0)}m`).join('、'));
  } finally {
    await browser.close();
  }
})();
