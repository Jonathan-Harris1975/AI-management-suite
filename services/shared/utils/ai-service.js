// shared/utils/ai-service.js

import config from "../ai-config.js";
import { info, error } from "#logger.js";

// helper: normalize OpenRouter response
async function readOpenRouterResponse(res) {
  const data = await res.json().catch(() => ({}));

  // OpenRouter can reply either like OpenAI-style { choices: [{ message: { content } }]}
  // or anthropic-ish. We'll try common cases:
  if (data.choices && data.choices.length) {
    // OpenAI-style
    const choice = data.choices[0];
    if (choice.message && typeof choice.message.content === "string") {
      return choice.message.content.trim();
    }
    if (typeof choice.text === "string") {
      return choice.text.trim();
    }
  }

  // Claude-style via OpenRouter may come back in 'content' array
  if (Array.isArray(data.content) && data.content.length) {
    const firstBlock = data.content.find(
      b => b.type === "text" && typeof b.text === "string"
    );
    if (firstBlock) return firstBlock.text.trim();
  }

  // Fallback: dump whole thing
  return JSON.stringify(data);
}

/**
 * low-level request to a single model
 */
async function callSingleModel({
  model,
  mode,
  messages,
  prompt,
  maxTokens,
  temperature,
}) {
  const url = "https://openrouter.ai/api/v1/chat/completions";

  // Build body according to mode
  let body;
  if (mode === "chat") {
    // messages must be [{role, content}, ...]
    body = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    };
  } else {
    // prompt mode -> single-turn prompt becomes a user message to keep the API happy
    body = {
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: maxTokens,
      temperature,
    };
  }

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY || ""}`,
    "HTTP-Referer": process.env.APP_URL || "https://ai-management-suite.on.shiper.app",
    "X-Title": "AI Podcast Suite",
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
 * Public: resilientRequest(routeName, payload)
 * routeName: "intro" | "main" | "outro" | "compose" | "metadata"
 * payload:
 *   - for mode:"chat": { messages:[{role,content},...] }
 *   - for mode:"prompt": { prompt:"..." }
 */
export async function resilientRequest(routeName, payload = {}) {
  const routeCfg = config[routeName];
  if (!routeCfg) {
    throw new Error(`No model route defined for: ${routeName}`);
  }

  const {
    mode,
    models,
    maxTokens = 1000,
    temperature = 0.7,
  } = routeCfg;

  // Validate payload matches mode
  if (mode === "chat") {
    if (!Array.isArray(payload.messages)) {
      throw new Error(
        `compose expects {messages:[...]}, got ${JSON.stringify(payload)}`
      );
    }
  } else {
    if (typeof payload.prompt !== "string" || !payload.prompt.trim()) {
      throw new Error(
        `metadata expects {prompt:"..."}, got ${JSON.stringify(payload)}`
      );
    }
  }

  let lastErr = null;

  for (const model of models) {
    try {
      info("ai.call", { routeName, model });

      const text = await callSingleModel({
        model,
        mode,
        messages: payload.messages,
        prompt: payload.prompt,
        maxTokens,
        temperature,
      });

      if (text && typeof text === "string") {
        return text.trim();
      }
    } catch (err) {
      error("ai.call.fail", {
        routeName,
        model,
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
