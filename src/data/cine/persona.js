// 角色個性表（docs/cine-redesign-design.md 第 0 期）：2D 舞台的立繪演員怎麼動（game/cine-2d.js）
//   w：換姿勢到位的方式 heavy（先往下頓一下再到位、不彈）／mid（小小的過衝）／light（彈一下）
//   idle：待機的晃動幅度倍率（身體不飄的角色小）
//   blur：換姿勢的過渡格的模糊（像素，舞台座標 1600×900）
export const PERSONA = {
  castron: { w: 'heavy', idle: 0.6, blur: 7 },
  aetheric: { w: 'mid', idle: 0.5, blur: 5 },
  veerwell: { w: 'light', idle: 1.2, blur: 6 },
  sancta: { w: 'mid', idle: 0.7, blur: 5 },
  mira: { w: 'light', idle: 1.1, blur: 6 },
  echo: { w: 'light', idle: 0.9, blur: 5 },
  echo_true: { w: 'mid', idle: 0.8, blur: 5 },
  instructor: { w: 'heavy', idle: 0.4, blur: 6 },
  basalt: { w: 'heavy', idle: 0.8, blur: 7 },
  wren: { w: 'light', idle: 1.3, blur: 6 },
};
export const PERSONA_DEF = { w: 'mid', idle: 1, blur: 6 };
