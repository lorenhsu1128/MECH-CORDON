// ============================================================
//  Game：地圖預覽器的 Boss 擂台、友軍、畫面（docs/map-viewer-design.md 第 3 期）
//  - Boss 擂台：任選一隻 Boss（BOSS_DEFS）與刁鑽度，地圖換成 Boss 關的開闊版；按鈕：下一型態、大招（蓄力／立刻放出）、
//    打斷大招、打出失衡、打壞部位、回滿；面板顯示型態、AP、失衡、蓄力、裝甲殼、部位
//  - 友軍：藍隊的具名 AC（交戰，看子彈與特效）
//  - 畫面：渲染風格切換（只在預覽器，不改遊戲的選擇）、左右比較、解析度、完整的畫面設定
// ============================================================
import { escHtml } from '../core/html.js';
import { AC_ROSTER, BOSS_DEFS, BOSS_PHASES, enemyScale } from '../data/enemies.js';
import { bossDefIndex, freeTier } from '../data/boss-tier.js';
import { MechEntity } from '../entities/mech-entity.js';
import { PALETTES } from '../render/materials.js';
import { StyleStore } from '../render/style/store.js';
import { corridorSpec, THEMES } from '../world/world.js';
import { Game } from './game.js';

const $ = (id) => document.getElementById(id);
const ROSTER = Object.keys(AC_ROSTER);
const RES = [1, 0.85, 0.7, 0.6, 0.5];

Object.assign(Game.prototype, {
  // ---------- Boss 擂台 ----------
  mapvBossDef() {
    const f = this.mapv.f;
    return BOSS_DEFS[Math.max(0, Math.min(BOSS_DEFS.length - 1, f.boss | 0))];
  },
  // 這張地圖能不能排這隻 Boss（主題的 bossBan、武裝列車要有鐵路）：不行時回傳可以的主題
  mapvBossTheme(theme) {
    const bd = this.mapvBossDef();
    const fits = (k) =>
      !(THEMES[k].bossBan || []).includes(bd.kind) &&
      !(bd.rail && !corridorSpec(THEMES[k]).kinds.includes('rail'));
    if (fits(theme)) return theme;
    return Object.keys(THEMES).find(fits) || theme;
  },
  mapvSpawnBoss() {
    const f = this.mapv.f;
    const bd = this.mapvBossDef();
    const L = f.lv;
    const sc = enemyScale(L, 1);
    this.scaleHp = sc.hp;
    this.scaleDmg = sc.dmg;
    this.isBossLevel = true;
    const tier = f.tier === 'auto' ? freeTier(bossDefIndex(bd)) : Number(f.tier) || 0;
    this.spawnBossDef(bd, sc.hp, sc.dmg, tier);
    // 操作時的 HUD：Boss 的血條（同 startMission）
    $('bossBar').style.display = 'block';
    $('bossName').textContent = this.bossDef ? this.bossDef.name : bd.name;
    // 鏡頭對著 Boss
    if (this.boss) this.mapvSetTgt(this.boss);
  },
  mapvBossLive() {
    return (this.bosses || []).filter((b) => !b.dead);
  },
  // 按鈕的動作（Boss 本體；雙 AC 時兩台都做）
  mapvBossAct(a) {
    const P = this.player;
    for (const b of this.mapvBossLive()) {
      const s = b.tierState ? b.tierState() : {};
      const ph = b.bossPhase ? b.bossPhase() : 1;
      if (a === 'phase') {
        // 下一型態：這個型態的大招算放過、裝甲殼拿掉，AP 落到下一個門檻底下
        if (ph >= 3) continue;
        (s.bigDone = s.bigDone || {})[ph] = 1;
        s.shell = null;
        b.hp = Math.min(b.hp, b.maxHp * BOSS_PHASES[ph - 1] - 1);
      } else if (a === 'big') {
        // 蓄力中＝立刻放出；否則馬上開始蓄力（刁鑽度 0 的沒有大招）
        if (s.ch) s.ch.t = s.ch.T;
        else s.cdI = 0;
      } else if (a === 'interrupt') {
        if (s.ch && b.tierInterrupt) b.tierInterrupt(P);
      } else if (a === 'stag') {
        // 直接過載（不經過 takeDamage：護盾、無敵、部位減傷會把衝擊擋掉），秒數照刁鑽度的規則
        b.stagGuardT = 0;
        b.acs = b.acsMax;
        b.staggerT = b.tierStagT ? b.tierStagT(1.5) : 1.5;
        this.fx.ring(b.center(), 4, 0xffb020);
        if (this.fbBreak) this.fbBreak(b, P);
      } else if (a === 'part') {
        const pt = this.enemies.find((e) => !e.dead && e.opts && e.opts.parent === b.id && e !== b);
        if (pt) pt.takeDamage(pt.hp + 10, 0, P, null, null, null, null, 'none');
      } else if (a === 'full') {
        b.hp = b.maxHp;
        b.phDone = 1;
        b.staggerT = 0;
        this.bossAdds = {};
        if (b.bt) {
          b.bt.bigDone = {};
          b.bt.held = {};
          b.bt.shellDone = {};
          b.bt.shell = null;
          b.bt.ch = null;
        }
      }
    }
    this.mapvBossUi();
  },
  // 面板：每台 Boss 的狀態
  mapvBossUi() {
    const box = $('mvBossInfo');
    if (!box) return;
    const L = (this.bosses || []).filter(Boolean);
    if (!L.length) {
      box.innerHTML = '<span class="dim">沒有 Boss</span>';
      return;
    }
    box.innerHTML = L.map((b) => {
      const s = b.bt || {};
      const ph = b.bossPhase ? b.bossPhase() : 1;
      const parts = this.enemies.filter((e) => !e.dead && e.opts && e.opts.parent === b.id && e !== b).length;
      const st = b.dead
        ? '擊破'
        : [
            `第 ${ph} 型態`,
            `AP ${Math.round((b.hp / b.maxHp) * 100)}%`,
            b.staggerT > 0 ? '失衡中' : '',
            s.ch ? `蓄力：${s.ch.name}（${Math.round((s.ch.t / s.ch.T) * 100)}%）` : '',
            s.shell ? '裝甲殼' : '',
            parts ? `部位 ${parts}` : '',
            b.bossTier ? `刁鑽度 ${b.bossTier()}` : '',
          ]
            .filter(Boolean)
            .join('・');
      return `<div><b>${escHtml(b.name)}</b><br><span class="dim">${escHtml(st)}</span></div>`;
    }).join('');
  },
  mapvBossHtml() {
    const f = this.mapv.f;
    const opt = (v, t, cur) =>
      `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${t}</option>`;
    const bossOpts = BOSS_DEFS.map((b, i) => opt(i, escHtml(b.name), f.boss)).join('');
    const tiers = opt('auto', '依自由出擊', f.tier) + opt(0, '不套用（原本的機制）', f.tier);
    let t2 = '';
    for (let i = 1; i <= 8; i++) t2 += opt(i, '刁鑽度 ' + i, f.tier);
    const want = this.mapvBossTheme(this.mapv.p.theme);
    const note =
      want !== this.mapv.p.theme
        ? `<div class="mvnote">這隻 Boss 不排在「${escHtml(THEMES[this.mapv.p.theme].name)}」，改在「${escHtml(THEMES[want].name)}」</div>`
        : '';
    return `
      <div class="mvrow"><span>Boss</span><select data-fb="boss">${bossOpts}</select></div>
      <div class="mvrow"><span>刁鑽度</span><select data-fb="tier">${tiers}${t2}</select></div>
      ${note}
      <div class="mvacts mvgrid">
        <button data-ba="phase" title="AP 落到下一個型態的門檻（這個型態的大招算放過）">下一型態</button>
        <button data-ba="big" title="馬上開始蓄力；蓄力中再按＝立刻放出">大招</button>
        <button data-ba="interrupt" title="蓄力中：打斷（長時間失衡＋彈藥箱）">打斷大招</button>
        <button data-ba="stag" title="ACS 過載＝失衡">打出失衡</button>
        <button data-ba="part" title="打壞一個部位（招式或機能跟著停用）">打壞部位</button>
        <button data-ba="full" title="AP 回滿、回到第一型態">回滿</button>
      </div>
      <div class="mvinfo1" id="mvBossInfo"></div>`;
  },
  mapvBindBoss() {
    const f = this.mapv.f;
    const body = $('mvBody');
    for (const el of body.querySelectorAll('[data-fb]'))
      el.onchange = () => {
        const k = el.dataset.fb;
        f[k] = k === 'boss' ? Number(el.value) : el.value === 'auto' ? 'auto' : Number(el.value);
        this.mapvGenerate();
      };
    for (const b of body.querySelectorAll('[data-ba]')) b.onclick = () => this.mapvBossAct(b.dataset.ba);
    this.mapvBossUi();
  },
  // ---------- 友軍（交戰） ----------
  mapvSpawnAllies() {
    const n = this.mapv.f.allies | 0;
    const p = this.player;
    for (let i = 0; i < n; i++) {
      const r = AC_ROSTER[ROSTER[i % ROSTER.length]];
      const e = new MechEntity(this, r.asm, PALETTES[r.pal] || PALETTES.enemy, {
        name: r.name,
        pal: r.pal,
        palKey: r.pal,
        ai: r.ai,
        wantDist: r.wantDist,
        speedMul: r.speedMul,
        turnRate: r.turnRate,
        hpMul: r.hpMul,
        dmgMul: r.dmgMul,
        stabMul: r.stabMul,
        team: 'ally',
        allyDur: 1e9,
      });
      const a = (Math.PI * 2 * i) / Math.max(1, n);
      const x = p.pos.x + Math.cos(a) * 14,
        z = p.pos.z + Math.sin(a) * 14;
      e.pos.set(x, this.world.groundAt(x, z, 1e4), z);
      this.registerSpawn(e);
      this.allies.push(e);
    }
  },
  // ---------- 畫面（渲染風格、比較、解析度） ----------
  // 預覽器自己的風格（不改遊戲的選擇）：V.style＝'k:id'，空字串＝遊戲目前的
  mapvStyleParams(sel) {
    if (!sel) return StyleStore.current();
    const [k, ...rest] = sel.split(':');
    const P = StyleStore.paramsOf(k, rest.join(':'));
    if (P) P.metal = StyleStore.data.metal;
    return P || StyleStore.current();
  },
  mapvApplyStyle() {
    const V = this.mapv;
    this.styleP = this.mapvStyleParams(V.style);
    this.styleStructural(this.styleP);
    V.cmp = V.cmpSel ? this.mapvStyleParams(V.cmpSel) : null;
  },
  mapvViewHtml() {
    const V = this.mapv;
    const ch = StyleStore.choices();
    const lbl = { builtin: '內建', mine: '我的', server: '伺服器' };
    const o = (v, t, cur) =>
      `<option value="${escHtml(v)}"${String(v) === String(cur) ? ' selected' : ''}>${escHtml(t)}</option>`;
    const styles = ch.map((c) => o(c.k + ':' + c.id, lbl[c.k] + '・' + c.name, '')).join('');
    return `
      <div class="mvrow"><span>渲染風格</span><select data-fv="style">${o('', '遊戲目前的', V.style)}${styles.replace(`value="${escHtml(V.style)}"`, `value="${escHtml(V.style)}" selected`)}</select></div>
      <div class="mvrow"><span>左右比較</span><select data-fv="cmpSel">${o('', '關', V.cmpSel)}${styles.replace(`value="${escHtml(V.cmpSel)}"`, `value="${escHtml(V.cmpSel)}" selected`)}</select></div>
      <div class="mvrow"><span>分割線</span><input type="range" data-fv="split" min="0.05" max="0.95" step="0.01" value="${V.split}" /></div>
      <div class="mvrow"><span>解析度</span><select data-fv="res">${RES.map((r) => o(r, Math.round(r * 100) + '%', StyleStore.data.res)).join('')}</select></div>
      <div class="mvacts"><button id="mvSettings" title="開啟遊戲的設定（畫面分頁：陰影、水面、砲火特效、後處理…），回來就生效">完整的畫面設定…</button></div>
      <div class="mvnote">風格只在預覽器裡換，不改遊戲的選擇（要改請到設定或渲染風格實驗室）。解析度是遊戲的設定，會記住。左邊是比較的風格、右邊是目前的。</div>`;
  },
  mapvBindView() {
    const V = this.mapv;
    const body = $('mvBody');
    for (const el of body.querySelectorAll('[data-fv]')) {
      const k = el.dataset.fv;
      el.addEventListener(k === 'split' ? 'input' : 'change', () => {
        if (k === 'res') {
          StyleStore.setRes(Number(el.value));
          this.applyRes();
          return;
        }
        V[k] = k === 'split' ? Number(el.value) : el.value;
        this.mapvApplyStyle();
      });
    }
    $('mvSettings').onclick = () => {
      // 從暫停選單的設定進去：關掉設定回到暫停選單，繼續就回到預覽器（任務中改的設定回到遊戲就生效）
      this.state = 'pause';
      this.openSettings('pause', 'gfx');
    };
  },
});
