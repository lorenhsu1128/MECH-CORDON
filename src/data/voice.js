// ============================================================
//  ECHO 的語音（docs/audio-design.md 第 4 期）：純資料與純函式。
//  語音檔由 scripts/voice-lines.js 收集台詞 → scripts/voice-gen.py（Kokoro-82M v1.1-zh）產生，
//  放在 src/assets/voice/echo/<鍵>.mp3：劇情台詞的鍵＝vkey(文字)，系統提示的鍵＝'s_' + id。
//  改了台詞就要重新產生（沒有語音的台詞照舊只有文字）。
// ============================================================

// 文字 → 鍵（FNV-1a 32 位元，36 進位）；全形與半形空白、前後的空白不算
export function vkey(text) {
  const s = String(text).replace(/\s+/g, ''); // \s 包含全形空白（U+3000）
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return 'h' + h.toString(36);
}

// 序章與章節畫面的台詞：「ECHO：「……」」或「ECHO（私人頻道）：「……」」→ 引號裡的句子；不是 ECHO 的回傳 null
export function echoQuote(line) {
  const m = /^ECHO(?:（[^）]*）)?：「(.+)」$/.exec(String(line).trim());
  return m ? m[1] : null;
}

// 增援預告的鐘點（1～12）念法
const CLOCK = ['', '一', '兩', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];

// 系統提示：id → { t 台詞, p 優先度（高的打斷低的）, cd 冷卻秒數 }；「comm」設定時不唸
export const VOICE_CUES = {
  missile: { t: '導彈接近，注意閃避！', p: 3, cd: 6 },
  lock: { t: '被鎖定了。', p: 2, cd: 10 },
  ap50: { t: 'AP 剩一半，小心。', p: 2, cd: 30 },
  ap25: { t: 'AP 危險！先拉開距離。', p: 3, cd: 25 },
  ammoLow: { t: '彈藥不多了。', p: 1, cd: 40 },
  ammoOut: { t: '這把武器的彈藥用完了。', p: 2, cd: 30 },
  stagger: { t: '姿勢控制失衡！', p: 3, cd: 8 },
  kit: { t: '修復完成。', p: 1, cd: 3 },
  boss: { t: '大型反應接近。不要硬碰。', p: 2, cd: 60 },
  bossBreak: { t: '它失衡了，現在攻擊！', p: 2, cd: 12 },
  bossPhase: { t: '它的反應變了，注意新的攻擊模式。', p: 2, cd: 20 },
  clear: { t: '區域清除。', p: 1, cd: 5 },
  exits: { t: '出口已經開啟。', p: 1, cd: 5 },
  success: { t: '任務完成。辛苦了。', p: 2, cd: 5 },
  aceDown: { t: '具名 AC，擊破確認。', p: 2, cd: 5 },
  extract: { t: '撤離時間開始。還有補給箱，去拿吧。', p: 1, cd: 10 },
  waveAc: { t: '敵對 AC 也在裡面。', p: 1, cd: 0 },
  waveLast: { t: '這是最後一波。', p: 1, cd: 0 },
  airLock: { t: '有敵機咬住你了，甩掉它。', p: 2, cd: 12 },
};
for (let i = 1; i <= 12; i++) {
  VOICE_CUES['waveIn' + i] = { t: `增援接近，${CLOCK[i]}點鐘方向。`, p: 2, cd: 0 };
  VOICE_CUES['waveDrop' + i] = { t: `運輸機空降，${CLOCK[i]}點鐘方向！`, p: 2, cd: 0 };
}
