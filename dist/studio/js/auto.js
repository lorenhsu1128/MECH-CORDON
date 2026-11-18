// 自動完成（docs/portrait-studio-design.md 第 4 期）：使用者選好全身主圖之後，一路做到發佈。網頁與命令列共用。
//   1. 標框：動漫的臉與眼睛偵測（ComfyUI 節點 MCFaceBoxes）＋ Qwen 把嘴唇塗綠找嘴（MCGreenBox）
//   2. 表情：每個 3 張，用量測挑（臉框外沒改、沒有外來的顏色、有改到但不是整張臉換掉）
//   3. 每個表情自己的嘴框（大嘴放得下）
//   4. 眨眼與嘴型：每格 3 張，用量測挑；全部不合格時加強指示再一輪（共 6 張），還是不行就略過（不無限重試）
//   5. 整個姿勢量測一次（左右眼的比較要看同一個姿勢的中位數）
//   6. 發佈
// 已經做好的會沿用（表情有選定的、影格有 v2 的），所以中途停掉再跑會接著做。
// 純量測挑不出「表情跑掉」「淡淡的殘線」，所以每一格都記下 slot.auto，品管分頁可以再看。
import * as W from './workflows.js';
import * as Q from './qa.js';
import { exprList, EYE_FRAMES, MOUTH_FRAMES } from './expr.js';
import { poseOf, widenMouth, noBlink } from './pipeline.js';

const FR = [...EYE_FRAMES, ...MOUTH_FRAMES].map((f) => f.id);
// 第二輪的加強指示
const RETRY_EXTRA = {
  e1: 'IMPORTANT: both upper eyelids must come down to cover the top half of both irises.',
  e2: 'IMPORTANT: BOTH eyes must be completely closed, drawn as thin curved lash lines with no iris or eye white visible.',
  m1: 'IMPORTANT: the lips must be slightly parted, a small but clearly visible opening.',
  m2: 'IMPORTANT: the mouth must be clearly wide open.',
  m3: 'IMPORTANT: the mouth must be open in a round O shape.',
};

const clampBox = (b, IW, IH) => {
  const x = Math.max(0, Math.round(b[0]));
  const y = Math.max(0, Math.round(b[1]));
  return [x, y, Math.min(IW, Math.round(b[0] + b[2])) - x, Math.min(IH, Math.round(b[1] + b[3])) - y];
};

// 1. 自動標框：回傳 { face, eyes, mouth, info }（整張圖的 x, y, w, h）
export async function detectBoxes(pipe, card, pid, { onProgress } = {}) {
  const pose = poseOf(card, pid);
  if (!pose.master) throw new Error('先選定主圖');
  const up = await pipe.uploadWork(card, pose.master);
  const { w: IW, h: IH } = await pipe.imageSize(card, pose.master);
  const fb = (await pipe.comfy.runText(W.faceBoxes({ image: up }), { onProgress })).fb;
  if (!fb || !fb.face) throw new Error('找不到臉（偵測不到），請在「標框」分頁手動畫框');
  const [fx, fy, fw, fh] = fb.face;
  const [dx, dy, dw, dh] = fb.faceDet;
  // 嘴：臉的裁切（往外 12%）給 Qwen 塗綠
  const pad = 0.12;
  const crop = clampBox([fx - fw * pad, fy - fh * pad, fw * (1 + 2 * pad), fh * (1 + 2 * pad)], IW, IH);
  let g = null;
  try {
    g = (await pipe.comfy.runText(W.mouthGreen({ image: up, crop }), { onProgress })).gb;
  } catch (e) {
    g = null;
  }
  const eyeBot = fb.eyes[1] + fb.eyes[3] * 0.6;
  let mouth;
  let how = 'green';
  if (g && g.mouth) {
    const [mx, my, mw, mh] = g.mouth;
    const cx = mx + mw / 2;
    const cy = my + mh / 2;
    // 綠色要在臉裡、眼睛以下，而且不能大得離譜（Qwen 把整個下巴塗綠）
    if (cx > fx && cx < fx + fw && cy > eyeBot && cy < fy + fh * 1.05 && mw < fw * 0.7) {
      const w = Math.max(mw * 1.5, fw * 0.22);
      const h = Math.max(mh * 1.8, fh * 0.12);
      mouth = [cx - w / 2, cy - h / 2, w, h];
    }
  }
  if (!mouth) {
    // 沒找到：照 133 個姿勢手標的嘴框的中位數（偵測框的 x 36%～64%、y 65%～81%）
    how = 'ratio';
    mouth = [dx + dw * 0.36, dy + dh * 0.65, dw * 0.28, dh * 0.16];
  }
  return {
    face: clampBox(fb.face, IW, IH),
    eyes: clampBox(fb.eyes, IW, IH),
    mouth: clampBox(mouth, IW, IH),
    info: { score: fb.score, eyeN: fb.eyeN, mouth: how, t: Date.now() },
  };
}

// 量測一張候選和它的底圖（表情：臉框；影格：眼睛框或嘴框）
async function measure(load, baseFile, file, inner, fid, B) {
  const base = await load(baseFile);
  const cand = await load(file);
  return Q.frameMetrics(base, cand, inner, fid, { face: B.face, mbox: B.mouth0 || B.mouth });
}

// 表情的挑法：臉框外沒改（out）、沒有外來的顏色、有改到；改得最少的那幾張裡挑中間（太多＝整張臉換了一個人）
function pickExpr(rs) {
  const ok = rs.filter((r) => r.m.out < 0.002 && r.m.alien < 0.03 && r.m.chg > 0.02);
  const list = (ok.length ? ok : rs).slice().sort((a, b) => a.m.alien - b.m.alien || a.m.chg - b.m.chg);
  if (!ok.length) return { r: list[0], weak: true };
  const s = list.slice().sort((a, b) => a.m.chg - b.m.chg);
  return { r: s[(s.length - 1) >> 1], weak: false };
}
// 影格的挑法：不合格的不要；e1＝虹膜剩約四成、e2＝虹膜剩最少、m1＝改最少、m2＝改最多、m3＝中間
function pickFrame(fid, rs) {
  const ok = rs.filter((r) => !Q.qaJudge(fid, r.m).length);
  if (!ok.length) return null;
  const by = (f) => ok.slice().sort((a, b) => f(a) - f(b))[0];
  if (fid === 'e1') return by((r) => Math.abs((r.m.iris ?? 0.4) - 0.4) - r.m.chg * 0.01);
  if (fid === 'e2') return by((r) => (r.m.iris ?? 0) - r.m.chg * 0.1);
  const s = ok.slice().sort((a, b) => a.m.chg - b.m.chg);
  if (fid === 'm1') return s[0];
  if (fid === 'm2') return s[s.length - 1];
  return s[(s.length - 1) >> 1];
}

// 整個角色（或指定的姿勢）跑到完成
// o：{ pids, n＝每格的候選數, publish, load(檔名)→圖, save(), log(文字), progress(0～1, 文字), ctl: { stop } }
export async function autoRun(pipe, card, o = {}) {
  const n = o.n || 3;
  const log = o.log || (() => {});
  const save = o.save || (async () => {});
  const ctl = o.ctl || {};
  const stopped = () => {
    if (ctl.stop) throw new Error('已停止');
  };
  const pids = o.pids || card.poses.filter((p) => p.master).map((p) => p.id);
  if (!pids.length) throw new Error('先選定主圖');
  const report = { skipped: [], weak: [], boxes: {} };
  // 進度：每個姿勢 1（標框）＋表情數＋影格數
  const exprs = exprList(card);
  const per = 1 + (exprs.length - 1) + exprs.length * FR.length;
  let done = 0;
  const step = (txt) => {
    done++;
    if (o.progress) o.progress(Math.min(1, done / (per * pids.length)), txt);
  };
  for (const pid of pids) {
    const P = poseOf(card, pid);
    const nb = noBlink(P);
    // 1. 標框
    stopped();
    if (!P.boxes.face || !P.boxes.eyes || !P.boxes.mouth) {
      log(`${P.name}：自動標框`);
      const b = await detectBoxes(pipe, card, pid);
      P.boxes = { face: b.face, eyes: b.eyes, mouth: b.mouth };
      P.autoBox = b.info;
      delete P.fv;
      await save();
      log(
        `  臉 ${b.face.join(',')}、眼睛 ${b.eyes.join(',')}（找到 ${b.info.eyeN} 隻）、嘴 ${b.mouth.join(',')}（${b.info.mouth === 'green' ? '塗綠找到' : '照比例'}）`,
      );
    }
    report.boxes[pid] = P.boxes;
    step('標框');
    // 2. 表情
    for (const e of exprs) {
      if (e.id === 'neutral') continue;
      stopped();
      const sl = P.ex[e.id];
      if (sl && sl.pick) {
        step(e.name);
        continue;
      }
      log(`${P.name}：表情「${e.name}」產生 ${n} 張`);
      const names = await pipe.variant(card, pid, e.id, { n });
      await save();
      const rs = [];
      for (const f of names)
        rs.push({ f, m: await measure(o.load, P.master, f, P.boxes.face, 'x', P.boxes) });
      const { r, weak } = pickExpr(rs);
      P.ex[e.id].pick = r.f;
      P.ex[e.id].auto = { weak, chg: +r.m.chg.toFixed(3), alien: +r.m.alien.toFixed(3) };
      if (weak) report.weak.push(`${pid}:${e.id}`);
      await save();
      step(e.name);
    }
    // 3. 嘴框放大（影格用）與每個表情自己的嘴框
    if (P.fv !== 2) {
      P.boxes.mouth0 = P.boxes.mouth;
      P.boxes.mouth = widenMouth(P.boxes);
      P.fv = 2;
    }
    const master = await o.load(P.master);
    for (const e of exprs) {
      if (e.id === 'neutral' || !P.ex[e.id]?.pick || P.ex[e.id].mbDone) continue;
      const mb = Q.exprMouthBox(master, await o.load(P.ex[e.id].pick), P.boxes);
      if (mb) P.ex[e.id].mb = mb;
      else delete P.ex[e.id].mb;
      P.ex[e.id].mbDone = true;
    }
    await save();
    // 4. 影格
    for (const e of exprs) {
      const bf = e.id === 'neutral' ? P.master : P.ex[e.id]?.pick;
      if (!bf) continue;
      for (const fid of FR) {
        stopped();
        const key = `${e.id}.${fid}`;
        const sl = P.ex[key];
        if ((fid[0] === 'e' && nb.includes(e.id)) || (sl && (sl.v2 || sl.skip) && (sl.pick || sl.skip))) {
          step(key);
          continue;
        }
        const inner = fid[0] === 'e' ? P.boxes.eyes : P.ex[e.id]?.mb || P.boxes.mouth;
        const rs = [];
        let best = null;
        for (let round = 0; round < 2 && !best; round++) {
          stopped();
          log(`${P.name}：${e.name}・${fid}${round ? '（第二輪，加強指示）' : ''}產生 ${n} 張`);
          const names = await pipe.variant(card, pid, key, { n, extra: round ? RETRY_EXTRA[fid] : '' });
          await save();
          for (const f of names) rs.push({ f, m: await measure(o.load, bf, f, inner, fid, P.boxes) });
          best = pickFrame(fid, rs);
        }
        const s = P.ex[key];
        s.v2 = true;
        if (best) {
          s.pick = best.f;
          delete s.skip;
          s.auto = { n: rs.length };
        } else {
          // 兩輪都不合格：略過（不發佈，播放器在這個表情就不眨眼或不動嘴）
          s.skip = true;
          s.auto = { n: rs.length, why: [...new Set(rs.flatMap((r) => Q.qaJudge(fid, r.m)))] };
          report.skipped.push(`${pid}:${key}（${s.auto.why.map((w) => Q.QA_REASONS[w] || w).join('、')}）`);
          log(`  ${key}：${rs.length} 張都不合格，略過`);
        }
        await save();
        step(key);
      }
    }
    // 5. 整個姿勢量測（只閉一隻眼要和同一個姿勢的中位數比）
    const rep = await Q.qaPose(P, o.load, { exprIds: exprs.map((e) => e.id), frames: FR, noBlink: nb });
    for (const [k, v] of Object.entries(rep)) P.ex[k].qm = { ...v, t: Date.now() };
    await save();
  }
  // 6. 發佈
  if (o.publish !== false) {
    stopped();
    log('發佈（去背、裁切成 WebP）');
    await pipe.publish(card, { keepBase: !!card.pub });
    await save();
  }
  if (card.status === 'draft') card.status = 'done';
  await save();
  return report;
}
