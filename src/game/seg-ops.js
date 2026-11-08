// Game：主線擴充的新區段類型（docs/campaign-expansion-design.md 的 A）——潛入 stealth、撤離 extract。
// 每種類型的處理照命名掛在 Game 上，campaign.js 依區段類型呼叫（沒有就略過）：
//   segSpawn_<type>(L, comp) 生成敵人與目標、segPost_<type>() 地圖裝置與掉落物之後（devPlan、planVehicles 會清掉它們）、
//   segTick_<type>(dt) 每格（房主／單機）、segBlock_<type>() 回傳 true＝還不算清除、segGoal_<type>(alive) HUD 的目標、
//   segView_<type>() 給客機的顯示資料（快照 campView 的 sv）、segClear_<type>() 拿掉光環。
// 判定都在房主／單機；客機照 campView 的 sv 畫光環，探照燈塔是地圖裝置（devices.js 的狀態表同步）。
import { SFX } from '../audio/audio.js';
import { clamp, pick } from '../core/math.js';
import { DS, MS } from '../core/scale.js';
import { DEVICES } from '../data/devices.js';
import { Game } from './game.js';

// 潛入
const ST = {
  WIPE: 60, // 警報後資料被刪除的倒數（秒）：來不及下載完只拿到一半的經驗
  EXTRA: 28, // 警報後、下載完之前，保全部隊每隔幾秒從邊緣增援
  LIGHTS: [3, 5], // 探照燈塔的數量（依敵群數）
  BONUS: [3000, 1200], // 未被發現的報酬：COAM＝a＋b×等級
};
// 撤離
const EX = {
  WAIT: 90, // 呼叫後回收機抵達的秒數
  LOAD: 5, // 站在回收地點裝載的秒數
  WAVE: 18, // 等待中每隔幾秒一波增援
  SALV: 6, // 回收物資的箱數
  SALV_V: [1500, 400], // 每箱 COAM＝a＋b×等級（撤離成功才入帳）
  R: 6 * MS, // 回收地點的半徑
};
const LZ_COL = 0xffa040,
  LZ_OK = 0x7ee081;

Object.assign(Game.prototype, {
  // 依區段類型找處理函式（沒有＝null）
  segH(kind, type) {
    const t = type || (this.camp && this.camp.ss && this.camp.ss.type);
    const f = t && this['seg' + kind + '_' + t];
    return typeof f === 'function' ? f : null;
  },

  // ================= 潛入 =================
  segSpawn_stealth(L, comp) {
    const ss = this.camp.ss;
    // 敵群都在原地待機；分波的增援（encSpawn 排的）先收起來，警報時才派出
    this.spawnComp(comp(L - 1), 1, this.scaleHp, this.scaleDmg);
    ss.st = { alarm: false, wipe: 0, partial: false, reserve: this.waves, extraT: ST.EXTRA, why: '' };
    this.waves = [];
    const pos = this.campAtGroups(1, true)[0];
    ss.intel = { pos, t: 0, done: false, group: this.campRing(pos, 0x7fc8ff, '資料終端') };
    this.flashAlert('潛入任務：不被發現就能拿到全部的報酬 — 從背後近戰可以無聲擊破');
  },
  // 探照燈塔：放在各敵群與起點之間（devPlan 之後，它會清掉裝置）
  segPost_stealth() {
    const G = this.encGroups || [],
      s = this.world.start;
    const n = clamp(G.length + 1, ST.LIGHTS[0], ST.LIGHTS[1]);
    const used = (this.devs || []).map((d) => ({ x: d.pos.x, z: d.pos.z }));
    const at = [];
    for (let i = 0; i < n; i++) {
      const g = G.length ? G[i % G.length].pos : null;
      at.push(g && s ? this.devLerp(g, s, i < G.length ? 0.28 : 0.5) : g);
    }
    for (const a of at) {
      const pt = this.devSpot(a, used, 2.5, !!a, 22) || this.devSpot(a, used, 1.5, false, 16);
      if (!pt) continue;
      used.push(pt);
      this.devAdd({ i: ++this.devSeq, k: 'seclight', x: pt.x, z: pt.z, y: 0, v: 1 });
    }
  },
  // 潛入中（還沒警報）：給 mech-sense.js 用——安靜移動（沒有 QB、推進、開火）的玩家，近距離也要在視角內才看得到
  segQuiet(c) {
    const ss = this.camp && this.camp.ss;
    if (!ss || !ss.st || ss.st.alarm) return false;
    return !(c.boost || c.qbT > 0 || c.firedT > 0);
  },
  segStealthOn() {
    const ss = this.camp && this.camp.ss;
    return !!(ss && ss.st && !ss.st.alarm);
  },
  // 警報（房主／單機）：全部交戰、派出收起來的增援、資料開始被刪除
  segAlarm(why) {
    const ss = this.camp && this.camp.ss;
    if (!ss || !ss.st || ss.st.alarm) return;
    const st = ss.st;
    st.alarm = true;
    st.why = why;
    if (ss.intel && !ss.intel.done) st.wipe = ST.WIPE;
    this.flashMsg(`警報 — ${why}`, 0xff4d4d, 2.6, { k: 'warn', m: '警報', s: why });
    const pl = this.playersAlive();
    if (this.player) SFX.play('alarm', 0.9, 1, 0, 0, this.player.pos);
    for (const e of this.enemies) {
      if (e.dead || !e.sn || e.sn.st === 2 || e.guardOf) continue;
      let t = pl[0],
        bd = 1e9;
      for (const p of pl) {
        const d = p.pos.distanceTo(e.pos);
        if (d < bd) ((bd = d), (t = p));
      }
      if (t) e.senseEngage(t, false);
    }
    this.waves = st.reserve || [];
    st.reserve = [];
    if (this.waves.length) this.waveLaunch();
    this.campComm('alarm', this.campCtx());
  },
  segTick_stealth(dt) {
    const ss = this.camp.ss,
      st = ss.st;
    if (!st) return;
    if (!st.alarm) {
      // 有敵人進入交戰（看到、被打到又沒死）＝警報
      for (const e of this.enemies)
        if (!e.dead && e.sn && e.sn.st === 2 && !e.guardOf) return this.segAlarm('敵人發現了你');
      return;
    }
    if (ss.intel && !ss.intel.done) {
      if (st.wipe > 0 && (st.wipe -= dt) <= 0 && !st.partial) {
        st.partial = true;
        this.flashMsg('資料遭到刪除 — 只能取回一部分', 0xff8a50, 2.4, { k: 'warn' });
      }
      if ((st.extraT -= dt) <= 0) {
        st.extraT = ST.EXTRA;
        const tgt = pick(this.playersAlive()) || this.player;
        const at = this.waveEdgePoint(tgt.pos);
        this.spawnLater(this.rollComp(Math.max(1, this.campLevel() - 1), ss.np || 1).slice(0, 3), at);
        this.flashAlert('保全部隊增援');
      }
    }
  },
  // 資料終端下載完（campTick 的情報呼叫）：v＝情報的經驗；未被發現的報酬、被刪掉一部分時經驗減半；之後直接清除
  segIntelDone_stealth(v) {
    const c = this.camp,
      st = c.ss.st;
    if (!st) return;
    if (st.partial) c.xpBonus -= Math.round(v / 2);
    if (!st.alarm) {
      const L = this.campLevel();
      const b = Math.round((ST.BONUS[0] + ST.BONUS[1] * L) / 100) * 100;
      this.save.coam += b;
      this.missionEarned = (this.missionEarned || 0) + b;
      this.bountyPops.push({ txt: '+' + b.toLocaleString() + ' COAM', life: 2.2, y: 0 });
      this.writeSave();
      if (this.campMp()) this.campMpCoam(b);
      setTimeout(
        () =>
          this.camp &&
          this.flashMsg(`未被發現 — 潛入報酬 +${b.toLocaleString()} COAM`, 0xffc040, 2.6, {
            k: 'good',
            m: '未被發現',
            s: `潛入報酬 +${b.toLocaleString()} COAM`,
          }),
        900,
      );
    }
    st.done = true;
    // 不必全滅：下載完就開出口（最後一段＝出擊完成）
    if (!c.cleared) this.campCleared();
  },
  segGoal_stealth(alive) {
    const ss = this.camp.ss,
      st = ss.st;
    if (!st || !ss.intel || ss.intel.done) return null;
    const s = !st.alarm
      ? '未被發現'
      : st.partial
        ? '警報中：資料已被刪除一部分'
        : `警報！資料刪除倒數 ${Math.ceil(st.wipe)} 秒`;
    return `${s} ｜ 前往資料終端下載情報${st.alarm ? ` ｜ 敵軍 ${alive}` : ''}`;
  },
  segView_stealth() {
    const st = this.camp.ss.st;
    return st ? { al: st.alarm ? 1 : 0 } : null;
  },

  // 探照燈塔（地圖裝置 seclight，devices.js 的 devTick 呼叫；房主／單機）：來回掃描，照到玩家一段時間＝警報。
  // d.prog＝目前的方位（0～1 一圈，給客機畫光束）、d.user＝1 照到玩家（燈變紅）
  secLightTick(d, dt, ps) {
    const D = DEVICES.seclight;
    if (d.st !== 0) {
      d.user = 0;
      return;
    }
    if (d.base === undefined) {
      const s = this.world.start;
      d.base = s ? Math.atan2(s.x - d.pos.x, s.z - d.pos.z) : Math.random() * Math.PI * 2;
      d.ph = Math.random() * 6;
      d.meter = 0;
    }
    d.ph += dt * D.speed;
    const a = d.base + Math.sin(d.ph) * D.sweep;
    d.prog = (((a / (Math.PI * 2)) % 1) + 1) % 1;
    // 光束的起點：燈面前方（從燈頭中心往下看會被塔自己的碰撞方塊擋住）
    const head = d.pos.clone();
    head.y += D.wp[1] * MS;
    head.x += Math.sin(a) * 1.2 * MS;
    head.z += Math.cos(a) * 1.2 * MS;
    let seen = false;
    const W = this.world;
    for (const p of ps) {
      const dx = p.pos.x - d.pos.x,
        dz = p.pos.z - d.pos.z;
      const r = Math.hypot(dx, dz);
      if (r > D.len * DS || r < D.near * DS) continue;
      let da = Math.atan2(dx, dz) - a;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > D.ang) continue;
      if (W.losBlocked(head, p.center())) continue;
      seen = true;
    }
    d.user = seen ? 1 : 0;
    d.meter = clamp(d.meter + (seen ? dt / D.spotT : -dt * 0.5), 0, 1);
    if (seen && !d.beep) {
      d.beep = true;
      SFX.play('alarm', 0.45, 1.4, 0.05, 0.3, head);
    } else if (!seen) d.beep = false;
    if (d.meter >= 1 && this.segStealthOn()) this.segAlarm('探照燈照到了你');
  },
  // 探照燈塔的外觀（各端每格；trapVis 之後）
  secLightVis(d) {
    const m = d.mesh;
    if (!m.head) return;
    const on = d.st === 0;
    m.head.rotation.y = d.prog * Math.PI * 2 - (d.yaw || 0);
    if (m.beam) {
      m.beam.visible = on;
      const red = d.user ? 1 : 0;
      m.beam.material.color.setHex(red ? 0xff4030 : 0xfff0c8);
      m.beam.material.opacity = (red ? 0.2 : 0.11) * (0.85 + 0.15 * Math.sin(this.time * 9));
    }
    if (m.lens) m.lens.material.emissive.setHex(!on ? 0x111111 : d.user ? 0xff3020 : 0xfff2d0);
  },

  // ================= 撤離 =================
  segSpawn_extract(L, comp) {
    const ss = this.camp.ss;
    this.spawnComp(comp(L - 1), 1, this.scaleHp, this.scaleDmg);
    ss.targets = this.campAtGroups(L >= 4 ? 2 : 1, true).map((pos) => this.campObjective(pos, 'enemy'));
    ss.ext = { ph: 0, t: 0, loot: 0, n: 0, lz: null, waveT: 0, k: 0 };
    this.flashAlert('撤離任務：摧毀目標後回收機出發 — 回收物資要撤離成功才帶得走');
  },
  // 回收物資散在場上（planVehicles 之後，它會清掉掉落物）
  segPost_extract() {
    const W = this.world;
    for (const p of this.campSpots(EX.SALV, 'inner'))
      this.spawnPickup('salvage', new THREE.Vector3(p.x, W.groundAt(p.x, p.z, p.y + 3 * MS) + 0.6, p.z));
  },
  // 撿到回收物資（collectPickup；房主／單機）
  segSalvage(ent) {
    const ext = this.camp && this.camp.ss && this.camp.ss.ext;
    if (!ext) return false;
    const L = this.campLevel();
    ext.loot += Math.round((EX.SALV_V[0] + EX.SALV_V[1] * L) / 100) * 100;
    ext.n++;
    this.flashMsg(`${ent.name} 回收物資 ×${ext.n}（撤離成功才入帳）`, 0xffc040, 1.6);
    return true;
  },
  segTick_extract(dt) {
    const c = this.camp,
      ss = c.ss,
      ext = ss.ext;
    if (!ext) return;
    if (ext.ph === 0) {
      if (!ss.targets.every((e) => e.dead)) return;
      // 目標全毀：呼叫回收機，回收地點在離玩家遠的地方
      ext.ph = 1;
      ext.t = EX.WAIT;
      ext.waveT = 6;
      const cand = this.campSpots(3, 'inner');
      const ps = this.playersAlive();
      const far = (q) => Math.min(...ps.map((p) => Math.hypot(p.pos.x - q.x, p.pos.z - q.z)), 1e9);
      const pos = cand.sort((a, b) => far(b) - far(a))[0];
      ext.lz = { pos, t: 0, group: null };
      this.segLzRing();
      this.flashMsg(`目標摧毀 — 回收機 ${EX.WAIT} 秒後抵達`, 0xffa040, 2.6, {
        k: 'info',
        m: '呼叫回收機',
        s: `${EX.WAIT} 秒後抵達回收地點`,
      });
      this.campComm('extCall', this.campCtx());
      return;
    }
    if (ext.ph === 1) {
      ext.t -= dt;
      ext.waveT -= dt;
      if (ext.waveT <= 0 && ext.t > 8) {
        ext.waveT = EX.WAVE;
        ext.k++;
        const L = this.campLevel() - 1 + Math.floor(ext.k / 2);
        const list = this.rollComp(Math.max(1, L), ss.np || 1)
          .filter((t) => t !== 'ac')
          .slice(0, 2 + ext.k);
        if (ext.k >= 4 && !ext.ace) {
          ext.ace = true;
          list.push('ac'); // 最後一波有敵對 AC
        }
        const tgt = pick(this.playersAlive()) || this.player;
        const at = this.waveEdgePoint(tgt.pos);
        const W = this.world;
        const base = new THREE.Vector3(at.x, W.groundAt(at.x, at.z, 999), at.z);
        this.fx.warnLine(base, base.clone().setY(base.y + 45), 3.5, 0xff3030, 0.5);
        this.spawnLater(list, at);
        this.flashAlert(ext.ace && ext.k >= 4 ? '敵對 AC 接近！' : `敵方增援（第 ${ext.k} 波）`);
      }
      if (ext.t <= 0) {
        ext.ph = 2;
        this.segLzRing();
        this.flashMsg('回收機抵達 — 進入回收地點裝載物資', LZ_OK, 2.6, {
          k: 'good',
          m: '回收機抵達',
          s: '進入回收地點裝載物資',
        });
      }
    }
    if (ext.ph === 2) {
      const lz = ext.lz;
      const on = this.campMp()
        ? this.campStandAny(lz, dt, EX.R)
        : !this.player.dead && this.campStand(lz, dt, EX.R)
          ? this.player
          : null;
      if (on && on === this.player) c.hint = `裝載中… ${Math.min(100, Math.round((lz.t / EX.LOAD) * 100))}%`;
      if (lz.t >= EX.LOAD) this.segExtractDone();
    }
    if (ext.lz && ext.lz.group) ext.lz.group.userData.ring.rotation.z += dt * (ext.ph === 2 ? 2 : 0.6);
  },
  // 裝載完成：物資入帳、剩下的敵軍撤退，之後照一般的清除（開出口／出擊完成）
  segExtractDone() {
    const c = this.camp,
      ext = c.ss.ext;
    ext.ph = 3;
    const v = ext.loot;
    if (v > 0) {
      this.save.coam += v;
      this.missionEarned = (this.missionEarned || 0) + v;
      this.bountyPops.push({ txt: '+' + v.toLocaleString() + ' COAM', life: 2.2, y: 0 });
      this.writeSave();
      if (this.campMp()) this.campMpCoam(v);
    }
    this.flashMsg(
      ext.n ? `撤離成功 — 回收物資 ${ext.n} 箱 +${v.toLocaleString()} COAM` : '撤離成功',
      0x7ee081,
      2.6,
      { k: 'good', m: '撤離成功', s: ext.n ? `回收物資 ${ext.n} 箱 +${v.toLocaleString()} COAM` : '' },
    );
    this.waves = [];
    this.wavePend = null;
    this.spawnQ = [];
    let n = 0;
    for (const e of this.enemies)
      if (!e.dead) {
        e.dead = true;
        e.mesh.visible = false;
        n++;
      }
    if (n) setTimeout(() => this.camp && this.flashAlert('敵軍撤退'), 1200);
    this.segClear_extract();
    this.campCleared();
  },
  // 回收地點的光環（依階段換顏色與文字）
  segLzRing() {
    const ext = this.camp.ss.ext;
    if (!ext.lz) return;
    this.campDisposeGroup(ext.lz.group);
    const ok = ext.ph === 2;
    ext.lz.group = this.campRing(
      ext.lz.pos,
      ok ? LZ_OK : LZ_COL,
      '回收地點',
      ok ? '回收機抵達：站進來裝載' : '回收機正在趕來',
      EX.R,
    );
  },
  segBlock_extract() {
    const ext = this.camp.ss.ext;
    return !!ext && ext.ph < 3;
  },
  segGoal_extract(alive) {
    const ss = this.camp.ss,
      ext = ss.ext;
    if (!ext || ext.ph >= 3) return null;
    const loot = `回收物資 ${ext.n} 箱`;
    if (ext.ph === 0)
      return `摧毀目標 ${ss.targets.filter((e) => e.dead).length}／${ss.targets.length} ｜ ${loot} ｜ 殘存敵軍 ${alive}`;
    if (ext.ph === 1) return `回收機抵達：${Math.max(0, Math.ceil(ext.t))} 秒 ｜ 守住回收地點附近 ｜ ${loot}`;
    return `回收機抵達 — 進入回收地點裝載物資 ｜ ${loot}`;
  },
  segView_extract() {
    const ext = this.camp.ss.ext;
    if (!ext || !ext.lz || ext.ph >= 3) return null;
    const p = ext.lz.pos;
    return { lz: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], ph: ext.ph };
  },
  segClear_extract() {
    const ext = this.camp && this.camp.ss && this.camp.ss.ext;
    if (ext && ext.lz) {
      this.campDisposeGroup(ext.lz.group);
      ext.lz.group = null;
    }
  },

  // ================= 客機與 HUD 共用 =================
  // 客機：照 sv 建回收地點的光環（campClientView 呼叫；C.vis 由它清掉）
  segClientVis(vis, sv) {
    if (!sv || !sv.lz) return;
    const pos = new THREE.Vector3(sv.lz[0], sv.lz[1], sv.lz[2]);
    const ok = sv.ph === 2;
    vis.lz = {
      pos,
      group: this.campRing(
        pos,
        ok ? LZ_OK : LZ_COL,
        '回收地點',
        ok ? '回收機抵達：站進來裝載' : '回收機正在趕來',
        EX.R,
      ),
    };
  },
  // HUD 的標記（campDrawHud）：[位置, 顏色, 字]
  segMarks() {
    const out = [];
    const ext = this.camp && this.camp.ss && this.camp.ss.ext;
    if (ext && ext.lz && ext.lz.group) out.push([ext.lz.pos, ext.ph === 2 ? '#7ee081' : '#ffa040', '回']);
    const V = !this.camp && this.campC && this.campC.vis;
    if (V && V.lz) out.push([V.lz.pos, '#ffa040', '回']);
    return out;
  },
});
