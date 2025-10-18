// /services/rss-feed-creator/utils/ai-adapter.js
// Shared adapter for rewrite-pipeline.js (2025-10-13)
// Reuses model chain from /scripts/ai-config.js without podcast context.

import { fileURLToPath } from "node:url";
import path from "node:path";
import fetch from "node-fetch";
import { log } from "../../../shared/utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aiConfigPath = path.resolve(__dirname, "../../../scripts/ai-config.js");

let modelConfig;
try {
  ({ default: modelConfig } = await import(aiConfigPath));
  log("info", "✅ Loaded AI model configuration from /scripts/ai-config.js");
} catch (err) {
  log("error", "❌ Failed to import ai-config.js", { error: err.message });
  throw err;
}

/**
 * Calls OpenRouter with fallback models using ai-config.js model chain.
 */
export async function callRewriteModel(prompt) {
  for (const model of modelConfig.MODEL_CHAIN) {
    try {
      log("info", "🧠 Trying model", { model });
      const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });
      const data = await resp.json();
      if (data?.choices?.[0]?.message?.content) {
        log("info", "✅ Rewrite success", { model });
        return data.choices[0].message.content.trim();
      }
      throw new Error(`Empty response from ${model}`);
    } catch (err) {
      log("warn", "⚠️ Model failed, trying next", { model, error: err.message });
    }
  }

  throw new Error("All models in chain failed for rewrite prompt.");
}
