// 伺服器上的模型組（只在從 rubicon-server 的網址開啟時）：
// - ServerModels：伺服器預設組（所有分類）。敵人、AI 機甲、載具、地圖物件，以及沒上傳模型組的玩家都用它
// - RemoteSets：玩家上傳的模型組（依內容雜湊下載、解析並快取）；多人時每台玩家機甲用它主人的那一組
// - uploadSet：把本地模型庫的一組打包上傳（內容相同時伺服器已有就不再上傳）
// 模型組物件 { id, name, model(slot, pal, unique), joints } 就是 buildMech 的 opts.source
import { sha256Hex } from '../core/sha256.js';
import { SERVER_SET, instanceOf, parseTemplate, slotChain } from './local-models.js';
import { packSetData, unpackSet } from './set-pack.js';

export const onServer = () => typeof window !== 'undefined' && !!window.RUBICON_SERVER;
const tick = () => new Promise((r) => setTimeout(r, 0));
const slotUrl = (slot) => slot.split('/').map(encodeURIComponent).join('/');

export class ModelSet {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.tpls = new Map(); // 槽位 → { tpl, err, name }
    this.joints = {};
    this.asm = null;
    this.tinted = new WeakMap();
    this.uses = new Map();
  }
  template(slot) {
    for (const s of slotChain(slot)) {
      const e = this.tpls.get(s);
      if (e) return e.tpl || null;
    }
    return null;
  }
  model(slot, pal, unique = false) {
    const tpl = this.template(slot);
    if (!tpl) return null;
    this.uses.set(slot, (this.uses.get(slot) || 0) + 1);
    return instanceOf(tpl, slot, pal, unique, this.tinted);
  }
  stats() {
    const all = [...this.tpls.values()];
    return {
      glb: all.filter((e) => e.tpl).length,
      fail: all.filter((e) => !e.tpl).length,
      joints: Object.values(this.joints).reduce((n, c) => n + Object.keys(c).length, 0),
    };
  }
}
async function parseEntry(buf, name) {
  try {
    const { root } = await parseTemplate(buf);
    return { tpl: root, err: null, name };
  } catch (e) {
    return { tpl: null, err: e.message || String(e), name };
  }
}

// ---------- 伺服器預設組 ----------
// 比對：清單的 rev 沒變就整份沿用；rev 變了只下載、解析雜湊不同的 GLB（網址帶雜湊，伺服器標成 immutable，
// 重開網頁也是從瀏覽器快取拿）。解析結果只在這一頁的記憶體裡，所以每次開網頁都要解析一次：遊戲啟動就在背景讀
// （game/local-lib.js 的 lmInit），出擊入口以 srvGate 等它讀完。watch：伺服器的 rev 改變時主動通知（/ws-models）
const PARSE_N = 4; // 同時解析幾個（等貼圖在背景解碼的空檔讓別的檔案用）
class ServerModelLib {
  constructor() {
    this.set = null;
    this.rev = null;
    this.byHash = new Map(); // GLB 雜湊 → 解析結果（重新讀取時沒變的檔案沿用）
    this.loading = null;
    this.error = null;
    this.prog = null; // 讀取中：{ done, total, id }（只有要下載或解析檔案時才有 total）
    this.progress = new Set(); // (done, total, id) → void：讀取進度
    this.ws = null;
  }
  // 讀取中（還沒讀完）
  busy() {
    return !!this.loading;
  }
  // 重新讀取（manifest 的 rev 沒變就沿用）；onProgress(完成數, 總數, 槽位)：這一次讀取的進度
  refresh(onProgress) {
    if (!onServer()) return Promise.resolve(null);
    if (onProgress) {
      this.progress.add(onProgress);
      if (this.prog) onProgress(this.prog.done, this.prog.total, this.prog.id);
    }
    if (this.loading) return this.loading.finally(() => this.progress.delete(onProgress));
    this.loading = this._refresh()
      .catch((e) => {
        this.error = e.message || String(e);
        console.warn('伺服器模型組讀取失敗', e);
        return null;
      })
      .finally(() => {
        this.loading = null;
        this.prog = null;
        this.progress.clear();
      });
    return this.loading;
  }
  _step(done, total, id) {
    this.prog = { done, total, id };
    for (const f of this.progress) f(done, total, id);
  }
  async _refresh() {
    const r = await fetch('/api/models/default', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const m = await r.json();
    this.error = null;
    if (this.set && m.rev === this.rev) return this.set;
    const set = new ModelSet(SERVER_SET, m.name || '伺服器預設組');
    set.joints = m.joints || {};
    set.asm = m.asm || null;
    const list = Object.entries(m.models || {});
    const keep = new Map();
    const pend = new Map(); // 雜湊 → 解析中的 Promise（兩個槽位同一個檔案只解析一次）
    const todo = list.filter(([, info]) => !this.byHash.has(info.h)).length;
    let done = 0;
    if (todo) this._step(0, todo, '');
    const one = async (slot, info) => {
      let e = this.byHash.get(info.h);
      if (!e) {
        if (!pend.has(info.h))
          pend.set(
            info.h,
            (async () => {
              await tick();
              const res = await fetch(`/api/models/default/glb/${slotUrl(slot)}?h=${info.h}`);
              return res.ok
                ? await parseEntry(await res.arrayBuffer(), info.name)
                : { tpl: null, err: 'HTTP ' + res.status, name: info.name };
            })(),
          );
        e = await pend.get(info.h);
        done++;
        this._step(done, todo, slot);
      }
      keep.set(info.h, e);
      set.tpls.set(slot, { ...e, name: info.name });
    };
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        const [slot, info] = list[i++];
        await one(slot, info);
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARSE_N, list.length) }, worker));
    this.byHash = keep;
    this.set = set;
    this.rev = m.rev;
    return set;
  }
  // 伺服器的 rev 改變時通知（WebSocket /ws-models；斷線後重連）；onRev(rev)：和目前讀到的不同時呼叫
  watch(onRev) {
    if (!onServer() || this.ws || typeof WebSocket === 'undefined') return;
    let wait = 2000;
    const open = () => {
      let ws;
      try {
        ws = new WebSocket(
          (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws-models',
        );
      } catch (e) {
        return;
      }
      this.ws = ws;
      ws.onopen = () => (wait = 2000);
      ws.onmessage = (ev) => {
        let o;
        try {
          o = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        if (o && o.t === 'rev' && o.rev !== this.rev) onRev(o.rev);
      };
      ws.onclose = () => {
        setTimeout(open, wait);
        wait = Math.min(wait * 2, 60000);
      };
    };
    open();
  }
  source() {
    return this.set;
  }
  model(slot, pal, unique) {
    return this.set ? this.set.model(slot, pal, unique) : null;
  }
}
export const ServerModels = new ServerModelLib();

// ---------- 玩家上傳的模型組 ----------
class RemoteSetLib {
  constructor() {
    this.sets = new Map(); // 雜湊 → { state: 'loading'|'ok'|'err', set, err, promise }
    this.listeners = new Set(); // (雜湊) → void：下載完成（成功或失敗）
  }
  get(h) {
    const e = h && this.sets.get(h);
    return e && e.state === 'ok' ? e.set : null;
  }
  state(h) {
    const e = h && this.sets.get(h);
    return e ? e.state : null;
  }
  load(h) {
    if (!h || !onServer()) return Promise.resolve(null);
    let e = this.sets.get(h);
    if (e) return e.promise;
    e = { state: 'loading', set: null, err: null };
    this.sets.set(h, e);
    e.promise = (async () => {
      const r = await fetch(`/api/sets/${h}`);
      if (!r.ok) throw new Error(r.status === 404 ? '伺服器上沒有這個模型組' : 'HTTP ' + r.status);
      const data = await unpackSet(await r.arrayBuffer());
      const set = new ModelSet('set:' + h, data.name);
      set.joints = data.joints;
      set.asm = data.asm;
      for (const rec of data.recs) {
        await tick();
        set.tpls.set(rec.id, await parseEntry(rec.buf, rec.name));
      }
      e.state = 'ok';
      e.set = set;
      return set;
    })()
      .catch((err) => {
        e.state = 'err';
        e.err = err.message || String(err);
        console.warn('模型組下載失敗', h, err);
        return null;
      })
      .then((set) => {
        for (const fn of this.listeners) fn(h);
        return set;
      });
    return e.promise;
  }
}
export const RemoteSets = new RemoteSetLib();

// 打包並上傳模型組（data 同 packSetData）→ { hash, size, uploaded }；伺服器已有同一組時不上傳
export async function uploadSet(data) {
  const blob = packSetData(data, { stable: true });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const hash = sha256Hex(bytes);
  const chk = await fetch(`/api/sets/${hash}?check=1`, { cache: 'no-store' });
  if (chk.ok && (await chk.json()).exists) return { hash, size: bytes.length, uploaded: false };
  const r = await fetch(`/api/sets/${hash}`, { method: 'PUT', body: bytes });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try {
      msg = (await r.json()).error || msg;
    } catch (e) {}
    throw new Error(msg);
  }
  return { hash, size: bytes.length, uploaded: true };
}
