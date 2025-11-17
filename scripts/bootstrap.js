import { execSync } from "child_process";
import log from "../utils/root-logger.js";

async function run(cmd, label) {
  try {
    log.info(`🚀 bootstrap.step.start.${label}`);
    execSync(cmd, { stdio: "inherit" });
    log.info(`✅ bootstrap.step.ok.${label}`);
  } catch (err) {
    log.error("💥 bootstrap.step.failed", { label, error: err.message });
  }
}

(async () => {
  log.info("🧩 bootstrap.sequence.start");
  log.info("---------------------------------------------");

  await run("node ./scripts/envBootstrap.js", "Environment Bootstrap");
  await run("node ./services/rss-feed-creator/startup/rss-init.js", "RSS Init");
  await run("node ./scripts/startupCheck.js", "Startup Check");
  await run("node ./scripts/tempStorage.js", "R2 Check");
  await run("node ./server.js", "Start Server");

  log.info("---------------------------------------------");
  log.info("🏁 bootstrap.sequence.complete");
})();
