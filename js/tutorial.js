/* KJP — ITERATION 5: ONBOARDING.
   A stealth game loses most players in the first ninety seconds, because
   nothing punishes them yet and nothing teaches them either. This is a staged,
   DETECTED tutorial: each beat watches for the actual verb, advances the moment
   the player performs it, and times out into a nudge rather than a wall. It
   only ever runs once (kjp_tut), only on Op 1, and never blocks input. */
"use strict";

let TUT = null;
/* Every gate is measured in PER-STEP time (stepT), never total elapsed — the
   old version gated on TUT.t, so the choke lesson sat on screen for 52 seconds
   before it gave up. Nothing here waits longer than it takes to read it, and
   every step has a `skip` so the tutorial can never become a wall. */
const TUT_STEPS = [
  { k: "move",  txt: "WASD / arrows to move",                        hint: "the yard is dark — dark is cover",
    ok: () => TUT.moved > 150, skip: () => TUT.stepT > 8 },
  { k: "sneak", txt: "Hold C to SNEAK — slow, quiet, fits vents",    hint: "sneaking halves what they can see of you",
    ok: () => TUT.sneakT > 0.8, skip: () => TUT.stepT > 9 },
  { k: "look",  txt: "Those green cones are eyes. Stay out of them", hint: "amber = curious · red = made you",
    ok: () => TUT.stepT > 2.2 },
  { k: "coin",  txt: "Aim away and press F to throw a COIN",         hint: "guards check the sound, not you",
    ok: () => TUT.coins > 0, skip: () => TUT.stepT > 11 },
  { k: "gear",  txt: "G cycles gadgets · V uses one",                hint: "EMP, smoke, lure, thermal, breach charge",
    ok: () => TUT.stepT > 2.4 },
  { k: "choke", txt: "Get BEHIND a guard and hold E to choke him",   hint: "then E again to STASH him in a bin — or take his UNIFORM",
    ok: () => LV.stats.kos > 0, skip: () => TUT.stepT > 13 },
  { k: "obj",   txt: "▸ is your objective. ★ on the TAC-MAP points at it", hint: "the exit glows once the work is done",
    ok: () => TUT.stepT > 2.4 }
];
function tutStart(){
  let done = false;
  try{ done = !!localStorage.getItem("kjp_tut"); }catch(e){}
  if (done || LV.n !== 1 || BOT) return;
  TUT = { i: 0, t: 0, stepT: 0, moved: 0, sneakT: 0, coins: 0, lastX: P.x, lastY: P.y, fade: 0 };
}
function tutDone(){
  TUT = null;
  try{ localStorage.setItem("kjp_tut", "1"); }catch(e){}
}
/* the SKIP hit-box, shared by the drawer and the input read */
const TUT_SKIP = { x: W / 2 + 268, y: H - 176, w: 88, h: 26 };
function tutUpdate(dt){
  if (!TUT || !LV || LV.over) return;
  TUT.t += dt; TUT.stepT += dt;
  /* a visible way out, clickable — ESC belongs to the pause menu */
  if (MOUSE.pressed && MOUSE.x >= TUT_SKIP.x && MOUSE.x <= TUT_SKIP.x + TUT_SKIP.w
      && MOUSE.y >= TUT_SKIP.y && MOUSE.y <= TUT_SKIP.y + TUT_SKIP.h){
    SFX.ui2(); toast("tutorial off — INTEL in the menu has every control", "#8fc7ff");
    tutDone(); return;
  }
  TUT.moved += dist(P.x, P.y, TUT.lastX, TUT.lastY);
  TUT.lastX = P.x; TUT.lastY = P.y;
  if (P.sneak) TUT.sneakT += dt;
  TUT.coins = LV.coins.length ? TUT.coins + 0 : TUT.coins;    // counted on throw below
  TUT.fade = Math.min(1, TUT.fade + dt * 3);
  const s = TUT_STEPS[TUT.i];
  if (!s){ tutDone(); return; }
  if (s.ok() || (s.skip && s.skip())){
    TUT.i++; TUT.stepT = 0; TUT.fade = 0;
    if (TUT.i < TUT_STEPS.length) SFX.codec(); else { STING.objective(); tutDone(); }
  }
}
function tutCoinThrown(){ if (TUT) TUT.coins++; }
function drawTutorial(){
  if (!TUT) return;
  const s = TUT_STEPS[TUT.i]; if (!s) return;
  const a = TUT.fade, bx = W / 2 - 260, by = H - 176;
  g.save(); g.globalAlpha = a;
  g.fillStyle = "rgba(4,9,14,0.86)"; g.fillRect(bx, by, 520, 56);
  brackets(bx, by, 520, 56, "rgba(143,199,255,0.55)", 9);
  g.textAlign = "center";
  g.font = "900 " + (OPT.bigText ? 16 : 14) + "px Arial Black"; g.fillStyle = "#e6f1ff";
  g.fillText(s.txt, W / 2, by + 25);
  g.font = "700 " + (OPT.bigText ? 12 : 10) + "px Verdana"; g.fillStyle = "#8fc7ff";
  g.fillText(s.hint, W / 2, by + 43);
  /* progress pips — how much school is left */
  for (let i = 0; i < TUT_STEPS.length; i++){
    g.fillStyle = i < TUT.i ? "#7cf9a5" : i === TUT.i ? "#8fc7ff" : "rgba(120,140,160,0.3)";
    g.fillRect(W / 2 - TUT_STEPS.length * 7 + i * 14, by + 50, 9, 3);
  }
  g.textAlign = "left";
  /* SKIP — always there, never in the way */
  const S = TUT_SKIP;
  const hot = MOUSE.x >= S.x && MOUSE.x <= S.x + S.w && MOUSE.y >= S.y && MOUSE.y <= S.y + S.h;
  g.fillStyle = hot ? "rgba(28,74,48,0.95)" : "rgba(8,14,20,0.85)";
  g.fillRect(S.x, S.y, S.w, S.h);
  g.strokeStyle = hot ? "#7cf9a5" : "rgba(143,199,255,0.45)"; g.lineWidth = 1.5;
  g.strokeRect(S.x + 0.5, S.y + 0.5, S.w - 1, S.h - 1);
  g.font = "900 11px Arial Black"; g.textAlign = "center";
  g.fillStyle = hot ? "#dfffe9" : "#8fc7ff";
  g.fillText("SKIP ▸", S.x + S.w / 2, S.y + 17);
  g.textAlign = "left"; g.restore();
}
