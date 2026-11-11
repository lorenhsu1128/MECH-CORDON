// 角色產生器的生產流程（docs/portrait-design.md），網頁（app.js）與命令列（scripts/chargen.js）共用
// 一個角色＝一張 card（card.json）：
// {
//   v: 1, id, name, status: 'draft'（外觀討論中）| 'look'（外觀已確認，可以量產）| 'done',
//   look: { zh: 外觀設定卡（中文，給人看）, prompt: 英文標籤（給模型）, neg },
//   refs: [參考圖（候選資料夾的檔名）], extraExprs: [{ id, name, prompt }]（招牌表情）,
//   poses: [{
//     id: 'p1', name: '平常', prompt: 姿勢的標籤, refine: 臉部重描強度（0＝不重描）,
//     cands: [{ file, seed }], master: 選定的主圖, seed,
//     boxes: { face: [x, y, w, h], eyes: [...], mouth: [...] },
//     ex: { 'smile': { cands: [檔名], pick }, 'smile.e1': {...}, 'neutral.m2': {...} }   // 表情與影格
//   }],
//   pub: { t, poses: [{ id, name, w, h, img, boxes, ex: { neutral: { e1, e2, m1, m2, m3 }, smile: { f, e1, … } } }] }
// }
// 候選與選定的圖都在候選資料夾（/api/chars/<id>/work），發佈的 WebP 在定稿資料夾（/api/chars/<id>/file）
import * as W from './workflows.js';
import { exprList, EYE_FRAMES, MOUTH_FRAMES, KEEP, KEEP_EYES, KEEP_MOUTH } from './expr.js';

export const POSE_DEFAULT = 'cowboy shot, standing, looking at viewer, white background, simple background';

export function newCard(r) {
  return {
    v: 1,
    id: r.id,
    name: r.name,
    status: 'draft',
    look: { zh: '', prompt: '', neg: '' },
    refs: [],
    extraExprs: [],
    poses: [newPose('p1', '平常')],
  };
}
export function newPose(id, name) {
  return {
    id,
    name,
    prompt: POSE_DEFAULT,
    refine: 0.25,
    cands: [],
    master: null,
    seed: 0,
    boxes: {},
    ex: {},
  };
}
export const poseOf = (card, pid) => card.poses.find((p) => p.id === pid);
const rnd = () => Math.floor(Math.random() * 2 ** 31);
const frameDef = (fid) => [...EYE_FRAMES, ...MOUTH_FRAMES].find((f) => f.id === fid);

export class Pipeline {
  // comfy：Comfy 客戶端；store：CharStore；log(文字)：進度
  constructor(comfy, store, log = () => {}) {
    this.comfy = comfy;
    this.store = store;
    this.log = log;
    this.up = new Map(); // 候選資料夾的檔名 → ComfyUI 裡的檔名（這一次執行內快取）
  }
  async uploadWork(card, name) {
    const k = card.id + '/' + name;
    if (!this.up.has(k)) {
      const data = await this.store.getWork(card.id, name);
      this.up.set(k, await this.comfy.upload(data, `${card.id}_${name}`.replace(/\.(jpe?g|webp)$/i, '.png')));
    }
    return this.up.get(k);
  }
  async runSave(card, wf, name, onProgress) {
    const imgs = await this.comfy.run(wf, { onProgress });
    const im = imgs.find((i) => !/_crop/.test(i.filename)) || imgs[0];
    if (!im) throw new Error('ComfyUI 沒有輸出');
    const data = await this.comfy.view(im);
    await this.store.putWork(card.id, name, data);
    this.up.delete(card.id + '/' + name);
    return name;
  }
  prompt(card, pose) {
    return [card.look.prompt, pose.prompt].filter(Boolean).join(', ') + ', ' + W.STYLE;
  }
  // 主圖的候選：n 張（或指定 seeds）
  async candidates(card, pid, { n = 4, seeds, onProgress } = {}) {
    const pose = poseOf(card, pid);
    const list = seeds || Array.from({ length: n }, rnd);
    const out = [];
    for (const seed of list) {
      this.log(`${card.name}／${pose.name}：主圖候選（種子 ${seed}）`);
      const name = `${pid}_cand_${seed}.png`;
      await this.runSave(
        card,
        W.txt2img({ prompt: this.prompt(card, pose), neg: card.look.neg, seed, prefix: 'chargen/cand' }),
        name,
        onProgress,
      );
      pose.cands.push({ file: name, seed });
      out.push(name);
    }
    return out;
  }
  // 表情或影格的底圖：表情＝主圖；影格（smile.e1）＝那個表情選定的圖（neutral＝主圖）
  baseOf(pose, key) {
    const ex = key.split('.')[0];
    if (!key.includes('.')) return pose.master;
    if (ex === 'neutral') return pose.master;
    const e = pose.ex[ex];
    if (!e || !e.pick) throw new Error(`先選定「${ex}」的表情`);
    return e.pick;
  }
  // 產生表情（key＝表情 id）或影格（key＝表情 id.影格 id）的候選
  async variant(card, pid, key, { n = 2, seeds, onProgress, extra = '' } = {}) {
    const pose = poseOf(card, pid);
    if (!pose.master) throw new Error('先選定主圖');
    const B = pose.boxes;
    const [exId, fid] = key.split('.');
    let prompt, box, feather;
    if (!fid) {
      const def = exprList(card).find((e) => e.id === exId);
      if (!def || !def.prompt) throw new Error('這個表情不用產生：' + exId);
      if (!B.face) throw new Error('先標出臉的範圍');
      prompt = `${def.prompt} ${extra} ${KEEP}`;
      box = B.face;
      feather = 14;
    } else {
      const f = frameDef(fid);
      const eye = fid[0] === 'e';
      box = eye ? B.eyes : B.mouth;
      if (!box) throw new Error(eye ? '先標出眼睛的範圍' : '先標出嘴巴的範圍');
      prompt = `${f.prompt} ${extra} ${eye ? KEEP_MOUTH : KEEP_EYES} ${KEEP}`;
      feather = 10;
    }
    const base = await this.uploadWork(card, this.baseOf(pose, key));
    const list = seeds || Array.from({ length: n }, rnd);
    const slot = (pose.ex[key] ||= { cands: [], pick: null });
    const out = [];
    for (const seed of list) {
      this.log(`${card.name}／${pose.name}：${key}（種子 ${seed}）`);
      const name = `${pid}_${key.replace('.', '_')}_${seed}.png`;
      if (fid && fid[0] === 'm') {
        // 嘴型：嘴巴在整張圖上只有 30 px 左右，Qwen 改出來會糊（第 1 期的測試）→ SDXL 把附近裁出來放大重畫、只貼回嘴巴
        const [x, y, w, h] = box;
        const s = Math.round(Math.max(w, h) * 4);
        const cx = Math.max(0, Math.round(x + w / 2 - s / 2));
        const cy = Math.max(0, Math.round(y + h / 2 - s / 2));
        const ex = exprList(card).find((e) => e.id === exId);
        await this.runSave(
          card,
          W.inpaintBox({
            image: base,
            box: [cx, cy, s, s],
            inner: box,
            feather: 6,
            prompt: `portrait, face, close-up, ${card.look.prompt}, ${ex?.tags || ''}, ${frameDef(fid).tags}, ${W.STYLE}`,
            neg: card.look.neg,
            denoise: 0.92,
            seed,
          }),
          name,
          onProgress,
        );
        slot.cands.push(name);
        out.push(name);
        continue;
      }
      await this.runSave(
        card,
        W.qwenEdit({ images: [base], prompt, seed, paste: box, feather }),
        name,
        onProgress,
      );
      // 表情：貼回之後以 SDXL 低強度重描臉，讓線條和主圖一致（第 1 期的測試：0.25 最好，0.35 以上會擦掉細的配件）
      if (!fid && pose.refine > 0) {
        this.log(`  重描臉部（${pose.refine}）`);
        const up = await this.uploadWork(card, name);
        const [x, y, w, h] = box;
        const pad = Math.round(Math.max(w, h) * 0.25);
        await this.runSave(
          card,
          W.inpaintBox({
            image: up,
            box: [Math.max(0, x - pad), Math.max(0, y - pad), w + pad * 2, h + pad * 2],
            inner: box,
            feather: 14,
            prompt: `portrait, face, ${card.look.prompt}, ${W.STYLE}`,
            neg: card.look.neg,
            denoise: pose.refine,
            seed,
          }),
          name,
          onProgress,
        );
      }
      slot.cands.push(name);
      out.push(name);
    }
    return out;
  }
  // 發佈：主圖整張、每個表情的臉、每個影格的眼睛／嘴巴裁成 WebP 放進定稿資料夾，card.pub 記下
  async publish(card, { quality = 88, onProgress } = {}) {
    const pub = { t: Date.now(), poses: [] };
    const files = [];
    for (const pose of card.poses) {
      if (!pose.master) continue;
      const B = pose.boxes;
      const P = { id: pose.id, name: pose.name, img: `${pose.id}.webp`, boxes: B, ex: {} };
      const wf = {};
      let k = 0;
      const src = new Map();
      const load = async (file) => {
        if (!src.has(file)) {
          const id = 'l' + src.size;
          wf[id] = { class_type: 'LoadImage', inputs: { image: await this.uploadWork(card, file) } };
          src.set(file, id);
        }
        return src.get(file);
      };
      const crop = async (file, box, name, mask) => {
        const [x, y, w, h] = box || [0, 0, 0, 0];
        wf['s' + k++] = {
          class_type: 'MCCropSave',
          inputs: {
            image: [await load(file), 0],
            x,
            y,
            w,
            h,
            quality,
            name: `${card.id}_${name}`,
            ...(mask ? { mask } : {}),
          },
        };
        files.push(name);
        return `${name}.webp`;
      };
      // 主圖去背（BiRefNet 的動漫專用版 toonout）→ 有透明的 WebP；臉、眼、嘴的小圖都在身體裡面，不用去背
      wf.bg = {
        class_type: 'BiRefNetRMBG',
        // 選用的參數也要全部給（外掛的程式直接讀，沒給會出錯）
        inputs: {
          image: [await load(pose.master), 0],
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
      await crop(pose.master, null, pose.id, ['bg', 1]);
      for (const e of exprList(card)) {
        const ex = {};
        if (e.id !== 'neutral') {
          const pick = pose.ex[e.id]?.pick;
          if (!pick) continue;
          if (B.face) ex.f = await crop(pick, B.face, `${pose.id}_${e.id}_f`);
        }
        for (const f of [...EYE_FRAMES, ...MOUTH_FRAMES]) {
          const pick = pose.ex[`${e.id}.${f.id}`]?.pick;
          const box = f.id[0] === 'e' ? B.eyes : B.mouth;
          if (pick && box) ex[f.id] = await crop(pick, box, `${pose.id}_${e.id}_${f.id}`);
        }
        P.ex[e.id] = ex;
      }
      this.log(`${card.name}／${pose.name}：發佈 ${k} 張`);
      const imgs = await this.comfy.run(wf, { onProgress });
      for (const im of imgs) {
        const name = im.filename.replace(new RegExp('^' + card.id + '_'), '');
        await this.store.putFile(card.id, name, await this.comfy.view(im));
      }
      const meta = await this.imageSize(card, pose.master);
      P.w = meta.w;
      P.h = meta.h;
      pub.poses.push(P);
    }
    // 拿掉定稿資料夾裡這一版沒有的舊檔
    const keep = new Set(files.map((f) => f + '.webp'));
    for (const f of await this.store.listFiles(card.id))
      if (/\.webp$/.test(f.name) && !keep.has(f.name)) await this.store.delFile(card.id, f.name);
    card.pub = pub;
    await this.store.putCard(card);
    return pub;
  }
  async imageSize(card, file) {
    const d = await this.store.getWork(card.id, file);
    // PNG：IHDR 的寬高
    if (d[0] === 0x89 && d[1] === 0x50) {
      const v = new DataView(d.buffer, d.byteOffset);
      return { w: v.getUint32(16), h: v.getUint32(20) };
    }
    return { w: 832, h: 1216 };
  }
}
