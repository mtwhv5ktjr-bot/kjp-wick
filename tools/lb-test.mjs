// Prove the self-hosted board: real signatures, real round-trip, real rails.
import { createRequire } from "module";
const ethers = createRequire("C:/Users/Bia/New folder/wick-arsenal/")("ethers");
const LB = (process.env.LB || "http://localhost:8110") + "/api/leaderboard";
const HEALTH = (process.env.LB || "http://localhost:8110") + "/api/health";

const post = b => fetch(LB, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })
  .then(async r => ({ s: r.status, j: await r.json() }));
const sign = async (w, score, mode) => {
  const m = `WICK score\naddress:${w.address}\nscore:${score}\nmode:${mode}\nts:${Date.now()}`;
  return { address: w.address, score, mode, level: 3, message: m, signature: await w.signMessage(m) };
};

const A = ethers.Wallet.createRandom(), B = ethers.Wallet.createRandom();
let pass = 0, fail = 0;
const chk = (ok, label, extra) => { ok ? pass++ : fail++; console.log("  " + (ok ? "✓" : "✗") + " " + label + (extra ? "  " + extra : "")); };

console.log("=== post two real signed scores ===");
let r = await post({ ...await sign(A, 18500, "kjp"), name: "REGINA" });
chk(r.s === 200, "A 18,500 accepted", "rank " + r.j.rank);
r = await post({ ...await sign(B, 24100, "kjp"), name: "SWITCHBOARD" });
chk(r.s === 200, "B 24,100 accepted", "rank " + r.j.rank);

console.log("=== read it back ===");
const g = await (await fetch(LB + "?mode=kjp")).json();
g.top.forEach((e, i) => console.log("   " + (i + 1) + ". " + String(e.name).padEnd(13) + String(e.score).padStart(7)));
chk(g.top.length === 2 && g.top[0].score === 24100, "sorted, highest first");
chk(g.self_hosted === true, "reports self_hosted (the site shows this)");

console.log("=== anti-cheat rails ===");
r = await post({ ...await sign(A, 9, "kjp"), name: "X" });
chk(!!r.j.unchanged, "a lower score cannot erase a personal best");
const forged = await sign(A, 500, "kjp"); forged.signature = await B.signMessage("nonsense");
r = await post(forged);
chk(r.s === 401, "forged signature rejected", "HTTP " + r.s);
r = await post(await sign(A, 999999, "kjp"));
chk(r.s === 400, "impossible score rejected", "HTTP " + r.s);
const stale = await sign(A, 700, "kjp"); stale.message = stale.message.replace(/ts:\d+/, "ts:" + (Date.now() - 9e5));
r = await post(stale);
chk(r.s === 401, "stale timestamp rejected", "HTTP " + r.s);
const wrongMode = await sign(A, 700, "kjp"); wrongMode.mode = "gauntlet";
r = await post(wrongMode);
chk(r.s === 401, "mode-swap replay rejected", "HTTP " + r.s);

console.log("=== durability ===");
const h = await (await fetch(HEALTH)).json();
chk(h.entries >= 2, "board persisted to disk", h.entries + " entries");
chk(h.backups >= 1, "timestamped backups written", h.backups + " snapshots");

console.log("\n" + pass + "/" + (pass + fail) + (fail ? "  — " + fail + " FAILED" : "  ALL PASS"));
process.exit(fail ? 1 : 0);
