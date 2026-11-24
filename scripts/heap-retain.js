// 記憶體快照（.heapsnapshot）的保留路徑：找出有某個屬性名稱（預設 __leakMark）的物件，
// 印出從 GC 根到它最短的保留路徑（略過弱參照）。快照很大，用串流讀數字、不整份 JSON.parse。
//   node --max-old-space-size=8192 scripts/heap-retain.js <檔案> [--mark=__leakMark] [--n=6]
const fs = require('fs');

function parseSnapshot(file) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const CH = 1 << 24;
  const buf = Buffer.alloc(CH);
  let pos = 0;
  // 標頭：到 "nodes":[ 為止
  let head = '';
  let off = -1;
  while (off < 0) {
    const n = fs.readSync(fd, buf, 0, CH, pos);
    head += buf.toString('latin1', 0, n);
    off = head.indexOf('"nodes":[');
    if (off < 0) pos += n;
  }
  const hj = head.slice(0, off).replace(/,\s*$/, '') + '}';
  const meta = JSON.parse(hj).snapshot;
  pos = off + 9; // head 以 latin1 解碼：一個字元一個位元組
  const NF = meta.meta.node_fields.length,
    EF = meta.meta.edge_fields.length;
  const nodes = new Uint32Array(meta.node_count * NF);
  const edges = new Uint32Array(meta.edge_count * EF);
  // 讀一串以逗號分隔的數字到 arr，遇到 ] 結束；回傳結束後的位置
  const readNums = (arr) => {
    let i = 0,
      cur = 0,
      has = false;
    for (;;) {
      const n = fs.readSync(fd, buf, 0, CH, pos);
      if (!n) throw new Error('檔案提早結束');
      for (let k = 0; k < n; k++) {
        const c = buf[k];
        if (c >= 48 && c <= 57) {
          cur = cur * 10 + (c - 48);
          has = true;
        } else if (c === 44 || c === 93) {
          if (has) arr[i++] = cur;
          cur = 0;
          has = false;
          if (c === 93) {
            pos += k + 1;
            return i;
          }
        }
      }
      pos += n;
    }
  };
  const seek = (s) => {
    const n = fs.readSync(fd, buf, 0, 4096, pos);
    const t = buf.toString('latin1', 0, n);
    const j = t.indexOf(s);
    if (j < 0) throw new Error('找不到 ' + s);
    pos += j + s.length;
  };
  readNums(nodes);
  seek('"edges":[');
  readNums(edges);
  // 字串：找 "strings":[，之後整段解碼
  let sp = -1;
  {
    let p = pos;
    let carry = '';
    while (sp < 0 && p < size) {
      const n = fs.readSync(fd, buf, 0, CH, p);
      const t = carry + buf.toString('latin1', 0, n);
      const j = t.indexOf('"strings":[');
      if (j >= 0) sp = p - carry.length + j + 10;
      else {
        carry = t.slice(-16);
        p += n;
      }
    }
  }
  const rest = Buffer.alloc(size - sp);
  fs.readSync(fd, rest, 0, rest.length, sp);
  fs.closeSync(fd);
  let txt = rest.toString('utf8').trimEnd();
  if (txt.endsWith('}')) txt = txt.slice(0, -1);
  const strings = JSON.parse(txt);
  return { meta: meta.meta, nodes, edges, strings, NF, EF };
}

function analyze(file, mark, maxN, census, K = 6) {
  console.log('讀取快照…');
  const S = parseSnapshot(file);
  const { meta, nodes, edges, strings, NF, EF } = S;
  const nType = meta.node_types[0],
    eType = meta.edge_types[0];
  const iT = meta.node_fields.indexOf('type'),
    iN = meta.node_fields.indexOf('name'),
    iEC = meta.node_fields.indexOf('edge_count'),
    iSz = meta.node_fields.indexOf('self_size');
  const eT = meta.edge_fields.indexOf('type'),
    eN = meta.edge_fields.indexOf('name_or_index'),
    eTo = meta.edge_fields.indexOf('to_node');
  const N = nodes.length / NF;
  const first = new Uint32Array(N + 1);
  for (let i = 0; i < N; i++) first[i + 1] = first[i] + nodes[i * NF + iEC] * EF;
  const WEAK = eType.indexOf('weak'),
    SHORT = eType.indexOf('shortcut');
  const ELEM = eType.indexOf('element'),
    HID = eType.indexOf('hidden');
  const markIdx = strings.indexOf(mark);
  // 從根的距離（BFS，略過弱參照）
  console.log(`節點 ${N}、邊 ${edges.length / EF}；計算距離…`);
  const dist = new Int32Array(N).fill(-1);
  const q = new Uint32Array(N);
  let qh = 0,
    qt = 0;
  dist[0] = 0;
  q[qt++] = 0;
  while (qh < qt) {
    const u = q[qh++];
    for (let e = first[u]; e < first[u + 1]; e += EF) {
      const t = edges[e + eT];
      if (t === WEAK || t === SHORT) continue;
      const v = edges[e + eTo] / NF;
      if (dist[v] < 0) {
        dist[v] = dist[u] + 1;
        q[qt++] = v;
      }
    }
  }
  // 反向邊（CSR）
  const rc = new Uint32Array(N + 1);
  for (let e = 0; e < edges.length; e += EF) rc[edges[e + eTo] / NF + 1]++;
  for (let i = 0; i < N; i++) rc[i + 1] += rc[i];
  const rfill = rc.slice(0, N);
  const rev = new Uint32Array(edges.length / EF);
  for (let u = 0; u < N; u++)
    for (let e = first[u]; e < first[u + 1]; e += EF) rev[rfill[edges[e + eTo] / NF]++] = e;
  const owner = (e) => {
    // 邊 e 屬於哪個節點：二分搜尋 first
    let lo = 0,
      hi = N;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (first[m] <= e) lo = m;
      else hi = m - 1;
    }
    return lo;
  };
  const nodeName = (u) => {
    const t = nType[nodes[u * NF + iT]];
    let s = strings[nodes[u * NF + iN]] || '';
    if (s.length > 60) s = s.slice(0, 60) + '…';
    return `${t}:${s}`;
  };
  const edgeName = (e) => {
    const t = edges[e + eT];
    const n = edges[e + eN];
    return t === ELEM || t === HID ? `[${n}]` : `.${strings[n]}`;
  };
  // 有 mark 屬性的物件
  const targets = [];
  if (markIdx >= 0)
    for (let u = 0; u < N; u++)
      for (let e = first[u]; e < first[u + 1]; e += EF)
        if (edges[e + eN] === markIdx && eType[edges[e + eT]] === 'property') {
          targets.push([u, strings[nodes[(edges[e + eTo] / NF) * NF + iN]]]);
          break;
        }
  console.log(`有 ${mark} 的物件 ${targets.length} 個`);
  const chain = (u0) => {
    const p = [];
    let u = u0;
    while (dist[u] > 0 && p.length < 40) {
      let best = -1,
        bd = 1e9;
      for (let k = rc[u]; k < rc[u + 1]; k++) {
        const e = rev[k];
        const t = edges[e + eT];
        if (t === WEAK || t === SHORT) continue;
        const o = owner(e);
        if (dist[o] >= 0 && dist[o] < bd) {
          bd = dist[o];
          best = e;
        }
      }
      if (best < 0) break;
      const o = owner(best);
      p.push(`${nodeName(o)} ${edgeName(best)}`);
      u = o;
    }
    return p.reverse();
  };
  for (const [u0, tag] of targets.slice(0, maxN)) {
    if (dist[u0] < 0) {
      console.log(`\n■ ${tag}：從根走不到（只有弱參照）`);
      continue;
    }
    console.log(`\n■ ${tag}（距離 ${dist[u0]}）`);
    for (const s of chain(u0)) console.log('   ' + s);
  }
  // 統計：名稱符合 census 的物件，依保留路徑（Game 以下的前 K 段）分組
  if (census) {
    // census＝名稱的正規式，或 prop:屬性名稱＝有這個屬性的物件（壓縮過的類別名稱認不出來時）
    const pi = census.startsWith('prop:') ? strings.indexOf(census.slice(5)) : -2;
    const re = new RegExp(census);
    const hasProp = (u) => {
      for (let e = first[u]; e < first[u + 1]; e += EF)
        if (edges[e + eN] === pi && edges[e + eT] !== ELEM) return true;
      return false;
    };
    const OBJ = nType.indexOf('object');
    const grp = new Map(),
      ex = new Map();
    let tot = 0;
    for (let u = 0; u < N; u++) {
      if (nodes[u * NF + iT] !== OBJ || dist[u] < 0) continue;
      if (pi > -2 ? pi < 0 || !hasProp(u) : !re.test(strings[nodes[u * NF + iN]])) continue;
      tot++;
      const c = chain(u);
      // 分組的起點：模組變數（閉包的 scope）或 Game；都沒有時取最後 K 段
      let j = c.findIndex((s) => /Context \/ scope/.test(s));
      if (j < 0) j = c.findIndex((s) => /\.__game$/.test(s));
      const key = c
        .slice(j >= 0 ? j : Math.max(0, c.length - K))
        .slice(0, K)
        .map((s) => s.replace(/\[\d+\]$/, '[n]').replace(/ \.\d+$/, ' .n'))
        .join(' → ');
      grp.set(key, (grp.get(key) || 0) + 1);
      if (!ex.has(key)) ex.set(key, c);
    }
    console.log(`\n${census}：${tot} 個，依保留路徑：`);
    const top = [...grp].sort((a, b) => b[1] - a[1]);
    for (const [k, n] of top.slice(0, 40)) console.log(`  ${n}\t${k}`);
    // FULL=n：前 n 組各印一條完整的路徑
    for (const [k, n] of top.slice(0, +process.env.FULL || 0)) {
      console.log(`\n● ${n}`);
      for (const x of ex.get(k).slice(-16)) console.log('    ' + x);
    }
  }
  void iSz;
}

module.exports = { analyze };
if (require.main === module) {
  const a = Object.fromEntries(
    process.argv.slice(3).map((s) => {
      const m = /^--([^=]+)=(.*)$/.exec(s);
      return m ? [m[1], m[2]] : [s, true];
    }),
  );
  analyze(process.argv[2], a.mark || '__leakMark', +(a.n || 6), a.census, +(a.k || 6));
}
