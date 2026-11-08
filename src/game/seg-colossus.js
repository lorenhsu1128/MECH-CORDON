// Game：主線的大型兵器區段 colossus（主線擴充 A1，docs/campaign-expansion-design.md）——
// 巨大的敵方兵器沿路線移動，從外面打斷腳部關節／引擎讓它停機，再擊破露出的動力核心（時限內沒打掉就重新啟動）。
// 兩種：walker 多足巨兵（多足要塞的模型放大，來回巡行，打斷 4 條腳停機）、ship 陸上戰艦（推土要塞的模型放大，
// 單程前進，抵達防衛線＝失敗，打掉 2 具引擎停機）。本體的行為在 entities/mech-colossus.js；判定只在房主／單機。
import { SFX } from '../audio/audio.js';
import { pick } from '../core/math.js';
import { DS, MS } from '../core/scale.js';
import { PART_DEFS } from '../data/enemies.js';
import { Game } from './game.js';

const COL = {
  walker: {
    name: '多足巨兵',
    vehKey: 'spider',
    scale: 1.45,
    radius: 4.5,
    spd: 2.4 * DS, // m/s
    legs: 6, // 腳部關節（掛在模型的 mounts 0～5）
    stop: 4, // 打斷幾條停機
    legHp: 2.2, // 關節的 AP（PART_DEFS.joint 的倍率之上）
    turrets: [
      [0.32, 0.7, 0.25],
      [-0.32, 0.7, 0.25],
      [0, 0.75, -0.3],
    ],
    cannon: [0, 0.82, 0],
  },
  ship: {
    name: '陸上戰艦',
    vehKey: 'dozer',
    scale: 2.1,
    radius: 6,
    spd: 1.7 * DS,
    engines: [
      [0.42, 0.25, -0.62],
      [-0.42, 0.25, -0.62],
    ],
    stop: 2,
    legHp: 3,
    turrets: [
      [0.35, 0.72, 0.35],
      [-0.35, 0.72, 0.35],
      [0.3, 0.72, -0.2],
      [-0.3, 0.72, -0.2],
    ],
    cannon: [0, 0.8, 0.05],
  },
  CORE_T: 60, // 停機後幾秒重新啟動
  CORE_HP: 6, // 動力核心的 AP（PART_DEFS.engine 的倍率之上）
  REBUILD: 2, // 重新啟動時修好幾個
};

Object.assign(Game.prototype, {
  segSpawn_colossus(L, comp) {
    const c = this.camp,
      ss = c.ss,
      w = this.world,
      p = this.player.pos;
    const kind = c.plan[c.seg] && c.plan[c.seg].col ? c.plan[c.seg].col : pick(['walker', 'ship']);
    const K = COL[kind];
    // 路線：沿作戰區域的長軸。多足巨兵在中段來回；陸上戰艦從遠端開向玩家這一側（終點＝防衛線）
    const Z = w.zone;
    const alongX = Z[1] - Z[0] >= Z[3] - Z[2];
    const cx = (Z[0] + Z[1]) / 2,
      cz = (Z[2] + Z[3]) / 2;
    const half = (alongX ? Z[1] - Z[0] : Z[3] - Z[2]) / 2 - 14 * MS;
    const toP = alongX ? Math.sign(p.x - cx) || 1 : Math.sign(p.z - cz) || 1;
    const path = [];
    const n = 12;
    const a = kind === 'ship' ? -toP * half : -half * 0.75,
      b = kind === 'ship' ? toP * half * 0.85 : half * 0.75;
    for (let i = 0; i <= n; i++) {
      const u = a + ((b - a) * i) / n;
      const x = alongX ? cx + u : cx,
        z = alongX ? cz : cz + u;
      path.push(new THREE.Vector3(x, w.terrainHeight(x, z), z));
    }
    const sh = this.scaleHp,
      sd = this.scaleDmg;
    const start = path[0];
    const body = this.spawnEnemy({
      name: K.name,
      asm: PART_DEFS.engine.asm,
      pal: 'boss',
      scale: K.scale,
      hpMul: 3 * sh,
      dmgMul: sd,
      stabMul: 99,
      ai: 'colossus',
      modelKind: 'boss',
      vehKey: K.vehKey,
      radius: K.radius,
      at: start.clone(),
    });
    body.pos.copy(start);
    body.noPush = true;
    body.noLock = true;
    body.col = { kind, path, i: 1, dir: 1, spd: K.spd, ph: 1 };
    body.yaw = Math.atan2(-(path[1].x - start.x), -(path[1].z - start.z));
    ss.col = { body, kind, t: 0, legs: [], core: null, done: false, broken: 0 };
    // 腳部關節／引擎、砲塔、主砲
    if (kind === 'walker')
      for (let i = 0; i < K.legs; i++)
        ss.col.legs.push(this.colPart(body, 'joint', { mount: i, k: K.legHp, i }));
    else
      K.engines.forEach((off, i) => ss.col.legs.push(this.colPart(body, 'engine', { off, k: K.legHp, i })));
    for (const off of K.turrets) this.colPart(body, 'fturret', { off, k: 1.4 });
    this.colPart(body, 'cannon', { off: K.cannon, k: 1.6 });
    if (kind === 'ship')
      this.segRing('end', {
        pos: path[path.length - 1],
        col: 0xff4d4d,
        label: '防衛線',
        sub: '陸上戰艦抵達這裡就失敗',
        r: 12 * MS,
        icon: '防',
      });
    this.spawnComp(comp(L - 2), 1, sh, sd, false);
    this.flashMsg(`${K.name} 接近`, 0xff4d4d, 2.6, { k: 'warn', m: K.name, s: '大型兵器接近' });
    this.alertAll(
      kind === 'walker'
        ? `${K.name}：打斷 ${K.stop} 條腳部關節讓它停機，再擊破露出的動力核心`
        : `${K.name}：在抵達防衛線前打掉 ${K.stop} 具引擎讓它停機，再擊破動力核心`,
    );
  },
  // 部位（掛在本體上：mount＝模型的節點、off＝本體座標的偏移（身高的倍數））；k＝AP 倍率
  colPart(body, kind, o) {
    const P = PART_DEFS[kind];
    const e = this.spawnEnemy({
      name: kind === 'joint' ? '腳部關節' : P.name,
      asm: P.asm,
      pal: 'boss',
      scale: kind === 'joint' ? 1.2 : 1.4,
      hpMul: P.hpMul * this.scaleHp * (o.k || 1),
      dmgMul: P.dmgMul * this.scaleDmg,
      stabMul: P.stabMul,
      ai: 'part',
      partKind: kind,
      modelKind: 'part',
      vehKey: o.vehKey || kind,
      radius: P.radius * 1.3,
      flying: true,
      hoverH: 0,
      wantDist: 40,
      parent: body.id,
      mount: o.mount !== undefined ? o.mount : null,
      off: o.off || undefined,
      at: body.center(),
    });
    e.colIdx = o.i;
    return e;
  },
  segTick_colossus(dt) {
    const c = this.camp,
      ss = c.ss,
      S = ss.col;
    if (!S || S.done) return;
    const b = S.body,
      K = COL[S.kind];
    if (b.col.ph === 1) {
      // 打斷的腳：多足巨兵的腿隱藏（bossVis 低位）
      let mask = b.bossVis & 64;
      let broken = 0;
      for (const L of S.legs)
        if (L.dead) {
          broken++;
          if (S.kind === 'walker') mask |= 1 << L.colIdx;
        }
      b.bossVis = mask;
      S.broken = broken;
      if (broken >= K.stop) {
        // 停機：倒下、甲板、動力核心
        b.col.ph = 2;
        b.bossVis |= 64;
        S.t = COL.CORE_T;
        this.fx.explosion(b.center(), 8, 0xffa040, true);
        this.fx.shockwave(b.pos.clone(), 14 * MS, 0xffd090, 0.6);
        SFX.explode(true, b.center());
        S.core = this.colPart(b, 'engine', { off: [0, 0.55, 0], k: COL.CORE_HP, vehKey: 'pylon' });
        S.core.name = '動力核心';
        this.flashMsg(`${K.name} 停機 — 擊破動力核心！`, 0xffd060, 2.6, {
          k: 'good',
          m: '停機',
          s: `${COL.CORE_T} 秒內擊破動力核心`,
        });
      } else if (b.arrived && this.state === 'play') {
        this.flashMsg(`${K.name} 突破了防衛線`, 0xff4d4d, 3, { k: 'warn', m: '防衛線失守' });
        this.state = 'ending';
        return this.campDead(true);
      }
      return;
    }
    // 停機中
    if (S.core && S.core.dead) {
      S.done = true;
      b.bossVis |= 64;
      this.fx.explosion(b.center(), 14, 0xff8030, true);
      this.fx.shockwave(b.center(), 20 * MS, 0xffb060, 0.8);
      SFX.explode(true, b.center());
      b.hp = 0;
      b.die(this.player);
      this.flashMsg(`${K.name} 擊破`, 0x7ee081, 2.8, { k: 'good', m: '大型兵器擊破', s: K.name });
      this.segRetreat();
      this.segRing('end', null);
      return this.campCleared();
    }
    if ((S.t -= dt) <= 0) {
      // 時限到：修好幾個部位、重新啟動
      if (S.core && !S.core.dead) S.core.partBreak();
      S.core = null;
      let n = 0;
      S.legs = S.legs.map((L) => {
        if (!L.dead || n >= COL.REBUILD) return L;
        n++;
        return S.kind === 'walker'
          ? this.colPart(b, 'joint', { mount: L.colIdx, k: K.legHp, i: L.colIdx })
          : this.colPart(b, 'engine', { off: K.engines[L.colIdx], k: K.legHp, i: L.colIdx });
      });
      b.col.ph = 1;
      b.bossVis &= ~64;
      this.flashMsg(`${K.name} 重新啟動`, 0xff4d4d, 2.4, {
        k: 'warn',
        m: '重新啟動',
        s: `修好了 ${n} 個部位`,
      });
    }
  },
  segBlock_colossus() {
    const S = this.camp.ss.col;
    return !!S && !S.done;
  },
  segGoal_colossus(alive) {
    const S = this.camp.ss.col;
    if (!S || S.done) return null;
    const K = COL[S.kind],
      b = S.body;
    if (b.col.ph === 2)
      return `${K.name} 停機中：擊破動力核心（${Math.max(0, Math.ceil(S.t))} 秒後重新啟動）`;
    const what = S.kind === 'walker' ? '腳部關節' : '引擎';
    const extra =
      S.kind === 'ship'
        ? ` ｜ 離防衛線 ${Math.round(b.pos.distanceTo(b.col.path[b.col.path.length - 1]))} m`
        : '';
    return `${K.name}：打斷${what} ${S.broken}／${K.stop}${extra} ｜ 敵軍 ${alive}`;
  },
});
