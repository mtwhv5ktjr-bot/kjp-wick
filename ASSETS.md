# KJP ART DROPS — put PNGs in `assets/`, refresh, they're in the game.

Every slot is optional. Missing file = procedural art, silently (house rule).
Name must match EXACTLY (lowercase, `.png`). Transparent background unless
noted. After dropping files locally: refresh localhost:8100 to check, then
`npx vercel deploy --prod --yes` ships them.

**⚠ Files must land in this folder as real .png files** — images pasted into
chat can't be saved to disk (known limitation since the forge sessions).

## TIER 1 — biggest visual bang

| file | size | what / rules |
|---|---|---|
| `kjp-top.png` | 128×128 | **THE player, top-down (bird's-eye), FACING RIGHT.** Green frog head w/ black hair curtains + shades, dark suit, GREEN hands visible holding a pistol two-handed. Character fills ~85% of frame, centered. The engine rotates him — never bake a direction other than RIGHT. |
| `port-kjp.png` | 400×420 | Codec portrait, front bust: hair curtains + shades + frog muzzle + suit/tie. Dark bg OK (drawn inside a frame). Half the screen during briefings — this is where good art shows most. |
| `port-op.png` | 400×420 | SWITCHBOARD — female operator, headset + mic, terminal glow. |
| `port-dir.png` | 400×420 | THE DIRECTOR — grey suit, black REDACTED bar over the eyes. |
| `port-rg.png` | 400×420 | REGINA GYATT — silver bob, gold round glasses, teal power suit, smirk. Officially dead since 2011. |
| `guard-top.png` | 128×128 | Guard, top-down, facing RIGHT, rifle forward, tactical vest + cap. |
| `dog-top.png` | 128×128 | K9 unit, top-down, facing RIGHT, harness. |

## TIER 2 — strong upgrades

| file | size | what |
|---|---|---|
| `title-kjp.png` | ~600×760 | Title-screen key art (full-body or dramatic bust, KJP in the rain). Shown right side of title. |
| `logo.png` | ~860×380 | "KJP" wordmark (stencil/spray). Replaces the typed logo. |
| `sentry-top.png` / `officer-top.png` | 128×128 | Guard variants (heavier armor / white shirt + peaked cap). Fall back to guard-top. |
| `civ-top.png` | 128×128 | Analyst, top-down, facing RIGHT — shirt + lanyard + coffee. |
| `kjp-top-sneak.png` | 128×128 | Crouched player variant (wider stance, lower). |
| `kjp-top-fists.png` / `kjp-top-tranq.png` | 128×128 | Pose variants per weapon class (green fists visible!). |
| `tile-yard.png` `tile-lobby.png` `tile-office.png` `tile-archive.png` `tile-vault.png` `tile-roof.png` | 96×96, **seamless-tileable**, opaque | Floor materials (wet grass/asphalt · marble · carpet · wood · metal deck · concrete slab). Keep DARK + low-contrast — lighting/AO draw on top. |
| `wall-yard.png` … `wall-roof.png` | 96×96, opaque | Wall tops per theme. Mid-brightness; engine adds edges + shadows. |

## TIER 3 — garnish

| file | size | what |
|---|---|---|
| `skin-midnight.png` `skin-tux.png` `skin-concierge.png` `skin-ghillie.png` `skin-hightable.png` `skin-excomm.png` `skin-holo.png` | 256×256 | SKINS menu cards (KJP wearing each suit). |
| `kjp-top-<skinid>.png` | 128×128 | In-game per-skin player sprite override (same RIGHT-facing rule). |
| `gun-fists.png` `gun-tranq.png` `gun-p9.png` `gun-smg.png` `gun-n1.png`…`gun-n6.png` | 256×96 | ARSENAL menu weapon renders (side view). n1-n6 = the WICK ARSENAL guns (Boogeyman P30, Continental Vector, Kimber Breacher, TTI Marksman, Excommunicado, Tangential Reaper). |
| `desk.png` / `hedge.png` | 96×96 | Low-cover props (top-down). |
| `rack.png` | 96×32 | Server rack face strip (vault walls). |
| `chopper.png` | 512×256 | Exfil helicopter, top-down, nose RIGHT (rotor drawn by engine). |
| `pick-intel.png` `pick-card.png` `pick-darts.png` `pick-med.png` | 64×64 | Pickup icons (card gets tinted? no — card colors stay procedural if this is provided it's used for ALL colors, skip unless generic). |

## Gen-prompt starters (tune to taste)

- **kjp-top**: "top-down bird's-eye view video game sprite of a frog secret agent,
  green skin, black chin-length hair curtains, black sunglasses, black tactical
  suit, holding pistol two-handed pointing RIGHT, green hands, centered,
  transparent background, clean vector style, 128x128"
- **port-kjp**: "front-facing portrait bust of a frog hitman-lawyer, green skin,
  black hair curtains framing face, black rectangular sunglasses, wide frog
  mouth, black suit white shirt black tie, night-city codec-screen vibe,
  dark background, video game dialogue portrait"
- **tile-vault**: "seamless tileable dark blue-grey metal deck plating texture,
  top-down, subtle rivets, video game floor tile, very dark, low contrast, 96x96"

## Locked DNA (do not drift)

- Face: black hair curtains + shades + green frog muzzle. NEVER redesign.
- Hands/fists: GREEN in every outfit.
- Top-down sprites FACE RIGHT (angle 0); the engine does all rotation.
- World art stays DARK — the lightmap owns brightness.
