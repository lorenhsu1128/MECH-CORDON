// ============================================================
//  俯視的「面向游標」操作（設定 ctrl.topCtl：classic 傳統（預設）／aim 面向游標；docs/topdown-control-design.md）
//  機體一直面向游標（手把與觸控＝右搖桿推的方向），W／S＝往游標前進／後退、A／D＝側移；
//  自動鎖定用跟著游標的鎖定框（chase.js 的 chaseLockCands／chaseAutoLock，框的中心＝topRet）；
//  游標吸附（ctrl.topSnap）：游標靠近敵人時準星黏過去並立刻鎖定，拉開才放開
// ============================================================
import { SFX } from '../audio/audio.js';
import { DS } from '../core/scale.js';
import { Game } from './game.js';

const SNAP_K = 0.35, // 吸附半徑＝鎖定框半寬的這個比例（再加上目標在畫面上的大小）
  SNAP_OUT = 1.6, // 放開的距離＝吸附半徑的這個倍數
  SNAP_ANG = (12 * Math.PI) / 180, // 搖桿：方向相差這個角度內吸附
  SNAP_ANG_OUT = (20 * Math.PI) / 180, // 搖桿：偏離這個角度才放開
  RET_T = 0.1, // 準星滑到吸附目標的時間（秒）
  DIR_D = 24 * DS, // 搖桿的游標在機體前方的距離
  NEAR_D = 2.5 * DS, // 游標離機體這麼近時保留上一次的面向
  NOSNAP_PX = 40; // 切換鎖定之後，游標移動這麼多像素以內不重新吸附

Object.assign(Game.prototype, {
  // 俯視而且設定是「面向游標」（空域、觀戰不算）
  topAim() {
    return !!(
      !this.fp &&
      !this.chase &&
      !this.airMode &&
      !this.spectator &&
      this.ctrl &&
      this.ctrl.topCtl === 'aim'
    );
  },
  // 移動輸入要不要換成相對方向（前進＝moveYaw 的方向）
  moveRelOn() {
    return this.ctrl.moveRel === 'mech' || this.camAim() || this.topAim();
  },
  // 移動的基準方向：追尾／第一人稱＝鏡頭、面向游標＝機體到游標（吸附點），傳統的機體面向＝機體
  moveYaw(p) {
    if (this.camAim()) return this.fpYaw;
    if (this.topAim() && this.topYaw !== undefined) return this.topYaw;
    return p.yaw;
  },
  // 鎖定框的中心（畫面座標）：追尾＝畫面中央，面向游標＝準星（topRet）
  lockBoxCenter() {
    if (this.topAim() && this.topRet) return this.topRet;
    return { x: innerWidth / 2, y: innerHeight / 2 };
  },
  // 視角改變、出擊時重設
  topAimReset() {
    this.topDir = null;
    this.topCur = null;
    this.topSnap = null;
    this.topRet = null;
    this.topYaw = undefined;
    this.topNoSnap = null;
  },
  // 每格的瞄準輸入（單機 updatePlayer 與客機 buildLocalInput 共用）：決定游標、吸附、面向與鎖定
  topAimInput(p, dt) {
    const c = p.center();
    if (!this.topDir) this.topDir = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    // 手把的右搖桿、觸控的右搖桿：推的方向（放開後保持最後的方向）
    const pa = this.padAim && this.padAim.lengthSq() > 0.09 ? this.padAim : null;
    const ta = !pa && this.touchAimVec ? this.touchAimVec() : null;
    const st = pa || (ta && ta.lengthSq() > 0.04 ? ta : null);
    if (st) this.topDir.set(st.x, 0, st.z).normalize();
    const ov = this.topAimOverride(p);
    const dirMode = !ov && (this.padActive || this.touchActive);
    const cur = new THREE.Vector3(); // 游標的世界點（機體中段的高度）
    let sx, sy;
    if (ov) {
      // 教學的腳本操作：游標放在鎖定的目標（沒有時是假人）上
      cur.copy(ov.center());
      const s = this.proj(cur);
      sx = s.x;
      sy = s.y;
      const v = cur.clone().sub(c).setY(0);
      if (v.lengthSq() > 1e-4) this.topDir.copy(v.normalize());
    } else if (dirMode) {
      cur.copy(c).addScaledVector(this.topDir, DIR_D);
      const s = this.proj(cur);
      sx = s.x;
      sy = s.y;
    } else {
      sx = this.mouse.x;
      sy = this.mouse.y;
      const ray = new THREE.Raycaster();
      ray.setFromCamera(
        new THREE.Vector2((sx / innerWidth) * 2 - 1, -(sy / innerHeight) * 2 + 1),
        this.camera,
      );
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(p.pos.y + p.model.height * 0.5));
      ray.ray.intersectPlane(plane, cur) || cur.set(p.pos.x, p.pos.y, p.pos.z - 10);
    }
    this.topCur = { x: sx, y: sy };
    // 游標吸附
    if (this.ctrl.topSnap === false || p.dead) this.topSnap = null;
    else this.topSnapTick(p, sx, sy, dirMode);
    const snap = this.topSnap;
    const pt = snap ? snap.center() : cur;
    this.mouseWorld.copy(pt);
    // 準星（畫面座標）：吸附時滑過去
    const tgt = snap ? this.proj(pt) : { x: sx, y: sy };
    if (!this.topRet) this.topRet = { x: tgt.x, y: tgt.y };
    const k = snap || this.topRetSlide ? Math.min(1, dt / RET_T) : 1;
    this.topRet.x += (tgt.x - this.topRet.x) * k;
    this.topRet.y += (tgt.y - this.topRet.y) * k;
    this.topRetSlide = !!snap || Math.hypot(tgt.x - this.topRet.x, tgt.y - this.topRet.y) > 2;
    // 面向（移動的基準）：機體到吸附點／游標
    const dx = pt.x - p.pos.x,
      dz = pt.z - p.pos.z;
    if (dx * dx + dz * dz > NEAR_D * NEAR_D || this.topYaw === undefined)
      this.topYaw = dx * dx + dz * dz > 1e-4 ? Math.atan2(-dx, -dz) : p.yaw;
    this.autoLock(p);
    if (snap && p.lock !== snap) {
      p.lock = snap;
      p.lockT = 0;
    }
  },
  // 教學的示範與自動操作（腳本 tut.scr 在動）：游標由腳本決定＝鎖定的目標，沒有時是假人
  //（腳本的移動與按鍵以「機體對著假人」寫的，game/tutorial.js）
  topAimOverride(p) {
    const T = this.tut;
    if (!T || !T.scr) return null;
    const ds = T.dummies || (T.dummy ? [T.dummy] : []);
    if (p.lock && !p.lock.dead && ds.includes(p.lock)) return p.lock; // 遠程訓練有好幾台：跟著鎖定的那台
    return T.dummy && !T.dummy.dead ? T.dummy : null;
  },
  // 吸附的判定：滑鼠看畫面上的距離，搖桿看方向的角度；有遲滯
  topSnapTick(p, sx, sy, dirMode) {
    const reach = this.lockReach(p);
    const pool = this.lockPool(p);
    const ok = (e) =>
      e &&
      !e.dead &&
      pool.includes(e) && // 已經離場（移除但沒有標成擊破）的不吸
      !e.noLock &&
      !e.isTrap &&
      !e.isProp &&
      e.pos.distanceTo(p.pos) <= reach * (e === this.topSnap ? 1.05 : 1) &&
      !(this.smokeHides && this.smokeHides(p, e));
    // 切換鎖定之後：游標沒移開就不重新吸附
    if (this.topNoSnap) {
      const n = this.topNoSnap;
      const moved = dirMode
        ? this.topDir.angleTo(n.dir) > SNAP_ANG
        : Math.hypot(sx - n.x, sy - n.y) > NOSNAP_PX;
      if (!moved) {
        this.topSnap = null;
        return;
      }
      this.topNoSnap = null;
    }
    const bx = this.lockBox(p);
    // 回傳 [距離, 吸附門檻]（越小越近）
    const measure = (e) => {
      if (dirMode) {
        const v = e.pos.clone().sub(p.pos).setY(0);
        if (v.lengthSq() < 1e-4) return [0, SNAP_ANG];
        return [v.normalize().angleTo(this.topDir), SNAP_ANG];
      }
      const s = this.proj(e.center());
      if (!s.in) return [Infinity, 0];
      // 目標在畫面上的大小：頭頂與腳底投影的距離的一半
      const h = (e.model && e.model.height) || 4;
      const top = this.proj(e.pos.clone().setY(e.pos.y + h));
      const size = Math.abs(top.y - this.proj(e.pos).y) * 0.5;
      return [Math.hypot(s.x - sx, s.y - sy), bx.hw * SNAP_K + Math.min(size, bx.hw * 0.4)];
    };
    const cur = this.topSnap;
    if (ok(cur)) {
      const [d, r] = measure(cur);
      const out = dirMode ? SNAP_ANG_OUT : r * SNAP_OUT;
      if (d <= out) return;
    }
    let best = null,
      bd = Infinity;
    for (const e of pool) {
      if (!ok(e)) continue;
      const [d, r] = measure(e);
      if (d <= r && d < bd) {
        bd = d;
        best = e;
      }
    }
    if (best && best !== cur) SFX.ui();
    this.topSnap = best;
  },
  // 切換鎖定（cycleLock）時放開吸附：游標移開之前不重新吸附
  topSnapRelease() {
    if (!this.topSnap) return;
    this.topSnap = null;
    const q = this.topCur || this.mouse;
    this.topNoSnap = {
      x: q.x,
      y: q.y,
      dir: this.topDir ? this.topDir.clone() : new THREE.Vector3(0, 0, -1),
    };
  },
  // HUD：跟著準星的鎖定框與準星
  drawTopAimHud(c, W, H, p) {
    const r = this.topRet || { x: this.mouse.x, y: this.mouse.y };
    const bx = this.lockBox(p);
    const lk = p.lock && !p.lock.dead ? p.lock : null;
    c.strokeStyle = lk ? 'rgba(255,176,32,.85)' : 'rgba(255,255,255,.4)';
    c.lineWidth = 2;
    const cl = Math.min(20, bx.hw * 0.22);
    c.beginPath();
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const x = r.x + sx * bx.hw,
        y = r.y + sy * bx.hh;
      c.moveTo(x, y - sy * cl);
      c.lineTo(x, y);
      c.lineTo(x - sx * cl, y);
    }
    c.stroke();
    const sn = !!this.topSnap;
    c.strokeStyle = sn ? 'rgba(255,176,32,.95)' : 'rgba(255,255,255,.75)';
    c.lineWidth = sn ? 2 : 1.5;
    c.beginPath();
    c.arc(r.x, r.y, sn ? 13 : 10, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(r.x - 16, r.y);
    c.lineTo(r.x - 6, r.y);
    c.moveTo(r.x + 6, r.y);
    c.lineTo(r.x + 16, r.y);
    c.stroke();
    // 吸附中：系統游標的位置畫一個小點（準星已經黏到目標上）
    if (sn && !this.padActive && !this.touchActive) {
      c.fillStyle = 'rgba(255,255,255,.55)';
      c.beginPath();
      c.arc(this.mouse.x, this.mouse.y, 2.5, 0, Math.PI * 2);
      c.fill();
    }
  },
});
