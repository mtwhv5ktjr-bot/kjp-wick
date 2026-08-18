// SHIP GATE — the one command that takes an iteration to production.
//   node tools/ship.mjs            gate only (no deploy)
//   node tools/ship.mjs --deploy   gate, then push + vercel --prod, then verify live
//
// Refuses to ship if:
//   - VERSION in js/core.js does not match the top entry of CHANGELOG.md
//   - any js/*.js fails a syntax check
//   - the map solver fails any level
// This is what makes "100 iterations" mean 100 NUMBERED, LOGGED, PROVEN builds
// rather than 100 commits.
import { readFileSync, readdirSync } from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const NODE = process.execPath;
let fails = 0;
const ok = (b, msg) => { console.log((b ? "  ✓ " : "  ✗ ") + msg); if (!b) fails++; };

console.log("SHIP GATE");
const core = readFileSync(join(root, "js/core.js"), "utf8");
const ver = (/const VERSION = "([^"]+)"/.exec(core) || [])[1];
const log = readFileSync(join(root, "CHANGELOG.md"), "utf8");
const top = (/^## ([0-9]+\.[0-9]+\.[0-9]+)/m.exec(log) || [])[1];
ok(!!ver, "VERSION present in js/core.js: " + ver);
ok(!!top, "CHANGELOG.md has a top entry: " + top);
ok(ver === top, "VERSION matches CHANGELOG top entry" + (ver !== top ? "  (" + ver + " vs " + top + ")" : ""));

for (const f of readdirSync(join(root, "js")).filter(f => f.endsWith(".js"))){
  const r = spawnSync(NODE, ["--check", join(root, "js", f)], { encoding: "utf8" });
  ok(r.status === 0, "syntax  " + f + (r.status ? "\n" + r.stderr.split("\n").slice(0, 3).join("\n") : ""));
}
const solver = spawnSync(NODE, [join(root, "tools/qa-node.mjs")], { encoding: "utf8" });
const solverFails = (solver.stdout.match(/^FAIL/gm) || []).length;
ok(solver.status === 0 && solverFails === 0, "map solver: " + ((solver.stdout.match(/^PASS/gm) || []).length) + " pass, " + solverFails + " fail");

if (fails){ console.log("\nGATE FAILED — " + fails + " problem(s). Nothing shipped."); process.exit(1); }
console.log("\nGATE PASSED — v" + ver);

if (!process.argv.includes("--deploy")) process.exit(0);

console.log("\nDEPLOY v" + ver);
/* npx lives beside the node that is running this script — put its folder on
   PATH so a plain shell (which has no global node) can find it */
const nodeDir = dirname(NODE);
const env = Object.assign({}, process.env, { PATH: nodeDir + ";" + (process.env.PATH || "") });
const sh = (cmd, args, opts) => spawnSync(cmd, args, Object.assign({ cwd: root, encoding: "utf8", shell: true, env }, opts || {}));
sh("git", ["push", "-q", "origin", "HEAD"]);
const dep = sh(join(nodeDir, "npx.cmd"), ["vercel", "deploy", "--prod", "--yes"]);
const url = (/"url":\s*"([^"]+)"/.exec(dep.stdout + dep.stderr) || [])[1];
ok(!!url, "vercel deployed: " + (url || "(no url in output)"));
/* verify the LIVE build carries this version — the deploy step can succeed and
   still serve stale files (it has, when vercel.json missed a folder) */
try {
  const live = await (await fetch("https://kjp-game.wick.pics/js/core.js?cb=" + Date.now())).text();
  const liveVer = (/const VERSION = "([^"]+)"/.exec(live) || [])[1];
  ok(liveVer === ver, "LIVE build is v" + liveVer + (liveVer === ver ? "" : "  — expected v" + ver));
} catch(e){ ok(false, "could not read the live build: " + e.message); }
process.exit(fails ? 1 : 0);
