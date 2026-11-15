// Game：人物動作預覽（標題「工具與其他」的「人物動作預覽」，docs/cine-redesign-design.md 第十一節「人物 v2」）。
// 過場用的人物（src/assets/people/、格納庫的 worker／crew／soldier）與它們的動作（原本的＋scripts/people-retarget.js
// 追加的 anims/）：選人物、選動作、速度、暫停、拖時間軸、繞看；「全部並排」＝所有人物做同一個動作（比對轉換的結果）。
// 自己的渲染器與畫布（不經過遊戲的主管線），state 'peoplelab' 時主迴圈只畫背景。
import { HA, PA, haChar, loadHangarAssets, loadPeopleAssets } from '../render/hangar-assets.js';
import { SFX } from '../audio/audio.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const NAMES = {
  worker: '工人',
  crew: '技師',
  soldier: '士兵',
  biz: '西裝（男）',
  suitw: '西裝（女）',
  hoodie: '帽 T',
  farmer: '農夫',
  casual: '休閒',
  hooded: '斗篷',
  pilot: '駕駛服',
  man: '男（低面數）',
  woman: '女（低面數）',
  womanc: '女休閒（低面數）',
  mansuit: '西裝（低面數）',
};
const SPEEDS = [0.25, 0.5, 1, 2];

Object.assign(Game.prototype, {
  openPeopleLab() {
    SFX.ui();
    this.state = 'peoplelab';
    this.showScreen('peopleLab');
    const L = (this.plab = this.plab || { who: 'worker', anim: 'Idle', speed: 1, pause: false, all: false });
    $('btnPlBack').onclick = () => {
      SFX.ui('back');
      this.plabClose();
    };
    $('plList').innerHTML = '<p class="dim">載入人物…</p>';
    Promise.all([loadHangarAssets(), loadPeopleAssets()]).then(() => {
      if (this.state !== 'peoplelab') return;
      // 人物＝有骨架網格與動作的 GLB（格納庫的道具、動作包不算）
      L.chars = Object.keys(HA.glb).filter((k) => {
        const g = HA.glb[k];
        if (!g || !g.animations || !g.animations.length || k.startsWith('anims/')) return false;
        let skin = false;
        g.scene.traverse((o) => o.isSkinnedMesh && (skin = true));
        return skin;
      });
      if (!L.chars.includes(L.who)) L.who = L.chars[0];
      this.plabSetup();
      this.plabBuild();
      this.plabRender();
    });
  },
  plabClose() {
    const L = this.plab;
    if (L) {
      cancelAnimationFrame(L.raf);
      L.raf = 0;
    }
    this.state = 'title';
    this.showScreen('title');
  },
  // 渲染器、場景、燈、地面、繞看
  plabSetup() {
    const L = this.plab;
    if (L.R) return this.plabLoop();
    const host = $('plView');
    L.R = new THREE.WebGLRenderer({ antialias: true });
    L.R.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    host.appendChild(L.R.domElement);
    L.scene = new THREE.Scene();
    L.scene.background = new THREE.Color(0x2a2d33);
    L.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3a44, 2.2));
    const d = new THREE.DirectionalLight(0xffffff, 1.8);
    d.position.set(3, 6, 5);
    L.scene.add(d);
    const grid = new THREE.GridHelper(40, 40, 0x555a66, 0x3a3e46);
    L.scene.add(grid);
    L.cam = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
    L.cam.position.set(2.2, 1.5, 5.5);
    L.ctl = new THREE.OrbitControls(L.cam, L.R.domElement);
    L.ctl.target.set(0, 0.95, 0);
    L.ctl.enableDamping = true;
    L.ctl.update();
    L.clock = new THREE.Clock();
    this.plabLoop();
  },
  plabLoop() {
    const L = this.plab;
    const tick = () => {
      if (this.state !== 'peoplelab') return;
      L.raf = requestAnimationFrame(tick);
      const host = $('plView');
      const w = host.clientWidth,
        h = host.clientHeight;
      if (w && h && (L.w !== w || L.h !== h)) {
        L.w = w;
        L.h = h;
        L.R.setSize(w, h);
        L.cam.aspect = w / h;
        L.cam.updateProjectionMatrix();
      }
      const dt = Math.min(0.1, L.clock.getDelta());
      if (!L.pause && !L.scrub) for (const p of L.ppl || []) p.ch.mixer.update(dt * L.speed);
      // 時間軸跟著第一個人的動作
      const a = L.ppl && L.ppl[0] && L.ppl[0].a;
      if (a && !L.scrub) $('plTime').value = String(Math.round((a.time / a.getClip().duration) * 1000) || 0);
      L.ctl.update();
      L.R.render(L.scene, L.cam);
    };
    cancelAnimationFrame(L.raf);
    L.raf = requestAnimationFrame(tick);
  },
  // 放人物：單人＝選的那一個；全部並排＝每個人物一排
  plabBuild() {
    const L = this.plab;
    for (const p of L.ppl || []) L.scene.remove(p.ch.g);
    L.ppl = [];
    const list = L.all ? L.chars : [L.who];
    list.forEach((name, i) => {
      const ch = haChar(name);
      if (!ch) return;
      const h0 = PA.h[name] || { worker: 1.85, crew: 1.9, soldier: 1.85 }[name] || 1.8;
      ch.g.scale.setScalar(1.75 / h0);
      // 全部並排：每排 7 個、往後排
      const cols = Math.min(7, list.length),
        row = Math.floor(i / cols),
        col = i % cols;
      ch.g.position.set((col - (cols - 1) / 2) * 1.2, 0, -row * 1.8);
      L.scene.add(ch.g);
      const a = ch.acts[L.anim] || ch.acts.Idle;
      if (a) {
        a.reset().play();
        // 沒有這個動作的人物：照待機，名單上標出來
      }
      L.ppl.push({ name, ch, a, has: !!ch.acts[L.anim] });
    });
    // 鏡頭：並排時拉遠
    if (L.all) {
      const cols = Math.min(7, list.length),
        rows = Math.ceil(list.length / cols);
      L.ctl.target.set(0, 0.8, -((rows - 1) * 1.8) / 2);
      L.cam.position.set(0, 2.5 + rows * 1.0, Math.max(5.5, cols * 1.35));
    }
  },
  // 左邊的清單：人物、動作（原本的／追加的）、播放控制
  plabRender() {
    const L = this.plab;
    const ch0 = haChar(L.who);
    const own = new Set((HA.glb[L.who].animations || []).map((c) => c.name.split('|').pop()));
    const all = ch0 ? Object.keys(ch0.acts) : [];
    const base = all.filter((n) => own.has(n)).sort(),
      extra = all.filter((n) => !own.has(n)).sort();
    const btn = (on, data, label, title = '') =>
      `<button class="plBtn${on ? ' on' : ''}" ${data} title="${title}">${label}</button>`;
    const missing = L.all ? L.ppl.filter((p) => !p.has).map((p) => NAMES[p.name] || p.name) : [];
    $('plList').innerHTML =
      `<h3>人物</h3><div class="plRow" data-padtabs=".plBtn">` +
      L.chars.map((k) => btn(k === L.who, `data-who="${k}"`, NAMES[k] || k, k)).join('') +
      `</div><label class="plChk"><input type="checkbox" id="plAll" ${L.all ? 'checked' : ''}> 全部並排（所有人物做同一個動作）</label>` +
      `<h3>原本的動作（${base.length}）</h3><div class="plRow">` +
      base.map((n) => btn(n === L.anim, `data-anim="${n}"`, n)).join('') +
      `</div><h3>追加的動作（${extra.length}）</h3><div class="plRow">` +
      (extra.length
        ? extra.map((n) => btn(n === L.anim, `data-anim="${n}"`, n)).join('')
        : '<span class="dim">這個人物的骨架沒有追加的動作</span>') +
      `</div><h3>播放</h3><div class="plRow">` +
      SPEEDS.map((s) => btn(s === L.speed, `data-speed="${s}"`, s + '×')).join('') +
      btn(L.pause, 'data-pause="1"', L.pause ? '▶ 播放' : '❚❚ 暫停') +
      `</div>` +
      (missing.length ? `<p class="dim">沒有「${L.anim}」、照待機的：${missing.join('、')}</p>` : '');
    for (const b of $('plList').querySelectorAll('[data-who]'))
      b.onclick = () => {
        L.who = b.dataset.who;
        this.plabBuild();
        this.plabRender();
      };
    for (const b of $('plList').querySelectorAll('[data-anim]'))
      b.onclick = () => {
        L.anim = b.dataset.anim;
        this.plabBuild();
        this.plabRender();
      };
    for (const b of $('plList').querySelectorAll('[data-speed]'))
      b.onclick = () => {
        L.speed = +b.dataset.speed;
        this.plabRender();
      };
    $('plList').querySelector('[data-pause]').onclick = () => {
      L.pause = !L.pause;
      this.plabRender();
    };
    $('plAll').onchange = (e) => {
      L.all = e.target.checked;
      this.plabBuild();
      this.plabRender();
    };
    // 時間軸：拖的時候所有人物停在那個時間點
    const tl = $('plTime');
    tl.oninput = () => {
      L.scrub = true;
      for (const p of L.ppl) if (p.a) p.a.time = (+tl.value / 1000) * p.a.getClip().duration;
      for (const p of L.ppl) p.ch.mixer.update(0);
    };
    tl.onchange = () => (L.scrub = false);
  },
});
