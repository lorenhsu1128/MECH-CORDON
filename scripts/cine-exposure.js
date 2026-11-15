// 過場的亮度（docs/cine-redesign-design.md 第十一節「亮度」）：播每一段過場，在每個 3D 鏡頭（地圖、室內、太空）量 3D 畫面的
// 平均亮度（藏起 2D 疊層、字幕，裁掉上下的遮幅），太暗的反覆調曝光直到到達目標，結果寫進 src/data/cine/exposure.js 的 CINE_EXPO。
// 只調亮（倍率 1～MAX）；劇本標 dark: true 的鏡頭不動；同一鏡（場景＋鏡頭相同）在各周目共用。
//   node scripts/cine-exposure.js                 全部（第 1 周目的 35 段）
//   node scripts/cine-exposure.js i1_2,o1_5       只量這幾段（其他的鍵照舊保留）
//   --target=0.26 --max=2.6                       目標亮度與上限
// 要先 npm run build；量完再 build 一次。
/* global window, document -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const opt = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.slice(2).split('=');
      return [k, v === undefined ? true : v];
    }),
);
const TARGET = +(opt.target || 0.26),
  MAX = +(opt.max || 2.6);
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
const FILE = path.join(__dirname, '..', 'src', 'data', 'cine', 'exposure.js');
const W = 960,
  H = 540;

const lum = async (buf) => {
  const { data, info } = await sharp(buf)
    .extract({ left: 0, top: Math.round(H * 0.14), width: W, height: Math.round(H * 0.72) })
    .resize(96, 44, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let s = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i++)
    s += (0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2]) / 255;
  return s / n;
};

(async () => {
  const old = fs.readFileSync(FILE, 'utf8');
  const m = old.match(/export const CINE_EXPO = (\{[\s\S]*?\});/);
  const table = m ? new Function('return ' + m[1])() : {}; // 物件字面值（prettier 會拿掉不必要的引號）
  const exe = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: [
      '--use-angle=d3d11',
      '--enable-gpu',
      '--ignore-gpu-blocklist',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const url =
    'file:///' +
    path.resolve(__dirname, '..', 'dist', 'mech-cordon.html').split(path.sep).join('/') +
    '?test';
  const report = [];
  try {
    for (const key of keys) {
      const page = await browser.newPage({ viewport: { width: W, height: H } });
      page.on('pageerror', (e) => console.log(`[${key}] 頁面錯誤`, e.message));
      await page.goto(url);
      await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
        timeout: 60000,
      });
      const shots = await page.evaluate(async (key) => {
        const g = window.__game;
        g.cineTest = 1;
        g.cineExpoTest = {};
        g.cinePlay(key, () => {});
        while (!(g.cine && g.cine.started)) await new Promise((r) => setTimeout(r, 100));
        const sh = g.cine.def.shots;
        return sh.map((s, i) => ({
          i,
          at: s.at,
          end: i + 1 < sh.length ? sh[i + 1].at : g.cine.def.dur,
          k: (s.set && s.set.k) || 'black',
          dark: !!s.dark,
        }));
      }, key);
      // 量測時藏起 2D 疊層與字幕
      await page.addStyleTag({
        content: '#cineScr,#tfx,#subBar,#cineFade,#cine2d,#cineCv,#cineSub{visibility:hidden!important}',
      });
      for (const s of shots) {
        if (!['world', 'room', 'space'].includes(s.k) || s.dark || s.end - s.at < 0.6) continue;
        const t = +(s.at + Math.min(1.2, (s.end - s.at) * 0.6)).toFixed(2);
        await page.evaluate((t) => {
          const g = window.__game;
          g.cine.paused = false;
          g.cineSeek(Math.max(0, t - 0.4));
        }, t);
        await page.waitForFunction((t) => window.__game.cine && window.__game.cine.t >= t, t, {
          timeout: 20000,
        });
        const info = await page.evaluate(() => {
          const c = window.__game.cine;
          c.paused = true;
          return { xk: c.xk };
        });
        if (!info.xk) continue;
        let mul = 1,
          L = 0;
        for (let it = 0; it < 5; it++) {
          await page.evaluate((m) => (window.__game.cine.xm = m), mul);
          await page.waitForTimeout(160);
          L = await lum(await page.screenshot());
          if (it === 0) s.L0 = L;
          if (L >= TARGET * 0.97 || mul >= MAX) break;
          mul = Math.min(
            MAX,
            mul * Math.max(1.08, Math.min(1.9, Math.pow(TARGET / Math.max(L, 0.01), 0.85))),
          );
        }
        mul = +mul.toFixed(2);
        if (mul > 1.02) table[info.xk] = mul;
        else delete table[info.xk];
        report.push(`${key}#${s.i}（${s.k}，${t} 秒）：${s.L0.toFixed(3)} → ${L.toFixed(3)}，×${mul}`);
        console.log(report[report.length - 1]);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
  const body = Object.keys(table)
    .sort()
    .map((k) => `  '${k}': ${table[k]},`)
    .join('\n');
  fs.writeFileSync(
    FILE,
    old.replace(/export const CINE_EXPO = \{[\s\S]*?\};/, `export const CINE_EXPO = {\n${body}\n};`),
  );
  console.log(`${Object.keys(table).length} 鏡有補正 → ${path.relative(process.cwd(), FILE)}`);
  require('child_process').spawnSync('npx', ['prettier', '--write', FILE], { shell: true });
})();
