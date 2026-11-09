// 地面標示頁（library/ground.js）的播放舞台：招式腳本用的工具 S 與「地面標示」的清單。
// 畫面一律用遊戲的同一份程式：fx/effects.js 的 Effects（預警圈、預警線、長方形、地面衝擊波、能量環、光柱、
// 燃燒地面…）、render/zone-fx.js（區域效果）、render/boss-field-models.js＋boss-field-fx.js（Boss 的場地效果）、
// render/ground-marks.js（地雷、光環）。這裡只負責「什麼時候、在哪裡、用什麼參數」呼叫它們——數字照遊戲的呼叫端抄，
// 改了遊戲的招式參數要同步改 ground-moves*.js 的腳本（每個腳本寫了來源檔案）。
// 舞台是平地（地面高度 0），+X 往右、−Z 往前；敵人（src）在前方，玩家（tgt）在原點。
import { DS, MS } from '../core/scale.js';
import { ZONE_FX } from '../render/zone-fx.js';
import { BF_FX } from '../render/boss-field-fx.js';
import { buildField, conformField } from '../render/boss-field-models.js';
import { buildCampRing, buildMineMesh, mineBlink } from '../render/ground-marks.js';
import { DEVICES } from '../data/devices.js';
import { DEVICE_BUILDERS } from '../render/device-models.js';

export const V = (x, y, z) => new THREE.Vector3(x, y, z);
// 地面上的點（舊尺度的公尺 × DS）
export const G = (x, z) => V(x * DS, 0, z * DS);
export const yawOf = (d) => Math.atan2(-d.x, -d.z); // warnRect 的朝向（長邊沿 −Z）

// ---------- 地面標示（基本元件）----------
// key：元件的鍵（腳本呼叫 S 的工具時記下用到哪些，頁面自動列出「用在哪些招式」）
// cat：分類；demo(S)：單獨展示；fx：對應的程式（說明用）
export const MARK_CATS = [
  ['warn', '攻擊預警'],
  ['hit', '衝擊'],
  ['area', '持續區域'],
  ['field', 'Boss 場地效果'],
  ['mech', '機體動作'],
  ['func', '機能光環'],
];
export const MARKS = [
  {
    key: 'warnCircle',
    cat: 'warn',
    name: '落點預警圈',
    fx: 'fx.warnCircle',
    note: '柔和的色面、往邊緣漸亮（沒有外框線），裡面一層從中心往外長，長滿＝落地並閃一下；迫擊砲、榴彈、落下的物體。半徑和判定一致',
    demo: (S) => S.warnCircle(S.g(0, -10), 5 * MS, 1.9),
  },
  {
    key: 'warnLine',
    cat: 'warn',
    name: '瞄準雷射',
    fx: 'fx.warnLine',
    note: '從槍口出來的柔和光芯，充能時收細、變亮、光點往前跑，發射前閃一下；瞄準線、光束、增援的光柱（地面的路線用 warnPath）',
    demo: (S) => S.warnLine(S.v(-12, 4, -10), S.v(12, 1.2, -10), 1.2, 0xff3020, 0.1),
  },
  {
    key: 'warnPath',
    cat: 'warn',
    name: '路線預警',
    fx: 'fx.warnPath（畫成 warnRect）',
    note: '衝刺、突進、火牆的路線：實際寬度的長條，裡面淡淡的往前箭頭，從起點往前長滿',
    demo: (S) => S.warnPath(S.g(-12, -12), S.g(12, -12), 3 * MS, 1.2, 0xff6020),
  },
  {
    key: 'warnRect',
    cat: 'warn',
    name: '長方形預警',
    fx: 'fx.warnRect',
    note: '柔和的長方形（圓角、沒有兩側的亮線），從後端往前長滿；細長的有淡淡的往前箭頭；衝撞路線、進場航線、格子砲擊',
    demo: (S) => S.warnRect(S.g(0, -12), 0, 6 * MS, 30 * DS, 1.4),
  },
  {
    key: 'groundWave',
    cat: 'hit',
    name: '地面衝擊波',
    fx: 'fx.groundWave（game/shockwave.js 的 shockStart）',
    note: '中心先閃紅色預警，再擴散成貼地的光牆；只打貼地的機體，跳起來躲',
    demo: (S) => S.shock(S.g(0, -8), 18, 22, 0.9),
  },
  {
    key: 'pulseShell',
    cat: 'hit',
    name: '能量環',
    fx: 'fx.pulseShell（game/bosses2.js 的 pulseRing）',
    note: '擴散的能量球殼；波面掃過時受傷，QB 的無敵時間能穿過',
    demo: (S) => S.pulse(S.v(0, 2 * MS, -6), 30, 22),
  },
  {
    key: 'pillarStrike',
    cat: 'hit',
    name: '光柱',
    fx: 'fx.pillarStrike',
    note: '天上落下的光柱（先出預警圈）',
    demo: (S) => (S.warnCircle(S.g(0, -10), 3.5 * MS, 1.3), S.at(1.3, () => S.pillar(S.g(0, -10), 3.5 * MS))),
  },
  {
    key: 'shockwave',
    cat: 'hit',
    name: '衝擊環',
    fx: 'fx.shockwave／fx.ring',
    note: '貼地擴散的環（顯示卡粒子）；招式命中、擊破、撿到東西、換型態',
    demo: (S) => (
      S.ring(S.v(0, 0.3, -8), 10, 0xffd090, 0.5),
      S.at(0.6, () => S.ring(S.v(0, 0.3, -8), 6, 0x7ee081, 0.5))
    ),
  },
  {
    key: 'groundBlast',
    cat: 'hit',
    name: '爆炸與焦痕',
    fx: 'fx.explosion／fx.crater',
    note: '預警之後的爆炸（地面會留下焦痕）；這頁的招式範例用它表示「打下來了」',
    demo: (S) => S.boom(S.g(0, -10), 5 * MS),
  },
  {
    key: 'firePool',
    cat: 'area',
    name: '燃燒地面',
    fx: 'fx.firePool（game/bosses2.js 的 addPool）',
    note: '離地 1.2 m 以下每 0.25 秒受傷',
    demo: (S) => S.pool(S.g(-8, -10), 4.5, 6),
  },
  {
    key: 'acidPool',
    cat: 'area',
    name: '腐蝕區',
    fx: 'fx.firePool(…, 1)',
    note: '綠色；站在裡面 ACS 回復 ×0.3',
    demo: (S) => S.pool(S.g(8, -10), 4.5, 6, true),
  },
  {
    key: 'flameCone',
    cat: 'area',
    name: '火焰噴射',
    fx: 'fx.flameCone',
    note: '沿方向噴出的火焰粒子',
    demo: (S) => S.every(0.07, 2.5, () => S.flame(S.v(-10, 1.5 * MS, -10), V(1, 0, 0), 22 * DS, 0.18, 8)),
  },
  {
    key: 'mine',
    cat: 'area',
    name: '地雷',
    fx: 'render/ground-marks.js 的 buildMineMesh',
    note: '貼地才觸發，紅燈閃；感應圈是觸發的範圍',
    demo: (S) => S.mine(S.g(-6, -8), false, 6, 4),
  },
  {
    key: 'airMine',
    cat: 'area',
    name: '空中地雷',
    fx: 'buildMineMesh(…, air)',
    note: '浮在空中的地雷，3D 距離觸發',
    demo: (S) => S.mine(S.v(6, 4 * MS, -8), true, 6, 4),
  },
  {
    key: 'zone:smoke',
    cat: 'area',
    name: '煙幕',
    fx: 'zoneVisual（smoke）',
    note: '裡面的目標不能鎖定、視線不通',
    demo: (S) => S.zone('smoke', S.g(0, -10), 8 * MS, 7),
  },
  {
    key: 'zone:gravity',
    cat: 'area',
    name: '重力場',
    fx: 'zoneVisual（gravity）',
    note: '裡面不能跳躍',
    demo: (S) => S.zone('gravity', S.g(0, -10), 7 * MS, 7),
  },
  {
    key: 'zone:suction',
    cat: 'area',
    name: '吸入區',
    fx: 'zoneVisual（suction）',
    note: '往中心吸',
    demo: (S) => S.zone('suction', S.g(0, -10), 6 * MS, 7),
  },
  {
    key: 'zone:electro',
    cat: 'area',
    name: '水面電流',
    fx: 'zoneVisual（electro）',
    note: '站在水裡時每秒扣能量',
    demo: (S) => S.zone('electro', S.g(0, -10), 14 * MS, 7),
  },
  {
    key: 'zone:fuel',
    cat: 'area',
    name: '油漬',
    fx: 'zoneVisual（fuel）',
    note: '幾秒後點燃成燃燒地面，爆發攻擊提早點燃',
    demo: (S) => S.fuel(S.g(0, -10), 6 * MS, 4, 5),
  },
  {
    key: 'zone:spot',
    cat: 'area',
    name: '探照燈',
    fx: 'zoneVisual（spot）',
    note: '照到的玩家被標定（全場敵人知道位置）',
    demo: (S) => S.spot(S.v(0, 14 * MS, -16), 7),
  },
  {
    key: 'zone:beam',
    cat: 'area',
    name: '追蹤光束',
    fx: 'zoneVisual（beam）',
    note: '連續照中越久越痛，黃 → 紅',
    demo: (S) => S.trackBeam(S.v(10, 9 * MS, -18), S.g(0, -2), 6),
  },
  {
    key: 'field:quicksand',
    cat: 'field',
    name: '流沙',
    fx: 'buildField（quicksand）',
    note: '緩速＋往中心吸',
    demo: (S) => S.field('quicksand', S.g(0, -10), 14, 8),
  },
  {
    key: 'field:ice',
    cat: 'field',
    name: '冰面',
    fx: 'buildField（ice）',
    note: '腳下會滑',
    demo: (S) => S.field('ice', S.g(0, -10), 18, 8),
  },
  {
    key: 'field:shock',
    cat: 'field',
    name: '電擊地面',
    fx: 'buildField（shock）',
    note: '1.2 秒平時 → 1 秒預警 → 放電（扣 EN）',
    demo: (S) => S.field('shock', S.g(0, -10), 9, 8),
  },
  {
    key: 'field:collapse',
    cat: 'field',
    name: '地面塌陷',
    fx: 'buildField（collapse）',
    note: '裂縫預警 → 坑洞',
    demo: (S) => S.field('collapse', S.g(0, -10), 9, 8),
  },
  {
    key: 'field:magma',
    cat: 'field',
    name: '熔岩裂地',
    fx: 'buildField（magma）',
    note: '站在上面持續受傷',
    demo: (S) => S.field('magma', S.g(0, -10), 9, 8),
  },
  {
    key: 'field:belt',
    cat: 'field',
    name: '移動的燃燒帶',
    fx: 'buildField（belt）',
    note: '從 Boss 那一側往玩家掃過去，碰到邊界掉頭',
    demo: (S) => S.belt(S.g(0, -24), V(0, 0, 1), 8),
  },
  {
    key: 'field:minefield',
    cat: 'field',
    name: '地雷區',
    fx: 'buildField（minefield）',
    note: '走進去腳下出預警圈、0.7 秒後爆炸',
    demo: (S) => S.field('minefield', S.g(0, -10), 16, 8),
  },
  {
    key: 'field:airmine',
    cat: 'field',
    name: '空雷殘留區',
    fx: 'buildField（minefield, air）',
    note: '浮在空中的地雷區',
    demo: (S) => S.field('minefield', S.g(0, -10), 16, 8, { air: true }),
  },
  {
    key: 'field:haze',
    cat: 'field',
    name: '煙霧／沙塵／暴風雪',
    fx: 'buildField（haze）',
    note: '擋視線、鎖定距離變短',
    demo: (S) => S.field('haze', S.g(0, -10), 18, 8, { color: 0x8a8e96 }),
  },
  {
    key: 'field:steam',
    cat: 'field',
    name: '蒸氣',
    fx: 'buildField（steam）',
    note: '擋視線；裡面的燃燒地面熄滅（安全區）',
    demo: (S) => S.field('steam', S.g(0, -10), 12, 8),
  },
  {
    key: 'flow',
    cat: 'area',
    name: '開閘的水流',
    fx: 'game/support.js 的 addFlow／updateFlows',
    note: '貼地的機體被往下游推並受損',
    demo: (S) => S.flow({ x: -20 * DS, z: -14 * DS, dx: 1, dz: 0, hw: 5 * MS, len: 40 * DS }, 5),
  },
  {
    key: 'trapZone',
    cat: 'area',
    name: '陷阱的作用區域',
    fx: 'game/devices-traps.js 的 trapVis',
    note: '環境陷阱觸發後的電光、冰屑、水花、氣流、火焰（敵我不分）',
    demo: (S) => S.trap('shock'),
  },
  {
    key: 'chevrons',
    cat: 'mech',
    name: '推進箭頭',
    fx: 'fx.chevrons',
    note: 'QB 往後噴、空中跳往下噴、突進往前',
    demo: (S) => (S.chev(S.g(0, -8), V(0, 0, 1)), S.at(0.6, () => S.chev(S.v(0, 6 * MS, -8), V(0, -1, 0)))),
  },
  {
    key: 'campRing',
    cat: 'func',
    name: '光環（出口、補給台、資料終端）',
    fx: 'render/ground-marks.js 的 buildCampRing',
    note: '地面的環＋光柱＋標籤；區段的回收地點、逃脫點、據點也是它',
    demo: (S) => S.campRing(S.g(0, -10), 0x7ee081, '補給', '', 3.5 * MS, 6),
  },
];

// ---------- 播放舞台 ----------
// 宿主：zone-fx／boss-field-fx 的方法用到的 Game 欄位（平地）
function makeHost(fx, scene) {
  return {
    fx,
    scene,
    state: 'play',
    world: {
      groundAt: () => 0,
      terrainHeight: () => 0,
      hitsWorld: (p) => p.y < 0,
      theme: {},
    },
    zoneLosHook() {},
    ...ZONE_FX,
    ...BF_FX,
  };
}

// 不做事的特效（dry：只記下用到哪些地面標示）
const NOFX = new Proxy(
  {},
  { get: (t, k) => (k === 'k' ? DS : k === 'rich' ? true : k === 'time' ? 0 : () => {}) },
);
const NOSCENE = { add() {}, remove() {} };

// 一次播放的工具（招式腳本的參數）。stage＝{ fx, scene, src, tgt }（src／tgt：{ pos, center(), muzzle(k) }）
// o.dry：不畫（只執行腳本、記下用到的地面標示，頁面列「用在哪些招式」用）；o.off：位置的位移（全部並排）
export class Run {
  constructor(stage, o = {}) {
    this.dry = !!o.dry;
    this.off = o.off || V(0, 0, 0);
    if (this.dry) stage = { ...stage, fx: NOFX, scene: NOSCENE };
    this.st = stage;
    this.fx = stage.fx;
    this.host = makeHost(stage.fx, stage.scene);
    this.q = []; // 延遲的事件 [t, fn]
    this.t = 0;
    this.objs = []; // 自己管的東西：{ tick(dt) → false 時移除, drop() }
    this.used = new Set(); // 用到的地面標示（MARKS 的 key）
    this.src = stage.src;
    this.tgt = stage.tgt;
    this.dead = false;
  }
  // ----- 時間 -----
  at(t, fn) {
    this.q.push([this.t + t, fn]);
  }
  every(dt, dur, fn) {
    for (let t = 0; t < dur - 1e-6; t += dt) this.at(t, fn);
  }
  tick(dt) {
    this.t += dt;
    for (let i = 0; i < this.q.length;) {
      if (this.q[i][0] <= this.t) {
        const fn = this.q[i][1];
        this.q.splice(i, 1);
        fn();
      } else i++;
    }
    for (let i = this.objs.length - 1; i >= 0; i--) if (this.objs[i].tick(dt) === false) this.drop(i);
  }
  drop(i) {
    const o = this.objs[i];
    this.objs.splice(i, 1);
    if (o.drop) o.drop();
  }
  stop() {
    this.dead = true;
    this.q.length = 0;
    while (this.objs.length) this.drop(this.objs.length - 1);
  }
  get busy() {
    return this.q.length > 0 || this.objs.length > 0;
  }
  mark(k) {
    this.used.add(k);
  }
  // ----- 位置 -----
  g(x, z) {
    return G(x, z).add(this.off);
  }
  v(x, y, z) {
    return V(x * DS, y, z * DS).add(this.off);
  }
  // 玩家（tgt）周圍：角度 a（弧度，0＝+X）、距離 r（舊尺度）
  around(c, a, r) {
    return c
      .clone()
      .add(V(Math.cos(a) * r * DS, 0, Math.sin(a) * r * DS))
      .setY(0);
  }
  // ----- 地面標示（和遊戲同名的特效；參數照遊戲的呼叫端）-----
  warnCircle(p, R, dl, color) {
    this.mark('warnCircle');
    this.fx.warnCircle(p.clone().setY(0), R, dl, color);
  }
  warnLine(a, b, dl, color, w) {
    this.mark('warnLine');
    this.fx.warnLine(a, b, dl, color, w);
  }
  warnPath(a, b, w, dl, color) {
    this.mark('warnPath');
    this.fx.warnPath(a.clone().setY(0), b.clone().setY(0), w, dl, color);
  }
  warnRect(c, yaw, w, l, dl, color) {
    this.mark('warnRect');
    this.fx.warnRect(c.clone().setY(0), yaw, w, l, dl, color);
  }
  // 地面衝擊波（shockStart：R、sp 舊尺度）
  shock(p, R, sp, dl) {
    this.mark('groundWave');
    this.fx.groundWave(p.clone().setY(0), R * DS, sp * DS, dl, () => 0);
  }
  // 能量環（pulseRing：R、sp 舊尺度）
  pulse(c, R, sp, color = 0xff5070) {
    this.mark('pulseShell');
    this.fx.pulseShell(c, R * DS, sp * DS, color);
  }
  pillar(p, R, color) {
    this.mark('pillarStrike');
    this.fx.pillarStrike(p.clone().setY(0), R, color);
  }
  ring(p, r, color, life = 0.5) {
    this.mark('shockwave');
    this.fx.shockwave(p, r, color, life);
  }
  // 爆炸（預警之後打下來）：R＝世界尺寸的範圍
  boom(p, R, color = 0xff8040) {
    this.mark('groundBlast');
    this.fx.explosion(p.clone().setY(0.5 * MS), Math.max(2, R / DS), color);
  }
  // 燃燒地面（addPool：R 舊尺度）
  pool(p, R, life, acid = false) {
    this.mark(acid ? 'acidPool' : 'firePool');
    this.fx.firePool(p.clone().setY(0), R * DS, life, acid ? 1 : 0);
  }
  flame(p, dir, len, ang, n) {
    this.mark('flameCone');
    this.fx.flameCone(p, dir, len, ang, n);
  }
  chev(p, dir, color = 0xffffff) {
    this.mark('chevrons');
    this.fx.chevrons(p, dir, color);
  }
  bolt(a, b, color = 0xbfe8ff) {
    this.fx.bolt(a, b, color, 0.3, 's');
  }
  beamFx(a, b, color, width) {
    this.fx.beam(a, b, color, width);
  }
  // 高拋的彈體（外觀：發光的球沿拋物線飛 T 秒）
  lob(from, to, T, color = 0xff8040, s = 0.5) {
    if (this.dry) return;
    const m = new THREE.Mesh(
      this.fx.sphereGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }),
    );
    m.scale.setScalar(s * MS);
    const H = Math.max(8 * MS, from.distanceTo(to) * 0.35);
    this.fx.add(m, T, (e, t) => {
      m.position.copy(from).lerp(to, t);
      m.position.y += 4 * H * t * (1 - t);
    });
  }
  // 迫擊砲（game/support.js 的 mortarShot）：從 src 的背部高拋，落點預警圈＝飛行時間，落地爆炸
  mortar(tp, R, color, from = this.src.muzzle('rback')) {
    const land = tp.clone().setY(0);
    const T = Math.min(2.8, Math.max(1.6, 1.5 + from.distanceTo(land) / (60 * DS)));
    this.warnCircle(land, R, T, color);
    this.lob(from, land, T);
    this.at(T, () => this.boom(land, R));
    return T;
  }
  // 光束（mech-boss3.js 的 b3Beam）：預警線 dl 秒後發射
  beam(from, dir, dl, range = 80, color = 0xff4060, wcol = 0xff3050) {
    const end = from.clone().addScaledVector(dir, range * DS);
    this.warnLine(from, end, dl, wcol, 0.1);
    this.at(dl, () => this.beamFx(from, end, color, 0.35));
  }
  // ----- 自己管的物件 -----
  // 地雷：放 life 秒，boomAt 秒後觸發（閃快、爆炸）
  mine(p, air, life, boomAt = -1) {
    this.mark(air ? 'airMine' : 'mine');
    if (this.dry) return;
    const g = buildMineMesh(air ? p : p.clone().setY(0), air, this.fx.rich);
    this.st.scene.add(g);
    let t = 0;
    this.objs.push({
      tick: (dt) => {
        t += dt;
        const fast = boomAt >= 0 && t > boomAt - 0.6;
        mineBlink(g, t, fast, this.fx.time);
        if (boomAt >= 0 && t >= boomAt) {
          this.boom(p, 4 * MS);
          return false;
        }
        return t < life;
      },
      drop: () => this.st.scene.remove(g),
    });
  }
  // 區域效果（game/hazards2.js 的 addZone）：o 同 addZone
  zone(kind, pos, r, life, o = {}) {
    this.mark('zone:' + kind);
    if (this.dry) return null;
    const z = {
      i: 0,
      k: kind,
      p: pos.clone(),
      r,
      life,
      max: life,
      t: 0,
      dir: o.dir ? o.dir.clone().normalize() : V(0, -1, 0),
      ang: o.ang || 0.35,
      len: o.len || 30,
      to: o.to ? o.to.clone() : null,
      ig: o.ignite || 4,
      frac: 0,
      end: o.end ? o.end.clone() : null,
    };
    this.host.zoneVisual(z);
    this.objs.push({
      tick: (dt) => {
        z.t += dt;
        z.life -= dt;
        z.fade = Math.min(1, z.t / 0.6, Math.max(0, z.life) / 1.2);
        if (o.move) o.move(z, dt);
        this.host.zoneAnim(z, dt, this.host.world);
        return z.life > 0;
      },
      drop: () => {
        this.st.scene.remove(z.mesh);
        z.mesh.traverse((m) => {
          if (m.material) m.material.dispose();
          if (m.geometry && !m.geometry.userData.shared) m.geometry.dispose();
        });
      },
    });
    return z;
  }
  // 油漬：ignite 秒後變成燃燒地面 burn 秒（hazards2.js 的 fuelIgnite）
  fuel(p, r, ignite, burn) {
    this.zone('fuel', p, r, ignite, { ignite });
    this.at(ignite, () => this.pool(p, r / DS, burn));
  }
  // 探照燈：從高處 p 照向地面、左右掃
  spot(p, life, ang = 0.32) {
    const dir0 = V(0, -1, 0.35).normalize();
    return this.zone('spot', p, 6 * MS, life, {
      dir: dir0,
      ang,
      len: 60 * DS,
      move: (z) => z.dir.set(Math.sin(z.t * 0.9) * 0.55, -1, 0.35 + Math.cos(z.t * 0.6) * 0.2).normalize(),
    });
  }
  // 追蹤光束：from → to，越照越紅
  trackBeam(from, to, life, ramp = 3) {
    return this.zone('beam', from, 0.9 * MS, life, {
      end: to,
      move: (z) => (z.frac = Math.min(1, z.t / ramp)),
    });
  }
  // Boss 的場地效果（game/boss-field.js 的 bfAdd：r 舊尺度 × K）
  field(kind, p, r, life, o = {}) {
    this.mark(kind === 'minefield' && o.air ? 'field:airmine' : 'field:' + kind);
    if (this.dry) {
      for (const m of o.trig || []) this.at(m.t, () => (this.warnCircle(m.p, 1, 1), this.boom(m.p, 1)));
      return null;
    }
    const K = DS;
    const v = buildField(kind, r * K, { ...o, k: K });
    v.group.position.copy(p).setY(0);
    if (o.dir) v.group.rotation.y = Math.atan2(-o.dir[0], -o.dir[1]);
    else conformField(v.group, () => 0, K);
    this.st.scene.add(v.group);
    const f = { k: kind, p: v.group.position.clone(), r: r * K, life, o, t: 0, st: {}, vis: v };
    const mines = kind === 'minefield' ? o.trig || [] : [];
    this.objs.push({
      tick: (dt) => {
        f.t += dt;
        if (kind === 'shock') {
          const c = f.t % 2.55;
          const ph = c < 1.2 ? 0 : c < 2.2 ? 1 : 2;
          if (ph !== f.st.ph) {
            f.st.ph = ph;
            if (ph === 2) {
              f.st.n = (f.st.n || 0) + 1;
              for (let i = 0; i < 2; i++) {
                const a = Math.random() * 6.283,
                  rr = Math.random() * 0.8 * f.r;
                const q = f.p.clone().add(V(Math.cos(a) * rr, 0, Math.sin(a) * rr));
                this.bolt(q.clone().setY(50 * MS), q, 0x9fe8ff);
              }
            }
          }
        } else if (kind === 'collapse' && !f.st.open && f.t >= (o.delay || 1.6)) {
          f.st.open = true;
          this.fx.dust(f.p.clone(), f.r / K, 18, 0x6e5e4c);
          this.ring(f.p.clone(), f.r / K, 0x9a8a70, 0.4);
        } else if (kind === 'belt') {
          f.p.x += o.dir[0] * o.sp * dt;
          f.p.z += o.dir[1] * o.sp * dt;
          v.group.position.copy(f.p);
        }
        // 地雷區：示範一次「走進去」的預警與爆炸
        for (const m of mines)
          if (!m.done && f.t >= m.t) {
            m.done = true;
            this.warnCircle(m.p, 4.5 * K, 0.7);
            this.at(0.7, () => this.boom(m.p, 4.5 * K));
          }
        const T = performance.now() / 1000;
        v.update(T, dt, f.st);
        const rich = this.fx.rich;
        for (const ob of v.hide || []) ob.visible = !rich;
        if (rich) this.host.bfFx(f, T, dt);
        return f.t < life;
      },
      drop: () => {
        this.st.scene.remove(v.group);
        v.group.traverse((m) => {
          if (m.material) m.material.dispose?.();
        });
      },
    });
    return f;
  }
  // 移動的燃燒帶（bfBelt：寬 5、長＝作戰區域的 0.8，速度 7；這裡長 70 m）
  belt(p, d, life) {
    const K = DS;
    return this.field('belt', p, 4, life, { dir: [d.x, d.z], sp: 7 * K, len: 70 * K, w: 5 * K });
  }
  // 開閘的水流（game/support.js 的 updateFlows：每格三點水花、偶爾沿流向的水線）
  flow(f, dur) {
    this.mark('flow');
    if (this.dry) return;
    let t = 0;
    this.objs.push({
      tick: () => {
        t += 1 / 60;
        for (let i = 0; i < 3; i++) {
          const u = Math.random() * f.len,
            v = (Math.random() * 2 - 1) * f.hw;
          const p = V(f.x + f.dx * u - f.dz * v, 0.3, f.z + f.dz * u + f.dx * v);
          this.fx.dust(p, 1.5, 2, 0xb8dcf0);
          if (Math.random() < 0.25) this.fx.streaks(p, 2, 0xd8f0ff, 12, 0.35, 8, V(f.dx, 0.4, f.dz), 0.4);
        }
        return t < dur;
      },
    });
  }
  // 裝置的模型（render/device-models.js；整個群組乘 MS，+Z＝前方、朝向玩家）
  device(k, at) {
    const def = DEVICES[k];
    const mesh = DEVICE_BUILDERS[k](def.color, { k });
    mesh.position.copy(at);
    mesh.scale.setScalar(MS);
    this.st.scene.add(mesh);
    const glow = [];
    mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material.name === 'glow') glow.push(o.material);
    });
    return { mesh, def, glow };
  }
  // 環境陷阱（game/devices-traps.js 的 trapHit＋trapVis）：待命 1 秒（弱點脈動）→ 觸發
  trap(k, at = G(0, -14).add(this.off)) {
    const E = DEVICES[k].fx,
      Z = E.zone;
    if (Z) this.mark('trapZone');
    if (E.blast) this.mark('groundBlast');
    if (E.blast || E.line) this.mark('shockwave');
    if (E.pool) this.mark('firePool');
    if (E.pillar) this.mark('pillarStrike');
    if (this.dry) return;
    const { mesh: m, def, glow } = this.device(k, at);
    const rot = (v) => V((v[0] || 0) * MS, (v[1] || 0) * MS, (v[2] || 0) * MS);
    const T0 = 1;
    const dur = Math.max(2.5, (Z ? Z.dur : 0) + (E.delay || 0) + 0.5);
    let t = 0,
      fired = false,
      vfx = 0;
    const zonePt = () => {
      let lx, lz;
      if (Z.sq) {
        lx = (Math.random() * 2 - 1) * Z.sq;
        lz = (Math.random() * 2 - 1) * Z.sq;
      } else if (Z.line) {
        lx = (Math.random() - 0.5) * Z.line[1];
        lz = Math.random() * Z.line[0];
      } else {
        const a = Math.random() * Math.PI * 2,
          r = Math.sqrt(Math.random()) * Z.R;
        lx = Math.cos(a) * r;
        lz = Math.sin(a) * r;
      }
      return at.clone().add(V(lx * MS, 0, lz * MS));
    };
    this.objs.push({
      tick: (dt) => {
        t += dt;
        const act = t >= T0;
        const vt = t - T0;
        if (act && !fired) {
          fired = true;
          if (E.blast) {
            const c = at.clone().add(rot(E.at || [0, 0, 0]));
            this.mark('groundBlast');
            this.fx.explosion(c.clone().setY(c.y + 1.5 * MS), E.blast * 0.6, def.boomColor || 0xffa040, true);
            this.ring(c.clone().setY(c.y + 0.5 * MS), E.blast, 0xffd090, 0.5);
            this.fx.dust(c.clone().setY(c.y + 0.3), E.blast * 0.8, 14, def.dustColor || 0x9a8e80);
          }
          if (E.line) {
            const tip = at.clone().add(V(0, 0, E.line[0] * MS));
            this.at(0.8, () => {
              this.fx.dust(tip.clone().setY(0.3), 8, 16, 0x8a8478);
              this.ring(tip.clone().setY(0.5), 6, 0xffe080, 0.5);
            });
          }
          if (E.pool) {
            this.mark('firePool');
            this.fx.firePool(at.clone(), Z.R, Math.min(Z.dur, 6), 0);
          }
          if (E.pillar) this.pillar(at.clone(), E.pillar, def.color);
        }
        const lit = !act ? 0.8 + 0.6 * Math.abs(Math.sin(t * 3)) : t < T0 + 3 ? 2.4 : 0.15;
        for (const g of glow) g.emissiveIntensity = m.grid && act ? 2 + Math.random() : lit;
        if (m.wp) m.wp.visible = !act || !def.hideWp;
        if (m.load) {
          m.load.position.y = act ? Math.max(0, 3.2 - 10.6 * vt * vt) : 3.2;
          m.load.visible = !act || vt < 0.9;
        }
        if (m.tower) m.tower.rotation.x = act ? Math.min(Math.PI / 2, 1.6 * vt * vt) : 0;
        if (m.hole) m.hole.visible = act;
        // 區域的電光、火花、水花（trapVis：每 0.12 秒兩顆）
        if (act && Z && vt >= (E.delay || 0) && vt < Z.dur) {
          vfx -= dt;
          if (vfx <= 0) {
            vfx = 0.12;
            for (let i = 0; i < 2; i++) {
              const p = zonePt();
              const fw = V(0, 0, 1);
              if (Z.vis === 'elec') {
                this.fx.arc(p.setY(p.y + 0.4 * MS), 1.4, def.color);
                if (Math.random() < 0.3) this.fx.spark(p, 0xbfe8ff);
              } else if (Z.vis === 'ice') this.fx.dust(p.setY(p.y + 0.2), 2, 3, 0xd8f0ff);
              else if (Z.vis === 'water' || Z.vis === 'wind') {
                const col = Z.vis === 'water' ? 0xd8f0ff : 0xfff0c0;
                if (Z.vis === 'water') this.fx.dust(p.clone().setY(p.y + 0.3), 2, 3, 0xb8dcf0);
                this.fx.streaks(p.setY(p.y + 0.6 * MS), 2, col, 14, 0.35, 10, fw.clone().setY(0.25), 0.4);
              } else if (Z.vis === 'fire' && i === 0) {
                const o = at.clone().add(rot([0, 1.7, 1.2]));
                this.flame(o, fw, Z.line[0] * MS * 0.5, 0.18, 8);
              } else if (Z.vis === 'coral') {
                this.fx.spark(p.setY(p.y + 0.5 * MS), 0xff5a6a);
                if (Math.random() < 0.4) this.fx.arc(p, 1.2, 0xff4a5a);
              }
            }
          }
        }
        return t < T0 + dur;
      },
      drop: () => this.st.scene.remove(m),
    });
  }
  // 光環：出口、補給台、資料終端、區段的光環
  campRing(p, color, title, sub, r, life) {
    this.mark('campRing');
    if (this.dry) return;
    const g = buildCampRing(p.clone().setY(0), color, title, sub, r);
    this.st.scene.add(g);
    let t = 0;
    this.objs.push({
      tick: (dt) => {
        t += dt;
        g.userData.ring.rotation.z += dt * 0.8;
        return t < life;
      },
      drop: () => {
        this.st.scene.remove(g);
        g.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          }
        });
      },
    });
  }
}
