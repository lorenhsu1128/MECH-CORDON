// 角色資料的存取：mech-cordon-server 的立繪工房 API（server-studio.js，docs/portrait-studio-design.md），瀏覽器與 Node 共用
// base：伺服器網址（瀏覽器用 ''＝同一個網站）；project：專案 id（沒給或 mech_cordon＝遊戲本身，用舊的 /api/chars）
export const LINKED = 'mech_cordon';
async function req(url, opt = {}) {
  const r = await fetch(url, opt);
  if (!r.ok) {
    let msg = 'HTTP ' + r.status;
    try {
      msg = (await r.json()).error || msg;
    } catch (e) {
      /* 不是 JSON */
    }
    throw new Error(`${url.replace(/^https?:\/\/[^/]+/, '')}：${msg}`);
  }
  return r;
}

export class CharStore {
  constructor(base = '', project = LINKED) {
    this.base = base.replace(/\/$/, '');
    this.project = project || LINKED;
    this.root = this.project === LINKED ? '/api/chars' : `/api/studio/p/${this.project}/chars`;
  }
  req(p, opt) {
    return req(this.base + p, opt);
  }
  async list() {
    return (await this.req(this.root)).json();
  }
  async getCard(id) {
    try {
      return await (await this.req(`${this.root}/${id}`)).json();
    } catch (e) {
      return null;
    }
  }
  async putCard(card) {
    const r = await this.req(`${this.root}/${card.id}`, { method: 'PUT', body: JSON.stringify(card) });
    card.t = (await r.json()).t;
  }
  async delChar(id) {
    await this.req(`${this.root}/${id}`, { method: 'DELETE' });
  }
  workUrl(id, name) {
    return `${this.base}${this.root}/${id}/work/${encodeURIComponent(name)}`;
  }
  fileUrl(id, name) {
    return `${this.base}${this.root}/${id}/file/${encodeURIComponent(name)}`;
  }
  async listWork(id) {
    return (await this.req(`${this.root}/${id}/work`)).json();
  }
  async getWork(id, name) {
    return new Uint8Array(
      await (await this.req(`${this.root}/${id}/work/${encodeURIComponent(name)}`)).arrayBuffer(),
    );
  }
  async putWork(id, name, data) {
    await this.req(`${this.root}/${id}/work/${encodeURIComponent(name)}`, { method: 'PUT', body: data });
  }
  async delWork(id, name) {
    await this.req(`${this.root}/${id}/work/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }
  async listFiles(id) {
    return (await this.req(`${this.root}/${id}/file`)).json();
  }
  async putFile(id, name, data) {
    await this.req(`${this.root}/${id}/file/${encodeURIComponent(name)}`, { method: 'PUT', body: data });
  }
  async delFile(id, name) {
    await this.req(`${this.root}/${id}/file/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }
}

// 專案：清單、建立、設定、刪除、專案的參考圖、zip 的下載與匯入
export class StudioStore {
  constructor(base = '') {
    this.base = base.replace(/\/$/, '');
  }
  req(p, opt) {
    return req(this.base + p, opt);
  }
  async projects() {
    return (await this.req('/api/studio/projects')).json();
  }
  async create(id, name, note = '') {
    return (
      await this.req('/api/studio/projects', { method: 'POST', body: JSON.stringify({ id, name, note }) })
    ).json();
  }
  async get(pid) {
    return (await this.req(`/api/studio/p/${pid}`)).json();
  }
  async put(conf) {
    return (await this.req(`/api/studio/p/${conf.id}`, { method: 'PUT', body: JSON.stringify(conf) })).json();
  }
  async remove(pid) {
    await this.req(`/api/studio/p/${pid}?confirm=${pid}`, { method: 'DELETE' });
  }
  refUrl(pid, name) {
    return `${this.base}/api/studio/p/${pid}/refs/${encodeURIComponent(name)}`;
  }
  async refs(pid) {
    return (await this.req(`/api/studio/p/${pid}/refs`)).json();
  }
  async putRef(pid, name, data) {
    await this.req(`/api/studio/p/${pid}/refs/${encodeURIComponent(name)}`, { method: 'PUT', body: data });
  }
  async delRef(pid, name) {
    await this.req(`/api/studio/p/${pid}/refs/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }
  // what：all（工作資料：角色卡、候選、參考圖、發佈）／out（成品：portrait.json＋WebP）；char 沒給＝整個專案
  zipUrl(pid, { char, what = 'all' } = {}) {
    const q = new URLSearchParams({ what });
    if (char) q.set('char', char);
    return `${this.base}/api/studio/p/${pid}/zip?${q}`;
  }
  // zip 匯入到專案（專案還沒有時建立）：回傳 { project, chars, files, skipped }
  async importZip(pid, data) {
    return (await this.req(`/api/studio/import/${pid}`, { method: 'POST', body: data })).json();
  }
}

// 參考圖與上傳的圖的檔名：伺服器把 PNG／JPG 轉成 WebP
export const refName = () => `ref_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.webp`;
