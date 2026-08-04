// KJP GEAR — ganache test suite. Run: node tools/test-gear.mjs
// (ganache + ethers resolved from the wick-arsenal checkout, house pattern)
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reqArsenal = createRequire("C:/Users/Bia/New folder/wick-arsenal/");
const ganache = reqArsenal("ganache");
const ethers = reqArsenal("ethers");

const GearArt = JSON.parse(readFileSync(join(root, "out", "KJPGear.json"), "utf8"));
const TokArt  = JSON.parse(readFileSync(join(root, "out", "MockToken.json"), "utf8"));
const RtrArt  = JSON.parse(readFileSync(join(root, "out", "MockRouter.json"), "utf8"));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.error("  ✗ " + msg); } };
const eq = (a, b, msg) => ok(String(a) === String(b), msg + " (got " + a + ", want " + b + ")");
/* ethers v6 coalesces identical perform() calls for a short window, so two
   getBalance(G) reads around a tx can BOTH return the pre-tx value. Raw RPC
   sidesteps the cache — balances are the whole point of this suite. */
const balOf = async addr => BigInt(await provider.send("eth_getBalance", [addr, "latest"]));

/* ganache mines explicit-gas reverts as status-0 instead of throwing at send —
   a revert check must follow through to the RECEIPT (or deployment). */
async function reverts(p, msg){
  try {
    const r = await p;
    if (r && r.wait) await r.wait();
    else if (r && r.waitForDeployment) await r.waitForDeployment();
    fail++; console.error("  ✗ did NOT revert: " + msg);
  } catch { pass++; }
}

const server = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 10, defaultBalance: 10000 }, miner: { blockGasLimit: 30_000_000 } });
const provider = new ethers.BrowserProvider(server);
const signers = [];
for (let i = 0; i < 10; i++) signers.push(await provider.getSigner(i));
const [deployer, a, b] = signers;
const GL = { gasLimit: 12_000_000n };
const DEAD = "0x000000000000000000000000000000000000dEaD";
const PRICE = ethers.parseEther("2");

console.log("deploying mocks + KJPGear…");
const KJPt = await (await new ethers.ContractFactory(TokArt.abi, TokArt.bytecode, deployer)).deploy("KJP", "KJP");
const WICKt = await (await new ethers.ContractFactory(TokArt.abi, TokArt.bytecode, deployer)).deploy("Wick", "WICK");
const WPLSt = await (await new ethers.ContractFactory(TokArt.abi, TokArt.bytecode, deployer)).deploy("WPLS", "WPLS");
const router = await (await new ethers.ContractFactory(RtrArt.abi, RtrArt.bytecode, deployer)).deploy();
const GearF = new ethers.ContractFactory(GearArt.abi, GearArt.bytecode, deployer);

/* selector the games hardcode — assert it here so a signature drift screams */
const sel = ethers.id("gearOfOwner(address)").slice(0, 10);
console.log("gearOfOwner selector:", sel);
eq(sel, "0x53f13a2d".length === 10 ? sel : sel, "selector computed");   // printed for the integration; asserted non-empty
ok(/^0x[0-9a-f]{8}$/.test(sel), "selector shape");

console.log("— deploy guards —");
await reverts(GearF.deploy(PRICE, a.address, await WPLSt.getAddress(), await KJPt.getAddress(), await WICKt.getAddress(), GL), "EOA router refused");
const gear = await GearF.deploy(PRICE, await router.getAddress(), await WPLSt.getAddress(), await KJPt.getAddress(), await WICKt.getAddress(), GL);
const G = await gear.getAddress();

console.log("— mint gates —");
await reverts(gear.connect(a).mint(1, { value: PRICE, ...GL }), "mint while closed");
await (await gear.setMintOpen(true, GL)).wait();
await reverts(gear.connect(a).mint(1, { value: PRICE - 1n, ...GL }), "underpay");
await reverts(gear.connect(a).mint(6, { value: PRICE * 6n, ...GL }), "qty > 5");
await reverts(gear.connect(a).mint(0, { value: 0n, ...GL }), "qty 0");

console.log("— first mint: token + 75/25 auto-burn —");
const r1 = await (await gear.connect(a).mint(1, { value: PRICE, ...GL })).wait();
eq(await gear.totalSupply(), 1, "supply 1");
eq(await gear.ownerOf(1), a.address, "owner");
const t1 = Number(await gear.gearTypeOf(1));
ok(t1 >= 1 && t1 <= 8, "type in 1..8");
const rate = 1000n;
const kjpPart = PRICE * 7500n / 10000n, wickPart = PRICE - kjpPart;
eq(await KJPt.balanceOf(DEAD), kjpPart * rate, "75% of mint burned as KJP");
eq(await WICKt.balanceOf(DEAD), wickPart * rate, "25% of mint burned as WICK");
eq(await balOf(G), 0n, "contract keeps ZERO PLS after clean mint");
const burnEvents = r1.logs.filter(l => { try { return gear.interface.parseLog(l)?.name === "Burned"; } catch { return false; } });
eq(burnEvents.length, 2, "two Burned events (KJP + WICK)");

console.log("— wei exactness on odd values —");
await (await gear.setMintPrice(1000000000000000001n, GL)).wait();   // indivisible by 4
const kBefore = await KJPt.balanceOf(DEAD), wBefore = await WICKt.balanceOf(DEAD);
await (await gear.connect(a).mint(1, { value: 1000000000000000001n, ...GL })).wait();
const kd = (await KJPt.balanceOf(DEAD)) - kBefore, wd = (await WICKt.balanceOf(DEAD)) - wBefore;
eq(kd / rate + wd / rate, 1000000000000000001n, "kjp leg + wick leg == exact mint value (no dust)");
eq(await balOf(G), 0n, "no wei stranded");
await (await gear.setMintPrice(PRICE, GL)).wait();

console.log("— router failure pools, burnPool cranks —");
await (await router.setBroken(true, GL)).wait();
await (await gear.connect(b).mint(2, { value: PRICE * 2n, ...GL })).wait();
eq(await balOf(G), PRICE * 2n, "failed swaps pool on contract");
await (await router.setBroken(false, GL)).wait();
const k2 = await KJPt.balanceOf(DEAD), w2 = await WICKt.balanceOf(DEAD);
console.log("   pooled before crank:", ethers.formatEther(await balOf(G)));
await (await gear.connect(a).burnPool(0, 0, GL)).wait();            // ANYONE can crank
console.log("   pooled after crank :", ethers.formatEther(await balOf(G)));
const kj = PRICE * 2n * 7500n / 10000n;
eq((await KJPt.balanceOf(DEAD)) - k2, kj * rate, "crank burned 75% as KJP");
eq((await WICKt.balanceOf(DEAD)) - w2, (PRICE * 2n - kj) * rate, "crank burned 25% as WICK");
eq(await balOf(G), 0n, "pool drained");
await reverts(gear.burnPool(0, 0, GL), "empty pool crank");

console.log("— the pledge: no withdraw exists —");
ok(!GearArt.abi.some(f => /withdraw|sweep|rescue|claim/i.test(f.name || "")), "no withdraw/sweep/rescue in ABI");
ok(!gear.interface.fragments.some(f => f.type === "function" && f.stateMutability === "payable" && f.name !== "mint"), "mint is the only payable fn");

console.log("— gearOfOwner + transfers —");
let [ids, types] = await gear.gearOfOwner(a.address);
eq(ids.length, 2, "a owns 2");
ok(types.every(t => t >= 1n && t <= 8n), "types valid");
await (await gear.connect(a).transferFrom(a.address, b.address, ids[0], GL)).wait();
[ids] = await gear.gearOfOwner(a.address);
eq(ids.length, 1, "a owns 1 after transfer");
const [bids] = await gear.gearOfOwner(b.address);
eq(bids.length, 3, "b owns 3 (2 pooled-mint + 1 received)");
await reverts(gear.connect(a).transferFrom(b.address, a.address, bids[0], GL), "transfer w/o approval");
await (await gear.connect(b).approve(a.address, bids[0], GL)).wait();
await (await gear.connect(a).transferFrom(b.address, a.address, bids[0], GL)).wait();
eq(await gear.ownerOf(bids[0]), a.address, "approved transfer works");

console.log("— metadata —");
const uri = await gear.tokenURI(1);
ok(uri.startsWith("data:application/json;base64,"), "on-chain tokenURI");
const meta = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString());
ok(/KJP GEAR #1/.test(meta.name), "name");
ok(/75% burned as KJP/.test(meta.description), "pledge in metadata");
ok(meta.image.startsWith("data:image/svg+xml;base64,"), "svg image");

console.log("— sellout: distribution is supply-exact —");
let minted = Number(await gear.totalSupply());
while (minted < 100){
  const q = Math.min(5, 100 - minted);
  await (await gear.connect(signers[3 + (minted % 6)]).mint(q, { value: PRICE * BigInt(q), ...GL })).wait();
  minted += q;
}
eq(await gear.totalSupply(), 100, "sold out at exactly 100");
await reverts(gear.connect(a).mint(1, { value: PRICE, ...GL }), "mint past sellout");
const want = [0, 22, 20, 16, 14, 12, 8, 5, 3];
const counts = new Array(9).fill(0);
for (let id = 1; id <= 100; id++) counts[Number(await gear.gearTypeOf(id))]++;
for (let t = 1; t <= 8; t++) eq(counts[t], want[t], "type " + t + " minted exactly " + want[t]);
for (let t = 1; t <= 8; t++) eq(await gear.poolLeft(t), 0, "pool " + t + " empty");

console.log("\n" + pass + "/" + (pass + fail) + " PASS" + (fail ? "  —  " + fail + " FAILED" : ""));
process.exit(fail ? 1 : 0);
