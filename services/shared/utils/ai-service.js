// ============================================================
// 🧠 AI Service Utility — Central Model Dispatcher
// ============================================================
//
// - Handles all AI model route calls across the suite
// - Provides a resilientRequest() wrapper with consistent logging
// - Registers all rss-feed-creator routes (rssRewrite + rssShortTitle)
// ============================================================

import { info, error } from "#logger.js";
import { rewriteArticle, generateShortTitle } from "../../services/rss-feed-creator/models.js";

// ============================================================
// 🔹 MODEL ROUTE MAP
// ============================================================
// Add new model routes here to register them for resilientRequest()

const MODEL_ROUTES = {
  rssRewrite: rewriteArticle,
  rssShortTitle: generateShortTitle, // ✅ Added route for short title generation
  // You can register additional model routes below as needed
};

// ============================================================
// 🔹 RESILIENT REQUEST HANDLER
// ============================================================
// This function wraps model calls with robust error handling and logs.
// It safely resolves model routes and handles transient AI API failures.

export async function resilientRequest(routeName, payload) {
  try {
    const route = MODEL_ROUTES[routeName];

    if (!route) {
      throw new Error(`No model route defined for: ${routeName}`);
    }

    // Each route is expected to return plain text or structured output
    const result = await route(payload);

    info("ai.call", {
      service: "ai-podcast-suite",
      routeName,
      model: "chatgpt", // adjust if using different OpenRouter models
    });

    return result;
  } catch (err) {
    error("ai.resilientRequest.fail", {
      service: "ai-podcast-suite",
      routeName,
      err: err.message,
    });
    throw err;
  }
}

// ============================================================
// 🔹 EXPORTS
// ============================================================

export { MODEL_ROUTES };
export default resilientRequest;
