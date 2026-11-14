/**
 * `npm run release -- <version> [--dry-run]`: bumps the version in module.json, package.json,
 * package-lock.json and CHANGELOG.md, commits and creates the tag `v<version>`. It never pushes:
 * `git push origin main v<version>` starts the release workflow.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import {
  bumpChangelog,
  bumpJson,
  bumpLock,
  bumpModuleJson,
  isNewer,
  isVersion,
} from "./release-lib.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const version = args.find((a) => !a.startsWith("--"));
const git = (...a: string[]): string => execFileSync("git", a, { encoding: "utf8" }).trim();
function die(m: string): never {
  console.error(`release: ${m}`);
  process.exit(1);
}

if (!version || !isVersion(version)) die("usage: npm run release -- <x.y.z> [--dry-run]");
const current = (JSON.parse(fs.readFileSync("module.json", "utf8")) as { version: string }).version;
if (!isNewer(current, version)) die(`${version} is not newer than the current ${current}`);
if (!dryRun && git("status", "--porcelain")) die("the working tree is not clean");
if (git("tag", "--list", `v${version}`)) die(`tag v${version} already exists`);

const date = new Date().toISOString().slice(0, 10);
const edits: Record<string, (t: string) => string> = {
  "module.json": (t) => bumpModuleJson(t, version),
  "package.json": (t) => bumpJson(t, version),
  "package-lock.json": (t) => bumpLock(t, version),
  "CHANGELOG.md": (t) => bumpChangelog(t, version, date),
};
const results = Object.entries(edits).map(([file, fn]): [string, string] => [
  file,
  fn(fs.readFileSync(file, "utf8")),
]);
if (dryRun) {
  console.log(
    `release (dry run): ${current} -> ${version}, files: ${results.map((r) => r[0]).join(", ")}`,
  );
  process.exit(0);
}
for (const [file, text] of results) fs.writeFileSync(file, text);
git("add", ...results.map((r) => r[0]));
git("commit", "-m", `Release ${version}`);
git("tag", `v${version}`);
console.log(
  `Committed and tagged v${version}. Not pushed; to publish: git push origin main v${version}`,
);
