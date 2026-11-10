// 畫場景的 render target（docs/perf-threejs-upgrade.md 第 1、4 期）。
// 畫面模式「經典」（預設）：three.js r153 起畫到 render target 時不做色調映射（只在畫到畫面時做）；r128 是每個材質自己做。
// 這條管線先把場景畫到 render target 再做後處理，為了維持 r128 的畫面（粒子的加色混合、Bloom 的門檻都是照色調映射後的值調的），
// 把畫場景的 render target 標成 isXRRenderTarget：r187 對它照畫面的方式做色調映射，輸出的色彩空間＝貼圖的（線性）。
// 這個旗標在 r187 只影響色調映射、輸出色彩空間與多重取樣緩衝的格式。
// 畫面模式「HDR」：不做色調映射、以半浮點保留超過 1 的亮度，色調映射在後處理的最後（pipeline.js 的調色）做一次。
// always：一律照經典（零件縮圖：讀回 8 位元的像素直接當圖片用）
export const HDR = !!(THREE.MECH_CORDON_RENDER && THREE.MECH_CORDON_RENDER.hdr);
export function legacyTarget(t, always = false) {
  t.texture.colorSpace = THREE.LinearSRGBColorSpace;
  if (HDR && !always) t.texture.type = THREE.HalfFloatType;
  else t.isXRRenderTarget = true;
  return t;
}
