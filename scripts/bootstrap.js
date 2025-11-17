import { execSync } from "child_process";
import log from "../utils/root-logger.js";

async function run(cmd, label) {
  try {
    log.info(`Starting: ${label}`);
    execSync(cmd, { stdio: "inherit" });
    log.info(`Completed: ${label}`);
  } catch (err) {
    log.error(`Failed: ${label}`, { 
      command: cmd,
      error: err.message 
    });
    throw err; // Re-throw to stop bootstrap on failure
  }
}

(async () => {
  const startTime = Date.now();
  log.info("🟧 Bootstrap sequence initiated");

  try {
    await run("node ./scripts/envBootstrap.js", "Environment Bootstrap");
    await run("node ./services/rss-feed-creator/startup/rss-init.js", "RSS Initialization");
    await run("node ./scripts/startupCheck.js", "Startup Health Check");
    await run("node ./scripts/tempStorage.js", "R2 Storage Check");
    await run("node ./server.js", "Server Start");

    const duration = Date.now() - startTime;
    log.info("🟩 Bootstrap sequence completed", { durationMs: duration });
  } catch (err) {
    log.error("🔴 Bootstrap sequence failed", { error: err.message });
    process.exit(1);
  }
})();
