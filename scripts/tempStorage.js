import log from ;
// ============================================================
// 🧠 AI Podcast Suite — Temporary Storage Check (Fixed)
// ============================================================

import fs from ;
import path from ;
import { log } from ;

const TEMP_DIR = path.resolve();

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  log.info(, { TEMP_DIR });
}

log.info(, { TEMP_DIR });
