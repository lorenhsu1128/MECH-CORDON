// 地圖互動裝置的定義（docs/map-devices-design.md）。距離一律是機甲尺度（MS）的倍數，在使用的地方乘。
// hold：按住互動鍵幾秒完成（0＝持續型，按住期間一直作用）；r：互動距離（× MS）；once：完成後不能再用。
export const DEVICES = {
  radar: {
    solid: [[0, 0, 2.6, 2.6, 1.4]],
    name: '雷達站',
    color: 0x5cc8ff,
    r: 7,
    hold: 4,
    verb: '佔領',
    tip: '雷達站：按住互動鍵佔領，之後 HUD 顯示全部敵群、據點與裝置的位置。敵人會派人來搶回去。',
    noise: 50, // 佔領中的噪音（× DS）
    retakeT: 6, // 敵人在範圍內、沒有玩家在範圍內持續幾秒＝被搶回去
    squad: 3, // 佔領後派來查看的敵人數
  },
  recharge: {
    name: '回復站',
    color: 0x7ee081,
    r: 6,
    hold: 0,
    verb: '回復',
    tip: '回復站：站在上面按住互動鍵回復 AP 與 EN，總量有上限。回復時的聲音會把敵人引過來。',
    hpRate: 0.08, // 每秒回復最大 AP 的比例
    enRate: 0.2,
    cap: 0.45, // 整場的回復總量（最大 AP 的比例；多人每多一人 +capMp）
    capMp: 0.2,
    noise: 45,
  },
};
// ---------- C 環境陷阱（game/devices-traps.js） ----------
// trig：shoot＝打壞弱點（hp、弱點的位置 wp＝舊尺度、轉 yaw）／use＝控制台按住互動（use＝控制台的位置、cd 冷卻）。
// fx：delay 秒後的一次性打擊（blast 爆炸半徑＋frac（目標最大 AP 的比例）、line 倒下的直線 [長, 寬]、cover 留下的掩體）
// 與持續的區域 zone（R 圓、sq 正方形的半邊、line 直線；frac 每 0.25 秒、en 扣 EN、slow 緩速、water 只打水裡的、dur 秒）。
// 距離都是舊尺度（× MS）。frac 對玩家與友軍減半、對 Boss ×0.08（devHurt）。
const TRAP_TIP = '（陷阱敵我不分：自己也會受傷）';
Object.assign(DEVICES, {
  crane: {
    solid: [
      [-4.2, 0, 1.4, 1.8, 8.6],
      [4.2, 0, 1.4, 1.8, 8.6],
    ],
    name: '吊掛的貨櫃',
    color: 0xffb040,
    trap: true,
    trig: 'shoot',
    hp: 330,
    wp: [0, 7.55, 0],
    wpR: 0.9,
    hideWp: true,
    act: '鋼索斷了！',
    tip: '吊掛的貨櫃：打斷發光的吊鉤，貨櫃砸下來壓扁底下的敵人，之後留下掩體。' + TRAP_TIP,
    fx: {
      delay: 0.55,
      blast: 5,
      frac: 0.8,
      imp: 1400,
      attr: 'kin',
      cover: [{ kind: 'crate', at: [0, 0, 0], w: 4.1, h: 1.8, d: 1.9 }],
    },
  },
  shock: {
    solid: [[6.3, 0, 0.9, 0.7, 1.4]],
    name: '電擊地板',
    color: 0x7fc8ff,
    trap: true,
    trig: 'use',
    r: 3,
    use: [6.3, 0, 0],
    hold: 1.5,
    cd: 30,
    verb: '通電',
    act: '地板通電',
    tip: '電擊地板：在控制台按住互動鍵，整片地板通電 5 秒，扣 AP 與 EN。跳起來就躲得掉。' + TRAP_TIP,
    fx: { zone: { sq: 5, dur: 5, frac: 0.045, en: 0.06, vis: 'elec', attr: 'en' } },
  },
  mine: {
    solid: [[0, -2.5, 6, 2.2, 3.4]],
    name: '坍方點',
    color: 0xff6a3a,
    trap: true,
    trig: 'shoot',
    hp: 330,
    wp: [0, 0.6, 0.2],
    wpR: 1,
    hideWp: true,
    act: '坍方！',
    tip: '坍方點：打爆支撐木下的炸藥箱，岩石崩落壓住附近的敵人，碎石會擋住路。' + TRAP_TIP,
    dustColor: 0x8a7a64,
    fx: {
      blast: 6,
      frac: 0.7,
      imp: 1200,
      at: [0, 0, 1.5],
      cover: [
        { kind: 'rubble', at: [-2.4, 0, 2.2], w: 2.4, h: 1.2, d: 1.6, yaw: 0.6 },
        { kind: 'rubble', at: [0.4, 0, 3.4], w: 2.8, h: 1.4, d: 1.6 },
        { kind: 'rubble', at: [2.8, 0, 1.6], w: 2.2, h: 1.1, d: 1.5, yaw: -0.5 },
      ],
    },
  },
  ice: {
    name: '冰面裂縫',
    color: 0x9fe8ff,
    trap: true,
    trig: 'shoot',
    hp: 330,
    wp: [0, 0.6, 0],
    wpR: 0.9,
    hideWp: true,
    act: '冰面碎裂',
    tip: '冰面裂縫：打碎發光的冰晶，冰面破洞，站在上面的機體落水（持續受損、行動遲緩）8 秒。' + TRAP_TIP,
    dustColor: 0xd8f0ff,
    fx: {
      blast: 5,
      frac: 0.15,
      imp: 300,
      attr: 'kin',
      zone: { R: 5, dur: 8, frac: 0.03, slow: 0.45, vis: 'ice', attr: 'kin' },
    },
  },
  pylon: {
    solid: [[0, 0, 1.8, 1.8, 12]],
    name: '輸電鐵塔',
    color: 0xffe060,
    trap: true,
    trig: 'shoot',
    hp: 330,
    wp: [1.6, 0.7, -0.4],
    wpR: 0.9,
    hideWp: true,
    act: '鐵塔倒下',
    tip: '輸電鐵塔：打壞底部的變電箱，鐵塔倒下砸中一整排，倒下的電線通電 8 秒。' + TRAP_TIP,
    fx: {
      delay: 1.0,
      line: [13, 3],
      frac: 0.6,
      imp: 1000,
      zone: { line: [13, 4], dur: 8, frac: 0.035, en: 0.05, vis: 'elec', attr: 'en' },
    },
  },
  gas: {
    solid: [[0, 0, 2.4, 2.4, 2.6]],
    name: '天然氣井',
    color: 0xff8a30,
    trap: true,
    trig: 'shoot',
    hp: 330,
    wp: [-1.3, 1.1, 0.6],
    wpR: 1,
    act: '氣井噴火',
    tip: '天然氣井：打爆發光的壓力槽，噴出火柱，附近燒成一片火海 10 秒。' + TRAP_TIP,
    boomColor: 0xff7a20,
    fx: {
      blast: 5,
      frac: 0.55,
      imp: 900,
      pool: true,
      pillar: 4,
      zone: { R: 6, dur: 10, frac: 0.03, attr: 'exp' },
    },
  },
  cable: {
    solid: [[0, 0, 0.6, 0.6, 7.6]],
    name: '斷掉的電纜',
    color: 0x8fd8ff,
    trap: true,
    trig: 'shoot',
    hp: 330,
    wp: [0, 5.7, 0.45],
    wpR: 0.9,
    act: '水面通電',
    tip: '斷掉的電纜：打壞電線桿上的變壓器，附近的水面通電 6 秒（只電到站在水裡的）。' + TRAP_TIP,
    fx: { zone: { R: 7, dur: 6, frac: 0.05, en: 0.08, water: true, vis: 'elec', attr: 'en' } },
  },
});
// 互動中斷時進度退回的速度（相對於按住的速度）
export const DEV_DECAY = 0.6;
// HUD：畫面外的箭頭只畫這個距離以內的（× DS）
export const DEV_MARK_R = 110;
