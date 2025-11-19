// ============================================================
// 📡 Podcast RSS Feed Creator - Orchestrator
// ============================================================
//
// - Reads episode meta JSON from R2 bucket alias "meta"
// - Builds RSS XML
// - Uploads to R2 bucket alias "podcastRss"
// ============================================================

import { listObjects, getObject, putObject } from "#shared/r2-client.js";
import { info, warn, error } from "#logger.js";
import { generateFeedXML } from "./generateFeed.js";

const META_BUCKET_ALIAS = "meta";
const META_PREFIX = "podcast-meta/";
const RSS_BUCKET_ALIAS = "podcastRss";
const RSS_KEY = "turing-torch.xml";

export async function runRssFeedCreator() {
  info("🚀 Starting RSS feed generation");

  let objectList;
  try {
    objectList = await listObjects(META_BUCKET_ALIAS, META_PREFIX);
  } catch (err) {
    error("Failed to list meta objects", { error: err.message });
    throw err;
  }

  if (!Array.isArray(objectList) || objectList.length === 0) {
    warn("No metadata files found in meta bucket");
    return;
  }

  const metaFiles = objectList.filter((obj) =>
    obj.key ? obj.key.endsWith(".json") : false
  );

  if (metaFiles.length === 0) {
    warn("No .json metadata files found with podcast-meta/ prefix");
    return;
  }

  info("Found metadata files", { count: metaFiles.length });

  const episodes = [];

  for (const obj of metaFiles) {
    const key = obj.key;
    try {
      const buf = await getObject(META_BUCKET_ALIAS, key);
      const json = JSON.parse(buf.toString("utf-8"));
      episodes.push(json);
    } catch (err) {
      warn("Failed to parse meta file", { key, error: err.message });
    }
  }

  if (episodes.length === 0) {
    warn("No valid episode metadata parsed – RSS not generated");
    return;
  }

  let xml;
  try {
    xml = generateFeedXML(episodes);
  } catch (err) {
    error("Failed to generate RSS XML", { error: err.message });
    throw err;
  }

  try {
    await putObject(RSS_BUCKET_ALIAS, RSS_KEY, Buffer.from(xml, "utf-8"), {
      contentType: "application/rss+xml",
    });

    info("RSS feed uploaded successfully", {
      bucketAlias: RSS_BUCKET_ALIAS,
      key: RSS_KEY,
    });
  } catch (err) {
    error("Failed to upload RSS feed", { error: err.message });
    throw err;
  }
}

export default runRssFeedCreator;


_________
