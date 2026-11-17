/* global process, console, setTimeout */
// 眼鏡的探測（拿掉眼鏡，差異＝鏡框；scripts/portrait-glasses.py 用它在眨眼影格補回鏡框）。改自 portrait-eyeprobe.mjs：（2026-11-15 立繪大修，docs/portrait-design.md）：手標的眼睛框有的沒框到眼睛（眼睛壓在框邊、只框到一隻、框在鼻子上），
// 眨眼影格只能改框裡，框外的眼睛就閉不起來。這裡讓 Qwen 在「整張臉」上把眼睛閉上（inner＝臉框），
// 存成 tools/comfyui/runtime/work/glassprobe/<角色>_<姿勢>.png，之後 scripts/portrait-eyebox.py 從改到的地方算出眼睛框。
//   node scripts/portrait-eyeprobe.mjs <角色>… [--force]（已經有探測圖的略過）
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const lib = (f) => import(pathToFileURL(path.join(ROOT, 'mech_cordon_charagen', 'js', f)).href);
const { Comfy } = await lib('comfy.js');
const W = await lib('workflows.js');
const c = new Comfy('http://127.0.0.1:8188');
const force = process.argv.includes('--force');
const out = path.join(ROOT, 'tools/comfyui/runtime/work/glassprobe');
fs.mkdirSync(out, { recursive: true });

for (const cid of process.argv.slice(2).filter((a) => !a.startsWith('--'))) {
  const card = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'src/assets/characters', cid, 'card.json'), 'utf8'),
  );
  for (const P of card.poses) {
    if (!P.master || !P.boxes?.face) continue;
    const dst = path.join(out, `${cid}_${P.id}.png`);
    if (!force && fs.existsSync(dst)) continue;
    const [x, y, w, h] = P.boxes.face;
    const s = Math.max(w, h) * 1.4;
    const cx = Math.max(0, Math.round(x + w / 2 - s / 2));
    const cy = Math.max(0, Math.round(y + h / 2 - s / 2));
    const crop = [cx, cy, Math.min(832, Math.round(cx + s)) - cx, Math.min(1216, Math.round(cy + s)) - cy];
    const up = await c.upload(
      fs.readFileSync(path.join(ROOT, 'tools/charwork', cid, P.master)),
      `${cid}_${P.id}_gprobe.png`,
    );
    for (let t = 0; t < 3; t++) {
      try {
        const wf = W.qwenEditCrop({
          image: up,
          crop,
          inner: P.boxes.face,
          thrHi: 0.07,
          prompt:
            'Remove the glasses completely (frame, lenses, nose pads and temples): show the face, eyes and hair behind them. Change nothing else: same eyes, same eyebrows, same hair, same face.',
          seed: 777 + t,
          keepFrac: 0.05,
        });
        const imgs = await c.run(wf, { timeout: 5 * 60 * 1000 });
        fs.writeFileSync(dst, await c.view(imgs[0]));
        console.log('GPROBE ' + cid + ' ' + P.id);
        break;
      } catch (e) {
        console.log('  retry ' + cid + ' ' + P.id + ' ' + e.message);
        await new Promise((r) => setTimeout(r, 20000));
      }
    }
  }
}
