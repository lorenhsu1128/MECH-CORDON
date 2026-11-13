// 把選好的新姿勢登記進角色設定卡：node addposes.mjs <角色,…>
// 讀 picks.json（選的種子）、B.json（框）、names（姿勢的中文名），圖轉 WebP 存成工作檔 <pid>_cand_<seed>.webp
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
const ROOT = 'C:/Users/LOREN/Documents/_projects/MECH-CORDON';
const require = createRequire(ROOT + '/package.json');
const sharp = require('sharp');
const D = path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, '$1');
const { CharStore } = await import(pathToFileURL(ROOT + '/mech_cordon_charagen/js/store.js').href);
const P = await import(pathToFileURL(ROOT + '/mech_cordon_charagen/js/pipeline.js').href);
const picks = JSON.parse(fs.readFileSync(D + '/picks.json', 'utf8'));
const B = JSON.parse(fs.readFileSync(D + '/B.json', 'utf8'));
const NAMES = JSON.parse(fs.readFileSync(D + '/names.json', 'utf8'));
const store = new CharStore('http://127.0.0.1');
for (const cid of process.argv[2].split(',')) {
  const card = await store.getCard(cid);
  const p1 = card.poses.find((p) => p.id === 'p1');
  for (const [key, pv] of Object.entries(picks[cid])) {
    // pv＝種子，或「資料夾:種子」（重畫的放在 v2/<資料夾>/）
    const [dir, seed] = String(pv).includes(":") ? [String(pv).split(":")[0], +String(pv).split(":")[1]] : [cid, pv];
    const pid = key.split('_')[0];
    const box = B[cid]?.[key];
    if (!box) {
      console.log(cid, key, '沒有框，略過');
      continue;
    }
    if (card.poses.find((p) => p.id === pid)) {
      console.log(cid, pid, '已經有了，略過');
      continue;
    }
    const src = `${ROOT}/tools/comfyui/runtime/work/v2/${dir}/${key}/edit_${seed}.png`;
    const file = `${pid}_cand_${seed}.webp`;
    const buf = await sharp(src).webp({ quality: 95 }).toBuffer();
    await store.putWork(cid, file, buf);
    const pose = P.newPose(pid, NAMES[key] || key);
    pose.prompt = `v2 姿勢（Qwen-Image-Edit 從 p1 改）：${key}`;
    pose.refine = p1.refine ?? 0.25;
    pose.cands = [{ file, seed }];
    pose.master = file;
    pose.seed = seed;
    pose.boxes = { face: box.face, eyes: box.eyes, mouth: box.mouth };
    card.poses.push(pose);
    console.log(cid, pid, NAMES[key], file);
  }
  await store.putCard(card);
}
