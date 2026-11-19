// Headless AI-vs-AI matches in plain Node (the simulation has no DOM dependency).
// Proves: a full match finishes with a winner, nothing throws, no unit stays stuck,
// and the simulation is deterministic (same seed -> same checksum).
//   node tests/ai-vs-ai.mjs [--quick] [--verbose]
import { Game } from '../src/sim/game.js';
import { TICK_RATE } from '../src/data.js';

const quick = process.argv.includes('--quick');
const verbose = process.argv.includes('--verbose');
const MAX_MIN = 60;

function run(seed, f0, l0, f1, l1, log) {
  const g = new Game({ seed, players: [{ faction: f0, ai: l0 }, { faction: f1, ai: l1 }] });
  const t0 = performance.now();
  let maxTick = 0, peakUnits = 0, worstStall = 0;
  const stall = new Map();   // unit id -> consecutive seconds with a move order but no progress
  while (!g.over && g.tick < MAX_MIN * 60 * TICK_RATE) {
    const s = performance.now();
    g.step();
    const dt = performance.now() - s;
    if (dt > maxTick) maxTick = dt;
    g.events.length = 0;
    if (g.units.length > peakUnits) peakUnits = g.units.length;
    if (g.tick % TICK_RATE === 0) {
      for (const u of g.units) {
        const st = stall.get(u.id) || { x: u.x, y: u.y, n: 0 };
        const moved = Math.hypot(u.x - st.x, u.y - st.y) > 2;
        const wants = u.moving && !u.anchored && u.ot !== 'gather';
        st.n = (!moved && wants) ? st.n + 1 : 0;
        st.x = u.x; st.y = u.y;
        if (st.n > worstStall) worstStall = st.n;
        stall.set(u.id, st);
      }
    }
    if (log && g.tick % (TICK_RATE * 60) === 0) {
      const d = g.players.map(p => `${p.faction}: ore ${p.ore} sup ${p.supplyUsed}/${p.supplyCap} kills ${p.kills} [${p.ai.state} w${p.ai.waves}]`).join(' | ');
      console.log(`  ${String(g.tick / TICK_RATE / 60).padStart(2)}m  units ${g.units.length}  bld ${g.buildings.length}  ${d}`);
    }
  }
  const ms = performance.now() - t0;
  return { g, ms, maxTick, peakUnits, worstStall, checksum: g.checksum() };
}

const matches = quick
  ? [[7, 'compact', 'hard', 'choir', 'easy']]
  : [[7, 'compact', 'hard', 'choir', 'easy'], [11, 'compact', 'normal', 'choir', 'hard'],
     [23, 'choir', 'hard', 'compact', 'hard'], [42, 'compact', 'easy', 'choir', 'normal']];

let failed = 0;
for (const [seed, f0, l0, f1, l1] of matches) {
  console.log(`\nMatch seed=${seed}: P0 ${f0}/${l0}  vs  P1 ${f1}/${l1}`);
  let r;
  try { r = run(seed, f0, l0, f1, l1, verbose); }
  catch (e) { console.error('  FAIL: simulation threw', e); failed++; continue; }
  const { g } = r;
  const mins = (g.tick / TICK_RATE / 60).toFixed(1);
  console.log(`  finished=${g.over} winner=${g.winner < 0 ? 'draw' : 'P' + g.winner} gameTime=${mins}min ticks=${g.tick} wall=${r.ms.toFixed(0)}ms ` +
    `avgTick=${(r.ms / g.tick).toFixed(3)}ms maxTick=${r.maxTick.toFixed(1)}ms peakUnits=${r.peakUnits}`);
  console.log(`  pathQueries=${g.grid.queries} pathFails=${g.stats.pathFails} stuckGiveUps=${g.stats.stuckGiveUps} worstStall=${r.worstStall}s`);
  for (const p of g.players) console.log(`  P${p.id} ${p.faction}: mined=${p.mined} trained=${p.trained} built=${p.built} kills=${p.kills} lost=${p.lost}`);
  if (!g.over) { console.error('  FAIL: match did not finish'); failed++; }
  if (r.worstStall > 20) { console.error('  FAIL: a unit was stuck for ' + r.worstStall + 's'); failed++; }
}

// determinism: identical seeds must give identical state
const a = run(5, 'compact', 'hard', 'choir', 'hard', false), b = run(5, 'compact', 'hard', 'choir', 'hard', false);
console.log(`\nDeterminism: checksum ${a.checksum} vs ${b.checksum} at tick ${a.g.tick}/${b.g.tick}`);
if (a.checksum !== b.checksum || a.g.tick !== b.g.tick) { console.error('  FAIL: simulation is not deterministic'); failed++; }

console.log(failed ? `\n${failed} FAILURE(S)` : '\nALL AI-VS-AI CHECKS PASSED');
process.exit(failed ? 1 : 0);
