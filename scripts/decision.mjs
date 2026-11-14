/**
 * Pure decision logic of Idle World Closer: no Foundry globals, no timers, so it can be unit tested.
 * All times are milliseconds.
 */

/**
 * @typedef {object} UserState
 * @property {string} id
 * @property {number|null} lastInput   When the user's last input happened (this client's clock), or
 *                                     null if no report has been received yet.
 * @property {number} firstSeen        When this client first saw the user active.
 */

/**
 * The moment from which a user counts as idle: their last input, or, if we never heard from them,
 * the time we first saw them (so such a user is not idle before `thresholdMs` have passed since then).
 * @param {UserState} user
 * @returns {number}
 */
export function activeSince(user) {
  return user.lastInput ?? user.firstSeen;
}

/**
 * Has every given user been idle for at least `thresholdMs`? An empty list is never idle.
 * @param {number} now
 * @param {UserState[]} users  The currently active (connected) users
 * @param {number} thresholdMs
 * @returns {boolean}
 */
export function allIdle(now, users, thresholdMs) {
  if (!users.length) return false;
  return users.every((u) => now - activeSince(u) >= thresholdMs);
}

/**
 * What this client does when the countdown has run out.
 * @param {object} p
 * @param {boolean} p.closeWorld          Setting: close the world (true) or only log out (false)
 * @param {string|null} p.activeGmId      `game.users.activeGM?.id`, the same on every client
 * @param {string} p.selfId
 * @returns {"close"|"logout"|"wait"}  "close": send the shutdown request; "logout": log this
 *   client out; "wait": do nothing (another client closes the world and takes this one down).
 */
export function endAction({ closeWorld, activeGmId, selfId }) {
  if (!activeGmId || !closeWorld) return "logout";
  return activeGmId === selfId ? "close" : "wait";
}

/**
 * Does returning to activity warrant telling the others right away (instead of at the next regular
 * report)? True when the client had been silent for at least `minIdleMs` before this input.
 * @param {number} idleBeforeMs  Time since the previous input
 * @param {number} minIdleMs
 * @returns {boolean}
 */
export function isResume(idleBeforeMs, minIdleMs) {
  return idleBeforeMs >= minIdleMs;
}

/**
 * Converts a received "idle for X ms" report into a last-input time on this client's clock
 * (clocks of different machines are never compared).
 * @param {number} now
 * @param {number} idleMs
 * @returns {number}
 */
export function lastInputFromReport(now, idleMs) {
  return now - Math.max(0, Number(idleMs) || 0);
}

/**
 * Seconds left of a countdown, never negative.
 * @param {number} now
 * @param {number} deadline
 * @returns {number}
 */
export function secondsLeft(now, deadline) {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

/**
 * Effective timings: the world settings, overridden by the hidden test setting when present.
 * @param {{minutes:number, countdownSeconds:number}} settings
 * @param {{thresholdSeconds?:number, countdownSeconds?:number, shareSeconds?:number}|null} test
 * @returns {{thresholdMs:number, countdownMs:number, shareMs:number}}
 */
export function timings(settings, test) {
  const t = test ?? {};
  const pos = (v, fallback) => (Number(v) > 0 ? Number(v) : fallback);
  return {
    thresholdMs: pos(t.thresholdSeconds, pos(settings.minutes, 10) * 60) * 1000,
    countdownMs: pos(t.countdownSeconds, pos(settings.countdownSeconds, 60)) * 1000,
    shareMs: pos(t.shareSeconds, 60) * 1000,
  };
}
