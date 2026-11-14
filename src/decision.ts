/**
 * Pure decision logic of Idle World Closer: no Foundry globals, no timers, so it can be unit tested.
 * All times are milliseconds.
 */

export interface UserState {
  id: string;
  /** When the user's last input happened (this client's clock), or null if no report arrived yet. */
  lastInput: number | null;
  /** When this client first saw the user active. */
  firstSeen: number;
}

/**
 * The moment from which a user counts as idle: their last input, or, if we never heard from them,
 * the time we first saw them (so such a user is not idle before `thresholdMs` have passed since then).
 */
export function activeSince(user: UserState): number {
  return user.lastInput ?? user.firstSeen;
}

/**
 * Has every given user been idle for at least `thresholdMs`? An empty list is never idle.
 * @param users The currently active (connected) users
 */
export function allIdle(now: number, users: UserState[], thresholdMs: number): boolean {
  if (!users.length) return false;
  return users.every((u) => now - activeSince(u) >= thresholdMs);
}

/**
 * What this client does when the countdown has run out.
 * - "close": send the shutdown request
 * - "logout": log this client out
 * - "wait": do nothing (another client closes the world and takes this one down)
 */
export function endAction(p: {
  /** Setting: close the world (true) or only log out (false) */
  closeWorld: boolean;
  /** `game.users.activeGM?.id`, the same on every client */
  activeGmId: string | null;
  selfId: string;
}): "close" | "logout" | "wait" {
  if (!p.activeGmId || !p.closeWorld) return "logout";
  return p.activeGmId === p.selfId ? "close" : "wait";
}

/**
 * Does returning to activity warrant telling the others right away (instead of at the next regular
 * report)? True when the client had been silent for at least `minIdleMs` before this input.
 * @param idleBeforeMs Time since the previous input
 */
export function isResume(idleBeforeMs: number, minIdleMs: number): boolean {
  return idleBeforeMs >= minIdleMs;
}

/**
 * Converts a received "idle for X ms" report into a last-input time on this client's clock
 * (clocks of different machines are never compared). Invalid values count as "just now".
 */
export function lastInputFromReport(now: number, idleMs: unknown): number {
  return now - Math.max(0, Number(idleMs) || 0);
}

/** Seconds left of a countdown, never negative. */
export function secondsLeft(now: number, deadline: number): number {
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export interface TestOverride {
  thresholdSeconds?: number;
  countdownSeconds?: number;
  shareSeconds?: number;
}

/**
 * Effective timings: the world settings, overridden by the hidden test setting when present.
 */
export function timings(
  settings: { minutes?: number; countdownSeconds?: number },
  test: TestOverride | null | undefined,
): { thresholdMs: number; countdownMs: number; shareMs: number } {
  const t = test ?? {};
  const pos = (v: unknown, fallback: number): number => (Number(v) > 0 ? Number(v) : fallback);
  return {
    thresholdMs: pos(t.thresholdSeconds, pos(settings.minutes, 10) * 60) * 1000,
    countdownMs: pos(t.countdownSeconds, pos(settings.countdownSeconds, 60)) * 1000,
    shareMs: pos(t.shareSeconds, 60) * 1000,
  };
}

/**
 * Longest gap between two one-second ticks that is still normal. Browsers throttle timers in
 * background tabs (down to one run per minute after a while), so this must stay above a minute;
 * a longer gap means the computer slept or the clock was set.
 */
export const MAX_TICK_GAP_MS = 120_000;

/**
 * Did the clock jump (laptop lid closed, system clock set) between two ticks? Idle times measured
 * across such a jump mean nothing, so the caller restarts its bookkeeping instead of acting on them.
 */
export function isClockJump(
  previousTick: number,
  now: number,
  maxGapMs: number = MAX_TICK_GAP_MS,
): boolean {
  return now < previousTick || now - previousTick > maxGapMs;
}

export interface Report {
  type: "state" | "active";
  userId: string;
  idleMs: number;
}

/**
 * Validates a socket message. Anything that is not a well-formed report (other module versions,
 * other modules' payloads, garbage) yields null and is ignored.
 */
export function parseMessage(msg: unknown): Report | null {
  if (!msg || typeof msg !== "object") return null;
  const { type, userId, idleMs } = msg as Record<string, unknown>;
  if (type !== "state" && type !== "active") return null;
  if (typeof userId !== "string" || !userId) return null;
  if (idleMs !== undefined && !(typeof idleMs === "number" && Number.isFinite(idleMs))) return null;
  return { type, userId, idleMs: Math.max(0, (idleMs as number | undefined) ?? 0) };
}

/** Settings whose hint follows the chosen end action (the action setting's own hint). */
export const ACTION_HINT_SETTINGS = { action: "Action" } as const;

/** The lang key of a setting's hint for the chosen end action ("close" or "logout"). */
export function actionHintKey(setting: keyof typeof ACTION_HINT_SETTINGS, action: string): string {
  const suffix = action === "logout" ? "HintLogout" : "Hint";
  return `IDLE-WORLD-CLOSER.Settings.${ACTION_HINT_SETTINGS[setting]}.${suffix}`;
}
