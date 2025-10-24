// services/script/utils/llmClient.js
import { info, error } from "#logger.js";

// Pick a single primary model for podcast script voice.
// You can still expose a fallback list if you want, but keep it local here.
const MODEL_CANDIDATES = [
  process.env.OPENROUTER_CHATGPT,
  process.env.OPENROUTER_GOOGLE,
  process.env.OPENROUTER_META,
].filter(Boolean);

// Build OpenRouter headers once
function buildHeaders(apiKey) {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${apiKey}`,
    "HTTP-Referer": process.env.APP_URL || "https://ai-management-suite.on.shiper.app",
    "X-Title": "Turing's Torch Script Generator",
  };
}

// Normalize OpenRouter response to plain text
async function readResponse(res) {
  const data = await res.json().catch(() => ({}));

  // OpenAI-style
  if (data?.choices?.[0]?.message?.content) {
    return data.choices[0].message.content.trim();
  }
  if (data?.choices?.[0]?.text) {
    return data.choices[0].text.trim();
  }

  // Anthropic-style passthrough block format
  if (Array.isArray(data.content)) {
    const txt = data.content
      .filter(b => b && b.type === "text" && typeof b.text === "string")
      .map(b => b.text.trim())
      .join("\n\n")
      .trim();
    if (txt) return txt;
  }

  // last resort
  return JSON.stringify(data);
}

/**
 * callLLM(messages)
 * messages = [{role:"system",content:"..."},{role:"user",content:"..."}]
 */
export async function callLLM(messages, opts = {}) {
  const temperature = opts.temperature ?? 0.7;
  const max_tokens = opts.maxTokens ?? 1500;

  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error("callLLM: messages[] required");
  }

  let lastErr;
  for (const model of MODEL_CANDIDATES) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!model || !apiKey) continue;

    try {
      info("llm.request", { model });
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: buildHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`${res.status} ${res.statusText} - ${body}`);
      }

      const out = await readResponse(res);
      if (typeof out === "string" && out.trim().length) {
        return out.trim();
      }

      throw new Error("Empty LLM output");
    } catch (err) {
      error("llm.request.fail", { model, err: err.message });
      lastErr = err;
      continue;
    }
  }

  throw new Error(
    lastErr
      ? `All podcast models failed. Last error: ${lastErr.message}`
      : "No usable model found for podcast script generation"
  );
}
