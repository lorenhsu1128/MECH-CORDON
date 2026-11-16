// 視角切換的運鏡（2026-11-16 使用者定案）：按「切換視角」時鏡頭從舊視角的位置飛到新視角（約 0.5 秒）、HUD 交叉淡化。
// 操作在按下的那一刻就換成新視角的規則（定案 A），運鏡只是畫面：各視角的鏡頭照常每格算（camera.js 的 updateCamera），
// viewTrApply 在算繪前把實際的鏡頭混合到起點（按下時記下、相對機體的位置，所以跟著機體移動）與這一格的終點之間。
// 位置走往上拱的弧線、朝向球面內插、視野寬度漸變；第一人稱：推進時最後才藏起自己的機體，拉出時先藏著再出現。
// HUD：舊的畫面（#hud 畫布）拍一張放在 #hudTr 淡出，新的淡入；DOM 的 HUD（#hudWrap）跟著淡入。
// 設定「視角切換的運鏡」ctrl.viewTr（on／off）；介面動畫關閉時 HUD 直接切換。自動化測試（webdriver）不播，要看時設 window.__viewTr
import { clamp, lerp } from '../core/math.js';
import { Game } from './game.js';

const VT_T = 0.5; // 運鏡的秒數
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

Object.assign(Game.prototype, {
  viewTrOn() {
    if ((this.ctrl && this.ctrl.viewTr) === 'off') return false;
    if (typeof navigator !== 'undefined' && navigator.webdriver && !window.__viewTr) return false;
    return !!(this.player && this.camera && this.state === 'play');
  },
  // setView 換完旗標之前呼叫：記下舊鏡頭（相對機體）與 HUD 的畫面
  viewTrStart(from, to) {
    if (!this.viewTrOn()) return;
    const p = this.player,
      cam = this.camera;
    this.viewTr = {
      t0: performance.now(),
      from,
      to,
      ent: p,
      off: cam.position.clone().sub(p.pos),
      q: cam.quaternion.clone(),
      fov: cam.fov,
    };
    this.viewTrHud();
  },
  // HUD 的交叉淡化：舊畫面拍下來淡出、新的淡入（CSS 動畫，styles.css 的 vtOut／vtIn）
  viewTrHud() {
    const fx = this.uiFx ? this.uiFx() : 'full';
    if (fx === 'off') return;
    const src = this.hudC;
    let tr = document.getElementById('hudTr');
    if (!tr || !src) return;
    if (tr.width !== src.width || tr.height !== src.height) {
      tr.width = src.width;
      tr.height = src.height;
    }
    tr.style.width = src.style.width;
    tr.style.height = src.style.height;
    const c = tr.getContext('2d');
    c.clearRect(0, 0, tr.width, tr.height);
    c.drawImage(src, 0, 0);
    const restart = (el, cls) => {
      if (!el) return;
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
    };
    restart(tr, 'vtOut');
    restart(src, 'vtIn');
    restart(document.getElementById('hudWrap'), 'vtIn');
  },
  // 每格：updateCamera 之後、算繪之前
  viewTrApply() {
    const V = this.viewTr;
    if (!V) return;
    const p = this.player,
      cam = this.camera;
    if (!p || V.ent !== p || p.dead || this.state !== 'play') {
      this.viewTr = null;
      return;
    }
    const k = clamp((performance.now() - V.t0) / (VT_T * 1000), 0, 1);
    if (k >= 1) {
      this.viewTr = null;
      return;
    }
    const e = ease(k);
    const from = p.pos.clone().add(V.off);
    const to = cam.position.clone();
    const dist = from.distanceTo(to);
    cam.position.lerpVectors(from, to, e);
    const arc = Math.sin(Math.PI * e);
    cam.position.y += arc * dist * 0.18; // 往上拱
    // 過渡途中一律在機體頭頂以上（不從肩膀旁邊擦過、不穿過機體）；頭尾的 arc＝0，不影響起點與終點
    const h = (p.model && p.model.height) || 3;
    cam.position.y = Math.max(cam.position.y, p.pos.y + h * (1 + 0.7 * arc) * (arc > 0.05 ? 1 : 0));
    const qTo = cam.quaternion.clone();
    cam.quaternion.copy(V.q).slerp(qTo, e);
    cam.fov = lerp(V.fov, cam.fov, e);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // 第一人稱：推進時鏡頭快進到頭部才藏起自己的機體；拉出時先藏著，離開頭部再出現
    if (V.to === 'fp' && e < 0.8) this.fpShow();
    if (V.from === 'fp') {
      if (e < 0.5) this.fpHide(p);
      else if (this.fpHidden) this.fpShow();
    }
  },
});
