import log from "../utils/root-logger.js";

try {
  log.info("🟧 Startup check initiated");
  
  log.info("🗃️ Environment details", {
    cwd: process.cwd(),
    nodeVersion: process.version,
    moduleType: "ESM",
    platform: process.platform,
    arch: process.arch,
  });
  
  log.info("🟩 Startup check passed");
  process.exit(0);
} catch (err) {
  log.error("🔴 Startup check failed", { error: err.message, stack: err.stack });
  process.exit(1);
