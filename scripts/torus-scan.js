// 無邊界地圖：從第 K 格開始自動實戰，掃出沒有跟著搬的位置資料
/* global window, localStorage, THREE, Element, Node */
// node torus-scan.js <主題> [秒] [等級] [tile]
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..').split(path.sep).join('/');
const { chromium } = require(path.join(ROOT, 'node_modules/playwright-core'));
const EXE = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find((p) => fs.existsSync(p));
const MAP = process.argv[2] || 'desert';
const SECS = +(process.argv[3] || 40);
const LV = +(process.argv[4] || 6);
const TILE = +(process.argv[5] || 3);
const URL = 'file:///' + ROOT + '/dist/mech-cordon.html?test&tile=' + TILE;
const src = fs.readFileSync(path.join(ROOT, 'scripts/perf-campaign.js'), 'utf8');
const i0 = src.indexOf('function botInstall(cfg) {');
let dep = 0,
  i1 = -1;
for (let i = src.indexOf('{', i0); i < src.length; i++) {
  if (src[i] === '{') dep++;
  else if (src[i] === '}' && --dep === 0) {
    i1 = i + 1;
    break;
  }
}
const BOT = src.slice(i0, i1);

function scan() {
  const g = window.__game,
    w = g.world,
    S = w.size,
    fx = w.fx,
    fz = w.fz;
  const out = {},
    seen = new Set();
  const add = (kind, path, v) => {
    const k = kind + ' ' + path.replace(/\[\d+\]/g, '[]').replace(/\.\d+(?=\.|$)/g, '.#');
    const o = out[k] || (out[k] = { n: 0, ex: null });
    o.n++;
    if (!o.ex) o.ex = [Math.round(v.x), Math.round(v.z)];
  };
  const isPos = (v) => v && typeof v === 'object' && typeof v.x === 'number' && typeof v.z === 'number';
  const far = (v) => Math.max(Math.abs(v.x - fx), Math.abs(v.z - fz)) > S / 2 + 60;
  const skipKey =
    /^(game|world|scene|renderer|model|mesh|group|geometry|material|parent|children|save|net|fx|camera|stylePipe|el|dom|ctx|canvas|def|defs|asm|stats|buf|tex|map|target|owner|src|lockTarget|lastHitBy|by|ent|e|of|from)$/;
  const visit = (o, path, d) => {
    if (!o || typeof o !== 'object' || seen.has(o) || d > 4) return;
    seen.add(o);
    if (
      o.isObject3D ||
      o.isMaterial ||
      o.isBufferGeometry ||
      o.isTexture ||
      o instanceof Node ||
      ArrayBuffer.isView(o)
    )
      return;
    if (isPos(o)) {
      if (far(o)) add(Math.hypot(o.x, o.z) > 300 ? 'POS' : 'vec', path, o);
      return;
    }
    if (Array.isArray(o)) {
      for (let i = 0; i < Math.min(o.length, 400); i++) visit(o[i], path + '[' + i + ']', d + 1);
      return;
    }
    if (o instanceof Map || o instanceof Set || o instanceof WeakMap) return;
    for (const k of Object.keys(o)) {
      if (skipKey.test(k)) continue;
      let v;
      try {
        v = o[k];
      } catch (e) {
        continue;
      }
      if (v && typeof v === 'object') visit(v, path + '.' + k, d + 1);
    }
  };
  // 機體
  for (const [name, L] of [
    ['players', g.players],
    ['enemies', g.enemies],
    ['allies', g.allies],
    ['vehicles', g.vehicles],
  ])
    for (const e of L || []) {
      if (!e) continue;
      seen.add(e);
      for (const k of Object.keys(e)) {
        if (skipKey.test(k)) continue;
        const v = e[k];
        if (v && typeof v === 'object') visit(v, name + '.' + k, 1);
      }
    }
  // Game 本身
  seen.add(g);
  for (const k of Object.keys(g)) {
    if (skipKey.test(k) || ['players', 'enemies', 'allies', 'vehicles', 'player'].includes(k)) continue;
    const v = g[k];
    if (v && typeof v === 'object') visit(v, 'g.' + k, 1);
  }
  // 場景最上層的網格
  for (const o of g.scene.children) {
    if (!o.visible || o.userData.far) continue;
    const p = o.position;
    if (p.x === 0 && p.z === 0) continue;
    if (Math.max(Math.abs(p.x - fx), Math.abs(p.z - fz)) > S / 2 + 60)
      add('MESH', o.type + ':' + (o.name || o.userData.cat || Object.keys(o.userData).join('|')), p);
  }
  // World 的資料
  const ws = new Set();
  const wv = (o, path, d) => {
    if (!o || typeof o !== 'object' || ws.has(o) || d > 3) return;
    ws.add(o);
    if (
      o.isObject3D ||
      o.isMaterial ||
      o.isBufferGeometry ||
      ArrayBuffer.isView(o) ||
      o instanceof Map ||
      o instanceof WeakMap ||
      o instanceof Set
    )
      return;
    if (isPos(o)) {
      if (far(o)) add('WORLD', path, o);
      return;
    }
    if (o.isBox3) {
      if (far(o.min)) add('WORLD', path + '.box', o.min);
      return;
    }
    if (Array.isArray(o)) {
      for (let i = 0; i < Math.min(o.length, 3000); i++) wv(o[i], path + '[' + i + ']', d + 1);
      return;
    }
    for (const k of Object.keys(o)) {
      if (
        /^(scene|theme|variant|opt|far|weather|meshes|decorG|poolG|pillarG|h|noise|noise2|rng|prop|group|mats|ob|obs|_ctr|_wd|_og|features|corridor|edges|lvl)$/.test(
          k,
        )
      )
        continue;
      const v = o[k];
      if (v && typeof v === 'object') wv(v, path + '.' + k, d + 1);
    }
  };
  wv(w, 'w', 0);
  return { f: [Math.round(fx), Math.round(fz)], out };
}

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
  await ctx.addInitScript((map) => {
    Element.prototype.requestPointerLock = function () {};
    localStorage.setItem('mech_cordon_map', map);
    window.__torusLog = [];
  }, MAP);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) =>
    errs.push('pageerror ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')),
  );
  page.on('console', (m) => m.type() === 'error' && errs.push('console ' + m.text().slice(0, 300)));
  await page.goto(URL);
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
    timeout: 60000,
  });
  await page.waitForTimeout(1500);
  await page.evaluate(
    ({ bot, lv }) => {
      (0, eval)('window.__botInstall = ' + bot);
      window.__botInstall({ dmg: 1, seen: {} });
      const g = window.__game;
      g.save.level = lv;
      g.startMission();
    },
    { bot: BOT, lv: LV },
  );
  await page.waitForFunction(
    () => window.__game.state === 'play' && window.__game.player && !window.__game.warmBusy,
    null,
    {
      timeout: 180000,
    },
  );
  await page.evaluate(() => (window.__bot.on = true));
  const all = {};
  for (let t = 0; t < SECS; t += 5) {
    await page.waitForTimeout(5000);
    const r = await page.evaluate(scan).catch((e) => ({ err: String(e) }));
    if (r.err) {
      console.log('scan 失敗', r.err);
      continue;
    }
    for (const k in r.out) {
      const o = all[k] || (all[k] = { n: 0, hits: 0, ex: r.out[k].ex });
      o.n = Math.max(o.n, r.out[k].n);
      o.hits++;
    }
    const st = await page.evaluate(() => {
      const g = window.__game,
        p = g.player;
      return {
        state: g.state,
        pos: p && p.pos ? [Math.round(p.pos.x), Math.round(p.pos.z)] : null,
        alive: g.enemies.filter((e) => !e.dead).length,
        kills: g.kills,
        hp: p && Math.round(p.hp),
      };
    });
    console.log(t + 5, JSON.stringify(st), 'F', JSON.stringify(r.f));
  }
  const rows = Object.entries(all).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  console.log('\n沒有跟著搬的（種類 路徑 ×最多幾個 出現幾次 例）');
  for (const [k, o] of rows) console.log(' ', k, '×' + o.n, o.hits, JSON.stringify(o.ex));
  console.log(errs.length ? '\n錯誤：\n' + [...new Set(errs)].slice(0, 15).join('\n') : '\n沒有錯誤');
  await browser.close();
})();
