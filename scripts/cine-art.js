// 過場的場景插畫（docs/cine-redesign-design.md 第 2 期）：角色產生器的工作流程（mech_cordon_charagen/js/workflows.js）
// 產生 2D 舞台用的插畫，選定的存成 src/assets/cine-art/<章>/<id>.webp（建置成 dist/lib/cine-art-<章>.js，
// 劇本以 img: '<章>/<id>' 使用；game/cine-2d.js）。先 npm run comfy 啟動 ComfyUI。
//
// 插畫的定義在 tools/cine-art/scenes.json：{ "<id>": { ch, w, h, prompt, neg, steps, cfg,
//   bg: '<另一張插畫的 id>'（有角色的插畫：以那張選定的背景為圖 1）, char: { id, pose }（角色的主圖為圖 2）, edit: 'Qwen 的指示',
//   tone: '#rrggbb'（選定時套單色）, pick: 種子 } }
//   - 沒有 char：NoobAI 文字生圖（畫風同立繪，寬幅的背景或空景）
//   - 有 char：Qwen-Image-Edit 把角色（主圖）放進背景、照指示擺動作與構圖（臉與服裝和立繪一致）
//
//   node scripts/cine-art.js list
//   node scripts/cine-art.js gen <id> [--seeds=1,2,3 | --n=3]     候選 → tools/comfyui/runtime/work/cine-art/<id>/<種子>.png
//   node scripts/cine-art.js sheet <id>                           候選的總表 → …/<id>/sheet.jpg
//   node scripts/cine-art.js pick <id> <種子>                     選定 → src/assets/cine-art/<章>/<id>.webp（寫回 scenes.json 的 pick）
//   共用：--comfy=http://127.0.0.1:8188
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DEF = path.join(ROOT, 'tools', 'cine-art', 'scenes.json');
const WORK = path.join(ROOT, 'tools', 'comfyui', 'runtime', 'work', 'cine-art');
const OUT = path.join(ROOT, 'src', 'assets', 'cine-art');
const CHARS = path.join(ROOT, 'src', 'assets', 'characters');
const lib = (f) => import(pathToFileURL(path.join(ROOT, 'mech_cordon_charagen', 'js', f)).href);

function args() {
  const o = { _: [] };
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/s);
    if (m) o[m[1]] = m[2] === undefined ? true : m[2];
    else o._.push(a);
  }
  return o;
}
const load = () => JSON.parse(fs.readFileSync(DEF, 'utf8'));
const save = (d) => fs.writeFileSync(DEF, JSON.stringify(d, null, 2) + '\n');
const chDir = (S) => 'c' + S.ch;
// sharp 讀檔會鎖住檔案（Windows），一律先讀進記憶體
const img = (f) => sharp(fs.readFileSync(f));

async function gen(id, a) {
  const all = load();
  const S = all[id];
  if (!S) throw new Error('scenes.json 沒有：' + id);
  const W = await lib('workflows.js');
  const { Comfy } = await lib('comfy.js');
  const c = new Comfy(a.comfy || 'http://127.0.0.1:' + (process.env.COMFY_PORT || 8188));
  if (!(await c.alive())) throw new Error('ComfyUI 沒有在執行：先 npm run comfy');
  const seeds = a.seeds
    ? String(a.seeds).split(',').map(Number)
    : Array.from({ length: +a.n || 3 }, () => Math.floor(Math.random() * 1e9));
  const dir = path.join(WORK, id);
  fs.mkdirSync(dir, { recursive: true });
  let build;
  if (S.char) {
    // 背景（選定的另一張插畫）＋角色的主圖（透明底 → 灰底，Qwen 不吃透明）
    const B = all[S.bg];
    if (!B || !B.pick) throw new Error(`先選定背景 ${S.bg}`);
    const bgFile = path.join(OUT, chDir(B), S.bg + '.webp');
    const bgPng = await img(bgFile).png().toBuffer();
    const cf = path.join(CHARS, S.char.id, (S.char.pose || 'p1') + '.webp');
    const meta = await img(cf).metadata();
    const chPng = await img(cf)
      .flatten({ background: '#9a9a9a' })
      .resize({ width: meta.width, height: meta.height })
      .png()
      .toBuffer();
    const bgName = await c.upload(bgPng, `cineart_${S.bg}.png`);
    const chName = await c.upload(chPng, `cineart_${S.char.id}_${S.char.pose || 'p1'}.png`);
    build = (seed) =>
      W.qwenEdit({
        images: [bgName, chName],
        prompt: S.edit,
        seed,
        steps: S.steps || 4,
        prefix: 'cineart/' + id,
      });
  } else
    build = (seed) =>
      W.txt2img({
        prompt: [S.prompt, W.STYLE].join(', '),
        neg: S.neg || '',
        seed,
        w: S.w || 1344,
        h: S.h || 768,
        steps: S.steps || 30,
        cfg: S.cfg || 5.5,
        prefix: 'cineart/' + id,
      });
  for (const seed of seeds) {
    const t0 = Date.now();
    const out = await c.run(build(seed));
    const f = path.join(dir, `${seed}.png`);
    fs.writeFileSync(f, await c.view(out[out.length - 1]));
    console.log(`${f}（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
  }
}

async function sheet(id) {
  const dir = path.join(WORK, id);
  const fsx = fs
    .readdirSync(dir)
    .filter((n) => /^\d+\.png$/.test(n))
    .sort();
  const Wd = 640;
  const tiles = [];
  for (const n of fsx) {
    const b = await img(path.join(dir, n)).resize({ width: Wd }).toBuffer({ resolveWithObject: true });
    tiles.push({ n, b });
  }
  if (!tiles.length) throw new Error('沒有候選');
  const H = tiles[0].b.info.height,
    C = Math.min(3, tiles.length);
  const comp = [];
  tiles.forEach((t, i) => {
    comp.push({ input: t.b.data, left: (i % C) * Wd, top: Math.floor(i / C) * (H + 28) + 28 });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Wd}" height="28"><text x="8" y="20" font-size="18" fill="#fff" font-family="sans-serif">${t.n}</text></svg>`;
    comp.push({ input: Buffer.from(svg), left: (i % C) * Wd, top: Math.floor(i / C) * (H + 28) });
  });
  const f = path.join(dir, 'sheet.jpg');
  await sharp({
    create: {
      width: Wd * C,
      height: Math.ceil(tiles.length / C) * (H + 28),
      channels: 3,
      background: '#111',
    },
  })
    .composite(comp)
    .jpeg({ quality: 80 })
    .toFile(f);
  console.log(f);
}

async function pick(id, seed) {
  const all = load();
  const S = all[id];
  if (!S) throw new Error('scenes.json 沒有：' + id);
  const src = path.join(WORK, id, `${seed}.png`);
  if (!fs.existsSync(src)) throw new Error('沒有這個候選：' + src);
  const d = path.join(OUT, chDir(S));
  fs.mkdirSync(d, { recursive: true });
  let p = img(src).resize({ width: 1600, withoutEnlargement: true });
  if (S.tone) p = p.grayscale().tint(S.tone);
  await p.webp({ quality: 84 }).toFile(path.join(d, id + '.webp'));
  S.pick = Number(seed);
  save(all);
  console.log(path.join(d, id + '.webp'));
}

async function main() {
  const a = args();
  const [cmd, id, seed] = a._;
  if (cmd === 'list') {
    for (const [k, S] of Object.entries(load()))
      console.log(
        `${k}\t第 ${S.ch} 章\t${S.char ? '角色＋背景 ' + S.bg : '文字生圖'}\t${S.pick ? '選定 ' + S.pick : '未選'}`,
      );
  } else if (cmd === 'gen') await gen(id, a);
  else if (cmd === 'sheet') await sheet(id);
  else if (cmd === 'pick') await pick(id, seed);
  else throw new Error('指令：list／gen／sheet／pick');
}
main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
