// 武器的槍口（2026-11-18 使用者要求：槍口火光、子彈、光束、導彈都要從模型對的位置出來）。
// 以前手持武器一律從手腕的轉軸、肩上武器從核心上的武器座發射，和槍口差 0.5～6.4 m。
// 這裡從武器實際的網格量（程式模型與 GLB 都一樣）：群組的 −Z 是槍管的方向（手持武器的 aim 群組、肩上武器的 back 群組），
//   tip  ＝最前端那一截（長度的 4%）的截面中心（槍口）
//   rear ＝最後端那一截的截面中心（火箭筒的後焰、導彈莢艙的煙）
//   mid  ＝外框的中心往上一點（機匣：彈殼從這裡彈出）
//   tubes＝導彈的發射管：紅色的彈頭（程式模型的 --warheads，每顆是獨立的封閉曲面）各自的前端；找不到時在前端的截面上排 2×2
// 座標都是群組的區域座標。buildMech 掛成節點（mech-model.js），模型庫的關節設定可以用「槍口」連接點覆寫 tip。
const _v = new THREE.Vector3(),
  _m = new THREE.Matrix4(),
  _inv = new THREE.Matrix4();
const CACHE = new Map();

// 紅色的彈頭（線性色：r 高、g／b 低）
const isWarhead = (m) => m && m.color && m.color.r > 0.35 && m.color.g < 0.12 && m.color.b < 0.12;

export function measureMuzzle(grp, key) {
  grp.updateMatrixWorld(true);
  const meshes = [];
  grp.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || o.userData.xray || o.userData.helper) return;
    const m = o.material;
    if (!m || Array.isArray(m) || m.side === THREE.BackSide) return; // 描邊外殼
    meshes.push(o);
  });
  if (!meshes.length) return null;
  // 同一個零件（幾何相同、在群組裡的擺法相同）只量一次
  _inv.copy(grp.matrixWorld).invert();
  const mats = meshes.map((o) => _m.multiplyMatrices(_inv, o.matrixWorld).clone());
  const ck =
    key &&
    key +
      '|' +
      meshes.map((o) => o.geometry.uuid).join(',') +
      '|' +
      mats.map((m) => m.elements.map((x) => x.toFixed(3)).join(',')).join(';');
  if (ck && CACHE.has(ck)) return CACHE.get(ck);
  const pts = [],
    red = []; // 紅色彈頭的三角形（三個頂點一組）
  meshes.forEach((o, i) => {
    const geo = o.geometry,
      pa = geo.attributes.position;
    const P = [];
    for (let k = 0; k < pa.count; k++) P.push(_v.fromBufferAttribute(pa, k).applyMatrix4(mats[i]).clone());
    pts.push(...P);
    if (!isWarhead(o.material)) return;
    const ix = geo.index;
    const n = ix ? ix.count : pa.count;
    for (let k = 0; k + 2 < n; k += 3)
      red.push(ix ? [P[ix.getX(k)], P[ix.getX(k + 1)], P[ix.getX(k + 2)]] : [P[k], P[k + 1], P[k + 2]]);
  });
  const out = muzzleFromPoints(pts, warheads(red));
  if (ck) CACHE.set(ck, out);
  return out;
}

// 紅色彈頭的三角形依共用的頂點連成一顆一顆 → 每顆的中心（z＝最前端）
function warheads(red) {
  if (!red.length) return [];
  const id = new Map(),
    par = [];
  const find = (a) => {
    while (par[a] !== a) a = par[a] = par[par[a]];
    return a;
  };
  const key = (p) => Math.round(p.x * 500) + ',' + Math.round(p.y * 500) + ',' + Math.round(p.z * 500);
  const idOf = (p) => {
    const k = key(p);
    if (!id.has(k)) {
      id.set(k, par.length);
      par.push(par.length);
    }
    return id.get(k);
  };
  const tri = red.map((t) => t.map(idOf));
  for (const [a, b, c] of tri) {
    par[find(b)] = find(a);
    par[find(c)] = find(a);
  }
  const grp = new Map();
  red.forEach((t, i) => {
    const r = find(tri[i][0]);
    if (!grp.has(r)) grp.set(r, []);
    grp.get(r).push(...t);
  });
  let tubes = [];
  for (const list of grp.values()) {
    if (list.length < 9) continue; // 零星的三角形
    const c = new THREE.Vector3();
    let zf = Infinity;
    for (const p of list) {
      c.add(p);
      zf = Math.min(zf, p.z);
    }
    c.divideScalar(list.length);
    c.z = zf;
    tubes.push(c);
  }
  if (tubes.length > 24) tubes = [];
  // 由上而下、由內而外（依序發射時好看）
  return tubes.sort((a, b) => b.y - a.y || Math.abs(a.x) - Math.abs(b.x));
}

// 頂點（群組座標，−Z＝槍管方向）→ 槍口、尾端、機匣；tubes＝發射管（沒有時在前端的截面上排 2×2）
export function muzzleFromPoints(pts, tubes = []) {
  let z0 = Infinity,
    z1 = -Infinity;
  const box = new THREE.Box3();
  for (const p of pts) {
    z0 = Math.min(z0, p.z);
    z1 = Math.max(z1, p.z);
    box.expandByPoint(p);
  }
  const L = z1 - z0;
  const slice = (front) => {
    const c = new THREE.Vector3();
    let n = 0;
    for (const p of pts)
      if (front ? p.z < z0 + L * 0.04 : p.z > z1 - L * 0.04) {
        c.add(p);
        n++;
      }
    c.divideScalar(Math.max(1, n));
    c.z = front ? z0 : z1;
    return c;
  };
  const tip = slice(true),
    rear = slice(false);
  const mid = box.getCenter(new THREE.Vector3());
  mid.y += (box.max.y - box.min.y) * 0.25;
  if (!tubes.length) {
    let x0 = Infinity,
      x1 = -Infinity,
      y0 = Infinity,
      y1 = -Infinity;
    for (const p of pts)
      if (p.z < z0 + L * 0.15) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
        y0 = Math.min(y0, p.y);
        y1 = Math.max(y1, p.y);
      }
    tubes = [];
    for (const fy of [0.7, 0.3])
      for (const fx of [0.3, 0.7])
        tubes.push(new THREE.Vector3(x0 + (x1 - x0) * fx, y0 + (y1 - y0) * fy, z0 + L * 0.03));
  }
  return { tip, rear, mid, tubes, len: L };
}

// 不是 buildMech 的模型（載具、步行機以外的專屬敵人、Boss：rig.arms 的 hand／back 是左右共用的節點，武器的網格做在它底下、
// 槍管往節點的 −Z 長出去）：量節點底下的網格掛槍口、尾端、機匣、發射管（MechEntity.muzzle 第一次用到時呼叫）。
// 節點底下沒有網格的（專屬敵人：手本來就放在槍口；網格合併成骨架動畫的也是）照舊用節點本身
const RIG_MZ = new WeakMap(); // 節點 → 已經掛好的槍口節點（userData 會被 clone 轉成 JSON，不放這裡）
export function rigMuzzle(A) {
  for (const [grp, pre] of [
    [A.hand, 'mz'],
    [A.back, 'bmz'],
  ]) {
    if (!grp) continue;
    // 左右手共用同一個節點：另一邊已經量過就沿用
    const done = RIG_MZ.get(grp);
    if (done) {
      Object.assign(A, done);
      continue;
    }
    // 建模時直接寫好的槍口（節點座標；網格合併之後節點底下量不到的載具）
    const fix = grp.userData.mz;
    if (fix) {
      const o = new THREE.Object3D();
      o.name = 'muzzle';
      o.position.set(fix[0], fix[1], fix[2]);
      grp.add(o);
      A[pre] = o;
      RIG_MZ.set(grp, { [pre]: o });
      continue;
    }
    let has = false;
    grp.traverse((o) => {
      if (o !== grp && o.isMesh && !o.isSkinnedMesh && !o.userData.helper) has = true;
    });
    if (!has) continue;
    const M = measureMuzzle(grp, null);
    if (!M || M.len < 0.05) continue;
    const node = (p, name) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.copy(p);
      grp.add(o);
      return o;
    };
    A[pre] = node(M.tip, 'muzzle');
    A[pre + 'Rear'] = node(M.rear, 'muzzleRear');
    A[pre + 'Mid'] = node(M.mid, 'muzzleMid');
    if (pre === 'bmz') {
      A.tubes = M.tubes.map((p) => node(p, 'tube'));
      A.tubeDir = new THREE.Vector3(0, Math.sin(0.35), -Math.cos(0.35));
    }
    const keys = [pre, pre + 'Rear', pre + 'Mid', ...(pre === 'bmz' ? ['tubes', 'tubeDir'] : [])];
    RIG_MZ.set(grp, Object.fromEntries(keys.map((k) => [k, A[k]])));
  }
}

// 導彈離開莢艙的仰角（弧度；莢艙的 −Z 往上抬）：PM-6 的發射口本來就往上仰
export const LAUNCH_PITCH = { bw_ms: 0.35, bw_ms8: 0.35, bw_pm: 0.55 };
