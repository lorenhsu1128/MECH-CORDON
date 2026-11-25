// 把字串跳脫成可安全放進 innerHTML 的文字（暱稱、房名等遠端資料一律要經過這裡）
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
// 每格更新的 HUD：內容和上一次一樣就不寫（寫 innerHTML／textContent 即使內容相同也會重建節點、
// 讓瀏覽器重新計算樣式與版面；低標的電腦每格 2～5 ms，2026-11-25 的效能檢查）
export function setHtml(el, html) {
  if (el && el.__h !== html) {
    el.__h = html;
    el.__t = undefined;
    el.innerHTML = html;
  }
}
export function setText(el, t) {
  if (el && el.__t !== t) {
    el.__t = t;
    el.__h = undefined;
    el.textContent = t;
  }
}
export function setStyle(el, k, v) {
  if (el && el.style[k] !== v) el.style[k] = v;
}
