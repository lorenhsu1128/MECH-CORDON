// Game：場景環境、後處理與渲染風格、主渲染
import { makeStudioEnv } from '../render/environment.js';
import { fineTick } from '../render/detail.js';
import { StylePipeline, manualShadows } from '../render/style/pipeline.js';
import { installStyleShader } from '../render/style/shader.js';
import { StyleStore } from '../render/style/store.js';
import { DS } from '../core/scale.js';
import { Game } from './game.js';
import { WARM, saveWarm, warmGroup } from '../render/shader-warm.js';

installStyleShader(); // 越早越好：之後建立的標準材質都會用風格著色器

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
      fogPush: () => this.camExtra || 0, // 鏡頭拉遠時霧往外推，機體附近保持清楚
      chromaPush: () => (this.chromaK || 0) * 0.7, // 受到重擊時的色差（game/juice.js）
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
  renderMain() {
    const lab = this.lab;
    const P = lab ? lab.P : this.cine ? this.cine.P : this.styleP; // 過場動畫：風格＋過場的調色（game/cine.js）
    const t = performance.now() / 1000;
    // 新地圖：整個場景的著色器先編好（要好幾秒）。第一格只顯示「準備中」並讓瀏覽器畫出來，下一格才預熱
    // 關卡編輯器（挑底圖時一直重建地圖）不預熱，照 three.js 原本的第一次畫到才編譯
    if (this.world && this.warmWorld !== this.world && this.state !== 'editor') {
      if (this.warmNote !== this.world) {
        this.warmNote = this.world;
        this.warmMsg(true);
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
  // 以 renderer.compile 把整個場景（含畫面外的）一次編好。render target 要和實際算繪的相同（程式的鍵含輸出的編碼）
  shaderWarm(root) {
    this.warmWorld = this.world;
    if (!root && this.vehPrebuild) this.vehPrebuild(); // 運輸車輛的模型先建好（也一起預熱）
    const R = this.renderer,
      cam = this.camera;
    if (!R || !cam) return;
    const pipe = this.post.enabled && this.post.ok && this.stylePipe;
    const rt0 = R.getRenderTarget();
    try {
      R.setRenderTarget(pipe ? pipe.rtScene : null);
      // 光源、霧、環境貼圖照主場景（程式的鍵含光源的數量），材質只走訪 root（沒給時整個場景）；
      // 略過 material 不是材質的物件（粒子批次的代理 fx/batch.js 也有 material 欄位）
      // 沒給 root 時：整個場景＋以前在任務中遇過的變體（假網格）＋SSAO 法線的蒙皮版與 InstancedMesh 版
      const extra = root ? null : warmGroup(pipe && pipe.ssao ? [pipe.skinN, pipe.instN] : []);
      if (extra) this.scene.add(extra);
      const r = root || this.scene;
      const ok = (m) => (Array.isArray(m) ? m.every((x) => x && x.isMaterial) : m.isMaterial);
      const fake = Object.create(this.scene);
      fake.traverse = (cb) =>
        r.traverse((o) => {
          if (!o.material || ((o.isMesh || o.isPoints || o.isLine || o.isSprite) && ok(o.material))) cb(o);
        });
      try {
        R.compile(fake, cam);
        if (!root && pipe) pipe.warm(); // 後處理的各段與熱扭曲的場景
      } finally {
        if (extra) this.scene.remove(extra);
      }
    } finally {
      R.setRenderTarget(rt0);
    }
  },
  // 預熱時的提示（畫面中央）；自動化測試照樣顯示，不影響判定
  warmMsg(on) {
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
    if (el) el.style.display = on ? '' : 'none';
  },
  // 低特效（大量單位的場面用）：o＝{ ssao: 'off'｜'half'｜'full', mblur: 布林 }，null＝恢復
  setLowFx(o) {
    if (this.stylePipe) this.stylePipe.setLowFx(o);
  },
  setPost(on) {
    this.post.enabled = on;
    try {
      localStorage.setItem('rubicon_post', on ? '1' : '0');
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
