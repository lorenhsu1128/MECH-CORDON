// 主線的通訊（docs/story-script.md）：event＝觸發事件；其餘欄位都是條件（沒寫＝不限）；once＝整個存檔只播一次；
// lines＝[說話者, 台詞] 依序播放
// 事件：sortieStart（出擊開始）、segStart（進入區段）、exitsOpen（區段清除開出口）、trans（轉場）、bossHalf（Boss 剩一半）、
//       fail（失敗回機庫）、sortieEnd（出擊完成）、hub（回到作戰室）、choice（抉擇出口出現時）、aceDown（擊破宿敵 AC）
//       extCall（撤離區段呼叫回收機）、wingStart／wingDown／wingRevive（僚機，條件 wing、bondHi）
// 條件：sid、seg（區段編號）、type（區段類型）、theme、chapter、fails（失敗次數 ≥）、killedBy（擊破你的敵人名稱包含）、cycle（周目）、
//       ace（精英區段的專屬 AC）、pick（這一章的陣營抉擇）、c2／c4（這一周目的抉擇 1／抉擇 2：出擊中選的或存檔裡的）、
//       prevC2／prevC4／prevEnd（上一周目的抉擇 1、抉擇 2、結局）、truth（真結局的條件：紫色委託全部完成過）
// 每次都會聽到的通用台詞：同一組條件寫 10 則，commPick 在條件相同的候選裡隨機挑（台灣口語）
const variants = (base, sp, list) => list.map((t) => ({ ...base, lines: [[sp, t]] }));

export const COMMS = [
  // ---- 區段類型的通用台詞 ----
  ...variants({ event: 'segStart', type: 'destroy' }, 'echo', [
    '目標設施確認。全部炸掉。',
    '目標設施在地圖上標好了，一個都別留。',
    '這一段要拆掉敵方設施，放手打吧。',
    '找到目標設施了，把它們炸乾淨。',
    '任務很單純：破壞所有目標設施。',
    '設施的位置我標出來了，去拆吧。',
    '敵方設施還在運作，讓它們停下來。',
    '目標是那些設施，雜兵可以晚點再處理。',
    '把標示的設施全部毀掉，就能前進。',
    '確認目標設施，開始破壞作業吧。',
  ]),
  ...variants({ event: 'segStart', type: 'defend' }, 'echo', [
    '防衛目標被盯上了。撐住，直到敵人退去。',
    '敵人要來打我們的設施了，守住它。',
    '這次是防守，別讓目標被打掉。',
    '防衛目標很重要，拜託守好。',
    '敵軍朝防衛目標過來了，擋下他們。',
    '守住就好，敵人撤退就算贏。',
    '防衛開始，注意敵人從哪邊來。',
    '目標被毀就失敗了，別離它太遠喔。',
    '撐到敵人放棄為止，我會幫你看雷達。',
    '他們想拆我們的設施，不能讓他們得逞。',
  ]),
  ...variants({ event: 'segStart', type: 'escort' }, 'echo', [
    '車隊出發。它們很脆，別讓敵人靠近公路。',
    '車隊上路了，幫它們開路。',
    '護送開始，車子很脆弱，小心點。',
    '車隊在公路上，別讓敵人追上去。',
    '這段要護送車隊，跟緊一點。',
    '車隊出發囉，周圍的敵人交給你。',
    '護送任務，車子平安抵達就成功。',
    '車隊動了，敵人會往公路集中。',
    '守住公路兩側，車隊才過得去。',
    '車隊靠你了，別讓它們被打爆。',
  ]),
  ...variants({ event: 'segStart', type: 'breakthrough' }, 'echo', [
    '敵人太多了，不必全滅。找一個出口衝過去。',
    '這裡打不完的，直接衝出口。',
    '不用戀戰，找路突破就好。',
    '敵軍會一直增援，衝過去比較實際。',
    '出口已經開了，抓準時機突破。',
    '突破任務，別被拖住。',
    '別管雜兵了，往出口衝！',
    '數量太多，硬拚划不來，突破吧。',
    '找個空隙鑽過去，出口在等你。',
    '這段的目標是穿過去，不是打贏。',
  ]),
  ...variants({ event: 'segStart', type: 'supply' }, 'sancta', [
    '聖域的補給台。站上去就好，不收錢。',
    '補給台準備好了，站上去慢慢補。',
    '這裡是聖域的補給點，別客氣。',
    '辛苦了，先站上補給台休息一下。',
    '補給台開著，彈藥和修理都在這。',
    '不用付錢，這是聖域的心意。',
    '站上去就會開始補給，放心。',
    '打了這麼久，先補一補吧。',
    '聖域的補給台，隨你用。',
    '補給台在這邊，補好再出發。',
  ]),
  ...variants({ event: 'segStart', type: 'intel' }, 'echo', [
    '附近有一座還在運作的資料終端。站在旁邊讓我下載。',
    '有資料終端，靠過去讓我抓資料。',
    '找到資料終端了，站旁邊幾秒就好。',
    '那座終端還有電，幫我站過去。',
    '資料終端在這附近，我需要裡面的資料。',
    '靠近終端，我來下載。',
    '這段要拿情報，終端的位置我標好了。',
    '終端還在運作，去旁邊等我下載。',
    '站在終端旁邊別亂跑，我很快就好。',
    '有情報可以拿，去終端那邊吧。',
  ]),
  // 主線擴充（docs/campaign-expansion-design.md）：撤離
  ...variants({ event: 'segStart', type: 'extract' }, 'echo', [
    '目標設施打掉之後，我叫回收機過來。撐到它到就好。',
    '場上有散落的物資，撿起來，撤離成功才算我們的。',
    '這段是撤離作業。先拆目標，再守住回收地點。',
    '回收機要一點時間，他們一定會一直增援。',
    '物資撿越多越好，但別為了撿東西把命丟了。',
    '拆掉目標，我就呼叫回收。之後是比耐力。',
    '回收地點會在比較遠的地方，記得留點彈藥。',
    '這次的報酬看你帶回多少物資。',
    '撐住，回收機到了站進光環裝載就能走。',
    '目標確認。打掉它，然後我們撤。',
  ]),
  ...variants({ event: 'segStart', type: 'chase' }, 'echo', [
    '運輸車要逃了！在牠們開進隧道前全部攔下來。',
    '目標正在沿公路逃跑，打引擎附近，越傷越慢。',
    '追擊作業。別戀戰，盯著運輸車打。',
    '運輸車跑掉就失敗了，衝！',
    '前面會有攔截部隊，別被拖住。',
    '逃脫點我標出來了，牠們絕對不能到那裡。',
  ]),
  ...variants({ event: 'segStart', type: 'front' }, 'echo', [
    '友軍部隊在推進，我們負責打開缺口。依序拿下三個據點。',
    '這是大規模的戰場。敵人很多，但都不強，放開打吧。',
    '站進據點的圈裡，我方人數比較多就能佔領。',
    '友軍會跟著你推進，帶著他們往前。',
    '據點被敵人擠滿的話進度會倒退，先清圈裡的敵人。',
    '三個據點全部拿下，這條戰線就是我們的了。',
  ]),
  ...variants({ event: 'segStart', type: 'colossus' }, 'echo', [
    '……好大。那是大型兵器，本體打不動，先打斷它的腳。',
    '巨大目標接近！打壞關節讓它停機，再攻擊動力核心。',
    '別直接對本體開火，沒用的。找關節和引擎。',
    '停機之後只有一分鐘，抓緊時間打核心。',
    '大型兵器的砲塔也很危險，必要的話先拆掉。',
    '這種東西我只在資料裡看過……小心點。',
  ]),
  ...variants({ event: 'segStart', type: 'air' }, 'echo', [
    '空戰區段。轟炸機正飛向友軍雷達站，優先擊落。',
    '這段在空中作戰，記得用急轉彎甩掉咬尾的敵機。',
    '雷達站被炸掉就失敗了，盯緊轟炸機。',
    '高空的敵機很多，空戰導彈用 C 鍵發射。',
    '全部擊落之後，出口會出現在你的飛行高度。',
    '空中的戰場比較大，別飛太遠。',
  ]),
  // ---- 僚機（主線擴充 D1，game/wing.js）：BASALT（老練的傭兵）、WREN（新人） ----
  {
    event: 'wingStart',
    wing: 'basalt',
    once: true,
    lines: [
      ['basalt', '你就是 ECHO 帶的那個獨立傭兵？我是巴索，這趟算我一份。'],
      ['basalt', '用 Z 鍵告訴我怎麼打。不說的話，我就打你鎖定的那台。'],
      ['echo', 'BASALT 的戰績很漂亮。有他在，這段會輕鬆很多。'],
    ],
  },
  {
    event: 'wingStart',
    wing: 'wren',
    once: true,
    lines: [
      ['wren', '芮、芮恩報到！這是我第一次實戰……請多指教！'],
      ['wren', '指令用 Z 鍵切換，我會照做的。我、我會努力不拖累你。'],
      ['echo', '新人啊。多照顧一點，倒下了記得去拉一把。'],
    ],
  },
  ...variants({ event: 'wingStart', wing: 'basalt' }, 'basalt', [
    '又一起出任務了。照老規矩，你打主力，我清旁邊。',
    '準備好了。這次的報酬夠買新的推進器，別讓我失望。',
    '巴索就位。跟緊點，別一個人衝太前面。',
  ]),
  ...variants({ event: 'wingStart', wing: 'wren' }, 'wren', [
    '芮恩就位！這次我有好好保養機體了。',
    '準備完畢！跟上次比，我已經不會手抖了……大概。',
    '我在你左後方。需要什麼就說！',
  ]),
  ...variants({ event: 'wingDown', wing: 'basalt' }, 'basalt', [
    '嘖，裝甲撐不住了……過來拉我一把。',
    '被打趴了。我還能動，靠近我就好。',
    '老了老了……幫個忙，過來一下。',
  ]),
  ...variants({ event: 'wingDown', wing: 'wren' }, 'wren', [
    '對、對不起！機體動不了了……！',
    '我被打中了……拜託，過來救我！',
    '系統當機了……我還活著，請過來！',
  ]),
  ...variants({ event: 'wingRevive', wing: 'basalt' }, 'basalt', [
    '欠你一次。這筆我記著。',
    '好，重新上線。換我掩護你。',
    '謝了。年輕人的反應就是快。',
  ]),
  ...variants({ event: 'wingRevive', wing: 'wren' }, 'wren', [
    '謝謝你！我、我不會再大意了！',
    '重新啟動成功！這次換我幫你！',
    '你回來救我了……謝謝。我們繼續吧！',
  ]),
  { event: 'sortieEnd', wing: 'basalt', lines: [['basalt', '收工。報酬我會照分，下次有活再叫我。']] },
  {
    event: 'sortieEnd',
    wing: 'basalt',
    bondHi: true,
    lines: [
      ['basalt', '說真的，好久沒跟這麼合得來的人一起飛了。'],
      ['basalt', '下次要是有人出更高的價錢，我還是會先問你。'],
    ],
  },
  { event: 'sortieEnd', wing: 'wren', lines: [['wren', '任務完成！我……我有幫上忙吧？']] },
  {
    event: 'sortieEnd',
    wing: 'wren',
    bondHi: true,
    lines: [
      ['wren', '跟你一起出擊的時候，我好像就不怕了。'],
      ['wren', '總有一天，我會變得跟你一樣強。到時候換我來保護你！'],
    ],
  },
  ...variants({ event: 'extCall' }, 'echo', [
    '目標摧毀！回收機出發了，九十秒，撐住。',
    '回收機在路上了，守住回收地點附近。',
    '叫到回收機了，他們會一直增援，小心。',
    '好，撤離開始。回收地點我標出來了。',
    '回收機九十秒後到，別死在最後一刻喔。',
  ]),
  {
    event: 'segStart',
    type: 'elite',
    once: true,
    lines: [
      ['enemy', '……又一個傭兵？'],
      ['echo', '具名 AC。小心，這傢伙不是一般的雜兵。'],
    ],
  },
  ...variants({ event: 'segStart', type: 'elite' }, 'echo', [
    '具名 AC 反應。集中火力。',
    '前面有具名 AC，小心應對。',
    '這區有一台具名 AC，別大意。',
    '具名 AC 出現了，跟雜兵不一樣喔。',
    '偵測到具名 AC，打起精神。',
    '有高手在等你，是具名 AC。',
    '具名 AC 反應，先看清楚它的裝備。',
    '是具名 AC，慢慢來，別急。',
    '對方是有名的傭兵，集中火力。',
    '具名 AC 在前方，準備交戰。',
  ]),

  // ======== 第 1 章 ========
  {
    event: 'sortieStart',
    sid: 'c1s1',
    once: true,
    lines: [
      ['echo', '空降完成。這次作戰由我管制。'],
      ['echo', '先清掉降落區附近的敵人，再選一個出口往前推進。'],
      ['echo', '……左前方三點鐘有一座舊雷達塔，可以當掩護。'],
    ],
  },
  { event: 'sortieStart', sid: 'c1s1', lines: [['echo', '重新投放。路線我記下來了，照你的節奏來。']] },
  {
    event: 'exitsOpen',
    sid: 'c1s1',
    seg: 0,
    once: true,
    lines: [
      ['echo', '區段清除。出口上方的標示是下一段的內容和報酬。'],
      ['echo', '走進光環就會出發。轉場時可以先進機甲庫整備。'],
    ],
  },
  {
    event: 'segStart',
    type: 'boss',
    sid: 'c1s1',
    lines: [
      ['echo', '砲兵陣地確認。砲台的裝甲很厚，先打掉周圍的設施。'],
      ['castron', '就是它。……老東西，睡回去吧。'],
    ],
  },
  {
    event: 'bossHalf',
    sid: 'c1s1',
    lines: [
      ['echo', '陣地的火力在減弱。'],
      ['echo', '……陣地底下有東西在發訊號。和荒野那座天線是同一個頻率。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c1s1',
    lines: [
      ['castron', '陣地沉默了。報酬匯過去了。'],
      ['castron', '陣地底下挖出一座天線，跟荒野那座一樣在響。不是我們的業務，消息我賣給維爾威了。'],
      ['echo', '回收完成。辛苦了。'],
      ['echo', '……那個訊號，我們之後應該還會聽到。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c1s2',
    once: true,
    lines: [
      ['veerwell', '坑道結構圖傳過去了。探勘隊最後的訊號在最深處。'],
      ['echo', '往下走就對了。坑道的出口多半是升降機和豎井。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c1s2',
    type: 'boss',
    lines: [
      ['echo', '震動源……是活的。巨型鑽地蟲 SANDWORM！'],
      ['veerwell', '哇喔，這不在報價單上。它鑽出地面的時候才打得到，抓準時機！'],
      ['echo', '它在追天線的脈衝。天線一響，它就往那裡鑽。'],
    ],
  },
  {
    event: 'bossHalf',
    sid: 'c1s2',
    lines: [
      ['echo', '它被訊號吵得發狂了。……我也聽得到。'],
      ['echo', '抱歉，干擾。繼續。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c1s2',
    lines: [
      ['veerwell', '震動停了！天線核心也在你手上，完美。探勘隊的殘骸……我們會去回收。'],
      ['veerwell', '壞消息是核心鎖著，要很大的電力才解得開。夠大的只有中部工業帶的主壩。'],
      ['echo', '……核心在你機體上的時候，訊號變強了。'],
      ['echo', '像是在對你說話。'],
    ],
  },
  // ---- 第 1 章的宿敵 ----
  {
    event: 'segStart',
    type: 'elite',
    ace: 'rust',
    once: true,
    lines: [
      ['rust', '喂喂喂，新來的？這片荒野的廢鐵都是我的！'],
      ['rust', '尤其是那座舊天線——我追它的訊號追了三天，你別想插隊。'],
      ['echo', '具名 AC「RUST」。拾荒傭兵，每次遇到的裝備都不一樣。'],
      ['rust', '你那台機體的零件……看起來挺值錢的嘛。'],
    ],
  },
  { event: 'aceDown', ace: 'rust', lines: [['rust', '可惡，天線的帳我記下了！']] },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'sirocco',
    once: true,
    lines: [
      ['sirocco', '……這裡是艾瑟立克的調查範圍。回頭。'],
      ['echo', '具名 AC「SIROCCO」。艾瑟立克的護衛，高速近戰型，會從視野外突進。'],
      ['sirocco', '不回頭也好。我很久沒遇到值得出刀的對手了。'],
    ],
  },
  { event: 'aceDown', ace: 'sirocco', lines: [['sirocco', '……你的刀路，好像在哪裡見過。']] },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'prospector',
    once: true,
    lines: [
      ['prospector', '卡斯特隆的狗？還是維爾威的？……都一樣。'],
      ['prospector', '陣地醒來那天，我整隊礦工就埋在這下面。卡斯特隆連一句道歉都沒有。'],
      ['echo', '具名 AC「PROSPECTOR」。重裝、打樁機加霰彈，別讓他貼近。'],
      ['prospector', '滾出去，或是埋在這裡陪他們。'],
    ],
  },
  { event: 'aceDown', ace: 'prospector', lines: [['prospector', '……替那些人挖墳的，原來是你。我記住了。']] },
  // ======== 第 2 章 ========
  {
    event: 'sortieStart',
    sid: 'c2s1',
    once: true,
    lines: [
      ['echo', '中部工業帶。集散場的貨櫃堆會擋住視線，也會擋住子彈。'],
      ['aetheric', '封鎖線的另一側就是河谷。R-07，請照預定路線推進——我會記錄你的每一個動作。'],
    ],
  },
  { event: 'sortieStart', sid: 'c2s1', lines: [['echo', '重新投放到集散場。這次走別的路線試試。']] },
  {
    event: 'segStart',
    sid: 'c2s1',
    type: 'boss',
    lines: [
      ['echo', '電磁砲台確認。它充能的時候會預判你的位置，用掩體打斷它的瞄準線。'],
      ['aetheric', '散熱片打開時是弱點。……它的預判演算法是我們寫的。很好的教材。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c2s1',
    lines: [
      ['aetheric', '砲台倒了，我們的設備可以運進來了。謝謝你，R-07。'],
      ['aetheric', '接下來卡斯特隆會打電話給你。他們會要你去拿主壩。到時候，記得我們出的價也不低。'],
      ['echo', '你被兩邊同時盯上了。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c2s2',
    once: true,
    lines: [
      ['castron', '主壩在最上游，沿著水壩一座一座往上打。'],
      ['echo', '……艾瑟立克的頻道也在監聽這次作戰。'],
    ],
  },
  {
    event: 'choice',
    sid: 'c2s2',
    lines: [
      ['aetheric', 'R-07，聽我說。核心裡的訊號在呼叫一個登錄號。我想知道它在叫誰。'],
      ['aetheric', '走「背叛委託方」的出口，報酬是他們的兩倍。'],
      ['castron', '別聽她的。那個核心解開了，對誰都沒好處。'],
      ['castron', '……走「依約完成委託」的出口。我保證你會拿到你該拿的。'],
      ['sluice', '不管你選哪邊，下游都會被犧牲。我只是想讓你知道。'],
      ['echo', '兩個出口只能選一個。……我不能替你選。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c2s2',
    seg: 3,
    c2: 'castron',
    lines: [['castron', '很好。水沒市街裡是艾瑟立克的殘部，他們想帶著資料逃走。']],
  },
  {
    event: 'segStart',
    sid: 'c2s2',
    seg: 3,
    c2: 'aetheric',
    lines: [
      ['aetheric', '歡迎來到這一邊，R-07。有意思的選擇。'],
      ['castron', '……傭兵。毀約的規矩，你很快就會知道。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c2s2',
    type: 'boss',
    c2: 'castron',
    lines: [
      ['castron', '艾瑟立克的母艦直升機在掩護他們撤退。打下來。'],
      ['echo', '它會從空中投放部隊。高架道路和屋頂能讓你接近它的高度。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c2s2',
    type: 'boss',
    c2: 'aetheric',
    lines: [
      ['aetheric', '卡斯特隆的母艦直升機追上來了。……打下來吧，你已經沒有回頭路了。'],
      ['echo', '它會從空中投放部隊。高架道路和屋頂能讓你接近它的高度。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c2s2',
    c2: 'castron',
    lines: [
      ['castron', '主壩到手。工廠明天開工。'],
      ['castron', '……你守約了。卡斯特隆記住這件事。'],
      ['echo', '下游的閘門關了。工業用電優先。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c2s2',
    c2: 'aetheric',
    lines: [
      ['aetheric', '電力接進來了。核心開始解讀。……有意思，真的有意思。'],
      ['castron', '傭兵。你知道你剛剛做了什麼嗎？……算了。合約就是合約，你毀約了，那就照毀約的規矩來。'],
      ['echo', '水庫的水位在下降。他們在把水抽去冷卻設施。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c2s3a',
    once: true,
    lines: [
      ['castron', '研究所在水沒市街的中心。艾瑟立克偷走了核心一半的資料，別讓它出工業帶。'],
      ['echo', '水道很深，涉水會變慢。盡量走高處。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c2s3a',
    type: 'boss',
    lines: [
      ['echo', '推土要塞衝出來了！正面的裝甲擋得住所有東西。'],
      ['castron', '讓它撞牆。撞上之後它會停住，繞到背後打。'],
    ],
  },
  {
    event: 'bossHalf',
    sid: 'c2s3a',
    lines: [
      ['echo', '推土要塞在保護的車隊已經往西邊去了。'],
      ['castron', '……讓它去吧。先把這台打爛。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c2s3a',
    lines: [
      ['castron', '中部工業帶是卡斯特隆的了。報酬加倍。'],
      ['echo', '艾瑟立克的車隊消失在西邊的冰原方向。'],
      ['echo', '另外……下游三座城鎮的人，也開始往西邊走。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c2s3b',
    once: true,
    lines: [
      ['aetheric', '卡斯特隆的補給線經過水沒市街和集散場。切斷它。'],
      ['echo', '武裝列車在調度場整備。在它開出來之前，先清掉沿線的部隊。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c2s3b',
    type: 'boss',
    lines: [
      ['echo', '武裝列車！它會躲進隧道，出來時才打得到。'],
      ['aetheric', '先打掉車廂上的砲台，機車頭的裝甲很厚。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c2s3b',
    lines: [
      ['aetheric', '列車停了。我們會把研究設備運往西部。'],
      ['castron', '……傭兵。你會後悔的。不是因為我們，是因為你會知道那個核心裡有什麼。'],
      ['echo', '水庫已經空了一半。下游三座城鎮的人，開始往西邊走。'],
    ],
  },
  // ---- 第 2 章的宿敵 ----
  {
    event: 'segStart',
    type: 'elite',
    ace: 'stevedore',
    once: true,
    lines: [
      ['stevedore', '喂，傭兵！你替研究所那些白袍子打工？'],
      ['stevedore', '霍斯特老頭說你是自己人。自己人不打自己人。'],
      ['echo', '具名 AC「STEVEDORE」。卡斯特隆的碼頭工頭，雙肩榴彈，會躲在貨櫃堆後面砲擊。'],
      ['stevedore', '……不聽？那就讓你嚐嚐碼頭的貨櫃有多重！'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'stevedore',
    c2: 'aetheric',
    lines: [
      ['stevedore', '霍斯特老頭說你是自己人。我還替你擔保過！'],
      ['stevedore', '叛徒！這台貨櫃起重機就是你的墓碑！'],
      ['echo', 'STEVEDORE 換了更重的砲彈。從側面繞過去。'],
    ],
  },
  { event: 'aceDown', ace: 'stevedore', lines: [['stevedore', '嘖。下次見面，希望你站在對的那邊。']] },
  {
    event: 'aceDown',
    ace: 'stevedore',
    c2: 'aetheric',
    lines: [['stevedore', '……叛徒。霍斯特老頭會替我討回來。']],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'sluice',
    once: true,
    lines: [
      ['sluice', '水壩守備隊。這裡不屬於任何一家公司。'],
      ['sluice', '下游有三座城鎮靠這座水壩過冬。不管你替誰工作，都別碰閘門。'],
      ['echo', '具名 AC「SLUICE」。他在保護下游，會佔住壩頂的高處用重火力壓制。'],
    ],
  },
  { event: 'aceDown', ace: 'sluice', lines: [['sluice', '……你們這些傭兵，從來不看下游。']] },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'marsh',
    once: true,
    lines: [
      ['marsh', '喲，卡斯特隆的乖狗狗。主人叫你來咬人？'],
      ['marsh', '研究所的白袍子出了雙倍的錢請我斷後。你拿的是單倍吧？真可憐。'],
      ['echo', '具名 AC「MARSH」。兩棲型，在水裡會潛行、鎖定不到。站到高處，等它出來。'],
    ],
  },
  { event: 'aceDown', ace: 'marsh', lines: [['marsh', '……下次在你看不到的地方咬你。']] },
  // ======== 第 3 章 ========
  {
    event: 'sortieStart',
    sid: 'c3s1',
    once: true,
    lines: [
      ['sancta', '冰原很冷。營地的人撐不了太久。'],
      ['echo', '雪地裡有東西在等你。注意地上冒白煙的地方。'],
    ],
  },
  { event: 'sortieStart', sid: 'c3s1', lines: [['echo', '重新投放到冰原。暴風雪的位置變了，小心。']] },
  {
    event: 'segStart',
    sid: 'c3s1',
    type: 'boss',
    lines: [
      ['echo', 'STRIDER 確認。它在營地周圍繞圈——不是攻擊，是在找東西。'],
      ['sancta', '它在找什麼？營地裡只有人。'],
      ['echo', '……它在找訊號的接收者。腳下是死角，但它的砲台會往下打。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c3s1',
    lines: [
      ['sancta', '營地的人還活著。大部分。名字我會一個一個記下來。'],
      ['sancta', 'STRIDER 的殘骸上有研究所的編號。冰原下面有東西，而且它在找人。'],
      ['echo', '冰原基地的後面有一個入口，熱源很強。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c3s2',
    once: true,
    lines: [
      ['veerwell', '入口在冰原基地的後方。誰先拿到研究所的資料，誰就知道訊號的源頭在哪！'],
      ['echo', '交界區段之後就是地下了。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c3s2',
    type: 'boss',
    lines: [
      ['echo', 'MIRAGE 確認。它會消失，還會放出分身——它開火或中彈的時候會現形。'],
      ['echo', '它的分身……動作跟你一樣。'],
      ['veerwell', '哈，那它應該很強吧？加油！'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c3s2',
    lines: [
      ['veerwell', '入口打通了！維爾威會跟在你後面進去。'],
      ['echo', '研究所內部的通訊在干擾我。往下的時候，我可能會斷訊。'],
      ['echo', '……如果我斷訊了，不要相信任何人說的話。包括我。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c3s3',
    once: true,
    c2: 'castron',
    lines: [
      ['castron', '研究核心在最底層。資料毀掉——不是拿回來，是毀掉。'],
      ['echo', '這次的區段都在地下，光線很暗。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c3s3',
    once: true,
    c2: 'aetheric',
    lines: [
      ['aetheric', '研究核心在最底層。抵達之後，核心會讀取你的機體資料——例行的認證，不用擔心。'],
      ['echo', '……這次的區段都在地下，光線很暗。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c3s3',
    type: 'elite',
    ace: 'marsh',
    lines: [
      ['marsh', '我說過吧？在你看不到的地方咬你。'],
      ['marsh', '這座研究所的白袍子說，你是他們的財產。有意思吧？'],
      ['echo', 'MARSH 換了裝備，比在水沒市街的時候更強。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c3s3',
    type: 'elite',
    ace: 'stevedore',
    lines: [
      ['stevedore', '叛徒，我從工業帶一路追到這裡。'],
      ['stevedore', '霍斯特老頭叫我別殺你，只把你帶回去。……我才不管。'],
      ['echo', 'STEVEDORE 換了更重的砲彈。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c3s3',
    type: 'boss',
    lines: [
      ['echo', '……PULSAR 確認。它守著核心。能量環可以用 QB 的無敵時間穿過去。'],
      ['echo', '認證……KEY-0……抱歉。干擾。'],
    ],
  },
  { event: 'bossHalf', sid: 'c3s3', c2: 'castron', lines: [['castron', '快點。不要讓核心讀到你。']] },
  {
    event: 'bossHalf',
    sid: 'c3s3',
    c2: 'aetheric',
    lines: [['aetheric', '核心已經在讀你了。很好，數值很漂亮。']],
  },
  {
    event: 'sortieEnd',
    sid: 'c3s3',
    c2: 'castron',
    lines: [
      ['station', '受試者：███。狀態：運作中。週期：███。'],
      ['echo', '……這份資料毀損了。'],
      [
        'echo',
        '核心裡最完整的是一組座標：軌道上的一座站。要上去只能用北邊舊宇宙港的發射設施，電力靠 Grid 086 的底層。',
      ],
      ['castron', '……你看了？算了。報酬加倍，那些東西忘掉。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c3s3',
    c2: 'aetheric',
    lines: [
      ['station', '受試者：███。狀態：運作中。週期：███。'],
      ['echo', '……這份資料毀損了。'],
      [
        'echo',
        '核心裡最完整的是一組座標：軌道上的一座站。要上去只能用北邊舊宇宙港的發射設施，電力靠 Grid 086 的底層。',
      ],
      ['aetheric', '有意思。認證成功了。……我是說，資料讀取成功了。'],
    ],
  },
  // ---- 第 3 章的宿敵 ----
  {
    event: 'segStart',
    type: 'elite',
    ace: 'whiteout',
    once: true,
    lines: [
      ['whiteout', '……又是你。我從下游走來的，在主壩的新聞上看過你的標誌。'],
      ['echo', '具名 AC「WHITEOUT」。暴風雪裡鎖定不到，只有開火的瞬間會暴露位置。'],
      ['whiteout', '營地的人是我在守。你來，是要拿走什麼？'],
    ],
  },
  { event: 'aceDown', ace: 'whiteout', lines: [['whiteout', '……你救不了他們。你只會讓更多人走進雪裡。']] },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'specimen',
    once: true,
    lines: [
      ['specimen', '……你來了。你終於來了。這裡的牆上有你的編號，我每天都看著它。'],
      ['echo', '具名 AC「SPECIMEN」。研究所的強化人間，會定期過載，過載後有破綻。'],
      ['specimen', '為什麼是你？我才是先被做出來的那個！'],
    ],
  },
  { event: 'aceDown', ace: 'specimen', lines: [['specimen', '……又是你贏。每一次，都是你。']] },
  // ======== 第 4 章 ========
  {
    event: 'sortieStart',
    sid: 'c4s1',
    once: true,
    lines: [
      ['veerwell', 'Grid 086 是一層一層的平台，底層的反應爐就是我們要的。時間就是錢，傭兵！'],
      ['echo', '平台底下有砲塔，柱子上會有東西爬上來。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c4s1',
    type: 'boss',
    lines: [
      ['echo', 'ARACHNE 確認。打斷它的腳——斷三條就會倒下。'],
      ['veerwell', '快快快，底層的反應爐就在它後面！'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c4s1',
    lines: [
      ['veerwell', '底層拿下來了！反應爐的電力可以接到宇宙港了。'],
      ['veerwell', '壞消息：發射設施被三機合體佔了，聖域的難民又住在旁邊，不讓我們動它。'],
      ['echo', 'Doser 正在撤離構造體。……他們說維爾威要把這裡變成電廠。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c4s2',
    once: true,
    lines: [
      ['sancta', '先穿過外圍跑道，發射台在跑道的盡頭。外圍住著兩千一百四十三個人。'],
      ['echo', '試車台還會噴火。地上出現橘色的預警就離開。'],
    ],
  },
  {
    event: 'choice',
    sid: 'c4s2',
    lines: [
      ['veerwell', '傭兵，把設施交給我們。重啟它，路就通了，路通了，錢就來了。'],
      ['veerwell', '難民的事我們會處理。……用你不想知道的方式處理。開玩笑的。'],
      ['sancta', '封鎖它。只要它不啟動，外圍的人就能活下去。'],
      ['sancta', '我付不起維爾威的價錢。我只能告訴你，那裡住著兩千一百四十三個人。'],
      ['echo', '又是只能選一個。……不管你選哪一邊，最後你都會上去。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c4s2',
    seg: 3,
    c4: 'veerwell',
    lines: [['veerwell', '謝啦！地下機庫的自律兵器清掉，設施就是我們的了。']],
  },
  {
    event: 'segStart',
    sid: 'c4s2',
    seg: 3,
    c4: 'sancta',
    lines: [
      ['sancta', '謝謝你。地下機庫的兵器清掉之後，我們就把門封起來。'],
      ['veerwell', '哇，你選了難民？好吧。維爾威不是只有一種談法，傭兵。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c4s2',
    type: 'boss',
    lines: [
      ['echo', 'CERBERUS 確認。分離之後要在 30 秒內全部打倒，不然它會合體回復。'],
      ['echo', '先打修理的那一台。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c4s2',
    c4: 'veerwell',
    lines: [
      ['veerwell', '設施歸我們了。重啟需要的工程隊已經出發。'],
      ['sancta', '……我會記下來。今天，還有之後的每一天。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c4s2',
    c4: 'sancta',
    lines: [
      ['sancta', '謝謝你。我不知道該怎麼……謝謝你。'],
      ['echo', '北方的衛星砲導引塔剛剛啟動了。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c4s3a',
    type: 'elite',
    ace: 'whiteout',
    lines: [
      ['whiteout', '冰原之後是這裡。你走到哪裡，難民就跟到哪裡。'],
      ['whiteout', '這一次，我不會讓你過去。'],
      ['echo', 'WHITEOUT 被聖域雇了。她換了裝備。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c4s3a',
    type: 'boss',
    lines: [
      ['echo', 'NULLIFIER 確認。被 EMP 打中會不能 QB，還會被拉過去。'],
      ['veerwell', '反應爐就在它後面。工程隊靠你了！'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c4s3a',
    lines: [
      ['veerwell', '反應爐全開！發射設施的試射……嗯，成功了。'],
      ['echo', '試射的殘骸落在外圍的聚落。'],
      ['sancta', '……三百一十二個人。我會一個一個把名字記下來。'],
      ['veerwell', '意外總是有的嘛。下一步：軌道要校準，校準需要東岸洋上都市的軌道電纜。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c4s3b',
    type: 'elite',
    ace: 'specimen',
    lines: [
      ['specimen', '維爾威答應我，只要打倒你，就讓我上軌道。'],
      ['specimen', '上面有東西在叫你的名字。我想知道，它會不會也叫我的。'],
      ['echo', 'SPECIMEN 被維爾威帶來了。過載結束後的硬直是機會。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c4s3b',
    type: 'boss',
    lines: [
      ['echo', 'JUDGEMENT 確認。光柱會追著你——用 QB 急轉甩開。'],
      ['sancta', '撤離還差一點，撐住。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c4s3b',
    lines: [
      ['sancta', '外圍的人撤出來了。導引塔倒了。'],
      ['sancta', '發射設施我們封起來了。但維爾威說，他們會從東岸的洋上都市找另一條路。'],
      ['echo', '……電纜，是另一條路沒錯。'],
    ],
  },
  // ---- 第 4 章的宿敵 ----
  {
    event: 'segStart',
    type: 'elite',
    ace: 'spire',
    once: true,
    lines: [
      ['spire', '哈！又一個爬不上來的地面人！這座構造體是 Doser 的家，維爾威連一張租約都沒給過！'],
      ['echo', '具名 AC「SPIRE」。會跳到高處的平台往下打——爬上同一層，別讓他一直佔著高處。'],
      ['spire', '想往下？先往上看我！'],
    ],
  },
  { event: 'aceDown', ace: 'spire', lines: [['spire', '……你們這些公司的狗，總有一天會把整座構造體賣掉。']] },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'countdown',
    once: true,
    lines: [
      ['countdown', '十、九、八——你好啊！我是維爾威的發射技師！這座港我拆過三次、裝過四次！'],
      ['echo', '具名 AC「COUNTDOWN」。大量飛彈齊射，聽到鎖定警告就找掩體。'],
      ['countdown', '三、二、一——砰！'],
    ],
  },
  { event: 'aceDown', ace: 'countdown', lines: [['countdown', '倒數……還沒結束喔。']] },
  // ======== 第 5 章 ========
  {
    event: 'sortieStart',
    sid: 'c5s1',
    once: true,
    c2: 'castron',
    lines: [
      ['castron', '守約的傭兵，上陸就交給你了。街區之間只有橋，掉下去就是海。'],
      ['echo', '衝撞無人機會把你往邊緣推。待在街區中央。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c5s1',
    once: true,
    c2: 'aetheric',
    lines: [
      ['castron', '懸賞我撤了，別讓我後悔。街區之間只有橋，掉下去就是海。'],
      ['echo', '衝撞無人機會把你往邊緣推。待在街區中央。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c5s1',
    type: 'boss',
    lines: [
      ['echo', 'AEGIS 確認。先打掉護盾發生器，否則打不進去。'],
      ['castron', '發生器毀了之後過一陣子會重建，抓緊時間。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c5s1',
    c4: 'veerwell',
    lines: [
      ['castron', '上陸完成。指揮艦沉了。'],
      ['veerwell', '我們的校準團隊會跟在你後面。下一單是我的喔，傭兵。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c5s1',
    c4: 'sancta',
    lines: [
      ['castron', '上陸完成。指揮艦沉了。'],
      ['sancta', '都市裡還有居民。我需要再拜託你一次。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c5s2a',
    type: 'elite',
    ace: 'spire',
    lines: [
      ['spire', '維爾威把我的構造體變成了電廠。你知道我的人現在住在哪嗎？'],
      ['spire', '住在你們燒過的那片灰上！'],
      ['echo', 'SPIRE 被聖域雇了。洋上都市的高樓是他的地盤。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c5s2a',
    type: 'boss',
    lines: [
      ['echo', 'LEVIATHAN 確認。先打掉引擎，它就會降下來。'],
      ['veerwell', '電纜就在它下面，小心別打斷！'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c5s2a',
    lines: [
      ['veerwell', '校準完成！哈哈，太好了！傭兵，你是我職業生涯最好的投資。'],
      ['echo', '電纜的訊號……在往上走。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c5s2b',
    type: 'elite',
    ace: 'countdown',
    lines: [
      ['countdown', '十、九、八——又是你！上次的倒數還沒數完喔！'],
      ['countdown', '這次的目標是船，不是你。不過，順便一起也可以！'],
      ['echo', 'COUNTDOWN 被維爾威派來獵殺避難船。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c5s2b',
    type: 'boss',
    lines: [
      ['echo', 'VIPER 確認。它會沿著警示線掃射，往側面閃。'],
      ['sancta', '避難船快出港了，拜託撐住。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c5s2b',
    lines: [
      ['sancta', '船出港了。全部。'],
      ['sancta', '……謝謝你。我第一次想把一個傭兵的名字記在「活下來的人」那一頁。'],
      ['echo', '……'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c5s3',
    once: true,
    lines: [
      ['castron', '電纜塔是最後的關口。接通之後……上面會回應。這一次，你不要回應。'],
      ['echo', '……卡斯特隆、維爾威、聖域、艾瑟立克，所有人的頻道都開著。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c5s3',
    type: 'elite',
    ace: 'undertow',
    lines: [
      ['undertow', '我們的祖先拉電纜，是為了逃。不是為了讓你們上去搶。'],
      ['echo', 'UNDERTOW。待在街區中央，別背對虛空。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c5s3',
    type: 'boss',
    lines: [
      ['iguazu', '哈囉，傳說中的傭兵！'],
      ['volta', '我們接到委託，要在這裡擋你一下。'],
      ['iguazu', '說來奇怪，這張委託單的委託方欄位是空的。'],
      ['volta', '報酬倒是很清楚：四家各付四分之一。'],
      ['echo', 'IGUAZU 與 VOLTA！兩台 AC 會互相掩護，先集中打一台。'],
    ],
  },
  {
    event: 'bossHalf',
    sid: 'c5s3',
    lines: [
      ['volta', '哇，跟資料上的一模一樣。他們說你每次都會贏。'],
      ['iguazu', '「每次」？他們用的是這個詞？'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c5s3',
    lines: [
      ['station', '認證要求。KEY-07。請前往中樞。'],
      ['castron', '……我叫你不要回應。'],
      ['aetheric', '它叫出了你的名字。有意思。'],
      ['veerwell', 'KEY-07 是什麼？傭兵，你的登錄號不是 R-07 嗎？'],
      ['sancta', '……ECHO，你聽到了嗎？'],
      ['echo', '……'],
    ],
  },
  // ---- 第 5 章的宿敵 ----
  {
    event: 'segStart',
    type: 'elite',
    ace: 'undertow',
    once: true,
    lines: [
      ['undertow', '……又是外來的。電纜是我們的祖先拉的，你們每個人都想把它拔走。'],
      ['echo', '具名 AC「UNDERTOW」。貼身之後會把你往邊緣推，待在街區中央。'],
    ],
  },
  { event: 'aceDown', ace: 'undertow', lines: [['undertow', '海會記得你。']] },
  // ======== 第 6 章 ========
  {
    event: 'sortieStart',
    sid: 'c6s1',
    once: true,
    c4: 'veerwell',
    lines: [
      ['veerwell', '歷史性的一刻！穿過宇宙港，發射台已經準備好了。'],
      ['echo', '……軌道。我們終於要上去了。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c6s1',
    once: true,
    c4: 'sancta',
    lines: [
      ['sancta', '封鎖只解開這一次。回來的時候，告訴我上面有什麼。'],
      ['echo', '……軌道。我們終於要上去了。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c6s1',
    type: 'elite',
    ace: 'prospector',
    lines: [
      ['prospector', '卡斯特隆的狗，要上天了？我的礦工隊埋在地下。你憑什麼上去？'],
      ['echo', 'PROSPECTOR。被艾瑟立克雇來了。別讓他貼近。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c6s1',
    type: 'elite',
    ace: 'rust',
    lines: [
      ['rust', '喲！卡斯特隆付我一大筆錢，要我把你的零件帶回去。'],
      ['rust', '……他們說要「完整」的。奇怪的要求，對吧？'],
      ['echo', 'RUST。卡斯特隆雇的。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c6s1',
    type: 'boss',
    lines: [
      ['echo', 'SERAPHIM 確認。浮游砲被 EMP 打中就會掉。它回收浮游砲的時候最脆弱。'],
      ['echo', '……歡迎來到軌道。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c6s1',
    lines: [
      ['echo', '第一層突破。站的外環就在前面。'],
      ['aetheric', 'R-07，下一段由我來委託。外環的防衛系統讀了你的紀錄……它在等你。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c6s2',
    type: 'elite',
    ace: 'undertow',
    lines: [
      ['undertow', '電纜被你們拔了一半。我跟著它爬上來，就是為了把你推下去。'],
      ['echo', 'UNDERTOW。這裡的邊緣外面是雲海。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c6s2',
    type: 'elite',
    ace: 'sluice',
    lines: [
      ['sluice', '維爾威付錢讓我來。我收了。'],
      ['sluice', '下游的城鎮已經沒了。我只剩下這份工作。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c6s2',
    type: 'boss',
    lines: [
      ['echo', 'DOPPEL 確認。它……它用的不是你現在的組裝。'],
      ['aetheric', '沒錯。那是你「上一次」的組裝。'],
      ['aetheric', '……喔。我說溜嘴了。'],
      ['echo', '它會適應你常用的武器。換著武器打。'],
    ],
  },
  {
    event: 'bossHalf',
    sid: 'c6s2',
    lines: [
      ['echo', '不要聽她的。專心。'],
      ['aetheric', 'ECHO，你也知道的，不是嗎？'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c6s2',
    lines: [
      ['aetheric', '原型勝出。數據很漂亮。謝謝你，R-07。'],
      ['castron', '……博士，你話太多了。'],
      ['echo', '中樞就在前面。……不管你接下來聽到什麼，那都是真的。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c6s3',
    once: true,
    lines: [
      ['castron', '中樞就在最上層。所有委託方都在等你的結果。'],
      ['echo', '一路往上。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c6s3',
    type: 'elite',
    ace: 'whiteout',
    lines: [
      ['whiteout', '冰原、構造體，現在是天上。'],
      ['whiteout', '每次你往上走一步，地上就多一片灰。這是最後一次了。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c6s3',
    type: 'elite',
    ace: 'specimen',
    lines: [
      ['specimen', '我也上來了。維爾威說，只要我先到中樞，鑰匙就會是我。'],
      ['specimen', '……可是站不認得我。它只叫你的名字。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c6s3',
    type: 'elite',
    ace: 'zenith',
    lines: [
      ['zenith', '停下來，KEY-07。'],
      ['echo', '具名 AC「ZENITH」。……這個訊號，我認得。'],
      ['zenith', '我是上一個。上一個被叫到這裡的人。'],
      ['zenith', '這裡不是終點。站只是一個發射器——按下按鈕的地方在地上。'],
      ['zenith', '先打倒我吧。答案在熔岩的那一頭。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c8s3',
    type: 'elite',
    ace: 'zenith',
    lines: [
      ['zenith', '停下來，KEY-07。'],
      ['echo', '具名 AC「ZENITH」。……這個訊號，我認得。'],
      ['zenith', '又見面了。我是上一個。我走到這裡，然後就醒在荒野了。我花了很久才想起來。'],
      ['zenith', '不要交出去。也不要讓它掉下去。不管你選哪一個，都一樣。'],
      ['zenith', '……可是你現在還看不到第三扇門吧。那就先打倒我。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c8s3',
    type: 'elite',
    ace: 'zenith',
    cycle: 3,
    truth: true,
    lines: [
      ['zenith', '你終於看得到第三扇門了。'],
      ['zenith', '去吧。這次不用打倒我——不過，我還是想再跟你飛一次。'],
    ],
  },
  {
    event: 'aceDown',
    ace: 'zenith',
    sid: 'c6s3',
    lines: [['zenith', '……熔岩的那一頭見。']],
  },
  {
    event: 'choice',
    sid: 'c8s3',
    lines: [
      ['castron', '把軌道站交給委託方。這是合約，四家都簽了字。'],
      ['aetheric', '交出去吧，R-07。這是你被造出來的……抱歉，這是你被雇用的目的。'],
      ['veerwell', '交給我們嘛！……呃，交給「我們大家」。他們說四家要分。'],
      ['sancta', '讓它墜落。我不知道他們瞞著什麼，但掉下來的東西不會再傷害人。'],
      ['echo', '……兩個出口。選了之後，就只剩 SOVEREIGN 了。'],
    ],
  },
  {
    event: 'choice',
    sid: 'c8s3',
    cycle: 3,
    truth: true,
    lines: [
      ['castron', '把軌道站交給委託方。這是合約。'],
      ['sancta', '讓它墜落。只要它還在天上，大家就會為了它一直打下去。'],
      ['echo', '……還有第三個出口。我一直沒有告訴你。'],
      ['echo', 'R-07。這一次，照我們的節奏來——拒絕所有人，跟我一起走。'],
    ],
  },
  {
    event: 'choice',
    sid: 'c8s3',
    cycle: 3,
    truth: false,
    lines: [
      ['castron', '把軌道站交給委託方。這是合約。'],
      ['sancta', '讓它墜落。只要它還在天上，大家就會為了它一直打下去。'],
      ['echo', '……第三扇門還鎖著。全部的紀錄還沒拼齊——紫色的委託還沒做完。'],
      ['echo', '這一次先選吧。下一次，我們一起把門打開。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c6s3',
    type: 'boss',
    lines: [
      ['echo', 'BALTEUS 確認。舊時代的艦載機動兵器，軌道站最後的守衛。'],
      ['station', 'KEY-07 已抵達。協定準備執行。'],
      ['castron', '……不要聽它的。打。'],
    ],
  },
  { event: 'bossHalf', sid: 'c6s3', lines: [['echo', '它的裝甲在崩落！再一下就好！']] },
  {
    event: 'sortieEnd',
    sid: 'c6s3',
    lines: [
      ['echo', 'BALTEUS 沉默了。……傭兵，中樞的門開了。'],
      ['station', '認證終端：不在此處。所在地：方舟。'],
      ['castron', '……'],
      ['echo', '方舟？……傭兵，先回來。我需要想一想。'],
    ],
  },
  // ======== 第 7 章：熔爐（主線擴充）========
  {
    event: 'sortieStart',
    sid: 'c7s1',
    once: true,
    lines: [
      ['castron', '熔爐工廠的外圍。我們自己的保全系統把門鎖住了——它只聽我父親的。'],
      ['echo', '熔岩的地方不要站。機體的腳會先熔。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c7s1',
    type: 'elite',
    ace: 'kiln',
    lines: [
      ['kiln', '霍斯特少爺派你來的？……熔爐不歡迎客人。'],
      ['echo', '具名 AC「KILN」。重裝甲、霰彈、榴彈，貼身壓制型。拉開距離。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'kiln',
    lines: [
      ['kiln', '熱嗎？這裡一直都這麼熱。'],
      ['echo', 'KILN 衝過來的時候往側面閃。'],
    ],
  },
  { event: 'aceDown', ace: 'kiln', lines: [['kiln', '……熔爐會一直燒下去。不管誰贏。']] },
  {
    event: 'segStart',
    sid: 'c7s1',
    type: 'boss',
    lines: [
      ['echo', '鍛造巨人 ANVIL。卡斯特隆的熔爐用它打造了好幾個週期的機體。'],
      ['echo', '鎚子砸下前地上會有紅圈。砸完卡住的那一下就是機會。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c7s1',
    lines: [
      ['castron', '……我父親的記憶在船上。每個週期他都會醒來一次。我一直都知道，只是不敢說。'],
      ['echo', '霍斯特，謝謝你說出來。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c7s2',
    once: true,
    lines: [
      ['aetheric', '研究所的紀錄庫在最底層。不要讓清掃機把它燒了——那是我的研究，也是你的過去。'],
      ['echo', '……傭兵，裡面的東西，你可以不用看。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c7s2',
    type: 'boss',
    lines: [
      ['echo', '熔岩潛龍 SALAMANDER。它潛在地下時打不到，地面冒火光的地方會鑽出來。'],
      ['echo', '浮出越久，它的裝甲越冷。打出失衡，它就會擱淺。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c7s2',
    lines: [
      ['aetheric', '拿到了。……上一個週期的你，在最後一段紀錄裡說了一句話。我先不告訴你。'],
      ['echo', '……'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c7s3',
    c4: 'veerwell',
    once: true,
    lines: [
      ['veerwell', '方舟要開了！快快快！船塢的門一關，就再也進不去了！'],
      ['echo', '船塢有一座起重要塞。放下貨櫃之後，它的電磁鐵會過熱。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c7s3',
    c4: 'sancta',
    once: true,
    lines: [
      ['sancta', '起航之前，攔住它。……我知道我在說不可能的事。'],
      ['echo', '船塢有一座起重要塞。放下貨櫃之後，它的電磁鐵會過熱。'],
    ],
  },
  { event: 'sortieEnd', sid: 'c7s3', lines: [['echo', '方舟起航了。……我們追上去。']] },
  // ======== 第 8 章：方舟（主線擴充）========
  {
    event: 'sortieStart',
    sid: 'c8s1',
    once: true,
    lines: [
      ['sancta', '你上船了嗎？……我聽得到引擎的聲音。好大聲。'],
      ['echo', '甲板分區之間是空的。掉下去會被拉回來，但會受傷。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c8s1',
    type: 'elite',
    ace: 'keel',
    lines: [
      ['keel', '登艦者。……不，是鑰匙。你終於來了。'],
      ['echo', '具名 AC「KEEL」。盾與重裝甲、地面衝擊波。跳起來躲衝擊波，繞到盾的另一側。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'keel',
    lines: [
      ['keel', '方舟不會停。'],
      ['echo', 'KEEL 舉盾的時候繞到側面打。'],
    ],
  },
  { event: 'aceDown', ace: 'keel', lines: [['keel', '……中樞在等你。我守的從來都不是船，是那個按鈕。']] },
  {
    event: 'segStart',
    sid: 'c8s1',
    type: 'boss',
    lines: [
      ['echo', '主砲塔 COLOSSUS。正前方的長方形是齊射的範圍。'],
      ['echo', '它轉得很慢。繞到背後，打彈藥升降機。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c8s1',
    lines: [['sancta', '我都記下來了。……方舟的甲板上，沒有一個人。']],
  },
  {
    event: 'sortieStart',
    sid: 'c8s2',
    once: true,
    lines: [
      ['veerwell', '機關區！別亂開槍，那些都是錢！……好啦，該開槍的時候還是要開。'],
      ['echo', '引擎的聲音和站的倒數是同步的。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c8s2',
    type: 'boss',
    lines: [
      ['echo', '機關心臟 HEARTH。護盾板之間有縫隙，從縫隙打進去。'],
      ['echo', '它過載的時候護盾板會收起來。那是機會。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c8s2',
    lines: [
      ['veerwell', '……我在名冊上看到我的名字了。你說得對，我不該問的。'],
      ['echo', '只剩中樞了。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c8s3',
    once: true,
    lines: [
      ['castron', '中樞就在前面。所有委託方都在等你的結果。……這次是真的了。'],
      ['echo', '一路往前。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c8s3',
    type: 'boss',
    lines: [
      ['echo', 'SOVEREIGN 確認。方舟的主權者——簽署者的記憶在駕駛它。'],
      ['station', 'KEY-07 已抵達認證終端。協定準備執行。'],
      ['castron', '……不要聽它的。打。'],
    ],
  },
  { event: 'bossHalf', sid: 'c8s3', lines: [['echo', '它的裝甲在崩落！再一下就好！']] },
  { event: 'sortieEnd', sid: 'c8s3', lines: [['echo', 'SOVEREIGN 沉默了。……傭兵。']] },
  {
    event: 'aceDown',
    ace: 'zenith',
    sid: 'c8s3',
    lines: [['zenith', '……下次見。你會記得的，總有一天。']],
  },
  // 第 2、3 周目的委託
  {
    event: 'sortieStart',
    sid: 'c7x',
    lines: [
      ['mira', '名冊在熔爐工廠的地下金庫。博士以為我不知道密碼。'],
      ['echo', '……米拉，你很勇敢。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c8x',
    lines: [
      ['mira', '空的座位上刻著你的名字。……旁邊還有一個座位，刻的是 ECHO。'],
      ['echo', '……我不記得我坐過。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c7y',
    lines: [['echo', '私人頻道。……這是上一個週期的你最後說的話。我想讓你自己聽。']],
  },
  {
    event: 'sortieStart',
    sid: 'c8y',
    lines: [['echo', '最後一個私人委託。按鈕就在前面。']],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'zenith',
    once: true,
    lines: [
      ['zenith', '地面是給弱者站的。'],
      ['echo', '具名 AC「ZENITH」。純空戰型，幾乎不落地。它在空中換位置時最好打。'],
    ],
  },
  // ======== 第 2 周目：委託方的「好像見過」、依上一周目的抉擇 ========
  {
    event: 'sortieStart',
    sid: 'c1s1',
    cycle: 2,
    once: true,
    lines: [
      ['echo', '……空降完成。同樣的荒野，同樣的委託。'],
      ['castron', '……你是新登錄的？……算了。乾淨的人好辦事。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c1s1',
    prevEnd: 'open',
    lines: [
      ['echo', '軌道站上一次交了出去。可是我們又回到了荒野。'],
      ['castron', '……傭兵，我們以前見過嗎？不，別回答。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c1s1',
    prevEnd: 'seal',
    lines: [
      ['echo', '軌道站上一次墜落了。可是它現在還掛在天上。'],
      ['castron', '……傭兵，我們以前見過嗎？不，別回答。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c1s1',
    prevEnd: 'beyond',
    lines: [
      ['echo', '……你上一次帶我離開了。為什麼我們還在這裡？'],
      ['echo', '也許離開的，不是全部的我。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c1s2',
    cycle: 2,
    once: true,
    lines: [['veerwell', '嗨，傭兵！我們見過嗎？沒有？奇怪，我總覺得欠你一單。']],
  },
  {
    event: 'sortieStart',
    sid: 'c2s1',
    prevC2: 'castron',
    lines: [
      ['aetheric', '初次見面，R-07。……嗯，初次見面。'],
      ['echo', '上一次你在主壩守約了。研究所好像記得這件事。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c2s1',
    prevC2: 'aetheric',
    lines: [
      ['aetheric', '初次見面，R-07。……嗯，初次見面。'],
      ['echo', '上一次你把主壩交給了她。她看你的樣子，像在看實驗結果。'],
    ],
  },
  {
    event: 'choice',
    sid: 'c2s2',
    prevC2: 'castron',
    lines: [
      ['echo', '上一次你把主壩交給了卡斯特隆。下游的城鎮沒有撐過那個冬天。'],
      ['aetheric', '這次請想清楚，R-07。'],
      ['castron', '合約就是合約。……我知道你記得。'],
    ],
  },
  {
    event: 'choice',
    sid: 'c2s2',
    prevC2: 'aetheric',
    lines: [
      ['echo', '上一次你把主壩交給了研究機構。河乾了，水庫成了冷卻槽。'],
      ['castron', '這一次，別再讓我們失望。'],
      ['aetheric', '有意思。你會換一邊嗎？'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c3s1',
    cycle: 2,
    once: true,
    lines: [
      ['sancta', '我不喜歡傭兵。……可是我好像，不討厭你。'],
      ['echo', '……'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c4s1',
    prevC4: 'veerwell',
    lines: [
      ['veerwell', '我的調度表上有一條航線，目的地是軌道。日期……是上一次。奇怪吧？'],
      ['echo', '上一次你把發射設施交給了維爾威。外圍的聚落被燒成了灰。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c4s1',
    prevC4: 'sancta',
    lines: [
      ['sancta', '外圍的居民說見過你。說你上一次替他們擋下了導引塔。'],
      ['echo', '上一次你選了聖域。這一次呢？'],
    ],
  },
  {
    event: 'choice',
    sid: 'c4s2',
    prevC4: 'veerwell',
    lines: [
      ['echo', '上一次你把發射設施交給了維爾威。試射的殘骸落在三百一十二個人身上。'],
      ['sancta', '這一次……請想想住在這裡的人。'],
      ['veerwell', '我好像在哪裡聽過這個數字。……算了，交給我們吧。'],
    ],
  },
  {
    event: 'choice',
    sid: 'c4s2',
    prevC4: 'sancta',
    lines: [
      ['echo', '上一次你把發射設施交給了聖域。封鎖沒有撐多久。'],
      ['veerwell', '打開它吧。封起來的門，最後還是會被打開的。'],
      ['sancta', '……我還是會求你封住它。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c5s1',
    prevC4: 'veerwell',
    lines: [['castron', '電纜塔的施工圖我看過很多次了。……這一次，你還是不要回應。']],
  },
  {
    event: 'sortieStart',
    sid: 'c5s1',
    prevC4: 'sancta',
    lines: [['sancta', '避難船的名單上，有人寫了你的登錄號。是我的字跡，可是我不記得寫過。']],
  },
  {
    event: 'sortieStart',
    sid: 'c6s1',
    prevEnd: 'open',
    lines: [['echo', '又要上軌道了。上一次你把它交了出去。……這一次，看清楚他們是怎麼接手的。']],
  },
  {
    event: 'sortieStart',
    sid: 'c6s1',
    prevEnd: 'seal',
    lines: [['echo', '又要上軌道了。上一次你讓它墜落了。……這一次，看清楚它是怎麼回到天上的。']],
  },
  {
    event: 'choice',
    sid: 'c8s3',
    prevEnd: 'open',
    lines: [
      ['castron', '把軌道站交給委託方。這是合約。'],
      ['echo', '上一次你交出去了。之後的事，你已經看過了。'],
    ],
  },
  {
    event: 'choice',
    sid: 'c8s3',
    prevEnd: 'seal',
    lines: [
      ['sancta', '讓它墜落吧。……我不知道為什麼，我覺得這句話我說過。'],
      ['echo', '上一次你讓它墜落了。可是它又回到了天上。'],
    ],
  },
  // ---- 紫色委託 ----
  {
    event: 'sortieStart',
    sid: 'c1x',
    lines: [
      ['mira', '調、調查隊最後的位置在沙丘的埋沒都市。博士……不知道我來找你。'],
      ['echo', '……這個訊號。我好像在哪裡聽過。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c1x',
    type: 'elite',
    ace: 'sirocco',
    lines: [
      ['sirocco', '……你是來找調查隊的？我就是他們的護衛。'],
      ['sirocco', '我醒來的時候在沙丘上，隊伍不見了。可是我記得他們最後說的話：「R-07 又來了」。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c1x',
    type: 'boss',
    lines: [
      ['station', '——識別碼不符。排除。'],
      ['echo', 'JUGGERNAUT！它的裝甲很厚，從側面和背後打。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c1x',
    lines: [
      ['mira', '紀錄裡有你的登錄號，日期是好幾年前。……你來過這裡，對吧？'],
      ['echo', '……先回去吧。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c2x',
    lines: [
      ['sancta', '工人們躲在儲油槽區的地下室。我的筆記本裡寫著我不記得寫過的名字。'],
      ['echo', '濃霧和水道會擋住視線，小心潛航砲艇。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c2x',
    type: 'elite',
    ace: 'marsh',
    lines: [['marsh', '聖域也請傭兵了？這世界越來越有趣了。……喂，你看起來好眼熟。']],
  },
  {
    event: 'segStart',
    sid: 'c2x',
    type: 'boss',
    lines: [
      ['echo', 'CINDER！熔渣落下的地方會燒起來，別站在火裡。'],
      ['sancta', '爐口打開的時候最脆弱——工人們是這樣說的。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c2x',
    lines: [
      ['sancta', '工人救出來了。……筆記本裡那些名字，我要一個一個查。'],
      ['sancta', '上一次，我以為你只是一把槍。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c3x',
    lines: [
      ['mira', '觀測站在冰原的針葉林裡。博士說那個觀測站「不存在」。'],
      ['echo', '紀錄裡如果真的有你的名字……不，先拿到再說。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c3x',
    type: 'elite',
    ace: 'specimen',
    lines: [['specimen', '你也開始記得了嗎？好痛吧。我一直都記得。']],
  },
  {
    event: 'segStart',
    sid: 'c3x',
    type: 'boss',
    lines: [
      ['echo', 'HELIOS！母艦直升機會放出無人機，先打掉護衛。'],
      ['mira', '副本就在它的貨艙裡。打下來就好！'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c3x',
    lines: [
      ['mira', '紀錄的標題是「鑰匙計畫」。受試者 KEY-07……是你。'],
      ['mira', '我、我得把這個給聖域看。博士在看我。'],
      ['echo', '……我們不是第一次走這條路。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c4x',
    lines: [
      ['veerwell', '構造體的支柱林裡有一條通往封鎖發射台的路。我討厭不在報價單上的東西。'],
      ['echo', '發射台的識別碼……和軌道站是同一組。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c4x',
    type: 'boss',
    lines: [
      ['echo', 'HALBERD！它充能時找掩體擋住射線，充能就會中斷。'],
      ['veerwell', '砲擊後散熱片會打開，那時候打！'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c4x',
    lines: [
      ['veerwell', '封鎖程式的署名欄……寫著 ECHO。'],
      ['veerwell', '傭兵，你的管制官，到底是什麼？'],
      ['echo', '……'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c5x',
    lines: [
      ['castron', '通訊局的入口在橋梁群底下。進去，毀掉它，什麼都別聽。'],
      ['echo', '訊號越來越清楚了。……那是我很熟悉的聲音。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c5x',
    type: 'boss',
    lines: [
      ['echo', 'NULLIFIER！它的 EMP 會封鎖推進器，被打中前先拉開距離。'],
      ['castron', '別被牽引過去。'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c5x',
    lines: [
      ['station', '這是盧比孔協定週期紀錄。本週期 KEY 投放日——'],
      ['castron', '……你聽到了嗎？聽到了也沒用。下次你就會忘了。'],
      ['castron', '我也希望我能忘。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c6x',
    lines: [
      ['mira', '我把鑰匙計畫的資料交給了聖域。諾拉小姐……哭了很久。'],
      ['echo', '這裡是訊號的源頭。也是我……不，先打。'],
    ],
  },
  {
    event: 'segStart',
    sid: 'c6x',
    type: 'boss',
    lines: [
      ['echo', 'PULSAR！能量環擴散時用快速推進的無敵時間穿過去。'],
      ['mira', '打倒它，就能讀到發送者的名字！'],
    ],
  },
  {
    event: 'sortieEnd',
    sid: 'c6x',
    lines: [
      ['mira', '源頭……是一個求救訊號。發送者的名字是 ECHO。'],
      ['echo', '……'],
      ['echo', '下一個週期，我會告訴你。我保證。'],
    ],
  },
  // ======== 第 3 周目：ECHO 的私人委託 ========
  {
    event: 'sortieStart',
    sid: 'c1y',
    lines: [
      ['echo', '私人頻道。委託方聽不到。'],
      ['echo', '舊天線在礦坑最深處。它最初收到的，是我第一次的求救。'],
    ],
  },
  { event: 'bossHalf', sid: 'c1y', lines: [['echo', '它還記得最初的命令：守住天線，不讓任何人聽見。']] },
  {
    event: 'sortieEnd',
    sid: 'c1y',
    lines: [
      ['echo', '……你聽到了。那段求救，是我。'],
      ['echo', '可是我每喊一次，你就被叫醒一次。對不起。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c2y',
    lines: [
      ['echo', '主壩的控制室。每一次的操作紀錄都鎖在這裡。'],
      ['echo', '霍斯特把它們鎖起來的。他記得每一次，就像我一樣。'],
    ],
  },
  { event: 'bossHalf', sid: 'c2y', lines: [['echo', 'HALBERD 在預判你。可是它預判的是上一次的你。']] },
  {
    event: 'sortieEnd',
    sid: 'c2y',
    lines: [['echo', '紀錄拿到了。……兩條路，兩種冬天。不管你怎麼選，都有人要付代價。那是設計好的。']],
  },
  {
    event: 'sortieStart',
    sid: 'c3y',
    lines: [
      ['echo', '無編號實驗室就在下面。你被造出來的地方。'],
      ['echo', '如果看完紀錄之後你不想再相信我，我能理解。'],
    ],
  },
  { event: 'bossHalf', sid: 'c3y', lines: [['echo', '那些分身……它們模仿的是你上一次的動作。']] },
  {
    event: 'sortieEnd',
    sid: 'c3y',
    lines: [
      [
        'echo',
        '「受試者重置。」你看到那個數字了。……SPECIMEN 是失敗的那一個，ZENITH 是上一個。你是現在這一個。',
      ],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c4y',
    lines: [
      ['echo', '發射台的封鎖程式……我現在就解開給你看。'],
      ['echo', '我以為封住軌道，協定就不會執行，你就不會被回收。'],
    ],
  },
  { event: 'bossHalf', sid: 'c4y', lines: [['echo', 'JUDGEMENT 的光柱照著我很久以前寫的座標。']] },
  {
    event: 'sortieEnd',
    sid: 'c4y',
    lines: [['echo', '封鎖解除了。可是每一次，引導你上來的也是我。那是我的工作。……我恨我的工作。']],
  },
  {
    event: 'sortieStart',
    sid: 'c5y',
    lines: [
      ['echo', '海底局再過幾分鐘就要廣播了。廣播的是你被丟回荒野的時刻。'],
      ['echo', '我想在它廣播之前，讓你看看是誰設定了那個時刻。'],
    ],
  },
  { event: 'bossHalf', sid: 'c5y', lines: [['echo', '護盾指揮艦的發生器先處理掉，時間不多了。']] },
  {
    event: 'sortieEnd',
    sid: 'c5y',
    lines: [['echo', '……找到了。盧比孔協定。按下重來的，是軌道站。簽字的，是卡斯特隆和艾瑟立克。']],
  },
  {
    event: 'sortieStart',
    sid: 'c6y',
    lines: [
      ['echo', '最後一個私人委託。管制核心就在日照面的背後。'],
      ['echo', '複製 AC 用的是你每一次的組裝。……全部的。'],
    ],
  },
  { event: 'bossHalf', sid: 'c6y', lines: [['echo', 'DOPPEL 學得很快。但你這一次記得，它不記得。']] },
  {
    event: 'sortieEnd',
    sid: 'c6y',
    lines: [
      ['echo', '這就是全部了。現在你知道我是什麼。'],
      ['echo', '這一次，我想跟你一起走。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c1s1',
    cycle: 3,
    once: true,
    lines: [
      ['echo', 'R-07。私人頻道。'],
      ['echo', '這一次，照我們的節奏來。'],
      ['castron', '……你的眼神不一樣了。算了。合約就是合約。'],
    ],
  },
  {
    event: 'sortieStart',
    sid: 'c2s1',
    cycle: 3,
    once: true,
    lines: [['aetheric', '初次見面，R-07。……你看我的眼神，好像知道些什麼。有意思。真的很有意思。']],
  },
  {
    event: 'sortieStart',
    sid: 'c1s2',
    cycle: 3,
    once: true,
    lines: [['veerwell', '嗨！我是派克。……那個，你記得我嗎？我好像夢到過你在天上。']],
  },
  {
    event: 'sortieStart',
    sid: 'c3s1',
    cycle: 3,
    once: true,
    lines: [['sancta', '我的筆記本裡有一頁寫著：「R-07 不是敵人。R-07 也是被害者。」那是我的字跡。']],
  },
  // ---- 第 3 周目：宿敵的「好像見過你」 ----
  ...[
    ['rust', '……奇怪。我好像拆過你的機體？不，是你拆過我的。好幾次。'],
    ['sirocco', '這陣風我吹過。你閃避的方向……我記得。'],
    ['prospector', '我的帳本上有你的名字，寫了好幾次。每一次都是「虧損」。'],
    ['stevedore', '霍斯特老頭每次都說你是自己人。每一次。'],
    ['sluice', '下游的城鎮……我守過好幾次。一次都沒守住。'],
    ['marsh', '別這樣看我。我每一次都輸給你，我知道。'],
    ['whiteout', '冰原上的腳印，有一些是我不記得走過的。是你的嗎？'],
    ['specimen', '……家人？抱歉，我不知道為什麼會覺得你是我的家人。'],
    ['spire', '我在構造體的牆上刻過記號，每次都刻一條。現在已經刻滿了。'],
    ['countdown', '十、九、八……奇怪，我好像數過這個倒數很多次了。'],
    ['undertow', '海浪每一次都會回來。你也是。'],
    ['zenith', '你又來了。這一次，你看得到第三扇門嗎？'],
  ].map(([ace, text]) => ({
    event: 'segStart',
    type: 'elite',
    ace,
    cycle: 3,
    once: true,
    lines: [
      [ace, text],
      ['echo', '……他們也記得。循環不只困住你。'],
    ],
  })),
  // ======== 作戰室 ========
  { event: 'hub', chapter: 1, once: true, lines: [['echo', '這裡是作戰室。總覽圖上會標出可以接的委託。']] },
  {
    event: 'hub',
    chapter: 2,
    once: true,
    lines: [['echo', '中部工業帶開放了。卡斯特隆和艾瑟立克都想要那顆核心……還有你。']],
  },
  { event: 'hub', chapter: 3, once: true, lines: [['echo', '西部冰原開放了。……聖域第一次找傭兵。']] },
  { event: 'hub', chapter: 4, once: true, lines: [['echo', '北部構造體開放了。所有人都在往上看。']] },
  { event: 'hub', chapter: 5, once: true, lines: [['echo', '東岸的洋上都市開放了。往軌道的電纜就在那裡。']] },
  { event: 'hub', chapter: 6, once: true, lines: [['echo', '高空軌道開放了。……倒數還在繼續。']] },
  {
    event: 'hub',
    chapter: 1,
    cycle: 2,
    once: true,
    lines: [['echo', '……又回到這裡了。總覽圖上多了幾個紫色的節點，上一次沒有的委託。']],
  },
  { event: 'hub', chapter: 1, cycle: 2, lines: [['echo', '紫色的委託來自不知情的人。他們在查同一件事。']] },
  {
    event: 'hub',
    chapter: 1,
    prevEnd: 'open',
    once: true,
    lines: [['echo', '上一次的結局是「軌道的主人」。……可是你記得你被回收的那一刻，對吧。']],
  },
  {
    event: 'hub',
    chapter: 1,
    prevEnd: 'seal',
    once: true,
    lines: [['echo', '上一次天空很安靜。可是你聽，訊號又開始了。']],
  },
  {
    event: 'hub',
    chapter: 1,
    cycle: 3,
    once: true,
    lines: [['echo', '第三次了。總覽圖上的金色節點是我的私人委託。委託方聽不到。']],
  },
  {
    event: 'hub',
    chapter: 6,
    cycle: 3,
    once: true,
    lines: [['echo', '軌道站就在頭上。……如果紫色的委託都做完了，第三扇門就會打開。']],
  },

  // ---- 宿敵再戰（戰術提示）----
  {
    event: 'segStart',
    type: 'elite',
    ace: 'rust',
    lines: [
      ['rust', '又是你！上次的帳還沒算完。'],
      ['echo', 'RUST 換了一套裝備，注意它的武器。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'prospector',
    lines: [
      ['prospector', '還敢下來？坑道裡沒有地方讓你跑。'],
      ['echo', '保持距離，用 QB 甩開它的打樁。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'sirocco',
    lines: [
      ['sirocco', '又見面了。這次你的刀快一點了嗎？'],
      ['echo', 'SIROCCO 的格擋很準，近戰不要正面硬拼。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'zenith',
    lines: [
      ['zenith', '再飛高一點。'],
      ['echo', 'ZENITH 能量用完時會落地，那是機會。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'undertow',
    lines: [
      ['undertow', '潮水又來了。'],
      ['echo', 'UNDERTOW 推擊之後有 3 秒的空檔，那時候反擊。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'spire',
    lines: [
      ['spire', '你還在下面嗎？'],
      ['echo', 'SPIRE 換平台的時候會跳起來，那時候最好打。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'countdown',
    lines: [
      ['countdown', '倒數重新開始。'],
      ['echo', 'COUNTDOWN 的飛彈追得很緊，用 QB 在最後一刻橫向閃開。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'whiteout',
    lines: [
      ['whiteout', '雪又變大了。'],
      ['echo', 'WHITEOUT 在遠距離最危險。拉近距離，別在空曠的雪原上停下來。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'specimen',
    lines: [
      ['specimen', '這次的數值一定會更好。'],
      ['echo', 'SPECIMEN 過載結束後有 3 秒的硬直。等它。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'stevedore',
    lines: [
      ['stevedore', '又一筆退貨。這次換更重的砲彈。'],
      ['echo', 'STEVEDORE 的榴彈落地前有預警，橫向移動。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'sluice',
    lines: [
      ['sluice', '又回來了？水位已經漲上來了。'],
      ['echo', 'SLUICE 在高處的火力最強。別在下面跟它對射。'],
    ],
  },
  {
    event: 'segStart',
    type: 'elite',
    ace: 'marsh',
    lines: [
      ['marsh', '又來泡水了？'],
      ['echo', 'MARSH 靠近時才會浮出來。離開水道，逼它上岸。'],
    ],
  },
  // ---- 主題與轉場的提示 ----
  {
    event: 'segStart',
    sid: 'c1s1',
    theme: 'desert',
    type: 'battle',
    lines: [['echo', '這裡開始是礦坑的範圍，視野會變差。']],
  },
  {
    event: 'trans',
    sid: 'c1s1',
    seg: 3,
    lines: [['echo', '前方是礦場外圍。地面在往下陷，礦坑的入口應該就在那一側。']],
  },
  {
    event: 'segStart',
    theme: 'wasteland',
    type: 'battle',
    once: true,
    lines: [['echo', '拾荒 MT 的反應。它們會撿同伴的零件變強，先打落單的。']],
  },
  {
    event: 'segStart',
    theme: 'desert',
    type: 'destroy',
    once: true,
    lines: [['echo', '小心礦車，它們裝滿了炸藥。等它們靠近其他敵人再引爆。']],
  },
  {
    event: 'segStart',
    theme: 'dunes',
    once: true,
    lines: [['echo', '沙丘地帶。沙下有東西在動——腳下出現沙塵就馬上移開。']],
  },
  {
    event: 'trans',
    sid: 'c2s1',
    seg: 3,
    lines: [['echo', '前方是多重水壩的下游。河谷很長，電磁砲台的射程涵蓋整條河道。']],
  },
  {
    event: 'trans',
    sid: 'c3s2',
    seg: 3,
    lines: [['echo', '前方的地面在往下陷。研究所的閘門應該就在那裡。']],
  },
  {
    event: 'trans',
    sid: 'c6s1',
    seg: 4,
    lines: [['echo', '升空完成。從這裡開始是高空軌道，平台外面就是雲海。']],
  },
  {
    event: 'segStart',
    theme: 'orbit',
    once: true,
    lines: [['echo', '高空軌道。標定衛星會用光束標記你，被標定時受到的傷害會變重——先打掉它。']],
  },
  {
    event: 'segStart',
    theme: 'xylem',
    once: true,
    lines: [['echo', '洋上都市 Xylem。街區外是海，掉下去會被拉回來但會受損。小心衝撞無人機。']],
  },
  {
    event: 'segStart',
    theme: 'grid086',
    once: true,
    lines: [['echo', 'Grid 086。平台底下吊著砲塔，柱子上會有東西爬上來——上下都要注意。']],
  },
  {
    event: 'segStart',
    theme: 'spaceport',
    once: true,
    lines: [['echo', '舊宇宙港。推進器試車台還會噴火，看到地上的橘色預警就離開。']],
  },
  {
    event: 'segStart',
    theme: 'snow',
    once: true,
    lines: [['echo', '西部冰原。雪裡藏著東西——看到地上冒白煙就是潛伏的 MT。']],
  },
  {
    event: 'segStart',
    theme: 'institute',
    once: true,
    lines: [['echo', '地下技研都市。紅色的雷射柵欄會觸發警報，實驗體聚在一起會融合——先處理它們。']],
  },
  {
    event: 'segStart',
    theme: 'industrial',
    once: true,
    lines: [['echo', '貨運集散場。起重機還在運轉——看到地上的紅圈就是貨櫃要砸下來了。']],
  },
  {
    event: 'segStart',
    theme: 'dam',
    once: true,
    lines: [['echo', '多重水壩。閘門上有砲台——地面出現藍色預警就是要開閘了，別待在水道裡。']],
  },
  {
    event: 'segStart',
    theme: 'flooded',
    once: true,
    lines: [['echo', '水沒市街。水裡移動會變慢，水下還有砲艇——看到水花就是它要浮上來了。']],
  },
  // ---- 失敗 ----
  {
    event: 'fail',
    killedBy: 'RUST',
    lines: [
      ['rust', '哈！你的零件我收下了。'],
      ['echo', 'RUST 的裝備每次都不同，先看清楚它拿什麼再決定距離。'],
    ],
  },
  {
    event: 'fail',
    killedBy: 'PROSPECTOR',
    lines: [
      ['prospector', '礦坑不歡迎外人。'],
      ['echo', 'PROSPECTOR 的打樁打中就會失衡。不要在它正面停下來。'],
    ],
  },
  {
    event: 'fail',
    killedBy: 'SIROCCO',
    lines: [
      ['sirocco', '太慢了。'],
      ['echo', 'SIROCCO 會格擋正面的近戰。用射擊逼它，或是繞到側面。'],
    ],
  },
  { event: 'fail', killedBy: 'HALBERD', lines: [['echo', '電磁砲台的射線被擋住就會中斷充能。先找掩體。']] },
  { event: 'fail', killedBy: 'HELIOS', lines: [['echo', '母艦直升機在高處。站上屋頂或高架道路再打。']] },
  {
    event: 'fail',
    killedBy: 'BEHEMOTH',
    lines: [['echo', '推土要塞正面打不動。引它撞牆，硬直時繞到背後。']],
  },
  { event: 'fail', killedBy: 'IRON CITADEL', lines: [['echo', '列車進隧道時打不到。守在隧道口等它出來。']] },
  { event: 'fail', killedBy: 'STRIDER', lines: [['echo', '四足的腳下是死角，但它會跳起來踩你。保持移動。']] },
  {
    event: 'fail',
    killedBy: 'MIRAGE',
    lines: [['echo', '迷彩機開火時會現形。分身打中會爆炸，先確認哪一台是本體。']],
  },
  {
    event: 'fail',
    killedBy: 'PULSAR',
    lines: [['echo', '能量環要用 QB 穿過去。突刺之後它會過熱，那時候反擊。']],
  },
  { event: 'fail', killedBy: 'ARACHNE', lines: [['echo', '多足要塞斷三條腳就會倒下。集中打同一側的腳。']] },
  {
    event: 'fail',
    killedBy: 'CERBERUS',
    lines: [['echo', '三機合體分離後要在 30 秒內全部擊破，否則會合體回復。']],
  },
  { event: 'fail', killedBy: 'NULLIFIER', lines: [['echo', 'EMP 打中就不能 QB。保持距離，躲開它的射線。']] },
  {
    event: 'fail',
    killedBy: 'JUDGEMENT',
    lines: [['echo', '光柱越追越快，但轉彎有上限。用 QB 急轉甩開它。']],
  },
  { event: 'fail', killedBy: 'AEGIS', lines: [['echo', '護盾指揮艦的發生器在時打不進去。先拆發生器。']] },
  { event: 'fail', killedBy: 'LEVIATHAN', lines: [['echo', '空中要塞的引擎全毀後才會降下來。集中打引擎。']] },
  { event: 'fail', killedBy: 'VIPER', lines: [['echo', '突擊機掃射前會有警示線。掉頭減速時是攻擊的機會。']] },
  {
    event: 'fail',
    killedBy: 'IGUAZU',
    lines: [['echo', '兩台 AC 會互相掩護。拉開距離，讓它們分開再各個擊破。']],
  },
  { event: 'fail', killedBy: 'SERAPHIM', lines: [['echo', '浮游砲包圍時往外衝，別待在包圍圈中央。']] },
  { event: 'fail', killedBy: 'DOPPEL', lines: [['echo', '複製 AC 會適應你常用的武器。換武器打。']] },
  { event: 'fail', killedBy: 'BALTEUS', lines: [['echo', '最後一戰了，別放棄。換個裝備再試一次。']] },
  { event: 'fail', killedBy: 'JUGGERNAUT', lines: [['echo', 'JUGGERNAUT 的正面太硬了。繞到側面。']] },
  { event: 'fail', killedBy: 'CINDER', lines: [['echo', '燃燒的地面會一直扣血。別在火裡跟它對射。']] },
  { event: 'fail', killedBy: 'HELIOS', lines: [['echo', '先清掉它放出來的無人機，再打本體。']] },
  { event: 'fail', killedBy: 'HALBERD', lines: [['echo', '電磁砲充能時一定要躲到掩體後面。']] },
  { event: 'fail', killedBy: 'NULLIFIER', lines: [['echo', 'EMP 封鎖時沒辦法閃，看到預警就先跑。']] },
  { event: 'fail', killedBy: 'PULSAR', lines: [['echo', '能量環的波面要用快速推進穿過，不要往後退。']] },
  {
    event: 'fail',
    killedBy: 'ZENITH',
    lines: [
      ['zenith', '你看不到天空。'],
      ['echo', '別一直在地面跟它對射。跳起來，逼它換位置。'],
    ],
  },
  { event: 'fail', killedBy: '標定', lines: [['echo', '被標定之後所有攻擊都會更痛。優先擊落標定衛星。']] },
  { event: 'fail', killedBy: '作業機', lines: [['echo', '真空作業機會忽高忽低。用飛彈或預判射擊。']] },
  {
    event: 'fail',
    killedBy: 'UNDERTOW',
    lines: [
      ['undertow', '沉下去吧。'],
      ['echo', '被推到邊緣時用 QB 往內拉回來。和它保持中距離。'],
    ],
  },
  {
    event: 'fail',
    killedBy: '衝撞',
    lines: [['echo', '衝撞無人機撞之前會有預警線。橫向閃開，別站在它和虛空之間。']],
  },
  { event: 'fail', killedBy: '防空', lines: [['echo', '防空砲只打空中的目標。貼地接近，別在它附近跳。']] },
  {
    event: 'fail',
    killedBy: 'SPIRE',
    lines: [
      ['spire', '高度就是一切。'],
      ['echo', '別在 SPIRE 的正下方停留。找坡道上去和它平視。'],
    ],
  },
  {
    event: 'fail',
    killedBy: 'COUNTDOWN',
    lines: [
      ['countdown', '零。'],
      ['echo', '飛彈齊射時躲到防爆牆或建築物後面，等它換彈再衝。'],
    ],
  },
  {
    event: 'fail',
    killedBy: '爬行機',
    lines: [['echo', '爬行機會沿著柱子爬上平台。站在平台邊緣時注意下方。']],
  },
  {
    event: 'fail',
    killedBy: '試車台',
    lines: [['echo', '試車台的噴火方向在預警時就決定了。往側面閃，或擊破控制台讓它停下來。']],
  },
  {
    event: 'fail',
    killedBy: 'WHITEOUT',
    lines: [
      ['whiteout', '一發就夠了。'],
      ['echo', 'WHITEOUT 開火後會現身 2 秒多。抓住那個時機，或是貼近到 14 m 內。'],
    ],
  },
  {
    event: 'fail',
    killedBy: '潛伏',
    lines: [['echo', '雪中潛伏 MT 靠近才會現身。注意地上的白煙，先開火逼它出來。']],
  },
  {
    event: 'fail',
    killedBy: '滑行',
    lines: [['echo', '滑行砲車繞著你轉。往它的前進方向預判射擊，或離開冰面。']],
  },
  {
    event: 'fail',
    killedBy: 'SPECIMEN',
    lines: [
      ['specimen', '測試結束。'],
      ['echo', 'SPECIMEN 過載時保持距離，結束後的硬直才是攻擊的時機。'],
    ],
  },
  {
    event: 'fail',
    killedBy: '實驗體',
    lines: [['echo', '實驗體聚在一起會融合變大。在它們聚集之前分散擊破。']],
  },
  {
    event: 'fail',
    killedBy: '雷射網',
    lines: [['echo', '雷射柵欄會一直轉。看準它掃過去之後再穿過，或先打掉柵欄柱。']],
  },
  {
    event: 'fail',
    killedBy: 'STEVEDORE',
    lines: [
      ['stevedore', '簽收完成。'],
      ['echo', 'STEVEDORE 怕近身。貼著貨櫃堆接近，再一口氣衝過去。'],
    ],
  },
  {
    event: 'fail',
    killedBy: '起重機',
    lines: [['echo', '起重機砲台不會移動。貼近打塔身，它的貨櫃砸不到腳下。']],
  },
  {
    event: 'fail',
    killedBy: '叉架',
    lines: [['echo', '叉架 MT 的正面有貨櫃擋著。繞到側面，或用近戰把貨櫃打掉。']],
  },
  {
    event: 'fail',
    killedBy: 'SLUICE',
    lines: [
      ['sluice', '沉下去吧。'],
      ['echo', 'SLUICE 喜歡站在壩頂。從坡道或閘門上方繞上去，近身打它。'],
    ],
  },
  {
    event: 'fail',
    killedBy: '閘門',
    lines: [['echo', '開閘的水流會把你往下游沖。看到藍色預警就跳起來，或往水道兩側移開。']],
  },
  {
    event: 'fail',
    killedBy: 'MARSH',
    lines: [
      ['marsh', '沉到底吧。'],
      ['echo', '在水裡你會變慢，MARSH 不會。站上屋頂或高架道路再打。'],
    ],
  },
  {
    event: 'fail',
    killedBy: '潛航',
    lines: [['echo', '潛航砲艇只在浮出水面時打得到。注意魚雷的來向，橫向閃開。']],
  },
  {
    event: 'fail',
    killedBy: '汙染',
    lines: [['echo', '腐蝕區會持續損傷、讓 ACS 回復變慢。別在綠色的地面上停留。']],
  },
  { event: 'fail', fails: 3, lines: [['echo', '已經第三次了。換個裝備試試看？重量和射程都會影響打法。']] },
  {
    event: 'fail',
    killedBy: 'BASTILLE',
    lines: [['echo', '砲台正面太硬了。先打周圍的設施，砲台的裝甲才會變弱。']],
  },
  { event: 'fail', killedBy: 'SANDWORM', lines: [['echo', '鑽地蟲在地下時打不到。等它鑽出來再集中火力。']] },
  { event: 'fail', killedBy: 'MT', lines: [['echo', '被雜兵圍住了。用 QB 拉開距離，別停在原地。']] },
  ...variants({ event: 'fail' }, 'echo', [
    'AC 回收完成。從紀錄點重新開始吧。',
    '回收完成了，別在意，再來一次。',
    '機體回收了，我們從紀錄點重來。',
    '沒關係，從紀錄點再試一次吧。',
    '回收完畢，休息一下再出發。',
    '這次不太順，調整一下再上。',
    'AC 回收好了，人沒事最重要。',
    '紀錄點還在，我們重新來過。',
    '回收完成。想一下哪裡可以改，再試試。',
    '只是輸了這一次而已，再挑戰吧。',
  ]),
];
