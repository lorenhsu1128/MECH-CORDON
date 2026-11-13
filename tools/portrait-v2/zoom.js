// 臉部放大的格線圖：node zoom.js <輸出.jpg> <標籤=路徑@cx,cy> …
// 以 (cx,cy) 為中心裁 S×S（原圖座標）、放大 K，格線每 10 px（每 50 px 粗線＋座標）。
// 輸出.jpg.boxes.json（{ 標籤: {face,eyes,mouth} }）存在時畫上框。
const sharp = require('C:/Users/LOREN/Documents/_projects/MECH-CORDON/node_modules/sharp');
const fs = require('fs');
const [out, ...items] = process.argv.slice(2);
const S = +(process.env.ZS || 320),
  K = 400 / S,
  W0 = 832,
  H0 = 1216;
const boxes = fs.existsSync(out + '.boxes.json') ? JSON.parse(fs.readFileSync(out + '.boxes.json', 'utf8')) : {};
(async () => {
  const tw = Math.round(S * K),
    th = tw + 22,
    cols = 3;
  const comp = [];
  for (const [i, it] of items.entries()) {
    const [lab, rest] = it.split('=');
    const [p, c] = rest.split('@');
    const [cx, cy] = c.split(',').map(Number);
    const x0 = Math.max(0, Math.min(W0 - S, Math.round(cx - S / 2))),
      y0 = Math.max(0, Math.min(H0 - S, Math.round(cy - S / 2)));
    const img = await sharp(p).extract({ left: x0, top: y0, width: S, height: S }).resize({ width: tw }).toBuffer();
    let g = '';
    for (let v = Math.ceil(x0 / 10) * 10; v <= x0 + S; v += 10) {
      const big = v % 50 === 0,
        X = (v - x0) * K;
      g += `<line x1="${X}" y1="22" x2="${X}" y2="${th}" stroke="#f00" stroke-opacity="${big ? 0.6 : 0.18}"/>`;
      if (big) g += `<text x="${X + 1}" y="33" font-size="11" fill="#d00">${v}</text>`;
    }
    for (let v = Math.ceil(y0 / 10) * 10; v <= y0 + S; v += 10) {
      const big = v % 50 === 0,
        Y = (v - y0) * K + 22;
      g += `<line x1="0" y1="${Y}" x2="${tw}" y2="${Y}" stroke="#00f" stroke-opacity="${big ? 0.6 : 0.18}"/>`;
      if (big) g += `<text x="1" y="${Y - 1}" font-size="11" fill="#00d">${v}</text>`;
    }
    const b = boxes[lab];
    if (b)
      for (const [k, col] of [
        ['face', '#0a0'],
        ['eyes', '#f0f'],
        ['mouth', '#f80'],
      ])
        if (b[k]) {
          const [x, y, w, h] = b[k];
          g += `<rect x="${(x - x0) * K}" y="${(y - y0) * K + 22}" width="${w * K}" height="${h * K}" fill="none" stroke="${col}" stroke-width="2.5"/>`;
        }
    const svg = Buffer.from(
      `<svg width="${tw}" height="${th}"><rect width="${tw}" height="22" fill="#222"/><text x="6" y="16" font-size="14" fill="#fff" font-family="sans-serif">${lab}</text>${g}</svg>`,
    );
    const X = (i % cols) * tw,
      Y = Math.floor(i / cols) * th;
    comp.push({ input: img, left: X, top: Y + 22 }, { input: svg, left: X, top: Y });
  }
  await sharp({ create: { width: tw * cols, height: th * Math.ceil(items.length / cols), channels: 3, background: '#fff' } })
    .composite(comp)
    .jpeg({ quality: 85 })
    .toFile(out);
  console.log(out);
})();
