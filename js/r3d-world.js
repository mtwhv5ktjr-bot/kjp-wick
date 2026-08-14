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

/* --------------------------------------------------------------- builder -- */
function r3dBuildProps(){
  const S = R3D.scene, th = themeOf();
  R3DW.props = []; R3DW.glass = []; R3DW.cams = []; R3DW.chaos = [];
  R3DW.blood = []; R3DW.holes = [];

  for (let y = 0; y < LV.h; y++) for (let x = 0; x < LV.w; x++){
    const c = tileAt(x, y);
    if (c === "-"){
      /* same variant hash the 2D painter uses, so the 3D desk carries the
         same monitor the floor art shows under it */
      const h = hash2(x * 3, y * 11);
      const variant = th.mat === "grass" ? "hedge" : h < 0.34 ? "monitor" : h < 0.6 ? "papers" : h < 0.75 ? "keys" : "plain";
      const m = variant === "hedge" ? _hedgeMesh() : _deskMesh(th, variant);
      m.position.set(x * T + T / 2, 0, y * T + T / 2);
      m.rotation.y = (hash2(x, y * 7) - 0.5) * 0.14;    // nothing in a real office is square
      S.add(m); R3DW.props.push(m);
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

  /* security cameras — shootable, so they must be visible and aimable */
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
