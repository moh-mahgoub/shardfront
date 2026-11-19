// Fog of war. Per player: 0 = unexplored, 1 = explored, 2 = currently visible.
// Also maintains each player's memory of enemy buildings ("seen"), which is what
// the renderer shows under fog and the only enemy-structure knowledge the AI has.
import { MAP_W, MAP_H, TILE } from '../data.js';

const halfWidths = [];   // halfWidths[r][dy + r] = half row width of a disc of radius r
for (let r = 0; r <= 12; r++) {
  const rows = new Int8Array(r * 2 + 1);
  for (let dy = -r; dy <= r; dy++) rows[dy + r] = Math.floor(Math.sqrt((r + 0.5) * (r + 0.5) - dy * dy));
  halfWidths.push(rows);
}

function reveal(fog, cx, cy, r) {
  const rows = halfWidths[r];
  for (let dy = -r; dy <= r; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= MAP_H) continue;
    const hw = rows[dy + r];
    let x0 = cx - hw, x1 = cx + hw;
    if (x0 < 0) x0 = 0; if (x1 >= MAP_W) x1 = MAP_W - 1;
    if (x1 >= x0) fog.fill(2, y * MAP_W + x0, y * MAP_W + x1 + 1);
  }
}

export function updateFog(g) {
  for (let pi = 0; pi < g.players.length; pi++) {
    const p = g.players[pi], fog = p.fog;
    for (let i = 0; i < fog.length; i++) if (fog[i] === 2) fog[i] = 1;
    for (let i = 0; i < g.units.length; i++) {
      const u = g.units[i];
      if (u.owner === pi && !u.dead) reveal(fog, (u.x / TILE) | 0, (u.y / TILE) | 0, u.def._sight);
    }
    for (let i = 0; i < g.buildings.length; i++) {
      const b = g.buildings[i];
      if (b.owner === pi && !b.dead) reveal(fog, (b.x / TILE) | 0, (b.y / TILE) | 0, b.done ? b.def._sight : 3);
    }
    // remember enemy structures we can see; forget ones we can see are gone
    for (let i = 0; i < g.buildings.length; i++) {
      const b = g.buildings[i];
      if (b.owner === pi || b.dead || !g.isVisible(pi, b)) continue;
      let m = p.seen.get(b.id);
      if (!m) { m = { id: b.id, type: b.type, owner: b.owner, x: b.x, y: b.y, tx: b.tx, ty: b.ty, size: b.size, def: b.def }; p.seen.set(b.id, m); }
    }
    for (const m of p.seen.values()) {
      const b = g.byId.get(m.id);
      if ((!b || b.dead) && fog[(m.ty + (m.size >> 1)) * MAP_W + m.tx + (m.size >> 1)] === 2) p.seen.delete(m.id);
    }
  }
}
