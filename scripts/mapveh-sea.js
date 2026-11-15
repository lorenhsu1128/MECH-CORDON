// 地圖上會動的載具的水上與空中（docs/map-vehicles-design.md 第 4 期）：
//   淹沒城區／水壩／洋上都市：船浮在水面（吃水線＝水位）、一直在深水裡；洋上都市的貨輪在作戰區域外
//   舊宇宙港：停在坪上的穿梭機起飛 → 離場 → 40 秒後另一架降落、停好
//   高空軌道：作業艇與吊艙在平台上空漂
// 截圖 test-results/mapveh/sea-<主題>.png（鏡頭拉到第一艘船／穿梭機）。
//   node scripts/mapveh-sea.js [flooded,dam,xylem,spaceport,orbit]   要先 npm run build
/* global window, localStorage -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const LIST = (process.argv[2] || 'flooded,dam,xylem,spaceport,orbit').split(',');
const OUT = path.join(__dirname, '..', 'test-results', 'mapveh');
fs.mkdirSync(OUT, { recursive: true });
let fail = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? '✓' : '✗'} ${msg}`);
  if (!ok) fail++;
};
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
    for (const theme of LIST) {
      console.log(theme);
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('pageerror', (e) => check(false, '頁面錯誤 ' + e.message));
      await page.goto(url);
      await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
        timeout: 60000,
      });
      await page.evaluate((theme) => {
        localStorage.setItem('mech_cordon_map', theme);
        localStorage.setItem('mech_cordon_variant', 'base');
        const g = window.__game;
        g.save.level = 1;
        g.startMission();
      }, theme);
      await page.waitForFunction(() => window.__game.state === 'play' && window.__game.player, null, {
        timeout: 60000,
      });
      await page.waitForTimeout(1000);
      const r = await page.evaluate(() => {
        const g = window.__game,
          W = g.world;
        for (const e of [...g.enemies]) e.dead || (e.die && e.die());
        g.enemies.length = 0;
        g.waves = [];
        g.wavePend = null;
        g.player.takeDamage = () => 0;
        g.player.pos.set(W.zone[0] + 5, g.player.pos.y, W.zone[2] + 5); // 玩家移到角落（不要嚇到載具）
        const L = g.mvs || [];
        const out = { keys: L.map((v) => v.key) };
        const boats = L.filter((v) => v.T.boat);
        out.boats = boats.length;
        // 推進 40 秒：船一直在深水（吃水線＝水位）、離水位最多 0.3 m
        let dry = 0,
          off = 0;
        const lv = W.theme.water ? W.theme.water.level : 0;
        for (let i = 0; i < 1200; i++) {
          g.mvTick(1 / 30);
          for (const b of boats) {
            if (b.dead || b.gone) continue;
            if (b.job && b.job.k === 'ship') {
              const Z = W.zone;
              if (b.pos.x > Z[0] && b.pos.x < Z[1] && b.pos.z > Z[2] && b.pos.z < Z[3]) off++;
            } else if (!b.T.hover && W.waterDepth(b.pos.x, b.pos.z) < 0.8) dry++;
            if (!b.T.hover && Math.abs(b.pos.y - lv) > 0.3) off++;
          }
        }
        out.dry = dry;
        out.off = off;
        out.moved = boats.map((b) => b.key + ' ' + (b.age || 0).toFixed(0) + 's');
        // 穿梭機：起飛 → 離場 → 40 秒後降落 → 停好
        const sh = L.find((v) => v.job && v.job.k === 'pad');
        if (sh) {
          const P = { px: sh.job.px, pz: sh.job.pz };
          sh.padGo();
          let t = 0;
          while (!sh.gone && t < 3000) {
            g.mvTick(1 / 30);
            t++;
          }
          out.left = sh.gone;
          let land = null;
          for (let i = 0; i < 3000 && !(land && land.job.ph === 'park'); i++) {
            g.mvTick(1 / 30);
            land = (g.mvs || []).find((v) => v.job && v.job.k === 'pad');
          }
          out.landed =
            !!land && land.job.ph === 'park' && Math.hypot(land.pos.x - P.px, land.pos.z - P.pz) < 1;
        }
        // 軌道：作業艇、吊艙在地面以上 10 m
        const pods = L.filter((v) => v.job && v.job.k === 'drift');
        out.pods = pods.length;
        out.podLow = pods.filter((v) => v.pos.y - W.groundAt(v.pos.x, v.pos.z, 999) < 8).length;
        // 截圖：鏡頭拉到第一艘船（或穿梭機、作業艇）
        const f = boats.find((b) => !(b.job && b.job.k === 'ship')) || (g.mvs || []).find((v) => v.T.air);
        if (f) g.player.pos.set(f.pos.x - 12, W.groundAt(f.pos.x - 12, f.pos.z - 14, 999), f.pos.z - 14);
        return out;
      });
      console.log(`  載具：${r.keys.join('、')}`);
      if (['flooded', 'dam', 'xylem'].includes(theme)) {
        check(r.boats > 0, `水上載具 ${r.boats} 艘（${r.moved.join('、')}）`);
        check(r.dry === 0, `40 秒內都在深水裡（擱淺的格數 ${r.dry}）`);
        check(r.off === 0, `浮在水位上、貨輪在作戰區域外（不符的格數 ${r.off}）`);
      }
      if ('left' in r) {
        check(r.left, '穿梭機起飛、離場');
        check(r.landed, '40 秒後另一架降落、停在同一個坪');
      }
      if (theme === 'orbit') check(r.pods > 0 && r.podLow === 0, `作業艇與吊艙 ${r.pods} 架在平台上空漂`);
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, `sea-${theme}.png`) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(fail ? `失敗 ${fail} 項` : '全部通過');
  process.exitCode = fail ? 1 : 0;
})();
