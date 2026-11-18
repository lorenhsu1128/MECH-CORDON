// 立繪工房的伺服器端（server.js 載入）：docs/portrait-studio-design.md、docs/portrait-design.md
// - /api/studio/…：專案（遊戲本身＝mech_cordon，其他在 STUDIO_DIR）、角色、專案的參考圖、zip 的下載與匯入
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
const { writeZip, readZip } = require('./server-studio-zip.js');

module.exports = function chargen({ base, modelsDir, env, readBody, writeAtomic, log }) {
  const COMFY = new URL(env('COMFY') || 'http://127.0.0.1:8188');
  const DEV = !process.pkg && !env('MODELS_DIR');
  const CHARS_DIR = DEV ? path.join(base, 'src', 'assets', 'characters') : path.join(modelsDir, 'characters');
  const WORK_DIR = DEV ? path.join(base, 'tools', 'charwork') : path.join(modelsDir, 'charwork');
  // 立繪工房的其他專案（docs/portrait-studio-design.md）：開發模式＝studio-data/（gitignore），exe 版＝server-models/studio/
  const STUDIO_DIR = env('STUDIO_DIR')
    ? path.resolve(env('STUDIO_DIR'))
    : DEV
      ? path.join(base, 'studio-data')
      : path.join(modelsDir, 'studio');
  const TMP_DIR = path.join(STUDIO_DIR, '.tmp');
  const LINKED = 'mech_cordon';
  const LINKED_P = {
    id: LINKED,
    linked: true,
    chars: CHARS_DIR,
    work: WORK_DIR,
    conf: path.join(STUDIO_DIR, LINKED, 'project.json'),
  };
  const MAX_ZIP = 16 * 1024 * 1024 * 1024; // 匯入的 zip 上限 16 GB（先存成暫存檔，不放記憶體）
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
  function listChars(P = LINKED_P) {
    if (!fs.existsSync(P.chars)) return [];
    const out = [];
    for (const id of fs.readdirSync(P.chars)) {
      if (!ID_RE.test(id)) continue;
      try {
        const c = JSON.parse(fs.readFileSync(path.join(P.chars, id, 'card.json'), 'utf8'));
        out.push({
          id,
          name: c.name || id,
          status: c.status || '',
          t: c.t || 0,
          pub: !!c.pub,
          info: c.info || null,
        });
      } catch (e) {}
    }
    return out;
  }
  // 一個資料夾裡的檔案：GET 讀、PUT 寫、DELETE 刪；name 空的時 GET 列出
  async function files(req, resp, dir, name, work = dir.startsWith(WORK_DIR)) {
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
      if (work && /\.webp$/i.test(name)) body = await toWebp(body);
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

  // ---- 專案（docs/portrait-studio-design.md）----
  // mech_cordon＝遊戲本身（定稿 CHARS_DIR、候選 WORK_DIR）；其他專案在 STUDIO_DIR/<專案>/（project.json、chars/、work/）
  // 專案自己的參考圖在 work/_project/
  function projOf(pid) {
    if (pid === LINKED) return LINKED_P;
    if (!ID_RE.test(pid)) return null;
    const dir = path.join(STUDIO_DIR, pid);
    if (!fs.existsSync(path.join(dir, 'project.json'))) return null;
    return {
      id: pid,
      dir,
      chars: path.join(dir, 'chars'),
      work: path.join(dir, 'work'),
      conf: path.join(dir, 'project.json'),
    };
  }
  function projConf(P) {
    let c = {};
    try {
      c = JSON.parse(fs.readFileSync(P.conf, 'utf8'));
    } catch (e) {
      /* 遊戲的專案沒有設定檔：用預設 */
    }
    return { ...c, id: P.id, linked: !!P.linked, name: c.name || (P.linked ? 'MECH CORDON（遊戲）' : P.id) };
  }
  function listProjects() {
    const out = [{ ...projConf(LINKED_P), chars: listChars(LINKED_P).length }];
    if (fs.existsSync(STUDIO_DIR))
      for (const d of fs.readdirSync(STUDIO_DIR)) {
        if (d === LINKED) continue;
        const P = projOf(d);
        if (P) out.push({ ...projConf(P), chars: listChars(P).length });
      }
    return out;
  }
  const readJson = async (req, resp, max = 1024 * 1024) => {
    const body = await readBody(req, max);
    if (!body) return bad(resp, '太大', 413) && null;
    try {
      return JSON.parse(body.toString('utf8'));
    } catch (e) {
      bad(resp, '不是 JSON');
      return null;
    }
  };
  // 下載用的檔名：中文用 RFC 5987
  const attach = (name) =>
    `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  const dirFiles = (dir) =>
    fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => FILE_RE.test(f) && fs.statSync(path.join(dir, f)).isFile())
      : [];
  // 一個角色放進 zip 的項目：what＝all（角色卡＋候選＋發佈）／out（成品：portrait.json＋發佈的 WebP）
  function charEntries(P, id, what, pre) {
    const cdir = path.join(P.chars, id);
    const out = [];
    if (what === 'out') {
      let c = null;
      try {
        c = JSON.parse(fs.readFileSync(path.join(cdir, 'card.json'), 'utf8'));
      } catch (e) {
        return out;
      }
      if (!c.pub) return out;
      const pj = { v: 1, id, name: c.name || id, pub: c.pub };
      out.push({ name: `${pre}${id}/portrait.json`, data: Buffer.from(JSON.stringify(pj, null, 1) + '\n') });
      for (const f of dirFiles(cdir))
        if (/\.webp$/i.test(f)) out.push({ name: `${pre}${id}/${f}`, file: path.join(cdir, f) });
      return out;
    }
    for (const f of dirFiles(cdir))
      out.push({
        name: f === 'card.json' ? `${pre}${id}/card.json` : `${pre}${id}/out/${f}`,
        file: path.join(cdir, f),
      });
    const wdir = path.join(P.work, id);
    for (const f of dirFiles(wdir)) out.push({ name: `${pre}${id}/work/${f}`, file: path.join(wdir, f) });
    return out;
  }
  async function zipDownload(req, resp, P, q) {
    const what = q.get('what') === 'out' ? 'out' : 'all';
    const id = q.get('char');
    let entries = [];
    let fname;
    if (id) {
      if (!ID_RE.test(id) || !fs.existsSync(path.join(P.chars, id, 'card.json')))
        return bad(resp, '沒有這個角色', 404);
      entries = charEntries(P, id, what, '');
      fname = `${P.id}_${id}_${what === 'out' ? '成品' : '工作資料'}.zip`;
    } else {
      if (what === 'all') {
        entries.push({
          name: 'project.json',
          data: Buffer.from(JSON.stringify(projConf(P), null, 2) + '\n'),
        });
        const rd = path.join(P.work, '_project');
        for (const f of dirFiles(rd)) entries.push({ name: `refs/${f}`, file: path.join(rd, f) });
        // 給 Claude Code 的操作手冊（專案內建的技能）：別台電腦拿到 zip 也知道怎麼繼續（匯入時略過它）
        const sk = path.join(base, '.claude', 'skills', 'portrait-studio', 'SKILL.md');
        if (fs.existsSync(sk)) entries.push({ name: 'CLAUDE-CODE.md', file: sk });
      }
      for (const c of listChars(P)) entries.push(...charEntries(P, c.id, what, 'chars/'));
      fname = `${P.id}_${what === 'out' ? '成品' : '工作資料'}.zip`;
    }
    if (!entries.length) return bad(resp, what === 'out' ? '還沒有發佈過' : '沒有資料', 404);
    resp.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Disposition': attach(fname),
      'Cache-Control': 'no-store',
    });
    await writeZip(resp, entries);
    resp.end();
    return true;
  }
  // 匯入 zip：專案的（project.json、refs/、chars/<角色>/…）或一個角色的（<角色>/card.json、out/、work/）
  // 同名的檔案覆蓋。專案還沒有時建立（遊戲的專案只能匯入角色）
  async function zipImport(req, resp, pid) {
    if (!ID_RE.test(pid)) return bad(resp, '專案 id 不正確（英文小寫開頭，英數與底線）');
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const tmp = path.join(TMP_DIR, `import_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.zip`);
    const ok = await new Promise((res) => {
      let n = 0;
      const ws = fs.createWriteStream(tmp);
      req.on('data', (c) => {
        n += c.length;
        if (n > MAX_ZIP) {
          req.destroy();
          ws.destroy();
          res(false);
        }
      });
      req.pipe(ws);
      ws.on('finish', () => res(true));
      ws.on('error', () => res(false));
    });
    if (!ok) {
      fs.rmSync(tmp, { force: true });
      return bad(resp, '上傳失敗或檔案太大', 413);
    }
    let Z;
    try {
      Z = readZip(tmp);
    } catch (e) {
      fs.rmSync(tmp, { force: true });
      return bad(resp, e.message);
    }
    try {
      const isProj = Z.some((e) => e.name === 'project.json');
      let P = projOf(pid);
      if (!P) {
        const dir = path.join(STUDIO_DIR, pid);
        fs.mkdirSync(dir, { recursive: true });
        let conf = { v: 1, id: pid, name: pid };
        const pj = Z.find((e) => e.name === 'project.json');
        if (pj)
          try {
            conf = { ...JSON.parse((await pj.read()).toString('utf8')), id: pid };
          } catch (e) {
            /* 壞掉的 project.json：用預設 */
          }
        writeAtomic(path.join(dir, 'project.json'), JSON.stringify(conf, null, 2) + '\n');
        P = projOf(pid);
      }
      const chars = new Set();
      let n = 0,
        skip = 0;
      for (const e of Z) {
        const parts = e.name.split('/');
        if (isProj && parts[0] === 'chars') parts.shift();
        let dest = null;
        let cid = null;
        if (e.name === 'CLAUDE-CODE.md') continue; // 操作手冊：不用匯入
        if (isProj && e.name === 'project.json') {
          if (!P.linked) {
            let c = {};
            try {
              c = JSON.parse((await e.read()).toString('utf8'));
            } catch (er) {
              skip++;
              continue;
            }
            writeAtomic(P.conf, JSON.stringify({ ...c, id: P.id }, null, 2) + '\n');
            n++;
          }
          continue;
        }
        if (isProj && parts[0] === 'refs' && parts.length === 2 && FILE_RE.test(parts[1]))
          dest = path.join(P.work, '_project', parts[1]);
        else if (ID_RE.test(parts[0])) {
          cid = parts[0];
          if (parts.length === 2 && parts[1] === 'card.json') dest = path.join(P.chars, cid, 'card.json');
          else if (
            parts.length === 3 &&
            parts[1] === 'out' &&
            FILE_RE.test(parts[2]) &&
            parts[2] !== 'card.json'
          )
            dest = path.join(P.chars, cid, parts[2]);
          else if (parts.length === 3 && parts[1] === 'work' && FILE_RE.test(parts[2]))
            dest = path.join(P.work, cid, parts[2]);
        }
        if (!dest) {
          skip++;
          continue;
        }
        let data = await e.read();
        if (dest.endsWith('card.json')) {
          try {
            const c = JSON.parse(data.toString('utf8'));
            c.id = cid;
            data = Buffer.from(JSON.stringify(c, null, 2) + '\n');
          } catch (er) {
            skip++;
            continue;
          }
        }
        writeAtomic(dest, data);
        if (cid) chars.add(cid);
        n++;
      }
      return json(resp, { ok: true, project: P.id, chars: [...chars], files: n, skipped: skip });
    } finally {
      Z.close();
      fs.rmSync(tmp, { force: true });
    }
  }
  // 自動完成（docs/portrait-studio-design.md 第 4 期）：伺服器另外開一個程序跑 scripts/studio.js char <角色> auto，
  // 關掉網頁也會繼續；網頁每幾秒問一次進度。POST＝開始（body：{ pose, n }）、GET＝狀態與最近的輸出、DELETE＝停止。
  // 只在開發模式（要有專案的 scripts/；exe 版沒有）
  const AUTO = new Map(); // '<專案>/<角色>' → { proc, lines, pct, text, start, end, code }
  const STUDIO_JS = path.join(base, 'scripts', 'studio.js');
  async function autoApi(req, resp, P, id) {
    const k = P.id + '/' + id;
    const J = AUTO.get(k);
    const view = (j) =>
      j
        ? {
            running: !j.end,
            pct: j.pct,
            text: j.text,
            start: j.start,
            end: j.end,
            code: j.code,
            lines: j.lines.slice(-60),
          }
        : { running: false };
    if (req.method === 'GET') return json(resp, view(J));
    if (req.method === 'DELETE') {
      if (J && !J.end) {
        J.text = '停止中…';
        try {
          J.proc.kill();
        } catch (e) {
          /* 已經結束 */
        }
        // ComfyUI 那邊正在跑的工作也停掉
        http
          .request({ host: COMFY.hostname, port: COMFY.port || 80, path: '/interrupt', method: 'POST' })
          .on('error', () => {})
          .end();
      }
      return json(resp, view(J));
    }
    if (req.method !== 'POST') return bad(resp, '不支援的操作', 405);
    if (!fs.existsSync(STUDIO_JS)) return bad(resp, '自動完成只在開發模式（從專案執行 server.js）', 404);
    if (J && !J.end) return bad(resp, '這個角色已經在自動完成', 409);
    if ([...AUTO.values()].some((j) => !j.end))
      return bad(resp, '已經有別的角色在自動完成（顯示卡一次只跑一個）', 409);
    if (!fs.existsSync(path.join(P.chars, id, 'card.json'))) return bad(resp, '沒有這個角色', 404);
    const b = (await readJson(req, resp)) || {};
    const args = [
      STUDIO_JS,
      'char',
      id,
      'auto',
      `--project=${P.id}`,
      `--server=http://127.0.0.1:${req.socket.localPort}`,
      `--comfy=${COMFY.href.replace(/\/$/, '')}`,
    ];
    if (b.pose && ID_RE.test(String(b.pose))) args.push(`--pose=${b.pose}`);
    if (b.n) args.push(`--n=${Math.max(1, Math.min(6, +b.n || 3))}`);
    const { spawn } = require('child_process');
    const proc = spawn(process.execPath, args, { cwd: base, windowsHide: true });
    const j = { proc, lines: [], pct: 0, text: '開始', start: Date.now(), end: 0, code: null };
    AUTO.set(k, j);
    let rest = '';
    const eat = (d) => {
      const all = (rest + d.toString('utf8')).split(/\r?\n/);
      rest = all.pop();
      for (const l of all) {
        const p = /^PROGRESS ([\d.]+)% (.*)$/.exec(l);
        if (p) {
          j.pct = +p[1];
          j.text = p[2];
          continue;
        }
        j.lines.push(l);
        if (j.lines.length > 400) j.lines.splice(0, j.lines.length - 400);
      }
    };
    proc.stdout.on('data', eat);
    proc.stderr.on('data', eat);
    proc.on('close', (code) => {
      if (rest) j.lines.push(rest);
      j.end = Date.now();
      j.code = code;
      j.text = code === 0 ? '完成' : j.text === '停止中…' ? '已停止' : '失敗（看最後幾行）';
      log(`[studio] 自動完成 ${k}：${j.text}`);
    });
    log(`[studio] 自動完成 ${k} 開始`);
    return json(resp, view(j));
  }

  // 一個專案裡的角色：rest＝''（清單）、'/<角色>'（角色卡）、'/<角色>/(file|work)[/<檔名>]'
  async function charApi(req, resp, P, rest) {
    let m;
    if (!rest) {
      if (req.method !== 'GET') return bad(resp, '不支援的操作', 405);
      return json(resp, { dev: DEV, project: P.id, chars: listChars(P) });
    }
    if ((m = /^\/([^/]+)\/auto$/.exec(rest)) && ID_RE.test(m[1])) return autoApi(req, resp, P, m[1]);
    if (!(m = /^\/([^/]+)(?:\/(file|work)(?:\/(.*))?)?$/.exec(rest)))
      return bad(resp, '不認得的角色 API', 404);
    const id = m[1];
    if (!ID_RE.test(id)) return bad(resp, '角色 id 不正確（英文小寫開頭，英數與底線）');
    const cp = path.join(P.chars, id, 'card.json');
    if (!m[2]) {
      if (req.method === 'GET') return sendFile(req, resp, cp);
      if (req.method === 'PUT') {
        const c = await readJson(req, resp);
        if (!c) return true;
        c.id = id;
        c.t = Date.now();
        writeAtomic(cp, JSON.stringify(c, null, 2) + '\n');
        return json(resp, { ok: true, t: c.t });
      }
      // 刪除角色（角色卡、發佈、候選全部）；遊戲的角色不能從這裡刪
      if (req.method === 'DELETE') {
        if (P.linked) return bad(resp, '遊戲的角色不能從立繪工房刪除', 403);
        fs.rmSync(path.join(P.chars, id), { recursive: true, force: true });
        fs.rmSync(path.join(P.work, id), { recursive: true, force: true });
        return json(resp, { ok: true });
      }
      return bad(resp, '不支援的操作', 405);
    }
    let name = '';
    try {
      name = decodeURIComponent(m[3] || '');
    } catch (e) {
      return bad(resp, '檔名不正確');
    }
    const dir = path.join(m[2] === 'file' ? P.chars : P.work, id);
    if (m[2] === 'file' && name === 'card.json') return bad(resp, 'card.json 用角色的網址');
    return files(req, resp, dir, name, m[2] === 'work');
  }

  async function api(req, resp, u) {
    let m;
    if (converting) return bad(resp, '候選圖正在轉成 WebP，請稍等（看伺服器的訊息）', 503);
    // 舊的網址＝遊戲的專案
    if (u === '/api/chars' || u.startsWith('/api/chars/')) return charApi(req, resp, LINKED_P, u.slice(10));
    if (u === '/api/studio/projects') {
      if (req.method === 'GET') return json(resp, { dev: DEV, dir: STUDIO_DIR, projects: listProjects() });
      if (req.method === 'POST') {
        const b = await readJson(req, resp);
        if (!b) return true;
        const id = String(b.id || '');
        if (!ID_RE.test(id)) return bad(resp, '專案 id 不正確（英文小寫開頭，英數與底線，最多 32 字）');
        if (id === LINKED || projOf(id)) return bad(resp, '已經有這個專案', 409);
        const conf = {
          v: 1,
          id,
          name: String(b.name || id).slice(0, 60),
          note: String(b.note || '').slice(0, 500),
          t: Date.now(),
        };
        fs.mkdirSync(path.join(STUDIO_DIR, id), { recursive: true });
        writeAtomic(path.join(STUDIO_DIR, id, 'project.json'), JSON.stringify(conf, null, 2) + '\n');
        return json(resp, { ok: true, project: conf });
      }
      return bad(resp, '不支援的操作', 405);
    }
    if ((m = /^\/api\/studio\/import\/([^/]+)$/.exec(u)) && req.method === 'POST')
      return zipImport(req, resp, m[1]);
    if (!(m = /^\/api\/studio\/p\/([^/]+)(\/.*)?$/.exec(u))) return bad(resp, '不認得的立繪工房 API', 404);
    const P = projOf(m[1]);
    if (!P) return bad(resp, '沒有這個專案', 404);
    const rest = m[2] || '';
    if (!rest) {
      if (req.method === 'GET') return json(resp, projConf(P));
      if (req.method === 'PUT') {
        const c = await readJson(req, resp);
        if (!c) return true;
        delete c.linked;
        const conf = { ...c, id: P.id, t: Date.now() };
        writeAtomic(P.conf, JSON.stringify(conf, null, 2) + '\n');
        return json(resp, { ok: true, t: conf.t });
      }
      if (req.method === 'DELETE') {
        if (P.linked) return bad(resp, '遊戲的專案不能刪除', 403);
        if (new URL(req.url, 'http://x').searchParams.get('confirm') !== P.id)
          return bad(resp, '要帶 ?confirm=<專案 id>');
        fs.rmSync(P.dir, { recursive: true, force: true });
        return json(resp, { ok: true });
      }
      return bad(resp, '不支援的操作', 405);
    }
    if (rest === '/zip') {
      if (req.method !== 'GET') return bad(resp, '不支援的操作', 405);
      return zipDownload(req, resp, P, new URL(req.url, 'http://x').searchParams);
    }
    if (rest === '/refs' || rest.startsWith('/refs/')) {
      let name = '';
      try {
        name = decodeURIComponent(rest.slice(6));
      } catch (e) {
        return bad(resp, '檔名不正確');
      }
      return files(req, resp, path.join(P.work, '_project'), name, true);
    }
    if (rest === '/chars' || rest.startsWith('/chars/')) return charApi(req, resp, P, rest.slice(6));
    return bad(resp, '不認得的立繪工房 API', 404);
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

  log(
    `[studio] 遊戲的角色：${CHARS_DIR}；候選：${WORK_DIR}；其他專案：${STUDIO_DIR}；ComfyUI：${COMFY.href}`,
  );
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
      if (u === '/api/chars' || u.startsWith('/api/chars/') || u.startsWith('/api/studio/')) {
        api(req, resp, u).catch((e) => {
          log('立繪工房 API 錯誤：' + e.message);
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
