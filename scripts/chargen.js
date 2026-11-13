// 角色產生器的命令列（docs/portrait-design.md）：和網頁相同的工作流程與生產流程（mech_cordon_charagen/js/）
// 先 npm run comfy 啟動 ComfyUI；角色指令（char）另外要執行中的 mech-cordon-server（存角色資料）
//
// 角色（和網頁同一份資料：/api/chars）：
//   node scripts/chargen.js char <id> show
//   node scripts/chargen.js char <id> look --prompt="英文標籤" [--neg=…] [--zh=外觀設定卡]
//   node scripts/chargen.js char <id> cand [--pose=p1] [--n=4 | --seeds=1,2]
//   node scripts/chargen.js char <id> master --file=<候選檔名> [--pose=p1]
//   node scripts/chargen.js char <id> box [--pose=p1] [--face=x,y,w,h] [--eyes=…] [--mouth=…]
//   node scripts/chargen.js char <id> var --key=smile[,angry,smile.e1…] [--n=2] [--pose=p1] [--autopick（沒選的自動選第一張）] [--extra=加在指示後面的文字]
//   node scripts/chargen.js char <id> pick --key=smile --file=<檔名> [--pose=p1]
//   node scripts/chargen.js char <id> missing [--n=2] [--pose=p1]   產生所有還沒選的表情與影格
//   node scripts/chargen.js char <id> publish
//   共用：--server=http://127.0.0.1:80（沒給時讀 mech-cordon-server.json 的 port）、--comfy=http://127.0.0.1:8188、
//         --dl=<資料夾>（把這次產生的候選也下載到本機，方便看）
//
// 單獨的工作流程（測試用，輸出放在 tools/comfyui/runtime/work/<--out>/）：
//   node scripts/chargen.js t2i --prompt="…" [--seeds=1,2,3] [--w=832 --h=1216] --out=test/a
//   node scripts/chargen.js inpaint --image=<png> --box=x,y,w,h [--inner=…] --prompt="…" [--denoise=0.55] --out=…
//   node scripts/chargen.js edit --images=<png>[,<png>…] --prompt="…" [--paste=x,y,w,h] [--onto=<png>] --out=…
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const WORK = path.join(ROOT, 'tools', 'comfyui', 'runtime', 'work');
const LIB = path.join(ROOT, 'mech_cordon_charagen', 'js');
const lib = (f) => import(pathToFileURL(path.join(LIB, f)).href);

function parseArgs(from) {
  const o = { _: [] };
  for (const a of process.argv.slice(from)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/s);
    if (!m) {
      o._.push(a);
      continue;
    }
    const v = m[2] === undefined ? true : m[2];
    o[m[1]] = typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  }
  return o;
}
const nums = (s) => String(s).split(',').map(Number);
function defaultServer() {
  let port = 80;
  try {
    port = JSON.parse(fs.readFileSync(path.join(ROOT, 'mech-cordon-server.json'), 'utf8')).port || 80;
  } catch (e) {}
  return 'http://127.0.0.1' + (port === 80 ? '' : ':' + port);
}

async function charCmd(a, comfy) {
  const [id, sub] = a._;
  const { CharStore } = await lib('store.js');
  const P = await lib('pipeline.js');
  const { rosterOf } = await lib('roster.js');
  const { exprList, EYE_FRAMES, MOUTH_FRAMES } = await lib('expr.js');
  const store = new CharStore(a.server || defaultServer());
  const pipe = new P.Pipeline(comfy, store, (s) => console.log(s));
  let card = await store.getCard(id);
  if (!card) {
    const r = rosterOf(id) || { id, name: id };
    card = P.newCard(r);
  }
  const pid = a.pose || card.poses[0].id;
  let pose = P.poseOf(card, pid);
  if (!pose) {
    pose = P.newPose(pid, a.posename || pid);
    card.poses.push(pose);
  }
  const save = () => store.putCard(card);
  const dl = async (names) => {
    if (!a.dl) return;
    const d = path.resolve(a.dl);
    fs.mkdirSync(d, { recursive: true });
    for (const n of names) {
      fs.writeFileSync(path.join(d, n), await store.getWork(card.id, n));
      console.log('  ' + path.join(d, n));
    }
  };
  const t0 = Date.now();
  if (sub === 'show') {
    console.log(JSON.stringify(card, null, 2));
    return;
  } else if (sub === 'look') {
    if (a.prompt !== undefined) card.look.prompt = String(a.prompt);
    if (a.neg !== undefined) card.look.neg = String(a.neg);
    if (a.zh !== undefined) card.look.zh = String(a.zh);
    if (a.status) card.status = a.status;
  } else if (sub === 'cand') {
    const names = await pipe.candidates(card, pid, { n: a.n || 4, seeds: a.seeds ? nums(a.seeds) : null });
    await save();
    await dl(names);
  } else if (sub === 'master') {
    if (!pose.cands.find((c) => c.file === a.file)) throw new Error('沒有這個候選：' + a.file);
    if (pose.master !== a.file) pose.ex = {};
    pose.master = a.file;
    pose.seed = pose.cands.find((c) => c.file === a.file).seed;
  } else if (sub === 'box') {
    for (const k of ['face', 'eyes', 'mouth']) if (a[k]) pose.boxes[k] = nums(a[k]);
  } else if (sub === 'var') {
    for (const key of String(a.key).split(',')) {
      const names = await pipe.variant(card, pid, key, {
        n: a.n || 2,
        seeds: a.seeds ? nums(a.seeds) : null,
        extra: a.extra || '',
      });
      if (a.autopick && !pose.ex[key].pick) pose.ex[key].pick = names[0];
      await save();
      await dl(names);
    }
  } else if (sub === 'pick') {
    const s = pose.ex[a.key];
    if (!s || !s.cands.includes(a.file)) throw new Error('沒有這個候選');
    s.pick = a.file;
  } else if (sub === 'missing') {
    const keys = [];
    for (const e of exprList(card)) if (e.id !== 'neutral' && !pose.ex[e.id]?.pick) keys.push(e.id);
    if (!keys.length)
      for (const e of exprList(card))
        for (const f of [...EYE_FRAMES, ...MOUTH_FRAMES])
          if (!pose.ex[`${e.id}.${f.id}`]?.pick) keys.push(`${e.id}.${f.id}`);
    for (const key of keys) {
      const names = await pipe.variant(card, pid, key, { n: a.n || 2 });
      await save();
      await dl(names);
    }
  } else if (sub === 'publish') {
    const pub = await pipe.publish(card);
    console.log(JSON.stringify(pub, null, 1).slice(0, 2000));
  } else throw new Error('不認得的角色指令：' + sub);
  await save();
  console.log(`完成（${((Date.now() - t0) / 1000).toFixed(1)} 秒）`);
}

async function flowCmd(cmd, a, c) {
  const W = await lib('workflows.js');
  const out = path.join(WORK, a.out || 'misc');
  fs.mkdirSync(out, { recursive: true });
  const seeds = nums(a.seeds ?? Math.floor(Math.random() * 1e9));
  const up = async (f) => c.upload(fs.readFileSync(f), path.basename(f));
  const opts = { ...a };
  for (const k of ['out', 'seeds', 'comfy', '_']) delete opts[k];
  let build;
  if (cmd === 't2i') build = (seed) => W.txt2img({ ...opts, seed });
  else if (cmd === 'inpaint') {
    opts.image = await up(a.image);
    opts.box = nums(a.box);
    if (a.inner) opts.inner = nums(a.inner);
    build = (seed) => W.inpaintBox({ ...opts, seed });
  } else if (cmd === 'edit') {
    opts.images = [];
    for (const f of String(a.images).split(',')) opts.images.push(await up(f));
    if (a.paste) opts.paste = nums(a.paste);
    if (a.onto) opts.onto = await up(a.onto);
    build = (seed) => W.qwenEdit({ ...opts, seed });
  } else throw new Error('不認得的指令：' + cmd);
  for (const seed of seeds) {
    const t0 = Date.now();
    const imgs = await c.run(build(seed));
    for (const im of imgs) {
      const tag = im.filename.includes('_crop') ? '_crop' : '';
      const f = path.join(out, `${cmd}_${seed}${tag}.png`);
      fs.writeFileSync(f, await c.view(im));
      console.log(f);
    }
    console.log(`  種子 ${seed}：${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
  }
}

async function main() {
  const cmd = process.argv[2];
  const a = parseArgs(3);
  const { Comfy } = await lib('comfy.js');
  const c = new Comfy(a.comfy || 'http://127.0.0.1:' + (process.env.COMFY_PORT || 8188));
  if (!(await c.alive())) throw new Error('ComfyUI 沒有在執行：先 npm run comfy');
  if (cmd === 'char') return charCmd(a, c);
  return flowCmd(cmd, a, c);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
