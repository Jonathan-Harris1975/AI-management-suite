// services/script/utils/orchestrator.js
// Central orchestration helper used by routes/script-orchestrate.js
// Calls the existing /script/* endpoints in-process via HTTP so that
// intro/main/outro can persist their own temp data exactly as they do today.

import { info, error } from "#logger.js";

/**
 * Resolve base URL for internal calls.
 * - APP_URL (preferred) e.g. https://your-app.run
 * - else http://127.0.0.1:PORT
 */
function getBaseUrl() {
  const envUrl = process.env.APP_URL && String(process.env.APP_URL).trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  const port = process.env.PORT || 3000;
  return `http://127.0.0.1:${port}`;
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${text ? ` — ${text}` : ""}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Orchestrate the script pipeline by calling the already-mounted routes:
 *   POST /script/intro
 *   POST /script/main
 *   POST /script/outro
 *   POST /script/compose
 *
 * These routes are responsible for writing/reading temp storage. We only
 * pass the sessionId/topic/date forward and check responses.
 */
export async function orchestrate({ sessionId, topic, date }) {
  const started = Date.now();
  const base = getBaseUrl();

  if (!sessionId) throw new Error("sessionId is required");
  info("script.start", { sessionId: { sessionId } });

  // Normalize payload all stages accept
  const payload = { sessionId, topic, date };

  try {
    // 1) Intro
    info("script.intro.call", { sessionId });
    await postJson(`${base}/script/intro`, payload).catch((e) => {
      error("script.intro.fail", { sessionId, error: e.message });
      throw new Error(`Failed intro (${e.message})`);
    });

    // 2) Main
    info("script.main.call", { sessionId });
    await postJson(`${base}/script/main`, payload).catch((e) => {
      error("script.main.fail", { sessionId, error: e.message });
      throw new Error(`Failed main (${e.message})`);
    });

    // 3) Outro
    info("script.outro.call", { sessionId });
    await postJson(`${base}/script/outro`, payload).catch((e) => {
      error("script.outro.fail", { sessionId, error: e.message });
      throw new Error(`Failed outro (${e.message})`);
    });

    // 4) Compose (reads temp created by the three steps)
    info("script.compose.call", { sessionId });
    const composeRes = await postJson(`${base}/script/compose`, payload).catch((e) => {
      error("script.compose.fail", { sessionId, error: e.message });
      throw new Error(`Failed compose (${e.message})`);
    });

    info("script.done", { sessionId, tookMs: Date.now() - started });
    return { ok: true, ...composeRes };
  } catch (e) {
    error("script.fail", { sessionId: { sessionId }, error: e.message });
    throw e;
  }
}

/**
 * Optional Express handler (if your route chooses to use it).
 * Usage in routes/script-orchestrate.js:
 *   router.post("/script/orchestrate", orchestrateHandler);
 */
export async function orchestrateHandler(req, res) {
  try {
    const { sessionId, topic, date } = req.body || {};
    const result = await orchestrate({ sessionId, topic, date });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}

export default { orchestrate, orchestrateHandler };
