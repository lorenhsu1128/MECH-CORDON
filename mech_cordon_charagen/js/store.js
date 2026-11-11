// 角色資料的存取：mech-cordon-server 的 /api/chars（server-chargen.js），瀏覽器與 Node 共用
// base：伺服器網址（瀏覽器用 ''＝同一個網站）
export class CharStore {
  constructor(base = '') {
    this.base = base.replace(/\/$/, '');
  }
  async req(p, opt = {}) {
    const r = await fetch(this.base + p, opt);
    if (!r.ok) {
      let msg = 'HTTP ' + r.status;
      try {
        msg = (await r.json()).error || msg;
      } catch (e) {
        /* 不是 JSON */
      }
      throw new Error(`${p}：${msg}`);
    }
    return r;
  }
  async list() {
    return (await this.req('/api/chars')).json();
  }
  async getCard(id) {
    try {
      return await (await this.req(`/api/chars/${id}`)).json();
    } catch (e) {
      return null;
    }
  }
  async putCard(card) {
    const r = await this.req(`/api/chars/${card.id}`, { method: 'PUT', body: JSON.stringify(card) });
    card.t = (await r.json()).t;
  }
  workUrl(id, name) {
    return `${this.base}/api/chars/${id}/work/${encodeURIComponent(name)}`;
  }
  fileUrl(id, name) {
    return `${this.base}/api/chars/${id}/file/${encodeURIComponent(name)}`;
  }
  async listWork(id) {
    return (await this.req(`/api/chars/${id}/work`)).json();
  }
  async getWork(id, name) {
    return new Uint8Array(
      await (await this.req(`/api/chars/${id}/work/${encodeURIComponent(name)}`)).arrayBuffer(),
    );
  }
  async putWork(id, name, data) {
    await this.req(`/api/chars/${id}/work/${encodeURIComponent(name)}`, { method: 'PUT', body: data });
  }
  async delWork(id, name) {
    await this.req(`/api/chars/${id}/work/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }
  async listFiles(id) {
    return (await this.req(`/api/chars/${id}/file`)).json();
  }
  async putFile(id, name, data) {
    await this.req(`/api/chars/${id}/file/${encodeURIComponent(name)}`, { method: 'PUT', body: data });
  }
  async delFile(id, name) {
    await this.req(`/api/chars/${id}/file/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }
}
