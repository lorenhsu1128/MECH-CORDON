// ECHO 的記憶片段與真結局（過場改版第 10 期，docs/cine-redesign-design.md 第五節：方案 E 的 2D 短片）：
// 雙色調（每一片兩個顏色：暗色的底＋亮色的單色插畫與立繪）、有限動畫（舞台的時間一秒 8 格、一句一個姿勢、
// 姿勢之間只有保持＋兩格的過渡）。說話的是 ECHO「真實的樣子」（echo_true，台詞與語音照 echo）；
// 台詞＝data/story.js 的 MEMORIES／ENDINGS（語音已經有：voice-lines.js 收集了結局與記憶片段的句子）。
import { ENDINGS, MEMORIES } from '../story.js';
import { lineDur, parseLine } from './kit.js';

// 每一片的雙色調與插畫（第 2 期的場景插畫，沒有圖時畫底色）
const LOOK = {
  1: { dark: '#1e0806', light: '#ff7050', img: 'c1/c1_antenna' },
  2: { dark: '#06121c', light: '#7fc8ff', img: 'cm/m_shelter' },
  3: { dark: '#0c0c16', light: '#c8c8ff', img: 'cm/m_lab' },
  4: { dark: '#160c04', light: '#ffb050', img: 'cm/m_dispatch' },
  5: { dark: '#08140a', light: '#a8e080', img: 'c1/c1_office' },
  6: { dark: '#100818', light: '#d8b0ff', img: 'cm/m_station' },
  7: { dark: '#1c0600', light: '#ff8a30', img: 'cm/m_forge' },
  8: { dark: '#0a0a0a', light: '#f4ece0', img: 'cm/m_button' },
};
// echo_true 的姿勢（一句一個，輪流）
const POSES = ['p1', 'p3', 'p6', 'p9', 'p7', 'p8'];

// 共用：一段雙色調的短片。lines＝字串陣列（「ECHO：「…」」＝氣泡，其他＝字幕條的旁白）
function shortFilm({ title, tag, look, lines, music }) {
  const ev = [];
  const s = [];
  let t = 3.2,
    pi = 0;
  for (const l of lines) {
    const L = parseLine(l);
    const d = lineDur(L.text) + 0.5;
    const who = L.who === 'echo' ? 'echo' : null;
    ev.push({ t, sub: L.text, who, dur: d });
    if (who) s.push({ t, pose: POSES[pi++ % POSES.length], dim: 0 });
    else s.push({ t, dim: 0.5 });
    t += d + 0.4;
  }
  const dur = t + 2.2;
  const st = {
    fps: 8,
    bg: look.dark,
    els: [
      // 插畫：單色（亮色）、粗網點、慢慢推近
      {
        k: 'panel',
        q: [0, 0, 1600, 900],
        bd: 0,
        img: look.img,
        fill: look.dark,
        tone: look.light,
        dots: 0.55,
        dotSz: 12,
        vig: 0.85,
        kb: [
          { t: 0, z: 1.05 },
          { t: dur, z: 1.2 },
        ],
        a: 0.55,
      },
      // 片段的標題：開頭 3 秒
      {
        k: 'text',
        s: tag,
        at: [800, 380],
        size: 30,
        font: 'mono',
        color: look.light,
        stroke: null,
        t0: 0.4,
        t1: 2.8,
        in: 'fade',
        ls: 14,
      },
      {
        k: 'text',
        s: title,
        at: [800, 460],
        size: 96,
        color: look.light,
        stroke: look.dark,
        sw: 12,
        t0: 0.8,
        t1: 2.8,
        in: 'stamp',
        ls: 20,
      },
      // ECHO（真實的樣子）：雙色調的立繪，右邊
      {
        k: 'actor',
        who: 'echo_true',
        sp: 'echo',
        pose: 'p1',
        at: [1180, 1180],
        h: 1120,
        t0: 2.9,
        in: 'fade',
        ind: 0.6,
        tone: look.light,
        dim: 0.5,
        bub: [-420, -60],
        bubW: 520,
        s,
      },
      // 底下的細線（膠卷的邊）
      { k: 'block', q: [0, 0, 1600, 14], color: look.light, a: 0.5 },
      { k: 'block', q: [0, 886, 1600, 14], color: look.light, a: 0.5 },
    ],
  };
  return {
    title,
    dur,
    lb: false,
    music: [{ at: 0, track: music || 'cine_ident', vol: 0.55, fadeIn: 1.5, fadeOut: [dur - 2.5, 2.5] }],
    shots: [
      {
        at: 0,
        set: { k: 'black' },
        lb: false,
        fi: 1.2,
        fo: 1.6,
        st,
        ev: [{ t: 0.2, sfx: 'glitch', vol: 0.3, rate: 0.6 }, ...ev],
      },
    ],
  };
}

// 記憶片段 k（1～8）：m<k>
export function memoryCine(k) {
  const M = MEMORIES[k];
  if (!M) return null;
  return shortFilm({
    title: M.title,
    tag: `MEMORY ${k} / ${Object.keys(MEMORIES).length}`,
    look: LOOK[k] || LOOK[8],
    lines: M.lines,
  });
}

// 真結局：ECHO 說的幾句＋（記憶片段全部回收時）多出的結尾；結局畫面（文字）之前播
export function trueEndCine(ctx = {}) {
  const E = ENDINGS.beyond;
  const lines = E.lines.filter((l) => /^ECHO：/.test(l) || /星球|推進器|最後一份工作/.test(l));
  return shortFilm({
    title: '彼岸',
    tag: 'TRUE ENDING',
    look: { dark: '#04060e', light: '#ffd7a0', img: 'cm/m_station' },
    lines: lines.concat(ctx.full ? E.full : []),
    music: 'cine_ident',
  });
}
