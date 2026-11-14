# Changelog

## Unreleased

- A clock jump (computer asleep, clock set) restarts the idle counting instead of acting on stale times.
- Socket messages are validated; unknown or malformed ones are ignored.
- A failed shutdown request is logged and retried by the next countdown.
- Release workflow (tag `v*` builds `module.zip`), `npm run release`, package URLs in `module.json`.

## 0.1.0

- First version: per-client input tracking, shared over the module socket; countdown dialog when every
  connected user is idle; the active GM's client closes the world, or everybody is logged out.
- World settings: on/off, idle minutes, countdown seconds, close the world or only log out.
- English and German UI.
