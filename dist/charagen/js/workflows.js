// 角色產生器的 ComfyUI 工作流程（API 格式），瀏覽器與命令列共用
// 每個函式回傳 { 節點 id: { class_type, inputs } }；連線寫成 [節點 id, 輸出索引]
// 模型檔名對應 tools/comfyui/manifest.json

// 第 0 期的比較（docs/portrait-design.md）：NoobAI＋提示詞的 (zenless zone zero:0.6) 最像絕區零；
// WAI-Illustrious 與 Illustrious 版的絕區零 LoRA 不用（LoRA 會把觸發詞畫成「zzz」符號）。
// 畫風 LoRA（lora > 0）只有設了 CIVITAI_TOKEN、裝了選用的 zzz_noob 才有。
export const STYLE = '(zenless zone zero:0.6), thick outlines, vibrant colors, cel shading';
export const BASES = {
  noob: {
    ckpt: 'NoobAI-XL-v1.1.safetensors',
    lora: 'zzz_style_noob_eps1.1.safetensors',
    trig: 'zzzstyle',
    pre: 'masterpiece, best quality, newest, absurdres, highres',
    neg: 'worst quality, low quality, lowres, bad anatomy, bad hands, extra fingers, missing fingers, jpeg artifacts, signature, watermark, text, logo, emblem, symbol, letters, username, artist name, blurry, censored, zzz, onomatopoeia',
  },
};

// 底模＋畫風 LoRA，回傳 { g, model, clip, vae }
function sdxl(g, base, loraW) {
  const B = BASES[base];
  g.ck = { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: B.ckpt } };
  let model = ['ck', 0];
  let clip = ['ck', 1];
  if (loraW > 0) {
    g.lo = {
      class_type: 'LoraLoader',
      inputs: { model, clip, lora_name: B.lora, strength_model: loraW, strength_clip: loraW },
    };
    model = ['lo', 0];
    clip = ['lo', 1];
  }
  return { model, clip, vae: ['ck', 2], B };
}
function promptOf(B, text, loraW) {
  return [B.pre, loraW > 0 ? B.trig : '', text].filter(Boolean).join(', ');
}

// 文字 → 圖：候選的主圖
export function txt2img({
  base = 'noob',
  lora = 0,
  prompt,
  neg = '',
  seed,
  w = 832,
  h = 1216,
  steps = 28,
  cfg = 5.5,
  batch = 1,
  prefix = 'chargen/cand',
}) {
  const g = {};
  const s = sdxl(g, base, lora);
  g.pos = { class_type: 'CLIPTextEncode', inputs: { clip: s.clip, text: promptOf(s.B, prompt, lora) } };
  g.neg = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: s.clip, text: [s.B.neg, neg].filter(Boolean).join(', ') },
  };
  g.lat = { class_type: 'EmptyLatentImage', inputs: { width: w, height: h, batch_size: batch } };
  g.ks = {
    class_type: 'KSampler',
    inputs: {
      model: s.model,
      positive: ['pos', 0],
      negative: ['neg', 0],
      latent_image: ['lat', 0],
      seed,
      steps,
      cfg,
      sampler_name: 'euler_ancestral',
      scheduler: 'normal',
      denoise: 1,
    },
  };
  g.dec = { class_type: 'VAEDecode', inputs: { samples: ['ks', 0], vae: s.vae } };
  g.out = { class_type: 'SaveImage', inputs: { images: ['dec', 0], filename_prefix: prefix } };
  return g;
}

// 局部重畫（表情、眨眼、嘴型）：把 box 那一塊裁出來放大到 side 畫，再縮回去貼回原圖
// box＝[x, y, w, h]（原圖像素），feather＝邊緣羽化像素（放大前）
export function inpaintBox({
  base = 'noob',
  lora = 0,
  image,
  box,
  inner,
  prompt,
  neg = '',
  seed,
  denoise = 0.55,
  side = 1024,
  feather = 24,
  steps = 28,
  cfg = 5.5,
  prefix = 'chargen/face',
}) {
  const g = {};
  const s = sdxl(g, base, lora);
  const [x, y, w, h] = box.map((v) => Math.round(v));
  const k = side / Math.max(w, h);
  const W = Math.round((w * k) / 8) * 8;
  const H = Math.round((h * k) / 8) * 8;
  g.img = { class_type: 'LoadImage', inputs: { image } };
  g.crop = { class_type: 'ImageCrop', inputs: { image: ['img', 0], width: w, height: h, x, y } };
  g.up = {
    class_type: 'ImageScale',
    inputs: { image: ['crop', 0], upscale_method: 'lanczos', width: W, height: H, crop: 'disabled' },
  };
  // 遮罩（裁切區的原尺寸）：只重畫 inner（原圖座標，沒給＝整塊），邊緣羽化；裁切區其他部分只當上下文
  const [ix, iy, iw, ih] = (inner || box).map((v) => Math.round(v));
  g.m0 = { class_type: 'SolidMask', inputs: { value: 0, width: w, height: h } };
  g.m1 = { class_type: 'SolidMask', inputs: { value: 1, width: iw, height: ih } };
  g.m = {
    class_type: 'MaskComposite',
    inputs: { destination: ['m0', 0], source: ['m1', 0], x: ix - x, y: iy - y, operation: 'add' },
  };
  g.mf = {
    class_type: 'FeatherMask',
    inputs: { mask: ['m', 0], left: feather, top: feather, right: feather, bottom: feather },
  };
  g.enc0 = { class_type: 'VAEEncode', inputs: { pixels: ['up', 0], vae: s.vae } };
  g.enc = { class_type: 'SetLatentNoiseMask', inputs: { samples: ['enc0', 0], mask: ['mf', 0] } };
  g.pos = { class_type: 'CLIPTextEncode', inputs: { clip: s.clip, text: promptOf(s.B, prompt, lora) } };
  g.neg = {
    class_type: 'CLIPTextEncode',
    inputs: { clip: s.clip, text: [s.B.neg, neg].filter(Boolean).join(', ') },
  };
  g.ks = {
    class_type: 'KSampler',
    inputs: {
      model: s.model,
      positive: ['pos', 0],
      negative: ['neg', 0],
      latent_image: ['enc', 0],
      seed,
      steps,
      cfg,
      sampler_name: 'euler_ancestral',
      scheduler: 'normal',
      denoise,
    },
  };
  g.dec = { class_type: 'VAEDecode', inputs: { samples: ['ks', 0], vae: s.vae } };
  g.down = {
    class_type: 'ImageScale',
    inputs: { image: ['dec', 0], upscale_method: 'lanczos', width: w, height: h, crop: 'disabled' },
  };
  g.comp = {
    class_type: 'ImageCompositeMasked',
    inputs: { destination: ['img', 0], source: ['down', 0], x, y, resize_source: false, mask: ['mf', 0] },
  };
  g.out = { class_type: 'SaveImage', inputs: { images: ['comp', 0], filename_prefix: prefix } };
  g.outc = { class_type: 'SaveImage', inputs: { images: ['down', 0], filename_prefix: prefix + '_crop' } };
  return g;
}

// Qwen-Image-Edit-2511：照指令改整張圖（姿勢、表情、換裝），圖 1 是要改的，圖 2、3 是參考
// paste＝[x, y, w, h]：改完以框外對齊回圖 1、只把框內羽化貼回（表情、眨眼、嘴型），沒給＝整張輸出
// onto：貼回的底圖（沒給＝圖 1；例如閉眼從主圖改、只把眼睛貼到某個表情上）
export function qwenEdit({
  images,
  prompt,
  seed,
  steps = 4,
  cfg = 1,
  shift = 3.1,
  paste,
  feather = 14,
  onto,
  prefix = 'chargen/edit',
}) {
  const g = {};
  g.unet = { class_type: 'UnetLoaderGGUF', inputs: { unet_name: 'qwen-image-edit-2511-Q4_K_M.gguf' } };
  g.lo = {
    class_type: 'LoraLoaderModelOnly',
    inputs: {
      model: ['unet', 0],
      lora_name: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
      strength_model: 1,
    },
  };
  g.ms = { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['lo', 0], shift } };
  g.cn = { class_type: 'CFGNorm', inputs: { model: ['ms', 0], strength: 1 } };
  g.clip = {
    class_type: 'CLIPLoader',
    inputs: { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' },
  };
  g.vae = { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } };
  const pi = {};
  images.forEach((im, i) => {
    g['li' + i] = { class_type: 'LoadImage', inputs: { image: im } };
    pi['image' + (i + 1)] = ['li' + i, 0];
  });
  g.pos = {
    class_type: 'TextEncodeQwenImageEditPlus',
    inputs: { clip: ['clip', 0], vae: ['vae', 0], prompt, ...pi },
  };
  g.neg = {
    class_type: 'TextEncodeQwenImageEditPlus',
    inputs: { clip: ['clip', 0], vae: ['vae', 0], prompt: '', ...pi },
  };
  g.enc = { class_type: 'VAEEncode', inputs: { pixels: ['li0', 0], vae: ['vae', 0] } };
  g.ks = {
    class_type: 'KSampler',
    inputs: {
      model: ['cn', 0],
      positive: ['pos', 0],
      negative: ['neg', 0],
      latent_image: ['enc', 0],
      seed,
      steps,
      cfg,
      sampler_name: 'euler',
      scheduler: 'simple',
      denoise: 1,
    },
  };
  g.dec = { class_type: 'VAEDecode', inputs: { samples: ['ks', 0], vae: ['vae', 0] } };
  let res = ['dec', 0];
  if (paste) {
    let dst = ['li0', 0];
    if (onto) {
      g.onto = { class_type: 'LoadImage', inputs: { image: onto } };
      dst = ['onto', 0];
    }
    const [x, y, w, h] = paste.map((v) => Math.round(v));
    // 對齊以圖 1 為準（Qwen 的位移是相對於輸入），貼到 dst
    g.al = {
      class_type: 'MCAlignPaste',
      inputs: { base: ['li0', 0], edit: ['dec', 0], x, y, w, h, feather, align: true },
    };
    g.pa = {
      class_type: 'MCAlignPaste',
      inputs: { base: dst, edit: ['al', 1], x, y, w, h, feather, align: false },
    };
    res = ['pa', 0];
  }
  g.out = { class_type: 'SaveImage', inputs: { images: res, filename_prefix: prefix } };
  return g;
}
