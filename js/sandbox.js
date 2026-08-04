/* KJP — THE SANDBOX PASS.
   The old loop had one verb (avoid the cone) and one failure state (die).
   That is a puzzle, not a playground. This file adds the systems that make
   spy games and old GTA fun — and, crucially, makes them COLLIDE:

     DISGUISE   walk in the front door wearing his uniform (Hitman)
     HEAT       five stars, escalating response, and real ways to shed it (GTA)
     VEHICLES   steal the cart, drive it through the lobby, run people over
     GADGETS    EMP / smoke / lure / thermal / breach — five ways to cheat
     STASHING   dumpsters and lockers: hide the body, or hide in it
     CHAOS      power boxes, extinguishers, fuel drums — the room is a weapon
     SCORE      safes and laptops: optional greed, GTA-style

   Every one of them feeds the others. Blow a power box and your disguise
   matters less because nobody can see anyway. Run a guard over and heat
   spikes, which spawns the strike team, which makes the cart your only way
   out. That's the game the cones were missing.

   Content is placed PROCEDURALLY from the existing maps (deterministic per
   level) so no hand-authored level has to change and nothing can land inside
   a wall. */
"use strict";

/* ═══════════════════════ HEAT — five stars ═══════════════════════ */
const HEAT_NAMES = ["CLEAR", "NOTICED", "SEARCHING", "LOCKDOWN", "MANHUNT", "SCORCHED EARTH"];
function heatAdd(n, why){
  if (!LV) return;
  const before = LV.heat | 0;
  LV.heat = clamp((LV.heat || 0) + n, 0, 5);
  LV.heatDecay = 0;
  if ((LV.heat | 0) > before){
    LV.heatFlash = 1;
    toast("★".repeat(LV.heat | 0) + "  " + HEAT_NAMES[LV.heat | 0] + (why ? " — " + why : ""), "#ff9d5b");
    if (typeof STING !== "undefined") (LV.heat >= 4 ? STING.qrf : STING.alarm)();
    if (LV.heat >= 2) goCombat(P.x, P.y);
    else if (LV.heat >= 1) goCaution(P.x, P.y, 18);
    /* the response ladder — each star buys them something new */
    if (LV.heat >= 2 && !LV.heatWave2){ LV.heatWave2 = 1; LV.waveQ.push({ t: 4, n: 2 }); }
    if (LV.heat >= 3 && !LV.heatWave3){ LV.heatWave3 = 1; LV.waveQ.push({ t: 3, n: 3 });
      for (const c of LV.cams) c.dead = false;                       // cameras come back online
      toast("⚑ LOCKDOWN — cameras restored, doors sealing", "#ff5b5b"); }
    if (LV.heat >= 4 && !LV.heatWave4){ LV.heatWave4 = 1;
      for (const d of LV.dogs){ d.st = "alert"; d.detect = 1; }      // release the dogs
      LV.waveQ.push({ t: 2, n: 3 }); toast("🐕 K9 RELEASED · STRIKE TEAM INBOUND", "#ff5b5b"); }
    if (LV.heat >= 5 && !LV.heatWave5){ LV.heatWave5 = 1; LV.strikeT = 0; }
  }
}
function heatUpdate(dt){
  if (!LV) return;
  LV.heat = LV.heat || 0; LV.heatFlash = Math.max(0, (LV.heatFlash || 0) - dt * 2);
  if (LV.heat <= 0) return;
  /* HEAT ONLY COOLS WHEN NOBODY CAN SEE YOU — the GTA rule that makes hiding
     a verb. Being stashed, vented, disguised-and-unblown, or simply unobserved
     all count; being in a cone does not. */
  const watched = LV.guards.some(e => !down(e) && seesPlayer(e, e.range, e.fov) > 0)
               || LV.cams.some(c => !c.dead && seesPlayer(c, c.range, 0.55, true) > 0);
  const hidden = P.stashed || tileAt(Math.floor(P.x / T), Math.floor(P.y / T)) === "V";
  const cool = hidden ? 3.2 : (P.disguise && !P.blown) ? 1.7 : 1;
  if (!watched) LV.heatDecay = (LV.heatDecay || 0) + dt * cool;
  else LV.heatDecay = 0;
  const need = 9 + LV.heat * 3;                       // higher stars cool slower
  if (LV.heatDecay > need){
    LV.heatDecay = 0; LV.heat--;
    if (LV.heat <= 0){ LV.heat = 0; toast("★ heat clear — they lost the thread", "#7cf9a5"); if (typeof STING !== "undefined") STING.clear(); }
    else toast("★".repeat(LV.heat) + "  " + HEAT_NAMES[LV.heat], "#ffd54f");
  }
  /* SCORCHED EARTH: a permanent hunt until you drop a star */
  if (LV.heat >= 5){
    LV.strikeT = (LV.strikeT || 0) - dt;
    if (LV.strikeT <= 0){ LV.strikeT = 11; reinforce(2); }
  }
}

/* ═══════════════════════ DISGUISE ═══════════════════════
   The best verb in the genre: walking straight past the thing that was
   killing you. It has to be losable, so SUSPICION builds on everything a
   real guard would never do — sprinting, crouching, waving a rifle, hauling
   a corpse — and officers see through it far faster than the rank and file. */
const DISGUISES = {
  guard:   { name: "GUARD UNIFORM",  col: "#2a3442", blend: 0.16, officerMul: 3.2 },
  sentry:  { name: "SENTRY KIT",     col: "#232e3c", blend: 0.13, officerMul: 3.0 },
  officer: { name: "OFFICER'S SUIT", col: "#c9cdd6", blend: 0.07, officerMul: 1.4 },
  analyst: { name: "ANALYST BADGE",  col: "#7f95b0", blend: 0.22, officerMul: 2.6 }
};
function disguiseTake(e){
  const kind = e.kind === "civ" ? "analyst" : e.kind;
  P.disguise = DISGUISES[kind] ? kind : "guard";
  P.blown = 0; e.stripped = true;
  SFX.card(); toast("👔 " + DISGUISES[P.disguise].name + " — walk, don't run", "#7cf9a5");
}
function disguiseDrop(why){
  if (!P.disguise) return;
  P.disguise = null; P.blown = 0;
  toast("👔 COVER BLOWN" + (why ? " — " + why : ""), "#ff5b5b");
  if (typeof STING !== "undefined") STING.spotted();
}
function disguiseUpdate(dt){
  if (!P.disguise) return;
  let sus = 0;
  if (P.runHeld && P.moving) sus += 0.55;                 // nobody sprints indoors
  if (P.sneak) sus += 0.75;                               // nobody creeps in their own building
  if (P.drag) sus += 1.6;                                 // least of all while dragging a colleague
  const w = curW();
  if (!w.melee && !w.holster) sus += 0.35;                // rifle out in a corridor
  if (LV.heat >= 3) sus += 0.5;                           // in lockdown everyone is checked
  /* proximity: officers make the uniform, and they know every face */
  for (const e of LV.guards){
    if (down(e)) continue;
    const d = dist(e.x, e.y, P.x, P.y);
    if (d > 190) continue;
    if (!los(e.x, e.y, P.x, P.y, false, false)) continue;
    if (Math.abs(angDiff(e.ang, angTo(e.x, e.y, P.x, P.y))) > e.fov / 2) continue;
    const mul = e.kind === "officer" ? DISGUISES[P.disguise].officerMul : 1;
    sus += (1 - d / 190) * 0.85 * mul;
  }
  P.blown = clamp((P.blown || 0) + (sus - 0.45) * dt * 0.55, 0, 1);
  if (P.blown >= 1) disguiseDrop("they made you");
}
/* how much a watcher's fill rate is scaled by the disguise (1 = no help) */
function disguiseMul(watcher){
  if (!P.disguise || P.blown >= 1) return 1;
  if (watcher && watcher.kind === "dog") return 1;         // a dog smells the man, not the shirt
  const d = DISGUISES[P.disguise];
  const decay = 1 - (P.blown || 0);
  return d.blend + (1 - d.blend) * (1 - decay);
}

/* ═══════════════════════ VEHICLES ═══════════════════════ */
const VEHDEF = {
  cart:  { name: "SECURITY CART", w: 34, l: 52, acc: 620, top: 300, turn: 2.6, hp: 3, col: "#3a4a58", noise: 210 },
  van:   { name: "AGENCY VAN",    w: 42, l: 74, acc: 480, top: 265, turn: 1.9, hp: 6, col: "#1e2a38", noise: 260 },
  fork:  { name: "FORKLIFT",      w: 34, l: 48, acc: 420, top: 190, turn: 3.0, hp: 5, col: "#8a6a1e", noise: 240 }
};
function vehEnter(v){
  P.veh = v; v.driver = true;
  v.ang = P.ang;
  SFX.reload(); toast("🚗 " + VEHDEF[v.t].name + " — loud, fast, and nobody's hiding in it", "#ffd27c");
}
function vehExit(){
  const v = P.veh; if (!v) return;
  v.driver = false; v.spd *= 0.3;
  P.x = v.x - Math.cos(v.ang) * 34; P.y = v.y - Math.sin(v.ang) * 34;
  P.veh = null; SFX.ui2();
}
function vehUpdate(dt){
  for (const v of LV.vehs){
    const D = VEHDEF[v.t];
    if (v.driver){
      let mx = (KEYS.has("KeyD") || KEYS.has("ArrowRight") ? 1 : 0) - (KEYS.has("KeyA") || KEYS.has("ArrowLeft") ? 1 : 0);
      let my = (KEYS.has("KeyS") || KEYS.has("ArrowDown") ? 1 : 0) - (KEYS.has("KeyW") || KEYS.has("ArrowUp") ? 1 : 0);
      if (TOUCH.stick){ mx = TOUCH.stick.dx; my = TOUCH.stick.dy; }
      const thr = -my;                                    // W forward, S brake/reverse
      v.spd += thr * D.acc * dt;
      v.spd *= (1 - dt * 1.6);                            // drag
      v.spd = clamp(v.spd, -D.top * 0.45, D.top);
      if (Math.abs(v.spd) > 8) v.ang += mx * D.turn * dt * (v.spd > 0 ? 1 : -1) * clamp(Math.abs(v.spd) / 120, 0.2, 1);
      P.ang = v.ang;
      /* engines are a siren you sit inside */
      v.noiseT = (v.noiseT || 0) - dt;
      if (Math.abs(v.spd) > 30 && v.noiseT <= 0){ v.noiseT = 0.35; addNoise(v.x, v.y, D.noise, "engine");
        tone(70 + Math.abs(v.spd) * 0.3, 0.2, "sawtooth", 0.05); }
    } else v.spd *= (1 - dt * 2.4);
    if (Math.abs(v.spd) < 1){ v.spd = 0; continue; }
    const nx = Math.cos(v.ang) * v.spd * dt, ny = Math.sin(v.ang) * v.spd * dt;
    const before = { x: v.x, y: v.y };
    moveCircle(v, nx, ny, D.w * 0.5, "g", { pathing: false });
    const moved = dist(before.x, before.y, v.x, v.y);
    if (moved < Math.hypot(nx, ny) * 0.4){                 // hit something solid
      if (Math.abs(v.spd) > 150){ shake(7); SFX.thud(); addNoise(v.x, v.y, 300, "crash");
        heatAdd(1, "you drove it into a wall"); }
      v.spd *= -0.15;
    }
    if (v.driver){ P.x = v.x; P.y = v.y; }
    /* RUNNING PEOPLE OVER: the loudest sentence in the language */
    if (Math.abs(v.spd) > 90){
      for (const e of LV.guards.concat(LV.dogs, LV.civs)){
        if (down(e) || dist(e.x, e.y, v.x, v.y) > D.w * 0.6 + 16) continue;
        e.dead = true; LV.stats.kills++;
        if (e.kind === "civ") LV.stats.civHurt++;
        LV.decals.push({ x: e.x, y: e.y, r: 8, max: 26, col: "rgba(120,20,26,0.5)" });
        if (OPT.gore) fxBlood(e.x, e.y, 10, "#a33");
        SFX.thud(); shake(6);
        heatAdd(e.kind === "civ" ? 2 : 1, "vehicular");
        v.spd *= 0.82;
      }
    }
  }
}

/* ═══════════════════════ GADGETS ═══════════════════════ */
const GADGETS = {
  emp:    { name: "EMP CHARGE",  ic: "⚡", n: 2, blurb: "kills cameras and lights, 20s" },
  smoke:  { name: "SMOKE",       ic: "💨", n: 2, blurb: "a wall nobody can see through" },
  lure:   { name: "LURE BEACON", ic: "📡", n: 2, blurb: "a noise that keeps making itself" },
  thermal:{ name: "THERMAL",     ic: "🔥", n: 1, blurb: "see them through the walls, 12s" },
  breach: { name: "BREACH CHG",  ic: "💥", n: 1, blurb: "opens any door. loudly." }
};
function gadgetUse(){
  const id = P.gads[P.gi];
  if (!id || (P.gadN[id] | 0) <= 0){ SFX.dry(); return; }
  P.gadN[id]--;
  const aimD = Math.min(280, dist(P.x, P.y, camX + MOUSE.x, camY + MOUSE.y));
  const a = angTo(P.x, P.y, camX + MOUSE.x, camY + MOUSE.y);
  const reach = Math.min(aimD, ray(P.x, P.y, a, 280) - 12);
  const tx = P.x + Math.cos(a) * reach, ty = P.y + Math.sin(a) * reach;
  if (id === "emp"){
    LV.fx.push({ x: tx, y: ty, vx: 0, vy: 0, t: 0.6, kind: "ring", col: "#8fc7ff" });
    let n = 0;
    for (const c of LV.cams) if (!c.dead && dist(c.x, c.y, tx, ty) < 300){ c.dead = true; n++; }
    for (const L of LIGHTS) if (!L.dead && !L.em && dist(L.x, L.y, tx, ty) < 300){ L.dead = true; L.empT = 20; n++; }
    SFX.glass(); addNoise(tx, ty, 90, "emp");
    toast("⚡ EMP — " + n + " systems dark for 20s", "#8fc7ff");
  } else if (id === "smoke"){
    LV.smokes.push({ x: tx, y: ty, r: 120, t: 14 });
    hiss(0.6, 0.2, 1400); addNoise(tx, ty, 80, "smoke");
    toast("💨 smoke out", "#9db4cc");
  } else if (id === "lure"){
    LV.lures.push({ x: tx, y: ty, t: 12, tick: 0 });
    toast("📡 beacon down — it'll keep talking", "#8fc7ff");
  } else if (id === "thermal"){
    P.thermal = 12; SFX.unlock(); toast("🔥 thermal — through the walls", "#ff9d5b");
  } else if (id === "breach"){
    let best = null, bd = 90;
    for (const d of LV.doors){ const dd = dist(d.x * T + 24, d.y * T + 24, tx, ty); if (dd < bd){ bd = dd; best = d; } }
    if (best){ best.broken = true; SFX.breach(); shake(9); addNoise(best.x * T, best.y * T, 460, "gun");
      heatAdd(1, "breaching charge"); toast("💥 door gone", "#ffd27c"); }
    else { P.gadN.breach++; SFX.dry(); toast("no door in range", "#8a97a8"); }
  }
}
function gadgetsUpdate(dt){
  P.thermal = Math.max(0, (P.thermal || 0) - dt);
  for (const s of LV.smokes) s.t -= dt;
  LV.smokes = LV.smokes.filter(s => s.t > 0);
  for (const l of LV.lures){
    l.t -= dt; l.tick -= dt;
    if (l.tick <= 0){ l.tick = 1.1; addNoise(l.x, l.y, 200, "lure"); sfxAt(l.x, l.y, () => SFX.knock()); }
  }
  LV.lures = LV.lures.filter(l => l.t > 0);
  for (const L of LIGHTS) if (L.empT){ L.empT -= dt; if (L.empT <= 0){ L.dead = false; L.empT = 0; } }
}
/* smoke blocks sight — checked by the detection path */
function smokeBlocks(x1, y1, x2, y2){
  for (const s of LV.smokes){
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
    const t = clamp(((s.x - x1) * dx + (s.y - y1) * dy) / len2, 0, 1);
    if (dist(s.x, s.y, x1 + dx * t, y1 + dy * t) < s.r * 0.8) return true;
  }
  return false;
}

/* ═══════════════════════ STASHING & CHAOS PROPS ═══════════════════════ */
function stashNearest(){
  let best = null, bd = 52;
  for (const c of LV.stash){ const d = dist(c.x, c.y, P.x, P.y); if (d < bd){ bd = d; best = c; } }
  return best;
}
function propsUpdate(dt){
  for (const p of LV.props){
    if (p.t === "fire" && p.burn > 0){
      p.burn -= dt;
      if (Math.random() < 0.4) LV.fx.push({ x: p.x + rr(-14, 14), y: p.y + rr(-14, 14), vx: 0, vy: -30, t: 0.5, kind: "smoke", col: "#ccc" });
      for (const e of LV.guards.concat(LV.civs)) if (!down(e) && dist(e.x, e.y, p.x, p.y) < 60){
        e.st = e.st === "alert" ? "alert" : "susp"; e.susT = Math.max(e.susT || 0, 5);
        e.target = { x: p.x + rr(-60, 60), y: p.y + rr(-60, 60) }; e.path = null;
      }
    }
  }
}
function propHit(p, byPlayer){
  if (p.dead) return;
  if (p.t === "barrel"){
    p.dead = true;
    SFX.breach(); shake(10); addNoise(p.x, p.y, 520, "gun");
    for (let i = 0; i < 26; i++) LV.fx.push({ x: p.x, y: p.y, vx: rr(-320, 320), vy: rr(-320, 320), t: rr(0.2, 0.5), kind: "spark", col: "#ffd27c" });
    LV.decals.push({ x: p.x, y: p.y, r: 10, max: 44, col: "rgba(20,16,12,0.55)" });
    for (const e of LV.guards.concat(LV.dogs, LV.civs)){
      if (down(e)) continue;
      const d = dist(e.x, e.y, p.x, p.y);
      if (d < 118){ e.dead = true; LV.stats.kills++; if (e.kind === "civ") LV.stats.civHurt++; }
    }
    if (!P.dead && dist(P.x, P.y, p.x, p.y) < 118) playerHit(2, p.x, p.y);
    if (byPlayer) heatAdd(2, "you blew the drum");
  } else if (p.t === "fire"){
    p.dead = true; p.burn = 9;
    hiss(1.2, 0.28, 2600); addNoise(p.x, p.y, 260, "hiss");
    LV.smokes.push({ x: p.x, y: p.y, r: 108, t: 11 });
    toast("🧯 extinguisher — free smoke", "#9db4cc");
  } else if (p.t === "power"){
    p.dead = true;
    SFX.glass(); addNoise(p.x, p.y, 190, "spark");
    let n = 0;
    for (const L of LIGHTS) if (!L.dead && !L.em && dist(L.x, L.y, p.x, p.y) < 460){ L.dead = true; n++; }
    for (let i = 0; i < 12; i++) LV.fx.push({ x: p.x, y: p.y, vx: rr(-180, 180), vy: rr(-180, 180), t: 0.4, kind: "spark", col: "#8fc7ff" });
    toast("⚡ breaker popped — " + n + " lights out, this wing is YOURS", "#7cf9a5");
  }
}

/* ═══════════════════════ PROCEDURAL CONTENT ═══════════════════════
   Placed from the map itself, deterministically, so no level file changes and
   nothing can spawn inside geometry. */
function sandboxInit(){
  LV.heat = LV.def.startAlert ? 2 : 0;
  LV.heatDecay = 0; LV.heatFlash = 0;
  LV.vehs = []; LV.smokes = []; LV.lures = []; LV.props = []; LV.stash = []; LV.loot = [];
  P.disguise = null; P.blown = 0; P.veh = null; P.stashed = false; P.thermal = 0;
  P.gads = ["emp", "smoke", "lure", "thermal", "breach"];
  P.gadN = {}; for (const k of P.gads) P.gadN[k] = GADGETS[k].n;
  P.gi = 0;
  srand(LV.n * 4242 + 7);
  /* open floor tiles with elbow room, away from the spawn */
  const open = [];
  for (let y = 2; y < LV.h - 2; y++) for (let x = 2; x < LV.w - 2; x++){
    if (tileAt(x, y) !== ".") continue;
    let room = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) if (tileAt(x + i, y + j) === ".") room++;
    if (room >= 8 && dist(x, y, LV.spawn.x, LV.spawn.y) > 5) open.push([x, y]);
  }
  const takeSpread = (arr, n, minGap) => {
    const out = [];
    for (let guard = 0; guard < 400 && out.length < n; guard++){
      const c = arr[Math.floor(rnd() * arr.length)];
      if (!c) break;
      if (out.every(o => dist(o[0], o[1], c[0], c[1]) > minGap)) out.push(c);
    }
    return out;
  };
  /* vehicles — a couple per level, more in the outdoor ops */
  const vKinds = LV.def.theme === "yard" ? ["cart", "van"] : LV.def.theme === "roof" ? ["cart"] :
                 LV.def.theme === "archive" ? ["fork", "cart"] : ["cart"];
  takeSpread(open, LV.def.theme === "yard" ? 3 : 2, 9).forEach(([x, y], i) => {
    const t = vKinds[i % vKinds.length];
    LV.vehs.push({ t, x: x * T + 24, y: y * T + 24, ang: rr(0, TAU), spd: 0, hp: VEHDEF[t].hp, driver: false });
  });
  /* stash containers */
  takeSpread(open, 5, 7).forEach(([x, y]) => LV.stash.push({ x: x * T + 24, y: y * T + 24, bodies: 0, kind: rnd() < 0.5 ? "bin" : "locker" }));
  /* chaos props */
  takeSpread(open, 4, 6).forEach(([x, y]) => LV.props.push({ t: "barrel", x: x * T + 24, y: y * T + 24, dead: false }));
  takeSpread(open, 3, 6).forEach(([x, y]) => LV.props.push({ t: "fire", x: x * T + 24, y: y * T + 24, dead: false, burn: 0 }));
  takeSpread(open, 3, 8).forEach(([x, y]) => LV.props.push({ t: "power", x: x * T + 24, y: y * T + 24, dead: false }));
  /* optional greed: safes and laptops */
  takeSpread(open, 2, 10).forEach(([x, y]) => LV.loot.push({ t: "safe", x: x * T + 24, y: y * T + 24, prog: 0, done: false, val: 1500 }));
  takeSpread(open, 3, 7).forEach(([x, y]) => LV.loot.push({ t: "laptop", x: x * T + 24, y: y * T + 24, prog: 0, done: false, val: 800 }));
}

/* ═══════════════════════ TICK + INTERACTIONS ═══════════════════════ */
function sandboxUpdate(dt){
  if (!LV || !LV.vehs) return;
  heatUpdate(dt);
  disguiseUpdate(dt);
  vehUpdate(dt);
  gadgetsUpdate(dt);
  propsUpdate(dt);
  /* gadget select + use */
  if (PRESS.has("KeyG") || WHEEL){ P.gi = (P.gi + 1) % P.gads.length; SFX.ui2(); }
  for (let i = 0; i < 5; i++) if (PRESS.has("Digit" + (i + 6))) P.gi = i;
  if (PRESS.has("KeyV")) gadgetUse();
  /* loot in progress */
  for (const l of LV.loot){
    if (l.done || dist(P.x, P.y, l.x, l.y) > 46){ if (!l.done) l.prog = Math.max(0, l.prog - dt); continue; }
    if (KEYS.has("KeyE") || TOUCH.act){
      l.prog += dt / (l.t === "safe" ? 3.2 : 1.8);
      if ((LV.time * 12 | 0) % 2 === 0) SFX.hackTick();
      if (l.prog >= 1){
        l.done = true; LV.stats.loot = (LV.stats.loot || 0) + l.val;
        if (typeof STING !== "undefined") STING.objective();
        toast((l.t === "safe" ? "💰 SAFE CRACKED" : "💻 DRIVE COPIED") + "  +" + l.val, "#ffd27c");
      }
    } else l.prog = Math.max(0, l.prog - dt);
  }
}
/* returns a context prompt if the sandbox owns the E key this frame */
function sandboxInteract(){
  if (!LV || !LV.vehs) return null;
  if (P.veh) return "E — GET OUT";
  if (P.stashed) return "E — CLIMB OUT";
  /* vehicle */
  for (const v of LV.vehs) if (dist(v.x, v.y, P.x, P.y) < 46){
    if (PRESS.has("KeyE")) vehEnter(v);
    return "E — DRIVE " + VEHDEF[v.t].name;
  }
  /* strip a uniform off anyone down */
  for (const e of LV.guards.concat(LV.civs)){
    if (!down(e) || e.stripped || dist(e.x, e.y, P.x, P.y) > 40) continue;
    if (PRESS.has("KeyE")) disguiseTake(e);
    return "E — TAKE " + (e.kind === "civ" ? "BADGE" : "UNIFORM");
  }
  /* stash: a body if you're hauling one, otherwise yourself */
  const c = stashNearest();
  if (c){
    if (P.drag){
      if (PRESS.has("KeyE")){
        const b = P.drag; P.drag = null; b.stashed = true; b.found = true; b.x = -9999; b.y = -9999;
        c.bodies++; SFX.thud(); toast("🗑 body stashed — nobody's finding that", "#7cf9a5");
        LV.stats.stashed = (LV.stats.stashed || 0) + 1;
      }
      return "E — STASH THE BODY";
    }
    if (PRESS.has("KeyE")){ P.stashed = true; P.stashIn = c; SFX.ui2(); toast("hiding — heat cools fast in here", "#8fc7ff"); }
    return "E — HIDE INSIDE";
  }
  /* loot prompt */
  for (const l of LV.loot) if (!l.done && dist(P.x, P.y, l.x, l.y) < 46)
    return "HOLD E — " + (l.t === "safe" ? "CRACK THE SAFE" : "COPY THE DRIVE");
  return null;
}
function sandboxExitInteract(){
  if (P.veh && PRESS.has("KeyE")) vehExit();
  else if (P.stashed && PRESS.has("KeyE")){ P.stashed = false; P.stashIn = null; SFX.ui2(); }
}
