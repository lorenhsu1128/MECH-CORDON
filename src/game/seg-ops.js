// Game：主線擴充的新區段類型（docs/campaign-expansion-design.md 的 A）——撤離 extract、追擊 chase、大規模戰場 front（潛入 stealth 在 2026-11-09 移除，最後的版本在標籤 stealth-final）。
// 每種類型的處理照命名掛在 Game 上，campaign.js 依區段類型呼叫（沒有就略過）：
//   segSpawn_<type>(L, comp) 生成敵人與目標、segPost_<type>() 地圖裝置與掉落物之後（devPlan、planVehicles 會清掉它們）、
//   segTick_<type>(dt) 每格（房主／單機）、segBlock_<type>() 回傳 true＝還不算清除、segGoal_<type>(alive) HUD 的目標、
//   segView_<type>() 給客機的顯示資料（快照 campView 的 sv）、segClear_<type>() 拿掉光環。
// 判定都在房主／單機；客機照 campView 的 sv 畫光環。
import { clamp, pick } from '../core/math.js';
import { DS, MS } from '../core/scale.js';
import { AC_ROSTER, ENEMY_TYPES } from '../data/enemies.js';
import { MechEntity } from '../entities/mech-entity.js';
import { PALETTES } from '../render/materials.js';
import { Game } from './game.js';

// 撤離
const EX = {
  WAIT: 90, // 呼叫後回收機抵達的秒數
  LOAD: 5, // 站在回收地點裝載的秒數
  WAVE: 18, // 等待中每隔幾秒一波增援
  SALV: 6, // 回收物資的箱數
  SALV_V: [1500, 400], // 每箱 COAM＝a＋b×等級（撤離成功才入帳）
  R: 6 * MS, // 回收地點的半徑
};
// 追擊
const CH = {
  N: 3, // 運輸車的數量
  HP: 2.2, // 每台的 AP 倍率
  T: 105, // 沒受損時跑完全程的秒數
  HEAD: 40 * DS, // 開場時領先玩家的距離
  SLOW: 0.55, // AP 歸零前的速度下限（比例）
  WAVE: 20, // 攔截部隊的間隔
};
// 大規模戰場
const FR = {
  AT: [0.3, 0.55, 0.8], // 據點在往前的距離的比例
  R: 14 * MS, // 據點的半徑
  CAP_T: 9, // 佔領的秒數（敵方也在圈裡時 ×1／0.6）
  WEAK: 0.45, // 敵人的 AP 倍率（弱小、數量多）
  GARRISON: 5, // 每個據點的守軍（越後面越多）
  WAVE: 13, // 敵方增援的間隔
  WAVE_N: 4,
  CAP: 40, // 場上機體的上限（敵＋友）
  ALLY_MT: 6, // 友軍的雜兵
  ALLY_AC: 1,
  ALLY_T: 25, // 檢查友軍補充的間隔
  ALLY_TYPES: ['mt', 'mt', 'mth', 'tank'],
  NO_WEAK: new Set(['ac', 'dropship', 'repair', 'dome', 'minelayer', 'commander']),
};
// 運輸車的組裝（和護送的車輛相同，campaign.js 的 campConvoy）
const CONVOY_ASM = {
  head: 'h_hv',
  core: 'c_hv',
  arms: 'a_hv',
  legs: 'l_tk',
  booster: 'b_std',
  generator: 'g_std',
  fcs: 'f_std',
  rarm: 'w_none',
  larm: 'w_none',
  rback: 'bw_none',
  lback: 'bw_none',
};
const LZ_COL = 0xffa040,
  LZ_OK = 0x7ee081;

Object.assign(Game.prototype, {
  // 依區段類型找處理函式（沒有＝null）
  segH(kind, type) {
    const t = type || (this.camp && this.camp.ss && this.camp.ss.type);
    const f = t && this['seg' + kind + '_' + t];
    return typeof f === 'function' ? f : null;
  },

  // ================= 撤離 =================
  segSpawn_extract(L, comp) {
    const ss = this.camp.ss;
    this.spawnComp(comp(L - 1), 1, this.scaleHp, this.scaleDmg);
    ss.targets = this.campAtGroups(L >= 4 ? 2 : 1, true).map((pos) => this.campObjective(pos, 'enemy'));
    ss.ext = { ph: 0, t: 0, loot: 0, n: 0, lz: null, waveT: 0, k: 0 };
    this.flashAlert('撤離任務：摧毀目標後回收機出發 — 回收物資要撤離成功才帶得走');
  },
  // 回收物資散在場上（planVehicles 之後，它會清掉掉落物）
  segPost_extract() {
    const W = this.world;
    const n = EX.SALV * (this.campRule('extractRich') ? 2 : 1); // 委託板的「大宗物資」
    for (const p of this.campSpots(n, 'inner'))
      this.spawnPickup('salvage', new THREE.Vector3(p.x, W.groundAt(p.x, p.z, p.y + 3 * MS) + 0.6, p.z));
  },
  // 撿到回收物資（collectPickup；房主／單機）
  segSalvage(ent) {
    const ext = this.camp && this.camp.ss && this.camp.ss.ext;
    if (!ext) return false;
    const L = this.campLevel();
    ext.loot += Math.round((EX.SALV_V[0] + EX.SALV_V[1] * L) / 100) * 100;
    ext.n++;
    this.flashMsg(`${ent.name} 回收物資 ×${ext.n}（撤離成功才入帳）`, 0xffc040, 1.6);
    return true;
  },
  segTick_extract(dt) {
    const c = this.camp,
      ss = c.ss,
      ext = ss.ext;
    if (!ext) return;
    if (ext.ph === 0) {
      if (!ss.targets.every((e) => e.dead)) return;
      // 目標全毀：呼叫回收機，回收地點在離玩家遠的地方
      ext.ph = 1;
      ext.t = EX.WAIT;
      ext.waveT = 6;
      const cand = this.campSpots(3, 'inner');
      const ps = this.playersAlive();
      const far = (q) => Math.min(...ps.map((p) => Math.hypot(p.pos.x - q.x, p.pos.z - q.z)), 1e9);
      const pos = cand.sort((a, b) => far(b) - far(a))[0];
      ext.lz = this.segLzRing(pos);
      this.flashMsg(`目標摧毀 — 回收機 ${EX.WAIT} 秒後抵達`, 0xffa040, 2.6, {
        k: 'info',
        m: '呼叫回收機',
        s: `${EX.WAIT} 秒後抵達回收地點`,
      });
      this.campComm('extCall', this.campCtx());
      return;
    }
    if (ext.ph === 1) {
      ext.t -= dt;
      ext.waveT -= dt;
      if (ext.waveT <= 0 && ext.t > 8) {
        ext.waveT = EX.WAVE;
        ext.k++;
        const L = this.campLevel() - 1 + Math.floor(ext.k / 2);
        const list = this.rollComp(Math.max(1, L), ss.np || 1)
          .filter((t) => t !== 'ac')
          .slice(0, 2 + ext.k);
        if (ext.k >= 4 && !ext.ace) {
          ext.ace = true;
          list.push('ac'); // 最後一波有敵對 AC
        }
        const tgt = pick(this.playersAlive()) || this.player;
        const at = this.waveEdgePoint(tgt.pos);
        const W = this.world;
        const base = new THREE.Vector3(at.x, W.groundAt(at.x, at.z, 999), at.z);
        this.fx.warnLine(base, base.clone().setY(base.y + 45), 3.5, 0xff3030, 0.5);
        this.spawnLater(list, at);
        this.flashAlert(ext.ace && ext.k >= 4 ? '敵對 AC 接近！' : `敵方增援（第 ${ext.k} 波）`);
      }
      if (ext.t <= 0) {
        ext.ph = 2;
        ext.lz = this.segLzRing(ext.lz.pos);
        this.flashMsg('回收機抵達 — 進入回收地點裝載物資', LZ_OK, 2.6, {
          k: 'good',
          m: '回收機抵達',
          s: '進入回收地點裝載物資',
        });
      }
    }
    if (ext.ph === 2) {
      const lz = ext.lz;
      const on = this.campMp()
        ? this.campStandAny(lz, dt, EX.R)
        : !this.player.dead && this.campStand(lz, dt, EX.R)
          ? this.player
          : null;
      if (on && on === this.player) c.hint = `裝載中… ${Math.min(100, Math.round((lz.t / EX.LOAD) * 100))}%`;
      if (lz.t >= EX.LOAD) this.segExtractDone();
    }
  },
  // 裝載完成：物資入帳、剩下的敵軍撤退，之後照一般的清除（開出口／出擊完成）
  segExtractDone() {
    const c = this.camp,
      ext = c.ss.ext;
    ext.ph = 3;
    const v = ext.loot;
    // 回收物資另外給的素材（data/tune.js 的 DROP.salvage）
    if (ext.n) {
      this.lootMat('alloy', ext.n);
      const ci = Math.round(ext.n * 0.4);
      if (ci) this.lootMat('circuit', ci);
    }
    if (v > 0) {
      this.save.coam += v;
      this.missionEarned = (this.missionEarned || 0) + v;
      this.bountyPops.push({ txt: '+' + v.toLocaleString() + ' COAM', life: 2.2, y: 0 });
      this.writeSave();
      if (this.campMp()) this.campMpCoam(v);
    }
    this.flashMsg(
      ext.n ? `撤離成功 — 回收物資 ${ext.n} 箱 +${v.toLocaleString()} COAM` : '撤離成功',
      0x7ee081,
      2.6,
      { k: 'good', m: '撤離成功', s: ext.n ? `回收物資 ${ext.n} 箱 +${v.toLocaleString()} COAM` : '' },
    );
    this.waves = [];
    this.wavePend = null;
    this.spawnQ = [];
    let n = 0;
    for (const e of this.enemies)
      if (!e.dead) {
        e.dead = true;
        e.mesh.visible = false;
        n++;
      }
    if (n) setTimeout(() => this.camp && this.flashAlert('敵軍撤退'), 1200);
    this.segRing('lz', null);
    this.campCleared();
  },
  // 回收地點的光環（依階段換顏色與文字）
  segLzRing(pos) {
    const ok = this.camp.ss.ext.ph === 2;
    return this.segRing('lz', {
      pos,
      col: ok ? LZ_OK : LZ_COL,
      label: '回收地點',
      sub: ok ? '回收機抵達：站進來裝載' : '回收機正在趕來',
      r: EX.R,
      icon: '回',
      spin: ok ? 2 : 0.6,
    });
  },
  segBlock_extract() {
    const ext = this.camp.ss.ext;
    return !!ext && ext.ph < 3;
  },
  segGoal_extract(alive) {
    const ss = this.camp.ss,
      ext = ss.ext;
    if (!ext || ext.ph >= 3) return null;
    const loot = `回收物資 ${ext.n} 箱`;
    if (ext.ph === 0)
      return `摧毀目標 ${ss.targets.filter((e) => e.dead).length}／${ss.targets.length} ｜ ${loot} ｜ 殘存敵軍 ${alive}`;
    if (ext.ph === 1) return `回收機抵達：${Math.max(0, Math.ceil(ext.t))} 秒 ｜ 守住回收地點附近 ｜ ${loot}`;
    return `回收機抵達 — 進入回收地點裝載物資 ｜ ${loot}`;
  },
  // ================= 追擊 =================
  // 敵方的運輸車沿公路逃往另一端的隧道：全部擊破＝清除，任何一台抵達逃脫點＝失敗；受損越重跑得越慢
  segSpawn_chase(L, comp) {
    const w = this.world,
      ss = this.camp.ss,
      sh = this.scaleHp,
      sd = this.scaleDmg;
    if (!w.corridor) {
      ss.type = 'battle';
      this.spawnComp(comp(L), 1, sh, sd);
      return;
    }
    const S = w.trackS * 0.85,
      dirS = Math.random() < 0.5 ? 1 : -1;
    const path = [];
    for (let s = -S; s <= S; s += 8 * DS) path.push(w.corridorPoint(s * dirS, 0));
    let len = 0;
    for (let i = 1; i < path.length; i++) len += path[i].distanceTo(path[i - 1]);
    const sp = w.corridorPoint(-S * dirS, 9 * DS);
    this.player.pos.set(sp.x, w.terrainHeight(sp.x, sp.z), sp.z);
    const vs = [];
    let leader = null;
    for (let i = 0; i < CH.N; i++) {
      const at = w.corridorPoint((-S + CH.HEAD - i * 10 * DS) * dirS, 0);
      const e = this.spawnEnemy({
        name: '逃亡運輸車',
        asm: { ...CONVOY_ASM },
        pal: 'enemy',
        scale: 0.9,
        hpMul: CH.HP * sh,
        dmgMul: 0,
        stabMul: 99,
        ai: 'convoy',
        modelKind: 'vehicle',
        radius: 2,
        path,
        convoySpeed: 0.5,
        leader,
        at,
      });
      e.noPush = true;
      e.pathI = Math.min(path.length - 1, Math.ceil((CH.HEAD - i * 10 * DS) / (8 * DS)) + 1); // 從自己前方的路徑點開始跟
      // 速度：沒受損時約 CH.T 秒跑完全程
      e.cs0 = clamp(len / CH.T / Math.max(1, e.stats.speed * (e.speedMul || 1)), 0.15, 1);
      e.opts.convoySpeed = e.cs0;
      vs.push(e);
      leader = e;
    }
    ss.chase = { vs, waveT: 8, done: false, len };
    this.spawnComp(comp(L - 1), 1, sh, sd, false);
    this.segRing('esc', {
      pos: path[path.length - 1],
      col: 0xff4d4d,
      label: '逃脫點',
      sub: '運輸車抵達這裡就失敗',
      r: 7 * MS,
      icon: '逃',
    });
    this.flashAlert('追擊任務：在運輸車逃進隧道前全部擊破 — 打得越重跑得越慢');
  },
  segTick_chase(dt) {
    const c = this.camp,
      ss = c.ss,
      ch = ss.chase;
    if (!ch || ch.done) return;
    const alive = ch.vs.filter((v) => !v.dead);
    if (!alive.length) {
      ch.done = true;
      this.flashMsg('運輸車全部擊破', 0x7ee081, 2.4, { k: 'good', m: '追擊成功', s: '運輸車全部擊破' });
      this.segRetreat();
      this.segRing('esc', null);
      return this.campCleared();
    }
    if (alive.some((v) => v.arrived) && this.state === 'play') {
      this.flashMsg('運輸車逃脫了', 0xff4d4d, 3, { k: 'warn', m: '目標逃脫' });
      this.state = 'ending';
      return this.campDead(true);
    }
    for (const v of alive)
      v.opts.convoySpeed = v.cs0 * (CH.SLOW + (1 - CH.SLOW) * clamp(v.hp / v.maxHp, 0, 1));
    // 攔截：定時在最前面那台的前方出現敵人
    if ((ch.waveT -= dt) <= 0) {
      ch.waveT = CH.WAVE;
      const lead = alive[0],
        w = this.world;
      const path = lead.opts.path;
      const q = path[Math.min((lead.pathI || 0) + 5, path.length - 1)];
      const side = Math.random() < 0.5 ? 1 : -1;
      const [x, z] = w.nearSolid(
        clamp(q.x + side * 14 * DS, -w.lim + 4, w.lim - 4),
        clamp(q.z + side * 6 * DS, -w.lim + 4, w.lim - 4),
      );
      this.spawnLater(
        this.rollComp(Math.max(1, this.campLevel() - 1), ss.np || 1)
          .filter((t) => t !== 'ac')
          .slice(0, 3),
        new THREE.Vector3(x, w.terrainHeight(x, z), z),
      );
      this.flashAlert('敵方的攔截部隊');
    }
  },
  segBlock_chase() {
    const ch = this.camp.ss.chase;
    return !!ch && !ch.done;
  },
  segGoal_chase(alive) {
    const ch = this.camp.ss.chase;
    if (!ch || ch.done) return null;
    const vs = ch.vs.filter((v) => !v.dead);
    const lead = vs[0];
    const path = lead ? lead.opts.path : null;
    const d = path ? Math.round(lead.pos.distanceTo(path[path.length - 1])) : 0;
    return `追擊：運輸車 ${vs.length}／${ch.vs.length} 台 ｜ 最前面離逃脫點 ${d} m ｜ 敵軍 ${alive}`;
  },
  // 清除時剩下的敵軍撤退（不給獎金）
  segRetreat() {
    this.waves = [];
    this.wavePend = null;
    this.spawnQ = [];
    let n = 0;
    for (const e of this.enemies)
      if (!e.dead) {
        e.dead = true;
        e.mesh.visible = false;
        n++;
      }
    if (n) setTimeout(() => this.camp && this.flashAlert('敵軍撤退'), 1200);
  },

  // ================= 大規模戰場 =================
  // 友軍部隊和大批弱小的敵人對推戰線：依序佔領 3 個據點（站在圈裡、我方比敵方多時進度上升）
  segSpawn_front() {
    const w = this.world,
      ss = this.camp.ss,
      p = this.player.pos,
      s = w.start,
      Z = w.zone;
    let fx = s ? s.fx : 0,
      fz = s ? s.fz : 0;
    if (!fx && !fz) {
      const a = Math.atan2((Z[2] + Z[3]) / 2 - p.z, (Z[0] + Z[1]) / 2 - p.x);
      fx = Math.cos(a);
      fz = Math.sin(a);
    }
    const n = Math.hypot(fx, fz) || 1;
    fx /= n;
    fz /= n;
    // 往前到作戰區域另一側的距離
    let D = 0;
    while (D < 600 * DS && w.inZone(p.x + fx * (D + 10 * DS), p.z + fz * (D + 10 * DS))) D += 5 * DS;
    D = Math.max(D, 60 * DS);
    const pts = [];
    FR.AT.forEach((f, k) => {
      const j = (Math.random() - 0.5) * 0.3 * D;
      const want = { x: p.x + fx * D * f - fz * j, z: p.z + fz * D * f + fx * j };
      const q = w.spawnPoint(
        p,
        pts.map((o) => o.pos),
        want,
      );
      const pos = new THREE.Vector3(q.x, w.terrainHeight(q.x, q.z), q.z);
      pts.push({ pos, own: 0, prog: 0, k });
    });
    ss.front = { pts, cur: 0, waveT: 5, allyT: 20, done: false, dir: [fx, fz], far: D };
    pts.forEach((o, k) => this.segFrontRing(k));
    this.waves = [];
    // 各據點的守軍（弱小的雜兵，越後面越多）
    pts.forEach((o, k) => this.segFrontWave(o.pos, FR.GARRISON + k));
    // 友軍部隊
    for (let i = 0; i < FR.ALLY_MT; i++) this.segAllyUnit(pick(FR.ALLY_TYPES), p, 10 + i * 2.5);
    for (let i = 0; i < FR.ALLY_AC; i++) this.segAllyUnit('ac', p, 14);
    this.flashAlert(`大規模戰場：和友軍一起依序佔領 ${pts.length} 個據點`);
  },
  // 一群弱小的敵人（scaleHp 暫時乘 FR.WEAK，spawnLater 記下生成時的倍率）：at 附近
  segFrontWave(at, n) {
    const L = Math.max(1, this.campLevel() - 1);
    const pool = this.rollComp(L, 1).filter((t) => !FR.NO_WEAK.has(t));
    const list = [];
    for (let i = 0; i < n; i++) list.push(pool.length ? pick(pool) : 'mt');
    const sh = this.scaleHp;
    this.scaleHp = sh * FR.WEAK;
    try {
      this.spawnLater(list, at, 1);
    } finally {
      this.scaleHp = sh;
    }
  },
  // 友軍的雜兵或 AC（team ally、不會離場）：near 附近 r（× DS）
  segAllyUnit(t, near, r) {
    const W = this.world;
    const a0 = Math.random() * Math.PI * 2;
    const [x, z] = W.nearSolid(near.x + Math.cos(a0) * r * DS, near.z + Math.sin(a0) * r * DS);
    const pos = new THREE.Vector3(x, W.groundAt(x, z, 999), z);
    let o;
    if (t === 'ac') {
      const r0 = pick(Object.values(AC_ROSTER));
      o = {
        name: '友軍 AC',
        asm: r0.asm,
        ai: 'ac',
        hpMul: 1.3 * this.scaleHp,
        dmgMul: 0.8 * this.scaleDmg,
        stabMul: 1.4,
        wantDist: 20,
      };
    } else {
      const d = ENEMY_TYPES[t];
      o = {
        name: '友軍 ' + d.name,
        asm: d.gen(),
        scale: d.scale,
        hpMul: d.hpMul * this.scaleHp * 1.3,
        dmgMul: d.dmgMul * this.scaleDmg * 0.8,
        stabMul: d.stabMul,
        ai: d.ai,
        flying: d.flying,
        hoverH: d.hoverH,
        modelKind: d.modelKind,
        vehKey: d.vehKey,
        radius: d.radius,
        wantDist: d.wantDist,
        speedMul: d.speedMul,
        grunt: true,
      };
    }
    const a = new MechEntity(this, o.asm, PALETTES.ally, {
      ...o,
      team: 'ally',
      palKey: 'ally',
      allyDur: 1e9,
    });
    a.pos.copy(pos);
    a.mesh.position.copy(pos);
    a.allyT = 1e9;
    a.kits = 0;
    this.registerSpawn(a);
    this.allies.push(a);
    return a;
  },
  // 據點的光環：目前要佔領的黃色（HUD 標記）、我方的藍色、還沒輪到的紅色
  segFrontRing(k) {
    const f = this.camp.ss.front,
      o = f.pts[k];
    const cur = k === f.cur && !o.own;
    this.segRing('fp' + k, {
      pos: o.pos,
      col: o.own ? 0x5cc8ff : cur ? 0xffd060 : 0xff6a50,
      label: `據點 ${'ABC'[k]}`,
      sub: o.own ? '我方佔領' : cur ? '站進來佔領（我方比敵方多時）' : '敵方據點',
      r: FR.R,
      icon: cur ? '據' : '',
      spin: cur ? 1.4 : 0.4,
    });
  },
  // 據點圈裡的我方（玩家＋友軍）與敵方的數量
  segFrontCount(o) {
    const inR = (e) => !e.dead && !e.downed && Math.hypot(e.pos.x - o.pos.x, e.pos.z - o.pos.z) < FR.R;
    const fr =
      this.playersAlive().filter(inR).length +
      this.allies.filter((a) => inR(a) && a.ai !== 'objective').length;
    const fo = this.enemies.filter((e) => inR(e) && !e.decoy).length;
    return [fr, fo];
  },
  segTick_front(dt) {
    const ss = this.camp.ss,
      f = ss.front;
    if (!f || f.done) return;
    const o = f.pts[f.cur];
    const [fr, fo] = this.segFrontCount(o);
    if (fr > fo) o.prog = Math.min(1, o.prog + (dt / FR.CAP_T) * (fo ? 0.6 : 1));
    else if (fo > fr) o.prog = Math.max(0, o.prog - (dt / FR.CAP_T) * 0.5);
    f.fr = fr;
    f.fo = fo;
    if (o.prog >= 1) {
      o.own = 1;
      f.cur++;
      this.segFrontRing(f.cur - 1);
      if (f.cur >= f.pts.length) {
        f.done = true;
        this.flashMsg('全部據點佔領 — 戰線推進完成', 0x7ee081, 2.6, {
          k: 'good',
          m: '戰線突破',
          s: '全部據點佔領',
        });
        this.segRetreat();
        return this.campCleared();
      }
      this.segFrontRing(f.cur);
      this.flashMsg(`據點 ${'ABC'[f.cur - 1]} 佔領 — 前往據點 ${'ABC'[f.cur]}`, 0x5cc8ff, 2.4, {
        k: 'info',
        m: `據點 ${'ABC'[f.cur - 1]} 佔領`,
        s: `前往據點 ${'ABC'[f.cur]}`,
      });
    }
    // 敵方的增援：從目前據點的更前方湧過來（場上的機體有上限）
    if ((f.waveT -= dt) <= 0) {
      f.waveT = FR.WAVE;
      const live = this.enemies.filter((e) => !e.dead).length + this.allies.filter((a) => !a.dead).length;
      if (live + (this.spawnQ ? this.spawnQ.length : 0) < FR.CAP) {
        const tgt = f.pts[f.cur].pos;
        const [x, z] = this.world.nearSolid(
          tgt.x + f.dir[0] * 40 * DS + (Math.random() - 0.5) * 40 * DS,
          tgt.z + f.dir[1] * 40 * DS + (Math.random() - 0.5) * 40 * DS,
        );
        this.segFrontWave(new THREE.Vector3(x, this.world.terrainHeight(x, z), z), FR.WAVE_N + f.cur);
      }
    }
    // 友軍的補充
    if ((f.allyT -= dt) <= 0) {
      f.allyT = FR.ALLY_T;
      const n = this.allies.filter((a) => !a.dead && a.ai !== 'objective').length;
      if (n < FR.ALLY_MT / 2 && this.player) {
        for (let i = 0; i < 2; i++) this.segAllyUnit(pick(FR.ALLY_TYPES), this.player.pos, 12);
        this.flashAlert('友軍增援抵達');
      }
    }
  },
  segBlock_front() {
    const f = this.camp.ss.front;
    return !!f && !f.done;
  },
  segGoal_front() {
    const f = this.camp.ss.front;
    if (!f || f.done) return null;
    const o = f.pts[f.cur];
    return `戰線：據點 ${'ABC'[f.cur]}（${f.cur + 1}／${f.pts.length}）佔領 ${Math.round(o.prog * 100)}% ｜ 我方 ${f.fr || 0} 對 敵方 ${f.fo || 0}`;
  },

  // ================= 客機與 HUD 共用 =================
  // 區段的光環（回收地點、逃脫點、據點…）：房主以 segRing 建立並記在 ss.rings，campView 的 sv.rings 帶給客機，
  // HUD 的標記兩邊共用。key＝名稱；spec＝{ pos, col 顏色, label, sub, r 半徑, icon 標記的字, spin 轉速 }，null＝拿掉
  segRing(key, spec) {
    const ss = this.camp.ss;
    const R = ss.rings || (ss.rings = {});
    const old = R[key];
    if (old) this.campDisposeGroup(old.group);
    if (!spec) {
      delete R[key];
      return null;
    }
    R[key] = {
      ...spec,
      t: (old && old.t) || 0,
      group: this.campRing(spec.pos, spec.col, spec.label, spec.sub, spec.r),
    };
    return R[key];
  },
  // 給客機的資料：[x, y, z, 顏色, 標題, 說明, 半徑, 標記的字]
  segRingsSer() {
    const R = this.camp && this.camp.ss && this.camp.ss.rings;
    if (!R) return [];
    const P = (v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)];
    return Object.values(R).map((o) => [
      ...P(o.pos),
      o.col,
      o.label,
      o.sub || '',
      +o.r.toFixed(2),
      o.icon || '',
    ]);
  },
  segRingSpin(dt) {
    const R = this.camp && this.camp.ss && this.camp.ss.rings;
    if (R)
      for (const o of Object.values(R)) if (o.group) o.group.userData.ring.rotation.z += dt * (o.spin || 0.8);
  },
  segClearRings() {
    const ss = this.camp && this.camp.ss;
    if (!ss || !ss.rings) return;
    for (const o of Object.values(ss.rings)) this.campDisposeGroup(o.group);
    ss.rings = null;
  },
  // 客機：照 sv.rings 建光環（campClientView 呼叫；campClearClientVis 清掉）
  segClientVis(vis, sv) {
    vis.segR = [];
    for (const a of (sv && sv.rings) || []) {
      const pos = new THREE.Vector3(a[0], a[1], a[2]);
      vis.segR.push({ pos, col: a[3], icon: a[7], group: this.campRing(pos, a[3], a[4], a[5], a[6]) });
    }
  },
  // HUD 的標記（campDrawHud）：[位置, 顏色, 字]
  segMarks() {
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');
    const R = this.camp && this.camp.ss && this.camp.ss.rings;
    const V = !this.camp && this.campC && this.campC.vis;
    const list = R ? Object.values(R) : (V && V.segR) || [];
    return list.filter((o) => o.icon).map((o) => [o.pos, hex(o.col), o.icon]);
  },
});
