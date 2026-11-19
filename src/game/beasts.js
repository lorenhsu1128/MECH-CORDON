// ---------- Game 擴充：機獸（每章最後的大 Boss；docs/beast-design.md 的「接成敵人」）----------
// 定義在 data/beasts.js、行為在 entities/mech-beast.js；這裡是 Game 端的入口。
import { BEAST_DEFS } from '../data/beasts.js';
import { bossForLevel, bossIndexForLevel, enemyScale, isBossLevel } from '../data/enemies.js';
import { Game } from './game.js';

Object.assign(Game.prototype, {
  // 機獸的定義（beast＝'lion' 這種短名，或 kind）
  beastDefBy(key) {
    return BEAST_DEFS.find((b) => b.beast === key || b.kind === key) || null;
  },
  // 已經接成敵人的機獸（冒煙測試用來確認每一隻都有自己的測試步驟）
  beastKeys() {
    return BEAST_DEFS.map((b) => b.beast);
  },
  // 自由出擊的 Boss（單人）：主線打過的機獸進輪替——每三場 Boss 關的第三場換成打過的機獸（依序輪）；
  // 多人照舊用 bossForLevel（各端要算出同一隻，而每個人打過的機獸不一樣）。使用者定案：主線遇過才開放
  beastFreeDef(L) {
    if (!isBossLevel(L) || (this.net && this.net.role)) return null;
    const seen = Object.keys((((this.save || {}).story || {}).seen2 || {}).bosses || {});
    const defs = BEAST_DEFS.filter((b) => seen.includes(b.kind));
    if (!defs.length) return null;
    const i = bossIndexForLevel(L);
    return i % 3 === 2 ? defs[Math.floor(i / 3) % defs.length] : null;
  },
  freeBoss(L) {
    return this.beastFreeDef(L) || bossForLevel(L);
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
