/* KJP screens — title / select / codec / debrief / skins / arsenal / intel.
   Everything is canvas UI: btn() registers a hit-rect for this frame and
   dispatchClicks() fires on the frame's press. Mouse and touch share the path. */
"use strict";

let UIB = [];
function btn(x, y, w2, h2, label, cb, o){
  o = o || {};
  const hot = MOUSE.x >= x && MOUSE.x <= x + w2 && MOUSE.y >= y && MOUSE.y <= y + h2 && !o.off;
  g.fillStyle = o.off ? "rgba(20,26,34,0.5)" : hot ? (o.danger ? "rgba(120,30,36,0.9)" : "rgba(28,74,48,0.95)") : (o.danger ? "rgba(70,22,28,0.8)" : "rgba(14,34,24,0.85)");
  g.fillRect(x, y, w2, h2);
  g.strokeStyle = o.off ? "#2c3844" : hot ? "#7cf9a5" : (o.danger ? "#c95b64" : "#2f7a4d");
  g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w2 - 2, h2 - 2);
  g.font = "900 " + (o.fs || 15) + "px Arial Black"; g.textAlign = "center";
  g.fillStyle = o.off ? "#54606e" : hot ? "#dfffe9" : "#9fd7b0";
  g.fillText(label, x + w2 / 2, y + h2 / 2 + (o.fs || 15) * 0.36);
  g.textAlign = "left";
  UIB.push({ x, y, w: w2, h: h2, cb, off: o.off });
  return hot;
}
function dispatchClicks(){
  if (!MOUSE.pressed) return;
  for (const b of UIB){
    if (b.off) continue;
    if (MOUSE.x >= b.x && MOUSE.x <= b.x + b.w && MOUSE.y >= b.y && MOUSE.y <= b.y + b.h){ SFX.ui(); b.cb && b.cb(); break; }
  }
}

/* ---------- portraits (procedural, front-facing busts) ---------- */
function bustKJP(x, y, s, skv){
  const sk = skv || skinDef();
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = sk.suit; g.beginPath(); g.moveTo(-46, 60); g.quadraticCurveTo(-40, 18, -14, 12); g.lineTo(14, 12); g.quadraticCurveTo(40, 18, 46, 60); g.closePath(); g.fill();
  g.strokeStyle = sk.trim; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-14, 13); g.lineTo(-4, 34); g.lineTo(-8, 60); g.stroke();
  g.beginPath(); g.moveTo(14, 13); g.lineTo(4, 34); g.lineTo(8, 60); g.stroke();
  g.fillStyle = sk.shirt; g.beginPath(); g.moveTo(-13, 13); g.lineTo(0, 30); g.lineTo(13, 13); g.closePath(); g.fill();
  g.fillStyle = sk.tie; g.beginPath(); g.moveTo(-4, 18); g.lineTo(4, 18); g.lineTo(2, 44); g.lineTo(-2, 44); g.closePath(); g.fill();
  /* head — frog green, hair curtains, shades. LOCKED design DNA. */
  g.fillStyle = "#4db072";
  g.beginPath(); g.ellipse(0, -18, 30, 26, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(0, 0, 24, 16, 0, 0, TAU); g.fill();          // muzzle
  g.fillStyle = "#3d8f5c";
  g.beginPath(); g.ellipse(0, 4, 16, 7, 0, 0, TAU); g.fill();
  g.strokeStyle = "#2c6a44"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-14, 5); g.quadraticCurveTo(0, 11, 14, 5); g.stroke();   // wide frog mouth
  /* hair curtains */
  g.fillStyle = "#0b0d10";
  g.beginPath(); g.moveTo(-30, -34); g.quadraticCurveTo(-38, -6, -26, 12); g.quadraticCurveTo(-22, -8, -16, -30); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(30, -34); g.quadraticCurveTo(38, -6, 26, 12); g.quadraticCurveTo(22, -8, 16, -30); g.closePath(); g.fill();
  g.beginPath(); g.ellipse(0, -36, 30, 12, 0, Math.PI, 0); g.fill();    // top
  /* shades */
  g.fillStyle = "#101418";
  g.fillRect(-24, -26, 20, 11); g.fillRect(4, -26, 20, 11); g.fillRect(-6, -23, 12, 4);
  g.fillStyle = "rgba(140,220,255,0.35)"; g.fillRect(-21, -24, 6, 7); g.fillRect(7, -24, 6, 7);
  g.restore();
}
function bustOp(x, y, s){
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = "#1d2836"; g.beginPath(); g.moveTo(-44, 60); g.quadraticCurveTo(-36, 20, -12, 14); g.lineTo(12, 14); g.quadraticCurveTo(36, 20, 44, 60); g.closePath(); g.fill();
  g.fillStyle = "#d9b28c"; g.beginPath(); g.ellipse(0, -16, 24, 27, 0, 0, TAU); g.fill();
  g.fillStyle = "#2b1f16";
  g.beginPath(); g.ellipse(0, -30, 27, 17, 0, Math.PI, 0); g.fill();
  g.beginPath(); g.rect(-28, -30, 9, 42); g.fill();
  g.beginPath(); g.rect(19, -30, 9, 42); g.fill();
  g.fillStyle = "#11161d"; g.beginPath(); g.arc(-27, -14, 8, 0, TAU); g.fill();
  g.strokeStyle = "#11161d"; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-27, -6); g.quadraticCurveTo(-20, 12, -4, 12); g.stroke();
  g.fillStyle = "#0c0f14"; g.beginPath(); g.arc(-2, 12, 3.4, 0, TAU); g.fill();
  g.fillStyle = "#23303f"; g.fillRect(-9, -20, 7, 4); g.fillRect(2, -20, 7, 4);
  g.fillStyle = "#7cf9a5"; g.fillRect(-8, -19, 5, 2); g.fillRect(3, -19, 5, 2);
  g.strokeStyle = "#5a3a28"; g.lineWidth = 2; g.beginPath(); g.moveTo(-8, 0); g.quadraticCurveTo(0, 4, 8, 0); g.stroke();
  g.restore();
}
function bustRegina(x, y, s){
  g.save(); g.translate(x, y); g.scale(s, s);
  /* teal power suit, gold trim */
  g.fillStyle = "#0f3a3a"; g.beginPath(); g.moveTo(-46, 60); g.quadraticCurveTo(-38, 18, -13, 12); g.lineTo(13, 12); g.quadraticCurveTo(38, 18, 46, 60); g.closePath(); g.fill();
  g.strokeStyle = "#ffd27c"; g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(-13, 13); g.lineTo(-5, 34); g.lineTo(-9, 60); g.stroke();
  g.beginPath(); g.moveTo(13, 13); g.lineTo(5, 34); g.lineTo(9, 60); g.stroke();
  g.fillStyle = "#e8ecf4"; g.beginPath(); g.moveTo(-12, 13); g.lineTo(0, 26); g.lineTo(12, 13); g.closePath(); g.fill();
  /* face */
  g.fillStyle = "#e3c2a2"; g.beginPath(); g.ellipse(0, -16, 23, 26, 0, 0, TAU); g.fill();
  /* silver bob */
  g.fillStyle = "#cfd3da";
  g.beginPath(); g.ellipse(0, -32, 26, 15, 0, Math.PI, 0); g.fill();
  g.beginPath(); g.rect(-27, -32, 10, 40); g.fill();
  g.beginPath(); g.rect(17, -32, 10, 40); g.fill();
  g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.ellipse(-8, -38, 12, 4, -0.2, 0, TAU); g.fill();
  /* gold round glasses, sharp eyes */
  g.strokeStyle = "#ffd27c"; g.lineWidth = 2.6;
  g.beginPath(); g.arc(-9, -18, 8, 0, TAU); g.stroke();
  g.beginPath(); g.arc(9, -18, 8, 0, TAU); g.stroke();
  g.beginPath(); g.moveTo(-1, -18); g.lineTo(1, -18); g.stroke();
  g.fillStyle = "#1d2836"; g.fillRect(-12, -19.4, 6, 2.8); g.fillRect(6, -19.4, 6, 2.8);
  /* smirk + earrings */
  g.strokeStyle = "#a3765a"; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(2, 4, 9, -1); g.stroke();
  g.fillStyle = "#ffd27c";
  g.beginPath(); g.arc(-23, -6, 3, 0, TAU); g.fill();
  g.beginPath(); g.arc(23, -6, 3, 0, TAU); g.fill();
  g.restore();
}
function bustDir(x, y, s){
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = "#14161c"; g.beginPath(); g.moveTo(-46, 60); g.quadraticCurveTo(-38, 18, -13, 12); g.lineTo(13, 12); g.quadraticCurveTo(38, 18, 46, 60); g.closePath(); g.fill();
  g.fillStyle = "#c9cdd6"; g.beginPath(); g.moveTo(-12, 13); g.lineTo(0, 28); g.lineTo(12, 13); g.closePath(); g.fill();
  g.fillStyle = "#5b1f24"; g.beginPath(); g.moveTo(-4, 17); g.lineTo(4, 17); g.lineTo(2, 42); g.lineTo(-2, 42); g.closePath(); g.fill();
  g.fillStyle = "#d9b28c"; g.beginPath(); g.ellipse(0, -16, 23, 26, 0, 0, TAU); g.fill();
  g.fillStyle = "#3a3f4a"; g.beginPath(); g.ellipse(0, -32, 24, 12, 0, Math.PI, 0); g.fill();
  g.fillStyle = "#0a0c10"; g.fillRect(-30, -24, 60, 12);                 // the redaction bar
  g.font = "900 8px Arial Black"; g.fillStyle = "#c94c4c"; g.textAlign = "center";
  g.fillText("REDACTED", 0, -16); g.textAlign = "left";
  g.strokeStyle = "#8a6d55"; g.lineWidth = 2; g.beginPath(); g.moveTo(-7, 2); g.lineTo(7, 2); g.stroke();
  g.restore();
}

/* ---------- title v2: searchlights, film bars, stencil wordmark ---------- */
let titleRain = null;
function drawTitle(){
  UIB = [];
  g.fillStyle = "#04060b"; g.fillRect(0, 0, W, H);
  const now = performance.now();
  /* far skyline */
  for (let i = 0; i < 14; i++){
    const bw = 70 + hash2(i, 3) * 90, bh = 90 + hash2(i, 7) * 220, bx = i * 95 - 20;
    g.fillStyle = "rgba(13,18,26,0.95)"; g.fillRect(bx, H - bh, bw, bh);
    for (let wy = H - bh + 12; wy < H - 16; wy += 22) for (let wx = bx + 8; wx < bx + bw - 10; wx += 18)
      if (hash2(wx, wy) < 0.12){ g.fillStyle = "rgba(255,210,124,0.09)"; g.fillRect(wx, wy, 6, 8); }
  }
  /* searchlight beams off the towers */
  for (let i = 0; i < 2; i++){
    const bx2 = i ? W * 0.68 : W * 0.16, ba = Math.sin(now / (2600 + i * 900) + i * 2) * 0.5 - Math.PI / 2;
    const grd = g.createLinearGradient(bx2, H, bx2 + Math.cos(ba) * 700, H - 700);
    grd.addColorStop(0, "rgba(190,215,255,0.10)"); grd.addColorStop(1, "rgba(190,215,255,0)");
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(bx2, H - 60);
    g.lineTo(bx2 + Math.cos(ba - 0.05) * 900, H - 60 + Math.sin(ba - 0.05) * 900);
    g.lineTo(bx2 + Math.cos(ba + 0.05) * 900, H - 60 + Math.sin(ba + 0.05) * 900);
    g.closePath(); g.fill();
  }
  /* fog band */
  const fg = g.createLinearGradient(0, H - 240, 0, H);
  fg.addColorStop(0, "rgba(10,16,24,0)"); fg.addColorStop(1, "rgba(16,24,34,0.8)");
  g.fillStyle = fg; g.fillRect(0, H - 240, W, 240);
  if (!titleRain){ titleRain = []; for (let i = 0; i < 130; i++) titleRain.push({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random() }); }
  g.strokeStyle = "rgba(150,180,210,0.15)";
  for (const r of titleRain){
    r.y += r.s * 16; r.x -= r.s * 3.4;
    if (r.y > H){ r.y = -12; r.x = Math.random() * (W + 200); }
    g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.x + 4, r.y - 14 * r.s); g.stroke();
  }
  /* bust in a spotlight ring */
  const bgl = g.createRadialGradient(W - 240, H / 2 - 40, 40, W - 240, H / 2 - 40, 230);
  bgl.addColorStop(0, "rgba(124,249,165,0.10)"); bgl.addColorStop(1, "rgba(124,249,165,0)");
  g.fillStyle = bgl; g.beginPath(); g.arc(W - 240, H / 2 - 40, 230, 0, TAU); g.fill();
  const tArt = artFor(["title-kjp", "port-kjp"]);
  if (tArt){
    const tw2 = Math.min(460, tArt.width), th2 = tw2 * tArt.height / tArt.width;
    g.drawImage(tArt, W - 240 - tw2 / 2, H / 2 + 150 - th2, tw2, Math.min(th2, 560));
  } else bustKJP(W - 240, H / 2 - 20, 2.6);
  g.strokeStyle = "rgba(124,249,165,0.22)"; g.lineWidth = 2;
  g.beginPath(); g.arc(W - 240, H / 2 - 40, 196 + Math.sin(now / 900) * 5, 0, TAU); g.stroke();
  g.setLineDash([3, 14]); g.strokeStyle = "rgba(124,249,165,0.3)";
  g.beginPath(); g.arc(W - 240, H / 2 - 40, 216, now / 4000, now / 4000 + TAU); g.stroke(); g.setLineDash([]);
  /* wordmark: PNG logo wins; otherwise shadow slab + glow + stencil cuts */
  g.textAlign = "left";
  const logoArt = artFor(["logo"]);
  const pulse = 0.75 + Math.sin(now / 1400) * 0.25;
  if (logoArt){
    const lw = Math.min(430, logoArt.width), lh = lw * logoArt.height / logoArt.width;
    g.shadowColor = `rgba(124,249,165,${0.3 * pulse})`; g.shadowBlur = 26;
    g.drawImage(logoArt, 70, 70, lw, Math.min(lh, 190));
    g.shadowBlur = 0;
  } else {
    g.font = "900 150px Arial Black";
    g.fillStyle = "rgba(0,0,0,0.6)"; g.fillText("KJP", 76, 226);
    g.shadowColor = `rgba(124,249,165,${0.35 * pulse})`; g.shadowBlur = 30;
    g.fillStyle = "#7cf9a5"; g.fillText("KJP", 70, 220);
    g.shadowBlur = 0;
    g.fillStyle = "#04060b";
    g.fillRect(70, 152, 340, 5); g.fillRect(70, 196, 340, 4);
    g.fillStyle = "#c94c4c"; g.fillRect(74, 238, 330, 8);
    g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(74, 238, 330, 2);
  }
  g.font = "900 25px Arial Black"; g.fillStyle = "#e6f1ff";
  g.fillText("KENNY JOHN PIERRE", 74, 286);
  g.font = "900 19px Arial Black"; g.fillStyle = "#8fa8c4";
  g.fillText("THE BLACK FILE", 74, 314);
  g.font = "700 13px Verdana"; g.fillStyle = "#7c8ba3";
  g.fillText("attorney at law. deniable asset. EXCOMMUNICADO.", 74, 340);
  g.fillText("They planted two kilos in his car and took his licence for it.", 74, 358);
  g.fillStyle = "#ffd27c";
  g.fillText("Break into Langley for REGINA GYATT — recover the lost BITCOIN", 74, 376);
  g.fillText("and the evidence bag they framed him with.", 74, 392);
  /* film bars */
  g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(0, 0, W, 26); g.fillRect(0, H - 26, W, 26);
  g.font = "700 10px monospace"; g.fillStyle = "#3d5a48";
  g.fillText("CLASSIFIED // KJP-ORIGIN // EYES ONLY", 20, 17);
  g.textAlign = "right"; g.fillText("kjp-game.wick.pics", W - 20, 17); g.textAlign = "left";
  /* menu */
  const bx = 74, by = 408, bw = 300, bh = 40, gap = 8;
  btn(bx, by, bw, bh, "▶ INFILTRATE", () => { STATE = "select"; });
  btn(bx, by + (bh + gap), bw / 2 - 5, bh, "🎭 SKINS", () => { STATE = "skins"; }, { fs: 13 });
  btn(bx + bw / 2 + 5, by + (bh + gap), bw / 2 - 5, bh, "🔫 ARSENAL", () => { STATE = "arsenal"; }, { fs: 13 });
  btn(bx, by + 2 * (bh + gap), bw / 2 - 5, bh, "🎖 DOSSIER", () => { STATE = "dossier"; }, { fs: 13 });
  btn(bx + bw / 2 + 5, by + 2 * (bh + gap), bw / 2 - 5, bh, "⚙ OPTIONS", () => { STATE = "options"; }, { fs: 13 });
  btn(bx, by + 3 * (bh + gap), bw / 2 - 5, bh, "🎒 READY ROOM", () => { STATE = "ready"; }, { fs: 12 });
  btn(bx + bw / 2 + 5, by + 3 * (bh + gap), bw / 2 - 5, bh, "📼 INTEL", () => { STATE = "intel"; }, { fs: 13 });
  /* difficulty is a first-class fact on the front page, not a buried setting */
  const d = diff();
  g.font = "900 11px Arial Black"; g.fillStyle = "#ffd27c";
  g.fillText("DIFFICULTY: " + d.name, bx, by + 4 * (bh + gap) + 8);
  g.font = "700 10px Verdana"; g.fillStyle = "#57717f";
  g.fillText("score ×" + d.scoreMul + " · " + d.blurb, bx + 150, by + 4 * (bh + gap) + 8);
  /* wallet line */
  g.font = "700 11px Verdana"; g.fillStyle = walletAddr ? "#7cf9a5" : "#7c8ba3";
  g.fillText(walletStatus || (walletAddr ? "connected" : "wallet: not connected — ARSENAL to link your WICK guns + gear"), bx, by + 4 * (bh + gap) + 26);
  /* board */
  drawTitleBoard();
  g.font = "700 11px Verdana"; g.fillStyle = "#57717f"; g.textAlign = "center";
  drawSiteLinks();
  g.textAlign = "left";
  dispatchClicks();
}
function drawTitleBoard(){
  const x = W - 470, y = 60, w2 = 210;
  g.fillStyle = "rgba(5,10,8,0.7)"; g.fillRect(x, y, w2, 172);
  g.strokeStyle = "rgba(124,249,165,0.25)"; g.strokeRect(x + 0.5, y + 0.5, w2, 172);
  g.font = "900 12px Arial Black"; g.fillStyle = "#7cf9a5";
  g.fillText("GLOBAL OPERATIVES", x + 12, y + 22);
  g.font = "700 11px Verdana";
  if (!lbTop){ g.fillStyle = "#7c8ba3"; g.fillText(lbDown ? "board offline" : "…dialing", x + 12, y + 44); lbFetch(); }
  else if (!lbTop.length){
    /* the distinction that matters: nobody has played, vs the board is DOWN */
    if (lbDown){
      g.fillStyle = "#ff8f8f"; g.font = "900 11px Arial Black";
      g.fillText("⚠ BOARD OFFLINE", x + 12, y + 44);
      g.font = "700 10px Verdana"; g.fillStyle = "#9db4cc";
      wrapText2("Existing scores are SAFE — the store is unreachable, not empty.", x + 12, y + 60, w2 - 24, 12, "#9db4cc", "700 10px Verdana");
    } else { g.fillStyle = "#7c8ba3"; g.fillText("no scores yet — be first", x + 12, y + 44); }
  }
  else lbTop.slice(0, 7).forEach((e2, i) => {
    g.fillStyle = i === 0 ? "#ffd27c" : "#9db4cc";
    const nm = (e2.name && e2.name.trim()) ? e2.name : (e2.a || "").slice(0, 6) + "…" + (e2.a || "").slice(-4);
    g.fillText((i + 1) + ". " + nm, x + 12, y + 44 + i * 18);
    g.textAlign = "right"; g.fillText(e2.score.toLocaleString(), x + w2 - 10, y + 44 + i * 18); g.textAlign = "left";
  });
  if (lbNote){
    g.font = "700 9px Verdana"; g.fillStyle = lbDown ? "#ff8f8f" : "#4a6a58";
    g.fillText(lbNote, x + 12, y + 162);
  }
}

/* ---------- the site link bar ----------
   These used to be a single dead line of text naming other sites you had no
   way to reach. Same row, now real hit targets, on every menu screen. */
const SITE_LINKS = [
  { label: "🎒 GEAR MINT", url: "/mint" },
  { label: "🔫 GUNS + MODS", url: "https://mint.wick.pics" },
  { label: "🕹 ARCADE", url: "https://games.wick.pics" },
  { label: "🐸 PEPE WICK", url: "https://games.wick.pics/play/" }
];
function drawSiteLinks(){
  const h2 = 22, y = H - h2 - 8;
  let x = 70;
  g.font = "900 10px Arial Black";
  for (const L of SITE_LINKS){
    /* measureText under-reports emoji in Arial Black, so the label spills out
       of its own chip — pay for the glyph explicitly */
    const emoji = /[^\x00-\x7F]/.test(L.label) ? 14 : 0;
    const w2 = g.measureText(L.label).width + 26 + emoji;
    const hot = MOUSE.x >= x && MOUSE.x <= x + w2 && MOUSE.y >= y && MOUSE.y <= y + h2;
    g.fillStyle = hot ? "rgba(28,74,48,0.95)" : "rgba(12,20,26,0.9)";
    g.fillRect(x, y, w2, h2);
    /* bright enough to read as separate buttons — at #243040 the four chips
       merged into one continuous strip */
    g.strokeStyle = hot ? "#7cf9a5" : "#33506a"; g.lineWidth = 1.5;
    g.strokeRect(x + 0.75, y + 0.75, w2 - 1.5, h2 - 1.5);
    g.fillStyle = hot ? "#dfffe9" : "#6d8494";
    g.fillText(L.label, x + 13, y + 15);
    UIB.push({ x, y, w: w2, h: h2, cb: () => openShop(L.url) });
    x += w2 + 8;
  }
  /* right-aligned, not trailing the chips: emoji under-report in measureText,
     so a label can overflow its own chip and collide with whatever follows */
  g.font = "700 9px Verdana"; g.fillStyle = "#3d4854"; g.textAlign = "right";
  g.fillText("$WICK universe · see you in the courtroom", W - 70, y + 15);
  g.textAlign = "left";
}

/* ---------- mission select ---------- */
function drawSelect(){
  UIB = [];
  g.fillStyle = "#05070c"; g.fillRect(0, 0, W, H);
  g.font = "900 34px Arial Black"; g.fillStyle = "#e6f1ff";
  g.fillText("SELECT OPERATION", 70, 78);
  g.font = "700 12px Verdana"; g.fillStyle = "#7c8ba3";
  g.fillText("clear a mission to open the next · GHOST = never spotted, no alarms · campaign score = sum of best runs", 70, 100);
  const cw = 356, ch = 190, gx = 70, gy = 130, gapx = 32, gapy = 26;
  for (let i = 1; i <= 6; i++){
    const col = (i - 1) % 3, row = (i - 1) / 3 | 0;
    const x = gx + col * (cw + gapx), y = gy + row * (ch + gapy);
    const open = i === 1 || !!PROG.lv[i - 1];
    const best = PROG.lv[i];
    const hot = MOUSE.x >= x && MOUSE.x <= x + cw && MOUSE.y >= y && MOUSE.y <= y + ch && open;
    g.fillStyle = open ? (hot ? "rgba(20,44,32,0.95)" : "rgba(10,20,16,0.9)") : "rgba(12,14,18,0.85)";
    g.fillRect(x, y, cw, ch);
    g.strokeStyle = open ? (hot ? "#7cf9a5" : "#2f7a4d") : "#232a33"; g.lineWidth = 2;
    g.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
    g.font = "900 15px Arial Black"; g.fillStyle = open ? "#7cf9a5" : "#404b58";
    g.fillText("OP " + i, x + 18, y + 32);
    g.font = "900 21px Arial Black"; g.fillStyle = open ? "#e6f1ff" : "#404b58";
    g.fillText(LEVELS[i].name, x + 18, y + 60);
    g.font = "700 11px Verdana"; g.fillStyle = open ? "#7c8ba3" : "#333c47";
    g.fillText(LEVELS[i].sub, x + 18, y + 80);
    if (!open){
      g.font = "900 15px Arial Black"; g.fillStyle = "#404b58";
      g.fillText("🔒 CLEAR OP " + (i - 1), x + 18, y + 126);
    } else if (best){
      stampRank(x + cw - 84, y + 112, rankFor(best), 0.62, -0.12);
      g.font = "700 12px Verdana"; g.fillStyle = "#9db4cc";
      g.fillText("best " + best.score.toLocaleString() + " pts", x + 18, y + 118);
      g.fillText(fmtTime(best.time) + " · intel " + best.intel + "/" + (best.intelMax || "?"), x + 18, y + 136);
      /* ribbon strip — what's still unclaimed in a level you "finished" */
      ribbonsFor(i).forEach((rb, k) => {
        const rx = x + 18 + k * 22, ry = y + 152;
        g.fillStyle = rb.done ? "#ffd27c" : "rgba(120,140,160,0.22)";
        g.fillRect(rx, ry, 16, 5);
        if (rb.done){ g.fillStyle = "rgba(255,255,255,0.35)"; g.fillRect(rx, ry, 16, 2); }
      });
      g.font = "700 9px Verdana"; g.fillStyle = "#57717f";
      const got = ribbonsFor(i).filter(r => r.done).length;
      g.fillText(got + "/" + CHALLENGES.length + " ribbons", x + 18 + CHALLENGES.length * 22 + 8, y + 157);
    } else {
      g.font = "700 12px Verdana"; g.fillStyle = "#9db4cc";
      g.fillText("no clear yet", x + 18, y + 126);
    }
    if (open) UIB.push({ x, y, w: cw, h: ch, cb: () => startBrief(i) });
  }
  g.font = "900 15px Arial Black"; g.fillStyle = "#ffd27c";
  g.fillText("CAMPAIGN " + campaignScore().toLocaleString() + " pts", 70, H - 66);
  if (walletAddr) btn(300, H - 88, 240, 34, "📡 SUBMIT TO BOARD", () => submitScore(), { fs: 12 });
  else { g.font = "700 11px Verdana"; g.fillStyle = "#57717f"; g.fillText("connect in ARSENAL to submit scores (holders only)", 300, H - 68); }
  btn(W - 190, H - 88, 120, 40, "← BACK", () => { STATE = "title"; });
  drawSiteLinks();
  dispatchClicks();
}
function fmtTime(t){ const m = t / 60 | 0, s = t % 60 | 0; return m + ":" + String(s).padStart(2, "0"); }
function stampRank(x, y, rank, s, rot){
  g.save(); g.translate(x, y); g.rotate(rot || -0.14); g.scale(s, s);
  const col = rank === "BABA YAGA" ? "#ffd27c" : rank === "GHOST" ? "#7cf9a5" : rank === "SPECTRE" ? "#8fc7ff" : rank === "RAMBO" ? "#ff8f8f" : "#c9cdd6";
  g.strokeStyle = col; g.lineWidth = 4; g.globalAlpha = 0.92;
  g.strokeRect(-96, -26, 192, 52);
  g.font = "900 26px Arial Black"; g.textAlign = "center"; g.fillStyle = col;
  g.fillText(rank, 0, 9); g.textAlign = "left";
  g.globalAlpha = 1; g.restore();
}

/* ---------- codec briefing ---------- */
let BR = null;
function startBrief(n){
  BR = { n, lines: LEVELS[n].brief, i: 0, chars: 0, done: false, outro: false };
  STATE = "brief"; SFX.codec();
}
function startOutro(){
  BR = { n: 0, lines: OUTRO, i: 0, chars: 0, done: false, outro: true };
  STATE = "brief"; SFX.codec();
}
function drawBrief(dt){
  UIB = [];
  g.fillStyle = "#04060a"; g.fillRect(0, 0, W, H);
  /* codec frequency deco */
  g.font = "700 12px monospace"; g.fillStyle = "#2f5a3f";
  g.fillText("FREQ 141.80 — SWITCHBOARD (ENCRYPTED)", 80, 60);
  for (let i = 0; i < 40; i++){
    const h2 = 6 + Math.abs(Math.sin(i * 1.3 + performance.now() / 180)) * 26;
    g.fillStyle = "rgba(124,249,165,0.25)";
    g.fillRect(W / 2 - 240 + i * 12, 120 - h2 / 2, 6, h2);
  }
  const ln = BR.lines[BR.i];
  const who = ln.w;
  /* right box shows whoever KJP is actually talking to — the last non-KJP voice */
  let rightWho = "op";
  for (let k = BR.i; k >= 0; k--) if (BR.lines[k].w !== "kjp"){ rightWho = BR.lines[k].w; break; }
  if (who !== "kjp") rightWho = who;
  portBox(140, 240, who === "kjp");
  portBox(W - 340, 240, who !== "kjp");
  const pk = artFor(["port-kjp"]);
  if (pk){ g.save(); g.beginPath(); g.rect(142, 242, 196, 206); g.clip(); g.drawImage(pk, 142, 242, 196, 206); g.restore(); }
  else bustKJP(240, 350, 1.5);
  const po = artFor(["port-" + rightWho]);
  if (po){ g.save(); g.beginPath(); g.rect(W - 338, 242, 196, 206); g.clip(); g.drawImage(po, W - 338, 242, 196, 206); g.restore(); }
  else if (rightWho === "dir") bustDir(W - 240, 350, 1.5);
  else if (rightWho === "rg") bustRegina(W - 240, 350, 1.5);
  else bustOp(W - 240, 350, 1.5);
  g.font = "900 13px Arial Black"; g.textAlign = "center";
  g.fillStyle = CAST.kjp.col; g.fillText(CAST.kjp.name, 240, 470);
  g.fillStyle = CAST[rightWho].col; g.fillText(CAST[rightWho].name, W - 240, 470);
  g.textAlign = "left";
  /* text window */
  g.fillStyle = "rgba(8,16,12,0.9)"; g.fillRect(120, 500, W - 240, 130);
  g.strokeStyle = "rgba(124,249,165,0.3)"; g.strokeRect(120.5, 500.5, W - 240, 130);
  /* Typewriter at a readable-but-brisk clip. It used to run at 60 c/s, which
     made a five-line briefing a twelve-second wall before the game started. */
  BR.chars += dt * 130;
  const txt = ln.t.slice(0, BR.chars | 0);
  if ((BR.chars | 0) < ln.t.length && (BR.chars | 0) % 3 === 0) SFX.type();
  g.font = "700 15px Verdana"; g.fillStyle = CAST[who].col;
  g.fillText(CAST[who].name + ":", 144, 530);
  wrapText2(txt, 144, 554, W - 300, 20, "#dfe9e2", "700 14px Verdana");
  if ((BR.chars | 0) >= ln.t.length){
    if (Math.sin(performance.now() / 300) > 0){ g.fillStyle = "#7cf9a5"; g.font = "900 14px Arial Black"; g.fillText("▼", W - 160, 618); }
  }
  g.font = "700 11px Verdana"; g.fillStyle = "#57717f";
  g.fillText("click anywhere / ENTER — next · ESC — straight into the op", 120, 660);
  /* line counter: how much briefing is left, so it never feels open-ended */
  for (let i = 0; i < BR.lines.length; i++){
    g.fillStyle = i < BR.i ? "#2f7a4d" : i === BR.i ? "#7cf9a5" : "rgba(120,140,160,0.25)";
    g.fillRect(120 + i * 14, 668, 10, 3);
  }
  if (!BR.outro){
    g.font = "900 22px Arial Black"; g.fillStyle = "#e6f1ff";
    g.fillText("OP " + BR.n + " — " + LEVELS[BR.n].name, 120, 200);
    g.font = "700 12px Verdana"; g.fillStyle = "#7c8ba3"; g.fillText(LEVELS[BR.n].sub, 120, 220);
  } else {
    g.font = "900 22px Arial Black"; g.fillStyle = "#ffd27c";
    g.fillText("EXFIL COMPLETE", 120, 200);
  }
  const advance = () => {
    if ((BR.chars | 0) < ln.t.length){ BR.chars = ln.t.length; return; }
    BR.i++; BR.chars = 0; SFX.codec();
    if (BR.i >= BR.lines.length) skipAll();
  };
  const skipAll = () => {
    if (BR.outro){ STATE = "credits"; CRED = { t: 0 }; }
    else startLevel(BR.n);
  };
  /* A VISIBLE way out. ESC works, but touch has no ESC and nobody reads the
     hint line on a briefing they have already seen four times. */
  const nextHot = btn(W - 340, 648, 100, 34, "NEXT ▸", advance, { fs: 12 });
  const skipHot = btn(W - 228, 648, 148, 34, BR.outro ? "SKIP ▸" : "SKIP BRIEFING ▸", skipAll, { fs: 11 });
  dispatchClicks();
  /* clicking anywhere ELSE still advances — but a click on a button must not
     do both, or SKIP would also eat the first line of the next screen */
  if (MOUSE.pressed && !nextHot && !skipHot) advance();
  if (PRESS.has("Enter") || PRESS.has("Space")) advance();
  if (PRESS.has("Escape")) skipAll();
}
function portBox(x, y, active){
  g.strokeStyle = active ? "#7cf9a5" : "#233"; g.lineWidth = active ? 3 : 2;
  g.strokeRect(x, y, 200, 210);
  g.fillStyle = "rgba(10,18,14," + (active ? 0.35 : 0.6) + ")"; g.fillRect(x, y, 200, 210);
  if (!active){ g.fillStyle = "rgba(4,8,6,0.45)"; g.fillRect(x, y, 200, 210); }
}
/* returns the number of lines drawn, so callers can lay out with real heights
   instead of assuming two — a three-line row in a fixed 30px slot silently
   walks into whatever is below it */
function wrapText2(txt, x, y, maxW, lh, col, font){
  g.font = font; g.fillStyle = col;
  const words = txt.split(" ");
  let line = "", yy = y, n = 1;
  for (const wd of words){
    if (g.measureText(line + wd).width > maxW){ g.fillText(line, x, yy); yy += lh; n++; line = wd + " "; }
    else line += wd + " ";
  }
  g.fillText(line, x, yy);
  return n;
}

/* ---------- debrief / dead ---------- */
let DB = null, DB_deadLine = null;
function computeResult(){
  const s = LV.stats;
  const ghost = !(s.spotted > 0) && s.alarms === 0;
  const pacifist = s.kills === 0 && s.civHurt === 0;
  const timeBonus = Math.max(0, Math.round(SC.timeMax * (1 - LV.time / (LV.def.par * 2))));
  const gold = hasGear(8);                                    // GOLD BRIEFCASE
  let score = SC.clear + timeBonus + s.intel * SC.intel * (gold ? 2 : 1)
            + s.alarms * SC.alarm + s.kills * SC.kill + s.civHurt * SC.civilian;
  if (ghost) score += SC.ghost;
  if (pacifist) score += SC.pacifist;
  score = Math.max(500, score);
  if (gold) score = Math.round(score * 1.25);
  score = Math.round(score * diff().scoreMul);                // the board pays for pressure
  score = Math.min(score, SC.opMax);                          // never outgrow the board's ceiling
  const res = { score, time: LV.time, ghost, pacifist, combat: s.combats > 0, kills: s.kills, kos: s.kos,
                intel: s.intel, intelMax: LV.picks.filter(q => q.k === "intel").length,
                alarms: s.alarms, diff: OPT.diff };
  res.rank = rankFor(res);
  /* medal is purely the clock, so it is judged separately from rank — the best
     medal is always re-derived from the best TIME kept in PROG, not stored */
  const med = medalFor(LV.time, LV.def.par);
  res.medal = med ? med.k : null;
  return res;
}
function finishLevel(){
  const r = computeResult();
  /* Snapshot the previous best time BEFORE anything below mutates PROG —
     the debrief compares against it, and by the time it draws, PROG already
     holds this run. Read it late and "NEW BEST" can never fire. */
  const prevBest = (PROG.lv[LV.n] && PROG.lv[LV.n].time) || 0;
  const old = PROG.lv[LV.n];
  if (!old || r.score > old.score) PROG.lv[LV.n] = r;
  else { /* keep the best score, but a ribbon earned is a ribbon KEPT — an
            S-rank run should never erase the pacifist badge from a slower one */
    if (r.ghost) old.ghost = true;
    if (r.pacifist) old.pacifist = true;
    if (r.alarms === 0) old.alarms = 0;
    if (r.time < (old.time || 1e9)) old.time = r.time;
    old.intelMax = r.intelMax;
    if (r.intel > (old.intel || 0)) old.intel = r.intel;
  }
  /* lifetime career tallies for the DOSSIER */
  const c = PROG.career = PROG.career || {};
  c.runs = (c.runs || 0) + 1; c.kos = (c.kos || 0) + r.kos; c.kills = (c.kills || 0) + r.kills;
  c.intel = (c.intel || 0) + r.intel; c.alarms = (c.alarms || 0) + r.alarms;
  c.time = (c.time || 0) + r.time;
  saveProg();
  DB = { n: LV.n, r, t: 0, stampT: 0, prevBest };
  STATE = "debrief"; musicWant("calm");
}
function drawDebrief(dt){
  UIB = []; DB.t += dt;
  g.fillStyle = "#05070c"; g.fillRect(0, 0, W, H);
  g.font = "900 40px Arial Black"; g.fillStyle = "#7cf9a5";
  g.fillText("MISSION COMPLETE", 90, 110);
  g.font = "900 17px Arial Black"; g.fillStyle = "#9db4cc";
  g.fillText("OP " + DB.n + " — " + LEVELS[DB.n].name, 90, 142);
  const r = DB.r, rows = [
    ["TIME", fmtTime(r.time) + "   par " + fmtTime(LEVELS[DB.n].par)],
    ["SPOTTED", (LV.stats.spotted || 0) + "×"],
    ["ALARMS", r.alarms + "×"],
    ["SLEEPERS / KOs", r.kos + ""],
    ["KILLS", r.kills + (r.kills ? "  (-" + r.kills * -SC.kill + ")" : "")],
    ["INTEL", r.intel + " exhibits"],
  ];
  const shown = Math.min(rows.length, Math.floor(DB.t * 4));
  g.font = "700 15px Verdana";
  for (let i = 0; i < shown; i++){
    g.fillStyle = "#7c8ba3"; g.fillText(rows[i][0], 90, 200 + i * 34);
    g.fillStyle = "#e6f1ff"; g.fillText(rows[i][1], 330, 200 + i * 34);
  }
  if (shown >= rows.length){
    if (r.ghost){ g.fillStyle = "#7cf9a5"; g.fillText("👻 GHOST — they never knew", 90, 200 + rows.length * 34); }
    if (r.pacifist){ g.fillStyle = "#8fc7ff"; g.fillText("🕊 PACIFIST — everyone wakes up tomorrow", 90, 226 + rows.length * 34); }
    /* medal + the gap to your own best on this floor — the reason to run it again */
    const med = MEDALS.find(m => m.k === r.medal);
    if (med){
      g.fillStyle = med.col;
      g.fillText("🏅 " + med.name + " — inside " + (med.mul === 1 ? "par" : Math.round(med.mul * 100) + "% of par"), 90, 252 + rows.length * 34);
    }
    const prev = DB.prevBest || 0;
    if (prev > 0 && Math.abs(prev - r.time) > 0.05){
      const d = r.time - prev;
      g.font = "700 13px Verdana"; g.fillStyle = d < 0 ? "#7cf9a5" : "#57717f";
      g.fillText(d < 0 ? "NEW BEST — " + fmtSplit(Math.abs(d)) + " faster than your last"
                       : "your best is still " + fmtSplit(Math.abs(d)) + " faster", 90, 276 + rows.length * 34);
      g.font = "700 15px Verdana";
    }
    g.font = "900 34px Arial Black"; g.fillStyle = "#ffd27c";
    g.fillText(r.score.toLocaleString() + " pts", 90, 330 + rows.length * 34);
    /* stamp slam */
    DB.stampT = Math.min(1, DB.stampT + dt * 3);
    if (DB.stampT > 0.05){
      const sc2 = 2.4 - DB.stampT * 1.4;
      if (DB.stampT >= 1 && !DB.thumped){ DB.thumped = true; SFX.stamp(); shake(4); }
      stampRank(W - 320, 250, r.rank, sc2, -0.18);
    }
    const nxt = DB.n < 6;
    if (nxt) btn(90, H - 120, 280, 52, "▶ NEXT: " + LEVELS[DB.n + 1].name, () => startBrief(DB.n + 1));
    else btn(90, H - 120, 280, 52, "▶ THE VERDICT", () => startOutro());
    btn(390, H - 120, 170, 52, "↻ REPLAY", () => startBrief(DB.n));
    btn(580, H - 120, 170, 52, "☰ MENU", () => { STATE = "select"; });
    if (walletAddr) btn(770, H - 120, 260, 52, lbMsg || "📡 SUBMIT CAMPAIGN", () => submitScore(), { fs: 12 });
    btn(1046, H - 120, 174, 52, "🖼 CARD", () => shareCard(r, DB.n), { fs: 12 });
  }
  g.font = "700 11px Verdana"; g.fillStyle = "#57717f";
  g.fillText("campaign total " + campaignScore().toLocaleString() + " pts", 90, H - 40);
  dispatchClicks();
}
/* Death lines rotate so the screen keeps its teeth on the twentieth attempt.
   Picked once per death (deadLine), not per frame. */
const DEATH_LINES = [
  ["Kenny John Pierre was taken into custody.",              "“COURT IS ADJOURNED.”"],
  ["The Agency filed the report before the body was cold.",  "“MISTRIAL.”"],
  ["Cause of death: nine thousand paid posts and one bullet.","“THEY'LL SAY YOU RESISTED.”"],
  ["Your licence, your name, and now the rest of it.",       "“DISBARRED — POSTHUMOUSLY.”"],
  ["Evidence bag 88-A remains in Agency custody.",           "“THE RECORD IS SEALED.”"],
  ["No obituary. They don't run those for assets.",          "“NO SUCH LAWYER.”"],
  ["Two kilos in the car. One counselor in the ground.",     "“CASE CLOSED.” — THEY WISH."],
  ["Billable hours: terminated.",                            "“OBJECTION. OVERRULED. PERMANENTLY.”"]
];
function drawDead(){
  UIB = [];
  if (DB_deadLine == null) DB_deadLine = Math.floor(Math.random() * DEATH_LINES.length);
  const [sub, quote] = DEATH_LINES[DB_deadLine];
  g.fillStyle = "rgba(20,3,6,0.94)"; g.fillRect(0, 0, W, H);
  g.font = "900 54px Arial Black"; g.textAlign = "center";
  g.fillStyle = "#ff5b5b"; g.fillText("MISSION FAILED", W / 2, H / 2 - 70);
  g.font = "700 16px Verdana"; g.fillStyle = "#c9cdd6";
  g.fillText(sub, W / 2, H / 2 - 26);
  g.font = "900 20px Arial Black"; g.fillStyle = "#e6f1ff";
  g.fillText(quote, W / 2, H / 2 + 14);
  g.font = "700 11px Verdana"; g.fillStyle = "#7c8ba3";
  g.fillText("★".repeat(LV && LV.heat ? LV.heat : 0) + (LV && LV.heat ? "  they were at " + HEAT_NAMES[LV.heat] : ""), W / 2, H / 2 + 40);
  g.textAlign = "left";
  btn(W / 2 - 230, H / 2 + 60, 220, 50, "↻ RETRY OP", () => startLevel(LV.n));
  btn(W / 2 + 10, H / 2 + 60, 220, 50, "☰ MENU", () => { STATE = "select"; });
  dispatchClicks();
}

/* ---------- credits ---------- */
let CRED = null;
function drawCredits(dt){
  UIB = []; CRED.t += dt;
  g.fillStyle = "#04060a"; g.fillRect(0, 0, W, H);
  const lines = [
    ["KJP — THE BLACK FILE", "#7cf9a5", 30],
    ["", "", 14],
    ["starring", "#57717f", 12],
    ["KENNY JOHN PIERRE as himself", "#e6f1ff", 16],
    ["SWITCHBOARD — the voice with the plan", "#8fc7ff", 14],
    ["THE DIRECTOR — [REDACTED]", "#ff8f8f", 14],
    ["and REGINA GYATT — officially dead, actually flying", "#ffd27c", 15],
    ["1,000,000 BTC did not survive the making of this game", "#57717f", 11],
    ["", "", 14],
    ["a $WICK universe production", "#9db4cc", 14],
    ["games.wick.pics · mint.wick.pics · wick.pics", "#57717f", 12],
    ["", "", 14],
    ["no analysts were (permanently) harmed", "#57717f", 11],
    ["", "", 20],
    ["SEE YOU IN THE COURTROOM.", "#ffd27c", 24],
  ];
  let y = H - (CRED.t * 40) + 100;
  g.textAlign = "center";
  for (const [t, c, fs] of lines){
    if (t){ g.font = "900 " + fs + "px " + (fs > 20 ? "Arial Black" : "Verdana"); g.fillStyle = c; g.fillText(t, W / 2, y); }
    y += fs * 2;
  }
  g.textAlign = "left";
  bustKJP(W / 2, y + 120, 2);
  if (y + 40 < H / 2 || MOUSE.pressed || PRESS.has("Escape")){
    STATE = "title";
  }
}

/* ---------- SKINS (the skin component's face) ---------- */
function drawSkins(){
  UIB = [];
  g.fillStyle = "#05070c"; g.fillRect(0, 0, W, H);
  g.font = "900 34px Arial Black"; g.fillStyle = "#e6f1ff"; g.fillText("SKINS", 70, 78);
  g.font = "700 12px Verdana"; g.fillStyle = "#7c8ba3";
  g.fillText("procedural drip with real perks · fists stay green in every suit — house rule", 70, 100);
  const keys = Object.keys(SKINS);
  const cw = 272, ch = 236, gx = 70, gy = 128, gapx = 22, gapy = 20;
  keys.forEach((id, i) => {
    const sk = SKINS[id], col = i % 4, row = i / 4 | 0;
    const x = gx + col * (cw + gapx), y = gy + row * (ch + gapy);
    const un = sk.unlocked(), eq = PROG.skin === id;
    g.fillStyle = un ? "rgba(10,20,16,0.92)" : "rgba(10,12,16,0.9)"; g.fillRect(x, y, cw, ch);
    g.strokeStyle = eq ? "#ffd27c" : un ? "#2f7a4d" : "#232a33"; g.lineWidth = eq ? 3 : 2;
    g.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
    /* preview bust with THIS skin (PNG card wins) */
    g.save(); g.beginPath(); g.rect(x + 6, y + 6, cw - 12, 120); g.clip();
    if (!un){ g.globalAlpha = 0.35; }
    const skArt = artFor(["skin-" + id]);
    if (skArt) g.drawImage(skArt, x + cw / 2 - 60, y + 8, 120, 120);
    else bustKJP(x + cw / 2, y + 86, 1.05, sk);
    g.globalAlpha = 1; g.restore();
    if (sk.shimmer && un){
      g.fillStyle = `hsla(${(performance.now() / 12) % 360},90%,60%,0.10)`;
      g.fillRect(x + 6, y + 6, cw - 12, 120);
    }
    g.font = "900 15px Arial Black"; g.fillStyle = un ? "#e6f1ff" : "#54606e";
    g.fillText(sk.name, x + 16, y + 150);
    g.font = "700 11px Verdana"; g.fillStyle = un ? "#9fd7b0" : "#54606e";
    g.fillText("perk: " + sk.perk, x + 16, y + 170);
    g.fillStyle = un ? "#7c8ba3" : "#c9884c";
    g.fillText(un ? "unlocked" : "🔒 " + sk.how, x + 16, y + 190);
    if (eq){ g.font = "900 12px Arial Black"; g.fillStyle = "#ffd27c"; g.fillText("★ EQUIPPED", x + 16, y + 214); }
    else if (un) UIB.push({ x, y, w: cw, h: ch, cb: () => { PROG.skin = id; saveProg(); SFX.unlock(); } });
  });
  btn(W - 190, H - 78, 120, 40, "← BACK", () => { STATE = "title"; });
  drawSiteLinks();
  dispatchClicks();
}

/* ---------- ARSENAL (the weapon component's face) ---------- */
function drawArsenal(){
  UIB = [];
  g.fillStyle = "#05070c"; g.fillRect(0, 0, W, H);
  g.font = "900 34px Arial Black"; g.fillStyle = "#e6f1ff"; g.fillText("ARSENAL", 70, 78);
  g.font = "700 12px Verdana"; g.fillStyle = "#7c8ba3";
  g.fillText("HANDS + HUSH-9 tranq are always on you. WICK ARSENAL guns hit harder but ship LOUD — pick TWO to carry.", 70, 100);
  /* wallet box */
  const wx = W - 400, wy = 130;
  g.fillStyle = "rgba(8,14,12,0.9)"; g.fillRect(wx, wy, 330, 210);
  g.strokeStyle = "rgba(124,249,165,0.3)"; g.strokeRect(wx + 0.5, wy + 0.5, 330, 210);
  g.font = "900 14px Arial Black"; g.fillStyle = "#7cf9a5"; g.fillText("WALLET", wx + 18, wy + 30);
  g.font = "700 11px Verdana"; g.fillStyle = "#9db4cc";
  wrapText2(walletStatus || "link your PulseChain wallet to load WICK ARSENAL guns.", wx + 18, wy + 52, 294, 15, "#9db4cc", "700 11px Verdana");
  /* the connected address, spelled out — not just a status sentence */
  const shown = walletAddr || window.watchAddr;
  if (shown){
    g.font = "900 12px monospace"; g.fillStyle = walletAddr ? "#7cf9a5" : "#8fc7ff";
    g.fillText(shown.slice(0, 10) + "…" + shown.slice(-6), wx + 18, wy + 84);
    g.font = "700 9px Verdana"; g.fillStyle = "#57717f";
    g.textAlign = "right"; g.fillText(walletAddr ? "can sign" : "view-only", wx + 312, wy + 84); g.textAlign = "left";
  }
  btn(wx + 18, wy + 92, 140, 40, walletBusy ? "…" : (shown ? "⇄ SWITCH" : "CONNECT"),
      () => shown ? switchWallet() : connectWallet(), { fs: 13 });
  btn(wx + 172, wy + 92, 140, 40, "👁 WATCH", () => enterAddress(), { fs: 13 });
  if (walletAddr || watchMode) btn(wx + 18, wy + 142, 140, 34, "UNLINK", () => { disconnectWallet(); }, { fs: 11, danger: true });
  btn(wx + 172, wy + 142, 140, 34, "NAME: " + (playerName || "—"), () => setPlayerName(), { fs: 10 });
  g.font = "700 10px Verdana"; g.fillStyle = "#57717f";
  g.fillText("no guns? mint at mint.wick.pics — holo 1/1 = +1 ♥ here", wx + 18, wy + 198);
  /* owned guns list */
  const owned = nftWeaponIds(window.ownedGunTypes || []);
  const carry = (PROG.carry || []).filter(id => owned.includes(id));
  let y = 140;
  g.font = "900 14px Arial Black"; g.fillStyle = "#9fd7b0"; g.fillText("PERMANENT", 70, y); y += 14;
  y = gunRow("fists", y, false, null);
  y = gunRow("tranq", y, false, null);
  y += 10;
  g.font = "900 14px Arial Black"; g.fillStyle = "#ffd27c";
  g.fillText("NFT LOADOUT — carry " + carry.length + "/2", 70, y + 14); y += 28;
  if (!owned.length){
    g.font = "700 12px Verdana"; g.fillStyle = "#7c8ba3";
    g.fillText(walletAddr || watchMode ? "no WICK ARSENAL guns at this address." : "connect or watch a wallet to see your guns here.", 70, y + 16);
    y += 40;
  }
  for (const id of owned){
    const inCarry = carry.includes(id);
    y = gunRow(id, y, true, () => {
      let c = (PROG.carry || []).filter(q => owned.includes(q));
      if (inCarry) c = c.filter(q => q !== id);
      else { c.push(id); if (c.length > 2) c.shift(); }
      PROG.carry = c; saveProg(); SFX.ui2();
    }, inCarry);
  }
  if (hasHolo()){
    g.font = "700 12px Verdana"; g.fillStyle = "#ffd27c";
    g.fillText("✨ HOLO HOLDER — +1 ♥ on every op, HOLO OPERATIVE skin unlocked", 70, y + 18);
    y += 26;
  }
  /* WICK MODS — attachments auto-fit every carried gun */
  const modsOwned = window.ownedModTypes || [];
  y += 16;
  g.font = "900 14px Arial Black"; g.fillStyle = "#9fd7b0";
  g.fillText("WICK MODS — auto-fitted to carried guns", 70, y); y += 10;
  if (!modsOwned.length){
    g.font = "700 11px Verdana"; g.fillStyle = "#57717f";
    g.fillText("no attachments at this address — free-mint 3 per gun at mint.wick.pics", 70, y + 16);
    y += 8;
  } else {
    let mx0 = 70;
    for (const m of modsOwned){
      const def = MODDEFS[m]; if (!def) continue;
      g.font = "900 11px Arial Black";
      const tw2 = g.measureText(def.name).width + 18;
      g.fillStyle = "rgba(255,210,124,0.12)"; g.fillRect(mx0, y + 6, tw2, 24);
      g.strokeStyle = "rgba(255,210,124,0.45)"; g.strokeRect(mx0 + 0.5, y + 6.5, tw2 - 1, 23);
      g.fillStyle = "#ffd27c"; g.fillText(def.name, mx0 + 9, y + 22);
      mx0 += tw2 + 8;
      if (mx0 > 600){ mx0 = 70; y += 30; }
    }
  }
  /* ---- KJP GEAR: the 100-piece cross-game mint. Right column, under the
     wallet box — the gun list owns the left and can grow. ---- */
  const gearOwned = window.ownedGearTypes || [];
  let gy = wy + 232;
  g.font = "900 13px Arial Black"; g.fillStyle = "#ff9d5b";
  g.fillText("KJP GEAR · 100 PIECES", wx, gy);
  /* NO SLOTS, NO LIMIT — say it out loud. Everything owned is always live,
     so there is no equip step to miss and nothing to choose between. */
  if (gearOwned.length){
    g.font = "900 10px Arial Black"; g.fillStyle = "#7cf9a5";
    g.fillText("✓ ALL " + gearOwned.length + " EQUIPPED — no slots, no limit", wx, gy + 15);
    g.font = "700 9px Verdana"; g.fillStyle = "#8a97a8";
    g.fillText("every piece you own is live in every op, automatically", wx, gy + 28);
  } else {
    g.font = "700 9px Verdana"; g.fillStyle = "#8a97a8";
    g.fillText("anything you own is ALWAYS equipped — no slots, no limit", wx, gy + 15);
    g.fillStyle = "#57717f";
    g.fillText("mint at kjp-game.wick.pics/mint · 50% burns KJP, 50% burns WICK", wx, gy + 28);
  }
  /* minted mid-session? pull it in without reconnecting the wallet */
  btn(wx + 232, gy - 12, 98, 26, walletBusy ? "…" : "↻ REFRESH", () => refreshGear(), { fs: 10 });
  gy += 40;
  const cw2 = 160, ch2 = 56;
  for (let t = 1; t <= 8; t++){
    const d = GEARDEFS[t], col = (t - 1) % 2, row = (t - 1) / 2 | 0;
    const x = wx + col * (cw2 + 10), yy = gy + row * (ch2 + 6);
    const held = gearOwned.includes(t);
    g.fillStyle = held ? "rgba(48,32,10,0.92)" : "rgba(9,14,18,0.75)";
    g.fillRect(x, yy, cw2, ch2);
    g.strokeStyle = held ? "#ff9d5b" : "#2a3540"; g.lineWidth = held ? 2 : 1;
    g.strokeRect(x + 0.5, yy + 0.5, cw2 - 1, ch2 - 1);
    g.font = "900 10px Arial Black"; g.fillStyle = held ? "#ffd27c" : "#6d7f8e";
    g.fillText((held ? "◆ " : "") + d.name, x + 8, yy + 16);
    wrapText2(d.blurb, x + 8, yy + 29, cw2 - 16, 10, held ? "#cbd9c9" : "#4e5c68", "700 8px Verdana");
    g.font = "700 8px Verdana"; g.fillStyle = held ? "#ff9d5b" : "#414e59";
    g.fillText(d.rare + " · " + d.pool, x + 8, yy + ch2 - 6);
  }
  btn(W - 190, H - 78, 120, 40, "← BACK", () => { STATE = "title"; });
  drawSiteLinks();
  dispatchClicks();
}
function gunRow(id, y, clickable, cb, inCarry){
  const w2 = WEAPONS[id];
  const x = 70, rw = 660, rh = 54;
  const hot = clickable && MOUSE.x >= x && MOUSE.x <= x + rw && MOUSE.y >= y && MOUSE.y <= y + rh;
  g.fillStyle = inCarry ? "rgba(40,34,10,0.9)" : hot ? "rgba(18,38,28,0.9)" : "rgba(9,16,13,0.85)";
  g.fillRect(x, y, rw, rh);
  g.strokeStyle = inCarry ? "#ffd27c" : w2.nft ? "#7a5f2f" : "#224232"; g.lineWidth = inCarry ? 2.5 : 1.5;
  g.strokeRect(x + 1, y + 1, rw - 2, rh - 2);
  const gArt = artFor(["gun-" + id]);
  const tx0 = gArt ? x + 128 : x + 14;
  if (gArt) g.drawImage(gArt, x + 10, y + 7, 108, 40);
  g.font = "900 14px Arial Black"; g.fillStyle = w2.nft ? "#ffd27c" : "#cfe3d2";
  g.fillText((w2.nft ? "◆ " : "") + w2.name, tx0, y + 23);
  g.font = "700 10px Verdana"; g.fillStyle = "#8ba3b8";
  const spec2 = w2.melee ? w2 : wSpec(id);   // gear rides every firearm, NFT or not
  const quiet2 = spec2.silenced || spec2.dart || spec2.noise < 100;
  const desc = w2.melee ? "choke · punch — silent-ish" :
    (quiet2 ? "QUIET" : "LOUD") + (w2.dart ? " · sleep dart" : " · lethal " + w2.dmg) + (w2.auto ? " · auto" : "") + (w2.pellets ? " · " + w2.pellets + " pellets" : "") + (w2.breach ? " · BREACHES DOORS" : "") + (spec2.pierce ? " · pierce" : "") + (w2.fan ? " · tri-dart" : "");
  /* clip the description to the column the stats leave free — a long blurb
     used to print straight through "mag 8 · noise 290" */
  const statW = w2.mag ? 200 : 100;
  g.save(); g.beginPath(); g.rect(tx0, y + 28, x + rw - statW - tx0, 20); g.clip();
  g.fillText(desc + (w2.blurb ? "  —  " + w2.blurb : ""), tx0, y + 41);
  g.restore();
  if (w2.mag){
    g.textAlign = "right"; g.fillStyle = "#7c8ba3";
    g.fillText("mag " + spec2.mag + (spec2.mag !== w2.mag ? "▲" : "") + " · noise " + spec2.noise + (spec2.noise !== w2.noise ? "▼" : ""), x + rw - 96, y + 41);
    g.textAlign = "left";
  }
  if (clickable){
    g.font = "900 11px Arial Black"; g.fillStyle = inCarry ? "#ffd27c" : "#57717f";
    g.fillText(inCarry ? "CARRIED" : "TAP TO CARRY", x + rw - 86, y + 24);
    UIB.push({ x, y, w: rw, h: rh, cb });
  }
  return y + rh + 8;
}

/* ---------- intel / how to ---------- */
function drawIntel(){
  UIB = [];
  g.fillStyle = "#05070c"; g.fillRect(0, 0, W, H);
  g.font = "900 34px Arial Black"; g.fillStyle = "#e6f1ff"; g.fillText("INTEL", 70, 78);
  const L = 70, L2 = 660;
  const rows = [
    ["MOVE", "WASD / arrows — hold SHIFT to run (LOUD), hold C to sneak (slow, quiet, fits vents)"],
    ["AIM / FIRE", "mouse + LMB · Q or wheel swaps weapons · R reloads"],
    ["E", "choke · drag · hack · take the file · DRIVE · TAKE A UNIFORM · STASH a body · HIDE inside"],
    ["G / V", "cycle and USE gadgets — EMP, smoke, lure beacon, thermal, breach charge"],
    ["DISGUISE", "strip a downed guard and walk in the front door. Sprinting, crouching or hauling a corpse blows it — officers see through it fastest"],
    ["WANTED ★", "five stars. Kills and alarms raise it; each star buys them more. It only cools while NOBODY can see you — a bin or a vent cools it fastest"],
    ["VEHICLES", "carts, vans, forklifts. Fast, loud, and they go through people. The engine is a siren you're sitting inside"],
    ["THE ROOM", "fuel drums explode, extinguishers make free smoke, breaker boxes kill every light in the wing"],
    ["GREED", "safes and drives are pure optional score — the loudest way to get rich"],
    ["F", "knock — every guard nearby checks the sound. Your best friend."],
    ["CONES", "green = calm, amber = curious, red = made you. Low desks hide you only while SNEAKING."],
    ["RADIO", "a spotting guard winds up a RADIO call — drop him before it completes and HQ never learns"],
    ["BODIES", "guards who find a body raise the site. Drag your mess into vents and dark corners."],
    ["DOGS", "K9s smell through walls. Stand still while crouched, or feed them a dart."],
    ["ANALYSTS", "civilians sprint for wall alarms. Aim at them — they freeze. Don't shoot. You're better than that."],
    ["DETECTORS", "lobby gates ring on carried FIREARMS. The ceramic HUSH-9 and REAPER darts pass clean."],
    ["SHADOWS", "stand in the dark and every guard's sight range shrinks. Lamps can be SHOT OUT — a dart is the quiet way."],
    ["COIN", "F near yourself knocks; F at a distant spot flicks a coin THERE. Guards check the sound, not you."],
    ["NFTs", "ARSENAL guns hit harder but ship LOUD — KJP GEAR's SUPPRESSOR quiets them. MODS auto-fit your guns; GEAR rides you, no slots. Holo = +1 ♥."],
    ["RANKS", "GHOST = never spotted, zero alarms · +PACIFIST = BABA YAGA. Intel = score."],
  ];
  /* TWO COLUMNS. Twenty rows in one column ran 20px past the bottom of the
     canvas and clipped the footer; splitting also halves the line length,
     which is the readability win as much as the fit. */
  g.font = "700 12px Verdana";
  const half = Math.ceil(rows.length / 2);
  const COLW = 540, KEYW = 118, LH = 12;
  const colY = [118, 118];
  rows.forEach(([k, v], i) => {
    const col = i < half ? 0 : 1;
    const x = col ? L2 : L;
    const y = colY[col];
    g.fillStyle = "#7cf9a5"; g.font = "900 10px Arial Black"; g.fillText(k, x, y);
    const lines = wrapText2(v, x + KEYW, y, COLW - KEYW, LH, "#9db4cc", "700 10px Verdana");
    colY[col] += Math.max(26, lines * LH + 10);      // the row owns its real height
  });
  let y = Math.max(colY[0], colY[1]) + 16;
  if (IS_TOUCH){
    g.fillStyle = "#ffd27c"; g.font = "900 11px Arial Black"; g.fillText("TOUCH", L, y);
    wrapText2("left thumb — move stick · right thumb — aim · FIRE / ACT (E) / USE (V) / GEAR (G) / KNOCK (F) / RUN / SNEAK / FOCUS buttons on the right",
      L + KEYW, y, 1010, 13, "#9db4cc", "700 10px Verdana");
    y += 34;
  }
  g.font = "700 10px Verdana"; g.fillStyle = "#57717f";
  g.fillText("KJP — a $WICK universe game on kjp-game.wick.pics · sister ops: games.wick.pics (PEPE WICK) · mint.wick.pics (WICK ARSENAL NFTs)", L, y);
  g.fillText("counsel's retainer: 0x3848D41D6f439Ca645e9193c7680629A86B739ED", L, y + 16);
  btn(W - 190, H - 78, 120, 40, "← BACK", () => { STATE = "title"; });
  drawSiteLinks();
  dispatchClicks();
}

/* ---------- ITERATION 8: THE DOSSIER — a career, not a high score ----------
   Per-op challenge ribbons give a reason to walk back into a level you already
   cleared, and the lifetime tallies quietly tell you what kind of operative you
   turned out to be. Nothing here is busywork: every ribbon is a different way
   to play the same building. */
/* `d` is the full rule (used where there is room); `s` is the card label —
   a real short phrase, because truncating the long one produced fragments
   like "clear without ever being" on the ribbon cards. */
const CHALLENGES = [
  { k: "ghost",    name: "GHOST",      s: "never spotted",   d: "clear without ever being spotted",  has: r => r && r.ghost },
  { k: "pacifist", name: "PACIFIST",   s: "no kills",        d: "clear without killing anyone",      has: r => r && r.pacifist },
  { k: "silent",   name: "NO ALARMS",  s: "zero alarms",     d: "clear with zero alarms raised",     has: r => r && r.alarms === 0 },
  { k: "swift",    name: "SWIFT",      s: "inside par time", d: "clear inside par time",             has: (r, n) => r && r.time <= LEVELS[n].par },
  { k: "archivist",name: "ARCHIVIST",  s: "every exhibit",   d: "collect every exhibit in the op",   has: (r, n) => r && r.intel >= r.intelMax }
];
function ribbonsFor(n){
  const r = PROG.lv[n];
  return CHALLENGES.map(c => ({ c, done: !!(r && c.has(r, n)) }));
}
function ribbonTotal(){
  let d = 0, t = 0;
  for (let n = 1; n <= 6; n++) for (const r of ribbonsFor(n)){ t++; if (r.done) d++; }
  return [d, t];
}
function drawDossier(){
  UIB = [];
  g.fillStyle = "#05070c"; g.fillRect(0, 0, W, H);
  g.font = "900 34px Arial Black"; g.fillStyle = "#e6f1ff"; g.fillText("DOSSIER", 70, 78);
  const [rd, rt] = ribbonTotal();
  g.font = "700 12px Verdana"; g.fillStyle = "#7c8ba3";
  g.fillText("K.J.P. — service record · " + rd + "/" + rt + " ribbons · " + clearedCount() + "/6 ops cleared", 70, 100);

  /* lifetime tallies */
  const S = PROG.career || {};
  const tallies = [
    ["OPS RUN", S.runs || 0], ["OPS CLEARED", clearedCount()],
    ["SLEEPERS", S.kos || 0], ["KILLS", S.kills || 0],
    ["EXHIBITS", S.intel || 0], ["ALARMS", S.alarms || 0],
    ["TIME IN THE BUILDING", fmtTime(S.time || 0)], ["CAMPAIGN", campaignScore().toLocaleString() + " pts"]
  ];
  tallies.forEach(([k, v], i) => {
    const x = 70 + (i % 4) * 232, y = 132 + (i / 4 | 0) * 70;
    g.fillStyle = "rgba(9,14,18,0.85)"; g.fillRect(x, y, 216, 56);
    g.strokeStyle = "#243040"; g.lineWidth = 1.5; g.strokeRect(x + 1, y + 1, 214, 54);
    g.font = "900 9px Arial Black"; g.fillStyle = "#57717f"; g.fillText(k, x + 12, y + 19);
    g.font = "900 20px Arial Black"; g.fillStyle = "#e6f1ff"; g.fillText(String(v), x + 12, y + 44);
  });
  /* per-op ribbon grid */
  g.font = "900 14px Arial Black"; g.fillStyle = "#9fd7b0"; g.fillText("CHALLENGE RIBBONS", 70, 300);
  g.font = "700 10px Verdana"; g.fillStyle = "#57717f";
  g.fillText("each ribbon is a different way through the same building — they stack with your best score", 70, 316);
  for (let n = 1; n <= 6; n++){
    const y = 336 + (n - 1) * 58;
    const open = n === 1 || !!PROG.lv[n - 1];
    g.font = "900 12px Arial Black"; g.fillStyle = open ? "#cfe3d2" : "#3d4854";
    g.fillText("OP " + n, 70, y + 20);
    g.font = "700 11px Verdana"; g.fillStyle = open ? "#8ba3b8" : "#3d4854";
    g.fillText(LEVELS[n].name, 122, y + 20);
    ribbonsFor(n).forEach((rb, i) => {
      const x = 300 + i * 142, cw2 = 134;
      g.fillStyle = rb.done ? "rgba(48,32,10,0.95)" : "rgba(9,14,18,0.7)";
      g.fillRect(x, y, cw2, 34);
      g.strokeStyle = rb.done ? "#ffd27c" : "#243040"; g.lineWidth = rb.done ? 2 : 1;
      g.strokeRect(x + 0.5, y + 0.5, cw2 - 1, 33);
      g.font = "900 10px Arial Black"; g.fillStyle = rb.done ? "#ffd27c" : "#4e5c68";
      g.fillText((rb.done ? "★ " : "") + rb.c.name, x + 8, y + 15);
      g.font = "700 9px Verdana"; g.fillStyle = rb.done ? "#a8b8a0" : "#3d4854";
      g.fillText(rb.c.s, x + 8, y + 27);
    });
    const best = PROG.lv[n];
    if (best){
      g.font = "700 10px Verdana"; g.fillStyle = "#7c8ba3"; g.textAlign = "right";
      g.fillText(best.score.toLocaleString() + " pts · " + rankFor(best), W - 74, y + 21);
      g.textAlign = "left";
    }
  }
  btn(W - 190, H - 62, 120, 40, "← BACK", () => { STATE = "title"; });
  btn(W - 340, H - 62, 140, 40, "📁 THE CASE", () => { STATE = "case"; }, { fs: 12 });
  drawSiteLinks();
  dispatchClicks();
}

/* ---------- THE CASE FILE — the story, out from behind the skip button ----
   Briefings are skippable (they should be), so the plot cannot only live
   there. Every exhibit you pick up lands on this board permanently. */
function drawCase(){
  UIB = [];
  g.fillStyle = "#05070c"; g.fillRect(0, 0, W, H);
  g.font = "900 30px Arial Black"; g.fillStyle = "#e6f1ff"; g.fillText("THE CASE", 70, 66);
  g.font = "700 11px Verdana"; g.fillStyle = "#7c8ba3";
  g.fillText("PIERRE, KENNY JOHN — v. THE AGENCY.  Client: R. GYATT.  Exhibits recovered in the field are filed here permanently.", 70, 86);
  /* the charge sheet */
  g.fillStyle = "rgba(48,20,20,0.5)"; g.fillRect(70, 100, W - 140, 62);
  g.strokeStyle = "#7a3030"; g.lineWidth = 1.5; g.strokeRect(70.5, 100.5, W - 141, 61);
  g.font = "900 12px Arial Black"; g.fillStyle = "#ff8f8f"; g.fillText("THE FRAME", 84, 122);
  g.font = "700 11px Verdana";
  wrapText2("Two kilos signed OUT of the Agency's own evidence vault the night before the arrest, planted, and signed back IN the morning after. Nine thousand paid posts called him a dealer — budget approved two weeks BEFORE anything was planted. Recover the bag AND the wallet: the money is the motive, the custody tag is the confession.",
    84, 140, W - 200, 14, "#d9b0b0", "700 11px Verdana");
  /* exhibits, per op */
  let y = 186;
  for (let n = 1; n <= 6; n++){
    const L = LEVELS[n], best = PROG.lv[n];
    const got = best ? (best.intel || 0) : 0;
    g.font = "900 12px Arial Black"; g.fillStyle = best ? "#7cf9a5" : "#3d4854";
    g.fillText("OP " + n + " · " + L.name, 70, y);
    g.font = "700 10px Verdana"; g.fillStyle = "#57717f";
    g.fillText(got + "/" + (L.lore || []).length + " exhibits", 260, y);
    (L.lore || []).forEach((txt, i) => {
      const have = i < got;
      g.font = "700 10px Verdana";
      g.fillStyle = have ? "#cfe3d2" : "#2f3a44";
      const line = have ? txt : "████████  — not yet recovered";
      g.fillText((have ? "✓ " : "· ") + line.slice(0, 118), 90, y + 16 + i * 15);
    });
    y += 20 + Math.max(1, (L.lore || []).length) * 15;
  }
  g.font = "700 10px Verdana"; g.fillStyle = "#8fc7ff";
  g.fillText("Exhibits are the 'i' pickups in the field. Collect all of an op's exhibits for the ARCHIVIST ribbon.", 70, H - 78);
  btn(W - 190, H - 62, 120, 40, "← BACK", () => { STATE = "dossier"; });
  dispatchClicks();
}

/* ---------- pause ---------- */
function drawPause(){
  UIB = [];
  g.fillStyle = "rgba(3,6,10,0.82)"; g.fillRect(0, 0, W, H);
  g.font = "900 44px Arial Black"; g.textAlign = "center";
  g.fillStyle = "#e6f1ff"; g.fillText("PAUSED", W / 2, 200);
  g.font = "700 13px Verdana"; g.fillStyle = "#7c8ba3";
  g.fillText("OP " + LV.n + " — " + LV.def.name + " · " + fmtTime(LV.time), W / 2, 232);
  g.textAlign = "left";
  btn(W / 2 - 130, 290, 260, 50, "▶ RESUME", () => { STATE = "game"; });
  btn(W / 2 - 130, 354, 260, 50, "↻ RESTART OP", () => startLevel(LV.n));
  btn(W / 2 - 130, 418, 260, 50, "☰ ABORT TO MENU", () => { STATE = "select"; }, { danger: true });
  dispatchClicks();
}
