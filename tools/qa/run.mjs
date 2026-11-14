/**
 * Two/three-client scenario for Idle World Closer against a real, headless Foundry (finite run).
 * Own data folder %LOCALAPPDATA%/FoundryVTT-QA-afk1, port 30600, a tiny offline test system.
 * Prints OK/FEHL per check; exit code 1 when a check failed.
 *
 * Needs: a local Foundry install (FOUNDRY_APP), a Foundry licence in %LOCALAPPDATA%/FoundryVTT/Config,
 * Playwright's Chromium (`npx playwright-core install chromium`).
 */
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = process.env.FOUNDRY_APP ?? "C:/Program Files/Foundry Virtual Tabletop/resources/app";
const NODE = path.join(APP, "..", "..", "Foundry Virtual Tabletop.exe");
const LOCAL = process.env.LOCALAPPDATA;
const DATA = process.env.FOUNDRY_QA_DATA ?? path.join(LOCAL, "FoundryVTT-QA-afk1");
const PORT = Number(process.env.FOUNDRY_QA_PORT ?? 30600);
const BASE = `http://127.0.0.1:${PORT}`;
const WORLD = "afkqa";
const MODULE = "idle-world-closer";
const TEST_TIMINGS = { thresholdSeconds: 4, countdownSeconds: 6, shareSeconds: 1 };

let failed = 0;
const check = (ok, text) => {
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FEHL"} ${text}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, timeout, what) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      // not yet
    }
    await sleep(250);
  }
  if (what) console.log(`WARTE Zeit abgelaufen: ${what}`);
  return null;
};

/** Writes the data folder: licence, a tiny test system, a copy of the module, a fresh world. */
function setupData() {
  fs.rmSync(DATA, { recursive: true, force: true });
  for (const d of [
    "Config",
    "Data/systems/afk-test-system",
    `Data/modules/${MODULE}`,
    `Data/worlds/${WORLD}`,
  ]) {
    fs.mkdirSync(path.join(DATA, d), { recursive: true });
  }
  fs.copyFileSync(
    path.join(LOCAL, "FoundryVTT", "Config", "license.json"),
    path.join(DATA, "Config", "license.json"),
  );
  const { release } = JSON.parse(fs.readFileSync(path.join(APP, "package.json"), "utf8"));
  const core = `${release.generation}.${release.build}`;
  const compat = { minimum: "14", verified: "14" };
  fs.writeFileSync(
    path.join(DATA, "Data/systems/afk-test-system/system.json"),
    JSON.stringify({
      id: "afk-test-system",
      title: "AFK Test System",
      version: "1.0.0",
      compatibility: compat,
    }),
  );
  // The module as built (what a release ships), not the sources
  execFileSync(process.execPath, ["tools/build.ts"], { cwd: REPO, stdio: "inherit" });
  fs.cpSync(path.join(REPO, "dist"), path.join(DATA, "Data/modules", MODULE), { recursive: true });
  fs.writeFileSync(
    path.join(DATA, "Data/worlds", WORLD, "world.json"),
    JSON.stringify({
      id: WORLD,
      title: "AFK QA",
      system: "afk-test-system",
      coreVersion: core,
      compatibility: compat,
    }),
  );
}

let server = null;
let serverLog = [];
async function startServer() {
  serverLog = [];
  server = spawn(
    NODE,
    [
      "--require",
      path.join(REPO, "tools", "qa", "als-node.cjs"),
      "main.mjs",
      `--dataPath=${DATA}`,
      `--port=${PORT}`,
      `--world=${WORLD}`,
      "--noupnp",
      "--noIPDiscovery",
    ],
    {
      cwd: APP,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    },
  );
  server.stdout.on("data", (d) => serverLog.push(String(d)));
  server.stderr.on("data", (d) => serverLog.push(String(d)));
  const up = await until(
    async () =>
      (await fetch(`${BASE}/join`)).ok && serverLog.join("").includes("Launching World | Complete"),
    90_000,
    "Foundry start",
  );
  if (!up) throw new Error(`Foundry did not start:\n${serverLog.join("")}`);
  await sleep(3000); // the server looks up its network addresses right after start
}
async function stopServer() {
  if (server && server.exitCode === null) {
    const done = new Promise((r) => server.once("exit", r));
    server.kill();
    await done;
  }
  fs.rmSync(path.join(DATA, "Config", "options.json.lock"), { recursive: true, force: true });
  server = null;
}
const status = async () => (await fetch(`${BASE}/api/status`)).json();

/** Logs a user in on a new browser context; returns its page. */
async function login(browser, name, { touch = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 700 },
    hasTouch: touch,
  });
  await context.addInitScript(() => {
    localStorage.setItem("core.tourProgress", '{"core":{"welcome":99}}');
    localStorage.setItem("core.performanceMode", "0");
    localStorage.setItem("core.maxFPS", "10");
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log(`[pageerror ${name}] ${e.message.slice(0, 200)}`));
  for (let i = 0; i < 6; i++) {
    await page.goto(`${BASE}/join`);
    const ok = await until(
      () =>
        page.evaluate((n) => {
          const o = [...document.querySelectorAll("select[name=userId] option")].find(
            (x) => x.textContent.trim() === n,
          );
          return o && !o.disabled;
        }, name),
      10_000,
    );
    if (ok) break;
    await sleep(1500);
  }
  await page.selectOption("select[name=userId]", { label: name });
  await page.click("button[name=join]");
  await page.waitForURL(/\/game$/, { timeout: 60_000 });
  await page.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90_000 });
  return page;
}

const shown = (page) => page.evaluate(() => !!document.querySelector("dialog.idle-world-closer"));
const bothShow =
  (...pages) =>
  async () => {
    for (const p of pages) if (!(await shown(p))) return false;
    return true;
  };
const noneShow =
  (...pages) =>
  async () => {
    for (const p of pages) if (await shown(p)) return false;
    return true;
  };
const setting = (page, key, value) =>
  page.evaluate(([id, k, v]) => game.settings.set(id, k, v), [MODULE, key, value]);
const closeUser = (page) => page.context().close();

/** A fresh server; the world (users, settings) is kept between runs. */
async function restart() {
  await stopServer();
  await startServer();
}

/** First run only: enable the module, create the users, switch the module off while people log in. */
async function prepareWorld(browser) {
  const gm = await login(browser, "Gamemaster");
  await gm.evaluate(async (id) => {
    await game.settings.set("core", "moduleConfiguration", { [id]: true });
  }, MODULE);
  await gm.reload();
  await gm.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90_000 });
  check(
    await gm.evaluate((id) => !!game.modules.get(id)?.active, MODULE),
    "module is active in the world",
  );
  await gm.evaluate(
    async ([id, t]) => {
      await game.settings.set(id, "enabled", false);
      await game.settings.set(id, "test", t);
      const roles = { P1: 1, P2: 1, GM2: 4 };
      for (const [name, role] of Object.entries(roles)) {
        if (!game.users.getName(name)) await User.create({ name, role });
      }
    },
    [MODULE, TEST_TIMINGS],
  );
  return gm;
}

/** A: input types, join/leave during a countdown, setting change, German UI (GM + players). */
async function runA(browser) {
  console.log("--- A: input types, join, GM reconnect, setting change, German");
  let gm = await prepareWorld(browser);
  const p1 = await login(browser, "P1", { touch: true });
  await sleep(1000);
  await setting(gm, "enabled", true);

  check(
    !!(await until(bothShow(gm, p1), 30_000, "countdown on both")),
    "(1) two idle users: both see the countdown",
  );
  const text = await gm.evaluate(
    () => document.querySelector(".idle-world-closer .iwc-text")?.textContent ?? "",
  );
  check(/\d+/.test(text), `(1) countdown text names the seconds: "${text.trim()}"`);

  const inputs = {
    "mouse move": () => p1.mouse.move(100, 100).then(() => p1.mouse.move(150, 160)),
    "pointer down": () => p1.mouse.down().then(() => p1.mouse.up()),
    "key down": () => p1.keyboard.press("Shift"),
    wheel: () => p1.mouse.wheel(0, 120),
    "touch (real tap)": () => p1.touchscreen.tap(60, 60),
    "touchstart (isolated event)": () =>
      p1.evaluate(() => window.dispatchEvent(new Event("touchstart", { bubbles: true }))),
  };
  for (const [name, act] of Object.entries(inputs)) {
    if (!(await until(bothShow(gm, p1), 40_000, `countdown before ${name}`))) {
      check(false, `(2) ${name}: no countdown to cancel`);
      continue;
    }
    await act();
    const gone = await until(noneShow(gm, p1), 3000, `${name} cancels`);
    check(!!gone, `(2) ${name} on P1 cancels the countdown on both clients`);
  }
  check((await status()).active === true, "(2) the world is still open after the cancels");

  // A user who joins during a countdown cancels it (long countdown so the login fits)
  await setting(gm, "test", { ...TEST_TIMINGS, countdownSeconds: 40 });
  await until(bothShow(gm, p1), 30_000, "countdown (40 s)");
  const p2 = await login(browser, "P2");
  check(
    !!(await until(noneShow(gm, p1), 5000, "join cancels")),
    "(5) a user joining during a countdown cancels it",
  );
  check((await status()).active === true, "(5) the world is still open");

  // The GM reconnects mid-countdown: the new session counts as activity
  await until(bothShow(gm, p1, p2), 40_000, "countdown with three users");
  await closeUser(gm);
  gm = await login(browser, "Gamemaster");
  check(
    !!(await until(noneShow(gm, p1, p2), 8000, "GM reconnect cancels")),
    "(6) the GM reconnecting mid-countdown cancels it for everybody",
  );
  check(
    (await status()).active === true && /\/game$/.test(p1.url()) && /\/game$/.test(p2.url()),
    "(6) nobody was logged out, the world is still open",
  );

  // A setting changed during a countdown cancels it everywhere
  await until(bothShow(gm, p1, p2), 40_000, "countdown before the setting change");
  await setting(gm, "action", "logout");
  check(
    !!(await until(noneShow(gm, p1, p2), 5000, "setting change cancels")),
    "(7) changing a setting during a countdown cancels it on every client",
  );
  await setting(gm, "action", "close");

  // German strings
  await p1.evaluate(() => game.settings.set("core", "language", "de"));
  await p1.reload();
  await p1.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90_000 });
  await until(bothShow(p1), 60_000, "countdown on the German client");
  const de = await p1.evaluate(() => ({
    title: document.querySelector("dialog.idle-world-closer .window-title")?.textContent?.trim(),
    text: document.querySelector("dialog.idle-world-closer .iwc-text")?.textContent?.trim(),
    button: document
      .querySelector("dialog.idle-world-closer button[data-action=here]")
      ?.textContent?.trim(),
  }));
  check(de.title === "Noch da?", `(8) German title: "${de.title}"`);
  check(
    /^Seit einiger Zeit war niemand aktiv\. Die Welt wird in \d+ Sekunden geschlossen\.$/.test(
      de.text ?? "",
    ),
    `(8) German text: "${de.text}"`,
  );
  check(de.button === "Ich bin da", `(8) German button: "${de.button}"`);
  await until(bothShow(gm, p1), 30_000, "countdown on both after the German reload");
  const en = await gm.evaluate(() =>
    document.querySelector("dialog.idle-world-closer .window-title")?.textContent?.trim(),
  );
  check(en === "Still there?", `(8) the English client still shows "${en}"`);

  await setting(gm, "enabled", false);
  await p1.evaluate(() => game.settings.set("core", "language", "en"));
  for (const page of [gm, p1, p2]) await closeUser(page);
}

/** B: players only, in tabs that are in the background: still counted, countdown and logout run. */
async function runB(browser) {
  console.log("--- B: players only, background tabs (visibility simulated)");
  await restart();
  await backgroundTabs(browser);
}

async function backgroundTabs(browser) {
  const gm = await login(browser, "Gamemaster");
  await setting(gm, "enabled", false);
  await setting(gm, "test", TEST_TIMINGS);
  const players = [];
  for (const name of ["P1", "P2"]) {
    const page = await login(browser, name);
    // Playwright keeps every tab "visible" (focus emulation), so the page is told it is hidden.
    // Real timer throttling of background tabs cannot be reproduced this way.
    await page.evaluate(() => {
      for (const [k, v] of [
        ["visibilityState", "hidden"],
        ["hidden", true],
      ]) {
        Object.defineProperty(document, k, { get: () => v, configurable: true });
      }
      document.dispatchEvent(new Event("visibilitychange"));
    });
    players.push(page);
  }
  const visibility = await Promise.all(
    players.map((p) => p.evaluate(() => document.visibilityState)),
  );
  console.log(`INFO visibilityState of the game tabs: ${visibility.join(", ")}`);
  check(
    visibility.every((v) => v === "hidden"),
    "(9) the player tabs report being in the background",
  );
  await setting(gm, "enabled", true);
  await sleep(500);
  await closeUser(gm);
  check(
    !!(await until(bothShow(...players), 40_000, "countdown in hidden tabs")),
    "(9) hidden tabs show the countdown",
  );
  const out = await until(
    async () => players.every((p) => /\/join/.test(p.url())),
    60_000,
    "players logged out",
  );
  check(!!out, "(4) only players idle (hidden tabs): both are logged out");
  check((await status()).active === true, "(4) the world stays open");
  for (const p of players) await closeUser(p);
}

/** C: two GM clients idle: exactly one shutdown request. */
async function runC(browser) {
  console.log("--- C: two GMs");
  await restart();
  const gm = await login(browser, "Gamemaster");
  await setting(gm, "enabled", false);
  await setting(gm, "test", TEST_TIMINGS); // an earlier run may have left other timings behind
  const gm2 = await login(browser, "GM2");
  const posts = [];
  const errors = [];
  for (const [name, page] of [
    ["GM", gm],
    ["GM2", gm2],
  ]) {
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname.endsWith("/setup")) posts.push(name);
    });
    page.on("response", (r) => {
      if (r.request().method() === "POST" && r.url().endsWith("/setup")) {
        console.log(
          `INFO ${name}: POST /setup answered ${r.status()} location=${r.headers().location ?? "-"} at ${new Date().toISOString()}`,
        );
      }
    });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  }
  await setting(gm, "enabled", true);
  check(
    !!(await until(bothShow(gm, gm2), 30_000, "countdown")),
    "(10) two idle GMs: both see the countdown",
  );
  const closedC = await until(
    async () => (await status()).active === false,
    60_000,
    "world closed",
  );
  check(!!closedC, "(10) the world is closed");
  if (!closedC) {
    console.log(
      `INFO activeGM seen by GM: ${await gm.evaluate(() => game.users.activeGM?.name)}, by GM2: ${await gm2.evaluate(() => game.users.activeGM?.name)}`,
    );
    console.log(
      `INFO status: ${JSON.stringify(await status())}; GM url ${gm.url()}, GM2 url ${gm2.url()}`,
    );
    console.log(
      serverLog.join("").split(String.fromCharCode(10)).slice(-25).join(String.fromCharCode(10)),
    );
  }
  await sleep(3000);
  check(
    posts.length === 1,
    `(10) exactly one client sent the shutdown request (${posts.join(", ") || "none"})`,
  );
  const real = errors.filter(
    (e) => !/Failed to load resource|net::ERR|disconnected|socket/i.test(e),
  );
  check(
    real.length === 0,
    `(10) no errors on the two GM clients${real.length ? ": " + real[0] : ""}`,
  );
  await closeUser(gm);
  await closeUser(gm2);
}

/** D: smoke test with the real minimum settings: 1 minute, 10 s countdown. */
async function runD(browser) {
  console.log("--- D: real minimum (1 minute, 10 s)");
  await restart();
  const gm = await login(browser, "Gamemaster");
  await setting(gm, "enabled", false);
  const p1 = await login(browser, "P1");
  await setting(gm, "test", {});
  await setting(gm, "minutes", 1);
  await setting(gm, "countdown", 10);
  const t0 = Date.now();
  await setting(gm, "enabled", true);
  await sleep(40_000);
  check(
    !(await shown(gm)) && !(await shown(p1)),
    "(11) no countdown after 40 s of a 1-minute threshold",
  );
  const seen = await until(bothShow(gm, p1), 60_000, "countdown at 1 minute");
  const t = (Date.now() - t0) / 1000;
  check(
    !!seen && t >= 55 && t <= 85,
    `(11) countdown starts after about 1 minute (${t.toFixed(0)} s)`,
  );
  const closed = await until(async () => (await status()).active === false, 40_000, "world closed");
  const t2 = (Date.now() - t0) / 1000;
  check(
    !!closed && t2 >= 63 && t2 <= 100,
    `(11) the world closes after the 10 s countdown (${t2.toFixed(0)} s)`,
  );
  await closeUser(gm);
  await closeUser(p1);
}

async function main() {
  const wanted = process.argv.slice(2).map((x) => x.toUpperCase());
  const runs = { A: runA, B: runB, C: runC, D: runD };
  const names = wanted.length ? wanted : Object.keys(runs);
  setupData();
  await startServer();
  const browser = await chromium.launch({
    channel: process.env.QA_BROWSER ?? "chromium",
    headless: process.env.QA_HEADED !== "1",
  });
  try {
    for (const n of names) {
      if (n !== "A" && n === names[0]) await prepareFirst(browser);
      await runs[n](browser);
    }
  } finally {
    await browser.close().catch(() => {});
    await stopServer();
  }
}

/** When A is not run first (filtering), the world still needs its module and users. */
async function prepareFirst(browser) {
  const gm = await prepareWorld(browser);
  await closeUser(gm);
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FEHL Abbruch: ${e.stack ?? e}`);
  console.log(serverLog.join("").slice(-1500));
  await stopServer().catch(() => {});
}
console.log(failed ? `\n${failed} Pruefung(en) FEHL` : "\nalle Pruefungen OK");
process.exit(failed ? 1 : 0);
