/* KJP levels — 6 missions into the Agency. ASCII maps, entities in tile coords.
   LEGEND: # wall · . floor · (space) void · - low cover (blocks move; hides a
   SNEAKING player) · = glass (see-through, breakable, loud) · D auto door ·
   Y/B/R locked doors + y/b/r cards · C objective-gated door (opens when the
   level's hacks are done) · V vent (sneak-only, guards never path it, blocks
   sight) · M metal detector · L alarm panel (civilians run here) · t hack
   terminal · F objective file · i intel · a darts · m medkit · P spawn · X exit.
   Rows are padded to the longest; trailing space is void (solid). The ?qa=1
   solver (and tools/qa-node.mjs) proves every objective chain + exit reachable —
   trust IT, not your eyes, after editing a map. */
"use strict";

const LEVELS = [null, // 1-indexed
/* ============ 1 · THE FENCE — perimeter grounds, night rain ============ */
{
  name: "THE FENCE", sub: "LANGLEY PERIMETER · 02:10", theme: "yard", par: 150,
  rows: [
    "##############################################",
    "#.....................XX.....................#",
    "#####V####Y###===#########===#####D###########",
    "#....V.......................................#",
    "#....V.......................................#",
    "#....V....................................i..#",
    "#....V.......................................#",
    "#............................................#",
    "#.......#######...............#######........#",
    "#.......#.....#...............#.....#........#",
    "#.......#..i..=...............=.--..#........#",
    "#.......#.....#...............#..y..#........#",
    "#.......###D###...............###D###........#",
    "#............................................#",
    "#...------------..............------------...#",
    "#............................................#",
    "#.................#######....................#",
    "#.................#a.m.i#....................#",
    "#.................###D###....................#",
    "#............................................#",
    "#..........................................a.#",
    "#.....................P......................#",
    "#............................................#",
    "##############################################"
  ],
  guards: [
    { x: 10, y: 15, kind: "guard",   route: [[10,15],[10,5],[17,5],[17,15]] },
    { x: 31, y: 15, kind: "guard",   route: [[31,15],[31,13],[27,13],[27,15]] },
    { x: 20, y: 4,  kind: "guard",   route: [[20,4],[27,4]] },
    { x: 6,  y: 19, kind: "guard",   route: [[6,19],[15,19]] },
    { x: 39, y: 19, kind: "officer", route: [[39,19],[39,6]], card: "y" }
  ],
  dogs: [], civs: [], lasers: [],
  cams: [ { x: 33, y: 2, dir: 1.5708, arc: 0.7, sweep: 0.9 }, { x: 12, y: 2, dir: 1.5708, arc: 0.7, sweep: 0.9 } ],
  hacksNeed: 0, fileNeed: false, spawnPts: [[3,20],[22,21],[42,20]],
  objText: () => "Reach the SERVICE CORRIDOR. Yellow card, the east door… or the vent.",
  lore: [
    "EXHIBIT A — gate log: the same black SUV, every new moon, no plates, waved through.",
    "EXHIBIT B — invoice: 'landscaping', $40M a year. The hedges are LISTENING.",
    "EXHIBIT C — memo, 1974: 'the fence is not to keep them out. It is to keep it IN.'"
  ],
  brief: [
    { w: "op", t: "Counselor. Langley perimeter — two guard huts, cameras on both service doors." },
    { w: "kjp", t: "Twelve years I ran their errands. Tonight I audit the firm." },
    { w: "op", t: "Every floor of that building hides a different lie. Follow the paper all the way DOWN — it ends at something they buried in 2011. A wallet. And a woman." },
    { w: "op", t: "Hold C to sneak. F knocks — or flicks a coin where you aim. E chokes from behind. Twelve darts, counselor. Spend them like billable hours." },
    { w: "kjp", t: "Objection noted. Overruled. Going in." }
  ]
},
/* ============ 2 · THE LOBBY — marble, metal detectors, elevators ============ */
{
  name: "THE LOBBY", sub: "MAIN ATRIUM · 02:47", theme: "lobby", par: 190,
  rows: [
    "##############################################",
    "#..................#..XX..#..................#",
    "#..................#......#..................#",
    "#..................##.BB.##..................#",
    "#............................................#",
    "#..=====..=====..............................#",
    "#..=...=..=...=..................#######..V..#",
    "#..=.i.=..=.a.=..................#.....#..V..#",
    "#..=...=..=...=..................#..i..#..V..#",
    "#..=====..=====..................#.....D..V..#",
    "#................................#.....#..V..#",
    "#................................#######..V..#",
    "#..........................................V.#",
    "#############M######MM######M#############V###",
    "#.........................................V..#",
    "#............................................#",
    "#..............----------....................#",
    "#..............-........-....................#",
    "#..............-.b......-....................#",
    "#....L.........----..----.............L......#",
    "#............................................#",
    "#.....................P......................#",
    "#............................................#",
    "##############################################"
  ],
  guards: [
    { x: 22, y: 5,  kind: "sentry",  route: [[22,5],[22,11]] },
    { x: 4,  y: 11, kind: "guard",   route: [[4,11],[30,11]] },
    { x: 14, y: 15, kind: "guard",   route: [[14,15],[32,15]] },
    { x: 36, y: 20, kind: "officer", route: [[36,20],[36,15],[42,15],[42,20]], card: "b" },
    { x: 4,  y: 20, kind: "guard",   route: [[4,20],[4,15]] },
    { x: 40, y: 4,  kind: "guard",   route: [[40,4],[28,4]] }
  ],
  dogs: [],
  civs: [
    { x: 12, y: 20, route: [[12,20],[20,20],[20,19]] },
    { x: 30, y: 20, route: [[30,20],[26,21],[34,21]] },
    { x: 8,  y: 4,  route: [[8,4],[16,4],[16,2]] }
  ],
  lasers: [],
  cams: [ { x: 20, y: 3, dir: 1.5708, arc: 0.6, sweep: 0.7 }, { x: 24, y: 13, dir: -1.5708, arc: 0.7, sweep: 1.0 } ],
  hacksNeed: 0, fileNeed: false, spawnPts: [[4,21],[22,20],[41,21]],
  objText: () => "Blue card opens the ELEVATORS. Reception keeps one behind the desk — so does the floor officer.",
  lore: [
    "EXHIBIT D — visitor log: forty 'journalists' badge in weekly. MOCKINGBIRD never ended. It got a content calendar.",
    "EXHIBIT E — badge printer queue: 'INTERN (age 61)' ×12."
  ],
  brief: [
    { w: "op", t: "The atrium. Check the visitor logs while you're down there — half the press corps has a hard pass. CONSPIRACY ONE, counselor: the news writes itself. In this building." },
    { w: "kjp", t: "And the analysts?" },
    { w: "op", t: "Civilians. If they make you — or FIND YOUR WORK — they sprint for the wall panels, and a pulled alarm brings a QRF through the doors shooting. Aim at one and they freeze. Don't hurt them." },
    { w: "op", t: "Metal detectors span the floor line — lethal iron RINGS them. The ceramic HUSH-9 walks through clean. Or take the coat-room vent." },
    { w: "kjp", t: "I never hurt witnesses. Witnesses are MINE." }
  ]
},
/* ============ 3 · CUBICLE FARM — analytics floor, glass and carpet ============ */
{
  name: "CUBICLE FARM", sub: "ANALYTICS · 03:15", theme: "office", par: 220,
  rows: [
    "##############################################",
    "#...X#.......................................#",
    "#....R.......................................#",
    "#....#..==========..==========...............#",
    "#....#..=........=..=........=......----.....#",
    "#....#..=..i..r..D..D....t...=......-..-.....#",
    "#....#..=........=..=........=......-..-.....#",
    "#....#..==========..==========......----.....#",
    "#....#.......................................#",
    "#....######################D#################",
    "#............................................#",
    "#..--.--.--.--...--.--.--.--....--.--.--.....#",
    "#..--.--.--.--...--.--.--.--....--.--.--.....#",
    "#............................................#",
    "#..--.--.--.--...--.--.--.--....--.--.--..L..#",
    "#..--.--.--.--...--.--.--.--....--.--.--.....#",
    "#............................................#",
    "#..--.--.--.--...--.--.--.--....--.--.--.....#",
    "#..--.--.--.--...--.--.--.--....--.--.--.....#",
    "#.....L......................................#",
    "#############V################################",
    "#....a.......V................m..............#",
    "#............V................................#",
    "#............V................................#",
    "#............................................#",
    "#.........P..................................#",
    "#..........................i.................#",
    "##############################################"
  ],
  guards: [
    { x: 8,  y: 10, kind: "guard",   route: [[8,10],[40,10]] },
    { x: 40, y: 16, kind: "guard",   route: [[40,16],[4,16]] },
    { x: 2,  y: 13, kind: "sentry",  route: [[2,13],[2,19]] },
    { x: 24, y: 8,  kind: "officer", route: [[24,8],[7,8]], card: "r" }
  ],
  dogs: [],
  civs: [
    { x: 6,  y: 13, route: [[6,13],[6,16]] },
    { x: 18, y: 13, route: [[18,13],[28,13]] },
    { x: 34, y: 16, route: [[34,16],[34,13]] },
    { x: 20, y: 16, route: [[20,16],[12,16]] },
    { x: 30, y: 10, route: [[30,10],[42,10],[42,8]] }
  ],
  lasers: [],
  cams: [ { x: 5, y: 1, dir: 0, arc: 0.6, sweep: 0.8 }, { x: 26, y: 9, dir: 1.5708, arc: 0.7, sweep: 1.1 } ],
  hacksNeed: 1, fileNeed: false, hackKillsCams: true, spawnPts: [[8,10],[40,10],[24,13]],
  objText: s => s.hacks < 1 ? "Hack the IT TERMINAL in the glass room — it owns every camera on this floor." : "RED card opens the stairwell, top-left. The floor chief carries one too.",
  lore: [
    "EXHIBIT F — quota sheet: '40,000 posts/day minimum. Organic tone MANDATORY.'",
    "EXHIBIT G — trend calendar: next quarter's 'spontaneous' movements, pre-approved.",
    "EXHIBIT H — ticker watchlist, circled in red: WICK. Note: 'containment failed.'"
  ],
  brief: [
    { w: "op", t: "Analytics. CONSPIRACY TWO: every 'organic' trend since 2016 was typed on this floor. The botfarms, the fan wars, the meme cycles — payroll, all of it." },
    { w: "kjp", t: "They minted the meme. Discovery phase — I read everything they wrote." },
    { w: "op", t: "You're in the sub-floor — the VENT is your way up, stay low in it. Hack the glass IT room and every camera on the floor dies. The floor chief walks the RED stairwell card." },
    { w: "kjp", t: "Let the record show: they never saw me." }
  ]
},
/* ============ 4 · THE ARCHIVES — records hall, K9 unit ============ */
{
  name: "THE ARCHIVES", sub: "RECORDS · 03:58", theme: "archive", par: 240,
  rows: [
    "##############################################",
    "#............................................#",
    "#..#######..#######..#######..#######........#",
    "#..#######..#######..#######..#######...t....#",
    "#............................................#",
    "#............................................#",
    "#..#######..#######..#######..#######........#",
    "#..#######..#######..#######..#######........#",
    "#............................................#",
    "#............................................#",
    "#..#######..#######..#######..#######........#",
    "#..#######..#######..#######..#######........#",
    "#...........................................a#",
    "#............................................#",
    "###########CC#########################D#######",
    "#.........#..#..........................#....#",
    "#..t......#FF#.........m................Y....#",
    "#.........####..........................#XX..#",
    "#........................................#...#",
    "########################D#####################",
    "#............................................#",
    "#....P.......................................#",
    "#............................................#",
    "##############################################"
  ],
  guards: [
    { x: 6,  y: 4,  kind: "guard",   route: [[6,4],[36,4]] },
    { x: 36, y: 8,  kind: "guard",   route: [[36,8],[6,8]] },
    { x: 6,  y: 12, kind: "sentry",  route: [[6,12],[36,12]] },
    { x: 42, y: 2,  kind: "sentry",  route: [[42,2],[42,12]] },
    { x: 20, y: 16, kind: "officer", route: [[20,16],[38,16]], card: "y" },
    { x: 3,  y: 15, kind: "guard",   route: [[3,15],[3,18],[8,18]] }
  ],
  dogs: [
    { x: 10, y: 2,  route: [[10,2],[10,12]] },
    { x: 29, y: 12, route: [[29,12],[29,2]] }
  ],
  civs: [ { x: 24, y: 13, route: [[24,13],[10,13]] } ],
  lasers: [],
  cams: [ { x: 14, y: 14, dir: -1.5708, arc: 0.7, sweep: 0.9 }, { x: 30, y: 0, dir: 1.5708, arc: 0.6, sweep: 1.2 } ],
  hacksNeed: 2, fileNeed: true, fileLabel: "THE FILE (?)", spawnPts: [[5,21],[30,21],[42,21]],
  objText: s => s.hacks < 2 ? ("Hack BOTH records terminals to open the cage (" + s.hacks + "/2).")
             : !s.file ? "The cage is open. Take the file."
             : "Freight elevator, east — the yellow card officer walks the south corridor.",
  lore: [
    "EXHIBIT I — folder 'MOON LANDING': receipts. It happened. TWICE. The second one's classified.",
    "EXHIBIT J — Roswell invoice: 'weather balloon' + $2.1B shipping & handling.",
    "EXHIBIT K — every document 'lost' to a subpoena since 1963, alphabetized."
  ],
  brief: [
    { w: "op", t: "Records. CONSPIRACY THREE: nothing was ever destroyed. Every 'lost' file from every hearing lives on these shelves — paper never dies, it just gets a guard dog. Two K9s on the aisles; they smell THROUGH shelves." },
    { w: "kjp", t: "Dogs. Why is it always dogs. …Exhibits go in the briefcase tonight." },
    { w: "op", t: "Two terminals open the records cage. Your file is supposed to be inside." },
    { w: "kjp", t: "Then court is in session." }
  ]
},
/* ============ 5 · THE VAULT — SCIF, lasers, the real file ============ */
{
  name: "THE VAULT", sub: "SUB-LEVEL SCIF · 04:31", theme: "vault", par: 260,
  rows: [
    "##############################################",
    "#....#..................................#....#",
    "#.i..#..................................#..m.#",
    "#....D..................................D....#",
    "######..................................######",
    "#............................................#",
    "#...####....####....####....####....####.....#",
    "#...####....####....####....####....####.....#",
    "#...####....####....####....####....####.....#",
    "#............................................#",
    "#...####....####....####....####....####.....#",
    "#...####....####....####....####....####.....#",
    "#...####....####....####....####....####.....#",
    "#...........................................t#",
    "###################CC###################D#####",
    "#..a..............#..#........................#",
    "#..................#FF#........................#",
    "#..................####........................#",
    "#............................................#",
    "############################D#################",
    "#............................................#",
    "#.....P......................................#",
    "#........................................X...#",
    "##############################################"
  ],
  guards: [
    { x: 8,  y: 5,  kind: "sentry",  route: [[8,5],[40,5]] },
    { x: 40, y: 9,  kind: "sentry",  route: [[40,9],[8,9]] },
    { x: 8,  y: 13, kind: "sentry",  route: [[8,13],[40,13]] },
    { x: 2,  y: 1,  kind: "guard",   route: [[2,1],[2,3]] },
    { x: 43, y: 1,  kind: "guard",   route: [[43,1],[43,3]] },
    { x: 24, y: 18, kind: "officer", route: [[24,18],[36,18]] }
  ],
  dogs: [ { x: 25, y: 9, route: [[25,9],[25,5]] } ],
  civs: [],
  lasers: [
    { x1: 10, y1: 5, x2: 10, y2: 13, period: 2.6, duty: 0.5, phase: 0 },
    { x1: 26, y1: 5, x2: 26, y2: 13, period: 2.6, duty: 0.5, phase: 1.3 },
    { x1: 34, y1: 13, x2: 44, y2: 13, period: 3.4, duty: 0.45, phase: 0.7 }
  ],
  cams: [
    { x: 18, y: 14, dir: -1.5708, arc: 0.6, sweep: 0.8 },
    { x: 5, y: 4, dir: 0.4, arc: 0.7, sweep: 1.0 },
    { x: 40, y: 4, dir: 2.7, arc: 0.7, sweep: 1.0 }
  ],
  hacksNeed: 1, fileNeed: true, fileLabel: "THE BLACK FILE + COLD KEYS", fileHold: 3, spawnPts: [[6,20],[30,20],[43,20]],
  objText: s => s.hacks < 1 ? "The archives file was a DECOY. The real one is HERE. Hack VAULT CONTROL, east wall."
             : !s.file ? "Vault is open. TAKE THE BLACK FILE — and the WALLET KEYS taped inside it."
             : "One million coins in your briefcase. Sub-basement door — GO.",
  lore: [
    "EXHIBIT L — cold-wallet printout: 1,000,000 BTC. Genesis-era. Custodian tag: 'R.G.'",
    "EXHIBIT M — death certificate: GYATT, REGINA. 2011. Witnessed and SIGNED by… Regina Gyatt.",
    "EXHIBIT N — sticky note on the vault door: 'NEVER let Legal see this.' Too late."
  ],
  brief: [
    { w: "op", t: "The decoy bothered me, so I pulled the SCIF manifest. Counselor… CONSPIRACY FOUR is the budget. There's a genesis-era cold wallet under this building. A MILLION coins. The custodian tag reads R.GYATT." },
    { w: "kjp", t: "Regina Gyatt. The Agency's first quant. They said she drowned in 2011." },
    { w: "op", t: "Then she filed her own death certificate very neatly. Your BLACK FILE sits in the same vault — with the wallet keys taped inside the cover. Lasers sweep the floor. They don't blink twice." },
    { w: "kjp", t: "Neither do I. Tonight the estate settles." }
  ]
},
/* ============ 6 · EXFIL — director's wing to the roof ============ */
{
  name: "EXFIL: THE ROOF", sub: "DIRECTOR'S WING · 05:02", theme: "roof", par: 240,
  rows: [
    "##############################################",
    "#............................................#",
    "#.XXXX.......................................#",
    "#.XXXX.......................................#",
    "#.XXXX.......................................#",
    "#.......#D#################################..#",
    "#.......#.................................#..#",
    "#.......#..---..---..---..---..---..---...#..#",
    "#.......#.................................#..#",
    "#.......#################D#################..#",
    "#............................................#",
    "#............................................#",
    "########################D#####################",
    "#............................................#",
    "#...=====....==========....=====.............#",
    "#...=.i.=....=........=....=.a.=.............#",
    "#...=====....=...--...=....=====.............#",
    "#............=........=......................#",
    "#............=====..===......................#",
    "#............................................#",
    "###########################D##################",
    "#............................................#",
    "#........P...................................#",
    "#....m.......................................#",
    "##############################################"
  ],
  guards: [
    { x: 12, y: 6,  kind: "sentry",  route: [[12,6],[40,6]] },
    { x: 40, y: 8,  kind: "sentry",  route: [[40,8],[12,8]] },
    { x: 8,  y: 13, kind: "guard",   route: [[8,13],[8,19]] },
    { x: 32, y: 17, kind: "guard",   route: [[32,17],[42,17]] },
    { x: 6,  y: 10, kind: "officer", route: [[6,10],[40,10]] },
    { x: 10, y: 1,  kind: "sentry",  route: [[10,1],[40,1]] }
  ],
  dogs: [ { x: 34, y: 21, route: [[34,21],[20,21]] } ],
  civs: [],
  lasers: [],
  cams: [ { x: 25, y: 12, dir: 1.5708, arc: 0.7, sweep: 1.0 }, { x: 24, y: 9, dir: -1.5708, arc: 0.6, sweep: 0.9 } ],
  hacksNeed: 0, fileNeed: false, exfil: true, startAlert: 1, holdTime: 30,
  spawnPts: [[44,10],[40,21],[40,1]],
  objText: s => !s.holdDone ? "REGINA is flying your ride. Reach the HELIPAD (north-west) and HOLD until she flares." : "BOARD REGINA'S CHOPPER.",
  lore: [
    "EXHIBIT O — the Director's calendar, every Friday: 'ask R.G. for budget.' She OWNS this building.",
    "EXHIBIT P — helipad manifest, tonight, pilot: R. GYATT. Filed three weeks ago. She KNEW.",
    "EXHIBIT Q — an undated resignation letter, pre-signed: THE DIRECTOR."
  ],
  brief: [
    { w: "dir", t: "…he is IN the building. He HAS the wallet. All units: weapons free. This stopped being a security problem. It is now a funeral." },
    { w: "rg", t: "Kenny John Pierre. Regina Gyatt — yes, THE dead one. I've watched you climb my building all night, counselor. Magnificent billing." },
    { w: "kjp", t: "You're supposed to be at the bottom of a lake." },
    { w: "rg", t: "I'm at the top of the sky. The coins ride in your briefcase, I fly the chopper, and the Director learns who ACTUALLY owns Langley. ROOF. NOW. Hold the pad till I flare." },
    { w: "kjp", t: "See you in the courtroom — and the cockpit." }
  ]
},
];

/* codec cast — portraits drawn procedurally in screens.js */
const CAST = {
  kjp: { name: "K.J.P.", col: "#7cf9a5" },
  op:  { name: "SWITCHBOARD", col: "#8fc7ff" },
  dir: { name: "THE DIRECTOR", col: "#ff8f8f" },
  rg:  { name: "REGINA GYATT", col: "#ffd27c" }
};

const OUTRO = [
  { w: "rg", t: "Wheels up. One million coins, one officially-dead pilot, one lawyer holding the ledger. The Agency's whole shadow treasury just flew out the front door." },
  { w: "kjp", t: "Not flew. BILLED. Every conspiracy on every floor — logged as exhibits. They'll receive the invoice as a subpoena." },
  { w: "op", t: "…and me without a resignation letter." },
  { w: "rg", t: "Use the Director's. It's pre-signed — exhibit Q. Court is in session, gentlemen." },
  { w: "kjp", t: "See you in the courtroom." }
];
