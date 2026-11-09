// Game：零件品級的掉落（docs/gear-rarity-design.md 第 6 節）——敵人身上的零件帶品級、擊破時掉落、地上的光柱與拾取、
// 背包滿了撿不起來、出擊結束時自動撿起；據點的補給箱、委託板、出口獎勵「裝備」。
// 判定在房主／單機；多人時每位玩家各自產生一件（各撿各的），直接入帳（gear 事件），不放在地上。
import { SFX } from '../audio/audio.js';
import { MS } from '../core/scale.js';
import { AF, affixList } from '../data/affix.js';
import { GEAR_CAT, GEAR_SLOTS, GRADES, AX_N, gearPart, rollAx, rollGear } from '../data/gear.js';
import {
  ALL_GEAR,
  GEAR_DROP,
  bossPool,
  chOfLevel,
  enemyQRange,
  goldChance,
  qCap,
  rollQ,
} from '../data/gear-loot.js';
import { Game } from './game.js';

const pickOne = (a) => a[Math.floor(Math.random() * a.length)];

Object.assign(Game.prototype, {
  // 目前的章（主線依出擊；自由出擊與其他依等級）
  gearCh() {
    if (this.camp && this.campSortie) {
      const so = this.campSortie();
      if (so && so.chapter) return so.chapter;
      return chOfLevel(this.campLevel());
    }
    return chOfLevel(this.save.level || 1);
  },
  // ---------- 敵人身上的零件（spawnEnemy 呼叫，生成前） ----------
  gearEnemy(o) {
    if (!this.lootOn() || !o.asm || o.grunt || o.modelKind || (o.team && o.team !== 'enemy')) return;
    const [lo, hi] = enemyQRange(this.gearCh(), !!o.isBoss);
    const gr = {},
      own = {};
    for (const [k] of GEAR_SLOTS) {
      const id = o.asm[k];
      if (!GEAR_CAT.has(id)) continue;
      const q = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (!q) continue;
      const g = rollGear(id, q, Math.random, { enemy: true });
      own[k] = g;
      gr[k] = { id, q, ax: g.ax };
    }
    if (!Object.keys(gr).length) return;
    o.pilot = { ...(o.pilot || {}), gr };
    o.gearOf = own;
  },
  // 實體身上最高的品級（名牌）：房主與客機都從加成表的 gr 算
  gearMaxQ(e) {
    const gr = e && e.pm && e.pm.gr;
    if (!gr) return 0;
    let q = 0;
    for (const k in gr) q = Math.max(q, gr[k].q || 0);
    return q;
  },
  // ---------- 擊破（loot.js 的 lootKilled，房主／單機） ----------
  gearKilled(e, ace, big) {
    const ch = this.gearCh();
    const cap = qCap(ch);
    const at = e.center();
    if (e.isBoss) {
      // Boss：一定掉一件（掉落表），有機率是金色
      const key = (e.boss3Key && e.boss3Key()) || (e.opts && e.opts.bossKind) || '';
      const echo = String(e.name || '').startsWith('ECHO-');
      const nAf = e.af ? affixList(e.af).length : 0; // 依戰力的 Boss 詞綴：每個多一點金色機率（docs/boss-design.md 第 8 節）
      const gold = Math.random() < goldChance(ch, echo) + AF.BOSS_GOLD * nAf;
      return this.gearGive(pickOne(bossPool(key, e.asm)), gold ? 4 : rollQ(cap, 1, Math.random), at);
    }
    const named = this.bosses && this.bosses.includes(e);
    if (e.gearOf && (named || e.nemesis || e.isElite || ace)) {
      const p = named || e.nemesis || e.isElite ? GEAR_DROP.ace : GEAR_DROP.ac;
      if (Math.random() < p) {
        // 掉的是它身上的那一件（品級、詞條照舊，條數補滿）
        const ks = Object.keys(e.gearOf);
        const src = e.gearOf[pickOne(ks)];
        const up = (named || e.nemesis || e.isElite) && Math.random() < GEAR_DROP.aceUp;
        const q = Math.min(src.q + (up ? 1 : 0), Math.max(cap, src.q));
        return this.gearGive(src.id, q, at, q === src.q ? src.ax : null);
      }
      return;
    }
    if (big) return this.gearGive(pickOne(ALL_GEAR), rollQ(cap, 1, Math.random), at);
    if (e.af && Math.random() < GEAR_DROP.affix)
      return this.gearGive(pickOne(ALL_GEAR), rollQ(cap, 0, Math.random), at);
    if (Math.random() < GEAR_DROP.grunt)
      return this.gearGive(pickOne(ALL_GEAR), rollQ(Math.min(1, cap), 0, Math.random), at);
  },
  // 據點的補給箱（outposts.js 的 cacheOpen）
  gearCache(c) {
    if (
      this.isClient ||
      !this.lootOn() ||
      Math.random() >= GEAR_DROP.cache * (1 + 0.5 * this.lgMax('lgCache'))
    )
      return;
    const pos = c && c.pos ? c.pos.clone() : this.player ? this.player.center() : null;
    this.gearGive(pickOne(ALL_GEAR), rollQ(qCap(this.gearCh()), 0, Math.random), pos);
  },
  // 委託板的報酬、出口獎勵「裝備」：至少改良，直接入帳
  gearReward(src) {
    const cap = Math.max(1, qCap(this.gearCh()));
    this.gearGive(pickOne(ALL_GEAR), rollQ(cap, 1, Math.random), null, null, src);
  },
  // ---------- 給一件 ----------
  // id／q＝零件與品級、at＝掉落的位置（null＝直接入帳）、ax＝沿用的詞條（敵人身上的）
  gearGive(id, q, at, ax, src) {
    const mk = () => {
      const g = rollGear(id, q, Math.random, { ch: this.gearCh() });
      if (ax && g) {
        g.ax = ax.map((a) => a.slice());
        while (g.ax.length < AX_N[q]) {
          const a = rollAx(
            GEAR_CAT.get(id),
            gearPart(id),
            q >= 3,
            Math.random,
            g.ax.map((x) => x[0]),
            q === 4 && !g.ax.length,
          );
          if (!a) break;
          g.ax.push(a);
        }
      }
      return g;
    };
    if (!id || !GEAR_CAT.has(id)) return;
    // 多人：每位玩家各自一件，直接入帳
    if (this.net && this.net.role) {
      for (const p of this.players || []) {
        if (!p || p.slot === undefined) continue;
        const g = mk();
        if (p.slot === this.net.me) this.gearGet(g, src);
        else this.netEv({ t: 'gear', slot: p.slot, g });
      }
      return;
    }
    const g = mk();
    if (!at || this.airMode || !this.world || this.state !== 'play') return this.gearGet(g, src);
    this.gearDropAt(g, at);
  },
  // 客機收到房主送來的（mp-client 的事件）
  gearNetEvent(e) {
    if (e.t !== 'gear') return false;
    if (e.slot === this.net.me && e.g) this.gearGet(e.g);
    return true;
  },
  // 收下一件：標準版＝解鎖零件或換成合金；背包滿了收不下（回傳 false）
  gearGet(g, src) {
    if (!g) return false;
    const p = gearPart(g.id);
    if (!g.q) {
      if (!this.save.owned.includes(g.id)) {
        this.gearOwn(g.id);
        this.writeSave();
        if (this.lootRun) this.lootRun.parts.push(g.id);
        SFX.cue('pickup');
        this.flashMsg(`取得零件「${p.name}」`, 0xffd060, 2.4, { k: 'good', m: '取得零件', s: p.name });
      } else {
        this.lootMat('alloy', 1);
        this.flashMsg(`${p.name}（標準版，已擁有）：換成合金 ×1`, 0xb8c4cc, 1.8);
      }
      return true;
    }
    if (!this.invAdd(g)) {
      this.flashMsg(`背包已滿，無法拾取「${GRADES[g.q].n}」${p.name}`, 0xff6060, 2.2, {
        k: 'warn',
        m: '背包已滿',
        s: '無法拾取',
      });
      if (this.lootRun) this.lootRun.lost = (this.lootRun.lost || 0) + 1;
      return false;
    }
    if (this.lootRun) (this.lootRun.gear = this.lootRun.gear || []).push({ id: g.id, q: g.q });
    SFX.cue('pickup');
    const col = parseInt(GRADES[g.q].c.slice(1), 16);
    this.flashMsg(`${src ? src + '：' : ''}取得「${GRADES[g.q].n}」${p.name}`, col, 2.6, {
      k: 'good',
      m: `取得裝備・${GRADES[g.q].n}`,
      s: p.name,
    });
    return true;
  },
  // ---------- 地上的裝備（單人） ----------
  gearDropAt(g, at) {
    const W = this.world;
    const [x, z] = W.nearSolid ? W.nearSolid(at.x, at.z) : [at.x, at.z];
    const pos = new THREE.Vector3(x, W.groundAt(x, z, at.y + 2), z);
    const col = new THREE.Color(GRADES[g.q].c);
    const grp = new THREE.Group();
    const beamMat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22 * MS, 0.32 * MS, 12 * MS, 10, 1, true),
      beamMat,
    );
    beam.position.y = 6 * MS;
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.55 * MS),
      new THREE.MeshBasicMaterial({ color: col }),
    );
    core.position.y = 1.2 * MS;
    grp.add(beam, core);
    grp.position.copy(pos);
    for (const o of [beam, core]) o.userData.noAO = true;
    this.scene.add(grp);
    (this.gearDrops = this.gearDrops || []).push({ g, pos, grp, beam, core, col, t: 0, warnT: -9 });
  },
  // 每格（updateMapExtras，房主／單機）：靠近就撿；背包滿了提示、光柱變灰閃爍
  gearDropsTick(dt) {
    const L = this.gearDrops;
    if (!L || !L.length) return;
    const p = this.player;
    const full = this.invFull();
    for (const d of L) {
      d.t += dt;
      d.core.rotation.y += dt * 2;
      d.core.position.y = (1.2 + Math.sin(d.t * 3) * 0.25) * MS;
      d.beam.material.color.copy(full ? new THREE.Color(0x777777) : d.col);
      d.beam.material.opacity = full ? (Math.floor(d.t * 4) % 2 ? 0.15 : 0.45) : 0.5;
      if (!p || p.dead || d.got) continue;
      if (
        Math.hypot(p.pos.x - d.pos.x, p.pos.z - d.pos.z) < 2.6 * MS &&
        Math.abs(p.pos.y - d.pos.y) < 4 * MS
      ) {
        if (full) {
          if (d.t - d.warnT > 2.5) {
            d.warnT = d.t;
            this.gearGet(d.g); // 收不下：提示
            if (this.lootRun) this.lootRun.lost = Math.max(0, (this.lootRun.lost || 1) - 1); // 還在地上，結算時才算沒撿到
          }
          continue;
        }
        if (this.gearGet(d.g)) {
          d.got = true;
          this.fx.ring(p.center(), 5, d.col.getHex());
          this.scene.remove(d.grp);
        }
      }
    }
    this.gearDrops = L.filter((d) => !d.got);
  },
  // HUD：地上裝備的名稱（hud.js 的拾取物名稱那一段）
  gearDropsHud(c) {
    for (const d of this.gearDrops || []) {
      const s = this.proj(d.pos.clone().setY(d.pos.y + 3 * MS));
      if (!s.in) continue;
      const t = `${GRADES[d.g.q].n}・${gearPart(d.g.id).name}`;
      c.font = 'bold 13px Chakra Petch';
      c.textAlign = 'center';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(0,0,0,.75)';
      c.strokeText(t, s.x, s.y);
      c.fillStyle = GRADES[d.g.q].c;
      c.fillText(t, s.x, s.y);
    }
  },
  // 離開這張地圖（clearMission）：沒撿的自動撿起（背包滿的算沒撿到）
  gearDropsFlush() {
    const L = this.gearDrops || [];
    this.gearDrops = [];
    for (const d of L) {
      if (this.scene) this.scene.remove(d.grp);
      d.beam.geometry.dispose();
      d.core.geometry.dispose();
      if (d.got) continue;
      if (this.invFull()) {
        if (this.lootRun) this.lootRun.lost = (this.lootRun.lost || 0) + 1;
        continue;
      }
      this.gearGet(d.g);
    }
  },
});
