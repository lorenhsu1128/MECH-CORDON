// 區域效果的顯示（game/hazards2.js 的 addZone 各種區域；各端自己畫）：從 hazards2 搬出來，
// 讓模型庫的「地面標示」頁（library/ground.js）用同一份程式。方法裡的 this 是宿主：
// 遊戲是 Game（Object.assign 進 Game.prototype），模型庫是頁面的假宿主；用到 fx、scene、state、world
// （groundAt／terrainHeight／hitsWorld／theme）與 zoneLosHook。
import { lerp, rnd } from '../core/math.js';
import { frand, frnd } from '../fx/rand.js';
import { curtainMat, ribbonMesh } from '../fx/energy.js';
import { LINE } from '../fx/atlas.js';

export const glow = (color, opacity, additive = true) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const SPH = new THREE.SphereGeometry(1, 12, 8);
const DISC = new THREE.CircleGeometry(1, 40);
const RING = new THREE.RingGeometry(0.93, 1, 48);
const BEAM = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);
BEAM.translate(0, 0.5, 0);
BEAM.rotateX(Math.PI / 2); // 沿 +Z、從 0 到 1
for (const g of [BOX, SPH, DISC, RING, BEAM]) g.userData.shared = true;

// 煙霧的體積：半徑 r 的圓柱，從地面到 SMOKE_H(r)
export const smokeH = (r, k) => Math.max(6 * k, r * 1.2); // k：尺度（fx.k）

export const ZONE_FX = {
  // ----- 顯示（各端）-----
  zoneVisual(z) {
    const g = new THREE.Group();
    const w = this.world;
    const gy = w.groundAt(z.p.x, z.p.z, z.p.y + 2);
    const wl = w.theme.water ? w.theme.water.level : -1e9;
    z.fx = { parts: [], acc: 0 };
    const F = z.fx;
    const flat = (mesh, y, s) => {
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = y;
      mesh.scale.setScalar(s);
      g.add(mesh);
      return mesh;
    };
    switch (z.k) {
      case 'smoke':
        g.position.set(z.p.x, gy, z.p.z);
        for (let i = 0; i < 22; i++) {
          const m = new THREE.Mesh(SPH, glow(i % 3 ? 0x8b8f95 : 0x6c7076, 0.5, false));
          const a = Math.random() * Math.PI * 2,
            rr = Math.sqrt(Math.random()) * z.r * 0.8;
          m.position.set(Math.cos(a) * rr, rnd(0.6, smokeH(z.r, this.fx.k) * 0.8), Math.sin(a) * rr);
          const s = z.r * rnd(0.4, 0.7);
          m.scale.set(s, s * 0.8, s);
          m.userData = { s, ph: Math.random() * 6, sp: rnd(-0.3, 0.3) };
          F.parts.push(m);
          g.add(m);
        }
        break;
      case 'gravity': {
        g.position.set(z.p.x, gy, z.p.z);
        F.ring = flat(new THREE.Mesh(RING, glow(0xb070ff, 0.8)), 0.12, z.r);
        F.disc = flat(new THREE.Mesh(DISC, glow(0x6a30c0, 0.16)), 0.08, z.r);
        const col = new THREE.Mesh(
          new THREE.CylinderGeometry(z.r, z.r, 10 * this.fx.k, 40, 1, true),
          glow(0x9a60ff, 0.07),
        );
        col.position.y = 5;
        g.add(col);
        F.col = col;
        for (let i = 0; i < 36; i++) {
          const m = new THREE.Mesh(BOX, glow(0xc89aff, 0.85));
          const a = Math.random() * Math.PI * 2,
            rr = Math.sqrt(Math.random()) * z.r;
          const K = this.fx.k;
          m.position.set(Math.cos(a) * rr, rnd(0, 10) * K, Math.sin(a) * rr);
          m.scale.set(0.06 * K, rnd(0.6, 1.4) * K, 0.06 * K);
          m.userData.v = rnd(7, 14) * K;
          F.parts.push(m);
          g.add(m);
        }
        break;
      }
      case 'suction': {
        const c = z.to || z.p;
        g.position.set(c.x, w.groundAt(c.x, c.z, c.y + 2) + 0.15, c.z);
        F.ring = flat(new THREE.Mesh(RING, glow(0x8fd8ff, 0.6)), 0.05, z.r);
        F.disc = flat(new THREE.Mesh(DISC, glow(0x2a6a9a, 0.14)), 0.02, z.r);
        for (let i = 0; i < 42; i++) {
          const m = new THREE.Mesh(BOX, glow(i % 2 ? 0xbfeaff : 0x6ac0ff, 0.8));
          m.userData = {
            a: Math.random() * Math.PI * 2,
            rr: Math.random() * z.r,
            h: rnd(0.2, 2.5) * this.fx.k,
          };
          m.scale.set(0.08 * this.fx.k, 0.08 * this.fx.k, 0.9 * this.fx.k);
          F.parts.push(m);
          g.add(m);
        }
        break;
      }
      case 'electro': {
        const y = Math.max(gy, wl) + 0.08;
        g.position.set(z.p.x, y, z.p.z);
        F.disc = flat(new THREE.Mesh(DISC, glow(0x40c0ff, 0.16)), 0, z.r);
        F.ring = flat(new THREE.Mesh(RING, glow(0x9ff0ff, 0.55)), 0.02, z.r);
        for (let i = 0; i < 7; i++) {
          const geo = new THREE.BufferGeometry();
          geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
          const L = new THREE.Line(
            geo,
            new THREE.LineBasicMaterial({
              color: i % 2 ? 0xe0ffff : 0x7ad8ff,
              transparent: true,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          );
          F.parts.push(L);
          g.add(L);
        }
        break;
      }
      case 'fuel': {
        g.position.set(z.p.x, gy, z.p.z);
        const oil = new THREE.Mesh(
          DISC,
          new THREE.MeshBasicMaterial({
            color: 0x0d0c0b,
            transparent: true,
            opacity: 0.8,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -3,
          }),
        );
        F.disc = flat(oil, 0.05, z.r);
        F.sheen = flat(new THREE.Mesh(DISC, glow(0x7a40c0, 0.14)), 0.07, z.r * 0.8);
        F.ring = flat(new THREE.Mesh(RING, glow(0xff8a30, 0)), 0.09, z.r); // 快點燃時閃
        for (let i = 0; i < 5; i++) {
          const m = flat(new THREE.Mesh(DISC, glow(0x30a080, 0.1)), 0.08, z.r * rnd(0.15, 0.3));
          const a = Math.random() * Math.PI * 2,
            rr = Math.random() * z.r * 0.6;
          m.position.x = Math.cos(a) * rr;
          m.position.z = Math.sin(a) * rr;
          m.userData.ph = Math.random() * 6;
          F.parts.push(m);
        }
        break;
      }
      case 'spot': {
        const rad = Math.tan(z.ang) * z.len;
        const geo = new THREE.ConeGeometry(rad, z.len, 28, 1, true);
        geo.translate(0, -z.len / 2, 0); // 頂點在原點、往 −Y 展開
        F.cone = new THREE.Mesh(geo, glow(0xfff0b0, 0.1));
        F.core = new THREE.Mesh(geo, glow(0xffffff, 0.05));
        F.core.scale.set(0.45, 1, 0.45);
        F.lamp = new THREE.Mesh(SPH, glow(0xfff6d0, 0.95));
        F.lamp.scale.setScalar(0.45);
        F.aim = new THREE.Group();
        F.aim.add(F.cone, F.core, F.lamp);
        g.add(F.aim);
        F.spot = new THREE.Mesh(DISC, glow(0xfff0b0, 0.28));
        F.spot.rotation.x = -Math.PI / 2;
        g.add(F.spot);
        break;
      }
      case 'beam': {
        F.core = new THREE.Mesh(BEAM, glow(0xffffff, 0.95));
        F.outer = new THREE.Mesh(BEAM, glow(0xffe040, 0.4));
        F.hit = new THREE.Mesh(SPH, glow(0xffe040, 0.8));
        F.src = new THREE.Mesh(SPH, glow(0xffe040, 0.9));
        g.add(F.core, F.outer, F.hit, F.src);
        break;
      }
    }
    g.userData.noFade = true;
    z.mesh = g;
    this.scene.add(g);
    if (z.k === 'smoke') this.zoneLosHook();
  },
  // 範圍的光幕（重力場，第 9.4 期）：開口圓柱的 curtainMat，掛在區域的群組底下
  zoneCurtain(z, g, color, h, f) {
    const F = z.fx;
    if (!F.curt) {
      F.curt = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r, h, 48, 1, true), curtainMat(color, 0, 32));
      F.curt.position.y = h / 2;
      F.curt.renderOrder = 3;
      g.add(F.curt);
    }
    F.curt.visible = true;
    F.curt.material.uniforms.uTime.value = this.fx.time;
    F.curt.material.uniforms.uOp.value = 0.8 * f;
  },
  // 重力場往下墜的光條（kind 0）、吸入區往中心捲的氣流（kind 1）：顯示卡的拉長粒子
  zoneStreaks(z, c, f, dt, kind) {
    if (f < 0.1 || (this.state !== 'play' && this.state !== 'ending')) return;
    const F = z.fx,
      K = this.fx.k;
    F.acc = (F.acc || 0) + dt * (kind ? 40 : 30) * f;
    while (F.acc > 1) {
      F.acc -= 1;
      const a = frand() * Math.PI * 2;
      if (kind === 0) {
        const rr = Math.sqrt(frand()) * z.r;
        const p = new THREE.Vector3(c.x + Math.cos(a) * rr, c.y + frnd(4, 10) * K, c.z + Math.sin(a) * rr);
        this.fx.g.ln.emit({
          p,
          v: new THREE.Vector3(0, -frnd(10, 18) * K, 0),
          life: frnd(0.4, 0.7),
          s0: 0.18 * K,
          c0: frand() < 0.5 ? 0xc89aff : 0x9a60ff,
          cell: LINE,
          fade: 2,
          asp: 0.5,
        });
      } else {
        const rr = z.r * frnd(0.6, 1);
        const p = new THREE.Vector3(c.x + Math.cos(a) * rr, c.y + frnd(0.3, 2.5) * K, c.z + Math.sin(a) * rr);
        // 切線＋往內：越靠近中心越快
        const tan = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
        const inw = new THREE.Vector3(-Math.cos(a), -0.05, -Math.sin(a));
        const v = tan.multiplyScalar(frnd(8, 12) * K).addScaledVector(inw, frnd(6, 10) * K);
        this.fx.g.ln.emit({
          p,
          v,
          drag: 0.4,
          life: frnd(0.5, 0.8),
          s0: 0.16 * K,
          c0: frand() < 0.5 ? 0xbfeaff : 0x6ac0ff,
          cell: LINE,
          fade: 3,
          asp: 0.4,
        });
      }
    }
  },
  // 煙幕的顯示卡煙（華麗）：半透明的煙團填滿圓柱，外圈多一圈貼地的薄霧（看得出範圍：在裡面不能鎖定）
  zoneSmokeFx(z, c, f, dt) {
    if (f < 0.05 || (this.state !== 'play' && this.state !== 'ending')) return;
    const K = this.fx.k,
      H = smokeH(z.r, K);
    const F = z.fx;
    if (!F.pre) {
      F.pre = true;
      F.acc += 40; // 一落地就有一團
    }
    F.acc += dt * (14 + (2 * z.r) / K) * Math.min(1, f * 1.5);
    while (F.acc > 1) {
      F.acc -= 1;
      const a = frand() * Math.PI * 2;
      const edge = frand() < 0.4;
      const rr = edge ? z.r * frnd(0.82, 1.02) : Math.sqrt(frand()) * z.r * 0.8;
      const p = new THREE.Vector3(
        c.x + Math.cos(a) * rr,
        c.y + (edge ? frnd(0.3, 1.6) * K : frnd(0.8 * K, H * 0.85)),
        c.z + Math.sin(a) * rr,
      );
      const v = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(frnd(0.2, 0.6) * K);
      v.y = edge ? frnd(0, 0.15) * K : frnd(0.1, 0.45) * K;
      const col = frand() < 0.6 ? 0x9a9ea4 : 0x7c8086;
      this.fx.haze(
        p,
        edge ? z.r * frnd(0.35, 0.5) : z.r * frnd(0.55, 0.8),
        col,
        frnd(3.5, 5),
        edge ? 0.38 : 0.5,
        v,
      );
    }
  },
  zoneAnim(z, dt, w) {
    const F = z.fx,
      g = z.mesh;
    if (!F || !g) return;
    const f = z.fade || 0;
    const T = z.t;
    if (z.k === 'gravity' || z.k === 'electro' || z.k === 'fuel') {
      g.position.x = z.p.x; // moveZone 跟著移動
      g.position.z = z.p.z;
    }
    // 砲火特效「華麗」：重力場與吸入區的中心畫成黑洞（fx.vortex，各端自己畫）
    if ((z.k === 'gravity' || z.k === 'suction') && f > 0.3 && this.fx.rich)
      this.fx.vortex(g.position, z.r, dt, F, z.k === 'suction' ? 1 : 0);
    switch (z.k) {
      case 'smoke':
        g.position.set(z.p.x, w.groundAt(z.p.x, z.p.z, z.p.y + 2), z.p.z);
        // 砲火特效「華麗」（docs/vfx-design.md 第 9 期）：顯示卡的煙（受光、翻滾、跟風飄、軟粒子）取代實心的灰球
        F.rich = this.fx.rich;
        for (const m of F.parts) m.visible = !F.rich;
        if (F.rich) {
          this.zoneSmokeFx(z, g.position, f, dt);
          break;
        }
        for (const m of F.parts) {
          const u = m.userData;
          const s = u.s * (0.85 + 0.15 * Math.sin(T * 0.8 + u.ph)) * (0.4 + 0.6 * f);
          m.scale.set(s, s * 0.8, s);
          m.position.y += u.sp * dt * 0.3;
          m.material.opacity = 0.62 * f;
        }
        break;
      case 'gravity':
        F.ring.material.opacity = (0.55 + 0.3 * Math.sin(T * 5)) * f;
        F.disc.material.opacity = 0.16 * f;
        F.col.material.opacity = 0.07 * f;
        // 砲火特效「華麗」（第 9.4 期）：光幕（往下壓的掃描線）＋往下墜的光條粒子
        if (this.fx.rich) {
          this.zoneCurtain(z, g, 0xb070ff, 10 * this.fx.k, f);
          F.col.visible = false;
          for (const m of F.parts) m.visible = false;
          this.zoneStreaks(z, g.position, f, dt, 0);
          break;
        }
        F.col.visible = true;
        if (F.curt) F.curt.visible = false;
        for (const m of F.parts) {
          m.visible = true;
          m.position.y -= m.userData.v * dt;
          if (m.position.y < 0) m.position.y += 10 * this.fx.k;
          m.material.opacity = 0.85 * f;
        }
        break;
      case 'suction':
        F.ring.rotation.z += dt * 2;
        F.ring.material.opacity = 0.6 * f;
        F.disc.material.opacity = 0.14 * f;
        // 華麗（第 9.4 期）：往中心捲進去的氣流光條（顯示卡粒子）
        if (this.fx.rich) {
          for (const m of F.parts) m.visible = false;
          this.zoneStreaks(z, g.position, f, dt, 1);
          break;
        }
        for (const m of F.parts) {
          m.visible = true;
          const u = m.userData;
          u.rr -= dt * (2 * this.fx.k + (z.r - u.rr) * 0.4);
          u.a += dt * (1.5 + 6 / Math.max(1, u.rr));
          if (u.rr < 0.5 * this.fx.k) {
            u.rr = z.r;
            u.a = Math.random() * Math.PI * 2;
          }
          m.position.set(Math.cos(u.a) * u.rr, u.h * (u.rr / z.r), Math.sin(u.a) * u.rr);
          m.rotation.y = -u.a; // 沿切線
          m.material.opacity = 0.8 * f;
        }
        break;
      case 'electro':
        F.disc.material.opacity = (0.12 + 0.1 * Math.random()) * f;
        F.ring.material.opacity = 0.55 * f;
        F.zapT = (F.zapT || 0) - dt;
        if (F.zapT <= 0 && f > 0.5 && this.fx.rich) {
          F.zapT = 0.18 + Math.random() * 0.25;
          const pt = () => {
            const a = Math.random() * Math.PI * 2,
              r = Math.random() * z.r * 0.9;
            return new THREE.Vector3(
              g.position.x + Math.cos(a) * r,
              g.position.y + 0.4 * this.fx.k,
              g.position.z + Math.sin(a) * r,
            );
          };
          this.fx.zap(pt(), pt(), 0x9ff0ff, 0.2);
        }
        F.acc -= dt;
        if (F.acc <= 0) {
          F.acc = 0.07;
          for (const L of F.parts) {
            const P = L.geometry.attributes.position;
            const a0 = Math.random() * Math.PI * 2,
              r0 = Math.random() * z.r * 0.9;
            const a1 = a0 + rnd(-1.4, 1.4),
              r1 = Math.random() * z.r * 0.9;
            const x0 = Math.cos(a0) * r0,
              z0 = Math.sin(a0) * r0,
              x1 = Math.cos(a1) * r1,
              z1 = Math.sin(a1) * r1;
            for (let i = 0; i < 9; i++) {
              const t = i / 8,
                j = i && i < 8 ? 0.6 * this.fx.k : 0;
              P.setXYZ(i, lerp(x0, x1, t) + rnd(-j, j), Math.random() * 0.25, lerp(z0, z1, t) + rnd(-j, j));
            }
            P.needsUpdate = true;
            L.material.opacity = (Math.random() < 0.2 ? 0.2 : 0.95) * f;
          }
        }
        break;
      case 'fuel': {
        F.disc.material.opacity = 0.8 * f;
        F.sheen.material.opacity = (0.1 + 0.06 * Math.sin(T * 1.7)) * f;
        F.sheen.rotation.z += dt * 0.2;
        for (const m of F.parts) m.material.opacity = (0.06 + 0.06 * Math.sin(T * 2 + m.userData.ph)) * f;
        const left = (z.ig || 4) - T;
        F.ring.material.opacity = left < 1.5 ? (Math.sin(T * 20) > 0 ? 0.8 : 0.1) : 0; // 快點燃時閃（房主的計時）
        break;
      }
      case 'spot': {
        g.position.copy(z.p);
        F.aim.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), z.dir);
        // 光錐打到地面的光斑
        let hit = null;
        for (let s = 2; s < z.len; s += 1.5) {
          const q = z.p.clone().addScaledVector(z.dir, s);
          if (q.y < w.terrainHeight(q.x, q.z) + 0.2) {
            hit = q;
            break;
          }
        }
        F.spot.visible = !!hit;
        if (hit) {
          F.spot.position.set(
            hit.x - z.p.x,
            w.groundAt(hit.x, hit.z, hit.y + 2) + 0.12 - z.p.y,
            hit.z - z.p.z,
          );
          F.spot.scale.setScalar(Math.max(this.fx.k, hit.distanceTo(z.p) * Math.tan(z.ang)));
        }
        const lit = z.lit ? 1.6 : 1;
        // 華麗（第 9.4 期）：光錐裡飄的塵埃
        if (this.fx.rich && frand() < dt * 14 * f) {
          const s = frnd(0.15, 0.85) * z.len;
          const side = new THREE.Vector3(frnd(-1, 1), frnd(-1, 1), frnd(-1, 1)).multiplyScalar(
            s * Math.tan(z.ang) * 0.7,
          );
          this.fx.ember(
            z.p.clone().addScaledVector(z.dir, s).add(side),
            0.18 * this.fx.k,
            0xfff0c0,
            frnd(1.2, 2),
            new THREE.Vector3(frnd(-0.3, 0.3), frnd(-0.1, 0.3), frnd(-0.3, 0.3)).multiplyScalar(this.fx.k),
            { c0: 0xffffff, fade: 3, a: 0.6 * lit },
          );
        }
        F.cone.material.opacity = 0.1 * f * lit;
        F.core.material.opacity = 0.05 * f * lit;
        F.spot.material.opacity = 0.28 * f * lit;
        break;
      }
      case 'beam': {
        const from = z.p,
          end = z.end;
        // 顯示停在第一個擋住的地方
        const dir = end.clone().sub(from);
        let L = dir.length();
        dir.divideScalar(Math.max(1e-3, L));
        for (let s = 2 * this.fx.k; s < L - 1.5 * this.fx.k; s += this.fx.k) {
          if (w.hitsWorld(from.clone().addScaledVector(dir, s))) {
            L = s;
            break;
          }
        }
        const col = new THREE.Color(0xffe040).lerp(new THREE.Color(0xff2010), z.frac || 0);
        const wd = (0.1 + 0.12 * (z.frac || 0) + 0.03 * Math.sin(T * 40)) * this.fx.k;
        for (const [m, k] of [
          [F.core, 1],
          [F.outer, 3.2],
        ]) {
          m.position.copy(from);
          m.lookAt(from.clone().add(dir));
          m.scale.set(wd * k, wd * k, L);
        }
        F.outer.material.color.copy(col);
        F.outer.material.opacity = 0.4 * f;
        F.core.material.opacity = 0.95 * f;
        // 華麗（第 9.4 期）：流動的能量光束帶＋打中處的火花
        const rich = this.fx.rich;
        F.core.visible = F.outer.visible = !rich;
        if (rich) {
          if (!F.rib) {
            F.rib = ribbonMesh(0xffffff, 1);
            g.add(F.rib); // 頂點著色器直接算世界座標；掛在區域的群組底下，移除時一起拿掉
          }
          const endP = from.clone().addScaledVector(dir, L);
          F.rib.visible = true;
          F.rib.setAB(from, endP, wd * 5);
          const U = F.rib.material.uniforms;
          U.uColor.value.copy(col);
          U.uTime.value = this.fx.time;
          U.uOp.value = f;
          if (frand() < dt * 25)
            this.fx.ember(
              endP,
              0.4 * this.fx.k,
              col.getHex(),
              frnd(0.3, 0.5),
              new THREE.Vector3(frnd(-1, 1), frnd(1, 3), frnd(-1, 1)).multiplyScalar(4 * this.fx.k),
              { g: 15 * this.fx.k, c0: 0xffffff },
            );
        } else if (F.rib) F.rib.visible = false;
        F.hit.position.copy(from).addScaledVector(dir, L);
        F.hit.scale.setScalar((0.5 + 0.6 * (z.frac || 0) + 0.15 * Math.sin(T * 30)) * this.fx.k);
        F.hit.material.color.copy(col);
        F.src.position.copy(from);
        F.src.scale.setScalar(0.45 * this.fx.k);
        F.src.material.color.copy(col);
        break;
      }
    }
  },
};
