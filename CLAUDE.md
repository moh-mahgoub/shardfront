# Shardfront — notes for Claude Code

Original real-time strategy game for the browser, touch-first for iPad Safari (landscape).
Owner: Mohamed (GitHub `moh-mahgoub`). Repo: https://github.com/moh-mahgoub/shardfront
Live site (GitHub Pages, `main` branch, root): https://moh-mahgoub.github.io/shardfront/
The README is the player/maintainer guide; this file is how to work on the code.

## Hard rules

- **Original IP only.** No names, units, factions, art, sounds or UI from StarCraft/Blizzard or any other
  game. The local folder happens to be called "StarCraft Alike"; the game must not be.
- **No dependencies, no build step, no runtime network calls.** Plain HTML + ES modules + Canvas 2D.
  All art is drawn in code (`src/client/sprites.js`); all audio is synthesised (`src/client/audio.js`).
- **The simulation is deterministic.** Nothing under `src/sim/` may use `Math.random`, `Date`,
  `performance.now`, the DOM, or iteration order of anything unordered. Randomness comes from
  `game.rng` (seeded). Keep it runnable in plain Node.
- **The UI and the AI change the simulation only through commands** (`game.issue(cmd)`, applied in
  `src/sim/commands.js`). Never mutate sim state from `src/client/` except presentation-only fields
  prefixed with `_` (e.g. `_sel`, `_rf`).
- **Touch first.** Every control must work by touch with targets of at least 44 pt; mouse/keyboard is a fallback.
- **The AI must not cheat** at any difficulty: no extra resources, no vision outside its own fog.

## Layout

```
index.html, style.css            page shell, HUD + menus (DOM), CSS
src/data.js                      ALL balance/content numbers — tune here
src/sim/                         deterministic simulation (20 ticks/s)
  game.js      world, step(), win/draw rules, checksum(), replay log
  commands.js  move/amove/patrol/stop/hold/attack/gather/build/train/cancel/rally
  movement.js  path requests (budgeted), steering/separation, stuck handling
  pathfinding.js  A* on the tile grid, components, LOS smoothing
  combat.js  units.js  buildings.js  fog.js  ai.js  map.js  spatial.js  rng.js
src/client/                      rendering, input, UI (browser only)
  main.js      boot + loop (fixed step, interpolated render, adaptive resolution)
  renderer.js  sprites.js  input.js  controller.js  ui.js  audio.js  settings.js  app.js
sw.js, manifest.webmanifest, icons/   PWA (Home Screen + offline)
standalone.html                  GENERATED single-file build — never edit by hand
tests/ai-vs-ai.mjs               headless full matches + determinism check (plain Node)
tests/smoke.mjs                  Playwright, iPad touch emulation, end-to-end checks
tools/serve.mjs                  static server (prints the LAN URL for the iPad)
tools/bundle.mjs                 regenerates standalone.html
tools/balance.mjs                many AI-vs-AI matches → win rates per faction/difficulty
```

## Commands

```
node tools/serve.mjs                 # play at http://localhost:8080 (iPad: the LAN URL it prints)
node tests/ai-vs-ai.mjs              # must pass after ANY sim/AI/data change (~10 s)
node tests/ai-vs-ai.mjs --verbose    # minute-by-minute economy log
node tools/balance.mjs               # win-rate sweep after balance changes (~1-2 min)
node tools/bundle.mjs                # after ANY source change, so standalone.html stays current
node tests/smoke.mjs --shots         # browser test; screenshots → tests/screenshots/
```

The smoke test needs Playwright once: `npm i -D playwright && npx playwright install chromium`.
`node_modules/` and screenshots are git-ignored.

Useful URL params: `?seed=7`, `?debug=1` (FPS/tick/path overlay; also F3), `?autostart=hard`,
`?autostart=hard&demo=hard` (watch AI vs AI). In the console: `__app` (client state),
`__test.stress(260)` (spawns a battle), `__test.toScreen(x, y)`.

## Checklist for any change

1. `node tests/ai-vs-ai.mjs` passes (matches finish, no stuck units, deterministic).
2. `node tools/bundle.mjs` to refresh `standalone.html`.
3. If you added a file under `src/`, add it to the `FILES` list in `sw.js`.
4. For anything visible or touch-related, run `node tests/smoke.mjs --shots` and look at the screenshots.
5. Before deploying, bump `CACHE` in `sw.js` (e.g. `shardfront-v2`) so installed copies refresh.
6. Use `/deploy` to test, commit, push and verify the live site.

## One-time setup on Mohamed's Mac (do this if `git status` fails)

The local folder (`~/_My-AI-Apps/StarCraft Alike`) was created before the GitHub repo existed and may
not be a git checkout yet. Link it without losing local files:

```
git init -b main
git remote add origin https://github.com/moh-mahgoub/shardfront.git
git fetch origin
git reset origin/main          # mixed reset: adopts history, keeps the working files as they are
git restore .claude            # .claude/ (settings + /deploy) exists only on GitHub at first
git status                     # should be clean or show only real local edits
```

GitHub CLI: `brew install gh` then `gh auth login` (once). If Pages is not yet on, enable it:
`gh api -X POST repos/moh-mahgoub/shardfront/pages -f "source[branch]=main" -f "source[path]=/"`
(a 409 "already exists" response means it is already enabled).

## Gotchas

- `index.html` uses ES modules, so it must be served over http(s); `standalone.html` works from `file://`.
- The service worker is network-first, but stale copies can survive on an iPad's Home Screen app until
  `CACHE` is bumped.
- Balance: in mirror-difficulty AI matches, player 0 wins about 3 in 4 (likely update order). Fixing it
  would mean alternating or shuffling per-player update order inside `step()` while staying deterministic.
- Determinism is checked by checksum in `tests/ai-vs-ai.mjs`; a changed checksum after a pure refactor
  means behaviour changed.
- iPad/Safari specifics (audio unlock, safe areas, Home Screen fullscreen) have not been verified on a
  real device yet.
