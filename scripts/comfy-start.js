// 啟動角色產生器用的 ComfyUI（tools/comfyui/runtime/，先跑 npm run comfy:setup）
// npm run comfy -- [--port=8188] [--lan]（--lan＝聽 0.0.0.0，區網的其他電腦也能直接連；平常由 mech-cordon-server 轉送）
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RT = path.join(__dirname, '..', 'tools', 'comfyui', 'runtime');
const COMFY = path.join(RT, 'ComfyUI');
const PY = path.join(RT, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const arg = (k) => {
  const a = process.argv.find((s) => s.startsWith('--' + k + '='));
  return a ? a.slice(k.length + 3) : null;
};

if (!fs.existsSync(PY) || !fs.existsSync(path.join(COMFY, 'main.py'))) {
  console.error('還沒安裝 ComfyUI：請先執行 npm run comfy:setup');
  process.exit(1);
}
const port = arg('port') || process.env.COMFY_PORT || '8188';
// 專案自己的節點（tools/comfyui/nodes/，進 git）以 extra_model_paths 的 custom_nodes 載入
const extra = path.join(RT, 'extra_model_paths.yaml');
const nodes = path.join(__dirname, '..', 'tools', 'comfyui', 'nodes').replace(/\\/g, '/');
fs.writeFileSync(extra, `mech_cordon:\n  custom_nodes: ${nodes}\n`);
const args = [
  'main.py',
  '--extra-model-paths-config',
  extra,
  '--listen',
  process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1',
  '--port',
  port,
  '--disable-auto-launch',
  '--preview-method',
  'none',
];
console.log(`ComfyUI：http://127.0.0.1:${port}/`);
const p = spawn(PY, args, { cwd: COMFY, stdio: 'inherit' });
p.on('exit', (c) => process.exit(c ?? 0));
