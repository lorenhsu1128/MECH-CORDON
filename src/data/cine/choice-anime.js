// 抉擇的選前與選後（3D 動畫化，docs/cine-redesign-design.md 第十節）。
// 選前：兩邊的委託方各在自己的室內，正反打（左邊的人在畫面左、右邊的人在畫面右）→ 目前的戰場（出口的光柱與倒數）。
// 選後：代價的蒙太奇改成 3D 的地點＋疊在上面的插畫格（場景插畫 src/assets/cine-art/cx/），一格一句（旁白＝narr 的語音），
// 最後是黑底的大字卡。台詞照原本的（talks.js 的 pre_<抉擇>、原本 aftermath.js 的句子，語音已經有）。
import { W, timeline } from './kit.js';
import { TALKS } from './talks.js';
import { ACT, CLIENT_ROOM, CORE, COREG, FOCUS, PANEL, ROOM_GRADE, dropAll, placeLines } from './anime.js';

// ---------- 地點 ----------
const DAMN = W('dam', { seed: 6212, tod: 'dusk', anchor: [35, -20], clear: 10 });
const YARD = W('industrial', { seed: 6211, tod: 'dusk', clear: 14 });
const PORT = W('spaceport', { seed: 6412, clear: 14 });
const ORB = W('orbit', { seed: 6611, clear: 12 });
const ARK = W('ark', { seed: 6712, clear: 12 });
const DUSK = {
  sunAz: 90,
  sunEl: 14,
  sunWarm: 0.9,
  temp: 0.38,
  contrast: 1.3,
  sat: 0.85,
  tintHi: '#ffb070',
  tintHiK: 0.45,
  tintLo: '#1a1420',
  tintLoK: 0.4,
  grain: 0.3,
  vignette: 0.5,
  fogK: 1.1,
  bloom: 1.1,
};
const DAY = {
  sunAz: 90,
  sunEl: 32,
  temp: 0.5,
  contrast: 1.28,
  sat: 0.78,
  tintHi: '#fff0d8',
  tintHiK: 0.3,
  tintLo: '#18202a',
  tintLoK: 0.4,
  grain: 0.3,
  vignette: 0.5,
  fogK: 1.1,
  bloom: 1.05,
};
const ORBG = {
  ...DAY,
  sunEl: 28,
  temp: 0.6,
  sat: 0.7,
  tintHi: '#f0f6ff',
  tintLo: '#101a30',
  tintLoK: 0.45,
  fogK: 1.2,
  bloom: 1.15,
};
const ARKG = {
  ...DUSK,
  sunEl: 18,
  temp: 0.4,
  contrast: 1.34,
  sat: 0.7,
  tintHi: '#ffd8a0',
  tintHiK: 0.4,
  tintLo: '#180c08',
  tintLoK: 0.45,
  bloom: 1.25,
};
// 各地點的鏡頭（慢慢推進）：[開始, 結束]，各為 [位置, 看的點]
const CAMS = {
  dam: [
    [
      { g: [-12, 12], h: 1.5 },
      { g: [8, -10], h: 6 },
    ],
    [
      { g: [-11, 10], h: 1.6 },
      { g: [8, -10], h: 9 },
    ],
  ],
  damUp: [
    [
      { g: [-6, 14], h: 2 },
      { g: [0, -24], h: 8 },
    ],
    [
      { g: [-6, 14], h: 2 },
      { g: [2, -24], h: 16 },
    ],
  ],
  yard: [
    [
      [0, 16, 42],
      [0, 3, 0],
    ],
    [
      [-4, 10, 30],
      [0, 4, 0],
    ],
  ],
  port: [
    [
      [0, 30, 60],
      [0, 2, 0],
    ],
    [
      [-6, 12, 30],
      [0, 3, 0],
    ],
  ],
  portUp: [
    [
      [-8, 2, 18],
      [6, 4, -30],
    ],
    [
      [-8, 2, 18],
      [6, 40, -30],
    ],
  ],
  orb: [
    [
      [0, 30, 60],
      [0, 2, 0],
    ],
    [
      [-6, 12, 30],
      [0, 3, 0],
    ],
  ],
  orbSky: [
    [
      [0, 4, 20],
      [0, 20, -40],
    ],
    [
      [0, 4, 18],
      [0, 34, -40],
    ],
  ],
  core: [
    [
      [-10, 3, 2],
      [0, 3, 0],
    ],
    [
      [-8, 3.4, 5],
      [0, 4, 0],
    ],
  ],
  coreTop: [
    [
      [3, 1.2, 4],
      [0, 6, 19],
    ],
    [
      [2.4, 1.4, 6],
      [0, 6, 16],
    ],
  ],
};
const camOf = (k, d, fov = 46) => {
  const [a, b] = CAMS[k];
  return {
    fov,
    hand: 0.03,
    ease: 'lin',
    keys: [
      { t: 0, p: a[0], l: a[1] },
      { t: d, p: b[0], l: b[1] },
    ],
  };
};
// 插畫格：右（預設）／左／中
const QS = {
  R: [
    [880, 70],
    [1540, 70],
    [1540, 590],
    [820, 590],
  ],
  L: [
    [60, 70],
    [720, 70],
    [660, 590],
    [60, 590],
  ],
  C: [
    [260, 80],
    [1340, 80],
    [1340, 700],
    [260, 700],
  ],
};
// 字幕的長度 → 這一鏡的秒數
const lenOf = (s) => Math.max(4.2, 1.6 + [...(s || '')].length * 0.17);

// ---------- 選前 ----------
// 說話者的近景：在自己的室內（宿敵 ZENITH 在方舟的甲板上，背後站著它的機體）；side＝畫面的左右
function speakerShot(who, side, i) {
  const pose = {
    castron: ['p1', 'p9'],
    aetheric: ['p3', 'p9'],
    veerwell: ['p3', 'p9'],
    sancta: ['p1', 'p7'],
  }[who] || ['p1', 'p2'];
  const at = side === 'L' ? [520, 1820] : [1080, 1820];
  if (who === 'zenith')
    return {
      set: ARK,
      grade: { ...ARKG, contrast: 1.3, sunEl: 40, exposure: 0.85, bloom: 0.6 },
      lb: false,
      fi: 0.12,
      actors: [{ id: 'zn', k: 'ace', key: 'zenith', p: [-4, -4], yaw: 160, s: [{ t: 0, look: 0.4 }] }],
      st: {
        els: [ACT('zenith', { pose: pose[i ? 1 : 0], at, h: 1900, in: 'fade', par: 0.08 }), FOCUS(0, 0.3)],
      },
      cam: {
        fov: 34,
        hand: 0.03,
        ease: 'lin',
        keys: [
          { t: 0, p: { a: 'zn', at: 'base', o: [-5, 1.2, 9] }, l: { a: 'zn', o: [4, 2.6, 0] } },
          { t: 6, p: { a: 'zn', at: 'base', o: [-4.6, 1.2, 8.2] }, l: { a: 'zn', o: [4, 2.8, 0] } },
        ],
      },
    };
  const [set, grade, p, l, actors] = CLIENT_ROOM[who];
  // 右邊的人：鏡頭往另一邊斜（正反打）
  const pp = side === 'R' ? [-p[0], p[1], p[2]] : p,
    ll = side === 'R' ? [-l[0] * 0.5, l[1], l[2]] : l;
  return {
    set,
    grade: { ...grade, contrast: 1.36 },
    lb: false,
    fi: 0.12,
    actors: actors(),
    st: { els: [ACT(who, { pose: pose[i ? 1 : 0], at, h: 1900, in: 'fade' }), FOCUS(0, 0.3)] },
    cam: {
      fov: 32,
      dof: 1,
      focus: 0.9,
      range: 0.4,
      ease: 'lin',
      keys: [
        { t: 0, p: pp, l: ll },
        { t: 6, p: [pp[0] * 0.95, pp[1], pp[2] - 0.25], l: ll },
      ],
    },
  };
}
// 兩邊的對峙：黑底、兩張斜切的格子從左右撞進來，中間一道閃光
function faceOff(L, R) {
  const C = {
    castron: '#d8903a',
    aetheric: '#5ab8ff',
    veerwell: '#9be070',
    sancta: '#e0d070',
    zenith: '#e8eef4',
  };
  return {
    set: { k: 'black' },
    lb: false,
    koma: 2,
    st: {
      bg: '#050505',
      els: [
        PANEL(
          [
            [0, 0],
            [860, 0],
            [740, 900],
            [0, 900],
          ],
          {
            in: 'left',
            ind: 0.2,
            t0: 0.1,
            fill: C[L],
            dots: 0.35,
            kids: [ACT(L, { pose: 'p1', at: [420, 1900], h: 1800, in: null })],
          },
        ),
        PANEL(
          [
            [880, 0],
            [1600, 0],
            [1600, 900],
            [760, 900],
          ],
          {
            in: 'right',
            ind: 0.2,
            t0: 0.25,
            fill: C[R],
            dots: 0.35,
            kids: [ACT(R, { pose: 'p1', at: [1220, 1900], h: 1800, in: null })],
          },
        ),
        {
          k: 'block',
          q: [
            [850, 0],
            [880, 0],
            [770, 900],
            [740, 900],
          ],
          color: '#ffffff',
          in: 'wipe',
          ind: 0.15,
          t0: 0.45,
        },
        {
          k: 'text',
          s: '抉擇',
          at: [800, 470],
          size: 110,
          color: '#ffffff',
          stroke: '#000',
          sw: 10,
          t0: 0.6,
          in: 'stamp',
          ls: 16,
        },
      ],
    },
    ev: [
      { t: 0.1, sfx: 'thud1', vol: 0.7, rate: 0.8 },
      { t: 0.25, sfx: 'thud1', vol: 0.7, rate: 0.7 },
      { t: 0.6, sfx: 'heavy', vol: 0.8, rate: 0.5 },
      { t: 0.62, shake: 0.25 },
    ],
  };
}
// 目前的戰場：從主角身後看向出口的光柱、倒數（ov: 'choice'；ctx.opts＝出口，game/campaign.js 的 campChoiceCine）
function liveShot(opts) {
  return {
    set: { k: 'live' },
    lb: false,
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
  };
}
export function choicePreAnime(id, ctx = {}) {
  const TK = TALKS['pre_' + id];
  const opts = (ctx.opts || []).map((o, i) => ({ ...o, ex: i }));
  const T = timeline();
  T.add(faceOff(TK.L, TK.R), 2.4);
  const lines = [];
  const seen = {};
  TK.lines.forEach(([who, text]) => {
    const d = lenOf(text) + 0.4;
    lines.push([T.at + 0.35, text, d - 0.5, who]);
    T.add(speakerShot(who, who === TK.L ? 'L' : 'R', seen[who] || 0), d);
    seen[who] = (seen[who] || 0) + 1;
  });
  T.add(liveShot(opts), 4);
  placeLines(T, lines);
  dropAll(T);
  return T.def({
    title: '抉擇',
    music: [{ at: 0, track: 'cine_tension', vol: 0.8, fadeIn: 0.8, fadeOut: [T.at - 2.5, 2.5] }],
  });
}

// ---------- 選後 ----------
// 一鏡：3D 的地點＋插畫格／立繪＋一句
//   s：{ set, grade, cam: [CAMS 的鍵] 或鏡頭, actors, img, q（格子的位置 R／L／C）, tone, sfx（格子上的狀聲詞）,
//        who（立繪：[角色, 姿勢]，有 img 時放在格子裡、沒有時疊在 3D 上）, line: [說話者（null＝旁白）, 句子], dur }
function postShot(s, i) {
  const d = s.dur || lenOf(s.line && s.line[1]) + (s.img ? 1 : 0.4);
  const els = [];
  if (s.img) {
    const q = QS[s.q || 'R'];
    els.push(
      PANEL(q, {
        img: s.img,
        t0: 0.5,
        in: s.q === 'L' ? 'left' : s.q === 'C' ? 'drop' : 'right',
        dots: 0.25,
        tone: s.tone,
        kids: s.sfx
          ? [
              {
                k: 'text',
                s: s.sfx,
                at: [q[1][0] - 200, q[1][1] + 240],
                size: 190,
                color: '#ffe8c0',
                stroke: '#200800',
                rot: -0.1,
                t0: 0.8,
                in: 'stamp',
              },
            ]
          : [],
      }),
    );
  } else if (s.who) {
    const [who, pose] = s.who;
    els.push(
      ACT(who, {
        pose,
        at: s.at || [i % 2 ? 1080 : 560, 1240],
        h: s.h || 1180,
        in: 'fade',
        sp: s.sp,
        expr: s.expr,
      }),
    );
  }
  const cam = typeof s.cam === 'string' ? camOf(s.cam, d) : s.cam;
  const ev = s.sfx
    ? [
        { t: 0.8, sfx: 'boom1', vol: 0.6, rate: 0.5 },
        { t: 0.82, shake: 0.3 },
      ]
    : [];
  // 斷訊：最後半秒蓋上黑底的 NO SIGNAL
  if (s.cut) {
    els.push(
      { k: 'block', q: [0, 0, 1600, 900], color: '#050505', in: 'fade', ind: 0.08, t0: d - 0.55 },
      {
        k: 'text',
        s: 'NO SIGNAL',
        at: [800, 470],
        size: 54,
        font: 'mono',
        color: '#ff5a3a',
        stroke: null,
        t0: d - 0.5,
        in: 'fade',
        ls: 12,
      },
    );
    ev.push({ t: d - 0.6, sfx: 'glitch', vol: 0.4, rate: 1 });
  }
  return [
    {
      set: s.set,
      grade: s.grade,
      lb: false,
      fi: i === 0 ? 0.8 : 0.15,
      actors: s.actors,
      st: { els },
      cam,
      ev,
    },
    d,
  ];
}
function cardShot(card, color) {
  return {
    set: { k: 'black' },
    lb: false,
    fo: 1.2,
    st: {
      bg: '#050505',
      els: [
        { k: 'block', q: [0, 418, 1600, 6], color, in: 'wipe', ind: 0.4, t0: 0.2 },
        {
          k: 'text',
          s: card[0],
          at: [800, 380],
          size: 76,
          color: '#f4ece0',
          stroke: null,
          t0: 0.5,
          in: 'stamp',
          ls: 10,
        },
        {
          k: 'text',
          s: card[1],
          at: [800, 470],
          size: 26,
          font: 'mono',
          color,
          stroke: null,
          t0: 0.9,
          in: 'fade',
          ls: 14,
        },
      ],
    },
    ev: [{ t: 0.5, sfx: 'heavy', vol: 0.8, rate: 0.5 }],
  };
}
function montage(o) {
  const T = timeline();
  const lines = [];
  o.shots.forEach((s, i) => {
    const [shot, d] = postShot(s, i);
    if (s.line) lines.push([T.at + (s.img ? 1.0 : 0.4), s.line[1], d - 1.2, s.line[0]]);
    T.add(shot, d);
  });
  T.add(cardShot(o.card, o.color), 4.2);
  placeLines(T, lines);
  dropAll(T);
  const [track, off] = o.music;
  return T.def({
    title: o.card[0],
    music: [{ at: 0, track, off, vol: 0.8, fadeIn: 0.8, fadeOut: [T.at - 2.5, 2.5] }],
  });
}
// 委託方在自己的室內（中景、疊在 3D 上）
const room = (who, pose, line, o = {}) => {
  const [set, grade, p, l, actors] = CLIENT_ROOM[who];
  return {
    set,
    grade,
    actors: actors(),
    who: [who, pose],
    line,
    cam: {
      fov: 40,
      dof: 1,
      focus: 1.2,
      range: 0.6,
      ease: 'lin',
      keys: [
        { t: 0, p: [p[0] * 1.6, p[1] + 0.1, p[2] + 1.2], l },
        { t: 6, p: [p[0] * 1.3, p[1] + 0.05, p[2] + 0.6], l },
      ],
    },
    ...o,
  };
};
// 室內的遠景＋插畫格
const roomPanel = (who, img, line, o = {}) => {
  const [set, grade, p, l, actors] = CLIENT_ROOM[who];
  return {
    set,
    grade: { ...grade, exposure: (grade.exposure || ROOM_GRADE.exposure) * 1.1 },
    actors: actors(),
    img,
    line,
    cam: {
      fov: 46,
      ease: 'lin',
      keys: [
        { t: 0, p: [p[0] * 2.2, p[1] + 0.3, p[2] + 2.6], l },
        { t: 6, p: [p[0] * 2, p[1] + 0.3, p[2] + 2.2], l },
      ],
    },
    ...o,
  };
};
const N = (t) => [null, t];
const CAST_C = '#d8903a',
  AETH_C = '#5ab8ff',
  VEER_C = '#9be070',
  SANC_C = '#e0d070';

// 抉擇 1：主壩交給卡斯特隆
export const c2CastronAnime = () =>
  montage({
    music: ['cine_c2', 30],
    color: CAST_C,
    card: ['你守住了合約。', 'CONTRACT FULFILLED'],
    shots: [
      { set: DAMN, grade: DUSK, cam: 'dam', img: 'cx/x2_gate', sfx: '轟', line: N('閘門，一道一道關上。') },
      { set: DAMN, grade: DUSK, cam: 'damUp', img: 'cx/x2_dry', q: 'L', line: N('下游的河道，開始乾涸。') },
      { set: YARD, grade: DUSK, cam: 'yard', img: 'cx/x2_lights', line: N('工業帶的燈，一盞一盞亮起。') },
      roomPanel('castron', 'cx/x2_feast', N('工廠的燈亮了。霍斯特在慶功宴上說：「這個傭兵守約。」')),
      {
        set: DAMN,
        grade: DUSK,
        cam: 'dam',
        img: 'cx/x2_dry',
        tone: '#6a7a90',
        q: 'L',
        line: N('下游的閘門一直沒開。那個冬天，三座城鎮撐不下去。'),
      },
      {
        set: DAMN,
        grade: DUSK,
        cam: 'damUp',
        img: 'cx/x2_refugees',
        q: 'C',
        line: N('數千人背著行李往西走，走進冰原。'),
      },
    ],
  });
// 抉擇 1：主壩交給艾瑟立克（背叛卡斯特隆）
export const c2AethericAnime = () =>
  montage({
    music: ['cine_c2', 30],
    color: AETH_C,
    card: ['你背叛了委託方。', 'CONTRACT BROKEN'],
    shots: [
      { set: DAMN, grade: DUSK, cam: 'dam', img: 'cx/x2_cooling', line: N('主壩的電力，轉向研究機構。') },
      {
        set: DAMN,
        grade: DUSK,
        cam: 'damUp',
        img: 'cx/x2_dry',
        q: 'L',
        line: N('水庫變成冷卻槽，下游的河道乾了。'),
      },
      roomPanel('aetheric', 'cx/x2_sakki', N('研究所的燈亮了。薩奇在報告上寫：「樣本的選擇符合預測。」'), {
        q: 'L',
      }),
      {
        set: YARD,
        grade: DUSK,
        cam: 'yard',
        img: 'cx/x2_wanted',
        line: N('卡斯特隆的懸賞令，貼滿了工業帶。'),
      },
      {
        set: YARD,
        grade: { ...DUSK, contrast: 1.3, sunEl: 40, exposure: 0.85, bloom: 0.6 },
        actors: [{ id: 'sv', k: 'ace', key: 'stevedore', p: [-5, -4], yaw: 160, s: [{ t: 0, chk: true }] }],
        who: ['stevedore', 'p1'],
        expr: 'angry',
        at: [1180, 1240],
        line: ['stevedore', '叛徒。我會親手把你拆了。'],
        cam: {
          fov: 30,
          hand: 0.04,
          keys: [
            { t: 0, p: { a: 'sv', at: 'base', o: [-3, 0.4, 7] }, l: { a: 'sv', o: [0, 1.5, 0] } },
            {
              t: 4.5,
              p: { a: 'sv', at: 'base', o: [-2.4, 0.35, 5.2] },
              l: { a: 'sv', o: [1, 2.2, 0] },
              fov: 26,
            },
          ],
        },
      },
      {
        set: DAMN,
        grade: DUSK,
        cam: 'damUp',
        img: 'cx/x2_refugees',
        q: 'C',
        line: N('數千人背著行李往西走，走進冰原。'),
      },
    ],
  });
// 抉擇 2：發射設施交給維爾威
export const c4VeerwellAnime = () =>
  montage({
    music: ['cine_c4', 20],
    color: VEER_C,
    card: ['人類回到了天空。', 'LAUNCH AUTHORIZED'],
    shots: [
      roomPanel('veerwell', 'cx/x4_press', N('發射設施的燈亮了。派克在記者會上說：「人類重新回到了天空。」')),
      {
        set: PORT,
        grade: DAY,
        cam: 'portUp',
        img: 'cx/x4_launch',
        sfx: '轟',
        q: 'L',
        line: N('外圍的聚落，被尾焰掃過。'),
      },
      roomPanel('sancta', 'cx/x4_ash', N('聖域的人，在灰裡找名字。')),
      room('sancta', 'p6', null, { dur: 4, h: 1900, at: [720, 1820] }),
    ],
  });
// 抉擇 2：發射設施交給聖域
export const c4SanctaAnime = () =>
  montage({
    music: ['cine_c4', 20],
    color: SANC_C,
    card: ['發射台沉默了。', 'LAUNCH SEALED'],
    shots: [
      {
        set: PORT,
        grade: DAY,
        cam: 'port',
        img: 'cx/x4_gate',
        sfx: '鏗',
        line: N('發射設施的大門，關上了。'),
      },
      roomPanel('sancta', 'cm/m_shelter', N('發射設施被封了起來，聖域的人輪流守著門。'), { q: 'L' }),
      room('sancta', 'p9', ['sancta', '……謝謝你。我不知道該怎麼……謝謝你。']),
      {
        set: PORT,
        grade: DAY,
        cam: 'portUp',
        img: 'cx/x4_planes',
        line: N('維爾威的運輸機，一架一架往東飛。'),
      },
      room('veerwell', 'p7', null, { dur: 4, h: 1900, at: [720, 1820] }),
    ],
  });
// 最後的抉擇：交出軌道站
export const c6OpenAnime = () =>
  montage({
    music: ['cine_c6', 40],
    color: '#e8eef4',
    card: ['這顆星球有一段訊號。', 'PROTOCOL EXECUTED'],
    shots: [
      { set: CORE, grade: COREG, cam: 'core', img: 'cx/x6_core', line: N('四家代表，走進中樞。') },
      {
        set: CORE,
        grade: { ...COREG, exposure: 0.9 },
        cam: 'coreTop',
        img: 'cm/m_button',
        tone: '#c04030',
        q: 'C',
        line: ['station', '認證完成。KEY-07。封鎖線協定，執行。'],
      },
      { set: ORB, grade: ORBG, cam: 'orbSky', img: 'cx/x6_signal', q: 'C', sfx: '——', dur: 4.5 },
    ],
  });
// 最後的抉擇：讓軌道站墜落
export const c6SealAnime = () =>
  montage({
    music: ['cine_c6', 40],
    color: '#ffb070',
    card: ['天空，安靜了。', 'SILENT SKY'],
    shots: [
      { set: ORB, grade: ORBG, cam: 'orb', img: 'cm/m_station', line: N('你切斷了站的姿態控制。') },
      {
        set: ORB,
        grade: { ...ORBG, tintHi: '#ffb070', tintHiK: 0.5 },
        cam: 'orbSky',
        img: 'cx/x6_fall',
        sfx: '轟',
        q: 'C',
        line: N('軌道站拖著長長的火光，往雲海落下去。'),
      },
      room('sancta', 'p9', ['sancta', '……謝謝你。結束了。終於結束了。']),
      {
        set: ORB,
        grade: ORBG,
        cam: 'orb',
        img: 'cx/x6_signal',
        tone: '#c04030',
        q: 'L',
        line: ['station', '封鎖線協定，強制執行。'],
      },
      { set: ORB, grade: { ...ORBG, exposure: 1.1 }, cam: 'orbSky', img: 'cx/x6_sky', q: 'C', dur: 4.5 },
    ],
  });
// 最後的抉擇：第三扇門（真結局）。四家各在自己的室內喊住你（一句一句斷訊）→ ECHO「我們走吧」→ 站離開
export const c6BeyondAnime = () =>
  montage({
    music: ['cine_c6', 40],
    color: '#ffd7a0',
    card: ['這一次，照我們的節奏來。', 'BEYOND'],
    shots: [
      room('castron', 'p6', ['castron', '傭兵，等等——'], { dur: 3.4, cut: true }),
      room('aetheric', 'p9', ['aetheric', 'R-07，你沒有權限——'], { dur: 3.4, cut: true }),
      room('veerwell', 'p8', ['veerwell', '喂，你要把它開去哪——'], { dur: 3.4, cut: true }),
      room('sancta', 'p9', ['sancta', '……去吧。我會記下你的名字。'], { dur: 4.2, cut: true }),
      {
        set: CORE,
        grade: COREG,
        cam: 'coreTop',
        who: ['echo_true', 'p8'],
        sp: 'echo',
        at: [1080, 1240],
        line: ['echo', '我們走吧。'],
        dur: 4,
      },
      {
        set: ORB,
        grade: ORBG,
        cam: 'orbSky',
        img: 'cx/x6_thrust',
        q: 'L',
        line: N('軌道站的推進器，一個接一個亮起。'),
      },
      {
        set: ORB,
        grade: { ...ORBG, exposure: 1.1 },
        cam: 'orb',
        img: 'cm/m_station',
        q: 'C',
        line: N('星球在背後，慢慢變小。'),
      },
    ],
  });
