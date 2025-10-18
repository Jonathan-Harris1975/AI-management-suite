import { log } from "../utils/logger.js";
import { request } from "undici";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";

const MODELS = {
  google:   { key: process.env.OPENROUTER_API_KEY_GOOGLE,   model: "google/gemini-2.0-flash-001" },
  chatgpt:  { key: process.env.OPENROUTER_API_KEY_CHATGPT,  model: "openai/gpt-4o-mini" },
  deepseek: { key: process.env.OPENROUTER_API_KEY_DEEPSEEK, model: "deepseek/deepseek-chat" },
  anthropic:{ key: process.env.OPENROUTER_KEY_ANTHROPIC,    model: "anthropic/claude-sonnet-4.5" },
  meta:     { key: process.env.OPENROUTER_API_KEY_META,     model: "meta-llama/llama-4-scout" }
};

const ORDER = ["chatgpt","google","deepseek","anthropic","meta"];

export async function rewriteWithFallback(prompt){
  const ref = process.env.APP_URL || "https://example.com";
  const title = process.env.APP_TITLE || "RSS Service";

  for (const id of ORDER){
    const cfg = MODELS[id];
    if (!cfg?.key) { log.warn({id}, "⏭️ Missing key, skipping model"); continue; }
    try{
      const body = {
        model: cfg.model,
        messages: [{ role: "user", content: prompt }]
      };
      const { body: res } = await request(OPENROUTER_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${cfg.key}`,
          "HTTP-Referer": ref,
          "X-Title": title
        },
        body: JSON.stringify(body)
      });
      const json = await res.json();
      const text = json?.choices?.[0]?.message?.content;
      if (text) return text;
      throw new Error("empty response");
    }catch(e){
      log.warn({ id, err: String(e) }, "Model failed, moving to next");
    }
  }
  throw new Error("All OpenRouter models failed");
}
