/* KJP world — grid, collision, sight, pathing, noise, doors, level state.
   DELIBERATELY DOM-FREE: tools/qa-node.mjs evals levels.js + world.js in node
   and calls solveLevel() — keep canvas/audio/document OUT of this file. */
"use strict";

const T = 48;                      // tile px
let LV = null;                     // current level runtime state

/* ---------- parse ---------- */
function loadLevel(n){
  const def = LEVELS[n];
  const w = Math.max(...def.rows.map(r => r.length));
  const grid = [];
  const doors = [], picks = [], terms = [], files = [], exits = [], panels = [], dets = [];
  let spawn = null;
  for (let y = 0; y < def.rows.length; y++){
    const row = def.rows[y].padEnd(w, " ");
    const line = [];
    for (let x = 0; x < w; x++){
      let c = row[x];
      if (c === "D" || c === "Y" || c === "B" || c === "R" || c === "C"){
        doors.push({ x, y, kind: c, open: 0, broken: false, vertical: _doorVertical(def.rows, x, y) });
        c = ".";
      } else if (c === "y" || c === "b" || c === "r"){ picks.push({ x, y, k: "card", card: c, got: false }); c = "."; }
      else if (c === "i"){ picks.push({ x, y, k: "intel", got: false }); c = "."; }
      else if (c === "a"){ picks.push({ x, y, k: "darts", got: false }); c = "."; }
      else if (c === "m"){ picks.push({ x, y, k: "med", got: false }); c = "."; }
      else if (c === "t"){ terms.push({ x, y, done: false, prog: 0 }); c = "."; }
      else if (c === "F"){ files.push({ x, y }); c = "."; }
      else if (c === "X"){ exits.push({ x, y }); c = "."; }
      else if (c === "L"){ panels.push({ x, y, pulled: false }); c = "."; }
      else if (c === "M"){ dets.push({ x, y, ping: 0 }); c = "."; }
      else if (c === "P"){ spawn = { x, y }; c = "."; }
      line.push(c);
    }
    grid.push(line);
  }
  const doorAt = new Map();
  for (const d of doors) doorAt.set(d.x + d.y * w, d);
  const detAt = new Set(dets.map(d => d.x + d.y * w));
  return LV = {
    n, def, w, h: grid.length, grid, doors, doorAt, picks, terms, files, exits, panels, dets, detAt, spawn,
    cards: {}, hacks: 0, file: false, fileProg: 0, holdT: 0, holdDone: false, chopper: 0,
    alert: def.startAlert || 0, alertT: def.startAlert ? 1e9 : 0, lastKnown: null, shareT: 0,
    guards: [], dogs: [], civs: [], cams: [], bullets: [], darts: [], coins: [], fx: [], noises: [], waveQ: [],
    stats: { kills: 0, kos: 0, alarms: 0, combats: 0, seen: false, civHurt: 0, intel: 0, shots: 0 },
    time: 0, over: null, reinforced: 0
  };
}
/* a door is "vertical" (slides along y) when its wall runs vertically */
function _doorVertical(rows, x, y){
  const at = (xx, yy) => (rows[yy] || "")[xx] || " ";
  const wallish = c => c === "#" || c === "=" || "DYBRC".includes(c);
  return wallish(at(x, y - 1)) && wallish(at(x, y + 1));
}

const tileAt = (tx, ty) => (LV && LV.grid[ty] && LV.grid[ty][tx]) || " ";
const doorAtT = (tx, ty) => LV.doorAt.get(tx + ty * LV.w) || null;

/* ---------- solidity ----------
   who: 'p' player (opts.sneak lets him use vents), 'g' guard/officer/sentry,
   'd' dog, 'c' civilian, 'b' bullet/dart, 'n' none/raycast */
function solidMove(tx, ty, who, opts){
  const c = tileAt(tx, ty);
  if (c === "#" || c === " ") return true;
  if (c === "-") return true;                       // low cover blocks bodies, not sight
  if (c === "=") return true;                       // glass blocks bodies until broken
  if (c === "V") return !(who === "p" && opts && opts.sneak);   // vents: sneaking player only
  const d = doorAtT(tx, ty);
  if (d && !d.broken){
    // staff clearance: guards/dogs pass every door except a still-gated cage
    if (who === "g" || who === "d") return d.kind === "C" && LV.hacks < (LV.def.hacksNeed || 0) ? d.open < 0.6 : false;
    if (d.kind === "D") return d.open < 0.6 && !(opts && opts.pathing);   // auto doors open on approach — never wall off a path
    if (d.kind === "C") return LV.hacks < (LV.def.hacksNeed || 0) || d.open < 0.6 && !(opts && opts.pathing);
    if (d.open >= 0.6) return false;
    return !(opts && opts.unlocked && opts.unlocked[d.kind]);   // locked door: solid unless opened
  }
  return false;
}
/* sight blocking. detect=true is the AI rule (low cover hides a SNEAKING target,
   vents hide always); render rays (detect=false) show cones through low cover. */
function blocksSight(tx, ty, detect, tgtSneak){
  const c = tileAt(tx, ty);
  if (c === "#" || c === " ") return true;
  if (c === "V") return true;
  if (c === "-") return detect && tgtSneak;
  const d = doorAtT(tx, ty);
  if (d && !d.broken && d.open < 0.5) return true;
  return false;
}

/* circle vs grid, axis-separated slide. r in px, pos in px. */
function moveCircle(o, dx, dy, r, who, opts){
  const tryAxis = (nx, ny) => {
    const x0 = Math.floor((nx - r) / T), x1 = Math.floor((nx + r) / T);
    const y0 = Math.floor((ny - r) / T), y1 = Math.floor((ny + r) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++){
      if (!solidMove(tx, ty, who, opts)) continue;
      // circle vs tile aabb
      const cx = Math.max(tx * T, Math.min(nx, tx * T + T));
      const cy = Math.max(ty * T, Math.min(ny, ty * T + T));
      if ((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) < r * r) return false;
    }
    return true;
  };
  if (dx && tryAxis(o.x + dx, o.y)) o.x += dx;
  if (dy && tryAxis(o.x, o.y + dy)) o.y += dy;
}

/* DDA over the grid from px point to px point */
function los(x0, y0, x1, y1, detect, tgtSneak){
  let tx = Math.floor(x0 / T), ty = Math.floor(y0 / T);
  const ex = Math.floor(x1 / T), ey = Math.floor(y1 / T);
  const dx = x1 - x0, dy = y1 - y0;
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
  let tMaxX = dx !== 0 ? ((sx > 0 ? (tx + 1) * T - x0 : x0 - tx * T) / Math.abs(dx)) : 1e9;
  let tMaxY = dy !== 0 ? ((sy > 0 ? (ty + 1) * T - y0 : y0 - ty * T) / Math.abs(dy)) : 1e9;
  const tDX = dx !== 0 ? T / Math.abs(dx) : 1e9, tDY = dy !== 0 ? T / Math.abs(dy) : 1e9;
  let guard = 200;
  while ((tx !== ex || ty !== ey) && guard-- > 0){
    if (tMaxX < tMaxY){ tx += sx; tMaxX += tDX; } else { ty += sy; tMaxY += tDY; }
    if (tx === ex && ty === ey) break;
    if (blocksSight(tx, ty, detect, tgtSneak)) return false;
  }
  return true;
}
/* ray for cone rendering — returns distance until a render-blocking tile */
function ray(x0, y0, ang, maxD){
  const ca = Math.cos(ang), sa = Math.sin(ang);
  let tx = Math.floor(x0 / T), ty = Math.floor(y0 / T);
  const sx = ca > 0 ? 1 : -1, sy = sa > 0 ? 1 : -1;
  let tMaxX = ca !== 0 ? ((sx > 0 ? (tx + 1) * T - x0 : x0 - tx * T) / Math.abs(ca)) : 1e9;
  let tMaxY = sa !== 0 ? ((sy > 0 ? (ty + 1) * T - y0 : y0 - ty * T) / Math.abs(sa)) : 1e9;
  const tDX = ca !== 0 ? T / Math.abs(ca) : 1e9, tDY = sa !== 0 ? T / Math.abs(sa) : 1e9;
  let d = 0, guard = 120;
  while (d < maxD && guard-- > 0){
    if (tMaxX < tMaxY){ d = tMaxX; tx += sx; tMaxX += tDX; } else { d = tMaxY; ty += sy; tMaxY += tDY; }
    if (blocksSight(tx, ty, false, false)) return Math.min(d, maxD);
  }
  return maxD;
}

/* ---------- A* (4-dir, uniform cost) ---------- */
function astar(sx, sy, txx, tyy, who, opts){
  if (sx === txx && sy === tyy) return [[sx, sy]];
  const w = LV.w, h = LV.h;
  const key = (x, y) => x + y * w;
  if (solidMove(txx, tyy, who, Object.assign({ pathing: true }, opts))) return null;
  const openQ = [[sx, sy]], came = new Map(), gs = new Map();
  gs.set(key(sx, sy), 0);
  const fs = new Map(); fs.set(key(sx, sy), Math.abs(txx - sx) + Math.abs(tyy - sy));
  const inOpen = new Set([key(sx, sy)]);
  let guard = w * h * 4;
  while (openQ.length && guard-- > 0){
    let bi = 0, bf = 1e9;
    for (let i = 0; i < openQ.length; i++){ const f = fs.get(key(openQ[i][0], openQ[i][1])) || 1e9; if (f < bf){ bf = f; bi = i; } }
    const [cx, cy] = openQ.splice(bi, 1)[0];
    inOpen.delete(key(cx, cy));
    if (cx === txx && cy === tyy){
      const path = [[cx, cy]];
      let k = key(cx, cy);
      while (came.has(k)){ const p = came.get(k); path.push(p); k = key(p[0], p[1]); }
      return path.reverse();
    }
    const g0 = gs.get(key(cx, cy));
    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]){
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (solidMove(nx, ny, who, Object.assign({ pathing: true }, opts))) continue;
      const nk = key(nx, ny), ng = g0 + 1;
      if (ng < (gs.get(nk) ?? 1e9)){
        came.set(nk, [cx, cy]); gs.set(nk, ng);
        fs.set(nk, ng + Math.abs(txx - nx) + Math.abs(tyy - ny));
        if (!inOpen.has(nk)){ openQ.push([nx, ny]); inOpen.add(nk); }
      }
    }
  }
  return null;
}

/* ---------- noise ---------- */
function addNoise(x, y, r, kind){
  if (!LV || r <= 0) return;
  LV.noises.push({ x, y, r, kind, t: 0.5, fresh: true });
}

/* ---------- doors runtime ---------- */
function updateDoors(dt, actors){
  for (const d of LV.doors){
    if (d.broken){ d.open = 1; continue; }
    let want = 0;
    const cx = d.x * T + T / 2, cy = d.y * T + T / 2;
    const gated = d.kind === "C" && LV.hacks < (LV.def.hacksNeed || 0);
    for (const a of actors){
      if (!a || a.dead || a.sleep || a.ko) continue;
      if (Math.abs(a.x - cx) > 70 || Math.abs(a.y - cy) > 70) continue;
      if (gated) continue;
      if (a.isPlayer){
        if (d.kind === "D" || d.kind === "C" || d.unlockedByPlayer){ want = 1; }
        else if (LV.cards[d.kind.toLowerCase()]){ d.unlockedByPlayer = true; want = 1; if (typeof SFX !== "undefined") SFX.card(); }
      } else want = 1;                       // staff badge through everything non-gated
    }
    d.open += ((want ? 1 : 0) - d.open) * Math.min(1, dt * 7);
    if (d.open < 0.001) d.open = 0;
  }
}

/* ================= static solver — the QA backbone =================
   Proves: spawn→(hacks)→(file)→exit reachable under PLAYER movement rules
   (sneak allowed → vents usable, locked doors need found/dropped cards, C
   opens after hacks). Also validates entity placement. Pure — no LV mutation. */
function solveLevel(n){
  const errs = [], warn = [];
  const def = LEVELS[n];
  if (!def) return { ok: false, errs: ["no such level"], warn };
  const saveLV = LV;
  const st = loadLevel(n);                     // fresh parse, restore after
  try{
    const w = st.w, h = st.h;
    if (!st.spawn) errs.push("no P spawn");
    if (!st.exits.length) errs.push("no X exit");
    if ((def.hacksNeed || 0) > st.terms.length) errs.push("hacksNeed " + def.hacksNeed + " > terminals " + st.terms.length);
    if (def.fileNeed && !st.files.length) errs.push("fileNeed but no F tile");
    const passable = (tx, ty, unlocked, cOpen) => {
      const c = tileAt(tx, ty);
      if (c === "#" || c === " " || c === "-" || c === "=") return false;
      if (c === "V") return true;                                  // sneak
      const d = doorAtT(tx, ty);
      if (d){
        if (d.kind === "D") return true;
        if (d.kind === "C") return cOpen;
        return !!unlocked[d.kind.toLowerCase()];
      }
      return true;
    };
    const bfs = (unlocked, cOpen) => {
      const seen = new Set(), q = [[st.spawn.x, st.spawn.y]];
      seen.add(st.spawn.x + st.spawn.y * w);
      while (q.length){
        const [cx, cy] = q.pop();
        for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]){
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = nx + ny * w;
          if (seen.has(k) || !passable(nx, ny, unlocked, cOpen)) continue;
          seen.add(k); q.push([nx, ny]);
        }
      }
      return seen;
    };
    /* fixpoint: reach → collect cards (floor + officer-carried) → hacks → C → reach… */
    let unlocked = {}, cOpen = (def.hacksNeed || 0) === 0, reach = null;
    for (let iter = 0; iter < 6; iter++){
      reach = bfs(unlocked, cOpen);
      let changed = false;
      for (const p of st.picks) if (p.k === "card" && reach.has(p.x + p.y * w) && !unlocked[p.card]){ unlocked[p.card] = true; changed = true; }
      for (const gd of def.guards || []) if (gd.card && !unlocked[gd.card] && gd.route.some(([rx, ry]) => reach.has(rx + ry * w))){ unlocked[gd.card] = true; changed = true; }
      const hacks = st.terms.filter(t => reach.has(t.x + t.y * w)).length;
      if (!cOpen && hacks >= (def.hacksNeed || 0)){ cOpen = true; changed = true; }
      if (!changed) break;
    }
    if ((def.hacksNeed || 0) > 0){
      const hackable = st.terms.filter(t => reach.has(t.x + t.y * w)).length;
      if (hackable < def.hacksNeed) errs.push("only " + hackable + "/" + def.hacksNeed + " terminals reachable");
    }
    if (def.fileNeed && !st.files.some(f => reach.has(f.x + f.y * w))) errs.push("file F not reachable");
    if (!st.exits.some(e => reach.has(e.x + e.y * w))) errs.push("exit X not reachable");
    /* entity legality — a waypoint inside a wall means a stuck AI, not a crash */
    const floorish = (tx, ty) => { const c = tileAt(tx, ty); return c === "." || c === "V" || !!doorAtT(tx, ty); };
    const gridPass = (tx, ty) => { const c = tileAt(tx, ty); return (c === "." || !!doorAtT(tx, ty)); };
    (def.guards || []).forEach((gd, i) => {
      for (const [rx, ry] of gd.route) if (!gridPass(rx, ry)) errs.push("guard " + i + " waypoint " + rx + "," + ry + " not walkable (" + tileAt(rx, ry) + ")");
      for (let k = 1; k < gd.route.length; k++){
        if (!astar(gd.route[k - 1][0], gd.route[k - 1][1], gd.route[k][0], gd.route[k][1], "g")) errs.push("guard " + i + " route leg " + k + " unreachable");
      }
    });
    (def.dogs || []).forEach((gd, i) => {
      for (const [rx, ry] of gd.route) if (!gridPass(rx, ry)) errs.push("dog " + i + " waypoint " + rx + "," + ry + " not walkable");
      for (let k = 1; k < gd.route.length; k++){
        if (!astar(gd.route[k - 1][0], gd.route[k - 1][1], gd.route[k][0], gd.route[k][1], "d")) errs.push("dog " + i + " route leg " + k + " unreachable");
      }
    });
    (def.civs || []).forEach((cd, i) => {
      for (const [rx, ry] of cd.route) if (!gridPass(rx, ry)) errs.push("civ " + i + " waypoint " + rx + "," + ry + " not walkable");
    });
    (def.cams || []).forEach((cd, i) => {
      if (tileAt(cd.x, cd.y) !== "#") errs.push("cam " + i + " at " + cd.x + "," + cd.y + " must sit on a wall tile (" + tileAt(cd.x, cd.y) + ")");
    });
    (def.spawnPts || []).forEach(([sx2, sy2], i) => {
      if (!gridPass(sx2, sy2)) errs.push("spawnPt " + i + " at " + sx2 + "," + sy2 + " not walkable (" + tileAt(sx2, sy2) + ")");
    });
    if (!(def.spawnPts || []).length) warn.push("no spawnPts — body alarms bring no QRF here");
    for (const p of st.picks) if (!floorish(p.x, p.y)) errs.push("pickup " + p.k + " at " + p.x + "," + p.y + " not on floor");
    for (const t of st.terms) if (!floorish(t.x, t.y)) errs.push("terminal at " + t.x + "," + t.y + " not on floor");
    /* card coverage: every locked door color must have a source */
    for (const d of st.doors){
      if (d.kind === "Y" || d.kind === "B" || d.kind === "R"){
        const c = d.kind.toLowerCase();
        const src = st.picks.some(p => p.k === "card" && p.card === c) || (def.guards || []).some(gd => gd.card === c);
        if (!src) errs.push("door " + d.kind + " at " + d.x + "," + d.y + " has no card source");
      }
    }
    const width0 = def.rows[0].length;
    if (def.rows.some(r => r.length !== width0)) warn.push("ragged rows (padded — cosmetic only)");
    return { ok: errs.length === 0, errs, warn };
  } finally { LV = saveLV; }
}

/* node QA hook (browser ignores this) */
if (typeof module !== "undefined" && module.exports){ module.exports = { solveLevel, loadLevel, astar }; }
