// shared/utils/ai-service.js
import config from "./ai-config.js";
import { info, error } from "#logger.js";

// normalize OpenRouter response
async function readOpenRouterResponse(res) {
  const data = await res.json().catch(() => ({}));
  if (data.choices?.length) {
    const choice = data.choices[0];
    if (choice.message?.content) return choice.message.content.trim();
    if (choice.text) return choice.text.trim();
  }
  if (Array.isArray(data.content)) {
    const firstText = data.content.find(b => b.type === "text");
    if (firstText?.text) return firstText.text.trim();
  }
  return JSON.stringify(data);
}

async function callSingleModel({ modelKey, mode, messages, prompt, maxTokens, temperature }) {
  const modelConfig = config.models[modelKey];
  if (!modelConfig) throw new Error(`Unknown model alias: ${modelKey}`);

  const url = "https://openrouter.ai/api/v1/chat/completions";

  const body =
    mode === "chat"
      ? { model: modelConfig.name, messages, max_tokens: maxTokens, temperature }
      : {
          model: modelConfig.name,
          messages: [{ role: "user", content: prompt }],
          max_tokens: maxTokens,
          temperature,
        };

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${modelConfig.apiKey || process.env.OPENROUTER_API_KEY || ""}`,
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

export async function resilientRequest(routeName, payload = {}) {
  const routeCfg = config.routeModels[routeName];
  if (!routeCfg) throw new Error(`No model route defined for: ${routeName}`);

  const { temperature, timeout } = config.commonParams;
  const mode = payload.messages ? "chat" : "prompt";
  const maxTokens = 1200;

  let lastErr = null;

  for (const modelKey of routeCfg) {
    try {
      info("ai.call", { routeName, model: modelKey });
      const result = await callSingleModel({
        modelKey,
        mode,
        messages: payload.messages,
        prompt: payload.prompt,
        maxTokens,
        temperature,
      });
      if (result) return result.trim();
    } catch (err) {
      error("ai.call.fail", { routeName, model: modelKey, err: err.message });
      lastErr = err;
    }
  }

  throw new Error(
    `All models failed for route '${routeName}'. Last error: ${lastErr?.message || "unknown"}`
  );
}

export default { resilientRequest };
