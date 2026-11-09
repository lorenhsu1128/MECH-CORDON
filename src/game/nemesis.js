// Game：宿敵（主線擴充 D2，data/nemesis.js、docs/campaign-expansion-design.md）——擊倒玩家的敵對 AC、精英、帶詞綴的敵人
// 記進 save.story.nemesis；之後的一般區段有機率闖進來（升級、對玩家常用的武器屬性加抗性），擊破給獎金與零件（loot.js），
// 被擊破 2 次退場。只有單人。台詞用 commSay（說話者 enemy、名字換成宿敵的）。
import { SFX } from '../audio/audio.js';
import { pick, rnd } from '../core/math.js';
import { ATTR_KEYS, weaponAttr } from '../data/attrs.js';
import { AC_ROSTER } from '../data/enemies.js';
import { NEM, NEM_CALLS, NEM_LINES, NEM_TITLES, fill } from '../data/nemesis.js';
import { THEMES } from '../world/world.js';
import { Game } from './game.js';

const baseName = (n) =>
  String(n || '')
    .replace(/^【[^】]*】/, '')
    .replace(/^宿敵 /, '')
    .replace(/^敵對 AC「(.*)」$/, '$1');

Object.assign(Game.prototype, {
  nemList() {
    const st = this.campStory();
    if (!Array.isArray(st.nemesis)) st.nemesis = [];
    return st.nemesis;
  },
  nemOn() {
    const c = this.camp;
    return !!c && !this.campMp() && (!c.replay || !!(c.free && c.free.nem)); // 自由出擊：作戰設定開了才有
  },
  // 玩家被擊倒（onPlayerDead，主線單人）：擊倒的敵人變成宿敵，或已經是宿敵的升級
  nemRecord() {
    if (!this.nemOn()) return;
    const k = this.player && this.player.lastHitEnt;
    if (!k || k.team !== 'enemy' || k.isBoss || k.ai === 'part' || k.ai === 'colossus') return;
    const list = this.nemList();
    const place = THEMES[this.worldTheme] ? THEMES[this.worldTheme].name : '';
    let n = k.nemId ? list.find((x) => x.id === k.nemId) : null;
    if (n) {
      n.wins++;
      n.lv = Math.min(NEM.LV_MAX, n.lv + 1);
      n.place = place;
      this.commSay('enemy', fill(pick(NEM_LINES.win), n), '宿敵 ' + n.name);
      this.writeSave();
      return;
    }
    const big = k.ai === 'ac' || k.ace || (this.camp.ss && this.camp.ss.elite === k);
    if (!big && !k.af) return;
    const w = this.player.weapons && (this.player.weapons.rarm || this.player.weapons.larm);
    const hate = w && w.def && w.def.type !== 'none' ? weaponAttr(w.def) : 'kin';
    let name, asm, ai, pal, wantDist;
    const title = () => {
      const i = Math.floor(Math.random() * NEM_TITLES.length);
      return `${NEM_TITLES[i]}的 ${NEM_CALLS[i]}-${Math.floor(rnd(2, 99))}`;
    };
    if (big && k.asm) {
      name = baseName(k.name);
      if (!name || name === '敵對 AC') name = title(); // 沒有名字的敵對 AC：取一個稱號
      asm = { ...k.asm };
      ai = k.ai === 'ac' || !k.ai ? 'ac' : k.ai;
      pal = k.palKey || 'enemy';
      wantDist = (k.opts && k.opts.wantDist) || 25;
    } else {
      // 雜兵升格：駕駛員換了一台 AC
      name = title();
      const r = pick(Object.values(AC_ROSTER));
      asm = { ...r.asm };
      ai = 'ac';
      pal = r.pal;
      wantDist = r.wantDist || 25;
    }
    n = { id: Date.now() % 1e9, name, asm, ai, pal, wantDist, lv: 1, wins: 1, losses: 0, hate, place };
    list.push(n);
    // 最多 NEM.MAX 個：拿掉等級最低的
    if (list.length > NEM.MAX) list.splice(list.indexOf(list.reduce((a, b) => (b.lv < a.lv ? b : a))), 1);
    this.commSay('enemy', fill(pick(NEM_LINES.born), n), '宿敵 ' + n.name);
    this.writeSave();
  },
  // 區段開始（campEnterSeg）：這一段會不會有宿敵闖進來
  nemPlan(type) {
    const c = this.camp;
    if (!this.nemOn() || c.nemDone || ['supply', 'air', 'boss', 'colossus'].includes(type)) return;
    const list = this.nemList();
    if (!list.length) return;
    if (!(this.nemForce || Math.random() < NEM.CHANCE)) return;
    c.nemPend = { t: this.nemForce ? 0.1 : rnd(NEM.DELAY[0], NEM.DELAY[1]), id: pick(list).id };
  },
  // 每格（campTick）
  nemTick(dt) {
    const c = this.camp;
    if (!c || !c.nemPend || this.state !== 'play') return;
    if ((c.nemPend.t -= dt) > 0) return;
    const n = this.nemList().find((x) => x.id === c.nemPend.id);
    c.nemPend = null;
    if (!n) return;
    c.nemDone = true;
    this.nemSpawn(n);
  },
  nemSpawn(n) {
    const res = [0, 0, 0];
    const i = ATTR_KEYS.indexOf(n.hate);
    if (i >= 0) res[i] = Math.min(NEM.RES_MAX, NEM.RES_K * n.lv);
    const p = this.player;
    const at = this.waveEdgePoint(p.pos);
    const e = this.spawnEnemy({
      name: '宿敵 ' + n.name,
      asm: { ...n.asm },
      pal: n.pal || 'enemy',
      scale: 1,
      hpMul: 1.5 * (this.scaleHp || 1) * (1 + NEM.HP_K * n.lv),
      dmgMul: (this.scaleDmg || 1) * (1 + NEM.DMG_K * n.lv),
      stabMul: 1.3,
      ai: n.ai || 'ac',
      wantDist: n.wantDist || 25,
      res,
      ace: true,
      at:
        at && at.x !== undefined ? new THREE.Vector3(at.x, this.world.groundAt(at.x, at.z, 999), at.z) : null,
    });
    e.nemesis = true;
    e.nemId = n.id;
    SFX.play('alarm', 0.7, 0.9, 0, 0.3, p.pos);
    this.flashMsg(`宿敵 ${n.name} 闖入`, 0xff4d4d, 2.8, { k: 'ace', m: n.name, s: `宿敵 Lv${n.lv}・闖入` });
    this.commSay('enemy', fill(pick(NEM_LINES.back), { ...n, n: n.wins }), '宿敵 ' + n.name);
    return e;
  },
  // 擊破（onEnemyKilled，房主／單機）
  nemKilled(e) {
    if (!e.nemId || !this.camp) return;
    const list = this.nemList();
    const n = list.find((x) => x.id === e.nemId);
    if (!n) return;
    n.losses++;
    const v = Math.round((NEM.BOUNTY[0] + NEM.BOUNTY[1] * n.lv) / 100) * 100;
    this.save.coam += v;
    this.missionEarned = (this.missionEarned || 0) + v;
    this.bountyPops.push({ txt: '+' + v.toLocaleString() + ' COAM', life: 2.2, y: 0 });
    this.flashMsg(`宿敵 ${n.name} 擊破 — +${v.toLocaleString()} COAM`, 0xffd060, 2.6, {
      k: 'good',
      m: '宿敵擊破',
      s: n.name,
    });
    if (n.losses >= NEM.RETIRE) {
      list.splice(list.indexOf(n), 1);
      this.commSay('enemy', fill(pick(NEM_LINES.retire), n), '宿敵 ' + n.name);
    } else this.commSay('enemy', fill(pick(NEM_LINES.down), n), '宿敵 ' + n.name);
    this.writeSave();
  },
});
