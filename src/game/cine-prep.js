// Game：過場動畫的預先準備（docs/cinematics.md 的「預先準備」）。
// 以前 3D 場景在播到那一鏡時才建地圖（0.4～1 秒），新地圖又觸發出擊用的著色器預熱（「戰場準備中」、主迴圈停住），
// 時鐘是配樂的時間，所以畫面停住、聲音照走，之後畫面跳過去。現在：
//  - 開頭的載入畫面（#cineLoad）依劇本的順序把每個 3D 場景（world、space）建在自己的群組裡，連同那個場景的
//    全部演員一起編好著色器、畫一次上傳資源（shaderWarm＋warmPrime），演員之後移除（著色器程式留在快取裡）
//  - 記憶體允許時場景常駐（一張地圖約 100～350 MB），換鏡頭只切換顯示（game/cine.js 的 cineUseSet）；
//    觸控裝置（記憶體 8 GB 以下）最多 2 個、其他依 JS 記憶體的上限；超過的只預熱、建完就釋放
//  - 沒有常駐的場景在換鏡頭時建（cineHoldBuild）：建之前暫停 AudioContext（配樂、語音、時鐘一起停），
//    建好、預熱完再繼續，畫面停在上一格、不顯示任何訊息
//  - 之後不會再用到的場景立刻釋放（cineSetGc）；台詞的語音先解碼（game/voice.js 的 voicePreload）
import { SFX } from '../audio/audio.js';
import { energyWarm } from '../fx/energy.js';
import { transpWarm, warmGroup } from '../render/shader-warm.js';
import { CINE_GRADE } from './constants.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const has3d = (S) => S && (S.k === 'world' || S.k === 'space' || S.k === 'room');

Object.assign(Game.prototype, {
  // 這一段過場要的 3D 場景：[{ key, spec, first, last, shots }]，依第一次出現的順序
  cineSetPlan(c) {
    const m = new Map();
    c.def.shots.forEach((sh, i) => {
      const S = this.cineSetSpec(c, sh.set);
      // 黑畫面也可能有演員（駕駛員的手）：只預熱
      if (!has3d(S) && !(S.k === 'black' && (sh.actors || []).length)) return;
      const key = JSON.stringify(S);
      let e = m.get(key);
      if (!e) m.set(key, (e = { key, spec: S, first: i, last: i, shots: [] }));
      e.last = i;
      e.shots.push(i);
    });
    return [...m.values()];
  },
  // 還能不能再多常駐一個場景
  cineResOk(c) {
    const touch = document.body.classList.contains('touchDev');
    const dm = navigator.deviceMemory || 0;
    if (touch && !(dm >= 8) && c.sets.size >= 2) return false;
    const pm = performance.memory;
    if (pm && pm.jsHeapSizeLimit && pm.usedJSHeapSize > pm.jsHeapSizeLimit * 0.55) return false;
    return true;
  },
  async cinePrep(c) {
    const plan = this.cineSetPlan(c);
    c.lastUse = new Map(plan.map((e) => [e.key, e.last]));
    // 台詞的語音（和場景一起準備，最多等 8 秒）
    const lines = [];
    for (const sh of c.def.shots)
      for (const ev of sh.ev || []) if (ev.sub) lines.push([ev.sub, ev.who || 'narr']);
    const vp = this.voicePreload ? this.voicePreload(lines).catch(() => {}) : null;
    const bar = $('cineLoad');
    // 後處理的各段（熱扭曲、光束、景深…）第一次畫時才編譯：先編
    const pipe = this.post.enabled && this.post.ok && this.stylePipe;
    if (pipe && pipe.warm && plan.length) await Promise.all(pipe.warm(true)).catch(() => {});
    for (let i = 0; i < plan.length; i++) {
      if (this.cine !== c) return;
      if (bar) bar.dataset.p = `${i + 1} / ${plan.length}`;
      await frame(); // 讓載入畫面更新
      if (this.cine !== c) return;
      const e = plan[i];
      const set = this.cineMakeSet(c, e.spec);
      if (set.root) c.sets.set(e.key, set);
      await this.cineWarmSet(c, set, e.shots);
      if (this.cine !== c) return;
      // 常駐不下：只留著色器，幾何釋放（播到時 cineHoldBuild 再建）
      if (set.root && !this.cineResOk(c)) {
        c.sets.delete(e.key);
        this.cineSetFree(set);
      }
    }
    if (bar) delete bar.dataset.p;
    c.prepInfo = { sets: plan.length, kept: c.sets.size }; // 測試：準備了幾個場景、常駐幾個
    if (vp) await Promise.race([vp, new Promise((r) => setTimeout(r, 8000))]);
  },
  // 預熱一個場景：切過去（光線、霧要和播放時相同，程式的鍵含霧與光源）、放上這個場景全部鏡頭的演員，
  // 編好整個場景的著色器並畫一次（上傳幾何與貼圖、陰影的深度材質），之後演員移除、場景藏起來
  async cineWarmSet(c, set, shots) {
    this.cineClearSet(c);
    this.cineUseSet(c, set);
    for (const si of shots) {
      const sh = c.def.shots[si];
      for (const spec of sh.actors || []) if (!c.actors.has(spec.id)) this.cineAddActor(spec, sh.at);
    }
    // 各章的掛勾（game/cine-c<章>.js）在進鏡頭時才建的模型（天線、殘骸…）也一起預熱：enter 之後馬上 exit
    const hooked = shots.map((i) => c.def.shots[i]).filter((sh) => sh.hook);
    for (const sh of hooked) {
      try {
        this.cineHookCall(sh, 'enter');
      } catch (err) {
        /* 掛勾要的狀態還沒有：略過 */
      }
    }
    const R = this.renderer;
    // 半透明版（鏡頭遮擋的淡出、碎塊）＋第一個場景時：任務中記下的變體與能量特效（render-setup.js 的 shaderWarm 也加這些）
    const ex = new THREE.Group();
    ex.add(transpWarm(set.root || this.scene));
    if (!c.warmEx) {
      c.warmEx = true;
      ex.add(warmGroup([]));
      if (this.fx.rich) ex.add(energyWarm(this.fx.k));
    }
    this.scene.add(ex);
    try {
      if (R && typeof R.compileAsync === 'function') {
        const p = this.shaderWarm(this.scene, true);
        await Promise.race([p, new Promise((r) => setTimeout(r, 15000))]);
      } else this.shaderWarm(this.scene);
      if (this.cine === c) this.warmPrime();
      this.scene.remove(ex);
      // 實際的算繪路徑畫兩格：水面的模擬與反射、天氣、後處理（景深…）的著色器只在真的畫的時候才建
      if (this.cine === c) {
        const sh = c.def.shots[shots[0]];
        c.P = { ...this.styleP, ...CINE_GRADE, ...(c.def.grade || {}), ...(sh.grade || {}) };
        this.camera.position.copy(set.anchor).add(new THREE.Vector3(0, 12 * set.k, 30 * set.k));
        this.camera.lookAt(set.anchor);
        this.renderMain();
        this.renderMain();
      }
    } catch (err) {
      /* 預熱失敗：照 three.js 原本的第一次畫到才編譯 */
    }
    this.scene.remove(ex);
    for (const sh of hooked) {
      try {
        this.cineHookCall(sh, 'exit');
      } catch (err) {
        /* 略過 */
      }
    }
    if (this.cine !== c) return;
    this.cineClearSet(c); // 演員移除、場景藏起來
  },
  // 換到這一鏡時要不要先停下來建場景
  cineNeedHold(c, sh) {
    if (c.hold) return true;
    const S = this.cineSetSpec(c, sh.set);
    if (!has3d(S)) return false;
    const key = JSON.stringify(S);
    return key !== c.setKey && !c.sets.has(key);
  },
  // 暫停時鐘（AudioContext）→ 建場景、預熱 → 繼續；期間 cineTick 不動、畫面停在上一格
  async cineHoldBuild(c, sh) {
    if (c.hold) return;
    c.hold = true;
    c.holdN = (c.holdN || 0) + 1; // 測試：建了幾次
    const ctx = SFX.ctx,
      audio = c.clockAudio && ctx && ctx.state === 'running';
    const r0 = performance.now();
    try {
      if (audio) await ctx.suspend();
      if (this.cine !== c) return;
      const S = this.cineSetSpec(c, sh.set);
      // 先放掉之後用不到的，騰出記憶體
      this.cineSetGc(c, c.def.shots.indexOf(sh));
      const set = this.cineMakeSet(c, S);
      c.sets.set(set.key, set);
      const si = c.def.shots.indexOf(sh);
      const same = (i) => JSON.stringify(this.cineSetSpec(c, c.def.shots[i].set)) === set.key;
      await this.cineWarmSet(
        c,
        set,
        c.def.shots.map((x, i) => i).filter((i) => i >= si && same(i)),
      );
    } finally {
      if (this.cine === c) {
        if (audio && ctx.state === 'suspended') await ctx.resume();
        else if (!audio) c.real0 += (performance.now() - r0) / 1000; // 沒有配樂：實際時間的時鐘扣掉這段
        c.hold = false; // 下一格 cineEnterShot 照常進這一鏡（場景已經常駐）
      }
    }
  },
  // 第 si 鏡之後不會再用到的常駐場景釋放（劇場往回跳時由 cineHoldBuild 重建）
  cineSetGc(c, si) {
    if (!c.lastUse) return;
    for (const [key, set] of [...c.sets]) {
      if (set === c.set) continue;
      const last = c.lastUse.get(key);
      if (last == null || last < si) {
        c.sets.delete(key);
        this.cineSetFree(set);
      }
    }
  },
  cineSetFree(set) {
    if (!set || set.freed) return;
    set.freed = true;
    if (this.world === set.world) this.world = null;
    if (set.world) set.world.dispose();
    if (set.space) set.space.dispose();
    if (set.root) {
      this.scene.remove(set.root);
      if (!set.keepGeo)
        set.root.traverse((o) => {
          if (o.geometry && !o.geometry.parameters) o.geometry.dispose();
        });
    }
  },
  cineSetsDispose(c) {
    for (const set of c.sets.values()) this.cineSetFree(set);
    c.sets.clear();
  },
});
