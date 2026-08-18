/* KJP — 3D WORLD DRESSING: furniture, glass, cameras, decals, weapons.
 *
 * Everything here mirrors sim state that already existed — nothing is
 * decorative-only. The "-" desk tiles are the game's low cover, the "=" panes
 * are its shatterable glass, LV.cams are its shootable cameras, LV.decals its
 * blood, LV.wallHits its bullet impacts. The rule from the door work applies
 * throughout: what you SEE must be exactly what the simulation says.
 */
"use strict";

const R3DW = { props: [], glass: [], cams: [], chaos: [], blood: [], holes: [], built: -1 };

/* ---------------------------------------------------------------- desks --- */
function _deskMesh(th, variant){
  const grp = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.8 });
  const top = new THREE.Mesh(new THREE.BoxGeometry(T - 8, 3.6, T - 12), wood);
  top.position.y = 21; top.castShadow = true; grp.add(top);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]){
    const leg = new THREE.Mesh(new THREE.BoxGeometry(3, 21, 3), dark);
    leg.position.set(sx * (T / 2 - 8), 10.5, sz * (T / 2 - 9));
    grp.add(leg);
  }
  if (variant === "monitor"){
    const mon = new THREE.Mesh(new THREE.BoxGeometry(16, 11, 2), dark);
    mon.position.set(0, 30, -6); grp.add(mon);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 8.5),
      new THREE.MeshStandardMaterial({ color: 0x9adfff, emissive: 0x6ec3ff, emissiveIntensity: 0.9 }));
    scr.position.set(0, 30, -4.8); grp.add(scr);
  } else if (variant === "papers"){
    const pap = new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.95 });
    for (let k = 0; k < 3; k++){
      const p = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 13), pap);
      p.position.set(-6 + k * 6, 23.2 + k * 0.5, (k % 2 ? 4 : -3));
      p.rotation.y = (k - 1) * 0.3; grp.add(p);
    }
  } else if (variant === "keys"){
    const kb = new THREE.Mesh(new THREE.BoxGeometry(15, 1.4, 6), dark);
    kb.position.set(-4, 23.6, 4); grp.add(kb);
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x7a4030, roughness: 0.6 }));
    mug.position.set(13, 25, 3); grp.add(mug);
  }
  return grp;
}
function _hedgeMesh(){
  const grp = new THREE.Group();
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2e5231, roughness: 0.95 });
  const leaf2 = new THREE.MeshStandardMaterial({ color: 0x3a6a3e, roughness: 0.95 });
  for (let k = 0; k < 5; k++){
    const b = new THREE.Mesh(new THREE.SphereGeometry(9 + (k % 3) * 3, 8, 6), k % 2 ? leaf : leaf2);
    b.position.set((k - 2) * 8, 12 + (k % 2) * 5, ((k * 7) % 11) - 5);
    b.castShadow = true; grp.add(b);
  }
  return grp;
}

/* One InstancedMesh per desk PART, shared across every desk on the floor.
   Each part's world matrix = desk transform x its local offset, composed with
   two dummies. Same geometry, same variants, ~7 draw calls total instead of
   ~7 per desk. */
function _buildDeskInstances(desks){
  const S = R3D.scene;
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a4038, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.8 });
  const pap = new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.95 });
  const mugM = new THREE.MeshStandardMaterial({ color: 0x7a4030, roughness: 0.6 });
  /* HDR emissive so the monitors bloom — 1.9 clears the 0.72 threshold with
     margin; the flicker below rides on top and dips it under for a frame now
     and then, which is exactly what a CRT-era screen does */
  const scrM = new THREE.MeshStandardMaterial({ color: 0x9adfff, emissive: 0x6ec3ff, emissiveIntensity: 1.9 });
  R3DW._scrM = scrM;
  const A = new THREE.Object3D(), B = new THREE.Object3D();
  const parts = {
    top:    { geo: new THREE.BoxGeometry(T - 8, 3.6, T - 12), mat: wood, at: [], shadow: true },
    leg:    { geo: new THREE.BoxGeometry(3, 21, 3),            mat: dark, at: [] },
    monitor:{ geo: new THREE.BoxGeometry(16, 11, 2),           mat: dark, at: [] },
    screen: { geo: new THREE.PlaneGeometry(13.5, 8.5),         mat: scrM, at: [] },
    paper:  { geo: new THREE.BoxGeometry(10, 0.5, 13),         mat: pap,  at: [] },
    kb:     { geo: new THREE.BoxGeometry(15, 1.4, 6),          mat: dark, at: [] },
    mug:    { geo: new THREE.CylinderGeometry(2.4, 2.4, 4, 10), mat: mugM, at: [] }
  };
  const put = (list, d, px, py, pz, ry) => {
    A.position.set(d.x, 0, d.y); A.rotation.set(0, d.rot, 0); A.updateMatrix();
    B.position.set(px, py, pz); B.rotation.set(0, ry || 0, 0); B.updateMatrix();
    const m = new THREE.Matrix4().multiplyMatrices(A.matrix, B.matrix);
    list.push(m);
  };
  for (const d of desks){
    put(parts.top.at, d, 0, 21, 0);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]])
      put(parts.leg.at, d, sx * (T / 2 - 8), 10.5, sz * (T / 2 - 9));
    if (d.variant === "monitor"){
      put(parts.monitor.at, d, 0, 30, -6);
      put(parts.screen.at, d, 0, 30, -4.8);
    } else if (d.variant === "papers"){
      for (let k = 0; k < 3; k++) put(parts.paper.at, d, -6 + k * 6, 23.2 + k * 0.5, (k % 2 ? 4 : -3), (k - 1) * 0.3);
    } else if (d.variant === "keys"){
      put(parts.kb.at, d, -4, 23.6, 4);
      put(parts.mug.at, d, 13, 25, 3);
    }
  }
  for (const key of Object.keys(parts)){
    const p = parts[key];
    if (!p.at.length) continue;
    const im = new THREE.InstancedMesh(p.geo, p.mat, p.at.length);
    p.at.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    if (p.shadow){ im.castShadow = true; im.receiveShadow = true; }
    S.add(im); R3DW.props.push(im);
  }
}

/* --------------------------------------------------------------- builder -- */
/* v2.0.62-71 ROOM DRESSING. GTA interiors feel real because they are
   CLUTTERED; ours were empty rooms with painted floors. This fills the volume
   with set-dressing that reads as "a place people work" — none of it touches
   the sim (no collision, no LOS), all of it deterministic per tile (hash), and
   all of it INSTANCED so ten kinds of clutter cost ten draw calls, not a
   thousand. The dressing is chosen per district so a marble lobby and a
   sub-basement vault do not share a look. */
function _instHelper(S, geo, mat, placements, tag){
  if (!placements.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, placements.length);
  m.castShadow = true; m.receiveShadow = true;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3();
  placements.forEach((p, i) => {
    q.setFromAxisAngle(up, p.rot || 0);
    s.set(p.sx || 1, p.sy || 1, p.sz || 1);
    m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, s);
    m.setMatrixAt(i, m4);
  });
  m.instanceMatrix.needsUpdate = true;
  m.userData.dress = tag || 1;
  S.add(m); R3DW.props.push(m);
  return m;
}
/* is a floor tile open and not right under the player spawn */
function _floorOpen(x, y){ return tileAt(x, y) === "."; }
function r3dDressRoom(th){
  const S = R3D.scene, mat = th.mat;
  const H2 = R3D.wallH;
  const wallAdj = (x, y) => { for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) if (tileAt(x+dx,y+dy) === "#") return [dx, dy]; return null; };

  /* --- v2.0.62 CEILING GRID: recessed panel lines + the odd vent, so the
     roof is not one flat plane when you glance up --- */
  {
    const beams = [];
    for (let y = 2; y < LV.h - 2; y += 3) for (let x = 1; x < LV.w - 1; x++){
      if (tileAt(x, y) !== ".") continue;
      beams.push({ x: x * T + T / 2, y: H2 - 1, z: y * T + T / 2, sx: T / 6, sy: 1, sz: 1.4 });
    }
    _instHelper(S, new THREE.BoxGeometry(6, 1.5, 6), new THREE.MeshStandardMaterial({ color: 0x0d1118, roughness: 1 }), beams, "ceil");
  }

  /* --- v2.0.63 BASEBOARD / trim where floor meets wall — a low strip that
     grounds the walls, district-coloured --- */
  {
    const trim = [], col = mat === "marble" ? 0x2a2f3a : mat === "metal" ? 0x1a2029 : mat === "concrete" ? 0x2c2c30 : 0x2f2620;
    for (let y = 1; y < LV.h - 1; y++) for (let x = 1; x < LV.w - 1; x++){
      if (tileAt(x, y) !== ".") continue;
      const w = wallAdj(x, y); if (!w) continue;
      trim.push({ x: x * T + T / 2 + w[0] * (T / 2 - 1), y: 4, z: y * T + T / 2 + w[1] * (T / 2 - 1),
                  rot: w[0] !== 0 ? Math.PI / 2 : 0, sx: 1, sy: 1, sz: 1 });
    }
    _instHelper(S, new THREE.BoxGeometry(T, 8, 2.5), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7 }), trim, "trim");
  }

  /* --- district-specific clutter: pick a set by material --- */
  const rnd = (x, y) => hash2(x * 13 + 5, y * 7 + 3);
  const clutter = [], clutterTall = [];
  for (let y = 2; y < LV.h - 2; y++) for (let x = 2; x < LV.w - 2; x++){
    if (tileAt(x, y) !== ".") continue;
    const w = wallAdj(x, y);
    const r = rnd(x, y);
    /* against a wall: taller furniture; in the open: low things, sparse */
    if (w && r < 0.13){ clutterTall.push({ x: x * T + T / 2 + w[0] * (T / 2 - 8), z: y * T + T / 2 + w[1] * (T / 2 - 8), rot: w[0] !== 0 ? Math.PI / 2 : 0, r }); }
    else if (!w && r > 0.93){ clutter.push({ x: x * T + T / 2, z: y * T + T / 2, rot: (r - 0.93) * 40, r }); }
  }
  /* v2.0.64 TALL FURNITURE against walls — filing cabinets (office/archive),
     lockers (vault), planters (lobby), crates (yard/roof) */
  {
    let geo, col, hgt;
    if (mat === "marble"){ geo = new THREE.CylinderGeometry(9, 11, 26, 8); col = 0x2f3a2c; hgt = 13; }      // planter
    else if (mat === "metal"){ geo = new THREE.BoxGeometry(20, 40, 16); col = 0x2a3038; hgt = 20; }          // locker
    else if (mat === "concrete"){ geo = new THREE.BoxGeometry(24, 24, 24); col = 0x3a3320; hgt = 12; }        // crate
    else { geo = new THREE.BoxGeometry(18, 34, 22); col = 0x40372a; hgt = 17; }                                // filing cabinet
    _instHelper(S, geo, new THREE.MeshStandardMaterial({ color: col, roughness: 0.85 }),
      clutterTall.map(p => ({ x: p.x, y: hgt, z: p.z, rot: p.rot })), "tall");
    /* v2.0.65 a leafy top on planters / a handle strip on lockers — one more
       instanced accent so the tall pieces are not bare boxes */
    if (mat === "marble")
      _instHelper(S, new THREE.SphereGeometry(12, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3f7a48, roughness: 0.9 }),
        clutterTall.map(p => ({ x: p.x, y: 30, z: p.z, sy: 0.6 })), "leaf");
  }
  /* v2.0.66 LOW CLUTTER in the open — a stray chair, a box, a floor cone */
  {
    _instHelper(S, new THREE.BoxGeometry(12, 16, 12), new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.8 }),
      clutter.map(p => ({ x: p.x, y: 8, z: p.z, rot: p.rot })), "low");
  }

  /* v2.0.67 WALL SIGNAGE — small emissive plates on walls, district-tinted:
     EXIT greens, dept blues, hazard ambers. Reads as a working building and
     gives the eye something at wall height. */
  {
    const signs = [], cols = [0x7cf9a5, 0x5ab4ff, 0xffb454];
    for (let y = 2; y < LV.h - 2; y += 2) for (let x = 2; x < LV.w - 2; x += 2){
      if (tileAt(x, y) !== "#") continue;
      const open = [[1,0],[-1,0],[0,1],[0,-1]].find(([dx,dy]) => tileAt(x+dx,y+dy) === ".");
      if (!open) continue;
      if (hash2(x * 5, y * 3) > 0.22) continue;
      const [dx, dy] = open;
      signs.push({ x: x * T + T / 2 + dx * (T / 2 + 0.5), y: H2 * 0.62, z: y * T + T / 2 + dy * (T / 2 + 0.5),
                   rot: dx !== 0 ? Math.PI / 2 : 0, col: cols[(x + y) % 3] });
    }
    /* group by colour so each colour is one instanced mesh */
    for (const c of [0x7cf9a5, 0x5ab4ff, 0xffb454]){
      const grp = signs.filter(s => s.col === c);
      _instHelper(S, new THREE.PlaneGeometry(16, 8),
        new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.7, side: THREE.DoubleSide }),
        grp.map(s => ({ x: s.x, y: s.y, z: s.z, rot: s.rot })), "sign");
    }
  }

  /* v2.0.68 HANGING CABLES from the ceiling in industrial districts (vault,
     roof, yard) — thin dark lines that add vertical detail and read as a
     building that has guts */
  if (mat === "metal" || mat === "concrete"){
    const cables = [];
    for (let y = 2; y < LV.h - 2; y += 4) for (let x = 2; x < LV.w - 2; x += 5){
      if (tileAt(x, y) !== ".") continue;
      if (hash2(x * 7, y) > 0.4) continue;
      cables.push({ x: x * T + T / 2 + (hash2(x, y) - 0.5) * 20, y: H2 * 0.7, z: y * T + T / 2, sy: 0.5 + hash2(y, x) * 0.4 });
    }
    _instHelper(S, new THREE.CylinderGeometry(0.8, 0.8, H2 * 0.6, 5), new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 1 }), cables, "cable");
  }
}

function r3dBuildProps(){
  const S = R3D.scene, th = themeOf();
  R3DW.props = []; R3DW.glass = []; R3DW.cams = []; R3DW.chaos = [];
  R3DW.blood = []; R3DW.holes = [];

  const desks = [];
  for (let y = 0; y < LV.h; y++) for (let x = 0; x < LV.w; x++){
    const c = tileAt(x, y);
    if (c === "-"){
      /* same variant hash the 2D painter uses, so the 3D desk carries the
         same monitor the floor art shows under it */
      const h = hash2(x * 3, y * 11);
      if (th.mat === "grass"){
        const m = _hedgeMesh();
        m.position.set(x * T + T / 2, 0, y * T + T / 2);
        m.rotation.y = (hash2(x, y * 7) - 0.5) * 0.14;
        S.add(m); R3DW.props.push(m);
      } else {
        /* desks are INSTANCED, not one Group each — 144 desks of ~7 meshes
           was ~1000 draw calls and the whole reason the cubicle farm ran at
           14ms p95. Placements are collected here, built in one pass below. */
        desks.push({ x: x * T + T / 2, y: y * T + T / 2,
                     rot: (hash2(x, y * 7) - 0.5) * 0.14,
                     variant: h < 0.34 ? "monitor" : h < 0.6 ? "papers" : h < 0.75 ? "keys" : "plain" });
      }
    } else if (c === "V"){
      /* AIR DUCT. The sim lets a sneaking player through these tiles and
         nobody else; they were rendered as solid wall, i.e. an invisible
         tunnel. A metal duct at crawl height says everything the tile rules
         say: too low to walk, big enough to crawl, and you can see the run
         of it across the room. Cutaway when KJP is inside (r3dSyncProps),
         because a camera inside a closed box shows the box. */
      const duct = new THREE.Mesh(new THREE.BoxGeometry(T, 34, T),
        r3dMaterial("metal", { color: 0x9aa4b2 }));
      duct.position.set(x * T + T / 2, 17, y * T + T / 2);
      duct.castShadow = true;
      duct.userData.vent = [x, y];
      duct.userData.solidMat = duct.material;
      S.add(duct); R3DW.props.push(duct);
      /* dark grille on each open end so the entrance reads from a distance */
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
        if (tileAt(x + dx, y + dy) !== ".") continue;
        const gr = new THREE.Mesh(new THREE.PlaneGeometry(T - 10, 24),
          new THREE.MeshStandardMaterial({ color: 0x14181f, roughness: 0.9,
            emissive: 0x7cf9a5, emissiveIntensity: 0.05 }));
        gr.position.set(x * T + T / 2 + dx * (T / 2 + 0.6), 15, y * T + T / 2 + dy * (T / 2 + 0.6));
        gr.rotation.y = dx !== 0 ? Math.PI / 2 : 0;
        S.add(gr); R3DW.props.push(gr);
      }
    } else if (c === "="){
      /* glass: transparent pane the sim can shatter. Tracked per tile — when
         the grid says ".", the pane is gone. */
      const pane = new THREE.Mesh(new THREE.BoxGeometry(T, R3D.wallH * 0.9, 3),
        new THREE.MeshStandardMaterial({ color: 0xbfe2ff, transparent: true, opacity: 0.16,
          roughness: 0.06, metalness: 0.6, side: THREE.DoubleSide }));
      /* orient along the run of neighbouring glass/wall */
      const vert = tileAt(x, y - 1) === "=" || tileAt(x, y + 1) === "=" ||
                   tileAt(x, y - 1) === "#" || tileAt(x, y + 1) === "#";
      if (vert) pane.rotation.y = Math.PI / 2;
      pane.position.set(x * T + T / 2, R3D.wallH * 0.45, y * T + T / 2);
      pane.userData.t = [x, y];
      S.add(pane); R3DW.glass.push(pane);
    }
  }

  if (desks.length) _buildDeskInstances(desks);
  r3dDressRoom(th);        // v2.0.62-71 — fill the empty volume

  /* ═══ v2.0.62–71 CLUTTER — the "empty rooms" fix ═══
     Only cover tiles got furniture; every open tile was bare floor and every
     wall a blank slab. Real interiors are dressed at the WALLS: things stand
     against
  for (const cm of LV.cams){
    const grp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(10, 7, 16),
      new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.4, metalness: 0.3 }));
    body.position.z = -4; grp.add(body);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x111418, roughness: 0.2 }));
    lens.rotation.x = Math.PI / 2; lens.position.z = 5; grp.add(lens);
    const led = new THREE.Mesh(new THREE.SphereGeometry(1.1, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0xff4040, emissive: 0xff2020, emissiveIntensity: 2 }));
    led.position.set(0, 4.6, -2); grp.add(led);
    grp.position.set(cm.x, R3D.wallH * 0.8, cm.y);
    grp.userData.cam = cm; grp.userData.led = led;
    R3D.scene.add(grp); R3DW.cams.push(grp);
  }

  /* chaos props + loot from the sandbox layer */
  for (const pr of (LV.props || [])){
    let m = null;
    if (pr.t === "barrel"){
      m = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 24, 12),
        new THREE.MeshStandardMaterial({ color: 0xb04a3a, roughness: 0.55, metalness: 0.25 }));
      m.position.set(pr.x, 12, pr.y);
    } else if (pr.t === "fire"){
      m = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 16, 10),
        new THREE.MeshStandardMaterial({ color: 0xc23c2a, emissive: 0xff5a20, emissiveIntensity: 0.6 }));
      m.position.set(pr.x, 8, pr.y);
    } else if (pr.t === "power"){
      m = new THREE.Mesh(new THREE.BoxGeometry(14, 30, 10),
        new THREE.MeshStandardMaterial({ color: 0x3d4854, roughness: 0.6, metalness: 0.4,
          emissive: 0x2a97ff, emissiveIntensity: 0.25 }));
      m.position.set(pr.x, 15, pr.y);
    }
    if (m){ m.castShadow = true; m.userData.pr = pr; R3D.scene.add(m); R3DW.chaos.push(m); }
  }
  for (const lt of (LV.loot || [])){
    const m = new THREE.Mesh(new THREE.BoxGeometry(16, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0x2c3644, roughness: 0.35, metalness: 0.6,
        emissive: 0xffd27c, emissiveIntensity: 0.15 }));
    m.position.set(lt.x, 9, lt.y);
    m.userData.loot = lt; R3D.scene.add(m); R3DW.chaos.push(m);
  }
  R3DW.built = LV.n;
}

/* ------------------------------------------------------------- decals ----- */
function _decalMesh(list, col){
  const m = new THREE.Mesh(new THREE.CircleGeometry(1, 12),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.62, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  R3D.scene.add(m); list.push(m);
  return m;
}
function r3dSyncDecals(){
  /* blood pools — the sim already grows LV.decals; mirror radius live */
  (LV.decals || []).forEach((d, i) => {
    if (i > 47) return;
    const m = R3DW.blood[i] || _decalMesh(R3DW.blood, 0x5a1214);
    m.position.set(d.x, 0.6, d.y);
    m.scale.set(d.r, d.r * 0.8, 1);
    m.visible = true;
  });
  for (let i = (LV.decals || []).length; i < R3DW.blood.length; i++) R3DW.blood[i].visible = false;
  /* bullet scars where rounds died on wall */
  (LV.wallHits || []).forEach((h, i) => {
    if (i > 63) return;
    let m = R3DW.holes[i];
    if (!m){
      m = new THREE.Mesh(new THREE.CircleGeometry(2.6, 8),
        new THREE.MeshBasicMaterial({ color: 0x0c0e12, transparent: true, opacity: 0.85, depthWrite: false }));
      m.renderOrder = 2; R3D.scene.add(m); R3DW.holes[i] = m;
    }
    /* face back along the shot, pulled slightly off the surface */
    m.position.set(h.x - Math.cos(h.a) * 2.2, 24 + ((i * 37) % 17), h.y - Math.sin(h.a) * 2.2);
    m.rotation.set(0, -h.a + Math.PI / 2, 0);
    m.visible = true;
  });
  for (let i = (LV.wallHits || []).length; i < R3DW.holes.length; i++) if (R3DW.holes[i]) R3DW.holes[i].visible = false;
}

/* --------------------------------------------------------------- sync ----- */
function r3dSyncProps(){
  /* SCREEN FLICKER — every monitor on the floor shares one material, so one
     line drives them all: a slow phosphor breathe with an occasional deep dip
     that drops it below the bloom threshold for a frame. Living electronics,
     not painted rectangles. */
  if (R3DW._scrM){
    const t = performance.now() / 1000;
    const dip = (Math.sin(t * 17.3) > 0.985) ? 0.55 : 1;
    R3DW._scrM.emissiveIntensity = (1.75 + Math.sin(t * 2.1) * 0.18) * dip;
  }
  /* DUCT CUTAWAY — when KJP is crawling a vent, the sections around him go
     translucent so the camera can ride inside the run. From outside they stay
     solid metal; the cutaway is for the crawler, not the room. */
  const inVent = P && tileAt(Math.floor(P.x / T), Math.floor(P.y / T)) === "V";
  const camX3 = R3D.cam ? R3D.cam.position.x : 0, camY3 = R3D.cam ? R3D.cam.position.z : 0;
  if (!R3DW._ghostMat){
    R3DW._ghostMat = new THREE.MeshStandardMaterial({
      color: 0x9aa4b2, transparent: true, opacity: 0.10, roughness: 0.35, metalness: 0.6, depthWrite: false });
    R3DW._ghostMat.userData.shared = true;      // survives floor teardown
  }
  for (const m of R3DW.props){
    if (!m.userData.vent) continue;
    /* three states while crawling: the sections holding KJP or the CAMERA are
       hidden outright (a lens inside a translucent box just fills the frame
       with grey — the first cut looked like fog), the sections next along the
       run are ghosted so the duct still reads as a duct, and everything
       further stays solid metal for anyone looking from the room. */
    let state = 0;
    if (inVent){
      const dP = Math.hypot(m.position.x - P.x, m.position.z - P.y);
      const dC = Math.hypot(m.position.x - camX3, m.position.z - camY3);
      state = (dP < T * 0.75 || dC < T * 0.9) ? 2 : dP < T * 2.4 ? 1 : 0;
    }
    if (state !== m.userData.cut){
      m.userData.cut = state;
      m.visible = state !== 2;
      m.material = state === 1 ? R3DW._ghostMat : m.userData.solidMat;
    }
  }
  for (const pane of R3DW.glass){
    const [x, y] = pane.userData.t;
    pane.visible = tileAt(x, y) === "=";           // shattered glass is GONE
  }
  const t = performance.now();
  for (const grp of R3DW.cams){
    const cm = grp.userData.cam;
    grp.visible = true;
    grp.rotation.y = -(cm.dir + (cm.swing || 0)) + Math.PI / 2;
    grp.userData.led.material.emissiveIntensity = cm.dead ? 0 : (Math.sin(t / 300) > 0 ? 2 : 0.4);
    if (cm.dead) grp.rotation.x = 0.6;             // knocked askew, not vanished
  }
  for (const m of R3DW.chaos){
    if (m.userData.pr && m.userData.pr.dead){
      if (m.userData.pr.t === "barrel"){ m.visible = false; continue; }
      m.material.emissiveIntensity = 0;
      m.rotation.z = 0.4;
    }
    if (m.userData.loot && m.userData.loot.done) m.material.emissiveIntensity = 0;
  }
}

/* ------------------------------------------------------------- weapons ---- */
/* Procedural gun models, one shape per class. Attached to the RIGHT hand
   pivot so the walk swing carries them naturally; visibility synced per frame
   from the sim's own weapon state. */
function r3dGunMesh(cls){
  const grp = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x1a1e26, roughness: 0.35, metalness: 0.75 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x2c241c, roughness: 0.8 });
  const slide = (l, h, w) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), metal); grp.add(m); return m; };
  if (cls === "smg"){
    slide(16, 3.4, 2.6).position.set(0, 0, -6);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(2.2, 8, 3.4), metal); mag.position.set(0, -5, -4); grp.add(mag);
    const st = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 8), grip); st.position.set(0, 0, 3); grp.add(st);
  } else if (cls === "rifle"){
    slide(26, 3, 2.4).position.set(0, 0, -10);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 7, 8), metal);
    scope.rotation.x = Math.PI / 2; scope.position.set(0, 3, -8); grp.add(scope);
    const st = new THREE.Mesh(new THREE.BoxGeometry(2.4, 4, 9), grip); st.position.set(0, -1, 2); grp.add(st);
  } else { /* pistol / tranq */
    slide(9, 3, 2.4).position.set(0, 0, -4);
    const g2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6, 3), grip);
    g2.rotation.x = 0.22; g2.position.set(0, -3.4, -0.6); grp.add(g2);
  }
  grp.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return grp;
}
function r3dGunClass(wid){
  const w = WEAPONS[wid];
  if (!w || w.melee) return null;
  if (/smg|mp|uzi/i.test(wid) || (w.mag || 0) >= 20) return "smg";
  if ((w.dmg || 0) >= 1.4) return "rifle";
  return "pistol";
}
