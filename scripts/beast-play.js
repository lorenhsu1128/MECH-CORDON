// 機獸在遊戲裡的檢查（docs/beast-design.md 的「接成敵人」）：出擊後清掉敵人、生成一隻機獸，每隔一段時間截圖並印出牠的狀態。
//   node scripts/beast-play.js lion [--secs=12] [--n=6] [--map=industrial] [--dist=40] [--god]   要先 npm run build
// 截圖在 test-results/beast/<獸>-<編號>.png；--god＝玩家不會受傷。
/* global window, localStorage, document -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
const key = args.find((a) => !a.startsWith('--')) || 'lion';
const SECS = +opt('secs', 12),
  N = +opt('n', 6),
  MAP = opt('map', 'industrial'),
  DIST = +opt('dist', 40),
  TIER = +opt('tier', 0),
  DRILL = args.includes('--drill'); // 第 3 次取樣打壞全部部位、第 6 次把本體打到第二型態（看修復）
const OUT = path.join(__dirname, '..', 'test-results', 'beast');
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
  let errs = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    // 不鎖住使用者的滑鼠
    await page.addInitScript(() => {
      window.Element.prototype.requestPointerLock = () => {};
    });
    page.on('pageerror', (e) => (errs++, console.log('頁面錯誤', e.message)));
    page.on('console', (m) => m.type() === 'error' && (errs++, console.log('console.error', m.text())));
    await page.goto(url);
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
      timeout: 60000,
    });
    await page.evaluate((map) => {
      localStorage.setItem('mech_cordon_map', map);
      localStorage.setItem('mech_cordon_variant', 'base');
      const g = window.__game;
      g.save.level = 1;
      g.startMission();
    }, MAP);
    await page.waitForFunction(() => window.__game.state === 'play' && window.__game.player, null, {
      timeout: 60000,
    });
    await page.waitForTimeout(1200);
    const ok = await page.evaluate(
      ([key, dist, god, tier]) => {
        const g = window.__game;
        for (const e of [...g.enemies]) e.dead || (e.depart ? e.depart() : e.die && e.die());
        g.waves = [];
        g.wavePend = null;
        const b = g.beastSpawn(key, 1, tier);
        if (!b) return false;
        const p = g.player;
        b.pos.set(p.pos.x, p.pos.y, p.pos.z - dist);
        b.pos.y = g.world.groundAt(b.pos.x, b.pos.z, p.pos.y + 1);
        if (god) p.takeDamage = () => {};
        return true;
      },
      [key, DIST, args.includes('--god'), TIER],
    );
    if (!ok) throw new Error('沒有這隻機獸：' + key);
    for (let i = 0; i < N; i++) {
      await page.waitForTimeout((SECS * 1000) / N);
      const st = await page.evaluate(
        ([i, drill]) => {
          const g = window.__game,
            b = g.boss,
            p = g.player;
          const parts = () => g.enemies.filter((e) => e.ai === 'part' && !e.dead);
          if (drill && i === 3)
            for (const e of parts()) e.takeDamage(1e8, 0, p, e.center(), new window.THREE.Vector3(0, 0, 1));
          if (drill && i === 6) b.hp = b.maxHp * 0.6;
          let meshes = 0;
          b.mesh.traverse((o) => o.isMesh && o.visible && meshes++);
          return {
            d: +Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z).toFixed(1),
            spd: +(b.aiState.spd || 0).toFixed(1),
            clip: b.aiState.clip || '',
            gait: (b.model.beast.an && b.model.beast.an.gait) || '',
            av: +((b.bf && b.bf.v) || 0).toFixed(1),
            hp: Math.round(b.hp),
            parts: parts().length,
            ph: b.bossPhase ? b.bossPhase() : 0,
            flags: Object.keys(b.beastInfo().hide || {})
              .filter((f) => b.tierFlag(f))
              .join('+'),
            php: Math.round(p.hp),
            palt: +(p.pos.y - g.world.groundAt(p.pos.x, p.pos.z, p.pos.y + 1)).toFixed(1),
            gun: b.aiState.gun ? b.aiState.gun.G.id : '',
            proj: g.projectiles.length,
            y: +(b.pos.y - p.pos.y).toFixed(1),
            meshes,
            dead: !!b.dead,
          };
        },
        [i, DRILL],
      );
      console.log(i, JSON.stringify(st));
      await page.screenshot({ path: path.join(OUT, `${key}-${i}.png`) });
    }
    await page.evaluate(() => document.exitPointerLock && document.exitPointerLock());
  } finally {
    await browser.close();
  }
  console.log(errs ? `有 ${errs} 個錯誤` : '沒有頁面錯誤');
})();
