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

// 每個表情的影格：眼睛（半閉、閉）用 Qwen 只貼眼睛那一塊，嘴型用 SDXL 只貼嘴巴那一塊
export const EYE_FRAMES = [
  {
    id: 'e1',
    name: '半閉',
    prompt: 'The eyes are half closed, the upper eyelids lowered halfway, as in the middle of a blink.',
  },
  {
    id: 'e2',
    name: '閉眼',
    prompt:
      'Both eyelids are fully closed, eyes shut. The closed eyes are drawn as thin curved lines with eyelashes, the same size and position as the original eyes. No iris visible.',
  },
];
export const MOUTH_FRAMES = [
  {
    id: 'm1',
    name: '微開',
    prompt: 'The lips are slightly parted, as if starting to speak.',
    tags: 'parted lips',
  },
  {
    id: 'm2',
    name: '張開',
    prompt: 'The mouth is open as if talking, showing a small open mouth.',
    tags: 'open mouth, talking',
  },
  {
    id: 'm3',
    name: '圓口',
    prompt: 'The mouth forms a small round "o" shape, as if saying "oh".',
    tags: 'open mouth, :o',
  },
];
export const KEEP_EYES = 'Keep the eyes and eyebrows exactly the same.';
export const KEEP_MOUTH = 'Keep the mouth exactly the same.';

export const exprList = (card) => [...EXPRS, ...((card && card.extraExprs) || [])];
