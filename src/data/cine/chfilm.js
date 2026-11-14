// 各章的開場與章末（過場改版第 5～8 期重做，docs/cine-redesign-design.md 第五節）：整段用 film.js 的新格式，
// 舊的 3D 演出（第二版「每章一種導演風格」）已經拿掉。開場＝B：固定插畫（地點）→ 漫畫頁（局勢）→ 對話分格
// （委託方與 ECHO，talks.js）→ 宿敵登場（PV）→ PV 章名卡；章末＝A＋C：對話分格（人物的關係）→ 漫畫頁（後果）
// → ECHO 的通訊。台詞＝data/story.js 的 CHAPTER_TEXT（依抉擇挑），插畫在 src/assets/cine-art/c<章>/（第 2 期的流程）。
import { CHAPTER_TEXT, pickLines } from '../story.js';
import { L, film } from './film.js';
import { TALKS } from './talks.js';

// 對話分格（依抉擇換人的取那一個選項）
function talkOf(key, ctx) {
  let T = TALKS[key];
  if (T && T.choice) T = T[(ctx.choices || {})[T.choice]] || T[Object.keys(T).find((k) => k !== 'choice')];
  return T ? { talk: T } : null;
}
// 一句配一格：旁白配插畫、角色的台詞配立繪＋氣泡
const SCENE = {
  castron: 'c1/c1_office',
  aetheric: 'cm/m_lab',
  veerwell: 'cm/m_dispatch',
  sancta: 'cm/m_shelter',
};
function cell(line, img, o = {}) {
  const [who, text] = L(line);
  if (who && who !== 'echo')
    return {
      img: SCENE[who] || img,
      dots: 0.4,
      actor: { who, pose: o.pose || 'p1' },
      line: [who, text],
      ...o.cell,
    };
  return { img, line: [who, text], ...o.cell };
}
// 四家委託方各一格（第 1、5、6 章）
const four = (lines, poses = ['p1', 'p1', 'p1', 'p1'], quote = false) =>
  ['castron', 'aetheric', 'veerwell', 'sancta'].map((who, i) => {
    const l = lines[i];
    // 「霍斯特說：「…」」：引號裡的話由那個人自己說（quote 為真時）
    const q = quote && l && /說：「(.+)」$/.exec(l);
    const [sp, text] = q ? [who, q[1]] : l ? L(l) : [null, null];
    return {
      img: SCENE[who],
      dots: 0.4,
      actor: { who, pose: poses[i] },
      ...(text ? { line: [sp, text] } : { hold: 1.2 }),
    };
  });

const FILMS = {
  // ---------- 第 1 章 章末 ----------
  outro_1: (T, ctx) => ({
    music: ['cine_c1', 60],
    blocks: [
      talkOf('outro_1', ctx),
      { still: { img: 'c1/c1o_core', tone: '#c0602c', lines: [L(T[0])] } },
      { still: { img: 'c1/c1o_night', lines: [L(T[1])] } },
      {
        page: [
          cell(T[2], 'c1/c1_office', { pose: 'p8' }),
          cell(T[3], 'cm/m_lab'),
          cell(T[4], 'cm/m_dispatch'),
          cell(T[5], 'cm/m_shelter'),
        ].map((c, i) => ({
          ...c,
          actor: { who: ['castron', 'aetheric', 'veerwell', 'sancta'][i], pose: ['p8', 'p7', 'p9', 'p5'][i] },
          dots: 0.4,
        })),
      },
      { echo: { img: 'c1/c1o_night', lines: [L(T[6]), L(T[7])], poses: ['p7', 'p8'] } },
    ],
  }),
  // ---------- 第 2 章 ----------
  intro_2: (T, ctx) => ({
    music: ['cine_c2', 0],
    blocks: [
      {
        still: {
          img: 'c2/c2i_region',
          loc: ['中部工業帶', 'CENTRAL INDUSTRIAL BELT'],
          color: '#d8903a',
          lines: [L(T[0])],
        },
      },
      {
        page: [
          cell(T[1], 'cm/m_lab'),
          cell(T[2], 'c1/c1_office'),
          cell(T[3], 'c2/c2i_railgun', { cell: { sfx: '轟' } }),
        ],
      },
      talkOf('intro_2', ctx),
      {
        page: [
          { img: 'c1/c1_office', dots: 0.4, actor: { who: 'castron', pose: 'p7' }, line: L(T[4]) },
          { img: 'cm/m_lab', dots: 0.4, actor: { who: 'aetheric', pose: 'p9' }, hold: 1.4 },
        ],
      },
      { rival: { who: 'stevedore', name: 'STEVEDORE', tag: '卡斯特隆的碼頭工頭', color: '#d8903a' } },
      {
        title: {
          ch: 2,
          name: '工業帶的契約',
          en: 'THE INDUSTRIAL CONTRACT',
          color: '#d8903a',
          img: 'c2/c2i_region',
        },
      },
    ],
  }),
  outro_2: (T, ctx) => {
    const cas = (ctx.choices || {}).c2 !== 'aetheric';
    return {
      music: ['cine_c2', 60],
      blocks: [
        talkOf('outro_2', ctx),
        {
          page: cas
            ? [
                cell(T[0], 'cx/x2_feast'),
                cell(T[1], 'cx/x2_dry'),
                cell(T[2], 'cx/x2_refugees'),
                cell(T[3], 'c2/c2o_convoy'),
              ]
            : [
                cell(T[0], 'cx/x2_sakki'),
                cell(T[1], 'cx/x2_cooling'),
                cell(T[2], 'cx/x2_refugees'),
                cell(T[3], 'cx/x2_wanted'),
              ],
        },
        { echo: { img: 'cx/x2_refugees', lines: [L(T[4]), L(T[5])], poses: ['p8', 'p9'] } },
        { still: { img: 'c2/c2o_camp', tone: '#6080a0', lines: [L(T[6])] } },
      ],
    };
  },
  // ---------- 第 3 章 ----------
  intro_3: (T, ctx) => ({
    music: ['cine_c3', 0],
    blocks: [
      {
        still: {
          img: 'c3/c3i_region',
          loc: ['西部冰原', 'WESTERN ICEFIELD'],
          color: '#8ec8f0',
          lines: [L(T[0])],
        },
      },
      {
        page: [
          cell(T[1], 'c3/c3i_camp'),
          { ...cell(T[2], 'cm/m_shelter'), actor: { who: 'sancta', pose: 'p7' }, dots: 0.4 },
        ],
      },
      talkOf('intro_3', ctx),
      { page: [cell(T[3], 'cx/x2_refugees'), cell(T[4], 'c3/c3i_lab')] },
      { rival: { who: 'whiteout', name: 'WHITEOUT', tag: '難民營出身的狙擊手', color: '#8ec8f0' } },
      { title: { ch: 3, name: '冰原之下', en: 'BENEATH THE ICE', color: '#8ec8f0', img: 'c3/c3i_region' } },
    ],
  }),
  outro_3: (T, ctx) => ({
    music: ['cine_suspense', 0],
    blocks: [
      {
        page: [
          cell(T[0], 'c3/c3o_lights'),
          cell(T[1], 'c3/c3o_file'),
          cell(T[2], 'c3/c3o_file', { cell: { tone: '#a03020' } }),
        ],
      },
      {
        page: [
          cell(T[3], 'c3/c3o_coords'),
          { img: 'c1/c1_office', dots: 0.4, actor: { who: 'castron', pose: 'p7' }, line: L(T[4]) },
          cell(T[5], 'c3/c3o_north'),
        ],
      },
      talkOf('outro_3', ctx),
      { echo: { img: 'c3/c3o_lights', lines: [L(T[6]), L(T[7])], poses: ['p8', 'p9'] } },
    ],
  }),
  // ---------- 第 4 章 ----------
  intro_4: (T, ctx) => ({
    music: ['cine_c5', 0],
    blocks: [
      {
        still: {
          img: 'c4/c4i_region',
          loc: ['北部構造體', 'LATTICE-9'],
          color: '#9be070',
          lines: [L(T[0]), L(T[1])],
        },
      },
      {
        page: [
          { img: 'cm/m_dispatch', dots: 0.4, actor: { who: 'veerwell', pose: 'p9' }, line: L(T[2]) },
          { img: 'cm/m_shelter', dots: 0.4, actor: { who: 'sancta', pose: 'p8' }, line: L(T[3]) },
          cell(T[4], 'c4/c4i_scav'),
        ],
      },
      talkOf('intro_4', ctx),
      { still: { img: 'c4/c4i_up', lines: [L(T[5])] } },
      { rival: { who: 'spire', name: 'SPIRE', tag: '掘骸者的首領', color: '#9be070' } },
      { title: { ch: 4, name: '構造體', en: 'THE LATTICE', color: '#9be070', img: 'c4/c4i_region' } },
    ],
  }),
  outro_4: (T, ctx) => {
    const veer = (ctx.choices || {}).c4 !== 'sancta';
    return {
      music: ['cine_c5', 60],
      blocks: [
        talkOf('outro_4', ctx),
        {
          page: veer
            ? [cell(T[0], 'cx/x4_press'), cell(T[1], 'cx/x4_ash'), cell(T[2], 'c4/c4o_cable')]
            : [cell(T[0], 'cx/x4_gate'), cell(T[1], 'cx/x4_planes'), cell(T[2], 'c4/c4o_cable')],
        },
        { page: [cell(T[3], 'c4/c4o_coast'), cell(T[4], 'c4/c4o_letter')] },
        { page: [{ img: 'c1/c1_office', dots: 0.4, actor: { who: 'castron', pose: 'p9' }, line: L(T[5]) }] },
      ],
    };
  },
  // ---------- 第 5 章 ----------
  intro_5: (T, ctx) => ({
    music: ['cine_c5', 0],
    blocks: [
      {
        still: {
          img: 'c5/c5i_region',
          loc: ['東岸洋上都市', 'REEFHOLD'],
          color: '#40c0c0',
          lines: [L(T[0])],
        },
      },
      {
        page: [
          cell(T[1], 'c5/c5i_fleet', { cell: { sfx: '轟' } }),
          cell(T[2], 'c5/c5i_flags'),
          cell(T[3], 'c5/c5i_barricade'),
        ],
      },
      talkOf('intro_5', ctx),
      { page: [cell(T[4], 'c5/c5i_famous'), cell(T[5], 'c5/c5i_why')] },
      { rival: { who: 'undertow', name: 'UNDERTOW', tag: 'Reefhold 的守衛', color: '#40c0c0' } },
      {
        title: { ch: 5, name: '洋上的抉擇', en: 'THE CHOICE AT SEA', color: '#40c0c0', img: 'c5/c5i_region' },
      },
    ],
  }),
  outro_5: (T, ctx) => ({
    music: ['cine_c5', 55],
    blocks: [
      {
        page: [
          cell(T[0], 'cm/m_station'),
          cell(T[1], 'cm/m_button', { cell: { tone: '#c04030' } }),
          cell(T[2], 'c5/c5o_count'),
        ],
      },
      { page: [cell(T[3], 'c5/c5o_table'), cell(T[4], 'c5/c5o_table', { cell: { tone: '#a08060' } })] },
      { page: four([T[5]], ['p1', 'p6', 'p7', 'p9']) },
      talkOf('outro_5', ctx),
      { echo: { img: 'c5/c5i_why', lines: [L(T[6])], poses: ['p10'] } },
      { still: { fill: '#000', lines: [L(T[7])], min: 3.5 } },
    ],
  }),
  // ---------- 第 6 章 ----------
  intro_6: (T, ctx) => ({
    music: ['cine_c6', 0],
    blocks: [
      {
        still: {
          img: 'c6/c6i_region',
          loc: ['高空軌道', 'HIGH ORBIT'],
          color: '#e8eef4',
          lines: [L(T[0]), L(T[1])],
        },
      },
      { still: { art: 'cockpit', fill: '#05080c', lines: [L(T[2])] } },
      { page: four([T[3], T[4], T[5], T[6]], ['p6', 'p9', 'p5', 'p9'], true) },
      { echo: { img: 'cm/m_station', lines: [], poses: ['p8'] }, empty: true },
      talkOf('intro_6', ctx),
      { rival: { who: 'zenith', name: 'ZENITH', tag: '軌道上的傭兵', color: '#e8eef4' } },
      { title: { ch: 6, name: '軌道', en: 'ORBIT', color: '#e8eef4', img: 'c6/c6i_region', line: L(T[7]) } },
    ],
  }),
  outro_6: (T, ctx) => ({
    music: ['cine_c6', 120],
    blocks: [
      {
        page: [
          cell(T[0], 'cx/x6_core'),
          cell(T[1], 'c6/c6o_empty'),
          cell(T[2], 'c6/c6o_empty', { cell: { tone: '#c04030' } }),
        ],
      },
      {
        page: [
          cell(T[3], 'cm/m_station'),
          ...['castron', 'aetheric', 'veerwell'].map((who) => ({
            img: SCENE[who],
            dots: 0.4,
            actor: { who, pose: 'p1' },
            out: true,
            hold: 0.9,
          })),
        ].slice(0, 4),
      },
      { still: { fill: '#000', lines: [L(T[4])], min: 3.2 } },
      talkOf('outro_6', ctx),
      { echo: { img: 'c7/c7i_ark', lines: [L(T[5])], poses: ['p9'] } },
    ],
  }),
  // ---------- 第 7 章 ----------
  intro_7: (T, ctx) => ({
    music: ['cine_drive', 0],
    blocks: [
      {
        still: { img: 'c7/c7i_region', loc: ['火山熔爐帶', 'THE FORGE'], color: '#ff6a20', lines: [L(T[0])] },
      },
      {
        page: [
          cell(T[1], 'c7/c7i_ark', { cell: { sfx: '轟' } }),
          cell(T[2], 'c7/c7i_memory'),
          cell(T[3], 'c7/c7i_elevator'),
        ],
      },
      { page: [{ img: 'c1/c1_office', dots: 0.4, actor: { who: 'castron', pose: 'p9' }, line: L(T[4]) }] },
      talkOf('intro_7', ctx),
      { rival: { who: 'kiln', name: 'KILN', tag: '熔爐的守衛', color: '#ff6a20' } },
      { title: { ch: 7, name: '熔爐', en: 'THE FORGE', color: '#ff6a20', img: 'c7/c7i_region' } },
    ],
  }),
  outro_7: (T, ctx) => ({
    music: ['cine_c6', 60],
    blocks: [
      { page: [cell(T[0], 'c7/c7o_launch', { cell: { sfx: '轟' } }), cell(T[1], 'c7/c7i_elevator')] },
      talkOf('outro_7', ctx),
      {
        page: [
          (ctx.choices || {}).c4 === 'sancta'
            ? { img: 'cm/m_shelter', dots: 0.4, actor: { who: 'sancta', pose: 'p8' }, line: L(T[2]) }
            : { img: 'cm/m_dispatch', dots: 0.4, actor: { who: 'veerwell', pose: 'p8' }, line: L(T[2]) },
        ],
      },
      { echo: { img: 'c7/c7o_launch', lines: [L(T[3])], poses: ['p10'] } },
    ],
  }),
  // ---------- 第 8 章 ----------
  intro_8: (T, ctx) => ({
    music: ['cine_c6', 150],
    blocks: [
      { still: { img: 'c8/c8i_deck', loc: ['方舟', 'THE ARK'], color: '#c8b080', lines: [L(T[0])] } },
      { page: [cell(T[1], 'c8/c8i_wake'), cell(T[2], 'cm/m_button')] },
      { page: four([T[3]], ['p1', 'p1', 'p1', 'p10']) },
      talkOf('intro_8', ctx),
      { rival: { who: 'keel', name: 'KEEL', tag: '方舟的守衛', color: '#c8b080' } },
      { title: { ch: 8, name: '方舟', en: 'THE ARK', color: '#c8b080', img: 'c8/c8i_deck' } },
    ],
  }),
};

// ---------- 抉擇的選前（第 9 期重做）：兩邊委託方左右對峙（talks.js 的 pre_<抉擇>，在目前的戰場上播、舞台蓋住畫面）
// → 目前的戰場：從主角身後看向出口的光柱、倒數（ov: 'choice'）。ctx.opts＝出口（game/campaign.js 的 campChoiceCine）
export function choicePreFilm(id, ctx = {}) {
  const T = TALKS['pre_' + id];
  const opts = (ctx.opts || []).map((o, i) => ({ ...o, ex: i }));
  const live = { k: 'live' };
  return film({
    key: 'pre' + id,
    title: '抉擇',
    music: ['cine_tension', 0],
    cycle: ctx.cycle,
    blocks: [
      { talk: T },
      {
        live: {
          set: live,
          grade: { sat: 0.35, temp: -0.45, contrast: 1.15, vignette: 0.6, tintLo: '#20385a', tintLoK: 0.5 },
          ov: 'choice',
          opts,
          cam: {
            fov: 50,
            hand: 0.05,
            ease: 'lin',
            keys: [
              { t: 0, p: { a: 'player', at: 'head', o: [0, 2, 9], loc: true }, l: { ex: 0, o: [0, 3, 0] } },
              {
                t: 4,
                p: { a: 'player', at: 'head', o: [0, 3, 11], loc: true },
                l: { ex: Math.max(0, opts.length - 1), o: [0, 3, 0] },
              },
            ],
          },
          ev: [
            { t: 0, sfx: 'alarmBig', vol: 0.4, rate: 0.7 },
            ...opts.map((o, i) => ({ t: 0.2 + i * 0.3, fx: 'pillar', at: { ex: i }, r: 4, color: o.hex })),
            { t: 0.3, card: '抉擇', s: 'DECISION', style: 'name', dur: 3.2 },
          ],
        },
        dur: 4,
      },
    ],
  });
}

// chapters.js 的 chapterCine 呼叫：kind＝'intro'｜'outro'；沒有這一段＝null
export function chapterFilm(ch, kind, ctx = {}) {
  const f = FILMS[`${kind}_${ch}`];
  // 還沒做抉擇（過場劇場、測試）：用第一個選項
  const choices = { c2: 'castron', c4: 'veerwell', c6: 'open', ...(ctx.choices || {}) };
  const T = CHAPTER_TEXT[ch] && pickLines(CHAPTER_TEXT[ch][kind], choices);
  if (!f || !T) return null;
  const o = f(T, { ...ctx, choices });
  // 台詞不存在的格子拿掉（劇本改了句數時不會出錯）
  for (const b of o.blocks) if (b && b.page) b.page = b.page.filter((c) => !c.line || c.line[1]);
  // 沒有台詞的 ECHO 段落（第 6 章開場「只有 ECHO 什麼都沒說」）：沒有氣泡、只停一下
  o.blocks = o.blocks.filter((b) => b && !(b.echo && !b.echo.lines.length));
  return film({
    key: `${kind}${ch}`,
    title: `第 ${ch} 章　${kind === 'intro' ? '開場' : '章末'}`,
    cycle: ctx.cycle,
    ...o,
  });
}
