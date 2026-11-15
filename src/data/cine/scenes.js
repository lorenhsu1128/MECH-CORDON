// 過場的互動小品（docs/cine-redesign-design.md 第十一節「互動小品」）：一組人＋載具＋道具照腳本一起動作。
// 劇本寫一個演員 { id, k: 'scene', type, p: [x, z], yaw, dur, ... }，播放時由 game/cine-scene.js 展開成子演員
// （id＝`<小品 id>.<名稱>`；鏡頭可以用 { a: 'ld.fl' } 對準其中一個）。
// 範本用公尺寫（人與載具是真實尺寸），L 把小品的局部座標換成劇本座標：
//   L.pt(u, v)＝局部 (u 往右, v 往前) 公尺 → 劇本的 [x, z]；L.yaw(度)＝局部的朝向 → 劇本的 yaw（度）；L.K＝劇本座標的倍率
// 子演員：人 k:'human'（s 的 go／anim／face／vis）、載具 k:'veh'（keys：t、p、f 貨叉高度、rev 倒車、lin、vis；ride 跟著別的載具的零件）。
// 時間都從小品出現的那一鏡起算（t0 可以延後開始）；dur＝這一段要演多久（迴圈的範本會排滿）。

const r1 = (s) => {
  // 範本自己的亂數（不用 Math.random：跳時間、重播都一樣）
  let a = s >>> 0 || 1;
  return () => (a = (a * 1664525 + 1013904223) >>> 0) / 4294967296;
};

// ---------- 裝卸：堆高機從貨物堆叉起棧板，倒車、轉向，送進貨車的後門，放下、退出，再回去叉下一個 ----------
// 局部座標：貨車的後門在 (0, 0)、車頭朝 +v；貨物堆在左後方 (−7, −9)。指揮員站在後門右側打手勢，理貨員在貨物堆旁核對。
function loading(o, L) {
  const id = o.id,
    t0 = o.t0 || 0,
    dur = o.dur || 20;
  const out = [];
  const P = (u, v) => L.pt(u, v);
  // 貨車：原點在車身中央（車長 9.6 m，後門在 v≈0.8、車斗的地板高 0.9 m）
  out.push({ id: id + '.tr', k: 'veh', key: 'truck', p: P(0, 4.8), yaw: L.yaw(0) });
  // 貨物堆：3 個一排、由前排往後排叉；S(i)＝第 i 個棧板的位置
  const S = (i) => [-8.4 + (i % 3) * 1.5, -8 - Math.floor(i / 3) * 1.6];
  const back = [-4.2, -6.2],
    door = [0, -2.3],
    inside = [0, -0.4];
  const cyc = 13;
  const n = Math.max(1, Math.ceil((dur - t0) / cyc));
  const AP = 1.75; // 叉起時堆高機的原點在棧板前方多遠（貨叉 1.1 m＋門架）
  const keys = [];
  let t = t0;
  keys.push({ t, p: P(S(0)[0], S(0)[1] + AP), f: 0.02 });
  for (let i = 0; i < n; i++) {
    const s = S(i),
      s2 = S(i + 1);
    const at = [s[0], s[1] + AP];
    keys.push({ t: t + 1.2, p: P(at[0], at[1]), f: 0.25, lin: true }); // 叉起
    keys.push({ t: t + 3.2, p: P(back[0], back[1]), f: 0.25, rev: true }); // 倒車出來
    keys.push({ t: t + 5.6, p: P(door[0], door[1]), f: 0.25 }); // 開到後門前
    keys.push({ t: t + 6.6, p: P(door[0], door[1]), f: 0.95, lin: true }); // 升到車斗的高度
    keys.push({ t: t + 7.8, p: P(inside[0], inside[1]), f: 0.95 }); // 送進去
    keys.push({ t: t + 8.5, p: P(inside[0], inside[1]), f: 0.82, lin: true }); // 放下
    keys.push({ t: t + 9.7, p: P(door[0], door[1]), f: 0.82, rev: true }); // 退出來
    keys.push({ t: t + 10.4, p: P(door[0], door[1]), f: 0.02, lin: true });
    keys.push({ t: t + cyc, p: P(s2[0], s2[1] + AP), f: 0.02 }); // 開到下一個棧板前
    out.push({
      id: id + '.p' + i,
      k: 'veh',
      key: 'pallet',
      v: i,
      p: P(s[0], s[1]),
      yaw: L.yaw(0),
      ride: [{ t0: t + 1.0, t1: t + 8.5, id: id + '.fl', part: 'fork' }],
      hideAt: t + 9.0,
    });
    t += cyc;
  }
  // 還沒輪到的貨（靜態）
  for (let j = n; j < n + 4; j++)
    out.push({ id: id + '.s' + j, k: 'veh', key: 'pallet', v: j, p: P(S(j)[0], S(j)[1]), yaw: L.yaw(0) });
  // 堆高機排在棧板前面（每格先推進堆高機，棧板再讀它這一格的貨叉位置）
  out.splice(1, 0, { id: id + '.fl', k: 'veh', key: 'forklift', yaw: L.yaw(180), keys, turn: 'move' });
  // 指揮員：後門右側，堆高機靠近時打手勢（Wave），其他時候看著
  const sig = [];
  for (let i = 0; i < n; i++) {
    const tb = t0 + i * cyc;
    sig.push({ t: tb + 3.6, anim: 'Call' }, { t: tb + 8.8, anim: 'Arms' });
  }
  out.push({
    id: id + '.sig',
    k: 'human',
    who: 'worker',
    p: P(2.4, -2.4),
    anim: 'Arms',
    s: [{ t: 0, face: P(door[0] - 1, door[1] - 2) }, ...sig],
    seed: 11,
  });
  // 理貨員：貨物堆旁核對（Interact），中間走到貨車那邊看一下再走回來
  const ck = [-10.6, -5.4];
  out.push({
    id: id + '.chk',
    k: 'human',
    who: 'crew',
    p: P(ck[0], ck[1]),
    anim: 'Interact',
    s: [
      { t: 0, face: P(S(0)[0], S(0)[1]) },
      { t: t0 + 6, go: P(-2.8, -3.6) },
      { t: t0 + 10.5, anim: 'Talk', face: P(0, 1) },
      { t: t0 + 14, go: P(ck[0], ck[1]) },
      { t: t0 + 20, anim: 'Phone', face: P(S(3)[0], S(3)[1]) },
    ],
    seed: 12,
  });
  return out;
}

// ---------- 車隊：n 台車沿路線依序開過（等速、車距 gap 公尺），可以混不同車種 ----------
// o.path＝劇本座標的折線 [[x, z]...]（不用局部座標：路線通常沿著地圖的路）；speed m/s；kinds＝車種輪替
function convoy(o, L) {
  const id = o.id,
    t0 = o.t0 || 0;
  const sp = o.speed || 9,
    gap = o.gap || 16,
    n = o.n || 4;
  const kinds = o.kinds || ['truck'];
  const path = o.path.map((p) => [p[0], p[1]]);
  // 劇本座標的距離 × K＝公尺
  const segLen = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]) * L.K;
  const out = [];
  for (let i = 0; i < n; i++) {
    // 第 i 台在起點後方 i×gap（往路線的反方向延伸），所以一開始就排成一列
    const a = path[0],
      b = path[1];
    const d = segLen(a, b) / L.K || 1;
    const ux = (b[0] - a[0]) / d,
      uz = (b[1] - a[1]) / d;
    const back = (i * gap) / L.K;
    const pts = [[a[0] - ux * back, a[1] - uz * back], ...path];
    let t = t0;
    const keys = [{ t, p: pts[0] }];
    for (let j = 1; j < pts.length; j++) {
      t += segLen(pts[j - 1], pts[j]) / sp;
      keys.push({ t, p: pts[j], lin: true });
    }
    out.push({ id: `${id}.v${i}`, k: 'veh', key: kinds[i % kinds.length], v: i, keys, turn: 'move' });
  }
  return out;
}

// ---------- 撤離上車：人群排隊走到巴士門口上車（上車就看不到），引導員在門口揮手；最後一個上車後巴士開走 ----------
// 局部座標：巴士在 (0, 0)、車頭朝 +v、車門在右前方 (1.6, 4)；隊伍往右後方排
function board(o, L) {
  const id = o.id,
    t0 = o.t0 || 0,
    n = o.n || 12;
  const rnd = r1(o.seed || 7);
  const who = o.who || ['farmer', 'casual', 'hoodie', 'hooded', 'man', 'woman', 'womanc'];
  const doorL = [1.9, 4.2];
  const out = [];
  const every = o.every || 1.6; // 每幾秒上一個人
  const tEnd = t0 + 2 + n * every;
  const leave = o.leave !== false;
  out.push({
    id: id + '.bus',
    k: 'veh',
    key: o.veh || 'bus',
    v: o.v || 0,
    keys: [
      { t: 0, p: L.pt(0, 0) },
      { t: tEnd + 1.5, p: L.pt(0, 0) },
      ...(leave ? [{ t: tEnd + 9, p: L.pt(0, 40) }] : []),
    ],
    yaw: L.yaw(0),
    turn: 'move',
  });
  for (let i = 0; i < n; i++) {
    // 隊伍：從門口往右後方排成一列（稍微歪歪的）
    const q = i + 1;
    const pu = doorL[0] + 1.2 + q * 0.25 + (rnd() - 0.5) * 0.4,
      pv = doorL[1] - q * 0.85;
    const tGo = t0 + 1 + i * every;
    // 前面的人上車時，後面的人往前挪一格（簡化：每個人到自己的時間直接走到門口）
    out.push({
      id: `${id}.h${i}`,
      k: 'human',
      who: who[Math.floor(rnd() * who.length)],
      p: L.pt(pu, pv),
      yaw: L.yaw(0),
      anim: ['Idle', 'Talk', 'Arms', 'Phone', 'Idle_Neutral'][Math.floor(rnd() * 5)],
      s: [
        { t: 0, face: L.pt(doorL[0], doorL[1] + 2) },
        { t: Math.max(0, tGo - 3 + rnd()), go: L.pt(pu - 0.3, pv + 0.6) },
        { t: tGo, go: L.pt(doorL[0] + 0.4, doorL[1]) },
        { t: tGo + 0.1 + (Math.hypot(pu - doorL[0], pv - doorL[1]) + 0.6) / 1.35, vis: false },
      ],
      seed: 30 + i,
    });
  }
  // 引導員：門口旁邊，揮手叫人上車
  out.push({
    id: id + '.gd',
    k: 'human',
    who: o.guide || 'soldier',
    p: L.pt(doorL[0] + 1.2, doorL[1] + 1.3),
    yaw: L.yaw(-150),
    anim: 'Call',
    s: [{ t: tEnd, anim: 'Arms' }],
    seed: 29,
  });
  return out;
}

// ---------- 巡邏：軍車慢慢開過（裝甲車或吉普），一小隊步兵跟在旁邊走、隊長在前面揮手 ----------
// 局部座標：沿 +v 走 len 公尺
function patrol(o, L) {
  const id = o.id,
    t0 = o.t0 || 0,
    len = o.len || 40;
  const sp = 2.2; // 跟著步兵的速度
  const out = [
    {
      id: id + '.v',
      k: 'veh',
      key: o.veh || 'apc',
      keys: [
        { t: t0, p: L.pt(0, -len / 2) },
        { t: t0 + len / sp, p: L.pt(0, len / 2), lin: true },
      ],
      yaw: L.yaw(0),
      turn: 'move',
    },
  ];
  const n = o.n || 6;
  for (let i = 0; i < n; i++) {
    const u = (i % 2 ? 1 : -1) * (2.6 + (i % 3) * 0.5),
      v0 = -len / 2 - 2 - Math.floor(i / 2) * 2.2;
    out.push({
      id: `${id}.s${i}`,
      k: 'human',
      who: o.who || 'soldier',
      p: L.pt(u, v0),
      anim: 'GunIdle',
      s: [{ t: t0, go: L.pt(u, v0 + len), run: false }],
      speed: sp / 1.35,
      seed: 50 + i,
    });
  }
  out.push({
    id: id + '.lead',
    k: 'human',
    who: o.who || 'soldier',
    p: L.pt(1.5, -len / 2 + 6),
    anim: 'Call',
    s: [{ t: t0 + 0.5, go: L.pt(1.5, len / 2 + 4) }],
    speed: sp / 1.35,
    seed: 49,
  });
  return out;
}

// ---------- 施工：挖土機原地挖（動臂與斗桿擺動、上部旋轉），旁邊停一台礦用卡車，工人在旁邊看與指揮 ----------
function dig(o, L) {
  const id = o.id;
  return [
    {
      id: id + '.ex',
      k: 'veh',
      key: 'excavator',
      p: L.pt(0, 0),
      yaw: L.yaw(0),
      swing: {
        turret: ['y', 0, 0.7, 7, 0],
        boom: ['x', -0.35, 0.22, 3.5, 0],
        arm: ['x', 1.15, 0.35, 3.5, 0.8],
        bucket: ['x', 0.3, 0.5, 3.5, 1.4],
      },
    },
    { id: id + '.tr', k: 'veh', key: o.truck || 'hauler', p: L.pt(7, 3), yaw: L.yaw(-30) },
    {
      id: id + '.w1',
      k: 'human',
      who: 'worker',
      p: L.pt(-4, 4),
      anim: 'Call',
      s: [{ t: 0, face: L.pt(0, 0) }],
      seed: 61,
    },
    {
      id: id + '.w2',
      k: 'human',
      who: 'crew',
      p: L.pt(-5, 6),
      anim: 'Phone',
      s: [{ t: 0, face: L.pt(0, 0) }],
      seed: 62,
    },
    {
      id: id + '.w3',
      k: 'human',
      who: 'worker',
      p: L.pt(4, -3),
      anim: 'Arms',
      s: [{ t: 0, face: L.pt(0, 0) }],
      seed: 63,
    },
  ];
}

// ---------- 群聚：一群人站著做事（交談、講電話、抱胸、蹲著修理），旁邊停一兩台車 ----------
function crowd(o, L) {
  const id = o.id,
    n = o.n || 10;
  const rnd = r1(o.seed || 9);
  const who = o.who || ['worker', 'crew', 'casual', 'hoodie', 'farmer'];
  const anims = o.anims || ['Talk', 'Phone', 'Arms', 'Fix', 'Use', 'Yes', 'Idle'];
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2,
      r = 1.5 + rnd() * 5;
    out.push({
      id: `${id}.h${i}`,
      k: 'human',
      who: who[Math.floor(rnd() * who.length)],
      p: L.pt(Math.cos(a) * r, Math.sin(a) * r),
      anim: anims[Math.floor(rnd() * anims.length)],
      s: [{ t: 0, face: L.pt(Math.cos(a) * r * 0.3, Math.sin(a) * r * 0.3) }],
      seed: 70 + i,
    });
  }
  for (const [j, k] of (o.vehs || ['pickup']).entries())
    out.push({
      id: `${id}.v${j}`,
      k: 'veh',
      key: k,
      v: j,
      p: L.pt(-7 + j * 4, -5 + j * 2),
      yaw: L.yaw(20 + j * 35),
    });
  return out;
}

export const SCENES = { loading, convoy, board, patrol, dig, crowd };
