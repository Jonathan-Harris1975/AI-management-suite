  // shared/utils/ai-service.js
// Unified AI call layer for all services (script, rss, artwork, podcast, etc.)
// Handles OpenRouter routing, fallback logic, and consistent error safety.

import { info, error } from "#logger.js";
import { aiConfig } from "../ai-config.js";

/**
 * Normalize an OpenRouter / OpenAI style response
 */
async function readOpenRouterResponse(res) {
  const data = await res.json().catch(() => ({}));

  // OpenAI-style response
  if (data.choices && data.choices.length) {
    const choice = data.choices[0];
    if (choice.message && typeof choice.message.content === "string") {
      return choice.message.content.trim();
    }
    if (typeof choice.text === "string") {
      return choice.text.trim();
    }
  }

  // Anthropic / Claude-like content array
  if (Array.isArray(data.content)) {
    const block = data.content.find(
      b => b.type === "text" && typeof b.text === "string"
    );
    if (block) return block.text.trim();
  }

  // Fallback
  return JSON.stringify(data);
}

/**
 * Low-level model caller
 */
async function callSingleModel({
  model,
  prompt,
  messages,
  mode = "prompt",
  maxTokens = 1200,
  temperature = 0.7,
}) {
  const url = "https://openrouter.ai/api/v1/chat/completions";

  // Construct body
  let body;
  if (mode === "chat" && Array.isArray(messages)) {
    body = { model, messages, max_tokens: maxTokens, temperature };
  } else if (mode === "prompt" && typeof prompt === "string") {
    body = {
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
      temperature,
    };
  } else {
    throw new Error(`Invalid payload for model ${model}: mode=${mode}`);
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY || ""}`,
    "HTTP-Referer": process.env.APP_URL || "https://ai-management-suite.on.shiper.app",
    "X-Title": process.env.APP_TITLE || "AI Podcast Suite",
  };

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`${res.status} ${res.statusText} — ${errTxt}`);
  }

  return readOpenRouterResponse(res);
}

/**
 * Resilient request with fallback through model list
 */
export async function resilientRequest(routeName, payload = {}) {
  const modelList = aiConfig.routeModels?.[routeName];
  if (!modelList) {
    throw new Error(`No model route defined for: ${routeName}`);
  }

  const { maxTokens = 1200, temperature = 0.7 } = aiConfig.commonParams || {};

  // Auto-detect mode
  // - If payload.prompt is string → prompt mode
  // - If payload.messages is array → chat mode
  // - rssRewrite and metadata always force prompt mode
  let mode = "prompt";
  if (Array.isArray(payload.messages)) mode = "chat";
  if (["rssRewrite", "metadata"].includes(routeName)) mode = "prompt";

  // Build prompt/messages normalization
  const prompt =
    typeof payload.prompt === "string"
      ? payload.prompt
      : Array.isArray(payload.messages)
      ? payload.messages.map(m => m.content).join("\n")
      : "";

  const messages = Array.isArray(payload.messages)
    ? payload.messages.filter(m => m?.content && typeof m.content === "string")
    : [{ role: "user", content: prompt }];

  if (!prompt && (!messages.length || !messages[0]?.content)) {
    throw new Error(
      `Invalid AI payload for ${routeName}: must include prompt or messages`
    );
  }

  let lastErr = null;

  for (const modelKey of modelList) {
    const modelObj = aiConfig.models?.[modelKey];
    const modelName = modelObj?.name || modelKey;

    try {
      info("ai.call", { service: "ai-podcast-suite", route: routeName, model: modelName });

      const text = await callSingleModel({
        model: modelName,
        prompt,
        messages,
        mode,
        maxTokens,
        temperature,
      });

      if (text && typeof text === "string" && text.trim()) {
        return text.trim();
      }
    } catch (err) {
      error("ai.call.fail", {
        service: "ai-podcast-suite",
        route: routeName,
        model: modelName,
        err: err.message,
      });
      lastErr = err;
      continue;
    }
  }

  throw new Error(
    `All models failed for route '${routeName}'. Last error: ${lastErr?.message || "unknown"}`
  );
}

/**
 * Simple helper wrapper for text-only routes
 */
export async function callLLMText({ route, prompt }) {
  if (!route) throw new Error("Missing route name in callLLMText()");
  if (!prompt || typeof prompt !== "string")
    throw new Error(`callLLMText expected string prompt for ${route}`);

  return resilientRequest(route, { prompt });
}

export default { resilientRequest, callLLMText };
