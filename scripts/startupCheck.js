// scripts/startupCheck.js
import { info } from "../utils/logger.js";

try {
  info("🚀 startupCheck.js reached — container runtime confirmed!");
  console.log("---------------------------------------------");
  console.log("📂 Working directory:", process.cwd());
  console.log("📦 Node version:", process.version);
  console.log("📦 Module type: module (from package.json)");
  console.log("---------------------------------------------");
  info("✅ Environment check completed successfully.");
  process.exit(0);
} catch (err) {
  console.error("❌ Startup check failed:", err);
  process.exit(1);
}
