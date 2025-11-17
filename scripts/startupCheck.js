import log from "../utils/root-logger.js";

try {
  log.info("🚀 startupCheck.js reached — container runtime confirmed!");
  log.info("---------------------------------------------");
  log.info(`📂 Working directory: ${process.cwd()}`);
  log.info(`📦 Node version: ${process.version}`);
  log.info("📦 Module type: module (from package.json)");
  log.info("---------------------------------------------");
  log.info("🏁 Environment check completed successfully.");
  process.exit(0);
} catch (err) {
  log.error("❌ Startup check failed", { error: err });
  process.exit(1);
}
