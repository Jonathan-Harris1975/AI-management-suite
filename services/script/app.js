// services/script/app.js
import express from "express";
import scriptRoutes from "./routes/index.js";
import { info } from "#logger.js";
import weatherRoute from "./routes/weatherRoute.js";
app.use("/api", weatherRoute);

const app = express();

// ─────────────────────────────
// Core middleware
// ─────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// ─────────────────────────────
// Mount routes
// ─────────────────────────────
app.use("/script", scriptRoutes);

// Health route for internal checks
app.get("/script/health", (_req, res) => {
  res.json({ ok: true, service: "script" });
});

// ─────────────────────────────
// Startup log
// ─────────────────────────────
info("script.app.init", { mounted: "/script" });

export default app;
