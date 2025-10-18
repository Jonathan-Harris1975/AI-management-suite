// RSS Feed Creator bootstrap – on-demand only (called by /api/rewrite)
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const log = (emoji, message, meta = null) => {
  const entry = { emoji, time: new Date().toISOString(), message };
  if (meta && Object.keys(meta).length) entry.meta = meta;
  process.stdout.write(JSON.stringify(entry) + "\n");
};

export default async function startFeedCreator() {
  log("🧩", "Loading RSS Feed Creator");

  // Try to auto-detect the correct util file (self-healing)
  const utilsDir = path.resolve("services/rss-feed-creator/utils");
  const candidates = [
    "feedGenerator.js",
    "feed-builder.js",
    "feedBuild.js",
    "rssFeed.js",
    "rss-generator.js"
  ];

  for (const file of candidates) {
    const full = path.join(utilsDir, file);
    if (fs.existsSync(full)) {
      try {
        const mod = await import(pathToFileURL(full).href);
        const run = mod.default || mod.generate || mod.start || mod.run;
        if (typeof run === "function") {
          await run();
          log("🧠", "Auto-resolved RSS util", { util: `utils/${file}` });
          return;
        } else {
          log("⚠️", "Found util but no runnable export", { util: `utils/${file}` });
        }
      } catch (err) {
        log("❌", "RSS util threw during execution", { util: `utils/${file}`, error: err?.message || String(err) });
        return;
      }
    }
  }

  // If we reach here, no known util exists. Do not fail hard; just log.
  log("⚠️", "No feed utility found, RSS Feed Creator idle");
}
