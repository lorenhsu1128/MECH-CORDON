// Game：攝影機與觀戰目標
import { clamp, lerp, rnd } from '../core/math.js';
import { DS, MS } from '../core/scale.js';
import { isOutline } from '../render/geometry.js';
import { meleeMove } from '../data/melee.js';
import { TP_FOV } from './constants.js';

const EXEC_ZOOM = 0.5; // 處決中的鏡頭距離倍率
import { Game } from './game.js';

const CAM_PITCH = Math.atan2(30, 17.5); // 第三人稱鏡頭的俯角（約 60°）
// 鏡頭的角度「廣角」（設定 ctrl.camAngle，參考 Oh! Robot）：視角加寬、俯角變陡、距離拉近——畫面邊緣的建築往外倒
const WIDE_FOV = 62,
  WIDE_PITCH = 1.2, // 約 69°
  WIDE_DIST = 0.72;
// 鏡頭的位移（機甲三倍高改版：跟著機體放大 DS 倍）
const CAM_OFF = new THREE.Vector3(0, 30, 17.5).multiplyScalar(DS);
const CAM_PITCH_MAX = 1.31;
const CAM_AIR_K = 0.5; // 跳躍時鏡頭少跟的離地高度比例 // 地形擋住時最多轉到約 75°，還是擋住就把鏡頭拉近
// 跳躍的安全框（2026-11-07）：機體頭頂在畫面上最高到這個位置（NDC，1＝上緣），超過時鏡頭多跟一些
const CAM_AIR_TOP = 0.6;
// 高空時鏡頭拉遠：離地 CAM_AIR_FAR（×DS）時拉遠到 1＋CAM_AIR_ZOOM 倍
const CAM_AIR_FAR = 20,
  CAM_AIR_ZOOM = 0.2;
// 鏡頭拉遠的上限（倍率）：設定的「鏡頭最遠距離」，預設 1.8（約 55 m 高，一定在霧的範圍內）
const CAM_MAX_DEF = 1.8;
// 平時的鏡頭距離（倍率，設定的「鏡頭距離」ctrl.camDist）：標準 0.65＝機體約佔畫面高度的 18%
const CAM_DIST = { near: 0.5, std: 0.65, far: 0.85 };
const MELEE_ZK = 0.62; // 近戰時最近拉到平時距離的這個倍率（標準＝0.4，機體約佔畫面 30%）
const MELEE_HOLD = 0.9; // 近戰結束後維持近戰鏡頭的秒數（連段之間不一直伸縮）
const CAM_PITCH_MELEE = 0.8; // 近戰時的俯角（約 46°，從比較側面的角度看揮刀）
// 特寫鏡頭（處決、彈刀、終結技、打出失衡；設定 ctrl.camCU）
const CU_PITCH = 0.36; // 俯角約 21°
const CU_CD = 2.5; // 處決以外的特寫最短間隔（秒）
// 機體被擋住時的透視輪廓：只畫在被擋住的地方（深度比遮擋物遠）
const XRAY_MAT = new THREE.MeshBasicMaterial({
  color: 0x8fdcff,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  depthFunc: THREE.GreaterDepth,
  fog: false,
});
// 蒙皮網格（render/mesh-merge.js 合併的機體）用的版本：同一副骨架（r128 的材質不能蒙皮與一般共用）
const XRAY_SKIN = XRAY_MAT.clone();
XRAY_SKIN.skinning = true;
// 陰影範圍貼合畫面（2026-11-13，docs/perf-threejs-upgrade.md 第十二節）：以前陰影鏡頭是以注視點為中心、邊長 420～750 m 的
// 正方形（幾乎整張地圖），畫面外的物件全部要畫進陰影貼圖（平板上研究特區一格 800 多次繪製）。改成量鏡頭四個角落的射線打到
// 機體附近高度（低、高兩個平面）的範圍，換到太陽的座標（陰影鏡頭的左右／上下軸）取外框＋外圍。畫面外的高物件投進畫面的影子：
// 平行光的影子沿光線方向，接收點與投影物在太陽座標的 XY 相同，所以只要涵蓋畫面裡的接收點就夠了。
// 抖動：範圍以 SH_STEP 為一級往上取整、中心對齊陰影貼圖的像素
const SH_LO = -6, // 接收面：機體高度往下／往上（×DS 公尺）
  SH_HI = 14,
  SH_PAD = 8, // 外圍（×DS）
  SH_STEP = 6, // 範圍的級距（×DS）
  SH_MIN = 24; // 最小的半邊長（×DS）
const _shV = new THREE.Vector3(),
  _shU = new THREE.Vector3(),
  _shW = new THREE.Vector3(),
  _shD = new THREE.Vector3(),
  _shUp = new THREE.Vector3(0, 1, 0);
const SH_CORNERS = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

Object.assign(Game.prototype, {
  // 太陽與陰影鏡頭：c＝原本的中心（注視點），maxExt＝原本的半邊長（上限，不會比以前大），capD＝射線最遠多遠（追尾、第一人稱的地平線）
  sunFit(c, maxExt, capD) {
    const sun = this.sun,
      sc = sun.shadow.camera,
      cam = this.camera;
    let ext = maxExt,
      cx = c.x,
      cz = c.z;
    const off = this.sunOff;
    if (this.ctrl.shadowFit !== false && off.lengthSq() > 1e-6) {
      cam.updateMatrixWorld();
      // 太陽座標的軸（同 three.js 陰影鏡頭的 lookAt：x＝up×dir、y＝dir×x）
      _shD.copy(off).normalize();
      _shU.crossVectors(_shUp, _shD);
      if (_shU.lengthSq() < 1e-6) _shU.set(1, 0, 0);
      _shU.normalize();
      _shW.crossVectors(_shD, _shU);
      let a0 = 1e9,
        a1 = -1e9,
        b0 = 1e9,
        b1 = -1e9;
      const cp = cam.position;
      const put = (x, y, z) => {
        const a = x * _shU.x + y * _shU.y + z * _shU.z,
          b = x * _shW.x + y * _shW.y + z * _shW.z;
        if (a < a0) a0 = a;
        if (a > a1) a1 = a;
        if (b < b0) b0 = b;
        if (b > b1) b1 = b;
      };
      put(cp.x, cp.y, cp.z);
      for (const [nx, ny] of SH_CORNERS) {
        _shV.set(nx, ny, 0.5).unproject(cam).sub(cp).normalize();
        for (const h of [SH_LO, SH_HI]) {
          const y = c.y + h * DS;
          let t = Math.abs(_shV.y) > 1e-4 ? (y - cp.y) / _shV.y : capD;
          if (!(t > 0) || t > capD) t = capD;
          put(cp.x + _shV.x * t, cp.y + _shV.y * t, cp.z + _shV.z * t);
        }
      }
      const step = SH_STEP * DS;
      const e = Math.max(a1 - a0, b1 - b0) / 2 + SH_PAD * DS;
      ext = Math.min(maxExt, Math.max(SH_MIN * DS, Math.ceil(e / step) * step));
      // 中心：太陽座標的中點對齊陰影貼圖的像素，換回世界座標（沿光線方向的深度用原本的中心）
      const tx = (2 * ext) / (sun.shadow.mapSize.x || 2048);
      const am = Math.round((a0 + a1) / 2 / tx) * tx,
        bm = Math.round((b0 + b1) / 2 / tx) * tx;
      const dd = c.x * _shD.x + c.y * _shD.y + c.z * _shD.z;
      _shV.copy(_shU).multiplyScalar(am).addScaledVector(_shW, bm).addScaledVector(_shD, dd);
      cx = _shV.x;
      cz = _shV.z;
      sun.target.position.copy(_shV);
    } else sun.target.position.set(cx, c.y, cz);
    sun.position.copy(sun.target.position).add(off);
    if (sc.right !== ext) {
      sc.left = -ext;
      sc.right = ext;
      sc.top = ext;
      sc.bottom = -ext;
      sc.updateProjectionMatrix();
    }
  },
  camK() {
    return DS;
  },
  camOff() {
    return CAM_OFF;
  },
  spectateList() {
    return [
      ...this.players.filter((x) => !x.dead),
      ...this.enemies.filter((x) => !x.dead),
      ...this.allies.filter((x) => !x.dead),
    ];
  },
  // 給定注視點與縮放倍率，兩個點是否都在畫面內（NDC 邊距 margin）
  fitsAt(target, zoom, pts, margin = 0.82) {
    const a = this.camPitch0 || this.camPitchStd(),
      L = this.camOff().length() * zoom;
    const off = new THREE.Vector3(0, Math.sin(a) * L, Math.cos(a) * L);
    this.camScratch.position.copy(target).add(off);
    this.camScratch.lookAt(target.x, target.y, target.z);
    this.camScratch.updateMatrixWorld();
    const v = new THREE.Vector3();
    for (const p of pts) {
      v.copy(p).project(this.camScratch);
      if (Math.abs(v.x) > margin || Math.abs(v.y) > margin || v.z > 1) return false;
    }
    return true;
  },
  // 平時的鏡頭距離（倍率）
  camBase() {
    return (CAM_DIST[this.ctrl.camDist] || CAM_DIST.std) * (this.ctrl.camAngle === 'wide' ? WIDE_DIST : 1);
  },
  // 第三人稱（俯視）的視角與俯角：設定「鏡頭的角度」ctrl.camAngle（std 標準／wide 廣角）
  tpFov() {
    return this.ctrl.camAngle === 'wide' ? WIDE_FOV : TP_FOV;
  },
  camPitchStd() {
    return this.ctrl.camAngle === 'wide' ? WIDE_PITCH : CAM_PITCH;
  },
  // 特寫鏡頭：foe＝對手（可以沒有），sec＝秒數；exec＝處決（每格延長，不看間隔）
  camCloseup(foe, sec, exec) {
    if (this.ctrl.camCU === 'off' || this.fp || this.chase || this.spectator || !this.player) return;
    const cu = this.camCU;
    if (!exec && !cu && (this.camCUcd || 0) > 0) return;
    if (cu && cu.foe === foe) {
      cu.end = Math.max(cu.end, cu.t + sec);
      return;
    }
    if (cu && !exec) return; // 特寫中不換對象
    this.camCU = { foe: foe || null, t: 0, end: sec, side: 0, w: cu ? cu.w : 0 };
    if (!exec) this.camCUcd = CU_CD + sec;
  },
  // 特寫鏡頭的位置與注視點（機體與對手的連線旁邊、低俯角）；地形擋住時回傳 null
  camCUPose(p, cu) {
    const h = p.model.height || 4;
    const a = p.center();
    const fw = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const foe = cu.foe && !cu.foe.dead ? cu.foe : null;
    const b = foe ? foe.center() : a.clone().addScaledVector(fw, h);
    const mid = a.clone().lerp(b, 0.5);
    const d = b.clone().sub(a).setY(0);
    const span = d.length();
    if (span < 1e-3) d.copy(fw);
    d.normalize();
    const dist = Math.max(2.4 * h, span * 1.15 + 1.4 * h);
    const pose = (side) =>
      mid
        .clone()
        .addScaledVector(new THREE.Vector3(-d.z * side, 0, d.x * side), Math.cos(CU_PITCH) * dist)
        .addScaledVector(d, -0.3 * dist) // 稍微偏到自己這一側
        .setY(mid.y + Math.sin(CU_PITCH) * dist);
    const ok = (pos) =>
      !this.world.terrainBlocks(pos, mid) && pos.y > this.world.terrainHeight(pos.x, pos.z) + 0.5 * h;
    if (!cu.side) {
      // 先挑鏡頭原本在的那一側，看不到換另一側
      const cur = this.camera.position.clone().sub(mid);
      const s0 = cur.x * -d.z + cur.z * d.x >= 0 ? 1 : -1;
      cu.side = ok(pose(s0)) ? s0 : ok(pose(-s0)) ? -s0 : 0;
      if (!cu.side) return null;
    }
    const pos = pose(cu.side);
    return ok(pos) ? { pos, look: mid } : null;
  },
  // 找到能同時容納兩點的最小縮放（0.65 ~ 2.2）
  fitZoom(target, pts, minZ, maxZ) {
    for (let z = minZ; z <= maxZ + 1e-6; z += z < 2 ? 0.05 : 0.15) {
      if (this.fitsAt(target, z, pts)) return z;
    }
    return maxZ;
  },
  // 機體的透視輪廓：每個網格掛一個共用幾何的子網格（XRAY_MAT，只畫在被擋住的地方），換模型時重建
  camXray(ent, on, dt) {
    if (ent.xrayFor !== ent.mesh) {
      ent.xrayFor = ent.mesh;
      const list = [];
      ent.mesh.traverse((o) => {
        if (!o.isMesh || o.userData.xray || !o.geometry) return;
        const m = o.material;
        if (!m || Array.isArray(m) || m.transparent || isOutline(m) || m.blending === THREE.AdditiveBlending)
          return;
        list.push(o);
      });
      for (const o of list) {
        const x = o.isSkinnedMesh
          ? new THREE.SkinnedMesh(o.geometry, XRAY_SKIN)
          : new THREE.Mesh(o.geometry, XRAY_MAT);
        if (o.isSkinnedMesh) x.bind(o.skeleton, o.bindMatrix);
        x.userData.xray = true;
        x.userData.helper = true;
        x.renderOrder = 20;
        x.castShadow = x.receiveShadow = false;
        x.raycast = () => {};
        o.add(x);
      }
    }
    XRAY_MAT.opacity = lerp(XRAY_MAT.opacity, on && !this.fp ? 0.5 : 0, Math.min(1, dt * 8));
    XRAY_MAT.visible = XRAY_MAT.opacity > 0.01;
    XRAY_SKIN.opacity = XRAY_MAT.opacity;
    XRAY_SKIN.visible = XRAY_MAT.visible;
  },
  updateCamera(dt) {
    this.camExtra = 0; // 鏡頭比預設距離遠出多少公尺（霧往外推，render/style/pipeline.js）
    if (this.chase) {
      // 追尾視角（chase.js）：觀戰與陣亡後看隊友時用對方的瞄準方向
      let ent = this.player;
      if (ent && !this.spectator && ent.dead && this.players && this.players.length > 1) {
        const alive = this.players.filter((x) => !x.dead);
        if (alive.length) ent = alive[this.spectateIdx % alive.length];
      }
      if (ent) {
        if (this.spectator || ent !== this.player) {
          this.chaseCamera(ent, dt, ent.aimYaw, clamp(ent.aimPitch || 0, -0.6, 0.6));
        } else {
          if (!ent.dead) this.chaseAssistTick(ent, dt);
          this.chaseCamera(ent, dt, this.fpYaw, this.fpPitch);
        }
        this.camFocus = ent;
        return;
      }
    }
    if (this.fp) {
      let ent = this.player;
      if (this.spectator) {
        ent = this.player;
        if (ent) {
          const y = ent.aimYaw,
            pt = clamp(ent.aimPitch || 0, -0.6, 0.6);
          this.fpCamera(ent, dt, y, pt);
        }
      } else if (ent && !ent.dead) {
        this.fpCamera(ent, dt, this.fpYaw, this.fpPitch);
      } else if (ent) {
        this.fpShow();
      }
      if (ent) {
        this.world.updateOcclusion(this.camera.position, ent.center(), 0);
        this.camFocus = ent;
        return;
      }
    }
    if (this.spectator) {
      this.specMode = this.specMode || 'follow';
      const alive = this.players.filter((x) => !x.dead);
      if (this.specMode === 'director' && alive.length) {
        this.specDirT = (this.specDirT || 0) + dt;
        if (this.specDirT > 1) {
          this.specDirT = 0;
          const score = (q) => {
            let s = 0;
            for (const e of this.enemies) {
              if (!e.dead && e.pos.distanceTo(q.pos) < 30 * this.camK()) s += 1;
            }
            if (q.melee.active) s += 5;
            if (q.hp < q.maxHp * 0.4) s += 3;
            if (q.downed) s += 4;
            if (q.boost) s += 1;
            return s;
          };
          let best = null,
            bs = -1;
          for (const q of alive) {
            const s = score(q);
            if (s > bs) {
              bs = s;
              best = q;
            }
          }
          const cur = alive[this.spectateIdx % alive.length];
          this.specSince = (this.specSince || 0) + 1;
          if (best && best !== cur && this.specSince >= 5 && score(best) > score(cur) + 1) {
            this.spectateIdx = alive.indexOf(best);
            this.specSince = 0;
            this.flashMsg('導演視角 ▸ ' + best.name, 0xffb020, 1.0);
          }
        }
      }
      if (this.specMode === 'boss' && this.bosses && this.bosses.some((b) => !b.dead)) {
        const bz = this.bosses.find((b) => !b.dead);
        this.player = bz;
      } else if (this.fp) {
        const L = this.spectateList();
        if (L.length) this.player = L[this.spectateIdx % L.length];
      } else if (alive.length) this.player = alive[this.spectateIdx % alive.length];
    }
    let p = this.player;
    if (!p) return;
    if (!this.spectator && p.dead && this.players && this.players.length > 1) {
      const alive = this.players.filter((x) => !x.dead);
      if (alive.length) p = alive[this.spectateIdx % alive.length];
    }
    this.camFocus = p;
    if (!this.camScratch) {
      this.camScratch = new THREE.PerspectiveCamera(42, 1, 0.5 * this.camK(), 400 * this.camK());
    }
    // 鏡頭的角度（設定）：俯視的視角
    const fov = this.tpFov();
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camScratch.aspect = this.camera.aspect;
    this.camScratch.fov = this.camera.fov;
    this.camScratch.updateProjectionMatrix();
    const B = this.camBase(); // 平時的距離
    const ZMAX = Math.max(B, this.ctrl.camMax || CAM_MAX_DEF),
      ZMELEE = B * MELEE_ZK; // 拉遠只到設定的上限；更遠的敵人看畫面邊緣的箭頭
    // 近戰對象：玩家在連段中砍的目標，或正在砍玩家的敵人
    let meleeFoe = null;
    if (p.melee.active && p.melee.target && !p.melee.target.dead) meleeFoe = p.melee.target;
    else if (p.melee.active && p.lock && !p.lock.dead && p.lock.pos.distanceTo(p.pos) < 18 * this.camK())
      meleeFoe = p.lock;
    if (!meleeFoe) {
      for (const e of this.enemies) {
        if (!e.dead && e.melee.active && e.melee.target === p && e.pos.distanceTo(p.pos) < 22 * this.camK()) {
          meleeFoe = e;
          break;
        }
      }
    }
    // 近戰結束後維持一下近戰鏡頭（連段之間、對手被打飛時不一直伸縮）
    if (meleeFoe) {
      this.camMeleeFoe = meleeFoe;
      this.camMeleeT = MELEE_HOLD;
    } else if ((this.camMeleeT || 0) > 0 && this.camMeleeFoe && !this.camMeleeFoe.dead) {
      this.camMeleeT -= dt;
      if (this.camMeleeFoe.pos.distanceTo(p.pos) < 30 * this.camK()) meleeFoe = this.camMeleeFoe;
    }
    let zoomT = B,
      focus = p.pos.clone();
    const lookAhead = new THREE.Vector3(); // 玩家永遠在畫面正中央：不做滑鼠方向偏移
    // 注視點永遠在玩家（不平移鏡頭），只改變鏡頭距離
    focus = p.pos.clone(); // 玩家永遠置中：不再依滑鼠方向偏移
    if (this.spectator && this.specMode === 'free') {
      if (!this.specPos) this.specPos = p.pos.clone();
      focus = this.specPos.clone();
      meleeFoe = null;
      this.camMode = 'free';
      this.camZoom = lerp(this.camZoom || 1, this.specZoom || 1, Math.min(1, dt * 5));
      const tgt = focus;
      tgt.y = this.world.terrainHeight(focus.x, focus.z) + 1.5 * MS;
      this.camTarget.lerp(tgt, Math.min(1, dt * 10));
      const off = this.camOff().clone().multiplyScalar(this.camZoom);
      this.camera.position.lerp(this.camTarget.clone().add(off), Math.min(1, dt * 10));
      this.camera.lookAt(this.camTarget.x, this.camTarget.y, this.camTarget.z);
      this.sunFit(this.camTarget, 70 * this.camK() * Math.max(1, this.camZoom), 160 * DS);
      this.world.updateOcclusion(this.camera.position, this.camTarget, dt);
      this.rangeRing.visible = false;
      return;
    }
    if (this.spectator && this.specMode === 'all') {
      const alive = this.players.filter((x) => !x.dead);
      if (alive.length) {
        const cen = new THREE.Vector3();
        alive.forEach((q) => cen.add(q.pos));
        cen.multiplyScalar(1 / alive.length);
        focus = cen;
        const pts = alive.map((q) => q.center());
        for (const b of this.bosses || []) if (!b.dead) pts.push(b.center());
        const zt = this.fitZoom(focus, pts, 1, 8) * (this.specZoom || 1);
        this.camMode = 'all';
        meleeFoe = null;
        this.camZoom = lerp(this.camZoom || 1, zt, Math.min(1, dt * 3));
        const tgt = focus.clone();
        tgt.y = this.world.terrainHeight(focus.x, focus.z) + 1.5 * MS;
        this.camTarget.lerp(tgt, Math.min(1, dt * 4));
        const off = this.camOff().clone().multiplyScalar(this.camZoom);
        this.camera.position.lerp(this.camTarget.clone().add(off), Math.min(1, dt * 4));
        this.camera.lookAt(this.camTarget.x, this.camTarget.y, this.camTarget.z);
        this.sunFit(this.camTarget, 70 * this.camK() * Math.max(1, this.camZoom), 160 * DS);
        this.world.updateOcclusion(this.camera.position, this.camTarget, dt);
        this.rangeRing.visible = false;
        return;
      }
    }
    if (meleeFoe) {
      zoomT = this.fitZoom(focus, [p.center(), meleeFoe.center()], ZMELEE, ZMAX);
      this.camMode = 'melee';
    } else if (p.lock && !p.lock.dead) {
      if (this.fitsAt(focus, B, [p.center(), p.lock.center()])) {
        zoomT = B;
        this.camMode = 'default';
      } else {
        zoomT = this.fitZoom(focus, [p.center(), p.lock.center()], B, ZMAX);
        this.camMode = 'wide';
      }
    } else {
      this.camMode = 'default';
    }
    if (this.spectator) zoomT *= this.specZoom || 1;
    else zoomT = clamp(zoomT * (this.camUser || 1), Math.min(ZMELEE, B * 0.6), ZMAX); // 滾輪手動調整的距離
    // 離地越高鏡頭越遠（2026-11-07：高空時同時看得到自己與地面）
    const air =
      !p.grounded && !this.spectator && !p.air
        ? Math.max(0, p.pos.y - this.world.groundAt(p.pos.x, p.pos.z, p.pos.y))
        : 0;
    if (!this.spectator) zoomT *= 1 + CAM_AIR_ZOOM * clamp(air / (CAM_AIR_FAR * DS), 0, 1);
    // 處決中：鏡頭拉近（docs/melee-combo-design.md）
    const mst =
      p.melee.active && p.weapons[p.melee.slot] && meleeMove(p.weapons[p.melee.slot].def, p.melee.stage);
    if (mst && mst.exec) {
      zoomT = Math.min(zoomT, EXEC_ZOOM * B);
      if (!this.spectator) this.camCloseup(meleeFoe, 0.35, true);
    }
    // 拉近快、拉遠慢
    this.camZoom = lerp(this.camZoom || B, zoomT, Math.min(1, dt * (zoomT < (this.camZoom || B) ? 4 : 2)));
    // 俯角：近戰時壓低
    this.camPitch0 = lerp(
      this.camPitch0 || this.camPitchStd(),
      this.camMode === 'melee' && !this.spectator ? CAM_PITCH_MELEE : this.camPitchStd(),
      Math.min(1, dt * 2.5),
    );
    const tgt = focus;
    tgt.y = p.pos.y + p.model.height * 0.35; // 以機體中段為中心
    // 跳躍時鏡頭只跟一半的離地高度（2026-11-06：以前整個跟著，機體停在畫面中央，看不出往上跳）；
    // 站上高台這種貼地的高度差照舊全跟，落地後平滑回到原位。
    // 安全框（2026-11-07）：跳得高時頭頂會超出畫面上緣，所以少跟的量最多讓頭頂停在 CAM_AIR_TOP——
    // 以注視點為原點、目前的俯角 a 與距離 L，比注視點高 y 的點在畫面上的 NDC＝y·cos a／((L − y·sin a)·tan(fov/2))
    {
      let want = air * CAM_AIR_K;
      if (air > 0) {
        const a = this.camPitch || this.camPitch0,
          L = this.camOff().length() * this.camZoom * (this.camDistK || 1),
          T = Math.tan(((this.camera.fov || TP_FOV) * Math.PI) / 360) * CAM_AIR_TOP;
        const yMax = (T * L) / (Math.cos(a) + T * Math.sin(a));
        // 頭頂比注視點高 0.65 身高＋少跟的量
        want = Math.min(want, Math.max(0, yMax - p.model.height * 0.65));
      }
      this.camAirOff = lerp(this.camAirOff || 0, want, Math.min(1, dt * (air > 0 ? 14 : 6)));
      tgt.y -= this.camAirOff;
    }
    this.camTarget.lerp(tgt, Math.min(1, dt * 12));
    // 地形（山脊、峽谷壁、台地）擋在鏡頭和機體之間時，鏡頭往正上方轉到看得到為止；之後慢慢轉回來
    const L0 = this.camOff().length() * this.camZoom;
    const offAt = (a, L) => new THREE.Vector3(0, Math.sin(a) * L, Math.cos(a) * L);
    const blocked = (a, L) =>
      this.world.terrainBlocks(this.camTarget.clone().add(offAt(a, L)), this.camTarget);
    let want = this.camPitch0,
      wantK = 1;
    while (want < CAM_PITCH_MAX && blocked(want, L0)) want = Math.min(CAM_PITCH_MAX, want + 0.08);
    while (wantK > 0.45 && blocked(want, L0 * wantK)) wantK -= 0.1; // 轉到上限還是擋住：拉近
    const cur = this.camPitch || this.camPitch0,
      curK = this.camDistK || 1;
    this.camPitch = lerp(cur, want, Math.min(1, dt * (want > cur ? 7 : 1.5)));
    this.camDistK = lerp(curK, wantK, Math.min(1, dt * (wantK < curK ? 7 : 1.5)));
    const L = L0 * this.camDistK;
    this.camExtra = Math.max(0, L - this.camOff().length());
    const off = offAt(this.camPitch, L);
    const desired = this.camTarget.clone().add(off);
    // 特寫鏡頭：平時的鏡頭照常跟著（camBasePos），畫面在兩者之間混合
    if (!this.camBasePos) this.camBasePos = new THREE.Vector3();
    if (!this.camCU) this.camBasePos.copy(this.camera.position);
    this.camBasePos.lerp(desired, Math.min(1, dt * 8));
    this.camera.position.copy(this.camBasePos);
    this.camCUcd = Math.max(0, (this.camCUcd || 0) - dt);
    let look = this.camTarget,
      cuW = 0;
    const cu = this.camCU;
    if (cu) {
      cu.t += dt;
      const pose = p.dead || this.ctrl.camCU === 'off' ? null : this.camCUPose(p, cu);
      const on = !!pose && cu.t < cu.end;
      cu.w = on ? Math.min(1, cu.w + dt / 0.18) : Math.max(0, cu.w - dt / 0.3);
      if (pose) cu.pose = pose;
      if (cu.w <= 0 && !on) this.camCU = null;
      else if (cu.pose) {
        cuW = cu.w * cu.w * (3 - 2 * cu.w);
        this.camera.position.lerp(cu.pose.pos, cuW);
        look = this.camTarget.clone().lerp(cu.pose.look, cuW);
      }
    }
    if (this.camShake > 0) {
      this.camShake -= dt;
      const a = Math.min(1, this.camShake * 4) * this.camZoom * this.camK();
      this.camera.position.x += rnd(-0.6, 0.6) * a;
      this.camera.position.z += rnd(-0.6, 0.6) * a;
      this.camera.position.y += rnd(-0.3, 0.3) * a;
    }
    this.camKickTick(this.camera.position, dt, (cuW ? 0.5 : this.camZoom) * this.camK()); // 近戰命中的鏡頭推動（juice.js）
    this.camera.lookAt(look.x, look.y, look.z);
    this.sunFit(this.camTarget, 70 * this.camK() * Math.max(1, this.camZoom), 160 * DS);
    // 頭、中心、腳都檢查；還是被擋住（物件或地形）時顯示機體的透視輪廓
    const c = p.center(),
      h = p.model.height || 4;
    const pts = [c, c.clone().setY(p.pos.y + h * 0.95), c.clone().setY(p.pos.y + 0.4 * MS)];
    const occ = this.world.updateOcclusion(this.camera.position, c, dt, pts);
    const fade = this.world.fadeMeshes(this.camera.position, pts, dt);
    const hid = occ || fade || pts.some((q) => this.world.terrainBlocks(this.camera.position, q));
    this.camXray(p, hid && !p.dead, dt);
    this.rangeRing.visible = true;
    this.rangeRing.position.set(p.pos.x, this.world.terrainHeight(p.pos.x, p.pos.z) + 0.12 * MS, p.pos.z);
    this.rangeRing.scale.setScalar(p.stats.lockRange);
  },
});
