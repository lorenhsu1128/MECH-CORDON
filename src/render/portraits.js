// 劇情角色的立繪（docs/portrait-design.md）：載入 lib/portraits/<id>.js（建置時由 src/assets/characters/ 打包），
// 播放器直接用角色產生器的 mech_cordon_charagen/js/portrait.js（和文字演出直接用 APNG 產生器的引擎一樣）
//   const pk = await Portraits.get('echo');   // 沒有這個角色的立繪＝null（照舊顯示字母徽章）
//   const p = new Portrait(pk, 'p1');
import { Portrait, PortraitPack, ACT_NAMES } from '../../mech_cordon_charagen/js/portrait.js';

export { Portrait, ACT_NAMES };

const loaded = new Map(); // id → Promise<PortraitPack|null>
let index = null;
function script(src) {
  return new Promise((res) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => res(true);
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
}
export const Portraits = {
  // 有立繪的角色 id（第一次呼叫時載入 lib/portraits/index.js）
  async ids() {
    if (!index)
      index = script('lib/portraits/index.js').then(() => new Set(window.MECH_CORDON_PORTRAIT_IDS || []));
    return index;
  },
  async has(id) {
    return (await this.ids()).has(id);
  },
  get(id) {
    if (!loaded.has(id))
      loaded.set(
        id,
        (async () => {
          if (!(await this.has(id))) return null;
          const all = (window.MECH_CORDON_PORTRAITS ||= {});
          if (!all[id]) await script(`lib/portraits/${id}.js`);
          const d = all[id];
          if (!d) return null;
          return PortraitPack.load(d.pub, (n) => d.img[n] || '');
        })(),
      );
    return loaded.get(id);
  },
};
