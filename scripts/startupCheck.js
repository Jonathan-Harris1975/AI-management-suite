// scripts/startupCheck.js
import { info, error } from "shared/root-logger.js";

try {
  info("🚀 startupCheck.js reached — container runtime confirmed!");
  info("---------------------------------------------");
  info(`📂 Working directory: ${process.cwd()}`);
  info(`📦 Node version: ${process.version}`);
  info("📦 Module type: module (from package.json)");
  info("---------------------------------------------");
  info("🏁 Environment check completed successfully.");
  process.exit(0);
} catch (err) {
  error("❌ Startup check failed", { error: err });
  process.exit(1);
}
