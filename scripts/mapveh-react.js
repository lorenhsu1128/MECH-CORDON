// 地圖上會動的載具的戰鬥反應（docs/map-vehicles-design.md 第 3 期）：各主題出擊，在一台車旁邊爆炸，
// 檢查：開車的往作戰區域外開走並離場、作業中的停下且駕駛下車（小人多一個）、油罐車打壞時的大爆炸與燃燒地面、
// 夜間的地圖有照明塔與車頭燈（特效點光）。截圖 test-results/mapveh/react-<主題>.png。
//   node scripts/mapveh-react.js [industrial,desert:night,…]   要先 npm run build
/* global window, localStorage, requestAnimationFrame, THREE -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const LIST = (process.argv[2] || 'industrial,desert,wasteland:night').split(',');
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
    for (const item of LIST) {
      const [theme, tod] = item.split(':');
      console.log(`${theme}${tod ? '（' + tod + '）' : ''}`);
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.on('pageerror', (e) => check(false, '頁面錯誤 ' + e.message));
      await page.goto(url);
      await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
        timeout: 60000,
      });
      await page.evaluate(
        ([theme, tod]) => {
          localStorage.setItem('mech_cordon_map', theme);
          localStorage.setItem('mech_cordon_variant', 'base');
          const g = window.__game;
          g.save.level = 1;
          if (tod) {
            // 夜間：改 World 的時間（startMission 之後 applyLight 再套一次）
            const st = g.startMission.bind(g);
            st();
            g.world.tod = 'night';
            g.world.applyLight && g.world.applyLight(g);
            g.mvPlan();
            return;
          }
          g.startMission();
        },
        [theme, tod],
      );
      await page.waitForFunction(() => window.__game.state === 'play' && window.__game.player, null, {
        timeout: 60000,
      });
      await page.waitForTimeout(1200);
      const r = await page.evaluate(async () => {
        const g = window.__game;
        for (const e of [...g.enemies]) e.dead || (e.die && e.die());
        g.enemies.length = 0;
        g.waves = [];
        g.wavePend = null;
        g.player.takeDamage = () => 0;
        const frames = (n) =>
          new Promise((ok) => {
            let k = 0;
            const f = () => (++k >= n ? ok() : requestAnimationFrame(f));
            requestAnimationFrame(f);
          });
        const L = g.mvs || [];
        const out = { n: L.length, keys: L.map((v) => v.key + (v.job ? '［' + v.job.k + '］' : '')) };
        out.towers = L.filter((v) => v.key === 'lighttower').length;
        // 夜間：車頭燈與照明塔的特效點光
        await frames(5);
        out.glows = [...g.fx.glows.keys()].filter((k) => String(k).startsWith('mv')).length;
        // 開車的：旁邊爆炸 → 逃走 → 離場
        const drv = L.find((v) => !v.job && v.occ && !v.dead);
        if (drv) {
          const c = drv.center().add(new THREE.Vector3(drv.sn * -6, 0, drv.cs * -6));
          const n0 = g.mvs.length;
          g.crowdScare(c, 30);
          out.flee = !!drv.flee;
          let t = 0;
          // 直接推進載具的時間（最多 100 秒，不等實際時間）
          while (!drv.gone && t < 3000) {
            g.mvTick(1 / 30);
            t++;
          }
          out.gone = drv.gone
            ? '離場'
            : drv.abandoned
              ? '路被擋住、棄車'
              : `還在（${drv.mode}、速度 ${drv.spd.toFixed(1)}、離邊界 ${Math.min(drv.pos.x - g.world.zone[0], g.world.zone[1] - drv.pos.x, drv.pos.z - g.world.zone[2], g.world.zone[3] - drv.pos.z).toFixed(0)} m）`;
          out.fewer = g.mvs.length < n0;
        }
        // 作業中的：停下、駕駛下車
        const wk = (g.mvs || []).find((v) => v.job && v.occ && !v.dead);
        if (wk) {
          const h0 = g.crowd ? g.crowd.list.filter((h) => h.alive).length : 0;
          g.crowdScare(wk.center(), 30);
          await frames(30);
          out.work = {
            key: wk.key,
            ab: !!wk.abandoned,
            occ: wk.occ,
            civ: (g.crowd ? g.crowd.list.filter((h) => h.alive).length : 0) - h0,
          };
        }
        // 油罐車：打壞 → 大爆炸、燃燒的地面
        const tk = (g.mvs || []).find((v) => v.T.boom && !v.dead);
        if (tk) {
          const p0 = (g.hzPools || []).length;
          tk.parts[0].takeDamage(1e6, 0, g.player, tk.center(), null, null, null, 'kin');
          out.boom = { key: tk.key, dead: tk.dead, pools: (g.hzPools || []).length - p0 };
        }
        return out;
      });
      console.log(`  載具 ${r.n} 台：${r.keys.join('、')}`);
      if (tod) check(r.towers > 0 && r.glows > 0, `夜間：照明塔 ${r.towers} 座、特效點光 ${r.glows} 盞`);
      if ('flee' in r) {
        check(r.flee, '開車的受驚逃走');
        check((r.gone === '離場' && r.fewer) || r.gone === '路被擋住、棄車', `開走（${r.gone}）`);
      }
      if (r.work)
        check(
          r.work.ab && r.work.occ === 0 && r.work.civ > 0,
          `${r.work.key} 作業中受驚：停下、駕駛下車（小人 +${r.work.civ}）`,
        );
      if (r.boom)
        check(r.boom.dead && r.boom.pools > 0, `${r.boom.key} 打壞：大爆炸、燃燒的地面 ${r.boom.pools} 處`);
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUT, `react-${theme}${tod ? '-' + tod : ''}.png`) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
  console.log(fail ? `失敗 ${fail} 項` : '全部通過');
  process.exitCode = fail ? 1 : 0;
})();
