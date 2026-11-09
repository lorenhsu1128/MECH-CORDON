// Game：掉落與素材（主線擴充 E1，data/tune.js、docs/campaign-expansion-design.md）——擊破時掉素材（掉落物 mat_<種類>，
// 撿到的人入帳）、具名 AC／宿敵／Boss／大型兵器有機率掉它裝備的零件（每位玩家各自得到、已擁有的不掉）；
// 結果畫面列出這次拿到的（lootRows）。判定在房主／單機；客機由 pkGot（素材）、lootPart（零件）事件入帳。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { PARTS, partById } from '../data/parts.js';
import { DROP, MATS, MAT_KEYS } from '../data/tune.js';
import { Game } from './game.js';

// 零件 id → 分類（只取可以購買的零件）
const PART_CAT = new Map();
for (const cat of ['head', 'core', 'arms', 'legs', 'booster', 'generator', 'fcs', 'arm', 'back'])
  for (const p of PARTS[cat] || []) if (p.price && !/_none$/.test(p.id)) PART_CAT.set(p.id, cat);

Object.assign(Game.prototype, {
  // 出擊開始（startMission、campBegin）
  lootReset() {
    this.lootRun = { mats: {}, parts: [] };
  },
  lootOn() {
    return !(this.pvp || this.lv || this.tut || this.lab || this.range || this.sim || this.cine);
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
    // 零件：具名 AC、宿敵、Boss、大型兵器（它裝備的、還沒擁有的）
    if ((ace || big) && e.asm && Math.random() < (e.nemesis ? 1 : DROP.part)) {
      const ids = Object.values(e.asm).filter((id) => PART_CAT.has(id));
      const id = ids[Math.floor(Math.random() * ids.length)];
      if (id) {
        this.lootPart(id);
        if (this.net && this.net.role === 'host') this.netEv({ t: 'lootPart', id });
      }
    }
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
  // 得到零件（已擁有的換成素材）
  lootPart(id) {
    const S = this.save,
      cat = PART_CAT.get(id);
    if (!cat) return;
    const p = partById(cat, id);
    if (S.owned.includes(id)) {
      this.lootMat('circuit', 2);
      this.flashMsg(`戰利品：${p.name}（已擁有，換成電子零件 ×2）`, 0x7fc8ff, 2.2);
      return;
    }
    S.owned.push(id);
    if (this.lootRun) this.lootRun.parts.push(id);
    this.writeSave();
    SFX.cue('pickup');
    this.flashMsg(`戰利品：取得零件「${p.name}」`, 0xffd060, 2.8, { k: 'good', m: '取得零件', s: p.name });
  },
  // 撿到素材的掉落物（collectPickup）：k＝mat_<種類>；客機的由 pkGot 事件入帳
  lootPickup(pk, ent) {
    if (ent.isPlayer) this.lootMat(pk.kind.slice(4), 1);
  },
  // 可以掉落的零件 id（委託板的報酬）
  lootPartPool() {
    return [...PART_CAT.keys()];
  },
  // 結果畫面的列
  lootRows() {
    const L = this.lootRun;
    if (!L) return [];
    const rows = [];
    const m = MAT_KEYS.filter((k) => L.mats[k]).map((k) => `${MATS[k].name} ×${L.mats[k]}`);
    if (m.length) rows.push(['素材', m.join('、')]);
    if (L.parts.length)
      rows.push(['取得零件', L.parts.map((id) => partById(PART_CAT.get(id), id).name).join('、')]);
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
