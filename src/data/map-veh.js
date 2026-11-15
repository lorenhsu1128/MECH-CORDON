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
  tanker: { name: '油罐車', w: 2.5, h: 3.2, len: 9.6, spd: 8, mat: 'fuel' },
  lavahauler: { name: '熔岩運輸車', w: 3, h: 3.5, len: 9, spd: 6, mat: 'fuel' },
  hauler: { name: '礦用卡車', w: 4, h: 4.2, len: 9.2, spd: 7, mat: 'vehicle', hpK: 1.3 },
  lowboy: { name: '機甲運輸拖車', w: 3.2, h: 3.4, len: 19.6, spd: 5, mat: 'vehicle', hpK: 1.3 },
  truck: { name: '箱型貨車', w: 2.5, h: 3.4, len: 9.6, spd: 8, mat: 'vehicle' },
  semi: { name: '聯結車', w: 2.5, h: 3.8, len: 16.5, spd: 7, mat: 'vehicle', vars: 3 },
  bus: { name: '巴士', w: 2.6, h: 3.2, len: 12, spd: 8, mat: 'vehicle', vars: 3 },
};

// 各主題的車（第 1 期只有巡行的車；作業、水上、空中的之後分期加，docs/map-vehicles-design.md 第二、七節）
//   同一張地圖從清單裡抽，同一種最多兩台
export const MV_THEMES = {
  industrial: ['tanker', 'pickup', 'truck', 'semi', 'lowboy', 'car'],
  desert: ['pickup', 'jeep', 'truck', 'hauler'],
  wasteland: ['pickup', 'jeep', 'tanker', 'car', 'truck'],
  dunes: ['jeep', 'pickup', 'apc'],
  snow: ['snowcat', 'jeep', 'apc'],
  dam: ['pickup', 'truck', 'jeep'],
  flooded: ['ambulance', 'newsvan', 'apc', 'car'],
  spaceport: ['tanker', 'tug', 'lowboy', 'truck'],
  grid086: ['tug', 'lowboy', 'truck'],
  xylem: ['ambulance', 'newsvan', 'pickup', 'car', 'bus'],
  institute: ['ambulance', 'apc', 'jeep', 'truck'],
  volcano: ['lavahauler', 'hauler', 'jeep', 'pickup'],
  ark: ['tug', 'lowboy', 'tanker', 'apc', 'truck'],
};

export const MV_DROP = 0.35; // 打壞（含踩扁）時掉修補包的機率（2026-11-15 使用者定案：隨機掉補血包）
