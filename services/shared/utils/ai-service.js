// ============================================================================
// 🧠 services/shared/utils/ai-service.js  — UPDATED FOR NEW SIGNATURE
// ============================================================================
// New signature:
//     resilientRequest({ routeName, sessionId, model, messages, ... })
//
// Fully compatible with updated models.js + orchestrator.js.
// Removes ALL routeName.startsWith crashes.
// Ensures routeName is ALWAYS a safe string.
// ============================================================================

import aiConfig from "./ai-config.js";
import { safeRouteLog } from "#logger.js";
import { info, error as logError } from "#logger.js";
import fetch from "node-fetch";

// ---------------------------------------------
// Helpers
// ---------------------------------------------
function safeRouteName(name) {
  if (!name) return "unknown";
  if (typeof name === "string") return name;
  try { return JSON.stringify(name); } catch { return String(name); }
}

function __sid(s) {
  if (!s) return "unknown";
  if (typeof s === "object") return s.sessionId || "unknown";
  return String(s);
}

// ---------------------------------------------
// Session route-log aggregation
// ---------------------------------------------
const __aiRouteCallsBySession = new Map();

function __record(sessionId, routeName, provider, model) {
  const sid = __sid(sessionId);
  const arr = __aiRouteCallsBySession.get(sid) || [];
  arr.push({ routeName, provider, model });
  __aiRouteCallsBySession.set(sid, arr);
}

function __maybePrintSummary(sessionId, routeName) {
  if (!["scriptOutro", "editorialPass"].includes(routeName)) return;

  const sid = __sid(sessionId);
  const calls = __aiRouteCallsBySession.get(sid) || [];
  if (!calls.length) return;

  const header = `🧠 Script Generator Summary — ${sid}`;
  const sep = "────────────────────────────────────────────";
  const lines = calls.map(c => `${c.routeName.padEnd(18)}→ ${c.provider}`);
  const body = [header, sep, ...lines, sep, `Total Calls: ${calls.length}`].join("\n");

  info(body);
  __aiRouteCallsBySession.delete(sid);
}

// ---------------------------------------------
// Provider chain helpers
// ---------------------------------------------
const __lastSuccessProvider = new Map();

function resolveRouteKey(routeName) {
  const name = safeRouteName(routeName);
  if (aiConfig.routeModels[name]) return name;
  if (name.startsWith("scriptMain-")) return "scriptMain";
  return name;
}

function getProviderChain(routeKey) {
  const chain = aiConfig.routeModels[routeKey];
  if (!Array.isArray(chain) || chain.length === 0) {
    throw new Error(`No model route defined for: ${routeKey}`);
  }
  const cached = __lastSuccessProvider.get(routeKey);
  if (cached && chain.includes(cached)) {
    return [cached, ...chain.filter(p => p !== cached)];
  }
  return chain;
}

function getProviderConfig(id) {
  const conf = aiConfig.models[id];
  if (!conf?.name || !conf?.apiKey) return null;
  return conf;
}

// ---------------------------------------------
// OpenRouter transport
// ---------------------------------------------
async function callOpenRouter({ providerId, model, apiKey, messages, max_tokens, temperature, top_p, headers }) {
  const payload = { model, messages, max_tokens, temperature, top_p };

  const reqHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(aiConfig.headers || {}),
    ...(headers || {}),
  };

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(`${process.env.OPENROUTER_API_BASE}/chat/completions`, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OpenRouter ${res.status}: ${text}`);
    }

    const json = await res.json();
    return json?.choices?.[0]?.message?.content || "";
  } finally {
    clearTimeout(to);
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------------------------------------------
// UPDATED RESILIENT REQUEST — NEW SIGNATURE
// ---------------------------------------------
export async function resilientRequest({
  routeName,
  sessionId,
  model,
  messages,
  max_tokens = Number(process.env.AI_MAX_TOKENS || 4096),
  temperature = Number(process.env.AI_TEMPERATURE || 0.7),
  top_p = Number(process.env.AI_TOP_P || 1),
  headers,
}) {
  const safeName = safeRouteName(routeName);
  const routeKey = resolveRouteKey(safeName);
  const chain = getProviderChain(routeKey);

  let lastErr;

  for (const providerId of chain) {
    const provider = getProviderConfig(providerId);
    if (!provider) continue;

    try {
      safeRouteLog({
        routeName: safeName,
        routeKey,
        provider: providerId,
        model: provider.name,
      });
    } catch {}

    for (let attempt = 0; attempt <= Number(process.env.AI_MAX_RETRIES || 2); attempt++) {
      try {
        const content = await callOpenRouter({
          providerId,
          model: provider.name,
          apiKey: provider.apiKey,
          messages,
          max_tokens,
          temperature,
          top_p,
          headers,
        });

        __record(sessionId, safeName, providerId, provider.name);
        __lastSuccessProvider.set(routeKey, providerId);

        __maybePrintSummary(sessionId, safeName);

        return content;
      } catch (e) {
        lastErr = e;
        const wait = Number(process.env.AI_RETRY_BASE_MS || 700) * Math.pow(2, attempt);

        logError("ai.request.retry", {
          routeName: safeName,
          routeKey,
          provider: providerId,
          attempt: attempt + 1,
          wait,
          message: e?.message,
        });

        if (attempt < Number(process.env.AI_MAX_RETRIES || 2)) {
          await sleep(wait);
        }
      }
    }
  }

  __maybePrintSummary(sessionId, safeName);

  throw lastErr || new Error(`All providers failed for route: ${routeKey}`);
}

export default { resilientRequest };
