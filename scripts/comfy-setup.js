// 角色產生器用的 ComfyUI 安裝：照 tools/comfyui/manifest.json 安裝到 tools/comfyui/runtime/（gitignore）
// npm run comfy:setup -- [--skip-models] [--models-only] [--only=<模型 id,…>] [--check]
// - 每台電腦 pull 之後跑一次；manifest 改了再跑一次就同步（已完成且版本相同的步驟略過）
// - 需要 git 與 NVIDIA 顯示卡；Python 由 uv 自動下載（PATH 沒有 uv 時下載到 runtime/bin/）
// - 模型以 sha256 驗證，中斷後重跑會從斷點續傳；civitai 需要登入的檔案可以設環境變數 CIVITAI_TOKEN
// - --check：只檢查狀態，不安裝
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'tools', 'comfyui');
const RT = path.join(DIR, 'runtime');
const COMFY = path.join(RT, 'ComfyUI');
const VENV = path.join(RT, '.venv');
const STAMP = path.join(RT, 'setup-stamp.json');
const WIN = process.platform === 'win32';
const PY = path.join(VENV, WIN ? 'Scripts/python.exe' : 'bin/python');

const M = JSON.parse(fs.readFileSync(path.join(DIR, 'manifest.json'), 'utf8'));
const flag = (k) => process.argv.includes('--' + k);
const arg = (k) => {
  const a = process.argv.find((s) => s.startsWith('--' + k + '='));
  return a ? a.slice(k.length + 3) : null;
};
const stamp = fs.existsSync(STAMP) ? JSON.parse(fs.readFileSync(STAMP, 'utf8')) : {};
const saveStamp = () => fs.writeFileSync(STAMP, JSON.stringify(stamp, null, 2));
const key = (o) => crypto.createHash('sha1').update(JSON.stringify(o)).digest('hex').slice(0, 12);

function run(cmd, args, opts = {}) {
  console.log('> ' + cmd + ' ' + args.join(' '));
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} 失敗（結束碼 ${r.status}）`);
}
function has(cmd) {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  return r.status === 0;
}

// ---- uv ----
async function ensureUv() {
  if (has('uv')) return 'uv';
  const local = path.join(RT, 'bin', WIN ? 'uv.exe' : 'uv');
  if (fs.existsSync(local)) return local;
  const asset = WIN
    ? 'uv-x86_64-pc-windows-msvc.zip'
    : process.platform === 'darwin'
      ? 'uv-aarch64-apple-darwin.tar.gz'
      : 'uv-x86_64-unknown-linux-gnu.tar.gz';
  const tmp = path.join(RT, asset);
  fs.mkdirSync(path.join(RT, 'bin'), { recursive: true });
  await download(`https://github.com/astral-sh/uv/releases/latest/download/${asset}`, tmp, null, 'uv');
  // Windows 一律用系統的 tar（bsdtar，認得 zip）：從 Git Bash 執行時 PATH 上先找到的是 GNU tar，
  // 它把「C:」當成遠端主機、也解不開 zip
  const tar = WIN ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  run(tar, ['-xf', tmp, '-C', path.join(RT, 'bin')]);
  fs.rmSync(tmp);
  // linux／mac 的壓縮檔裡多一層資料夾
  if (!fs.existsSync(local)) {
    for (const d of fs.readdirSync(path.join(RT, 'bin'))) {
      const p = path.join(RT, 'bin', d, 'uv');
      if (fs.existsSync(p)) fs.renameSync(p, local);
    }
  }
  return local;
}

// ---- git ----
function gitAt(dir, repo, ref) {
  if (!fs.existsSync(path.join(dir, '.git'))) run('git', ['clone', '--filter=blob:none', repo, dir]);
  const cur = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).stdout.trim();
  const want = spawnSync('git', ['-C', dir, 'rev-parse', ref + '^{commit}'], {
    encoding: 'utf8',
  }).stdout.trim();
  if (!want) run('git', ['-C', dir, 'fetch', '--tags', 'origin']);
  if (cur !== want || !want)
    run('git', ['-C', dir, '-c', 'advice.detachedHead=false', 'checkout', '-f', ref]);
}

// ---- 下載（續傳、轉址、sha256） ----
function sha256File(f) {
  return new Promise((res, rej) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(f)
      .on('data', (d) => h.update(d))
      .on('end', () => res(h.digest('hex')))
      .on('error', rej);
  });
}
function get(url, headers, hops = 0) {
  return new Promise((res, rej) => {
    if (hops > 8) return rej(new Error('轉址太多次'));
    const u = new URL(url);
    const h = { 'User-Agent': 'mech-cordon-setup', ...headers };
    if (u.hostname.endsWith('civitai.com') && process.env.CIVITAI_TOKEN)
      h.Authorization = 'Bearer ' + process.env.CIVITAI_TOKEN;
    https
      .get(u, { headers: h }, (r) => {
        if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) {
          r.resume();
          return res(get(new URL(r.headers.location, url).href, headers, hops + 1));
        }
        res(r);
      })
      .on('error', rej);
  });
}
async function download(url, dest, sha, label) {
  const part = dest + '.part';
  let have = fs.existsSync(part) ? fs.statSync(part).size : 0;
  const r = await get(url, have ? { Range: `bytes=${have}-` } : {});
  if (r.statusCode === 200 && have) have = 0; // 伺服器不支援續傳
  if (r.statusCode === 416) {
    r.resume();
  } else if (r.statusCode !== 200 && r.statusCode !== 206) {
    r.resume();
    throw new Error(`${label}：HTTP ${r.statusCode}（civitai 要登入的檔案請設 CIVITAI_TOKEN）`);
  } else {
    const total = have + Number(r.headers['content-length'] || 0);
    const out = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
    let got = have;
    let last = 0;
    await new Promise((res, rej) => {
      r.on('data', (d) => {
        got += d.length;
        const now = Date.now();
        if (now - last > 2000) {
          last = now;
          const pct = total ? ((got / total) * 100).toFixed(1) + '%' : '';
          console.log(`  ${label} ${(got / 1e9).toFixed(2)} GB ${pct}`);
        }
      });
      r.pipe(out);
      out.on('finish', res);
      r.on('error', rej);
      out.on('error', rej);
    });
  }
  if (sha) {
    const h = await sha256File(part);
    if (h !== sha.toLowerCase()) {
      fs.rmSync(part);
      throw new Error(`${label}：sha256 不符（${h}），已刪除，請重跑`);
    }
  }
  fs.renameSync(part, dest);
}

async function models(only) {
  const list = M.models.filter((m) => !only || only.includes(m.id));
  for (const m of list) {
    const dir = path.join(COMFY, 'models', m.dir);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, m.file);
    if (fs.existsSync(dest)) {
      if (stamp.models?.[m.id] === m.sha256) continue;
      if ((await sha256File(dest)) === m.sha256) {
        (stamp.models ||= {})[m.id] = m.sha256;
        saveStamp();
        continue;
      }
      console.log(`${m.file}：內容和清單不同，重新下載`);
      fs.rmSync(dest);
    }
    console.log(`下載 ${m.id}：${m.file}`);
    try {
      await download(m.url, dest, m.sha256, m.id);
    } catch (e) {
      // opt：選用的模型（例如 civitai 要登入才能下載的）失敗時只警告
      if (!m.opt) throw e;
      console.warn(`  略過選用的 ${m.id}：${e.message}`);
      continue;
    }
    (stamp.models ||= {})[m.id] = m.sha256;
    saveStamp();
  }
}

function check() {
  const rows = [];
  rows.push(['ComfyUI', fs.existsSync(path.join(COMFY, 'main.py')) ? M.comfyui.ref : '未安裝']);
  rows.push([
    'Python 環境',
    fs.existsSync(PY) ? (stamp.py === key([M.python, M.torch]) ? '完成' : '要更新') : '未安裝',
  ]);
  for (const n of M.nodes)
    rows.push([n.name, fs.existsSync(path.join(COMFY, 'custom_nodes', n.name)) ? '有' : '未安裝']);
  for (const m of M.models) {
    const f = path.join(COMFY, 'models', m.dir, m.file);
    rows.push([m.id, !fs.existsSync(f) ? '未下載' : stamp.models?.[m.id] === m.sha256 ? '完成' : '未驗證']);
  }
  for (const [a, b] of rows) console.log(a.padEnd(16), b);
  return rows.every(([, b]) => /完成|有|^v/.test(b));
}

async function main() {
  fs.mkdirSync(RT, { recursive: true });
  if (flag('check')) return void process.exit(check() ? 0 : 1);
  const only = arg('only') ? arg('only').split(',') : null;
  if (!flag('models-only')) {
    if (!has('git')) throw new Error('需要 git');
    gitAt(COMFY, M.comfyui.repo, M.comfyui.ref);
    for (const n of M.nodes) gitAt(path.join(COMFY, 'custom_nodes', n.name), n.repo, n.ref);
    const uv = await ensureUv();
    // PYTHONUTF8：中文 Windows 預設 cp950，有些套件的 setup.py 讀 UTF-8 檔會失敗
    const env = { ...process.env, VIRTUAL_ENV: VENV, UV_LINK_MODE: 'copy', PYTHONUTF8: '1' };
    if (!fs.existsSync(PY)) run(uv, ['venv', VENV, '--python', M.python]);
    const pyKey = key([M.python, M.torch]);
    if (stamp.py !== pyKey) {
      run(uv, ['pip', 'install', '--python', PY, ...M.torch, '--index-url', M.torchIndex], { env });
      stamp.py = pyKey;
      saveStamp();
    }
    const reqs = [path.join(COMFY, 'requirements.txt')];
    for (const n of M.nodes) {
      const f = path.join(COMFY, 'custom_nodes', n.name, 'requirements.txt');
      if (!fs.existsSync(f)) continue;
      if (!n.skipReqs) {
        reqs.push(f);
        continue;
      }
      // 略過用不到又難裝的相依套件（skipReqs：行首符合的就拿掉）
      const keep = fs
        .readFileSync(f, 'utf8')
        .split(/\r?\n/)
        .filter((l) => !n.skipReqs.some((s) => l.trim().startsWith(s)));
      const g = path.join(RT, `req-${n.name}.txt`);
      fs.writeFileSync(g, keep.join('\n') + '\n');
      reqs.push(g);
    }
    const reqKey = key([M.comfyui, M.nodes, M.torch]);
    if (stamp.req !== reqKey) {
      // 固定 torch 版本，避免外掛的需求把它換掉
      const pin = path.join(RT, 'torch-pin.txt');
      fs.writeFileSync(pin, M.torch.join('\n') + '\n');
      const a = ['pip', 'install', '--python', PY, '-c', pin, '--extra-index-url', M.torchIndex];
      for (const f of reqs) a.push('-r', f);
      run(uv, a, { env });
      stamp.req = reqKey;
      saveStamp();
    }
  }
  if (!flag('skip-models')) await models(only);
  console.log('\n安裝狀態：');
  check();
  console.log('\n啟動：npm run comfy');
}

main().catch((e) => {
  console.error('安裝失敗：' + e.message);
  process.exit(1);
});
