// ECHO 的語音台詞收集（docs/audio-design.md）：node scripts/voice-lines.js
// 收集 → src/assets/voice/lines.json（{ 鍵: { t 台詞, k 情境 } }），之後跑 scripts/voice-gen.py 產生語音檔。
// 情境決定產生時的語氣：sys 系統提示、alarm 緊急的系統提示、comm 通訊、story 劇情畫面、cine 過場動畫、
// private 第 3 周目的私人頻道、end 結局與記憶片段。
//   1. data/story-comms.js 的通訊裡說話者是 echo 的台詞
//   2. src/ 裡寫死的 commSay('echo', '……')（只收單引號的字面字串）
//   3. data/story.js 的序章、章節開場／章末、結局、回收程序、記憶片段裡「ECHO：「……」」的句子
//   4. data/voice.js 的系統提示（鍵＝s_<id>）
//   5. data/cine/ 的過場動畫裡 who 是 echo 的字幕（每個周目 × 抉擇的組合都產生一次）
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
  const PRIV = /R-07|私人頻道/;
  const add = (t, k) => {
    t = String(t).trim();
    // 沒有字的（「……」這種停頓）不唸
    if (!/[一-鿿A-Za-z0-9]/.test(t)) return;
    const key = vkey(t);
    if (PRIV.test(t)) k = 'private';
    // 同一句出現在不同地方時，劇情的情境優先
    if (!lines[key] || lines[key].k === 'comm') lines[key] = { t, k };
  };
  // 1. 通訊（lines 的項目可以是 [說話者, 台詞] 或依抉擇的物件）
  const { COMMS } = await imp('data/story-comms.js');
  let n1 = 0;
  const each = (L) => {
    if (Array.isArray(L) && L.length === 2 && typeof L[0] === 'string' && typeof L[1] === 'string') {
      if (L[0] === 'echo') {
        add(L[1], 'comm');
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
      add(m[1], 'comm');
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
        add(
          q,
          /^ECHO（私人頻道）/.test(s.trim())
            ? 'private'
            : k === 'ENDINGS' || k === 'MEMORIES'
              ? 'end'
              : 'story',
        );
        n3++;
      }
    });
  // 4. 系統提示（優先度 3＝緊急）
  for (const id in VOICE_CUES)
    lines['s_' + id] = { t: VOICE_CUES[id].t, k: VOICE_CUES[id].p >= 3 ? 'alarm' : 'sys' };
  // 5. 過場動畫
  const { CINES } = await imp('data/cine/index.js');
  const { CHOICES } = await imp('data/campaign.js');
  let combos = [{}];
  for (const id of Object.keys(CHOICES))
    combos = combos.flatMap((c) => CHOICES[id].opts.map((o) => ({ ...c, [id]: o.key })));
  const cineSet = new Set();
  for (const k of Object.keys(CINES))
    for (const cycle of [1, 2, 3])
      for (const choices of combos) {
        const d = CINES[k]({ cycle, choices });
        if (d)
          for (const sh of d.shots)
            for (const e of sh.ev || []) if (e.who === 'echo' && e.sub) cineSet.add(String(e.sub).trim());
      }
  for (const t of cineSet) add(t, 'cine');
  const n5 = cineSet.size;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(lines).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
  const chars = Object.values(lines).reduce((a, l) => a + l.t.length, 0);
  console.log(
    `通訊 ${n1}、程式 ${n2}、劇情畫面 ${n3}、系統提示 ${Object.keys(VOICE_CUES).length}、過場 ${n5} → ${Object.keys(lines).length} 句（不重複）、${chars} 字 → ${path.relative(process.cwd(), OUT)}`,
  );
}
main();
