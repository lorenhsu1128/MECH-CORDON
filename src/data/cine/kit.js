// 過場劇本的小工具（過場改版後只剩：場景 W、時間軸 timeline、一句的秒數 lineDur、「名字：「…」」的拆解 parseLine；
// 新格式的組件在 film.js）

export const W = (theme, o = {}) => ({
  k: 'world',
  theme,
  seed: o.seed || 5000 + theme.length * 31,
  clear: 30,
  ...o,
});

// ---------- 時間軸 ----------
export function timeline() {
  let at = 0;
  const shots = [];
  let prevKey = '',
    prevIds = [];
  return {
    shots,
    get at() {
      return at;
    },
    add(s, d) {
      const key = JSON.stringify(s.set || { k: 'black' });
      const ids = (s.actors || []).map((a) => a.id);
      const same = key === prevKey;
      const sh = { ...s, at };
      if (same && !s.keep) sh.drop = [...(s.drop || []), ...prevIds];
      shots.push(sh);
      prevKey = key;
      prevIds = s.keep ? [...prevIds, ...ids] : ids;
      at += d;
      return sh;
    },
    def(o) {
      return { title: o.title || '', dur: at + 0.3, lb: 2.39, music: o.music || [], shots };
    },
  };
}

// 一句台詞的秒數
export const lineDur = (s) => Math.max(3.2, Math.min(7, 1.5 + (s || '').length * 0.13));
// 「名字：「…」」→ { text, who }
const WHO = {
  ECHO: 'echo',
  霍斯特: 'castron',
  薩奇: 'aetheric',
  派克: 'veerwell',
  諾拉: 'sancta',
  米拉: 'mira',
};
export function parseLine(l) {
  const m = /^([^「」：]{1,14})：「(.+)」$/.exec(l || '');
  if (!m) return { text: l || '', who: null };
  const n = m[1].replace(/（.*）$/, '');
  return { text: m[2], who: WHO[n] || (/^[A-Z &]+$/.test(n) ? n.toLowerCase() : null) };
}
