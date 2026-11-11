// 角色產生器的命令列：用和網頁相同的工作流程（mech_cordon_charagen/js/workflows.js）叫本機的 ComfyUI 產生圖
// 先 npm run comfy 啟動 ComfyUI。輸出放在 tools/comfyui/runtime/work/<--out>/（不進 git）
//   node scripts/chargen.js t2i --prompt="…" [--base=noob|wai] [--lora=0.8] [--seeds=1,2,3] [--w=832 --h=1216] --out=test/a
//   node scripts/chargen.js inpaint --image=<png> --box=x,y,w,h --prompt="…" [--denoise=0.55] [--seeds=…] --out=…
//   node scripts/chargen.js edit --images=<png>[,<png>…] --prompt="…" [--seeds=…] --out=…
// 其他參數照工作流程函式的名稱傳（數字自動轉換）
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const WORK = path.join(ROOT, 'tools', 'comfyui', 'runtime', 'work');
const LIB = path.join(ROOT, 'mech_cordon_charagen', 'js');

function parseArgs() {
  const o = {};
  for (const a of process.argv.slice(3)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/s);
    if (!m) continue;
    const v = m[2] === undefined ? true : m[2];
    o[m[1]] = typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  }
  return o;
}

async function main() {
  const cmd = process.argv[2];
  const a = parseArgs();
  const { Comfy } = await import(pathToFileURL(path.join(LIB, 'comfy.js')).href);
  const W = await import(pathToFileURL(path.join(LIB, 'workflows.js')).href);
  const c = new Comfy(a.host || 'http://127.0.0.1:' + (process.env.COMFY_PORT || 8188));
  if (!(await c.alive())) throw new Error('ComfyUI 沒有在執行：先 npm run comfy');
  const out = path.join(WORK, a.out || 'misc');
  fs.mkdirSync(out, { recursive: true });
  const seeds = String(a.seeds ?? Math.floor(Math.random() * 1e9))
    .split(',')
    .map(Number);
  const up = async (f) => c.upload(fs.readFileSync(f), path.basename(f));
  const opts = { ...a };
  delete opts.out;
  delete opts.seeds;
  delete opts.host;
  let build;
  if (cmd === 't2i') build = (seed) => W.txt2img({ ...opts, seed });
  else if (cmd === 'inpaint') {
    opts.image = await up(a.image);
    opts.box = String(a.box).split(',').map(Number);
    if (a.inner) opts.inner = String(a.inner).split(',').map(Number);
    build = (seed) => W.inpaintBox({ ...opts, seed });
  } else if (cmd === 'edit') {
    opts.images = [];
    for (const f of String(a.images).split(',')) opts.images.push(await up(f));
    if (a.paste) opts.paste = String(a.paste).split(',').map(Number);
    if (a.onto) opts.onto = await up(a.onto);
    build = (seed) => W.qwenEdit({ ...opts, seed });
  } else throw new Error('不認得的指令：' + cmd);
  for (const seed of seeds) {
    const t0 = Date.now();
    const imgs = await c.run(build(seed));
    for (const im of imgs) {
      const tag = im.filename.includes('_crop') ? '_crop' : '';
      const f = path.join(out, `${cmd}_${seed}${tag}.png`);
      fs.writeFileSync(f, await c.view(im));
      console.log(f);
    }
    console.log(`  種子 ${seed}：${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
