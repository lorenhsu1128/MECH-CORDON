// 主線每一章每一區段的卡頓量測（docs/perf-campaign-plan.md）：開新存檔，自動操作的玩家依序打完每個出擊的每一段
// （往敵人走、射擊、QB、跳躍脫困；資料終端、補給台、出口照著站；選出口時優先沒打過的區段類型），逐格記錄
// 主迴圈的耗時與兩格的間隔、各段耗時、事件（生成、擊破、倒塌、通訊…）、著色器編譯、GC、長任務，
// 找出每一段的卡頓（兩格間隔超過 --hitch，預設 50 ms）並歸類原因。
//
//   node scripts/perf-campaign.js                     主線的 19 個出擊（第 1～6 章）
//   node scripts/perf-campaign.js --only=c4s1,c4s2    只跑這幾個（--ch=4＝只跑第 4 章；--all＝連第 2、3 周目的委託）
//   node scripts/perf-campaign.js --segsecs=90 --hitch=50 --tag=now
//
// 結果：test-results/perf-campaign/<tag>.json（每段的統計與每個卡頓）與 <tag>.md（報告）；
// 跑到一半中斷時，已完成的出擊會保留，加 --resume 從沒跑的接著跑。
// 自動操作的玩家：不會被擊破、彈藥無限、對敵人的傷害 ×--dmg（預設 5，讓一段在 1～2 分鐘內打完）；
// 一段超過 --segsecs 秒（實際時間）沒清除就強制清除（那之後的格不算進統計）。
// 每個出擊用新的瀏覽器環境（和第一次玩的玩家一樣，沒有學到的著色器變體；--learn 改成帶著）。需要先 npm run build。
/* global window, localStorage, THREE */
const path = require('path');
const fs = require('fs');
const { launch, initScript, instrument } = require('./perf-lib');

const ROOT = path.join(__dirname, '..');
const OUTD = path.join(ROOT, 'test-results', 'perf-campaign');
const args = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}
const TAG = args.tag || 'now';
const SEG_SECS = +(args.segsecs || 100);
const HITCH = +(args.hitch || 50);
const DMG = +(args.dmg || 5);
const [VW, VH] = String(args.size || '1600x900')
  .split('x')
  .map(Number);
const DIST = args.dist ? path.resolve(args.dist) : path.join(ROOT, 'dist');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 頁面裡：自動操作的玩家 ----------
function botInstall(cfg) {
  const g = window.__game,
    P = Object.getPrototypeOf(g);
  const B = (window.__bot = {
    on: false,
    tgt: null,
    why: '',
    re: 0,
    best: Infinity,
    bestT: 0,
    jumpT: 0,
    qbT: 0,
    lt: 0,
    segT: 0,
    tp: 0,
    forced: false,
    seen: cfg.seen || {},
    log: [],
  });
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  // 傷害倍率（只有自動操作的玩家打敵人）
  let patched = false;
  const patch = (p) => {
    if (patched) return;
    patched = true;
    const MP = Object.getPrototypeOf(p),
      td = MP.takeDamage;
    MP.takeDamage = function (dmg, imp, from, ...r) {
      if (from && from === window.__game.player && this.team !== 'player') dmg *= cfg.dmg;
      return td.call(this, dmg, imp, from, ...r);
    };
  };
  const pickTarget = (p) => {
    const c = g.camp,
      ss = (c && c.ss) || {},
      type = ss.type;
    // 出口：清除後；突破區段打一陣子就走
    if (
      c &&
      c.exits &&
      c.exits.length &&
      (c.cleared || (type === 'breakthrough' && B.segT > 40) || B.forced)
    ) {
      if (B.exit == null || !c.exits[B.exit]) {
        // 優先沒打過的區段類型（每一段的類型由出口決定）
        let bi = 0,
          bs = Infinity;
        c.exits.forEach((ex, i) => {
          const s = (B.seen[ex.type] || 0) * 1000 + hyp(ex.pos, p.pos) * 0.01;
          if (s < bs) {
            bs = s;
            bi = i;
          }
        });
        B.exit = bi;
      }
      return [c.exits[B.exit].pos, 'exit', 0];
    }
    if (ss.intel && !ss.intel.done) return [ss.intel.pos, 'intel', 0];
    if (ss.pad && !ss.pad.used) return [ss.pad.pos, 'pad', 0];
    let best = null,
      bd = Infinity;
    for (const e of g.enemies) {
      if (e.dead || e.decoy) continue;
      if (!Number.isFinite(e.pos.x + e.pos.z)) {
        // 敵人的位置不是有限值：遊戲的 bug，記下來、不當目標
        const k = 'enemyNaN ' + (e.etype || e.ai) + ' ' + (e.name || '') + ' hp ' + e.hp;
        window.__enemyNaN = window.__enemyNaN || {};
        window.__enemyNaN[k] = (window.__enemyNaN[k] || 0) + 1;
        continue;
      }
      let d = hyp(e.pos, p.pos);
      if (e.guardOf && d > 60) continue; // 據點的守衛不擋清除
      if (e.isBoss) d *= 0.7;
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best) return [best.pos, 'enemy', 28];
    let gq = null;
    bd = Infinity;
    for (const q of g.encGroups || [])
      if (q.pend && hyp(q.pos, p.pos) < bd) {
        bd = hyp(q.pos, p.pos);
        gq = q;
      }
    if (gq) return [gq.pos, 'group', 0];
    if (ss.convoy) {
      const a = ss.convoy.find((x) => !x.dead);
      if (a) return [a.pos, 'convoy', 15];
    }
    // 作戰區域是陣列 [x0, x1, z0, z1]（World.setZone）
    const z = g.world.zone || [0, 0, 0, 0];
    return [V3((z[0] + z[1]) / 2, 0, (z[2] + z[3]) / 2), 'center', 10];
  };
  const tick = () => {
    if (!B.on) return;
    const p = g.player;
    if (g.state !== 'play' || !p || p.dead) {
      g.tutVirt = null;
      return;
    }
    const now = performance.now(),
      dt = Math.min(0.1, B.lt ? (now - B.lt) / 1000 : 0);
    B.lt = now;
    B.segT += dt;
    patch(p);
    // 不會被擊破、彈藥無限、友方的目標不會被毀
    p.hp = p.maxHp;
    for (const w of Object.values(p.weapons || {}))
      if (w && w.def && w.def.ammo > 0 && !w.dropped) w.ammo = Math.max(w.ammo, w.def.ammo * 0.5);
    const ss = (g.camp && g.camp.ss) || {};
    if (ss.defend && !ss.defend.dead) ss.defend.hp = ss.defend.maxHp;
    for (const a of ss.convoy || []) if (!a.dead) a.hp = a.maxHp;
    B.re -= dt;
    if (B.re <= 0 || !B.tgt) {
      B.re = 0.4;
      const [pos, why, keep] = pickTarget(p);
      if (why !== B.why || !B.tgt || hyp(pos, B.tgt) > 6) {
        B.best = Infinity;
        B.bestT = 0;
      }
      B.tgt = pos.clone();
      B.why = why;
      B.keep = keep;
    }
    const V = {};
    const d = hyp(B.tgt, p.pos);
    let wish = V3(B.tgt.x - p.pos.x, 0, B.tgt.z - p.pos.z);
    if (d > 0.01) wish.normalize();
    if (B.keep && d < B.keep) {
      // 在敵人附近繞圈（邊閃邊打）
      wish = V3(-wish.z, 0, wish.x).multiplyScalar(Math.sin(B.segT * 0.5) > 0 ? 1 : -1);
    } else if (!B.keep && d < 2) wish.set(0, 0, 0);
    // 卡住：先跳、還是不動就往目標瞬移（記下次數）
    if (d < B.best - 2) {
      B.best = d;
      B.bestT = 0;
    } else if (!(B.keep && d < B.keep + 4) && d > 3) B.bestT += dt;
    if (B.bestT > 2.5 && B.jumpT <= 0) B.jumpT = 1.2;
    if (B.bestT > 7) {
      const k = Math.min(1, 25 / Math.max(1, d));
      let x = p.pos.x + (B.tgt.x - p.pos.x) * k,
        z = p.pos.z + (B.tgt.z - p.pos.z) * k;
      const w = g.world;
      if (w.nearSolid) [x, z] = w.nearSolid(x, z);
      p.pos.set(x, w.groundAt(x, z, 999) + 0.5, z);
      if (p.vel) p.vel.set(0, 0, 0);
      B.tp++;
      B.bestT = 0;
      B.best = Infinity;
      window.__botFlag = 'tp';
      B.log.push({ t: +B.segT.toFixed(1), tp: B.why });
    } else if (window.__botFlag === 'tp') window.__botFlag = B.forced ? 'forced' : 0;
    if (B.jumpT > 0) {
      B.jumpT -= dt;
      V.jump = true;
    }
    B.qbT -= dt;
    if (B.qbT <= 0 && wish.lengthSq() > 0.1) {
      B.qbT = 2.5 + Math.random() * 2;
      V.qb = true;
    }
    if (!Number.isFinite(wish.x + wish.z) && !window.__wishNaN)
      window.__wishNaN = {
        tgt: [B.tgt.x, B.tgt.z],
        pos: [p.pos.x, p.pos.z],
        d,
        keep: B.keep,
        why: B.why,
        tp: B.tp,
      };
    V.wish = wish;
    const foe = g.enemies.some((e) => !e.dead && !e.decoy && hyp(e.pos, p.pos) < 160);
    if (foe) {
      V.fireR = V.fireL = true;
      V.backR = V.backL = Math.sin(B.segT * 0.7) > 0;
    }
    g.tutVirt = V;
  };
  const loop = P.loop;
  P.loop = function () {
    try {
      tick();
    } catch (e) {
      B.log.push({ err: String(e && e.message) });
    }
    // 主迴圈出錯時後面的檢查也要跑（錯誤照樣往外丟）
    try {
      return loop.call(this);
    } finally {
      try {
        nanWatch();
      } catch (e) {
        /* 略過 */
      }
    }
  };
  // 第一次出現非有限值（玩家、鏡頭、聽者、敵人的位置）時記下前 12 格的狀態，找出從哪裡開始壞
  const fin = (v) => v && Number.isFinite(v.x + v.y + v.z);
  const ring = [];
  // 玩家的位置與速度：第一次被設成非有限值時記下呼叫堆疊
  const trap = (p) => {
    if (!p || p.__trap) return;
    p.__trap = true;
    for (const [nm, v] of [
      ['pos', p.pos],
      ['vel', p.vel],
    ])
      for (const k of ['x', 'y', 'z']) {
        let val = v[k];
        Object.defineProperty(v, k, {
          get: () => val,
          set: (n) => {
            if (!Number.isFinite(n) && !window.__nanStack)
              window.__nanStack = nm + '.' + k + ' = ' + n + ' | ' + String(new Error().stack).slice(0, 1500);
            val = n;
          },
          configurable: true,
        });
      }
  };
  // 會改目標速度的函式：前後檢查（哪一個讓它變成非有限值）
  const fin3 = (v) => v && Number.isFinite(v.x + v.z);
  const nanNote = (m) => {
    if (!window.__nanFn) window.__nanFn = m;
  };
  for (const nm of ['zonePull', 'devPush', 'bfMove']) {
    const f0 = P[nm];
    if (!f0) continue;
    P[nm] = function (e, target, ...r) {
      const ok = fin3(target);
      const out = f0.call(this, e, target, ...r);
      if (e === this.player && ok && !fin3(target)) nanNote(nm);
      if (nm === 'bfMove' && e === this.player && !Number.isFinite(out)) nanNote('bfMove acc');
      return out;
    };
  }
  let mvPatched = false;
  const patchMove = (p) => {
    if (mvPatched || !p) return;
    mvPatched = true;
    const MP = Object.getPrototypeOf(p);
    const sp = MP.statusPull;
    if (sp)
      MP.statusPull = function (target, ...r) {
        const ok = fin3(target);
        const out = sp.call(this, target, ...r);
        if (this === g.player && ok && !fin3(target))
          nanNote('statusPull ' + Object.keys(this.sts || {}).join(','));
        return out;
      };
    const mv = MP.move;
    MP.move = function (dt, wish, ...r) {
      if (this === g.player && wish && !fin3(wish)) nanNote('move 收到的 wish');
      if (this === g.player && !Number.isFinite(dt)) nanNote('move 收到的 dt');
      if (this === g.player && !Number.isFinite(this.stats.speed)) nanNote('stats.speed');
      return mv.call(this, dt, wish, ...r);
    };
  };
  const nanWatch = () => {
    trap(g.player);
    patchMove(g.player);
    if (window.__nanAt) return;
    const p = g.player,
      cam = g.camera,
      S = window.__sfx;
    const bad = [];
    if (p && !fin(p.pos)) bad.push('player.pos');
    if (p && p.vel && !fin(p.vel)) bad.push('player.vel');
    if (cam && !fin(cam.position)) bad.push('camera');
    if (S && S.lpos && !fin(S.lpos)) bad.push('sfx.lpos');
    for (const e of g.enemies || [])
      if (!e.dead && !fin(e.pos)) bad.push('enemy:' + (e.etype || e.ai) + ':' + (e.name || ''));
    const snap = {
      t: +B.segT.toFixed(2),
      st: g.state,
      pos: p && [p.pos.x, p.pos.y, p.pos.z].map((x) => +x.toFixed(2)),
      vel: p && p.vel && [p.vel.x, p.vel.y, p.vel.z].map((x) => +x.toFixed(2)),
      why: B.why,
      tp: B.tp,
      hover: p && p.hoverMode,
      h: p && p.model && p.model.height,
      sts: p && p.sts ? Object.keys(p.sts).join(',') : '',
      foc: g.camFocus && g.camFocus !== p ? g.camFocus.etype || g.camFocus.ai || 'ent' : '',
      ground: p && p.onGround,
      dt: g.pumpDt || g.lastDt,
    };
    ring.push(snap);
    if (ring.length > 12) ring.shift();
    if (bad.length) {
      window.__nanAt = {
        stack: window.__nanStack,
        fn: window.__nanFn,
        enemyNaN: window.__enemyNaN,
        wishNaN: window.__wishNaN,
        bad: bad.slice(0, 8),
        ring: ring.slice(),
        seg: g.camp && g.camp.seg,
        theme: g.world && g.world.themeKey,
      };
      B.log.push({ nanAt: window.__nanAt });
    }
  };
}

// 強制清除（逾時）：擊破全部、資料終端與車隊算完成、突破區段開出口
function botForce() {
  const g = window.__game,
    B = window.__bot,
    c = g.camp;
  B.forced = true;
  window.__botFlag = 'forced';
  if (!c || !c.ss) return;
  const ss = c.ss;
  if (ss.intel) ss.intel.done = true;
  if (ss.pad) ss.pad.used = true;
  for (const a of ss.convoy || []) a.arrived = true;
  for (const q of g.encGroups || []) q.pend = null;
  g.guardPend = [];
  g.spawnQ = [];
  g.waves = [];
  g.wavePend = null;
  // 一般的大傷害（1e12 這種數字會讓音量、風格評價變成無限大）
  for (const e of g.enemies) {
    if (e.dead || e.team === 'player') continue;
    const c0 = e.center();
    if (!Number.isFinite(c0.x + c0.y + c0.z) || !Number.isFinite(e.hp)) {
      // 位置或 AP 不是有限值：遊戲本身的 bug，記下來（不要在這裡擋掉，報告裡要看得到）
      const B = window.__bot;
      if (B)
        B.log.push({ nan: [e.etype || e.ai, e.name, e.vehKey, e.hp, e.pos.x, e.pos.y, e.pos.z].join(' ') });
      window.__nanEnt = window.__nanEnt || [];
      window.__nanEnt.push({
        ai: e.ai,
        et: e.etype,
        name: e.name,
        vk: e.vehKey,
        hp: e.hp,
        pos: [e.pos.x, e.pos.y, e.pos.z],
      });
      continue;
    }
    e.takeDamage(Math.max(1, e.hp) * 4 + 1000, 0, g.player, c0);
  }
  if (!c.exits.length && ss.brk) {
    c.cleared = true;
    g.campSpawnExits();
  }
  // 主線擴充的新區段類型（game/seg-ops.js、seg-colossus.js）：撤離直接裝載完成、戰線與大型兵器算完成
  if (ss.ext && ss.ext.ph < 3) g.segExtractDone();
  if (ss.front && !ss.front.done) {
    ss.front.done = true;
    g.campCleared();
  }
  if (ss.col && !ss.col.done) {
    ss.col.done = true;
    g.campCleared();
  }
}

// 這一段的統計與卡頓（頁面裡算，只回傳摘要）
function segSum(o) {
  const W = window.__prof,
    g = window.__game;
  const fr = W.frames;
  const t00 = o.t0;
  const sh = window.__sh.filter((x) => x.t >= t00);
  const lt = window.__lt.filter((x) => x.t >= t00);
  const q = (a, p) => (a.length ? +a[Math.min(a.length - 1, Math.floor(a.length * p))].toFixed(1) : 0);
  // 「戰場準備中」結束的那一格（之後才是玩家看得到的遊戲；進場的 3 秒從這裡算）
  let pi = -1;
  for (let i = 0; i < fr.length; i++) if (fr[i].prep) pi = i;
  const tGo = pi >= 0 && fr[pi + 1] ? fr[pi + 1].t0 : o.tPlay;
  const prepMs = Math.round(tGo - o.tPlay);
  const play = fr.filter((r) => r.st === 'play' && !r.bot && !r.prep);
  const steady = play.filter((r) => r.t0 - tGo >= 3000);
  const ms = steady.map((r) => r.ms).sort((a, b) => a - b);
  const gaps = steady.map((r) => r.gap).sort((a, b) => a - b);
  const avg = (a, k) => (a.length ? +(a.reduce((s, r) => s + (r[k] || 0), 0) / a.length).toFixed(1) : 0);
  const sec = {};
  for (const r of steady) for (const k in r.sec) sec[k] = (sec[k] || 0) + r.sec[k];
  for (const k in sec) sec[k] = +(sec[k] / Math.max(1, steady.length)).toFixed(2);
  // 卡頓：兩格間隔超過門檻（玩家感覺到的停頓）
  const hitches = [];
  for (let i = 1; i < fr.length; i++) {
    const r = fr[i];
    if (r.st !== 'play' || r.gap < o.hitch || r.bot || fr[i - 1].bot || r.prep || fr[i - 1].prep) continue;
    const prev = fr[i - 1];
    const w0 = prev.t0,
      w1 = r.t0 + r.ms;
    const links = sh.filter((x) => x.t >= w0 && x.t <= w1);
    const lts = lt.filter((x) => x.t + x.d >= w0 && x.t <= w1);
    const ev = W.ev.filter((e) => e.f === i && e.tag[0] === '!').map((e) => e.tag.slice(1) + ' ' + e.ms);
    // 上一格的主迴圈＋這一格以前、迴圈以外的時間
    const outside = r.gap - prev.ms;
    const secs = Object.entries(prev.sec)
      .filter(([, v]) => v >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => k + ' ' + v.toFixed(0));
    const secsNow = Object.entries(r.sec)
      .filter(([, v]) => v >= 3)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => k + ' ' + v.toFixed(0));
    const linkMs = links.reduce((s, x) => s + x.ms, 0);
    // 原因的歸類（間隔是「上一格的主迴圈＋迴圈外」，這一格自己的耗時算到下一個間隔）
    let cause;
    const evPrev = W.ev.filter((e) => e.f === i - 1 && e.tag[0] === '!');
    if (linkMs >= 15) cause = '著色器編譯';
    else if (prev.gc >= 4 || r.gc >= 4) cause = 'GC';
    else if (evPrev.length && evPrev.some((e) => e.ms >= 8)) {
      const e = evPrev.slice().sort((a, b) => b.ms - a.ms)[0];
      cause = '事件:' + e.tag.slice(1);
    } else if (prev.ms >= o.hitch * 0.6) cause = '主迴圈:' + (secs[0] ? secs[0].split(' ')[0] : '其他');
    else if (outside >= o.hitch * 0.6) cause = lts.length ? '迴圈外的長任務' : '迴圈外（顯示卡／瀏覽器）';
    else cause = '混合';
    hitches.push({
      t: +((r.t0 - tGo) / 1000).toFixed(1),
      gap: +r.gap.toFixed(0),
      loop: +prev.ms.toFixed(0),
      out: +outside.toFixed(0),
      cause,
      sec: secs,
      secNext: secsNow,
      ev: [...evPrev.map((e) => e.tag.slice(1) + ' ' + e.ms), ...ev],
      sh: links.length
        ? `${links.length} 個 ${linkMs} ms（${[...new Set(links.map((x) => x.name))].slice(0, 3).join('、')}）`
        : '',
      lt: lts.map((x) => Math.round(x.d)).join(','),
      prog: prev.prog + r.prog,
      geo: prev.geo,
      gc: prev.gc || r.gc,
      en: r.en,
      calls: r.calls,
      open: r.t0 - tGo < 3000,
    });
  }
  const cam = g.camp || {};
  const ss = cam.ss || {};
  const W2 = g.world || {};
  const out = {
    prep: prepMs,
    frames: play.length,
    secs: +((fr.length ? fr[fr.length - 1].t0 - o.tPlay : 0) / 1000).toFixed(1),
    cpu: { p50: q(ms, 0.5), p90: q(ms, 0.9), p99: q(ms, 0.99), max: q(ms, 1) },
    gap: { p50: q(gaps, 0.5), p90: q(gaps, 0.9), p99: q(gaps, 0.99), max: q(gaps, 1) },
    calls: avg(steady, 'calls'),
    tris: Math.round(avg(steady, 'tris')),
    en: avg(steady, 'en'),
    enMax: steady.reduce((m, r) => Math.max(m, r.en || 0), 0),
    sec,
    hitch: hitches.filter((h) => !h.open).length,
    hitchOpen: hitches.filter((h) => h.open).length,
    hitches,
    shPlay: {
      n: sh.filter((x) => x.st === 'play').length,
      ms: sh.filter((x) => x.st === 'play').reduce((s, x) => s + x.ms, 0),
    },
    variant: W2.variantKey || (W2.opt && W2.opt.variant) || '',
    landmark: (W2.landmark && W2.landmark.name) || '',
    zone: W2.zoneShape || '',
    size: W2.size,
    props: (W2.props || []).length,
    type: ss.type,
    bot: {
      tp: window.__bot.tp,
      forced: window.__bot.forced,
      log: window.__bot.log.slice(-20),
      nanAt: window.__nanAt,
    },
  };
  // 下一段重新記錄
  W.frames.length = 0;
  W.ev.length = 0;
  W.nb.length = 0;
  return out;
}

async function runSortie(browser, sid, done, seen) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH } });
  const page = await ctx.newPage();
  const errs = [];
  let res = null;
  // 同樣的錯誤只記一次（次數、第一次的呼叫堆疊、第幾段）
  page.on('pageerror', (e) => {
    const m = String(e.message);
    let x = errs.find((y) => y.m === m);
    if (!x)
      errs.push(
        (x = { m, n: 0, seg: res ? res.segs.length + 1 : 0, stack: String(e.stack || '').slice(0, 1500) }),
      );
    x.n++;
  });
  await page.addInitScript(initScript);
  await page.addInitScript(() => (window.__warmAsync = true));
  const LEARN = path.join(OUTD, 'warm.json');
  if (args.learn && fs.existsSync(LEARN))
    await page.addInitScript(
      (s) => localStorage.setItem('mech_cordon_shader_warm2', s),
      fs.readFileSync(LEARN, 'utf8'),
    );
  res = { sid, segs: [], errs };
  try {
    await page.goto(require('url').pathToFileURL(path.join(DIST, 'mech-cordon.html')).href + '?test');
    await page.waitForFunction(() => window.__game, null, { timeout: 60000 });
    await sleep(1500);
    await page.click('#btnSaves');
    await page.click('#saveSlots [data-slot="1"] [data-act="new"]');
    await page.waitForFunction(() => window.__game.state === 'garage', null, { timeout: 30000 });
    await sleep(2000);
    await page.evaluate(instrument);
    await page.evaluate(botInstall, { dmg: DMG, seen });
    const nSeg = await page.evaluate((sid) => {
      const g = window.__game;
      window.__reseed(4242);
      g.encLazy = true; // 和玩家的瀏覽器相同（?test 時預設關掉）
      g.autoPickMod = true; // 三選一、抉擇說明卡不擋住流程
      g.save.level = Math.max(g.save.level || 1, 12);
      window.__prof.on = true;
      g.campBegin(sid);
      return g.camp ? g.campSortie().segs.length : 0;
    }, sid);
    for (let seg = 0; seg < nSeg; seg++) {
      // 轉場畫面：等一下再「直接出擊」
      await page.waitForFunction(() => window.__game.state === 'camptrans', null, { timeout: 60000 });
      await sleep(1200);
      const go = await page.evaluate(() => {
        const g = window.__game,
          B = window.__bot;
        Object.assign(B, { on: false, segT: 0, tp: 0, forced: false, exit: null, tgt: null, log: [] });
        window.__botFlag = 0;
        window.__prof.frames.length = 0;
        window.__prof.ev.length = 0;
        const t0 = performance.now();
        g.campGo();
        return { t0, sync: Math.round(performance.now() - t0) };
      });
      await page.waitForFunction(() => window.__game.state === 'play' && window.__game.player, null, {
        timeout: 120000,
      });
      // 預熱（warmBusy）結束、第一格畫出來
      await page.waitForFunction(
        () => !window.__game.warmBusy && window.__prof.frames.some((r) => r.st === 'play'),
        null,
        {
          timeout: 120000,
        },
      );
      const meta = await page.evaluate(() => {
        const g = window.__game;
        const f = window.__prof.frames.find((r) => r.st === 'play');
        window.__bot.on = true;
        const so = g.campSortie();
        return {
          tPlay: f.t0,
          theme: so.segs[g.camp.seg].theme,
          type: g.campSegType(),
          name: g.campSegName(),
          boss: !!g.isBossLevel,
        };
      });
      const tStart = Date.now();
      let state = 'play',
        forcedAt = 0;
      for (;;) {
        await sleep(500);
        state = await page.evaluate(() => window.__game.state);
        if (state !== 'play' && state !== 'modpick' && state !== 'leaving') break;
        const el = (Date.now() - tStart) / 1000;
        if (el > SEG_SECS && !forcedAt) {
          forcedAt = el;
          await page.evaluate(botForce);
        }
        if (forcedAt && el > forcedAt + 40) {
          // 走不到出口：直接站進去
          await page.evaluate(() => {
            const g = window.__game,
              c = g.camp;
            if (c && c.exits && c.exits.length) {
              const e = c.exits[window.__bot.exit || 0] || c.exits[0];
              g.player.pos.set(e.pos.x, e.pos.y + 0.5, e.pos.z);
            } else if (c && !c.cleared) g.campCleared();
          });
        }
        if (forcedAt && el > forcedAt + 80) break;
      }
      const s = await page.evaluate(segSum, { t0: go.t0, tPlay: meta.tPlay, hitch: HITCH });
      const row = { seg, ...meta, sync: go.sync, warm: Math.round(meta.tPlay - go.t0), end: state, ...s };
      seen[row.type] = (seen[row.type] || 0) + 1;
      await page.evaluate((s) => (window.__bot.seen = s), seen);
      res.segs.push(row);
      console.log(
        `  ${sid} 段 ${seg + 1}/${nSeg} ${meta.theme} ${row.variant || ''} ${meta.type}${meta.boss ? '(Boss)' : ''}：` +
          `進場 ${row.sync}+${row.prep} ms、${row.secs} 秒、主迴圈 p50 ${row.cpu.p50} p99 ${row.cpu.p99}、` +
          `間隔 p99 ${row.gap.p99} 最長 ${row.gap.max}、卡頓 ${row.hitch}（進場 ${row.hitchOpen}）、繪製 ${row.calls}、敵 ${row.en}/${row.enMax}` +
          (row.bot.forced ? '、逾時強制清除' : '') +
          (row.bot.tp ? `、脫困瞬移 ${row.bot.tp}` : ''),
      );
      if (state === 'ending' || state === 'result' || state === 'epilogue' || state === 'story') break;
      if (state !== 'camptrans') {
        console.log(`  ${sid}：段 ${seg + 1} 結束在 ${state}，這個出擊停在這裡`);
        res.stop = state;
        break;
      }
    }
    const learned = await page.evaluate(() => localStorage.getItem('mech_cordon_shader_warm2'));
    if (learned && args.learn) fs.writeFileSync(LEARN, learned);
  } catch (e) {
    res.error = String(e && e.message);
    console.log(`  ${sid}：${res.error}`);
  } finally {
    await ctx.close();
  }
  done[sid] = res;
}

// ---------- 報告 ----------
function report(all) {
  const L = [];
  const segs = Object.values(all).flatMap((r) => r.segs.map((s) => ({ sid: r.sid, ...s })));
  L.push(`# 主線各區段的卡頓量測（${TAG}）`, '');
  L.push(
    `門檻：兩格間隔 ≥ ${HITCH} ms 算一次卡頓；「進場」＝「戰場準備中」結束後 3 秒內（準備畫面中的停頓不算卡頓，另記在「進場」欄的預熱）。自動操作的傷害 ×${DMG}、一段最多 ${SEG_SECS} 秒。`,
    '',
  );
  // 原因的總計
  const by = {};
  for (const s of segs)
    for (const h of s.hitches) {
      const k = (h.open ? '進場・' : '') + h.cause;
      const b = (by[k] = by[k] || { n: 0, ms: 0, worst: 0, at: '' });
      b.n++;
      b.ms += h.gap - 16.7;
      if (h.gap > b.worst) {
        b.worst = h.gap;
        b.at = `${s.sid} 段${s.seg + 1}（${s.theme} ${s.type}）`;
      }
    }
  L.push(
    '## 卡頓原因的總計',
    '',
    '| 原因 | 次數 | 多出的時間合計 | 最長 | 最長的位置 |',
    '|---|---|---|---|---|',
  );
  for (const [k, b] of Object.entries(by).sort((a, b) => b[1].ms - a[1].ms))
    L.push(`| ${k} | ${b.n} | ${(b.ms / 1000).toFixed(1)} s | ${b.worst} ms | ${b.at} |`);
  // 主迴圈的事件與各段：哪個方法最常出現在卡頓裡
  const tags = {};
  for (const s of segs)
    for (const h of s.hitches)
      for (const x of [...h.ev, ...h.sec]) {
        const k = x.replace(/ [\d.]+$/, '');
        const v = +(/ ([\d.]+)$/.exec(x) || [0, 0])[1];
        const t = (tags[k] = tags[k] || { n: 0, ms: 0, max: 0 });
        t.n++;
        t.ms += v;
        t.max = Math.max(t.max, v);
      }
  L.push(
    '',
    '## 卡頓裡出現的方法與事件（上一格的主迴圈）',
    '',
    '| 名稱 | 出現次數 | 合計 | 最長 |',
    '|---|---|---|---|',
  );
  for (const [k, t] of Object.entries(tags)
    .sort((a, b) => b[1].ms - a[1].ms)
    .slice(0, 40))
    L.push(`| ${k} | ${t.n} | ${Math.round(t.ms)} ms | ${Math.round(t.max)} ms |`);
  // 主題的平時負擔
  const th = {};
  for (const s of segs) {
    const t = (th[s.theme] = th[s.theme] || { n: 0, cpu: 0, gap: 0, calls: 0, en: 0, hit: 0, secs: 0 });
    t.n++;
    t.cpu += s.cpu.p50;
    t.gap += s.gap.p50;
    t.calls += s.calls;
    t.en += s.en;
    t.hit += s.hitch;
    t.secs += s.secs;
  }
  L.push(
    '',
    '## 各主題的平時負擔（每段的中位數平均）',
    '',
    '| 主題 | 段數 | 主迴圈 p50 | 間隔 p50 | 繪製次數 | 在場敵人 | 卡頓／分鐘 |',
    '|---|---|---|---|---|---|---|',
  );
  for (const [k, t] of Object.entries(th).sort((a, b) => b[1].cpu / b[1].n - a[1].cpu / a[1].n))
    L.push(
      `| ${k} | ${t.n} | ${(t.cpu / t.n).toFixed(1)} | ${(t.gap / t.n).toFixed(1)} | ${Math.round(t.calls / t.n)} | ${(t.en / t.n).toFixed(1)} | ${((t.hit / Math.max(1, t.secs)) * 60).toFixed(1)} |`,
    );
  // 每一段
  L.push(
    '',
    '## 每一段',
    '',
    '| 出擊 | 段 | 主題／變體 | 類型 | 進場（同步＋準備畫面） | 秒 | 主迴圈 p50／p99 | 間隔 p99／最長 | 卡頓（進場） | 繪製 | 敵（最多） | 各段平均前三 | 備註 |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  );
  for (const s of segs) {
    const top = Object.entries(s.sec)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k} ${v}`)
      .join('、');
    const note = [s.bot.forced && '逾時', s.bot.tp && `瞬移 ${s.bot.tp}`, s.landmark]
      .filter(Boolean)
      .join('、');
    L.push(
      `| ${s.sid} | ${s.seg + 1} | ${s.theme} ${s.variant || ''} | ${s.type}${s.boss ? '(Boss)' : ''} | ${s.sync}＋${s.prep !== undefined ? s.prep : s.warm - s.sync} ms | ${s.secs} | ${s.cpu.p50}／${s.cpu.p99} | ${s.gap.p99}／${s.gap.max} | ${s.hitch}（${s.hitchOpen}） | ${s.calls} | ${s.en}（${s.enMax}） | ${top} | ${note} |`,
    );
  }
  // 最長的卡頓
  const worst = segs
    .flatMap((s) => s.hitches.map((h) => ({ s, h })))
    .sort((a, b) => b.h.gap - a.h.gap)
    .slice(0, 60);
  L.push('', '## 最長的 60 次卡頓', '');
  for (const { s, h } of worst)
    L.push(
      `- **${h.gap} ms** ${s.sid} 段${s.seg + 1}（${s.theme} ${s.type}）${h.t} 秒${h.open ? '（進場）' : ''}：${h.cause}；主迴圈 ${h.loop}、迴圈外 ${h.out}` +
        (h.sec.length ? `；${h.sec.join('、')}` : '') +
        (h.ev.length ? `；事件 ${h.ev.join('、')}` : '') +
        (h.sh ? `；著色器 ${h.sh}` : '') +
        (h.lt ? `；長任務 ${h.lt}` : '') +
        (h.gc ? `；GC ${h.gc} MB` : '') +
        `；程式 +${h.prog}、幾何 ${h.geo >= 0 ? '+' : ''}${h.geo}、敵 ${h.en}、繪製 ${h.calls}`,
    );
  const errs = Object.values(all).flatMap((r) => [
    ...(r.errs || []).map((e) =>
      typeof e === 'string'
        ? `${r.sid}：${e}`
        : `${r.sid} 段 ${e.seg}：${e.m}（${e.n} 次）\n\n    ` + e.stack.split('\n').join('\n    '),
    ),
    r.error && `${r.sid}：${r.error}`,
  ]);
  if (errs.filter(Boolean).length)
    L.push('', '## 頁面錯誤', '', ...errs.filter(Boolean).map((e) => '- ' + e));
  return L.join('\n') + '\n';
}

(async () => {
  const { SORTIES } = await import(
    require('url').pathToFileURL(path.join(ROOT, 'src/data/campaign.js')).href
  );
  let ids = Object.keys(SORTIES).filter((k) => args.all || !SORTIES[k].cycle);
  if (args.ch) ids = ids.filter((k) => String(SORTIES[k].chapter) === String(args.ch));
  if (args.only) ids = String(args.only).split(',');
  fs.mkdirSync(OUTD, { recursive: true });
  const JF = path.join(OUTD, `${TAG}.json`);
  const all = args.resume && fs.existsSync(JF) ? JSON.parse(fs.readFileSync(JF, 'utf8')) : {};
  const seen = {};
  const browser = await launch();
  try {
    for (const sid of ids) {
      if (all[sid] && !all[sid].error) continue;
      console.log(`== ${sid} ${SORTIES[sid].name}`);
      await runSortie(browser, sid, all, seen);
      fs.writeFileSync(JF, JSON.stringify(all, null, 1));
      fs.writeFileSync(path.join(OUTD, `${TAG}.md`), report(all));
    }
  } finally {
    await browser.close();
  }
  console.log(`\n報告：${path.join(OUTD, TAG + '.md')}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
