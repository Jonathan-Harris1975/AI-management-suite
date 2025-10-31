// services/shared/utils/ai-service.js
import config from "./ai-config.js";
import { info, error } from "#logger.js";

// ─────────────────────────────────────────────
// 🔍 Helper to normalize OpenRouter responses
// ─────────────────────────────────────────────
async function readOpenRouterResponse(res) {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${text}`);
  }

  try {
    const data = JSON.parse(text);
    return (
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      text
    ).trim();
  } catch {
    return text.trim();
  }
}

// ─────────────────────────────────────────────
// 🧠 Call a single model key
// ─────────────────────────────────────────────
async function callSingleModel({
  modelKey,
  mode = "prompt",
  messages,
  prompt,
  maxTokens = 1200,
  temperature = 0.7,
}) {
  const modelCfg = config.models[modelKey];
  if (!modelCfg?.apiKey || !modelCfg?.name) {
    throw new Error(`Model '${modelKey}' not properly configured`);
  }

  const body =
    mode === "chat"
      ? JSON.stringify({
          model: modelCfg.name,
          messages,
          max_tokens: maxTokens,
          temperature,
        })
      : JSON.stringify({
          model: modelCfg.name,
          prompt,
          max_tokens: maxTokens,
          temperature,
        });

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${modelCfg.apiKey}`,
      "Content-Type": "application/json",
      ...config.headers,
    },
    body,
  });

  return readOpenRouterResponse(res);
}

// ─────────────────────────────────────────────
// ⚙️ Resilient multi-model request handler
// (Supports both string + object call styles)
// ─────────────────────────────────────────────
export async function resilientRequest(input, payload = {}) {
  let routeName;
  let effectivePayload = payload;

  // Allow resilientRequest("intro", { prompt }) or resilientRequest({ routeName:"intro", prompt })
  if (typeof input === "string") {
    routeName = input;
  } else if (typeof input === "object" && input.routeName) {
    routeName = input.routeName;
    effectivePayload = input;
  } else {
    throw new Error(`Invalid call to resilientRequest(): ${typeof input}`);
  }

  const routeCfg = config.routeModels[routeName];
  if (!Array.isArray(routeCfg))
    throw new Error(`No model route defined for: ${routeName}`);

  const { temperature, timeout } = config.commonParams;
  const mode = effectivePayload.messages ? "chat" : "prompt";
  const maxTokens = 1200;
  let lastErr = null;

  for (const modelKey of routeCfg) {
    try {
      info("ai.call", { service: "ai-podcast-suite", routeName, model: modelKey });

      const result = await callSingleModel({
        modelKey,
        mode,
        messages: effectivePayload.messages,
        prompt: effectivePayload.prompt,
        maxTokens,
        temperature,
      });

      if (result) return result.trim();
    } catch (err) {
      error("ai.call.fail", {
        service: "ai-podcast-suite",
        routeName,
        model: modelKey,
        err: err.message,
      });
      lastErr = err;
    }
  }

  throw new Error(
    `All models failed for route '${routeName}'. Last error: ${
      lastErr?.message || "unknown"
    }`
  );
}

export default { resilientRequest };
