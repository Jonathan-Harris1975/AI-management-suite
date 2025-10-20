import fs from "fs";
import path from "path";
import { info, error } from "../../../shared/utils/logger.js";

const ROOT = path.join(process.cwd(), "services", "rss-feed-creator");
const DATA_DIR = path.join(ROOT, "data");
const UTILS_DIR = path.join(ROOT, "utils");
const STATE_FILE = path.join(UTILS_DIR, "feed-state.json");
const ACTIVE_FILE = path.join(UTILS_DIR, "active-feeds.json");

function readList(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

export async function rotateFeeds({ maxFeeds = 5 } = {}) {
  try {
    if (!fs.existsSync(UTILS_DIR)) fs.mkdirSync(UTILS_DIR, { recursive: true });

    const feedsPath = path.join(DATA_DIR, "feeds.txt");
    const urlsPath = path.join(DATA_DIR, "urls.txt");

    const allFeeds = readList(feedsPath);
    const allSites = readList(urlsPath);

    let state = { feedIndex: 0, siteIndex: 0 };
    if (fs.existsSync(STATE_FILE)) {
      try {
        state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
      } catch {
        /* ignore */
      }
    }

    const feeds = [];
    for (let i = 0; i < Math.min(maxFeeds, allFeeds.length); i++) {
      const idx = (state.feedIndex + i) % allFeeds.length;
      feeds.push(allFeeds[idx]);
    }
    const newFeedIndex = (state.feedIndex + feeds.length) % Math.max(1, allFeeds.length);

    const site = allSites.length ? allSites[state.siteIndex % allSites.length] : null;
    const newSiteIndex = allSites.length ? (state.siteIndex + 1) % allSites.length : 0;

    const active = { feeds, site, timestamp: new Date().toISOString() };
    fs.writeFileSync(ACTIVE_FILE, JSON.stringify(active, null, 2));
    fs.writeFileSync(STATE_FILE, JSON.stringify({ feedIndex: newFeedIndex, siteIndex: newSiteIndex }, null, 2));

    info("🔁 Rotation complete", {
      feedsSelected: feeds.length,
      siteSelected: Boolean(site),
      nextFeedIndex: newFeedIndex,
      nextSiteIndex: newSiteIndex,
    });

    return { feeds, site };
  } catch (e) {
    error("💥 rotateFeeds error", { err: e.message });
    return { feeds: [], site: null };
  }
}
