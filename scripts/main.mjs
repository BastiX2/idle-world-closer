/**
 * Idle World Closer: closes an idle world. Each client tracks its own input and shares its idle
 * time over the module socket; when every connected user is idle, a countdown runs and then the
 * active GM's client shuts the world down (or everybody logs out).
 */
import {
  allIdle,
  endAction,
  isResume,
  lastInputFromReport,
  secondsLeft,
  timings,
} from "./decision.mjs";

const ID = "idle-world-closer";
const SOCKET = `module.${ID}`;
const TICK_MS = 1000;
const THROTTLE_MS = 500;

const loc = (key, data) => game.i18n.format(`IDLE-WORLD-CLOSER.${key}`, data ?? {});

/** @type {Map<string, {lastInput:number|null, firstSeen:number}>} */
const seen = new Map();
let lastOwnInput = Date.now();
let lastShare = 0;
let lastEvent = 0;
let deadline = null;
let dialog = null;
let ticker = null;
let listening = false;

const setting = (key) => game.settings.get(ID, key);
const cfg = () =>
  timings({ minutes: setting("minutes"), countdownSeconds: setting("countdown") }, setting("test"));

/** Sends this client's idle time (or an "active" cancel) to everybody else. */
function share(type = "state") {
  lastShare = Date.now();
  game.socket.emit(SOCKET, { type, userId: game.user.id, idleMs: Date.now() - lastOwnInput });
}

function onInput() {
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

function listen(on) {
  if (listening === on) return;
  listening = on;
  const method = on ? "addEventListener" : "removeEventListener";
  const opts = { passive: true, capture: true };
  for (const type of ["mousemove", "pointerdown", "keydown", "wheel", "touchstart"]) {
    window[method](type, onInput, opts);
  }
}

function onMessage(msg) {
  if (!msg || typeof msg.userId !== "string" || msg.userId === game.user.id) return;
  const now = Date.now();
  const entry = seen.get(msg.userId) ?? { lastInput: null, firstSeen: now };
  entry.lastInput = lastInputFromReport(now, msg.idleMs);
  seen.set(msg.userId, entry);
  if (msg.type === "active" && deadline !== null) cancel();
}

/** Keeps `seen` in line with the connected users and returns them as decision input. */
function connectedUsers(now) {
  const active = game.users.filter((u) => u.active);
  const ids = new Set(active.map((u) => u.id));
  for (const id of seen.keys()) if (!ids.has(id)) seen.delete(id);
  return active.map((u) => {
    if (u.id === game.user.id) return { id: u.id, lastInput: lastOwnInput, firstSeen: now };
    if (!seen.has(u.id)) seen.set(u.id, { lastInput: null, firstSeen: now });
    return { id: u.id, ...seen.get(u.id) };
  });
}

function tick() {
  const now = Date.now();
  const { thresholdMs, countdownMs, shareMs } = cfg();
  if (now - lastShare >= shareMs) share();
  const idle = allIdle(now, connectedUsers(now), thresholdMs);
  if (deadline === null) {
    if (idle) startCountdown(now + countdownMs);
  } else if (!idle) {
    cancel();
  } else if (now >= deadline) {
    finish();
  } else {
    updateDialog(now);
  }
}

function dialogText(now) {
  const key = setting("action") === "logout" ? "Dialog.BodyLogout" : "Dialog.Body";
  return loc(key, { seconds: secondsLeft(now, deadline) });
}

function startCountdown(end) {
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
  dialog.render({ force: true });
}

function updateDialog(now) {
  const p = dialog?.element?.querySelector(".iwc-text");
  if (p) p.textContent = dialogText(now);
}

function cancel() {
  deadline = null;
  const d = dialog;
  dialog = null;
  d?.close({ animate: false }).catch(() => {});
}

async function finish() {
  deadline = null;
  const action = endAction({
    closeWorld: setting("action") !== "logout",
    activeGmId: game.users.activeGM?.id ?? null,
    selfId: game.user.id,
  });
  const d = dialog;
  dialog = null;
  if (action === "close") {
    // The request `game.shutDown()` sends, without its "other users connected" confirmation
    await foundry.utils.fetchWithTimeout(foundry.utils.getRoute("setup"), {
      method: "POST",
      body: new URLSearchParams({ action: "worldShutdown" }),
      redirect: "manual",
    });
  } else if (action === "logout") {
    game.logOut();
  } else {
    d?.close({ animate: false }).catch(() => {});
  }
}

function start() {
  stop();
  if (!setting("enabled")) return;
  lastOwnInput = Date.now();
  listen(true);
  ticker = setInterval(tick, TICK_MS);
}

function stop() {
  clearInterval(ticker);
  ticker = null;
  listen(false);
  cancel();
}

Hooks.once("init", () => {
  const restart = () => game.ready && start();
  const base = { scope: "world", requiresReload: false, onChange: restart };
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

Hooks.once("ready", () => {
  game.socket.on(SOCKET, onMessage);
  start();
});
