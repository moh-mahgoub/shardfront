# Shardfront

An original real-time strategy game for the browser, designed touch-first for iPad Safari in landscape.
Gather shards, build a base, tech up, train an army, destroy every enemy structure.

- Plain HTML + ES modules + Canvas 2D. No dependencies, no build step, no network calls at runtime.
- All art is drawn in code; all sound is synthesised with WebAudio.
- Original setting, factions, names and visuals.

## Run it

Any static file server works. One is included (needs Node 18+):

```
node tools/serve.mjs          # http://localhost:8080  (pass a port number to change it)
```

Alternatives: `python3 -m http.server 8080`, or upload the folder to any static host (GitHub Pages, Netlify, Cloudflare Pages, S3).

**Without a server:** open `standalone.html` directly. Browsers refuse to load ES modules from `file://`, so
`index.html` needs a server; `standalone.html` is the same game with everything inlined into one file.
Regenerate it after editing the source with `node tools/bundle.mjs`.

## Open it on an iPad

1. Put the Mac/PC and the iPad on the same Wi-Fi.
2. Run `node tools/serve.mjs`. It prints a line such as `iPad / phone: http://192.168.1.23:8080/`.
3. Type that address into Safari on the iPad and turn the iPad to landscape.

If the address does not load, allow incoming connections for Node in the computer's firewall.
Hosting the folder on any HTTPS static host works the same way and additionally enables offline play
(the service worker only registers over HTTPS or localhost).

### Add to the Home Screen (fullscreen)

In Safari: **Share → Add to Home Screen → Add**. Launch it from the new icon: it runs fullscreen with
no browser chrome, locked away from page scroll, pull-to-refresh, double-tap zoom and text selection.

## Controls

### Touch

| Gesture | Action |
| --- | --- |
| Tap a unit or building | Select it |
| Tap ground (units selected) | Move |
| Tap an enemy (units selected) | Attack it |
| Tap shards (workers selected) | Gather |
| Tap ground (production building selected) | Set rally point |
| Double-tap a unit | Select all of that type on screen |
| One-finger drag | Box-select in **Select** mode, pan in **Camera** mode (toggle at the left edge) |
| Two-finger drag / pinch | Pan / zoom, always available |
| Fling | Inertial camera glide |
| Group buttons 1-5 | Tap = select, tap again = jump to it, long-press = assign |
| Minimap | Tap to jump, drag to pan |
| ✕ on the selection panel | Deselect |
| **Idle** / **Army** (top bar) | Cycle idle workers / select every combat unit |

Command card (bottom right, contextual): **Move, Attack (attack-move), Stop, Hold, Patrol, Build**, unit
**Train** buttons, **Rally**, **Cancel**. Targeted commands show a hint banner; tap the map to issue, or Cancel.

Building: **Build** → choose a structure → drag the ghost (it floats above your finger; green = valid, red =
invalid) → tap the ghost again or press **Place**.

### Mouse and keyboard

Left-click / drag select · right-click smart command (move, attack, gather, rally) · wheel zoom ·
arrow keys or middle-drag pan · Shift-click adds to the selection ·
`A` attack-move · `M` move · `P` patrol · `S` stop · `H` hold · `B` build menu · `Esc` cancel / pause ·
`1-5` select group (double-press to jump) · `Ctrl/Alt+1-5` assign · `Tab` Select/Camera mode · `F3` or `` ` `` debug overlay.

## The game

| | Foundry Compact | Lumen Choir |
| --- | --- | --- |
| Mechanic | **Salvage** – 20% of a lost unit's cost is refunded | **Mending Light** – units and structures regenerate out of combat |
| Worker | Tinker | Wisp |
| Melee (light) | Brawler | Shardling |
| Ranged (bonus vs light) | Arbalest | Glinter |
| Anti-armor | Breacher | Piercer |
| Armored, splash (needs tech) | Bulwark | Monolith |
| Main / supply / production / tech / defense | Citadel Core / Quarters / Assembly Yard / Calibration Lab / Watchpost | Radiant Spire / Prism Node / Chorus Gate / Harmonic Vault / Glare Obelisk |

Counters: ranged beats melee · melee beats anti-armor · anti-armor beats armored · armored beats light units.

One resource (shards) plus a supply cap (max 100). Each side has a main base, a sheltered natural expansion
and a third base site. The map is 96×96, point-symmetric, with a cliff ring and ramp around each main,
a central ridge with four gaps, and a lake.

The human can play either faction (chosen in the menu); the AI takes the other.

## Balance tuning

Everything is in **`src/data.js`**:

- `DEFS` – every unit and building: `hp`, `armor`, `armorType`, `damage`, `bonus` (per armor type), `range`,
  `cooldown`, `speed`, `sight`, `cost`, `supply`, `buildTime`, `splash`, `requires`, `trains`.
  Units are in tiles and seconds; per-tick values are derived at the bottom of the file.
- Damage per hit = `max(1, damage + bonus[target.armorType] - target.armor)`.
- `FACTIONS` – faction mechanics (`salvage`, `regen`, `regenDelay`) and which unit fills which role.
- Economy constants – `START_ORE`, `START_WORKERS`, `PATCH_AMOUNT`, `SUPPLY_MAX`, worker `carry` / `gatherTime`.
- `AI_BUILD_ORDER` and `AI_LEVELS` – opening, worker cap, expansion timings, wave sizes, retreat threshold,
  scouting and unit mix per difficulty.

After a change, run `node tests/ai-vs-ai.mjs` to confirm matches still finish; add `--verbose` for a
minute-by-minute economy log. The map layout lives in `src/sim/map.js`.

## Tests

```
node tests/ai-vs-ai.mjs            # 4 full AI-vs-AI matches + a determinism check, in plain Node
npm i -D playwright && npx playwright install chromium
node tests/smoke.mjs --shots       # iPad-emulated browser run; screenshots go to tests/screenshots/
```

The smoke test emulates an iPad (touch, 1180×820 at 2x, mobile Safari user agent) and exercises taps, drags,
pinches, long-presses, building, production, a 260-unit battle with frame timing, pause/settings, a full
match to the result screen, restart, and `standalone.html` from `file://`. It fails on any console error.

Useful URL parameters: `?seed=7` fixed map seed · `?debug=1` debug overlay · `?autostart=hard` skip the menu ·
`?autostart=hard&demo=hard` watch AI vs AI.

## Working on it with Claude Code

`CLAUDE.md` briefs Claude Code on the project (rules, layout, commands, checklist), and
`.claude/` holds project permissions and a `/deploy` command that tests, rebuilds, pushes and
checks the live site. Open the folder in Claude Code (Terminal: `cd` into it and run `claude`,
or the Claude desktop app's **Code** tab) and describe the change you want.
`node tools/balance.mjs` runs a win-rate sweep after balance edits.

## Architecture

```
index.html, style.css          page shell, HUD and menu markup/styles
manifest.webmanifest, sw.js    PWA: Home Screen install, offline cache
standalone.html                generated single-file build (tools/bundle.mjs)
src/data.js                    ALL balance and content data
src/sim/                       deterministic simulation, no DOM (also runs in Node)
  game.js                      world state, fixed-step tick, win/draw rules, replay log
  commands.js                  the only way to change the sim (UI and AI both use it)
  map.js  pathfinding.js  spatial.js  rng.js
  movement.js  combat.js  units.js  buildings.js  fog.js  ai.js
src/client/                    presentation and input
  main.js                      boot, match lifecycle, loop (20 Hz sim, interpolated render)
  renderer.js  sprites.js      Canvas 2D drawing, effects, minimap, procedural art
  input.js  controller.js      pointer/keyboard handling, selection and command logic
  ui.js  audio.js  settings.js  app.js
tests/  tools/
```

- **Fixed timestep**: 20 ticks/s; rendering interpolates between the last two ticks.
- **Determinism**: seeded RNG, no wall-clock or `Math.random` in `src/sim`; all input is a serialisable command.
  `game.replay` holds the command log; `game.checksum()` hashes state. Same seed + same commands = same match.
- **Pathfinding**: A* on the tile grid (8-way, no corner cutting, typed arrays, binary heap), connected-component
  labels so unreachable goals never flood the map, line-of-sight smoothing, a per-tick path budget, and a
  straight-line shortcut when the goal is visible. Soft separation steering plus stuck detection
  (re-path → accept "close enough" → give up) keeps groups from stacking or deadlocking.
- **Spatial hash** for neighbour and target queries; pooled projectiles and particles; reused scratch arrays.
- **Adaptive resolution**: if frames run slow while JS cost is low (fill-rate bound), the canvas backing scale steps down.
- **AI**: plays through the same command queue, reads only its own fog and its own memory of enemy buildings.
  No resource or vision bonus at any level.

## Design decisions made where the brief left a choice

- Supply cap rather than a second resource.
- Buildings construct themselves once a worker places them; the worker goes back to mining.
- New workers auto-mine the nearest patch unless a rally point is set.
- On touch, tapping ground with units selected moves them, so deselecting is an explicit ✕ button.
- Both factions are playable, since the content is data-driven.
- A match ends in a stalemate if neither side has units, queued units or shards for a worker.
- Game title, factions and all names are invented for this project.

## Known limitations

- **Not yet run on a physical iPad.** Verified in headless Chromium with iPad touch emulation only. Safari-specific
  behaviour (audio unlock, safe areas, Home Screen fullscreen, real GPU frame rate) still needs a device pass.
- Frame rate was measured in software-rendered headless Chromium (no GPU): a steady 60 fps at 1x, and with 150+
  units fighting at 2x the game steps its render scale down to 1.5x and averages about 54 fps (18.6 ms, p95 33 ms).
  JS cost is under 1 ms to draw and under 1 ms per sim tick, so a real iPad GPU should have headroom, but that is unmeasured.
- Pathfinding ignores unit size (one clearance class) and has no flow fields; very large armies funnel slowly
  through the two narrow ridge gaps.
- In mirror-difficulty AI matches player 0 wins more often than player 1 (about 3 in 4 over 24 games), most
  likely an update-order advantage. It does not affect difficulty ordering: Hard beat Normal 12/12, Normal beat Easy 12/12.
- No shift-queued orders, no upgrades, no unit abilities, no air units, one map.
- Fog has no line-of-sight blocking by cliffs; sight is a plain radius.
- No save games; a match is lost if the page is closed. Portrait orientation only shows a "rotate" notice.
- The AI does not micro (no kiting or focus fire) and never rebuilds a lost expansion.

## Roadmap (in priority order)

1. **Device pass on real iPads** – frame-rate profiling, Safari audio and safe-area fixes, haptics.
2. **Save games and replays** – serialise the sim state; replays already work in principle from `game.replay`.
3. **Multiplayer** – deterministic lockstep over WebRTC/WebSocket using the existing command queue and
   checksum for desync detection; needs input delay, fixed-point or audited float math across devices.
4. **Depth** – upgrades at the tech building, one ability per advanced unit, shift-queue, formation move.
5. **Campaign** – scripted triggers and objectives on hand-made maps; a map format and simple editor.
6. **More factions and maps** – a third faction, 2v2 maps, larger maps with flow-field pathing.
7. **Presentation** – music, richer sprites and animation, a tutorial mission.
