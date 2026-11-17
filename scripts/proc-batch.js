// 照 GLB 重建的程式模型（實驗）：一次轉換一組槽位並比對，列出每個槽位的平均與最差的視角。
//   node scripts/proc-batch.js [--set=std|lt|hv|rj|qd|aeg|bst|tk（可以用逗號列幾組）] [--only=head/h_std,arms/a_std/l_upper] [--nogen]（只比對）
// 來源是內建的玩家預設機甲 src/assets/player-mech/<槽位>.glb，輸出 src/render/proc/<槽位的 / 換成 _>.js
// （匯出名稱 p_<…>Prims；core/c_std 沿用 c_std.js 的 cStdPrims）。需要先 npm run build（比對用 dist 的 three.js）
const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
// 一組＝[頭, 核心, 手臂, 腳, 腳的區塊（預設 大腿／小腿／腳掌）] 的零件 id
const SETS = {
  std: ['h_std', 'c_std', 'a_std', 'l_bp'], // GRANITE（基礎機型）
  lt: ['h_lt', 'c_lt', 'a_lt', 'l_bp2'], // SEQ 輕量機型
  hv: ['h_hv', 'c_hv', 'a_hv', 'l_hv'], // HAWK 重裝機型
  rj: ['h_scan', 'c_nat', 'a_ml', 'l_rj', ['thigh', 'shin', 'meta', 'foot']], // 逆足機型（腳多一節蹠骨）
};
const slotsOf = ([h, c, a, l, leg = ['thigh', 'shin', 'foot']]) => [
  'core/' + c,
  'head/' + h,
  ...['l', 'r'].flatMap((s) => ['upper', 'fore', 'hand'].map((k) => `arms/${a}/${s}_${k}`)),
  `legs/${l}/pelvis`,
  ...['l', 'r'].flatMap((s) => leg.map((k) => `legs/${l}/${s}_${k}`)),
];
// 其他的組：直接列槽位
const LISTS = {
  qd: [
    'body',
    ...['fl', 'fr', 'bl', 'br'].flatMap((c) => ['thigh', 'shin', 'foot'].map((k) => c + '_' + k)),
  ].map((x) => 'legs/l_qd/' + x), // 四足腳 LG-SPIDER
  aeg: ['core/c_aeg'], // 核心 BD-AEGIS
  bst: ['booster/b_std', 'booster/b_hi', 'booster/b_eff'], // 背包推進器（顏色在貼圖上：--tex）
  tk: ['legs/l_tk/body'], // 戰車腳 LG-TANK（輪子與履帶片另外輸出成會動的零件：--tank）
};
// 產生器的額外參數
const genArgs = (slot) =>
  slot.startsWith('booster/') ? ['--tex=4'] : slot === 'legs/l_tk/body' ? ['--tank'] : [];
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

const only = A.only
  ? String(A.only).split(',')
  : String(A.set || 'std')
      .split(',')
      .flatMap((k) => LISTS[k] || slotsOf(SETS[k]));
let sum = [0, 0];
for (const slot of only) {
  const { file, exp } = names(slot);
  const glb = `src/assets/player-mech/${slot}.glb`;
  let tris = '';
  if (!A.nogen) {
    const g = run(['scripts/glb-to-proc.mjs', glb, `src/render/proc/${file}.js`, exp, ...genArgs(slot)]);
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
