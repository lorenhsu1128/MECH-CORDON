// 機獸（每章最後的大 Boss；docs/beast-design.md 的「接成敵人」）：定義的格式同 BOSS_DEFS（data/enemies.js），由 spawnBossDef → spawnBossKind 生成。
// 不放進 BOSS_DEFS：自由出擊的 Boss 輪替與模擬器要在主線遇過才開放（之後的期數處理），地圖預覽器的 Boss 擂台直接列出。
// 模型是實際的公尺（不乘機甲的建模倍率 MS）：radius 照舊尺度寫（× MS × 體型倍率＝實際的碰撞半徑）。
//
// 行為（entities/mech-beast.js）全部照這裡的資料：
// - 速度（公尺／秒，實際尺度）。使用者定案（2026-11-19）：機獸要靈活，比玩家機甲的移動快（約 64～80）、比 QB 慢（約 186）。
//   walk＝貼身繞行、trot＝一般的移動與衝向目標、run＝遠距離追上；turn＝轉身（弧度／秒）、acc／dec＝加減速。
// - clips＝這隻會放的動作片段（render/beast-anim.js 的名稱）；順序＝同步給客機的編號（bossVis 的低 5 位＝編號＋1），只能往後加。
//   stag／death／jump＝失衡、擊破、躍過障礙物用的片段（沒寫＝'stagger'／'death'／'jump'）。
// - balls＝命中的形狀：沿著身體的幾顆球 [前後, 高度, 半徑]（模型的公尺，再乘體型倍率）。
// - melee＝近戰招式（片段名稱 → 判定）：t＝出手的時間（片段開始後幾秒，同時是地面預警的秒數）、f／side＝判定圓的中心相對機獸的前後／左右
//   （模型的公尺，正＝前／左）、R＝半徑、dmg／im＝傷害與衝擊（再乘 dmgMul）、kb＝擊退、up＝往上打飛、high＝打得到多高（跳起來可以躲）、
//   path＝預警畫成到落點的路線、open＝放完之後的破綻秒數、hits＝連打（每一下的時間，各自預警與判定）、ram＝從這個時間起到出手為止身體撞到誰就算（撲擊在空中的那一段）、live＝判定的位置在出手前才決定（先閃開再出手的招式）、track＝轉向目標對準的秒數；
//   sel＝什麼時候選這一招：d0～d1＝和目標的距離（扣掉兩邊的碰撞半徑，公尺）、a0～a1＝目標偏離正前方的角度（弧度）、sgn＝目標在左（1）／右（−1）才用、w＝權重。
// - guns＝會發射的武器（docs/beast-design.md 的「武器」：兩把外掛＋一把長在身上）：far／near＝遠／近時被選到的權重、cd＝[放完的冷卻, 隨機再加]、
//   flag／flags＝負責它的部位（BOSS_KIT 的 flag；全部被打壞就不能用）、hold＝放的時候停下來；type：
//   rail＝砲塔跟著目標 track 秒 → 鎖住方向畫預警線 warn 秒 → 貫穿（attr 屬性）；volley＝asm 的武器槽各射 n 輪；
//   burst＝邊移動邊用 asm 的武器槽點放 dur 秒；fan＝朝目標的扇形 n 道光束（clip＝同時播的片段）；
//   beam＝從 node 這一塊（或 nodes 幾塊，nodeFlags＝各自負責的部位）朝目標一道光束（warn 秒預警；status＝打中附加的狀態效果）；
//   lob＝拋射 n 發迫擊砲彈（落點有預警圈；at＝配合片段延後幾秒、spread＝散布、R＝爆炸半徑的公尺、pool＝落地後的燃燒地面）；
//   cone＝火焰錐（配合片段 t0～t1 噴：前方 len 公尺、半角 ang，每秒 dps；f／y＝噴口相對機獸的前後與高度）。
// - hide＝部位的 flag → 打壞時藏起來的區塊；aim＝[偏航的區塊, 俯仰的區塊]（瞄準時轉它們；沒寫＝獅型那種 turret／guns，交給動作程式）。
// - atk＝攻擊的屬性（簡報寫出來）、tier＝主線那一章的刁鑽度（地圖預覽器的「依自由出擊」用）。
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
  // ---------- 獅型（主線的位置未定：使用者決定第 8 章不放機獸）----------
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
    tier: 8,
    hide: { rail: ['guns'], podL: ['pod_l'], podR: ['pod_r'] },
    radius: 1.3,
    hpMul: 3.4,
    stabMul: 5,
    dmgMul: 0.55,
    wantDist: 5,
    speedMul: 1,
    res: [0, 0, 0],
    atk: ['kin', 'exp', 'en'],
    walk: 34,
    trot: 84,
    run: 125,
    turn: 3.4,
    acc: 90,
    dec: 160,
    balls: [
      [5.4, 6.3, 2.1], // 頭
      [2.3, 5.2, 2.9], // 胸與前肢
      [-0.6, 5.4, 2.7], // 腰
      [-3.3, 5.2, 2.8], // 臀與後肢
      [-1.8, 8.2, 1.7], // 背上的砲
    ],
    melee: {
      clawL: {
        t: 0.45,
        f: 7.2,
        side: 1.6,
        R: 4.6,
        dmg: 620,
        im: 900,
        kb: 26,
        high: 7,
        sel: { d1: 5, a1: 0.6, sgn: 1, w: 3 },
      },
      clawR: {
        t: 0.45,
        f: 7.2,
        side: -1.6,
        R: 4.6,
        dmg: 620,
        im: 900,
        kb: 26,
        high: 7,
        sel: { d1: 5, a1: 0.6, sgn: -1, w: 3 },
      },
      bite: {
        t: 0.46,
        f: 8.2,
        side: 0,
        R: 3.6,
        dmg: 900,
        im: 1100,
        kb: 14,
        high: 8,
        sel: { d1: 5, a1: 0.6, w: 2 },
      },
      tail: {
        t: 0.56,
        f: -8.5,
        side: 0,
        R: 5.6,
        dmg: 520,
        im: 1300,
        kb: 40,
        up: 14,
        high: 5,
        sel: { d1: 7, a0: 2.2, w: 6 },
      },
      pounce: {
        ...{ t: 1.0, f: 16.5, side: 0, R: 5.2, dmg: 1050, im: 1700, kb: 34, up: 10, high: 6 },
        ...{ path: true, ram: 0.62, open: 2.5, sel: { d0: 9, d1: 26, a1: 0.3, w: 6 } },
      },
    },
    guns: [
      // 背上的雙管磁軌砲（實彈，重擊）
      {
        ...{ id: 'rail', type: 'rail', flag: 'rail', hold: true, attr: 'kin' },
        ...{ track: 0.8, warn: 0.55, range: 120, dmg: 1000, im: 1500, far: 0.45, near: 0.2, cd: [3.5, 2] },
      },
      // 肩上的導彈莢艙（爆發，壓制）
      {
        ...{ id: 'pods', type: 'volley', flags: ['podL', 'podR'], slots: ['rback', 'lback'] },
        ...{ n: 2, gap: 0.45, far: 0.35, near: 0.45, cd: [4, 2] },
      },
      // 鬃甲的雷射陣列（能量，控場）：咆哮時鬃甲張開
      {
        ...{ id: 'mane', type: 'fan', clip: 'roar', open: 1.5 },
        ...{ n: 5, step: 0.17, dmg: 380, im: 600, far: 0.2, near: 0.35, cd: [5, 2] },
      },
    ],
    clips: ['pounce', 'clawL', 'clawR', 'bite', 'tail', 'roar', 'jump', 'brake', 'hit', 'stagger', 'death'],
    intro: '獅型機獸 — 背上的磁軌砲、肩上的導彈莢艙、鬃甲的雷射，三種屬性的攻擊都有；外掛的兩把武器可以打壞',
  },
  // ---------- 劍齒虎型（第 3 章：冰原、研究特區）：比獅型更快、更會閃 ----------
  {
    beast: 'tiger',
    name: '劍齒虎型機獸',
    kind: 'beast_tiger',
    ai: 'beast',
    modelKind: 'boss',
    vehKey: 'beast_tiger',
    pal: 'beast_tiger',
    asm: { ...BEAST_ASM, rarm: 'w_mg', rback: 'bw_pm', lback: 'bw_pm' }, // 背上的電磁機砲（實彈）、肩上的電漿導彈莢艙（能量）
    scale: BEAST_SCALE.tiger,
    tier: 3,
    hide: { mg: ['mg_turret'], pods: ['guns'] },
    aim: ['mg_turret', 'mg_gun'],
    stag: 'tStagger',
    death: 'tDeath',
    radius: 1.2,
    hpMul: 3.0,
    stabMul: 4.5,
    dmgMul: 0.5,
    wantDist: 5,
    speedMul: 1,
    res: [0, -0.25, 0.2], // 弱爆發、抗能量
    atk: ['en', 'kin'],
    walk: 38,
    trot: 94,
    run: 140,
    turn: 3.9,
    acc: 115,
    dec: 190,
    balls: [
      [5.0, 5.4, 1.9],
      [2.2, 4.8, 2.6],
      [-0.6, 4.9, 2.4],
      [-3.3, 4.8, 2.5],
      [-1.9, 7.4, 1.4], // 背上的機砲
    ],
    melee: {
      tFang: {
        t: 0.5,
        f: 7.8,
        side: 0,
        R: 3.6,
        dmg: 820,
        im: 1000,
        kb: 14,
        high: 7,
        sel: { d1: 6, a1: 0.6, w: 3 },
      },
      // 先往側面閃再出爪（片段自己的側移）：閃的時候轉回來對準目標（track），出手前才畫預警（live）
      tDodgeClawL: {
        ...{ t: 0.82, f: 6.6, side: 1.5, R: 4.8, dmg: 560, im: 800, kb: 24, high: 7 },
        ...{ live: true, track: 0.7, sel: { d1: 9, a1: 0.9, w: 2 } },
      },
      tDodgeClawR: {
        ...{ t: 0.82, f: 6.6, side: -1.5, R: 4.8, dmg: 560, im: 800, kb: 24, high: 7 },
        ...{ live: true, track: 0.7, sel: { d1: 9, a1: 0.9, w: 2 } },
      },
      // 原地迴旋甩尾（轉 180°）：目標在側面或背後
      tSpinL: {
        t: 0.36,
        f: 0,
        side: 0,
        R: 8.2,
        dmg: 460,
        im: 1200,
        kb: 38,
        up: 12,
        high: 5,
        sel: { d1: 7, a0: 1.5, sgn: 1, w: 6 },
      },
      tSpinR: {
        t: 0.36,
        f: 0,
        side: 0,
        R: 8.2,
        dmg: 460,
        im: 1200,
        kb: 38,
        up: 12,
        high: 5,
        sel: { d1: 7, a0: 1.5, sgn: -1, w: 6 },
      },
      tLunge: {
        ...{ t: 0.86, f: 19.5, side: 0, R: 5, dmg: 980, im: 1600, kb: 32, up: 9, high: 6 },
        ...{ path: true, ram: 0.56, open: 2.2, sel: { d0: 9, d1: 30, a1: 0.3, w: 6 } },
      },
    },
    guns: [
      // 背上的電磁機砲（實彈，壓制）：繞著玩家跑時點放
      {
        id: 'mg',
        type: 'burst',
        flag: 'mg',
        slot: 'rarm',
        dur: 1.6,
        gap: 0.09,
        far: 0.45,
        near: 0.4,
        cd: [2.5, 1.5],
      },
      // 肩上的電漿導彈莢艙（能量，控場）
      {
        id: 'pods',
        type: 'volley',
        flag: 'pods',
        slots: ['rback', 'lback'],
        n: 1,
        gap: 0.3,
        far: 0.35,
        near: 0.25,
        cd: [4, 2],
      },
      // 劍齒之間的冷凍光束（能量，重擊）：停下來低吼、預警後一道光束，打中緩速
      {
        ...{ id: 'freeze', type: 'beam', node: 'head', clip: 'tSnarl', hold: true, open: 1.2 },
        ...{ warn: 0.9, range: 90, dmg: 700, im: 900, hitR: 3, far: 0.2, near: 0.35, cd: [5, 2] },
        status: { kind: 'slow', sec: 3.5, o: { k: 0.55 } },
      },
    ],
    clips: [
      ...['tFang', 'tDodgeClawL', 'tDodgeClawR', 'tSpinL', 'tSpinR', 'tLunge', 'tSnarl', 'tVolley'],
      ...['jump', 'tHit', 'tStagger', 'tDeath'],
    ],
    intro: '劍齒虎型機獸 — 背上的機砲邊跑邊掃、肩上的電漿導彈、嘴裡的冷凍光束會讓你變慢；撲空之後是破綻',
  },
  // ---------- 熊型（第 7 章：火山熔爐帶）：正面硬碰的重拳手，比獅、虎慢一點但更硬、更痛 ----------
  {
    beast: 'bear',
    name: '熊型機獸',
    kind: 'beast_bear',
    ai: 'beast',
    modelKind: 'boss',
    vehKey: 'beast_bear',
    pal: 'beast_bear',
    asm: BEAST_ASM,
    scale: BEAST_SCALE.bear,
    tier: 7,
    hide: { how: ['how_turret'], heatL: ['heat_l'], heatR: ['heat_r'] },
    stag: 'bKneel',
    death: 'bDeath',
    radius: 1.45,
    hpMul: 3.8,
    stabMul: 6,
    dmgMul: 0.55,
    wantDist: 5,
    speedMul: 1,
    res: [0, 0.2, -0.25], // 抗爆發、弱能量
    atk: ['exp', 'en'],
    walk: 30,
    trot: 76,
    run: 106,
    turn: 2.9,
    acc: 72,
    dec: 140,
    balls: [
      [5.2, 6.0, 2.3],
      [2.2, 5.6, 3.4],
      [-1.0, 5.4, 3.3],
      [-3.8, 5.0, 3.2],
      [0.1, 8.5, 1.7], // 背上的榴彈砲
    ],
    melee: {
      // 站起來掌擊連打三下（每一下往前踏一步）
      bSlam3: {
        ...{ t: 0.92, hits: [0.92, 1.42, 1.92], f: 6.6, side: 0, R: 5, dmg: 520, im: 900, kb: 16, high: 9 },
        sel: { d1: 6, a1: 0.7, w: 4 },
      },
      // 雙掌拍地：範圍大、貼地才打得到（跳起來躲）
      bGround: {
        t: 1.04,
        f: 6,
        side: 0,
        R: 8.5,
        dmg: 780,
        im: 1700,
        kb: 30,
        up: 10,
        high: 4,
        sel: { d1: 8, a1: 1.2, w: 3 },
      },
      // 熊抱：範圍小、很痛，放完是破綻
      bHug: {
        t: 0.98,
        f: 5.6,
        side: 0,
        R: 4.2,
        dmg: 1400,
        im: 1200,
        kb: 8,
        high: 9,
        open: 1.5,
        sel: { d1: 4, a1: 0.5, w: 2 },
      },
      // 衝撞：直線衝 33 m，路上撞到誰就算，撞空是破綻
      bCharge: {
        ...{ t: 1.5, f: 24.5, side: 0, R: 5, dmg: 1000, im: 1800, kb: 36, up: 8, high: 6 },
        ...{ path: true, ram: 0.7, open: 2.6, sel: { d0: 12, d1: 36, a1: 0.3, w: 6 } },
      },
    },
    guns: [
      // 背上的重榴彈砲（爆發，重擊）：一發大的，落點圈預警
      {
        ...{ id: 'how', type: 'lob', flag: 'how', n: 1, dmg: 1300, im: 1800, R: 9 },
        ...{ far: 0.5, near: 0.15, cd: [4, 2] },
      },
      // 肩峰兩側的熱熔光束砲（能量，壓制）：左右各一道
      {
        ...{
          id: 'heat',
          type: 'beam',
          flags: ['heatL', 'heatR'],
          nodes: ['heat_l', 'heat_r'],
          nodeFlags: ['heatL', 'heatR'],
        },
        ...{ warn: 0.7, range: 100, dmg: 420, im: 500, far: 0.3, near: 0.3, cd: [3, 1.5] },
      },
      // 丟熔岩塊（爆發，控場）：落地留燃燒地面
      {
        ...{ id: 'lava', type: 'lob', clip: 'bLava', at: 1.44, n: 1, dmg: 700, im: 900, R: 6 },
        ...{ pool: { r: 5, life: 8, dps: 130 }, far: 0.2, near: 0.2, cd: [5, 2] },
      },
      // 口的爐火（爆發）：近距離的火焰錐，噴完是破綻
      {
        ...{
          id: 'flame',
          type: 'cone',
          clip: 'bFlame',
          attr: 'exp',
          open: 1.2,
          t0: 0.68,
          t1: 1.5,
          tick: 0.15,
        },
        ...{ f: 6.5, y: 5.5, len: 30, ang: 0.5, dps: 900, ips: 700, far: 0, near: 0.35, cd: [5, 2] },
      },
    ],
    clips: [
      ...['bSlam3', 'bGround', 'bHug', 'bCharge', 'bFlame', 'bLava', 'bRoar', 'bStand'],
      ...['jump', 'bHit', 'bKneel', 'bDeath'],
    ],
    intro:
      '熊型機獸 — 背上的榴彈砲看落點圈躲、肩上兩道熱熔光束、熔岩塊落地會燒；雙掌拍地用跳的躲，衝撞與熊抱撲空之後是破綻',
  },
];
export const beastDefOf = (kind) => BEAST_DEFS.find((b) => b.kind === kind) || null;
