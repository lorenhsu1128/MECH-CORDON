// Game：掉落與素材（主線擴充 E1，data/tune.js、docs/campaign-expansion-design.md）——擊破時掉素材（掉落物 mat_<種類>，
// 撿到的人入帳）、具名 AC／宿敵／Boss／大型兵器有機率掉它裝備的零件（每位玩家各自得到、已擁有的不掉）；
// 結果畫面列出這次拿到的（lootRows）。判定在房主／單機；客機由 pkGot（素材）、lootPart（零件）事件入帳。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { PARTS, partById } from '../data/parts.js';
import { DROP, MATS, MAT_KEYS } from '../data/tune.js';
import { GRADES, gearPart, gearRollQ } from '../data/gear.js';
import { Game } from './game.js';

// 零件 id → 分類（只取可以購買的零件）
const PART_CAT = new Map();
for (const cat of ['head', 'core', 'arms', 'legs', 'booster', 'generator', 'fcs', 'arm', 'back'])
  for (const p of PARTS[cat] || []) if (p.price && !/_none$/.test(p.id)) PART_CAT.set(p.id, cat);

Object.assign(Game.prototype, {
  // 出擊開始（startMission、campBegin）
  lootReset() {
    this.lootRun = { mats: {}, parts: [], gear: [], lost: 0 };
  },
  lootOn() {
    return !(this.pvp || this.lv || this.tut || this.lab || this.range || this.sim || this.cine || this.mapv);
  },
  // 擊破（onEnemyKilled，房主／單機）
  lootKilled(e) {
    if (this.isClient || !this.lootOn() || !this.world) return;
    if (['objective', 'convoy', 'holo'].includes(e.ai) || e.decoy || e.team !== 'enemy') return;
    const big = e.isBoss || e.ai === 'colossus';
    const ace = e.ace || e.ai === 'ac' || (this.bosses || []).includes(e);
    const drops = [];
    if (Math.random() < DROP.base * (e.af ? 2.5 : 1) || ace) drops.push('alloy');
    if ((e.af || ace) && Math.random() < DROP.circuit) drops.push('circuit');
    if ((big || (ace && e.isElite) || e.nemesis) && Math.random() < DROP.core) drops.push('core');
    if (big && Math.random() < DROP.shard) drops.push('shard');
    if (big) drops.push('alloy', 'circuit');
    // 模組「拾荒本能」：帶詞綴的敵人與敵對 AC 依等級 45～99% 掉彈藥箱，素材多一個
    if ((e.af || ace) && !big && this.lgAny('lgScrap') && Math.random() < 0.45 * this.lgMax('lgScrap')) {
      drops.push(drops[0] || 'alloy');
      if (this.dropAmmoAt) this.dropAmmoAt(e);
    }
    // 空戰（空域、主線的空戰區段）：掉落物在地面撿不到，直接入帳（空戰只有單人）
    if (this.airMode) {
      for (const k of drops) this.lootMat(k, 1);
      if (drops.length) {
        const n = {};
        for (const k of drops) n[k] = (n[k] || 0) + 1;
        const txt = Object.keys(n)
          .map((k) => `${MATS[k].name}${n[k] > 1 ? ' ×' + n[k] : ''}`)
          .join('、');
        if (this.bountyPops) this.bountyPops.push({ txt: '+' + txt, life: 2.2, y: 0 });
      }
    } else {
      const c = e.center();
      const W = this.world;
      drops.forEach((k, i) => {
        const a = (i / Math.max(1, drops.length)) * Math.PI * 2;
        const [x, z] = W.nearSolid(c.x + Math.cos(a) * 3 * e.dk, c.z + Math.sin(a) * 3 * e.dk);
        this.spawnPickup('mat_' + k, new THREE.Vector3(x, W.groundAt(x, z, c.y + 2) + 0.6, z));
      });
    }
    // 零件品級的掉落：敵人身上的那一件、Boss 的掉落表、一般敵人低機率（gear-loot.js）
    this.gearKilled(e, ace, big);
  },
  // 得到素材（撿到的是自己的機體時）
  lootMat(k, n = 1) {
    if (!MATS[k]) return;
    const S = this.save;
    S.mats = S.mats || {};
    S.mats[k] = (S.mats[k] || 0) + n;
    if (this.lootRun) this.lootRun.mats[k] = (this.lootRun.mats[k] || 0) + n;
    this.writeSave();
  },
  // 得到零件（零件品級：q＝品級，標準版＝解鎖或換成合金；gear-loot.js 的 gearGive 直接入帳）
  lootPart(id, q = 0) {
    if (!PART_CAT.has(id)) return;
    this.gearGive(id, q, null);
  },
  // 撿到素材的掉落物（collectPickup）：k＝mat_<種類>；客機的由 pkGot 事件入帳
  lootPickup(pk, ent) {
    if (ent.isPlayer) this.lootMat(pk.kind.slice(4), 1);
  },
  // 可以掉落的零件 id（委託板的報酬）
  lootPartPool() {
    return [...PART_CAT.keys()];
  },
  // ---------- 戰果的計數（結果畫面的「戰果」：擊破與破壞的各項總數；房主／單機，客機由 end 訊息的 tl 拿到） ----------
  // crowd.js 的 hkReset（自由出擊、主線出擊、自訂關卡、客機開局）一起歸零
  tallyReset() {
    this.tl = { k: {}, d: {} };
  },
  // 擊破的種類（onEnemyKilled）
  tallyKill(e) {
    if (!this.tl || !e || e.decoy || e.ai === 'convoy' || e.ai === 'holo') return;
    const o = e.opts || {};
    const k =
      e.ai === 'objective'
        ? 'obj'
        : e.isBoss
          ? 'boss'
          : e.ai === 'part' || o.partKind
            ? 'part'
            : e.ai === 'ac' || e.ace || e.nemId || e.nemesis || e.isElite
              ? 'ac'
              : e.flying
                ? 'air'
                : 'mt';
    this.tl.k[k] = (this.tl.k[k] || 0) + 1;
  },
  // 地圖物件的破壞（destruct.js：prop＝物件損毀、col＝建築倒塌）
  tallyProp(k) {
    if (this.tl && this.state === 'play') this.tl.d[k] = (this.tl.d[k] || 0) + 1;
  },
  // 結果畫面的「戰果」：擊破、破壞、取得（tl＝房主送來的計數，沒給時用自己的）
  spoilsHtml(tl, o = {}) {
    const T = tl || this.tl || { k: {}, d: {} };
    const tile = (n, name) => `<span class="rT${n ? '' : ' z'}"><b>${n}</b><i>${escHtml(name)}</i></span>`;
    const sum = (o) => Object.values(o || {}).reduce((s, v) => s + (v | 0), 0);
    const K = T.k || {},
      D = T.d || {};
    const kills = [
      ['boss', 'Boss'],
      ['ac', '敵對 AC'],
      ['mt', '一般敵人'],
      ['air', '空中目標'],
      ['part', '部位'],
      ['obj', '目標設施'],
    ]
      .filter(([k]) => K[k] || ['boss', 'ac', 'mt'].includes(k))
      .map(([k, n]) => tile(K[k] | 0, n))
      .join('');
    const mv = this.mvKills | 0;
    const hk = this.hkOn && this.hk ? this.hk : null;
    const dTiles = [
      tile(D.prop | 0, '地圖物件'),
      tile(D.col | 0, '建築倒塌'),
      tile(mv, '載具'),
      ...(hk ? [tile(hk.foe | 0, '敵方人員'), tile(hk.civ | 0, '非戰鬥人員')] : []),
    ].join('');
    const dSum = (D.prop | 0) + (D.col | 0) + mv + (hk ? (hk.foe | 0) + (hk.civ | 0) : 0);
    // 取得：每件裝備、解鎖的零件、素材
    const L = this.lootRun || { mats: {}, parts: [], gear: [] };
    const chips = [];
    for (const g of L.gear || []) {
      const p = gearPart(g.id) || { name: g.id };
      const star = (g.ax || []).some((a) => a[2]);
      const q = g.ax && g.ax.length ? gearRollQ(g) : null;
      chips.push(
        `<span class="rG" style="--gq:${GRADES[g.q].c}"><em>${GRADES[g.q].n}</em>${escHtml(p.name)}${star ? '<u>★</u>' : ''}${q !== null && this.gearBar ? this.gearBar(q, { mini: 1 }) : ''}</span>`,
      );
    }
    for (const id of L.parts || [])
      chips.push(
        `<span class="rG part"><em>解鎖</em>${escHtml((gearPart(id) || partById(PART_CAT.get(id), id) || { name: id }).name)}</span>`,
      );
    for (const k of MAT_KEYS)
      if ((L.mats || {})[k])
        chips.push(
          `<span class="rG mat" style="--gq:${MATS[k].color}">${MATS[k].icon} ${escHtml(MATS[k].name)}<b>×${L.mats[k]}</b></span>`,
        );
    if (L.lost) chips.push(`<span class="rG lost">倉庫已滿：${L.lost} 件沒有撿到</span>`);
    const got =
      (L.gear || []).length +
      (L.parts || []).length +
      MAT_KEYS.reduce((s, k) => s + ((L.mats || {})[k] | 0), 0);
    const gotHtml =
      o.loot === false
        ? ''
        : `<div class="rSpH">取得<b>${got}</b></div><div class="rSpL">${chips.join('') || '<span class="dim">這次沒有取得裝備或素材</span>'}</div>`;
    return `<div class="rSp"><div class="rSpH">擊破<b>${sum(K)}</b></div><div class="rSpT">${kills}</div><div class="rSpH">破壞<b>${dSum}</b></div><div class="rSpT">${dTiles}</div>${gotHtml}</div>`;
  },
  // 結果畫面的列（舊的文字版：多人的 end 訊息仍帶給舊版客機看；結果畫面改用 spoilsHtml）
  lootRows() {
    const L = this.lootRun;
    if (!L) return [];
    const rows = [];
    const m = MAT_KEYS.filter((k) => L.mats[k]).map((k) => `${MATS[k].name} ×${L.mats[k]}`);
    if (m.length) rows.push(['素材', m.join('、')]);
    if (L.parts.length)
      rows.push([
        '取得零件',
        L.parts.map((id) => (gearPart(id) || partById(PART_CAT.get(id), id)).name).join('、'),
      ]);
    // 零件品級（gear-loot.js）
    if (L.gear && L.gear.length)
      rows.push([
        '取得裝備',
        // 用 gearPart：PART_CAT 只有有售價的零件，初始零件等會查成「（空）」
        L.gear.map((x) => `${GRADES[x.q].n}・${(gearPart(x.id) || { name: x.id }).name}`).join('、'),
      ]);
    if (L.lost) rows.push(['倉庫已滿', `${L.lost} 件沒有撿到`]);
    return rows;
  },
  // 素材的持有（機甲庫的調校畫面用）
  lootMatsHtml() {
    const M = this.save.mats || {};
    return MAT_KEYS.map(
      (k) =>
        `<span class="tuneMat" style="color:${MATS[k].color}">${MATS[k].icon} ${escHtml(MATS[k].name)} ${M[k] || 0}</span>`,
    ).join('');
  },
});
