// Deploy KJP GEAR to PulseChain (chainId 369).
//
//   node tools/deploy-gear.mjs            # dry run — prints the plan, sends nothing
//   PK=0x… node tools/deploy-gear.mjs --go
//
// After it prints the address, paste it into BOTH games:
//   kjp-wick/js/net.js        GEAR_ADDR
//   pepe-zero/index.html      GEAR_ADDR      (then pepe-wick/sync.cmd)
// then open the mint with:  PK=0x… node tools/deploy-gear.mjs --open <addr>
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ethers = createRequire("C:/Users/Bia/New folder/wick-arsenal/")("ethers");

const RPC        = process.env.RPC_URL     ?? "https://rpc.pulsechain.com";
const BURN_ROUTER= process.env.BURN_ROUTER ?? "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02"; // PulseX Router02
const WPLS       = process.env.WPLS        ?? "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const WICK_TOKEN = process.env.WICK_TOKEN  ?? "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC"; // Green Wick
const KJP_TOKEN  = process.env.KJP_TOKEN   ?? "";                                            // <- REQUIRED
const PRICE      = ethers.parseEther(process.env.PRICE_PLS ?? "1000000");                    // 1,000,000 PLS per item

const art = JSON.parse(readFileSync(join(root, "out", "KJPGear.json"), "utf8"));
const go = process.argv.includes("--go");
const openIdx = process.argv.indexOf("--open");

console.log("KJP GEAR — deploy plan");
console.log("  supply      100 (22/20/16/14/12/8/5/3)");
console.log("  price       " + ethers.formatEther(PRICE) + " PLS per item  (max 5 per tx)");
console.log("  gross       " + ethers.formatEther(PRICE * 100n) + " PLS if it sells out");
console.log("  → KJP burn  " + ethers.formatEther(PRICE * 100n * 75n / 100n) + " PLS worth (75%)");
console.log("  → WICK burn " + ethers.formatEther(PRICE * 100n * 25n / 100n) + " PLS worth (25%)");
console.log("  router      " + BURN_ROUTER);
console.log("  WPLS        " + WPLS);
console.log("  KJP token   " + (KJP_TOKEN || "‼ NOT SET — export KJP_TOKEN=0x…"));
console.log("  WICK token  " + WICK_TOKEN);
console.log("  withdraw()  none — the split is bytecode, not a promise");

if (!go && openIdx < 0){
  console.log("\ndry run. re-run with --go (and PK=0x…) to deploy for real.");
  process.exit(0);
}
if (!process.env.PK){ console.error("\n✗ PK not set"); process.exit(1); }
const provider = new ethers.JsonRpcProvider(RPC, new ethers.Network("pulsechain", 369), { staticNetwork: true });
const wallet = new ethers.Wallet(process.env.PK, provider);
console.log("\ndeployer " + wallet.address + "  bal " + ethers.formatEther(await provider.getBalance(wallet.address)) + " PLS");

if (openIdx >= 0){
  const addr = process.argv[openIdx + 1];
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr || "")){ console.error("✗ --open needs the contract address"); process.exit(1); }
  const c = new ethers.Contract(addr, art.abi, wallet);
  const tx = await c.setMintOpen(true);
  console.log("opening mint… " + tx.hash);
  await tx.wait();
  console.log("✓ MINT IS OPEN");
  process.exit(0);
}
if (!/^0x[a-fA-F0-9]{40}$/.test(KJP_TOKEN)){
  console.error("✗ KJP_TOKEN must be the deployed KJP token address — 75% of every mint buys and burns it");
  process.exit(1);
}
const f = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
const c = await f.deploy(PRICE, BURN_ROUTER, WPLS, KJP_TOKEN, WICK_TOKEN);
console.log("deploying… " + c.deploymentTransaction().hash);
await c.waitForDeployment();
const addr = await c.getAddress();
console.log("\n✓ KJP GEAR live at " + addr);
console.log("  paste into kjp-wick/js/net.js GEAR_ADDR and pepe-zero/index.html GEAR_ADDR");
console.log("  then: PK=0x… node tools/deploy-gear.mjs --open " + addr);
