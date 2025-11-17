// routes/index.js
import log from "./utils/root-logger.js";
import { Router } from "express";

import rssRoutes from "./rss.js";
import scriptRoutes from "./script.js";
import ttsRoutes from "./tts.js";
import artworkRoutes from "./artwork.js";
import podcastRoutes from "./podcast.js";

const router = Router();

// Log that routes are being registered
log.startup("routes.register", {
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
