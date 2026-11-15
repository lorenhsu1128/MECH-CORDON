// 過場的人與載具（docs/cine-redesign-design.md 第十一節「逐段套用」）：播每一段過場，在每個地圖鏡頭的中間時間，
// 從鏡頭看出去的地面找「畫面裡、平坦、沒有障礙物、不是水面與虛空、看得到」的位置，依地圖主題挑互動小品與車種
// （data/cine/scenes.js：裝卸、施工、巡邏、群聚、撤離上車＋一條車隊），寫進 src/data/cine/crowd.js 的 CINE_CROWD。
// 劇本那一鏡標 crowd: false、或那一鏡已經有 2 組以上的小品就不加。
//   node scripts/cine-crowd.js                 全部（第 1 周目的 35 段）
//   node scripts/cine-crowd.js i1_2,o1_5       只做這幾段（其他的鍵照舊保留）
// 要先 npm run build；做完再 build 一次，之後重跑 scripts/cine-exposure.js（人和車會改變亮度不大，但鏡頭的鍵相同不用重跑）。
/* global window -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const ALL = ['p1'];
for (let c = 1; c <= 8; c++) ALL.push('i1_' + c);
for (let c = 1; c <= 7; c++) ALL.push('o1_' + c);
ALL.push(
  ...'x_c2_pre x_c2_castron x_c2_aetheric x_c4_pre x_c4_veerwell x_c4_sancta x_c6_pre x_c6_open x_c6_seal x_c6_beyond'.split(
    ' ',
  ),
);
for (let k = 1; k <= 8; k++) ALL.push('m' + k);
ALL.push('e_beyond');
const KEYS = (args.find((a) => !a.startsWith('--')) || '').split(',').filter(Boolean);
const keys = KEYS.length ? KEYS : ALL;
const FILE = path.join(__dirname, '..', 'src', 'data', 'cine', 'crowd.js');

// 依主題：小品的輪替、車種、人
const THEME = {
  snow: {
    tpl: ['board', 'crowd', 'patrol'],
    veh: ['snowcat', 'apc', 'truck'],
    who: ['farmer', 'hooded', 'casual', 'hoodie', 'man', 'woman'],
  },
  volcano: {
    tpl: ['dig', 'loading', 'crowd'],
    veh: ['lavahauler', 'hauler', 'truck'],
    who: ['worker', 'crew'],
  },
  ark: {
    tpl: ['crowd', 'patrol', 'loading'],
    veh: ['tug', 'lowboy', 'apc'],
    who: ['crew', 'soldier', 'worker'],
  },
  desert: {
    tpl: ['dig', 'loading', 'crowd'],
    veh: ['hauler', 'pickup', 'truck'],
    who: ['worker', 'crew', 'farmer'],
  },
  wasteland: {
    tpl: ['crowd', 'patrol', 'loading'],
    veh: ['pickup', 'jeep', 'truck'],
    who: ['farmer', 'hooded', 'worker', 'casual'],
  },
  dunes: {
    tpl: ['crowd', 'patrol', 'dig'],
    veh: ['jeep', 'pickup', 'truck'],
    who: ['hooded', 'farmer', 'soldier'],
  },
  industrial: { tpl: ['loading', 'crowd', 'dig'], veh: ['truck', 'semi', 'pickup'], who: ['worker', 'crew'] },
  dam: {
    tpl: ['crowd', 'patrol', 'loading'],
    veh: ['truck', 'jeep', 'apc'],
    who: ['worker', 'crew', 'soldier'],
  },
  flooded: {
    tpl: ['board', 'crowd', 'patrol'],
    veh: ['truck', 'ambulance', 'pickup'],
    who: ['farmer', 'casual', 'hoodie', 'woman'],
  },
  spaceport: {
    tpl: ['loading', 'crowd', 'patrol'],
    veh: ['tanker', 'truck', 'jeep'],
    who: ['crew', 'worker', 'soldier'],
  },
  grid086: {
    tpl: ['crowd', 'loading', 'dig'],
    veh: ['pickup', 'truck', 'hauler'],
    who: ['hooded', 'worker', 'farmer'],
  },
  xylem: {
    tpl: ['crowd', 'board', 'patrol'],
    veh: ['car', 'bus', 'pickup'],
    who: ['casual', 'hoodie', 'biz', 'woman', 'man'],
  },
  orbit: { tpl: ['crowd', 'loading'], veh: ['tug', 'truck'], who: ['crew', 'pilot'] },
  institute: {
    tpl: ['crowd', 'loading', 'patrol'],
    veh: ['truck', 'jeep', 'ambulance'],
    who: ['suitw', 'crew', 'soldier'],
  },
};
const DEF = {
  tpl: ['crowd', 'loading', 'patrol'],
  veh: ['truck', 'pickup', 'jeep'],
  who: ['worker', 'crew', 'casual'],
};

(async () => {
  const old = fs.readFileSync(FILE, 'utf8');
  const m = old.match(/export const CINE_CROWD = (\{[\s\S]*?\});\s*$/m);
  const table = m ? new Function('return ' + m[1])() : {};
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
  let nShots = 0,
    nAdd = 0;
  try {
    for (const key of keys) {
      const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
      page.on('pageerror', (e) => console.log(`[${key}] 頁面錯誤`, e.message));
      await page.goto(url);
      await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
        timeout: 60000,
      });
      const shots = await page.evaluate(async (key) => {
        const g = window.__game;
        g.cineTest = 1;
        g.cineCrowdTest = {}; // 量的時候不要放上舊的
        g.cinePlay(key, () => {});
        while (!(g.cine && g.cine.started)) await new Promise((r) => setTimeout(r, 100));
        const sh = g.cine.def.shots;
        return sh.map((s, i) => ({
          i,
          at: s.at,
          end: i + 1 < sh.length ? sh[i + 1].at : g.cine.def.dur,
          k: (s.set && s.set.k) || 'black',
          theme: s.set && s.set.theme,
          skip: s.crowd === false || s.dark || (s.actors || []).filter((a) => a.k === 'scene').length >= 2,
        }));
      }, key);
      let rot = 0;
      for (const s of shots) {
        if (s.k !== 'world' || s.skip || s.end - s.at < 1) continue;
        const t = +(s.at + Math.min(1.5, (s.end - s.at) * 0.5)).toFixed(2);
        await page.evaluate((t) => {
          const g = window.__game;
          g.cine.paused = false;
          g.cineSeek(Math.max(0, t - 0.3));
        }, t);
        await page.waitForFunction((t) => window.__game.cine && window.__game.cine.t >= t, t, {
          timeout: 20000,
        });
        const r = await page.evaluate(() => {
          const g = window.__game,
            c = g.cine,
            w = g.world,
            cam = g.camera;
          c.paused = true;
          if (!w || !c.set || !c.set.world) return null;
          const T = window.THREE;
          const K = c.set.k || 1;
          const camP = cam.getWorldPosition(new T.Vector3());
          const camS = (() => {
            // 鏡頭在劇本座標的位置（只看 x、z）
            const A = c.set.anchor,
              yaw = c.set.yaw || 0;
            const dx = (camP.x - A.x) / K,
              dz = (camP.z - A.z) / K;
            return [dx * Math.cos(yaw) - dz * Math.sin(yaw), dx * Math.sin(yaw) + dz * Math.cos(yaw)];
          })();
          const out = [];
          const R = 8;
          for (let sx = -90; sx <= 90; sx += 3)
            for (let sz = -90; sz <= 90; sz += 3) {
              const p = g.cinePt({ g: [sx, sz], h: 0 }, new T.Vector3());
              const y0 = w.groundAt(p.x, p.z, p.y + 50);
              p.y = y0;
              const d = camP.distanceTo(p);
              if (d < 16 || d > 120) continue;
              const q = p.clone().project(cam);
              if (q.z > 1 || Math.abs(q.x) > 0.8 || q.y < -0.75 || q.y > 0.45) continue;
              let lo = y0,
                hi = y0;
              for (let a = 0; a < 8; a++) {
                const h = w.groundAt(p.x + Math.cos(a) * R, p.z + Math.sin(a) * R, y0 + 20);
                lo = Math.min(lo, h);
                hi = Math.max(hi, h);
              }
              if (hi - lo > 1.2) continue;
              if (w.obstacles.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < R + (o.r || 0) * 0.5)) continue;
              if ((w.isVoid && w.isVoid(p.x, p.z)) || (w.waterDepth && w.waterDepth(p.x, p.z) > 0.3))
                continue;
              if (w.losBlocked(camP, new T.Vector3(p.x, y0 + 2, p.z))) continue;
              out.push({ sx, sz, d, qx: q.x, qy: q.y });
            }
          return { spots: out, camS, K };
        });
        if (!r || !r.spots.length) continue;
        nShots++;
        const TH = THEME[s.theme] || DEF;
        const spots = r.spots;
        // 小品：離鏡頭 25～70 m、靠近畫面中間的優先
        const score = (p) => Math.abs(p.d - 45) / 45 + Math.abs(p.qx) * 0.6 + Math.abs(p.qy + 0.2) * 0.4;
        const a = spots.slice().sort((x, y) => score(x) - score(y))[0];
        const tpl = TH.tpl[rot++ % TH.tpl.length];
        const yaw = Math.round((Math.atan2(a.sx - r.camS[0], a.sz - r.camS[1]) * 180) / Math.PI); // +v 朝遠離鏡頭
        const list = [];
        const base = {
          k: 'scene',
          type: tpl,
          p: [a.sx, a.sz],
          yaw,
          dur: Math.ceil(s.end - s.at) + 2,
          t0: -2,
        };
        if (tpl === 'crowd')
          Object.assign(base, { who: TH.who, vehs: TH.veh.slice(0, 2), n: 9, seed: s.i + 3 });
        if (tpl === 'patrol') Object.assign(base, { veh: TH.veh.includes('apc') ? 'apc' : 'jeep', len: 30 });
        if (tpl === 'board') Object.assign(base, { veh: 'bus', n: 9, every: 0.7, who: TH.who });
        if (tpl === 'dig')
          Object.assign(base, { truck: TH.veh.includes('lavahauler') ? 'lavahauler' : 'hauler' });
        list.push({ id: 'a', ...base });
        // 車隊：另外找兩個離小品 20 m 以上、彼此 45 m 以上的位置連成一條路
        const far = spots.filter((p) => Math.hypot(p.sx - a.sx, p.sz - a.sz) * r.K > 20);
        let best = null;
        for (let i = 0; i < far.length; i += 2)
          for (let j = i + 1; j < far.length; j += 2) {
            const L = Math.hypot(far[i].sx - far[j].sx, far[i].sz - far[j].sz) * r.K;
            if (L > 45 && (!best || L > best.L)) best = { L, p: far[i], q: far[j] };
          }
        if (best)
          list.push({
            id: 'c',
            k: 'scene',
            type: 'convoy',
            path: [
              [best.p.sx, best.p.sz],
              [best.q.sx, best.q.sz],
            ],
            n: 3,
            kinds: TH.veh,
            speed: 8,
            gap: 16,
            t0: -3,
          });
        // 鍵：用這一鏡的 shotKey
        const xk = await page.evaluate(() => window.__game.cine.xk);
        table[xk] = list;
        nAdd += list.length;
        console.log(`${key}#${s.i}（${s.theme}）：${tpl}${best ? '＋車隊' : ''}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const body = Object.keys(table)
    .sort()
    .map((k) => `  '${k}': ${JSON.stringify(table[k])},`)
    .join('\n');
  fs.writeFileSync(
    FILE,
    old.replace(/export const CINE_CROWD = \{[\s\S]*?\};\s*$/m, `export const CINE_CROWD = {\n${body}\n};\n`),
  );
  require('child_process').spawnSync('npx', ['prettier', '--write', FILE], { shell: true });
  console.log(`${nShots} 鏡、${nAdd} 組 → ${path.relative(process.cwd(), FILE)}`);
})();
