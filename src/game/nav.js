// ============================================================
//  Game：返回路徑（docs/nav-design.md）
//  每個「可以從好幾個地方進來」的畫面記下返回要回哪裡（navSet），返回鍵一律 navGo，文字 navLabel＝「返回＋目的地」。
//  取代以前各自的旗標（fromHub、fromLevels、garageBrief、pilotFromHub）。
//  畫面：garage（機甲庫）、hub（作戰室）、pilot（駕駛員）、settings（設定）
//  目的地：title 標題、hub 作戰室、brief 簡報（arg＝出擊 id）、freeGarage 自由出擊的機甲庫、garage 機甲庫（照它自己記的
//  返回路徑）、levels 自訂關卡選單、camptrans 轉場畫面、campfail 失敗／撤退畫面、pause 暫停選單
//  沒有記過的畫面一律回標題。
// ============================================================
import { SFX } from '../audio/audio.js';
import { Game } from './game.js';

const LABEL = {
  title: '返回標題',
  hub: '返回作戰室',
  brief: '返回簡報',
  freeGarage: '返回機甲庫',
  garage: '返回機甲庫',
  levels: '返回關卡選單',
  camptrans: '返回轉場畫面',
  campfail: '返回',
  pause: '返回',
};

Object.assign(Game.prototype, {
  navSet(scr, to, arg = null) {
    (this.nav || (this.nav = {}))[scr] = { to, arg };
  },
  navOf(scr) {
    return (this.nav && this.nav[scr]) || { to: 'title', arg: null };
  },
  navLabel(scr) {
    return LABEL[this.navOf(scr).to] || '返回';
  },
  // 機甲庫的場合（campGarageUi、hangarKind、作戰卡共用）：mp 多人、trans 轉場整備、hub 主線整備（從作戰室或簡報）、
  // lv 自訂關卡的整備、free 自由出擊
  garageMode() {
    if (this.net && this.net.role) return 'mp';
    if ((this.camp && this.camp.inGarage) || (this.campC && this.campC.inGarage)) return 'trans';
    const to = this.navOf('garage').to;
    if (to === 'hub' || to === 'brief') return 'hub';
    if (to === 'levels') return 'lv';
    return 'free';
  },
  // 進自由出擊的機甲庫（標題、存檔、自由出擊的結果、作戰室的「返回機甲庫」）：它是最上層，返回＝標題
  openFreeGarage() {
    this.navSet('garage', 'title');
    this.openGarage();
  },
  navGo(scr) {
    SFX.ui();
    const { to, arg } = this.navOf(scr);
    switch (to) {
      case 'hub':
        return this.openHub();
      case 'brief':
        // 作戰室的場景照常建立；openHub 先播還沒看過的劇情時不接簡報
        this.openHub();
        if (this.state === 'hub' && arg) this.openBrief(arg);
        return;
      case 'freeGarage':
        return this.openFreeGarage();
      case 'garage':
        return this.openGarage();
      case 'levels':
        return this.openLevels();
      case 'camptrans':
        // 轉場整備不出擊、回到轉場畫面（按鈕直接顯示）
        if (!this.camp) return this.openHub();
        this.camp.inGarage = false;
        this.state = 'camptrans';
        this.showScreen('campTrans');
        document.getElementById('ctBtns').style.visibility = 'visible';
        return;
      case 'campfail':
        if (!this.camp) return this.openHub();
        this.camp.inGarage = false;
        this.state = 'campfail';
        this.showScreen('campFail');
        this.campFailBtns();
        return;
      case 'pause':
        this.state = 'pause';
        this.showScreen('pause');
        return;
      default:
        this.state = 'title';
        this.showScreen('title');
    }
  },
});
