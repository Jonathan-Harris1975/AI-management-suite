import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
import fs from "fs";
import { log } from "../../../utils/logger.js";

/**
 * Load and sanitize a list of URLs from a file.
 * - trims whitespace
 * - skips blanks & commented lines (#)
 * - validates with new URL()
 */
export function loadList(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"));

    const urls = [];
    for (const line of lines) {
      try {
        const u = new URL(line).href;
        urls.push(u);
      } catch {
        log.warn({ line, file }, "⚠️ Skipping invalid URL");
      }
    }

    log.info(
      { file, count: urls.length },
      `📖 Loaded ${urls.length} valid entries from ${file}`
    );
    return urls;
  } catch (err) {
    log.error({ file, err }, "❌ Failed to load list");
    return [];
  }
}
