// 地圖物件的殘骸（docs/destruction-design.md）：完全損毀之後留在原地的造型與碰撞。純函式、不呼叫亂數：
// 形狀由物件編號與地圖種子的雜湊決定，所以各端一樣（房主、客機、重連時直接換成殘骸）。
//   通用殘骸：壓扁、傾斜的底座＋依材質的碎塊堆（混凝土與岩石＝岩塊、金屬類＝鐵板與彎掉的型鋼、木＝木條、冰、Coral 結晶）
//   ＋高的物件剩一截斷口＋地上的焦痕。專屬造型 WRECK[種類]（方案二，第 7 期）沒有時用通用殘骸。
//   碰撞：比原本矮的方塊（雜物 ≤ 0.5 m、一般 ≤ 跨越的高度、全身掩體以上 ≤ 5 m 的半身掩體），機甲跨得過去的就只擋子彈。
import { PMAT, propDebrisCol } from '../data/destruct.js';
import { PK, mat } from './prop-models.js';

export const WRECK = {}; // 種類 → (k: PK, o) => void（專屬的殘骸造型；o 見 buildWreck）

// 32 位元的雜湊亂數（不碰全域 RNG）
function hrng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const darken = (c, k) => {
  const r = (c >> 16) & 255,
    g = (c >> 8) & 255,
    b = c & 255;
  return (Math.round(r * k) << 16) | (Math.round(g * k) << 8) | Math.round(b * k);
};
const mix = (a, b, t) => {
  const ch = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
const SOOT = 0x1d1a17;

// 殘骸的高度（碰撞的頂面離地多高）
export function wreckHeight(H, step) {
  if (H <= 2.2) return Math.min(0.5, H * 0.4);
  if (H < 10) return Math.min(step * 0.9, Math.max(0.8, H * 0.22));
  return Math.min(5, Math.max(step, H * 0.18));
}

// p＝物件（shape 是損毀前的外形）、seed＝地圖種子、step＝跨越的高度；回傳 { group（原點在地面中心）, w, d, h }
export function buildWreck(p, seed, step) {
  const sh = p.shape0 || p.shape; // 損毀前的外形（第 3 階段切掉上段之前）
  const W = Math.max(0.6, sh.x1 - sh.x0),
    D = Math.max(0.6, sh.z1 - sh.z0),
    H = Math.max(0.5, sh.y1 - sh.y0);
  const M = PMAT[p.mat] || PMAT.metal;
  const base = typeof p.col === 'number' ? p.col : 0x202224;
  const col = propDebrisCol(p, false);
  const R = hrng((p.idx + 1) * 2654435761 + (seed | 0) * 97 + 13);
  const r = (a, b) => a + (b - a) * R();
  const hw = wreckHeight(H, step);
  const k = new PK();
  const o = { W, D, H, hw, col, base, M, r };
  if (WRECK[p.kind]) WRECK[p.kind](k, o);
  else wreckGeneric(k, o);
  // 地上的焦痕（可燃的比較黑、比較大）
  const sR = Math.max(W, D) * (M.fire ? 0.5 : 0.42);
  const sR2 = Math.min(sR, M.fire ? 7 : 5);
  k.cyl(mat(M.fire ? SOOT : darken(col, 0.35)), sR2, sR2, 0.06, 0, 0.03, 0, 0, 0, 0, 12);
  const group = k.build(new THREE.Group(), true);
  return { group, w: W * 0.9, d: D * 0.9, h: hw };
}

export function wreckGeneric(k, o) {
  const { W, D, H, hw, col, M, r } = o;
  const mBase = mat(darken(col, 0.55), { roughness: 0.9 });
  const mDark = mat(mix(darken(col, 0.4), SOOT, 0.4), { roughness: 0.95 });
  const mDarkB = mat(mix(darken(col, 0.6), SOOT, 0.3), { roughness: 0.92 });
  // 壓扁、裂成幾塊、各自傾斜的底座（沿長邊分 2～3 塊，塊與塊之間有縫）
  const nb = Math.max(W, D) > 6 ? 3 : 2;
  const alongX = W >= D;
  const L = (alongX ? W : D) * 0.86;
  for (let i = 0; i < nb; i++) {
    const seg = (L / nb) * r(0.82, 0.95);
    const off = -L / 2 + (L / nb) * (i + 0.5);
    const hh = hw * r(0.6, 1);
    const sw = alongX ? seg : W * r(0.7, 0.84),
      sd = alongX ? D * r(0.7, 0.84) : seg;
    k.box(
      i === 1 ? mDarkB : mBase,
      sw,
      hh,
      sd,
      alongX ? off : r(-0.05, 0.05) * W,
      hh / 2,
      alongX ? r(-0.05, 0.05) * D : off,
      r(-0.12, 0.12),
      r(-0.12, 0.12),
      r(-0.12, 0.12),
    );
  }
  // 高的物件：剩一截斷口（在一個角落）
  if (H > 4.5) {
    const sw = W * r(0.22, 0.34),
      sd = D * r(0.22, 0.34);
    const sx = (W / 2 - sw / 2) * (R2(r) ? 1 : -1) * 0.8,
      sz = (D / 2 - sd / 2) * (R2(r) ? 1 : -1) * 0.8;
    const stub = Math.min(H * 0.45, hw * r(1.8, 2.6));
    k.box(mDark, sw, stub, sd, sx, stub / 2, sz, r(-0.12, 0.12), r(-0.3, 0.3), r(-0.12, 0.12));
  }
  // 碎塊堆
  const n = Math.max(4, Math.min(16, Math.round(Math.sqrt(W * D) / 1.6) + 3));
  const s0 = Math.min(W, D);
  const mA = mat(col, { roughness: 0.85 }),
    mB = mat(darken(col, 0.7), { roughness: 0.9 });
  const glow = M.deb === 'crystal' ? mat(0xd03040, { emissive: 0x801020, roughness: 0.4 }) : null;
  for (let i = 0; i < n; i++) {
    const m = glow && i % 3 === 0 ? glow : i % 2 ? mA : mB;
    const s = Math.max(0.3, Math.min(3.5, s0 * r(0.14, 0.32)));
    const a = r(0, Math.PI * 2),
      rr = r(0.15, 0.62);
    const x = Math.cos(a) * rr * W * 0.6,
      z = Math.sin(a) * rr * D * 0.6;
    const y = hw * r(0.5, 1.05);
    const rx = r(-1, 1),
      ry = r(0, 3),
      rz = r(-1, 1);
    switch (M.deb) {
      case 'rock':
      case 'chunk':
      case 'ice':
        k.cb(m, s, s * r(0.5, 0.9), s * r(0.6, 1.1), x, y, z, rx, ry, rz, s * 0.18);
        if (M.deb === 'chunk' && i % 4 === 0)
          k.bar(mDark, [x, y, z], [x + r(-1, 1) * s, y + s, z + r(-1, 1) * s], 0.06); // 鋼筋
        break;
      case 'plank':
        k.box(m, s * 0.18, s * 0.14, s * 1.6, x, y, z, rx * 0.4, ry, rz * 0.4);
        break;
      case 'crystal':
        k.cyl(m, 0, s * 0.35, s * 1.2, x, y, z, rx * 0.6, ry, rz * 0.6, 5);
        break;
      default:
        // 鐵板
        k.box(m, s * 1.1, s * 0.08, s * 0.8, x, y, z, rx * 0.5, ry, rz * 0.5);
    }
  }
  // 金屬類：彎掉的型鋼伸出來
  if (M.deb === 'plate' && H > 2.2) {
    const L = Math.max(W, D) * 0.45;
    for (let i = 0; i < 3; i++) {
      const x = r(-0.3, 0.3) * W,
        z = r(-0.3, 0.3) * D;
      const a = r(0, Math.PI * 2),
        t = r(0.35, 0.9);
      k.bar(
        mDark,
        [x, hw * 0.6, z],
        [
          x + Math.cos(a) * L * Math.cos(t),
          hw * 0.6 + L * Math.sin(t) * 0.6,
          z + Math.sin(a) * L * Math.cos(t),
        ],
        Math.max(0.08, s0 * 0.025),
      );
    }
  }
}
const R2 = (r) => r() < 0.5;
