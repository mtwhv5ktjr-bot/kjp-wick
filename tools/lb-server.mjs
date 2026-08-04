/* KJP LEADERBOARD — self-hosted.
 *
 * Same API contract as the Vercel/Blob one (GET ?mode=, POST signed score), so
 * the games can point at it by changing a single URL. Difference: the board
 * lives in a plain JSON file YOU own, and it is written the way the last one
 * should have been —
 *
 *   - atomic writes (tmp file + rename) so a crash mid-write cannot shred it
 *   - a TIMESTAMPED backup every save, keeping the last 40
 *   - it refuses to overwrite a populated board with an empty one
 *
 * The store that just took the tournament down was suspended with the data
 * intact and unreadable; a file on your disk cannot be suspended.
 *
 *   node tools/lb-server.mjs                 # :8110, holders gate OFF
 *   GATE=1 node tools/lb-server.mjs          # enforce WICK ARSENAL ownership
 *   PORT=9000 node tools/lb-server.mjs
 *
 * Import the old board once it is readable again:
 *   node tools/lb-server.mjs --import ../wick-arsenal/lb-recovered.json
 */
import http from "http";
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, readdirSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ethers = createRequire("C:/Users/Bia/New folder/wick-arsenal/")("ethers");

const PORT = +(process.env.PORT || 8110);
const GATE = process.env.GATE === "1";
const DATA = join(root, "lb-data");
const FILE = join(DATA, "lb.json");
const BAKS = join(DATA, "backups");
const MAX_AGE_MS = 5 * 60 * 1000;
const CAP = 200;
const RPC = process.env.RPC_URL || "https://rpc.pulsechain.com";
const GUNS = "0x188848DdB42fA8Ca2EB05649c944e05dfA2158FD";

mkdirSync(DATA, { recursive: true }); mkdirSync(BAKS, { recursive: true });

/* ---- the per-mode ceilings, identical to the hosted board ---- */
const maxLevelFor = m => m === "gauntlet" ? 50 : m === "bossrush" ? 4 : String(m).startsWith("daily-") ? 1 : 10;
const ceilingFor = (m, lv) =>
  m === "gauntlet" ? 5000 + Math.max(1, lv) * 20000 :
  String(m).startsWith("daily-") ? 60000 :
  m === "bossrush" ? 40000 : 300000;

/* ---- storage: atomic, backed up, and refuses to self-destruct ---- */
function load(){
  try { const j = JSON.parse(readFileSync(FILE, "utf8")); return Array.isArray(j) ? j : []; }
  catch { return []; }
}
function save(board){
  const cur = load();
  if (cur.length > 0 && board.length === 0)
    throw new Error("refusing to replace a populated board with an empty one");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  try { if (existsSync(FILE)) writeFileSync(join(BAKS, "lb-" + stamp + ".json"), readFileSync(FILE)); } catch {}
  const tmp = FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(board, null, 1));
  renameSync(tmp, FILE);                       // atomic on the same volume
  try {                                        // keep the last 40 snapshots
    const old = readdirSync(BAKS).filter(f => f.startsWith("lb-")).sort();
    while (old.length > 40) unlinkSync(join(BAKS, old.shift()));
  } catch {}
}

/* ---- holders gate (optional locally, matches the hosted rule when on) ---- */
const CHAIN = new ethers.Network("pulsechain", 369);
async function gunsHeld(addr){
  if (!GATE) return null;
  const c = new ethers.Contract(GUNS, ["function balanceOf(address) view returns (uint256)"],
    new ethers.JsonRpcProvider(RPC, CHAIN, { staticNetwork: CHAIN }));
  return Number(await c.balanceOf(ethers.getAddress(addr)));
}

const json = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (req.method === "OPTIONS"){
    res.writeHead(204, { "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "content-type" });
    return res.end();
  }
  if (url.pathname === "/api/health"){
    const b = load();
    return json(res, 200, { ok: true, entries: b.length, file: FILE, gate: GATE,
      backups: (() => { try { return readdirSync(BAKS).length; } catch { return 0; } })() });
  }
  if (url.pathname !== "/api/leaderboard") return json(res, 404, { error: "not found" });

  if (req.method === "GET"){
    const board = load();
    const want = (url.searchParams.get("mode") || "").slice(0, 20);
    const rows = want ? board.filter(e => (e.mode || "") === want)
                      : board.filter(e => !String(e.mode || "").startsWith("daily-"));
    return json(res, 200, { ok: true, top: rows.slice(0, 10), total: rows.length, mode: want || undefined, self_hosted: true });
  }
  if (req.method !== "POST") return json(res, 405, { error: "GET or POST" });

  let body = "";
  req.on("data", c => { body += c; if (body.length > 2e5) req.destroy(); });
  req.on("end", async () => {
    try {
      const { address, name, score, level, mode, message, signature } = JSON.parse(body || "{}");
      if (!address || !message || !signature) return json(res, 400, { error: "missing fields" });
      const s = Math.floor(Number(score));
      if (!Number.isFinite(s) || s <= 0) return json(res, 400, { error: "bad score" });

      let rec;
      try { rec = ethers.verifyMessage(message, signature); }
      catch { return json(res, 401, { error: "bad signature" }); }
      if (rec.toLowerCase() !== String(address).toLowerCase())
        return json(res, 401, { error: "signature does not match address" });
      if (!message.toLowerCase().includes(String(address).toLowerCase()))
        return json(res, 401, { error: "message must bind the address" });
      if (!message.includes("score:" + s)) return json(res, 401, { error: "message must bind the score" });
      const m = String(mode || "story").slice(0, 12);
      if (!message.includes("mode:" + m)) return json(res, 401, { error: "message must bind the mode" });
      const ts = (/ts:(\d+)/.exec(message) || [])[1];
      if (!ts || Math.abs(Date.now() - Number(ts)) > MAX_AGE_MS)
        return json(res, 401, { error: "stale or missing timestamp" });

      const lv = Math.max(1, Math.min(maxLevelFor(m), Number(level) || 1));
      if (s > ceilingFor(m, lv)) return json(res, 400, { error: "score above what this mode can produce" });

      let held = null;
      try { held = await gunsHeld(address); }
      catch { return json(res, 503, { error: "could not verify NFT ownership right now" }); }
      if (held !== null && held < 1)
        return json(res, 403, { error: "holders only — you need a WICK ARSENAL gun NFT. Mint at mint.wick.pics" });

      const board = load();
      const a = String(address).toLowerCase();
      const i = board.findIndex(e => e.a === a && (e.mode || "story") === m);
      if (i >= 0 && board[i].score >= s)
        return json(res, 200, { ok: true, rank: i + 1, unchanged: true, top: board.slice(0, 10) });
      const clean = String(name || "").replace(/[^\w .\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 16);
      const entry = { a, name: clean, score: s, level: lv, mode: m, guns: held == null ? 0 : held, ts: Date.now() };
      if (i >= 0) board[i] = entry; else board.push(entry);
      board.sort((x, y) => y.score - x.score);
      board.length = Math.min(board.length, CAP);
      save(board);
      return json(res, 200, { ok: true, rank: board.findIndex(e => e.a === a) + 1, top: board.slice(0, 10) });
    } catch (e) { return json(res, 500, { error: (e && e.message) || "failed" }); }
  });
});

/* one-shot import of a rescued board */
const imp = process.argv.indexOf("--import");
if (imp > -1){
  const src = process.argv[imp + 1];
  const incoming = JSON.parse(readFileSync(src, "utf8"));
  const board = load();
  const byKey = new Map(board.map(e => [e.a + "|" + (e.mode || "story"), e]));
  let added = 0;
  for (const e of incoming){
    const k = e.a + "|" + (e.mode || "story");
    const cur = byKey.get(k);
    if (!cur || e.score > cur.score){ byKey.set(k, e); added++; }
  }
  const merged = [...byKey.values()].sort((x, y) => y.score - x.score);
  save(merged);
  console.log("imported " + incoming.length + " rows, " + added + " new/better -> " + merged.length + " total");
  process.exit(0);
}

server.listen(PORT, () => {
  const b = load();
  console.log("KJP leaderboard on http://localhost:" + PORT + "/api/leaderboard");
  console.log("  data   " + FILE + "   (" + b.length + " entries)");
  console.log("  gate   " + (GATE ? "ON — WICK ARSENAL holders only" : "OFF — anyone with a valid signature"));
  console.log("  health http://localhost:" + PORT + "/api/health");
});
