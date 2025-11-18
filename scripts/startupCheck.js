import log from "../utils/root-logger.js";

try {
  log.info("🟧 Startup check initiated");
  
  log.debug("🗃️ Environment details", {
    cwd: process.cwd(),
    nodeVersion: process.version,
    moduleType: "ESM",
    platform: process.platform,
    arch: process.arch,
    pid: process.pid, // Consider adding process ID
  });
  
  log.info("🟩 Startup check passed");
  process.exit(0);
} catch (error) {
  log.error("🔴 Startup check failed", { 
    error: error.message, 
    stack: error.stack 
  });
  process.exit(1);
}
