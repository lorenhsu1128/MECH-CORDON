// ---------- Game 擴充：機獸（每章最後的大 Boss；docs/beast-design.md 的「接成敵人」）----------
// 定義在 data/beasts.js、行為在 entities/mech-beast.js；這裡是 Game 端的入口。
import { BEAST_DEFS } from '../data/beasts.js';
import { enemyScale } from '../data/enemies.js';
import { Game } from './game.js';

Object.assign(Game.prototype, {
  // 機獸的定義（beast＝'lion' 這種短名，或 kind）
  beastDefBy(key) {
    return BEAST_DEFS.find((b) => b.beast === key || b.kind === key) || null;
  },
  // 生成一隻機獸當 Boss（量測腳本與之後的主線用）：L＝等級（血量與火力的倍率）、tier＝刁鑽度（還沒有專屬內容，預設不套用）
  beastSpawn(key, L = 1, tier = 0) {
    const bd = this.beastDefBy(key);
    if (!bd) return null;
    const sc = enemyScale(L, (this.players && this.players.length) || 1);
    this.spawnBossDef(bd, sc.hp, sc.dmg, tier);
    return this.boss;
  },
});
