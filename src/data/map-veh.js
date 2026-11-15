// 地圖上會動的載具（docs/map-vehicles-design.md）：車種的數值與各主題放哪些車。純資料。
//   模型是過場的載具（render/cine-vehicles*.js 的 buildCineVeh；真實尺寸、車頭朝 +Z、原點在底面中心）
//   w／h／len：寬、高、長（公尺；len 以模型的 len 為準，沒有時用這裡的）
//   spd：巡行的速度（m/s）；mat：破壞的材質（data/destruct.js 的 PMAT：vehicle、fuel 會起火）
//   crush：機甲走過、QB 撞到就直接踩扁（長 6.5 m 以下的小車）；不能踩扁的會擋住機甲（大型車）
//   hpK：血量（依尺寸與材質換算，data/destruct.js 的 propHpFor）的倍率
//   vars：顏色等的變化數（buildCineVeh 的 o.v）
export const MV_TYPES = {
  car: { name: '轎車', w: 1.8, h: 1.5, len: 4.5, spd: 11, mat: 'vehicle', crush: true, vars: 4 },
  pickup: { name: '皮卡', w: 2, h: 1.9, len: 5.3, spd: 11, mat: 'vehicle', crush: true, vars: 4 },
  jeep: { name: '吉普車', w: 1.9, h: 1.9, len: 4.3, spd: 12, mat: 'vehicle', crush: true },
  ambulance: { name: '救護車', w: 2.2, h: 2.8, len: 6.4, spd: 10, mat: 'vehicle', crush: true },
  newsvan: { name: '轉播車', w: 2.1, h: 3, len: 6, spd: 9, mat: 'vehicle', crush: true },
  tug: { name: '甲板牽引車', w: 2.2, h: 1.6, len: 4.5, spd: 6, mat: 'vehicle', crush: true },
  snowcat: { name: '雪地車', w: 2.6, h: 2.6, len: 5, spd: 6, mat: 'vehicle', crush: true },
  apc: { name: '裝甲運兵車', w: 2.6, h: 2.6, len: 7.4, spd: 9, mat: 'metal', hpK: 1.6 },
  tanker: { name: '油罐車', w: 2.5, h: 3.2, len: 9.6, spd: 8, mat: 'fuel', boom: [700, 14] },
  lavahauler: { name: '熔岩運輸車', w: 3, h: 3.5, len: 9, spd: 6, mat: 'fuel', boom: [600, 12] },
  hauler: { name: '礦用卡車', w: 4, h: 4.2, len: 9.2, spd: 7, mat: 'vehicle', hpK: 1.3 },
  lowboy: { name: '機甲運輸拖車', w: 3.2, h: 3.4, len: 19.6, spd: 5, mat: 'vehicle', hpK: 1.3 },
  truck: { name: '箱型貨車', w: 2.5, h: 3.4, len: 9.6, spd: 8, mat: 'vehicle' },
  semi: { name: '聯結車', w: 2.5, h: 3.8, len: 16.5, spd: 7, mat: 'vehicle', vars: 3 },
  bus: { name: '巴士', w: 2.6, h: 3.2, len: 12, spd: 8, mat: 'vehicle', vars: 3 },
  mixer: { name: '水泥攪拌車', w: 2.5, h: 3.6, len: 9.2, spd: 7, mat: 'vehicle', hpK: 1.2 },
  // 第 2 期：作業的機具（spd＝作業時來回的速度；挖土機與吊車原地作業）
  forklift: { name: '堆高機', w: 1.3, h: 2.3, len: 3.3, spd: 3, mat: 'vehicle', crush: true },
  bulldozer: { name: '推土機', w: 3.3, h: 3.1, len: 5.6, spd: 2.5, mat: 'metal', hpK: 1.5 },
  excavator: { name: '挖土機', w: 2.8, h: 3.2, len: 4.6, spd: 0, mat: 'metal', hpK: 1.5 },
  crane: { name: '移動式吊車', w: 2.6, h: 3.6, len: 12.4, spd: 0, mat: 'metal', hpK: 1.4 },
  // 第 3 期：新車種（siren＝車頂的警示燈條一直閃；lean＝轉彎時整台傾斜）與夜間的照明塔（沒有駕駛）
  firetruck: { name: '消防車', w: 2.5, h: 3.9, len: 9.4, spd: 9, mat: 'vehicle', hpK: 1.2, siren: true },
  police: { name: '警車', w: 1.85, h: 1.75, len: 4.8, spd: 13, mat: 'vehicle', crush: true, siren: true },
  moto: {
    name: '越野機車',
    w: 0.8,
    h: 1.7,
    len: 2.2,
    spd: 14,
    mat: 'vehicle',
    crush: true,
    lean: true,
    vars: 3,
  },
  lighttower: { name: '移動照明塔', w: 2, h: 8.5, len: 2.4, spd: 0, mat: 'metal', crush: true, empty: true },
};
// 油罐車這類（boom＝[傷害, 範圍公尺]）損毀時的大爆炸，之後留下燃燒的地面

// 各主題的車（第 1 期只有巡行的車；作業、水上、空中的之後分期加，docs/map-vehicles-design.md 第二、七節）
//   同一張地圖從清單裡抽，同一種最多兩台
export const MV_THEMES = {
  industrial: ['tanker', 'pickup', 'truck', 'semi', 'lowboy', 'car', 'mixer', 'firetruck'],
  desert: ['pickup', 'jeep', 'truck', 'hauler'],
  wasteland: ['pickup', 'jeep', 'tanker', 'car', 'truck', 'moto'],
  dunes: ['jeep', 'pickup', 'apc', 'moto'],
  snow: ['snowcat', 'jeep', 'apc'],
  dam: ['pickup', 'truck', 'jeep', 'mixer'],
  flooded: ['ambulance', 'newsvan', 'apc', 'car', 'firetruck'],
  spaceport: ['tanker', 'tug', 'lowboy', 'truck'],
  grid086: ['tug', 'lowboy', 'truck'],
  xylem: ['ambulance', 'newsvan', 'pickup', 'car', 'bus', 'police'],
  institute: ['ambulance', 'apc', 'jeep', 'truck', 'firetruck', 'police'],
  volcano: ['lavahauler', 'hauler', 'jeep', 'pickup'],
  ark: ['tug', 'lowboy', 'tanker', 'apc', 'truck'],
};

// 各主題的作業（第 2 期）：每張地圖 1～3 個，從清單抽（同一種最多清單裡出現的次數）
//   forklift 堆高機在兩堆貨之間來回、crane 吊車原地吊貨、dig 挖土機原地挖＋礦用卡車來回載運、dozer 推土機來回推土
export const MV_WORK = {
  industrial: ['forklift', 'forklift', 'crane'],
  desert: ['dig', 'dozer'],
  wasteland: ['dozer'],
  snow: ['dozer'],
  dam: ['crane', 'dig'],
  flooded: ['dig'],
  spaceport: ['forklift', 'forklift'],
  grid086: ['forklift'],
  xylem: ['crane', 'forklift'],
  institute: ['forklift'],
  volcano: ['dig', 'dozer'],
  ark: ['forklift', 'forklift'],
};

export const MV_DROP = 0.35; // 打壞（含踩扁）時掉修補包的機率（2026-11-15 使用者定案：隨機掉補血包）
