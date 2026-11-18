// 立繪工房的顯示卡記憶體監看與重開 ComfyUI（docs/portrait-studio-design.md 第 4 期；伺服器與 scripts/studio.js 共用）
// 長時間產圖時顯示卡記憶體會越吃越多，滿了會溢到共用記憶體、慢好幾倍（docs/portrait-qa-workflow.md 第二節）
'use strict';
const fs = require('fs');
const path = require('path');
const { execFile, spawnSync } = require('child_process');

let SMI = null;
// nvidia-smi 的位置：PATH 上的，Windows 再找 DriverStore 裡的
function smiPath() {
  if (SMI !== null) return SMI;
  SMI = '';
  const cands = ['nvidia-smi'];
  if (process.platform === 'win32') {
    cands.unshift('C:\\Windows\\System32\\nvidia-smi.exe');
    const ds = 'C:\\Windows\\System32\\DriverStore\\FileRepository';
    try {
      for (const d of fs.readdirSync(ds))
        if (/^nv_dispi?g?\.inf_/i.test(d) || /^nv.*\.inf_/i.test(d)) {
          const f = path.join(ds, d, 'nvidia-smi.exe');
          if (fs.existsSync(f)) cands.unshift(f);
        }
    } catch (e) {
      /* 沒有 DriverStore */
    }
  }
  for (const c of cands) {
    try {
      const r = spawnSync(c, ['-L'], { timeout: 5000, windowsHide: true });
      if (r.status === 0) {
        SMI = c;
        break;
      }
    } catch (e) {
      /* 下一個 */
    }
  }
  return SMI;
}
// 回傳 { used, total }（MiB），沒有 NVIDIA 顯示卡＝null
function vram() {
  const p = smiPath();
  if (!p) return Promise.resolve(null);
  return new Promise((res) =>
    execFile(
      p,
      ['--query-gpu=memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'],
      { timeout: 8000, windowsHide: true },
      (err, out) => {
        if (err) return res(null);
        const [used, total, util] = String(out).split('\n')[0].split(',').map(Number);
        res(total ? { used, total, util } : null);
      },
    ),
  );
}
// 重開 ComfyUI（scripts/comfy-restart.ps1：只關 ComfyUI 的程序、隱藏視窗重開、等它好）。只在 Windows
// 回傳 true＝重開好了
function restartComfy(base) {
  if (process.platform !== 'win32') return false;
  const ps = path.join(base, 'scripts', 'comfy-restart.ps1');
  if (!fs.existsSync(ps)) return false;
  // PowerShell 7（pwsh）優先：內建的 5.1 把沒有 BOM 的 UTF-8 腳本當成 ANSI，中文註解會讓它解析失敗
  for (const sh of ['pwsh', 'powershell']) {
    const r = spawnSync(sh, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps], {
      cwd: base,
      timeout: 8 * 60 * 1000,
      // 不接輸出：重開的 ComfyUI 會繼承管線，接著的話要等 ComfyUI 結束才會回來（2026-11-18 卡住過）
      stdio: 'ignore',
      windowsHide: true,
    });
    if (r.error) continue;
    return r.status === 0;
  }
  return false;
}

module.exports = { vram, restartComfy };
