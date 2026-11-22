// ---------- MechEntity 擴充：各 Boss 最終型態的專屬招式（第 14.2 期）----------
// Boss 進入第三型態（AP 35% 以下）後，依種類定期放出一招專屬的連段（都有預警：紅圈、紅線、地面衝擊波）。
// 只在房主／單機執行（updateAI 呼叫）；用的都是已經會同步給客機的機制：迫擊砲彈、地面衝擊波、能量環、
// 光束（beamAttack）、燃燒地面、地雷、範圍爆炸（blastTeam）與鏡像的特效。
import { SFX } from '../audio/audio.js';
import { DS, MS } from '../core/scale.js';
import { rnd } from '../core/math.js';
import { MechEntity } from './mech-entity.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// 種類（bossKind，沒有的用名稱開頭）→ { cd 冷卻秒數, name 招式名稱, fn(Boss, 目標) }
const SPECIALS = {
  // 機獸（docs/beast-design.md）
  beast_raptor: {
    cd: 10,
    name: '天降轟炸',
    fn: (b, pl) => (b.b3Line(pl, 8, 4, 0.1), b.b3Rain(pl, 6, 9, 0.2), b.b3Fan(pl, 5, 0.16)),
  },
  beast_scorpion: { cd: 11, name: '毒沙風暴', fn: (b, pl) => (b.b3Rain(pl, 7, 9, 0.2), b.b3Pools(pl, 3, 7)) },
  beast_mantis: {
    cd: 10,
    name: '千刃亂舞',
    fn: (b, pl) => (b.b3Cage(pl, 8, 24), b.b3Mines(pl, 6, 9, true), b.b3Ring(26)),
  },
  beast_gorilla: {
    cd: 11,
    name: '狂暴連擊',
    fn: (b, pl) => (b.b3Shocks(2, 0.5), b.b3Cage(pl, 6, 24), b.b3Ring(28)),
  },
  beast_turtle: { cd: 12, name: '怒濤旋殼', fn: (b, pl) => (b.b3Shocks(3, 0.6), b.b3Rain(pl, 6, 8, 0.25)) },
  beast_bear: {
    cd: 12,
    name: '熔爐爆發',
    fn: (b, pl) => (b.b3Erupt(pl, 4, 8), b.b3Ring(30), b.b3Pools(pl, 3, 7)),
  },
  beast_tiger: {
    cd: 10,
    name: '絕對零度',
    fn: (b, pl) => (b.b3Cross(pl), b.b3Rain(pl, 6, 7, 0.22), b.b3Ring(26)),
  },
  beast_lion: {
    cd: 11,
    name: '獸王咆哮',
    fn: (b, pl) => (b.b3Ring(34), b.b3Fan(pl, 7, 0.14), b.b3Rain(pl, 5, 8, 0.3)),
  },
  MONOLITH: { cd: 12, name: '砲擊連段', fn: (b, pl) => (b.b3Shock(26), b.b3Rain(pl, 6, 10, 0.5)) },
  mirror: { cd: 10, name: '適應過載', fn: (b, pl) => (b.b3Volley(pl, 3, 0.35), b.b3Mines(pl, 5, 9)) },
  flagship: { cd: 11, name: '艦砲齊射', fn: (b, pl) => b.b3Line(pl, 8, 4.5, 0.12) },
  interceptor: { cd: 12, name: '空雷封鎖', fn: (b, pl) => b.b3Mines(pl, 8, 10, true) },
  TETRARCH: { cd: 9, name: '十字雷射', fn: (b, pl) => b.b3Cross(pl) },
  railgun: { cd: 12, name: '散射砲', fn: (b, pl) => b.b3Fan(pl, 5, 0.22) },
  worm: { cd: 10, name: '地表崩塌', fn: (b, pl) => b.b3Erupt(pl, 5, 9) },
  funnel: { cd: 12, name: '光束牢籠', fn: (b, pl) => b.b3Cage(pl, 6, 16) },
  heli: { cd: 11, name: '地毯轟炸', fn: (b, pl) => b.b3Line(pl, 9, 4, 0.1) },
  furnace: { cd: 12, name: '火海', fn: (b, pl) => (b.b3Pools(pl, 5, 9), b.b3Ring(36)) },
  // 主線擴充（第 7 章）
  anvil: { cd: 11, name: '鍛造連打', fn: (b, pl) => (b.b3Line(pl, 6, 5, 0.15), b.b3Shock(22)) },
  salamander: { cd: 11, name: '熔岩奔流', fn: (b, pl) => (b.b3Erupt(pl, 4, 8), b.b3Pools(pl, 4, 8)) },
  deckgun: { cd: 12, name: '全門齊射', fn: (b, pl) => (b.b3Line(pl, 10, 5, 0.08), b.b3Rain(pl, 6, 8, 0.2)) },
  reactor: { cd: 11, name: '臨界放電', fn: (b, pl) => (b.b3Ring(46), b.b3Cross(pl)) },
  sovereign: { cd: 12, name: '終端認證', fn: (b, pl) => (b.b3Pillars(pl, 8, 14), b.b3Cage(pl, 6, 14)) },
  gantry: { cd: 12, name: '全面卸貨', fn: (b, pl) => (b.b3Rain(pl, 8, 10, 0.2), b.b3Ring(26)) },
  artillery: { cd: 10, name: '飽和砲擊', fn: (b, pl) => b.b3Rain(pl, 12, 18, 0.25) },
  rampart: { cd: 10, name: '碎石雨', fn: (b, pl) => (b.b3Shock(22), b.b3Rain(pl, 6, 12, 0.4)) },
  duo: { cd: 13, name: '連攜齊射', fn: (b, pl) => b.b3Volley(pl, 4, 0.3) },
  phantom: { cd: 14, name: '分身突襲', fn: (b) => (b.game.spawnHolos(b, 2), b.b3Ring(28)) },
  spider: { cd: 11, name: '震地', fn: (b, pl) => (b.b3Shocks(3, 0.8), b.b3Mines(pl, 4, 8)) },
  orbital: { cd: 9, name: '雙重光柱', fn: (b, pl) => b.b3Pillars(pl, 6, 12) },
  ARCHON: {
    cd: 10,
    name: '導彈牆',
    fn: (b, pl) => (b.b3Volley(pl, 4, 0.25, ['rback', 'lback']), b.b3Ring(32)),
  },
  trinity: { cd: 12, name: '三重衝擊', fn: (b) => b.b3Shocks(3, 0.7) },
  hunter: { cd: 12, name: '電磁風暴', fn: (b, pl) => (b.b3Ring(40), b.b3Mines(pl, 6, 10)) },
  train: { cd: 10, name: '全車廂砲擊', fn: (b, pl) => b.b3Rain(pl, 10, 16, 0.2) },
  fortress: { cd: 11, name: '全彈發射', fn: (b, pl) => (b.b3Rain(pl, 10, 14, 0.2), b.b3Fan(pl, 3, 0.3)) },
  ibis: { cd: 9, name: '雙環', fn: (b) => (b.b3Ring(44), b.game.later(0.7, () => !b.dead && b.b3Ring(44))) },
};

// 自製的 AI 音效（docs/sfx-inventory/bosses.md）：種類（boss3Key）→ 音效鍵的名稱 boss_<名稱>_<事件>；
// 機獸直接用 beast_<獸>_<事件>。沒有素材時 SFX.aiPlay 回傳 false，呼叫端照舊播原本的聲音
const SND_NAME = {
  MONOLITH: 'monolith',
  mirror: 'doppel',
  flagship: 'aegis',
  interceptor: 'viper',
  TETRARCH: 'tetrarch',
  railgun: 'halberd',
  worm: 'sandworm',
  funnel: 'seraphim',
  heli: 'helios',
  furnace: 'cinder',
  artillery: 'bastille',
  rampart: 'behemoth',
  duo: 'duo',
  phantom: 'mirage',
  spider: 'arachne',
  orbital: 'judgement',
  ARCHON: 'archon',
  trinity: 'cerberus',
  hunter: 'nullifier',
  train: 'citadel',
  fortress: 'leviathan',
  ibis: 'pulsar',
  anvil: 'anvil',
  salamander: 'salamander',
  gantry: 'gantry',
  deckgun: 'colossus',
  reactor: 'hearth',
  sovereign: 'sovereign',
};
// 播一個 AI 音效；local＝房主與客機各自算的地方（暫時拿掉轉送，否則客機會聽到兩次）
function sfxAi(k, vol = 1, pos = null, gap = 0.08, local = false, o = null) {
  if (!local || !SFX.mirror) return SFX.aiPlay(k, vol, 1, 0.04, gap, pos, null, 0, o);
  const m = SFX.mirror;
  SFX.mirror = null;
  try {
    return SFX.aiPlay(k, vol, 1, 0.04, gap, pos, null, 0, o);
  } finally {
    SFX.mirror = m;
  }
}
// 專屬 AC（data/foes.js 的 ACES）：名稱 → 音效鍵 ace_<名稱小寫>_<事件>
const ACE_SND = new Set(
  'OXIDE STEVEDORE SLUICE MARSH WHITEOUT SPECIMEN SPIRE COUNTDOWN UNDERTOW KEEL KILN ZENITH SIROCCO PROSPECTOR'.split(
    ' ',
  ),
);
// 最終型態專屬招式本身的聲音（招式名稱的訊息時；其他 Boss 只有 big_release）
const SPECIAL_SND = { MONOLITH: 'final_barrage', mirror: 'final', duo: 'final', ARCHON: 'missile_wall' };
// 不是循環的「循環音」（6 秒的一段，移動中每段播一次）
const LOOP_ONESHOT = new Set([
  'tetrarch',
  'halberd',
  'bastille',
  'arachne',
  'citadel',
  'anvil',
  'gantry',
  'colossus',
  'hearth',
]);

Object.assign(MechEntity.prototype, {
  boss3Key() {
    if (this.opts.bossKind) return this.opts.bossKind;
    const n = String(this.name || '');
    return Object.keys(SPECIALS).find((k) => /^[A-Z]/.test(k) && n.startsWith(k)) || null;
  },
  // ---------- 自製的 AI 音效 ----------
  // 音效鍵的前綴：'boss_<名稱>'／'beast_<獸>'（部位與分離機體看本體）；不是 Boss 回傳 null
  bossSndPre() {
    if (this.sndPre !== undefined) return this.sndPre;
    let b = this;
    if (!b.opts.bossKind && b.opts.parent && b.parentEnt) b = b.parentEnt() || b;
    const k = b.boss3Key ? b.boss3Key() : null;
    const pre = !k ? null : /^beast_/.test(k) ? k : SND_NAME[k] ? 'boss_' + SND_NAME[k] : null;
    if (b === this || pre) this.sndPre = pre;
    return pre;
  },
  // 這隻 Boss 自己的音效（ev＝事件）；pos 沒給＝機體中心，null＝不分位置；local＝各端自己算的地方（不轉送給客機）
  bossSnd(ev, vol = 1, pos, gap = 0.08, local = false, o = null) {
    const pre = this.bossSndPre();
    if (!pre) return false;
    return sfxAi(pre + '_' + ev, vol, pos === undefined ? this.center() : pos, gap, local, o);
  },
  // Boss 共用的提示訊號（使用者定案：所有 Boss 同一個聲音）；機獸各自有一份 beast_<獸>_<事件>
  bossCue(ev, vol = 1, pos, gap = 0.15, local = false) {
    const pre = this.bossSndPre();
    const k = pre && /^beast_/.test(pre) ? pre + '_' + ev : 'boss_common_' + ev;
    return sfxAi(k, vol, pos === undefined ? this.center() : pos, gap, local);
  },
  // 循環音（每格呼叫，停止呼叫就淡出；各端自己算）。LOOP_ONESHOT 的是一段一段播
  bossLoop(ev, vol, rate = 1, pos) {
    const pre = this.bossSndPre();
    if (!pre || vol <= 0.01) return;
    const c = pos || this.center();
    if (SFX.dist(c) > 120 * DS) return;
    const k = pre + '_' + ev;
    if (ev === 'loop' && LOOP_ONESHOT.has(pre.slice(5))) {
      if (this.t - (this.sndLoopT || -99) < 5.6) return;
      if (sfxAi(k, vol, c, 1, true)) this.sndLoopT = this.t;
      return;
    }
    SFX.loopAt(k + this.id, '@' + k, vol, rate, c);
  },
  // 擊破（bossDie，房主；疊在 die 的一般爆炸上）：Boss 本體、部位、多足要塞的腳、浮游砲、大型兵器的腳與引擎
  bossDieSnd() {
    const pre = this.bossSndPre();
    if (this.isBoss && this.ai !== 'part') {
      if (pre && !/^beast_/.test(pre)) this.bossSnd('death', 1.2, undefined, 0.3); // 機獸在 beastCollapse
      return;
    }
    if (ACE_SND.has(this.name)) {
      SFX.aiPlay('ace_' + this.name.toLowerCase() + '_down', 1.1, 1, 0.04, 0.3, this.center()); // 專屬 AC 擊破
      return;
    }
    if (this.ai !== 'part') return;
    const k = this.opts.partKind,
      par = this.parentEnt && this.parentEnt();
    if (par && par.ai === 'colossus') {
      if (this.colIdx !== undefined) SFX.aiPlay('colossus_joint_break', 1, 1, 0.05, 0.1, this.center());
    } else if (k === 'bpart') this.bossCue('part_break', 1, undefined, 0.1);
    else if (k === 'joint') this.bossSnd('leg_break', 1, undefined, 0.1);
    else if (k === 'bit') this.bossSnd('bit_down', 0.8, undefined, 0.1);
  },
  // 失衡（房主，tierTick／boss3Tick 每格）：剛進入失衡時一聲（打斷大招的失衡由 tierInterrupt 自己播）；機獸在 beastLocalFx
  bossStagSnd() {
    if (this.staggerT > 0) {
      if (this.sndStag) return;
      this.sndStag = true;
      const pre = this.bossSndPre();
      if (pre && !/^beast_/.test(pre)) this.bossCue('stagger', 1, undefined, 0.3);
    } else this.sndStag = false;
    this.bossAiSnd();
  },
  // 動作寫在 MechEntity 本體的 Boss（MONOLITH、TETRARCH、ARCHON 的 bossAI，HELIOS 的 heliBossAI）：
  // 房主每格看 aiState 的變化播自製音效（位置音效，轉送給客機）
  bossAiSnd() {
    const k = this.boss3Key(),
      s = this.aiState,
      S = this.sndB || (this.sndB = {});
    if (!s) return;
    if (k === 'heli') {
      // 兩側引擎依序被打爆、迫降後週期性過載
      if (S.ph && s.phase > S.ph) this.bossSnd(s.phase === 2 ? 'engine_l' : 'engine_r', 1.1);
      S.ph = s.phase;
      const ov = s.phase === 3 && this.staggerT > 0;
      if (ov && !S.ov) this.bossSnd('overload', 1);
      S.ov = ov;
      return;
    }
    if (k === 'hunter') {
      // 電磁狩獵機的破碎爪（近戰出手的那一下）
      const ml = !!(this.melee && this.melee.active);
      if (ml && !S.ml) this.bossSnd('claw', 1, undefined, 0.2);
      S.ml = ml;
      return;
    }
    if (this.opts.bossKind || !(k === 'MONOLITH' || k === 'TETRARCH' || k === 'ARCHON')) return;
    // 突進（模式 3）
    const rush = s.pattern === 3 && s.rushT > 0;
    if (rush && !S.rush) this.bossSnd('rush', 1);
    S.rush = rush;
    // 雷射：第一型態的蓄力開始與發射、第二型態的橫掃
    const sweep = s.pattern === 4 && s.phase >= 2;
    if (sweep && !S.sweep) this.bossSnd('sweep', 1);
    S.sweep = sweep;
    // 踏地衝擊波（aiShock 的預警開始）
    if (s.stompT > 0 && !(S.stomp > 0)) this.bossSnd('stomp', 1.1);
    S.stomp = s.stompT || 0;
    // 近戰（ARCHON 的光束大劍）
    const ml = !!(this.melee && this.melee.active);
    if (ml && !S.ml) this.bossSnd('saber_swing', 1, undefined, 0.2);
    S.ml = ml;
    const W = S.w || (S.w = {});
    for (const slot in this.weapons) {
      const w = this.weapons[slot],
        o = W[slot] || (W[slot] = { ch: false, mag: w.mag });
      if (w.charging && !o.ch) this.bossSnd('laser_charge', 1);
      else if (!w.charging && o.ch) this.bossSnd('laser_fire', 1.1, this.muzzle(slot));
      o.ch = !!w.charging;
      // 火箭筒（MONOLITH 的 BZ-31）：彈匣少了一發＝開了一砲（疊在槍聲上）
      if (w.def && w.def.type === 'shell' && w.mag < o.mag) this.bossSnd('rocket', 0.9, undefined, 0.2);
      o.mag = w.mag;
    }
  },
  // 每格（房主與客機各自，bossFx 呼叫）：登場、移動的循環、大招的蓄力循環
  bossSndTick() {
    if (this.dead) return;
    if (this.opts.partKind === 'bit') return this.bossLoop('bit_loop', 0.35); // 浮游砲的飛行
    if (this.opts.partKind === 'sub') return this.cerbSndTick(); // 三機合體的分離機體
    if (ACE_SND.has(this.name)) return this.aceSndTick(); // 專屬 AC
    if (!this.isBoss || this.ai === 'part') return;
    const g = this.game,
      pre = this.bossSndPre();
    if (!pre || g.cine || /^beast_/.test(pre)) return; // 機獸：吼聲與腳步在 beastLocalFx
    if (!this.sndIntro) {
      // 登場（WARNING 橫幅的同時；不分位置）
      this.sndIntro = true;
      if (!g.lab) this.bossSnd('intro', 1, null, 1, true);
    }
    if (!this.mesh || !this.mesh.visible) return;
    // 移動／待機的循環（各 Boss 自己的條件）
    const k = this.opts.bossKind;
    let on = 1;
    if (k === 'worm')
      on = this.bossVis & 1 ? 1 : 0; // 地下鑽行
    else if (k === 'phantom')
      on = this.noLock ? 1 : 0; // 迷彩中
    else if (k === 'flagship')
      on = this.domeFrac > 0 ? 1 : 0; // 護盾罩著
    else if (k === 'train') on = 1;
    else if (this.noLock) on = 0; // 隧道裡、地下、分離中
    if (on) this.bossLoop('loop', 0.55);
    // 各 Boss 的動作中的循環（bossVis 的旗標：房主與客機都知道）
    if (k === 'rampart' && this.bossVis & 2) this.bossLoop('charge', 0.9); // 推土要塞的直線衝撞
    if (k === 'orbital' && this.bossVis & 2 && this.bx && this.bx[0] === 1)
      this.bossLoop('beam_loop', 0.9, 1, V(this.bx[1], this.pos.y, this.bx[2])); // 追蹤光柱
    if (k === 'reactor' && this.bossVis & 2) this.bossLoop('core_loop', 0.7); // 機關心臟的核心外露
    // 大招蓄力中（Boss 改版的打斷量表）
    const v = this.tierView && this.tierView();
    if (v && v.chg >= 0) this.bossLoop('charge_loop', 0.75);
  },
  // 專屬 AC（各端每格）：介入、狀態的切換與循環；只有房主知道的（突進、QB、踏地）在房主播、轉送給客機
  aceSndTick() {
    const g = this.game,
      n = this.name.toLowerCase(),
      S = this.sndA || (this.sndA = {}),
      c = this.center();
    const k = (ev) => 'ace_' + n + '_' + ev;
    if (!S.intro) {
      S.intro = true; // 介入（名牌與介紹的同時；不分位置）
      if (!g.lab && !g.cine) sfxAi(k('intro'), 1, null, 1, true);
    }
    const v = this.bossVis || 0;
    // 浮出水面（MARSH）、開火現形（WHITEOUT）：bossVis 2 解除的那一下
    if ((n === 'marsh' || n === 'whiteout') && S.v2 && !(v & 2))
      sfxAi(k(n === 'marsh' ? 'surface' : 'decloak'), 1, c, 0.5, true);
    S.v2 = !!(v & 2);
    if (n === 'specimen' && v & 4 && SFX.dist(c) < 120 * DS)
      SFX.loopAt(k('overload_loop') + this.id, '@' + k('overload_loop'), 0.7, 1, c); // 過載中
    // 往上爬（SPIRE 爬上高台、ZENITH 離地太低就爬升）：用位置的變化（客機也一樣）
    if (n === 'spire' || n === 'zenith') {
      const dt = this.t - (S.ty || this.t);
      if (dt > 0) {
        const vy = (this.pos.y - (S.y === undefined ? this.pos.y : S.y)) / dt;
        if (vy > 7 * DS && this.t - (S.climbT || -99) > 4) {
          S.climbT = this.t;
          sfxAi(k('climb'), 1, c, 1, true);
        }
      }
      S.y = this.pos.y;
      S.ty = this.t;
    }
    if (this.remote) return;
    const s = this.aiState || {};
    // 突進（KILN、PROSPECTOR、SLUICE 的衝刺）：突擊推進開始的那一下
    const ab = this.abT > 0;
    if (ab && !S.ab) {
      if (n === 'kiln' || n === 'prospector') SFX.aiPlay(k('rush'), 1, 1, 0.04, 1, c);
      else if (n === 'sluice') SFX.aiPlay(k('dash'), 1, 1, 0.04, 1, c);
    }
    S.ab = ab;
    // 決鬥（SIROCCO 的近距離連續 QB）
    if (n === 'sirocco' && this.qbT > 0 && !S.qb) SFX.aiPlay(k('duel'), 0.9, 1, 0.04, 1.2, c);
    S.qb = this.qbT > 0;
    // 踏地衝擊波（STEVEDORE、KEEL）：預警開始的那一下
    if ((n === 'stevedore' || n === 'keel') && s.stompT > 0 && !(S.st > 0))
      SFX.aiPlay(k('stomp'), 1.1, 1, 0.04, 1, c);
    S.st = s.stompT || 0;
  },
  // 三機合體分離後的三台（各端自己算、不轉送）：α 出刀、β 狙擊、γ 接上修理光束的那一下
  cerbSndTick() {
    const n = String(this.name || ''),
      S = this.sndC || (this.sndC = {});
    if (/α/.test(n)) {
      const on = !!(this.melee && this.melee.active);
      if (on && !S.m) this.bossSnd('alpha', 1, undefined, 0.3, true);
      S.m = on;
    } else if (/β/.test(n)) {
      const r = Math.max(this.recoil.r || 0, this.recoil.l || 0);
      if (r > 0.3 && r > (S.r || 0) + 0.1) this.bossSnd('beta', 1, undefined, 0.3, true); // 開火的後座
      S.r = r;
    } else if (/γ/.test(n)) {
      const on = this.linkId >= 0;
      if (on && !S.l) this.bossSnd('gamma', 0.8, undefined, 0.5, true);
      S.l = on;
    }
  },
  // 最終型態專屬招式本身的聲音（有的 Boss 才有）
  bossSpecialSnd() {
    const ev = SPECIAL_SND[this.boss3Key()];
    return !!ev && this.bossSnd(ev, 1);
  },
  // 這隻 Boss 的最終型態專屬招式（Boss 改版的打斷大招也用它當第三型態的大招，mech-boss-tier.js）
  boss3Spec() {
    return SPECIALS[this.boss3Key()] || null;
  },
  // 第三型態的專屬招式（updateAI 每格；dt 已乘上節奏）。有刁鑽度時改由 tierTick 蓄力後放出
  boss3Tick(dt, pl) {
    if (this.isBoss) this.bossStagSnd();
    if (!this.isBoss || !pl || this.bossPhase() < 3) return;
    const S = SPECIALS[this.boss3Key()];
    if (!S) return;
    const s = this.aiState;
    if (s.b3T === undefined) s.b3T = 3; // 進入第三型態後 3 秒放第一次
    s.b3T -= dt;
    if (s.b3T > 0 || this.staggerT > 0 || (this.noLock && this.opts.bossKind === 'trinity')) return;
    s.b3T = S.cd * rnd(0.85, 1.15);
    const g = this.game;
    g.flashMsg(`${this.name.split(' ')[0]}：${S.name}！`, 0xff4030, 1.4);
    if (!this.bossCue('final_call', 0.9)) SFX.play('alarm', 0.5, 0.9, 0.02, 0.5, this.center());
    this.bossSpecialSnd();
    S.fn(this, pl);
  },
  // ----- 招式的零件 -----
  b3Dm() {
    return this.dmgMul * (this.tierHalfK ? this.tierHalfK() : 1); // 只打斷一次的大招：減半
  },
  // 迫擊砲雨：目標附近 R 公尺內 n 發（gap 秒間隔），每發有落點預警
  b3Rain(pl, n, R, gap) {
    const g = this.game,
      dm = this.b3Dm();
    for (let i = 0; i < n; i++)
      g.later(i * gap, () => {
        if (this.dead || pl.dead) return;
        const a = Math.random() * Math.PI * 2,
          r = (i === 0 ? rnd(0, 2) : rnd(2, R)) * DS;
        const lead = pl.vel
          .clone()
          .setY(0)
          .multiplyScalar(this.tierFlag && this.tierFlag('lead') ? 0 : 0.4);
        const tp = pl.pos
          .clone()
          .add(lead)
          .add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
        g.mortarShot(this, tp, { dmg: 420 * dm, im: 700 * dm, R: 5 * MS });
      });
  },
  // 直線砲擊：從自己往目標方向（穿過目標）一路落下 n 發
  b3Line(pl, n, step, gap) {
    const g = this.game,
      dm = this.b3Dm();
    const d = pl.pos.clone().sub(this.pos).setY(0);
    if (d.lengthSq() < 1e-4) d.set(0, 0, -1);
    d.normalize();
    const start = pl.pos.clone().addScaledVector(d, -step * DS * (n / 2));
    for (let i = 0; i < n; i++)
      g.later(i * gap, () => {
        if (this.dead) return;
        g.mortarShot(this, start.clone().addScaledVector(d, i * step * DS), {
          dmg: 400 * dm,
          im: 700 * dm,
          R: 4.5 * MS,
        });
      });
  },
  // 地面衝擊波（以自己為中心）
  b3Shock(R) {
    const g = this.game,
      dm = this.b3Dm();
    const gy = g.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 1 * MS);
    g.shockStart(this, {
      at: V(this.pos.x, gy, this.pos.z),
      R,
      sp: 22,
      dl: 0.9,
      dmg: 360 * dm,
      im: 1000 * dm,
    });
  },
  // 連續的衝擊波
  b3Shocks(n, gap) {
    for (let i = 0; i < n; i++) this.game.later(i * gap, () => !this.dead && this.b3Shock(18 + i * 6));
  },
  // 目標周圍依序噴發（小範圍衝擊波，有預警）
  b3Erupt(pl, n, R) {
    const g = this.game,
      dm = this.b3Dm();
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++)
      g.later(i * 0.35, () => {
        if (this.dead || pl.dead) return;
        const a = a0 + (i / n) * Math.PI * 2;
        const x = pl.pos.x + Math.cos(a) * R * 0.6 * DS,
          z = pl.pos.z + Math.sin(a) * R * 0.6 * DS;
        const gy = g.world.groundAt(x, z, pl.pos.y + 1 * MS);
        g.shockStart(this, { at: V(x, gy, z), R: 7, sp: 12, dl: 0.8, dmg: 300 * dm, im: 900 * dm });
      });
  },
  // 能量環（QB 的無敵時間能穿過）
  b3Ring(R) {
    const dm = this.b3Dm();
    this.game.pulseRing(this, { R, sp: 22, band: 1.8, dmg: 360 * dm, im: 800 * dm });
  },
  // 地雷：目標周圍 n 顆（air＝空中地雷）
  b3Mines(pl, n, R, air = false) {
    if (this.tierFlag && this.tierFlag('mines')) return; // Boss 改版：布雷的部位壞了
    const g = this.game,
      dm = this.b3Dm();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(-0.3, 0.3),
        r = rnd(R * 0.5, R) * DS;
      const p = pl.pos.clone().add(V(Math.cos(a) * r, air ? rnd(2, 7) * MS : 0, Math.sin(a) * r));
      g.layMine(this, p, { dmg: 380 * dm, im: 600 * dm, R: 4 * MS, life: air ? 8 : 14, air, quiet: i > 0 });
    }
  },
  // 燃燒地面：目標周圍
  b3Pools(pl, n, R) {
    const g = this.game,
      dm = this.b3Dm();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const p = pl.pos.clone().add(V(Math.cos(a) * R * 0.7, 0, Math.sin(a) * R * 0.7).multiplyScalar(DS));
      g.mortarShot(this, p, { dmg: 300 * dm, im: 500 * dm, R: 4 * MS });
      g.later(1.8, () => g.addPool(this, p, 4.5, 7, 120 * dm));
    }
  },
  // 武器連射：每個武器槽連開 n 次（gap 秒間隔）
  b3Volley(pl, n, gap, slots = ['rarm', 'larm', 'rback', 'lback']) {
    const g = this.game;
    for (let i = 0; i < n; i++)
      g.later(i * gap, () => {
        if (this.dead || pl.dead || !this.canAct()) return;
        for (const k of slots) {
          const w = this.weapons[k];
          if (!w || !w.def || w.def.type === 'none') continue;
          w.cd = 0;
          if (w.mag <= 0) w.mag = Math.max(1, Math.min(w.def.mag || 1, w.ammo || 1));
          this.fire(k, pl.center().addScaledVector(pl.vel, 0.3), pl);
        }
      });
  },
  // 光束：from → 方向 dir，預警 dl 秒後發射
  b3Beam(from, dir, dl, o = {}) {
    const g = this.game,
      dm = this.b3Dm();
    const range = o.range || 80;
    g.fx.warnLine(from, from.clone().addScaledVector(dir, range * DS), dl, 0xff3050, 0.1);
    g.later(dl, () => {
      if (this.dead) return;
      g.beamAttack(this, from, dir, {
        range,
        dmg: (o.dmg || 520) * dm,
        im: (o.im || 900) * dm,
        w: 0.9,
        color: o.color || 0xff4060,
        width: 0.35,
        attr: o.attr, // 機獸的刺彈是實彈（沒給＝能量）
      });
      // o.snd＝這隻的專屬音效的事件名稱（機獸的鬃甲、刺彈、斬擊波…）
      if (!(o.snd && this.bossSnd(o.snd, 0.9, from, 0.05))) SFX.play('laserBig', 0.8, 0.9, 0.05, 0.05, from);
    });
  },
  // 十字雷射：穿過目標的兩道互相垂直的光束
  b3Cross(pl) {
    const c = pl.center();
    const a = Math.random() * Math.PI;
    for (const ang of [a, a + Math.PI / 2]) {
      const d = V(Math.cos(ang), 0, Math.sin(ang));
      this.b3Beam(c.clone().addScaledVector(d, -45 * DS), d, 1.0, { range: 90 });
    }
  },
  // 扇形散射：朝目標 n 道（間隔 step 弧度）
  b3Fan(pl, n, step, snd) {
    const from = this.center();
    const d0 = pl.center().sub(from);
    const yaw = Math.atan2(d0.x, d0.z);
    const L = Math.hypot(d0.x, d0.z) || 1;
    const pitch = Math.atan2(d0.y, L);
    for (let i = 0; i < n; i++) {
      const y = yaw + (i - (n - 1) / 2) * step;
      const d = V(Math.sin(y) * Math.cos(pitch), Math.sin(pitch), Math.cos(y) * Math.cos(pitch));
      this.b3Beam(from.clone(), d, 1.1, { range: 120, dmg: 600, snd });
    }
  },
  // 光束牢籠：目標周圍 n 個點同時往中心照（預警後發射）
  b3Cage(pl, n, R) {
    const c = pl.center();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const from = c.clone().add(V(Math.cos(a) * R * DS, 4 * MS, Math.sin(a) * R * DS));
      const d = c.clone().sub(from).normalize();
      this.b3Beam(from, d, 1.2, { range: R * 2.2, dmg: 420 });
    }
  },
  // 光柱：目標周圍 n 處，預警圈後落下
  b3Pillars(pl, n, R) {
    const g = this.game,
      dm = this.b3Dm();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2,
        r = i === 0 ? 0 : rnd(3, R) * DS;
      const p = pl.pos.clone().add(V(Math.cos(a) * r, 0, Math.sin(a) * r));
      p.y = g.world.groundAt(p.x, p.z, p.y + 1.5 * MS);
      const dl = 1.3 + i * 0.15;
      g.fx.warnCircle(p, 3.5 * MS, dl);
      g.netEv({ t: 'warn', p: p.toArray().map((x) => +x.toFixed(2)), R: 3.5 * MS, dl });
      g.later(dl, () => {
        if (this.dead) return;
        g.fx.bolt(p.clone().setY(p.y + 60 * MS), p, 0xbfe8ff, 0.3, 's'); // 天上劈下的閃電（砲火特效「華麗」）
        g.fx.pillarStrike(p, 3.5 * MS);
        g.blastTeam(p.clone().setY(p.y + 1 * MS), 520 * dm, 900 * dm, 3.8 * MS, this.team, this);
      });
    }
  },
});
