// 角色產生器的網頁（docs/portrait-design.md）：透過 mech-cordon-server 的 /api/comfy（ComfyUI）與 /api/chars（角色資料）
import { Comfy } from './comfy.js';
import { CharStore } from './store.js';
import { Pipeline, newCard, newPose, poseOf } from './pipeline.js';
import { ROSTER, TIER_NAMES, rosterOf } from './roster.js';
import { exprList, EYE_FRAMES, MOUTH_FRAMES } from './expr.js';
import { Portrait, PortraitPack, ACT_NAMES } from './portrait.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const comfy = new Comfy('/api/comfy');
const store = new CharStore('');
const pipe = new Pipeline(comfy, store, (s) => toast(s));
const ST = { list: [], card: null, pid: 'p1', tab: 'look', busy: false, stop: false, dev: false };
const FRAMES = [...EYE_FRAMES, ...MOUTH_FRAMES];

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
}

// ---- 角色清單 ----
async function loadList() {
  const r = await store.list();
  ST.list = r.chars;
  ST.dev = r.dev;
  $('devSt').textContent = r.dev ? '開發模式：定稿寫進 src/assets/characters/' : '';
  renderRoster();
}
function renderRoster() {
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
// 名單以外的角色（測試用、之後新增的）也能開：放在「其他」
const roOf = (id) => {
  const c = ST.list.find((x) => x.id === id);
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
  $('cNote').textContent =
    `${r.sex ? (r.sex === 'f' ? '女・' : '男・') : ''}${r.age ? r.age + '・' : ''}${r.note}`;
  renderRoster();
  render();
}
async function saveCard() {
  await store.putCard(ST.card);
  const i = ST.list.findIndex((c) => c.id === ST.card.id);
  const s = { id: ST.card.id, name: ST.card.name, status: ST.card.status, pub: !!ST.card.pub };
  if (i < 0) ST.list.push(s);
  else ST.list[i] = s;
  renderRoster();
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
  if (!C) return;
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
  })[ST.tab]();
}

// ---- 1 外觀 ----
function renderLook() {
  const L = ST.card.look;
  $('lookZh').value = L.zh || '';
  $('lookPrompt').value = L.prompt || '';
  $('lookNeg').value = L.neg || '';
  $('lookExtra').value = (ST.card.extraExprs || []).map((e) => `${e.id}|${e.name}|${e.prompt}`).join('\n');
  $('refs').innerHTML = ST.card.refs
    .map(
      (f) =>
        `<div class="it"><img src="${store.workUrl(ST.card.id, f)}"><button class="x" data-f="${esc(f)}">✕</button></div>`,
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
  await saveCard();
  toast('已儲存');
};
$('refFile').onchange = async () => {
  for (const f of $('refFile').files) {
    const ext = (f.name.split('.').pop() || 'png').toLowerCase().replace('jpeg', 'jpg');
    const name = `ref_${Date.now().toString(36)}.${/^(png|jpg|webp)$/.test(ext) ? ext : 'png'}`;
    await store.putWork(ST.card.id, name, new Uint8Array(await f.arrayBuffer()));
    ST.card.refs.push(name);
  }
  $('refFile').value = '';
  await saveCard();
  render();
};

// ---- 2 主圖 ----
function renderMaster() {
  const P = pose();
  $('posePrompt').value = P.prompt;
  $('cands').innerHTML = P.cands
    .map(
      (c) =>
        `<div class="it ${P.master === c.file ? 'pick' : ''}" data-f="${esc(c.file)}"><img loading="lazy" src="${store.workUrl(ST.card.id, c.file)}"><span>${c.seed}${P.master === c.file ? '　主圖' : ''}</span></div>`,
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

// ---- 3 標框 ----
const BOX_COL = { face: '#7fc8ff', eyes: '#ffb020', mouth: '#ff6bd5' };
let boxImg = null;
let drag = null;
function renderBoxes() {
  const P = pose();
  const cv = $('boxCv');
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
  for (const [k, col] of Object.entries(BOX_COL)) {
    const b = drag && drag.k === k ? drag.b : P.boxes[k];
    if (!b) continue;
    g.strokeStyle = col;
    g.lineWidth = 3;
    g.strokeRect(b[0], b[1], b[2], b[3]);
  }
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
  if (drag && drag.b[2] > 8 && drag.b[3] > 8) pose().boxes[drag.k] = drag.b;
  drag = null;
  drawBoxes();
};
$('boxSave').onclick = async () => {
  await saveCard();
  toast('框已儲存');
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
  const cands = s.cands.map((f) => cropDiv(f, box, s.pick === f)).join('');
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
    for (const f of FRAMES) out.push(`${e.id}.${f.id}`);
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
    for (const f of FRAMES)
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

// ---- 啟動 ----
if (new URLSearchParams(location.search).has('from')) $('back').href = '/';
checkComfy();
setInterval(checkComfy, 10000);
// 網址的 #角色 id 直接開那個角色（載入時與之後改 # 時）
const openHash = () => {
  const id = location.hash.slice(1);
  if (id && roOf(id) && ST.card?.id !== id) openChar(id);
};
window.addEventListener('hashchange', openHash);
loadList()
  .then(openHash)
  .catch((e) => toast('讀不到角色清單：' + e.message, true));
