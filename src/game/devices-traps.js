// Game：環境陷阱（docs/map-devices-design.md 的 C）——打弱點型（弱點是代理目標，子彈、爆炸、近戰都打得到，
// 敵人的流彈也會觸發）與互動型（控制台按住互動鍵，冷卻後可以再用）。效果在房主／單機判定（trapActTick），
// 會傷到所有機體（玩家減半、Boss 很少），陷阱擊破的敵人＝「環境擊殺」（onEnemyKilled 看 devEnvNow）。
// 顯示各端自己做（trapVis：貨櫃落下、鐵塔倒下、冰洞、電光），依快照的狀態與本地的計時。
import { SFX } from '../audio/audio.js';
import { clamp } from '../core/math.js';
import { MS } from '../core/scale.js';
import { Game } from './game.js';

const DEV_TGT = 960000; // 弱點代理目標的 id 基底（entById 用）
const DEV_FACE_OUT = new Set(['valve', 'airlock']); // 前方朝作戰區域外側（data/devices.js 的 faceOut）
const ST_IDLE = 0,
  ST_USED = 2,
  ST_ACT = 3,
  ST_CD = 4;
// 每個主題的陷阱
const THEME_TRAPS = {
  dam: ['sluice'],
  spaceport: ['testrig'],
  grid086: ['scrap'],
  xylem: ['valve'],
  orbit: ['airlock'],
  institute: ['coral'],
  industrial: ['crane'],
  grid: ['shock'],
  desert: ['mine'],
  snow: ['ice'],
  wasteland: ['pylon'],
  dunes: ['gas'],
  flooded: ['cable'],
};

Object.assign(Game.prototype, {
  // 規畫陷阱（devPlan 呼叫）：放在敵群那裡（每群一個，2～4 個）；沒有分群時在玩家前方隨機
  trapPlan(used) {
    const list = THEME_TRAPS[this.worldTheme];
    if (!list || this.isBossLevel) return;
    const G = this.encGroups || [];
    const n = G.length ? Math.min(G.length, 2 + Math.floor(Math.random() * 3)) : 2;
    const gs = G.slice().sort(() => Math.random() - 0.5);
    for (let i = 0; i < n; i++) {
      const k = list[i % list.length];
      const at = G.length ? gs[i].pos : null;
      const pt = this.devSpot(at, used, 3, !!at) || (at && this.devSpot(at, used, 1.5, true));
      if (!pt) continue;
      used.push(pt);
      let y = Math.floor(Math.random() * 4);
      if (DEV_FACE_OUT.has(k)) {
        // 前方（+Z 轉 yaw）朝作戰區域的外側：yaw＝0 → +Z、1 → +X、2 → −Z、3 → −X
        const Zn = this.world.zone;
        const a = Math.atan2(pt.x - (Zn[0] + Zn[1]) / 2, pt.z - (Zn[2] + Zn[3]) / 2);
        y = ((Math.round(a / (Math.PI / 2)) % 4) + 4) % 4;
      }
      this.devAdd({ i: ++this.devSeq, k, x: pt.x, z: pt.z, y, v: 1 });
    }
  },
  // 弱點的代理目標（devAdd 呼叫；房主與客機）
  trapInit(d) {
    const def = d.def;
    d.hp = (d.val || 1) * def.hp;
    if (def.trig !== 'shoot') return;
    const wpPos = d.pos.clone().add(this.devRot(d, def.wp));
    const g = this;
    d.tgt = {
      id: DEV_TGT + d.id,
      isProp: true,
      isTrap: true,
      dev: d,
      name: def.name + '（弱點）',
      team: 'prop',
      pos: wpPos,
      vel: new THREE.Vector3(),
      radius: (def.wpR || 0.8) * MS,
      scale: 0.6,
      laserK: 1,
      res: null,
      get dead() {
        return d.st !== ST_IDLE || !g.devs || !g.devs.includes(d);
      },
      get hp() {
        return d.hp;
      },
      get maxHp() {
        return def.hp;
      },
      center() {
        return wpPos.clone();
      },
    };
  },
  // 裝置座標（舊尺度、轉 yaw）→ 世界的位移
  devRot(d, v) {
    const a = d.yaw || 0,
      c = Math.cos(a),
      s = Math.sin(a);
    const x = (v[0] || 0) * MS,
      z = (v[2] || 0) * MS;
    return new THREE.Vector3(x * c + z * s, (v[1] || 0) * MS, -x * s + z * c);
  },
  // 子彈、爆炸打得到的弱點（destructibles 與 lockPool 用）
  trapTargets() {
    const out = [];
    for (const d of this.devs || []) if (d.tgt && !d.tgt.dead) out.push(d.tgt); // 陷阱：待命；砲台：敵人操作中
    return out;
  },
  trapById(id) {
    if (!(id >= DEV_TGT && id < DEV_TGT + 100000)) return null;
    const d = (this.devs || []).find((o) => o.id === id - DEV_TGT);
    return d && d.tgt && !d.tgt.dead ? d.tgt : null;
  },
  // damageProp 轉過來（房主／單機）
  trapDamage(t, dmg, at, from) {
    const d = t.dev;
    if (d.def.gun) return this.gunDamage(d, dmg, at); // 敵方佔著的固定砲台（devices-guns.js）
    if (d.st !== ST_IDLE) return;
    d.hp -= Math.max(1, Math.round(dmg));
    this.popDamage(at || t.center(), Math.round(dmg), false, false, false, 0, t.id);
    this.fx.spark(t.center(), 0xffe080);
    if (d.hp <= 0) this.devTrigger(d, from);
  },
  // 觸發（房主／單機）：by＝觸發的機體（打壞弱點的、按控制台的）；敵人觸發的不算玩家的擊殺
  devTrigger(d, by) {
    if (d.st !== ST_IDLE) return;
    d.st = ST_ACT;
    d.t = 0;
    d.hp = 0;
    d.done = 0;
    d.by = by && by.team === 'player' ? by.id : 0;
    const def = d.def;
    if (by && by.isPlayer) this.flashMsg(`${def.name} — ${def.act}`, def.color, 1.6);
    SFX.explode(false, d.tgt ? d.tgt.pos : d.pos);
  },
  // ---------- 效果（房主／單機，devTick 呼叫） ----------
  trapActTick(d, dt) {
    const def = d.def,
      E = def.fx;
    if (d.st === ST_CD) {
      d.t += dt;
      d.prog = 1 - d.t / def.cd;
      if (d.t >= def.cd) {
        d.st = ST_IDLE;
        d.prog = 0;
      }
      return;
    }
    if (d.st !== ST_ACT) return;
    d.t += dt;
    const by = d.by ? this.entById(d.by) : null;
    // 一次性的打擊（delay 秒後）
    if (!d.done && d.t >= (E.delay || 0)) {
      d.done = 1;
      this.trapHit(d, by);
    }
    // 持續的區域（zone）
    const dur = E.zone ? E.zone.dur : 0;
    if (dur && d.done) {
      d.tick = (d.tick || 0) - dt;
      if (d.tick <= 0) {
        d.tick = 0.25;
        this.trapZoneTick(d, by);
      }
    }
    d.prog = clamp(d.t / Math.max(0.01, (E.delay || 0) + dur), 0, 1);
    if (d.t >= (E.delay || 0) + dur + 0.05) {
      if (def.trig === 'use') {
        d.st = ST_CD;
        d.t = 0;
      } else d.st = ST_USED;
      d.prog = 0;
    }
  },
  // 一次性的打擊：爆炸、砸落、倒下
  trapHit(d, by) {
    const def = d.def,
      E = def.fx;
    const fwd = this.devRot(d, [0, 0, 1]).normalize();
    if (E.blast) {
      const c = d.pos.clone().add(this.devRot(d, E.at || [0, 0, 0]));
      this.fx.explosion(c.clone().setY(c.y + 1.5 * MS), E.blast * 0.6, def.boomColor || 0xffa040, true);
      this.fx.shockwave(c.clone().setY(c.y + 0.5 * MS), E.blast, 0xffd090, 0.5);
      this.fx.dust(c.clone().setY(c.y + 0.3), E.blast * 0.8, 14, def.dustColor || 0x9a8e80);
      SFX.explode(true, c);
      this.devArea(c, E.blast * MS, (t, k) =>
        this.devHurt(t, E.frac * k, E.imp || 600, by, c, E.attr || 'exp'),
      );
      this.camShakeAt(c, 0.45);
    }
    if (E.line) {
      // 倒下的直線（鐵塔）：從底部往 fwd 長 L、寬 W
      const L = E.line[0] * MS,
        W = E.line[1] * MS;
      const tip = d.pos.clone().addScaledVector(fwd, L);
      this.fx.dust(tip.clone().setY(tip.y + 0.3), 8, 16, 0x8a8478);
      this.fx.shockwave(tip.clone().setY(tip.y + 0.5), 6, 0xffe080, 0.5);
      SFX.explode(true, tip);
      for (const t of this.everyone()) {
        if (!t || t.dead || t.isProp) continue;
        const rx = t.pos.x - d.pos.x,
          rz = t.pos.z - d.pos.z;
        const u = rx * fwd.x + rz * fwd.z,
          v = Math.abs(rx * fwd.z - rz * fwd.x);
        if (u > 0 && u < L && v < W / 2 + (t.radius || 0))
          this.devHurt(t, E.frac, E.imp || 800, by, t.center(), 'kin');
      }
      this.camShakeAt(tip, 0.4);
    }
    // 留下的掩體（臨時障礙物：同步給客機）
    for (const c of E.cover || []) {
      const p = d.pos.clone().add(this.devRot(d, c.at));
      this.addTempWall(p, {
        kind: c.kind,
        w: c.w * MS,
        h: c.h * MS,
        d: c.d * MS,
        yaw: (d.yaw || 0) + (c.yaw || 0),
        hp: 0,
        life: 9999,
      });
    }
    if (E.pool) this.fx.firePool(d.pos.clone(), E.zone.R, E.zone.dur, 0);
    if (E.pillar) this.fx.pillarStrike(d.pos.clone(), E.pillar, def.color);
  },
  // 持續的區域：每 0.25 秒（電擊、落水、火）
  trapZoneTick(d, by) {
    const Z = d.def.fx.zone;
    const W = this.world;
    const water = Z.water && W.waterDepth(d.pos.x, d.pos.z) > 0.05;
    for (const t of this.everyone()) {
      if (!t || t.dead || t.isProp || t.flying) continue;
      if (!this.devInZone(d, t)) continue;
      const gy = W.groundAt(t.pos.x, t.pos.z, t.pos.y + 1);
      if (t.pos.y - gy > (Z.air || 1.6) * MS) continue; // 跳起來、懸浮就躲得掉
      if (water && W.waterDepth(t.pos.x, t.pos.z) <= 0.05) continue;
      this.devHurt(t, Z.frac, 0, by, t.center(), Z.attr || 'en');
      if (Z.en && t.en !== undefined) t.en = Math.max(0, t.en - t.enMax * Z.en);
      if (Z.slow && t.addStatus) t.addStatus('slow', 0.6, { k: Z.slow, qb: 1.6 });
    }
  },
  // 推（MechEntity.move 呼叫；房主與客機的自身預測都算）：作用中的區域把機體往裝置的前方推
  devPush(e, target) {
    for (const d of this.devs) {
      if (d.st !== ST_ACT || !d.def.fx || !d.def.fx.zone || !d.def.fx.zone.push) continue;
      const Z = d.def.fx.zone;
      if ((d.vt || d.t || 0) < (d.def.fx.delay || 0) || e.noPush || !this.devInZone(d, e)) continue;
      if (e.pos.y - this.world.groundAt(e.pos.x, e.pos.z, e.pos.y + 1) > (Z.air || 1.6) * MS) continue;
      const a = d.yaw || 0;
      target.x += Math.sin(a) * Z.push * MS;
      target.z += Math.cos(a) * Z.push * MS;
    }
  },
  devInZone(d, t) {
    const Z = d.def.fx.zone;
    const rx = t.pos.x - d.pos.x,
      rz = t.pos.z - d.pos.z;
    if (Z.sq) {
      const a = -(d.yaw || 0);
      const c = Math.cos(a),
        s = Math.sin(a);
      const lx = rx * c + rz * s,
        lz = -rx * s + rz * c;
      return Math.abs(lx) < Z.sq * MS && Math.abs(lz) < Z.sq * MS;
    }
    if (Z.line) {
      const fwd = this.devRot(d, [0, 0, 1]).normalize();
      const u = rx * fwd.x + rz * fwd.z,
        v = Math.abs(rx * fwd.z - rz * fwd.x);
      return u > 0 && u < Z.line[0] * MS && v < (Z.line[1] * MS) / 2;
    }
    return Math.hypot(rx, rz) < Z.R * MS;
  },
  // 範圍內的機體（離中心越遠越少：1 → 0.5）
  devArea(c, R, fn) {
    for (const t of this.everyone()) {
      if (!t || t.dead || t.isProp) continue;
      const dd = Math.hypot(t.pos.x - c.x, t.pos.z - c.z) - (t.radius || 0);
      if (dd < R && Math.abs(t.center().y - c.y) < R) fn(t, 1 - 0.5 * clamp(dd / R, 0, 1));
    }
  },
  // 陷阱的傷害：依目標的最大 AP 比例（玩家與友軍減半、Boss 很少）；by＝觸發的玩家（擊破算他的、環境擊殺）
  devHurt(t, frac, imp, by, at, attr) {
    if (!t || t.dead) return;
    let k = frac;
    if (t.isBoss) k *= 0.08;
    else if (t.team === 'player' || t.team === 'ally') k *= 0.5;
    if (!(k > 0)) return;
    const from = by && !by.dead && t.team === 'enemy' ? by : null;
    const dir = t.center().sub(at || t.center());
    if (dir.lengthSq() > 1e-4) dir.normalize();
    this.devEnvNow = true;
    try {
      t.takeDamage(t.maxHp * k, imp, from, at, dir.lengthSq() ? dir : undefined, undefined, undefined, attr);
    } finally {
      this.devEnvNow = false;
    }
  },
  camShakeAt(c, k) {
    if (this.player && this.player.center().distanceTo(c) < 60 * MS)
      this.camShake = Math.max(this.camShake, k);
  },
  // 環境擊殺（onEnemyKilled 呼叫）：風格評價、額外獎金
  devEnvKill(e, from, bounty) {
    if (from && from.syEvent) from.syEvent('env');
    const extra = Math.round((bounty * 0.5) / 100) * 100;
    this.envKills = (this.envKills || 0) + 1;
    this.popDamage(e.center().setY(e.center().y + 2 * MS), '環境擊殺', false, true, false, 0, e.id);
    if (extra > 0) {
      this.save.coam += extra;
      this.missionEarned = (this.missionEarned || 0) + extra;
      this.netEv({ t: 'bounty', v: extra });
      this.bountyPops.push({ txt: '環境擊殺 +' + extra.toLocaleString() + ' COAM', life: 2.4, y: 0 });
    }
  },
  // ---------- 顯示（各端每格） ----------
  trapVis(d, dt) {
    const m = d.mesh,
      def = d.def;
    if (d.vst !== d.st) {
      d.vst = d.st;
      d.vt = 0;
    }
    d.vt = (d.vt || 0) + dt;
    const act = d.st === ST_ACT,
      used = d.st === ST_USED || (d.st === ST_CD && def.trig !== 'use');
    // 弱點：待命時脈動，觸發後藏起來（被打斷、炸掉）
    if (m.wp) m.wp.visible = d.st === ST_IDLE || !def.hideWp;
    const lit = d.st === ST_IDLE ? 0.8 + 0.6 * Math.abs(Math.sin(this.time * 3)) : act ? 2.4 : 0.15;
    for (const g of d.glow) g.emissiveIntensity = lit;
    if (m.ring) m.ring.visible = def.trig === 'use' && d.st === ST_IDLE;
    if (m.load) {
      // 貨櫃落下：0.55 秒到地面，之後換成臨時障礙物（房主建、同步給客機）
      if (act || used) {
        const t = act ? d.vt : 9;
        m.load.position.y = Math.max(0, 3.2 - 10.6 * t * t);
        m.load.visible = t < 0.9;
      } else {
        m.load.position.y = 3.2;
        m.load.visible = true;
      }
    }
    if (m.tower) m.tower.rotation.x = act ? Math.min(Math.PI / 2, 1.6 * d.vt * d.vt) : used ? Math.PI / 2 : 0;
    if (m.hole) m.hole.visible = act || used;
    if (m.grid)
      for (const g of d.glow) g.emissiveIntensity = act ? 2 + Math.random() : d.st === ST_CD ? 0.1 : lit;
    // 區域效果的電光、火花（本地，不轉送）
    const Z = def.fx.zone;
    if (act && Z && d.vt >= (def.fx.delay || 0)) {
      d.vfx = (d.vfx || 0) - dt;
      if (d.vfx <= 0) {
        d.vfx = 0.12;
        const fx = this.fx,
          nest = fx._nested;
        fx._nested = true;
        try {
          for (let i = 0; i < 2; i++) {
            const p = this.trapZonePoint(d);
            const fw = this.devRot(d, [0, 0, 1]).normalize();
            if (Z.vis === 'elec') {
              fx.arc(p.setY(p.y + 0.4 * MS), 1.4, def.color);
              if (Math.random() < 0.3) fx.spark(p, 0xbfe8ff);
            } else if (Z.vis === 'ice') fx.dust(p.setY(p.y + 0.2), 2, 3, 0xd8f0ff);
            else if (Z.vis === 'water' || Z.vis === 'wind') {
              const col = Z.vis === 'water' ? 0xd8f0ff : 0xfff0c0;
              if (Z.vis === 'water') fx.dust(p.clone().setY(p.y + 0.3), 2, 3, 0xb8dcf0);
              fx.streaks(p.setY(p.y + 0.6 * MS), 2, col, 14, 0.35, 10, fw.clone().setY(0.25), 0.4);
            } else if (Z.vis === 'fire' && i === 0) {
              const o = d.pos.clone().add(this.devRot(d, [0, 1.7, 1.2]));
              fx.flameCone(o, fw, Z.line[0] * MS * 0.5, 0.18, 8);
            } else if (Z.vis === 'coral') {
              fx.spark(p.setY(p.y + 0.5 * MS), 0xff5a6a);
              if (Math.random() < 0.4) fx.arc(p, 1.2, 0xff4a5a);
            }
          }
        } finally {
          fx._nested = nest;
        }
      }
    }
  },
  trapZonePoint(d) {
    const Z = d.def.fx.zone;
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
    const p = d.pos.clone().add(this.devRot(d, [lx, 0, lz]));
    p.y = this.world.groundAt(p.x, p.z, p.y + 3 * MS);
    return p;
  },
});
