// 照 GLB 重建的程式模型（實驗）：一次轉換一組槽位並比對，列出每個槽位的平均與最差的視角。
//   node scripts/proc-batch.js [--only=head/h_std,arms/a_std/l_upper] [--nogen]（只比對）
// 來源是內建的玩家預設機甲 src/assets/player-mech/<槽位>.glb，輸出 src/render/proc/<槽位的 / 換成 _>.js
// （匯出名稱 p_<…>Prims；core/c_std 沿用 c_std.js 的 cStdPrims）。需要先 npm run build（比對用 dist 的 three.js）
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SLOTS = [
  'core/c_std',
  'head/h_std',
  'arms/a_std/l_upper',
  'arms/a_std/l_fore',
  'arms/a_std/l_hand',
  'arms/a_std/r_upper',
  'arms/a_std/r_fore',
  'arms/a_std/r_hand',
  'legs/l_bp/pelvis',
  'legs/l_bp/l_thigh',
  'legs/l_bp/l_shin',
  'legs/l_bp/l_foot',
  'legs/l_bp/r_thigh',
  'legs/l_bp/r_shin',
  'legs/l_bp/r_foot',
];
const A = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) A[m[1]] = m[2] === undefined ? true : m[2];
}
const names = (slot) =>
  slot === 'core/c_std'
    ? { file: 'c_std', exp: 'cStd' }
    : { file: slot.replace(/\//g, '_'), exp: 'p_' + slot.replace(/\//g, '_') };
const run = (args) => execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });

const only = A.only ? String(A.only).split(',') : SLOTS;
let sum = [0, 0];
for (const slot of only) {
  const { file, exp } = names(slot);
  const glb = `src/assets/player-mech/${slot}.glb`;
  let tris = '';
  if (!A.nogen) {
    const g = run(['scripts/glb-to-proc.mjs', glb, `src/render/proc/${file}.js`, exp]);
    const m = /原本 (\d+) 個.*方塊 (\d+)、柱體 (\d+)、凸塊 (\d+)、平面片 (\d+).*＝(\d+) 個三角形/.exec(g);
    if (m) {
      tris = `${m[1]}→${m[6]}（塊體 ${+m[2] + +m[3] + +m[4]}、原表面 ${m[5]} 片）`;
      sum[0] += +m[1];
      sum[1] += +m[6];
    }
  }
  const c = run(['scripts/proc-compare.js', `--glb=${glb}`, `--mod=${file}`, `--exp=${exp}Prims`]);
  const rows = c
    .split('\n')
    .filter((l) => /輪廓/.test(l))
    .map((l) => {
      const n = [...l.matchAll(/([\d.]+)%/g)].map((x) => +x[1]);
      return { v: l.trim().split(/\s+/)[0], a: n[0], b: n[1], sil: n[2], col: n[3] };
    });
  const avg = rows.pop();
  const worst = (k) => rows.slice().sort((x, y) => x[k] - y[k])[0];
  const wl = Math.min(worst('a').a, worst('b').b);
  console.log(
    `${slot.padEnd(19)} ${tris.padEnd(34)} 平均：線 ${avg.a}／${avg.b}、輪廓 ${avg.sil}、顏色 ${avg.col}　` +
      `最差：線 ${wl}、輪廓 ${worst('sil').sil}（${worst('sil').v}）、顏色 ${worst('col').col}（${worst('col').v}）`,
  );
}
if (sum[0]) console.log(`三角形合計：GLB ${sum[0]} → 程式模型 ${sum[1]}`);
