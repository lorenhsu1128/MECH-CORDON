// GLB 與程式模型的效能比較（實驗，2026-11-17）：同一張地圖放 N 台同樣組合的機甲（玩家初始機：GRANITE 全套），
// 三種模型各開一次遊戲量：glb＝內建預設機甲的 GLB、rebuilt＝照 GLB 重建的程式模型（window.__procTemp）、
// hand＝原本手寫的程式模型（核心 c_std 已經換成重建的）。
// 量：建立 N 台的時間、每格的時間（直接逐格呼叫主迴圈並 gl.finish，含顯示卡的工作，不受垂直同步限制）、
//     每格的繪製次數與三角形、幾何與貼圖的數量、機甲用到的貼圖的顯示卡記憶體估計、JS heap。
//   node scripts/proc-perf.js [--n=24] [--frames=400] [--size=1600x900] [--only=glb,rebuilt]
// 需要先 npm run build。量測時電腦不要做其他重的事
/* global window */
const path = require('path');
const { launch, initScript } = require('./perf-lib');

const ROOT = path.join(__dirname, '..');
const A = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) A[m[1]] = m[2] === undefined ? true : m[2];
}
const N = +(A.n || 24),
  FRAMES = +(A.frames || 400);
const [VW, VH] = String(A.size || '1600x900')
  .split('x')
  .map(Number);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = { glb: 'GLB（內建預設機甲）', rebuilt: '重建的程式模型', hand: '原本手寫的程式模型' };

async function measure(browser, variant) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.addInitScript(initScript);
  await page.addInitScript((v) => {
    window.__procTemp = v === 'rebuilt';
    window.localStorage.setItem('mech_cordon_map', 'industrial');
  }, variant);
  await page.goto(require('url').pathToFileURL(path.join(ROOT, 'dist/mech-cordon.html')).href + '?test');
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
    timeout: 60000,
  });
  await sleep(1500);
  await page.click('#btnSaves');
  await page.click('#saveSlots [data-slot="1"] [data-act="new"]');
  await page.waitForFunction(() => window.__game.state === 'garage', null, { timeout: 30000 });
  await sleep(3000); // 內建預設機甲的 GLB 解析完
  const r = await page.evaluate(
    async ([variant, N, FRAMES]) => {
      const g = window.__game;
      window.__reseed(4242);
      // 只換身體的部位（頭、核心、手臂、腳）：武器與背包三種版本都用同一套 GLB，差異才只來自身體
      if (variant !== 'glb') {
        const orig = g.mechSource.bind(g);
        const body = (slot) => ['head', 'core', 'arms', 'legs'].includes(slot.split('/')[0]);
        g.mechSource = (o) => {
          const src = orig(o);
          if (!src) return src;
          return { ...src, model: (slot, pal, uniq) => (body(slot) ? null : src.model(slot, pal, uniq)) };
        };
      }
      g.save.level = 1;
      g.startMission();
      // 清掉原本的敵人與增援、停掉 AI
      for (const e of g.enemies) e.cleanup();
      g.enemies = [];
      g.waves = [];
      g.wavePend = null;
      g.spawnQ = null;
      g.guardPend = null;
      const p = g.player;
      p.updateAI = () => {};
      const asm = { ...g.save.asm };
      const t0 = performance.now();
      const cols = 6;
      for (let i = 0; i < N; i++) {
        const e = g.spawnEnemy({
          name: 'T' + i,
          asm,
          pal: 'enemy',
          scale: 1,
          hpMul: 99,
          dmgMul: 0,
          stabMul: 99,
          ai: 'ac',
        });
        e.updateAI = () => {};
        e.takeDamage = () => {};
        const x = p.pos.x + ((i % cols) - (cols - 1) / 2) * 13,
          z = p.pos.z + 20 - Math.floor(i / cols) * 13;
        e.pos.set(x, g.world.groundAt(x, z, 99), z);
        e.vel.set(0, 0, 0);
      }
      const build = performance.now() - t0;
      // 等預熱做完（單人是非同步）
      await new Promise((res) => {
        const iv = setInterval(() => {
          if (g.warmWorld === g.world && !g.warmBusy && !g.lcOn) {
            clearInterval(iv);
            res();
          }
        }, 50);
      });
      // 停住遊戲自己的主迴圈，改成逐格呼叫
      window.requestAnimationFrame = () => 0;
      await new Promise((res) => setTimeout(res, 300));
      const gl = g.renderer.getContext();
      const R = g.renderer;
      g.pumpDt = 1 / 60;
      const step = () => {
        for (const e of g.enemies) e.hp = e.maxHp;
        p.hp = p.maxHp;
        g.loop();
        gl.finish();
      };
      g.camUser = 1.8; // 鏡頭拉到最遠，讓整排機甲都在畫面裡
      for (let i = 0; i < 150; i++) step(); // 暖機
      const ts = [];
      let calls = 0,
        tris = 0;
      const auto = R.info.autoReset;
      for (let i = 0; i < FRAMES; i++) {
        R.info.autoReset = false;
        R.info.reset();
        const a = performance.now();
        step();
        ts.push(performance.now() - a);
        calls += R.info.render.calls;
        tris += R.info.render.triangles;
      }
      R.info.autoReset = auto;
      ts.sort((a, b) => a - b);
      // 機甲用到的貼圖（不重複）與顯示卡記憶體的估計（RGBA、含 mip）
      const tex = new Set();
      let mechTris = 0,
        meshes = 0;
      const one = g.enemies[0];
      for (const e of g.enemies)
        e.mesh.traverse((o) => {
          if (!o.isMesh) return;
          if (e === one) {
            meshes++;
            mechTris +=
              (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
          }
          for (const m of Array.isArray(o.material) ? o.material : [o.material])
            for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap'])
              if (m && m[k]) tex.add(m[k]);
        });
      let texBytes = 0;
      const imgs = new Set();
      for (const t of tex) {
        const im = t.image;
        if (!im || imgs.has(im)) continue;
        imgs.add(im);
        texBytes += (im.width || 0) * (im.height || 0) * 4 * 1.33;
      }
      return {
        build,
        med: ts[Math.floor(ts.length / 2)],
        p90: ts[Math.floor(ts.length * 0.9)],
        calls: calls / FRAMES,
        tris: tris / FRAMES,
        geos: R.info.memory.geometries,
        texs: R.info.memory.textures,
        mechTex: imgs.size,
        texMB: texBytes / 1048576,
        heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0,
        mechTris,
        meshes,
        src: g.enemies.filter((e) => g.onScreen(e)).length + '／' + g.enemies.length + ' 台在畫面內',
        n: g.enemies.length,
      };
    },
    [variant, N, FRAMES],
  );
  await ctx.close();
  if (errs.length) console.log(`  （${variant} 的頁面錯誤：${errs[0]}）`);
  return r;
}

(async () => {
  const browser = await launch();
  const only = A.only ? String(A.only).split(',') : ['glb', 'rebuilt', 'hand'];
  const rows = {};
  try {
    // 每種量幾輪（--rounds，預設 4）取每格時間最低的那一輪（第一輪有著色器與快取的影響）
    for (let round = 0; round < +(A.rounds || 4); round++)
      for (const v of only) {
        const r = await measure(browser, v);
        if (!rows[v] || r.med < rows[v].med) rows[v] = r;
        console.log(`第 ${round + 1} 輪 ${v}：每格 ${r.med.toFixed(2)} ms`);
      }
  } finally {
    await browser.close();
  }
  console.log(
    `\n${N} 台機甲（玩家初始機的組合）、${VW}×${VH}、絕區零風格、集散場；每格＝主迴圈＋算繪＋等顯示卡做完`,
  );
  const f = (x, d = 1) => x.toFixed(d);
  for (const v of only) {
    const r = rows[v];
    console.log(
      `\n${NAMES[v]}（${r.src}）\n` +
        `  每格時間：中位數 ${f(r.med, 2)} ms、第 90 百分位 ${f(r.p90, 2)} ms\n` +
        `  每格：繪製 ${f(r.calls, 0)} 次、${Math.round(r.tris).toLocaleString()} 個三角形\n` +
        `  一台機甲：${Math.round(r.mechTris).toLocaleString()} 個三角形、${r.meshes} 個網格\n` +
        `  建立 ${r.n} 台：${f(r.build, 0)} ms\n` +
        `  機甲用到的貼圖：${r.mechTex} 張、顯示卡記憶體約 ${f(r.texMB)} MB；整個場景的貼圖 ${r.texs} 張、幾何 ${r.geos} 個\n` +
        `  JS heap：${f(r.heap, 0)} MB`,
    );
  }
})();
