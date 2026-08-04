/* KJP QA — ?qa=1 static suite · ?bot=N sneaky autoplayer · window.KJP debug. */
"use strict";

let QA = null, BOT = null;

function runQA(){
  const checks = [];
  const t = (name, fn) => { try{ const r = fn(); checks.push([name, !!r, r === true ? "" : String(r || "returned falsy")]); }catch(e){ checks.push([name, false, e.message]); } };
  for (let n = 1; n <= 6; n++){
    const r = solveLevel(n);
    checks.push(["L" + n + " " + LEVELS[n].name + " solvable", r.ok, r.errs.join("; ")]);
  }
  t("angDiff wraps", () => Math.abs(angDiff(3, -3) - (TAU - 6) * -1) < 1e-6 || Math.abs(angDiff(3, -3)) < 0.3);
  t("angDiff signed", () => angDiff(0, 1) > 0 && angDiff(1, 0) < 0);
  t("astar corridor", () => { const sv = LV; loadLevel(1); const p = astar(21, 21, 24, 21, "g"); LV = sv; return p && p.length >= 3; });
  t("LOS blocked by wall", () => { const sv = LV; loadLevel(1); const r = !los(2 * T, 3 * T, 2 * T, 0.5 * T, true, false); LV = sv; return r; });
  t("weapons registry sane", () => Object.values(WEAPONS).every(w => w.name && (w.melee || (w.mag > 0 && w.rps > 0))));
  t("nft map 1-6 + holo", () => nftWeaponIds([1, 2, 3, 4, 5, 6]).length === 6 && nftWeaponIds([11]).includes("n1") && nftWeaponIds([16]).includes("n6"));
  t("skins registry sane", () => Object.values(SKINS).every(s => s.name && s.suit && typeof s.unlocked === "function") && Object.values(SKINS).every(s => { s.unlocked(); return true; }));
  t("mods apply + cache bust", () => {
    const bak = window.ownedModTypes;
    window.ownedModTypes = [1, 4, 5]; bumpMods();
    const s = wSpec("n1");
    const applied = s.laser === 1 && s.pierce === 1 && s.noise < WEAPONS.n1.noise && s.spread < WEAPONS.n1.spread;
    window.ownedModTypes = bak || []; bumpMods();
    const reverted = !(bak || []).includes(5) ? (wSpec("n1").pierce || 0) === (WEAPONS.n1.pierce || 0) : true;
    return applied && reverted;
  });
  t("lethal guns ship LOUD", () =>
    ["n1", "n2", "n3", "n4", "n5", "p9", "smg"].every(id => !WEAPONS[id].silenced && WEAPONS[id].noise > 200));
  t("suppressor mod silences", () => {
    const bak = window.ownedModTypes;
    window.ownedModTypes = [7]; bumpMods();
    const s = wSpec("n1");
    const ok = s.silenced === true && s.noise <= 85;
    window.ownedModTypes = bak || []; bumpMods();
    return ok;
  });
  t("agency iron takes no mods", () => {
    const bak = window.ownedModTypes;
    window.ownedModTypes = [2]; bumpMods();
    const ok = wSpec("p9").dmg === WEAPONS.p9.dmg;
    window.ownedModTypes = bak || []; bumpMods();
    return ok;
  });
  t("score ceiling safe", () => (SC.clear + SC.timeMax + SC.ghost + SC.pacifist + 6 * SC.intel) * 6 < 300000);
  t("save roundtrip", () => { const bak = JSON.stringify(PROG); PROG.__t = 1; saveProg(); const re = JSON.parse(localStorage.getItem("kjp_prog")); delete PROG.__t; saveProg(); return re.__t === 1 && (JSON.parse(bak), true); });
  t("rank ladder", () => rankFor({ ghost: true, pacifist: true }) === "BABA YAGA" && rankFor({ ghost: true }) === "GHOST" && rankFor({ combat: false }) === "SPECTRE");
  QA = { checks, pass: checks.filter(c => c[1]).length, total: checks.length };
  console.log("KJP QA: " + QA.pass + "/" + QA.total + " PASS");
  for (const [n2, ok, msg] of checks) if (!ok) console.error("QA FAIL: " + n2 + " — " + msg);
  window.QA_RESULT = QA;
}
function drawQA(){
  g.fillStyle = "#05070c"; g.fillRect(0, 0, W, H);
  g.font = "900 30px Arial Black"; g.fillStyle = QA.pass === QA.total ? "#7cf9a5" : "#ff8f8f";
  g.fillText("KJP QA — " + QA.pass + "/" + QA.total + " PASS", 60, 70);
  g.font = "700 13px monospace";
  QA.checks.forEach(([n2, ok, msg], i) => {
    const col = i % 2, row = i / 2 | 0;
    g.fillStyle = ok ? "#7cf9a5" : "#ff8f8f";
    g.fillText((ok ? "✓ " : "✗ ") + n2 + (ok ? "" : " — " + msg.slice(0, 40)), 60 + col * 600, 110 + row * 26);
  });
  g.fillStyle = "#57717f"; g.font = "700 12px Verdana";
  g.fillText("append ?bot=1..6 to watch the autoplayer clear an op", 60, H - 30);
}

/* ---------- the sneaky autoplayer ----------
   Real rules, real collision. God-mode vs damage only (it QAs geometry+flow,
   not marksmanship). Plans: terminals → file → exit; hunts card-officers when
   a color blocks; tranqs any guard that camps its path. */
function startBot(n){
  startLevel(n);
  BOT = { repathT: 0, path: null, pi: 0, stuckT: 0, lastPos: { x: 0, y: 0 }, target: null, phase: "plan", waitT: 0, shotT: 0 };
  P.god = true;
  toast("BOT ONLINE — op " + n, "#8fc7ff");
}
function botTargets(){
  /* cards we can grab off the floor first */
  const need = [];
  if (LV.hacks < (LV.def.hacksNeed || 0)){ const t = LV.terms.find(t => !t.done); if (t) return { x: t.x, y: t.y, act: "hack" }; }
  if (LV.def.fileNeed && !LV.file && LV.files[0]) return { x: LV.files[0].x, y: LV.files[0].y, act: "file" };
  const e = LV.exits[0];
  return { x: e.x, y: e.y, act: "exit" };
}
function botUpdate(dt){
  if (!BOT || !LV || LV.over) return;
  P.sneak = true;
  const tgt = botTargets();
  BOT.repathT -= dt;
  const ptx = Math.floor(P.x / T), pty = Math.floor(P.y / T);
  if (!BOT.path || BOT.repathT <= 0 || BOT.tk !== tgt.act){
    BOT.tk = tgt.act;
    BOT.path = astar(ptx, pty, tgt.x, tgt.y, "p", { sneak: true, unlocked: _unlockedDoors() });
    BOT.pi = 0; BOT.repathT = 1.2;
    /* blocked by a locked color? chase a card: floor pickup else the officer */
    if (!BOT.path){
      const pick = LV.picks.find(p => p.k === "card" && !p.got);
      if (pick){ BOT.path = astar(ptx, pty, pick.x, pick.y, "p", { sneak: true, unlocked: _unlockedDoors() }); }
      if (!BOT.path){
        const off = LV.guards.find(gg => gg.card && !gg.cardDropped && !down(gg));
        if (off){
          BOT.path = astar(ptx, pty, Math.floor(off.x / T), Math.floor(off.y / T), "p", { sneak: true, unlocked: _unlockedDoors() });
          BOT.hunt = off;
        }
      }
    }
  }
  /* dart the hunt target (or any camper close on our path) */
  BOT.shotT -= dt;
  const threat = BOT.hunt && !down(BOT.hunt) ? BOT.hunt :
    LV.guards.find(gg => !down(gg) && dist(gg.x, gg.y, P.x, P.y) < 190 && los(P.x, P.y, gg.x, gg.y, false, false));
  if (threat && BOT.shotT <= 0 && (P.ammoIn.tranq > 0 || P.darts > 0)){
    if (P.ammoIn.tranq <= 0){ P.reloadT = 0.01; }
    P.ang = angTo(P.x, P.y, threat.x, threat.y);
    P.wi = P.weapons.indexOf("tranq");
    if (P.fireT <= 0 && P.reloadT <= 0){ _fire("tranq", WEAPONS.tranq); BOT.shotT = 0.8; }
    if (down(threat) && BOT.hunt === threat){ BOT.hunt = null; BOT.path = null; }
  }
  /* walk the path */
  if (BOT.path && BOT.pi < BOT.path.length){
    const [nx, ny] = BOT.path[BOT.pi];
    const gx = nx * T + 24, gy = ny * T + 24;
    if (dist(P.x, P.y, gx, gy) < 10) BOT.pi++;
    else {
      const a = angTo(P.x, P.y, gx, gy);
      moveCircle(P, Math.cos(a) * 120 * dt, Math.sin(a) * 120 * dt, 13, "p", { sneak: true, unlocked: _unlockedDoors() });
      if (!threat) P.ang = a;
    }
  }
  /* act at the target */
  const dTgt = dist(P.x, P.y, tgt.x * T + 24, tgt.y * T + 24);
  if (dTgt < 58 && (tgt.act === "hack" || tgt.act === "file")) KEYS.add("KeyE");
  else if (!KEYS.has("__realE")) KEYS.delete("KeyE");
  /* stuck watchdog */
  if (dist(P.x, P.y, BOT.lastPos.x, BOT.lastPos.y) < 2) BOT.stuckT += dt; else BOT.stuckT = 0;
  BOT.lastPos = { x: P.x, y: P.y };
  if (BOT.stuckT > 6){ BOT.path = null; BOT.repathT = 0; BOT.stuckT = 0; }
}

/* ---------- debug ---------- */
window.KJP = {
  load: n => { startLevel(n); },
  god: v => { if (P) P.god = v !== false; return P && P.god; },
  state: () => ({ state: STATE, lv: LV && LV.n, alert: LV && LV.alert, hp: P && P.hp, score: LV && computeResult().score }),
  bot: n => startBot(n || (LV ? LV.n : 1)),
  qa: () => { runQA(); STATE = "qa"; },
  shot: async () => {                       // hidden pane pauses rAF — render synchronously first
    frame(performance.now(), true);
    await fetch("/shot", { method: "POST", body: cv.toDataURL() });
    return "ok";
  },
  /* headless sim pump: rAF pauses in hidden panes, so QA drives fixed steps.
     KJP.step(3600) = one simulated minute, then a synchronous draw. */
  step: (n, dt) => {
    n = n || 1; dt = dt || 1 / 60;
    for (let i = 0; i < n; i++){
      if (STATE !== "game") break;
      gameUpdate(dt);
      if (LV) LV.toasts.forEach(t => t.t -= dt);   // toasts age in drawHUD, which we skip here
      inputEndFrame();
    }
    frame(performance.now(), true);
    return window.KJP.state();
  }
};
