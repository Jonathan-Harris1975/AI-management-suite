import { execSync } from "child_process";
import log from "../utils/root-logger.js";

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
  log.info('🧩 Starting AI Podcast Suite bootstrap sequence...');
  log.info('---------------------------------------------');

  await run("node ./scripts/envBootstrap.js", "Environment Bootstrap");
  await run("node ./services/rss-feed-creator/startup/rss-init.js", "RSS Init");
  await run("node ./scripts/startupCheck.js", "Startup Check");
  await run("node ./scripts/tempStorage.js", "R2 Check");
  await run("node ./server.js", "Start Server");

  log.info('---------------------------------------------');
  log.info('🏁 Bootstrap complete — container entering idle mode.');
})();
