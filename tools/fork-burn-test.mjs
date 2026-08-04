// DOES THE BUY & BURN ACTUALLY WORK?
//
// The unit suite proves the split against a MOCK router. This proves it against
// the REAL one: ganache forks PulseChain mainnet, deploys KJPGear pointed at the
// live PulseX router / WPLS / KJP / WICK, mints for real PLS, and then reads the
// REAL token contracts' balanceOf(0x…dEaD) before and after.
//
// If the dead address does not gain KJP and WICK, the buy & burn does not work,
// and no amount of green unit tests changes that.
//
//   node tools/fork-burn-test.mjs
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reqA = createRequire("C:/Users/Bia/New folder/wick-arsenal/");
const ganache = reqA("ganache"), ethers = reqA("ethers");

const RPC = process.env.RPC_URL ?? "https://rpc.pulsechain.com";
const ROUTER = "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02";   // PulseX Router
const WPLS   = "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const KJP    = "0x3848D41D6f439Ca645e9193c7680629A86B739ED";
const WICK   = "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC";
const DEAD   = "0x000000000000000000000000000000000000dEaD";
const PRICE  = ethers.parseEther("1000000");                   // the real 1,000,000 PLS

const art = JSON.parse(readFileSync(join(root, "out", "KJPGear.json"), "utf8"));
const ERC20 = ["function balanceOf(address) view returns (uint256)",
               "function symbol() view returns (string)",
               "function decimals() view returns (uint8)"];

console.log("forking PulseChain mainnet (this pulls live state, give it a moment)…");
const provider369 = ganache.provider({
  logging: { quiet: true },
  fork: { url: RPC },
  wallet: { totalAccounts: 3, defaultBalance: 20_000_000 },     // 20M PLS to spend
  miner: { blockGasLimit: 30_000_000 },
  chain: { chainId: 369 }
});
const p = new ethers.BrowserProvider(provider369);
const dep = await p.getSigner(0);
const GL = { gasLimit: 12_000_000n };

const blk = await p.getBlockNumber();
console.log("forked at block " + blk + "  ·  deployer " + (await dep.getAddress()));

const kjp = new ethers.Contract(KJP, ERC20, p);
const wick = new ethers.Contract(WICK, ERC20, p);
console.log("live tokens: " + (await kjp.symbol()) + " / " + (await wick.symbol()));

/* deploy the REAL contract against the REAL router */
const gear = await (new ethers.ContractFactory(art.abi, art.bytecode, dep))
  .deploy(PRICE, ROUTER, WPLS, KJP, WICK, GL);
await gear.waitForDeployment();
const G = await gear.getAddress();
console.log("KJPGear deployed at " + G + "  (constructor accepted the live route ✓)");
await (await gear.setMintOpen(true, GL)).wait();

const kjp0 = await kjp.balanceOf(DEAD), wick0 = await wick.balanceOf(DEAD);
const raw = a => a.toString();
console.log("\nDEAD before   KJP " + ethers.formatEther(kjp0) + "   WICK " + ethers.formatEther(wick0));

/* THE REAL MINT */
const qty = 3n;
const tx = await gear.mint(qty, { value: PRICE * qty, ...GL });
const rc = await tx.wait();
console.log("minted " + qty + " for " + ethers.formatEther(PRICE * qty) + " PLS   gas " + rc.gasUsed);

const kjp1 = await kjp.balanceOf(DEAD), wick1 = await wick.balanceOf(DEAD);
const dK = kjp1 - kjp0, dW = wick1 - wick0;
console.log("DEAD after    KJP " + ethers.formatEther(kjp1) + "   WICK " + ethers.formatEther(wick1));
console.log("\nBURNED THIS MINT");
console.log("  KJP  +" + ethers.formatEther(dK));
console.log("  WICK +" + ethers.formatEther(dW));

/* what the contract itself says it did */
const evs = rc.logs.map(l => { try { return gear.interface.parseLog(l); } catch { return null; } })
  .filter(e => e && e.name === "Burned");
for (const e of evs)
  console.log("  event Burned  token=" + (e.args[0].toLowerCase() === KJP.toLowerCase() ? "KJP " : "WICK")
    + "  plsIn=" + ethers.formatEther(e.args[1]) + "  burned=" + ethers.formatEther(e.args[2]));

const held = await p.getBalance(G);
console.log("\ncontract PLS left over: " + ethers.formatEther(held) + "   (0 = both legs executed)");

const half = PRICE * qty / 2n;
const ok = dK > 0n && dW > 0n && held === 0n && evs.length === 2;
console.log("\n" + (ok ? "✅ BUY & BURN WORKS ON REAL PULSEX" : "❌ BUY & BURN DID NOT COMPLETE"));
console.log("   expected " + ethers.formatEther(half) + " PLS into each leg");
console.log("   KJP leg  " + (dK > 0n ? "executed ✓" : "FAILED ✗"));
console.log("   WICK leg " + (dW > 0n ? "executed ✓" : "FAILED ✗"));
console.log("   nothing stranded " + (held === 0n ? "✓" : "✗ " + ethers.formatEther(held) + " PLS"));
process.exit(ok ? 0 : 1);
