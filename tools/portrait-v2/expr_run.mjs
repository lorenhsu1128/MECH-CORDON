// 新姿勢的表情、眨眼、嘴型：node expr_run.mjs <角色,…>
// 3/4 側（名稱以「3/4」開頭）＝全部表情＋每個表情的眨眼與嘴型；其他姿勢＝只有平常（主圖本身的臉）的眨眼與嘴型。
// NO_MOUTH 的姿勢不做嘴型（嘴巴本來就張開或被擋住）。已經選定的略過，可以重跑接續。
import fs from 'fs';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';
const ROOT = 'C:/Users/LOREN/Documents/_projects/MECH-CORDON';
const { exprList, EYE_FRAMES, MOUTH_FRAMES } = await import(pathToFileURL(ROOT + '/mech_cordon_charagen/js/expr.js').href);
const NO_MOUTH = {
  castron: ['p5', 'p10'],
  aetheric: ['p5'],
  veerwell: ['p5', 'p6', 'p8'],
  sancta: ['p8'],
  mira: ['p5', 'p7'],
  echo: [],
  echo_true: [],
  instructor: ['p5'],
  basalt: ['p5', 'p9'],
  wren: ['p5', 'p7'],
};
// ComfyUI 跑久了會累積記憶體：開始前重啟一次，之後每 40 批或它超過 24 GB 時重啟
const RESTART = 'C:/Users/LOREN/AppData/Local/Temp/claude/deb674574f2845b7/d2fd3704-2724-442d-8f7b-e0b21678e205/scratchpad/comfy_restart.sh';
const comfyMB = () => {
  try {
    return +execFileSync('powershell', ['-NoProfile', '-Command', "[int]((Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'python.exe' -and $_.CommandLine -like '*main.py*--port 8188*' } | Measure-Object WorkingSetSize -Maximum).Maximum/1MB)"]).toString().trim() || 0;
  } catch { return 0; }
};
const restart = (why) => {
  console.log('重啟 ComfyUI：' + why, new Date().toLocaleTimeString());
  // 輸出不能接管線：新開的 ComfyUI 會繼承它，execFileSync 會一直等到 ComfyUI 關掉
  const LOG = RESTART.replace('.sh', '.log');
  try {
    const fd = fs.openSync(LOG, 'w');
    execFileSync('bash', [RESTART], { stdio: ['ignore', fd, fd] });
    fs.closeSync(fd);
  } catch (e) { console.log('重啟失敗', e.message.slice(0, 120)); }
  try { console.log(fs.readFileSync(LOG, 'utf8').trim().split('\n').pop()); } catch {}
};
const alive = () => {
  try {
    execFileSync('curl', ['-s', '-f', '-m', '5', 'http://127.0.0.1:8188/system_stats'], { stdio: 'ignore' });
    return true;
  } catch { return false; }
};
// 用量偏高時先請 ComfyUI 卸下模型（下次用到再從磁碟載入），比整個重啟快
const freeModels = (mb) => {
  console.log(`卸下模型：ComfyUI ${mb} MB`, new Date().toLocaleTimeString());
  try {
    execFileSync('curl', ['-s', '-m', '30', '-X', 'POST', '-H', 'Content-Type: application/json', '-d', '{"unload_models":true,"free_memory":true}', 'http://127.0.0.1:8188/free'], { stdio: 'ignore' });
  } catch {}
};
let nb = 0;
let fails = 0;
restart('開始前');
const card = (id) => JSON.parse(fs.readFileSync(`${ROOT}/src/assets/characters/${id}/card.json`, 'utf8'));
for (const cid of process.argv[2].split(',')) {
  const c0 = card(cid);
  const ex = exprList(c0);
  for (const pose of c0.poses) {
    if (['p1', 'p2'].includes(pose.id) || (cid === 'echo' && pose.id === 'p4') || (cid === 'echo_true' && pose.id === 'p3')) continue;
    const full = pose.name.startsWith('3/4');
    const exprs = full ? ex.map((e) => e.id) : ['neutral'];
    const frames = [...EYE_FRAMES, ...(NO_MOUTH[cid] || []).includes(pose.id) ? [] : MOUTH_FRAMES].map((f) => f.id);
    const keys = [];
    for (const e of exprs) if (e !== 'neutral') keys.push(e);
    for (const e of exprs) for (const f of frames) keys.push(`${e}.${f}`);
    const cur = card(cid).poses.find((p) => p.id === pose.id);
    const todo = keys.filter((k) => !cur.ex?.[k]?.pick);
    if (!todo.length) continue;
    console.log(`${cid} ${pose.id}（${pose.name}）：${todo.length} 項`, new Date().toLocaleTimeString());
    // 表情要先選定才能做它的影格：依序一個一個跑（每個 var 都會存設定卡）
    for (let i = 0; i < todo.length; i += 6) {
      const batch = todo.slice(i, i + 6).join(',');
      const mb = comfyMB();
      if (!alive()) restart('ComfyUI 沒有回應');
      else if (++nb % 40 === 0 || mb > 24000) restart(mb > 24000 ? `記憶體 ${mb} MB` : '每 40 批');
      else if (mb > 21000) freeModels(mb);
      // 失敗時先確認 ComfyUI 還在（不在就重開）再重試一次；連續 3 批失敗就整個停下，不要一路空跑
      let ok = false;
      for (let t = 0; t < 2 && !ok; t++) {
        try {
          execFileSync('node', ['scripts/chargen.js', 'char', cid, 'var', `--pose=${pose.id}`, `--key=${batch}`, '--n=1', '--autopick'], {
            cwd: ROOT,
            stdio: ['ignore', 'ignore', 'inherit'],
          });
          ok = true;
        } catch (e) {
          console.log(`  失敗${t ? '（重試）' : ''}：${batch}`, e.message.split('\n')[0].slice(0, 80));
          if (!alive()) restart('失敗後 ComfyUI 沒有回應');
        }
      }
      fails = ok ? 0 : fails + 1;
      if (fails >= 3) {
        console.log('連續 3 批失敗，停下', new Date().toLocaleTimeString());
        process.exit(2);
      }
    }
  }
  console.log(`${cid} 完成`, new Date().toLocaleTimeString());
}
console.log('EXPRDONE');
