import fs from "fs";
import path from "path";
import log from "../utils/root-logger.js";

const TEMP_DIR = path.resolve("/app/tmp");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  log.info("temp.dir.created", { TEMP_DIR });
}

log.info("temp.dir.verified", { TEMP_DIR });
