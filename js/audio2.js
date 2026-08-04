/* KJP — ITERATION 2: AUDIO DEPTH.
   Stealth is an audio genre. Three things were missing: the room (every theme
   now has an ambient bed you stop noticing and miss instantly when it cuts),
   distance (a shot across the atrium should not be as loud as one at your ear),
   and punctuation (spotted/lost/alarm stingers that tell you the state changed
   before the HUD does).
   Everything routes through master buses so the OPTIONS toggles are real. */
"use strict";

let BUS = { master: null, sfx: null, music: null, amb: null };
let AMB = { nodes: [], theme: null };

function audioBuses(){
  if (BUS.master) return BUS;
  const c = ac();
  BUS.master = c.createGain(); BUS.master.gain.value = 0.9; BUS.master.connect(c.destination);
  BUS.sfx = c.createGain(); BUS.sfx.connect(BUS.master);
  BUS.music = c.createGain(); BUS.music.connect(BUS.master);
  BUS.amb = c.createGain(); BUS.amb.gain.value = 0.5; BUS.amb.connect(BUS.master);
  return BUS;
}
function applyAudioOpts(){
  if (!BUS.master) return;
  const now = AC ? AC.currentTime : 0;
  BUS.sfx.gain.setTargetAtTime(OPT.sfx ? 1 : 0, now, 0.05);
  BUS.music.gain.setTargetAtTime(OPT.music ? 1 : 0, now, 0.08);
  BUS.amb.gain.setTargetAtTime(OPT.sfx ? 0.5 : 0, now, 0.08);
}

/* ---- ambient bed: per-theme room tone, built from filtered noise + drones ---- */
function ambStop(){
  for (const n of AMB.nodes){ try{ n.stop ? n.stop() : n.disconnect(); }catch(e){} }
  AMB.nodes = []; AMB.theme = null;
}
function ambStart(theme){
  if (!AC || AMB.theme === theme) return;
  ambStop();
  audioBuses();
  const c = AC, out = BUS.amb;
  const beds = {
    yard:    { noise: 900,  nvol: 0.16, drone: 44,  dvol: 0.05, tick: 0 },
    lobby:   { noise: 420,  nvol: 0.08, drone: 58,  dvol: 0.06, tick: 0 },
    office:  { noise: 640,  nvol: 0.10, drone: 120, dvol: 0.035, tick: 0.5 },  // fluorescent hum
    archive: { noise: 300,  nvol: 0.07, drone: 41,  dvol: 0.06, tick: 0 },
    vault:   { noise: 1500, nvol: 0.09, drone: 76,  dvol: 0.05, tick: 0.22 },  // server fans
    roof:    { noise: 1400, nvol: 0.20, drone: 36,  dvol: 0.05, tick: 0 }      // wind
  };
  const b = beds[theme] || beds.lobby;
  /* looping noise bed */
  const len = c.sampleRate * 3;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - Math.abs(i / len - 0.5) * 0.2);
  const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = b.noise;
  const gn = c.createGain(); gn.gain.value = 0;
  gn.gain.setTargetAtTime(b.nvol, c.currentTime, 1.2);      // fade the room in
  src.connect(f).connect(gn).connect(out); src.start();
  AMB.nodes.push(src, gn);
  /* drone */
  const o = c.createOscillator(); o.type = "sine"; o.frequency.value = b.drone;
  const og = c.createGain(); og.gain.value = 0;
  og.gain.setTargetAtTime(b.dvol, c.currentTime, 1.6);
  const lfo = c.createOscillator(); lfo.frequency.value = 0.08;
  const lg = c.createGain(); lg.gain.value = b.drone * 0.01;
  lfo.connect(lg).connect(o.frequency); lfo.start();
  o.connect(og).connect(out); o.start();
  AMB.nodes.push(o, og, lfo);
  AMB.theme = theme;
}

/* ---- distance-aware one-shots: the world stops being mixed at your ear ---- */
function atten(x, y){
  if (!P) return 1;
  const d = dist(P.x, P.y, x, y);
  if (d < 90) return 1;
  return Math.max(0, 1 - (d - 90) / 900);
}
function sfxAt(x, y, fn, floor){
  const a = atten(x, y);
  if (a <= (floor == null ? 0.04 : floor)) return;          // truly out of earshot
  const bak = BUS.sfx ? BUS.sfx.gain.value : 1;
  if (BUS.sfx){ BUS.sfx.gain.value = bak * a; setTimeout(() => { if (BUS.sfx) BUS.sfx.gain.value = bak; }, 30); }
  fn();
}

/* ---- surfaces: the floor you are on is information ---- */
function surfaceOf(x, y){
  const th = LV && LV.def ? LV.def.theme : "lobby";
  const t = tileAt(Math.floor(x / T), Math.floor(y / T));
  if (t === "V") return "vent";
  if (th === "yard") return "grass";
  if (th === "lobby") return "marble";
  if (th === "office") return "carpet";
  if (th === "archive") return "wood";
  if (th === "vault") return "deck";
  return "slab";
}
const STEP_SURF = {
  grass:  { lp: 520,  vol: 0.020 },
  marble: { lp: 3400, vol: 0.042 },   // the loudest floor in the game, on purpose
  carpet: { lp: 380,  vol: 0.013 },   // analytics is where you get away with murder
  wood:   { lp: 1500, vol: 0.030 },
  deck:   { lp: 2600, vol: 0.038 },
  slab:   { lp: 1800, vol: 0.030 },
  vent:   { lp: 2200, vol: 0.034 }    // ducts boom — that's the trade for the shortcut
};
/* how much a surface multiplies the NOISE EVENT, not just the sample */
const SURF_NOISE = { grass: 0.7, marble: 1.35, carpet: 0.55, wood: 1, deck: 1.15, slab: 1, vent: 1.2 };
function stepSound(run, sneak){
  const s = STEP_SURF[surfaceOf(P.x, P.y)] || STEP_SURF.slab;
  const v = s.vol * (run ? 2.1 : sneak ? 0.45 : 1);
  hiss(run ? 0.06 : 0.045, v, s.lp);
  if (run) tone(70 + Math.random() * 20, 0.05, "sine", v * 0.5, -20);
}

/* ---- stingers: state changes you hear before you read ---- */
const STING = {
  spotted(){ const t = ac().currentTime;
    tone(980, 0.10, "square", 0.22, 0, t); tone(1240, 0.17, "square", 0.2, 0, t + 0.08);
    tone(620, 0.5, "sawtooth", 0.10, -180, t + 0.16); },
  lost(){ const t = ac().currentTime;                       // they gave up — relief, two notes down
    tone(660, 0.16, "sine", 0.11, 0, t); tone(494, 0.36, "sine", 0.10, 0, t + 0.14); },
  clear(){ const t = ac().currentTime;                      // site back to normal
    [523, 659, 784].forEach((f, i) => tone(f, 0.2, "sine", 0.07, 0, t + i * 0.09)); },
  alarm(){ const t = ac().currentTime;
    for (let i = 0; i < 3; i++) tone(760, 0.22, "square", 0.13, -200, t + i * 0.26); },
  qrf(){ const t = ac().currentTime;                        // the doors open
    tone(58, 0.7, "sawtooth", 0.26, -14, t); hiss(0.5, 0.14, 500, t);
    tone(880, 0.14, "square", 0.10, -320, t + 0.1); },
  objective(){ const t = ac().currentTime;
    [784, 1046, 1318].forEach((f, i) => tone(f, 0.16, "sine", 0.09, 0, t + i * 0.07)); },
  fail(){ const t = ac().currentTime;
    [392, 330, 262, 196].forEach((f, i) => tone(f, 0.5, "sawtooth", 0.13, -20, t + i * 0.16)); }
};
