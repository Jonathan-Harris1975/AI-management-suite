// ============================================================
// 🧠 AI Podcast Suite — Temporary Storage Check (Fixed)
// ============================================================

import fs from "fs";
import path from "path";
import { log } from "#logger.js";

const TEMP_DIR = path.resolve("/app/tmp");

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  log.debug("temp.dir.created", { TEMP_DIR });
}

log.info("💽 temp.dir.verified");
log.debug("temp.dir.verified", { TEMP_DIR });
