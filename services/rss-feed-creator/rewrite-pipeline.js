import fs from "fs";
import path from "path";
import { parseStringPromise, Builder } from "xml2js";
import { info, error } from "../../shared/utils/logger.js";
import { uploadFileToR2 } from "../../shared/utils/r2-client.js";
import { resolveModelRewriter } from "./utils/models.js";
import { shortenUrl } from "./utils/shortio.js";

const RSS_FEED_BUCKET = process.env.R2_BUCKET_RSS_FEEDS;
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL_RSS;

export async function rewriteRSSFeeds(feedContent, options = {}) {
  try {
    info("📰 Starting RSS feed rewrite pipeline...");

    if (!feedContent) throw new Error("No RSS feed content provided");
    if (!feedContent.trim().startsWith("<")) {
      throw new Error("Invalid feed: does not start with XML tag");
    }

    const feed = await parseStringPromise(feedContent);
    const channel = feed?.rss?.channel?.[0];
    if (!channel?.item) throw new Error("No RSS items found in feed");

    const items = channel.item;
    const rewriter = resolveModelRewriter();

    const rewrittenItems = [];

    for (const item of items) {
      const title = item.title?.[0] || "";
      const snippet = item.description?.[0] || "";
      const link = item.link?.[0] || "";

      try {
        const rewrittenText = await rewriter({ title, snippet });
        const shortLink = await shortenUrl(link);

        rewrittenItems.push({
          title,
          description: rewrittenText || snippet,
          link: shortLink,
          pubDate: item.pubDate?.[0] || new Date().toUTCString(),
        });
      } catch (err) {
        error("⚠️ Rewrite failed for item", { title, err: err.message });
        rewrittenItems.push(item);
      }
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

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `feed-rewrite-${timestamp}.xml`;
    const tempPath = path.join("/tmp", fileName);

    fs.writeFileSync(tempPath, rewrittenFeed);
    info(`✅ RSS feed rewritten successfully (${rewrittenItems.length} items)`);

    const result = await uploadFileToR2({
      bucket: RSS_FEED_BUCKET,
      key: fileName,
      filePath: tempPath,
    });

    const publicUrl = `${R2_PUBLIC_BASE_URL}/${fileName}`;
    info("📤 Uploaded rewritten feed to R2", { publicUrl });

    return {
      success: true,
      fileName,
      itemCount: rewrittenItems.length,
      publicUrl,
      r2Result: result,
    };
  } catch (err) {
    error("❌ RSS rewrite pipeline failed", { error: err.message });
    throw err;
  }
}

export default rewriteRSSFeeds;
