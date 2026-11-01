// ============================================================
//  武器的聲音配方（docs/audio-design.md 第 2 期）：純資料。
//  每一層＝[素材清單（輪流）, 音量, 音高]；素材是 src/assets/sfx2（lib/sfx-assets.js，載入後才有）、
//  原本內嵌的 src/assets/sfx 或合成音（~ 開頭，audio/synth.js）。找不到的素材略過；
//  near 全部找不到時（sfx2 還沒載入）改播 fb（原本的樣本）。
//   near  近距離的本體（0～NEAR_D）        far   遠距離（NEAR_D～FAR_D 交叉淡化，之後只剩它）
//   body  自機才疊的厚度（低頻多的槍聲）    mech  自機才有的機械聲（槍機、轉管、能量充填）
//   low   自機才有的超低頻重擊               tail  環境尾音的送出量（依主題的反射，audio.js 的 env）
//   gap   同一個配方的最短間隔（秒）         hp    敵人的槍濾掉的低頻（Hz）
// ============================================================

export const GUN = {
  rifle: {
    near: [['rifleN1', 'rifleN2', 'rifleN3', 'rifleN4'], 0.75, 0.78],
    far: [['rifleF1', 'rifleF2'], 0.6, 0.78],
    body: [['bRifle'], 0.32, 0.72],
    mech: [['clink1', 'clink2'], 0.07, 0.55],
    low: [['~thA'], 0.55, 1],
    tail: 0.35,
    fb: [['rifle', 'rifle2'], 0.75, 1],
  },
  pistol: {
    near: [['pistolN1', 'pistolN2'], 0.75, 0.72],
    far: [['pistolF1'], 0.55, 0.75],
    body: [['bPistol'], 0.3, 0.7],
    low: [['~thA'], 0.45, 1.1],
    tail: 0.3,
    fb: [['pistol'], 0.75, 1],
  },
  // MG-014 手持格林：連射快，每一發短；body 是 Baradari 的機槍（低頻厚），轉管在 spin 層（audio.js）
  gatling: {
    near: [['smgN1', 'smgN2', 'smgN3'], 0.55, 0.72],
    far: [['smgF1'], 0.45, 0.75],
    body: [['bChain'], 0.3, 0.85],
    low: [['~thD'], 0.35, 1],
    tail: 0.25,
    gap: 0.018,
    max: 6,
    fb: [['mg'], 0.6, 1.05],
  },
  // GT-70 背部加特林：更低、更重
  gatlingHvy: {
    near: [['smgN1', 'smgN2', 'smgN3'], 0.6, 0.6],
    far: [['smgF1'], 0.5, 0.62],
    body: [['bChain'], 0.38, 0.7],
    low: [['~thD'], 0.45, 0.8],
    tail: 0.3,
    gap: 0.018,
    max: 6,
    fb: [['mg'], 0.65, 0.9],
  },
  shotgun: {
    near: [['sgN1', 'sgN2', 'sgN3'], 0.85, 0.75],
    far: [['sgF1', 'sgF2'], 0.7, 0.75],
    body: [['bShotgun'], 0.4, 0.7],
    mech: [['iron2', 'iron4'], 0.08, 0.5],
    low: [['~thB'], 0.7, 1],
    tail: 0.45,
    fb: [['shotgun'], 0.95, 0.95],
  },
  // LSG-06 雷射霰彈槍：能量的散射（不是火藥）
  laserShotgun: {
    near: [['beam2', 'rLaser'], 0.6, 0.95],
    far: [['lzB1', 'lzB2'], 0.45, 0.8],
    body: [['~zapC'], 0.4, 0.8],
    mech: [['eHi2'], 0.15, 1.6],
    low: [['~thB'], 0.5, 1.2],
    tail: 0.3,
    fb: [['laser2'], 0.7, 0.75],
  },
  // BZ-31 火箭筒／一般的砲彈
  bazooka: {
    near: [['cannon1', 'cannon2', 'cannon3'], 0.85, 0.7],
    far: [['hvyF1', 'hvyF2'], 0.65, 0.6],
    body: [['rocket'], 0.35, 1.1],
    mech: [['iron1', 'iron3'], 0.07, 0.4],
    low: [['~thB'], 0.8, 0.85],
    tail: 0.55,
    fb: [['heavy'], 1.0, 0.85],
  },
  grenade: {
    near: [['cannon3', 'boomLow'], 0.75, 0.75],
    far: [['hvyF2'], 0.55, 0.65],
    body: [['bang1'], 0.3, 0.6],
    low: [['~thB'], 0.65, 1.1],
    tail: 0.45,
    fb: [['heavy'], 0.9, 0.7],
  },
  grenadeHvy: {
    near: [['cannon2', 'boomLow'], 0.85, 0.62],
    far: [['hvyF1'], 0.6, 0.55],
    body: [['bang2'], 0.35, 0.55],
    low: [['~thC'], 0.6, 1.2],
    tail: 0.55,
    fb: [['heavy'], 0.95, 0.6],
  },
  laser: {
    near: [['lzA1', 'lzA2', 'lzA3'], 0.6, 1],
    far: [['lzB1', 'lzB2'], 0.42, 0.75],
    body: [['~zapA'], 0.35, 1],
    mech: [['eHi3'], 0.12, 1.4],
    low: [['~thA'], 0.35, 1.3],
    tail: 0.3,
    fb: [['laser', 'laser2'], 0.65, 1],
  },
  laserCannon: {
    near: [['beam1', 'beam3'], 0.8, 0.8],
    far: [['lzA1', 'lzA2'], 0.55, 0.6],
    body: [['~zapB'], 0.45, 0.9],
    mech: [['eLow1'], 0.2, 1.3],
    low: [['~thB'], 0.6, 1],
    tail: 0.45,
    fb: [['laserBig', 'laserBig2'], 0.75, 1],
  },
  laserCharged: {
    near: [['beam1', 'beam3'], 0.95, 0.65],
    far: [['sciBoom'], 0.6, 0.7],
    body: [['laserCharged'], 0.7, 1],
    mech: [['eLow3'], 0.35, 1],
    low: [['~thC'], 0.7, 1.1],
    tail: 0.6,
    fb: [['laserCharged'], 0.95, 1],
  },
  // 導彈（MS-4）：莢艙的艙蓋＋點火的嘶
  missile: {
    near: [['rocket'], 0.55, 1.35],
    far: [['rocket'], 0.35, 1.1],
    body: [['missile'], 0.45, 1.15],
    mech: [['mHit5', 'mHit2'], 0.12, 0.7],
    low: [['~thA'], 0.4, 0.8],
    tail: 0.3,
    gap: 0.04,
    fb: [['missile'], 0.6, 1.2],
  },
  // MS-8 重導彈：更低、更長
  missileHvy: {
    near: [['rocket'], 0.7, 0.95],
    far: [['rocket'], 0.45, 0.85],
    body: [['cannon3'], 0.3, 0.55],
    mech: [['mHvy2'], 0.15, 0.7],
    low: [['~thB'], 0.5, 0.9],
    tail: 0.45,
    gap: 0.05,
    fb: [['missile'], 0.7, 0.9],
  },
  // PM-6 電漿導彈：能量的「嗡」＋點火
  plasma: {
    near: [['eMid1', 'eMid2'], 0.6, 1.2],
    far: [['eLow2'], 0.4, 1],
    body: [['rocket'], 0.3, 1.5],
    mech: [['phUp'], 0.18, 0.8],
    low: [['~thA'], 0.4, 0.9],
    tail: 0.35,
    gap: 0.05,
    fb: [['missile'], 0.6, 1.4],
  },
  // EMP-9 電磁槍（光束）
  empbeam: {
    near: [['zap2', 'zap1'], 0.6, 0.85],
    far: [['eHi1'], 0.4, 0.8],
    body: [['~empS'], 0.5, 1],
    low: [['~thA'], 0.35, 0.8],
    tail: 0.3,
    fb: [['overload'], 0.6, 1.3],
  },
  // 機首的機砲（空域）
  cannon: {
    near: [['hvyN1', 'hvyN2'], 0.7, 0.7],
    far: [['hvyF1', 'hvyF2'], 0.55, 0.7],
    low: [['~thA'], 0.4, 0.9],
    tail: 0.2,
    fb: [['heavy'], 0.9, 0.9],
  },
};

// 武器 id → 配方（沒有的照 SFX.shot 的種類）
export const GUN_OF_ID = {
  w_rifle: 'rifle',
  w_hg: 'pistol',
  w_mg: 'gatling',
  bw_gat: 'gatlingHvy',
  w_sg: 'shotgun',
  w_lsg: 'laserShotgun',
  w_bz: 'bazooka',
  w_gl: 'grenade',
  bw_gr: 'grenadeHvy',
  w_lr: 'laser',
  w_lc: 'laserCannon',
  bw_lc: 'laserCannon',
  bw_ms: 'missile',
  bw_ms8: 'missileHvy',
  bw_pm: 'plasma',
  w_emp: 'empbeam',
  air_cannon: 'cannon',
};
// SFX.shot 的種類 → 預設配方
export const GUN_OF_KIND = {
  bullet: 'rifle',
  shotgun: 'shotgun',
  shell: 'bazooka',
  grenade: 'grenade',
  laser: 'laser',
  laserCharged: 'laserCharged',
  missile: 'missile',
  empbeam: 'empbeam',
};

// 環境的尾音（反射）：依地圖主題。d1／d2＝兩條反射線的延遲（秒）、fb＝回授、lp＝低通（Hz）、wet＝整體送出量
export const ENV = {
  open: { d1: 0.11, d2: 0.19, fb: 0.22, lp: 2400, wet: 0.32 }, // 開闊（荒野、沙丘、模擬訓練場）
  canyon: { d1: 0.27, d2: 0.43, fb: 0.38, lp: 1800, wet: 0.5 }, // 峽谷、山谷（礦坑、水壩）
  urban: { d1: 0.06, d2: 0.13, fb: 0.42, lp: 3000, wet: 0.45 }, // 建築之間（集散場、市街、洋上都市）
  indoor: { d1: 0.035, d2: 0.07, fb: 0.55, lp: 2000, wet: 0.55 }, // 岩頂、地下（技研都市、坑道）
  space: { d1: 0.15, d2: 0.31, fb: 0.15, lp: 1500, wet: 0.18 }, // 高空、海上（幾乎沒有反射）
  snow: { d1: 0.14, d2: 0.24, fb: 0.15, lp: 1600, wet: 0.22 }, // 雪地（吸音）
};
export const ENV_OF_THEME = {
  industrial: 'urban',
  grid: 'open',
  desert: 'canyon',
  snow: 'snow',
  wasteland: 'open',
  dunes: 'open',
  flooded: 'urban',
  dam: 'canyon',
  spaceport: 'urban',
  grid086: 'urban',
  xylem: 'urban',
  orbit: 'space',
  institute: 'indoor',
  airspace: 'space',
};
