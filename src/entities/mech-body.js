// ============================================================
//  Boss 的身體部位破壞（docs/boss-part-break-design.md；資料 data/boss-body.js）
//  身體區域不是實體、不用鎖定：打在哪一塊外框（render/hit-parts.js 的 rig.hb）就記到那個區域，累積到門檻就壞。
//  判定只在房主／單機（takeDamage 裡的 bodyDmg）；狀態是一個位元遮罩，隨快照的 bd 給客機（net/snapshot.js），
//  外觀（拆掉節點、冒火花與煙）各端自己做（bodyShow／bodyTick，specialFx 每格呼叫）。
//  mixin：不能 export。
// ============================================================
import { SFX } from '../audio/audio.js';
import { BODY, BODY_HP, BODY_SMOKE_DT, BODY_STUN, BODY_WEAK } from '../data/boss-body.js';
import { rnd } from '../core/math.js';
import { fling, local } from '../render/foe-damage.js';
import { charParts, nearestSurface } from '../render/hit-parts.js';
import { MechEntity } from './mech-entity.js';

const _bp = new THREE.Vector3(),
  _bn = new THREE.Vector3(),
  _bs = new THREE.Vector3();

Object.assign(MechEntity.prototype, {
  // 這隻的身體區域（沒有＝null）：只有 Boss 本體
  bodyDefs() {
    if (this._bodyD !== undefined) return this._bodyD;
    const key = this.isBoss && this.ai !== 'part' && this.boss3Key ? this.boss3Key() : null;
    return (this._bodyD = (key && BODY[key]) || null);
  },
  // 名稱 → 模型上的節點（機獸＝區塊；其他 Boss＝rig.extra 或有名稱的節點）
  bodyNode(name) {
    const m = this.model;
    if (!m || !name) return null;
    return (
      (m.beast && m.beast.nodes && m.beast.nodes[name]) ||
      (m.extra && m.extra[name] && m.extra[name].isObject3D && m.extra[name]) ||
      m.group.getObjectByName(name) ||
      null
    );
  },
  // 狀態（第一次用到時建）：reg＝每個外框屬於哪個區域（−1＝都不是）
  bodyState() {
    if (this.body) return this.body;
    const D = this.bodyDefs(),
      m = this.model;
    if (!D || !m || !m.hb) return null;
    const of = new Map();
    D.forEach((R, i) => {
      for (const n of R.nodes) {
        const o = this.bodyNode(n);
        if (o) of.set(o, i);
      }
    });
    const reg = new Int8Array(m.hb.length).fill(-1);
    m.hb.forEach((h, k) => {
      for (let p = h.node; p && p !== m.group; p = p.parent)
        if (of.has(p)) {
          reg[k] = of.get(p);
          break;
        }
    });
    return (this.body = { reg, acc: D.map(() => 0), mask: 0, shown: 0, t: 0, n: 0 });
  },
  // 這一下打在哪個區域：累積、打壞；回傳傷害（壞掉的區域是弱點）。takeDamage 在各種減傷之後呼叫（房主／單機）
  bodyDmg(dmg, at, dir, from) {
    const D = this.bodyDefs();
    if (!D || this.dead || !(dmg > 0)) return dmg;
    const S = this.bodyState();
    if (!S) return dmg;
    let i = this.hitPart; // 投射物與雷射已經算好的外框
    if (i === undefined) {
      if (!at) return dmg;
      // 近戰、爆炸…：離攻擊來的位置最近的表面
      _bs.copy(at);
      if (dir && dir.lengthSq() > 1e-6) _bs.addScaledVector(_bn.copy(dir).normalize(), -20);
      i = nearestSurface(this.model, _bs, _bp, _bn);
    }
    const r = i >= 0 && i < S.reg.length ? S.reg[i] : -1;
    if (r < 0) return dmg;
    if (S.mask & (1 << r)) return dmg * (D[r].weak || BODY_WEAK);
    S.acc[r] += dmg;
    const tier = this.bossTier ? this.bossTier() : 0;
    if (S.acc[r] >= this.maxHp * BODY_HP[tier >= 5 ? 1 : 0]) this.bodyBreak(r);
    return dmg;
  },
  // 還沒壞的區域的耐久（0～1；HUD 與測試）
  bodyFrac(r) {
    const S = this.bodyState();
    if (!S) return 0;
    if (S.mask & (1 << r)) return 0;
    const tier = this.bossTier ? this.bossTier() : 0;
    return Math.max(0, 1 - S.acc[r] / (this.maxHp * BODY_HP[tier >= 5 ? 1 : 0]));
  },
  // 打壞（房主／單機）
  bodyBreak(r) {
    const D = this.bodyDefs(),
      S = this.bodyState(),
      g = this.game;
    if (!D || !S || S.mask & (1 << r)) return;
    S.mask |= 1 << r;
    const R = D[r];
    this.staggerT = Math.max(this.staggerT || 0, BODY_STUN);
    if (this.hrAdd) this.hrAdd('bossBreak', 0, 1, 0, true, 1); // 大的受擊動作（mech-hit-react.js）
    if (this.tierOn && this.tierOn()) {
      g.tierPartsBroken = (g.tierPartsBroken || 0) + 1; // 結算的部位加成（game/boss-tier.js）
      if (this.tierShellBreak) this.tierShellBreak('part'); // 打開裝甲殼
    }
    this.bodyShow();
    const o = this.bodyNode(R.at || R.nodes[0]);
    const c = o ? o.getWorldPosition(new THREE.Vector3()) : this.center();
    if (g.spawnPickup && g.world && !g.lab && !g.mapv)
      g.spawnPickup('ammo', new THREE.Vector3(c.x, g.world.groundAt(c.x, c.z, c.y + 1) + 0.6, c.z));
    SFX.explode(false, c);
    if (g.flashMsg) g.flashMsg(`部位破壞：${R.name}${R.tip ? ' — ' + R.tip : ''}`, 0xffe070, 1.8);
  },
  // 客機：照快照的遮罩
  bodySet(mask) {
    const S = this.bodyState();
    if (!S || S.mask === mask) return;
    S.mask = mask;
    this.bodyShow();
  },
  // 外觀（各端）：新壞掉的區域——cut 的節點拆下來飛出去、噴一次大的火花與碎片；壞掉的區域全部蓋上焦黑
  bodyShow() {
    const D = this.bodyDefs(),
      S = this.body,
      g = this.game,
      m = this.model;
    if (!D || !S || S.shown === S.mask) return;
    const fx = g && g.fx;
    const c = this.center();
    const fresh = [];
    D.forEach((R, i) => {
      const bit = 1 << i;
      if (S.mask & bit && !(S.shown & bit)) fresh.push(R);
    });
    // 拆下來的那一塊：網格合併過，先還原成各節點底下的網格，複製一份丟出去，原本的藏起來，再合併回去
    const cuts = [];
    for (const R of fresh)
      for (const n of R.cut || []) {
        const o = this.bodyNode(n);
        if (o && o.visible) cuts.push(o);
      }
    if (cuts.length) {
      const um = m.unmerge ? () => m.unmerge() : m.dmg && m.dmg.unmerge ? () => m.dmg.unmerge() : null;
      const rm = m.remerge ? () => m.remerge() : m.dmg && m.dmg.remerge ? () => m.dmg.remerge() : null;
      if (um && rm) um();
      m.group.updateMatrixWorld(true);
      for (const o of cuts) {
        if (fx && g.scene && um && rm) {
          const piece = o.clone(true);
          o.matrixWorld.decompose(piece.position, piece.quaternion, piece.scale);
          piece.traverse((q) => {
            q.visible = true;
            if (q.userData && (q.userData.xray || q.userData.helper)) q.visible = false;
          });
          const v = piece.position.clone().sub(c);
          v.y = 0;
          if (v.lengthSq() < 0.01) v.set(rnd(-1, 1), 0, rnd(-1, 1));
          v.normalize().multiplyScalar(rnd(9, 15));
          v.y = rnd(10, 16);
          local(fx, () => fling(fx, g.world, piece, v, 6));
        }
        o.traverse((q) => (q.visible = false)); // 連同底下的節點（外框的射線檢查看節點自己的 visible）
      }
      if (um && rm) rm();
    }
    // 焦黑：壞掉的區域還在的節點（合併改過之後也要重掛）
    const burnt = [];
    D.forEach((R, i) => {
      if (!(S.mask & (1 << i))) return;
      for (const n of R.nodes) {
        const o = this.bodyNode(n);
        if (o && o.visible) burnt.push(o);
      }
    });
    charParts(m, burnt);
    if (fx)
      local(fx, () => {
        for (const R of fresh) {
          const spots = [];
          for (const n of R.cut && R.cut.length ? R.cut : [R.at, R.at2]) {
            const o = this.bodyNode(n);
            if (o) spots.push(o.getWorldPosition(new THREE.Vector3()));
          }
          if (!spots.length) spots.push(c.clone());
          for (const p of spots) {
            _bn.copy(p).sub(c);
            if (_bn.lengthSq() < 1e-4) _bn.set(0, 1, 0);
            _bn.normalize();
            fx.flash(p, 2.2, 0xffd090, 0.16);
            for (let k = 0; k < 4; k++) {
              fx.spark(p, 0xffc070, _bp.copy(_bn).negate());
              fx.mechChips(p, _bn);
            }
            fx.smoke(p, 1.6, 0x2c2f34, 1.4, 3);
          }
        }
      });
    S.shown = S.mask;
  },
  // 壞掉的區域一直冒火花與煙（各端，specialFx 每格）
  bodyTick(dt) {
    const S = this.body;
    if (!S || !S.mask || this.dead) return;
    S.t -= dt;
    if (S.t > 0) return;
    S.t = BODY_SMOKE_DT;
    const g = this.game,
      fx = g && g.fx,
      m = this.model;
    if (!fx || !m.group.visible || this.fogHid) return;
    const D = this.bodyDefs();
    const sm = Math.max(1, this.radius / (4 * fx.k)); // 依體型
    S.n++;
    local(fx, () => {
      D.forEach((R, i) => {
        if (!(S.mask & (1 << i))) return;
        const o = this.bodyNode(S.n % 2 && R.at2 ? R.at2 : R.at || R.nodes[0]);
        if (!o) return;
        o.getWorldPosition(_bp);
        if (fx.skip(_bp, 2)) return;
        // 明顯的黑煙＋火舌，偶爾竄火花
        fx.smoke(_bp, 2.6 * sm, 0x0e0f11, 2.2, 5);
        fx.smoke(_bp, 1.6 * sm, 0x1c1d20, 1.4, 7);
        fx.fire(_bp, 1.2 * sm, 0);
        if (S.n % 3 === i % 3) fx.streaks(_bp, 4, 0xffc070, 9, 0.3, 22, null, 1);
      });
    });
  },
  // ---------- AI 端讀的削弱（data/boss-body.js 的 fx）----------
  bodyFlag(id) {
    const D = this.bodyDefs(),
      S = this.body;
    if (!D || !S || !S.mask) return false;
    const i = D.findIndex((R) => R.id === id);
    return i >= 0 && !!(S.mask & (1 << i));
  },
  // 壞掉的區域的 fx[key]（每個呼叫 fn）
  bodyEach(key, fn) {
    const D = this.bodyDefs(),
      S = this.body;
    if (!D || !S || !S.mask) return;
    D.forEach((R, i) => {
      if (S.mask & (1 << i) && R.fx && R.fx[key] !== undefined) fn(R.fx[key]);
    });
  },
  // 近戰招式的傷害倍率
  bodyMeleeK(name) {
    let k = 1;
    this.bodyEach('melee', (v) => (k *= v[name] ?? 1));
    return k;
  },
  // 這一招停用了嗎
  bodyOff(name) {
    let off = false;
    this.bodyEach('off', (v) => (off = off || v.includes(name)));
    return off;
  },
  // 數值類（速度倍率 spd…）：全部乘起來
  bodyK(key) {
    let k = 1;
    this.bodyEach(key, (v) => (k *= typeof v === 'number' ? v : 1));
    return k;
  },
  // 依名稱的數值（招式的距離倍率 reach、武器的發數 gunN）：沒有＝def
  bodyOf(key, name, def) {
    let out = def;
    this.bodyEach(key, (v) => {
      if (v && v[name] !== undefined) out = v[name];
    });
    return out;
  },
});
