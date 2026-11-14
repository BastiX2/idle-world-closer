export default [
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        game: "readonly",
        foundry: "readonly",
        Hooks: "readonly",
        window: "readonly",
        document: "readonly",
        URLSearchParams: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        setTimeout: "readonly",
        process: "readonly",
        console: "readonly",
        fetch: "readonly",
        URL: "readonly",
      },
    },
    rules: { "no-unused-vars": "error", "no-undef": "error" },
  },
];
