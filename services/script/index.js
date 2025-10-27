// services/script/index.js
/**
 * AI Podcast Script Service Entry Point
 * -------------------------------------
 * This file integrates the /script microservice into the unified suite.
 * It ensures routes, imports, and exports align with the rest of the system.
 */

import app from "./app.js";
import { info, error } from "#logger.js";

// Detect environment
const NODE_ENV = process.env.NODE_ENV || "development";
const PORT = process.env.PORT || 3000;

// ─────────────────────────────
// 1️⃣ If running as standalone (e.g. Render service or local dev)
// ─────────────────────────────
if (process.env.SERVICE_MODE === "standalone" || NODE_ENV === "development") {
  try {
    app.listen(PORT, () => {
      info("script.service.ready", {
        port: PORT,
        mode: SERVICE_MODE_LABEL(),
        env: NODE_ENV,
      });
    });
  } catch (err) {
    error("script.service.start.fail", { err: err.message });
  }
}

// ─────────────────────────────
// 2️⃣ Helper: mode label
// ─────────────────────────────
function SERVICE_MODE_LABEL() {
  if (process.env.SERVICE_MODE === "standalone") return "standalone";
  if (NODE_ENV === "development") return "dev local";
  return "embedded (managed by main suite)";
}

// ─────────────────────────────
// 3️⃣ Export Express app (for unified suite mounting)
// ─────────────────────────────
export default app;
