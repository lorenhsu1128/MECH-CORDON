// 立繪工房命令列的品管與看圖（docs/portrait-studio-design.md 第 2 期；scripts/studio.js 呼叫）：
// 量測（mech_cordon_studio/js/qa.js，和網頁同一份）＋總表圖檔（給 Claude Code 或人看）。圖用 sharp 解碼與拼接。
// 輸出在 test-results/studio/<專案>/<角色>/：
//   qa.json                 每格的量測與自動判斷
//   <姿勢>_zoom.jpg          放大總表：每行一個表情，左＝眼睛（底圖、e1、e2），右＝嘴巴（底圖、m1、m2、m3）
//   cands_<n>.jpg           候選表：每行一格，底圖｜候選 1、2、3…（編號＝pick 指令用的編號，* 是目前選的）
//   <姿勢>_grid.jpg          主圖加上座標格線（量臉、眼睛、嘴巴框用）；<姿勢>_boxes.jpg 畫出目前的框
'use strict';
const fs = require('fs');
const path = require('path');

let sharp = null;
function S() {
  if (!sharp) {
    try {
      sharp = require('sharp');
    } catch (e) {
      throw new Error('看圖與量測要 sharp（npm install）');
    }
  }
  return sharp;
}
const ROOT = path.join(__dirname, '..');
const CELL = 260;
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// 圖的快取（同一次指令內）：候選資料夾的檔名 → { w, h, data（RGBA）, buf（原檔）}
function loader(store, cid) {
  const cache = new Map();
  return async (f) => {
    if (!cache.has(f)) {
      if (cache.size > 40) cache.clear();
      const buf = Buffer.from(await store.getWork(cid, f));
      const { data, info } = await S()(buf)
        .removeAlpha()
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      cache.set(f, { w: info.width, h: info.height, data, buf });
    }
    return cache.get(f);
  };
}
// 一格：從整張圖裁 box、縮放到寬 CELL，上方一條標籤（bad＝紅底）
async function cell(img, box, text, { bad = false, dim = false, w = CELL } = {}) {
  let h = w;
  let body;
  if (img && box) {
    const x = Math.max(0, Math.round(box[0]));
    const y = Math.max(0, Math.round(box[1]));
    const bw = Math.max(1, Math.min(img.w - x, Math.round(box[2])));
    const bh = Math.max(1, Math.min(img.h - y, Math.round(box[3])));
    h = Math.max(40, Math.round((w * bh) / bw));
    body = await S()(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
      .extract({ left: x, top: y, width: bw, height: bh })
      .resize(w, h)
      .png()
      .toBuffer();
  }
  const lab = Buffer.from(
    `<svg width="${w}" height="18"><rect width="${w}" height="18" fill="${bad ? '#a00000' : '#000'}"/>` +
      `<text x="4" y="13" font-family="Arial" font-size="12" fill="#ffe680">${esc(text)}</text></svg>`,
  );
  const base = S()({ create: { width: w, height: h, channels: 3, background: dim ? '#282828' : '#000' } });
  const comp = [];
  if (body) comp.push({ input: body, top: 0, left: 0 });
  comp.push({ input: lab, top: 0, left: 0 });
  return { w, h, buf: await base.composite(comp).png().toBuffer() };
}
// 拼一張：rows＝[[cell…]…]，同一行的格子靠左排，gap＝某一格之後多空的寬度
async function sheet(rows, file, gapAfter = -1) {
  const W = Math.max(...rows.map((r) => r.reduce((a, c, i) => a + c.w + (i === gapAfter ? 12 : 2), 0)));
  const H = rows.reduce((a, r) => a + Math.max(...r.map((c) => c.h)) + 4, 0);
  const comp = [];
  let y = 0;
  for (const r of rows) {
    let x = 0;
    r.forEach((c, i) => {
      comp.push({ input: c.buf, left: x, top: y });
      x += c.w + (i === gapAfter ? 12 : 2);
    });
    y += Math.max(...r.map((c) => c.h)) + 4;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await S()({ create: { width: W, height: H, channels: 3, background: '#141414' } })
    .composite(comp)
    .jpeg({ quality: 90 })
    .toFile(file);
  return file;
}
const outDir = (project, cid) => path.join(ROOT, 'test-results', 'studio', project, cid);

// ---- 量測 ----
async function runQa({ store, card, project, Q, exprIds, frames, noBlink, poses, log }) {
  const load = loader(store, card.id);
  const all = {};
  for (const P of poses) {
    const rep = await Q.qaPose(P, load, { exprIds, frames, noBlink: noBlink(P) });
    for (const [k, v] of Object.entries(rep)) {
      const slot = P.ex[k];
      slot.qm = { ...v, t: Date.now() };
      all[`${P.id}:${k}`] = v;
    }
    await zoomSheet({ store, card, project, Q, P, exprIds, frames, noBlink: noBlink(P), rep, load });
  }
  const d = outDir(project, card.id);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'qa.json'), JSON.stringify(all, null, 1));
  const bad = Object.entries(all).filter(([, v]) => v.bad.length);
  log(`量測 ${Object.keys(all).length} 格，自動判斷不合格 ${bad.length} 格`);
  for (const [k, v] of bad) log(`  BAD ${k}  ${v.bad.map((b) => Q.QA_REASONS[b] || b).join('、')}`);
  log(`總表：${d}`);
  return all;
}
const fmt = (r) =>
  r
    ? `c${r.chg.toFixed(2)} a${r.alien.toFixed(2)}${r.side != null ? ' s' + r.side.toFixed(2) : ''}${r.iris != null ? ' i' + r.iris.toFixed(2) : ''}`
    : '';
async function zoomSheet({ card, project, Q, P, exprIds, frames, noBlink, rep, load }) {
  const rows = [];
  const eyesF = frames.filter((f) => f[0] === 'e');
  const mouthF = frames.filter((f) => f[0] === 'm');
  for (const e of exprIds) {
    const bf = e === 'neutral' ? P.master : P.ex[e]?.pick;
    if (!bf) continue;
    const base = await load(bf);
    const r = [];
    for (const [kind, fr] of [
      ['eyes', eyesF],
      ['mouth', mouthF],
    ]) {
      const box = Q.viewBox(P, e, kind);
      if (!box) continue;
      r.push(await cell(base, box, `${e} base`));
      for (const fid of fr) {
        const key = `${e}.${fid}`;
        const s = P.ex[key] || {};
        const st = Q.qaState(s);
        if (fid[0] === 'e' && noBlink.includes(e))
          r.push(await cell(null, null, `${fid} no-blink`, { dim: true, w: CELL }));
        else if (s.skip) r.push(await cell(null, null, `${fid} SKIP`, { dim: true }));
        else if (!s.pick) r.push(await cell(null, null, `${fid} -`, { dim: true }));
        else {
          const m = rep[key];
          const tag = st === 'ok' ? ' [OK]' : st === 'ng' ? ' [NG]' : '';
          r.push(
            await cell(
              await load(s.pick),
              box,
              `${P.id}:${key} ${fmt(m)}${m && m.bad.length ? ' BAD:' + m.bad.join(',') : ''}${tag}`,
              {
                bad: !!(m && m.bad.length) || st === 'ng',
              },
            ),
          );
        }
      }
    }
    if (r.length) rows.push(r);
  }
  if (rows.length) await sheet(rows, path.join(outDir(project, card.id), `${P.id}_zoom.jpg`), eyesF.length);
}

// ---- 候選表 ----
// keys：['p1:smile', 'p1:smile.e1', …]；n＝每格最多顯示最新的 n 張候選（0＝全部）
// 編號＝這格的 cands 裡的位置（1 起算），pick 指令用同一個編號
async function candSheet({ store, card, project, Q, keys, n = 0, log }) {
  const load = loader(store, card.id);
  const rows = [];
  for (const kk of keys) {
    const [pid, key] = kk.split(':');
    const P = card.poses.find((p) => p.id === pid);
    if (!P || !key) throw new Error('格子要寫成 <姿勢>:<表情>[.<影格>]：' + kk);
    const [e, fid] = key.split('.');
    const s = P.ex[key];
    if (!s || !s.cands || !s.cands.length) {
      log(`  ${kk}：沒有候選`);
      continue;
    }
    // 範圍：表情＝臉框；眨眼＝眼睛；嘴型＝這個表情的嘴框
    const box = !fid ? padBox(P.boxes.face, 0.12) : Q.viewBox(P, e, fid[0] === 'e' ? 'eyes' : 'mouth');
    const bf = !fid ? P.master : e === 'neutral' ? P.master : P.ex[e]?.pick;
    const r = [await cell(bf ? await load(bf) : null, box, `${kk} base`, { dim: !bf })];
    const idx = s.cands.map((f, i) => i).slice(n > 0 ? -n : 0);
    for (const i of idx) {
      const f = s.cands[i];
      r.push(await cell(await load(f), box, `${i + 1}${s.pick === f ? ' *' : ''}`));
    }
    rows.push(r);
  }
  const d = outDir(project, card.id);
  const out = [];
  for (let k = 0; k < rows.length; k += 12)
    out.push(await sheet(rows.slice(k, k + 12), path.join(d, `cands_${k / 12 + 1}.jpg`)));
  for (const f of out) log('候選表：' + f);
  return out;
}
const padBox = (b, k) => [b[0] - b[2] * k, b[1] - b[3] * k, b[2] * (1 + 2 * k), b[3] * (1 + 2 * k)];

// ---- 主圖：座標格線、目前的框 ----
async function gridSheet({ store, card, project, P, log }) {
  if (!P.master) throw new Error('先選定主圖');
  const load = loader(store, card.id);
  const img = await load(P.master);
  const d = outDir(project, card.id);
  fs.mkdirSync(d, { recursive: true });
  let g = `<svg width="${img.w}" height="${img.h}">`;
  for (let x = 0; x < img.w; x += 25)
    g += `<line x1="${x}" y1="0" x2="${x}" y2="${img.h}" stroke="${x % 100 ? '#00ffff55' : '#ff00ff'}" stroke-width="${x % 100 ? 1 : 1.5}"/>`;
  for (let y = 0; y < img.h; y += 25)
    g += `<line x1="0" y1="${y}" x2="${img.w}" y2="${y}" stroke="${y % 100 ? '#00ffff55' : '#ff00ff'}" stroke-width="${y % 100 ? 1 : 1.5}"/>`;
  for (let x = 0; x < img.w; x += 100)
    for (let y = 0; y < img.h; y += 100)
      g += `<text x="${x + 2}" y="${y + 11}" font-family="Arial" font-size="10" fill="#ff00ff">${x},${y}</text>`;
  g += '</svg>';
  const f1 = path.join(d, `${P.id}_grid.png`);
  await S()(img.buf)
    .composite([{ input: Buffer.from(g) }])
    .png()
    .toFile(f1);
  const col = { face: '#3fa9ff', eyes: '#ffb020', mouth: '#ff4fd0' };
  let b = `<svg width="${img.w}" height="${img.h}">`;
  for (const [k, c] of Object.entries(col)) {
    const v = P.boxes && P.boxes[k];
    if (v)
      b += `<rect x="${v[0]}" y="${v[1]}" width="${v[2]}" height="${v[3]}" fill="none" stroke="${c}" stroke-width="3"/>`;
  }
  b += '</svg>';
  const f2 = path.join(d, `${P.id}_boxes.png`);
  await S()(img.buf)
    .composite([{ input: Buffer.from(b) }])
    .png()
    .toFile(f2);
  // 臉部放大（框比較好量）
  if (P.boxes && P.boxes.face) {
    const [x, y, w, h] = padBox(P.boxes.face, 0.4).map(Math.round);
    const ex = {
      left: Math.max(0, x),
      top: Math.max(0, y),
      width: Math.min(img.w - Math.max(0, x), w),
      height: Math.min(img.h - Math.max(0, y), h),
    };
    await S()(
      await S()(img.buf)
        .composite([{ input: Buffer.from(g) }, { input: Buffer.from(b) }])
        .png()
        .toBuffer(),
    )
      .extract(ex)
      .resize(Math.min(1200, Math.round(ex.width * 2.5)))
      .png()
      .toFile(path.join(d, `${P.id}_face.png`));
    log('臉部放大：' + path.join(d, `${P.id}_face.png`));
  }
  log('格線：' + f1);
  log('目前的框：' + f2);
}

// 主圖的候選（整張縮小並排，編號＝master 指令用的 --file 前面的 [n]）
async function masterSheet({ store, card, project, P, log }) {
  const load = loader(store, card.id);
  const row = [];
  for (const [i, c] of P.cands.entries()) {
    const img = await load(c.file);
    row.push(
      await cell(img, [0, 0, img.w, img.h], `${i + 1} ${c.file}${P.master === c.file ? ' *' : ''}`, {
        w: 300,
      }),
    );
  }
  if (!row.length) throw new Error('還沒有主圖候選');
  const rows = [];
  for (let k = 0; k < row.length; k += 4) rows.push(row.slice(k, k + 4));
  const f = await sheet(rows, path.join(outDir(project, card.id), `${P.id}_masters.jpg`));
  log('主圖候選：' + f);
}

module.exports = { runQa, candSheet, gridSheet, masterSheet, outDir, loader };
