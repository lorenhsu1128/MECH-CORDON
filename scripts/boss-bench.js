// Boss 的難度量測（docs/boss-design.md 第 8 節「Boss 變難（不堆血量）」的第 0 期）：
// 自動操作的玩家用幾套配裝打代表性的 Boss（模擬器的 Boss 模擬戰：模擬訓練場、開闊的地圖），
// 記下擊破時間、承受的傷害、回復、陣亡次數（不會真的被擊破：AP 歸零就記一次並補滿）、
// 各型態停留的時間（被跳過的型態）、Boss 失衡的次數。主迴圈停住、以固定 dt 推進、不算繪，所以結果和電腦快慢無關。
//
//   node scripts/boss-bench.js                          全部 28 隻 Boss × 全部配裝（約 1 小時）
//   node scripts/boss-bench.js --boss=artillery,spider  只跑這幾隻（BOSSES 的 kind）
//   node scripts/boss-bench.js --boss=core              只跑每個刁鑽度一隻的代表（core，約 15 分鐘）
//   node scripts/boss-bench.js --build=old,max --tag=now --cap=420
//
// 配裝（BUILDS）：new＝剛開始（白裝、駕駛員 1 級、沒有模組）；old＝改版前的上限（白裝、駕駛員 35 級的 34 點、
// 6 個一般模組 2 級）；max＝現在的上限（全金零件＋調校、駕駛員 45 級含極致技能、一般模組 3 級＋2 個傳說）。
// 組裝一律相同（BENCH_ASM），只比較成長系統。自動操作的玩家：保持 30～55 m 繞圈、每 1.5～3 秒 QB、偶爾跳躍、
// 四把武器一直開火、AP 低於 35% 用修復套件；不會躲預警（所以承受的傷害偏多，用來比較配裝之間的差距）。
// 結果：test-results/boss-bench/<tag>.json 與 <tag>.md。需要先 npm run build。
/* global window, THREE, localStorage */
const path = require('path');
const fs = require('fs');
const { launch } = require('./perf-lib');

const ROOT = path.join(__dirname, '..');
const OUTD = path.join(ROOT, 'test-results', 'boss-bench');
const args = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) args[m[1]] = m[2] === undefined ? true : m[2];
}
const TAG = args.tag || 'now';
const CAP = +(args.cap || 480); // 一場最多幾秒（遊戲時間；狂暴在 360 秒）
const DIST = args.dist ? path.resolve(args.dist) : path.join(ROOT, 'dist');

// 全部的 Boss：kind（沒有 kind 的用名稱開頭，模擬器 simStart 也認得）、刁鑽度（主線第一次出現的章；
// 只在第 2 周目委託出現的＝章＋1）、等級（主線那一段的大約等級：出擊的 level＋2～3）、core＝各刁鑽度的代表
const BOSSES = [
  { kind: 'artillery', tier: 1, L: 5, core: 1 },
  { kind: 'worm', tier: 1, L: 5 },
  { kind: 'JUGGERNAUT', tier: 2, L: 6 },
  { kind: 'railgun', tier: 2, L: 7, core: 1 },
  { kind: 'heli', tier: 2, L: 7 },
  { kind: 'rampart', tier: 2, L: 8 },
  { kind: 'train', tier: 2, L: 8 },
  { kind: 'furnace', tier: 3, L: 9 },
  { kind: 'STRIDER', tier: 3, L: 10 },
  { kind: 'phantom', tier: 3, L: 11, core: 1 },
  { kind: 'ibis', tier: 3, L: 11 },
  { kind: 'spider', tier: 4, L: 13, core: 1 },
  { kind: 'trinity', tier: 4, L: 14 },
  { kind: 'hunter', tier: 4, L: 14 },
  { kind: 'orbital', tier: 4, L: 15 },
  { kind: 'flagship', tier: 5, L: 16, core: 1 },
  { kind: 'fortress', tier: 5, L: 17 },
  { kind: 'interceptor', tier: 5, L: 17 },
  { kind: 'duo', tier: 5, L: 18 },
  { kind: 'funnel', tier: 6, L: 19, core: 1 },
  { kind: 'mirror', tier: 6, L: 20 },
  { kind: 'BALTEUS', tier: 6, L: 21 },
  { kind: 'anvil', tier: 7, L: 21, core: 1 },
  { kind: 'salamander', tier: 7, L: 22 },
  { kind: 'gantry', tier: 7, L: 23 },
  { kind: 'deckgun', tier: 8, L: 24 },
  { kind: 'reactor', tier: 8, L: 25 },
  { kind: 'sovereign', tier: 8, L: 26, core: 1 },
];
const BUILDS = ['new', 'old', 'max'];
const pickB = !args.boss
  ? BOSSES
  : args.boss === 'core'
    ? BOSSES.filter((b) => b.core)
    : BOSSES.filter((b) => args.boss.split(',').includes(b.kind));
if (!pickB.length) throw new Error('--boss 沒有符合的 Boss（BOSSES 的 kind 或 core）');
const pickC = args.build ? args.build.split(',') : BUILDS;

const BENCH_ASM = {
  c1: 'cs_none',
  c2: 'cs_none',
  head: 'h_std',
  core: 'c_std',
  arms: 'a_std',
  legs: 'l_bp',
  booster: 'b_std',
  generator: 'g_std',
  fcs: 'f_std',
  rarm: 'w_rifle',
  larm: 'w_lr',
  rback: 'bw_ms',
  lback: 'bw_gr',
};

// ---------- 頁面裡：配裝 ----------
function setupBuild(o) {
  const g = window.__game,
    S = g.save,
    G = window.__gear,
    TD = window.__tune,
    SK = window.__skills,
    MD = window.__mods;
  window.__reseed(777);
  S.asm = { ...o.asm };
  for (const k of Object.values(S.asm)) if (!S.owned.includes(k)) S.owned.push(k);
  S.level = o.L;
  S.inv = [];
  S.eq = {};
  S.tune = {};
  const P = S.pilot.pve;
  // 配點：依分支順序，一層一層點到滿，點數用完為止（駕駛員 lv 級＝lv−1 點；ult＝第 4 層也點）
  const pts0 = o.lv - 1;
  P.xp = 1e8; // 等級由 levelOf(xp) 推算：給足，配點本身受 pts 限制
  P.skills = {};
  let pts = pts0;
  for (const br of o.branches) {
    for (const tier of [1, 2, 3, 4]) {
      if (tier === 4 && !o.ult) continue;
      for (const s of SK.SKILLS.filter((x) => x.br === br && x.tier === tier)) {
        const n = Math.min(s.max, pts);
        if (n > 0) P.skills[s.id] = n;
        pts -= n;
      }
    }
  }
  window.__benchPilotPts = pts0 - pts;
  // 零件品級：每個槽位一件 q 級（同一個種子；金色的極品詞條照機率）＋調校
  if (o.q > 0) {
    const rng = Math.random;
    for (const [slot, id] of Object.entries(S.asm)) {
      if (!id || !G.GEAR_CAT.has(id)) continue;
      const it = G.rollGear(id, o.q, rng);
      if (!it) continue;
      if (o.tune) {
        const part = Object.values(window.__PARTS)
          .flat()
          .find((p) => p && p.id === id);
        const grp = TD.tuneGroup(G.GEAR_CAT.get(id), part);
        const opts = grp ? TD.TUNE[grp] : [];
        if (opts.length) {
          it.t = { [opts[0].k]: 3 };
          if (opts[1]) it.t[opts[1].k] = 2;
        }
      }
      S.inv.push(it);
      S.eq[slot] = it.u;
    }
  }
  // 模組：駕駛員加成之外再加（模擬器沒有主線的模組）
  const mods = o.mods || [];
  const mp = MD.modsPm(mods);
  if (!g.__benchPlm) g.__benchPlm = g.pilotLocalMods;
  const base = g.__benchPlm;
  g.pilotLocalMods = function (mode) {
    const pm = { ...(base.call(this, mode) || { pf: {} }) };
    if (mode === 'pve') for (const k in mp) pm[k] = (pm[k] || 0) + mp[k];
    return pm;
  };
  return { pts: window.__benchPilotPts, inv: S.inv.length };
}

// ---------- 頁面裡：一場 Boss 戰 ----------
function runFight(o) {
  const g = window.__game;
  window.__reseed(4242 + o.seed);
  g.autoPickMod = true;
  g.bossAfAuto = !o.noAf; // 依戰力的 Boss 詞綴（模擬器平常不帶）
  g.simSeen = () => ({ bossT: { [o.kind]: o.tier } });
  g.simStart('boss', o.kind);
  const p = g.player;
  const bosses = g.bosses.slice();
  if (!bosses.length) return { err: '沒有生成 Boss' };
  const st = {
    deaths: 0,
    taken: 0,
    healed: 0,
    kits: 0,
    stag: 0,
    ph: {},
    t: 0,
    dealt: 0,
    adds: 0,
    maxHp: p.maxHp,
    bossHp: bosses.reduce((a, b) => a + b.maxHp, 0),
  };
  // 不會真的被擊破
  p.die = function () {
    st.deaths++;
    this.hp = this.maxHp;
    this.iFrames = 2;
  };
  const MP = Object.getPrototypeOf(p);
  if (!MP.__benchTd) {
    MP.__benchTd = MP.takeDamage;
    MP.takeDamage = function (dmg, ...r) {
      const B = window.__bench;
      const h = this.hp;
      const out = MP.__benchTd.call(this, dmg, ...r);
      if (B && B.on) {
        if (this === g.player) {
          if (this.hp < h) B.st.taken += h - this.hp;
        } else if (this.isBoss || (this.opts && this.opts.parent !== undefined)) {
          if (r[1] === g.player || (r[1] && r[1].owner === g.player))
            B.st.dealt += Math.max(0, h - Math.max(0, this.hp));
        }
      }
      return out;
    };
  }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const B = (window.__bench = { on: true, st, qbT: 1, jumpT: 6, dir: 1, flipT: 4, lastHp: p.hp, kitT: 0 });
  const live = () => bosses.filter((b) => !b.dead);
  const dt = 1 / 60;
  let stagPrev = new Map();
  g.renderMain = () => {};
  let bossHp0 = 0,
    stall = 0,
    alt = 0;
  for (let t = 0; t < o.cap; t += dt) {
    const L = live();
    if (!L.length) break;
    // 自動操作：打 Boss；Boss 4 秒沒掉 AP（護盾、無敵、裝甲殼）就改打部位與雜兵 6 秒
    const bh = L.reduce((a, b) => a + b.hp, 0);
    if (bh < bossHp0 - 1) stall = 0;
    else stall += dt;
    bossHp0 = bh;
    if (stall > 4 && alt <= 0) alt = 6;
    alt -= dt;
    let tgt = null,
      bd = Infinity;
    for (const e of g.enemies) {
      if (e.dead || e.decoy || e.noLock) continue;
      let d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      if (e.isBoss) d *= alt > 0 ? 4 : 0.6;
      if (d < bd) {
        bd = d;
        tgt = e;
      }
    }
    const V = {};
    if (tgt) {
      const dx = tgt.pos.x - p.pos.x,
        dz = tgt.pos.z - p.pos.z,
        d = Math.hypot(dx, dz) || 1;
      const fw = V3(dx / d, 0, dz / d),
        side = V3(-fw.z, 0, fw.x).multiplyScalar(B.dir);
      let wish = side.clone();
      if (d > 55) wish.add(fw.clone().multiplyScalar(1.2));
      else if (d < 30) wish.add(fw.clone().multiplyScalar(-1.2));
      // 作戰區域邊緣：往中心
      const z = g.world.zone || [-50, 50, -50, 50];
      const cx = (z[0] + z[1]) / 2,
        cz = (z[2] + z[3]) / 2;
      if (Math.abs(p.pos.x - cx) > (z[1] - z[0]) * 0.4 || Math.abs(p.pos.z - cz) > (z[3] - z[2]) * 0.4)
        wish.add(
          V3(cx - p.pos.x, 0, cz - p.pos.z)
            .normalize()
            .multiplyScalar(1.5),
        );
      wish.normalize();
      V.wish = wish;
      V.fireR = V.fireL = V.backR = V.backL = d < 160;
      if (!p.lock || p.lock.dead) p.lock = tgt;
    }
    B.flipT -= dt;
    if (B.flipT <= 0) {
      B.flipT = 3 + Math.random() * 3;
      B.dir = -B.dir;
    }
    B.qbT -= dt;
    if (B.qbT <= 0) {
      B.qbT = 1.5 + Math.random() * 1.5;
      V.qb = true;
    }
    B.jumpT -= dt;
    if (B.jumpT <= 0) {
      if (B.jumpT < -0.6) B.jumpT = 6 + Math.random() * 4;
      V.jump = true;
    }
    g.tutVirt = V;
    B.kitT -= dt;
    if (p.hp < p.maxHp * 0.35 && p.kits > 0 && B.kitT <= 0) {
      g.useKit();
      st.kits++;
      B.kitT = 2;
    }
    // 回復（不含陣亡補滿：die 之後 lastHp 重設）
    const h0 = p.hp;
    g.pumpDt = dt;
    g.lastT = performance.now() - dt * 1000;
    g.loop();
    g.pumpDt = 0;
    if (g.state !== 'play') break;
    st.t = t + dt;
    void h0;
    // 各型態停留的時間、失衡
    for (const b of L) {
      const ph = b.dead ? 0 : b.bossPhase();
      st.ph[ph] = (st.ph[ph] || 0) + dt;
      const s = b.staggerT > 0;
      if (s && !stagPrev.get(b)) st.stag++;
      stagPrev.set(b, s);
    }
  }
  st.af = bosses[0].af || 0;
  st.name = bosses[0].name; // 實際生成的 Boss（確認模擬器叫出的是這一隻）
  st.kills = bosses.filter((b) => b.dead).length;
  st.bossLeft = live().reduce((a, b) => a + Math.max(0, b.hp), 0) / st.bossHp;
  B.on = false;
  g.tutVirt = null;
  // 回復＝承受的傷害－AP 的淨變化（陣亡補滿另外算）
  st.healed = Math.max(0, st.taken - (st.maxHp - p.hp) - st.deaths * st.maxHp);
  st.adds = g.enemies.filter((e) => e.dead && !e.isBoss && !(e.opts && e.opts.parent !== undefined)).length;
  if (g.simEnd) g.simEnd(false);
  g.clearMission();
  g.state = 'title';
  return st;
}

const buildDefs = (L) => ({
  new: { asm: BENCH_ASM, L, lv: 1, branches: [], ult: false, q: 0, mods: [] },
  old: {
    asm: BENCH_ASM,
    L,
    lv: 35,
    branches: ['gun', 'armor', 'en', 'mob', 'sup', 'melee'],
    ult: false,
    q: 0,
    mods: ['c_power', 'c_impact', 's_ap', 's_heal', 'a_recharge', 'c_breaker'].map((id) => ({ id, lv: 2 })),
  },
  max: {
    asm: BENCH_ASM,
    L,
    lv: 45,
    branches: ['gun', 'armor', 'en', 'mob', 'sup', 'melee'],
    ult: true,
    q: 4,
    tune: true,
    mods: [
      ...['c_power', 'c_impact', 's_ap', 's_heal', 'a_recharge', 'c_breaker'].map((id) => ({ id, lv: 3 })),
      { id: 'lg_barrage', lv: 1 },
      { id: 'lg_buffer', lv: 1 },
    ],
  },
});

(async () => {
  fs.mkdirSync(OUTD, { recursive: true });
  const browser = await launch();
  const rows = [];
  const t0 = Date.now();
  try {
    for (const bo of pickB) {
      for (const bn of pickC) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
        await page.addInitScript(() => {
          let a = 1;
          Math.random = () => {
            a = (a + 0x6d2b79f5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
          };
          window.__reseed = (s) => (a = s >>> 0);
          localStorage.setItem('rubicon_map', 'industrial');
        });
        await page.goto(
          require('url').pathToFileURL(path.join(DIST, 'rubicon-protocol.html')).href + '?test',
        );
        await page.waitForFunction(() => window.__game && window.__skills && window.__mods, null, {
          timeout: 60000,
        });
        // 停住主迴圈（之後由 runFight 逐格推進）
        await page.evaluate(() => {
          window.requestAnimationFrame = () => 0;
        });
        const info = await page.evaluate(setupBuild, buildDefs(bo.L)[bn]);
        const r0 = Date.now();
        const st = await page.evaluate(runFight, { kind: bo.kind, tier: bo.tier, cap: CAP, seed: 1 });
        const row = {
          boss: bo.kind,
          tier: bo.tier,
          L: bo.L,
          build: bn,
          pts: info.pts,
          wall: Date.now() - r0,
          ...st,
        };
        if (errs.length) row.errs = errs.slice(0, 5);
        rows.push(row);
        const ph = st.ph || {};
        console.log(
          `${bo.kind.padEnd(10)} ${bn.padEnd(4)} ` +
            (st.err
              ? st.err
              : `${st.kills ? '擊破' : '未擊破'} ${st.t.toFixed(0)}s  陣亡 ${st.deaths}  承受 ${(st.taken / st.maxHp).toFixed(2)}×AP  回復 ${(st.healed / st.maxHp).toFixed(2)}×AP  ` +
                `型態 ${[1, 2, 3].map((k) => (ph[k] || 0).toFixed(0)).join('/')}s  失衡 ${st.stag}  雜兵 ${st.adds}  詞綴 ${st.af}  （${((Date.now() - r0) / 1000).toFixed(0)}s）`) +
            (errs.length ? '  ⚠ ' + errs[0] : ''),
        );
        await ctx.close();
      }
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUTD, TAG + '.json'), JSON.stringify(rows, null, 1));
  // 報告
  const L = [
    `# Boss 難度量測（${TAG}）`,
    '',
    `上限 ${CAP} 秒（遊戲時間）；${((Date.now() - t0) / 60000).toFixed(1)} 分鐘`,
    '',
  ];
  L.push(
    '| Boss | 刁鑽度 | 配裝 | 結果 | 時間 | 陣亡 | 承受（×AP） | 回復（×AP） | 型態 1／2／3（秒） | 失衡 |',
  );
  L.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    if (r.err) {
      L.push(`| ${r.boss} | ${r.tier} | ${r.build} | ${r.err} |||||||`);
      continue;
    }
    const ph = r.ph || {};
    L.push(
      `| ${r.boss} | ${r.tier} | ${r.build} | ${r.kills ? '擊破' : `剩 ${(r.bossLeft * 100).toFixed(0)}%`} | ${r.t.toFixed(0)} | ${r.deaths} | ${(r.taken / r.maxHp).toFixed(2)} | ${(r.healed / r.maxHp).toFixed(2)} | ${[1, 2, 3].map((k) => (ph[k] || 0).toFixed(0)).join('／')} | ${r.stag} |`,
    );
  }
  fs.writeFileSync(path.join(OUTD, TAG + '.md'), L.join('\n') + '\n');
  console.log('→ ' + path.join(OUTD, TAG + '.md'));
})();
