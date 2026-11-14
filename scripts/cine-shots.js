// 過場動畫的逐鏡截圖（docs/cinematics.md 的「動畫的鏡頭」）：播一段過場，在每一鏡的中間（或指定的秒數）截圖，
// 再拼成一張總表（test-results/cine/<鍵>-sheet.png），用來檢查構圖、3D 與 2D 漫畫的疊法。
//   node scripts/cine-shots.js i1_1                 每一鏡一張
//   node scripts/cine-shots.js i1_1 --t=2,11.2,30    指定秒數
//   node scripts/cine-shots.js i1_1 --size=1280x720 --cols=4
//   node scripts/cine-shots.js o1_2 --ctx='{"choices":{"c2":"aetheric"}}'   依抉擇的段落（劇本的 ctx）
// 直接開 dist/mech-cordon.html（file://），要先 npm run build。
const { chromium } = require('playwright-core');
/* global window -- page.evaluate 的回呼在瀏覽器端執行 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const key = args.find((a) => !a.startsWith('--')) || 'i1_1';
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [W, H] = (opt.size || '1280x720').split('x').map(Number);
const COLS = +(opt.cols || 4);
const OUT = path.join(__dirname, '..', 'test-results', 'cine');
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const exe = BROWSERS.find((p) => fs.existsSync(p));
  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: [
      process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=default',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
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
    const info = await page.evaluate(
      async ([key, ctx]) => {
        const g = window.__game;
        g.cineTest = 1;
        g.cinePlay(key, () => {}, ctx ? { ctx } : {});
        while (!(g.cine && g.cine.started)) await new Promise((r) => setTimeout(r, 100));
        return { shots: g.cine.def.shots.map((s) => s.at), dur: g.cine.def.dur };
      },
      [key, opt.ctx ? JSON.parse(opt.ctx) : null],
    );
    const ends = [...info.shots.slice(1), info.dur];
    const times = opt.t
      ? opt.t.split(',').map(Number)
      : info.shots.map((a, i) => +(a + Math.min(1.2, (ends[i] - a) * 0.6)).toFixed(2));
    const files = [];
    for (const t of times) {
      // 從 0.5 秒前開始播到 t（演員與特效動起來），停住再截
      await page.evaluate((t) => {
        const g = window.__game;
        g.cine.paused = false;
        g.cineSeek(Math.max(0, t - 0.5));
      }, t);
      await page.waitForFunction((t) => window.__game.cine && window.__game.cine.t >= t, t, {
        timeout: 20000,
      });
      await page.evaluate(() => (window.__game.cine.paused = true));
      await page.waitForTimeout(150);
      const f = path.join(OUT, `${key}${opt.ctx ? '-ctx' : ''}-${t.toFixed(1).padStart(5, '0')}.png`);
      await page.screenshot({ path: f });
      files.push([t, f]);
      console.log(`${t.toFixed(1)} 秒 → ${path.relative(process.cwd(), f)}`);
    }
    // 總表：縮小拼起來，左上角寫秒數
    const imgs = files.map(([t, f]) => [t, 'data:image/png;base64,' + fs.readFileSync(f).toString('base64')]);
    const tw = 480,
      th = Math.round((tw * H) / W);
    const rows = Math.ceil(imgs.length / COLS);
    const sheet = await browser.newPage({ viewport: { width: tw * COLS, height: th * rows } });
    await sheet.setContent(
      `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${COLS},${tw}px)">` +
        imgs
          .map(
            ([t, src]) =>
              `<div style="position:relative;width:${tw}px;height:${th}px"><img src="${src}" style="width:100%;height:100%">` +
              `<b style="position:absolute;left:6px;top:4px;color:#ff0;font:bold 16px monospace;text-shadow:0 0 3px #000">${t.toFixed(1)}</b></div>`,
          )
          .join('') +
        '</body>',
    );
    const out = path.join(OUT, `${key}${opt.ctx ? '-ctx' : ''}-sheet.png`);
    await sheet.screenshot({ path: out, fullPage: true });
    console.log('總表：' + path.relative(process.cwd(), out));
  } finally {
    await browser.close();
  }
})();
