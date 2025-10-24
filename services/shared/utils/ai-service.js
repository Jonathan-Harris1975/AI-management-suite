// shared/utils/ai-service.js
import aiConfig from "../ai-config.js";
import { info, error } from "#logger.js";

/**
 * Normalize and extract text content from OpenRouter responses.
 * Handles OpenAI-style, Anthropic-style, and fallback JSON cases.
 */
async function readOpenRouterResponse(res) {
  const data = await res.json().catch(() => ({}));

  // --- OpenAI-style response ---
  if (data.choices && data.choices.length) {
    const choice = data.choices[0];
    if (choice.message?.content) return choice.message.content.trim();
    if (choice.text) return choice.text.trim();
  }

  // --- Anthropic / Claude-style response ---
  if (Array.isArray(data.content) && data.content.length) {
    const firstBlock = data.content.find(
      b => b.type === "text" && typeof b.text === "string"
    );
    if (firstBlock) return firstBlock.text.trim();
  }

  // --- Fallback: stringify everything ---
  return JSON.stringify(data);
}

/**
 * Call a single model using OpenRouter API.
 * Supports both "chat" and "prompt" modes.
 */
async function callSingleModel({
  vendor,
  model,
  apiKey,
  mode,
  messages,
  prompt,
  maxTokens,
  temperature,
}) {
  const url = "https://openrouter.ai/api/v1/chat/completions";

  // Build the body according to mode
  let body;
  if (mode === "chat") {
    body = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    };
  } else {
    // prompt mode -> wrap as single user message
    body = {
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
    };
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey || process.env.OPENROUTER_API_KEY || ""}`,
    "HTTP-Referer": process.env.APP_URL || "https://ai-management-suite.on.shiper.app",
    "X-Title": process.env.APP_TITLE || "AI Podcast Suite",
  };

  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`${res.status} ${res.statusText} — ${errTxt}`);
  }

  return readOpenRouterResponse(res);
}

/**
 * Resilient AI request with model fallback chain.
 *
 * @param {string} routeName - Route key from ai-config.routes (e.g. "intro", "compose", "metadata").
 * @param {object} payload - { messages:[...] } for chat mode, { prompt:"..." } for prompt mode.
 */
export async function resilientRequest(routeName, payload = {}) {
  const routeCfg = aiConfig.routes[routeName];
  if (!routeCfg) throw new Error(`No model route defined for: ${routeName}`);

  const { mode, models, maxTokens = 1000, temperature = 0.7 } = routeCfg;

  // Validate payload shape
  if (mode === "chat") {
    if (!Array.isArray(payload.messages)) {
      throw new Error(`Chat route "${routeName}" expects {messages:[...]}, got ${JSON.stringify(payload)}`);
    }
  } else if (mode === "prompt") {
    if (typeof payload.prompt !== "string" || !payload.prompt.trim()) {
      throw new Error(`Prompt route "${routeName}" expects {prompt:"..."}, got ${JSON.stringify(payload)}`);
    }
  }

  let lastErr = null;

  // Iterate through each model vendor fallback chain
  for (const vendorKey of models) {
    const vendor = aiConfig.models[vendorKey];
    if (!vendor) {
      error("ai.call.vendor.missing", { routeName, vendorKey });
      continue;
    }

    try {
      info("ai.call.start", { routeName, vendor: vendorKey, model: vendor.name });

      const text = await callSingleModel({
        vendor: vendorKey,
        model: vendor.name,
        apiKey: vendor.apiKey,
        mode,
        messages: payload.messages,
        prompt: payload.prompt,
        maxTokens,
        temperature,
      });

      if (text && typeof text === "string") {
        info("ai.call.success", { routeName, vendor: vendorKey });
        return text.trim();
      }
    } catch (err) {
      error("ai.call.fail", { routeName, vendor: vendorKey, err: err.message });
      lastErr = err;
      continue;
    }
  }

  throw new Error(
    `All models failed for route '${routeName}'. Last error: ${lastErr?.message || "unknown"}`
  );
}

export default { resilientRequest };
