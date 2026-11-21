// ---------- Game 擴充：獅型亂入（機獸出擊的隨機隱藏任務；docs/beast-design.md 的「獅型亂入」，2026-11-20 使用者定案）----------
// 第 2 章起的機獸出擊（SORTIES 的 beast）出擊開始時抽一次（基礎 RAID.p0，每次沒抽中 +RAID.pity、抽中歸零；存在 camp.raid 與紀錄點）。
// 抽中的那一場：原本的機獸降到一半 AP、人在地面時，獅型從地圖邊緣衝進來撲倒牠、咬死，變成這一關的 Boss；打死獅型才算過關。
// 亂入只有一次（camp.raidUsed 立刻寫進紀錄點）：陣亡後從紀錄點重打時獅型不再出現（錯過這一次）。
// 判定只在房主／單機（campTick 的 raidTick）；客機照 raid 事件顯示橫幅與過關條件。獅型進場的走法在 entities/mech-beast.js 的 beastRaidMove。
import { SFX } from '../audio/audio.js';
import { campaignTier } from '../data/boss-tier.js';
import { BEAST_DEFS, RAID } from '../data/beasts.js';
import { SORTIES } from '../data/campaign.js';
import { Game } from './game.js';

const hyp = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// 暫時的開關（2026-11-20 使用者要先看演出）：網址加 ?raid —— 每一場機獸出擊（含第 1 章）一定有獅型亂入，
// 從紀錄點重打也會再來一次；不動保底的計數。看完演出之後可以拿掉
const RAID_PREVIEW = typeof location !== 'undefined' && /[?&]raid(?:[=&]|$)/.test(location.search);

Object.assign(Game.prototype, {
  raidState() {
    const st = this.campStory();
    return st.raid || (st.raid = { pity: 0, won: {}, seen: 0 });
  },
  // 出擊開始（campBegin）：抽這一場有沒有亂入
  raidRoll(so, o = {}) {
    const c = this.camp;
    if (!c || !so || !so.beast || o.free) return;
    if (RAID_PREVIEW) {
      c.raid = 1;
      return;
    }
    if (so.chapter < RAID.minCh) return;
    if (this.raidForce !== undefined && this.raidForce !== null) {
      c.raid = this.raidForce ? 1 : 0; // 測試用
      return;
    }
    if (navigator.webdriver && !this.raidRollTest) return; // 自動化測試：只在 raidForce 時出現（其他測試的 Boss 區段照舊）
    const R = this.raidState();
    if (Math.random() < RAID.p0 + RAID.pity * (R.pity || 0)) {
      c.raid = 1;
      R.pity = 0;
    } else R.pity = (R.pity || 0) + 1;
  },
  // 每格（房主／單機，campTick）
  raidTick(dt) {
    const c = this.camp,
      ss = c && c.ss;
    if (!ss || this.isClient) return;
    const R = ss.raid;
    if (!R) {
      if (!c.raid || (c.raidUsed && !RAID_PREVIEW) || !this.isBossLevel) return;
      const v = this.boss;
      if (!v || v.dead || v.ai !== 'beast' || v.raidLion || v.hp > v.maxHp * RAID.hpAt) return;
      const s = v.aiState || {},
        w = this.world;
      if (s.leap || (w.isVoid && w.isVoid(v.pos.x, v.pos.z))) return; // 跳躍中、鑽在地下、在虛空上方：等一下
      if (s.air || s.alt > 1) {
        v.staggerT = Math.max(v.staggerT || 0, 1); // 會飛的：先打下來
        return;
      }
      return this.raidStart(v);
    }
    if (R.done) {
      // REGENT 剩一半時的通訊（原本的 bossHalf 在亂入之前就播過了）
      const L = R.lion;
      if (!R.half && L && !L.dead && L.hp < L.maxHp * 0.5) {
        R.half = true;
        this.campComm('bossHalf', this.campCtx({ raid: true }));
      }
      return;
    }
    R.t += dt;
    // 進場的這幾秒：原本的機獸動不了也打不死、玩家不受傷
    const v = R.v;
    if (!R.killed && v && !v.dead) {
      v.staggerT = Math.max(v.staggerT || 0, 0.6);
      v.iFrames = Math.max(v.iFrames || 0, 0.6);
    }
    for (const p of this.players || []) if (p && !p.dead) p.iFrames = Math.max(p.iFrames || 0, 0.4);
    // 保險：獅型不知怎麼沒走完進場（被卡住、被擊破）就直接收尾
    if (R.t > 11 || R.lion.dead) {
      if (!R.killed) this.raidKill(R.lion, v);
      if (R.lion.aiState) R.lion.aiState.raid = null;
      this.raidDone(R.lion);
    }
  },
  // 獅型出現的位置：離原本的機獸 60～90 m 的實地、和牠差不多高、離玩家最遠
  raidSpot(v) {
    const w = this.world,
      z = w.zone || [-w.lim, w.lim, -w.lim, w.lim];
    let best = null,
      bs = -Infinity;
    for (let i = 0; i < 16; i++)
      for (const rr of [85, 65, 45]) {
        const a = (i / 16) * Math.PI * 2;
        const x = v.pos.x + Math.cos(a) * rr,
          zz = v.pos.z + Math.sin(a) * rr;
        if (x < z[0] + 6 || x > z[1] - 6 || zz < z[2] + 6 || zz > z[3] - 6) continue;
        if (w.isVoid && w.isVoid(x, zz)) continue;
        const y = w.groundAt(x, zz, v.pos.y + 6);
        if (Math.abs(y - v.pos.y) > 10) continue;
        let dp = Infinity;
        for (const p of this.players || [])
          if (p && !p.dead) dp = Math.min(dp, Math.hypot(p.pos.x - x, p.pos.z - zz));
        const sc = Math.min(dp, 120) + rr * 0.3;
        if (sc > bs) {
          bs = sc;
          best = new THREE.Vector3(x, y, zz);
        }
      }
    if (best) return best;
    const [x, zz] = w.nearSolid ? w.nearSolid(v.pos.x + 30, v.pos.z) : [v.pos.x + 30, v.pos.z];
    return new THREE.Vector3(x, w.groundAt(x, zz, v.pos.y + 6), zz);
  },
  raidStart(v) {
    const c = this.camp,
      so = this.campSortie(),
      st = this.campStory();
    c.raidUsed = 1;
    // 立刻寫進紀錄點：從紀錄點重打時獅型不再出現
    if (st.sortie && st.sortie.sid === c.sid) st.sortie.raidUsed = 1;
    this.raidState().seen = (this.raidState().seen || 0) + 1;
    this.writeSave();
    // 場上的雜兵撤走、不再派增援；獅型自己只在最後型態叫一次
    for (const e of [...this.enemies])
      if (!e.dead && !e.isBoss && e.ai !== 'part' && !e.isObjective && e.depart) e.depart();
    this.waves = [];
    this.wavePend = null;
    if (this.spawnQ) this.spawnQ.length = 0;
    const lionDef = BEAST_DEFS.find((b) => b.beast === 'lion');
    const ch = so.chapter;
    const bd = { ...lionDef, hpMul: RAID.hp[ch] || lionDef.hpMul };
    const tier = Math.min(8, campaignTier(ch, st.cycle || 1) + 1);
    const keep = this.bosses;
    this.bosses = []; // spawnBossDef 會替 bosses 裡的每一隻建部位：只給獅型
    this.spawnBossDef(bd, this.scaleHp, this.scaleDmg, tier);
    const lion = this.boss;
    this.bosses = [...keep, lion];
    lion.raidLion = ch;
    const at = this.raidSpot(v);
    lion.pos.copy(at);
    lion.yaw = lion.aimYaw = Math.atan2(-(v.pos.x - at.x), -(v.pos.z - at.z));
    lion.iFrames = 3;
    lion.aiState.raid = { v, st: 'run', t: 0 };
    // 進場的這幾秒（raidTick 每格延長）：原本的機獸動不了也打不死、玩家不受傷
    v.staggerT = Math.max(v.staggerT || 0, 0.6);
    v.iFrames = Math.max(v.iFrames || 0, 0.6);
    for (const p of this.players || []) if (p && !p.dead) p.iFrames = Math.max(p.iFrames || 0, 0.6);
    c.ss.raid = { t: 0, v, lion };
    this.bossFightT = 0; // 擊破評價與狂暴的計時從獅型出現重新算
    this.bossEnraged = false;
    this.bossAdds = { 2: true };
    this.fx.warnPath(at.clone(), v.pos.clone(), lion.radius * 2, 1.2, 0xff4020);
    this.campComm('raidIn', this.campCtx({ raid: true }));
    this.netEv({ t: 'raid', k: 'in', n: lion.name });
    this.raidShow('in', lion.name);
    if (!this.net && this.camCloseup) this.camCloseup(lion, 3);
  },
  // 獅型咬下去的那一下（beastRaidMove）：原本的機獸被擊破（獎金照給、那一章的機獸算打過），玩家補一點 AP 與彈藥
  raidKill(lion, v) {
    const R = this.camp && this.camp.ss && this.camp.ss.raid;
    if (R) R.killed = true;
    if (!v || v.dead) return;
    v.iFrames = 0;
    this.raidQuiet = true;
    try {
      v.die(lion);
    } finally {
      this.raidQuiet = false;
    }
    const c = v.center();
    this.fx.shockwave(c, 16, 0xff3020, 0.7);
    this.fx.streaks(c, 30, 0xffd0a0, 34, 0.6, 30);
    this.camShake = Math.max(this.camShake || 0, 0.5);
    for (const p of this.players || [])
      if (p && !p.dead) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * RAID.heal);
    this.dropAmmoAt(v);
    if (this.camp) this.campComm('raidBite', this.campCtx({ raid: true })); // docs/beast-script.md
  },
  // 進場結束：獅型開始打玩家
  raidDone(lion) {
    const R = this.camp && this.camp.ss && this.camp.ss.raid;
    if (!R || R.done) return;
    R.done = true;
    this.bossDef = { ...(this.bossDef || {}), name: lion.name };
    this.netEv({ t: 'raid', k: 'go', n: lion.name });
    this.raidShow('go', lion.name);
    this.campComm('raidGo', this.campCtx({ raid: true }));
  },
  // 顯示（房主、單機、客機）：橫幅、血條的名稱、過關條件卡
  raidShow(k, name) {
    const bn = document.getElementById('bossName');
    if (bn) bn.textContent = name;
    if (k === 'in') {
      this.showBanner('WARNING', '不明的大型反應 高速接近', '#ff4030', 3, {
        k: 'warn',
        m: 'WARNING',
        s: '不明的大型反應 高速接近',
      });
      SFX.stinger && SFX.stinger(false);
    } else if (k === 'go') {
      this.bossDef = { ...(this.bossDef || {}), name };
      this.goalIntro(); // 過關條件換成擊破獅型
      this.flashMsg(`隱藏目標 — 擊破 ${name}`, 0xffb020, 3, { k: 'warn', m: '隱藏目標', s: `擊破 ${name}` });
    } else if (k === 'won') {
      this.flashMsg(`隱藏目標達成 — ${name} 擊退`, 0xffc040, 3.5, {
        k: 'good',
        m: '隱藏目標達成',
        s: `${name} 擊退`,
      });
    }
  },
  // 客機收到 raid 事件（mp-client.js）
  raidClient(e) {
    if (e.k === 'won') this.raidMark(e.ch);
    this.raidShow(e.k, e.n);
  },
  // 打倒獅型的紀錄：作戰室節點的記號（每章）、模擬器與自由出擊的輪替（seen2.bosses）
  raidMark(ch) {
    const R = this.raidState();
    R.won[ch] = (R.won[ch] || 0) + 1;
    this.writeSave();
  },
  // 獅型被擊破（onEnemyKilled，房主／單機）：紀錄、保底一件特製以上的零件
  raidWon(e) {
    const ch = e.raidLion;
    if (this.camp) this.camp.raidWon = 1;
    this.raidMark(ch);
    this.simMark('bosses', 'beast_lion', e.bossTier ? e.bossTier() : 0);
    this.gearRaid(e); // gear-loot.js
    this.netEv({ t: 'raid', k: 'won', n: e.name, ch });
    this.raidShow('won', e.name);
    if (this.camp) this.campComm('raidWon', this.campCtx({ raid: true }));
  },
  // 這個出擊的節點要不要畫「已擊退獅型」的記號（作戰室）
  raidBadge(sid) {
    const so = SORTIES[sid];
    const st = (this.save && this.save.story) || {};
    return !!(so && so.beast && st.raid && st.raid.won && st.raid.won[so.chapter]);
  },
  // 量測腳本用：獅型離原本的機獸多遠
  raidDist() {
    const R = this.camp && this.camp.ss && this.camp.ss.raid;
    return R ? hyp(R.lion.pos, R.v.pos) : -1;
  },
});
