// ---------- MechEntity 擴充：僚機的行為（主線擴充 D1，data/wingmen.js；Game 端在 game/wing.js） ----------
// 僚機是友軍 AC（team ally、不會離場），wing＝角色的鍵。updateAI 的兩個掛勾（只在房主／單機）：
// wingTarget（選好目標之後：集中攻擊時改成玩家鎖定的目標，跟著我／守住時不追遠的敵人）、
// wingMove（離錨點太遠時先回去；倒地時什麼都不做）。倒地（wingDowned）：AP 歸零時不擊破，跪著等玩家救援。
import { DS } from '../core/scale.js';
import { WING } from '../data/wingmen.js';
import { MechEntity } from './mech-entity.js';

Object.assign(MechEntity.prototype, {
  // 錨點：守住＝下指令的位置，其他＝玩家
  wingAnchor() {
    const g = this.game;
    if (g.wingMode === 'hold' && g.wingHold) return g.wingHold;
    return g.player && !g.player.dead ? g.player.pos : null;
  },
  wingTarget(pl) {
    const g = this.game,
      P = g.player;
    if (g.wingMode === 'focus' && P && P.lock && !P.lock.dead && !P.lock.isProp && !P.lock.noLock)
      return P.lock;
    const A = this.wingAnchor();
    if (pl && A && (g.wingMode === 'follow' || g.wingMode === 'hold')) {
      const R = (WING.LEASH[g.wingMode] + 30) * DS;
      if (pl.pos.distanceTo(A) > R) return null; // 不追遠的敵人
    }
    return pl;
  },
  // 回傳 true＝這一格已處理（倒地、正在回到錨點）
  wingMove(dt) {
    if (this.wingDowned) {
      this.vel.set(0, this.vel.y, 0);
      this.move(dt, new THREE.Vector3(), false, false, false, null);
      return true;
    }
    const A = this.wingAnchor();
    if (!A) return false;
    const to = A.clone().sub(this.pos).setY(0);
    const d = to.length();
    if (d <= WING.LEASH[this.game.wingMode || 'focus'] * DS) return false;
    to.normalize();
    this.setAim(
      this.pos
        .clone()
        .add(to.clone().multiplyScalar(30 * DS))
        .setY(this.center().y),
    );
    this.move(dt, to, false, false, d > 50 * DS, null);
    return true;
  },
  // AP 歸零（takeDamage，die 之前）：倒地，回傳 true
  wingDown() {
    if (this.wingDowned) return true;
    this.wingDowned = true;
    this.downed = true;
    this.hp = 1;
    this.noLock = true; // 敵人不再瞄準它
    this.iFrames = 1e9;
    this.game.wingOnDown(this);
    return true;
  },
  wingRevive(k) {
    this.wingDowned = false;
    this.downed = false;
    this.noLock = false;
    this.iFrames = 1.5;
    this.hp = Math.max(1, Math.round(this.maxHp * k));
  },
});
