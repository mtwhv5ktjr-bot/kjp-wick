/* KJP — 3D WORLD RENDERER (three.js).
 *
 * The game became third-person by swapping ONE thing: how the world is drawn.
 * Nothing in the simulation moved. world.js, ents.js, levels.js, daily.js and
 * deepcover.js contain zero drawing calls and no z-axis — guard AI, LOS, A*,
 * noise, doors, objectives, the Director, gear and scoring are all flat-plane
 * logic that never knew how it was being presented. That is why this is a
 * renderer, not a rewrite.
 *
 * WHY IT RENDERS TO ITS OWN CANVAS AND THEN BLITS:
 * three.js draws into an offscreen WebGL canvas, and r3dFrame() copies that
 * into the 2D canvas before anything else runs. By the time drawThermal,
 * weather, the takedown push-in, the HUD and the whole post chain (grade,
 * vignette, grain, scanlines) execute, the world is just pixels in the 2D
 * context again — so every one of them works untouched. Rendering three.js
 * straight to the visible canvas would have meant rebuilding all of it.
 *
 * COORDINATES: 1 world unit = 1 game pixel, and game (x, y) maps to three
 * (x, height, y). No scaling anywhere, so every number in levels.js, every
 * guard range and every light radius means exactly what it always meant.
 */
"use strict";

const R3D = {
  on: false, ready: false, cv: null, renderer: null, scene: null, cam: null,
  level: -1, walls: null, floor: null, lights: [], ents: new Map(),
  /* Camera tuned from the first render: at 132/96 the shot was the back of
     KJP's head filling the lower third. Further back and higher up puts him in
     the lower-left third and shows the room he is about to walk into, which is
     the whole reason to be in third person. */
  /* KJP stands ~52 units tall. Rooms are ~2.5x a person, and the camera has to
     sit BELOW the ceiling or it looks at the roof — which is exactly what the
     first tuning pass did (camera 158, ceiling 52). */
  wallH: 116, camDist: 172, camHeight: 104, camLag: 0.18, camMin: 96,
  _cx: 0, _cy: 0, _ca: 0
};

/* --------------------------------------------------------------- boot ---- */
function r3dAvailable(){ return typeof THREE !== "undefined"; }

function r3dInit(){
  if (R3D.ready || !r3dAvailable()) return R3D.ready;
  const cv3 = document.createElement("canvas");
  cv3.width = W; cv3.height = H;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: cv3, antialias: true, alpha: false, powerPreference: "high-performance" });
  } catch(e){
    /* No WebGL (old machine, blocked driver, headless). Say so once and let the
       caller fall back to the 2D renderer rather than showing a black screen. */
    console.warn("KJP 3D: WebGL unavailable — " + (e && e.message));
    return false;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(62, W / H, 4, 4200);

  R3D.cv = cv3; R3D.renderer = renderer; R3D.scene = scene; R3D.cam = cam;
  R3D.ready = true;
  return true;
}

/* ------------------------------------------------------------ geometry ---- */
/* Walls are ONE merged instanced mesh, not a mesh per tile. A floor can carry
   ~1400 wall tiles; that many draw calls would cost more than everything else
   in the frame put together. */
function r3dBuildLevel(){
  if (!R3D.ready || !LV) return;
  const S = R3D.scene;
  /* tear down the previous floor — and DISPOSE it. Removing from the scene
     frees nothing on the GPU; textures climbed +3 per floor swap, which in
     DEEP COVER (endless floor swaps) is an unbounded leak. Anything marked
     userData.shared (the material cache, the blob texture, the ghost duct
     material) survives; everything else — actor materials, floor canvases,
     cone geometry — dies with the floor it belonged to. */
  const kill = o => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats){
      if (m.userData && m.userData.shared) continue;
      for (const k of ["map", "normalMap", "roughnessMap", "emissiveMap", "alphaMap"]){
        const t = m[k];
        if (t && !(t.userData && t.userData.shared)) t.dispose();
      }
      m.dispose();
    }
  };
  /* lights are not meshes — the key's shadow render target slips past the
     mesh disposer and leaked one RT per floor swap */
  if (R3D.key && R3D.key.shadow && R3D.key.shadow.map){ R3D.key.shadow.map.dispose(); R3D.key.shadow.map = null; }
  for (const o of [...S.children]){ o.traverse(kill); S.remove(o); }
  R3D.ents.clear(); R3D.lights = []; R3D._plight = null;   // removed with the scene above
  R3D_SHOTS.pool = []; R3D_SHOTS.flash = null; R3D_SHOTS.lastN = 0;
  /* cone meshes were removed from the scene by the loop above — drop the map
     too, or the next floor reuses meshes that are no longer parented */
  R3D_CONES.clear();

  const th = themeOf();
  const wallTop = new THREE.Color(th.wallTop || "#2b3540");
  const floorCol = new THREE.Color(th.floorCol || "#1b222c");

  /* floor: one plane, textured by the SAME prerendered canvas the 2D game
     used, so every material, decal and district grade carries over intact
     instead of being re-authored for 3D */
  const tex = new THREE.CanvasTexture(PRE);
  tex.colorSpace = THREE.SRGBColorSpace || undefined;
  tex.anisotropy = R3D.renderer.capabilities.getMaxAnisotropy();
  const fw = LV.w * T, fh = LV.h * T;
  /* colour from PRE (decals + district grade carry over), normals generated to
     the SAME tile grid PRE painted — grout you can see the light catch */
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(fw, fh),
    new THREE.MeshStandardMaterial({ map: tex, normalMap: r3dFloorNormal(),
      roughness: th.spec ? 0.28 : 0.92, metalness: th.spec ? 0.18 : 0.02 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(fw / 2, 0, fh / 2);
  floor.receiveShadow = true;
  S.add(floor); R3D.floor = floor;

  /* walls */
  /* tileAt is the global accessor; render.js's isWall is a local inside the
     prerender closure and is not visible here. Only "#" is full wall now —
     "V" vents were being built as solid wall, which made them an INVISIBLE
     tunnel: the sneaking player passed through what looked like concrete.
     They are ducts in r3d-world.js instead. */
  const solid = [];
  for (let y = 0; y < LV.h; y++) for (let x = 0; x < LV.w; x++){
    if (tileAt(x, y) === "#") solid.push([x, y]);
  }
  const wg = new THREE.BoxGeometry(T, R3D.wallH, T);
  /* PBR wall material per theme: colour + generated normal map + roughness.
     Each wall box maps the full 0..1 UV, so the texture tiles per-tile —
     which is exactly the scale form seams and panel lines should repeat at.
     Tinted toward the theme's own wall colour so districts stay distinct. */
  const wm = r3dMaterial(MAT_FOR_THEME[LV.def.theme] || "concrete",
                         { color: wallTop.clone().lerp(new THREE.Color(0xffffff), 0.55) });
  const walls = new THREE.InstancedMesh(wg, wm, Math.max(1, solid.length));
  walls.castShadow = true; walls.receiveShadow = true;
  const m4 = new THREE.Matrix4();
  solid.forEach(([x, y], i) => {
    m4.makeTranslation(x * T + T / 2, R3D.wallH / 2, y * T + T / 2);
    walls.setMatrixAt(i, m4);
  });
  walls.instanceMatrix.needsUpdate = true;
  S.add(walls); R3D.walls = walls;

  /* CEILING. Without it the top of frame is an empty void above the wall line —
     the single clearest tell that you are looking at a floor plan with walls
     stood up rather than at an interior. Drawn dark and unlit. */
  /* BackSide only: visible from underneath, invisible from above. If the
     camera ever rides up over a wall the roof must not black out the frame.
     Acoustic-tile material with a repeating grid, so looking up reads as a
     ceiling rather than a void painted grey. */
  const cmat = r3dMaterial("ceiling", { side: THREE.BackSide, color: 0x687484 });
  cmat.map.repeat.set(LV.w / 4, LV.h / 4);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh), cmat);
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(fw / 2, R3D.wallH, fh / 2);
  S.add(ceil);

  /* Fog does the job the 2D vignette used to: it stops sightlines running the
     length of the building and hides the far wall of a 46-tile floor. Tied to
     the theme's own ambient so a dark district fogs closer. */
  S.fog = new THREE.Fog(new THREE.Color(th.gradeLo ? r3dRgb(th.gradeLo) : 0x0a1018),
                        260, 300 + (1 - (th.ambient || 0.8)) * 1400);

  /* Ambient floor of light. The 2D renderer got its darkness from the lightmap;
     here the lights do that, so this only has to stop unlit faces reading as
     pure black. The first pass at (1-ambient)*0.9 left the level unreadable. */
  const amb = new THREE.AmbientLight(0x8fa8c8, 0.55);
  S.add(amb);
  /* a soft key from above so walls have a top-to-bottom gradient and the room
     has a direction, rather than everything being flat point-light falloff.
     IT CASTS. PCFSoftShadowMap has been enabled and every wall, desk and
     actor flagged castShadow since the first 3D commit — with zero lights
     actually casting, which is the single biggest "not a real 3D game" tell.
     A tight ortho frustum FOLLOWS THE PLAYER (re-aimed in r3dCamera, snapped
     to shadow texels so the map never swims); mobile keeps it off by default. */
  const key = new THREE.DirectionalLight(0xbfd4f0, 0.35);
  key.castShadow = !IS_TOUCH && OPT.shadows !== false;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -350; key.shadow.camera.right = 350;
  key.shadow.camera.top = 350; key.shadow.camera.bottom = -350;
  key.shadow.camera.near = 200; key.shadow.camera.far = 1600;
  key.shadow.bias = -0.0005; key.shadow.normalBias = 2;
  key.position.set(fw * 0.3, 900, fh * 0.2);
  S.add(key); S.add(key.target);
  R3D.key = key;
  /* per-theme sun direction, fixed, so shadows agree across the floor */
  R3D.keyOff = th.outdoor ? { x: 260, y: 900, z: 140 } : { x: 150, y: 900, z: 90 };

  /* PMREM ENVIRONMENT. The lobby's marble is authored at roughness 0.28 and
     until now had NOTHING to reflect — glossy materials without an
     environment read as grey plastic. Captured from the level itself (no
     actors exist yet at build time, which is exactly what we want), fog off
     so the far walls don't smear into it. Previous target disposed — Deep
     Cover swaps floors repeatedly and must not leak render targets. */
  try {
    const bakFog = S.fog; S.fog = null;
    const pm = new THREE.PMREMGenerator(R3D.renderer);
    const rt = pm.fromScene(S, 0.04);
    if (R3D._pmremRT) R3D._pmremRT.dispose();
    R3D._pmremRT = rt;
    S.environment = rt.texture;
    pm.dispose();
    S.fog = bakFog;
    /* reflection strength follows the floor's material story: wet/marble
       districts gleam, carpet offices stay matte */
    S.traverse(o => { if (o.isMesh && o.material && "envMapIntensity" in o.material)
      o.material.envMapIntensity = th.spec ? 0.8 : 0.35; });
  } catch(e){ console.warn("PMREM skipped: " + e.message); }

  /* fixtures: the SAME LIGHTS array the 2D renderer built, carrying the colour
     temperature, per-fixture intensity and dead flags from the art pass */
  for (const L of LIGHTS){
    if (L.dead) continue;
    const col = new THREE.Color(r3dLightColor(L, th));
    const pl = new THREE.PointLight(col, (L.inten || 0.75) * 1.5, L.r * 1.35, 1.7);
    pl.position.set(L.x, R3D.wallH * 0.82, L.y);
    pl.userData.src = L;
    S.add(pl); R3D.lights.push(pl);
  }
  /* SNAP the camera to wherever KJP is standing. It is smoothed every frame,
     so without this a new floor opens with the camera at the world origin
     flying across the map to catch up — which reads as a bug, and on a level
     restart after a death it reads as a very bad one. */
  if (P){ R3D._cx = P.x - Math.cos(P.ang) * R3D.camDist; R3D._cy = P.y - Math.sin(P.ang) * R3D.camDist; R3D._ca = P.ang; }
  r3dBuildFurniture();
  r3dBuildProps();
  R3D.level = LV.n;
}

/* The 2D pass stores colours as "rgba(r,g,b," prefixes; reuse them verbatim so
   the two renderers can never drift apart on what a fixture looks like. */
/* "rgba(r,g,b,a)" -> 0xRRGGBB, so theme colours authored for the 2D pass can be
   handed straight to three.js without a second palette to keep in sync. */
function r3dRgb(s){
  const m = /rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(String(s));
  return m ? ((+m[1] << 16) | (+m[2] << 8) | +m[3]) : 0x0a1018;
}
function r3dLightColor(L, th){
  const s = L.col || (L.warm ? th.lampWarm : th.lampCol) || "rgba(255,236,200,";
  const m = /rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (!m) return 0xffecc8;
  return (parseInt(m[1]) << 16) | (parseInt(m[2]) << 8) | parseInt(m[3]);
}

/* ------------------------------------------------------------ actors ------ */
/* KJP and the guards are built from primitives rather than imported models:
   the whole game is procedural, there is no asset pipeline, and the face DNA
   is a hard invariant — black hair curtains, shades, green frog. A downloaded
   model would break that on day one. */
function r3dMakeActor(kind){
  const grp = new THREE.Group();
  const skin = kind === "player" ? 0x66c46a : 0x3a4654;
  const suit = kind === "director" ? 0x0d1016
             : kind === "officer" ? 0xd3d7e0
             : kind === "sentry" ? 0x232e3c
             : kind === "player" ? 0x14181f : 0x2a3442;

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(8.5, 15, 4, 10),
    new THREE.MeshStandardMaterial({ color: suit, roughness: 0.8 }));
  torso.position.y = 26; torso.castShadow = true; grp.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(7.4, 16, 12),
    new THREE.MeshStandardMaterial({ color: kind === "player" ? skin : 0xc9a88a, roughness: 0.7 }));
  head.position.y = 44; head.castShadow = true; grp.add(head);

  if (kind === "player"){
    /* the locked face: hair curtains either side, shades across the front.
       -Z is forward, so the shades sit on -Z. */
    const hair = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.9 });
    for (const sx of [-1, 1]){
      const c = new THREE.Mesh(new THREE.BoxGeometry(2.6, 12, 7.5), hair);
      c.position.set(sx * 6.4, 43, 0.6); grp.add(c);
    }
    const cap = new THREE.Mesh(new THREE.BoxGeometry(13.5, 3.2, 12), hair);
    cap.position.set(0, 50, 0.4); grp.add(cap);
    const shades = new THREE.Mesh(new THREE.BoxGeometry(11.5, 3.4, 1.6),
      new THREE.MeshStandardMaterial({ color: 0x05070a, roughness: 0.25, metalness: 0.5 }));
    shades.position.set(0, 44.5, -6.6); grp.add(shades);
    /* HANDS STAY GREEN. Hard invariant, in every skin, in every renderer. */
    const hand = new THREE.MeshStandardMaterial({ color: 0x66c46a, roughness: 0.75 });
    for (const sx of [-1, 1]){
      const h = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), hand);
      h.position.set(sx * 10, 26, -5); h.name = sx < 0 ? "handL" : "handR";
      grp.add(h);
    }
  } else {
    const vis = new THREE.Mesh(new THREE.BoxGeometry(11, 2.6, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x11151b, roughness: 0.5 }));
    vis.position.set(0, 45, -6.4); grp.add(vis);
  }

  if (kind === "director"){
    /* the red pulse he carries in 2D, as a real light so it washes the room */
    const pulse = new THREE.PointLight(0xff3030, 1.4, 190, 2);
    pulse.position.y = 34; pulse.name = "pulse";
    grp.add(pulse);
  }
  /* TWO-SEGMENT limbs. A single capsule swinging from the hip is a stick;
     a thigh with a shin that flexes at the knee during the swing is a leg.
     Each limb is upper-pivot → upper mesh → lower-pivot (at the joint) →
     lower mesh, all hanging BELOW their origins so rotation swings from the
     joint the way anatomy does. */
  const dark = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.9 });
  const limb = (name, x, y, lu, ll, rad, mat) => {
    const up = new THREE.Object3D();
    up.position.set(x, y, 0); up.name = name;
    const um = new THREE.Mesh(new THREE.CapsuleGeometry(rad, lu, 3, 8), mat);
    um.position.y = -lu / 2; um.castShadow = true; up.add(um);
    const lo = new THREE.Object3D();
    lo.position.y = -lu; lo.name = name + "_lo";
    const lm = new THREE.Mesh(new THREE.CapsuleGeometry(rad * 0.85, ll, 3, 8), mat);
    lm.position.y = -ll / 2; lm.castShadow = true; lo.add(lm);
    up.add(lo); grp.add(up);
    return up;
  };
  limb("legL", -4.2, 18, 8, 8, 3.6, dark);
  limb("legR",  4.2, 18, 8, 8, 3.6, dark);
  const sleeve = new THREE.MeshStandardMaterial({ color: suit, roughness: 0.85 });
  limb("armL", -9.5, 34, 7, 7, 2.9, sleeve);
  const armR = limb("armR", 9.5, 34, 7, 7, 2.9, sleeve);
  /* the weapon rides the right hand — a mount at the end of the forearm.
     r3dSyncEnts swaps the gun mesh in when the sim's weapon changes. */
  const mount = new THREE.Object3D();
  mount.name = "gunMount";
  mount.position.set(0, -8, -1.5);
  armR.getObjectByName("armR_lo").add(mount);
  /* UPPER-BODY GROUP for the crouch. Everything above the hips — torso, head,
     hair, shades, hands, arms — moves as one unit when KJP drops low; legs
     stay planted and take the bend themselves. Collected by height rather
     than by name so guard variants get it for free. */
  const upper = new THREE.Group(); upper.name = "upper";
  for (const ch of [...grp.children])
    if (ch !== upper && ch.name !== "legL" && ch.name !== "legR" && ch.position.y >= 24) upper.add(ch);
  grp.add(upper);
  /* BLOB SHADOW — the cheapest grounding there is: a soft radial dark under
     every actor. When the real shadow map is on it fades to a faint contact
     smudge (real shadows are directional, contact darkness is not — they
     coexist in every AAA title); when shadows are off (mobile) it carries
     the whole job. */
  if (!R3D._blobTex){
    const bc = document.createElement("canvas"); bc.width = bc.height = 64;
    const bg = bc.getContext("2d");
    const bgr = bg.createRadialGradient(32, 32, 4, 32, 32, 30);
    bgr.addColorStop(0, "rgba(0,0,0,0.5)"); bgr.addColorStop(1, "rgba(0,0,0,0)");
    bg.fillStyle = bgr; bg.fillRect(0, 0, 64, 64);
    R3D._blobTex = new THREE.CanvasTexture(bc);
    R3D._blobTex.userData.shared = true;        // one texture for every actor, every floor
  }
  const blob = new THREE.Mesh(new THREE.CircleGeometry(17, 16),
    new THREE.MeshBasicMaterial({ map: R3D._blobTex, transparent: true, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.8;
  blob.renderOrder = 1; blob.name = "blob";
  grp.add(blob);
  return grp;
}

/* Drive the 3D limbs from the SAME stride accumulator and the same stance /
   swing curves as the 2D renderer (_footOffset, _footLift). One source of
   truth for cadence — if the walk is retuned it is retuned everywhere. */
function r3dAnimate(a, ent, moving, aiming, crouchT){
  const stride = ent.stride || 0;
  const c = (((stride % _STEP_CYC) + _STEP_CYC) % _STEP_CYC) / _STEP_CYC;
  /* crouch is SMOOTHED, never snapped — standing up out of a vent in one
     frame reads as a glitch, easing out of it reads as a movement */
  const ck = a.userData.ck = (a.userData.ck || 0) + (((crouchT || 0) - (a.userData.ck || 0)) * 0.16);
  const up = a.getObjectByName("upper");
  if (up){
    up.position.y = -12.5 * ck;                     // ck 1 = crouch, ck 2 = vent crawl
    up.rotation.x = 0.24 * ck;                      // hunch forward over the knees
  }
  const swing = t => moving ? _footOffset(t) * 0.62 : 0;
  const lift  = t => moving ? _footLift(t) * 0.30 : 0;
  const set = (name, t, arm) => {
    const p = a.getObjectByName(name);
    if (!p) return;
    /* NO extra negation here. Arms are already given the opposite leg's phase;
       negating as well cancelled it out and swung each arm in step with the leg
       on its own side, which is the walk of someone carrying a tray. */
    p.rotation.x = swing(t) * (arm ? 0.68 : 1) + (arm ? 0 : -0.48 * ck);
    p.rotation.z = arm ? 0 : lift(t) * 0.4;
    const lo = a.getObjectByName(name + "_lo");
    if (lo){
      /* the knee flexes through the swing and is straight in stance; the elbow
         keeps a small constant bend — locked-straight arms read as a robot.
         RAW _footLift here, not the 0.30-scaled foot drift: reusing the scaled
         value gave a 20-degree knee, which is a limp, not a stride.
         Crouch adds a standing bend to both joints — that squat is what makes
         the lowered body read as legs folding rather than a model sinking. */
      const raw = moving ? _footLift(t) : 0;
      lo.rotation.x = arm ? 0.3 + raw * 0.25 : raw * 0.95 + 0.85 * ck;
    }
  };
  set("legL", c, false);
  set("legR", (c + 0.5) % 1, false);
  /* each arm takes the OPPOSITE leg's phase — that counter-swing is what stops
     a walk reading as a shuffle */
  set("armL", (c + 0.5) % 1, true);
  set("armR", c, true);
  /* AIM overrides the right arm entirely: forward, level, elbow straight, and
     the support hand comes up. -PI/2 about X sends a hanging arm to -Z, which
     is the way the model faces. */
  if (aiming){
    const ar = a.getObjectByName("armR"), arLo = a.getObjectByName("armR_lo");
    const al = a.getObjectByName("armL"), alLo = a.getObjectByName("armL_lo");
    if (ar){ ar.rotation.x = -Math.PI / 2 + 0.06; ar.rotation.z = 0; }
    if (arLo) arLo.rotation.x = 0.04;
    if (al){ al.rotation.x = -Math.PI / 2 + 0.34; al.rotation.z = 0.5; }
    if (alLo) alLo.rotation.x = 0.5;
  }
  /* the same two-per-cycle weight transfer the 2D body bob uses */
  a.position.y += moving ? Math.sin(stride / _STEP_CYC * TAU * 2) * 0.9 : 0;
}

/* --------------------------------------------------------- furniture ----- */
/* Doors and interactables existed only as marks painted into the floor
   texture, which is fine looking straight down and useless in perspective: a
   closed door was invisible, and there was no way to see what to hack, take or
   walk out of. These are the objects the game is actually ABOUT. */
const R3D_FURN = { doors: [], items: [] };
const DOOR_COL = { D: 0x6b7684, Y: 0xd8c24a, B: 0x4a8fd8, R: 0xd85a4a, C: 0x8a5ad8 };

function r3dBuildFurniture(){
  const S = R3D.scene;
  R3D_FURN.doors = []; R3D_FURN.items = [];

  for (const d of LV.doors){
    const col = DOOR_COL[d.kind] || 0x6b7684;
    /* thin along its own axis, a full tile across the opening */
    const geo = d.vertical ? new THREE.BoxGeometry(9, R3D.wallH - 4, T)
                           : new THREE.BoxGeometry(T, R3D.wallH - 4, 9);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: col, roughness: 0.55, metalness: 0.35, emissive: col, emissiveIntensity: 0.10 }));
    m.castShadow = true;
    m.userData.d = d;
    m.userData.home = { x: d.x * T + T / 2, y: (R3D.wallH - 4) / 2, z: d.y * T + T / 2 };
    m.position.set(m.userData.home.x, m.userData.home.y, m.userData.home.z);
    S.add(m); R3D_FURN.doors.push(m);
  }

  /* one shape language: everything you can USE stands up off the floor and
     glows its own colour, so a terminal never reads as a filing cabinet */
  const item = (x, y, geo, col, h, ref, kind) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 0.85, roughness: 0.4 }));
    m.position.set(x, h, y);
    m.userData = { ref, kind, baseY: h };
    S.add(m); R3D_FURN.items.push(m);
    /* a small light so it is findable in a dark room from across it */
    const l = new THREE.PointLight(col, 0.5, 150, 2);
    l.position.set(x, h + 10, y);
    m.userData.light = l; S.add(l);
    return m;
  };
  for (const t of LV.terms)
    item(t.x * T + T / 2, t.y * T + T / 2, new THREE.BoxGeometry(20, 26, 14), 0x5ab4ff, 15, t, "term");
  for (const f of LV.files)
    item(f.x * T + T / 2, f.y * T + T / 2, new THREE.BoxGeometry(18, 22, 12), 0xffd27c, 13, f, "file");
  for (const e of LV.exits)
    item(e.x * T + T / 2, e.y * T + T / 2, new THREE.CylinderGeometry(12, 12, 46, 12), 0x7cf9a5, 24, e, "exit");
  for (const p of LV.picks){
    const col = p.k === "intel" ? 0xff9d5b : p.k === "med" ? 0xff6b8a
              : p.k === "darts" ? 0x9ee6ff : (p.card === "y" ? 0xd8c24a : p.card === "b" ? 0x4a8fd8 : 0xd85a4a);
    item(p.x * T + T / 2, p.y * T + T / 2, new THREE.BoxGeometry(11, 11, 11), col, 18, p, "pick");
  }
  for (const pn of LV.panels)
    item(pn.x * T + T / 2, pn.y * T + T / 2, new THREE.BoxGeometry(16, 20, 10), 0xff6b6b, 12, pn, "panel");
}

function r3dSyncFurniture(){
  for (const m of R3D_FURN.doors){
    const d = m.userData.d, h = m.userData.home;
    if (d.broken){ m.visible = false; continue; }
    m.visible = true;
    /* slide into the jamb as it opens — the same 0..1 the sim already tracks,
       so what you see is exactly what blocks sight and movement */
    const slide = (d.open || 0) * (T - 4);
    if (d.vertical) m.position.set(h.x, h.y, h.z + slide);
    else m.position.set(h.x + slide, h.y, h.z);
  }
  const t = performance.now() / 1000;
  for (const m of R3D_FURN.items){
    const r = m.userData.ref, k = m.userData.kind;
    let show = true, spin = 0;
    if (k === "pick"){ show = !r.got; spin = 1; }
    else if (k === "term"){ show = true; m.material.emissiveIntensity = r.done ? 0.25 : 0.85; }
    else if (k === "file"){ show = !LV.file; spin = 0.6; }
    else if (k === "panel"){ show = !r.pulled; }
    else if (k === "exit"){
      /* the way out only lights up once it will actually open for you */
      const open = (LV.hacks >= (LV.def.hacksNeed || 0) && (!LV.def.fileNeed || LV.file)) || LV.def.exfil;
      m.material.emissiveIntensity = open ? 1.0 : 0.18;
      if (m.userData.light) m.userData.light.intensity = open ? 0.9 : 0.12;
    }
    m.visible = show;
    if (m.userData.light) m.userData.light.visible = show;
    if (spin){ m.rotation.y = t * spin; m.position.y = m.userData.baseY + Math.sin(t * 2.2) * 2.5; }
  }
}

/* ---------------------------------------------------------- gunfire ------ */
/* A shooter where you cannot see the shots. LV.bullets and LV.darts were drawn
   by the 2D pass and nothing replaced them, so a firefight was silent flashes
   on the HUD and hearts disappearing. Tracers are drawn from a fixed POOL —
   allocating a mesh per bullet during a firefight is exactly when you cannot
   afford the garbage. */
const R3D_SHOTS = { pool: [], flash: null, flashT: 0, lastN: 0 };
function r3dTracer(i){
  if (R3D_SHOTS.pool[i]) return R3D_SHOTS.pool[i];
  const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  m.renderOrder = 3;
  R3D_SHOTS.pool[i] = m; R3D.scene.add(m);
  return m;
}
function r3dSyncShots(dt){
  const all = (LV.bullets || []).concat(LV.darts || []);
  for (let i = 0; i < R3D_SHOTS.pool.length; i++) if (R3D_SHOTS.pool[i]) R3D_SHOTS.pool[i].visible = false;
  all.forEach((b, i) => {
    if (i > 63) return;
    const m = r3dTracer(i);
    const sp = Math.hypot(b.vx, b.vy) || 1;
    /* stretched along travel so it reads as a streak, not a floating pellet */
    const len = Math.min(46, sp * 0.055 + 12);
    m.scale.set(2.2, 2.2, len);
    m.position.set(b.x, 26, b.y);
    m.rotation.set(0, Math.atan2(b.vx, b.vy), 0);
    m.material.color.setHex(b.dart ? 0x9ee6ff : b.fromPlayer ? 0xbfffd0 : 0xffb46b);
    m.visible = true;
  });
  /* MUZZLE FLASH: a new bullet this frame means someone fired. One light for
     all of them — a firefight does not need eight lights, it needs one that
     punches. */
  if (!R3D_SHOTS.flash){
    R3D_SHOTS.flash = new THREE.PointLight(0xffd9a0, 0, 260, 2);
    R3D.scene.add(R3D_SHOTS.flash);
  }
  if (all.length > R3D_SHOTS.lastN){
    const b = all[all.length - 1];
    R3D_SHOTS.flash.position.set(b.x, 30, b.y);
    R3D_SHOTS.flashT = 0.06;
  }
  R3D_SHOTS.lastN = all.length;
  R3D_SHOTS.flashT = Math.max(0, R3D_SHOTS.flashT - (dt || 1 / 60));
  R3D_SHOTS.flash.intensity = R3D_SHOTS.flashT > 0 ? 5.5 : 0;
}

/* ------------------------------------------------------------- cones ----- */
/* THE most important thing in the 3D view. Top-down, a guard's vision cone was
   drawn as a floor polygon and every decision the player made came from
   reading them. In perspective they cannot be a screen-space overlay any more,
   so they become real floor geometry: the SAME conePoly() the 2D renderer
   used, laid flat just above the ground, additive, coloured by the guard's
   state. Without this the game is a shooter with invisible rules. */
const R3D_CONES = new Map();
function r3dConeMesh(key){
  let m = R3D_CONES.get(key);
  if (m) return m;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3 * 3 * 40), 3));
  const mat = new THREE.MeshBasicMaterial({ color: 0x9ee6ff, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  R3D_CONES.set(key, m); R3D.scene.add(m);
  return m;
}
/* fan of triangles from the eye out to each ray hit — the polygon is already
   clipped to walls, so the cone stops at cover exactly as the guard's sight does */
function r3dConeFill(mesh, ox, oy, pts, col, alpha){
  const pos = mesh.geometry.attributes.position;
  const n = Math.min(pts.length - 1, 39);
  let i = 0;
  for (let k = 0; k < n; k++){
    const a = pts[k], b = pts[k + 1];
    pos.array[i++] = ox;   pos.array[i++] = 1.6; pos.array[i++] = oy;
    pos.array[i++] = a[0]; pos.array[i++] = 1.6; pos.array[i++] = a[1];
    pos.array[i++] = b[0]; pos.array[i++] = 1.6; pos.array[i++] = b[1];
  }
  while (i < pos.array.length) pos.array[i++] = 0;
  pos.needsUpdate = true;
  mesh.geometry.setDrawRange(0, n * 3);
  mesh.material.color.setHex(col);
  mesh.material.opacity = alpha;
  mesh.visible = true;
}
function r3dSyncCones(){
  const seen = new Set();
  /* from crawl height the floor cones fill the whole view — halve them in a
     vent so they read as light on the floor, not as green walls */
  const vk = R3D._inVent ? 0.5 : 1;
  const state = e => (e.st === "alert" || e.detect >= 1) ? [0xff4646, 0.30 * vk]
                   : (e.st === "susp" || e.detect > 0.45) ? [0xffbe46, 0.26 * vk]
                   : [0x9ee6ff, 0.15 * vk];
  for (let i = 0; i < LV.guards.length; i++){
    const e = LV.guards[i];
    if (down(e)) continue;
    const key = "g" + i; seen.add(key);
    const range = e.range * (skinDef().detectMul || 1);
    const [c, a] = state(e);
    r3dConeFill(r3dConeMesh(key), e.x, e.y, conePoly(e, range, e.fov, 22), c, a);
  }
  for (let i = 0; i < LV.cams.length; i++){
    const e = LV.cams[i];
    if (e.dead) continue;
    const key = "c" + i; seen.add(key);
    const [c, a] = state(e);
    r3dConeFill(r3dConeMesh(key), e.x, e.y, conePoly(e, e.range, 0.55, 16), c, a);
  }
  for (const [k, m] of R3D_CONES) if (!seen.has(k)) m.visible = false;
}

/* KJP'S OWN LIGHT.
   The 2D renderer punched a 250-radius pool at the player every single frame —
   lmLight(P.x, P.y, 250, 0.86) — and that pool is what made a dark floor
   playable. Porting the fixtures but not this left THE ARCHIVES an unreadable
   black frame. It is a light on him, not a torch: no cone, no direction, so it
   does not become a second aiming mechanic. */
function r3dPlayerLight(){
  if (!R3D._plight){
    R3D._plight = new THREE.PointLight(0xd8e6ff, 1.5, 340, 1.6);
    R3D.scene.add(R3D._plight);
  }
  const l = R3D._plight;
  if (!P || P.dead){ l.visible = false; return; }
  l.visible = true;
  l.position.set(P.x, 54, P.y);
  /* dimmer while sneaking: the light is his own presence, and crouching in the
     dark should LOOK darker as well as read as safer on the HUD */
  l.intensity = P.sneak ? 0.95 : 1.5;
}

function r3dSyncEnts(){
  const S = R3D.scene, seen = new Set();
  const put = (key, kind, x, y, ang, down, extra, ent, moving, gunCls, aiming) => {
    seen.add(key);
    let a = R3D.ents.get(key);
    if (!a){ a = r3dMakeActor(kind); R3D.ents.set(key, a); S.add(a); }
    /* weapon in hand — swapped only when the sim's weapon actually changes */
    const mount = a.getObjectByName("gunMount");
    if (mount && a.userData.gunCls !== gunCls){
      while (mount.children.length) mount.remove(mount.children[0]);
      if (gunCls) mount.add(r3dGunMesh(gunCls));
      a.userData.gunCls = gunCls;
    }
    a.position.set(x, 0, y);
    if (ent && !down) r3dAnimate(a, ent, !!moving, !!aiming && !!gunCls, ent.isPlayer ? (P.sneak ? (R3D._inVent ? 2 : 1) : 0) : 0);
    /* game angle 0 = +x; the model faces -Z. */
    a.rotation.y = -ang + Math.PI / 2;
    a.visible = true;
    /* downed bodies lie on the floor — the clearest possible read that a guard
       is out, which matters because dragging and hiding them is a mechanic */
    a.rotation.z = down ? Math.PI / 2 * 0.92 : 0;
    a.position.y = down ? 6 : 0;
    const blob = a.getObjectByName("blob");
    if (blob){
      blob.visible = !down;
      blob.material.opacity = (R3D.key && R3D.key.castShadow) ? 0.35 : 0.85;
    }
    if (extra) extra(a);
  };

  if (P && !P.dead){
    /* KJP carries what the sim says he carries; he raises it when it has just
       been fired — permanent shoulder-aim reads stiff on a stealth walk */
    const cls = r3dGunClass(curWid());
    put("P", "player", P.x, P.y, P.ang, false, null, P, P.moving, cls, P.fireT > 0);
  }
  for (const e of LV.guards) put("g" + LV.guards.indexOf(e), e.kind, e.x, e.y, e.ang, down(e), a => {
    const pulse = a.getObjectByName("pulse");
    if (pulse) pulse.intensity = down(e) ? 0 : 1.0 + Math.sin(performance.now() / 260) * 0.5;
    /* held up = hands straight overhead — the universal silhouette, readable
       across the whole room, which is what makes the verb feel earned */
    if (e.st === "heldup"){
      for (const nm of ["armL", "armR"]){
        const p = a.getObjectByName(nm);
        if (p){ p.rotation.x = Math.PI - 0.35; p.rotation.z = nm === "armL" ? 0.25 : -0.25; }
        const lo = a.getObjectByName(nm + "_lo");
        if (lo) lo.rotation.x = -0.15;
      }
    }
  }, e, !!(e.path && e.pathI < e.path.length),
     e.gun === "smg" ? "smg" : "pistol", e.st === "alert");
  for (const e of LV.dogs) put("d" + LV.dogs.indexOf(e), "dog", e.x, e.y, e.ang, down(e), null, e, !!e.path);
  for (const e of LV.civs) put("c" + LV.civs.indexOf(e), "civ", e.x, e.y, e.ang, down(e), null, e, !!e.path);

  for (const [k, a] of R3D.ents) if (!seen.has(k)) a.visible = false;
}

/* ------------------------------------------------------------- frame ------ */
/* Over the shoulder: behind and above KJP, looking slightly ahead of him.
   Position is smoothed but AIM is not — the camera may lag, the crosshair
   never does, or shooting feels like it is fighting you. */
function r3dCamera(){
  const cam = R3D.cam;
  const aim = P ? P.ang : 0;
  R3D._ca += angDiff(R3D._ca, aim) * R3D.camLag;
  /* CAMERA COLLISION. Parking the camera a fixed distance behind the player
     buries it in the wall behind him every time his back is to one, and the
     frame becomes the flat inside of a box. Cast backwards from KJP and stop
     short of whatever it hits — the same ray() the guards see with, so the
     camera can never be somewhere the world says is solid. */
  /* STANCE-AWARE FRAMING. Height, distance and FOV follow what the body is
     doing: crawling a duct pulls the camera down inside the run, sneak lowers
     and tightens it, running widens the lens. All smoothed — a camera that
     snaps between stances is worse than one that never moves. */
  const inVent = R3D._inVent;
  const tgt = inVent ? { up: 30, back: 62, fov: 56 }
            : P.sneak ? { up: 80, back: 148, fov: 58 }
            : P.runHeld && P.moving ? { up: 108, back: 184, fov: 67 }
            : { up: R3D.camHeight, back: R3D.camDist, fov: 62 };
  R3D._upS = (R3D._upS || R3D.camHeight) + (tgt.up - (R3D._upS || R3D.camHeight)) * 0.10;
  R3D._backS = (R3D._backS || R3D.camDist) + (tgt.back - (R3D._backS || R3D.camDist)) * 0.10;
  if (Math.abs(cam.fov - tgt.fov) > 0.05){ cam.fov += (tgt.fov - cam.fov) * 0.08; cam.updateProjectionMatrix(); }

  const behind = R3D._ca + Math.PI;
  const hit = ray(P.x, P.y, behind, R3D._backS + 26);
  /* never closer than camMin — a hard pull-in against a wall behind KJP put the
     lens inside his head. Below this the camera rises instead, looking over him
     rather than through him. EXCEPT inside a duct: every neighbouring vent
     tile blocks sight, so the ray stops instantly and the clamp would shove
     the camera back through the metal. The cutaway makes the close camera
     legal there. */
  const back = inVent ? R3D._backS : Math.max(R3D.camMin, Math.min(R3D._backS, hit - 26));
  const up = R3D._upS;

  /* the shadow frustum rides with KJP, snapped to texel increments — without
     the snap every step makes the whole shadow map shimmer */
  if (R3D.key){
    const texel = 700 / 1024;
    const sx = Math.round(P.x / texel) * texel, sz = Math.round(P.y / texel) * texel;
    R3D.key.position.set(sx + R3D.keyOff.x, R3D.keyOff.y, sz + R3D.keyOff.z);
    R3D.key.target.position.set(sx, 0, sz);
    R3D.key.target.updateMatrixWorld();
    R3D.key.castShadow = !IS_TOUCH && OPT.shadows !== false;
  }
  const tx = P.x - Math.cos(R3D._ca) * back;
  const ty = P.y - Math.sin(R3D._ca) * back;
  R3D._cx += (tx - R3D._cx) * 0.22;
  R3D._cy += (ty - R3D._cy) * 0.22;

  /* the takedown beat dollies IN — the 2D push-in scaled the finished frame,
     which would only zoom the HUD now that the world lives on another canvas */
  let dolly = 0;
  if (typeof TD !== "undefined" && TD.t > 0){
    const p = 1 - TD.t / TD.dur;
    dolly = Math.sin(Math.min(1, p * 1.5) * Math.PI) * 46;
  }
  cam.position.set(R3D._cx + Math.cos(R3D._ca) * dolly, up - dolly * 0.25, R3D._cy + Math.sin(R3D._ca) * dolly);
  /* Aim just ahead of and ABOVE him, not 120 units past his feet — that framed
     the floor and pushed KJP into the corner of frame. Chest height keeps him
     at lower-centre with the room he is walking into filling the shot, which
     is the only framing that makes third person worth having. */
  if (!R3D._la) R3D._la = new THREE.Vector3();
  /* look height follows the stance too — a crawl looks along the duct floor */
  R3D._la.set(P.x + Math.cos(aim) * 58, inVent ? 20 : P.sneak ? 36 : 46, P.y + Math.sin(aim) * 58);
  cam.lookAt(R3D._la);
  if (shakeT > 0 && OPT.shake){
    cam.position.x += (rnd() - 0.5) * shakeAmp * 1.6;
    cam.position.z += (rnd() - 0.5) * shakeAmp * 1.6;
  }
}

/* WebGL has a hard limit on lights per draw. A floor carries 40-60 fixtures, so
   only the nearest handful stay switched on — the rest are off, not deleted, so
   walking toward them turns them back on with no rebuild. */
function r3dCullLights(){
  const px = P ? P.x : 0, py = P ? P.y : 0;
  const near = R3D.lights
    .map(l => ({ l, d: (l.position.x - px) ** 2 + (l.position.z - py) ** 2 }))
    .sort((a, b) => a.d - b.d);
  near.forEach((n, i) => {
    const src = n.l.userData.src;
    let on = i < 14;
    if (on && src && src.dead) on = false;
    n.l.visible = on;
    if (on && src){
      let a = src.inten || 0.75;
      if (src.flick && Math.sin(performance.now() / 90 + src.x) > 0.86) a *= 0.4;
      n.l.intensity = a * 1.5;
    }
  });
}

function r3dFrame(){
  if (!R3D.ready && !r3dInit()) { R3D.on = false; return false; }
  if (!LV) return false;
  if (R3D.level !== LV.n || !R3D.walls) r3dBuildLevel();
  R3D._inVent = !!(P && tileAt(Math.floor(P.x / T), Math.floor(P.y / T)) === "V");
  r3dSyncEnts();
  r3dSyncFurniture();
  r3dSyncProps();
  r3dSyncDecals();
  r3dSyncShots();
  r3dSyncCones();
  r3dPlayerLight();
  r3dCullLights();
  r3dCamera();
  /* AFTER the camera moves, not before: unprojecting the cursor through last
     frame's matrix left a visible gap between the reticle and the true aim
     point while the camera eased. One frame of input latency is the standard
     price every engine pays; a lying crosshair is not. */
  r3dMouseWorld();
  R3D.renderer.render(R3D.scene, R3D.cam);
  /* …and now it is just pixels in the 2D canvas again, so thermal, cone tints,
     weather, the HUD and the entire post chain run exactly as they always did */
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, W, H);
  g.drawImage(R3D.cv, 0, 0, W, H);
  return true;
}

/* WHERE THE SHOT LANDS, in screen space.
   Top-down, the barrel pointed at the cursor and that was the whole aiming
   story. In perspective the muzzle line and the screen centre are different
   places, so the crosshair has to be projected from the world: cast the
   weapon's own ray, take the point it stops at, and put the reticle there.
   Anything else is a crosshair that lies about where you are shooting. */
/* WHERE THE MOUSE POINTS, in world space.
   Aiming used to map the cursor through the top-down camera (camX + MOUSE.x),
   which in perspective is a different place from where the cursor visibly sits
   — aim drifted from the reticle the further you looked. Unproject the cursor
   ray through the REAL camera and intersect the aim plane at chest height.
   The sim consumes this instead of the 2D mapping whenever 3D is on. */
function r3dMouseWorld(){
  if (!R3D.on || !R3D.cam || !LV) { R3D.aimWorld = null; return; }
  const nx = (MOUSE.x / W) * 2 - 1, ny = -((MOUSE.y / H) * 2 - 1);
  if (!R3D._mrayO){ R3D._mrayO = new THREE.Vector3(); R3D._mrayD = new THREE.Vector3(); }
  /* FRESH matrix, not whatever render() left behind. matrixWorld only updates
     inside render, so unprojecting here used last frame's camera — and because
     aim feeds the camera which feeds aim, that one-frame error became a
     PERMANENT 48px limit cycle between the reticle and the true aim point
     rather than damping out. */
  R3D.cam.updateMatrixWorld(true);
  R3D._mrayO.setFromMatrixPosition(R3D.cam.matrixWorld);
  R3D._mrayD.set(nx, ny, 0.5).unproject(R3D.cam).sub(R3D._mrayO).normalize();
  const t = (24 - R3D._mrayO.y) / R3D._mrayD.y;          // aim plane = bullet height
  if (!isFinite(t) || t <= 0){ R3D.aimWorld = null; return; }
  R3D.aimWorld = { x: R3D._mrayO.x + R3D._mrayD.x * t,
                   y: R3D._mrayO.z + R3D._mrayD.z * t };
}

const _aimV = { v: null };
function r3dAimScreen(){
  if (!R3D.on || !R3D.cam || !P || !LV) return null;
  if (!_aimV.v) _aimV.v = new THREE.Vector3();
  const d = ray(P.x, P.y, P.ang, 900);
  _aimV.v.set(P.x + Math.cos(P.ang) * d, 24, P.y + Math.sin(P.ang) * d);
  _aimV.v.project(R3D.cam);
  if (_aimV.v.z > 1) return null;                     // behind the camera
  return { x: (_aimV.v.x * 0.5 + 0.5) * W, y: (-_aimV.v.y * 0.5 + 0.5) * H, dist: d };
}

/* Turn it on unless the machine cannot do it, or the player asked for the old
   view with ?view=2d. A black screen is worse than a top-down game. */
function r3dBoot(){
  if (/[?&]view=2d/.test(location.search)) { R3D.on = false; return; }
  R3D.on = r3dAvailable() && r3dInit();
  if (!R3D.on) console.warn("KJP: falling back to the 2D renderer");
  else r3dProbeOverrides();          // dropped-in texture maps take over async
}
