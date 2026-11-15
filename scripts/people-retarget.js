// 過場人物的動作：用 Blender 把 Universal Animation Library 1、2（Quaternius，CC0；itch.io 免費版附的 License.txt）的動作
// 對應到現有人物的骨架（Ultimate Animated Character Pack 那一套：src/assets/people/ 的 biz、suitw、hoodie、farmer、casual、
// hooded、pilot 與格納庫的 worker／crew／soldier），輸出 src/assets/people/anims/ual.glb（男性骨架，biz）與 ual_f.glb
// （女性骨架，suitw）：只有骨架＋動作，建置時一起打包，執行時同骨架的人物共用（render/hangar-assets.js 的 haChar）。
// 轉換的計算在 scripts/blender/retarget.py。docs/cine-redesign-design.md 第十一節「人物 v2」。
//   node scripts/people-retarget.js --src=<放 UAL1_Standard.glb、UAL2_Standard.glb 的資料夾> [--blender=<blender.exe>]
// 檢視：node scripts/people-shots.js Carry,Push,Call,Talk,Fix，或標題「工具與其他」的「人物動作預覽」。
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.slice(2).split('=');
      return [k, v === undefined ? true : v];
    }),
);
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src', 'assets', 'people', 'anims');
// 要轉的動作：[來源的名稱, 遊戲裡的名稱]
const CLIPS = [
  ['Idle_Talking_Loop', 'Talk'],
  ['Walk_Carry_Loop', 'Carry'],
  ['Push_Loop', 'Push'],
  ['Idle_Rail_Call', 'Call'],
  ['Fixing_Kneeling', 'Fix'],
  ['PickUp_Table', 'PickUp'],
  ['Interact', 'Use'],
  ['Idle_FoldArms_Loop', 'Arms'],
  ['Idle_TalkingPhone_Loop', 'Phone'],
  ['Yes', 'Yes'],
  ['Idle_No_Loop', 'No'],
  ['Sitting_Idle_Loop', 'Sit'],
  ['Sitting_Talking_Loop', 'SitTalk'],
  ['Driving_Loop', 'Drive'],
  ['Idle_Torch_Loop', 'Torch'],
  ['Walk_Formal_Loop', 'WalkFormal'],
  ['Jog_Fwd_Loop', 'Jog'],
  ['Sprint_Loop', 'Sprint'],
  ['Crouch_Idle_Loop', 'Crouch'],
  ['Pistol_Idle_Loop', 'GunIdle'],
  ['Pistol_Aim_Neutral', 'GunAim'],
  ['Chest_Open', 'Open'],
  ['OverhandThrow', 'Throw'],
  ['Consume', 'Drink'],
  ['Idle_Lantern_Loop', 'Lantern'],
];
// 來源 → 目標的骨頭（Blender 裡的名稱，有「.」）
const MAP = {
  pelvis: 'Hips',
  spine_01: 'Abdomen',
  spine_02: 'Torso',
  spine_03: 'Chest',
  neck_01: 'Neck',
  Head: 'Head',
};
for (const [s, t] of [
  ['l', 'L'],
  ['r', 'R'],
]) {
  Object.assign(MAP, {
    ['clavicle_' + s]: 'Shoulder.' + t,
    ['upperarm_' + s]: 'UpperArm.' + t,
    ['lowerarm_' + s]: 'LowerArm.' + t,
    ['hand_' + s]: 'Wrist.' + t,
    ['thigh_' + s]: 'UpperLeg.' + t,
    ['calf_' + s]: 'LowerLeg.' + t,
    ['foot_' + s]: 'Foot.' + t,
  });
  for (const f of ['index', 'middle', 'ring', 'pinky'])
    for (let i = 1; i <= 3; i++) MAP[`${f}_0${i}_${s}`] = `${f[0].toUpperCase() + f.slice(1)}${i}.${t}`;
  for (let i = 1; i <= 3; i++) MAP[`thumb_0${i}_${s}`] = `Thumb${i}.${t}`;
}

if (!args.src) {
  console.log('用法：node scripts/people-retarget.js --src=<UAL 的 GLB 資料夾> [--blender=<blender.exe>]');
  process.exit(1);
}
const find = (n) => {
  let hit = null;
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (f === n && !hit) hit = p;
    }
  };
  walk(args.src);
  return hit;
};
const sources = ['UAL1_Standard.glb', 'UAL2_Standard.glb'].map(find).filter(Boolean);
if (!sources.length) throw new Error('找不到 UAL1_Standard.glb／UAL2_Standard.glb');
const blender =
  args.blender ||
  process.env.BLENDER ||
  ['5.3', '5.2', '5.1', '5.0', '4.5', '4.4']
    .map((v) => `C:/Program Files/Blender Foundation/Blender ${v}/blender.exe`)
    .find((p) => fs.existsSync(p));
if (!blender) throw new Error('找不到 Blender（--blender=<路徑> 或環境變數 BLENDER）');
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const [rig, tgt, out] of [
  ['男性骨架', 'biz.glb', 'ual.glb'],
  ['女性骨架', 'suitw.glb', 'ual_f.glb'],
  // Ultimate Modular Men／Women 的公尺版（scripts/people-import.js 匯入的 m_／w_）
  ['男性骨架（公尺版）', 'm_Worker.glb', 'ual_m2.glb'],
  ['女性骨架（公尺版）', 'w_Worker.glb', 'ual_w2.glb'],
]) {
  if (!fs.existsSync(path.join(ROOT, 'src', 'assets', 'people', tgt))) continue;
  const job = {
    target: path.join(ROOT, 'src', 'assets', 'people', tgt),
    sources,
    clips: CLIPS,
    map: MAP,
    out: path.join(OUT_DIR, out),
  };
  const r = spawnSync(
    blender,
    ['-b', '--python', path.join(__dirname, 'blender', 'retarget.py'), '--', JSON.stringify(job)],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const log = (r.stdout || '') + (r.stderr || '');
  const err = log.split(/\r?\n/).filter((l) => /Error|Traceback|錯誤/.test(l));
  if (r.status !== 0 || !fs.existsSync(job.out) || err.length) {
    console.log(log.slice(-3000));
    throw new Error(`${rig}：Blender 失敗`);
  }
  console.log(
    `${rig}（${tgt}）→ ${path.relative(ROOT, job.out)}（${(fs.statSync(job.out).size / 1024).toFixed(0)} KB）`,
  );
}
