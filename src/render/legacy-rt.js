// three.js r153 起畫到 render target 時不做色調映射（只在畫到畫面時做）；r128 是每個材質自己做。這條管線先把場景畫到
// render target 再做後處理，為了維持 r128 的畫面（粒子的加色混合、Bloom 的門檻都是照色調映射後的值調的），把畫場景的
// render target 標成 isXRRenderTarget：r187 對它照畫面的方式做色調映射，輸出的色彩空間＝貼圖的（線性）。
// 這個旗標在 r187 只影響色調映射、輸出色彩空間與多重取樣緩衝的格式（docs/perf-threejs-upgrade.md 第 1 期）
export function legacyTarget(t) {
  t.isXRRenderTarget = true;
  t.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return t;
}
