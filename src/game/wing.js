// Game：主線的僚機（主線擴充 D1，data/wingmen.js、docs/campaign-expansion-design.md）——有僚機同行的出擊（WING_SORTIES）
// 每個區段在玩家旁邊生成（AP 延續到下一段），Z 鍵／手把十字鍵左切換指令，倒地時站在旁邊 3 秒救起來，
// 好感度（save.story.bond）依救援、出擊完成與丟下不管增減，影響台詞。只有單人。行為在 entities/mech-wing.js。
import { SFX } from '../audio/audio.js';
import { DS, MS } from '../core/scale.js';
import { AC_ROSTER } from '../data/enemies.js';
import { WING, WINGMEN, WING_MODES, WING_SORTIES, wingAsm, wingFor } from '../data/wingmen.js';
import { MechEntity } from '../entities/mech-entity.js';
import { PALETTES } from '../render/materials.js';
import { buildReviveRing, reviveRingSet } from '../render/ground-marks.js';
import { Game } from './game.js';

Object.assign(Game.prototype, {
  // 這次出擊的僚機（沒有＝''）
  wingKey() {
    const c = this.camp;
    if (!c || this.campMp() || (!WING_SORTIES.has(c.sid) && !c.wingHire)) return ''; // 委託板可以雇用（board.js）
    if (!c.wingK)
      c.wingK = wingFor((c.choice && c.choice.key) || this.campLastPick(this.campSortie().chapter));
    return c.wingK;
  },
  wingBond(k) {
    const st = this.campStory();
    st.bond = st.bond || {};
    return st.bond[k] || 0;
  },
  wingBondAdd(k, v) {
    const st = this.campStory();
    st.bond = st.bond || {};
    st.bond[k] = Math.max(-5, Math.min(10, (st.bond[k] || 0) + v));
  },
  // 區段開始（campEnterSeg，玩家放好之後）
  wingSpawn() {
    this.wing = null;
    this.wingMode = this.wingMode || 'focus';
    this.wingHold = null;
    const k = this.wingKey();
    const type = this.campSegType();
    if (!k || type === 'supply' || type === 'air') return;
    const W = WINGMEN[k],
      R = AC_ROSTER[W.roster];
    const p = this.player;
    const a = new MechEntity(this, wingAsm(k), PALETTES[W.pal] || PALETTES.ally, {
      team: 'ally',
      palKey: W.pal,
      name: W.name,
      ai: 'ac',
      hpMul: W.hpMul * (this.scaleHp || 1),
      dmgMul: W.dmgMul * (this.scaleDmg || 1),
      stabMul: R.stabMul * 1.3,
      wantDist: W.wantDist,
      speedMul: R.speedMul,
      allyDur: 1e9,
    });
    const [x, z] = this.world.nearSolid(p.pos.x - 8 * DS, p.pos.z + 6 * DS);
    a.pos.set(x, this.world.groundAt(x, z, 999), z);
    a.mesh.position.copy(a.pos);
    a.allyT = 1e9;
    a.kits = 0;
    a.wing = k;
    const c = this.camp;
    const hp = c.wingHp === undefined ? 1 : c.wingHp;
    a.hp = Math.max(1, Math.round(a.maxHp * Math.max(0.5, hp))); // 上一段倒地的：下一段以 50% 回來
    this.allies.push(a);
    this.registerSpawn(a);
    this.wing = a;
    const ctx = this.campCtx({ wing: k });
    if (!c.wingIntro) {
      c.wingIntro = true;
      this.campComm('wingStart', ctx);
    }
  },
  // 每格（campTick）：指令的切換、救援
  wingTick(dt) {
    const a = this.wing,
      c = this.camp,
      p = this.player;
    if (!a || !c || !p) return this.wingRingDrop();
    // 指令：按下的那一格切換
    const on = this.act('wing');
    if (on && !this._wingK) {
      const i = WING_MODES.findIndex((m) => m.k === this.wingMode);
      const M = WING_MODES[(i + 1) % WING_MODES.length];
      this.wingMode = M.k;
      if (M.k === 'hold') this.wingHold = p.pos.clone();
      SFX.ui();
      this.flashMsg(`僚機指令：${M.name}（${M.tip}）`, 0x80ffb0, 1.6);
    }
    this._wingK = on;
    if (!a.wingDowned) return this.wingRingDrop();
    // 救援：站在綠色圈裡（水平距離；高度放寬）累積 REVIVE_T 秒；被打不會中斷，離開圈時進度慢慢退回
    const R = WING.REVIVE_R * MS;
    const near =
      !p.dead &&
      Math.hypot(p.pos.x - a.pos.x, p.pos.z - a.pos.z) < R &&
      Math.abs(p.pos.y - a.pos.y) < WING.REVIVE_Y * MS;
    c.wingRev = near ? (c.wingRev || 0) + dt : Math.max(0, (c.wingRev || 0) - dt * WING.REVIVE_DECAY);
    if (near) c.hint = `救援 ${a.name}… ${Math.min(100, Math.round((c.wingRev / WING.REVIVE_T) * 100))}%`;
    // 地上的綠色圈：範圍＋進度
    if (this.wingRing && this.wingRing.parent !== this.scene) this.wingRing = null;
    if (!this.wingRing) {
      this.wingRing = buildReviveRing(R);
      this.scene.add(this.wingRing);
    }
    this.wingRing.position.set(a.pos.x, a.pos.y, a.pos.z);
    reviveRingSet(this.wingRing, c.wingRev / WING.REVIVE_T, near, this.time || 0);
    if (c.wingRev >= WING.REVIVE_T) {
      c.wingRev = 0;
      this.wingRingDrop();
      a.wingRevive(WING.REVIVE_HP);
      this.fx.ring(a.center(), 6, 0x80ffb0);
      SFX.kit();
      this.wingBondAdd(a.wing, 1);
      this.campComm('wingRevive', this.campCtx({ wing: a.wing }));
    }
  },
  // 拿掉地上的救援圈
  wingRingDrop() {
    const g = this.wingRing;
    if (!g) return;
    this.wingRing = null;
    if (g.parent) g.parent.remove(g);
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  },
  // 僚機倒地（entities/mech-wing.js）
  wingOnDown(a) {
    this.flashMsg(`${a.name} 倒地 — 靠近救援`, 0xff8a50, 2.2, {
      k: 'warn',
      m: `${a.name} 倒地`,
      s: '站在旁邊救援',
    });
    this.campComm('wingDown', this.campCtx({ wing: a.wing }));
  },
  // 離開區段（campLeave 的 capture 之前）：記下 AP；倒地沒救＝好感度 −1
  wingCapture() {
    const a = this.wing,
      c = this.camp;
    if (!a || !c) return;
    this.wingRingDrop();
    if (a.wingDowned) {
      c.wingHp = 0;
      this.wingBondAdd(a.wing, -1);
    } else c.wingHp = a.hp / a.maxHp;
  },
  // 出擊完成（campEnd）：僚機還在的話好感度 +1
  wingSortieEnd(success) {
    const k = this.camp && this.camp.wingK;
    if (!k || !success) return;
    if (this.wing && !this.wing.wingDowned) this.wingBondAdd(k, 1);
  },
  // 簡報的一列（hub.js）
  wingBriefHtml(sid) {
    if (!WING_SORTIES.has(sid)) return '';
    const k = wingFor(this.campLastPick(9));
    const W = WINGMEN[k];
    return `<div class="brFoe"><div class="brFN"><b>僚機同行：${W.name}</b><span class="dim">${W.title}・好感度 ${this.wingBond(k)}</span></div><div class="brFT">Z 鍵／手把十字鍵左切換指令（集中攻擊、自由攻擊、跟著我、守在這裡）；倒地時站在旁邊 3 秒救起來</div></div>`;
  },
});
