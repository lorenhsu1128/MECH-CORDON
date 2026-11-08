// Game：主線的空戰區段 air（主線擴充 A5，docs/campaign-expansion-design.md）——這一段的地圖換成空域（airspace），
// 照自由出擊的空戰（game/air.js）：攔截敵機、保護友軍雷達站。只有單人（campTypeOk：多人時改抽其他類型）。
// 清除後的出口浮在玩家的飛行高度（segAirExits）。
import { MS } from '../core/scale.js';
import { Game } from './game.js';

Object.assign(Game.prototype, {
  segSpawn_air(L) {
    this.airBegin(); // 玩家進入飛行狀態（air.js）
    this.airSpawn(L, this.scaleHp, this.scaleDmg);
    this.flashAlert('空戰區段：擊落所有敵機，別讓轟炸機炸掉友軍雷達站');
  },
  // 出口移到玩家的飛行高度（地面的光環在空中看不到、也很難飛下去）
  segAirExits() {
    const c = this.camp,
      p = this.player;
    if (!c || !p || !this.airMode) return;
    for (const ex of c.exits || []) {
      const floor = this.world.terrainHeight(ex.pos.x, ex.pos.z) + 40 * MS;
      ex.pos.y = Math.max(floor, p.pos.y);
      ex.group.position.copy(ex.pos);
    }
  },
});
