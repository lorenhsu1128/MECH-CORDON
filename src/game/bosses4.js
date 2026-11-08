// Game：主線擴充的新 Boss（第 7、8 章；docs/campaign-expansion-design.md 第 11 節）的場上處理。行為在 entities/mech-boss4.js。
import { ACES } from '../data/foes.js';
import { DS } from '../core/scale.js';
import { Game } from './game.js';

Object.assign(Game.prototype, {
  // SOVEREIGN 第三型態：召喚上一位鑰匙的殘影（ZENITH 的組裝，AP 比較低、不掉獎金以外的東西）
  sovEcho4(b, pl) {
    const z = ACES.zenith;
    const a = Math.random() * Math.PI * 2;
    const x = pl.pos.x + Math.cos(a) * 30 * DS,
      zz = pl.pos.z + Math.sin(a) * 30 * DS;
    const [cx, cz] = this.world.nearSolid ? this.world.nearSolid(x, zz) : [x, zz];
    const e = this.spawnEnemy({
      name: 'KEY-06 殘影',
      asm: { ...z.asm },
      pal: z.pal,
      hpMul: z.hpMul * (this.scaleHp || 1) * 0.6,
      dmgMul: z.dmgMul * (this.scaleDmg || 1) * 0.8,
      stabMul: z.stabMul,
      ai: z.ai,
      wantDist: z.wantDist,
      speedMul: z.speedMul,
      turnRate: z.turnRate,
      ace: true,
      at: new THREE.Vector3(cx, this.world.groundAt(cx, cz, 999), cz),
    });
    if (e && e.senseInit) e.senseInit(false);
    this.fx.pillarStrike(e ? e.pos.clone() : pl.pos.clone(), 6, 0x80d0ff);
    return e;
  },
});
