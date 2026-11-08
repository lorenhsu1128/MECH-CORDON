// Game：熔岩（火山熔爐帶，world/themes/volcano.js 的 lava）——站在熔岩裡（貼地、高度在熔岩面附近）持續受傷，
// 每 0.5 秒結算一次（傷害數字不會一直跳）；第一次踩到時提示。判定在房主／單機（主迴圈的 updateHazards 之後）。
import { SFX } from '../audio/audio.js';
import { MS, WS } from '../core/scale.js';
import { Game } from './game.js';

const LAVA_DT = 0.5;

Object.assign(Game.prototype, {
  lavaTick(dt) {
    const w = this.world,
      L = w && w.theme && w.theme.lava;
    if (!L || this.isClient) return;
    const y0 = L.y * WS;
    this.lavaAcc = (this.lavaAcc || 0) + dt;
    if (this.lavaAcc < LAVA_DT) return;
    const step = this.lavaAcc;
    this.lavaAcc = 0;
    const all = [...(this.players || []), ...this.enemies, ...(this.allies || [])];
    for (const e of all) {
      if (!e || e.dead || e.flying || e.air || e.isBoss || e.ai === 'part' || e.ai === 'colossus') continue;
      if (e.ai === 'heatguard' || e.ai === 'magmadrone') continue; // 耐熱的專屬敵人（mech-foe-e1.js）
      if (!e.grounded || e.pos.y > y0 + 0.8 * MS) continue;
      if (w.terrainHeight(e.pos.x, e.pos.z) > y0 + 0.2 * MS) continue; // 站在熔岩上的結構（橋、平台）
      e.takeDamage(e.maxHp * L.dps * step, 0, null, e.center(), null, null, null, 'none');
      this.fx.spark(e.pos.clone().setY(y0 + 0.5), 0xff8030);
      if (e.isPlayer && !this.lavaTold) {
        this.lavaTold = true;
        this.flashAlert('熔岩：站在裡面會持續受傷 — 跳起來或離開');
        SFX.play('alarm', 0.4, 1.4, 0.05, 0.3, e.pos);
      }
    }
  },
});
