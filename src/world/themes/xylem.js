// 主題：洋上都市 Reefhold（AC6 的無人洋上都市）——海上的都市街區以橋相連，街區外是虛空（掉進海裡會被拉回）
import { RNG, clamp, rnd } from '../../core/math.js';
import { WS } from '../../core/scale.js';
import {
  box,
  fadeMat,
  mat,
  propGlb,
  registerFeatureStyle,
  windowMat,
  PK,
  DETAIL,
  HOLE,
  grille,
  K,
  D,
  markText,
} from './kit.js';

// ---------- 海上（雲海上）的街區＋橋：洋上都市與高空軌道共用 ----------
// o：{ h 街區高度, deep 海底高度, central 中央街區邊長, n [最少, 最多] 街區數, size [最小, 最大] 邊長, span 最長的橋 }
// （o 的公尺數是舊尺度：機甲三倍高改版的街區、橋、高度在這裡乘上 G）
const G = WS;
// 2026-11-07（虛空地圖太容易掉下去）：街區加大、間距縮短（各變體的參數一起乘，保留彼此的差異）
const ISLE_SIZE_K = 1.15,
  ISLE_CENTRAL_K = 1.1,
  ISLE_GAP_K = 0.7;
export function planIslands(w, o0) {
  const o = {
    ...o0,
    h: o0.h * G,
    deep: o0.deep * G,
    central: o0.central * G * ISLE_CENTRAL_K,
    size: o0.size.map((v) => v * G * ISLE_SIZE_K),
    span: o0.span * G,
    gap: (o0.gap || 12) * G * ISLE_GAP_K,
  };
  const lim = w.lim - 6 * G;
  const c = o.central / 2;
  const blocks = [{ x0: -c, x1: c, z0: -c, z1: c }];
  const want = w.cnt(o.n[0], o.n[1]);
  for (let t = 0; t < 400 && blocks.length < want + 1; t++) {
    const sx = rnd(o.size[0], o.size[1]),
      sz = rnd(o.size[0], o.size[1]);
    const cx = rnd(-lim + sx / 2, lim - sx / 2),
      cz = rnd(-lim + sz / 2, lim - sz / 2);
    const b = { x0: cx - sx / 2, x1: cx + sx / 2, z0: cz - sz / 2, z1: cz + sz / 2 };
    const gap = o.gap;
    if (blocks.some((a) => b.x0 < a.x1 + gap && b.x1 > a.x0 - gap && b.z0 < a.z1 + gap && b.z1 > a.z0 - gap))
      continue;
    blocks.push(b);
  }
  // 橋的候選：兩街區在 X（或 Z）上重疊至少 12 m，就能沿 Z（或 X）架直橋
  const cand = [];
  for (let i = 0; i < blocks.length; i++)
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i],
        b = blocks[j];
      const ox0 = Math.max(a.x0, b.x0),
        ox1 = Math.min(a.x1, b.x1),
        oz0 = Math.max(a.z0, b.z0),
        oz1 = Math.min(a.z1, b.z1);
      if (ox1 - ox0 >= 12 * G) {
        const [lo, hi] = a.z1 < b.z0 ? [a, b] : [b, a];
        const span = hi.z0 - lo.z1;
        if (span > 0 && span <= o.span)
          cand.push({ i, j, span, axis: 'z', at: (ox0 + ox1) / 2, s0: lo.z1, s1: hi.z0 });
      } else if (oz1 - oz0 >= 12 * G) {
        const [lo, hi] = a.x1 < b.x0 ? [a, b] : [b, a];
        const span = hi.x0 - lo.x1;
        if (span > 0 && span <= o.span)
          cand.push({ i, j, span, axis: 'x', at: (oz0 + oz1) / 2, s0: lo.x1, s1: hi.x0 });
      }
    }
  // 最小生成樹（每個街區都連得到），再多加幾座
  cand.sort((a, b) => a.span - b.span);
  const par = blocks.map((_, i) => i);
  const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
  const bridges = [];
  for (const e of cand) {
    const a = find(e.i),
      b = find(e.j);
    if (a !== b) {
      par[a] = b;
      bridges.push(e);
    } else if (RNG() < 0.25) bridges.push(e);
  }
  w.islands = { blocks, bridges, h: o.h };
  return (x, z) => {
    let d = 1e9;
    for (const b of blocks) d = Math.min(d, Math.max(b.x0 - x, x - b.x1, b.z0 - z, z - b.z1));
    const t = clamp((d + G) / (2 * G), 0, 1);
    return o.h + (o.deep - o.h) * t;
  };
}
// 橋（沿 axis 跨過 s0～s1，寬 bw）；deck 由主題的地形特徵外觀決定；長橋下方加一根支柱
export function buildBridges(w, bw0) {
  const I = w.islands,
    bw = bw0 * G;
  I.bw = bw;
  for (const e of I.bridges) {
    const len = e.s1 - e.s0 + 3 * G,
      mid = (e.s0 + e.s1) / 2;
    const x = e.axis === 'z' ? e.at : mid,
      z = e.axis === 'z' ? mid : e.at;
    w.addDeck(x, z, e.axis === 'z' ? bw : len, e.axis === 'z' ? len : bw, I.h, G, e.axis === 'z', null);
    if (len > 24 * G) w.addPillar(x, z, 1.2 * G, I.h - 40 * G, I.h - G, null);
  }
}
// 接住墜落的下層平台（2026-11-07）：沿每個街區的外緣、比街區低 drop 的一圈平台（洋上都市＝海面的浮台，
// 高空軌道＝下層的桁架），寬 width（舊尺度）；碰到別的街區時只伸到兩者中間，橋接上街區的地方留空（橋比較厚）。
// 標成 ledge：isVoid 照樣當虛空（AI 不走下去、不生成東西、不記成站穩的位置），玩家掉下去後跳回上層
export function buildLedges(w, width, drop) {
  const I = w.islands,
    W = width * G,
    y = I.h - drop * G,
    T = 0.8 * G;
  const B = I.blocks;
  const lim = w.lim + 6 * G;
  // 從街區 b 的某一側往外，到別的街區（橫向有重疊的）的距離
  const room = (b, side) => {
    let d = 1e9;
    for (const a of B) {
      if (a === b) continue;
      if (side === 'x0' || side === 'x1') {
        if (a.z1 < b.z0 - W || a.z0 > b.z1 + W) continue;
        if (side === 'x0' && a.x1 <= b.x0) d = Math.min(d, b.x0 - a.x1);
        if (side === 'x1' && a.x0 >= b.x1) d = Math.min(d, a.x0 - b.x1);
      } else {
        if (a.x1 < b.x0 - W || a.x0 > b.x1 + W) continue;
        if (side === 'z0' && a.z1 <= b.z0) d = Math.min(d, b.z0 - a.z1);
        if (side === 'z1' && a.z0 >= b.z1) d = Math.min(d, a.z0 - b.z1);
      }
    }
    return Math.min(W, d / 2 - 0.5);
  };
  // 橋在這一側接上街區的範圍（沿邊的座標，留 1 m）
  const cuts = (b, side) => {
    const out = [];
    for (const e of I.bridges) {
      const bw = (I.bw || 9 * G) / 2 + G;
      if ((side === 'z0' || side === 'z1') && e.axis === 'z') {
        const zEdge = side === 'z0' ? b.z0 : b.z1;
        if (Math.abs(e.s0 - zEdge) < 1 || Math.abs(e.s1 - zEdge) < 1)
          if (e.at > b.x0 - bw && e.at < b.x1 + bw) out.push([e.at - bw, e.at + bw]);
      }
      if ((side === 'x0' || side === 'x1') && e.axis === 'x') {
        const xEdge = side === 'x0' ? b.x0 : b.x1;
        if (Math.abs(e.s0 - xEdge) < 1 || Math.abs(e.s1 - xEdge) < 1)
          if (e.at > b.z0 - bw && e.at < b.z1 + bw) out.push([e.at - bw, e.at + bw]);
      }
    }
    return out.sort((p, q) => p[0] - q[0]);
  };
  const seg = (a0, a1, cs) => {
    const out = [];
    let s = a0;
    for (const [c0, c1] of cs) {
      if (c1 <= s || c0 >= a1) continue;
      if (c0 > s) out.push([s, c0]);
      s = Math.max(s, c1);
    }
    if (s < a1) out.push([s, a1]);
    return out.filter(([p, q]) => q - p > 4 * G);
  };
  // 下層平台：標記，並且不投影（在街區下方，影子只落在海面或雲海上；一張地圖幾十個、三角形多，陰影那一次算繪很貴）
  const ledge = (ob) => {
    ob.ledge = true;
    ob.group.traverse((o) => {
      if (o.isMesh) o.castShadow = false;
    });
  };
  for (const b of B) {
    // 沿 X 的兩側（z0、z1）跨過角落，沿 Z 的兩側不跨（角落不重疊）
    for (const side of ['z0', 'z1', 'x0', 'x1']) {
      const r = room(b, side);
      if (r < 3 * G) continue;
      // 街區的地形在邊緣內外各 G 之間往下斜，所以平台從邊緣往內 G 開始（看不到縫）
      if (side === 'z0' || side === 'z1') {
        const z = side === 'z0' ? b.z0 + (G - r) / 2 : b.z1 - (G - r) / 2;
        if (Math.abs(z) > lim) continue;
        const ex0 = room(b, 'x0') >= 3 * G ? room(b, 'x0') : 0,
          ex1 = room(b, 'x1') >= 3 * G ? room(b, 'x1') : 0;
        for (const [p, q] of seg(Math.max(-lim, b.x0 - ex0), Math.min(lim, b.x1 + ex1), cuts(b, side)))
          ledge(w.addDeck((p + q) / 2, z, q - p, r + G, y, T, false, null));
      } else {
        const x = side === 'x0' ? b.x0 + (G - r) / 2 : b.x1 - (G - r) / 2;
        if (Math.abs(x) > lim) continue;
        for (const [p, q] of seg(b.z0 + G, b.z1 - G, cuts(b, side)))
          ledge(w.addDeck(x, (p + q) / 2, r + G, q - p, y, T, true, null));
      }
    }
  }
}

// ---------- 物件 ----------
// 玻璃高樓：w × h × d，原點在底面中心
export function buildGlassTower(w, h, d, seed) {
  const glb = propGlb('glass_tower', { ref: [14, 30, 14], size: [w, h, d], fade: true });
  if (glb) return glb;
  const wm = windowMat({ base: '#c8d4dc', win: '#3a5a78', broken: 0.05, seed }, Math.max(w, d), h);
  const trim = fadeMat(0xe6eaee, { roughness: 0.5, metalness: 0.3 });
  const k = new PK().bounds(-w / 2 - 0.2, 0, -d / 2 - 0.2, w / 2 + 0.2, h + 9, d / 2 + 0.2); // 外框同原本
  k.box(wm, w, h, d, 0, h / 2, 0);
  // 基座（挑高的大廳）＋每 8 m 的水平遮陽板＋四角的白色豎框＋屋頂（機房、直升機坪標示、天線）
  k.box(trim, w + 0.4, 1.2, d + 0.4, 0, 0.6, 0);
  for (let y = 8; y < h - 2; y += 8) k.box(trim, w + 0.4, 0.2, d + 0.4, 0, y, 0);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) k.box(trim, 0.45, h, 0.45, sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1));
  k.box(trim, w + 0.4, 0.8, d + 0.4, 0, h, 0);
  k.box(trim, w * 0.4, 3, d * 0.4, 0, h + 1.5, 0);
  grille(k, trim, DETAIL.dark, w * 0.3, 1.6, 4, 0, h + 1.6, d * 0.2 + 0.03);
  k.cyl(
    DETAIL.yellow,
    Math.min(w, d) * 0.22,
    Math.min(w, d) * 0.22,
    0.04,
    -w * 0.25,
    h + 0.42,
    -d * 0.25,
    0,
    0,
    0,
    16,
  );
  k.cyl(fadeMat(0x3d4044), 0.12, 0.12, 6, w * 0.1, h + 6, 0, 0, 0, 0, 6);
  k.box(DETAIL.red, 0.25, 0.25, 0.25, w * 0.1, h + 9.1, 0);
  // 小細節：帷幕牆的豎框（每 3 m）、大廳的入口雨棚與玻璃門、屋頂的女兒牆欄杆、直升機坪的 H 字與邊燈、
  // 擦窗機的軌道與吊臂、空調機組
  k.fine(() => {
    const dk = fadeMat(0x3d4044, { roughness: 0.6, metalness: 0.5 });
    for (const sz of [-1, 1]) {
      for (let x = -w / 2 + 3; x < w / 2 - 1; x += 3)
        k.box(trim, 0.12, h - 1.6, 0.1, x, h / 2 + 0.4, sz * (d / 2 + 0.03));
      K.bx(k, trim, w * 0.5, 0.3, 3, 0, 4.2, sz * (d / 2 + 1.5), 0, 0, 0, 0.06);
      for (const x of [-w * 0.2, w * 0.2]) K.cy(k, trim, 0.15, 4, x, 2.1, sz * (d / 2 + 2.8), 10);
      k.box(
        fadeMat(0x24384a, { roughness: 0.1, metalness: 0.5 }),
        w * 0.3,
        3,
        0.06,
        0,
        2.3,
        sz * (d / 2 + 0.05),
      );
    }
    for (const sx of [-1, 1])
      for (let z = -d / 2 + 3; z < d / 2 - 1; z += 3)
        k.box(trim, 0.1, h - 1.6, 0.12, sx * (w / 2 + 0.03), h / 2 + 0.4, z);
    K.railing(
      k,
      trim,
      [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [w / 2, d / 2],
        [-w / 2, d / 2],
        [-w / 2, -d / 2],
      ],
      h + 0.4,
      1.1,
      0.04,
    );
    const hr = Math.min(w, d) * 0.22;
    for (const s of [-1, 1])
      k.box(DETAIL.white, hr * 0.12, 0.02, hr * 0.9, -w * 0.25 + s * hr * 0.3, h + 0.45, -d * 0.25);
    k.box(DETAIL.white, hr * 0.6, 0.02, hr * 0.12, -w * 0.25, h + 0.45, -d * 0.25);
    for (let i = 0; i < 8; i++) {
      const q = (i / 8) * Math.PI * 2;
      K.cy(
        k,
        mat(0x60c0ff, { emissive: 0x2a6080 }),
        0.08,
        0.1,
        -w * 0.25 + Math.cos(q) * hr,
        h + 0.46,
        -d * 0.25 + Math.sin(q) * hr,
        6,
      );
    }
    k.box(dk, w * 0.8, 0.15, 0.3, 0, h + 0.5, d * 0.42);
    K.bx(k, dk, 1.0, 1.2, 1.0, w * 0.3, h + 1.0, d * 0.42, 0, 0, 0, 0.05);
    k.box(dk, 0.2, 0.2, 3.5, w * 0.3, h + 1.6, d * 0.42 + 1.6);
    for (let i = 0; i < 3; i++) {
      K.bx(
        k,
        mat(0xb8bcc0, { roughness: 0.5 }),
        2,
        1.2,
        1.4,
        w * 0.3,
        h + 1.0,
        -d * 0.1 - i * 1.8,
        0,
        0,
        0,
        0.05,
      );
      K.cy(k, dk, 0.45, 0.05, w * 0.3, h + 1.63, -d * 0.1 - i * 1.8, 14);
    }
  });
  return k.build();
}
// 防空砲塔：原點在底面中心，半徑約 1.8
export function buildAATurret() {
  const glb = propGlb('aa_turret', { fade: true });
  if (glb) return glb;
  const m = fadeMat(0x8a949e, { roughness: 0.5, metalness: 0.5 }),
    dk = fadeMat(0x3d4044, { roughness: 0.7, metalness: 0.4 });
  const k = new PK().obCyl(1.8, 2, 1.2, 0, 0.6, 0, 0, 0, 0, 10).ob(2.4, 1.4, 2.4, 0, 1.9, 0); // 外框同原本的零件
  for (const s of [-0.5, 0.5]) k.obCyl(0.15, 0.15, 3.2, s, 3, -1.2, 1.0, 0, 0, 6);
  // 底座（螺栓環）＋旋轉座＋砲塔（倒角、斜面裝甲、感測器）＋雙砲管（砲口制退器）＋彈藥箱
  k.cyl(dk, 1.8, 2, 1.2, 0, 0.6, 0, 0, 0, 0, 10);
  k.cyl(m, 1.5, 1.6, 0.3, 0, 1.3, 0, 0, 0, 0, 10);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    k.box(DETAIL.steel, 0.12, 0.1, 0.12, Math.cos(a) * 1.85, 1.22, Math.sin(a) * 1.85);
  }
  k.cb(m, 2.4, 1.4, 2.4, 0, 1.9, 0, 0, 0, 0, 0.2);
  k.cb(m, 2.0, 0.8, 0.9, 0, 2.1, -1.1, -0.5, 0, 0, 0.12);
  k.cb(dk, 0.6, 0.5, 0.6, 0.8, 2.85, 0.4, 0, 0, 0, 0.06);
  k.box(DETAIL.glass, 0.4, 0.2, 0.05, 0.8, 2.9, 0.1);
  for (const s of [-0.5, 0.5])
    k.at(s, 3, -1.2, 1.0, 0, 0, () => {
      k.cyl(dk, 0.15, 0.15, 3.2, 0, 0, 0, 0, 0, 0, 6);
      k.cyl(dk, 0.24, 0.24, 0.9, 0, -1.1, 0, 0, 0, 0, 6);
      k.cyl(dk, 0.2, 0.2, 0.3, 0, 1.6, 0, 0, 0, 0, 6);
    });
  for (const s of [-1, 1]) k.cb(dk, 0.4, 0.8, 1.2, s * 1.4, 1.9, 0.2, 0, 0, 0, 0.05);
  // 小細節：砲管的散熱孔與制退器的開口、彈鏈、砲塔的檢修艙蓋與把手、旋轉座的齒環、警示斜紋、雷達
  k.fine(() => {
    for (const s of [-0.5, 0.5])
      k.at(s, 3, -1.2, 1.0, 0, 0, () => {
        for (let y = 0.2; y < 1.2; y += 0.25) K.cy(k, m, 0.17, 0.06, 0, y, 0, 10);
        for (const a of [0, Math.PI / 2]) k.box(DETAIL.black, 0.42, 0.08, 0.05, 0, 1.6, 0, 0, a, 0);
      });
    for (const s of [-1, 1])
      K.pipe(
        k,
        DETAIL.steel,
        [
          [s * 1.4, 2.2, -0.2],
          [s * 0.9, 2.6, -0.9],
          [s * 0.5, 2.7, -1.3],
        ],
        0.06,
        6,
      );
    K.cy(k, m, 0.35, 0.06, -0.4, 2.62, 0.5, 12);
    K.handle(k, DETAIL.steel, 0.25, -0.4, 2.66, 0.5, 0, 0.05, 0.015);
    k.geo(dk, D.gear(1.55, 40, 0.12), 0, 1.15, 0, 0, 0, Math.PI / 2);
    K.hazard(k, DETAIL.yellow, DETAIL.black, 2.2, 0.15, 0.02, 0, 1.25, 1.21);
    K.lathe(
      k,
      dk,
      [
        [0, 0],
        [0.35, 0.05],
        [0.42, 0.18],
        [0, 0.2],
      ],
      0.8,
      3.15,
      0.4,
      'y',
      10,
      -0.4,
      0,
      0,
    );
  });
  return k.build();
}
// 流線型路燈：原點在底面中心，高 h
export function buildSleekLamp(h) {
  const glb = propGlb('sleek_lamp', { ref: [1.6, 8, 0.6], size: [1.6, h, 0.6] });
  if (glb) return glb;
  const m = mat(0xe6eaee, { roughness: 0.4, metalness: 0.4 });
  const k = new PK()
    .obCyl(0.12, 0.2, h, 0, h / 2, 0)
    .ob(1.6, 0.18, 0.4, 0.6, h, 0)
    .ob(0.8, 0.12, 0.35, 1.1, h - 0.12, 0); // 外框同原本的零件
  // 呼叫端會任意旋轉：零件分到原本的零件上（桿 0、橫臂 1、燈 2）
  k.inPart(0, () => {
    k.cyl(m, 0.2, 0.2, 0.3, 0, 0.15, 0, 0, 0, 0, 10);
    k.cyl(m, 0.12, 0.2, h, 0, h / 2, 0, 0, 0, 0, 8);
    k.cyl(mat(0x5aa0d0, { roughness: 0.3 }), 0.21, 0.21, 0.1, 0, 2.4, 0, 0, 0, 0, 8);
  });
  k.inPart(1, () => k.cb(m, 1.6, 0.18, 0.4, 0.6, h, 0, 0, 0, 0, 0.06));
  k.inPart(2, () => k.box(mat(0xdff4ff, { emissive: 0x5a7a8a }), 0.8, 0.12, 0.35, 1.1, h - 0.12, 0));
  // 小細節（桿上）：底座的螺栓、桿身的接縫與感測器、標示燈條、監視器
  k.inPart(0, () =>
    k.fine(() => {
      K.boltRing(k, DETAIL.steel, 0.17, 0.31, 6, 0.02);
      for (const y of [1.2, h * 0.5]) K.cy(k, m, 0.17, 0.04, 0, y, 0, 10);
      K.bx(k, m, 0.2, 0.3, 0.12, 0, 3.2, 0.16, 0, 0, 0, 0.03);
      K.lathe(
        k,
        DETAIL.dark,
        [
          [0, 0],
          [0.08, 0],
          [0.1, 0.15],
          [0, 0.2],
        ],
        0,
        h * 0.75,
        0.15,
        'y',
        10,
        Math.PI / 2 + 0.3,
        0,
        0,
      );
    }),
  );
  return k.build();
}
// 花台（矮掩體）：4 × 1.2 × 1.6（沿 X），原點在底面中心
export const PLANTER = [4, 1.3, 1.6];
export function buildPlanter() {
  const glb = propGlb('planter', { fade: true });
  if (glb) return glb;
  const pm = fadeMat(0xd8dce0, { roughness: 0.8 }),
    leaf = fadeMat(0x4a7a4a, { roughness: 1 });
  const k = new PK().bounds(-2, 0, -0.8, 2, 1.61, 0.8); // 外框同原本
  // 倒角的花台＋上緣的壓頂＋底部的踢腳＋側面的燈條＋土與灌木
  k.cb(pm, 4, 0.9, 1.6, 0, 0.45, 0, 0, 0, 0, 0.1);
  k.cb(pm, 4.1, 0.12, 1.7, 0, 0.92, 0, 0, 0, 0, 0.04);
  for (const s of [-1, 1]) k.box(mat(0xdff4ff, { emissive: 0x5a7a8a }), 3.2, 0.06, 0.04, 0, 0.2, s * 0.81);
  k.box(fadeMat(0x4a3a2e, { roughness: 1 }), 3.7, 0.05, 1.3, 0, 0.88, 0);
  for (let i = -1; i <= 1; i++)
    k.geo(leaf, new THREE.IcosahedronGeometry(0.6, 0), i * 1.2, 1.1, 0, i * 0.5, i, 0);
  // 小細節：灌木的細枝葉（小的雜訊塊）、花、壓頂的接縫、排水孔
  k.fine(() => {
    for (let i = 0; i < 7; i++)
      k.geo(
        leaf,
        D.rock(i + 9, 1, 0.4, 0.3, 0),
        -1.6 + i * 0.53,
        1.2 + (i % 2) * 0.15,
        ((i % 3) - 1) * 0.3,
        0,
        i,
        0,
        0.3,
        0.28,
        0.3,
      );
    for (let i = 0; i < 6; i++)
      K.cy(
        k,
        mat([0xe05080, 0xf0d040, 0xffffff][i % 3], { roughness: 0.7 }),
        0.06,
        0.05,
        -1.5 + i * 0.6,
        1.45,
        i % 2 ? 0.3 : -0.25,
        6,
      );
    for (const x of [-1, 0, 1]) k.box(DETAIL.dark, 0.02, 0.13, 1.72, x, 0.92, 0);
    for (const s of [-1, 1]) k.box(DETAIL.dark, 0.1, 0.06, 0.02, 1.6, 0.05, s * 0.81);
  });
  return k.build();
}

// ---------- 地形特徵的外觀（白色流線的都市結構）----------
const C = {
  deck: 0xd0d6dc,
  trim: 0x5aa0d0,
  pillar: 0xbac2ca,
  wall: 0xd8dde2,
  plat: 0xc8ced4,
  rock: 0x50565c,
};
registerFeatureStyle('xylem', C, {
  deck(w, d, thick, rotY, C) {
    const dm = fadeMat(C.deck, { roughness: 0.5, metalness: 0.2 }),
      tm = fadeMat(C.trim, { roughness: 0.3, metalness: 0.3 }),
      glass = fadeMat(0x9ac8e0, { roughness: 0.1, metalness: 0.3 });
    glass.opacity = 0.5;
    const L = rotY ? d : w,
      D = rotY ? w : d;
    const k = new PK();
    k.at(0, 0, 0, 0, rotY ? Math.PI / 2 : 0, 0, () => {
      // 流線斷面的橋面（下緣收斜）＋玻璃護欄（支柱）＋藍色扶手＋路面的導引線
      k.prism(
        dm,
        [
          [-D / 2, 0],
          [D / 2, 0],
          [D / 2, -thick * 0.55],
          [D / 2 - 0.8, -thick],
          [-D / 2 + 0.8, -thick],
          [-D / 2, -thick * 0.55],
        ],
        L,
        0,
        0,
        0,
        0,
        Math.PI / 2,
        0,
      );
      for (const s of [-1, 1]) {
        k.box(glass, L, 1, 0.15, 0, 0.5, s * (D / 2 - 0.1));
        k.box(tm, L, 0.12, 0.3, 0, 1.05, s * (D / 2 - 0.15));
        for (let x = -L / 2 + 1; x < L / 2; x += 3) k.box(dm, 0.1, 1, 0.2, x, 0.5, s * (D / 2 - 0.1));
        k.box(tm, L - 1, 0.02, 0.12, 0, 0.01, s * (D / 2 - 1.2));
      }
    });
    return k.build();
  },
  pillar(r, h, C) {
    const k = new PK().bounds(-r * 1.2, -h / 2, -r * 1.2, r * 1.2, h / 2, r * 1.2); // 外框同原本
    const m = mat(C.pillar, { roughness: 0.5 });
    k.cyl(m, r * 0.8, r * 1.2, h, 0, 0, 0, 0, 0, 0, 12);
    k.cyl(m, r * 1.25, r * 0.85, 1.2, 0, h / 2 - 0.6, 0, 0, 0, 0, 12);
    k.cyl(mat(C.trim, { roughness: 0.3 }), r * 1.0, r * 1.02, 0.15, 0, h / 2 - 1.4, 0, 0, 0, 0, 12);
    return k.build();
  },
  wall(w, h, d, C) {
    const k = new PK();
    const m = fadeMat(C.wall, { roughness: 0.6 });
    const along = w > d,
      L = along ? w : d,
      T = along ? d : w;
    k.at(0, 0, 0, 0, along ? 0 : Math.PI / 2, 0, () => {
      k.cb(m, L, h, T, 0, 0, 0, 0, 0, 0, Math.min(0.3, T * 0.3));
      k.box(fadeMat(C.trim), L + 0.05, 0.2, T + 0.05, 0, h / 2 - 0.4, 0);
      for (let x = -L / 2 + 2.5; x < L / 2 - 0.5; x += 2.5)
        for (const s of [-1, 1]) k.box(DETAIL.steel, 0.04, h - 1.2, 0.03, x, -0.3, s * (T / 2 + 0.01));
    });
    return k.build();
  },
  platform(w, h, d, C) {
    const k = new PK();
    k.cb(fadeMat(C.plat, { roughness: 0.6 }), w, h, d, 0, h / 2, 0, 0, 0, 0, 0.3);
    k.box(fadeMat(C.trim), w + 0.1, 0.2, d + 0.1, 0, h - 0.3, 0);
    k.box(mat(0xdff4ff, { emissive: 0x5a7a8a }), w + 0.06, 0.08, d + 0.06, 0, 0.5, 0);
    return k.build();
  },
  ramp(rw, rd, C) {
    const along = rw >= rd;
    const L = along ? rw : rd,
      D = along ? rd : rw;
    const k = new PK().ob(rw, 0.35, rd); // 外框同原本
    k.at(0, 0, 0, 0, along ? 0 : Math.PI / 2, 0, () => {
      k.cb(mat(C.deck, { roughness: 0.5 }), L, 0.35, D, 0, 0, 0, 0, 0, 0, 0.1);
      for (const s of [-1, 1])
        k.box(mat(C.trim, { roughness: 0.3 }), L, 0.06, 0.15, 0, 0.19, s * (D / 2 - 0.3));
    });
    return k.build();
  },
  tunnel(C) {
    const k = new PK();
    const wm = mat(C.wall, { roughness: 0.6 });
    k.cb(mat(0x8a949e, { roughness: 0.6 }), 24, 14, 10, 0, 5, -6, 0, 0, 0, 1.6);
    k.cb(wm, 12, 9, 2.5, 0, 4.5, 0, 0, 0, 0, 0.4);
    k.box(HOLE, 8, 6.5, 2.8, 0, 3.25, 0);
    k.box(mat(C.trim), 8.6, 0.3, 2.9, 0, 6.7, 0);
    for (const s of [-1, 1])
      k.box(mat(0xdff4ff, { emissive: 0x5a7a8a }), 0.15, 6.2, 0.1, s * 4.25, 3.3, 1.35);
    k.box(DETAIL.glass, 5, 1, 0.08, 0, 7.8, 1.27);
    return k.build();
  },
});

const H = 0.5;
function planTerrain(w) {
  return planIslands(w, { h: H, deep: -30, central: 46, n: [5, 8], size: [30, 56], span: 44, gap: 12 });
}
function buildStructures(w) {
  buildBridges(w, 12); // 2026-11-07：橋加寬（9 → 12）
  buildLedges(w, 6, 2.3); // 海面的浮台（比街區低約 7 m）
  // 街區邊緣的護欄（裝飾，不擋）
  const rm = mat(0xe6eaee, { roughness: 0.4, metalness: 0.4 });
  for (const b of w.islands.blocks) {
    for (const [x0, z0, x1, z1] of [
      [b.x0, b.z0, b.x1, b.z0],
      [b.x0, b.z1, b.x1, b.z1],
      [b.x0, b.z0, b.x0, b.z1],
      [b.x1, b.z0, b.x1, b.z1],
    ]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const r = box(
        x1 === x0 ? 0.15 : len,
        0.15,
        x1 === x0 ? len : 0.15,
        rm,
        (x0 + x1) / 2,
        H * G + 1.1,
        (z0 + z1) / 2,
      );
      w.scene.add(r);
      w.meshes.push(r);
      (w.rimMeshes = w.rimMeshes || []).push(r); // 平台外緣（打得掉：docs/destruction-design.md 第 6 期）
    }
  }
}
// 玻璃高樓照現實尺寸（10–40 層）；防空砲塔放大 AA_S 倍；花台、路燈照現實尺寸（雜物）
const AA_S = 2;
function buildProps(w) {
  for (let k = w.cnt(6, 9); k > 0; k--) {
    const bw = rnd(30, 50),
      bd = rnd(30, 50),
      h = RNG() < 0.35 ? rnd(100, 150) : rnd(35, 90);
    const spot = w.findSpot([-bw / 2, bw / 2, -bd / 2, bd / 2], G, 30);
    if (!spot) continue;
    const g = buildGlassTower(bw, h, bd, Math.floor(RNG() * 1e6));
    g.position.y = spot.lo;
    w.addBig(g, spot, [{ box: [-bw / 2, bw / 2, -bd / 2, bd / 2], y: spot.lo, top: spot.lo + h }]);
  }
  w.scatter(w.cnt(4, 6), 18, (x, z, y) => {
    const g = buildAATurret();
    g.scale.setScalar(AA_S);
    w.addSmall(g, x, y, z, { r: 2 * AA_S, h: 3.4 * AA_S }, 'aaturret', 4400, 0x8a949e);
  });
  w.scatter(w.cnt(12, 18), 6, (x, z, y) => {
    const g = buildPlanter();
    const rot = RNG() < 0.5;
    if (rot) g.rotation.y = Math.PI / 2;
    w.addSmall(
      g,
      x,
      y,
      z,
      { w: rot ? PLANTER[2] : PLANTER[0], h: PLANTER[1], d: rot ? PLANTER[0] : PLANTER[2] },
      'planter',
      900,
      0xd8dce0,
    );
  });
  w.scatter(w.cnt(12, 18), 6, (x, z, y) => {
    const h = rnd(8, 12);
    const g = buildSleekLamp(h);
    g.rotation.y = rnd(0, 6.28);
    w.addSmall(g, x, y - 0.1, z, { r: 0.4, h }, 'lamp', 600, 0xe6eaee);
  });
}

export const XYLEM = {
  name: '洋上都市 Reefhold',
  ground: 0x9aa0a6,
  slope: 0x6a7076,
  rock: 0x50565c,
  fog: 0xb8cad6,
  sky: 0xa8c4dc,
  sun: 0xfff4e6,
  amb: 0x8aa0b4,
  container: 0xd8dce0,
  container2: 0x5aa0d0,
  hasRocks: false,
  props: 'xylem',
  water: { level: -2.2, color: 0x1f4a66, opacity: 0.93, wide: true },
  void: { y: -4, fall: -6, fallP: -10, ref: H }, // fallP：玩家操作的機體掉到這裡才拉回（有時間飛回來）
  fogFar: 220,
  featureKinds: [],
  corridor: { p: 0.5, kinds: ['rail'] },
  bossBan: ['worm', 'rampart'],
  planTerrain,
  buildStructures,
  buildProps,
  propNames: { aaturret: '防空砲塔', planter: '花台', lamp: '路燈' },
  catalog: [
    [
      'glass_tower',
      '玻璃高樓',
      '洋上都市的全身掩體；現實尺寸寬 30–50、高 35–150 m（10–40 層），可站上屋頂、不可破壞；GLB 依尺寸縮放',
      () => buildGlassTower(14, 30, 14, 3),
    ],
    [
      'aa_turret',
      '防空砲塔',
      '洋上都市；遊戲中放大 2 倍（半徑約 4、高 6.8 m），可破壞',
      () => buildAATurret(),
    ],
    ['sleek_lamp', '流線型路燈', '洋上都市；現實高 8–12 m，可破壞；GLB 依高度縮放', () => buildSleekLamp(8)],
    ['planter', '花台', '洋上都市的雜物；現實尺寸 4 × 1.3 × 1.6 m（沿 X），可破壞', () => buildPlanter()],
  ],
};
