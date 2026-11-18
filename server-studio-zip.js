// 立繪工房的 zip（docs/portrait-studio-design.md）：工作資料的下載與匯入
// - writeZip(out, entries)：不壓縮、一個檔案一個檔案寫進可寫串流（照顧背壓），超過 4 GB 或 65535 個檔案時用 zip64
//   entries：[{ name: zip 裡的路徑, file: 磁碟上的檔案 } 或 { name, data: Buffer } 或 { name, make: async () => Buffer }]
// - readZip(檔案)：讀中央目錄，回傳 [{ name, size, read(): Promise<Buffer> }]（不壓縮與 deflate；zip64）
'use strict';
const fs = require('fs');
const zlib = require('zlib');

let TABLE = null;
function crc32(buf) {
  if (zlib.crc32) return zlib.crc32(buf) >>> 0;
  if (!TABLE) {
    TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const U32 = 0xffffffff;
// 超過這個大小或位置就用 zip64（測試時用 _lim 調小，才驗證得到 zip64 的格式）
let LIM = U32;
function dosTime(d) {
  return {
    t: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    d: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}
// 64 位元的數字寫進 Buffer（Number 的整數範圍內）
const w64 = (b, v, o) => {
  b.writeUInt32LE(v % 0x100000000, o);
  b.writeUInt32LE(Math.floor(v / 0x100000000), o + 4);
};

async function writeZip(out, entries) {
  let off = 0;
  const cd = [];
  const put = (b) =>
    new Promise((res, rej) => {
      off += b.length;
      if (out.write(b)) res();
      else {
        out.once('drain', res);
        out.once('error', rej);
      }
    });
  for (const e of entries) {
    let data;
    let mt = new Date();
    try {
      // make()：寫到這一項時才產生（成品輸出邊合成邊寫）
      data = e.make ? await e.make() : e.data || fs.readFileSync(e.file);
      if (e.file) mt = fs.statSync(e.file).mtime;
    } catch (err) {
      continue; // 讀不到（剛好被刪掉）的略過
    }
    const name = Buffer.from(e.name.replace(/\\/g, '/'), 'utf8');
    const crc = crc32(data);
    const { t, d } = dosTime(mt);
    const big = data.length >= LIM;
    const lh = Buffer.alloc(30 + name.length + (big ? 20 : 0));
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(45, 4);
    lh.writeUInt16LE(0x0800, 6); // 檔名是 UTF-8
    lh.writeUInt16LE(0, 8); // 不壓縮
    lh.writeUInt16LE(t, 10);
    lh.writeUInt16LE(d, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(big ? U32 : data.length, 18);
    lh.writeUInt32LE(big ? U32 : data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(big ? 20 : 0, 28);
    name.copy(lh, 30);
    if (big) {
      lh.writeUInt16LE(1, 30 + name.length);
      lh.writeUInt16LE(16, 32 + name.length);
      w64(lh, data.length, 34 + name.length);
      w64(lh, data.length, 42 + name.length);
    }
    cd.push({ name, crc, t, d, size: data.length, off });
    await put(lh);
    await put(data);
  }
  const cdOff = off;
  for (const c of cd) {
    const z = c.size >= LIM || c.off >= LIM;
    const ex = z ? Buffer.alloc(4 + 8 * 3) : Buffer.alloc(0);
    if (z) {
      ex.writeUInt16LE(1, 0);
      ex.writeUInt16LE(24, 2);
      w64(ex, c.size, 4);
      w64(ex, c.size, 12);
      w64(ex, c.off, 20);
    }
    const h = Buffer.alloc(46 + c.name.length);
    h.writeUInt32LE(0x02014b50, 0);
    h.writeUInt16LE(45, 4);
    h.writeUInt16LE(45, 6);
    h.writeUInt16LE(0x0800, 8);
    h.writeUInt16LE(0, 10);
    h.writeUInt16LE(c.t, 12);
    h.writeUInt16LE(c.d, 14);
    h.writeUInt32LE(c.crc, 16);
    h.writeUInt32LE(z ? U32 : c.size, 20);
    h.writeUInt32LE(z ? U32 : c.size, 24);
    h.writeUInt16LE(c.name.length, 28);
    h.writeUInt16LE(ex.length, 30);
    h.writeUInt32LE(z ? U32 : c.off, 42);
    c.name.copy(h, 46);
    await put(Buffer.concat([h, ex]));
  }
  const cdSize = off - cdOff;
  const z64 = cd.length >= Math.min(0xffff, LIM) || cdOff >= LIM || cdSize >= LIM;
  if (z64) {
    const r = Buffer.alloc(56);
    r.writeUInt32LE(0x06064b50, 0);
    w64(r, 44, 4);
    r.writeUInt16LE(45, 12);
    r.writeUInt16LE(45, 14);
    w64(r, cd.length, 24);
    w64(r, cd.length, 32);
    w64(r, cdSize, 40);
    w64(r, cdOff, 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0);
    w64(loc, off, 8);
    loc.writeUInt32LE(1, 16);
    await put(r);
    await put(loc);
  }
  const e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0);
  e.writeUInt16LE(z64 ? 0xffff : cd.length, 8);
  e.writeUInt16LE(z64 ? 0xffff : cd.length, 10);
  e.writeUInt32LE(z64 ? U32 : cdSize, 12);
  e.writeUInt32LE(z64 ? U32 : cdOff, 16);
  await put(e);
}

function readZip(file) {
  const fd = fs.openSync(file, 'r');
  const size = fs.fstatSync(fd).size;
  const rd = (pos, n) => {
    const b = Buffer.alloc(n);
    fs.readSync(fd, b, 0, n, pos);
    return b;
  };
  const r64 = (b, o) => b.readUInt32LE(o) + b.readUInt32LE(o + 4) * 0x100000000;
  const tailN = Math.min(size, 65557);
  const tail = rd(size - tailN, tailN);
  let ep = -1;
  for (let i = tailN - 22; i >= 0; i--)
    if (tail.readUInt32LE(i) === 0x06054b50) {
      ep = i;
      break;
    }
  if (ep < 0) {
    fs.closeSync(fd);
    throw new Error('不是 zip 檔');
  }
  let n = tail.readUInt16LE(ep + 10);
  let cdSize = tail.readUInt32LE(ep + 12);
  let cdOff = tail.readUInt32LE(ep + 16);
  if (ep >= 20 && tail.readUInt32LE(ep - 20) === 0x07064b50) {
    const r = rd(r64(tail, ep - 20 + 8), 56);
    if (r.readUInt32LE(0) === 0x06064b50) {
      n = r64(r, 32);
      cdSize = r64(r, 40);
      cdOff = r64(r, 48);
    }
  }
  const cd = rd(cdOff, cdSize);
  const out = [];
  let p = 0;
  for (let i = 0; i < n && p + 46 <= cd.length; i++) {
    if (cd.readUInt32LE(p) !== 0x02014b50) break;
    const method = cd.readUInt16LE(p + 10);
    let csize = cd.readUInt32LE(p + 20);
    let usize = cd.readUInt32LE(p + 24);
    const nl = cd.readUInt16LE(p + 28);
    const el = cd.readUInt16LE(p + 30);
    const cl = cd.readUInt16LE(p + 32);
    let lo = cd.readUInt32LE(p + 42);
    const name = cd.slice(p + 46, p + 46 + nl).toString('utf8');
    // zip64 的額外欄位：依序只放 0xFFFFFFFF 的那幾個
    let q = p + 46 + nl;
    const qe = q + el;
    while (q + 4 <= qe) {
      const id = cd.readUInt16LE(q);
      const len = cd.readUInt16LE(q + 2);
      if (id === 1) {
        let o = q + 4;
        if (usize === U32) ((usize = r64(cd, o)), (o += 8));
        if (csize === U32) ((csize = r64(cd, o)), (o += 8));
        if (lo === U32) lo = r64(cd, o);
      }
      q += 4 + len;
    }
    p = qe + cl;
    if (name.endsWith('/')) continue;
    const ent = { name, size: usize };
    ent.read = async () => {
      const lh = rd(lo, 30);
      const data = rd(lo + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28), csize);
      if (method === 0) return data;
      if (method === 8) return zlib.inflateRawSync(data);
      throw new Error(`${name}：不支援的壓縮方式 ${method}`);
    };
    out.push(ent);
  }
  out.close = () => fs.closeSync(fd);
  return out;
}

module.exports = {
  writeZip,
  readZip,
  crc32,
  _lim: (v) => (LIM = v),
};
