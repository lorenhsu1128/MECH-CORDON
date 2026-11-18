// 表情與影格的定義：prompt＝Qwen-Image-Edit 的指令（英文，模型比較聽得懂）；tags＝SDXL 的標籤（嘴型用 SDXL 重畫）
// 共用 8 種＋每個角色可以在 card 裡加自己的招牌表情（card.extraExprs：[{ id, name, prompt, tags? }]）
export const KEEP =
  'Do not change anything else: same character, same face shape, same hair and bangs, same clothes, same pose, same background, same art style.';

export const EXPRS = [
  { id: 'neutral', name: '平常', prompt: '', tags: 'expressionless' }, // 主圖本身
  {
    id: 'smile',
    name: '微笑',
    prompt: 'Make the character smile gently with a closed mouth.',
    tags: 'smile',
  },
  {
    id: 'laugh',
    name: '大笑',
    prompt: 'Make the character laugh happily with an open mouth.',
    tags: 'laughing, happy',
  },
  {
    id: 'angry',
    name: '怒',
    prompt: 'Make the character look angry, frowning with furrowed eyebrows.',
    tags: 'angry, frown',
  },
  {
    id: 'surprised',
    name: '驚',
    prompt: 'Make the character look surprised, with wide eyes and a small open mouth.',
    tags: 'surprised',
  },
  {
    id: 'sad',
    name: '悲',
    prompt: 'Make the character look sad, with lowered eyebrows and a slight frown.',
    tags: 'sad, frown',
  },
  {
    id: 'think',
    name: '思考',
    prompt: 'Make the character look thoughtful, eyes looking slightly to the side, lips pressed together.',
    tags: 'thinking, serious',
  },
  {
    id: 'smug',
    name: '不屑',
    prompt: 'Make the character look smug and dismissive, with a one-sided smirk and half-lidded eyes.',
    tags: 'smug, smirk',
  },
];

// 每個表情的影格（2026-11-15 立繪大修）：都用 Qwen 改「放大的臉」、只貼回眼睛或嘴巴裡真的改了的像素（workflows.js 的 qwenEditCrop）。
// 指令以 {ex} 代入那個表情的描述（tags），要求保留表情：以前嘴型用 SDXL＋角色外觀的標籤重畫，驚訝、生氣說話時會變成笑臉
export const EYE_FRAMES = [
  {
    id: 'e1',
    name: '半閉',
    prompt:
      'Make BOTH eyes half closed, as in the middle of a blink: the upper eyelid line comes down over the eye so it covers the top half of each iris and pupil; only the lower half of each iris is still visible below the eyelid. The eyes must look clearly half shut, not open. Both eyes change the same way, including an eye partly hidden by hair. Do not move or redraw hair or eyebrows; keep every wrinkle, frown line and shadow on the face exactly as now, do not add or remove anything around the eyes, and do not add blush, keep the {ex} expression.',
  },
  {
    id: 'e2',
    name: '閉眼',
    prompt:
      'Close BOTH eyes completely: draw each closed eye as one curved eyelid line with eyelashes, at the same position and width as the open eye. No iris, pupil or white of the eye may remain visible on either eye, including an eye partly hidden by hair. Do not move or redraw hair or eyebrows; keep every wrinkle, frown line and shadow on the face exactly as now, do not add or remove anything around the eyes, and do not add blush, keep the {ex} expression.',
  },
];
export const MOUTH_FRAMES = [
  {
    id: 'm1',
    name: '微開',
    prompt:
      'Change only the mouth: the lips are slightly parted as if starting to say a word. Keep the {ex} expression of the mouth (same mouth corners, same mood, same teeth and lip style and colors as now).',
    tags: 'parted lips',
  },
  {
    id: 'm2',
    name: '張開',
    prompt:
      'Change only the mouth: open it as when speaking a vowel, a medium open mouth. Keep the {ex} expression of the mouth (same mouth corners, same mood, same teeth, tongue and lip style and colors as now).',
    tags: 'open mouth, talking',
  },
  {
    id: 'm3',
    name: '圓口',
    prompt:
      'Change only the mouth: open it slightly into a small rounded opening, a little smaller than a talking mouth, as when saying a soft o sound. Draw it with the same thin simple anime lines as the current mouth: no thick lips, no lip outline ring, no double outline, no gloss. Keep the chin, jaw line and everything below the mouth exactly the same. Keep the {ex} expression of the face, same colors as now.',
    tags: 'open mouth, :o',
  },
];
// 戴眼鏡的角色的眨眼是在拿掉眼鏡的圖上做，最後疊回原本的鏡框（pipeline.js 的 nog）；指示要明說沒有眼鏡，
// 否則 Qwen 會再畫一副（2026-11-16）。不要在其他角色的指示提到眼鏡：會幫他們戴上
export const KEEP_GLASSES =
  'The character wears glasses: the glasses frame and lenses stay on the face exactly as now, fully visible, same shape and position; only the eyes behind the lenses change.';
export const NO_GLASSES = 'The character is not wearing glasses in this image; do not add glasses.';
// 底圖本來就張著嘴的表情（大笑、驚訝、喊叫…）：m1「微開」會把嘴變小、情緒就跑掉，改用這組指示（pipeline.js 依表情的 tags 判斷）
export const OPEN_MOUTH_FRAMES = {
  m1: 'Change only the mouth: make the opening about two thirds as tall as now; it must stay clearly open (teeth and the inside of the mouth still visible), the same shape, same teeth and the same {ex} mood; the mouth corners stay where they are. Do not close the mouth.',
  m2: 'Change only the mouth: open it a little wider than now, the same shape, same teeth and same {ex} mood.',
  m3: 'Change only the mouth: make the opening a little rounder and slightly smaller than now, same {ex} mood, drawn with the same thin anime lines; no thick lips, no double outline.',
};
export const OPEN_MOUTH_RE = /open mouth|laugh|shout|scream|roar|surpris|panic|yell|gasp/i;
// 微笑類的表情（微笑、得意、溫柔、淺笑…）：說話時嘴角要保持上揚，否則一開口笑意就不見（2026-11-16 薩奇博士的品管）
export const SMILE_MOUTH_FRAMES = {
  m1: 'Change only the mouth: open the lips a little while still smiling, so a clearly visible dark curved gap shows between the lips (a small talking smile); both mouth corners stay turned up exactly as now. Keep the {ex} mood.',
  m2: 'Change only the mouth: open the mouth while still smiling, as when talking happily: both mouth corners stay turned up, the opening is a wide upward-curved smile shape (like a D lying on its side), not a round O and not a shout. Keep the {ex} mood.',
  m3: 'Change only the mouth: a small open smiling mouth: the corners still turned up, slightly rounder opening than a grin, drawn with the same thin anime lines; no thick lips. Keep the {ex} mood.',
};
export const SMILE_RE = /smile|smirk|smug|grin|happy|tender|wry|cheer|sly|cocky|proud/i;
export const KEEP_EYES =
  'Keep the eyes and the eyebrows exactly the same. Do not add any objects, marks, symbols, text, letters or new colors.';
// 嘴型共用：線條的粗細與顏色照現在的嘴（Qwen 會畫成粗黑框；2026-11-16）
export const MOUTH_STYLE =
  'Draw the new mouth with the same thin soft line weight and the same line color as the current mouth (no thick black outline), and do not redraw the nose, chin or cheeks.';
export const KEEP_MOUTH =
  'Keep the mouth exactly the same. Do not add any objects, marks, symbols, text, letters or new colors.';

// 角色的表情：共用的（card.baseExprs＝要用哪幾種，沒有＝全部；平常一定有）＋招牌表情（card.extraExprs）
// （立繪工房第 5 期：新增角色時從專案設定複製 baseExprs／extraExprs／frames 到角色卡）
export const exprList = (card) => [
  ...EXPRS.filter((e) => e.id === 'neutral' || !card || !card.baseExprs || card.baseExprs.includes(e.id)),
  ...((card && card.extraExprs) || []),
];
// 角色的影格：card.frames＝要做哪幾種（沒有＝全部：半閉、閉眼、微開、張開、圓口）
export const ALL_FRAMES = [...EYE_FRAMES, ...MOUTH_FRAMES];
export const frameList = (card) =>
  ALL_FRAMES.filter((f) => !card || !Array.isArray(card.frames) || card.frames.includes(f.id));

// 新角色預先填好的招牌表情（2026-11-18 使用者要求：所有的表情先填進去）：這次遊戲角色用過的、通用的招牌表情
// （去掉某個角色專屬的：ECHO 的干擾、COUNTDOWN 的倒數、聖域的誓詞…與重複的）。不要的在「外觀」分頁刪掉那一行
export const EXTRA_LIBRARY = [
  {
    id: 'intrigued',
    name: '好奇',
    prompt:
      'Make the character look fascinated: eyes slightly widened with interest, a deeper curious smile.',
    tags: 'interested, wide eyes, smile',
  },
  {
    id: 'easy',
    name: '從容',
    prompt:
      'Make the character smile in a laid-back way: half-closed relaxed eyes and an easy, amused smile.',
    tags: 'half-closed eyes, smile, relaxed',
  },
  {
    id: 'weary',
    name: '疲倦',
    prompt: 'Make the character look weary: eyes closed, a tired sigh with the mouth slightly open.',
    tags: 'closed eyes, sigh, tired',
  },
  {
    id: 'guilt',
    name: '愧疚',
    prompt:
      'Make the character look guilty and troubled: eyes looking away to the side, eyebrows drawn together, mouth closed tight.',
    tags: 'guilt, looking away, frown, closed mouth',
  },
  {
    id: 'scheme',
    name: '算計',
    prompt: 'Make the character look calculating: eyes narrowed, a sly one-sided grin.',
    tags: 'narrowed eyes, smirk, sly',
  },
  {
    id: 'thrill',
    name: '亢奮',
    prompt: 'Make the character look ecstatic: eyes wide open with tiny pupils, a huge thrilled grin.',
    tags: 'crazy eyes, ecstatic, wide grin',
  },
  {
    id: 'wry',
    name: '淺笑',
    prompt:
      'Make the character give a dry, subtle one-sided smile: only one corner of the mouth is raised, the eyes stay calm.',
    tags: 'smirk, light smile',
  },
  {
    id: 'focus',
    name: '專注',
    prompt:
      'Make the character look focused, eyes looking to the side as if reading a screen, lips pressed together.',
    tags: 'serious, looking to the side, closed mouth',
  },
  {
    id: 'tender',
    name: '溫柔',
    prompt:
      'Make the character smile softly and warmly, with relaxed gentle eyes and slightly lowered eyelids.',
    tags: 'gentle smile, half-closed eyes',
  },
  {
    id: 'hesitate',
    name: '猶豫',
    prompt:
      'Make the character look hesitant: eyes looking down, lips slightly parted as if about to say something but holding back.',
    tags: 'looking down, parted lips, worried',
  },
  {
    id: 'puzzled',
    name: '困惑',
    prompt: 'Make the character look puzzled, with slightly furrowed eyebrows and a questioning look.',
    tags: 'confused, frown',
  },
  {
    id: 'shout',
    name: '喊叫',
    prompt: 'Make the character shout into the radio: mouth wide open, eyebrows raised, intense eyes.',
    tags: 'shouting, open mouth, intense',
  },
  {
    id: 'panic',
    name: '驚慌',
    prompt: 'Make the character panic: wide eyes, sweat drops, mouth open in alarm.',
    tags: 'panicking, wide eyes, sweat, open mouth',
  },
  {
    id: 'cocky',
    name: '痞笑',
    prompt: 'Make the character grin cockily: a lopsided smirk with half-lidded playful eyes.',
    tags: 'smirk, half-closed eyes, cocky',
  },
  {
    id: 'quizzical',
    name: '挑眉',
    prompt: 'Make the character look quizzical: one eyebrow raised high, mouth slightly open in doubt.',
    tags: 'raised eyebrow, confused, open mouth',
  },
  {
    id: 'approve',
    name: '認可',
    prompt:
      'Make the character show faint approval: the corners of the mouth barely rise, eyes relaxed slightly, a small nod.',
    tags: 'slight smile, closed mouth',
  },
  {
    id: 'solemn',
    name: '肅穆',
    prompt: 'Make the character look solemn: a calm steady gaze straight ahead, mouth closed.',
    tags: 'serious, calm, closed mouth',
  },
  {
    id: 'hard',
    name: '冷硬',
    prompt: 'Make the character glare coldly: brows pressed low, a hard stare, mouth closed.',
    tags: 'glaring, frown, closed mouth',
  },
  {
    id: 'roar',
    name: '怒吼',
    prompt: 'Make the character roar in anger: teeth clenched, mouth open shouting, eyes fierce.',
    tags: 'shouting, angry, clenched teeth',
  },
  {
    id: 'sneer',
    name: '嘲諷',
    prompt: 'Make the character sneer: one corner of the mouth raised, one eyebrow lifted mockingly.',
    tags: 'smirk, raised eyebrow, mocking',
  },
  {
    id: 'creep',
    name: '陰笑',
    prompt: 'Make the character grin creepily: eyes narrowed to slits and a wide grin showing sharp teeth.',
    tags: 'narrowed eyes, evil grin, sharp teeth',
  },
  {
    id: 'nervous',
    name: '緊張',
    prompt:
      'Make the character look nervous: a forced awkward smile, sweat drops on the face, eyebrows raised in worry.',
    tags: 'nervous smile, sweatdrop, worried',
  },
  {
    id: 'grudge',
    name: '怨恨',
    prompt: 'Make the character glare with hatred: eyes looking up from under the brows, teeth clenched.',
    tags: 'glaring, clenched teeth, angry',
  },
  {
    id: 'wary',
    name: '戒備',
    prompt:
      'Make the character look wary and distrustful: eyes narrowed, eyebrows slightly lowered, mouth closed.',
    tags: 'narrowed eyes, suspicious, closed mouth',
  },
  {
    id: 'mourn',
    name: '哀悼',
    prompt: 'Make the character mourn quietly: eyes closed, head slightly bowed, lips pressed together.',
    tags: 'closed eyes, sad, closed mouth',
  },
  {
    id: 'proud',
    name: '傲視',
    prompt:
      'Make the character look haughty: chin raised, eyes looking down at the viewer with cold pride, mouth closed.',
    tags: 'looking down, haughty, closed mouth',
  },
  {
    id: 'eager',
    name: '戰意',
    prompt: 'Make the character look eager for battle: eyes bright and sharp, a faint thin smile.',
    tags: 'sharp eyes, slight smile, excited',
  },
  {
    id: 'stern',
    name: '堅守',
    prompt: 'Make the character look resolute and stern: brows furrowed, eyes firm and steady, mouth set.',
    tags: 'serious, determined, frown',
  },
  {
    id: 'letdown',
    name: '失望',
    prompt: 'Make the character look disappointed: eyes lowered, a quiet sigh, mouth slightly open.',
    tags: 'looking down, sigh, disappointed',
  },
  {
    id: 'manic',
    name: '瘋笑',
    prompt: 'Make the character laugh manically: shrunken pupils, wide eyes, a huge unhinged open grin.',
    tags: 'crazy eyes, constricted pupils, crazy smile, open mouth',
  },
  {
    id: 'envy',
    name: '嫉妒',
    prompt: 'Make the character look jealous and hurt: teary eyes glaring, teeth clenched.',
    tags: 'tears, glaring, clenched teeth',
  },
  {
    id: 'boast',
    name: '得意',
    prompt: 'Make the character look boastful: a wide cocky grin and one raised eyebrow.',
    tags: 'smug, grin, raised eyebrow',
  },
  {
    id: 'rage',
    name: '狂怒',
    prompt: 'Make the character rage: eyes wide, shouting furiously with mouth wide open.',
    tags: 'furious, shouting, wide eyes',
  },
  {
    id: 'hearty',
    name: '豪爽',
    prompt: 'Make the character laugh heartily: eyes squeezed in a big open-mouthed grin.',
    tags: 'laughing, big grin, closed eyes',
  },
  {
    id: 'guard',
    name: '守護',
    prompt: 'Make the character look resolute: steady firm eyes, chin slightly lowered, mouth closed.',
    tags: 'determined, serious, closed mouth',
  },
  {
    id: 'distant',
    name: '漠然',
    prompt: 'Make the character look distant: half-lidded eyes gazing far away, expressionless.',
    tags: 'half-closed eyes, looking away, expressionless',
  },
  {
    id: 'wink',
    name: '眨眼',
    prompt: 'Make the character wink playfully: one eye closed, the other open, with a cheeky grin.',
    tags: 'one eye closed, wink, grin',
  },
  {
    id: 'cold',
    name: '冷酷',
    prompt:
      'Make the character look cold and ruthless: the smile is gone, eyes half-lidded and icy, looking down at the viewer, mouth closed.',
    tags: 'expressionless, cold, half-closed eyes, closed mouth',
  },
  {
    id: 'provoke',
    name: '挑釁',
    prompt: 'Make the character smirk provocatively: narrowed eyes and a sly fanged grin.',
    tags: 'narrowed eyes, smirk, fang',
  },
  {
    id: 'aim',
    name: '瞄準',
    prompt:
      'Make the character focus as if aiming: one eye narrowed, the other steady and sharp, mouth closed.',
    tags: 'one eye closed, focused, serious',
  },
  {
    id: 'icy',
    name: '冷眼',
    prompt: 'Make the character look icy: half-lidded cold eyes, completely expressionless.',
    tags: 'half-closed eyes, expressionless, cold',
  },
  {
    id: 'resolve',
    name: '振作',
    prompt: 'Make the character look determined: eyes firm and focused, teeth gritted in resolve.',
    tags: 'determined, clenched teeth, serious',
  },
  {
    id: 'mercy',
    name: '慈悲',
    prompt: 'Make the character smile with gentle sorrow: kind eyes glistening with tears, a soft sad smile.',
    tags: 'sad smile, teary eyes, gentle',
  },
];
