// ============================================================
//  任務中的動態配樂（docs/audio-design.md 第 5 期）：依戰況切換四級強度（0 探索、1 警戒、2 交戰、3 Boss；空域另有一首），
//  每一級一首循環曲（src/assets/bgm → lib/bgm-assets.js，第一次進任務才載入），交叉淡化。
//  往上切換快（穩定 0.8 秒）、往下慢（8 秒），探索時低通＋小聲。Boss 換型態時插一段重音（SFX.stinger）。
//  主迴圈每格呼叫 bgmFrame：任務中照戰況；暫停、三選一時壓低；其他畫面淡出停止。設定 ctrl.bgm＝'off' 時不播。
//  各端（房主、客機、單機）依自己看到的敵人狀態決定，不同步。
// ============================================================
import { Game } from './game.js';
import { SFX } from '../audio/audio.js';
import { makeRng } from '../core/math.js';

// 選曲用自己的亂數（不動 Math.random：冒煙測試固定種子時，遊戲邏輯拿到的亂數不受配樂影響）
const brnd = makeRng(0x6b6d);

const SETS = [
  ['explore1', 'explore2'],
  ['alert1', 'alert2'],
  ['combat1', 'combat2', 'combat3'],
  ['boss1', 'boss2'],
];
const AIR_SET = ['air1'];
const LV_VOL = [0.55, 0.72, 0.95, 1.0]; // 各級的音量
const LV_LP = [2200, 7000, 20000, 20000]; // 各級的低通（探索時悶一點）
const UP_T = 0.8; // 往上切換：目標維持幾秒
const DOWN_T = 8; // 往下切換：目標維持幾秒
const PAUSE_STATES = { pause: 1, modpick: 1, rangecfg: 1 };

Object.assign(Game.prototype, {
  // 第一次進任務時以 <script> 載入 lib/bgm-assets.js（約 10 MB，不內嵌）
  bgmLoad() {
    if (window.RUBICON_BGM) return Promise.resolve(true);
    if (this.bgmLoading) return this.bgmLoading;
    this.bgmLoading = new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'lib/bgm-assets.js';
      s.onload = () => res(!!window.RUBICON_BGM);
      s.onerror = () => res(false);
      document.head.appendChild(s);
      setTimeout(() => res(!!window.RUBICON_BGM), 20000);
    });
    return this.bgmLoading;
  },
  // 主迴圈每格（game.js 的 loop）
  bgmFrame(dt) {
    if (!SFX.ctx) return;
    const B = this.bgm;
    const st = this.state;
    const inMission =
      (st === 'play' ||
        st === 'ending' ||
        PAUSE_STATES[st] ||
        (st === 'settings' && this.settingsFrom === 'pause')) &&
      this.player &&
      this.world &&
      !this.cine &&
      !this.tut &&
      !this.range;
    if (!inMission || (this.ctrl && this.ctrl.bgm === 'off') || (this.lab && !this.lab.bgm)) {
      if (B) this.bgmStop(st === 'result' ? 2.5 : 1.2);
      return;
    }
    // 暫停：壓低
    const paused = st !== 'play' && st !== 'ending';
    const pv = paused ? 0.35 : 1;
    if (B && Math.abs((B.pv || 1) - pv) > 0.01) {
      B.pv = pv;
      if (B.cur) B.cur.g.gain.setTargetAtTime(LV_VOL[B.lv] * pv, SFX.ctx.currentTime, 0.25);
    }
    if (paused) return;
    this.bgmTick(dt);
  },
  // 現在的強度
  bgmTarget() {
    if (this.airMode) return 'air';
    for (const b of this.bosses || []) if (!b.dead) return 3;
    let alert = !!(this.wavePend || (this.waveMarks && this.waveMarks.length));
    const p = this.player;
    // 最近被打（各端都有：自己的 AP 有掉）
    if (p && this.bgmHp !== undefined && p.hp < this.bgmHp - 1) this.bgmHitT = this.time;
    if (p) this.bgmHp = p.hp;
    if (this.time - (this.bgmHitT || -99) < 6) return 2;
    for (const e of this.enemies || []) {
      if (e.dead || e.decoy || e.isObjective) continue;
      const sn = e.sn;
      // 客機沒有感知狀態：用快照的 aw（1＋狀態＋8×主攻）
      const s = sn && sn.on ? sn.st : e.aw ? (e.aw - 1) & 7 : -1;
      if (s === 2 || (e.aw && e.aw & 8)) return 2;
      if (s === 1 || s === 3) alert = true;
      if (s < 0 && !e.guardOf && p && e.pos.distanceTo(p.pos) < 60 * p.dk) return 2; // 沒有感知系統的（PvP、Boss 的雜兵）
    }
    return alert ? 1 : 0;
  },
  bgmTick(dt) {
    const B = (this.bgm = this.bgm || { lv: -1, want: -1, wantT: 0, pv: 1 });
    if (!B.loading && !window.RUBICON_BGM) {
      B.loading = true;
      this.bgmLoad();
      return;
    }
    if (!window.RUBICON_BGM) return;
    const tg = this.bgmTarget();
    const lvOf = (x) => (x === 'air' ? 2 : x);
    if (tg !== B.want) {
      B.want = tg;
      B.wantT = 0;
    }
    B.wantT += dt;
    if (tg === B.key) return;
    const up = B.lv < 0 || lvOf(tg) > B.lv || (tg === 'air') !== (B.key === 'air');
    if (B.wantT < (up ? (B.lv < 0 ? 0 : UP_T) : DOWN_T)) return;
    this.bgmSwitch(tg);
  },
  async bgmSwitch(key) {
    const B = this.bgm;
    const lv = key === 'air' ? 2 : key;
    const set = key === 'air' ? AIR_SET : SETS[lv];
    // 同一級換一首（和上一次的不同）
    let name = set[Math.floor(brnd() * set.length)];
    if (set.length > 1 && B.last && B.last[lv] === name) name = set[(set.indexOf(name) + 1) % set.length];
    B.last = B.last || {};
    B.last[lv] = name;
    const old = B.key;
    B.key = key;
    B.lv = lv;
    const buf = await SFX.musicDecode('bgm_' + name, window.RUBICON_BGM[name]);
    if (!buf || this.bgm !== B || B.key !== key) return;
    const c = SFX.ctx,
      t = c.currentTime;
    const s = c.createBufferSource(),
      lp = c.createBiquadFilter(),
      g = c.createGain();
    s.buffer = buf;
    s.loop = true;
    lp.type = 'lowpass';
    lp.frequency.value = LV_LP[lv];
    s.connect(lp).connect(g).connect(SFX.bgmBus);
    const upward = old === undefined || old === -1 || lv > (old === 'air' ? 2 : old);
    const fin = upward ? 1.8 : 4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(LV_VOL[lv] * (B.pv || 1), t + fin);
    // 從曲子中間的隨機位置開始（不要每次都同一段）
    s.start(t, brnd() * buf.duration * 0.6);
    const prev = B.cur;
    if (prev) {
      const o = prev;
      o.g.gain.cancelScheduledValues(t);
      o.g.gain.setValueAtTime(Math.max(0.0001, o.g.gain.value), t);
      o.g.gain.exponentialRampToValueAtTime(0.0001, t + (upward ? 1.2 : 4));
      try {
        o.s.stop(t + (upward ? 1.3 : 4.1));
      } catch (e) {}
    }
    // 解碼後的曲子很大（100 秒立體聲約 35 MB）：只留現在與正在淡出的那一首
    const keep = { ['bgm_' + name]: 1 };
    if (B.cur && B.cur.name) keep['bgm_' + B.cur.name] = 1;
    for (const k in SFX.mbuf) if (k.startsWith('bgm_') && !keep[k]) delete SFX.mbuf[k];
    B.cur = { s, g, lp, name };
  },
  bgmStop(fade = 1.2) {
    const B = this.bgm;
    this.bgm = null;
    if (!B || !B.cur || !SFX.ctx) return;
    const t = SFX.ctx.currentTime,
      o = B.cur;
    try {
      o.g.gain.cancelScheduledValues(t);
      o.g.gain.setValueAtTime(Math.max(0.0001, o.g.gain.value), t);
      o.g.gain.exponentialRampToValueAtTime(0.0001, t + fade);
      o.s.stop(t + fade + 0.1);
    } catch (e) {}
  },
});
