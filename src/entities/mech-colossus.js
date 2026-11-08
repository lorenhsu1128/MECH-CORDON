// ---------- MechEntity 擴充：大型兵器（主線擴充 A1，docs/campaign-expansion-design.md；Game 端在 game/seg-colossus.js） ----------
// 本體（ai 'colossus'）沿路線緩慢移動、本身打不動（noLock）；身上的部位（腳部關節／引擎、砲塔）是獨立的敵方實體。
// 打斷足夠的腳部關節或引擎＝停機（倒下、甲板可以站上去），露出動力核心。col＝{ kind, path, i, dir, spd, ph }（房主）。
// bossVis：低 6 位＝打斷的腳（多足巨兵的腿隱藏，mech-boss.js 的 spiderFx）、64＝停機（倒下）；甲板的碰撞各端依 64 建立（colFx）。
import { MS } from '../core/scale.js';
import { MechEntity } from './mech-entity.js';

Object.assign(MechEntity.prototype, {
  // updateAI 開頭（房主／單機）：回傳 true＝已處理
  colAI(dt) {
    const c = this.col,
      g = this.game,
      w = g.world;
    if (!c) return true;
    this.t += dt;
    if (c.ph === 1 && c.path && c.path.length > 1) {
      const q = c.path[c.i];
      const dx = q.x - this.pos.x,
        dz = q.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 4 * MS) {
        if (c.i + c.dir >= c.path.length || c.i + c.dir < 0) {
          if (c.kind === 'ship') this.arrived = true;
          else c.dir *= -1; // 多足巨兵：來回巡行
        }
        if (!this.arrived) c.i = Math.max(0, Math.min(c.path.length - 1, c.i + c.dir));
      }
      if (!this.arrived && d > 0.01) {
        const s = Math.min(d, c.spd * dt);
        this.vel.set((dx / d) * c.spd, 0, (dz / d) * c.spd);
        this.pos.x += (dx / d) * s;
        this.pos.z += (dz / d) * s;
        const want = Math.atan2(-dx, -dz);
        let da = want - this.yaw;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        this.yaw += Math.max(-dt * 0.35, Math.min(dt * 0.35, da));
      } else this.vel.set(0, 0, 0);
    } else this.vel.set(0, 0, 0);
    this.aimYaw = this.yaw;
    this.pos.y = w.terrainHeight(this.pos.x, this.pos.z);
    // 身體擋住機體：把太近的玩家、友軍、一般敵人推出去（本體不參與 separateMechs）
    const R = this.radius * this.scale;
    for (const e of [...(g.players || []), ...(g.allies || []), ...g.enemies]) {
      if (!e || e.dead || e === this || e.opts.parent === this.id || e.flying) continue;
      const ex = e.pos.x - this.pos.x,
        ez = e.pos.z - this.pos.z;
      const d = Math.hypot(ex, ez);
      const top = this.colTop();
      if (d < R + e.radius && d > 0.01 && e.pos.y < top - 1) {
        const k = (R + e.radius - d) / d;
        e.pos.x += ex * k;
        e.pos.z += ez * k;
      }
    }
    this.bossTick(dt);
    return true;
  },
  // 甲板的高度（停機後）
  colTop() {
    return this.pos.y + this.model.height * (this.col && this.col.kind === 'ship' ? 0.62 : 0.38);
  },
  // 外觀與甲板（房主與客機，specialFx 呼叫）：停機＝倒下，甲板的碰撞依 bossVis 64 建立／拿掉
  colFx(dt) {
    const down = !!(this.bossVis & 64);
    const m = this.model;
    // 陸上戰艦沒有腳：停機時車身下沉、往一側傾
    if (this.opts.vehKey !== 'spider' && m && m.torso) {
      const k = Math.min(1, dt * 1.5);
      m.torso.position.y += ((down ? -0.12 * m.height : 0) - m.torso.position.y) * k;
      m.torso.rotation.z += ((down ? 0.07 : 0) - m.torso.rotation.z) * k;
    }
    const W = this.game.world;
    if (!W) return;
    if (down && !this.colDeck) {
      const R = this.radius * this.scale * 0.85;
      const top = this.colTop();
      this.colDeck = {
        kind: 'box',
        x: this.pos.x,
        z: this.pos.z,
        w: R * 2,
        d: R * 2,
        y: this.pos.y - 0.5,
        top,
        group: this.mesh,
        mats: [],
        box: new THREE.Box3(
          new THREE.Vector3(this.pos.x - R, this.pos.y, this.pos.z - R),
          new THREE.Vector3(this.pos.x + R, top, this.pos.z + R),
        ),
      };
      W.obstacles.push(this.colDeck);
    } else if ((!down || this.dead) && this.colDeck) {
      const i = W.obstacles.indexOf(this.colDeck);
      if (i >= 0) W.obstacles.splice(i, 1);
      this.colDeck = null;
    }
  },
});
