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
  g.fillText("Gear has no slots and no limit — everything you own walks in with you, every op. The only choice here is which two guns you sling.", 60, 78);

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
  g.fillText(owned.length ? owned.length + "/8 GEAR TYPES · ALL ACTIVE" : "NO GEAR — the ops still run without it", CX, CY + 146);
  g.textAlign = "left";

  /* ---- gear callouts, wired to the body ---- */
  const L = [], R = [];
  for (let t = 1; t <= 8; t++) (GEAR_ANCHOR[t].side === "l" ? L : R).push(t);
  const rowY = i => 132 + i * 96;
  const place = (t, i, side) => {
    const d = GEARDEFS[t], a = GEAR_ANCHOR[t];
    const bw = 250, bh = 78;
    const bx = side === "l" ? 60 : W - 60 - bw, by = rowY(i);
    const has = owned.includes(t);
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
    g.strokeStyle = has ? (hot ? "#ffd27c" : "#8a6d2f") : "#232c36"; g.lineWidth = has ? 2 : 1;
    g.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    g.font = "900 8px Arial Black"; g.fillStyle = has ? "#ff9d5b" : "#3d4854";
    g.fillText(a.label, bx + 10, by + 15);
    g.font = "900 12px Arial Black"; g.fillStyle = has ? "#ffd27c" : "#54606e";
    g.fillText((has ? "◆ " : "") + d.name, bx + 10, by + 32);
    wrapText2(d.blurb, bx + 10, by + 47, bw - 20, 11, has ? "#cbd9c9" : "#414e59", "700 9px Verdana");
    g.font = "900 8px Arial Black";
    if (has){ g.fillStyle = "#7cf9a5"; g.fillText("ARMED", bx + bw - 44, by + 15); }
    else {
      g.fillStyle = "#4e5c68"; g.fillText(d.pool + " OF 100", bx + bw - 56, by + 15);
      g.fillStyle = "#57717f"; g.font = "700 8px Verdana";
      g.fillText("not owned — mint at kjp-game.wick.pics/mint", bx + 10, by + bh - 6);
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

  btn(60, H - 62, 150, 40, "▶ INFILTRATE", () => { STATE = "select"; }, { fs: 13 });
  btn(220, H - 62, 130, 40, walletBusy ? "…" : "↻ REFRESH", () => refreshGear(), { fs: 12 });
  btn(360, H - 62, 130, 40, "🔫 ARSENAL", () => { STATE = "arsenal"; }, { fs: 12 });
  btn(W - 190, H - 62, 120, 40, "← BACK", () => { STATE = "title"; });
  g.font = "700 10px Verdana"; g.fillStyle = walletAddr || window.watchAddr ? "#7cf9a5" : "#57717f";
  g.fillText(walletStatus || "no wallet linked", 500, H - 38);
  dispatchClicks();
}
