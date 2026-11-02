// Game 的 mixin：地圖物件的破壞（docs/destruction-design.md）——受傷（依材質的屬性倍率）、四段受損的外觀
// （焦黑、碎板、依材質的持續效果；只有可燃的起火）、完全損毀換成殘骸（world.destroyProp）、多人同步。
//   判定只在房主／單機（propDamage）；房主把這一格血量有變的物件合併成一個 propHp 事件、每 2 秒在快照帶一份
//   受損物件的血量表（prs：重連、觀戰、漏掉事件、房主遷移都靠它對齊）；客機依血量自己演出，特效一律不轉送。
import { weaponAttr } from '../data/attrs.js';
import { PMAT, PROP_CHAR, propAttrK, propDebrisCol, propStage } from '../data/destruct.js';
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
    this.propWreckFx(p);
    this.netEv({
      t: 'propDie',
      i: p.idx,
      d: dir ? [+dir.x.toFixed(2), +dir.z.toFixed(2)] : 0,
      cr: o.cr ? 1 : 0,
    });
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
      cut = ch !== null ? ch : H > 4.5 ? sh.y0 + H * 0.62 : null;
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
    for (const pc of r.pieces) {
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
      if (p.hp < p.maxHp && !p.genGone) out.push([p.idx, Math.round(p.hp)]);
    return out;
  },
  // 客機：套用一個物件的血量（表或事件）；flash＝事件來的（閃一下）
  propApplyHp(i, h, flash, quiet) {
    const p = this.world && this.world.props && this.world.props[i];
    if (!p) return;
    if (h <= 0) {
      if (!p.dead) {
        p.hp = h;
        this.world.destroyProp(p, this.fx, { quiet: true });
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
    for (const [i, h] of t) this.propApplyHp(i, h, false, true);
  },
  // 客機：損毀的事件（各端自己演出碎裂與殘骸）
  propApplyDie(e) {
    const p = this.world && this.world.props && this.world.props[e.i];
    if (!p || p.dead) return;
    const dir = e.d ? new THREE.Vector3(e.d[0], 0, e.d[1]) : null;
    p.hp = Math.min(p.hp, 0);
    this.world.destroyProp(p, this.fx, { dir, cr: !!e.cr });
    this.propWreckFx(p);
  },
});
