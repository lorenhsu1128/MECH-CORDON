// Boss 場地效果的顯示卡粒子（game/boss-field.js 的 bfVis 在砲火特效「華麗」時每格呼叫；各端自己畫、不轉送）。
// 從 boss-field.js 搬出來，讓模型庫的「地面標示」頁（library/ground.js）用同一份程式；this 是宿主（Game 或
// 模型庫的假宿主），用到 fx。f＝場地紀錄 { k 種類, r, vis（buildField 的結果）, st, o }。
import { warnDiscMat } from '../fx/energy.js';
import { frand, frnd } from '../fx/rand.js';

export const BF_FX = {
  // 場地效果的粒子（各端依自己的場地清單畫，不轉送）
  bfFx(f, t, dt) {
    const fx = this.fx,
      K = fx.k,
      G = f.vis.group,
      c = G.position,
      r = f.r;
    const fx0 = (f.fx = f.fx || { acc: 0, n: -1, on: {} });
    const wp = (v) => G.localToWorld(new THREE.Vector3(v.x, v.y, v.z));
    G.updateMatrixWorld();
    switch (f.k) {
      case 'haze': {
        // 煙霧（灰）、沙塵（黃）、暴風雪（白）：半透明的煙團、跟著風慢慢轉
        const col = f.o.color !== undefined ? f.o.color : 0x8a8e96;
        fx0.acc += dt * (6 + (1.2 * r) / K);
        while (fx0.acc > 1) {
          fx0.acc -= 1;
          const a = frand() * Math.PI * 2,
            d = Math.sqrt(frand()) * r;
          const p = new THREE.Vector3(c.x + Math.cos(a) * d, c.y + frnd(0.5, 4.5) * K, c.z + Math.sin(a) * d);
          const v = new THREE.Vector3(-Math.sin(a), frnd(0, 0.1), Math.cos(a)).multiplyScalar(
            frnd(0.4, 1.2) * K,
          );
          fx.haze(p, frnd(0.35, 0.55) * r, col, frnd(4.5, 6), 0.36, v);
        }
        break;
      }
      case 'steam': {
        // 蒸氣：四個噴口往上冒的白色蒸氣柱＋低處的薄霧
        fx0.acc += dt * 14;
        while (fx0.acc > 1) {
          fx0.acc -= 1;
          const s = f.vis.pts[Math.floor(frand() * f.vis.pts.length)];
          if (!s) break;
          const p = wp(s);
          p.x += frnd(-0.6, 0.6) * K;
          p.z += frnd(-0.6, 0.6) * K;
          const v = new THREE.Vector3(frnd(-0.4, 0.4), frnd(3.5, 5.5), frnd(-0.4, 0.4)).multiplyScalar(K);
          fx.haze(p, frnd(1.6, 2.4) * K, 0xf4f8fb, frnd(1.8, 2.4), 0.32, v, 2.6);
        }
        if (frand() < dt * 4) {
          const a = frand() * Math.PI * 2,
            d = Math.sqrt(frand()) * r * 0.9;
          fx.haze(
            new THREE.Vector3(c.x + Math.cos(a) * d, c.y + frnd(0.4, 1.5) * K, c.z + Math.sin(a) * d),
            frnd(0.3, 0.45) * r,
            0xe8eef2,
            frnd(3, 4),
            0.25,
          );
        }
        break;
      }
      case 'magma': {
        // 熔岩裂地：從裂縫往上飄的火星＋熱扭曲
        fx0.acc += dt * (5 + (0.6 * r) / K);
        while (fx0.acc > 1) {
          fx0.acc -= 1;
          const a = frand() * Math.PI * 2,
            d = Math.sqrt(frand()) * r * 0.85;
          const p = new THREE.Vector3(c.x + Math.cos(a) * d, c.y + 0.3 * K, c.z + Math.sin(a) * d);
          const v = new THREE.Vector3(frnd(-0.5, 0.5), frnd(1.5, 3.5), frnd(-0.5, 0.5)).multiplyScalar(K);
          fx.ember(p, frnd(0.25, 0.5) * K, frand() < 0.5 ? 0xff7a20 : 0xffb040, frnd(1.2, 2), v, {
            c0: 0xffe0a0,
            fade: 3,
            drag: 0.6,
          });
        }
        if (frand() < dt * 1.5) fx.heat(c.clone().setY(c.y + 1.5 * K), (r * 0.5) / K, 0.9, 0.35);
        break;
      }
      case 'belt': {
        // 移動的燃燒帶：一排火舌（和燃燒地面同一種火）＋熱扭曲
        fx0.acc += dt * f.vis.pts.length * 4;
        while (fx0.acc > 1) {
          fx0.acc -= 1;
          const s = f.vis.pts[Math.floor(frand() * f.vis.pts.length)];
          if (!s) break;
          const q = new THREE.Vector3(s.x + frnd(-1, 1) * K, s.y, frnd(-0.4, 0.4) * (f.o.w || r));
          fx.tongue(wp(q), frnd(2.2, 3.2) * K);
        }
        if (frand() < dt * 2) fx.heat(c.clone().setY(c.y + 2 * K), (r * 0.6) / K, 0.6, 0.45);
        break;
      }
      case 'shock': {
        // 電擊地面：放電時一次劈出幾道鋸齒電弧，預警時偶爾閃小電弧
        const ph = f.st.ph || 0;
        const pt = (rr) => {
          const a = frand() * Math.PI * 2,
            d = Math.sqrt(frand()) * rr;
          return new THREE.Vector3(c.x + Math.cos(a) * d, c.y + frnd(0.2, 0.8) * K, c.z + Math.sin(a) * d);
        };
        if (ph === 2 && f.st.n !== fx0.n) {
          fx0.n = f.st.n;
          for (let i = 0; i < 6; i++) fx.zap(pt(r * 0.3), pt(r), 0xdff6ff, 0.35);
        } else if (ph === 2 && frand() < dt * 10) fx.zap(pt(r), pt(r), 0xbfeaff, 0.15);
        else if (ph === 1 && frand() < dt * 5) {
          const p = pt(r);
          fx.zap(
            p,
            p.clone().add(new THREE.Vector3(frnd(-2, 2), 0, frnd(-2, 2)).multiplyScalar(K)),
            0x8fd8ff,
            0.12,
          );
        }
        break;
      }
      case 'minefield': {
        // 地雷區：外圈改成掃描圈（fx/energy.js 的 warnDiscMat，第 9.4 期）
        if (!fx0.disc) {
          fx0.disc = new THREE.Mesh(new THREE.CircleGeometry(1, 48), warnDiscMat(0xff3020, 1));
          fx0.disc.rotation.x = -Math.PI / 2;
          fx0.disc.position.y = 0.12;
          fx0.disc.scale.setScalar(r);
          fx0.disc.userData.helper = true;
          G.add(fx0.disc);
        }
        fx0.disc.visible = true;
        fx0.disc.material.uniforms.uTime.value = fx.time;
        fx0.disc.material.uniforms.uOp.value = 0.8;
        // 閃燈改成發光的粒子（亮起的那一刻放一顆）
        for (const l of f.vis.pts) {
          const on = Math.sin(t * 5 + l.userData.ph) > 0.4;
          if (on && !fx0.on[l.id])
            fx.ember(wp(l.position), 1.1 * K, 0xff3020, 0.3, null, { c0: 0xffd0c0, fade: 1 });
          fx0.on[l.id] = on;
        }
        break;
      }
    }
  },
};
