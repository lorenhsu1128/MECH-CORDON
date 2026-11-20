// 機獸在主線出擊的實際地圖上和機甲對戰的檢查（docs/beast-design.md 的「接成敵人」）：
// 直接進每個機獸出擊（c1b～c7b）的 Boss 區段，自動操作的玩家繞著機獸邊閃邊打，逐格記錄機獸有沒有
// 卡住、浮空、陷進地裡、走進虛空、跑出作戰區域、位置不是有限值，以及牠出了幾招、打中多少、被打多少。
//   node scripts/beast-field.js [c1b,c5b] [--secs=90] [--dmg=3] [--still] [--raid] [--lhpk=1.2]   要先 npm run build
// --raid＝這一場一定有獅型亂入（game/beast-raid.js；第 2 章起），另外印出獅型接手到被擊破的秒數；--lhpk＝試獅型血量的倍率
// 截圖在 test-results/beast-field/<出擊>-<編號>.png；--still＝玩家站著不動（只開火）。
/* global window, THREE -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`)) || '').slice(k.length + 3) || d;
const ALL = ['c1b', 'c2b', 'c3b', 'c4b', 'c5b', 'c6b', 'c7b'];
const only = args.find((a) => !a.startsWith('--'));
const SIDS = only ? only.split(',') : ALL;
const SECS = +opt('secs', 90),
  DMG = +opt('dmg', 3),
  STILL = args.includes('--still'),
  RAID = args.includes('--raid'),
  LHPK = +opt('lhpk', 0);
// --hpk=c1b:2.5,c2b:1.8：試血量的倍率（校正擊破時間用；定下來之後寫回 data/beasts.js 的 hpMul）
const HPK = Object.fromEntries(
  opt('hpk', '')
    .split(',')
    .filter(Boolean)
    .map((q) => [q.split(':')[0], +q.split(':')[1]]),
);
const OUT = path.join(__dirname, '..', 'test-results', 'beast-field');
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 頁面裡：自動操作的玩家＋逐格的紀錄 ----------
function install(cfg) {
  const g = window.__game,
    P = Object.getPrototypeOf(g);
  const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const R = (window.__bf = {
    on: false,
    t: 0,
    lt: 0,
    qbT: 0,
    // 機獸
    bad: {}, // 異常的累計秒數（種類 → 秒）
    first: {}, // 每種異常第一次發生時的狀態
    clips: {},
    guns: {},
    leaps: 0,
    dealt: 0, // 機獸（含部位、投射物）打在玩家身上的傷害
    hits: 0,
    took: 0, // 機獸本體受到的傷害
    dMin: Infinity,
    dMax: 0,
    dSum: 0,
    n: 0,
    los: 0,
    air: 0,
    path: 0, // 機獸走過的水平距離
    // 玩家
    pStuck: 0,
    pTp: 0,
    pVoid: 0,
    ph: 1,
    dead: 0,
    // 內部
    win: null,
    prev: {},
    pbest: Infinity,
    pbestT: 0,
  });
  const bad = (k, dt, b) => {
    R.bad[k] = (R.bad[k] || 0) + dt;
    if (!R.first[k]) {
      const s = b.aiState || {};
      R.first[k] = {
        t: +R.t.toFixed(1),
        pos: [b.pos.x, b.pos.y, b.pos.z].map((v) => +(+v).toFixed(1)),
        clip: s.clip || '',
        gun: s.gun ? s.gun.G.id : '',
        leap: !!s.leap,
        air: !!s.air,
      };
    }
  };
  let patched = false;
  const patch = (p, b) => {
    if (patched) return;
    patched = true;
    const MP = Object.getPrototypeOf(p),
      td = MP.takeDamage;
    MP.takeDamage = function (dmg, imp, from, ...r) {
      const G = window.__game,
        B = window.__bf;
      if (!B.on) return td.call(this, dmg, imp, from, ...r);
      if (from === G.player && this.team !== 'player') dmg *= cfg.dmg;
      const h0 = this.hp;
      const out = td.call(this, dmg, imp, from, ...r);
      const lost = Math.max(0, h0 - this.hp);
      if (this === G.player && lost > 0) {
        B.dealt += lost;
        B.hits++;
      } else if (this === G.boss) B.took += lost;
      return out;
    };
    const gs = MP.beastGunStart;
    MP.beastGunStart = function (G, ...r) {
      const B = window.__bf;
      if (B.on && G && this === window.__game.boss) B.guns[G.id] = (B.guns[G.id] || 0) + 1;
      return gs.call(this, G, ...r);
    };
    void b;
  };
  const tick = () => {
    if (!R.on) return;
    const p = g.player,
      b = g.boss,
      w = g.world;
    if (g.state !== 'play' || !p) {
      g.tutVirt = null;
      return;
    }
    const now = performance.now(),
      dt = Math.min(0.1, R.lt ? (now - R.lt) / 1000 : 0);
    R.lt = now;
    R.t += dt;
    if (!b) return;
    patch(p, b);
    // 獅型亂入：出現、接手、被擊破的時間
    const RD = g.camp && g.camp.ss && g.camp.ss.raid;
    if (RD && !R.raidAt) {
      R.raidAt = +R.t.toFixed(1);
      R.raidD0 = Math.round(g.raidDist());
      if (cfg.lhpk) {
        RD.lion.maxHp *= cfg.lhpk;
        RD.lion.hp = RD.lion.maxHp;
      }
      R.lionHp = Math.round(RD.lion.maxHp);
      R.lionTier = RD.lion.bossTier ? RD.lion.bossTier() : 0;
      R.tookV = R.took;
      R.took = 0;
      R.dealtV = R.dealt;
    }
    if (RD && RD.killed && !R.raidKill) R.raidKill = +R.t.toFixed(1);
    if (RD && RD.done && !R.raidGo) R.raidGo = +R.t.toFixed(1);
    if (b.dead) {
      if (!R.dead) {
        R.dead = +R.t.toFixed(1);
        R.won = !!(g.camp && g.camp.raidWon);
      }
      g.tutVirt = { wish: new THREE.Vector3() };
      return;
    }
    // 玩家不會被擊破、彈藥無限
    if (p.scar) p.scar = 0; // 結構損傷（高刁鑽度的 Boss）：不累積，不然 AP 上限一直掉、最後被打死
    p.hp = p.maxHp;
    p.dead = false;
    for (const wp of Object.values(p.weapons || {}))
      if (wp && wp.def && wp.def.ammo > 0 && !wp.dropped) wp.ammo = Math.max(wp.ammo, wp.def.ammo * 0.5);
    const s = b.aiState || {};
    const d = hyp(b.pos, p.pos);
    // ---- 機獸的紀錄 ----
    R.n++;
    R.dSum += d;
    R.dMin = Math.min(R.dMin, d);
    R.dMax = Math.max(R.dMax, d);
    R.ph = Math.max(R.ph, b.bossPhase ? b.bossPhase() : 1);
    const fin = Number.isFinite(b.pos.x + b.pos.y + b.pos.z + b.yaw);
    if (!fin) bad('位置不是有限值', dt, b);
    else {
      const flying = !!(s.air || (s.alt || 0) > 1);
      const busy = !!(s.leap || s.clip);
      const gy = w.groundAt(b.pos.x, b.pos.z, b.pos.y + 2);
      const gap = b.pos.y - gy;
      const hidden = !!(b.noLock && !b.mesh.visible); // 鑽地等招式
      if (flying) R.air += dt;
      if (!flying && !s.leap && !hidden) {
        if (gap > 2.5) bad('浮在空中', dt, b);
        if (gap < -1.5) bad('陷進地裡', dt, b);
        if (w.isVoid && w.isVoid(b.pos.x, b.pos.z)) bad('站在虛空上', dt, b);
      }
      const z = w.zone || [-w.lim, w.lim, -w.lim, w.lim];
      if (b.pos.x < z[0] - 3 || b.pos.x > z[1] + 3 || b.pos.z < z[2] - 3 || b.pos.z > z[3] + 3)
        bad('在作戰區域外', dt, b);
      // 3 秒內幾乎沒移動、又沒在出招、離玩家還遠＝卡住
      if (R.prev.x !== undefined) R.path += Math.hypot(b.pos.x - R.prev.x, b.pos.z - R.prev.z);
      if (!R.win) R.win = { t: 0, x: b.pos.x, z: b.pos.z, idle: true };
      R.win.t += dt;
      if (busy || s.gun || b.staggerT > 0 || hidden || flying) R.win.idle = false;
      if (R.win.t >= 3) {
        const mv = Math.hypot(b.pos.x - R.win.x, b.pos.z - R.win.z);
        if (R.win.idle && mv < 2 && d > 35) bad('卡住不動', R.win.t, b);
        R.win = null;
      }
      try {
        if (w.losBlocked && w.losBlocked(b.center(), p.center())) R.los += dt;
      } catch (e) {
        /* 略過 */
      }
    }
    if (s.clip && s.clip !== R.prev.clip) R.clips[s.clip] = (R.clips[s.clip] || 0) + 1;
    const gid = s.gun ? s.gun.G.id : '';
    if (s.leap && !R.prev.leap) R.leaps++;
    R.prev = { clip: s.clip, gun: gid, leap: !!s.leap, x: b.pos.x, z: b.pos.z };
    // ---- 自動操作的玩家：靠近到 30 m 之後繞圈，邊閃邊打 ----
    if (w.isVoid && w.isVoid(p.pos.x, p.pos.z) && p.pos.y < (w.theme.void ? w.theme.void.y : -99))
      R.pVoid += dt;
    const V = {};
    let wish = new THREE.Vector3(b.pos.x - p.pos.x, 0, b.pos.z - p.pos.z);
    if (d > 0.01) wish.normalize();
    if (cfg.still) wish.set(0, 0, 0);
    else if (d < 30)
      wish = new THREE.Vector3(-wish.z, 0, wish.x).multiplyScalar(Math.sin(R.t * 0.4) > 0 ? 1 : -1);
    else {
      // 走不過去：跳，還是不行就瞬移（記次數）
      if (d < R.pbest - 2) {
        R.pbest = d;
        R.pbestT = 0;
      } else R.pbestT += dt;
      if (R.pbestT > 2.5) V.jump = true;
      if (R.pbestT > 2.5) R.pStuck += dt;
      if (R.pbestT > 8) {
        const k = Math.min(1, 25 / Math.max(1, d));
        let x = p.pos.x + (b.pos.x - p.pos.x) * k,
          zz = p.pos.z + (b.pos.z - p.pos.z) * k;
        if (w.nearSolid) [x, zz] = w.nearSolid(x, zz);
        p.pos.set(x, w.groundAt(x, zz, 999) + 0.5, zz);
        R.pTp++;
        R.pbestT = 0;
        R.pbest = Infinity;
      }
    }
    if (d < 30) {
      R.pbest = Infinity;
      R.pbestT = 0;
    }
    R.qbT -= dt;
    if (!cfg.still && R.qbT <= 0) {
      R.qbT = 2.5 + Math.random() * 2;
      V.qb = true;
    }
    V.wish = wish;
    V.fireR = V.fireL = true;
    V.backR = V.backL = Math.sin(R.t * 0.7) > 0;
    g.tutVirt = V;
  };
  const loop = P.loop;
  P.loop = function () {
    try {
      tick();
    } catch (e) {
      R.err = String(e && e.stack).slice(0, 400);
    }
    return loop.call(this);
  };
}

(async () => {
  const exe = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const url =
    'file:///' +
    path.resolve(__dirname, '..', 'dist', 'mech-cordon.html').split(path.sep).join('/') +
    '?test';
  const rows = [];
  let errs = 0;
  try {
    for (const sid of SIDS) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      const page = await ctx.newPage();
      // 不鎖住使用者的滑鼠
      await page.addInitScript(() => {
        window.Element.prototype.requestPointerLock = () => {};
      });
      const pe = [];
      page.on('pageerror', (e) => (errs++, pe.push(e.message), console.log(`[${sid}] 頁面錯誤`, e.message)));
      page.on(
        'console',
        (m) =>
          m.type() === 'error' &&
          (errs++, pe.push(m.text()), console.log(`[${sid}] console.error`, m.text())),
      );
      await page.goto(url, { waitUntil: 'domcontentloaded' }); // 不等外部的字型（連不到時會一直等）
      await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
        timeout: 60000,
      });
      await page.evaluate(install, { dmg: DMG, still: STILL, lhpk: LHPK });
      await page.evaluate(
        ([sid, raid]) => {
          const g = window.__game;
          const st = g.campStory();
          st.cycle = 1;
          st.choices = { c2: 'castron', c4: 'veerwell' };
          g.storyTest = false;
          g.autoPickMod = true;
          g.state = 'play';
          g.raidForce = raid ? 1 : 0;
          g.campBegin(sid);
          g.camp.seg = g.campSortie().segs.length - 1;
          g.campEnterSeg();
        },
        [sid, RAID],
      );
      await page.waitForFunction(() => window.__game.state === 'play' && window.__game.boss, null, {
        timeout: 120000,
      });
      const meta = await page.evaluate((hpk) => {
        const g = window.__game,
          b = g.boss,
          w = g.world;
        if (hpk) {
          b.maxHp *= hpk;
          b.hp = b.maxHp;
        }
        window.__bf.on = true;
        return {
          beast: b.name,
          tier: b.bossTier ? b.bossTier() : 0,
          theme: g.campSortie().segs[g.camp.seg].theme,
          variant: w.variantKey || '',
          d0: +Math.hypot(b.pos.x - g.player.pos.x, b.pos.z - g.player.pos.z).toFixed(0),
          props: (w.obstacles || []).length,
          hp: Math.round(b.maxHp),
        };
      }, HPK[sid] || 0);
      const t0 = Date.now();
      let shot = 0;
      for (;;) {
        await sleep(1000);
        const el = (Date.now() - t0) / 1000;
        const st = await page.evaluate(() => ({ s: window.__game.state, dead: window.__bf.dead }));
        if (el > (SECS * (shot + 1)) / 4 && shot < 3)
          await page.screenshot({ path: path.join(OUT, `${sid}-${shot++}.png`) });
        if (el > SECS || st.dead || st.s !== 'play') break;
      }
      const r = await page.evaluate(() => {
        const R = window.__bf,
          b = window.__game.boss;
        R.on = false;
        window.__game.tutVirt = null;
        return {
          t: +R.t.toFixed(0),
          bad: R.bad,
          first: R.first,
          clips: R.clips,
          guns: R.guns,
          leaps: R.leaps,
          dealt: Math.round(R.dealt),
          hits: R.hits,
          took: Math.round(R.took),
          d: [R.dMin, R.dSum / Math.max(1, R.n), R.dMax].map((v) => Math.round(v)),
          los: +R.los.toFixed(1),
          air: +R.air.toFixed(1),
          path: Math.round(R.path),
          pStuck: +R.pStuck.toFixed(1),
          pTp: R.pTp,
          pVoid: +R.pVoid.toFixed(1),
          ph: R.ph,
          dead: R.dead,
          hpK: b ? +(b.hp / b.maxHp).toFixed(2) : 0,
          pmax: Math.round(window.__game.player ? window.__game.player.maxHp : 0),
          err: R.err || '',
          raid: R.raidAt
            ? {
                at: R.raidAt,
                d0: R.raidD0,
                kill: R.raidKill || 0,
                go: R.raidGo || 0,
                hp: R.lionHp,
                tier: R.lionTier,
                tookV: Math.round(R.tookV),
                dealtV: Math.round(R.dealtV),
                won: !!R.won,
                state: window.__game.state,
              }
            : null,
        };
      });
      rows.push({ sid, ...meta, ...r, pe });
      const badTxt =
        Object.entries(r.bad)
          .map(([k, v]) => `${k} ${v.toFixed(1)} 秒 ${JSON.stringify(r.first[k])}`)
          .join('；') || '無';
      console.log(
        `${sid} ${meta.beast}（刁鑽度 ${meta.tier}、${meta.theme} ${meta.variant}、障礙物 ${meta.props}、開場距離 ${meta.d0} m）${r.t} 秒：\n` +
          `  異常：${badTxt}\n` +
          `  近戰 ${JSON.stringify(r.clips)}\n  武器 ${JSON.stringify(r.guns)}、躍過障礙 ${r.leaps} 次、在空中 ${r.air} 秒、走了 ${r.path} m\n` +
          `  打中玩家 ${r.hits} 次共 ${r.dealt}（玩家 AP ${r.pmax}）、本體受傷 ${r.took}（剩 ${Math.round(r.hpK * 100)}%、到第 ${r.ph} 型態${r.dead ? `、${r.dead} 秒擊破` : ''}）\n` +
          `  距離 最近 ${r.d[0]}／平均 ${r.d[1]}／最遠 ${r.d[2]} m、視線被擋 ${r.los} 秒；玩家走不過去 ${r.pStuck} 秒、瞬移 ${r.pTp} 次、掉進虛空 ${r.pVoid} 秒` +
          (r.raid
            ? `\n  獅型亂入：${r.raid.at} 秒出現（離原本的機獸 ${r.raid.d0} m）、${r.raid.kill} 秒咬死、${r.raid.go} 秒接手；刁鑽度 ${r.raid.tier}、AP ${r.raid.hp}；` +
              (r.dead
                ? `接手後 ${(r.dead - r.raid.go).toFixed(0)} 秒被擊破`
                : `還沒被擊破（剩 ${Math.round(r.hpK * 100)}%）`) +
              `；原本的機獸打了 ${r.raid.tookV}、之前玩家挨 ${r.raid.dealtV}；隱藏目標 ${r.raid.won ? '達成' : '未達成'}、結束時的狀態 ${r.raid.state}`
            : RAID
              ? '\n  獅型亂入：沒有出現'
              : '') +
          (r.err ? `\n  紀錄出錯：${r.err}` : ''),
      );
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(rows, null, 1));
  console.log(errs ? `有 ${errs} 個頁面錯誤` : '沒有頁面錯誤');
})();
