// ============================================================
//  聲音與打擊回饋：環境音與殘響（依地圖主題）、腳步、低 AP 心跳、
//  擊破確認與連殺、打出失衡、Boss 第二型態的提示
// ============================================================
import { Game } from './game.js';
import { SFX } from '../audio/audio.js';
import { clamp, lerp } from '../core/math.js';
import { ENV_OF_THEME } from '../audio/recipes.js';
import { DS, MS } from '../core/scale.js';

const STREAK_T = 4; // 連殺：上一次擊破後幾秒內再擊破才算連續
const WHIZ_R = 7; // 子彈掠過：離自機中心幾公尺內（× DS）

// 各主題的環境音（k＝循環檔、syn＝合成的風聲／海浪；v＝音量）與殘響（秒數、送出量）
const AMB = {
  industrial: {
    L: [
      { k: 'ambMach', v: 0.3 },
      { syn: 'wind', v: 0.18 },
    ],
    rev: [1.3, 0.16],
  },
  grid: { L: [{ k: 'ambHum', v: 0.35 }], rev: [1.0, 0.12] },
  desert: {
    L: [
      { k: 'ambLow', v: 0.35 },
      { syn: 'wind', v: 0.25 },
    ],
    rev: [1.2, 0.14],
  },
  snow: {
    L: [
      { syn: 'gust', v: 0.45 },
      { syn: 'wind', v: 0.3 },
    ],
    rev: [0.7, 0.07],
  },
  wasteland: {
    L: [
      { syn: 'wind', v: 0.35 },
      { k: 'ambLow', v: 0.25 },
    ],
    rev: [0.8, 0.09],
  },
  dunes: {
    L: [
      { syn: 'wind', v: 0.45 },
      { syn: 'gust', v: 0.15 },
    ],
    rev: [0.6, 0.06],
  },
  flooded: {
    L: [
      { k: 'ambRain', v: 0.35 },
      { k: 'ambLow', v: 0.2 },
    ],
    rev: [1.3, 0.16],
  },
  dam: {
    L: [
      { k: 'ambWater', v: 0.45 },
      { syn: 'wind', v: 0.15 },
    ],
    rev: [1.4, 0.16],
  },
  spaceport: {
    L: [
      { k: 'ambMach', v: 0.25 },
      { k: 'ambHum', v: 0.25 },
    ],
    rev: [1.3, 0.15],
  },
  grid086: {
    L: [
      { k: 'ambHum', v: 0.4 },
      { k: 'ambMach', v: 0.15 },
    ],
    rev: [2.2, 0.26],
  },
  xylem: {
    L: [
      { syn: 'sea', v: 0.5 },
      { syn: 'wind', v: 0.2 },
    ],
    rev: [0.8, 0.08],
  },
  orbit: { L: [{ k: 'ambHum', v: 0.3, r: 0.7 }], rev: [0.4, 0.04] },
  airspace: {
    L: [
      { syn: 'wind', v: 0.45 },
      { syn: 'gust', v: 0.2 },
    ],
    rev: [0.3, 0.03],
  },
  institute: {
    L: [
      { k: 'ambCave', v: 0.4 },
      { k: 'ambMach', v: 0.2 },
    ],
    rev: [2.6, 0.3],
  },
  // 移動要塞：引擎的低鳴、高處的風
  ark: {
    L: [
      { k: 'ambHum', v: 0.4 },
      { k: 'ambLow', v: 0.35 },
      { syn: 'wind', v: 0.35 },
    ],
    rev: [0.6, 0.06],
  },
  // 火山熔爐帶：低沉的地鳴、熔爐的機械聲、風
  volcano: {
    L: [
      { k: 'ambLow', v: 0.45 },
      { k: 'ambMach', v: 0.18 },
      { syn: 'wind', v: 0.25 },
    ],
    rev: [1.2, 0.12],
  },
};
// 地面材質：金屬地板的主題（一般地面也是金屬／混凝土構造）
const METAL_THEMES = { grid: 1, grid086: 1, orbit: 1, xylem: 1, spaceport: 1, institute: 1, ark: 1 };

Object.assign(Game.prototype, {
  // 進入戰區（startMission／客機開局／主線每段）後每格呼叫：主題變了才換環境音
  audioScene() {
    const w = this.world;
    if (!w) return;
    const T = w.theme || {};
    const key = `${w.themeKey}|${T.roof ? 1 : 0}|${T.weather || ''}`;
    if (SFX.ambKey === key) return;
    const A = AMB[w.themeKey] || AMB.industrial;
    let L = A.L.slice(),
      rev = A.rev;
    if (T.roof) {
      // 地下（岩頂）：沒有風，改成洞窟的低鳴與長殘響
      L = L.filter((x) => !x.syn).concat([{ k: 'ambCave', v: 0.4 }]);
      rev = [2.6, 0.3];
    }
    if (T.weather === 'rain' && !L.some((x) => x.k === 'ambRain')) L.push({ k: 'ambRain', v: 0.3 });
    SFX.ambient(L, key);
    SFX.setReverb(rev[0], rev[1]);
    // 槍聲、爆炸的反射（docs/audio-design.md）：依主題，有岩頂＝室內
    SFX.setEnv(T.roof ? 'indoor' : ENV_OF_THEME[w.themeKey] || 'open');
    SFX.surfAt = (p) => this.surfAt(p.x, p.z, p.y);
    SFX.barkSrc = (k, p) => this.barkPlay(k, p); // 敵兵的喊話（game/voice.js）
    SFX.threatOf = (e) => this.sfxThreat(e);
  },
  // 威脅導向的混音：正在攻擊玩家的敵人（主攻、預警中、Boss、敵對 AC）大聲一點、優先度高
  sfxThreat(e) {
    if (!e || e.team !== 'enemy') return 1;
    const sn = e.sn;
    if (e.isBoss || e.ai === 'ac' || (sn && (sn.tok || (sn.mv && sn.mv.ph === 'wind')))) return 1.6;
    return 1;
  },
  // 子彈從身邊飛過（docs/audio-design.md 第 2 期）：敵方的投射物經過自機 WHIZ_R 內（沒有打中）時，
  // 在最近的那一點播掠過聲（實彈＝撕裂聲、能量＝電弧的嗡）；房主與客機各自依自己的機體算，不轉送
  projWhiz(pr, prev) {
    const p = this.player;
    if (!p || p.dead || pr.owner === p || pr.team === p.team || !SFX.ctx) return;
    if (pr.kind === 'crate' || pr.kind === 'grenade') return;
    const c = p.center();
    const sx = pr.pos.x - prev.x,
      sy = pr.pos.y - prev.y,
      sz = pr.pos.z - prev.z;
    const L2 = sx * sx + sy * sy + sz * sz;
    if (L2 < 1e-6) return;
    const t = clamp(((c.x - prev.x) * sx + (c.y - prev.y) * sy + (c.z - prev.z) * sz) / L2, 0, 1);
    const q = { x: prev.x + sx * t, y: prev.y + sy * t, z: prev.z + sz * t };
    const dd = Math.hypot(q.x - c.x, q.y - c.y, q.z - c.z);
    if (dd > WHIZ_R * DS || dd < (p.radius || 2) + 1.2 * DS) return;
    // 還在接近中（最近點在線段的終點）就等下一格
    if (t >= 1) return;
    pr.whz = true;
    if (this.time - (this.whizT || -9) < 0.07) return;
    this.whizT = this.time;
    SFX.whiz(
      new THREE.Vector3(q.x, q.y, q.z),
      pr.kind !== 'bullet' && pr.kind !== 'shell' && pr.kind !== 'missile',
    );
  },
  // 機甲的重量（第 3 期）：自機的伺服馬達（轉身、起步、急停）、突擊推進的收尾、附近機體的推進器循環音
  audioMechTick(dt) {
    const p = this.player;
    if (!p || p.dead || !SFX.ctx || this.cine) {
      SFX.loopsAtTick();
      return;
    }
    const a = (this.sndM = this.sndM || { yaw: p.yaw, sp: 0, cd: 0, ab: false, turn: false });
    a.cd -= dt;
    let dy = p.yaw - a.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const w = Math.abs(dy) / Math.max(dt, 1e-3);
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (a.cd <= 0 && p.grounded && !p.boost) {
      if (w > 2.4 && !a.turn) {
        SFX.servo('turn', null, clamp(w / 6, 0.4, 1));
        a.cd = 0.35;
        a.turn = true;
      } else if (sp > 5 * DS && a.sp < 2 * DS) {
        SFX.servo('start');
        a.cd = 0.45;
      } else if (sp < 1.5 * DS && a.sp > 7 * DS) {
        SFX.servo('stop');
        a.cd = 0.45;
      }
    }
    if (w < 1) a.turn = false;
    a.yaw = p.yaw;
    a.sp = lerp(a.sp, sp, 0.3);
    if (a.ab && !(p.abT > 0)) SFX.abEnd(null);
    a.ab = p.abT > 0;
    // ECHO 的系統提示（第 4 期）：AP 一半與危險、自機失衡（回復到門檻以上才會再提醒）
    const hr = p.hp / p.maxHp;
    if (!this.lab && !this.range) {
      if (hr <= 0.25 && !a.ap25) {
        a.ap25 = a.ap50 = true;
        this.voiceCue('ap25');
      } else if (hr <= 0.5 && !a.ap50) {
        a.ap50 = true;
        this.voiceCue('ap50');
      }
    }
    if (hr > 0.6) a.ap50 = a.ap25 = false;
    else if (hr > 0.35) a.ap25 = false;
    if (p.staggerT > 0 && !a.stg) this.voiceCue('stagger');
    a.stg = p.staggerT > 0;
    // EN 用完：推進器過熱的嘶＋警示音
    const enOut = p.en < (p.enMax || 1) * 0.03;
    if (enOut && !a.enOut) SFX.overheat();
    a.enOut = enOut;
    // 附近機體的推進器（AC6 的評論：玩家靠聲音追蹤畫面外的高速機體）：最近的 4 台正在推進／懸浮的
    const L = [];
    for (const e of this.enemies || []) {
      if (e.dead || !e.pos || !(e.stats && e.stats.parts && e.stats.parts.legs)) continue;
      const on = e.abT > 0 ? 1 : e.boost || e.qbT > 0 ? 0.85 : e.hover ? 0.55 : !e.grounded ? 0.35 : 0;
      if (!on) continue;
      const d = SFX.dist(e.pos);
      if (d < 70 * DS) L.push([d, e, on]);
    }
    L.sort((x, y) => x[0] - y[0]);
    for (const [, e, on] of L.slice(0, 4))
      SFX.loopAt(
        'th' + e.id,
        'thrustLoop',
        on * 0.55 * (e.isBoss ? 1.3 : 1),
        e.abT > 0 ? 1.3 : e.boost ? 1.2 : 0.95,
        e.pos,
      );
    SFX.loopsAtTick();
  },
  // 主迴圈（任務中）每格：環境音、低 AP 心跳、Boss 第二型態
  audioTick(dt) {
    this.audioScene();
    this.audioMechTick(dt);
    const p = this.player;
    const k = p && !p.dead && !this.lab ? clamp((0.3 - p.hp / p.maxHp) / 0.3, 0, 1) : 0;
    SFX.heartbeat(k, dt);
    for (const b of this.bosses || []) {
      if (b.dead || !b.bossPhase) continue;
      const ph = b.bossPhase();
      if (b.phCue === undefined) b.phCue = b.forceP2 ? 2 : 1; // 一開始就是第二型態（危險條款）不提示
      if (ph <= b.phCue) continue;
      b.phCue = ph;
      SFX.cue('phase');
      this.voiceCue('bossPhase');
      this.camShake = Math.max(this.camShake, 0.25);
      // 插入畫面（ECHO 的胸像＋Boss 的名字）；關掉或沒有立繪時照舊是橫幅
      const phName = ph >= 3 ? '最終型態' : '第二型態';
      if (
        !this.ptCutIn('echo', {
          tag: `WARNING — ${phName}`,
          name: b.name,
          expr: 'surprised',
          color: '#ff4030',
        })
      )
        this.showBanner(phName, b.name, '#ff4030', 2.2, { k: 'phase' });
    }
  },
  // 腳步（MechEntity.ikGait 每半個步伐呼叫）：玩家與聽得到的距離內的機體
  // 地面材質（腳步聲與機甲特效的地面互動共用，entities/mech-vfx.js）：water／metal／ice／snow／sand／conc
  surfAt(x, z, y) {
    const w = this.world;
    if (!w) return 'conc';
    if (w.waterDepth(x, z) > 0.3 * MS && y < w.terrainHeight(x, z) + 1.5 * MS) return 'water';
    if (y > w.terrainHeight(x, z) + 0.6 || METAL_THEMES[w.themeKey]) return 'metal';
    if (w.onIce(x, z)) return 'ice';
    if (w.themeKey === 'snow') return 'snow';
    if (w.themeKey === 'dunes' || w.themeKey === 'desert') return 'sand';
    return 'conc';
  },
  mechStep(e) {
    const L = e.stats && e.stats.parts && e.stats.parts.legs;
    if (!L || L.type === 'tank' || e.flying || !this.world) return;
    // 腳步的地面互動（機甲特效；近處才產生，不轉送）
    if (this.ctrl.mechFx !== 'simple' && this.fx && this.camera && e.mvStep) e.mvStep();
    if (!SFX.ctx || (!e.isPlayer && SFX.dist(e.pos) > 40 * DS)) return;
    const surf = this.surfAt(e.pos.x, e.pos.z, e.pos.y);
    const wt = e.isBoss ? 1 : L.type === 'reverse' ? 0.25 : L.type === 'quad' ? 0.8 : 0.5;
    // 房主與客機各自依步伐算腳步聲，不轉送
    const m = SFX.mirror;
    SFX.mirror = null;
    SFX.step(surf, clamp(wt * (e.scale || 1), 0, 1), e.isPlayer ? null : e.pos, L.type);
    SFX.mirror = m;
  },
  // 擊破的回饋（房主／單機，onEnemyKilled）：自己的連殺與確認音；客機玩家的以事件送過去
  fbKill(e, from) {
    if (!from || from.team !== 'player' || this.pvp) return;
    const big = !!(e.isBoss || e.isElite || e.ai === 'ac' || e.ai === 'duelist');
    const by = (this.kStreakBy = this.kStreakBy || {});
    const key = from.slot !== undefined ? from.slot : 'me';
    const s = by[key] && this.time - by[key].t < STREAK_T ? by[key] : { n: 0 };
    s.n++;
    s.t = this.time;
    by[key] = s;
    if (from.isPlayer) {
      this.fbKillLocal(s.n, big);
      if (big && !e.isBoss && (e.ai === 'ac' || e.isElite) && !this.camp) this.voiceCue('aceDown'); // 主線有通訊的台詞
    } else if (from.slot !== undefined && this.net && this.net.role === 'host')
      this.netEv({ t: 'fb', s: from.slot, k: 'kill', n: s.n, b: big ? 1 : 0 });
  },
  fbKillLocal(n, big) {
    SFX.killConfirm(n, big);
    this.killStreak = { n, t: STREAK_T, pop: 1, big }; // HUD 的連殺計數
    if (big) this.comicHit(1); // 漫畫的衝擊畫格（只有開了的渲染風格）
  },
  // 打出失衡的回饋
  fbBreak(t, from) {
    if (!from || from.team !== 'player' || t.team !== 'enemy' || this.pvp) return;
    if (from.isPlayer) {
      SFX.breakFx();
      this.popBreak(t);
      this.comicHit(1);
      if (t.isBoss) {
        SFX.stinger(false); // Boss 的 BREAK：配樂的重音
        this.voiceCue('bossBreak');
      }
    } else if (from.slot !== undefined && this.net && this.net.role === 'host')
      this.netEv({ t: 'fb', s: from.slot, k: 'break', i: t.id });
  },
  // 客機收到回饋事件（mp-client.js 的 clientEvent）
  fbEvent(e) {
    if (e.s !== this.net.me) return;
    if (e.k === 'kill') this.fbKillLocal(e.n, !!e.b);
    else if (e.k === 'break') {
      SFX.breakFx();
      this.comicHit(1);
      const t = this.entById(e.i);
      if (t) this.popBreak(t);
    } else if (e.k === 'pqb') {
      const p = this.entById(e.i);
      if (p) this.pqbFx(p);
    } else if (e.k === 'ctr') {
      const p = this.entById(e.i);
      if (p) this.rbCtrFx(p, e.d); // 完美 QB 反擊的射擊（game/ranged.js）
    } else if (e.k === 'rb') SFX.rangedBonus(e.b);
    else if (e.k === 'crit') SFX.crit();
    else if (e.k === 'rx')
      SFX.reaction(e.r); // 屬性反應
    else if (e.k === 'pwr' && this.player)
      this.pwReadyLocal(this.player, e.w); // 蓄力射擊的充能完成
    else if (e.k === 'hm')
      this.hitMarkLocal(e.y, !!e.h); // 命中標記（feel.js）
    else if (e.k === 'ar')
      this.arFx(e.w, !!e.ok); // 主動裝填
    else if (e.k === 'sty') this.syClient(e.v, e.a); // 風格評價（style-meter.js）
  },
  // 完美 QB 的回饋（只給本人：房主／單機直接呼叫，客機由 fb 事件）
  pqbFx(p) {
    const c = p.center();
    this.fx.flash(c, 2.2, 0x9fe8ff, 0.18);
    this.fx.star(c, 1.2, 0x9fe8ff); // 十字星光（docs/vfx-design.md）
    if (p === this.player && this.ctrl.ghost !== 'off' && p.model)
      this.fx.ghosts.snap(p.model.group, 0x9fe8ff); // 殘影
    this.fx.shockwave(c, 6, 0x9fe8ff, 0.35);
    SFX.play('thrBurst', 1.2, 1.3, 0.04, 0.03, null, 'ui');
    this.popDamage(c.clone().add(new THREE.Vector3(0, 2 * p.dk, 0)), '完美迴避', false, true, false, 0, p.id);
    this.rumble(0.4, 0.9, 140);
    if (p === this.player) this.comicHit(0.7);
  },
});
