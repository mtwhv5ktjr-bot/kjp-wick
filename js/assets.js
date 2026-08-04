/* KJP art pipeline — every slot here is a PNG the game will USE if it exists
   in /assets, and silently ignore if it doesn't (procedural fallback, no 404
   drama — same rule as games.wick.pics skins). Drop file → refresh → it's in.
   Full spec + prompts: ASSETS.md. */
"use strict";

const ART = {};
const ART_SLOTS = [
  /* characters — top-down, FACING RIGHT (angle 0), transparent, 128×128 */
  "kjp-top", "kjp-top-sneak", "kjp-top-fists", "kjp-top-tranq",
  "guard-top", "sentry-top", "officer-top", "dog-top", "civ-top",
  /* per-skin player overrides (optional): kjp-top-<skinid>.png */
  "kjp-top-midnight", "kjp-top-tux", "kjp-top-concierge", "kjp-top-ghillie",
  "kjp-top-hightable", "kjp-top-excomm", "kjp-top-holo",
  /* codec portraits (400×420) + title art */
  "port-kjp", "port-op", "port-dir", "port-rg",
  "title-kjp", "logo",
  /* skin cards for the SKINS menu (256×256) */
  "skin-midnight", "skin-tux", "skin-concierge", "skin-ghillie",
  "skin-hightable", "skin-excomm", "skin-holo",
  /* world: tileable floors + walls (96×96), props (96×96) */
  "tile-yard", "tile-lobby", "tile-office", "tile-archive", "tile-vault", "tile-roof",
  "wall-yard", "wall-lobby", "wall-office", "wall-archive", "wall-vault", "wall-roof",
  "desk", "hedge", "rack", "chopper",
  /* arsenal menu gun icons (256×96) */
  "gun-fists", "gun-tranq", "gun-p9", "gun-smg",
  "gun-n1", "gun-n2", "gun-n3", "gun-n4", "gun-n5", "gun-n6",
  /* pickups (64×64) */
  "pick-intel", "pick-card", "pick-darts", "pick-med"
];
window._artDirty = false;
/* fetch + createImageBitmap instead of <img>: a missing slot stays SILENT
   (an <img> 404 spams the console 49 times per load — absence is normal here) */
(function loadArt(){
  for (const n of ART_SLOTS){
    fetch("assets/" + n + ".png").then(r => {
      if (!r.ok) return null;
      return r.blob().then(b => createImageBitmap(b));
    }).then(bm => {
      if (!bm) return;
      ART[n] = bm;
      /* baked things need a rebake when their art lands after level load */
      if (/^(tile-|wall-)/.test(n) || ["desk", "hedge", "rack"].includes(n)) window._artDirty = true;
    }).catch(() => {});                        // absent = procedural. by design.
  }
})();
/* sprite lookup with fallback chain */
function artFor(names){
  for (const n of names) if (ART[n]) return ART[n];
  return null;
}
/* debug: KJP.art() lists what actually loaded */
window.addEventListener("load", () => {
  if (window.KJP) window.KJP.art = () => Object.keys(ART).sort();
});
