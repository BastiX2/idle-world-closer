# Changelog

## 1.0.0 (2026-11-19)

- First stable release, for the package listing on foundryvtt.com. No functional changes since 0.1.1.

## 0.1.1 (2026-11-14)

- No on/off switch any more: the module works whenever it is enabled in the world.
- All UI texts and the package description are the author's own (German and English).
- The settings hints follow the chosen end action live in the settings window.
- The dialog says that any input cancels the countdown.
- The package no longer ships README.md and CHANGELOG.md (both stay on GitHub).

## 0.1.0

First version.

- Every client tracks its own input (mouse, keys, wheel, touch) and shares its idle time over the module
  socket. When every connected user is idle, a "Still there?" countdown runs on all clients; any input
  cancels it everywhere.
- After the countdown the active GM's client closes the world (the request `game.shutDown()` sends), or
  everybody is logged out when no GM is connected or "only log out" is chosen.
- World settings: on/off, idle minutes, countdown seconds, close the world or only log out.
- A clock jump (computer asleep, clock set) restarts the idle counting instead of acting on stale times;
  socket messages are validated; a failed shutdown request is logged and retried by the next countdown.
- English and German UI.
- Written in TypeScript and built with esbuild into one ES module; releases ship the built `module.zip`.
