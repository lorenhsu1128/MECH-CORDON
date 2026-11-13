// 標框用的格線圖：node grid.js <輸出.jpg> <y0> <y1> <標籤=路徑> …
// 每張裁 y0～y1（原圖座標）、縮 0.6，格線每 25 px（每 50 px 粗線＋座標）。框檔（同名 .json：{face,eyes,mouth}）存在時畫上去。
const sharp = require('C:/Users/LOREN/Documents/_projects/MECH-CORDON/node_modules/sharp');
const fs = require('fs');
const [out, y0s, y1s, ...items] = process.argv.slice(2);
const y0 = +y0s,
  y1 = +y1s,
  K = 0.6,
  W0 = 832;
const boxes = fs.existsSync(out + '.boxes.json') ? JSON.parse(fs.readFileSync(out + '.boxes.json', 'utf8')) : {};
(async () => {
  const tw = Math.round(W0 * K),
    th = Math.round((y1 - y0) * K) + 24;
  const comp = [];
  const cols = 3;
  for (const [i, it] of items.entries()) {
    const [lab, p] = it.split('=');
    const img = await sharp(p).extract({ left: 0, top: y0, width: W0, height: y1 - y0 }).resize({ width: tw }).toBuffer();
    let g = '';
    for (let x = 0; x <= W0; x += 25) {
      const big = x % 50 === 0;
      g += `<line x1="${x * K}" y1="24" x2="${x * K}" y2="${th}" stroke="${big ? '#f00' : '#f99'}" stroke-opacity="${big ? 0.55 : 0.3}" stroke-width="1"/>`;
      if (x % 100 === 0) g += `<text x="${x * K + 2}" y="36" font-size="11" fill="#c00">${x}</text>`;
    }
    for (let y = Math.ceil(y0 / 25) * 25; y <= y1; y += 25) {
      const big = y % 50 === 0,
        yy = (y - y0) * K + 24;
      g += `<line x1="0" y1="${yy}" x2="${tw}" y2="${yy}" stroke="${big ? '#00f' : '#99f'}" stroke-opacity="${big ? 0.55 : 0.3}" stroke-width="1"/>`;
      if (y % 100 === 0) g += `<text x="2" y="${yy - 2}" font-size="11" fill="#00c">${y}</text>`;
    }
    const b = boxes[lab];
    if (b)
      for (const [k, c] of [
        ['face', '#0a0'],
        ['eyes', '#f0f'],
        ['mouth', '#f80'],
      ])
        if (b[k]) {
          const [x, y, w, h] = b[k];
          g += `<rect x="${x * K}" y="${(y - y0) * K + 24}" width="${w * K}" height="${h * K}" fill="none" stroke="${c}" stroke-width="2"/>`;
        }
    const svg = Buffer.from(
      `<svg width="${tw}" height="${th}"><rect width="${tw}" height="24" fill="#222"/><text x="6" y="17" font-size="15" fill="#fff" font-family="sans-serif">${lab}</text>${g}</svg>`,
    );
    const x = (i % cols) * tw,
      y = Math.floor(i / cols) * th;
    comp.push({ input: img, left: x, top: y + 24 }, { input: svg, left: x, top: y });
  }
  await sharp({
    create: { width: tw * cols, height: th * Math.ceil(items.length / cols), channels: 3, background: '#fff' },
  })
    .composite(comp)
    .jpeg({ quality: 85 })
    .toFile(out);
  console.log(out);
})();
