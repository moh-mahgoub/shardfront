// Per-unit order state machines: idle / move / attack-move / patrol / hold /
// attack / gather / build.
import { DEFS, TILE } from '../data.js';
import { startMove } from './movement.js';
import { autoEngage, engageTarget, edgeDist, clearOrder, kill, refund } from './combat.js';

export const GS_TO_RES = 0;
export const GS_MINING = 1;
export const GS_TO_BASE = 2;
export const GS_WAIT = 3;

const ADJ = 30;   // px from a footprint edge that counts as "touching"

function minerValid(g, r, self) {
  if (!r.miner || r.miner === self.id) return false;
  const m = g.byId.get(r.miner);
  return !!m && !m.dead && m.ot === 'gather' && m.gs === GS_MINING && m.res === r.id;
}

function findPatch(g, e, x, y, maxDist, onlyFree, exclude) {
  let best = null, bs = 1e18;
  const md = maxDist * maxDist;
  for (let i = 0; i < g.resources.length; i++) {
    const r = g.resources[i];
    if (r.dead || r === exclude) continue;
    const d = (r.x - x) * (r.x - x) + (r.y - y) * (r.y - y);
    if (d > md) continue;
    const busy = minerValid(g, r, e);
    if (onlyFree && busy) continue;
    const s = (e.x - r.x) * (e.x - r.x) + (e.y - r.y) * (e.y - r.y) + (busy ? 1e7 : 0);
    if (s < bs) { bs = s; best = r; }
  }
  return best;
}

export function orderGather(g, e, r) {
  clearOrder(g, e);
  e.ot = 'gather'; e.res = r.id; e.lastRes = r.id; e.ox = r.x; e.oy = r.y;
  e.noCollide = true;
  if (e.carrying > 0) { e.gs = GS_TO_BASE; e.base = 0; }
  else { e.gs = GS_TO_RES; startMove(e, r.x, r.y, r.foot); }
}

function retarget(g, e, r) {
  e.res = r.id; e.lastRes = r.id; e.ox = r.x; e.oy = r.y; e.gs = GS_TO_RES; e.fails = 0;
  startMove(e, r.x, r.y, r.foot);
}

function updateGather(g, e) {
  const d = e.def;
  let r = g.byId.get(e.res);
  if (r && r.dead) r = null;
  switch (e.gs) {
    case GS_WAIT:
      if (--e.timer <= 0) e.gs = GS_TO_RES;
      break;
    case GS_TO_RES: {
      if (!r) {
        const n = findPatch(g, e, e.ox, e.oy, 10 * TILE, false, null);
        if (n) retarget(g, e, n);
        else if (e.carrying) { e.gs = GS_TO_BASE; e.base = 0; }
        else clearOrder(g, e);
        break;
      }
      if (e.moving) break;
      if (edgeDist(e, r) <= ADJ) {
        if (minerValid(g, r, e)) {
          const alt = findPatch(g, e, r.x, r.y, 7 * TILE, true, r);
          if (alt) retarget(g, e, alt);
          else { e.gs = GS_WAIT; e.timer = 5; }
        } else {
          r.miner = e.id; e.gs = GS_MINING; e.timer = d._gather; e.fails = 0;
          e.facing = Math.atan2(r.y - e.y, r.x - e.x);
        }
      } else if (e.pathFail && ++e.fails > 3) clearOrder(g, e);
      else startMove(e, r.x, r.y, r.foot);
      break;
    }
    case GS_MINING:
      if (!r) { e.gs = GS_TO_RES; break; }
      if (--e.timer <= 0) {
        const amt = Math.min(d.carry, r.amount);
        r.amount -= amt; e.carrying = amt;
        if (r.miner === e.id) r.miner = 0;
        if (r.amount <= 0) kill(g, r, -1);
        e.gs = GS_TO_BASE; e.base = 0;
      }
      break;
    case GS_TO_BASE: {
      let b = e.base ? g.byId.get(e.base) : null;
      if (!b || b.dead) {
        b = g.nearestMain(e.owner, e.x, e.y);
        if (!b) { clearOrder(g, e); break; }
        e.base = b.id;
        startMove(e, b.x, b.y, b.foot);
        break;
      }
      if (e.moving) break;
      if (edgeDist(e, b) <= ADJ) {
        const p = g.players[e.owner];
        p.ore += e.carrying; p.mined += e.carrying; e.carrying = 0; e.fails = 0;
        if (r) { e.gs = GS_TO_RES; startMove(e, r.x, r.y, r.foot); }
        else e.gs = GS_TO_RES;
      } else if (e.pathFail && ++e.fails > 3) clearOrder(g, e);
      else startMove(e, b.x, b.y, b.foot);
      break;
    }
  }
}

function resumeAfterBuild(g, e) {
  const r = e.lastRes ? g.byId.get(e.lastRes) : null;
  if (r && !r.dead) orderGather(g, e, r); else clearOrder(g, e);
}

function updateBuild(g, e) {
  if (e.moving) return;
  const d = DEFS[e.bwhat];
  const half = d.size * TILE / 2;
  const cx = (e.btx + d.size / 2) * TILE, cy = (e.bty + d.size / 2) * TILE;
  let dx = Math.abs(e.x - cx) - half, dy = Math.abs(e.y - cy) - half;
  if (dx < 0) dx = 0; if (dy < 0) dy = 0;
  if (dx * dx + dy * dy <= 44 * 44) {
    if (g.canPlace(e.bwhat, e.btx, e.bty)) {
      g.addBuilding(e.bwhat, e.owner, e.btx, e.bty, false);
      g.players[e.owner].built++;
      e.bpaid = 0;
      g.events.push({ t: 'placed', owner: e.owner, x: cx, y: cy });
    } else {
      g.events.push({ t: 'error', owner: e.owner, msg: 'Site is blocked' });
    }
    resumeAfterBuild(g, e);          // clearOrder refunds if bpaid is still set
  } else if (e.pathFail || ++e.fails > 4) {
    g.events.push({ t: 'error', owner: e.owner, msg: 'Cannot reach site' });
    resumeAfterBuild(g, e);
  } else {
    startMove(e, cx, cy, { tx: e.btx, ty: e.bty, w: d.size, h: d.size });
  }
}

export function updateUnits(g) {
  const units = g.units;
  for (let i = 0; i < units.length; i++) {
    const e = units[i];
    if (e.dead) continue;
    if (e.cd > 0) e.cd--;
    switch (e.ot) {
      case 'idle':
        if (e.def.role === 'worker') break;
        if (!autoEngage(g, e, false, true) && e.chasing) {
          e.chasing = false;
          startMove(e, e.hx, e.hy, null);
        }
        break;
      case 'hold':
        autoEngage(g, e, true, false);
        break;
      case 'move':
        if (!e.moving) { e.ot = 'idle'; e.hx = e.x; e.hy = e.y; }
        break;
      case 'amove':
      case 'patrol':
        if (autoEngage(g, e, false, false)) break;
        if (e.chasing) { e.chasing = false; startMove(e, e.ox, e.oy, null); break; }
        if (!e.moving) {
          if (e.arrived) {
            if (e.ot === 'patrol') {
              const tx = e.ox, ty = e.oy;
              e.ox = e.p2x; e.oy = e.p2y; e.p2x = tx; e.p2y = ty;
              startMove(e, e.ox, e.oy, null);
            } else { e.ot = 'idle'; e.hx = e.x; e.hy = e.y; }
          } else startMove(e, e.ox, e.oy, null);
        }
        break;
      case 'attack': {
        const t = g.byId.get(e.otarget);
        if (!t || t.dead || t.owner === e.owner) { clearOrder(g, e); e.hx = e.x; e.hy = e.y; break; }
        if (!g.isVisible(e.owner, t)) {
          e.anchored = false;
          if (!e.moving) { clearOrder(g, e); e.hx = e.x; e.hy = e.y; }
          break;
        }
        engageTarget(g, e, t, true);
        break;
      }
      case 'gather': updateGather(g, e); break;
      case 'build': updateBuild(g, e); break;
    }
  }
}
