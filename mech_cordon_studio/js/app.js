// 立繪工房的網頁（docs/portrait-studio-design.md、docs/portrait-design.md）：透過 mech-cordon-server 的 /api/comfy（ComfyUI）與
// /api/studio（專案與角色資料）。專案 mech_cordon＝遊戲本身（名單＝遊戲的說話者），其他專案的角色由使用者新增
import { Comfy } from './comfy.js';
import { CharStore, StudioStore, LINKED, refName } from './store.js';
import { Pipeline, newCard, newPose, poseOf, noBlink, NO_BLINK } from './pipeline.js';
import * as Q from './qa.js';
import { ROSTER, TIER_NAMES, rosterOf } from './roster.js';
import { exprList, frameList, ALL_FRAMES, EXPRS, EXTRA_LIBRARY } from './expr.js';
import { Portrait, PortraitPack, ACT_NAMES } from './portrait.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const comfy = new Comfy('/api/comfy');
const studio = new StudioStore('');
let store = new CharStore('', LINKED);
const pipe = new Pipeline(comfy, store, (s) => toast(s));
const ST = {
  list: [],
  card: null,
  pid: 'p1',
  tab: 'look',
  busy: false,
  stop: false,
  dev: false,
  proj: LINKED, // 目前的專案
  conf: null, // 專案設定
  projects: [],
};
const linked = () => ST.proj === LINKED;
const FRAMES = () => frameList(ST.card); // 這個角色要做的影格

function toast(msg, err) {
  const d = document.createElement('div');
  d.textContent = msg;
  if (err) d.className = 'err';
  $('log').appendChild(d);
  setTimeout(() => d.remove(), err ? 9000 : 4000);
  while ($('log').children.length > 6) $('log').firstChild.remove();
}

// ---- 工作排隊：一次只跑一件，顯示進度 ----
async function job(label, fn) {
  if (ST.busy) return toast('還有工作在跑');
  ST.busy = true;
  ST.stop = false;
  $('busy').classList.remove('hidden');
  $('busyTxt').textContent = label;
  $('busyBar').style.width = '0';
  document.querySelectorAll('[data-job]').forEach((b) => (b.disabled = true));
  try {
    await fn((p) => {
      if (p.max) $('busyBar').style.width = Math.round((p.value / p.max) * 100) + '%';
    });
  } catch (e) {
    toast(e.message, true);
    console.error(e);
  } finally {
    ST.busy = false;
    $('busy').classList.add('hidden');
    document.querySelectorAll('[data-job]').forEach((b) => (b.disabled = false));
    if (ST.card) await saveCard();
    render();
  }
}
$('busyStop').onclick = () => {
  ST.stop = true;
  comfy.interrupt();
};

async function checkComfy() {
  let ok = false;
  try {
    ok = (await (await fetch('/api/comfy-status')).json()).ok;
  } catch (e) {
    /* 伺服器沒回應 */
  }
  $('comfySt').textContent = ok ? 'ComfyUI：連線中' : 'ComfyUI：沒有在執行（npm run comfy）';
  $('comfySt').className = 'pill ' + (ok ? 'ok' : 'bad');
  // 顯示卡記憶體
  try {
    const g = (await (await fetch('/api/studio/gpu')).json()).gpu;
    $('gpuSt').classList.toggle('hidden', !g);
    if (g) {
      $('gpuSt').textContent = `顯示卡 ${(g.used / 1024).toFixed(1)} / ${(g.total / 1024).toFixed(0)} GB`;
      $('gpuSt').className = 'pill ' + (g.used > g.total * 0.9 ? 'bad' : 'dim');
    }
  } catch (e) {
    /* 伺服器沒回應 */
  }
}

// ---- 角色清單 ----
async function loadList() {
  const r = await store.list();
  ST.list = r.chars;
  ST.dev = r.dev;
  $('devSt').textContent = linked() && r.dev ? '開發模式：定稿寫進 src/assets/characters/' : '';
  $('devSt').classList.toggle('hidden', !$('devSt').textContent);
  renderRoster();
}
function renderRoster() {
  if (!linked()) return renderRosterProj();
  const by = new Map(ST.list.map((c) => [c.id, c]));
  const st = { draft: '討論中', look: '量產中', done: '完成' };
  let h = '';
  const others = ST.list.filter((c) => !rosterOf(c.id)).map((c) => roOf(c.id));
  TIER_NAMES.forEach((tn, t) => {
    const rs = [...ROSTER, ...others].filter((r) => r.tier === t);
    if (!rs.length) return;
    h += `<h4>${tn}</h4>`;
    for (const r of rs) {
      const c = by.get(r.id);
      h += `<button data-id="${r.id}" class="${ST.card?.id === r.id ? 'sel' : ''}"><i style="background:${r.color}"></i>${esc(r.name)}<small>${c ? (c.pub ? '已發佈' : st[c.status] || '') : ''}</small></button>`;
    }
  });
  $('roster').innerHTML = h;
  $('roster')
    .querySelectorAll('button')
    .forEach((b) => (b.onclick = () => openChar(b.dataset.id)));
}
// 使用者自己的專案：角色清單＝已經建立的角色（card.info 是新增時填的性別、年紀、代表色、說明）＋新增角色
function renderRosterProj() {
  const st = { draft: '討論中', look: '量產中', done: '完成' };
  let h = '<button class="add" id="charAdd">＋ 新增角色</button>';
  if (!ST.list.length) h += '<p class="dim" style="padding:0 12px">還沒有角色</p>';
  for (const c of [...ST.list].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))) {
    const col = (c.info && c.info.color) || '#888';
    h += `<button data-id="${c.id}" class="${ST.card?.id === c.id ? 'sel' : ''}"><i style="background:${esc(col)}"></i>${esc(c.name)}<small>${c.pub ? '已發佈' : st[c.status] || ''}</small></button>`;
  }
  $('roster').innerHTML = h;
  $('roster')
    .querySelectorAll('button[data-id]')
    .forEach((b) => (b.onclick = () => openChar(b.dataset.id)));
  $('charAdd').onclick = () => {
    for (const k of ['ncId', 'ncName', 'ncAge', 'ncNote']) $(k).value = '';
    $('ncSex').value = '';
    $('charDlg').showModal();
  };
}
// 名單以外的角色（測試用、之後新增的）也能開：放在「其他」
const roOf = (id) => {
  const c = ST.list.find((x) => x.id === id);
  if (!linked()) {
    if (!c) return null;
    const I = c.info || {};
    return {
      id,
      name: c.name || id,
      tier: 3,
      sex: I.sex || '',
      age: I.age || '',
      color: I.color || '#888',
      note: I.note || '',
    };
  }
  return (
    rosterOf(id) ||
    (c && { id, name: c.name || id, tier: 3, sex: '', age: '', color: '#888', note: '名單以外的角色' })
  );
};
async function openChar(id) {
  if (ST.busy) return toast('工作跑完再換角色');
  const r = roOf(id);
  if (!r) return;
  ST.card = (await store.getCard(id)) || newCard(r);
  ST.pid = ST.card.poses[0].id;
  $('empty').classList.add('hidden');
  $('charPane').classList.remove('hidden');
  $('cName').textContent = r.name;
  $('cNote').textContent = [r.sex === 'f' ? '女' : r.sex === 'm' ? '男' : '', r.age, r.note]
    .filter(Boolean)
    .join('・');
  charHead();
  AU.cid = null;
  AU.s = null;
  autoPoll();
  if (location.hash.slice(1) !== hashOf(id)) history.replaceState(null, '', '#' + hashOf(id));
  renderRoster();
  render();
}
// 角色的下載與刪除（遊戲的角色不能從這裡刪）
function charHead() {
  const C = ST.card;
  if (!C) return;
  const has = ST.list.some((c) => c.id === C.id);
  $('cDlWork').href = studio.zipUrl(ST.proj, { char: C.id });
  $('cDlOut').href = studio.zipUrl(ST.proj, { char: C.id, what: 'out' });
  $('cDlWork').classList.toggle('off', !has);
  $('cDlOut').classList.toggle('off', !C.pub);
  $('cDlMore').disabled = !C.pub;
  $('cDel').classList.toggle('hidden', linked());
}
$('cDel').onclick = async () => {
  const C = ST.card;
  if (ST.busy || !C) return;
  const ans = prompt(
    `刪除「${C.name}」的全部資料（角色卡、候選、參考圖、發佈），不能復原。\n要刪除請輸入角色代號 ${C.id}：`,
  );
  if (ans !== C.id) return;
  await store.delChar(C.id);
  ST.card = null;
  $('charPane').classList.add('hidden');
  $('empty').classList.remove('hidden');
  history.replaceState(null, '', '#' + ST.proj + '/');
  await loadList();
  toast('已刪除');
};
async function saveCard() {
  await store.putCard(ST.card);
  const i = ST.list.findIndex((c) => c.id === ST.card.id);
  const s = {
    id: ST.card.id,
    name: ST.card.name,
    status: ST.card.status,
    pub: !!ST.card.pub,
    info: ST.card.info || null,
  };
  if (i < 0) ST.list.push(s);
  else ST.list[i] = s;
  renderRoster();
  charHead();
}
const pose = () => poseOf(ST.card, ST.pid);

// ---- 分頁 ----
$('tabs').onclick = (e) => {
  const t = e.target.dataset.tab;
  if (!t) return;
  ST.tab = t;
  render();
};
$('cStatus').onchange = async () => {
  ST.card.status = $('cStatus').value;
  await saveCard();
};
$('poseSel').onchange = () => {
  ST.pid = $('poseSel').value;
  render();
};
$('poseAdd').onclick = async () => {
  const n = ST.card.poses.length + 1;
  const p = newPose('p' + n, '姿勢 ' + n);
  ST.card.poses.push(p);
  ST.pid = p.id;
  await saveCard();
  render();
};
$('poseName').onchange = async () => {
  pose().name = $('poseName').value.trim() || pose().name;
  await saveCard();
  render();
};

function render() {
  const C = ST.card;
  if (ST.tab === 'scene') {
    // 場景插畫不屬於哪一個角色
    document
      .querySelectorAll('#tabs button')
      .forEach((b) => b.classList.toggle('on', b.dataset.tab === ST.tab));
    document.querySelectorAll('.tab').forEach((d) => d.classList.toggle('hidden', d.id !== 't-scene'));
    document.querySelector('.poseBar').classList.add('hidden');
    return renderScene();
  }
  if (!C) return;
  $('tabScene').classList.toggle('hidden', !linked());
  document
    .querySelectorAll('#tabs button')
    .forEach((b) => b.classList.toggle('on', b.dataset.tab === ST.tab));
  document.querySelectorAll('.tab').forEach((d) => d.classList.toggle('hidden', d.id !== 't-' + ST.tab));
  $('cStatus').value = C.status;
  $('poseSel').innerHTML = C.poses.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('poseSel').value = ST.pid;
  $('poseName').value = pose().name;
  document.querySelector('.poseBar').classList.toggle('hidden', ST.tab === 'look' || ST.tab === 'publish');
  ({
    look: renderLook,
    master: renderMaster,
    boxes: renderBoxes,
    expr: renderExpr,
    frames: renderFrames,
    preview: renderPreview,
    publish: renderPublish,
    qa: renderQa,
  })[ST.tab]();
  if (AU.cid === C.id) autoView(AU.s || {});
}

// ---- 1 外觀 ----
function renderLook() {
  const L = ST.card.look;
  $('lookZh').value = L.zh || '';
  $('lookPrompt').value = L.prompt || '';
  $('lookNeg').value = L.neg || '';
  $('lookExtra').value = (ST.card.extraExprs || []).map((e) => `${e.id}|${e.name}|${e.prompt}`).join('\n');
  chkRow($('lookBase'), BASE_EX, ST.card.baseExprs);
  chkRow($('lookFrames'), ALL_FRAMES, ST.card.frames);
  $('refs').innerHTML = ST.card.refs
    .map(
      (f) =>
        `<div class="it"><a href="${store.workUrl(ST.card.id, f)}" target="_blank"><img src="${store.workUrl(ST.card.id, f)}"></a><button class="x" data-f="${esc(f)}" title="刪除">✕</button></div>`,
    )
    .join('');
  $('refs')
    .querySelectorAll('.x')
    .forEach(
      (b) =>
        (b.onclick = async () => {
          ST.card.refs = ST.card.refs.filter((f) => f !== b.dataset.f);
          await store.delWork(ST.card.id, b.dataset.f);
          await saveCard();
          render();
        }),
    );
}
$('lookSave').onclick = async () => {
  const C = ST.card;
  C.look = { zh: $('lookZh').value, prompt: $('lookPrompt').value.trim(), neg: $('lookNeg').value.trim() };
  C.extraExprs = $('lookExtra')
    .value.split('\n')
    .map((l) => l.split('|').map((s) => s.trim()))
    .filter((a) => a.length >= 3 && /^[a-z][a-z0-9_]*$/.test(a[0]))
    .map(([id, name, ...p]) => ({ id, name, prompt: p.join('|') }));
  setOrAll(C, 'baseExprs', chkVal($('lookBase')), BASE_EX);
  setOrAll(C, 'frames', chkVal($('lookFrames')), ALL_FRAMES);
  await saveCard();
  toast('已儲存');
};
// 角色的參考圖：拖曳或選檔案（伺服器把 PNG／JPG 轉成 WebP）
async function addRefs(list) {
  const C = ST.card;
  let n = 0;
  for (const f of list) {
    const b = await imgBytes(f);
    if (!b) {
      toast(`${f.name}：不是圖片`, true);
      continue;
    }
    const name = refName();
    await store.putWork(C.id, name, b);
    C.refs.push(name);
    n++;
  }
  if (!n) return;
  await saveCard();
  render();
  toast(`加入 ${n} 張參考圖`);
}
dropZone($('refDrop'), $('refFile'), (fl) => ST.card && addRefs(fl));

// ---- 2 主圖 ----
function renderMaster() {
  const P = pose();
  fixRender();
  $('posePrompt').value = P.prompt;
  $('cands').innerHTML = P.cands
    .map(
      (c) =>
        `<div class="it ${P.master === c.file ? 'pick' : ''}" data-f="${esc(c.file)}"><img loading="lazy" src="${store.workUrl(ST.card.id, c.file)}"><span>${c.fix ? '修正 ' : ''}${c.seed}${P.master === c.file ? '　主圖' : ''}</span></div>`,
    )
    .join('');
  $('cands')
    .querySelectorAll('.it')
    .forEach(
      (d) =>
        (d.onclick = async () => {
          if (ST.busy) return;
          const c = P.cands.find((x) => x.file === d.dataset.f);
          if (P.master && P.master !== c.file && Object.keys(P.ex).length) {
            if (!confirm('換主圖之後，這個姿勢已經做的表情與影格都要重做。確定嗎？')) return;
            P.ex = {};
          }
          if (P.master !== c.file && !c.fix) {
            // 換成別張（不是局部修正的）：框與保留區是舊主圖的位置，清掉（自動完成會重新偵測）
            P.boxes = {};
            for (const k of ['autoBox', 'fv', 'keepOut', 'eyeKeepOut']) delete P[k];
          }
          P.master = c.file;
          P.seed = c.seed;
          await saveCard();
          render();
        }),
    );
}
$('posePrompt').onchange = async () => {
  pose().prompt = $('posePrompt').value.trim();
  await saveCard();
};
$('candGo').dataset.job = 1;
$('candGo').onclick = () =>
  job('產生主圖候選', async (onProgress) => {
    if (!ST.card.look.prompt) throw new Error('先在「外觀」填給模型的標籤');
    const n = Math.max(1, Math.min(16, +$('candN').value || 4));
    for (let i = 0; i < n && !ST.stop; i++) {
      await pipe.candidates(ST.card, ST.pid, { n: 1, onProgress });
      await saveCard();
      render();
    }
  });

// ---- 3 標框、保留區與旗標（docs/portrait-qa-workflow.md 第三、六節；立繪工房第 4 期在網頁上改）----
const BOX_COL = { face: '#7fc8ff', eyes: '#ffb020', mouth: '#ff6bd5', keep: '#ff4040', eyekeep: '#c070ff' };
let boxImg = null;
let drag = null;
function renderBoxes() {
  const P = pose();
  const cv = $('boxCv');
  renderFlags();
  if (!P.master) {
    cv.width = 1;
    return toast('先選定主圖');
  }
  const url = store.workUrl(ST.card.id, P.master);
  if (!boxImg || boxImg.dataset.url !== url) {
    boxImg = new Image();
    boxImg.dataset.url = url;
    boxImg.onload = drawBoxes;
    boxImg.src = url;
  } else drawBoxes();
}
function drawBoxes() {
  const cv = $('boxCv');
  const P = pose();
  cv.width = boxImg.width;
  cv.height = boxImg.height;
  cv.style.width = Math.min(boxImg.width, 760) + 'px';
  const g = cv.getContext('2d');
  g.drawImage(boxImg, 0, 0);
  const rect = (b, col, dash) => {
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.setLineDash(dash ? [8, 5] : []);
    g.strokeRect(b[0], b[1], b[2], b[3]);
  };
  for (const k of ['face', 'eyes', 'mouth']) {
    const b = drag && drag.k === k ? drag.b : P.boxes[k];
    if (b) rect(b, BOX_COL[k]);
  }
  for (const b of P.keepOut || []) rect(b, BOX_COL.keep, true);
  for (const b of P.eyeKeepOut || []) rect(b, BOX_COL.eyekeep, true);
  if (drag && (drag.k === 'keep' || drag.k === 'eyekeep')) rect(drag.b, BOX_COL[drag.k], true);
  g.setLineDash([]);
}
const cvPos = (e) => {
  const cv = $('boxCv');
  const r = cv.getBoundingClientRect();
  return [((e.clientX - r.left) * cv.width) / r.width, ((e.clientY - r.top) * cv.height) / r.height];
};
$('boxCv').onpointerdown = (e) => {
  const k = document.querySelector('input[name=box]:checked').value;
  const p = cvPos(e);
  drag = { k, p0: p, b: [p[0], p[1], 1, 1] };
  $('boxCv').setPointerCapture(e.pointerId);
};
$('boxCv').onpointermove = (e) => {
  if (!drag) return;
  const p = cvPos(e);
  const x = Math.min(p[0], drag.p0[0]);
  const y = Math.min(p[1], drag.p0[1]);
  drag.b = [x, y, Math.abs(p[0] - drag.p0[0]), Math.abs(p[1] - drag.p0[1])].map((v) => Math.round(v / 2) * 2);
  drawBoxes();
};
$('boxCv').onpointerup = () => {
  const P = pose();
  if (drag && drag.b[2] > 4 && drag.b[3] > 4) {
    if (drag.k === 'keep') (P.keepOut ||= []).push(drag.b);
    else if (drag.k === 'eyekeep') (P.eyeKeepOut ||= []).push(drag.b);
    else {
      P.boxes[drag.k] = drag.b;
      // 手改了嘴框：重新放大（影格用的）
      if (drag.k === 'mouth') {
        delete P.boxes.mouth0;
        delete P.fv;
      }
    }
  }
  drag = null;
  drawBoxes();
  renderFlags();
};
$('boxSave').onclick = async () => {
  await saveCard();
  toast('框與保留區已儲存');
};
$('boxAuto').onclick = () =>
  job('自動偵測臉、眼睛、嘴', async (onProgress) => {
    const { detectBoxes } = await import('./auto.js');
    const b = await detectBoxes(pipe, ST.card, ST.pid, { onProgress });
    const P = pose();
    P.boxes = { face: b.face, eyes: b.eyes, mouth: b.mouth };
    P.autoBox = b.info;
    delete P.fv;
    toast(`找到臉、${b.info.eyeN} 隻眼睛、嘴（${b.info.mouth === 'green' ? '塗綠找到' : '照比例推算'}）`);
  });
// 保留區清單與每個表情的旗標
function renderFlags() {
  const C = ST.card;
  const P = pose();
  const keeps = [
    ...(P.keepOut || []).map((b, i) => ['keepOut', i, b, '保留區']),
    ...(P.eyeKeepOut || []).map((b, i) => ['eyeKeepOut', i, b, '只在眨眼']),
  ];
  $('keepList').innerHTML = keeps.length
    ? keeps
        .map(
          ([k, i, b, n]) =>
            `<div>${n} ${b.join(', ')} <button data-k="${k}" data-i="${i}" title="刪除">✕</button></div>`,
        )
        .join('')
    : '沒有';
  $('keepList')
    .querySelectorAll('button')
    .forEach(
      (x) =>
        (x.onclick = () => {
          P[x.dataset.k].splice(+x.dataset.i, 1);
          drawBoxes();
          renderFlags();
        }),
    );
  $('flagGlasses').value = C.glasses === true ? '1' : C.glasses === false ? '0' : '';
  const nb = P.noBlink || [];
  const tri = (v) => (v === true ? '1' : v === false ? '0' : '');
  $('flagTbl').innerHTML =
    '<tr><th>表情</th><th>不眨眼</th><th>說話帶笑</th><th>底圖張嘴</th></tr>' +
    exprList(C)
      .map((e) => {
        const x = P.ex[e.id] || {};
        const fixed = NO_BLINK.includes(e.id);
        return `<tr data-e="${e.id}"><td>${esc(e.name)}</td>
          <td><input type="checkbox" data-f="nb" ${fixed || nb.includes(e.id) ? 'checked' : ''} ${fixed ? 'disabled title="一律不眨眼"' : ''}></td>
          <td><select data-f="smile"><option value="">自動</option><option value="1">是</option><option value="0">否</option></select></td>
          <td><input type="checkbox" data-f="open" ${x.open ? 'checked' : ''}></td></tr>`;
      })
      .join('');
  $('flagTbl')
    .querySelectorAll('tr[data-e]')
    .forEach((tr) => {
      const e = tr.dataset.e;
      const sel = tr.querySelector('[data-f=smile]');
      sel.value = tri(P.ex[e]?.smile);
      sel.onchange = () => {
        const x = (P.ex[e] ||= {});
        if (sel.value === '') delete x.smile;
        else x.smile = sel.value === '1';
      };
      tr.querySelector('[data-f=nb]').onchange = (ev) => {
        const s = new Set(P.noBlink || []);
        if (ev.target.checked) s.add(e);
        else s.delete(e);
        P.noBlink = [...s];
      };
      tr.querySelector('[data-f=open]').onchange = (ev) => {
        const x = (P.ex[e] ||= {});
        if (ev.target.checked) x.open = true;
        else delete x.open;
      };
    });
}
$('flagGlasses').onchange = () => {
  const v = $('flagGlasses').value;
  if (v === '') delete ST.card.glasses;
  else ST.card.glasses = v === '1';
};

// ---- 4 表情、5 影格：一列一個（表情或影格），候選以框的範圍放大顯示 ----
// 主圖一律 832 寬（txt2img 的預設）；換尺寸時這裡跟著改
const IMG_W = 832;
function cropDiv(file, box, sel, W = 140, H = 120) {
  const [x, y, w, h] = box || [0, 0, IMG_W, 1216];
  const pad = 0.15;
  const bx = x - w * pad,
    by = y - h * pad,
    bw = w * (1 + pad * 2),
    bh = h * (1 + pad * 2);
  const k = Math.min(W / bw, H / bh);
  return `<div class="crop ${sel ? 'pick' : ''}" data-f="${esc(file)}" style="width:${Math.round(bw * k)}px;height:${Math.round(bh * k)}px;background-image:url('${store.workUrl(ST.card.id, file)}');background-size:${Math.round(IMG_W * k)}px auto;background-position:${Math.round(-bx * k)}px ${Math.round(-by * k)}px"></div>`;
}
function rowHtml(key, label, sub, box, base) {
  const P = pose();
  const s = P.ex[key] || { cands: [] };
  const cands = (s.cands || []).map((f) => cropDiv(f, box, s.pick === f)).join('');
  const baseH = base ? `<div title="底圖">${cropDiv(base, box, false, 70, 60)}</div>` : '';
  return `<div class="row"><div class="lbl"><b>${esc(label)}</b><span class="dim">${esc(sub)}</span><br><button data-job="1" data-gen="${key}">產生</button></div>${baseH}<div class="cands" data-key="${key}">${cands || '<span class="dim">還沒有候選</span>'}</div></div>`;
}
function bindRows(root) {
  root.querySelectorAll('[data-gen]').forEach(
    (b) =>
      (b.onclick = () => {
        const key = b.dataset.gen;
        const n = +(ST.tab === 'expr' ? $('exN') : $('frN')).value || 2;
        job(`產生 ${key}`, (onProgress) => pipe.variant(ST.card, ST.pid, key, { n, onProgress }));
      }),
  );
  root.querySelectorAll('.cands').forEach((c) =>
    c.querySelectorAll('.crop').forEach(
      (d) =>
        (d.onclick = async () => {
          const s = pose().ex[c.dataset.key];
          s.pick = s.pick === d.dataset.f ? null : d.dataset.f;
          if (!c.dataset.key.includes('.')) {
            delete s.mb; // 換了表情：自動完成時重量它的嘴框
            delete s.mbDone;
          }
          await saveCard();
          render();
        }),
    ),
  );
}
function renderExpr() {
  const P = pose();
  $('refine').value = P.refine;
  if (!P.master) return ($('exRows').innerHTML = '<p class="dim">先選定主圖並標框</p>');
  $('exRows').innerHTML = exprList(ST.card)
    .filter((e) => e.id !== 'neutral')
    .map((e) => rowHtml(e.id, e.name, e.id, P.boxes.face, P.master))
    .join('');
  bindRows($('exRows'));
}
$('refine').onchange = async () => {
  pose().refine = Math.max(0, Math.min(0.5, +$('refine').value || 0));
  await saveCard();
};
async function genMissing(keys) {
  const n = +(ST.tab === 'expr' ? $('exN') : $('frN')).value || 2;
  await job('產生全部還沒選的', async (onProgress) => {
    for (const k of keys) {
      if (ST.stop) break;
      const s = pose().ex[k];
      if (s && s.pick) continue;
      try {
        await pipe.variant(ST.card, ST.pid, k, { n, onProgress });
      } catch (e) {
        toast(`${k}：${e.message}`, true);
      }
      await saveCard();
      render();
    }
  });
}
$('exAll').dataset.job = 1;
$('exAll').onclick = () =>
  genMissing(
    exprList(ST.card)
      .filter((e) => e.id !== 'neutral')
      .map((e) => e.id),
  );
function frameKeys() {
  const P = pose();
  const out = [];
  for (const e of exprList(ST.card)) {
    if (e.id !== 'neutral' && !P.ex[e.id]?.pick) continue;
    for (const f of FRAMES()) out.push(`${e.id}.${f.id}`);
  }
  return out;
}
function renderFrames() {
  const P = pose();
  if (!P.master) return ($('frRows').innerHTML = '<p class="dim">先選定主圖並標框</p>');
  let h = '';
  for (const e of exprList(ST.card)) {
    const base = e.id === 'neutral' ? P.master : P.ex[e.id]?.pick;
    if (!base) continue;
    h += `<h3>${esc(e.name)}</h3>`;
    for (const f of FRAMES())
      h += rowHtml(
        `${e.id}.${f.id}`,
        f.name,
        `${e.id}.${f.id}`,
        f.id[0] === 'e' ? P.boxes.eyes : P.boxes.mouth,
        base,
      );
  }
  $('frRows').innerHTML = h || '<p class="dim">先選定表情</p>';
  bindRows($('frRows'));
}
$('frAll').dataset.job = 1;
$('frAll').onclick = () => genMissing(frameKeys());

// ---- 6 預覽 ----
let pv = null;
let pvRaf = 0;
async function renderPreview() {
  const C = ST.card;
  cancelAnimationFrame(pvRaf);
  if (!C.pub) {
    $('pvExpr').innerHTML = '<span class="dim">還沒有發佈過</span>';
    return;
  }
  const pk = await PortraitPack.load(C.pub, (n) => store.fileUrl(C.id, n) + '?t=' + C.pub.t);
  pv = new Portrait(pk, ST.pid);
  const P = pk.pose(ST.pid);
  $('pvExpr').innerHTML = exprList(C)
    .filter((e) => P.ex[e.id])
    .map((e) => `<button data-e="${e.id}" class="${e.id === 'neutral' ? 'on' : ''}">${esc(e.name)}</button>`)
    .join('');
  $('pvExpr')
    .querySelectorAll('button')
    .forEach(
      (b) =>
        (b.onclick = () => {
          pv.setExpr(b.dataset.e);
          $('pvExpr')
            .querySelectorAll('button')
            .forEach((x) => x.classList.toggle('on', x === b));
        }),
    );
  $('pvAct').innerHTML = Object.entries(ACT_NAMES)
    .map(([k, n]) => `<button data-a="${k}">${n}</button>`)
    .join('');
  $('pvAct')
    .querySelectorAll('button')
    .forEach((b) => (b.onclick = () => pv.act(b.dataset.a)));
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    pv.talkSim($('pvTalk').checked);
    pv.update(dt);
    for (const [id, fit] of [
      ['pvComm', 'bust'],
      ['pvFull', 'full'],
      ['pvCut', 'face'],
    ]) {
      const cv = $(id);
      const g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      pv.draw(g, cv.width, cv.height, { fit });
    }
    if (ST.tab === 'preview') pvRaf = requestAnimationFrame(tick);
  };
  pvRaf = requestAnimationFrame(tick);
}

// ---- 7 發佈 ----
async function renderPublish() {
  const C = ST.card;
  if (!C.pub) return ($('pubInfo').innerHTML = '<p class="dim">還沒有發佈過</p>');
  const files = await store.listFiles(C.id);
  const tot = files.reduce((a, f) => a + f.size, 0);
  $('pubInfo').innerHTML =
    `<p>上次發佈：${new Date(C.pub.t).toLocaleString('zh-TW')}，${files.length} 個檔案，共 ${(tot / 1024).toFixed(0)} KB</p>` +
    `<table><tr><th>檔案</th><th>大小</th></tr>${files.map((f) => `<tr><td>${esc(f.name)}</td><td>${(f.size / 1024).toFixed(1)} KB</td></tr>`).join('')}</table>`;
}
$('pubGo').dataset.job = 1;
$('pubGo').onclick = () =>
  job('發佈', async (onProgress) => {
    await pipe.publish(ST.card, { onProgress });
    toast('已發佈');
  });

// ---- 場景插畫（過場的 2D 舞台，docs/cine-redesign-design.md 第 2 期；和 scripts/cine-art.js 同一份資料）----
const SC = { data: null };
async function renderScene() {
  try {
    SC.data = await (await fetch('/api/cineart')).json();
  } catch (e) {
    SC.data = null;
  }
  const D = SC.data;
  if (!D || !D.scenes) return ($('scList').innerHTML = '<p class="dim">讀不到場景插畫（只在開發模式）</p>');
  $('scList').innerHTML = Object.entries(D.scenes)
    .map(([id, S]) => {
      const cands = (D.cands[id] || []).sort();
      const kind = S.char
        ? `角色 ${esc(S.char.id)}／${esc(S.char.pose || 'p1')} ＋ 背景 ${esc(S.bg)}`
        : '文字生圖';
      return `<div class="scItem" data-id="${esc(id)}">
        <h3>${esc(id)} <small class="dim">第 ${S.ch} 章　${kind}${S.pick ? '　選定 ' + S.pick : ''}${S.tone ? '　單色 ' + esc(S.tone) : ''}</small></h3>
        <textarea data-f="${S.char ? 'edit' : 'prompt'}" rows="3" style="width:100%">${esc(S.char ? S.edit : S.prompt)}</textarea>
        <p><button data-job="1" data-gen="${esc(id)}">產生</button> <input type="number" value="2" min="1" max="8" style="width:4em" data-n />
        ${S.pick ? `<a href="/api/cineart/out/c${S.ch}/${esc(id)}.webp?${Date.now()}" target="_blank">看選定的</a>` : ''}</p>
        <div class="scCands">${cands
          .map(
            (f) =>
              `<figure class="${S.pick && f === S.pick + '.png' ? 'sel' : ''}"><img src="/api/cineart/work/${esc(id)}/${f}" loading="lazy" style="width:320px" />
              <figcaption>${f.replace('.png', '')} <button data-pick="${f.replace('.png', '')}">選定</button></figcaption></figure>`,
          )
          .join('')}</div></div>`;
    })
    .join('');
  for (const box of $('scList').querySelectorAll('.scItem')) {
    const id = box.dataset.id;
    const ta = box.querySelector('textarea');
    ta.onchange = async () => {
      SC.data.scenes[id][ta.dataset.f] = ta.value;
      await fetch('/api/cineart', { method: 'PUT', body: JSON.stringify(SC.data.scenes) });
    };
    box.querySelector('[data-gen]').onclick = () =>
      job('場景插畫 ' + id, () => sceneGen(id, +box.querySelector('[data-n]').value || 2));
    for (const b of box.querySelectorAll('[data-pick]'))
      b.onclick = () =>
        job('選定 ' + id, async () => {
          const r = await fetch(`/api/cineart/pick/${id}/${b.dataset.pick}`, { method: 'POST' });
          if (!r.ok) throw new Error((await r.json()).error || '選定失敗');
          toast('已選定（重新建置後遊戲就有）');
        });
  }
}
// 圖片網址 → PNG（透明的地方鋪灰底：Qwen 不吃透明）
async function pngOf(url, bg) {
  const im = new Image();
  im.src = url;
  await im.decode();
  const c = document.createElement('canvas');
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const g = c.getContext('2d');
  if (bg) {
    g.fillStyle = bg;
    g.fillRect(0, 0, c.width, c.height);
  }
  g.drawImage(im, 0, 0);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
async function sceneGen(id, n) {
  const W = await import('./workflows.js');
  const S = SC.data.scenes[id];
  let build;
  if (S.char) {
    const B = SC.data.scenes[S.bg];
    if (!B || !B.pick) throw new Error('先選定背景 ' + S.bg);
    const bg = await comfy.upload(
      await pngOf(`/api/cineart/out/c${B.ch}/${S.bg}.webp`),
      `cineart_${S.bg}.png`,
    );
    const pose = S.char.pose || 'p1';
    const ch = await comfy.upload(
      await pngOf(`/api/chars/${S.char.id}/file/${pose}.webp`, '#9a9a9a'),
      `cineart_${S.char.id}_${pose}.png`,
    );
    build = (seed) =>
      W.qwenEdit({ images: [bg, ch], prompt: S.edit, seed, steps: S.steps || 4, prefix: 'cineart/' + id });
  } else
    build = (seed) =>
      W.txt2img({
        prompt: [S.prompt, W.STYLE].join(', '),
        neg: S.neg || '',
        seed,
        w: S.w || 1344,
        h: S.h || 768,
        steps: S.steps || 30,
        cfg: S.cfg || 5.5,
        prefix: 'cineart/' + id,
      });
  for (let i = 0; i < n && !ST.stop; i++) {
    const seed = Math.floor(Math.random() * 1e9);
    const out = await comfy.run(build(seed));
    const buf = await comfy.view(out[out.length - 1]);
    await fetch(`/api/cineart/work/${id}/${seed}.png`, { method: 'PUT', body: buf });
    toast(`${id}：種子 ${seed}`);
  }
}

// ---- 啟動 ----
if (new URLSearchParams(location.search).has('from')) $('back').href = '/';
checkComfy();
setInterval(checkComfy, 10000);
// 網址的 #專案/角色（遊戲的專案也可以只寫 #角色）直接開那個角色（載入時與之後改 # 時）
const parseHash = () => {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return { p: null, c: '' };
  if (h.includes('/')) {
    const [p, c] = h.split('/');
    return { p: p || LINKED, c };
  }
  return { p: LINKED, c: h };
};
const openHash = async () => {
  const { p, c } = parseHash();
  if (p && p !== ST.proj && ST.projects.some((x) => x.id === p)) await useProject(p);
  if (c && roOf(c) && ST.card?.id !== c) await openChar(c);
};
window.addEventListener('hashchange', () => openHash().catch((e) => toast(e.message, true)));
let proj0 = parseHash().p;
try {
  proj0 = proj0 || localStorage.getItem('mech_cordon_studio_proj');
} catch (e) {
  /* 不能用 localStorage */
}
loadProjects(proj0 || LINKED)
  .then(openHash)
  .catch((e) => toast('讀不到專案或角色清單：' + e.message, true));

// ---- 專案（docs/portrait-studio-design.md）----
function hashOf(cid) {
  return linked() ? cid : `${ST.proj}/${cid}`;
}
// 拖曳上傳的框：拖進來或點一下開檔案選擇
function dropZone(el, input, onFiles) {
  el.onclick = () => input.click();
  input.onchange = () => {
    const fl = [...input.files];
    input.value = '';
    if (fl.length) onFiles(fl);
  };
  el.ondragover = (e) => {
    e.preventDefault();
    el.classList.add('over');
  };
  el.ondragleave = () => el.classList.remove('over');
  el.ondrop = (e) => {
    e.preventDefault();
    el.classList.remove('over');
    const fl = [...e.dataTransfer.files].filter(
      (f) => /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(f.name),
    );
    if (fl.length) onFiles(fl);
    else toast('拖進來的不是圖片', true);
  };
}
// 上傳的圖：PNG／JPG／WebP 照原樣（伺服器把 PNG／JPG 轉成 WebP），其他格式（GIF、BMP、AVIF…）在瀏覽器轉成 PNG
async function imgBytes(f) {
  const b = new Uint8Array(await f.arrayBuffer());
  const png = b[0] === 0x89 && b[1] === 0x50;
  const jpg = b[0] === 0xff && b[1] === 0xd8;
  const webp = b.length > 12 && String.fromCharCode(...b.slice(8, 12)) === 'WEBP';
  if (png || jpg || webp) return b;
  try {
    const bm = await createImageBitmap(f);
    const c = document.createElement('canvas');
    c.width = bm.width;
    c.height = bm.height;
    c.getContext('2d').drawImage(bm, 0, 0);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());
  } catch (e) {
    return null;
  }
}
async function loadProjects(want) {
  const r = await studio.projects();
  ST.projects = r.projects;
  $('projSel').innerHTML = ST.projects
    .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.chars ? `（${p.chars}）` : ''}</option>`)
    .join('');
  await useProject(ST.projects.some((p) => p.id === want) ? want : LINKED);
}
async function useProject(pid) {
  if (ST.busy) throw new Error('工作跑完再換專案');
  ST.proj = pid;
  ST.conf = await studio.get(pid);
  store = new CharStore('', pid);
  pipe.store = store;
  pipe.project = linked() ? null : ST.conf; // 遊戲的專案照程式的預設（絕區零）
  pipe.up.clear();
  $('projSel').value = pid;
  try {
    localStorage.setItem('mech_cordon_studio_proj', pid);
  } catch (e) {
    /* 不能用 localStorage */
  }
  ST.card = null;
  $('charPane').classList.add('hidden');
  $('empty').classList.remove('hidden');
  $('empty').textContent = linked() ? '從左邊選一個角色' : '從左邊選一個角色，或「＋ 新增角色」';
  await loadList();
}
$('projSel').onchange = async () => {
  try {
    await useProject($('projSel').value);
    history.replaceState(null, '', linked() ? '#' : '#' + ST.proj + '/');
  } catch (e) {
    toast(e.message, true);
    $('projSel').value = ST.proj;
  }
};

// 專案的對話框：設定、專案的參考圖、下載與匯入、刪除、新增專案
async function renderProj() {
  const C = ST.conf;
  const st = C.style || {};
  $('pjName').textContent = C.name;
  $('pjLinked').classList.toggle('hidden', !linked());
  $('pjConf').classList.toggle('hidden', linked());
  $('pjDelP').classList.toggle('hidden', linked());
  $('pjN').value = C.name || '';
  $('pjNote').value = C.note || '';
  $('pjStyle').value = st.prompt || '';
  $('pjNeg').value = st.neg || '';
  $('pjW').value = st.w || 832;
  $('pjH').value = st.h || 1216;
  $('pjPose').value = C.pose || '';
  $('pjQ').value = (C.out && C.out.quality) || 88;
  chkRow($('pjBase'), BASE_EX, C.base);
  chkRow($('pjFrames'), ALL_FRAMES, C.frames);
  $('pjExtra').value = (C.extra || []).map((e) => `${e.id}|${e.name}|${e.prompt}`).join('\n');
  $('pjDlWork').href = studio.zipUrl(ST.proj);
  $('pjDlOut').href = studio.zipUrl(ST.proj, { what: 'out' });
  $('pjDlFull').href = studio.zipUrl(ST.proj, { what: 'full' });
  $('pjDlAtlas').href = studio.zipUrl(ST.proj, { what: 'atlas' });
  const refs = await studio.refs(ST.proj);
  $('pjRefs').innerHTML = refs.length
    ? refs
        .map(
          (f) =>
            `<div class="it"><a href="${studio.refUrl(ST.proj, f.name)}" target="_blank"><img src="${studio.refUrl(ST.proj, f.name)}"></a><button class="x" type="button" data-f="${esc(f.name)}" title="刪除">✕</button></div>`,
        )
        .join('')
    : '<span class="dim">還沒有</span>';
  $('pjRefs')
    .querySelectorAll('.x')
    .forEach(
      (b) =>
        (b.onclick = async () => {
          await studio.delRef(ST.proj, b.dataset.f);
          renderProj();
        }),
    );
}
$('projBtn').onclick = async () => {
  try {
    await renderProj();
  } catch (e) {
    toast(e.message, true);
  }
  $('projDlg').showModal();
};
$('pjSave').onclick = async () => {
  const C = { ...ST.conf };
  C.name = $('pjN').value.trim() || C.id;
  C.note = $('pjNote').value.trim();
  C.style = {
    ...(C.style || {}),
    prompt: $('pjStyle').value.trim(),
    neg: $('pjNeg').value.trim(),
    w: Math.max(512, Math.min(1536, Math.round((+$('pjW').value || 832) / 64) * 64)),
    h: Math.max(512, Math.min(1536, Math.round((+$('pjH').value || 1216) / 64) * 64)),
  };
  C.pose = $('pjPose').value.trim();
  C.out = { ...(C.out || {}), quality: Math.max(50, Math.min(100, Math.round(+$('pjQ').value || 88))) };
  setOrAll(C, 'base', chkVal($('pjBase')), BASE_EX);
  setOrAll(C, 'frames', chkVal($('pjFrames')), ALL_FRAMES);
  C.extra = parseExtra($('pjExtra').value);
  try {
    await studio.put(C);
    ST.conf = await studio.get(ST.proj);
    pipe.project = ST.conf;
    const cur = ST.proj;
    await loadProjects(cur);
    await renderProj();
    toast('專案設定已儲存');
  } catch (e) {
    toast(e.message, true);
  }
};
dropZone($('pjDrop'), $('pjRefFile'), async (fl) => {
  let n = 0;
  for (const f of fl) {
    const b = await imgBytes(f);
    if (!b) continue;
    await studio.putRef(ST.proj, refName(), b);
    n++;
  }
  await renderProj();
  toast(`加入 ${n} 張專案的參考圖`);
});
async function importZip(pid, file) {
  if (ST.busy) return toast('還有工作在跑');
  toast(`匯入 ${file.name}（${(file.size / 1048576).toFixed(1)} MB）…`);
  const r = await studio.importZip(pid, file);
  toast(
    `匯入完成：${r.chars.length} 個角色、${r.files} 個檔案${r.skipped ? `（略過 ${r.skipped} 個不認得的）` : ''}`,
  );
  await loadProjects(pid);
  if (r.chars.length === 1) await openChar(r.chars[0]);
}
$('pjImp').onclick = () => $('pjImpFile').click();
$('pjImpFile').onchange = async () => {
  const f = $('pjImpFile').files[0];
  $('pjImpFile').value = '';
  if (!f) return;
  try {
    await importZip(ST.proj, f);
    $('projDlg').close();
  } catch (e) {
    toast(e.message, true);
  }
};
$('pjDel').onclick = async () => {
  const id = ST.proj;
  if (linked()) return;
  const ans = prompt(
    `刪除專案「${ST.conf.name}」的全部資料（所有角色、候選、參考圖、發佈），不能復原。\n建議先下載工作資料。要刪除請輸入專案代號 ${id}：`,
  );
  if (ans !== id) return;
  try {
    await studio.remove(id);
    $('projDlg').close();
    await loadProjects(LINKED);
    history.replaceState(null, '', '#');
    toast('已刪除專案');
  } catch (e) {
    toast(e.message, true);
  }
};
const ID_OK = /^[a-z][a-z0-9_]{0,31}$/;
$('npGo').onclick = async () => {
  const id = $('npId').value.trim();
  if (!ID_OK.test(id)) return toast('代號要英文小寫開頭，只能用英文小寫、數字與底線（最多 32 字）', true);
  try {
    await studio.create(id, $('npName').value.trim() || id, $('npNote').value.trim());
    await loadProjects(id);
    history.replaceState(null, '', '#' + id + '/');
    for (const k of ['npId', 'npName', 'npNote']) $(k).value = '';
    await renderProj();
    toast('已建立專案');
  } catch (e) {
    toast(e.message, true);
  }
};
$('npImp').onclick = () => {
  const id = $('npId').value.trim();
  if (!ID_OK.test(id)) return toast('先填新專案的代號（英文小寫開頭，英數與底線）', true);
  if (ST.projects.some((p) => p.id === id)) return toast('已經有這個代號的專案；要匯入到它就先切過去', true);
  $('npImpFile').click();
};
$('npImpFile').onchange = async () => {
  const f = $('npImpFile').files[0];
  $('npImpFile').value = '';
  if (!f) return;
  try {
    await importZip($('npId').value.trim(), f);
    $('projDlg').close();
  } catch (e) {
    toast(e.message, true);
  }
};

// 新增角色（使用者自己的專案）
$('ncGo').onclick = async () => {
  const id = $('ncId').value.trim();
  if (!ID_OK.test(id)) return toast('代號要英文小寫開頭，只能用英文小寫、數字與底線（最多 32 字）', true);
  if (ST.list.some((c) => c.id === id)) return toast('已經有這個代號的角色', true);
  const name = $('ncName').value.trim() || id;
  const card = newCard({ id, name });
  card.info = {
    sex: $('ncSex').value,
    age: $('ncAge').value.trim(),
    color: $('ncColor').value,
    note: $('ncNote').value.trim(),
  };
  if (ST.conf.pose) card.poses[0].prompt = ST.conf.pose;
  // 招牌表情預先填好常用的（不要的在「外觀」分頁刪掉那一行）
  card.extraExprs = (ST.conf.extra && ST.conf.extra.length ? ST.conf.extra : EXTRA_LIBRARY).map((e) => ({
    ...e,
  }));
  if (ST.conf.base) card.baseExprs = [...ST.conf.base];
  if (ST.conf.frames) card.frames = [...ST.conf.frames];
  try {
    await store.putCard(card);
    $('charDlg').close();
    await loadList();
    await openChar(id);
  } catch (e) {
    toast(e.message, true);
  }
};

// 交給 Claude Code：一段可以直接貼進 Claude Code 的指示（技能 .claude/skills/portrait-studio）
$('cClaude').onclick = () => {
  const C = ST.card;
  if (!C) return;
  const r = roOf(C.id) || {};
  const look =
    (C.look && C.look.zh) ||
    [r.sex === 'f' ? '女性' : r.sex === 'm' ? '男性' : '', r.age, r.note].filter(Boolean).join('，');
  const refs =
    C.refs && C.refs.length ? `參考圖已經上傳 ${C.refs.length} 張（角色卡的 refs），請先看過。` : '';
  $('claudeTxt').value =
    `/portrait-studio 幫我做立繪：專案 ${ST.proj}（${ST.conf.name}），角色 ${C.id}（${C.name}）。\n` +
    `外觀：${look || '（請寫外觀：年紀、髮型與髮色、眼睛、服裝、配件、配色）'}\n` +
    `${refs}先產生全身主圖的候選給我挑；我選好之後請一路做完標框、表情、眨眼與嘴型、品管與發佈，不用再問我，最後告訴我成品 zip 的位置。`;
  $('claudeMsg').textContent = '';
  $('claudeDlg').showModal();
};
$('claudeCopy').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('claudeTxt').value);
    $('claudeMsg').textContent = '已複製';
  } catch (e) {
    $('claudeTxt').select();
    $('claudeMsg').textContent = '瀏覽器不讓網頁直接複製：已經選取，按 Ctrl+C';
  }
};

// ---- 品管（docs/portrait-studio-design.md 第 2 期；量測 js/qa.js 和命令列 scripts/studio.js qa 同一份）----
const QI = new Map(); // 圖的快取：網址 → Promise<HTMLImageElement>
function imgOf(file) {
  const u = store.workUrl(ST.card.id, file);
  if (!QI.has(u)) {
    if (QI.size > 120) QI.clear();
    QI.set(
      u,
      new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = () => rej(new Error('讀不到 ' + file));
        im.src = u;
      }),
    );
  }
  return QI.get(u);
}
// 量測用：整張圖的像素
async function pixOf(file) {
  const im = await imgOf(file);
  const c = document.createElement('canvas');
  c.width = im.naturalWidth;
  c.height = im.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  return { w: c.width, h: c.height, data: d.data };
}
// 一格的畫布：裁 box 縮到寬 W
async function cropCanvas(file, box, W) {
  const c = document.createElement('canvas');
  const [x, y, w, h] = box;
  c.width = W;
  c.height = Math.max(20, Math.round((W * h) / w));
  if (file) {
    const im = await imgOf(file);
    c.getContext('2d').drawImage(im, x, y, w, h, 0, 0, c.width, c.height);
  }
  return c;
}
const qaExprIds = () => exprList(ST.card).map((e) => e.id);
const QA_FR = () => FRAMES().map((f) => f.id);
const fmtQm = (m) =>
  m
    ? `變 ${m.chg.toFixed(2)}・外 ${(m.out * 100).toFixed(2)}%・異色 ${m.alien.toFixed(2)}${m.side != null ? '・左右 ' + m.side.toFixed(2) : ''}${m.iris != null ? '・虹膜 ' + m.iris.toFixed(2) : ''}`
    : '還沒量測';
async function renderQa() {
  const P = pose();
  const grid = $('qaGrid');
  if (!P.master || !P.boxes.face) return (grid.innerHTML = '<p class="dim">先選定主圖並標框</p>');
  const filt = $('qaFilter').value;
  const nb = noBlink(P);
  const W = 150;
  grid.innerHTML = '';
  const cnt = { all: 0, bad: 0, ok: 0, ng: 0, unseen: 0, skip: 0 };
  for (const e of exprList(ST.card)) {
    const bf = e.id === 'neutral' ? P.master : P.ex[e.id]?.pick;
    if (!bf) continue;
    const row = document.createElement('div');
    row.className = 'qaRow';
    row.innerHTML = `<h4>${esc(e.name)}</h4>`;
    let show = filt === 'all';
    for (const kind of ['eyes', 'mouth']) {
      const box = Q.viewBox(P, e.id, kind);
      if (!box) continue;
      if (kind === 'mouth') row.appendChild(Object.assign(document.createElement('i'), { className: 'gap' }));
      const bc = document.createElement('div');
      bc.className = 'qaCell off';
      bc.appendChild(await cropCanvas(bf, box, W));
      bc.insertAdjacentHTML('beforeend', '<span>底圖</span>');
      row.appendChild(bc);
      for (const f of FRAMES().filter((x) => x.id[0] === kind[0])) {
        const key = `${e.id}.${f.id}`;
        const sl = P.ex[key];
        const d = document.createElement('div');
        d.className = 'qaCell';
        if (f.id[0] === 'e' && nb.includes(e.id)) {
          d.classList.add('off');
          d.appendChild(await cropCanvas(null, box, W));
          d.insertAdjacentHTML('beforeend', `<span>${f.name}：不眨眼</span>`);
        } else if (!sl || !sl.pick || sl.skip) {
          d.appendChild(await cropCanvas(null, box, W));
          d.insertAdjacentHTML('beforeend', `<span>${f.name}：${sl?.skip ? '略過' : '還沒有'}</span>`);
          if (sl?.skip) cnt.skip++;
          d.onclick = () => qaOpen(key);
        } else {
          cnt.all++;
          const st = Q.qaState(sl);
          const qm = sl.qm && sl.qm.pick === sl.pick ? sl.qm : null;
          if (st === 'auto' || st === 'ng') {
            d.classList.add('bad');
            cnt.bad++;
            show ||= filt === 'bad';
          } else if (st === 'ok') {
            d.classList.add('ok');
            cnt.ok++;
          } else {
            cnt.unseen++;
            show ||= filt === 'unseen';
          }
          d.title =
            fmtQm(qm) +
            (qm && qm.bad.length ? '\n量測：' + qm.bad.map((b) => Q.QA_REASONS[b]).join('、') : '');
          d.appendChild(await cropCanvas(sl.pick, box, W));
          const tag = st === 'ok' ? '✓' : st === 'ng' ? '✗' : st === 'auto' ? '⚠' : '';
          d.insertAdjacentHTML('beforeend', `<span>${tag} ${f.name}</span>`);
          d.onclick = () => qaOpen(key);
        }
        row.appendChild(d);
      }
    }
    if (show) grid.appendChild(row);
  }
  $('qaSum').textContent =
    `影格 ${cnt.all}：合格 ${cnt.ok}、有問題 ${cnt.bad}、還沒看 ${cnt.unseen}、略過 ${cnt.skip}`;
  if (!grid.children.length) grid.innerHTML = '<p class="dim">沒有符合的格子</p>';
}
$('qaFilter').onchange = () => renderQa();
$('qaRun').dataset.job = 1;
$('qaRun').onclick = () =>
  job('量測', async (onProgress) => {
    const P = pose();
    const keys = Object.keys(P.ex).filter((k) => k.includes('.') && P.ex[k].pick && !P.ex[k].skip);
    let n = 0;
    const rep = await Q.qaPose(P, pixOf, {
      exprIds: qaExprIds(),
      frames: QA_FR(),
      noBlink: noBlink(P),
      onCell: () => onProgress({ value: ++n, max: keys.length }),
    });
    for (const [k, v] of Object.entries(rep)) P.ex[k].qm = { ...v, t: Date.now() };
    const bad = Object.values(rep).filter((v) => v.bad.length).length;
    toast(`量測 ${Object.keys(rep).length} 格，抓到 ${bad} 格`);
  });

// 一格的放大、標記、候選
let qaKey = null;
async function qaOpen(key) {
  qaKey = key;
  const P = pose();
  const [e, fid] = key.split('.');
  const sl = (P.ex[key] ||= { cands: [], pick: null });
  const ed = exprList(ST.card).find((x) => x.id === e);
  const fd = ALL_FRAMES.find((x) => x.id === fid);
  $('qdTitle').textContent = `${ed ? ed.name : e}・${fd ? fd.name : fid}（${P.id}:${key}）`;
  const box = Q.viewBox(P, e, fid[0] === 'e' ? 'eyes' : 'mouth');
  const bf = e === 'neutral' ? P.master : P.ex[e]?.pick;
  for (const [id, f] of [
    ['qdBase', bf],
    ['qdCur', sl.skip ? null : sl.pick],
  ]) {
    const c = await cropCanvas(f, box, 420);
    const t = $(id);
    t.width = c.width;
    t.height = c.height;
    t.getContext('2d').drawImage(c, 0, 0);
  }
  qrReset(box);
  const qm = sl.qm && sl.qm.pick === sl.pick ? sl.qm : null;
  $('qdMetric').textContent =
    fmtQm(qm) + (qm && qm.bad.length ? '　量測抓到：' + qm.bad.map((b) => Q.QA_REASONS[b]).join('、') : '');
  const why = sl.qa && sl.qa.pick === sl.pick ? sl.qa.why || [] : [];
  $('qdChecks').innerHTML = Object.entries(Q.QA_CHECKS)
    .map(
      ([k, t]) =>
        `<label><input type="checkbox" value="${k}" ${why.includes(k) ? 'checked' : ''}/> ${esc(t)}</label>`,
    )
    .join('');
  $('qdNote').value = (sl.qa && sl.qa.pick === sl.pick && sl.qa.note) || '';
  const cs = $('qdCands');
  cs.innerHTML = '';
  for (const [i, f] of (sl.cands || []).entries()) {
    const c = await cropCanvas(f, box, 200);
    c.title = `第 ${i + 1} 張`;
    if (f === sl.pick && !sl.skip) c.className = 'pick';
    c.onclick = async () => {
      sl.pick = f;
      sl.v2 = true;
      delete sl.skip;
      await saveCard();
      qaOpen(key);
      renderQa();
    };
    cs.appendChild(c);
  }
  if (!sl.cands || !sl.cands.length) cs.innerHTML = '<span class="dim">還沒有候選</span>';
  if (!$('qaDlg').open) $('qaDlg').showModal();
}
async function qaMark(st) {
  const sl = pose().ex[qaKey];
  if (!sl || !sl.pick || sl.skip) return toast('這一格沒有選定的圖', true);
  sl.qa = {
    st,
    why: st === 'ng' ? [...$('qdChecks').querySelectorAll('input:checked')].map((x) => x.value) : [],
    note: $('qdNote').value.trim(),
    pick: sl.pick,
    by: 'web',
    t: Date.now(),
  };
  await saveCard();
  $('qaDlg').close();
  renderQa();
}
$('qdOk').onclick = () => qaMark('ok');
$('qdNg').onclick = () => qaMark('ng');
$('qdSkip').onclick = async () => {
  const sl = pose().ex[qaKey];
  if (!sl) return;
  sl.skip = true;
  await saveCard();
  $('qaDlg').close();
  renderQa();
};
$('qdRegen').onclick = () => {
  const key = qaKey;
  job(`產生 ${key} 的新候選`, async (onProgress) => {
    await pipe.variant(ST.card, ST.pid, key, { n: 3, onProgress });
    await saveCard();
    if ($('qaDlg').open) await qaOpen(key);
  });
};

// ---- 自動完成（docs/portrait-studio-design.md 第 4 期）：伺服器另開程序跑 scripts/studio.js char <角色> auto ----
const AU = { timer: 0, running: false, cid: null };
const autoUrl = () => `${store.root}/${ST.card.id}/auto`;
function autoView(s) {
  const C = ST.card;
  const P = C && pose();
  const has = !!(P && P.master);
  AU.running = !!s.running;
  $('autoGo').disabled = AU.running || !has || ST.busy;
  $('autoHint').classList.toggle('hidden', !!(s.running || s.end));
  if (!has && !s.running)
    $('autoHint').textContent = '先在「主圖」分頁產生候選、點一張設成主圖，再按「自動完成」。';
  else
    $('autoHint').textContent =
      '主圖選好了：按「自動完成」，其他全部自動做完（伺服器上跑，關掉網頁也會繼續）。';
  $('autoRun').classList.toggle('hidden', !(s.running || s.end));
  $('autoStop').classList.toggle('hidden', !s.running);
  if (s.running || s.end) {
    $('autoBarI').style.width = (s.running ? s.pct || 0 : s.code === 0 ? 100 : s.pct || 0) + '%';
    const min = (((s.end || Date.now()) - s.start) / 60000).toFixed(0);
    $('autoTxt').textContent =
      `${s.running ? '自動完成中' : ''}${s.text ? '：' + s.text : ''}（${min} 分鐘${s.running ? '，' + Math.round(s.pct || 0) + '%' : ''}）`;
    $('autoLog').textContent = (s.lines || []).join('\n');
    if (!$('autoLog').classList.contains('hidden')) $('autoLog').scrollTop = 1e9;
  }
  // 自動完成中不能在網頁上產圖或改這個角色（角色卡會互相覆蓋）
  document.querySelectorAll('[data-job]').forEach((b) => (b.disabled = AU.running || ST.busy));
}
async function autoPoll() {
  clearTimeout(AU.timer);
  if (!ST.card) return;
  const cid = ST.card.id;
  let s = { running: false };
  try {
    s = await (await fetch(autoUrl())).json();
  } catch (e) {
    /* 伺服器沒回應 */
  }
  if (!ST.card || ST.card.id !== cid) return;
  const was = AU.running && AU.cid === cid;
  AU.cid = cid;
  AU.s = s;
  autoView(s);
  if (s.running) {
    // 跑的期間每 20 秒重新讀一次角色卡，各分頁看得到新產生的圖
    if (!AU.last || Date.now() - AU.last > 20000) {
      AU.last = Date.now();
      const c = await store.getCard(cid);
      if (c && ST.card && ST.card.id === cid) {
        ST.card = c;
        if (ST.tab !== 'look') render();
      }
    }
    AU.timer = setTimeout(autoPoll, 2500);
  } else if (was) {
    ST.card = (await store.getCard(cid)) || ST.card;
    await loadList();
    render();
    toast(
      s.code === 0 ? '自動完成：做完了（看「品管」與「預覽」）' : '自動完成停止了：' + (s.text || ''),
      s.code !== 0,
    );
  }
}
$('autoGo').onclick = async () => {
  const C = ST.card;
  if (!C || ST.busy) return;
  try {
    await saveCard();
    const r = await fetch(autoUrl(), { method: 'POST', body: JSON.stringify({ n: 3 }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
    toast('自動完成開始了：大約一個姿勢一小時多，可以關掉網頁，回來再看');
    AU.last = Date.now();
    autoView(d);
    AU.timer = setTimeout(autoPoll, 1500);
  } catch (e) {
    toast(e.message, true);
  }
};
$('autoStop').onclick = async () => {
  await fetch(autoUrl(), { method: 'DELETE' });
  autoPoll();
};
$('autoLogBtn').onclick = () => {
  $('autoLog').classList.toggle('hidden');
  $('autoLog').scrollTop = 1e9;
};

// 外觀分頁：把常用的招牌表情補進來（已經有的不重複）
$('lookFill').onclick = () => {
  const have = new Set(
    $('lookExtra')
      .value.split('\n')
      .map((l) => l.split('|')[0].trim()),
  );
  const add = EXTRA_LIBRARY.filter((e) => !have.has(e.id)).map((e) => `${e.id}|${e.name}|${e.prompt}`);
  const cur = $('lookExtra').value.trim();
  $('lookExtra').value = (cur ? cur + '\n' : '') + add.join('\n');
  toast(`補上 ${add.length} 種，按「儲存」才會存起來`);
};

// 品管對話框：把一塊換回底圖（疤、配件被改掉時；命令列的 restore）
const QR = { box: null, rect: null, drag: null, img: null };
function qrDraw() {
  const t = $('qdCur');
  if (!QR.img) return;
  const g = t.getContext('2d');
  g.drawImage(QR.img, 0, 0);
  const r = QR.drag || QR.rect;
  if (r) {
    const k = t.width / QR.box[2];
    g.strokeStyle = '#ff4040';
    g.lineWidth = 2;
    g.setLineDash([6, 4]);
    g.strokeRect((r[0] - QR.box[0]) * k, (r[1] - QR.box[1]) * k, r[2] * k, r[3] * k);
    g.setLineDash([]);
  }
}
const qrPos = (e) => {
  const t = $('qdCur');
  const b = t.getBoundingClientRect();
  const k = QR.box[2] / b.width;
  return [QR.box[0] + (e.clientX - b.left) * k, QR.box[1] + (e.clientY - b.top) * k];
};
$('qdCur').onpointerdown = (e) => {
  if (!QR.img) return;
  QR.p0 = qrPos(e);
  QR.drag = [...QR.p0, 1, 1];
  $('qdCur').setPointerCapture(e.pointerId);
};
$('qdCur').onpointermove = (e) => {
  if (!QR.drag) return;
  const p = qrPos(e);
  QR.drag = [
    Math.min(p[0], QR.p0[0]),
    Math.min(p[1], QR.p0[1]),
    Math.abs(p[0] - QR.p0[0]),
    Math.abs(p[1] - QR.p0[1]),
  ].map(Math.round);
  qrDraw();
};
$('qdCur').onpointerup = () => {
  if (QR.drag && QR.drag[2] > 2 && QR.drag[3] > 2) QR.rect = QR.drag;
  QR.drag = null;
  $('qdRestore').disabled = !QR.rect;
  qrDraw();
};
// qaOpen 畫完「這一格」之後呼叫：記下範圍與畫好的圖
function qrReset(box) {
  QR.box = box;
  QR.rect = null;
  QR.drag = null;
  const t = $('qdCur');
  QR.img = document.createElement('canvas');
  QR.img.width = t.width;
  QR.img.height = t.height;
  QR.img.getContext('2d').drawImage(t, 0, 0);
  $('qdRestore').disabled = true;
}
$('qdRestore').onclick = () => {
  const key = qaKey;
  const r = QR.rect;
  if (!r) return;
  job('把框裡換回底圖', async () => {
    const P = pose();
    const sl = P.ex[key];
    const e = key.split('.')[0];
    const bf = e === 'neutral' ? P.master : P.ex[e]?.pick;
    const base = await imgOf(bf);
    const cur = await imgOf(sl.pick);
    const c = document.createElement('canvas');
    c.width = cur.naturalWidth;
    c.height = cur.naturalHeight;
    const g = c.getContext('2d');
    g.drawImage(cur, 0, 0);
    g.drawImage(base, r[0], r[1], r[2], r[3], r[0], r[1], r[2], r[3]);
    const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
    const nf = sl.pick.replace(/(_r\d+)?\.webp$/, '') + '_r' + Date.now().toString().slice(-6) + '.webp';
    await store.putWork(ST.card.id, nf, new Uint8Array(await blob.arrayBuffer()));
    sl.cands.push(nf);
    sl.pick = nf;
    delete sl.qa;
    await saveCard();
    toast('已換回底圖（新的候選、已選定）');
    if ($('qaDlg').open) await qaOpen(key);
  });
};

// ---- 主圖的局部修正（第 4 期）：在主圖上框出要修的地方 → Qwen 只改框裡 → 新的主圖候選 ----
const FX = { img: null, rect: null, drag: null };
function fixRender() {
  const P = pose();
  const cv = $('fixCv');
  if (!P.master) {
    $('fixBox').classList.add('hidden');
    return;
  }
  $('fixBox').classList.remove('hidden');
  const url = store.workUrl(ST.card.id, P.master);
  if (!FX.img || FX.img.dataset.url !== url) {
    FX.rect = null;
    FX.img = new Image();
    FX.img.dataset.url = url;
    FX.img.onload = fixDraw;
    FX.img.src = url;
  } else fixDraw();
  cv.style.width = '420px';
}
function fixDraw() {
  const cv = $('fixCv');
  if (!FX.img || !FX.img.naturalWidth) return;
  cv.width = FX.img.naturalWidth;
  cv.height = FX.img.naturalHeight;
  const g = cv.getContext('2d');
  g.drawImage(FX.img, 0, 0);
  const r = FX.drag || FX.rect;
  if (r) {
    g.strokeStyle = '#ff4040';
    g.lineWidth = 3;
    g.setLineDash([8, 5]);
    g.strokeRect(...r);
    g.setLineDash([]);
  }
  $('fixInfo').textContent = FX.rect ? `範圍 ${FX.rect.join(', ')}` : '還沒框出範圍';
}
const fixPos = (e) => {
  const cv = $('fixCv');
  const b = cv.getBoundingClientRect();
  return [((e.clientX - b.left) * cv.width) / b.width, ((e.clientY - b.top) * cv.height) / b.height];
};
$('fixCv').onpointerdown = (e) => {
  FX.p0 = fixPos(e);
  FX.drag = [...FX.p0, 1, 1];
  $('fixCv').setPointerCapture(e.pointerId);
};
$('fixCv').onpointermove = (e) => {
  if (!FX.drag) return;
  const p = fixPos(e);
  FX.drag = [
    Math.min(p[0], FX.p0[0]),
    Math.min(p[1], FX.p0[1]),
    Math.abs(p[0] - FX.p0[0]),
    Math.abs(p[1] - FX.p0[1]),
  ].map(Math.round);
  fixDraw();
};
$('fixCv').onpointerup = () => {
  if (FX.drag && FX.drag[2] > 8 && FX.drag[3] > 8) FX.rect = FX.drag;
  FX.drag = null;
  fixDraw();
};
$('fixGo').onclick = () => {
  const prompt = $('fixPrompt').value.trim();
  if (!FX.rect) return toast('先在主圖上框出要修的地方', true);
  if (!prompt) return toast('寫要怎麼改', true);
  const n = Math.max(1, Math.min(6, +$('fixN').value || 2));
  job('主圖局部修正', async (onProgress) => {
    await pipe.fixMaster(ST.card, ST.pid, { box: FX.rect, prompt, n, onProgress });
    toast('修正後的候選在上面的候選裡（最後幾張），點它設成主圖');
  });
};

// ---- 表情組與影格組（第 5 期）：勾選框的一列；全部勾選時存成「沒有設定」（＝全部）----
const BASE_EX = EXPRS.filter((e) => e.id !== 'neutral');
function chkRow(el, items, sel) {
  el.innerHTML = items
    .map(
      (it) =>
        `<label><input type="checkbox" value="${it.id}" ${!sel || sel.includes(it.id) ? 'checked' : ''}/> ${esc(it.name)}</label>`,
    )
    .join('');
}
const chkVal = (el) => [...el.querySelectorAll('input:checked')].map((x) => x.value);
function setOrAll(o, k, v, all) {
  if (v.length === all.length) delete o[k];
  else o[k] = v;
}
function parseExtra(txt) {
  return txt
    .split('\n')
    .map((l) => l.split('|').map((x) => x.trim()))
    .filter((a) => a.length >= 3 && /^[a-z][a-z0-9_]*$/.test(a[0]))
    .map(([id, name, ...p]) => ({ id, name, prompt: p.join('|') }));
}

// 角色的其他輸出格式：整張圖、精靈圖（伺服器邊合成邊下載，表情多時要等一下）
$('cDlMore').onchange = () => {
  const w = $('cDlMore').value;
  $('cDlMore').value = '';
  if (!w || !ST.card) return;
  toast(w === 'full' ? '合成整張圖中，下載會慢慢進來' : '合成精靈圖中，完成後開始下載');
  location.href = studio.zipUrl(ST.proj, { char: ST.card.id, what: w });
};
