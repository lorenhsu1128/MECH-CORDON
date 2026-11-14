// 配樂產生器的伺服器端（server.js 載入；docs/audio-design.md 的「AI 配樂」與「配樂產生器」）：
// 標題「工具與其他」的「配樂產生器」（game/bgm-gen-ui.js）用它編輯歌曲設定、在這台的顯示卡上產生配樂、試聽候選、改挑選。
// 只在開發模式（從專案執行 server.js、沒有用 MECH_CORDON_MODELS_DIR 指定別的資料夾）提供：要用專案裡的
// scripts/bgm-*.js／*.py 與 npm run bgm:setup 裝在 tools/acestep/ 的環境；其他情況回 { dev: false }。
// - GET  /api/bgm/state?ch=<章>：安裝狀態、顯示卡、工作的狀態與記錄、各章的歌曲設定與產生結果（候選、分數、挑選、輕快版、打包）
// - PUT  /api/bgm/song { ch, type, song }、PUT /api/bgm/common { common }：改 scripts/bgm_songs/ 的 JSON
// - POST /api/bgm/run { mode, ch, from, to, songs, n }：mode＝all／fight／score／calm／pack／build／setup／sync，同時只跑一個
//   （sync＝把 git 裡的 tools/bgm-work/ 解回 tools/acestep/out/；啟動時也自動做一次）
// - POST /api/bgm/stop：結束目前的工作（整個程序樹）
// - POST /api/bgm/pick { ch, type, name }：手動改挑選（picks.json）；POST /api/bgm/drop { ch, name }：刪掉一個候選（留下 .dropped，之後「只產生這首」補一個新的種子）
// - GET  /api/bgm/audio?ch=<章>&name=<候選>：試聽用的 mp3（tools/acestep/preview/，scripts/bgm-preview.py 轉的）
'use strict';
const fs = require('fs'),
  path = require('path'),
  { spawn, spawnSync } = require('child_process');

const TYPES = [
  'theme',
  'battle',
  'front',
  'elite',
  'destroy',
  'colossus',
  'defend',
  'escort',
  'extract',
].concat(['breakthrough', 'chase', 'intel', 'supply', 'boss', 'air']);

module.exports = function bgmgen({ base, env, readBody, writeAtomic, log }) {
  const DEV = !process.pkg && !env('MODELS_DIR');
  const SONGS = path.join(base, 'scripts', 'bgm_songs');
  const ACE = path.join(base, 'tools', 'acestep');
  const OUT = path.join(ACE, 'out');
  const PRE = path.join(ACE, 'preview');
  const LOG = path.join(ACE, 'job.log');
  const WIN = process.platform === 'win32';
  const SPY = path.join(ACE, 'score-venv', WIN ? 'Scripts/python.exe' : 'bin/python');
  let job = null; // { proc, mode, args, start, end, code }
  let gpuAt = 0,
    gpu = null;

  const json = (resp, o, code = 200) => {
    resp.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    resp.end(JSON.stringify(o));
  };
  const readJson = (f, d = null) => {
    try {
      return JSON.parse(fs.readFileSync(f, 'utf8'));
    } catch (e) {
      return d;
    }
  };
  const chOk = (ch) => Number.isInteger(ch) && fs.existsSync(path.join(SONGS, `c${ch}.json`));
  const nameOk = (n) => typeof n === 'string' && /^[a-z]+__(f\d+|calm)$/.test(n);
  const body = async (req) => {
    const b = await readBody(req, 1 << 20);
    try {
      return b ? JSON.parse(b.toString('utf8')) : null;
    } catch (e) {
      return null;
    }
  };

  function gpuInfo() {
    if (Date.now() - gpuAt < 5000) return gpu;
    gpuAt = Date.now();
    try {
      const r = spawnSync(
        'nvidia-smi',
        ['--query-gpu=name,memory.used,memory.total,utilization.gpu', '--format=csv,noheader,nounits'],
        { encoding: 'utf8', timeout: 3000 },
      );
      const [name, used, total, util] = (r.stdout || '').trim().split('\n')[0].split(', ');
      gpu = name ? { name, used: +used, total: +total, util: +util } : null;
    } catch (e) {
      gpu = null;
    }
    return gpu;
  }

  function logTail(n = 80) {
    try {
      const s = fs.readFileSync(LOG, 'utf8');
      // 進度條（\r）只留最後一段，ANSI 顏色拿掉
      return s
        .replace(new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g'), '')
        .split('\n')
        .map((l) => l.split('\r').pop())
        .filter((l) => l.trim() && !/^\s*\d+%\|/.test(l))
        .slice(-n);
    } catch (e) {
      return [];
    }
  }

  // 一章的產生結果：每種類型的候選（分數、歌詞吻合度、挑選）、輕快版、打包
  function chapterOut(ch) {
    const dir = path.join(OUT, `c${ch}`);
    const scores = readJson(path.join(dir, 'scores.json'), {});
    const picks = readJson(path.join(dir, 'picks.json'), {});
    const out = {};
    let files = [];
    try {
      files = fs.readdirSync(dir);
    } catch (e) {}
    for (const f of files) {
      const m = f.match(/^([a-z]+)__(f\d+|calm)\.wav$/);
      if (!m) continue;
      const name = f.slice(0, -4);
      const o = (out[m[1]] = out[m[1]] || { cands: [], calm: false });
      if (m[2] === 'calm') o.calm = true;
      else {
        const s = scores[name] || {};
        o.cands.push({
          name,
          score: s.total ?? null,
          lyric: s.lyric ?? null,
          aes: s.aes || null,
          pitch: s.pitch ?? null,
          picked: picks[m[1]] === name,
          audio: fs.existsSync(path.join(PRE, `c${ch}`, name + '.mp3')),
        });
      }
    }
    for (const o of Object.values(out)) o.cands.sort((a, b) => (a.name < b.name ? -1 : 1));
    return {
      out,
      packed: readJson(path.join(base, 'src', 'assets', 'bgm-ai', `c${ch}`, 'index.json'), null),
    };
  }

  function startJob(mode, a) {
    const node = process.execPath;
    const run = (args) => [node, [path.join(base, 'scripts', 'bgm-gen-run.js'), ...args]];
    let cmd;
    if (mode === 'all') cmd = run(['--all', `--from=${a.from}`, `--to=${a.to}`, `--n=${a.n}`]);
    else if (mode === 'fight' || mode === 'calm')
      cmd = run([
        `--ch=${a.ch}`,
        `--stage=${mode}`,
        `--n=${a.n}`,
        ...(a.songs ? [`--songs=${a.songs}`] : []),
      ]);
    else if (mode === 'score') cmd = run(['--score', `--ch=${a.ch}`]);
    else if (mode === 'pack') cmd = run(['--pack', `--ch=${a.ch}`]);
    else if (mode === 'sync') cmd = run(['--sync', 'import']);
    else if (mode === 'build') cmd = [node, [path.join(base, 'scripts', 'build.js')]];
    else if (mode === 'setup') cmd = [node, [path.join(base, 'scripts', 'bgm-setup.js')]];
    else return null;
    fs.mkdirSync(ACE, { recursive: true });
    const fd = fs.openSync(LOG, 'w');
    fs.writeSync(fd, `> ${mode} ${JSON.stringify(a)}  ${new Date().toLocaleString()}\n`);
    const proc = spawn(cmd[0], cmd[1], {
      cwd: base,
      stdio: ['ignore', fd, fd],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', FORCE_COLOR: '0' },
      windowsHide: true,
    });
    const j = { proc, mode, args: a, start: Date.now(), end: 0, code: null };
    proc.on('exit', (code) => {
      j.end = Date.now();
      j.code = code;
      try {
        fs.closeSync(fd);
      } catch (e) {}
      log(`[bgm] ${mode} 結束（${code}）`);
      // 試聽用的 mp3 補齊（bgm:all 自己會在背景更新；其他模式結束時跑一次）
      if (fs.existsSync(SPY))
        spawn(SPY, [path.join(base, 'scripts', 'bgm-preview.py')], { cwd: base, stdio: 'ignore' });
    });
    log(`[bgm] 開始 ${mode} ${JSON.stringify(a)}`);
    return j;
  }

  function stopJob() {
    if (!job || job.end) return false;
    if (WIN) spawnSync('taskkill', ['/PID', String(job.proc.pid), '/T', '/F'], { stdio: 'ignore' });
    else job.proc.kill('SIGTERM');
    // bgm:all 的背景試聽也一起停
    try {
      fs.writeFileSync(path.join(OUT, 'done'), '');
    } catch (e) {}
    return true;
  }

  function validSong(s, common) {
    if (!s || typeof s !== 'object') return '格式不對';
    for (const k of ['title', 'zh', 'lyrics'])
      if (typeof s[k] !== 'string' || !s[k].trim()) return `缺少 ${k}`;
    if (s.lyrics.length > 4096) return '歌詞最多 4096 字';
    if (s.voice && !common.VOICE[s.voice]) return '聲線只能是 ' + Object.keys(common.VOICE).join('／');
    if (s.bpm != null && s.bpm !== '' && !(+s.bpm >= 40 && +s.bpm <= 240)) return '速度要在 40～240';
    for (const k of ['key', 'arr']) if (s[k] != null && typeof s[k] !== 'string') return `${k} 要是文字`;
    const out = { title: s.title.trim(), zh: s.zh.trim(), lyrics: s.lyrics.replace(/\r\n/g, '\n').trim() };
    if (s.voice) out.voice = s.voice;
    if (s.bpm) out.bpm = Math.round(+s.bpm);
    if (s.key && s.key.trim()) out.key = s.key.trim();
    if (s.arr && s.arr.trim()) out.arr = s.arr.trim();
    if (s.dur && +s.dur >= 30 && +s.dur <= 300) out.dur = Math.round(+s.dur);
    return out;
  }

  // 啟動時：別台電腦做過、git pull 下來的候選（tools/bgm-work/）解回 tools/acestep/out/，再補齊試聽檔
  if (DEV && fs.existsSync(SPY) && fs.existsSync(path.join(base, 'tools', 'bgm-work'))) {
    const p = spawn(SPY, [path.join(base, 'scripts', 'bgm-sync.py'), 'import'], {
      cwd: base,
      stdio: 'ignore',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
      windowsHide: true,
    });
    p.on('exit', () =>
      spawn(SPY, [path.join(base, 'scripts', 'bgm-preview.py')], {
        cwd: base,
        stdio: 'ignore',
        windowsHide: true,
      }),
    );
  }

  return {
    // 處理了回傳 true（或 Promise）
    handle(req, resp, u) {
      if (!u.startsWith('/api/bgm/')) return false;
      if (!DEV) return (json(resp, { dev: false }), true);
      const q = new URL(req.url, 'http://x').searchParams;
      const route = req.method + ' ' + u.slice(9);
      return (async () => {
        if (route === 'GET state') {
          const common = readJson(path.join(SONGS, 'common.json'));
          const chs = fs
            .readdirSync(SONGS)
            .map((f) => f.match(/^c(\d+)\.json$/))
            .filter(Boolean)
            .map((m) => +m[1])
            .sort((a, b) => a - b);
          const summary = {};
          for (const c of chs) {
            const s = readJson(path.join(SONGS, `c${c}.json`), { songs: {} });
            const o = chapterOut(c);
            summary[c] = {
              songs: Object.keys(s.songs).length,
              cands: Object.values(o.out).reduce((n, x) => n + x.cands.length, 0),
              picked: Object.values(o.out).filter((x) => x.cands.some((y) => y.picked)).length,
              packed: !!o.packed,
            };
          }
          const ch = +q.get('ch') || chs[0];
          const r = {
            dev: true,
            installed: fs.existsSync(path.join(ACE, 'src', '.venv')),
            scorer: fs.existsSync(SPY),
            gpu: gpuInfo(),
            job: job && {
              mode: job.mode,
              args: job.args,
              start: job.start,
              end: job.end,
              code: job.code,
              running: !job.end,
            },
            log: logTail(),
            types: TYPES,
            common,
            chapters: summary,
            ch,
          };
          if (chOk(ch)) r.chapter = { ...readJson(path.join(SONGS, `c${ch}.json`)), ...chapterOut(ch) };
          return json(resp, r);
        }
        if (route === 'GET audio') {
          const ch = +q.get('ch'),
            name = q.get('name');
          const f = chOk(ch) && nameOk(name) ? path.join(PRE, `c${ch}`, name + '.mp3') : null;
          if (!f || !fs.existsSync(f))
            return json(resp, { error: '還沒有試聽檔（產生後一分鐘內會轉好）' }, 404);
          resp.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
          return fs.createReadStream(f).pipe(resp);
        }
        const b = req.method === 'GET' ? null : await body(req);
        if (route === 'PUT song') {
          const common = readJson(path.join(SONGS, 'common.json'));
          if (!b || !chOk(b.ch) || !TYPES.includes(b.type)) return json(resp, { error: '章或類型不對' }, 400);
          const s = validSong(b.song, common);
          if (typeof s === 'string') return json(resp, { error: s }, 400);
          const f = path.join(SONGS, `c${b.ch}.json`);
          const d = readJson(f);
          d.songs[b.type] = s;
          writeAtomic(f, JSON.stringify(d, null, 1) + '\n');
          return json(resp, { ok: true });
        }
        if (route === 'PUT common') {
          const c = b && b.common;
          const keys = ['BASE', 'VOICE', 'ARR', 'CALM', 'PALETTE', 'VOICE_OF', 'BPM_OF'];
          if (!c || keys.some((k) => c[k] == null)) return json(resp, { error: '缺少欄位' }, 400);
          const f = path.join(SONGS, 'common.json');
          const d = readJson(f);
          for (const k of keys) d[k] = c[k];
          writeAtomic(f, JSON.stringify(d, null, 1) + '\n');
          return json(resp, { ok: true });
        }
        if (route === 'POST run') {
          if (job && !job.end) return json(resp, { error: '已經有工作在跑：' + job.mode }, 409);
          const mode = b && b.mode;
          const a = {
            ch: +(b && b.ch) || 1,
            from: +(b && b.from) || 1,
            to: +(b && b.to) || 8,
            n: Math.max(1, Math.min(6, +(b && b.n) || 2)),
            songs: b && Array.isArray(b.songs) ? b.songs.filter((t) => TYPES.includes(t)).join(',') : '',
          };
          if (['fight', 'calm', 'score', 'pack'].includes(mode) && !chOk(a.ch))
            return json(resp, { error: '章不對' }, 400);
          if (!['setup', 'build', 'sync'].includes(mode) && !fs.existsSync(path.join(ACE, 'src', '.venv')))
            return json(resp, { error: '還沒安裝（先按「安裝」或 npm run bgm:setup）' }, 400);
          const j = startJob(mode, a);
          if (!j) return json(resp, { error: '不認得的工作' }, 400);
          job = j;
          return json(resp, { ok: true });
        }
        if (route === 'POST stop') return json(resp, { ok: stopJob() });
        if (route === 'POST pick') {
          if (
            !b ||
            !chOk(b.ch) ||
            !TYPES.includes(b.type) ||
            !nameOk(b.name) ||
            !b.name.startsWith(b.type + '__f')
          )
            return json(resp, { error: '參數不對' }, 400);
          const dir = path.join(OUT, `c${b.ch}`);
          if (!fs.existsSync(path.join(dir, b.name + '.wav')))
            return json(resp, { error: '沒有這個候選' }, 404);
          const f = path.join(dir, 'picks.json');
          const p = readJson(f, {});
          // 換了挑選：刪掉舊的輕快版，讓「產生輕快版」重新產生
          if (p[b.type] !== b.name)
            for (const x of ['.wav', '.json'])
              fs.rmSync(path.join(dir, b.type + '__calm' + x), { force: true });
          p[b.type] = b.name;
          writeAtomic(f, JSON.stringify(p, null, 1) + '\n');
          return json(resp, { ok: true });
        }
        if (route === 'POST drop') {
          if (job && !job.end) return json(resp, { error: '工作在跑的時候不能刪' }, 409);
          if (!b || !chOk(b.ch) || !nameOk(b.name)) return json(resp, { error: '參數不對' }, 400);
          const dir = path.join(OUT, `c${b.ch}`);
          for (const x of ['.wav', '.json']) fs.rmSync(path.join(dir, b.name + x), { force: true });
          // 留下標記：bgm-gen.py 補候選時跳過這個編號、換新的種子（同一個種子會產生一樣的歌）
          if (/__f\d+$/.test(b.name)) fs.writeFileSync(path.join(dir, b.name + '.dropped'), '');
          fs.rmSync(path.join(PRE, `c${b.ch}`, b.name + '.mp3'), { force: true });
          for (const f of ['scores.json', 'picks.json']) {
            const d = readJson(path.join(dir, f));
            if (!d) continue;
            for (const k of Object.keys(d)) if (k === b.name || d[k] === b.name) delete d[k];
            writeAtomic(path.join(dir, f), JSON.stringify(d, null, 1) + '\n');
          }
          return json(resp, { ok: true });
        }
        return json(resp, { error: 'not found' }, 404);
      })().catch((e) => {
        if (!resp.headersSent) json(resp, { error: e.message }, 500);
      });
    },
  };
};
