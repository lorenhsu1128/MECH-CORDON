// Game：空域的空戰（docs/air-combat-design.md）。自由出擊選「空域」（world/themes/airspace.js，只有單人）時：
//   進場（airBegin）＝玩家機體進入飛行狀態（entities/mech-air.js）、固定追尾視角、鏡頭看得遠；
//   鏡頭 airCamera（追尾視角的空中版：可以往上下看到底、跟著速度拉開、橫滾時鏡頭微微傾斜）、準星 airReticle；
//   輸入 airInput（W／S＝推力、A／D＝橫移、滑鼠＝方向；手把與觸控照同一套：左搖桿＝推力與橫移、右搖桿／拖曳＝方向）；
//   飛行的 HUD（速度、高度、機首標記、俯仰刻度、低空警告）；第 1 期的敵人：空中的無人機、直升機、蜂群（airSpawn）。
import { clamp, lerp, makeRng, rnd } from '../core/math.js';
import { GpuFx } from '../fx/gpu.js';
import { FXG, pickCell } from '../fx/atlas.js';
import { DS } from '../core/scale.js';
import { AIR } from '../data/air.js';
import { BOSS_DEFS, ENEMY_TYPES } from '../data/enemies.js';
import { FOES } from '../data/foes.js';
import { SFX } from '../audio/audio.js';
import { Game } from './game.js';

const CAM_FAR = 3600, // 空域的鏡頭可視距離（m）
  START_ALT = 320, // 進場的高度
  PITCH_LIM = 1.4;
// 雲：兩層（中層 380～560 m、高層 760～940 m），依地圖種子固定擺放
const CLOUD_LAYERS = [
  [380, 560, 34],
  [760, 940, 22],
];
const _v = new THREE.Vector3(),
  _d = new THREE.Vector3(),
  _p = new THREE.Vector3();

Object.assign(Game.prototype, {
  // 現在是空域的飛行
  airOn() {
    return !!(this.airMode && this.player && this.player.air);
  },
  // 鏡頭的俯仰範圍（chase.js 的 camTurn／camAimInput）
  airPitchLim() {
    return this.airMode ? PITCH_LIM : 0;
  },
  // 進場：玩家機體進入飛行狀態、固定追尾視角
  airBegin() {
    const p = this.player;
    this.airMode = true;
    p.airInit(START_ALT);
    p.aamInit(AIR.AAM_N); // 內建的空戰標準導彈（不佔武器槽）
    this.airMsl = [];
    this.airStats = { kills: 0, aces: 0, ground: 0, chain: 0 };
    this.airBase = null;
    this.airBomberTold = false;
    this.camera.far = CAM_FAR;
    this.camera.updateProjectionMatrix();
    document.body.classList.add('airMode');
    this.airCloudsInit(this.worldSeed || 1);
    this.airStickG = false;
  },
  // 離開空域（clearMission）
  airEnd() {
    if (!this.airMode) return;
    this.airMode = false;
    this.camera.far = 400 * DS;
    this.camera.updateProjectionMatrix();
    document.body.classList.remove('airMode');
    if (this.airCloud) this.airCloud.clear();
    this.airBanks = [];
    this.airMsl = [];
    this.airStickG = false;
  },
  // 右搖桿（手把、觸控）在空域直接控制機首（2026-10-31 使用者定案）：推的方向與幅度＝機首轉向的速度，
  // 推過 AIR.STICK_G（90%）＝急轉彎（airStickG，updatePlayer 當成按住急轉；觸控沒有急轉鍵）；
  // 鏡頭只比機首超前 AIR.CAM_LEAD，所以畫面不會先轉過去、機體慢慢追
  airStickTurn(p, x, z, dt) {
    const m = Math.min(1, Math.hypot(x, z));
    if (m < 0.05) return;
    const G = m >= AIR.STICK_G;
    this.airStickG = G;
    const k = G ? 1 : Math.pow(m / AIR.STICK_G, 1.4);
    const rate = (p.airRate || AIR.TURN) * (G ? AIR.GTURN : 1) * k * dt;
    const inv = this.ctrl.invY ? -1 : 1;
    this.fpYaw -= (x / m) * rate;
    this.fpPitch = clamp(this.fpPitch - (z / m) * rate * inv, -PITCH_LIM, PITCH_LIM);
    if (p.airRev) return; // 後空翻中：鏡頭跟著轉 180°，不限制
    const dy = ((((this.fpYaw - p.yaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    const L = AIR.CAM_LEAD;
    if (Math.abs(dy) > L) this.fpYaw = p.yaw + Math.sign(dy) * L;
    this.fpPitch = clamp(this.fpPitch, (p.airPit || 0) - L, (p.airPit || 0) + L);
  },
  // 每格的輸入（updatePlayer 在轉成世界方向之前呼叫）：推力與橫移照按鍵本身，方向＝鏡頭
  airInput(p, wish) {
    p.airIn = { thr: clamp(-wish.z, -1, 1), side: clamp(wish.x, -1, 1) };
    p.airAim = this.fpLookDir(this.fpYaw, this.fpPitch);
    p.fpFace = true;
  },
  // 後空翻：鏡頭跟著轉 180°（機首跟著鏡頭的方向，不轉的話翻完又轉回去）
  airRevCam() {
    this.fpYaw += Math.PI;
    this.fpPitch = clamp(-this.fpPitch * 0.5, -PITCH_LIM, PITCH_LIM);
  },
  // 準星所指的點：沿畫面中央往前，碰到地形或海面就停，最遠 2 km
  airReticle() {
    const o = this.camera.position;
    this.camera.getWorldDirection(_d);
    const p = this.player;
    for (let s = 40; s <= 2000; s += 20) {
      _v.copy(o).addScaledVector(_d, s);
      if (p && _v.y < p.airFloor(_v.x, _v.z)) return _v.clone();
    }
    return o.clone().addScaledVector(_d, 2000);
  },
  // 鏡頭：機體後方、沿鏡頭方向；速度越快拉得越開、視角越寬；橫滾時微微傾斜
  airCamera(ent, dt, yaw, pitch) {
    const h = (ent.model && ent.model.height) || 9.7;
    const look = this.fpLookDir(yaw, pitch);
    const v = ent.airV || 0;
    const fk = clamp((v - AIR.CRUISE) / (AIR.AB - AIR.CRUISE), -1, 1);
    const L = this.chLag || (this.chLag = { r: 0, u: 0, f: 0 });
    // 速度的落後：鏡頭比機體慢一點跟上（往前衝時機體往前拉開）
    _d.copy(ent.vel).multiplyScalar(0.06);
    L.r = lerp(L.r, _d.x, Math.min(1, dt * 3));
    L.u = lerp(L.u, _d.y, Math.min(1, dt * 3));
    L.f = lerp(L.f, _d.z, Math.min(1, dt * 3));
    const dist = h * (3.1 + 0.7 * Math.max(0, fk)) * (this.ctrl.chaseDist || 1) * (this.chaseUser || 1);
    const pivot = ent.center().add(_p.set(0, h * 0.35, 0));
    const pos = pivot
      .clone()
      .addScaledVector(look, -dist)
      .sub(_v.set(L.r, L.u, L.f))
      .add(_p.set(0, h * 0.25, 0));
    const fl = ent.airFloor ? ent.airFloor(pos.x, pos.z) + 3 : -1e9;
    if (pos.y < fl) pos.y = fl;
    if (this.camShake > 0) {
      this.camShake -= dt;
      const a = Math.min(1, this.camShake * 4) * 1.5;
      pos.x += rnd(-0.4, 0.4) * a;
      pos.y += rnd(-0.25, 0.25) * a;
      pos.z += rnd(-0.4, 0.4) * a;
    }
    this.camKickTick(pos, dt, 1.5);
    const fov = this.chaseFov() + Math.max(0, fk) * 10 + (ent.qbT > 0 ? 3 : 0);
    this.chFov = lerp(this.chFov || fov, fov, Math.min(1, dt * 4));
    if (Math.abs(this.camera.fov - this.chFov) > 0.05) {
      this.camera.fov = this.chFov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.copy(pos);
    // 橫滾：鏡頭的上方跟著機體的橫滾傾斜一點（只有 15%）
    const roll = (ent.airRoll || 0) * 0.15 * (ent.airTilt || 0);
    _v.set(0, 1, 0).applyAxisAngle(look, -roll);
    this.camera.up.copy(_v);
    this.camera.lookAt(pos.clone().add(look));
    this.camera.up.set(0, 1, 0);
    this.camera.updateMatrixWorld();
    this.chDist = dist;
    this.camTarget.copy(ent.pos);
    this.camExtra = 0;
    // 陰影跟著機體
    const sc = ent.pos.clone().addScaledVector(look, 60);
    this.sun.position.copy(sc).add(this.sunOff);
    this.sun.target.position.copy(sc);
    this.rangeRing.visible = false;
  },
  // ---------- 編成、增援、友軍目標（第 3 期） ----------
  // 編成：等級決定點數；無人機 1、直升機 2、自殺無人機（3 台一組）2、轟炸機 3（等級 2 起）；敵對 AC 排在最後一波
  airComp(L) {
    const opts = [
      ['drone', 1],
      ['drone', 1],
      ['heli', 2],
      ['swarm', 2],
    ];
    if (L >= 2) opts.push(['bomber', 3]);
    const out = [];
    let pts = 6 + L * 1.6;
    while (pts > 0 && out.length < 22) {
      const [t, c] = opts[Math.floor(Math.random() * opts.length)];
      out.push(t);
      pts -= c;
    }
    if (L >= 2 && !out.includes('bomber')) out[0] = 'bomber';
    if (!out.includes('drone')) out.push('drone');
    const nAce = L >= 2 ? Math.min(3, 1 + Math.floor((L - 2) / 4)) : 0;
    for (let i = 0; i < nAce; i++) out.push('ac');
    return out;
  },
  // 生成（startMission）：友軍雷達站、島上的防空砲、第一波在附近，其他波從遠方飛來（waves.js 的 waveTick → airWaveLaunch）
  airSpawn(L, scaleHp, scaleDmg) {
    this.scaleHp = scaleHp;
    this.scaleDmg = scaleDmg;
    this.airBasePlan();
    this.airFlakPlan(L);
    const comp = this.airComp(L);
    const aces = comp.filter((t) => t === 'ac'),
      body = comp.filter((t) => t !== 'ac');
    const n = clamp(Math.round(body.length / 4), 2, 4);
    const waves = Array.from({ length: n }, () => []);
    body.forEach((t, i) => waves[i % n].push(t));
    waves[n - 1].push(...aces);
    // 第一波一定有轟炸機（友軍雷達站從一開始就有威脅）與無人機
    for (const t of ['bomber', 'drone']) {
      if (waves[0].includes(t)) continue;
      const w = waves.find((x) => x.includes(t));
      if (w) waves[0].push(...w.splice(w.indexOf(t), 1));
    }
    const first = waves.shift();
    this.waves = waves.filter((w) => w.length);
    this.waveN = this.waves.length + 1;
    this.waveI = 1;
    this.waveSize = Math.max(1, Math.ceil(body.length / n));
    this.waveGap = 2.5;
    this.wavePend = null;
    for (const t of first) this.airSpawnOne(t, this.airRing(500, 1100));
  },
  // 玩家周圍 r0～r1 公尺、離地 120 m 以上的一點（空域裡面）
  airRing(r0, r1, c) {
    const P = this.player,
      o = c || P.pos,
      lim = this.world.lim * 0.9;
    const a = rnd(0, Math.PI * 2),
      r = rnd(r0, r1);
    const x = clamp(o.x + Math.cos(a) * r, -lim, lim),
      z = clamp(o.z + Math.sin(a) * r, -lim, lim);
    return new THREE.Vector3(x, Math.max(rnd(250, 520), P.airFloor(x, z) + 120), z);
  },
  // 生成一台（或一組）：位置 at；空域的處理在 spawnEnemy 的 airAdopt
  airSpawnOne(t, at) {
    if (t === 'bomber') return this.spawnType('dropship', this.scaleHp, this.scaleDmg, at, 1);
    if (t === 'swarm') return this.spawnType('swarm', this.scaleHp, this.scaleDmg, at, 3);
    return this.spawnType(t, this.scaleHp, this.scaleDmg, at, 1);
  },
  // spawnType 在空域裡：地面的敵人換成無人機（Boss 換型態的增援等）
  airType(t) {
    const d = ENEMY_TYPES[t] || FOES[t];
    return !d || d.flying || d.roster || t === 'ac' || t === 'flak' ? t : 'drone';
  },
  // spawnEnemy 的最後（空域）：飛行的敵人進入飛行狀態、分配角色
  airAdopt(e, o) {
    if (
      e.team !== 'enemy' ||
      e.isBoss ||
      o.isBoss ||
      e.ai === 'part' ||
      e.ai === 'objective' ||
      e.ai === 'flak'
    )
      return;
    const ace = e.ai === 'ac' || !!o.ace;
    if (!o.flying && !ace) return;
    const at = o.at || e.pos;
    const alt = Math.max(at.y > 100 ? at.y : rnd(250, 500), this.player.airFloor(e.pos.x, e.pos.z) + 120);
    if (e.ai === 'heli') {
      e.airAlt = alt; // 直升機：照原本的定點懸停（慢）
      e.pos.y = alt;
      return;
    }
    const base = this.airBase && !this.airBase.dead;
    const role = ace
      ? 'ace'
      : e.ai === 'swarm' || e.ai === 'kamikaze'
        ? 'kami'
        : e.ai === 'dropship' && base
          ? 'bomber'
          : 'drone';
    e.airFoeInit(role, alt, this.player.pos);
    if (role === 'bomber') {
      e.name = '轟炸機';
      e.opts.cargo = null;
      if (!this.airBomberTold) {
        this.airBomberTold = true;
        this.flashAlert('轟炸機正飛向友軍雷達站 — 優先擊落！');
      }
    }
  },
  // 友軍雷達站：玩家起點附近的島上（找不到島時在海面上）；被摧毀＝任務失敗
  airBasePlan() {
    const W = this.world,
      pl = this.player.pos;
    let at = null;
    for (let k = 0; k < 200 && !at; k++) {
      const a = rnd(0, Math.PI * 2),
        r = rnd(300, 900);
      const x = pl.x + Math.cos(a) * r,
        z = pl.z + Math.sin(a) * r;
      const h = W.terrainHeight(x, z);
      if (h > 15 && h < 220) at = new THREE.Vector3(x, h, z);
    }
    if (!at) at = new THREE.Vector3(pl.x + 400, 0, pl.z);
    const b = this.campObjective(at, 'ally');
    b.name = '友軍雷達站';
    this.airBase = b;
  },
  // 島上的防空砲：離玩家 600～2200 m、海拔 30 m 以上（找不到時放寬到 3.2 km、15 m）
  airFlakPlan(L) {
    const nFlak = clamp(2 + Math.floor(L / 3), 2, 5);
    const W = this.world,
      pl = this.player.pos;
    let put = 0;
    for (let k = 0; k < 600 && put < nFlak; k++) {
      const a = rnd(0, Math.PI * 2),
        r = rnd(600, k < 300 ? 2200 : 3200); // 附近沒有島時再往外找
      const x = pl.x + Math.cos(a) * r,
        z = pl.z + Math.sin(a) * r;
      if (Math.abs(x) > W.lim * 0.9 || Math.abs(z) > W.lim * 0.9) continue;
      const h = W.terrainHeight(x, z);
      if (h < (k < 300 ? 30 : 15)) continue;
      if (this.spawnType('flak', this.scaleHp, this.scaleDmg, new THREE.Vector3(x, h, z), 1)) put++;
    }
  },
  // 增援（waves.js 的 waveLaunch）：從 1.8～2.4 km 外的空中飛來，ECHO 預告方向
  airWaveLaunch() {
    const list = this.waves.shift();
    this.waveI++;
    this.waveGap = 2.5;
    const pos = this.airRing(1800, 2400);
    this.wavePend = { t: 3, pos, list, drop: false, air: true };
    const ev = {
      t: 'wave',
      p: [+pos.x.toFixed(1), +pos.z.toFixed(1)],
      y: Math.round(pos.y),
      n: list.reduce((a, t) => a + (t === 'swarm' ? 3 : 1), 0),
      d: 0,
      a: list.includes('ac') ? 1 : 0,
      i: this.waveI,
      N: this.waveN,
    };
    this.waveShow(ev);
    if (list.includes('bomber') && this.airBase && !this.airBase.dead)
      this.commSay('echo', '轟炸機編隊在裡面，目標是我們的雷達站。先打轟炸機！');
  },
  airWaveSpawn(w) {
    for (const t of w.list)
      this.airSpawnOne(t, w.pos.clone().add(_p.set(rnd(-80, 80), rnd(-30, 30), rnd(-80, 80))));
  },
  // ---------- 空中的 Boss：只排空中要塞 ----------
  airBossDef() {
    return BOSS_DEFS.find((b) => b.kind === 'fortress');
  },
  // spawnBossDef 之後：要塞移到玩家前方 1.5 km、高度 450 m 以上（部位跟著平移）
  airBossSetup() {
    const b = (this.bosses || []).find((x) => !x.dead && x.ai !== 'part');
    if (!b) return;
    const p = this.player;
    const f = p.airDirNow().setY(0).normalize();
    const to = p.pos.clone().addScaledVector(f, 1500);
    to.y = Math.max(450, p.airFloor(to.x, to.z) + 250);
    const dv = to.clone().sub(b.pos);
    for (const e of this.enemies)
      if (e === b || (e.opts && e.opts.parent === b.id)) {
        e.pos.add(dv);
        e.mesh.position.copy(e.pos);
      }
    b.airAlt = to.y;
    this.airFlakPlan(this.save.level);
    this.airBossT = 0;
  },
  // ---------- 殘骸連鎖、擊墜數 ----------
  // onEnemyKilled（空域）：被擊破的機體的殘骸打中附近的敵人（大型目標的範圍大），連鎖下去
  airKilled(e, from) {
    const S = this.airStats || (this.airStats = { kills: 0, aces: 0, ground: 0, chain: 0 });
    if (e.ai === 'flak' || (!e.air && !e.opts.flying && !e.isBoss)) S.ground++;
    else S.kills++;
    if (e.airRole === 'ace') S.aces++;
    if (this.isClient) return;
    const big = e.isBoss || e.airRole === 'bomber';
    const R = e.isBoss ? 180 : big ? 90 : 60;
    const dmg = Math.min(e.maxHp * 0.6, big ? 4000 : 2200);
    const c = e.center();
    let hit = 0;
    for (const o of this.enemies) {
      if (o.dead || o === e || o.isBoss || o.ai === 'part' || o.ai === 'flak') continue;
      const d = o.center().distanceTo(c);
      if (d > R) continue;
      hit++;
      this.fx.warnLine(c, o.center(), 0.35, 0xffa040, 0.6);
      o.takeDamage(
        dmg * (1 - (d / R) * 0.5),
        250,
        from || null,
        o.center(),
        o.center().sub(c).normalize(),
        null,
        null,
        'exp',
      );
    }
    if (hit) {
      S.chain += hit;
      this.flashMsg(`殘骸連鎖 ×${hit}`, 0xffc040, 1.2);
    }
  },
  // 結果畫面的列（endMission）
  airResultRows() {
    const S = this.airStats;
    if (!S) return [];
    const rows = [['擊墜數', `${S.kills}（敵對 AC ${S.aces}）`]];
    if (S.ground) rows.push(['地面目標', String(S.ground)]);
    if (S.chain) rows.push(['殘骸連鎖', `${S.chain} 次`]);
    if (this.airBase)
      rows.push([
        '友軍雷達站',
        this.airBase.dead ? '被摧毀' : `AP ${Math.round((this.airBase.hp / this.airBase.maxHp) * 100)}%`,
      ]);
    return rows;
  },
  // 過關條件（goals.js）
  airGoal(down) {
    if (!this.airStats) return null;
    const lose = [down];
    if (this.airBase) lose.push('友軍雷達站被摧毀');
    const n = (this.bosses || []).filter((b) => !b.dead && b.ai !== 'part').map((b) => b.name);
    return {
      sub: this.levelName,
      win: [this.isBossLevel ? `擊破 ${n.join('、') || '空中要塞'}` : '擊墜所有敵機（增援從遠方飛來）'],
      lose,
      opt: this.airBase ? '轟炸機會飛向友軍雷達站，優先擊落' : '',
    };
  },
  // ---------- 內建的空戰導彈、導彈警報（updatePlayer 每格） ----------
  airPlayerTick(p, dt) {
    // 友軍雷達站被摧毀＝任務失敗
    if (this.airBase && this.airBase.dead && this.state === 'play') {
      this.state = 'ending';
      this.flashMsg('友軍雷達站被摧毀', 0xff4d4d, 2.4, { k: 'warn', m: '任務失敗', s: '友軍雷達站被摧毀' });
      setTimeout(() => this.state === 'ending' && this.endMission(false, false), 1800);
      return;
    }
    if (!p.aam) return;
    p.aamTick(dt);
    const held = this.act('aam');
    const ok = p.aamCan(p.lock);
    // 按下＝發射一枚；按住時鎖定中、軌道裝填好就繼續發射
    if (held && (!this.aamHeld || ok) && p.aamLaunch(p.lock)) this.playerFiredAt = 0.3;
    else if (held && !this.aamHeld && p.aam.n <= 0) this.flashMsg('空戰導彈用完了', 0xff8a8a, 1);
    this.aamHeld = held;
    if (ok && !this.aamLockWas) SFX.tone(1760, 1760, 0.07, 0.16, 'square', 'ui'); // 鎖定音
    this.aamLockWas = ok;
    // 追著自己的導彈：警報（越近嗶得越快）
    const inc = [];
    let tMin = 9;
    for (const pr of this.projectiles) {
      if (pr.dead || pr.kind !== 'missile' || pr.target !== p || !pr.owner || pr.owner.team === p.team)
        continue;
      inc.push(pr);
      tMin = Math.min(tMin, pr.pos.distanceTo(p.center()) / Math.max(1, pr.vel.length()));
    }
    this.airMsl = inc;
    if (inc.length) {
      this.airMslT = (this.airMslT || 0) - dt;
      if (this.airMslT <= 0) {
        this.airMslT = clamp(tMin * 0.22, 0.07, 0.45);
        SFX.tone(1180, 1180, 0.05, 0.2, 'square', 'ui');
      }
    } else this.airMslT = 0;
  },
  // 雲團：每團是十幾顆很大的煙霧粒子（顯示卡粒子、一般混合、壽命很長＝一直留著）；上面亮、底下偏灰
  airCloudsInit(seed) {
    if (!this.airCloud) this.airCloud = new GpuFx(this.scene, { add: false, cap: 4096, order: 1 });
    const C = this.airCloud;
    C.clear();
    this.airCloudT = 0;
    const r = makeRng(seed * 71 + 5),
      R = (a, b) => a + (b - a) * r();
    const lim = this.world.lim;
    this.airBanks = [];
    const top = new THREE.Color(0xffffff),
      low = new THREE.Color(0xaeb9c8);
    for (const [y0, y1, n] of CLOUD_LAYERS)
      for (let i = 0; i < n; i++) {
        const b = { x: R(-lim, lim), z: R(-lim, lim), y: R(y0, y1), r: R(120, 280), h: R(35, 70) };
        this.airBanks.push(b);
        const m = Math.round(b.r / 9);
        for (let k = 0; k < m; k++) {
          const a = r() * Math.PI * 2,
            d = Math.sqrt(r()) * b.r * 0.8,
            dy = (r() * 2 - 1) * b.h * 0.5;
          const s = R(130, 230) * (1 - (d / b.r) * 0.35);
          const c = low.clone().lerp(top, clamp(0.5 + dy / b.h, 0, 1));
          C.emit({
            p: _p.set(b.x + Math.cos(a) * d, b.y + dy, b.z + Math.sin(a) * d),
            life: 1e6,
            s0: s,
            c0: c.getHex(),
            a: 0.8,
            occ: 1,
            cell: pickCell(FXG.smoke),
            fade: 5,
            rot: r() * 6.28,
          });
        }
      }
  },
  // 每格（water.js 的 waterTick）：雲的時鐘
  airCloudTick(dt) {
    if (!this.airCloud || !this.airMode) return;
    this.airCloudT += dt;
    this.airCloud.update(this.airCloudT, dt);
  },
  // 在不在雲裡（第 3 期：雲裡不能鎖定）
  airInCloud(pos) {
    for (const b of this.airBanks || []) {
      const dx = (pos.x - b.x) / b.r,
        dz = (pos.z - b.z) / b.r,
        dy = (pos.y - b.y) / b.h;
      if (dx * dx + dz * dz + dy * dy < 1) return true;
    }
    return false;
  },
  // ---------- HUD ----------
  // 友軍雷達站：上方的 AP 條（轟炸機在場時閃爍）、畫面上的位置標記
  drawAirBase(c, W, H, p, S) {
    const B = this.airBase;
    if (!B) return;
    const k = B.dead ? 0 : B.hp / B.maxHp;
    const bomb = this.enemies.some((e) => !e.dead && e.airRole === 'bomber');
    const x = W / 2 - 110 * S,
      y = H * 0.085;
    c.save();
    c.textAlign = 'left';
    c.font = `${Math.round(12 * S)}px "Share Tech Mono", monospace`;
    const blink = bomb && Math.floor((this.time || 0) * 4) % 2 === 0;
    c.fillStyle = blink ? 'rgba(255,90,70,0.95)' : 'rgba(140,220,255,0.9)';
    c.fillText(bomb ? '友軍雷達站 — 轟炸機接近！' : '友軍雷達站', x, y - 6 * S);
    c.strokeStyle = 'rgba(140,220,255,0.7)';
    c.strokeRect(x, y, 220 * S, 6 * S);
    c.fillStyle = k > 0.35 ? 'rgba(140,220,255,0.9)' : 'rgba(255,90,70,0.95)';
    c.fillRect(x, y, 220 * S * k, 6 * S);
    if (!B.dead) {
      const q = this.proj(B.center());
      if (q.in && q.x > 0 && q.x < W && q.y > 0 && q.y < H) {
        c.strokeStyle = 'rgba(140,220,255,0.9)';
        c.beginPath();
        c.moveTo(q.x, q.y - 12 * S);
        c.lineTo(q.x + 10 * S, q.y);
        c.lineTo(q.x, q.y + 12 * S);
        c.lineTo(q.x - 10 * S, q.y);
        c.closePath();
        c.stroke();
        c.fillStyle = 'rgba(140,220,255,0.9)';
        c.textAlign = 'center';
        c.fillText(`雷達站 ${Math.round(B.center().distanceTo(p.center()))}`, q.x, q.y + 26 * S);
      }
    }
    c.restore();
  },
  // 空戰導彈的彈數與兩條軌、鎖定的標記、追著自己的導彈（警報與方向）
  drawAirMsl(c, W, H, p, S) {
    const A = p.aam;
    const red = 'rgba(255,80,70,0.95)',
      col = 'rgba(120,255,190,0.9)';
    if (A) {
      const x = W * 0.5 + 380 * S,
        y = H * 0.5 + 62 * S;
      c.textAlign = 'center';
      c.fillStyle = A.n > 0 ? col : red;
      c.fillText(`MSL ${A.n}`, x, y);
      for (let i = 0; i < 2; i++) {
        const k = 1 - A.rail[i] / AIR.AAM_RAIL;
        const bx = x - 40 * S + i * 44 * S,
          by = y + 14 * S;
        c.strokeStyle = col;
        c.strokeRect(bx, by, 36 * S, 6 * S);
        c.fillStyle = k >= 1 ? col : 'rgba(120,255,190,0.4)';
        c.fillRect(bx, by, 36 * S * clamp(k, 0, 1), 6 * S);
      }
      // 鎖定的目標：鎖得到（機首前方、射程內）＝紅色方框＋LOCK，不然是綠色的虛線方框
      const t = p.lock;
      if (t && !t.dead) {
        const q = this.proj(t.center());
        if (q.in) {
          const ok = p.aamCan(t),
            r = 22 * S;
          c.save();
          c.strokeStyle = ok ? red : col;
          c.lineWidth = Math.max(1, (ok ? 2.4 : 1.4) * S);
          if (!ok) c.setLineDash([5 * S, 4 * S]);
          c.strokeRect(q.x - r, q.y - r, r * 2, r * 2);
          c.restore();
          c.fillStyle = ok ? red : col;
          c.textAlign = 'center';
          const dm = Math.round(t.center().distanceTo(p.center()));
          c.fillText(ok ? `LOCK ${dm}` : String(dm), q.x, q.y + r + 16 * S);
        }
      }
    }
    // 導彈警報：畫面上方閃爍，各枚導彈在畫面上的位置（畫面外的畫在邊緣的箭頭）
    const inc = this.airMsl || [];
    if (!inc.length) return;
    c.save();
    if (Math.floor((this.time || 0) * 5.5) % 2 === 0) {
      c.fillStyle = red;
      c.textAlign = 'center';
      c.font = `bold ${Math.round(24 * S)}px "Share Tech Mono", monospace`;
      c.fillText('MISSILE', W / 2, H * 0.16);
    }
    c.fillStyle = red;
    c.strokeStyle = red;
    c.lineWidth = Math.max(1, 2 * S);
    const inv = this.camera.matrixWorldInverse;
    for (const pr of inc) {
      const v = _v.copy(pr.pos).applyMatrix4(inv); // 鏡頭座標：x 右、y 上、-z 前
      const q = this.proj(pr.pos);
      const on = v.z < 0 && q.x > 0 && q.x < W && q.y > 0 && q.y < H;
      if (on) {
        c.beginPath();
        c.arc(q.x, q.y, 10 * S, 0, Math.PI * 2);
        c.stroke();
        continue;
      }
      let dx = v.x,
        dy = -v.y;
      if (Math.hypot(dx, dy) < 1e-3) dy = 1; // 正後方：畫在下緣
      const a = Math.atan2(dy, dx);
      const ex = W / 2 + Math.cos(a) * (W / 2 - 110 * S),
        ey = H / 2 + Math.sin(a) * (H / 2 - 90 * S); // 比畫面外敵人的箭頭內側
      c.save();
      c.translate(ex, ey);
      c.rotate(a);
      c.beginPath();
      c.moveTo(26 * S, 0);
      c.lineTo(-10 * S, -15 * S);
      c.lineTo(-10 * S, 15 * S);
      c.closePath();
      c.fill();
      c.restore();
    }
    c.restore();
  },
  drawAirHud(c, W, H, p) {
    if (!p.air) return;
    const S = Math.min(W, H) / 900;
    c.save();
    c.font = `${Math.round(15 * S)}px "Share Tech Mono", monospace`;
    c.lineWidth = Math.max(1, 1.4 * S);
    const col = 'rgba(120,255,190,0.9)',
      warn = 'rgba(255,90,70,0.95)';
    c.strokeStyle = col;
    c.fillStyle = col;
    // 速度（左）、高度（右）
    const kmh = Math.round((p.airV || 0) * 3.6),
      alt = Math.round(p.pos.y);
    const yC = H * 0.5,
      xl = W * 0.5 - 380 * S,
      xr = W * 0.5 + 380 * S;
    const box = (x, txt, lbl, al) => {
      c.strokeRect(x - 52 * S, yC - 16 * S, 104 * S, 32 * S);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(txt, x, yC);
      c.font = `${Math.round(11 * S)}px "Share Tech Mono", monospace`;
      c.fillText(lbl, x, yC - 28 * S);
      c.font = `${Math.round(15 * S)}px "Share Tech Mono", monospace`;
      void al;
    };
    box(xl, String(kmh), 'SPEED km/h');
    box(xr, String(alt), 'ALT m');
    // 推力的狀態
    const st =
      p.abT > 0 ? 'ASSAULT' : p.airG ? 'HIGH-G' : p.airV < 20 ? 'HOVER' : p.boost ? 'BOOST' : 'CRUISE';
    c.textAlign = 'center';
    c.fillText(st, xl, yC + 30 * S);
    // 俯仰刻度（畫面中央兩側的短線，跟著機首的俯仰）
    const pit = p.airPit || 0;
    c.textAlign = 'left';
    for (let d = -60; d <= 60; d += 15) {
      const dy = (pit * 180) / Math.PI - d;
      const y = yC + dy * 5 * S;
      if (Math.abs(y - yC) > 170 * S) continue;
      const half = d === 0 ? 70 * S : 38 * S;
      c.globalAlpha = d === 0 ? 0.8 : 0.45;
      c.beginPath();
      c.moveTo(W / 2 - 250 * S - half, y);
      c.lineTo(W / 2 - 250 * S, y);
      c.moveTo(W / 2 + 250 * S, y);
      c.lineTo(W / 2 + 250 * S + half, y);
      c.stroke();
      if (d) c.fillText(String(d), W / 2 + 250 * S + half + 4 * S, y);
    }
    c.globalAlpha = 1;
    // 機首標記（機體往哪裡飛）：沿機首方向 600 m 投影到畫面
    const f = p.airDirNow ? p.airDirNow() : null;
    if (f) {
      const q = this.proj(p.center().addScaledVector(f, 600));
      if (q && q.in) {
        c.beginPath();
        c.arc(q.x, q.y, 9 * S, 0, Math.PI * 2);
        c.moveTo(q.x - 20 * S, q.y);
        c.lineTo(q.x - 9 * S, q.y);
        c.moveTo(q.x + 9 * S, q.y);
        c.lineTo(q.x + 20 * S, q.y);
        c.moveTo(q.x, q.y - 9 * S);
        c.lineTo(q.x, q.y - 16 * S);
        c.stroke();
      }
    }
    this.drawAirMsl(c, W, H, p, S);
    this.drawAirBase(c, W, H, p, S);
    // 低空警告：離地面或海面很近而且往下
    const low = p.airLow !== undefined && p.airLow < 60 && p.vel.y < -4;
    if (low && Math.floor(performance.now() / 250) % 2 === 0) {
      c.fillStyle = warn;
      c.textAlign = 'center';
      c.font = `bold ${Math.round(26 * S)}px "Share Tech Mono", monospace`;
      c.fillText('PULL UP', W / 2, H * 0.36);
    }
    c.restore();
  },
});
