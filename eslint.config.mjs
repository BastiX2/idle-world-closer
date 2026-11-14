import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "node_modules/", "tools/qa/ausgabe/"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ["src/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "error" },
  },
  {
    // The QA runner is plain JS; its page.evaluate callbacks use the browser's and Foundry's globals
    files: ["tools/qa/*.mjs", "tools/qa/*.cjs"],
    languageOptions: {
      globals: {
        game: "readonly",
        User: "readonly",
        CONST: "readonly",
        localStorage: "readonly",
        Event: "readonly",
        window: "readonly",
        document: "readonly",
        URL: "readonly",
        fetch: "readonly",
        console: "readonly",
        process: "readonly",
        setTimeout: "readonly",
      },
    },
  },
);
