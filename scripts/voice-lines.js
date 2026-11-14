// 角色語音的台詞收集（docs/audio-design.md）：node scripts/voice-lines.js
// 收集 → src/assets/voice/lines.json（{ 說話者: { 鍵: { t 台詞, k 情境, e 表情 } } }），之後跑 scripts/voice-gen.py 產生語音檔。
// 表情（e）＝data/line-expr.js 的 lineExpr（和遊戲顯示立繪時相同；平常 neutral 不寫），voice-gen.py 依它加上語氣（語音 v2，
// docs/cine-redesign-design.md）。
// 情境決定產生時的語氣：sys 系統提示、alarm 緊急的系統提示、comm 通訊、story 劇情畫面、cine 過場動畫、
// private 第 3 周目的私人頻道、end 結局與記憶片段、bark 敵兵的喊話（shout 大喊／low 壓低聲音）、brief 作戰室的簡報（當面說話）。
//   1. data/story-comms.js 的通訊（[說話者, 台詞]）
//   2. src/ 裡寫死的 commSay('<說話者>', …) 的字串（單引號的字面字串；教官的第幾課另外展開）
//   3. data/story.js 的序章、章節開場／章末、結局、回收程序、記憶片段裡「名字：「……」」的句子（data/voice.js 的 storyQuote）
//   4. data/voice.js 的系統提示（ECHO，每種 10 句，鍵＝cueKey：s_<id>、s_<id>_<n>）、輪流的台詞（LINE_POOLS，鍵＝vkey）
//      與敵兵的喊話（grunt，鍵＝b_<事件><編號>）
//   5. data/cine/ 的過場動畫的字幕（每個周目 × 抉擇的組合都產生一次）
//   6. data/tutorial.js、tutorial-ranged.js 的教官提示（say）
//   7. data/story.js 的簡報（BRIEFINGS 的 lines 與 prev；說話者＝speaker 或依抉擇的委託方 briefClient，每個抉擇的組合都展開；
//      ECHO 的私人委託＝private）
// 只收 echo 與 data/voice.js 的 CAST_IDS（有語音的角色）；鍵＝data/voice.js 的 vkey(台詞)，遊戲播放時用同一個函式找語音。
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
// commSay( 開頭的位置 → 到對應的 ) 為止的原始碼（略過字串裡的括號）
function callBody(s, i) {
  let d = 0,
    q = null;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (q) {
      if (c === '\\') j++;
      else if (c === q) q = null;
    } else if (c === "'" || c === '"' || c === '`') q = c;
    else if (c === '(') d++;
    else if (c === ')' && --d === 0) return s.slice(i, j + 1);
  }
  return '';
}

// 原始碼裡的單引號字串（依序掃描，雙引號與樣板字串略過；用正規表示式會把兩個字串之間的程式碼當成字串）
function strLits(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== "'" && c !== '"' && c !== '`') continue;
    let j = i + 1,
      v = '';
    while (j < s.length && s[j] !== c) {
      if (s[j] === '\\') j++;
      v += s[j];
      j++;
    }
    if (c === "'") out.push(v);
    i = j;
  }
  return out;
}

async function main() {
  const { vkey, storyQuote, VOICE_CUES, cueKey, LINE_POOLS, CAST_IDS, CAST_NEW, BARKS } =
    await imp('data/voice.js');
  const { lineExpr } = await imp('data/line-expr.js');
  const SPK = new Set(['echo', ...CAST_IDS, ...(CAST_NEW || [])]);
  const lines = {};
  const n = {};
  const PRIV = /R-07|私人頻道/;
  // o＝lineExpr 的 { ev 通訊事件, cue 系統提示 }
  const add = (sp, t, k, src, o = {}) => {
    if (!SPK.has(sp)) return;
    t = String(t).trim();
    // 沒有字的（「……」這種停頓）不唸
    if (!/[一-鿿A-Za-z0-9]/.test(t)) return;
    const key = vkey(t);
    if (sp === 'echo' && PRIV.test(t)) k = 'private';
    const L = (lines[sp] = lines[sp] || {});
    // 同一句出現在不同地方時，劇情的情境優先
    if (!L[key] || L[key].k === 'comm') {
      const e = lineExpr(t, { ...o, sp }).e;
      L[key] = e && e !== 'neutral' ? { t, k, e } : { t, k };
    }
    n[src] = (n[src] || 0) + 1;
  };
  // 1. 通訊（lines 的項目可以是 [說話者, 台詞] 或依抉擇的物件）
  const { COMMS } = await imp('data/story-comms.js');
  const each = (L, ev) => {
    if (Array.isArray(L) && L.length === 2 && typeof L[0] === 'string' && typeof L[1] === 'string')
      add(L[0], L[1], 'comm', '通訊', { ev });
    else if (Array.isArray(L)) L.forEach((x) => each(x, ev));
    else if (L && typeof L === 'object') for (const k in L) each(L[k], ev);
  };
  for (const c of COMMS) each(c.lines, c.event);
  // 2. 程式裡的 commSay('<說話者>', …)：呼叫裡的單引號字串都收（三元運算、陣列挑一句）
  walkFiles(SRC, (p) => {
    const s = fs.readFileSync(p, 'utf8');
    for (const m of s.matchAll(/commSay\(\s*'([a-z]+)'/g)) {
      const body = callBody(s, m.index + 'commSay'.length);
      for (const q of strLits(body)) if (/[一-鿿]/.test(q)) add(m[1], q, 'comm', '程式', { ev: 'live' });
    }
  });
  // 教官的「第 n 課，課名。開始。」（tutorial.js 的 tutStart，第 2 課起）
  const { LESSONS } = await imp('data/tutorial.js');
  const { R_LESSONS } = await imp('data/tutorial-ranged.js');
  for (const list of [LESSONS, R_LESSONS]) {
    list.forEach((L, i) => {
      if (i > 0) add('instructor', `第 ${i + 1} 課，${L.n}。開始。`, 'comm', '程式');
      // 6. 教官的提示
      for (const st of L.steps || []) if (st.say) add('instructor', st.say, 'comm', '教官提示');
    });
  }
  // 3. 序章與章節畫面
  const story = await imp('data/story.js');
  for (const k of ['PROLOGUE', 'CHAPTER_TEXT', 'ENDINGS', 'RECALL_C2', 'MEMORIES'])
    walkStrings(story[k], (s) => {
      const r = storyQuote(s);
      if (!r) return;
      const kind = /^ECHO（私人頻道）/.test(s.trim())
        ? 'private'
        : k === 'ENDINGS' || k === 'MEMORIES'
          ? 'end'
          : 'story';
      add(r.sp, r.q, kind, '劇情畫面');
    });
  // 4. 系統提示（優先度 3＝緊急）與敵兵的喊話
  lines.echo = lines.echo || {};
  for (const id in VOICE_CUES)
    VOICE_CUES[id].t.forEach((t, i) => {
      const e = lineExpr(t, { cue: id }).e;
      lines.echo[cueKey(id, i)] = {
        t,
        k: VOICE_CUES[id].p >= 3 ? 'alarm' : 'sys',
        ...(e !== 'neutral' ? { e } : {}),
      };
    });
  // 程式裡輪流挑的台詞（LINE_POOLS，鍵＝vkey）
  for (const id in LINE_POOLS)
    for (const t of LINE_POOLS[id].t) add(LINE_POOLS[id].sp, t, 'comm', '輪流的台詞', { ev: 'live' });
  // 喊話的表情＝game/voice.js 的 BARK_EXPR（字幕條的小頭像；語音 v2 照它加語氣）
  const BARK_EXPR = {
    spot: 'surprised',
    search: 'think',
    attack: 'shout',
    hurt: 'panic',
    allyDown: 'shout',
    cmdDown: 'panic',
  };
  lines.grunt = {};
  for (const ev in BARKS)
    BARKS[ev].forEach(
      (t, i) =>
        (lines.grunt[`b_${ev}${i}`] = {
          t,
          k: ev === 'search' ? 'low' : 'shout',
          ...(BARK_EXPR[ev] ? { e: BARK_EXPR[ev] } : {}),
        }),
    );
  // 5. 過場動畫
  const { CINES } = await imp('data/cine/index.js');
  const { CHOICES } = await imp('data/campaign.js');
  let combos = [{}];
  for (const id of Object.keys(CHOICES))
    combos = combos.flatMap((c) => CHOICES[id].opts.map((o) => ({ ...c, [id]: o.key })));
  for (const k of Object.keys(CINES))
    for (const cycle of [1, 2, 3])
      for (const choices of combos) {
        const d = CINES[k]({ cycle, choices });
        if (d)
          for (const sh of d.shots)
            for (const e of sh.ev || []) if (e.who && e.sub) add(e.who, e.sub, 'cine', '過場');
      }
  // 7. 簡報（game/hub.js 的 openBrief：每次打開都唸，voice.js 的 voiceBrief）
  for (const sid in story.BRIEFINGS) {
    const B = story.BRIEFINGS[sid];
    const prev = [];
    walkStrings(B.prev, (s) => prev.push(s));
    for (const choices of combos) {
      const sp = B.speaker || story.briefClient(B, choices);
      for (const t of story.pickLines(B.lines, choices).concat(prev))
        add(sp, t, sp === 'echo' ? 'private' : 'brief', '簡報');
    }
  }
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const sorted = {};
  for (const sp of Object.keys(lines).sort())
    sorted[sp] = Object.fromEntries(Object.entries(lines[sp]).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  fs.writeFileSync(OUT, JSON.stringify(sorted, null, 1) + '\n');
  const per = Object.keys(sorted)
    .map((sp) => `${sp} ${Object.keys(sorted[sp]).length}`)
    .join('、');
  const all = Object.values(sorted).reduce((a, L) => a + Object.keys(L).length, 0);
  console.log(
    `${Object.entries(n)
      .map(([k, v]) => `${k} ${v}`)
      .join('、')} → ${all} 句（不重複）：${per} → ${path.relative(process.cwd(), OUT)}`,
  );
}
main();
