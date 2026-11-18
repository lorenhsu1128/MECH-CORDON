// 介面改版（docs/zzz-ui-design.md）的截圖：每個畫面 × 三種畫面大小（電腦 1920×1080、平板 1180×820 觸控、手機橫式 844×390 觸控）
// 用法：node scripts/ui-shots.js [畫面,…] [--size=pc,tab,phone] [--tag=名稱]
// 輸出 test-results/ui/<tag>/<畫面>-<大小>.png（tag 預設 now）；直接開 dist/mech-cordon.html（file://、?test）
/* global window, document, getComputedStyle, innerWidth, THREE, Element */
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

// 背包放幾件固定的裝備（各品級、極品）再開機甲庫
async function gearSeed(page) {
  await page.evaluate(() => {
    const g = window.__game;
    const G = window.__gear;
    const S = g.save;
    g.ctrl.hangarFx = 'off';
    S.coam = 500000;
    S.mats = { alloy: 50, circuit: 50, core: 20, shard: 5 };
    let sd = 7;
    const rng = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const rid = S.asm.rarm;
    S.inv = [];
    S.eq = {};
    for (const [id, q] of [
      [rid, 1],
      [rid, 2],
      [rid, 3],
      [rid, 4],
      [S.asm.core, 2],
      [S.asm.core, 3],
    ])
      S.inv.push(G.rollGear(id, q, rng));
    g.openGarage();
  });
  await wait(2500);
}

// 每個畫面：怎麼打開（page 已在標題畫面）
const SHOTS = {
  title: async () => {},
  // 標題的「工具與其他」面板（docs/nav-design.md）
  'title-tools': async (page) => {
    await page.click('#btnTitleTools');
  },
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
  // 介面與演出（最下面是「血跡」「地圖上的載具」：捲到底）
  'settings-ui': async (page) => {
    await page.click('#btnSettings');
    await page.click('#setTabs button[data-st="ui"]');
    await page.evaluate(() => {
      const el = document.getElementById('ctrlMapVeh');
      if (el) el.scrollIntoView({ block: 'center' });
    });
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
  // 零件品級（docs/gear-rarity-design.md 第 11 節）：背包頁、小卡片的裝備清單、重骰視窗
  'garage-inv': async (page) => {
    await gearSeed(page);
    await page.evaluate(() => window.__game.garageTab('inv'));
  },
  'garage-gear': async (page) => {
    await gearSeed(page);
    await page.evaluate(() => {
      const g = window.__game;
      g.garageTab('eq');
      g.garageSlot = 'rarm';
      g.gFlyOpen = true;
      g.renderGarage();
    });
  },
  'garage-forge': async (page) => {
    await gearSeed(page);
    await page.evaluate(() => {
      const g = window.__game;
      const it = g.save.inv.find((x) => x.q === 3);
      g.garageTab('inv');
      g.forgeRerollOpen(it.u);
      document.querySelector('#forgeBox .fgLine').click();
    });
  },
  // 結果畫面的戰果（loot.js 的 spoilsHtml）：擊破與破壞的各項、取得的裝備與素材
  'result-spoils': async (page) => {
    await page.evaluate(() => {
      const g = window.__game;
      const G = window.__gear;
      let sd = 11;
      const rng = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      const S = g.save;
      g.hkReset();
      g.hkOn = true;
      g.hk = { civ: 3, foe: 7 };
      g.mvKills = 2;
      g.tl = { k: { boss: 1, ac: 2, mt: 23, air: 4, part: 3 }, d: { prop: 41, col: 2 } };
      g.lootReset();
      const L = g.lootRun;
      L.mats = { alloy: 6, circuit: 3, core: 1, shard: 1 };
      L.parts = ['w_sg'];
      for (const [id, q] of [
        [S.asm.rarm, 4],
        [S.asm.core, 3],
        [S.asm.head, 2],
        [S.asm.legs, 1],
        [S.asm.rarm, 1],
      ]) {
        const it = G.rollGear(id, q, rng);
        L.gear.push({ id: it.id, q: it.q, ax: it.ax });
      }
      L.lost = 1;
      document.getElementById('rTitle').textContent = '主線出擊 完成';
      document.getElementById('rRank').textContent = 'A';
      document.getElementById('resultGrid').innerHTML = [
        ['作戰', '礦坑深層的掃蕩'],
        ['完成區段', '4 / 4'],
        ['作戰時間', '12 分 31 秒'],
        ['報酬（已即時入帳）', '+48,200'],
        ['作戰完成報酬', '+60,000'],
        ['SP 結餘', '512,300'],
      ]
        .map((r) => `<span class="dim">${r[0]}</span><span>${r[1]}</span>`)
        .join('');
      g.state = 'result';
      g.showScreen('result');
      document.getElementById('rSpoils').innerHTML = g.spoilsHtml();
    });
  },
  // 真的流程：自由出擊 → 任務完成的結果畫面（標題與評價的演出、駕駛員經驗、戰果）
  'result-real': async (page) => {
    await page.evaluate(() => {
      const g = window.__game;
      g.ctrl.hangarFx = 'off';
      g.startMission();
    });
    await page.waitForFunction(() => window.__game.player && window.__game.state === 'play', null, {
      timeout: 30000,
    });
    await page.evaluate(() => {
      const g = window.__game;
      const G = window.__gear;
      let sd = 5;
      const rng = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      for (const e of g.enemies.slice(0, 6)) g.tallyKill(e);
      g.tl.d.prop = 12;
      g.lootMat('alloy', 2);
      g.lootMat('circuit', 1);
      const it = G.rollGear(g.save.asm.rarm, 2, rng);
      g.lootRun.gear.push({ id: it.id, q: it.q, ax: it.ax });
      g.missionT = 187.4;
      g.endMission(true, false);
    });
    await wait(2500);
  },
  'result-fail': async (page) => {
    await page.evaluate(() => window.__game.startMission());
    await page.waitForFunction(() => window.__game.player && window.__game.state === 'play', null, {
      timeout: 30000,
    });
    await page.evaluate(() => window.__game.endMission(false, false));
    await wait(2500);
  },
  // 從作戰室進來的機甲庫（主線整備）：火控與消耗品的零件格子（小卡片比較高）
  'garage-hub-fcs': async (page) => {
    await hubGarage(page);
    await page.click('#slots .slot[data-slot="fcs"]').catch(() => {});
    await wait(600);
  },
  'garage-hub-item': async (page) => {
    await hubGarage(page);
    await page.click('#slots .slot[data-slot="c2"]').catch(() => {});
    await wait(600);
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
  // 遊戲節奏調整室（game/pace-lab.js）：右側的調整面板
  pacelab: async (page) => {
    await page.evaluate(() => window.__game.openPace());
    await page
      .waitForFunction(() => document.getElementById('hudWrap').offsetParent !== null, null, {
        timeout: 60000,
      })
      .catch(() => {});
    await wait(2500);
  },
  // 節奏調整室的武器區（手部／肩部武器的選單與倍率）
  'pacelab-wpn': async (page) => {
    await SHOTS.pacelab(page);
    await page.evaluate(() => {
      const P = document.getElementById('pacePanel');
      P.classList.remove('mini');
      const h = P.querySelector('h4[data-g="wpn"]');
      if (h && h.textContent.includes('▸')) h.click();
      const s = P.querySelector('select[data-wk="hand"]');
      if (s) s.scrollIntoView({ block: 'start' });
    });
    await wait(400);
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
  // 真的出擊的轉場畫面（標題、說明、下一段、模組、按鈕；等文字演出播完）
  'trans-real': async (page) => {
    await page.evaluate(() => window.__game.campBegin('c1s1'));
    await wait(5500);
  },
  // 全畫面的載入畫面（render-setup.js 的 loadCover）：主線的區段與自由出擊
  'load-camp': async (page) => {
    await page.evaluate(() => {
      const g = window.__game;
      g.campBegin('c1s1');
      g.levelName = g.campSegName();
      g.loadCover(true);
    });
    await wait(800);
  },
  // 提示卡：帶按鈕鍵帽的長提示（game/tips.js）
  'load-tip': async (page) => {
    await page.evaluate(() => {
      const g = window.__game;
      g.levelName = '冰原・白夜';
      g.loadCover(true);
      g.tipStart('lcTip', 'melee_parry');
    });
    await wait(800);
  },
  'load-free': async (page) => {
    await page.evaluate(() => {
      const g = window.__game;
      g.levelName = '貨運集散場・夜間';
      g.loadCover(true);
    });
    await wait(800);
  },
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
  // 主線的導航標記（出口的定位針：一個在畫面內、其他在畫面外；敵人的畫面外箭頭一起看）
  'hud-exits': async (page) => {
    await page.evaluate(() => {
      const g = window.__game;
      g.campBegin('c1s1');
      g.campEnterSeg();
    });
    await wait(5000);
    await page.evaluate(() => {
      const g = window.__game;
      g.waves = [];
      g.wavePend = null;
      g.campSpawnExits();
      const p = g.player,
        h = p.model.height;
      const ex = g.camp.exits || [];
      if (ex[0]) ex[0].pos = p.pos.clone().add(new THREE.Vector3(h * 2.2, 0, -h * 1.6));
      if (g.player.lock == null && g.enemies[0]) g.player.lock = g.enemies[0];
    });
    await wait(4500); // 開場的過關條件卡片收起來之後
  },
  comm: async (page) => {
    await hudShot(page, 'top');
    await page.evaluate(() =>
      window.__game.commSay('veerwell', '目標在水壩的閘門下面。今晚之前把它拿下來，報酬加倍。', '派克'),
    );
    await wait(1800);
  },
  // 插入畫面（Boss 換型態：ECHO 的胸像＋Boss 的名字；側邊的小卡片，不擋畫面中央）
  cutin: async (page) => {
    await hudShot(page, 'top', 3);
    await page.evaluate(() =>
      window.__game.ptCutIn('echo', {
        tag: 'WARNING — 第二型態',
        name: 'AEGIS 護盾指揮艦',
        expr: 'surprised',
        color: '#ff4030',
      }),
    );
    await wait(900);
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

async function hubGarage(page) {
  await page.evaluate(() => {
    const g = window.__game;
    g.ctrl.hangarFx = 'off';
    g.save.coam = 500000;
    g.save.items = { ...(g.save.items || {}), cs_strike: 5, cs_ally: 2 };
    g.hubGarage();
  });
  await wait(2500);
}
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
  // --size=all：動到版面時一律檢查的 15 種解析度（桌機 7、平板 4、手機橫式 4；CLAUDE.md 的「版面」）
  const ALL = [
    '1280x720d',
    '1366x768d',
    '1440x900d',
    '1600x900d',
    'pc',
    '2560x1440d',
    '3440x1440d',
    '1280x1024d',
    '1024x768',
    '1000x626',
    'tab',
    '1366x1024',
    '667x375',
    '740x360',
    'phone',
    '932x430',
  ];
  const sizes = opt.size === 'all' ? ALL : (opt.size || 'pc,tab,phone').split(',');
  const dir = path.join(__dirname, '..', 'test-results', 'ui', opt.tag || 'now');
  fs.mkdirSync(dir, { recursive: true });
  const browser = await launch();
  try {
    for (const sz of sizes) {
      // 自訂大小：寬x高（觸控、2 倍像素），例如 1000x626；後面加 d＝桌機（滑鼠、1 倍像素），例如 1366x768d
      const m = /^(\d+)x(\d+)(d?)$/.exec(sz);
      const conf = m
        ? m[3]
          ? { viewport: { width: +m[1], height: +m[2] } }
          : { viewport: { width: +m[1], height: +m[2] }, hasTouch: true, deviceScaleFactor: 2 }
        : SIZES[sz];
      const ctx = await browser.newContext(conf);
      // 滑鼠鎖定一律停用（無頭的瀏覽器在 Windows 有隱藏視窗，會把使用者的滑鼠鎖到螢幕左上角）
      await ctx.addInitScript(() => {
        Element.prototype.requestPointerLock = function () {
          return Promise.resolve();
        };
      });
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
