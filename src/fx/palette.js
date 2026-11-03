// ============================================================
//  子彈與光束的顏色（docs/vfx-design.md 第 7 期，參考 Oh! Robot）：砲火特效「華麗」時，
//  一眼看得出是誰打的（陣營：自己與友軍＝暖色、敵人＝紅與洋紅）與什麼屬性（實彈／爆發／能量）。
//  各端依自己的設定換色（只有外觀）；「標準」時照武器原本的顏色。
// ============================================================
const PAL = {
  ally: { kin: 0xffd27a, exp: 0xffa040, en: 0x5fe0ff },
  enemy: { kin: 0xff4a36, exp: 0xff3070, en: 0xff3ce0 },
};
// 光束（雷射）的顏色比子彈飽和一點：敵人的雷射＝洋紅
const BEAM = { ally: 0x60d8ff, enemy: 0xff2ad0 };

export const teamKey = (team) => (team === 'enemy' ? 'enemy' : 'ally');
export function shotColor(team, attr) {
  const P = PAL[teamKey(team)];
  return P[attr] || P.kin;
}
export function beamColor(team) {
  return BEAM[teamKey(team)];
}
// 曳光的芯：敵人偏粉紅、自己偏淡黃（芯是白熱的部分，顏色淡）
export function coreColor(team) {
  return team === 'enemy' ? 0xffd6dc : 0xfff2c8;
}
