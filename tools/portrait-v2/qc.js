// 表情抽查：node qc.js <輸出.jpg> <角色> <姿勢> <鍵,…>：每格裁臉框（放大一圈），第一格是主圖
const sharp = require('C:/Users/LOREN/Documents/_projects/MECH-CORDON/node_modules/sharp');
const R = 'C:/Users/LOREN/Documents/_projects/MECH-CORDON/';
const [out, cid, pid, keys] = process.argv.slice(2);
(async () => {
  const c = require(R + 'src/assets/characters/' + cid + '/card.json');
  const p = c.poses.find((x) => x.id === pid);
  const [fx, fy, fw, fh] = p.boxes.face;
  const m = Math.round(fw * 0.25);
  const meta = await sharp(R + 'server-models/charwork/' + cid + '/' + p.master).metadata();
  const ext = { left: Math.max(0, fx - m), top: Math.max(0, fy - m), width: Math.min(meta.width - Math.max(0, fx - m), fw + 2 * m), height: Math.min(meta.height - Math.max(0, fy - m), fh + 2 * m) };
  const list = [['主圖', p.master], ...keys.split(',').map((k) => [k, p.ex?.[k]?.pick])];
  const T = 220, comp = [];
  for (const [i, [lab, f]] of list.entries()) {
    if (!f) continue;
    const img = await sharp(R + 'server-models/charwork/' + cid + '/' + f).extract(ext).resize({ width: T, height: T, fit: 'contain', background: '#fff' }).toBuffer();
    const x = (i % 6) * T, y = Math.floor(i / 6) * (T + 20);
    comp.push({ input: img, left: x, top: y + 20 }, { input: Buffer.from(`<svg width="${T}" height="20"><rect width="100%" height="20" fill="#222"/><text x="4" y="15" font-size="14" fill="#fff" font-family="sans-serif">${cid} ${pid} ${lab}</text></svg>`), left: x, top: y });
  }
  const rows = Math.ceil(list.length / 6);
  await sharp({ create: { width: 6 * T, height: rows * (T + 20), channels: 3, background: '#fff' } }).composite(comp).jpeg({ quality: 85 }).toFile(out);
  console.log(out);
})();
