/* KJP entities + AI. The whole stealth sandbox lives here.
   Detection contract: guard.detect fills while the player is inside cone+LOS
   (faster when close/running, slower sneaking), spills into SUSP at 0.45 and
   ALERT at 1.0. An ALERTED guard must finish a RADIO wind-up before the whole
   site goes COMBAT — drop him first and the site never learns (the MGS moment
   this game exists for). */
"use strict";

let P = null;                  // the player
const GK = { guard: { hp: 1.4, spd: 95, range: 300, fov: 1.3, radio: 1.15, gun: "p9" },
             sentry:{ hp: 2.2, spd: 88, range: 330, fov: 1.25, radio: 1.15, gun: "smg" },
             officer:{hp: 1.4, spd: 100, range: 300, fov: 1.35, radio: 0.7, gun: "p9" },
             /* THE DIRECTOR. Tanky and wide-eyed, but no faster than an officer
                and slow on the trigger — the pressure is that he never stops
                coming, not that he out-shoots you. He also never calls it in:
                he does not need backup, and a radio wind-up you could interrupt
                would give you a way to switch him off. */
             director:{hp: 6, spd: 102, range: 380, fov: 1.7, radio: 0, gun: "p9" } };
const isHunter = e => e.kind === "director";

/* ---------- spawn ---------- */
function initEnts(){
  const d = LV.def;
  srand(LV.n * 7777 + 13);
  P = {
    isPlayer: true, x: LV.spawn.x * T + T / 2, y: LV.spawn.y * T + T / 2, ang: -Math.PI / 2,
    hpMax: Math.max(1, 3 + (hasHolo() ? 1 : 0) + (hasGear(2) ? 1 : 0) + diff().hp),
    hp: Math.max(1, 3 + (hasHolo() ? 1 : 0) + (hasGear(2) ? 1 : 0) + diff().hp),
    plate: hasGear(2),                       // KEVLAR WEAVE: eats the first hit of the op
    sneak: false, moving: 0, stepT: 0, dead: false,
    weapons: ["fists", "tranq"], wi: 1, fireT: 0, reloadT: 0,
    ammoIn: { tranq: WEAPONS.tranq.mag }, darts: 12 + (skinDef().dartBonus || 0), rounds: {},
    choke: null, chokeT: 0, drag: null, hurtT: 0, flashT: 0, kd: 0,
    detReadout: 0
  };
  /* weapon component: NFT loadout — owned arsenal guns join the carry, tuned for
     stealth. Persisted picks in PROG.carry; default = first two owned. */
  const owned = nftWeaponIds(window.ownedGunTypes || []);
  let carry = (PROG.carry || []).filter(id => owned.includes(id));
  if (!carry.length) carry = owned.slice(0, 2);
  for (const id of carry.slice(0, 2)){
    P.weapons.push(id);
    P.ammoIn[id] = WEAPONS[id].mag;
    P.rounds[id] = WEAPONS[id].mag * 2;
  }
  LV.guards = (d.guards || []).map(gd => spawnGuard(gd));
  LV.dogs = (d.dogs || []).map(dd => ({
    kind: "dog", x: dd.x * T + T / 2, y: dd.y * T + T / 2, ang: 0, route: dd.route, ri: 0, fwd: true,
    st: "patrol", detect: 0, hp: 1, sleep: 0, ko: 0, dead: false, found: false, waitT: 0,
    path: null, pathI: 0, repathT: 0, lungeT: 0, barked: false, target: null, r: 12
  }));
  LV.civs = (d.civs || []).map(cd => ({
    kind: "civ", x: cd.x * T + T / 2, y: cd.y * T + T / 2, ang: 0, route: cd.route, ri: 0, fwd: true,
    st: "wander", freeze: 0, panicTo: null, path: null, pathI: 0, repathT: 0, waitT: rr(0, 2),
    pulledT: 0, cower: false, sleep: 0, ko: 0, dead: false, hp: 0.5, found: false, r: 13,
    shirt: ["#7f95b0", "#a58b6f", "#8fa57f", "#b08f9d", "#9f9f7a"][Math.floor(rnd() * 5)]
  }));
  LV.cams = (d.cams || []).map(cd => ({
    kind: "cam", x: cd.x * T + T / 2, y: cd.y * T + T / 2, base: cd.dir, arc: cd.arc, sweep: cd.sweep,
    ang: cd.dir, t: rr(0, 6), detect: 0, cool: 0, dead: false, range: 260
  }));
  LV.decals = [];
  LV.toasts = [];
  if (d.startAlert){ LV.alert = d.startAlert; LV.alertT = 1e9; }
}
function spawnGuard(gd, atPx){
  const k = GK[gd.kind] || GK.guard;
  return {
    kind: gd.kind, x: atPx ? atPx.x : gd.x * T + T / 2, y: atPx ? atPx.y : gd.y * T + T / 2,
    ang: rr(0, TAU), route: gd.route || [], ri: 0, fwd: true, card: gd.card || null, cardDropped: false,
    /* the Director opens in hunt and can never fall back to patrol */
    st: gd.kind === "director" ? "hunt" : "patrol", huntT: 0,
    detect: 0, susT: 0, target: null, waitT: 0, scanA: 0,
    path: null, pathI: 0, repathT: 0, radioT: -1, shootT: 0, burst: 0, aimT: 0,
    hp: k.hp, spd: k.spd, range: k.range, fov: k.fov, radioBase: k.radio, gun: k.gun,
    sleep: 0, ko: 0, dead: false, found: false, hits: 0, stagT: 0, r: 14, popT: 0, pop: ""
  };
}

/* ---------- shared helpers ---------- */
const down = e => e.dead || e.sleep > 0 || e.ko > 0;
function nearestPathTo(e, tx, ty, who){
  const p = astar(Math.floor(e.x / T), Math.floor(e.y / T), tx, ty, who);
  e.path = p; e.pathI = 0;
  return p;
}
function walkPath(e, spd, dt){
  if (!e.path || e.pathI >= e.path.length) return true;
  const [tx, ty] = e.path[e.pathI];
  const gx = tx * T + T / 2, gy = ty * T + T / 2;
  const d = dist(e.x, e.y, gx, gy);
  if (d < 6){ e.pathI++; return e.pathI >= e.path.length; }
  const a = angTo(e.x, e.y, gx, gy);
  e.ang += angDiff(e.ang, a) * Math.min(1, dt * 10);
  e.stride = (e.stride || 0) + spd * dt;          // drives the walk cycle
  moveCircle(e, Math.cos(a) * spd * dt, Math.sin(a) * spd * dt, e.r, e.kind === "dog" ? "d" : e.kind === "civ" ? "c" : "g");
  return false;
}
function toast(msg, col){ LV.toasts.push({ msg, col: col || "#cfe3d2", t: 3 }); if (LV.toasts.length > 4) LV.toasts.shift(); }

/* how lit is this point by the level's (surviving) lamps? 0 = pitch black */
function lightFactorAt(x, y){
  let f = 0;
  for (const L of (typeof LIGHTS !== "undefined" ? LIGHTS : [])){
    if (L.dead || L.em) continue;
    const d = dist(x, y, L.x, L.y);
    if (d < L.r) f = Math.max(f, 1 - d / L.r);
    if (f > 0.95) break;
  }
  return f;
}
/* can this watcher see the player right now? (geometry+LOS+light)
   Standing in darkness shrinks every sight range — shooting out lamps is a
   legitimate legal strategy. Dogs don't care (nose), cameras don't care (IR). */
function seesPlayer(e, range, fov, ignoreLight){
  if (P.dead || P.stashed) return 0;                  // a closed bin has no silhouette
  const d = dist(e.x, e.y, P.x, P.y);
  const lightMul = ignoreLight ? 1 : (0.62 + 0.5 * (P.litF == null ? 1 : P.litF));
  const R = range * (skinDef().detectMul || 1) * (P.sneak ? 0.62 : 1) * lightMul * diff().detect;
  if (d > R) return 0;
  if (Math.abs(angDiff(e.ang, angTo(e.x, e.y, P.x, P.y))) > fov / 2) return 0;
  if (!los(e.x, e.y, P.x, P.y, true, P.sneak)) return 0;
  if (typeof smokeBlocks === "function" && smokeBlocks(e.x, e.y, P.x, P.y)) return 0;
  /* closer + louder stance = faster fill; point-blank is instant */
  const dg = typeof disguiseMul === "function" ? disguiseMul(e) : 1;
  if (d < 70 && dg > 0.5) return 99;
  const stance = P.sneak ? 0.55 : (P.runHeld && P.moving ? 1.5 : 1);
  return (1.25 - d / R) * stance * 2.1 * (LV.alert > 0 ? 1.5 : 1) * dg;
}

/* ---------- global alert ---------- */
function goCombat(fromX, fromY){
  if (LV.alert < 2){
    LV.stats.combats++;
    musicWant("combat");
    /* first combat brings friends through the doors (sim-time queue — no
       wall-clock setTimeout, so headless step() and pause behave) */
    if (!LV.reinforced && (LV.def.spawnPts || []).length && !LV.def.exfil){
      LV.reinforced = 1;
      LV.waveQ.push({ t: 5, n: 2 });
    }
  }
  LV.alert = 2; LV.alertT = 12; LV.lastKnown = { x: fromX, y: fromY };
}
/* a body got called in / an alarm got pulled: this is the big one.
   Site goes weapons-free and a QRF wave storms the entrances. */
function bodyAlarm(x, y, label){
  LV.stats.alarms++;
  heatAdd(2, "they called it in");
  toast(label || "🚨 BODY REPORTED — QRF INBOUND", "#ff5b5b");
  STING.alarm();
  goCombat(x, y);
  LV.alertT = 20;                                  // a reported incident doesn't cool in 12s
  if (!LV.def.exfil && (LV.bodyWaves || 0) < 2 && (LV.def.spawnPts || []).length){
    LV.bodyWaves = (LV.bodyWaves || 0) + 1;
    LV.waveQ.push({ t: 3.5, n: 3 });
  }
}
function goCaution(x, y, t){
  if (LV.alert < 1){ LV.stats.alarms++; musicWant("caution"); }
  if (LV.alert < 2){ LV.alert = 1; LV.alertT = Math.max(LV.alertT, t || 20); }
  if (x != null) LV.lastKnown = { x, y };
}
function reinforce(nMax){
  const pts = LV.def.spawnPts || [];
  for (let i = 0; i < Math.min(nMax, pts.length); i++){
    const [tx, ty] = pts[i % pts.length];
    const gg = spawnGuard({ kind: "sentry", x: tx, y: ty, route: [[tx, ty]] });
    gg.st = "alert"; gg.detect = 1; gg.radioT = -2;
    LV.guards.push(gg);
    fxRing(gg.x, gg.y, "#ff5b5b");
  }
  STING.qrf(); shake(5);
  toast("⚠ REINFORCEMENTS ON SITE", "#ff8f8f");
}

/* ---------- player ---------- */
function curW(){ return WEAPONS[P.weapons[P.wi]]; }
function curWid(){ return P.weapons[P.wi]; }
function playerUpdate(dt){
  if (P.dead) return;
  P.hurtT = Math.max(0, P.hurtT - dt); P.flashT = Math.max(0, P.flashT - dt);
  if (P.kd > 0){ P.kd -= dt; return; }
  /* driving and hiding are their own modes — they own the controls */
  if (P.veh || P.stashed){
    P.ctx = P.veh ? "E — GET OUT" : "E — CLIMB OUT";
    P.moving = P.veh ? (Math.abs(P.veh.spd) > 8 ? 1 : 0) : 0;
    sandboxExitInteract();
    P.litF = lightFactorAt(P.x, P.y);
    return;
  }

  /* stance + move intent (keyboard or touch stick) */
  /* HOLD or TOGGLE, the player's call (OPTIONS) */
  if (OPT.sneakHold) P.sneak = KEYS.has("ControlLeft") || KEYS.has("KeyC") || TOUCH.sneakTgl;
  else { if (PRESS.has("KeyC") || PRESS.has("ControlLeft")) P.sneakTgl = !P.sneakTgl;
         P.sneak = P.sneakTgl || TOUCH.sneakTgl; }
  /* ALREADY IN A DUCT? Then you are crouching, and this MUST be decided
     BEFORE the move is computed. It used to be applied after, so a player who
     released C inside the shaft moved that frame with sneak=false — which
     makes every vent tile solid — and could not move at all. That is the
     level 3 vent trap: fully stuck, in the only route up from the sub-floor. */
  if (tileAt(Math.floor(P.x / T), Math.floor(P.y / T)) === "V") P.sneak = true;
  P.runHeld = KEYS.has("ShiftLeft") || KEYS.has("ShiftRight") || TOUCH.run;
  let mx = (KEYS.has("KeyD") || KEYS.has("ArrowRight") ? 1 : 0) - (KEYS.has("KeyA") || KEYS.has("ArrowLeft") ? 1 : 0);
  let my = (KEYS.has("KeyS") || KEYS.has("ArrowDown") ? 1 : 0) - (KEYS.has("KeyW") || KEYS.has("ArrowUp") ? 1 : 0);
  if (TOUCH.stick){ mx = TOUCH.stick.dx; my = TOUCH.stick.dy; }
  const mlen = Math.hypot(mx, my);
  if (mlen > 1){ mx /= mlen; my /= mlen; }
  const chokeLock = !!P.choke, dragging = !!P.drag;
  const boots = hasGear(3) ? 1.08 : 1;                    // TACTICAL BOOTS
  const armour = hasGear(2) ? 0.93 : 1;                   // KEVLAR: plates cost you 7%
  let spd = (P.sneak ? 78 : P.runHeld ? 216 : 138) * boots * armour;
  if (dragging) spd = Math.min(spd, 66);
  if (chokeLock) spd = 0;
  P.moving = mlen > 0.15 ? 1 : 0;
  if (P.moving && spd > 0){
    P.stride = (P.stride || 0) + spd * dt;
    moveCircle(P, mx * spd * dt, my * spd * dt, 15, "p", { sneak: P.sneak, unlocked: _unlockedDoors() });
    /* footsteps make sound — running is a dinner bell */
    P.stepT -= dt * (P.runHeld ? 1.7 : 1);
    if (P.stepT <= 0){
      P.stepT = 0.3;
      SFX.step(P.runHeld, P.sneak);
      const soft = hasGear(3) ? 0.75 : 1;                 // BOOTS: run 25% quieter
      const clank = hasGear(2) ? 1.18 : 1;                // KEVLAR: the plates carry
      const surf = SURF_NOISE[surfaceOf(P.x, P.y)] || 1;  // marble sings, carpet forgives
      if (!P.sneak) addNoise(P.x, P.y, (P.runHeld ? 165 : 55) * soft * clank * surf, "step");
    }
  }
  /* LAST-RESORT UNSTICK. If the player is somehow inside a tile that is solid
     for them right now, walk them out to the nearest legal tile rather than
     leaving them wedged forever. Costs nothing when everything is fine. */
  const tx0 = Math.floor(P.x / T), ty0 = Math.floor(P.y / T);
  if (solidMove(tx0, ty0, "p", { sneak: P.sneak, unlocked: _unlockedDoors() })){
    let best = null, bd = 1e9;
    for (let r = 1; r <= 3 && !best; r++)
      for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++){
        if (solidMove(tx0 + i, ty0 + j, "p", { sneak: P.sneak, unlocked: _unlockedDoors() })) continue;
        const cx = (tx0 + i) * T + T / 2, cy = (ty0 + j) * T + T / 2;
        const d = dist(P.x, P.y, cx, cy);
        if (d < bd){ bd = d; best = { x: cx, y: cy }; }
      }
    if (best){ P.x = best.x; P.y = best.y; }
  }

  /* aim: mouse, or touch aim-finger; soft aim assist on coarse pointers */
  if (TOUCH.aim){
    const dx = TOUCH.aim.x - W / 2, dy = TOUCH.aim.y - H / 2;
    if (Math.hypot(dx, dy) > 24) P.ang = Math.atan2(dy, dx);
  } else if (!IS_TOUCH || MOUSE.moved > 4){
    P.ang = angTo(P.x, P.y, camX + MOUSE.x, camY + MOUSE.y);
  }
  if (OPT.aimAssist && (IS_TOUCH || focusOn)){
    let best = null, bd = 0.24;
    for (const e of LV.guards.concat(LV.dogs)) if (!down(e)){
      const dd = Math.abs(angDiff(P.ang, angTo(P.x, P.y, e.x, e.y)));
      if (dd < bd && dist(P.x, P.y, e.x, e.y) < 460 && los(P.x, P.y, e.x, e.y, false, false)){ bd = dd; best = e; }
    }
    if (best) P.ang = angTo(P.x, P.y, best.x, best.y);
  }

  /* weapon cycling */
  if (PRESS.has("KeyQ") || WHEEL){ P.wi = (P.wi + 1 + (WHEEL < 0 ? P.weapons.length - 2 : 0)) % P.weapons.length; SFX.ui(); P.reloadT = 0; }
  for (let i = 0; i < 6; i++) if (PRESS.has("Digit" + (i + 1)) && P.weapons[i]) P.wi = i;

  /* fire / melee */
  P.fireT -= dt;
  if (P.reloadT > 0){
    P.reloadT -= dt;
    if (P.reloadT <= 0) _finishReload();
  }
  const wantFire = (MOUSE.down && !IS_TOUCH) || TOUCH.fire;
  const wid = curWid(), w = curW();
  if (wantFire && !chokeLock && !dragging && P.fireT <= 0 && P.reloadT <= 0){
    if (w.melee) _punch();
    else _fire(wid, w);
  }
  if (PRESS.has("KeyR") && !w.melee && P.reloadT <= 0 && P.ammoIn[wid] < w.mag && _reserveFor(wid) > 0){
    P.reloadT = 1.1; SFX.reload();
  }

  /* F: knock in place — or flick a COIN at the cursor to pull ears THERE.
     The coin stops at the first wall; the preview arc shows where it lands. */
  if (PRESS.has("KeyF") && !chokeLock){
    const aimD = IS_TOUCH ? 0 : dist(P.x, P.y, camX + MOUSE.x, camY + MOUSE.y);
    if (aimD < 70){
      SFX.knock(); addNoise(P.x, P.y, 175, "knock");
      fxRing(P.x, P.y, "#8fc7ff");
    } else {
      const a = angTo(P.x, P.y, camX + MOUSE.x, camY + MOUSE.y);
      const reach = Math.min(300, aimD, ray(P.x, P.y, a, 300) - 10);
      LV.coins.push({ x: P.x, y: P.y, vx: Math.cos(a) * reach / 0.55, vy: Math.sin(a) * reach / 0.55, t: 0.55, spin: 0 });
      SFX.ui(); tutCoinThrown();
    }
  }
  P.litF = lightFactorAt(P.x, P.y);

  _interactions(dt);
  _pickups();
  _detectors(dt);
  _lasers();
  _exitCheck(dt);
}
/* SKELETON KEY (gear 7) picks every colour — the cards become souvenirs */
function _unlockedDoors(){
  if (hasGear(7)) return { Y: true, B: true, R: true };
  return { Y: LV.cards.y, B: LV.cards.b, R: LV.cards.r };
}
function _reserveFor(id){ return WEAPONS[id].dart ? P.darts : (P.rounds[id] || 0); }
function _finishReload(){
  const id = curWid(), w = WEAPONS[id];
  const need = w.mag - (P.ammoIn[id] || 0), take = Math.min(need, _reserveFor(id));
  P.ammoIn[id] = (P.ammoIn[id] || 0) + take;
  if (w.dart) P.darts -= take; else P.rounds[id] -= take;
}
function _punch(){
  P.fireT = 0.32; SFX.hit(); addNoise(P.x, P.y, 70, "punch");
  fxMuzzle(P.x + Math.cos(P.ang) * 20, P.y + Math.sin(P.ang) * 20, P.ang, "#9fd7b0", 3);
  for (const e of LV.guards.concat(LV.dogs, LV.civs)){
    if (down(e)) continue;
    if (dist(P.x, P.y, e.x, e.y) < 52 && Math.abs(angDiff(P.ang, angTo(P.x, P.y, e.x, e.y))) < 1){
      e.hits = (e.hits || 0) + 1; e.stagT = 0.5;
      fxBlood(e.x, e.y, 2, "#5a7a8f");
      /* The Director takes twice the beating and wakes up hunting, not
         patrolling. Three punches ending the campaign's antagonist would be
         cheap — but making him unKOable would delete the reward for getting
         behind him, which is the whole game. Six, and he gets back up. */
      const koAt = isHunter(e) ? 6 : 3;
      if (e.hits >= koAt){
        e.ko = isHunter(e) ? 16 : 25; e.st = isHunter(e) ? "hunt" : "patrol";
        e.detect = 0; SFX.thud(); LV.stats.kos++; _dropCard(e);
        if (isHunter(e)) toast("THE DIRECTOR is down — he will not stay down", "#ff8f8f");
      }
      else SFX.hit();
      break;
    }
  }
}
function _fire(wid, wBase){
  const w = wSpec(wid);                            // mods ride NFT guns
  if ((P.ammoIn[wid] || 0) <= 0){
    if (_reserveFor(wid) > 0){ P.reloadT = 1.1; SFX.reload(); } else SFX.dry();
    P.fireT = 0.25; return;
  }
  P.fireT = 1 / w.rps; P.ammoIn[wid]--;
  LV.stats.shots++;
  const n = w.pellets || (w.fan || 1);
  for (let i = 0; i < n; i++){
    let a = P.ang;
    if (w.pellets) a += (rnd() - 0.5) * 0.35;
    else if (w.fan) a += (i - (n - 1) / 2) * 0.16;
    a += (rnd() - 0.5) * (w.spread || 0);
    LV.bullets.push({
      x: P.x + Math.cos(P.ang) * 20, y: P.y + Math.sin(P.ang) * 20,
      vx: Math.cos(a) * w.spd, vy: Math.sin(a) * w.spd,
      dmg: w.dmg || 0, sleep: w.sleep || 0, pierce: w.pierce || 0,
      fromPlayer: true, dart: !!w.dart, breach: !!w.breach, t: 1.2
    });
  }
  fxMuzzle(P.x + Math.cos(P.ang) * 22, P.y + Math.sin(P.ang) * 22, P.ang, w.silenced ? "#9fd7b0" : "#ffd27c", w.silenced ? 4 : 8);
  if (!w.dart){
    /* shell + smoke — the little lies that sell a gunshot */
    const sa = P.ang + Math.PI / 2;
    LV.fx.push({ x: P.x + Math.cos(P.ang) * 14, y: P.y + Math.sin(P.ang) * 14,
      vx: Math.cos(sa) * rr(60, 120) , vy: Math.sin(sa) * rr(60, 120), t: 0.55, kind: "shell", col: "#c8a43c" });
    LV.fx.push({ x: P.x + Math.cos(P.ang) * 26, y: P.y + Math.sin(P.ang) * 26,
      vx: Math.cos(P.ang) * 40, vy: Math.sin(P.ang) * 40, t: 0.6, kind: "smoke", col: "#ccc" });
  }
  if (w.dart) SFX.dart(); else if (w.silenced) SFX.silenced(); else if (w.pellets) SFX.shotgun(); else SFX.shot();
  addNoise(P.x, P.y, w.noise, w.noise > 200 ? "gun" : "quiet");
  if (w.noise > 200) shake(3);
}
function _dropCard(e){
  if (e.card && !e.cardDropped){
    e.cardDropped = true;
    LV.picks.push({ x: Math.floor(e.x / T), y: Math.floor(e.y / T), k: "card", card: e.card, got: false });
    toast("the officer dropped his " + e.card.toUpperCase() + " card", "#ffd27c");
  }
}

/* E does the nearest sensible thing: choke > drag > hack > take file */
function _interactions(dt){
  const holdingE = KEYS.has("KeyE") || TOUCH.act;
  P.ctx = null;                                   // HUD prompt, set below
  /* ongoing choke */
  if (P.choke){
    const e = P.choke;
    if (!holdingE || down(e)){ P.choke = null; }
    else {
      P.chokeT += dt / ((skinDef().chokeMul || 1) * 1.1);
      e.stagT = 0.2; e.x += (rnd() - 0.5) * 1.4; e.y += (rnd() - 0.5) * 1.4;
      if ((MUSIC.step & 3) === 0) SFX.choke();
      if (P.chokeT >= 1){
        e.ko = 9e9; e.detect = 0; e.radioT = -1; P.choke = null;
        SFX.thud(); LV.stats.kos++; _dropCard(e);
        addNoise(P.x, P.y, 45, "scuffle");
      }
    }
    return;
  }
  /* ongoing drag */
  if (P.drag){
    if (!holdingE){ P.drag = null; }
    else { P.drag.x = P.x - Math.cos(P.ang) * 20; P.drag.y = P.y - Math.sin(P.ang) * 20; }
  }
  /* the sandbox gets first refusal on E — vehicles, uniforms, stashing, loot */
  const sbx = sandboxInteract();
  if (sbx){ P.ctx = sbx; return; }
  /* choke candidate: behind, close, alive */
  let cand = null;
  for (const e of LV.guards){
    if (down(e) || dist(P.x, P.y, e.x, e.y) > 43) continue;
    if (Math.abs(angDiff(e.ang, angTo(e.x, e.y, P.x, P.y))) > 1.85) cand = e;
  }
  if (cand){
    P.ctx = "E — CHOKE";
    if (PRESS.has("KeyE") || (TOUCH.act && !P.actLatch)){ P.choke = cand; P.chokeT = 0; }
    P.actLatch = TOUCH.act;
    return;
  }
  /* terminals */
  for (const t of LV.terms){
    if (t.done || dist(P.x, P.y, t.x * T + 24, t.y * T + 24) > 62) continue;
    P.ctx = "HOLD E — HACK";
    if (holdingE){
      t.prog += dt / 1.5;
      if ((LV.time * 10 | 0) % 2 === 0) SFX.hackTick();
      if (t.prog >= 1){
        t.done = true; LV.hacks++;
        STING.objective(); toast("TERMINAL CRACKED (" + LV.hacks + "/" + (LV.def.hacksNeed || 0) + ")", "#7cf9a5");
        if (LV.def.hackKillsCams){ for (const c of LV.cams) c.dead = true; toast("cameras are BLIND", "#7cf9a5"); }
        if (LV.hacks >= (LV.def.hacksNeed || 0) && LV.def.hacksNeed) toast("the CAGE is open", "#ffd27c");
      }
    } else t.prog = Math.max(0, t.prog - dt);
    return;
  }
  /* the file */
  for (const f of LV.files){
    if (LV.file || dist(P.x, P.y, f.x * T + 24, f.y * T + 24) > 60) continue;
    if (LV.hacks < (LV.def.hacksNeed || 0)) continue;
    P.ctx = "HOLD E — TAKE " + (LV.def.fileLabel || "THE FILE");
    if (holdingE){
      LV.fileProg += dt / (LV.def.fileHold || 1.2);
      if (LV.fileProg >= 1){
        LV.file = true;
        SFX.unlock(); toast("📁 " + (LV.def.fileLabel || "FILE") + " SECURED", "#ffd27c");
        if (LV.n === 5){ goCaution(P.x, P.y, 30); toast("vault sensors tripped — they know SOMETHING", "#ff8f8f"); }
      }
    } else LV.fileProg = Math.max(0, LV.fileProg - dt);
    return;
  }
  /* drag a body */
  if (!P.drag){
    for (const e of LV.guards.concat(LV.dogs, LV.civs)){
      if (!down(e) || dist(P.x, P.y, e.x, e.y) > 40) continue;
      P.ctx = "HOLD E — DRAG BODY";
      if (holdingE && !PRESS.has("KeyE")) P.drag = e;
      else if (PRESS.has("KeyE")) P.drag = e;
      return;
    }
  }
  /* locked door feedback */
  const fx = Math.floor((P.x + Math.cos(P.ang) * 34) / T), fy = Math.floor((P.y + Math.sin(P.ang) * 34) / T);
  const d = doorAtT(fx, fy);
  if (d && (d.kind === "Y" || d.kind === "B" || d.kind === "R") && !d.unlockedByPlayer && !d.broken){
    if (LV.cards[d.kind.toLowerCase()] || hasGear(7)) P.ctx = null;   // proximity opens it
    else P.ctx = "LOCKED — NEED " + (d.kind === "Y" ? "YELLOW" : d.kind === "B" ? "BLUE" : "RED") + " CARD";
  }
  if (d && d.kind === "C" && LV.hacks < (LV.def.hacksNeed || 0)) P.ctx = "SEALED — HACK THE TERMINALS";
  /* A DUCT IS ONLY A ROUTE IF YOU KNOW IT IS ONE. On level 3 the vent is the
     ONLY way up from the sub-floor, and standing next to it while upright it
     reads as solid wall — so say the word out loud. */
  if (!P.ctx && !P.sneak){
    const px0 = Math.floor(P.x / T), py0 = Math.floor(P.y / T);
    for (const [ix, iy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
      if (tileAt(px0 + ix, py0 + iy) === "V"){ P.ctx = "HOLD C — CRAWL INTO THE VENT"; break; }
  }
}
function _pickups(){
  for (const p of LV.picks){
    if (p.got || dist(P.x, P.y, p.x * T + 24, p.y * T + 24) > 30) continue;
    p.got = true;
    if (p.k === "card"){ LV.cards[p.card] = true; SFX.card(); toast((p.card === "y" ? "YELLOW" : p.card === "b" ? "BLUE" : "RED") + " KEYCARD", "#ffd27c"); }
    else if (p.k === "intel"){
      LV.stats.intel++; SFX.intel();
      const lore = (LV.def.lore || [])[LV.stats.intel - 1];
      toast(lore || ("INTEL " + LV.stats.intel + " — exhibit logged"), "#8fc7ff");
    }
    else if (p.k === "darts"){ P.darts += 6; SFX.reload(); toast("+6 DARTS", "#9fd7b0"); }
    else if (p.k === "med"){ if (P.hp < P.hpMax){ P.hp = Math.min(P.hpMax, P.hp + 1); SFX.intel(); toast("+1 ♥", "#7cf9a5"); } else { p.got = false; continue; } }
  }
}
function _detectors(dt){
  for (const m of LV.dets){ m.ping = Math.max(0, m.ping - dt); }
  const tx = Math.floor(P.x / T), ty = Math.floor(P.y / T);
  if (!LV.detAt.has(tx + ty * LV.w)) return;
  const armed = P.weapons.some(id => { const w = WEAPONS[id]; return !w.melee && !w.dart; });
  const m = LV.dets.find(m => m.x === tx && m.y === ty);
  if (armed && m && m.ping <= 0){
    m.ping = 3; SFX.alarm(); addNoise(P.x, P.y, 240, "alarm");
    goCaution(P.x, P.y, 14);
    toast("⚠ METAL DETECTOR — your iron sang", "#ff8f8f");
  }
}
function _lasers(){
  for (const l of (LV.def.lasers || [])){
    const on = ((LV.time + l.phase) % l.period) < l.period * l.duty;
    l.on = on;
    if (!on || P.laserCool > LV.time) continue;
    const x1 = l.x1 * T + 24, y1 = l.y1 * T + 24, x2 = l.x2 * T + 24, y2 = l.y2 * T + 24;
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy;
    const tt = clamp(((P.x - x1) * dx + (P.y - y1) * dy) / len2, 0, 1);
    if (dist(P.x, P.y, x1 + dx * tt, y1 + dy * tt) < 16){
      P.laserCool = LV.time + 3;
      SFX.alarm(); goCaution(P.x, P.y, 18); LV.lastKnown = { x: P.x, y: P.y };
      toast("⚠ LASER TRIPPED", "#ff8f8f");
      fxRing(P.x, P.y, "#ff5b5b");
    }
  }
}
function _exitCheck(dt){
  const objsDone = LV.hacks >= (LV.def.hacksNeed || 0) && (!LV.def.fileNeed || LV.file);
  const tx = Math.floor(P.x / T), ty = Math.floor(P.y / T);
  const onExit = LV.exits.some(e => e.x === tx && e.y === ty);
  if (LV.def.exfil){
    /* the pad IS the exit: stand on it, hold, board */
    if (!LV.holdDone){
      if (onExit){
        LV.holdT += dt;
        if (!LV.holdStarted){ LV.holdStarted = true; goCombat(P.x, P.y); toast("HOLD THE PAD — bird inbound", "#ffd27c"); LV.waveT = 0; }
        if (LV.holdT >= (LV.def.holdTime || 30)){ LV.holdDone = true; LV.chopper = 0.001; toast("CHOPPER FLARING — GET ON", "#7cf9a5"); }
      } else LV.holdT = Math.max(0, LV.holdT - dt * 0.6);
      if (LV.holdStarted && !LV.holdDone){
        LV.waveT -= dt;
        if (LV.waveT <= 0){ LV.waveT = 7; reinforce(1 + (LV.holdT > 15 ? 1 : 0)); }
        LV.alertT = 12;                             // combat never cools during the hold
      }
    } else {
      LV.chopper = Math.min(1, LV.chopper + dt / 3.5);
      if (LV.chopper >= 1 && onExit) LV.over = "win";
    }
    return;
  }
  if (objsDone && onExit) LV.over = "win";
}
function playerHit(dmg, fromX, fromY){
  if (P.dead || LV.over || P.god) return;
  if (P.plate){                                   // KEVLAR WEAVE eats one hit, loudly
    P.plate = false; P.hurtT = 0.3; shake(5); SFX.hit();
    toast("🛡 KEVLAR ATE THAT ONE", "#9fd7b0");
    fxRing(P.x, P.y, "#9fd7b0");
    return;
  }
  P.hp -= dmg * diff().dmg;
  P.hurtT = 0.4; shake(6); SFX.hurt();
  /* which way did that come from — the single most useful combat readout */
  if (fromX != null) P.hurtFrom = { a: angTo(P.x, P.y, fromX, fromY), t: 1.4 };
  if (OPT.gore) fxBlood(P.x, P.y, 6, "#7cf9a5");
  if (P.hp <= 0){ P.dead = true; LV.over = "dead"; musicWant("calm"); STING.fail(); }
}

/* ---------- guards ---------- */
function guardUpdate(e, dt){
  if (e.dead) return;
  if (e.sleep > 0){ e.sleep -= dt; if (e.sleep <= 0 && e.ko <= 0){ e.st = "search"; e.detect = 0.6; e.susT = 8; e.target = { x: e.x, y: e.y }; e.bodyRadio = null; e.radioT = -1; toast("a guard woke up", "#ff8f8f"); goCaution(e.x, e.y, 15); } return; }
  if (e.ko > 0){ e.ko -= dt; if (e.ko <= 0){ e.st = "search"; e.susT = 8; e.target = { x: e.x, y: e.y }; e.bodyRadio = null; e.radioT = -1; goCaution(e.x, e.y, 15); } return; }
  if (e.stagT > 0){ e.stagT -= dt; return; }
  e.popT = Math.max(0, e.popT - dt);

  /* --- senses --- */
  const rate = seesPlayer(e, e.range, e.fov);
  if (rate >= 99){ e.detect = 1; }
  else if (rate > 0){ e.detect = Math.min(1, e.detect + rate * dt); if (LV.alert === 2) e.detect = 1; }
  else e.detect = Math.max(0, e.detect - dt * 0.35);
  if (rate > 0) LV.stats.seen = true;
  /* hearing */
  for (const nz of LV.noises){
    if (!nz.fresh || dist(e.x, e.y, nz.x, nz.y) > nz.r) continue;
    if (nz.kind === "gun" || nz.kind === "alarm"){
      e.detect = Math.max(e.detect, 0.8); e.st = "susp"; e.susT = 10; e.target = { x: nz.x, y: nz.y }; e.path = null;
      if (LV.alert === 0) goCaution(nz.x, nz.y, 15);
    } else if (e.st === "patrol" || e.st === "susp"){
      e.st = "susp"; e.susT = 7; e.target = { x: nz.x, y: nz.y }; e.path = null;
      if (e.pop !== "?"){ e.pop = "?"; e.popT = 1; SFX.susp(); }
    }
  }
  /* bodies on the floor: the finder stands over it and CALLS IT IN — a radio
     wind-up you can still interrupt. If the call completes, the whole site
     goes weapons-free and a QRF wave storms the doors. Hide your work. */
  for (const b of LV.guards.concat(LV.dogs, LV.civs)){
    if (b === e || !down(b) || b.found) continue;
    if (b.foundBy && b.foundBy !== e && !down(b.foundBy)) continue;   // someone's already on it
    const d = dist(e.x, e.y, b.x, b.y);
    if (d < 240 && Math.abs(angDiff(e.ang, angTo(e.x, e.y, b.x, b.y))) < e.fov / 2 && los(e.x, e.y, b.x, b.y, true, false)){
      if (d < 46){
        if (b.foundBy !== e){
          b.foundBy = e;
          e.st = "alert"; e.bodyRadio = b;
          e.radioT = e.radioBase * 1.5 * (skinDef().radioMul || 1);
          e.target = { x: b.x, y: b.y }; e.path = null;
          e.pop = "!"; e.popT = 1; SFX.spot();
          if (b.sleep > 3) b.sleep = Math.min(b.sleep, 2.5);
          toast("⚠ a guard found a body — CUT THE CALL", "#ff8f8f");
        }
      } else if (e.st === "patrol"){ e.st = "susp"; e.susT = 8; e.target = { x: b.x, y: b.y }; e.path = null; }
    }
  }

  /* --- state transitions --- */
  if (e.detect >= 1 && e.st !== "alert"){
    e.st = "alert"; e.pop = "!"; e.popT = 1; STING.spotted();
    LV.stats.spotted = (LV.stats.spotted || 0) + 1;        // GHOST rank dies here
    e.radioT = e.radioBase * (skinDef().radioMul || 1) * diff().radio;
    e.bodyRadio = null;                                    // live hostile outranks a body report
    e.target = { x: P.x, y: P.y }; e.path = null;
    /* SHOUT. Before the radio ever connects, the man simply yells — everyone
       in earshot converges. Killing the messenger stops HQ, not his friends,
       which is what makes a silenced takedown feel like a decision. */
    addNoise(e.x, e.y, 300, "shout");
    for (const o of LV.guards){
      if (o === e || down(o) || o.st === "alert") continue;
      if (dist(o.x, o.y, e.x, e.y) > 340) continue;
      o.st = "susp"; o.susT = Math.max(o.susT || 0, 9);
      o.target = { x: P.x, y: P.y }; o.path = null;
      if (o.pop !== "?"){ o.pop = "?"; o.popT = 0.9; }
    }
  } else if (e.detect >= 0.45 && e.st === "patrol"){
    e.st = "susp"; e.susT = 6; e.target = { x: P.x, y: P.y }; e.path = null;
    e.pop = "?"; e.popT = 1; SFX.susp();
  }

  /* radio wind-up: kill the messenger, kill the message. The tick must not
     care what the legs are doing — a body-caller stands and talks. */
  if ((e.st === "alert" || e.bodyRadio) && e.radioT > -1.5){
    if (e.radioT > 0){
      e.radioT -= dt;
      if (e.radioT <= 0){
        e.radioT = -2;
        if (e.bodyRadio){
          const b = e.bodyRadio; b.found = true; e.bodyRadio = null;
          bodyAlarm(b.x, b.y);
        } else { goCombat(P.x, P.y); heatAdd(1, "radio call completed"); }
      }
    }
  }
  /* mid-call: plant feet over the body, face it, talk. Interrupt window. */
  if (e.bodyRadio && e.radioT > 0){
    e.ang += angDiff(e.ang, angTo(e.x, e.y, e.bodyRadio.x, e.bodyRadio.y)) * Math.min(1, dt * 8);
    return;
  }

  /* --- behavior --- */
  const canSee = rate > 0;
  if (e.st === "alert"){
    if (canSee){ e.target = { x: P.x, y: P.y }; if (LV.alert === 2){ LV.lastKnown = { x: P.x, y: P.y }; LV.alertT = 12; } }
    const d = dist(e.x, e.y, P.x, P.y);
    if (canSee && d < 470){
      e.ang += angDiff(e.ang, angTo(e.x, e.y, P.x, P.y)) * Math.min(1, dt * 12);
      e.shootT -= dt;
      if (e.shootT <= 0){
        if (e.burst <= 0){ e.burst = e.gun === "smg" ? 5 : 3; e.shootT = 0.75; }
        else {
          e.burst--; e.shootT = e.gun === "smg" ? 0.09 : 0.16;
          const a = e.ang + (rnd() - 0.5) * 0.12;
          LV.bullets.push({ x: e.x + Math.cos(e.ang) * 18, y: e.y + Math.sin(e.ang) * 18,
            vx: Math.cos(a) * 760, vy: Math.sin(a) * 760, dmg: 0.5, fromPlayer: false, t: 1.2 });
          fxMuzzle(e.x + Math.cos(e.ang) * 20, e.y + Math.sin(e.ang) * 20, e.ang, "#ffd27c", 6);
          SFX.shot(); addNoise(e.x, e.y, 300, "gun");
        }
      }
      if (d > 180 && e.repathT <= 0){ nearestPathTo(e, Math.floor(e.target.x / T), Math.floor(e.target.y / T), "g"); e.repathT = 0.6; }
      e.repathT -= dt;
      if (d > 180) walkPath(e, e.spd * 1.5, dt);
    } else {
      /* lost him: push to last known, then hand over to search */
      const tgt = LV.alert === 2 && LV.lastKnown ? LV.lastKnown : e.target;
      if (tgt){
        e.repathT -= dt;
        if (e.repathT <= 0){ nearestPathTo(e, Math.floor(tgt.x / T), Math.floor(tgt.y / T), "g"); e.repathT = 0.7; }
        if (walkPath(e, e.spd * 1.45, dt)){ e.st = "search"; e.susT = 9; }
      } else { e.st = "search"; e.susT = 9; }
    }
  }
  else if (e.st === "susp"){
    e.susT -= dt;
    if (e.target){
      e.repathT -= dt;
      if (e.repathT <= 0){ nearestPathTo(e, Math.floor(e.target.x / T), Math.floor(e.target.y / T), "g"); e.repathT = 0.8; }
      if (walkPath(e, e.spd * 1.15, dt)){ e.target = null; e.scanA = e.ang; }
    } else e.ang = e.scanA + Math.sin(LV.time * 2.2) * 1.1;
    if (e.susT <= 0){ e.st = isHunter(e) ? "hunt" : "return"; e.path = null; }
  }
  else if (e.st === "search"){
    e.susT -= dt;
    const around = LV.lastKnown || { x: e.x, y: e.y };
    /* COORDINATED SWEEP: each searcher owns a slice of the compass around the
       last sighting, so three guards cover three directions instead of all
       three walking the same corridor. Cheap, and it reads as training. */
    if (e.sweepSlot == null) e.sweepSlot = LV.guards.indexOf(e);
    if (!e.path || e.pathI >= e.path.length){
      const n = Math.max(1, LV.guards.filter(q => q.st === "search").length);
      const a = (e.sweepSlot % n) / n * TAU + rr(-0.5, 0.5);
      const r = rr(2.5, 6.5);
      const tx = Math.floor(around.x / T + Math.cos(a) * r), ty = Math.floor(around.y / T + Math.sin(a) * r);
      if (!solidMove(tx, ty, "g", { pathing: true })) nearestPathTo(e, tx, ty, "g");
      else { e.sweepSlot++; }                       // blocked slice — take the next one
    }
    walkPath(e, e.spd * 1.1, dt);
    if (e.susT <= 0 || (LV.alert === 0)){ e.st = isHunter(e) ? "hunt" : "return"; e.path = null; e.sweepSlot = null; }
  }
  else if (e.st === "return"){
    const [rx, ry] = e.route[e.ri];
    if (!e.path || e.pathI >= e.path.length){
      if (Math.floor(e.x / T) === rx && Math.floor(e.y / T) === ry){ e.st = isHunter(e) ? "hunt" : "patrol"; e.path = null; }
      else nearestPathTo(e, rx, ry, "g");
    }
    if (e.path) walkPath(e, e.spd, dt);
  }
  /* HUNT — the Director's resting state, and the one he can never leave.
     Everyone else forgets: susT runs out, they walk back to their route and
     the building goes quiet again. He does not. Once the floor has a last
     known position he walks to it, and when it goes stale he keeps working
     outward from it instead of standing down.
     Crucially he is NOT omniscient — he only ever knows what the building
     knows (LV.lastKnown). Before you slip up he has nothing to go on and
     simply walks his route, which is what makes the first mistake matter. */
  else if (e.st === "hunt"){
    const lead = LV.lastKnown;
    if (lead){
      e.huntT = (e.huntT || 0) - dt;
      const stale = dist(e.x, e.y, lead.x, lead.y) < 90;
      if (!e.path || e.pathI >= e.path.length || e.huntT <= 0){
        e.huntT = 1.4;
        /* on top of the lead and he still has not found you: work outward in
           widening rings rather than stand on the spot */
        const rad = stale ? rr(3.5, 8) : 0;
        const a = rr(0, TAU);
        const tx = Math.floor(lead.x / T + Math.cos(a) * rad), ty = Math.floor(lead.y / T + Math.sin(a) * rad);
        if (!solidMove(tx, ty, "g", { pathing: true })) nearestPathTo(e, tx, ty, "g");
        else nearestPathTo(e, Math.floor(lead.x / T), Math.floor(lead.y / T), "g");
      }
      walkPath(e, e.spd * 1.05, dt);
    } else {
      /* nothing to go on yet — walk the route like anyone else */
      if (e.route.length > 1){
        const [rx, ry] = e.route[e.ri];
        if (!e.path || e.pathI >= e.path.length){
          if (Math.floor(e.x / T) === rx && Math.floor(e.y / T) === ry){
            e.ri = e.fwd ? e.ri + 1 : e.ri - 1;
            if (e.ri >= e.route.length){ e.fwd = false; e.ri = e.route.length - 2; }
            if (e.ri < 0){ e.fwd = true; e.ri = 1; }
            e.scanA = e.ang;
          } else nearestPathTo(e, rx, ry, "g");
        }
        if (e.path) walkPath(e, e.spd * 0.85, dt);
      } else e.ang = e.scanA + Math.sin(LV.time * 1.1 + e.x) * 0.6;
    }
  }
  else { /* patrol */
    if (e.waitT > 0){
      e.waitT -= dt;
      e.ang = e.scanA + Math.sin(LV.time * 1.8) * 0.7;
    } else if (e.route.length > 1){
      const [rx, ry] = e.route[e.ri];
      if (!e.path || e.pathI >= e.path.length){
        if (Math.floor(e.x / T) === rx && Math.floor(e.y / T) === ry){
          e.ri = e.fwd ? e.ri + 1 : e.ri - 1;
          if (e.ri >= e.route.length){ e.fwd = false; e.ri = e.route.length - 2; }
          if (e.ri < 0){ e.fwd = true; e.ri = 1; }
          e.waitT = 1.3; e.scanA = e.ang;
        } else nearestPathTo(e, rx, ry, "g");
      }
      if (e.path) walkPath(e, e.spd, dt);
    } else e.ang = e.scanA + Math.sin(LV.time * 1.4 + e.x) * 0.8;
  }
}

/* ---------- dogs: the nose knows ---------- */
function dogUpdate(e, dt){
  if (e.dead) return;
  if (e.sleep > 0){ e.sleep -= dt; return; }
  if (e.stagT > 0){ e.stagT -= dt; return; }
  const d = dist(e.x, e.y, P.x, P.y);
  /* scent: through walls, defeated only by stillness+crouch */
  const treats = hasGear(6) ? 0.5 : 1;              // K9 TREATS: the nose doubts itself
  if (!P.dead && d < 150){
    const still = P.sneak && !P.moving;
    e.detect = Math.min(1, e.detect + dt * (still ? 0.1 : 0.5) * treats);
  } else if (seesPlayer(e, 230, 0.9, true) > 0){ e.detect = Math.min(1, e.detect + dt * 2.4 * treats); }
  else e.detect = Math.max(0, e.detect - dt * 0.4);
  if (e.detect >= 1 && e.st !== "alert"){
    e.st = "alert";
    if (!e.barked){ e.barked = true; SFX.spot(); addNoise(e.x, e.y, 220, "bark"); toast("the K9 has your scent", "#ff8f8f"); }
  }
  if (e.st === "alert"){
    if (e.detect < 0.2){ e.st = "patrol"; e.barked = false; e.path = null; return; }
    e.repathT -= dt;
    if (e.repathT <= 0){ nearestPathTo(e, Math.floor(P.x / T), Math.floor(P.y / T), "d"); e.repathT = 0.35; }
    walkPath(e, 175, dt);
    e.lungeT -= dt;
    if (d < 58 && e.lungeT <= 0){
      e.lungeT = 1.4; playerHit(0.5, e.x, e.y); P.kd = 0.35;
      fxBlood(P.x, P.y, 4, "#7cf9a5");
    }
  } else {
    const [rx, ry] = e.route[e.ri];
    if (!e.path || e.pathI >= e.path.length){
      if (Math.floor(e.x / T) === rx && Math.floor(e.y / T) === ry){
        e.ri = e.fwd ? e.ri + 1 : e.ri - 1;
        if (e.ri >= e.route.length){ e.fwd = false; e.ri = e.route.length - 2; }
        if (e.ri < 0){ e.fwd = true; e.ri = 1; }
      } else nearestPathTo(e, rx, ry, "d");
    }
    if (e.path) walkPath(e, 130, dt);
  }
}

/* ---------- civilians ---------- */
function civUpdate(e, dt){
  if (e.dead || e.ko > 0 || e.sleep > 0){ if (e.ko > 0) e.ko -= dt; if (e.sleep > 0) e.sleep -= dt; return; }
  if (e.freeze > 0){
    e.freeze -= dt;
    e.ang = angTo(e.x, e.y, P.x, P.y);          // hands up, watching you
    return;
  }
  /* a body on the carpet sends an analyst SPRINTING for the wall panel */
  if (e.st !== "panic" && e.st !== "cower"){
    for (const b of LV.guards.concat(LV.dogs, LV.civs)){
      if (b === e || !down(b) || b.civSeen) continue;
      if (dist(e.x, e.y, b.x, b.y) < 190 && Math.abs(angDiff(e.ang, angTo(e.x, e.y, b.x, b.y))) < 1.1
          && los(e.x, e.y, b.x, b.y, true, false)){
        b.civSeen = true;                          // one scream per body
        e.st = "panic"; SFX.susp();
        let best = null, bd = 1e9;
        for (const pn of LV.panels){ const dd = dist(e.x, e.y, pn.x * T, pn.y * T); if (dd < bd){ bd = dd; best = pn; } }
        e.panicTo = best; e.path = null;
        toast("an analyst SAW your work — stop them", "#ff8f8f");
        break;
      }
    }
  }
  /* spot the intruder? */
  const wOut = !curW().melee;
  if (!P.dead && dist(e.x, e.y, P.x, P.y) < 210 && Math.abs(angDiff(e.ang, angTo(e.x, e.y, P.x, P.y))) < 1.1
      && los(e.x, e.y, P.x, P.y, true, P.sneak) && (wOut || LV.alert > 0 || P.runHeld)){
    /* held up at gunpoint? freeze. otherwise: RUN for the wall panel */
    if (wOut && dist(e.x, e.y, P.x, P.y) < 170 && Math.abs(angDiff(P.ang, angTo(P.x, P.y, e.x, e.y))) < 0.5){
      if (!e.frozeBefore){ e.frozeBefore = true; toast("analyst frozen — hands up", "#8fc7ff"); }
      e.freeze = 8; return;
    }
    if (e.st !== "panic"){
      e.st = "panic"; SFX.susp();
      let best = null, bd = 1e9;
      for (const pn of LV.panels){ const dd = dist(e.x, e.y, pn.x * T, pn.y * T); if (dd < bd){ bd = dd; best = pn; } }
      e.panicTo = best; e.path = null;
      toast("an analyst is running for the ALARM", "#ff8f8f");
    }
  }
  if (e.st === "panic"){
    if (!e.panicTo){ e.st = "cower"; return; }
    e.repathT -= dt;
    if (e.repathT <= 0){ nearestPathTo(e, e.panicTo.x, e.panicTo.y, "c"); e.repathT = 0.6; }
    if (walkPath(e, 165, dt)){
      e.pulledT += dt;
      if (e.pulledT > 1.2 && !e.panicTo.pulled){
        e.panicTo.pulled = true;
        addNoise(e.x, e.y, 400, "alarm");
        bodyAlarm(P.x, P.y, "🚨 ALARM PULLED — QRF INBOUND");   // pulls go straight to weapons-free
        e.st = "cower";
      }
    }
  } else if (e.st === "cower"){ /* stays put, shaking */ }
  else {
    if (e.waitT > 0){ e.waitT -= dt; }
    else if (e.route.length > 1){
      const [rx, ry] = e.route[e.ri];
      if (!e.path || e.pathI >= e.path.length){
        if (Math.floor(e.x / T) === rx && Math.floor(e.y / T) === ry){
          e.ri = e.fwd ? e.ri + 1 : e.ri - 1;
          if (e.ri >= e.route.length){ e.fwd = false; e.ri = e.route.length - 2; }
          if (e.ri < 0){ e.fwd = true; e.ri = 1; }
          e.waitT = rr(1, 3);
        } else nearestPathTo(e, rx, ry, "c");
      }
      if (e.path) walkPath(e, 70, dt);
    }
  }
}

/* ---------- cameras ---------- */
function camUpdate(e, dt){
  if (e.dead) return;
  e.t += dt;
  e.ang = e.base + Math.sin(e.t * (0.9 / e.sweep)) * e.arc;
  e.cool = Math.max(0, e.cool - dt);
  const rate = seesPlayer(e, e.range, 0.55, true);      // IR optics: darkness won't save you here
  if (rate > 0){
    e.detect = Math.min(1, e.detect + rate * dt * 1.4);
    if (e.detect >= 1 && e.cool <= 0){
      e.cool = 18; e.detect = 0;
      SFX.alarm(); goCaution(P.x, P.y, 20); LV.stats.alarms++;
      addNoise(e.x, e.y, 380, "alarm");
      toast("📷 CAMERA MADE YOU", "#ff5b5b");
      fxRing(e.x, e.y, "#ff5b5b");
    }
  } else e.detect = Math.max(0, e.detect - dt * 0.6);
}

/* ---------- bullets, darts ---------- */
function bulletsUpdate(dt){
  for (const b of LV.bullets){
    if (b.gone) continue;
    b.t -= dt; if (b.t <= 0){ b.gone = true; continue; }
    const steps = Math.ceil(Math.hypot(b.vx, b.vy) * dt / 12);
    for (let i = 0; i < steps && !b.gone; i++){
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      const tx = Math.floor(b.x / T), ty = Math.floor(b.y / T);
      const c = tileAt(tx, ty);
      if (c === "=" ){
        LV.grid[ty][tx] = ".";           // glass shatters, everyone hears it
        SFX.glass(); addNoise(b.x, b.y, 260, "gun");
        fxShards(b.x, b.y); markDirty(tx, ty);
        continue;
      }
      const d = doorAtT(tx, ty);
      if (d && !d.broken && d.open < 0.6){
        if (b.breach && (d.kind === "Y" || d.kind === "B" || d.kind === "R")){
          d.broken = true; SFX.breach(); addNoise(b.x, b.y, 420, "gun"); shake(8);
          toast("door BREACHED", "#ffd27c"); fxShards(b.x, b.y);
        }
        b.gone = true; fxSpark(b.x, b.y); break;
      }
      if (c === "#" || c === " " || c === "V" || (c === "-" && !b.fromPlayer && rnd() < 0.4)){
        b.gone = true; fxSpark(b.x, b.y);
        if (b.dart && b.fromPlayer) addNoise(b.x, b.y, 90, "dartwall");   // a dart *tick* is a lure
        break;
      }
      if (b.fromPlayer){
        /* chaos props take the round before anything else does */
        let hitProp = false;
        for (const pr of (LV.props || [])){
          if (pr.dead || dist(b.x, b.y, pr.x, pr.y) > 16) continue;
          propHit(pr, true); b.gone = true; hitProp = true; break;
        }
        if (hitProp) break;
        /* lamps die to gunfire — darkness is a weapon */
        for (const L of LIGHTS){
          if (L.dead || L.em || dist(b.x, b.y, L.x, L.y) > 11) continue;
          L.dead = true; b.gone = true;
          SFX.glass(); fxSpark(L.x, L.y); fxShards(L.x, L.y);
          addNoise(L.x, L.y, b.dart ? 70 : 120, "glass");
          break;
        }
        /* cameras too */
        for (const cm of LV.cams){
          if (cm.dead || dist(b.x, b.y, cm.x, cm.y) > 15) continue;
          cm.dead = true; b.gone = true;
          SFX.glass(); fxSpark(cm.x, cm.y);
          addNoise(cm.x, cm.y, 100, "glass");
          toast("📷 camera down", "#9fd7b0");
          break;
        }
        if (b.gone) break;
      }
      if (b.fromPlayer){
        for (const e of LV.guards.concat(LV.dogs, LV.civs)){
          if (down(e) || dist(b.x, b.y, e.x, e.y) > (e.r || 13) + 4) continue;
          if (b.sleep){
            e.sleep = b.sleep; e.detect = 0; e.radioT = -1; e.hits = 0;
            SFX.thud(); fxZzz(e.x, e.y); LV.stats.kos++;
            if (e.kind !== "dog" && e.kind !== "civ") _dropCard(e);
          } else {
            e.hp -= b.dmg; fxBlood(e.x, e.y, 5, e.kind === "civ" ? "#c95b5b" : "#a33");
            if (e.hp <= 0){
              e.dead = true; SFX.thud(); LV.stats.kills++;
              heatAdd(e.kind === "civ" ? 2 : 1, e.kind === "civ" ? "you shot a civilian" : "a body with a hole in it");
              if (e.kind === "civ"){ LV.stats.civHurt++; toast("you shot an ANALYST. bad optics.", "#ff5b5b"); }
              LV.decals.push({ x: e.x, y: e.y, r: 5, max: 15 + rnd() * 9, col: "rgba(120,20,26,0.5)" });
              if (e.kind !== "dog" && e.kind !== "civ") _dropCard(e);
            } else { e.stagT = 0.25; SFX.hit(); }
          }
          if (b.pierce > 0){ b.pierce--; } else b.gone = true;
          break;
        }
      } else if (!P.dead && dist(b.x, b.y, P.x, P.y) < 17){
        playerHit(b.dmg, b.x - b.vx * 0.1, b.y - b.vy * 0.1); b.gone = true;
      }
    }
  }
  LV.bullets = LV.bullets.filter(b => !b.gone);
}

/* ---------- fx ---------- */
function fxMuzzle(x, y, ang, col, n){ for (let i = 0; i < n; i++) LV.fx.push({ x, y, vx: Math.cos(ang + (rnd() - 0.5) * 0.8) * rr(80, 260), vy: Math.sin(ang + (rnd() - 0.5) * 0.8) * rr(80, 260), t: 0.12, kind: "spark", col }); }
function fxSpark(x, y){ for (let i = 0; i < 4; i++) LV.fx.push({ x, y, vx: rr(-140, 140), vy: rr(-140, 140), t: 0.2, kind: "spark", col: "#ffd27c" }); }
function fxBlood(x, y, n, col){ for (let i = 0; i < n; i++) LV.fx.push({ x, y, vx: rr(-120, 120), vy: rr(-120, 120), t: 0.35, kind: "blood", col: col || "#a33" }); }
function fxShards(x, y){ for (let i = 0; i < 10; i++) LV.fx.push({ x, y, vx: rr(-220, 220), vy: rr(-220, 220), t: 0.5, kind: "shard", col: "#bfe6ff" }); }
function fxZzz(x, y){ for (let i = 0; i < 3; i++) LV.fx.push({ x, y: y - 6 - i * 4, vx: rr(-6, 6), vy: -22, t: 1.4 + i * 0.3, kind: "zzz", col: "#8fc7ff" }); }
function fxRing(x, y, col){ LV.fx.push({ x, y, vx: 0, vy: 0, t: 0.5, kind: "ring", col }); }
function fxUpdate(dt){
  for (const f of LV.fx){ f.t -= dt; f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt; if (f.kind === "blood"){ f.vx *= 0.86; f.vy *= 0.86; } }
  LV.fx = LV.fx.filter(f => f.t > 0);
  /* coins in flight */
  for (const cn of LV.coins){
    cn.t -= dt; cn.spin += dt * 20;
    cn.x += cn.vx * dt; cn.y += cn.vy * dt;
    if (cn.t <= 0 && !cn.done){
      cn.done = true;
      SFX.knock(); addNoise(cn.x, cn.y, 165, "coin");
      fxRing(cn.x, cn.y, "#ffd27c");
    }
  }
  LV.coins = LV.coins.filter(cn => !cn.done || cn.t > -0.4);
  for (const nz of LV.noises){ nz.fresh = false; nz.t -= dt; }
  LV.noises = LV.noises.filter(nz => nz.t > 0);
}

/* ---------- per-frame world tick ---------- */
function entsUpdate(dt){
  LV.time += dt;
  sandboxUpdate(dt);
  /* QRF waves ride sim-time */
  for (const w of LV.waveQ){ w.t -= dt; if (w.t <= 0 && !w.done){ w.done = true; reinforce(w.n); } }
  LV.waveQ = LV.waveQ.filter(w => !w.done);
  /* a downed radio-man drops the call — the body can be re-found by others */
  for (const b of LV.guards.concat(LV.dogs, LV.civs))
    if (b.foundBy && down(b.foundBy)) b.foundBy = null;
  playerUpdate(dt);
  for (const e of LV.guards) guardUpdate(e, dt);
  for (const e of LV.dogs) dogUpdate(e, dt);
  for (const e of LV.civs) civUpdate(e, dt);
  for (const e of LV.cams) camUpdate(e, dt);
  bulletsUpdate(dt);
  fxUpdate(dt);
  updateDoors(dt, [P].concat(LV.guards, LV.dogs, LV.civs));
  /* global alert cool-down */
  if (LV.alert > 0 && LV.alertT < 1e8){
    LV.alertT -= dt * (1 / diff().alert);          // harder settings hold the alert longer
    if (LV.alertT <= 0){
      if (LV.alert === 2){ LV.alert = 1; LV.alertT = 18; musicWant("caution"); STING.lost();
        toast("they lost you — but they're still looking", "#ffd54f"); }
      else { LV.alert = 0; musicWant("calm"); STING.clear(); toast("…site returning to normal", "#9db4cc"); }
    }
  }
  if (LV.alert === 0 && MUSIC.want !== "calm") musicWant("calm");
}
