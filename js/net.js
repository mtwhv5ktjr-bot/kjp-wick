/* KJP net — wallet + WICK ARSENAL guns + shared leaderboard (mode "kjp").
   Same trust path as games.wick.pics: ownership is public chain data (API or
   direct eth_call), scores are personally signed per submission. */
"use strict";

const NFT_VERIFY_URL = "https://wick-arsenal.vercel.app/api/verify";
/* LEADERBOARD HOST — one constant, so the board can move without touching
   anything else. `?lb=<origin>` overrides it for testing against a local
   tools/lb-server.mjs without editing or redeploying the build. */
const LB_HOST = (/[?&]lb=([^&]+)/.exec(location.search) || [])[1];
const LB_URL = LB_HOST ? decodeURIComponent(LB_HOST).replace(/\/$/, "") + "/api/leaderboard"
                       : "https://wick-arsenal.vercel.app/api/leaderboard";
const GUNS_ADDR = "0x188848DdB42fA8Ca2EB05649c944e05dfA2158FD";   // WickGuns — LIVE on PulseChain
const MODS_ADDR = "0x004E6610ff47c6A6510DA446257822B37D26CD73";   // WickMods attachments
/* KJP GEAR — the 100-piece cross-game mint. Paste the address after
   tools/deploy-gear.mjs; all-zero = "not deployed yet" and the game simply
   runs gearless. The same address goes in pepe-zero's GEAR_ADDR. */
const GEAR_ADDR = "0x6BdED56bA6F0d8062e056062D47F41ac735d5d10";   // KJP GEAR — LIVE on PulseChain 2026-08-04
const PULSE_RPC = "https://rpc.pulsechain.com";
/* Reown (WalletConnect) — public client identifier, safe to ship */
const REOWN_ID = "02101ae7f77b3ea70f50919779025201";

let walletAddr = null, walletStatus = "", walletBusy = false, watchMode = false;
window.ownedGunTypes = [];
let playerName = "";
try{ playerName = (localStorage.getItem("kjp_name") || localStorage.getItem("pw_name") || "").slice(0, 16); }catch(e){}
let lbTop = null, lbAt = 0, lbBusy = false, lbDown = false, lbMsg = "";
let wcProvider = null;

function fetchT(url, opts, ms){
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms || 12000);
  return fetch(url, Object.assign({}, opts || {}, { signal: c.signal })).finally(() => clearTimeout(t));
}
const INAPP = /Telegram|Instagram|FBAN|FBAV|Twitter|Line\/|MicroMessenger/i.test(navigator.userAgent) || !!window.TelegramWebviewProxy;

async function getEth(){
  if (window.ethereum) return window.ethereum;
  if (!REOWN_ID) return null;
  if (wcProvider) return wcProvider;
  const { EthereumProvider } = await import("https://esm.sh/@walletconnect/ethereum-provider@2");
  wcProvider = await EthereumProvider.init({
    projectId: REOWN_ID,
    chains: [369], optionalChains: [369],
    rpcMap: { 369: PULSE_RPC },
    showQrModal: true,
    metadata: { name: "KJP — THE BLACK FILE", description: "Top-down stealth in the $WICK universe.",
      url: "https://kjp-game.wick.pics", icons: ["https://games.wick.pics/icon-192.png"] }
  });
  return wcProvider;
}

async function connectWallet(){
  if (walletBusy) return; walletBusy = true; walletStatus = "connecting…";
  try{
    if (INAPP && !window.ethereum){ walletStatus = "in-app browser — paste your address instead"; walletBusy = false; enterAddress(); return; }
    const eth = await getEth();
    if (!eth){ walletStatus = "no wallet — install MetaMask/Rabby, or WATCH an address"; walletBusy = false; return; }
    watchWalletEvents();                     // bind once the provider actually exists
    let accts;
    if (eth === window.ethereum) accts = await eth.request({ method: "eth_requestAccounts" });
    else { walletStatus = "approve in your wallet app, then come back…"; accts = await eth.enable(); }
    const addr = accts[0];
    walletStatus = "loading your loadout…";
    let types = null, mods = [];
    try{
      const r = await fetchT(NFT_VERIFY_URL + "?address=" + addr); const d = await r.json();
      if (r.ok && d.ok){ types = [...new Set((d.guns || []).map(x => x.type))];
                         mods = [...new Set((d.mods || []).map(x => x.type))]; }
    }catch(e){}
    if (types === null){ types = await rpcGunsOf(addr); mods = await rpcModsOf(addr); }   // API down → straight to PulseChain
    const gear = await rpcGearOf(addr);      // gear is KJP-native: always read from chain
    applyGuns(types, addr, false, false, mods, gear);
  }catch(e){
    walletAddr = null; watchMode = false;
    walletStatus = (e && (e.message || e.code)) ? ("error: " + (e.shortMessage || e.message || e.code)) : "connect cancelled";
  }
  walletBusy = false;
}
/* SWITCH WALLET — the thing every wallet UI hides.
   eth_requestAccounts silently reuses whatever is already approved, so a
   player with two wallets gets stuck on the first one forever. Revoking the
   permission first FORCES the account picker open. Falls back to a plain
   reconnect on wallets that don't implement the permission RPCs. */
async function switchWallet(){
  if (walletBusy) return;
  const eth = window.ethereum;
  if (!eth){ walletStatus = "no wallet app — use WATCH to paste an address"; enterAddress(); return; }
  walletBusy = true; walletStatus = "pick an account in your wallet…";
  try{
    try{
      await eth.request({ method: "wallet_revokePermissions", params: [{ eth_accounts: {} }] });
    }catch(e){ /* not supported everywhere — requestPermissions below still prompts */ }
    try{
      await eth.request({ method: "wallet_requestPermissions", params: [{ eth_accounts: {} }] });
    }catch(e){
      if (e && (e.code === 4001)) { walletStatus = "switch cancelled"; walletBusy = false; return; }
    }
  }catch(e){}
  walletBusy = false;
  await connectWallet();                     // re-reads whatever they just picked
}
/* the wallet changed underneath us (user switched in MetaMask itself) —
   follow it instead of silently showing the old wallet's loadout */
function watchWalletEvents(){
  const eth = window.ethereum;
  if (!eth || !eth.on || eth._kjpBound) return;
  eth._kjpBound = true;
  eth.on("accountsChanged", accts => {
    if (!accts || !accts.length){ disconnectWallet(); walletStatus = "wallet locked or disconnected"; return; }
    if (walletAddr && accts[0].toLowerCase() === walletAddr.toLowerCase()) return;
    walletStatus = "wallet changed — reloading your loadout…";
    connectWallet();
  });
  eth.on("chainChanged", () => { if (walletAddr) connectWallet(); });
}
try{ watchWalletEvents(); }catch(e){}

function disconnectWallet(){
  walletAddr = null; watchMode = false;
  window.ownedGunTypes = []; window.ownedModTypes = []; window.ownedGearTypes = [];
  bumpMods();
  walletStatus = "unlinked";
  try{ localStorage.removeItem("kjp_nft"); }catch(e){}
  reconcileSkin();
}

/* watch mode: any address, no wallet app (API first, chain fallback) */
async function verifyWatch(addrRaw){
  if (walletBusy){ walletStatus = "busy — another lookup running"; return null; }
  if (walletAddr){ walletStatus = "already connected — unlink first"; return null; }
  const addr = String(addrRaw || "").trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)){ walletStatus = "that's not a wallet address (0x…)"; return null; }
  walletBusy = true; walletStatus = "looking up guns on-chain…";
  let applied = null;
  try{
    const gear = await rpcGearOf(addr);
    const r = await fetchT(NFT_VERIFY_URL + "?address=" + addr); const data = await r.json();
    if (r.ok && data.ok){
      applyGuns([...new Set((data.guns || []).map(x => x.type))], addr, true, false,
        [...new Set((data.mods || []).map(x => x.type))], gear);
      walletBusy = false; return { addr };
    }
    throw new Error((data && data.error) || "api-down");
  }catch(e){
    try{ applyGuns(await rpcGunsOf(addr), addr, true, false, await rpcModsOf(addr), await rpcGearOf(addr)); applied = { addr }; }
    catch(e2){ walletStatus = "lookup failed — try again or CONNECT"; }
  }
  walletBusy = false;
  return applied;
}
/* direct eth_call WickGuns.gunsOfOwner(address) — no API, no wallet, just the chain */
async function rpcGunsOf(addr){
  const data = "0x25a88846" + addr.slice(2).toLowerCase().padStart(64, "0");
  const r = await fetchT(PULSE_RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: GUNS_ADDR, data }, "latest"] }) });
  const j = await r.json(); if (!j.result || j.result === "0x") throw new Error("empty");
  const hex = j.result.slice(2), word = i => parseInt(hex.slice(i * 64, i * 64 + 64), 16);
  const tOff = word(1) / 32, tLen = word(tOff), types = [];
  if (!isFinite(tOff) || !isFinite(tLen) || tLen > 500) throw new Error("bad abi");
  for (let i = 0; i < tLen; i++){ const v = word(tOff + 1 + i); if (isFinite(v)) types.push(v); }
  return [...new Set(types)];
}
/* mods + gear are bonuses — failures return [] instead of throwing, a hiccup
   here must never block gun verification (pepe-zero house rule). Both read the
   identical (uint256[] ids, uint8[] types) shape, so one decoder serves both. */
async function rpcTypesOf(contract, selector, addr){
  try{
    if (/^0x0{40}$/.test(contract)) return [];
    const data = selector + addr.slice(2).toLowerCase().padStart(64, "0");
    const r = await fetchT(PULSE_RPC, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: contract, data }, "latest"] }) });
    const j = await r.json(); if (!j.result || j.result === "0x") return [];
    const hex = j.result.slice(2), word = i => parseInt(hex.slice(i * 64, i * 64 + 64), 16);
    const tOff = word(1) / 32, tLen = word(tOff), types = [];
    if (!isFinite(tOff) || !isFinite(tLen) || tLen > 500) return [];
    for (let i = 0; i < tLen; i++){ const v = word(tOff + 1 + i); if (isFinite(v)) types.push(v); }
    return [...new Set(types)];
  }catch(e){ return []; }
}
const rpcModsOf = addr => rpcTypesOf(MODS_ADDR, "0x8d56809a", addr);   // modsOfOwner(address)
const rpcGearOf = addr => rpcTypesOf(GEAR_ADDR, "0xfce8c498", addr);   // gearOfOwner(address)
function applyGuns(types, addr, watch, quiet, mods, gear){
  types = Array.isArray(types) ? types.filter(n => typeof n === "number" && isFinite(n)) : [];
  window.ownedModTypes = Array.isArray(mods) ? mods.filter(n => typeof n === "number" && isFinite(n) && MODDEFS[n]) : [];
  window.ownedGearTypes = Array.isArray(gear) ? gear.filter(n => typeof n === "number" && isFinite(n) && GEARDEFS[n]) : [];
  window.ownedGunTypes = types;
  bumpMods();                                    // weapon specs are stale the moment mods/gear change
  watchMode = !!watch;
  walletAddr = watch ? null : addr;
  window.watchAddr = watch ? addr : null;
  const ids = nftWeaponIds(types);
  const nGear = window.ownedGearTypes.length;
  const bits = [];
  if (ids.length) bits.push(ids.length + " gun" + (ids.length > 1 ? "s" : ""));
  if (window.ownedModTypes.length) bits.push(window.ownedModTypes.length + " mod" + (window.ownedModTypes.length > 1 ? "s" : ""));
  if (nGear) bits.push(nGear + " gear");
  walletStatus = bits.length
    ? (watch ? "👁 watch: " : "✓ ") + bits.join(" · ") + (hasHolo() ? " · HOLO +1♥" : "")
      + (watch ? " — CONNECT to submit scores" : "")
    : (watch ? "👁 watching — nothing from the WICK universe there" : "✓ connected — no WICK NFTs in wallet");
  try{ localStorage.setItem("kjp_nft", JSON.stringify({ addr, types, mods: window.ownedModTypes, gear: window.ownedGearTypes, watch: !!watch, ts: Date.now() })); }catch(e){}
  reconcileSkin();
  if ((types.length || nGear) && !quiet) SFX.unlock();
}
/* boot restore: 24h cache, then silent refresh */
(function restoreNft(){
  let saved = null;
  try{ saved = JSON.parse(localStorage.getItem("kjp_nft") || "null"); }catch(e){}
  const urlW = (/[?&#]w=(0x[a-fA-F0-9]{40})/.exec(location.search + location.hash) || [])[1] || null;
  if (urlW){ setTimeout(() => verifyWatch(urlW), 400); return; }
  if (saved && Array.isArray(saved.types) && Date.now() - (saved.ts || 0) < 864e5){
    applyGuns(saved.types, saved.addr, saved.watch, true, saved.mods, saved.gear);
    walletStatus += " (cached)";
  }
})();

/* address sheet DOM wiring */
function enterAddress(){
  const s = document.getElementById("wsheet");
  if (!s){ const a = prompt("Wallet address:", ""); if (a !== null) verifyWatch(a); return; }
  const inp = document.getElementById("wsIn"), msg = document.getElementById("wsMsg");
  msg.textContent = ""; msg.className = "";
  if (window.watchAddr || walletAddr) inp.value = window.watchAddr || walletAddr;
  s.classList.add("on");
  setTimeout(() => { try{ inp.focus(); }catch(e){} }, 50);
}
(function wireSheet(){
  const s = document.getElementById("wsheet"); if (!s) return;
  const inp = document.getElementById("wsIn"), msg = document.getElementById("wsMsg");
  const say = (t, bad) => { msg.textContent = t; msg.className = bad ? "bad" : ""; };
  async function go(){
    const a = (inp.value || "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(a)){ say("That doesn't look like an address — 0x…, 42 characters.", true); return; }
    say("Looking up guns on-chain…");
    const r = await verifyWatch(a);
    if (r){ say("✓ done"); setTimeout(() => s.classList.remove("on"), 500); }
    else say(walletStatus, true);
  }
  document.getElementById("wsGo").onclick = go;
  inp.onkeydown = e => { if (e.key === "Enter") go(); };
  document.getElementById("wsX").onclick = () => s.classList.remove("on");
})();

/* Re-read gear (and guns) for the wallet already linked — for the minute after
   you mint, when the game should just SEE it without a reconnect dance. */
async function refreshGear(){
  const addr = walletAddr || window.watchAddr;
  if (!addr){ walletStatus = "connect or watch a wallet first"; return; }
  if (walletBusy) return;
  walletBusy = true; walletStatus = "re-reading the chain…";
  try{
    const gear = await rpcGearOf(addr);
    let types = window.ownedGunTypes || [], mods = window.ownedModTypes || [];
    try{ const t = await rpcGunsOf(addr); if (t) types = t; }catch(e){}
    try{ mods = await rpcModsOf(addr); }catch(e){}
    const had = (window.ownedGearTypes || []).length;
    applyGuns(types, addr, !walletAddr, false, mods, gear);
    if (gear.length > had) walletStatus = "✓ +" + (gear.length - had) + " new gear — already equipped";
  }catch(e){ walletStatus = "refresh failed — try again"; }
  walletBusy = false;
}

function setPlayerName(){
  const n = prompt("Display name for the board (max 16 chars).\nBlank = wallet address:", playerName);
  if (n === null) return;
  playerName = n.replace(/[^\w .\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
  try{ localStorage.setItem("kjp_name", playerName); }catch(e){}
}

/* leaderboard: GET is throttled; POST signs the house message format */
let lbNote = "";       // why the board is empty — never leave the player guessing
function lbFetch(){
  if (lbBusy || (lbTop && performance.now() - lbAt < 120000)) return;
  lbBusy = true;
  fetchT(LB_URL + "?mode=kjp").then(r => r.json()).then(j => {
    if (j && j.ok){
      lbTop = j.top || [];
      /* A DEGRADED board and an empty board look identical to a player, and
         that is exactly how a suspended store ate a tournament unnoticed.
         Say which one it is, out loud, on the front page. */
      lbDown = !!j.degraded;
      lbNote = j.degraded ? "BOARD OFFLINE — existing scores are safe"
             : j.self_hosted ? "self-hosted board" : "";
    } else { lbDown = true; lbNote = "board unreachable"; }
    lbAt = performance.now();
  }).catch(() => { lbDown = true; lbNote = "board unreachable"; lbAt = performance.now(); })
    .finally(() => { lbBusy = false; });
}
/* Parameterized: the campaign posts mode "kjp" as it always has; the daily
   posts its per-day lane, aggravated runs theirs. The server accepts any
   mode string (verified in api/leaderboard.js source: cleanMode is only
   slice(0,12), no whitelist) and keeps one PB per wallet PER MODE, so lanes
   can never contaminate each other. The signed message binds the mode — the
   server refuses a signature replayed across lanes. */
async function submitScore(mode, score, level){
  mode = String(mode || "kjp").slice(0, 12);
  if (!walletAddr){ lbMsg = "connect first"; return; }
  const s = score !== undefined ? Math.floor(score) : campaignScore();
  if (s <= 0){ lbMsg = "clear an op first"; return; }
  lbMsg = "signing…";
  try{
    const eth = await getEth();
    const msg = "WICK score\naddress:" + walletAddr + "\nscore:" + s + "\nmode:" + mode + "\nts:" + Date.now();
    const sig = await eth.request({ method: "personal_sign", params: [msg, walletAddr] });
    lbMsg = "submitting…";
    const r = await fetchT(LB_URL, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: walletAddr, name: playerName, score: s,
        level: Math.max(1, level !== undefined ? level : clearedCount()), mode, message: msg, signature: sig }) });
    const j = await r.json();
    if (r.ok && j.ok){ lbMsg = "✓ rank #" + j.rank; lbTop = null; lbAt = 0; dailyTop = null; SFX.unlock(); }
    else lbMsg = (j && j.error) ? j.error.slice(0, 48) : "submit failed";
  }catch(e){ lbMsg = "sign cancelled"; }
  setTimeout(() => { lbMsg = ""; }, 6000);
}

/* the day's world board — fetched on demand, cached 2 minutes like lbTop */
let dailyTop = null, dailyTopAt = 0, dailyTopBusy = false;
function dailyBoardFetch(){
  if (dailyTopBusy || (dailyTop && performance.now() - dailyTopAt < 120000)) return;
  dailyTopBusy = true;
  fetchT(LB_URL + "?mode=" + dailyMode()).then(r => r.json()).then(j => {
    dailyTop = (j && j.top) || [];
    dailyTopAt = performance.now();
  }).catch(() => { dailyTop = []; dailyTopAt = performance.now(); })
    .finally(() => { dailyTopBusy = false; });
}
