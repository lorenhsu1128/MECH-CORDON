// 角色產生器的生產流程（docs/portrait-design.md），網頁（app.js）與命令列（scripts/chargen.js）共用
// 一個角色＝一張 card（card.json）：
// {
//   v: 1, id, name, status: 'draft'（外觀討論中）| 'look'（外觀已確認，可以量產）| 'done',
//   look: { zh: 外觀設定卡（中文，給人看）, prompt: 英文標籤（給模型）, neg },
//   refs: [參考圖（候選資料夾的檔名）], extraExprs: [{ id, name, prompt }]（招牌表情）,
//   layers: true（發佈時以 See-through 拆成四層，給分層動畫）,
//   poses: [{
//     id: 'p1', name: '平常', prompt: 姿勢的標籤, refine: 臉部重描強度（0＝不重描）,
//     cands: [{ file, seed }], master: 選定的主圖, seed,
//     boxes: { face: [x, y, w, h], eyes: [...], mouth: [...] },
//     ex: { 'smile': { cands: [檔名], pick }, 'smile.e1': {...}, 'neutral.m2': {...} }   // 表情與影格
//   }],
//   pub: { t, poses: [{ id, name, w, h, img, boxes, ex: { neutral: { e1, e2, m1, m2, m3 }, smile: { f, e1, … } },
//          layers: { hairb, body, head, hairf }（有分層時：四張 WebP 的檔名） }] }
// }
// 候選與選定的圖都在候選資料夾（/api/chars/<id>/work），發佈的 WebP 在定稿資料夾（/api/chars/<id>/file）
import * as W from './workflows.js';
import {
  exprList,
  frameList,
  EYE_FRAMES,
  MOUTH_FRAMES,
  KEEP,
  KEEP_EYES,
  KEEP_MOUTH,
  NO_GLASSES,
  KEEP_GLASSES,
  OPEN_MOUTH_FRAMES,
  OPEN_MOUTH_RE,
  SMILE_MOUTH_FRAMES,
  SMILE_RE,
  MOUTH_STYLE,
} from './expr.js';

// 分層動畫的四層（由後往前；tools/comfyui/nodes 的 MCLayerGroups）
export const LAYER_GROUPS = ['hairb', 'body', 'head', 'hairf'];

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
// 不眨眼的表情：大笑一律是 ^^ 閉眼（產生閉眼影格時 Qwen 反而畫成睜眼），再加上 pose.noBlink（閉眼的姿勢等）
export const NO_BLINK = ['laugh', 'wink'];
export const noBlink = (pose) => [...NO_BLINK, ...(pose.noBlink || [])];
// 戴眼鏡的角色（look.prompt 有 glasses、不是 sunglasses：墨鏡的鏡片有顏色，疊回鏡框會留下沒有鏡片的眼睛）
// card.glasses：手動指定（COUNTDOWN 的橘色圓墨鏡：不說要保留，閉眼時 Qwen 會把整副擦掉，2026-11-16）
export const glassesChar = (card) =>
  card.glasses ??
  (/\bglasses\b/.test(card.look?.prompt || '') &&
    !/\b(no glasses|sunglasses)\b/.test(card.look?.prompt || ''));
export const poseOf = (card, pid) => card.poses.find((p) => p.id === pid);
const rnd = () => Math.floor(Math.random() * 2 ** 31);
const frameDef = (fid) => [...EYE_FRAMES, ...MOUTH_FRAMES].find((f) => f.id === fid);

// 影格的範圍：crop＝臉框放大 1.4 倍（給 Qwen 的上下文），inner＝可以改的地方。
// 嘴巴：pose.boxes.mouth（2026-11-15 起發佈前由 widenMouth 放大過，大笑、吼叫的嘴才放得下）
export function frameRegion(B, fid, { w: IW, h: IH }) {
  const [fx, fy, fw, fh] = B.face;
  const s = Math.max(fw, fh) * 1.4;
  const cx = fx + fw / 2;
  const cy = fy + fh / 2;
  const x = Math.max(0, Math.round(cx - s / 2));
  const y = Math.max(0, Math.round(cy - s / 2));
  const crop = [x, y, Math.min(IW, Math.round(x + s)) - x, Math.min(IH, Math.round(y + s)) - y];
  const inner = (fid[0] === 'e' ? B.eyes : B.mouth).map(Math.round);
  return { crop, inner };
}
// 嘴框放大（寬 ×1.7、高 ×2.2，不超過眼睛框的下緣與臉框）：以前所有表情共用一個小嘴框，大笑的嘴被切掉
export function widenMouth(B) {
  const [x, y, w, h] = B.mouth;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const W2 = w * 1.7;
  let y0 = cy - h * 1.1;
  let y1 = cy + h * 1.1;
  // 上緣不超過眼睛框的下緣，但最多只推到原本嘴框的上緣：頭歪的時候眼睛框的下緣伸到嘴旁邊，
  // 推過頭會把嘴擠到框的上緣、上唇改不到（2026-11-18 立繪工房的自動標框）
  if (B.eyes) y0 = Math.max(y0, Math.min(B.eyes[1] + B.eyes[3] + 4, y));
  if (B.face) y1 = Math.min(y1, B.face[1] + B.face[3] * 1.08);
  return [Math.round(cx - W2 / 2), Math.round(y0), Math.round(W2), Math.round(y1 - y0)];
}

export class Pipeline {
  // comfy：Comfy 客戶端；store：CharStore；log(文字)：進度
  constructor(comfy, store, log = () => {}) {
    this.comfy = comfy;
    this.store = store;
    this.log = log;
    this.up = new Map(); // 候選資料夾的檔名 → ComfyUI 裡的檔名（這一次執行內快取）
    this.project = null; // 專案設定（docs/portrait-studio-design.md 第三節）：畫風、主圖大小；null＝遊戲的預設
    this.sizes = new Map();
  }
  // 專案的畫風：style.prompt（加在提示詞後面，沒有＝絕區零）、style.neg、主圖大小 style.w／h
  styleOf() {
    const st = (this.project && this.project.style) || {};
    return {
      prompt: st.prompt != null && st.prompt !== '' ? st.prompt : W.STYLE,
      neg: st.neg || '',
      w: +st.w || 832,
      h: +st.h || 1216,
    };
  }
  async uploadWork(card, name) {
    const k = this.store.project + '/' + card.id + '/' + name;
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
    this.up.delete(this.store.project + '/' + card.id + '/' + name);
    return name;
  }
  prompt(card, pose) {
    return [card.look.prompt, pose.prompt, this.styleOf().prompt].filter(Boolean).join(', ');
  }
  // 主圖的候選：n 張（或指定 seeds）
  async candidates(card, pid, { n = 4, seeds, onProgress } = {}) {
    const pose = poseOf(card, pid);
    const list = seeds || Array.from({ length: n }, rnd);
    const out = [];
    for (const seed of list) {
      this.log(`${card.name}／${pose.name}：主圖候選（種子 ${seed}）`);
      const name = `${pid}_cand_${seed}.webp`;
      await this.runSave(
        card,
        W.txt2img({
          prompt: this.prompt(card, pose),
          neg: [card.look.neg, this.styleOf().neg].filter(Boolean).join(', '),
          seed,
          w: this.styleOf().w,
          h: this.styleOf().h,
          prefix: 'chargen/cand',
        }),
        name,
        onProgress,
      );
      pose.cands.push({ file: name, seed });
      out.push(name);
    }
    return out;
  }
  // 主圖的局部修正（立繪工房第 4 期）：只改 box 裡（手、配件、背景殘塊…），Qwen 照指示改、對齊後只貼回框裡，
  // 存成新的主圖候選（pose.cands 的 fix）；選它當主圖時表情與影格照樣要重做
  async fixMaster(card, pid, { box, prompt, n = 2, onProgress } = {}) {
    const pose = poseOf(card, pid);
    if (!pose.master) throw new Error('先選定主圖');
    if (!box || box[2] < 8 || box[3] < 8) throw new Error('先框出要修的地方');
    const up = await this.uploadWork(card, pose.master);
    const out = [];
    for (let i = 0; i < n; i++) {
      const seed = rnd();
      const name = `${pid}_fix_${seed}.webp`;
      this.log(`${card.name}／${pose.name}：主圖局部修正（種子 ${seed}）`);
      // 框往外 60%（至少 192 px）裁出來放大給 Qwen（整張給它時小東西照不到指示），只貼回框裡真的改了的像素
      // （scripts/portrait-fix.mjs edit 的做法：不要遲滯、留下所有大塊）
      const { w: IW, h: IH } = await this.imageSize(card, pose.master);
      const [bx, by, bw, bh] = box.map(Math.round);
      const sz = Math.max(192, Math.max(bw, bh) * 1.6);
      const x0 = Math.max(0, Math.round(bx + bw / 2 - sz / 2));
      const y0 = Math.max(0, Math.round(by + bh / 2 - sz / 2));
      const crop = [x0, y0, Math.min(IW, Math.round(x0 + sz)) - x0, Math.min(IH, Math.round(y0 + sz)) - y0];
      const wf = W.qwenEditCrop({
        image: up,
        crop,
        inner: [bx, by, bw, bh],
        prompt: `${prompt} Do not change anything else: same character, same face, same pose, same art style.`,
        seed,
        thr: 0.07,
        grow: 4,
        feather: 3,
      });
      wf.pp.inputs.thr_hi = 0.07;
      wf.pp.inputs.keep_frac = 0.02;
      wf.pp.inputs.no_blush = false;
      await this.runSave(card, wf, name, onProgress);
      pose.cands.push({ file: name, seed, fix: { from: pose.master, box, prompt } });
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
      // 戴眼鏡的角色：直接閉眼、指示要求保留眼鏡（pose.glassesNog 時改成在拿掉眼鏡的圖上做，指示說沒戴眼鏡，否則 Qwen 會再畫一副）
      // pose.noGlasses：這個姿勢沒戴眼鏡（例如薩奇博士 p10）——提到眼鏡 Qwen 就會幫她戴上
      const glasses = eye && glassesChar(card) && !pose.noGlasses;
      // 底圖本來就張著嘴的表情：嘴型用 OPEN_MOUTH_FRAMES（m1 不要把嘴變小）
      const exd0 = exprList(card).find((e) => e.id === exId);
      const open =
        !eye &&
        (pose.ex[exId]?.open || (exd0 && OPEN_MOUTH_RE.test(`${exd0.tags || ''} ${exd0.prompt || ''}`)));
      // 微笑類：笑著說話（pose.ex[表情].smile＝手動標的，例如本來就帶笑的平常表情）
      const smiling =
        !eye &&
        !open &&
        (pose.ex[exId]?.smile ??
          (exd0 && SMILE_RE.test(`${exd0.id} ${exd0.tags || ''} ${exd0.prompt || ''}`)));
      const fp = open ? OPEN_MOUTH_FRAMES[fid] : smiling ? SMILE_MOUTH_FRAMES[fid] : f.prompt;
      // pose.ex[表情].keep：只有這個表情才有、要保留的東西（例如哭的淚）；別寫進共用的指示，提到就會被畫到別的表情上
      prompt = `${fp} ${eye ? '' : MOUTH_STYLE} ${glasses ? (pose.glassesNog ? NO_GLASSES : KEEP_GLASSES) : ''} ${extra} ${pose.ex[exId]?.keep || ''} ${eye ? KEEP_MOUTH : KEEP_EYES} ${KEEP}`;
      feather = 10;
    }
    const base = await this.uploadWork(card, this.baseOf(pose, key));
    const list = seeds || Array.from({ length: n }, rnd);
    const slot = (pose.ex[key] ||= { cands: [], pick: null });
    slot.cands ||= []; // 只有旗標（smile、open…）、還沒有候選的表情
    const out = [];
    for (const seed of list) {
      this.log(`${card.name}／${pose.name}：${key}（種子 ${seed}）`);
      const name = `${pid}_${key.replace('.', '_')}_${seed}.webp`;
      if (fid) {
        // 影格（2026-11-15 立繪大修）：臉放大給 Qwen 改，只貼回眼睛／嘴巴裡真的改了的像素（qwenEditCrop）
        const { crop, inner } = frameRegion(
          fid[0] === 'm' && pose.ex[exId]?.mb ? { ...B, mouth: pose.ex[exId].mb } : B,
          fid,
          await this.imageSize(card, pose.master),
        );
        // 戴眼鏡的角色眨眼：先在那個表情的圖上拿掉眼鏡（快取在 pose.ex[表情].nog），在沒眼鏡的圖上閉眼，最後疊回原圖的鏡框
        // （Qwen 閉眼時常把眼鏡一起拿掉，2026-11-16）
        let img = base;
        let gl = null;
        // 拿掉眼鏡再閉眼的做法（pose.glassesNog 為真才用）：2026-11-16 試過，Qwen 拿掉眼鏡時會重畫眼睛，疊回鏡框時把睜眼的碎片帶回來，
        // 所以預設不用；戴眼鏡的角色改成直接閉眼＋KEEP_GLASSES，多種子以 scripts/portrait-retry.py 挑鏡框完整的
        if (fid[0] === 'e' && glassesChar(card) && !pose.noGlasses && pose.glassesNog) {
          const ek = exId === 'neutral' ? '_neutral' : exId;
          const exs = (pose.ex[ek] ||= {});
          if (!exs.nog) {
            const ng = `${pid}_${exId}_nog.webp`;
            const [fx, fy, fw, fh] = B.face;
            await this.runSave(
              card,
              W.qwenEditCrop({
                image: base,
                crop,
                inner: [fx, fy, fw, fh * 0.75],
                prompt:
                  'Remove the glasses completely (frame, lenses, nose pads and temples) and show the eyes, eyebrows, skin and hair behind them. Change nothing else: same eyes, same eyebrows, same hair, same face, same expression.',
                seed: 4242,
                thrHi: 0.07,
                keepFrac: 0.02,
                noBlush: false,
              }),
              ng,
              onProgress,
            );
            exs.nog = ng;
          }
          img = await this.uploadWork(card, exs.nog);
          const [ex0, ey0, ew0, eh0] = B.eyes;
          gl = { glassesBase: base, glassesBox: [ex0 - ew0 * 0.3, ey0 - eh0 * 0.8, ew0 * 1.6, eh0 * 2.6] };
        }
        const exd = exprList(card).find((e) => e.id === exId);
        const exTxt = exId === 'neutral' ? 'calm neutral' : (exd && (exd.tags || exd.name)) || exId;
        await this.runSave(
          card,
          W.qwenEditCrop({
            image: img,
            ...(gl || {}),
            crop,
            inner,
            prompt: prompt.replaceAll('{ex}', exTxt),
            seed,
            side: this.frameSide || 1024,
            // 嘴型：所有改變都貼（見 qwenEditCrop 的說明）
            // 舊嘴線條的反鋸齒邊緣差異很小：門檻放低、往外多長一些才會一起換掉
            // 眼睛：貼眼線附近 9 px、門檻 0.05（2026-11-16 從 4 px 放寬：新眼皮線離舊眼睛的上輪廓太遠時，舊輪廓只蓋掉一半，留下灰色殘影）；嘴巴：擦掉的舊唇線是強改變（≥0.15），反鋸齒的邊在它 10 px 內，
            // 遠處的雜點（下巴線變粗、小點）不貼（2026-11-16 薩奇博士的品管）
            ...(fid[0] === 'm'
              ? {
                  thr: 0.06,
                  grow: 8,
                  feather: 3,
                  thrHi: 0.15,
                  hystR: 10,
                  keepFrac: 0.03,
                  noBlush: false,
                  protectEdges: true,
                  toneFix: true,
                }
              : {
                  thr: 0.05,
                  thrHi: 0.22,
                  hystR: 9,
                  noRecolor: true,
                  keepTone: !!card.keepTone,
                  skinBox: pose.boxes.face,
                }),
            // pose.keepOut：[[x,y,w,h]…] 臉上的固定記號（OK 繃、痣），一律保留原圖；pose.eyeKeepOut：只在眨眼影格保留（眼睛框延伸到嘴的高度時把嘴標起來，SPECIMEN）
            // pose.ex[表情].keepOut：這個表情的臉移了位置時另外指定（STEVEDORE 生氣時疤移到下巴，原本的保留區蓋在嘴角、舊牙齒留下來）
            exclude: [
              ...(pose.ex[exId]?.keepOut || pose.keepOut || []),
              ...(fid[0] === 'e' ? pose.eyeKeepOut || [] : []),
            ],
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
            prompt: `portrait, face, ${card.look.prompt}, ${this.styleOf().prompt}`,
            neg: [card.look.neg, this.styleOf().neg].filter(Boolean).join(', '),
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
  // keepBase：主圖與分層沿用上一次發佈的（只重裁表情與影格；2026-11-15 立繪大修重產影格時用，省掉去背與拆層）
  async publish(
    card,
    {
      quality = (this.project && this.project.out && this.project.out.quality) || 88,
      onProgress,
      keepBase = false,
    } = {},
  ) {
    const old = new Map(((card.pub && card.pub.poses) || []).map((p) => [p.id, p]));
    const pub = { t: Date.now(), poses: [] };
    const files = [];
    for (const pose of card.poses) {
      if (!pose.master) continue;
      const B = pose.boxes;
      const P = { id: pose.id, name: pose.name, img: `${pose.id}.webp`, boxes: B, src: pose.master, ex: {} };
      const O = old.get(pose.id);
      // pose.rebase：主圖換過（scripts/portrait-propagate.py）→ 一定要重新去背、拆層
      const reuse = keepBase && O && !pose.rebase && (!O.src || O.src === pose.master);
      delete pose.rebase;
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
      if (reuse) {
        files.push(pose.id);
        if (O.layers) {
          P.layers = { ...O.layers };
          for (const g of Object.values(O.layers)) files.push(g.replace(/\.webp$/, ''));
        }
      }
      // 主圖去背（BiRefNet 的動漫專用版 toonout）→ 有透明的 WebP；臉、眼、嘴的小圖都在身體裡面，不用去背
      if (!reuse)
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
      if (!reuse) await crop(pose.master, null, pose.id, ['bg', 1]);
      // 分層動畫（card.layers，docs/portrait-design.md 第 6 期）：See-through 拆層 → MCLayerGroups 合併成
      // 後髮／身體／頭／前髮四層（看得到的像素用原圖的顏色，疊起來＝原圖），遊戲的播放器讓頭髮擺動、頭部微轉、身體呼吸
      if (card.layers && !reuse) {
        const m = await load(pose.master);
        wf.stL = {
          class_type: 'SeeThrough_LoadLayerDiffModel',
          inputs: {
            model: 'layerdifforg/seethroughv0.0.2_layerdiff3d',
            cache_tag_embeds: true,
            group_offload: false,
          },
        };
        wf.stD = {
          class_type: 'SeeThrough_LoadDepthModel',
          inputs: { model: 'layerdifforg/seethroughv0.0.1_marigold' },
        };
        wf.stG = {
          class_type: 'SeeThrough_GenerateLayers',
          inputs: {
            image: [m, 0],
            layerdiff_model: ['stL', 0],
            seed: 42,
            resolution: 1280,
            num_inference_steps: 30,
          },
        };
        wf.stZ = {
          class_type: 'SeeThrough_GenerateDepth',
          inputs: { layers: ['stG', 0], depth_model: ['stD', 0], seed: 42 },
        };
        wf.stP = {
          class_type: 'SeeThrough_PostProcess',
          inputs: { layers_depth: ['stZ', 0], tblr_split: true, use_lama: true },
        };
        wf.stS = {
          class_type: 'MCLayerGroups',
          inputs: {
            parts: ['stP', 0],
            image: [m, 0],
            mask: ['bg', 1],
            quality,
            name: `${card.id}_${pose.id}_L`,
          },
        };
        P.layers = {};
        for (const g of LAYER_GROUPS) {
          files.push(`${pose.id}_L_${g}`);
          P.layers[g] = `${pose.id}_L_${g}.webp`;
        }
      }
      for (const e of exprList(card)) {
        const ex = {};
        if (e.id !== 'neutral') {
          const pick = pose.ex[e.id]?.pick;
          if (!pick) continue;
          if (B.face) ex.f = await crop(pick, B.face, `${pose.id}_${e.id}_f`);
        }
        for (const f of frameList(card)) {
          const slot = pose.ex[`${e.id}.${f.id}`];
          const pick = slot && !slot.skip && slot.pick;
          // 本來就閉眼的表情（大笑的 ^^、閉眼的姿勢）不眨眼：pose.noBlink
          if (f.id[0] === 'e' && noBlink(pose).includes(e.id)) continue;
          // 嘴型的框：這個表情自己量的 mb（scripts/portrait-mouthbox.py），沒有就用姿勢的
          const mb = pose.ex[e.id]?.mb;
          const box = f.id[0] === 'e' ? B.eyes : mb || B.mouth;
          if (f.id[0] === 'm' && mb) ex.mb = mb;
          if (pick && box) ex[f.id] = await crop(pick, box, `${pose.id}_${e.id}_${f.id}`);
        }
        P.ex[e.id] = ex;
      }
      this.log(`${card.name}／${pose.name}：發佈 ${k} 張`);
      // 拆層第一次要下載 See-through 的模型（約 10 GB），之後每個姿勢也要一兩分鐘：等久一點
      const imgs = await this.comfy.run(wf, {
        onProgress,
        ...(card.layers && !reuse ? { timeout: 60 * 60 * 1000 } : {}),
      });
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
    const k = this.store.project + '/' + card.id + '/' + file;
    if (!this.sizes.has(k)) {
      const d = await this.store.getWork(card.id, file);
      this.sizes.set(k, imageSizeOf(d) || { w: this.styleOf().w, h: this.styleOf().h });
    }
    return this.sizes.get(k);
  }
}

// 圖檔的寬高（PNG、WebP），讀不出來回傳 null
export function imageSizeOf(d) {
  const v = new DataView(d.buffer, d.byteOffset, d.byteLength);
  if (d[0] === 0x89 && d[1] === 0x50) return { w: v.getUint32(16), h: v.getUint32(20) };
  const tag = (o) => String.fromCharCode(d[o], d[o + 1], d[o + 2], d[o + 3]);
  if (d.length > 30 && tag(0) === 'RIFF' && tag(8) === 'WEBP') {
    const c = tag(12);
    if (c === 'VP8X')
      return { w: 1 + (d[24] | (d[25] << 8) | (d[26] << 16)), h: 1 + (d[27] | (d[28] << 8) | (d[29] << 16)) };
    if (c === 'VP8 ') return { w: v.getUint16(26, true) & 0x3fff, h: v.getUint16(28, true) & 0x3fff };
    if (c === 'VP8L') {
      const b = v.getUint32(21, true);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
  }
  return null;
}
