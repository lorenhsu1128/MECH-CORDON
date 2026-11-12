// ============================================================
//  Game：地圖預覽器的敵人（docs/map-viewer-design.md 第 2 期）
//  - 實戰編成：照自由出擊抽這張地圖的敵人（rollComp＋foeMix＋spawnComp），連據點、地圖裝置、小人、運輸車輛；
//    「全部生成」時遠處的敵群與據點守衛不等玩家靠近
//  - 圖鑑排列：一般敵人類型＋這個主題的專屬敵人＋專屬 AC 每種一台，排成格子、AI 停住
//  - 目標：下一台／上一台、點畫面上的敵人選取；資訊（類型、AI、模型、三角形與網格數、材質、AP、弱點）
// ============================================================
import { escHtml } from '../core/html.js';
import { MS } from '../core/scale.js';
import { weakText } from '../data/attrs.js';
import { ENEMY_TYPES, enemyScale } from '../data/enemies.js';
import { ACES, FOES, THEME_ACE, themeFoes } from '../data/foes.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const ZERO = new THREE.Vector3();
const _ray = new THREE.Raycaster();
const _v2 = new THREE.Vector2();
const GAL_COLS = 6;
const GAL_GAP = 11 * MS; // 圖鑑排列的間距（公尺）
const MODES = [
  ['real', '實戰編成'],
  ['gallery', '圖鑑排列'],
  ['boss', 'Boss 擂台'],
  ['none', '不生成'],
];

// 類型的名稱（一般敵人與專屬敵人）
const typeName = (t) => (ENEMY_TYPES[t] || FOES[t] || {}).name || t;

Object.assign(Game.prototype, {
  // ---------- 生成 ----------
  mapvSpawnFoes() {
    const V = this.mapv,
      f = V.f,
      p = V.p;
    // 新類型第一次出現的提示（spawnType 的 intro）在預覽器不顯示
    this.introSeen = new Set([...Object.keys(ENEMY_TYPES), ...Object.keys(FOES)]);
    this.encGroups = null;
    this.guardPend = null;
    this.spawnQ = [];
    if (f.mode === 'real') {
      const L = f.lv;
      const sc = enemyScale(L, 1);
      this.scaleHp = sc.hp;
      this.scaleDmg = sc.dmg;
      // 主題的專屬敵人全部算（不限主線遇過的）
      this.spawnComp(this.foeMix(this.rollComp(L, 1), p.theme, 0, false), 1, sc.hp, sc.dmg);
      if (f.extras) {
        this.outpostsPlan(L); // 據點與補給箱
        this.devPlan(); // 地圖互動裝置
        this.hkReset();
        this.crowdPlan(); // 地圖上的小人
        this.planVehicles(); // 運輸車輛
      }
      if (f.all) this.mapvWakeAll();
    } else if (f.mode === 'gallery') this.mapvGallery();
    else if (f.mode === 'boss') this.mapvSpawnBoss(); // map-view-boss.js
  },
  // 遠處的敵群與據點守衛：不等玩家靠近，全部排進生成佇列（spawnQTick 一格一台）
  mapvWakeAll() {
    const G = this.encGroups;
    if (G) for (let gi = 0; gi < G.length; gi++) if (G[gi].pend) this.encWake(gi);
    const GP = this.guardPend;
    if (GP)
      while (GP.length) {
        const q = GP.shift();
        const wa = this.waveAt;
        this.waveAt = { pos: q.pos, drop: false };
        try {
          for (const [t, n] of q.list) this.spawnLater([t], null, n, null, { guard: q.id });
        } finally {
          this.waveAt = wa;
        }
      }
  },
  // 圖鑑排列：每種一台，排成 GAL_COLS 欄的格子（中心在出生點附近，避開障礙物）
  mapvGalleryList() {
    const V = this.mapv,
      f = V.f,
      th = V.p.theme;
    const out = [];
    if (f.kinds.theme) for (const t of themeFoes(th, 9)) out.push({ t });
    if (f.kinds.ace && THEME_ACE[th]) out.push({ ace: THEME_ACE[th] });
    if (f.kinds.gen)
      for (const t of Object.keys(ENEMY_TYPES)) if (!(t === 'ac' || ENEMY_TYPES[t].roster)) out.push({ t });
    return out;
  },
  mapvGallery() {
    const w = this.world;
    const list = this.mapvGalleryList();
    const s = w.start || { x: 0, z: 0 };
    const rows = Math.ceil(list.length / GAL_COLS);
    // 從出生點往地圖中央排
    const dir = Math.atan2(-s.x, -s.z);
    const cx = s.x + Math.sin(dir) * GAL_GAP * (rows / 2 + 1.5),
      cz = s.z + Math.cos(dir) * GAL_GAP * (rows / 2 + 1.5);
    const ux = Math.cos(dir),
      uz = -Math.sin(dir); // 欄的方向（和 dir 垂直）
    const vx = Math.sin(dir),
      vz = Math.cos(dir);
    list.forEach((it, i) => {
      const c = i % GAL_COLS,
        r = Math.floor(i / GAL_COLS);
      const a = (c - (GAL_COLS - 1) / 2) * GAL_GAP,
        b = (r - (rows - 1) / 2) * GAL_GAP;
      let x = cx + ux * a + vx * b,
        z = cz + uz * a + vz * b;
      [x, z] = w.collide(x, z, w.groundAt(x, z, 1e4), 3 * MS);
      const at = new THREE.Vector3(x, w.groundAt(x, z, 1e4), z);
      let e = null;
      try {
        if (it.ace) {
          const r0 = ACES[it.ace];
          e = this.spawnEnemy({
            name: r0.name,
            asm: r0.randomAsm ? this.foeRandomAsm() : r0.asm,
            pal: r0.pal,
            scale: 1,
            hpMul: r0.hpMul,
            dmgMul: r0.dmgMul,
            stabMul: r0.stabMul,
            ai: r0.ai,
            wantDist: r0.wantDist,
            speedMul: r0.speedMul,
            turnRate: r0.turnRate,
            amphib: r0.amphib,
            ace: true,
            at,
          });
        } else e = this.spawnType(it.t, 1, 1, at, 1);
      } catch (err) {
        console.warn('mapvGallery', it, err);
      }
      if (!e) return;
      e.pos.x = x;
      e.pos.z = z;
      if (!e.flying) e.pos.y = at.y;
      e.yaw = dir + Math.PI; // 面向出生點那一側（鏡頭預設從那邊看）
      e.mvGal = true;
    });
    // 鏡頭：中心點放在格子中央
    const F = this.mapv.F;
    F.pivot.set(cx, w.groundAt(cx, cz, 1e4), cz);
    F.yaw = dir + Math.PI;
    F.pitch = 0.45;
    F.dist = GAL_GAP * Math.max(3, rows * 1.2);
  },
  // AI 停住時：照常更新外觀與動作（原地不動）；部位與鑽地蟲（不用 move）不動
  mapvIdle(e, dt) {
    if (e.noPush || e.ai === 'part' || e.ai === 'bpart') return;
    e.move(dt, ZERO, false, false, false, null);
  },
  // ---------- 目標 ----------
  mapvTargets() {
    return this.enemies.filter((e) => !e.dead && e.mesh && e.mesh.visible !== false);
  },
  mapvSetTgt(e) {
    const V = this.mapv;
    V.tgt = e || null;
    V.cinT = 0;
    if (e) {
      V.F.pivot.copy(e.pos);
      const h = ((e.model && e.model.height) || 4) * (e.scale || 1);
      V.F.dist = Math.max(h * 2.6, 8 * MS);
      if (V.cam === 'top') V.cam = 'orbit';
    }
    this.mapvTgtUi();
    this.mapvSyncUi();
  },
  mapvCycle(dir) {
    const L = this.mapvTargets();
    if (!L.length) return this.mapvSetTgt(null);
    const i = L.indexOf(this.mapv.tgt);
    this.mapvSetTgt(L[(i + dir + L.length) % L.length]);
  },
  // 點畫面：選取點到的敵人（射線打到的網格往上找到所屬的實體）
  mapvPick(x, y) {
    const r = this.canvas.getBoundingClientRect();
    _v2.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    _ray.setFromCamera(_v2, this.camera);
    const L = this.mapvTargets();
    const roots = new Map();
    for (const e of L) roots.set(e.mesh, e);
    const hits = _ray.intersectObjects(
      L.map((e) => e.mesh),
      true,
    );
    for (const h of hits) {
      let o = h.object;
      while (o && !roots.has(o)) o = o.parent;
      if (o) return this.mapvSetTgt(roots.get(o));
    }
    // 沒點到網格：找畫面上離點最近的（小的無人機不好點）
    let best = null,
      bd = 40;
    for (const e of L) {
      const s = this.proj(e.center());
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) this.mapvSetTgt(best);
  },
  // 模型的統計：網格、三角形、材質（描邊外殼與輔助標示也算：都是實際的繪製）
  mapvMeshStats(root) {
    let meshes = 0,
      tris = 0;
    const mats = new Set();
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      meshes++;
      const g = o.geometry;
      if (g) {
        const n = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
        tris += (n / 3) * (o.isInstancedMesh ? o.count : 1);
      }
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (m) mats.add(m);
    });
    return { meshes, tris: Math.round(tris), mats: mats.size };
  },
  mapvTgtUi() {
    const V = this.mapv;
    const e = V && V.tgt && !V.tgt.dead ? V.tgt : null;
    const nm = $('mvTgtName');
    if (nm) nm.textContent = e ? e.name : '—';
    const box = $('mvTgtInfo');
    if (!box) return;
    if (!e) {
      box.innerHTML = '<span class="dim">點畫面上的敵人，或用上方的 ◀ ▶ 切換</span>';
      return;
    }
    const s = this.mapvMeshStats(e.mesh);
    const kind = e.etype
      ? typeName(e.etype) + `（${e.etype}）`
      : e.isBoss
        ? 'Boss'
        : e.ace
          ? '敵對機甲'
          : '—';
    const o = e.opts || {};
    const model = o.modelKind ? o.modelKind + (o.vehKey ? '／' + o.vehKey : '') : '機甲（區塊組合）';
    const weak = e.res ? weakText(e.res, e.laserK) : '';
    box.innerHTML = [
      ['名稱', e.name],
      ['類型', kind],
      ['AI', e.ai],
      ['模型', model],
      ['網格', s.meshes],
      ['三角形', s.tris.toLocaleString()],
      ['材質', s.mats],
      ['AP', `${Math.round(e.hp)}／${Math.round(e.maxHp)}`],
      ['弱點', weak || '—'],
    ]
      .map(([k, v]) => `<span>${k}</span><b>${escHtml(String(v))}</b>`)
      .join('');
  },
  // ---------- 面板（敵人分頁） ----------
  mapvFoesHtml() {
    const V = this.mapv,
      f = V.f;
    const opt = (v, t, cur) =>
      `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${t}</option>`;
    const chk = (k, t, tip) =>
      `<label class="mvchk" title="${escHtml(tip || '')}"><input type="checkbox" data-f="${k}"${f[k] ? ' checked' : ''} /> ${t}</label>`;
    const kchk = (k, t) =>
      `<label class="mvchk"><input type="checkbox" data-k="${k}"${f.kinds[k] ? ' checked' : ''} /> ${t}</label>`;
    // 場上的敵人：依名稱分組計數，點一下選那一組的第一台
    const groups = new Map();
    for (const e of this.mapvTargets()) {
      const k = e.name;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    const list = [...groups.entries()]
      .map(([k, L], i) => `<button class="mvent" data-g="${i}">${escHtml(k)} <i>×${L.length}</i></button>`)
      .join('');
    this.mapvGroups = [...groups.values()];
    return `
      <div class="mvrow"><span>敵人</span><select data-fm="mode">${MODES.map((m) => opt(m[0], m[1], f.mode)).join('')}</select></div>
      ${
        f.mode === 'real'
          ? `<div class="mvrow"><span>等級</span><span class="mvctl"><button data-lv="-1">◀</button><input type="number" data-fm="lv" min="1" max="60" value="${f.lv}" /><button data-lv="1">▶</button></span></div>
      <div class="mvchks">${chk('extras', '據點、裝置、小人、車輛')}${chk('all', '全部生成', '遠處的敵群與據點守衛不等玩家靠近就生成')}${chk('waves', '增援波次', '場上的敵人變少時派出下一波（AI 要開著）')}</div>`
          : f.mode === 'gallery'
            ? `<div class="mvchks">${kchk('theme', '這個主題的專屬敵人')}${kchk('ace', '專屬 AC')}${kchk('gen', '一般敵人')}</div>`
            : f.mode === 'boss'
              ? this.mapvBossHtml()
              : ''
      }
      <div class="mvchks">${chk('ai', 'AI 行動', '關掉時原地不動（只播待機動作）')}${chk('god', '敵人無敵', 'Boss 不補 AP（要看型態），只是不會被擊破')}</div>
      <div class="mvrow"><span>友軍</span><select data-fm="allies" title="藍隊的具名 AC，和敵人交戰（看子彈、爆炸與特效）">${[0, 1, 2, 3, 4].map((n) => opt(n, n ? n + ' 台' : '無', f.allies)).join('')}</select></div>
      <div class="mvacts"><button id="mvRespawn" title="同一張地圖重新產生敵人">重新生成</button></div>
      <div class="mvsub">選取的目標</div>
      <div class="mvinfo" id="mvTgtInfo"></div>
      <div class="mvsub">場上 ${this.mapvTargets().length} 台</div>
      <div class="mvents">${list || '<span class="dim">沒有敵人</span>'}</div>`;
  },
  mapvBindFoes() {
    const V = this.mapv,
      f = V.f;
    const body = $('mvBody');
    const regen = () => this.mapvGenerate();
    for (const el of body.querySelectorAll('[data-fm]'))
      el.onchange = () => {
        const k = el.dataset.fm;
        if (k === 'lv') f.lv = Math.max(1, Math.min(60, Math.floor(Number(el.value) || 1)));
        else if (k === 'allies') f.allies = Number(el.value) || 0;
        else {
          f.mode = el.value;
          f.ai = f.mode !== 'gallery'; // 圖鑑排列預設停住 AI
        }
        regen();
      };
    for (const b of body.querySelectorAll('[data-lv]'))
      b.onclick = () => {
        f.lv = Math.max(1, Math.min(60, f.lv + Number(b.dataset.lv)));
        const inp = body.querySelector('[data-fm="lv"]');
        if (inp) inp.value = f.lv;
        this.mapvQueue();
      };
    for (const el of body.querySelectorAll('[data-f]'))
      el.onchange = () => {
        const k = el.dataset.f;
        f[k] = el.checked;
        if (k === 'extras') regen();
        if (k === 'all' && f.all) this.mapvWakeAll();
      };
    for (const el of body.querySelectorAll('[data-k]'))
      el.onchange = () => {
        f.kinds[el.dataset.k] = el.checked;
        regen();
      };
    $('mvRespawn').onclick = regen;
    if (f.mode === 'boss') this.mapvBindBoss();
    for (const b of body.querySelectorAll('[data-g]'))
      b.onclick = () => {
        const L = (this.mapvGroups || [])[Number(b.dataset.g)] || [];
        const i = L.indexOf(V.tgt);
        this.mapvSetTgt(L[(i + 1) % L.length] || null);
      };
    this.mapvTgtUi();
  },
});
