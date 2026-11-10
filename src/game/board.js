// Game：作戰室的委託板（主線擴充 C2，data/board.js、docs/campaign-expansion-design.md）——短委託的清單、接受（可以雇用僚機）、
// 完成時的報酬與換新的委託；規則的判斷 campRule（各處的掛勾：mech-entity.js 的 fire／move／takeDamage、campaign.js、
// affix.js、seg-ops.js）。只有單人。
import { SFX } from '../audio/audio.js';
import { escHtml } from '../core/html.js';
import { BOARD_N, HIRE_COST, RULES, boardRegister, genJob } from '../data/board.js';
import { SEG_TYPES } from '../data/campaign.js';
import { MATS } from '../data/tune.js';
import { WINGMEN, wingFor } from '../data/wingmen.js';
import { THEMES } from '../world/world.js';
import { Game } from './game.js';

Object.assign(Game.prototype, {
  // 這次出擊的規則（委託板的出擊才有）
  campRule(k) {
    const c = this.camp;
    if (!c) return false;
    const so = this.campSortie();
    return !!(so && so.rule === k) || !!(c.free && c.free.rule === k); // 自由出擊的作戰設定（free-ops.js）
  },
  // 規則擋下的武器（fire：玩家操作的機體）
  campRuleBlocks(d) {
    if (!this.camp || !d) return false;
    if (this.campRule('noMissile') && d.type === 'missile') return true;
    if (this.campRule('noMelee') && d.type === 'melee') return true;
    if (this.campRule('meleeOnly') && d.type !== 'melee' && d.type !== 'shield') return true;
    return false;
  },
  // 委託板：這一章的委託補到 BOARD_N 個（換章時全部換新）
  boardEnsure() {
    const st = this.campStory();
    const ch = Math.max(1, this.hubChapter ? this.hubChapter() : 1);
    if (!st.board || st.board.chapter !== ch || !Array.isArray(st.board.jobs))
      st.board = { chapter: ch, seq: (st.board && st.board.seq) || 0, jobs: [] };
    const B = st.board;
    while (B.jobs.length < BOARD_N) B.jobs.push(genJob(ch, ++B.seq, Math.random));
    boardRegister(st);
    return B;
  },
  hubBoard(open) {
    const el = document.getElementById('hubBoardBox');
    if (!el) return;
    el.style.display = open ? '' : 'none';
    if (!open) return;
    SFX.ui();
    const B = this.boardEnsure();
    this.writeSave();
    const ch = B.chapter;
    const cost = HIRE_COST[0] + HIRE_COST[1] * ch;
    const wk = wingFor(this.campLastPick(9));
    const matTxt = (m) =>
      Object.keys(MATS)
        .filter((k) => m[k])
        .map((k) => `${MATS[k].name}×${m[k]}`)
        .join('、');
    const rows = B.jobs
      .map((j) => {
        const R = RULES[j.rule];
        const segs = j.segs.map((s) => SEG_TYPES[s.pool[0]].name).join(' → ');
        return `<div class="facSec boardJob"><div class="facHead"><b>${escHtml(j.name)}</b><span class="dim">${escHtml(THEMES[j.theme] ? THEMES[j.theme].name : '')}・${j.segs.length} 段（${escHtml(segs)}）・Lv${j.level}</span></div><div class="boardRule">⚑ ${escHtml(R.name)}：${escHtml(R.desc)}</div><div class="dim">報酬：${j.coam.toLocaleString()} SP、${escHtml(matTxt(j.mats))}、${Math.round(j.part * 100)}% 機率得到零件</div><div class="boardBtns"><button data-job="${j.id}">接受委託</button><button data-job="${j.id}" data-hire="1"${this.save.coam < cost ? ' disabled' : ''}>雇用僚機 ${escHtml(WINGMEN[wk].name)} 並接受（${cost.toLocaleString()} C）</button></div></div>`;
      })
      .join('');
    document.getElementById('hubBoardList').innerHTML =
      `<p class="dim">短委託：1～2 段、帶一條特殊規則；不算進整章完成，完成後換新的委託。</p>${rows}`;
    for (const b of document.querySelectorAll('#hubBoardList button[data-job]'))
      b.onclick = () => this.boardAccept(+b.dataset.job, !!b.dataset.hire);
  },
  boardAccept(id, hire) {
    const B = this.boardEnsure();
    const job = B.jobs.find((j) => j.id === id);
    if (!job) return;
    const st = this.campStory();
    if (st.sortie) return this.flashMsg('還有進行中的出擊：先繼續或放棄它', 0xff8a50, 2.2);
    if (hire) {
      const cost = HIRE_COST[0] + HIRE_COST[1] * B.chapter;
      if (this.save.coam < cost) return this.flashMsg('SP 不足', 0xff4d4d, 1.2);
      this.save.coam -= cost;
    }
    this.hubBoard(false);
    this.campBegin('jb_' + id);
    if (hire && this.camp) {
      this.camp.wingHire = true;
      this.camp.wingK = wingFor(this.campLastPick(9));
      this.campCheckpoint();
    }
    // 帶傷出擊：AP 30%、沒有修復套件
    if (this.camp && job.rule === 'lowAp') {
      this.camp.carry = { hp: 0.3, kits: 0, ammo: {} };
      this.campCheckpoint();
    }
  },
  // 出擊結束（campEnd）：委託板的出擊完成時給素材與零件、換新的委託
  boardEnd(success) {
    const c = this.camp;
    if (!c || !/^jb_/.test(c.sid)) return;
    const st = this.campStory();
    const B = st.board;
    const id = +c.sid.slice(3);
    const job = B && B.jobs.find((j) => j.id === id);
    if (!job || !success || c.replay) return;
    for (const k in job.mats) if (job.mats[k]) this.lootMat(k, job.mats[k]);
    this.gearReward('委託報酬'); // 零件品級：一件至少改良的裝備（gear-loot.js）
    B.jobs = B.jobs.filter((j) => j !== job);
    this.writeSave();
  },
});
