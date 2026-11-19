// Buildings: construction progress, production queues, rally points, turrets,
// plus the Lumen Choir's out-of-combat regeneration (runs for units as well).
import { DEFS, TILE, TICK_RATE, MAP_W } from '../data.js';
import { startMove } from './movement.js';
import { acquire, edgeDist, applyDamage, clearOrder } from './combat.js';
import { orderGather } from './units.js';

function spawnFrom(g, b, type) {
  const tx = b.rallyX >= 0 ? b.rallyX / TILE : b.x / TILE, ty = b.rallyX >= 0 ? b.rallyY / TILE : b.y / TILE + 4;
  const fi = g.grid.nearestFree(b.tx, b.ty, b.size, b.size, tx, ty, -1, 1);
  if (fi < 0) return null;
  const x = (fi % MAP_W + 0.5) * TILE, y = (((fi / MAP_W) | 0) + 0.5) * TILE;
  const u = g.addUnit(type, b.owner, x, y);
  u.facing = Math.atan2(y - b.y, x - b.x);
  g.players[b.owner].trained++;
  // rally
  const rt = b.rallyT ? g.byId.get(b.rallyT) : null;
  if (u.def.role === 'worker' && rt && !rt.dead && rt.kind === 'resource') orderGather(g, u, rt);
  else if (b.rallyX >= 0) {
    const k = b.rallyN++ % 16, a = k * 2.4, r = 10 + 9 * Math.sqrt(k);
    clearOrder(g, u); u.ot = 'move';
    u.ox = b.rallyX + Math.cos(a) * r; u.oy = b.rallyY + Math.sin(a) * r;
    startMove(u, u.ox, u.oy, null);
  } else if (u.def.role === 'worker') {
    const r = g.nearestResource(b.x, b.y, 12 * TILE);
    if (r) orderGather(g, u, r);
  } else {
    const dx = x - b.x, dy = y - b.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
    const k = b.rallyN++ % 12;
    u.ot = 'move'; u.ox = x + dx / d * (40 + k * 6) + (k % 3 - 1) * 26; u.oy = y + dy / d * (40 + k * 6) + ((k >> 1) % 3 - 1) * 26;
    startMove(u, u.ox, u.oy, null);
  }
  g.events.push({ t: 'trained', owner: b.owner, x, y, type });
  return u;
}

export function updateBuildings(g) {
  const list = g.buildings, tick = g.tick;
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (b.dead) continue;
    const d = b.def;
    if (!b.done) {
      b.bp++;
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 / d._bt);
      if (b.bp >= d._bt) {
        b.done = true;
        g.recomputeSupply();
        g.events.push({ t: 'built', owner: b.owner, x: b.x, y: b.y, type: b.type });
      }
      continue;
    }
    if (b.queue.length) {
      const ud = DEFS[b.queue[0]];
      if (b.prog < ud._bt) b.prog++;
      if (b.prog >= ud._bt && spawnFrom(g, b, b.queue[0])) { b.queue.shift(); b.prog = 0; }
    }
    if (d.damage) {
      if (b.cd > 0) b.cd--;
      let t = b.atk ? g.byId.get(b.atk) : null;
      if (t && (t.dead || edgeDist(b, t) > d._range + b.radius || !g.isVisible(b.owner, t))) { t = null; b.atk = 0; }
      if (!t && (tick + b.id) % 5 === 0) { t = acquireFromBuilding(g, b); b.atk = t ? t.id : 0; }
      if (t) {
        b.facing = Math.atan2(t.y - b.y, t.x - b.x);
        if (b.cd <= 0) {
          b.cd = d._cd; b.lastShot = tick;
          const pr = g.projPool.pop() || {};
          pr.x = pr.px = b.x; pr.y = pr.py = b.y; pr.tid = t.id; pr.tx = t.x; pr.ty = t.y;
          pr.def = d; pr.owner = b.owner; pr.src = b.id;
          g.projectiles.push(pr);
          g.events.push({ t: 'shot', x: b.x, y: b.y, type: b.type });
        }
      }
    }
  }

  // Regeneration mechanic, once per second.
  if (tick % TICK_RATE === 0) {
    for (const p of g.players) {
      const f = p.fdef;
      if (!f.regen) continue;
      const delay = f.regenDelay * TICK_RATE;
      for (const lst of [g.units, g.buildings]) for (let i = 0; i < lst.length; i++) {
        const e = lst[i];
        if (e.owner !== p.id || e.dead || e.hp >= e.maxHp || tick - e.lastHit < delay) continue;
        if (e.kind === 'building' && !e.done) continue;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * f.regen);
      }
    }
  }
}

function acquireFromBuilding(g, b) {
  // acquire() measures from the building centre to target edges
  const t = acquire(g, b, b.def._range + b.radius);
  return t && t.kind === 'unit' ? t : t;
}
