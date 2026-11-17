// GLB → 程式模型（實驗，2026-11-17）：把 GLB 的外殼沿凹的摺線切成凸的表面片，每一片還原成基本形體
// （軸向方塊 B、沿某軸擠出的多邊形柱 P、一般凸塊 H；單面或太薄的是平面片 T），左右對稱的只寫一份（M＝鏡射）。
// 補上的封口面如果露在外面（不在原本的實體裡），那一片用更嚴格的容許誤差重切。
//   node scripts/glb-to-proc.mjs <GLB> <輸出的 .js> <匯出的名稱> [--ct=0.03] [--report]
// 座標照 GLB（glTF：+Z 正面、公尺）。輸出的模組匯出 <名稱>Prims（基本形體清單）；組成網格用 render/proc-prims.js。
/* global process, console */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const ROOT = process.cwd();
const [glbPath, outPath, NAME] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ARG = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (m) ARG[m[1]] = m[2] === undefined ? true : m[2];
}
const CT0 = +(ARG.ct || 0.03); // 凸片的容許誤差（公尺）
const CT_MIN = 0.004;
// 封口面露在外面的面積超過這麼多就重切（絕對值 m²、佔這一片面積的比例）
const LIM_ABS = +(ARG.limAbs || 0.0015),
  LIM_REL = +(ARG.limRel || 0.01);
const FLAT = 0.012; // 比這個薄的片當平面片
const TOL = +(ARG.tol || 0.015); // 辨識成方塊／柱體、配對左右對稱的容許誤差
const THREE = await import(pathToFileURL(path.join(ROOT, 'node_modules/three/build/three.module.js')).href);
const { ConvexHull } = await import(
  pathToFileURL(path.join(ROOT, 'node_modules/three/examples/jsm/math/ConvexHull.js')).href
);

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const r3 = (x) => Math.round(x * 1000) / 1000;
const SL = ['main', 'sub', 'joint', 'acc'];

// ---------- 讀 GLB ----------
const buf = fs.readFileSync(glbPath);
const jl = buf.readUInt32LE(12);
const J = JSON.parse(buf.slice(20, 20 + jl).toString());
const bin = buf.slice(20 + jl + 8);
function acc(i) {
  const a = J.accessors[i],
    v = J.bufferViews[a.bufferView];
  const off = (v.byteOffset || 0) + (a.byteOffset || 0);
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const T = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array }[a.componentType];
  const st = v.byteStride || T.BYTES_PER_ELEMENT * n;
  const dv = new DataView(bin.buffer, bin.byteOffset + off);
  const o = new T(a.count * n);
  for (let k = 0; k < a.count; k++)
    for (let c = 0; c < n; c++) {
      const p = k * st + c * T.BYTES_PER_ELEMENT;
      o[k * n + c] =
        T === Float32Array
          ? dv.getFloat32(p, true)
          : T === Uint16Array
            ? dv.getUint16(p, true)
            : dv.getUint32(p, true);
    }
  return o;
}
// 節點的縮放（伺服器預設組的 GLB 把 3 倍放在節點上）
// --node=<名稱>：只取那個節點的網格，座標是節點自己的（會轉的槍管 spin：另外輸出一份＋節點的位置 …At）；
// 沒有指定＝所有有網格的節點（有位移的加上位移）
const AT = ARG.node ? (J.nodes.find((n) => n.name === ARG.node) || {}).translation || [0, 0, 0] : null;
const raw = [];
for (const nd of J.nodes.filter((n) => n.mesh !== undefined && (!ARG.node || n.name === ARG.node))) {
  const nodeScale = nd.scale || [1, 1, 1],
    nodeT = ARG.node ? [0, 0, 0] : nd.translation || [0, 0, 0];
  for (const p of J.meshes[nd.mesh].primitives) {
    const P = acc(p.attributes.POSITION),
      UV = ARG.tex && p.attributes.TEXCOORD_0 !== undefined ? acc(p.attributes.TEXCOORD_0) : null,
      I = p.indices !== undefined ? acc(p.indices) : null;
    const slot = Math.max(0, SL.indexOf(J.materials[p.material].name));
    const n = I ? I.length : P.length / 3;
    for (let k = 0; k < n; k += 3) {
      const t = [],
        uv = [];
      for (let q = 0; q < 3; q++) {
        const vi = I ? I[k + q] : k + q;
        t.push([0, 1, 2].map((c) => P[vi * 3 + c] * nodeScale[c] + nodeT[c]));
        if (UV) uv.push([UV[vi * 2], UV[vi * 2 + 1]]);
      }
      raw.push({ p: t, slot, uv, mat: p.material });
    }
  }
}
// ---------- 貼圖的顏色（--tex[=色數]）：材質不是色槽、顏色畫在貼圖上的 GLB（背包推進器：保留原本的顏色、不換色）----------
// 每個三角形在貼圖上取樣（重心＋往三個頂點）→ 面積加權的 k-means 分成幾個固定色 → 色槽編號 4 起（輸出 …Cols）
let COLS = null;
const WAR = []; // --warheads：彈頭的三角形（[色槽, a, b, c]）
if (ARG.tex) {
  const sharp = (await import('sharp')).default;
  const K = ARG.tex === true ? 8 : +ARG.tex;
  const imgs = new Map();
  const imgOf = async (mi) => {
    if (imgs.has(mi)) return imgs.get(mi);
    const tx = J.materials[mi].pbrMetallicRoughness.baseColorTexture;
    const bv = J.bufferViews[J.images[J.textures[tx.index].source].bufferView];
    const { data, info } = await sharp(bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength))
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    imgs.set(mi, { data, w: info.width, h: info.height });
    return imgs.get(mi);
  };
  // --warheads：導彈武器的彈頭（貼圖上紅色的地方）換成乾淨的紅色圓頭彈頭（2026-11-17 使用者定案）。
  // 每個三角形密一點取樣，紅色的取樣點記下位置與面法線；整個都是紅色的三角形（彈頭自己的幾何、紅圈裡的面）拿掉，
  // 部分紅色的三角形顏色只算不是紅色的部分。紅色的點依距離分群，每一群＝一顆彈頭（軸＝面法線的平均）。
  const RED = []; // { p, n, tri }
  const redOnly = new Set();
  const isRed = (r, g, b) => r > 60 && r > g * 1.6 && r > b * 1.6;
  if (ARG.warheads)
    for (let i = 0; i < raw.length; i++) {
      const t = raw[i],
        im = await imgOf(t.mat);
      const nn = nrm(cross(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0])));
      const N = 7;
      let red = 0,
        all = 0;
      const keep = [0, 0, 0];
      for (let a = 0; a <= N; a++)
        for (let b = 0; a + b <= N; b++) {
          const w = [(a + 0.33) / (N + 1), (b + 0.33) / (N + 1)];
          w.push(1 - w[0] - w[1]);
          const u = t.uv[0][0] * w[0] + t.uv[1][0] * w[1] + t.uv[2][0] * w[2],
            v = t.uv[0][1] * w[0] + t.uv[1][1] * w[1] + t.uv[2][1] * w[2];
          const x = Math.min(im.w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * im.w))),
            y = Math.min(im.h - 1, Math.max(0, Math.floor((v - Math.floor(v)) * im.h)));
          const c = [0, 1, 2].map((k) => im.data[(y * im.w + x) * 3 + k]);
          all++;
          if (isRed(...c)) {
            red++;
            RED.push({
              p: [0, 1, 2].map((k) => t.p[0][k] * w[0] + t.p[1][k] * w[1] + t.p[2][k] * w[2]),
              n: nn,
              tri: i,
            });
          } else for (let k = 0; k < 3; k++) keep[k] += c[k];
        }
      if (red > all * 0.5) redOnly.add(i);
      else if (red) t.noRed = keep.map((x) => x / (all - red));
    }
  const S = [];
  for (const t of raw) {
    const im = await imgOf(t.mat);
    const c = [0, 0, 0];
    const cu = (t.uv[0][0] + t.uv[1][0] + t.uv[2][0]) / 3,
      cv = (t.uv[0][1] + t.uv[1][1] + t.uv[2][1]) / 3;
    const pts = [[cu, cv], ...t.uv.map((q) => [cu + (q[0] - cu) * 0.5, cv + (q[1] - cv) * 0.5])];
    for (const [u, v] of pts) {
      const x = Math.min(im.w - 1, Math.max(0, Math.floor((u - Math.floor(u)) * im.w))),
        y = Math.min(im.h - 1, Math.max(0, Math.floor((v - Math.floor(v)) * im.h)));
      for (let k = 0; k < 3; k++) c[k] += im.data[(y * im.w + x) * 3 + k] / pts.length;
    }
    const n = cross(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]));
    S.push({ c: t.noRed || c, w: len(n) / 2 });
  }
  // k-means（起點：最遠點取樣，結果固定）
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const cen = [
    S.slice()
      .sort((a, b) => b.w - a.w)[0]
      .c.slice(),
  ];
  while (cen.length < K) {
    let best = null,
      bd = -1;
    for (const s of S) {
      const d = Math.min(...cen.map((c) => d2(c, s.c))) * Math.sqrt(s.w);
      if (d > bd) {
        bd = d;
        best = s;
      }
    }
    cen.push(best.c.slice());
  }
  const lab = S.map(() => 0);
  for (let it = 0; it < 30; it++) {
    const sum = cen.map(() => [0, 0, 0, 0]);
    S.forEach((s, i) => {
      let b = 0;
      for (let k = 1; k < cen.length; k++) if (d2(cen[k], s.c) < d2(cen[b], s.c)) b = k;
      lab[i] = b;
      for (let k = 0; k < 3; k++) sum[b][k] += s.c[k] * s.w;
      sum[b][3] += s.w;
    });
    sum.forEach((q, k) => {
      if (q[3] > 0) cen[k] = [q[0] / q[3], q[1] / q[3], q[2] / q[3]];
    });
  }
  // 去掉零星的雜色（貼圖上烘進去的明暗與髒污會讓同一塊面板的三角形分到不同色）：
  // 和幾乎同平面的相鄰三角形依面積投票，做 4 輪
  {
    const key = (q) => q.map((x) => Math.round(x / 1e-3)).join(',');
    const em = new Map();
    const nr = raw.map((t) => nrm(cross(sub(t.p[1], t.p[0]), sub(t.p[2], t.p[0]))));
    raw.forEach((t, i) => {
      const ks = t.p.map(key);
      for (let q = 0; q < 3; q++) {
        const a = ks[q],
          b = ks[(q + 1) % 3];
        const k = a < b ? a + '|' + b : b + '|' + a;
        if (!em.has(k)) em.set(k, []);
        em.get(k).push(i);
      }
    });
    const nb = raw.map(() => []);
    for (const l of em.values())
      for (const i of l) for (const k of l) if (i !== k && dot(nr[i], nr[k]) > 0.94) nb[i].push(k);
    for (let it = 0; it < 4; it++) {
      const next = lab.slice();
      raw.forEach((_, i) => {
        const v = cen.map(() => 0);
        v[lab[i]] += S[i].w;
        for (const k of nb[i]) v[lab[k]] += S[k].w;
        next[i] = v.indexOf(Math.max(...v));
      });
      next.forEach((x, i) => (lab[i] = x));
    }
  }
  // --warheads：紅色只留給新的彈頭，其他分到紅色那一群的三角形（零星的殘留）改成最接近的不是紅色的顏色
  if (ARG.warheads) {
    const redK = cen.map((c) => isRed(...c));
    if (redK.some((x) => !x))
      lab.forEach((l, i) => {
        if (!redK[l]) return;
        let b = -1;
        cen.forEach((c, k) => {
          if (!redK[k] && (b < 0 || d2(c, cen[l]) < d2(cen[b], cen[l]))) b = k;
        });
        lab[i] = b;
      });
  }
  raw.forEach((t, i) => (t.slot = 4 + lab[i]));
  const hex = (c) => '#' + c.map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
  COLS = cen.map(hex);
  // 自發光的材質（脈衝刀、光束大劍的刀刃）：整個材質一個固定色，色碼後面加 !＝自發光（proc-prims.js 的 fixMat）
  J.materials.forEach((m, mi) => {
    if (!m.emissiveFactor || !m.emissiveFactor.some((x) => x > 0)) return;
    const c = [0, 0, 0];
    let w = 0;
    raw.forEach((t, i) => {
      if (t.mat !== mi) return;
      for (let k = 0; k < 3; k++) c[k] += S[i].c[k] * S[i].w;
      w += S[i].w;
    });
    if (!w) return;
    COLS.push(hex(c.map((x) => x / w)) + '!');
    raw.forEach((t) => {
      if (t.mat === mi) t.slot = 4 + COLS.length - 1;
    });
  });
  if (ARG.warheads && RED.length) {
    // 分群（格子＋併查集，相距 5 cm 內相連）
    const fa3 = RED.map((_, i) => i);
    const f3 = (x) => {
      while (fa3[x] !== x) x = fa3[x] = fa3[fa3[x]];
      return x;
    };
    const CELL = 0.05,
      grid = new Map();
    RED.forEach((q, i) => {
      const g = q.p.map((x) => Math.floor(x / CELL));
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dz = -1; dz <= 1; dz++)
            for (const k of grid.get(`${g[0] + dx},${g[1] + dy},${g[2] + dz}`) || [])
              if (len(sub(RED[k].p, q.p)) < CELL) fa3[f3(i)] = f3(k);
      const key = g.join(',');
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(i);
    });
    const groups = new Map();
    RED.forEach((q, i) => {
      const r = f3(i);
      if (!groups.has(r)) groups.set(r, []);
      groups.get(r).push(q);
    });
    // 有效的群：點數至少是最大那一群的三成（機身上零星的紅色標記不算）
    const maxN = Math.max(...[...groups.values()].map((g) => g.length));
    const big = [...groups.values()].filter((g) => g.length >= Math.max(25, maxN * 0.3));
    const okTri = new Set();
    const heads = [];
    for (const g of big) {
      const cen = g.reduce((s2, q) => s2.map((x, k) => x + q.p[k] / g.length), [0, 0, 0]);
      // 軸：面法線的平均
      let ax = [0, 0, 0];
      for (const q of g) ax = ax.map((x, k) => x + q.n[k]);
      ax = nrm(ax);
      // 立體的彈頭（沿法線的平均有厚度）：莢艙的發射口朝正前方（+Z），彈頭也朝正前方
      // （只有看得到的部分是紅色，從點的分布估方向不可靠）；畫在平面上的圓照那個面的法線
      {
        const tt = g.map((q) => dot(sub(q.p, cen), ax));
        if (Math.max(...tt) - Math.min(...tt) > 0.12 && ax[2] > 0.5) ax = [0, 0, 1];
      }
      const ts = g.map((q) => dot(sub(q.p, cen), ax)).sort((p2, q2) => p2 - q2);
      const rs = g
        .map((q) => {
          const d = sub(q.p, cen),
            t = dot(d, ax);
          return len(
            sub(
              d,
              ax.map((x) => x * t),
            ),
          );
        })
        .sort((p2, q2) => p2 - q2);
      const r = rs[Math.floor(rs.length * 0.9)];
      heads.push({ c: cen, ax, r, t0: ts[0], t1: ts[ts.length - 1] });
      if (ARG.debug)
        console.log('群', g.length, '軸', ax.map(r3), 't', r3(ts[0]), r3(ts[ts.length - 1]), 'r', r3(r));
      g.forEach((q) => okTri.add(q.tri));
    }
    // 相鄰的彈頭不重疊：半徑不超過到最近那一顆的距離（垂直軸的方向）的 0.47 倍
    for (const h of heads)
      for (const o of heads) {
        if (o === h) continue;
        const d = sub(o.c, h.c),
          t = dot(d, h.ax);
        h.r = Math.min(
          h.r,
          len(
            sub(
              d,
              h.ax.map((x) => x * t),
            ),
          ) * 0.47,
        );
      }
    // 拿掉整個紅色的三角形（屬於有效的那幾群的）
    const dropT = new Set([...redOnly].filter((i) => okTri.has(i)));
    const kept = raw.filter((_, i) => !dropT.has(i));
    raw.length = 0;
    raw.push(...kept);
    // 彈頭：圓柱（後段）＋半球（前端），紅色的固定色；輸出成單面的三角形（WAR）
    COLS.push('#c8242c');
    const slot = 4 + COLS.length - 1;
    const SEG = 12,
      RING = 4;
    for (const h of heads) {
      const a = Math.abs(h.ax[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
      const u = nrm(cross(h.ax, a)),
        w = cross(h.ax, u);
      // 畫在平面上的圓（前後沒有厚度）：半球從那個面凸出來；本來就是立體的：前端對齊原本的前端
      const r = h.r,
        tip = h.t1 - h.t0 < r * 0.6 ? h.t1 + r : h.t1,
        base = Math.min(h.t0, tip - r) - 0.02; // 後端稍微埋進去
      const pt = (t, rr, k) => {
        const an = (k / SEG) * Math.PI * 2;
        return [0, 1, 2].map((c) =>
          r3(h.c[c] + h.ax[c] * t + (u[c] * Math.cos(an) + w[c] * Math.sin(an)) * rr),
        );
      };
      const rings = [[base, r]];
      for (let j = 0; j <= RING; j++) {
        const an = (j / RING) * (Math.PI / 2);
        rings.push([tip - r + Math.sin(an) * r, Math.cos(an) * r]);
      }
      for (let j = 0; j < rings.length - 1; j++)
        for (let k = 0; k < SEG; k++) {
          const p00 = pt(rings[j][0], rings[j][1], k),
            p01 = pt(rings[j][0], rings[j][1], k + 1),
            p10 = pt(rings[j + 1][0], rings[j + 1][1], k),
            p11 = pt(rings[j + 1][0], rings[j + 1][1], k + 1);
          WAR.push([slot, p00, p01, p11]);
          if (rings[j + 1][1] > 1e-6) WAR.push([slot, p00, p11, p10]);
        }
    }
    console.log(
      `彈頭：${heads.length} 顆（半徑 ${heads.map((h) => h.r.toFixed(2)).join('／')}），拿掉 ${dropT.size} 個紅色的三角形`,
    );
  }
  console.log('貼圖的顏色：', COLS.join(' '));
}
const NS = 4 + (COLS ? COLS.length : 0); // 色槽的數量（4 個換色的色槽＋固定色）
// ---------- 戰車腳（--tank）：輪子與履帶片是獨立的零件，從靜態的部分拿掉，另外輸出成會動的零件 ----------
// 輪子＝12 邊形的圓柱（中心、半徑、寬），履帶片＝沿履帶艙底部與兩端排列的小塊（取一片當範本＋排列的路徑）
function tankParts() {
  const key = (q) => q.map((x) => Math.round(x / 1e-3)).join(',');
  const ids = new Map(),
    fa2 = [];
  const f2 = (x) => {
    while (fa2[x] !== x) x = fa2[x] = fa2[fa2[x]];
    return x;
  };
  const tv = raw.map((t) =>
    t.p.map((q) => {
      const k = key(q);
      if (!ids.has(k)) {
        ids.set(k, fa2.length);
        fa2.push(fa2.length);
      }
      return ids.get(k);
    }),
  );
  for (const v of tv) {
    fa2[f2(v[0])] = f2(v[1]);
    fa2[f2(v[1])] = f2(v[2]);
  }
  const comps = new Map();
  raw.forEach((t, i) => {
    const r = f2(tv[i][0]);
    if (!comps.has(r)) comps.set(r, { tris: [], mn: [1e9, 1e9, 1e9], mx: [-1e9, -1e9, -1e9], main: 0 });
    const c = comps.get(r);
    c.tris.push(i);
    if (t.slot === 0) c.main++;
    for (const q of t.p)
      for (let k = 0; k < 3; k++) {
        c.mn[k] = Math.min(c.mn[k], q[k]);
        c.mx[k] = Math.max(c.mx[k], q[k]);
      }
  });
  const wheels = [],
    links = [],
    drop = new Set();
  for (const c of comps.values()) {
    const sz = c.mx.map((x, k) => x - c.mn[k]),
      n = c.tris.length,
      ax = Math.min(Math.abs(c.mn[0]), Math.abs(c.mx[0]));
    if (ax > 3.9 && sz[0] < 0.75 && n <= 50 && sz[1] > 0.7 && sz[1] < 1.75 && sz[2] > 0.9 && sz[2] < 1.75) {
      const r = sz[2] / 2;
      // 上半被側裙蓋住的輪子在 GLB 裡是切掉的：中心照底部＋半徑
      const cut = sz[1] <= sz[2] * 0.92;
      const cy = cut ? c.mn[1] + r : (c.mn[1] + c.mx[1]) / 2;
      let x0 = c.mn[0],
        x1 = c.mx[0];
      if (cut) {
        // 補成整個輪子之後上半要藏在側裙後面：外側的面退到側裙下緣（切口上方、同一側、比輪子外面的靜態零件）的內側
        const s = Math.sign(x0 + x1),
          cx = (x0 + x1) / 2;
        // 從切口上方的幾個點往外打射線，最近打到的靜態零件就是側裙
        let lim = 1e9;
        const cz = (c.mn[2] + c.mx[2]) / 2,
          mine = new Set(c.tris);
        for (const y of [c.mx[1] + 0.03, cy + r * 0.55, cy + r * 0.9])
          for (const dz of [-0.5, 0, 0.5]) {
            const z = cz + dz * Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy)));
            raw.forEach((t, ti) => {
              if (mine.has(ti)) return;
              const [a, b, d] = t.p;
              // 射線沿 X：在 (y, z) 平面上看點是否在三角形裡
              const e = (p, q) => (q[1] - p[1]) * (z - p[2]) - (q[2] - p[2]) * (y - p[1]);
              const w0 = e(a, b),
                w1 = e(b, d),
                w2 = e(d, a);
              if (!((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0))) return;
              const sum = w0 + w1 + w2;
              if (Math.abs(sum) < 1e-9) return;
              const x = (d[0] * w0 + a[0] * w1 + b[0] * w2) / sum;
              if (x * s > cx * s) lim = Math.min(lim, x * s);
            });
          }
        // 輪轂比輪面凸出寬度的 12%（render/proc-tank.js）
        const inner = s > 0 ? x0 : x1;
        const w = Math.min(sz[0], (lim - 0.03 - inner * s) / 1.12);
        if (s > 0) x1 = x0 + w;
        else x0 = x1 - w;
      }
      wheels.push([(x0 + x1) / 2, cy, (c.mn[2] + c.mx[2]) / 2, r, x1 - x0].map(r3));
      c.tris.forEach((i) => drop.add(i));
    } else if (
      ax > 3.3 &&
      n >= 18 &&
      n <= 48 &&
      !c.main &&
      sz[0] > 1.5 &&
      sz[0] < 2.1 &&
      Math.min(sz[1], sz[2]) < 0.6 &&
      Math.max(sz[1], sz[2]) < 1.0
    ) {
      links.push({ c, cen: c.mn.map((x, k) => (x + c.mx[k]) / 2), sz });
      c.tris.forEach((i) => drop.add(i));
    }
  }
  // 範本：最扁的那一片（在底部、水平）
  const tpl = links.slice().sort((a, b) => a.sz[1] - b.sz[1] || a.c.tris.length - b.c.tris.length)[0];
  const link = tpl.c.tris.map((i) => [
    raw[i].slot,
    ...raw[i].p.map((q) => q.map((x, k) => r3(x - tpl.cen[k]))),
  ]);
  // 四個履帶艙（左右 × 前後）：片的中心繞艙的中心排序（從上方的缺口開始：後端往下 → 底部往前 → 前端往上），
  // 上方補一段藏在側裙裡的回程
  const tracks = [];
  for (const sx of [1, -1])
    for (const fz of [1, -1]) {
      const L = links.filter((l) => Math.sign(l.cen[0]) === sx && (l.cen[2] > -0.6 ? 1 : -1) === fz);
      if (L.length < 6) continue;
      const cy = L.reduce((q, l) => q + l.cen[1], 0) / L.length,
        cz = (Math.min(...L.map((l) => l.cen[2])) + Math.max(...L.map((l) => l.cen[2]))) / 2;
      const ang = (l) =>
        (Math.atan2(l.cen[1] - cy, l.cen[2] - cz) - Math.PI / 2 + Math.PI * 4) % (Math.PI * 2);
      L.sort((a, b) => ang(a) - ang(b));
      const pts = L.map((l) => [l.cen[1], l.cen[2]]);
      const top = Math.max(...L.map((l) => l.c.mx[1])) - 0.12;
      const a = pts[0],
        b = pts[pts.length - 1];
      pts.push([top, b[1] - 0.45], [top, a[1] + 0.45]);
      // 間距：底部相鄰兩片的中心距離的中位數
      const ds = [];
      for (let i = 1; i < L.length; i++)
        if (L[i].sz[1] < 0.3 && L[i - 1].sz[1] < 0.3) ds.push(Math.abs(L[i].cen[2] - L[i - 1].cen[2]));
      ds.sort((p, q) => p - q);
      let total = 0;
      for (let i = 0; i < pts.length; i++) {
        const q = pts[(i + 1) % pts.length];
        total += Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]);
      }
      tracks.push({
        x: r3(L.reduce((q, l) => q + l.cen[0], 0) / L.length),
        n: Math.round(total / (ds[ds.length >> 1] || 0.52)),
        pts: pts.map((q) => q.map(r3)),
      });
    }
  const keep = raw.filter((_, i) => !drop.has(i));
  raw.length = 0;
  raw.push(...keep);
  console.log(
    `戰車腳：輪子 ${wheels.length} 個、履帶片 ${links.length} 片（${tracks.length} 條履帶，各 ${tracks.map((t) => t.n).join('／')} 片）、範本 ${link.length} 個三角形`,
  );
  return { wheels, link, tracks };
}
const PARTS = ARG.tank ? tankParts() : null;
// 焊接
const V = [];
const vid = new Map();
const vkey = (p) => Math.round(p[0] / 1e-4) + ',' + Math.round(p[1] / 1e-4) + ',' + Math.round(p[2] / 1e-4);
const T = [];
for (const t of raw) {
  const v = t.p.map((p) => {
    const k = vkey(p);
    let i = vid.get(k);
    if (i === undefined) {
      i = V.length;
      vid.set(k, i);
      V.push(p);
    }
    return i;
  });
  const n = cross(sub(V[v[1]], V[v[0]]), sub(V[v[2]], V[v[0]]));
  const ar = len(n) / 2;
  if (ar < 1e-8) continue;
  const nn = nrm(n);
  T.push({ v, slot: t.slot, n: nn, ar, d: dot(nn, V[v[0]]) });
}

// 點在原本的實體裡？射線的交點數是奇數；外殼有破洞（沒封閉的邊），所以打三個方向取多數
function hits(p, dir) {
  let n = 0;
  for (const t of T) {
    const a = V[t.v[0]],
      e1 = sub(V[t.v[1]], a),
      e2 = sub(V[t.v[2]], a);
    const h = cross(dir, e2),
      det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const s = sub(p, a),
      u = dot(s, h) / det;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1),
      v = dot(dir, q) / det;
    if (v < 0 || u + v > 1) continue;
    if (dot(e2, q) / det > 1e-6) n++;
  }
  return n;
}
// 從 p 往法線那一側看得到外面？法線方向＋繞一圈斜 50° 的方向共 9 條射線，有一條沒被擋住就算
// （不靠交點數的奇偶：從整台機甲切下來的區塊切口是開的，奇偶會判錯）
function escapes(p, n) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = nrm(cross(n, a)),
    w = cross(n, u);
  if (hits(p, n) === 0) return true;
  const c = Math.cos((50 * Math.PI) / 180),
    sn = Math.sin((50 * Math.PI) / 180);
  for (let k = 0; k < 8; k++) {
    const t = (k * Math.PI) / 4;
    const d = [0, 1, 2].map((i) => n[i] * c + (u[i] * Math.cos(t) + w[i] * Math.sin(t)) * sn);
    if (hits(p, d) === 0) return true;
  }
  return false;
}

// ---------- 共平面的面（同色槽）----------
const E = new Map();
T.forEach((t, i) => {
  for (let q = 0; q < 3; q++) {
    const a = t.v[q],
      c = t.v[(q + 1) % 3];
    const k = a < c ? a + '_' + c : c + '_' + a;
    if (!E.has(k)) E.set(k, []);
    E.get(k).push(i);
  }
});
const COS = Math.cos((2.5 * Math.PI) / 180);
const fa = T.map((_, i) => i);
const ff = (x) => {
  while (fa[x] !== x) {
    fa[x] = fa[fa[x]];
    x = fa[x];
  }
  return x;
};
for (const l of E.values())
  for (let i = 0; i < l.length; i++)
    for (let k = i + 1; k < l.length; k++) {
      const A = T[l[i]],
        B = T[l[k]];
      if (A.slot === B.slot && dot(A.n, B.n) > COS) fa[ff(l[i])] = ff(l[k]);
    }
const FM = new Map();
T.forEach((t, i) => {
  const r = ff(i);
  if (!FM.has(r)) FM.set(r, []);
  FM.get(r).push(i);
});
const F = [...FM.values()].map((list) => {
  let n = [0, 0, 0],
    ar = 0;
  const vs = new Set();
  for (const i of list) {
    const t = T[i];
    n = n.map((x, c) => x + t.n[c] * t.ar);
    ar += t.ar;
    t.v.forEach((v) => vs.add(v));
  }
  n = nrm(n);
  let d = 0;
  for (const v of vs) d += dot(n, V[v]);
  return { tris: list, n, d: d / vs.size, ar, vs: [...vs], slot: T[list[0]].slot };
});
const fOf = new Map();
F.forEach((f, i) => f.tris.forEach((t) => fOf.set(t, i)));
const adj = F.map(() => new Set());
for (const l of E.values())
  for (let i = 0; i < l.length; i++)
    for (let k = i + 1; k < l.length; k++) {
      const a = fOf.get(l[i]),
        b = fOf.get(l[k]);
      if (a !== b) {
        adj[a].add(b);
        adj[b].add(a);
      }
    }

// ---------- 凸片：從最大的面開始長，鄰面和現有的面互相都在背面才加入；sameSlot＝只長同色槽 ----------
function segment(ids, CT, sameSlot) {
  const inSet = new Set(ids);
  const used = new Set();
  const out = [];
  for (const s of ids.slice().sort((a, b) => F[b].ar - F[a].ar)) {
    if (used.has(s)) continue;
    const pat = { fs: [s], vs: new Set(F[s].vs) };
    used.add(s);
    const q = [s];
    while (q.length) {
      const c = q.shift();
      for (const nb of [...adj[c]].sort((a, b) => F[b].ar - F[a].ar)) {
        if (used.has(nb) || !inSet.has(nb)) continue;
        const G = F[nb];
        if (sameSlot && G.slot !== F[s].slot) continue;
        let ok = true;
        for (const fi of pat.fs) {
          const H = F[fi];
          for (const v of G.vs)
            if (dot(H.n, V[v]) - H.d > CT) {
              ok = false;
              break;
            }
          if (!ok) break;
        }
        if (ok)
          for (const v of pat.vs)
            if (dot(G.n, V[v]) - G.d > CT) {
              ok = false;
              break;
            }
        if (ok) {
          used.add(nb);
          pat.fs.push(nb);
          G.vs.forEach((v) => pat.vs.add(v));
          q.push(nb);
        }
      }
    }
    out.push(pat.fs);
  }
  return out;
}
const slotArea = (fs2) => {
  const a = Array(NS).fill(0);
  for (const fi of fs2) a[F[fi].slot] += F[fi].ar;
  return a;
};

// 一片 → 凸包（面合併成多邊形）；回傳 { pts, faces: [{ loop, n, d, closing }] } 或 null（平面片）
function hullOf(fs2) {
  const vs = new Set();
  for (const fi of fs2) F[fi].vs.forEach((v) => vs.add(v));
  const pts = [...vs].map((i) => V[i]);
  if (pts.length < 4) return null;
  const big = fs2.slice().sort((a, b) => F[b].ar - F[a].ar)[0];
  let lo = 1e9,
    hi = -1e9;
  for (const p of pts) {
    const d = dot(F[big].n, p);
    lo = Math.min(lo, d);
    hi = Math.max(hi, d);
  }
  if (hi - lo < FLAT) return null;
  let hull;
  try {
    hull = new ConvexHull().setFromPoints(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  } catch (e) {
    return null;
  }
  if (!hull || hull.faces.length < 4) return null;
  // 共平面的三角形合併
  const groups = [];
  for (const face of hull.faces) {
    const n = [face.normal.x, face.normal.y, face.normal.z],
      d = face.constant;
    const P = [];
    let e = face.edge;
    do {
      const p = e.head().point;
      P.push([p.x, p.y, p.z]);
      e = e.next;
    } while (e !== face.edge);
    let g = groups.find((x) => dot(x.n, n) > 0.9995 && Math.abs(x.d - d) < 2e-3);
    if (!g) groups.push((g = { n, d, P: [], ar: 0 }));
    g.P.push(...P);
    g.ar += face.area;
  }
  const faces = groups.map((g) => {
    // 多邊形：頂點繞中心排序
    const uniq = [];
    for (const p of g.P) if (!uniq.some((q) => len(sub(p, q)) < 1e-5)) uniq.push(p);
    const c = uniq
      .reduce((s, p) => [s[0] + p[0], s[1] + p[1], s[2] + p[2]], [0, 0, 0])
      .map((x) => x / uniq.length);
    const ax = nrm(sub(uniq[0], c)),
      ay = cross(g.n, ax);
    uniq.sort(
      (p, q) =>
        Math.atan2(dot(sub(p, c), ay), dot(sub(p, c), ax)) -
        Math.atan2(dot(sub(q, c), ay), dot(sub(q, c), ax)),
    );
    // 封口面：沒有同平面的原面
    let match = 0;
    for (const fi of fs2) if (dot(F[fi].n, g.n) > 0.985 && Math.abs(F[fi].d - g.d) < 0.03) match += F[fi].ar;
    return { loop: uniq, n: g.n, d: g.d, ar: g.ar, c, closing: match < g.ar * 0.15 };
  });
  return { pts, faces };
}
// 封口面露在外面的面積
// 點 p 是否貼著原本的表面（同方向的面、距離 8 mm 內、投影落在某個三角形裡）
function onSurface(p, n) {
  for (const t of T) {
    if (dot(t.n, n) < 0.96 || Math.abs(dot(t.n, p) - t.d) > 0.008) continue;
    const a = V[t.v[0]],
      b = V[t.v[1]],
      c = V[t.v[2]];
    const s0 = dot(cross(sub(b, a), sub(p, a)), t.n),
      s1 = dot(cross(sub(c, b), sub(p, b)), t.n),
      s2 = dot(cross(sub(a, c), sub(p, c)), t.n);
    if (s0 >= -1e-6 && s1 >= -1e-6 && s2 >= -1e-6) return true;
  }
  return false;
}
function exposed(h) {
  let a = 0;
  for (const f of h.faces) {
    // 每個面都查（有一部分貼著原表面、另一部分橫跨凹槽的面也算）。取樣：中心＋往每個頂點 45%、85% 的點
    const S = [f.c];
    for (const v of f.loop)
      for (const k of [0.45, 0.85]) S.push([0, 1, 2].map((c) => f.c[c] + (v[c] - f.c[c]) * k));
    let n = 0;
    for (const q of S) {
      if (onSurface(q, f.n)) continue;
      if (escapes([q[0] + f.n[0] * 0.012, q[1] + f.n[1] * 0.012, q[2] + f.n[2] * 0.012], f.n)) n++;
    }
    a += (f.ar * n) / S.length;
  }
  return a;
}

// ---------- 主流程：切片 → 依色槽再切 → 封口面露出來的重切 ----------
const blocks = []; // { fs, hull }（hull＝null：平面片）
const st = { resplitSlot: 0, resplitExp: 0, open: 0 };
function emit(fs2, CT, sameSlot) {
  const ar = fs2.reduce((s, fi) => s + F[fi].ar, 0);
  let h = fs2.length > 1 ? hullOf(fs2) : null;
  if (h) {
    const ex = exposed(h);
    if (ex > Math.max(LIM_ABS, ar * LIM_REL)) {
      if (fs2.length > 2 && CT > CT_MIN) {
        st.resplitExp++;
        const nc = Math.max(CT_MIN, CT / 2.5);
        for (const g of segment(fs2, nc, sameSlot)) emit(g, nc, sameSlot);
        return;
      }
      // 切到最細還是蓋住凹洞（圍著洞的一圈面）：不補面，保留原本的表面
      st.open++;
      h = null;
    }
  }
  blocks.push({ fs: fs2, hull: h, ar });
}
for (const g of segment(
  F.map((_, i) => i),
  CT0,
  false,
))
  emit(g, CT0, false);

if (ARG.report) {
  const rows = blocks
    .filter((b) => b.hull)
    .map((b) => ({
      ex: exposed(b.hull),
      n: b.fs.length,
      ar: b.ar,
      c: b.hull.pts
        .reduce((q, v) => [q[0] + v[0], q[1] + v[1], q[2] + v[2]], [0, 0, 0])
        .map((x) => (x / b.hull.pts.length).toFixed(2)),
    }))
    .sort((a, b) => b.ex - a.ex);
  console.log('封口面露出最多的塊體：');
  for (const r of rows.slice(0, 12))
    console.log(`  露出 ${r.ex.toFixed(4)} m²　面數 ${r.n}　面積 ${r.ar.toFixed(3)}　中心 ${r.c}`);
  console.log('  合計露出', rows.reduce((q, r) => q + r.ex, 0).toFixed(3), 'm²');
}
// ---------- 辨識基本形體 ----------
const PAINT = 0.0025;
const paint = []; // 色片的三角形（單面）
const AX = ['x', 'y', 'z'];
function classify(b) {
  const sa = slotArea(b.fs);
  const slot = sa.indexOf(Math.max(...sa));
  // 塊體上顏色和所在的面不同的原面：薄色片（貼到那個面上再往外 PAINT，不會被塊體的面蓋住）
  // faceSlot(原面)＝它所在的那個塊體的面的色槽與平面（沒給＝塊體的色槽、原面自己的平面）
  const addPaint = (faceOf) => {
    for (const fi of b.fs) {
      const g = faceOf ? faceOf(F[fi]) : null;
      const base = g ? g.slot : slot;
      if (F[fi].slot === base) continue;
      const n = g ? g.n : F[fi].n,
        d = g ? g.d : F[fi].d;
      for (const ti of F[fi].tris)
        paint.push([
          F[fi].slot,
          ...T[ti].v.map((i) => {
            const k = d - dot(n, V[i]) + PAINT;
            return [r3(V[i][0] + n[0] * k), r3(V[i][1] + n[1] * k), r3(V[i][2] + n[2] * k)];
          }),
        ]);
    }
  };
  if (!b.hull) {
    // 平面片：原本的三角形（依色槽）
    const tris = [];
    for (const fi of b.fs)
      for (const ti of F[fi].tris) tris.push([F[fi].slot, ...T[ti].v.map((i) => V[i].map(r3))]);
    return { k: 'T', tris };
  }
  const P = b.hull.pts;
  const mn = [0, 1, 2].map((c) => Math.min(...P.map((p) => p[c]))),
    mx = [0, 1, 2].map((c) => Math.max(...P.map((p) => p[c])));
  // 依「露出來的面的方向」辨識（被擋住的角沒有頂點，不能看頂點）；補出來的部分不能露在外面
  const C4 = Math.cos((4 * Math.PI) / 180),
    S4 = Math.sin((4 * Math.PI) / 180);
  const fsBig = b.fs.filter((fi) => F[fi].ar > 0.0015);
  const lim = Math.max(LIM_ABS, b.ar * LIM_REL);
  const oneSlot = sa[slot] > b.ar * 0.9; // 方塊與柱體只有一個色槽：異色的面超過一成就用凸塊（每個面各自的色槽）
  const polyFace = (loop) => {
    const c = loop
      .reduce((q, v) => [q[0] + v[0], q[1] + v[1], q[2] + v[2]], [0, 0, 0])
      .map((x) => x / loop.length);
    let n = [0, 0, 0];
    for (let i = 1; i < loop.length - 1; i++) {
      const x = cross(sub(loop[i], loop[0]), sub(loop[i + 1], loop[0]));
      n = [n[0] + x[0], n[1] + x[1], n[2] + x[2]];
    }
    return { loop, c, n: nrm(n), ar: len(n) / 2, closing: true };
  };
  // 軸向方塊：面都對齊三個軸
  if (fsBig.length && fsBig.every((fi) => F[fi].n.some((x) => Math.abs(x) > C4))) {
    const c = (i) => [i & 1 ? mx[0] : mn[0], i & 2 ? mx[1] : mn[1], i & 4 ? mx[2] : mn[2]];
    const faces = [
      [1, 3, 7, 5],
      [0, 4, 6, 2],
      [2, 6, 7, 3],
      [0, 1, 5, 4],
      [4, 5, 7, 6],
      [0, 2, 3, 1],
    ].map((f) => polyFace(f.map(c)));
    if ([0, 1, 2].every((k) => mx[k] - mn[k] > FLAT) && oneSlot && exposed({ faces }) < lim) {
      addPaint();
      return { k: 'B', slot, a: mn.map(r3), b: mx.map(r3) };
    }
  }
  // 沿軸擠出的柱體：面不是垂直軸（兩端）就是平行軸（側面）
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3,
      w = (a + 2) % 3;
    if (!fsBig.length || !fsBig.every((fi) => Math.abs(F[fi].n[a]) > C4 || Math.abs(F[fi].n[a]) < S4))
      continue;
    if (!fsBig.some((fi) => Math.abs(F[fi].n[a]) < S4)) continue;
    const pts = [];
    for (const p of P)
      if (!pts.some((q) => Math.hypot(p[u] - q[0], p[w] - q[1]) < TOL * 0.5)) pts.push([p[u], p[w]]);
    const prof = hull2(pts);
    if (prof.length < 3 || mx[a] - mn[a] < FLAT) continue;
    const at = (e, q) => {
      const v = [0, 0, 0];
      v[a] = e;
      v[u] = q[0];
      v[w] = q[1];
      return v;
    };
    const faces = [
      polyFace(prof.map((q) => at(mx[a], q))),
      polyFace(prof.map((q) => at(mn[a], q)).reverse()),
    ];
    for (let i = 0; i < prof.length; i++) {
      const q0 = prof[i],
        q1 = prof[(i + 1) % prof.length];
      faces.push(polyFace([at(mn[a], q0), at(mn[a], q1), at(mx[a], q1), at(mx[a], q0)]));
    }
    if (oneSlot && exposed({ faces }) < lim) {
      addPaint();
      return { k: 'P', slot, ax: a, a0: r3(mn[a]), a1: r3(mx[a]), prof: prof.map((p) => p.map(r3)) };
    }
  }
  // 一般凸塊
  const pts = [];
  const id = (p) => {
    const pr = p.map(r3);
    let i = pts.findIndex((q) => q[0] === pr[0] && q[1] === pr[1] && q[2] === pr[2]);
    if (i < 0) {
      i = pts.length;
      pts.push(pr);
    }
    return i;
  };
  // 每個面的色槽：同平面的原面裡面積最大的色槽；沒有對應的原面（封口面）用塊體的色槽
  const HF = b.hull.faces.map((f) => {
    const a = Array(NS).fill(0);
    for (const fi of b.fs)
      if (dot(F[fi].n, f.n) > 0.985 && Math.abs(F[fi].d - f.d) < 0.03) a[F[fi].slot] += F[fi].ar;
    const m = Math.max(...a);
    return { n: f.n, d: f.d, slot: m > 0 ? a.indexOf(m) : slot, loop: f.loop };
  });
  addPaint((fc) => {
    let best = null,
      bd = 1e9;
    for (const g of HF) {
      if (dot(g.n, fc.n) < 0.985) continue;
      const dd = Math.abs(g.d - fc.d);
      if (dd < 0.03 && dd < bd) {
        bd = dd;
        best = g;
      }
    }
    return best;
  });
  const faces = [],
    fsl = [];
  for (const g of HF) {
    const f = g.loop.map(id).filter((v, i, a) => v !== a[(i + 1) % a.length]);
    if (f.length < 3) continue;
    faces.push(f);
    fsl.push(g.slot);
  }
  return { k: 'H', slot, pts, faces, fsl: fsl.some((x) => x !== slot) ? fsl : null };
}
// 2D 凸包（逆時針）
function hull2(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [],
    up = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-7) lo.pop();
    lo.push(q);
  }
  for (const q of p.slice().reverse()) {
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 1e-7) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
let prims = blocks.sort((a, b) => b.ar - a.ar).map(classify);
if (paint.length) prims.push({ k: 'D', tris: paint });
if (WAR.length) prims.push({ k: 'T', tris: WAR });

// ---------- 左右對稱：鏡射後和另一個相同的只留一份 ----------
const cen = (p) => {
  if (p.k === 'B') return [(p.a[0] + p.b[0]) / 2, (p.a[1] + p.b[1]) / 2, (p.a[2] + p.b[2]) / 2];
  if (p.k === 'P') {
    const c2 = p.prof.reduce((s, q) => [s[0] + q[0], s[1] + q[1]], [0, 0]).map((x) => x / p.prof.length);
    const c = [0, 0, 0];
    c[p.ax] = (p.a0 + p.a1) / 2;
    c[(p.ax + 1) % 3] = c2[0];
    c[(p.ax + 2) % 3] = c2[1];
    return c;
  }
  if (p.k === 'H')
    return p.pts
      .reduce((s, q) => [s[0] + q[0], s[1] + q[1], s[2] + q[2]], [0, 0, 0])
      .map((x) => x / p.pts.length);
  return null;
};
const cloud = (p) => {
  if (p.k === 'B') {
    const o = [];
    for (let m = 0; m < 8; m++) o.push([0, 1, 2].map((k) => ((m >> k) & 1 ? p.b[k] : p.a[k])));
    return o;
  }
  if (p.k === 'P') {
    const o = [];
    for (const e of [p.a0, p.a1])
      for (const q of p.prof) {
        const c = [0, 0, 0];
        c[p.ax] = e;
        c[(p.ax + 1) % 3] = q[0];
        c[(p.ax + 2) % 3] = q[1];
        o.push(c);
      }
    return o;
  }
  return p.pts;
};
const MT = TOL * 1.6;
const done = new Set();
let pairs = 0;
for (let i = 0; i < (ARG.nomirror ? 0 : prims.length); i++) {
  const A = prims[i];
  if (A.k === 'T' || A.k === 'D' || done.has(i)) continue;
  const ca = cen(A);
  if (Math.abs(ca[0]) < MT) continue; // 在中線上
  const ma = cloud(A).map((p) => [-p[0], p[1], p[2]]);
  for (let k = i + 1; k < prims.length; k++) {
    const B = prims[k];
    if (done.has(k) || B.k !== A.k || B.slot !== A.slot || A.fsl || B.fsl) continue;
    const cb = cloud(B);
    if (cb.length !== ma.length) continue;
    if (
      ma.every((p) => cb.some((q) => len(sub(p, q)) < MT)) &&
      cb.every((p) => ma.some((q) => len(sub(p, q)) < MT))
    ) {
      // 留 x > 0 的那一個
      const keep = ca[0] > 0 ? i : k;
      prims[keep].m = 1;
      done.add(keep === i ? k : i);
      pairs++;
      break;
    }
  }
}
prims = prims.filter((_, i) => !done.has(i));

// ---------- 輸出 ----------
const cnt = { B: 0, P: 0, H: 0, T: 0, D: 0 };
for (const p of prims) cnt[p.k]++;
const tri = (p) =>
  (p.k === 'B'
    ? 12
    : p.k === 'P'
      ? p.prof.length * 2 + (p.prof.length - 2) * 2
      : p.k === 'H'
        ? p.faces.reduce((s, f) => s + f.length - 2, 0)
        : p.tris.length) * (p.m ? 2 : 1);
console.log(
  `原本 ${T.length} 個三角形、${F.length} 個面 → 方塊 ${cnt.B}、柱體 ${cnt.P}、凸塊 ${cnt.H}、平面片 ${cnt.T}、色片的三角形 ${paint.length}（鏡射 ${pairs} 對；依色槽重切 ${st.resplitSlot}、封口面露出重切 ${st.resplitExp}、不補面 ${st.open}）＝${prims.reduce((s, p) => s + tri(p), 0)} 個三角形`,
);
const q = (a) => JSON.stringify(a);
const lines = prims.map((p) => {
  const m = p.m ? ', 1' : '';
  if (p.k === 'B') return `  ['B', ${p.slot}, ${q(p.a)}, ${q(p.b)}${m}],`;
  if (p.k === 'P') return `  ['P', ${p.slot}, '${AX[p.ax]}', ${p.a0}, ${p.a1}, ${q(p.prof)}${m}],`;
  if (p.k === 'H')
    return `  ['H', ${p.slot}, ${q(p.pts)}, ${q(p.faces)}${p.fsl ? ', ' + q(p.fsl) : ''}${m}],`;
  return `  ['${p.k}', ${q(p.tris)}],`;
});
const src = `// ${NAME}：照 GLB（${path.basename(glbPath)}）量測重建的程式模型（scripts/glb-to-proc.mjs 產生，不要手改；要調整就改產生器再重跑）。
// 基本形體：['B', 色槽, 最小角, 最大角]＝軸向方塊、['P', 色槽, 軸, 起, 訖, 截面]＝沿軸擠出的多邊形柱、
// ['H', 色槽, 頂點, 面, 各面的色槽?]＝凸塊、['T', [[色槽, a, b, c]…]]＝沒有補面的表面（照原本的三角形，單面）、['D', …]＝貼在表面的色片；最後的 1＝左右鏡射再放一份。
// 色槽 0 main／1 sub／2 joint／3 acc；座標是 glTF（+Z 正面）、公尺。組成網格：render/proc-prims.js 的 primsGeo
// prettier-ignore
export const ${NAME}Prims = [
${lines.join('\n')}
];
${
  COLS
    ? `// 固定色（貼圖上的顏色，不跟著配色換）：色槽 4 起
// prettier-ignore
export const ${NAME}Cols = ${JSON.stringify(COLS)};
`
    : ''
}${
  AT
    ? `// 這個節點在 GLB 裡的位置（glTF 座標）
export const ${NAME}At = ${JSON.stringify(AT.map(r3))};
`
    : ''
}${
  PARTS
    ? `// 會動的零件（戰車腳，render/proc-tank.js）：wheels＝[x, y, z, 半徑, 寬]…、link＝一片履帶的三角形（以它的中心為原點）、
// tracks＝每條履帶的 x、片數、路徑（[y, z]…，封閉）
// prettier-ignore
export const ${NAME}Parts = ${JSON.stringify(PARTS)};
`
    : ''
}`;
fs.writeFileSync(outPath, src);
console.log('寫出', outPath, (src.length / 1024).toFixed(0) + ' KB');
