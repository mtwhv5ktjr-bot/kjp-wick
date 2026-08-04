/* KJP renderer v2 — the AAA pass.
   Layer stack per frame:
     1. PRE      — baked architecture (floors w/ materials, extruded walls, AO,
                   props, decals) — rebuilt once per level load
     2. dynamics — doors, glass, pickups, cones-as-light, entities, fx
     3. LM       — half-res darkness lightmap: ambient dark, holes punched by
                   lamps / flashlights / emissives — multiplied over the scene
     4. GLOW     — quarter-res additive bloom of everything emissive
     5. grade    — per-theme color wash + vignette + grain + scanlines
   Budget: <4ms draw on a mid laptop. Everything static goes in the bake. */
"use strict";

let camX = 0, camY = 0, shakeT = 0, shakeAmp = 0;
function shake(n){ shakeAmp = Math.max(shakeAmp, n); shakeT = 0.3; }

const THEMES = {
  yard: {
    floor: "#1a221c", floorB: "#151c16", wall: "#39463a", wallFace: "#242e25", wallTop: "#5d7158",
    low: "#2b4022", lowTop: "#4d6f39", rain: true, outdoor: true,
    lampCol: "rgba(190,215,255,", lampWarm: "rgba(255,214,150,",
    gradeLo: "rgba(10,24,34,0.32)", gradeHi: "rgba(120,200,255,0.05)", ambient: 0.84, mat: "grass"
  },
  lobby: {
    floor: "#262a33", floorB: "#20242c", wall: "#434a5e", wallFace: "#2b303e", wallTop: "#6971916".slice(0, 7),
    low: "#4a3d26", lowTop: "#6f5c38", seal: true,
    lampCol: "rgba(255,214,150,", lampWarm: "rgba(255,214,150,",
    gradeLo: "rgba(30,22,10,0.25)", gradeHi: "rgba(255,214,150,0.05)", ambient: 0.72, mat: "marble"
  },
  office: {
    floor: "#232630", floorB: "#1d2029", wall: "#3d4152", wallFace: "#282b38", wallTop: "#5f6580",
    low: "#333a4d", lowTop: "#525c7a",
    lampCol: "rgba(200,235,255,", lampWarm: "rgba(200,235,255,",
    gradeLo: "rgba(10,20,32,0.28)", gradeHi: "rgba(150,220,255,0.05)", ambient: 0.75, mat: "carpet"
  },
  archive: {
    floor: "#292217", floorB: "#221c13", wall: "#463d2b", wallFace: "#2e2819", wallTop: "#6d6045",
    low: "#3a3120", lowTop: "#5c4e33",
    lampCol: "rgba(255,190,110,", lampWarm: "rgba(255,190,110,",
    gradeLo: "rgba(34,20,6,0.3)", gradeHi: "rgba(255,190,110,0.06)", ambient: 0.8, mat: "wood"
  },
  vault: {
    floor: "#191f29", floorB: "#141a22", wall: "#33405a", wallFace: "#20293c", wallTop: "#54678c",
    low: "#24344e", lowTop: "#3d587e", server: true,
    lampCol: "rgba(140,200,255,", lampWarm: "rgba(140,200,255,",
    gradeLo: "rgba(6,16,34,0.34)", gradeHi: "rgba(120,190,255,0.06)", ambient: 0.85, mat: "deck"
  },
  roof: {
    floor: "#20242b", floorB: "#1a1e24", wall: "#3c4351", wallFace: "#272c37", wallTop: "#5f6a80",
    low: "#2c333e", lowTop: "#48525f", rain: true, pad: true, outdoor: true,
    lampCol: "rgba(190,215,255,", lampWarm: "rgba(255,120,120,",
    gradeLo: "rgba(12,16,30,0.32)", gradeHi: "rgba(160,200,255,0.05)", ambient: 0.82, mat: "slab"
  }
};
let PRE = null, RADARPRE = null, LM = null, lmg = null, GLOW = null, glg = null, GLOW2 = null, gl2 = null;
let LIGHTS = [], MOTES = [], lightning = 0, lightningNext = 12;

function hash2(x, y){ let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0) / 4294967296; }
const themeOf = () => THEMES[LV.def.theme] || THEMES.lobby;

/* ================= BAKE ================= */
function prerenderLevel(){
  const th = themeOf();
  PRE = document.createElement("canvas");
  PRE.width = LV.w * T; PRE.height = LV.h * T;
  const c = PRE.getContext("2d");
  const at = (x, y) => (LV.grid[y] && LV.grid[y][x]) || " ";
  const isWall = (x, y) => at(x, y) === "#";
  const isFloorish = ch => ch === "." || ch === "V" || ch === "=" || ch === "-";

  /* --- floors + materials (artist tile wins when present) --- */
  const tileArt = artFor(["tile-" + LV.def.theme]);
  for (let y = 0; y < LV.h; y++) for (let x = 0; x < LV.w; x++){
    const ch = at(x, y), px = x * T, py = y * T;
    if (ch === " "){ c.fillStyle = "#04060a"; c.fillRect(px, py, T, T); continue; }
    if (tileArt){
      c.drawImage(tileArt, px, py, T, T);
      if (hash2(x, y) < 0.3){ c.fillStyle = "rgba(0,0,0,0.06)"; c.fillRect(px, py, T, T); }
    } else {
      c.fillStyle = hash2(x, y) < 0.5 ? th.floor : th.floorB;
      c.fillRect(px, py, T, T);
      matDetail(c, th, x, y, px, py);
    }
  }
  /* --- ambient occlusion: floor tiles hugging a wall get a shadow lip --- */
  for (let y = 0; y < LV.h; y++) for (let x = 0; x < LV.w; x++){
    const ch = at(x, y); if (!isFloorish(ch)) continue;
    const px = x * T, py = y * T, S = 14;
    if (isWall(x, y - 1)){ const gr = c.createLinearGradient(0, py, 0, py + S); gr.addColorStop(0, "rgba(0,0,0,0.42)"); gr.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = gr; c.fillRect(px, py, T, S); }
    if (isWall(x, y + 1)){ const gr = c.createLinearGradient(0, py + T, 0, py + T - S); gr.addColorStop(0, "rgba(0,0,0,0.3)"); gr.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = gr; c.fillRect(px, py + T - S, T, S); }
    if (isWall(x - 1, y)){ const gr = c.createLinearGradient(px, 0, px + S, 0); gr.addColorStop(0, "rgba(0,0,0,0.36)"); gr.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = gr; c.fillRect(px, py, S, T); }
    if (isWall(x + 1, y)){ const gr = c.createLinearGradient(px + T, 0, px + T - S, 0); gr.addColorStop(0, "rgba(0,0,0,0.36)"); gr.addColorStop(1, "rgba(0,0,0,0)"); c.fillStyle = gr; c.fillRect(px + T - S, py, S, T); }
  }
  /* --- walls: top slab + south face + crisp silhouette --- */
  const wallArt = artFor(["wall-" + LV.def.theme]);
  for (let y = 0; y < LV.h; y++) for (let x = 0; x < LV.w; x++){
    if (!isWall(x, y)) continue;
    const px = x * T, py = y * T;
    if (wallArt) c.drawImage(wallArt, px, py, T, T);
    else { c.fillStyle = th.wall; c.fillRect(px, py, T, T); }
    /* south face where the wall meets open floor below (pseudo-3D) */
    if (isFloorish(at(x, y + 1))){
      const gr = c.createLinearGradient(0, py + T - 16, 0, py + T);
      gr.addColorStop(0, th.wallFace); gr.addColorStop(1, "#101511");
      c.fillStyle = gr; c.fillRect(px, py + T - 16, T, 16);
    }
    /* lit top edge (light from north) — translucent over artist walls */
    c.fillStyle = wallArt ? "rgba(255,255,255,0.10)" : th.wallTop;
    c.fillRect(px, py, T, 6);
    if (isFloorish(at(x - 1, y))) c.fillRect(px, py, 4, T);
    /* subtle top texture */
    if (hash2(x, y * 3) < 0.2){ c.fillStyle = "rgba(255,255,255,0.04)"; c.fillRect(px + 6, py + 10, T - 12, 3); }
    if (hash2(x * 7, y) < 0.14){ c.fillStyle = "rgba(0,0,0,0.18)"; c.fillRect(px + 10, py + 20, T - 20, 2); }
  }
  /* wall outline pass — reads like inked architecture */
  c.strokeStyle = "rgba(0,0,0,0.55)"; c.lineWidth = 2;
  for (let y = 0; y < LV.h; y++) for (let x = 0; x < LV.w; x++){
    if (!isWall(x, y)) continue;
    const px = x * T, py = y * T;
    c.beginPath();
    if (!isWall(x, y - 1) && at(x, y - 1) !== " "){ c.moveTo(px, py + 1); c.lineTo(px + T, py + 1); }
    if (!isWall(x, y + 1) && at(x, y + 1) !== " "){ c.moveTo(px, py + T - 1); c.lineTo(px + T, py + T - 1); }
    if (!isWall(x - 1, y) && at(x - 1, y) !== " "){ c.moveTo(px + 1, py); c.lineTo(px + 1, py + T); }
    if (!isWall(x + 1, y) && at(x + 1, y) !== " "){ c.moveTo(px + T - 1, py); c.lineTo(px + T - 1, py + T); }
    c.stroke();
  }
  /* --- low cover + vents --- */
  for (let y = 0; y < LV.h; y++) for (let x = 0; x < LV.w; x++){
    const ch = at(x, y), px = x * T, py = y * T;
    if (ch === "-") lowProp(c, th, x, y, px, py);
    else if (ch === "V"){
      c.fillStyle = "#0a0d11"; c.fillRect(px + 3, py + 3, T - 6, T - 6);
      c.strokeStyle = "rgba(0,0,0,0.6)"; c.lineWidth = 2; c.strokeRect(px + 3, py + 3, T - 6, T - 6);
      c.strokeStyle = "#39464e"; c.lineWidth = 3;
      for (let i = 11; i < T - 8; i += 9){ c.beginPath(); c.moveTo(px + 7, py + i); c.lineTo(px + T - 7, py + i); c.stroke(); }
      c.fillStyle = "rgba(120,160,180,0.08)"; c.fillRect(px + 3, py + 3, T - 6, 4);
    }
  }
  /* --- theme set-dressing --- */
  if (th.seal) drawSeal(c, 22.5 * T, 17 * T);
  if (th.pad) drawPadBake(c);
  if (th.server) bakeServerGlow(c);

  /* --- light plan: lamps in rooms/corridors, warm hut windows, emissives --- */
  /* light plan. Indoors: ceiling lamps on a loose grid. Outdoors: sparse pole
     lights hugging structures — the yard itself stays properly DARK, that's
     the whole point of a night infiltration. */
  LIGHTS = [];
  srand(LV.n * 991);
  const nearWall = (x, y, d) => {
    for (let yy = y - d; yy <= y + d; yy++) for (let xx = x - d; xx <= x + d; xx++)
      if (isWall(xx, yy)) return true;
    return false;
  };
  for (let y = 1; y < LV.h - 1; y++) for (let x = 1; x < LV.w - 1; x++){
    if (at(x, y) !== ".") continue;
    let want = false, warm = !th.outdoor, r = 150;
    if (th.outdoor){
      if (x % 7 === 3 && y % 6 === 2 && nearWall(x, y, 2) && hash2(x, y) < 0.66){ want = true; r = 135 + hash2(x, y * 5) * 40; }
      /* hut/room interiors read warm — enclosed = wall within 1 on 3+ sides */
      const enc = (isWall(x - 1, y) ? 1 : 0) + (isWall(x + 1, y) ? 1 : 0) + (isWall(x, y - 1) ? 1 : 0) + (isWall(x, y + 1) ? 1 : 0)
        + (isWall(x - 1, y - 1) ? 1 : 0) + (isWall(x + 1, y - 1) ? 1 : 0) + (isWall(x - 1, y + 1) ? 1 : 0) + (isWall(x + 1, y + 1) ? 1 : 0);
      if (enc >= 5 && hash2(x * 3, y) < 0.8){ want = true; warm = true; r = 120; }
    } else {
      if (x % 5 === 2 && y % 5 === 2 && hash2(x, y) < 0.7){ want = true; r = 150 + hash2(x, y * 5) * 55; }
      else if (x % 5 === 0 && y % 5 === 4 && hash2(x * 3, y) < 0.22){ want = true; r = 130; }
    }
    if (!want) continue;
    LIGHTS.push({ x: x * T + T / 2, y: y * T + T / 2, r, warm, flick: hash2(x * 9, y) < 0.08 });
    const px = x * T + T / 2, py = y * T + T / 2;
    c.fillStyle = "rgba(0,0,0,0.35)"; c.beginPath(); c.arc(px, py, 7, 0, TAU); c.fill();
    c.fillStyle = warm ? "#ffd9a0" : "#b8d4ff"; c.beginPath(); c.arc(px, py, 4, 0, TAU); c.fill();
    c.fillStyle = "rgba(255,255,255,0.75)"; c.beginPath(); c.arc(px, py, 1.8, 0, TAU); c.fill();
  }
  for (const tmn of LV.terms) LIGHTS.push({ x: tmn.x * T + 24, y: tmn.y * T + 24, r: 90, col: "rgba(90,180,255,", em: true });
  for (const f of LV.files) LIGHTS.push({ x: f.x * T + 24, y: f.y * T + 24, r: 95, col: "rgba(255,210,124,", em: true });
  for (const e of LV.exits) LIGHTS.push({ x: e.x * T + 24, y: e.y * T + 24, r: 80, col: "rgba(124,249,165,", em: true, exit: true });
  /* dust motes live where the light is */
  MOTES = [];
  for (const L of LIGHTS){ if (MOTES.length > 90) break; for (let i = 0; i < 2; i++) MOTES.push({ lx: L.x, ly: L.y, r: rr(8, L.r * 0.7), a: rr(0, TAU), sp: rr(0.1, 0.5), s: rr(0.7, 1.8) }); }

  /* offscreen composite layers */
  LM = document.createElement("canvas"); LM.width = W / 2; LM.height = H / 2; lmg = LM.getContext("2d");
  GLOW = document.createElement("canvas"); GLOW.width = W / 4; GLOW.height = H / 4; glg = GLOW.getContext("2d");
  GLOW2 = document.createElement("canvas"); GLOW2.width = W / 8; GLOW2.height = H / 8; gl2 = GLOW2.getContext("2d");
  lightning = 0; lightningNext = 8 + rnd() * 14;

  /* radar bake */
  RADARPRE = document.createElement("canvas");
  const rs = 3;
  RADARPRE.width = LV.w * rs; RADARPRE.height = LV.h * rs;
  const rc = RADARPRE.getContext("2d");
  rc.fillStyle = "rgba(6,12,9,0.94)"; rc.fillRect(0, 0, RADARPRE.width, RADARPRE.height);
  for (let y = 0; y < LV.h; y++) for (let x = 0; x < LV.w; x++){
    const ch = at(x, y);
    if (ch === "#"){ rc.fillStyle = "#2f5a3f"; rc.fillRect(x * rs, y * rs, rs, rs); }
    else if (ch === " "){ rc.fillStyle = "#040705"; rc.fillRect(x * rs, y * rs, rs, rs); }
    else if (ch === "V"){ rc.fillStyle = "#1a3328"; rc.fillRect(x * rs, y * rs, rs, rs); }
  }
}
/* per-theme floor material detail */
function matDetail(c, th, x, y, px, py){
  const h = hash2(x, y), h2 = hash2(x * 13, y * 7);
  if (th.mat === "grass"){
    if (h < 0.5){ c.fillStyle = "rgba(70,110,60,0.10)"; c.fillRect(px + 4, py + 4, T - 8, T - 8); }
    c.strokeStyle = "rgba(110,160,90,0.16)"; c.lineWidth = 1;
    for (let i = 0; i < 4; i++){
      const gx = px + 6 + hash2(x * 31 + i, y) * 36, gy = py + 8 + hash2(x, y * 17 + i) * 34;
      c.beginPath(); c.moveTo(gx, gy + 4); c.lineTo(gx + 2, gy - 2); c.stroke();
    }
    if (h2 < 0.09){ c.fillStyle = "rgba(30,50,70,0.35)"; c.beginPath(); c.ellipse(px + 24, py + 26, 16, 9, 0, 0, TAU); c.fill();
      c.fillStyle = "rgba(140,180,220,0.06)"; c.beginPath(); c.ellipse(px + 24, py + 25, 13, 6, 0, 0, TAU); c.fill(); }
  } else if (th.mat === "marble"){
    c.fillStyle = ((x + y) & 1) ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.10)";
    c.fillRect(px, py, T, T);
    c.strokeStyle = "rgba(255,255,255,0.05)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(px + 6 + h * 20, py); c.lineTo(px + 20 + h * 16, py + T); c.stroke();
    c.strokeStyle = "rgba(20,24,34,0.5)"; c.strokeRect(px + 0.5, py + 0.5, T, T);
  } else if (th.mat === "carpet"){
    c.fillStyle = (y & 1) ? "rgba(90,110,160,0.05)" : "rgba(0,0,0,0.07)";
    c.fillRect(px, py, T, T);
    if (h < 0.05){ c.fillStyle = "rgba(230,235,245,0.10)"; c.fillRect(px + 12, py + 18, 9, 12); }  // dropped memo
    c.fillStyle = "rgba(0,0,0,0.12)"; c.fillRect(px, py + T - 2, T, 2);
  } else if (th.mat === "wood"){
    c.fillStyle = (y & 1) ? "rgba(120,90,50,0.08)" : "rgba(0,0,0,0.08)";
    c.fillRect(px, py, T, T);
    c.strokeStyle = "rgba(0,0,0,0.22)"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(px, py + 0.5); c.lineTo(px + T, py + 0.5); c.stroke();
    if (h < 0.12){ c.fillStyle = "rgba(60,40,20,0.4)"; c.beginPath(); c.ellipse(px + 10 + h * 28, py + 24, 2.4, 1.4, 0, 0, TAU); c.fill(); }
  } else if (th.mat === "deck"){
    c.strokeStyle = "rgba(120,170,230,0.07)"; c.lineWidth = 1;
    c.strokeRect(px + 1.5, py + 1.5, T - 3, T - 3);
    c.fillStyle = "rgba(150,190,240,0.10)";
    c.fillRect(px + 4, py + 4, 2, 2); c.fillRect(px + T - 6, py + 4, 2, 2);
    c.fillRect(px + 4, py + T - 6, 2, 2); c.fillRect(px + T - 6, py + T - 6, 2, 2);
    if (h < 0.06){ c.fillStyle = "rgba(90,170,255,0.10)"; c.fillRect(px, py + 20, T, 4); }   // cable run
  } else { /* slab */
    if (((x >> 1) + (y >> 1)) & 1){ c.fillStyle = "rgba(255,255,255,0.025)"; c.fillRect(px, py, T, T); }
    c.strokeStyle = "rgba(0,0,0,0.25)"; c.lineWidth = 1;
    if (x % 2 === 0){ c.beginPath(); c.moveTo(px + 0.5, py); c.lineTo(px + 0.5, py + T); c.stroke(); }
    if (y % 2 === 0){ c.beginPath(); c.moveTo(px, py + 0.5); c.lineTo(px + T, py + 0.5); c.stroke(); }
    if (h < 0.05){ c.fillStyle = "rgba(30,40,60,0.3)"; c.beginPath(); c.ellipse(px + 22, py + 24, 14, 8, 0, 0, TAU); c.fill(); }
  }
}
/* low cover: hedges outdoors, real furniture indoors (PNG props win) */
function lowProp(c, th, x, y, px, py){
  const propArt = artFor([th.mat === "grass" ? "hedge" : "desk"]);
  if (propArt){
    c.fillStyle = "rgba(0,0,0,0.4)";
    c.beginPath(); c.ellipse(px + 26, py + 30, 21, 12, 0, 0, TAU); c.fill();
    c.drawImage(propArt, px + 1, py + 1, T - 2, T - 2);
    return;
  }
  if (th.mat === "grass"){
    c.fillStyle = "rgba(0,0,0,0.4)"; c.beginPath(); c.ellipse(px + 26, py + 30, 22, 14, 0, 0, TAU); c.fill();
    for (let i = 0; i < 7; i++){
      const bx = px + 8 + hash2(x * 5 + i, y) * 32, by = py + 8 + hash2(x, y * 5 + i) * 26, br = 8 + hash2(i, x + y) * 7;
      c.fillStyle = i % 2 ? th.low : th.lowTop;
      c.beginPath(); c.arc(bx, by, br, 0, TAU); c.fill();
    }
    c.fillStyle = "rgba(200,255,180,0.10)";
    for (let i = 0; i < 5; i++){ const sx = px + 8 + hash2(x + i * 3, y * 9) * 30, sy = py + 6 + hash2(x * 9, y + i) * 22; c.fillRect(sx, sy, 2.5, 2.5); }
  } else {
    /* desk block with drop shadow + top items */
    c.fillStyle = "rgba(0,0,0,0.4)"; c.fillRect(px + 5, py + 10, T - 6, T - 12);
    const gr = c.createLinearGradient(0, py + 2, 0, py + T - 6);
    gr.addColorStop(0, th.lowTop); gr.addColorStop(1, th.low);
    c.fillStyle = gr; c.fillRect(px + 3, py + 2, T - 6, T - 10);
    c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 1.5; c.strokeRect(px + 3, py + 2, T - 6, T - 10);
    c.fillStyle = "rgba(255,255,255,0.06)"; c.fillRect(px + 3, py + 2, T - 6, 4);
    const h = hash2(x * 3, y * 11);
    if (h < 0.34){ // monitor
      c.fillStyle = "#0c1016"; c.fillRect(px + 12, py + 8, 18, 12);
      c.fillStyle = "rgba(120,220,255,0.5)"; c.fillRect(px + 14, py + 10, 14, 8);
    } else if (h < 0.6){ // papers
      c.fillStyle = "rgba(230,235,240,0.75)"; c.fillRect(px + 10, py + 10, 12, 15);
      c.fillStyle = "rgba(230,235,240,0.5)"; c.fillRect(px + 20, py + 14, 12, 15);
      c.strokeStyle = "rgba(60,70,90,0.5)"; c.lineWidth = 1;
      c.beginPath(); c.moveTo(px + 12, py + 14); c.lineTo(px + 19, py + 14); c.stroke();
    } else if (h < 0.75){ // keyboard + mug
      c.fillStyle = "#141a22"; c.fillRect(px + 9, py + 14, 20, 8);
      c.fillStyle = "#7a4030"; c.beginPath(); c.arc(px + 36, py + 16, 4, 0, TAU); c.fill();
    }
  }
}
function drawSeal(c, sx, sy){
  c.save(); c.translate(sx, sy); c.globalAlpha = 0.75;
  c.strokeStyle = "#59617f"; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, 88, 0, TAU); c.stroke();
  c.strokeStyle = "rgba(200,180,120,0.5)"; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 78, 0, TAU); c.stroke();
  c.lineWidth = 2; c.strokeStyle = "#59617f"; c.beginPath(); c.arc(0, 0, 62, 0, TAU); c.stroke();
  c.fillStyle = "#59617f";
  c.beginPath();
  for (let i = 0; i < 5; i++){
    const a = -Math.PI / 2 + i * TAU / 5, a2 = a + TAU / 10;
    c.lineTo(Math.cos(a) * 42, Math.sin(a) * 42); c.lineTo(Math.cos(a2) * 17, Math.sin(a2) * 17);
  }
  c.closePath(); c.fill();
  c.fillStyle = "rgba(255,255,255,0.10)";
  c.beginPath(); c.ellipse(-20, -26, 46, 20, -0.6, 0, TAU); c.fill();
  c.font = "700 11px Verdana"; c.textAlign = "center"; c.fillStyle = "#767e9e";
  c.fillText("CENTRAL · INTELLIGENCE · AGENCY", 0, 108);
  c.restore(); c.globalAlpha = 1; c.textAlign = "left";
}
function drawPadBake(c){
  const ex = LV.exits.reduce((s, e) => s + e.x, 0) / LV.exits.length * T + T / 2;
  const ey = LV.exits.reduce((s, e) => s + e.y, 0) / LV.exits.length * T + T / 2;
  c.save();
  c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.arc(ex, ey, 78, 0, TAU); c.fill();
  c.strokeStyle = "#d8c452"; c.lineWidth = 7; c.globalAlpha = 0.85;
  c.beginPath(); c.arc(ex, ey, 62, 0, TAU); c.stroke();
  c.setLineDash([10, 8]); c.lineWidth = 2; c.globalAlpha = 0.5;
  c.beginPath(); c.arc(ex, ey, 76, 0, TAU); c.stroke(); c.setLineDash([]);
  c.font = "900 64px Arial Black"; c.fillStyle = "#d8c452"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText("H", ex, ey + 3); c.textBaseline = "alphabetic"; c.textAlign = "left";
  c.restore();
}
function bakeServerGlow(c){
  for (let y = 0; y < LV.h; y++) for (let x = 0; x < LV.w; x++){
    if ((LV.grid[y][x]) !== "#") continue;
    /* server rack faces on interior block walls */
    if ((LV.grid[y + 1] || [])[x] === "." && hash2(x, y) < 0.75 && y > 4 && y < 14){
      const px = x * T, py = y * T;
      const rackArt = artFor(["rack"]);
      if (rackArt){ c.drawImage(rackArt, px + 2, py + T - 18, T - 4, 16); continue; }
      c.fillStyle = "#0c1118"; c.fillRect(px + 4, py + T - 15, T - 8, 12);
      for (let i = 0; i < 5; i++){
        c.fillStyle = ["#57c785", "#4c8fe8", "#e8c33c"][Math.floor(hash2(x * 7 + i, y) * 3)];
        c.globalAlpha = 0.85;
        c.fillRect(px + 7 + i * 8, py + T - 12, 3, 2);
        c.fillRect(px + 7 + i * 8, py + T - 8, 3, 2);
      }
      c.globalAlpha = 1;
    }
  }
}
function markDirty(tx, ty){
  if (!PRE) return;
  const th = themeOf();
  const c = PRE.getContext("2d");
  c.fillStyle = th.floor; c.fillRect(tx * T, ty * T, T, T);
  matDetail(c, th, tx, ty, tx * T, ty * T);
  /* glass leaves glitter */
  c.fillStyle = "rgba(190,230,255,0.25)";
  for (let i = 0; i < 8; i++) c.fillRect(tx * T + 6 + hash2(tx + i, ty) * 34, ty * T + 6 + hash2(tx, ty + i) * 34, 2.5, 2.5);
}

/* ================= entity painters v2 ================= */
function softShadow(x, y, rx, ry){
  const gr = g.createRadialGradient(x, y, 1, x, y, rx);
  gr.addColorStop(0, "rgba(0,0,0,0.42)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
}
function feet(stride, spread, len, col){
  const ph = Math.sin(stride / 9);
  g.fillStyle = col;
  g.beginPath(); g.ellipse(ph * len * 0.5 - 2, -spread, 4.6, 3, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(-ph * len * 0.5 - 2, spread, 4.6, 3, 0, 0, TAU); g.fill();
}

/* THE frog operative — articulated. Hands stay green in every skin.
   If a PNG sprite exists in /assets it takes over (fallback chain:
   per-skin → stance/weapon variant → generic → procedural). */
function drawKJP(x, y, ang, opts){
  const sk = skinDef(), o = opts || {};
  const sneak = P && P.sneak && !o.menu;
  const scale = 1.45 * (sneak ? 0.94 : 1);      // he's the main character — let him read like one
  const w0 = P && !o.menu ? curW() : WEAPONS.tranq;
  const sprite = artFor([
    "kjp-top-" + PROG.skin,
    sneak ? "kjp-top-sneak" : null,
    w0.melee ? "kjp-top-fists" : (w0.dart ? "kjp-top-tranq" : null),
    "kjp-top"
  ].filter(Boolean));
  if (sprite){
    g.save(); g.translate(x, y);
    softShadow(3, 5, 17 * scale, 12 * scale);
    g.rotate(ang); g.scale(scale, scale);
    const S = 58;                               // on-screen box before player scale
    g.drawImage(sprite, -S / 2, -S / 2, S, S);
    g.restore();
    return;
  }
  const breathe = Math.sin(performance.now() / 640) * 0.35;
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(scale, scale);
  softShadow(3, 5, 17, 12);
  const shimmer = sk.shimmer ? `hsl(${(performance.now() / 20) % 360},80%,62%)` : null;
  if (o.moving) feet(P.stride || 0, sneak ? 9 : 7, sneak ? 8 : 12, "#0b0d10");
  const w = P && !o.menu ? wSpec(curWid()) : WEAPONS.tranq;   // spec: suppressor mod shows on the barrel
  /* arms + weapon under the coat line */
  g.strokeStyle = sk.suit; g.lineWidth = 5.4; g.lineCap = "round";
  if (w.melee){
    const jab = P && P.fireT > 0.18 ? 6 : 0;
    g.beginPath(); g.moveTo(2, -9); g.lineTo(15 + jab, -7); g.stroke();
    g.beginPath(); g.moveTo(2, 9); g.lineTo(15, 7); g.stroke();
    g.fillStyle = "#57c785";
    g.beginPath(); g.arc(17 + jab, -7, 4.6, 0, TAU); g.fill();
    g.beginPath(); g.arc(17, 7, 4.6, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.beginPath(); g.arc(16 + jab, -8.4, 1.7, 0, TAU); g.fill();
  } else {
    g.beginPath(); g.moveTo(2, -8); g.lineTo(13.5, -2.2); g.stroke();
    g.beginPath(); g.moveTo(2, 8); g.lineTo(12.5, 3.2); g.stroke();
    drawHeldGun(w, shimmer);
    g.fillStyle = "#57c785";
    g.beginPath(); g.arc(13, 2.4, 4.4, 0, TAU); g.fill();
    g.beginPath(); g.arc(15.5, -2.8, 4, 0, TAU); g.fill();
  }
  /* coat body: radial-lit suit + lapels */
  const bodyGrad = g.createRadialGradient(-3, -4, 2, 0, 0, 16);
  bodyGrad.addColorStop(0, lite(sk.suit, 30)); bodyGrad.addColorStop(1, sk.suit);
  g.fillStyle = bodyGrad;
  g.beginPath(); g.ellipse(0, 0, 13.5 + breathe * 0.4, 11.5 + breathe * 0.4, 0, 0, TAU); g.fill();
  g.strokeStyle = "rgba(0,0,0,0.55)"; g.lineWidth = 1.6;
  g.beginPath(); g.ellipse(0, 0, 13.5, 11.5, 0, 0, TAU); g.stroke();
  g.strokeStyle = "rgba(170,225,195,0.34)"; g.lineWidth = 1.2;
  g.beginPath(); g.ellipse(0, 0, 14.2, 12.2, 0, -2.6, 0.4); g.stroke();     // rim light
  g.strokeStyle = shimmer || sk.trim; g.lineWidth = 2;
  g.beginPath(); g.ellipse(0, 0, 13.4, 11.4, 0, -2.3, -0.9); g.stroke();
  g.beginPath(); g.ellipse(0, 0, 13.4, 11.4, 0, 0.9, 2.3); g.stroke();
  /* shirt + tie */
  g.fillStyle = sk.shirt; g.beginPath(); g.moveTo(6.5, -3.4); g.lineTo(11.5, 0); g.lineTo(6.5, 3.4); g.closePath(); g.fill();
  g.fillStyle = sk.tie; g.beginPath(); g.moveTo(6.5, -1.5); g.lineTo(11, -0.2); g.lineTo(11, 0.2); g.lineTo(6.5, 1.5); g.closePath(); g.fill();
  /* head: green frog + hair curtains + shades */
  const hg = g.createRadialGradient(3, -2, 1, 2, 0, 9);
  hg.addColorStop(0, "#5fc98a"); hg.addColorStop(1, "#3f9861");
  g.fillStyle = hg; g.beginPath(); g.arc(2, 0, 8.6, 0, TAU); g.fill();
  g.strokeStyle = "rgba(0,0,0,0.4)"; g.lineWidth = 1.2; g.beginPath(); g.arc(2, 0, 8.6, 0, TAU); g.stroke();
  g.fillStyle = "#0b0d10";
  g.beginPath(); g.ellipse(-2, -6.6, 7.8, 4.4, -0.5, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(-2, 6.6, 7.8, 4.4, 0.5, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(-4.8, 0, 5.8, 8, 0, 0, TAU); g.fill();
  g.fillStyle = "rgba(255,255,255,0.10)";
  g.beginPath(); g.ellipse(-3.4, -6.2, 3.4, 1.4, -0.5, 0, TAU); g.fill();   // hair shine
  g.fillStyle = "#0e1216"; g.fillRect(4.6, -5.4, 4.6, 10.8);
  const glint = (performance.now() / 900) % 4 < 0.4;
  g.fillStyle = glint ? "rgba(170,235,255,0.65)" : "rgba(140,220,255,0.28)";
  g.fillRect(7.4, -5.4, 1.7, 10.8);
  g.restore();
}
function drawHeldGun(w, shimmer){
  const long = w.scope ? 31 : w.auto ? 23 : w.pellets ? 26 : 17;
  const gunG = g.createLinearGradient(10, -3, 10, 3);
  gunG.addColorStop(0, shimmer || "#2a333f"); gunG.addColorStop(0.5, shimmer || "#0d1117"); gunG.addColorStop(1, "#05070a");
  g.fillStyle = gunG; g.fillRect(10, -3, long, 6);
  g.fillStyle = "rgba(255,255,255,0.14)"; g.fillRect(10, -3, long, 1.4);
  if (w.silenced){ g.fillStyle = "#1b242e"; g.fillRect(10 + long, -2.2, 9, 4.4); g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(10 + long, -2.2, 9, 1.2); }
  if (w.dart){ g.fillStyle = "#2c4a38"; g.fillRect(12, -4.4, 6, 2); }
  if (w.scope){ g.fillStyle = "#0a0e13"; g.fillRect(16, -5, 8, 2.4); }
}
function lite(hex, amt){
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, (n >> 16) + amt), gg = Math.min(255, ((n >> 8) & 255) + amt), b = Math.min(255, (n & 255) + amt);
  return `rgb(${r},${gg},${b})`;
}

function drawGuard(e){
  const gSprite = artFor([e.kind + "-top", "guard-top"]);
  if (gSprite){
    g.save(); g.translate(e.x, e.y);
    if (down(e)){
      g.rotate(1.32); g.globalAlpha = e.dead ? 0.92 : 1;
      softShadow(0, 4, 22, 13);
      g.drawImage(gSprite, -26, -26, 52, 52);
      if (e.sleep > 0){ g.fillStyle = "#57c785"; g.fillRect(2, -9, 3, 8); g.fillStyle = "#ff8f8f"; g.fillRect(1, -12, 5, 3.4); }
      g.restore();
      if (e.sleep > 0 && Math.sin(performance.now() / 320 + e.x) > 0){ g.fillStyle = "rgba(140,200,255,0.8)"; g.font = "700 12px Verdana"; g.fillText("z", e.x + 10, e.y - 12); }
      return;
    }
    softShadow(3, 5, 20, 14);
    g.rotate(e.ang);
    g.drawImage(gSprite, -26, -26, 52, 52);
    g.restore();
    drawGuardOverlays(e);
    return;
  }
  g.save(); g.translate(e.x, e.y); g.scale(1.32, 1.32);
  const officer = e.kind === "officer", sentry = e.kind === "sentry";
  const vest = officer ? "#d3d7e0" : sentry ? "#232e3c" : "#2a3442";
  const vestD = officer ? "#9aa2b4" : sentry ? "#151d28" : "#1a222e";
  if (down(e)){
    g.rotate(1.32 + (e.x % 0.6));
    softShadow(0, 4, 18, 10);
    const bg = g.createLinearGradient(-14, 0, 14, 0);
    bg.addColorStop(0, vestD); bg.addColorStop(0.5, vest); bg.addColorStop(1, vestD);
    g.fillStyle = bg; g.beginPath(); g.ellipse(0, 0, 15, 8, 0, 0, TAU); g.fill();
    g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 1.4; g.beginPath(); g.ellipse(0, 0, 15, 8, 0, 0, TAU); g.stroke();
    /* sprawled limbs */
    g.strokeStyle = vestD; g.lineWidth = 4.4; g.lineCap = "round";
    g.beginPath(); g.moveTo(-8, -6); g.lineTo(-16, -12); g.stroke();
    g.beginPath(); g.moveTo(-6, 7); g.lineTo(-15, 11); g.stroke();
    g.fillStyle = "#c9a37c"; g.beginPath(); g.arc(12.5, 0, 5.6, 0, TAU); g.fill();
    if (e.sleep > 0){
      const br = 1 + Math.sin(performance.now() / 500) * 0.05;
      g.scale(br, br);
      g.fillStyle = "#57c785"; g.fillRect(2, -7, 2.4, 7);      // the dart
      g.fillStyle = "#ff8f8f"; g.fillRect(1.4, -9.4, 3.6, 3);
    }
    g.restore();
    if (e.sleep > 0 && Math.sin(performance.now() / 320 + e.x) > 0){
      g.fillStyle = "rgba(140,200,255,0.8)"; g.font = "700 12px Verdana"; g.fillText("z", e.x + 10, e.y - 12);
    }
    return;
  }
  g.rotate(e.ang);
  softShadow(3, 5, 15, 11);
  if (e.path && e.pathI < (e.path || []).length) feet(e.stride || 0, 7, 12, "#0d1015");
  /* rifle arms */
  g.strokeStyle = vestD; g.lineWidth = 5; g.lineCap = "round";
  g.beginPath(); g.moveTo(1, -7); g.lineTo(12, -2); g.stroke();
  g.beginPath(); g.moveTo(2, 7); g.lineTo(11, 3); g.stroke();
  const gl = e.gun === "smg" ? 21 : 15;
  const gunG = g.createLinearGradient(9, -3, 9, 2.6);
  gunG.addColorStop(0, "#26303c"); gunG.addColorStop(1, "#05070a");
  g.fillStyle = gunG; g.fillRect(9, -2.8, gl, 5.4);
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(9, -2.8, gl, 1.2);
  g.fillStyle = "#c9a37c";
  g.beginPath(); g.arc(11.6, 2.4, 3.6, 0, TAU); g.fill();
  g.beginPath(); g.arc(13.6, -2.6, 3.4, 0, TAU); g.fill();
  /* vest body w/ pouches */
  const bg2 = g.createRadialGradient(-3, -4, 2, 0, 0, 15);
  bg2.addColorStop(0, lite2(vest, 22)); bg2.addColorStop(1, vest);
  g.fillStyle = bg2; g.beginPath(); g.ellipse(0, 0, 12.5, 10.5, 0, 0, TAU); g.fill();
  g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, 0, 12.5, 10.5, 0, 0, TAU); g.stroke();
  g.fillStyle = vestD;
  g.fillRect(-3, -7, 5, 4.4); g.fillRect(-3, 2.6, 5, 4.4);
  g.strokeStyle = vestD; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(-9, -5); g.lineTo(6, -5); g.stroke();
  g.beginPath(); g.moveTo(-9, 5); g.lineTo(6, 5); g.stroke();
  if (officer){ g.fillStyle = "#c8a43c"; g.fillRect(-7, -9.6, 6, 2.6); g.fillRect(-7, 7, 6, 2.6); }  // epaulettes
  /* head: helmet / peaked cap */
  g.fillStyle = "#c9a37c"; g.beginPath(); g.arc(2, 0, 7, 0, TAU); g.fill();
  if (officer){
    g.fillStyle = "#2b3242"; g.beginPath(); g.arc(0.6, 0, 7.4, 0, TAU); g.fill();
    g.fillStyle = "#c8a43c"; g.fillRect(5.4, -3.2, 2.6, 6.4);
    g.fillStyle = "#11161f"; g.beginPath(); g.ellipse(-3.4, 0, 4.4, 7.4, 0, Math.PI * 0.5, Math.PI * 1.5); g.fill();
  } else {
    const hg2 = g.createRadialGradient(1, -2, 1, 0.6, 0, 8);
    hg2.addColorStop(0, sentry ? "#3c4c60" : "#333f4f"); hg2.addColorStop(1, sentry ? "#1c2531" : "#1d2530");
    g.fillStyle = hg2; g.beginPath(); g.arc(0.6, 0, 7.6, 0, TAU); g.fill();
    g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 1; g.beginPath(); g.arc(0.6, 0, 7.6, 0, TAU); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.12)"; g.beginPath(); g.ellipse(-1.4, -3, 3.6, 1.6, -0.4, 0, TAU); g.fill();
  }
  g.restore();
  drawGuardOverlays(e);
}
/* radio ring + "!"/"?" pop + detect meter — shared by sprite & procedural paths */
function drawGuardOverlays(e){
  if (e.st === "alert" && e.radioT > 0){
    const frac = 1 - e.radioT / (e.radioBase * (skinDef().radioMul || 1));
    g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 5;
    g.beginPath(); g.arc(e.x, e.y - 30, 9, 0, TAU); g.stroke();
    g.strokeStyle = "#ff5b5b"; g.lineWidth = 3;
    g.beginPath(); g.arc(e.x, e.y - 30, 9, -Math.PI / 2, -Math.PI / 2 + TAU * frac); g.stroke();
    g.font = "900 9px Arial Black"; g.fillStyle = "#ff8f8f"; g.textAlign = "center";
    g.fillText("RADIO", e.x, e.y - 44); g.textAlign = "left";
  }
  if (e.popT > 0){
    const s = 1 + e.popT * 1.1;
    g.font = "900 " + Math.round(20 * s) + "px Arial Black"; g.textAlign = "center";
    g.fillStyle = "rgba(0,0,0,0.6)";
    g.fillText(e.pop, e.x + 2, e.y - 28 + 2);
    g.fillStyle = e.pop === "!" ? "#ff5b5b" : "#ffd54f";
    g.fillText(e.pop, e.x, e.y - 30);
    g.textAlign = "left";
  }
  if (e.detect > 0.05 && e.detect < 1){
    g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(e.x - 14, e.y - 27, 28, 5);
    g.fillStyle = e.detect > 0.45 ? "#ffd54f" : "#9db4cc";
    g.fillRect(e.x - 13, e.y - 26, 26 * e.detect, 3);
  }
}
function lite2(hex, amt){ return lite(hex, amt); }

function drawDog(e){
  const dSprite = artFor(["dog-top"]);
  if (dSprite){
    g.save(); g.translate(e.x, e.y);
    if (down(e)){ g.rotate(1.2); softShadow(0, 3, 17, 9); g.globalAlpha = 0.95; }
    else { softShadow(2, 4, 15, 9); g.rotate(e.ang); }
    g.drawImage(dSprite, -22, -22, 44, 44);
    if (down(e) && e.sleep > 0){ g.fillStyle = "#57c785"; g.fillRect(-2, -8, 2.6, 7); }
    g.restore();
    if (!down(e) && e.detect > 0.05 && e.detect < 1){
      g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(e.x - 11, e.y - 17, 22, 5);
      g.fillStyle = "#ff9d5b"; g.fillRect(e.x - 10, e.y - 16, 20 * e.detect, 3);
    }
    if (down(e) && e.sleep > 0 && Math.sin(performance.now() / 320) > 0){ g.fillStyle = "rgba(140,200,255,0.8)"; g.font = "700 12px Verdana"; g.fillText("z", e.x + 8, e.y - 10); }
    return;
  }
  g.save(); g.translate(e.x, e.y); g.scale(1.24, 1.24);
  if (down(e)){
    g.rotate(1.2);
    softShadow(0, 3, 14, 7);
    g.fillStyle = "#3a2e22"; g.beginPath(); g.ellipse(0, 0, 13, 6, 0, 0, TAU); g.fill();
    g.strokeStyle = "#241c14"; g.lineWidth = 3; g.lineCap = "round";
    g.beginPath(); g.moveTo(4, 4); g.lineTo(10, 9); g.stroke();
    if (e.sleep > 0){ g.fillStyle = "#57c785"; g.fillRect(-2, -7, 2.2, 6); }
    g.restore();
    if (e.sleep > 0 && Math.sin(performance.now() / 320) > 0){ g.fillStyle = "rgba(140,200,255,0.8)"; g.font = "700 12px Verdana"; g.fillText("z", e.x + 8, e.y - 10); }
    return;
  }
  g.rotate(e.ang);
  softShadow(2, 4, 12, 7);
  /* trotting legs */
  const ph = (e.stride || 0) / 7;
  g.strokeStyle = "#241c14"; g.lineWidth = 2.6; g.lineCap = "round";
  for (let i = 0; i < 4; i++){
    const off = i < 2 ? 5 : -7, side = (i % 2) ? 4 : -4;
    const kick = Math.sin(ph + i * Math.PI / 2) * 3.4;
    g.beginPath(); g.moveTo(off, side); g.lineTo(off + kick, side * 1.7); g.stroke();
  }
  const bg = g.createLinearGradient(0, -6, 0, 6);
  bg.addColorStop(0, "#4a3b2c"); bg.addColorStop(1, "#2c2218");
  g.fillStyle = bg; g.beginPath(); g.ellipse(-2, 0, 11.5, 5.6, 0, 0, TAU); g.fill();
  /* harness */
  g.fillStyle = "#7a2c2c"; g.fillRect(-4, -5.6, 4.6, 11.2);
  g.fillStyle = "#ffd27c"; g.font = "900 5px Arial"; g.textAlign = "center"; g.fillText("K9", -1.6, 1.8); g.textAlign = "left";
  g.fillStyle = "#4a3b2c"; g.beginPath(); g.arc(9, 0, 5, 0, TAU); g.fill();
  g.fillStyle = "#241c14"; g.beginPath(); g.arc(12.6, 0, 2.6, 0, TAU); g.fill();
  /* ears: up when alert */
  const earUp = e.st === "alert" ? 3.4 : 2.2;
  g.fillStyle = "#241c14";
  g.beginPath(); g.moveTo(6, -3.4); g.lineTo(4.4, -3.4 - earUp); g.lineTo(7.6, -4.6); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(6, 3.4); g.lineTo(4.4, 3.4 + earUp); g.lineTo(7.6, 4.6); g.closePath(); g.fill();
  const wag = Math.sin(performance.now() / (e.st === "alert" ? 60 : 220)) * 0.55;
  g.strokeStyle = "#3a2e22"; g.lineWidth = 3; g.beginPath(); g.moveTo(-13, 0); g.lineTo(-18, wag * 7); g.stroke();
  if (e.st === "alert"){ g.fillStyle = "#ff5b5b"; g.fillRect(7, -3.2, 1.8, 1.8); g.fillRect(7, 1.4, 1.8, 1.8); }
  g.restore();
  if (e.detect > 0.05 && e.detect < 1){
    g.fillStyle = "rgba(0,0,0,0.6)"; g.fillRect(e.x - 11, e.y - 17, 22, 5);
    g.fillStyle = "#ff9d5b"; g.fillRect(e.x - 10, e.y - 16, 20 * e.detect, 3);
  }
}
function drawCiv(e){
  const cSprite = artFor(["civ-top"]);
  if (cSprite){
    g.save(); g.translate(e.x, e.y);
    if (e.dead || e.sleep > 0 || e.ko > 0){ g.rotate(1.3); softShadow(0, 3, 17, 9); }
    else { softShadow(2, 4, 15, 10); g.rotate(e.ang); }
    g.drawImage(cSprite, -24, -24, 48, 48);
    g.restore();
    return;
  }
  g.save(); g.translate(e.x, e.y); g.scale(1.3, 1.3);
  if (e.dead || e.sleep > 0 || e.ko > 0){
    g.rotate(1.3);
    softShadow(0, 3, 15, 8);
    g.fillStyle = e.shirt; g.beginPath(); g.ellipse(0, 0, 13, 7, 0, 0, TAU); g.fill();
    g.fillStyle = "#d9b28c"; g.beginPath(); g.arc(10.6, 0, 5, 0, TAU); g.fill();
    if (e.sleep > 0){ g.fillStyle = "#57c785"; g.fillRect(0, -6.4, 2.2, 6); }
    g.restore(); return;
  }
  g.rotate(e.ang);
  softShadow(2, 4, 13, 9);
  const run = e.st === "panic";
  if (e.route.length > 1 || run) feet(e.stride || 0, 6, run ? 15 : 9, "#101216");
  const sh = e.st === "cower" ? Math.sin(performance.now() / 46) * 1.3 : 0;
  const bg = g.createRadialGradient(-2, -3, 2, 0, 0, 13);
  bg.addColorStop(0, lite(e.shirt, 26)); bg.addColorStop(1, e.shirt);
  g.fillStyle = bg; g.beginPath(); g.ellipse(sh, 0, 11, 9, 0, 0, TAU); g.fill();
  g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = 1.3; g.beginPath(); g.ellipse(sh, 0, 11, 9, 0, 0, TAU); g.stroke();
  /* lanyard */
  g.strokeStyle = "#c94c4c"; g.lineWidth = 1.6;
  g.beginPath(); g.moveTo(3, -4); g.lineTo(8, 0); g.lineTo(3, 4); g.stroke();
  g.fillStyle = "#e8ecf4"; g.fillRect(7, -1.6, 4.6, 3.2);
  if (e.freeze > 0){
    g.strokeStyle = e.shirt; g.lineWidth = 4; g.lineCap = "round";
    g.beginPath(); g.moveTo(-2, -8); g.lineTo(-11, -14); g.stroke();
    g.beginPath(); g.moveTo(-2, 8); g.lineTo(-11, 14); g.stroke();
    g.fillStyle = "#d9b28c";
    g.beginPath(); g.arc(-12, -15, 2.6, 0, TAU); g.fill();
    g.beginPath(); g.arc(-12, 15, 2.6, 0, TAU); g.fill();
  } else if (run){
    g.strokeStyle = e.shirt; g.lineWidth = 4; g.lineCap = "round";
    const fl = Math.sin(performance.now() / 70) * 5;
    g.beginPath(); g.moveTo(0, -8); g.lineTo(-8, -12 + fl); g.stroke();
    g.beginPath(); g.moveTo(0, 8); g.lineTo(-8, 12 - fl); g.stroke();
  } else {
    /* coffee in hand. essential agency equipment */
    g.strokeStyle = e.shirt; g.lineWidth = 4; g.lineCap = "round";
    g.beginPath(); g.moveTo(2, 7); g.lineTo(10, 6); g.stroke();
    g.fillStyle = "#e8ecf4"; g.fillRect(9, 3.4, 4.6, 5.2);
  }
  g.fillStyle = "#d9b28c"; g.beginPath(); g.arc(2, 0, 6.6, 0, TAU); g.fill();
  g.fillStyle = e.hair || (e.hair = ["#3c3428", "#1e1a14", "#6a5638", "#8a8a8a"][Math.floor(hash2(e.x, e.y) * 4)]);
  g.beginPath(); g.arc(0.5, 0, 6.8, Math.PI * 0.55, Math.PI * 1.45); g.fill();
  g.restore();
}
function drawCam(e){
  g.save(); g.translate(e.x, e.y);
  g.fillStyle = "#0d1219"; g.fillRect(-8, -8, 16, 16);
  g.strokeStyle = "rgba(0,0,0,0.6)"; g.strokeRect(-8, -8, 16, 16);
  g.rotate(e.ang);
  const bg = g.createLinearGradient(0, -5, 0, 5);
  bg.addColorStop(0, e.dead ? "#333a42" : "#2c3a4c"); bg.addColorStop(1, e.dead ? "#20262c" : "#141d28");
  g.fillStyle = bg; g.fillRect(-2, -5.4, 19, 10.8);
  g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(-2, -5.4, 19, 2.2);
  g.fillStyle = "#05080c"; g.beginPath(); g.arc(17, 0, 3.6, 0, TAU); g.fill();
  g.fillStyle = e.dead ? "#3a4148" : (e.detect > 0.4 ? "#ff5b5b" : "#57c785");
  g.beginPath(); g.arc(17, 0, 2, 0, TAU); g.fill();
  if (!e.dead && Math.sin(performance.now() / 500) > 0.4){ g.fillStyle = "#ff5b5b"; g.fillRect(-5.4, -3, 2, 2); }
  g.restore();
}

/* ================= cones (as light + as intel) ================= */
function conePoly(e, range, fov, steps){
  const pts = [];
  for (let i = 0; i <= steps; i++){
    const a = e.ang - fov / 2 + fov * i / steps;
    const d = ray(e.x, e.y, a, range);
    pts.push([e.x + Math.cos(a) * d, e.y + Math.sin(a) * d]);
  }
  return pts;
}
/* cone tint draws ABOVE the darkness (crisp intel overlay, MGS-style);
   the light-punch into LM happens separately in the world pass. */
function drawConeTint(e, pts, range, fov, tint, edge){
  const gr = g.createRadialGradient(e.x, e.y, 6, e.x, e.y, range);
  gr.addColorStop(0, tint[0]); gr.addColorStop(0.75, tint[1]); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(e.x, e.y);
  for (const [px, py] of pts) g.lineTo(px, py);
  g.closePath(); g.fill();
  g.strokeStyle = edge; g.lineWidth = 1; g.stroke();
  const bandR = (performance.now() / 900 + e.x * 0.01) % 1 * range;
  g.save(); g.clip();
  g.strokeStyle = "rgba(255,255,255,0.08)"; g.lineWidth = 7;
  g.beginPath(); g.arc(e.x, e.y, bandR, e.ang - fov / 2, e.ang + fov / 2); g.stroke();
  g.restore();
}
function coneColors(e){
  if (e.st === "alert" || e.detect >= 1) return [["rgba(255,70,70,0.20)", "rgba(255,60,60,0.10)"], "rgba(255,90,90,0.34)"];
  if (e.st === "susp" || e.detect > 0.45) return [["rgba(255,190,70,0.17)", "rgba(255,180,60,0.08)"], "rgba(255,200,90,0.3)"];
  return [["rgba(190,235,255,0.13)", "rgba(150,220,190,0.05)"], "rgba(170,230,210,0.16)"];
}

/* ================= lightmap ================= */
function lmCone(e, range, fov, pts){
  lmg.save(); lmg.scale(0.5, 0.5); lmg.translate(-camX, -camY);
  const gr = lmg.createRadialGradient(e.x, e.y, 4, e.x, e.y, range);
  gr.addColorStop(0, "rgba(255,255,255,0.85)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  lmg.globalCompositeOperation = "destination-out";
  lmg.fillStyle = gr;
  lmg.beginPath(); lmg.moveTo(e.x, e.y);
  for (const [px, py] of pts) lmg.lineTo(px, py);
  lmg.closePath(); lmg.fill();
  lmg.restore(); lmg.globalCompositeOperation = "source-over";
}
function lmLight(x, y, r, a){
  lmg.save(); lmg.scale(0.5, 0.5); lmg.translate(-camX, -camY);
  const gr = lmg.createRadialGradient(x, y, r * 0.12, x, y, r);
  gr.addColorStop(0, "rgba(255,255,255," + a + ")"); gr.addColorStop(1, "rgba(255,255,255,0)");
  lmg.globalCompositeOperation = "destination-out";
  lmg.fillStyle = gr; lmg.beginPath(); lmg.arc(x, y, r, 0, TAU); lmg.fill();
  lmg.restore(); lmg.globalCompositeOperation = "source-over";
}
function glowBlob(x, y, r, col){
  glg.save(); glg.scale(0.25, 0.25); glg.translate(-camX, -camY);
  const gr = glg.createRadialGradient(x, y, 1, x, y, r);
  gr.addColorStop(0, col + "0.8)"); gr.addColorStop(1, col + "0)");
  glg.fillStyle = gr; glg.beginPath(); glg.arc(x, y, r, 0, TAU); glg.fill();
  glg.restore();
}

/* ================= frame ================= */
function drawGame(){
  const th = themeOf();
  const lookX = clamp((MOUSE.x - W / 2) * 0.18, -110, 110);
  const lookY = clamp((MOUSE.y - H / 2) * 0.18, -70, 70);
  camX = clamp(P.x - W / 2 + (IS_TOUCH ? 0 : lookX), 0, Math.max(0, LV.w * T - W));
  camY = clamp(P.y - H / 2 + (IS_TOUCH ? 0 : lookY), 0, Math.max(0, LV.h * T - H));
  if (shakeT > 0){ shakeT -= 1 / 60; camX += (rnd() - 0.5) * shakeAmp * 2; camY += (rnd() - 0.5) * shakeAmp * 2; if (shakeT <= 0) shakeAmp = 0; }

  /* reset light layers */
  lmg.setTransform(1, 0, 0, 1, 0, 0);
  lmg.clearRect(0, 0, LM.width, LM.height);
  lmg.fillStyle = "rgba(4,8,16," + th.ambient + ")";
  lmg.fillRect(0, 0, LM.width, LM.height);
  glg.setTransform(1, 0, 0, 1, 0, 0);
  glg.clearRect(0, 0, GLOW.width, GLOW.height);

  g.save(); g.translate(-Math.round(camX), -Math.round(camY));
  g.drawImage(PRE, Math.round(camX), Math.round(camY), W, H, Math.round(camX), Math.round(camY), W, H);

  /* decals */
  for (const d of LV.decals){
    d.r = Math.min(d.max || d.r, d.r + 0.06);
    g.fillStyle = d.col; g.beginPath(); g.ellipse(d.x, d.y, d.r, d.r * 0.72, 0, 0, TAU); g.fill();
  }
  /* static lights → punch lightmap + glow + motes */
  const vis = L => L.x > camX - 260 && L.x < camX + W + 260 && L.y > camY - 260 && L.y < camY + H + 260;
  for (const L of LIGHTS){
    if (!vis(L)) continue;
    if (L.dead){
      /* shot-out fixture: dark cap + a last dying spark now and then */
      g.fillStyle = "rgba(6,8,11,0.9)"; g.beginPath(); g.arc(L.x, L.y, 6, 0, TAU); g.fill();
      g.strokeStyle = "rgba(120,140,160,0.25)"; g.lineWidth = 1;
      g.beginPath(); g.moveTo(L.x - 4, L.y - 3); g.lineTo(L.x + 4, L.y + 3); g.stroke();
      if (Math.random() < 0.004){ g.fillStyle = "#ffd27c"; g.fillRect(L.x - 1, L.y - 1, 2, 2); }
      continue;
    }
    let a = L.em ? 0.55 : 0.72;
    if (L.flick && Math.sin(performance.now() / 90 + L.x) > 0.86) a *= 0.4;
    if (L.exit){ const on = LV.hacks >= (LV.def.hacksNeed || 0) && (!LV.def.fileNeed || LV.file) || LV.def.exfil; a = on ? 0.6 : 0.18; }
    lmLight(L.x, L.y, L.r, a);
    glowBlob(L.x, L.y, L.r * 0.5, L.col || (L.warm ? th.lampWarm : th.lampCol));
  }
  for (const M of MOTES){
    M.a += M.sp * 0.016;
    const mx = M.lx + Math.cos(M.a) * M.r, my = M.ly + Math.sin(M.a * 0.7) * M.r * 0.6;
    if (mx < camX || mx > camX + W || my < camY || my > camY + H) continue;
    g.fillStyle = "rgba(255,244,214,0.16)"; g.fillRect(mx, my, M.s, M.s);
  }
  /* player pool of light */
  lmLight(P.x, P.y, 250, 0.86);

  /* glass */
  for (let y = Math.floor(camY / T); y <= Math.floor((camY + H) / T); y++)
    for (let x = Math.floor(camX / T); x <= Math.floor((camX + W) / T); x++){
      if (tileAt(x, y) !== "=") continue;
      const px = x * T, py = y * T;
      g.fillStyle = "rgba(150,200,240,0.14)"; g.fillRect(px + 2, py + 2, T - 4, T - 4);
      g.strokeStyle = "rgba(190,225,255,0.55)"; g.lineWidth = 2; g.strokeRect(px + 2, py + 2, T - 4, T - 4);
      g.strokeStyle = "rgba(255,255,255,0.18)"; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(px + 7, py + T - 7); g.lineTo(px + T - 7, py + 7); g.stroke();
      g.beginPath(); g.moveTo(px + 14, py + T - 6); g.lineTo(px + T - 6, py + 14); g.stroke();
    }
  /* exits */
  const objsDone = LV.hacks >= (LV.def.hacksNeed || 0) && (!LV.def.fileNeed || LV.file);
  for (const e of LV.exits){
    const on = objsDone || LV.def.exfil;
    const pulse = 0.5 + Math.sin(performance.now() / 300) * 0.4;
    g.fillStyle = on ? `rgba(124,249,165,${0.10 + pulse * 0.1})` : "rgba(150,160,180,0.05)";
    g.fillRect(e.x * T + 2, e.y * T + 2, T - 4, T - 4);
    g.strokeStyle = on ? `rgba(124,249,165,${0.4 + pulse * 0.3})` : "rgba(150,160,180,0.18)";
    g.lineWidth = 2; g.strokeRect(e.x * T + 5, e.y * T + 5, T - 10, T - 10);
    if (on){
      /* marching chevrons */
      const ph = (performance.now() / 240) % 12;
      g.strokeStyle = "rgba(124,249,165,0.5)"; g.lineWidth = 2.4;
      for (let i = 0; i < 2; i++){
        const yy = e.y * T + 10 + ((ph + i * 6) % 12) * 2.4;
        g.beginPath(); g.moveTo(e.x * T + 14, yy + 5); g.lineTo(e.x * T + 24, yy - 3); g.lineTo(e.x * T + 34, yy + 5); g.stroke();
      }
    }
  }
  /* lasers */
  for (const l of (LV.def.lasers || [])){
    const x1 = l.x1 * T + 24, y1 = l.y1 * T + 24, x2 = l.x2 * T + 24, y2 = l.y2 * T + 24;
    g.fillStyle = "#39424e"; g.fillRect(x1 - 5, y1 - 5, 10, 10); g.fillRect(x2 - 5, y2 - 5, 10, 10);
    g.fillStyle = "#ff5b5b"; g.fillRect(x1 - 2, y1 - 2, 4, 4); g.fillRect(x2 - 2, y2 - 2, 4, 4);
    if (l.on){
      const fl = 0.75 + Math.sin(performance.now() / 60 + l.phase * 9) * 0.25;
      g.strokeStyle = `rgba(255,60,60,${0.28 * fl})`; g.lineWidth = 5;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = `rgba(255,120,120,${0.9 * fl})`; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = `rgba(255,255,255,${0.5 * fl})`; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      glowBlob((x1 + x2) / 2, (y1 + y2) / 2, Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 0.5 + 26, "rgba(255,70,70,");
    }
  }
  /* pickups */
  for (const p of LV.picks){
    if (p.got) continue;
    const bx = p.x * T + 24, by = p.y * T + 24 + Math.sin(performance.now() / 350 + p.x) * 3;
    const ring = 0.5 + Math.sin(performance.now() / 260 + p.y) * 0.5;
    g.strokeStyle = `rgba(255,255,255,${0.05 + ring * 0.07})`; g.lineWidth = 1.4;
    g.beginPath(); g.arc(bx, by, 15 + ring * 2.4, 0, TAU); g.stroke();
    if (p.k === "card"){
      const cc = p.card === "y" ? "#e8c33c" : p.card === "b" ? "#4c8fe8" : "#e84c5b";
      g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(bx - 8, by - 3, 16, 10);
      g.fillStyle = cc; g.fillRect(bx - 8, by - 5, 16, 10);
      g.fillStyle = "rgba(255,255,255,0.7)"; g.fillRect(bx - 8, by - 5, 16, 3);
      g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(bx - 4, by - 0.4, 8, 3);
      glowBlob(bx, by, 30, "rgba(" + (p.card === "y" ? "232,195,60," : p.card === "b" ? "76,143,232," : "232,76,91,"));
    } else if (p.k === "intel"){
      g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(bx - 5, by - 6, 12, 16);
      g.fillStyle = "#e8edf5"; g.fillRect(bx - 6, by - 8, 12, 16);
      g.fillStyle = "#c94c4c"; g.fillRect(bx - 6, by - 8, 12, 3.4);
      g.font = "900 5px Arial"; g.fillStyle = "#fff"; g.textAlign = "center"; g.fillText("TOP SECRET", bx, by - 5.4); g.textAlign = "left";
      g.strokeStyle = "#7c8ba3"; g.lineWidth = 1;
      for (let i = -1; i <= 4; i += 2.6){ g.beginPath(); g.moveTo(bx - 4, by + i); g.lineTo(bx + 4, by + i); g.stroke(); }
    } else if (p.k === "darts"){
      g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(bx - 7, by - 2, 14, 8);
      g.fillStyle = "#2c4a38"; g.fillRect(bx - 7, by - 4, 14, 8);
      g.fillStyle = "#57c785"; g.fillRect(bx - 5, by - 2.4, 10, 4.8);
      g.fillStyle = "#0f1a14"; for (let i = 0; i < 3; i++) g.fillRect(bx - 3.4 + i * 3.4, by - 1.6, 1.6, 3.2);
    } else {
      g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(bx - 7, by - 5, 14, 14);
      g.fillStyle = "#eef0f5"; g.fillRect(bx - 7, by - 7, 14, 14);
      g.fillStyle = "#e84c5b"; g.fillRect(bx - 4.6, by - 1.6, 9.2, 3.2); g.fillRect(bx - 1.6, by - 4.6, 3.2, 9.2);
      const hb = 1 + Math.sin(performance.now() / 300) * 0.08; // it has a pulse
      g.save(); g.translate(bx, by); g.scale(hb, hb); g.strokeStyle = "rgba(232,76,91,0.35)"; g.lineWidth = 1.4; g.strokeRect(-8.4, -8.4, 16.8, 16.8); g.restore();
    }
  }
  /* terminals + files */
  for (const t of LV.terms){
    const bx = t.x * T + 24, by = t.y * T + 24;
    g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(bx - 10, by - 6, 20, 16);
    const tg = g.createLinearGradient(0, by - 8, 0, by + 8);
    tg.addColorStop(0, "#1d2836"); tg.addColorStop(1, "#0b1017");
    g.fillStyle = tg; g.fillRect(bx - 10, by - 8, 20, 16);
    g.fillStyle = t.done ? "#57c785" : "#4c8fe8";
    g.globalAlpha = t.done ? 0.95 : 0.55 + Math.sin(performance.now() / 200) * 0.3;
    g.fillRect(bx - 7, by - 5, 14, 8);
    g.globalAlpha = 1;
    g.fillStyle = "rgba(255,255,255,0.5)";
    if (!t.done) for (let i = 0; i < 3; i++) if (Math.sin(performance.now() / 130 + i * 2) > 0.3) g.fillRect(bx - 5 + i * 4, by - 3.4, 2.6, 1.2);
    if (t.prog > 0 && !t.done){
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 5; g.beginPath(); g.arc(bx, by, 17, 0, TAU); g.stroke();
      g.strokeStyle = "#7cf9a5"; g.lineWidth = 3;
      g.beginPath(); g.arc(bx, by, 17, -Math.PI / 2, -Math.PI / 2 + TAU * t.prog); g.stroke();
    }
  }
  for (const f of LV.files){
    if (LV.file) continue;
    const bx = f.x * T + 24, by = f.y * T + 24;
    const fl = 0.6 + Math.sin(performance.now() / 220) * 0.4;
    g.fillStyle = "rgba(0,0,0,0.45)"; g.fillRect(bx - 9, by - 5, 18, 14);
    g.fillStyle = "#14100a"; g.fillRect(bx - 9, by - 7, 18, 14);
    g.fillStyle = "#ffd27c"; g.fillRect(bx - 9, by - 7, 18, 3.4);
    g.fillStyle = "#0a0806"; g.fillRect(bx - 9, by - 7, 7, 3.4);
    g.font = "900 6px Arial"; g.fillStyle = "#ffd27c"; g.textAlign = "center";
    g.fillText("K J P", bx, by + 3); g.textAlign = "left";
    g.strokeStyle = `rgba(255,210,124,${0.3 * fl})`; g.lineWidth = 1.6;
    g.strokeRect(bx - 12, by - 10, 24, 20);
    if (LV.fileProg > 0){
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 5; g.beginPath(); g.arc(bx, by, 18, 0, TAU); g.stroke();
      g.strokeStyle = "#ffd27c"; g.lineWidth = 3;
      g.beginPath(); g.arc(bx, by, 18, -Math.PI / 2, -Math.PI / 2 + TAU * LV.fileProg); g.stroke();
    }
  }
  /* alarm panels + detectors */
  for (const pn of LV.panels){
    const px = pn.x * T, py = pn.y * T;
    g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(px + 15, py + 16, 20, 20);
    g.fillStyle = pn.pulled ? "#8f2f2f" : "#5b2026"; g.fillRect(px + 14, py + 14, 20, 20);
    g.strokeStyle = "rgba(0,0,0,0.6)"; g.strokeRect(px + 14, py + 14, 20, 20);
    g.fillStyle = pn.pulled ? "#ff6b6b" : "#c94c4c"; g.fillRect(px + 20, py + 18, 8, 12);
    g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(px + 20, py + 18, 8, 3);
    if (pn.pulled && Math.sin(performance.now() / 140) > 0) glowBlob(px + 24, py + 24, 70, "rgba(255,60,60,");
  }
  for (const m of LV.dets){
    const px = m.x * T, py = m.y * T;
    const pg = g.createLinearGradient(0, py, 0, py + T);
    pg.addColorStop(0, "#3b4a60"); pg.addColorStop(1, "#222c3c");
    g.fillStyle = pg; g.fillRect(px + 1, py, 7, T); g.fillRect(px + T - 8, py, 7, T);
    g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(px + 1, py, 7, 4); g.fillRect(px + T - 8, py, 7, 4);
    if (m.ping > 0){
      g.fillStyle = `rgba(255,60,60,${m.ping / 3 * 0.4})`; g.fillRect(px, py, T, T);
      glowBlob(px + 24, py + 24, 60, "rgba(255,60,60,");
    } else {
      const scan = (performance.now() / 700) % 1;
      g.fillStyle = "rgba(90,200,140,0.16)"; g.fillRect(px + 8, py + scan * (T - 4), T - 16, 3);
    }
  }
  /* doors */
  for (const d of LV.doors) drawDoor(d);

  /* noise rings — only sounds loud enough to matter get drawn, otherwise
     walking paints a permanent halo on the player */
  for (const nz of LV.noises){
    if (nz.r < 90) continue;
    g.strokeStyle = `rgba(140,200,255,${nz.t * 0.3 * clamp(nz.r / 200, 0, 1)})`; g.lineWidth = 2;
    g.beginPath(); g.arc(nz.x, nz.y, nz.r * (1 - nz.t / 0.5) + 12, 0, TAU); g.stroke();
  }
  /* cones — punch the lightmap now (flashlights), tint later above the dark */
  const margin = 420;
  const coneTints = [];
  for (const e of LV.guards){
    if (down(e) || e.x < camX - margin || e.x > camX + W + margin || e.y < camY - margin || e.y > camY + H + margin) continue;
    const range = e.range * (skinDef().detectMul || 1);
    const pts = conePoly(e, range, e.fov, 20);
    lmCone(e, range, e.fov, pts);
    const [f, s] = coneColors(e);
    coneTints.push({ e, pts, range, fov: e.fov, f, s });
  }
  for (const e of LV.cams){
    if (e.dead) continue;
    if (e.x < camX - margin || e.x > camX + W + margin || e.y < camY - margin || e.y > camY + H + margin) continue;
    const pts = conePoly(e, e.range, 0.55, 14);
    lmCone(e, e.range, 0.55, pts);
    coneTints.push({ e, pts, range: e.range, fov: 0.55,
      f: e.detect > 0.4 ? ["rgba(255,70,70,0.18)", "rgba(255,60,60,0.08)"] : ["rgba(120,180,255,0.13)", "rgba(110,170,255,0.06)"],
      s: "rgba(140,190,255,0.25)" });
  }
  for (const e of LV.dogs){
    if (down(e)) continue;
    /* sniff wisps */
    const n = e.st === "alert" ? 3 : 2;
    for (let i = 0; i < n; i++){
      const a = performance.now() / 800 + i * TAU / n, r = 120 + Math.sin(performance.now() / 500 + i) * 24;
      g.strokeStyle = e.st === "alert" ? "rgba(255,120,60,0.14)" : "rgba(190,150,90,0.10)";
      g.lineWidth = 2; g.setLineDash([7, 11]);
      g.beginPath(); g.arc(e.x, e.y, r * (0.5 + i * 0.25), a, a + 1.6); g.stroke();
    }
    g.setLineDash([]);
  }
  /* entities: downed first, then upright, then cams */
  for (const e of LV.civs) if (e.dead || e.sleep > 0 || e.ko > 0) drawCiv(e);
  for (const e of LV.guards) if (down(e)) drawGuard(e);
  for (const e of LV.dogs) if (down(e)) drawDog(e);
  for (const e of LV.civs) if (!(e.dead || e.sleep > 0 || e.ko > 0)) drawCiv(e);
  for (const e of LV.guards) if (!down(e)) drawGuard(e);
  for (const e of LV.dogs) if (!down(e)) drawDog(e);
  for (const e of LV.cams) drawCam(e);
  /* coins in flight */
  for (const cn of LV.coins){
    if (cn.done) continue;
    g.save(); g.translate(cn.x, cn.y); g.rotate(cn.spin);
    g.fillStyle = "#ffd27c"; g.beginPath(); g.ellipse(0, 0, 3.4, 2.2, 0, 0, TAU); g.fill();
    g.fillStyle = "rgba(255,255,255,0.6)"; g.fillRect(-1, -1, 2, 1);
    g.restore();
    glowBlob(cn.x, cn.y, 14, "rgba(255,210,124,");
  }
  /* laser sight mod: a thin visible beam to the first thing it touches */
  if (!P.dead && !curW().melee){
    const spec = wSpec(curWid());
    if (spec.laser){
      const d = ray(P.x, P.y, P.ang, 480);
      const lx = P.x + Math.cos(P.ang) * d, ly = P.y + Math.sin(P.ang) * d;
      g.strokeStyle = "rgba(255,60,60,0.35)"; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(P.x + Math.cos(P.ang) * 26, P.y + Math.sin(P.ang) * 26); g.lineTo(lx, ly); g.stroke();
      g.fillStyle = "rgba(255,90,90,0.9)"; g.beginPath(); g.arc(lx, ly, 2.2, 0, TAU); g.fill();
    }
  }
  if (!P.dead) drawKJP(P.x, P.y, P.ang, { moving: P.moving });
  if (P.choke){
    g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 5;
    g.beginPath(); g.arc(P.x, P.y - 32, 10, 0, TAU); g.stroke();
    g.strokeStyle = "#7cf9a5"; g.lineWidth = 3;
    g.beginPath(); g.arc(P.x, P.y - 32, 10, -Math.PI / 2, -Math.PI / 2 + TAU * P.chokeT); g.stroke();
  }
  /* bullets + darts + trails */
  for (const b of LV.bullets){
    if (b.dart){
      g.strokeStyle = "rgba(87,199,133,0.3)"; g.lineWidth = 2;
      g.beginPath(); g.moveTo(b.x - b.vx * 0.04, b.y - b.vy * 0.04); g.lineTo(b.x, b.y); g.stroke();
      g.save(); g.translate(b.x, b.y); g.rotate(Math.atan2(b.vy, b.vx));
      g.fillStyle = "#57c785"; g.fillRect(-5, -1.6, 9, 3.2);
      g.fillStyle = "#ff8f8f"; g.fillRect(-8.4, -2.4, 3.4, 4.8);
      g.restore();
    } else {
      g.strokeStyle = b.fromPlayer ? "rgba(220,240,230,0.9)" : "rgba(255,210,124,0.9)"; g.lineWidth = 2.4;
      g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx * 0.014, b.y - b.vy * 0.014); g.stroke();
      g.strokeStyle = b.fromPlayer ? "rgba(220,240,230,0.25)" : "rgba(255,210,124,0.25)"; g.lineWidth = 5;
      g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); g.stroke();
      glowBlob(b.x, b.y, 22, b.fromPlayer ? "rgba(200,255,225," : "rgba(255,190,90,");
    }
  }
  /* fx */
  for (const f of LV.fx){
    if (f.kind === "ring"){
      g.strokeStyle = f.col; g.lineWidth = 2.4; g.globalAlpha = Math.min(1, f.t * 2);
      g.beginPath(); g.arc(f.x, f.y, (0.5 - f.t) * 96 + 8, 0, TAU); g.stroke(); g.globalAlpha = 1;
    } else if (f.kind === "zzz"){
      g.fillStyle = f.col; g.globalAlpha = Math.min(1, f.t);
      g.font = "700 " + (10 + Math.sin(f.t * 5) * 2) + "px Verdana";
      g.fillText("z", f.x + Math.sin(f.t * 4) * 3, f.y); g.globalAlpha = 1;
    } else if (f.kind === "shell"){
      g.save(); g.translate(f.x, f.y); g.rotate(f.t * 12);
      g.fillStyle = "#c8a43c"; g.fillRect(-2.2, -1, 4.4, 2);
      g.restore();
    } else if (f.kind === "smoke"){
      g.fillStyle = `rgba(200,205,215,${Math.min(0.25, f.t * 0.4)})`;
      g.beginPath(); g.arc(f.x, f.y, (0.6 - f.t) * 18 + 3, 0, TAU); g.fill();
    } else if (f.kind === "spark"){
      g.fillStyle = f.col; g.globalAlpha = Math.min(1, f.t * 5);
      g.fillRect(f.x - 2, f.y - 2, 4, 4); g.globalAlpha = 1;
      glowBlob(f.x, f.y, 16, "rgba(255,210,140,");
    } else {
      g.fillStyle = f.col; g.globalAlpha = Math.min(1, f.t * 4);
      g.fillRect(f.x - 2, f.y - 2, f.kind === "shard" ? 3 : 4, f.kind === "shard" ? 3 : 4);
      g.globalAlpha = 1;
    }
  }
  if (LV.def.exfil && LV.chopper > 0) drawChopper();
  g.restore();

  /* darkness multiply + additive glow */
  g.save();
  g.globalCompositeOperation = "multiply";
  g.imageSmoothingEnabled = true;
  g.drawImage(LM, 0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  g.globalAlpha = 0.85;
  /* cheap bloom blur: bounce through an eighth-res buffer — the double
     bilinear resample smooths as well as a real blur at a fraction of the cost
     (canvas filter blur falls back to CPU on plenty of Windows machines) */
  gl2.clearRect(0, 0, GLOW2.width, GLOW2.height);
  gl2.drawImage(GLOW, 0, 0, GLOW2.width, GLOW2.height);
  g.drawImage(GLOW2, 0, 0, W, H);
  g.globalAlpha = 1;
  g.restore();

  /* cone tints above the dark — crisp, state-colored, always readable */
  g.save(); g.translate(-Math.round(camX), -Math.round(camY));
  for (const ct of coneTints) drawConeTint(ct.e, ct.pts, ct.range, ct.fov, ct.f, ct.s);
  g.restore();

  drawWeather();
  drawHUD();
  drawPost();
}
function drawDoor(d){
  const px = d.x * T, py = d.y * T;
  if (d.broken){
    g.fillStyle = "#241c12";
    g.fillRect(px + 4, py + 4, 9, 6); g.fillRect(px + 30, py + 34, 11, 6); g.fillRect(px + 18, py + 20, 9, 5);
    g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(px + 6, py + 6, 9, 3); g.fillRect(px + 32, py + 36, 11, 3);
    return;
  }
  const col = d.kind === "Y" ? "#c8a43c" : d.kind === "B" ? "#4c78c8" : d.kind === "R" ? "#c84c5b" : d.kind === "C" ? "#5a6a80" : "#49635a";
  const colD = d.kind === "Y" ? "#7a6420" : d.kind === "B" ? "#2b4778" : d.kind === "R" ? "#7a2b36" : d.kind === "C" ? "#333e4e" : "#2b3d36";
  const o = d.open;
  const dg = d.vertical ? g.createLinearGradient(px, 0, px + T, 0) : g.createLinearGradient(0, py, 0, py + T);
  dg.addColorStop(0, col); dg.addColorStop(1, colD);
  g.fillStyle = dg;
  const wgap = (T - 8) * o;
  if (d.vertical){
    g.fillRect(px + 6, py - 2, T - 12, (T + 4 - wgap) / 2);
    g.fillRect(px + 6, py + 2 + T - (T + 4 - wgap) / 2 - 4, T - 12, (T + 4 - wgap) / 2);
    g.fillStyle = "rgba(255,255,255,0.16)";
    g.fillRect(px + 6, py - 2, T - 12, 3);
  } else {
    g.fillRect(px - 2, py + 6, (T + 4 - wgap) / 2, T - 12);
    g.fillRect(px + 2 + T - (T + 4 - wgap) / 2 - 4, py + 6, (T + 4 - wgap) / 2, T - 12);
    g.fillStyle = "rgba(255,255,255,0.16)";
    g.fillRect(px - 2, py + 6, 3, T - 12);
  }
  /* lock LED + card icon on colored doors */
  if (d.kind !== "D"){
    const gated = d.kind === "C" && LV.hacks < (LV.def.hacksNeed || 0);
    const openable = d.kind === "C" ? !gated : (LV.cards[d.kind.toLowerCase()] || d.unlockedByPlayer);
    g.fillStyle = openable ? "#57c785" : "#ff5b5b";
    g.beginPath(); g.arc(px + T / 2, py + T / 2, 2.6, 0, TAU); g.fill();
    if (!openable && o < 0.2){
      glowBlob(px + 24, py + 24, 26, openable ? "rgba(87,199,133," : "rgba(255,91,91,");
      if (d.kind !== "C"){
        const bob = Math.sin(performance.now() / 400) * 2;
        g.fillStyle = col; g.fillRect(px + 18, py - 14 + bob, 12, 8);
        g.fillStyle = "rgba(255,255,255,0.6)"; g.fillRect(px + 18, py - 14 + bob, 12, 2.4);
      }
    }
  }
  if (d.kind === "C" && LV.hacks < (LV.def.hacksNeed || 0)){
    g.strokeStyle = "#7c8ba3"; g.lineWidth = 2.4;
    for (let i = 10; i < T - 6; i += 9){
      g.beginPath();
      if (d.vertical){ g.moveTo(px + i, py + 2); g.lineTo(px + i, py + T - 2); }
      else { g.moveTo(px + 2, py + i); g.lineTo(px + T - 2, py + i); }
      g.stroke();
    }
  }
}
function drawChopper(){
  const ex = LV.exits.reduce((s, e) => s + e.x, 0) / LV.exits.length * T + T / 2;
  const ey = LV.exits.reduce((s, e) => s + e.y, 0) / LV.exits.length * T + T / 2;
  const t = LV.chopper;
  const yoff = (1 - t) * -430, sc = 0.55 + t * 0.45;
  /* downwash */
  if (t > 0.5){
    for (let i = 0; i < 5; i++){
      const a = performance.now() / 300 + i * TAU / 5;
      g.strokeStyle = "rgba(200,220,240,0.10)"; g.lineWidth = 2;
      g.beginPath(); g.arc(ex, ey, 60 + ((performance.now() / 24 + i * 17) % 60), a, a + 1.4); g.stroke();
    }
  }
  g.save(); g.translate(ex, ey + yoff); g.scale(sc, sc);
  softShadow(6, 20 + (1 - t) * 60, 60 * t + 12, 18 * t + 5);
  const chopArt = artFor(["chopper"]);
  if (chopArt){
    g.rotate(Math.sin(performance.now() / 700) * 0.02);
    g.drawImage(chopArt, -110, -55, 220, 110);
    const ra2 = performance.now() / 26;
    g.strokeStyle = "rgba(210,225,245,0.45)"; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-Math.cos(ra2) * 84, -14 - Math.sin(ra2) * 8); g.lineTo(Math.cos(ra2) * 84, -14 + Math.sin(ra2) * 8); g.stroke();
    g.restore();
    glowBlob(ex, ey + yoff, 90, "rgba(180,210,255,");
    return;
  }
  const bodyG = g.createLinearGradient(0, -16, 0, 16);
  bodyG.addColorStop(0, "#232b36"); bodyG.addColorStop(1, "#0d1218");
  g.fillStyle = bodyG; g.beginPath(); g.ellipse(0, 0, 46, 17, 0, 0, TAU); g.fill();
  g.fillStyle = "rgba(140,200,255,0.35)"; g.beginPath(); g.ellipse(24, -4, 12, 7, -0.3, 0, TAU); g.fill();
  g.fillStyle = "#0e1218"; g.fillRect(-74, -5, 42, 10);
  g.fillStyle = "#1e2630"; g.fillRect(-4, -26, 8, 20);
  g.fillStyle = "#c94c4c"; g.beginPath(); g.arc(-70, 0, 4, 0, TAU); g.fill();
  const ra = performance.now() / 26;
  g.strokeStyle = "rgba(210,225,245,0.55)"; g.lineWidth = 4;
  g.beginPath(); g.moveTo(-Math.cos(ra) * 80, -20 - Math.sin(ra) * 8); g.lineTo(Math.cos(ra) * 80, -20 + Math.sin(ra) * 8); g.stroke();
  g.strokeStyle = "rgba(210,225,245,0.25)"; g.beginPath(); g.ellipse(0, -20, 80, 9, 0, 0, TAU); g.stroke();
  g.restore();
  glowBlob(ex, ey + yoff, 90, "rgba(180,210,255,");
}

/* ---------- weather v2 ---------- */
let rainDrops = null, puddleT = 0;
function drawWeather(){
  const th = themeOf();
  if (!th.rain) return;
  if (!rainDrops){
    rainDrops = [];
    for (let i = 0; i < 110; i++) rainDrops.push({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random(), layer: Math.random() < 0.4 ? 0.5 : 1 });
  }
  const gust = Math.sin(performance.now() / 3200) * 2;
  for (const r of rainDrops){
    r.y += r.s * 15 * r.layer; r.x -= (r.s * 3 + gust) * r.layer;
    if (r.y > H){
      if (r.layer === 1 && Math.random() < 0.3) LV.fx.push({ x: camX + r.x, y: camY + r.y - 4, vx: 0, vy: 0, t: 0.22, kind: "ring", col: "rgba(170,200,230,0.25)" });
      r.y = -12; r.x = Math.random() * (W + 80);
    }
    g.strokeStyle = `rgba(170,200,235,${0.10 + r.layer * 0.1})`; g.lineWidth = r.layer;
    g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.x + 3 + gust, r.y - 13 * r.s * r.layer); g.stroke();
  }
  /* distant lightning */
  lightningNext -= 1 / 60;
  if (lightningNext <= 0){ lightning = 0.35; lightningNext = 9 + Math.random() * 16; }
  if (lightning > 0){
    lightning -= 1 / 60;
    const fl = Math.max(0, Math.sin(lightning * 28)) * 0.16;
    if (fl > 0.01){ g.fillStyle = `rgba(200,220,255,${fl})`; g.fillRect(0, 0, W, H); }
  }
}

/* ---------- HUD v2: tactical terminal ---------- */
function brackets(x, y, w2, h2, col, len){
  len = len || 10;
  g.strokeStyle = col; g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x, y + len); g.lineTo(x, y); g.lineTo(x + len, y);
  g.moveTo(x + w2 - len, y); g.lineTo(x + w2, y); g.lineTo(x + w2, y + len);
  g.moveTo(x + w2, y + h2 - len); g.lineTo(x + w2, y + h2); g.lineTo(x + w2 - len, y + h2);
  g.moveTo(x + len, y + h2); g.lineTo(x, y + h2); g.lineTo(x, y + h2 - len);
  g.stroke();
}
function drawHUD(){
  /* hearts */
  for (let i = 0; i < P.hpMax; i++){
    const x = 26 + i * 27, y = 26;
    const fill = clamp(P.hp - i, 0, 1);
    g.fillStyle = "rgba(0,0,0,0.55)"; heartPath(x + 1.5, y + 1.5, 10); g.fill();
    g.fillStyle = "rgba(20,26,34,0.9)"; heartPath(x, y, 10); g.fill();
    if (fill > 0){
      g.save(); g.beginPath(); g.rect(x - 12, y - 12, 24 * fill, 26); g.clip();
      g.fillStyle = P.hurtT > 0 ? "#ff9d9d" : "#e84c5b"; heartPath(x, y, 8.6); g.fill();
      g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.ellipse(x - 3, y - 4, 3.4, 2, -0.5, 0, TAU); g.fill();
      g.restore();
    }
    g.strokeStyle = "rgba(255,120,130,0.4)"; g.lineWidth = 1; heartPath(x, y, 10); g.stroke();
  }
  /* objective block */
  const objS = { hacks: LV.hacks, file: LV.file, holdDone: LV.holdDone };
  g.font = "900 10px Arial Black"; g.fillStyle = "#57717f";
  g.fillText("OBJECTIVE" + (Math.sin(performance.now() / 500) > 0 ? " _" : ""), 26, 56);
  wrapText("▸ " + LV.def.objText(objS), 26, 72, 400, 15, "#d9e8dc");
  const totalIntel = LV.picks.filter(q => q.k === "intel").length;
  let hy = 108;
  if (totalIntel){
    g.font = "700 11px Verdana"; g.fillStyle = "#8fc7ff";
    g.fillText("⬚ INTEL " + LV.stats.intel + "/" + totalIntel, 26, hy); hy += 18;
  }
  let cx0 = 26;
  for (const ccol of ["y", "b", "r"]) if (LV.cards[ccol]){
    g.fillStyle = ccol === "y" ? "#e8c33c" : ccol === "b" ? "#4c8fe8" : "#e84c5b";
    g.fillRect(cx0, hy - 8, 18, 11);
    g.fillStyle = "rgba(255,255,255,0.6)"; g.fillRect(cx0, hy - 8, 18, 3);
    cx0 += 24;
  }
  /* weapon panel */
  const wid = curWid(), w = wSpec(wid);
  g.fillStyle = "rgba(6,11,16,0.78)"; g.fillRect(18, H - 84, 262, 66);
  brackets(18, H - 84, 262, 66, "rgba(124,249,165,0.4)");
  g.save(); g.translate(40, H - 51); g.scale(1.15, 1.15);
  if (w.melee){ g.fillStyle = "#57c785"; g.beginPath(); g.arc(2, -3, 4.4, 0, TAU); g.fill(); g.beginPath(); g.arc(6, 4, 4.4, 0, TAU); g.fill(); }
  else drawHeldGun(w, w.nft ? "#8a6d2f" : null);
  g.restore();
  g.font = "900 12px Arial Black"; g.fillStyle = w.nft ? "#ffd27c" : "#d9e8dc";
  g.fillText(w.name, 88, H - 62);
  g.font = "700 10px Verdana"; g.fillStyle = "#6c8290";
  const quiet = w.silenced || w.dart || w.noise < 100;
  const sub = w.melee ? "choke from behind · punch ×3" : (quiet ? "◦ QUIET" : "◦ LOUD") + (w.dart ? " · sleep" : "") + (w.breach ? " · breach" : "") + (w.pierce ? " · pierce" : "");
  g.fillText(sub, 88, H - 47);
  if (!w.melee){
    g.font = "900 20px Arial Black";
    g.fillStyle = (P.ammoIn[wid] || 0) === 0 ? "#ff8f8f" : "#eef6ff";
    g.textAlign = "right";
    g.fillText(P.reloadT > 0 ? "──" : String(P.ammoIn[wid] || 0), 240, H - 54);
    g.textAlign = "left";
    g.font = "700 11px Verdana"; g.fillStyle = "#6c8290";
    g.fillText("/" + _reserveFor(wid), 244, H - 54);
    /* magazine pips */
    const cap = w.mag;
    for (let i = 0; i < cap && i < 30; i++){
      g.fillStyle = i < (P.ammoIn[wid] || 0) ? "rgba(124,249,165,0.8)" : "rgba(124,249,165,0.15)";
      g.fillRect(90 + i * 6, H - 36, 4, 7);
    }
  }
  /* mod tags — attachments riding this gun */
  const spec = w.nft ? wSpec(wid) : null;
  if (spec && spec.mods && spec.mods.length){
    let mx0 = 88;
    for (const m of spec.mods){
      const tag = MODDEFS[m].tag;
      g.font = "900 8px Arial Black";
      const tw2 = g.measureText(tag).width + 8;
      g.fillStyle = "rgba(255,210,124,0.14)"; g.fillRect(mx0, H - 32, tw2, 11);
      g.fillStyle = "#ffd27c"; g.fillText(tag, mx0 + 4, H - 23.6);
      mx0 += tw2 + 5;
    }
  } else {
    g.font = "700 9px Verdana"; g.fillStyle = "#49606c";
    g.fillText("[Q] swap  [R] reload  [F] knock/coin  [C] sneak", 88, H - 24);
  }
  /* stance + visibility chips */
  g.fillStyle = P.sneak ? "rgba(124,249,165,0.16)" : "rgba(120,140,160,0.10)";
  g.fillRect(292, H - 46, 74, 26);
  brackets(292, H - 46, 74, 26, P.sneak ? "rgba(124,249,165,0.5)" : "rgba(120,140,160,0.3)", 6);
  g.font = "900 11px Arial Black"; g.fillStyle = P.sneak ? "#7cf9a5" : "#8ba0ae"; g.textAlign = "center";
  g.fillText(P.sneak ? "SNEAK" : (P.runHeld && P.moving ? "RUN" : "WALK"), 329, H - 29);
  const inShadow = (P.litF || 0) < 0.25;
  g.fillStyle = inShadow ? "rgba(80,100,200,0.14)" : "rgba(255,214,150,0.12)";
  g.fillRect(292, H - 78, 74, 26);
  brackets(292, H - 78, 74, 26, inShadow ? "rgba(130,150,255,0.45)" : "rgba(255,214,150,0.4)", 6);
  g.fillStyle = inShadow ? "#9daeff" : "#ffd9a0";
  g.fillText(inShadow ? "◐ SHADOW" : "◉ LIT", 329, H - 61);
  g.textAlign = "left";

  /* context prompt */
  if (P.ctx){
    g.font = "900 14px Arial Black"; g.textAlign = "center";
    const tw = g.measureText(P.ctx).width;
    g.fillStyle = "rgba(5,10,14,0.82)";
    g.fillRect(W / 2 - tw / 2 - 18, H - 124, tw + 36, 30);
    brackets(W / 2 - tw / 2 - 18, H - 124, tw + 36, 30, "rgba(124,249,165,0.5)", 7);
    g.fillStyle = "#7cf9a5"; g.fillText(P.ctx, W / 2, H - 103);
    g.textAlign = "left";
  }
  /* toasts */
  let ty = 148;
  for (const t of LV.toasts){
    t.t -= 1 / 60;
    g.globalAlpha = clamp(t.t, 0, 1);
    g.fillStyle = "rgba(4,8,12,0.6)";
    g.font = "700 12px Verdana";
    const tw = g.measureText(t.msg).width;
    g.fillRect(22, ty - 12, tw + 10, 17);
    g.fillStyle = t.col;
    g.fillText(t.msg, 26, ty); ty += 20; g.globalAlpha = 1;
  }
  LV.toasts = LV.toasts.filter(t => t.t > 0);

  /* alert banner: chevron hazard tape */
  if (LV.alert > 0){
    const isC = LV.alert === 2;
    const col = isC ? "#ff5b5b" : "#ffd54f";
    const bw = 240, bx = W / 2 - bw / 2;
    g.fillStyle = "rgba(5,8,12,0.7)"; g.fillRect(bx, 14, bw, 34);
    g.save(); g.beginPath(); g.rect(bx, 14, bw, 5); g.clip();
    const ph = (performance.now() / 60) % 16;
    for (let x = -16; x < bw + 16; x += 16){
      g.fillStyle = col; g.globalAlpha = 0.85;
      g.beginPath(); g.moveTo(bx + x + ph, 14); g.lineTo(bx + x + 8 + ph, 14); g.lineTo(bx + x + ph, 19); g.lineTo(bx + x - 8 + ph, 19); g.closePath(); g.fill();
    }
    g.restore(); g.globalAlpha = 1;
    g.font = "900 16px Arial Black"; g.textAlign = "center"; g.fillStyle = col;
    g.fillText(isC ? "◤ COMBAT ◥" : "◤ CAUTION ◥", W / 2, 40);
    if (LV.alertT < 1e8){
      g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(bx + 20, 43, bw - 40, 3);
      g.fillStyle = col; g.fillRect(bx + 20, 43, (bw - 40) * clamp(LV.alertT / (isC ? 12 : 20), 0, 1), 3);
    }
    g.textAlign = "left";
  }
  if (LV.def.exfil && LV.holdStarted && !LV.holdDone){
    g.font = "900 15px Arial Black"; g.textAlign = "center";
    g.fillStyle = "#7cf9a5";
    g.fillText("⌖ PAD HOLD " + Math.ceil((LV.def.holdTime || 30) - LV.holdT) + "s", W / 2, 70);
    g.textAlign = "left";
  }
  drawRadar();
  if (IS_TOUCH) drawTouchUI();
}
function heartPath(x, y, r){
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.4, y - r * 0.2, x - r * 0.7, y - r * 1.1, x, y - r * 0.35);
  g.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.4, y - r * 0.2, x, y + r * 0.9);
}
function wrapText(txt, x, y, maxW, lh, col){
  g.fillStyle = col; g.font = "700 12px Verdana";
  const words = txt.split(" ");
  let line = "", yy = y;
  for (const wd of words){
    if (g.measureText(line + wd).width > maxW){ g.fillText(line, x, yy); yy += lh; line = wd + " "; }
    else line += wd + " ";
  }
  g.fillText(line, x, yy);
}
function drawRadar(){
  const RW = 180, RH = 126, rx = W - RW - 18, ry0 = 18;
  g.fillStyle = "rgba(4,9,7,0.82)"; g.fillRect(rx, ry0, RW, RH);
  brackets(rx, ry0, RW, RH, "rgba(124,249,165,0.45)");
  g.font = "900 8px Arial Black"; g.fillStyle = "#4a6a58";
  g.fillText("TAC-MAP", rx + 8, ry0 + 12);
  if (LV.alert === 2){
    for (let i = 0; i < 300; i++){
      g.fillStyle = `rgba(140,220,170,${Math.random() * 0.3})`;
      g.fillRect(rx + 2 + Math.random() * (RW - 4), ry0 + 2 + Math.random() * (RH - 4), 2, 2);
    }
    g.font = "900 13px Arial Black"; g.fillStyle = "#ff5b5b"; g.textAlign = "center";
    g.fillText("— JAMMED —", rx + RW / 2, ry0 + RH / 2 + 4); g.textAlign = "left";
    return;
  }
  const sc = Math.min((RW - 8) / RADARPRE.width, (RH - 18) / RADARPRE.height);
  const ox = rx + (RW - RADARPRE.width * sc) / 2, oy = ry0 + 14 + (RH - 18 - RADARPRE.height * sc) / 2;
  g.save(); g.imageSmoothingEnabled = false;
  g.drawImage(RADARPRE, ox, oy, RADARPRE.width * sc, RADARPRE.height * sc);
  g.imageSmoothingEnabled = true;
  const mx = x => ox + (x / T) * 3 * sc, my = y => oy + (y / T) * 3 * sc;
  for (const e of LV.guards.concat(LV.dogs)){
    if (down(e)) continue;
    g.fillStyle = e.st === "alert" ? "rgba(255,80,80,0.45)" : e.st === "susp" ? "rgba(255,200,80,0.38)" : "rgba(255,255,255,0.22)";
    g.beginPath(); g.moveTo(mx(e.x), my(e.y));
    g.arc(mx(e.x), my(e.y), 12, e.ang - 0.5, e.ang + 0.5); g.closePath(); g.fill();
    g.fillStyle = e.st === "alert" ? "#ff5b5b" : "#e6f1ff";
    g.fillRect(mx(e.x) - 1.5, my(e.y) - 1.5, 3, 3);
  }
  for (const e of LV.cams) if (!e.dead){ g.fillStyle = "#4c8fe8"; g.fillRect(mx(e.x) - 1.5, my(e.y) - 1.5, 3, 3); }
  const tgt = _radarTarget();
  if (tgt){
    const pr = (performance.now() / 900) % 1;
    g.strokeStyle = `rgba(255,210,124,${0.7 - pr * 0.7})`; g.lineWidth = 1.4;
    g.beginPath(); g.arc(mx(tgt.x), my(tgt.y), 3 + pr * 9, 0, TAU); g.stroke();
    g.fillStyle = "#ffd27c"; g.font = "900 9px Arial"; g.textAlign = "center";
    g.fillText("★", mx(tgt.x), my(tgt.y) + 3); g.textAlign = "left";
  }
  for (const e of LV.exits){ g.fillStyle = "#7cf9a5"; g.fillRect(mx(e.x * T + 24) - 2, my(e.y * T + 24) - 2, 4, 4); }
  g.save(); g.translate(mx(P.x), my(P.y)); g.rotate(P.ang);
  g.fillStyle = "#7cf9a5"; g.beginPath(); g.moveTo(5.4, 0); g.lineTo(-3.4, -3.4); g.lineTo(-3.4, 3.4); g.closePath(); g.fill();
  g.restore();
  /* rotating sweep line */
  const sa = performance.now() / 800;
  const gr2 = g.createLinearGradient(mx(P.x), my(P.y), mx(P.x) + Math.cos(sa) * 60, my(P.y) + Math.sin(sa) * 60);
  gr2.addColorStop(0, "rgba(124,249,165,0.25)"); gr2.addColorStop(1, "rgba(124,249,165,0)");
  g.strokeStyle = gr2; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(mx(P.x), my(P.y)); g.lineTo(mx(P.x) + Math.cos(sa) * 60, my(P.y) + Math.sin(sa) * 60); g.stroke();
  g.restore();
}
function _radarTarget(){
  if (LV.hacks < (LV.def.hacksNeed || 0)){ const t = LV.terms.find(t => !t.done); if (t) return { x: t.x * T + 24, y: t.y * T + 24 }; }
  if (LV.def.fileNeed && !LV.file && LV.files[0]) return { x: LV.files[0].x * T + 24, y: LV.files[0].y * T + 24 };
  return null;
}
function drawTouchUI(){
  if (TOUCH.stick){
    g.strokeStyle = "rgba(160,200,180,0.4)"; g.lineWidth = 2;
    g.beginPath(); g.arc(TOUCH.stick.ox, TOUCH.stick.oy, 58, 0, TAU); g.stroke();
    g.fillStyle = "rgba(160,220,190,0.35)";
    g.beginPath(); g.arc(TOUCH.stick.ox + TOUCH.stick.dx * 52, TOUCH.stick.oy + TOUCH.stick.dy * 52, 26, 0, TAU); g.fill();
  } else {
    g.strokeStyle = "rgba(160,200,180,0.14)"; g.lineWidth = 2;
    g.beginPath(); g.arc(150, H - 150, 58, 0, TAU); g.stroke();
  }
  for (const b of BTN_DEFS){
    const on = b.k === "sneak" ? TOUCH.sneakTgl : TOUCH[b.k === "fire" ? "fire" : b.k];
    g.fillStyle = on ? "rgba(124,249,165,0.3)" : "rgba(16,28,23,0.55)";
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
    g.strokeStyle = on ? "rgba(124,249,165,0.75)" : "rgba(124,249,165,0.25)"; g.lineWidth = 2;
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.stroke();
    g.font = "900 " + (b.r > 40 ? 15 : 11) + "px Arial Black"; g.textAlign = "center";
    g.fillStyle = on ? "#0a1410" : "#9fd7b0";
    g.fillText(b.label, b.x, b.y + 5); g.textAlign = "left";
  }
}

/* ---------- post: grade, grain, vignette, scanlines ---------- */
let scanPat = null, grainPats = null;
function drawPost(){
  const th = LV ? themeOf() : THEMES.lobby;
  /* per-theme color wash */
  g.globalCompositeOperation = "multiply";
  g.fillStyle = th.gradeLo; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  g.fillStyle = th.gradeHi; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "source-over";
  /* vignette */
  const grad = g.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.86);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(2,4,8,0.6)");
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  /* grain */
  if (!grainPats){
    grainPats = [];
    for (let k = 0; k < 3; k++){
      const pc = document.createElement("canvas"); pc.width = 128; pc.height = 128;
      const pg = pc.getContext("2d");
      const im = pg.createImageData(128, 128);
      for (let i = 0; i < im.data.length; i += 4){
        const v = 118 + Math.random() * 20 | 0;
        im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 14;
      }
      pg.putImageData(im, 0, 0);
      grainPats.push(g.createPattern(pc, "repeat"));
    }
  }
  g.save();
  g.translate((performance.now() / 16 | 0) % 128, ((performance.now() / 22 | 0) * 7) % 128);
  g.fillStyle = grainPats[(performance.now() / 90 | 0) % 3];
  g.fillRect(-128, -128, W + 256, H + 256);
  g.restore();
  /* scanlines */
  if (!scanPat){
    const pc = document.createElement("canvas"); pc.width = 4; pc.height = 3;
    const pg = pc.getContext("2d");
    pg.fillStyle = "rgba(0,0,0,0.08)"; pg.fillRect(0, 2, 4, 1);
    scanPat = g.createPattern(pc, "repeat");
  }
  g.fillStyle = scanPat; g.fillRect(0, 0, W, H);
  /* combat pulse frame */
  if (LV && LV.alert === 2){
    const p = 0.5 + Math.sin(performance.now() / 260) * 0.5;
    g.strokeStyle = `rgba(255,60,60,${0.10 + p * 0.14})`; g.lineWidth = 12;
    g.strokeRect(6, 6, W - 12, H - 12);
    const rg = g.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.8);
    rg.addColorStop(0, "rgba(255,40,40,0)"); rg.addColorStop(1, `rgba(255,40,40,${0.05 + p * 0.05})`);
    g.fillStyle = rg; g.fillRect(0, 0, W, H);
  }
  if (P && P.hurtT > 0){
    g.fillStyle = `rgba(200,30,40,${P.hurtT * 0.5})`; g.fillRect(0, 0, W, H);
  }
}
