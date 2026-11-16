// 載入畫面與轉場畫面的提示（2026-11-16 使用者定案，game/tips.js 顯示）：ECHO 的口吻（冷靜、短句、叫玩家「傭兵」）、
// 按鈕寫功能名稱＋依裝置自動產生的鍵帽、沒遇過或沒解鎖的內容隱藏、依情境（下一段的主題與區段類型、Boss、裝備）加權。
// 純資料與純函式（可以在 node 載入）。敵人、Boss、宿敵的情報不在這裡手寫，由 game/tips.js 從 ENEMY_TYPES／FOES／
// BOSS_DEFS／ACES 的 intro 與弱點產生（數字永遠和遊戲一致）。
//
// 每一則：{ id, c 分類, t 文字（字串，或依裝置 { kb, pad, touch }：少了的裝置不抽）, ...條件 }
//   文字裡的 {按鈕} 換成「功能名稱」＋鍵帽（BTN），例如 {jump}、{qb}、{fire}、{melee}
//   only：都要符合才抽（theme 主題清單、seg 區段類型清單、dev 裝置清單、camp 主線中、air 空域、boss 下一段是 Boss）
//   boost：符合時權重 ×4（seg、theme、boss、equip 裝備的特徵）
//   ch：至少到第幾章（主線的進度）、cyc：至少第幾周目、seenBoss：遇過 Boss 或下一段就是 Boss
//   w：基本權重（預設 1）

// 提示卡左上的分類標籤
export const TIP_CATS = {
  op: '操作',
  gun: '射擊',
  attr: '屬性',
  melee: '近戰',
  def: '防禦',
  ai: '敵人',
  boss: 'Boss',
  seg: '區段',
  map: '地圖',
  dev: '裝置',
  sys: '整備',
  camp: '主線',
  air: '空戰',
  intel: '情報',
  lore: '檔案',
};

// 按鈕：名稱（提示裡顯示的功能名稱）與各裝置的鍵帽。k＝按鍵設定的動作（keymap／padmap），多個時用「／」接起來；
// touch＝觸控按鈕上的字（null＝觸控沒有這顆，用到它的提示在觸控時不抽）；pad: null＝手把沒有
export const BTN = {
  jump: { name: '跳躍', k: ['jump'], touch: '跳躍' },
  qb: { name: 'QB', k: ['qb'], touch: 'QB' },
  ab: { name: '突擊推進', k: ['ab'], touch: '長按 QB' },
  fire: { name: '武器', k: ['fireR', 'fireL'], touch: '射擊' },
  back: { name: '肩部武器', k: ['backL', 'backR'], touch: '肩部' },
  kit: { name: '修復套件', k: ['kit'], touch: '修復' },
  use: { name: '互動', k: ['interact'], touch: '互動' },
  lock: { name: '切換鎖定', k: ['lock'], touch: '點敵人' },
  assist: { name: '目標輔助', k: ['assist'], touch: null },
  wing: { name: '僚機指令', k: ['wing'], touch: null },
  cs: { name: '消耗品', k: ['cs1', 'cs2'], touch: '道具' },
  aam: { name: '空戰導彈', k: ['aam'], touch: '導彈' },
  view: { name: '切換視角', kb: 'V', pad: null, touch: '視角' },
  pause: { name: '暫停', k: ['pause'], touch: '暫停' },
};

export const TIPS = [
  // ---------- 操作 ----------
  { id: 'op_hover', c: 'op', t: '按住{jump}可以懸浮定高。放開之後立刻再按住，會直接往上爬。' },
  {
    id: 'op_airjump',
    c: 'op',
    t: '空中再按一次{jump}是空中跳，帶著方向就往那邊跳。逆關節腳最多三次，其他兩次。',
  },
  { id: 'op_qb', c: 'op', t: '{qb}是瞬間的橫向推進。不是逃跑用的，是讓子彈打空用的。' },
  { id: 'op_ab', c: 'op', t: '{ab}是長距離的直線推進，拉近距離或脫離都靠它。EN 撐不久，留一點給 QB。' },
  { id: 'op_kit', c: 'op', t: '{kit}回復 AP。補給台與轉場整備都能補充，不用省到最後一刻。' },
  { id: 'op_use', c: 'op', t: '靠近回復站、固定砲台或掉在地上的重武器時，按住{use}使用。' },
  { id: 'op_back', c: 'op', t: '{back}發射背上的武器。導彈要先鎖住目標，鎖得越久，一次射出的越多。' },
  {
    id: 'op_lock',
    c: 'op',
    t: '{lock}換下一個目標。目標被擊破或跑出射程，會自動改鎖最近的那一個。',
    only: { dev: ['kb', 'pad'] },
  },
  { id: 'op_lock_t', c: 'op', t: '點一下畫面上的敵人就能直接鎖定它。', only: { dev: ['touch'] } },
  {
    id: 'op_view',
    c: 'op',
    t: '{view}依序切換俯視、追尾、第一人稱。出擊時的預設視角在設定裡改。',
    only: { dev: ['kb', 'touch'] },
  },
  {
    id: 'op_assist',
    c: 'op',
    t: '追尾視角時{assist}開關目標輔助。開著的時候，甩一下視角就是換目標。',
    only: { dev: ['kb', 'pad'] },
  },
  { id: 'op_hover_spread', c: 'op', t: '懸浮定高時武器的擴散減半。站不穩的地方，乾脆飛起來打。' },
  { id: 'op_high', c: 'op', t: '比對手高 4 m 以上開火，打出的衝擊更大。高處是好位置，前提是你不被集火。' },
  { id: 'op_cs', c: 'op', t: '{cs}是出擊時帶的消耗品：空襲、友軍支援。數量少，用在場面失控的時候。' },
  { id: 'op_pause', c: 'op', t: '{pause}可以暫停，任務中改的大部分設定回到遊戲就生效。' },

  // ---------- 射擊 ----------
  { id: 'gun_qbshot', c: 'gun', t: 'QB 的瞬間開火，這一發的衝擊更大。邊閃邊打，不是邊逃邊打。' },
  { id: 'gun_apex', c: 'gun', t: '跳到最高點的前後開火，擴散變小、衝擊變大。' },
  { id: 'gun_land', c: 'gun', t: '在空中待一下再落地，落地後的第一輪射擊有加成。' },
  {
    id: 'gun_orbit',
    c: 'gun',
    t: '繞著鎖定的目標側移一陣子，擴散會收斂、命中判定變大。站著不動的傭兵最好打。',
  },
  {
    id: 'gun_charge',
    c: 'gun',
    t: '連射打中會累積充能，充滿之後下一發自動變成強力彈：步槍是穿甲彈、霰彈是獨頭彈、火箭與榴彈是大爆炸。',
  },
  { id: 'gun_mg', c: 'gun', t: '機槍持續射擊一秒以上再放開，會補一串收尾連射。' },
  { id: 'gun_crit', c: 'gun', t: '從背後或側面打中弱點會出現 CRITICAL。正面硬打，是在浪費子彈。' },
  {
    id: 'gun_reload',
    c: 'gun',
    t: '換彈時武器欄下方會出現亮區。在亮區按那把武器的{fire}，瞬間裝好，下一匣傷害更高。',
  },
  {
    id: 'gun_missile',
    c: 'gun',
    t: '導彈一次能射幾發，看火控的鎖定速度。HUD 會顯示「導彈鎖定 n／N」。',
    boost: { equip: ['missile'] },
  },
  {
    id: 'gun_bend',
    c: 'gun',
    t: '鎖定中的實彈會稍微往目標修正彈道。目標忽然 QB 時，手臂的射擊適性越高，預判跟得越快。',
  },
  {
    id: 'gun_style',
    c: 'gun',
    t: '換武器、邊閃邊打、打出反應都會讓風格評價上升。等級越高，結算的報酬越好。',
  },
  { id: 'gun_counter', c: 'gun', t: '完美迴避之後立刻開火是反擊射擊，傷害與衝擊都大幅提高。' },

  // ---------- 屬性 ----------
  {
    id: 'attr_three',
    c: 'attr',
    t: '武器分實彈、爆發、能量三種屬性；頭、核心、手臂、腳部也各有三種防禦。機甲庫的規格頁看得到三種減傷。',
  },
  {
    id: 'attr_kin',
    c: 'attr',
    t: '實彈超過理想射程，傷害會一路掉到 55%。距離就是傷害，往前一點。',
    boost: { equip: ['kin'] },
  },
  { id: 'attr_exp', c: 'attr', t: '爆發沒有距離衰減，打失衡中的目標倍率也最高。', boost: { equip: ['exp'] } },
  {
    id: 'attr_en',
    c: 'attr',
    t: '能量武器的傷害看發電機的能量武器適性。換一顆發電機，雷射就會不一樣。',
    boost: { equip: ['en'] },
  },
  { id: 'attr_weak', c: 'attr', t: '鎖定敵人時，名牌會寫它的弱點與抗性。打弱點多兩成五，打抗性少兩成。' },
  { id: 'attr_laser', c: 'attr', t: '有些目標特別擋雷射，鎖定提示會寫「雷射 30%」。換實彈或爆發。' },
  { id: 'attr_range', c: 'attr', t: '靶場的目標面板也顯示弱點。不確定的話，先去靶場試。' },
  {
    id: 'attr_rx_hot',
    c: 'attr',
    t: '同一個目標，先打能量、三秒內再打實彈＝過熱裝甲：之後四秒受到的傷害 ×1.2。',
  },
  {
    id: 'attr_rx_burst',
    c: 'attr',
    t: '先打實彈、再打爆發＝破甲爆裂：額外一次爆炸，衝擊很大，旁邊的也一起炸。',
  },
  { id: 'attr_rx_jam', c: 'attr', t: '先打爆發、再打能量＝EMP 干擾：目標一秒半不能開火、不能 QB。' },
  {
    id: 'attr_rx_mix',
    c: 'attr',
    t: '兩手帶不同屬性，屬性反應最好觸發。你現在的組合就做得到，輪流打。',
    only: { equip: ['mix'] },
    w: 2,
  },
  {
    id: 'attr_rx_mono',
    c: 'attr',
    t: '你的武器都是同一種屬性。換一把別的屬性，就能打出屬性反應。機甲庫的武器說明會寫能接什麼。',
    only: { equip: ['mono'] },
    w: 2,
  },
  {
    id: 'attr_rx_boss',
    c: 'attr',
    t: '屬性反應對 Boss 的效果減半；同一個目標觸發之後，一秒半內不會再觸發。',
  },
  { id: 'attr_direct', c: 'attr', t: '打失衡中的目標有直擊補正：實彈 ×1.4、能量 ×1.6、爆發 ×1.8。' },
  { id: 'attr_link', c: 'attr', t: '打出失衡的人換另一種武器追打，直擊補正再 ×1.2。這叫連攜。' },

  // ---------- 近戰（只寫通用的派生，不分武器）----------
  {
    id: 'melee_f',
    c: 'melee',
    t: {
      kb: '揮刀時按著「向前」是前派生：突進的連續攻擊。看的是你按的方向，和目標在哪裡無關。',
      pad: '揮刀時左搖桿推著往前是前派生：突進的連續攻擊。看的是你推的方向，和目標在哪裡無關。',
      touch: '在{fire}上往上滑是前派生：突進的連續攻擊。',
    },
    boost: { equip: ['melee'] },
  },
  {
    id: 'melee_b',
    c: 'melee',
    t: {
      kb: '揮刀時按著「向後」是上挑，把敵人打上空中。',
      pad: '揮刀時左搖桿拉著往後是上挑，把敵人打上空中。',
      touch: '在{fire}上往下滑是上挑，把敵人打上空中。',
    },
    boost: { equip: ['melee'] },
  },
  {
    id: 'melee_s',
    c: 'melee',
    t: {
      kb: '揮刀時按著「向左」或「向右」是側派生，橫著掃開。',
      pad: '揮刀時左搖桿推向左右是側派生，橫著掃開。',
      touch: '在{fire}上往左右滑是側派生，橫著掃開。',
    },
    boost: { equip: ['melee'] },
  },
  {
    id: 'melee_n',
    c: 'melee',
    t: '不按方向就是預設連段。連段打到一半按方向，會切到那條派生。',
    boost: { equip: ['melee'] },
  },
  {
    id: 'melee_air',
    c: 'melee',
    t: '上挑之後立刻按{jump}，可以接空中連段。最後一下往下劈。',
    boost: { equip: ['melee'] },
  },
  {
    id: 'melee_resume',
    c: 'melee',
    t: '連段中按{qb}閃開，0.6 秒內再出手會接回原本的連段。',
    boost: { equip: ['melee'] },
  },
  {
    id: 'melee_shot',
    c: 'melee',
    t: '近戰打中之後馬上開槍，這一槍會接進連段裡。',
    only: { dev: ['kb', 'pad'] },
    boost: { equip: ['melee'] },
  },
  {
    id: 'melee_swap',
    c: 'melee',
    t: '兩手都拿近戰武器時，左右輪流出招，連段可以拉得更長。',
    only: { dev: ['kb', 'pad'] },
    boost: { equip: ['melee'] },
  },
  {
    id: 'melee_dash',
    c: 'melee',
    t: '{ab}中出手是衝刺斬，遠處的目標也追得到。',
    boost: { equip: ['melee'] },
  },
  {
    id: 'melee_lunge',
    c: 'melee',
    t: '對失衡中的敵人出手，突進的距離是平常的三倍。',
    boost: { equip: ['melee'] },
  },
  {
    id: 'melee_exec',
    c: 'melee',
    t: {
      kb: '長按{melee}可以處決失衡中的一般敵人：直接擊破、EN 回滿、掉彈藥箱。Boss 不行。',
      pad: '長按{melee}可以處決失衡中的一般敵人：直接擊破、EN 回滿、掉彈藥箱。Boss 不行。',
      touch: '長按{fire}可以處決失衡中的一般敵人：直接擊破、EN 回滿、掉彈藥箱。Boss 不行。',
    },
    boost: { equip: ['melee'] },
  },
  {
    id: 'melee_parry',
    c: 'melee',
    t: {
      kb: '敵人頭上出現紅色「!」時，按{melee}是彈刀，之後它一定失衡；按{qb}是完美迴避。',
      pad: '敵人頭上出現紅色「!」時，按{melee}是彈刀，之後它一定失衡；按{qb}是完美迴避。',
      touch: '敵人頭上出現紅色「!」時，按{fire}是彈刀，之後它一定失衡；按{qb}是完美迴避。',
    },
  },
  { id: 'melee_bash', c: 'melee', t: '脈衝盾剛擋下攻擊的半秒內出手是盾擊。', only: { equip: ['shield'] } },
  {
    id: 'melee_decay',
    c: 'melee',
    t: '同一個敵人連續被近戰打到第五下之後，傷害開始遞減。換目標，或換槍。',
    boost: { equip: ['melee'] },
  },
  { id: 'melee_stun', c: 'melee', t: '近戰打中一般敵人會讓它硬直。敵對機甲只停一瞬間，Boss 完全不會。' },
  {
    id: 'melee_tut',
    c: 'melee',
    t: '作戰室的模擬器有近戰訓練課程，八課。結業可以挑一把近戰武器。',
    only: { camp: true },
  },

  // ---------- 防禦與生存 ----------
  { id: 'def_guard', c: 'def', t: '被打到失衡之後，有三秒半不會再失衡。趁這段時間離開。' },
  { id: 'def_bal', c: 'def', t: 'BAL 一陣子沒被打就會開始回復。被壓著打的時候，先找掩體斷開火線。' },
  { id: 'def_low', c: 'def', t: 'AP 很低時畫面會變紅、聲音會變悶。那不是故障，是你快被擊破了。' },
  { id: 'def_status', c: 'def', t: '被鉤住、黏上炸彈、被纏住時，QB 或近戰甩得掉。畫面邊緣會提示怎麼解。' },
  { id: 'def_oob', c: 'def', t: '離開作戰區域會被推回來。地面的邊界線越近越亮。' },
  { id: 'def_cover', c: 'def', t: '地圖物件都打得壞。掩體不是永遠的，換位置比躲到底有用。' },
  { id: 'def_pqb', c: 'def', t: 'QB 的頭 0.3 秒內被打中算完美迴避，不受傷。抓準了，連彈幕都能穿過去。' },

  // ---------- 敵人與 AI ----------
  { id: 'ai_idle', c: 'ai', t: '第一波的敵人還沒發現你。先挑位置，再開第一槍。' },
  {
    id: 'ai_noise',
    c: 'ai',
    t: '槍聲會把附近的敵人引過來查看。頭上的黃色「?」是起疑，紅色「!」是發現你了。',
  },
  { id: 'ai_token', c: 'ai', t: '同一時間只有少數敵人主攻，頭上有紅色倒三角的就是。先處理它們。' },
  { id: 'ai_warn', c: 'ai', t: '敵人的大招都有預警：紅線是架砲瞄準、橘線是導彈、地上的圈是落點。' },
  { id: 'ai_overheat', c: 'ai', t: '掃射完的敵人會過熱。名牌顯示 OVERHEAT 時，受到的傷害 ×1.25。' },
  { id: 'ai_radio', c: 'ai', t: '交戰之後，附近的敵人會收到無線電。打得快，比打得準重要。' },
  { id: 'ai_shield', c: 'ai', t: '盾牌步行機正面幾乎打不動。繞背、從高處打，或用近戰把盾打掉。' },
  { id: 'ai_cmd', c: 'ai', t: '指揮官步行機在場時，附近的敵人會變強。擊破它，其他的會亂一陣子。' },
  { id: 'ai_ammo', c: 'ai', t: '擊破敵對機甲一定掉彈藥箱。彈藥快見底時，一般敵人掉得也比較多。' },
  { id: 'ai_waves', c: 'ai', t: '敵人分波增援，我會先報方向。HUD 的邊緣會標出從哪裡來。' },

  // ---------- Boss（遇過 Boss 或下一段就是 Boss 才抽）----------
  {
    id: 'boss_phase',
    c: 'boss',
    t: 'Boss 換型態時會短暫無敵並放出衝擊波。跳起來躲。',
    seenBoss: true,
    boost: { boss: true },
  },
  {
    id: 'boss_open',
    c: 'boss',
    t: 'Boss 不是只看血量。出現破綻的時候傷害 ×1.6，大招收招就是機會。',
    seenBoss: true,
    boost: { boss: true },
  },
  {
    id: 'boss_break',
    c: 'boss',
    t: 'Boss 蓄力放大招時集火，打滿量表就能打斷，它會長時間失衡。',
    seenBoss: true,
    boost: { boss: true },
  },
  {
    id: 'boss_parts',
    c: 'boss',
    t: '打壞 Boss 的部位，對應的招式會停掉，結算的報酬也會增加。',
    seenBoss: true,
    boost: { boss: true },
  },
  {
    id: 'boss_reflect',
    c: 'boss',
    t: 'Boss 有些投射物打得掉，有的還能打回去。',
    seenBoss: true,
    boost: { boss: true },
  },
  {
    id: 'boss_enrage',
    c: 'boss',
    t: '開打六分鐘之後 Boss 會狂暴，火力變強。拖得越久越難打。',
    seenBoss: true,
    boost: { boss: true },
  },
  {
    id: 'boss_stag',
    c: 'boss',
    t: 'Boss 會越打越難失衡；換型態之後重新計算。',
    seenBoss: true,
    boost: { boss: true },
  },
  {
    id: 'boss_rank',
    c: 'boss',
    t: '擊破 Boss 時會評價打法。打得越乾淨，獎金越多。',
    seenBoss: true,
    boost: { boss: true },
  },

  // ---------- 區段類型 ----------
  {
    id: 'seg_destroy',
    c: 'seg',
    t: '摧毀：目標設施在各個敵群那裡。不必全滅，打掉設施就行。',
    boost: { seg: ['destroy'] },
  },
  {
    id: 'seg_defend',
    c: 'seg',
    t: '防衛：防衛目標被毀就失敗。先清靠近它的敵人。',
    boost: { seg: ['defend'] },
  },
  {
    id: 'seg_escort',
    c: 'seg',
    t: '護送：車隊沿著公路前進，全部抵達就算清除。車隊比你脆。',
    boost: { seg: ['escort'] },
  },
  {
    id: 'seg_intel',
    c: 'seg',
    t: '情報：在資料終端旁邊站滿四秒。被打斷就要重來，先把附近清乾淨。',
    boost: { seg: ['intel'] },
  },
  {
    id: 'seg_break',
    c: 'seg',
    t: '突破：出口一開始就開著，敵人會一直來。不必全滅，衝過去。',
    boost: { seg: ['breakthrough'] },
  },
  {
    id: 'seg_supply',
    c: 'seg',
    t: '補給：沒有敵人。站上補給台修理與補給，之後還能用 SP 買模組。',
    boost: { seg: ['supply'] },
  },
  {
    id: 'seg_elite',
    c: 'seg',
    t: '精英：一台具名的敵對機甲。它不會跟丟你，也不用等權杖。',
    boost: { seg: ['elite'] },
  },
  {
    id: 'seg_exit',
    c: 'seg',
    t: '每個出口會預告下一段的類型與清除獎勵。挑對你有利的那一個。',
    only: { camp: true },
  },
  { id: 'seg_cache', c: 'seg', t: '地圖上的補給箱有守衛看著。站在箱子旁邊一秒多就能打開。' },

  // ---------- 地圖（只在下一段是那個主題時抽）----------
  {
    id: 'map_void',
    c: 'map',
    t: '這裡腳下是虛空。掉下去之前還能飛回來，或落在下層平台再跳上來。',
    only: { theme: ['xylem', 'orbit'] },
  },
  {
    id: 'map_wade',
    c: 'map',
    t: '水深的地方涉水會變慢。兩棲機體例外。',
    only: { theme: ['flooded', 'dam', 'xylem'] },
  },
  {
    id: 'map_dam',
    c: 'map',
    t: '水壩的閘門砲台開閘時，地面先出現藍色預警，水流會把機體往下游推。離開水道，或跳起來。',
    only: { theme: ['dam'] },
  },
  {
    id: 'map_acid',
    c: 'map',
    t: '綠色的腐蝕區會讓 BAL 回復變慢。別在裡面打消耗戰。',
    only: { theme: ['flooded'] },
  },
  {
    id: 'map_ice',
    c: 'map',
    t: '冰面上滑行砲車特別快。雪地裡也可能埋著東西，靠近時注意。',
    only: { theme: ['snow'] },
  },
  { id: 'map_lava', c: 'map', t: '熔岩會持續受傷。懸浮飛過去，不要停在上面。', only: { theme: ['volcano'] } },
  {
    id: 'map_dunes',
    c: 'map',
    t: '沙丘地帶視野很開，沙暴干擾機附近的鎖定距離會減半。',
    only: { theme: ['dunes'] },
  },
  {
    id: 'map_grid',
    c: 'map',
    t: 'Lattice-9 是多層的構造體。平台下方也能通過，敵人也會從上面打下來。',
    only: { theme: ['grid086'] },
  },
  { id: 'map_mine', c: 'map', t: '坑道越往下越深。出口多半是升降機和豎井。', only: { theme: ['desert'] } },
  {
    id: 'map_ark',
    c: 'map',
    t: '方舟的甲板分好幾層，坡道連著上層建築。側舷的壕溝是很好的掩護。',
    only: { theme: ['ark'] },
  },
  {
    id: 'map_inst',
    c: 'map',
    t: '研究特區的保全雷射網碰到會受傷，還會叫增援。',
    only: { theme: ['institute'] },
  },
  {
    id: 'map_trap',
    c: 'map',
    t: '地圖上的環境陷阱會往外擴散一圈波。地面型的跳起來躲得過，爆風型躲不過，你自己也會被打到。',
  },
  { id: 'map_trap_kill', c: 'map', t: '把敵群引到陷阱旁邊再引爆，一次就解決。' },
  { id: 'map_destruct', c: 'map', t: '打斷承重柱，上面的平台和橋會一起倒。' },
  { id: 'map_veh', c: 'map', t: '地圖上會動的車輛是中立的，打壞時偶爾掉修補包。小車可以直接踩扁。' },
  { id: 'map_edge', c: 'map', t: '一般戰鬥從地圖邊緣進場，敵人分好幾群。HUD 會標出遠處的敵群。' },

  // ---------- 地圖裝置 ----------
  { id: 'dev_heal', c: 'dev', t: '回復站按住{use}會慢慢回復 AP，總量有限，用完就沒了。' },
  { id: 'dev_gun', c: 'dev', t: '固定砲台按住{use}上去操作，火力大但不能移動。對 Boss 的傷害減半。' },
  { id: 'dev_heavy', c: 'dev', t: '掉在地上的重武器按住{use}撿起來，會掛在右手自動攻擊，打完就丟掉。' },

  // ---------- 整備與成長 ----------
  { id: 'sys_pilot', c: 'sys', t: '駕駛員畫面按住節點投點。PvE 和 PvP 各有一組技能，互不影響。' },
  { id: 'sys_prof', c: 'sys', t: '用同一把武器打出的有效傷害會累積熟練度，熟練度越高，那把武器越順手。' },
  { id: 'sys_rarity', c: 'sys', t: '零件分綠、藍、紫、金四個品級。倉庫裡的零件可以升階、重骰詞條。' },
  { id: 'sys_tune', c: 'sys', t: '零件可以在機甲庫調校，每一件各自記。PvP 不套用。' },
  { id: 'sys_range', c: 'sys', t: '換零件之前，可以先到靶場量 DPS 和命中率。' },
  {
    id: 'sys_garage',
    c: 'sys',
    t: '轉場時可以進機甲庫整備：修理 AP、補彈藥、補修復套件。',
    only: { camp: true },
  },
  { id: 'sys_hex', c: 'sys', t: '機甲庫規格頁的六角圖是整台機體的取向。換零件時，看它往哪邊歪。' },
  { id: 'sys_ammo', c: 'sys', t: '換裝不會補滿彈藥，換上的武器沿用那個槽位記下的彈藥比例。' },

  // ---------- 主線 ----------
  {
    id: 'camp_retreat',
    c: 'camp',
    t: '暫停選單的「撤退到紀錄點」不算失敗，從這一段重打。',
    only: { camp: true },
  },
  {
    id: 'camp_ck',
    c: 'camp',
    t: '每次轉場都會記紀錄點。關掉遊戲也沒關係，作戰室的「繼續出擊」從那一段接回來。',
    only: { camp: true },
  },
  {
    id: 'camp_mods',
    c: 'camp',
    t: '戰術模組從下一段開始生效。再選一次同樣的模組是升級。',
    only: { camp: true },
  },
  {
    id: 'camp_dual',
    c: 'camp',
    t: '同時持有兩家委託方的模組時，會出現它們的雙重模組。',
    only: { camp: true },
  },
  {
    id: 'camp_fac',
    c: 'camp',
    t: '模組的取向：卡斯特隆是實彈與衝擊、艾瑟立克是能量武器、維爾威是機動、聖域是防禦與修理。',
    only: { camp: true },
    ch: 2,
  },
  {
    id: 'camp_record',
    c: 'camp',
    t: '作戰紀錄可以重打完成過的委託。加上危險條款，報酬更高。',
    only: { camp: true },
    ch: 2,
  },
  {
    id: 'camp_sim',
    c: 'camp',
    t: '作戰室的模擬器能重現遇過的敵人與 Boss。想練哪個就去練。',
    only: { camp: true },
  },
  { id: 'camp_shop', c: 'camp', t: '補給台用完之後會開商店，可以用 SP 買模組。', only: { camp: true } },
  {
    id: 'camp_wing',
    c: 'camp',
    t: '{wing}依序切換僚機的指令。它倒下時靠近可以救回來。',
    only: { camp: true, dev: ['kb', 'pad'] },
    ch: 3,
  },

  // ---------- 空戰（空域與主線的空戰區段）----------
  {
    id: 'air_turn',
    c: 'air',
    t: '按住{jump}是急轉彎：轉得快，但會掉速、吃 EN。',
    only: { air: true, dev: ['kb', 'pad'] },
  },
  {
    id: 'air_turn_t',
    c: 'air',
    t: '右搖桿推過九成就是急轉彎。轉得快，但會掉速、吃 EN。',
    only: { air: true, dev: ['touch'] },
  },
  {
    id: 'air_roll',
    c: 'air',
    t: '{qb}加上左右是側滾翻，短暫無敵。導彈警報響的時候用它甩掉。',
    only: { air: true, dev: ['kb', 'pad'] },
  },
  { id: 'air_cloud', c: 'air', t: '雲裡鎖不到目標，對方也一樣。', only: { air: true } },
  {
    id: 'air_aam',
    c: 'air',
    t: '{aam}發射空戰導彈。在你背後的目標鎖不到，先把機首轉過去。',
    only: { air: true },
  },
  {
    id: 'air_hover',
    c: 'air',
    t: '高推力的機體不會失速，減到最慢就是懸停。可以原地轉向。',
    only: { air: true },
  },

  // ---------- 檔案（世界觀，依主線的進度，不爆雷）----------
  { id: 'lore_echo', c: 'lore', t: '我是 ECHO，你的作戰管制官。照你的節奏來。', w: 0.6 },
  { id: 'lore_south', c: 'lore', t: '南部荒野：廢棄的城鎮、礦坑和拾荒者。一切從這裡開始。', ch: 1 },
  {
    id: 'lore_castron',
    c: 'lore',
    t: '卡斯特隆重工：重工業的大企業。聯絡官霍斯特是礦工出身，常說：「合約就是合約。」',
    ch: 1,
  },
  {
    id: 'lore_aetheric',
    c: 'lore',
    t: '艾瑟立克研究機構：能量技術的研究機構。薩奇博士說話很客氣，像在寫觀察紀錄。',
    ch: 1,
  },
  { id: 'lore_signal', c: 'lore', t: '荒野的那個訊號……抱歉，干擾。繼續。', ch: 1, w: 0.6 },
  {
    id: 'lore_veerwell',
    c: 'lore',
    t: '維爾威動態：運輸與調度。派克算時間和價錢比誰都快：「時間就是錢，傭兵。」',
    ch: 2,
  },
  { id: 'lore_sancta', c: 'lore', t: '聖域互助同盟：難民組成的互助組織。諾拉記得每一個死者的名字。', ch: 2 },
  {
    id: 'lore_central',
    c: 'lore',
    t: '中部工業帶：貨運集散場、階梯水壩、被汙水淹掉的城區。這一帶的物資都要經過這裡。',
    ch: 2,
  },
  { id: 'lore_west', c: 'lore', t: '西部冰原底下是研究特區。冰層很厚，藏得住很多東西。', ch: 3 },
  {
    id: 'lore_north',
    c: 'lore',
    t: '北部構造體 Lattice-9 和舊宇宙港：這顆星球往天上去的路，都從這裡開始。',
    ch: 4,
  },
  { id: 'lore_reef', c: 'lore', t: '東岸的洋上都市 Reefhold 蓋在海上，街區之間只靠橋連著。', ch: 5 },
  { id: 'lore_orbit', c: 'lore', t: '高空軌道。從這裡看，荒野只是一條線。', ch: 6 },
  { id: 'lore_volcano', c: 'lore', t: '火山熔爐帶：熱得連感測器都會失真。熔岩流過的地方，別停下來。', ch: 7 },
  { id: 'lore_ark', c: 'lore', t: '移動要塞「方舟」：一直在前進的巨艦。這次的戰場，是它的甲板。', ch: 8 },
  { id: 'lore_deja', c: 'lore', t: '這條路，你是不是覺得走過？……資料毀損。照你的節奏來。', cyc: 2, w: 0.8 },
  { id: 'lore_ours', c: 'lore', t: '這次照我們的節奏來。', cyc: 3, w: 0.8 },
];

// 這則提示的文字（依裝置）；這個裝置沒有時 null
export function tipText(tip, dev) {
  const t = tip.t;
  if (typeof t === 'string') return t;
  return t[dev] || (dev === 'pad' ? t.kb : null) || null;
}

// 這則提示在這個情境下的權重（0＝不抽）。ctx＝{ dev, theme, seg, boss, camp, air, ch, cyc, bossSeen, equip: Set }
export function tipWeight(tip, ctx) {
  if (!tipText(tip, ctx.dev)) return 0;
  // 文字用到觸控沒有的按鈕：觸控時不抽
  const txt = tipText(tip, ctx.dev);
  for (const m of txt.matchAll(/\{(\w+)\}/g)) {
    const b = BTN[m[1]];
    if (b && ctx.dev === 'touch' && b.touch === null) return 0;
    if (b && ctx.dev === 'pad' && b.pad === null) return 0;
  }
  const o = tip.only;
  if (o) {
    if (o.theme && !o.theme.includes(ctx.theme)) return 0;
    if (o.seg && !o.seg.includes(ctx.seg)) return 0;
    if (o.dev && !o.dev.includes(ctx.dev)) return 0;
    if (o.camp && !ctx.camp) return 0;
    if (o.air && !ctx.air) return 0;
    if (o.boss && !ctx.boss) return 0;
    if (o.equip && !o.equip.some((e) => ctx.equip.has(e))) return 0;
  }
  if (tip.ch && (ctx.ch || 0) < tip.ch) return 0;
  if (tip.cyc && (ctx.cyc || 1) < tip.cyc) return 0;
  if (tip.seenBoss && !ctx.bossSeen && !ctx.boss) return 0;
  // 空戰的提示只在空域；其他提示在空域時少一點（地面的操作不太適用）
  if (ctx.air && tip.c !== 'air' && tip.c !== 'lore' && tip.c !== 'intel') return 0.2 * (tip.w || 1);
  let w = tip.w || 1;
  const b = tip.boost;
  if (b) {
    if (b.seg && b.seg.includes(ctx.seg)) w *= 4;
    if (b.theme && b.theme.includes(ctx.theme)) w *= 4;
    if (b.boss && ctx.boss) w *= 4;
    if (b.equip && b.equip.some((e) => ctx.equip.has(e))) w *= 2;
  }
  // 地圖的提示：只在那個主題抽到，權重提高
  if (o && o.theme) w *= 3;
  return w;
}

// 加權抽一則；recent＝最近看過的 id（避開，全部都看過時才抽它們）；rnd＝0～1 的亂數
export function tipPick(list, ctx, recent, rnd = Math.random) {
  const pool = [];
  let sum = 0;
  for (const tip of list) {
    let w = tipWeight(tip, ctx);
    if (!(w > 0)) continue;
    if (recent && recent.includes(tip.id)) w *= 0.02;
    pool.push([tip, w]);
    sum += w;
  }
  if (!pool.length) return null;
  let r = rnd() * sum;
  for (const [tip, w] of pool) if ((r -= w) <= 0) return tip;
  return pool[pool.length - 1][0];
}
