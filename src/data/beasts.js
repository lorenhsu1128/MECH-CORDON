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
// 體型的倍率（2026-11-19 使用者回饋：把機甲當成人來看，照自然界比例的機獸太小）：模型照自然界的比例建，當 Boss 時整隻放大。
// 遊戲的實體（定義的 scale）與模型庫的預覽都用這張表。
export const BEAST_SCALE = {
  lion: 1.6, // 肩高約 10.7 m、全長約 19 m（機甲 9.7 m）
  tiger: 1.6,
  bear: 1.5, // 肩高約 11 m
  gorilla: 1.5, // 指節著地的肩高約 10.5 m、站立約 14 m
  turtle: 1.3, // 背甲寬約 11.7 m、圓頂高約 8 m
  scorpion: 1.25, // 尾高約 12.5 m、腳張開寬約 19 m
  mantis: 1.25, // 頭高約 15 m
  raptor: 2.2, // 站高約 12.8 m、翼展約 31 m
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
    asm: { ...BEAST_ASM, rback: 'bw_ms', lback: 'bw_ms' }, // 肩上的導彈莢艙（爆發）
    scale: BEAST_SCALE.lion,
    tier: 8, // 主線的刁鑽度（第 8 章；地圖預覽器的「依自由出擊」用）
    // 外掛武器的部位（BOSS_KIT 的 flag）→ 打壞時藏起來的區塊
    hide: { rail: ['guns'], podL: ['pod_l'], podR: ['pod_r'] },
    radius: 1.3,
    hpMul: 3.4,
    stabMul: 5,
    dmgMul: 0.55,
    wantDist: 5,
    speedMul: 1,
    res: [0, 0, 0],
    // 速度（公尺／秒，實際尺度）。使用者定案（2026-11-19）：機獸要靈活，比玩家機甲的移動快（約 64～80）、比 QB 慢（約 186）。
    // walk＝貼身繞行、trot＝一般的移動與衝向目標、run＝遠距離追上；turn＝轉身（弧度／秒）、acc／dec＝加減速
    walk: 34,
    trot: 84,
    run: 125,
    turn: 3.4,
    acc: 90,
    dec: 160,
    // 命中的形狀：沿著身體的幾顆球 [前後, 高度, 半徑]（模型的公尺，再乘體型倍率）——子彈與爆炸用它們，不用單一的外接球
    balls: [
      [5.4, 6.3, 2.1], // 頭
      [2.3, 5.2, 2.9], // 胸與前肢
      [-0.6, 5.4, 2.7], // 腰
      [-3.3, 5.2, 2.8], // 臀與後肢
      [-1.8, 8.2, 1.7], // 背上的砲
    ],
    // 近戰招式（片段名稱 → 判定）：t＝出手的時間（片段開始後幾秒，同時是地面預警的秒數）、f／side＝判定圓的中心相對機獸的前後／左右
    // （模型的公尺，正＝前／左；實際的距離再乘體型倍率）、R＝半徑、dmg／im＝傷害與衝擊（再乘 dmgMul）、kb＝擊退、up＝往上打飛、
    // high＝打得到多高（離機獸腳下幾公尺以內；跳起來可以躲）、path＝撲擊的落點（預警畫成路線）
    melee: {
      clawL: { t: 0.45, f: 7.2, side: 1.6, R: 4.6, dmg: 620, im: 900, kb: 26, high: 7 },
      clawR: { t: 0.45, f: 7.2, side: -1.6, R: 4.6, dmg: 620, im: 900, kb: 26, high: 7 },
      bite: { t: 0.46, f: 8.2, side: 0, R: 3.6, dmg: 900, im: 1100, kb: 14, high: 8 },
      tail: { t: 0.56, f: -8.5, side: 0, R: 5.6, dmg: 520, im: 1300, kb: 40, up: 14, high: 5 },
      pounce: { t: 1.0, f: 16.5, side: 0, R: 5.2, dmg: 1050, im: 1700, kb: 34, up: 10, high: 6, path: true },
    },
    // 三把武器（docs/beast-design.md 的「武器」）：磁軌砲（實彈，瞄準 → 鎖住方向的預警線 → 貫穿）、導彈莢艙（爆發，裝在 asm 的肩上武器）、
    // 鬃甲的雷射陣列（能量，咆哮時鬃甲張開的扇形光束）
    rail: { track: 0.8, warn: 0.55, range: 120, dmg: 1000, im: 1500 },
    missile: { n: 2, gap: 0.45 },
    mane: { n: 5, step: 0.17, dmg: 380, im: 600 },
    clips: ['pounce', 'clawL', 'clawR', 'bite', 'tail', 'roar', 'jump', 'brake', 'hit', 'stagger', 'death'],
    intro: '獅型機獸 — 背上的磁軌砲、肩上的導彈莢艙、鬃甲的雷射，三種屬性的攻擊都有',
  },
];
export const beastDefOf = (kind) => BEAST_DEFS.find((b) => b.kind === kind) || null;
