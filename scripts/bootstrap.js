// ============================================================
// 🧠 AI Podcast Suite — Bootstrap Sequence
// ============================================================
// Ensures all RSS feed data and R2 text assets are initialized
// before the web server starts.
// ============================================================

import { execSync } from "child_process";
import { log } from "#logger.js";

async function run(cmd, label) {
  try {
    log.info(`🚀 Running ${label}...`);
    execSync(cmd, { stdio: "inherit" });
    log.info(`✅ ${label} completed successfully.`);
  } catch (err) {
    log.error(`❌ ${label} failed: ${err.message}`);
  }
}

(async () => {
  log.info("🧩 Starting AI Podcast Suite bootstrap sequence...");
  log.info("---------------------------------------------");

  // 1️⃣ Load and validate environment variables
  await run("node ./scripts/envBootstrap.js", "Environment Bootstrap");

  // 2️⃣ Initialize RSS feed data into R2 (critical)
  await run("node ./services/rss-feed-creator/startup/rss-init.js", "RSS Init");

  // 3️⃣ Perform runtime sanity checks
  await run("node ./scripts/startupCheck.js", "Startup Check");

  // 4️⃣ Validate temp storage + Cloudflare R2 connectivity
  await run("node ./scripts/tempStorage.js", "R2 Check");

  // 5️⃣ Launch the main web server
  await run("node ./server.js", "Start Server");

  log.info("---------------------------------------------");
  log.info("💤 Bootstrap complete — container entering idle mode.");
})();
