// KJP GEAR MARKET — ganache suite. Run: node tools/test-market.mjs
// The headline invariant: BID ESCROW IS UNTOUCHABLE. Everything else is
// ordinary marketplace correctness.
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reqA = createRequire("C:/Users/Bia/New folder/wick-arsenal/");
const ganache = reqA("ganache"), ethers = reqA("ethers");
const A = n => JSON.parse(readFileSync(join(root, "out", n + ".json"), "utf8"));
const GearArt = A("KJPGear"), MktArt = A("KJPGearMarket"), TokArt = A("MockToken"), RtrArt = A("MockRouter");

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.error("  ✗ " + m)); };
const eq = (a, b, m) => ok(String(a) === String(b), m + " (got " + a + ", want " + b + ")");
/* ganache mines an explicit-gas revert as a status-0 RECEIPT, so a revert check
   must follow through — and a ContractFactory.deploy() exposes
   waitForDeployment(), not wait(). Missing that branch silently passes a
   constructor guard that never fired. */
async function reverts(p, m){
  try {
    const r = await p;
    if (r && r.wait) await r.wait();
    else if (r && r.waitForDeployment) await r.waitForDeployment();
    fail++; console.error("  ✗ did NOT revert: " + m);
  } catch { pass++; }
}

const server = ganache.provider({ logging: { quiet: true }, wallet: { totalAccounts: 8, defaultBalance: 50_000_000 }, miner: { blockGasLimit: 30_000_000 } });
const p = new ethers.BrowserProvider(server);
const S = []; for (let i = 0; i < 8; i++) S.push(await p.getSigner(i));
const [dep, seller, buyer, bidder, other] = S;
const GL = { gasLimit: 12_000_000n };
const DEAD = "0x000000000000000000000000000000000000dEaD";
const bal = async a => BigInt(await p.send("eth_getBalance", [a, "latest"]));   // raw: ethers coalesces
const E = ethers.parseEther;

console.log("deploying gear + market…");
const mk = async (n, s) => (await new ethers.ContractFactory(TokArt.abi, TokArt.bytecode, dep)).deploy(n, s);
const KJPt = await mk("KJP", "KJP"), WICKt = await mk("Wick", "WICK"), WPLS = await mk("WPLS", "WPLS");
const router = await (await new ethers.ContractFactory(RtrArt.abi, RtrArt.bytecode, dep)).deploy();
const PRICE = E("1000000");
const gear = await (new ethers.ContractFactory(GearArt.abi, GearArt.bytecode, dep))
  .deploy(PRICE, await router.getAddress(), await WPLS.getAddress(), await KJPt.getAddress(), await WICKt.getAddress(), GL);
await (await gear.setMintOpen(true, GL)).wait();
const MktF = new ethers.ContractFactory(MktArt.abi, MktArt.bytecode, dep);
await reverts(MktF.deploy(seller.address, await router.getAddress(), await WPLS.getAddress(), await KJPt.getAddress(), await WICKt.getAddress(), GL), "EOA as gear contract refused");
const mkt = await MktF.deploy(await gear.getAddress(), await router.getAddress(), await WPLS.getAddress(), await KJPt.getAddress(), await WICKt.getAddress(), GL);
const M = await mkt.getAddress();

/* seller mints 5 pieces */
await (await gear.connect(seller).mint(5, { value: PRICE * 5n, ...GL })).wait();
const [ids] = await gear.gearOfOwner(seller.address);
eq(ids.length, 5, "seller holds 5 pieces");
const t0 = ids[0];

console.log("— listing —");
await reverts(mkt.connect(seller).list(t0, E("2000000"), GL), "list without approval");
await (await gear.connect(seller).setApprovalForAll(M, true, GL)).wait();
await reverts(mkt.connect(buyer).list(t0, E("2000000"), GL), "list a token you do not own");
await reverts(mkt.connect(seller).list(t0, 0, GL), "list at price 0");
await (await mkt.connect(seller).list(t0, E("2000000"), GL)).wait();
eq((await mkt.listings(t0)).price, E("2000000"), "listed");

console.log("— buying: seller paid, royalty burned 50/50 —");
await reverts(mkt.connect(buyer).buy(t0, { value: E("1"), ...GL }), "underpay");
const sBefore = await bal(seller.address);
const k0 = await KJPt.balanceOf(DEAD), w0 = await WICKt.balanceOf(DEAD);
await (await mkt.connect(buyer).buy(t0, { value: E("2000000"), ...GL })).wait();
const royalty = E("2000000") * 1500n / 10000n;
eq(await gear.ownerOf(t0), buyer.address, "buyer owns the piece");
eq((await bal(seller.address)) - sBefore, E("2000000") - royalty, "seller received 85%");
const rate = 1000n;
eq((await KJPt.balanceOf(DEAD)) - k0, royalty / 2n * rate, "50% of royalty burned as KJP");
eq((await WICKt.balanceOf(DEAD)) - w0, (royalty - royalty / 2n) * rate, "50% of royalty burned as WICK");
eq((await mkt.listings(t0)).price, 0, "listing cleared");
await reverts(mkt.connect(other).buy(t0, { value: E("2000000"), ...GL }), "buy an unlisted token");

console.log("— a stale listing cannot pay the wrong person —");
const t1 = ids[1];
await (await mkt.connect(seller).list(t1, E("500000"), GL)).wait();
await (await gear.connect(seller).transferFrom(seller.address, other.address, t1, GL)).wait();
await reverts(mkt.connect(buyer).buy(t1, { value: E("500000"), ...GL }), "buy after the seller moved the token");

console.log("— offers: escrow in, escrow back —");
const t2 = ids[2];
await (await mkt.connect(bidder).makeOffer(0, await gear.gearTypeOf(t2), { value: E("300000"), ...GL })).wait();
eq(await mkt.offerEscrow(), E("300000"), "escrow tracked");
eq(await bal(M), E("300000"), "contract holds exactly the escrow");
const id0 = 0;
await reverts(mkt.connect(other).cancelOffer(id0, GL), "cancel someone else's offer");
const bBefore = await bal(bidder.address);
await (await mkt.connect(bidder).cancelOffer(id0, GL)).wait();
ok((await bal(bidder.address)) > bBefore, "bidder refunded");
eq(await mkt.offerEscrow(), 0, "escrow released");
await reverts(mkt.connect(bidder).cancelOffer(id0, GL), "double-cancel");

console.log("— accepting a type offer —");
const gt = await gear.gearTypeOf(t2);
await (await mkt.connect(bidder).makeOffer(0, gt, { value: E("400000"), ...GL })).wait();
const id1 = Number(await mkt.offerCount()) - 1;
const wrong = ids.find(async i => (await gear.gearTypeOf(i)) !== gt);
await reverts(mkt.connect(buyer).acceptOffer(id1, t0, GL), "accept with a token you do not own");
const s2 = await bal(seller.address);
const k1 = await KJPt.balanceOf(DEAD);
await (await mkt.connect(seller).acceptOffer(id1, t2, GL)).wait();
eq(await gear.ownerOf(t2), bidder.address, "bidder received the piece");
const roy2 = E("400000") * 1500n / 10000n;
ok((await bal(seller.address)) - s2 > roy2, "seller paid from escrow");
ok((await KJPt.balanceOf(DEAD)) - k1 > 0n, "offer royalty burned too");
eq(await mkt.offerEscrow(), 0, "escrow fully released");
await reverts(mkt.connect(seller).acceptOffer(id1, ids[3], GL), "accept a closed offer");

console.log("— specific-token offers —");
const t3 = ids[3];
await (await mkt.connect(bidder).makeOffer(t3, 0, { value: E("100000"), ...GL })).wait();
const id2 = Number(await mkt.offerCount()) - 1;
await reverts(mkt.connect(seller).acceptOffer(id2, ids[4], GL), "satisfy a token-specific offer with another token");
await (await mkt.connect(seller).acceptOffer(id2, t3, GL)).wait();
eq(await gear.ownerOf(t3), bidder.address, "specific offer honoured");

console.log("— THE INVARIANT: escrow can never be burned —");
await (await mkt.connect(bidder).makeOffer(0, 1, { value: E("777000"), ...GL })).wait();
const escrowed = await mkt.offerEscrow();
eq(escrowed, E("777000"), "live bid escrowed");
await reverts(mkt.burnPool(0, 0, GL), "burnPool with nothing pending (escrow is NOT pending)");
eq(await mkt.offerEscrow(), escrowed, "escrow untouched by the crank attempt");
eq(await bal(M), escrowed, "contract still holds every escrowed wei");
/* now break the router so a royalty defers, and prove the two pots stay apart */
await (await router.setBroken(true, GL)).wait();
await (await mkt.connect(seller).list(ids[4], E("200000"), GL)).wait();
await (await mkt.connect(buyer).buy(ids[4], { value: E("200000"), ...GL })).wait();
const pend = await mkt.burnPending();
eq(pend, E("200000") * 1500n / 10000n, "failed royalty became burnPending");
eq(await mkt.offerEscrow(), escrowed, "escrow STILL untouched while a burn is pending");
eq(await bal(M), escrowed + pend, "held == escrow + pending, exactly");
await (await router.setBroken(false, GL)).wait();
const k2 = await KJPt.balanceOf(DEAD);
await (await mkt.connect(other).burnPool(0, 0, GL)).wait();          // anyone can crank
ok((await KJPt.balanceOf(DEAD)) - k2 > 0n, "crank burned the pending royalty");
eq(await mkt.burnPending(), 0, "pending cleared");
eq(await mkt.offerEscrow(), escrowed, "escrow SURVIVED the burn");
eq(await bal(M), escrowed, "only escrow remains");
const sv = await mkt.solvent();
ok(sv[0], "contract reports solvent");

console.log("— the pledge —");
ok(!MktArt.abi.some(f => /withdraw|sweep|rescue/i.test(f.name || "")), "no withdraw/sweep/rescue in the ABI");
const payables = MktArt.abi.filter(f => f.stateMutability === "payable" && f.type === "function").map(f => f.name);
ok(payables.every(n => ["buy", "makeOffer"].includes(n)), "only buy + makeOffer take PLS  [" + payables.join(",") + "]");

console.log("— UI reads —");
const oo = await mkt.openOffers();
eq(oo[0].length, 1, "openOffers lists the live bid");
const li = await mkt.listingsIn(1, 5);
ok(Array.isArray(li[0]), "listingsIn returns a range");

console.log("\n" + pass + "/" + (pass + fail) + " PASS" + (fail ? "  — " + fail + " FAILED" : ""));
process.exit(fail ? 1 : 0);
