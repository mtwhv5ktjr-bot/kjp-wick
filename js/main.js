/* KJP main — state machine + the loop. */
"use strict";

let STATE = "title";
let introT = 0, lastT = 0, dtAvg = 0;

function startLevel(n){
  loadLevel(n);
  initEnts();
  prerenderLevel();
  sandboxInit();                                   // after prerender: LIGHTS must exist
  rainDrops = null;
  introT = 1.5;                                    // the name card, not an intermission
  LV.stats.spotted = 0;
  focusT = 1;
  STATE = "game";
  musicWant(LV.alert === 2 ? "combat" : LV.alert === 1 ? "caution" : "calm");
  if (audioArmed) ambStart(LV.def.theme);        // the room, per district
  tutStart();
  /* confirm the loadout out loud at the top of every op — no equip screen to
     forget, no doubt about whether the NFTs actually came in with you */
  /* Say it out loud. A hunter who never stands down changes how the floor
     should be played, and discovering that by dying is not a lesson. */
  if ((LV.def.guards || []).some(gd => gd.kind === "director"))
    setTimeout(() => { if (LV) toast("THE DIRECTOR is on this floor — he does not lose interest", "#ff4d4d"); }, 1500);
  const gearOn = window.ownedGearTypes || [];
  if (gearOn.length) setTimeout(() => {
    if (LV) toast("✓ " + gearOn.length + " GEAR ACTIVE — " + gearOn.map(t => GEARDEFS[t] && GEARDEFS[t].name).filter(Boolean).join(", "), "#ff9d5b");
  }, 60);
}

/* first gesture births the AudioContext (autoplay policy) */
let audioArmed = false;
function armAudio(){
  if (audioArmed) return;
  audioArmed = true;
  try{ ac(); audioBuses(); musicInit(); applyAudioOpts();
       if (LV && STATE === "game") ambStart(LV.def.theme); }catch(e){}
}
addEventListener("pointerdown", armAudio, { once: false });
addEventListener("keydown", armAudio, { once: false });

function gameUpdate(dt){
  if (LV.over){
    if (LV.over === "win"){ finishLevel(); }
    else if (LV.over === "dead"){
      /* a DEEP COVER death ends the whole run, not just the floor — bank the
         depth and hand back the borrowed difficulty before the death screen */
      if (DEEP.on) DEEP.lastRun = deepEnd();
      STATE = "dead"; DB_deadLine = null;   // fresh line per death
    }
    LV.over = null;
    return;
  }
  /* ESC, or the on-screen button — a phone has no ESC key */
  const B = PAUSE_BTN;
  const hitPause = MOUSE.pressed && MOUSE.x >= B.x && MOUSE.x <= B.x + B.w && MOUSE.y >= B.y && MOUSE.y <= B.y + B.h;
  if (PRESS.has("Escape") || hitPause){ STATE = "pause"; SFX.ui2(); return; }
  if (BOT) botUpdate(dt);
  /* the takedown beat runs on REAL time so it cannot slow its own countdown */
  tdUpdate(dt);
  /* FOCUS slows the SIMULATION, never the input read — planning stays crisp.
     The takedown hit-stop multiplies into the same scale so the two compose
     instead of fighting over who owns time. */
  const scale = focusScale(dt) * tdScale();
  entsUpdate(dt * scale);
  subtUpdate(dt);          // subtitles run on real time — radio doesn't slow for FOCUS
  tutUpdate(dt);
}
function drawIntroCard(){
  if (introT <= 0) return;
  introT -= 1 / 60;
  if (MOUSE.pressed || PRESS.size) introT = Math.min(introT, 0.25);   // any input dismisses it
  const a = clamp(introT > 1.1 ? (1.5 - introT) / 0.4 : introT / 0.6, 0, 1);
  g.fillStyle = `rgba(3,6,10,${a * 0.75})`; g.fillRect(0, 0, W, H);
  g.globalAlpha = a;
  g.font = "900 15px Arial Black"; g.textAlign = "center";
  g.fillStyle = "#7cf9a5"; g.fillText("OPERATION " + LV.n, W / 2, H / 2 - 54);
  g.font = "900 52px Arial Black"; g.fillStyle = "#e6f1ff";
  g.fillText(LV.def.name, W / 2, H / 2);
  g.font = "700 14px Verdana"; g.fillStyle = "#9db4cc";
  g.fillText(LV.def.sub, W / 2, H / 2 + 34);
  g.textAlign = "left"; g.globalAlpha = 1;
}

/* the loop */
function frame(now, syncOnly){
  const dt = Math.min(1 / 30, (now - lastT) / 1000 || 1 / 60);
  lastT = now;
  const t0 = performance.now();
  /* art dropped into /assets after a level baked → rebake once, seamlessly */
  if (window._artDirty && LV && PRE){ window._artDirty = false; prerenderLevel(); }

  /* Any return to the menus ends an abandoned daily and hands the player their
     difficulty back. There are several exits — dead, pause, menu, the debrief's
     own buttons — and missing one would silently leave OPT.diff rewritten to
     whatever today's contract demanded. One catch-all beats four call sites. */
  if (typeof DAILY_RUN !== "undefined" && DAILY_RUN
      && STATE !== "game" && STATE !== "pause" && STATE !== "debrief" && STATE !== "dead") dailyEnd();

  if (STATE === "game"){ if (!syncOnly) gameUpdate(dt); drawGame(); drawIntroCard(); }
  else if (STATE === "pause"){ drawGame(); drawPause(); if (PRESS.has("Escape")) STATE = "game"; }
  else if (STATE === "title") drawTitle();
  else if (STATE === "select") drawSelect();
  else if (STATE === "skins") drawSkins();
  else if (STATE === "arsenal") drawArsenal();
  else if (STATE === "intel") drawIntel();
  else if (STATE === "options") drawOptions();
  else if (STATE === "dossier") drawDossier();
  else if (STATE === "blackfile") drawBlackFile();
  else if (STATE === "case") drawCase();
  else if (STATE === "ready") drawReadyRoom();
  else if (STATE === "brief") drawBrief(dt);
  else if (STATE === "debrief") drawDebrief(dt);
  else if (STATE === "dead") drawDead();
  else if (STATE === "credits") drawCredits(dt);
  else if (STATE === "qa") drawQA();
  else if (STATE === "qa100") drawQA100();

  const frameMs = performance.now() - t0;
  dtAvg = dtAvg * 0.95 + frameMs * 0.05;
  /* the governor only ever sees REAL gameplay frames — menus and sync renders
     would teach it the wrong budget */
  if (!syncOnly && STATE === "game" && typeof r3dGovern === "function" && R3D.on) r3dGovern(frameMs);
  if (location.search.includes("perf")){
    g.font = "700 11px monospace"; g.fillStyle = "#7cf9a5";
    g.fillText(dtAvg.toFixed(2) + "ms", W - 70, H - 10);
  }
  if (!syncOnly){
    inputEndFrame();
    requestAnimationFrame(safeFrame);           // guarded entry — see below
  }
}
/* THE LOOP MUST NOT BE KILLABLE.
   A single throw anywhere in update-or-draw used to escape before the
   requestAnimationFrame at the end of frame(), so the chain was never
   re-armed and the game froze permanently — which is exactly how a negative
   arc() radius read as "the game crashed" to a player mid-op. Now one bad
   frame costs one frame: it is logged once, the canvas state is unwound, and
   the loop keeps running. */
let _frameErrs = 0;
function safeFrame(now){
  try{
    frame(now);
  }catch(e){
    if (_frameErrs++ < 5) console.error("frame error (recovered): " + (e && e.message), e);
    try{ g.restore(); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.setTransform(1, 0, 0, 1, 0, 0); }catch(e2){}
    inputEndFrame();
    requestAnimationFrame(safeFrame);          // re-arm no matter what
  }
}

/* boot */
r3dBoot();          // third person unless the machine can't, or ?view=2d
reconcileSkin();
(function boot(){
  const q = location.search;
  const botN = (/[?&]bot=(\d)/.exec(q) || [])[1];
  if (/[?&]qa100=1/.test(q)){ runQA100(); STATE = "qa100"; }
  else if (/[?&]qa=1/.test(q)){ runQA(); STATE = "qa"; }
  else if (botN){ startBot(+botN); }
  requestAnimationFrame(t => { lastT = t; safeFrame(t); });
})();
