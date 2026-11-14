import { describe, expect, it } from "vitest";
import {
  bumpChangelog,
  bumpJson,
  bumpLock,
  bumpModuleJson,
  isNewer,
  isVersion,
} from "../tools/release-lib.ts";

describe("release helpers", () => {
  it("validates versions", () => {
    expect(isVersion("1.2.3")).toBe(true);
    expect(isVersion("1.2")).toBe(false);
    expect(isVersion("v1.2.3")).toBe(false);
  });
  it("compares versions", () => {
    expect(isNewer("0.1.0", "0.1.1")).toBe(true);
    expect(isNewer("0.9.0", "0.10.0")).toBe(true);
    expect(isNewer("1.0.0", "0.9.9")).toBe(false);
    expect(isNewer("1.0.0", "1.0.0")).toBe(false);
  });
  it("bumps json text and the download url", () => {
    expect(bumpJson('{\n  "version": "0.1.0"\n}', "0.2.0")).toBe('{\n  "version": "0.2.0"\n}');
    const out = bumpModuleJson('{"version": "0.1.0", "download": "x/v0.1.0/module.zip"}', "0.2.0");
    expect(out).toContain('"version": "0.2.0"');
    expect(out).toContain("/releases/download/v0.2.0/module.zip");
  });
  it("bumps the lock file", () => {
    const out = JSON.parse(
      bumpLock('{"version":"0.1.0","packages":{"":{"version":"0.1.0"}}}', "0.2.0"),
    );
    expect(out.version).toBe("0.2.0");
    expect(out.packages[""].version).toBe("0.2.0");
    expect(JSON.parse(bumpLock('{"version":"0.1.0"}', "0.2.0")).version).toBe("0.2.0");
  });
  it("updates the changelog", () => {
    expect(bumpChangelog("# Changelog\n\n## Unreleased\n\n- a\n", "0.2.0", "2026-01-02")).toBe(
      "# Changelog\n\n## 0.2.0 (2026-01-02)\n\n- a\n", // the blank line after the heading stays
    );
    expect(bumpChangelog("# Changelog\n\n## 0.1.0\n", "0.2.0", "2026-01-02")).toMatch(
      /# Changelog\n\n## 0\.2\.0 \(2026-01-02\)\n\n- \n\n## 0\.1\.0/,
    );
    expect(() => bumpChangelog("# Changelog\n\n## 0.1.0\n", "0.1.0", "d")).toThrow();
  });
});
