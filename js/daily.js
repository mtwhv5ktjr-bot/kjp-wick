/* KJP — DAILY CONTRACT.
 *
 * One contract per UTC day, identical for everyone: the same floor, the same
 * pressure, the same piece of gear confiscated. Everything is derived from the
 * date itself, so there is nothing to distribute and no way for two players to
 * get different assignments — the seed IS the date.
 *
 * The campaign is six floors you finish once. This is the reason to open the
 * game tomorrow.
 */
"use strict";

/* UTC so the contract flips at the same instant worldwide, not at each
   player's local midnight — otherwise "today's contract" means two different
   things to two people racing the same board. */
function dailyKey(d){
  const t = d || new Date();
  return "" + t.getUTCFullYear()
       + String(t.getUTCMonth() + 1).padStart(2, "0")
       + String(t.getUTCDate()).padStart(2, "0");
}
/* mulberry32 — small, fast, and identical in every browser. Math.random()
   cannot be used anywhere in here: the whole point is that my roll and your
   roll are the same roll. */
function _m32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const DAILY_DIFFS = ["operative", "ghost", "babayaga"];
function dailyPlan(key){
  key = key || dailyKey();
  const rnd = _m32(parseInt(key, 10) >>> 0);
  const lv = 1 + Math.floor(rnd() * 6);
  const dif = DAILY_DIFFS[Math.floor(rnd() * DAILY_DIFFS.length)];
  const ban = 1 + Math.floor(rnd() * 8);          // one gear type confiscated
  return { key, lv, diff: dif, ban };
}
let DAILY = dailyPlan();
let DAILY_RUN = false;
let _dailyBakDiff = null;

/* NOT YET POSTED TO THE SHARED BOARD, deliberately.
   The server already understands "daily-YYYYMMDD" modes — own ceiling, own
   lane, world-record ghosts — but it clamps mode with slice(0, 12), and
   "daily-20260804" is 14 characters. It would be stored as "daily-202608",
   collapsing every day of a month onto ONE board that never resets. The
   signature check still passes (the client string contains the truncated one
   as a prefix), so it would fail silently and look fine.
   The fix is one number in wick-arsenal/api/leaderboard.js — but that file is
   being rewritten right now in another session for the git-store migration,
   and editing it would destroy that work. Until then the daily keeps a local
   best, which is honest, and the score card is how you show it off. */
function dailyBest(key){
  const d = (PROG.daily || {})[key || DAILY.key];
  return d ? d.score : 0;
}
function dailyLabel(){
  const lv = LEVELS[DAILY.lv], dn = (DIFFS[DAILY.diff] || {}).name || DAILY.diff;
  const gb = (GEARDEFS[DAILY.ban] || {}).name || "—";
  return (lv ? lv.name : "OP " + DAILY.lv) + " · " + dn + " · NO " + gb;
}
/* seconds until the next UTC midnight, for the countdown */
function dailyLeft(){
  const n = new Date();
  const next = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1);
  return Math.max(0, Math.floor((next - n.getTime()) / 1000));
}
function fmtLeft(s){
  const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  return h + "h " + String(m).padStart(2, "0") + "m";
}

function startDaily(){
  DAILY = dailyPlan();                 // re-derive: the tab may have been open past midnight
  DAILY_RUN = true;
  _dailyBakDiff = OPT.diff;
  OPT.diff = DAILY.diff;               // the contract sets the pressure, not the menu
  bumpMods();                          // the ban changes what the guns do
  startLevel(DAILY.lv);
}
/* Always restore what startDaily() borrowed. Called from finishLevel and from
   any exit back to the menus — leaving the player's difficulty silently
   rewritten to BABA YAGA because they tried a daily would be a real bug. */
function dailyEnd(){
  if (!DAILY_RUN) return;
  DAILY_RUN = false;
  if (_dailyBakDiff !== null){ OPT.diff = _dailyBakDiff; _dailyBakDiff = null; saveOpt(); }
  bumpMods();
}
function dailyFinish(r){
  if (!DAILY_RUN) return;
  PROG.daily = PROG.daily || {};
  const cur = PROG.daily[DAILY.key];
  if (!cur || r.score > cur.score)
    PROG.daily[DAILY.key] = { score: r.score, time: r.time, rank: r.rank, medal: r.medal, ts: Date.now() };
  saveProg();
  dailyEnd();
}
