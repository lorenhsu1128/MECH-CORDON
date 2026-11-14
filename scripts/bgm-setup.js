// AI 配樂（scripts/bgm-gen.py）用的 ACE-Step 1.5 安裝：固定版本裝到 tools/acestep/（gitignore）
// npm run bgm:setup -- [--skip-models] [--check]
// - 每台電腦 pull 之後跑一次；這裡的 REF 改了再跑一次就同步（已是同一版本的步驟略過）
// - 需要 git 與 NVIDIA 顯示卡；Python 3.12 與 PyTorch（cu128）由 uv 照 ACE-Step 的 uv.lock 安裝
//   （PATH 沒有 uv 時下載到 tools/acestep/bin/）
// - 模型（主模型＋BGM_DIT＋BGM_LM，約 10 GB）從 Hugging Face 下載到 tools/acestep/checkpoints/
// - 之後 npm run bgm:gen -- [主題,…] [--n=2] 產生，python scripts/bgm-ai-pack.py 放進配樂試聽
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const REPO = 'https://github.com/ace-step/ACE-Step-1.5.git';
const REF = 'ca1e85fe9430179831e6bc6be790c332190a3866';
const SCORE_PKGS = [
  'demucs',
  'pykakasi',
  'librosa',
  'audiobox_aesthetics',
  'transformers>=4.51,<4.58',
  'soundfile',
  'accelerate',
  'imageio-ffmpeg',
];

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'tools', 'acestep');
const SRC = path.join(DIR, 'src');
const STAMP = path.join(DIR, 'setup-stamp.json');
const WIN = process.platform === 'win32';
const flag = (k) => process.argv.includes('--' + k);

function run(cmd, args, opts = {}) {
  console.log('> ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
    ...opts,
  });
  if (r.status !== 0) throw new Error(`${cmd} 失敗（結束碼 ${r.status}）`);
}
const has = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;

function get(url) {
  return new Promise((res, rej) =>
    https
      .get(url, { headers: { 'User-Agent': 'mech-cordon-setup' } }, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          r.resume();
          res(get(new URL(r.headers.location, url).href));
        } else res(r);
      })
      .on('error', rej),
  );
}

async function uvPath() {
  if (has('uv')) return 'uv';
  for (const p of [
    path.join(DIR, 'bin', WIN ? 'uv.exe' : 'uv'),
    path.join(ROOT, 'tools', 'comfyui', 'runtime', 'bin', WIN ? 'uv.exe' : 'uv'),
  ])
    if (fs.existsSync(p)) return p;
  const asset = WIN
    ? 'uv-x86_64-pc-windows-msvc.zip'
    : process.platform === 'darwin'
      ? 'uv-aarch64-apple-darwin.tar.gz'
      : 'uv-x86_64-unknown-linux-gnu.tar.gz';
  const bin = path.join(DIR, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const tmp = path.join(bin, asset);
  console.log('下載 uv…');
  const r = await get(`https://github.com/astral-sh/uv/releases/latest/download/${asset}`);
  if (r.statusCode !== 200) throw new Error('下載 uv 失敗：HTTP ' + r.statusCode);
  await new Promise((ok, bad) => r.pipe(fs.createWriteStream(tmp)).on('finish', ok).on('error', bad));
  // Windows 用系統的 tar（bsdtar 認得 zip；Git Bash 的 GNU tar 不行）
  const tar = WIN ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  run(tar, ['-xf', tmp, '-C', bin]);
  fs.rmSync(tmp);
  const local = path.join(bin, WIN ? 'uv.exe' : 'uv');
  if (!fs.existsSync(local))
    for (const d of fs.readdirSync(bin)) {
      const p = path.join(bin, d, 'uv');
      if (fs.existsSync(p)) fs.renameSync(p, local);
    }
  return local;
}

async function main() {
  const stamp = fs.existsSync(STAMP) ? JSON.parse(fs.readFileSync(STAMP, 'utf8')) : {};
  if (flag('check')) {
    console.log('ACE-Step：', stamp.ref === REF ? '已安裝 ' + REF.slice(0, 8) : '未安裝或版本不同');
    console.log('模型：', stamp.models ? '已下載' : '未下載');
    return;
  }
  if (!has('git')) throw new Error('需要 git');
  fs.mkdirSync(DIR, { recursive: true });
  // 1. 原始碼
  if (!fs.existsSync(path.join(SRC, '.git'))) run('git', ['clone', '--filter=blob:none', REPO, SRC]);
  const cur = spawnSync('git', ['-C', SRC, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  if (cur !== REF) {
    run('git', ['-C', SRC, 'fetch', 'origin']);
    run('git', ['-C', SRC, '-c', 'advice.detachedHead=false', 'checkout', '-f', REF]);
  }
  // 2. Python 環境（照 uv.lock）
  const uv = await uvPath();
  if (stamp.ref !== REF || !fs.existsSync(path.join(SRC, '.venv'))) {
    run(uv, ['sync', '--frozen'], { cwd: SRC });
    stamp.ref = REF;
    stamp.models = false;
    fs.writeFileSync(STAMP, JSON.stringify(stamp, null, 2));
  }
  // 3. 模型
  if (!flag('skip-models') && !stamp.models) {
    run(uv, ['run', '--project', SRC, 'python', path.join(ROOT, 'scripts', 'bgm-gen.py'), '--prep'], {
      cwd: ROOT,
    });
    stamp.models = true;
    fs.writeFileSync(STAMP, JSON.stringify(stamp, null, 2));
  }
  // 4. 評分環境（scripts/bgm-score.py：Demucs、Whisper、audiobox-aesthetics；PyTorch 固定成和 ACE-Step 相同的 CUDA 版，
  //    放在 ACE-Step 的環境外：uv run --with 會把 PyTorch 換成最新的 CPU 版）
  const SV = path.join(DIR, 'score-venv');
  const SPY = path.join(SV, WIN ? 'Scripts/python.exe' : 'bin/python');
  if (stamp.score !== SCORE_PKGS.join(' ')) {
    if (!fs.existsSync(SPY)) run(uv, ['venv', SV, '--python', '3.12']);
    const torch = ['torch==2.7.1+cu128', 'torchaudio==2.7.1+cu128'];
    const idx = [
      '--extra-index-url',
      'https://download.pytorch.org/whl/cu128',
      '--index-strategy',
      'unsafe-best-match',
    ];
    run(uv, ['pip', 'install', '--python', SPY, ...torch, ...SCORE_PKGS, ...idx]);
    stamp.score = SCORE_PKGS.join(' ');
    fs.writeFileSync(STAMP, JSON.stringify(stamp, null, 2));
  }
  console.log('完成。產生配樂：npm run bgm:gen -- [主題,…] [--n=2]');
}

module.exports = { uvPath, SRC, DIR };
if (require.main === module)
  main().catch((e) => {
    console.error('安裝失敗：', e.message);
    process.exit(1);
  });
