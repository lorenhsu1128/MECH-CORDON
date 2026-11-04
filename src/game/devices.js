// Game：地圖互動裝置（docs/map-devices-design.md）——互動鍵、裝置的生成、判定、顯示與同步。
// 判定只在房主／單機（devTick）；裝置的狀態表每個快照都帶（mis.dv），客機照表建立與更新（devApply），
// 所以中途加入與房主遷移不用另外處理。顯示與提示各端自己做（devVisTick、drawDevMarks）。
import { SFX } from '../audio/audio.js';
import { clamp } from '../core/math.js';
import { DS, MS } from '../core/scale.js';
import { DEVICES, DEV_DECAY, DEV_MARK_R } from '../data/devices.js';
import { DEVICE_BUILDERS } from '../render/device-models.js';
import { Game } from './game.js';

const ST_IDLE = 0, // 雷達站：沒有人佔；回復站：可以用；陷阱：待命
  ST_ON = 1, // 雷達站：玩家佔領中
  ST_USED = 2, // 回復站：用完了；陷阱：用過了
  ST_ACT = 3, // 陷阱：作用中
  ST_CD = 4; // 互動型陷阱：冷卻中
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

Object.assign(Game.prototype, {
  // 這一場可以放裝置嗎（自訂關卡由編輯器擺放，第 7 期）
  devAllowed() {
    return !!(
      this.world &&
      !this.pvp &&
      !this.sim &&
      !this.lab &&
      !this.range &&
      !this.tut &&
      !this.cine &&
      !this.airMode &&
      !this.lv
    );
  },
  // 規畫並生成這一場的裝置（房主／單機，據點之後）
  devPlan() {
    this.devClear();
    if (!this.devAllowed()) return;
    const W = this.world;
    const np = this.players && this.players.length ? this.players.length : 1;
    const s = W.start,
      G = this.encGroups || [];
    // 依起點與敵群規畫位置：雷達站在路途的中段、回復站在起點到第一群之間；沒有分群時在玩家附近隨機
    const want = [];
    if (!this.isBossLevel)
      want.push(['radar', s && G.length ? this.devLerp(s, G[(G.length - 1) >> 1].pos, 0.55) : null]);
    want.push(['recharge', s && G.length ? this.devLerp(s, G[0].pos, 0.4) : null]);
    const used = [];
    for (const [k, at] of want) {
      const pt = this.devSpot(at, used);
      if (!pt) continue;
      used.push(pt);
      const d = DEVICES[k];
      this.devAdd({
        i: ++this.devSeq,
        k,
        x: pt.x,
        z: pt.z,
        v: k === 'recharge' ? d.cap + d.capMp * (np - 1) : 0,
      });
    }
    this.trapPlan(used); // 環境陷阱（devices-traps.js）
    this.gunPlan(used); // 固定砲台（devices-guns.js）
  },
  devLerp(s, q, t) {
    return { x: s.x + (q.x - s.x) * t, z: s.z + (q.z - s.z) * t };
  },
  // 空地（不在障礙物、通道、虛空、保留區上，坡度平緩）
  devFree(x, z, pad = 5) {
    const w = this.world;
    if (!w.inZone(x, z, 8 * MS)) return false;
    return (
      w.slopeOK(x, z) &&
      !w.isVoid(x, z) &&
      !w.isReserved(x, z, 3 * MS) &&
      !w.offLimits(x, z) &&
      !w.onCorridor(x, z, 2 * MS) &&
      !w.obstacles.some((o) =>
        o.kind === 'box'
          ? Math.abs(x - o.x) < o.w / 2 + pad * MS && Math.abs(z - o.z) < o.d / 2 + pad * MS
          : Math.hypot(x - o.x, z - o.z) < o.r + pad * MS,
      ) &&
      !(this.caches || []).some((c) => Math.hypot(c.pos.x - x, c.pos.z - z) < 25 * DS)
    );
  },
  // 在 at 附近（由近到遠的螺旋）找空地；at 為 null 時在玩家周圍 40～120 m×DS 隨機找
  devSpot(at, used, pad = 5, strict = false) {
    const far = (x, z) => !used.some((q) => Math.hypot(q.x - x, q.z - z) < 40 * DS);
    if (at) {
      for (let r = 0; r < 60 * DS; r += 3 * DS)
        for (let a = 0; a < 12; a++) {
          const x = at.x + Math.cos((a / 12) * Math.PI * 2 + r) * r,
            z = at.z + Math.sin((a / 12) * Math.PI * 2 + r) * r;
          if (this.devFree(x, z, pad) && far(x, z)) return { x, z };
        }
      if (strict) return null; // 只要 at 附近（陷阱：離敵群太遠就沒有用）
    }
    const p = this.player.pos;
    for (let t = 0; t < 300; t++) {
      const a = Math.random() * Math.PI * 2,
        r = (40 + Math.random() * 80) * DS;
      const x = p.x + Math.cos(a) * r,
        z = p.z + Math.sin(a) * r;
      if (this.devFree(x, z, pad) && far(x, z)) return { x, z };
    }
    return null;
  },
  // 建立裝置（房主與客機共用）：spec＝{ i, k, x, z, y?（朝向：90° 的幾倍）, st?, p?, v?, u? }
  devAdd(spec) {
    const def = DEVICES[spec.k];
    if (!def) return null;
    const W = this.world;
    const pos = new THREE.Vector3(spec.x, W.groundAt(spec.x, spec.z, 999), spec.z);
    const mesh = DEVICE_BUILDERS[spec.k](def.color, spec);
    const yq = (spec.y || 0) & 3,
      yaw = (yq * Math.PI) / 2;
    mesh.position.copy(pos);
    mesh.rotation.y = yaw;
    mesh.scale.setScalar(MS);
    // 互動範圍的地面光環（舊尺度：整個群組乘 MS；互動型陷阱在控制台旁）
    const ring = new THREE.Mesh(
      new THREE.RingGeometry((def.r || 1) - 0.25, def.r || 1, 48),
      new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(def.use ? def.use[0] : 0, 0.12, def.use ? def.use[2] : 0);
    ring.userData.helper = true;
    ring.visible = !!def.r;
    mesh.add(ring);
    mesh.ring = def.r ? ring : null;
    this.scene.add(mesh);
    if (W.protect) W.protect.push(pos.clone());
    const d = {
      id: spec.i,
      kind: spec.k,
      def,
      pos,
      yaw,
      yq,
      mesh,
      st: spec.st || ST_IDLE,
      prog: spec.p || 0,
      val: spec.v || 0,
      user: spec.u || 0,
      obs: [],
      t: 0,
      noiseT: 0,
      glow: [],
    };
    mesh.traverse((o) => {
      if (o.isMesh && o.material && o.material.name === 'glow') d.glow.push(o.material);
    });
    d.usePos = def.use ? pos.clone().add(this.devRot(d, def.use)) : pos;
    // 碰撞（def.solid：舊尺度的 [x, z, 寬, 深, 高]，轉 90° 的幾倍；回復站與冰面是踩上去的，不擋）
    for (const [x, z, w0, d0, h0] of def.solid || []) {
      const c = pos.clone().add(this.devRot(d, [x, 0, z]));
      const w = (yq & 1 ? d0 : w0) * MS,
        dd = (yq & 1 ? w0 : d0) * MS,
        h = h0 * MS;
      const ob = {
        kind: 'box',
        x: c.x,
        z: c.z,
        w,
        d: dd,
        y: pos.y - 0.5,
        top: pos.y + h,
        group: mesh,
        mats: [],
        box: new THREE.Box3(
          new THREE.Vector3(c.x - w / 2, pos.y, c.z - dd / 2),
          new THREE.Vector3(c.x + w / 2, pos.y + h, c.z + dd / 2),
        ),
      };
      W.obstacles.push(ob);
      d.obs.push(ob);
    }
    if (def.trap) this.trapInit(d); // 弱點（devices-traps.js）
    if (def.gun) this.gunInit(d); // 固定砲台（devices-guns.js）
    (this.devs || (this.devs = [])).push(d);
    return d;
  },
  devRemove(d) {
    this.scene.remove(d.mesh);
    if (this.world)
      for (const ob of d.obs) {
        const i = this.world.obstacles.indexOf(ob);
        if (i >= 0) this.world.obstacles.splice(i, 1);
      }
    if (d.mesh.ring) d.mesh.ring.geometry.dispose();
  },
  devClear() {
    for (const d of this.devs || []) this.devRemove(d);
    this.devs = [];
    this.devSeq = 0;
    this.devNear = null;
    this.devIntroSeen = null;
    if (this.hwClear) this.hwClear();
    document.body.classList.remove('devNear');
  },
  // 雷達站佔領中（HUD 顯示全部的敵群、據點、裝置）
  devRadarOn() {
    return (this.devs || []).some((d) => d.kind === 'radar' && d.st === ST_ON);
  },
  // 可以互動的玩家（在範圍內、沒有失衡或 QB 中斷）
  devIn(d, p) {
    return (
      p &&
      !p.dead &&
      !p.downed &&
      !!d.def.r &&
      Math.hypot(p.pos.x - d.usePos.x, p.pos.z - d.usePos.z) < d.def.r * MS &&
      Math.abs(p.pos.y - d.pos.y) < 5 * MS
    );
  },
  devUsable(d) {
    if (d.kind === 'radar') return d.st === ST_IDLE;
    if (d.kind === 'recharge') return d.st === ST_IDLE;
    if (d.def.gun) {
      const p = this.player;
      return (d.st === ST_IDLE && !(p && p.devMount)) || (d.st === ST_ON && !!p && d.user === p.id);
    }
    if (d.def.trig === 'use') return d.st === ST_IDLE;
    return false;
  },
  // ---------- 判定（房主／單機） ----------
  devTick(dt) {
    if (!this.devs || !this.devs.length) return;
    const ps = this.playersAlive().filter((p) => !p.downed);
    for (const d of this.devs) {
      const inside = ps.filter((p) => this.devIn(d, p));
      const holder = inside.find((p) => p.itHeld && !(p.staggerT > 0) && !(p.qbT > 0));
      if (d.kind === 'radar') this.devRadarTick(d, dt, inside, holder);
      else if (d.kind === 'recharge') this.devRechargeTick(d, dt, holder);
      else if (d.def.trap) {
        // 互動型陷阱：按住 hold 秒觸發
        if (d.def.trig === 'use' && d.st === ST_IDLE) {
          if (holder) {
            d.prog = Math.min(1, d.prog + dt / d.def.hold);
            d.user = holder.id;
            if (d.prog >= 1) this.devTrigger(d, holder);
          } else d.prog = Math.max(0, d.prog - (dt / d.def.hold) * DEV_DECAY);
        }
        this.trapActTick(d, dt);
      } else if (d.def.gun) this.gunTick(d, dt, holder);
      else if (d.kind === 'hwpick') this.hwPickTick(d, dt, holder);
    }
    // 撿走的重武器：拿掉（客機照快照的表拿掉）
    for (let j = this.devs.length - 1; j >= 0; j--)
      if (this.devs[j].gone) {
        this.devRemove(this.devs[j]);
        this.devs.splice(j, 1);
      }
    this.hwTick(dt); // 帶著重武器的玩家自動開火（devices-guns.js）
  },
  devRadarTick(d, dt, inside, holder) {
    const def = d.def;
    if (d.st === ST_IDLE) {
      if (holder) {
        d.prog = Math.min(1, d.prog + dt / def.hold);
        d.user = holder.id;
        d.noiseT -= dt;
        if (d.noiseT <= 0) {
          d.noiseT = 0.5;
          this.aiNoise(holder, def.noise * DS);
        }
        if (d.prog >= 1) {
          d.st = ST_ON;
          d.t = 0;
          SFX.cue('cache');
          this.flashMsg(`${holder.name || ''} 佔領雷達站 — 敵人的位置已標示`, def.color, 2.4);
          // 最近的幾台還沒交戰的敵人被派來查看
          const list = this.enemies
            .filter((e) => !e.dead && e.sn && e.sn.st !== 2 && !e.guardOf)
            .sort((a, b) => a.pos.distanceTo(d.pos) - b.pos.distanceTo(d.pos))
            .slice(0, def.squad);
          for (const e of list) e.senseHear(d.pos, 1e9, null);
        }
      } else {
        d.prog = Math.max(0, d.prog - (dt / def.hold) * DEV_DECAY);
        if (!d.prog) d.user = 0;
      }
    } else if (d.st === ST_ON) {
      const foe = this.enemies.some(
        (e) =>
          !e.dead &&
          !e.decoy &&
          e.ai !== 'part' &&
          e.ai !== 'objective' &&
          Math.hypot(e.pos.x - d.pos.x, e.pos.z - d.pos.z) < def.r * MS * 1.5,
      );
      if (foe && !inside.length) {
        d.t += dt;
        d.prog = Math.max(0, 1 - d.t / def.retakeT);
        if (d.t >= def.retakeT) {
          d.st = ST_IDLE;
          d.prog = 0;
          d.t = 0;
          d.user = 0;
          this.flashMsg('雷達站被敵人奪回', 0xff8040, 2);
        }
      } else {
        d.t = Math.max(0, d.t - dt);
        d.prog = 1 - d.t / def.retakeT;
      }
    }
  },
  devRechargeTick(d, dt, holder) {
    const def = d.def;
    d.prog = 0;
    if (d.st !== ST_IDLE || !holder) return;
    const p = holder;
    const hpNeed = Math.max(0, p.maxHp - p.hp),
      enNeed = Math.max(0, p.enMax - p.en);
    if (hpNeed <= 0 && enNeed <= 0) return;
    const hp = Math.min(def.hpRate * p.maxHp * dt, hpNeed, d.val * p.maxHp);
    p.hp += hp;
    p.en = Math.min(p.enMax, p.en + def.enRate * p.enMax * dt);
    d.val = Math.max(0, d.val - hp / p.maxHp);
    d.prog = 1;
    d.user = p.id;
    d.noiseT -= dt;
    if (d.noiseT <= 0) {
      d.noiseT = 1;
      this.aiNoise(p, def.noise * DS);
    }
    if (d.val <= 0.001) {
      d.st = ST_USED;
      d.prog = 0;
      this.flashMsg('回復站的能量用完了', 0x8a97a6, 1.8);
    }
  },
  // ---------- 同步 ----------
  devSnap() {
    if (!this.devs || !this.devs.length) return 0;
    return this.devs.map((d) => [
      d.id,
      d.kind,
      +d.pos.x.toFixed(1),
      +d.pos.z.toFixed(1),
      d.st,
      Math.round(d.prog * 100),
      Math.round((d.def.trap || d.def.gun ? Math.max(0, d.hp) / (d.def.hp || 1) : d.val) * 1000),
      d.user || 0,
      d.yq,
      d.def.gun ? Math.round((d.aim || 0) * 100) : 0,
      d.def.gun ? Math.round(d.heat * 100) + (d.ohT > 0 ? 1000 : 0) : 0,
    ]);
  },
  devApply(arr) {
    if (!this.world) return;
    const ids = new Set();
    for (const [i, k, x, z, st, p, v, u, y, aim, ht] of arr || []) {
      ids.add(i);
      let d = (this.devs || []).find((o) => o.id === i);
      if (!d) d = this.devAdd({ i, k, x, z, y, v: v / 1000 });
      if (!d) continue;
      d.st = st;
      d.prog = p / 100;
      d.val = v / 1000;
      if (d.def.trap || d.def.gun) d.hp = d.val * (d.def.hp || 1);
      d.user = u;
      if (d.def.gun) {
        d.aim = (aim || 0) / 100;
        d.heat = (ht % 1000) / 100;
        d.ohT = ht >= 1000 ? 1 : 0;
      }
    }
    // 砲台上的機體（自己與隊友）：devMount
    const ps = this.players && this.players.length ? this.players : [this.player];
    for (const q of ps) {
      if (!q) continue;
      const d = (this.devs || []).find((o) => o.def.gun && o.st === ST_ON && o.user === q.id);
      q.devMount = d ? d.id : 0;
    }
    if (this.devs)
      for (let j = this.devs.length - 1; j >= 0; j--)
        if (!ids.has(this.devs[j].id)) {
          this.devRemove(this.devs[j]);
          this.devs.splice(j, 1);
        }
  },
  // ---------- 顯示（各端每格） ----------
  devVisTick(dt) {
    const p = this.player;
    let near = null;
    for (const d of this.devs || []) {
      const m = d.mesh;
      if (d.def.gun || d.kind === 'hwpick') {
        this.gunVis(d, dt); // 固定砲台、重武器（devices-guns.js）
        if (p && !p.dead && this.devUsable(d) && this.devIn(d, p)) near = d;
        this.devIntro(d, p);
        continue;
      }
      if (d.def.trap) {
        this.trapVis(d, dt); // 環境陷阱（devices-traps.js）
        if (p && !p.dead && this.devUsable(d) && this.devIn(d, p)) near = d;
        this.devIntro(d, p);
        continue;
      }
      if (d.kind === 'radar' && m.dish)
        m.dish.rotation.y += dt * (d.st === ST_ON ? 1.6 : d.prog > 0 ? 4 : 0.3);
      if (d.kind === 'recharge' && m.core) {
        m.core.rotation.y += dt * (d.prog > 0 ? 3 : 0.5);
        m.core.position.y = 1.6 + Math.sin(this.time * 2) * 0.08;
      }
      // 發光：雷達站佔領中＝亮、沒人佔＝暗；回復站用完＝熄滅
      const lit =
        d.kind === 'recharge'
          ? d.st === ST_USED
            ? 0.05
            : d.prog > 0
              ? 2.2
              : 1
          : d.st === ST_ON
            ? 1.8
            : 0.5 + d.prog;
      for (const g of d.glow) g.emissiveIntensity = lit;
      if (m.ring) m.ring.material.opacity = d.st === ST_USED ? 0.12 : 0.3 + 0.2 * Math.sin(this.time * 3);
      if (p && !p.dead && this.devUsable(d) && this.devIn(d, p)) near = d;
      this.devIntro(d, p);
    }
    this.devNear = near;
    document.body.classList.toggle('devNear', !!near);
    if (p) {
      p.itHeld = !!near && this.act('interact'); // 單機／房主自己的機體（客機另外送輸入）
      const fire = this.act('fireR') || this.act('fireL') || this.act('backL') || this.act('backR');
      p.devTrig = !!p.devMount && fire; // 砲台的射擊鍵（devices-guns.js）
      p.hwTrig = !!p.hw && fire; // 重武器：沒有鎖定時按射擊鍵往準星
      // 自己在砲台上：固定在操作台（客機的自身預測；房主在 gunTick 也固定）
      const md = p.devMount ? (this.devs || []).find((o) => o.id === p.devMount) : null;
      if (md && md.st === ST_ON) this.gunPin(md, p);
    }
    this.hwVis(); // 手上的重武器（devices-guns.js）
  },
  // 第一次看到某種裝置：說明（每場一次）
  devIntro(d, p) {
    if (!p || p.pos.distanceTo(d.pos) > 55 * DS) return;
    const seen = this.devIntroSeen || (this.devIntroSeen = new Set());
    if (seen.has(d.kind)) return;
    seen.add(d.kind);
    this.flashAlert(d.def.tip);
  },
  // ---------- HUD ----------
  drawDevMarks(c, W, H, p) {
    const devs = this.devs || [];
    if (!devs.length) return;
    const radar = this.devRadarOn();
    c.save();
    c.font = 'bold 12px Chakra Petch';
    c.textAlign = 'center';
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(0,0,0,.7)';
    // 雷達站佔領中：每台敵人頭上一個紅色標記（穿過障礙物、不限距離；待機的是暗紅、交戰中的亮紅）
    if (radar)
      for (const e of this.enemies) {
        if (e.dead || e.decoy || e.noLock || e.ai === 'part') continue;
        const s = this.proj(e.pos.clone().setY(e.pos.y + (e.model ? e.model.height : 3) + 2 * MS));
        if (!s.in || s.x < 0 || s.x > W || s.y < 0 || s.y > H) continue;
        const aw = e.sn ? e.senseAw() : e.aw || 0; // 客機用快照的 aw
        const hot = !aw || (aw & 7) - 1 === 2;
        c.globalAlpha = 0.75;
        c.fillStyle = hot ? '#ff4d4d' : '#b04040';
        c.beginPath();
        c.moveTo(s.x - 5, s.y - 6);
        c.lineTo(s.x + 5, s.y - 6);
        c.lineTo(s.x, s.y + 2);
        c.closePath();
        c.stroke();
        c.fill();
      }
    c.globalAlpha = 1;
    for (const d of devs) {
      const used = d.st === ST_USED || (d.def.trap && d.st !== ST_IDLE);
      const col = used ? '#6a7480' : hex(d.def.color);
      const dist0 = d.pos.distanceTo(p.pos);
      if (d.def.trap && d.st === ST_USED && dist0 > 40 * DS) continue; // 用過的陷阱只在附近標示
      const s = this.proj(d.pos.clone().setY(d.pos.y + 6.5 * MS));
      const dist = Math.round(d.pos.distanceTo(p.pos));
      c.fillStyle = col;
      if (s.in && s.x > 0 && s.x < W && s.y > 0 && s.y < H) {
        // 菱形＋名稱＋狀態
        c.beginPath();
        c.moveTo(s.x, s.y - 8);
        c.lineTo(s.x + 8, s.y);
        c.lineTo(s.x, s.y + 8);
        c.lineTo(s.x - 8, s.y);
        c.closePath();
        c.stroke();
        c.fill();
        const tag = d.def.gun
          ? d.st === 5
            ? '（敵人操作中）'
            : d.st === ST_ON
              ? '（使用中）'
              : d.st === ST_USED
                ? '（已摧毀）'
                : '（可以搶）'
          : d.kind === 'hwpick'
            ? '：' + this.hwName(d)
            : d.def.trap
              ? d.st === ST_ACT
                ? '（作用中）'
                : d.st === ST_CD
                  ? `（冷卻 ${Math.ceil(d.prog * d.def.cd)} 秒）`
                  : d.st === ST_USED
                    ? '（已觸發）'
                    : d.def.trig === 'shoot'
                      ? '（打弱點）'
                      : '（控制台）'
              : d.kind === 'radar'
                ? d.st === ST_ON
                  ? '（已佔領）'
                  : ''
                : d.st === ST_USED
                  ? '（用完）'
                  : `（剩 ${Math.round(d.val * 100)}%）`;
        const label = `${d.def.name}${tag} ${dist}m`;
        c.strokeText(label, s.x, s.y - 14);
        c.fillText(label, s.x, s.y - 14);
      } else if (!used && (dist < DEV_MARK_R * DS || radar)) {
        const cx = W / 2,
          cy = H / 2;
        let dx = s.x - cx,
          dy = s.y - cy;
        if (!s.in) {
          dx = -dx;
          dy = -dy;
        }
        const ang = Math.atan2(dy, dx);
        const k2 = Math.min(
          Math.abs((W / 2 - 90) / (Math.cos(ang) || 1e-6)),
          Math.abs((H / 2 - 130) / (Math.sin(ang) || 1e-6)),
        );
        c.save();
        c.globalAlpha = 0.55;
        c.translate(cx + Math.cos(ang) * k2, cy + Math.sin(ang) * k2);
        c.rotate(ang);
        c.beginPath();
        c.moveTo(10, 0);
        c.lineTo(-6, -7);
        c.lineTo(-6, 7);
        c.closePath();
        c.stroke();
        c.fill();
        c.restore();
      }
    }
    // 互動提示與進度環（靠近可以用的裝置；或自己正在佔領的）
    this.gunHud(c, W, H, p); // 砲台上與重武器（devices-guns.js）
    const d = this.devNear;
    if (d && !(d.def.gun && d.st === ST_ON)) {
      const key = this.devKeyLabel();
      const txt = d.def.hold
        ? `${key} 按住 ${d.def.verb}${d.kind === 'hwpick' ? this.hwName(d) : d.def.name}`
        : `${key} 按住 ${d.def.verb}（剩 ${Math.round(d.val * 100)}%）`;
      const y = H * 0.72;
      c.font = 'bold 15px Chakra Petch';
      c.strokeText(txt, W / 2, y);
      c.fillStyle = hex(d.def.color);
      c.fillText(txt, W / 2, y);
      if (d.def.hold && d.prog > 0) {
        c.lineWidth = 5;
        c.strokeStyle = 'rgba(0,0,0,.6)';
        c.beginPath();
        c.arc(W / 2, y - 34, 16, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = hex(d.def.color);
        c.beginPath();
        c.arc(W / 2, y - 34, 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(d.prog, 0, 1));
        c.stroke();
      }
    }
    c.restore();
  },
  devKeyLabel() {
    if (this.touchActive) return '「互動」';
    if (this.padActive && this.padConnected) return '[' + this.padLabel(this.padmap.interact) + ']';
    return '[' + this.keyLabel(this.keymap.interact) + ']';
  },
});
