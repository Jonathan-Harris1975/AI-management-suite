// /server.js — AI Podcast Suite (clean)
import express from "express";
import process from "node:process";
import fs from "node:fs";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const NODE_ENV = (process.env.NODE_ENV || "production").toLowerCase();

function log(message, meta) {
  const entry = { time: new Date().toISOString(), message };
  if (meta && typeof meta === "object") entry.meta = meta;
  process.stdout.write(JSON.stringify(entry) + "\n");
}

// Preflight: make sure the route file actually exists
log("🧩 Preflight check", { rewriteExists: fs.existsSync("./routes/rewrite.js") });

// Mount rewrite route
import rewriteRouter from "./routes/rewrite.js";
app.use("/api/rewrite", rewriteRouter);
log("✅ Mounted /api/rewrite");

// Basic root + health
app.get("/", (_req, res) => {
  res.json({
    message: "🧠 AI Podcast Suite is live",
    endpoints: ["/api/rewrite/health", "/api/rewrite/run"],
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", env: NODE_ENV });
});

// 404 (keep last)
app.use((req, res) => {
  log("⚠️ 404 Not Found", { path: req.originalUrl });
  res.status(404).json({ error: "Endpoint not found", path: req.originalUrl });
});

app.listen(PORT, () => {
  log("🚀 Server listening", { PORT: String(PORT), NODE_ENV: (process.env.NODE_ENV || "Production") });
});
