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
  // 同步的版本（插入畫面）：清單還沒載入＝false（順便開始載入）
  known(id) {
    this.ids();
    const s = window.MECH_CORDON_PORTRAIT_IDS;
    return !!(s && s.includes(id));
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

// 軌道站的機械語音：不畫臉，畫聲波（docs/portrait-design.md 第 7 期）。通訊框、通訊紀錄的小頭像、過場的通訊分割共用。
// lv＝音量 0～1（沒說話＝0，只剩微弱的底噪），t＝秒（動畫用），color＝線的顏色
export function drawStationWave(x, W, H, t, lv, color = '#e8eef4') {
  x.save();
  x.fillStyle = '#070b12';
  x.fillRect(0, 0, W, H);
  const cx = W / 2,
    cy = H / 2,
    m = Math.min(W, H);
  // 背後的同心圓（◎）與刻度
  x.strokeStyle = color;
  x.globalAlpha = 0.16;
  x.lineWidth = Math.max(1, m / 90);
  for (const r of [0.42, 0.3]) {
    x.beginPath();
    x.arc(cx, cy, m * r, 0, Math.PI * 2);
    x.stroke();
  }
  x.globalAlpha = 0.1;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2 + t * 0.15;
    x.beginPath();
    x.moveTo(cx + Math.cos(a) * m * 0.44, cy + Math.sin(a) * m * 0.44);
    x.lineTo(cx + Math.cos(a) * m * 0.48, cy + Math.sin(a) * m * 0.48);
    x.stroke();
  }
  // 聲波：幾個正弦相加，振幅跟著音量；中間大、兩端收
  const amp = H * (0.03 + 0.32 * Math.min(1, lv));
  const line = (alpha, width, ph) => {
    x.globalAlpha = alpha;
    x.lineWidth = width;
    x.beginPath();
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const u = i / n,
        env = Math.sin(u * Math.PI);
      const y =
        Math.sin(u * 19 + t * 11 + ph) * 0.55 +
        Math.sin(u * 37 - t * 17 + ph * 2) * 0.3 +
        Math.sin(u * 7 + t * 5) * 0.15;
      const px = W * 0.06 + u * W * 0.88,
        py = cy + y * amp * env;
      if (i) x.lineTo(px, py);
      else x.moveTo(px, py);
    }
    x.stroke();
  };
  x.strokeStyle = color;
  x.shadowColor = color;
  x.shadowBlur = m / 14;
  line(0.35, Math.max(1, m / 60), 1.7);
  line(0.95, Math.max(1, m / 40), 0);
  x.restore();
}
