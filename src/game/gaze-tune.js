// Game：眼動追蹤的調校視窗（docs/gaze-design.md 的「調校」；參考 LookPilot 的 Tracking settings，只參考操作設計、自己實作）。
// 分頁：總覽（攝影機畫面與特徵點、頭部的輸入與鏡頭的輸出、偵測的狀態、全域的靈敏度／平滑度／死區）、頭部左右、頭部上下
// （對應曲線與每個軸的設定）、眼睛（校準、快速修正偏移、注視點的平滑與眨眼門檻）、攝影機、設定組合（內建＋自己的、匯出入）。
// 調校存在 ctrl.gaze.tune（core/gaze.js 的 tuneSanitize），設定組合存在 localStorage mech_cordon_gaze_presets；
// 置中位置與校準結果和裝置、坐姿有關，不放進設定組合。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { clamp } from '../core/math.js';
import { HEAD_V, OUT_K, TUNE_DEF, axisMap, curveEval, tuneSanitize } from '../core/gaze.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const PRESET_KEY = 'mech_cordon_gaze_presets';
const D2R = Math.PI / 180;
const TABS = [
  ['ov', '總覽'],
  ['yaw', '頭部左右'],
  ['pitch', '頭部上下'],
  ['eye', '眼睛'],
  ['cam', '攝影機'],
  ['pre', '設定組合'],
];
// 內建的設定組合（蓋在預設值上）
const BUILTIN = [
  ['標準', {}],
  [
    '穩定（中間精準）',
    {
      g: { sens: 0.9, smooth: 1.6, dead: 1.5 },
      yaw: {
        pos: [
          [0, 0],
          [0.45, 0.18],
          [1, 1],
        ],
        neg: [
          [0, 0],
          [0.45, 0.18],
          [1, 1],
        ],
      },
      pitch: {
        pos: [
          [0, 0],
          [0.45, 0.18],
          [1, 1],
        ],
        neg: [
          [0, 0],
          [0.45, 0.18],
          [1, 1],
        ],
      },
    },
  ],
  ['靈敏', { g: { sens: 1.4, smooth: 0.6, dead: 0.6 } }],
  ['戴眼鏡／光線差', { g: { smooth: 2.2, dead: 2 }, eye: { smooth: 1.8, blink: 0.4 } }],
];
// 曲線的形狀
const SHAPES = [
  [
    'lin',
    '直線',
    [
      [0, 0],
      [1, 1],
    ],
    '輸入與輸出 1：1',
  ],
  [
    'prec',
    '精準',
    [
      [0, 0],
      [0.45, 0.18],
      [1, 1],
    ],
    '中間平、外側陡：小動作時穩，大轉頭時快',
  ],
  [
    'fast',
    '快速',
    [
      [0, 0],
      [0.35, 0.62],
      [1, 1],
    ],
    '一開始就快：小小轉頭就看得很遠',
  ],
  [
    'half',
    '範圍減半',
    [
      [0, 0],
      [1, 0.5],
    ],
    '最多只看一半的角度',
  ],
];
const merge = (a, b) => {
  const o = JSON.parse(JSON.stringify(a));
  for (const k in b || {})
    o[k] = b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) ? merge(o[k] || {}, b[k]) : b[k];
  return o;
};
const builtinTune = (i) => tuneSanitize(merge(TUNE_DEF, BUILTIN[i][1]));
const same = (a, b) => JSON.stringify(tuneSanitize(a)) === JSON.stringify(tuneSanitize(b));
const fmt = (v, st) => (st >= 1 ? String(Math.round(v)) : st >= 0.1 ? v.toFixed(1) : v.toFixed(2));
const pathGet = (o, p) => p.split('.').reduce((a, k) => (a ? a[k] : undefined), o);
const pathSet = (o, p, v) => {
  const ks = p.split('.');
  let a = o;
  for (let i = 0; i < ks.length - 1; i++) a = a[ks[i]];
  a[ks[ks.length - 1]] = v;
};
// 臉部輪廓、眼睛、鼻子的特徵點（預覽用）
const LM_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149,
  150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
const LM_EYE = [33, 133, 159, 145, 263, 362, 386, 374, 1];

function loadPresets() {
  try {
    const a = JSON.parse(localStorage.getItem(PRESET_KEY) || '[]');
    return Array.isArray(a)
      ? a
          .filter((p) => p && typeof p.name === 'string')
          .map((p) => ({ name: p.name.slice(0, 40), t: tuneSanitize(p.t) }))
      : [];
  } catch (e) {
    return [];
  }
}
function savePresets(list) {
  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(list));
  } catch (e) {}
}

Object.assign(Game.prototype, {
  gazeTuneOpen(tab) {
    if (this.gzTune) return;
    const el = document.createElement('div');
    el.id = 'gazeTune';
    el.innerHTML =
      `<div class="gtPanel"><div class="gtHead"><h3>眼動追蹤的調校</h3><span id="gtNow" class="dim"></span>` +
      `<button id="gtClose">關閉</button></div><div class="gtMain">` +
      `<div class="gtLive" data-desc="即時追蹤：攝影機畫面與特徵點、頭部的輸入（框＝死區，外框＝最大輸入）、鏡頭的輸出，以及模擬的鏡頭畫面；在每個分頁調整時都看得到效果">` +
      `<div class="gtVidWrap"><div class="gtVid"></div><canvas id="gtLm"></canvas></div>` +
      `<div id="gtStat" class="dim"></div>` +
      `<div class="gtPlots"><div><canvas id="gtIn" width="116" height="116"></canvas><small>頭部（輸入）</small></div>` +
      `<div><canvas id="gtOut" width="116" height="116"></canvas><small>鏡頭（輸出）</small></div></div>` +
      `<div class="gtViewWrap"><canvas id="gtView" width="240" height="120"></canvas><small id="gtViewCap">鏡頭看出去（模擬）</small></div>` +
      `<div class="row gtBtns"><button id="gtCenter" data-desc="把現在的頭部姿勢當成中心（任務中的快速鍵：按鍵設定的「眼動：頭部置中」）">置中</button>` +
      `<button id="gtPause" data-desc="暫停頭部追蹤：鏡頭停在現在的位置，再按一次繼續（任務中的快速鍵：「眼動：暫停頭部追蹤」）">暫停</button>` +
      `<button id="gtReopen2" data-desc="關掉再重新開啟攝影機（畫面卡住、換了攝影機時）">重開攝影機</button></div></div>` +
      `<div class="gtSide"><div id="gtTabs" data-padtabs="button">${TABS.map(([k, n]) => `<button data-gt="${k}">${n}</button>`).join('')}</div>` +
      `<div id="gtBody"></div></div></div><div id="gtDesc"></div></div><div id="gtGaze"></div>`;
    this.gazeLayer().appendChild(el);
    const T = (this.gzTune = {
      el,
      tab: tab || 'ov',
      side: 'pos',
      sel: 1,
      ren: -1,
      last: performance.now(),
      sim: 0,
    });
    for (const b of el.querySelectorAll('#gtTabs button')) b.onclick = () => this.gazeTuneTab(b.dataset.gt);
    $('gtClose').onclick = () => this.gazeTuneClose();
    $('gtCenter').onclick = () => {
      if (!this.gazeCenter()) this.gazeTuneNote('找不到臉，不能置中');
      T.simY = T.simP = 0;
    };
    $('gtPause').onclick = () => this.gazePauseToggle();
    $('gtReopen2').onclick = () => this.gazeCamRestart();
    const body = $('gtBody');
    body.addEventListener('input', (e) => this.gazeTuneInput(e, false));
    body.addEventListener('change', (e) => this.gazeTuneInput(e, true));
    const desc = (e) => this.gazeTuneDesc(e.target);
    el.addEventListener('pointerover', desc);
    el.addEventListener('focusin', desc);
    T.key = (e) => {
      if (e.key !== 'Escape' || this.gzCal || this.gzDrift || this.uiModalOn) return;
      e.stopPropagation();
      e.preventDefault();
      this.gazeTuneClose();
    };
    addEventListener('keydown', T.key, true);
    this.gzState().tried = true;
    this.gazeStart().then(() => this.gzTune === T && this.gazeVideoHome());
    this.gazeTuneTab(T.tab);
    this.gazeTuneDesc(null);
    const loop = () => {
      if (this.gzTune !== T) return;
      requestAnimationFrame(loop);
      this.gazeTuneDraw();
    };
    requestAnimationFrame(loop);
    SFX.ui();
  },
  gazeTuneClose() {
    const T = this.gzTune;
    if (!T) return;
    this.gzTune = null;
    removeEventListener('keydown', T.key, true);
    this.gazeVideoHome();
    T.el.remove();
    if (!this.gazeCfg().on && !this.gazeBusy()) this.gazeStop();
    this.renderGazeSettings();
  },
  gazeTuneTab(k) {
    const T = this.gzTune;
    if (!T) return;
    T.tab = k;
    T.ren = -1;
    for (const b of T.el.querySelectorAll('#gtTabs button')) b.classList.toggle('on', b.dataset.gt === k);
    this.gazeTuneRender();
    $('gtBody').scrollTop = 0;
  },
  gazeTuneDesc(t) {
    const box = $('gtDesc');
    if (!box) return;
    const el = t && t.closest && t.closest('#gazeTune [data-desc]');
    box.textContent = el
      ? el.dataset.desc
      : '滑鼠停在項目上（或用手把選到）時這裡顯示說明。改的設定立刻生效，也會記住。';
  },
  // ---------- 各分頁的內容 ----------
  gazeTuneRender() {
    const T = this.gzTune;
    if (!T) return;
    const t = this.gazeTune();
    const C = this.gazeCfg();
    const sl = (path, label, min, max, st, unit, desc) => {
      const v = pathGet(t, path);
      return (
        `<div class="krow" data-desc="${escHtml(desc)}"><span>${label}</span><span class="gtSl">` +
        `<input type="range" data-t="${path}" min="${min}" max="${max}" step="${st}" value="${v}" />` +
        `<b data-v="${path}">${fmt(v, st)}${unit}</b></span></div>`
      );
    };
    const ck = (path, label, desc, src = 't') => {
      const v = src === 't' ? pathGet(t, path) : C[path];
      return `<div class="krow" data-desc="${escHtml(desc)}"><span>${label}</span><label><input type="checkbox" data-${src === 't' ? 't' : 'gc'}="${path}" ${v ? 'checked' : ''} /> 開啟</label></div>`;
    };
    const mode = C.headMode === 'rate' ? 'rate' : 'offset';
    let h = '';
    if (T.tab === 'ov') {
      h =
        `<p class="dim" style="font-size:12px;margin:0 0 6px">轉轉頭，看左邊的「頭部」點和「鏡頭看出去」怎麼動；一邊調下面的數值一邊看效果。</p>` +
        `<div class="row gtBtns"><button id="gtCal" data-desc="看著畫面上的點讓注視點對上畫面（看哪鎖哪要先校準）">開始校準…</button></div>` +
        `<h4>頭部延伸視角</h4>` +
        `<div class="krow" data-desc="偏移＝頭轉幾度鏡頭就多看幾度，頭擺正回到原位（像 TrackIR）；速度＝頭偏著鏡頭就一直往那邊轉，頭擺正就停"><span>方式</span><select data-gc="headMode"><option value="offset" ${mode === 'offset' ? 'selected' : ''}>偏移（預設）</option><option value="rate" ${mode === 'rate' ? 'selected' : ''}>速度</option></select></div>` +
        ck('head', '頭部延伸視角', '追尾視角與第一人稱時轉頭＝鏡頭跟著轉（和設定裡的開關相同）', 'c') +
        sl(
          'g.sens',
          '靈敏度（全域）',
          0.1,
          5,
          0.1,
          '',
          '所有軸的靈敏度倍率；越大轉一點頭鏡頭就轉越多（每個軸還有自己的倍率）',
        ) +
        sl(
          'g.smooth',
          '平滑度（全域）',
          0,
          3,
          0.1,
          '',
          '越大越穩、但反應越慢；畫面會抖時調大，覺得延遲時調小',
        ) +
        sl(
          'g.dead',
          '死區（全域）',
          0,
          3,
          0.1,
          '',
          '頭在中心附近小動時鏡頭不動；1＝2°。畫面會飄或抖時調大（1.5～2）',
        ) +
        ck('g.follow', '自動跟上坐姿', '頭擺正時中心慢慢跟上坐姿的改變（關掉時只有按「置中」才改）');
    } else if (T.tab === 'yaw' || T.tab === 'pitch') {
      const k = T.tab;
      const A = t[k];
      const sides = k === 'yaw' ? ['往左', '往右'] : ['往上', '往下'];
      h =
        ck(`${k}.on`, '這個軸', k === 'yaw' ? '頭左右轉＝鏡頭左右轉' : '頭上下轉＝鏡頭上下轉') +
        `<div class="gtCurveRow"><canvas id="gtCurve" tabindex="0" width="380" height="250" data-desc="對應曲線：橫軸＝頭轉的角度，縱軸＝鏡頭的輸出；陡＝快、平＝慢。滑鼠左鍵加點或拖曳、右鍵刪除；觸控點一下加點、拖曳、長按刪除；手把 A 換選取的點、十字鍵移動、X 刪除"></canvas>` +
        `<div class="gtCurveSide">` +
        (A.asym
          ? `<div class="row gtSide" data-desc="不對稱：兩個方向各自一條曲線">${['pos', 'neg']
              .map(
                (s, i) =>
                  `<button data-side="${s}" class="${T.side === s ? 'on' : ''}">編輯${sides[i]}</button>`,
              )
              .join('')}</div>`
          : '') +
        `<div class="gtShapes">${SHAPES.map(([id, n, , d]) => `<button data-shape="${id}" data-desc="${escHtml(d)}">${n}</button>`).join('')}</div>` +
        `<div class="row"><button id="gtAdd" data-desc="在選取的點和下一個點中間加一個點">加一個點</button><button id="gtDel" data-desc="刪除選取的點（頭尾兩點不能刪）">刪除點</button></div>` +
        `<small class="dim">藍色的線＝現在頭的位置；灰色區＝死區。</small></div></div>` +
        sl(
          `${k}.sens`,
          '靈敏度',
          0.1,
          5,
          0.1,
          '',
          '這個軸的靈敏度（乘在全域的上面）；改它會讓整條曲線等比例變高或變低',
        ) +
        sl(
          `${k}.maxIn`,
          '最大輸入',
          5,
          60,
          1,
          '°',
          '頭要轉多大才到曲線的盡頭；脖子不方便轉或想小動作就看很遠時調小',
        ) +
        sl(`${k}.dead`, '死區', 0, 2, 0.05, '', '這個軸的死區倍率（乘在全域的上面）；這個軸比較會飄時調大') +
        sl(
          `${k}.smooth`,
          '平滑度',
          0,
          2,
          0.05,
          '',
          '這個軸的平滑倍率（乘在全域的上面）；這個軸比較抖時調大',
        ) +
        (mode === 'offset'
          ? sl(`${k}.off`, '偏移', -45, 45, 1, '°', '鏡頭的中心多偏一個固定的角度（攝影機沒放正、斜坐時用）')
          : '') +
        ck(`${k}.inv`, '反向', '方向反過來（頭往左、鏡頭往右）') +
        ck(`${k}.asym`, '不對稱', `${sides[0]}與${sides[1]}各自一條曲線（例如往下看要比往上看慢）`);
    } else if (T.tab === 'eye') {
      const g = this.gz;
      const cal = g && g.cal;
      h =
        `<div class="krow"><span>校準</span><span class="dim" style="font-size:12px">${
          cal
            ? `已校準（平均誤差約 ${Math.round(cal.err)} px，${new Date(cal.t).toLocaleDateString()}）${cal.bias ? '・已修正偏移' : ''}`
            : '尚未校準'
        }</span></div>` +
        `<div class="row gtBtns"><button id="gtCal2" data-desc="看 9 個點再驗證 5 個點（約 25 秒）；結果圖上紅色的點可以只重做那幾點">開始校準…</button>` +
        `<button id="gtDrift" ${cal ? '' : 'disabled'} data-desc="注視點整體偏了（換了坐姿、眼鏡滑下來）時：看著畫面中央的點 2 秒，只修正偏差，不用重新校準">快速修正偏移</button>` +
        `<button id="gtDriftClr" ${cal && cal.bias ? '' : 'disabled'} data-desc="拿掉快速修正的偏移">清除偏移修正</button></div>` +
        `<div class="gtCalWrap" data-desc="上一次校準的驗證結果：圈＝目標、點＝預測的位置；綠＝很好、黃＝可以用、紅＝差"><canvas id="gtCalPlot" width="320" height="180"></canvas></div>` +
        sl(
          'eye.smooth',
          '注視點的平滑度',
          0.3,
          3,
          0.1,
          '',
          '越大注視點越穩、但跟得越慢（看哪鎖哪的停留圈跳來跳去時調大）',
        ) +
        sl(
          'eye.blink',
          '眨眼門檻',
          0.2,
          0.8,
          0.05,
          '',
          '眼睛閉到多少算眨眼（眨眼時不更新注視點與頭部）；戴眼鏡常被誤判成眨眼時調大',
        ) +
        ck('dot', '顯示注視點', '任務中畫出眼睛看的位置（調整用）；這一頁開著時一律顯示', 'c');
    } else if (T.tab === 'cam') {
      const cam = this.gazeCam();
      const v = this.gz && this.gz.video;
      h =
        `<div class="krow" data-desc="要用哪一個攝影機（第一次要先允許攝影機的權限才看得到名稱）"><span>攝影機</span><select id="gtDev"><option value="">預設（前鏡頭）</option></select></div>` +
        `<div class="krow" data-desc="720p 比較準、距離遠時也抓得到臉，但比較吃效能；偵測的頻率比解析度重要"><span>解析度</span><select id="gtRes"><option value="480" ${cam.res !== '720' ? 'selected' : ''}>640×480（預設）</option><option value="720" ${cam.res === '720' ? 'selected' : ''}>1280×720</option></select></div>` +
        `<div class="krow" data-desc="預覽畫面左右翻轉，像照鏡子（不影響追蹤）"><span>預覽鏡像</span><label><input type="checkbox" id="gtMir" ${cam.mirror ? 'checked' : ''} /> 開啟</label></div>` +
        `<div class="krow"><span>目前</span><span class="dim" style="font-size:12px">${v && v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : '尚未開啟'}</span></div>` +
        `<div class="row gtBtns"><button id="gtReopen" data-desc="關掉再重新開啟攝影機（換了攝影機或畫面卡住時）">重新開啟攝影機</button></div>` +
        `<p class="dim" style="font-size:12px">攝影機放在螢幕上方中央、和眼睛差不多高；臉的前面要有光（背光會暗）；坐在離螢幕 50～70 cm。</p>`;
    } else if (T.tab === 'pre') {
      const list = loadPresets();
      const row = (name, i, user) => {
        const tt = user ? list[i].t : builtinTune(i);
        const cur = same(tt, t);
        if (user && T.ren === i)
          return `<div class="krow gtPre"><input id="gtRenIn" maxlength="40" value="${escHtml(name)}" /><span class="row"><button id="gtRenOk" class="primary">確定</button><button id="gtRenNo">取消</button></span></div>`;
        return (
          `<div class="krow gtPre ${cur ? 'cur' : ''}"><span>${escHtml(name)}${cur ? '<em>（使用中）</em>' : ''}${user ? '' : ' <small class="dim">內建</small>'}</span><span class="row">` +
          `<button data-apply="${user ? 'u' : 'b'}${i}">套用</button>` +
          (user
            ? `<button data-ren="${i}">改名</button><button data-del="${i}">刪除</button><button data-exp="${i}">匯出</button>`
            : '') +
          '</span></div>'
        );
      };
      h =
        `<h4>內建</h4>${BUILTIN.map(([n], i) => row(n, i, false)).join('')}` +
        `<h4>我的設定組合</h4>${list.length ? list.map((p, i) => row(p.name, i, true)).join('') : '<p class="dim" style="font-size:12px">還沒有。調好之後在下面存成新的設定組合。</p>'}` +
        `<div class="krow" data-desc="把現在的調校（靈敏度、平滑度、死區、曲線、眼睛的設定）存成一組；置中位置與校準結果不會存進去"><input id="gtNewName" maxlength="40" placeholder="名稱（例如：晚上、戴眼鏡）" /><span class="row"><button id="gtSaveNew">存成新的設定組合</button><button id="gtImport">匯入檔案…</button></span></div>` +
        `<p class="dim" style="font-size:11px">匯出的檔案（.mech-cordon-gaze.json）可以給別人匯入；置中位置與校準結果和攝影機、坐姿有關，不會放進設定組合。</p>` +
        `<input type="file" id="gtFile" accept=".json,application/json" hidden />`;
    }
    $('gtBody').innerHTML = h;
    this.gazeTuneBind();
    this.gazeTuneNow();
  },
  // 標題旁邊：目前的調校符合哪一個設定組合
  gazeTuneNow() {
    const el = $('gtNow');
    if (!el) return;
    const t = this.gazeTune();
    const b = BUILTIN.findIndex((_, i) => same(builtinTune(i), t));
    const u = b < 0 ? loadPresets().find((p) => same(p.t, t)) : null;
    el.textContent = '設定組合：' + (b >= 0 ? BUILTIN[b][0] : u ? u.name : '自訂');
  },
  gazeTuneBind() {
    const T = this.gzTune;
    const on = (id, fn) => {
      const e = $(id);
      if (e) e.onclick = fn;
    };
    on('gtCal', () => this.gazeCalOpen());
    on('gtCal2', () => this.gazeCalOpen());
    on('gtDrift', () =>
      this.gazeDriftOpen((ok) => this.gazeTuneNote(ok ? '已修正偏移' : '沒有偵測到臉，偏移沒有修正', true)),
    );
    on('gtDriftClr', () => {
      const g = this.gz;
      if (g && g.cal) {
        delete g.cal.bias;
        try {
          localStorage.setItem('mech_cordon_gaze', JSON.stringify(g.cal));
        } catch (e) {}
      }
      this.gazeTuneRender();
    });
    on('gtAdd', () => this.gazeCurveAdd());
    on('gtDel', () => this.gazeCurveDel());
    on('gtReopen', () => this.gazeCamRestart());
    for (const b of T.el.querySelectorAll('[data-side]'))
      b.onclick = () => {
        T.side = b.dataset.side;
        T.sel = 1;
        this.gazeTuneRender();
      };
    for (const b of T.el.querySelectorAll('[data-shape]'))
      b.onclick = () => {
        const sh = SHAPES.find((s) => s[0] === b.dataset.shape);
        this.gazeCurveEdit((c) => c.splice(0, c.length, ...sh[2].map((p) => [...p])));
        T.sel = 1;
      };
    const cv = $('gtCurve');
    if (cv) this.gazeCurveBind(cv);
    // 攝影機
    const dev = $('gtDev');
    if (dev) {
      const cam = this.gazeCam();
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices)
        navigator.mediaDevices
          .enumerateDevices()
          .then((ds) => {
            if (!$('gtDev')) return;
            const vs = ds.filter((d) => d.kind === 'videoinput');
            dev.innerHTML =
              '<option value="">預設（前鏡頭）</option>' +
              vs
                .map(
                  (d, i) =>
                    `<option value="${escHtml(d.deviceId)}">${escHtml(d.label || '攝影機 ' + (i + 1))}</option>`,
                )
                .join('');
            dev.value = vs.some((d) => d.deviceId === cam.id) ? cam.id : '';
          })
          .catch(() => {});
      dev.onchange = () => this.gazeCamSet({ id: dev.value });
      $('gtRes').onchange = (e) => this.gazeCamSet({ res: e.target.value });
      $('gtMir').onchange = (e) => {
        this.gazeSet('cam', Object.assign(this.gazeCam(), { mirror: e.target.checked }));
      };
    }
    // 設定組合
    const list = () => loadPresets();
    for (const b of T.el.querySelectorAll('[data-apply]'))
      b.onclick = () => {
        const u = b.dataset.apply[0] === 'u',
          i = +b.dataset.apply.slice(1);
        const L = list();
        this.gazeTuneSet(u ? L[i].t : builtinTune(i));
        this.gazeTuneNote(`已套用「${u ? L[i].name : BUILTIN[i][0]}」`, true);
      };
    for (const b of T.el.querySelectorAll('[data-ren]'))
      b.onclick = () => {
        T.ren = +b.dataset.ren;
        this.gazeTuneRender();
        const inp = $('gtRenIn');
        if (inp) inp.focus();
      };
    on('gtRenNo', () => {
      T.ren = -1;
      this.gazeTuneRender();
    });
    on('gtRenOk', () => {
      const L = list();
      const n = ($('gtRenIn').value || '').trim().slice(0, 40);
      if (n && L[T.ren]) L[T.ren].name = n;
      savePresets(L);
      T.ren = -1;
      this.gazeTuneRender();
    });
    for (const b of T.el.querySelectorAll('[data-del]'))
      b.onclick = () => {
        const i = +b.dataset.del;
        const L = list();
        if (!L[i]) return;
        this.uiConfirm(
          `刪除設定組合「${L[i].name}」？`,
          () => {
            L.splice(i, 1);
            savePresets(L);
            this.gazeTuneRender();
          },
          '刪除',
          '取消',
        );
      };
    for (const b of T.el.querySelectorAll('[data-exp]'))
      b.onclick = () => {
        const p = list()[+b.dataset.exp];
        if (p) this.gazePresetExport(p);
      };
    on('gtSaveNew', () => {
      const L = list();
      let n = ($('gtNewName').value || '').trim().slice(0, 40) || '我的設定 ' + (L.length + 1);
      if (L.some((p) => p.name === n)) n += '（' + (L.length + 1) + '）';
      L.push({ name: n, t: this.gazeTune() });
      savePresets(L);
      this.gazeTuneRender();
      this.gazeTuneNote(`已存成「${n}」`);
    });
    on('gtImport', () => $('gtFile').click());
    const f = $('gtFile');
    if (f)
      f.onchange = () => {
        const file = f.files && f.files[0];
        if (!file) return;
        file
          .text()
          .then((txt) => this.gazePresetImport(txt, file.name))
          .catch(() => this.gazeTuneNote('讀不到這個檔案'));
      };
  },
  // 匯出：{ app, v, name, tune }
  gazePresetExport(p) {
    const txt = JSON.stringify({ app: 'mech-cordon-gaze', v: 1, name: p.name, tune: p.t }, null, 1);
    this.gzLastExport = txt; // 冒煙測試讀
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    a.download = p.name.replace(/[\\/:*?"<>|]/g, '_') + '.mech-cordon-gaze.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  gazePresetImport(txt, fname) {
    let o = null;
    try {
      o = JSON.parse(txt);
    } catch (e) {}
    if (!o || (o.app !== 'mech-cordon-gaze' && o.app !== 'rubicon-gaze') || !o.tune) {
      this.gazeTuneNote('不是眼動追蹤的設定組合檔案');
      return false;
    }
    const L = loadPresets();
    let n = String(o.name || fname || '匯入的設定').slice(0, 40);
    if (L.some((p) => p.name === n)) n += '（匯入）';
    L.push({ name: n, t: tuneSanitize(o.tune) });
    savePresets(L);
    if (this.gzTune) this.gazeTuneRender();
    this.gazeTuneNote(`已匯入「${n}」`);
    return true;
  },
  gazeTuneNote(t, rerender) {
    if (rerender && this.gzTune) this.gazeTuneRender();
    const box = $('gtDesc');
    if (box) box.textContent = t;
  },
  // 滑桿、勾選框：data-t＝調校的欄位、data-gc＝ctrl.gaze 的欄位；拖曳中（input）只改值，放開（change）才重畫
  gazeTuneInput(e, done) {
    const el = e.target;
    if (el.dataset.t) {
      const t = JSON.parse(JSON.stringify(this.gazeTune()));
      const v = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
      pathSet(t, el.dataset.t, v);
      this.gazeTuneSet(t);
      const b = this.gzTune.el.querySelector(`[data-v="${el.dataset.t}"]`);
      if (b) b.textContent = fmt(v, parseFloat(el.step)) + (/maxIn|off/.test(el.dataset.t) ? '°' : '');
      if (done && el.type === 'checkbox') this.gazeTuneRender();
      else this.gazeTuneNow();
    } else if (el.dataset.gc && done) {
      const k = el.dataset.gc;
      this.gazeSet(k, el.type === 'checkbox' ? el.checked : el.value);
      if (k === 'head' || k === 'headMode') this.gazeHeadReset();
      this.gazeTuneRender();
    }
  },
  gazeCamSet(o) {
    this.gazeSet('cam', Object.assign(this.gazeCam(), o));
    this.gazeCamRestart();
  },
  gazeCamRestart() {
    const g = this.gzState();
    if (g.p) return;
    this.gazeStop();
    g.tried = true;
    this.gazeStart().then(() => {
      this.gazeVideoHome();
      if (this.gzTune && this.gzTune.tab === 'cam') this.gazeTuneRender();
    });
  },
  // ---------- 對應曲線的編輯 ----------
  gazeCurveCur() {
    const T = this.gzTune;
    const t = this.gazeTune();
    const A = t[T.tab];
    return A && (A.asym && T.side === 'neg' ? A.neg : A.pos);
  },
  // fn 改曲線的點陣列（複製的），之後整理並存檔
  gazeCurveEdit(fn) {
    const T = this.gzTune;
    const t = JSON.parse(JSON.stringify(this.gazeTune()));
    const A = t[T.tab];
    const key = A.asym && T.side === 'neg' ? 'neg' : 'pos';
    fn(A[key]);
    if (!A.asym) A.neg = A.pos.map((p) => [...p]);
    this.gazeTuneSet(t);
    T.sel = clamp(T.sel, 0, this.gazeTune()[T.tab][key].length - 1);
    this.gazeTuneNow();
  },
  gazeCurveAdd() {
    const T = this.gzTune;
    const c = this.gazeCurveCur();
    if (!c || c.length >= 12) return;
    const i = clamp(T.sel, 0, c.length - 2);
    const x = (c[i][0] + c[i + 1][0]) / 2;
    const y = curveEval(c, x);
    this.gazeCurveEdit((a) => a.splice(i + 1, 0, [x, y]));
    T.sel = i + 1;
  },
  gazeCurveDel(i) {
    const T = this.gzTune;
    const c = this.gazeCurveCur();
    i = i === undefined ? T.sel : i;
    if (!c || i <= 0 || i >= c.length - 1) return false;
    this.gazeCurveEdit((a) => a.splice(i, 1));
    T.sel = Math.max(1, i - 1);
    return true;
  },
  // 曲線圖的座標：左下角 (PAD, H-PAD) ＝ (0, 0)
  gazeCurveXY(cv) {
    const P = 30;
    return { P, w: cv.width - P - 10, h: cv.height - P - 12 };
  },
  gazeCurveBind(cv) {
    const T = this.gzTune;
    const toPt = (e) => {
      const r = cv.getBoundingClientRect();
      const { P, w, h } = this.gazeCurveXY(cv);
      const px = ((e.clientX - r.left) / r.width) * cv.width,
        py = ((e.clientY - r.top) / r.height) * cv.height;
      return [(px - P) / w, (cv.height - P - py) / h, px, py];
    };
    const hit = (px, py) => {
      const c = this.gazeCurveCur();
      const { P, w, h } = this.gazeCurveXY(cv);
      let best = -1,
        bd = 12;
      c.forEach(([x, y], i) => {
        const d = Math.hypot(P + x * w - px, cv.height - P - y * h - py);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      return best;
    };
    const moveTo = (i, x, y) =>
      this.gazeCurveEdit((a) => {
        const lo = i === 0 ? 0 : a[i - 1][0] + 0.02,
          hi = i === a.length - 1 ? 1 : a[i + 1][0] - 0.02;
        a[i] = [i === 0 ? 0 : i === a.length - 1 ? 1 : clamp(x, lo, hi), i === 0 ? 0 : clamp(y, 0, 1)];
      });
    cv.oncontextmenu = (e) => e.preventDefault();
    cv.onpointerdown = (e) => {
      e.preventDefault();
      const [x, y, px, py] = toPt(e);
      let i = hit(px, py);
      if (e.button === 2) {
        if (i > 0) this.gazeCurveDel(i);
        return;
      }
      if (i < 0) {
        const c = this.gazeCurveCur();
        if (c.length >= 12 || x <= 0.02 || x >= 0.98) return;
        let k = 1;
        while (k < c.length && c[k][0] < x) k++;
        this.gazeCurveEdit((a) => a.splice(k, 0, [x, clamp(y, 0, 1)]));
        i = k;
      }
      T.sel = i;
      T.drag = { i, x0: px, y0: py, moved: false, t0: performance.now() };
      cv.setPointerCapture(e.pointerId);
      // 觸控：在點上長按 0.55 秒（沒有移動）＝刪除
      if (e.pointerType === 'touch')
        T.drag.lp = setTimeout(() => {
          if (T.drag && !T.drag.moved && this.gazeCurveDel(T.drag.i)) T.drag = null;
        }, 550);
    };
    cv.onpointermove = (e) => {
      const d = T.drag;
      if (!d) return;
      const [x, y, px, py] = toPt(e);
      if (Math.hypot(px - d.x0, py - d.y0) > 4) d.moved = true;
      if (d.moved) moveTo(d.i, x, y);
    };
    const up = () => {
      if (T.drag && T.drag.lp) clearTimeout(T.drag.lp);
      T.drag = null;
      T.ptrT = performance.now();
    };
    cv.onpointerup = up;
    cv.onpointercancel = up;
    // 手把：A＝換選取的點（pad-ui 的 click）、十字鍵移動、X 刪除
    cv.onclick = () => {
      if (performance.now() - (T.ptrT || 0) < 400) return; // 滑鼠點完也會有 click
      const c = this.gazeCurveCur();
      T.sel = (T.sel + 1) % c.length;
    };
    cv.padAdj = (dx, dy) => {
      const c = this.gazeCurveCur();
      const i = T.sel;
      if (!c[i]) return true;
      moveTo(i, c[i][0] + dx * 0.02, c[i][1] - dy * 0.02);
      return true;
    };
    cv.padDec = () => this.gazeCurveDel();
  },
  // 模擬的鏡頭畫面：偏移模式＝鏡頭多看的角度、速度模式＝依轉速累積的角度；遠處的方塊與每 15° 的刻度跟著轉
  gazeTuneView(mode, ay, ap) {
    const T = this.gzTune;
    const c = $('gtView');
    if (!c) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - (T.vt || now)) / 1000);
    T.vt = now;
    let cy, cp;
    if (mode === 'offset') {
      cy = ay.out;
      cp = ap.out;
      T.simY = T.simP = 0;
    } else {
      T.simY = (T.simY || 0) + (ay.out * HEAD_V.yaw * dt) / D2R;
      T.simP = clamp((T.simP || 0) + (ap.out * HEAD_V.pitch * dt) / D2R, -40, 40);
      cy = T.simY;
      cp = T.simP;
    }
    const x = c.getContext('2d');
    const W = c.width,
      H = c.height;
    const ppd = W / 70; // 水平視野 70°
    const hy = H / 2 + cp * ppd; // 地平線
    const sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1b2a3a');
    sky.addColorStop(1, '#2c4058');
    x.fillStyle = sky;
    x.fillRect(0, 0, W, H);
    x.fillStyle = '#2a2a24';
    x.fillRect(0, hy, W, H - hy);
    // 正前方的角度＝0，往左為正（和頭轉的方向一樣）；畫面上 x＝中央 −（角度 − 鏡頭的角度）× ppd
    const sx = (d) => W / 2 - (d - cy) * ppd;
    const wrap = (d) => ((((d - cy + 180) % 360) + 360) % 360) - 180 + cy;
    x.fillStyle = '#56606b';
    for (const [d, w, h] of [
      [-75, 10, 26],
      [-40, 16, 18],
      [-12, 8, 34],
      [22, 20, 14],
      [50, 9, 30],
      [95, 14, 22],
      [140, 18, 16],
      [-130, 12, 28],
    ]) {
      const px = sx(wrap(d));
      if (px < -40 || px > W + 40) continue;
      x.fillRect(px - (w * ppd) / 8, hy - h, (w * ppd) / 4, h);
    }
    x.strokeStyle = 'rgba(255,255,255,.25)';
    x.fillStyle = 'rgba(255,255,255,.6)';
    x.font = '10px "Noto Sans TC", sans-serif';
    x.textAlign = 'center';
    for (let d = Math.ceil((cy - 40) / 15) * 15; d <= cy + 40; d += 15) {
      const px = sx(d);
      x.beginPath();
      x.moveTo(px, hy - 4);
      x.lineTo(px, hy + 4);
      x.stroke();
      const n = ((((Math.round(d) + 180) % 360) + 360) % 360) - 180;
      if (n % 30 === 0) x.fillText(n === 0 ? '前' : n > 0 ? '左' + n : '右' + -n, px, hy + 15);
    }
    // 準星（畫面中央）
    x.strokeStyle = '#ffb020';
    x.lineWidth = 1.5;
    x.beginPath();
    x.moveTo(W / 2 - 8, H / 2);
    x.lineTo(W / 2 + 8, H / 2);
    x.moveTo(W / 2, H / 2 - 8);
    x.lineTo(W / 2, H / 2 + 8);
    x.stroke();
    const cap = $('gtViewCap');
    if (cap) {
      const n = ((((cy + 180) % 360) + 360) % 360) - 180;
      const lr = Math.abs(n) < 0.5 ? '正前方' : (n > 0 ? '左 ' : '右 ') + Math.abs(Math.round(n)) + '°';
      const ud = Math.abs(cp) < 0.5 ? '' : (cp > 0 ? '・上 ' : '・下 ') + Math.abs(Math.round(cp)) + '°';
      cap.textContent = `鏡頭看出去（模擬）：${lr}${ud}${mode === 'rate' ? '（速度模式，按「置中」歸零）' : ''}`;
    }
  },
  // ---------- 每格重畫（預覽、輸入與輸出、曲線、狀態） ----------
  gazeTuneDraw() {
    const T = this.gzTune;
    const g = this.gz;
    const t = this.gazeTune();
    const C = this.gazeCfg();
    const mode = C.headMode === 'rate' ? 'rate' : 'offset';
    const ready = g && g.st === 'ready';
    const off = (k) => (ready && g.neutral && g.face ? (g.hs[k] - g.neutral[k]) / D2R : 0);
    const st = $('gtStat');
    if (st) {
      const S = g && g.stat;
      const raw = (S && S.raw) || [];
      const mu = raw.reduce((a, b) => a + b, 0) / Math.max(1, raw.length);
      const jit = Math.sqrt(raw.reduce((a, b) => a + (b - mu) * (b - mu), 0) / Math.max(1, raw.length));
      // 超過 1 秒沒有新的偵測＝影像停住了（偵測頻率不再沿用舊的數字）
      const stale = ready && g.lastT && performance.now() - g.lastT > 1000;
      st.classList.toggle('bad', !ready || stale || !g.face);
      st.textContent =
        !g || g.st === 'off'
          ? '攝影機沒有開啟'
          : g.st === 'loading'
            ? '載入中…'
            : g.st === 'error'
              ? '錯誤：' + g.msg
              : stale
                ? '影像停住了：按「重開攝影機」'
                : [
                    (g.face ? '偵測到臉 ✓' : '找不到臉') + (g.paused ? '・暫停中' : ''),
                    `偵測 ${Math.round(S.fps)} 次／秒・抖動 ${jit.toFixed(2)}°`,
                    (g.head ? `距離約 ${Math.round(Math.abs(g.head.z))} cm` : '') +
                      (g.neutral ? '' : '・量測中心中…'),
                  ]
                    .filter(Boolean)
                    .join('\n');
    }
    const pb = $('gtPause');
    if (pb) pb.textContent = g && g.paused ? '繼續' : '暫停';
    const vw0 = T.el.querySelector('.gtVidWrap');
    if (vw0) vw0.classList.toggle('mir', !!this.gazeCam().mirror);
    // 特徵點（疊在預覽上；鏡像時畫布跟著影像一起翻）
    const lm = $('gtLm');
    if (lm) {
      const v = g && g.video;
      const W = (lm.width = lm.clientWidth || 240),
        H = (lm.height = lm.clientHeight || 180);
      const x = lm.getContext('2d');
      x.clearRect(0, 0, W, H);
      if (!v || !v.videoWidth) {
        x.fillStyle = '#5a6673';
        x.font = '12px "Noto Sans TC", sans-serif';
        x.textAlign = 'center';
        // 畫布跟著影像鏡像：文字反過來畫才是正的
        const mir = this.gazeCam().mirror;
        x.save();
        if (mir) x.scale(-1, 1);
        x.fillText('沒有攝影機影像', mir ? -W / 2 : W / 2, H / 2);
        x.restore();
      }
      if (g && g.lm && v && v.videoWidth) {
        // object-fit: cover 的換算
        const s = Math.max(W / v.videoWidth, H / v.videoHeight);
        const ox = (W - v.videoWidth * s) / 2,
          oy = (H - v.videoHeight * s) / 2;
        const P = (i) => [ox + g.lm[i].x * v.videoWidth * s, oy + g.lm[i].y * v.videoHeight * s];
        x.strokeStyle = 'rgba(92,200,255,.7)';
        x.lineWidth = 1.2;
        x.beginPath();
        LM_OVAL.forEach((i, k) => {
          const [a, b] = P(i);
          if (k) x.lineTo(a, b);
          else x.moveTo(a, b);
        });
        x.closePath();
        x.stroke();
        x.fillStyle = '#ffb020';
        for (const i of LM_EYE) {
          const [a, b] = P(i);
          x.fillRect(a - 1.5, b - 1.5, 3, 3);
        }
        x.fillStyle = '#7ee081';
        for (const i of [468, 473]) {
          if (!g.lm[i]) continue;
          const [a, b] = P(i);
          x.beginPath();
          x.arc(a, b, 2.5, 0, Math.PI * 2);
          x.fill();
        }
      }
    }
    // 輸入（頭）與輸出（鏡頭）：橫軸＝左右（畫面左＝往自己的左邊，像照鏡子），縱軸＝上下
    const ay = axisMap(off('yaw'), t.yaw, t.g, mode),
      ap = axisMap(off('pitch'), t.pitch, t.g, mode);
    const plot = (id, fn) => {
      const c = $(id);
      if (!c) return;
      const x = c.getContext('2d');
      const W = c.width,
        H = c.height;
      x.clearRect(0, 0, W, H);
      x.fillStyle = 'rgba(255,255,255,.03)';
      x.fillRect(0, 0, W, H);
      x.strokeStyle = 'rgba(255,255,255,.12)';
      x.beginPath();
      x.moveTo(W / 2, 0);
      x.lineTo(W / 2, H);
      x.moveTo(0, H / 2);
      x.lineTo(W, H / 2);
      x.stroke();
      fn(x, W, H);
    };
    plot('gtIn', (x, W, H) => {
      const sx = W / 2 / t.yaw.maxIn,
        sy = H / 2 / t.pitch.maxIn;
      x.fillStyle = 'rgba(255,255,255,.08)';
      x.fillRect(W / 2 - ay.dz * sx, H / 2 - ap.dz * sy, ay.dz * sx * 2, ap.dz * sy * 2);
      const px = W / 2 - clamp(off('yaw'), -t.yaw.maxIn, t.yaw.maxIn) * sx,
        py = H / 2 - clamp(off('pitch'), -t.pitch.maxIn, t.pitch.maxIn) * sy;
      x.fillStyle = ready && g.face ? '#e6edf3' : '#5a6673';
      x.beginPath();
      x.arc(px, py, 6, 0, Math.PI * 2);
      x.fill();
    });
    plot('gtOut', (x, W, H) => {
      x.fillStyle = '#5cc8ff';
      x.strokeStyle = '#5cc8ff';
      x.lineWidth = 3;
      if (mode === 'offset') {
        const my = Math.max(1, t.yaw.maxIn * OUT_K * t.yaw.sens * t.g.sens),
          mp = Math.max(1, t.pitch.maxIn * OUT_K * t.pitch.sens * t.g.sens);
        const px = W / 2 - clamp(ay.out / my, -1, 1) * (W / 2 - 6),
          py = H / 2 - clamp(ap.out / mp, -1, 1) * (H / 2 - 6);
        x.beginPath();
        x.arc(px, py, 6, 0, Math.PI * 2);
        x.fill();
        x.font = '11px "Noto Sans TC", sans-serif';
        x.fillText(`${Math.round(ay.out)}°, ${Math.round(ap.out)}°`, 6, H - 6);
      } else {
        const ex = W / 2 - clamp(ay.out, -1, 1) * (W / 2 - 8),
          ey = H / 2 - clamp(ap.out, -1, 1) * (H / 2 - 8);
        x.beginPath();
        x.moveTo(W / 2, H / 2);
        x.lineTo(ex, ey);
        x.stroke();
      }
    });
    this.gazeTuneView(mode, ay, ap);
    // 對應曲線
    const cv = $('gtCurve');
    if (cv && (T.tab === 'yaw' || T.tab === 'pitch')) {
      const A = t[T.tab];
      const c = this.gazeCurveCur();
      const x = cv.getContext('2d');
      const { P, w, h } = this.gazeCurveXY(cv);
      const X = (u) => P + u * w,
        Y = (u) => cv.height - P - u * h;
      x.clearRect(0, 0, cv.width, cv.height);
      x.fillStyle = 'rgba(255,255,255,.03)';
      x.fillRect(P, Y(1), w, h);
      const dz = ay.dz !== undefined ? (T.tab === 'yaw' ? ay.dz : ap.dz) : 0;
      x.fillStyle = 'rgba(255,255,255,.07)';
      x.fillRect(P, Y(1), (dz / A.maxIn) * w, h);
      x.strokeStyle = 'rgba(255,255,255,.1)';
      x.beginPath();
      for (let i = 1; i < 4; i++) {
        x.moveTo(X(i / 4), Y(0));
        x.lineTo(X(i / 4), Y(1));
        x.moveTo(X(0), Y(i / 4));
        x.lineTo(X(1), Y(i / 4));
      }
      x.stroke();
      x.strokeStyle = 'rgba(255,255,255,.18)';
      x.setLineDash([4, 4]);
      x.beginPath();
      x.moveTo(X(0), Y(0));
      x.lineTo(X(1), Y(1));
      x.stroke();
      x.setLineDash([]);
      x.strokeStyle = '#ffb020';
      x.lineWidth = 2;
      x.beginPath();
      for (let i = 0; i <= 80; i++) {
        const u = i / 80;
        const v = curveEval(c, u);
        if (i) x.lineTo(X(u), Y(v));
        else x.moveTo(X(u), Y(v));
      }
      x.stroke();
      c.forEach(([u, v], i) => {
        x.fillStyle = i === T.sel ? '#ffffff' : '#ffb020';
        x.beginPath();
        x.arc(X(u), Y(v), i === T.sel ? 6 : 4.5, 0, Math.PI * 2);
        x.fill();
      });
      // 現在頭的位置
      const m = T.tab === 'yaw' ? ay : ap;
      const side = m.x < 0 ? 'neg' : 'pos';
      const vis = !A.asym || side === T.side;
      if (ready && g.face && vis) {
        const u = Math.abs(m.x);
        x.strokeStyle = 'rgba(92,200,255,.85)';
        x.lineWidth = 1.5;
        x.beginPath();
        x.moveTo(X(u), Y(0));
        x.lineTo(X(u), Y(1));
        x.stroke();
        x.fillStyle = '#5cc8ff';
        x.beginPath();
        x.arc(X(u), Y(curveEval(c, u)), 5, 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = '#8a97a6';
      x.font = '11px "Noto Sans TC", sans-serif';
      x.textAlign = 'center';
      x.fillText(`頭轉的角度 0～${Math.round(A.maxIn)}°`, P + w / 2, cv.height - 8);
      x.save();
      x.translate(11, Y(0.5));
      x.rotate(-Math.PI / 2);
      x.fillText(
        mode === 'offset' ? `鏡頭 0～${Math.round(A.maxIn * OUT_K * A.sens * t.g.sens)}°` : '鏡頭的轉速',
        0,
        0,
      );
      x.restore();
    }
    // 上一次校準的結果
    const cp = $('gtCalPlot');
    if (cp && !cp.dataset.done) {
      cp.dataset.done = '1';
      const x = cp.getContext('2d');
      const W = cp.width,
        H = cp.height;
      x.fillStyle = 'rgba(255,255,255,.04)';
      x.fillRect(0, 0, W, H);
      const pts = (g && g.cal && g.cal.pts) || [];
      x.font = '10px "Noto Sans TC", sans-serif';
      x.textAlign = 'center';
      if (!pts.length) {
        x.fillStyle = '#8a97a6';
        x.fillText('沒有校準結果（重新校準後會顯示）', W / 2, H / 2);
      }
      for (const [tx, ty, px, py, err] of pts) {
        const col =
          err === null || err > innerHeight * 0.11
            ? '#ff5a5a'
            : err > innerHeight * 0.06
              ? '#ffb020'
              : '#7ee081';
        x.strokeStyle = x.fillStyle = col;
        x.beginPath();
        x.arc(tx * W, ty * H, 7, 0, Math.PI * 2);
        x.stroke();
        if (px !== null) {
          x.beginPath();
          x.moveTo(tx * W, ty * H);
          x.lineTo(px * W, py * H);
          x.stroke();
          x.beginPath();
          x.arc(px * W, py * H, 3, 0, Math.PI * 2);
          x.fill();
        }
      }
    }
    // 眼睛這一頁：注視點跟著眼睛
    const dot = $('gtGaze');
    if (dot) {
      const show = T.tab === 'eye' && g && g.valid && !this.gzCal && !this.gzDrift;
      dot.style.display = show ? 'block' : 'none';
      if (show) {
        dot.style.left = g.x + 'px';
        dot.style.top = g.y + 'px';
      }
    }
  },
});
