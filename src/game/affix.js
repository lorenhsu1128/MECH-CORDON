// Game：敵人詞綴（主線擴充 B4，data/affix.js、docs/campaign-expansion-design.md）——生成時抽詞綴（房主／單機）、
// 擊破時的分裂與殉爆、鎖定提示與 HUD 的詞綴標示。實體的判定與外觀在 entities/mech-affix.js。
import { SFX } from '../audio/audio.js';
import {
  AF,
  AFFIXES,
  BOSS_AF,
  affixChance,
  affixList,
  affixNames,
  affixable,
  bossAfCount,
  rollAffix,
} from '../data/affix.js';
import { BOSS_PHASES } from '../data/enemies.js';
import { gearResolve } from '../data/gear.js';
import { levelOf } from '../data/pilot.js';
import { SKILLS } from '../data/skills.js';
import { Game } from './game.js';

const B = (k) => AFFIXES[k].bit;
// 自動化測試（網址帶 ?test）：Boss 詞綴的數量（testBossHard）
if (typeof location !== 'undefined' && /[?&]test\b/.test(location.search)) window.__affix = { bossAfCount };

Object.assign(Game.prototype, {
  // 這一場有沒有詞綴（PvP、自訂關卡、教學、實驗室、靶場、模擬器、空域、過場沒有）
  afOn() {
    return !(
      this.pvp ||
      this.lv ||
      this.tut ||
      this.lab ||
      this.range ||
      this.sim ||
      this.airMode ||
      this.cine
    );
  },
  // spawnType 建好的生成參數 o 加上詞綴（房主／單機）：位元、名稱、AP、速度；回傳 o
  afApply(o, d, t) {
    if (this.isClient || !this.afOn() || !affixable(d, t) || this.isBossLevel) return o;
    let mask = 0;
    const fa = this.camp && this.camp.free && this.camp.free.affix; // 自由出擊的作戰設定：off／auto／all
    if (fa === 'off') return o;
    if ((this.camp && this.campRule('allAffix')) || fa === 'all')
      mask = rollAffix(d, Math.random, 0.3); // 委託板的「精英部隊」
    else if (this.afForce !== undefined && this.afForce !== null)
      mask = this.afForce; // 測試用
    else if (navigator.webdriver)
      return o; // 自動化測試：只在 afForce 時帶（其他測試的敵人照舊）
    else {
      const so = this.camp && this.campSortie();
      const ch = so ? so.chapter : 0,
        cyc = (this.save.story && this.save.story.cycle) || 1;
      const p = affixChance({ chapter: ch, cycle: so ? cyc : 1, level: this.save.level || 1 });
      if (Math.random() >= p) return o;
      mask = rollAffix(d, Math.random, ch >= 4 || (!so && (this.save.level || 1) >= 8) ? 0.25 : 0);
    }
    if (!mask) return o;
    o.af = mask;
    o.name = `【${affixNames(mask).join('・')}】${o.name}`;
    o.hpMul *= AF.HP;
    if (mask & B('swift')) o.speedMul = (o.speedMul || 1) * AF.SWIFT_SPD;
    // 第一次遇到的詞綴：說明打法（每場一次）
    if (!this.afSeen) this.afSeen = new Set();
    for (const k of affixList(mask))
      if (!this.afSeen.has(k)) {
        this.afSeen.add(k);
        setTimeout(
          () => this.state === 'play' && this.alertAll(`精英敵人【${AFFIXES[k].name}】：${AFFIXES[k].tip}`),
          600,
        );
      }
    return o;
  },
  // spawnEnemy 建好實體之後（房主／單機）：指揮的名單
  afSpawned(e) {
    if (e.af & B('leader')) (this.afLeaders || (this.afLeaders = [])).push(e);
  },
  // 擊破（onEnemyKilled，房主／單機）：分裂、殉爆
  afKilled(e) {
    if (!e.af || this.isClient) return;
    const c = e.center();
    if (e.af & B('split') && !e.opts.afChild) {
      const base = e.name.replace(/^【[^】]*】/, '');
      for (let i = 0; i < 2; i++) {
        const a = Math.random() * Math.PI * 2;
        const at = e.pos.clone().add(new THREE.Vector3(Math.cos(a) * 3 * e.dk, 0, Math.sin(a) * 3 * e.dk));
        const [x, z] = this.world.nearSolid ? this.world.nearSolid(at.x, at.z) : [at.x, at.z];
        at.set(x, this.world.groundAt(x, z, e.pos.y + 3), z);
        const o = { ...e.opts, name: base, af: 0, afChild: true, at };
        o.hpMul = ((e.opts.hpMul || 1) / AF.HP) * AF.SPLIT_HP;
        o.scale = (e.opts.scale || 1) * AF.SPLIT_SC;
        delete o.guard;
        this.spawnEnemy(o);
      }
      this.fx.shockwave(c, 4 * e.dk, 0xffd060, 0.35);
      this.flashAlert(`${base} 分裂了！`);
    }
    if (e.af & B('volatile')) {
      const R = AF.VOL_R;
      this.fx.warnCircle(c.clone().setY(e.pos.y + 0.3), R, AF.VOL_DELAY, 0xff5020);
      SFX.play('alarm', 0.5, 1.6, 0.05, 0.2, c);
      this.later(AF.VOL_DELAY, () => {
        if (!this.world) return;
        this.fx.explosion(c, R * 0.5, 0xff8030, true);
        this.fx.shockwave(c, R, 0xffb060, 0.5);
        SFX.explode(true, c);
        for (const t of [...(this.players || []), ...(this.allies || [])]) {
          if (!t || t.dead) continue;
          const d = t.center().distanceTo(c);
          if (d > R) continue;
          const dir = t.center().sub(c).setY(0.3).normalize();
          t.takeDamage(
            t.maxHp * AF.VOL_FRAC * (1 - (d / R) * 0.5),
            900,
            e,
            t.center(),
            dir,
            null,
            null,
            'exp',
          );
        }
      });
    }
  },
  // 擊破獎金的倍率（onEnemyKilled）；Boss 依詞綴數
  afBountyK(e) {
    if (e.isBoss) return 1 + AF.BOSS_BOUNTY * affixList(e.af || 0).length;
    return e.af && !e.opts.afChild ? AF.BOUNTY : 1;
  },
  // ---------- 第 8 節方案 7：依玩家的戰力給 Boss 詞綴 ----------
  // 戰力分數 0～1（房主／單機的存檔）：零件品級 40%、傳說模組 20%、極致技能 20%、駕駛員等級 20%
  bossPower() {
    const S = this.save;
    if (!S) return 0;
    let qs = 0,
      qn = 0;
    try {
      const pick = gearResolve(S);
      for (const k in pick) {
        qn++;
        qs += pick[k] ? pick[k].q || 0 : 0;
      }
    } catch (e) {
      qn = 0;
    }
    const gear = qn ? qs / (qn * 4) : 0;
    const mods = this.camp && this.campMods ? this.campMods() : [];
    const leg = Math.min(1, mods.filter((m) => /^lg_/.test(m.id)).length / 2);
    const P = (S.pilot && S.pilot.pve) || {};
    const sk = P.skills || {};
    const ult = Math.min(1, SKILLS.filter((s) => s.tier === 4 && sk[s.id] > 0).length / 4);
    const lv = Math.min(1, levelOf(P.xp || 0) / 45);
    return 0.4 * gear + 0.2 * leg + 0.2 * ult + 0.2 * lv;
  },
  // spawnBossDef 開頭：這一場 Boss 的詞綴（位元；0＝沒有）。刁鑽度 0（靶場等）、自動化測試（沒有 bossAfAuto）不帶
  bossAfRoll(tier) {
    if (!tier || this.isClient || this.lv) return 0;
    if (!this.afOn() && !this.bossAfAuto) return 0; // 模擬器等不帶（scripts/boss-bench.js 的量測設 bossAfAuto）
    if (this.bossAfForce !== undefined && this.bossAfForce !== null) return this.bossAfForce; // 測試用
    if (navigator.webdriver && !this.bossAfAuto) return 0;
    const fa = this.camp && this.camp.free && this.camp.free.affix;
    if (fa === 'off') return 0;
    const n = bossAfCount(this.bossPower());
    const pool = BOSS_AF.slice();
    let mask = 0;
    for (let i = 0; i < n && pool.length; i++) {
      const k = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      mask |= AFFIXES[k].bit;
    }
    return mask;
  },
  // spawnBossDef 結尾：說明這一場的 Boss 詞綴
  bossAfIntro() {
    const b = (this.bosses || []).find((x) => x.af);
    if (!b) return;
    const ks = affixList(b.af);
    this.bossAfNames = ks.map((k) => AFFIXES[k].icon + AFFIXES[k].name).join('　');
    setTimeout(() => {
      if (this.state !== 'play') return;
      this.alertAll(
        `強化 Boss（依你的戰力）：${ks.map((k) => `【${AFFIXES[k].name}】${AFFIXES[k].tip}`).join('　')}`,
      );
    }, 2600);
  },
  // Boss 血條下方的詞綴標示（hud.js）：房主與客機各自看 af
  bossAfHud() {
    const el = document.getElementById('bossAf');
    if (!el) return;
    const b = (this.bosses || []).find((x) => x.af && !x.dead);
    const txt = b
      ? affixList(b.af)
          .map((k) => AFFIXES[k].icon + AFFIXES[k].name)
          .join('　')
      : '';
    if (el.textContent !== txt) el.textContent = txt;
  },
  // Boss 的再生上限：目前型態的 AP 上限（不會回到上一個型態）
  bossRegenCap(b) {
    const ph = b.bossPhase();
    return b.maxHp * (ph <= 1 ? 1 : BOSS_PHASES[ph - 2]) - 1;
  },
  // 鎖定提示（hud.js）：目標的詞綴與打法
  afHint(e) {
    if (!e || !e.af) return '';
    return (
      '　' +
      affixList(e.af)
        .map((k) => `【${AFFIXES[k].name}】${AFFIXES[k].tip.split(' — ')[1] || ''}`)
        .join(' ')
    );
  },
  // HUD：畫面上敵人的 AP 弧上方標出詞綴（金色）
  afDrawTag(c, e, s, R) {
    if (!e.af) return;
    const txt = affixList(e.af)
      .map((k) => AFFIXES[k].icon + AFFIXES[k].name)
      .join(' ');
    c.save();
    c.font = 'bold 12px Rubik, Noto Sans TC';
    c.textAlign = 'center';
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0,0,0,.75)';
    c.fillStyle = '#ffc040';
    const y = s.y - 4 - (e.staggerT > 0 ? 14 : 0);
    c.strokeText(txt, s.x, y);
    c.fillText(txt, s.x, y);
    void R;
    c.restore();
  },
});
