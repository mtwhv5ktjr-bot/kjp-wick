/* KJP — THE READY ROOM.
   The gunsmith bench's cousin: one screen where the whole operative is laid
   out and every piece is visibly ARMED. Gear has no slots — anything you own
   is always live — so this screen's job is to prove that rather than ask for
   a decision. Callouts hang off the body position each piece actually affects,
   with a wire back to it, and everything you do not own yet is ghosted with
   the pool count so you can see exactly what is missing.
   The ONE real choice on this screen is which two NFT guns you carry. */
"use strict";

/* where each piece rides — x,y are offsets from the figure's centre */
const GEAR_ANCHOR = {
  1: { x: 62,  y: 26,  side: "r", label: "MUZZLE" },
  2: { x: 0,   y: -6,  side: "l", label: "TORSO"  },
  3: { x: -6,  y: 96,  side: "l", label: "FEET"   },
  4: { x: 40,  y: 54,  side: "r", label: "BELT"   },
  5: { x: 2,   y: -74, side: "l", label: "HEAD"   },
  6: { x: -44, y: 54,  side: "l", label: "POUCH"  },
  7: { x: 46,  y: 78,  side: "r", label: "RING"   },
  /* right-hand side, deliberately: a 5/3 split ran the last left callout
     straight through the gun rack. Four a side clears it at every count. */
  8: { x: 56,  y: 84,  side: "r", label: "HAND"   }
};
let RR_hover = 0;
/* Canvas has no anchors, so "mint at …" was just text nobody could click.
   Open in a new tab, but fall back to same-tab if a popup blocker eats it —
   a dead buy button is worse than losing the game tab. */
const MINT_URL = "https://kjp-game.wick.pics/mint";
/* Secondary market — the only route to a type once its share of the 100 is
   gone, and the only way to buy a SPECIFIC piece rather than a random one.
   Live since 2026-08-04 (KJPGearMarket 0x09A53d8B…); 15% of every resale is
   burned, half KJP half WICK. */
const MARKET_URL = "https://mint.wick.pics/#gear-market";
const ARSENAL_URL = "https://mint.wick.pics";
function openShop(url){
  try{
    const w = window.open(url, "_blank", "noopener");
    if (!w || w.closed) location.href = url;
  }catch(e){ location.href = url; }
}

function drawReadyRoom(){
  UIB = [];
  const owned = window.ownedGearTypes || [];
  const gunIds = nftWeaponIds(window.ownedGunTypes || []);
  const carry = (PROG.carry || []).filter(id => gunIds.includes(id));

  g.fillStyle = "#05070c"; g.fillRect(0, 0, W, H);
  /* blueprint floor, same language as the cards */
  g.strokeStyle = "rgba(255,157,91,0.05)"; g.lineWidth = 1;
  for (let x = 0; x < W; x += 40){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 40){ g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }

  g.font = "900 30px Arial Black"; g.fillStyle = "#e6f1ff"; g.fillText("READY ROOM", 60, 58);
  g.font = "700 11px Verdana"; g.fillStyle = "#7c8ba3";
  g.fillText("No slots, no limit — everything you own walks in with you unless you stow it. Some pieces cost you something; click one to leave it in the locker.", 60, 78);

  /* ---- the operative, centre stage ---- */
  const CX = W / 2, CY = 330;
  const halo = g.createRadialGradient(CX, CY - 10, 30, CX, CY - 10, 230);
  halo.addColorStop(0, "rgba(255,157,91,0.10)"); halo.addColorStop(1, "rgba(255,157,91,0)");
  g.fillStyle = halo; g.beginPath(); g.arc(CX, CY - 10, 230, 0, TAU); g.fill();
  g.strokeStyle = "rgba(255,157,91,0.18)"; g.lineWidth = 1.5;
  g.beginPath(); g.arc(CX, CY - 10, 150, 0, TAU); g.stroke();
  g.setLineDash([3, 12]); g.strokeStyle = "rgba(255,157,91,0.3)";
  g.beginPath(); g.arc(CX, CY - 10, 168, performance.now() / 5000, performance.now() / 5000 + TAU); g.stroke();
  g.setLineDash([]);
  bustKJP(CX, CY, 2.15);
  g.font = "900 12px Arial Black"; g.fillStyle = "#7cf9a5"; g.textAlign = "center";
  g.fillText(skinDef().name, CX, CY + 128);
  g.font = "700 10px Verdana"; g.fillStyle = "#57717f";
  const activeN = owned.filter(t => !gearStowed(t)).length;
  g.fillText(owned.length ? activeN + " OF " + owned.length + " GEAR TYPES ARMED" + (activeN < owned.length ? " · " + (owned.length - activeN) + " STOWED" : "")
                          : "NO GEAR — the ops still run without it", CX, CY + 146);
  g.textAlign = "left";
  /* Holders get a way OUT as well as in. Deliberately no valuation here — the
     game has no price feed, and a made-up number on a screen people trade
     against would be worse than no number. */
  if (owned.length){
    const mw = 250, mx = CX - mw / 2, my = CY + 158;
    const mh2 = MOUSE.x >= mx && MOUSE.x <= mx + mw && MOUSE.y >= my && MOUSE.y <= my + 22;
    g.fillStyle = mh2 ? "rgba(124,249,165,0.18)" : "rgba(124,249,165,0.06)";
    g.fillRect(mx, my, mw, 22);
    g.strokeStyle = mh2 ? "#7cf9a5" : "rgba(124,249,165,0.28)"; g.lineWidth = 1;
    g.strokeRect(mx + 0.5, my + 0.5, mw - 1, 21);
    g.font = "900 9px Arial Black"; g.fillStyle = mh2 ? "#7cf9a5" : "#5e8f70"; g.textAlign = "center";
    g.fillText("◈ SELL OR TRADE — 15% BURNS ON EVERY SALE", CX, my + 14);
    g.textAlign = "left";
    UIB.push({ x: mx, y: my, w: mw, h: 22, cb: () => openShop(MARKET_URL) });
  }

  /* ---- gear callouts, wired to the body ---- */
  const L = [], R = [];
  for (let t = 1; t <= 8; t++) (GEAR_ANCHOR[t].side === "l" ? L : R).push(t);
  const rowY = i => 132 + i * 96;
  const place = (t, i, side) => {
    const d = GEARDEFS[t], a = GEAR_ANCHOR[t];
    const bw = 250, bh = 86;            // 8px taller: the cost line needs a home
    const bx = side === "l" ? 60 : W - 60 - bw, by = rowY(i);
    const own = owned.includes(t);      // in the wallet
    const has = own && !gearStowed(t);  // actually walking in with you
    const hot = MOUSE.x >= bx && MOUSE.x <= bx + bw && MOUSE.y >= by && MOUSE.y <= by + bh;
    /* wire from the box to the body point it governs */
    const ax = CX + a.x, ay = CY + a.y;
    const ex = side === "l" ? bx + bw : bx, ey = by + bh / 2;
    g.strokeStyle = has ? (hot ? "rgba(255,210,124,0.85)" : "rgba(255,157,91,0.42)") : "rgba(120,140,160,0.14)";
    g.lineWidth = has ? 1.6 : 1;
    g.beginPath(); g.moveTo(ex, ey);
    g.lineTo(ex + (side === "l" ? 26 : -26), ey);
    g.lineTo(ax, ay); g.stroke();
    if (has){ g.fillStyle = hot ? "#ffd27c" : "#ff9d5b"; g.beginPath(); g.arc(ax, ay, 3.4, 0, TAU); g.fill(); }
    /* the box */
    g.fillStyle = has ? (hot ? "rgba(58,40,14,0.95)" : "rgba(30,22,10,0.85)") : "rgba(10,14,18,0.7)";
    g.fillRect(bx, by, bw, bh);
    /* three states, three looks: ARMED (warm), STOWED (cool — you own it, it is
       just in the locker), and NOT OWNED (near-invisible) */
    g.strokeStyle = has ? (hot ? "#ffd27c" : "#8a6d2f") : own ? "#3f5261" : "#232c36";
    g.lineWidth = has ? 2 : 1;
    g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    g.font = "900 8px Arial Black"; g.fillStyle = has ? "#ff9d5b" : "#3d4854";
    g.fillText(a.label, bx + 10, by + 15);
    g.font = "900 12px Arial Black"; g.fillStyle = has ? "#ffd27c" : own ? "#8fa3b5" : "#54606e";
    g.fillText((has ? "◆ " : "") + d.name, bx + 10, by + 32);
    wrapText2(d.blurb, bx + 10, by + 47, bw - 20, 11, has ? "#cbd9c9" : "#414e59", "700 9px Verdana");
    /* what it costs you to carry — the reason STOW exists */
    if (d.cost){
      g.font = "700 8px Verdana";
      g.fillStyle = has ? "#e08a6a" : own ? "#5a4a42" : "#3a3430";
      g.fillText("▼ " + d.cost, bx + 10, by + bh - 8);
    }
    g.font = "900 8px Arial Black";
    if (own){
      /* owned: ARMED or STOWED, and the whole box flips it */
      g.fillStyle = has ? "#7cf9a5" : "#6a7a88";
      g.fillText(has ? "ARMED" : "STOWED", bx + bw - 48, by + 15);
      /* the engraving: what this piece has actually been through */
      const rec = (PROG.gearRec || {})[t];
      if (rec && rec.ops > 0){
        g.font = "700 8px Verdana"; g.fillStyle = has ? "#8a6d2f" : "#4e5c68";
        g.fillText(rec.ops + " ops" + (rec.ghosts ? " · " + rec.ghosts + " ghost" : ""), bx + bw - 48, by + 25);
        g.font = "900 8px Arial Black";
      }
      if (hot){
        g.fillStyle = "#ffd27c"; g.font = "900 8px Arial Black";
        g.fillText(has ? "▸ CLICK TO STOW" : "▸ CLICK TO DEPLOY", bx + bw - 108, by + bh - 8);
      }
      UIB.push({ x: bx, y: by, w: bw, h: bh, cb: () => { toggleGear(t); SFX.ui2(); } });
    }
    else {
      g.fillStyle = "#4e5c68"; g.fillText(d.pool + " OF 100", bx + bw - 56, by + 15);
      /* Two routes to owning this, because minting is random and finite: MINT
         pulls an unknown piece from what is left of the 100, MARKET buys this
         exact type from a holder. Once a type's share is minted out, the
         market is the ONLY route — so it can never be a mint-only screen.
         The rects are carved apart, not stacked: overlapping click targets
         make a tap ambiguous and the layout audit fails on BTN/BTN. */
      const mkW = 74, mintW = bw - mkW - 8;
      g.fillStyle = hot ? "#ffd27c" : "#6a7a88"; g.font = "900 8px Arial Black";
      g.fillText(hot ? "▸ MINT ONE" : "NOT OWNED — MINT", bx + 10, by + bh - 7);
      UIB.push({ x: bx, y: by, w: mintW, h: bh, cb: () => openShop(MINT_URL) });
      const mkX = bx + mintW + 8, mkY = by + bh - 22, mkHot = MOUSE.x >= mkX && MOUSE.x <= mkX + mkW && MOUSE.y >= mkY && MOUSE.y <= mkY + 16;
      g.fillStyle = mkHot ? "rgba(124,249,165,0.22)" : "rgba(124,249,165,0.08)";
      g.fillRect(mkX, mkY, mkW, 16);
      g.strokeStyle = mkHot ? "#7cf9a5" : "rgba(124,249,165,0.3)"; g.lineWidth = 1;
      g.strokeRect(mkX + 0.5, mkY + 0.5, mkW - 1, 15);
      g.fillStyle = mkHot ? "#7cf9a5" : "#5e8f70";
      g.fillText("◈ MARKET", mkX + 8, mkY + 11);
      UIB.push({ x: mkX, y: mkY, w: mkW, h: 16, cb: () => openShop(MARKET_URL) });
    }
  };
  L.forEach((t, i) => place(t, i, "l"));
  R.forEach((t, i) => place(t, i, "r"));

  /* ---- the one real choice: two guns ---- */
  const by0 = H - 132;
  g.font = "900 12px Arial Black"; g.fillStyle = "#9fd7b0";
  g.fillText("SLING TWO — " + carry.length + "/2", 60, by0 - 8);
  g.font = "700 9px Verdana"; g.fillStyle = "#57717f";
  g.fillText("hands + the HUSH-9 tranq are always on you", 190, by0 - 8);
  const perm = ["fists", "tranq"];
  let gx = 60;
  for (const id of perm){
    const w2 = WEAPONS[id];
    g.fillStyle = "rgba(9,16,13,0.85)"; g.fillRect(gx, by0, 150, 46);
    g.strokeStyle = "#224232"; g.lineWidth = 1.5; g.strokeRect(gx + 0.5, by0 + 0.5, 149, 45);
    g.font = "900 10px Arial Black"; g.fillStyle = "#9fd7b0"; g.fillText(w2.name, gx + 10, by0 + 19);
    g.font = "700 8px Verdana"; g.fillStyle = "#57717f"; g.fillText("ALWAYS CARRIED", gx + 10, by0 + 34);
    gx += 158;
  }
  if (!gunIds.length){
    g.font = "700 10px Verdana"; g.fillStyle = "#57717f";
    g.fillText(walletAddr || window.watchAddr ? "no WICK ARSENAL guns at this address — mint.wick.pics"
                                              : "link a wallet in ARSENAL to sling your NFT guns", gx + 8, by0 + 26);
  }
  for (const id of gunIds){
    const w2 = WEAPONS[id], spec = wSpec(id), inC = carry.includes(id);
    const bw = 168;
    const hot = MOUSE.x >= gx && MOUSE.x <= gx + bw && MOUSE.y >= by0 && MOUSE.y <= by0 + 46;
    g.fillStyle = inC ? "rgba(48,38,10,0.95)" : hot ? "rgba(18,38,28,0.9)" : "rgba(9,16,13,0.85)";
    g.fillRect(gx, by0, bw, 46);
    g.strokeStyle = inC ? "#ffd27c" : hot ? "#7cf9a5" : "#7a5f2f"; g.lineWidth = inC ? 2 : 1.5;
    g.strokeRect(gx + 0.5, by0 + 0.5, bw - 1, 45);
    g.font = "900 10px Arial Black"; g.fillStyle = inC ? "#ffd27c" : "#cfe3d2";
    g.fillText("◆ " + w2.name.slice(0, 18), gx + 10, by0 + 18);
    g.font = "700 8px Verdana"; g.fillStyle = "#8ba3b8";
    g.fillText((spec.silenced ? "QUIET" : "LOUD") + " · mag " + spec.mag + " · dmg " + spec.dmg, gx + 10, by0 + 32);
    g.font = "900 8px Arial Black"; g.fillStyle = inC ? "#ffd27c" : "#57717f";
    g.fillText(inC ? "SLUNG" : "TAP TO SLING", gx + 10, by0 + 42);
    UIB.push({ x: gx, y: by0, w: bw, h: 46, cb: () => {
      let c = (PROG.carry || []).filter(q => gunIds.includes(q));
      if (inC) c = c.filter(q => q !== id);
      else { c.push(id); if (c.length > 2) c.shift(); }
      PROG.carry = c; saveProg(); SFX.ui2();
    } });
    gx += bw + 8;
  }

  /* ---- the shop row. The missing piece was simply a way to BUY from here ---- */
  const missing = 8 - owned.length;
  btn(60, H - 62, 148, 40, "▶ INFILTRATE", () => { STATE = "select"; }, { fs: 13 });
  /* gold = the paid drop, and it says what is still unowned so the ask is concrete */
  const buyLabel = missing ? "🛒 GET GEAR — " + missing + " MISSING ↗" : "🛒 GEAR MINT ↗";
  const buyHot = btn(216, H - 62, 236, 40, buyLabel, () => openShop(MINT_URL), { fs: 12 });
  btn(460, H - 62, 200, 40, "🔫 GUNS + MODS ↗", () => openShop(ARSENAL_URL), { fs: 12 });
  btn(668, H - 62, 120, 40, walletBusy ? "…" : "↻ REFRESH", () => refreshGear(), { fs: 12 });
  btn(796, H - 62, 130, 40, "ARSENAL", () => { STATE = "arsenal"; }, { fs: 12 });
  btn(W - 190, H - 62, 120, 40, "← BACK", () => { STATE = "title"; });
  /* one line of plain economics under the buy button — and the wallet line
     lives up by the title, where it cannot collide with it */
  g.font = "700 9px Verdana"; g.fillStyle = buyHot ? "#ffd27c" : "#57717f";
  /* THE HONEST STORE. The 1M-PLS ask was blind: no dollar figure, no live
     count, and nowhere did it say the pull is random or that duplicates
     don't stack — callout-thread bait for a crypto audience that has seen
     every trick. Transparent odds are the strongest buy trigger this
     economy has AND the cheapest insurance. */
  g.fillText("1,000,000 PLS" + (window._plsUsd > 0 ? " (≈ $" + (1e6 * window._plsUsd).toFixed(0) + ")" : "")
    + " · 50% burns KJP · 50% burns WICK", 216, H - 70);
  g.font = "700 8px Verdana"; g.fillStyle = "#57717f";
  /* under the buy button, in the clear strip above the canvas edge — the
     first placement sat inside the always-carried gun boxes (audit caught
     two TEXT/TEXT pairs at 8d) */
  g.fillText((window._gearMinted >= 0 ? (100 - window._gearMinted) + " of 100 left · " : "")
    + "random piece from what's left · duplicates don't stack — sell dupes on the market", 216, H - 8);
  fetchPlsUsd(); fetchGearMinted();
  drawWalletPanel();
  dispatchClicks();
}

/* ---------------- WHO AM I ----------------
   The single most confusing thing about a wallet-gated game is not knowing
   which wallet it is currently reading. This says so in full, says whether it
   can sign, and puts SWITCH one tap away. */
function drawWalletPanel(){
  const addr = walletAddr || window.watchAddr || null;
  const watching = !walletAddr && !!window.watchAddr;
  /* compact and high: the right-hand gear callouts begin at y≈136, so this
     panel and its status line must both finish above that line */
  const x = W - 372, y = 10, w2 = 312, h2 = 94;

  g.fillStyle = "rgba(6,11,16,0.86)"; g.fillRect(x, y, w2, h2);
  brackets(x, y, w2, h2, addr ? (watching ? "rgba(143,199,255,0.5)" : "rgba(124,249,165,0.55)") : "rgba(120,140,160,0.35)", 9);

  g.font = "900 9px Arial Black"; g.fillStyle = "#57717f";
  g.fillText(addr ? (watching ? "WATCHING" : "SIGNED IN AS") : "NO WALLET LINKED", x + 12, y + 15);

  /* transient status (switching, errors) outranks the standing caption, and
     lives INSIDE the panel so it can never overlap the gear callouts */
  const busyMsg = walletStatus && /…|error|fail|cancel|changed|locked|no wallet/i.test(walletStatus) ? walletStatus : "";
  if (addr){
    g.fillStyle = watching ? "#8fc7ff" : "#7cf9a5";
    g.beginPath(); g.arc(x + w2 - 18, y + 12, 4, 0, TAU); g.fill();
    g.font = "900 14px monospace"; g.fillStyle = "#e6f1ff";
    g.fillText(addr.slice(0, 12) + "…" + addr.slice(-8), x + 12, y + 35);
    const nG = nftWeaponIds(window.ownedGunTypes || []).length;
    const nM = (window.ownedModTypes || []).length;
    const nK = (window.ownedGearTypes || []).length;
    g.font = "700 10px Verdana"; g.fillStyle = "#9db4cc";
    g.fillText(nG + " gun" + (nG === 1 ? "" : "s") + " · " + nM + " mod" + (nM === 1 ? "" : "s")
      + " · " + nK + "/8 gear" + (hasHolo() ? " · HOLO +1♥" : ""), x + 12, y + 51);
    g.font = "700 9px Verdana";
    g.fillStyle = busyMsg ? (/error|fail|cancel|locked|no wallet/i.test(busyMsg) ? "#ff8f8f" : "#ffd54f")
                          : (watching ? "#8fc7ff" : "#4a6a58");
    g.fillText((busyMsg || (watching ? "view-only — CONNECT to submit scores" : "can sign scores to the world board")).slice(0, 46),
      x + 12, y + 64);
  } else {
    g.font = "700 10px Verdana"; g.fillStyle = "#8a97a8";
    wrapText2("Link a wallet to carry your guns, mods and gear into every op — or WATCH any address.",
      x + 12, y + 33, w2 - 24, 12, "#8a97a8", "700 10px Verdana");
    if (busyMsg){
      g.font = "700 9px Verdana"; g.fillStyle = "#ff8f8f";
      g.fillText(busyMsg.slice(0, 46), x + 12, y + 64);
    }
  }

  /* the three actions, always in the same place */
  const bw = (w2 - 34) / 3, by2 = y + h2 - 28;
  if (addr){
    btn(x + 12, by2, bw, 22, walletBusy ? "…" : "⇄ SWITCH", () => switchWallet(), { fs: 10 });
    btn(x + 17 + bw, by2, bw, 22, "👁 WATCH", () => enterAddress(), { fs: 10 });
    btn(x + 22 + bw * 2, by2, bw, 22, "UNLINK", () => disconnectWallet(), { fs: 10, danger: true });
  } else {
    btn(x + 12, by2, bw * 1.5 + 5, 22, walletBusy ? "…" : "CONNECT", () => connectWallet(), { fs: 10 });
    btn(x + 22 + bw * 1.5, by2, bw * 1.5 - 5, 22, "👁 WATCH", () => enterAddress(), { fs: 10 });
  }
}
