// npm run bgm:gen -- [主題,…] [--n=2] [--only=t2m|cover] [--no-pack]
// 用 ACE-Step 的環境（npm run bgm:setup 裝的）執行 scripts/bgm-gen.py，再以 scripts/bgm-ai-pack.py
// 把結果放進 src/assets/bgm-audition/（標題的「配樂試聽」；改完要 npm run build）
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { uvPath, SRC } = require('./bgm-setup.js');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);

(async () => {
  if (!fs.existsSync(path.join(SRC, '.venv'))) {
    console.error('還沒安裝 ACE-Step：先跑 npm run bgm:setup');
    process.exit(1);
  }
  const uv = await uvPath();
  const py = (script, extra, more = []) => {
    const r = spawnSync(
      uv,
      ['run', '--project', SRC, ...more, 'python', path.join(ROOT, 'scripts', script), ...extra],
      {
        cwd: ROOT,
        stdio: 'inherit',
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      },
    );
    if (r.status !== 0) process.exit(r.status || 1);
  };
  py(
    'bgm-gen.py',
    args.filter((a) => a !== '--no-pack'),
  );
  if (!args.includes('--no-pack')) py('bgm-ai-pack.py', [], ['--with', 'imageio-ffmpeg']);
})();
