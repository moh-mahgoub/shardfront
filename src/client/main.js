// Boot, match lifecycle and the main loop (fixed-timestep simulation, interpolated render).
import { TILE, TICK_RATE, MAP_W, DEFS, FACTIONS } from '../data.js';
import { Game } from '../sim/game.js';
import { app, worldToScreenX, worldToScreenY } from './app.js';
import { loadSettings } from './settings.js';
import { Sfx } from './audio.js';
import { buildSprites } from './sprites.js';
import { initRenderer, resizeRenderer, buildTerrain, render, initMinimap, renderMinimap, snapFog, fx } from './renderer.js';
import { initInput, updateCamera, resetInput } from './input.js';
import { ui } from './ui.js';
import { centerOn, clampCamera, pruneSelection, setSelection } from './controller.js';

const TICK_MS = 1000 / TICK_RATE;
let slowT = 0, acc = 0, last = 0, frames = 0, fpsT = 0, lastQueries = 0, tickSum = 0, tickN = 0;
const params = new URLSearchParams(location.search);

function startMatch(opts) {
  opts = opts || {};
  const s = app.settings;
  const faction = opts.faction || s.faction, other = faction === 'compact' ? 'choir' : 'compact';
  const seed = opts.seed || +params.get('seed') || ((Date.now() % 2147483647) | 1);
  setSelection([]);
  app.groups = [[], [], [], [], []];
  app.game = new Game({ seed, recordReplay: true, players: [{ faction, ai: opts.demo || null }, { faction: other, ai: opts.difficulty || s.difficulty }] });
  app.human = 0;
  app.targeting = app.placing = null; app.buildMenu = false;
  app.paused = false; app.ended = false; app.running = true;
  fx.clear(); resetInput();
  buildTerrain(app.game.map);
  snapFog();
  const home = app.game.map.bases[0][0];
  app.cam.zoom = 1;
  centerOn((home.tx + 2) * TILE, (home.ty + 1) * TILE);
  acc = 0; app.stats.tickMax = 0;
  ui.showGame(true);
}

function quitToMenu() {
  app.running = false; app.paused = false; app.game = null;
  setSelection([]);
  ui.showGame(false);
}

function onScreenGain(x, y) {
  const sx = worldToScreenX(x), sy = worldToScreenY(y), v = app.view;
  return (sx > -80 && sx < v.w + 80 && sy > -80 && sy < v.h + 80) ? 1 : 0.25;
}

// Turn simulation events into effects, sounds and notifications.
function processEvents() {
  const g = app.game, P = app.human, fog = g.players[P].fog, ev = g.events;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    const vis = e.x !== undefined && fog[((e.y / TILE) | 0) * MAP_W + ((e.x / TILE) | 0)] === 2;
    switch (e.t) {
      case 'shot': if (vis) app.sfx.play('shot', onScreenGain(e.x, e.y)); break;
      case 'melee': if (vis) { app.sfx.play('melee', onScreenGain(e.x, e.y)); fx.particle(e.x, e.y, 0, -20, 0.18, 4, '#ffffff'); } break;
      case 'hit':
        if (vis) {
          for (let k = 0; k < (e.splash ? 6 : 2); k++) { const a = Math.random() * 6.28, s = 30 + Math.random() * 50; fx.particle(e.x, e.y, Math.cos(a) * s, Math.sin(a) * s, 0.22, 2.5, '#ffe9a8'); }
          if (e.splash) fx.ring(e.x, e.y, 4, e.splash, 0.25, '#ffcf6a', 'world', 2);
          app.sfx.play('hit', onScreenGain(e.x, e.y));
        }
        break;
      case 'death':
        if (vis || e.owner === P) {
          fx.explosion(e.x, e.y, e.size, e.kind === 'building' ? '#ff9a4a' : DEFS[e.type].faction === 'compact' ? '#ffb24a' : '#bfe9ff');
          app.sfx.play(e.kind === 'building' ? 'bigboom' : 'boom', onScreenGain(e.x, e.y));
        }
        break;
      case 'built': if (e.owner === P) { app.sfx.play('built'); fx.ring(e.x, e.y, 10, 70, 0.6, '#ffd76a', 'world', 3); } break;
      case 'trained': if (e.owner === P) app.sfx.play('trained', onScreenGain(e.x, e.y)); break;
      case 'alert':
        if (e.owner === P) { ui.alert('Your forces are under attack!'); fx.pings.push({ x: e.x, y: e.y, life: 4 }); app.sfx.play('alert'); }
        break;
      case 'error': if (e.owner === P) { ui.toast(e.msg); app.sfx.play('error'); } break;
      case 'over':
        app.ended = true;
        app.sfx.play(e.winner === P ? 'win' : 'lose');
        setTimeout(() => { if (app.game === g) ui.showResult(e.winner === P); }, 900);
        break;
    }
  }
  ev.length = 0;
}

function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (t - last) / 1000 || 0);
  last = t;
  const st = app.stats;
  frames++; fpsT += dt;
  st.frameMs += (dt * 1000 - st.frameMs) * 0.1;
  if (fpsT >= 0.5) {
    st.fps = frames / fpsT; frames = 0; fpsT = 0;
    if (app.game) { st.pathsPerSec = (app.game.grid.queries - lastQueries) * 2; lastQueries = app.game.grid.queries; }
    if (tickN) { st.tickMs = tickSum / tickN; tickSum = 0; tickN = 0; }
    // Adaptive resolution: if we are fill-rate bound (slow frames, cheap JS), render fewer pixels.
    slowT = (app.running && !app.paused && st.frameMs > 21 && st.renderMs < 8) ? slowT + 1 : 0;
    if (slowT >= 4 && app.view.dpr > 1) { app.view.maxDpr = Math.max(1, app.view.dpr - 0.5); resizeRenderer(); slowT = 0; }
  }
  const g = app.game;
  if (!app.running || !g) { render(0, dt); return; }
  if (!app.paused) {
    acc += dt * 1000;
    let n = 0;
    while (acc >= TICK_MS && n < 4) {
      const t0 = performance.now();
      g.step();
      const ms = performance.now() - t0;
      tickSum += ms; tickN++; if (ms > st.tickMax) st.tickMax = ms;
      acc -= TICK_MS; n++;
    }
    if (acc > TICK_MS) acc = 0;                    // fell behind: drop the backlog rather than spiral
    processEvents();
    pruneSelection();
    updateCamera(dt);
  }
  app.alpha = app.paused ? 1 : acc / TICK_MS;
  const r0 = performance.now();
  render(app.alpha, app.paused ? 0 : dt);
  st.renderMs += (performance.now() - r0 - st.renderMs) * 0.1;
  if ((frames & 3) === 0) renderMinimap(dt * 4);
  ui.update(dt);
}

function boot() {
  app.settings = loadSettings();
  if (params.get('debug')) app.settings.debug = true;
  app.sfx = new Sfx(); app.sfx.setVolume(app.settings.volume);
  app.sprites = buildSprites();
  app.fx = fx; app.ui = ui;
  const canvas = document.getElementById('game'), mini = document.getElementById('minimap');
  initRenderer(canvas); initMinimap(mini); initInput(canvas, mini);
  ui.init({ start: () => startMatch(), quit: quitToMenu });
  const onResize = () => { resizeRenderer(); if (app.game) clampCamera(); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(onResize, 250));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', () => { if (document.hidden && app.running && !app.paused && !app.ended) ui.togglePause(); last = performance.now(); });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is optional */ });

  // Hooks for the automated tests and for poking around in the console.
  window.__app = app;
  window.__test = {
    start: startMatch,
    toScreen: (x, y) => ({ x: worldToScreenX(x), y: worldToScreenY(y) }),
    // Debug-only: drops two armies in the middle of the map and sends them at each other.
    stress(n) {
      const g = app.game, T = TILE;
      const at = [[18 * T, 31 * T], [31 * T, 18 * T]];       // either side of the north-west ridge gap
      const ids = [[], []];
      for (let i = 0; i < n; i++) {
        const o = i & 1, k = i >> 1, roles = FACTIONS[g.players[o].faction].roles, role = ['melee', 'ranged', 'anti', 'heavy'][k % 4];
        const u = g.addUnit(roles[role], o, at[o][0] + (k % 10) * 22 - 100, at[o][1] + ((k / 10) | 0) * 22 - 80);
        ids[o].push(u.id);
      }
      for (const p of g.players) p.supplyCap = 200;
      g.issue({ t: 'amove', p: 0, ids: ids[0], x: at[1][0], y: at[1][1] });
      g.issue({ t: 'amove', p: 1, ids: ids[1], x: at[0][0], y: at[0][1] });
      app.cam.zoom = 0.6; centerOn(24.5 * T, 24.5 * T);
      return g.units.length;
    },
  };
  if (params.get('autostart')) startMatch({ difficulty: params.get('autostart'), demo: params.get('demo') });
  requestAnimationFrame(frame);
}

boot();
