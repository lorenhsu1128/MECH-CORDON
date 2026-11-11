// Game：場景環境、後處理與渲染風格、主渲染
import { energyWarm } from '../fx/energy.js';
import { makeStudioEnv } from '../render/environment.js';
import { fineTick } from '../render/detail.js';
import { StylePipeline, manualShadows } from '../render/style/pipeline.js';
import { installStyleShader } from '../render/style/shader.js';
import { StyleStore } from '../render/style/store.js';
import { DS } from '../core/scale.js';
import { Game } from './game.js';
import { WARM, saveWarm, transpWarm, warmGroup } from '../render/shader-warm.js';
import { legacyTarget } from '../render/legacy-rt.js';

installStyleShader(); // 越早越好：之後建立的標準材質都會用風格著色器

// 陰影的深度材質（docs/perf-campaign-plan.md 第 3 期）：three.js 對一般網格共用一個 MeshDepthMaterial，蒙皮網格
// （合併過的專屬敵人）、InstancedMesh 和一般網格交替畫的時候，這個材質的 skinning／instancing 旗標一直切換，
// 每切一次就重算一次程式參數與快取鍵（Lattice-9 每格約 30 次，是戰鬥中 GC 的大宗）。蒙皮與 InstancedMesh
// 改用各自的深度材質（原型上的 customDepthMaterial；物件自己設的照舊優先），產生的程式和原本相同。
// 需要 three.js 另外處理的（alphaTest 貼圖、置換、剪裁、alphaToCoverage、morph）照原本的路徑。
{
  const D = {
    skin: new THREE.MeshDepthMaterial(),
    inst: new THREE.MeshDepthMaterial(),
    instC: new THREE.MeshDepthMaterial(),
  };
  const shared = (o) => {
    const m = o.material;
    if (!m || Array.isArray(m) || m.alphaTest > 0 || m.alphaToCoverage) return undefined;
    if ((m.displacementMap && m.displacementScale !== 0) || (m.clippingPlanes && m.clippingPlanes.length))
      return undefined;
    if (o.isSkinnedMesh) return o.morphTargetInfluences ? undefined : D.skin;
    if (o.morphTexture) return undefined;
    return o.instanceColor ? D.instC : D.inst;
  };
  // 半透明的雙面材質：three.js 每次畫都分成背面、正面兩次，各設一次 needsUpdate（每格重算程式參數）。
  // 不寫深度、而且兩層的顏色一定相同（加色；或不受光、沒有貼圖與頂點色的 MeshBasicMaterial）時，
  // 同色同透明度疊兩層和先畫哪一層無關，所以改成畫一次（forceSinglePass），結果完全相同。物件自己設的照舊
  const single = (m) =>
    m.transparent === true &&
    m.side === THREE.DoubleSide &&
    m.depthWrite === false &&
    (m.blending === THREE.AdditiveBlending ||
      (m.isMeshBasicMaterial === true && !m.map && !m.alphaMap && !m.vertexColors));
  Object.defineProperty(THREE.Material.prototype, 'forceSinglePass', {
    get() {
      return this._fsp === true || single(this);
    },
    // copy()／clone() 會把讀到的值寫回來：符合條件時不記（之後改了深度寫入等設定照樣重新判斷）
    set(v) {
      this._fsp = v === true && !single(this);
    },
    configurable: true,
  });
  for (const C of [THREE.SkinnedMesh, THREE.InstancedMesh])
    Object.defineProperty(C.prototype, 'customDepthMaterial', {
      get() {
        return this._cdm !== undefined ? this._cdm : shared(this);
      },
      set(v) {
        this._cdm = v;
      },
      configurable: true,
    });
}

Object.assign(Game.prototype, {
  // ---------- environment map (procedural studio: sky gradient + light panels) ----------
  setupEnvironment() {
    try {
      const cube = makeStudioEnv();
      this.scene.environment = cube;
      this.envTex = cube;
    } catch (e) {
      console.warn('env failed', e);
    }
  },
  // ---------- 後處理與渲染風格（render/style/：材質著色、描線、Bloom、SSAO、調色）----------
  setupPost() {
    this.sunOff = new THREE.Vector3(40, 80, 30); // 太陽相對鏡頭注視點的位置（渲染風格可改方位與高度）
    this.styleP = StyleStore.current();
    this.applyRes();
    manualShadows(this.renderer); // 陰影貼圖每格只畫一次：loop 開頭設 needsUpdate（SSAO 的法線不再觸發）
    this.stylePipe = new StylePipeline(this.renderer, {
      scene: this.scene,
      camera: this.camera,
      sun: this.sun,
      hemi: this.hemi,
      sunOff: this.sunOff,
      sceneExp: () => (this.world && this.world.theme && this.world.theme.linExp) || 1, // 依場景的曝光補正
      // 色彩管理打開時（world.js 的 CM_EXP；linear＝線性色調映射時再乘 CM_LIN_EXP）
      cmExp: (linear) => {
        const T = this.world && this.world.theme;
        if (!T) return this.cine ? 1.4 : 1; // 過場動畫自己的場景（太空、軌道站…）：量測的平均
        return (T.cmExp || 1) * (linear ? T.cmLinExp || 1 : 1);
      },
      fogPush: () => this.camExtra || 0, // 鏡頭拉遠時霧往外推，機體附近保持清楚
      chromaPush: () => (this.chromaK || 0) * 0.7, // 受到重擊時的色差（game/juice.js）
      comicPush: () => this.comicState(), // 漫畫的衝擊畫格（game/juice.js 的 comicHit）
      wscale: () => DS, // 機甲三倍高改版
      sceneTweak: (s) => this.water && this.water.fogTweak(s), // 水面下的霧（fx/water/index.js）
      heat: () => this.fx && { scene: this.fx.heatScene, on: this.fx.heatOn() }, // 熱扭曲（fx/effects.js，第 8.3 期）
      // 光束與鏡頭光斑（第 8.6 期）：砲火特效「華麗」、地上（有岩頂的地下沒有天空）
      rays: () => !!(this.fx && this.fx.rich && this.world && !this.world.theme.roof),
    });
    this.stylePipe.applyStructural(this.styleP);
  },
  // 渲染解析度（效能設定，不屬於風格）：裝置像素比上限 1.75 再乘上設定值
  applyRes() {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75) * StyleStore.data.res);
  },
  // 重新讀取選用的渲染風格（任務中不換：只在標題、車庫、出擊前呼叫）
  // 選用某個風格並立刻套用（截圖比較腳本 scripts/style-shots.js 在任務中切換用；一般的流程走設定畫面）
  styleUse(k, id) {
    StyleStore.select(k, id);
    this.styleRefresh();
  },
  styleRefresh() {
    this.styleP = StyleStore.current();
    this.styleStructural(this.styleP);
  },
  // 色調映射、陰影種類改變時要重新編譯材質
  styleStructural(P) {
    const pipes = [this.stylePipe, this.garagePipe, this.hubPipe].filter(Boolean);
    let ch = false;
    for (const p of pipes) ch = p.applyStructural(P) || ch;
    if (!ch) return;
    for (const s of [this.scene, this.garageScene, this.hubScene])
      if (s)
        s.traverse((o) => {
          const m = o.material;
          if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
        });
  },
  postResize(w, h) {
    if (this.stylePipe) this.stylePipe.setSize(w, h);
    if (this.garagePipe) this.garagePipe.setSize(w, h);
    if (this.hubPipe) this.hubPipe.setSize(w, h);
  },
  // 內建風格的依地圖覆寫（params.js 的 byTheme）：目前的主題、地下（有岩頂）、夜間（主題的 noTod）依序蓋上去
  styleThemed(P) {
    const B = P && P._byTheme;
    const w = this.world;
    if (!B || !w || !w.theme) return P;
    const tags = [this.worldTheme];
    if (w.theme.roof) tags.push('@roof');
    if (w.theme.noTod) tags.push('@night');
    const sig = tags.join(',');
    const c = this.stThemed;
    if (c && c.P === P && c.sig === sig) return c.out;
    const out = Object.assign({}, P);
    for (const t of tags) if (B[t]) Object.assign(out, B[t]);
    this.stThemed = { P, sig, out };
    return out;
  },
  renderMain() {
    const lab = this.lab;
    const P = this.styleThemed(lab ? lab.P : this.cine ? this.cine.P : this.styleP); // 過場動畫：風格＋過場的調色（game/cine.js）
    const t = performance.now() / 1000;
    // 新地圖：整個場景的著色器先編好。第一格只顯示「準備中」並讓瀏覽器畫出來，下一格才預熱；
    // 非同步（warmAsyncOk）時背景編譯，完成前不畫場景、主迴圈也停住（loop 開頭看 warmBusy）。
    // 關卡編輯器（挑底圖時一直重建地圖）不預熱，照 three.js 原本的第一次畫到才編譯
    if (this.warmBusy) return;
    if (this.world && this.warmWorld !== this.world && this.state !== 'editor') {
      if (this.warmNote !== this.world) {
        this.warmNote = this.world;
        this.warmMsg(true);
        return;
      }
      if (this.warmAsyncOk()) {
        this.warmAsyncN = (this.warmAsyncN || 0) + 1; // 冒煙測試看有沒有走非同步
        const busy = (this.warmBusy = this.shaderWarm(null, true));
        const done = () => {
          if (this.warmBusy !== busy) return;
          this.warmPrime();
          this.warmBusy = null;
          this.warmMsg(false);
        };
        // 保險：驅動程式一直沒回報完成時（裝置遺失等）最多等 20 秒
        Promise.race([busy, new Promise((r) => setTimeout(r, 20000))]).then(done, done);
        return;
      }
      this.shaderWarm();
      this.warmMsg(false);
    }
    if ((this.frames & 511) === 0) saveWarm();
    WARM.rec = !!this.world; // 這段期間新編的風格著色器變體記下來（render/shader-warm.js）
    try {
      this.renderMainInner(lab, P, t);
    } finally {
      WARM.rec = false;
    }
  },
  renderMainInner(lab, P, t) {
    if (this.fx) this.fx.flush(); // 粒子批次：fx.update 之後才產生的粒子也寫進去（fx/batch.js）
    if (this.bfVis) this.bfVis(this.lastDt || 0.016); // Boss 改版的場地效果（boss-field.js）
    fineTick(this.camera, 1); // 小細節的距離分級（render/detail.js）
    if (this.world && this.world.weather)
      this.world.weather.update(this.camera, t, this.renderer.getPixelRatio());
    this.fxAmbientTick(); // 地圖的持續特效（game/fx-ambient.js）
    this.propDmgTick(); // 地圖物件的受損效果（game/destruct.js）
    this.waterTick(); // 水面與雲海（game/water.js）：模擬、焦散、平面反射
    if (this.fx) this.fx.lightTick(this.camera, this.camTarget); // 火光（fx/effects.js，第 8.2 期）
    if (this.post.enabled && this.post.ok) this.stylePipe.render(P, t, lab && lab.cmp ? lab.cmpArg() : null);
    else this.stylePipe.renderPlain(P, t);
    this.waterAfter();
  },
  // 著色器預熱（docs/perf-threejs-upgrade.md）：three.js 要等網格第一次畫到才編譯它的著色器（一個 0.1～0.4 秒、畫面停住），
  // 畫面外的敵人、地圖物件會在戰鬥中第一次轉過去時才編。新地圖第一次算繪前（出擊、主線換區段、自訂關卡、客機開局）
  // 把整個場景（含畫面外的）一次編好。render target 要和實際算繪的相同（程式的鍵含輸出的編碼與色調映射）。
  // async：renderer.compileAsync（KHR_parallel_shader_compile，驅動程式在背景平行編譯），回傳全部完成的 Promise；
  // 否則 renderer.compile（r187 也不會每個程式停下來等，但第一次畫的時候會等它編完）
  shaderWarm(root, async = false) {
    if (!root) this.warmWorld = this.world;
    if (!root && this.vehPrebuild) this.vehPrebuild(); // 運輸車輛的模型先建好（也一起預熱）
    const R = this.renderer,
      cam = this.camera;
    if (!R || !cam) return async ? Promise.resolve() : undefined;
    const pipe = this.post.enabled && this.post.ok && this.stylePipe;
    const rt0 = R.getRenderTarget();
    const ps = [];
    try {
      R.setRenderTarget(pipe ? pipe.rtScene : null);
      // 光源、霧、環境貼圖照主場景（targetScene；程式的鍵含光源的數量），材質只走訪 root（沒給時整個場景）。
      // three.js 只處理 Mesh／Points／Line／Sprite（粒子批次的代理 fx/batch.js 不是網格，不會走到）。
      // 沒給 root 時另外加：以前在任務中遇過的變體（假網格）＋SSAO 法線的蒙皮版與 InstancedMesh 版
      const extra = root ? null : warmGroup(pipe && pipe.ssao ? [pipe.skinN, pipe.instN] : []);
      // 增援會出現的程式模型（載具、無人機…）先建一次（mission.js 的 typePrewarm）：只在房主／單機
      if (extra && this.typePrewarm && !(this.net && this.net.role === 'client'))
        extra.add(this.typePrewarm());
      if (extra && this.crowdWarm) extra.add(this.crowdWarm()); // 降落傘、血跡（crowd.js）
      // 地圖物件碎片的批次（fx/effects.js 的 debBatch：InstancedMesh＋每個實例的顏色＋投影），第一次打壞東西時才建
      if (extra) {
        const dm = new THREE.InstancedMesh(
          new THREE.BoxGeometry(1, 1, 1),
          new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.85,
            metalness: 0.2,
            flatShading: true,
          }),
          1,
        );
        dm.setColorAt(0, new THREE.Color(1, 1, 1));
        dm.castShadow = true;
        extra.add(dm);
      }
      if (extra && this.fx.rich) extra.add(energyWarm(this.fx.k)); // 第 9 期的護罩、光柱、預警（fx/energy.js）
      // 場景與上面那些的半透明版（淡出、碎塊、掉板；render/shader-warm.js 的 transpWarm）
      if (extra) {
        const tw = transpWarm(this.scene);
        for (const d of [...transpWarm(extra).children]) tw.add(d);
        extra.add(tw);
      }
      if (extra) this.scene.add(extra);
      try {
        const r = root || this.scene;
        if (async) ps.push(R.compileAsync(r, cam, this.scene));
        else R.compile(r, cam, this.scene);
        if (!root && pipe) ps.push(...pipe.warm(async)); // 後處理的各段與熱扭曲的場景
      } finally {
        if (extra) this.scene.remove(extra); // 編譯已經送出（compileAsync 等的是材質的程式，網格拿掉也沒關係）
        // warmPrime 再放回去畫一次：陰影的深度材質與 SSAO 法線的變體（compile 編不到）也要涵蓋這些模型
        // （docs/perf-campaign-plan.md 第 2 期：以前開打後 1～2 秒才編這些，一次 400～600 ms）
        if (!root) this.warmExtra = extra;
      }
    } finally {
      R.setRenderTarget(rt0);
    }
    return async ? Promise.all(ps) : undefined;
  },
  // 任務中才加進場景的模型（增援、隨機組裝的敵對 AC）：它的材質與半透明版在背景編譯（compileAsync）。
  // 半透明版在擊破時的碎片、掉板才用到（以前那時候才現場編譯，一次 150～290 ms；2026-11-07）
  // 生成那一格不做（建立程式本身也要 JS 的時間）：排隊，瀏覽器有空檔時（requestIdleCallback）一台一台做
  warmLate(root) {
    const R = this.renderer;
    if (!R || !root || typeof R.compileAsync !== 'function') return;
    if (this.warmWorld !== this.world || this.warmBusy) return; // 地圖的預熱還沒做：到時一起
    const q = this.warmQ || (this.warmQ = []);
    q.push({ root, world: this.world });
    if (q.length > 1) return;
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
    const next = () =>
      idle(
        () => {
          const it = q.shift();
          if (it && it.world === this.world && it.root.parent) this.warmLateNow(it.root);
          if (q.length) next();
        },
        { timeout: 1500 },
      );
    next();
  },
  warmLateNow(root) {
    const R = this.renderer,
      cam = this.camera;
    if (!R || !cam) return;
    const pipe = this.post.enabled && this.post.ok && this.stylePipe;
    const rt0 = R.getRenderTarget();
    const tw = transpWarm(root);
    try {
      R.setRenderTarget(pipe ? pipe.rtScene : null);
      this.scene.add(tw);
      R.compileAsync(tw, cam, this.scene).catch(() => {});
      if (root.parent) R.compileAsync(root, cam, this.scene).catch(() => {});
    } catch (e) {
      /* 預熱失敗：照原本第一次畫到才編譯 */
    } finally {
      this.scene.remove(tw);
      R.setRenderTarget(rt0);
    }
  },
  // 預熱完成、開始遊戲前（「戰場準備中」還蓋著）：整個場景不做視錐剔除、連陰影畫一次到很小的 render target，
  // 幾何與貼圖上傳到顯示卡、陰影的深度材質（compile 不會編到）在這時完成，第一個真正的畫面不再停住
  warmPrime() {
    const R = this.renderer,
      s = this.scene,
      cam = this.camera;
    if (!R || !s || !cam) return;
    const rt = this.primeRT || (this.primeRT = legacyTarget(new THREE.WebGLRenderTarget(4, 4)));
    const extra = this.warmExtra;
    this.warmExtra = null;
    if (extra) s.add(extra);
    const off = [];
    s.traverse((o) => {
      if ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && o.frustumCulled) {
        o.frustumCulled = false;
        off.push(o);
      }
    });
    const rt0 = R.getRenderTarget();
    try {
      R.shadowMap.needsUpdate = true;
      R.setRenderTarget(rt);
      R.render(s, cam);
      // SSAO 的法線那一次（蒙皮、InstancedMesh、一般網格各一個材質，依網格的旗標各有變體）
      const pipe = this.post.enabled && this.post.ok && this.stylePipe;
      if (pipe && pipe.ssao && pipe.renderNormals) pipe.renderNormals(pipe.ssao);
    } finally {
      for (const o of off) o.frustumCulled = true;
      if (extra) s.remove(extra);
      R.setRenderTarget(rt0);
      R.shadowMap.needsUpdate = true;
    }
  },
  // 非同步預熱：單人才用（多人時房主停住會讓客機以為房主失聯）；自動化測試照舊同步（__pump 一次推進好幾格時
  // Promise 不會完成），要測非同步時設 window.__warmAsync
  warmAsyncOk() {
    if ((this.net && this.net.role) || this.pumpDt) return false; // net 物件單人時也在（role 是 null）
    if (typeof this.renderer.compileAsync !== 'function') return false;
    return !navigator.webdriver || !!window.__warmAsync;
  },
  // 預熱時的提示（畫面中央）；自動化測試照樣顯示，不影響判定
  warmMsg(on, txt = '戰場準備中…') {
    let el = document.getElementById('warmMsg');
    if (!el && on) {
      el = document.createElement('div');
      el.id = 'warmMsg';
      el.textContent = '戰場準備中…';
      el.style.cssText =
        'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:60;pointer-events:none;' +
        'padding:10px 22px;background:rgba(8,12,18,0.82);border:1px solid rgba(126,224,129,0.5);color:#bfe9c0;' +
        'font:15px/1.4 sans-serif;letter-spacing:0.15em';
      document.body.appendChild(el);
    }
    if (el) {
      if (on) el.textContent = txt;
      el.style.display = on ? '' : 'none';
    }
  },
  // 低特效（大量單位的場面用）：o＝{ ssao: 'off'｜'half'｜'full', mblur: 布林 }，null＝恢復
  setLowFx(o) {
    if (this.stylePipe) this.stylePipe.setLowFx(o);
  },
  setPost(on) {
    this.post.enabled = on;
    try {
      localStorage.setItem('mech_cordon_post', on ? '1' : '0');
    } catch (e) {}
  },
  wrapFx() {
    const g0 = this;
    this.fx.onMeleeStop = (p, s, r) => g0.meleeStopNear(p, s, r); // 客機的近戰頓格（juice.js）
    const origEmp = this.fx.empBeam;
    this.fx.empBeam = function (w, a, b, color) {
      if (g0.net && g0.net.role === 'host') {
        w._ebT = (w._ebT || 0) + (g0.lastDt || 0.016);
        if (w._ebT >= 0.05) {
          w._ebT = 0;
          g0.netEv({
            t: 'ebeam',
            o: w.slot,
            e: w.ownerId,
            a: [+a.x.toFixed(1), +a.y.toFixed(1), +a.z.toFixed(1)],
            b: [+b.x.toFixed(1), +b.y.toFixed(1), +b.z.toFixed(1)],
            c: color,
          });
        }
      }
      return origEmp.call(this, w, a, b, color);
    };
    const names = [
      'explosion',
      'spark',
      'muzzle',
      'beam',
      'chevrons',
      'dust',
      'slash',
      'meleeHit',
      'ring',
      'shockwave',
      'flash',
      'streaks',
      'warnLine',
      'warnRect',
      'pulseShell',
      'firePool',
      'flameCone',
      'pillarStrike',
      'gather',
      'arc',
      'star',
      'bolt', // 鋸齒電弧（第 7.3 期，NET_VERSION 11.21）
      'shieldFlare', // 屏障的閃光（第 9.2 期，NET_VERSION 11.28）
    ];
    const fx = this.fx;
    const g = this;
    for (const n of names) {
      const orig = fx[n];
      fx[n] = function (...args) {
        if (g.net && g.net.role === 'host' && !fx._nested) {
          fx._nested = true;
          try {
            g.netEv({
              t: 'fx',
              n,
              a: args.map((v) =>
                v && v.isVector3
                  ? [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]
                  : v instanceof Set
                    ? null
                    : v,
              ),
            });
            const r = orig.apply(fx, args);
            return r;
          } finally {
            fx._nested = false;
          }
        }
        return orig.apply(fx, args);
      };
    }
  },
});
