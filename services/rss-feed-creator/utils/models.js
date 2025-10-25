// services/rss-feed-creator/utils/models.js
// Thin model runner for RSS rewriting.
// - We let rewrite-pipeline.js build the full messages array
//   (SYSTEM / USER_ITEM etc from rss-prompts.js)
// - We just call the AI via resilientRequest() with the correct route
//   configured in shared/utils/ai-config.js (routeModels.rssRewrite)
//
// NOTE: We intentionally do NOT import rss-prompts.js here anymore.
//       That avoids the old "RSS_PROMPTS is not a function" / bad import issues.

import { info, error } from "#logger.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";

/**
 * Call the model(s) for RSS rewriting using the fallback chain
 * defined for route "rssRewrite" in ai-config.js.
 *
 * @param {Array<{role:string, content:string}>} messages
 *   Conversation messages: system + user, already constructed.
 *
 * @returns {Promise<string>}
 *   We return the raw model text. The pipeline will parse it
 *   into { title, summary } using normalizeModelText(), etc.
 */
export async function resolveModelRewriter(messages = []) {
  try {
    info("rss.model.call", {
      route: "rssRewrite",
      messagesCount: Array.isArray(messages) ? messages.length : 0,
    });

    const out = await resilientRequest({ route: "rssRewrite", messages });

    // resilientRequest() returns model "content" as a string.
    // We do NOT parse here. Let rewrite-pipeline handle shape/validation.
    if (!out || typeof out !== "string") {
      return "";
    }
    return out.trim();
  } catch (err) {
    error("rss.model.fail", {
      route: "rssRewrite",
      err: err.message,
    });
    throw err;
  }
}

export default {
  resolveModelRewriter,
};
