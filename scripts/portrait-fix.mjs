/* global process, console, setTimeout */
// 主圖的局部修正（2026-11-15 立繪大修，docs/portrait-design.md）：產生候選，選定後用 scripts/portrait-propagate.py 套到整個姿勢
//   node scripts/portrait-fix.mjs edit <角色> <姿勢> --crop=x,y,w,h --inner=x,y,w,h --prompt="…" [--seeds=1,2] [--tag=gloves] [--src=檔名]
//       Qwen 只改 crop 那一塊（放大）、只貼回 inner 裡真的改了的像素（qwenEditCrop）
//   node scripts/portrait-fix.mjs bg <角色> <姿勢> [--seeds=1] [--src=檔名]
//       去背失敗（背景的圖形被當成角色）：Qwen 把背景改成純白 → 對齊回原圖 → BiRefNet 的遮罩；
//       新主圖＝遮罩裡用原圖的像素、外面純白（角色本身一個像素都不變）
// 候選寫進 tools/comfyui/runtime/work/fix/<角色>/（<姿勢>_fix_<tag>_<種子>.png），伺服器不用開，ComfyUI 要開
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = (f) => import(pathToFileURL(path.join(ROOT, 'mech_cordon_studio', 'js', f)).href);
const args = Object.fromEntries(
  process.argv
    .slice(5)
    .map((a) => a.match(/^--([^=]+)=(.*)$/s))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const [cmd, cid, pid] = process.argv.slice(2, 5);
const nums = (s) => String(s).split(',').map(Number);

const { Comfy } = await lib('comfy.js');
const W = await lib('workflows.js');
const c = new Comfy('http://127.0.0.1:8188');
const card = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/assets/characters', cid, 'card.json'), 'utf8'));
const P = card.poses.find((p) => p.id === pid);
const src = args.src || P.master;
const wk = path.join(ROOT, 'tools/charwork', cid);
// --src：候選資料夾裡的檔名，或某個檔案的路徑（接著修上一次修正的結果）
const srcPath = fs.existsSync(src) ? src : path.join(wk, src);
const up = await c.upload(
  fs.readFileSync(srcPath),
  `${cid}_${path.basename(src).replace(/\.(webp|png)$/, '')}.png`,
);
const seeds = args.seeds ? nums(args.seeds) : [Math.floor(Math.random() * 2 ** 31)];
const tag = args.tag || cmd;
// 候選放在 gitignore 的 tools/comfyui/runtime/work/fix/<角色>/，選定的才複製進 tools/charwork
const out = path.join(ROOT, 'tools/comfyui/runtime/work/fix', cid);
fs.mkdirSync(out, { recursive: true });

for (const seed of seeds) {
  let wf;
  if (cmd === 'edit') {
    // --head：頭部（臉框放大 head 倍，預設 2）
    let crop = args.crop && nums(args.crop);
    if (args.head) {
      const [x, y, w, h] = P.boxes.face;
      const k = Number(args.head) || 2;
      const sz = Math.max(w, h) * k;
      const x0 = Math.max(0, Math.round(x + w / 2 - sz / 2));
      const y0 = Math.max(0, Math.round(y + h / 2 - sz / 2));
      crop = [x0, y0, Math.min(832, Math.round(x0 + sz)) - x0, Math.min(1216, Math.round(y0 + sz)) - y0];
    }
    // --ref=姿勢：那個姿勢的主圖當參考圖（圖 2），指示裡可以說 like in image 2
    const refs = [];
    if (args.ref) {
      const R = card.poses.find((p) => p.id === args.ref);
      refs.push(await c.upload(fs.readFileSync(path.join(wk, R.master)), `${cid}_ref_${args.ref}.png`));
    }
    wf = W.qwenEditCrop({
      image: up,
      refs,
      crop,
      inner: args.inner ? nums(args.inner) : crop,
      prompt: `${args.prompt} Do not change anything else: same character, same face, same pose, same art style.`,
      seed,
      thr: 0.07,
      grow: 4,
      feather: 3,
    });
    // 修正不是眼睛嘴巴：不要遲滯（大塊的改變也要），留下所有大塊
    wf.pp.inputs.thr_hi = 0.07;
    wf.pp.inputs.keep_frac = 0.02;
    wf.pp.inputs.no_blush = false;
  } else if (cmd === 'bg') {
    wf = W.qwenEdit({
      images: [up],
      prompt:
        'Remove all background graphics, shapes and objects behind the character. The background must be plain pure white. Do not change the character at all.',
      seed,
    });
    // 對齊回原圖（MCAlignPaste 的第 2 個輸出），再去背取遮罩
    wf.al = {
      class_type: 'MCAlignPaste',
      inputs: { base: ['li0', 0], edit: ['dec', 0], x: 0, y: 0, w: 4, h: 4, feather: 0, align: true },
    };
    wf.rb = {
      class_type: 'BiRefNetRMBG',
      inputs: {
        image: ['al', 1],
        model: 'BiRefNet_toonout',
        sensitivity: 1,
        mask_blur: 0,
        mask_offset: 0,
        invert_output: false,
        refine_foreground: false,
        unload_model: true,
        background: 'Alpha',
        background_color: '#222222',
      },
    };
    wf.mi = { class_type: 'MaskToImage', inputs: { mask: ['rb', 1] } };
    wf.out = { class_type: 'SaveImage', inputs: { images: ['mi', 0], filename_prefix: 'chargen/fixmask' } };
    wf.out2 = { class_type: 'SaveImage', inputs: { images: ['al', 1], filename_prefix: 'chargen/fixwhite' } };
  } else throw new Error('不認得的指令：' + cmd);
  const imgs = await c.run(wf, { timeout: 10 * 60 * 1000 });
  for (const im of imgs) {
    const kind = im.filename.includes('fixmask')
      ? 'mask'
      : im.filename.includes('fixwhite')
        ? 'white'
        : 'img';
    const name = kind === 'img' ? `${pid}_fix_${tag}_${seed}.png` : `${pid}_fix_${tag}_${seed}_${kind}.png`;
    fs.writeFileSync(path.join(out, name), await c.view(im));
    console.log('FIX ' + path.join(out, name));
  }
}
