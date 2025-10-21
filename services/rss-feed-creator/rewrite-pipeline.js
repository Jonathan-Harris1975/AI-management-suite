// services/rss-feed-creator/rewrite-pipeline.js
import { parseStringPromise, Builder } from "xml2js";
import { info, error } from "#logger.js";
import { putText } from "../shared/utils/r2-client.js";
import { resolveModelRewriter } from "./utils/models.js";
import { shortenUrl } from "./utils/shortio.js";

const RSS_FEED_BUCKET = process.env.R2_BUCKET_RSS_FEEDS || "";
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL_RSS || "";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Utility: check if an item is recent (within 24h)
 */
function isRecent(pubDate) {
  const d = new Date(pubDate || Date.now());
  if (isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() < ONE_DAY_MS;
}

/**
 * 🧠 Rewrite RSS feeds using the configured AI model, then upload to R2
 * @param {string} feedXml - Raw RSS XML string
 * @param {Object} [options]
 * @param {string} [options.fileName] - Optional target file name in R2
 * @param {number} [options.maxItemsPerFeed] - Max items per feed
 * @returns {Promise<Object>} Summary with rewritten feed + upload result
 */
export async function runRewritePipeline(feedXml, options = {}) {
  const maxItemsPerFeed = Number(
    options.maxItemsPerFeed ?? process.env.MAX_ITEMS_PER_FEED ?? 20
  );
  const fileName = options.fileName || `rewritten-${Date.now()}.xml`;

  try {
    if (typeof feedXml !== "string" || !feedXml.trim().startsWith("<")) {
      throw new Error("Invalid RSS feed XML input");
    }

    const parsed = await parseStringPromise(feedXml.trim());
    const channel = parsed?.rss?.channel?.[0];
    if (!channel) throw new Error("Invalid RSS: missing <channel>");

    const items = Array.isArray(channel.item) ? channel.item : [];
    const recent = items.filter((it) =>
      isRecent(it.pubDate?.[0] || it.updated?.[0] || it["atom:updated"]?.[0])
    );
    const limited = recent.slice(0, maxItemsPerFeed);

    const rewriter = resolveModelRewriter();
    const rewrittenItems = [];

    info(`🧩 Rewriting ${limited.length} recent feed items via AI model...`);

    for (const item of limited) {
      const title = item.title?.[0] || "";
      const snippet = item.description?.[0] || item.summary?.[0] || "";
      const link = item.link?.[0] || "";

      try {
        const generated = await rewriter({
          title,
          snippet,
          minLength: 250,
          maxLength: 750,
          tone: "informative",
        });

        const shortLink = await shortenUrl(link);
        rewrittenItems.push({
          title: generated.title ?? title,
          description: generated.body ?? snippet,
          link: shortLink || link,
          pubDate: item.pubDate?.[0] || new Date().toUTCString(),
        });
      } catch (err) {
        error("⚠️ Failed to rewrite an item", { err: err.message });
      }
    }

    // --- Build rewritten feed ---
    const builder = new Builder({ cdata: true });
    const rewrittenFeed = builder.buildObject({
      rss: {
        $: { version: "2.0" },
        channel: {
          ...channel,
          item: rewrittenItems.map((i) => ({
            title: i.title,
            description: i.description,
            link: i.link,
            pubDate: i.pubDate,
          })),
        },
      },
    });

    // --- Upload to R2 ---
    info("☁️ Uploading rewritten feed to R2...");
    const r2Result = await putText(RSS_FEED_BUCKET, fileName, rewrittenFeed);

    const publicUrl = R2_PUBLIC_BASE_URL
      ? `${R2_PUBLIC_BASE_URL}/${fileName}`
      : fileName;

    info("📤 Uploaded rewritten feed", { publicUrl });

    return {
      success: true,
      fileName,
      publicUrl,
      r2Result,
      counts: {
        total: items.length,
        recent: recent.length,
        rewritten: rewrittenItems.length,
      },
    };
  } catch (e) {
    error("💥 RSS rewrite pipeline failed", { error: e.stack });
    throw e;
  }
}

export default runRewritePipeline;
