// 角色產生器的伺服器端（server.js 載入）：docs/portrait-design.md
// - /api/comfy/…：轉送到本機的 ComfyUI（npm run comfy，預設 127.0.0.1:8188；環境變數 MECH_CORDON_COMFY 改網址），
//   /api/comfy/ws 是 WebSocket。區網的其他電腦也能用這台的顯示卡
// - /api/chars…：角色資料。定稿（card.json＋發佈的 WebP）在 CHARS_DIR/<id>/，候選與參考圖在 WORK_DIR/<id>/
//   開發模式（從專案執行、沒有用 MECH_CORDON_MODELS_DIR 指定別的資料夾）：定稿直接寫進 src/assets/characters/（commit 之後
//   別台電腦 pull 就有），候選與參考圖放 tools/charwork/（2026-11-12 使用者決定進 git，換電腦才不會破圖；
//   舊的 server-models/charwork/ 在啟動時搬過去）
'use strict';
const http = require('http'),
  fs = require('fs'),
  path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

module.exports = function chargen({ base, modelsDir, env, readBody, writeAtomic, log }) {
  const COMFY = new URL(env('COMFY') || 'http://127.0.0.1:8188');
  const DEV = !process.pkg && !env('MODELS_DIR');
  const CHARS_DIR = DEV ? path.join(base, 'src', 'assets', 'characters') : path.join(modelsDir, 'characters');
  const WORK_DIR = DEV ? path.join(base, 'tools', 'charwork') : path.join(modelsDir, 'charwork');
  // 開發模式：舊位置（server-models/charwork/）的候選圖搬進版本庫（已有同名檔案的不覆蓋）
  if (DEV) {
    const old = path.join(modelsDir, 'charwork');
    const move = (a, b) => {
      for (const f of fs.readdirSync(a, { withFileTypes: true })) {
        const pa = path.join(a, f.name),
          pb = path.join(b, f.name);
        if (f.isDirectory()) {
          fs.mkdirSync(pb, { recursive: true });
          move(pa, pb);
        } else if (!fs.existsSync(pb)) fs.renameSync(pa, pb);
      }
    };
    try {
      if (fs.existsSync(old) && !fs.existsSync(WORK_DIR + '/.moved')) {
        fs.mkdirSync(WORK_DIR, { recursive: true });
        move(old, WORK_DIR);
        fs.writeFileSync(path.join(WORK_DIR, '.moved'), '');
        log(`[charagen] 候選圖搬到 ${WORK_DIR}（舊的資料夾 ${old} 可以刪掉）`);
      }
    } catch (e) {
      log(`[charagen] 搬移候選圖失敗：${e.message}`);
    }
  }
  // 候選資料夾的圖一律存 WebP（2026-11-12 使用者定案：進 git 的檔案小一點）。開發模式才轉（sharp 是開發用的套件，exe 版沒有）
  let sharp = null;
  if (DEV)
    try {
      const req = require; // 不寫死字面的 require：打包 exe 時 pkg 不會去收 sharp 的原生檔
      sharp = req('sharp');
    } catch (e) {
      log('[charagen] 沒有 sharp（npm install），候選圖照原格式存');
    }
  const isPngJpg = (b) =>
    b.length > 4 && ((b[0] === 0x89 && b[1] === 0x50) || (b[0] === 0xff && b[1] === 0xd8));
  const toWebp = async (b) =>
    sharp && isPngJpg(b) ? sharp(b).webp({ quality: 92, alphaQuality: 100, effort: 5 }).toBuffer() : b;
  let converting = false;
  const ID_RE = /^[a-z][a-z0-9_]{0,31}$/;
  const FILE_RE = /^[a-z0-9_][a-z0-9_.-]{0,95}\.(webp|png|jpg|jpeg|json)$/i;
  const MAX_IMG = 24 * 1024 * 1024;
  const TYPES = {
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json; charset=utf-8',
  };

  // ---- ComfyUI 轉送 ----
  function proxy(req, resp, rest) {
    const opt = {
      host: COMFY.hostname,
      port: COMFY.port || 80,
      method: req.method,
      path: rest,
      headers: { ...req.headers, host: COMFY.host },
    };
    delete opt.headers.origin; // ComfyUI 會擋跨來源的請求；這裡是伺服器轉送
    delete opt.headers.referer;
    const p = http.request(opt, (r) => {
      resp.writeHead(r.statusCode, { ...r.headers, 'cache-control': 'no-store' });
      r.pipe(resp);
    });
    p.on('error', () => {
      if (!resp.headersSent) resp.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      resp.end(JSON.stringify({ error: 'ComfyUI 沒有在執行（npm run comfy）' }));
    });
    req.pipe(p);
  }
  const wssComfy = new WebSocketServer({ noServer: true });
  wssComfy.on('connection', (ws, req) => {
    const q = req.url.split('?')[1] || '';
    const up = new WebSocket(`ws://${COMFY.host}/ws${q ? '?' + q : ''}`);
    const pend = [];
    up.on('open', () => pend.splice(0).forEach((m) => up.send(m)));
    up.on('message', (d, bin) => ws.readyState === WebSocket.OPEN && ws.send(d, { binary: bin }));
    ws.on('message', (d, bin) =>
      up.readyState === WebSocket.OPEN ? up.send(d, { binary: bin }) : pend.push(d),
    );
    const close = () => {
      try {
        ws.close();
      } catch (e) {}
      try {
        up.close();
      } catch (e) {}
    };
    up.on('close', close);
    up.on('error', close);
    ws.on('close', close);
    ws.on('error', close);
  });

  // ---- 角色資料 ----
  const json = (resp, o, code = 200) => {
    resp.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    resp.end(JSON.stringify(o));
    return true;
  };
  const bad = (resp, msg, code = 400) => json(resp, { error: msg }, code);
  const cardPath = (id) => path.join(CHARS_DIR, id, 'card.json');
  function sendFile(req, resp, f) {
    if (!fs.existsSync(f) || !fs.statSync(f).isFile()) return bad(resp, '沒有這個檔案', 404);
    resp.writeHead(200, {
      'Content-Type': TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Content-Length': fs.statSync(f).size,
      'Cache-Control': 'no-cache',
    });
    if (req.method === 'HEAD') resp.end();
    else fs.createReadStream(f).pipe(resp);
    return true;
  }
  function listChars() {
    if (!fs.existsSync(CHARS_DIR)) return [];
    const out = [];
    for (const id of fs.readdirSync(CHARS_DIR)) {
      if (!ID_RE.test(id)) continue;
      try {
        const c = JSON.parse(fs.readFileSync(cardPath(id), 'utf8'));
        out.push({ id, name: c.name || id, status: c.status || '', t: c.t || 0, pub: !!c.pub });
      } catch (e) {}
    }
    return out;
  }
  // 一個資料夾裡的檔案：GET 讀、PUT 寫、DELETE 刪；name 空的時 GET 列出
  async function files(req, resp, dir, name) {
    if (!name) {
      if (req.method !== 'GET') return bad(resp, '不支援的操作', 405);
      const list = fs.existsSync(dir)
        ? fs
            .readdirSync(dir)
            .filter((f) => FILE_RE.test(f))
            .map((f) => ({
              name: f,
              size: fs.statSync(path.join(dir, f)).size,
              t: fs.statSync(path.join(dir, f)).mtimeMs,
            }))
        : [];
      return json(resp, list);
    }
    if (!FILE_RE.test(name)) return bad(resp, '檔名不正確');
    const f = path.join(dir, name);
    if (req.method === 'GET' || req.method === 'HEAD') return sendFile(req, resp, f);
    if (req.method === 'PUT') {
      let body = await readBody(req, MAX_IMG);
      if (!body) return bad(resp, '檔案太大', 413);
      if (dir.startsWith(WORK_DIR) && /\.webp$/i.test(name)) body = await toWebp(body);
      writeAtomic(f, body);
      return json(resp, { ok: true, size: body.length });
    }
    if (req.method === 'DELETE') {
      if (fs.existsSync(f)) fs.rmSync(f);
      return json(resp, { ok: true });
    }
    return bad(resp, '不支援的操作', 405);
  }

  // 過場的場景插畫（docs/cine-redesign-design.md 第 2 期；角色產生器的「場景插畫」分頁，和 scripts/cine-art.js 同一份資料）：
  // 只在開發模式（定義 tools/cine-art/scenes.json、候選在 ComfyUI 的工作資料夾、選定的寫進 src/assets/cine-art/）
  const ART_DEF = path.join(base, 'tools', 'cine-art', 'scenes.json');
  const ART_WORK = path.join(base, 'tools', 'comfyui', 'runtime', 'work', 'cine-art');
  const ART_OUT = path.join(base, 'src', 'assets', 'cine-art');
  async function artApi(req, resp, u) {
    if (!DEV) return bad(resp, '場景插畫只在開發模式（從專案執行 server.js）', 404);
    let m;
    const scenes = () => JSON.parse(fs.readFileSync(ART_DEF, 'utf8'));
    if (u === '/api/cineart') {
      if (req.method === 'GET') {
        const S = fs.existsSync(ART_DEF) ? scenes() : {};
        const cands = {};
        for (const id of Object.keys(S)) {
          const d = path.join(ART_WORK, id);
          cands[id] = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /^\d+\.png$/.test(f)) : [];
        }
        return json(resp, { scenes: S, cands });
      }
      if (req.method === 'PUT') {
        const body = await readBody(req, 1024 * 1024);
        let d;
        try {
          d = JSON.parse(body.toString('utf8'));
        } catch (e) {
          return bad(resp, '不是 JSON');
        }
        writeAtomic(ART_DEF, JSON.stringify(d, null, 2) + '\n');
        return json(resp, { ok: true });
      }
      return bad(resp, '不支援的操作', 405);
    }
    if ((m = /^\/api\/cineart\/(work|out)\/([a-z0-9_]+)\/(.*)$/.exec(u))) {
      const dir = path.join(m[1] === 'work' ? ART_WORK : ART_OUT, m[2]);
      if (m[1] === 'out' && req.method !== 'GET') return bad(resp, '不支援的操作', 405);
      return files(req, resp, dir, decodeURIComponent(m[3]));
    }
    // 選定：候選 → src/assets/cine-art/c<章>/<id>.webp（寬最多 1600；tone＝單色）
    if ((m = /^\/api\/cineart\/pick\/([a-z0-9_]+)\/(\d+)$/.exec(u)) && req.method === 'POST') {
      if (!sharp) return bad(resp, '沒有 sharp（npm install）');
      const all = scenes();
      const S = all[m[1]];
      const src = path.join(ART_WORK, m[1], m[2] + '.png');
      if (!S || !fs.existsSync(src)) return bad(resp, '沒有這個候選', 404);
      let p = sharp(fs.readFileSync(src)).resize({ width: 1600, withoutEnlargement: true });
      if (S.tone) p = p.grayscale().tint(S.tone);
      const d = path.join(ART_OUT, 'c' + S.ch);
      fs.mkdirSync(d, { recursive: true });
      writeAtomic(path.join(d, m[1] + '.webp'), await p.webp({ quality: 84 }).toBuffer());
      S.pick = Number(m[2]);
      writeAtomic(ART_DEF, JSON.stringify(all, null, 2) + '\n');
      return json(resp, { ok: true });
    }
    return bad(resp, '不認得的場景插畫 API', 404);
  }

  async function api(req, resp, u) {
    let m;
    if (converting) return bad(resp, '候選圖正在轉成 WebP，請稍等（看伺服器的訊息）', 503);
    if (u === '/api/chars') {
      if (req.method !== 'GET') return bad(resp, '不支援的操作', 405);
      return json(resp, { dev: DEV, chars: listChars() });
    }
    if ((m = /^\/api\/chars\/([^/]+)(?:\/(file|work)(?:\/(.*))?)?$/.exec(u))) {
      const id = m[1];
      if (!ID_RE.test(id)) return bad(resp, '角色 id 不正確');
      if (!m[2]) {
        if (req.method === 'GET') return sendFile(req, resp, cardPath(id));
        if (req.method === 'PUT') {
          const body = await readBody(req, 1024 * 1024);
          if (!body) return bad(resp, '太大', 413);
          let c;
          try {
            c = JSON.parse(body.toString('utf8'));
          } catch (e) {
            return bad(resp, '不是 JSON');
          }
          c.id = id;
          c.t = Date.now();
          writeAtomic(cardPath(id), JSON.stringify(c, null, 2) + '\n');
          return json(resp, { ok: true, t: c.t });
        }
        return bad(resp, '不支援的操作', 405);
      }
      let name = '';
      try {
        name = decodeURIComponent(m[3] || '');
      } catch (e) {
        return bad(resp, '檔名不正確');
      }
      const dir = m[2] === 'file' ? path.join(CHARS_DIR, id) : path.join(WORK_DIR, id);
      if (m[2] === 'file' && name === 'card.json') return bad(resp, 'card.json 用 /api/chars/<id>');
      return files(req, resp, dir, name);
    }
    return false;
  }

  // 候選資料夾裡舊的 PNG／JPG 轉成 WebP，角色卡（card.json）裡的檔名一起改
  async function convertOld() {
    if (!sharp || !fs.existsSync(WORK_DIR)) return;
    const ids = fs
      .readdirSync(WORK_DIR)
      .filter((d) => ID_RE.test(d) && fs.statSync(path.join(WORK_DIR, d)).isDirectory());
    const todo = ids.filter((id) =>
      fs.readdirSync(path.join(WORK_DIR, id)).some((f) => /\.(png|jpe?g)$/i.test(f)),
    );
    if (!todo.length) return;
    converting = true;
    try {
      for (const id of todo) {
        const dir = path.join(WORK_DIR, id);
        const map = new Map();
        const list = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f));
        log(`[charagen] ${id}：${list.length} 張候選圖轉成 WebP…`);
        let before = 0,
          after = 0;
        for (const f of list) {
          const nf = f.replace(/\.(png|jpe?g)$/i, '.webp');
          if (fs.existsSync(path.join(dir, nf))) continue; // 同名的 WebP 已經有了：不動，原檔留著
          try {
            const b = fs.readFileSync(path.join(dir, f));
            const w = await toWebp(b);
            if (w === b) continue;
            writeAtomic(path.join(dir, nf), w);
            fs.rmSync(path.join(dir, f));
            map.set(f, nf);
            before += b.length;
            after += w.length;
          } catch (e) {
            log(`[charagen] ${id}/${f} 轉檔失敗：${e.message}`);
          }
        }
        // 角色卡：字串值剛好是改過的檔名才換
        const cp = cardPath(id);
        if (map.size && fs.existsSync(cp)) {
          const fix = (v) =>
            typeof v === 'string'
              ? map.get(v) || v
              : Array.isArray(v)
                ? v.map(fix)
                : v && typeof v === 'object'
                  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)]))
                  : v;
          const txt = fs.readFileSync(cp, 'utf8');
          writeAtomic(cp, JSON.stringify(fix(JSON.parse(txt)), null, 2) + '\n');
        }
        log(
          `[charagen] ${id}：轉了 ${map.size} 張（${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB）`,
        );
      }
    } finally {
      converting = false;
    }
  }
  if (DEV) convertOld().catch((e) => log('[charagen] 轉成 WebP 失敗：' + e.message));

  log(`[charagen] 角色資料：${CHARS_DIR}；候選：${WORK_DIR}；ComfyUI：${COMFY.href}`);
  return {
    // 處理了回傳 true（或 Promise）
    handle(req, resp, u) {
      // ComfyUI 有沒有在執行：一律回 200（網頁不會因為 ComfyUI 沒開而在主控台留下錯誤）
      if (u === '/api/comfy-status') {
        const done = (ok) => {
          if (!resp.headersSent) json(resp, { ok, url: COMFY.href });
        };
        const r = http.get(
          { host: COMFY.hostname, port: COMFY.port || 80, path: '/system_stats', timeout: 2000 },
          (x) => {
            x.resume();
            done(x.statusCode === 200);
          },
        );
        r.on('timeout', () => r.destroy());
        r.on('error', () => done(false));
        return true;
      }
      if (u.startsWith('/api/comfy/') || u === '/api/comfy') {
        proxy(req, resp, req.url.slice('/api/comfy'.length) || '/');
        return true;
      }
      if (u === '/api/cineart' || u.startsWith('/api/cineart/')) {
        artApi(req, resp, u).catch((e) => {
          log('場景插畫 API 錯誤：' + e.message);
          if (!resp.headersSent) resp.writeHead(500, { 'Content-Type': 'application/json' });
          resp.end(JSON.stringify({ error: e.message }));
        });
        return true;
      }
      if (u === '/api/chars' || u.startsWith('/api/chars/')) {
        api(req, resp, u).catch((e) => {
          log('角色產生器 API 錯誤：' + e.message);
          if (!resp.headersSent) resp.writeHead(500, { 'Content-Type': 'application/json' });
          resp.end(JSON.stringify({ error: e.message }));
        });
        return true;
      }
      return false;
    },
    upgrade(req, sock, head) {
      if (req.url.split('?')[0] !== '/api/comfy/ws') return false;
      wssComfy.handleUpgrade(req, sock, head, (ws) => wssComfy.emit('connection', ws, req));
      return true;
    },
  };
};
