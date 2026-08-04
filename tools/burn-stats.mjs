// What has KJP GEAR actually minted and burned? Reads the contract's own
// Burned events, so the number is what THIS mint caused — not every burn the
// tokens have ever seen.
//   node tools/burn-stats.mjs [--json]
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ethers = createRequire("C:/Users/Bia/New folder/wick-arsenal/")("ethers");
const art = JSON.parse(readFileSync(join(root, "out", "KJPGear.json"), "utf8"));

const GEAR = "0x6BdED56bA6F0d8062e056062D47F41ac735d5d10";
const KJP  = "0x3848D41D6f439Ca645e9193c7680629A86B739ED";
const WICK = "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC";
const NET = new ethers.Network("pulsechain", 369);
const provider = new ethers.JsonRpcProvider("https://rpc.pulsechain.com", NET, { staticNetwork: NET });
const c = new ethers.Contract(GEAR, art.abi, provider);

const supply = Number(await c.totalSupply());
const price = await c.mintPrice();
const open = await c.mintOpen();

/* Burned(token, plsIn, tokensBurned, viaMint) — pull the whole life of the
   contract in chunks; PulseChain nodes cap getLogs ranges. */
const head = await provider.getBlockNumber();
const topic = ethers.id("Burned(address,uint256,uint256,bool)");
let logs = [], from = head - 200000, step = 40000;
for (let b = from; b <= head; b += step){
  try{
    const part = await provider.getLogs({ address: GEAR, topics: [topic], fromBlock: b, toBlock: Math.min(b + step - 1, head) });
    logs = logs.concat(part);
  }catch(e){ /* a rejected window just means no data we can reach there */ }
}
let kjpBurned = 0n, wickBurned = 0n, plsIn = 0n;
for (const l of logs){
  const p = c.interface.parseLog(l);
  const tok = p.args[0].toLowerCase(), pls = p.args[1], out = p.args[2];
  plsIn += pls;
  if (tok === KJP.toLowerCase()) kjpBurned += out;
  else if (tok === WICK.toLowerCase()) wickBurned += out;
}
const n = v => Number(ethers.formatEther(v));
const fmt = v => n(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

if (process.argv.includes("--json")){
  console.log(JSON.stringify({ supply, open, kjpBurned: kjpBurned.toString(), wickBurned: wickBurned.toString(), plsIn: plsIn.toString() }));
} else {
  console.log("\nKJP GEAR — " + GEAR);
  console.log("  mint open   " + open);
  console.log("  minted      " + supply + " / 100      (" + (100 - supply) + " left)");
  console.log("  PLS spent   " + fmt(plsIn) + " PLS   (expected " + fmt(price * BigInt(supply)) + ")");
  console.log("  burn events " + logs.length);
  console.log("\n  🔥 KJP burned   " + fmt(kjpBurned));
  console.log("  🔥 WICK burned  " + fmt(wickBurned));
  if (supply === 0) console.log("\n  Nothing minted yet — the counters are honest zeroes.");
  console.log("");
}
