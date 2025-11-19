// ============================================================
// 🧠 AI Podcast Suite — Bootstrap Sequence
// ============================================================
// Ensures all RSS feed data and R2 text assets are initialized
// before the web server starts.
// ============================================================

import { execSync } from "child_process";
import { log, info } from "#logger.js";

async function run(cmd, label) {
  try {
    info(`🚀 Running ${label}...`);
    execSync(cmd, { stdio: "inherit" });
    info(`✅ ${label} completed successfully.`);
    return true;
  } catch (err) {
    log.error(`❌ ${label} failed: ${err.message}`);
    return false;
  }
}

(async () => {
  try {
    info('🟩 Starting AI Podcast Suite bootstrap sequence...');
    
    // 1️⃣ Load and validate environment variables
    const envSuccess = await run("node ./scripts/envBootstrap.js", "Environment Bootstrap");
    if (!envSuccess) {
      throw new Error("Environment bootstrap failed - cannot proceed");
    }

    // 2️⃣ Initialize RSS feed data into R2 (critical)
    const rssSuccess = await run("node ./services/rss-feed-creator/startup/rss-init.js", "RSS Init");
    if (!rssSuccess) {
      throw new Error("RSS initialization failed - cannot proceed");
    }

    // 3️⃣ Perform runtime sanity checks
    await run("node ./scripts/startupCheck.js", "Startup Check");

    // 4️⃣ Validate temp storage + Cloudflare R2 connectivity
    const storageSuccess = await run("node ./scripts/tempStorage.js", "R2 Check");
    if (!storageSuccess) {
      log.error("⚠️  Storage check failed, but continuing...");
    }

    // 5️⃣ Launch the main web server
    info('🎯 Launching main web server...');
    await run("node ./server.js", "Start Server");

    info('🏁 Bootstrap complete — container entering idle mode.');
    
  } catch (error) {
    log.error(`💥 Bootstrap sequence failed: ${error.message}`);
    process.exit(1);
  }
})();
