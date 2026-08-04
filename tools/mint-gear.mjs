// Mint KJP GEAR from the command line — spends REAL PLS.
//   PK=0x… node tools/mint-gear.mjs <contract> [qty]
// Refuses to send unless the contract verifies as our build and the mint is
// actually open, and reports the burn it caused afterwards.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ethers = createRequire("C:/Users/Bia/New folder/wick-arsenal/")("ethers");
const art = JSON.parse(readFileSync(join(root, "out", "KJPGear.json"), "utf8"));

const ADDR = process.argv[2];
const QTY = Math.max(1, Math.min(5, parseInt(process.argv[3] || "1", 10)));
if (!/^0x[a-fA-F0-9]{40}$/.test(ADDR || "")) { console.error("usage: PK=0x… node tools/mint-gear.mjs <contract> [qty]"); process.exit(1); }
if (!process.env.PK) { console.error("✗ PK not set"); process.exit(1); }

const NET = new ethers.Network("pulsechain", 369);
const provider = new ethers.JsonRpcProvider("https://rpc.pulsechain.com", NET, { staticNetwork: NET });
const wallet = new ethers.Wallet(process.env.PK, provider);
const c = new ethers.Contract(ADDR, art.abi, wallet);
const erc20 = ["function balanceOf(address) view returns (uint256)"];
const DEAD = "0x000000000000000000000000000000000000dEaD";

/* never send into something that is not the audited build */
if ((await provider.getCode(ADDR)).length !== art.deployedBytecode.length) {
  console.error("✗ bytecode at that address does not match this build — refusing to mint"); process.exit(1);
}
if (!(await c.mintOpen())) { console.error("✗ the mint is not open yet (menu option 2)"); process.exit(1); }

const price = await c.mintPrice();
const supply = await c.totalSupply();
const cost = price * BigInt(QTY);
const bal = await provider.getBalance(wallet.address);
console.log("minter   " + wallet.address);
console.log("balance  " + Number(ethers.formatEther(bal)).toLocaleString() + " PLS");
console.log("minting  " + QTY + "  (" + supply + "/100 gone)");
console.log("cost     " + Number(ethers.formatEther(cost)).toLocaleString() + " PLS"
  + "   -> " + Number(ethers.formatEther(cost / 2n)).toLocaleString() + " burns KJP, same burns WICK");
if (bal < cost) { console.error("✗ not enough PLS (need cost + gas)"); process.exit(1); }
if (supply + BigInt(QTY) > 100n) { console.error("✗ only " + (100n - supply) + " left"); process.exit(1); }

const kjp = new ethers.Contract(await c.kjpToken(), erc20, provider);
const wick = new ethers.Contract(await c.wickToken(), erc20, provider);
const k0 = await kjp.balanceOf(DEAD), w0 = await wick.balanceOf(DEAD);

const tx = await c.mint(QTY, { value: cost });
console.log("\nsent " + tx.hash + " — waiting…");
const r = await tx.wait();
if (r.status !== 1) { console.error("✗ reverted"); process.exit(1); }

const got = [];
for (const l of r.logs) { try { const p = c.interface.parseLog(l); if (p && p.name === "Minted") got.push("#" + p.args[1] + " type " + p.args[2]); } catch {} }
const k1 = await kjp.balanceOf(DEAD), w1 = await wick.balanceOf(DEAD);
console.log("\n✓ minted: " + got.join(", "));
console.log("  KJP burned this mint : " + Number(ethers.formatEther(k1 - k0)).toLocaleString());
console.log("  WICK burned this mint: " + Number(ethers.formatEther(w1 - w0)).toLocaleString());
console.log("  supply now " + (await c.totalSupply()) + "/100");
