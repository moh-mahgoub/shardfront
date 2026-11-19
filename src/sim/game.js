// The simulation root. No DOM access anywhere under src/sim — this runs in Node too.
// Fixed timestep: call step() exactly TICK_RATE times per simulated second.
// Determinism: all randomness comes from this.rng, all input arrives as commands
// through issue(), which are logged in this.replay.
import { DEFS, FACTIONS, TILE, MAP_W, MAP_H, START_ORE, START_WORKERS, PATCH_AMOUNT, SUPPLY_MAX } from '../data.js';
import { RNG } from './rng.js';
import { generateMap } from './map.js';
import { NavGrid } from './pathfinding.js';
import { SpatialHash } from './spatial.js';
import { applyCommand } from './commands.js';
import { updateUnits } from './units.js';
import { updateBuildings } from './buildings.js';
import { updateMovement } from './movement.js';
import { updateProjectiles } from './combat.js';
import { updateFog } from './fog.js';
import { AIController } from './ai.js';

export class Game {
  // opts: { seed, players: [{ faction, ai: null | 'easy' | 'normal' | 'hard' }, ...] }
  constructor(opts) {
    this.seed = (opts.seed >>> 0) || 1;
    this.rng = new RNG(this.seed);
    this.map = generateMap(this.seed);
    this.grid = new NavGrid(MAP_W, MAP_H, this.map.terrain);
    this.hash = new SpatialHash(64, MAP_W * TILE, MAP_H * TILE);
    this.units = []; this.buildings = []; this.resources = [];
    this.byId = new Map();
    this.nextId = 1;
    this.projectiles = []; this.projPool = [];
    this.events = [];          // presentation-only events (sounds, effects, alerts)
    this.cmds = [];
    this.replay = [];
    this.recordReplay = !!opts.recordReplay;
    this.tick = 0;
    this.over = false; this.winner = -1;
    this.pathBudget = 0;
    this.stats = { stuckGiveUps: 0, maxStuck: 0, pathFails: 0 };

    this.players = opts.players.map((p, i) => ({
      id: i, faction: p.faction, fdef: FACTIONS[p.faction], ore: START_ORE,
      supplyUsed: 0, supplyCap: 0,
      fog: new Uint8Array(MAP_W * MAP_H), seen: new Map(),
      lastAlert: -9999, kills: 0, lost: 0, mined: 0, trained: 0, built: 0, ai: null,
    }));

    for (const r of this.map.resources) this.addResource(r.tx, r.ty, PATCH_AMOUNT);
    for (const p of this.players) {
      const site = this.map.bases[p.id][0];
      const main = this.addBuilding(p.fdef.roles.main, p.id, site.tx, site.ty, true);
      const dir = p.id === 0 ? -1 : 1;
      for (let i = 0; i < START_WORKERS; i++) {
        const u = this.addUnit(p.fdef.roles.worker, p.id, main.x + (i - 2) * 22, main.y + dir * (main.radius + 20));
        p.supplyUsed += u.def.supply;
      }
    }
    this.recomputeSupply();
    updateFog(this);
    opts.players.forEach((p, i) => { if (p.ai) this.players[i].ai = new AIController(this, i, p.ai); });
    // workers start mining right away
    for (const u of this.units) {
      const r = this.nearestResource(u.x, u.y, 12 * TILE);
      if (r) applyCommand(this, { t: 'gather', p: u.owner, ids: [u.id], target: r.id });
    }
  }

  // ---------------------------------------------------------------- entities
  addUnit(type, owner, x, y) {
    const d = DEFS[type];
    const e = {
      id: this.nextId++, kind: 'unit', type, def: d, owner, x, y, px: x, py: y,
      hp: d.hp, maxHp: d.hp, radius: d.radius, dead: false, facing: owner ? Math.PI * 0.75 : -Math.PI * 0.25,
      ot: 'idle', ox: x, oy: y, otarget: 0, p2x: 0, p2y: 0, hx: x, hy: y, chasing: false,
      moving: false, arrived: true, pathFail: false, gx: x, gy: y, gfoot: null, path: null, pi: 0,
      needPath: false, repathAt: 0, stuckN: 0, lx: x, ly: y, fails: 0,
      atk: 0, cd: 0, anchored: false, lastHit: -9999, lastShot: -9999,
      gs: 0, carrying: 0, res: 0, base: 0, timer: 0, lastRes: 0,
      bwhat: null, btx: 0, bty: 0, bpaid: 0,
      sx: 0, sy: 0, noCollide: false,
    };
    this.units.push(e); this.byId.set(e.id, e);
    return e;
  }

  addBuilding(type, owner, tx, ty, done) {
    const d = DEFS[type];
    const e = {
      id: this.nextId++, kind: 'building', type, def: d, owner, tx, ty, size: d.size,
      x: (tx + d.size / 2) * TILE, y: (ty + d.size / 2) * TILE, px: 0, py: 0,
      hp: done ? d.hp : d.hp * 0.1, maxHp: d.hp, radius: d.radius, dead: false,
      done: !!done, bp: done ? d._bt : 0, queue: [], prog: 0,
      rallyX: -1, rallyY: -1, rallyT: 0, rallyN: 0,
      atk: 0, cd: 0, lastHit: -9999, lastShot: -9999, facing: 0,
      foot: { tx, ty, w: d.size, h: d.size },
    };
    e.px = e.x; e.py = e.y;
    this.buildings.push(e); this.byId.set(e.id, e);
    this.grid.setRect(tx, ty, d.size, d.size, 2);
    return e;
  }

  addResource(tx, ty, amount) {
    const e = {
      id: this.nextId++, kind: 'resource', type: 'shards', owner: -1, tx, ty,
      x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, radius: TILE / 2, amount, max: amount, dead: false,
      miner: 0, foot: { tx, ty, w: 1, h: 1 },
    };
    this.resources.push(e); this.byId.set(e.id, e);
    this.grid.setRect(tx, ty, 1, 1, 2);
    return e;
  }

  nearestResource(x, y, maxDist) {
    let best = null, bd = maxDist * maxDist;
    for (let i = 0; i < this.resources.length; i++) {
      const r = this.resources[i];
      if (r.dead) continue;
      const d = (r.x - x) * (r.x - x) + (r.y - y) * (r.y - y);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  nearestMain(owner, x, y) {
    let best = null, bd = 1e18;
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.dead || b.owner !== owner || !b.done || b.def.role !== 'main') continue;
      const d = (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  // ---------------------------------------------------------------- rules
  hasBuilding(owner, type) {
    for (let i = 0; i < this.buildings.length; i++) {
      const b = this.buildings[i];
      if (b.owner === owner && b.type === type && b.done && !b.dead) return true;
    }
    return false;
  }
  // '' when allowed, otherwise a short human-readable reason
  whyNot(owner, what) {
    const d = DEFS[what], p = this.players[owner];
    if (!d || d.faction !== p.faction) return 'Unavailable';
    if (d.requires && !this.hasBuilding(owner, d.requires)) return 'Requires ' + DEFS[d.requires].name;
    if (p.ore < d.cost) return 'Not enough shards';
    if (d.kind === 'unit' && p.supplyUsed + d.supply > p.supplyCap) return 'Supply cap reached';
    return '';
  }
  canPlace(what, tx, ty) { return this.grid.rectFree(tx, ty, DEFS[what].size, DEFS[what].size); }

  recomputeSupply() {
    for (const p of this.players) p.supplyCap = 0;
    for (const b of this.buildings) if (!b.dead && b.done && b.def.supplyCap) this.players[b.owner].supplyCap += b.def.supplyCap;
    for (const p of this.players) if (p.supplyCap > SUPPLY_MAX) p.supplyCap = SUPPLY_MAX;
  }

  isVisible(pid, e) {
    const fog = this.players[pid].fog;
    if (e.kind === 'building') {
      const x0 = e.tx, y0 = e.ty, s = e.size - 1;
      return fog[y0 * MAP_W + x0] === 2 || fog[y0 * MAP_W + x0 + s] === 2 ||
        fog[(y0 + s) * MAP_W + x0] === 2 || fog[(y0 + s) * MAP_W + x0 + s] === 2;
    }
    return fog[((e.y / TILE) | 0) * MAP_W + ((e.x / TILE) | 0)] === 2;
  }

  // ---------------------------------------------------------------- tick
  issue(cmd) { this.cmds.push(cmd); }

  step() {
    if (this.over) return;
    const units = this.units, hash = this.hash;
    hash.clear();
    for (let i = 0; i < units.length; i++) { const u = units[i]; u.px = u.x; u.py = u.y; hash.insert(u); }
    for (let i = 0; i < this.buildings.length; i++) hash.insert(this.buildings[i]);

    if (this.cmds.length) {
      const cmds = this.cmds; this.cmds = [];
      for (let i = 0; i < cmds.length; i++) {
        if (this.recordReplay) this.replay.push({ tick: this.tick, cmd: cmds[i] });
        applyCommand(this, cmds[i]);
      }
    }
    for (let i = 0; i < this.players.length; i++) { const ai = this.players[i].ai; if (ai) ai.think(); }

    updateBuildings(this);
    updateUnits(this);
    updateMovement(this);
    updateProjectiles(this);
    if (this.tick % 4 === 0) updateFog(this);
    this.sweep();
    if (this.tick % 10 === 0) this.checkWin();
    this.tick++;
  }

  sweep() {
    for (const list of [this.units, this.buildings, this.resources]) {
      let n = 0;
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.dead) this.byId.delete(e.id); else list[n++] = e;
      }
      list.length = n;
    }
  }

  checkWin() {
    const alive = [0, 0];
    for (const b of this.buildings) if (!b.dead) alive[b.owner]++;
    if (alive[0] === 0 || alive[1] === 0) {
      this.over = true;
      this.winner = alive[0] === 0 ? (alive[1] === 0 ? -1 : 1) : 0;
      this.events.push({ t: 'over', winner: this.winner });
      return;
    }
    // Draw by exhaustion: nobody has a unit, a queued unit, or the shards to train one.
    if (this.tick % 200 !== 0) return;
    const spent = [true, true];
    for (const u of this.units) spent[u.owner] = false;
    for (const b of this.buildings) if (b.queue.length) spent[b.owner] = false;
    for (const p of this.players) if (p.ore >= DEFS[p.fdef.roles.worker].cost) spent[p.id] = false;
    if (spent[0] && spent[1]) {
      this.over = true; this.winner = -1;
      this.events.push({ t: 'over', winner: -1 });
    }
  }

  // Cheap state hash for determinism checks.
  checksum() {
    let h = this.tick | 0;
    for (const u of this.units) h = (Math.imul(h, 31) + ((u.x * 16) | 0) + ((u.y * 16) | 0) * 7 + (u.hp | 0) * 13 + u.id) | 0;
    for (const b of this.buildings) h = (Math.imul(h, 31) + (b.hp | 0) + b.id * 3) | 0;
    for (const p of this.players) h = (Math.imul(h, 31) + p.ore) | 0;
    return h >>> 0;
  }
}
