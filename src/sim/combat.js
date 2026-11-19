// Combat: target acquisition, engagement, damage, death, projectiles.
import { DEFS, TILE, TICK_RATE, MAP_W } from '../data.js';
import { startMove, haltMove } from './movement.js';

const LEASH = 10 * TILE;

// Distance from point-like attacker to the edge of a target (rect for structures).
export function edgeDist(e, t) {
  if (t.kind === 'unit') {
    const dx = t.x - e.x, dy = t.y - e.y;
    return Math.sqrt(dx * dx + dy * dy) - t.radius;
  }
  const half = t.radius;
  let dx = Math.abs(e.x - t.x) - half, dy = Math.abs(e.y - t.y) - half;
  if (dx < 0) dx = 0; if (dy < 0) dy = 0;
  return Math.sqrt(dx * dx + dy * dy);
}

export function refund(g, owner, amount) { g.players[owner].ore += Math.round(amount); }

// Clears whatever the unit was doing (refunding a reserved building, freeing a patch).
export function clearOrder(g, e) {
  if (e.bpaid) { refund(g, e.owner, e.bpaid); e.bpaid = 0; }
  if (e.ot === 'gather') {
    const r = g.byId.get(e.res);
    if (r && r.miner === e.id) r.miner = 0;
  }
  e.ot = 'idle'; e.atk = 0; e.otarget = 0; e.chasing = false;
  e.noCollide = false; e.anchored = false; e.fails = 0;
  haltMove(e); e.arrived = true;
}

export function kill(g, t, byOwner) {
  if (t.dead) return;
  t.dead = true;
  if (t.kind === 'resource') { g.grid.setRect(t.tx, t.ty, 1, 1, 0); return; }
  const p = g.players[t.owner];
  p.lost++;
  if (byOwner >= 0 && byOwner !== t.owner) g.players[byOwner].kills++;
  if (t.kind === 'unit') {
    clearOrder(g, t);
    p.supplyUsed -= t.def.supply;
    if (p.fdef.salvage) refund(g, t.owner, t.def.cost * p.fdef.salvage);
  } else {
    g.grid.setRect(t.tx, t.ty, t.size, t.size, 0);
    for (let i = 0; i < t.queue.length; i++) p.supplyUsed -= DEFS[t.queue[i]].supply;
    t.queue.length = 0;
    g.recomputeSupply();
  }
  g.events.push({ t: 'death', x: t.x, y: t.y, kind: t.kind, size: t.radius, owner: t.owner, type: t.type });
}

export function applyDamage(g, srcDef, srcOwner, srcId, t, scale) {
  if (t.dead) return;
  let dmg = srcDef.damage + (srcDef.bonus[t.def.armorType] || 0) - t.def.armor;
  if (dmg < 1) dmg = 1;
  t.hp -= dmg * scale;
  t.lastHit = g.tick;
  const p = g.players[t.owner];
  if (g.tick - p.lastAlert > 12 * TICK_RATE && (t.kind === 'building' || t.def.role === 'worker')) {
    p.lastAlert = g.tick;
    g.events.push({ t: 'alert', owner: t.owner, x: t.x, y: t.y });
  }
  if (t.hp <= 0) { kill(g, t, srcOwner); return; }
  // retaliate if idle and unarmed-free
  if (t.kind === 'unit' && t.ot === 'idle' && !t.atk && t.def.role !== 'worker' && srcId) {
    const a = g.byId.get(srcId);
    if (a && !a.dead) { t.atk = srcId; t.hx = t.x; t.hy = t.y; }
  }
}

function fire(g, e, t) {
  const d = e.def;
  e.cd = d._cd; e.lastShot = g.tick;
  if (d._proj) {
    const pr = g.projPool.pop() || {};
    pr.x = pr.px = e.x; pr.y = pr.py = e.y; pr.tid = t.id; pr.tx = t.x; pr.ty = t.y;
    pr.def = d; pr.owner = e.owner; pr.src = e.id;
    g.projectiles.push(pr);
    g.events.push({ t: 'shot', x: e.x, y: e.y, type: e.type });
  } else {
    g.events.push({ t: 'melee', x: t.x, y: t.y, type: e.type });
    applyDamage(g, d, e.owner, e.id, t, 1);
  }
}

export function updateProjectiles(g) {
  const list = g.projectiles;
  let n = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    p.px = p.x; p.py = p.y;
    const t = g.byId.get(p.tid);
    if (t && !t.dead) { p.tx = t.x; p.ty = t.y; }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.sqrt(dx * dx + dy * dy), spd = p.def._proj;
    if (d <= spd) {
      if (t && !t.dead) applyDamage(g, p.def, p.owner, p.src, t, 1);
      if (p.def.splash) {
        const near = g.hash.query(p.tx, p.ty, p.def.splash + 16);
        for (let j = 0; j < near.length; j++) {
          const o = near[j];
          if (o === t || o.dead || o.owner === p.owner || o.kind !== 'unit') continue;
          const ox = o.x - p.tx, oy = o.y - p.ty;
          if (ox * ox + oy * oy <= p.def.splash * p.def.splash) applyDamage(g, p.def, p.owner, 0, o, 0.5);
        }
      }
      g.events.push({ t: 'hit', x: p.tx, y: p.ty, splash: p.def.splash || 0 });
      g.projPool.push(p);
    } else {
      p.x += dx / d * spd; p.y += dy / d * spd;
      list[n++] = p;
    }
  }
  list.length = n;
}

// Best visible enemy within `range` px (edge distance). Prefers things that shoot back.
export function acquire(g, e, range) {
  const near = g.hash.query(e.x, e.y, range + 72);
  const fog = g.players[e.owner].fog;
  let best = null, bs = 1e9;
  for (let i = 0; i < near.length; i++) {
    const t = near[i];
    if (t.owner === e.owner || t.dead) continue;
    const d = edgeDist(e, t);
    if (d > range) continue;
    if (t.kind === 'unit') { if (fog[((t.y / TILE) | 0) * MAP_W + ((t.x / TILE) | 0)] !== 2) continue; }
    else if (!g.isVisible(e.owner, t)) continue;
    let s = d;
    if (t.kind === 'building') s += t.def.damage ? 40 : 2000;
    else if (t.def.role === 'worker') s += 300;
    if (s < bs) { bs = s; best = t; }
  }
  return best;
}

// Attack `t` if in range, otherwise (optionally) chase it. Returns nothing.
export function engageTarget(g, e, t, canMove) {
  const d = e.def;
  const reach = d._range + (d._proj ? 0 : e.radius * 0.5);
  if (edgeDist(e, t) <= reach) {
    if (e.moving) haltMove(e);
    e.anchored = true;
    e.facing = Math.atan2(t.y - e.y, t.x - e.x);
    if (e.cd <= 0) fire(g, e, t);
  } else {
    e.anchored = false;
    if (canMove) {
      const gdx = e.gx - t.x, gdy = e.gy - t.y;
      if (!e.moving || (g.tick >= e.repathAt && gdx * gdx + gdy * gdy > TILE * TILE)) {
        startMove(e, t.x, t.y, t.kind === 'unit' ? null : t.foot);
        e.repathAt = g.tick + 10;
      }
      e.chasing = true;
    }
  }
}

// Shared auto-targeting for idle / hold / attack-move units. Returns true while engaged.
export function autoEngage(g, e, hold, leash) {
  const d = e.def;
  let t = e.atk ? g.byId.get(e.atk) : null;
  if (t) {
    if (t.dead || !g.isVisible(e.owner, t)) t = null;
    else if (hold && edgeDist(e, t) > d._range + e.radius) t = null;
    else if (leash) {
      const hx = e.x - e.hx, hy = e.y - e.hy;
      if (hx * hx + hy * hy > LEASH * LEASH) t = null;
    }
  }
  if (!t) e.atk = 0;
  if (!t && (g.tick + e.id) % 5 === 0) {
    const r = hold ? d._range + e.radius * 0.5 : Math.max(d._sight * TILE * 0.85, d._range + TILE);
    t = acquire(g, e, r);
    if (t) {
      if (!e.chasing) { e.hx = e.x; e.hy = e.y; }
      e.atk = t.id;
    }
  }
  if (!t) { e.anchored = false; return false; }
  engageTarget(g, e, t, !hold);
  return true;
}
