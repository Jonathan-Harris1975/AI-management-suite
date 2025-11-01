// ============================================================
// 🧠 services/shared/utils/ai-service.js
// Resilient AI requester with dynamic routing + Script Generator Summary
// ============================================================
// - Respects your existing route→model mapping (ROUTE_MODELS / AI config)
// - Adds fallback for dynamic chunk routes: "scriptMain-*"
// - Logs chosen model per call: info("ai.route.model", { routeName, model })
// - Prints one end-of-session console summary (console-only)
// - Includes robust retry with exponential backoff
// - Provides two transport backends out-of-the-box:
//     - OpenRouter/OpenAI-compatible (via OPENROUTER_API_KEY / OPENAI_API_KEY)
//     - Google Gemini (via GEMINI_API_KEY)
// - Exports: default { resilientRequest }
// ============================================================

import { info, error as logError } from "#logger.js";

// ---------------------------------------------
// 🔧 Route→Model mapping
// If you already have a dynamic AI config, keep using it.
// You can override these with env or your own config loader.
// ---------------------------------------------
const ROUTE_MODELS = {
  // Script routes
  scriptIntro: process.env.AI_MODEL_SCRIPT_INTRO || process.env.AI_MODEL_DEFAULT || "gemini-1.5-pro",
  scriptMain: process.env.AI_MODEL_SCRIPT_MAIN  || process.env.AI_MODEL_DEFAULT || "gemini-1.5-pro",
  scriptOutro: process.env.AI_MODEL_SCRIPT_OUTRO|| process.env.AI_MODEL_DEFAULT || "gemini-1.5-pro",
  generateComposedEpisode: process.env.AI_MODEL_SCRIPT_COMPOSE || process.env.AI_MODEL_DEFAULT || "gemini-1.5-pro",

  // RSS rewriter (example)
  rssRewrite: process.env.AI_MODEL_RSS_REWRITE || process.env.AI_MODEL_DEFAULT || "gemini-1.5-pro",
};

// ---------------------------------------------
// 🧠 Session-scoped aggregation for summary
// ---------------------------------------------
const __aiRouteCallsBySession = new Map();

function __sessionKey(sessionIdLike) {
  if (!sessionIdLike) return "unknown";
  if (typeof sessionIdLike === "object") return sessionIdLike.sessionId || "unknown";
  return String(sessionIdLike);
}

function __recordAiRouteCall(sessionId, routeName, model) {
  const sid = __sessionKey(sessionId);
  if (!__aiRouteCallsBySession.has(sid)) __aiRouteCallsBySession.set(sid, []);
  __aiRouteCallsBySession.get(sid).push({ routeName, model });
}

function __printSessionSummaryIfEnd(sessionId, routeName) {
  const isEnd = routeName === "scriptOutro" || routeName === "generateComposedEpisode";
  if (!isEnd) return;

  const sid = __sessionKey(sessionId);
  const calls = __aiRouteCallsBySession.get(sid) || [];
  if (!calls.length) return;

  const header = `🧠 Script Generator Summary — ${sid}`;
  const sep = "────────────────────────────────────────────";
  const lines = calls.map(({ routeName, model }) => `${routeName.padEnd(18)}→ ${model}`);
  const body = [header, sep, ...lines, sep, `Total Calls: ${calls.length}`].join("\n");

  try {
    info(body);
  } catch {
    // eslint-disable-next-line no-console
    console.log(body);
  } finally {
    __aiRouteCallsBySession.delete(sid);
  }
}

// ---------------------------------------------
// 🚦 Model resolver with dynamic chunk fallback
// ---------------------------------------------
function resolveModelForRoute(routeName) {
  let model = ROUTE_MODELS[routeName];
  if (!model && routeName && routeName.startsWith("scriptMain-")) {
    model = ROUTE_MODELS["scriptMain"];
  }
  if (!model) {
    throw new Error(`No model route defined for: ${routeName}`);
  }
  return model;
}

// ---------------------------------------------
const DEFAULT_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS || 4096);
const DEFAULT_TEMPERATURE = Number(process.env.AI_TEMPERATURE || 0.7);
const DEFAULT_TOP_P = Number(process.env.AI_TOP_P || 1);
const MAX_RETRIES = Number(process.env.AI_MAX_RETRIES || 3);
const RETRY_BASE_MS = Number(process.env.AI_RETRY_BASE_MS || 800);

// ---------------------------------------------
// 🌐 Simple transport layer (OpenRouter/OpenAI & Gemini)
// ---------------------------------------------
async function callOpenAICompat({ model, messages, max_tokens, temperature, top_p, apiBase, apiKey }) {
  const base = apiBase || process.env.OPENROUTER_API_BASE || process.env.OPENAI_API_BASE || "https://openrouter.ai/api/v1";
  const key = apiKey || process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OpenRouter/OpenAI API key");

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
      "HTTP-Referer": process.env.SITE_URL || "https://jonathan-harris.online",
      "X-Title": "AI Podcast Suite",
    },
    body: JSON.stringify({ model, messages, max_tokens, temperature, top_p })
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI/OpenRouter ${res.status}: ${text}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content || "";
  return content;
}

async function callGemini({ model, messages, max_tokens, temperature, top_p }) {
  // We collapse messages to a single system-like prompt for Gemini
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Missing GEMINI_API_KEY");
  const prompt = (messages || []).map(m => m.content).join("\n\n");

  // Gemini REST (v1beta) text generation
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;

  const payload = {
    contents: [{ parts: [{ text: prompt }]}],
    generationConfig: {
      temperature,
      topP: top_p,
      maxOutputTokens: max_tokens,
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${text}`);
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text;
}

function pickTransport(model) {
  // heuristic: if model string includes 'gpt' or 'openai', use OpenAI compat; if includes 'gemini', use Gemini
  const m = (model || "").toLowerCase();
  if (m.includes("gemini")) return callGemini;
  return callOpenAICompat;
}

// ---------------------------------------------
// ⏱️ Backoff helper
// ---------------------------------------------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------
// 🔁 Resilient Request (exported)
// ---------------------------------------------
export async function resilientRequest(routeName, {
  sessionId,
  section,
  messages,
  model: overrideModel,
  max_tokens = DEFAULT_MAX_TOKENS,
  temperature = DEFAULT_TEMPERATURE,
  top_p = DEFAULT_TOP_P,
  apiBase,
  apiKey,
} = {}) {
  const model = overrideModel || resolveModelForRoute(routeName);

  // Per-call model log
  try { info("ai.route.model", { routeName, model }); } catch {}

  // Record for session summary
  try { __recordAiRouteCall(sessionId, routeName, model); } catch {}

  const transport = pickTransport(model);

  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const content = await transport({ model, messages, max_tokens, temperature, top_p, apiBase, apiKey });
      // If this is end-of-orchestration route, print summary once
      try { __printSessionSummaryIfEnd(sessionId, routeName); } catch {}
      return content;
    } catch (e) {
      lastErr = e;
      const wait = RETRY_BASE_MS * Math.pow(2, attempt);
      logError("ai.request.retry", { routeName, model, attempt: attempt + 1, wait, message: e?.message });
      await sleep(wait);
    }
  }

  // After retries fail
  try { __printSessionSummaryIfEnd(sessionId, routeName); } catch {}
  throw lastErr || new Error("AI request failed");
}

export default { resilientRequest };
