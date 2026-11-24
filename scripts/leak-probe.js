#!/usr/bin/env node
/* global THREE, window, document, localStorage, Node */
// 記憶體洩漏的追查：同一個網頁反覆出擊 → 放棄 → 機甲庫，每輪回收記憶體後
// ① 數 three.js 的幾何、貼圖、材質、Object3D 與 World、MechEntity 的實例數（CDP 的 queryObjects）
// ② 上一輪的 World／玩家機體應該已經被回收：還活著的話從遊戲物件與 window 往下找是誰留著它（印出路徑）
//   node scripts/leak-probe.js [--rounds=4] [--maps=industrial,grid086] [--hub]
const path = require('path');
const { launch, initScript } = require('./perf-lib');

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
  }),
);
const ROOT = path.join(__dirname, '..');
const URL0 = require('url').pathToFileURL(path.join(ROOT, 'dist', 'mech-cordon.html')).href + '?test&tile=32';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function count(cdp, expr) {
  const G = 'leakprobe';
  const p = await cdp.send('Runtime.evaluate', { expression: expr, objectGroup: G });
  if (!p.result.objectId) return -1;
  const q = await cdp.send('Runtime.queryObjects', { prototypeObjectId: p.result.objectId, objectGroup: G });
  const n = await cdp.send('Runtime.callFunctionOn', {
    objectId: q.objects.objectId,
    functionDeclaration: 'function(){return this.length}',
    returnByValue: true,
  });
  await cdp.send('Runtime.releaseObjectGroup', { objectGroup: G });
  return n.result.value;
}

// 頁面裡：從根往下找到目標的路徑（略過型別陣列與 DOM 的子樹）
function findPaths(maxN) {
  const W = window.__leakRefs || [];
  const targets = new Map();
  for (const r of W) {
    const o = r.ref.deref();
    if (o && o !== r.live()) targets.set(o, r.tag);
  }
  if (!targets.size) return [];
  const roots = [
    ['game', window.__game],
    ['THREE', window.THREE],
    ['window', window],
  ];
  const seen = new Map();
  const q = [];
  for (const [n, o] of roots) if (o && !seen.has(o)) (seen.set(o, null), q.push([o, n]));
  const out = [];
  let visited = 0;
  const lbl = new Map();
  while (q.length && visited < maxN && out.length < 12) {
    const [o, p] = q.shift();
    visited++;
    if (targets.has(o) && p.length) {
      out.push(targets.get(o) + ' ← ' + p);
      targets.delete(o);
      continue;
    }
    let keys;
    try {
      if (ArrayBuffer.isView(o) || o instanceof ArrayBuffer) continue;
      if (o instanceof Node && o !== document) continue;
      if (o instanceof Map || o instanceof Set) {
        let i = 0;
        for (const [k, v] of o instanceof Map ? o : [...o].map((v, i) => [i, v])) {
          for (const [kk, vv] of [
            ['k', k],
            ['v', v],
          ])
            if (vv && (typeof vv === 'object' || typeof vv === 'function') && !seen.has(vv)) {
              seen.set(vv, 1);
              q.push([vv, `${p}.<${o instanceof Map ? 'map' : 'set'}${kk}${i}>`]);
            }
          if (++i > 5000) break;
        }
        continue;
      }
      keys = Object.getOwnPropertyNames(o);
    } catch (e) {
      continue;
    }
    if (keys.length > 20000) keys = keys.slice(0, 20000);
    for (const k of keys) {
      let v;
      try {
        const d = Object.getOwnPropertyDescriptor(o, k);
        if (!d || !('value' in d)) continue;
        v = d.value;
      } catch (e) {
        continue;
      }
      if (!v || (typeof v !== 'object' && typeof v !== 'function')) continue;
      if (seen.has(v)) continue;
      seen.set(v, 1);
      q.push([v, /^\d+$/.test(k) ? `${p}[${k}]` : `${p}.${k}`]);
    }
    void lbl;
  }
  if (targets.size)
    out.push(`（另有 ${targets.size} 個沒找到路徑：可能在閉包、事件監聽或計時器裡；走訪 ${visited}）`);
  return out;
}

(async () => {
  const N = +(args.rounds || 4);
  const maps = String(args.maps || 'industrial,grid086,xylem,institute').split(',');
  const br = await launch();
  try {
    const ctx = await br.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.addInitScript(initScript);
    await page.addInitScript(() => (window.__warmAsync = true));
    const cdp = await ctx.newCDPSession(page);
    await page.goto(URL0);
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
      timeout: 90000,
    });
    await sleep(1500);
    await page.click('#btnSaves');
    await page.click('#saveSlots [data-slot="1"] [data-act="new"]');
    await page.waitForFunction(() => window.__game.state === 'garage', null, { timeout: 30000 });
    await sleep(3000);
    const sample = async (i, what) => {
      await cdp.send('HeapProfiler.collectGarbage');
      await sleep(400);
      await cdp.send('HeapProfiler.collectGarbage');
      const r = await page.evaluate(() => {
        const g = window.__game,
          I = g.renderer.info;
        let objs = 0;
        g.scene.traverse(() => objs++);
        return {
          heap: +(performance.memory.usedJSHeapSize / 1e6).toFixed(1),
          geo: I.memory.geometries,
          tex: I.memory.textures,
          prog: I.programs ? I.programs.length : 0,
          objs,
        };
      });
      const c = {};
      for (const [k, e] of [
        ['BufGeo', 'THREE.BufferGeometry.prototype'],
        ['Tex', 'THREE.Texture.prototype'],
        ['Mat', 'THREE.Material.prototype'],
        ['Obj3D', 'THREE.Object3D.prototype'],
        ['World', 'window.__leakProto && window.__leakProto.World'],
        ['Mech', 'window.__leakProto && window.__leakProto.Mech'],
      ])
        c[k] = await count(cdp, e);
      console.log(
        `第 ${i} 輪 ${what}：heap ${r.heap} MB、GPU 幾何 ${r.geo}、貼圖 ${r.tex}、程式 ${r.prog}、場景物件 ${r.objs}｜實例 ` +
          Object.entries(c)
            .map(([k, v]) => `${k} ${v}`)
            .join('、'),
      );
      const ps = await page.evaluate(findPaths, 4e6);
      for (const p of ps) console.log('   留著：' + p);
    };
    await sample(0, 'garage');
    for (let i = 1; i <= N; i++) {
      const map = maps[(i - 1) % maps.length];
      await page.evaluate((m) => {
        localStorage.setItem('mech_cordon_map', m);
        window.__game.encLazy = true;
        window.__game.startMission();
      }, map);
      await page.waitForFunction(
        () => window.__game.state === 'play' && window.__game.player && !window.__game.warmBusy,
        null,
        { timeout: 120000 },
      );
      await page.evaluate(() => {
        const g = window.__game;
        window.__leakProto = window.__leakProto || {
          World: Object.getPrototypeOf(g.world),
          Mech: Object.getPrototypeOf(g.player),
        };
        window.__leakRefs = window.__leakRefs || [];
        window.__leakRefs.push(
          { tag: 'World', ref: new WeakRef(g.world), live: () => g.world },
          { tag: '玩家機體', ref: new WeakRef(g.player), live: () => g.player },
          { tag: '場景', ref: new WeakRef(g.scene), live: () => g.scene },
        );
        if (g.enemies[0])
          window.__leakRefs.push({ tag: '敵人', ref: new WeakRef(g.enemies[0]), live: () => null });
      });
      for (let k = 0; k < 5; k++) {
        await page.evaluate(() => {
          const g = window.__game,
            p = g.player;
          if (!p || p.dead) return;
          p.hp = p.maxHp;
          const al = g.enemies.filter((e) => !e.dead && !e.isBoss);
          al.sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos));
          for (const e of al.slice(0, 2)) e.takeDamage(1e7, 0, p, e.pos.clone(), null, false, 'w_rifle');
        });
        await sleep(3000);
      }
      // --undisp：放棄之前記下場景裡每個幾何屬於誰，清除之後統計沒有 dispose 的（three.js 的繪製狀態會一直留著它們的頂點）
      if (args.undisp)
        await page.evaluate(() => {
          const g = window.__game,
            P = THREE.BufferGeometry.prototype;
          if (!P.__dp) {
            const d0 = P.dispose;
            P.dispose = function () {
              this._disp = true;
              return d0.call(this);
            };
            P.__dp = 1;
          }
          const own = new Map();
          const W = new Set(g.world ? g.world.meshes : []);
          const tag = (L, n) => {
            for (const e of L || [])
              if (e && (e.mesh || (e.model && e.model.group))) own.set(e.mesh || e.model.group, n(e));
          };
          tag(g.enemies, (e) => 'enemy:' + (e.etype || e.opts.vehKey || e.ai));
          tag(g.players, () => 'player');
          tag(g.allies, (e) => 'ally:' + e.ai);
          tag(g.vehicles, () => 'vehicle');
          for (const p of g.projectiles) if (p.mesh) own.set(p.mesh, 'proj');
          // 誰登記了這個場景物件：Game 或 World 上的欄位（直接、陣列裡、陣列元素的 group／mesh／g／ob.group）
          const hit = (x, c) =>
            x === c ||
            (x &&
              typeof x === 'object' &&
              (x.group === c || x.mesh === c || x.g === c || (x.ob && x.ob.group === c)));
          const who = (c) => {
            for (const [nm, O] of [
              ['g', g],
              ['w', g.world || {}],
            ])
              for (const k of Object.keys(O)) {
                const v = O[k];
                if (hit(v, c)) return nm + '.' + k;
                if (Array.isArray(v) && v.length < 50000)
                  for (const x of v) if (hit(x, c)) return nm + '.' + k + '[]';
                if (v instanceof Map) for (const x of v.values()) if (hit(x, c)) return nm + '.' + k + '<>';
                if (
                  v &&
                  typeof v === 'object' &&
                  !Array.isArray(v) &&
                  !v.isObject3D &&
                  k !== 'world' &&
                  k !== 'scene'
                )
                  for (const k2 of Object.keys(v)) {
                    const u = v[k2];
                    if (hit(u, c)) return nm + '.' + k + '.' + k2;
                    if (Array.isArray(u) && u.length < 50000)
                      for (const x of u) if (hit(x, c)) return nm + '.' + k + '.' + k2 + '[]';
                  }
              }
            return '';
          };
          const M = (window.__gl = new Map());
          for (const c of g.scene.children) {
            const lb =
              own.get(c) ||
              (W.has(c)
                ? 'world'
                : 'other:' + (who(c) || [c.type, c.name, Object.keys(c.userData).join('+')].join('|')));
            c.traverse((o) => {
              if (o.geometry && !o.geometry._disp && !M.has(o.geometry)) M.set(o.geometry, lb);
            });
          }
        });
      await page.evaluate(() => document.getElementById('btnAbort').click());
      await page.waitForFunction(() => window.__game.state !== 'play', null, { timeout: 30000 });
      await sleep(1500);
      await page.evaluate(() => window.__game.openGarage());
      await sleep(2000);
      if (args.hub && i % 2 === 0) {
        await page.evaluate(() => window.__game.openHub());
        await sleep(6000);
        await page.evaluate(() => window.__game.openGarage());
        await sleep(2000);
      }
      await sample(i, map);
      if (args.undisp) {
        const r = await page.evaluate(() => {
          const c = {},
            v = {};
          for (const [geo, lb] of window.__gl) {
            if (geo._disp) continue;
            const k = lb.replace(/:.*/, '') === 'other' ? lb : lb.replace(/:.*/, '');
            c[k] = (c[k] || 0) + 1;
            v[k] = (v[k] || 0) + (geo.attributes.position ? geo.attributes.position.count : 0);
          }
          window.__gl = null;
          return Object.entries(c)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 25)
            .map(([k, n]) => `${k} ${n}（${Math.round(v[k] / 1000)}k 頂點）`)
            .join('、');
        });
        console.log('   沒有 dispose 的幾何：' + r);
      }
    }
    if (args.snap) {
      // 還活著的舊物件標上 __leakMark，存記憶體快照後找保留路徑（scripts/heap-retain.js）
      const n = await page.evaluate(() => {
        let n = 0;
        for (const r of window.__leakRefs || []) {
          const o = r.ref.deref();
          if (o && o !== r.live()) ((o.__leakMark = r.tag + '#' + n), n++);
        }
        return n;
      });
      console.log(`標記 ${n} 個沒回收的舊物件，存記憶體快照…`);
      const fs = require('fs');
      const file = path.join(ROOT, 'test-results', 'leak.heapsnapshot');
      const ws = fs.createWriteStream(file);
      cdp.on('HeapProfiler.addHeapSnapshotChunk', (c) => ws.write(c.chunk));
      await cdp.send('HeapProfiler.collectGarbage');
      await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
      await new Promise((r) => ws.end(r));
      await br.close();
      require('./heap-retain').analyze(file, '__leakMark', 12, args.census, +(args.k || 7));
    }
    if (errs.length) console.log('頁面錯誤：', errs.slice(0, 5));
  } finally {
    await br.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
