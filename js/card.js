/* KJP — SHAREABLE SCORE CARD.
 *
 * Composes a 1280x720 card on the LIVE canvas, captures it, and hands the
 * player a PNG. Drawing onto the real canvas rather than an offscreen one is
 * deliberate: `g` is a const bound to it, so every existing helper —
 * stampRank, bustKJP, the skin art — already targets it. An offscreen copy
 * would mean re-implementing all of that and letting the two drift apart,
 * and a share card that doesn't match the game is worse than none.
 *
 * The loop repaints the next frame, so the card never persists on screen.
 */
"use strict";

function cardBg(){
  g.fillStyle = "#05070c"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "rgba(255,157,91,0.06)"; g.lineWidth = 1;
  for (let x = 0; x < W; x += 40){ g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 40){ g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const hal = g.createRadialGradient(W / 2, 300, 40, W / 2, 300, 420);
  hal.addColorStop(0, "rgba(255,157,91,0.10)"); hal.addColorStop(1, "rgba(255,157,91,0)");
  g.fillStyle = hal; g.fillRect(0, 0, W, H);
}

/* r: a result object (score/time/rank/medal/ghost/pacifist), n: level number.
   mode is free text — "OP 3", "DAILY", "DEEP COVER" — so later modes reuse it. */
function drawScoreCard(r, n, mode){
  cardBg();
  const lv = LEVELS[n];

  g.font = "900 13px Arial Black"; g.fillStyle = "#ff9d5b";
  g.fillText("K.J.P. — THE BLACK FILE", 60, 58);
  g.font = "900 44px Arial Black"; g.fillStyle = "#e6f1ff";
  g.fillText(mode || ("OPERATION " + n), 60, 112);
  if (lv){
    g.font = "900 18px Arial Black"; g.fillStyle = "#9db4cc";
    g.fillText(lv.name + "  ·  " + lv.sub, 60, 144);
  }

  /* the number people are actually bragging about */
  g.font = "900 96px Arial Black"; g.fillStyle = "#ffd27c";
  g.fillText(Math.round(r.score).toLocaleString(), 60, 268);
  /* clear of the 96px score above it — its glyph box reaches y≈289 */
  g.font = "900 20px Arial Black"; g.fillStyle = "#8a6d2f";
  g.fillText("POINTS", 64, 318);

  /* clock + medal */
  const med = MEDALS.find(m => m.k === r.medal);
  g.font = "900 30px Arial Black"; g.fillStyle = "#e6f1ff";
  g.fillText(fmtTime(r.time), 60, 372);
  if (lv){
    g.font = "700 13px Verdana"; g.fillStyle = "#57717f";
    g.fillText("par " + fmtTime(lv.par), 60, 394);
  }
  if (med){
    g.font = "900 22px Arial Black"; g.fillStyle = med.col;
    g.fillText("🏅 " + med.name, 230, 372);
  }
  /* the aggravated stamp — the whole point of running the dial is the brag */
  if (r.agg){
    g.font = "900 18px Arial Black"; g.fillStyle = "#ff6b6b";
    g.fillText(r.agg.name + "  ·  ×" + r.agg.mult, 60, 410);
  }

  /* how it was done — the part that separates a good run from a fast one */
  const badges = [];
  if (r.ghost) badges.push(["👻 GHOST", "#7cf9a5", "never seen, never an alarm"]);
  if (r.pacifist) badges.push(["🕊 PACIFIST", "#8fc7ff", "everyone wakes up tomorrow"]);
  if (!r.ghost && !r.pacifist) badges.push(["⚔ LOUD", "#ff8f8f", r.kills + " down, " + r.alarms + " alarms"]);
  badges.forEach((b, i) => {
    const y = 440 + i * 54;
    g.fillStyle = "rgba(9,14,18,0.85)"; g.fillRect(60, y, 420, 44);
    g.strokeStyle = b[1]; g.lineWidth = 1.5; g.strokeRect(60.5, y + 0.5, 419, 43);
    g.font = "900 15px Arial Black"; g.fillStyle = b[1]; g.fillText(b[0], 74, y + 20);
    g.font = "700 11px Verdana"; g.fillStyle = "#7c8ba3"; g.fillText(b[2], 74, y + 36);
  });

  /* the operative, with the skin and gear actually carried */
  try { bustKJP(W - 300, 330, 2.0); } catch(e){}
  try { stampRank(W - 300, 560, r.rank, 1.5, -0.14); } catch(e){}
  const gearN = (window.ownedGearTypes || []).length;
  g.textAlign = "center";
  g.font = "900 12px Arial Black"; g.fillStyle = "#7cf9a5";
  try { g.fillText(skinDef().name, W - 300, 470); } catch(e){}
  g.font = "700 10px Verdana"; g.fillStyle = "#57717f";
  g.fillText(gearN ? gearN + "/8 GEAR CARRIED" : "NO GEAR", W - 300, 488);
  g.textAlign = "left";

  /* STREAK STRIP — the shareable brag. Fourteen boxes, one per day, medal
     colours for played days; the flame and count beside them. On a card that
     gets posted, a 12-day streak is social proof no screenshot of a score is. */
  try {
    const st = streakCalc();
    if (st.days > 0){
      const px2 = 520, py2 = H - 64;
      g.font = "900 14px Arial Black"; g.fillStyle = "#ff9d5b";
      g.fillText("🔥 " + st.days + "-DAY STREAK", px2, py2 - 10);
      const played = PROG.daily || {};
      for (let d = 13; d >= 0; d--){
        const t = new Date(Date.now() - d * 86400000);
        const k = "" + t.getUTCFullYear() + String(t.getUTCMonth() + 1).padStart(2, "0") + String(t.getUTCDate()).padStart(2, "0");
        const e2 = played[k];
        const x2 = px2 + (13 - d) * 20;
        g.fillStyle = e2 ? (MEDALS.find(m2 => m2.k === e2.medal) || { col: "#3f7a55" }).col : "rgba(60,72,84,0.5)";
        g.fillRect(x2, py2, 15, 15);
      }
    }
  } catch(e){}

  g.font = "900 15px Arial Black"; g.fillStyle = "#ff9d5b";
  g.fillText("kjp-game.wick.pics  ·  v" + VERSION, 60, H - 44);
  g.font = "700 11px Verdana"; g.fillStyle = "#3d4854";
  g.fillText("infiltrate Langley · beat this", 60, H - 24);
}

/* Compose, capture, hand it over. Returns the data URL so QA can assert on it
   without a download actually firing. */
function scoreCardURL(r, n, mode){
  drawScoreCard(r, n, mode);
  try { return cv.toDataURL("image/png"); }
  catch(e){
    /* a tainted canvas (cross-origin art) makes this throw — say so plainly
       instead of handing back a broken link */
    console.warn("score card capture failed: " + (e && e.message));
    return null;
  }
}
function shareCard(r, n, mode){
  const url = scoreCardURL(r, n, mode);
  if (!url){ toast("could not build the card on this browser", "#ff8f8f"); return false; }
  const a = document.createElement("a");
  a.href = url;
  a.download = "kjp-" + String(mode || ("op" + n)).toLowerCase().replace(/[^a-z0-9]+/g, "-")
             + "-" + Math.round(r.score) + ".png";
  document.body.appendChild(a); a.click(); a.remove();
  toast("score card saved — post it", "#7cf9a5");
  return true;
}
