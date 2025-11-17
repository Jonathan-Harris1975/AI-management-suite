// routes/index.js
import log from "../utils/root-logger.js";
import { Router } from "express";

import rssRoutes from "../services/rss-feed-creator/routes/rewrite.js";
import scriptRoutes from "../services/script/routes/index.js";
import ttsRoutes from "../services/tts/routes/tts.js";
import artworkRoutes from "../services/artwork/index.js";
import podcastRoutes from "../services/podcast/index.js";

const router = Router();

const SERVICES = ["rss", "script", "tts", "artwork", "podcast"];

// Log route registration
log.info("🟧 Registering service routes", {
  services: SERVICES,
  count: SERVICES.length,
});

// Mount service routes
router.use("/rss", rssRoutes);
router.use("/script", scriptRoutes);
router.use("/tts", ttsRoutes);
router.use("/artwork", artworkRoutes);
router.use("/podcast", podcastRoutes);

log.debug("🟩 Service routes mounted successfully");

// Health check / index route
router.get("/", (_req, res) => {
  res.json({
    ok: true,
    services: SERVICES,
  });
});

export default router;
