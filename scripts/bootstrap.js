
// ============================================================
// 🧠 AI Podcast Suite — Bootstrap Sequence
// ============================================================
// Updated to automatically run the R2 Text Safety Patch
// before any service initialization.
// ============================================================

import { execSync } from "child_process";
import { log } from "#logger.js";

async function run(cmd, label) {
  try {
    log.info(`🚀 Running ${label}...`);
    execSync(cmd, { stdio: "inherit" });
    log.info(`✅ ${label} completed successfully.`);
  } catch (err) {
    log.error(`❌ ${label} failed:`, { error: err.message });
  }
}

(async () => {
  log.info("🧩 Starting AI Podcast Suite bootstrap sequence...");
  log.info("---------------------------------------------");

  
  await run("node ./scripts/envBootstrap.js"),
  await run("node ./scripts/startupCheck.js", "Startup Check");
  await run("node ./scripts/tempStorage.js", "R2 Check");
  await run("node server.js", "Start Server");

  log.info("---------------------------------------------");
  log.info("💤 Bootstrap complete — container entering idle mode.");
})();
