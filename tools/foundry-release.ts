/**
 * `npm run foundry-release [-- --dry-run]`: registers the current version (module.json) with the
 * package listing on foundryvtt.com through the Package Release API
 * (https://foundryvtt.com/article/package-release-api/). Run it after the GitHub release of that
 * version exists: Foundry reads the release's own module.json, never the `latest` one.
 *
 * The token is the package's "Package Release Token" (package page on foundryvtt.com, above
 * "Save Package"). It is a secret: put it in the environment variable FOUNDRY_RELEASE_TOKEN or in
 * the gitignored file `.foundry-release-token` in the repo root, never in git or a chat.
 */
import fs from "node:fs";

const API = "https://foundryvtt.com/_api/packages/release_version/";
const dryRun = process.argv.includes("--dry-run");

function die(m: string): never {
  console.error(`foundry-release: ${m}`);
  process.exit(1);
}

const token =
  process.env.FOUNDRY_RELEASE_TOKEN?.trim() ||
  (fs.existsSync(".foundry-release-token")
    ? fs.readFileSync(".foundry-release-token", "utf8").trim()
    : "");
if (!token.startsWith("fvttp_")) {
  die(
    "no token: set FOUNDRY_RELEASE_TOKEN or write it to .foundry-release-token (starts with fvttp_)",
  );
}

const m = JSON.parse(fs.readFileSync("module.json", "utf8")) as {
  id: string;
  version: string;
  url: string;
  compatibility: { minimum: string; verified: string; maximum?: string };
};
const release = {
  version: m.version,
  manifest: `${m.url}/releases/download/v${m.version}/module.json`,
  notes: `${m.url}/releases/tag/v${m.version}`,
  compatibility: {
    minimum: m.compatibility.minimum,
    verified: m.compatibility.verified,
    maximum: m.compatibility.maximum ?? "",
  },
};

// The release's manifest must be downloadable and name this version before Foundry is told.
const probe = await fetch(release.manifest);
if (!probe.ok) die(`${release.manifest}: HTTP ${probe.status} (publish the GitHub release first)`);
const released = (await probe.json()) as { version?: string };
if (released.version !== m.version) {
  die(`the released module.json says ${released.version}, module.json says ${m.version}`);
}

const res = await fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: token },
  body: JSON.stringify({ id: m.id, "dry-run": dryRun, release }),
});
const text = await res.text();
if (res.status === 429) die(`rate limited, retry after ${res.headers.get("Retry-After")} s`);
if (!res.ok) die(`HTTP ${res.status}: ${text}`);
console.log(`foundry-release: ${m.id} ${m.version}${dryRun ? " (dry run)" : ""}: ${text}`);
