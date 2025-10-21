
// services/rss-feed-creator/rewrite-pipeline.js
import { parseStringPromise, Builder } from "xml2js";
import { info, error } from "#logger.js";
import { putText /*, uploadToR2 */ } from "../shared/utils/r2-client.js";
import { resolveModelRewriter } from "./utils/models.js";
import { shortenUrl } from "./utils/shortio.js";

const RSS_FEED_BUCKET = process.env.R2_BUCKET_RSS_FEEDS || "";
const R2_PUBLIC_BASE_URL = process.env.R2_PUBLIC_BASE_URL_RSS || "";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function isRecent(pubDate) {
  const d = new Date(pubDate || Date.now());
  if (isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() < ONE_DAY_MS;
}

export async function rewriteRSSFeeds(feedXml, options = {}) {
  const maxItemsPerFeed = Number(options.maxItemsPerFeed ?? process.env.MAX_ITEMS_PER_FEED ?? 20);
  const returnItemsOnly = Boolean(options.returnItemsOnly);

  try {
    if (typeof feedXml !== "string") {
      throw new Error("Expected raw XML string for feedXml");
    }
    const trimmed = feedXml.trim();
    if (!trimmed.startsWith("<")) {
      throw new Error("Invalid feed: does not start with XML tag");
    }

    const parsed = await parseStringPromise(trimmed);
    const channel = parsed?.rss?.channel?.[0];
    if (!channel) throw new Error("Invalid RSS: missing <channel>");
    const items = Array.isArray(channel.item) ? channel.item : [];

    const recent = items.filter((it) =>
      isRecent(it.pubDate?.[0] || it.updated?.[0] || it["atom:updated"]?.[0])
    );
    const limited = recent.slice(0, maxItemsPerFeed);

    const rewriter = resolveModelRewriter();

    const outItems = [];
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
          tone: "informative and engaging",
        });

        const text =
          typeof generated === "string" && generated.trim().length >= 250
            ? generated.trim().slice(0, 750)
            : (snippet || "").toString().trim().slice(0, 750);

        const shortLink = link ? await shortenUrl(link).catch(() => link) : "";

        outItems.push({
          title,
          description: text,
          link: shortLink || link,
          pubDate: item.pubDate?.[0] || new Date().toUTCString(),
        });
      } catch (e) {
        error("⚠️ Item rewrite failed — passing through original", { title, err: e.message });
        outItems.push(item);
      }
    }

    if (returnItemsOnly) {
      return { success: true, items: outItems };
    }

    const builder = new Builder();
    const xmlOut = builder.buildObject({
      rss: {
        $: { version: "2.0" },
        channel: {
          title: channel.title?.[0] || "Rewritten Feed",
          link: channel.link?.[0] || "",
          description: channel.description?.[0] || "",
          item: outItems,
        },
      },
    });

    // Flat R2 key
    const fileName = `feed-rewrite-${new Date().toISOString().replace(/[:.]/g, "-")}.xml`;

    // If your r2-client exposes uploadToR2, you can switch to it. putText is sufficient for flat keys.
    await putText(fileName, xmlOut);

    const publicUrl = R2_PUBLIC_BASE_URL ? `${R2_PUBLIC_BASE_URL}/${fileName}` : fileName;
    info("📤 Uploaded rewritten feed to R2", { fileName, publicUrl });

    return {
      success: true,
      fileName,
      publicUrl,
      counts: { total: items.length, recent: recent.length, rewritten: outItems.length },
    };
  } catch (e) {
    error("❌ RSS rewrite pipeline failed", { error: e.message });
    throw e;
  }
}

export default rewriteRSSFeeds;
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

    const result = await services/rss-feed-creator/bootstrap.js({
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
