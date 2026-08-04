# KJP — KENNY JOHN PIERRE: THE BLACK FILE

Top-down (birds-eye) MGS-style stealth game. KJP — attorney at law, the Agency's
deniable asset — breaks INTO the C.I.A. to steal his own file. Lives at
**kjp-game.wick.pics** (which previously served the one-page "Kenny John Pierre — Law"
site; its catchphrase "See you in the courtroom." and retainer address
0x3848D41D6f439Ca645e9193c7680629A86B739ED are kept as lore/footer).

## Run

- `dev.cmd` → http://localhost:8100 (portable node, no deps; 8096 was taken)
- Deploy: `npx vercel deploy --prod --yes` (project **kjp-wick**, team pangler;
  CLI auth lives at %APPDATA%\xdg.data\com.vercel.cli). kjp-game.wick.pics is
  ATTACHED + aliased on Vercel; it goes live the moment the wick.pics zone at
  Cloudflare gets `A kjp 76.76.21.21` (DNS-only) — the proxied *.wick.pics
  wildcard currently serving the old law page loses to the specific record.
- QA: `node tools/qa-node.mjs` (map solver) · `?qa=1` (18 checks) · `?bot=N`
  (autoplayer) · `KJP.step(n)` sim pump (hidden pane pauses rAF) · `?perf=1`.
  Perf: warm up ~100 frames before trusting draw timings (cold JIT lies 2-3×).

## Files (no build step — raw scripts, load order matters, see index.html)

- `index.html` — shell: css, canvas, rotate overlay, wallet sheet DOM
- `js/core.js` — canvas/input/audio/save/util + SKINS + WEAPONS registries
- `js/levels.js` — 6 ASCII maps + entity placements + codec briefs
- `js/world.js` — grid collision, DDA raycast/LOS, A*, noise events
- `js/ents.js` — player/guards/dogs/cameras/analysts/bullets/FX + AI states
- `js/render.js` — level prerender, entity draw, cones, radar, HUD, post grade
- `js/screens.js` — title/select/codec/debrief/skins/arsenal/intel/pause
- `js/net.js` — wallet connect/watch + NFT guns + leaderboard (mode "kjp")
- `js/qa.js` — `?qa=1` solver suite, `?bot=N` autoplayer, window.KJP debug
- `js/main.js` — state machine + loop

## HARD INVARIANTS

- **Player hands/fists are GREEN and stay green** (frog!) in every skin.
- Locked face DNA: black hair curtains + shades + green frog — never redesign.
- Leaderboard: shared wick-arsenal board, mode **"kjp"** (score ceiling 300k,
  level 1..10, holders-only POST gate). Message format EXACTLY:
  `"WICK score\naddress:"+addr+"\nscore:"+s+"\nmode:kjp\nts:"+Date.now()`
- NFT guns: direct eth_call `gunsOfOwner(address)` selector `0x25a88846` on
  WickGuns `0x188848DdB42fA8Ca2EB05649c944e05dfA2158FD` (PulseChain
  rpc.pulsechain.com), API fallback https://wick-arsenal.vercel.app/api/verify.
  Gun types 1-6 map to stealth-tuned weapons; 11-16 = holo → +1♥ + gold shimmer.
- WICK MODS: `modsOfOwner` selector `0x8d56809a` on
  `0x004E6610ff47c6A6510DA446257822B37D26CD73`; MODDEFS auto-fit CARRIED NFT
  guns only (`wSpec()` — agency pickups take no attachments), mods failures
  return [] and never block gun verification.
- Light model: lamps shrink/extend guard sight (dogs=nose, cams=IR exempt);
  lamps and cameras are shootable. Never bake lamp STATE into PRE — LIGHTS is
  a live list, dead fixtures draw their cap dynamically.
- Campaign scoring must top out **well under 300k** (server rejects above).
- Screenshot gotcha: hidden pane pauses rAF — `KJP.shot()` renders synchronously
  before `POST /shot` (dev server saves shot.png).

## QA

- `?qa=1` — static solver: every level's objective chain + exit must be provably
  reachable (BFS over keycard/hack states), entities on legal tiles + unit checks.
- `?bot=N` — sneaky autoplayer clears level N (visual QA / screenshots).
