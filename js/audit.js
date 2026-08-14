/* KJP — LAYOUT AUDIT.  KJP.audit()  ·  ?audit=1
 *
 * Eyeballing screens misses collisions; this does not. It wraps fillText and
 * strokeText, records the real measured box of every string a screen draws
 * (honouring textAlign and the font's own size), then reports:
 *
 *   OFF-CANVAS   text drawn outside the 1280x720 frame
 *   TEXT/TEXT    two labels sharing pixels — the thing that made the wallet
 *                panel unreadable over the SUPPRESSOR callout
 *   BTN/BTN      two clickable rects overlapping, so a tap is ambiguous
 *   TINY         text under 8px, which nobody can read on a phone
 *
 * Runs every screen at desktop AND touch layouts, because the touch HUD moves
 * things. Small overlaps are tolerated (labels legitimately sit inside their
 * own panels); the threshold is "meaningfully covered".
 */
"use strict";

function _auditFrame(state, opts){
  const boxes = [], warn = [];
  const realFill = g.fillText, realStroke = g.strokeText;
  /* Text is routinely drawn inside save/translate/rotate/scale — world-space
     props, rotated rank stamps, popped heat stars. Recording the raw x,y
     reports all of those as off-canvas nonsense. Map through the LIVE
     transform instead, and record whether it was world-space (camera-shifted)
     so screen-space rules are not applied to a fuel drum three rooms away. */
  const rec = function(t, x, y){
    const s = String(t);
    if (!s.trim()) return;
    const fm = /(\d+(?:\.\d+)?)px/.exec(g.font);
    let size = fm ? parseFloat(fm[1]) : 12;
    let w;
    try { w = g.measureText(s).width; } catch(e){ w = s.length * size * 0.55; }
    let lx = x;
    if (g.textAlign === "center") lx = x - w / 2;
    else if (g.textAlign === "right" || g.textAlign === "end") lx = x - w;
    let m = null;
    try { m = g.getTransform(); } catch(e){}
    const sc = m ? Math.hypot(m.a, m.b) : 1;
    const px = m ? (m.a * lx + m.c * (y - size * 0.78) + m.e) : lx;
    const py = m ? (m.b * lx + m.d * (y - size * 0.78) + m.f) : (y - size * 0.78);
    /* a non-identity translate means the camera (or a local origin) is active */
    const worldSpace = !!(m && (Math.abs(m.e) > 0.5 || Math.abs(m.f) > 0.5) && state === "game");
    size *= sc;
    boxes.push({ s, size, worldSpace, rotated: !!(m && Math.abs(m.b) > 0.01),
                 ofBtn: !!window._auditBtnLabel,      // drawn BY btn() as its caption
                 x0: px, y0: py, x1: px + w * sc, y1: py + size });
  };
  g.fillText = function(t, x, y){ rec(t, x, y); return realFill.apply(this, arguments); };
  g.strokeText = function(t, x, y){ rec(t, x, y); return realStroke.apply(this, arguments); };

  const bakState = STATE;
  STATE = state;
  try { frame(performance.now(), true); }
  catch(e){ warn.push({ kind: "THREW", detail: e.message }); }
  finally { g.fillText = realFill; g.strokeText = realStroke; STATE = bakState; }

  /* HUD/menu text only: world-space labels legitimately sit outside the frame
     (the camera moves), and a tiny label painted on a prop is set dressing. */
  const ui = boxes.filter(b => !b.worldSpace);
  for (const b of ui){
    if (b.x0 < -2 || b.x1 > W + 2 || b.y0 < -2 || b.y1 > H + 2)
      warn.push({ kind: "OFF-CANVAS", detail: '"' + b.s.slice(0, 28) + '" at ' + Math.round(b.x0) + "," + Math.round(b.y0) });
    if (b.size < 8)
      warn.push({ kind: "TINY", detail: '"' + b.s.slice(0, 24) + '" ' + b.size.toFixed(1) + "px" });
  }
  const overlap = (a, b) => {
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
    const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ox <= 0 || oy <= 0) return 0;
    const area = ox * oy, small = Math.min((a.x1 - a.x0) * (a.y1 - a.y0), (b.x1 - b.x0) * (b.y1 - b.y0));
    return small > 0 ? area / small : 0;
  };
  for (let i = 0; i < ui.length; i++)
    for (let j = i + 1; j < ui.length; j++){
      const a = ui[i], b = ui[j];
      /* the same string a few px apart is a deliberate drop shadow, not a bug */
      if (a.s === b.s && Math.abs(a.x0 - b.x0) < 7 && Math.abs(a.y0 - b.y0) < 7) continue;
      /* 0.45 was too forgiving — a wrapped third line sitting on the row
         below only covered ~30% of it and slipped through, while looking
         plainly broken on screen. */
      const f = overlap(a, b);
      if (f > 0.22)
        warn.push({ kind: "TEXT/TEXT", detail: '"' + a.s.slice(0, 20) + '" x "' + b.s.slice(0, 20) + '" ' + Math.round(f * 100) + "%" });
    }
  /* TEXT vs BUTTON.
     The blind spot that let the title screen ship with "DIFFICULTY: OPERATIVE"
     printed across the DAILY CONTRACT button: TEXT/TEXT and BTN/BTN were both
     checked, and the case where a stray label lands on top of a control was
     not. A label over a button is worse than two labels touching — it makes
     the button look mislabelled. Text drawn as part of a button is excluded by
     the containment test: a label INSIDE its own control is the normal case. */
  for (const b of ui){
    if (b.ofBtn) continue;                        // a button's own caption, by definition
    for (const r of UIB){
      if (!r.fromBtn) continue;                   // clickable region, not a captioned control
      /* a label fully inside a control is a card caption (gear blurbs, stat
         rows) — those are drawn deliberately within their own clickable area */
      const inside = b.x0 >= r.x - 2 && b.x1 <= r.x + r.w + 2 && b.y0 >= r.y - 2 && b.y1 <= r.y + r.h + 2;
      if (inside) continue;
      const ox = Math.min(b.x1, r.x + r.w) - Math.max(b.x0, r.x);
      const oy = Math.min(b.y1, r.y + r.h) - Math.max(b.y0, r.y);
      if (ox <= 0 || oy <= 0) continue;
      const f = (ox * oy) / Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
      if (f > 0.22)
        warn.push({ kind: "TEXT/BTN", detail: '"' + b.s.slice(0, 24) + '" over a button, ' + Math.round(f * 100) + "%" });
    }
  }
  /* clickable rects must not fight each other */
  for (let i = 0; i < UIB.length; i++)
    for (let j = i + 1; j < UIB.length; j++){
      const a = UIB[i], b = UIB[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 3 && oy > 3)
        warn.push({ kind: "BTN/BTN", detail: Math.round(ox) + "x" + Math.round(oy) + "px at " + Math.round(Math.max(a.x, b.x)) + "," + Math.round(Math.max(a.y, b.y)) });
    }
  return { state, labels: boxes.length, buttons: UIB.length, warn };
}

function runAudit(){
  const screens = ["title", "select", "skins", "arsenal", "intel", "options", "dossier", "ready", "dead"];
  const out = [];
  /* a wallet + gear + heat state, so panels actually have content to collide */
  const bakGear = window.ownedGearTypes, bakGun = window.ownedGunTypes, bakMod = window.ownedModTypes;
  const bakAddr = walletAddr;
  window.ownedGunTypes = [1, 2, 4, 11]; window.ownedModTypes = [1, 4];
  window.ownedGearTypes = [1, 2, 5, 7]; bumpMods();
  walletAddr = "0x3848D41D6f439Ca645e9193c7680629A86B739ED";
  for (const s of screens) out.push(_auditFrame(s));
  /* the in-game HUD, at its busiest */
  try {
    const bakBot = BOT; BOT = null;
    startLevel(2); introT = 0; P.god = true;
    if (typeof heatAdd === "function") heatAdd(3, "audit");
    if (typeof tutDone === "function") tutDone();
    for (let i = 0; i < 30; i++) gameUpdate(1 / 60);
    out.push(_auditFrame("game"));
    BOT = bakBot;
  } catch(e){ out.push({ state: "game", labels: 0, buttons: 0, warn: [{ kind: "THREW", detail: e.message }] }); }
  window.ownedGunTypes = bakGun; window.ownedModTypes = bakMod;
  window.ownedGearTypes = bakGear; walletAddr = bakAddr; bumpMods();

  const total = out.reduce((n, r) => n + r.warn.length, 0);
  console.log("KJP LAYOUT AUDIT — " + total + " issue(s) across " + out.length + " screens");
  for (const r of out){
    if (!r.warn.length){ console.log("  ✓ " + r.state.padEnd(8) + r.labels + " labels, " + r.buttons + " buttons"); continue; }
    console.log("  ✗ " + r.state.padEnd(8) + r.warn.length + " issue(s)");
    for (const w of r.warn) console.log("      [" + w.kind + "] " + w.detail);
  }
  window.AUDIT_RESULT = { total, screens: out.map(r => ({ state: r.state, warn: r.warn })) };
  return window.AUDIT_RESULT;
}
