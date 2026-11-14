import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/decision.ts", "tools/release-lib.ts"],
      reporter: ["text"],
    },
  },
});
