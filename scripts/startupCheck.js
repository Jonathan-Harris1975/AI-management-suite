import log from "../utils/root-logger.js";

try {
  log.info("🚀 startupCheck.reached");
  log.info("---------------------------------------------");
  log.info(`📂 startupCheck.cwd: ${process.cwd()}`);
  log.info(`📦 startupCheck.node: ${process.version}`);
  log.info("📦 startupCheck.moduleType: module (from package.json)");
  log.info("---------------------------------------------");
  log.info("🏁 startupCheck.ok");
  process.exit(0);
} catch (err) {
  log.error("💥 startupCheck.failed", { error: err });
  process.exit(1);
}
