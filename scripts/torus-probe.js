// 無邊界地圖的檢查：node torus-probe.js <主題> [tile] [view]
/* global window, localStorage, THREE, Element, Node */
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..').split(path.sep).join('/');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright-core'));
const EXE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const MAP = process.argv[2] || 'grid';
const TILE = +(process.argv[3] || 0);
const VIEW = process.argv[4] || 'tps';
const OUT = path.join(ROOT, 'test-results/torus');
fs.mkdirSync(OUT, { recursive: true });
const URL = 'file:///' + ROOT + '/dist/mech-cordon.html?test' + (TILE ? '&tile=' + TILE : '');

(async () => {
  const browser = await chromium.launch({
    executablePath: EXE,
    headless: true,
    args: [
      '--use-angle=d3d11',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(
    ({ map, view }) => {
      Element.prototype.requestPointerLock = function () {};
      localStorage.setItem('mech_cordon_map', map);
      localStorage.setItem('mech_cordon_variant', 'base');
      try {
        const c = JSON.parse(localStorage.getItem('mech_cordon_ctrl') || '{}');
        c.view = view;
        localStorage.setItem('mech_cordon_ctrl', JSON.stringify(c));
      } catch (e) {}
      window.__torusLog = [];
    },
    { map: MAP, view: VIEW },
  );
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text().slice(0, 300)));
  await page.goto(URL);
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  const t0 = Date.now();
  await page.evaluate(() => {
    const g = window.__game;
    g.save.level = 1;
    g.startMission();
  });
  await page.waitForFunction(
    () => window.__game.state === 'play' && window.__game.player && !window.__game.warmBusy,
    null,
    {
      timeout: 180000,
    },
  );
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const g = window.__game,
      w = g.world;
    return {
      theme: w.themeKey,
      torus: w.torus,
      size: w.size,
      k: +w.k.toFixed(2),
      obstacles: w.obstacles.length,
      props: (w.props || []).length,
      meshes: w.meshes.length,
      enemies: g.enemies.length,
      fog: g.scene.fog && [Math.round(g.scene.fog.near), Math.round(g.scene.fog.far)],
      player: [Math.round(g.player.pos.x), Math.round(g.player.pos.z)],
      log: window.__torusLog,
      calls: g.renderer.info.render.calls,
      tris: g.renderer.info.render.triangles,
    };
  });
  console.log('開局', Date.now() - t0, 'ms', JSON.stringify(info));
  // 停住主迴圈，自己推進
  await page.evaluate(
    () =>
      new Promise((res) => {
        window.__pump = (sec, dt = 1 / 60) => {
          const g = window.__game;
          g.pumpDt = dt;
          for (let t = 0; t < sec - 1e-6; t += dt) {
            g.lastT = performance.now() - dt * 1000;
            g.loop();
          }
          g.pumpDt = 0;
        };
        const raf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = () => 0;
        raf(() => raf(() => res()));
      }),
  );
  const shot = async (name) =>
    page.screenshot({ path: path.join(OUT, `${MAP}-${VIEW}${TILE ? '-t' + TILE : ''}-${name}.png`) });
  // 把玩家放到原格的 (ax, az)（加上目前所在的那一份），推進一下
  const put = (ax, az, sec = 0.6) =>
    page.evaluate(
      ({ ax, az, sec }) => {
        const g = window.__game,
          w = g.world,
          p = g.player;
        p.hp = p.maxHp;
        p.invuln = 99;
        const x = w.ix(ax),
          z = w.iz(az);
        // 一步一步走過去（不直接跳：要看連續移動時搬得對不對）
        const n = Math.max(1, Math.ceil(Math.hypot(x - p.pos.x, z - p.pos.z) / 40));
        const x0 = p.pos.x,
          z0 = p.pos.z;
        for (let i = 1; i <= n; i++) {
          const nx = x0 + ((x - x0) * i) / n,
            nz = z0 + ((z - z0) * i) / n;
          p.pos.set(nx, w.groundAt(nx, nz, 1e9) + 0.1, nz);
          p.vel && p.vel.set(0, 0, 0);
          window.__pump(i === n ? sec : 1 / 60);
        }
        const near = g.enemies.filter(
          (e) => !e.dead && Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < 150,
        ).length;
        return {
          at: [Math.round(p.pos.x), Math.round(p.pos.z)],
          y: +p.pos.y.toFixed(1),
          f: [Math.round(w.fx), Math.round(w.fz)],
          near,
          alive: g.enemies.filter((e) => !e.dead).length,
          far: g.enemies.filter(
            (e) =>
              !e.dead && Math.max(Math.abs(e.pos.x - p.pos.x), Math.abs(e.pos.z - p.pos.z)) > w.size / 2 + 30,
          ).length,
          farOb: w.obstacles.filter(
            (o) => Math.max(Math.abs(o.x - p.pos.x), Math.abs(o.z - p.pos.z)) > w.size / 2 + 30,
          ).length,
          ghosts: w.far ? w.far.tiles.reduce((a, t) => a + t.ghosts.filter((m) => m.visible).length, 0) : 0,
          calls: g.renderer.info.render.calls,
        };
      },
      { ax, az, sec },
    );
  const S = info.size,
    h = S / 2;
  const steps = [
    ['start', 0, 0],
    ['seamx-a', h - 25, 40],
    ['seamx-b', h + 25, 40],
    ['corner', h + 10, h + 10],
    ['seamz', -120, h + 5],
    ['back', 0, 0],
  ];
  for (const [name, x, z] of steps) {
    const r = await put(x, z);
    console.log(name, JSON.stringify(r));
    await shot(name);
  }
  // 往 +x 一直走兩圈
  const lap = await page.evaluate(() => {
    const g = window.__game,
      w = g.world,
      p = g.player;
    const x0 = p.pos.x;
    let bad = 0,
      maxStep = 0,
      py = p.pos.y;
    for (let i = 0; i < 2 * (w.size / 12); i++) {
      const nx = p.pos.x + 12;
      p.pos.set(nx, w.groundAt(nx, p.pos.z, 1e9) + 0.1, p.pos.z);
      p.hp = p.maxHp;
      window.__pump(1 / 60);
      maxStep = Math.max(maxStep, Math.abs(p.pos.y - py));
      py = p.pos.y;
      if (!isFinite(p.pos.x)) bad++;
    }
    return {
      moved: Math.round(p.pos.x - x0),
      bad,
      maxStep: +maxStep.toFixed(2),
      alive: g.enemies.filter((e) => !e.dead).length,
    };
  });
  console.log('繞兩圈', JSON.stringify(lap));
  await shot('lap');
  console.log(errs.length ? '錯誤：\n' + [...new Set(errs)].slice(0, 12).join('\n') : '沒有錯誤');
  await browser.close();
})();
