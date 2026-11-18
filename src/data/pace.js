// 遊戲節奏調整室（2026-11-18 使用者要求，docs/pace-lab-design.md）：邊玩邊調機甲的機動、射擊、敵人的攻擊與數量、
// 近戰、每一把武器的手感。參數全部是倍率（1＝現在的遊戲）、只在調整室裡生效（PACE.on；game/pace-lab.js 進出時切換），
// 不影響正常的遊戲；設定組存在 localStorage mech_cordon_pace（game/pace-lab.js）。
// 用到的地方：MechEntity.fire（paceDef：每把武器與我方／敵方的射擊）、move（移動、QB、突擊推進、EN、跳躍）、
// 近戰（傷害、突進、頓格）、Game（遊戲速度、敵人的血量與數量、攻擊名額、壓制、察覺、增援間隔）

// 參數表：[鍵, 名稱, 最小, 最大, 說明]；分組照面板的順序
export const PACE_GROUPS = [
  {
    k: 'world',
    name: '整體',
    items: [['time', '遊戲速度', 0.3, 1.5, '整個戰場的時間流速（正常遊戲的設定「遊戲節奏」預設 75%）', 0.75]],
  },
  {
    k: 'pmove',
    name: '我方機動',
    items: [
      ['pMove', '移動速度', 0.3, 3, '地面與空中的移動速度'],
      ['pQbSpd', 'QB 速度', 0.3, 3, '快速推進的衝刺速度'],
      ['pQbCost', 'QB 耗能', 0, 3, '每次快速推進消耗的 EN'],
      ['pAb', '突擊推進速度', 0.3, 3, '突擊推進（F）的速度'],
      ['pEn', 'EN 回復', 0.2, 5, 'EN 回復的速度'],
      ['pJump', '跳躍力', 0.3, 3, '跳躍與空中跳的起跳速度'],
      ['pQbIF', 'QB 無敵時間', 0, 5, 'QB 開始時的無敵時間（現在約 0.14 秒）'],
      ['pQbCd', 'QB 冷卻（秒）', 0, 1.5, '兩次 QB 之間至少要隔幾秒（現在 0＝衝刺一結束就能再按）', 0],
      ['pPqb', '完美 QB 判定時間', 0.2, 4, '剛好閃過、觸發反擊的時間窗（現在 0.3 秒）'],
    ],
  },
  {
    k: 'pshot',
    name: '我方射擊',
    items: [
      ['pShotSpd', '子彈速度', 0.2, 4, '子彈、火箭、榴彈、導彈的飛行速度'],
      ['pRof', '射速', 0.2, 4, '每秒的發射數（越大越快）'],
      ['pDmg', '傷害', 0.1, 5, '射擊的傷害'],
      ['pImp', '衝擊', 0.1, 5, '累積失衡（ACS）的量，越大越快打出失衡'],
      ['pReload', '裝填時間', 0.1, 4, '彈匣打完後的裝填時間（越大越久）'],
      ['pSpread', '擴散', 0, 4, '子彈的散布（越小越準）'],
      ['pBend', '彈道修正', 0, 4, '子彈往鎖定目標偏轉的程度（0＝完全靠自己瞄準）'],
      ['pMsl', '導彈追蹤力', 0.1, 4, '我方導彈的轉向能力'],
    ],
  },
  {
    k: 'pmelee',
    name: '近戰',
    items: [
      ['pMelee', '近戰傷害', 0.1, 5, '近戰招式的傷害'],
      ['pLunge', '突進距離', 0.3, 3, '近戰招式往前突進的距離'],
      ['pStop', '頓格', 0, 4, '打中時的停頓長度（0＝沒有停頓）'],
      ['pChain', '連段的接招時間', 0.2, 4, '一招收招後還能接下一招的寬限'],
      ['eStun', '敵人被打的硬直', 0, 4, '近戰打中一般敵人時，敵人停住多久（影響連段接不接得上）'],
    ],
  },
  {
    k: 'emove',
    name: '敵人行動',
    items: [
      ['eMove', '移動速度', 0.2, 3, '敵人的移動與 QB 的速度'],
      ['eRof', '開火頻率', 0.1, 4, '敵人每秒的發射數（越大越頻繁）'],
      ['eShotSpd', '子彈速度', 0.2, 4, '敵人的子彈、導彈的飛行速度（越慢越好閃）'],
      ['eAcc', '精準度', 0.2, 4, '敵人的瞄準（越大擴散越小）'],
      ['eDmg', '傷害', 0.1, 5, '敵人打你的傷害'],
      ['eImp', '衝擊', 0.1, 5, '敵人讓你失衡的快慢'],
      ['eWarn', '預警時間', 0.3, 4, '敵人出招前（紅線、落點圈、蓄力）準備的時間，越長越好閃'],
      ['eSize', '子彈大小', 0.2, 3, '敵人子彈的命中判定範圍，越小越好閃'],
      ['eMsl', '導彈追蹤力', 0.1, 4, '敵人導彈的轉向能力'],
      ['eReact', '反應速度', 0.2, 4, '敵人轉向、跟上你換方向的快慢'],
      ['eStab', '失衡門檻', 0.2, 4, '要累積多少衝擊才會失衡（越大越難打出失衡）'],
      ['eStagT', '失衡時間', 0.2, 4, '敵人失衡後停住多久'],
    ],
  },
  {
    k: 'ecount',
    name: '敵人數量與積極度',
    items: [
      ['eHp', '血量', 0.1, 5, '敵人的 AP（新生成的敵人）'],
      ['eCount', '每波數量', 0.2, 4, '每一批的敵人數量'],
      ['eToken', '同時進攻台數', 0, 3, '同時主動進攻的上限（現在 3 台）'],
      ['eSup', '壓制時開火率', 0, 3, '沒輪到進攻的敵人開火的機率（現在 30%）'],
      ['eSight', '察覺範圍', 0.2, 3, '敵人看到、聽到你的距離'],
      ['eGap', '增援間隔', 0.1, 4, '清到剩少數之後，下一批多久出現'],
    ],
  },
];
// 每一把武器的倍率：子彈速度、射速、傷害、衝擊
export const PACE_WPN_KEYS = [
  ['spd', '子彈速度'],
  ['rof', '射速'],
  ['dmg', '傷害'],
  ['imp', '衝擊'],
];

// 目前的值（調整室改它；沒列的鍵＝1）。on＝生效中；lab＝在調整室裡（game/pace-lab.js）。
// 調整室以外：設定「節奏設定組」（ctrl.paceSet）選了一組時，任務中也生效（game/pace-lab.js 的 paceSync；
// 遊戲規則與加成照舊，每把武器的倍率只給玩家；多人以房主的為準）
export const PACE = { on: false, lab: false, v: {}, w: {}, ver: 0, strict: false, name: '' };
// 設定組的存檔（調整室寫、設定畫面與出擊時讀）
export const PACE_KEY = 'mech_cordon_pace';
export function paceStoreRead() {
  try {
    const d = JSON.parse(localStorage.getItem(PACE_KEY) || 'null');
    return d && typeof d === 'object' && d.sets && typeof d.sets === 'object' ? d : null;
  } catch (e) {
    return null;
  }
}
// 部位判定的「擦過不算」（調整室的開關；render/hit-parts.js）：人形機甲的命中只看各區塊的外框，不看外接球
export const strictHit = () => PACE.on && PACE.strict;
export const paceDefault = (k) => {
  for (const g of PACE_GROUPS) for (const it of g.items) if (it[0] === k) return it[5] ?? 1;
  return 1;
};
export const pv = (k) => (PACE.on ? (PACE.v[k] ?? paceDefault(k)) : 1);
// 這台機體是我方（玩家操作）還是敵方：友軍、PvP 照原本
const side = (e) => (!e ? '' : e.pilotEnt && e.pilotEnt() ? 'p' : e.team === 'enemy' ? 'e' : '');
// 我方鍵 p、敵方鍵 en 的倍率（其他機體 1）
export function pk(e, p, en) {
  if (!PACE.on) return 1;
  const s = side(e);
  return s === 'p' ? pv(p) : s === 'e' && en ? pv(en) : 1;
}
// 每把武器的倍率：調整室裡敵我都套（同一把武器），正常遊戲只給玩家
const P0 = (s) => s === 'p' || PACE.lab;
// 開火用的武器定義：我方／敵方與這把武器的倍率套上去（複本依武器、版本快取；PACE 改了 ver 加 1）
const DEF_CACHE = new Map();
export function paceDef(e, d) {
  if (!PACE.on || !d || !d.id) return d;
  const s = side(e);
  if (!s) return d;
  const key = s + '|' + d.id + '|' + PACE.ver;
  const c = DEF_CACHE.get(key);
  if (c && c.src === d) return c.out;
  const W = (P0(s) && PACE.w[d.id]) || {};
  const wk = (k) => W[k] ?? 1;
  const P = s === 'p';
  const spd = wk('spd') * (P ? pv('pShotSpd') : pv('eShotSpd'));
  const rof = wk('rof') * (P ? pv('pRof') : pv('eRof'));
  const dmg = wk('dmg') * (P ? pv('pDmg') : pv('eDmg'));
  const imp = wk('imp') * (P ? pv('pImp') : pv('eImp'));
  const out = { ...d };
  if (d.speed) out.speed = d.speed * spd;
  if (d.rof) out.rof = d.rof / Math.max(0.05, rof); // rof 是兩發之間的秒數
  if (d.dmg) out.dmg = d.dmg * dmg;
  if (d.impact) out.impact = d.impact * imp;
  if (d.reload && P) out.reload = d.reload * pv('pReload');
  if (d.spread) out.spread = d.spread * (P ? pv('pSpread') : 1 / Math.max(0.05, pv('eAcc')));
  if (d.turn) out.turn = d.turn * (P ? pv('pMsl') : pv('eMsl'));
  if (P && d.bend) out.bend = d.bend * pv('pBend');
  if (P && d.hitR) out.hitR = d.hitR * Math.min(1, pv('pBend'));
  if (DEF_CACHE.size > 400) DEF_CACHE.clear();
  DEF_CACHE.set(key, { src: d, out });
  return out;
}
// 冒煙測試與量測
if (typeof location !== 'undefined' && /[?&]test\b/.test(location.search)) window.__PACE = { PACE, paceDef };
