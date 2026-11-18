// 立繪工房的成品輸出（docs/portrait-studio-design.md 第 5 期）：給遊戲以外的引擎用。
// 照播放器（mech_cordon_studio/js/portrait.js 的 draw，沒有分層的畫法）疊：主圖 → 表情的臉 → 眼睛 → 嘴巴，
// 小圖只留主圖不透明的地方（patchMasked）。要 sharp（開發模式）。
// - full：每個姿勢 × 表情 × 眼睛（open／e1／e2）× 嘴巴（closed／m1／m2／m3）一張合成好的整張 WebP
//   full/<姿勢>_<表情>_<眼睛>_<嘴巴>.webp ＋ full/index.json
// - atlas：每個姿勢一張精靈圖（只有臉的那一塊，每行一個表情、每格一種眼睛×嘴巴）＋ JSON（格子的位置）
//   引擎先畫 body（主圖），再把格子畫在 region 的位置：atlas/<姿勢>.webp、atlas/<姿勢>.json、atlas/<姿勢>_body.webp
'use strict';
const fs = require('fs');
const path = require('path');

const EYES = ['open', 'e1', 'e2'];
const MOUTHS = ['closed', 'm1', 'm2', 'm3'];

// RGBA 的 raw 圖：{ w, h, d }
async function raw(sharp, file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, d: data };
}
// 小圖貼到 out（整張主圖大小的 RGBA）的 box 位置，只貼主圖不透明的地方
function paste(out, base, patch, box) {
  const [bx, by, bw, bh] = box.map(Math.round);
  const pw = patch.w;
  const ph = patch.h;
  for (let y = 0; y < Math.min(bh, ph); y++)
    for (let x = 0; x < Math.min(bw, pw); x++) {
      const X = bx + x;
      const Y = by + y;
      if (X < 0 || Y < 0 || X >= base.w || Y >= base.h) continue;
      const o = (Y * base.w + X) * 4;
      const p = (y * pw + x) * 4;
      const a = (patch.d[p + 3] / 255) * (base.d[o + 3] / 255);
      if (a <= 0) continue;
      for (let c = 0; c < 3; c++) out[o + c] = Math.round(patch.d[p + c] * a + out[o + c] * (1 - a));
    }
}

// 一個角色的發佈資料夾（cdir）＋ card.pub → 每個姿勢的組合清單
function combos(pub) {
  const out = [];
  for (const P of pub.poses || [])
    for (const [e, ex] of Object.entries(P.ex || {}))
      for (const eye of EYES)
        for (const m of MOUTHS) {
          if (eye !== 'open' && !ex[eye]) continue;
          if (m !== 'closed' && !ex[m]) continue;
          out.push({ P, e, ex, eye, m });
        }
  return out;
}

// 合成一格（整張大小的 RGBA raw）。cache：同一個姿勢的主圖與小圖只解一次
async function compose(sharp, cdir, c, cache) {
  const get = async (f) => {
    if (!cache.has(f)) {
      if (cache.size > 80) cache.clear();
      cache.set(f, await raw(sharp, path.join(cdir, f)));
    }
    return cache.get(f);
  };
  const { P, ex, eye, m } = c;
  const base = await get(P.img);
  const out = Buffer.from(base.d);
  if (ex.f && P.boxes.face) paste(out, base, await get(ex.f), P.boxes.face);
  if (eye !== 'open' && P.boxes.eyes) paste(out, base, await get(ex[eye]), P.boxes.eyes);
  const mb = ex.mb || P.boxes.mouth;
  if (m !== 'closed' && mb) paste(out, base, await get(ex[m]), mb);
  return { w: base.w, h: base.h, d: out };
}

// zip 的項目（make() 時才合成，邊合成邊寫）
function exportEntries(sharp, cdir, id, kind, pre, quality = 88) {
  const card = JSON.parse(fs.readFileSync(path.join(cdir, 'card.json'), 'utf8'));
  if (!card.pub) return [];
  const pub = card.pub;
  const cache = new Map();
  const list = combos(pub);
  const entries = [];
  const head = { v: 1, id, name: card.name || id, eyes: EYES, mouths: MOUTHS };
  if (kind === 'full') {
    const index = { ...head, frames: [] };
    for (const c of list) {
      const name = `${c.P.id}_${c.e}_${c.eye}_${c.m}.webp`;
      index.frames.push({ pose: c.P.id, expr: c.e, eye: c.eye, mouth: c.m, file: name });
      entries.push({
        name: `${pre}${id}/full/${name}`,
        make: async () => {
          const r = await compose(sharp, cdir, c, cache);
          return sharp(r.d, { raw: { width: r.w, height: r.h, channels: 4 } })
            .webp({ quality, alphaQuality: 100 })
            .toBuffer();
        },
      });
    }
    entries.unshift({
      name: `${pre}${id}/full/index.json`,
      data: Buffer.from(JSON.stringify(index, null, 1) + '\n'),
    });
    return entries;
  }
  // atlas：每個姿勢一張；格子＝臉框、眼睛框、各表情的嘴框的聯集（往外 4 px）
  for (const P of pub.poses || []) {
    const pl = list.filter((c) => c.P === P);
    if (!pl.length) continue;
    const bs = [P.boxes.face, P.boxes.eyes, P.boxes.mouth, ...Object.values(P.ex).map((x) => x.mb)].filter(
      Boolean,
    );
    let x0 = Math.min(...bs.map((b) => b[0])) - 4;
    let y0 = Math.min(...bs.map((b) => b[1])) - 4;
    let x1 = Math.max(...bs.map((b) => b[0] + b[2])) + 4;
    let y1 = Math.max(...bs.map((b) => b[1] + b[3])) + 4;
    x0 = Math.max(0, Math.round(x0));
    y0 = Math.max(0, Math.round(y0));
    x1 = Math.min(P.w, Math.round(x1));
    y1 = Math.min(P.h, Math.round(y1));
    const tw = x1 - x0;
    const th = y1 - y0;
    const exprs = [...new Set(pl.map((c) => c.e))];
    const cols = EYES.length * MOUTHS.length;
    // 一頁最多幾行（WebP 最大 16383 px）；表情很多、臉很大時分成好幾頁
    const per = Math.max(1, Math.floor(16000 / th));
    const pages = Math.ceil(exprs.length / per);
    const map = {};
    const tiles = [];
    for (const [i, e] of exprs.entries()) {
      const page = Math.floor(i / per);
      const row = i % per;
      for (const c of pl.filter((q) => q.e === e)) {
        const col = EYES.indexOf(c.eye) * MOUTHS.length + MOUTHS.indexOf(c.m);
        map[`${e}/${c.eye}/${c.m}`] = [col * tw, row * th, page];
        tiles.push({ c, col, row, page });
      }
    }
    const sheetName = (k) => (pages > 1 ? `${P.id}_${k + 1}.webp` : `${P.id}.webp`);
    const json = {
      ...head,
      pose: P.id,
      body: `${P.id}_body.webp`,
      size: [P.w, P.h],
      region: [x0, y0, tw, th],
      tile: [tw, th],
      cols,
      exprs,
      sheets: Array.from({ length: pages }, (_, k) => sheetName(k)),
      // 「表情/眼睛/嘴巴」→ [x, y, 第幾張精靈圖]（格子的左上角，像素）；沒有的組合（不眨眼的表情、略過的格子）就不在這裡
      frames: map,
    };
    entries.push({
      name: `${pre}${id}/atlas/${P.id}.json`,
      data: Buffer.from(JSON.stringify(json, null, 1) + '\n'),
    });
    entries.push({ name: `${pre}${id}/atlas/${P.id}_body.webp`, file: path.join(cdir, P.img) });
    for (let k = 0; k < pages; k++)
      entries.push({
        name: `${pre}${id}/atlas/${sheetName(k)}`,
        make: async () => {
          const rows = Math.min(per, exprs.length - k * per);
          const W = cols * tw;
          const H = rows * th;
          const sheet = Buffer.alloc(W * H * 4);
          for (const t of tiles.filter((q) => q.page === k)) {
            const r = await compose(sharp, cdir, t.c, cache);
            for (let y = 0; y < th; y++)
              r.d.copy(
                sheet,
                ((t.row * th + y) * W + t.col * tw) * 4,
                ((y0 + y) * r.w + x0) * 4,
                ((y0 + y) * r.w + x0 + tw) * 4,
              );
          }
          return sharp(sheet, { raw: { width: W, height: H, channels: 4 } })
            .webp({ quality, alphaQuality: 100 })
            .toBuffer();
        },
      });
  }
  return entries;
}

module.exports = { exportEntries, combos, EYES, MOUTHS };
