import { parseStringPromise, Builder } from "xml2js";
import { info, error } from "../../shared/utils/logger.js";
import { uploadToR2 } from "../../shared/utils/r2-client.js";
import { resolveModelRewriter } from "./utils/models.js";
import { shortenUrl } from "./utils/shortio.js";

const RSS_FEED_BUCKET = process.env.R2_BUCKET_RSS_FEEDS;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL_RSS;

function isRecent(pubDate) {
  const dt = new Date(pubDate || Date.now());
  return Date.now() - dt.getTime() < 24 * 60 * 60 * 1000;
}

export async function rewriteRSSFeeds(feedContent, options = {}) {
  const maxItemsPerFeed = Number(options.maxItemsPerFeed || process.env.MAX_ITEMS_PER_FEED || 20);
  const fileName =
    options.fileName || `feed-rewrite-${new Date().toISOString().replace(/[:.]/g, "-")}.xml`;
  const returnItemsOnly = Boolean(options.returnItemsOnly);

  try {
    info("📰 Starting RSS feed rewrite pipeline...");

    if (!feedContent) throw new Error("No RSS feed content provided");

    if (typeof feedContent !== "string") {
      throw new Error("Expected raw XML string for feedContent");
    }

    const trimmed = feedContent.trim();
    if (!trimmed.startsWith("<")) {
      throw new Error("Invalid feed: does not start with XML tag");
    }

    const feed = await parseStringPromise(trimmed);
    const channel = feed?.rss?.channel?.[0];
    if (!channel) throw new Error("Invalid RSS: missing <channel>");
    const items = Array.isArray(channel.item) ? channel.item : [];

    const recent = items.filter((it) => isRecent(it.pubDate?.[0] || it.updated?.[0]));
    const limited = recent.slice(0, maxItemsPerFeed);

    const rewriter = resolveModelRewriter();

    const rewrittenItems = [];
    for (const item of limited) {
      const title = item.title?.[0] || "";
      const snippet = item.description?.[0] || "";
      const link = item.link?.[0] || "";

      try {
        const text = await rewriter({
          title,
          snippet,
          minLength: 250,
          maxLength: 750,
          tone: "informative and engaging",
        });

        const normalized =
          typeof text === "string" && text.length >= 250
            ? text.slice(0, 750)
            : (snippet || "").slice(0, 750);

        const shortLink = await shortenUrl(link);

        rewrittenItems.push({
          title,
          description: normalized,
          link: shortLink || link,
          pubDate: item.pubDate?.[0] || new Date().toUTCString(),
        });
      } catch (e) {
        error("⚠️ Item rewrite failed — passing through original", { title, err: e.message });
        rewrittenItems.push(item);
      }
    }

    if (returnItemsOnly) {
      return { success: true, items: rewrittenItems };
    }

    const builder = new Builder();
    const rewrittenFeed = builder.buildObject({
      rss: {
        $: { version: "2.0" },
        channel: {
          title: channel.title?.[0] || "Rewritten Feed",
          link: channel.link?.[0] || "",
          description: channel.description?.[0] || "",
          item: rewrittenItems,
        },
      },
    });

    const result = await uploadToR2({
      bucket: RSS_FEED_BUCKET,
      key: fileName,
      body: rewrittenFeed,
    });

    const publicUrl = R2_PUBLIC_BASE_URL ? `${R2_PUBLIC_BASE_URL}/${fileName}` : fileName;
    info("📤 Uploaded rewritten feed to R2", { publicUrl });

    return {
      success: true,
      fileName,
      publicUrl,
      r2Result: result,
      counts: { total: items.length, recent: recent.length, rewritten: rewrittenItems.length },
    };
  } catch (e) {
    error("❌ RSS rewrite pipeline failed", { error: e.message });
    throw e;
  }
}

export default rewriteRSSFeeds;
