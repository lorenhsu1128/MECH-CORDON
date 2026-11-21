// 載入畫面與轉場畫面的提示（2026-11-16 使用者定案）：ECHO 的口吻、ECHO 的小頭像、按鈕寫功能名稱＋依裝置的鍵帽、
// 沒遇過的不出現、依下一段的情境與裝備加權。手寫的提示在 data/tips.js；敵人、Boss、宿敵的情報這裡從遊戲資料產生。
// 顯示在全畫面的載入畫面 #lcTip（render-setup.js 的 loadCover）與主線的轉場畫面 #ctTip（campaign.js 的 campShowTrans），
// 停留超過 TIP_ROT 秒換下一則。設定「載入提示」ctrl.tips（on／off）。
import { escHtml } from '../core/html.js';
import { weakText, weaponAttr } from '../data/attrs.js';
import { SORTIES, sortieBoss } from '../data/campaign.js';
import { BEAST_DEFS, BEAST_TIPS } from '../data/beasts.js';
import { BOSS_DEFS, ENEMY_TYPES } from '../data/enemies.js';
import { ACES, FOES } from '../data/foes.js';
import { weaponById } from '../data/parts.js';
import { BTN, TIPS, TIP_CATS, tipPick, tipText } from '../data/tips.js';
import { Game } from './game.js';

const TIP_ROT = 6; // 停留幾秒換下一則
const RECENT_N = 24; // 最近看過的幾則不重複
const RECENT_KEY = 'mech_cordon_tips_recent';

// 「名稱：說明」或「名稱 — 說明」→ 去掉開頭的名稱（提示卡另外寫名稱）
function introBody(intro, name) {
  let s = String(intro || '').trim();
  for (const sep of ['：', ' — ', '—']) {
    const i = s.indexOf(sep);
    if (i > 0 && i <= Math.max(18, (name || '').length + 4)) return s.slice(i + sep.length).trim();
  }
  return s;
}

// 情報（敵人、Boss、宿敵）：遊戲資料的介紹＋弱點。g＝鎖住條件：{ kind: 'foes'|'aces'|'bosses', key }（沒遇過不抽）
let INTEL = null;
function intelTips() {
  if (INTEL) return INTEL;
  INTEL = [];
  const add = (id, name, intro, res, laserK, o) => {
    if (!intro) return;
    const wt = weakText(res, laserK);
    const body = introBody(intro, name);
    INTEL.push({
      id,
      c: 'intel',
      t: `「${name}」：${body}${/[。！？]$/.test(body) ? '' : '。'}${wt ? `（${wt}）` : ''}`,
      ...o,
    });
  };
  // 一般的特殊敵人（每張地圖都會遇到）：不鎖
  for (const k in ENEMY_TYPES) {
    const d = ENEMY_TYPES[k];
    add('ie_' + k, d.name || k, d.intro, d.res, d.laserK, { w: 0.5 });
  }
  // 主題專屬敵人：遇過才出現；下一段是那個主題時加權
  for (const k in FOES) {
    const d = FOES[k];
    if (d.spawnOnly && !d.intro) continue;
    add('if_' + k, d.name || k, d.intro, d.res, d.laserK, {
      seen: { kind: 'foes', key: k },
      ftheme: d.theme,
      w: 0.7,
    });
  }
  // 宿敵（具名的敵對機甲）
  for (const k in ACES) {
    const d = ACES[k];
    add('ia_' + k, d.name || k, d.intro, d.res, null, {
      seen: { kind: 'aces', key: k },
      ftheme: d.theme,
      w: 0.6,
    });
  }
  // Boss：模擬器的紀錄以 kind 記（沒有 kind 的一般大型 Boss 記不到，不出現）
  for (const b of BOSS_DEFS) {
    if (!b.kind) continue;
    add('ib_' + b.kind, b.name, b.intro, b.res, null, {
      seen: { kind: 'bosses', key: b.kind },
      bkind: b.kind,
      w: 0.6,
    });
  }
  // 機獸（docs/beast-script.md）：介紹＋手寫的對策，主線打過才出現
  for (const b of BEAST_DEFS) {
    const o = { seen: { kind: 'bosses', key: b.kind }, bkind: b.kind, w: 0.6 };
    add('ib_' + b.kind, b.name, b.intro, b.res, null, o);
    (BEAST_TIPS[b.beast] || []).forEach((t, i) =>
      add(`ib_${b.kind}_${i}`, b.name, `${b.name} — ${t}`, null, null, o),
    );
  }
  return INTEL;
}

Object.assign(Game.prototype, {
  // 目前的操作裝置：觸控（虛擬按鈕）／手把／鍵盤
  tipDev() {
    if (this.touchActive || (this.vpadWanted && this.vpadWanted())) return 'touch';
    if (this.padActive && this.padConnected) return 'pad';
    return 'kb';
  },
  // 情境：下一段（轉場畫面）或這一段（載入畫面）的主題、區段類型、Boss；主線的進度與周目；裝備的特徵
  tipCtx() {
    const S = this.save || {},
      st = S.story || {},
      seen = st.seen2 || {};
    const c = this.camp || null;
    let theme = this.worldTheme || (this.world && this.world.themeKey) || '',
      seg = '',
      bd = null,
      ch = 0;
    if (c && this.campSortie) {
      const so = this.campSortie(),
        sg = so && so.segs[c.seg];
      if (sg) {
        theme = sg.theme;
        seg = this.campSegType();
        bd = sortieBoss(sg, seg);
      }
      ch = (so && so.chapter) || 0;
    } else if (this.campC && this.campC.view) seg = this.campC.view.type || '';
    if (!seg) seg = this.isBossLevel ? 'boss' : 'battle';
    for (const k in st.done || {}) if (SORTIES[k] && SORTIES[k].chapter > ch) ch = SORTIES[k].chapter;
    const equip = new Set();
    const asm = S.asm || {};
    const attrs = new Set();
    for (const slot of ['rarm', 'larm', 'rback', 'lback']) {
      const d = weaponById(asm[slot]);
      if (!d || !d.type || d.type === 'none') continue;
      if (d.type === 'melee') equip.add('melee');
      if (d.type === 'missile') equip.add('missile');
      if (asm[slot] === 'bw_sh') equip.add('shield');
      if (d.type !== 'shield') attrs.add(weaponAttr(d));
    }
    for (const a of attrs) equip.add(a);
    if (attrs.size >= 2) equip.add('mix');
    else if (attrs.size === 1) equip.add('mono');
    return {
      dev: this.tipDev(),
      theme,
      seg,
      boss: seg === 'boss',
      bd,
      camp: !!(c || this.campC),
      air: seg === 'air' || theme === 'airspace' || !!this.airMode,
      ch,
      cyc: st.cycle || 1,
      bossSeen: Object.keys(seen.bosses || {}).length > 0,
      seen,
      equip,
    };
  },
  // 這個情境能抽的全部提示：手寫的＋情報（沒遇過的拿掉，下一段的主題與 Boss 加權）
  tipList(ctx) {
    const out = TIPS.slice();
    for (const t of intelTips()) {
      if (t.seen && !(ctx.seen[t.seen.kind] || {})[t.seen.key]) continue;
      let w = t.w || 1;
      if (t.ftheme && t.ftheme === ctx.theme) w *= 6;
      if (t.bkind && ctx.bd && ctx.bd.kind === t.bkind) w *= 20; // 下一段要打的 Boss（遇過才會出現）
      out.push(w === t.w ? t : { ...t, w });
    }
    return out;
  },
  tipRecent() {
    try {
      const a = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  },
  tipRemember(id) {
    const a = this.tipRecent().filter((x) => x !== id);
    a.push(id);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(a.slice(-RECENT_N)));
    } catch (e) {}
  },
  // 按鈕的鍵帽（依裝置、玩家改過的按鍵）
  tipChip(key, dev) {
    if (key === 'melee') {
      // 近戰武器：拿著近戰武器的那隻手的武器鍵
      const asm = (this.save && this.save.asm) || {};
      const ks = [];
      for (const [slot, a] of [
        ['rarm', 'fireR'],
        ['larm', 'fireL'],
      ]) {
        const d = weaponById(asm[slot]);
        if (d && d.type === 'melee') ks.push(a);
      }
      return this.tipKeys(ks.length ? ks : ['fireR', 'fireL'], dev);
    }
    const b = BTN[key];
    if (!b) return '';
    if (dev === 'touch') return b.touch || '';
    if (dev === 'pad' && b.pad === null) return '';
    if (dev === 'kb' && b.kb) return b.kb;
    return b.k ? this.tipKeys(b.k, dev) : '';
  },
  tipKeys(acts, dev) {
    const m = dev === 'pad' ? this.padmap || {} : this.keymap || {};
    const lab = (c) => (dev === 'pad' ? this.padLabel(c) : this.keyLabel(c));
    return acts
      .map((a) => m[a])
      .filter(Boolean)
      .map(lab)
      .join('／');
  },
  // 提示的 HTML：文字跳脫後把 {按鈕} 換成「名稱」＋鍵帽
  tipHtml(txt, dev) {
    return escHtml(txt).replace(/\{(\w+)\}/g, (m, k) => {
      const name = k === 'melee' ? '近戰武器' : BTN[k] ? BTN[k].name : k;
      const chip = this.tipChip(k, dev);
      return `<b class="tipB">「${escHtml(name)}」鈕${chip ? `<kbd>${escHtml(chip)}</kbd>` : ''}</b>`;
    });
  },
  // 在 el（#lcTip／#ctTip）顯示一則，之後每 TIP_ROT 秒換一則，元素看不到時停下
  // force＝指定這一則（截圖與冒煙測試用）
  tipStart(id, force) {
    const el = document.getElementById(id);
    if (!el) return;
    const T = (this.tipTimers = this.tipTimers || {});
    clearTimeout(T[id]);
    if ((this.ctrl && this.ctrl.tips) === 'off') {
      el.innerHTML = '';
      return;
    }
    const show = () => {
      const ctx = this.tipCtx();
      const list = this.tipList(ctx);
      const tip = (force && list.find((t) => t.id === force)) || tipPick(list, ctx, this.tipRecent());
      if (!tip) {
        el.innerHTML = '';
        return;
      }
      this.tipRemember(tip.id);
      const face = this.ptFaceUrl ? this.ptFaceUrl('echo', null, 44) : null;
      el.innerHTML =
        `<div class="tipFace">${face ? `<img src="${face}" alt="">` : '<i></i>'}</div>` +
        `<div class="tipMain"><div class="tipHd"><span class="tipTag">TIPS</span>` +
        `<span class="tipCat">${escHtml(TIP_CATS[tip.c] || '')}</span><span class="tipWho">ECHO</span></div>` +
        `<div class="tipTx">${this.tipHtml(tipText(tip, ctx.dev), ctx.dev)}</div></div>`;
      el.dataset.tip = tip.id;
      // 頭像第一次要等立繪載入：晚一點補上
      if (!face && this.ptFaceUrl)
        setTimeout(() => {
          const u = this.ptFaceUrl('echo', null, 44),
            f = el.querySelector('.tipFace');
          if (u && f && el.dataset.tip === tip.id) f.innerHTML = `<img src="${u}" alt="">`;
        }, 900);
      el.classList.remove('tipIn');
      void el.offsetWidth;
      el.classList.add('tipIn');
    };
    show();
    const next = () => {
      T[id] = setTimeout(() => {
        if (!el.offsetParent) return; // 看不到了（載入完成、離開轉場）：停下
        show();
        next();
      }, TIP_ROT * 1000);
    };
    next();
  },
  tipStop(id) {
    const T = this.tipTimers || {};
    clearTimeout(T[id]);
  },
});
