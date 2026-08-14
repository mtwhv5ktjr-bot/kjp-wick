# Texture drop-folder

Drop PBR maps here and the 3D renderer uses them INSTEAD of its procedural
textures — no code changes, picked up on next load.

Naming (any subset per material is fine — missing maps stay procedural):

    <name>_color.png    the albedo / diffuse map
    <name>_normal.png   tangent-space normal map (OpenGL convention, +Y up)
    <name>_rough.png    roughness (white = matte, black = mirror)

Material names in use:

    concrete   THE FENCE + THE ROOF walls
    marble     THE LOBBY walls
    drywall    CUBICLE FARM + THE ARCHIVES walls
    metal      THE VAULT walls
    ceiling    every ceiling
    floor      reserved (floor colour comes from the game's own painted canvas)

Square power-of-two sizes (256/512/1024) tile best. AI-generated maps work —
ask for "seamless tiling <material> texture, color/normal/roughness maps".
