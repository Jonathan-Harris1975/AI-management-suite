// scripts/tempStorage.js
import fs from "fs";
import path from "path";
import log from "#shared/utils/root-logger.js";

const TEMP_DIR = path.resolve("/app/tmp");

try {
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    log.script("tempStorage", "created", { dir: TEMP_DIR });
  } else {
    log.script("tempStorage", "exists", { dir: TEMP_DIR });
  }

  log.script("tempStorage", "ok");
} catch (err) {
  log.script("tempStorage", "error", { error: err.message });
  process.exit(1);
}
