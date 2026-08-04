/* KJP core — canvas/input/audio/save/util + SKIN & WEAPON component registries.
   No modules, no build: files share the window scope, load order in index.html. */
"use strict";

/* ---------- canvas ---------- */
const cv = document.getElementById("cv"), g = cv.getContext("2d");
const W = 1280, H = 720;
let VIEW_SCALE = 1;
function fitCanvas(){
  const vw = innerWidth, vh = (window.visualViewport ? visualViewport.height : innerHeight);
  VIEW_SCALE = Math.min(vw / W, vh / H);
  cv.style.width = Math.round(W * VIEW_SCALE) + "px";
  cv.style.height = Math.round(H * VIEW_SCALE) + "px";
}
addEventListener("resize", fitCanvas);
if (window.visualViewport) visualViewport.addEventListener("resize", fitCanvas);
fitCanvas();

/* ---------- utils ---------- */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const angTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
/* smallest signed difference between two angles — the AI lives on this */
function angDiff(a, b){ let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
let _seed = 1234567;
function srand(s){ _seed = s >>> 0 || 1; }
function rnd(){ _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }  // deterministic (bot/QA replays)
const rr = (a, b) => a + rnd() * (b - a);

/* ---------- input ---------- */
const KEYS = new Set(), PRESS = new Set();
const MOUSE = { x: W / 2, y: H / 2, down: false, pressed: false, moved: 0 };
const IS_TOUCH = matchMedia("(pointer:coarse)").matches;
function cvPos(e){
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / VIEW_SCALE, y: (e.clientY - r.top) / VIEW_SCALE };
}
addEventListener("keydown", e => {
  if (["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Tab"].includes(e.code)) e.preventDefault();
  if (!KEYS.has(e.code)) PRESS.add(e.code);
  KEYS.add(e.code);
});
addEventListener("keyup", e => KEYS.delete(e.code));
addEventListener("blur", () => KEYS.clear());
cv.addEventListener("mousemove", e => { const p = cvPos(e); MOUSE.moved += Math.abs(p.x - MOUSE.x) + Math.abs(p.y - MOUSE.y); MOUSE.x = p.x; MOUSE.y = p.y; });
cv.addEventListener("mousedown", e => { const p = cvPos(e); MOUSE.x = p.x; MOUSE.y = p.y; if (e.button === 0){ MOUSE.down = true; MOUSE.pressed = true; } });
addEventListener("mouseup", e => { if (e.button === 0) MOUSE.down = false; });
cv.addEventListener("contextmenu", e => e.preventDefault());
let WHEEL = 0;
cv.addEventListener("wheel", e => { WHEEL += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

/* touch: left half = floating move stick, right half = aim drag, plus round buttons.
   Multi-touch by pointerId — any finger may lift without killing the others
   (the single-touch trap already bit games.wick.pics once; never again). */
const TOUCH = {
  stick: null,            // {id, ox, oy, dx, dy}  ox/oy = where the finger landed
  aim: null,              // {id, x, y}            current aim finger position
  fire: false, act: false, knock: false, run: false, wpn: false, sneakTgl: false,
  btns: []                // filled per-frame by layout(): {id,label,x,y,r,on}
};
const BTN_DEFS = [
  { k: "fire",  label: "FIRE",  x: W - 88,  y: H - 88,  r: 52 },
  { k: "act",   label: "ACT",   x: W - 196, y: H - 148, r: 40 },
  { k: "knock", label: "KNOCK", x: W - 88,  y: H - 208, r: 34 },
  { k: "run",   label: "RUN",   x: W - 286, y: H - 66,  r: 36 },
  { k: "sneak", label: "SNEAK", x: W - 190, y: H - 52,  r: 34 },
  { k: "wpn",   label: "WPN",   x: W - 60,  y: H - 300, r: 28 }
];
const touchPts = new Map();
function touchBtnAt(x, y){
  for (const b of BTN_DEFS) if (dist(x, y, b.x, b.y) < b.r + 12) return b.k;
  return null;
}
cv.addEventListener("pointerdown", e => {
  if (e.pointerType === "mouse") return;
  e.preventDefault();
  const p = cvPos(e);
  touchPts.set(e.pointerId, p);
  const b = touchBtnAt(p.x, p.y);
  if (b){
    if (b === "sneak") TOUCH.sneakTgl = !TOUCH.sneakTgl;
    else TOUCH[b === "fire" ? "fire" : b === "act" ? "act" : b === "knock" ? "knock" : b === "run" ? "run" : "wpn"] = true;
    if (b === "act") PRESS.add("KeyE");
    if (b === "knock") PRESS.add("KeyF");
    if (b === "wpn") PRESS.add("KeyQ");
    touchPts.get(e.pointerId).btn = b;
    return;
  }
  if (p.x < W * 0.44 && !TOUCH.stick) TOUCH.stick = { id: e.pointerId, ox: p.x, oy: p.y, dx: 0, dy: 0 };
  else if (!TOUCH.aim) TOUCH.aim = { id: e.pointerId, x: p.x, y: p.y, sx: p.x, sy: p.y };
  MOUSE.pressed = true; MOUSE.x = p.x; MOUSE.y = p.y;   // menus reuse the mouse path
}, { passive: false });
cv.addEventListener("pointermove", e => {
  if (e.pointerType === "mouse") return;
  const p = cvPos(e);
  const t = touchPts.get(e.pointerId); if (t){ t.x = p.x; t.y = p.y; }
  if (TOUCH.stick && TOUCH.stick.id === e.pointerId){
    let dx = p.x - TOUCH.stick.ox, dy = p.y - TOUCH.stick.oy;
    const m = Math.hypot(dx, dy), MAX = 74;
    if (m > MAX){ dx *= MAX / m; dy *= MAX / m; }
    TOUCH.stick.dx = dx / 74; TOUCH.stick.dy = dy / 74;
  }
  if (TOUCH.aim && TOUCH.aim.id === e.pointerId){ TOUCH.aim.x = p.x; TOUCH.aim.y = p.y; }
}, { passive: false });
function touchEnd(e){
  if (e.pointerType === "mouse") return;
  const t = touchPts.get(e.pointerId);
  if (t && t.btn && t.btn !== "sneak") TOUCH[t.btn === "fire" ? "fire" : t.btn === "act" ? "act" : t.btn === "knock" ? "knock" : t.btn === "run" ? "run" : "wpn"] = false;
  if (TOUCH.stick && TOUCH.stick.id === e.pointerId) TOUCH.stick = null;
  if (TOUCH.aim && TOUCH.aim.id === e.pointerId) TOUCH.aim = null;
  touchPts.delete(e.pointerId);
}
cv.addEventListener("pointerup", touchEnd);
cv.addEventListener("pointercancel", touchEnd);
function inputEndFrame(){ PRESS.clear(); MOUSE.pressed = false; WHEEL = 0; }

/* ---------- audio: tiny procedural synth (house style — zero assets) ---------- */
let AC = null, MUSIC = { mode: "off", want: "calm", timer: null, gain: { calm: null, caution: null, combat: null }, step: 0, next: 0 };
function ac(){
  if (!AC){ AC = new (window.AudioContext || window.webkitAudioContext)(); }
  if (AC.state === "suspended") AC.resume();
  return AC;
}
function env(gn, t0, a, d, v){ gn.gain.setValueAtTime(0, t0); gn.gain.linearRampToValueAtTime(v, t0 + a); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
/* every one-shot lands on the SFX bus (see audio2.js) so a single gain node
   mutes the whole game — falls back to destination before the buses exist */
function sfxOut(c){ return (typeof BUS !== "undefined" && BUS.sfx) ? BUS.sfx : c.destination; }
function tone(f, dur, type, vol, slide, when){
  try{
    const c = ac(), t0 = (when || c.currentTime);
    const o = c.createOscillator(), gn = c.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, f + slide), t0 + dur);
    env(gn, t0, 0.004, dur, vol || 0.16);
    o.connect(gn).connect(sfxOut(c)); o.start(t0); o.stop(t0 + dur + 0.05);
  }catch(e){}
}
function hiss(dur, vol, lp, when){
  try{
    const c = ac(), t0 = (when || c.currentTime);
    const n = c.createBufferSource(), b = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    n.buffer = b;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp || 2400;
    const gn = c.createGain(); env(gn, t0, 0.003, dur, vol || 0.12);
    n.connect(f).connect(gn).connect(sfxOut(c)); n.start(t0);
  }catch(e){}
}
const SFX = {
  /* surface-aware once audio2 is loaded; the flat hiss is the fallback */
  step(run, sneak){ if (typeof stepSound === "function" && LV) stepSound(run, sneak); else hiss(0.045, run ? 0.045 : 0.022, 700); },
  knock(){ tone(190, 0.09, "square", 0.1); tone(150, 0.1, "square", 0.08); },
  dart(){ hiss(0.08, 0.1, 3600); tone(1300, 0.05, "sine", 0.04, -700); },
  silenced(){ hiss(0.07, 0.16, 2200); tone(240, 0.05, "triangle", 0.08, -120); },
  shot(){ hiss(0.14, 0.34, 5200); tone(120, 0.12, "sawtooth", 0.2, -70); },
  shotgun(){ hiss(0.22, 0.4, 3600); tone(90, 0.18, "sawtooth", 0.26, -40); },
  dry(){ tone(700, 0.03, "square", 0.05); },
  reload(){ tone(500, 0.04, "square", 0.06); setTimeout(() => tone(760, 0.04, "square", 0.06), 110); },
  hit(){ tone(220, 0.07, "square", 0.12, -80); },
  hurt(){ tone(140, 0.2, "sawtooth", 0.2, -60); hiss(0.1, 0.1, 900); },
  thud(){ tone(70, 0.14, "sine", 0.24, -30); hiss(0.06, 0.06, 400); },
  choke(){ hiss(0.3, 0.05, 900); },
  zz(){ tone(880, 0.07, "sine", 0.04); },
  spot(){ tone(980, 0.1, "square", 0.22); tone(1240, 0.16, "square", 0.2, 0, ac().currentTime + 0.08); },   // "!" — original 2-note stab
  susp(){ tone(620, 0.12, "sine", 0.12, 60); },
  alarm(){ tone(720, 0.3, "square", 0.1, -180); },
  card(){ tone(1180, 0.06, "sine", 0.1); tone(1560, 0.09, "sine", 0.1, 0, ac().currentTime + 0.07); },
  intel(){ tone(920, 0.06, "sine", 0.08); tone(1380, 0.1, "sine", 0.08, 0, ac().currentTime + 0.06); },
  hackTick(){ tone(1520, 0.02, "square", 0.03); },
  unlock(){ [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, "sine", 0.1, 0, ac().currentTime + i * 0.07)); },
  codec(){ tone(1660, 0.05, "sine", 0.07); tone(1660, 0.05, "sine", 0.07, 0, ac().currentTime + 0.1); },
  type(){ tone(1900 + Math.random() * 400, 0.012, "square", 0.02); },
  glass(){ hiss(0.16, 0.22, 6000); tone(2400, 0.1, "triangle", 0.08, -900); },
  breach(){ hiss(0.25, 0.4, 3000); tone(60, 0.25, "sawtooth", 0.3, -20); },
  stamp(){ tone(90, 0.16, "sawtooth", 0.3, -30); hiss(0.1, 0.2, 1200); },
  heli(){ /* looped in music layer during exfil */ },
  ui(){ tone(840, 0.04, "sine", 0.06); },
  ui2(){ tone(620, 0.05, "sine", 0.06); }
};

/* music: three tension layers crossfaded by global alert state.
   One 8th-note scheduler, patterns per mode — cheap, no samples. */
function musicInit(){
  if (MUSIC.mode !== "off") return;
  const c = ac();
  const out = (typeof audioBuses === "function") ? audioBuses().music : c.destination;
  for (const k of ["calm", "caution", "combat"]){
    const gn = c.createGain(); gn.gain.value = k === "calm" ? 0.5 : 0; gn.connect(out); MUSIC.gain[k] = gn;
  }
  if (typeof applyAudioOpts === "function") applyAudioOpts();
  MUSIC.mode = "on"; MUSIC.next = c.currentTime + 0.05; MUSIC.step = 0;
  MUSIC.timer = setInterval(musicTick, 40);
}
function musicStop(){ if (MUSIC.timer) clearInterval(MUSIC.timer); MUSIC.timer = null; MUSIC.mode = "off";
  for (const k in MUSIC.gain) if (MUSIC.gain[k]){ try{ MUSIC.gain[k].disconnect(); }catch(e){} MUSIC.gain[k] = null; } }
function mtone(dst, f, dur, type, vol, when){
  const c = AC, o = c.createOscillator(), gn = c.createGain();
  o.type = type; o.frequency.value = f; env(gn, when, 0.01, dur, vol);
  o.connect(gn).connect(dst); o.start(when); o.stop(when + dur + 0.05);
}
function musicTick(){
  if (!AC || MUSIC.mode === "off") return;
  const c = AC, SPB = 60 / 108 / 2;              // 108bpm 8ths
  while (MUSIC.next < c.currentTime + 0.12){
    const s = MUSIC.step % 16, t = MUSIC.next;
    const gC = MUSIC.gain.calm, gU = MUSIC.gain.caution, gB = MUSIC.gain.combat;
    // calm: sparse dark fifth drone
    if (s === 0) mtone(gC, 55, 1.6, "sine", 0.5, t);
    if (s === 8) mtone(gC, 82.4, 1.2, "sine", 0.3, t);
    if (s === 14 && (MUSIC.step & 31) === 14) mtone(gC, 660, 0.3, "sine", 0.05, t);
    // caution: pulsing minor bass + hat
    if (s % 4 === 0) mtone(gU, 65.4, 0.22, "triangle", 0.5, t);
    if (s % 4 === 2) mtone(gU, 61.7, 0.18, "triangle", 0.35, t);
    if (s % 2 === 1){ const n = c.createBufferSource(), b = c.createBuffer(1, 800, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < 800; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / 800);
      n.buffer = b; const f2 = c.createBiquadFilter(); f2.type = "highpass"; f2.frequency.value = 6000;
      const gn = c.createGain(); gn.gain.value = 0.05; n.connect(f2).connect(gn).connect(gU); n.start(t); }
    // combat: driving kick/snare + stab
    if (s % 4 === 0) mtone(gB, 50, 0.16, "sine", 0.9, t);
    if (s === 4 || s === 12){ const n = c.createBufferSource(), b = c.createBuffer(1, 2400, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < 2400; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / 2400);
      n.buffer = b; const gn = c.createGain(); gn.gain.value = 0.16; n.connect(gn).connect(gB); n.start(t); }
    if (s === 0 || s === 6) mtone(gB, 110, 0.14, "sawtooth", 0.16, t);
    if (s === 10) mtone(gB, 103.8, 0.14, "sawtooth", 0.14, t);
    MUSIC.next += SPB; MUSIC.step++;
  }
  // crossfade toward wanted mode
  const want = MUSIC.want;
  for (const k of ["calm", "caution", "combat"]){
    const gn = MUSIC.gain[k]; if (!gn) continue;
    const target = (k === want) ? (k === "calm" ? 0.5 : k === "caution" ? 0.55 : 0.6) : 0;
    gn.gain.value += (target - gn.gain.value) * 0.06;
  }
}
function musicWant(m){ MUSIC.want = m; }

/* ---------- save ---------- */
let PROG = { lv: {}, skin: "midnight", carry: [], name: "", tutorial: false };
try{ const p = JSON.parse(localStorage.getItem("kjp_prog") || "null"); if (p && typeof p === "object"){ PROG = Object.assign(PROG, p); PROG.lv = PROG.lv || {}; } }catch(e){}
function saveProg(){ try{ localStorage.setItem("kjp_prog", JSON.stringify(PROG)); }catch(e){} }
function lvBest(n){ return PROG.lv[n] || null; }
function clearedCount(){ let c = 0; for (let i = 1; i <= 6; i++) if (PROG.lv[i]) c++; return c; }
function campaignScore(){ let s = 0; for (let i = 1; i <= 6; i++) if (PROG.lv[i]) s += PROG.lv[i].score; return s; }

/* ================================================================
   SKIN COMPONENT — every skin is procedural top-down paint + a perk.
   HARD INVARIANT: hands/fists render GREEN in every skin (he's a frog).
   ================================================================ */
const SKINS = {
  midnight: { name: "MIDNIGHT SUIT", how: "default",
    suit: "#181b22", trim: "#2a2f3a", shirt: "#0c0e13", tie: "#3a414f",
    perk: "standard issue", unlocked: () => true },
  tux: { name: "THE TUX", how: "clear THE LOBBY",
    suit: "#0b0b0e", trim: "#e8e8f0", shirt: "#f2f2f6", tie: "#111",
    perk: "faster choke (-20%)", chokeMul: 0.8,
    unlocked: () => !!PROG.lv[2] },
  concierge: { name: "CONCIERGE", how: "clear THE ARCHIVES",
    suit: "#4a0d16", trim: "#caa64b", shirt: "#2b0a0f", tie: "#caa64b",
    perk: "guards radio 25% slower", radioMul: 1.25,
    unlocked: () => !!PROG.lv[4] },
  ghillie: { name: "SWAMP GHILLIE", how: "earn any GHOST rank",
    suit: "#2c3a1e", trim: "#4a5f2e", shirt: "#22301a", tie: "#3c5226",
    perk: "-12% guard sight range", detectMul: 0.88,
    unlocked: () => Object.values(PROG.lv).some(r => r && r.ghost) },
  hightable: { name: "HIGH TABLE", how: "clear the campaign",
    suit: "#241736", trim: "#8b5cf6", shirt: "#160d22", tie: "#8b5cf6",
    perk: "+4 dart capacity", dartBonus: 4,
    unlocked: () => clearedCount() >= 6 },
  excomm: { name: "EXCOMMUNICADO", how: "GHOST every mission",
    suit: "#0e0e10", trim: "#ffd700", shirt: "#0a0a0c", tie: "#ffd700",
    perk: "all of the above, quietly", chokeMul: 0.8, radioMul: 1.25, detectMul: 0.9, dartBonus: 4,
    unlocked: () => { for (let i = 1; i <= 6; i++){ const r = PROG.lv[i]; if (!r || !r.ghost) return false; } return true; } },
  holo: { name: "HOLO OPERATIVE", how: "hold a WICK ARSENAL holo 1/1",
    suit: "#1a1508", trim: "#ffd700", shirt: "#231c09", tie: "#ffe98a", shimmer: true,
    perk: "gold shimmer — pure drip",
    unlocked: () => (window.ownedGunTypes || []).some(t => t >= 11) }
};
function skinDef(){ const s = SKINS[PROG.skin]; return (s && s.unlocked()) ? s : SKINS.midnight; }
/* a skin whose gate no longer passes comes straight off (pepe-zero lesson) */
function reconcileSkin(){ if (!SKINS[PROG.skin] || !SKINS[PROG.skin].unlocked()){ PROG.skin = "midnight"; saveProg(); } }

/* ================================================================
   WEAPON COMPONENT — one registry; NFT guns are stealth-tuned ports of
   the WICK ARSENAL types (1-6). noise = radius of the sound event a shot
   makes; silenced guns whisper, agency iron wakes the building.
   ================================================================ */
const WEAPONS = {
  fists: { name: "HANDS OF COUNSEL", melee: true, noise: 70, icon: "✊" },
  tranq: { name: "HUSH-9 TRANQ", dart: true, sleep: 45, dmg: 0, mag: 12, rps: 1.7, spd: 860, noise: 16, silenced: true, icon: "🎯" },
  p9:    { name: "AGENCY 9MM", dmg: 1.0, mag: 12, rps: 3.2, spd: 1050, noise: 330, spread: 0.03, icon: "🔫", pickup: true },
  smg:   { name: "RATTLER SMG", dmg: 0.6, mag: 25, rps: 9, spd: 980, noise: 340, spread: 0.07, auto: true, icon: "🔫", pickup: true },
  /* NFT lethals ship LOUD — the SUPPRESSOR is a separate mod drop whose mint
     does a buy & burn on KJP. Darts (HUSH-9 / REAPER) are pneumatic: quiet by
     nature, not by attachment — stealth always has a baseline tool. */
  n1: { name: "BOOGEYMAN P30", nft: 1, dmg: 1.5, mag: 15, rps: 3.6, spd: 1150, noise: 280, spread: 0.012, icon: "🔫",
        blurb: "the classic" },
  n2: { name: "CONTINENTAL VECTOR", nft: 2, dmg: 0.55, mag: 30, rps: 11, spd: 1000, noise: 300, spread: 0.05, auto: true, icon: "🔫",
        blurb: "full-auto PDW" },
  n3: { name: "KIMBER BREACHER", nft: 3, dmg: 0.8, pellets: 6, mag: 6, rps: 1.3, spd: 900, noise: 380, spread: 0.1, breach: true, icon: "🔫",
        blurb: "12ga door-opener" },
  n4: { name: "TTI MARKSMAN", nft: 4, dmg: 3, mag: 8, rps: 1.1, spd: 1700, noise: 290, spread: 0.002, pierce: 2, scope: true, icon: "🔫",
        blurb: "long-range DMR" },
  n5: { name: "EXCOMMUNICADO", nft: 5, dmg: 0.8, mag: 24, rps: 8, spd: 1150, noise: 330, spread: 0.02, auto: true, icon: "🔫",
        blurb: "loud. decisive." },
  n6: { name: "TANGENTIAL REAPER", nft: 6, dart: true, sleep: 45, fan: 3, mag: 9, rps: 1.5, spd: 920, noise: 18, icon: "🎯",
        blurb: "the ghost cannon" }
};
/* arsenal type -> weapon id (holo 11-16 grant the matching base type too) */
function nftWeaponIds(types){
  const ids = new Set();
  for (const t of types || []){
    const base = t >= 11 ? t - 10 : t;             // holo 11-16 mirror types 1-6
    if (base >= 1 && base <= 6) ids.add("n" + base);
  }
  return [...ids];
}
function hasHolo(){ return (window.ownedGunTypes || []).some(t => t >= 11); }

/* WICK MODS — the attachment NFTs from mint.wick.pics, stealth-tuned. Every
   mod you hold auto-fits every carried ARSENAL gun (duplicates don't stack). */
const MODDEFS = {
  1: { name: "LASER SIGHT",     tag: "LASER",  apply: s => { s.spread *= 0.35; s.laser = 1; } },
  2: { name: "HOLLOW POINTS",   tag: "HP+",    apply: s => { s.dmg *= 1.15; } },
  3: { name: "HAIR TRIGGER",    tag: "RPS+",   apply: s => { s.rps *= 1.15; } },
  4: { name: "LONG BARREL",     tag: "BARREL", apply: s => { s.spd *= 1.3; s.dmg *= 1.05; s.noise *= 0.85; } },
  5: { name: "AP ROUNDS",       tag: "AP",     apply: s => { s.pierce = (s.pierce || 0) + 1; } },
  6: { name: "DRAGON'S BREATH", tag: "DRAGON", apply: s => { if (!s.dart) s.pellets = (s.pellets || 1) + 1; } },
};

/* ================================================================
   KJP GEAR — the 100-piece cross-game mint (KJPGear.sol). Field
   equipment, not attachments: it rides the OPERATIVE, so it works on
   every weapon including agency pickups, and every piece also works in
   PEPE WICK. Mint proceeds: 75% buy&burn KJP + 25% buy&burn WICK,
   automatic and withdraw-less. THE SUPPRESSOR LIVES HERE — no gun in
   the game ships silenced.
   ================================================================ */
const GEARDEFS = {
  1: { name: "SUPPRESSOR",     tag: "SUPP",  rare: "Common",    pool: 22,
       blurb: "silences every lethal gun you carry",
       gun: s => { s.silenced = true; s.noise = Math.min(s.noise, 85); } },
  2: { name: "KEVLAR WEAVE",   tag: "KEVLAR", rare: "Common",   pool: 20,
       blurb: "+1 ♥ and the first hit of each op is absorbed" },
  3: { name: "TACTICAL BOOTS", tag: "BOOTS", rare: "Uncommon",  pool: 16,
       blurb: "+8% movement, and running is 25% quieter" },
  4: { name: "EXTENDED MAGS",  tag: "MAGS",  rare: "Uncommon",  pool: 14,
       blurb: "+33% magazine on every firearm",
       gun: s => { if (s.mag) s.mag = Math.round(s.mag * 1.33); } },
  5: { name: "NIGHT OPTICS",   tag: "OPTICS", rare: "Rare",     pool: 12,
       blurb: "TAC-MAP never jams, even in COMBAT" },
  6: { name: "K9 TREATS",      tag: "K9",    rare: "Rare",      pool: 8,
       blurb: "guard dogs take twice as long to place your scent" },
  7: { name: "SKELETON KEY",   tag: "KEY",   rare: "Epic",      pool: 5,
       blurb: "opens ANY locked door — no keycard needed" },
  8: { name: "GOLD BRIEFCASE", tag: "GOLD",  rare: "Legendary", pool: 3,
       blurb: "×1.25 score, and every exhibit pays double" }
};
window.ownedGearTypes = [];
const hasGear = t => (window.ownedGearTypes || []).includes(t);
window.ownedModTypes = [];
let _specCache = {}, _specGen = -1;
function bumpMods(){ _specCache = {}; _specGen++; }
/* effective weapon spec:
     base + MODS (NFT guns only — agency iron takes no attachments)
          + GEAR (every firearm — it rides the operative, not the gun) */
function wSpec(id){
  const base = WEAPONS[id];
  if (!base || base.melee) return base;
  const key = id + ":" + (window.ownedModTypes || []).join(",") + "|" + (window.ownedGearTypes || []).join(",");
  if (_specCache[key]) return _specCache[key];
  const s = Object.assign({}, base);
  const seen = new Set();
  if (base.nft) for (const m of window.ownedModTypes || []){
    if (seen.has(m) || !MODDEFS[m]) continue;
    seen.add(m); MODDEFS[m].apply(s);
  }
  const gseen = new Set();
  for (const t of window.ownedGearTypes || []){
    if (gseen.has(t) || !GEARDEFS[t]) continue;
    gseen.add(t);
    if (GEARDEFS[t].gun) GEARDEFS[t].gun(s);
  }
  s.dmg = Math.round((s.dmg || 0) * 100) / 100;
  s.mods = [...seen];
  s.gear = [...gseen].filter(t => GEARDEFS[t].gun);
  return _specCache[key] = s;
}

/* score constants — campaign total must stay far below the shared board's
   300k ceiling for mode "kjp": 6 levels x ~20k max ≈ 120k. Headroom is safety. */
const SC = { clear: 4000, timeMax: 4000, ghost: 5000, pacifist: 2500, intel: 700, alarm: -800, kill: -150, civilian: -500,
  /* HARD PER-OP CEILING. The shared board rejects anything over 300,000 for
     mode "kjp", and the multipliers stack: GOLD BRIEFCASE (×1.25, doubled
     intel) on BABA YAGA (×1.6) pushed a perfect six-op campaign to ~320k —
     a flawless run would have been refused by the server. 45k × 6 = 270k
     leaves real headroom for anything added later. */
  opMax: 45000 };
function rankFor(r){
  if (r.ghost && r.pacifist) return "BABA YAGA";
  if (r.ghost) return "GHOST";
  if (!r.combat) return "SPECTRE";
  if (r.kills > 6) return "RAMBO";
  return "OPERATOR";
}
