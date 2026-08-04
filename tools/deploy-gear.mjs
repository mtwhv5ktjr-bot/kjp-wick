// Deploy KJP GEAR to PulseChain (chainId 369).
//
//   node tools/deploy-gear.mjs            # dry run — prints the plan, sends nothing
//   PK=0x… node tools/deploy-gear.mjs --go
//
// After it prints the address, paste it into BOTH games:
//   kjp-wick/js/net.js        GEAR_ADDR
//   pepe-zero/index.html      GEAR_ADDR      (then pepe-wick/sync.cmd)
// then open the mint with:  PK=0x… node tools/deploy-gear.mjs --open <addr>
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ethers = createRequire("C:/Users/Bia/New folder/wick-arsenal/")("ethers");

const RPC        = process.env.RPC_URL     ?? "https://rpc.pulsechain.com";
const BURN_ROUTER= process.env.BURN_ROUTER ?? "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02"; // PulseX Router02
const WPLS       = process.env.WPLS        ?? "0xA1077a294dDE1B09bB078844df40758a5D0f9a27";
const WICK_TOKEN = process.env.WICK_TOKEN  ?? "0x8CDaf3d630Da9E1450832924D5701CC0500E9cfC"; // Green Wick
/* KJP — verified on PulseChain 2026-08-04: real ERC-20, name "Kenny John
   Pierre", symbol KJP, 18 decimals, and getAmountsOut(WPLS->KJP) routes on
   BOTH PulseX routers, so the 50% buy&burn leg can actually execute. */
const KJP_TOKEN  = process.env.KJP_TOKEN   ?? "0x3848D41D6f439Ca645e9193c7680629A86B739ED";
const PRICE      = ethers.parseEther(process.env.PRICE_PLS ?? "1000000");                    // 1,000,000 PLS per item

const art = JSON.parse(readFileSync(join(root, "out", "KJPGear.json"), "utf8"));
const go = process.argv.includes("--go");
const openIdx = process.argv.indexOf("--open");

console.log("KJP GEAR — deploy plan");
console.log("  supply      100 (22/20/16/14/12/8/5/3)");
console.log("  price       " + ethers.formatEther(PRICE) + " PLS per item  (max 5 per tx)");
console.log("  gross       " + ethers.formatEther(PRICE * 100n) + " PLS if it sells out");
console.log("  → KJP burn  " + ethers.formatEther(PRICE * 100n * 50n / 100n) + " PLS worth (50%)");
console.log("  → WICK burn " + ethers.formatEther(PRICE * 100n * 50n / 100n) + " PLS worth (50%)");
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

/* --market <gearAddr> : deploy the secondary market against a live gear
   contract. Separate step on purpose — the mint must exist first, and a
   market is not needed on day one. */
const mktIdx = process.argv.indexOf("--market");
if (mktIdx >= 0){
  const gearAddr = process.argv[mktIdx + 1];
  if (!/^0x[a-fA-F0-9]{40}$/.test(gearAddr || "")){ console.error("✗ --market needs the deployed KJPGear address"); process.exit(1); }
  const mArt = JSON.parse(readFileSync(join(root, "out", "KJPGearMarket.json"), "utf8"));
  const f = new ethers.ContractFactory(mArt.abi, mArt.bytecode, wallet);
  const c = await f.deploy(gearAddr, BURN_ROUTER, WPLS, KJP_TOKEN, WICK_TOKEN);
  console.log("deploying market… " + c.deploymentTransaction().hash);
  await c.waitForDeployment();
  const addr = await c.getAddress();
  console.log("\n✓ KJP GEAR MARKET live at " + addr);
  console.log("  15% royalty on every sale, burned 50/50 KJP + WICK");
  /* Wire it up automatically. Hand-pasting an address into config.js is the
     step most likely to be fumbled or forgotten, and a wrong address there
     points real buy transactions at nothing. Only rewrite the zero
     placeholder — never clobber an address someone already put here. */
  const cfgPath = join(root, "..", "wick-arsenal", "web", "config.js");
  try {
    const src = readFileSync(cfgPath, "utf8");
    const m = /gearMarket:\s*"(0x[a-fA-F0-9]{40})"/.exec(src);
    if (!m) console.log("  ! could not find gearMarket in config.js — paste " + addr + " by hand");
    else if (!/^0x0{40}$/.test(m[1]) && m[1].toLowerCase() !== addr.toLowerCase())
      console.log("  ! config.js already points at " + m[1] + " — left alone. Change it by hand if that is stale.");
    else {
      writeFileSync(cfgPath, src.replace(m[0], 'gearMarket: "' + addr + '"'));
      console.log("  ✓ wrote it into wick-arsenal/web/config.js — now redeploy the arsenal");
    }
  } catch(e){ console.log("  ! config.js not patched (" + e.message + ") — paste " + addr + " by hand"); }
  process.exit(0);
}

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
