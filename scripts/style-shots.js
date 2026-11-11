// 渲染風格的比對截圖（docs/zzz-style-design.md）：每張地圖出擊一次，把幾台敵人擺到玩家前方，
// 依序以俯視／追尾／第一人稱 × 每個風格截圖，最後產生並排比較的 HTML（含 tools/style-refs/ 的參考圖）。
//   node scripts/style-shots.js                       全部地圖、風格 real,zzz
//   node scripts/style-shots.js --maps=dunes,snow --styles=zzz --views=chase --tag=v2
// 輸出 test-results/style-shots/<tag>/<地圖>-<視角>-<風格>.png 與 index.html。需要先 npm run build。
/* global window, document, localStorage -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => {
  const a = process.argv.find((x) => x.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : d;
};
const TAG = arg('tag', 'now');
const OUT = path.join(ROOT, 'test-results', 'style-shots', TAG);
const ALL_MAPS = [
  'industrial',
  'grid',
  'desert',
  'snow',
  'wasteland',
  'dunes',
  'flooded',
  'dam',
  'spaceport',
  'grid086',
  'xylem',
  'orbit',
  'institute',
  'volcano',
  'ark',
];
const MAPS = arg('maps', ALL_MAPS.join(',')).split(',');
const STYLES = arg('styles', 'real,zzz').split(',');
const VIEWS = arg('views', 'top,chase,fp').split(',');
// --p=k:v,k:v（數字或 #顏色）
const OV = arg('p', '')
  ? Object.fromEntries(
      arg('p', '')
        .split(',')
        .map((kv) => kv.split(':'))
        .map(([k, v]) => [k, /^[-d.]+$/.test(v) ? +v : v]),
    )
  : null;
const EXTRA = arg('extra', '') ? arg('extra', '').split(',') : [];
const COMIC = process.argv.includes('--comic');
const BOOM = process.argv.includes('--boom');
const SHATTER = process.argv.includes('--shatter');
const extraShots = [];
const W = +arg('w', 1280),
  H = +arg('h', 720);
const EXE = [
  process.env.BENCH_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => p && fs.existsSync(p));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({
    executablePath: EXE,
    headless: true,
    args: [
      '--use-angle=d3d11',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const url = require('url').pathToFileURL(path.join(ROOT, 'dist', 'mech-cordon.html')).href + '?test';
  const errs = [];
  const shots = [];
  for (const map of MAPS) {
    // 地圖可以帶變體：dunes:night（夜間等）；檔名用 dunes_night
    const [mapId, vari = 'base'] = map.split(':');
    const mk = map.replace(':', '_');
    const ctx = await b.newContext({ viewport: { width: W, height: H } });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errs.push(`${map}: ${e}`));
    p.on('console', (m) => m.type() === 'error' && errs.push(`${map}: ${m.text()}`));
    await p.addInitScript(
      ({ mapId, vari, RENDER }) => {
        let a = 7;
        Math.random = () => {
          a = (a + 0x6d2b79f5) >>> 0;
          let t = a;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        if (!localStorage.getItem('mech_cordon_map')) {
          localStorage.setItem('mech_cordon_map', mapId);
          localStorage.setItem('mech_cordon_variant', vari);
          // --render='{"mode":"classic","cm":false}'＝畫面模式（設定的「畫面模式」「色彩管理」）
          if (RENDER) localStorage.setItem('mech_cordon_render', RENDER);
        }
      },
      { mapId, vari, RENDER: arg('render', '') },
    );
    await p.goto(url);
    await p.waitForFunction(
      () => window.__game && document.getElementById('title').offsetParent !== null,
      null,
      {
        timeout: 60000,
      },
    );
    // 新的存檔 → 機甲庫 → 出擊
    await p.click('#btnSaves');
    await p.click('#saveSlots [data-slot="1"] [data-act="new"]');
    await p.waitForFunction(() => document.getElementById('garage').offsetParent !== null, null, {
      timeout: 30000,
    });
    // --extra=garage,hub：機甲庫與作戰室（只在第一張地圖拍；主迴圈照常跑）
    if (map === MAPS[0]) {
      for (const sc of EXTRA) {
        if (sc === 'hub') {
          await p.evaluate(() => window.__game.openHub());
          await wait(4000);
        }
        for (const st of STYLES) {
          await p.evaluate((st) => window.__game.styleUse('builtin', st), st);
          await wait(1500);
          const f = `${sc}-${st}.png`;
          await p.screenshot({ path: path.join(OUT, f) });
          extraShots.push(f);
          console.log(f);
        }
        if (sc === 'hub') {
          await p.evaluate(() => window.__game.openGarage());
          await wait(2000);
        }
      }
    }
    await p.evaluate(() => window.__game.styleUse('builtin', 'real'));
    await p.click('#btnSortie');
    await p.waitForFunction(() => document.getElementById('hudWrap').offsetParent !== null, null, {
      timeout: 60000,
    });
    await wait(1500);
    // 停住主迴圈、改成逐格推進
    await p.evaluate(
      () =>
        new Promise((res) => {
          window.__pump = (sec, dt = 1 / 60) => {
            const g = window.__game;
            g.pumpDt = dt;
            try {
              for (let t = 0; t < sec - 1e-6; t += dt) {
                g.lastT = performance.now() - dt * 1000;
                g.loop();
              }
            } finally {
              g.pumpDt = 0;
            }
          };
          const raf = window.requestAnimationFrame.bind(window);
          window.requestAnimationFrame = () => 0;
          raf(() => raf(() => res()));
        }),
    );
    // 敵人擺到玩家前方（不同距離與左右），地面高度照地形；推進一點時間讓動作就位
    await p.evaluate(
      ({ SUNREL, LINEUP, HIDEHUD }) => {
        const g = window.__game,
          pl = g.player,
          w = g.world;
        // 鏡頭的方向固定在太陽（絕區零風格的方位 200°）的側面偏後：光從側面來，看得出形體；各風格同一個方向
        const az = ((200 + SUNREL) * Math.PI) / 180;
        pl.yaw = pl.aimYaw = Math.atan2(-Math.cos(az), -Math.sin(az));
        const fw = new window.THREE.Vector3(-Math.sin(pl.yaw), 0, -Math.cos(pl.yaw));
        const rt = new window.THREE.Vector3(-fw.z, 0, fw.x);
        const dk = pl.dk || 3;
        const spots = [
          [9, -4],
          [14, 6],
          [21, -9],
          [30, 11],
          [42, 1],
        ];
        let list = g.enemies.filter((e) => !e.dead && !e.isPart).slice(0, spots.length);
        // --lineup=類型,…：清掉場上的敵人，改成這些類型排成兩排（看敵人的配色）
        if (LINEUP.length) {
          for (const e of g.enemies) {
            e.hp = 0;
            if (e.mesh) e.mesh.visible = false;
          }
          g.enemies.length = 0;
          list = [];
          LINEUP.forEach((t, i) => {
            const row = Math.floor(i / 4),
              col = (i % 4) - 1.5;
            const x = pl.pos.x + fw.x * (8 + row * 7) * dk + rt.x * col * 4.5 * dk,
              z = pl.pos.z + fw.z * (8 + row * 7) * dk + rt.z * col * 4.5 * dk;
            const at = new window.THREE.Vector3(x, w.groundAt(x, z, pl.pos.y + 40), z);
            const n0 = g.enemies.length;
            try {
              g.spawnType(t, 1, 1, at);
            } catch (err) {
              console.error('lineup', t, String(err));
            }
            for (const e of g.enemies.slice(n0)) {
              e.pos.copy(at);
              e.yaw = e.aimYaw = Math.atan2(-(pl.pos.x - x), -(pl.pos.z - z));
              if (e.mesh) {
                e.mesh.position.copy(e.pos);
                e.mesh.rotation.y = e.yaw;
              }
            }
          });
        }
        if (!LINEUP.length)
          list.forEach((e, i) => {
            const [f, r] = spots[i];
            const x = pl.pos.x + fw.x * f * dk + rt.x * r * dk,
              z = pl.pos.z + fw.z * f * dk + rt.z * r * dk;
            e.pos.set(x, w.groundAt(x, z, pl.pos.y + 40), z);
            e.yaw = e.aimYaw = Math.atan2(-(pl.pos.x - x), -(pl.pos.z - z));
            if (e.vel) e.vel.set(0, 0, 0);
            if (e.mesh) {
              e.mesh.position.copy(e.pos);
              e.mesh.rotation.y = e.yaw;
            }
          });
        g.waves = [];
        g.wavePend = null;
        // 敵人不動也不開火（每個風格拍到同樣的畫面）：AI 換成空的，清掉子彈與特效
        for (const e of g.enemies) e.updateAI = () => {};
        window.__pump(0.6);
        if (g.projectiles) for (const q of g.projectiles) q.life = 0;
        if (g.fx && g.fx.clear) g.fx.clear();
        window.__pump(0.05);
        // 作戰開始的橫幅、過關條件卡片、中央訊息蓋住畫面：比對時藏起來（HUD 照舊）
        const css = document.createElement('style');
        css.textContent =
          '#tfx,#goalCard,#msg,#comm{display:none!important}' +
          (HIDEHUD ? '#ui,#hudWrap,#hud,canvas#hudC{display:none!important}' : '');
        document.head.appendChild(css);
      },
      {
        SUNREL: +arg('sunrel', 150),
        HIDEHUD: arg('hud', '1') === '0',
        LINEUP: arg('lineup', '') ? arg('lineup', '').split(',') : [],
      },
    );
    for (const view of VIEWS) {
      await p.evaluate((view) => {
        const g = window.__game,
          pl = g.player;
        g.setView(view, true);
        g.fpYaw = pl.yaw;
        g.fpPitch = view === 'fp' ? -0.03 : -0.08;
        window.__pump(0.5);
      }, view);
      for (const st of STYLES) {
        await p.evaluate(
          ({ st, ov, boom, shatter, BOOMT }) => {
            const g = window.__game;
            g.styleUse('builtin', st.split('@')[0]);
            // --p=鍵:值,…：試參數（不必重新建置），只套在第一個以外的風格（第一個當基準）
            if (ov) {
              Object.assign(g.styleP, ov);
              g.styleStructural(g.styleP);
            }
            // --boom：前三台敵人身上的大爆炸＋擊破特效（看疊加的特效會不會一片純白）
            if (boom) {
              if (g.fx.clear) g.fx.clear();
              const list = g.enemies.filter((e) => !e.dead).slice(0, 3);
              for (const e of list) {
                const c = e.center();
                g.fx.explosion(c, 4 * (e.dk || 3), 0xffa040, true);
                g.fx.killBurst(c, 1, true);
                // --shatter：先受擊閃光（mechFlash 的白色自發光）再擊碎（敵人被打碎的碎片）
                if (shatter && e.model && e.model.group.parent) {
                  if (e.model.mats) for (const m of e.model.mats) m.emissive && m.emissive.setScalar(0.9);
                  g.fx.shatter(e, g.world);
                }
              }
              window.__pump(BOOMT);
            }
            window.__pump(1 / 60);
          },
          {
            BOOMT: +arg('boomt', 0.08),
            boom: BOOM || SHATTER,
            shatter: SHATTER,
            st,
            ov: STYLES.some((x) => x.includes('@'))
              ? st.includes('@')
                ? OV
                : null
              : st !== STYLES[0]
                ? OV
                : null,
          },
        );
        await wait(400);
        const f = `${mk}-${view}-${st}.png`;
        await p.screenshot({ path: path.join(OUT, f) });
        shots.push({ map: mk, view, st, f });
        console.log(f);
        // --comic：漫畫的衝擊畫格（反色的第一拍、網點）。主迴圈停住，直接把開始時間設在過去再畫一格
        if (COMIC && view === 'chase')
          for (const [tag, ago] of [
            ['inv', 0.02],
            ['dots', 0.1],
          ]) {
            await p.evaluate((ago) => {
              const g = window.__game;
              g.comicPow = 1;
              g.comicSeed = 11;
              g.comicAt = performance.now() / 1000 - ago;
              window.__pump(1 / 60);
              g.comicAt = 0;
            }, ago);
            const fc = `${mk}-comic-${tag}-${st}.png`;
            await p.screenshot({ path: path.join(OUT, fc) });
            extraShots.push(fc);
            console.log(fc);
          }
      }
    }
    await ctx.close();
  }
  // 統計（同 docs/zzz-style-design.md 第二節）：畫面中央（寬 12～88%、高 18～82%，避開 HUD）的亮度、亮度標準差、
  // 飽和度、最暗 25% 與最亮 25% 的亮度與色偏（R−B）；參考圖是 tools/style-refs/ 的 combat_*、explore_*、scene_*
  const refDir0 = path.join(ROOT, 'tools', 'style-refs');
  const refFiles = fs.existsSync(refDir0)
    ? fs.readdirSync(refDir0).filter((x) => /^(combat|explore|scene)_.*\.jpg$/.test(x))
    : [];
  const sp = await b.newPage();
  const measure = async (file) => {
    const b64 = fs.readFileSync(file).toString('base64');
    const mime = file.endsWith('.png') ? 'image/png' : 'image/jpeg';
    return sp.evaluate(
      async ({ b64, mime }) => {
        const img = new window.Image();
        img.src = `data:${mime};base64,${b64}`;
        await img.decode();
        const W = 320,
          H = 180;
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const c = cv.getContext('2d');
        const iw = img.naturalWidth,
          ih = img.naturalHeight;
        c.drawImage(img, iw * 0.12, ih * 0.18, iw * 0.76, ih * 0.64, 0, 0, W, H);
        const d = c.getImageData(0, 0, W, H).data;
        const px = [];
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i] / 255,
            g = d[i + 1] / 255,
            bb = d[i + 2] / 255;
          const l = 0.2126 * r + 0.7152 * g + 0.0722 * bb;
          const mx = Math.max(r, g, bb),
            mn = Math.min(r, g, bb);
          px.push([l, mx > 1e-3 ? (mx - mn) / mx : 0, r - bb]);
        }
        const n = px.length;
        const L = px.reduce((a, p) => a + p[0], 0) / n;
        const sd = Math.sqrt(px.reduce((a, p) => a + (p[0] - L) ** 2, 0) / n);
        const S = px.reduce((a, p) => a + p[1], 0) / n;
        const so = px.slice().sort((a, b) => a[0] - b[0]);
        const q = Math.floor(n / 4);
        const avg = (arr, k) => arr.reduce((a, p) => a + p[k], 0) / arr.length;
        const lo = so.slice(0, q),
          hi = so.slice(n - q);
        // 過曝：亮度 0.96 以上（白色的模型、天空的太陽）
        const clip = px.filter((p) => p[0] > 0.96).length / n;
        return { L, sd, S, dL: avg(lo, 0), dC: avg(lo, 2), hL: avg(hi, 0), hC: avg(hi, 2), clip };
      },
      { b64, mime },
    );
  };
  const mean = (arr) => {
    const o = {};
    for (const k of Object.keys(arr[0] || {})) o[k] = arr.reduce((a, x) => a + x[k], 0) / arr.length;
    return o;
  };
  const fmt = (m) =>
    m && m.L !== undefined
      ? `亮度 ${m.L.toFixed(2)}、標準差 ${m.sd.toFixed(2)}、飽和度 ${m.S.toFixed(2)}、暗部 ${m.dL.toFixed(2)}（${m.dC >= 0 ? '+' : ''}${m.dC.toFixed(2)}）、亮部 ${m.hL.toFixed(2)}（${m.hC >= 0 ? '+' : ''}${m.hC.toFixed(2)}）、過曝 ${(m.clip * 100).toFixed(1)}%`
      : '';
  const refStat = refFiles.length
    ? mean(await Promise.all(refFiles.map((x) => measure(path.join(refDir0, x)))))
    : null;
  const statOf = {};
  for (const sh of shots) statOf[sh.f] = await measure(path.join(OUT, sh.f));
  const byStyle = {};
  for (const st of STYLES) byStyle[st] = mean(shots.filter((x) => x.st === st).map((x) => statOf[x.f]));
  if (refStat) console.log(`參考圖（${refFiles.length} 張）：${fmt(refStat)}`);
  for (const st of STYLES) console.log(`${st}：${fmt(byStyle[st])}`);
  await b.close();
  // 並排比較的頁面：每張地圖一列、每個視角一欄，風格上下排；最上面是參考圖
  const refDir = path.join(ROOT, 'tools', 'style-refs');
  const refs = fs.existsSync(refDir)
    ? fs.readdirSync(refDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    : [];
  const rel = (f) => path.relative(OUT, path.join(refDir, f)).replace(/\\/g, '/');
  let h = `<!doctype html><meta charset="utf-8"><title>style-shots ${TAG}</title><style>
body{background:#111;color:#ddd;font:13px sans-serif;margin:12px}img{width:100%;display:block}
.g{display:grid;grid-template-columns:repeat(${VIEWS.length},1fr);gap:6px;margin-bottom:18px}
.refs{display:grid;grid-template-columns:repeat(6,1fr);gap:4px}h2{margin:16px 0 6px}</style>`;
  h += `<h2>統計（中央區域）</h2><div>參考圖：${fmt(refStat)}</div>${STYLES.map((st) => `<div>${st}：${fmt(byStyle[st])}</div>`).join('')}`;
  if (refs.length)
    h += `<h2>參考圖</h2><div class="refs">${refs.map((f) => `<img src="${rel(f)}" title="${f}">`).join('')}</div>`;
  if (extraShots.length)
    h += `<h2>其他畫面</h2><div class="g">${extraShots.map((x) => `<div>${x}<img src="${x}"></div>`).join('')}</div>`;
  for (const map0 of MAPS) {
    const map = map0.replace(':', '_');
    h += `<h2>${map}</h2><div class="g">`;
    for (const view of VIEWS)
      h += `<div>${STYLES.map((st) => `<div>${view} / ${st}　<small>${fmt(statOf[`${map}-${view}-${st}.png`])}</small></div><img src="${map}-${view}-${st}.png">`).join('')}</div>`;
    h += '</div>';
  }
  fs.writeFileSync(path.join(OUT, 'index.html'), h);
  console.log(`${shots.length} 張 → ${path.join(OUT, 'index.html')}`);
  if (errs.length) console.log('頁面錯誤：\n  ' + [...new Set(errs)].slice(0, 20).join('\n  '));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
