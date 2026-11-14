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
import { REGIONS } from '../data/story.js';

// 選曲用自己的亂數（不動 Math.random：冒煙測試固定種子時，遊戲邏輯拿到的亂數不受配樂影響）
const brnd = makeRng(0x6b6d);

// 2026-11-06 配樂重選：多種樂器合奏的混合交響／交響金屬／電子（src/assets/bgm/CREDITS.txt）
const SETS = [
  ['explore1', 'explore2', 'explore3'],
  ['alert1', 'alert2', 'alert3', 'alert4'],
  ['combat1', 'combat2', 'combat3', 'combat4', 'combat5', 'combat6'],
  ['boss1', 'boss2', 'boss3', 'boss4', 'boss5'],
];
const AIR_SET = ['air1', 'air2', 'air3'];
// AI 配樂（docs/audio-design.md 的「AI 配樂」）：每章每種區段類型一首（lib/bgm-c<章>.js，進到那一章才載入）。
// 探索／警戒＝平時版（<類型>_calm，同一首、同速度），交戰＝交戰版，Boss＝這一章的 Boss 曲，
// Boss 最終型態（強度 4）＝這一章主題歌的副歌（超時空要塞式）。同一首的平時版↔交戰版從同一個位置交叉淡化。
// 沒有那一章的檔案或那種類型時用上面的 SETS。
const CH_OF_THEME = {};
for (const r of REGIONS) for (const t of r.themes) CH_OF_THEME[t] = r.chapter;
const AIR_CH = [4, 5, 6]; // 有空戰曲的章
const LV_VOL = [0.55, 0.72, 0.95, 1.0]; // 各級的音量
const LV_LP = [2200, 7000, 20000, 20000]; // 各級的低通（探索時悶一點）
const UP_T = 0.8; // 往上切換：目標維持幾秒
const DOWN_T = 8; // 往下切換：目標維持幾秒
const PAUSE_STATES = { pause: 1, modpick: 1, rangecfg: 1 };

Object.assign(Game.prototype, {
  // 第一次進任務時以 <script> 載入 lib/bgm-assets.js（約 27 MB，不內嵌）
  bgmLoad() {
    if (window.MECH_CORDON_BGM) return Promise.resolve(true);
    if (this.bgmLoading) return this.bgmLoading;
    this.bgmLoading = new Promise((res) => {
      const s = document.createElement('script');
      s.src = 'lib/bgm-assets.js';
      s.onload = () => res(!!window.MECH_CORDON_BGM);
      s.onerror = () => res(false);
      document.head.appendChild(s);
      setTimeout(() => res(!!window.MECH_CORDON_BGM), 20000);
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
  // 這一場的章與區段類型（AI 配樂用）：主線看出擊的章與目前區段，其他依地圖主題對應的章
  bgmCtx() {
    let ch = 0,
      type = '';
    const so = this.camp && this.campSortie ? this.campSortie() : null;
    if (so && so.chapter) ch = so.chapter;
    if (!ch && this.world) ch = CH_OF_THEME[this.world.themeKey] || 0;
    if (this.camp) type = this.campSegType();
    else if (this.campC && this.campC.view) type = this.campC.view.type;
    if (this.airMode) {
      type = 'air';
      if (!AIR_CH.includes(ch)) ch = 5;
    }
    if (!type) type = this.isBossLevel ? 'boss' : 'battle';
    return ch ? { ch, type } : null;
  },
  // 第一次進到那一章時以 <script> 載入 lib/bgm-c<章>.js（每章約 25 MB）。先載 lib/bgm-ai.js（有哪些章與版本，
  // 建置產生）：沒有的章不去載；網址帶版本（伺服器給 lib/ 的檔案 1 小時快取，重新產生之後要拿新的）
  bgmLoadCh(ch) {
    const k = 'MECH_CORDON_BGM_C' + ch;
    if (window[k]) return Promise.resolve(true);
    this.bgmChLoad = this.bgmChLoad || {};
    if (this.bgmChLoad[ch]) return this.bgmChLoad[ch];
    const js = (src) =>
      new Promise((res) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = () => res(true);
        s.onerror = () => res(false);
        document.head.appendChild(s);
        setTimeout(() => res(false), 25000);
      });
    const http = location.protocol.startsWith('http');
    return (this.bgmChLoad[ch] = (async () => {
      if (!window.MECH_CORDON_BGM_AI_CH) await js('lib/bgm-ai.js' + (http ? '?t=' + Date.now() : ''));
      const v = (window.MECH_CORDON_BGM_AI_CH || {})[ch];
      if (!v) return false;
      await js(`lib/bgm-c${ch}.js` + (http ? '?v=' + v : ''));
      return !!window[k];
    })());
  },
  // 現在的強度（4＝Boss 的最終型態）
  bgmTarget() {
    if (this.airMode) return 'air';
    for (const b of this.bosses || []) if (!b.dead) return b.bossPhase && b.bossPhase() >= 3 ? 4 : 3;
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
    // 先載這一章的 AI 配樂；沒有那一章的檔案時才載舊的配樂
    if (B.ctx === undefined) B.ctx = this.bgmCtx();
    if (B.ctx && B.ai === undefined) {
      if (!B.aiLoading) {
        B.aiLoading = true;
        this.bgmLoadCh(B.ctx.ch).then((ok) => (B.ai = ok ? window['MECH_CORDON_BGM_C' + B.ctx.ch] : null));
      }
      return;
    }
    // 區段類型改變（主線的下一段）時重新決定
    const cx = this.bgmCtx();
    if (cx && B.ctx && (cx.ch !== B.ctx.ch || cx.type !== B.ctx.type)) {
      this.bgmStop(1.5);
      return;
    }
    if (!B.ai && !B.loading && !window.MECH_CORDON_BGM) {
      B.loading = true;
      this.bgmLoad();
      return;
    }
    if (!B.ai && !window.MECH_CORDON_BGM) return;
    const tg = this.bgmTarget();
    const lvOf = (x) => (x === 'air' ? 2 : x === 4 ? 3.5 : x);
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
  // AI 配樂：這個強度要播哪一首、從哪裡開始（null＝這一章沒有，改用舊的配樂）
  bgmAiPick(key) {
    const B = this.bgm,
      P = B.ai,
      I = P && P['@index'];
    if (!I) return null;
    const t = I[B.ctx.type] ? B.ctx.type : I.battle ? 'battle' : null;
    let name = null,
      off = null;
    if (key === 4 && I.theme) {
      name = 'theme';
      off = I.theme.chorus || 0;
    } else if (key === 3 || key === 4) name = I.boss ? 'boss' : t;
    else if (key === 'air') name = I.air ? 'air' : t;
    else if (t) name = key === 2 || !I[t].calm ? t : t + '_calm';
    if (!name || !P[name]) return null;
    // 同一首的平時版↔交戰版：從目前播放的位置接下去
    const cur = B.cur;
    if (off === null && cur && cur.ai && cur.base === name.replace(/_calm$/, '') && cur.dur)
      off = (SFX.ctx.currentTime - cur.t0) % cur.dur;
    return { name, off, b64: P[name], key: `bgmc${B.ctx.ch}_${name}` };
  },
  async bgmSwitch(key) {
    const B = this.bgm;
    const lv = key === 'air' ? 2 : key === 4 ? 3 : key;
    const ai = this.bgmAiPick(key);
    let name, b64, bkey;
    if (ai) {
      name = ai.name;
      b64 = ai.b64;
      bkey = ai.key;
    } else {
      if (!window.MECH_CORDON_BGM) {
        if (!B.loading) {
          B.loading = true;
          this.bgmLoad();
        }
        return;
      }
      const set = key === 'air' ? AIR_SET : SETS[lv];
      // 同一級換一首（和上一次的不同）
      name = set[Math.floor(brnd() * set.length)];
      if (set.length > 1 && B.last && B.last[lv] === name) name = set[(set.indexOf(name) + 1) % set.length];
      B.last = B.last || {};
      B.last[lv] = name;
      b64 = window.MECH_CORDON_BGM[name];
      bkey = 'bgm_' + name;
    }
    const old = B.key;
    B.key = key;
    B.lv = lv;
    const buf = await SFX.musicDecode(bkey, b64);
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
    // AI 配樂：照 bgmAiPick 的位置（主題歌的副歌、同一首的另一個版本接下去），否則從頭；舊的配樂從中間的隨機位置開始
    const off = ai ? Math.min(buf.duration - 1, Math.max(0, ai.off || 0)) : brnd() * buf.duration * 0.6;
    s.start(t, off);
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
    const keep = { [bkey]: 1 };
    if (B.cur && B.cur.bkey) keep[B.cur.bkey] = 1;
    for (const k in SFX.mbuf) if (k.startsWith('bgm') && !keep[k]) delete SFX.mbuf[k];
    B.cur = {
      s,
      g,
      lp,
      name,
      bkey,
      ai: !!ai,
      base: name.replace(/_calm$/, ''),
      dur: buf.duration,
      t0: t - off,
    };
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
