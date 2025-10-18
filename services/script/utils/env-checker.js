import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import { log } from "../../../utils/logger.js";

export function checkEnv(requiredVars = []) {
  const missing = requiredVars.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    log.error({ missing }, "❌ Missing required environment variables");
    process.exit(1); // 🔥 Fatal exit
  }
  log.info("✅ All required environment variables are set");
}
