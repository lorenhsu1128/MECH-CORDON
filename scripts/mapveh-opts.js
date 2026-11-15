// 地圖上會動的載具的設定與自訂關卡（docs/map-vehicles-design.md 第 6 期）：
//   設定「地圖上的載具」多／少／關的台數、主線依區段類型的倍率（Boss 區段很少）、
//   自訂關卡：底圖「地圖上的載具：只有擺放的」不放隨機的車、單位「地圖載具」有路徑時沿路徑開、沒有路徑的挖土機原地作業。
//   node scripts/mapveh-opts.js   要先 npm run build
/* global window, localStorage -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

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
  const open = async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => check(false, '頁面錯誤 ' + e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
      timeout: 60000,
    });
    return page;
  };
  try {
    // ---------- 設定：多／少／關（同一個地圖種子） ----------
    console.log('設定「地圖上的載具」');
    const page = await open();
    const cnt = {};
    for (const set of ['many', 'few', 'off']) {
      cnt[set] = await page.evaluate(async (set) => {
        const g = window.__game;
        localStorage.setItem('mech_cordon_map', 'industrial');
        localStorage.setItem('mech_cordon_variant', 'base');
        g.ctrl.mapVeh = set;
        g.save.level = 1;
        if (g.state !== 'title') {
          g.clearMission();
          g.state = 'title';
        }
        g.worldSeedForce = 4242;
        g.startMission();
        // 同一張地圖重新規畫（只比較數量）
        g.world.seed = 4242;
        g.crowdPlan();
        return (g.mvs || []).length;
      }, set);
    }
    check(
      cnt.many > 0 && cnt.few > 0 && cnt.few < cnt.many && cnt.off === 0,
      `多 ${cnt.many}、少 ${cnt.few}、關 ${cnt.off} 台`,
    );
    // ---------- 主線的區段倍率：Boss 區段很少 ----------
    const seg = await page.evaluate(() => {
      const g = window.__game;
      g.ctrl.mapVeh = 'many';
      const out = {};
      for (const t of ['supply', 'battle', 'boss']) {
        g.camp = { ss: { type: t } };
        g.world.seed = 4242;
        g.crowdPlan();
        out[t] = (g.mvs || []).length;
      }
      g.camp = null;
      return out;
    });
    check(
      seg.boss < seg.battle && seg.supply >= seg.battle,
      `主線的區段：補給 ${seg.supply}、戰鬥 ${seg.battle}、Boss ${seg.boss} 台`,
    );
    await page.close();
    // ---------- 自訂關卡 ----------
    console.log('自訂關卡');
    const p2 = await open();
    const lv = await p2.evaluate(async () => {
      const g = window.__game;
      const L = JSON.parse(JSON.stringify(g.lvSamples()[0]));
      L.base.mv = 'off';
      const S = L.segs && L.segs.length ? L.segs[0] : L;
      const pl = (S.marks || []).find((m) => m.k === 'spawn') || { x: 0, z: 0 };
      // 路徑：出生點旁邊的一個方形（皮卡沿著開）；挖土機沒有路徑（原地作業）
      const x = pl.x + 40,
        z = pl.z + 40;
      S.paths = (S.paths || []).concat([
        {
          id: 'mvp',
          name: '車道',
          pts: [
            [x, z],
            [x + 30, z],
            [x + 30, z + 30],
            [x, z + 30],
          ],
        },
      ]);
      S.units = (S.units || []).concat([
        {
          id: 'mv1',
          kind: 'veh',
          type: 'pickup',
          x,
          y: 0,
          z,
          yaw: 0,
          g: '',
          at: 'start',
          k: 1,
          beh: { k: 'patrol', path: 'mvp' },
        },
        {
          id: 'mv2',
          kind: 'veh',
          type: 'excavator',
          x: x - 25,
          y: 0,
          z: z - 25,
          yaw: 0,
          g: '',
          at: 'start',
          k: 1,
          beh: { k: 'attack' },
        },
      ]);
      g.lvPlay(g.lvLoad ? g.lvLoad(L) : L, { src: 'sample' });
      return true;
    });
    await p2.waitForFunction(
      () => window.__game.state === 'play' && window.__game.player && window.__game.lv,
      null,
      {
        timeout: 60000,
      },
    );
    await p2.waitForTimeout(1000);
    const r = await p2.evaluate(() => {
      const g = window.__game;
      const L = g.mvs || [];
      const pk = L.find((v) => v.key === 'pickup');
      const ex = L.find((v) => v.key === 'excavator');
      const p0 = pk ? pk.pos.clone() : null;
      for (let i = 0; i < 150; i++) g.mvTick(1 / 30);
      return {
        n: L.length,
        keys: L.map((v) => v.key),
        moved: pk ? pk.pos.distanceTo(p0) : -1,
        dig: ex ? ex.job && ex.job.k : null,
      };
    });
    check(r.n === 2, `底圖「只有擺放的」：只有擺放的 ${r.n} 台（${r.keys.join('、')}）`);
    check(r.moved > 5, `皮卡沿路徑開（5 秒 ${r.moved.toFixed(1)} m）`);
    check(r.dig === 'dig', `沒有路徑的挖土機原地作業（${r.dig}）`);
    await p2.close();
  } finally {
    await browser.close();
  }
  console.log(fail ? `失敗 ${fail} 項` : '全部通過');
  process.exitCode = fail ? 1 : 0;
})();
