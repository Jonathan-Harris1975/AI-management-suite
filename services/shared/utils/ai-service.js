// ============================================================
// 🧠 services/shared/utils/ai-service.js
// Resilient AI requester (OpenRouter) — ai-config–driven
// ============================================================
//
// - Uses ./ai-config.js for ALL routing & provider selection
// - Dynamic fallback for chunk routes like "scriptMain-1"
// - Per-call logging: info("ai.route.model", { routeName, provider, model })
// - End-of-session console summary ("🧠 Script Generator Summary")
// - Provider failback chain as defined in ai-config.routeModels[routeKey]
// - Warm cache: remembers last successful provider per routeKey
//
// Env usage:
//   OPENROUTER_API_BASE
//   AI_MAX_TOKENS, AI_TEMPERATURE, AI_TOP_P
//   AI_MAX_RETRIES, AI_RETRY_BASE_MS, AI_TIMEOUT
// ============================================================

import aiConfig from "./ai-config.js";
import { info, error, debug as logError } from "#logger.js";
import fetch from "node-fetch";

// ---------------------------------------------
// 🔧 Config
// ---------------------------------------------
const OPENROUTER_BASE =
  process.env.OPENROUTER_API_BASE || "https://openrouter.ai/api/v1";
const ENDPOINT = `${OPENROUTER_BASE}/chat/completions`;

const DEFAULT_MAX_TOKENS = Number(process.env.AI_MAX_TOKENS ||
  4096);

const DEFAULT_TEMPERATURE = Number(
  process.env.AI_TEMPERATURE ??
    aiConfig?.commonParams?.temperature ??
    0.7
);

const DEFAULT_TIMEOUT_MS = Number(
  process.env.AI_TIMEOUT ??
    aiConfig?.commonParams?.timeout ??
    45000
);

const DEFAULT_TOP_P = Number(process.env.AI_TOP_P || 1);

const MAX_RETRIES = Number(process.env.AI_MAX_RETRIES || 2); // per provider
const RETRY_BASE_MS = Number(process.env.AI_RETRY_BASE_MS || 700);

// ---------------------------------------------
// 🧠 Session summary aggregation (console-only)
// ---------------------------------------------
const __aiRouteCallsBySession = new Map(); // sid -> [{ routeName, provider, model }]

function __sid(sessionIdLike) {
  if (!sessionIdLike) return "unknown";
  if (typeof sessionIdLike === "object") {
    return sessionIdLike.sessionId || "unknown";
  }
  return String(sessionIdLike);
}

function __record(sessionId, routeName, provider, model) {
  const sid = __sid(sessionId);
  if (!__aiRouteCallsBySession.has(sid)) {
    __aiRouteCallsBySession.set(sid, []);
  }
  __aiRouteCallsBySession.get(sid).push({ routeName, provider, model });
}

function __maybePrintSummary(sessionId, routeName) {
  const isEnd =
    routeName === "scriptOutro" ||
    routeName === "generateComposedEpisode";
  if (!isEnd) return;

  const sid = __sid(sessionId);
  const calls = __aiRouteCallsBySession.get(sid) || [];
  if (!calls.length) return;

  const header = `🧠 Script Generator Summary — ${sid}`;
  const sep = "────────────────────────────────────────────";
  const lines = calls.map(
    ({ routeName, provider }) => `${routeName.padEnd(18)}→ ${provider}`
  );
  const body = [header, sep, ...lines, sep, `Total Calls: ${calls.length}`].join(
    "\n"
  );

  info(body);
  __aiRouteCallsBySession.delete(sid);
}

// ---------------------------------------------
// ⚡ Warm cache: last-successful provider per routeKey
// ---------------------------------------------
const __lastSuccessProvider = new Map(); // routeKey -> providerId

// ---------------------------------------------
// 🧭 Resolve routeKey and provider chain from ai-config
// ---------------------------------------------
function resolveRouteKey(routeName) {
  if (aiConfig.routeModels[routeName]) return routeName;
  if (routeName && routeName.startsWith("scriptMain-")) {
    return "scriptMain";
  }
  // future dynamic aliases go here
  return routeName;
}

function getProviderChainForRoute(routeKey) {
  const chain = aiConfig?.routeModels?.[routeKey];
  if (!Array.isArray(chain) || chain.length === 0) {
    throw new Error(`No model route defined for: ${routeKey}`);
  }

  const cached = __lastSuccessProvider.get(routeKey);
  if (cached && chain.includes(cached)) {
    const rest = chain.filter((p) => p !== cached);
    return [cached, ...rest];
  }
  return chain;
}

function getProviderConfig(providerId) {
  const conf = aiConfig?.models?.[providerId];
  if (!conf?.name || !conf?.apiKey) return null;
  return conf;
}

// ---------------------------------------------
// 🌐 OpenRouter transport
// ---------------------------------------------
async function callOpenRouter({
  providerId,
  model,
  apiKey,
  messages,
  max_tokens,
  temperature,
  top_p,
  headers,
}) {
  const payload = {
    model,
    messages,
    max_tokens,
    temperature,
    top_p,
  };

  const reqHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    ...(aiConfig?.headers || {}),
    ...(headers || {}),
  };

  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(ENDPOINT, {
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
    const content = json?.choices?.[0]?.message?.content || "";
    return content;
  } finally {
    clearTimeout(to);
  }
}

// ---------------------------------------------
// ⏱️ Backoff helper
// ---------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------
// 🔁 Public API: resilientRequest
// ---------------------------------------------
export async function resilientRequest(
  routeName,
  {
    sessionId,
    section,
    messages,
    max_tokens = DEFAULT_MAX_TOKENS,
    temperature = DEFAULT_TEMPERATURE,
    top_p = DEFAULT_TOP_P,
    headers,
  } = {}
) {
  const routeKey = resolveRouteKey(routeName);
  const chain = getProviderChainForRoute(routeKey);

  let lastErr;

  for (const providerId of chain) {
    const provider = getProviderConfig(providerId);
    if (!provider) {
      logError("ai.provider.misconfigured", {
        routeName,
        routeKey,
        providerId,
      });
      continue;
    }

    // per-call log
    try {
      debug"ai.route.model", {
        routeName,
        routeKey,
        provider: providerId,
        model: provider.name,
      });
    } catch {}

    // retry loop per provider
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
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

        // record success for summary + warm cache
        try {
          __record(sessionId, routeName, providerId, provider.name);
        } catch {}
        __lastSuccessProvider.set(routeKey, providerId);

        // if end of orchestration, print summary
        try {
          __maybePrintSummary(sessionId, routeName);
        } catch {}

        return content;
      } catch (e) {
        lastErr = e;
        const wait = RETRY_BASE_MS * Math.pow(2, attempt);

        logError("ai.request.retry", {
          routeName,
          routeKey,
          provider: providerId,
          attempt: attempt + 1,
          wait,
          message: e?.message,
        });

        if (attempt < MAX_RETRIES) {
          await sleep(wait);
        }
      }
    }
    // move on to next provider in the chain
  }

  // end-of-run summary even on failure
  try {
    __maybePrintSummary(sessionId, routeName);
  } catch {}

  throw lastErr || new Error(`All providers failed for route: ${routeKey}`);
}

export default { resilientRequest };
