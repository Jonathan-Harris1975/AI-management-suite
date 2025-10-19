// services/script/utils/orchestrator.js
// Unified orchestrator for the 4-stage podcast script pipeline
// Runs intro → main → outro → compose routes in sequence

import { info, error } from "#shared/logger.js";

const BASE_URL = process.env.INTERNAL_BASE_URL || "http://localhost:3000"; // works inside container
const SCRIPT_PATH = "/api/script"; // your route mount path

async function callRoute(route, sessionId) {
  const url = `${BASE_URL}${SCRIPT_PATH}/${route}`;
  const body = JSON.stringify({ sessionId });
  const headers = { "Content-Type": "application/json" };

  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    throw new Error(`Failed ${route} (${res.status} ${res.statusText})`);
  }
  return await res.json();
}

export async function runScriptOrchestrator(sessionId) {
  const started = Date.now();
  const log = (stage, meta) => info(`script.${stage}`, { sessionId, ...meta });

  try {
    log("start", {});

    // ── 1️⃣ Intro
    const intro = await callRoute("intro", sessionId);
    log("intro.done", { chars: intro?.length || 0 });

    // ── 2️⃣ Main
    const main = await callRoute("main", sessionId);
    log("main.done", { chars: main?.length || 0 });

    // ── 3️⃣ Outro
    const outro = await callRoute("outro", sessionId);
    log("outro.done", { chars: outro?.length || 0 });

    // ── 4️⃣ Compose (merges intro + main + outro)
    const composed = await callRoute("compose", sessionId);
    log("compose.done", { chunks: composed?.chunks?.length || 0 });

    const duration = Math.round((Date.now() - started) / 1000);
    log("done", { duration });

    return {
      ok: true,
      sessionId,
      chunks: composed.chunks,
      meta: composed.meta,
      duration,
    };
  } catch (err) {
    error("script.fail", { sessionId, error: err.message });
    return { ok: false, error: err.message };
  }
}
