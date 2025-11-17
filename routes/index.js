// routes/index.js
import log from "../utils/root-logger.js";
import { Router } from "express";

import rssRoutes from "../services/rss-feed-creator/routes/rewrite.js";
import scriptRoutes from "../services/script/routes/index.js";
import ttsRoutes from "../services/tts/routes/tts.js";
import artworkRoutes from "../services/artwork/index.js";
import podcastRoutes from "../services/podcast/index.js";


const router = Router();

// Log that routes are being registered (minimal + emoji)
log.info("🧩 routes.register", {
  services: ["rss", "script", "tts", "artwork", "podcast"],
});

// Mount service routes
router.use("/rss", rssRoutes);
router.use("/script", scriptRoutes);
router.use("/tts", ttsRoutes);
router.use("/artwork", artworkRoutes);
router.use("/podcast", podcastRoutes);

// Optional: a simple index route
router.get("/", (_req, res) => {
  res.json({
    ok: true,
    services: ["rss", "script", "tts", "artwork", "podcast"],
  });
});

export default router;
