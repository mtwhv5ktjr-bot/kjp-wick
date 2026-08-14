/* KJP — PROCEDURAL PBR MATERIALS + the texture drop-folder.
 *
 * Every surface in the 3D world was one flat colour, and flat colour is what
 * separates "boxes" from "a building". This generates colour / normal /
 * roughness maps in canvas at level build — no downloads, no build step,
 * deterministic per material — and lets REAL textures take over the moment
 * they exist on disk:
 *
 *     assets/tex/<name>_color.png      e.g.  assets/tex/concrete_color.png
 *     assets/tex/<name>_normal.png           assets/tex/marble_rough.png
 *     assets/tex/<name>_rough.png
 *
 * Drop any subset — a color map alone still upgrades that material, the
 * missing maps stay procedural. Same drop-folder pattern assets/ already uses
 * for sprites: ship procedural today, slot art in later without touching code.
 *
 * The normal maps are the whole trick. They are generated as HEIGHT fields
 * first (noise, grout lines, panel seams), then converted to normals by
 * finite difference — which is exactly what a baking tool does, minus the
 * sculpt. A lit wall with per-pixel normals reads as concrete from ten feet
 * even when the colour map is nearly uniform.
 */
"use strict";

const R3DMAT = { cache: new Map(), overrides: new Map(), probed: false };

/* ------------------------------------------------------------ helpers ---- */
function _mcv(size){
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")];
}
/* deterministic per-material noise — a reload must not re-roll the building */
function _mrand(seed){
  let a = seed | 0 || 1;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
/* value-noise octaves onto a Float32 height field */
function _heightField(size, seed, octaves){
  const h = new Float32Array(size * size);
  const rnd = _mrand(seed);
  for (const { cell, amp } of octaves){
    const g = Math.ceil(size / cell) + 2;
    const grid = new Float32Array(g * g);
    for (let i = 0; i < grid.length; i++) grid[i] = rnd();
    const sm = t => t * t * (3 - 2 * t);
    for (let y = 0; y < size; y++){
      const gy = y / cell, y0 = gy | 0, fy = sm(gy - y0);
      for (let x = 0; x < size; x++){
        const gx = x / cell, x0 = gx | 0, fx = sm(gx - x0);
        const a0 = grid[y0 * g + x0], b0 = grid[y0 * g + x0 + 1];
        const a1 = grid[(y0 + 1) * g + x0], b1 = grid[(y0 + 1) * g + x0 + 1];
        h[y * size + x] += ((a0 + (b0 - a0) * fx) * (1 - fy) + (a1 + (b1 - a1) * fx) * fy) * amp;
      }
    }
  }
  return h;
}
/* height -> tangent-space normal map, wrap-around so the texture TILES */
function _normalFromHeight(h, size, strength){
  const [c, g2] = _mcv(size);
  const img = g2.createImageData(size, size);
  for (let y = 0; y < size; y++){
    for (let x = 0; x < size; x++){
      const xl = h[y * size + ((x - 1 + size) % size)], xr = h[y * size + ((x + 1) % size)];
      const yu = h[((y - 1 + size) % size) * size + x], yd = h[((y + 1) % size) * size + x];
      let nx = (xl - xr) * strength, ny = (yu - yd) * strength, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      img.data[i] = (nx / l * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny / l * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz / l * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  g2.putImageData(img, 0, 0);
  return c;
}
function _tex(canvasOrImg, srgb){
  const t = new THREE.CanvasTexture(canvasOrImg);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = R3D.renderer ? R3D.renderer.capabilities.getMaxAnisotropy() : 4;
  return t;
}

/* ------------------------------------------------- material generators ---- */
/* Each returns { color, normal, rough } canvases at 256. Grout/seam lines are
   drawn into BOTH the height field (so they dent) and the colour (so they
   darken) — aligned dirt is what sells a seam. */
const MATGEN = {
  concrete(){
    const S = 256, [cc, cg] = _mcv(S);
    const h = _heightField(S, 101, [{ cell: 96, amp: 0.5 }, { cell: 24, amp: 0.3 }, { cell: 6, amp: 0.2 }]);
    const img = cg.createImageData(S, S);
    for (let i = 0; i < S * S; i++){
      const v = 122 + h[i] * 46;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v + 2; img.data[i * 4 + 2] = v + 6; img.data[i * 4 + 3] = 255;
    }
    cg.putImageData(img, 0, 0);
    /* form-tie seams every 64px */
    cg.strokeStyle = "rgba(0,0,0,0.18)"; cg.lineWidth = 2;
    for (let p = 0; p <= S; p += 64){ cg.beginPath(); cg.moveTo(p, 0); cg.lineTo(p, S); cg.stroke(); }
    for (let i = 0; i < S * S; i++) if ((i % S) % 64 < 2) h[i] -= 0.5;
    const [rc, rg] = _mcv(S); rg.fillStyle = "#b8b8b8"; rg.fillRect(0, 0, S, S);
    return { color: cc, normal: _normalFromHeight(h, S, 2.2), rough: rc };
  },
  marble(){
    const S = 256, [cc, cg] = _mcv(S);
    const h = _heightField(S, 202, [{ cell: 128, amp: 0.6 }, { cell: 32, amp: 0.4 }]);
    const img = cg.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
      const i = y * S + x;
      /* veining: a warped sine over the noise */
      /* two crossing directions, heavily noise-warped — one straight sine read
         as wood planks, not stone */
      const vein = Math.pow(Math.abs(Math.sin((x + h[i] * 140) * 0.031 + y * 0.017)), 10) * 0.7
                 + Math.pow(Math.abs(Math.sin((y + h[i] * 110) * 0.022 - x * 0.008)), 12) * 0.5;
      const base = 199 + h[i] * 18 - vein * 46;
      img.data[i * 4] = base; img.data[i * 4 + 1] = base + 3; img.data[i * 4 + 2] = base + 8; img.data[i * 4 + 3] = 255;
    }
    cg.putImageData(img, 0, 0);
    const flat = new Float32Array(S * S).fill(0.5);   // polished — normals nearly flat
    const [rc, rg] = _mcv(S); rg.fillStyle = "#3a3a3a"; rg.fillRect(0, 0, S, S);  // glossy
    return { color: cc, normal: _normalFromHeight(flat, S, 0.4), rough: rc };
  },
  drywall(){
    const S = 256, [cc, cg] = _mcv(S);
    const h = _heightField(S, 303, [{ cell: 64, amp: 0.3 }, { cell: 8, amp: 0.15 }]);
    const img = cg.createImageData(S, S);
    for (let i = 0; i < S * S; i++){
      const v = 168 + h[i] * 18;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v - 4; img.data[i * 4 + 3] = 255;
    }
    cg.putImageData(img, 0, 0);
    /* scuffs low on the wall — walls are touched by people, not weather */
    const rnd = _mrand(304);
    cg.fillStyle = "rgba(60,58,52,0.10)";
    for (let k = 0; k < 26; k++){ const w = 8 + rnd() * 30; cg.fillRect(rnd() * S, S * 0.55 + rnd() * S * 0.45, w, 2 + rnd() * 5); }
    const [rc, rg] = _mcv(S); rg.fillStyle = "#c9c9c9"; rg.fillRect(0, 0, S, S);
    return { color: cc, normal: _normalFromHeight(h, S, 1.1), rough: rc };
  },
  metal(){
    const S = 256, [cc, cg] = _mcv(S);
    const h = _heightField(S, 404, [{ cell: 48, amp: 0.25 }]);
    const img = cg.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++){
      const i = y * S + x;
      const brush = Math.sin(y * 1.7) * 4;                 // brushed horizontal grain
      const v = 96 + h[i] * 20 + brush;
      img.data[i * 4] = v; img.data[i * 4 + 1] = v + 4; img.data[i * 4 + 2] = v + 9; img.data[i * 4 + 3] = 255;
    }
    cg.putImageData(img, 0, 0);
    /* panel seams + rivets, into colour AND height */
    cg.strokeStyle = "rgba(0,0,0,0.35)"; cg.lineWidth = 2;
    for (let p = 0; p <= S; p += 128){
      cg.beginPath(); cg.moveTo(p, 0); cg.lineTo(p, S); cg.stroke();
      cg.beginPath(); cg.moveTo(0, p); cg.lineTo(S, p); cg.stroke();
    }
    for (let i = 0; i < S * S; i++){ const x = i % S, y = (i / S) | 0; if (x % 128 < 2 || y % 128 < 2) h[i] -= 0.6; }
    const rnd = _mrand(405);
    cg.fillStyle = "rgba(210,220,230,0.5)";
    for (let px = 10; px < S; px += 128) for (let py = 10; py < S; py += 24){ cg.beginPath(); cg.arc(px, py, 1.6, 0, 7); cg.fill(); }
    const [rc, rg] = _mcv(S); rg.fillStyle = "#5a5a5a"; rg.fillRect(0, 0, S, S);
    return { color: cc, normal: _normalFromHeight(h, S, 2.6), rough: rc };
  },
  ceiling(){
    const S = 256, [cc, cg] = _mcv(S);
    cg.fillStyle = "#20262e"; cg.fillRect(0, 0, S, S);
    const h = new Float32Array(S * S).fill(0.5);
    /* acoustic tiles: 128px grid with a soft inner speckle */
    const rnd = _mrand(505);
    cg.fillStyle = "rgba(255,255,255,0.05)";
    for (let k = 0; k < 1400; k++) cg.fillRect(rnd() * S, rnd() * S, 1.4, 1.4);
    cg.strokeStyle = "rgba(0,0,0,0.5)"; cg.lineWidth = 3;
    for (let p = 0; p <= S; p += 128){
      cg.beginPath(); cg.moveTo(p, 0); cg.lineTo(p, S); cg.stroke();
      cg.beginPath(); cg.moveTo(0, p); cg.lineTo(S, p); cg.stroke();
    }
    for (let i = 0; i < S * S; i++){ const x = i % S, y = (i / S) | 0; if (x % 128 < 3 || y % 128 < 3) h[i] -= 0.7; }
    const [rc, rg] = _mcv(S); rg.fillStyle = "#d0d0d0"; rg.fillRect(0, 0, S, S);
    return { color: cc, normal: _normalFromHeight(h, S, 1.8), rough: rc };
  }
};
/* which generator dresses each theme's WALLS */
const MAT_FOR_THEME = { yard: "concrete", lobby: "marble", office: "drywall",
                        archive: "drywall", vault: "metal", roof: "concrete" };

/* ----------------------------------------------------- drop-folder ------- */
/* Probe once per session. 404s are the NORMAL case — the folder ships empty. */
function r3dProbeOverrides(){
  if (R3DMAT.probed) return;
  R3DMAT.probed = true;
  const names = ["concrete", "marble", "drywall", "metal", "ceiling", "floor"];
  for (const n of names) for (const kind of ["color", "normal", "rough"]){
    const img = new Image();
    img.onload = () => {
      R3DMAT.overrides.set(n + "_" + kind, img);
      R3DMAT.cache.delete(n);                       // rebuilt with the override next build
      if (R3D.level >= 0) R3D.level = -1;           // force a scene rebuild
    };
    img.src = "assets/tex/" + n + "_" + kind + ".png";
  }
}

/* one MeshStandardMaterial per material name, cached */
function r3dMaterial(name, opts){
  const key = name + JSON.stringify(opts || {});
  if (R3DMAT.cache.has(key)) return R3DMAT.cache.get(key);
  const gen = (MATGEN[name] || MATGEN.concrete)();
  const ov = k => R3DMAT.overrides.get(name + "_" + k);
  /* CONTACT AO baked into the wall base. Where a wall meets the floor, light
     has nowhere to bounce from — the darkened skirt is what glues geometry to
     the ground. Applied only to GENERATED canvases: a dropped-in artist
     texture is presumed to already carry its own occlusion. Ceiling is the
     one material whose "bottom" is not a floor contact. */
  if (!ov("color") && name !== "ceiling"){
    const c2 = gen.color.getContext("2d"), S2 = gen.color.height;
    const gr2 = c2.createLinearGradient(0, S2 - 44, 0, S2);
    gr2.addColorStop(0, "rgba(0,0,0,0)"); gr2.addColorStop(1, "rgba(0,0,0,0.42)");
    c2.fillStyle = gr2; c2.fillRect(0, S2 - 44, gen.color.width, 44);
  }
  const m = new THREE.MeshStandardMaterial(Object.assign({
    map: _tex(ov("color") || gen.color, true),
    normalMap: _tex(ov("normal") || gen.normal, false),
    roughnessMap: _tex(ov("rough") || gen.rough, false),
    roughness: 1, metalness: name === "metal" ? 0.55 : 0.04
  }, opts || {}));
  /* cached across floor rebuilds — the teardown disposer must never touch it */
  m.userData.shared = true;
  for (const t of [m.map, m.normalMap, m.roughnessMap]) if (t) t.userData.shared = true;
  R3DMAT.cache.set(key, m);
  return m;
}

/* Full-floor NORMAL canvas for the ground plane. The colour comes from PRE
   (so decals and district grades carry over); this adds grout dents aligned to
   the SAME tile grid PRE painted, at half res. Generated per level size. */
function r3dFloorNormal(){
  const w = Math.min(2048, LV.w * T / 2), hpx = Math.min(2048, LV.h * T / 2);
  const size = 256;                                  // build tiling cell, then repeat via canvas pattern
  const h = _heightField(size, 606, [{ cell: 64, amp: 0.25 }]);
  const cell = T / 2;
  for (let i = 0; i < size * size; i++){
    const x = i % size, y = (i / size) | 0;
    if (x % cell < 1.5 || y % cell < 1.5) h[i] -= 0.8;   // grout
  }
  const tileN = _normalFromHeight(h, size, 1.6);
  const [c, g2] = _mcv(1);
  c.width = w; c.height = hpx;
  const pat = g2.createPattern(tileN, "repeat");
  g2.fillStyle = pat; g2.fillRect(0, 0, w, hpx);
  return _tex(c, false);
}
