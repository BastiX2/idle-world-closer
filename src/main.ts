/**
 * Idle World Closer: closes an idle world. Each client tracks its own input and shares its idle
 * time over the module socket; when every connected user is idle, a countdown runs and then the
 * active GM's client shuts the world down (or everybody logs out).
 */
import {
  ACTION_HINT_SETTINGS,
  actionHintKey,
  allIdle,
  endAction,
  isClockJump,
  isResume,
  lastInputFromReport,
  parseMessage,
  secondsLeft,
  timings,
  type TestOverride,
  type UserState,
} from "./decision.ts";

const ID = "idle-world-closer";
const SOCKET = `module.${ID}`;
const TICK_MS = 1000;
const THROTTLE_MS = 500;

const loc = (key: string, data?: Record<string, unknown>): string =>
  game.i18n.format(`IDLE-WORLD-CLOSER.${key}`, data ?? {});

type Seen = { lastInput: number | null; firstSeen: number };
const seen = new Map<string, Seen>();
let lastOwnInput = Date.now();
let lastShare = 0;
let lastEvent = 0;
let lastTick = Date.now();
let deadline: number | null = null;
let dialog: DialogV2Instance | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let listening = false;

const setting = <T>(key: string): T => game.settings.get(ID, key) as T;
const cfg = () =>
  timings(
    { minutes: setting<number>("minutes"), countdownSeconds: setting<number>("countdown") },
    setting<TestOverride | null>("test"),
  );

/** Sends this client's idle time (or an "active" cancel) to everybody else. */
function share(type: "state" | "active" = "state"): void {
  lastShare = Date.now();
  game.socket.emit(SOCKET, { type, userId: game.user.id, idleMs: Date.now() - lastOwnInput });
}

function onInput(): void {
  const now = Date.now();
  if (now - lastEvent < THROTTLE_MS) return;
  lastEvent = now;
  const before = now - lastOwnInput;
  lastOwnInput = now;
  if (deadline !== null) {
    cancel();
    share("active");
  } else if (isResume(before, Math.min(10_000, cfg().shareMs / 2))) {
    share("state");
  }
}

function listen(on: boolean): void {
  if (listening === on) return;
  listening = on;
  const opts = { passive: true, capture: true };
  for (const type of ["mousemove", "pointerdown", "keydown", "wheel", "touchstart"]) {
    if (on) window.addEventListener(type, onInput, opts);
    else window.removeEventListener(type, onInput, opts);
  }
}

function onMessage(raw: unknown): void {
  const msg = parseMessage(raw);
  if (!msg || msg.userId === game.user.id || !game.users.has(msg.userId)) return;
  const now = Date.now();
  const entry: Seen = seen.get(msg.userId) ?? { lastInput: null, firstSeen: now };
  entry.lastInput = lastInputFromReport(now, msg.idleMs);
  seen.set(msg.userId, entry);
  if (msg.type === "active" && deadline !== null) cancel();
}

/** Keeps `seen` in line with the connected users and returns them as decision input. */
function connectedUsers(now: number): UserState[] {
  const active = game.users.filter((u) => u.active);
  const ids = new Set(active.map((u) => u.id));
  for (const id of seen.keys()) if (!ids.has(id)) seen.delete(id);
  return active.map((u) => {
    if (u.id === game.user.id) return { id: u.id, lastInput: lastOwnInput, firstSeen: now };
    const entry = seen.get(u.id) ?? { lastInput: null, firstSeen: now };
    seen.set(u.id, entry);
    return { id: u.id, ...entry };
  });
}

function tick(): void {
  const now = Date.now();
  const jumped = isClockJump(lastTick, now);
  lastTick = now;
  if (jumped) {
    // The computer slept or the clock was set: idle times measured across that are meaningless.
    // Start over as if everybody (including us) had just been seen, and tell the others.
    seen.clear();
    lastOwnInput = now;
    cancel();
    share("state");
    return;
  }
  const { thresholdMs, countdownMs, shareMs } = cfg();
  if (now - lastShare >= shareMs) share();
  const idle = allIdle(now, connectedUsers(now), thresholdMs);
  if (deadline === null) {
    if (idle) startCountdown(now + countdownMs);
  } else if (!idle) {
    cancel();
  } else if (now >= deadline) {
    void finish();
  } else {
    updateDialog(now);
  }
}

function dialogText(now: number): string {
  const key = setting<string>("action") === "logout" ? "Dialog.BodyLogout" : "Dialog.Body";
  return loc(key, { seconds: secondsLeft(now, deadline ?? now) });
}

function startCountdown(end: number): void {
  deadline = end;
  const { DialogV2 } = foundry.applications.api;
  dialog = new DialogV2({
    window: { title: "IDLE-WORLD-CLOSER.Dialog.Title", icon: "fa-solid fa-hourglass-half" },
    classes: ["idle-world-closer"],
    content: `<p class="iwc-text">${dialogText(Date.now())}</p>`,
    buttons: [
      {
        action: "here",
        label: "IDLE-WORLD-CLOSER.Dialog.Here",
        icon: "fa-solid fa-hand",
        default: true,
      },
    ],
    submit: () => {},
  });
  void dialog.render({ force: true });
}

function updateDialog(now: number): void {
  const p = dialog?.element?.querySelector(".iwc-text");
  if (p) p.textContent = dialogText(now);
}

function cancel(): void {
  deadline = null;
  const d = dialog;
  dialog = null;
  d?.close({ animate: false }).catch(() => {});
}

async function finish(): Promise<void> {
  deadline = null;
  const action = endAction({
    closeWorld: setting<string>("action") !== "logout",
    activeGmId: game.users.activeGM?.id ?? null,
    selfId: game.user.id,
  });
  const d = dialog;
  dialog = null;
  if (action === "logout") {
    game.logOut();
    return;
  }
  d?.close({ animate: false }).catch(() => {});
  if (action !== "close") return;
  try {
    // The request `game.shutDown()` sends, without its "other users connected" confirmation
    await foundry.utils.fetchWithTimeout(foundry.utils.getRoute("setup"), {
      method: "POST",
      body: new URLSearchParams({ action: "worldShutdown" }),
      redirect: "manual",
    });
  } catch (err) {
    // Still idle: the next tick starts a new countdown and tries again
    console.error(`${ID} | closing the world failed`, err);
  }
}

function start(): void {
  stop();
  if (!setting<boolean>("enabled")) return;
  lastOwnInput = Date.now();
  lastTick = lastOwnInput;
  listen(true);
  ticker = setInterval(tick, TICK_MS);
}

function stop(): void {
  if (ticker !== null) clearInterval(ticker);
  ticker = null;
  listen(false);
  cancel();
}

Hooks.once("init", () => {
  const restart = (): void => {
    if (game.ready) start();
  };
  const base = { scope: "world", requiresReload: false, onChange: restart } as const;
  game.settings.register(ID, "enabled", {
    ...base,
    name: "IDLE-WORLD-CLOSER.Settings.Enabled.Name",
    hint: "IDLE-WORLD-CLOSER.Settings.Enabled.Hint",
    config: true,
    type: Boolean,
    default: true,
  });
  game.settings.register(ID, "minutes", {
    ...base,
    name: "IDLE-WORLD-CLOSER.Settings.Minutes.Name",
    hint: "IDLE-WORLD-CLOSER.Settings.Minutes.Hint",
    config: true,
    type: new foundry.data.fields.NumberField({
      required: true,
      integer: true,
      min: 1,
      max: 720,
      initial: 10,
    }),
    default: 10,
  });
  game.settings.register(ID, "countdown", {
    ...base,
    name: "IDLE-WORLD-CLOSER.Settings.Countdown.Name",
    hint: "IDLE-WORLD-CLOSER.Settings.Countdown.Hint",
    config: true,
    type: new foundry.data.fields.NumberField({
      required: true,
      integer: true,
      min: 10,
      max: 600,
      initial: 60,
    }),
    default: 60,
  });
  game.settings.register(ID, "action", {
    ...base,
    name: "IDLE-WORLD-CLOSER.Settings.Action.Name",
    hint: "IDLE-WORLD-CLOSER.Settings.Action.Hint",
    config: true,
    type: String,
    default: "close",
    choices: {
      close: "IDLE-WORLD-CLOSER.Settings.Action.Close",
      logout: "IDLE-WORLD-CLOSER.Settings.Action.Logout",
    },
  });
  // Hidden test override { thresholdSeconds, countdownSeconds, shareSeconds }; {} = off
  game.settings.register(ID, "test", {
    ...base,
    config: false,
    type: Object,
    default: {},
  });
});

/**
 * In the settings window the action setting's hint follows its dropdown live, before saving
 * (the user's texts: one for closing the world, one for logging everybody out).
 */
function bindActionHints(root: HTMLElement): void {
  const select = root.querySelector<HTMLSelectElement>(`select[name="${ID}.action"]`);
  if (!select) return;
  const update = (): void => {
    for (const setting of Object.keys(
      ACTION_HINT_SETTINGS,
    ) as (keyof typeof ACTION_HINT_SETTINGS)[]) {
      const field = root.querySelector(`[name="${ID}.${setting}"]`);
      const hint = field?.closest(".form-group")?.querySelector(".hint");
      if (hint) hint.textContent = game.i18n.localize(actionHintKey(setting, select.value));
    }
  };
  select.addEventListener("change", update);
  update();
}

Hooks.on("renderSettingsConfig", (_app: unknown, element: HTMLElement) => bindActionHints(element));

Hooks.once("ready", () => {
  game.socket.on(SOCKET, onMessage);
  start();
});
