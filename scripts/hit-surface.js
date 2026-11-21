// 命中外框的量測（docs/hit-react-design.md 的「真正的命中表面」）：把每一種敵人與每一隻 Boss 生成出來，
// 比較判定球（半徑 radius、球心 center()）和模型實際的外框（render/hit-parts.js 的 rig.hb）：
// 外框數、外框離球心最遠的點、外框有多少比例（依體積）在判定球外面、外框體積佔判定球的比例。
//   node scripts/hit-surface.js [--only=boss|foe|type]   要先 npm run build；報告 test-results/hit-surface.md
/* global window, localStorage, THREE -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').slice(7);
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
  const rows = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(() => {
      // 不鎖住使用者的滑鼠
      window.Element.prototype.requestPointerLock = () => {};
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
    const list = await page.evaluate(() => {
      const S = window.__SPAWN;
      return {
        types: Object.keys(S.ENEMY_TYPES).filter((k) => k !== 'ac' && !S.ENEMY_TYPES[k].roster),
        foes: Object.keys(window.__FOES.FOES),
        bosses: S.BOSS_DEFS.map((b, i) => [i, b.name]),
        beasts: S.BEAST_DEFS.map((b) => [b.kind, b.name]),
      };
    });
    const jobs = [];
    if (!ONLY || ONLY === 'type') for (const k of list.types) jobs.push(['一般', k, k]);
    if (!ONLY || ONLY === 'foe') for (const k of list.foes) jobs.push(['專屬', k, k]);
    if (!ONLY || ONLY === 'boss') {
      for (const [i, n] of list.bosses) jobs.push(['Boss', i, n]);
      for (const [k, n] of list.beasts) jobs.push(['機獸', k, n]);
    }
    for (const [cls, key, name] of jobs) {
      const r = await page.evaluate(
        ([cls, key]) => {
          const g = window.__game,
            S = window.__SPAWN;
          // 清場
          g.waves = [];
          g.wavePend = null;
          for (const e of [...g.enemies]) if (e.depart) e.depart();
          g.enemies.length = 0;
          g.bosses = [];
          g.introSeen = new Set(Object.keys(S.ENEMY_TYPES).concat(Object.keys(window.__FOES.FOES)));
          const t0 = performance.now();
          try {
            if (cls === 'Boss') g.spawnBossDef(S.BOSS_DEFS[key], 1, 1, 0);
            else if (cls === '機獸') g.beastSpawn(key, 1, 0);
            else g.spawnType(key, 1, 1, undefined, 1);
          } catch (err) {
            return [{ err: String(err && err.message) }];
          }
          const ms = performance.now() - t0;
          const out = [];
          const v = new THREE.Vector3();
          for (const e of g.enemies) {
            const m = e.model,
              hb = m && m.hb;
            m.group.updateMatrixWorld(true);
            const c = e.center(),
              R = e.radius;
            let vol = 0,
              outV = 0,
              far = 0;
            // 每個外框切 4×4×4 個取樣點：在判定球外面的比例；外框離球心最遠的點
            for (const h of hb || []) {
              const sz = h.max.clone().sub(h.min);
              const sc = Math.cbrt(Math.abs(h.node.matrixWorld.determinant()));
              const bv = Math.max(1e-6, sz.x * sz.y * sz.z) * sc * sc * sc;
              let o = 0;
              for (let i = 0; i < 64; i++) {
                v.set(
                  h.min.x + (((i & 3) + 0.5) / 4) * sz.x,
                  h.min.y + ((((i >> 2) & 3) + 0.5) / 4) * sz.y,
                  h.min.z + (((i >> 4) + 0.5) / 4) * sz.z,
                ).applyMatrix4(h.node.matrixWorld);
                const d = v.distanceTo(c);
                if (d > R) o++;
                if (d > far) far = d;
              }
              vol += bv;
              outV += (bv * o) / 64;
            }
            out.push({
              ent: e.name || e.etype || '',
              part: e.ai === 'part' ? e.opts.partKind : '',
              gen: !!(m && m.hbGen),
              n: hb ? hb.length : 0,
              R: +R.toFixed(2),
              far: +far.toFixed(2),
              out: vol ? Math.round((outV / vol) * 100) : -1,
              fill: vol ? Math.round((vol / ((4 / 3) * Math.PI * R * R * R)) * 100) : -1,
              ms: +ms.toFixed(1),
              ...(() => {
                // 效能：300 條隨機的射線（打中判定球範圍）與 300 次找最近的表面，平均每次幾微秒
                if (!hb) return { ray: 0, near: 0 };
                const H = window.__HITP,
                  o = new THREE.Vector3(),
                  d = new THREE.Vector3(),
                  P = new THREE.Vector3(),
                  N = new THREE.Vector3();
                let sd = 3;
                const rr = () => ((sd = (sd * 16807) % 2147483647) / 2147483647) * 2 - 1;
                const ext = Math.max(R, far);
                const rays = [];
                for (let i = 0; i < 300; i++) {
                  d.set(rr(), rr() * 0.5, rr()).normalize();
                  o.copy(c).addScaledVector(d, -ext * 2);
                  o.x += rr() * ext * 0.4;
                  o.y += rr() * ext * 0.4;
                  rays.push([o.clone(), d.clone().multiplyScalar(ext * 4)]);
                }
                let t1 = performance.now();
                for (const [a, b] of rays) H.hitRay(m, a, b, 0);
                const ray = ((performance.now() - t1) / 300) * 1000;
                t1 = performance.now();
                for (const [a] of rays) H.nearestSurface(m, a, P, N);
                const near = ((performance.now() - t1) / 300) * 1000;
                return { ray: +ray.toFixed(1), near: +near.toFixed(1) };
              })(),
            });
          }
          return out;
        },
        [cls, key],
      );
      for (const x of r) {
        rows.push({ cls, key, name, ...x });
        console.log(cls, name, JSON.stringify(x));
      }
    }
    await page.close();
  } finally {
    await browser.close();
  }
  const md = [
    '# 命中外框的量測',
    '',
    '| 類別 | 生成的 | 實體 | 部位 | 外框數 | 判定球半徑 | 外框最遠點 | 外框在球外 | 外框體積／球體積 | 生成 ms | 射線檢查 µs | 找最近表面 µs |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) =>
      r.err
        ? `| ${r.cls} | ${r.name} | 錯誤：${r.err} | | | | | | | |`
        : `| ${r.cls} | ${r.name} | ${r.ent} | ${r.part || ''} | ${r.n}${r.gen ? '' : '（區塊）'} | ${r.R} | ${r.far} | ${r.out}% | ${r.fill}% | ${r.ms} | ${r.ray} | ${r.near} |`,
    ),
  ].join('\n');
  const out = path.join(__dirname, '..', 'test-results', 'hit-surface.md');
  fs.writeFileSync(out, md + '\n');
  console.log('報告', out);
})();
