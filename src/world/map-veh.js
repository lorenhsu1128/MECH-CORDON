// 地圖上會動的載具（docs/map-vehicles-design.md）：一台車＝沿事先算好的環狀路線開的狀態機，可以打壞、踩扁。
// 判定只在單機／房主（第 1 期只有單機）；Game 端的規畫、每格更新與踩扁在 game/map-veh.js。
// 不是 MechEntity：命中目標是沿車身排的幾顆球（parts，和運輸車輛相同），不能鎖定，敵人也不瞄準。
import { SFX } from '../audio/audio.js';
import { weaponAttr } from '../data/attrs.js';
import { DESTRUCT, PROP_CHAR, propAttrK, propHpFor, propStage } from '../data/destruct.js';
import { MV_TYPES } from '../data/map-veh.js';
import { weaponById } from '../data/parts.js';
import { buildCineVeh } from '../render/cine-vehicles.js';
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

export class MapVeh {
  // route：[[x, z]…] 環狀路線；o：{ i 起點的索引、dir 方向 ±1、v 變化 }
  constructor(game, key, route, o = {}) {
    this.game = game;
    this.key = key;
    const T = (this.T = MV_TYPES[key]);
    this.id = MV_ID++;
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
    this.occ = 1; // 車上的人（駕駛）
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
    // 命中的球：沿車身每 4 m 一顆
    const n = Math.max(1, Math.round(this.len / 4));
    const self = this;
    this.parts = [];
    for (let i = 0; i < n; i++) {
      const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * (this.len - Math.max(this.w, this.len / n));
      this.parts.push({
        isVehiclePart: true,
        id: 800000 + this.id * 16 + i,
        parent: self,
        radius: Math.max(this.w * 0.55, Math.min(this.h * 0.6, this.len / n / 2 + 0.3)),
        team: 'vehicle',
        get dead() {
          return self.dead;
        },
        center() {
          return self.partPos(off);
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
  partPos(off) {
    return new THREE.Vector3(
      this.pos.x + Math.sin(this.yaw) * off,
      this.pos.y + this.h * 0.5,
      this.pos.z + Math.cos(this.yaw) * off,
    );
  }
  center() {
    return new THREE.Vector3(this.pos.x, this.pos.y + this.h * 0.5, this.pos.z);
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
    const y0 = p.y;
    p.y = W.groundAt(p.x, p.z, y0 + 1.5);
    const s = Math.sin(this.yaw),
      c = Math.cos(this.yaw);
    const a = this.len * 0.35,
      b = this.w * 0.4;
    const hf = W.groundAt(p.x + s * a, p.z + c * a, p.y + 2),
      hb = W.groundAt(p.x - s * a, p.z - c * a, p.y + 2);
    const hr = W.groundAt(p.x + c * b, p.z - s * b, p.y + 2),
      hl = W.groundAt(p.x - c * b, p.z + s * b, p.y + 2);
    const tx = -Math.atan2(hf - hb, a * 2),
      tz = Math.atan2(hl - hr, b * 2);
    const k = dt > 0 ? Math.min(1, dt * 8) : 1;
    this.tilt.x += (tx - this.tilt.x) * k;
    this.tilt.z += (tz - this.tilt.z) * k;
    const m = this.mesh;
    m.position.set(p.x, p.y - 0.02 - (this.dead && !this.crushed ? 0.15 : 0), p.z);
    _e.set(this.tilt.x, this.yaw, this.tilt.z + (this.wreckRoll || 0));
    m.quaternion.setFromEuler(_e);
    this.updShape();
  }
  // 一格：blocked＝前方被擋住（Game 端判定：機甲、人、別的車、障礙物）
  tick(dt, blocked) {
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0 && this.om) for (const r of this.om) if (r.e0) r.m.emissive.copy(r.e0);
    }
    if (this.dead) return;
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
      // 往下一個路線點：到了（或已經在車後方不遠）就換下一個
      let [tx, tz] = R[this.ri];
      let dx = tx - this.pos.x,
        dz = tz - this.pos.z;
      let d = Math.hypot(dx, dz);
      const near = Math.max(4, this.len * 0.7);
      const fw = this.fwd();
      if (d < near || (d < near * 3 && dx * fw.x + dz * fw.z < 0)) {
        this.ri = this.nextI(this.ri);
        [tx, tz] = R[this.ri];
        dx = tx - this.pos.x;
        dz = tz - this.pos.z;
        d = Math.hypot(dx, dz);
      }
      const err = angDiff(this.yaw, Math.atan2(dx, dz));
      this.steer = Math.max(-STEER, Math.min(STEER, err * 1.4));
      vt = this.T.spd * Math.max(0.3, 1 - Math.abs(err) / 1.3) * (this.st >= 3 ? 0.5 : 1);
      if (blocked) {
        vt = 0;
        this.blockT += dt;
        // 擋住太久：倒車一段再試；連續兩次就掉頭（路線反過來開）
        if (this.blockT > 1.2 + (this.id % 3) * 0.4 && Math.abs(this.spd) < 0.3) {
          this.mode = 'rev';
          this.revT = 1.8;
          this.revSteer = (this.id % 2 ? 1 : -1) * STEER * 0.6;
          if (++this.revN >= 2) {
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
    const [cx, cz] = W.collide(nx, nz, this.pos.y + 0.6, this.w * 0.45);
    if (Math.abs(cx - nx) + Math.abs(cz - nz) > 0.02) {
      this.pos.x = cx;
      this.pos.z = cz;
      this.hitWall = true;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
      this.hitWall = false;
    }
    for (const wh of this.v.wheels) wh.o.rotation.x += (this.spd * dt) / wh.r;
    this.place(dt);
  }
  // ---------- 受傷與受損（地圖物件的規則：依材質的屬性倍率、四段受損；docs/destruction-design.md）----------
  takeDamage(dmg, impact, from, at, wid, attr) {
    if (this.dead) return;
    const g = this.game;
    const a = attr || (wid ? weaponAttr(weaponById(wid)) : 'kin');
    const mode = g.destructMode();
    const DM = DESTRUCT[mode === 'off' ? 'normal' : mode]; // 載具一律打得壞（和運輸車輛相同）
    const d = Math.round(dmg * Math.max(DM.floor, propAttrK(this.mat, attr === 'none' ? 'none' : a)) * DM.k);
    if (!(d > 0)) return;
    this.hp -= d;
    this.flash();
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
    const st = Math.min(3, propStage(this.hp, this.maxHp));
    if (st <= this.st) return;
    const st0 = this.st;
    this.st = st;
    this.char(PROP_CHAR[st]);
    const g = this.game;
    if (g.fx) g.propShards(this, st >= 3 && st0 < 3 ? 3 : 1);
    if (st >= 2) g.propActivate(this); // 冒煙；可燃的第 3 階段起火（game/destruct.js 的 propEmit）
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
      if (g.fx) {
        g.fx.dust(c, Math.max(1.2, this.w * 0.7), 6, 0x8a8478);
        g.propShards(this, 2);
      }
      SFX.pickPlay(['crunch1', 'crunch2', 'crunch3'], 0.8, 0.85, c);
    } else {
      this.char(1); // 燒黑的殘骸
      this.wreckRoll = (this.id % 2 ? 1 : -1) * 0.05;
      const big = this.mat === 'fuel' || this.len > 9;
      if (g.fx) {
        g.fx.explosion(c, big ? 6 : 4, 0xffa040, big);
        g.propShards(this, big ? 5 : 3);
      }
      SFX.explode(big, c);
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
