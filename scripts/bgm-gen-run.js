// AI 配樂（docs/audio-design.md 的「AI 配樂」）的執行入口，用 npm run bgm:setup 裝好的環境：
//   npm run bgm:all -- [--from=1] [--to=8] [--n=2]   每章：產生交戰版候選 → 評分挑選 → 平時版 → 打包（中斷後重跑接著做）
//   npm run bgm:gen -- --ch=<章> [--stage=fight|calm] [--songs=類型,…] [--n=2]   只產生（ACE-Step 的環境）
//   npm run bgm:score -- --ch=<章> [--files=…]   只評分與挑選（評分環境 tools/acestep/score-venv）
//   npm run bgm:pack -- [--ch=<章>]   只打包成 src/assets/bgm-ai/c<章>/（之後 npm run build）
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { uvPath, SRC, DIR } = require('./bgm-setup.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = Object.fromEntries(
  args
    .filter((a) => a.startsWith('--'))
    .map((a) => (a.includes('=') ? a.slice(2).split('=') : [a.slice(2), '1'])),
);
const ENV = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' };
const SPY = path.join(DIR, 'score-venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');

function sh(cmd, a) {
  const r = spawnSync(cmd, a, { cwd: ROOT, stdio: 'inherit', env: ENV });
  if (r.status !== 0) {
    console.error(`失敗（結束碼 ${r.status}）`);
    process.exit(r.status || 1);
  }
}

(async () => {
  if (!fs.existsSync(path.join(SRC, '.venv'))) {
    console.error('還沒安裝 ACE-Step：先跑 npm run bgm:setup');
    process.exit(1);
  }
  const uv = await uvPath();
  const gen = (a) =>
    sh(uv, [
      'run',
      '--project',
      SRC,
      '--with',
      'pykakasi',
      'python',
      path.join(ROOT, 'scripts', 'bgm-gen.py'),
      ...a,
    ]);
  const score = (a) => sh(SPY, [path.join(ROOT, 'scripts', 'bgm-score.py'), ...a]);
  const pack = (a) => sh(SPY, [path.join(ROOT, 'scripts', 'bgm-ai-pack.py'), ...a]);
  const rest = args.filter((a) => !['--score', '--pack', '--all'].includes(a));
  if (args.includes('--score')) return score(rest);
  if (args.includes('--pack')) return pack(rest);
  if (args.includes('--all')) {
    const from = +(opt.from || 1),
      to = +(opt.to || 8),
      n = opt.n || '2';
    for (let ch = from; ch <= to; ch++) {
      console.log(`\n===== 第 ${ch} 章：交戰版候選 =====`);
      gen([`--ch=${ch}`, '--stage=fight', `--n=${n}`]);
      console.log(`\n===== 第 ${ch} 章：評分與挑選 =====`);
      score([`--ch=${ch}`]);
      console.log(`\n===== 第 ${ch} 章：平時版 =====`);
      gen([`--ch=${ch}`, '--stage=calm']);
      console.log(`\n===== 第 ${ch} 章：打包 =====`);
      pack([`--ch=${ch}`]);
      console.log(`第 ${ch} 章完成`);
    }
    return;
  }
  gen(rest);
})();
