// Browser smoke test with iPad touch emulation (Playwright).
//   npm i -D playwright && npx playwright install chromium   (once)
//   node tests/smoke.mjs [--shots]
// Loads the game, plays through the core touch interactions of every milestone,
// measures frame time with 160+ units fighting, fast-forwards a match to the
// result screen, and fails on any console error.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); }
catch (e) { console.error('Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium'); process.exit(2); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8137, URL = `http://localhost:${PORT}/index.html?seed=7`;
const shots = process.argv.includes('--shots');
const shotDir = path.join(root, 'tests', 'screenshots');
if (shots) fs.mkdirSync(shotDir, { recursive: true });

const server = spawn(process.execPath, [path.join(root, 'tools/serve.mjs'), String(PORT)], { stdio: 'ignore' });
await new Promise(r => setTimeout(r, 600));

let browser;
try { browser = await chromium.launch(); } catch (e) { browser = await chromium.launch({ channel: 'chrome' }); }
const ctx = await browser.newContext({
  viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
});
const page = await ctx.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
const cdp = await ctx.newCDPSession(page);

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failed++; };
const wait = ms => page.waitForTimeout(ms);
const shot = async name => { if (shots) await page.screenshot({ path: path.join(shotDir, name + '.png') }); };
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
const tap = (x, y) => page.touchscreen.tap(x, y);
async function drag(x0, y0, x1, y1, steps = 8) {
  await touch('touchStart', [[x0, y0]]);
  for (let i = 1; i <= steps; i++) { await touch('touchMove', [[x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps]]); await wait(16); }
  await touch('touchEnd', []);
}
const tapEl = async sel => { const b = await page.locator(sel).first().boundingBox(); await tap(b.x + b.width / 2, b.y + b.height / 2); };
const S = fn => page.evaluate(fn);
const screenOf = id => page.evaluate(i => { const e = __app.game.byId.get(i); return __test.toScreen(e.x, e.y); }, id);

try {
  console.log('Milestone 1 - skeleton, camera');
  await page.goto(URL);
  await page.waitForSelector('#menu-main:not(.hidden)');
  await shot('01-menu');
  await tapEl('[data-diff="normal"]');
  await tapEl('#btn-play');
  await page.waitForSelector('#hud:not(.hidden)');
  await wait(500);
  ok(await S(() => __app.running && __app.game.tick > 3), 'match started and the fixed-timestep loop is ticking');
  await shot('02-start');
  const z0 = await S(() => __app.cam.zoom);
  await touch('touchStart', [[500, 400], [700, 400]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[500 + i * 8, 400], [700 - i * 8, 400]]); await wait(16); }
  await touch('touchEnd', []);
  const z1 = await S(() => __app.cam.zoom);
  ok(z1 < z0 * 0.8, `pinch zooms out (${z0.toFixed(2)} -> ${z1.toFixed(2)})`);
  const c0 = await S(() => ({ x: __app.cam.x, y: __app.cam.y }));
  await touch('touchStart', [[500, 400], [600, 400]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[500 - i * 10, 400 + i * 6], [600 - i * 10, 400 + i * 6]]); await wait(16); }
  await touch('touchEnd', []);
  const c1 = await S(() => ({ x: __app.cam.x, y: __app.cam.y }));
  ok(c1.x > c0.x + 40, 'two-finger drag pans the camera');
  await tapEl('#btn-mode');
  ok(await S(() => __app.mode === 'camera'), 'mode toggle switches to Camera mode');
  await drag(600, 300, 500, 420);
  const c2 = await S(() => ({ x: __app.cam.x, y: __app.cam.y }));
  ok(c2.x > c1.x + 20, 'one-finger drag pans in Camera mode');
  await wait(500);
  ok(await S(() => Math.abs(__app.cam.vx) + Math.abs(__app.cam.vy) < 2500), 'inertia decays');
  await tapEl('#btn-mode');
  await S(() => { const g = __app.game, s = g.map.bases[0][0]; __app.cam.zoom = 1; __app.cam.vx = __app.cam.vy = 0; __app.cam.x = (s.tx + 2) * 32; __app.cam.y = (s.ty + 1) * 32; });
  await wait(100);

  console.log('Milestone 2 - selection, movement, minimap');
  const wid = await S(() => __app.game.units.find(u => u.owner === 0).id);
  let p = await screenOf(wid);
  await tap(p.x, p.y);
  ok(await S(() => __app.sel.length === 1 && __app.sel[0].kind === 'unit'), 'tap selects a unit');
  await wait(250);
  ok(await page.locator('#cmdcard .cmd').count() >= 6, 'command card shows Move/Attack/Stop/Hold/Patrol/Build');
  const sz = await page.locator('#cmdcard .cmd').first().boundingBox();
  ok(sz.width >= 44 && sz.height >= 44, `command buttons are >= 44pt (${sz.width.toFixed(0)}x${sz.height.toFixed(0)})`);
  const before = await page.evaluate(i => { const e = __app.game.byId.get(i); return { x: e.x, y: e.y }; }, wid);
  await tap(p.x + 170, p.y - 150);
  await wait(900);
  const after = await page.evaluate(i => { const e = __app.game.byId.get(i); return { x: e.x, y: e.y, ot: e.ot }; }, wid);
  ok(Math.hypot(after.x - before.x, after.y - before.y) > 30, 'tap on ground moves the selected unit (A* + steering)');
  p = await screenOf(wid);
  await tap(p.x, p.y); await wait(60); p = await screenOf(wid); await tap(p.x, p.y);
  await wait(100);
  ok(await S(() => __app.sel.length >= 4), 'double-tap selects all units of that type on screen');
  await tapEl('.sp-x');
  ok(await S(() => __app.sel.length === 0), 'deselect button clears the selection');
  await drag(250, 150, 950, 600, 10);
  ok(await S(() => __app.sel.length >= 4), 'drag in Select mode box-selects units');
  await shot('03-selected');
  // control groups: long-press assigns, tap recalls
  const gb = await page.locator('[data-group="1"]').boundingBox();
  await touch('touchStart', [[gb.x + 20, gb.y + 20]]); await wait(650); await touch('touchEnd', []);
  ok(await S(() => __app.groups[0].length >= 4), 'long-press assigns control group 1');
  await tapEl('.sp-x');
  await tap(gb.x + 20, gb.y + 20); await wait(80);
  ok(await S(() => __app.sel.length >= 4), 'tap on group 1 recalls it');
  const mm = await page.locator('#minimap').boundingBox();
  await tap(mm.x + mm.width * 0.8, mm.y + mm.height * 0.2); await wait(80);
  ok(await S(() => __app.cam.x > 60 * 32 && __app.cam.y < 36 * 32), 'minimap tap jumps the camera');
  await drag(mm.x + mm.width * 0.8, mm.y + mm.height * 0.2, mm.x + mm.width * 0.14, mm.y + mm.height * 0.84, 6);
  ok(await S(() => __app.cam.x < 30 * 32 && __app.cam.y > 66 * 32), 'minimap drag pans the camera');

  console.log('Milestone 3 - economy, building, production');
  await S(() => { __app.game.players[0].ore = 1000; });
  await wait(200);
  await page.locator('[data-cmd="Build"]').waitFor();
  await tapEl('[data-cmd="Build"]'); await wait(200);
  await tapEl('[data-cmd="Quarters"]'); await wait(150);
  ok(await S(() => !!__app.placing), 'choosing a structure shows the placement ghost');
  const site = await S(() => { const s = __app.game.map.bases[0][0]; return __test.toScreen((s.tx + 8) * 32, (s.ty - 3) * 32); });
  await tap(site.x, site.y); await wait(150);
  ok(await S(() => __app.placing && __app.placing.ok === true), 'ghost reports a valid site (green)');
  await shot('04-placing');
  const rock = await S(() => { const g = __app.game, m = g.buildings.find(b => b.owner === 0); const r = g.resources.filter(r => Math.hypot(r.x - m.x, r.y - m.y) < 300).sort((a, b) => a.y - b.y)[0]; return __test.toScreen(r.x, r.y); });
  await tap(rock.x, rock.y); await wait(150);
  ok(await S(() => __app.placing && __app.placing.ok === false), 'ghost reports an invalid site (red)');
  await tap(site.x, site.y); await wait(100);
  await tapEl('[data-cmd="Place"]'); await wait(100);
  ok(await S(() => !__app.placing && __app.game.units.some(u => u.ot === 'build')), 'Place sends a worker to build');
  await S(() => { for (let i = 0; i < 700; i++) __app.game.step(); });
  ok(await S(() => __app.game.buildings.some(b => b.owner === 0 && b.type === 'quarters' && b.done)), 'structure completes and raises supply');
  ok(await S(() => __app.game.players[0].supplyCap === 19), 'supply cap is 19 after one Quarters');
  ok(await S(() => __app.game.players[0].mined > 100), 'workers have been gathering and returning shards');
  const core = await S(() => { const b = __app.game.buildings.find(b => b.owner === 0 && b.def.role === 'main'); return __test.toScreen(b.x, b.y); });
  await tap(core.x, core.y); await wait(200);
  await tapEl('[data-cmd="Tinker"]'); await wait(250); await tapEl('[data-cmd="Tinker"]'); await wait(250);
  ok(await S(() => __app.game.buildings.find(b => b.owner === 0 && b.def.role === 'main').queue.length === 2), 'train buttons queue units');
  await tapEl('[data-cmd="Cancel"]'); await wait(200);
  ok(await S(() => __app.game.buildings.find(b => b.owner === 0 && b.def.role === 'main').queue.length === 1), 'Cancel removes the last queued unit');
  await tapEl('[data-cmd="Rally"]'); await wait(100);
  await tap(core.x + 150, core.y - 140); await wait(150);
  ok(await S(() => __app.game.buildings.find(b => b.owner === 0 && b.def.role === 'main').rallyX > 0), 'Rally control sets a rally point');
  await shot('05-economy');

  console.log('Milestone 4 - combat, fog, 150+ units, frame time');
  ok(await S(() => { const f = __app.game.players[0].fog; let a = 0, b = 0, c = 0; for (const v of f) { if (v === 0) a++; else if (v === 1) b++; else c++; } return a > 1000 && c > 100; }), 'fog has unexplored and visible regions');
  ok(await S(() => !__app.game.units.some(u => u.owner === 1 && u._vis)), 'enemy units hidden in fog are not drawn');
  const n = await S(() => __test.stress(260));
  await wait(2500);
  await shot('06-battle');
  await wait(3000);                                 // let adaptive resolution settle (headless Chromium has no GPU)
  const perf = await page.evaluate(() => new Promise(res => {
    const t = []; let last = performance.now();
    function f(now) { t.push(now - last); last = now;
      if (t.length < 240) requestAnimationFrame(f); else { t.sort((a, b) => a - b); const s = __app.stats; res({ avg: t.reduce((a, b) => a + b) / t.length, p95: t[t.length * 0.95 | 0], draw: s.renderMs, tick: s.tickMs, tickMax: s.tickMax, dpr: __app.view.dpr, units: __app.game.units.length }); } }
    requestAnimationFrame(f);
  }));
  console.log(`       ${n} units spawned, ${perf.units} still fighting; frame avg ${perf.avg.toFixed(1)}ms p95 ${perf.p95.toFixed(1)}ms at render scale ${perf.dpr}x; JS draw ${perf.draw.toFixed(2)}ms; sim tick avg ${perf.tick.toFixed(2)}ms max ${perf.tickMax.toFixed(1)}ms`);
  ok(n >= 150, '150+ units alive at once');
  ok(perf.avg < 20, 'frame time holds 60 fps (software-rendered headless Chromium, adaptive resolution)');
  ok(perf.draw < 4, 'JS draw cost per frame is under 4 ms');
  ok(perf.tick < 8, 'simulation tick is well under its 50 ms budget');
  ok(await S(() => __app.game.players[0].kills + __app.game.players[1].kills > 0), 'units fight and die');

  console.log('Milestone 5 - AI and win/lose flow');
  await tapEl('#btn-menu'); await wait(150);
  ok(await S(() => __app.paused) && await page.locator('#menu-pause').isVisible(), 'pause menu opens and pauses the simulation');
  await shot('07-pause');
  await tapEl('#btn-settings2'); await wait(100);
  ok(await page.locator('#menu-settings').isVisible(), 'settings screen opens');
  await page.evaluate(() => { const r = document.getElementById('set-scale'); r.value = 1.2; r.dispatchEvent(new Event('input')); });
  ok(await S(() => JSON.parse(localStorage.getItem('shardfront.settings.v1')).uiScale === 1.2), 'settings persist to localStorage');
  await page.evaluate(() => { const r = document.getElementById('set-scale'); r.value = 1; r.dispatchEvent(new Event('input')); });
  await tapEl('#btn-settings-done'); await tapEl('#btn-resume'); await wait(150);
  ok(await S(() => !__app.paused), 'resume continues the match');
  const res = await page.evaluate(() => { const g = __app.game; let n = 0; while (!g.over && n < 40000) { g.step(); g.events.length > 500 && (g.events.length = 0); n++; } return { over: g.over, winner: g.winner, tick: g.tick, ai: g.players[1].ai.waves }; });
  ok(res.over, `match reaches a conclusion (winner P${res.winner} at ${(res.tick / 20 / 60).toFixed(1)} min, AI launched ${res.ai} waves)`);
  await page.waitForSelector('#menu-result:not(.hidden)', { timeout: 5000 });
  await shot('08-result');
  ok(true, 'result screen is shown');
  await tapEl('#btn-again'); await wait(400);
  ok(await S(() => __app.running && !__app.ended && __app.game.tick < 40), 'restart button starts a fresh match');

  console.log('Milestone 6 - PWA, standalone file');
  ok(await page.evaluate(async () => (await fetch('manifest.webmanifest')).ok && (await fetch('sw.js')).ok && (await fetch('icons/icon-180.png')).ok), 'manifest, service worker and icons are served');
  ok(await S(() => getComputedStyle(document.body).touchAction === 'none' && getComputedStyle(document.body).userSelect === 'none'), 'page scroll/zoom/selection are disabled');
  const page2 = await ctx.newPage();
  page2.on('pageerror', e => errors.push('standalone pageerror: ' + e.message));
  page2.on('console', m => { if (m.type() === 'error') errors.push('standalone console: ' + m.text()); });
  await page2.goto(pathToFileURL(path.join(root, 'standalone.html')).href + '?autostart=easy');
  await page2.waitForTimeout(800);
  ok(await page2.evaluate(() => __app.running && __app.game.tick > 5), 'standalone.html runs when opened directly from disk (file://)');
  await page2.close();
} catch (e) {
  console.error('  FAIL (exception): ' + e.message); failed++;
  try { await page.screenshot({ path: path.join(root, 'tests', 'failure.png') }); } catch (e2) { /* ignore */ }
}

ok(errors.length === 0, 'no console errors' + (errors.length ? ':\n    ' + errors.slice(0, 8).join('\n    ') : ''));
await browser.close();
server.kill();
console.log(failed ? `\n${failed} FAILURE(S)` : '\nSMOKE TEST PASSED');
process.exit(failed ? 1 : 0);
