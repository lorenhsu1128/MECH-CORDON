// 地圖上會動的載具（docs/map-vehicles-design.md）：一台車＝沿事先算好的環狀路線開的狀態機，可以打壞、踩扁。
// 判定只在單機／房主（第 1 期只有單機）；Game 端的規畫、每格更新與踩扁在 game/map-veh.js。
// 不是 MechEntity：命中目標是沿車身排的幾顆球（parts，和運輸車輛相同），不能鎖定，敵人也不瞄準。
import { SFX } from '../audio/audio.js';
import { weaponAttr } from '../data/attrs.js';
import { DESTRUCT, PROP_CHAR, propAttrK, propHpFor, propStage } from '../data/destruct.js';
import { MV_TYPES } from '../data/map-veh.js';
import { weaponById } from '../data/parts.js';
import { buildCineVeh } from '../render/cine-vehicles.js';
import { local } from '../render/foe-damage.js';
import { isOutline } from '../render/geometry.js';
import { tagStyle } from '../render/style/shader.js';

let MV_ID = 1;
const STEER = 0.6; // 最大的前輪轉角（弧度）
const ACC = 2.5,
  BRAKE = 7; // 加速、煞車（m/s²）
const REV_V = 2.5; // 倒車的速度
const FLASH_T = 0.07;
const _f = new THREE.Vector3(),
  _e = new THREE.Euler(0, 0, 0, 'YXZ');

const angDiff = (a, b) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
};

// 作業的時間：b＝在 B 端、a＝在 A 端停幾秒
const OPS = {
  forklift: { b: 3.4, a: 2.6 },
  hauler: { b: 6.2, a: 7 },
  bulldozer: { b: 1.2, a: 1.2 },
};
// 挖土機的一個循環（秒）與關鍵姿勢：[時間, 上部旋轉（0＝挖、1＝轉到卸料的方向）, 動臂, 斗桿, 挖斗]
const DIG_T = 10;
const DIG_K = [
  [0, 0, -0.05, 1.55, -0.2],
  [2, 0, 0.05, 0.85, 0.95],
  [3.2, 0, -0.6, 0.9, 1.05],
  [5.2, 1, -0.6, 1.0, 1.05],
  [6.2, 1, -0.5, 1.3, -0.5],
  [7, 1, -0.6, 1.2, 0.3],
  [9, 0, -0.2, 1.45, -0.1],
  [10, 0, -0.05, 1.55, -0.2],
];
function digPose(t, dump) {
  let i = 0;
  while (i < DIG_K.length - 2 && DIG_K[i + 1][0] <= t) i++;
  const a = DIG_K[i],
    b = DIG_K[i + 1];
  let u = Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0])));
  u = u * u * (3 - 2 * u);
  const L = (j) => a[j] + (b[j] - a[j]) * u;
  return [L(1) * dump, L(2), L(3), L(4)];
}

export class MapVeh {
  // route：[[x, z]…] 環狀路線；o：{ i 起點的索引、dir 方向 ±1、v 變化 }
  constructor(game, key, route, o = {}) {
    this.game = game;
    this.key = key;
    const T = (this.T = MV_TYPES[key]);
    // 多人（第 5 期）：客機用房主的編號建（o.id），之後房主遷移時接著編
    this.id = o.id || MV_ID++;
    if (this.id >= MV_ID) MV_ID = this.id + 1;
    this.remote = !!o.remote; // 客機：位置與狀態照房主送來的（remoteTick），不自己判定
    this.vv = o.v || 0;
    this.name = T.name;
    const V = buildCineVeh(key, { v: o.v || 0 });
    this.v = V;
    this.mesh = V.group;
    this.len = V.len || T.len;
    this.w = T.w;
    this.h = T.h;
    this.wb = this.len * 0.6; // 軸距
    this.mat = T.mat;
    this.col = 0x2a2c30;
    this.maxHp = this.hp = Math.round(propHpFor(this.h, this.w, this.len, this.mat) * (T.hpK || 1));
    this.team = 'vehicle';
    this.isMapVeh = true;
    this.dead = false;
    this.st = 0;
    this.occ = T.empty ? 0 : 1; // 車上的人（駕駛；照明塔沒有）
    this.route = route;
    this.dirS = o.dir || 1;
    this.ri = (o.i || 0) % route.length;
    const [x, z] = route[this.ri];
    const W = game.world;
    this.pos = new THREE.Vector3(x, W.groundAt(x, z, W.terrainHeight(x, z) + 1), z);
    this.ri = this.nextI(this.ri);
    const [nx, nz] = route[this.ri];
    this.yaw = Math.atan2(nx - x, nz - z);
    this.spd = 0;
    this.steer = 0;
    this.mode = 'drive';
    this.blockT = 0;
    this.revT = 0;
    this.revN = 0;
    this.tilt = { x: 0, z: 0 };
    this.shape = { b: true, x: 0, z: 0, r: 0, x0: 0, x1: 0, z0: 0, z1: 0, y0: 0, y1: 0 };
    this.flashT = 0;
    // 作業（第 2 期）：line＝在 route 的兩點之間來回（堆高機、礦用卡車、推土機）；dig／lift＝原地作業（挖土機、吊車）
    this.job = o.job || null;
    if (this.job) {
      const J = this.job;
      J.t = 0;
      J.ph = 'go';
      J.s = 0;
      J.opT = 0;
      J.L = Math.hypot(route[1][0] - x, route[1][1] - z);
      J.dx = (route[1][0] - x) / (J.L || 1);
      J.dz = (route[1][1] - z) / (J.L || 1);
      J.x0 = x;
      J.z0 = z;
      // 堆高機的棧板（貨叉上）、吊車吊著的棧板（吊鉤下）
      const pt = key === 'forklift' ? V.parts.fork : key === 'crane' ? V.parts.tip : null;
      if (pt) {
        const pl = buildCineVeh('pallet', { v: this.id % 3 }).group;
        if (key === 'forklift') pl.position.set(0, -0.03, 0.6);
        else pl.position.set(0, -6.25, -0.5);
        pt.add(pl);
      }
      if (key === 'forklift') V.parts.fork.position.y = 0.47;
    }
    // 命中的球：沿車身每 4 m 一顆
    const n = Math.max(1, Math.round(this.len / 4));
    const self = this;
    this.parts = [];
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * (this.len - Math.max(this.w, this.len / n));
      const pc = new THREE.Vector3();
      this.parts.push({
        isVehiclePart: true,
        id: 800000 + this.id * 16 + i,
        parent: self,
        off,
        radius: Math.max(this.w * 0.55, Math.min(this.h * 0.6, this.len / n / 2 + 0.3)),
        team: 'vehicle',
        get dead() {
          return self.dead;
        },
        // 每次重新算（呼叫端改了回傳的向量也不影響下一次）；不新建向量
        center() {
          return pc.set(self.pos.x + self.sn * off, self.pos.y + self.h * 0.5, self.pos.z + self.cs * off);
        },
        takeDamage(d, im, from, at, dir, _x, wid, attr) {
          self.takeDamage(d, im, from, at, wid, attr);
        },
      });
    }
    game.scene.add(this.mesh);
    this.place(0);
  }
  nextI(i) {
    const n = this.route.length;
    return (((i + this.dirS) % n) + n) % n;
  }
  fwd(out = _f) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  center() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.h * 0.5, this.pos.z);
  }
  // 世界座標 → 車身座標，寫進 this.lx／this.lz（每格的判定用，不新建陣列；sn／cs 由 place 更新）
  localXZ(x, z) {
    const dx = x - this.pos.x,
      dz = z - this.pos.z;
    this.lx = dx * this.cs - dz * this.sn;
    this.lz = dx * this.sn + dz * this.cs;
  }
  // 世界座標 → 車身座標（x 右、z 前）
  local(x, z) {
    const dx = x - this.pos.x,
      dz = z - this.pos.z;
    const s = Math.sin(this.yaw),
      c = Math.cos(this.yaw);
    return [dx * c - dz * s, dx * s + dz * c];
  }
  // 水平的外框（破壞的碎片與持續效果用：game/destruct.js 的 propShards／propEmit 讀 shape）
  updShape() {
    const s = Math.abs(Math.sin(this.yaw)),
      c = Math.abs(Math.cos(this.yaw));
    const ex = (c * this.w + s * this.len) / 2,
      ez = (s * this.w + c * this.len) / 2;
    const S = this.shape;
    S.x = this.pos.x;
    S.z = this.pos.z;
    S.x0 = this.pos.x - ex;
    S.x1 = this.pos.x + ex;
    S.z0 = this.pos.z - ez;
    S.z1 = this.pos.z + ez;
    S.y0 = this.pos.y;
    S.y1 = this.pos.y + (this.crushed ? this.h * 0.3 : this.h);
  }
  // 位置、車身依地形前後左右的傾斜
  place(dt) {
    const W = this.game.world,
      p = this.pos;
    if (this.T.boat || (this.T.air && !this.onPad())) return this.placeFloat(dt);
    const y0 = p.y;
    p.y = W.groundAt(p.x, p.z, y0 + 1.5) + (this.T.yo || 0);
    const s = (this.sn = Math.sin(this.yaw)),
      c = (this.cs = Math.cos(this.yaw));
    // 前後左右的地面高度：每 3 格量一次（每次 4 個取樣）
    this.tiltN = ((this.tiltN || 0) + 1) % 3;
    if (!(dt > 0) || this.tiltN === 0 || this.tgt === undefined) {
      const a = this.len * 0.35,
        b = this.w * 0.4;
      const hf = W.groundAt(p.x + s * a, p.z + c * a, p.y + 2),
        hb = W.groundAt(p.x - s * a, p.z - c * a, p.y + 2);
      const hr = W.groundAt(p.x + c * b, p.z - s * b, p.y + 2),
        hl = W.groundAt(p.x - c * b, p.z + s * b, p.y + 2);
      this.tgt = -Math.atan2(hf - hb, a * 2);
      this.tgz = Math.atan2(hl - hr, b * 2);
    }
    let tz = this.tgz;
    if (this.T.lean) tz -= this.steer * Math.min(1, Math.abs(this.spd) / 8) * 0.55; // 機車：轉彎時往內傾
    const k = dt > 0 ? Math.min(1, dt * 8) : 1;
    this.tilt.x += (this.tgt - this.tilt.x) * k;
    this.tilt.z += (tz - this.tilt.z) * k;
    const m = this.mesh;
    m.position.set(p.x, p.y - 0.02 - (this.dead && !this.crushed ? 0.15 : 0), p.z);
    _e.set(this.tilt.x, this.yaw, this.tilt.z + (this.wreckRoll || 0));
    m.quaternion.setFromEuler(_e);
    this.updShape();
  }
  // 停在地上的空中載具（穿梭機停在坪上）
  onPad() {
    return !!(this.job && this.job.k === 'pad' && this.job.ph === 'park');
  }
  // 水上（浮在水面＋波浪的起伏與搖晃）與空中（位置由作業決定，這裡只放模型）
  placeFloat(dt) {
    const W = this.game.world,
      p = this.pos,
      T = this.T;
    this.sn = Math.sin(this.yaw);
    this.cs = Math.cos(this.yaw);
    const a = this.age || 0,
      ph = this.id * 1.7;
    if (T.boat) {
      const L = W.theme.water ? W.theme.water.level : 0;
      const bob = Math.sin(a * 1.1 + ph) * 0.12;
      p.y = T.hover ? Math.max(L, W.groundAt(p.x, p.z, L + 3)) + 0.15 + bob * 0.5 : L + bob;
      this.tilt.x = Math.sin(a * 0.9 + ph) * 0.025 - Math.min(0.06, Math.abs(this.spd) * 0.006);
      this.tilt.z = Math.sin(a * 1.3 + ph * 2) * 0.035;
    }
    const m = this.mesh;
    m.position.set(p.x, p.y, p.z);
    _e.set(this.tilt.x, this.yaw, this.tilt.z + (this.wreckRoll || 0));
    m.quaternion.setFromEuler(_e);
    this.updShape();
  }
  // 空中的殘骸：往下掉，落地時爆炸、揚塵（掉進虛空的看不到就藏起來）
  fallTick(dt) {
    const W = this.game.world,
      p = this.pos;
    this.vy = (this.vy || 0) + 14 * dt;
    p.y -= this.vy * dt;
    this.tilt.x += dt * 0.4;
    const gy = W.groundAt(p.x, p.z, p.y + 3);
    if (p.y <= gy) {
      p.y = gy;
      this.landed = true;
      const g = this.game;
      if (g.fx) {
        g.fx.explosion(this.center(), 4, 0xffa040, this.len > 8);
        g.fx.dust(this.center(), Math.max(2, this.w * 0.5), 8, 0x8a8478);
      }
      g.rumbleAt(this.center(), 0.5, 0.4, 200, 50);
    } else if (W.theme.void && p.y < W.theme.void.y - 40) {
      this.landed = true;
      this.mesh.visible = false;
      return;
    }
    this.placeFloat(dt);
  }
  // 一格：blocked＝前方被擋住（Game 端判定：機甲、人、別的車、障礙物）
  tick(dt, blocked) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0 && this.om) for (const r of this.om) if (r.e0) r.m.emissive.copy(r.e0);
    }
    if (this.dead) {
      if (this.T.air && !this.landed) this.fallTick(dt);
      return;
    }
    this.age = (this.age || 0) + dt;
    const VP = this.v.parts;
    if (VP.drum && !this.abandoned) VP.drum.rotation.z += dt * 1.3; // 攪拌車：攪拌筒一直轉
    if (VP.propL && !this.abandoned) {
      // 氣墊船：導管裡的螺旋槳、方向舵跟著轉向
      VP.propL.rotation.z += dt * 28;
      VP.propR.rotation.z -= dt * 28;
      VP.rudL.rotation.y = VP.rudR.rotation.y = this.steer * 0.7;
    }
    if (VP.lbR) {
      // 警示燈條：紅藍輪流閃（沒人了就關）
      this.sirT = (this.sirT || 0) + dt;
      const on = this.occ > 0,
        ph = Math.floor(this.sirT / 0.32) % 2;
      VP.lbR.visible = on && ph === 0;
      VP.lbB.visible = on && ph === 1;
    }
    if (this.remote) return this.remoteTick(dt);
    if (this.abandoned) {
      // 駕駛跑了：滑行停下
      this.spd *= Math.max(0, 1 - dt * 2.5);
      if (Math.abs(this.spd) > 0.05) {
        const fw = this.fwd();
        this.pos.x += fw.x * this.spd * dt;
        this.pos.z += fw.z * this.spd * dt;
        this.place(dt);
      }
      return;
    }
    if (this.job) return this.workTick(dt, blocked);
    const R = this.route;
    let vt = 0;
    if (this.mode === 'rev') {
      this.revT -= dt;
      vt = -REV_V;
      this.steer += (this.revSteer - this.steer) * Math.min(1, dt * 3);
      if (this.revT <= 0) {
        this.mode = 'drive';
        this.blockT = 0;
      }
    } else {
      // 逃走（第 3 期）：往作戰區域外開，出去了就離場
      if (this.flee) {
        const Z = this.game.world.zone;
        const p = this.pos;
        // 開到作戰區域的邊緣（碰撞不讓它出去）就算開走了
        if (p.x < Z[0] + 3 || p.x > Z[1] - 3 || p.z < Z[2] + 3 || p.z > Z[3] - 3) {
          this.gone = true;
          return;
        }
        const W = this.game.world;
        if (W.isVoid && W.isVoid(p.x, p.z) && p.y < W.terrainHeight(p.x, p.z) + 0.5) {
          this.gone = true; // 開進虛空（街區的外緣）：當成開走了
          return;
        }
        if (blocked) {
          this.fleeStuck = (this.fleeStuck || 0) + dt;
          if (this.fleeStuck > 7) return this.abandon(this.flee.src);
        }
      }
      // 往下一個路線點：到了（或已經在車後方不遠）就換下一個
      let [tx, tz] = this.flee ? [this.flee.x, this.flee.z] : R[this.ri];
      let dx = tx - this.pos.x,
        dz = tz - this.pos.z;
      let d = Math.hypot(dx, dz);
      const near = Math.max(4, this.len * 0.7);
      const fw = this.fwd();
      if (!this.flee && (d < near || (d < near * 3 && dx * fw.x + dz * fw.z < 0))) {
        this.ri = this.nextI(this.ri);
        [tx, tz] = R[this.ri];
        dx = tx - this.pos.x;
        dz = tz - this.pos.z;
        d = Math.hypot(dx, dz);
      }
      const err = angDiff(this.yaw, Math.atan2(dx, dz));
      this.steer = Math.max(-STEER, Math.min(STEER, err * 1.4));
      vt =
        this.T.spd *
        Math.max(0.3, 1 - Math.abs(err) / 1.3) *
        (this.st >= 3 ? 0.5 : 1) *
        (this.flee ? 1.35 : 1);
      if (blocked) {
        vt = 0;
        this.blockT += dt;
        // 擋住太久：倒車一段再試；連續兩次就掉頭（路線反過來開）
        if (this.blockT > 1.2 + (this.id % 3) * 0.4 && Math.abs(this.spd) < 0.3) {
          this.mode = 'rev';
          this.revT = 1.8;
          this.revSteer = (this.id % 2 ? 1 : -1) * STEER * 0.6;
          if (++this.revN >= 2 && !this.flee) {
            this.revN = 0;
            this.dirS = -this.dirS;
            this.ri = this.nextI(this.ri);
          }
        }
      } else {
        this.blockT = Math.max(0, this.blockT - dt * 2);
        if (this.blockT === 0 && Math.abs(this.spd) > 1) this.revN = 0;
      }
    }
    const dv = vt - this.spd;
    const a = (Math.sign(dv) === Math.sign(this.spd) || this.spd === 0 ? ACC : BRAKE) * dt;
    this.spd += Math.max(-a, Math.min(a, dv));
    if (Math.abs(this.spd) < 0.01 && vt === 0) this.spd = 0;
    // 自行車模型：轉向率＝速度／軸距 × tan(前輪轉角)
    this.yaw += (this.spd / this.wb) * Math.tan(this.steer) * dt;
    const fw = this.fwd();
    const nx = this.pos.x + fw.x * this.spd * dt,
      nz = this.pos.z + fw.z * this.spd * dt;
    // 撞到障礙物（路線外、新的殘骸、臨時牆）：不穿過去，當成擋住
    const W = this.game.world;
    const shallow = this.T.boat && !this.T.hover && W.waterDepth(nx, nz) < 1.2; // 船：不開進淺水
    const [cx, cz] = shallow ? [this.pos.x, this.pos.z] : W.collide(nx, nz, this.pos.y + 0.6, this.w * 0.45);
    if (shallow || Math.abs(cx - nx) + Math.abs(cz - nz) > 0.02) {
      this.pos.x = cx;
      this.pos.z = cz;
      this.hitWall = true;
      if (this.flee) this.fleeTurn();
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
      this.hitWall = false;
    }
    for (const wh of this.v.wheels) wh.o.rotation.x += (this.spd * dt) / wh.r;
    if (this.T.boat && Math.abs(this.spd) > 2) this.wake(dt);
    this.place(dt);
  }
  // 客機：往房主送來的位置與方向內插、車輪照速度轉、部件的動作在本機算（作業的階段與時間照房主的）
  remoteTick(dt) {
    const N = this.net;
    if (N) {
      const k = Math.min(1, dt * 8);
      this.pos.x += (N.x - this.pos.x) * k;
      this.pos.z += (N.z - this.pos.z) * k;
      if (this.T.air || this.T.boat) this.pos.y += (N.y - this.pos.y) * k;
      this.yaw += angDiff(this.yaw, N.yaw) * k;
      this.spd = N.spd;
    }
    for (const wh of this.v.wheels) wh.o.rotation.x += (this.spd * dt) / wh.r;
    const J = this.job;
    if (J && !this.abandoned) {
      if (J.k === 'dig' || J.k === 'lift' || J.k === 'static') return this.workTick(dt, false);
      J.t += dt;
      if (J.k === 'line') {
        J.opT += dt;
        this.workAnim(J, dt);
      }
    }
    if (this.T.boat && Math.abs(this.spd) > 2) this.wake(dt);
    if (this.T.boat || (this.T.air && !this.onPad())) this.placeFloat(dt);
    else this.place(dt);
  }
  // 船的尾波：船尾的白色水花
  wake(dt) {
    if ((this.wakeT = (this.wakeT || 0) - dt) > 0) return;
    this.wakeT = 0.2;
    const g = this.game;
    if (!g.fx) return;
    const b = this.len * 0.45;
    g.fx.dust(
      new THREE.Vector3(this.pos.x - this.sn * b, this.pos.y + 0.3, this.pos.z - this.cs * b),
      Math.min(3, this.w * 0.45),
      4,
      0xdfe8ec,
    );
  }
  // ---------- 作業（第 2 期）----------
  workTick(dt, blocked) {
    const J = this.job,
      P = this.v.parts;
    if (J.k === 'static') {
      if (!this.placed) this.place(0);
      this.placed = true;
      return;
    }
    if (J.k === 'drift') {
      J.t += dt;
      return this.driftTick(dt);
    }
    if (J.k === 'pad') return this.padTick(dt);
    if (J.k === 'transit') return this.transitTick(dt);
    if (J.k === 'ship') return this.shipTick(dt);
    const k = this.st >= 3 ? 0.5 : 1; // 重損：動作變慢
    J.t += dt * k;
    if (J.k === 'dig') {
      const p = digPose(J.t % DIG_T, J.dump);
      P.turret.rotation.y = p[0];
      P.boom.rotation.x = p[1];
      P.arm.rotation.x = p[2];
      P.bucket.rotation.x = p[3];
      // 挖的時候揚塵
      const ph = J.t % DIG_T;
      if (ph > 0.6 && ph < 2 && (J.dustT = (J.dustT || 0) - dt) <= 0) {
        J.dustT = 0.45;
        const g = this.game;
        if (g.fx) {
          P.bucket.updateWorldMatrix(true, false);
          g.fx.dust(P.bucket.localToWorld(new THREE.Vector3(0, -0.8, 0.6)), 1.4, 4, 0x8a7e68);
        }
      }
      if (!this.placed) this.place(0);
      this.placed = true;
      return;
    }
    if (J.k === 'lift') {
      const a = (J.t / 24) * Math.PI * 2;
      P.turret.rotation.y = 1.1 * Math.sin(a);
      P.boom.rotation.x = -0.6 + 0.12 * Math.sin(a * 2);
      P.tip.rotation.x = -P.boom.rotation.x; // 吊鉤一直朝下
      if (!this.placed) this.place(0);
      this.placed = true;
      return;
    }
    // line：go（往 B）→ opB → back（倒車回 A）→ opA
    const T = this.T;
    let vt = 0;
    if (J.ph === 'go' || J.ph === 'back') {
      vt = (J.ph === 'go' ? 1 : -1) * T.spd * k;
      if (blocked) vt = 0;
    }
    const dv = vt - this.spd;
    const a = ACC * dt;
    this.spd += Math.max(-a, Math.min(a, dv));
    J.s = Math.max(0, Math.min(J.L, J.s + this.spd * dt));
    if (J.ph === 'go' && J.s >= J.L - 0.02) {
      J.ph = 'opB';
      J.opT = 0;
      this.spd = 0;
    } else if (J.ph === 'back' && J.s <= 0.02) {
      J.ph = 'opA';
      J.opT = 0;
      this.spd = 0;
    }
    const OP = OPS[this.key] || OPS.forklift;
    if (J.ph === 'opB' || J.ph === 'opA') {
      J.opT += dt * k;
      const dur = J.ph === 'opB' ? OP.b : OP.a;
      if (J.opT >= dur) J.ph = J.ph === 'opB' ? 'back' : 'go';
    }
    this.workAnim(J, dt);
    this.pos.x = J.x0 + J.dx * J.s;
    this.pos.z = J.z0 + J.dz * J.s;
    for (const wh of this.v.wheels) wh.o.rotation.x += (this.spd * dt) / wh.r;
    this.place(dt);
  }
  // 高空軌道的作業艇與吊艙：繞著錨點慢慢漂（李沙育曲線）、慢慢轉；作業艇的機械臂擺動
  driftTick(dt) {
    const J = this.job,
      t = J.t + this.id * 13;
    this.pos.set(
      J.ax + Math.sin(t * 0.07) * J.rx,
      J.ay + Math.sin(t * 0.11) * 2.5,
      J.az + Math.cos(t * 0.05) * J.rz,
    );
    this.yaw = J.yaw0 + Math.sin(t * 0.03) * 1.2;
    this.tilt.x = Math.sin(t * 0.13) * 0.15;
    this.tilt.z = Math.sin(t * 0.09) * 0.2;
    const P = this.v.parts;
    if (P.armL) {
      P.armL.rotation.x = -0.4 + Math.sin(t * 0.6) * 0.35;
      P.armR.rotation.x = -0.4 + Math.sin(t * 0.6 + 1.6) * 0.35;
    }
    this.placeFloat(dt);
  }
  // 舊宇宙港的穿梭機：park（停在坪上 J.wait 秒）→ up（垂直升到 35 m）→ out（往前加速、爬升，離開作戰區域就離場）；
  // in（從遠方的空中飛回坪的上空）→ down（垂直降落）→ park
  padTick(dt) {
    const J = this.job,
      g = this.game,
      W = g.world;
    J.pt = (J.pt || 0) + dt;
    const gy = W.groundAt(J.px, J.pz, W.terrainHeight(J.px, J.pz) + 1) + (this.T.yo || 0);
    const P = this.v.parts;
    if (J.ph === 'park') {
      if (P.bay) P.bay.rotation.x = 0;
      if (!this.placed) this.place(0);
      this.placed = true;
      if (J.pt > J.wait && this.occ) this.padGo();
      return;
    }
    this.placed = false;
    const eng = () => {
      // 引擎：機身下方的揚塵（離地 20 m 以內）與噴焰的光
      if ((J.fxT = (J.fxT || 0) - dt) <= 0 && g.fx) {
        J.fxT = 0.15;
        if (this.pos.y - gy < 20)
          g.fx.dust(new THREE.Vector3(J.px, gy - (this.T.yo || 0) + 0.3, J.pz), 4, 6, 0x9a958a);
      }
      if (g.fx && g.fx.glow)
        g.fx.glow(
          'mv' + this.id,
          new THREE.Vector3(this.pos.x, this.pos.y - 2, this.pos.z),
          1.6,
          0x9fd0ff,
          14,
        );
    };
    if (J.ph === 'up') {
      const u = Math.min(1, J.pt / 7);
      this.pos.set(J.px, gy + 35 * u * u * (3 - 2 * u), J.pz);
      eng();
      if (u >= 1) {
        J.ph = 'out';
        J.pt = 0;
      }
    } else if (J.ph === 'out') {
      const v = Math.min(45, J.pt * 7);
      this.pos.x += this.sn * v * dt;
      this.pos.z += this.cs * v * dt;
      this.pos.y += 5 * dt;
      eng();
      const Z = W.zone;
      const p = this.pos;
      if (p.x < Z[0] - 60 || p.x > Z[1] + 60 || p.z < Z[2] - 60 || p.z > Z[3] + 60 || J.pt > 30)
        this.gone = true;
    } else if (J.ph === 'in') {
      // 從 J.sx, J.sz（遠方 60 m 高）飛到坪的上空 35 m，12 秒
      const u = Math.min(1, J.pt / 12),
        e = 1 - (1 - u) * (1 - u);
      this.pos.set(J.sx + (J.px - J.sx) * e, gy + 60 - 25 * e, J.sz + (J.pz - J.sz) * e);
      eng();
      if (u >= 1) {
        J.ph = 'down';
        J.pt = 0;
      }
    } else if (J.ph === 'down') {
      const u = Math.min(1, J.pt / 7);
      this.pos.set(J.px, gy + 35 * (1 - u * u * (3 - 2 * u)), J.pz);
      eng();
      if (u >= 1) {
        J.ph = 'park';
        J.pt = 0;
        J.wait = 70 + ((this.id * 37) % 50);
      }
    }
    this.placeFloat(dt);
  }
  padGo() {
    const J = this.job;
    if (J.ph !== 'park') return;
    J.ph = 'up';
    J.pt = 0;
    SFX.play('~jetTailL', 0.8, 0.7, 0.03, 0.05, this.center());
  }
  // 高空軌道的穿梭機：從作戰區域的一邊飛到另一邊（60 m 高），出去之後 40 秒再從另一邊飛回來
  transitTick(dt) {
    const J = this.job;
    J.pt = (J.pt || 0) + dt;
    if (J.hide) {
      this.mesh.visible = false;
      if (J.pt < 40) return;
      J.hide = false;
      J.pt = 0;
      this.mesh.visible = true;
      J.dir = -J.dir;
      this.yaw += Math.PI;
    }
    const L = J.L,
      s = -L / 2 + ((J.pt * 28) % (L + 1));
    this.pos.set(J.cx + J.ux * s * J.dir, J.y, J.cz + J.uz * s * J.dir);
    if (J.pt * 28 >= L) {
      J.hide = true;
      J.pt = 0;
    }
    this.tilt.z = Math.sin(J.pt * 0.4) * 0.05;
    this.placeFloat(dt);
  }
  // 貨輪：在作戰區域外的海面沿直線慢慢開過去，到了另一端從頭再來（看不到的時候換位置）
  shipTick(dt) {
    const J = this.job;
    J.s += this.T.spd * dt;
    if (J.s > J.L) J.s = 0;
    this.spd = this.T.spd;
    this.pos.x = J.x0 + J.dx * J.s;
    this.pos.z = J.z0 + J.dz * J.s;
    this.wake(dt);
    this.place(dt);
  }
  // 來回作業的部件動作（依階段與這個階段的時間）
  workAnim(J, dt) {
    const P = this.v.parts,
      u = J.opT,
      sm = (x) => {
        const t = Math.max(0, Math.min(1, x));
        return t * t * (3 - 2 * t);
      };
    if (this.key === 'forklift') {
      // 載著棧板時貨叉在 0.35 m；B 端舉高放上貨架再降回來、A 端放到地上再叉起來
      let f = 0.35;
      if (J.ph === 'opB') f = 0.35 + 1.25 * (sm(u / 1.3) - sm((u - 1.9) / 1.3));
      else if (J.ph === 'opA') f = 0.35 - 0.32 * (sm(u / 0.9) - sm((u - 1.5) / 0.9));
      P.fork.position.y = 0.12 + f;
    } else if (this.key === 'hauler') {
      // B 端翻斗卸料（揚塵）、A 端停著讓挖土機裝
      const b = J.ph === 'opB' ? sm(u / 2) - sm((u - 3.6) / 2.4) : 0;
      P.bed.rotation.x = -0.85 * b;
      if (J.ph === 'opB' && u > 1.6 && u < 3.8 && (J.dustT = (J.dustT || 0) - dt) <= 0) {
        J.dustT = 0.3;
        const g = this.game;
        if (g.fx) {
          const f = this.fwd();
          g.fx.dust(
            new THREE.Vector3(this.pos.x - f.x * 5.5, this.pos.y + 0.8, this.pos.z - f.z * 5.5),
            2.2,
            6,
            0x8a7e68,
          );
        }
      }
    } else if (this.key === 'bulldozer') {
      // 往前推的時候鏟子放低（揚塵）；B 端舉起、倒車時舉著、A 端放下
      const up = J.ph === 'go' ? 0 : J.ph === 'opB' ? sm(u / 1) : J.ph === 'back' ? 1 : 1 - sm(u / 1);
      P.blade.rotation.x = 0.06 - 0.3 * up;
      if (P.ripper) P.ripper.rotation.x = J.ph === 'back' ? 0.25 : 0;
      if (J.ph === 'go' && Math.abs(this.spd) > 0.5 && (J.dustT = (J.dustT || 0) - dt) <= 0) {
        J.dustT = 0.35;
        const g = this.game;
        if (g.fx) {
          const f = this.fwd();
          g.fx.dust(
            new THREE.Vector3(this.pos.x + f.x * 3.1, this.pos.y + 0.3, this.pos.z + f.z * 3.1),
            1.6,
            5,
            0x8a7e68,
          );
        }
      }
    }
  }
  // ---------- 戰鬥的反應（第 3 期）----------
  // 附近開火、爆炸、機甲靠近（game/map-veh.js 的 mvScare）：作業中的停下、駕駛下車逃跑；開車中的往遠離的方向開走
  alarm(src) {
    if (this.dead || this.gone || this.abandoned || !this.occ) return;
    if (this.job && this.job.k === 'pad') return this.padGo(); // 停著的穿梭機：提早起飛
    if (this.job && (this.job.k === 'drift' || this.job.k === 'transit' || this.job.k === 'ship')) return;
    if (this.job || !this.T.spd) return this.abandon(src);
    if (this.flee) return;
    this.fleeTo(src, ((this.id % 5) - 2) * 0.18);
    this.mode = 'drive';
    this.blockT = 0;
    SFX.play('~horn', 0.55, this.len > 7 ? 0.8 : 1.05, 0.03, 0.05, this.center());
  }
  // 逃走的目標：從威脅往車子的方向（再轉 a 弧度）延伸到作戰區域外
  fleeTo(src, a) {
    const Z = this.game.world.zone;
    const F0 = this.flee;
    let dx = this.pos.x - src.x,
      dz = this.pos.z - src.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const ux = dx * Math.cos(a) - dz * Math.sin(a),
      uz = dx * Math.sin(a) + dz * Math.cos(a);
    let t = 600;
    if (ux > 1e-3) t = Math.min(t, (Z[1] + 12 - this.pos.x) / ux);
    if (ux < -1e-3) t = Math.min(t, (Z[0] - 12 - this.pos.x) / ux);
    if (uz > 1e-3) t = Math.min(t, (Z[3] + 12 - this.pos.z) / uz);
    if (uz < -1e-3) t = Math.min(t, (Z[2] - 12 - this.pos.z) / uz);
    this.flee = Object.assign(F0 || {}, {
      x: this.pos.x + ux * t,
      z: this.pos.z + uz * t,
      src: { x: src.x, z: src.z },
    });
  }
  // 逃走時撞到障礙物：方向左右輪流轉 50° 換一條路（每 1.2 秒最多一次），換 4 次還不行就棄車
  fleeTurn() {
    const F = this.flee;
    const t = this.age || 0;
    if (t - (F.turnT || -9) < 1.2) return;
    F.turnT = t;
    F.n = (F.n || 0) + 1;
    if (F.n > 4) return this.abandon(F.src);
    const a = (F.n % 2 ? 1 : -1) * 0.87 * Math.ceil(F.n / 2);
    this.fleeTo(F.src, a);
  }
  // 駕駛下車逃跑（車留在原地，照樣可以打壞、踩扁）
  abandon(src) {
    if (this.abandoned) return;
    if (this.T.air && !this.onPad()) return; // 飛在空中的照樣飛
    this.abandoned = true;
    if (this.occ > 0) this.game.mvDriverOut(this, src);
    this.occ = 0;
  }
  // ---------- 受傷與受損（地圖物件的規則：依材質的屬性倍率、四段受損；docs/destruction-design.md）----------
  takeDamage(dmg, impact, from, at, wid, attr) {
    if (this.dead || this.remote) return; // 客機：只顯示房主的結果
    const g = this.game;
    const a = attr || (wid ? weaponAttr(weaponById(wid)) : 'kin');
    const mode = g.destructMode();
    const DM = DESTRUCT[mode === 'off' ? 'normal' : mode]; // 載具一律打得壞（和運輸車輛相同）
    const d = Math.round(dmg * Math.max(DM.floor, propAttrK(this.mat, attr === 'none' ? 'none' : a)) * DM.k);
    if (!(d > 0)) return;
    this.hp -= d;
    this.flash();
    if (at) this.alarm(at);
    g.popDamage(at || this.center(), d, false, false, false, 0, -1, impact);
    if (this.hp <= 0) {
      const src = from && from.pos ? from.pos : at;
      const dir = src ? this.pos.clone().sub(src).setY(0) : null;
      if (dir && dir.lengthSq() > 1e-4) dir.normalize();
      g.mvKill(this, from, { dir });
    } else this.stageCheck();
  }
  // 自己的材質（第一次受傷時複製：模型是同一份的複本，材質共用）
  own() {
    if (this.om) return this.om;
    const L = [];
    this.mesh.traverse((o) => {
      if (!o.isMesh || isOutline(o.material)) return;
      const arr = Array.isArray(o.material) ? o.material : [o.material];
      const cl = arr.map((m) => {
        const c = m.clone();
        L.push({ m: c, c0: c.color ? c.color.clone() : null, e0: c.emissive ? c.emissive.clone() : null });
        return c;
      });
      o.material = Array.isArray(o.material) ? cl : cl[0];
    });
    tagStyle(this.mesh); // 材質分類（機體類）跟著換
    return (this.om = L);
  }
  flash() {
    for (const r of this.own()) if (r.e0) r.m.emissive.setRGB(0.6, 0.6, 0.6);
    this.flashT = FLASH_T;
  }
  char(k) {
    this.charK = k;
    for (const r of this.own()) if (r.c0) r.m.color.copy(r.c0).multiplyScalar(1 - Math.min(0.92, k * 0.9));
  }
  stageCheck() {
    this.applyStage(Math.min(3, propStage(this.hp, this.maxHp)));
  }
  // 進入第 st 階段的外觀（焦黑、碎板、冒煙；特效各端自己做，不轉送）
  applyStage(st, quiet) {
    if (st <= this.st) return;
    const st0 = this.st;
    this.st = st;
    this.char(PROP_CHAR[st]);
    const g = this.game;
    if (g.fx && !quiet) local(g.fx, () => g.propShards(this, st >= 3 && st0 < 3 ? 3 : 1));
    if (st >= 2) g.propActivate(this); // 冒煙；可燃的第 3 階段起火（game/destruct.js 的 propEmit）
    if (st >= 3 && !this.remote) this.abandon(this.center()); // 重損：駕駛棄車
  }
  // 損毀：o.cr＝被踩扁（扁的殘骸，不爆炸）
  wreck(o = {}) {
    if (this.dead) return;
    this.dead = true;
    this.spd = 0;
    this.st = 3;
    const g = this.game,
      c = this.center();
    if (o.cr) {
      this.crushed = true;
      this.mesh.scale.y = 0.32;
      this.char(Math.max(0.45, this.charK || 0));
      if (g.fx && !o.quiet)
        local(g.fx, () => {
          g.fx.dust(c, Math.max(1.2, this.w * 0.7), 6, 0x8a8478);
          g.propShards(this, 2);
        });
      if (!this.remote) SFX.pickPlay(['crunch1', 'crunch2', 'crunch3'], 0.8, 0.85, c);
    } else {
      this.char(1); // 燒黑的殘骸
      this.wreckRoll = (this.id % 2 ? 1 : -1) * 0.05;
      const big = this.mat === 'fuel' || this.len > 9;
      if (g.fx && !o.quiet)
        local(g.fx, () => {
          g.fx.explosion(c, big ? 6 : 4, 0xffa040, big);
          g.propShards(this, big ? 5 : 3);
        });
      if (!this.remote) SFX.explode(big, c);
      g.rumbleAt(c, big ? 0.7 : 0.4, 0.4, 220, 40);
    }
    this.wreckT = o.cr ? 7 : 22; // 殘骸繼續冒煙／燒幾秒（propDmgTick）
    this.wreck = { top: this.pos.y + this.h * (o.cr ? 0.3 : 0.7) };
    this.place(0);
    if (g.propActivate) g.propActivate(this);
  }
  cleanup() {
    this.game.scene.remove(this.mesh);
    if (this.om) for (const r of this.om) r.m.dispose();
  }
}
