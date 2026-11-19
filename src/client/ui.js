// DOM HUD: top bar, selection panel, contextual command card, control groups,
// mode toggle, banners, menus. DOM is used (rather than canvas) so buttons get
// native hit-testing and comfortably large touch targets.
import { DEFS, FACTIONS, AI_LEVELS, TICK_RATE } from '../data.js';
import { app } from './app.js';
import { saveSettings } from './settings.js';
import {
  setSelection, ownUnits, ownBuildings, startTargeting, startPlacing, confirmPlacement, cancelModes, orderSimple,
  train, cancelProduction, assignGroup, recallGroup, selectIdleWorker, selectArmy,
} from './controller.js';

const $ = id => document.getElementById(id);
let el = {};
let cardKey = '', panelKey = '', frame = 0, toastT = 0, alertT = 0;
let hooks = {};
const lastGroupTap = { i: -1, t: 0 };

function press(node, fn) {
  node.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); app.sfx.unlock(); fn(ev); });
}
function click(id, fn) { $(id).addEventListener('click', () => { app.sfx.unlock(); app.sfx.play('click'); fn(); }); }

function cmdButton(icon, label, cost, cls, fn) {
  const b = document.createElement('button');
  b.className = 'cmd ' + (cls || '');
  b.dataset.cmd = label;
  const c = document.createElement('canvas'); b.appendChild(c);
  const s = document.createElement('span'); s.textContent = label; b.appendChild(s);
  if (cost) { const e = document.createElement('em'); e.textContent = cost; b.appendChild(e); }
  press(b, fn);
  b._icon = icon;
  return b;
}

function rebuildCard() {
  const card = el.card, g = app.game, P = app.human;
  card.textContent = '';
  const add = b => card.appendChild(b);
  const us = ownUnits(), bs = ownBuildings();
  if (app.placing) {
    add(cmdButton('confirm', 'Place', '', 'go', confirmPlacement));
    add(cmdButton('cancel', 'Cancel', '', 'no', cancelModes));
  } else if (app.targeting) {
    add(cmdButton('cancel', 'Cancel', '', 'no', cancelModes));
  } else if (us.length && app.buildMenu) {
    for (const key of FACTIONS[g.players[P].faction].build) {
      const d = DEFS[key], why = g.whyNot(P, key);
      const b = cmdButton(key, d.name, d.cost, why ? 'off' : '', () => startPlacing(key));
      add(b);
    }
    add(cmdButton('back', 'Back', '', '', () => { app.buildMenu = false; app.selVersion++; }));
  } else if (us.length) {
    add(cmdButton('move', 'Move', '', '', () => startTargeting('move')));
    add(cmdButton('amove', 'Attack', '', '', () => startTargeting('amove')));
    add(cmdButton('stop', 'Stop', '', '', () => orderSimple('stop')));
    add(cmdButton('hold', 'Hold', '', '', () => orderSimple('hold')));
    add(cmdButton('patrol', 'Patrol', '', '', () => startTargeting('patrol')));
    if (us.some(u => u.def.role === 'worker')) add(cmdButton('build', 'Build', '', '', () => { app.buildMenu = true; app.selVersion++; app.sfx.play('click'); }));
  } else if (bs.length) {
    const trains = new Set();
    for (const b of bs) if (b.done && b.def.trains) for (const t of b.def.trains) trains.add(t);
    for (const t of trains) {
      const d = DEFS[t], why = g.whyNot(P, t);
      add(cmdButton(t, d.name, d.cost, why ? 'off' : '', () => train(t)));
    }
    if (trains.size) add(cmdButton('rally', 'Rally', '', '', () => startTargeting('rally')));
    if (bs.some(b => !b.done || b.queue.length)) add(cmdButton('cancel', 'Cancel', '', 'no', cancelProduction));
  }
  for (const b of card.children) app.sprites.paintIcon(b.firstChild, b._icon, P);
  // banner
  const hint = app.placing ? 'Drag to position, then tap the ghost or Place'
    : app.targeting ? 'Tap a target: ' + ({ move: 'Move', amove: 'Attack-move', patrol: 'Patrol', rally: 'Rally point' })[app.targeting] : '';
  if (hint) { el.banner.textContent = hint; el.banner.className = ''; alertT = 0; }
  else if (alertT <= 0) el.banner.className = 'hidden';
}

function statLine(d) {
  const p = [];
  if (d.damage) {
    let s = 'Dmg ' + d.damage;
    for (const k in d.bonus) s += ' (+' + d.bonus[k] + ' ' + k + ')';
    p.push(s, 'Range ' + (d.range < 1 ? 'melee' : d.range));
  }
  p.push('Armor ' + d.armor + ' ' + d.armorType);
  return p.join(' · ');
}

function rebuildPanel() {
  const panel = el.panel, P = app.human, sel = app.sel;
  panel.textContent = '';
  if (!sel.length) return;
  const head = document.createElement('div'); head.className = 'sp-head';
  const x = document.createElement('button'); x.className = 'sp-x'; x.textContent = '✕'; x.setAttribute('aria-label', 'Deselect');
  press(x, () => setSelection([]));
  if (sel.length === 1) {
    const e = sel[0];
    const port = document.createElement('canvas'); port.className = 'sp-port'; head.appendChild(port);
    const info = document.createElement('div');
    const name = document.createElement('div'); name.className = 'sp-name';
    const sub = document.createElement('div'); sub.className = 'sp-sub';
    if (e.kind === 'resource') { name.textContent = 'Shard Deposit'; sub.id = 'sp-hp'; }
    else { name.textContent = e.def.name + (e.owner !== P ? ' (enemy)' : ''); sub.innerHTML = '<span id="sp-hp"></span><br>' + statLine(e.def); }
    info.appendChild(name); info.appendChild(sub); head.appendChild(info); head.appendChild(x);
    panel.appendChild(head);
    if (e.kind !== 'resource') { const bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = '<i id="sp-bar"></i>'; panel.appendChild(bar); }
    if (e.kind === 'building' && e.owner === P) {
      const pb = document.createElement('div'); pb.className = 'bar prog'; pb.innerHTML = '<i id="sp-prog" style="width:0"></i>'; panel.appendChild(pb);
      const q = document.createElement('div'); q.className = 'sp-queue'; panel.appendChild(q);
      for (const t of e.queue) { const c = document.createElement('canvas'); q.appendChild(c); app.sprites.paintIcon(c, t, P); }
      if (!e.done) { const s = document.createElement('span'); s.className = 'sp-sub'; s.textContent = 'Under construction'; q.appendChild(s); }
    }
    app.sprites.paintIcon(port, e.kind === 'resource' ? 'shards' : e.type, e.owner);
  } else {
    const info = document.createElement('div');
    info.innerHTML = '<div class="sp-name">' + sel.length + ' selected</div><div class="sp-sub">Tap a portrait to pick one</div>';
    head.appendChild(info); head.appendChild(x); panel.appendChild(head);
    const grid = document.createElement('div'); grid.className = 'sp-grid'; panel.appendChild(grid);
    const max = sel.length > 16 ? 15 : 16;
    for (let i = 0; i < Math.min(max, sel.length); i++) {
      const e = sel[i];
      const cell = document.createElement('button'); cell.className = 'sp-cell';
      const c = document.createElement('canvas'); cell.appendChild(c);
      const hp = document.createElement('i'); cell.appendChild(hp); cell._e = e;
      press(cell, () => setSelection([e]));
      grid.appendChild(cell);
      app.sprites.paintIcon(c, e.type, e.owner);
    }
    if (sel.length > max) { const m = document.createElement('div'); m.className = 'sp-cell sp-more'; m.textContent = '+' + (sel.length - max); grid.appendChild(m); }
  }
}

function refreshPanel() {
  const sel = app.sel;
  if (sel.length === 1) {
    const e = sel[0], hp = $('sp-hp');
    if (!hp) return;
    if (e.kind === 'resource') { hp.textContent = Math.max(0, e.amount) + ' shards left'; return; }
    hp.textContent = 'HP ' + Math.max(0, Math.ceil(e.hp)) + ' / ' + e.maxHp;
    const f = Math.max(0, e.hp / e.maxHp), bar = $('sp-bar');
    bar.style.width = (f * 100) + '%'; bar.style.background = f > 0.6 ? '#5be36a' : f > 0.3 ? '#f2cf4a' : '#f0513c';
    const pr = $('sp-prog');
    if (pr) pr.style.width = (!e.done ? e.bp / e.def._bt : e.queue.length ? e.prog / DEFS[e.queue[0]]._bt : 0) * 100 + '%';
  } else if (sel.length > 1) {
    for (const cell of el.panel.querySelectorAll('.sp-cell')) {
      const e = cell._e; if (!e) continue;
      const f = Math.max(0, e.hp / e.maxHp);
      cell.lastChild.style.width = (f * 100) + '%'; cell.lastChild.style.background = f > 0.6 ? '#5be36a' : f > 0.3 ? '#f2cf4a' : '#f0513c';
    }
  }
}

function refreshGroups() {
  for (let i = 0; i < 5; i++) {
    const b = el.groups[i], n = app.groups[i].filter(e => !e.dead).length;
    b.classList.toggle('has', n > 0);
    b.lastChild.textContent = n || '';
  }
}

function show(id, on) { $(id).classList.toggle('hidden', !on); }

function buildMenus() {
  const s = app.settings;
  const fr = $('pick-faction'), dr = $('pick-diff');
  const facBtns = {}, diffBtns = {};
  const mark = () => {
    for (const k in facBtns) facBtns[k].classList.toggle('sel', k === s.faction);
    for (const k in diffBtns) diffBtns[k].classList.toggle('sel', k === s.difficulty);
  };
  for (const k in FACTIONS) {
    const f = FACTIONS[k];
    const b = document.createElement('button'); b.className = 'opt'; b.dataset.faction = k;
    const c = document.createElement('canvas'); b.appendChild(c);
    const t = document.createElement('div'); t.innerHTML = '<b>' + f.name + '</b><small>' + f.blurb + '</small>'; b.appendChild(t);
    b.addEventListener('click', () => { s.faction = k; saveSettings(s); mark(); app.sfx.unlock(); app.sfx.play('click'); });
    fr.appendChild(b); facBtns[k] = b;
    app.sprites.paintIcon(c, f.roles.main, 0);
  }
  for (const k in AI_LEVELS) {
    const b = document.createElement('button'); b.className = 'opt center'; b.dataset.diff = k; b.textContent = AI_LEVELS[k].label;
    b.addEventListener('click', () => { s.difficulty = k; saveSettings(s); mark(); app.sfx.unlock(); app.sfx.play('click'); });
    dr.appendChild(b); diffBtns[k] = b;
  }
  mark();
  click('btn-play', () => hooks.start());
  click('btn-howto', () => show('menu-howto', true));
  click('btn-howto2', () => show('menu-howto', true));
  click('btn-howto-done', () => show('menu-howto', false));
  click('btn-settings', () => show('menu-settings', true));
  click('btn-settings2', () => show('menu-settings', true));
  click('btn-settings-done', () => show('menu-settings', false));
  click('btn-resume', () => ui.togglePause());
  click('btn-restart', () => { show('menu-pause', false); hooks.start(); });
  click('btn-quit', () => { show('menu-pause', false); hooks.quit(); });
  click('btn-again', () => { show('menu-result', false); hooks.start(); });
  click('btn-result-menu', () => { show('menu-result', false); hooks.quit(); });

  const vol = $('set-volume'), sc = $('set-scale'), dbg = $('set-debug');
  vol.value = s.volume; sc.value = s.uiScale; dbg.checked = s.debug;
  vol.addEventListener('input', () => { s.volume = +vol.value; app.sfx.unlock(); app.sfx.setVolume(s.volume); saveSettings(s); });
  vol.addEventListener('change', () => app.sfx.play('select'));
  sc.addEventListener('input', () => { s.uiScale = +sc.value; applyScale(); saveSettings(s); });
  dbg.addEventListener('change', () => { s.debug = dbg.checked; show('debug', s.debug); saveSettings(s); });
}

function applyScale() {
  document.documentElement.style.setProperty('--ui', app.settings.uiScale);
  cardKey = panelKey = '';               // icons are sized in em: repaint
}

export const ui = {
  init(h) {
    hooks = h;
    el = { card: $('cmdcard'), panel: $('selpanel'), banner: $('banner'), toast: $('toast'), ore: $('ore'), supply: $('supply'),
           clock: $('clock'), idle: $('idle-n'), army: $('army-n'), debug: $('debug'), groups: [] };
    press($('btn-menu'), () => ui.togglePause());
    press($('btn-idle'), selectIdleWorker);
    press($('btn-army'), selectArmy);
    press($('btn-mode'), () => { ui.setMode(app.mode === 'select' ? 'camera' : 'select'); app.sfx.play('click'); });
    const gw = $('groups');
    for (let i = 0; i < 5; i++) {
      const b = document.createElement('button'); b.className = 'gbtn'; b.dataset.group = i + 1;
      b.appendChild(document.createTextNode(i + 1)); b.appendChild(document.createElement('small'));
      let timer = 0, long = false;
      b.addEventListener('pointerdown', ev => {
        ev.preventDefault(); ev.stopPropagation(); app.sfx.unlock(); long = false;
        timer = setTimeout(() => {
          long = true;
          if (!app.sel.some(e => e.owner === app.human)) { ui.toast('Select units first, then hold to assign'); return; }
          assignGroup(i); refreshGroups(); app.sfx.play('built');
          b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 350);
          ui.toast('Group ' + (i + 1) + ' assigned');
        }, 450);
      });
      const up = ev => {
        clearTimeout(timer);
        if (long || ev.type !== 'pointerup') return;
        const now = performance.now();
        if (!app.groups[i].some(e => !e.dead)) { ui.toast('Hold to assign the selection to group ' + (i + 1)); return; }
        recallGroup(i, lastGroupTap.i === i && now - lastGroupTap.t < 600);
        lastGroupTap.i = i; lastGroupTap.t = now;
      };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', () => clearTimeout(timer));
      gw.appendChild(b); el.groups.push(b);
    }
    buildMenus();
    applyScale();
    show('debug', app.settings.debug);
    app.sprites.paintIcon($('ico-ore'), 'shards', 0);
  },

  setMode(m) {
    app.mode = m;
    $('btn-mode').classList.toggle('camera', m === 'camera');
    $('mode-label').textContent = m === 'camera' ? 'Camera' : 'Select';
  },
  toast(msg) { el.toast.textContent = msg; el.toast.classList.remove('hidden'); toastT = 1.8; },
  alert(msg) { if (app.targeting || app.placing) return; el.banner.textContent = msg; el.banner.className = 'alert'; alertT = 3.5; },
  toggleDebug() { const s = app.settings; s.debug = !s.debug; $('set-debug').checked = s.debug; show('debug', s.debug); saveSettings(s); },
  togglePause() {
    if (!app.running || app.ended) return;
    app.paused = !app.paused;
    show('menu-pause', app.paused);
    if (!app.paused) { show('menu-settings', false); show('menu-howto', false); }
  },
  showGame(on) {
    show('hud', on); show('menu-main', !on);
    cardKey = panelKey = ''; toastT = alertT = 0;
    el.toast.classList.add('hidden'); el.banner.className = 'hidden';
    if (on) { ui.setMode('select'); app.sprites.paintIcon($('ico-ore'), 'shards', 0); }
  },
  showResult(won) {
    const g = app.game, me = g.players[app.human], foe = g.players[1 - app.human];
    const draw = g.winner < 0;
    $('result-title').textContent = draw ? 'Stalemate' : won ? 'Victory' : 'Defeat';
    const t = Math.floor(g.tick / TICK_RATE);
    $('result-sub').textContent = (draw ? 'Both sides are spent. ' : won ? 'The enemy line is broken. ' : 'Your last structure has fallen. ') + 'Match time ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    const row = (n, a, b) => '<tr><td>' + n + '</td><td>' + a + '</td><td>' + b + '</td></tr>';
    $('result-stats').innerHTML = '<tr><th></th><th>You</th><th>Enemy</th></tr>' + row('Shards mined', me.mined, foe.mined) +
      row('Units trained', me.trained, foe.trained) + row('Structures built', me.built, foe.built) + row('Kills', me.kills, foe.kills) + row('Losses', me.lost, foe.lost);
    show('menu-result', true);
  },

  update(dt) {
    const g = app.game;
    if (!g) return;
    frame++;
    if (toastT > 0 && (toastT -= dt) <= 0) el.toast.classList.add('hidden');
    if (alertT > 0 && (alertT -= dt) <= 0 && !app.targeting && !app.placing) el.banner.className = 'hidden';
    if (frame % 6 !== 0) return;
    const P = app.human, me = g.players[P];
    el.ore.textContent = me.ore;
    el.supply.textContent = me.supplyUsed + '/' + me.supplyCap;
    el.supply.classList.toggle('capped', me.supplyUsed >= me.supplyCap);
    const t = Math.floor(g.tick / TICK_RATE);
    el.clock.textContent = Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
    let idle = 0, army = 0;
    for (const u of g.units) if (u.owner === P) { if (u.def.role !== 'worker') army++; else if (u.ot === 'idle') idle++; }
    el.idle.textContent = idle; el.army.textContent = army;
    el.idle.parentNode.classList.toggle('pulse', idle > 0);

    // rebuild contextual UI only when something that affects it changed
    let ck = app.selVersion + '|' + (app.targeting || '') + '|' + (app.placing ? app.placing.what : '') + '|' + app.buildMenu + '|' + (me.ore / 25 | 0) + '|' + me.supplyUsed + '/' + me.supplyCap + '|' + g.buildings.length;
    let pk = app.selVersion + '';
    for (const e of app.sel) if (e.kind === 'building') { const s = (e.done ? 'd' : 'c') + e.queue.join(','); ck += s; pk += s; }
    if (ck !== cardKey) { cardKey = ck; rebuildCard(); }
    if (pk !== panelKey) { panelKey = pk; rebuildPanel(); refreshGroups(); }
    refreshPanel();
    if (frame % 30 === 0) refreshGroups();
    if (app.settings.debug && frame % 12 === 0) {
      const s = app.stats;
      el.debug.textContent = 'FPS ' + s.fps.toFixed(0) + '  frame ' + s.frameMs.toFixed(1) + 'ms  draw ' + s.renderMs.toFixed(1) + 'ms\n' +
        'tick ' + s.tickMs.toFixed(2) + 'ms (max ' + s.tickMax.toFixed(1) + ')\n' +
        'units ' + g.units.length + '  bld ' + g.buildings.length + '  proj ' + g.projectiles.length + '\n' +
        'paths/s ' + s.pathsPerSec + '  total ' + g.grid.queries + '\n' +
        'tick ' + g.tick + '  seed ' + g.seed + '  zoom ' + app.cam.zoom.toFixed(2);
    }
  },
};
