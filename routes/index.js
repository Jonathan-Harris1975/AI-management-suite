import log from ;
// routes/index.js
import express from ;
import { info, error } from ;

// ─────────────────────────────
//  SERVICE ROUTES
// ─────────────────────────────
import rssRoutes from ;
import scriptRoutes from ;
import ttsRoutes from ;
import artworkRoutes from ;
import podcastRoutes from ;

const router = express.Router();

const routeRegistry = [
  { path: , name: , routes: rssRoutes },
  { path: , name: , routes: scriptRoutes },
  { path: , name: , routes: ttsRoutes },
  { path: , name: , routes: artworkRoutes },
  { path: , name: , routes: podcastRoutes }
];

info();

try {
  // Health endpoints
  router.get(, (_req, res) => 
    res.status(200).json({ status: , service:  })
  );
  router.get(, (_req, res) => 
    res.status(200).json({ status: , service:  })
  );

  // Mount all routes
  routeRegistry.forEach(({ path, name, routes }) => {
    router.use(path, routes);
  });

  // Summary log
  info(`🟩 Routes mounted: ${routeRegistry.length} services registered`);
  
} catch (err) {
  error(, { error: err.stack });
  throw err;
}

export default router;
