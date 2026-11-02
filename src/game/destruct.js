// Game 的 mixin：地圖物件的破壞（docs/destruction-design.md）——受傷（依材質的屬性倍率）、四段受損的外觀
// （焦黑、碎板、依材質的持續效果；只有可燃的起火）、完全損毀換成殘骸（world.destroyProp）、多人同步。
//   判定只在房主／單機（propDamage）；房主把這一格血量有變的物件合併成一個 propHp 事件、每 2 秒在快照帶一份
//   受損物件的血量表（prs：重連、觀戰、漏掉事件、房主遷移都靠它對齊）；客機依血量自己演出，特效一律不轉送。
import { SFX } from '../audio/audio.js';
import { weaponAttr } from '../data/attrs.js';
import { PMAT, PROP_CHAR, propAttrK, propCrushable, propDebrisCol, propStage } from '../data/destruct.js';
import { weaponById } from '../data/parts.js';
import { fling, local } from '../render/foe-damage.js';
import { isOutline } from '../render/geometry.js';
import { CH0, cellHash, cutHeight, splitTris, tierBoxes } from '../world/prop-split.js';
import { Game } from './game.js';

const NEAR = 170; // 持續效果：離鏡頭多遠以內（公尺）
const MAX_ACTIVE = 12; // 同時演出持續效果的物件數（離鏡頭最近的）
const TABLE_DT = 2; // 房主送血量表的間隔（秒）
const WRECK_BURN = 22; // 可燃物的殘骸繼續燒幾秒
const WRECK_SMOKE = 7; // 其他殘骸冒煙／揚塵幾秒
const FLASH_MS = 70;
const CRUSH_SLOW = 0.85; // 踩平時機甲的速度倍率
const FALL_DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
const WARN_T = 1.5; // 倒塌：預警的秒數
const FALL_T = 1.4; // 倒下的秒數
const SINK_T = 2; // 往下塌的秒數

const GEO_OWNER = new WeakMap(); // 幾何 → 改了它的物件（共用的幾何先複製一份）
const BLACK = new THREE.Color(0);
const SHARD_GEO = new THREE.BoxGeometry(1, 0.16, 0.75);

// 頂點位置的雜湊（0～1）：焦黑一塊一塊的
const hash3 = (x, y, z) => {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return h - Math.floor(h);
};

Object.assign(Game.prototype, {
  // 房主／單機：物件受傷。attr＝屬性（沒有時依武器 id 推算，都沒有時算實彈）；'none'＝不看材質
  propDamage(p, dmg, impact, at, from, attr, wid) {
    if (p.dead) return;
    if (p.isShot) return this.shotDamage(p, dmg, at, from); // 可以打掉的投射物（hazards2.js）
    const a = attr || (wid ? weaponAttr(weaponById(wid)) : 'kin');
    const d = Math.round(dmg * propAttrK(p.mat, a));
    if (!(d > 0)) return;
    if (p.noDie && p.hp - d <= 0) p.hp = Math.min(p.hp, 1);
    else p.hp -= d;
    this.propFlash(p);
    this.popDamage(at || p.center(), d, false, false, false, 0, -1, impact);
    (this.propDirty || (this.propDirty = new Set())).add(p);
    if (p.hp <= 0) {
      const src = from && from.pos ? from.pos : at;
      const dir = src ? p.center().sub(src).setY(0) : null;
      if (dir && dir.lengthSq() > 1e-4) dir.normalize();
      this.propKill(p, dir);
    } else this.propStageCheck(p);
  },
  // 完全損毀（房主／單機）：o.cr＝被踩平
  propKill(p, dir, o = {}) {
    if (p.dead) return;
    this.propDirty && this.propDirty.delete(p);
    this.world.destroyProp(p, this.fx, { dir, cr: o.cr });
    if (p.support) this.propSupportDown(p, false);
    else this.propWreckFx(p);
    this.netEv({
      t: 'propDie',
      i: p.idx,
      d: dir ? [+dir.x.toFixed(2), +dir.z.toFixed(2)] : 0,
      cr: o.cr ? 1 : 0,
    });
    // 承重柱全壞：結構倒下（方向依最後一擊；客機收到 pcol 照同樣的方向演出）
    if (p.support && p.of.sup.every((q) => q.dead) && !p.of.collapsed) {
      const di = this.propFallDir(p.of, dir);
      this.netEv({ t: 'pcol', i: p.of.idx, d: di });
      this.propCollapse(p.of, di, false);
    }
    this.lvPropDown(p); // 自訂關卡的觸發器（物件被破壞）
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
    if (p.dead) return;
    const st = Math.min(3, propStage(p.hp, p.maxHp));
    const st0 = p.st || 0;
    if (st <= st0) return;
    p.st = st;
    if (p.support) {
      // 承重柱：只噴碎板（模型是整個結構共用的，焦黑與脫落由結構本體決定）
      if (!quiet && this.fx) this.propShards(p, st >= 3 && st0 < 3 ? 3 : 1);
      return;
    }
    for (let s = st0 + 1; s <= st; s++) this.propTier(p, s, quiet || !this.fx);
    this.propChar(p, PROP_CHAR[st]);
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
    if (cut !== null) this.world.propCut(p, cut);
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
    while (S2.fi >= 1) {
      S2.fi -= 1;
      if (!burning) continue;
      const q = pt().add(new THREE.Vector3(0, Math.random() * 0.8, 0));
      fx.flash(q, 0.3 * S * (0.6 + Math.random() * 0.5), Math.random() < 0.6 ? 0xd8480a : 0xff7018, 0.18);
      if (Math.random() < 0.3) fx.streaks(q, 2, 0xff9a30, 4, 0.5, -6);
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
    for (const q of b.sup) if (!q.dead) w.destroyProp(q, null, { quiet: true });
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
    // 寬的建築：往下塌成瓦礫堆（像控制爆破）；細高的（高 > 寬 × 1.5）才整個倒下
    if (H <= Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) * 1.5) return this.propSink(b, quiet);
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
      this.propDamage(q, dmg * 2, 0, q.center(), null, 'exp');
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
  // ---------- 踩平（房主／單機）----------
  // 機甲（玩家、敵人、友軍、載具）在地上移動、腳的範圍碰到雜物（data/destruct.js 的 propCrushable）就直接變成殘骸：
  // 不算傷害數字與賞金，機甲稍微減速；客機收到帶 cr 的 propDie 自己演出
  propCrushTick() {
    const w = this.world;
    if (!w || !w.props || this.range || this.cine) return;
    if (this.crushW !== w) {
      this.crushW = w;
      this.crushList = w.props.filter((p) => !p.dead && propCrushable(p));
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
        if (p.support) this.propSupportDown(p, true);
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
    for (const [i, h, d] of t) this.propApplyHp(i, h, false, true, d);
  },
  // 客機：損毀的事件（各端自己演出碎裂與殘骸）
  propApplyDie(e) {
    const p = this.world && this.world.props && this.world.props[e.i];
    if (!p || p.dead) return;
    const dir = e.d ? new THREE.Vector3(e.d[0], 0, e.d[1]) : null;
    p.hp = Math.min(p.hp, 0);
    this.world.destroyProp(p, this.fx, { dir, cr: !!e.cr });
    if (p.support) this.propSupportDown(p, false);
    else this.propWreckFx(p);
  },
  // 客機：結構倒下的事件
  propApplyCollapse(e) {
    const p = this.world && this.world.props && this.world.props[e.i];
    if (p && p.body) this.propCollapse(p, e.d, false);
  },
});
