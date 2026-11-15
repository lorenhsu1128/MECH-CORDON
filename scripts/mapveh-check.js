// 地圖上會動的載具的檢查（docs/map-vehicles-design.md）：各主題出擊，列出載具數量、跑幾秒後的移動距離、
// 卡住的台數、量 fps，並截圖（俯視拉近到一台車）到 test-results/mapveh/。
//   node scripts/mapveh-check.js [industrial,desert,…] [--secs=8] [--hit]   要先 npm run build
/* global window, localStorage, requestAnimationFrame -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const SECS = +((args.find((a) => a.startsWith('--secs=')) || '').slice(7) || 8);
const HIT = args.includes('--hit');
const ACT = args.includes('--act');
const ALL =
  'industrial desert wasteland dunes snow dam flooded spaceport grid086 xylem institute volcano ark'.split(
    ' ',
  );
const maps = (args.find((a) => !a.startsWith('--')) || '').split(',').filter(Boolean);
const OUT = path.join(__dirname, '..', 'test-results', 'mapveh');
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
    for (const key of maps.length ? maps : ALL) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('pageerror', (e) => console.log(`[${key}] 頁面錯誤`, e.message));
      page.on('console', (m) => m.type() === 'error' && console.log(`[${key}] console.error`, m.text()));
      await page.goto(url);
      await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
        timeout: 60000,
      });
      await page.evaluate((key) => {
        localStorage.setItem('mech_cordon_map', key);
        localStorage.setItem('mech_cordon_variant', 'base');
        const g = window.__game;
        g.save.level = 1;
        g.startMission();
      }, key);
      await page.waitForFunction(() => window.__game.state === 'play' && window.__game.player, null, {
        timeout: 60000,
      });
      await page.waitForTimeout(1500);
      const r0 = await page.evaluate(() => {
        const g = window.__game;
        for (const e of [...g.enemies]) e.dead || (e.die && e.die());
        g.enemies.length = 0;
        g.waves = [];
        g.wavePend = null;
        g.player.takeDamage = () => 0;
        const L = g.mvs || [];
        window.__mv0 = L.map((v) => v.pos.clone());
        window.__mvD = L.map(() => 0);
        window.__mvLast = L.map((v) => v.pos.clone());
        return L.map((v) => `${v.key}(${v.route.length} 點)`);
      });
      // 跑 SECS 秒：量 fps、每台走過的距離
      const fps = await page.evaluate(
        (sec) =>
          new Promise((done) => {
            const g = window.__game;
            let n = 0;
            const t0 = performance.now();
            const tick = () => {
              n++;
              (g.mvs || []).forEach((v, i) => {
                window.__mvD[i] += v.pos.distanceTo(window.__mvLast[i]);
                window.__mvLast[i].copy(v.pos);
              });
              if (performance.now() - t0 < sec * 1000) requestAnimationFrame(tick);
              else done((n / (performance.now() - t0)) * 1000);
            };
            requestAnimationFrame(tick);
          }),
        SECS,
      );
      const st = await page.evaluate(() => {
        const g = window.__game;
        return (g.mvs || []).map((v, i) => ({
          k: v.key,
          d: +window.__mvD[i].toFixed(1),
          m: v.mode,
          dir: v.dirS,
        }));
      });
      console.log(
        `${key}：${r0.length} 台 ${r0.join('、')}；fps ${fps.toFixed(0)}；` +
          st.map((s) => `${s.k} ${s.d} m`).join('、'),
      );
      // 截圖：鏡頭拉到第一台車
      if (r0.length) {
        await page.evaluate(() => {
          const g = window.__game;
          const v = g.mvs[0];
          g.player.pos.set(
            v.pos.x - 14,
            g.world.groundAt(v.pos.x - 14, v.pos.z - 14, v.pos.y + 3),
            v.pos.z - 14,
          );
        });
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(OUT, `${key}.png`) });
      }
      if (ACT && r0.length) {
        // 互動：前方站著機甲時停車（之後倒車）、踩扁小車、大車擋住機甲
        const a = await page.evaluate(async () => {
          const g = window.__game;
          const pl = g.player;
          const out = [];
          const frames = (n) =>
            new Promise((ok) => {
              let k = 0;
              const f = () => (++k >= n ? ok() : requestAnimationFrame(f));
              requestAnimationFrame(f);
            });
          const v = g.mvs.find((x) => !x.dead && x.spd > 2);
          if (v) {
            const f = v.fwd();
            const put = () =>
              pl.pos.set(v.pos.x + f.x * (v.len / 2 + 5), pl.pos.y, v.pos.z + f.z * (v.len / 2 + 5));
            put();
            pl.vel.set(0, 0, 0);
            const s0 = v.spd;
            g.updatePlayer = () => {};
            await frames(40);
            out.push(`停車：${v.key} ${s0.toFixed(1)} → ${v.spd.toFixed(1)} m/s（${v.mode}）`);
            await frames(200);
            out.push(`擋住 3 秒後：${v.mode}、速度 ${v.spd.toFixed(1)}`);
          }
          const sm = g.mvs.find((x) => !x.dead && x.T.crush);
          if (sm) {
            const f = sm.fwd();
            pl.pos.set(sm.pos.x - f.z * 2, pl.pos.y, sm.pos.z + f.x * 2);
            pl.vel.set(f.z * 8, 0, -f.x * 8);
            g.mvMechTick(g.crowdMechs());
            out.push(`踩扁：${sm.key} → ${sm.crushed ? '扁的殘骸' : '沒有'}`);
          }
          const bg = g.mvs.find((x) => !x.dead && !x.T.crush);
          if (bg) {
            pl.pos.set(bg.pos.x, pl.pos.y, bg.pos.z);
            pl.vel.set(0, 0, 0);
            g.mvMechTick(g.crowdMechs());
            const [lx, lz] = bg.local(pl.pos.x, pl.pos.z);
            out.push(`擋住：${bg.key} 機甲被推到車身座標 (${lx.toFixed(1)}, ${lz.toFixed(1)})`);
          }
          return out.join('；');
        });
        console.log('  ' + a);
        await page.screenshot({ path: path.join(OUT, `${key}-act.png`) });
      }
      if (HIT && r0.length) {
        const h = await page.evaluate(() => {
          const g = window.__game;
          const out = [];
          for (const v of g.mvs) {
            const hp0 = v.hp;
            for (let i = 0; i < 40 && !v.dead; i++)
              v.parts[0].takeDamage(120, 50, g.player, v.center(), null, null, null, 'kin');
            out.push(`${v.key} ${hp0}→${v.dead ? '殘骸' : v.hp}${v.st ? ' 階段' + v.st : ''}`);
          }
          return out.join('、');
        });
        console.log('  打壞：' + h);
        await page.waitForTimeout(1500);
        await page.screenshot({ path: path.join(OUT, `${key}-wreck.png`) });
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
})();
