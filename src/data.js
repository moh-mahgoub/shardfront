// ============================================================================
//  SHARDFRONT — balance & content data.  THIS IS THE FILE TO TUNE.
//  Units of measure used here (converted to per-tick values at the bottom):
//    range, sight, speed  -> tiles (speed is tiles / second)
//    cooldown, buildTime, gatherTime -> seconds
//    radius, splash -> world pixels (1 tile = 32 px)
//  Damage formula:  max(1, damage + bonus[target.armorType] - target.armor)
// ============================================================================

export const TILE = 32;
export const MAP_W = 96;
export const MAP_H = 96;
export const TICK_RATE = 20;            // simulation ticks per second
export const SUPPLY_MAX = 100;          // hard supply ceiling per player
export const START_ORE = 50;
export const START_WORKERS = 5;
export const PATCH_AMOUNT = 1500;       // shards per resource patch
export const CANCEL_REFUND = 0.75;      // refund when cancelling a construction
export const MAX_QUEUE = 5;

export const FACTIONS = {
  compact: {
    name: 'Foundry Compact',
    blurb: 'Rugged war-machines. Salvage: 20% of the cost of every lost unit is refunded.',
    salvage: 0.2,          // distinct mechanic: refund fraction on unit death
    regen: 0,
    roles: { worker: 'tinker', main: 'core', supply: 'quarters', production: 'yard', tech: 'lab',
             defense: 'watchpost', melee: 'brawler', ranged: 'arbalest', anti: 'breacher', heavy: 'bulwark' },
    build: ['core', 'quarters', 'yard', 'lab', 'watchpost'],
  },
  choir: {
    name: 'Lumen Choir',
    blurb: 'Living crystal. Mending Light: units and structures regenerate when out of combat.',
    salvage: 0,
    regen: 0.02,            // distinct mechanic: fraction of max HP regenerated per second...
    regenDelay: 6,          // ...after this many seconds without taking damage
    roles: { worker: 'wisp', main: 'spire', supply: 'prism', production: 'gate', tech: 'vault',
             defense: 'obelisk', melee: 'shardling', ranged: 'glinter', anti: 'piercer', heavy: 'monolith' },
    build: ['spire', 'prism', 'gate', 'vault', 'obelisk'],
  },
};

// Every unit and building. `role` is what the AI and UI use to reason generically.
export const DEFS = {
  // ----------------------------- Foundry Compact units ----------------------
  tinker:   { kind: 'unit', faction: 'compact', role: 'worker', name: 'Tinker',
              desc: 'Worker. Gathers shards and raises structures.',
              hp: 45, armor: 0, armorType: 'light', damage: 4, bonus: {}, range: 0.5, cooldown: 1.2,
              speed: 2.5, sight: 7, cost: 50, supply: 1, buildTime: 11, radius: 9,
              carry: 6, gatherTime: 2.0 },
  brawler:  { kind: 'unit', faction: 'compact', role: 'melee', name: 'Brawler',
              desc: 'Fast melee skirmisher. Shreds Breachers; dies to Arbalests and Bulwarks.',
              hp: 70, armor: 0, armorType: 'light', damage: 9, bonus: {}, range: 0.5, cooldown: 0.8,
              speed: 3.1, sight: 7, cost: 60, supply: 1, buildTime: 13, radius: 9 },
  arbalest: { kind: 'unit', faction: 'compact', role: 'ranged', name: 'Arbalest',
              desc: 'Rapid ranged fire, bonus vs light. Counters melee; useless against armor.',
              hp: 50, armor: 0, armorType: 'light', damage: 6, bonus: { light: 6 }, range: 5, cooldown: 0.9,
              speed: 2.6, sight: 8, cost: 75, supply: 1, buildTime: 15, radius: 9, projSpeed: 14 },
  breacher: { kind: 'unit', faction: 'compact', role: 'anti', name: 'Breacher',
              desc: 'Slow heavy shells, big bonus vs armored and structures. Weak vs light swarms.',
              hp: 80, armor: 0, armorType: 'light', damage: 8, bonus: { armored: 22, structure: 14 }, range: 5.5, cooldown: 1.8,
              speed: 2.2, sight: 8, cost: 100, supply: 2, buildTime: 19, radius: 10, projSpeed: 11 },
  bulwark:  { kind: 'unit', faction: 'compact', role: 'heavy', name: 'Bulwark',
              desc: 'Armored siege walker with splash. Crushes light units. Needs a Calibration Lab.',
              hp: 220, armor: 4, armorType: 'armored', damage: 20, bonus: {}, range: 4, cooldown: 1.5,
              speed: 1.95, sight: 8, cost: 175, supply: 3, buildTime: 28, radius: 13, projSpeed: 10, splash: 30,
              requires: 'lab' },

  // ----------------------------- Lumen Choir units --------------------------
  wisp:      { kind: 'unit', faction: 'choir', role: 'worker', name: 'Wisp',
               desc: 'Worker. Gathers shards and seeds structures.',
               hp: 40, armor: 0, armorType: 'light', damage: 4, bonus: {}, range: 0.5, cooldown: 1.2,
               speed: 2.6, sight: 7, cost: 50, supply: 1, buildTime: 11, radius: 8,
               carry: 6, gatherTime: 2.0 },
  shardling: { kind: 'unit', faction: 'choir', role: 'melee', name: 'Shardling',
               desc: 'Cheap, quick melee splinter. Swarms Piercers; shattered by Glinters and Monoliths.',
               hp: 55, armor: 0, armorType: 'light', damage: 8, bonus: {}, range: 0.5, cooldown: 0.7,
               speed: 3.4, sight: 7, cost: 50, supply: 1, buildTime: 12, radius: 8 },
  glinter:   { kind: 'unit', faction: 'choir', role: 'ranged', name: 'Glinter',
               desc: 'Long-range light lance, bonus vs light. Counters melee; glances off armor.',
               hp: 45, armor: 0, armorType: 'light', damage: 7, bonus: { light: 6 }, range: 5.5, cooldown: 1.0,
               speed: 2.65, sight: 8, cost: 80, supply: 1, buildTime: 16, radius: 9, projSpeed: 16 },
  piercer:   { kind: 'unit', faction: 'choir', role: 'anti', name: 'Piercer',
               desc: 'Focused beam, huge bonus vs armored and structures. Weak vs light swarms.',
               hp: 70, armor: 0, armorType: 'light', damage: 9, bonus: { armored: 24, structure: 15 }, range: 6, cooldown: 2.0,
               speed: 2.15, sight: 8, cost: 110, supply: 2, buildTime: 20, radius: 10, projSpeed: 13 },
  monolith:  { kind: 'unit', faction: 'choir', role: 'heavy', name: 'Monolith',
               desc: 'Armored crystal titan with splash. Crushes light units. Needs a Harmonic Vault.',
               hp: 200, armor: 4, armorType: 'armored', damage: 19, bonus: {}, range: 4.5, cooldown: 1.45,
               speed: 1.9, sight: 8, cost: 185, supply: 3, buildTime: 29, radius: 13, projSpeed: 10, splash: 30,
               requires: 'vault' },

  // ----------------------------- Foundry Compact buildings ------------------
  core:      { kind: 'building', faction: 'compact', role: 'main', name: 'Citadel Core',
               desc: 'Headquarters. Trains Tinkers, receives shards, grants supply.',
               hp: 1500, armor: 2, armorType: 'structure', size: 4, sight: 9, cost: 400, buildTime: 70,
               supplyCap: 11, trains: ['tinker'] },
  quarters:  { kind: 'building', faction: 'compact', role: 'supply', name: 'Quarters',
               desc: 'Raises the supply cap by 8.',
               hp: 400, armor: 1, armorType: 'structure', size: 2, sight: 5, cost: 100, buildTime: 20,
               supplyCap: 8 },
  yard:      { kind: 'building', faction: 'compact', role: 'production', name: 'Assembly Yard',
               desc: 'Builds combat units.',
               hp: 900, armor: 1, armorType: 'structure', size: 3, sight: 6, cost: 150, buildTime: 38,
               trains: ['brawler', 'arbalest', 'breacher', 'bulwark'] },
  lab:       { kind: 'building', faction: 'compact', role: 'tech', name: 'Calibration Lab',
               desc: 'Unlocks the Bulwark.',
               hp: 700, armor: 1, armorType: 'structure', size: 3, sight: 6, cost: 150, buildTime: 42,
               requires: 'yard' },
  watchpost: { kind: 'building', faction: 'compact', role: 'defense', name: 'Watchpost',
               desc: 'Defensive turret.',
               hp: 450, armor: 2, armorType: 'structure', size: 2, sight: 8, cost: 125, buildTime: 26,
               damage: 14, bonus: {}, range: 6.5, cooldown: 0.9, projSpeed: 14, requires: 'yard' },

  // ----------------------------- Lumen Choir buildings ----------------------
  spire:     { kind: 'building', faction: 'choir', role: 'main', name: 'Radiant Spire',
               desc: 'Heart of the Choir. Births Wisps, receives shards, grants supply.',
               hp: 1400, armor: 2, armorType: 'structure', size: 4, sight: 9, cost: 400, buildTime: 70,
               supplyCap: 11, trains: ['wisp'] },
  prism:     { kind: 'building', faction: 'choir', role: 'supply', name: 'Prism Node',
               desc: 'Raises the supply cap by 8.',
               hp: 360, armor: 1, armorType: 'structure', size: 2, sight: 5, cost: 100, buildTime: 20,
               supplyCap: 8 },
  gate:      { kind: 'building', faction: 'choir', role: 'production', name: 'Chorus Gate',
               desc: 'Calls combat units into being.',
               hp: 850, armor: 1, armorType: 'structure', size: 3, sight: 6, cost: 150, buildTime: 38,
               trains: ['shardling', 'glinter', 'piercer', 'monolith'] },
  vault:     { kind: 'building', faction: 'choir', role: 'tech', name: 'Harmonic Vault',
               desc: 'Unlocks the Monolith.',
               hp: 650, armor: 1, armorType: 'structure', size: 3, sight: 6, cost: 150, buildTime: 42,
               requires: 'gate' },
  obelisk:   { kind: 'building', faction: 'choir', role: 'defense', name: 'Glare Obelisk',
               desc: 'Defensive beam emitter.',
               hp: 420, armor: 2, armorType: 'structure', size: 2, sight: 8, cost: 125, buildTime: 26,
               damage: 15, bonus: {}, range: 6.5, cooldown: 1.0, projSpeed: 16, requires: 'gate' },
};

// --------------------------------- AI ---------------------------------------
// Generic opening, expressed in roles so it works for either faction.
// A step fires once supply used >= `s` (or game time >= `t` seconds as a fallback).
export const AI_BUILD_ORDER = [
  { s: 7,  t: 40,  b: 'supply' },
  { s: 9,  t: 70,  b: 'production' },
  { s: 13, t: 130, b: 'supply' },
  { s: 15, t: 170, b: 'production' },
  { s: 18, t: 210, b: 'tech' },
  { s: 20, t: 250, b: 'defense' },
];

// No level gets extra resources or map vision. Difficulty = speed of decisions,
// economy size, army handling and whether it adapts its unit mix to what it scouts.
export const AI_LEVELS = {
  easy: {
    label: 'Easy', thinkEvery: 40, workerCap: 12, maxProd: 2, expandAt: [540], turrets: 1,
    firstAttack: 330, firstWave: 7, waveGrow: 4, maxWave: 30, retreatRatio: 0.3,
    scoutAt: 0, scoutEvery: 0, counter: false, queueDepth: 1, boSteps: 4,
    mix: { melee: 0.55, ranged: 0.35, anti: 0.1, heavy: 0 },
  },
  normal: {
    label: 'Normal', thinkEvery: 20, workerCap: 20, maxProd: 3, expandAt: [300, 660], turrets: 1,
    firstAttack: 240, firstWave: 10, waveGrow: 5, maxWave: 48, retreatRatio: 0.55,
    scoutAt: 75, scoutEvery: 200, counter: true, queueDepth: 1, boSteps: 6,
    mix: { melee: 0.35, ranged: 0.3, anti: 0.2, heavy: 0.15 },
  },
  hard: {
    label: 'Hard', thinkEvery: 10, workerCap: 30, maxProd: 5, expandAt: [200, 440], turrets: 2,
    firstAttack: 200, firstWave: 12, waveGrow: 7, maxWave: 64, retreatRatio: 0.75,
    scoutAt: 45, scoutEvery: 120, counter: true, queueDepth: 2, boSteps: 6,
    mix: { melee: 0.3, ranged: 0.3, anti: 0.2, heavy: 0.2 },
  },
};

// ---------------- derived per-tick values (do not edit below) ---------------
for (const key in DEFS) {
  const d = DEFS[key];
  d.key = key;
  d._bt = Math.max(1, Math.round(d.buildTime * TICK_RATE));
  d._sight = d.sight | 0;
  if (d.damage) {
    d._range = d.range * TILE;
    d._cd = Math.max(1, Math.round(d.cooldown * TICK_RATE));
    d._proj = d.projSpeed ? d.projSpeed * TILE / TICK_RATE : 0;
    d.bonus = d.bonus || {};
  }
  if (d.kind === 'unit') {
    d._spd = d.speed * TILE / TICK_RATE;
    if (d.gatherTime) d._gather = Math.round(d.gatherTime * TICK_RATE);
  } else {
    d.radius = d.size * TILE / 2;
  }
}
