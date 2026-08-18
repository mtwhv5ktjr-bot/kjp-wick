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
  /* v2.0.42 THE ROOM. Every sound was dry — a gunshot in a marble atrium
     sounded like a gunshot in a closet. A convolution reverb built from a
     procedurally generated impulse (exponentially decaying noise, low-passed
     over time — the shape of a real room's tail), sized per district in
     ambStart: long and bright for marble and the vault, short and dead for
     carpet offices, none outdoors. The SFX bus SENDS to it, so every existing
     sound gains the room for free. This is the single biggest jump from
     "sounds" to "a place". */
  BUS.verb = c.createConvolver();
  BUS.verbSend = c.createGain(); BUS.verbSend.gain.value = 0.0;
  BUS.sfx.connect(BUS.verbSend); BUS.verbSend.connect(BUS.verb); BUS.verb.connect(BUS.master);
  /* v2.0.43 THE COMPRESSOR ON MASTER. Sixteen guards firing at once used to
     clip into a wall of static; the mix now has a ceiling that ducks the
     quiet things under the loud ones instead of distorting everything. */
  BUS.comp = c.createDynamicsCompressor();
  BUS.comp.threshold.value = -18; BUS.comp.knee.value = 12; BUS.comp.ratio.value = 4;
  BUS.comp.attack.value = 0.004; BUS.comp.release.value = 0.18;
  BUS.master.disconnect(); BUS.master.connect(BUS.comp); BUS.comp.connect(c.destination);
  return BUS;
}
/* build an impulse response: `sec` long, `bright` = how much high end survives */
function _impulse(sec, bright){
  const c = ac(), len = Math.max(1, Math.floor(c.sampleRate * sec)), buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++){
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++){
      const t = i / len, env2 = Math.pow(1 - t, 2.4);
      const n = (Math.random() * 2 - 1);
      /* one-pole low-pass that darkens as the tail runs — the way air eats treble */
      const k = bright * (1 - t * 0.7);
      lp += (n - lp) * (0.15 + k * 0.6);
      d[i] = lp * env2;
    }
  }
  return buf;
}
function roomFor(theme){
  const R = { yard: null, roof: null, lobby: [1.6, 0.9], vault: [2.2, 0.75], office: [0.5, 0.35], archive: [0.9, 0.5] };
  return R[theme] === undefined ? [0.7, 0.5] : R[theme];
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
  /* v2.0.42 — size the room to the district */
  try {
    const rm = roomFor(theme);
    if (rm){ BUS.verb.buffer = _impulse(rm[0], rm[1]); BUS.verbSend.gain.setTargetAtTime(0.28, c.currentTime, 0.1); }
    else BUS.verbSend.gain.setTargetAtTime(0.0, c.currentTime, 0.1);
  } catch(e){}
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

/* ---- GUARD VOX: walkie-talkie babble ----------------------------------
   Silent enemies are the loudest "browser game" tell. This is not speech —
   it is per-syllable sawtooth babble pushed through a radio chain (tight
   bandpass, soft clip, squelch clicks), which is exactly how MGS1 sold
   sentient guards on a PS1: the TEXTURE of a voice, with subtitles doing
   the words. Every guard gets a pitch from his own seed so the same man
   sounds like the same man; the Director sits lower and slower than anyone.

   ONE active bark, priority-gated. Radio chatter that overlaps reads as a
   bug; a net where one voice waits for another reads as discipline. */
let VOX = { chain: null, busyUntil: 0, lastPrio: 0 };
function _voxChain(){
  if (VOX.chain) return VOX.chain;
  const c = ac();
  const inG = c.createGain(); inG.gain.value = 1;
  const bp1 = c.createBiquadFilter(); bp1.type = "highpass"; bp1.frequency.value = 350;
  const bp2 = c.createBiquadFilter(); bp2.type = "lowpass"; bp2.frequency.value = 2700;
  const shaper = c.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++){ const x = i / 128 - 1; curve[i] = Math.tanh(2.6 * x); }
  shaper.curve = curve;
  const outG = c.createGain(); outG.gain.value = 0.9;
  inG.connect(bp1); bp1.connect(bp2); bp2.connect(shaper); shaper.connect(outG);
  outG.connect(BUS.sfx || c.destination);
  VOX.chain = { inG, outG };
  return VOX.chain;
}
function _squelch(t){
  const c = ac(), ch = _voxChain();
  const n = c.createBufferSource(), len = 0.012 * c.sampleRate | 0;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  n.buffer = buf;
  const g2 = c.createGain(); g2.gain.value = 0.5;
  n.connect(g2); g2.connect(ch.inG);
  n.start(t);
}
/* text, world position (for distance), seed (per-guard identity), prio 1-3 */
function vox(text, x, y, seed, prio){
  try {
    const c = ac(), now = c.currentTime;
    if (now < VOX.busyUntil && (prio || 1) <= VOX.lastPrio) return false;
    /* v2.0.51 SIDECHAIN DUCK. Music and ambience dip 40% for the length of the
       bark and swell back — the mixing move every game with dialogue makes,
       so a line lands even over the combat layer, and the swell-back is
       itself a small dramatic beat. */
    if (BUS.music && BUS.amb){
      const dur = 0.35 + String(text || "").length * 0.045;
      const mBase = OPT.music ? 1 : 0, aBase = OPT.sfx ? 0.5 : 0;
      BUS.music.gain.cancelScheduledValues(now); BUS.amb.gain.cancelScheduledValues(now);
      BUS.music.gain.setTargetAtTime(mBase * 0.6, now, 0.04); BUS.amb.gain.setTargetAtTime(aBase * 0.6, now, 0.04);
      BUS.music.gain.setTargetAtTime(mBase, now + dur, 0.25);  BUS.amb.gain.setTargetAtTime(aBase, now + dur, 0.25);
    }
    const ch = _voxChain();
    /* distance attenuation — a bark across the floor is a whisper */
    const d = (typeof P !== "undefined" && P) ? dist(P.x, P.y, x, y) : 0;
    const att = Math.max(0.12, Math.min(1, 1 - d / 950));
    /* syllables from the text itself: vowel groups, clamped 3..9 */
    const syl = Math.max(3, Math.min(9, (String(text).match(/[aeiouy]+/gi) || []).length));
    const base = 85 + ((seed || 0) * 2654435761 % 1000) / 1000 * 55;
    const rnd = (i, k) => (((seed || 1) * 37 + i * 101 + k * 13) * 2654435761 % 1000) / 1000;
    _squelch(now);
    let t = now + 0.03;
    for (let i = 0; i < syl; i++){
      const o = c.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(base * (0.9 + rnd(i, 1) * 0.35), t);
      o.frequency.exponentialRampToValueAtTime(base * (0.8 + rnd(i, 2) * 0.3), t + 0.08);
      /* two vowel formants, randomized per syllable — dark and garbled on
         purpose: the closer procedural babble gets to real phonemes, the
         more it reads as clown noise */
      const f1 = c.createBiquadFilter(); f1.type = "bandpass";
      f1.frequency.value = 300 + rnd(i, 3) * 500; f1.Q.value = 5;
      const f2 = c.createBiquadFilter(); f2.type = "bandpass";
      f2.frequency.value = 900 + rnd(i, 4) * 1300; f2.Q.value = 7;
      const g2 = c.createGain();
      const dur = 0.055 + rnd(i, 5) * 0.055;
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(0.5 * att, t + 0.012);
      g2.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(f1); o.connect(f2); f1.connect(g2); f2.connect(g2); g2.connect(ch.inG);
      o.start(t); o.stop(t + dur + 0.02);
      t += dur + 0.015 + rnd(i, 6) * 0.03;                 // inter-syllable gap
    }
    _squelch(t + 0.01);
    VOX.busyUntil = t + 0.12;
    VOX.lastPrio = prio || 1;
    return true;
  } catch(e){ return false; }
}
