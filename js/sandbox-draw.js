/* KJP — sandbox rendering: vehicles, props, stash, loot, smoke, heat stars,
   disguise meter, gadget belt, thermal vision. Split from sandbox.js so the
   simulation file stays readable and headless-testable. */
"use strict";

function drawSandboxWorld(){
  if (!LV || !LV.vehs) return;
  /* ---- stash containers ---- */
  for (const c of LV.stash){
    const lid = c.bodies > 0;
    g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(c.x - 20, c.y - 12, 42, 30);
    const gr = g.createLinearGradient(0, c.y - 18, 0, c.y + 16);
    if (c.kind === "bin"){ gr.addColorStop(0, "#2c4436"); gr.addColorStop(1, "#16241b"); }
    else { gr.addColorStop(0, "#39404e"); gr.addColorStop(1, "#1c2028"); }
    g.fillStyle = gr; g.fillRect(c.x - 22, c.y - 16, 44, 32);
    g.strokeStyle = "rgba(0,0,0,0.55)"; g.lineWidth = 1.5; g.strokeRect(c.x - 22, c.y - 16, 44, 32);
    g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(c.x - 22, c.y - 16, 44, 5);
    if (c.kind === "locker"){ g.strokeStyle = "rgba(0,0,0,0.4)"; g.beginPath(); g.moveTo(c.x, c.y - 16); g.lineTo(c.x, c.y + 16); g.stroke(); }
    if (lid){ g.fillStyle = "#7cf9a5"; g.font = "900 8px Arial Black"; g.textAlign = "center";
      g.fillText("×" + c.bodies, c.x, c.y + 4); g.textAlign = "left"; }
  }
  /* ---- chaos props ---- */
  for (const p of LV.props){
    if (p.t === "barrel"){
      if (p.dead) continue;
      g.fillStyle = "rgba(0,0,0,0.4)"; g.beginPath(); g.ellipse(p.x + 3, p.y + 5, 15, 9, 0, 0, TAU); g.fill();
      const gr = g.createLinearGradient(p.x - 13, 0, p.x + 13, 0);
      gr.addColorStop(0, "#8a3a1e"); gr.addColorStop(0.5, "#c4562b"); gr.addColorStop(1, "#6e2c16");
      g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, 13, 0, TAU); g.fill();
      g.strokeStyle = "rgba(0,0,0,0.5)"; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = "#f0d060"; g.fillRect(p.x - 9, p.y - 3, 18, 5);
      g.fillStyle = "#1a1008"; g.font = "900 5px Arial"; g.textAlign = "center"; g.fillText("FUEL", p.x, p.y + 1.4); g.textAlign = "left";
      glowBlob(p.x, p.y, 24, "rgba(255,140,60,");
    } else if (p.t === "fire"){
      if (!p.dead){
        g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(p.x - 6, p.y - 2, 14, 18);
        g.fillStyle = "#c0342b"; g.fillRect(p.x - 7, p.y - 14, 14, 26);
        g.fillStyle = "rgba(255,255,255,0.2)"; g.fillRect(p.x - 7, p.y - 14, 14, 4);
        g.fillStyle = "#e8e8f0"; g.fillRect(p.x - 3, p.y - 18, 6, 5);
      }
    } else if (p.t === "power"){
      g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(p.x - 13, p.y - 10, 28, 24);
      g.fillStyle = p.dead ? "#22282e" : "#39424e"; g.fillRect(p.x - 15, p.y - 14, 30, 26);
      g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1.5; g.strokeRect(p.x - 15, p.y - 14, 30, 26);
      g.fillStyle = "#f0d060"; g.font = "900 12px Arial"; g.textAlign = "center";
      g.fillText("⚡", p.x, p.y + 4); g.textAlign = "left";
      if (!p.dead && Math.sin(performance.now() / 400 + p.x) > 0.7){ g.fillStyle = "#7cf9a5"; g.fillRect(p.x + 9, p.y - 11, 3, 3); }
    }
  }
  /* ---- loot ---- */
  for (const l of LV.loot){
    const bob = Math.sin(performance.now() / 360 + l.x) * 2;
    if (l.t === "safe"){
      g.fillStyle = "rgba(0,0,0,0.42)"; g.fillRect(l.x - 16, l.y - 12, 34, 30);
      g.fillStyle = l.done ? "#2a3038" : "#3b4450"; g.fillRect(l.x - 18, l.y - 16, 36, 32);
      g.strokeStyle = l.done ? "#4a5560" : "#8a7330"; g.lineWidth = 2; g.strokeRect(l.x - 18, l.y - 16, 36, 32);
      g.fillStyle = l.done ? "#4a5560" : "#ffd27c";
      g.beginPath(); g.arc(l.x + 4, l.y, 6, 0, TAU); g.stroke();
      g.fillRect(l.x + 3, l.y - 6, 2, 6);
      if (l.done){ g.fillStyle = "#0a0d10"; g.fillRect(l.x - 14, l.y - 12, 24, 24); }
    } else {
      g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(l.x - 13, l.y - 6 + bob, 28, 14);
      g.fillStyle = "#20262e"; g.fillRect(l.x - 14, l.y - 8 + bob, 28, 16);
      g.fillStyle = l.done ? "#2f4a3a" : "#4c8fe8"; g.fillRect(l.x - 11, l.y - 6 + bob, 22, 11);
      if (!l.done && Math.sin(performance.now() / 200) > 0){ g.fillStyle = "rgba(255,255,255,0.4)"; g.fillRect(l.x - 9, l.y - 4 + bob, 8, 2); }
    }
    if (!l.done){
      glowBlob(l.x, l.y, 26, "rgba(255,210,124,");
      if (l.prog > 0){
        g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 5; g.beginPath(); g.arc(l.x, l.y, 22, 0, TAU); g.stroke();
        g.strokeStyle = "#ffd27c"; g.lineWidth = 3;
        g.beginPath(); g.arc(l.x, l.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * l.prog); g.stroke();
      }
    }
  }
  /* ---- lure beacons ---- */
  for (const l of LV.lures){
    g.fillStyle = "#1d2836"; g.fillRect(l.x - 5, l.y - 5, 10, 10);
    g.fillStyle = "#8fc7ff"; g.fillRect(l.x - 2, l.y - 9, 4, 5);
    const ph = (performance.now() / 500) % 1;
    g.strokeStyle = `rgba(143,199,255,${0.55 - ph * 0.55})`; g.lineWidth = 2;
    g.beginPath(); g.arc(l.x, l.y, 10 + ph * 60, 0, TAU); g.stroke();
    glowBlob(l.x, l.y, 40, "rgba(143,199,255,");
  }
  /* ---- vehicles ---- */
  for (const v of LV.vehs) drawVehicle(v);
}
function drawVehicle(v){
  const D = VEHDEF[v.t];
  g.save(); g.translate(v.x, v.y); g.rotate(v.ang);
  softShadow(4, 6, D.l * 0.6, D.w * 0.55);
  const gr = g.createLinearGradient(0, -D.w / 2, 0, D.w / 2);
  gr.addColorStop(0, lite(D.col, 34)); gr.addColorStop(1, D.col);
  g.fillStyle = gr;
  g.beginPath();
  if (g.roundRect) g.roundRect(-D.l / 2, -D.w / 2, D.l, D.w, 7); else g.rect(-D.l / 2, -D.w / 2, D.l, D.w);
  g.fill();
  g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 1.6; g.stroke();
  /* cabin glass + roof line */
  g.fillStyle = "rgba(150,200,240,0.30)";
  g.fillRect(-D.l * 0.1, -D.w / 2 + 5, D.l * 0.3, D.w - 10);
  g.fillStyle = "rgba(255,255,255,0.10)"; g.fillRect(-D.l / 2 + 3, -D.w / 2 + 2, D.l - 6, 3);
  /* wheels */
  g.fillStyle = "#0b0e12";
  for (const sx of [-D.l * 0.3, D.l * 0.3]) for (const sy of [-D.w / 2 - 1, D.w / 2 - 4])
    g.fillRect(sx - 6, sy, 12, 5);
  if (v.t === "fork"){ g.fillStyle = "#c8a43c"; g.fillRect(D.l / 2, -10, 16, 3); g.fillRect(D.l / 2, 7, 16, 3); }
  /* headlights — a moving cone that isn't a guard's is a strong read */
  if (Math.abs(v.spd) > 4 || v.driver){
    g.fillStyle = "rgba(255,240,200,0.9)";
    g.fillRect(D.l / 2 - 3, -D.w / 2 + 4, 4, 5); g.fillRect(D.l / 2 - 3, D.w / 2 - 9, 4, 5);
    const lg = g.createRadialGradient(D.l / 2, 0, 6, D.l / 2, 0, 190);
    lg.addColorStop(0, "rgba(255,240,200,0.16)"); lg.addColorStop(1, "rgba(255,240,200,0)");
    g.fillStyle = lg;
    g.beginPath(); g.moveTo(D.l / 2, 0);
    g.arc(D.l / 2, 0, 190, -0.42, 0.42); g.closePath(); g.fill();
  }
  g.restore();
  if (Math.abs(v.spd) > 4) glowBlob(v.x, v.y, 46, "rgba(255,220,160,");
}

/* smoke is drawn in world space, above entities */
function drawSmoke(){
  if (!LV || !LV.smokes) return;
  for (const s of LV.smokes){
    const k = clamp(s.t / 3, 0, 1), grow = clamp((14 - s.t) / 1.5, 0.3, 1);
    for (let i = 0; i < 7; i++){
      const a = i / 7 * TAU + performance.now() / 3000;
      const rx = s.x + Math.cos(a) * s.r * 0.45, ry = s.y + Math.sin(a) * s.r * 0.45;
      const gr = g.createRadialGradient(rx, ry, 4, rx, ry, s.r * 0.72 * grow);
      gr.addColorStop(0, `rgba(196,204,214,${0.34 * k})`); gr.addColorStop(1, "rgba(196,204,214,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(rx, ry, s.r * 0.72 * grow, 0, TAU); g.fill();
    }
  }
}
/* THERMAL: silhouettes through the walls, drawn after the darkness pass */
function drawThermal(){
  if (!P || !(P.thermal > 0)) return;
  g.save(); g.translate(-Math.round(camX), -Math.round(camY));
  for (const e of LV.guards.concat(LV.dogs, LV.civs)){
    if (down(e)) continue;
    const gr = g.createRadialGradient(e.x, e.y, 2, e.x, e.y, 26);
    gr.addColorStop(0, "rgba(255,180,80,0.85)"); gr.addColorStop(0.6, "rgba(255,90,40,0.42)"); gr.addColorStop(1, "rgba(255,60,30,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(e.x, e.y, 26, 0, TAU); g.fill();
    g.strokeStyle = "rgba(255,220,150,0.8)"; g.lineWidth = 1.4;
    g.beginPath(); g.arc(e.x, e.y, 12, 0, TAU); g.stroke();
  }
  g.restore();
  g.fillStyle = "rgba(40,10,0,0.10)"; g.fillRect(0, 0, W, H);
}

/* ═══════════════════════ HUD ═══════════════════════ */
function drawSandboxHUD(){
  if (!LV || !LV.vehs) return;
  /* --- WANTED STARS --- */
  const stars = LV.heat | 0;
  if (stars > 0 || LV.heatFlash > 0){
    const sx = W - 214, sy = 156;
    g.font = "900 22px Arial Black";
    for (let i = 0; i < 5; i++){
      const on = i < stars;
      const pop = (LV.heatFlash > 0 && i === stars - 1) ? 1 + LV.heatFlash * 0.5 : 1;
      g.save(); g.translate(sx + i * 30, sy); g.scale(pop, pop);
      g.fillStyle = "rgba(0,0,0,0.55)"; g.fillText("★", 1.5, 1.5);
      g.fillStyle = on ? (stars >= 4 ? "#ff5b5b" : "#ffd27c") : "rgba(120,140,160,0.22)";
      g.fillText("★", 0, 0);
      g.restore();
    }
    g.font = "900 9px Arial Black"; g.fillStyle = stars >= 4 ? "#ff8f8f" : "#8a97a8";
    g.fillText(HEAT_NAMES[stars], sx, sy + 14);
    if (stars > 0){                                  // the cooldown bar you learn to watch
      const need = 9 + stars * 3;
      g.fillStyle = "rgba(0,0,0,0.5)"; g.fillRect(sx, sy + 20, 140, 4);
      g.fillStyle = "#7cf9a5"; g.fillRect(sx, sy + 20, 140 * clamp((LV.heatDecay || 0) / need, 0, 1), 4);
    }
  }
  /* --- DISGUISE --- */
  if (P.disguise){
    const dx = 26, dy = 128;
    const d = DISGUISES[P.disguise];
    g.fillStyle = "rgba(6,11,16,0.8)"; g.fillRect(dx, dy, 210, 30);
    brackets(dx, dy, 210, 30, P.blown > 0.6 ? "rgba(255,91,91,0.7)" : "rgba(124,249,165,0.5)", 7);
    g.fillStyle = d.col; g.fillRect(dx + 7, dy + 7, 16, 16);
    g.strokeStyle = "rgba(255,255,255,0.25)"; g.lineWidth = 1; g.strokeRect(dx + 7, dy + 7, 16, 16);
    g.font = "900 10px Arial Black"; g.fillStyle = "#cfe3d2"; g.fillText(d.name, dx + 30, dy + 13);
    g.fillStyle = "rgba(0,0,0,0.55)"; g.fillRect(dx + 30, dy + 18, 168, 6);
    const b = P.blown || 0;
    g.fillStyle = b > 0.66 ? "#ff5b5b" : b > 0.33 ? "#ffd54f" : "#7cf9a5";
    g.fillRect(dx + 30, dy + 18, 168 * (1 - b), 6);
    if (b > 0.5 && Math.sin(performance.now() / 120) > 0){
      g.font = "900 9px Arial Black"; g.fillStyle = "#ff8f8f"; g.fillText("SUSPICIOUS", dx + 132, dy + 13);
    }
  }
  /* --- GADGET BELT --- */
  const gx = 26, gy = H - 148;
  P.gads.forEach((id, i) => {
    const G = GADGETS[id], n = P.gadN[id] | 0, sel = i === P.gi;
    const x = gx + i * 46;
    g.fillStyle = sel ? "rgba(40,60,50,0.9)" : "rgba(8,13,18,0.72)";
    g.fillRect(x, gy, 42, 34);
    g.strokeStyle = sel ? "#7cf9a5" : n ? "rgba(90,110,130,0.5)" : "rgba(70,80,90,0.3)";
    g.lineWidth = sel ? 2 : 1; g.strokeRect(x + 0.5, gy + 0.5, 41, 33);
    g.globalAlpha = n ? 1 : 0.28;
    g.font = "16px serif"; g.textAlign = "center"; g.fillText(G.ic, x + 21, gy + 20);
    g.font = "900 9px Arial Black"; g.fillStyle = n ? "#cfe3d2" : "#5a6570";
    g.fillText("×" + n, x + 21, gy + 31);
    g.textAlign = "left"; g.globalAlpha = 1;
  });
  g.font = "700 8px Verdana"; g.fillStyle = "#49606c";
  g.fillText("[G] cycle  [V] use — " + GADGETS[P.gads[P.gi]].blurb, gx, gy - 5);
  /* --- driving / hiding banners --- */
  if (P.veh){
    g.font = "900 13px Arial Black"; g.textAlign = "center"; g.fillStyle = "#ffd27c";
    g.fillText("🚗 " + VEHDEF[P.veh.t].name + "  ·  " + Math.round(Math.abs(P.veh.spd)) + " units/s", W / 2, H - 150);
    g.font = "700 10px Verdana"; g.fillStyle = "#8a97a8";
    g.fillText("W/S throttle · A/D steer · E to step out — engines are a siren you sit inside", W / 2, H - 134);
    g.textAlign = "left";
  }
  if (P.stashed){
    g.fillStyle = "rgba(2,5,9,0.72)"; g.fillRect(0, 0, W, H);
    g.font = "900 20px Arial Black"; g.textAlign = "center"; g.fillStyle = "#8fc7ff";
    g.fillText("HIDDEN", W / 2, H / 2 - 10);
    g.font = "700 12px Verdana"; g.fillStyle = "#9db4cc";
    g.fillText("heat is cooling three times faster in here · E to climb out", W / 2, H / 2 + 16);
    g.textAlign = "left";
  }
  /* loot tally */
  if (LV.stats.loot){
    g.font = "900 11px Arial Black"; g.fillStyle = "#ffd27c";
    g.fillText("💰 " + LV.stats.loot.toLocaleString(), W - 214, 200);
  }
}
