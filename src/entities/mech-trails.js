// ============================================================
//  MechEntity 擴充：動作的特效（機甲動作改版第四期，docs/mech-animation.md）
//  - 刀光：近戰武器的刀尖移動得快時，刀根到刀尖拉一條帶子（fx/trail.js）
//  - 地面的推進氣流帶：滑行、QB、滑停時每隻腳下方一條亮的氣流（加色）＋一條依地面材質的痕跡（2～4 秒），貼著地形，沿路揚塵
//  - 腳印與揚塵：QB 結束的滑停、急煞車、重落地時在腳下留下腳印、噴一團塵土
//  只有外觀：房主與客機各自依模型的動作狀態（rig.an）計算，不轉送
// ============================================================
import { emitPreset } from '../fx/presets.js';
import { MechEntity } from './mech-entity.js';

const _a = new THREE.Vector3(),
  _b = new THREE.Vector3(),
  _f = new THREE.Vector3(),
  _r = new THREE.Vector3();
const SLOT = { r: 'rarm', l: 'larm' };
const PRINTS = new Set(); // 場上的腳印（上限 PRINT_MAX；fx.clear 之後不在場景裡的拿掉）
const PRINT_MAX = 80;
const BLADE_V = 9; // 刀尖速度（舊尺度 m/s × 機體倍率）超過這個才畫刀光
const GT_DUST_D = 110; // 沿路揚塵：離鏡頭多遠以內才產生（公尺 × 尺度，同 mech-vfx.js 的 NEAR）
// 滑行的痕跡依地面材質（Game.surfAt）：c 顏色、a 濃度、life 秒、w 寬度倍率、soft 邊緣、streak 條紋、add 加色、core 中線提亮
const GT_MARK = {
  conc: { c: 0x1c1915, a: 0.55, life: 2.6, w: 1, soft: 0.6, streak: 0.75 },
  sand: { c: 0x4a321b, a: 0.55, life: 3.2, w: 1.15, soft: 0.75, streak: 0.6 },
  snow: { c: 0x5a78a6, a: 0.5, life: 3.6, w: 1.2, soft: 0.7, streak: 0.5 },
  ice: { c: 0xbfe6ff, a: 0.32, life: 2.4, w: 0.85, soft: 0.5, streak: 0.85, add: true },
  metal: { c: 0x141518, a: 0.5, life: 2.2, w: 0.9, soft: 0.5, streak: 0.85 },
  water: { c: 0xeef6ff, a: 0.4, life: 2.2, w: 1.35, soft: 0.9, streak: 0.6, core: 0.1 },
};

Object.assign(MechEntity.prototype, {
  // move／remoteUpdate 在動作與 IK 之後呼叫
  trailsTick(dt) {
    const g = this.game,
      m = this.model;
    if (!g || !g.fx || !g.fx.ribbons || !m || m.vehicle || !m.arms || this.dead || !(dt > 0)) return;
    if (this.mesh && !this.mesh.visible) return;
    const R = g.fx.ribbons,
      k = this.scale || 1;
    // ----- 刀光 -----
    const bt = this.bladeT || (this.bladeT = {});
    for (const s of ['l', 'r']) {
      const w = this.weapons && this.weapons[SLOT[s]];
      const a = m.arms[s];
      if (!w || w.dropped || !w.def || !w.def.combo || !a || !a.bladeTip) continue;
      a.bladeRef.updateWorldMatrix(true, false);
      _b.copy(a.bladeTip).applyMatrix4(a.bladeRef.matrixWorld);
      _a.copy(a.bladeBase).applyMatrix4(a.bladeRef.matrixWorld);
      const prev = bt[s] || (bt[s] = new THREE.Vector3().copy(_b));
      const sp = prev.distanceTo(_b) / dt;
      prev.copy(_b);
      const key = this.id + 'b' + s;
      // 渲染風格的「刀光」（slash，docs/zzz-style-design.md）：顏色更飽和、更亮、留得更久
      const sl = (g.styleP && g.styleP.slash) || 0;
      if (sp > BLADE_V * k)
        R.push(key, _a, _b, {
          color: sl > 0 ? slashColor(w.def.color || 0xbfe8ff, sl) : w.def.color || 0xbfe8ff,
          opacity: 0.75 + 0.25 * sl,
          life: 0.18 * (1 + 0.9 * sl),
          max: 14 + Math.round(10 * sl),
          additive: true,
          edge: 0.15,
        });
      else if (sp < BLADE_V * 0.4 * k) R.cut(key);
    }
    // ----- 地面的推進氣流帶（動漫風：亮的氣流＋依地面材質的痕跡＋沿路揚塵） -----
    const an = m.an;
    if (!an || !m.legs || !m.legs.length) return;
    const legged = m.type === 'biped' || m.type === 'reverse';
    const hv = Math.hypot(this.vel.x, this.vel.z);
    const on =
      this.grounded && legged && hv > 6 * (this.dk || 1) && (an.gW > 0.5 || an.qW > 0.3 || an.skid > 0.05);
    const gy = this.pos.y + 0.05 * k;
    // 停下（或離地）時換一組 key：舊的帶子不切斷、照壽命自然淡出，下次滑行另起一條
    if (on) {
      this.groundTrail(dt, an, hv, k);
      this.gtOn = true;
    } else if (this.gtOn) {
      this.gtOn = false;
      this.gtSeg = (this.gtSeg || 0) + 1;
    }
    // ----- 腳印與揚塵：滑停開始、急煞車開始、重落地 -----
    const skid0 = an.skid > 0.3 && !(this.fxSkid > 0.3);
    this.fxSkid = an.skid;
    const brake0 = an.bW > 0.5 && !(this.fxBrake > 0.5);
    this.fxBrake = an.bW;
    const land0 =
      this.grounded && this.landT !== undefined && this.landT <= dt + 1e-4 && (this.landV || 0) > 10;
    if (legged && this.grounded && (skid0 || brake0 || land0)) {
      const sfx = g.ctrl.mechFx !== 'simple' && this.mvSurf; // 地面材質的效果（entities/mech-vfx.js）
      for (const L of m.legs) {
        L.foot.getWorldPosition(_f);
        _f.y = gy;
        g.fx.dust(_f.clone(), land0 ? 1.3 : 0.9, land0 ? 7 : 5);
        this.footPrint(_f);
        if (sfx) this.mvSurf(_f, land0 ? 1 : 0.7, land0 ? 1.6 : 1);
      }
      // 重落地（含下劈）：貼地的衝擊環與地面的裂痕
      if (sfx && land0 && this.landV > 14) this.mvLandRing();
    }
  },
  // 滑行中每格：每隻腳兩條貼地的帶子（fx/trail.js 的地面模式）與沿路的揚塵（docs/mech-animation.md 的「地面的推進氣流帶」）
  //   氣流：短（GT_JET.life）、加色、帶推進器的顏色，條紋往後流
  //   痕跡：2～4 秒、一般混合、依地面材質（GT_MARK），條紋固定在地上、越舊越窄
  //   每個邊點各自貼地形（groundAt；水面上貼水面），斜坡與高低不平的地面也貼得住
  groundTrail(dt, an, hv, k) {
    const g = this.game,
      m = this.model,
      R = g.fx.ribbons,
      w = g.world;
    _r.set(this.vel.z, 0, -this.vel.x);
    if (_r.lengthSq() > 1e-6) _r.normalize();
    const qb = Math.min(1, an.qW || 0),
      skid = Math.min(1, an.skid || 0);
    // 越快越寬、越濃；QB 起步最寬，之後收窄
    const sp = Math.min(1, hv / (Math.max(8, (this.stats && this.stats.speed) || 20) * 1.6));
    const seg = ':' + (this.gtSeg || 0);
    const camD = g.camera ? g.camera.position.distanceTo(this.pos) : 0;
    const dustOn = g.ctrl.mechFx !== 'simple' && camD < GT_DUST_D * (g.fx.k || 1) && this.mvSurf;
    const jc = jetColor(this.mvCol != null ? this.mvCol : this.isPlayer ? 0x8fe8ff : 0xffb060);
    m.legs.forEach((L, i) => {
      L.foot.getWorldPosition(_f);
      const surf = g.surfAt ? g.surfAt(_f.x, _f.z, this.pos.y) : 'conc';
      const M = GT_MARK[surf] || GT_MARK.conc;
      // ---- 氣流 ----
      const hj = (0.24 + 0.1 * sp + 0.2 * qb + 0.06 * skid) * k;
      this.gtEdge(w, _f, hj, k, surf);
      R.push(this.id + 'j' + i + seg, _a, _b, {
        color: jc,
        opacity: (0.26 + 0.14 * sp + 0.2 * qb) * (surf === 'water' ? 0.7 : 1),
        life: 0.16 + 0.08 * qb,
        max: 16,
        additive: true,
        shrink: 0.9,
        ground: { soft: 0.9, streak: 0.9, freq: 7, along: 1.6, flow: 6, core: 0.25, k },
      });
      // ---- 痕跡（key 帶地面材質：換材質時另起一條，舊的自然淡出） ----
      const hm = (0.26 + 0.08 * sp + 0.1 * skid) * k * M.w;
      this.gtEdge(w, _f, hm, k, surf);
      R.push(this.id + 'm' + i + seg + surf, _a, _b, {
        color: M.c,
        opacity: M.a * (0.75 + 0.25 * sp + 0.3 * skid),
        life: M.life,
        max: 80,
        additive: !!M.add,
        shrink: 0.45,
        minD: 0.8 * k,
        ground: { soft: M.soft, streak: M.streak, freq: 10, along: 0.9, flow: 0, core: M.core || 0, k },
      });
      // ---- 沿路揚塵：往後、往外踢 ----
      if (dustOn) {
        const T = this.gtDust || (this.gtDust = []);
        T[i] = (T[i] || 0) - dt * (8 + 8 * sp + 14 * qb + 10 * skid);
        if (T[i] <= 0) {
          T[i] = 1;
          _a.set(_f.x, _a.y, _f.z);
          _b.copy(this.vel).multiplyScalar(-0.18);
          _b.y = 1.2 * k;
          _b.addScaledVector(_r, (i % 2 ? -1 : 1) * 1.2 * k);
          if (!g.fx.skip(_a, 1))
            emitPreset(g.fx.g, 'g_' + surf, _a, { S: k * (0.7 + 0.4 * qb), n: 0.8, vel: _b });
        }
      }
    });
  },
  // 帶子的兩個邊點（_a、_b）：腳的位置往左右 hw，各自貼地形（水面上貼水面）並稍微抬起
  gtEdge(w, f, hw, k, surf) {
    const top = this.pos.y + 1.2 * k,
      lift = 0.06 * k;
    _a.set(f.x + _r.x * hw, 0, f.z + _r.z * hw);
    _b.set(f.x - _r.x * hw, 0, f.z - _r.z * hw);
    for (const p of [_a, _b]) {
      let y = this.pos.y;
      if (w) {
        y = w.groundAt(p.x, p.z, top);
        // 離機體的腳太遠（懸崖邊、物件邊緣）時照機體的高度
        if (Math.abs(y - this.pos.y) > 0.9 * k) y = this.pos.y;
        if (surf === 'water' && w.theme && w.theme.water) y = Math.max(y, w.theme.water.level);
      }
      p.y = y + lift;
    }
  },
  // 腳印：貼地的暗色橢圓，6 秒後淡出
  footPrint(p) {
    const g = this.game;
    for (const d of PRINTS) if (!d.parent) PRINTS.delete(d);
    if (PRINTS.size >= PRINT_MAX || g.fx.skip(p, 1)) return;
    const k = this.scale || 1;
    const d = new THREE.Mesh(
      g.fx.discGeo,
      new THREE.MeshBasicMaterial({
        color: 0x14120f,
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      }),
    );
    d.position.copy(p);
    d.rotation.order = 'YXZ';
    d.rotation.y = this.yaw + (this.model.legsG ? this.model.legsG.rotation.y : 0);
    d.rotation.x = -Math.PI / 2;
    d.scale.set(0.25 * k, 0.45 * k, 1);
    d.userData.noFade = true;
    PRINTS.add(d);
    g.fx.add(d, 6, (e, t) => {
      e.mesh.material.opacity = 0.32 * (t < 0.6 ? 1 : (1 - t) / 0.4);
    });
  },
});

// 氣流的顏色：推進器的顏色往白色靠（動漫的亮線）
const _jc = new THREE.Color(),
  _jw = new THREE.Color(0xffffff);
function jetColor(hex) {
  return _jc.set(hex).lerp(_jw, 0.3).getHex();
}
// 刀光的顏色依風格加飽和、提亮（色相不變）
const _hsl = { h: 0, s: 0, l: 0 };
const _sc = new THREE.Color();
function slashColor(hex, k) {
  _sc.set(hex).getHSL(_hsl);
  _sc.setHSL(_hsl.h, Math.min(1, _hsl.s + (1 - _hsl.s) * 0.85 * k), _hsl.l + (0.62 - _hsl.l) * 0.6 * k);
  return _sc.getHex();
}
