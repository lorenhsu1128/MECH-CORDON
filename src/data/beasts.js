// 機獸（每章最後的大 Boss；docs/beast-design.md 的「接成敵人」）：定義的格式同 BOSS_DEFS（data/enemies.js），由 spawnBossDef → spawnBossKind 生成。
// 不放進 BOSS_DEFS：自由出擊的 Boss 輪替與模擬器要在主線遇過才開放（之後的期數處理），地圖預覽器的 Boss 擂台直接列出。
// clips＝這隻會放的動作片段（render/beast-anim.js 的 BEAST_CLIPS 的名稱）；順序＝同步給客機的編號（bossVis 的低 5 位＝編號＋1），只能往後加。
// 模型是實際的公尺（不乘機甲的建模倍率 MS）：radius 照舊尺度寫（× MS＝實際的碰撞半徑）。
const BEAST_ASM = {
  head: 'h_hv',
  core: 'c_hv',
  arms: 'a_hv',
  legs: 'l_bp',
  booster: 'b_std',
  generator: 'g_hi',
  fcs: 'f_std',
  rarm: 'w_none',
  larm: 'w_none',
  rback: 'bw_none',
  lback: 'bw_none',
};
export const BEAST_DEFS = [
  {
    beast: 'lion',
    name: '獅型機獸',
    kind: 'beast_lion',
    ai: 'beast',
    modelKind: 'boss',
    vehKey: 'beast_lion',
    pal: 'beast_lion',
    asm: BEAST_ASM,
    scale: 1,
    radius: 1.3,
    hpMul: 3.4,
    stabMul: 5,
    dmgMul: 0.55,
    wantDist: 5,
    speedMul: 1,
    res: [0, 0, 0],
    // 速度（公尺／秒，實際尺度）：走、小跑、奔跑；轉身（弧度／秒）
    walk: 5,
    trot: 11,
    run: 24,
    turn: 1.6,
    clips: ['pounce', 'clawL', 'clawR', 'bite', 'tail', 'roar', 'jump', 'brake', 'hit', 'stagger', 'death'],
    intro: '獅型機獸 — 背上的磁軌砲、肩上的導彈莢艙、鬃甲的雷射，三種屬性的攻擊都有',
  },
];
export const beastDefOf = (kind) => BEAST_DEFS.find((b) => b.kind === kind) || null;
