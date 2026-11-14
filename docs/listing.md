# Foundry package listing (draft)

Not submitted. Text for the package page once the repository is public and a release exists.

## Title

Idle World Closer

## Short description (one line)

Closes a world nobody is using: when every connected user has been idle for a while, everyone gets a "Still there?" countdown, then the GM's client shuts the world down.

## Description

Self-hosting a world means a world that keeps running when everybody has wandered off. Foundry itself can
only tell that a world is idle by watching mouse moves on the map, so a player busy in the chat or on a
character sheet looks like they are gone.

Idle World Closer watches input in every browser instead: mouse, keys, wheel and touch anywhere in the
window. The clients share nothing but "idle for X seconds" over the world's own socket. When **everyone** has been idle for the time you choose
(10 minutes by default), all clients show a "Still there?" countdown (60 seconds by default). Any input on any
client cancels it for everybody. If it runs out:

- a connected Gamemaster's client closes the world and returns the server to setup;
- with only players connected, everybody is logged out (a server-side watchdog can then stop the world).

Nobody is ever logged out while anyone is active. A joining user or a reconnecting GM cancels the
countdown. A laptop that wakes from sleep starts counting from scratch instead of closing the world.

**Settings** (GM only): on/off switch, idle minutes, countdown seconds, close the world or only log out.

**Good to know:** players cannot close a world, so closing needs a GM connected; with only players the
module logs them out. It needs at least one open browser to run and never starts or stops the server
process on its own. No data leaves your world.

Works with any game system. English and German.

## Tags

utility, server, quality of life

## Compatibility

Foundry VTT v14 (minimum 14, verified 14)

## Links

- Source and issues: https://github.com/BastiX2/idle-world-closer
- Manifest: https://github.com/BastiX2/idle-world-closer/releases/latest/download/module.json

(The repository is private for now; these links work once it is public.)
