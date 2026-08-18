# KJP — CHANGELOG

Every entry is a shipped, verified change. The top entry MUST match `VERSION` in
`js/core.js` — the ship gate refuses to deploy if it does not, so nothing ships unnumbered.

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
