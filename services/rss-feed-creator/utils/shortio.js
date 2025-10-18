import {s3, R2_BUCKETS, uploadBuffer, listKeys, getObjectAsText} from "../../shared/utils/r2-client.js";
// utils/shortio.js
import fetch from "node-fetch";
import { log } from "../../../utils/logger.js";

const API_KEY = process.env.SHORTIO_API_KEY;
const RAW_DOMAIN =
  (process.env.SHORTIO_DOMAIN || process.env.SHORTIO_HOST || "RSS-feeds.Jonathan-harris.online")
    .replace(/^https?:\/\//i, "")
    .trim();

export async function createShortLink(originalURL) {
  if (!API_KEY) {
    log.warn("⚠️ SHORTIO_API_KEY missing – returning original URL");
    return originalURL;
  }
  const body = {
    domain: RAW_DOMAIN,
    originalURL,
    allowDuplicates: true
  };

  const res = await fetch("https://api.short.io/links", {
    method: "POST",
    headers: {
      "Authorization": API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`short.io HTTP ${res.status}: ${text || res.statusText}`);
  }

  const data = await res.json();
  const shortUrl = data.shortURL || data.shortLink || data.secureShortURL;
  if (!shortUrl) throw new Error("short.io responded without a short URL field");
  return shortUrl;
}
