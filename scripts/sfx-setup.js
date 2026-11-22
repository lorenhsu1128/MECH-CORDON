// 自製音效（docs/sfx-gen-design.md）的產生環境：固定版本裝到 tools/sfxgen/（gitignore）
// npm run sfx:setup -- [--skip-models] [--check]
// - 每台電腦 pull 之後跑一次；REF／套件改了再跑一次就同步（已是同一版本的步驟略過）
// - 需要 git 與 NVIDIA 顯示卡；Python 3.12、PyTorch 2.9（cu128）由 uv 裝（沒有 uv 時借 bgm-setup 的下載）
// - 一個環境兩個模型：MOSS-SoundEffect v2.0（Apache-2.0，OpenMOSS/MOSS-TTS 的 moss_soundeffect_v2）、
//   Stable Audio Open 1.0（Stability AI 社群授權；Hugging Face 上要先登入並同意條款：hf auth login）
// - 模型下載到 tools/sfxgen/hf/（HF_HOME），不放使用者的快取
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { uvPath } = require('./bgm-setup.js');

const REPO = 'https://github.com/OpenMOSS/MOSS-TTS.git';
const REF = '934d6826b084c46a0d033402174d5f8ac4ed2519';
// MOSS 的套件之外，Stable Audio Open（diffusers 的 StableAudioPipeline：T5、torchsde）與評分（CLAP 在 transformers 裡）
const EXTRA = [
  'torchsde',
  'sentencepiece',
  'protobuf',
  'huggingface_hub',
  'librosa',
  'pyloudnorm',
  'imageio-ffmpeg',
];
const MODELS = [
  'OpenMOSS-Team/MOSS-SoundEffect-v2.0',
  'stabilityai/stable-audio-open-1.0',
  'laion/larger_clap_general',
];

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'tools', 'sfxgen');
const SRC = path.join(DIR, 'moss-src');
const VENV = path.join(DIR, 'venv');
const WIN = process.platform === 'win32';
const PY = path.join(VENV, WIN ? 'Scripts/python.exe' : 'bin/python');
const STAMP = path.join(DIR, 'setup-stamp.json');
const flag = (k) => process.argv.includes('--' + k);
const ENV = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', HF_HOME: path.join(DIR, 'hf') };

function run(cmd, args, opts = {}) {
  console.log('> ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, env: ENV, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} 失敗（結束碼 ${r.status}）`);
}

async function main() {
  const stamp = fs.existsSync(STAMP) ? JSON.parse(fs.readFileSync(STAMP, 'utf8')) : {};
  const save = () => fs.writeFileSync(STAMP, JSON.stringify(stamp, null, 2));
  if (flag('check')) {
    console.log(
      '環境：',
      stamp.ref === REF && stamp.extra === EXTRA.join(' ') ? '已安裝' : '未安裝或版本不同',
    );
    for (const m of MODELS) console.log(m, (stamp.models || {})[m] ? '已下載' : '未下載');
    return;
  }
  fs.mkdirSync(DIR, { recursive: true });
  // 1. MOSS 的原始碼
  if (!fs.existsSync(path.join(SRC, '.git'))) run('git', ['clone', '--filter=blob:none', REPO, SRC]);
  const cur = spawnSync('git', ['-C', SRC, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  if (cur !== REF) {
    run('git', ['-C', SRC, 'fetch', 'origin']);
    run('git', ['-C', SRC, '-c', 'advice.detachedHead=false', 'checkout', '-f', REF]);
  }
  // 2. Python 環境
  const uv = await uvPath();
  if (stamp.ref !== REF || stamp.extra !== EXTRA.join(' ') || !fs.existsSync(PY)) {
    if (!fs.existsSync(PY)) run(uv, ['venv', VENV, '--python', '3.12']);
    const idx = [
      '--extra-index-url',
      'https://download.pytorch.org/whl/cu128',
      '--index-strategy',
      'unsafe-best-match',
    ];
    run(uv, [
      'pip',
      'install',
      '--python',
      PY,
      '-e',
      path.join(SRC, 'moss_soundeffect_v2') + '[torch-cu128]',
      ...EXTRA,
      ...idx,
    ]);
    stamp.ref = REF;
    stamp.extra = EXTRA.join(' ');
    save();
  }
  // 3. 模型（Stable Audio Open 沒登入或沒同意條款時跳過、提示）
  if (!flag('skip-models')) {
    stamp.models = stamp.models || {};
    for (const m of MODELS) {
      if (stamp.models[m]) continue;
      // CLAP 下載到 tools/sfxgen/clap/（Windows 沒有開發人員模式時 HF 快取的符號連結會失敗）
      const local = m.includes('clap') ? `, local_dir=${JSON.stringify(path.join(DIR, 'clap'))}` : '';
      const code = `from huggingface_hub import snapshot_download as s; s(${JSON.stringify(m)}, allow_patterns=None if 'stable-audio' not in ${JSON.stringify(m)} else ['model_index.json','*/*']${local})`;
      const r = spawnSync(PY, ['-c', code], { stdio: 'inherit', env: ENV });
      if (r.status === 0) {
        stamp.models[m] = true;
        save();
      } else
        console.warn(
          `\n下載 ${m} 失敗。Stable Audio Open 要先在 https://huggingface.co/${m} 同意條款並登入：\n  HF_HOME=tools/sfxgen/hf tools/sfxgen/venv/Scripts/hf.exe auth login --token <token>\n`,
        );
    }
  }
  console.log('完成。試做：' + PY + ' scripts/sfx-gen.py --trial');
}

module.exports = { DIR, PY, ENV };
if (require.main === module)
  main().catch((e) => {
    console.error('安裝失敗：', e.message);
    process.exit(1);
  });
