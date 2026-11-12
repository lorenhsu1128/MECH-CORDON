// 介面改版（docs/zzz-ui-design.md）的截圖：每個畫面 × 三種畫面大小（電腦 1920×1080、平板 1180×820 觸控、手機橫式 844×390 觸控）
// 用法：node scripts/ui-shots.js [畫面,…] [--size=pc,tab,phone] [--tag=名稱]
// 輸出 test-results/ui/<tag>/<畫面>-<大小>.png（tag 預設 now）；直接開 dist/mech-cordon.html（file://、?test）
/* global window, document, getComputedStyle, innerWidth */
const fs = require('fs');
const path = require('path');
const { launch } = require('./perf-lib.js');

const HTML = path.join(__dirname, '..', 'dist', 'mech-cordon.html');
const SIZES = {
  pc: { viewport: { width: 1920, height: 1080 } },
  tab: { viewport: { width: 1180, height: 820 }, hasTouch: true },
  phone: { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (id) => async (page) => {
  await page.evaluate((id) => window.__game.showScreen(id), id);
};

// 每個畫面：怎麼打開（page 已在標題畫面）
const SHOTS = {
  title: async () => {},
  settings: async (page) => {
    await page.click('#btnSettings');
  },
  'settings-cam': async (page) => {
    await page.click('#btnSettings');
    await page.click('#setTabs button[data-st="cam"]');
  },
  'settings-gfx': async (page) => {
    await page.click('#btnSettings');
    await page.click('#setTabs button[data-st="gfx"]');
  },
  modal: async (page) => {
    await page.evaluate(() =>
      window.__game.uiConfirm(
        '確定要放棄這次出擊？紀錄點會刪除，戰術模組退回。',
        () => {},
        '放棄出擊',
        '取消',
      ),
    );
  },
  pause: show('pause'),
  saves: async (page) => {
    await page.click('#btnSaves');
  },
  legacy: show('legacy'),
  mp: show('mp'),
  levels: show('levels'),
  cineLib: show('cineLib'),
  garage: async (page) => {
    await page.evaluate(() => {
      const g = window.__game;
      g.ctrl.hangarFx = 'off';
      g.save.coam = 500000;
      g.openGarage();
    });
    await wait(2500);
  },
  'garage-legs': async (page) => {
    await SHOTS.garage(page);
    await page.click('#slots .slot[data-slot="legs"]');
    await page.hover('#partList .part[data-pid="l_hv"]').catch(() => {});
    await wait(500);
  },
  'garage-spec': async (page) => {
    await SHOTS.garage(page);
    await page.evaluate(() => document.querySelector('#gTabs [data-tab="spec"]')?.click());
  },
  'garage-set': async (page) => {
    await SHOTS.garage(page);
    await page.evaluate(() => document.querySelector('#gTabs [data-tab="set"]')?.click());
  },
  // 主線的轉場整備（機甲庫＋整備面板＋零件格子）
  'garage-camp': async (page) => {
    await page.evaluate(() => {
      const g = window.__game;
      g.ctrl.hangarFx = 'off';
      g.save.coam = 500000;
      g.campBegin('c1s1');
      g.campGarage();
    });
    await wait(2500);
    await page.click('#slots .slot[data-slot="gen"]').catch(() => {});
    await wait(500);
  },
  hub: async (page) => {
    await page.evaluate(() => {
      const g = window.__game;
      const st = g.campStory();
      st.done = { c1s1: 1, c1s2: 1, c2s1: 1 };
      g.openHub();
    });
    await page
      .waitForFunction(() => window.__game.hubQ && window.__game.hubQ.length === 0, null, { timeout: 30000 })
      .catch(() => {});
    await wait(1500);
  },
  brief: async (page) => {
    await SHOTS.hub(page);
    await page.evaluate(() => window.__game.openBrief('c2s2'));
    await wait(1200);
  },
  result: async (page) => {
    await page.evaluate(() => {
      const g = window.__game;
      document.getElementById('rTitle').textContent = '任務完成';
      document.getElementById('rRank').textContent = 'S';
      document.getElementById('resultGrid').innerHTML =
        '<div class="stat"><span>擊破</span><span>24</span></div><div class="stat"><span>經過時間</span><span>06:42</span></div><div class="stat"><span>獲得 SP</span><span>+18,400</span></div>';
      g.showScreen('result');
    });
    await wait(1500);
  },
  campFail: show('campFail'),
  campTrans: show('campTrans'),
  // 任務中的 HUD（視角：top／chase／fp；boss＝Boss 關）
  banner: async (page) => {
    await page.evaluate(() => {
      const g = window.__game;
      g.save.level = 1;
      g.startMission();
    });
    await wait(1700);
  },
  finish: async (page) => {
    await hudShot(page, 'top');
    // 截圖在 0.7 秒後（定格約 1.1 秒）
    await page.evaluate(() => window.__game.zFinish());
  },
  'hud-top': async (page) => hudShot(page, 'top'),
  'hud-chase': async (page) => hudShot(page, 'chase'),
  'hud-fp': async (page) => hudShot(page, 'fp'),
  'hud-boss': async (page) => hudShot(page, 'top', 3),
  comm: async (page) => {
    await hudShot(page, 'top');
    await page.evaluate(() =>
      window.__game.commSay('veerwell', '目標在水壩的閘門下面。今晚之前把它拿下來，報酬加倍。', '派克'),
    );
    await wait(1800);
  },
  story: async (page) => {
    await page.evaluate(() => {
      const g = window.__game;
      g.storyText('i1_2', g.storyItem('i1_2'));
    });
    await wait(2500);
  },
  pilot: async (page) => {
    await page.evaluate(() => window.__game.openPilot());
    await wait(800);
  },
};

async function hudShot(page, view, level = 1) {
  await page.evaluate(
    ([view, level]) => {
      const g = window.__game;
      g.save.level = level;
      g.startMission();
      g.player.hp = g.player.maxHp * 0.72;
      g.setView(view, true);
    },
    [view, level],
  );
  await wait(5000);
  // 開場的過關條件卡片收起來之後
  await page.evaluate(() => {
    const g = window.__game;
    if (g.player.lock == null && g.enemies[0]) g.player.lock = g.enemies[0];
  });
  await wait(1500);
}
(async () => {
  const args = process.argv.slice(2);
  const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const names = (args.find((a) => !a.startsWith('--')) || Object.keys(SHOTS).join(',')).split(',');
  const sizes = (opt.size || 'pc,tab,phone').split(',');
  const dir = path.join(__dirname, '..', 'test-results', 'ui', opt.tag || 'now');
  fs.mkdirSync(dir, { recursive: true });
  const browser = await launch();
  try {
    for (const sz of sizes) {
      // 自訂大小：寬x高（觸控、2 倍像素），例如 1000x626
      const m = /^(\d+)x(\d+)$/.exec(sz);
      const conf = m
        ? { viewport: { width: +m[1], height: +m[2] }, hasTouch: true, deviceScaleFactor: 2 }
        : SIZES[sz];
      const ctx = await browser.newContext(conf);
      for (const name of names) {
        const fn = SHOTS[name];
        if (!fn) {
          console.log('沒有這個畫面：' + name);
          continue;
        }
        const page = await ctx.newPage();
        const errs = [];
        page.on('pageerror', (e) =>
          errs.push(e.message + ' @ ' + (e.stack || '').split(String.fromCharCode(10)).slice(1, 3).join(' ')),
        );
        await page.goto('file:///' + HTML.replace(/\\/g, '/') + '?test');
        await page.waitForFunction(() => document.getElementById('title')?.classList.contains('on'), null, {
          timeout: 20000,
        });
        await wait(600);
        try {
          await fn(page);
          await wait(700);
          await page.screenshot({ path: path.join(dir, `${name}-${sz}.png`) });
          // 有沒有被切掉：畫面上的捲動容器以外，文件本身不該捲動
          const ov = await page.evaluate(() => {
            const out = [];
            for (const s of document.querySelectorAll('#ui .screen.on, #uiModal')) {
              if (getComputedStyle(s).display === 'none') continue;
              for (const el of s.querySelectorAll('button, select, input, .krow')) {
                const r = el.getBoundingClientRect();
                if (!r.width || getComputedStyle(el).visibility === 'hidden') continue;
                if (r.right > innerWidth + 1 || r.left < -1)
                  out.push((el.id || el.textContent.trim().slice(0, 10)) + ' 超出左右');
              }
            }
            return out.slice(0, 6);
          });
          console.log(
            `${name}-${sz}${ov.length ? '  ⚠ ' + ov.join('、') : ''}${errs.length ? '  錯誤：' + errs[0] : ''}`,
          );
        } catch (e) {
          console.log(`${name}-${sz} 失敗：${e.message.split('\n')[0]}`);
        }
        await page.close();
      }
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  console.log('截圖：' + dir);
})();
