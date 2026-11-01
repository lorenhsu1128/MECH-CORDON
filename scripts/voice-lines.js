// ECHO 的語音台詞收集（docs/audio-design.md 第 4 期）：node scripts/voice-lines.js
// 收集 → src/assets/voice/lines.json（{ 鍵: 台詞 }），之後跑 scripts/voice-gen.py 產生語音檔。
//   1. data/story-comms.js 的通訊裡說話者是 echo 的台詞
//   2. src/ 裡寫死的 commSay('echo', '……')（只收單引號的字面字串）
//   3. data/story.js 的序章、章節開場／章末、結局、回收程序、記憶片段裡「ECHO：「……」」的句子
//   4. data/voice.js 的系統提示（鍵＝s_<id>）
// 鍵＝data/voice.js 的 vkey(台詞)，遊戲播放時用同一個函式找語音。
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SRC = path.join(__dirname, '..', 'src');
const OUT = path.join(SRC, 'assets', 'voice', 'lines.json');
const imp = (p) => import(pathToFileURL(path.join(SRC, p)).href);

function walkStrings(o, f) {
  if (typeof o === 'string') f(o);
  else if (Array.isArray(o)) o.forEach((x) => walkStrings(x, f));
  else if (o && typeof o === 'object') for (const k in o) walkStrings(o[k], f);
}
function walkFiles(d, f) {
  for (const n of fs.readdirSync(d)) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walkFiles(p, f);
    else if (n.endsWith('.js')) f(p);
  }
}

async function main() {
  const { vkey, echoQuote, VOICE_CUES } = await imp('data/voice.js');
  const lines = {};
  const add = (t) => {
    t = String(t).trim();
    if (t) lines[vkey(t)] = t;
  };
  // 1. 通訊（lines 的項目可以是 [說話者, 台詞] 或依抉擇的物件）
  const { COMMS } = await imp('data/story-comms.js');
  let n1 = 0;
  const each = (L) => {
    if (Array.isArray(L) && L.length === 2 && typeof L[0] === 'string' && typeof L[1] === 'string') {
      if (L[0] === 'echo') {
        add(L[1]);
        n1++;
      }
    } else if (Array.isArray(L)) L.forEach(each);
    else if (L && typeof L === 'object') for (const k in L) each(L[k]);
  };
  for (const c of COMMS) each(c.lines);
  // 2. 程式裡的 commSay('echo', '…')
  let n2 = 0;
  walkFiles(SRC, (p) => {
    const s = fs.readFileSync(p, 'utf8');
    for (const m of s.matchAll(/commSay\(\s*'echo',\s*'([^'\\]+)'\s*\)/g)) {
      add(m[1]);
      n2++;
    }
  });
  // 3. 序章與章節畫面
  const story = await imp('data/story.js');
  let n3 = 0;
  for (const k of ['PROLOGUE', 'CHAPTER_TEXT', 'ENDINGS', 'RECALL_C2', 'MEMORIES'])
    walkStrings(story[k], (s) => {
      const q = echoQuote(s);
      if (q) {
        add(q);
        n3++;
      }
    });
  // 4. 系統提示
  for (const id in VOICE_CUES) lines['s_' + id] = VOICE_CUES[id].t;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(lines).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
  const chars = Object.values(lines).reduce((a, t) => a + t.length, 0);
  console.log(
    `通訊 ${n1}、程式 ${n2}、劇情畫面 ${n3}、系統提示 ${Object.keys(VOICE_CUES).length} → ${Object.keys(lines).length} 句（不重複）、${chars} 字 → ${path.relative(process.cwd(), OUT)}`,
  );
}
main();
