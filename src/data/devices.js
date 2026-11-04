// 地圖互動裝置的定義（docs/map-devices-design.md）。距離一律是機甲尺度（MS）的倍數，在使用的地方乘。
// hold：按住互動鍵幾秒完成（0＝持續型，按住期間一直作用）；r：互動距離（× MS）；once：完成後不能再用。
export const DEVICES = {
  radar: {
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
// 互動中斷時進度退回的速度（相對於按住的速度）
export const DEV_DECAY = 0.6;
// HUD：畫面外的箭頭只畫這個距離以內的（× DS）
export const DEV_MARK_R = 110;
