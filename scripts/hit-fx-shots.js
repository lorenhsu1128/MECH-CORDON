// 命中點與命中特效的確認截圖（docs/hit-react-design.md 的「所有敵人的命中表面」）：
// 每個目標生成一台、搬到空中（沒有東西擋住鏡頭），從四周打一圈射線：
//   <名稱>-box.png   外框的線框（綠）＋每條射線在外框上的命中點（黃點與法線）、原本判定球上的命中點（藍點）
//   <名稱>-fx.png    在那些命中點噴火花與碎片之後 0.05 秒的畫面
// 並統計：射線打中判定球／外框的數量、兩個命中點平均差多少。
//   node scripts/hit-fx-shots.js [mt,tank,boss:5,beast:beast_lion,…] [--t=0.05]   要先 npm run build
//   輸出 test-results/hit-fx/
/* global window, document, localStorage, THREE -- page.evaluate 的回呼在瀏覽器端執行 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');

const args = process.argv.slice(2);
const T = +((args.find((a) => a.startsWith('--t=')) || '').slice(4) || 0.05);
const ONE = args.includes('--one'); // 只打一發（最靠近鏡頭的命中點），鏡頭拉近，拍 0.04／0.12／0.3 秒三張
const DEF =
  'mt,tank,heli,drone,crane,eel,blob,junk,forklift,boss:5,boss:6,boss:14,boss:20,boss:23,boss:24,boss:25,beast:beast_lion,beast:beast_mantis,beast:beast_raptor,beast:beast_scorpion';
const list = (args.find((a) => !a.startsWith('--')) || DEF).split(',').filter(Boolean);
const OUT = path.join(__dirname, '..', 'test-results', 'hit-fx');
fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const exe = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({
    executablePath: exe,
    headless: true,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
  });
  const url =
    'file:///' +
    path.resolve(__dirname, '..', 'dist', 'mech-cordon.html').split(path.sep).join('/') +
    '?test';
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(() => {
      window.Element.prototype.requestPointerLock = () => {}; // 不鎖住使用者的滑鼠
      localStorage.setItem('mech_cordon_map', 'industrial');
      localStorage.setItem('mech_cordon_variant', 'base');
    });
    page.on('pageerror', (e) => console.log('頁面錯誤', e.message));
    await page.goto(url);
    await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, {
      timeout: 60000,
    });
    await page.evaluate(() => {
      const g = window.__game;
      g.save.level = 1;
      g.startMission();
    });
    await page.waitForFunction(() => window.__game.state === 'play' && window.__game.player, null, {
      timeout: 60000,
    });
    await page.waitForTimeout(800);
    // 停住主迴圈：之後每一張都自己算繪
    await page.evaluate(() => {
      window.requestAnimationFrame = () => 0;
      const g = window.__game;
      const el = document.getElementById('ui');
      if (el) el.style.display = 'none';
      g.hudOff = true;
    });
    for (const item of list) {
      const [a, b] = item.includes(':') ? item.split(':') : ['type', item];
      const r = await page.evaluate(
        ([cls, key]) => {
          const g = window.__game,
            S = window.__SPAWN,
            H = window.__HITP;
          if (window.__dbg) g.scene.remove(window.__dbg);
          g.waves = [];
          g.wavePend = null;
          for (const e of [...g.enemies]) if (e.depart) e.depart();
          g.enemies.length = 0;
          g.bosses = [];
          g.fx.clear && g.fx.clear();
          g.introSeen = new Set(Object.keys(S.ENEMY_TYPES).concat(Object.keys(window.__FOES.FOES)));
          if (cls === 'boss') g.spawnBossDef(S.BOSS_DEFS[+key], 1, 1, 0);
          else if (cls === 'beast') g.beastSpawn(key, 1, 0);
          else g.spawnType(key, 1, 1, undefined, 1);
          const e = g.enemies.find((x) => x.ai !== 'part') || g.enemies[0];
          if (!e) return { err: '沒有生成' };
          for (const x of g.enemies) if (x !== e && x.model) x.model.group.visible = false;
          // 搬到空中
          e.pos.set(0, 400, 0);
          e.yaw = 0;
          const m = e.model;
          m.group.position.copy(e.pos);
          m.group.rotation.set(0, 0, 0);
          m.group.visible = true;
          m.group.updateMatrixWorld(true);
          window.__tg = e;
          const c = e.center(),
            R = e.radius,
            hb = m.hb || [];
          // 模型的範圍（外框的世界座標）
          const bb = new THREE.Box3(),
            v = new THREE.Vector3();
          for (const h of hb)
            for (let i = 0; i < 8; i++)
              bb.expandByPoint(
                v
                  .set(i & 1 ? h.max.x : h.min.x, i & 2 ? h.max.y : h.min.y, i & 4 ? h.max.z : h.min.z)
                  .applyMatrix4(h.node.matrixWorld),
              );
          if (bb.isEmpty()) bb.setFromCenterAndSize(c, new THREE.Vector3(R * 2, R * 2, R * 2));
          const bc = bb.getCenter(new THREE.Vector3()),
            ext = bb.getSize(new THREE.Vector3()).length() * 0.5;
          const dbg = (window.__dbg = new THREE.Group());
          g.scene.add(dbg);
          // 外框的線框
          const lm = new THREE.LineBasicMaterial({
            color: 0x30ff60,
            depthTest: false,
            transparent: true,
            opacity: 0.5,
          });
          for (const h of hb) {
            const box = new THREE.Box3(h.min.clone(), h.max.clone());
            const bh = new THREE.Box3Helper(box, 0x30ff60);
            bh.material = lm;
            bh.applyMatrix4(h.node.matrixWorld);
            bh.matrixAutoUpdate = false;
            bh.matrix
              .copy(h.node.matrixWorld)
              .multiply(
                new THREE.Matrix4().compose(
                  box.getCenter(new THREE.Vector3()),
                  new THREE.Quaternion(),
                  box.getSize(new THREE.Vector3()).multiplyScalar(0.5),
                ),
              );
            bh.matrixWorld.copy(bh.matrix);
            bh.matrixWorldAutoUpdate = false;
            dbg.add(bh);
          }
          // 射線：鏡頭這一側的半圈，3 個高度，對準模型範圍裡的點
          const dot = (p, col, s) => {
            const o = new THREE.Mesh(
              new THREE.SphereGeometry(s, 8, 6),
              new THREE.MeshBasicMaterial({ color: col, depthTest: false }),
            );
            o.position.copy(p);
            o.renderOrder = 99;
            dbg.add(o);
          };
          const hits = [];
          let nS = 0,
            nB = 0,
            dSum = 0,
            seed = 7;
          const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
          const ms = ext * 0.012 + 0.05;
          for (let i = 0; i < 40; i++) {
            const ang = -0.2 + (i % 10) * 0.18 + rnd() * 0.05,
              el = 0.15 + Math.floor(i / 10) * 0.22;
            const d = new THREE.Vector3(
              Math.sin(ang) * Math.cos(el),
              Math.sin(el),
              Math.cos(ang) * Math.cos(el),
            );
            const tgt = bc
              .clone()
              .add(new THREE.Vector3(rnd() * 0.45, rnd() * 0.45, rnd() * 0.45).multiply(bb.getSize(v)));
            const o = tgt.clone().addScaledVector(d, ext * 3);
            const seg = tgt.clone().sub(o).multiplyScalar(1.6);
            // 判定球
            const oc = o.clone().sub(c),
              sd = seg.clone().normalize();
            const bq = oc.dot(sd),
              cq = oc.lengthSq() - R * R,
              disc = bq * bq - cq;
            const sp = disc >= 0 ? o.clone().addScaledVector(sd, -bq - Math.sqrt(disc)) : null;
            if (sp) nS++;
            const h = H.hitRay(m, o, seg, 0);
            if (h) {
              nB++;
              const p = o.clone().addScaledVector(seg, h.t);
              hits.push({ p, n: h.n.clone(), d: sd.clone() });
              dot(p, 0xffe030, ms);
              const ln = new THREE.Line(
                new THREE.BufferGeometry().setFromPoints([p, p.clone().addScaledVector(h.n, ms * 6)]),
                new THREE.LineBasicMaterial({ color: 0xffe030, depthTest: false }),
              );
              ln.renderOrder = 99;
              dbg.add(ln);
              if (sp) dSum += sp.distanceTo(p);
            }
            if (sp) dot(sp, 0x3090ff, ms * 0.7);
          }
          window.__hits = hits;
          // 鏡頭：斜前上方
          const cam = g.camera;
          cam.position
            .copy(bc)
            .add(new THREE.Vector3(0.75, 0.45, 1).normalize().multiplyScalar(ext * 2.3 + 4));
          cam.lookAt(bc);
          cam.updateMatrixWorld();
          g.renderMain();
          return {
            name: e.name || e.etype,
            gen: !!m.hbGen,
            boxes: hb.length,
            R: +R.toFixed(2),
            ext: +ext.toFixed(1),
            sphere: nS,
            box: nB,
            diff: nB ? +(dSum / Math.max(1, Math.min(nS, nB))).toFixed(2) : -1,
          };
        },
        [a, b],
      );
      const fn = item.replace(/[:]/g, '-');
      if (r.err) {
        console.log(item, r.err);
        continue;
      }
      await page.screenshot({ path: path.join(OUT, fn + '-box.png') });
      if (ONE) {
        // 單發：最靠近鏡頭的命中點，鏡頭拉近到那一點
        await page.evaluate(() => {
          const g = window.__game,
            cam = g.camera;
          window.__dbg.visible = false;
          const L = window.__hits;
          let b = L[0];
          for (const h of L) if (h.p.distanceTo(cam.position) < b.p.distanceTo(cam.position)) b = h;
          window.__one = b;
          const dir = cam.position.clone().sub(b.p).normalize();
          cam.position.copy(b.p).addScaledVector(dir, 16);
          cam.lookAt(b.p);
          cam.updateMatrixWorld();
          g.fx.spark(b.p, 0xffe0a0, b.n.clone().negate());
          g.fx.mechChips(b.p, b.n);
          window.__fxN = g.fx.busyN ? g.fx.busyN() : -1;
        });
        let t0 = 0;
        for (const t of [0.04, 0.12, 0.3]) {
          await page.evaluate((dt) => {
            const g = window.__game;
            const n = Math.max(1, Math.round(dt / 0.0167));
            for (let i = 0; i < n; i++) g.fx.update(dt / n);
            g.renderMain();
          }, t - t0);
          t0 = t;
          await page.screenshot({ path: path.join(OUT, `${fn}-one-${t}.png`) });
        }
      } else {
        // 命中特效：每 3 個命中點噴一次，過 T 秒
        await page.evaluate((T) => {
          const g = window.__game;
          window.__dbg.visible = false;
          const L = window.__hits;
          for (let i = 0; i < L.length; i += 3) {
            g.fx.spark(L[i].p, 0xffe0a0, L[i].n.clone().negate());
            g.fx.mechChips(L[i].p, L[i].n);
          }
          const n = Math.max(1, Math.round(T / 0.0167));
          for (let i = 0; i < n; i++) g.fx.update(T / n);
          g.renderMain();
        }, T);
        await page.screenshot({ path: path.join(OUT, fn + '-fx.png') });
      }
      console.log(
        `${item}　${r.name}　外框 ${r.boxes}${r.gen ? '' : '（區塊）'}　判定球半徑 ${r.R}　模型半徑 ${r.ext}　40 條射線：打中球 ${r.sphere}、打中外框 ${r.box}　球面與表面的命中點平均差 ${r.diff} m`,
      );
    }
    // 效能：命中特效（火花＋碎片）每次的 CPU 耗時（連續 600 次，含 0.1 秒內減量的規則）
    const cost = await page.evaluate(() => {
      const g = window.__game,
        b = window.__one || (window.__hits && window.__hits[0]);
      if (!b) return null;
      const nd = b.n.clone().negate();
      const t = window.performance.now();
      for (let i = 0; i < 600; i++) {
        g.fx.spark(b.p, 0xffe0a0, nd);
        g.fx.mechChips(b.p, b.n);
        if (i % 6 === 5) g.fx.update(0.11); // 每 6 次過 0.11 秒（不觸發減量）
      }
      return (window.performance.now() - t) / 600;
    });
    if (cost != null)
      console.log(`命中特效每次的 CPU 耗時：${(cost * 1000).toFixed(0)} 微秒（火花＋碎片，含推進特效時鐘）`);
    await page.close();
  } finally {
    await browser.close();
  }
})();
