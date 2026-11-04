// ============================================================
//  EFFECTS — 加色發光粒子、曳光、衝擊波、塵土、彈殼
// ============================================================
import { SFX } from '../audio/audio.js';
import { frand, frnd as rnd } from './rand.js';
import { mergeGeos } from '../render/geometry.js';
import { FxBatch } from './batch.js';
import { GpuFx } from './gpu.js';
import { FXC, FXG, pickCell, SOFT, LINE, BEAM, CRATER, RIM } from './atlas.js';
import { emitPreset } from './presets.js';
import { beamColor } from './palette.js';
import { GhostFx } from '../render/ghost.js';
import { ThrusterFx } from './thruster.js';
import { RibbonFx } from './trail.js';
import { MB } from '../core/scale.js';
import { PMAT, propDebrisCol } from '../data/destruct.js';

// 擊破時跪倒崩落的秒數（之後才碎裂）
export const COLLAPSE_T = 0.55;

const FX_BUSY = 400; // 特效數量達到這個數時才略過畫面外的小粒子（一般戰鬥照原本）
const FX_FAR = 70; // 粒子很多時，離鏡頭這麼遠（m）以上的減量
const _skS = new THREE.Sphere(),
  _skV = new THREE.Vector3(),
  _Z = new THREE.Vector3(0, 0, 1);

// 燃燒地面的底圈（docs/vfx-design.md 第 8.2 期）：焦黑（一般混合，邊緣柔和、斑駁）與發光的餘燼（加色的灰階、裂紋狀的亮點），
// 程式產生的 Canvas 貼圖，所有燃燒地面共用
const POOL_TEX = {};
function poolTex(kind) {
  if (POOL_TEX[kind]) return POOL_TEX[kind];
  const N = 256,
    cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d');
  const C = N / 2;
  if (kind === 'scorch') {
    const gr = c.createRadialGradient(C, C, N * 0.05, C, C, N * 0.5);
    gr.addColorStop(0, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, N, N);
    // 斑駁：邊緣一圈不規則的缺口
    c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 70; i++) {
      const a = frand() * 6.283,
        r = N * (0.3 + frand() * 0.22),
        rr = N * (0.02 + frand() * 0.06);
      c.fillStyle = `rgba(0,0,0,${0.25 + frand() * 0.5})`;
      c.beginPath();
      c.arc(C + Math.cos(a) * r, C + Math.sin(a) * r, rr, 0, 6.283);
      c.fill();
    }
  } else {
    // 餘燼：柔和的底光＋裂紋狀的亮線與亮點
    c.fillStyle = '#000';
    c.fillRect(0, 0, N, N);
    const gr = c.createRadialGradient(C, C, 0, C, C, N * 0.5);
    gr.addColorStop(0, 'rgba(150,150,150,1)');
    gr.addColorStop(0.55, 'rgba(70,70,70,1)');
    gr.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = gr;
    c.fillRect(0, 0, N, N);
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (let i = 0; i < 26; i++) {
      let x = C + (frand() - 0.5) * N * 0.7,
        y = C + (frand() - 0.5) * N * 0.7,
        a = frand() * 6.283;
      if (Math.hypot(x - C, y - C) > N * 0.42) continue;
      c.strokeStyle = `rgba(255,255,255,${0.35 + frand() * 0.4})`;
      c.lineWidth = 1 + frand() * 2.5;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        a += (frand() - 0.5) * 1.6;
        x += Math.cos(a) * N * 0.04;
        y += Math.sin(a) * N * 0.04;
        c.lineTo(x, y);
      }
      c.stroke();
    }
    for (let i = 0; i < 60; i++) {
      const r = Math.sqrt(frand()) * N * 0.42,
        a = frand() * 6.283;
      c.fillStyle = `rgba(255,255,255,${0.3 + frand() * 0.6})`;
      c.beginPath();
      c.arc(C + Math.cos(a) * r, C + Math.sin(a) * r, 1 + frand() * 3, 0, 6.283);
      c.fill();
    }
  }
  const t = new THREE.CanvasTexture(cv);
  POOL_TEX[kind] = t;
  return t;
}

const FIRE_LIGHTS = 3;
const COLUMNS_MAX = 4;
// 地面材質的顏色（第 8.4 期）：沙與混凝土用主題的地面色（往亮一點混），其他固定
const SURF_COL = { snow: 0xf2f6fa, ice: 0xdcecf6, water: 0xe8f2f8 };
const _gc = new THREE.Color();
function mixHex(a, b, t) {
  _gc.setHex(a).lerp(new THREE.Color(b), t);
  return _gc.getHex();
}
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.list = [];
    this.sphereGeo = new THREE.SphereGeometry(1, 8, 6);
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1);
    this.chevGeo = new THREE.ConeGeometry(0.35, 0.7, 3);
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 32);
    this.discGeo = new THREE.CircleGeometry(1, 20);
    // k：裝飾性的大小與速度（閃光、火花、煙、衝擊環、光束寬、碎片）的倍率；參數照舊尺度傳，這裡乘上。
    // 和判定一致的範圍（預警圈、地面衝擊波、燃燒地面、能量環、斬擊半徑）是世界尺寸，不乘。Game 設定（setK）
    this.k = 1;
    this.light = new THREE.PointLight(0xffc070, 0, 26, 2);
    scene.add(this.light);
    this.lightT = 0;
    // 火光（第 8.2 期）：固定 FIRE_LIGHTS 盞點光源（數量固定，不會讓材質重新編譯），每格分給離鏡頭最近的火源（glow 登記）
    this.fireLights = [];
    for (let i = 0; i < FIRE_LIGHTS; i++) {
      const L = new THREE.PointLight(0xff7a2a, 0, 12, 2);
      scene.add(L);
      this.fireLights.push(L);
    }
    this.glows = new Map();
    this.hitStop = 0;
    this.thruster = new ThrusterFx(scene); // 機甲推進器噴焰粒子
    this.thruster.cull = (p) => this.skip(p, 4);
    this.thruster.onHeat = (p, s, a) => this.heat(p, s, 0.25, a, 2.5); // 推進器噴口後方的熱扭曲
    this.ribbons = new RibbonFx(scene); // 帶狀軌跡：刀光、地面的推進氣流帶（fx/trail.js）
    this.ghosts = new GhostFx(scene); // 殘影（render/ghost.js，只給玩家自己）
    this.view = null; // 粒子的距離分級（skip／far）：上一格鏡頭的視錐與位置
    this.viewPos = new THREE.Vector3();
    // 顯示卡粒子（fx/gpu.js，docs/vfx-design.md）：產生時寫一次，之後由著色器依 fx.time 算動態。
    // 時鐘 fx.time 只在 update 前進（暫停時粒子停住），clear 歸零
    this.time = 0;
    this.g = {
      sm: new GpuFx(scene, { add: false, lit: true, wind: 1, soft: 0.25 }), // 煙、塵土（一般混合，先畫；受光、隨風）
      gl: new GpuFx(scene, { wind: 0.3, soft: 0.35 }), // 閃光、火球、火焰（火舌與火星稍微隨風）
      ln: new GpuFx(scene, { mode: 'stretch', spd: 0.035, maxL: 1.6 }), // 火花、光束、槍口火焰、刀痕
      rg: new GpuFx(scene, { mode: 'ground' }), // 衝擊環
      dc: new GpuFx(scene, { mode: 'ground', add: false, cap: 64 }), // 焦痕
    };
    // 熱扭曲（第 8.3 期）：熱源畫在自己的場景（不在主場景裡），管線把它畫成強度圖、依它扭曲畫面；只有砲火特效「華麗」
    this.heatScene = new THREE.Scene();
    this.ht = new GpuFx(this.heatScene, { soft: 0.3, cap: 256 });
    this.heatT = -1; // 最後一個熱源結束的時間（特效時鐘）
    this.gList = [...Object.values(this.g), this.ht];
    // CPU 的粒子批次（fx/batch.js）：受光的碎片與彈殼、跟著實體的光暈與子彈、突進箭頭
    this.batches = {
      ca: new FxBatch(scene, this.chevGeo), // 突進箭頭
      gl: new FxBatch(scene, this.sphereGeo, { attached: true, renderOrder: 5 }), // 推進器光暈（glareMesh）
      dk: new FxBatch(scene, this.boxGeo, { std: { color: 0x2a2a2a, roughness: 0.9 } }), // 爆炸碎片
      cs: new FxBatch(scene, this.boxGeo, { std: { color: 0xd4a54a, metalness: 0.8, roughness: 0.3 } }), // 彈殼
    };
    this.batchList = Object.values(this.batches);
    this.projPart = this.projPartOf.bind(this); // 傳給 buildProjectileMesh（entities/projectile.js）
    // 砲火特效（設定 ctrl.fxLv，docs/vfx-design.md 第 7 期）：Game 設定 richOf；沒有設定（模型庫）時一律華麗
    this.richOf = null;
    // 地面高度（彈殼落地、爆炸的焦痕）：Game 設定 (x, z) → 高度；沒有時不做落地
    this.ground = null;
    // 地面材質（第 8.4 期）：Game 設定 (x, z, y) → water／metal／ice／snow／sand／conc（腳步聲的 surfAt），
    // 與地面的顏色 () → 0xRRGGBB（主題的 ground）；沒有時命中與爆炸照舊
    this.surfOf = null;
    this.groundCol = null;
    this.columns = 0; // 大型殘骸的長煙柱（同時最多 COLUMNS_MAX 條）
  }
  // 華麗＝參考 Oh! Robot 的加強版砲火；標準＝改版前的樣子
  get rich() {
    return this.richOf ? this.richOf() : true;
  }
  setK(k) {
    this.k = k;
    this.light.distance = 26 * k;
    this.g.ln.uniforms.uMaxL.value = 1.6 * k;
    this.thruster.cull = (p) => this.skip(p, 4);
  }
  // 批次粒子的代理（fx/batch.js）：照一般網格改 position／scale／rotation、material.opacity，加進 list 後由 update 更新
  P(kind, color, opacity = 1) {
    return this.batches[kind].get(color, opacity);
  }
  // 子彈的發光部分（render/extra-models.js 的 buildProjectileMesh 的 part）：依幾何各一個 attached 批次，
  // 代理掛在彈體的群組裡；彈體從場景移除時自動放掉。normal＝一般混合（華麗的曳光芯：明亮的地面上也看得到）
  projPartOf(geo, color, opacity, parent, normal = false) {
    const M = this.projB || (this.projB = new Map());
    const key = normal ? 'n' : 'a';
    let m = M.get(geo);
    if (!m) M.set(geo, (m = {}));
    let b = m[key];
    if (!b) {
      b = m[key] = new FxBatch(
        this.scene,
        geo,
        normal ? { attached: true, blending: THREE.NormalBlending, renderOrder: 4 } : { attached: true },
      );
      this.batchList.push(b);
    }
    return b.get(color, opacity, parent);
  }
  // 把批次的代理寫進 InstancedMesh（update 結尾與渲染前各一次，update 之後才產生的粒子也畫得到）
  flush() {
    for (const b of this.batchList) b.flush();
    this.thruster.jets.flush();
    for (const g of this.gList) g.update(this.time);
  }
  addM(color, opacity = 1, additive = true) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: false,
    });
  }
  add(mesh, life, fn) {
    if (!mesh.isFxProxy) this.scene.add(mesh);
    this.list.push({ mesh, life, max: life, fn });
    return mesh;
  }
  // 粒子很多時（FX_BUSY 以上）畫面外的小粒子不產生（看不到；房主照樣轉送給客機，各端依自己的鏡頭判斷）。
  // view＝上一格鏡頭的視錐（Game.lodTick 設定，null＝不判斷），r＝粒子會擴散到的範圍
  skip(p, r = 0) {
    if (!this.view || this.busyN() < FX_BUSY) return false;
    _skS.center.copy(p);
    _skS.radius = (4 + r * 1.5) * this.k;
    return !this.view.intersectsSphere(_skS);
  }
  // 粒子很多時離鏡頭 FX_FAR 以上的：火花數減半、細小的煙不產生（viewPos＝鏡頭位置，Game.lodTick 設定）
  far(p) {
    return (
      !!this.view &&
      this.busyN() >= FX_BUSY &&
      this.viewPos.distanceToSquared(p) > FX_FAR * FX_FAR * this.k * this.k
    );
  }
  // 目前的特效數量：CPU 的項目＋顯示卡粒子最近產生的數量（約等於活著的）
  busyN() {
    let n = this.list.length;
    for (const g of this.gList) n += g.load;
    return n;
  }
  flashLight(p, color, intensity) {
    this.light.position.copy(p);
    this.light.color.set(color);
    this.light.intensity = intensity;
    this.lightT = 0.08;
  }
  // 火源（第 8.2 期）：每格（或每次產生火焰時）登記一次；0.15 秒（特效時鐘）沒有再登記就移除。
  // key：同一個火源的鍵（物件、實體…）；I：亮度（1＝一般的燃燒）；r：照亮的距離（公尺，舊尺度，乘 k）
  glow(key, p, I = 1, color = 0xff7a2a, r = 9) {
    let s = this.glows.get(key);
    if (!s) this.glows.set(key, (s = { p: new THREE.Vector3() }));
    s.p.copy(p);
    s.I = I;
    s.c = color;
    s.r = r;
    s.t = this.time;
  }
  // 每格算繪前（Game.renderMain）：火光分給離鏡頭注視點（focus，沒有時用鏡頭位置）最近的火源、閃爍；砲火特效「標準」時不開
  lightTick(cam, focus) {
    const F = focus || (cam && cam.position);
    const now = this.time,
      list = this._gl || (this._gl = []);
    list.length = 0;
    for (const [k, s] of this.glows) {
      if (now - s.t > 0.15 || now < s.t) {
        this.glows.delete(k);
        continue;
      }
      s.d = F ? s.p.distanceToSquared(F) : 0;
      list.push(s);
    }
    const on = this.rich;
    if (on) list.sort((a, b) => a.d - b.d);
    const K = this.k;
    for (let i = 0; i < this.fireLights.length; i++) {
      const L = this.fireLights[i],
        s = on && list[i];
      if (!s) {
        L.intensity = 0;
        continue;
      }
      L.position.copy(s.p);
      L.position.y += 1.2 * K;
      L.color.setHex(s.c);
      L.distance = s.r * K;
      const fl = 0.82 + 0.12 * Math.sin(now * 17 + i * 2.1) + 0.08 * Math.sin(now * 41 + i * 5.3);
      L.intensity = s.I * 3.2 * fl;
    }
  }
  // 一團火（第 8.2 期）：往上竄的火舌（直立的火焰貼圖，由白熱轉成橘紅）＋底部的光暈，偶爾火星與黑煙。
  // s：大小（1＝一般物件的火）；smoke：冒黑煙的機率。呼叫端決定頻率（約每秒 6～10 次）
  fire(p, s = 1, smoke = 0.25) {
    if (this.skip(p, s * 3)) return;
    const K = this.k * s;
    const n = this.far(p) ? 1 : 2;
    for (let i = 0; i < n; i++)
      this.g.gl.emit({
        p: new THREE.Vector3(p.x + rnd(-0.4, 0.4) * K, p.y, p.z + rnd(-0.4, 0.4) * K),
        v: new THREE.Vector3(rnd(-0.3, 0.3) * K, rnd(2.2, 3.8) * K, rnd(-0.3, 0.3) * K),
        life: rnd(0.45, 0.75),
        s0: rnd(1.6, 2.4) * K,
        s1: 0.5 * K,
        c0: 0xffe8b0,
        c1: frand() < 0.5 ? 0xff6a18 : 0xd83a0a,
        a: 0.9,
        occ: 0.4,
        cell: pickCell(FXG.tongue),
        rot: rnd(-0.25, 0.25),
        fade: 3,
      });
    this.g.gl.emit({ p, life: 0.3, s0: 2.4 * K, s1: 3 * K, c0: 0xff8a30, a: 0.3, cell: SOFT, fade: 3 });
    if (frand() < 0.35)
      this.g.gl.emit({
        p: new THREE.Vector3(p.x, p.y + 0.8 * K, p.z),
        v: new THREE.Vector3(rnd(-1, 1) * K, rnd(2.5, 5) * K, rnd(-1, 1) * K),
        life: rnd(0.8, 1.5),
        s0: 0.22 * K,
        s1: 0.08 * K,
        c0: 0xffd080,
        c1: 0xff4010,
        k: 1.5,
        cell: SOFT,
        fade: 4,
        drag: 0.8,
      });
    if (frand() < smoke) this.smoke(new THREE.Vector3(p.x, p.y + 1.6 * K, p.z), 0.9 * s, 0x252527, 1.8, 3);
    if (frand() < 0.5) this.heat(new THREE.Vector3(p.x, p.y + 2.2 * K, p.z), 3.2 * s, 0.7, 0.35);
  }
  // 熱扭曲的熱源（第 8.3 期）：p 位置、s 大小（舊尺度，乘 k）、life 秒、a 強度、up 往上飄的速度
  heat(p, s, life = 0.6, a = 0.4, up = 1.5) {
    if (!this.rich || this.skip(p, s)) return;
    const K = this.k;
    this.ht.emit({
      p,
      v: new THREE.Vector3(0, up * K, 0),
      life,
      s0: s * K,
      s1: s * 1.4 * K,
      c0: 0xffffff,
      a,
      cell: SOFT,
      fade: 3,
    });
    if (this.time + life > this.heatT) this.heatT = this.time + life;
  }
  // 管線（StylePipeline 的 ctx.heat）：有熱源時才多畫一張強度圖與扭曲
  heatOn() {
    return this.rich && this.time < this.heatT;
  }
  // bright sphere flash
  flash(p, r, color, life = 0.12) {
    if (this.skip(p, r)) return;
    const rk = r * this.k;
    // 柔邊的圓點：看得到的半徑約是格子的 0.6，所以邊長＝半徑 × 3.3（和舊的球同樣大）
    this.g.gl.emit({ p, life, s0: rk * 2, s1: rk * 4.3, c0: color, a: 0.95, cell: SOFT });
  }
  // spark streaks: elongated additive boxes flying out
  streaks(p, n, color, speed, life = 0.3, grav = 30, dir = null, spread = 1) {
    if (this.skip(p, speed * life * 0.5)) return;
    if (this.far(p)) n = Math.ceil(n / 2);
    const K = this.k;
    speed *= K;
    grav *= K;
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rnd(-1, 1), rnd(-0.4, 1), rnd(-1, 1));
      if (dir) v.multiplyScalar(spread).add(dir.clone().multiplyScalar(1.6));
      v.normalize().multiplyScalar(speed * rnd(0.5, 1.3));
      const w = rnd(0.05, 0.1) * K * 3.5; // 直線的格子：看得到的寬度約是邊長的 0.28
      // 沿速度拉長：長度＝寬×0.3＋速度×0.035（上限 1.6 m × k）
      this.g.ln.emit({
        p,
        v,
        life: life * rnd(0.6, 1.2),
        s0: w,
        c0: color,
        cell: LINE,
        fade: 2,
        g: grav,
        asp: 0.3,
      });
    }
  }
  smoke(p, sc = 1, color = 0x5a5e66, life = 1.0, rise = 2) {
    if (this.skip(p, sc + rise * life) || (sc < 0.5 && this.far(p))) return;
    const K = this.k;
    const drift = new THREE.Vector3(rnd(-1, 1), rise, rnd(-1, 1)).multiplyScalar(K);
    // 煙團的貼圖約佔格子的 0.8：邊長＝半徑 × 2.6
    this.g.sm.emit({
      p,
      v: drift,
      life: life * rnd(0.8, 1.2),
      s0: sc * K * 1,
      s1: sc * K * 4.2,
      c0: color,
      a: 0.85,
      cell: pickCell(FXG.smoke),
      fade: 1,
      rot: frand() * 6.28,
      rv: rnd(-0.8, 0.8),
    });
  }
  // 沒有網格的計時工作（延遲爆炸、持續冒煙）：fn(e, t, dt) 每格呼叫
  // end：時間到時呼叫一次（clear 清掉時不呼叫）
  task(life, fn, end) {
    this.list.push({ mesh: null, life, max: life, fn, end });
  }
  // 擊破時人形機甲先跪倒崩落（COLLAPSE_T 秒、冒火花），之後才碎裂（end）；動作直接改關節（實體已經不更新）
  collapse(ent, end) {
    const m = ent.model;
    const side = frand() < 0.5 ? -1 : 1,
      back = frand() < 0.35; // 往後倒（否則往前跪倒）
    const legs = m.legs.map((L) => ({
      L,
      th: L.thigh.rotation.x,
      kn: L.knee.rotation.x,
      ft: L.foot.rotation.x,
      lead: L.side === side,
    }));
    const arms = Object.values(m.arms).map((a) => ({ a, up: a.up.rotation.x, fo: a.fore.rotation.x }));
    const s0 = {
      ly: m.legsG.position.y,
      ty: m.torso.position.y,
      tx: m.torso.rotation.x,
      tz: m.torso.rotation.z,
    };
    const hx = m.head ? m.head.rotation.x : 0;
    const sc = ent.scale || 1;
    let acc = 0;
    const L = (a, b, u) => a + (b - a) * u;
    this.task(
      COLLAPSE_T,
      (e, t, dt) => {
        const u = t * t * (3 - 2 * t);
        for (const g of legs) {
          g.L.thigh.rotation.x = L(g.th, g.lead ? 0.95 : 0.15, u);
          g.L.knee.rotation.x = L(g.kn, g.lead ? -1.35 : -1.7, u);
          g.L.foot.rotation.x = L(g.ft, g.lead ? 0.4 : 1.0, u);
        }
        for (const g of arms) {
          g.a.up.rotation.x = L(g.up, 0.1, u);
          g.a.fore.rotation.x = L(g.fo, 0.5, u);
        }
        m.legsG.position.y = s0.ly - 0.75 * MB * u; // 機甲的建模尺寸（新尺度）
        m.torso.position.y = s0.ty - 0.75 * MB * u;
        m.torso.rotation.x = L(s0.tx, back ? 0.45 : -0.6, u);
        m.torso.rotation.z = L(s0.tz, side * 0.25, u);
        if (m.head) m.head.rotation.x = L(hx, back ? -0.3 : 0.5, u);
        acc += dt;
        if (acc > 0.07) {
          acc = 0;
          const c = ent.center();
          this.streaks(
            c.add(new THREE.Vector3(rnd(-0.6, 0.6), rnd(-0.4, 0.6), rnd(-0.6, 0.6)).multiplyScalar(sc)),
            5,
            0xffc060,
            12,
            0.25,
            10,
          );
        }
      },
      end,
    );
  }
  // 擊破的追加演出（房主與客機各自呼叫，不轉送）：連續的二次爆炸、殘骸冒煙、地面焦痕、強光
  killBurst(p, sc = 1, big = false, groundY = null) {
    const n = big ? 4 : 2,
      K = this.k;
    let k = 0;
    this.task(big ? 0.9 : 0.45, (e, t) => {
      if (t * n < k) return;
      k++;
      const q = p
        .clone()
        .add(new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).multiplyScalar(1.6 * sc * K));
      this.explosion(q, rnd(2.2, 3.4) * sc, 0xff8030, big);
    });
    this.flashLight(p, 0xffb060, big ? 90 : 45);
    this.lightT = big ? 0.25 : 0.14;
    const gy = groundY == null ? p.y - 2 * K : groundY;
    this.shockwave(
      new THREE.Vector3(p.x, gy + 0.15 * K, p.z),
      9 * sc * (big ? 1.8 : 1),
      0xffd8a0,
      big ? 0.7 : 0.45,
    );
    // 噴發：往上噴的火花與慢慢飄起、閃爍的火星（特效預設 eruption；直接寫進顯示卡粒子，不經過會轉送給客機的 streaks）
    emitPreset(this.g, 'eruption', p, { S: K, n: big ? 2.1 : 1, spd: big ? 1.3 : 1 });
    // 殘骸冒煙：慢慢升起的黑煙柱，幾秒後停
    let acc = 0;
    this.task(big ? 7 : 4.5, (e, t, dt) => {
      acc += dt;
      if (acc < 0.16) return;
      acc = 0;
      const q = new THREE.Vector3(p.x + rnd(-0.6, 0.6) * sc * K, gy + 0.6 * K, p.z + rnd(-0.6, 0.6) * sc * K);
      this.smoke(q, (1.4 + t) * sc, t < 0.2 ? 0x3a3530 : 0x24262a, 2.6, 3.2);
      if (t < 0.4 && frand() < 0.35) this.flash(q, 0.7 * sc, 0xff7a20, 0.15);
    });
    // 地面焦痕（平放的焦痕貼圖，維持 8 秒後淡出）
    this.g.dc.emit({
      p: new THREE.Vector3(p.x, gy + 0.08, p.z),
      life: this.rich ? 60 : 12,
      s0: 7.4 * sc * K * (big ? 1.6 : 1),
      c0: 0x0c0a08,
      a: 0.8,
      cell: pickCell(FXG.scorch),
      fade: 5,
      rot: frand() * 6.28,
    });
    if (this.rich) this.crater(p.x, gy, p.z, 2.6 * sc * K * (big ? 1.5 : 1)); // 坑洞與裂痕
    // 大型殘骸的長煙柱（第 8.4 期，華麗）：細的黑煙柱留 25 秒、慢慢變淡，遠處也看得到；同時最多 COLUMNS_MAX 條
    if (this.rich && big && this.columns < COLUMNS_MAX) {
      this.columns++;
      let ac2 = 0;
      const base = new THREE.Vector3(p.x, gy + 0.8 * K, p.z);
      this.task(
        25,
        (e, t, dt) => {
          if ((ac2 += dt) < 0.3) return;
          ac2 = 0;
          if (t < 0.15) return; // 剛擊破時是上面的煙
          const q = base.clone().add(new THREE.Vector3(rnd(-0.4, 0.4) * K, 0, rnd(-0.4, 0.4) * K));
          this.smoke(q, 1.1 * sc * (1 - t * 0.5), t < 0.5 ? 0x26272a : 0x3a3b3e, 5, 4);
          if (t < 0.6 && frand() < 0.25) this.fire(q, 0.6 * sc, 0);
        },
        () => this.columns--,
      );
    }
  }
  // 蓄力（倒著播）：粒子從半徑 r（舊尺度）的球面往 p 吸進去，在 dur 秒內陸續出發（每次呼叫一小段，跟著槍口移動）；
  // 中心的光核同時變亮。蓄力射擊、雷射蓄力、電磁砲台、Boss 的大招（會轉送給客機）
  gather(p, r, color, dur = 0.2, n = 8) {
    if (this.skip(p, r)) return;
    emitPreset(this.g, 'gather', p, { S: r * this.k, color, n: n / 8, dur });
  }
  // 電弧：電擊的貼圖在 p 附近閃爍（EMP、能量武器命中；r 舊尺度，會轉送給客機）
  arc(p, r, color = 0x9fe0ff) {
    if (this.skip(p, r)) return;
    emitPreset(this.g, 'arc', p, { S: r * this.k, color, n: r > 2 ? 5 / 3 : 1 });
  }
  // 鋸齒電弧（docs/vfx-design.md 第 7.3 期，參考 Oh! Robot 的連鎖閃電）：a → b 的鋸齒折線加隨機分岔，
  // dur 秒內每 0.045 秒重新長一次形狀；kind 's'＝從天上劈下來（落地的閃光、衝擊環、往上的火花）。
  // 會轉送給客機（render-setup.js 的清單）；各端自己畫，砲火特效「標準」時不畫（呼叫端原本的特效照舊）
  bolt(a, b, color = 0x9fe0ff, dur = 0.3, kind) {
    this.zap(a, b, color, dur, kind);
  }
  // 不轉送的版本（各端自己呼叫的地方用，例如電鰻的電流區）
  zap(a, b, color = 0x9fe0ff, dur = 0.3, kind) {
    if (!this.rich) return;
    const d = a.distanceTo(b);
    if (d < 0.05 || this.skip(a.clone().lerp(b, 0.5), d / (2 * this.k))) return;
    const A = a.clone(),
      B = b.clone(),
      K = this.k,
      sky = kind === 's';
    let acc = 0;
    this.task(dur, (e, t, dt) => {
      acc -= dt;
      if (acc > 0) return;
      acc = 0.045;
      this.boltDraw(A, B, color, sky ? 0.11 : 0.08, 1 - t * 0.6, sky);
    });
    this.boltDraw(A, B, color, sky ? 0.11 : 0.08, 1, sky);
    // 打中的地方：閃爍的光、電擊的貼圖
    this.g.gl.emit({
      p: B,
      life: dur,
      s0: 3.4 * K,
      s1: 1.6 * K,
      c0: 0xffffff,
      c1: color,
      k: 1.4,
      fade: 4,
      cell: SOFT,
    });
    emitPreset(this.g, 'arc', B, { S: 1.3 * K, color, n: 1 });
    if (sky) {
      this.g.gl.emit({
        p: B,
        life: 0.12,
        s0: 9 * K,
        s1: 14 * K,
        c0: 0xffffff,
        c1: color,
        a: 0.8,
        cell: SOFT,
      });
      this.shockwave(B.clone().setY(B.y + 0.2), 5, color, 0.35);
      this.streaks(B, 10, 0xe8f6ff, 26, 0.3, 14, new THREE.Vector3(0, 1, 0), 1.2);
      this.flashLight(B.clone().setY(B.y + 3 * K), color, 45);
    } else this.flashLight(A.clone().lerp(B, 0.5), color, 10);
  }
  // 一次的形狀：主幹＋1～3 條分岔（u＝亮度）
  boltDraw(A, B, color, jag, u, sky) {
    const pts = this.boltPts(A, B, jag);
    this.boltSeg(pts, color, u, sky ? 1.3 : 1);
    const nb = 1 + Math.floor(frand() * (sky ? 3 : 2));
    const L = A.distanceTo(B);
    for (let i = 0; i < nb && pts.length > 3; i++) {
      const from = pts[1 + Math.floor(frand() * (pts.length - 2))];
      const dir = B.clone()
        .sub(A)
        .normalize()
        .add(new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1)).multiplyScalar(0.9))
        .normalize();
      const end = from.clone().addScaledVector(dir, L * rnd(0.15, 0.35));
      this.boltSeg(this.boltPts(from, end, jag * 1.3), color, u * 0.7, 0.5);
    }
  }
  // 折線的點：兩端固定、中間往兩個垂直方向隨機偏移（兩端小、中間大）
  boltPts(A, B, jag) {
    const D = B.clone().sub(A),
      L = D.length();
    const n = Math.max(4, Math.min(16, Math.round(L / (2.2 * this.k))));
    const dir = D.clone().divideScalar(L || 1);
    const p1 = new THREE.Vector3(0, 1, 0).cross(dir);
    if (p1.lengthSq() < 1e-4) p1.set(1, 0, 0);
    p1.normalize();
    const p2 = dir.clone().cross(p1);
    const out = [A.clone()];
    for (let i = 1; i < n; i++) {
      const s = Math.sin((Math.PI * i) / n) * L * jag;
      out.push(
        A.clone()
          .addScaledVector(D, i / n)
          .addScaledVector(p1, rnd(-1, 1) * s)
          .addScaledVector(p2, rnd(-1, 1) * s),
      );
    }
    out.push(B.clone());
    return out;
  }
  // 折線畫成拉長的粒子（光束的格子）：白熱的芯＋屬性色的光暈，每段 0.06 秒（下一次重畫之前消失＝閃爍）
  boltSeg(pts, color, u, w) {
    const K = this.k;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i],
        b = pts[i + 1];
      const ax = b.clone().sub(a),
        len = ax.length();
      if (len < 1e-3) continue;
      const mid = a.clone().lerp(b, 0.5);
      this.g.ln.emit({
        p: mid,
        life: 0.06,
        s0: 0.7 * K * w,
        c0: 0xffffff,
        c1: color,
        a: 0.95 * u,
        k: 1.3,
        cell: BEAM,
        axis: ax,
        asp: len * 1.06,
      });
      this.g.ln.emit({
        p: mid,
        life: 0.07,
        s0: 3.2 * K * w,
        c0: color,
        a: 0.45 * u,
        cell: BEAM,
        axis: ax,
        asp: len * 1.1,
      });
    }
  }
  // 十字星光：彈刀、完美迴避、處決的最後一擊（r 舊尺度，會轉送給客機）
  star(p, r, color = 0xfff0c0) {
    emitPreset(this.g, 'star', p, { S: r * this.k, color });
  }
  // 地圖的持續特效（game/fx-ambient.js）：burn 燃燒的殘骸（黑煙＋火星）、steam 管線的蒸氣、dust 料斗落下的粉塵
  ambient(kind, p, key) {
    if (kind === 'burn' || kind === 'flare')
      this.glow(key || p, p, kind === 'flare' ? 2 : 1, 0xff7a2a, kind === 'flare' ? 16 : 9);
    if (this.skip(p, kind === 'flare' ? 20 : 6)) return;
    emitPreset(this.g, kind, p, { S: this.k });
    if (kind === 'flare') this.heat(new THREE.Vector3(p.x, p.y + 4 * this.k, p.z), 7, 0.9, 0.45, 4);
    else if (kind === 'burn' && frand() < 0.4)
      this.heat(new THREE.Vector3(p.x, p.y + 1.5 * this.k, p.z), 3.5, 0.8, 0.3);
  }
  // 旋翼的下洗氣流：地面上 (x, gy, z) 往外貼地吹開的沙塵（sc＝機體的縮放、k＝貼近地面的程度 0～1）；只有外觀、不轉送
  downwash(x, gy, z, sc, k) {
    const p = new THREE.Vector3(x, gy + 0.3 * this.k, z);
    // 水面上：往下壓出一圈波（fx/water）
    if (this.water && this.water.wet(x, z)) this.water.drop(x, z, 2.2 * sc, -0.18 * sc * k);
    if (this.skip(p, 6 * sc)) return;
    emitPreset(this.g, 'downwash', p, { S: sc, n: (2 + k * 3) / 3, spd: 0.5 + k });
  }
  shockwave(p, r, color = 0xffd090, life = 0.4) {
    const rk = r * this.k;
    // 環在格子半徑的 0.82：邊長＝半徑 × 2.44
    this.g.rg.emit({
      p,
      life,
      s0: rk * 0.37,
      s1: rk * 2.8,
      c0: color,
      cell: FXC.ring,
      rot: frand() * 6.28,
    });
  }
  // kind（第 5 個參數，隨轉送帶給客機）：'pl'＝能量的爆炸（電漿導彈），砲火特效「華麗」時畫成電漿爆炸
  explosion(p, r, color = 0xffa040, big = false, kind) {
    if (this.water) this.water.blast(p, r * this.k * (big ? 1.4 : 1)); // 水面的波（fx/water，各端自己算）
    const R = this.rich;
    if (R && kind === 'pl') return this.plasmaBlast(p, r, big);
    this.flash(p, r * (R ? 0.42 : 0.32), 0xffffff, R ? 0.1 : 0.08);
    this.flash(p, r * (R ? 0.62 : 0.45), color, R ? 0.24 : 0.18);
    const K = this.k;
    // 火球：幾團火焰貼圖由白熱轉成暗紅，往外膨脹、旋轉（特效預設 fireball，fx/presets.js）
    emitPreset(this.g, 'fireball', p, {
      S: r * K * (R ? 1.25 : 1),
      n: (big ? 2 : 1) * (R ? 1.5 : 1),
      lifeK: (big ? 1.5 : 1) * (R ? 1.3 : 1),
    });
    this.shockwave(p.clone().setY(p.y - r * 0.3 * K), r * (R ? 2 : 1.6), 0xffc080, big ? 0.5 : 0.3);
    this.streaks(
      p,
      (big ? 26 : 12) * (R ? 1.5 : 1),
      0xffa030,
      rnd(16, 26) * (big ? 1.5 : 1),
      big ? 0.9 : 0.5,
      32,
    );
    this.streaks(p, big ? 10 : 5, 0xffe0a0, rnd(24, 34), 0.25, 10);
    if (R) {
      this.blastExtra(p, r, big);
      if (this.ground && this.surfOf) {
        const gy = this.ground(p.x, p.z);
        if (gy != null && p.y - gy < (2 + 0.6 * r) * this.k)
          this.groundBlast(new THREE.Vector3(p.x, gy, p.z), r, big);
      }
      this.heat(p, r * (big ? 3.4 : 2.6), big ? 0.7 : 0.5, 0.9, 3);
    }
    for (let i = 0; i < (big ? 14 : 6) * (R ? 1.6 : 1); i++) {
      const s = this.P('dk', 0x2a2a2a);
      s.position.copy(p);
      s.scale.setScalar(rnd(0.1, 0.24) * (big ? 1.6 : 1) * K);
      const v = new THREE.Vector3(rnd(-1, 1), rnd(0.4, 1.6), rnd(-1, 1))
        .normalize()
        .multiplyScalar(rnd(9, 22) * (big ? 1.6 : 1) * K);
      const rv = new THREE.Vector3(rnd(-8, 8), rnd(-8, 8), rnd(-8, 8));
      this.add(s, rnd(0.7, 1.3), (e, t, dt) => {
        v.y -= 34 * K * dt;
        e.mesh.position.addScaledVector(v, dt);
        e.mesh.rotation.x += rv.x * dt;
        e.mesh.rotation.y += rv.y * dt;
        if (t > 0.8) e.mesh.scale.multiplyScalar(0.9);
      });
    }
    for (let i = 0; i < (big ? 8 : 4) * (R ? 1.75 : 1); i++)
      this.smoke(
        p.clone().add(new THREE.Vector3(rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1)).multiplyScalar(r * 0.3 * K)),
        r * (R ? 0.45 : 0.35) * rnd(0.7, 1.3),
        R ? (i % 2 ? 0x1c1d20 : 0x2a2b2e) : 0x2e3136,
        (big ? 1.6 : 1.0) * (R ? 1.7 : 1),
        R ? 3.2 : 2.5,
      );
    this.flashLight(p, color, (big ? 40 : 18) * (R ? 1.6 : 1));
  }
  // 華麗的爆炸多出來的部分（不轉送；explosion 已經轉送過）：拖著火與黑煙飛出去的碎塊、貼地爆炸的焦痕
  blastExtra(p, r, big) {
    const K = this.k;
    if (!this.far(p)) {
      const n = big ? 5 : 3;
      for (let i = 0; i < n; i++) {
        // 拋物線（解析解）：每 0.05 秒在目前的位置放火焰與黑煙
        const v = new THREE.Vector3(rnd(-1, 1), rnd(0.5, 1.4), rnd(-1, 1))
          .normalize()
          .multiplyScalar(rnd(10, 18) * K * (big ? 1.4 : 1) * Math.min(1.6, Math.max(0.7, r / 3)));
        const G = 26 * K,
          q = new THREE.Vector3();
        let acc = 0,
          tt = 0;
        const life = rnd(0.55, 0.9);
        this.task(life, (e, t, dt) => {
          tt += dt;
          acc += dt;
          if (acc < 0.045) return;
          acc = 0;
          q.copy(p).addScaledVector(v, tt);
          q.y -= 0.5 * G * tt * tt;
          const u = 1 - t;
          this.g.gl.emit({
            p: q,
            life: 0.22,
            s0: 1.3 * K * u + 0.3 * K,
            s1: 0.3 * K,
            c0: 0xffe0a0,
            c1: 0xff5010,
            a: 0.9,
            occ: 0.3,
            cell: pickCell(FXG.flame),
            rot: frand() * 6.28,
          });
          if (frand() < 0.6) this.smoke(q.clone(), 0.5 + u * 0.4, 0x1c1d20, 1.2, 1.5);
        });
      }
    }
    // 貼地的爆炸留下焦痕（放大的焦痕比擊破的小一點；dc 是一般混合，蓋在地面上）
    if (this.ground && !(this.water && this.water.wet(p.x, p.z))) {
      const gy = this.ground(p.x, p.z);
      if (gy != null && p.y - gy < (2 + r * 0.6) * K && p.y - gy > -1) {
        this.g.dc.emit({
          p: new THREE.Vector3(p.x, gy + 0.06, p.z),
          life: 60,
          s0: r * K * rnd(1.4, 1.9) * (big ? 1.3 : 1),
          c0: 0x0c0a08,
          a: 0.7,
          cell: pickCell(FXG.scorch),
          fade: 5,
          rot: frand() * 6.28,
        });
        if (r >= 2) this.crater(p.x, gy, p.z, r * K * rnd(0.45, 0.6) * (big ? 1.3 : 1));
      }
    }
  }
  // 地面的坑洞＋往外的裂痕（砲火特效「華麗」，不轉送）：深色的坑、淺色的土邊、裂痕各一張平放的貼圖，留 60 秒；s＝坑的直徑（公尺）
  crater(x, gy, z, s) {
    const rot = frand() * 6.28;
    const D = this.g.dc;
    D.emit({
      p: new THREE.Vector3(x, gy + 0.07, z),
      life: 60,
      s0: s,
      c0: 0x0a0806,
      a: 0.85,
      cell: CRATER,
      fade: 5,
      rot,
    });
    D.emit({
      p: new THREE.Vector3(x, gy + 0.08, z),
      life: 60,
      s0: s * 1.3,
      c0: 0x6e655a,
      a: 0.5,
      cell: RIM,
      fade: 5,
      rot,
    });
    D.emit({
      p: new THREE.Vector3(x, gy + 0.09, z),
      life: 60,
      s0: s * rnd(1.6, 1.9),
      c0: 0x0a0908,
      a: 0.6,
      cell: pickCell(FXG.crack),
      fade: 5,
      rot: frand() * 6.28,
    });
  }
  // 電漿爆炸（explosion 的 kind 'pl'＋砲火特效「華麗」）：白光、紫色的光球往外撐開、兩圈衝擊環、紫與粉紅的光點與火花，沒有火與黑煙
  plasmaBlast(p, r, big) {
    const K = this.k,
      rk = r * K * (big ? 1.3 : 1);
    const C = 0xb060ff,
      C2 = 0xff6ae0;
    this.g.gl.emit({ p, life: 0.14, s0: rk * 1.6, s1: rk * 3.4, c0: 0xffffff, k: 1.6, cell: SOFT });
    this.g.gl.emit({ p, life: 0.32, s0: rk * 2.2, s1: rk * 4.4, c0: C, a: 0.8, cell: SOFT });
    this.g.gl.emit({
      p,
      life: 0.22,
      s0: rk * 2.4,
      s1: rk * 1.2,
      c0: 0xffffff,
      c1: C2,
      cell: pickCell(FXG.star),
    });
    const gy = p.y - r * 0.3 * K;
    this.shockwave(p.clone().setY(gy), r * 1.4, 0xffffff, 0.22);
    this.shockwave(p.clone().setY(gy), r * 2.6, C, 0.45);
    for (let i = 0; i < (big ? 30 : 20); i++) {
      const v = new THREE.Vector3(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1))
        .normalize()
        .multiplyScalar(rnd(8, 20) * K);
      this.g.gl.emit({
        p,
        v,
        drag: 3,
        life: rnd(0.35, 0.7),
        s0: rnd(0.5, 1.1) * K,
        s1: 0.1 * K,
        c0: 0xffe8ff,
        c1: frand() < 0.5 ? C : C2,
        k: 1.3,
        cell: SOFT,
      });
    }
    this.streaks(p, big ? 14 : 9, C2, rnd(18, 26), 0.3, 6);
    // 往外撐開的光球（半透明的球殼）
    const m = new THREE.Mesh(this.sphereGeo, this.addM(C, 0.4));
    m.material.side = THREE.DoubleSide;
    m.position.copy(p);
    m.renderOrder = 4;
    this.add(m, 0.3, (e, t) => {
      e.mesh.scale.setScalar(Math.max(0.2, rk * 1.1 * (0.3 + t)));
      e.mesh.material.opacity = 0.4 * (1 - t) * (1 - t);
    });
    this.flashLight(p, C, big ? 60 : 35);
  }
  // 電漿彈的尾巴（projectile.js 的 trailFx）：紫色的光點，沒有煙
  plasmaTrail(p, back, color) {
    if (this.skip(p, 2)) return;
    const K = this.k;
    this.g.gl.emit({
      p,
      v: back.clone().multiplyScalar(3 * K),
      life: 0.28,
      s0: 1.5 * K,
      s1: 0.2 * K,
      c0: 0xffffff,
      c1: color,
      a: 0.85,
      cell: SOFT,
    });
    if (frand() < 0.4)
      this.g.ln.emit({
        p,
        v: back
          .clone()
          .multiplyScalar(6 * K)
          .add(new THREE.Vector3(rnd(-3, 3), rnd(-3, 3), rnd(-3, 3)).multiplyScalar(K)),
        life: 0.2,
        s0: 0.25 * K,
        c0: color,
        cell: LINE,
        asp: 0.3,
      });
  }
  // 導彈彎曲的白煙帶（projectile.js 的 trailFx，砲火特效「華麗」）：key＝導彈，帶子的寬度朝向鏡頭
  smokeRibbon(key, p) {
    if (this.far(p)) return;
    // 鏡頭的方向（沒有鏡頭資訊時當作從正上方看）
    const eye = this.view ? this.viewPos.clone().sub(p).normalize() : new THREE.Vector3(0, 1, 0);
    const side = key.vel.clone().cross(eye);
    if (side.lengthSq() < 1e-6) return;
    side.normalize().multiplyScalar(0.13 * this.k);
    this.ribbons.push(key, p.clone().add(side), p.clone().sub(side), {
      color: 0xe6eaee,
      opacity: 0.38,
      life: 1.1,
      max: 28,
    });
  }
  // 黑洞（重力場、吸入區；game/hazards2.js 的 zoneAnim 每格呼叫，砲火特效「華麗」，不轉送）：
  // 往中心旋進去的光條、黑色的核心與紫色的光、繞著轉的紅色弧光、偶爾往外甩的火焰；p＝地面中心、r＝半徑（世界尺寸）、
  // st＝呼叫端保存的計時、kind 1＝吸入區（藍色系）
  vortex(p, r, dt, st, kind = 0) {
    st.vxT = (st.vxT || 0) - dt;
    if (st.vxT > 0) return;
    st.vxT = 0.05;
    if (this.skip(p, r)) return;
    const K = this.k;
    const C = kind ? [0x6ac8ff, 0x2050ff, 0x9fe8ff] : [0xb060ff, 0xff3050, 0xe0a0ff];
    const c = p.clone().setY(p.y + 1.6 * K);
    // 核心：黑色的球（一般混合）＋紫色的光暈脈動
    this.g.sm.emit({
      p: c,
      life: 0.35,
      s0: r * 0.42,
      s1: r * 0.36,
      c0: 0x050308,
      a: 0.9,
      cell: SOFT,
      rot: 0,
    });
    this.g.gl.emit({ p: c, life: 0.2, s0: r * 0.8, s1: r * 0.55, c0: C[0], a: 0.55, cell: SOFT });
    // 往中心旋進去的光條
    for (let i = 0; i < 3; i++) {
      const a = frand() * 6.2832,
        rr = r * rnd(0.6, 1.05);
      const q = new THREE.Vector3(p.x + Math.cos(a) * rr, p.y + rnd(0.3, 3) * K, p.z + Math.sin(a) * rr);
      const life = rnd(0.35, 0.55);
      // 往中心＋切線（旋轉方向）
      const v = c
        .clone()
        .sub(q)
        .multiplyScalar(0.9 / life)
        .add(new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar((rr / life) * 0.55));
      this.g.ln.emit({
        p: q,
        v,
        life,
        s0: 0.3 * K,
        c0: C[2],
        c1: C[0],
        a: 0.9,
        cell: LINE,
        fade: 6,
        asp: 0.4,
      });
    }
    // 貼地繞著轉的弧光
    if (frand() < 0.5)
      this.g.rg.emit({
        p: p.clone().setY(p.y + 0.2),
        life: 0.4,
        s0: r * 1.5,
        s1: r * 1.1,
        c0: C[1],
        a: 0.75,
        cell: pickCell(FXG.slash),
        rot: frand() * 6.28,
        rv: kind ? -5 : 5,
      });
    // 偶爾往外甩的火焰與黑煙
    if (frand() < 0.2) {
      const a = frand() * 6.2832;
      const d = new THREE.Vector3(Math.cos(a), rnd(0.1, 0.5), Math.sin(a));
      this.g.ln.emit({
        p: c,
        v: d.clone().multiplyScalar(r * 2.2),
        drag: 2,
        life: 0.5,
        s0: 1.4 * K,
        s1: 0.4 * K,
        c0: 0xffe0a0,
        c1: kind ? 0x3070ff : 0xff4010,
        a: 0.9,
        occ: 0.3,
        cell: pickCell(FXG.flame),
        asp: 2.5,
      });
    }
    if (frand() < 0.15) this.smoke(c.clone(), r * 0.12, 0x141218, 1.4, 1.2);
  }
  // kind（第 4 個參數，隨轉送帶給客機）：'g'＝打在地形上——華麗時依地面材質換成沙塵、雪煙、水花、冰屑、灰塵（第 8.4 期）
  spark(p, color = 0xffe080, dir = null, kind) {
    const R = this.rich;
    if (kind === 'g' && R && this.surfOf && this.groundHit(p, dir)) return;
    this.flash(p, R ? 0.45 : 0.3, 0xffffff, R ? 0.07 : 0.06);
    this.flash(p, R ? 0.5 : 0.28, color, R ? 0.15 : 0.12);
    const back = dir ? dir.clone().negate() : null;
    this.streaks(p, R ? 13 : 7, color, rnd(12, 18) * (R ? 1.35 : 1), R ? 0.38 : 0.3, 30, back, 1.2);
    if (R && !this.far(p)) {
      // 華麗：白熱的短火花往回濺＋十字星光
      this.streaks(p, 5, 0xffffff, rnd(22, 30), 0.12, 6, back, 0.8);
      this.g.gl.emit({
        p,
        life: 0.09,
        s0: 1.7 * this.k,
        s1: 0.5 * this.k,
        c0: 0xffffff,
        c1: color,
        k: 1.5,
        cell: pickCell(FXG.star),
        rot: frand() * 6.28,
      });
    }
    this.smoke(p, R ? 0.5 : 0.35, 0x6a6e75, 0.45, 1.5);
  }
  // 子彈打在地形上（第 8.4 期）：依地面材質；金屬照舊是火花（回傳 false）
  groundHit(p, dir) {
    const s = this.surfOf(p.x, p.z, p.y);
    if (s === 'metal' || this.skip(p, 2)) return s !== 'metal';
    const K = this.k;
    const up = dir
      ? new THREE.Vector3(-dir.x, Math.abs(dir.y) + 0.8, -dir.z).normalize()
      : new THREE.Vector3(0, 1, 0);
    const gc = this.groundCol ? this.groundCol() : 0x9a958a;
    const col = SURF_COL[s] || mixHex(gc, 0xffffff, s === 'sand' ? 0.25 : 0.35);
    const far = this.far(p);
    // 噴起來的顆粒（拉長、有重力）
    const grit = (n, c, sp, life, g) => {
      for (let i = 0; i < (far ? Math.ceil(n / 2) : n); i++) {
        const v = up
          .clone()
          .multiplyScalar(1.4)
          .add(new THREE.Vector3(rnd(-1, 1), rnd(0, 0.6), rnd(-1, 1)))
          .normalize()
          .multiplyScalar(sp * rnd(0.5, 1.2) * K);
        this.g.ln.emit({
          p,
          v,
          life: life * rnd(0.6, 1.2),
          s0: 0.22 * K,
          c0: c,
          a: 0.9,
          occ: 0.85,
          cell: LINE,
          fade: 2,
          g: g * K,
          asp: 0.3,
        });
      }
    };
    // 一小團粉塵（受光的煙塵系統）
    const puff = (sc, c, life, rise, n = 1) => {
      for (let i = 0; i < n; i++)
        this.g.sm.emit({
          p: p.clone().add(new THREE.Vector3(rnd(-0.3, 0.3), 0.2, rnd(-0.3, 0.3)).multiplyScalar(K)),
          v: up.clone().multiplyScalar(rise * rnd(0.6, 1.2) * K),
          life: life * rnd(0.8, 1.2),
          s0: sc * 0.6 * K,
          s1: sc * 2.4 * K,
          c0: c,
          a: 0.75,
          cell: pickCell(FXG.smoke),
          fade: 1,
          drag: 2.5,
          rot: frand() * 6.28,
          rv: rnd(-1, 1),
        });
    };
    if (s === 'water') {
      if (this.water && this.water.wet(p.x, p.z)) this.water.drop(p.x, p.z, 0.8 * K, -0.08);
      grit(9, 0xeef6fa, 9, 0.5, 26);
      puff(0.7, 0xe8f0f4, 0.5, 1.5);
    } else if (s === 'snow') {
      grit(5, 0xffffff, 6, 0.45, 20);
      puff(0.9, col, 0.9, 1.2, 2);
    } else if (s === 'ice') {
      grit(8, 0xe6f4ff, 11, 0.35, 26);
      this.g.gl.emit({
        p,
        life: 0.08,
        s0: 1.2 * K,
        s1: 0.4 * K,
        c0: 0xffffff,
        c1: 0xbfe8ff,
        k: 1.3,
        cell: pickCell(FXG.star),
        rot: frand() * 6.28,
      });
      puff(0.5, col, 0.5, 0.8);
    } else if (s === 'sand') {
      grit(6, mixHex(gc, 0x000000, 0.25), 8, 0.5, 24);
      puff(0.9, col, 0.9, 1.4, 2);
    } else {
      // 混凝土、土：灰塵＋少量火花與碎石
      this.streaks(p, 3, 0xffe0a0, 14, 0.18, 20, dir ? dir.clone().negate() : null, 1.2);
      grit(5, mixHex(gc, 0x202020, 0.4), 9, 0.45, 26);
      puff(0.7, col, 0.7, 1.2);
    }
    return true;
  }
  // 貼地爆炸揚起的東西（第 8.4 期，華麗）：沙柱、雪煙、水柱、土塊；p 是地面上的點
  groundBlast(p, r, big) {
    const s = this.surfOf(p.x, p.z, p.y + 0.5);
    if (s === 'metal' || this.skip(p, r * 3)) return;
    const K = this.k,
      R = r * K;
    const gc = this.groundCol ? this.groundCol() : 0x9a958a;
    const col = SURF_COL[s] || mixHex(gc, 0xffffff, 0.2);
    const water = s === 'water';
    // 水面的波：explosion 開頭已經推過（water.blast），這裡不再推
    const n = Math.round((big ? 8 : 6) * (this.far(p) ? 0.5 : 1));
    // 往上衝的柱子（受光的煙塵，重力讓它落回去）
    for (let i = 0; i < n; i++) {
      const a = frand() * 6.283,
        h = rnd(0.2, 1);
      this.g.sm.emit({
        p: p.clone().add(new THREE.Vector3(Math.cos(a) * R * 0.25, 0.3 * K, Math.sin(a) * R * 0.25)),
        v: new THREE.Vector3(
          Math.cos(a) * R * 0.6 * rnd(0.3, 1),
          R * (water ? 5 : 3.6) * h,
          Math.sin(a) * R * 0.6 * rnd(0.3, 1),
        ),
        life: rnd(1.1, 1.8) * (big ? 1.3 : 1),
        s0: R * 0.35,
        s1: R * (water ? 0.8 : 1.0),
        c0: col,
        c1: water ? 0xf4f8fa : mixHex(col, 0x6a6660, 0.35),
        a: water ? 0.7 : 0.85,
        cell: pickCell(FXG.smoke),
        fade: 3,
        g: R * 2.2,
        drag: 0.8,
        rot: frand() * 6.28,
        rv: rnd(-0.6, 0.6),
      });
    }
    // 噴出去的土塊、雪塊、水滴（拉長、重力）
    const gc2 = water
      ? 0xf0f8ff
      : s === 'snow'
        ? 0xffffff
        : s === 'ice'
          ? 0xe0f2ff
          : mixHex(gc, 0x1a1612, 0.45);
    for (let i = 0; i < n * 2; i++) {
      const v = new THREE.Vector3(rnd(-1, 1), rnd(0.8, 2.2), rnd(-1, 1))
        .normalize()
        .multiplyScalar(R * rnd(4, 8));
      this.g.ln.emit({
        p: p.clone().setY(p.y + 0.3 * K),
        v,
        life: rnd(0.7, 1.3),
        s0: (water ? 0.3 : 0.45) * K,
        c0: gc2,
        a: 0.95,
        occ: 0.9,
        cell: LINE,
        fade: 2,
        g: 30 * K,
        asp: 0.35,
      });
    }
  }
  // 地面的彈痕（第 8.4 期：焦痕系統，不再每個新建網格與材質）
  mark(x, gy, z, s, life = 5) {
    this.g.dc.emit({
      p: new THREE.Vector3(x, gy + 0.05, z),
      life,
      s0: s * 3,
      c0: 0x14110e,
      a: 0.55,
      cell: pickCell(FXG.scorch),
      fade: 5,
      rot: frand() * 6.28,
    });
  }
  // kind（第 5 個參數，隨轉送帶給客機；docs/vfx-design.md 第 6 期）：'sg' 霰彈槍＝前方扇形的煙、
  // 'bz' 火箭筒與榴彈＝筒子後方的後焰、'ms' 導彈莢艙＝發射口的小閃光與往後的煙（沒有槍口火焰）
  muzzle(p, dir, color = 0xffd080, size = 1, kind) {
    if (this.skip(p, size)) return;
    const sz = size * this.k;
    if (kind === 'ms') {
      this.g.gl.emit({
        p,
        life: 0.08,
        s0: sz * 1.6,
        s1: sz * 0.8,
        c0: 0xffffff,
        c1: color,
        k: 1.4,
        cell: SOFT,
      });
      emitPreset(this.g, 'bzBlast', p, { S: this.k * size * 0.5, axis: dir.clone().negate(), n: 0.6 });
      return;
    }
    const R = this.rich;
    if (kind === 'sg') emitPreset(this.g, 'sgSmoke', p, { S: this.k, axis: dir });
    else if (kind === 'bz')
      emitPreset(this.g, 'bzBlast', p.clone().addScaledVector(dir, -2.2 * this.k), {
        S: this.k,
        axis: dir.clone().negate(),
      });
    const S = R ? 1.5 : 1;
    this.g.gl.emit({ p, life: 0.06, s0: sz * 1.05 * S, s1: sz * 0.55 * S, c0: 0xffffff, cell: SOFT });
    // 槍口火焰：沿槍管方向從槍口往外（aspect 負的＝一端固定在槍口）
    this.g.ln.emit({
      p,
      life: 0.07,
      s0: sz * 2 * S,
      s1: sz * 2.5 * S,
      c0: 0xffffff,
      c1: color,
      a: 0.95,
      cell: pickCell(FXG.muzzle),
      axis: dir,
      asp: -sz * 2.2 * (R ? 1.6 : 1),
    });
    if (R) {
      // 華麗：往兩側斜開的側焰（星形的槍口火光）＋一圈大的光暈
      const side = new THREE.Vector3(-dir.z, 0, dir.x);
      if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
      side.normalize();
      for (const s of [-1, 1])
        this.g.ln.emit({
          p,
          life: 0.05,
          s0: sz * 1.2,
          s1: sz * 1.5,
          c0: 0xffffff,
          c1: color,
          a: 0.8,
          cell: pickCell(FXG.muzzle),
          axis: side.clone().multiplyScalar(s).addScaledVector(dir, 0.7),
          asp: -sz * 1.3,
        });
      this.g.gl.emit({ p, life: 0.08, s0: sz * 3.2, s1: sz * 4, c0: color, a: 0.35, cell: SOFT });
    }
    if (this.far(p)) return; // 遠處只留閃光
    this.streaks(p, R ? 5 : 3, color, R ? 18 : 14, 0.14, 4, dir, 0.5);
    this.smoke(p.clone().addScaledVector(dir, 0.6 * this.k), 0.25, 0x8a8e96, 0.4, 1.5);
  }
  empBeam(w, a, b, color) {
    if (!w.beamMesh) {
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1, 6), this.addM(color, 0.9));
      const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 6), this.addM(color, 0.18));
      const grp = new THREE.Group();
      grp.add(core);
      grp.add(glow);
      grp.renderOrder = 4;
      this.scene.add(grp);
      w.beamMesh = grp;
      w.beamCore = core;
      w.beamGlow = glow;
    }
    const grp = w.beamMesh;
    grp.visible = true;
    const d = a.distanceTo(b);
    grp.position.copy(a).lerp(b, 0.5);
    grp.lookAt(b);
    grp.rotateX(Math.PI / 2);
    w.beamCore.scale.set(this.k, d, this.k);
    w.beamGlow.scale.set(this.k, d, this.k);
    w.beamGlow.material.opacity = 0.12 + frand() * 0.08;
    w.beamHideT = 0.08;
  }
  // team（第 5 個參數，隨轉送帶給客機）：砲火特效「華麗」時依陣營換色（fx/palette.js：敵人的雷射＝洋紅）
  beam(a, b, color, width = 0.12, team) {
    if (team && this.rich) color = beamColor(team);
    const d = a.distanceTo(b);
    const w0 = width;
    width *= this.k;
    const mid = a.clone().lerp(b, 0.5),
      ax = b.clone().sub(a);
    // 光束的格子：中央亮線＋外圈光暈，看得到的寬度約是邊長的 0.3
    this.g.ln.emit({
      p: mid,
      life: 0.2,
      s0: width * 3.4,
      s1: width * 10,
      c0: color,
      a: 0.95,
      cell: BEAM,
      axis: ax,
      asp: d,
    });
    this.g.ln.emit({ p: mid, life: 0.13, s0: width * 1.2, c0: 0xffffff, cell: BEAM, axis: ax, asp: d });
    this.flash(a, w0 * 6, color, 0.1);
    emitPreset(this.g, 'laserGlow', a, { S: this.k * Math.max(1, w0 * 6), color }); // 開火後槍口的餘光
    this.flashLight(a, color, 12);
  }
  chevrons(p, dir, color = 0xffffff) {
    for (let i = 0; i < 6; i++) {
      const c = this.P('ca', color, 0.9);
      const K = this.k;
      c.position.copy(p).addScaledVector(dir, -i * 1.3 * K);
      c.position.y += 0.5 * K;
      c.lookAt(c.position.clone().add(dir));
      c.rotateX(Math.PI / 2);
      c.scale.set(1.2 * K, K, 1.2 * K);
      this.add(c, 0.3 + i * 0.05, (e, t) => {
        e.mesh.material.opacity = 0.9 * (1 - t);
      });
    }
  }
  dust(p, r, n = 8, color = 0x9aa0a8) {
    if (this.skip(p, r * 2)) return;
    const r0 = r;
    r *= this.k;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3);
      const v = new THREE.Vector3(Math.cos(a) * r * 2.2, rnd(0.5, 1.5) * this.k, Math.sin(a) * r * 2.2);
      this.g.sm.emit({
        p: p.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.3, 0.2 * this.k, Math.sin(a) * r * 0.3)),
        v,
        drag: 3,
        life: rnd(0.5, 0.8),
        s0: r * 0.24,
        s1: r * 0.9,
        c0: color,
        a: 0.7,
        cell: pickCell(FXG.smoke),
        rot: frand() * 6.28,
        rv: rnd(-1, 1),
      });
    }
    this.shockwave(p.clone().setY(p.y + 0.1), r0 * 1.2, 0xffffff, 0.25);
  }
  casing(p, side, dir) {
    if (this.skip(p, 3)) return;
    const R = this.rich;
    const K = this.k;
    // 華麗：彈殼大一點、彈出來時閃一下，落地彈跳後在地上留一下（ground 有設定時）
    const gy = R && this.ground ? this.ground(p.x, p.z) : null;
    const n = R && !this.far(p) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const s = this.P('cs', 0xd4a54a);
      s.position.copy(p);
      const sk = R ? 1.6 : 1;
      s.scale.set(0.05 * K * sk, 0.05 * K * sk, 0.14 * K * sk);
      const right = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side);
      const v = right
        .multiplyScalar(rnd(3, 5) * (i ? 0.7 : 1))
        .add(new THREE.Vector3(0, rnd(4, 6), 0))
        .addScaledVector(dir, i ? rnd(-1.5, 0) : 0)
        .multiplyScalar(K);
      let rv = rnd(10, 25),
        bounce = 0;
      // 落地：彈殼飛出去好幾公尺，地面高度照目前的位置查（斜坡上不會陷進去或浮著）
      const floorAt =
        gy == null || p.y - gy > 40 * K ? null : (m) => this.ground(m.position.x, m.position.z) + 0.05 * K;
      this.add(s, floorAt ? 2.6 : 1.2, (e, t, dt) => {
        const m = e.mesh;
        if (bounce > 2) {
          if (t > 0.85) m.scale.multiplyScalar(0.85);
          return;
        }
        v.y -= 30 * K * dt;
        m.position.addScaledVector(v, dt);
        m.rotation.x += rv * dt;
        m.rotation.z += rv * 0.5 * dt;
        const floor = floorAt && v.y < 0 ? floorAt(m) : null;
        if (floor != null && m.position.y < floor) {
          m.position.y = floor;
          bounce++;
          v.y = -v.y * 0.35;
          v.x *= 0.5;
          v.z *= 0.5;
          rv *= 0.5;
          if (bounce > 2) m.rotation.x = Math.PI / 2;
        }
      });
    }
    if (R && !this.far(p))
      this.g.gl.emit({ p, life: 0.05, s0: 0.6 * K, s1: 0.2 * K, c0: 0xffe0a0, a: 0.8, cell: SOFT });
  }
  boostFlame(p, dir, color) {
    if (this.skip(p, 1)) return;
    const K = this.k;
    this.g.gl.emit({
      p,
      v: dir.clone().multiplyScalar(6 * K),
      life: 0.18,
      s0: 1.3 * K,
      s1: 0.17 * K,
      c0: color,
      a: 0.7,
      cell: SOFT,
    });
  }
  // 導彈與砲彈的火焰尾巴（砲火特效「華麗」，projectile.js 的 trailFx；不轉送）：沿飛行的反方向拉長的火焰
  tailFlame(p, back, color, sc = 1) {
    if (this.skip(p, 2)) return;
    const K = this.k * sc;
    this.g.ln.emit({
      p,
      life: 0.1,
      s0: 1.1 * K,
      s1: 0.4 * K,
      c0: 0xfff0c0,
      c1: color,
      a: 0.9,
      cell: pickCell(FXG.flame),
      axis: back,
      asp: -3.2 * K,
    });
  }
  ring(p, r, color) {
    this.shockwave(p, r, color, 0.5);
  }
  // 地面衝擊波：中心先閃紅色預警 dl 秒，再以 sp m/s 擴散到半徑 R 的光牆，沿地形起伏（ground(x, z) 回傳地面高度）；
  // R、sp 是世界尺寸（和判定一致）
  groundWave(p, R, sp, dl, ground, color = 0xff8a3a) {
    const K = this.k;
    const warn = new THREE.Mesh(this.discGeo, this.addM(0xff3020, 0.5));
    warn.rotation.x = -Math.PI / 2;
    warn.position.copy(p).setY(p.y + 0.15);
    this.add(warn, dl, (e, t) => {
      e.mesh.scale.setScalar((3 + t * 5) * K);
      e.mesh.material.opacity = 0.2 + 0.4 * Math.abs(Math.sin(t * dl * 12));
    });
    const N = 72;
    const pos = new Float32Array((N + 1) * 6);
    const idx = [];
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const mat = this.addM(color, 0.85);
    mat.side = THREE.DoubleSide;
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.visible = false;
    const life = dl + R / sp;
    this.add(m, life, (e, t) => {
      const el = t * life - dl;
      if (el < 0) return;
      if (!m.visible) {
        m.visible = true;
        SFX.explode(true, p);
        this.shockwave(p.clone().setY(p.y + 0.2), 8, 0xffc080, 0.4);
        this.dust(p.clone(), 4, 14);
      }
      const r = Math.max(0.5 * K, el * sp),
        h = 1.8 * K * (1 - (0.5 * r) / R);
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const x = p.x + Math.cos(a) * r,
          z = p.z + Math.sin(a) * r;
        const y = ground(x, z);
        pos.set([x, y + 0.05, z, x, y + h, z], i * 6);
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 0.85 * (1 - r / R);
    });
  }
  // 落點預警（迫擊砲）：紅色外圈＋由內往外填滿的圓，dl 秒後填滿，接近落地時閃得更快；R 是世界尺寸（和判定一致）
  warnCircle(p, R, dl, color = 0xff3020) {
    const grp = new THREE.Group();
    grp.position.copy(p).setY(p.y + 0.12);
    const ring = new THREE.Mesh(this.ringGeo, this.addM(color, 0.8));
    ring.material.side = THREE.DoubleSide;
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(R);
    const fill = new THREE.Mesh(this.discGeo, this.addM(color, 0.3));
    fill.rotation.x = -Math.PI / 2;
    grp.add(ring, fill);
    this.add(grp, dl, (e, t) => {
      fill.scale.setScalar(Math.max(0.01, R * t));
      const f = 4 + t * 14;
      ring.material.opacity = 0.3 + 0.3 * Math.abs(Math.sin(t * dl * f));
      fill.material.opacity = 0.18 + 0.2 * t;
    });
  }
  // 瞄準／路徑預警線：a→b 的細光束閃爍 dl 秒（雷射扇形、衝刺路線）
  warnLine(a, b, dl, color = 0xff2020, width = 0.06) {
    const d = a.distanceTo(b);
    if (d < 0.01) return;
    const m = new THREE.Mesh(
      new THREE.CylinderGeometry(width * this.k, width * this.k, d, 5),
      this.addM(color, 0.7),
    );
    m.position.copy(a).lerp(b, 0.5);
    m.lookAt(b);
    m.rotateX(Math.PI / 2);
    m.renderOrder = 4;
    this.add(m, dl, (e, t) => {
      e.mesh.material.opacity = 0.35 + 0.45 * Math.abs(Math.sin(t * dl * (6 + t * 16)));
      e.mesh.scale.x = e.mesh.scale.z = 1 + t * 1.5;
    });
  }
  // 地面的長方形預警（衝撞路線、進場路線、格子砲擊）：中心 c、朝向 yaw（長邊沿 −Z）、寬 w、長 l（世界尺寸）
  warnRect(c, yaw, w, l, dl, color = 0xff3020) {
    const grp = new THREE.Group();
    grp.position.copy(c).setY(c.y + 0.14);
    grp.rotation.y = yaw;
    const fill = new THREE.Mesh(new THREE.PlaneGeometry(w, l), this.addM(color, 0.2));
    fill.rotation.x = -Math.PI / 2;
    fill.material.side = THREE.DoubleSide;
    const edgeM = this.addM(color, 0.8);
    for (const s of [-1, 1]) {
      const e1 = new THREE.Mesh(this.boxGeo, edgeM);
      e1.scale.set(0.18 * this.k, 0.05 * this.k, l);
      e1.position.x = (s * w) / 2;
      const e2 = new THREE.Mesh(this.boxGeo, edgeM);
      e2.scale.set(w, 0.05 * this.k, 0.18 * this.k);
      e2.position.z = (s * l) / 2;
      grp.add(e1, e2);
    }
    grp.add(fill);
    this.add(grp, dl, (e, t) => {
      fill.material.opacity = 0.12 + 0.22 * t;
      edgeM.opacity = 0.35 + 0.45 * Math.abs(Math.sin(t * dl * (5 + t * 12)));
    });
  }
  // 擴散的能量球殼（脈衝刃翼）：以 sp m/s 擴散到半徑 R（世界尺寸）
  pulseShell(c, R, sp, color = 0xff5070) {
    const life = R / sp;
    const m = new THREE.Mesh(this.sphereGeo, this.addM(color, 0.35));
    m.material.side = THREE.DoubleSide;
    m.position.copy(c);
    m.renderOrder = 4;
    const ring = new THREE.Mesh(this.ringGeo, this.addM(color, 0.9));
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(c);
    this.add(m, life, (e, t) => {
      e.mesh.scale.setScalar(Math.max(0.3, R * t));
      e.mesh.material.opacity = 0.32 * (1 - t * 0.7);
    });
    this.add(ring, life, (e, t) => {
      e.mesh.scale.setScalar(Math.max(0.3, R * t));
      e.mesh.material.opacity = 0.9 * (1 - t * 0.6);
    });
    this.flash(c, 3, color, 0.2);
  }
  // 燃燒的地面（熔渣）：半徑 R（世界尺寸）、持續 life 秒，火苗與煙
  // kind：0 燃燒地面、1 腐蝕區（綠色）
  firePool(p, R, life, kind = 0) {
    const C =
      kind === 1
        ? [0x6aa820, 0xc8ff50, 0x9aff40, 0x5a8a20, 0x3a4a2a]
        : [0xff5a10, 0xffc040, 0xff7a20, 0xffb040, 0x3a3430];
    const grp = new THREE.Group();
    grp.position.copy(p).setY(p.y + 0.1);
    // 第 8.2 期：焦黑的底（一般混合、邊緣斑駁）＋兩層發光的餘燼（裂紋狀、反向慢慢轉）
    const flat = (m, s, y) => {
      const o = new THREE.Mesh(this.discGeo, m);
      o.rotation.x = -Math.PI / 2;
      o.position.y = y;
      o.scale.setScalar(s);
      o.userData.noFade = true;
      grp.add(o);
      return o;
    };
    const base = new THREE.MeshBasicMaterial({
      map: poolTex('scorch'),
      color: kind === 1 ? 0x1c2a10 : 0x120c08,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const em = (c) => {
      const m = this.addM(c, 0.6);
      m.map = poolTex('ember');
      return m;
    };
    const scorch = flat(base, R * 1.12, 0);
    const disc = flat(em(C[0]), R, 0.03);
    const core = flat(em(C[1]), R * 0.62, 0.05);
    core.rotation.z = 1.7;
    let acc = 0;
    this.add(grp, life, (e, t, dt) => {
      const fade = t < 0.85 ? 1 : (1 - t) / 0.15;
      const T = t * life;
      scorch.material.opacity = 0.8 * Math.min(1, t * life * 4) * (t < 0.9 ? 1 : (1 - t) / 0.1);
      disc.material.opacity = (0.55 + 0.2 * Math.sin(T * 9) + 0.1 * Math.sin(T * 23)) * fade;
      core.material.opacity = (0.5 + 0.25 * Math.sin(T * 13 + 1)) * fade;
      disc.rotation.z += dt * 0.08;
      core.rotation.z -= dt * 0.12;
      if (fade > 0.3) this.glow(grp, grp.position, (kind === 1 ? 0.6 : 1.2) * fade, C[2], (R * 1.6) / this.k);
      acc += dt;
      if (acc > 0.06 && fade > 0.3) {
        acc = 0;
        const a = frand() * Math.PI * 2,
          r = frand() * R * 0.85;
        const K = this.k;
        const q = p.clone().add(new THREE.Vector3(Math.cos(a) * r, 0.3 * K, Math.sin(a) * r));
        // 火苗：直立的火舌貼圖往上飄、縮小
        this.g.gl.emit({
          p: q,
          v: new THREE.Vector3(0, rnd(2.5, 4.5) * K, 0),
          life: rnd(0.5, 0.8),
          s0: 2.6 * K,
          s1: 0.5 * K,
          c0: C[1],
          c1: frand() < 0.5 ? C[2] : C[3],
          a: 0.85,
          occ: 0.4,
          cell: pickCell(FXG.tongue),
        });
        if (frand() < 0.15) this.smoke(q.clone().setY(q.y + K), 0.9, C[4], 1.2, 3);
        if (kind !== 1 && frand() < 0.3) this.heat(q.clone().setY(q.y + 1.5 * K), (R * 0.5) / K, 0.7, 0.35);
      }
    });
  }
  // 火焰噴射：從 p 沿 dir 噴出 len 公尺（世界尺寸）、半角 ang 的火焰粒子
  flameCone(p, dir, len, ang, n = 10) {
    const K = this.k;
    // 火光（第 8.2 期）：照亮火焰中段，同一個地方（4 m 的格子）算同一個火源
    const q = p.clone().addScaledVector(dir, len * 0.4);
    this.glow('fc' + Math.round(q.x / 4) + ',' + Math.round(q.z / 4), q, 1.6, 0xff8a30, (len * 0.7) / K);
    if (frand() < 0.5) this.heat(q, (len * 0.45) / K, 0.45, 0.5, 2);
    for (let i = 0; i < n; i++) {
      const v = dir
        .clone()
        .add(new THREE.Vector3(rnd(-1, 1), rnd(-0.6, 0.6), rnd(-1, 1)).multiplyScalar(Math.tan(ang)))
        .normalize()
        .multiplyScalar(len * rnd(1.6, 2.4));
      this.g.gl.emit({
        p,
        v,
        life: 0.45,
        s0: 0.8 * K,
        s1: 4.6 * K,
        c0: 0xffe0a0,
        c1: frand() < 0.6 ? 0xa02800 : 0xc06000,
        a: 0.85,
        occ: 0.45,
        cell: pickCell(FXG.fire),
        rot: frand() * 6.28,
        rv: rnd(-3, 3),
      });
    }
  }
  // 天上落下的光柱（衛星砲的格子砲擊）：p 是地面點、R 世界尺寸
  pillarStrike(p, R, color = 0x9fe8ff) {
    const K = this.k;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 80 * K, 14, 1, true), this.addM(color, 0.8));
    m.material.side = THREE.DoubleSide;
    m.position.copy(p).setY(p.y + 40 * K);
    this.add(m, 0.5, (e, t) => {
      e.mesh.scale.x = e.mesh.scale.z = 1 - t * 0.7;
      e.mesh.material.opacity = 0.8 * (1 - t);
    });
    const c = new THREE.Mesh(
      new THREE.CylinderGeometry(R * 0.4, R * 0.4, 80 * K, 8, 1, true),
      this.addM(0xffffff, 1),
    );
    c.position.copy(m.position);
    this.add(c, 0.3, (e, t) => {
      e.mesh.material.opacity = 1 - t;
    });
    this.shockwave(p.clone().setY(p.y + 0.2), (R * 2.2) / K, color, 0.4);
    this.flashLight(p.clone().setY(p.y + 3 * K), color, 30);
    if (this.rich) this.pillarExtra(p, R, color);
  }
  // 華麗的光柱（不轉送，pillarStrike 已經轉送過）：落地的大白光、往外撐開的半透明衝擊波球、地面鋪開的火、往上噴的火花、坑洞
  pillarExtra(p, R, color) {
    const K = this.k;
    const q = p.clone().setY(p.y + 1.5 * K);
    this.g.gl.emit({ p: q, life: 0.16, s0: R * 1.6, s1: R * 2.8, c0: 0xffffff, k: 1.4, cell: SOFT });
    this.g.gl.emit({
      p: q,
      life: 0.3,
      s0: R * 1.4,
      s1: R * 2.4,
      c0: color,
      a: 0.7,
      cell: pickCell(FXG.star),
    });
    const m = new THREE.Mesh(this.sphereGeo, this.addM(color, 0.35));
    m.material.side = THREE.DoubleSide;
    m.position.copy(p);
    m.renderOrder = 4;
    this.add(m, 0.4, (e, t) => {
      e.mesh.scale.setScalar(Math.max(0.2, R * 1.7 * Math.sqrt(t)));
      e.mesh.material.opacity = 0.35 * (1 - t);
    });
    // 地面鋪開的火：貼地往外推、很快慢下來
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * 6.2832 + rnd(-0.15, 0.15);
      const v = new THREE.Vector3(Math.cos(a), rnd(0.05, 0.3), Math.sin(a)).multiplyScalar(
        rnd(8, 18) * K * Math.max(1, R / (3 * K)),
      );
      this.g.gl.emit({
        p: p.clone().setY(p.y + 0.6 * K),
        v,
        drag: 2.6,
        life: rnd(0.6, 1.1),
        s0: 1.6 * K,
        s1: 3.6 * K,
        c0: 0xffe0a0,
        c1: frand() < 0.5 ? 0xff4010 : 0xc02000,
        a: 0.85,
        occ: 0.35,
        cell: pickCell(FXG.fire),
        rot: frand() * 6.28,
        rv: rnd(-2, 2),
      });
    }
    this.streaks(q, 14, 0xfff0d0, rnd(22, 32), 0.45, 18, new THREE.Vector3(0, 1, 0), 0.8);
    for (let i = 0; i < 3; i++) this.smoke(q.clone(), 1.6, 0x24262a, 2.2, 3);
    if (this.ground) {
      const gy = this.ground(p.x, p.z);
      if (gy != null && Math.abs(p.y - gy) < 3 * K) this.crater(p.x, gy, p.z, R * 1.3);
    }
  }
  // big additive thruster glare (billboard sphere) — used every frame by mechs, pooled per entity
  // 批次的代理（fx/batch.js 的 attached）：掛在場景裡，別處照舊 scene.remove／visible／position／scale／material.opacity
  // owner：所屬的實體（戰爭迷霧裡看不到時不畫）
  glareMesh(color, owner = null) {
    return this.batches.gl.get(color, 0.55, null, owner);
  }
  // ---- 機體支離破碎：把每個關節節點的網格拆成獨立碎片，給予初速、角速度、重力、地面反彈 ----
  shatter(ent, world) {
    // 合併過的網格（render/mesh-merge.js 的 mergeRig）先還原成各關節底下的網格，才拆得成碎片
    if (ent.model.unmerge) ent.model.unmerge();
    const root = ent.model.group;
    root.updateMatrixWorld(true);
    const center = ent.center();
    const pieces = [];
    const nodes = [];
    // 程式模型的網格掛在群組上；GLB 的網格可能掛在一般節點（Object3D）上，且網格本身帶有位移
    root.traverse((o) => {
      if ((o.isGroup || o.type === 'Object3D') && o.children.some((c) => c.isMesh)) nodes.push(o);
    });
    for (const n of nodes) {
      const g = new THREE.Group();
      n.matrixWorld.decompose(g.position, g.quaternion, g.scale);
      const meshes = n.children.filter((c) => c.isMesh && c.material.blending !== THREE.AdditiveBlending);
      for (const m of meshes) {
        n.remove(m);
        g.add(m); // 碎片群組＝原節點的世界變換，網格保留自己的區域變換
      }
      // sub-groups (e.g. weapons under hand) are handled as their own nodes; flames are not meshes so they vanish with the root
      this.scene.add(g);
      const pc = new THREE.Vector3();
      g.getWorldPosition(pc);
      const K = this.k;
      const dir = pc.clone().sub(center);
      dir.y += 0.6 * K;
      if (dir.lengthSq() < 0.01) dir.set(rnd(-1, 1), 1, rnd(-1, 1));
      dir.normalize();
      const v = dir
        .multiplyScalar(rnd(5, 13) * (ent.isBoss ? 1.4 : 1))
        .add(new THREE.Vector3(rnd(-2, 2), rnd(4, 11), rnd(-2, 2)))
        .multiplyScalar(K);
      const av = new THREE.Vector3(rnd(-7, 7), rnd(-7, 7), rnd(-7, 7));
      const burning = frand() < 0.35;
      let rest = false;
      let smokeT = 0;
      pieces.push(g);
      this.list.push({
        mesh: g,
        life: 9 + frand() * 2,
        max: 11,
        fn: (e, t, dt) => {
          if (!rest) {
            v.y -= 34 * K * dt;
            g.position.addScaledVector(v, dt);
            g.rotation.x += av.x * dt;
            g.rotation.y += av.y * dt;
            g.rotation.z += av.z * dt;
            const gy = world.terrainHeight(g.position.x, g.position.z) + 0.35 * K;
            if (g.position.y < gy) {
              g.position.y = gy;
              if (Math.abs(v.y) < 3 * K) {
                rest = true;
              } else {
                v.y *= -0.35;
                v.x *= 0.55;
                v.z *= 0.55;
                av.multiplyScalar(0.5);
                this.dust(g.position.clone().setY(gy - 0.3 * K), 1.2, 5);
                if (frand() < 0.5) this.streaks(g.position, 4, 0xffc050, 10, 0.3, 20);
              }
            }
          }
          if (burning) {
            smokeT += dt;
            if (smokeT > 0.12) {
              smokeT = 0;
              this.smoke(g.position.clone(), 0.7, 0x3a3d44, 1.2, 2.2);
              if (frand() < 0.5)
                this.boostFlame(
                  g.position
                    .clone()
                    .add(new THREE.Vector3(rnd(-0.3, 0.3), 0.2, rnd(-0.3, 0.3)).multiplyScalar(K)),
                  new THREE.Vector3(0, 1, 0),
                  0xff8030,
                );
            }
          }
          if (t > 0.85) {
            g.position.y -= dt * 0.8 * K;
          } // sink away at the end
        },
      });
    }
    // secondary detonations + big flash
    this.explosion(center, ent.isBoss ? 12 : 5, 0xffa040, true);
    this.flashLight(center, 0xffc060, ent.isBoss ? 60 : 30);
    // 依遊戲時間（fx.task）排程，不用 setTimeout：暫停時不會繼續爆，也不會在實際時間的空檔取用亂數
    // （遊戲邏輯共用同一個亂數串；冒煙測試快轉模擬時，結果會依實際經過的時間不同）
    const nB = ent.isBoss ? 8 : 3,
      step = ent.isBoss ? 0.16 : 0.11;
    let k = 0;
    this.task(nB * step + 0.08, (e, t) => {
      const el = t * e.max;
      while (k < nB && el >= (k + 1) * step) {
        k++;
        const p = center
          .clone()
          .add(new THREE.Vector3(rnd(-3, 3), rnd(-1, 3), rnd(-3, 3)).multiplyScalar(this.k));
        this.explosion(p, ent.isBoss ? 6 : 2.6, 0xff7030, ent.isBoss);
      }
    });
    return pieces;
  }
  // 斬擊的弧（XZ 平面、朝 yaw）；radius 是世界尺寸（呼叫端已乘機體的 scale）
  slash(center, yaw, arcDeg, radius, color, mirror = false, tilt = 0.35, dur = 0.22, spin = false) {
    const len = THREE.MathUtils.degToRad(arcDeg);
    const start = spin ? 0 : -len / 2;
    const mk = (inner, outer, col, op) =>
      new THREE.Mesh(new THREE.RingGeometry(inner, outer, 28, 1, start, len), this.addM(col, op));
    const grp = new THREE.Group();
    grp.position.copy(center);
    grp.rotation.order = 'YXZ';
    grp.rotation.y = yaw + Math.PI / 2;
    grp.rotation.x = -Math.PI / 2 + (mirror ? -tilt : tilt);
    const a = mk(radius * 0.55, radius, color, 0.85),
      b = mk(radius * 0.82, radius * 0.92, 0xffe0c0, 0.8);
    a.material.blending = THREE.NormalBlending;
    a.material.side = b.material.side = THREE.DoubleSide;
    grp.add(a);
    grp.add(b);
    // 華麗：刀光外面一圈往粉紅偏的能量環（參考 Oh! Robot 的光束刀），迴旋斬再加地面的衝擊環與一圈火花
    let c = null;
    if (this.rich) {
      const pk = new THREE.Color(color).lerp(new THREE.Color(0xff4fd8), 0.45).getHex();
      c = mk(radius * 0.9, radius * 1.16, pk, 0.75);
      c.material.side = THREE.DoubleSide;
      grp.add(c);
      if (spin) {
        this.shockwave(center.clone().setY(center.y - 0.5 * this.k), (radius * 1.25) / this.k, pk, dur * 1.6);
        this.streaks(center, 12, pk, 22, 0.3, 4);
      }
    }
    this.scene.add(grp);
    this.list.push({
      mesh: grp,
      life: dur,
      max: dur,
      fn: (e, t) => {
        e.mesh.scale.setScalar(0.7 + t * 0.5);
        a.material.opacity = 0.85 * (1 - t * t);
        b.material.opacity = 0.8 * (1 - t);
        if (c) c.material.opacity = 0.75 * (1 - t);
        e.mesh.rotation.z = (mirror ? 1 : -1) * (spin ? t * Math.PI * 2 : t * len * 0.8);
      },
    });
    this.streaks(
      center.clone().add(new THREE.Vector3(-Math.sin(yaw), 0.3, -Math.cos(yaw)).multiplyScalar(radius * 0.6)),
      6,
      color,
      16,
      0.25,
      10,
    );
    this.flashLight(center, color, 10);
  }
  // 近戰命中：o.sw＝揮的方向（刀痕的角度：'h' 橫斬、'hm' 反手、'u' 上挑、'v' 往下砸、't' 突刺、's' 迴旋），
  // o.s＝頓格秒數與 o.r＝範圍（客機用 onMeleeStop 讓附近的機體一起停住）
  meleeHit(p, color, big, dir, o) {
    o = o || {};
    if (o.s && this.onMeleeStop) this.onMeleeStop(p, o.s, o.r || 0);
    this.flash(p, big ? 0.9 : 0.5, 0xffffff, 0.06);
    this.flash(p, big ? 1.6 : 1.1, color, 0.22);
    // 刀痕：依揮的方向（Euler YXZ：先俯仰再偏航，長邊是本地 z）
    const yaw = dir && dir.x !== undefined ? Math.atan2(dir.x, dir.z) : 0;
    const sw = o.sw || 'h';
    const tilt = (frand() - 0.5) * 0.3;
    let pitch = 0.6 * (frand() < 0.5 ? 1 : -1),
      ry = yaw + Math.PI / 2,
      len = 1,
      mv = null; // 刀痕移動的方向（往上挑、往下砸）
    if (sw === 'h') pitch = -0.35 + tilt;
    else if (sw === 'hm') pitch = 0.35 + tilt;
    else if (sw === 's') pitch = tilt * 0.3;
    else if (sw === 'u' || sw === 'v') {
      pitch = Math.PI / 2 + tilt;
      mv = sw === 'u' ? 1 : -1;
    } else if (sw === 't') {
      pitch = tilt;
      ry = yaw;
      len = 0.75;
    }
    const K = this.k;
    // 刀痕的長邊＝本地 z 轉到世界；沿它拉長、面向鏡頭（往上挑、往下砸時整條往上下移）
    const axis = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(pitch, ry, 0, 'YXZ'));
    const v = mv ? new THREE.Vector3(0, (mv * 1.6 * K) / 0.3, 0) : null;
    const L = (big ? 6 : 4.2) * len * K;
    this.g.ln.emit({
      p,
      v,
      life: 0.28,
      s0: 0.42 * K,
      s1: 0.75 * K,
      c0: 0xffffff,
      cell: LINE,
      fade: 2,
      axis,
      asp: L,
    });
    this.g.ln.emit({
      p,
      v,
      life: 0.32,
      s0: 1.2 * K,
      s1: 2.3 * K,
      c0: color,
      a: 0.9,
      cell: LINE,
      axis,
      asp: L * 1.1,
    });
    if (sw === 't') this.shockwave(p, big ? 3.5 : 2.2, 0xffffff, 0.18); // 突刺：貫穿的小衝擊環
    this.shockwave(p.clone().setY(p.y - K), big ? 5 : 3, color, 0.3);
    this.streaks(p, big ? 24 : 12, color, big ? 26 : 18, 0.35, 24);
    this.streaks(p, big ? 8 : 4, 0xffffff, 30, 0.2, 8);
    if (big) {
      this.shockwave(p, 6, color, 0.4);
      this.smoke(p, 1.4, 0x4a4e55, 0.9, 2);
    }
  }
  update(dt) {
    this.time += dt;
    if (this.time > 2000) {
      // float 精度：時鐘與所有粒子的產生時間一起往回平移
      for (const g of this.gList) g.rebase(1900);
      this.time -= 1900;
      this.heatT -= 1900;
    }
    for (const g of this.gList) g.update(this.time, dt);
    this.thruster.update(dt);
    this.ribbons.update(dt);
    this.ghosts.update(dt);
    if (this.lightT > 0) {
      this.lightT -= dt;
      if (this.lightT <= 0) this.light.intensity = 0;
      else this.light.intensity *= 0.8;
    }
    // 一次走完並就地壓縮（大量粒子時逐一 splice 是 O(n²)）；這一格 fn 裡新加的項目留到下一格才更新
    const L = this.list,
      n = L.length;
    let j = 0;
    for (let i = 0; i < n; i++) {
      const e = L[i];
      e.life -= dt;
      if (e.life <= 0) {
        if (e.mesh) this.dispose(e.mesh);
        if (e.end) e.end();
        continue;
      }
      e.fn(e, 1 - e.life / e.max, dt);
      L[j++] = e;
    }
    if (this.list !== L) return this.flush(); // fn 裡呼叫了 clear()
    for (let i = n; i < L.length; i++) L[j++] = L[i];
    L.length = j;
    this.flush();
  }
  // 移除到期的特效網格並釋放材質與（非共用的）幾何
  dispose(mesh) {
    if (mesh.isFxProxy) {
      if (mesh.fxBatch) mesh.fxBatch.release(mesh);
      return;
    }
    if (mesh.parent) mesh.parent.remove(mesh);
    const keep =
      this.keepGeos ||
      (this.keepGeos = new Set([this.sphereGeo, this.boxGeo, this.chevGeo, this.ringGeo, this.discGeo]));
    mesh.traverse((o) => {
      if (o.material) o.material.dispose();
      if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose();
    });
  }
  clear() {
    for (const e of this.list) if (e.mesh && !e.mesh.isFxProxy) this.scene.remove(e.mesh);
    this.list = [];
    for (const b of this.batchList) b.clear();
    for (const g of this.gList) g.clear();
    this.time = 0;
    this.light.intensity = 0;
    this.glows.clear();
    for (const L of this.fireLights) L.intensity = 0;
    this.heatT = -1;
    this.columns = 0;
    this.thruster.clear();
    this.ribbons.clear();
    this.ghosts.clear();
  }
}

// ---------- 特效：物件與車輛碎裂（碎片落地後合併成一個網格、永久保留） ----------
Object.assign(Effects.prototype, {
  debrisPieces(list, color, persist) {
    const scene = this.scene;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.2, flatShading: true });
    const pieces = [];
    for (const d of list) {
      const m = new THREE.Mesh(d.geo, mat);
      m.position.copy(d.pos);
      m.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
      m.castShadow = true;
      scene.add(m);
      const v = d.pos
        .clone()
        .sub(d.origin)
        .normalize()
        .multiplyScalar(rnd(4, 10))
        .add(new THREE.Vector3(rnd(-2, 2), rnd(5, 11), rnd(-2, 2)))
        .multiplyScalar(this.k);
      const av = new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
      pieces.push({ m, v, av, rest: false });
    }
    const world = persist.world,
      K = this.k;
    let done = false;
    this.list.push({
      mesh: null,
      life: 6,
      max: 6,
      fn: (e, t, dt) => {
        let all = true;
        for (const p of pieces) {
          if (p.rest) continue;
          all = false;
          p.v.y -= 34 * K * dt;
          p.m.position.addScaledVector(p.v, dt);
          p.m.rotation.x += p.av.x * dt;
          p.m.rotation.y += p.av.y * dt;
          p.m.rotation.z += p.av.z * dt;
          const gy = world.terrainHeight(p.m.position.x, p.m.position.z) + 0.25;
          if (p.m.position.y < gy) {
            p.m.position.y = gy;
            if (Math.abs(p.v.y) < 2.5 * K) {
              p.rest = true;
            } else {
              p.v.y *= -0.35;
              p.v.x *= 0.5;
              p.v.z *= 0.5;
              p.av.multiplyScalar(0.5);
            }
          }
        }
        if ((all || t > 0.95) && !done) {
          done = true; // 合併成單一網格並永久保留
          const geos = [];
          for (const p of pieces) {
            p.m.updateMatrixWorld(true);
            geos.push({ geo: p.m.geometry, mm: p.m.matrixWorld.clone() });
            scene.remove(p.m);
          }
          const merged = mergeGeos(geos);
          if (merged) {
            const mm = new THREE.Mesh(merged, mat);
            mm.castShadow = true;
            mm.receiveShadow = true;
            scene.add(mm);
            if (world.meshes) world.meshes.push(mm);
          }
        }
      },
    });
  },
  // 碎片落地後縮小消失（地圖物件的碎裂；殘骸本身另外留在原地，world/prop-wreck.js）
  propDebris(list, color, world, dir) {
    const scene = this.scene;
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.2, flatShading: true });
    const K = this.k;
    const pieces = list.map((d) => {
      const m = new THREE.Mesh(d.geo, mat);
      m.position.copy(d.pos);
      m.rotation.set(rnd(0, 3), rnd(0, 3), rnd(0, 3));
      m.castShadow = true;
      scene.add(m);
      const v = d.pos.clone().sub(d.origin).setY(0);
      if (v.lengthSq() < 1e-4) v.set(rnd(-1, 1), 0, rnd(-1, 1));
      v.normalize().multiplyScalar(rnd(3, 8) * d.sp);
      if (dir) v.addScaledVector(dir, rnd(2, 6) * d.sp);
      v.y = rnd(4, 10) * d.sp;
      v.multiplyScalar(K);
      return { m, v, av: new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)), rest: false, s: 1 };
    });
    const life = 6;
    this.list.push({
      mesh: null,
      life,
      max: life,
      fn: (e, t, dt) => {
        const left = (1 - t) * life;
        for (const p of pieces) {
          if (!p.rest) {
            p.v.y -= 34 * K * dt;
            p.m.position.addScaledVector(p.v, dt);
            p.m.rotation.x += p.av.x * dt;
            p.m.rotation.y += p.av.y * dt;
            p.m.rotation.z += p.av.z * dt;
            const gy = world.groundAt(p.m.position.x, p.m.position.z, p.m.position.y + 1) + 0.2;
            if (p.m.position.y < gy) {
              p.m.position.y = gy;
              if (Math.abs(p.v.y) < 2.5 * K) p.rest = true;
              else {
                p.v.y *= -0.35;
                p.v.x *= 0.5;
                p.v.z *= 0.5;
                p.av.multiplyScalar(0.5);
              }
            }
          }
          if (left < 1.5) p.m.scale.setScalar(Math.max(0.001, left / 1.5));
        }
      },
      end: () => {
        for (const p of pieces) scene.remove(p.m);
        mat.dispose();
      },
    });
  },
  // 地圖物件完全損毀（docs/destruction-design.md）：依大小與材質的碎片、爆發；只在各端自己播（不轉送，客機收到
  // propDie 自己播一次）。o＝{ dir 衝擊方向, cr 被踩平 }
  shatterProp(p, world, o = {}) {
    const nest = this._nested;
    this._nested = true;
    SFX.netDepth++;
    try {
      this.shatterPropIn(p, world, o);
    } finally {
      this._nested = nest;
      SFX.netDepth--;
    }
  },
  shatterPropIn(p, world, o) {
    const sh = p.shape;
    const W = Math.max(0.5, sh.x1 - sh.x0),
      D = Math.max(0.5, sh.z1 - sh.z0),
      H = Math.max(0.5, sh.y1 - sh.y0);
    const c = new THREE.Vector3((sh.x0 + sh.x1) / 2, (sh.y0 + sh.y1) / 2, (sh.z0 + sh.z1) / 2);
    const M = PMAT[p.mat] || PMAT.metal;
    const size = Math.cbrt(W * D * H);
    const big = size > 7;
    const gy = world.groundAt(c.x, c.z, sh.y0 + 1);
    const ground = new THREE.Vector3(c.x, gy + 0.1, c.z);
    const col = propDebrisCol(p, true);
    // 碎片
    const n = Math.max(5, Math.min(o.cr ? 8 : 22, Math.round(size * 1.6)));
    const s = Math.max(0.3, Math.min(2.8, size * 0.17));
    const list = [];
    for (let i = 0; i < n; i++) {
      let geo;
      const q = s * rnd(0.6, 1.3);
      if (M.deb === 'rock' || M.deb === 'chunk' || M.deb === 'ice')
        geo = new THREE.DodecahedronGeometry(q * 0.6, 0);
      else if (M.deb === 'plank') geo = new THREE.BoxGeometry(q * 0.2, q * 0.16, q * 1.5);
      else if (M.deb === 'crystal') geo = new THREE.ConeGeometry(q * 0.3, q * 1.1, 5);
      else geo = new THREE.BoxGeometry(q, q * 0.1, q * 0.75);
      list.push({
        geo,
        pos: new THREE.Vector3(sh.x0 + rnd(0, 1) * W, sh.y0 + rnd(0.2, 0.95) * H, sh.z0 + rnd(0, 1) * D),
        origin: c,
        sp: o.cr ? 0.5 : 1,
      });
    }
    this.propDebris(list, col, world, o.dir || null);
    // 爆發（依材質）
    const r = Math.max(1.2, Math.min(9, (Math.max(W, D, H * 0.6) * 0.45) / (this.k || 1)));
    if (o.cr) {
      this.dust(ground, Math.min(2.5, r), 6, M.col !== undefined ? M.col : 0x9aa0a8);
      SFX.hitWorld(c);
      return;
    }
    if (M.boom === 'fire') {
      this.explosion(c, r, 0xffa040, big);
      if (size > 3) this.killBurst(c, Math.min(2.4, size / 5), big, gy);
      SFX.explode(big, c);
    } else if (M.boom === 'arc') {
      this.arc(c, r * 0.8, 0x9fe0ff);
      this.flash(c, r * 0.5, 0xbfe8ff, 0.2);
      this.streaks(c, 14, 0xbfe8ff, 14, 0.4, 20);
      this.explosion(c, r * 0.5, 0xffc060, false);
      SFX.explode(false, c);
    } else if (M.boom === 'coral') {
      this.flash(c, r * 0.8, 0xff3040, 0.35);
      this.star(c, r, 0xff5060);
      this.streaks(c, 16, 0xff4050, 12, 0.6, 8);
      SFX.explode(false, c);
    } else {
      // 混凝土、岩石、冰、金屬的崩落：粉塵為主
      const dc = M.col !== undefined ? M.col : 0xa09a90;
      this.explosion(c, r * 0.45, M.deb === 'ice' ? 0xd8eef8 : M.fx === 'dust' ? 0xc0b090 : 0xffa040, false);
      for (let i = 0; i < 4; i++)
        this.smoke(
          new THREE.Vector3(c.x + rnd(-0.4, 0.4) * W, sh.y0 + rnd(0.1, 0.6) * H, c.z + rnd(-0.4, 0.4) * D),
          Math.max(1, size * 0.35),
          dc,
          2.2,
          1.4,
        );
      SFX.wreck(c);
    }
    this.dust(ground, r, big ? 12 : 8, M.col !== undefined ? M.col : 0x9aa0a8);
  },
  shatterVehicle(v) {
    const world = v.game.world;
    const list = [];
    for (let i = 0; i < v.cars; i++) {
      const cp = v.carPos(i).add(new THREE.Vector3(0, 1.5, 0));
      for (let k = 0; k < 8; k++)
        list.push({
          geo: new THREE.BoxGeometry(rnd(0.6, 2.2), rnd(0.15, 0.5), rnd(0.8, 2.4)),
          pos: cp.clone().add(new THREE.Vector3(rnd(-1.5, 1.5), rnd(-1, 1), rnd(-3, 3))),
          origin: cp,
        });
    }
    this.debrisPieces(list, v.kind === 'train' ? 0x4a4a44 : 0x2b4a8a, { world });
  },
});
