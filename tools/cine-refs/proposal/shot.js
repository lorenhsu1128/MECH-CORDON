const { chromium } = require(process.cwd() + '/node_modules/playwright-core');
(async () => { const b = await chromium.launch({ channel: 'msedge' });
  for (const [w, n] of [[1280, 'd'], [400, 'm']]) { const p = await b.newPage({ viewport: { width: w, height: 900 } });
    const html = require('fs').readFileSync('C:/Users/LOREN/AppData/Local/Temp/claude/deb674574f2845b7/9e3b9cf6-ef6e-4bd6-a6f6-8ec9155967a8/scratchpad/cineprop/cine-proposal.html', 'utf8');
    await p.setContent('<!doctype html><html><head><meta charset=utf-8><meta name=viewport content=\"width=device-width\"></head><body>' + html + '</body></html>');
    await p.waitForTimeout(1500); await p.screenshot({ path: 'C:/Users/LOREN/AppData/Local/Temp/claude/deb674574f2845b7/9e3b9cf6-ef6e-4bd6-a6f6-8ec9155967a8/scratchpad/cineprop/shot-' + n + '.png', fullPage: true });
    console.log(n, await p.evaluate(() => document.documentElement.scrollWidth)); }
  await b.close(); })();
