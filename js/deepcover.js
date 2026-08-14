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
function deepEnter(){
  const n = deepFloorFor(DEEP.depth, DEEP.seed);
  DEEP.lastFloor = n;
  OPT.diff = deepDiffFor(DEEP.depth);
  bumpMods();
  startLevel(n);
  applyAggravators();                  // the risk dial rides Deep Cover too
  toast("DEPTH " + DEEP.depth + " — " + (LEVELS[n] ? LEVELS[n].name : "") + " · " + (DIFFS[OPT.diff] || {}).name, "#ff9d5b");
}
/* cleared a floor: bank it and keep going down. No debrief between floors —
   the run IS the unit, so stopping to read a scorecard would break it. */
function deepAdvance(r){
  DEEP.score += r.score;
  DEEP.depth++;
  deepEnter();
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
