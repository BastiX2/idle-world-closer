# Idle World Closer

A small, system-agnostic module for Foundry VTT v14 that closes a world nobody is using any more. It is
meant for people who host their own server and don't want a world running all night because the last
player forgot to log out.

## What it does

Every browser watches its own user's input (mouse movement or clicks anywhere in the window, keys, mouse
wheel, touch). Foundry's own idle detection only notices map mouse moves, so someone typing in the chat or
working on a sheet would look idle to it; here, any input counts.

When **every** connected user has been idle for the configured time, every client shows a "Still there?"
countdown dialog. Any input on any client cancels it for everybody. If the countdown runs out:

- with a Gamemaster connected, that GM's client (one of them, if there are several) closes the world and
  returns the server to the setup screen;
- with only players connected, every client logs out.

Nobody is ever logged out or kicked while anyone is active. A user who joins during the countdown, or a GM
who reconnects, cancels it.

## Settings

World settings, shown to the Gamemaster only (Configure Settings, Module Settings):

| Setting                                                 | Default         |
| ------------------------------------------------------- | --------------- |
| Close idle worlds (master switch)                       | on              |
| Idle minutes (1 to 720)                                 | 10              |
| Countdown seconds (10 to 600)                           | 60              |
| When the countdown ends: close the world / only log out | close the world |

Changing a setting while a countdown is running cancels the countdown on every client.

## Together with a server watchdog

If you run your own server, you may already have (or want) a small script, for example a systemd timer or a
cron job, that stops Foundry when nobody has been connected for a few minutes. This module pairs with it in
two ways:

- Leave it on **close the world**: the GM's client returns the server to setup, which frees the memory of
  the world, while the Foundry process keeps running for the next session.
- Choose **only log out**: everybody is disconnected, and your watchdog, which sees zero connected users,
  stops the world or the whole service after its own grace period. The module never touches the server
  itself.

Either way the watchdog should wait a few minutes after the last user has left, so that a quick reload is
not treated as an empty server.

## Limits

- Players cannot close a world. Foundry only lets a Gamemaster (or the server administrator) do that, so
  closing needs a GM connected when the countdown ends. With only players connected, they are logged out
  and nothing else happens.
- The module only runs in open browsers. With nobody connected there is nothing to count, so it does not
  start a world, stop a server process or replace a real server-side watchdog.
- Browsers slow down timers in tabs that have been in the background for a while (down to once a minute),
  so in such a tab the countdown can end up to a minute late. Idle detection itself is not affected: a
  background tab simply has no input.
- A computer that was asleep (a closed laptop lid) or a clock that was set restarts the idle counting, so
  waking up never closes a world on the spot.
- A single idle browser tab with a Gamemaster logged in is enough to close the world, as designed: it is
  the same as the GM being away.

## Privacy

The module sends nothing outside your world. The clients exchange "idle for so many seconds" and "someone
is active" over the world's own socket, the one Foundry uses for everything else, and the module stores
nothing except its settings. No input content (keys, positions) is read, recorded or sent; only the fact
that input happened. There is no telemetry and no external request.

## Development

The module is written in TypeScript (`src/`, strict) and bundled with esbuild into one ES module. Foundry's
installer never compiles anything, so the installed folder holds the built JavaScript only.

| Command                                      | What it does                                                                                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install`                                | Installs the (exactly pinned) dev dependencies                                                                                                          |
| `npm run build` / `npm run build -- --watch` | Bundles `src/main.ts` into `dist/scripts/main.js` (+ source map) and copies `module.json`, `lang/`, `LICENSE`, `README.md`, `CHANGELOG.md` into `dist/` |
| `npm run zip`                                | Writes `module.zip` from `dist/` (files at the zip root, `module.json` on top)                                                                          |
| `npm run check`                              | `tsc --noEmit`, ESLint (typescript-eslint), Prettier, Vitest with coverage                                                                              |
| `npm run qa`                                 | Headless Foundry with up to three clients on port 30600, using the built `dist/` (needs a local Foundry install and licence; own data folder)           |
| `npm run release -- <version> [--dry-run]`   | Bumps the version in `module.json`, `package.json`, the lock file and the changelog, commits and tags `v<version>`; never pushes                        |

For a development install, build and link or copy `dist/` to `Data/modules/idle-world-closer` of your
Foundry data folder (`--watch` keeps it current).

The decision logic (`src/decision.ts`) has no Foundry dependency and is unit tested; `src/foundry.d.ts` declares
only the parts of the Foundry v14 API the module calls. For tests, the hidden world setting
`idle-world-closer.test` (`{ thresholdSeconds, countdownSeconds, shareSeconds }`) overrides the timings.

Releasing: `npm run release -- 0.2.0`, then `git push origin main v0.2.0`. The workflow
(`.github/workflows/release.yml`) runs the checks, builds, zips and publishes `module.zip` and `module.json`
as a release.

MIT licensed.
