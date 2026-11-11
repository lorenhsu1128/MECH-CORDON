// ComfyUI 的 API 客戶端：瀏覽器（經 mech-cordon-server 轉送 /api/comfy）與 Node（命令列 scripts/chargen.js）共用
// 用法：const c = new Comfy(base); const out = await c.run(workflow, { onProgress }); → [{ filename, subfolder, type }]
// - base：ComfyUI 的網址（Node：http://127.0.0.1:8188；瀏覽器：/api/comfy）
// - workflow：API 格式（{ 節點 id: { class_type, inputs } }）
export class Comfy {
  constructor(base) {
    this.base = base.replace(/\/$/, '');
    this.cid = 'mc' + Math.random().toString(36).slice(2, 10);
  }
  url(p) {
    return this.base + p;
  }
  async json(p, opt) {
    const r = await fetch(this.url(p), opt);
    const t = await r.text();
    let d = null;
    try {
      d = JSON.parse(t);
    } catch (e) {
      /* 不是 JSON */
    }
    if (!r.ok) {
      const err = new Error(`ComfyUI ${p}：HTTP ${r.status} ${d?.error?.message || t.slice(0, 300)}`);
      err.detail = d;
      throw err;
    }
    return d;
  }
  async alive() {
    try {
      await this.json('/system_stats');
      return true;
    } catch (e) {
      return false;
    }
  }
  stats() {
    return this.json('/system_stats');
  }
  // 上傳圖片（Blob／Uint8Array），回傳 ComfyUI 裡的檔名（給 LoadImage 用）
  async upload(data, name, sub = 'chargen') {
    const fd = new FormData();
    const blob = data instanceof Blob ? data : new Blob([data], { type: 'image/png' });
    fd.append('image', blob, name);
    fd.append('subfolder', sub);
    fd.append('overwrite', 'true');
    const d = await this.json('/upload/image', { method: 'POST', body: fd });
    return d.subfolder ? `${d.subfolder}/${d.name}` : d.name;
  }
  async view(img) {
    const q = new URLSearchParams({
      filename: img.filename,
      subfolder: img.subfolder || '',
      type: img.type || 'output',
    });
    const r = await fetch(this.url('/view?' + q));
    if (!r.ok) throw new Error('ComfyUI /view：HTTP ' + r.status);
    return new Uint8Array(await r.arrayBuffer());
  }
  async interrupt() {
    await fetch(this.url('/interrupt'), { method: 'POST' });
  }
  wsUrl() {
    const u = new URL(this.base, typeof location !== 'undefined' ? location.href : undefined);
    u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
    u.pathname = u.pathname.replace(/\/$/, '') + '/ws';
    u.search = '?clientId=' + this.cid;
    return u.href;
  }
  // 執行一個工作流程，等它完成，回傳所有輸出節點的圖片
  async run(workflow, { onProgress, timeout = 15 * 60 * 1000 } = {}) {
    const ws = new WebSocket(this.wsUrl());
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Error('連不上 ComfyUI 的 WebSocket'));
    });
    let pid = null;
    const done = new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('ComfyUI 逾時')), timeout);
      ws.onmessage = (ev) => {
        if (typeof ev.data !== 'string') return;
        let m;
        try {
          m = JSON.parse(ev.data);
        } catch (e) {
          return;
        }
        const d = m.data || {};
        if (d.prompt_id && pid && d.prompt_id !== pid) return;
        if (m.type === 'progress' && onProgress) onProgress({ node: d.node, value: d.value, max: d.max });
        if (m.type === 'executing' && onProgress && d.node) onProgress({ node: d.node });
        if (m.type === 'execution_error') {
          clearTimeout(to);
          rej(new Error(`ComfyUI 執行錯誤（${d.node_type}）：${d.exception_message}`));
        }
        if (
          m.type === 'execution_success' ||
          (m.type === 'executing' && d.node === null && d.prompt_id === pid)
        ) {
          clearTimeout(to);
          res();
        }
      };
    });
    try {
      const r = await this.json('/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: workflow, client_id: this.cid }),
      });
      pid = r.prompt_id;
      await done;
    } finally {
      ws.close();
    }
    // 完成的通知有時比歷史紀錄寫入早一點：等到有輸出（最多約 5 秒）
    let outs = {};
    for (let i = 0; i < 25; i++) {
      const h = await this.json('/history/' + pid);
      outs = h[pid]?.outputs || {};
      if (h[pid]?.status?.completed && Object.keys(outs).length) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    const imgs = [];
    for (const [node, o] of Object.entries(outs)) for (const im of o.images || []) imgs.push({ ...im, node });
    return imgs;
  }
}
