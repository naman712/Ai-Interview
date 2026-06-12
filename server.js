// Local development server — mirrors Vercel's routing
// Run with: node server.js
require("dotenv").config({ path: ".env.local" });

const express = require("express");
const path    = require("path");
const app     = express();

app.use(express.json({ limit: "20mb" })); // increased for base64 audio

// ── API routes (load each serverless handler) ──────────────────
app.post("/api/candidate",  require("./api/candidate"));
app.post("/api/score",      require("./api/score"));
app.post("/api/admin",      require("./api/admin"));
app.get( "/api/questions",  require("./api/questions"));
app.post("/api/followup",   require("./api/followup"));
app.post("/api/transcribe", require("./api/transcribe"));

// ── Static pages ───────────────────────────────────────────────
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "admin.html")));
app.get("/",      (req, res) => res.sendFile(path.join(__dirname, "index.html")));

// ── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  ✅  Server running at http://localhost:${PORT}`);
  console.log(`  🎙️   Candidate interview → http://localhost:${PORT}`);
  console.log(`  ⚙️   Admin panel         → http://localhost:${PORT}/admin\n`);
});
