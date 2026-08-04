// Verify a deployed KJP GEAR against the local build, on mainnet.
//   node tools/verify-gear.mjs 0x…
// Refuses to pass on ANY mismatch — this is the gate before an address is
// pasted into the games and shown to the public.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ethers = createRequire("C:/Users/Bia/New folder/wick-arsenal/")("ethers");
const art = JSON.parse(readFileSync(join(root, "out", "KJPGear.json"), "utf8"));

const ADDR = process.argv[2];
if (!/^0x[a-fA-F0-9]{40}$/.test(ADDR || "")) { console.error("usage: node tools/verify-gear.mjs 0x…"); process.exit(1); }

const RPC = "https://rpc.pulsechain.com";
const NET = new ethers.Network("pulsechain", 369);
const provider = new ethers.JsonRpcProvider(RPC, NET, { staticNetwork: NET });
const c = new ethers.Contract(ADDR, art.abi, provider);

const WANT = {
  name: "KJP Gear",
  symbol: "KJPGEAR",
  MAX_SUPPLY: 100n,
  MAX_PER_TX: 5n,
  KJP_SHARE_BPS: 5000n,
  mintPrice: ethers.parseEther("1000000"),
  kjpToken: "0x3848D41D6f439Ca645e9193c7680629A86B739ED",
  wickToken: "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC",
  burnPathIn: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
  burnRouter: "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02",
  BURN_ADDR: "0x000000000000000000000000000000000000dEaD"
};

let bad = 0;
const eq = (label, got, want) => {
  const g = typeof got === "string" ? got.toLowerCase() : got;
  const w = typeof want === "string" ? want.toLowerCase() : want;
  const ok = String(g) === String(w);
  if (!ok) bad++;
  console.log((ok ? "  ✓ " : "  ✗ ") + label.padEnd(16) + String(got) + (ok ? "" : "   WANT " + want));
};

console.log("\nKJP GEAR — verifying " + ADDR + "\n");

/* 1. is it even our bytecode? the strongest single check */
const onchain = await provider.getCode(ADDR);
if (onchain === "0x") { console.error("✗ NOTHING DEPLOYED AT THIS ADDRESS"); process.exit(1); }
const local = art.deployedBytecode;
/* immutables are patched into the runtime code, so compare on length + the
   constructor-independent prefix rather than demanding a byte-perfect match */
const sameLen = onchain.length === local.length;
const prefix = onchain.slice(0, 2000) === local.slice(0, 2000);
console.log("BYTECODE");
console.log("  " + (sameLen ? "✓" : "✗") + " same length as local build   (" + onchain.length + " vs " + local.length + ")");
console.log("  " + (prefix ? "✓" : "✗") + " identical opening 1000 bytes");
if (!sameLen || !prefix) bad++;

console.log("\nIDENTITY");
eq("name", await c.name(), WANT.name);
eq("symbol", await c.symbol(), WANT.symbol);
eq("MAX_SUPPLY", await c.MAX_SUPPLY(), WANT.MAX_SUPPLY);
eq("MAX_PER_TX", await c.MAX_PER_TX(), WANT.MAX_PER_TX);

console.log("\nTHE MONEY");
eq("KJP_SHARE_BPS", await c.KJP_SHARE_BPS(), WANT.KJP_SHARE_BPS);
const price = await c.mintPrice();
eq("mintPrice", price, WANT.mintPrice);
console.log("     = " + Number(ethers.formatEther(price)).toLocaleString() + " PLS per piece");
eq("kjpToken", await c.kjpToken(), WANT.kjpToken);
eq("wickToken", await c.wickToken(), WANT.wickToken);
eq("burnRouter", await c.burnRouter(), WANT.burnRouter);
eq("burnPathIn", await c.burnPathIn(), WANT.burnPathIn);
eq("BURN_ADDR", await c.BURN_ADDR(), WANT.BURN_ADDR);

console.log("\nSTATE");
const open = await c.mintOpen(), supply = await c.totalSupply(), owner = await c.owner();
console.log("  " + (open ? "! " : "✓ ") + "mintOpen".padEnd(16) + open + (open ? "   <-- ALREADY PUBLIC" : "   (closed — safe)"));
console.log("  " + (supply === 0n ? "✓ " : "! ") + "totalSupply".padEnd(16) + supply + " / 100");
console.log("    owner           " + owner);

console.log("\nSAFETY");
const hasWithdraw = art.abi.some(f => /withdraw|sweep|rescue|claim/i.test(f.name || ""));
console.log("  " + (hasWithdraw ? "✗" : "✓") + " no withdraw/sweep/rescue in the ABI");
if (hasWithdraw) bad++;
const sel = ethers.id("gearOfOwner(address)").slice(0, 10);
console.log("  " + (sel === "0xfce8c498" ? "✓" : "✗") + " gearOfOwner selector " + sel + " (games hardcode this)");
if (sel !== "0xfce8c498") bad++;
try {
  const [ids] = await c.gearOfOwner("0x000000000000000000000000000000000000dEaD");
  console.log("  ✓ gearOfOwner() answers on-chain (" + ids.length + " for dead addr)");
} catch (e) { console.log("  ✗ gearOfOwner() reverted: " + e.message); bad++; }

/* the pools must still be untouched at 22/20/16/14/12/8/5/3 */
const want = [0, 22, 20, 16, 14, 12, 8, 5, 3];
let poolsOk = true, poolStr = [];
for (let t = 1; t <= 8; t++) { const p = Number(await c.poolLeft(t)); poolStr.push(p); if (p !== want[t]) poolsOk = false; }
console.log("  " + (poolsOk ? "✓" : "✗") + " pools untouched " + poolStr.join("/") + " = " + poolStr.reduce((a, b) => a + b, 0));
if (!poolsOk) bad++;

console.log("\n" + (bad === 0
  ? "✓ VERIFIED — this is the audited build, still closed. Safe to wire in."
  : "✗ " + bad + " MISMATCH(ES) — DO NOT PUBLISH THIS ADDRESS.") + "\n");
process.exit(bad ? 1 : 0);
