// Minimal static dev server for KJP (no dependencies). Port 8096.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PORT = process.env.PORT || 8100;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".webp": "image/webp"
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (req.method === "POST" && p === "/shot") {
    // dev helper: page POSTs canvas.toDataURL, we save it for inspection
    let body = "";
    req.on("data", c => { body += c; if (body.length > 8e6) req.destroy(); });
    req.on("end", () => {
      const m = /^data:image\/png;base64,(.+)$/.exec(body);
      if (!m) { res.writeHead(400); res.end("bad data url"); return; }
      fs.writeFile(path.join(ROOT, "shot.png"), Buffer.from(m[1], "base64"), err => {
        res.writeHead(err ? 500 : 200); res.end(err ? "fail" : "ok");
      });
    });
    return;
  }
  if (req.method === "POST" && p === "/save") {
    // dev helper: save a generated PNG into assets/ (pipeline testing / in-browser art)
    const name = new URLSearchParams(req.url.split("?")[1] || "").get("f") || "";
    if (!/^assets\/[a-z0-9-]+\.png$/.test(name)) { res.writeHead(400); res.end("bad name"); return; }
    let body = "";
    req.on("data", c => { body += c; if (body.length > 8e6) req.destroy(); });
    req.on("end", () => {
      const m = /^data:image\/png;base64,(.+)$/.exec(body);
      if (!m) { res.writeHead(400); res.end("bad data url"); return; }
      fs.writeFile(path.join(ROOT, name), Buffer.from(m[1], "base64"), err => {
        res.writeHead(err ? 500 : 200); res.end(err ? "fail" : "ok");
      });
    });
    return;
  }
  if (p === "/") p = "/index.html";
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}).listen(PORT, () => console.log("KJP server on http://localhost:" + PORT));
