// 機獸動作的連拍總表：在模型庫的檢視窗關掉旋轉與輔助標示，從側面（或 --ang 指定）每隔一段時間拍一格，排成一張圖。
//   node scripts/beast-shots.js temp/lion_anim_walk temp/lion_anim_run [--n=8] [--dt=120] [--ang=-1.5708] [--el=0.06] [--zoom=0.55]
// 輸出 test-results/shots/<id>-sheet.png。需要先 npm run build。
/* global window, document -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test-results', 'shots');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const arg = (k, d) =>
  +(process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).slice(k.length + 3);
const N = arg('n', 8),
  DT = arg('dt', 120),
  ANG = arg('ang', -1.5708),
  EL = arg('el', 0.06),
  ZOOM = arg('zoom', 0.55);
const EXE = [
  process.env.BENCH_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => p && fs.existsSync(p));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({
    executablePath: EXE,
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const p = await b.newPage({ viewport: { width: 1300, height: 800 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  const url = require('url').pathToFileURL(path.join(ROOT, 'dist', 'model-library.html')).href + '?test';
  for (const id of ids) {
    await p.goto(url + '#' + id);
    await p.waitForFunction(() => window.__inspect && document.querySelector('#insToggles input'), null, {
      timeout: 30000,
    });
    await p.waitForTimeout(1200);
    await p.evaluate(
      ({ ang, el, zoom }) => {
        for (const cb of document.querySelectorAll('#insToggles input')) {
          const off = ['axes', 'conns', 'dims', 'box', 'ruler', 'human', 'grid', 'rotate'].includes(
            cb.dataset.k,
          );
          if (off && cb.checked) cb.click();
        }
        const ins = window.__inspect,
          c = ins.camera,
          t = ins.controls.target;
        for (const it of ins.items) it.pivot.rotation.y = 0;
        const d = c.position.distanceTo(t) * zoom;
        c.position.set(
          t.x + Math.sin(ang) * Math.cos(el) * d,
          t.y + Math.sin(el) * d,
          t.z - Math.cos(ang) * Math.cos(el) * d,
        );
        c.lookAt(t);
        ins.controls.update();
      },
      { ang: ANG, el: EL, zoom: ZOOM },
    );
    await p.waitForTimeout(1500);
    const shots = [];
    for (let i = 0; i < N; i++) {
      const buf = await p.screenshot({
        clip: { x: 120, y: 120, width: 800, height: 560 },
        type: 'jpeg',
        quality: 80,
      });
      shots.push('data:image/jpeg;base64,' + buf.toString('base64'));
      await p.waitForTimeout(DT);
    }
    const sheet = await b.newPage({ viewport: { width: 1600, height: Math.ceil(N / 4) * 280 } });
    await sheet.setContent(
      `<body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(4,400px)">${shots
        .map((s) => `<img src="${s}" width="400" height="280">`)
        .join('')}</body>`,
    );
    await sheet.screenshot({ path: path.join(OUT, `${id.replace(/\//g, '_')}-sheet.png`) });
    await sheet.close();
    console.log(id + ' ✓');
  }
  if (errs.length) console.log('錯誤：\n' + errs.slice(0, 10).join('\n'));
  await b.close();
})();
