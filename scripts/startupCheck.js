// scripts/startupCheck.js
import { info, error,debug } from "#logger.js";

try {
debug("🚀 startupCheck.js reached — container runtime confirmed!");
  debug("---------------------------------------------");
  debug(`📂 Working directory: ${process.cwd()}`);
  debug(`📦 Node version: ${process.version}`);
  debug("📦 Module type: module (from package.json)");
  
  info("🏁 Environment check completed successfully.");
  process.exit(0);
} catch (err) {
  error("❌ Startup check failed", { error: err });
  process.exit(1);
}
