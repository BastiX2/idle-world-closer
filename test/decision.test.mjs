import { describe, expect, it } from "vitest";
import {
  activeSince,
  allIdle,
  endAction,
  isClockJump,
  isResume,
  lastInputFromReport,
  MAX_TICK_GAP_MS,
  parseMessage,
  secondsLeft,
  timings,
} from "../scripts/decision.mjs";

const MIN = 60_000;

describe("activeSince", () => {
  it("prefers the reported last input", () => {
    expect(activeSince({ id: "a", lastInput: 5, firstSeen: 1 })).toBe(5);
  });
  it("falls back to the first sight when nothing was reported", () => {
    expect(activeSince({ id: "a", lastInput: null, firstSeen: 7 })).toBe(7);
  });
});

describe("allIdle", () => {
  const now = 100 * MIN;
  it("is false without users", () => {
    expect(allIdle(now, [], 10 * MIN)).toBe(false);
  });
  it("is true when everyone passed the threshold (boundary included)", () => {
    const users = [
      { id: "a", lastInput: now - 10 * MIN, firstSeen: 0 },
      { id: "b", lastInput: now - 30 * MIN, firstSeen: 0 },
    ];
    expect(allIdle(now, users, 10 * MIN)).toBe(true);
  });
  it("is false when one user was active a moment ago", () => {
    const users = [
      { id: "a", lastInput: now - 30 * MIN, firstSeen: 0 },
      { id: "b", lastInput: now - 1000, firstSeen: 0 },
    ];
    expect(allIdle(now, users, 10 * MIN)).toBe(false);
  });
  it("does not count a never-heard user as idle before the threshold since first sight", () => {
    const users = [
      { id: "a", lastInput: now - 30 * MIN, firstSeen: 0 },
      { id: "b", lastInput: null, firstSeen: now - 2 * MIN },
    ];
    expect(allIdle(now, users, 10 * MIN)).toBe(false);
    expect(allIdle(now + 8 * MIN, users, 10 * MIN)).toBe(true);
  });
});

describe("endAction", () => {
  it("lets only the active GM close the world", () => {
    const base = { closeWorld: true, activeGmId: "gm" };
    expect(endAction({ ...base, selfId: "gm" })).toBe("close");
    expect(endAction({ ...base, selfId: "p1" })).toBe("wait");
  });
  it("logs everybody out without a GM", () => {
    expect(endAction({ closeWorld: true, activeGmId: null, selfId: "p1" })).toBe("logout");
  });
  it("logs everybody out, GM included, when only logging out is configured", () => {
    expect(endAction({ closeWorld: false, activeGmId: "gm", selfId: "gm" })).toBe("logout");
    expect(endAction({ closeWorld: false, activeGmId: "gm", selfId: "p1" })).toBe("logout");
  });
});

describe("isResume", () => {
  it("announces input after a long silence only", () => {
    expect(isResume(10_000, 10_000)).toBe(true);
    expect(isResume(9_999, 10_000)).toBe(false);
  });
});

describe("lastInputFromReport", () => {
  it("converts an idle duration to the local clock", () => {
    expect(lastInputFromReport(1000, 400)).toBe(600);
  });
  it("ignores negative or invalid durations", () => {
    expect(lastInputFromReport(1000, -5)).toBe(1000);
    expect(lastInputFromReport(1000, "x")).toBe(1000);
    expect(lastInputFromReport(1000, undefined)).toBe(1000);
  });
});

describe("secondsLeft", () => {
  it("rounds up and never goes negative", () => {
    expect(secondsLeft(0, 1500)).toBe(2);
    expect(secondsLeft(0, 1000)).toBe(1);
    expect(secondsLeft(5000, 1000)).toBe(0);
  });
});

describe("timings", () => {
  const s = { minutes: 10, countdownSeconds: 60 };
  it("uses the settings", () => {
    expect(timings(s, null)).toEqual({
      thresholdMs: 600_000,
      countdownMs: 60_000,
      shareMs: 60_000,
    });
    expect(timings(s, {})).toEqual({ thresholdMs: 600_000, countdownMs: 60_000, shareMs: 60_000 });
  });
  it("lets the test override win", () => {
    expect(timings(s, { thresholdSeconds: 3, countdownSeconds: 2, shareSeconds: 1 })).toEqual({
      thresholdMs: 3000,
      countdownMs: 2000,
      shareMs: 1000,
    });
  });
  it("falls back to defaults for missing settings", () => {
    expect(timings({}, null)).toEqual({
      thresholdMs: 600_000,
      countdownMs: 60_000,
      shareMs: 60_000,
    });
  });
});

describe("isClockJump", () => {
  it("accepts normal and throttled ticks", () => {
    expect(isClockJump(1000, 2000)).toBe(false);
    expect(isClockJump(0, 60_000)).toBe(false);
  });
  it("detects sleep and a clock set backwards", () => {
    expect(isClockJump(0, MAX_TICK_GAP_MS + 1)).toBe(true);
    expect(isClockJump(5000, 4000)).toBe(true);
    expect(isClockJump(0, 50, 10)).toBe(true);
  });
});

describe("parseMessage", () => {
  it("accepts reports", () => {
    expect(parseMessage({ type: "state", userId: "u", idleMs: 5 })).toEqual({
      type: "state",
      userId: "u",
      idleMs: 5,
    });
    expect(parseMessage({ type: "active", userId: "u" })).toEqual({
      type: "active",
      userId: "u",
      idleMs: 0,
    });
  });
  it("clamps negative idle times", () => {
    expect(parseMessage({ type: "state", userId: "u", idleMs: -9 }).idleMs).toBe(0);
  });
  it("ignores everything else", () => {
    for (const bad of [
      null,
      undefined,
      "x",
      42,
      {},
      { type: "ping", userId: "u" },
      { type: "state" },
      { type: "state", userId: "" },
      { type: "state", userId: 5 },
      { type: "state", userId: "u", idleMs: "5" },
      { type: "state", userId: "u", idleMs: NaN },
      { type: "state", userId: "u", idleMs: Infinity },
    ]) {
      expect(parseMessage(bad)).toBeNull();
    }
  });
});
