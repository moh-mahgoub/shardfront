// Player intent -> selection changes and simulation commands. Shared by touch,
// mouse, keyboard and HUD buttons.
import { DEFS, TILE, MAP_W, MAP_H } from '../data.js';
import { app, screenToWorldX, screenToWorldY, worldToScreenX, worldToScreenY } from './app.js';
import { fx } from './renderer.js';

const WORLD_PX = MAP_W * TILE;

export function clampCamera() {
  const c = app.cam, v = app.view;
  c.zoom = Math.min(2.2, Math.max(Math.max(0.42, v.h / (MAP_H * TILE + 400)), c.zoom));
  const mx = Math.min(WORLD_PX / 2, v.w / 2 / c.zoom - 120 / c.zoom), my = Math.min(WORLD_PX / 2, v.h / 2 / c.zoom - 150 / c.zoom);
  c.x = Math.min(WORLD_PX - mx, Math.max(mx, c.x));
  c.y = Math.min(WORLD_PX - my, Math.max(my, c.y));
}
export function centerOn(x, y) { app.cam.x = x; app.cam.y = y; app.cam.vx = app.cam.vy = 0; clampCamera(); }
export function zoomAt(sx, sy, factor) {
  const wx = screenToWorldX(sx), wy = screenToWorldY(sy);
  app.cam.zoom *= factor; clampCamera();
  app.cam.x += wx - screenToWorldX(sx); app.cam.y += wy - screenToWorldY(sy);
  clampCamera();
}

// ------------------------------------------------------------------ selection
export function setSelection(list) {
  for (const e of app.sel) e._sel = false;
  app.sel = list.filter(e => e && !e.dead);
  for (const e of app.sel) e._sel = true;
  app.selVersion++;
  app.buildMenu = false;
  if (app.targeting || app.placing) cancelModes();
}
export function pruneSelection() {
  let dirty = false;
  for (const e of app.sel) if (e.dead) { dirty = true; e._sel = false; }
  if (dirty) { app.sel = app.sel.filter(e => !e.dead); app.selVersion++; if (!app.sel.length) cancelModes(); }
}
export function ownUnits() { return app.sel.filter(e => e.kind === 'unit' && e.owner === app.human); }
export function ownBuildings() { return app.sel.filter(e => e.kind === 'building' && e.owner === app.human); }
function ids(list) { return list.map(e => e.id); }

function canSee(e) {
  const g = app.game;
  if (e.kind === 'resource') return g.players[app.human].fog[e.ty * MAP_W + e.tx] > 0;
  return e.owner === app.human || g.isVisible(app.human, e);
}

// Entity under a world point. `pad` (world px) makes fingers forgiving.
export function pickEntity(wx, wy, pad) {
  const g = app.game;
  let best = null, bd = 1e9;
  for (const u of g.units) {
    if (u.dead || !canSee(u)) continue;
    const d = Math.hypot(u.x - wx, u.y - wy) - u.radius;
    if (d < pad && d < bd) { bd = d; best = u; }
  }
  if (best) return best;
  for (const b of g.buildings) {
    if (b.dead || !canSee(b)) continue;
    if (Math.abs(b.x - wx) <= b.radius + pad * 0.3 && Math.abs(b.y - wy) <= b.radius + pad * 0.3) return b;
  }
  for (const r of g.resources) {
    if (r.dead || !canSee(r)) continue;
    if (Math.abs(r.x - wx) <= 16 + pad * 0.5 && Math.abs(r.y - wy) <= 16 + pad * 0.5) return r;
  }
  return null;
}

export function selectBox(x0, y0, x1, y1, add) {
  const ax = screenToWorldX(Math.min(x0, x1)), ay = screenToWorldY(Math.min(y0, y1));
  const bx = screenToWorldX(Math.max(x0, x1)), by = screenToWorldY(Math.max(y0, y1));
  const g = app.game;
  let list = g.units.filter(u => !u.dead && u.owner === app.human && u.x > ax - u.radius && u.x < bx + u.radius && u.y > ay - u.radius && u.y < by + u.radius);
  // prefer army over workers when both are boxed
  const army = list.filter(u => u.def.role !== 'worker');
  if (army.length) list = army;
  if (!list.length) list = g.buildings.filter(b => !b.dead && b.owner === app.human && b.x > ax && b.x < bx && b.y > ay && b.y < by);
  if (add) list = app.sel.filter(e => e.owner === app.human && !list.includes(e)).concat(list);
  if (list.length || !add) setSelection(list);
  if (list.length) app.sfx.play('select');
}

export function selectSameType(e) {
  const g = app.game, v = app.view;
  const src = e.kind === 'unit' ? g.units : g.buildings;
  const list = src.filter(o => !o.dead && o.owner === e.owner && o.type === e.type &&
    worldToScreenX(o.x) > -20 && worldToScreenX(o.x) < v.w + 20 && worldToScreenY(o.y) > -20 && worldToScreenY(o.y) < v.h + 20);
  setSelection(list);
  app.sfx.play('select');
}

export function selectIdleWorker() {
  const g = app.game;
  const idle = g.units.filter(u => !u.dead && u.owner === app.human && u.def.role === 'worker' && u.ot === 'idle');
  if (!idle.length) return;
  const cur = app.sel.length === 1 ? idle.indexOf(app.sel[0]) : -1;
  const u = idle[(cur + 1) % idle.length];
  setSelection([u]); centerOn(u.x, u.y); app.sfx.play('select');
}
export function selectArmy() {
  const list = app.game.units.filter(u => !u.dead && u.owner === app.human && u.def.role !== 'worker');
  if (list.length) { setSelection(list); app.sfx.play('select'); }
}

export function assignGroup(i) { app.groups[i] = app.sel.filter(e => e.owner === app.human).slice(); app.selVersion++; }
export function recallGroup(i, center) {
  const list = app.groups[i] = app.groups[i].filter(e => !e.dead);
  if (!list.length) return;
  setSelection(list); app.sfx.play('select');
  if (center) { let x = 0, y = 0; for (const e of list) { x += e.x; y += e.y; } centerOn(x / list.length, y / list.length); }
}

// ------------------------------------------------------------------ commands
function send(cmd) { cmd.p = app.human; app.game.issue(cmd); }

export function cancelModes() { app.targeting = null; app.placing = null; app.buildMenu = false; app.selVersion++; }

export function startTargeting(kind) { app.placing = null; app.targeting = kind; app.selVersion++; app.sfx.play('click'); }

export function startPlacing(what) {
  const d = DEFS[what];
  const why = app.game.whyNot(app.human, what);
  if (why) { app.ui.toast(why); app.sfx.play('error'); return; }
  app.targeting = null;
  const wx = app.hover.x >= 0 ? screenToWorldX(app.hover.x) : app.cam.x, wy = app.hover.x >= 0 ? screenToWorldY(app.hover.y) : app.cam.y;
  app.placing = { what, tx: 0, ty: 0, ok: false };
  movePlacement(wx, wy);
  app.selVersion++; app.sfx.play('click');
}
export function movePlacement(wx, wy) {
  const pl = app.placing; if (!pl) return;
  const s = DEFS[pl.what].size;
  pl.tx = Math.min(MAP_W - s, Math.max(0, Math.round(wx / TILE - s / 2)));
  pl.ty = Math.min(MAP_H - s, Math.max(0, Math.round(wy / TILE - s / 2)));
}
export function confirmPlacement() {
  const pl = app.placing; if (!pl) return;
  const g = app.game, d = DEFS[pl.what], fog = g.players[app.human].fog;
  let ok = g.canPlace(pl.what, pl.tx, pl.ty);
  for (let y = 0; y < d.size && ok; y++) for (let x = 0; x < d.size; x++) if (!fog[(pl.ty + y) * MAP_W + pl.tx + x]) ok = false;
  const why = ok ? g.whyNot(app.human, pl.what) : 'Cannot build there';
  if (why) { app.ui.toast(why); app.sfx.play('error'); return; }
  // nearest selected worker does the job
  const cx = (pl.tx + d.size / 2) * TILE, cy = (pl.ty + d.size / 2) * TILE;
  let best = null, bd = 1e18;
  for (const u of ownUnits()) {
    if (u.def.role !== 'worker') continue;
    const dd = (u.x - cx) ** 2 + (u.y - cy) ** 2 + (u.ot === 'build' ? 1e9 : 0);
    if (dd < bd) { bd = dd; best = u; }
  }
  if (!best) { cancelModes(); return; }
  send({ t: 'build', ids: [best.id], what: pl.what, tx: pl.tx, ty: pl.ty });
  fx.marker(cx, cy, '#ffd76a'); app.sfx.play('place');
  app.placing = null; app.buildMenu = false; app.selVersion++;
}

export function orderSimple(t) {
  const us = ownUnits(); if (!us.length) return;
  send({ t, ids: ids(us) }); app.sfx.play('order');
}

// Positional command from targeting mode (Move / Attack / Patrol / Rally buttons).
export function targetedCommand(wx, wy) {
  const kind = app.targeting; if (!kind) return;
  const e = pickEntity(wx, wy, 14 / app.cam.zoom);
  if (kind === 'rally') {
    const bs = ownBuildings();
    if (bs.length) { send({ t: 'rally', ids: ids(bs), x: wx, y: wy, target: e && e.kind === 'resource' ? e.id : 0 }); fx.marker(wx, wy, '#78ffa0'); app.sfx.play('order'); }
  } else {
    const us = ownUnits();
    if (us.length) {
      if (kind === 'amove' && e && e.owner >= 0 && e.owner !== app.human) { send({ t: 'attack', ids: ids(us), target: e.id }); fx.marker(e.x, e.y, '#ff5b4c'); app.sfx.play('attackOrder'); }
      else { send({ t: kind, ids: ids(us), x: wx, y: wy }); fx.marker(wx, wy, kind === 'move' ? '#69ff8f' : kind === 'amove' ? '#ff5b4c' : '#7fd4ff'); app.sfx.play(kind === 'amove' ? 'attackOrder' : 'order'); }
    }
  }
  app.targeting = null; app.selVersion++;
}

// "Smart" command: what a right-click (or a tap with units selected) means here.
export function smartCommand(wx, wy, e) {
  const us = ownUnits();
  if (us.length) {
    if (e && e.owner >= 0 && e.owner !== app.human) { send({ t: 'attack', ids: ids(us), target: e.id }); fx.marker(e.x, e.y, '#ff5b4c'); app.sfx.play('attackOrder'); }
    else if (e && e.kind === 'resource') { send({ t: 'gather', ids: ids(us), target: e.id }); fx.marker(e.x, e.y, '#ffe36b'); app.sfx.play('order'); }
    else { send({ t: 'move', ids: ids(us), x: wx, y: wy }); fx.marker(wx, wy, '#69ff8f'); app.sfx.play('order'); }
    return true;
  }
  const bs = ownBuildings().filter(b => b.def.trains);
  if (bs.length) {
    send({ t: 'rally', ids: ids(bs), x: wx, y: wy, target: e && e.kind === 'resource' ? e.id : 0 });
    fx.marker(wx, wy, '#78ffa0'); app.sfx.play('order');
    return true;
  }
  return false;
}

export function train(what) {
  const bs = ownBuildings().filter(b => b.done && b.def.trains && b.def.trains.includes(what));
  if (!bs.length) return;
  const why = app.game.whyNot(app.human, what);
  if (why) { app.ui.toast(why); app.sfx.play('error'); return; }
  bs.sort((a, b) => a.queue.length - b.queue.length);          // shortest queue first
  send({ t: 'train', id: bs[0].id, what }); app.sfx.play('click');
}
export function cancelProduction() {
  const bs = ownBuildings();
  let b = bs.find(x => !x.done) || bs.slice().sort((a, c) => c.queue.length - a.queue.length)[0];
  if (b) { send({ t: 'cancel', id: b.id }); app.sfx.play('click'); }
}
