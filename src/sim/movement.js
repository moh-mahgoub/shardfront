// Movement system: budgeted A* requests, waypoint following, soft separation
// steering (so groups neither stack nor deadlock), tile collision with sliding,
// and stuck detection (re-path, then "close enough" arrival, then give up).
import { TILE, MAP_W, MAP_H } from '../data.js';

const PATHS_PER_TICK = 48;
const WORLD_W = MAP_W * TILE, WORLD_H = MAP_H * TILE;

export function startMove(e, x, y, foot) {
  e.moving = true; e.arrived = false; e.pathFail = false;
  e.gx = x; e.gy = y; e.gfoot = foot || null;
  e.needPath = true; e.path = null; e.pi = 0; e.stuckN = 0;
}
export function haltMove(e) { e.moving = false; e.path = null; e.needPath = false; }
function finishMove(e) { e.moving = false; e.arrived = true; e.path = null; e.needPath = false; }

export function updateMovement(g) {
  const units = g.units, grid = g.grid, hash = g.hash, tick = g.tick;
  let budget = PATHS_PER_TICK;

  // ---- phase 1: desired velocity from paths, plus separation ----
  for (let i = 0; i < units.length; i++) {
    const e = units[i];
    if (e.dead) continue;
    let vx = 0, vy = 0;
    const spd = e.def._spd;
    if (e.moving) {
      if (e.needPath && budget > 0) {
        budget--;
        const p = grid.findPath(e.x, e.y, e.gx, e.gy, e.gfoot);
        e.needPath = false;
        if (p) { e.path = p; e.pi = 0; }
        else { finishMove(e); e.pathFail = true; g.stats.pathFails++; }
      }
      const path = e.path;
      if (path) {
        const dx = path[e.pi] - e.x, dy = path[e.pi + 1] - e.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d <= spd) {
          vx = dx; vy = dy;
          e.pi += 2;
          if (e.pi >= path.length) finishMove(e);
        } else { vx = dx / d * spd; vy = dy / d * spd; }
        if (d > 0.5) e.facing = Math.atan2(dy, dx);
      }
    }
    if (!e.noCollide) {
      const near = hash.query(e.x, e.y, e.radius + 16);
      let pxs = 0, pys = 0;
      for (let j = 0; j < near.length; j++) {
        const n = near[j];
        if (n === e || n.kind !== 'unit' || n.dead || n.noCollide) continue;
        const dx = e.x - n.px, dy = e.y - n.py;       // n.px = position at tick start (order independent)
        const min = e.radius + n.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        let w;
        if (e.anchored) w = n.anchored ? 0.5 : 0.1;
        else if (n.anchored) w = 0.9;
        else if (e.moving) w = n.moving ? 0.5 : 0.3;
        else w = n.moving ? 0.7 : 0.5;
        if (d2 < 0.01) {
          const a = (e.id * 2.399963) % 6.2832;
          pxs += Math.cos(a) * min * w; pys += Math.sin(a) * min * w;
        } else {
          const d = Math.sqrt(d2), o = (min - d) * w / d;
          pxs += dx * o; pys += dy * o;
        }
      }
      const pm = pxs * pxs + pys * pys, cap = spd * 1.2 + 1;
      if (pm > cap * cap) { const s = cap / Math.sqrt(pm); pxs *= s; pys *= s; }
      vx += pxs * 0.8; vy += pys * 0.8;
    }
    e.sx = vx; e.sy = vy;
  }

  // ---- phase 2: integrate with tile collision ----
  for (let i = 0; i < units.length; i++) {
    const e = units[i];
    if (e.dead) continue;
    const tx0 = (e.x / TILE) | 0, ty0 = (e.y / TILE) | 0;
    if (grid.blocked[ty0 * MAP_W + tx0]) {
      // Standing inside a blocked tile (e.g. a building was just placed here): walk out.
      const fi = grid.nearestFree(tx0, ty0, 1, 1, e.x / TILE, e.y / TILE, -1, 1);
      if (fi >= 0) {
        const fx = (fi % MAP_W + 0.5) * TILE, fy = (((fi / MAP_W) | 0) + 0.5) * TILE;
        const dx = fx - e.x, dy = fy - e.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        const s = Math.max(e.def._spd, 3);
        e.x += dx / d * s; e.y += dy / d * s;
      }
    } else if (e.sx !== 0 || e.sy !== 0) {
      let nx = e.x + e.sx, ny = e.y + e.sy;
      if (nx < 4) nx = 4; else if (nx > WORLD_W - 4) nx = WORLD_W - 4;
      if (ny < 4) ny = 4; else if (ny > WORLD_H - 4) ny = WORLD_H - 4;
      const ntx = (nx / TILE) | 0, nty = (ny / TILE) | 0;
      if (!grid.blocked[nty * MAP_W + ntx]) { e.x = nx; e.y = ny; }
      else if (!grid.blocked[ty0 * MAP_W + ntx]) { e.x = nx; }
      else if (!grid.blocked[nty * MAP_W + tx0]) { e.y = ny; }
    }

    // stuck detection, staggered across units
    if (e.moving && (tick + e.id) % 10 === 0) {
      if (e.path) {
        const mx = e.x - e.lx, my = e.y - e.ly;
        const need = e.def._spd * 2.5;
        if (mx * mx + my * my < need * need) {
          e.stuckN++;
          if (e.stuckN > g.stats.maxStuck) g.stats.maxStuck = e.stuckN;
          const gd = Math.sqrt((e.gx - e.x) * (e.gx - e.x) + (e.gy - e.y) * (e.gy - e.y));
          if (gd < TILE * (1.5 + e.stuckN)) finishMove(e);            // crowded destination: close enough
          else if (e.stuckN >= 8) { finishMove(e); g.stats.stuckGiveUps++; }
          else if (e.stuckN >= 2) e.needPath = true;
        } else e.stuckN = 0;
      }
      e.lx = e.x; e.ly = e.y;
    }
  }
}
