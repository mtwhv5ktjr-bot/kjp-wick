// Headless map QA: evals levels.js + world.js and runs solveLevel over all maps.
// Usage: node tools/qa-node.mjs   (exit 1 on any failure — CI-able)
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import vm from "vm";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = vm.createContext({ module: { exports: {} }, console });
for (const f of ["js/levels.js", "js/world.js"])
  vm.runInContext(readFileSync(join(root, f), "utf8"), ctx, { filename: f });

const { solveLevel } = ctx.module.exports;
let bad = 0;
for (let n = 1; n <= 6; n++){
  const r = solveLevel(n);
  const name = vm.runInContext(`LEVELS[${n}].name`, ctx);
  console.log((r.ok ? "PASS" : "FAIL") + "  L" + n + " " + name);
  for (const e of r.errs){ console.log("      ✗ " + e); bad++; }
  for (const w of r.warn) console.log("      ~ " + w);
}
process.exit(bad ? 1 : 0);
