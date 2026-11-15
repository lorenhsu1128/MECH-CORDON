// 過場人物的匯入：Quaternius「Ultimate Modular Men（2022-02）」與「Ultimate Modular Women（2022-04）」
// （CC0，壓縮檔附的 License.txt；Google Drive 匿名下載常超過配額，從瀏覽器下載）的 Individual Characters/glTF
// → 用 Blender 轉成只有網格＋骨架的 GLB：src/assets/people/m_<名稱>.glb（男）、w_<名稱>.glb（女）。
// 和現有的人物（biz、suitw…，Poly Pizza 上的同一系列）是同一套 62 根骨頭的骨架，但這一版的單位是公尺：
//   原本的 24 個動作男女各一份 → src/assets/people/anims/m_orig.glb、w_orig.glb（同骨架的人物共用）
//   追加的動作（Universal Animation Library）由 scripts/people-retarget.js 轉（ual_m2.glb、ual_w2.glb）
//   node scripts/people-import.js --men=<…/Ultimate Modular Men- Feb 2022> --women=<…/Ultimate Modular Women - April 2022>
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.slice(2).split('=');
      return [k, v === undefined ? true : v];
    }),
);
const ROOT = path.join(__dirname, '..');
const PEOPLE = path.join(ROOT, 'src', 'assets', 'people');
if (!args.men || !args.women) {
  console.log('用法：node scripts/people-import.js --men=<男性包的資料夾> --women=<女性包的資料夾>');
  process.exit(1);
}
const blender =
  args.blender ||
  process.env.BLENDER ||
  ['5.3', '5.2', '5.1', '5.0', '4.5', '4.4']
    .map((v) => `C:/Program Files/Blender Foundation/Blender ${v}/blender.exe`)
    .find((p) => fs.existsSync(p));
if (!blender) throw new Error('找不到 Blender（--blender=<路徑> 或環境變數 BLENDER）');
const jobs = [],
  anims = [];
for (const [dir, pre] of [
  [args.men, 'm_'],
  [args.women, 'w_'],
]) {
  const g = path.join(dir, 'Individual Characters', 'glTF');
  for (const f of fs.readdirSync(g).sort()) {
    if (!f.endsWith('.gltf')) continue;
    jobs.push([path.join(g, f), path.join(PEOPLE, pre + f.slice(0, -5) + '.glb')]);
  }
  anims.push([path.join(g, 'Worker.gltf'), path.join(PEOPLE, 'anims', pre + 'orig.glb')]);
}
fs.mkdirSync(path.join(PEOPLE, 'anims'), { recursive: true });
const r = spawnSync(
  blender,
  [
    '-b',
    '--python',
    path.join(__dirname, 'blender', 'people_import.py'),
    '--',
    JSON.stringify({ jobs, anims }),
  ],
  { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
);
const log = (r.stdout || '') + (r.stderr || '');
if (r.status !== 0 || /Traceback/.test(log)) {
  console.log(log.slice(-3000));
  throw new Error('Blender 失敗');
}
const mb = (fs) => (fs.reduce((s, f) => s + require('fs').statSync(f).size, 0) / 1048576).toFixed(1);
console.log(
  `人物 ${jobs.length} 隻（${mb(jobs.map((j) => j[1]))} MB）、原本的動作 ${anims.length} 份（${mb(anims.map((a) => a[1]))} MB）`,
);
