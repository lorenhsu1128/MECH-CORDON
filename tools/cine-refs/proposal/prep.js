const sharp = require(process.cwd() + '/node_modules/sharp');
const fs = require('fs'); const S = process.argv[2];
const jobs = [
  ['test-results/cine-montage-dam.png','dam',900],['test-results/cine-station.png','station',900],
  ['test-results/cine-vista.png','vista',900],['test-results/cine-montage-snow.png','snow',900],
  ['src/assets/characters/castron/p1.webp','castron',520],['src/assets/characters/aetheric/p1.webp','aetheric',520],
  ['src/assets/characters/echo/p1.webp','echo',560],['src/assets/characters/wren/p1.webp','wren',520],
  ['src/assets/characters/veerwell/p1.webp','veerwell',520],
];
(async () => { const out = {};
  for (const [src, k, w] of jobs) { let img = sharp(src); if (src.endsWith('.png')) img = img.extract({ left: 0, top: 92, width: 1280, height: 536 });
    const b = await img.resize({ width: w }).webp({ quality: 72, alphaQuality: 80 }).toBuffer();
    out[k] = 'data:image/webp;base64,' + b.toString('base64'); console.log(k, b.length); }
  fs.writeFileSync(S + '/cineprop/assets.json', JSON.stringify(out)); })();
