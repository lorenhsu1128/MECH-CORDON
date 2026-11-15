// 過場動畫的字型（docs/cinematics.md 的「文字風格」）：標題與狀聲詞用 Dela Gothic One、英數用 Rubik 粗斜體，
// 只取劇本用得到的字子集化成 woff2 → src/assets/fonts/（建置時內嵌進遊戲的 HTML，直接開檔、沒有網路也一樣）。
//   node scripts/cine-font.js           重新產生（要 python 與 fontTools＋brotli：python -m pip install --user fonttools brotli）
// 建置（scripts/build.js）呼叫 checkCineFont()：劇本用到、字型裡卻沒有的字（改了字卡之後忘了重跑）印出警告。
// 收字的規則：data/cine/ 裡 card／s／sub／name／en／kana／big／tag 這些欄位的短字串、loc 與 LOC(…) 的兩個字串、任何字串裡 **…** 標的強調詞，
// 以及 render/cine-brand.js、game/cine-type.js 的全部字串（膠帶、標籤的固定文字），再加上英數、片假名與常用標點。
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const SRC_D = path.join(ROOT, 'tools', 'fonts', 'DelaGothicOne-Regular.ttf');
const SRC_L = path.join(ROOT, 'tools', 'fonts', 'Rubik-Italic[wght].ttf');
const OUT = path.join(ROOT, 'src', 'assets', 'fonts');
const BASE =
  Array.from({ length: 0x7f - 0x20 }, (_, i) => String.fromCharCode(0x20 + i)).join('') +
  Array.from({ length: 0x100 }, (_, i) => String.fromCharCode(0x30a0 + i))
    .join('')
    .slice(0, 0x60) +
  '、。・「」『』！？…—―ー～／：；，（）［］【】★☆●○▲△▼■□◆◇※＋－＝＃％＆＠０１２３４５６７８９';

function stringsIn(file) {
  const t = fs.readFileSync(file, 'utf8').replace(/^\s*\/\/.*$/gm, '');
  return [...t.matchAll(/'((?:[^'\\\n]|\\.)*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? '');
}

// 標題類（Dela Gothic One）用到的字
function collectChars() {
  const set = new Set(BASE);
  const add = (s) => {
    for (const ch of s) if (ch.codePointAt(0) >= 0x20) set.add(ch);
  };
  const dir = path.join(ROOT, 'src', 'data', 'cine');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.js'))) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of t.matchAll(/\b(?:card|s|sub|name|en|kana|big|tag):\s*'([^'\n]{1,32})'/g)) add(m[1]);
    for (const m of t.matchAll(/\bloc:\s*\[\s*'([^'\n]*)',\s*'([^'\n]*)'/g)) add(m[1] + m[2]);
    for (const m of t.matchAll(/\*\*([^*\n']+)\*\*/g)) add(m[1]);
    for (const m of t.matchAll(/\bLOC\(\s*'([^'\n]*)',\s*'([^'\n]*)'/g)) add(m[1] + m[2]);
  }
  for (const f of ['render/cine-brand.js', 'game/cine-type.js']) {
    const p = path.join(ROOT, 'src', f);
    if (fs.existsSync(p)) for (const s of stringsIn(p)) add(s);
  }
  return [...set].sort().join('');
}

function py(args) {
  return execFileSync('python', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

function build() {
  const chars = collectChars();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cine-font-'));
  try {
    fs.mkdirSync(OUT, { recursive: true });
    const txt = path.join(tmp, 'chars.txt');
    fs.writeFileSync(txt, chars, 'utf8');
    // Dela Gothic One 沒有的字（由 Noto Sans TC 900 補）
    const missing = JSON.parse(
      py([
        '-c',
        'import sys,json;from fontTools.ttLib import TTFont;c=TTFont(sys.argv[1]).getBestCmap();' +
          't=open(sys.argv[2],encoding="utf8").read();print(json.dumps("".join(x for x in t if ord(x) not in c)))',
        SRC_D,
        txt,
      ]),
    );
    const sub = (src, out, textFile) =>
      py([
        '-m',
        'fontTools.subset',
        src,
        `--text-file=${textFile}`,
        '--flavor=woff2',
        `--output-file=${out}`,
        '--layout-features=*',
        '--no-hinting',
        '--desubroutinize',
      ]);
    sub(SRC_D, path.join(OUT, 'mc-display.woff2'), txt);
    // Rubik：可變字型先固定在 900，再只取英數與標點
    const r900 = path.join(tmp, 'rubik900.ttf');
    py(['-m', 'fontTools.varLib.instancer', SRC_L, 'wght=900', '-q', '-o', r900]);
    const ltxt = path.join(tmp, 'latin.txt');
    fs.writeFileSync(ltxt, BASE.replace(/[^\x20-\x7e]/g, '') + '—–’‘“”…•×·°', 'utf8');
    sub(r900, path.join(OUT, 'mc-latin.woff2'), ltxt);
    fs.writeFileSync(path.join(OUT, 'mc-display.json'), JSON.stringify({ chars, missing }, null, 0) + '\n');
    const kb = (f) => (fs.statSync(path.join(OUT, f)).size / 1024).toFixed(1) + ' KB';
    console.log(
      `[cine-font] ${[...chars].length} 字 → mc-display.woff2 ${kb('mc-display.woff2')}、mc-latin.woff2 ${kb('mc-latin.woff2')}；` +
        `Dela Gothic One 沒有的 ${[...missing].length} 字（Noto Sans TC 補）：${missing}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// 建置用：劇本用到、子集裡沒有的字
function checkCineFont() {
  const p = path.join(OUT, 'mc-display.json');
  if (!fs.existsSync(p)) return console.warn('[build] 過場字型還沒產生：node scripts/cine-font.js');
  const { chars, missing } = JSON.parse(fs.readFileSync(p, 'utf8'));
  const have = new Set([...chars, ...missing]);
  const lack = [...collectChars()].filter((c) => !have.has(c));
  if (lack.length)
    console.warn(
      `[build] 過場字型少了 ${lack.length} 字（${lack.join('')}）：重跑 node scripts/cine-font.js`,
    );
}

module.exports = { collectChars, checkCineFont };
if (require.main === module) build();
