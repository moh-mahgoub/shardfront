---
description: Test, rebuild, commit and push Shardfront to GitHub, then confirm the GitHub Pages site is live.
disable-model-invocation: true
allowed-tools: Bash(node tests/ai-vs-ai.mjs *) Bash(node tools/bundle.mjs) Bash(git add *) Bash(git commit *) Bash(git push *) Bash(gh api *) Bash(curl *)
---

Deploy Shardfront to https://moh-mahgoub.github.io/shardfront/ . $ARGUMENTS is an optional
one-line summary of the change, used in the commit message.

1. If `git status` fails, do the one-time setup in CLAUDE.md first.
2. Run `node tests/ai-vs-ai.mjs`. Stop and report if it fails; do not deploy a failing build.
3. Run `node tools/bundle.mjs` so `standalone.html` matches the source.
4. If any file under `src/`, `index.html`, `style.css` or `sw.js` changed since the last deploy
   (`git diff --stat origin/main`), bump the `CACHE` version string in `sw.js` by one.
   Check that every file under `src/` is listed in the `FILES` array in `sw.js`.
5. Show `git status --short`, then commit everything with a clear message (use $ARGUMENTS if given).
   Never commit `node_modules/`, `tests/screenshots/` or `.claude/settings.local.json`.
6. `git push origin main`.
7. Make sure Pages is on: `gh api repos/moh-mahgoub/shardfront/pages`. If that returns 404, enable it with
   `gh api -X POST repos/moh-mahgoub/shardfront/pages -f "source[branch]=main" -f "source[path]=/"`.
8. Wait for the build: poll `gh api repos/moh-mahgoub/shardfront/pages/builds/latest --jq .status` every
   15 s (up to ~3 min) until it is `built`; report the error if it is `errored`.
9. Confirm with `curl -sI https://moh-mahgoub.github.io/shardfront/` (expect 200) and
   `curl -s https://moh-mahgoub.github.io/shardfront/sw.js | grep CACHE` (expect the new version).
10. Report the live URL and the commit hash. Remind Mohamed that an iPad Home Screen copy refreshes
    on its next launch while online.
