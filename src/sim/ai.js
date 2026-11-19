// Scripted opponent. It plays through the same command queue as a human and only
// ever reads (a) its own entities, (b) enemy entities currently visible in ITS fog,
// (c) its own memory of enemy buildings, and (d) the static map. No resource or
// vision bonuses at any difficulty — levels differ only by the numbers in AI_LEVELS.
import { DEFS, TILE, TICK_RATE, MAP_W, MAP_H, SUPPLY_MAX, AI_LEVELS, AI_BUILD_ORDER } from '../data.js';

const NEAR_BASE = 12 * TILE;

export class AIController {
  constructor(g, pid, level) {
    this.g = g; this.pid = pid; this.level = level;
    this.cfg = AI_LEVELS[level] || AI_LEVELS.normal;
    this.p = g.players[pid];
    this.roles = this.p.fdef.roles;
    this.bo = 0;
    this.state = 'gather'; this.gatherSince = this.g.tick;
    this.waveSize = this.cfg.firstWave;
    this.waves = 0;
    this.target = null;
    this.exploreIdx = 0;
    this.gatherSince = 0; this.desperate = false;
    this.scoutId = 0; this.scoutIdx = 0;
    this.nextScout = this.cfg.scoutAt ? this.cfg.scoutAt * TICK_RATE : Infinity;
    this.expansions = 0;
    this.enemyMem = new Map();      // enemy unit id -> { role, tick } (seen recently)
    this.lastThreat = -9999;
    this.reserved = 0;
    const center = s => ({ x: (s.tx + 2) * TILE, y: (s.ty + 2) * TILE });
    this.sites = g.map.bases[pid];
    this.home = center(this.sites[0]);
    this.enemySpots = g.map.bases[1 - pid].map(center);
    const mx = MAP_W * TILE / 2, my = MAP_H * TILE / 2;
    const dx = mx - this.home.x, dy = my - this.home.y, d = Math.hypot(dx, dy);
    this.dir = { x: dx / d, y: dy / d };
    this.rally = { x: this.home.x + this.dir.x * 9 * TILE, y: this.home.y + this.dir.y * 9 * TILE };
    this.explore = this.enemySpots.slice();
    // search pattern for hunting down hidden structures: a grid of reachable points, nearest-first from the enemy start
    const grid = [];
    for (let ty = 6; ty < MAP_H; ty += 12) for (let tx = 6; tx < MAP_W; tx += 12) {
      const fi = g.grid.nearestFree(tx, ty, 1, 1, tx, ty, -1, 0);
      if (fi >= 0) grid.push({ x: (fi % MAP_W + 0.5) * TILE, y: (((fi / MAP_W) | 0) + 0.5) * TILE });
    }
    const es = this.enemySpots[0];
    grid.sort((a, b) => ((a.x - es.x) ** 2 + (a.y - es.y) ** 2) - ((b.x - es.x) ** 2 + (b.y - es.y) ** 2));
    for (const q of grid) this.explore.push(q);
    this.targetSince = 0;
    this.workers = []; this.army = []; this.mains = []; this.prods = []; this.ids = [];
    this.count = {}; this.pending = {};
  }

  cmd(c) { c.p = this.pid; this.g.issue(c); }

  think() {
    const g = this.g;
    if ((g.tick + this.pid * 3) % this.cfg.thinkEvery !== 0) return;
    this.census();
    this.observe();
    this.reserved = 0;
    // Economy exhausted (map mined out or no way to mine): stop waiting, commit everything.
    let patches = 0;
    for (const m of this.mains) patches += this.patchesNear(m);
    this.desperate = this.p.ore < 150 && (patches === 0 || this.workers.length === 0 || this.mains.length === 0) && g.tick > 60 * TICK_RATE;
    this.economy();
    this.construction();
    this.production();
    this.scouting();
    this.military();
  }

  // ------------------------------------------------------------ bookkeeping
  census() {
    const g = this.g, pid = this.pid;
    const { workers, army, mains, prods, count, pending } = this;
    workers.length = army.length = mains.length = prods.length = 0;
    for (const k in count) count[k] = 0;
    for (const k in pending) pending[k] = 0;
    this.armySupply = 0; this.queuedWorkers = 0; this.pendingSupplyCap = 0;
    for (let i = 0; i < g.units.length; i++) {
      const u = g.units[i];
      if (u.owner !== pid || u.dead) continue;
      if (u.def.role === 'worker') {
        workers.push(u);
        if (u.ot === 'build') { const r = DEFS[u.bwhat].role; pending[r] = (pending[r] || 0) + 1; if (r === 'supply') this.pendingSupplyCap += DEFS[u.bwhat].supplyCap; }
      } else if (u.id !== this.scoutId) { army.push(u); this.armySupply += u.def.supply; }
    }
    if (this.desperate && army.length < 4) for (const w of workers) { army.push(w); this.armySupply += w.def.supply; }
    for (let i = 0; i < g.buildings.length; i++) {
      const b = g.buildings[i];
      if (b.owner !== pid || b.dead) continue;
      const r = b.def.role;
      if (b.done) {
        count[r] = (count[r] || 0) + 1;
        if (r === 'main') { mains.push(b); for (const q of b.queue) if (DEFS[q].role === 'worker') this.queuedWorkers++; }
        if (r === 'production') prods.push(b);
      } else {
        pending[r] = (pending[r] || 0) + 1;
        if (r === 'supply' || r === 'main') this.pendingSupplyCap += b.def.supplyCap;
      }
    }
  }
  have(role) { return (this.count[role] || 0) + (this.pending[role] || 0); }

  observe() {
    const g = this.g, pid = this.pid, tick = g.tick;
    let ts = 0, tx = 0, ty = 0, tn = 0;
    for (let i = 0; i < g.units.length; i++) {
      const u = g.units[i];
      if (u.owner === pid || u.dead || !g.isVisible(pid, u)) continue;
      let m = this.enemyMem.get(u.id);
      if (!m) { m = { role: u.def.role, tick }; this.enemyMem.set(u.id, m); } else m.tick = tick;
      if (u.def.role === 'worker') continue;
      for (let j = 0; j < g.buildings.length; j++) {
        const b = g.buildings[j];
        if (b.owner !== pid || b.dead) continue;
        const dx = b.x - u.x, dy = b.y - u.y;
        if (dx * dx + dy * dy < NEAR_BASE * NEAR_BASE) { ts += u.def.cost; tx += u.x; ty += u.y; tn++; break; }
      }
    }
    this.threat = ts;
    if (tn) { this.threatX = tx / tn; this.threatY = ty / tn; this.lastThreat = tick; }
    if (tick % (TICK_RATE * 10) === 0) {
      for (const [id, m] of this.enemyMem) if (tick - m.tick > 90 * TICK_RATE) this.enemyMem.delete(id);
    }
  }

  // ------------------------------------------------------------ economy
  patchesNear(b) {
    let n = 0;
    for (const r of this.g.resources) if (!r.dead && Math.abs(r.x - b.x) < 9 * TILE && Math.abs(r.y - b.y) < 9 * TILE) n++;
    return n;
  }

  economy() {
    const g = this.g, p = this.p, cfg = this.cfg;
    const { workers, mains } = this;
    if (!mains.length) return;
    // per-base saturation
    let capSum = 0;
    for (const m of mains) { m._patches = this.patchesNear(m); m._w = 0; capSum += m._patches * 2 + 2; }
    for (const w of workers) {
      if (w.ot !== 'gather') continue;
      let best = null, bd = 1e18;
      for (const m of mains) { const d = (m.x - w.ox) ** 2 + (m.y - w.oy) ** 2; if (d < bd) { bd = d; best = m; } }
      if (best) best._w++;
    }
    const pick = () => {
      let best = null, bs = 1e9;
      for (const m of mains) { if (!m._patches) continue; const s = m._w / m._patches; if (s < bs) { bs = s; best = m; } }
      return best;
    };
    for (const w of workers) {
      if (w.ot !== 'idle' || w.id === this.scoutId || this.desperate) continue;
      const m = pick();
      if (!m) break;
      const r = g.nearestResource(m.x, m.y, 9 * TILE);
      if (r) { this.cmd({ t: 'gather', ids: [w.id], target: r.id }); m._w++; }
    }
    // move workers from an over-saturated base to an under-saturated one
    if (mains.length > 1) {
      const lo = pick();
      for (const m of mains) {
        if (m === lo || !lo || m._w <= m._patches * 2) continue;
        if (lo._w >= lo._patches * 1.6) break;
        const r = g.nearestResource(lo.x, lo.y, 9 * TILE);
        let moved = 0;
        for (const w of workers) {
          if (moved >= 4 || !r) break;
          if (w.ot === 'gather' && (m.x - w.ox) ** 2 + (m.y - w.oy) ** 2 < (9 * TILE) ** 2) {
            this.cmd({ t: 'gather', ids: [w.id], target: r.id }); moved++; m._w--; lo._w++;
          }
        }
        break;
      }
    }
    // worker production
    const cap = Math.min(cfg.workerCap, capSum);
    const wd = DEFS[this.roles.worker];
    let total = workers.length + this.queuedWorkers;
    for (const m of mains) {
      if (total >= cap) break;
      if (m.queue.length === 0 && p.ore >= wd.cost && p.supplyUsed + wd.supply <= p.supplyCap) {
        this.cmd({ t: 'train', id: m.id, what: this.roles.worker });
        total++;
      }
    }
  }

  // ------------------------------------------------------------ construction
  construction() {
    const g = this.g, p = this.p, cfg = this.cfg, tick = g.tick;
    const sec = tick / TICK_RATE;
    if (!this.workers.length) return;
    // lost the HQ: rebuild it first
    if (!this.have('main')) { this.want('main'); return; }
    // supply
    if (p.supplyCap + this.pendingSupplyCap < SUPPLY_MAX &&
        p.supplyUsed + 3 + this.prods.length * 2 >= p.supplyCap + this.pendingSupplyCap) {
      this.want('supply');
      return;
    }
    // scripted opening
    const steps = Math.min(cfg.boSteps, AI_BUILD_ORDER.length);
    while (this.bo < steps) {
      const st = AI_BUILD_ORDER[this.bo];
      let need = 1;
      for (let i = 0; i < this.bo; i++) if (AI_BUILD_ORDER[i].b === st.b) need++;
      if (this.have(st.b) >= need) { this.bo++; continue; }
      const req = DEFS[this.roles[st.b]].requires;
      if (req && !g.hasBuilding(this.pid, req) && !this.pending[DEFS[req].role]) break;   // prerequisite was lost
      if (p.supplyUsed >= st.s || sec >= st.t) this.want(st.b);
      return;
    }
    // reactive macro once the opening is done (also rebuilds what was lost)
    if (!this.have('production')) { this.want('production'); return; }
    if (cfg.mix.heavy > 0 && !this.have('tech') && this.count.production) { if (this.want('tech')) return; }
    const exp = this.expansions;
    if (exp < cfg.expandAt.length && sec >= cfg.expandAt[exp] && !this.pending.main && tick - this.lastThreat > 20 * TICK_RATE) {
      if (this.have('main') > exp + 1) this.expansions++;
      else { this.want('main'); return; }
    }
    if (this.have('production') < cfg.maxProd && p.ore > 280 + 80 * this.have('production')) { if (this.want('production')) return; }
    if (this.have('defense') < cfg.turrets * this.mains.length && p.ore > 250 && this.count.production) this.want('defense');
  }

  // Try to start a building of `role`; reserves its cost so the army doesn't eat the money.
  want(role) {
    const g = this.g, p = this.p;
    const type = this.roles[role], d = DEFS[type];
    if (d.requires && !g.hasBuilding(this.pid, d.requires)) return false;
    this.reserved += d.cost;
    if (p.ore < d.cost) return false;
    let spot = null;
    if (role === 'main') {
      for (const s of this.sites) if (g.canPlace(type, s.tx, s.ty)) { spot = s; break; }
    } else {
      // defences alternate between bases, everything else clusters at the oldest base
      const m = this.mains.length ? this.mains[role === 'defense' ? this.have('defense') % this.mains.length : 0] : null;
      const anchor = m ? { tx: m.tx + 2, ty: m.ty + 2 } : { tx: this.sites[0].tx + 2, ty: this.sites[0].ty + 2 };
      spot = this.findSpot(d.size, anchor, role);
    }
    if (!spot) return false;
    const sx = (spot.tx + d.size / 2) * TILE, sy = (spot.ty + d.size / 2) * TILE;
    let best = null, bd = 1e18;
    for (const w of this.workers) {
      if (w.id === this.scoutId || (w.ot !== 'gather' && w.ot !== 'idle')) continue;
      const dd = (w.x - sx) ** 2 + (w.y - sy) ** 2 + (w.carrying ? 1e5 : 0);
      if (dd < bd) { bd = dd; best = w; }
    }
    if (!best) return false;
    this.cmd({ t: 'build', ids: [best.id], what: type, tx: spot.tx, ty: spot.ty });
    this.pending[role] = (this.pending[role] || 0) + 1;
    return true;
  }

  findSpot(size, a, role) {
    const g = this.g, grid = g.grid;
    // centroid of nearby patches: never build on the mining side
    let rx = 0, ry = 0, rn = 0;
    for (const r of g.resources) if (!r.dead && Math.abs(r.tx - a.tx) < 10 && Math.abs(r.ty - a.ty) < 10) { rx += r.tx; ry += r.ty; rn++; }
    if (rn) { rx /= rn; ry /= rn; }
    const front = role === 'defense' || role === 'production';
    let best = null, bs = 1e9;
    for (let r = 4; r <= 15; r++) {
      for (let oy = -r; oy <= r; oy++) for (let ox = -r; ox <= r; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
        const tx = a.tx + ox - (size >> 1), ty = a.ty + oy - (size >> 1);
        if (!grid.rectFree(tx - 1, ty - 1, size + 2, size + 2)) continue;
        const cx = tx + size / 2, cy = ty + size / 2;
        if (Math.hypot(cx * TILE - this.rally.x, cy * TILE - this.rally.y) < 5 * TILE) continue;   // keep the choke open
        if (rn) {
          const dm = Math.hypot(a.tx - rx, a.ty - ry), dc = Math.hypot(cx - rx, cy - ry);
          if (dc < dm + 2.5) continue;
        }
        const dot = (cx - a.tx) * this.dir.x + (cy - a.ty) * this.dir.y;
        const s = Math.hypot(cx - a.tx, cy - a.ty) + (front ? -dot * 0.7 : dot * 0.25) + ((tx * 7 + ty * 13) % 5) * 0.1;
        if (s < bs) { bs = s; best = { tx, ty }; }
      }
      if (best && r >= 7) break;
    }
    return best;
  }

  // ------------------------------------------------------------ unit production
  production() {
    const g = this.g, p = this.p, cfg = this.cfg, roles = this.roles;
    if (!this.prods.length) return;
    const w = { melee: cfg.mix.melee, ranged: cfg.mix.ranged, anti: cfg.mix.anti, heavy: cfg.mix.heavy };
    if (cfg.counter && this.enemyMem.size >= 3) {
      let em = 0, er = 0, ea = 0, eh = 0, n = 0;
      for (const m of this.enemyMem.values()) {
        if (m.role === 'melee') em++; else if (m.role === 'ranged') er++; else if (m.role === 'anti') ea++; else if (m.role === 'heavy') eh++; else continue;
        n++;
      }
      if (n >= 3) {
        em /= n; er /= n; ea /= n; eh /= n;
        w.ranged += 0.6 * em; w.heavy += 0.5 * er + 0.3 * em; w.anti += 1.0 * eh; w.melee += 0.7 * ea;
      }
    }
    for (const m of this.p.seen.values()) if (m.def.role === 'defense') { w.anti += 0.08; }
    if (!g.hasBuilding(this.pid, DEFS[roles.heavy].requires)) w.heavy = 0;
    const sum = w.melee + w.ranged + w.anti + w.heavy;
    const have = { melee: 0, ranged: 0, anti: 0, heavy: 0 };
    let total = 0;
    for (const u of this.army) { have[u.def.role] += u.def.supply; total += u.def.supply; }
    for (const b of this.prods) for (const q of b.queue) { have[DEFS[q].role] += DEFS[q].supply; total += DEFS[q].supply; }
    let ore = p.ore - this.reserved;
    for (const b of this.prods) {
      if (b.queue.length >= cfg.queueDepth) continue;
      let pickRole = null, bs = -1e9;
      for (const r in w) {
        if (w[r] <= 0) continue;
        const d = DEFS[roles[r]];
        const deficit = w[r] / sum - (total ? have[r] / total : 0);
        if (deficit > bs) { bs = deficit; pickRole = r; }
      }
      if (!pickRole) break;
      const d = DEFS[roles[pickRole]];
      if (p.supplyUsed + d.supply > p.supplyCap) break;
      if (ore < d.cost) break;                       // save for the unit we actually want
      this.cmd({ t: 'train', id: b.id, what: roles[pickRole] });
      ore -= d.cost; have[pickRole] += d.supply; total += d.supply;
    }
  }

  // ------------------------------------------------------------ scouting
  scouting() {
    const g = this.g;
    if (this.scoutId) {
      const s = g.byId.get(this.scoutId);
      if (!s || s.dead) { this.scoutId = 0; this.nextScout = g.tick + this.cfg.scoutEvery * TICK_RATE; return; }
      if (s.ot === 'idle') {
        this.scoutIdx++;
        if (this.scoutIdx >= this.enemySpots.length) {
          this.scoutId = 0;                             // released; economy()/military() picks it up again
          this.nextScout = g.tick + this.cfg.scoutEvery * TICK_RATE;
        } else this.cmd({ t: 'move', ids: [s.id], x: this.enemySpots[this.scoutIdx].x, y: this.enemySpots[this.scoutIdx].y - 3 * TILE });
      }
      return;
    }
    if (g.tick < this.nextScout || this.state === 'attack') return;
    // later scouts use a fast melee unit if one is available, the first uses a worker
    let s = null;
    for (const u of this.army) if (u.def.role === 'melee' && u.ot === 'idle') { s = u; break; }
    if (!s) for (const u of this.workers) if (u.ot === 'gather' && !u.carrying) { s = u; break; }
    if (!s) return;
    this.scoutId = s.id; this.scoutIdx = 0;
    this.cmd({ t: 'move', ids: [s.id], x: this.enemySpots[0].x, y: this.enemySpots[0].y - 3 * TILE });
  }

  // ------------------------------------------------------------ army
  pickTarget(fromX, fromY) {
    let best = null, bd = 1e18;
    for (const m of this.p.seen.values()) {
      const d = (m.x - fromX) ** 2 + (m.y - fromY) ** 2;
      if (d < bd) { bd = d; best = m; }
    }
    if (best) return { id: best.id, x: best.x, y: best.y };
    const e = this.explore[this.exploreIdx % this.explore.length];
    return { id: 0, x: e.x, y: e.y };
  }

  order(t, units, x, y) {
    const ids = this.ids; ids.length = 0;
    for (const u of units) ids.push(u.id);
    if (ids.length) this.cmd({ t, ids: ids.slice(), x, y });
  }

  military() {
    const g = this.g, cfg = this.cfg, tick = g.tick, army = this.army;
    const tmp = [];
    const homeR2 = (16 * TILE) ** 2;
    // --- defend
    if (this.threat > 0) {
      let homeStr = 0;
      for (const u of army) if ((u.x - this.threatX) ** 2 + (u.y - this.threatY) ** 2 < homeR2) homeStr += u.def.cost;
      const recall = this.threat > homeStr * 1.1;
      if (recall && this.state === 'attack') this.state = 'gather';
      for (const u of army) {
        const near = (u.x - this.threatX) ** 2 + (u.y - this.threatY) ** 2 < homeR2;
        if (!near && !recall && this.state === 'attack') continue;
        if (u.atk) continue;
        if (u.ot === 'amove' && (u.ox - this.threatX) ** 2 + (u.oy - this.threatY) ** 2 < (5 * TILE) ** 2) continue;
        tmp.push(u);
      }
      this.order('amove', tmp, this.threatX, this.threatY);
      return;
    }
    if (this.state === 'gather') {
      for (const u of army) {
        if (u.ot === 'idle' && !u.atk && (u.x - this.rally.x) ** 2 + (u.y - this.rally.y) ** 2 > (7 * TILE) ** 2) tmp.push(u);
      }
      this.order('amove', tmp, this.rally.x, this.rally.y);
      const ready = this.armySupply >= this.waveSize && tick >= cfg.firstAttack * TICK_RATE;
      const impatient = tick - this.gatherSince > 150 * TICK_RATE && this.armySupply >= Math.max(8, this.waveSize * 0.6) && tick >= cfg.firstAttack * TICK_RATE;
      if (ready || impatient || (this.desperate && army.length) || (this.p.supplyUsed >= SUPPLY_MAX - 6 && this.armySupply > 20)) {
        this.target = this.pickTarget(this.rally.x, this.rally.y);
        this.state = 'attack'; this.waves++; this.targetSince = tick;
        this.order('amove', army, this.target.x, this.target.y);
      }
      return;
    }
    // --- attacking
    let cx = 0, cy = 0, n = 0;
    for (const u of army) if ((u.x - this.home.x) ** 2 + (u.y - this.home.y) ** 2 > (15 * TILE) ** 2) { cx += u.x; cy += u.y; n++; }
    if (!n) {
      if (!this.desperate && this.armySupply < this.waveSize * 0.5) { this.endWave(); return; }
      cx = this.rally.x; cy = this.rally.y;
    } else { cx /= n; cy /= n; }
    const R2 = (13 * TILE) ** 2;
    let own = 0, foe = 0, foeSeen = false;
    for (const u of army) if ((u.x - cx) ** 2 + (u.y - cy) ** 2 < R2) own += u.def.cost;
    for (const u of g.units) {
      if (u.owner === this.pid || u.dead || u.def.role === 'worker') continue;
      if ((u.x - cx) ** 2 + (u.y - cy) ** 2 < R2 && g.isVisible(this.pid, u)) { foe += u.def.cost; foeSeen = true; }
    }
    for (const b of g.buildings) {
      if (b.owner === this.pid || b.dead || !b.done || !b.def.damage) continue;
      if ((b.x - cx) ** 2 + (b.y - cy) ** 2 < R2 && g.isVisible(this.pid, b)) foe += b.def.cost * 1.5;
    }
    if (!this.desperate && ((foe > 0 && own < foe * cfg.retreatRatio) || this.armySupply < Math.min(4, this.waveSize * 0.25))) {
      this.order('move', army, this.rally.x, this.rally.y);
      this.endWave();
      return;
    }
    // keep the target fresh
    const t = this.target;
    if (t.id) { if (!this.p.seen.has(t.id)) this.target = this.pickTarget(cx, cy); }
    else if (this.p.seen.size) this.target = this.pickTarget(cx, cy);
    else if (!foeSeen && ((cx - t.x) ** 2 + (cy - t.y) ** 2 < (6 * TILE) ** 2 || tick - this.targetSince > 40 * TICK_RATE)) { this.exploreIdx++; this.target = this.pickTarget(cx, cy); }
    if (this.target !== t) this.targetSince = tick;
    // re-issue to idle units; stragglers at home leave in groups
    let homeSupply = 0;
    for (const u of army) if (u.ot === 'idle' && (u.x - this.home.x) ** 2 + (u.y - this.home.y) ** 2 <= (15 * TILE) ** 2) homeSupply += u.def.supply;
    for (const u of army) {
      if (u.atk) continue;
      const atHome = (u.x - this.home.x) ** 2 + (u.y - this.home.y) ** 2 <= (15 * TILE) ** 2;
      const off = (u.ox - this.target.x) ** 2 + (u.oy - this.target.y) ** 2 > (3 * TILE) ** 2;
      if (u.ot === 'idle') { if (!atHome || homeSupply >= 6 || !n) tmp.push(u); }
      else if (u.ot === 'amove' && off && !atHome) tmp.push(u);
    }
    this.order('amove', tmp, this.target.x, this.target.y);
  }

  endWave() {
    this.state = 'gather'; this.gatherSince = this.g.tick;
    this.waveSize = Math.min(this.cfg.maxWave, this.waveSize + this.cfg.waveGrow);
  }
}
