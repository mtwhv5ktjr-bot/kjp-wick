/* KJP — ITERATION 1: OPTIONS, DIFFICULTY & ACCESSIBILITY.
   A stealth game that only plays one way is a demo. Difficulty scales the
   things stealth is actually made of (how fast eyes fill, how long the radio
   takes, how hard bullets bite) and never the level layout, so a ROOKIE clear
   and a BABA YAGA clear are the same game at different pressure.
   Accessibility is not a menu of apologies: cone patterns for colourblind
   players, a shake toggle for vestibular comfort, hold-vs-toggle sneak,
   bigger text, and a slow-time assist that keeps the fantasy intact. */
"use strict";

const DIFFS = {
  rookie:   { name: "ROOKIE",     blurb: "for learning the building",
              detect: 0.72, radio: 1.5, dmg: 0.6,  hp: 1, alert: 0.75, scoreMul: 0.8 },
  operative:{ name: "OPERATIVE",  blurb: "the intended contract",
              detect: 1,    radio: 1,   dmg: 1,    hp: 0, alert: 1,    scoreMul: 1 },
  ghost:    { name: "GHOST",      blurb: "they look harder, they call faster",
              detect: 1.3,  radio: 0.7, dmg: 1.35, hp: 0, alert: 1.25, scoreMul: 1.25 },
  babayaga: { name: "BABA YAGA",  blurb: "one heart. no second chances.",
              detect: 1.5,  radio: 0.55, dmg: 2,   hp: -2, alert: 1.4, scoreMul: 1.6 }
};
const OPT_DEF = {
  diff: "operative",
  shake: 1,           // 0 off · 1 full — vestibular comfort
  cones: "colour",    // colour | patterned  (colourblind-safe hatching)
  sneakHold: 1,       // 1 = hold C · 0 = toggle
  bigText: 0,
  aimAssist: 1,       // gentle magnetism, on by default for pad/touch feel
  focus: 1,           // ASSIST: hold TAB to slow time while you plan
  sens: 1,            // aim sensitivity multiplier — "super sensitive" is per-machine
  fov: 62,            // 3D camera FOV; wider = more room, more distortion
  shadows: 1, bloom: 1, quality: "auto",   // the governor may step these down
  crt: 0, grain: 1,                        // v2.0.76/81 — CRT scanlines off by default, film grain on
  reduceMotion: 0, highContrast: 0, cbMode: "off",   // v2.0.82-84 accessibility
  masterVol: 1,                            // v2.0.90 master volume
  music: 1, sfx: 1,
  hints: 1,
  gore: 1
};
let OPT = Object.assign({}, OPT_DEF);
try{ const s = JSON.parse(localStorage.getItem("kjp_opt") || "null"); if (s && typeof s === "object") OPT = Object.assign(OPT, s); }catch(e){}
/* v2.0.91 — respect the OS accessibility setting on the FIRST run (before the
   player has saved any options of their own). If they toggle it later, their
   choice wins and this never overrides it again. */
try{
  if (!localStorage.getItem("kjp_opt") && matchMedia("(prefers-reduced-motion: reduce)").matches){ OPT.reduceMotion = 1; OPT.shake = 0; }
}catch(e){}
function saveOpt(){ try{ localStorage.setItem("kjp_opt", JSON.stringify(OPT)); }catch(e){} }
function diff(){ return DIFFS[OPT.diff] || DIFFS.operative; }

/* FOCUS — the assist that reads as a power. Time crawls, the world keeps its
   rules, and the meter drains so it can never become a pause button. */
let focusT = 1, focusOn = false;
function focusScale(dt){
  const want = OPT.focus && (KEYS.has("Tab") || TOUCH.focus) && focusT > 0.02 && LV && !LV.over && P && !P.dead;
  focusOn = !!want;
  if (focusOn) focusT = Math.max(0, focusT - dt * 0.5);
  else focusT = Math.min(1, focusT + dt * 0.22);
  return focusOn ? 0.42 : 1;
}
function drawFocusMeter(){
  if (!OPT.focus) return;
  const x = 26, y = H - 104, w2 = 128;
  if (focusT >= 0.999 && !focusOn) return;
  g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(x, y, w2, 7);
  g.fillStyle = focusOn ? "#8fc7ff" : "rgba(143,199,255,0.55)";
  g.fillRect(x, y, w2 * focusT, 7);
  g.font = "900 8px Arial Black"; g.fillStyle = "#6c8290";
  g.fillText("FOCUS  [TAB]", x, y - 5);
}
/* colourblind-safe cone fill: hatching pattern per alert state */
let _conePats = null;
function conePattern(state){
  if (OPT.cones !== "patterned") return null;
  if (!_conePats){
    _conePats = {};
    const mk = (col, kind) => {
      const c = document.createElement("canvas"); c.width = c.height = 8;
      const p = c.getContext("2d");
      p.strokeStyle = col; p.lineWidth = 2;
      if (kind === "calm"){ p.beginPath(); p.moveTo(0, 8); p.lineTo(8, 0); p.stroke(); }
      else if (kind === "susp"){ p.beginPath(); p.moveTo(0, 0); p.lineTo(8, 8); p.stroke(); }
      else { p.beginPath(); p.moveTo(4, 0); p.lineTo(4, 8); p.stroke(); p.moveTo(0, 4); p.lineTo(8, 4); p.stroke(); }
      return g.createPattern(c, "repeat");
    };
    _conePats.calm = mk("rgba(190,235,255,0.30)", "calm");
    _conePats.susp = mk("rgba(255,200,90,0.34)", "susp");
    _conePats.alert = mk("rgba(255,90,90,0.38)", "alert");
  }
  return _conePats[state];
}

/* ---------- the screen ---------- */
let optTab = 0;
function drawOptions(){
  UIB = [];
  g.fillStyle = "#05070c"; g.fillRect(0, 0, W, H);
  g.font = "900 34px Arial Black"; g.fillStyle = "#e6f1ff"; g.fillText("OPTIONS", 70, 78);
  g.font = "700 12px Verdana"; g.fillStyle = "#7c8ba3";
  g.fillText("difficulty changes pressure, never the building — every route stays open at every setting", 70, 100);

  /* difficulty cards */
  const keys = Object.keys(DIFFS), cw = 248, ch = 104;
  keys.forEach((k, i) => {
    const d = DIFFS[k], x = 70 + i * (cw + 14), y = 128;
    const on = OPT.diff === k;
    const hot = MOUSE.x >= x && MOUSE.x <= x + cw && MOUSE.y >= y && MOUSE.y <= y + ch;
    g.fillStyle = on ? "rgba(48,32,10,0.95)" : hot ? "rgba(18,38,28,0.9)" : "rgba(9,14,18,0.85)";
    g.fillRect(x, y, cw, ch);
    g.strokeStyle = on ? "#ffd27c" : hot ? "#7cf9a5" : "#2a3540"; g.lineWidth = on ? 2.5 : 1.5;
    g.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
    g.font = "900 17px Arial Black"; g.fillStyle = on ? "#ffd27c" : "#cfe3d2";
    g.fillText(d.name, x + 14, y + 30);
    g.font = "700 10px Verdana"; g.fillStyle = "#8ba3b8";
    wrapText2(d.blurb, x + 14, y + 50, cw - 28, 13, "#8ba3b8", "700 10px Verdana");
    g.font = "700 9px Verdana"; g.fillStyle = on ? "#ff9d5b" : "#57717f";
    g.fillText("eyes ×" + d.detect + " · radio ×" + d.radio + " · dmg ×" + d.dmg
      + (d.hp ? " · " + (d.hp > 0 ? "+" : "") + d.hp + "♥" : ""), x + 14, y + ch - 26);
    g.fillStyle = on ? "#ffd27c" : "#57717f";
    g.fillText("score ×" + d.scoreMul, x + 14, y + ch - 11);
    UIB.push({ x, y, w: cw, h: ch, cb: () => { OPT.diff = k; saveOpt(); SFX.ui(); } });
  });

  /* toggles */
  const rows = [
    ["SCREEN SHAKE",  () => OPT.shake ? "FULL" : "OFF",            () => OPT.shake = OPT.shake ? 0 : 1,        "camera kick on gunfire and hits"],
    ["VISION CONES",  () => OPT.cones === "patterned" ? "PATTERNED" : "COLOUR", () => OPT.cones = OPT.cones === "patterned" ? "colour" : "patterned", "patterned adds hatching — readable without colour"],
    ["SNEAK",         () => OPT.sneakHold ? "HOLD [C]" : "TOGGLE",  () => OPT.sneakHold = OPT.sneakHold ? 0 : 1, "toggle keeps your hand off the key"],
    ["FOCUS ASSIST",  () => OPT.focus ? "ON [TAB]" : "OFF",         () => OPT.focus = OPT.focus ? 0 : 1,        "hold TAB to slow time while you plan"],
    ["AIM ASSIST",    () => OPT.aimAssist ? "ON" : "OFF",           () => OPT.aimAssist = OPT.aimAssist ? 0 : 1, "gentle magnetism toward a target"],
    /* the two feel dials that differ machine to machine — cycle through named
       steps so they live in the same click-to-cycle row language as the rest */
    ["SENSITIVITY",   () => ({0.55:"LOW",0.8:"SOFT",1:"NORMAL",1.3:"HIGH",1.7:"TWITCH"})[OPT.sens] || ("×" + OPT.sens),
                      () => { const s=[0.55,0.8,1,1.3,1.7]; OPT.sens = s[(s.indexOf(OPT.sens)+1) % s.length]; }, "how fast the aim follows the mouse"],
    ["CAMERA FOV",    () => OPT.fov + "°",
                      () => { const f=[54,62,70,80]; OPT.fov = f[(f.indexOf(OPT.fov)+1) % f.length]; if (typeof R3D!=="undefined"&&R3D.cam){ R3D.cam.fov=OPT.fov; R3D.cam.updateProjectionMatrix(); } }, "wider shows more room, tighter feels closer"],
    ["SHADOWS",       () => OPT.shadows ? "ON" : "OFF",             () => OPT.shadows = OPT.shadows ? 0 : 1,     "real-time — costs ~1ms; off on phones"],
    ["BLOOM",         () => OPT.bloom ? "ON" : "OFF",               () => OPT.bloom = OPT.bloom ? 0 : 1,         "neon glow — the cyberpunk look"],
    ["FILM GRAIN",    () => OPT.grain ? "ON" : "OFF",               () => OPT.grain = OPT.grain ? 0 : 1,         "subtle sensor noise over the picture"],
    ["CRT SCANLINES", () => OPT.crt ? "ON" : "OFF",                 () => OPT.crt = OPT.crt ? 0 : 1,             "retro monitor lines — off by default"],
    /* v2.0.82-84 accessibility */
    ["REDUCE MOTION", () => OPT.reduceMotion ? "ON" : "OFF",        () => { OPT.reduceMotion = OPT.reduceMotion ? 0 : 1; if (OPT.reduceMotion) OPT.shake = 0; }, "stops shake, sway, camera swing, aberration"],
    ["HIGH CONTRAST", () => OPT.highContrast ? "ON" : "OFF",        () => OPT.highContrast = OPT.highContrast ? 0 : 1, "brighter cones, thicker HUD outlines"],
    ["COLOURBLIND",   () => ({off:"OFF",deut:"DEUTERAN",prot:"PROTAN",trit:"TRITAN"})[OPT.cbMode] || "OFF",
                      () => { const m=["off","deut","prot","trit"]; OPT.cbMode = m[(m.indexOf(OPT.cbMode)+1)%m.length]; }, "recolours cones + state to a safe palette"],
    ["MASTER VOLUME", () => Math.round(OPT.masterVol * 100) + "%",
                      () => { const v=[0,0.25,0.5,0.75,1]; OPT.masterVol = v[(v.indexOf(OPT.masterVol)+1)%v.length]; applyAudioOpts(); }, "overall loudness"],
    ["LARGE TEXT",    () => OPT.bigText ? "ON" : "OFF",             () => OPT.bigText = OPT.bigText ? 0 : 1,     "bigger HUD and subtitles"],
    ["HINTS",         () => OPT.hints ? "ON" : "OFF",               () => OPT.hints = OPT.hints ? 0 : 1,         "contextual coaching in the field"],
    ["BLOOD",         () => OPT.gore ? "ON" : "OFF",                () => OPT.gore = OPT.gore ? 0 : 1,           "hits still register without it"],
    ["MUSIC",         () => OPT.music ? "ON" : "OFF",               () => { OPT.music = OPT.music ? 0 : 1; applyAudioOpts(); }, "three-layer tension score"],
    ["SFX",           () => OPT.sfx ? "ON" : "OFF",                 () => { OPT.sfx = OPT.sfx ? 0 : 1; applyAudioOpts(); },   "everything else you hear"]
  ];
  /* v2.0.81 — three columns now: the toggle list grew past what two columns
     could hold above the bottom buttons (audit: last row landed on RESTORE
     DEFAULTS). Three columns of 16 rows is 6 rows tall, clear of the buttons. */
  const rw = 372, rh = 38, cols = 3;
  rows.forEach(([label, val, act, help], i) => {
    const col = i % cols, row = i / cols | 0;
    const x = 70 + col * (rw + 12), y = 262 + row * (rh + 10);
    const hot = MOUSE.x >= x && MOUSE.x <= x + rw && MOUSE.y >= y && MOUSE.y <= y + rh;
    g.fillStyle = hot ? "rgba(18,38,28,0.9)" : "rgba(9,14,18,0.8)"; g.fillRect(x, y, rw, rh);
    g.strokeStyle = hot ? "#7cf9a5" : "#243040"; g.lineWidth = 1.5; g.strokeRect(x + 1, y + 1, rw - 2, rh - 2);
    g.font = "900 12px Arial Black"; g.fillStyle = "#cfe3d2"; g.fillText(label, x + 14, y + 17);
    g.font = "700 9px Verdana"; g.fillStyle = "#57717f"; g.fillText(help, x + 14, y + 31);
    g.font = "900 12px Arial Black"; g.fillStyle = "#7cf9a5"; g.textAlign = "right";
    g.fillText(val(), x + rw - 14, y + 24); g.textAlign = "left";
    UIB.push({ x, y, w: rw, h: rh, cb: () => { act(); saveOpt(); SFX.ui2(); } });
  });

  btn(70, H - 78, 190, 44, "↺ RESTORE DEFAULTS", () => { OPT = Object.assign({}, OPT_DEF); saveOpt(); applyAudioOpts(); }, { fs: 12 });
  /* v2.0.54 — back to the paused game if that is where we came from */
  btn(W - 190, H - 78, 120, 44, "← BACK", () => { if (typeof PAUSE_RET !== "undefined" && PAUSE_RET && LV){ PAUSE_RET = false; STATE = "pause"; } else STATE = "title"; });
  dispatchClicks();
}
