// ---------- MechEntity 擴充：機獸的地形貼合、專屬音效與特效（docs/beast-design.md 的「音效與特效」「腳貼斜坡」）----------
// 全部由 beastFx 每格呼叫（房主與客機各自算、不轉送：依據只有位置、朝向、bossVis 的片段編號與 AP）：
//   beastTerrain：四隻腳（或身體四角）下面的地面高度 → 四足的每隻腳各自貼地＋身體的俯仰與側傾（animateBeast 的 st.gy）、
//                 兩足的兩隻腳各自貼地、節肢的整隻順著地面傾斜（網格的旋轉）
//   beastLocalFx：登場與換型態的吼聲、出招前的低吼、每一招出手那一下的特效（爪痕、砸地、咬、刺、迴旋）、腳步、拍翼、落地
import { SFX } from '../audio/audio.js';
import { clamp } from '../core/math.js';
import { MS } from '../core/scale.js';
import { clipDur } from '../render/beast-anim.js';
import { PALETTES } from '../render/materials.js';
import { MechEntity } from './mech-entity.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// 每隻的聲音：[吼聲的鍵, 音高, 體重（腳步與震動的大小 0～1）]
const VOICE = {
  lion: ['~roarL', 1, 0.8],
  tiger: ['~roarL', 1.22, 0.7],
  bear: ['~roarH', 0.92, 1],
  gorilla: ['~roarH', 1.12, 1],
  turtle: ['~rumble', 1, 1],
  raptor: ['~screech', 1, 0.55],
  scorpion: ['~chitter', 0.82, 0.5],
  mantis: ['~chitter', 1.2, 0.45],
};
// 出手那一下的特效種類（照招式的名稱）：claw 爪／鐮／翼刃、bite 咬／啄／夾、sting 尾刺、spin 迴旋與甩尾、slam 砸地（其他）
const kindOf = (name, M) =>
  /Sting/.test(name)
    ? 'sting'
    : /Spin|[tT]ail|Sweep|Swing/.test(name)
      ? 'spin'
      : /[cC]law|Slash|Cross|Kick|Fang/.test(name)
        ? 'claw'
        : /[bB]ite|Snap|Peck|Pinch|Grab|Hug/.test(name)
          ? 'bite'
          : M.ram !== undefined && !/Leap|Dive|pounce/.test(name)
            ? 'ram'
            : 'slam';
const ROAR = /[rR]oar|Snarl|Drum|Screech|Threat|Shake|Stand/;
const TILT_MAX = 0.42; // 順著地面傾斜的上限（弧度）

Object.assign(MechEntity.prototype, {
  // 點綴色（配色的 acc）
  beastAccent() {
    if (this.bAcc === undefined) {
      const P = PALETTES[(this.beastInfo() || {}).kind];
      this.bAcc = (P && P.acc) || 0xffa040;
    }
    return this.bAcc;
  },
  // 機獸座標（+x 右、−z 前；模型的公尺）的點 → 世界座標的地面高度（相對 pos.y）
  beastGroundRel(lx, lz, sc) {
    const c = Math.cos(this.yaw),
      s = Math.sin(this.yaw);
    const wx = this.pos.x + (lx * c + lz * s) * sc,
      wz = this.pos.z + (-lx * s + lz * c) * sc;
    return clamp(this.game.world.groundAt(wx, wz, this.pos.y + 1.2 * MS) - this.pos.y, -4, 4);
  },
  // 地形貼合：回傳給 animateBeast 的 gy（四足 fl／fr／bl／br、兩足 l／r；模型的公尺），節肢的直接轉網格
  beastTerrain(dt, F, rig, sc, air) {
    const w = this.game.world,
      an = rig.an;
    if (!an || !w) return null;
    if (this.game.beastFlat) {
      // 測試的對照：不貼合
      F.gy = null;
      F.dy = 0;
      this.mesh.rotation.x = this.mesh.rotation.z = 0;
      return null;
    }
    // 在空中（飛、跳、撲）、鑽在地下、倒下之後：慢慢回到水平
    const gap = this.pos.y - w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6 * MS);
    const on = !air && gap < 1.2 && this.mesh.visible;
    F.gk = (F.gk === undefined ? (on ? 1 : 0) : F.gk) + ((on ? 1 : 0) - (F.gk || 0)) * Math.min(1, dt * 6);
    const k = Math.min(1, dt * 9);
    const G = F.gy || (F.gy = {});
    const put = (key, v) => (G[key] = (G[key] || 0) + (v * F.gk - (G[key] || 0)) * k);
    const kind = rig.kind;
    if (kind === 'scorpion' || kind === 'mantis') {
      // 節肢：身體四角的高度 → 整隻的俯仰與側傾（腿跟著身體的平面）
      const a = (this.radius * 0.55) / sc,
        b = (this.radius * 0.45) / sc;
      const hf = this.beastGroundRel(0, -a, sc),
        hb = this.beastGroundRel(0, a, sc),
        hr = this.beastGroundRel(b, 0, sc),
        hl = this.beastGroundRel(-b, 0, sc);
      put('p', clamp(Math.atan2(hf - hb, 2 * a * sc), -TILT_MAX, TILT_MAX));
      put('r', clamp(Math.atan2(hr - hl, 2 * b * sc), -TILT_MAX, TILT_MAX));
      put('y', clamp((hf + hb + hr + hl) / 4, -0.6, 1.5) * 0.5);
      this.mesh.rotation.order = 'YXZ';
      this.mesh.rotation.x = G.p;
      this.mesh.rotation.z = G.r;
      F.dy = G.y;
      return null;
    }
    F.dy = 0;
    if (kind === 'raptor') {
      for (const L of an.legs) put(L.s, this.beastGroundRel(L.gx, 0, sc) / sc);
      return G;
    }
    for (const L of an.legs) put(L.key, clamp(this.beastGroundRel(L.gx, L.gz, sc) / sc, -1.6, 1.6));
    return G;
  },
  // 一個聲音（不轉送：各端自己算）
  beastSnd(k, vol, rate, pos, gap = 0.05) {
    SFX.play(k, vol, rate, 0.05, gap, pos || this.center(), null, 0, { pr: 1.6, max: 3 });
  },
  beastVoiceOf() {
    return VOICE[String((this.beastInfo() || {}).kind || '').replace('beast_', '')] || VOICE.lion;
  },
  beastVoice(vol, rateK = 1, key) {
    const v = this.beastVoiceOf();
    this.beastSnd(key || v[0], vol, v[1] * rateK, this.center(), 0.25);
  },
  // 出手那一下的特效與聲音（c＝地面上的判定中心、R＝判定半徑，世界尺寸）
  beastStrikeFx(name, M, c, R) {
    const g = this.game,
      fx = g.fx,
      K = fx.k || 1,
      acc = this.beastAccent(),
      v = this.beastVoiceOf(),
      wt = v[2];
    const kind = kindOf(name, M);
    const up = V(c.x, c.y + Math.min(2.5, R * 0.35), c.z);
    const left = /L$/.test(name);
    if (kind === 'claw') {
      // 三道平行的爪痕（點綴色）＋飛散的火花
      for (let i = 0; i < 3; i++)
        fx.slash(
          up.clone().setY(up.y + i * 0.5),
          this.yaw,
          105,
          R * (0.72 + i * 0.16),
          acc,
          left,
          0.45,
          0.26,
        );
      fx.streaks(up, 14, 0xffe0b0, 26, 0.3, 26);
      fx.flash(up, (R * 0.35) / K, acc, 0.1);
      this.beastSnd('~claw', 0.9, 0.85 + (1 - wt) * 0.5, up);
      this.beastSnd('~thB', 0.5 * wt + 0.2, 0.9, up);
    } else if (kind === 'spin') {
      // 迴旋：一整圈的刀光＋貼地的衝擊環與揚塵
      fx.slash(up, this.yaw, 360, R, acc, false, 0.12, 0.34, true);
      fx.shockwave(c, R / K, acc, 0.4);
      fx.dust(c, (R * 0.5) / K, 12);
      this.beastSnd('~claw', 1, 0.6 + (1 - wt) * 0.3, up);
      this.beastSnd('~thC', 0.6, 1, c);
    } else if (kind === 'bite') {
      // 咬合／夾：白色的閃光＋往兩側噴的火花＋金屬的喀
      fx.flash(up, (R * 0.4) / K, 0xfff0d0, 0.09);
      fx.star && fx.star(up, (R * 0.3) / K, 0xfff0d0);
      fx.streaks(up, 18, 0xffd890, 30, 0.28, 30);
      fx.spark(up, acc);
      this.beastSnd('~tink3', 1, 0.55, up);
      this.beastSnd('~thB', 0.7, 0.8, up);
    } else if (kind === 'sting') {
      // 尾刺：從上往下的一道光＋點綴色的濺射＋地上的坑
      fx.streaks(V(c.x, c.y + R * 1.2, c.z), 10, acc, 40, 0.22, 0, V(0, -1, 0), 0.25);
      fx.flash(c, (R * 0.45) / K, acc, 0.14);
      fx.shockwave(c, (R * 0.7) / K, acc, 0.3);
      fx.streaks(c, 12, acc, 18, 0.4, 24);
      if (fx.rich && fx.crater) fx.crater(c.x, c.y, c.z, R * 0.8);
      this.beastSnd('~zapC', 0.8, 0.7, c);
      this.beastSnd('~thB', 0.8, 0.75, c);
    } else {
      // 砸地／衝撞：衝擊環、沙柱與揚塵、裂開的坑、飛起來的碎屑
      const big = kind === 'slam';
      fx.shockwave(c, (R * (big ? 1.15 : 0.8)) / K, 0xffd090, big ? 0.5 : 0.35);
      fx.dust(c, (R * 0.6) / K, big ? 16 : 10);
      if (fx.rich) {
        fx.groundBlast && fx.groundBlast(c, (R * 0.5) / K, big);
        if (big && fx.crater) fx.crater(c.x, c.y, c.z, R * 1.3);
      }
      fx.streaks(V(c.x, c.y + 0.5, c.z), big ? 16 : 8, 0xd8c8a8, 22, 0.5, 40);
      if (big) fx.flash(V(c.x, c.y + 1, c.z), (R * 0.3) / K, acc, 0.1);
      this.beastSnd('~thC', 1, 0.75 + (1 - wt) * 0.3, c);
      this.beastSnd('heavy', 0.7, 0.75, c);
    }
    // 近的時候鏡頭震動（各端依自己的玩家）
    const p = g.player;
    if (p && !p.dead) {
      const d = Math.hypot(p.pos.x - c.x, p.pos.z - c.z);
      const s = (kind === 'slam' ? 0.4 : 0.22) * wt * clamp(1.4 - d / (R + 45), 0, 1);
      if (s > 0.02) g.camShake = Math.max(g.camShake || 0, s);
    }
  },
  // 每格（房主與客機）：登場、換型態、片段、腳步、拍翼、落地
  beastLocalFx(dt, F, name, rig, sc, B) {
    const g = this.game,
      fx = g.fx;
    if (!fx || !B || dt <= 0) return;
    // 房主：這裡的特效與聲音各端自己算，不轉送
    const nested = fx._nested,
      mir = SFX.mirror;
    fx._nested = true;
    SFX.mirror = null;
    try {
      this.beastLocalFx0(dt, F, name, rig, sc, B);
    } finally {
      fx._nested = nested;
      SFX.mirror = mir;
    }
  },
  beastLocalFx0(dt, F, name, rig, sc, B) {
    const g = this.game,
      fx = g.fx,
      K = fx.k || 1,
      acc = this.beastAccent(),
      v = this.beastVoiceOf(),
      wt = v[2];
    const S =
      F.s || (F.s = { name: null, ph: this.bossPhase ? this.bossPhase() : 1, si: -1, flap: 0, air: false });
    const c0 = this.center();
    // ---- 登場：吼一聲 ----
    if (!S.born) {
      S.born = true;
      if (!this.dead) {
        this.beastVoice(1, 1);
        fx.shockwave(this.pos.clone(), (this.radius * 1.6) / K, acc, 0.6);
      }
    }
    // ---- 換型態：吼聲＋點綴色的爆發 ----
    const ph = this.dead ? S.ph : this.bossPhase ? this.bossPhase() : 1;
    if (ph > S.ph) {
      S.ph = ph;
      this.beastVoice(1, 0.86);
      fx.shockwave(this.pos.clone(), (this.radius * 2.2) / K, acc, 0.7);
      fx.flash(c0, (this.radius * 0.9) / K, acc, 0.25);
      fx.streaks(c0, 26, acc, 30, 0.6, 12);
      g.camShake = Math.max(g.camShake || 0, 0.3 * wt);
    }
    // ---- 片段開始 ----
    const M = name && B.melee ? B.melee[name] : null;
    if (name !== S.name) {
      S.name = name;
      if (name === (B.death || 'death')) this.beastVoice(1, 0.7);
      else if (name === (B.stag || 'stagger')) {
        this.beastVoice(0.8, 1.35);
        fx.streaks(c0, 16, 0xffe0a0, 24, 0.4, 30);
      } else if (M)
        this.beastVoice(0.55, 1, '~growl'); // 出招前的低吼（每隻的音高不同）
      else if (name && ROAR.test(name)) {
        this.beastVoice(0.95, 1);
        fx.shockwave(c0, (this.radius * 1.4) / K, acc, 0.5);
      }
    }
    // ---- 出手那一下（片段的時間跨過出手的時間；連打每一下都有）----
    if (M && !this.dead) {
      const t1 = F.ct,
        t0 = t1 - dt;
      const cross = (T) => T !== undefined && t0 < T && t1 >= T;
      const R = M.R * sc;
      if (M.hits) {
        for (const T of M.hits) if (cross(T)) this.beastStrikeFx(name, M, this.beastSpot(M), R);
      } else if (cross(M.leap ? Math.min(M.t, clipDur(name) - 0.02) : M.t)) {
        const c = M.leap || M.ram !== undefined ? this.pos.clone() : this.beastSpot(M);
        this.beastStrikeFx(name, M, c, R);
      }
    }
    // ---- 落地（從空中回到地面：撲擊、跳躍、躍過障礙、降落、鑽出來）----
    const w = g.world;
    const gap = this.pos.y - w.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6 * MS);
    const air = gap > 1.5 || !this.mesh.visible;
    if (S.air && !air && !this.dead) {
      fx.dust(this.pos.clone(), (this.radius * 0.8) / K, 14);
      fx.shockwave(this.pos.clone(), (this.radius * 1.1) / K, 0xd8c8a8, 0.4);
      if (fx.rich && fx.groundBlast) fx.groundBlast(this.pos.clone(), (this.radius * 0.4) / K, false);
      this.beastSnd('~thC', 0.9, 0.8 + (1 - wt) * 0.3, this.pos);
      this.beastSnd('~bstep', 0.8, 0.9, this.pos);
    }
    S.air = air;
    // ---- 拍翼（在空中飛的）----
    if ((this.bossVis || 0) & 32 && !this.dead) {
      S.flap -= dt;
      if (S.flap <= 0) {
        S.flap = 0.58;
        this.beastSnd('~flap', 0.7, 1, c0, 0.2);
        // 飛得低的時候把地上的沙塵吹開
        if (gap < 14 && fx.downwash)
          fx.downwash(this.pos.x, this.pos.y - gap, this.pos.z, sc, clamp(1 - gap / 14, 0, 1));
      }
    }
    // ---- 腳步：照步伐的相位，每一步一聲＋腳下的揚塵 ----
    const an = rig.an;
    if (an && an.legs && !name && !air && !this.dead && Math.abs(F.v) > 2.5) {
      const n = an.legs.length === 2 ? 2 : 4;
      const si = Math.floor((an.ph || 0) * n);
      if (si !== S.si) {
        S.si = si;
        const L = an.legs[(si * (an.legs.length > 4 ? 3 : 1)) % an.legs.length];
        const lx = L.d ? L.gx + L.d[0] * L.R : L.gx,
          lz = L.d ? L.gz + L.d[1] * L.R : L.gz || 0;
        const cy = Math.cos(this.yaw),
          sy = Math.sin(this.yaw);
        const p = V(this.pos.x + (lx * cy + lz * sy) * sc, 0, this.pos.z + (-lx * sy + lz * cy) * sc);
        p.y = w.groundAt(p.x, p.z, this.pos.y + 1.2 * MS);
        const run = clamp(Math.abs(F.v) / ((B.run || 60) * 0.8), 0.3, 1);
        fx.dust(p, (this.radius * 0.16 * (0.6 + run * 0.6)) / K, run > 0.7 ? 6 : 4);
        this.beastSnd('~bstep', (0.25 + 0.5 * wt) * (0.6 + 0.4 * run), 1.5 - 0.6 * wt, p, 0.04);
        const pl = g.player;
        if (pl && !pl.dead && wt > 0.6) {
          const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
          if (d < 45) g.camShake = Math.max(g.camShake || 0, 0.07 * wt * run * (1 - d / 45));
        }
      }
    }
  },
});
