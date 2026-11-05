// 色彩管理開關下的顏色換算（docs/perf-threejs-upgrade.md 第 4 期）：設定「色彩管理」關掉（預設）時 three.js 的
// Color.set(hex) 不轉換（色碼直接當線性值，r128 的行為），打開時照 sRGB 換成線性。程式裡「手動把 sRGB 色碼換成線性」的地方
// 改用這些函式，否則打開時會轉換兩次
const cmOn = () => !!THREE.ColorManagement.enabled;
// sRGB 色碼 → 線性的 Color
export const linColor = (hex) => (cmOn() ? new THREE.Color(hex) : new THREE.Color(hex).convertSRGBToLinear());
// sRGB 色碼 → sRGB 值的 Color（調色等在 sRGB 空間計算的參數）
export const srgbColor = (hex) =>
  cmOn() ? new THREE.Color(hex).convertLinearToSRGB() : new THREE.Color(hex);
// sRGB 色碼 → 給 Color.set／setHex 用、結果是同一個線性顏色的色碼
export const hexForSet = (hex) => (cmOn() ? hex : new THREE.Color(hex).convertSRGBToLinear().getHex());
// 已經 set 過（照目前的設定換算過）的 Color，再當成 sRGB 換成線性（色彩管理打開時 set 已經換過，不再換）
export const toLinear = (c) => (cmOn() ? c : c.convertSRGBToLinear());
// 以色碼設定、但不經過色調映射與曝光的顏色（天空的地平線、背景色）：色彩管理時換回原本（不轉換）的值，畫面和以前相同
export const rawColor = (c) => (cmOn() ? c.clone().convertLinearToSRGB() : c);
