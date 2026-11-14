/**
 * Two/three-client scenario for Idle World Closer against a real, headless Foundry (finite run).
 * Own data folder %LOCALAPPDATA%/FoundryVTT-QA-afk1, port 30600, a tiny offline test system.
 * Prints OK/FEHL per check; exit code 1 when a check failed.
 *
 * Needs: a local Foundry install (FOUNDRY_APP), a Foundry licence in %LOCALAPPDATA%/FoundryVTT/Config,
 * Playwright's Chromium (`npx playwright-core install chromium`).
 */
import { spawn } from "node:child_process";
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
  for (const f of ["module.json", "scripts", "lang"]) {
    fs.cpSync(path.join(REPO, f), path.join(DATA, "Data/modules", MODULE, f), { recursive: true });
  }
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
async function login(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
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

const countdownVisible = (page) =>
  page.evaluate(() => !!document.querySelector("dialog.idle-world-closer"));

async function main() {
  setupData();
  await startServer();
  const browser = await chromium.launch({
    channel: process.env.QA_BROWSER ?? "chromium",
    headless: process.env.QA_HEADED !== "1",
  });
  try {
    // --- Setup: enable the module, create players, switch the module off while people log in
    let gm = await login(browser, "Gamemaster");
    await gm.evaluate(async (id) => {
      await game.settings.set("core", "moduleConfiguration", { [id]: true });
    }, MODULE);
    await gm.reload();
    await gm.waitForFunction(() => globalThis.game?.ready === true, null, { timeout: 90_000 });
    const loaded = await gm.evaluate((id) => !!game.modules.get(id)?.active, MODULE);
    check(loaded, "module is active in the world");
    await gm.evaluate(
      async ([id, t]) => {
        await game.settings.set(id, "enabled", false);
        await game.settings.set(id, "test", t);
        for (const name of ["P1", "P2"]) {
          if (!game.users.getName(name)) await User.create({ name, role: CONST.USER_ROLES.PLAYER });
        }
      },
      [MODULE, TEST_TIMINGS],
    );
    const enable = (page, on) =>
      page.evaluate(([id, v]) => game.settings.set(id, "enabled", v), [MODULE, on]);

    // --- (1) + (2) + (3): GM and P1 idle
    const p1 = await login(browser, "P1");
    await sleep(1000);
    await enable(gm, true);
    const seenBoth = await until(
      async () => (await countdownVisible(gm)) && (await countdownVisible(p1)),
      30_000,
      "countdown on both",
    );
    check(!!seenBoth, "(1) two idle users: both see the countdown");
    const textOk = await gm.evaluate(
      () => document.querySelector(".idle-world-closer .iwc-text")?.textContent ?? "",
    );
    check(/\d+/.test(textOk), `(1) countdown text names the seconds: "${textOk.trim()}"`);

    await p1.mouse.move(100, 100);
    await p1.mouse.move(150, 160);
    const gone = await until(
      async () => !(await countdownVisible(gm)) && !(await countdownVisible(p1)),
      3000,
      "countdown cancelled",
    );
    check(!!gone, "(2) input on P1 cancels the countdown on both clients");
    await sleep(1500);
    check((await status()).active === true, "(2) the world is still open after the cancel");

    const closed = await until(
      async () => (await status()).active === false,
      40_000,
      "world closed",
    );
    check(!!closed, "(3) GM + player idle: the world is closed (status active=false)");

    // --- (4): players only
    await gm.context().close();
    await p1.context().close();
    await stopServer();
    await startServer();
    gm = await login(browser, "Gamemaster");
    await gm.evaluate(([id]) => game.settings.set(id, "enabled", false), [MODULE]);
    const q1 = await login(browser, "P1");
    const q2 = await login(browser, "P2");
    await sleep(1000);
    await enable(gm, true);
    await sleep(500);
    await gm.context().close(); // the GM leaves; only players stay
    const out = await until(
      async () => /\/join/.test(q1.url()) && /\/join/.test(q2.url()),
      60_000,
      "players logged out",
    );
    check(!!out, "(4) only players idle: both are logged out");
    check((await status()).active === true, "(4) the world stays open");
  } finally {
    await browser.close().catch(() => {});
    await stopServer();
  }
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
