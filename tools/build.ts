/**
 * `npm run build [-- --watch]`: bundles src/main.ts into dist/scripts/main.js (one ES module with a
 * source map) and copies what the installed module folder needs next to it.
 */
import * as esbuild from "esbuild";
import fs from "node:fs";

const watch = process.argv.includes("--watch");
const STATIC = ["module.json", "lang", "LICENSE", "README.md", "CHANGELOG.md"];

function copyStatic(): void {
  for (const entry of STATIC) fs.cpSync(entry, `dist/${entry}`, { recursive: true });
}

fs.rmSync("dist", { recursive: true, force: true });
fs.mkdirSync("dist", { recursive: true });
copyStatic();

const options: esbuild.BuildOptions = {
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "esm",
  target: "es2022",
  outfile: "dist/scripts/main.js",
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching src/ (static files were copied once; rebuild for changes to them)");
} else {
  await esbuild.build(options);
}
