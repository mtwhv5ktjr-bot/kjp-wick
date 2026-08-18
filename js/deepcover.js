/* KJP — DEEP COVER (endless).
 *
 * The campaign is six floors with a door at the end of the last one. This is
 * the same building with the door welded shut: clear a floor and you are
 * dropped straight into the next one, deeper, with the Agency angrier. There
 * is no win condition — only how far down you got before they put you down.
 *
 * It reuses the real floors rather than generating rooms, recombined in a
 * seeded order with escalating pressure. Procedural corridors would be new
 * geometry with none of the hand-placed patrol logic that makes the stealth
 * work, and a worse game is not a deeper one.
 */
"use strict";

let DEEP = { on: false, depth: 0, score: 0, seed: 0 };
let _deepBakDiff = null;

/* pressure ramps with depth: the intended contract, then they look harder,
   then one heart. Past that the building cannot get meaner, so the score
   multiplier carries the escalation instead. */
function deepDiffFor(depth){
  if (depth <= 2) return "operative";
  if (depth <= 5) return "ghost";
  return "babayaga";
}
function deepFloorFor(depth, seed){
  /* never the same floor twice in a row — being dropped into the room you
     just cleared reads as a bug, not as depth */
  const r = _m32((seed ^ (depth * 2654435761)) >>> 0);
  let n = 1 + Math.floor(r() * 6);
  if (depth > 1 && n === DEEP.lastFloor) n = 1 + (n % 6);
  return n;
}
function deepBest(){ return (PROG.deep && PROG.deep.depth) || 0; }
function deepBestScore(){ return (PROG.deep && PROG.deep.score) || 0; }

function startDeep(){
  DEEP = { on: true, depth: 1, score: 0, seed: (Date.now() / 86400000 | 0), lastFloor: 0 };
  _deepBakDiff = OPT.diff;
  deepEnter();
}
/* v2.0.32 THE RUN CARRIES. Every DEEP COVER floor used to hand you a fresh
   KJP — full hearts, full mags, full gadgets — so there was no run, only a
   sequence of unrelated floors. Now hearts, ammo, gadget counts and stamina
   PERSIST between floors (clamped to the new floor's max), which is what
   makes depth 8 feel like depth 8: you arrive with what you saved. */
function deepCarryOut(){
  if (!P) return;
  DEEP.carry = { hp: P.hp, ammoIn: Object.assign({}, P.ammoIn), rounds: Object.assign({}, P.rounds),
                 darts: P.darts, gadN: Object.assign({}, P.gadN), stam: P.stam };
}
function deepCarryIn(){
  const c = DEEP.carry; if (!c || !P) return;
  P.hp = Math.max(0.5, Math.min(P.hpMax, c.hp));
  for (const k in c.ammoIn) if (P.ammoIn[k] !== undefined) P.ammoIn[k] = c.ammoIn[k];
  for (const k in c.rounds) if (P.rounds[k] !== undefined) P.rounds[k] = c.rounds[k];
  if (c.darts !== undefined) P.darts = c.darts;
  for (const k in c.gadN) if (P.gadN[k] !== undefined) P.gadN[k] = c.gadN[k];
  P.stam = c.stam !== undefined ? c.stam : 1;
}
function deepEnter(){
  const n = deepFloorFor(DEEP.depth, DEEP.seed);
  DEEP.lastFloor = n;
  OPT.diff = deepDiffFor(DEEP.depth);
  bumpMods();
  startLevel(n);
  applyAggravators();                  // the risk dial rides Deep Cover too
  deepCarryIn();
  /* v2.0.33 BOONS — a choice every third floor. Depth 3, 6, 9… opens a
     three-card pick before the floor starts (drawn by the pause layer, see
     deepBoonOffer). One boon per pick, they stack, they are what turns "how
     far" into "what build". */
  if (DEEP.depth > 1 && DEEP.depth % 3 === 0) deepBoonOffer();
  toast("DEPTH " + DEEP.depth + " — " + (LEVELS[n] ? LEVELS[n].name : "") + " · " + (DIFFS[OPT.diff] || {}).name, "#ff9d5b");
  /* v2.0.40 MILESTONES. Passing your own record, and passing the round
     numbers, is called out the moment it happens — with the sting. The run
     is a number that only goes up; the game should notice when it does. */
  const best = (PROG.deep && PROG.deep.depth) || 0;
  if (DEEP.depth === best + 1 && best >= 2){ toast("★ NEW RECORD DEPTH — everything past here is new ground", "#ffd27c"); if (typeof STING !== "undefined" && STING.unlock) STING.unlock(); }
  else if (DEEP.depth === 5 || DEEP.depth === 10 || DEEP.depth === 15){ toast("★ DEPTH " + DEEP.depth + " — they are pulling people from other buildings", "#ffd27c"); }
}
/* cleared a floor: bank it and keep going down. No debrief between floors —
   the run IS the unit, so stopping to read a scorecard would break it. */
function deepAdvance(r){
  DEEP.score += r.score;
  DEEP.depth++;
  deepCarryOut();
  /* v2.0.34 A FLOOR CLEARED HEALS ONE — the only healing in the run. Not
     full: one heart, so a bad floor still costs you into the next. */
  if (DEEP.carry) DEEP.carry.hp = Math.min((P && P.hpMax) || 3, DEEP.carry.hp + 1);
  deepEnter();
}

/* v2.0.33 the boon deck. Each is a real sim lever the game already has. */
const DEEP_BOONS = [
  { k: "heart",  name: "SECOND WIND",   blurb: "+1 max heart, and it fills",         apply: () => { P.hpMax++; P.hp = P.hpMax; } },
  { k: "quiet",  name: "SOFT SOLES",    blurb: "steps 40% quieter, run included",    apply: () => { DEEP.mods.quiet = 0.6; } },
  { k: "mags",   name: "DEEP POCKETS",  blurb: "double reserve ammo, refilled",      apply: () => { for (const k in P.rounds) P.rounds[k] = (P.rounds[k] || 0) * 2 + 24; } },
  { k: "gad",    name: "SUPPLY DROP",   blurb: "every gadget +1",                    apply: () => { for (const k in P.gadN) P.gadN[k]++; } },
  { k: "eyes",   name: "NIGHT EYES",    blurb: "guards see you 25% later",           apply: () => { DEEP.mods.detect = 0.75; } },
  { k: "iron",   name: "IRON LUNGS",    blurb: "stamina drains half as fast",        apply: () => { DEEP.mods.stam = 0.5; } },
  { k: "greed",  name: "GREED",         blurb: "×1.4 score — but −1 max heart",      apply: () => { DEEP.mods.score = 1.4; P.hpMax = Math.max(1, P.hpMax - 1); P.hp = Math.min(P.hp, P.hpMax); } },
];
function deepBoonOffer(){
  DEEP.mods = DEEP.mods || {};
  const pool = DEEP_BOONS.filter(b => !(DEEP.taken || []).includes(b.k) || b.k === "gad" || b.k === "mags");
  const rnd2 = _m32((DEEP.seed ^ (DEEP.depth * 7919)) >>> 0);
  const pick = [];
  while (pick.length < 3 && pool.length){ const i = Math.floor(rnd2() * pool.length); pick.push(pool.splice(i, 1)[0]); }
  DEEP.offer = pick;
  STATE = "boon";
}
function deepTakeBoon(b){
  DEEP.taken = DEEP.taken || []; DEEP.taken.push(b.k);
  b.apply(); SFX.unlock();
  toast("◆ " + b.name + " — " + b.blurb, "#ffd27c");
  DEEP.offer = null; STATE = "game";
}
function drawBoon(){
  UIB = [];
  drawGame();
  g.fillStyle = "rgba(3,6,10,0.78)"; g.fillRect(0, 0, W, H);
  g.font = "900 13px Arial Black"; g.fillStyle = "#ff9d5b"; g.textAlign = "center";
  g.fillText("DEPTH " + DEEP.depth + " — CHOOSE ONE", W / 2, 150);
  g.font = "700 11px Verdana"; g.fillStyle = "#7c8ba3";
  g.fillText("they stack. they last the run. pick the build you are going to die with.", W / 2, 172);
  g.textAlign = "left";
  const cw = 280, ch = 150, gap = 24, x0 = (W - (cw * 3 + gap * 2)) / 2, y0 = 220;
  (DEEP.offer || []).forEach((b, i) => {
    const x = x0 + i * (cw + gap), y = y0;
    const hot = MOUSE.x >= x && MOUSE.x <= x + cw && MOUSE.y >= y && MOUSE.y <= y + ch;
    g.fillStyle = hot ? "rgba(58,40,14,0.96)" : "rgba(30,22,10,0.9)"; g.fillRect(x, y, cw, ch);
    g.strokeStyle = hot ? "#ffd27c" : "#8a6d2f"; g.lineWidth = hot ? 2.5 : 1.5; g.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
    g.font = "900 18px Arial Black"; g.fillStyle = "#ffd27c"; g.fillText(b.name, x + 18, y + 40);
    wrapText2(b.blurb, x + 18, y + 68, cw - 36, 15, "#cbd9c9", "700 12px Verdana");
    g.font = "900 9px Arial Black"; g.fillStyle = hot ? "#7cf9a5" : "#57717f";
    g.fillText(hot ? "▸ TAKE IT" : "click", x + 18, y + ch - 14);
    UIB.push({ x, y, w: cw, h: ch, cb: () => deepTakeBoon(b) });
  });
  dispatchClicks();
}
/* caught: the run is over. Records the deepest depth ever, and the best score
   at that depth, then restores what the run borrowed. */
function deepEnd(){
  if (!DEEP.on) return null;
  const res = { depth: DEEP.depth, score: DEEP.score };
  PROG.deep = PROG.deep || { depth: 0, score: 0 };
  if (res.depth > PROG.deep.depth) PROG.deep.depth = res.depth;
  if (res.score > PROG.deep.score) PROG.deep.score = res.score;
  saveProg();
  DEEP.on = false;
  if (_deepBakDiff !== null){ OPT.diff = _deepBakDiff; _deepBakDiff = null; saveOpt(); }
  bumpMods();
  return res;
}
