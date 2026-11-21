// Boss 身體部位破壞的截圖（docs/boss-part-break-design.md）：生成一隻、搬到空中（沒有東西擋住鏡頭），
// 拍「完好」、每個區域打壞的那一刻（0.08 秒後）、全部打壞之後冒煙的樣子。
//   node scripts/body-shots.js [beast_lion｜boss:<BOSS_DEFS 的索引>]   要先 npm run build；輸出 test-results/body/<種類>-*.png
/* global window, document, localStorage, THREE -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const KEY = process.argv[2] || 'beast_lion';
const OUT = path.join(__dirname, '..', 'test-results', 'body');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const exe = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const url =
    'file:///' +
    path.resolve(__dirname, '..', 'dist', 'mech-cordon.html').split(path.sep).join('/') +
    '?test';
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(() => {
      window.Element.prototype.requestPointerLock = () => {}; // 不鎖住使用者的滑鼠
      localStorage.setItem('mech_cordon_map', 'industrial');
      localStorage.setItem('mech_cordon_variant', 'base');
    });
    page.on('pageerror', (e) => console.log('頁面錯誤', e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
      timeout: 60000,
    });
    await page.evaluate(() => {
      const g = window.__game;
      g.save.level = 1;
      g.startMission();
    });
    await page.waitForFunction(() => window.__game.state === 'play' && window.__game.player, null, {
      timeout: 60000,
    });
    await page.waitForTimeout(800);
    // 先停住主迴圈（已經排好的那一格跑完），之後才擺位置
    await page.evaluate(() => (window.requestAnimationFrame = () => 0));
    await page.waitForTimeout(200);
    const regs = await page.evaluate((key) => {
      const el = document.getElementById('ui');
      if (el) el.style.display = 'none';
      const g = window.__game;
      g.waves = [];
      g.wavePend = null;
      for (const e of [...g.enemies]) if (e.depart) e.depart();
      g.enemies.length = 0;
      g.bosses = [];
      g.fx.clear && g.fx.clear();
      // boss:<BOSS_DEFS 的索引>＝一般的 Boss，其他＝機獸的種類
      if (key.startsWith('boss:')) g.spawnBossDef(window.__SPAWN.BOSS_DEFS[+key.slice(5)], 1, 1, 0);
      else g.beastSpawn(key, 1, 0);
      const b = g.enemies.find((x) => x.ai !== 'part') || g.enemies[0];
      for (const x of g.enemies) if (x !== b && x.model) x.model.group.visible = false;
      b.pos.set(0, 400, 0);
      b.yaw = 0;
      b.model.group.position.copy(b.pos);
      b.model.group.rotation.set(0, 0, 0);
      b.model.group.visible = true; // 剛生成時還沒顯示（主迴圈停住了）
      b.model.group.updateMatrixWorld(true);
      window.__b = b;
      const D = b.bodyDefs() || [];
      b.bodyState();
      const c = b.center();
      window.__cam = (ax, el, dist) => {
        const cam = g.camera;
        cam.position
          .copy(c)
          .add(
            new THREE.Vector3(
              Math.sin(ax) * Math.cos(el),
              Math.sin(el),
              Math.cos(ax) * Math.cos(el),
            ).multiplyScalar(dist),
          );
        cam.lookAt(c);
        cam.updateMatrixWorld();
      };
      window.__dist = Math.max(34, (b.model.hbR || b.radius) * 2.4); // 鏡頭的距離依體型
      return D.map((R) => R.name);
    }, KEY);
    const shot = async (name, ax, el, dist, dt) => {
      await page.evaluate(
        ([ax, el, dist, dt]) => {
          const g = window.__game,
            b = window.__b;
          window.__cam(ax, el, Math.max(dist, window.__dist));
          const n = Math.max(1, Math.round(dt / 0.0167));
          for (let i = 0; i < n; i++) {
            b.bodyTick(dt / n);
            g.fx.update(dt / n);
          }
          g.renderMain();
        },
        [ax, el, dist, dt],
      );
      await page.screenshot({ path: path.join(OUT, `${KEY.replace(':', '-')}-${name}.png`) });
    };
    // 兩個角度（機獸的正面朝 −Z）：A＝背面斜後方、B＝正面斜前方
    const A = [0.9, 0.3, 34],
      B = [Math.PI + 0.7, 0.35, 34];
    await shot('0-完好-背面', ...A, 0.02);
    await shot('0-完好-正面', ...B, 0.02);
    for (let i = 0; i < regs.length; i++) {
      await page.evaluate((i) => window.__b.bodyBreak(i), i);
      await shot(`${i + 1}-打壞的那一刻-${regs[i]}`, ...(i === 3 ? A : B), 0.08);
    }
    await shot('9-全部打壞-背面', ...A, 1.6);
    await shot('9-全部打壞-正面', ...B, 0.4);
    console.log('區域：', regs.join('、'), '→', OUT);
    await page.close();
  } finally {
    await browser.close();
  }
})();
