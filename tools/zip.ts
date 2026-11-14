/**
 * `npm run zip`: writes module.zip from dist/. The files sit at the zip root (module.json at the
 * top), the layout Foundry's installer expects from a manifest's `download` URL.
 */
import { zipSync } from "fflate";
import fs from "node:fs";
import path from "node:path";

if (!fs.existsSync("dist/module.json")) {
  console.error("zip: dist/ is missing, run `npm run build` first");
  process.exit(1);
}

const files: Record<string, Uint8Array> = {};
function walk(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else files[path.relative("dist", full).split(path.sep).join("/")] = fs.readFileSync(full);
  }
}
walk("dist");

fs.writeFileSync("module.zip", zipSync(files, { level: 9 }));
console.log(`module.zip: ${Object.keys(files).length} files`);
