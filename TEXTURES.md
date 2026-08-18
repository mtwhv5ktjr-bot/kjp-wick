# TEXTURES — what to hand me, and exactly where it goes

Drop PNGs into `assets/tex/`. **No code changes.** The game probes for them on
load; anything present overrides the procedural material, anything absent keeps
the generated one. Verified end-to-end 2026-08-14 with a synthetic checker —
it appeared on every lobby wall the moment the file existed.

## Naming — this is the whole contract

```
assets/tex/<material>_color.png     albedo / base colour   (sRGB)
assets/tex/<material>_normal.png    tangent-space normal   (linear, OpenGL +Y up)
assets/tex/<material>_rough.png     roughness, white=rough (linear, greyscale)
```

Any subset works — colour alone is fine; the game keeps its generated normal
and roughness under it.

## The six material slots and where each one shows

| material   | used on                                        | wants to feel like                       |
|------------|------------------------------------------------|------------------------------------------|
| `marble`   | THE LOBBY walls                                | polished stone, veined, glossy           |
| `drywall`  | CUBICLE FARM + THE ARCHIVES walls              | painted institutional wall, matte, scuffed |
| `concrete` | THE FENCE (yard) + THE ROOF walls              | poured concrete, weathered, wet          |
| `metal`    | THE VAULT walls                                | brushed / riveted steel, dark            |
| `ceiling`  | every ceiling                                  | drop-tile / dark panel                   |
| `floor`    | reserved — floors currently use the 2D bake    | (leave for now)                          |

## Spec — keep to this and it will look right first try

- **Square, power of two: 512×512 or 1024×1024.** 1024 is the sweet spot for
  walls; anything larger costs VRAM on phones for no visible gain at this
  camera distance.
- **Seamlessly tileable.** Walls tile a 512-unit repeat; a seam will show as a
  grid across the whole floor. Test by wrapping the image on itself.
- **Neutral lighting baked OUT.** No shadows, no highlights, no directional
  light in the albedo — the game lights it. A texture with a light baked in
  will fight the real lights and look wrong from every angle but one.
- **Mid-value albedo.** Aim for the average brightness around 40-55%. The
  cyberpunk relight runs ACES at 1.55 exposure — a bright albedo will blow
  out under the neon; a very dark one will read as a hole.
- **Normal maps: OpenGL convention** (green = up). If your tool exports
  DirectX (green = down), invert the green channel or the surface will look
  inside-out under the moving player light.
- **Roughness: greyscale, white = rough.** Marble ~0.25 (dark), concrete
  ~0.9 (light). Wet floors/roof read best around 0.3-0.4.

## Also welcome (already wired, same drop-folder pattern)

- `assets/` sprites: the 2D pass and the character portraits already load
  `assets/<name>.png` overrides — see assets/README.md.
- Cards / gear art: `assets/gear-cards.png` is the mint art; a redraw slots in.

## What I do NOT need from you

Character models, animations, props, weapons, decals, UI — all procedural
and already built. Only surface textures materially change the look now.

## Sanity check after dropping files

Open the game with `?perf=1` and load THE LOBBY. If a texture is picked up,
the walls change; if not, the console shows a 404 for the missing name (a
404 for names you did not provide is normal — the folder ships empty).
