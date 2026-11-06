// Game 的 mixin：地圖物件的破壞（docs/destruction-design.md）——受傷（依材質的屬性倍率）、四段受損的外觀
// （焦黑、碎板、依材質的持續效果；只有可燃的起火）、完全損毀換成殘骸（world.destroyProp）、多人同步。
//   判定只在房主／單機（propDamage）；房主把這一格血量有變的物件合併成一個 propHp 事件、每 2 秒在快照帶一份
//   受損物件的血量表（prs：重連、觀戰、漏掉事件、房主遷移都靠它對齊）；客機依血量自己演出，特效一律不轉送。
import { SFX } from '../audio/audio.js';
import { weaponAttr } from '../data/attrs.js';
import {
  DESTRUCT,
  PMAT,
  PROP_CHAR,
  propAttrK,
  propCrushable,
  propDebrisCol,
  propStage,
} from '../data/destruct.js';
import { weaponById } from '../data/parts.js';
import { fling, local } from '../render/foe-damage.js';
import { isOutline } from '../render/geometry.js';
import { CH0, cellHash, cutHeight, splitTris, tierBoxes } from '../world/prop-split.js';
import { WRECK_SLOT } from '../world/prop-wreck.js';
import { providedModel } from '../render/model-provider.js';
import { Game } from './game.js';

const NEAR = 170; // 持續效果：離鏡頭多遠以內（公尺）
const MAX_ACTIVE = 12; // 同時演出持續效果的物件數（離鏡頭最近的）
const TABLE_DT = 2; // 房主送血量表的間隔（秒）
const WRECK_BURN = 22; // 可燃物的殘骸繼續燒幾秒
const WRECK_SMOKE = 7; // 其他殘骸冒煙／揚塵幾秒
const FLASH_MS = 70;
const CRUSH_SLOW = 0.85; // 踩平時機甲的速度倍率
// 受損姿勢（propPose）：往一邊歪的、第 3 階段傾斜的
const POSE_LEAN = new Set([
  'lamppost',
  'streetlamp',
  'lamp',
  'floodlight',
  'beacon',
  'mast',
  'commmast',
  'pillar',
  'pine',
  'radar',
]);
const POSE_TILT = new Set(['car', 'bus', 'truck', 'fueltruck', 'mtwreck']);
const FALL_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const WARN_T = 1.5; // 倒塌：預警的秒數
const FALL_T = 1.4; // 倒下的秒數
const SINK_T = 2; // 往下塌的秒數
const DROP_T = 1; // 甲板掉下來的秒數
const SEG_SAFE = 25; // 局部打穿：出生點、出口、目標附近幾公尺內只受損
const BREACH_FLOW_T = 40; // 壩體缺口的水流持續幾秒
const ROOF_HP = 9000; // 岩頂每一格的血量

const GEO_OWNER = new WeakMap(); // 幾何 → 改了它的物件（共用的幾何先複製一份）
const BLACK = new THREE.Color(0);
const SHARD_GEO = new THREE.BoxGeometry(1, 0.16, 0.75);

// 頂點位置的雜湊（0～1）：焦黑一塊一塊的
const hash3 = (x, y, z) => {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return h - Math.floor(h);
};

Object.assign(Game.prototype, {
  // 設定「地圖物件的破壞」：easy／normal／off（客機用房主送來的）
  destructMode() {
    const m = this.net && this.net.role === 'client' ? this.destructNet : this.ctrl && this.ctrl.destruct;
    return m === 'normal' || m === 'off' ? m : 'easy'; // 預設＝易破壞（2026-11-05 使用者定案）
  },
  // 這個物件現在打得壞嗎（設定「不可破壞」時只有改版前就打得壞的）
  propLive(p) {
    return !p.dead && (p.legacy || this.destructMode() !== 'off');
  },
  // 房主／單機：物件受傷。attr＝屬性（沒有時依武器 id 推算，都沒有時算實彈）；'none'＝不看材質
  propDamage(p, dmg, impact, at, from, attr, wid) {
    if (p.dead) return;
    if (p.isShot) return this.shotDamage(p, dmg, at, from); // 可以打掉的投射物（hazards2.js）
    if (p.isTrap) return this.trapDamage(p, dmg, at, from); // 環境陷阱的弱點（devices-traps.js）
    const mode = this.destructMode();
    if (mode === 'off' && !p.legacy) return;
    const a = attr || (wid ? weaponAttr(weaponById(wid)) : 'kin');
    const DM = DESTRUCT[mode];
    const d = Math.round(dmg * Math.max(DM.floor, propAttrK(p.mat, a)) * DM.k);
    if (!(d > 0)) return;
    if (p.noDie && p.hp - d <= 0) p.hp = Math.min(p.hp, 1);
    else p.hp -= d;
    this.propFlash(p);
    if (!this.propXfer) this.popDamage(at || p.center(), d, false, false, false, 0, -1, impact);
    // 打在大型結構本體或甲板上：同時算給離命中點最近、還沒壞的承重柱（所以打哪裡都倒得了；2026-11-06）
    if (p.noDie && p.sup && p.sup.length && DM.sup > 0 && !this.propXfer) {
      const c = at || p.center();
      let best = null,
        bd = Infinity;
      for (const q of p.sup) {
        if (q.dead) continue;
        const dq = q.center().distanceToSquared(c);
        if (dq < bd) {
          bd = dq;
          best = q;
        }
      }
      if (best) {
        this.propXfer = true;
        try {
          this.propDamage(best, dmg * DM.sup, 0, best.center(), from, attr, wid);
        } finally {
          this.propXfer = false;
        }
      }
    }
    (this.propDirty || (this.propDirty = new Set())).add(p);
    if (p.hp <= 0 && (p.seg || p.grid) && this.segProtected(p)) p.hp = 1; // 出生點、出口、目標附近只受損
    if (p.hp <= 0) {
      const src = from && from.pos ? from.pos : at;
      const dir = src ? p.center().sub(src).setY(0) : null;
      if (dir && dir.lengthSq() > 1e-4) dir.normalize();
      if (p.body) {
        // 直接打得壞的甲板格子（Grid 086）：整格掉下去
        this.propDirty && this.propDirty.delete(p);
        this.netEv({ t: 'pcol', i: p.idx, d: 0 });
        this.propCollapse(p, 0, false);
      } else this.propKill(p, dir);
    } else this.propStageCheck(p);
  },
  // 完全損毀（房主／單機）：o.cr＝被踩平
  propKill(p, dir, o = {}) {
    if (p.dead) return;
    this.propDirty && this.propDirty.delete(p);
    this.world.destroyProp(p, this.fx, { dir, cr: o.cr, noWreck: this.destructMode() === 'off' });
    if (p.seg) this.propSegDown(p, false);
    else if (p.support && !p.sep) this.propSupportDown(p, false);
    else this.propWreckFx(p);
    this.netEv({
      t: 'propDie',
      i: p.idx,
      d: dir ? [+dir.x.toFixed(2), +dir.z.toFixed(2)] : 0,
      cr: o.cr ? 1 : 0,
    });
    // 承重柱全壞：結構倒下（方向依最後一擊；客機收到 pcol 照同樣的方向演出）
    // 承重的壞了：全壞（易破壞：壞一半）就倒
    const easy = this.destructMode() === 'easy';
    if (p.support)
      for (const b of p.ofs || [p.of])
        if (
          b.sup.filter((q) => q.dead).length >= (easy ? Math.ceil(b.sup.length / 2) : b.sup.length) &&
          !b.collapsed &&
          !b.noCollapse &&
          !(b.seg && this.segProtected(b))
        ) {
          const di = this.propFallDir(b, dir);
          this.netEv({ t: 'pcol', i: b.idx, d: di });
          this.propCollapse(b, di, false);
        }
    this.lvPropDown(p); // 自訂關卡的觸發器（物件被破壞）
    this.propCrowdDown(p); // 小人
    if (!o.cr) this.rumbleAt(p.center(), 0.5, 0.3, 160, 30);
  },
  // 受擊閃光（只對可淡出的材質有效；propDmgTick 還原）
  propFlash(p) {
    if (!p.ob.mats || !p.ob.mats.length) return;
    for (const m of p.ob.mats) if (m.emissive) m.emissive.setRGB(0.6, 0.6, 0.6);
    p.flashUntil = performance.now() + FLASH_MS;
    (this.propFlashing || (this.propFlashing = new Set())).add(p);
  },
  // 血量變了：進入新的階段時套外觀（quiet＝不拋碎片，重連時直接套用）
  propStageCheck(p, quiet) {
    if (p.dead || this.destructMode() === 'off') return; // 不可破壞：和改版前一樣沒有受損階段
    const st = Math.min(3, propStage(p.hp, p.maxHp));
    const st0 = p.st || 0;
    if (st <= st0) return;
    p.st = st;
    if (!quiet && !(this.net && this.net.role === 'client')) this.lvPropStage(p, st); // 自訂關卡的觸發器
    if (p.support || (p.seg && !p.grid)) {
      // 承重柱、巨型結構的一段：只噴碎板（模型是整個結構共用的，焦黑與脫落由結構本體決定）
      if (!quiet && this.fx) this.propShards(p, st >= 3 && st0 < 3 ? 3 : 1);
      return;
    }
    for (let s = st0 + 1; s <= st; s++) this.propTier(p, s, quiet || !this.fx);
    this.propChar(p, PROP_CHAR[st]);
    this.propPose(p, st);
    if (st >= 3) this.propDmgGlb(p);
    if (st >= 2) this.propActivate(p);
  },
  // 第 s 階段的零件脫落（world/prop-split.js）：標出的區域，沒有時自動（小細節分兩批、高的物件切掉最上面一段）
  propTier(p, s, quiet) {
    const g = p.ob.group;
    if (!g) return;
    const sh = p.shape;
    const H = sh.y1 - sh.y0;
    const boxes = tierBoxes(g, s);
    const inB = (c) => boxes && boxes.some((b) => b.containsPoint(c));
    let pred,
      cut = null;
    // 自動的小細節一塊一塊消失（不拋：細長的零件拋出來很怪，改噴同色的碎板）；標出的區域與切掉的上段整塊拋出
    const fineOut = (c, fine) => (fine && (s >= 2 || cellHash(c, 2.5) < 0.5) ? 2 : 0);
    if (s < 3)
      pred = boxes ? (c, m, fine) => (inB(c) ? 1 : fineOut(c, fine)) : (c, m, fine) => fineOut(c, fine);
    else {
      const ch = cutHeight(g);
      cut = p.noCut ? null : ch !== null ? ch : H > 4.5 ? sh.y0 + H * 0.62 : null;
      pred = (c, m, fine) => (inB(c) || (cut !== null && c.y > cut) ? (fine ? 2 : 1) : fineOut(c, fine));
    }
    const W = sh.x1 - sh.x0,
      D = sh.z1 - sh.z0;
    const size = Math.cbrt(W * D * Math.max(1, H));
    const r = splitTris(g, pred, {
      cell: Math.max(1.5, Math.min(7, size / 2.5)),
      max: quiet ? 0 : 6,
      keepOut: quiet,
      clipTop: cut !== null ? cut : undefined,
    });
    if (cut !== null) {
      this.world.propCut(p, cut);
      this.propCrowdDown(p, cut);
    }
    if (quiet) return;
    if (!r.pieces.length) {
      this.propShards(p, s === 1 ? (r.n ? 2 : 0) : s === 2 ? 2 : 4);
      if (!r.n) return;
    } else if (s < 3) this.propShards(p, 1);
    const fx = this.fx,
      c = p.center(),
      M = PMAT[p.mat] || PMAT.metal;
    this.propFling(p, r.pieces);
    local(fx, () => {
      const q = new THREE.Vector3(c.x, cut !== null ? cut : sh.y1, c.z);
      if (M.spark) fx.streaks(q, 8, 0xffe090, 12, 0.35, 26);
      if (cut !== null || s >= 2)
        fx.dust(q, Math.max(1.5, Math.min(5, size * 0.3)), 8, M.col !== undefined ? M.col : 0x9aa0a8);
    });
  },
  // 依階段的受損姿勢（第 7 期）：燈桿、天線、樹往一邊歪（彎折），車輛第 3 階段爆胎往一邊傾；繞底部中心轉，碰撞不變
  propPose(p, st) {
    const g = p.ob.group;
    if (!g || g.parent !== this.scene) return;
    const ang = POSE_LEAN.has(p.kind)
      ? [0, 0, 0.09, 0.16][st]
      : POSE_TILT.has(p.kind)
        ? [0, 0, 0, 0.07][st]
        : 0;
    if (!ang) return;
    if (!p.pose0) p.pose0 = { pos: g.position.clone(), q: g.quaternion.clone() };
    const sh = p.shape0 || p.shape;
    const B = new THREE.Vector3((sh.x0 + sh.x1) / 2, sh.y0, (sh.z0 + sh.z1) / 2);
    const a = hash3(p.idx, 3, 7) * Math.PI * 2;
    const ql = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), ang);
    g.position.copy(p.pose0.pos).sub(B).applyQuaternion(ql).add(B);
    g.quaternion.copy(ql).multiply(p.pose0.q);
  },
  // 模型庫的重損 GLB（prop/dmg_<類>）：第 3 階段時換上（原本的網格隱藏，GLB 縮放到原本的外框）
  propDmgGlb(p) {
    const g = p.ob.group;
    const slot = WRECK_SLOT[p.kind];
    if (!g || !slot || p.dmgGlb) return;
    const obj = providedModel('prop/dmg_' + slot, null, true);
    if (!obj) return;
    g.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(g);
    if (b.isEmpty()) return;
    const sz = b.getSize(new THREE.Vector3());
    obj.updateMatrixWorld(true);
    const ob = new THREE.Box3().setFromObject(obj);
    const os = ob.getSize(new THREE.Vector3());
    obj.scale.multiply(
      new THREE.Vector3(
        sz.x / Math.max(0.01, os.x),
        sz.y / Math.max(0.01, os.y),
        sz.z / Math.max(0.01, os.z),
      ),
    );
    obj.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(obj);
    obj.position.add(b.getCenter(new THREE.Vector3()).sub(b2.getCenter(new THREE.Vector3())));
    for (const c of g.children) c.visible = false;
    this.scene.add(obj);
    g.attach(obj);
    obj.visible = true;
    p.dmgGlb = obj;
  },
  propActivate(p) {
    const A = this.propActive || (this.propActive = []);
    if (!A.includes(p)) A.push(p);
  },
  // 焦黑：頂點色依位置一塊一塊變暗（類別材質的物件，不用複製材質）；沒有頂點色的網格複製一份材質再變暗
  propChar(p, k) {
    const g = p.ob.group;
    if (!g) return;
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh || !o.geometry || isOutline(o.material)) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      let geo = o.geometry;
      if (geo.attributes.color && ms[0] && ms[0].vertexColors) {
        const own = GEO_OWNER.get(geo);
        if (own && own !== p) {
          geo = o.geometry = geo.clone();
          CH0.delete(geo);
        }
        GEO_OWNER.set(geo, p);
        const ca = geo.attributes.color;
        let c0 = CH0.get(geo);
        if (!c0) CH0.set(geo, (c0 = Float32Array.from(ca.array)));
        const pos = geo.attributes.position,
          arr = ca.array,
          is = ca.itemSize;
        for (let i = 0; i < ca.count; i++) {
          // 粗的格子（約 1.6 m）一塊一塊：門檻以上的格子接近全黑，其他整體稍微變暗
          const n = hash3(
            Math.floor(pos.getX(i) * 0.6),
            Math.floor(pos.getY(i) * 0.6),
            Math.floor(pos.getZ(i) * 0.6),
          );
          const soot = Math.min(1, Math.max(0, (n - (1 - k * 1.25)) * 4));
          const kk = Math.min(0.9, k * 0.3 + soot * 0.82);
          for (let j = 0; j < 3; j++) arr[i * is + j] = c0[i * is + j] * (1 - kk);
        }
        ca.needsUpdate = true;
        return;
      }
      // 沒有頂點色：材質各自一份（淡出用的材質清單一起換掉）
      const M = p.ownMats || (p.ownMats = new Map());
      let rec = M.get(o);
      if (!rec) {
        const cl = ms.map((m) => {
          const c = m.clone();
          for (const ob of p.obs || [p.ob]) {
            const i = ob.mats ? ob.mats.indexOf(m) : -1;
            if (i >= 0) ob.mats[i] = c;
          }
          return c;
        });
        o.material = Array.isArray(o.material) ? cl : cl[0];
        rec = cl.map((m) => ({ m, c0: m.color ? m.color.clone() : null }));
        M.set(o, rec);
      }
      for (const r of rec) if (r.c0) r.m.color.copy(r.c0).multiplyScalar(1 - k * 0.8);
    });
  },
  // 碎板：從物件表面噴出同色（依材質）的碎片
  propShards(p, n) {
    const fx = this.fx,
      sh = p.shape;
    if (!fx || fx.skip(p.center(), 6)) return;
    const M = PMAT[p.mat] || PMAT.metal;
    const col = propDebrisCol(p, true);
    const W = sh.x1 - sh.x0,
      D = sh.z1 - sh.z0,
      H = sh.y1 - sh.y0;
    const S = Math.max(0.35, Math.min(2.2, Math.cbrt(W * D * H) * 0.12));
    const c = p.center();
    for (let i = 0; i < n; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.85,
        flatShading: true,
        transparent: true,
      });
      mat.userData.op0 = 1;
      const o = new THREE.Mesh(SHARD_GEO, mat);
      o.scale.setScalar(S * (0.6 + Math.random() * 0.7));
      o.castShadow = true;
      o.position.set(
        sh.x0 + Math.random() * W,
        sh.y0 + H * (0.45 + Math.random() * 0.5),
        sh.z0 + Math.random() * D,
      );
      this.scene.add(o);
      const out = o.position.clone().sub(c).setY(0);
      if (out.lengthSq() < 0.01) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      out.normalize().multiplyScalar(3 + Math.random() * 5);
      fling(fx, this.world, o, out.add(new THREE.Vector3(0, 5 + Math.random() * 4, 0)), 4);
      if (M.spark) local(fx, () => fx.streaks(o.position.clone(), 5, 0xffe090, 10, 0.3, 26));
    }
    if (M.fx === 'dust')
      local(fx, () => fx.dust(new THREE.Vector3(c.x, sh.y1 - H * 0.2, c.z), Math.min(3, S * 1.5), 6, M.col));
  },
  // 損毀之後：殘骸繼續燒（可燃）或冒煙／揚塵一陣子
  propWreckFx(p) {
    const M = PMAT[p.mat] || PMAT.metal;
    p.wreckT = M.fire ? WRECK_BURN : WRECK_SMOKE;
    this.propActivate(p);
  },
  // 每格（renderMain）：受擊閃光的還原、持續效果（特效時鐘前進時才產生：暫停時不動）
  propDmgTick() {
    const fx = this.fx,
      w = this.world;
    if (!fx || !w) return;
    if (this.propFlashing && this.propFlashing.size) {
      const now = performance.now();
      for (const p of this.propFlashing)
        if (now >= p.flashUntil) {
          for (const m of p.ob.mats || []) if (m.emissive) m.emissive.copy(m.userData.emis0 || BLACK);
          this.propFlashing.delete(p);
        }
    }
    if (this.propW !== w) {
      this.propW = w;
      this.propActive = [];
      this.propT = fx.time;
      this.roofHp = {};
      this.roofGone = [];
      // 出生點：局部打穿避開（segProtected）
      w.protect = (w.protect || []).concat(
        (this.players || [this.player]).filter(Boolean).map((p) => p.pos.clone()),
      );
    }
    const dt = fx.time - this.propT;
    this.propT = fx.time;
    const A = this.propActive;
    if (!(dt > 0) || dt > 0.5 || !A || !A.length) return;
    const cam = this.camera.position,
      near = NEAR * (fx.k || 1);
    // 殘骸的時間到了就不再演出
    for (let i = A.length - 1; i >= 0; i--) {
      const p = A[i];
      if (p.dead) {
        p.wreckT = (p.wreckT || 0) - dt;
        if (p.wreckT <= 0) A.splice(i, 1);
      }
    }
    const list = A.filter((p) => p.center().distanceToSquared(cam) < near * near);
    if (list.length > MAX_ACTIVE) {
      list.sort((a, b) => a.pos.distanceToSquared(cam) - b.pos.distanceToSquared(cam));
      list.length = MAX_ACTIVE;
    }
    local(fx, () => {
      for (const p of list) this.propEmit(p, dt);
    });
  },
  // 一個物件這一格的持續效果（依材質；只有 fire 的材質起火）
  propEmit(p, dt) {
    const fx = this.fx,
      sh = p.shape,
      M = PMAT[p.mat] || PMAT.metal;
    const dead = p.dead;
    const st = dead ? 4 : p.st || 0;
    const W = sh.x1 - sh.x0,
      D = sh.z1 - sh.z0;
    const top = dead && p.wreck ? p.wreck.top : sh.y1;
    const S = Math.max(0.6, Math.min(2.4, Math.sqrt(W * D) * 0.18));
    const pt = () =>
      new THREE.Vector3(
        sh.x0 + W * (0.2 + Math.random() * 0.6),
        top - 0.2,
        sh.z0 + D * (0.2 + Math.random() * 0.6),
      );
    const burning = M.fire && (st >= 3 || (dead && p.wreckT > 4));
    const S2 = (p.fxAcc = p.fxAcc || { sm: 0, sp: 0, fi: 0 });
    S2.sm += dt * (st >= 3 ? 6 : 3.5) * (dead ? 0.8 : 1);
    S2.sp += dt * (st >= 3 ? 3 : 1.5);
    S2.fi += dt * 7;
    while (S2.sm >= 1) {
      S2.sm -= 1;
      const q = pt();
      switch (M.fx) {
        case 'dust':
          fx.smoke(q, S * 0.8, M.col !== undefined ? M.col : 0x9a958a, 1.2, 1.2);
          break;
        case 'ice':
          fx.smoke(q, S * 0.7, 0xdfeef6, 1.0, 0.9);
          break;
        case 'steam':
          fx.ambient('steam', q);
          break;
        case 'coral':
          if (Math.random() < 0.5) fx.streaks(q, 3, 0xff3040, 4, 0.6, -5);
          break;
        default:
          fx.smoke(
            q,
            S * (st >= 3 || burning ? 1.15 : 0.8),
            st >= 3 || burning ? 0x1c1c1e : 0x3c3c40,
            1.6,
            2.6,
          );
      }
    }
    while (S2.sp >= 1) {
      S2.sp -= 1;
      if (dead) continue;
      const q = pt();
      if (M.fx === 'spark' || (M.spark && st >= 3)) {
        fx.streaks(q, 5, 0xffd070, 9, 0.3, 26);
        if (M.fx === 'spark' && Math.random() < 0.4) fx.flash(q, 0.45, 0x9fd8ff, 0.08);
      } else if (M.fx === 'dust' && st >= 2)
        fx.dust(q, Math.min(2.2, S), 4, M.col !== undefined ? M.col : 0x9a958a);
    }
    if (burning)
      fx.glow(
        p,
        new THREE.Vector3((sh.x0 + sh.x1) / 2, top, (sh.z0 + sh.z1) / 2),
        Math.min(1.6, 0.6 + S * 0.4),
      );
    while (S2.fi >= 1) {
      S2.fi -= 1;
      if (!burning) continue;
      // 火舌往上竄（第 8.2 期，docs/vfx-design.md；以前是圓形的光點）
      fx.fire(pt(), Math.min(1.6, 0.45 + S * 0.35), 0.12);
    }
  },
  // ---------- 承重柱與倒塌（docs/destruction-design.md 第 4 期）----------
  // 承重柱壞了：結構底部那一區的三角形碎掉拋出、揚塵（quiet＝只拿掉）
  propSupportDown(p, quiet) {
    const g = p.ob.group;
    if (!g) return;
    const sb = p.ob.box.clone().expandByScalar(0.3);
    const sh = p.shape;
    const size = Math.cbrt((sh.x1 - sh.x0) * (sh.z1 - sh.z0) * Math.max(1, sh.y1 - sh.y0));
    const r = splitTris(g, (c) => (sb.containsPoint(c) ? 1 : 0), {
      cell: Math.max(1.5, Math.min(5, size / 2)),
      max: quiet ? 0 : 5,
      keepOut: quiet,
    });
    if (quiet || !this.fx) return;
    this.propFling(p, r.pieces);
    const c = p.center();
    const M = PMAT[p.of.mat] || PMAT.metal;
    local(this.fx, () => {
      this.fx.dust(
        new THREE.Vector3(c.x, sh.y0 + 0.3, c.z),
        Math.max(2, Math.min(6, size * 0.4)),
        10,
        M.col !== undefined ? M.col : 0x9aa0a8,
      );
      this.fx.explosion(c, Math.max(1.5, size * 0.25), M.fire ? 0xffa040 : 0xc0b090, false);
    });
    SFX.netDepth++;
    try {
      SFX.wreck(c);
    } finally {
      SFX.netDepth--;
    }
  },
  // 倒下的方向（0 +X、1 −X、2 +Z、3 −Z）：最接近最後一擊的方向，倒下後的頂端要在場地裡
  propFallDir(b, dir) {
    const w = this.world,
      bb = b.base;
    const H = bb.max.y - bb.min.y;
    const cx = (bb.min.x + bb.max.x) / 2,
      cz = (bb.min.z + bb.max.z) / 2;
    let best = 0,
      bs = -1e9;
    FALL_DIRS.forEach(([dx, dz], i) => {
      const half = dx ? (bb.max.x - bb.min.x) / 2 : (bb.max.z - bb.min.z) / 2;
      const tx = cx + dx * (half + H),
        tz = cz + dz * (half + H);
      let sc = dir ? dir.x * dx + dir.z * dz : -i * 0.01;
      if (Math.abs(tx) > w.limOut - 2 || Math.abs(tz) > w.limOut - 2) sc -= 10;
      if (sc > bs) {
        bs = sc;
        best = i;
      }
    });
    return best;
  },
  // 結構倒下：預警帶 1.5 秒、晃動 → 以底邊為軸倒下（真的模型轉將近 90°）→ 落地時預警帶裡的機體受到爆發傷害、
  // 地圖物件受傷、小人死亡 → 換成橫躺的碰撞（矮的方塊）。quiet＝直接躺好（重連、血量表）
  propCollapse(b, di, quiet) {
    if (b.collapsed) return;
    const w = this.world,
      fx = this.fx;
    b.collapsed = true;
    b.dead = true;
    b.hp = 0;
    b.colDir = di;
    // 承重的一起拿掉（共用的支柱：撐著的格子都倒了才拿掉）
    for (const q of b.sup)
      if (!q.dead && (q.ofs || [q.of]).every((x) => x === b || x.collapsed))
        w.destroyProp(q, null, { quiet: true });
    for (const ob of b.obs) {
      const i = w.obstacles.indexOf(ob);
      if (i >= 0) w.obstacles.splice(i, 1);
      const j = w.occluders.indexOf(ob);
      if (j >= 0) w.occluders.splice(j, 1);
    }
    const bb = b.base;
    const [dx, dz] = FALL_DIRS[di] || FALL_DIRS[0];
    const H = bb.max.y - bb.min.y;
    const half = dx ? (bb.max.x - bb.min.x) / 2 : (bb.max.z - bb.min.z) / 2;
    const cx = (bb.min.x + bb.max.x) / 2,
      cz = (bb.min.z + bb.max.z) / 2;
    const px = cx + dx * half,
      pz = cz + dz * half,
      y0 = bb.min.y;
    const g = b.ob.group;
    this.propRampsOff(b);
    // 甲板：掉到地上；寬的建築與上面站得了東西的：往下塌成瓦礫堆（像控制爆破）；細高的（高 > 寬 × 1.5）才整個倒下
    if (b.mode === 'drop') return this.propDrop(b, quiet);
    if (b.forceSink || H <= Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 1.5)
      return this.propSink(b, quiet);
    // 模型掛在底邊的樞軸上（保留世界座標）
    const piv = new THREE.Object3D();
    piv.position.set(px, y0, pz);
    this.scene.add(piv);
    piv.updateMatrixWorld(true);
    if (g) piv.attach(g);
    b.piv = piv;
    const axis = new THREE.Vector3(0, 1, 0).cross(new THREE.Vector3(dx, 0, dz)).normalize();
    const A = (Math.PI / 2) * 0.94;
    // 橫躺的範圍：沿倒下的方向長 H、寬＝原本另一個方向的寬，高＝原本沿倒下方向的厚度（最多 7 m）
    const a0 = dx ? px : pz,
      a1 = a0 + (dx || dz) * H;
    const [p0, p1] = dx ? [bb.min.z, bb.max.z] : [bb.min.x, bb.max.x];
    const X0 = dx ? Math.min(a0, a1) : p0,
      X1 = dx ? Math.max(a0, a1) : p1,
      Z0 = dx ? p0 : Math.min(a0, a1),
      Z1 = dx ? p1 : Math.max(a0, a1);
    const top = y0 + Math.max(1, Math.min(half * 2 * 0.9, 7));
    const lie = {
      kind: 'box',
      x: (X0 + X1) / 2,
      z: (Z0 + Z1) / 2,
      w: X1 - X0,
      d: Z1 - Z0,
      y: y0 - 0.5,
      top,
      group: piv,
      mats: [],
      box: new THREE.Box3(new THREE.Vector3(X0, y0 - 0.5, Z0), new THREE.Vector3(X1, top, Z1)),
      wreck: b,
    };
    const mid = new THREE.Vector3(lie.x, y0, lie.z);
    const land = (loud) => {
      piv.quaternion.setFromAxisAngle(axis, A);
      w.obstacles.push(lie);
      b.wreck = lie;
      b.landed = true;
      if (!loud || !fx) return;
      local(fx, () => {
        const n = Math.max(3, Math.min(8, Math.round(H / 8)));
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const x = px + dx * H * t,
            z = pz + dz * H * t;
          fx.dust(
            new THREE.Vector3(x, w.groundAt(x, z, top + 2) + 0.2, z),
            Math.max(3, Math.min(9, (X1 - X0 + Z1 - Z0) * 0.12)),
            12,
            0xa09a90,
          );
        }
        fx.shockwave(mid.clone().setY(y0 + 0.2), Math.min(30, H * 0.6), 0xd8c8a8, 0.6);
      });
      SFX.netDepth++;
      try {
        SFX.explode(true, mid);
        SFX.wreck(mid);
      } finally {
        SFX.netDepth--;
      }
      this.rumbleAt(mid, 0.9, 0.7, 380, H + 40);
      if (!(this.net && this.net.role === 'client')) this.propFallHit(b, lie, H, dx, dz);
    };
    this.propWreckFx(b);
    if (quiet || !fx) return land(false);
    // 預警：倒下的範圍
    local(fx, () => fx.warnRect(mid.clone().setY(y0 + 0.05), 0, X1 - X0, Z1 - Z0, WARN_T + FALL_T, 0xff3020));
    const T = WARN_T + FALL_T;
    fx.task(
      T,
      (e, t) => {
        const tt = t * T;
        if (tt < WARN_T) {
          // 晃動
          piv.quaternion.setFromAxisAngle(axis, 0.012 * Math.sin(tt * 26) * (tt / WARN_T));
        } else {
          const f = (tt - WARN_T) / FALL_T;
          piv.quaternion.setFromAxisAngle(axis, A * f * f);
        }
      },
      () => land(true),
    );
  },
  // 往下塌：預警（範圍＝外框再往外 4 m）、晃動 → 往下壓扁並沉下去（大量揚塵蓋住）→ 換成殘骸（prop-wreck.js）與殘骸的碰撞；
  // 屋頂上與旁邊的機體受到爆發傷害
  propSink(b, quiet) {
    const w = this.world,
      fx = this.fx,
      bb = b.base;
    const H = bb.max.y - bb.min.y;
    const cx = (bb.min.x + bb.max.x) / 2,
      cz = (bb.min.z + bb.max.z) / 2,
      y0 = bb.min.y;
    const g = b.ob.group;
    const piv = new THREE.Object3D();
    piv.position.set(cx, y0, cz);
    this.scene.add(piv);
    piv.updateMatrixWorld(true);
    if (g) piv.attach(g);
    b.piv = piv;
    // 殘骸用倒塌前的整個外形
    b.shape0 = { x0: bb.min.x, x1: bb.max.x, z0: bb.min.z, z1: bb.max.z, y0, y1: bb.max.y };
    b.sank = true;
    const land = (loud) => {
      piv.visible = false;
      const ob = w.addWreck(b);
      b.landed = true;
      if (!loud || !fx) return;
      const R = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      local(fx, () => {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          fx.dust(
            new THREE.Vector3(cx + Math.cos(a) * R * 0.4, y0 + 0.3, cz + Math.sin(a) * R * 0.4),
            Math.max(4, Math.min(10, R * 0.2)),
            12,
            0xa09a90,
          );
        }
        fx.shockwave(new THREE.Vector3(cx, y0 + 0.2, cz), Math.min(40, R * 1.1), 0xd8c8a8, 0.7);
      });
      SFX.netDepth++;
      try {
        SFX.explode(true, ob.box.getCenter(new THREE.Vector3()));
        SFX.wreck(new THREE.Vector3(cx, y0, cz));
      } finally {
        SFX.netDepth--;
      }
      this.rumbleAt(new THREE.Vector3(cx, y0, cz), 0.9, 0.7, 420, R + 50);
      if (!(this.net && this.net.role === 'client')) {
        const box = new THREE.Box3(
          new THREE.Vector3(bb.min.x - 4, y0 - 1, bb.min.z - 4),
          new THREE.Vector3(bb.max.x + 4, bb.max.y + 6, bb.max.z + 4),
        );
        const lie = { box, x: cx, z: cz, w: box.max.x - box.min.x, d: box.max.z - box.min.z };
        this.propFallHit(b, lie, H, 0, 0);
      }
    };
    this.propWreckFx(b);
    if (quiet || !fx) return land(false);
    local(fx, () =>
      fx.warnRect(
        new THREE.Vector3(cx, y0 + 0.05, cz),
        0,
        bb.max.x - bb.min.x + 8,
        bb.max.z - bb.min.z + 8,
        WARN_T + SINK_T,
        0xff3020,
      ),
    );
    const T = WARN_T + SINK_T;
    let acc = 0;
    fx.task(
      T,
      (e, t, dt) => {
        const tt = t * T;
        if (tt < WARN_T) {
          piv.rotation.z = 0.006 * Math.sin(tt * 31) * (tt / WARN_T);
          return;
        }
        const f = (tt - WARN_T) / SINK_T;
        piv.scale.y = Math.max(0.06, 1 - 0.94 * f * f);
        piv.rotation.z = 0.04 * f;
        // 塌下去的時候四周不斷揚起粉塵
        acc += dt;
        if (acc > 0.12) {
          acc = 0;
          local(fx, () => {
            const a = Math.random() * Math.PI * 2;
            const R = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 0.5;
            fx.smoke(
              new THREE.Vector3(
                cx + Math.cos(a) * R,
                y0 + H * piv.scale.y * Math.random(),
                cz + Math.sin(a) * R,
              ),
              Math.max(3, R * 0.35),
              0x9a958c,
              2.4,
              2,
            );
          });
        }
      },
      () => land(true),
    );
  },
  // 接著它的坡道一起拿掉（碰撞與模型）
  propRampsOff(b) {
    const R = this.world.ramps;
    for (const r of b.ramps || []) {
      const i = R ? R.indexOf(r) : -1;
      if (i >= 0) R.splice(i, 1);
      if (r.mesh) r.mesh.visible = false;
    }
  },
  // 甲板掉下來（docs/destruction-design.md 第 5 期）：預警（甲板底下的地面）、晃動 → 往下掉到地上（稍微傾斜）→
  // 換成平放的碰撞（低的方塊，機甲走得上去）；上面的物件摔壞、站在上面的機體跟著掉、底下的受到爆發傷害
  propDrop(b, quiet) {
    const w = this.world,
      fx = this.fx,
      bb = b.base;
    const cx = (bb.min.x + bb.max.x) / 2,
      cz = (bb.min.z + bb.max.z) / 2;
    const yTop = b.ob.top !== undefined ? b.ob.top : bb.max.y;
    const thick = Math.max(0.5, yTop - bb.min.y);
    // 掉到的地面（甲板的碰撞已經拿掉）：中央的地面（橋掉進底下的河道、壕溝；兩端埋進岸邊）
    const gy = w.groundAt(cx, cz, bb.min.y);
    const drop = Math.max(0, bb.min.y - gy);
    const g = b.ob.group;
    const piv = new THREE.Object3D();
    piv.position.set(cx, bb.min.y, cz);
    this.scene.add(piv);
    piv.updateMatrixWorld(true);
    if (g) piv.attach(g);
    b.piv = piv;
    // 放在甲板上的物件跟著掉（落地時摔壞，propFallHit）
    for (const q of w.props || []) {
      if (q.dead || q.of === b || q === b || !q.ob.group || q.ob.group === g) continue;
      const sh = q.shape;
      if (sh.x1 < bb.min.x || sh.x0 > bb.max.x || sh.z1 < bb.min.z || sh.z0 > bb.max.z) continue;
      if (Math.abs(sh.y0 - yTop) < 1.5) piv.attach(q.ob.group);
    }
    const tilt = (b.idx % 2 ? 1 : -1) * 0.05;
    const top = gy + Math.min(thick, 2.5);
    const lie = {
      kind: 'box',
      x: cx,
      z: cz,
      w: bb.max.x - bb.min.x,
      d: bb.max.z - bb.min.z,
      y: gy - 0.5,
      top,
      group: piv,
      mats: [],
      box: new THREE.Box3(
        new THREE.Vector3(bb.min.x, gy - 0.5, bb.min.z),
        new THREE.Vector3(bb.max.x, top, bb.max.z),
      ),
      wreck: b,
    };
    const place = (f) => {
      piv.position.y = bb.min.y - drop * f;
      if (bb.max.x - bb.min.x >= bb.max.z - bb.min.z) piv.rotation.x = tilt * f;
      else piv.rotation.z = tilt * f;
    };
    const land = (loud) => {
      place(1);
      w.obstacles.push(lie);
      b.wreck = lie;
      b.landed = true;
      if (!loud || !fx) return;
      const R = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
      local(fx, () => {
        const n = Math.max(2, Math.min(6, Math.round(R / 15)));
        const ax = bb.max.x - bb.min.x >= bb.max.z - bb.min.z;
        for (let i = 0; i <= n; i++) {
          const t = i / n - 0.5;
          fx.dust(
            new THREE.Vector3(cx + (ax ? t * R : 0), gy + 0.3, cz + (ax ? 0 : t * R)),
            Math.max(3, Math.min(8, R * 0.12)),
            12,
            0xa09a90,
          );
        }
      });
      SFX.netDepth++;
      try {
        SFX.explode(true, new THREE.Vector3(cx, gy, cz));
        SFX.wreck(new THREE.Vector3(cx, gy, cz));
      } finally {
        SFX.netDepth--;
      }
      this.rumbleAt(new THREE.Vector3(cx, gy, cz), 0.9, 0.6, 360, R + 40);
      if (!(this.net && this.net.role === 'client')) {
        const box = new THREE.Box3(
          new THREE.Vector3(bb.min.x - 2, gy - 1, bb.min.z - 2),
          new THREE.Vector3(bb.max.x + 2, bb.max.y + 6, bb.max.z + 2),
        );
        this.propFallHit(
          b,
          { box, x: cx, z: cz, w: box.max.x - box.min.x, d: box.max.z - box.min.z },
          Math.max(8, drop + 8),
          0,
          0,
        );
      }
    };
    this.propWreckFx(b);
    if (quiet || !fx || drop < 0.3) return land(!quiet && !!fx);
    local(fx, () =>
      fx.warnRect(
        new THREE.Vector3(cx, gy + 0.05, cz),
        0,
        bb.max.x - bb.min.x + 4,
        bb.max.z - bb.min.z + 4,
        WARN_T + DROP_T,
        0xff3020,
      ),
    );
    const T = WARN_T + DROP_T;
    fx.task(
      T,
      (e, t) => {
        const tt = t * T;
        if (tt < WARN_T) {
          piv.position.y = bb.min.y - 0.05 * Math.abs(Math.sin(tt * 23)) * (tt / WARN_T);
          return;
        }
        const f = (tt - WARN_T) / DROP_T;
        place(f * f);
      },
      () => land(true),
    );
  },
  // 倒下壓到的：機體受到爆發傷害（衝擊大、會失衡）、地圖物件受傷、小人死亡（房主／單機）
  propFallHit(b, lie, H, dx, dz) {
    const dmg = Math.max(2000, Math.min(6000, H * 160));
    const dir = new THREE.Vector3(dx, 0, dz);
    const box = lie.box.clone().expandByScalar(1.5);
    box.max.y += 4;
    for (const m of this.crowdMechs()) {
      if (!box.containsPoint(m.pos)) continue;
      m.takeDamage(dmg, 1500, null, m.pos.clone(), dir.clone(), undefined, undefined, 'exp');
    }
    for (const q of this.world.props || []) {
      if (q.dead || q === b || q.of === b) continue;
      const sh = q.shape;
      if (sh.x1 < box.min.x || sh.x0 > box.max.x || sh.z1 < box.min.z || sh.z0 > box.max.z) continue;
      if (sh.y0 > box.max.y) continue;
      // 放在上面的（甲板、屋頂上）跟著掉下來摔壞
      if (b.base && sh.y0 > b.base.max.y - 2.5) this.propDamage(q, 1e7, 0, q.center(), null, 'none');
      else this.propDamage(q, dmg * 2, 0, q.center(), null, 'exp');
    }
    if (this.crowd && this.crowdBlast) {
      const n = Math.max(2, Math.round(H / 10));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const c = new THREE.Vector3(
          lie.x + dx * (t - 0.5) * lie.w,
          lie.box.min.y + 1,
          lie.z + dz * (t - 0.5) * lie.d,
        );
        this.crowdBlast(c, Math.max(lie.w, lie.d) / n + 3, null);
      }
    }
  },
  // 切出來的塊拋出去（第 2 期的 propTier 與承重柱共用）
  propFling(p, pieces) {
    const fx = this.fx,
      c = p.center();
    for (const pc of pieces) {
      if (pc.n < 10) continue; // 很小的碎片（細長的零件）拋出來很怪
      const mat = pc.mat.clone();
      mat.transparent = true;
      mat.userData.op0 = mat.opacity;
      const o = new THREE.Mesh(pc.geo, mat);
      o.position.copy(pc.at);
      o.castShadow = true;
      this.scene.add(o);
      const big = pc.geo.boundingSphere.radius > 3;
      const out = pc.at.clone().sub(c).setY(0);
      if (out.lengthSq() < 0.01) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      out.normalize().multiplyScalar(big ? 1 + Math.random() * 2 : 3 + Math.random() * 4);
      out.y = big ? 1 + Math.random() * 2 : 4 + Math.random() * 4;
      fling(fx, this.world, o, out, big ? 6 : 4.5);
    }
  },
  // ---------- 巨型結構的局部打穿（docs/destruction-design.md 第 6 期）----------
  // 出生點、出口與補給台（campRing）、目標物與護送車隊附近的只受損：打穿會讓那裡到不了
  segProtected(p) {
    const w = this.world,
      sh = p.shape;
    const near = (x, z) => {
      const dx = Math.max(sh.x0 - x, 0, x - sh.x1),
        dz = Math.max(sh.z0 - z, 0, z - sh.z1);
      return dx * dx + dz * dz < SEG_SAFE * SEG_SAFE;
    };
    for (const q of w.protect || []) if (near(q.x, q.z)) return true;
    for (const e of this.enemies || [])
      if (!e.dead && (e.ai === 'objective' || e.ai === 'convoy') && near(e.pos.x, e.pos.z)) return true;
    for (const e of this.allies || [])
      if (!e.dead && (e.ai === 'objective' || e.ai === 'convoy') && near(e.pos.x, e.pos.z)) return true;
    return false;
  },
  // 一段打穿（quiet＝只套結果：重連、血量表）
  propSegDown(p, quiet) {
    const w = this.world,
      fx = this.fx;
    const sh = p.shape;
    const box = new THREE.Box3(
      new THREE.Vector3(sh.x0, sh.y0, sh.z0),
      new THREE.Vector3(sh.x1, sh.y1, sh.z1),
    );
    const big = box.clone().expandByScalar(0.4);
    if (p.seg === 'dam') {
      // 壩體的扶壁、上下游面在碰撞的厚度之外：深度方向放寬
      big.min.z -= 12;
      big.max.z += 12;
    }
    const size = Math.cbrt((sh.x1 - sh.x0) * (sh.z1 - sh.z0) * Math.max(1, sh.y1 - sh.y0));
    const pieces = [];
    const cut = (root) => {
      if (!root) return;
      const r = splitTris(root, (c) => (big.containsPoint(c) ? 1 : 0), {
        cell: Math.max(2, Math.min(7, size / 2.5)),
        max: quiet ? 0 : 5,
        keepOut: quiet,
      });
      pieces.push(...r.pieces);
    };
    if (p.seg === 'rim') for (const m of p.meshes || []) cut(m);
    else cut(p.ob.group);
    if (p.seg === 'dam') {
      w.damBreach(p);
      // 放在這一段上面的物件（壩頂的機房、路燈…）掉下來摔壞
      if (!(this.net && this.net.role === 'client'))
        for (const q of w.props || []) {
          if (q.dead || q.seg || q === p) continue;
          const s2 = q.shape;
          const cx = (s2.x0 + s2.x1) / 2,
            cz = (s2.z0 + s2.z1) / 2;
          if (cx < sh.x0 || cx > sh.x1 || cz < sh.z0 - 1 || cz > sh.z1 + 1 || s2.y0 < sh.y1 - 2) continue;
          this.propDamage(q, 1e7, 0, q.center(), null, 'none');
        }
    }
    // 殘骸：壩體的缺口底部與隧道口前面的岩塊（低的瓦礫，機甲走得過去）；平台外緣的掉進虛空
    if (!p.noWreckSeg) {
      if (p.seg === 'tunnel') p.mat = 'rock';
      w.addWreck(p);
    }
    if (p.seg === 'tunnel' && p.ob.group) this.propChar(p, 0.5);
    this.propWreckFx(p);
    // 壩體打穿：上游有水時從缺口噴出水流（推走、受傷；所有人）
    if (p.seg === 'dam' && !(this.net && this.net.role === 'client') && w.dam && w.theme.water) {
      const up = w.dam.up || 1;
      if (w.theme.water.level > sh.y0 + 1) {
        this.addFlow({
          x: (sh.x0 + sh.x1) / 2,
          z: w.dam.zc,
          dx: 0,
          dz: -up,
          len: 48 * w.k,
          hw: (sh.x1 - sh.x0) / 2,
          t: BREACH_FLOW_T,
          dps: 90,
          team: 'all',
        });
      }
    }
    if (quiet || !fx) return;
    this.propFling(p, pieces);
    const c = box.getCenter(new THREE.Vector3());
    const M = PMAT[p.mat] || PMAT.metal;
    local(fx, () => {
      fx.dust(
        new THREE.Vector3(c.x, sh.y0 + 0.5, c.z),
        Math.max(3, Math.min(9, size * 0.5)),
        12,
        M.col !== undefined ? M.col : 0x9aa0a8,
      );
      fx.explosion(c, Math.max(2, size * 0.3), 0xc0b090, true);
      if (p.seg === 'tunnel') this.fx.shatterProp({ ...p, mat: 'rock', crushed: false }, w, {});
    });
    SFX.netDepth++;
    try {
      SFX.explode(true, c);
      SFX.wreck(c);
    } finally {
      SFX.netDepth--;
    }
    this.rumbleAt(c, 0.8, 0.6, 320, size + 40);
  },
  // 地下的岩頂（技研都市、礦坑的坑道網）：投射物打到岩頂的格子（房主／單機），血量打完就開洞
  roofDamage(pos, dmg, attr) {
    const w = this.world;
    if (this.destructMode() === 'off') return false; // 不可破壞：岩頂和以前一樣不擋子彈
    if (this.net && this.net.role === 'client') return true;
    const C = w.roofCell;
    const ix = Math.floor(pos.x / C),
      iz = Math.floor(pos.z / C);
    if (Math.abs(ix * C) > w.limOut + C || Math.abs(iz * C) > w.limOut + C) return true;
    const k = ix + ',' + iz;
    if ((this.roofGone || []).includes(k)) return false; // 已經是洞：穿過去
    const H = this.roofHp || (this.roofHp = {});
    if (H[k] === undefined) H[k] = ROOF_HP;
    const DM = DESTRUCT[this.destructMode()];
    H[k] -= dmg * Math.max(DM.floor, propAttrK('rock', attr)) * DM.k;
    if (H[k] <= 0) {
      this.netEv({ t: 'roofx', k });
      this.roofBreak(k, false);
    }
    return true;
  },
  // 岩頂開洞：拿掉那一格、落石、光柱照進來、地上留下岩塊
  roofBreak(k, quiet) {
    const w = this.world;
    const G = this.roofGone || (this.roofGone = []);
    if (G.includes(k) || !w.roofMesh) return;
    G.push(k);
    const C = w.roofCell;
    const [ix, iz] = k.split(',').map(Number);
    const x0 = ix * C,
      z0 = iz * C,
      cx = x0 + C / 2,
      cz = z0 + C / 2;
    splitTris(w.roofMesh, (c) => (c.x >= x0 && c.x < x0 + C && c.z >= z0 && c.z < z0 + C ? 1 : 0), {
      max: 0,
      keepOut: true,
    });
    // 光柱：從洞照到地上（加色、不寫深度）
    const gy = w.groundAt(cx, cz, w.roofLow);
    const h = w.roofY - gy;
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(C * 0.3, C * 0.42, h, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff0d0,
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    shaft.position.set(cx, gy + h / 2, cz);
    shaft.userData.noFade = true;
    this.scene.add(shaft);
    // 地上的岩塊（低的瓦礫）
    const ps = { x0: cx - C * 0.3, x1: cx + C * 0.3, z0: cz - C * 0.3, z1: cz + C * 0.3, y0: gy, y1: gy + 6 };
    const pseudo = {
      shape: ps,
      shape0: ps,
      mat: 'rock',
      col: 0x2a2622,
      idx: 900000 + (ix + 500) * 1000 + (iz + 500),
      lowWreck: true,
    };
    w.addWreck(pseudo);
    if (quiet || !this.fx) return;
    const fx = this.fx;
    const list = [];
    for (let i = 0; i < 14; i++) {
      const q = 1 + Math.random() * 2.5;
      list.push({
        geo: new THREE.DodecahedronGeometry(q, 0),
        pos: new THREE.Vector3(
          cx + (Math.random() - 0.5) * C * 0.6,
          w.roofLow - 2,
          cz + (Math.random() - 0.5) * C * 0.6,
        ),
        origin: new THREE.Vector3(cx, w.roofY + 10, cz),
        sp: 0.3,
      });
    }
    local(fx, () => {
      fx.propDebris(list, 0x3a342c, w, null);
      fx.dust(new THREE.Vector3(cx, gy + 0.5, cz), Math.min(9, C * 0.15), 14, 0x9a8f80);
      fx.explosion(new THREE.Vector3(cx, w.roofLow, cz), 4, 0xc0b090, true);
    });
    SFX.netDepth++;
    try {
      SFX.explode(true, new THREE.Vector3(cx, w.roofLow, cz));
      SFX.wreck(new THREE.Vector3(cx, gy, cz));
    } finally {
      SFX.netDepth--;
    }
  },
  // ---------- 其他系統（第 8 期）----------
  // Boss 場地的臨時掩體（game/hazards2.js）：和地圖物件同一套的焦黑與碎板
  twStage(W) {
    if (!(W.hpMax > 0) || !W.grp) return;
    const st = Math.min(3, propStage(W.hp, W.hpMax));
    if (st <= (W.st || 0)) return;
    W.st = st;
    const b = W.ob.box;
    const pp =
      W.pp ||
      (W.pp = {
        ob: { group: W.grp, mats: W.ob.mats },
        obs: [W.ob],
        shape: { x0: b.min.x, x1: b.max.x, z0: b.min.z, z1: b.max.z, y0: b.min.y, y1: b.max.y },
        mat: W.k === 'ice' ? 'ice' : W.k === 'crate' ? 'metal' : 'rock',
        col: 0x302c28,
        idx: W.i,
        center: () => b.getCenter(new THREE.Vector3()),
      });
    this.propChar(pp, PROP_CHAR[st]);
    if (this.fx) this.propShards(pp, st >= 3 ? 3 : 1);
  },
  // 地圖物件壞了、變矮了：站在上面的小人掉下來（高的摔死），旁邊的受驚逃開（房主／單機）
  propCrowdDown(p, cutY) {
    const C = this.crowd;
    if (!C || (this.net && this.net.role === 'client')) return;
    const sh = p.shape0 || p.shape,
      w = this.world;
    const cx = (sh.x0 + sh.x1) / 2,
      cz = (sh.z0 + sh.z1) / 2;
    const top = cutY !== undefined ? cutY : sh.y0 + 0.5;
    for (const h of C.list) {
      if (!h.alive) continue;
      const inside = h.x > sh.x0 - 0.5 && h.x < sh.x1 + 0.5 && h.z > sh.z0 - 0.5 && h.z < sh.z1 + 0.5;
      if (inside && h.y > top) {
        const g = w.groundAt(h.x, h.z, top);
        if (h.y - g > 4) this.crowdKill(h, null, 'blast');
        else h.y = g;
      } else if (Math.hypot(h.x - cx, h.z - cz) < Math.max(12, (sh.x1 - sh.x0 + sh.z1 - sh.z0) * 0.6))
        this.crowdScareOne(h, cx, cz);
    }
  },
  // ---------- 踩平（房主／單機）----------
  // 機甲（玩家、敵人、友軍、載具）在地上移動、腳的範圍碰到雜物（data/destruct.js 的 propCrushable）就直接變成殘骸：
  // 不算傷害數字與賞金，機甲稍微減速；客機收到帶 cr 的 propDie 自己演出
  propCrushTick() {
    const w = this.world;
    if (!w || !w.props || this.range || this.cine) return;
    const mode = this.destructMode();
    if (mode === 'off') return; // 不可破壞：不踩平
    if (this.crushW !== w || this.crushMode !== mode) {
      this.crushW = w;
      this.crushMode = mode;
      this.crushList = w.props.filter((p) => !p.dead && propCrushable(p, mode === 'easy'));
    }
    const L = this.crushList;
    if (!L.length) return;
    for (const m of this.crowdMechs()) {
      if (m.flying || !m.vel) continue;
      const v2 = m.vel.x * m.vel.x + m.vel.z * m.vel.z;
      if (v2 < 1) continue;
      // 碰到就算：比移動的碰撞半徑（radius × 0.8）大一點，所以推著雜物走也會踩壞
      const R = Math.max(this.crowdCrushR(m) + 0.3, (m.radius || 2) * 0.8 + 0.5);
      const x = m.pos.x,
        z = m.pos.z;
      for (let i = L.length - 1; i >= 0; i--) {
        const p = L[i];
        if (p.dead) {
          L.splice(i, 1);
          continue;
        }
        const sh = p.shape;
        // 到外形（水平）的距離；腳要在物件頂附近以下（站在高處的不算）
        const dx = Math.max(sh.x0 - x, 0, x - sh.x1),
          dz = Math.max(sh.z0 - z, 0, z - sh.z1);
        if (dx * dx + dz * dz > R * R || m.pos.y > sh.y1 + 1) continue;
        L.splice(i, 1);
        const dir = new THREE.Vector3(m.vel.x, 0, m.vel.z).normalize();
        this.propKill(p, dir, { cr: true });
        m.vel.x *= CRUSH_SLOW;
        m.vel.z *= CRUSH_SLOW;
        if (m === this.player) this.rumbleAt(p.center(), 0.25, 0.2, 90, 20);
      }
    }
  },
  // ---------- 多人同步 ----------
  // 房主：每次送快照前，把這一格血量有變的物件合併成一個事件
  propNetFlush() {
    const D = this.propDirty;
    if (!D || !D.size) return;
    const l = [];
    for (const p of D) if (!p.dead) l.push([p.idx, Math.round(p.hp)]);
    D.clear();
    if (l.length) this.netEv({ t: 'propHp', l });
  },
  // 房主：每 TABLE_DT 秒一份受損物件的血量表（[編號, 血量]，損毀的血量 ≤ 0、帶倒下的方向）
  propNetTable() {
    const now = performance.now() / 1000;
    if (this.propTblT && now - this.propTblT < TABLE_DT) return undefined;
    this.propTblT = now;
    const out = [];
    for (const p of (this.world && this.world.props) || [])
      if (p.collapsed) out.push([p.idx, 0, p.colDir]);
      else if (p.hp < p.maxHp && !p.genGone) out.push([p.idx, Math.round(p.hp)]);
    for (const k of this.roofGone || []) out.push(['r', k]); // 岩頂的洞
    return out;
  },
  // 客機：套用一個物件的血量（表或事件）；flash＝事件來的（閃一下）
  propApplyHp(i, h, flash, quiet, d) {
    const p = this.world && this.world.props && this.world.props[i];
    if (!p) return;
    if (p.body) {
      // 結構本體：倒下只看 pcol 或血量表的方向
      if (d !== undefined && d !== null) return this.propCollapse(p, d, true);
      if (h <= 0 || p.dead) return;
    } else if (h <= 0) {
      if (!p.dead) {
        p.hp = h;
        this.world.destroyProp(p, this.fx, { quiet: true });
        if (p.seg) this.propSegDown(p, true);
        else if (p.support && !p.sep) this.propSupportDown(p, true);
      }
      return;
    }
    if (p.dead) return;
    if (p.hp === h) return;
    p.hp = h;
    if (flash) this.propFlash(p);
    this.propStageCheck(p, quiet);
  },
  propApplyTable(t) {
    if (!Array.isArray(t)) return;
    for (const [i, h, d] of t) {
      if (i === 'r') this.roofBreak(h, true);
      else this.propApplyHp(i, h, false, true, d);
    }
  },
  // 客機：損毀的事件（各端自己演出碎裂與殘骸）
  propApplyDie(e) {
    const p = this.world && this.world.props && this.world.props[e.i];
    if (!p || p.dead) return;
    const dir = e.d ? new THREE.Vector3(e.d[0], 0, e.d[1]) : null;
    p.hp = Math.min(p.hp, 0);
    this.world.destroyProp(p, this.fx, { dir, cr: !!e.cr });
    if (p.seg) this.propSegDown(p, false);
    else if (p.support && !p.sep) this.propSupportDown(p, false);
    else this.propWreckFx(p);
  },
  // 客機：結構倒下的事件
  propApplyCollapse(e) {
    const p = this.world && this.world.props && this.world.props[e.i];
    if (p && p.body) this.propCollapse(p, e.d, false);
  },
});
