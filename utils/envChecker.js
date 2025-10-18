// /utils/envChecker.js
import { log } from "./logger.js";

/**
 * Validates required environment variables and logs the result.
 * Throws early if any are missing.
 */
export function validateEnv(requiredVars = []) {
  const missing = requiredVars.filter(v => !process.env[v] || String(process.env[v]).trim() === "");
  if (missing.length) {
    log.error({ missing }, "Missing required environment variables");
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
  log.info({ count: requiredVars.length }, "Environment variables validated successfully");
}