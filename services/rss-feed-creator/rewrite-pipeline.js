// services/script/utils/rewrite-pipeline.js

import { RSS_PROMPTS } from "./rss-prompts.js";
import { stripHtml } from "../../shared/utils/html.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";

export async function rewriteFeedItems(siteTitle, items, sessionId = "rss") {
  const messagesList = items
    .map(item => messagesForItem(siteTitle, item))
    .filter(Boolean); // Remove nulls

  console.log(`🧩 Rewriting ${messagesList.length} feed items via AI model...`);

  const rewrittenItems = await Promise.all(
    messagesList.map((messages, index) =>
      resilientRequest(messages, {
        sessionId: `${sessionId}-item${index + 1}`,
        section: "rssRewrite",
        model: "chatgpt"
      })
    )
  );

  return rewrittenItems;
}

function messagesForItem(siteTitle, item) {
  const title = stripHtml(item.title || "").trim();
  const summary =
    stripHtml(item.content) ||
    stripHtml(item.contentSnippet) ||
    "";

  if (!title || !summary) {
    console.warn("⚠️ Skipping feed item due to missing title or content.");
    return null;
  }

  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: USER_ITEM({
        site: siteTitle,
        title,
        summary,
        url: item.link || "https://example.com",
      }),
    },
  ];
}
