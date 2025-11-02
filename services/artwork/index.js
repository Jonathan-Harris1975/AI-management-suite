// ============================================================
// 🎨 services/artwork/index.js
// ============================================================
//
// Entry point for the artwork generation module.
// Mounts /generate endpoint that uses Nano Banana via OpenRouter.
//
// ============================================================

import express from "express";
import generateArtworkRoute from "./routes/generate.js";

const router = express.Router();

// Mount /generate
router.use("/generate", generateArtworkRoute);

export default router;
