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
  /* tear down the previous floor — a level change must not leak meshes */
  for (const o of [...S.children]) S.remove(o);
  R3D.ents.clear(); R3D.lights = []; R3D._plight = null;   // removed with the scene above
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
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(fw, fh),
    new THREE.MeshStandardMaterial({ map: tex, roughness: th.spec ? 0.28 : 0.92, metalness: th.spec ? 0.18 : 0.02 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(fw / 2, 0, fh / 2);
  floor.receiveShadow = true;
  S.add(floor); R3D.floor = floor;

  /* walls */
  /* tileAt is the global accessor; render.js's isWall is a local inside the
     prerender closure and is not visible here. "#" is wall, "V" is a vent
     block — both are solid geometry you cannot see or walk through. */
  const solid = [];
  for (let y = 0; y < LV.h; y++) for (let x = 0; x < LV.w; x++){
    const c = tileAt(x, y);
    if (c === "#" || c === "V") solid.push([x, y]);
  }
  const wg = new THREE.BoxGeometry(T, R3D.wallH, T);
  const wm = new THREE.MeshStandardMaterial({ color: wallTop, roughness: 0.95, metalness: 0.03 });
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
     camera ever rides up over a wall the roof must not black out the frame. */
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(fw, fh),
    new THREE.MeshStandardMaterial({ color: 0x0a0e14, roughness: 1, side: THREE.BackSide }));
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
     has a direction, rather than everything being flat point-light falloff */
  const key = new THREE.DirectionalLight(0xbfd4f0, 0.35);
  key.position.set(fw * 0.3, 900, fh * 0.2);
  S.add(key);

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
  /* Separate limbs so the walk cycle can actually be animated. They pivot from
     the hip/shoulder, so each is built inside a pivot group with the mesh
     hanging BELOW the origin — rotating the group then swings the limb from
     the top the way a leg swings, instead of spinning it about its middle. */
  const dark = new THREE.MeshStandardMaterial({ color: 0x11151c, roughness: 0.9 });
  const limb = (name, x, y, len, rad, mat) => {
    const pivot = new THREE.Object3D();
    pivot.position.set(x, y, 0); pivot.name = name;
    const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(rad, len, 3, 8), mat);
    mesh.position.y = -len / 2; mesh.castShadow = true;
    pivot.add(mesh); grp.add(pivot);
    return pivot;
  };
  limb("legL", -4.2, 18, 14, 3.6, dark);
  limb("legR",  4.2, 18, 14, 3.6, dark);
  const sleeve = new THREE.MeshStandardMaterial({ color: suit, roughness: 0.85 });
  limb("armL", -9.5, 34, 12, 2.9, sleeve);
  limb("armR",  9.5, 34, 12, 2.9, sleeve);
  return grp;
}

/* Drive the 3D limbs from the SAME stride accumulator and the same stance /
   swing curves as the 2D renderer (_footOffset, _footLift). One source of
   truth for cadence — if the walk is retuned it is retuned everywhere. */
function r3dAnimate(a, ent, moving){
  const stride = ent.stride || 0;
  const c = (((stride % _STEP_CYC) + _STEP_CYC) % _STEP_CYC) / _STEP_CYC;
  const swing = t => moving ? _footOffset(t) * 0.62 : 0;
  const lift  = t => moving ? _footLift(t) * 0.30 : 0;
  const set = (name, t, arm) => {
    const p = a.getObjectByName(name);
    if (!p) return;
    /* NO extra negation here. Arms are already given the opposite leg's phase;
       negating as well cancelled it out and swung each arm in step with the leg
       on its own side, which is the walk of someone carrying a tray. */
    p.rotation.x = swing(t) * (arm ? 0.68 : 1);
    p.rotation.z = arm ? 0 : lift(t) * 0.4;
  };
  set("legL", c, false);
  set("legR", (c + 0.5) % 1, false);
  /* each arm takes the OPPOSITE leg's phase — that counter-swing is what stops
     a walk reading as a shuffle */
  set("armL", (c + 0.5) % 1, true);
  set("armR", c, true);
  /* the same two-per-cycle weight transfer the 2D body bob uses */
  a.position.y += moving ? Math.sin(stride / _STEP_CYC * TAU * 2) * 0.9 : 0;
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
  const state = e => (e.st === "alert" || e.detect >= 1) ? [0xff4646, 0.30]
                   : (e.st === "susp" || e.detect > 0.45) ? [0xffbe46, 0.26]
                   : [0x9ee6ff, 0.15];
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
  const put = (key, kind, x, y, ang, down, extra, ent, moving) => {
    seen.add(key);
    let a = R3D.ents.get(key);
    if (!a){ a = r3dMakeActor(kind); R3D.ents.set(key, a); S.add(a); }
    a.position.set(x, 0, y);
    if (ent && !down) r3dAnimate(a, ent, !!moving);
    /* game angle 0 = +x; the model faces -Z. */
    a.rotation.y = -ang + Math.PI / 2;
    a.visible = true;
    /* downed bodies lie on the floor — the clearest possible read that a guard
       is out, which matters because dragging and hiding them is a mechanic */
    a.rotation.z = down ? Math.PI / 2 * 0.92 : 0;
    a.position.y = down ? 6 : 0;
    if (extra) extra(a);
  };

  if (P && !P.dead) put("P", "player", P.x, P.y, P.ang, false, null, P, P.moving);
  for (const e of LV.guards) put("g" + LV.guards.indexOf(e), e.kind, e.x, e.y, e.ang, down(e), a => {
    const pulse = a.getObjectByName("pulse");
    if (pulse) pulse.intensity = down(e) ? 0 : 1.0 + Math.sin(performance.now() / 260) * 0.5;
  }, e, !!(e.path && e.pathI < e.path.length));
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
  const behind = R3D._ca + Math.PI;
  const hit = ray(P.x, P.y, behind, R3D.camDist + 26);
  /* never closer than camMin — a hard pull-in against a wall behind KJP put the
     lens inside his head. Below this the camera rises instead, looking over him
     rather than through him. */
  const back = Math.max(R3D.camMin, Math.min(R3D.camDist, hit - 26));
  const up = R3D.camHeight;
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
  R3D._la.set(P.x + Math.cos(aim) * 58, 46, P.y + Math.sin(aim) * 58);
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
  r3dSyncEnts();
  r3dSyncCones();
  r3dPlayerLight();
  r3dCullLights();
  r3dCamera();
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
}
