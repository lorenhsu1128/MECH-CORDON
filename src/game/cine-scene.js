// Game：過場的互動小品與載具演員（docs/cine-redesign-design.md 第十一節）。
//  - k:'scene'：照 data/cine/scenes.js 的範本展開成子演員（id＝`<小品>.<名稱>`），自己只是一個標記（A.kids），
//    移除時連子演員一起移除（cineDropActor）。
//  - k:'veh'：render/cine-vehicles.js 的載具（真實尺寸，不乘劇本倍率）。keys＝[{ t, p:[x,z], f 貨叉高度, rev 倒車, lin }]，
//    turn:'move'＝車頭朝行駛方向（倒車時反過來、轉彎前慢慢轉過去）；車輪依走過的距離轉；ride＝一段時間跟著別的載具的零件
//    （棧板在貨叉上）；hideAt＝之後看不到（放進車裡）。位置都由鏡頭時間 lt 直接算（暫停、跳時間一致）。
import { SCENES } from '../data/cine/scenes.js';
import { buildCineVeh } from '../render/cine-vehicles.js';
import { Game } from './game.js';

const D2R = Math.PI / 180;
const smooth = (u) => u * u * (3 - 2 * u);
const angLerp = (a, b, k) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
};
const _v = new THREE.Vector3(),
  _q = new THREE.Quaternion(),
  _ride = new THREE.Vector3(0, -0.03, 0.6); // 棧板在貨叉上的位置（貨叉群組的局部座標）

Object.assign(Game.prototype, {
  // 展開小品：子演員各自建立，標記演員記住它們
  cineSceneAdd(spec, shotAt) {
    const c = this.cine;
    const fn = SCENES[spec.type];
    const K = (c.set && c.set.k) || 1;
    const p = spec.p || [0, 0],
      y0 = (spec.yaw || 0) * D2R;
    const cs = Math.cos(y0),
      sn = Math.sin(y0);
    // 局部 (u, v) 公尺 → 劇本座標：v＝小品的正面（yaw 的方向）、u＝它的 +X
    const L = {
      K,
      pt: (u, v) => [p[0] + (u * cs + v * sn) / K, p[1] + (-u * sn + v * cs) / K],
      yaw: (d) => (spec.yaw || 0) + d,
    };
    const kids = fn ? fn(spec, L) : [];
    const A = { id: spec.id, spec, t0: shotAt, si: 0, pup: {}, kids: kids.map((k) => k.id) };
    c.actors.set(spec.id, A);
    for (const k of kids) if (!c.actors.has(k.id)) this.cineAddActor(k, shotAt);
    return A;
  },
  cineVehAdd(A, spec, pos, fyaw) {
    const v = buildCineVeh(spec.key, spec);
    if (!v) return;
    A.veh = v;
    A.obj = v.group;
    A.fyaw = fyaw;
    A.yaw = (spec.yaw || 0) * D2R + fyaw;
    v.group.position.copy(pos);
    if (this.world) v.group.position.y = this.world.groundAt(pos.x, pos.z, pos.y + 3);
    v.group.rotation.y = A.yaw;
    // 路線：每一段的長度（公尺）與方向，車輪的轉動與車頭方向用
    const ks = spec.keys || [];
    A.vp = ks.map((k) => this.cinePt({ g: k.p, h: 0 }, new THREE.Vector3()));
    A.vseg = [];
    let acc = 0;
    for (let i = 0; i < ks.length; i++) {
      const a = A.vp[Math.max(0, i - 1)],
        b = A.vp[i];
      const len = i ? Math.hypot(b.x - a.x, b.z - a.z) : 0;
      const sg = ks[i].rev ? -1 : 1;
      const h = len > 0.01 ? Math.atan2(b.x - a.x, b.z - a.z) + (sg < 0 ? Math.PI : 0) : null;
      A.vseg.push({ len, acc, sg, h });
      acc += len * sg;
    }
    // 沒有方向的段（原地升降）沿用前一段的車頭方向；第一段之前用 spec.yaw
    let last = A.yaw;
    for (const s of A.vseg) {
      if (s.h == null) s.h = last;
      last = s.h;
    }
    this.scene.add(v.group);
    this.cineVehTick(A, 0);
  },
  cineVehTick(A, lt) {
    const spec = A.spec,
      v = A.veh,
      obj = A.obj;
    if (!v) return;
    const c = this.cine;
    const vis = spec.hideAt == null || lt < spec.hideAt;
    obj.visible = vis && (spec.showAt == null || lt >= spec.showAt);
    // 跟著別的載具的零件（貨叉上的棧板）
    for (const r of spec.ride || []) {
      if (lt < r.t0) break;
      if (lt > r.t1) continue;
      const o = c.actors.get(r.id);
      const part = o && o.veh && o.veh.parts[r.part];
      if (!part) break;
      part.updateWorldMatrix(true, false);
      obj.position.copy(part.localToWorld(_v.copy(_ride)));
      obj.quaternion.copy(part.getWorldQuaternion(_q));
      A.rode = true;
      return;
    }
    if (A.rode && spec.ride && lt > spec.ride[spec.ride.length - 1].t1) return; // 放下之後停在放下的地方
    const k = spec.keys;
    if (!k || !k.length) return;
    let i = 0;
    while (i < k.length - 1 && k[i + 1].t <= lt) i++;
    const a = k[i],
      j = Math.min(i + 1, k.length - 1),
      b = k[j];
    const u = b === a ? 0 : Math.min(1, Math.max(0, (lt - a.t) / (b.t - a.t)));
    const e = b.lin ? u : smooth(u);
    const pa = A.vp[i],
      pb = A.vp[j];
    const x = pa.x + (pb.x - pa.x) * e,
      z = pa.z + (pb.z - pa.z) * e;
    const w = this.world;
    obj.position.set(x, w ? w.groundAt(x, z, Math.max(pa.y, pb.y) + 3) : pa.y, z);
    // 車頭：這一段的方向，段尾的 30% 轉向下一段（倒車接前進時在原地轉）
    if (spec.turn === 'move') {
      const s = A.vseg[j];
      let h = j > i ? s.h : A.vseg[i].h;
      const nx = A.vseg[Math.min(j + 1, A.vseg.length - 1)];
      if (j > i && nx && nx !== s && nx.len > 0.01)
        h = angLerp(h, nx.h, smooth(Math.max(0, (u - 0.7) / 0.3)));
      obj.rotation.y = h;
    }
    // 車輪：走過的距離（倒車是負的）。vseg[n].acc＝第 n 段（點 n−1 → 點 n）開始時的累計距離
    if (v.wheels.length) {
      const s = A.vseg[j];
      const dist = j > i ? s.acc + s.len * s.sg * e : s.acc + s.len * s.sg;
      for (const wh of v.wheels) wh.o.rotation.x = dist / wh.r;
    }
    // 貨叉的高度
    if (v.parts.fork && (a.f != null || b.f != null)) {
      const fa = a.f ?? b.f,
        fb = b.f ?? fa;
      v.parts.fork.position.y = 0.12 + fa + (fb - fa) * e;
    }
  },
});
