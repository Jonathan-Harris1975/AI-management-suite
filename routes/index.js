// routes/index.js
import log from "../utils/root-logger.js";
import express from "express";


// ─────────────────────────────
//  SERVICE ROUTES
// ─────────────────────────────
import rssRoutes from "../services/rss-feed-creator/routes/rewrite.js";
import scriptRoutes from "../services/script/routes/index.js";
import ttsRoutes from "../services/tts/routes/tts.js";
import artworkRoutes from "../services/artwork/index.js";
import podcastRoutes from "../services/podcast/index.js";

const router = express.Router();

const routeRegistry = [
  { path: "/rss", name: "RSS Feed Creator", routes: rssRoutes },
  { path: "/script", name: "Script Generation", routes: scriptRoutes },
  { path: "/tts", name: "TTS Service", routes: ttsRoutes },
  { path: "/artwork", name: "Artwork Creation", routes: artworkRoutes },
  { path: "/podcast", name: "Podcast Generation", routes: podcastRoutes }
];

log("📡 Starting route registration...");

try {
  // Health endpoints
  router.get("/api/rss/health", (_req, res) => 
    res.status(200).json({ status: "ok", service: "rss-feed-creator" })
  );
  router.get("/api/podcast/health", (_req, res) => 
    res.status(200).json({ status: "ok", service: "podcast" })
  );

  // Mount all routes
  routeRegistry.forEach(({ path, name, routes }) => {
    router.use(path, routes);
  });

  // Summary log
  log(`🟩 Routes mounted: ${routeRegistry.length} services registered`);
  
} catch (err) {
  error("💥 Route registration failed", { error: err.stack });
  throw err;
}

export default router;
