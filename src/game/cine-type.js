// Game：過場動畫的字卡（文字風格，docs/cinematics.md 的「文字風格」；共用的繪製在 render/cine-brand.js）。
//   - 事件的字卡（劇本 ev 的 card，style：card 旁白字卡／logo 片名／name 宿敵與 Boss 名牌（kind：boss｜rival）／
//     loc 地點／decision 抉擇）：畫在疊加畫布（3D 之上），避開遮幅；時間以過場的時間為準
//   - 2D 舞台的元素：k 'rival'（名牌）、'loc'（地點卡）、'endcard'（章末與抉擇之後的結語＋橡皮章）
// 畫法都是「單位 k＝畫面高 / 900」的座標，所以 3D 疊加（螢幕像素）與 2D 舞台（1600×900）共用一組函式。
// 設定「文字演出」關閉時，事件的字卡改成字幕（照舊）；2D 舞台的元素照畫。
import { clamp } from '../core/math.js';
import {
  BC,
  FB,
  FD,
  FL,
  FM,
  capsule,
  cross,
  dotBlock,
  gear,
  hazard,
  measure,
  splat,
  stamp,
  sticker,
  tape,
  warnTri,
} from '../render/cine-brand.js';
import { Game } from './game.js';

const easeOut = (k) => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const easeBack = (k) => {
  k = clamp(k, 0, 1);
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};
// 砸下來：u 從 t 開始的 d 秒，1.3 倍 → 1 倍
const slam = (u, t, d = 0.14, from = 1.3) => (u < t ? 0 : 1 + (from - 1) * (1 - easeOut((u - t) / d)));
const isLatin = (s) => /^[\x20-\x7e—–’‘“”…•×·°／]*$/.test(s);
// 字串裡有中文就用標題字，全是英數就用英數字
const famOf = (s) => (isLatin(s) ? FL : FD);
// 字串的種子（墨漬的形狀、座標）
const seedOf = (s) => [...(s || '')].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);

// ---------- 繪製（W、H＝畫布大小，top／bot＝可用的上下界（避開遮幅），u＝出現後的秒數，out＝收起的進度 0～1）----------

// 旁白字卡：斜的黑帶、白邊，字一個一個彈出，**…** 的關鍵詞放進黃綠色塊；s＝下面的註解
function paintNarr(x, W, H, u, out, o) {
  const k = H / 900;
  const segs = String(o.text)
    .split('**')
    .map((s, i) => ({ s, em: i % 2 === 1 }))
    .filter((g) => g.s);
  let size = 66 * k;
  const total = () =>
    segs.reduce((a, g) => a + measure(x, g.s, { size, font: FD }) + (g.em ? size * 0.5 : 0), 0);
  const maxW = W * 0.86;
  if (total() > maxW) size *= maxW / total();
  const cy = H * 0.47;
  x.save();
  x.globalAlpha *= 1 - out;
  x.translate(W / 2 - out * W * 0.08, cy);
  x.rotate(-0.052);
  // 黑帶：從左擦開
  const bw = W * 1.3 * easeOut(u / 0.28);
  const bh = size * 1.9;
  x.fillStyle = BC.white;
  x.fillRect(-W * 0.65, -bh / 2 - 6 * k, bw, bh + 12 * k);
  x.fillStyle = BC.ink;
  x.fillRect(-W * 0.65, -bh / 2, bw, bh);
  // 字
  const tw = total();
  let px = -tw / 2,
    i = 0;
  for (const g of segs) {
    const gw = measure(x, g.s, { size, font: FD }) + (g.em ? size * 0.5 : 0);
    // 色塊在這一段的第一個字出現時彈出
    const kk = g.em ? easeBack((u - 0.18 - i * 0.035) / 0.2) : 0;
    if (g.em) {
      if (kk > 0) {
        x.save();
        x.translate(px + gw / 2, 0);
        x.scale(kk, kk);
        x.fillStyle = BC.white;
        x.fillRect(-gw / 2 - 4 * k, -size * 0.72 - 4 * k, gw + 8 * k, size * 1.44 + 8 * k);
        x.fillStyle = BC.acc;
        x.fillRect(-gw / 2, -size * 0.72, gw, size * 1.44);
        x.restore();
      }
    }
    let cx = px + (g.em ? size * 0.25 : 0);
    for (const ch of g.s) {
      const cw = measure(x, ch, { size, font: FD });
      const t = 0.18 + i * 0.035;
      if (u >= t) {
        const sc = easeBack((u - t) / 0.16);
        x.save();
        x.translate(cx + cw / 2, 0);
        x.scale(sc, sc);
        sticker(x, ch, 0, size * 0.03, {
          size,
          font: FD,
          align: 'center',
          fill: g.em && kk > 0.6 ? BC.ink : BC.white,
          edgeW: 0,
          inkW: g.em && kk > 0.6 ? 0 : size * 0.06,
          shadow: 0,
        });
        x.restore();
      }
      cx += cw;
      i++;
    }
    px += gw;
  }
  // 註解
  if (o.sub && u > 0.6) {
    x.globalAlpha *= clamp((u - 0.6) / 0.3, 0, 1);
    const lat = isLatin(o.sub);
    x.font = lat ? `600 ${17 * k}px ${FM}` : `700 ${22 * k}px ${FB}`;
    x.letterSpacing = (lat ? 5 : 2) * k + 'px';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineJoin = 'round';
    x.strokeStyle = BC.ink;
    x.lineWidth = 5 * k;
    const sy = bh / 2 + 34 * k;
    x.strokeText(o.sub, 0, sy);
    x.fillStyle = lat ? BC.acc : '#fff3dc';
    x.fillText(o.sub, 0, sy);
  }
  x.restore();
}

// 片名：標題頁的 LOGO 圖砸下來，兩條封鎖膠帶交叉掃過，下面「機戰封鎖線」的黑膠囊
function paintLogo(x, W, H, u, out, o) {
  const k = H / 900;
  const img = document.querySelector('#titleLogo img');
  x.save();
  x.globalAlpha *= 1 - out;
  // 壓暗背景
  x.fillStyle = `rgba(0,0,0,${0.35 * clamp(u / 0.2, 0, 1)})`;
  x.fillRect(0, 0, W, H);
  // 膠帶
  const L = W * 1.5;
  const t1 = easeOut((u - 0.05) / 0.22),
    t2 = easeOut((u - 0.14) / 0.22);
  if (t1 > 0) tape(x, -W * 0.2, H * 0.3, L * t1, 0.14, { h: 46 * k, scroll: u * 40 * k });
  if (t2 > 0)
    tape(x, -W * 0.2, H * 0.72, L * t2, -0.12, {
      h: 46 * k,
      scroll: -u * 40 * k,
      words: ['KEEP OUT', 'CAUTION'],
    });
  // LOGO
  if (img && img.complete && img.naturalWidth && u >= 0.3) {
    const w = Math.min(W * 0.6, H * 1.05);
    const h = (w * img.naturalHeight) / img.naturalWidth;
    const sc = slam(u, 0.3, 0.16, 1.22) * (1 + Math.max(0, u - 0.5) * 0.008);
    x.save();
    x.translate(W / 2, H * 0.47);
    x.scale(sc, sc);
    x.shadowColor = 'rgba(0,0,0,0.6)';
    x.shadowOffsetY = 12 * k;
    x.drawImage(img, -w / 2, -h / 2, w, h);
    x.restore();
    // 白閃
    const f = 1 - (u - 0.3) / 0.18;
    if (f > 0) {
      x.fillStyle = `rgba(255,255,255,${0.7 * f})`;
      x.fillRect(0, 0, W, H);
    }
  } else if (u >= 0.3) {
    // LOGO 圖拿不到（不應該發生）：貼紙字代替
    sticker(x, o.text, W / 2, H * 0.47, { size: 120 * k, font: FL, align: 'center', fill: BC.red });
  }
  if (o.sub && u > 0.75) {
    x.globalAlpha *= clamp((u - 0.75) / 0.25, 0, 1);
    capsule(x, o.sub, W / 2, H * 0.78, {
      size: 28 * k,
      font: FB,
      fg: BC.white,
      ls: 12 * k,
      align: 'center',
      bw: 4 * k,
    });
  }
  x.restore();
}

// 宿敵與 Boss 的名牌：類別膠囊 → 名字的貼紙字 → 斜的膠帶；名字旁的警告三角與墨漬。(bx, by)＝名字基線的左端
function paintName(x, W, H, u, out, o, bx, by) {
  const k = H / 900;
  const boss = o.kind === 'boss';
  const col = o.color || (boss ? BC.red : BC.yel);
  const fam = famOf(o.text);
  let size = (o.size || 120) * k;
  const maxW = o.maxW ? o.maxW * k : W * 0.62;
  const nw = () => measure(x, o.text, { size, font: fam });
  if (nw() > maxW) size *= maxW / nw();
  x.save();
  x.globalAlpha *= 1 - out;
  x.translate(bx - out * 60 * k, by);
  x.rotate(-0.07);
  // 膠帶（從左甩進來，字往左流動）
  const tl = (W * 0.75 + nw() * 0.4) * easeOut(u / 0.22);
  if (tl > 0)
    tape(x, -bx - 40 * k, size * 0.62, tl, 0, {
      h: 40 * k,
      scroll: u * 50 * k,
      bg: boss ? BC.yel : col,
      words: boss ? ['WARNING', 'THREAT DETECTED'] : ['RIVAL', 'RIVAL', 'RIVAL'],
    });
  // 名字
  const sc = slam(u, 0.12, 0.14, 1.35);
  if (sc) {
    x.save();
    x.scale(sc, sc);
    sticker(x, o.text, 0, 0, {
      size,
      font: fam,
      fill: boss ? '#ececec' : BC.white,
      align: 'left',
    });
    x.restore();
    const ex = nw() + size * 0.42;
    warnTri(x, ex, -size * 0.28, size * 0.26);
    splat(x, ex - size * 0.15, -size * 0.55, size * 0.09, seedOf(o.text), { k: easeOut((u - 0.2) / 0.3) });
  }
  // 類別膠囊
  if (u > 0.26) {
    const cap = (boss ? 'BOSS' : 'RIVAL') + (o.tag ? ' ／ ' + o.tag : '');
    const kk = easeBack((u - 0.26) / 0.18);
    x.save();
    x.translate(0, -size * 0.98);
    x.scale(kk, kk);
    capsule(x, cap, 0, 0, {
      size: 28 * k,
      font: FL,
      bg: boss ? BC.red : col,
      fg: boss ? BC.white : BC.ink,
      border: BC.white,
      bw: 3.5 * k,
    });
    x.restore();
  }
  x.restore();
}

// 地點卡（左上）：LOCATION 膠囊＋座標 → 黑斜卡白邊的地名 → 警戒斜紋 → 英文名
function paintLoc(x, W, H, u, out, o, bx, by) {
  const k = H / 900;
  const name = o.text,
    en = o.sub || '';
  const seed = seedOf(name);
  const coord = `${String(seed % 90).padStart(2, '0')}°${String((seed * 7) % 60).padStart(2, '0')}'N / ${String(
    (seed * 13) % 180,
  ).padStart(3, '0')}°${String((seed * 11) % 60).padStart(2, '0')}'E`;
  const size = 44 * k;
  x.save();
  x.globalAlpha *= 1 - out;
  x.translate(bx - out * 30 * k, by);
  // 上：膠囊＋座標
  if (u > 0) {
    const r = capsule(x, 'LOCATION', 0, 0, {
      size: 15 * k,
      bg: o.color || BC.acc,
      fg: BC.ink,
      border: BC.ink,
      bw: 3 * k,
    });
    if (u > 0.15) {
      x.font = `600 ${15 * k}px ${FM}`;
      x.letterSpacing = 3 * k + 'px';
      x.textBaseline = 'middle';
      x.textAlign = 'left';
      x.fillStyle = o.color || BC.acc;
      const n = Math.floor((u - 0.15) * 50);
      x.fillText(coord.slice(0, n), r.w + 12 * k, 1 * k);
    }
  }
  // 中：黑斜卡（從左擦入）
  const nw = measure(x, name, { size, font: FD });
  const cw = nw + 52 * k,
    ch = size * 1.5;
  const cy = 26 * k;
  const e = easeOut((u - 0.08) / 0.25);
  if (e > 0) {
    x.save();
    x.beginPath();
    x.rect(-20 * k, cy - 10 * k, (cw + 40 * k) * e, ch + 20 * k);
    x.clip();
    x.translate(0, cy);
    x.transform(1, 0, -0.14, 1, 0, 0);
    x.fillStyle = BC.white;
    x.fillRect(4 * k, 0, cw + 8 * k, ch);
    x.fillStyle = BC.ink;
    x.fillRect(8 * k, 4 * k, cw, ch - 8 * k);
    x.restore();
    sticker(x, name, 34 * k, cy + ch / 2 + 2 * k, { size, font: FD, edgeW: 0, inkW: 0, shadow: 0 });
  }
  // 下：警戒斜紋＋英文
  const hz = easeOut((u - 0.3) / 0.25);
  if (hz > 0) hazard(x, 4 * k, cy + ch + 8 * k, (cw + 20 * k) * hz, 11 * k, { off: u * 30 * k });
  if (en && u > 0.4) {
    const n = Math.ceil((u - 0.4) * 40);
    sticker(x, en.slice(0, n), 4 * k, cy + ch + 42 * k, {
      size: 21 * k,
      font: FL,
      ls: 7 * k,
      edgeW: 0,
      inkW: 6 * k,
      shadow: 0,
    });
  }
  x.restore();
}

// 抉擇（選前的字卡）：DECISION 的黃色貼紙字＋「抉擇」的黑膠囊＋警戒斜紋
function paintDecision(x, W, H, u, out, o, bx, by) {
  const k = H / 900;
  x.save();
  x.globalAlpha *= 1 - out;
  x.translate(bx, by);
  x.rotate(-0.06);
  const hz = easeOut(u / 0.2);
  hazard(x, -bx - 20 * k, 30 * k, (W * 0.55 + bx) * hz, 16 * k, { off: u * 40 * k, edge: 3 * k });
  const sc = slam(u, 0.08, 0.14, 1.4);
  if (sc) {
    x.save();
    x.scale(sc, sc);
    sticker(x, o.sub || 'DECISION', 0, -30 * k, { size: 92 * k, font: FL, fill: BC.yel });
    x.restore();
  }
  if (u > 0.25)
    capsule(x, o.text, 4 * k, -112 * k, {
      size: 26 * k,
      font: FD,
      weight: 400,
      fg: BC.white,
      bw: 4 * k,
      ls: 6 * k,
    });
  x.restore();
}

// 結語（章末與抉擇之後）：委託方顏色的線 → 標題字的句子 → 斜的橡皮章（英文）
function paintEnd(x, W, H, u, out, o) {
  const k = H / 900;
  const col = o.color || BC.acc;
  x.save();
  x.globalAlpha *= 1 - out;
  const cy = H * 0.46;
  const lw = W * easeOut((u - 0.05) / 0.4);
  x.fillStyle = col;
  x.fillRect(0, cy + 34 * k, lw, 6 * k);
  let size = 72 * k;
  const maxW = W * 0.84;
  const tw = measure(x, o.text, { size, font: FD, ls: 8 * k });
  if (tw > maxW) size *= maxW / tw;
  const sc = slam(u, 0.3, 0.14, 1.25);
  if (sc) {
    x.save();
    x.translate(W / 2, cy - 16 * k);
    x.scale(sc, sc);
    sticker(x, o.text, 0, 0, {
      size,
      font: FD,
      align: 'center',
      ls: 8 * k,
      fill: '#f6efe2',
      edgeW: 0,
      inkW: size * 0.12,
      shadow: 6 * k,
    });
    x.restore();
  }
  if (o.sub && u > 0.75) {
    const ss = slam(u, 0.75, 0.12, 1.6);
    x.save();
    x.translate(W / 2 + 40 * k, cy + 104 * k);
    x.scale(ss, ss);
    stamp(x, o.sub, 0, 0, { size: 30 * k, col, rot: -0.1, seed: seedOf(o.sub) });
    x.restore();
  }
  x.restore();
}

// 章名卡的片假名副標（像 LOGO 的「メック・コルドン」）：英文副標的讀音，依章號
const KANA = {
  1: 'バスティーユ',
  2: 'インダストリアル・コントラクト',
  3: 'ビニース・ジ・アイス',
  4: 'ザ・ラティス',
  5: 'ザ・チョイス・アット・シー',
  6: 'オービット',
  7: 'ザ・フォージ',
  8: 'ジ・アーク',
};
// '#rrggbb' → 'rgba(r,g,b,a)'
const rgba = (hex, a) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return `rgba(255,255,255,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

// 章名卡（開場的最後一鏡；LOGO 的元素全開）：暗色網點的斜塊、齒輪、準星、墨漬、片假名、CH 標籤＋斜紋、
// 章名的貼紙字（章節色）、英文副標、斜貫的封鎖膠帶。u＝出現後的秒數，tn＝章名砸下來的時間（對齊配樂的拍點）
function paintChapter(x, W, H, u, out, o) {
  const k = H / 900;
  const col = o.color || BC.yel;
  const tn = o.tn ?? 0.6;
  x.save();
  x.globalAlpha *= 1 - out;
  // 暗色的斜塊（網點是章節色），從左擦入
  const e = easeOut(u / 0.3);
  if (e > 0) {
    x.save();
    x.beginPath();
    x.rect(0, 0, W * 0.66 * e, H);
    x.clip();
    dotBlock(
      x,
      [
        [0, 0],
        [W * 0.62, 0],
        [W * 0.44, H],
        [0, H],
      ],
      'rgba(10,10,12,0.86)',
      { dot: rgba(col, 0.42), step: 9 * k },
    );
    x.restore();
  }
  // 齒輪、準星
  const gk = easeBack((u - 0.25) / 0.3);
  if (gk > 0) {
    x.save();
    x.globalAlpha *= clamp(gk, 0, 1);
    gear(x, W * 0.895, H * 0.17, 70 * k * gk, u * 0.5, { col: BC.white, lw: 7 * k, teeth: 11 });
    gear(x, W * 0.83, H * 0.29, 38 * k * gk, -u * 0.9, { col: BC.white, lw: 5 * k, teeth: 9 });
    cross(x, W * 0.95, H * 0.62, 18 * k);
    cross(x, W * 0.07, H * 0.12, 18 * k);
    x.restore();
  }
  // 片假名
  const kana = o.kana || KANA[o.ch];
  if (kana && u > 0.35) {
    x.save();
    x.globalAlpha *= clamp((u - 0.35) / 0.25, 0, 1);
    sticker(x, kana, 130 * k, 300 * k, {
      size: 24 * k,
      font: FB,
      ls: 8 * k,
      edgeW: 0,
      inkW: 5 * k,
      shadow: 0,
    });
    x.restore();
  }
  // CH 標籤＋斜紋
  if (u > 0.3) {
    const kk = easeBack((u - 0.3) / 0.2);
    x.save();
    x.translate(130 * k, 362 * k);
    x.scale(kk, kk);
    const label = 'CH.' + String(o.ch || 0).padStart(2, '0');
    const lw = measure(x, label, { size: 46 * k, font: FL }) + 36 * k;
    x.save();
    x.transform(1, 0, -0.21, 1, 0, 0);
    x.fillStyle = BC.white;
    x.fillRect(-4 * k, -34 * k, lw + 8 * k, 68 * k);
    x.fillStyle = BC.ink;
    x.fillRect(0, -30 * k, lw, 60 * k);
    x.restore();
    sticker(x, label, 14 * k, 2 * k, { size: 46 * k, font: FL, fill: BC.yel, edgeW: 0, inkW: 0, shadow: 0 });
    hazard(x, lw + 24 * k, -9 * k, 210 * k * easeOut((u - 0.4) / 0.3), 18 * k, {
      off: u * 30 * k,
      edge: 3 * k,
    });
    x.restore();
  }
  // 墨漬
  splat(x, 250 * k, 790 * k, 28 * k, seedOf(o.name), { k: easeOut((u - tn) / 0.25) * (u > tn ? 1 : 0) });
  // 章名（砸下來）
  let size = 150 * k;
  const maxW = W * 0.6;
  const nw = measure(x, o.name, { size, font: FD, ls: 4 * k });
  if (nw > maxW) size *= maxW / nw;
  const sc = slam(u, tn, 0.15, 1.35);
  if (sc) {
    x.save();
    x.translate(115 * k, 520 * k);
    x.rotate(-0.05);
    x.scale(sc, sc);
    sticker(x, o.name, 0, 0, { size, font: FD, ls: 4 * k, fill: col, halftone: true });
    x.restore();
  }
  // 英文副標
  if (o.en && u > tn + 0.25) {
    const n = Math.ceil((u - tn - 0.25) * 40);
    sticker(x, o.en.slice(0, n), 124 * k, 650 * k, {
      size: 30 * k,
      font: FL,
      ls: 9 * k,
      edgeW: 0,
      inkW: 7 * k,
      shadow: 0,
    });
  }
  // 封鎖膠帶（章名之後掃過）
  const tk = easeOut((u - tn - 0.15) / 0.3);
  if (tk > 0) tape(x, -60 * k, 800 * k, W * 1.3 * tk, -0.09, { h: 46 * k, scroll: u * 40 * k });
  x.restore();
}

// 漫畫的狀聲詞（轟、噹…）：每個字各自歪斜、大小不一、錯開，貼紙描邊＋網點，依序砸下；下面一顆英文擬音的黑膠囊
const ONOM_EN = { 轟: 'KA-BOOM!!', 噹: 'CLANG!!', 鏗: 'KLANG!!', 砰: 'BANG!!', 咚: 'THUD!!' };
function paintOnom(x, e, lt, kout) {
  const u = lt - (e.t0 || 0);
  const [px, py] = e.at || [800, 450];
  const sz = e.size || 200;
  const chars = [...e.s];
  const seed = seedOf(e.s);
  // 填色固定用 LOGO 的黃（劇本的 color 多半是給舊的白字用的米白）；ocol 可以指定
  const fill = e.ocol || BC.yel;
  // 每個字的大小與寬度
  const L = chars.map((ch, i) => {
    const r = (n) => {
      const v = Math.sin((seed + i * 7.31 + n) * 12.9898) * 43758.5453;
      return v - Math.floor(v);
    };
    const s = sz * (0.86 + r(1) * 0.28) * (ch === '—' ? 0.7 : 1);
    return {
      ch,
      s,
      w: measure(x, ch, { size: s, font: FD }) * 0.92,
      rot: (r(2) - 0.5) * 0.4,
      dy: (r(3) - 0.5) * sz * 0.16,
    };
  });
  const total = L.reduce((a, c) => a + c.w, 0);
  const al = e.al || 'center';
  let cx = al === 'left' ? px : al === 'right' ? px - total : px - total / 2;
  x.save();
  x.globalAlpha *= 1 - kout;
  x.translate(0, 0);
  if (e.rot) {
    x.translate(px, py);
    x.rotate(e.rot);
    x.translate(-px, -py);
  }
  L.forEach((c, i) => {
    const sc = slam(u, i * 0.07, 0.14, 1.45);
    if (sc) {
      const shake = Math.max(0, 1 - (u - i * 0.07) / 0.35);
      x.save();
      x.translate(
        cx + c.w / 2 + (Math.random() - 0.5) * 12 * shake,
        py + c.dy + (Math.random() - 0.5) * 12 * shake,
      );
      x.rotate(c.rot);
      x.scale(sc, sc);
      sticker(x, c.ch, 0, 0, {
        size: c.s,
        font: FD,
        align: 'center',
        fill,
        halftone: true,
        inkW: c.s * 0.065,
        edgeW: c.s * 0.15,
      });
      x.restore();
    }
    cx += c.w;
  });
  const en = e.en || ONOM_EN[chars[0]];
  if (en && u > 0.22) {
    const kk = easeBack((u - 0.22) / 0.18);
    x.save();
    x.translate(
      px + (al === 'left' ? total * 0.8 : al === 'right' ? -total * 0.2 : total * 0.3),
      py + sz * 0.46,
    );
    x.rotate(-0.05);
    x.scale(kk, kk);
    capsule(x, en, 0, 0, { size: Math.max(18, sz * 0.13), font: FL, align: 'center', bw: 3 });
    x.restore();
  }
  x.restore();
}

Object.assign(Game.prototype, {
  // 事件的字卡：加進清單，疊加畫布每格畫（cineOverlay 呼叫 cineCardsDraw）
  cineCardPush(ev) {
    const c = this.cine;
    // 以劇本排定的時間起算（跳時間進來時字卡的進度照樣正確）
    const S = c.def.shots[c.shot];
    const t0 = S ? Math.min(c.t, S.at + (ev.t || 0)) : c.t;
    (c.bcards = c.bcards || []).push({ ev, t0, dur: ev.dur || 2.4 });
  },
  cineCardsDraw(x, W, H) {
    const c = this.cine;
    if (!c.bcards || !c.bcards.length) return;
    c.bcards = c.bcards.filter((b) => c.t < b.t0 + b.dur + 0.6);
    const top = c.bar || 0,
      bot = H - (c.bar || 0);
    const k = H / 900;
    for (const b of c.bcards) {
      const u = c.t - b.t0;
      if (u < 0) continue;
      const out = clamp((u - b.dur) / 0.4, 0, 1);
      const ev = b.ev;
      const o = { text: ev.card, sub: ev.s, kind: ev.kind, tag: ev.tag || ev.s, color: ev.color };
      switch (ev.style || 'card') {
        case 'logo':
          paintLogo(x, W, H, u, out, o);
          break;
        case 'name':
          paintName(x, W, H, u, out, { ...o, tag: ev.tag || ev.s }, W * 0.06, bot - 110 * k);
          break;
        case 'loc':
          paintLoc(x, W, H, u, out, o, W * 0.04, top + 44 * k);
          break;
        case 'decision':
          paintDecision(x, W, H, u, out, o, W * 0.07, top + 260 * k);
          break;
        default:
          paintNarr(x, W, H, u, out, o);
      }
    }
  },
  // ---------- 2D 舞台的元素（cine-2d.js 依 e.k 呼叫；座標是 1600×900 的舞台）----------
  // 名牌：{ k: 'rival', name, tag, kind: 'rival'|'boss', color, at: [x, y]（名字基線的左端）, size, t0, t1 }
  cine2d_rival(x, e, lt, v) {
    const [bx, by] = e.at || [80, 760];
    paintName(
      x,
      1600,
      900,
      lt - (e.t0 || 0),
      v.kout,
      { text: e.name, tag: e.tag, kind: e.kind, color: e.color, size: e.size, maxW: e.maxW },
      bx,
      by,
    );
  },
  // 地點卡：{ k: 'loc', name, en, color（LOCATION 膠囊）, at: [x, y]（左上）, t0, t1 }
  cine2d_loc(x, e, lt, v) {
    const [bx, by] = e.at || [60, 70];
    paintLoc(x, 1600, 900, lt - (e.t0 || 0), v.kout, { text: e.name, sub: e.en, color: e.color }, bx, by);
  },
  // 章名卡：{ k: 'chapter', ch, name, en, kana（沒有時依章號）, color, t0, tn（章名砸下來的時間，鏡頭裡的秒數）}
  cine2d_chapter(x, e, lt, v) {
    const t0 = e.t0 || 0;
    paintChapter(x, 1600, 900, lt - t0, v.kout, { ...e, tn: (e.tn ?? t0 + 0.6) - t0 });
  },
  // 狀聲詞（cine2d_text 的 onom：true 轉過來）
  cine2dOnom(x, e, lt, v) {
    paintOnom(x, e, lt, v.kout);
  },
  // 結語：{ k: 'endcard', s, en, color, t0 }
  cine2d_endcard(x, e, lt, v) {
    paintEnd(x, 1600, 900, lt - (e.t0 || 0), v.kout, { text: e.s, sub: e.en, color: e.color });
  },
});
