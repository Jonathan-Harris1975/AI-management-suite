// scripts/startupCheck.js
import log from "#shared/utils/root-logger.js";
import fs from "fs";

export default function startupCheck() {
  try {
    const cwd = process.cwd();
    const nodeVersion = process.version;

    log.script("startupCheck", "runtime", { cwd, nodeVersion });

    // optional: check required folders
    const tempDir = "/tmp/podcast_master";
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      log.script("startupCheck", "temp.dir.created");
    } else {
      log.script("startupCheck", "temp.dir.exists");
    }

    log.script("startupCheck", "ok");
  } catch (err) {
    log.script("startupCheck", "error", { error: err.message });
    throw err;
  }
}
