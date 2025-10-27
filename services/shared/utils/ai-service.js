// shared/utils/ai-service.js
import config from "./ai-config.js";
import { info, error } from "#logger.js";

// normalize OpenRouter response
async function readOpenRouterResponse(res) {
  ...
}

async function callSingleModel({ modelKey, mode, messages, prompt, maxTokens, temperature }) {
  ...
}

// ✅ FIXED ENTRYPOINT
export async function resilientRequest(input, payload = {}) {
  let routeName;
  let effectivePayload = payload;

  if (typeof input === "string") {
    routeName = input;
  } else if (typeof input === "object" && input.routeName) {
    routeName = input.routeName;
    effectivePayload = input;
  } else {
    throw new Error(`Invalid call to resilientRequest(): ${typeof input}`);
  }

  const routeCfg = config.routeModels[routeName];
  if (!routeCfg) throw new Error(`No model route defined for: ${routeName}`);

  const { temperature, timeout } = config.commonParams;
  const mode = effectivePayload.messages ? "chat" : "prompt";
  const maxTokens = 1200;

  let lastErr = null;

  for (const modelKey of routeCfg) {
    try {
      info("ai.call", { routeName, model: modelKey });
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
      error("ai.call.fail", { routeName, model: modelKey, err: err.message });
      lastErr = err;
    }
  }

  throw new Error(
    `All models failed for route '${routeName}'. Last error: ${lastErr?.message || "unknown"}`
  );
}

export default { resilientRequest };
