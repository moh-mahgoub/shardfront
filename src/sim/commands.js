// Command application. Commands are plain serialisable objects — the ONLY way the
// UI and the AI may change the simulation — so a command log is a full replay.
//   { t:'move'|'amove'|'patrol', p, ids, x, y }
//   { t:'attack'|'gather', p, ids, target }      { t:'stop'|'hold', p, ids }
//   { t:'build', p, ids:[worker], what, tx, ty } { t:'train', p, id, what }
//   { t:'cancel', p, id }                        { t:'rally', p, ids, x, y, target }
import { DEFS, TILE, MAP_W, MAP_H, CANCEL_REFUND, MAX_QUEUE } from '../data.js';
import { startMove } from './movement.js';
import { clearOrder, kill, refund } from './combat.js';
import { orderGather } from './units.js';

const cmdUnits = [];

function collect(g, c) {
  cmdUnits.length = 0;
  const ids = c.ids || [];
  for (let i = 0; i < ids.length; i++) {
    const e = g.byId.get(ids[i]);
    if (e && !e.dead && e.owner === c.p && e.kind === 'unit') cmdUnits.push(e);
  }
  return cmdUnits;
}

// Keep the group's shape when it is compact, otherwise pack into a spiral.
function groupMove(g, us, x, y, ot) {
  const n = us.length;
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += us[i].x; cy += us[i].y; }
  cx /= n; cy /= n;
  const maxOff = 14 + Math.sqrt(n) * 16;
  let compact = n > 1;
  for (let i = 0; i < n && compact; i++) {
    const dx = us[i].x - cx, dy = us[i].y - cy;
    if (dx * dx + dy * dy > maxOff * maxOff * 2.2) compact = false;
  }
  const W = MAP_W * TILE - 8, H = MAP_H * TILE - 8;
  for (let i = 0; i < n; i++) {
    const e = us[i];
    let ox = 0, oy = 0;
    if (compact) { ox = e.x - cx; oy = e.y - cy; }
    else if (n > 1) { const a = i * 2.39996, r = 13 * Math.sqrt(i); ox = Math.cos(a) * r; oy = Math.sin(a) * r; }
    let tx = Math.min(W, Math.max(8, x + ox)), ty = Math.min(H, Math.max(8, y + oy));
    if (g.grid.blockedAtPx(tx, ty)) { tx = x; ty = y; }
    clearOrder(g, e);
    e.ot = ot; e.ox = tx; e.oy = ty;
    if (ot === 'patrol') { e.p2x = e.x; e.p2y = e.y; }
    startMove(e, tx, ty, null);
  }
}

export function applyCommand(g, c) {
  const p = g.players[c.p];
  if (!p) return;
  switch (c.t) {
    case 'move': case 'amove': case 'patrol': {
      const us = collect(g, c);
      if (us.length) groupMove(g, us, c.x, c.y, c.t);
      break;
    }
    case 'stop': case 'hold': {
      const us = collect(g, c);
      for (let i = 0; i < us.length; i++) {
        clearOrder(g, us[i]); us[i].hx = us[i].x; us[i].hy = us[i].y;
        if (c.t === 'hold') us[i].ot = 'hold';
      }
      break;
    }
    case 'attack': {
      const t = g.byId.get(c.target);
      if (!t || t.dead || t.owner === c.p || t.kind === 'resource') break;
      const us = collect(g, c);
      for (let i = 0; i < us.length; i++) {
        const e = us[i];
        clearOrder(g, e);
        e.ot = 'attack'; e.otarget = t.id;
      }
      break;
    }
    case 'gather': {
      const r = g.byId.get(c.target);
      if (!r || r.dead || r.kind !== 'resource') break;
      const us = collect(g, c);
      for (let i = 0; i < us.length; i++) {
        const e = us[i];
        if (e.def.role === 'worker') orderGather(g, e, r);
        else { clearOrder(g, e); e.ot = 'move'; e.ox = r.x; e.oy = r.y; startMove(e, r.x, r.y, r.foot); }
      }
      break;
    }
    case 'build': {
      const us = collect(g, c);
      const d = DEFS[c.what];
      let e = null;
      for (let i = 0; i < us.length; i++) if (us[i].def.role === 'worker') { e = us[i]; break; }
      if (!e || !d || d.kind !== 'building') break;
      const why = g.whyNot(c.p, c.what) || (g.canPlace(c.what, c.tx, c.ty) ? '' : 'Cannot build there');
      if (why) { g.events.push({ t: 'error', owner: c.p, msg: why }); break; }
      const keep = e.ot === 'gather' ? e.res : e.lastRes;
      clearOrder(g, e);
      p.ore -= d.cost;
      e.ot = 'build'; e.bwhat = c.what; e.btx = c.tx; e.bty = c.ty; e.bpaid = d.cost; e.lastRes = keep; e.fails = 0;
      startMove(e, (c.tx + d.size / 2) * TILE, (c.ty + d.size / 2) * TILE, { tx: c.tx, ty: c.ty, w: d.size, h: d.size });
      break;
    }
    case 'train': {
      const b = g.byId.get(c.id);
      const d = DEFS[c.what];
      if (!b || b.dead || b.owner !== c.p || b.kind !== 'building' || !b.done || !d) break;
      if (!b.def.trains || b.def.trains.indexOf(c.what) < 0) break;
      const why = b.queue.length >= MAX_QUEUE ? 'Queue is full' : g.whyNot(c.p, c.what);
      if (why) { g.events.push({ t: 'error', owner: c.p, msg: why }); break; }
      p.ore -= d.cost; p.supplyUsed += d.supply;
      b.queue.push(c.what);
      break;
    }
    case 'cancel': {
      const b = g.byId.get(c.id);
      if (!b || b.dead || b.owner !== c.p || b.kind !== 'building') break;
      if (!b.done) {
        refund(g, c.p, b.def.cost * CANCEL_REFUND);
        kill(g, b, -1);
      } else if (b.queue.length) {
        const d = DEFS[b.queue.pop()];
        refund(g, c.p, d.cost); p.supplyUsed -= d.supply;
        if (!b.queue.length) b.prog = 0;
      }
      break;
    }
    case 'rally': {
      const ids = c.ids || [];
      for (let i = 0; i < ids.length; i++) {
        const b = g.byId.get(ids[i]);
        if (!b || b.dead || b.owner !== c.p || b.kind !== 'building' || !b.def.trains) continue;
        b.rallyX = c.x; b.rallyY = c.y; b.rallyT = c.target || 0; b.rallyN = 0;
      }
      break;
    }
  }
}
