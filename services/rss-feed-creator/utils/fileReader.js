// ============================================================
// 📁 File Reader Utility
// ============================================================
// Loads text files either from local data folder or Cloudflare R2.
// Designed to be import-safe and isolated from fetchFeeds.js.
// ============================================================

import fs from "fs";
import path from "path";
import { info, error , debug} from "#logger.js";
import { getObjectAsText } from "../../shared/utils/r2-client.js";

const R2_BUCKET = process.env.R2_BUCKET_RSS_FEEDS || "rss-feeds";

/**
 * Read text file from local filesystem or Cloudflare R2.
 * @param {string} filename - Name of the file to load.
 * @returns {Promise<string>} File content as UTF-8 text.
 */
export async function readLocalOrR2File(filename) {
  const localPath = path.resolve("services/rss-feed-creator/data", filename);

  // Try local file first
  if (fs.existsSync(localPath)) {
    debug("rss.fetchFeeds.local.hit", { file: filename });
    return fs.readFileSync(localPath, "utf-8");
  }

  // Fallback to R2 bucket
  try {
    const text = await getObjectAsText(R2_BUCKET, `data/${filename}`);
    debug("rss.fetchFeeds.r2.success", { bucket: R2_BUCKET, key: filename });
    return text;
  } catch (err) {
    error("rss.fetchFeeds.read.fail", { filename, err: err.message });
    return "";
  }
}
