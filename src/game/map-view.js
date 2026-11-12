// ============================================================
//  Game：地圖預覽器（標題的「地圖預覽」，docs/map-viewer-design.md）
//  檢視各地圖主題的地圖、地圖物件、敵人與特效搭不搭，同時看渲染效能。this.mapv 存在時 state 是 'play'，
//  主迴圈改呼叫 mapvTick；不寫存檔、不給經驗與掉落（mission.js 的 onEnemyKilled／onPlayerDead 看 this.mapv）。
//  第 1 期：選地圖（主題、變體、地標、種子、時間、天候、大小）、自由／環繞／全圖俯視鏡頭、基本效能面板、觸控操作
//  第 2 期：敵人（map-view-foes.js）、AI 開關、電影鏡頭、遊戲的視角（操作一台無敵的玩家機體）
//  第 3 期：Boss 擂台、友軍、渲染風格切換與左右比較（map-view-boss.js）
// ============================================================
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { clamp } from '../core/math.js';
import { DS } from '../core/scale.js';
import { MechEntity } from '../entities/mech-entity.js';
import { landmarkKeys, LANDMARKS } from '../world/landmarks.js';
import { VARIANTS } from '../world/variants.js';
import { THEMES, World } from '../world/world.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const opt = (v, t, cur) =>
  `<option value="${escHtml(v)}"${String(v) === String(cur) ? ' selected' : ''}>${escHtml(t)}</option>`;
const rndSeed = () => 1 + Math.floor(Math.random() * 999999);
const CAMS = [
  ['free', '自由', 'WASD 移動、拖曳旋轉、右鍵拖曳平移、滾輪縮放（觸控：單指旋轉、雙指縮放與平移）'],
  ['orbit', '環繞', '繞著中心點慢慢轉（拖曳改角度、滾輪縮放）'],
  ['top', '全圖', '從正上方看整張地圖（拖曳平移、滾輪縮放）'],
  ['cinema', '電影', '自動環繞目標，每 8 秒換下一台'],
];
const CIN_T = 8; // 電影鏡頭換目標的秒數
const TAP_PX = 8; // 指標移動不到這麼多像素＝點一下（選取敵人）
const TODS = [
  ['', '主題預設'],
  ['dawn', '黎明'],
  ['dusk', '黃昏'],
  ['night', '夜間'],
];
const WEATHERS = [
  ['', '主題預設'],
  ['none', '無'],
  ['snow', '雪'],
  ['sand', '沙暴'],
  ['dust', '塵'],
  ['rain', '雨'],
  ['ash', '灰燼'],
  ['coral', '光塵'],
];
const SIZES = [
  ['big', '大地圖（一般戰鬥）'],
  ['std', '標準'],
  ['open', 'Boss 關（開闊）'],
];
const REGEN_DELAY = 0.4; // 參數改了停手幾秒才重新產生
const SPARK_N = 240; // 走勢圖保留幾個取樣（每格一個，約 4 秒；畫的時候取最近的）
const PREF = 'mech_cordon_mapview'; // 上次的地圖參數（只是方便，不重要）

Object.assign(Game.prototype, {
  // ---------- 進入／離開 ----------
  async openMapView() {
    if (this.net && this.net.role) return;
    if (this.srvGate(() => this.openMapView())) return; // 伺服器預設組還在讀（local-lib.js）
    SFX.init();
    this.clearMission();
    let pref = {};
    try {
      pref = JSON.parse(localStorage.getItem(PREF) || '{}') || {};
    } catch (e) {}
    const theme = THEMES[pref.theme] ? pref.theme : 'industrial';
    this.mapv = {
      p: {
        theme,
        variant: pref.variant || '',
        landmark: pref.landmark || '',
        seed: pref.seed > 0 ? pref.seed : rndSeed(),
        tod: pref.tod || '',
        weather: pref.weather || '',
        size: pref.size || 'big',
      },
      cam: 'free',
      F: { yaw: 0.7, pitch: 0.75, dist: 120 * DS, pivot: new THREE.Vector3() },
      paused: false,
      speed: 1,
      panel: innerHeight > 540, // 手機橫式預設收起
      tab: 'map',
      // 敵人（map-view-foes.js）：mode real 實戰編成／gallery 圖鑑排列／none；lv 等級；ai 行動；god 無敵；
      // extras 據點與裝置等；all 不等玩家靠近全部生成；waves 增援；kinds 圖鑑的種類
      f: {
        mode: 'real',
        lv: 6,
        ai: true,
        god: true,
        extras: true,
        all: true,
        waves: false,
        kinds: { theme: true, ace: true, gen: true },
        boss: 0, // Boss 擂台（map-view-boss.js）：BOSS_DEFS 的索引、刁鑽度（'auto'＝依自由出擊）
        tier: 'auto',
        allies: 0, // 友軍（藍隊的具名 AC）
      },
      style: '', // 預覽器自己的渲染風格（'k:id'，空字串＝遊戲目前的）、左右比較
      cmpSel: '',
      cmp: null,
      split: 0.5,
      tgt: null,
      cinT: 0,
      game: false, // 遊戲的視角：操作玩家的機體
      regenT: 0,
      busy: false,
      ptrs: new Map(), // 觸控／滑鼠的指標（雙指縮放平移）
      st: { frames: 0, t: 0, last: 0, cpu: 0, cpuMax: 0, dtMax: 0, spark: [], sparkI: 0 },
    };
    try {
      await this.lmRefresh();
    } catch (e) {}
    if (!this.mapv) return;
    this.renderer.info.autoReset = false;
    document.body.classList.add('mapv');
    $('btnAbort').textContent = '離開地圖預覽';
    this.mapvBuildUi();
    this.mapvGenerate();
  },
  exitMapView() {
    if (!this.mapv) return;
    this.clearMission();
    this.mapv = null;
    this.renderer.info.autoReset = true;
    this.camExtra = 0;
    this.camera.far = 400 * DS;
    this.camera.updateProjectionMatrix();
    for (const id of ['mvPanel', 'mvBar', 'mvStat', 'mvBusy']) $(id).hidden = true;
    document.body.classList.remove('mapv', 'mvMini', 'mvGame');
    $('btnAbort').textContent = '放棄任務';
    this.styleRefresh();
    this.state = 'title';
    this.showScreen('title');
  },
  // ---------- 產生地圖 ----------
  // 參數改了：停手一下再產生（連續改種子不會每次都建）
  mapvQueue() {
    const V = this.mapv;
    V.regenT = REGEN_DELAY;
    this.mapvSavePref();
  },
  mapvSavePref() {
    try {
      localStorage.setItem(PREF, JSON.stringify(this.mapv.p));
    } catch (e) {}
  },
  // 建地圖會卡住一下：先顯示「生成中…」讓瀏覽器畫出來，再建
  mapvGenerate() {
    const V = this.mapv;
    if (!V || V.busy) return;
    V.busy = true;
    $('mvBusy').hidden = false;
    setTimeout(() => {
      if (this.mapv !== V) return;
      try {
        this.mapvBuild();
      } finally {
        V.busy = false;
        $('mvBusy').hidden = true;
      }
    }, 40);
  },
  mapvBuild() {
    const V = this.mapv,
      p = V.p;
    this.clearMission();
    this.mapvApplyStyle(); // 預覽器自己的渲染風格（map-view-boss.js）
    const vs = VARIANTS[p.theme] || {};
    if (p.variant && !vs[p.variant]) p.variant = '';
    if (p.landmark && !(LANDMARKS[p.theme] || {})[p.landmark]) p.landmark = '';
    // Boss 擂台：Boss 關的開闊地圖；這隻 Boss 不排在這個主題時換一個（主題的 bossBan、武裝列車要鐵路）
    const boss = V.f.mode === 'boss';
    const bd = boss ? this.mapvBossDef() : null;
    const theme = boss ? this.mapvBossTheme(p.theme) : p.theme;
    const big = p.size === 'big' && !boss;
    this.world = new World(this.scene, theme, p.seed, 3, null, {
      variant: theme === p.theme ? p.variant || undefined : undefined,
      landmark: theme === p.theme ? p.landmark || undefined : undefined,
      tod: p.tod || undefined,
      weather: p.weather || undefined,
      big: big ? 1 : undefined,
      edge: big ? 1 : undefined,
      open: p.size === 'open' || boss ? 1 : undefined,
      rail: bd && bd.rail ? 1 : undefined,
    });
    const w = this.world;
    this.worldSeed = p.seed;
    this.worldTheme = theme;
    w.applyLight(this);
    this.sun.position.set(40, 80, 30);
    this.isClient = false;
    this.net.spawnReg = {};
    this.mpStats = { 0: { kills: 0, dmg: 0, rev: 0, taken: 0, xp: 0, pf: {} } };
    this.enemies = [];
    this.allies = [];
    this.waves = [];
    this.wavePend = null;
    this.bosses = [];
    this.boss = null;
    this.isBossLevel = false;
    this.missionT = 0;
    this.missionEarned = 0;
    this.bountyPops = [];
    this.scaleHp = 1;
    this.scaleDmg = 1;
    // 玩家的機體：當尺寸的參考（之後的遊戲視角操作它）；無敵（mapvTick 每格補滿）
    this.player = new MechEntity(this, this.save.asm, this.myPal(), {
      team: 'player',
      name: 'KEYSTONE',
      palKey: this.myPalKey(),
      slot: 0,
    });
    this.placeStart(this.player);
    this.players = [this.player];
    V.tgt = null;
    $('bossBar').style.display = 'none'; // Boss 擂台時 mapvSpawnBoss 打開
    this.mapvSpawnFoes(); // 敵人（map-view-foes.js）
    this.mapvSpawnAllies(); // 友軍（map-view-boss.js）
    this.levelName =
      '地圖預覽・' +
      w.theme.name +
      (w.variantKey ? '・' + this.variantName(theme, w.variantKey) : '') +
      (w.landmark ? '・' + w.landmark.name : '');
    this.state = 'play';
    this.showScreen('');
    this.lastT = performance.now();
    this.camZoom = this.camBase();
    this.camCU = null;
    this.camera.far = 900 * DS;
    this.camera.updateProjectionMatrix();
    // 鏡頭：中心點放在作戰區域中央
    const Z = w.zone;
    if (V.f.mode !== 'gallery') {
      V.F.pivot.set((Z[0] + Z[1]) / 2, 0, (Z[2] + Z[3]) / 2);
      V.F.pivot.y = w.terrainHeight(V.F.pivot.x, V.F.pivot.z);
    }
    if (V.cam === 'top') this.mapvTopFit();
    if (V.game) this.mapvSetGame(true);
    if (V.tab === 'foes') this.mapvRenderTab();
    this.stylePipe.resetHistory();
    this.mapvSyncUi();
  },
  // 全圖：中心在作戰區域中央、距離放得下整張地圖
  mapvTopFit() {
    const V = this.mapv,
      w = this.world;
    if (!w) return;
    const Z = w.zone;
    V.F.pivot.set(
      (Z[0] + Z[1]) / 2,
      w.terrainHeight((Z[0] + Z[1]) / 2, (Z[2] + Z[3]) / 2),
      (Z[2] + Z[3]) / 2,
    );
    V.F.yaw = 0;
    V.F.pitch = 1.5;
    V.F.dist = w.size * 1.05;
  },
  mapvSetCam(c) {
    const V = this.mapv;
    if (V.cam === 'top' && c !== 'top') {
      V.F.pitch = 0.75;
      V.F.dist = Math.min(V.F.dist, 200 * DS);
    }
    V.cam = c;
    if (c === 'top') this.mapvTopFit();
    this.mapvSyncUi();
  },
  // ---------- 每格 ----------
  mapvTick(dt) {
    const V = this.mapv;
    const t0 = performance.now();
    this.renderer.info.reset();
    if (V.regenT > 0) {
      V.regenT -= dt;
      if (V.regenT <= 0) this.mapvGenerate();
    }
    const step = V.paused || V.busy ? 0 : dt * V.speed;
    if (step > 0 && this.world && this.player) this.mapvSim(step);
    if (this.world && this.player) {
      if (V.game) {
        this.updateCamera(dt);
        SFX.setListener(this.player.center());
        this.updateLoops();
      } else {
        this.lodTick();
        this.mapvCamera(dt);
        SFX.setListener(this.camera.position);
      }
      this.renderMain();
    }
    if (V.game && this.player) this.drawHud(dt);
    else this.hctx.clearRect(0, 0, innerWidth, innerHeight);
    // 目標被擊破：資訊與名稱更新
    if (V.tgt && V.tgt.dead) this.mapvSetTgt(null);
    if ((this.frames & 31) === 0) this.mapvTgtUi();
    if ((this.frames & 15) === 0 && V.tab === 'foes' && V.f.mode === 'boss') this.mapvBossUi();
    this.mapvStats(t0);
  },
  // 遊戲邏輯一格（照主迴圈的任務中，沒有勝敗與存檔）：玩家與敵人無敵時每格補滿
  mapvSim(step) {
    const V = this.mapv,
      f = V.f,
      p = this.player;
    this.missionT += step;
    this.time += step;
    p.hp = p.maxHp;
    if (V.game && !p.dead && !p.downed) this.updatePlayer(step);
    else p.move(step, new THREE.Vector3(), false, false, false, null);
    this.updateMapExtras(step);
    if (V.game) this.lodTick();
    if (f.ai) this.aiDirectorTick(step);
    const batch = this.aiBatchOn();
    // Boss：三個型態、換型態的增援、狂暴（bosses.js）；AI 停住時不換型態
    if (f.ai && this.bosses && this.bosses.length) this.bossPhaseTick(step);
    for (const e of this.enemies) {
      if (e.dead) continue;
      // 無敵：一般敵人每格補滿；Boss 不補（要看型態），只保留一點不會被擊破
      if (f.god) e.hp = e.isBoss ? Math.max(e.hp, e.maxHp * 0.02) : e.maxHp;
      if (f.ai) this.aiStep(e, step, batch);
      else this.mapvIdle(e, step);
    }
    this.separateMechs(step);
    for (const a of this.allies)
      if (!a.dead) {
        a.hp = a.maxHp;
        this.aiStep(a, step, batch);
      }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const q = this.projectiles[i];
      q.update(step);
      if (q.dead) this.projectiles.splice(i, 1);
    }
    this.updateShocks(step);
    this.updateSupport(step);
    this.updateHazards(step);
    this.lavaTick(step);
    this.propCrushTick();
    if (this.crowd) this.crowdTick(step);
    this.fx.update(step);
    this.tickPopups(step);
    this.spawnQTick(); // 生成佇列：一格一台（全部生成、增援）
    if (f.ai) {
      this.encWakeTick(); // 遠處的敵群：玩家靠近才生成
      if (f.waves && (this.waves.length || this.wavePend)) this.waveTick(step);
      this.devTick(step); // 地圖互動裝置
    }
    this.devVisTick(step);
  },
  // 遊戲的視角：操作玩家的機體（俯視／追尾／第一人稱照設定，V 切換），HUD 與觸控按鈕照任務
  mapvSetGame(on) {
    const V = this.mapv;
    const was = V.game;
    V.game = !!on;
    document.body.classList.toggle('mvGame', V.game);
    V.ptrs.clear();
    if (V.game) {
      // 面板會蓋住任務的 HUD（左上的任務資訊）：進入時收起，要用再按「面板」；離開時恢復
      if (!was) V.panel0 = V.panel;
      V.panel = false;
      this.camZoom = this.camBase();
      this.camCU = null;
      this.camExtra = 0;
      this.viewReset();
      this.camSnap();
      this.renderWeaponHud(true);
    } else {
      if (document.pointerLockElement) document.exitPointerLock();
      V.F.pivot.copy(this.player.pos);
      if (was && V.panel0 !== undefined) V.panel = V.panel0;
    }
    this.updateVpad();
    this.mapvSyncUi();
  },
  // 鏡頭：自由／環繞／全圖都是繞著中心點（F）的球座標
  mapvCamera(dt) {
    const V = this.mapv,
      F = V.F,
      w = this.world,
      cam = this.camera;
    const k = this.keys;
    if (V.cam === 'free') {
      const sp = dt * Math.max(20 * DS, F.dist) * 0.9 * (k.ShiftLeft ? 2.5 : 1);
      const fx = -Math.sin(F.yaw),
        fz = -Math.cos(F.yaw);
      if (k.KeyW) F.pivot.x += fx * sp;
      if (k.KeyW) F.pivot.z += fz * sp;
      if (k.KeyS) F.pivot.x -= fx * sp;
      if (k.KeyS) F.pivot.z -= fz * sp;
      if (k.KeyA) F.pivot.x += fz * sp;
      if (k.KeyA) F.pivot.z -= fx * sp;
      if (k.KeyD) F.pivot.x -= fz * sp;
      if (k.KeyD) F.pivot.z += fx * sp;
      if (k.KeyQ) F.yaw += dt * 1.2;
      if (k.KeyE) F.yaw -= dt * 1.2;
    } else if (V.cam === 'orbit' || V.cam === 'cinema') F.yaw += dt * (V.cam === 'cinema' ? 0.22 : 0.15);
    if (V.cam === 'cinema') {
      V.cinT += dt;
      if (!V.tgt || V.cinT > CIN_T) this.mapvCycle(1);
    }
    // 有目標時中心點跟著它（自由鏡頭按 WASD 移動＝放掉目標）
    if (V.tgt && !V.tgt.dead) {
      if (V.cam === 'free' && (k.KeyW || k.KeyA || k.KeyS || k.KeyD)) this.mapvSetTgt(null);
      else if (V.cam !== 'top') {
        const c = V.tgt.center();
        F.pivot.x += (c.x - F.pivot.x) * Math.min(1, dt * 5);
        F.pivot.z += (c.z - F.pivot.z) * Math.min(1, dt * 5);
      }
    }
    const half = w.size * 0.75;
    F.pivot.x = clamp(F.pivot.x, -half, half);
    F.pivot.z = clamp(F.pivot.z, -half, half);
    // 中心點貼著地面（全圖不跟：保持整張地圖在畫面裡）
    const gy = V.tgt && !V.tgt.dead ? V.tgt.center().y : w.groundAt(F.pivot.x, F.pivot.z, 1e4) + 2 * DS;
    if (V.cam !== 'top') F.pivot.y += (gy - F.pivot.y) * Math.min(1, dt * 6);
    const cp = Math.cos(F.pitch);
    cam.position.set(
      F.pivot.x + Math.sin(F.yaw) * cp * F.dist,
      F.pivot.y + Math.sin(F.pitch) * F.dist,
      F.pivot.z + Math.cos(F.yaw) * cp * F.dist,
    );
    cam.position.y = Math.max(cam.position.y, w.terrainHeight(cam.position.x, cam.position.z) + 2);
    cam.lookAt(F.pivot);
    // 霧照鏡頭的距離往外推（render/style/pipeline.js 的 fogPush）：遠看也看得到整張地圖
    this.camExtra = Math.max(0, F.dist - 40 * DS);
    this.camTarget.copy(F.pivot);
    // 陰影跟著中心點；拉遠時陰影的範圍跟著放大
    this.sun.position.copy(F.pivot).add(this.sunOff);
    this.sun.target.position.copy(F.pivot);
    const sc = this.sun.shadow.camera,
      R = clamp(F.dist * 0.7, 70, 260 * DS);
    if (Math.abs(sc.right - R) > R * 0.15) {
      sc.left = sc.bottom = -R;
      sc.right = sc.top = R;
      sc.updateProjectionMatrix();
    }
    w.updateOcclusion(cam.position, F.pivot, dt);
    this.rangeRing.visible = false;
    this.camFocus = V.tgt && !V.tgt.dead ? V.tgt : null;
  },
  // ---------- 輸入 ----------
  // 指標（滑鼠與觸控都走 pointer events，掛在 canvas 上）：單指／左鍵旋轉、右鍵或雙指平移、滾輪或雙指縮放
  mapvPointer(type, e) {
    const V = this.mapv;
    if (!V || this.state !== 'play' || V.game) return false; // 遊戲的視角：照任務的輸入
    const F = V.F;
    if (type === 'wheel') {
      F.dist = clamp(
        F.dist * (e.deltaY > 0 ? 1.12 : 0.89),
        6 * DS,
        this.world ? this.world.size * 1.6 : 2000,
      );
      return true;
    }
    if (type === 'down') {
      // sx／sy：按下的位置；n：按下時已經有別的指標（雙指的一部分，放開不算點一下）
      V.ptrs.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        b: e.button,
        sx: e.clientX,
        sy: e.clientY,
        n: V.ptrs.size,
      });
      V.pinch = null;
      return true;
    }
    if (type === 'up') {
      const P0 = V.ptrs.get(e.pointerId);
      V.ptrs.delete(e.pointerId);
      V.pinch = null;
      // 點一下（沒有拖曳、不是雙指）：選取點到的敵人
      const tap = P0 && !P0.n && !V.ptrs.size && P0.b === 0;
      if (tap && Math.hypot(e.clientX - P0.sx, e.clientY - P0.sy) < TAP_PX)
        this.mapvPick(e.clientX, e.clientY);
      return true;
    }
    const P = V.ptrs.get(e.pointerId);
    if (!P) return false;
    const dx = e.clientX - P.x,
      dy = e.clientY - P.y;
    P.x = e.clientX;
    P.y = e.clientY;
    if (V.ptrs.size >= 2) {
      for (const q of V.ptrs.values()) q.n = 1; // 雙指之後放開不算點一下
      // 雙指：距離改變＝縮放，中點移動＝平移
      const [a, b] = [...V.ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y),
        mx = (a.x + b.x) / 2,
        my = (a.y + b.y) / 2;
      if (V.pinch) {
        if (d > 10) F.dist = clamp((F.dist * V.pinch.d) / d, 6 * DS, this.world.size * 1.6);
        this.mapvPan(mx - V.pinch.x, my - V.pinch.y);
      }
      V.pinch = { d, x: mx, y: my };
      return true;
    }
    if (P.b === 2 || V.cam === 'top') this.mapvPan(dx, dy);
    else {
      F.yaw -= dx * 0.006;
      F.pitch = clamp(F.pitch + dy * 0.005, 0.08, 1.5);
    }
    return true;
  },
  // 平移：畫面上的位移換成地面上的位移（依距離）
  mapvPan(dx, dy) {
    const F = this.mapv.F;
    const k = (F.dist * 1.6) / Math.max(400, innerHeight);
    const fx = -Math.sin(F.yaw),
      fz = -Math.cos(F.yaw);
    // 畫面右方＝(−fz, fx)：往右拖＝中心點往左；往下拖＝中心點往前
    F.pivot.x += (fz * dx + fx * dy) * k;
    F.pivot.z += (-fx * dx + fz * dy) * k;
  },
  mapvKey(e) {
    const V = this.mapv;
    if (!V) return false;
    if (e.target && e.target.closest && e.target.closest('#mvPanel input, #mvPanel select, #mvBar select'))
      return e.code !== 'Escape';
    if (e.code === 'Escape') return false; // 暫停選單（離開）
    if (e.code === 'KeyH') {
      this.mapvTogglePanel();
      return true;
    }
    if (V.game) return false; // 遊戲的視角：其他按鍵照任務
    if (e.code === 'KeyN') this.mapvCycle(1);
    else if (e.code === 'KeyB') this.mapvCycle(-1);
    else if (e.code === 'KeyP') this.mapvPause();
    else if (e.code === 'KeyG') this.mapvGenerate();
    else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
      V.p.seed = Math.max(1, V.p.seed + (e.code === 'BracketLeft' ? -1 : 1));
      this.mapvSyncUi();
      this.mapvQueue();
    }
    this.keys[e.code] = true;
    return true;
  },
  mapvPause() {
    const V = this.mapv;
    V.paused = !V.paused;
    this.mapvSyncUi();
  },
  mapvTogglePanel() {
    const V = this.mapv;
    V.panel = !V.panel;
    this.mapvSyncUi();
  },
  // ---------- 介面 ----------
  mapvBuildUi() {
    const V = this.mapv;
    const P = $('mvPanel'),
      B = $('mvBar'),
      S = $('mvStat');
    P.hidden = B.hidden = S.hidden = false;
    B.innerHTML = `
      <span class="mvseg" data-padtabs="button">${CAMS.map((c) => `<button data-cam="${c[0]}" title="${escHtml(c[2])}">${c[1]}</button>`).join('')}</span>
      <span class="mvseg"><button id="mvPauseBtn" title="暫停（P）">⏸</button><select id="mvSpeed" title="遊戲速度">${[
        [0.25, '0.25×'],
        [0.5, '0.5×'],
        [1, '1×'],
        [2, '2×'],
      ]
        .map((s) => opt(s[0], s[1], V.speed))
        .join('')}</select></span>
      <span class="mvseg"><button id="mvPrev" title="上一台（B）">◀</button><span id="mvTgtName" class="mvtgt">—</span><button id="mvNext" title="下一台（N）">▶</button><button id="mvGameBtn" title="操作一台無敵的玩家機體：俯視、追尾、第一人稱（V 切換）">操作</button></span>
      <span class="mvseg"><button id="mvRegen" title="同樣的參數重新產生（G）">重新產生</button><button id="mvShot" title="下載這一格的 PNG">截圖</button></span>
      <span class="mvseg"><button id="mvPanelBtn" title="收起／展開面板（H）">面板</button><button id="mvBack">返回</button></span>`;
    P.innerHTML = `
      <div class="mvhead"><b>地圖預覽</b><span id="mvName" class="dim"></span></div>
      <div class="mvtabs" data-padtabs="button"><button data-tab="map">地圖</button><button data-tab="foes">敵人</button><button data-tab="view">畫面</button></div>
      <div class="mvbody" id="mvBody"></div>`;
    S.innerHTML = `<div id="mvFps"></div><canvas id="mvSpark" width="200" height="40"></canvas><div id="mvNums"></div>`;
    for (const b of B.querySelectorAll('[data-cam]')) b.onclick = () => this.mapvSetCam(b.dataset.cam);
    $('mvPauseBtn').onclick = () => this.mapvPause();
    $('mvSpeed').onchange = (e) => (V.speed = Number(e.target.value) || 1);
    $('mvRegen').onclick = () => this.mapvGenerate();
    $('mvPrev').onclick = () => this.mapvCycle(-1);
    $('mvNext').onclick = () => this.mapvCycle(1);
    $('mvGameBtn').onclick = () => this.mapvSetGame(!V.game);
    $('mvShot').onclick = () => (V.shot = true);
    $('mvPanelBtn').onclick = () => this.mapvTogglePanel();
    $('mvBack').onclick = () => this.exitMapView();
    for (const b of P.querySelectorAll('[data-tab]'))
      b.onclick = () => {
        V.tab = b.dataset.tab;
        this.mapvRenderTab();
      };
    // 指標：只在畫面上（不是面板）時操作鏡頭
    if (!this.mapvPtrBound) {
      this.mapvPtrBound = true;
      const cv = this.canvas;
      cv.addEventListener('pointerdown', (e) => {
        if (!this.mapv || !this.mapvPointer('down', e)) return;
        try {
          cv.setPointerCapture(e.pointerId); // 拖出畫布外也收得到（合成的事件沒有作用中的指標，會丟例外）
        } catch (err) {}
      });
      cv.addEventListener('pointermove', (e) => this.mapv && this.mapvPointer('move', e));
      for (const ev of ['pointerup', 'pointercancel'])
        cv.addEventListener(ev, (e) => this.mapv && this.mapvPointer('up', e));
      cv.addEventListener('wheel', (e) => this.mapv && this.mapvPointer('wheel', e), { passive: true });
    }
    this.mapvRenderTab();
  },
  mapvRenderTab() {
    const V = this.mapv;
    const body = $('mvBody');
    for (const b of $('mvPanel').querySelectorAll('[data-tab]'))
      b.classList.toggle('on', b.dataset.tab === V.tab);
    if (V.tab === 'map') {
      body.innerHTML = this.mapvMapHtml();
      this.mapvBindTab();
    } else if (V.tab === 'foes') {
      body.innerHTML = this.mapvFoesHtml();
      this.mapvBindFoes();
    } else if (V.tab === 'view') {
      body.innerHTML = this.mapvViewHtml();
      this.mapvBindView();
    }
    this.mapvSyncUi();
  },
  mapvMapHtml() {
    const p = this.mapv.p;
    const themes = Object.keys(THEMES)
      .map((k) => opt(k, THEMES[k].name, p.theme))
      .join('');
    const vs = VARIANTS[p.theme] || {};
    const variants =
      opt('', '標準', p.variant) +
      Object.keys(vs)
        .filter((k) => !vs[k].border)
        .map((k) => opt(k, vs[k].name || k, p.variant))
        .join('');
    const lms = landmarkKeys(p.theme);
    const landmarks =
      opt('', '無', p.landmark) + lms.map((k) => opt(k, LANDMARKS[p.theme][k].name, p.landmark)).join('');
    return `
      <div class="mvrow"><span>主題</span><select data-p="theme">${themes}</select></div>
      <div class="mvrow"><span>變體</span><select data-p="variant">${variants}</select></div>
      <div class="mvrow"><span>地標</span><select data-p="landmark">${landmarks}</select></div>
      <div class="mvrow"><span>種子</span><span class="mvctl"><button data-seed="-1" title="上一個（[）">◀</button><input type="number" data-p="seed" min="1" step="1" value="${p.seed}" /><button data-seed="1" title="下一個（]）">▶</button><button data-seed="r" title="隨機">亂數</button></span></div>
      <div class="mvrow"><span>時間</span><select data-p="tod">${TODS.map((t) => opt(t[0], t[1], p.tod)).join('')}</select></div>
      <div class="mvrow"><span>天候</span><select data-p="weather">${WEATHERS.map((t) => opt(t[0], t[1], p.weather)).join('')}</select></div>
      <div class="mvrow"><span>大小</span><select data-p="size">${SIZES.map((t) => opt(t[0], t[1], p.size)).join('')}</select></div>
      <div class="mvnote" id="mvInfo"></div>`;
  },
  mapvBindTab() {
    const V = this.mapv;
    const body = $('mvBody');
    for (const el of body.querySelectorAll('[data-p]')) {
      el.onchange = () => {
        const k = el.dataset.p;
        let v = el.value;
        if (k === 'seed') v = Math.max(1, Math.floor(Number(v) || 1));
        V.p[k] = v;
        if (k === 'theme') {
          V.p.variant = '';
          V.p.landmark = '';
          this.mapvRenderTab();
        }
        this.mapvQueue();
      };
    }
    for (const b of body.querySelectorAll('[data-seed]'))
      b.onclick = () => {
        const s = b.dataset.seed;
        V.p.seed = s === 'r' ? rndSeed() : Math.max(1, V.p.seed + Number(s));
        const inp = body.querySelector('[data-p="seed"]');
        if (inp) inp.value = V.p.seed;
        this.mapvQueue();
      };
  },
  mapvSyncUi() {
    const V = this.mapv;
    if (!V) return;
    for (const b of $('mvBar').querySelectorAll('[data-cam]'))
      b.classList.toggle('on', b.dataset.cam === V.cam);
    $('mvPauseBtn').textContent = V.paused ? '▶' : '⏸';
    $('mvGameBtn').classList.toggle('on', V.game);
    for (const b of $('mvBar').querySelectorAll('[data-cam]')) b.disabled = V.game;
    $('mvPanelBtn').classList.toggle('on', V.panel);
    $('mvPanel').classList.toggle('mini', !V.panel);
    document.body.classList.toggle('mvMini', !V.panel);
    const inp = document.querySelector('#mvBody [data-p="seed"]');
    if (inp && document.activeElement !== inp) inp.value = V.p.seed;
    const w = this.world;
    $('mvName').textContent = w ? ' ' + this.levelName.replace('地圖預覽・', '') : '';
    const info = $('mvInfo');
    if (info && w) {
      const f = w.featureNames && w.featureNames.length ? w.featureNames.join('、') : '無';
      info.innerHTML =
        `地圖 ${Math.round(w.size)} m・作戰區域 ${Math.round(w.zone[1] - w.zone[0])}×${Math.round(w.zone[3] - w.zone[2])} m<br>` +
        `地形特徵：${escHtml(f)}<br>障礙物 ${w.obstacles.length}・可破壞物件 ${(w.props || []).length}` +
        (w.landmark ? `<br>地標：${escHtml(w.landmark.name)}` : '');
    }
  },
  // ---------- 效能 ----------
  // 每格記：兩格的間隔（實際的幀時間）、這一格 mapvTick 的 CPU 時間；每 0.5 秒更新一次數字與走勢圖
  mapvStats(t0) {
    const V = this.mapv,
      S = V.st;
    const now = performance.now();
    const ft = S.last ? now - S.last : 16.7;
    S.last = now;
    const cpu = now - t0;
    S.frames++;
    S.t += ft;
    S.cpu += cpu;
    S.cpuMax = Math.max(S.cpuMax, cpu);
    S.dtMax = Math.max(S.dtMax, ft);
    S.spark[S.sparkI] = ft;
    S.sparkI = (S.sparkI + 1) % SPARK_N;
    if (V.shot) {
      V.shot = false;
      this.canvas.toBlob((b) => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'mech-cordon-map-' + V.p.theme + '-' + V.p.seed + '.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      });
    }
    if (S.t < 500) return;
    const fps = (S.frames * 1000) / S.t;
    const R = this.renderer.info;
    const mem = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) + ' MB' : '—';
    const ents = this.enemies.length + this.allies.length + (this.players ? this.players.length : 0);
    const fpsEl = $('mvFps');
    fpsEl.textContent = `${Math.round(fps)} FPS`;
    fpsEl.className = fps >= 55 ? 'ok' : fps >= 30 ? 'mid' : 'bad';
    $('mvNums').innerHTML = [
      ['每格', `${(S.t / S.frames).toFixed(1)} ms（最差 ${S.dtMax.toFixed(0)}）`],
      ['CPU', `${(S.cpu / S.frames).toFixed(1)} ms（最差 ${S.cpuMax.toFixed(0)}）`],
      ['繪製', R.render.calls],
      ['三角形', `${(R.render.triangles / 1000).toFixed(0)}k`],
      ['著色器', R.programs ? R.programs.length : '—'],
      ['幾何／貼圖', `${R.memory.geometries}／${R.memory.textures}`],
      ['記憶體', mem],
      ['實體', ents],
      ['粒子', this.fx && this.fx.busyN ? Math.round(this.fx.busyN()) : '—'],
      ['解析度', `${Math.round(this.renderer.getPixelRatio() * 100)}%`],
    ]
      .map(([k, v]) => `<span>${k}</span><b>${v}</b>`)
      .join('');
    this.mapvSpark();
    S.frames = 0;
    S.t = 0;
    S.cpu = 0;
    S.cpuMax = 0;
    S.dtMax = 0;
  },
  // 走勢圖：最近 SPARK_N 格的幀時間（綠＝60 FPS 以內、黃＝30、紅＝更慢）
  mapvSpark() {
    const S = this.mapv.st,
      cv = $('mvSpark');
    const c = cv.getContext('2d'),
      W = cv.width,
      H = cv.height;
    c.clearRect(0, 0, W, H);
    const top = 50; // ms
    c.strokeStyle = 'rgba(255,255,255,0.18)';
    for (const ms of [16.7, 33.3]) {
      const y = H - (ms / top) * H;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(W, y);
      c.stroke();
    }
    const n = S.spark.length;
    for (let i = 0; i < n; i++) {
      const v = S.spark[(S.sparkI + i) % n];
      if (v === undefined) continue;
      const x = (i / SPARK_N) * W,
        h = Math.min(H, (v / top) * H);
      c.fillStyle = v <= 18 ? '#5fd38a' : v <= 34 ? '#e8c050' : '#ff5a5a';
      c.fillRect(x, H - h, Math.max(1, W / SPARK_N), h);
    }
  },
});
