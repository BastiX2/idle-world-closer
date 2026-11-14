/** Pure helpers of `npm run release`: version bumps in the project's text files. */

export const REPO_URL = "https://github.com/BastiX2/idle-world-closer";

export const isVersion = (v: string): boolean => /^\d+\.\d+\.\d+$/.test(v);

/**
 * Sets the version in a JSON file's text, keeping its formatting.
 */
export function bumpJson(text: string, version: string): string {
  return text.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`);
}

/**
 * module.json: the version and the download URL of the tag's zip.
 */
export function bumpModuleJson(text: string, version: string): string {
  return bumpJson(text, version).replace(
    /("download":\s*")[^"]*(")/,
    `$1${REPO_URL}/releases/download/v${version}/module.zip$2`,
  );
}

/**
 * package-lock.json: the project's own version (top level and the root package entry).
 */
export function bumpLock(text: string, version: string): string {
  const data = JSON.parse(text) as {
    version?: string;
    packages?: Record<string, { version?: string }>;
  };
  data.version = version;
  if (data.packages?.[""]) data.packages[""].version = version;
  return `${JSON.stringify(data, null, 2)}\n`;
}

/**
 * CHANGELOG.md: turns an "## Unreleased" heading into the version, or adds an empty entry.
 */
export function bumpChangelog(text: string, version: string, date: string): string {
  if (new RegExp(`^## ${version.replaceAll(".", "\\.")}\\b`, "m").test(text)) {
    throw new Error(`CHANGELOG.md already has an entry for ${version}`);
  }
  const heading = `## ${version} (${date})`;
  // [ \t]*, not \s*: \s would swallow the blank line after the heading (Prettier then fails in CI)
  if (/^## Unreleased[ \t]*$/m.test(text)) return text.replace(/^## Unreleased[ \t]*$/m, heading);
  return text.replace(/^# Changelog\s*\n/, `# Changelog\n\n${heading}\n\n- \n\n`);
}

/**
 * Is `next` a higher version than `current`?
 */
export function isNewer(current: string, next: string): boolean {
  const a = current.split(".").map(Number);
  const b = next.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return (b[i] ?? 0) > (a[i] ?? 0);
  return false;
}
