// 地面標示頁（模型庫的「地面標示」頁籤，網址 #ground）：瀏覽遊戲裡畫在地上的預警、區域、光環與箭頭。
// - 招式範例（library/ground-moves.js）：每個會在地上畫東西的招式重現一次（敵人在前方、玩家在原點），可以重複、放慢
// - 地面標示（library/ground-kit.js 的 MARKS）：單獨展示每一種，列出用到它的招式；「全部並排」一次看完
// 畫面用遊戲的同一份程式（fx/effects.js、render/zone-fx.js、render/boss-field-*.js、render/ground-marks.js、
// 裝置的模型），只看、不能改；改外觀要改遊戲的程式。砲火特效的「華麗／標準」可以切換。
import { escHtml } from '../core/html.js';
import { DS, MS } from '../core/scale.js';
import { START_ASM } from '../data/parts.js';
import { PALETTES } from '../render/materials.js';
import { Effects } from '../fx/effects.js';
import { MARKS, MARK_CATS, Run, V } from './ground-kit.js';
import { MOVES, MOVE_CATS } from './ground-moves.js';
import { addLights, applyLight, buildMechWithGlb, makeRenderer } from './stage.js';

const $ = (id) => document.getElementById(id);
const DEF_SRC = [0, -30]; // 敵人預設的位置（舊尺度的公尺；玩家在原點、面向 −Z）
const GRID_GAP = 45 * DS; // 全部並排的間距
const GRID_COLS = 6;

// 機體的發射點（近似：右手、背部）
function actor(rig) {
  const pos = rig.group.position;
  const yaw = () => rig.group.rotation.y;
  const local = (x, y, z) => {
    const c = Math.cos(yaw()),
      s = Math.sin(yaw());
    return V(pos.x + x * c + z * s, pos.y + y, pos.z - x * s + z * c);
  };
  return {
    rig,
    get pos() {
      return pos.clone();
    },
    center: () => V(pos.x, pos.y + 1.6 * MS, pos.z),
    muzzle: (k) =>
      k === 'rback' || k === 'lback'
        ? local(k === 'rback' ? 0.7 * MS : -0.7 * MS, 3 * MS, 0.3 * MS)
        : local(k === 'larm' ? -1.2 * MS : 1.2 * MS, 1.5 * MS, -1.4 * MS),
  };
}

export class GroundBrowser {
  constructor({ store, toast, onClose }) {
    this.store = store;
    this.toast = toast;
    this.onClose = onClose;
    this.open_ = false;
    this.tab = 'moves';
    this.sel = MOVES[0].id;
    this.q = '';
    this.speed = 1;
    this.rich = true;
    this.runs = [];
    this.idle = 0;
    this.grid = false;
    this.canvas = $('gdGl');
    this.renderer = makeRenderer(this.canvas, true);
    this.scene = new THREE.Scene();
    this.lights = addLights(this.scene);
    applyLight(this.scene, this.lights, null);
    // 地面：灰色平地＋10 m 的格線
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2400, 2400),
      new THREE.MeshStandardMaterial({ color: 0x5a5e62, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
    const grid = new THREE.GridHelper(2400, 240, 0x7a8086, 0x666a70);
    grid.position.y = 0.02;
    grid.material.transparent = true;
    grid.material.opacity = 0.35;
    this.scene.add(grid);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.5, 6000);
    this.controls = new THREE.OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.fx = new Effects(this.scene);
    this.fx.setK(DS);
    this.fx.richOf = () => this.rich;
    this.fx.ground = () => 0;
    this.fx.groundCol = () => 0x6a6e72;
    this.labels = [];
    this.uses = this.computeUses();
    this.setupUi();
    this.last = performance.now();
    requestAnimationFrame(() => this.loop());
  }

  // 每個招式用到哪些地面標示（不畫，只執行一次腳本）
  computeUses() {
    const stub = { pos: V(0, 0, 0), center: () => V(0, 4, 0), muzzle: () => V(0, 4, 0) };
    const uses = {};
    for (const m of MOVES) {
      const r = new Run({ fx: null, scene: null, src: stub, tgt: stub }, { dry: true });
      try {
        m.run(r);
        for (let i = 0; i < 40 && r.q.length; i++) r.tick(1); // 延遲的事件（只有記錄）
      } catch (e) {
        console.warn('地面標示：招式腳本出錯', m.id, e);
      }
      uses[m.id] = [...r.used];
    }
    return uses;
  }
  // 冒煙測試用：招式與地面標示的清單
  catalog() {
    return {
      moves: MOVES.map((m) => ({ id: m.id, src: m.src })),
      marks: MARKS.map((m) => m.key),
      uses: this.uses,
    };
  }
  // 冒煙測試用：不等實際時間，以固定 dt 推進 sec 秒（每 0.5 秒畫一格）
  step(sec, dt = 1 / 30) {
    for (let t = 0, i = 0; t < sec; t += dt, i++) {
      for (const r of this.runs) r.tick(dt);
      this.fx.update(dt);
      if (i % 15 === 0) {
        this.fx.flush();
        this.renderer.render(this.scene, this.camera);
      }
    }
  }
  movesUsing(key) {
    return MOVES.filter((m) => this.uses[m.id].includes(key));
  }

  // ---------- 開關 ----------
  async open() {
    $('ground').hidden = false;
    this.open_ = true;
    this.renderList();
    if (!this.tgt) {
      const a = await buildMechWithGlb(START_ASM, PALETTES.player, this.store, 1);
      const b = await buildMechWithGlb(
        START_ASM,
        PALETTES.enemy || PALETTES.red || PALETTES.player,
        this.store,
        1,
      );
      for (const r of [a.rig, b.rig]) {
        r.group.traverse((o) => {
          if (o.isMesh) o.castShadow = true;
        });
        this.scene.add(r.group);
      }
      this.tgt = actor(a.rig);
      this.src = actor(b.rig);
    }
    this.resize(true);
    this.pick(this.sel, true);
  }
  close() {
    $('ground').hidden = true;
    this.open_ = false;
    this.stopAll();
    if (this.onClose) this.onClose();
  }
  stopAll() {
    for (const r of this.runs) r.stop();
    this.runs = [];
    this.fx.clear();
    for (const l of this.labels) {
      this.scene.remove(l);
      l.material.map.dispose();
      l.material.dispose();
    }
    this.labels = [];
  }

  // ---------- 介面 ----------
  setupUi() {
    $('gdBack').onclick = () => this.close();
    addEventListener('keydown', (e) => {
      if (!this.open_ || e.target.closest('input,select,textarea')) return;
      if (e.key === 'Escape') this.close();
      else if (e.key === ' ') {
        e.preventDefault();
        this.replay();
      }
    });
    for (const b of $('gdTabs').querySelectorAll('button'))
      b.onclick = () => {
        this.tab = b.dataset.t;
        this.renderList();
      };
    $('gdSearch').oninput = () => {
      this.q = $('gdSearch').value.trim().toLowerCase();
      this.renderList();
    };
    $('gdPlay').onclick = () => this.replay();
    $('gdSpeed').onchange = () => (this.speed = +$('gdSpeed').value);
    $('gdRich').onchange = () => {
      this.rich = $('gdRich').checked;
      this.replay();
    };
    $('gdWarnOld').onchange = () => {
      this.fx.warnOld = $('gdWarnOld').checked;
      this.replay();
    };
    $('gdMechs').onchange = () => this.placeMechs();
    $('gdAll').onclick = () => this.showAll();
    $('gdCam').onclick = () => this.frame();
  }
  item(id) {
    return MOVES.find((m) => m.id === id) || MARKS.find((m) => m.key === id);
  }
  match(o) {
    if (!this.q) return true;
    const s = [o.name, o.who, o.src, o.fx, o.note, o.id, o.key].filter(Boolean).join(' ').toLowerCase();
    return s.includes(this.q);
  }
  renderList() {
    for (const b of $('gdTabs').querySelectorAll('button'))
      b.classList.toggle('sel', b.dataset.t === this.tab);
    const isMoves = this.tab === 'moves';
    const cats = isMoves ? MOVE_CATS : MARK_CATS;
    const list = isMoves ? MOVES : MARKS;
    let html = '';
    for (const [c, name] of cats) {
      const items = list.filter((o) => o.cat === c && this.match(o));
      if (!items.length) continue;
      html += `<h4>${escHtml(name)}（${items.length}）</h4>`;
      for (const o of items) {
        const id = isMoves ? o.id : o.key;
        const n = isMoves ? '' : `<span class="n">${this.movesUsing(o.key).length}</span>`;
        html += `<button data-id="${escHtml(id)}" class="${id === this.sel ? 'sel' : ''}">${escHtml(o.name)}${n}</button>`;
      }
    }
    $('gdList').innerHTML = html || '<div class="dim small">沒有符合的項目</div>';
    for (const b of $('gdList').querySelectorAll('button')) b.onclick = () => this.pick(b.dataset.id);
    const sel = $('gdList').querySelector('button.sel');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  pick(id, keepCam = false) {
    const o = this.item(id);
    if (!o) return;
    const camWas = this.grid;
    this.sel = id;
    this.grid = false;
    if (MOVES.includes(o) !== (this.tab === 'moves')) this.tab = MOVES.includes(o) ? 'moves' : 'marks';
    this.renderList();
    this.renderInfo(o);
    this.placeMechs();
    if (!keepCam || camWas || !this.camSet) this.frame();
    this.replay();
  }
  renderInfo(o) {
    $('gdName').textContent = o.name;
    const chip = (id, name) => `<button data-id="${escHtml(id)}">${escHtml(name)}</button>`;
    let h = '<dl>';
    if (MOVES.includes(o)) {
      const cat = MOVE_CATS.find((c) => c[0] === o.cat);
      h += `<dt>分類</dt><dd>${escHtml(cat ? cat[1] : '')}</dd>`;
      h += `<dt>誰會用</dt><dd>${escHtml(o.who || '')}</dd>`;
      h += `<dt>程式</dt><dd><code>${escHtml(o.src || '')}</code></dd>`;
      const used = this.uses[o.id].map((k) => MARKS.find((m) => m.key === k)).filter(Boolean);
      h += `<dt>用到的地面標示（點一下看單獨的）</dt><dd class="gdChips">${used.map((m) => chip(m.key, m.name)).join('') || '—'}</dd>`;
    } else {
      const cat = MARK_CATS.find((c) => c[0] === o.cat);
      h += `<dt>分類</dt><dd>${escHtml(cat ? cat[1] : '')}</dd>`;
      h += `<dt>說明</dt><dd>${escHtml(o.note || '')}</dd>`;
      h += `<dt>程式</dt><dd><code>${escHtml(o.fx || '')}</code></dd>`;
      const ms = this.movesUsing(o.key);
      h += `<dt>用在哪些招式（${ms.length}）</dt><dd class="gdChips">${ms.map((m) => chip(m.id, m.name)).join('') || '—'}</dd>`;
    }
    h += '</dl>';
    $('gdInfo').innerHTML = h;
    for (const b of $('gdInfo').querySelectorAll('button')) b.onclick = () => this.pick(b.dataset.id);
  }

  // ---------- 播放 ----------
  srcAt() {
    const o = this.item(this.sel);
    return (o && o.srcAt) || DEF_SRC;
  }
  placeMechs() {
    if (!this.tgt) return;
    const show = $('gdMechs').checked && !this.grid;
    const mv = MOVES.find((m) => m.id === this.sel);
    // 敵人：有指定位置、或是敵人出招的分類才顯示（陷阱、任務、機體動作不用）
    const foe =
      mv && (mv.srcAt || ['foe', 'special', 'theme', 'boss', 'b3', 'bfield', 'tier'].includes(mv.cat));
    this.tgt.rig.group.visible = show;
    this.src.rig.group.visible = !!(show && foe);
    this.tgt.rig.group.position.set(0, 0, 0);
    this.tgt.rig.group.rotation.y = 0;
    const [x, z] = this.srcAt();
    const p = this.src.rig.group.position;
    p.set(x * DS, 0, z * DS);
    this.src.rig.group.rotation.y = Math.atan2(p.x, p.z); // 面向原點（機體的正面是 −Z）
  }
  // 鏡頭：框住敵人與玩家（地面標示：前方 10 m 附近）
  frame() {
    this.camSet = true;
    const isMove = MOVES.some((m) => m.id === this.sel);
    const [x, z] = isMove ? this.srcAt() : [0, -10];
    const a = V(0, 0, 0),
      b = V(x * DS, 0, z * DS);
    const c = a.clone().lerp(b, 0.5);
    const span = Math.max(40 * DS, a.distanceTo(b) * 1.15);
    this.controls.target.copy(c).setY(3 * MS);
    this.camera.position.copy(c).add(V(0.55 * span, 0.62 * span, 0.85 * span));
    this.camera.updateProjectionMatrix();
  }
  replay() {
    if (this.grid) return this.showAll();
    this.stopAll();
    const o = this.item(this.sel);
    if (!o || !this.tgt) return;
    const r = new Run({ fx: this.fx, scene: this.scene, src: this.src, tgt: this.tgt });
    (o.run || o.demo)(r);
    this.runs = [r];
    this.idle = 0;
  }
  // 全部並排：每種地面標示放在一格，上方寫名稱
  showAll() {
    this.stopAll();
    this.grid = true;
    this.placeMechs();
    $('gdName').textContent = '全部並排';
    $('gdInfo').innerHTML =
      '<dl><dt>說明</dt><dd>每種地面標示放在一格、同時播放；點左邊的項目回到單獨的展示。</dd></dl>';
    MARKS.forEach((m, i) => {
      const off = V((i % GRID_COLS) * GRID_GAP, 0, Math.floor(i / GRID_COLS) * GRID_GAP);
      const r = new Run({ fx: this.fx, scene: this.scene, src: this.src, tgt: this.tgt }, { off });
      m.demo(r);
      this.runs.push(r);
      this.labels.push(this.label(m.name, off.clone().add(V(0, 9 * MS, -10 * DS))));
    });
    this.idle = 0;
    if (!this.gridCam) {
      this.gridCam = true;
      const W = (GRID_COLS - 1) * GRID_GAP,
        H = Math.floor((MARKS.length - 1) / GRID_COLS) * GRID_GAP;
      this.controls.target.set(W / 2, 0, H / 2 - 10 * DS);
      this.camera.position.set(W / 2, Math.max(W, H) * 0.9, H / 2 + Math.max(W, H) * 0.75);
    }
  }
  label(txt, p) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 96;
    const x = cv.getContext('2d');
    x.fillStyle = 'rgba(10,14,20,0.75)';
    x.fillRect(0, 0, 512, 96);
    x.fillStyle = '#ffd23f';
    x.font = 'bold 44px sans-serif';
    x.textAlign = 'center';
    x.fillText(txt, 256, 64, 490);
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false, transparent: true }),
    );
    s.scale.set(36 * MS, 6.75 * MS, 1);
    s.position.copy(p);
    s.renderOrder = 10;
    this.scene.add(s);
    return s;
  }
  resize(force) {
    const c = this.canvas,
      w = c.clientWidth,
      h = c.clientHeight;
    if (!w || !h) return;
    if (
      force ||
      c.width !== Math.round(w * this.renderer.getPixelRatio()) ||
      c.height !== Math.round(h * this.renderer.getPixelRatio())
    ) {
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
  }
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now(),
      real = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (!this.open_) return;
    const dt = real * this.speed;
    for (const r of this.runs) r.tick(dt);
    this.fx.update(dt);
    // 播完（腳本、自己管的物件、特效都結束）停 1 秒再重播
    const busy = this.runs.some((r) => r.busy) || this.fx.list.length > 0;
    if (!busy && $('gdLoop').checked && (this.idle += real) > 1) this.replay();
    if (busy) this.idle = 0;
    this.resize();
    this.controls.update();
    this.fx.flush();
    this.renderer.render(this.scene, this.camera);
  }
}
