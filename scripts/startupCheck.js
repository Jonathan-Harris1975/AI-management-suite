// scripts/startupCheck.js
import { info } from "#logger.js";
import { logger } from '../logger.js';

try {
  info("🚀 startupCheck.js reached — container runtime confirmed!");
  logger.info("---------------------------------------------");
  logger.info("📂 Working directory:", process.cwd());
  logger.info("📦 Node version:", process.version);
  logger.info("📦 Module type: module (from package.json)");
  logger.info("---------------------------------------------");
  info("🏁 Environment check completed successfully.");
  process.exit(0);
} catch (err) {
  logger.error("❌ Startup check failed:", err);
  process.exit(1);
}
