/** Pure helpers of `npm run release`: version bumps in the project's text files. */

export const REPO_URL = "https://github.com/BastiX2/idle-world-closer";

/** @param {string} v */
export const isVersion = (v) => /^\d+\.\d+\.\d+$/.test(v);

/**
 * Sets the version in a JSON file's text, keeping its formatting.
 * @param {string} text
 * @param {string} version
 */
export function bumpJson(text, version) {
  return text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
}

/**
 * module.json: the version and the download URL of the tag's zip.
 * @param {string} text
 * @param {string} version
 */
export function bumpModuleJson(text, version) {
  return bumpJson(text, version).replace(
    /("download":\s*")[^"]*(")/,
    `$1${REPO_URL}/releases/download/v${version}/module.zip$2`,
  );
}

/**
 * package-lock.json: the project's own version (top level and the root package entry).
 * @param {string} text
 * @param {string} version
 */
export function bumpLock(text, version) {
  const data = JSON.parse(text);
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  return `${JSON.stringify(data, null, 2)}\n`;
}

/**
 * CHANGELOG.md: turns an "## Unreleased" heading into the version, or adds an empty entry.
 * @param {string} text
 * @param {string} version
 * @param {string} date  YYYY-MM-DD
 */
export function bumpChangelog(text, version, date) {
  if (new RegExp(`^## ${version.replaceAll(".", "\\.")}\\b`, "m").test(text)) {
    throw new Error(`CHANGELOG.md already has an entry for ${version}`);
  }
  const heading = `## ${version} (${date})`;
  if (/^## Unreleased\s*$/m.test(text)) return text.replace(/^## Unreleased\s*$/m, heading);
  return text.replace(/^# Changelog\s*\n/, `# Changelog\n\n${heading}\n\n- \n\n`);
}

/**
 * Is `next` a higher version than `current`?
 * @param {string} current
 * @param {string} next
 */
export function isNewer(current, next) {
  const a = current.split(".").map(Number);
  const b = next.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] > a[i];
  return false;
}
