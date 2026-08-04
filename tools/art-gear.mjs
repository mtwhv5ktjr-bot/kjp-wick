// Render the REAL card art: deploy KJPGear to ganache, mint the whole run,
// pull tokenURI for one token of each type, decode the on-chain SVG, and write
// a gallery. Nothing here is a mockup — every pixel comes out of the contract.
//   node tools/art-gear.mjs   ->  out/gear-art.html  (+ out/gear-<type>.svg)
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reqA = createRequire("C:/Users/Bia/New folder/wick-arsenal/");
const ganache = reqA("ganache"), ethers = reqA("ethers");

const GearArt = JSON.parse(readFileSync(join(root, "out", "KJPGear.json"), "utf8"));
const TokArt = JSON.parse(readFileSync(join(root, "out", "MockToken.json"), "utf8"));
const RtrArt = JSON.parse(readFileSync(join(root, "out", "MockRouter.json"), "utf8"));

/* a full 100-piece run at 1,000,000 PLS costs 100,000,000 PLS — fund for it */
const server = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 5, defaultBalance: 200_000_000 }, miner: { blockGasLimit: 30_000_000 } });
const provider = new ethers.BrowserProvider(server);
const dep = await provider.getSigner(0);
const GL = { gasLimit: 12_000_000n };

const mk = async (n, s) => (await new ethers.ContractFactory(TokArt.abi, TokArt.bytecode, dep)).deploy(n, s);
const KJPt = await mk("KJP", "KJP"), WICKt = await mk("Wick", "WICK"), WPLS = await mk("WPLS", "WPLS");
const router = await (await new ethers.ContractFactory(RtrArt.abi, RtrArt.bytecode, dep)).deploy();
const PRICE = ethers.parseEther("1000000");                    // the real 1,000,000 PLS
const gear = await (new ethers.ContractFactory(GearArt.abi, GearArt.bytecode, dep)).deploy(
  PRICE, await router.getAddress(), await WPLS.getAddress(), await KJPt.getAddress(), await WICKt.getAddress(), GL);
await (await gear.setMintOpen(true, GL)).wait();

console.log("minting the full run of 100 at " + ethers.formatEther(PRICE) + " PLS each…");
for (let i = 0; i < 20; i++) await (await gear.mint(5, { value: PRICE * 5n, ...GL })).wait();

/* prove the split while we are here */
const DEAD = "0x000000000000000000000000000000000000dEaD";
const kjpBurned = await KJPt.balanceOf(DEAD), wickBurned = await WICKt.balanceOf(DEAD);
console.log("KJP burned : " + ethers.formatEther(kjpBurned));
console.log("WICK burned: " + ethers.formatEther(wickBurned));
console.log("split      : " + (Number(kjpBurned * 1000n / (kjpBurned + wickBurned)) / 10) + "% / "
  + (Number(wickBurned * 1000n / (kjpBurned + wickBurned)) / 10) + "%");

/* one token of each type */
const seen = {}, cards = [];
for (let id = 1; id <= 100; id++){
  const t = Number(await gear.gearTypeOf(id));
  if (seen[t]) continue;
  seen[t] = id;
  const uri = await gear.tokenURI(id);
  const meta = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
  const svg = Buffer.from(meta.image.split(",")[1], "base64").toString();
  cards.push({ t, id, name: meta.name, svg, attrs: meta.attributes });
  mkdirSync(join(root, "out"), { recursive: true });
  writeFileSync(join(root, "out", "gear-" + t + ".svg"), svg);
}
cards.sort((a, b) => a.t - b.t);
console.log("\nextracted " + cards.length + " card designs straight from tokenURI:");
for (const c of cards) console.log("  type " + c.t + "  #" + c.id + "  " + c.name.replace(/^KJP GEAR #\d+ - /, ""));

const html = `<!doctype html><meta charset="utf-8"><title>KJP GEAR — on-chain art</title>
<style>body{margin:0;background:#05070c;color:#d9e8dc;font:13px Verdana,sans-serif;padding:26px}
h1{font:900 30px Arial Black;color:#ffd27c;margin:0 0 4px}
.sub{color:#7c8ba3;margin-bottom:22px}
.grid{display:grid;grid-template-columns:repeat(4,240px);gap:20px}
.c svg{width:240px;height:336px;display:block;border-radius:8px}
.c .n{margin-top:7px;font:900 11px Arial Black;color:#9fd7b0;text-align:center}</style>
<h1>KJP GEAR — the real card art</h1>
<div class="sub">Rendered from <b>tokenURI()</b> on a live deployment. 100 pieces · 1,000,000 PLS each · 50% buys &amp; burns KJP, 50% buys &amp; burns WICK.</div>
<div class="grid">${cards.map(c => `<div class="c">${c.svg}<div class="n">${c.name.replace(/^KJP GEAR #\d+ - /, "")}</div></div>`).join("")}</div>`;
writeFileSync(join(root, "out", "gear-art.html"), html);
console.log("\nwrote out/gear-art.html");
process.exit(0);
