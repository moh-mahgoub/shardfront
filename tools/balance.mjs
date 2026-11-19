// Win-rate sweep: many headless AI-vs-AI matches per pairing, both faction seatings.
//   node tools/balance.mjs [gamesPerPairing=6]
// Use after editing src/data.js. Matches are deterministic per seed, so results are reproducible.
import { Game } from '../src/sim/game.js';
import { TICK_RATE } from '../src/data.js';

const N = +process.argv[2] || 6;
const LIMIT = 60 * 60 * TICK_RATE;
const pairings = [['hard', 'normal'], ['normal', 'easy'], ['hard', 'hard'], ['normal', 'normal']];

for (const [l0, l1] of pairings) for (const f0 of ['compact', 'choir']) {
  const f1 = f0 === 'compact' ? 'choir' : 'compact';
  let w0 = 0, w1 = 0, draws = 0, unfinished = 0, minutes = 0;
  for (let i = 1; i <= N; i++) {
    const g = new Game({ seed: i * 31, players: [{ faction: f0, ai: l0 }, { faction: f1, ai: l1 }] });
    while (!g.over && g.tick < LIMIT) { g.step(); g.events.length = 0; }
    minutes += g.tick / TICK_RATE / 60;
    if (!g.over) unfinished++; else if (g.winner === 0) w0++; else if (g.winner === 1) w1++; else draws++;
  }
  console.log(`P0 ${f0}/${l0.padEnd(6)} vs P1 ${f1}/${l1.padEnd(6)}  P0 ${w0}  P1 ${w1}  draw ${draws}  unfinished ${unfinished}  avg ${(minutes / N).toFixed(1)} min`);
}
