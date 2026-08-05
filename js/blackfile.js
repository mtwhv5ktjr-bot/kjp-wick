/* KJP — THE BLACK FILE.
 *
 * The premise is "unveil a conspiracy on every floor", but intel used to be
 * points and nothing else — you collected exhibits and the story never showed
 * up anywhere. This is where it lands: one file per floor, its lines blacked
 * out until you find the exhibits that unredact them, finishing at the
 * bitcoins and Regina Gyatt.
 *
 * Each exhibit you recover on a floor clears one line of that floor's file.
 * Best-ever intel per floor is what counts (PROG.lv[n].intel), so a page never
 * re-redacts because your last run was sloppy.
 */
"use strict";

const BLACKFILE = {
  1: { code: "BF-01 · PERIMETER", title: "THE FENCE",
       lines: [
         "The motion grid on the north fence has been dead since March.",
         "Maintenance tickets were opened, approved, and closed unactioned — eleven times.",
         "The signing officer does not exist. The badge number belongs to a vending contract.",
         "Someone wanted a way in that nobody would ever be blamed for leaving open." ] },
  2: { code: "BF-02 · ATRIUM", title: "THE LOBBY",
       lines: [
         "Visitor logs for the 3rd of every month are missing. Only the 3rd.",
         "The same four initials sign in at 02:00 and never sign out.",
         "Front-desk cameras are on a separate, unlogged loop.",
         "They are not sneaking anybody in. They are walking them in." ] },
  3: { code: "BF-03 · ANALYTICS", title: "CUBICLE FARM",
       lines: [
         "Desk 44 runs a model nobody commissioned and nobody has cancelled.",
         "Its only output is a daily list of names, ranked.",
         "The ranking column is titled LIABILITY.",
         "K.J.P., ATTORNEY — is on it. He has been for six years." ] },
  4: { code: "BF-04 · RECORDS", title: "THE ARCHIVES",
       lines: [
         "There is a file drawer with no index entry and a newer lock than the room.",
         "Every document inside is a closure memo for an operation with no opening memo.",
         "The operations were never approved because they were never proposed.",
         "They were invoiced, though. Every one of them, to the same account." ] },
  5: { code: "BF-05 · SUB-LEVEL SCIF", title: "THE VAULT",
       lines: [
         "The account is a cold wallet. The balance is obscene.",
         "It is funded by closure memos and drained by nothing. It only ever grows.",
         "Three signatures can move it. Two are dead men who still badge in at 02:00.",
         "The third signature is the reason the Agency kept a lawyer they never used." ] },
  6: { code: "BF-06 · DIRECTOR'S WING", title: "EXFIL: THE ROOF",
       lines: [
         "Regina Gyatt was never a witness. She was the custodian.",
         "She signed the third line because refusing it was the same as signing it.",
         "The keys were split the day they buried the operation that made them.",
         "Half went into the vault. The other half went into the file with your name on it." ] }
};

/* how many lines of floor n are unredacted — driven by the BEST intel haul */
function bfFound(n){
  const r = PROG.lv[n];
  return Math.max(0, Math.min((BLACKFILE[n] || { lines: [] }).lines.length, (r && r.intel) || 0));
}
function bfTotal(){
  let got = 0, all = 0;
  for (let n = 1; n <= 6; n++){ got += bfFound(n); all += (BLACKFILE[n] || { lines: [] }).lines.length; }
  return [got, all];
}
function bfComplete(){ const [a, b] = bfTotal(); return a >= b; }

let BF_PAGE = 1;

/* A redaction bar has to look like ink over text, not like empty space —
   otherwise a locked line reads as a rendering bug. Width is derived from the
   real string so the shape of the sentence survives being blacked out. */
function bfRedact(s, x, y, maxw){
  g.font = "700 13px Verdana";
  const w = Math.min(maxw, g.measureText(s).width);
  g.fillStyle = "#0b0f14"; g.fillRect(x, y - 11, w, 15);
  g.fillStyle = "rgba(120,140,160,0.10)";
  for (let i = 0; i < w; i += 9) g.fillRect(x + i, y - 11, 6, 15);
  g.strokeStyle = "rgba(230,241,255,0.10)"; g.lineWidth = 1;
  g.strokeRect(x + 0.5, y - 10.5, Math.max(1, w - 1), 14);
}

function drawBlackFile(){
  UIB = [];
  g.fillStyle = "#05070c"; g.fillRect(0, 0, W, H);
  const [got, all] = bfTotal();

  g.font = "900 32px Arial Black"; g.fillStyle = "#e6f1ff"; g.fillText("THE BLACK FILE", 70, 74);
  g.font = "700 12px Verdana"; g.fillStyle = "#7c8ba3";
  g.fillText(got + " of " + all + " lines recovered · every exhibit you carry out clears one", 70, 96);

  /* floor tabs */
  for (let n = 1; n <= 6; n++){
    const x = 70 + (n - 1) * 118, y = 116, w2 = 108, h2 = 34;
    const on = BF_PAGE === n, f = bfFound(n), tot = BLACKFILE[n].lines.length;
    const hot = MOUSE.x >= x && MOUSE.x <= x + w2 && MOUSE.y >= y && MOUSE.y <= y + h2;
    g.fillStyle = on ? "rgba(255,157,91,0.16)" : hot ? "rgba(120,140,160,0.10)" : "rgba(9,14,18,0.85)";
    g.fillRect(x, y, w2, h2);
    g.strokeStyle = on ? "#ff9d5b" : "#232c36"; g.lineWidth = on ? 2 : 1;
    g.strokeRect(x + 0.5, y + 0.5, w2 - 1, h2 - 1);
    g.font = "900 10px Arial Black"; g.fillStyle = on ? "#ffd27c" : f ? "#8fa3b5" : "#54606e";
    g.fillText("FLOOR " + n, x + 10, y + 15);
    g.font = "700 9px Verdana"; g.fillStyle = f >= tot ? "#7cf9a5" : "#57717f";
    g.fillText(f >= tot ? "COMPLETE" : f + "/" + tot + " lines", x + 10, y + 28);
    UIB.push({ x, y, w: w2, h: h2, cb: () => { BF_PAGE = n; SFX.ui2(); } });
  }

  /* the page */
  const bf = BLACKFILE[BF_PAGE], found = bfFound(BF_PAGE);
  const px = 70, py = 182, pw = W - 140, ph = 330;
  g.fillStyle = "rgba(9,14,18,0.9)"; g.fillRect(px, py, pw, ph);
  g.strokeStyle = "#232c36"; g.lineWidth = 1; g.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  g.font = "900 10px Arial Black"; g.fillStyle = "#ff9d5b"; g.fillText(bf.code, px + 22, py + 30);
  g.font = "900 24px Arial Black"; g.fillStyle = "#e6f1ff"; g.fillText(bf.title, px + 22, py + 62);
  g.font = "700 10px Verdana"; g.fillStyle = "#3d4854";
  g.fillText("CLASSIFIED · EYES ONLY · NO DIGITAL COPY", px + 22, py + 82);

  bf.lines.forEach((ln, i) => {
    const y = py + 124 + i * 42;
    g.font = "900 9px Arial Black"; g.fillStyle = i < found ? "#8a6d2f" : "#2b333c";
    g.fillText("EXHIBIT " + (i + 1), px + 22, y - 14);
    if (i < found){
      g.font = "700 13px Verdana"; g.fillStyle = "#cbd9c9";
      g.fillText(ln, px + 22, y + 4);
    } else bfRedact(ln, px + 22, y + 4, pw - 60);
  });

  if (found >= bf.lines.length && BF_PAGE === 6 && bfComplete()){
    g.font = "900 13px Arial Black"; g.fillStyle = "#ffd27c"; g.textAlign = "center";
    g.fillText("THE FILE IS COMPLETE — SEE YOU IN THE COURTROOM.", W / 2, py + ph - 18);
    g.textAlign = "left";
  } else if (found < bf.lines.length){
    g.font = "700 11px Verdana"; g.fillStyle = "#57717f";
    g.fillText("Recover " + (bf.lines.length - found) + " more exhibit(s) on this floor to unredact the rest.", px + 22, py + ph - 18);
  }

  btn(W - 190, H - 78, 120, 44, "← BACK", () => { STATE = "dossier"; });
  dispatchClicks();
}
