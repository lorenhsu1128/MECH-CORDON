// 過場的卡頓量測（docs/cine-redesign-design.md 第十一節第 7 期）：用實際時間播完一段過場，記錄每一格的間隔，
// 報告準備時間、平均 fps、卡頓（兩格間隔 ≥ 50 ms）的次數與最大的幾次（發生的秒數）。
//   node scripts/cine-perf.js i1_2,i1_4,o1_2 [--nocrowd] [--tag=名稱]   要先 npm run build；量測時電腦不要做其他重的事
//   node scripts/cine-perf.js c1（第 1 周目）／all（全部）；結果另存 test-results/cine-perf-<tag>.json
/* global window, requestAnimationFrame -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');

const { launch } = require('./perf-lib'); // PERF_GPU／PERF_CPU 模擬弱的裝置（docs/perf-full-plan.md）
const NOCROWD = process.argv.includes('--nocrowd'); // 不加自動的人與車（比較用）
const TAG = (process.argv.find((a) => a.startsWith('--tag=')) || '--tag=now').slice(6);
const out = [];
(async () => {
  // 第一個參數：逗號分隔的鍵，或 all＝全部、c1＝第 1 周目（序章、各章開場與章末、抉擇、真結局）
  let keys = (process.argv[2] || 'i1_2').split(',');
  if (keys[0] === 'all' || keys[0] === 'c1') {
    const { CINES } = await import('../src/data/cine/index.js');
    keys = Object.keys(CINES);
    if (process.argv[2] === 'c1') keys = keys.filter((k) => /^(p1|[io]1_|x_|e_)/.test(k));
  }
  const browser = await launch();
  const url =
    'file:///' +
    path.resolve(__dirname, '..', 'dist', 'mech-cordon.html').split(path.sep).join('/') +
    '?test';
  try {
    for (const key of keys) {
      const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
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
      const gs = g.map((x) => x[0]).sort((a, b) => a - b);
      out.push({
        key,
        prep: +(r.prep / 1000).toFixed(2),
        fps: +((g.length / tot) * 1000).toFixed(1),
        p99: gs.length ? +gs[Math.floor(gs.length * 0.99)].toFixed(1) : 0,
        hitch: hitch.length,
        worst: hitch.slice(0, 6).map((x) => [Math.round(x[0]), +x[1].toFixed(1)]),
      });
      await page.close();
    }
  } finally {
    await browser.close();
    fs.mkdirSync(path.join(__dirname, '..', 'test-results'), { recursive: true });
    fs.writeFileSync(
      path.join(__dirname, '..', 'test-results', `cine-perf-${TAG}.json`),
      JSON.stringify(out, null, 1),
    );
  }
})();
