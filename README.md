# Idle World Closer

A small, system-agnostic module for Foundry VTT v14 that closes a world nobody is using any more, for
people who host their own server and don't want a world running all night.

## What it does

Every client watches its own user's input (mouse movement or clicks anywhere in the window, keys,
mouse wheel, touch) and tells the other clients how long it has been idle, once a minute and right
after input resumes from a long pause.

When **every** connected user has been idle for N minutes, every client shows a "Still there?"
countdown. Any input on any client cancels it everywhere. If it runs out:

- with a Gamemaster connected, **one** GM client (`game.users.activeGM`) closes the world (the same
  request as `game.shutDown()`, without its "other users are connected" prompt);
- with only players connected, every client logs out (`game.logOut()`).

Nobody is ever logged out while anyone is active. A user whose idle time hasn't been received yet is
not counted as idle until N minutes after they were first seen.

## Settings (world, GM only)

| Setting                                                 | Default         |
| ------------------------------------------------------- | --------------- |
| Close idle worlds (on/off)                              | on              |
| Idle minutes                                            | 10              |
| Countdown seconds                                       | 60              |
| When the countdown ends: close the world / only log out | close the world |

## With a server watchdog

Foundry's server only knows idle time in memory and counts little more than map mouse moves, so chat
or sheet work looks idle to it. This module decides in the browsers instead. If your server runs a
script that stops the world or the process when nobody is logged in, the "only log out" setting (or
the no-GM case) lets that script do the closing.

## Limits

- It needs at least one open browser to work. With no client connected there is nothing to count.
- A tab in the background still counts as connected; if its user is away it simply becomes idle.
- Clocks are never compared between machines (clients exchange "idle for X ms"), but a client whose
  browser throttles timers heavily may react a few seconds late.
- Closing the world needs a GM or server administrator account.

## Development

`npm install`, `npm test` (Vitest with coverage for the decision logic), `npm run lint`,
`npm run qa` (headless Foundry with two or three clients on port 30600; needs a local Foundry install).

For tests, the hidden world setting `idle-world-closer.test` (`{ thresholdSeconds, countdownSeconds,
shareSeconds }`) overrides the timings.

MIT licensed.
