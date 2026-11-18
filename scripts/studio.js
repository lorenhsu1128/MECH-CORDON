// 立繪工房的命令列（docs/portrait-studio-design.md、docs/portrait-design.md）：和網頁相同的工作流程與生產流程
// （mech_cordon_studio/js/），資料和網頁同一份（透過執行中的 mech-cordon-server）。舊的名稱 scripts/chargen.js 也可以用。
// 產圖的指令要先 npm run comfy 啟動 ComfyUI；專案、新增角色、參考圖、下載與匯入不用 ComfyUI。
//
// 專案（遊戲本身＝mech_cordon；其他專案在工房資料夾）：
//   node scripts/studio.js projects
//   node scripts/studio.js project new <專案> [--name=名稱] [--note=說明]
//   node scripts/studio.js project show <專案>
//   node scripts/studio.js project set <專案> [--name=…] [--note=…] [--style=畫風] [--neg=…] [--w=832 --h=1216] [--pose=新姿勢的標籤]
//       [--quality=88] [--base=smile,laugh,…|all] [--frames=e1,e2,m1,m2,m3|all]   （新角色的預設：共用表情、影格）
//   node scripts/studio.js project ref <專案> <圖檔> [<圖檔>…]            加入專案的參考圖
//   node scripts/studio.js project zip <專案> --out=<檔案.zip> [--char=<角色>] [--what=all|out]   下載工作資料（all）或成品（out）
//   node scripts/studio.js project import <專案> <檔案.zip>                  匯入（專案還沒有時建立）
//
// 角色（--project=<專案>，沒給＝mech_cordon）：
//   node scripts/studio.js char <id> new [--name=名稱] [--sex=f|m] [--age=…] [--color=#7fc8ff] [--note=…] [--no-extra]
//       （使用者自己的專案；招牌表情預先填好常用的 43 種，--no-extra＝只有共用的 8 種）
//   node scripts/studio.js char <id> ref <圖檔> [<圖檔>…]                    加入角色的參考圖
//   node scripts/studio.js char <id> status                                  進度與品管的摘要（每個姿勢：表情、影格、不合格、還沒看）
//   node scripts/studio.js char <id> show
//   node scripts/studio.js char <id> look --prompt="英文標籤" [--neg=…] [--zh=外觀設定卡]
//   node scripts/studio.js char <id> cand [--pose=p1] [--n=4 | --seeds=1,2]
//   node scripts/studio.js char <id> master --file=<候選檔名> [--pose=p1]
//   node scripts/studio.js char <id> box [--pose=p1] [--face=x,y,w,h] [--eyes=…] [--mouth=…]
//   node scripts/studio.js char <id> var --key=smile[,angry,smile.e1…] [--n=2] [--pose=p1] [--autopick（沒選的自動選第一張）] [--extra=加在指示後面的文字]
//   node scripts/studio.js char <id> pick --key=smile --file=<檔名> [--pose=p1]
//   node scripts/studio.js char <id> missing [--n=2] [--pose=p1]   產生所有還沒選的表情與影格
//   node scripts/studio.js char <id> publish [--keep]
//
// 品管與看圖（第 2 期；圖輸出在 test-results/studio/<專案>/<角色>/，用讀圖的方式看）：
//   node scripts/studio.js char <id> sheet masters [--pose=p1]                主圖候選並排（編號給 master --n=）
//   node scripts/studio.js char <id> sheet grid [--pose=p1]                   主圖＋座標格線、目前的框、臉部放大（量框用）
//   node scripts/studio.js char <id> sheet cands <姿勢>:<表情>[.<影格>] … [--n=3] [--list=清單檔]   候選表（編號給 pick）
//   node scripts/studio.js char <id> qa [--pose=p1|all]                       量測全部影格、放大總表 <姿勢>_zoom.jpg、qa.json
//   node scripts/studio.js char <id> mark <姿勢>:<表情>.<影格>=ok|ng … [--why=ghost,expr] [--note=…]   標記看過的結果
//   node scripts/studio.js char <id> pick <姿勢>:<表情>[.<影格>]=<編號> …     選定候選表上的第幾張；0＝略過（不發佈）
//   node scripts/studio.js char <id> regen <姿勢>:<表情>[.<影格>] … [--n=3] [--list=清單檔]   產生新候選（不改目前的選擇）
//   node scripts/studio.js char <id> master --n=<編號> [--pose=p1]            主圖候選表上的第幾張設成主圖
//   node scripts/studio.js char <id> fixmaster --box=x,y,w,h --prompt="Fix the left hand…" [--n=2]   主圖的局部修正（新的主圖候選）
//   node scripts/studio.js char <id> box --auto                               自動偵測臉、眼睛、嘴（要 ComfyUI）
//   node scripts/studio.js char <id> flag [--keep=x,y,w,h] [--eyekeep=…] [--clear-keep] [--glasses=1|0|auto]
//       [--noblink=表情,…] [--smile=表情:1|0|auto,…] [--open=表情[:0],…]   保留區（疤、OK 繃）與旗標
//   node scripts/studio.js char <id> restore <姿勢>:<表情>.<影格> --box=x,y,w,h   把一塊換回底圖（新候選、直接選定）
//
// 自動完成（第 4 期；主圖選定之後一路做到發佈，中途停掉再跑會接著做）：
//   node scripts/studio.js char <id> auto [--pose=p1|all] [--n=3] [--no-publish] [--restart-comfy]
//       --restart-comfy：開始前重開 ComfyUI、顯示卡記憶體超過 95% 時也重開（Windows；網頁的自動完成會加）
//   共用：--project=<專案>、--server=http://127.0.0.1:80（沒給時讀 mech-cordon-server.json 的 port）、--comfy=http://127.0.0.1:8188、
//         --dl=<資料夾>（把這次產生的候選也下載到本機，方便看）
//
// 單獨的工作流程（測試用，輸出放在 tools/comfyui/runtime/work/<--out>/）：
//   node scripts/studio.js t2i --prompt="…" [--seeds=1,2,3] [--w=832 --h=1216] --out=test/a
//   node scripts/studio.js inpaint --image=<png> --box=x,y,w,h [--inner=…] --prompt="…" [--denoise=0.55] --out=…
//   node scripts/studio.js edit --images=<png>[,<png>…] --prompt="…" [--paste=x,y,w,h] [--onto=<png>] --out=…
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');
const WORK = path.join(ROOT, 'tools', 'comfyui', 'runtime', 'work');
const LIB = path.join(ROOT, 'mech_cordon_studio', 'js');
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

// 圖檔 → 上傳用的位元組（伺服器把 PNG／JPG 轉成 WebP；其他格式先轉好再加）
function imgFile(f) {
  const b = fs.readFileSync(f);
  const ok =
    (b[0] === 0x89 && b[1] === 0x50) ||
    (b[0] === 0xff && b[1] === 0xd8) ||
    (b.length > 12 && b.toString('latin1', 8, 12) === 'WEBP');
  if (!ok) throw new Error(f + '：只收 PNG、JPG、WebP');
  return b;
}
const ID_OK = /^[a-z][a-z0-9_]{0,31}$/;

async function projectCmd(cmd, a) {
  const { StudioStore } = await lib('store.js');
  const S = new StudioStore(a.server || defaultServer());
  if (cmd === 'projects') {
    for (const p of (await S.projects()).projects)
      console.log(`${p.id}\t${p.name}\t角色 ${p.chars}${p.linked ? '\t（遊戲本身）' : ''}`);
    return;
  }
  const [sub, pid, ...rest] = a._;
  if (!pid) throw new Error('要給專案代號');
  if (sub === 'new') {
    if (!ID_OK.test(pid)) throw new Error('專案代號要英文小寫開頭，英數與底線');
    console.log(JSON.stringify((await S.create(pid, a.name || pid, a.note || '')).project, null, 2));
  } else if (sub === 'show') console.log(JSON.stringify(await S.get(pid), null, 2));
  else if (sub === 'set') {
    const c = await S.get(pid);
    if (c.linked) throw new Error('遊戲的專案照程式的設定，不能改');
    if (a.name !== undefined) c.name = String(a.name);
    if (a.note !== undefined) c.note = String(a.note);
    if (a.pose !== undefined) c.pose = String(a.pose);
    c.style = { ...(c.style || {}) };
    if (a.style !== undefined) c.style.prompt = String(a.style);
    if (a.neg !== undefined) c.style.neg = String(a.neg);
    if (a.w) c.style.w = +a.w;
    if (a.h) c.style.h = +a.h;
    if (a.quality) c.out = { ...(c.out || {}), quality: +a.quality };
    // --base＝新角色要做的共用表情（smile,laugh…；all＝全部）、--frames＝影格（e1,e2,m1,m2,m3；all＝全部）
    for (const [k, key] of [
      ['base', 'base'],
      ['frames', 'frames'],
    ])
      if (a[k] !== undefined) {
        if (String(a[k]) === 'all') delete c[key];
        else c[key] = String(a[k]).split(',').filter(Boolean);
      }
    await S.put(c);
    console.log(JSON.stringify(await S.get(pid), null, 2));
  } else if (sub === 'ref') {
    const { refName } = await lib('store.js');
    for (const f of rest) {
      const n = refName();
      await S.putRef(pid, n, imgFile(f));
      console.log(`${f} → ${n}`);
    }
  } else if (sub === 'zip') {
    if (!a.out) throw new Error('要給 --out=<檔案.zip>');
    const r = await fetch(S.zipUrl(pid, { char: a.char, what: a.what || 'all' }));
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'HTTP ' + r.status);
    const { Readable } = require('stream');
    const { pipeline } = require('stream/promises');
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(path.resolve(a.out)));
    console.log(path.resolve(a.out), (fs.statSync(path.resolve(a.out)).size / 1048576).toFixed(1) + ' MB');
  } else if (sub === 'import') {
    if (!rest[0]) throw new Error('要給 zip 檔');
    const r = await S.importZip(pid, fs.readFileSync(rest[0]));
    console.log(JSON.stringify(r));
  } else throw new Error('不認得的專案指令：' + sub);
}

// 格子的參數：<姿勢>:<表情>[.<影格>][=<值>]（姿勢可以省略＝--pose 或第一個姿勢）→ [[姿勢, 格, 值]…]
function slotArgs(card, list, withVal) {
  const out = [];
  for (const raw of list) {
    let [k, v] = String(raw).split('=');
    if (withVal && v === undefined) throw new Error('要寫成 <格>=<值>：' + raw);
    if (!k.includes(':')) k = card.poses[0].id + ':' + k;
    const [pid, key] = k.split(':');
    const po = card.poses.find((p) => p.id === pid);
    if (!po || !key) throw new Error('沒有這個姿勢或格子：' + raw);
    out.push([po, key, v]);
  }
  return out;
}
// 位置參數的格子＋--list=清單檔（每行一格；Windows 的 \r 去掉）
function listArgs(a, from = 2) {
  const l = a._.slice(from).map(String);
  if (a.list)
    l.push(
      ...fs
        .readFileSync(String(a.list), 'utf8')
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean),
    );
  return l;
}

async function charCmd(a, comfy) {
  const [id, sub] = a._;
  const { CharStore, StudioStore, LINKED, refName } = await lib('store.js');
  const P = await lib('pipeline.js');
  const { rosterOf } = await lib('roster.js');
  const { exprList, frameList } = await lib('expr.js');
  const project = a.project || LINKED;
  const server = a.server || defaultServer();
  const store = new CharStore(server, project);
  const pipe = new P.Pipeline(comfy, store, (s) => console.log(s));
  const conf = await new StudioStore(server).get(project);
  if (!conf.linked) pipe.project = conf; // 使用者的專案：畫風與主圖大小照專案設定
  if (!ID_OK.test(id)) throw new Error('角色代號要英文小寫開頭，英數與底線');
  let card = await store.getCard(id);
  if (!card) {
    if (!conf.linked && sub !== 'new') throw new Error(`專案 ${project} 沒有角色 ${id}（先 char ${id} new）`);
    const r = (conf.linked && rosterOf(id)) || { id, name: a.name || id };
    card = P.newCard(r);
    if (!conf.linked && conf.pose) card.poses[0].prompt = conf.pose;
  } else if (sub === 'new') throw new Error('已經有這個角色');
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
  } else if (sub === 'new') {
    card.info = { sex: a.sex || '', age: a.age || '', color: a.color || '#7fc8ff', note: a.note || '' };
    // 招牌表情預先填好常用的（--no-extra＝只有共用的 8 種）
    // 專案設定的新角色預設（表情組、影格組、招牌表情；沒有＝全部＋常用的 43 種）
    const lib0 = (await lib('expr.js')).EXTRA_LIBRARY;
    if (!a['no-extra'])
      card.extraExprs = (conf.extra && conf.extra.length ? conf.extra : lib0).map((e) => ({ ...e }));
    if (conf.base) card.baseExprs = [...conf.base];
    if (conf.frames) card.frames = [...conf.frames];
  } else if (sub === 'ref') {
    for (const f of a._.slice(2)) {
      const n = refName();
      await store.putWork(card.id, n, imgFile(f));
      card.refs.push(n);
      console.log(`${f} → ${n}`);
    }
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
    if (a.n) a.file = pose.cands[a.n - 1]?.file;
    if (!pose.cands.find((c) => c.file === a.file)) throw new Error('沒有這個候選：' + (a.file || a.n));
    if (pose.master !== a.file) {
      pose.ex = {};
      // 換成別張（不是局部修正的）：框與保留區是舊主圖的位置，清掉（自動完成會重新偵測）
      if (!pose.cands.find((c) => c.file === a.file).fix) {
        pose.boxes = {};
        for (const k of ['autoBox', 'fv', 'keepOut', 'eyeKeepOut']) delete pose[k];
      }
    }
    pose.master = a.file;
    pose.seed = pose.cands.find((c) => c.file === a.file).seed;
  } else if (sub === 'box') {
    // --auto：自動偵測（動漫的臉與眼睛＋Qwen 塗綠找嘴）；手給的值優先
    if (a.auto) {
      const A = await lib('auto.js');
      const b = await A.detectBoxes(pipe, card, pid);
      pose.boxes = { face: b.face, eyes: b.eyes, mouth: b.mouth };
      pose.autoBox = b.info;
      delete pose.fv;
      console.log(
        `自動偵測：臉 ${b.face}、眼睛 ${b.eyes}（${b.info.eyeN} 隻）、嘴 ${b.mouth}（${b.info.mouth}）`,
      );
    }
    for (const k of ['face', 'eyes', 'mouth']) if (a[k]) pose.boxes[k] = nums(a[k]);
    if (a.mouth) {
      delete pose.boxes.mouth0; // 手改了嘴框：影格用的放大重算
      delete pose.fv;
    }
  } else if (sub === 'fixmaster') {
    // 主圖的局部修正：只改 --box 裡，存成新的主圖候選（sheet masters 看、master --n= 選）
    if (!a.box || !a.prompt) throw new Error('要給 --box=x,y,w,h 與 --prompt="要怎麼改"');
    const names = await pipe.fixMaster(card, pid, {
      box: nums(a.box),
      prompt: String(a.prompt),
      n: a.n || 2,
    });
    for (const f of names) console.log(`第 ${pose.cands.findIndex((c) => c.file === f) + 1} 張：${f}`);
  } else if (sub === 'restore') {
    // 把一塊換回底圖（疤、配件被影格改掉時）：選定的圖＋框裡換成底圖的像素（邊緣 2 px 漸變）→ 新候選、直接選定
    const sharp = require('sharp');
    const [[po, key]] = slotArgs(card, [a._[2]], false);
    const [e] = key.split('.');
    const sl = po.ex[key];
    if (!key.includes('.') || !sl || !sl.pick) throw new Error('要給有選定圖的影格：<姿勢>:<表情>.<影格>');
    if (!a.box) throw new Error('要給 --box=x,y,w,h（整張圖的座標，用 sheet grid 量）');
    const bf = e === 'neutral' ? po.master : po.ex[e]?.pick;
    const raw = async (f) =>
      sharp(Buffer.from(await store.getWork(card.id, f)))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
    const B = await raw(bf);
    const C = await raw(sl.pick);
    const W = C.info.width;
    const H = C.info.height;
    const [x0, y0, bw, bh] = nums(a.box).map(Math.round);
    const fe = 2;
    for (let y = Math.max(0, y0); y < Math.min(H, y0 + bh); y++)
      for (let x = Math.max(0, x0); x < Math.min(W, x0 + bw); x++) {
        const d = Math.min(x - x0 + 1, x0 + bw - x, y - y0 + 1, y0 + bh - y);
        const k = Math.min(1, d / (fe + 1));
        const i = (y * W + x) * 3;
        for (let c = 0; c < 3; c++) C.data[i + c] = Math.round(B.data[i + c] * k + C.data[i + c] * (1 - k));
      }
    const png = await sharp(C.data, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toBuffer();
    const nf = sl.pick.replace(/(_r\d+)?\.webp$/, '') + '_r' + Date.now().toString().slice(-6) + '.webp';
    await store.putWork(card.id, nf, png);
    sl.cands.push(nf);
    sl.pick = nf;
    delete sl.qa;
    console.log(`${po.id}:${key} → ${nf}`);
  } else if (sub === 'flag') {
    // 保留區與旗標（docs/portrait-qa-workflow.md 第三、六節）
    if (a.keep) (pose.keepOut ||= []).push(nums(a.keep));
    if (a.eyekeep) (pose.eyeKeepOut ||= []).push(nums(a.eyekeep));
    if (a['clear-keep']) {
      delete pose.keepOut;
      delete pose.eyeKeepOut;
    }
    if (a.glasses !== undefined) {
      if (a.glasses === 'auto') delete card.glasses;
      else card.glasses = String(a.glasses) === '1';
    }
    if (a.noblink !== undefined) pose.noBlink = String(a.noblink).split(',').filter(Boolean);
    for (const kv of String(a.smile || '')
      .split(',')
      .filter(Boolean)) {
      const [e, v] = kv.split(':');
      const x = (pose.ex[e] ||= {});
      if (v === 'auto') delete x.smile;
      else x.smile = v === '1';
    }
    for (const kv of String(a.open || '')
      .split(',')
      .filter(Boolean)) {
      const [e, v] = kv.split(':');
      const x = (pose.ex[e] ||= {});
      if (v === '0') delete x.open;
      else x.open = true;
    }
    console.log(
      JSON.stringify({
        glasses: card.glasses,
        keepOut: pose.keepOut,
        eyeKeepOut: pose.eyeKeepOut,
        noBlink: pose.noBlink,
        smile: Object.fromEntries(
          Object.entries(pose.ex)
            .filter(([, x]) => x.smile != null)
            .map(([k, x]) => [k, x.smile]),
        ),
        open: Object.keys(pose.ex).filter((k) => pose.ex[k].open),
      }),
    );
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
  } else if (sub === 'pick' && a.key) {
    const s = pose.ex[a.key];
    if (!s || !(s.cands || []).includes(a.file)) throw new Error('沒有這個候選');
    s.pick = a.file;
  } else if (sub === 'pick') {
    // <姿勢>:<格>=<編號>：編號＝候選表上的（這格 cands 的第幾張，1 起算）；0＝略過
    for (const [po, key, v] of slotArgs(card, a._.slice(2), true)) {
      const sl = (po.ex[key] ||= { cands: [], pick: null });
      sl.cands ||= [];
      const k = +v;
      if (k === 0) {
        if (!key.includes('.')) throw new Error('表情不能略過（只有眨眼與嘴型的影格可以）：' + key);
        sl.skip = true;
        console.log(`${po.id}:${key} 略過`);
        continue;
      }
      const f = sl.cands[k - 1];
      if (!f) throw new Error(`${po.id}:${key} 沒有第 ${k} 張候選（共 ${sl.cands.length} 張）`);
      if (!key.includes('.') && sl.pick && sl.pick !== f)
        for (const kk of Object.keys(po.ex)) if (kk.startsWith(key + '.')) delete po.ex[kk]; // 換了表情：它的影格要重做
      if (!key.includes('.') && sl.pick !== f) {
        delete sl.mb; // 嘴框要照新的表情重量（auto 會補）
        delete sl.mbDone;
      }
      sl.pick = f;
      sl.v2 = true;
      delete sl.skip;
      console.log(`${po.id}:${key} → ${f}`);
    }
  } else if (sub === 'mark') {
    const Q = await lib('qa.js');
    const why = a.why ? String(a.why).split(',') : [];
    for (const w of why)
      if (!Q.QA_CHECKS[w]) throw new Error(`不認得的原因 ${w}（${Object.keys(Q.QA_CHECKS).join('、')}）`);
    for (const [po, key, v] of slotArgs(card, a._.slice(2), true)) {
      if (v !== 'ok' && v !== 'ng') throw new Error('mark 的值是 ok 或 ng：' + key);
      const sl = po.ex[key];
      if (!sl || !sl.pick) throw new Error(`${po.id}:${key} 還沒有選定的圖`);
      sl.qa = {
        st: v,
        why: v === 'ng' ? why : [],
        note: a.note ? String(a.note) : '',
        pick: sl.pick,
        by: 'cli',
        t: Date.now(),
      };
      console.log(`${po.id}:${key} ${v}`);
    }
  } else if (sub === 'regen') {
    for (const [po, key] of slotArgs(card, listArgs(a), false)) {
      if (key.includes('.') && po.fv !== 2 && po.boxes.mouth) {
        po.boxes.mouth0 = po.boxes.mouth;
        po.boxes.mouth = P.widenMouth(po.boxes);
        po.fv = 2;
      }
      const names = await pipe.variant(card, po.id, key, { n: a.n || 3, extra: a.extra || '' });
      await save();
      console.log(`${po.id}:${key} 新候選 ${names.length} 張（共 ${po.ex[key].cands.length} 張）`);
    }
  } else if (sub === 'qa' || sub === 'sheet') {
    const Q = await lib('qa.js');
    const SQ = require('./studio-qa.js');
    const poses =
      a.pose && a.pose !== 'all' ? [pose] : card.poses.filter((p) => p.master && p.boxes && p.boxes.face);
    const ctx = { store, card, project, Q, log: (t) => console.log(t) };
    const kind = a._[2];
    if (sub === 'qa')
      await SQ.runQa({
        ...ctx,
        poses,
        exprIds: exprList(card).map((e) => e.id),
        frames: frameList(card).map((f) => f.id),
        noBlink: (po) => P.noBlink(po),
      });
    else if (kind === 'masters') await SQ.masterSheet({ ...ctx, P: pose });
    else if (kind === 'grid') await SQ.gridSheet({ ...ctx, P: pose });
    else if (kind === 'cands') {
      const keys = listArgs(a, 3);
      if (!keys.length) throw new Error('要給格子（<姿勢>:<表情>[.<影格>]）或 --list=清單檔');
      await SQ.candSheet({ ...ctx, keys, n: a.n || 0 });
    } else throw new Error('sheet 的種類：masters、grid、cands');
  } else if (sub === 'auto') {
    // 自動完成（第 4 期）：主圖選定之後，標框 → 表情 → 嘴框 → 眨眼與嘴型 → 量測 → 發佈（js/auto.js，和網頁同一份）
    const A = await lib('auto.js');
    const Q = await lib('qa.js');
    const SQ = require('./studio-qa.js');
    const t1 = Date.now();
    // --restart-comfy：先重開 ComfyUI（每個角色一次），跑的過程中顯示卡記憶體超過 95% 也重開（server-studio-gpu.js）
    const G = require('../server-studio-gpu.js');
    const ROOTD = path.join(__dirname, '..');
    const restart = async (why) => {
      console.log(`重開 ComfyUI（${why}）`);
      if (!G.restartComfy(ROOTD)) console.log('  重開失敗或不支援（只在 Windows），照樣繼續');
      pipe.up.clear();
    };
    if (a['restart-comfy']) await restart('每個角色開始前');
    let lastG = 0;
    const tick = async () => {
      if (Date.now() - lastG < 60000) return;
      lastG = Date.now();
      const v = await G.vram();
      if (!v) return;
      console.log(`顯示卡記憶體 ${(v.used / 1024).toFixed(1)} / ${(v.total / 1024).toFixed(1)} GB`);
      if (a['restart-comfy'] && v.used > v.total * 0.95) await restart('顯示卡記憶體太滿');
    };
    const rep = await A.autoRun(pipe, card, {
      tick,
      pids: a.pose && a.pose !== 'all' ? [pid] : undefined,
      n: a.n || 3,
      publish: !a['no-publish'],
      load: SQ.loader(store, card.id),
      save,
      log: (t) => console.log(t),
      progress: (f, t) => console.log(`PROGRESS ${(f * 100).toFixed(1)}% ${t}`),
    });
    await SQ.runQa({
      store,
      card,
      project,
      Q,
      log: (t) => console.log(t),
      poses: card.poses.filter((p) => p.master && p.boxes && p.boxes.face),
      exprIds: exprList(card).map((e) => e.id),
      frames: frameList(card).map((f) => f.id),
      noBlink: (po) => P.noBlink(po),
    });
    console.log(`自動完成（${((Date.now() - t1) / 60000).toFixed(1)} 分鐘）`);
    if (rep.skipped.length) console.log(`略過 ${rep.skipped.length} 格：\n  ${rep.skipped.join('\n  ')}`);
    if (rep.weak.length) console.log(`量測不理想的表情（建議看一下）：${rep.weak.join(' ')}`);
  } else if (sub === 'status') {
    const Q = await lib('qa.js');
    const FR = frameList(card).map((f) => f.id);
    console.log(
      `${card.name}（${card.id}）狀態 ${card.status}，${card.pub ? '發佈過 ' + new Date(card.pub.t).toLocaleString('zh-TW') : '還沒發佈'}`,
    );
    for (const po of card.poses) {
      const B = po.boxes || {};
      const exs = exprList(card).filter((e) => e.id !== 'neutral');
      const exDone = exs.filter((e) => po.ex[e.id]?.pick).length;
      const c = { done: 0, miss: 0, skip: 0, auto: [], ng: [], ok: 0, unseen: 0 };
      for (const e of exprList(card)) {
        if (e.id !== 'neutral' && !po.ex[e.id]?.pick) continue;
        for (const fid of FR) {
          if (fid[0] === 'e' && P.noBlink(po).includes(e.id)) continue;
          const sl = po.ex[e.id + '.' + fid];
          if (sl?.skip) c.skip++;
          else if (!sl?.pick) c.miss++;
          else {
            c.done++;
            const st = Q.qaState(sl);
            if (st === 'ok') c.ok++;
            else if (st === 'ng') c.ng.push(e.id + '.' + fid);
            else if (st === 'auto') c.auto.push(e.id + '.' + fid);
            else c.unseen++;
          }
        }
      }
      console.log(
        `  ${po.id}（${po.name}）：主圖 ${po.master ? '✓' : '—'}、框 ${['face', 'eyes', 'mouth'].filter((k) => B[k]).join('/') || '—'}、表情 ${exDone}/${exs.length}、影格 ${c.done}（缺 ${c.miss}、略過 ${c.skip}）、合格 ${c.ok}、還沒看 ${c.unseen}`,
      );
      if (c.auto.length)
        console.log(`    量測抓到（還沒看）：${c.auto.map((k) => po.id + ':' + k).join(' ')}`);
      if (c.ng.length) console.log(`    標成不合格：${c.ng.map((k) => po.id + ':' + k).join(' ')}`);
    }
    return;
  } else if (sub === 'missing') {
    const keys = [];
    for (const e of exprList(card)) if (e.id !== 'neutral' && !pose.ex[e.id]?.pick) keys.push(e.id);
    if (!keys.length)
      for (const e of exprList(card))
        for (const f of frameList(card)) if (!pose.ex[`${e.id}.${f.id}`]?.pick) keys.push(`${e.id}.${f.id}`);
    for (const key of keys) {
      const names = await pipe.variant(card, pid, key, { n: a.n || 2 });
      await save();
      await dl(names);
    }
  } else if (sub === 'frames') {
    // 2026-11-15 立繪大修：重產眨眼與嘴型（每格一張、直接選定，品管另外跑 scripts/portrait-qa.py）。
    // 每個姿勢第一次先放大嘴框（widenMouth，pose.fv＝2）；--only=p1:smile.e1,p2:laugh.m2 只重產這幾格（換種子），
    // 沒給時產生所有還沒有新版（slot.v2）的格子；--pose=all（預設）或 p1
    const only = a.only ? String(a.only).split(',') : null;
    const poses =
      a.pose && a.pose !== 'all' ? [pose] : card.poses.filter((p) => p.master && p.boxes && p.boxes.face);
    const FR = frameList(card).map((f) => f.id);
    let n = 0;
    for (const po of poses) {
      if (po.fv !== 2 && po.boxes.mouth) {
        po.boxes.mouth0 = po.boxes.mouth;
        po.boxes.mouth = P.widenMouth(po.boxes);
        po.fv = 2;
        await save();
      }
      const exs = exprList(card).filter((e) => e.id === 'neutral' || po.ex[e.id]?.pick);
      for (const e of exs)
        for (const fid of FR) {
          const key = e.id + '.' + fid;
          const tag = po.id + ':' + key;
          if (only ? !only.includes(tag) : po.ex[key]?.v2) continue;
          if (fid[0] === 'e' && P.noBlink(po).includes(e.id)) continue;
          const names = await pipe.variant(card, po.id, key, { n: 1 });
          po.ex[key].pick = names[0];
          po.ex[key].v2 = true;
          delete po.ex[key].skip;
          n++;
          await save();
          console.log('FRAME ' + card.id + ' ' + tag + ' ' + names[0]);
        }
    }
    console.log('產生 ' + n + ' 格');
  } else if (sub === 'publish') {
    const pub = await pipe.publish(card, { keepBase: !!a.keep });
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

// 不用 ComfyUI 的角色指令
const NO_COMFY = new Set([
  'show',
  'new',
  'ref',
  'look',
  'master',
  'box',
  'pick',
  'mark',
  'qa',
  'sheet',
  'status',
  'flag',
  'restore',
]);
async function main() {
  const cmd = process.argv[2];
  const a = parseArgs(3);
  if (cmd === 'projects' || cmd === 'project') return projectCmd(cmd, a);
  const { Comfy } = await lib('comfy.js');
  const c = new Comfy(a.comfy || 'http://127.0.0.1:' + (process.env.COMFY_PORT || 8188));
  if (!(cmd === 'char' && NO_COMFY.has(a._[1]) && !(a._[1] === 'box' && a.auto)) && !(await c.alive()))
    throw new Error('ComfyUI 沒有在執行：先 npm run comfy');
  if (cmd === 'char') return charCmd(a, c);
  return flowCmd(cmd, a, c);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
