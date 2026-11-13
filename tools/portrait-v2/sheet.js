// 候選比較圖：node sheet.js <角色> <輸出.jpg>：每個姿勢一格，兩張候選並排，上方標姿勢與種子
const sharp = require('C:/Users/LOREN/Documents/_projects/MECH-CORDON/node_modules/sharp');
const fs = require('fs');
const [cid, out] = process.argv.slice(2);
const W = 'C:/Users/LOREN/Documents/_projects/MECH-CORDON/tools/comfyui/runtime/work/v2/' + cid + '/';
(async () => {
  const H = 380;
  const tiles = [];
  for (const d of fs.readdirSync(W).sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)))) {
    for (const f of fs.readdirSync(W + d).filter((f) => f.endsWith('.png')).sort()) {
      const img = await sharp(W + d + '/' + f).resize({ height: H }).toBuffer({ resolveWithObject: true });
      const lab = Buffer.from(
        `<svg width="${img.info.width}" height="26"><rect width="100%" height="26" fill="#222"/><text x="6" y="19" font-size="17" fill="#fff" font-family="sans-serif">${d} ${f.replace('edit_', '').replace('.png', '')}</text></svg>`,
      );
      tiles.push({ img, lab });
    }
  }
  const w = tiles[0].img.info.width,
    cols = 6,
    rows = Math.ceil(tiles.length / cols),
    th = H + 26;
  const comp = [];
  tiles.forEach((t, k) => {
    const x = (k % cols) * w,
      y = Math.floor(k / cols) * th;
    comp.push({ input: t.lab, left: x, top: y }, { input: t.img.data, left: x, top: y + 26 });
  });
  await sharp({ create: { width: w * cols, height: th * rows, channels: 3, background: '#fff' } })
    .composite(comp)
    .jpeg({ quality: 78 })
    .toFile(out);
  console.log(out, tiles.length);
})();
