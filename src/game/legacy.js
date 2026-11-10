// Game：標題畫面的「轉換舊存檔」（docs/rebrand-design.md 第三節）：改名前（RUBICON PROTOCOL）的資料
// 在 localStorage 的 rubicon_*、IndexedDB 的 rubicon-*，新版不會自動搬。這裡列出找到的舊存檔，各自轉存到新的槽位；
// 設定與資料庫（模型庫、自訂關卡、參考圖、貼圖繪製）一次轉換；也可以讀舊版匯出的存檔檔案。舊資料保留，可以另外刪除。
// 注意：這個檔案的舊名稱是刻意寫死的，不要拿去做 rubicon → mech-cordon 的全域取代。
import { escHtml } from '../core/html.js';
import { SFX } from '../audio/audio.js';
import { Game } from './game.js';

const OLD = 'rubicon_';
const NEW = 'mech_cordon_';
const OLD_SAVE = /^rubicon_save_([123])$/;
const OLD_SINGLE = 'rubicon_save'; // 更早的版本只有一個存檔
// 存檔相關的鍵另外處理（依選的槽位），其他舊鍵都當成設定照名字搬
const SAVE_KEYS = /^rubicon_save(_\d|_cur|_bk_\d)?$/;
const DBS = [
  ['rubicon-model-library', 'mech-cordon-model-library', '模型庫'],
  ['rubicon-levels', 'mech-cordon-levels', '自訂關卡'],
  ['rubicon-ref-images', 'mech-cordon-ref-images', '參考圖'],
  ['rubicon-paint', 'mech-cordon-paint', '貼圖繪製的自動存檔'],
];

const lsKeys = () => {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
  } catch (e) {}
  return out;
};
const lsGet = (k) => {
  try {
    return localStorage.getItem(k);
  } catch (e) {
    return null;
  }
};
const reqP = (r) =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
// 打開已經存在的資料庫（不存在時回傳 null，而且不留下空的資料庫）
function openExisting(name) {
  return new Promise((res) => {
    let made = false;
    let r;
    try {
      r = indexedDB.open(name);
    } catch (e) {
      return res(null);
    }
    r.onupgradeneeded = () => {
      made = true;
      r.transaction.abort();
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => {
      if (made) indexedDB.deleteDatabase(name);
      res(null);
    };
    r.onblocked = () => res(null);
  });
}
function schemaOf(db) {
  return [...db.objectStoreNames].map((n) => {
    const st = db.transaction(n, 'readonly').objectStore(n);
    return {
      n,
      keyPath: st.keyPath,
      auto: st.autoIncrement,
      idx: [...st.indexNames].map((i) => {
        const x = st.index(i);
        return { i, keyPath: x.keyPath, unique: x.unique, multiEntry: x.multiEntry };
      }),
    };
  });
}
// 目的地的資料庫：沒有時照舊資料庫的版本與結構建立（所以新版程式打開時照常升級）；已經有了而版本較舊時補上缺的物件庫
function openTarget(name, ver, schema) {
  return new Promise((res, rej) => {
    const r = indexedDB.open(name, ver);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const s of schema) {
        if (d.objectStoreNames.contains(s.n)) continue;
        const st = d.createObjectStore(
          s.n,
          s.keyPath == null ? { autoIncrement: s.auto } : { keyPath: s.keyPath, autoIncrement: s.auto },
        );
        for (const x of s.idx) st.createIndex(x.i, x.keyPath, { unique: x.unique, multiEntry: x.multiEntry });
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('資料庫正被其他分頁使用（請關掉模型庫、貼圖繪製的分頁再試）'));
  });
}
async function countDb(name) {
  const db = await openExisting(name);
  if (!db) return -1;
  let n = 0;
  try {
    for (const s of db.objectStoreNames)
      n += await reqP(db.transaction(s, 'readonly').objectStore(s).count());
  } catch (e) {}
  db.close();
  return n;
}
// 一筆一筆複製（模型庫的 GLB 可能很大，不一次全部讀進記憶體）；回傳複製的筆數
async function copyDb(from, to) {
  const src = await openExisting(from);
  if (!src) return 0;
  const schema = schemaOf(src);
  let dst = await openExisting(to);
  if (dst && dst.version < src.version) {
    dst.close();
    dst = null;
  }
  if (!dst) dst = await openTarget(to, src.version, schema);
  let n = 0;
  try {
    for (const s of schema) {
      if (!dst.objectStoreNames.contains(s.n)) continue;
      const keys = await reqP(src.transaction(s.n, 'readonly').objectStore(s.n).getAllKeys());
      for (const k of keys) {
        const v = await reqP(src.transaction(s.n, 'readonly').objectStore(s.n).get(k));
        const t = dst.transaction(s.n, 'readwrite');
        const st = t.objectStore(s.n);
        if (st.keyPath == null) st.put(v, k);
        else st.put(v);
        await new Promise((res, rej) => {
          t.oncomplete = res;
          t.onerror = () => rej(t.error);
          t.onabort = () => rej(t.error);
        });
        n++;
      }
    }
  } finally {
    src.close();
    dst.close();
  }
  return n;
}

Object.assign(Game.prototype, {
  // 舊存檔：三個槽位與更早的單一存檔（單一存檔只在沒有舊槽位 1 時列出，舊版那時已經把它搬進槽位 1）
  legacySaves() {
    const out = [];
    for (const k of lsKeys()) {
      const m = OLD_SAVE.exec(k);
      if (!m) continue;
      const s = this.legacyParse(lsGet(k));
      if (s) out.push({ id: k, slot: Number(m[1]), s, label: `舊存檔 ${m[1]}` });
    }
    if (!lsGet(OLD + 'save_1')) {
      const s = this.legacyParse(lsGet(OLD_SINGLE));
      if (s) out.push({ id: OLD_SINGLE, slot: 1, s, label: '更早版本的單一存檔' });
    }
    out.sort((a, b) => a.slot - b.slot);
    return out.concat(this.legacyFiles || []);
  },
  legacyParse(txt) {
    if (!txt) return null;
    try {
      return this.saveParse(JSON.parse(txt));
    } catch (e) {
      return null;
    }
  },
  legacySettingKeys() {
    return lsKeys().filter((k) => k.startsWith(OLD) && !SAVE_KEYS.test(k));
  },
  // 標題畫面的按鈕：有舊資料時加上提示的標記
  legacyMark() {
    const b = document.getElementById('btnLegacy');
    if (!b) return;
    const has = lsKeys().some((k) => k.startsWith(OLD) || k === OLD_SINGLE);
    b.classList.toggle('hasOld', has);
  },
  openLegacy() {
    this.state = 'legacy';
    this.showScreen('legacy');
    this.legacyMsg('');
    this.legacyRender();
  },
  legacyMsg(t, err) {
    const el = document.getElementById('legacyMsg');
    if (!el) return;
    el.textContent = t;
    el.style.color = err ? 'var(--danger)' : '';
  },
  async legacyRender() {
    const saves = this.legacySaves();
    this.legacyList = saves;
    const done = this.legacyDone || {};
    const slotTxt = (i) => {
      const s = this.readSlot(i);
      return `存檔 ${i}${s ? '（有進度，會覆蓋）' : '（空）'}`;
    };
    const cards = saves
      .map((x, n) => {
        const sel = [1, 2, 3]
          .map((i) => `<option value="${i}"${i === x.slot ? ' selected' : ''}>${slotTxt(i)}</option>`)
          .join('');
        const ok = done[x.id] ? `<span class="good">✓ 已轉存到存檔 ${done[x.id]}</span>` : '';
        return `<div class="saveCard" data-n="${n}"><div class="saveHead"><b>${escHtml(x.label)}</b>${ok}</div>
          <p>${this.saveInfo(x.s).map(escHtml).join(' ｜ ')}</p>
          <p class="dim" style="font-size: 12px">最後遊玩 ${escHtml(this.saveTime(x.s))}</p>
          <div class="row"><label>轉存到 <select data-f="slot">${sel}</select></label>
          <button class="primary" data-act="conv">轉存</button></div></div>`;
      })
      .join('');
    document.getElementById('legacySaves').innerHTML =
      cards ||
      '<p class="dim">這個瀏覽器裡沒有找到舊版的存檔。舊存檔在別的瀏覽器或網址時，先在那裡匯出，再從下面讀取檔案。</p>';
    const keys = this.legacySettingKeys();
    const dbs = await Promise.all(DBS.map(([o]) => countDb(o)));
    if (this.state !== 'legacy') return;
    const dbTxt = DBS.map(([, , name], i) => (dbs[i] >= 0 ? `${name} ${dbs[i]} 筆` : null)).filter(Boolean);
    this.legacyHasData = keys.length > 0 || dbTxt.length > 0;
    document.getElementById('legacyOther').innerHTML =
      keys.length || dbTxt.length
        ? `<p>設定 ${keys.length} 項（按鍵、畫面、音量、出擊地圖、模型庫的設定…）${dbTxt.length ? '；資料庫：' + escHtml(dbTxt.join('、')) : ''}</p>`
        : '<p class="dim">沒有找到舊版的設定與資料庫。</p>';
    document.getElementById('btnLegacyAll').disabled = !this.legacyHasData;
    document.getElementById('btnLegacyDel').disabled = !saves.some((x) => !x.file) && !this.legacyHasData;
  },
  legacyConvert(n) {
    const x = this.legacyList && this.legacyList[n];
    const card = document.querySelector(`#legacySaves [data-n="${n}"]`);
    if (!x || !card) return;
    const to = Number(card.querySelector('[data-f="slot"]').value) || 1;
    const go = () => {
      try {
        localStorage.setItem(NEW + 'save_' + to, JSON.stringify(x.s));
        // 抉擇前備份跟著槽位
        const bk = !x.file && x.slot && lsGet(OLD + 'save_bk_' + x.slot);
        if (bk && x.id !== OLD_SINGLE) localStorage.setItem(NEW + 'save_bk_' + to, bk);
      } catch (e) {
        return this.legacyMsg('寫入失敗（瀏覽器儲存空間不足或被停用）', true);
      }
      if (to === this.saveSlot) this.save = this.loadSave() || this.newSave();
      this.legacyDone = Object.assign({}, this.legacyDone, { [x.id]: to });
      this.legacyMsg(`已把「${x.label}」轉存到存檔 ${to}`);
      this.renderContinue();
      this.legacyRender();
    };
    if (this.readSlot(to))
      return this.uiConfirm(`「${x.label}」會覆蓋存檔 ${to} 目前的進度，確定嗎？`, go, '確定覆蓋');
    go();
  },
  // 設定（照名字搬）與四個資料庫；完成後重新整理頁面，讓設定生效
  legacyConvertAll() {
    this.uiConfirm(
      '舊版的設定會取代目前的設定，模型庫、自訂關卡、參考圖、貼圖繪製的資料會加進目前的資料（同一筆以舊版的為準）。完成後重新整理頁面。確定嗎？',
      async () => {
        let n = 0;
        for (const k of this.legacySettingKeys()) {
          const v = lsGet(k);
          if (v == null) continue;
          try {
            localStorage.setItem(NEW + k.slice(OLD.length), v);
            n++;
          } catch (e) {}
        }
        const rows = [];
        try {
          for (const [o, t, name] of DBS) {
            this.legacyMsg(`轉換中：${name}…`);
            const c = await copyDb(o, t);
            if (c) rows.push(`${name} ${c} 筆`);
          }
        } catch (e) {
          return this.legacyMsg('資料庫轉換失敗：' + (e && e.message), true);
        }
        this.legacyMsg(`已轉換設定 ${n} 項${rows.length ? '、' + rows.join('、') : ''}，重新整理中…`);
        if (window.__legacyNoReload) return;
        setTimeout(() => location.reload(), 900);
      },
      '轉換',
    );
  },
  legacyDelete() {
    this.uiConfirm(
      '刪除這個瀏覽器裡全部的舊版資料（舊存檔、舊設定、舊的資料庫）？還沒轉存的會不見，刪除後無法復原。',
      async () => {
        for (const k of lsKeys()) if (k.startsWith(OLD) || k === OLD_SINGLE) localStorage.removeItem(k);
        for (const [o] of DBS) await reqP(indexedDB.deleteDatabase(o)).catch(() => {});
        this.legacyFiles = (this.legacyFiles || []).filter((x) => x.file);
        this.legacyMsg('已刪除舊版的資料');
        this.legacyMark();
        this.legacyRender();
      },
      '確定刪除',
    );
  },
  // 舊版（或新版）匯出的存檔檔案：加進清單，再選槽位轉存
  async legacyReadFile(file) {
    if (!file) return;
    let s = null;
    try {
      const o = JSON.parse(await file.text());
      if (o && (o.format === 'rubicon-save' || o.format === 'mech-cordon-save')) s = this.saveParse(o.save);
    } catch (e) {}
    if (!s) return this.legacyMsg('不是存檔檔案（.json）', true);
    const id = 'file:' + file.name + ':' + Date.now();
    this.legacyFiles = (this.legacyFiles || []).concat([
      { id, slot: 1, s, file: true, label: '檔案 ' + file.name },
    ]);
    this.legacyMsg(`已讀取「${file.name}」，選一個槽位轉存`);
    this.legacyRender();
  },
  bindLegacy() {
    const $ = (id) => document.getElementById(id);
    $('btnLegacy').onclick = () => {
      SFX.init();
      this.openLegacy();
    };
    $('legacySaves').onclick = (e) => {
      const b = e.target.closest('button[data-act="conv"]');
      const card = b && b.closest('[data-n]');
      if (card) this.legacyConvert(Number(card.dataset.n));
    };
    $('btnLegacyFile').onclick = () => {
      const f = $('legacyFile');
      f.value = '';
      f.click();
    };
    $('legacyFile').onchange = (e) => this.legacyReadFile(e.target.files[0]);
    $('btnLegacyAll').onclick = () => this.legacyConvertAll();
    $('btnLegacyDel').onclick = () => this.legacyDelete();
    $('btnLegacyBack').onclick = () => {
      this.state = 'title';
      this.showScreen('title');
      this.legacyMark();
    };
    this.legacyMark();
  },
});
