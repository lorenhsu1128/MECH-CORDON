// 過場的卡頓量測（docs/cine-redesign-design.md 第十一節第 7 期）：用實際時間播完一段過場，記錄每一格的間隔，
// 報告準備時間、平均 fps、卡頓（兩格間隔 ≥ 50 ms）的次數與最大的幾次（發生的秒數）。
//   node scripts/cine-perf.js i1_2,i1_4,o1_2 [--nocrowd]      要先 npm run build；量測時電腦不要做其他重的事
/* global window, requestAnimationFrame -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const keys = (process.argv[2] || 'i1_2').split(',');
const NOCROWD = process.argv.includes('--nocrowd'); // 不加自動的人與車（比較用）
(async () => {
  const exe = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: [
      '--use-angle=d3d11',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const url =
    'file:///' +
    path.resolve(__dirname, '..', 'dist', 'mech-cordon.html').split(path.sep).join('/') +
    '?test';
  try {
    for (const key of keys) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
      page.on('pageerror', (e) => console.log(`[${key}] 頁面錯誤`, e.message));
      await page.goto(url);
      await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
        timeout: 60000,
      });
      const r = await page.evaluate(
        ([key, NOCROWD]) =>
          new Promise((done) => {
            const g = window.__game;
            if (NOCROWD) g.cineCrowdTest = {};
            const t0 = performance.now();
            let started = 0;
            const gaps = [];
            let last = 0;
            g.cinePlay(key, () => {});
            const tick = (now) => {
              const c = g.cine;
              if (!c) return done({ prep: started ? started - t0 : 0, gaps });
              if (c.started && !started) {
                started = now;
                last = now;
              } else if (started) {
                gaps.push([now - last, c.t]);
                last = now;
              }
              if (started && c.t >= c.def.dur - 0.4)
                return done({ prep: started - t0, gaps, dur: c.def.dur });
              requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
        [key, NOCROWD],
      );
      const g = r.gaps;
      const tot = g.reduce((s, x) => s + x[0], 0);
      const hitch = g.filter((x) => x[0] >= 50).sort((a, b) => b[0] - a[0]);
      console.log(
        `${key}：準備 ${(r.prep / 1000).toFixed(1)} 秒、平均 ${((g.length / tot) * 1000).toFixed(0)} fps、` +
          `卡頓 ${hitch.length} 次` +
          (hitch.length
            ? `（最大 ${hitch
                .slice(0, 4)
                .map((x) => `${x[0].toFixed(0)} ms@${x[1].toFixed(1)}s`)
                .join('、')}）`
            : ''),
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
})();
