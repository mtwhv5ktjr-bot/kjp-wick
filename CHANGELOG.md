# KJP — CHANGELOG

Every entry is a shipped, verified change. The top entry MUST match `VERSION` in
`js/core.js` — the ship gate refuses to deploy if it does not, so nothing ships unnumbered.

## 2.0.41 — the campaign and DEEP COVER become a run
- **2.0.32** DEEP COVER carries — hearts, ammo, gadgets and stamina persist between floors (clamped to the new max). Depth 8 feels like depth 8: you arrive with what you saved
- **2.0.33** BOONS — every third depth, pick one of three: SECOND WIND, SOFT SOLES, DEEP POCKETS, SUPPLY DROP, NIGHT EYES, IRON LUNGS, GREED (×1.4 score, −1 heart). They stack, they last the run; "how far" becomes "what build"
- **2.0.34** a cleared floor heals ONE heart — the only healing in the run; a bad floor still costs you into the next
- **2.0.35** the POST-MORTEM — the death screen says what killed you and the one stat that would have changed it. A death you understand is a retry
- **2.0.36** DEEP COVER run card on death — depth, score, NEW RECORD, and the build you died with
- **2.0.37** the ending knows how you played — the codec opens on YOUR campaign (ghost / twelve down / four alarms / clean) and whether you have the whole Black File, before the shared ending
- **2.0.38** the tease — under NEXT on the debrief, one line of what waits: the floor's subtitle, guard count, and THE DIRECTOR IS ON SITE when he is
- **2.0.39** the descent strip — six floors as a vertical section of Langley on the select screen, lit as you clear them; the unlit floors below are the pull
- **2.0.40** milestones — new record depth and depths 5/10/15 called out with the sting the moment they happen
- **2.0.41** run it back — after a DEEP COVER death the first button is NEW RUN (retrying one floor of an ended run made no sense); after a daily death it is AGAIN, re-arming the contract

## 2.0.31 — the tools: more verbs, and guns that feel like guns
- **2.0.21** FLASHBANG — blinds everyone facing it for 4s (guards drop target and detection); loud; and honest — look at it yourself and your screen whites out too
- **2.0.22** WIRE CUTTER — kills one camera or laser silently and permanently; must be within reach. Answers "a camera on the only route" without a firefight
- **2.0.23** DECOY TAPE — a lure that sounds like YOU: loops step+track noises, so dogs chase it as scent and noise-memory escalates it to a full search
- **2.0.24** GADGET KIT — five of eight, chosen in the ready room as chips above the gun row; a stealth kit and a loud kit are different loadouts now
- **2.0.25** RECOIL + BLOOM — each round adds bloom decaying over ~0.6s (cadence stays tight, mag-dumping sprays), and the camera kicks per shot; sneak-fire is braced and steadier
- **2.0.26** the reticle OPENS with bloom and movement — a live spread readout honest to the exact next-round spread
- **2.0.27** swap has a cost — 0.32s raising the new gun during which you cannot fire; bloom resets. Kills the tranq↔9mm-every-shot loop
- **2.0.28** HEADSHOTS — through the centre 5px: 2.2x and a one-shot drop (not the Director/dogs); tranq gets an instant sleep. Rare by geometry, never turns it into a shooter
- **2.0.29** the FINISHER — punching a sleeping/KO'd guard is a silent kill: no gunshot, but it IS a kill — costs PACIFIST, adds heat if found. The ugly efficient option, charged honestly
- **2.0.30** the last three rounds click differently — you hear the reload coming without reading a number
- **2.0.31** FIX (found verifying 2.0.21): in 3D every gadget throw went toward the WORLD ORIGIN — gadgetUse aimed via the 2D scroll offset, stale at (0,0). Now uses the unprojected aim point, like the guns

## 2.0.20 — the guards: firefights become tactical
- **2.0.11** first-shot delay — 0.35s raise-and-acquire (0.2 for sentries) before the first round; breaking line of sight is a real move now, not a coin-flip
- **2.0.12** accuracy is a function of range and YOUR movement — spread widens with distance and when you sprint; moving through fire is survivable, standing in it is not
- **2.0.13** suppression — a guard with player rounds passing within 40px shoots worse and slower for a second; laying fire on a doorway keeps heads down
- **2.0.14** magazines — 12 rounds (30 smg), then a 1.6s reload where he stops firing and calls it ("RELOADING — cover me!"). You learn to count
- **2.0.15** flank, don't funnel — the second and later attackers approach 90° off the line to you, alternating sides; a held doorway gets a man round the side
- **2.0.16** wounded guards — under half health they limp at 60%, leave a blood trail, and call it out. Slower to flank, louder to find
- **2.0.17** reload behind cover — on empty he side-steps to the nearest tile that breaks your line of sight. Briefly out of your line — the moment a good player repositions
- **2.0.18** the nose follows tracks — wet-feet and breath noises are SCENT to a dog; within 260px it locks and follows the chain. Sprint from a dog and you feed it
- **2.0.19** not every analyst is a hero — ~40% (seeded, learnable) freeze and cower instead of running for the alarm; but they SAW you and tell the first guard who passes 6s later
- **2.0.20** the QRF scales with heat — cold: 1 man in 8s (a patrol checking in); hot: 4 men in 3s plus a second wave at 4+ stars. Heat now controls the consequence

## 2.0.10 — sim texture: the things a stealth player feels every minute
- **2.0.1** sneak is quiet, not silent — a crouched step whispers (18px carpet / 24 marble) so surface still matters while crouched; only dogs and already-suspicious guards catch it
- **2.0.2** wet feet track — leaving deck or grass drops fading noise-echoes behind you for a few steps that guards can follow; rides the existing search AI
- **2.0.3** stamina — sprint is a 4s tank refilling in ~6; empty = winded (below walk, audible breathing IS a noise). Sprint is a decision now, not the default
- **2.0.4** stamina bar under the hearts, only while not full; amber and pulsing when winded
- **2.0.5** noise memory — a guard who checked a spot shrugs off the next small noise there ("…"), but the THIRD in a row is a pattern: straight to search, floor told. Coin-spam stops working; varied distractions rewarded
- **2.0.6** a dark lamp is evidence — a patroller walking under a shot-out fixture notices ("…that light was on") and goes suspicious there. Darkness buys time, not immunity
- **2.0.7** dragging is work — drains stamina; dragging while winded crawls at 34. Plan the stash before the takedown
- **2.0.8** torch sweep — a searching guard's flashlight (and its floor cone) rakes on a slow sine so you can time the swing-away; the sim's detection cone is untouched, this is the light in his hand
- **2.0.9** LAST SEEN ghost on the TAC-MAP — a pulsing marker where THEY think you are, so "they lost me" vs "they are right" is instantly readable
- **2.0.10** hit stagger — a round shoves you off-line and drops input authority for 0.18s, interrupting a sprint and knocking the wind out; refreshes, never chains

## 2.0.0 — the versioning system
- `VERSION` constant, shown on the title (top-right) and stamped on the score card, so every bug report arrives with the build it happened on
- CHANGELOG.md is the ledger; a QA100 check enforces that the top entry matches VERSION
