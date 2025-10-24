import { info, error } from "#logger.js";
import aiConfig from "./ai-config.js";

// low-level OpenRouter call
async function callModelOnce({ model, apiKey, prompt, temperature }) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": process.env.APP_URL || "https://ai-management-suite.on.shiper.app",
      "X-Title": "AI Podcast Suite",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "You are a helpful, high-quality longform writing assistant." },
        { role: "user", content: prompt }
      ],
      temperature,
      max_tokens: 2000,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`${res.status} ${res.statusText} — ${errText}`);
  }

  const data = await res.json();
  // OpenAI-style
  if (data?.choices?.[0]?.message?.content) {
    return data.choices[0].message.content.trim();
  }
  // Anthropic-style pass-through from OpenRouter
  if (Array.isArray(data?.content)) {
    const block = data.content.find(b => b.type === "text");
    if (block?.text) return block.text.trim();
  }

  return JSON.stringify(data);
}

// exported helper with fallback
export async function callLLMText({ route, prompt }) {
  const routeDef = aiConfig.routeModels[route];
  if (!routeDef) {
    throw new Error(`No route config for ${route}`);
  }

  const { models, temperature } = routeDef;

  let lastErr;
  for (const modelKey of models) {
    const modelDef = aiConfig.models[modelKey];
    if (!modelDef?.name || !modelDef?.apiKey) {
      continue;
    }

    try {
      info("ai.call", { route, model: modelDef.name });
      const out = await callModelOnce({
        model: modelDef.name,
        apiKey: modelDef.apiKey,
        prompt,
        temperature,
      });
      if (out && typeof out === "string") return out;
    } catch (err) {
      lastErr = err;
      error("ai.call.fail", {
        route,
        model: modelDef?.name,
        err: err.message,
      });
    }
  }

  throw new Error(
    `All models failed for route '${route}'. Last error: ${lastErr?.message || "unknown"}`
  );
  } 
