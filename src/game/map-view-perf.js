// ============================================================
//  Game：地圖預覽器的效能分析（docs/map-viewer-design.md 第 4 期）
//  - 分段：每格的模擬（AI、特效、其他）、算繪、HUD 的 CPU 時間（0.5 秒的平均）
//  - 卡頓紀錄：兩格間隔 50 ms 以上，附原因（著色器編譯、GC、生成、建模、產生地圖）
//  - 場景分類：場景頂層的物件依類別（地形、地圖物件、大型結構、地標、遠景、水面、敵人、Boss、玩家與友軍、車輛、
//    小人、天氣、特效與其他）統計畫面內的網格與三角形，每一類可以隱藏（算繪前暫時藏起來、算完還原，不影響遊戲邏輯）
//  - 顯示卡時間：EXT_disjoint_timer_query_webgl2（不支援時不顯示）
//  - 匯出：地圖參數＋效能數字（複製文字／下載 JSON）
// ============================================================
import { escHtml } from '../core/html.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const MV_CATS = [
  ['terrain', '地形'],
  ['prop', '地圖物件'],
  ['struct', '大型結構'],
  ['lm', '地標'],
  ['far', '遠景'],
  ['water', '水面'],
  ['foe', '敵人'],
  ['boss', 'Boss'],
  ['mech', '玩家與友軍'],
  ['veh', '車輛'],
  ['crowd', '小人'],
  ['weather', '天氣'],
  ['fx', '特效與其他'],
];
const HITCH_MS = 50; // 卡頓：兩格間隔超過
const HITCH_MAX = 30; // 紀錄最多幾筆
const _fr = new THREE.Frustum(),
  _m4 = new THREE.Matrix4(),
  _sph = new THREE.Sphere();

Object.assign(Game.prototype, {
  mapvPerfReset() {
    const V = this.mapv;
    V.pf = {
      acc: { sim: 0, ai: 0, fx: 0, ren: 0, hud: 0, n: 0 },
      seg: null, // 上一次的平均（ms）
      hitches: V.pf ? V.pf.hitches : [],
      last: null, // 上一格的計數（卡頓原因用）
      hide: V.pf ? V.pf.hide : new Set(),
      cats: null, // 上一次的分類統計
      catT: 0,
      gpu: V.pf ? V.pf.gpu : null,
    };
  },
  // ---------- 分類 ----------
  // 場景頂層的物件 → 類別
  mapvCatOf() {
    const w = this.world,
      M = new Map();
    if (!w) return M;
    const put = (o, c) => o && M.set(o, c);
    for (const e of this.enemies) {
      if (!e.mesh) continue;
      const par = e.opts && e.opts.parent ? this.enemies.find((q) => q.id === e.opts.parent) : null;
      put(e.mesh, e.isBoss || (par && par.isBoss) ? 'boss' : 'foe');
    }
    for (const e of this.players || []) put(e.mesh, 'mech');
    for (const e of this.allies || []) put(e.mesh, 'mech');
    for (const v of this.vehicles || []) put(v.mesh, 'veh');
    if (this.crowd && this.crowd.mesh) put(this.crowd.mesh.group, 'crowd');
    put(w.terrainMesh, 'terrain');
    put(w.decorG, 'terrain');
    put(w.roofMesh, 'terrain');
    put(w.waterMesh, 'water');
    if (w.weather) put(w.weather.points, 'weather');
    for (const p of w.props || []) if (p.ob && p.ob.group) put(p.ob.group, 'prop');
    const wm = new Set(w.meshes || []);
    for (const o of this.scene.children) {
      if (M.has(o)) continue;
      const c = o.userData && o.userData.cat;
      if (c) M.set(o, c);
      else if (wm.has(o)) M.set(o, 'struct');
    }
    return M;
  },
  // 每個類別在畫面內的網格（≈ 繪製次數，不含陰影與多次算繪）與三角形
  mapvCatStats() {
    const cam = this.camera;
    cam.updateMatrixWorld();
    _m4.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_m4);
    const M = this.mapvCatOf();
    const out = {};
    for (const [k] of MV_CATS) out[k] = { n: 0, tri: 0, all: 0 };
    for (const o of this.scene.children) {
      const k = M.get(o) || 'fx';
      const S = out[k];
      o.traverseVisible((m) => {
        if (!(m.isMesh || m.isPoints || m.isLine || m.isSprite)) return;
        S.all++;
        const g = m.geometry;
        if (!g) return;
        if (m.frustumCulled !== false && !m.isInstancedMesh) {
          if (!g.boundingSphere) g.computeBoundingSphere();
          if (g.boundingSphere) {
            _sph.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
            if (!_fr.intersectsSphere(_sph)) return;
          }
        }
        S.n++;
        if (m.isMesh) {
          const c = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
          const dr = g.drawRange && g.drawRange.count !== Infinity ? Math.min(c, g.drawRange.count) : c;
          S.tri += (dr / 3) * (m.isInstancedMesh ? m.count : 1);
        }
      });
    }
    return out;
  },
  // 算繪前把隱藏的類別藏起來（記下原本的 visible），算完還原
  mapvHideBegin() {
    const pf = this.mapv.pf;
    if (!pf || !pf.hide.size) return null;
    const M = this.mapvCatOf();
    const list = [];
    for (const o of this.scene.children) {
      const k = M.get(o) || 'fx';
      if (pf.hide.has(k) && o.visible) {
        o.visible = false;
        list.push(o);
      }
    }
    return list;
  },
  mapvHideEnd(list) {
    if (list) for (const o of list) o.visible = true;
  },
  // ---------- 顯示卡時間 ----------
  // 每次只有一個查詢：結果出來（通常晚 1～3 格）才發下一個
  mapvGpuBegin() {
    const pf = this.mapv.pf;
    if (!pf) return;
    let G = pf.gpu;
    if (!G) {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension && gl.getExtension('EXT_disjoint_timer_query_webgl2');
      G = pf.gpu = { gl, ext, q: null, ms: null, acc: 0, n: 0, on: !!ext };
    }
    if (!G.on || G.q) return;
    G.q = G.gl.createQuery();
    G.gl.beginQuery(G.ext.TIME_ELAPSED_EXT, G.q);
    G.open = true;
  },
  mapvGpuEnd() {
    const G = this.mapv.pf && this.mapv.pf.gpu;
    if (!G || !G.on) return;
    const gl = G.gl;
    if (G.open) {
      gl.endQuery(G.ext.TIME_ELAPSED_EXT);
      G.open = false;
      return;
    }
    if (!G.q) return;
    if (!gl.getQueryParameter(G.q, gl.QUERY_RESULT_AVAILABLE)) return;
    const bad = gl.getParameter(G.ext.GPU_DISJOINT_EXT);
    if (!bad) {
      G.acc += gl.getQueryParameter(G.q, gl.QUERY_RESULT) / 1e6;
      G.n++;
    }
    gl.deleteQuery(G.q);
    G.q = null;
  },
  // ---------- 每格 ----------
  // 卡頓：和上一格比較各種計數，找出可能的原因
  mapvHitch(ft) {
    const V = this.mapv,
      pf = V.pf;
    const R = this.renderer.info;
    const now = {
      prog: R.programs ? R.programs.length : 0,
      geo: R.memory.geometries,
      tex: R.memory.textures,
      heap: performance.memory ? performance.memory.usedJSHeapSize : 0,
      ents: this.enemies.length + this.allies.length,
      world: this.world,
    };
    const L = pf.last;
    pf.last = now;
    if (!L || ft < HITCH_MS) return;
    const why = [];
    // 產生地圖之後幾秒內：新地圖的著色器預熱、第一次畫到的模型（Game.shaderWarm）
    if (now.world !== L.world || performance.now() - (V.genAt || 0) < 6000)
      why.push('新地圖（預熱與第一次畫）');
    if (now.prog > L.prog) why.push(`著色器編譯 +${now.prog - L.prog}`);
    if (L.heap && now.heap < L.heap - 4e6) why.push(`GC −${Math.round((L.heap - now.heap) / 1048576)} MB`);
    if (now.ents > L.ents) why.push(`生成 +${now.ents - L.ents}`);
    if (now.geo > L.geo + 10 || now.tex > L.tex)
      why.push(`建模（幾何 +${now.geo - L.geo}、貼圖 +${now.tex - L.tex}）`);
    pf.hitches.unshift({
      t: Math.round(this.missionT * 10) / 10,
      ms: Math.round(ft),
      why: why.join('、') || '不明',
    });
    if (pf.hitches.length > HITCH_MAX) pf.hitches.length = HITCH_MAX;
    if (V.tab === 'perf') this.mapvPerfUi();
  },
  // 0.5 秒一次：分段的平均、顯示卡時間；1 秒一次：分類統計
  mapvPerfTick(dt) {
    const V = this.mapv,
      pf = V.pf;
    const A = pf.acc;
    if (A.n >= 30) {
      pf.seg = { sim: A.sim / A.n, ai: A.ai / A.n, fx: A.fx / A.n, ren: A.ren / A.n, hud: A.hud / A.n };
      A.sim = A.ai = A.fx = A.ren = A.hud = A.n = 0;
      const G = pf.gpu;
      if (G && G.n) {
        G.ms = G.acc / G.n;
        G.acc = G.n = 0;
      }
      if (V.tab === 'perf') this.mapvPerfUi();
    }
    pf.catT -= dt;
    if (pf.catT <= 0 && V.tab === 'perf') {
      pf.catT = 1;
      pf.cats = this.mapvCatStats();
      this.mapvPerfUi();
    }
  },
  // ---------- 面板（效能分頁） ----------
  mapvPerfHtml() {
    return `
      <div class="mvsub" style="margin-top:0">每格的時間（ms）</div>
      <div class="mvsegs" id="mvSegs"></div>
      <div class="mvsub">場景分類（畫面內）</div>
      <table class="mvcats" id="mvCats"></table>
      <div class="mvnote">勾「藏」暫時不畫那一類（遊戲照常），看 FPS 差多少就知道是誰拖慢的。網格數約等於繪製次數（不含陰影與後處理的多次算繪）。</div>
      <div class="mvsub">卡頓（${HITCH_MS} ms 以上）</div>
      <div class="mvhitch" id="mvHitch"></div>
      <div class="mvacts"><button id="mvCopy" title="地圖參數＋效能數字複製成文字（貼給開發者查問題）">複製報告</button><button id="mvJson">下載 JSON</button><button id="mvHitchClr">清除卡頓</button></div>
      <div class="mvnote" id="mvCopyMsg"></div>`;
  },
  mapvBindPerf() {
    const pf = this.mapv.pf;
    $('mvCats').onchange = (e) => {
      const k = e.target && e.target.dataset && e.target.dataset.hide;
      if (!k) return;
      if (e.target.checked) pf.hide.add(k);
      else pf.hide.delete(k);
    };
    $('mvCopy').onclick = () => {
      const txt = this.mapvReportText();
      const done = (ok) => ($('mvCopyMsg').textContent = ok ? '已複製' : '複製失敗：請改用「下載 JSON」');
      try {
        navigator.clipboard.writeText(txt).then(
          () => done(true),
          () => done(false),
        );
      } catch (err) {
        done(false);
      }
    };
    $('mvJson').onclick = () => {
      const b = new Blob([JSON.stringify(this.mapvReport(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `mech-cordon-mapview-${this.mapv.p.theme}-${this.mapv.p.seed}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $('mvHitchClr').onclick = () => {
      pf.hitches.length = 0;
      this.mapvPerfUi();
    };
    pf.catT = 0;
    this.mapvPerfUi();
  },
  mapvPerfUi() {
    const pf = this.mapv.pf;
    const segs = $('mvSegs');
    if (!segs || !pf) return;
    const s = pf.seg;
    const G = pf.gpu;
    const rows = s
      ? [
          ['模擬', s.sim, '#6ab0ff'],
          ['　AI', s.ai, '#9fc8ff'],
          ['　特效', s.fx, '#9fc8ff'],
          ['算繪', s.ren, '#ffb060'],
          ['HUD', s.hud, '#c8a0ff'],
        ]
      : [];
    if (G && G.on && G.ms !== null) rows.push(['顯示卡', G.ms, '#ff7a7a']);
    segs.innerHTML =
      rows
        .map(
          ([k, v, c]) =>
            `<span>${k}</span><i><b style="width:${Math.min(100, (v / 33.3) * 100).toFixed(0)}%;background:${c}"></b></i><em>${v.toFixed(1)}</em>`,
        )
        .join('') +
      (G && !G.on ? '<span class="dim" style="grid-column:1/-1">顯示卡時間：這個瀏覽器不支援</span>' : '');
    const C = pf.cats;
    if (C) {
      let tn = 0,
        tt = 0;
      for (const [k] of MV_CATS) {
        tn += C[k].n;
        tt += C[k].tri;
      }
      $('mvCats').innerHTML =
        '<tr><th>類別</th><th>網格</th><th>三角形</th><th>藏</th></tr>' +
        MV_CATS.filter(([k]) => C[k].all || pf.hide.has(k))
          .map(
            ([k, nm]) =>
              `<tr><td>${nm}</td><td>${C[k].n}<i>／${C[k].all}</i></td><td>${(C[k].tri / 1000).toFixed(0)}k</td><td><input type="checkbox" data-hide="${k}"${pf.hide.has(k) ? ' checked' : ''} /></td></tr>`,
          )
          .join('') +
        `<tr class="sum"><td>合計</td><td>${tn}</td><td>${(tt / 1000).toFixed(0)}k</td><td></td></tr>`;
    }
    $('mvHitch').innerHTML = pf.hitches.length
      ? pf.hitches
          .map((h) => `<div><b>${h.ms} ms</b> <span class="dim">${h.t}s</span> ${escHtml(h.why)}</div>`)
          .join('')
      : '<span class="dim">沒有</span>';
  },
  // ---------- 匯出 ----------
  mapvReport() {
    const V = this.mapv,
      pf = V.pf,
      R = this.renderer.info;
    const S = V.st;
    return {
      t: new Date().toISOString(),
      map: { ...V.p, name: this.levelName, meters: this.world && Math.round(this.world.size) },
      foes: { mode: V.f.mode, lv: V.f.lv, n: this.enemies.filter((e) => !e.dead).length },
      style: V.style || 'game',
      res: this.renderer.getPixelRatio(),
      view: [innerWidth, innerHeight],
      fps: S.lastFps,
      seg: pf.seg,
      gpu: pf.gpu && pf.gpu.on ? pf.gpu.ms : null,
      calls: R.render.calls,
      tris: R.render.triangles,
      programs: R.programs ? R.programs.length : 0,
      geometries: R.memory.geometries,
      textures: R.memory.textures,
      cats: pf.cats || this.mapvCatStats(),
      hidden: [...pf.hide],
      hitches: pf.hitches,
      ua: navigator.userAgent,
    };
  },
  mapvReportText() {
    const r = this.mapvReport();
    const f = (v) => (typeof v === 'number' ? v.toFixed(1) : '—');
    const lines = [
      `地圖預覽報告 ${r.t}`,
      `地圖：${r.map.name}（種子 ${r.map.seed}、${r.map.meters} m、大小 ${r.map.size}${r.map.sortie ? '、主線 ' + r.map.sortie + ' 第 ' + ((r.map.seg | 0) + 1) + ' 段' : ''}）`,
      `敵人：${r.foes.mode}、等級 ${r.foes.lv}、場上 ${r.foes.n}`,
      `畫面：${r.view.join('×')}、像素比 ${r.res.toFixed(2)}、風格 ${r.style}`,
      `FPS ${f(r.fps)}・模擬 ${f(r.seg && r.seg.sim)}（AI ${f(r.seg && r.seg.ai)}、特效 ${f(r.seg && r.seg.fx)}）・算繪 ${f(r.seg && r.seg.ren)}・HUD ${f(r.seg && r.seg.hud)}・顯示卡 ${f(r.gpu)} ms`,
      `繪製 ${r.calls}・三角形 ${Math.round(r.tris / 1000)}k・著色器 ${r.programs}・幾何 ${r.geometries}・貼圖 ${r.textures}`,
      '場景分類（畫面內的網格／全部、三角形）：',
      ...MV_CATS.filter(([k]) => r.cats[k].all).map(
        ([k, nm]) => `  ${nm}：${r.cats[k].n}／${r.cats[k].all}、${Math.round(r.cats[k].tri / 1000)}k`,
      ),
      r.hidden.length ? '隱藏中：' + r.hidden.map((k) => MV_CATS.find((c) => c[0] === k)[1]).join('、') : '',
      '卡頓：' + (r.hitches.length ? '' : '沒有'),
      ...r.hitches.map((h) => `  ${h.ms} ms（${h.t}s）${h.why}`),
    ];
    return lines.filter((s) => s !== '').join('\n');
  },
});
