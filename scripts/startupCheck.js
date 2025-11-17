// scripts/startupCheck.js
import log from "#shared/utils/root-logger.js";

try {
  log.script("startupCheck", "runtime", {
    cwd: process.cwd(),
    nodeVersion: process.version,
  });

  log.script("startupCheck", "ok");
  process.exit(0);
} catch (err) {
  log.script("startupCheck", "error", { error: err.message });
  process.exit(1);
}
