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
  introT = 2.6;
  LV.stats.spotted = 0;
  focusT = 1;
  STATE = "game";
  musicWant(LV.alert === 2 ? "combat" : LV.alert === 1 ? "caution" : "calm");
  if (audioArmed) ambStart(LV.def.theme);        // the room, per district
  tutStart();
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
    else if (LV.over === "dead"){ STATE = "dead"; }
    LV.over = null;
    return;
  }
  if (PRESS.has("Escape")){ STATE = "pause"; SFX.ui2(); return; }
  if (BOT) botUpdate(dt);
  /* FOCUS slows the SIMULATION, never the input read — planning stays crisp */
  const scale = focusScale(dt);
  entsUpdate(dt * scale);
  tutUpdate(dt);
}
function drawIntroCard(){
  if (introT <= 0) return;
  introT -= 1 / 60;
  const a = clamp(introT > 2 ? (2.6 - introT) / 0.6 : introT / 0.8, 0, 1);
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

  if (STATE === "game"){ if (!syncOnly) gameUpdate(dt); drawGame(); drawIntroCard(); }
  else if (STATE === "pause"){ drawGame(); drawPause(); if (PRESS.has("Escape")) STATE = "game"; }
  else if (STATE === "title") drawTitle();
  else if (STATE === "select") drawSelect();
  else if (STATE === "skins") drawSkins();
  else if (STATE === "arsenal") drawArsenal();
  else if (STATE === "intel") drawIntel();
  else if (STATE === "options") drawOptions();
  else if (STATE === "dossier") drawDossier();
  else if (STATE === "brief") drawBrief(dt);
  else if (STATE === "debrief") drawDebrief(dt);
  else if (STATE === "dead") drawDead();
  else if (STATE === "credits") drawCredits(dt);
  else if (STATE === "qa") drawQA();
  else if (STATE === "qa100") drawQA100();

  dtAvg = dtAvg * 0.95 + (performance.now() - t0) * 0.05;
  if (location.search.includes("perf")){
    g.font = "700 11px monospace"; g.fillStyle = "#7cf9a5";
    g.fillText(dtAvg.toFixed(2) + "ms", W - 70, H - 10);
  }
  if (!syncOnly){
    inputEndFrame();
    requestAnimationFrame(frame);
  }
}

/* boot */
reconcileSkin();
(function boot(){
  const q = location.search;
  const botN = (/[?&]bot=(\d)/.exec(q) || [])[1];
  if (/[?&]qa100=1/.test(q)){ runQA100(); STATE = "qa100"; }
  else if (/[?&]qa=1/.test(q)){ runQA(); STATE = "qa"; }
  else if (botN){ startBot(+botN); }
  requestAnimationFrame(t => { lastT = t; frame(t); });
})();
