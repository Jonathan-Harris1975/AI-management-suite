// ============================================================
// 🎙️ Podcast Pipeline Orchestrator (Path-Safe, Robust Imports)
// ============================================================

import { info, warn, error } from "#logger.js";

// -------------------------------
// Helpers
// -------------------------------
function normalizeSessionId(input) {
  return typeof input === "object" && input?.sessionId ? input.sessionId : input;
}

async function tryImport(candidates = [], pick) {
  for (const p of candidates) {
    try {
      const m = await import(p);
      const picked =
        (typeof pick === "function" ? pick(m) : null) ??
        m.default ??
        m;

      if (typeof picked === "function") {
        info({ path: p }, "🔗 Resolved module");
        return picked;
      }

      // If it exports an object with the named function
      if (pick && typeof pick === "string" && typeof m[pick] === "function") {
        info({ path: p, named: pick }, "🔗 Resolved named export");
        return m[pick];
      }
    } catch (e) {
      // silent fail & continue to next candidate
    }
  }
  return null;
}

// -------------------------------
// Dynamic resolvers
// -------------------------------
async function loadOrchestrateScript() {
  // Must end up with a function: orchestrateScript(sessionId)
  const mod = await tryImport(
    [
      "../script/utils/orchestrator.js",
      "../script/orchestrator.js",
      "../script/routes/orchestrator.js",
    ],
    (m) => m.orchestrateScript || m.default
  );

  if (!mod) throw new Error("Missing script orchestrator module (orchestrateScript)");
  return mod;
}

async function loadOrchestrateTTS() {
  // Must end up with a function: orchestrateTTS(sessionId)
  const mod = await tryImport(
    [
      "../tts/utils/orchestrator.js",
      "../tts/orchestrator.js",
      "../tts/routes/orchestrator.js",
    ],
    (m) => m.orchestrateTTS || m.default
  );

  if (!mod) throw new Error("Missing TTS orchestrator module (orchestrateTTS)");
  return mod;
}

async function loadGenerateArtwork() {
  // Prefer a callable generateArtwork(sessionId).
  // If only a router is exported (Express route), we skip gracefully.
  const mod = await tryImport(
    [
      "../artwork/routes/generateArtwork.js",
      "../artwork/utils/generateArtwork.js",
      "../artwork/generateArtwork.js",
    ],
    (m) => m.generateArtwork || m.default
  );

  if (!mod) {
    warn("🎨 Artwork step unavailable (no generateArtwork function found) — skipping.");
    return async () => {
      /* no-op */
    };
  }
  return mod;
}

async function loadMergeAudio() {
  // Must end up with a function: mergeAudio(sessionId)
  const mod = await tryImport(
    [
      "../merge/utils/mergeAudio.js",
      "../merge/routes/mergeAudio.js",
      "../merge/mergeAudio.js",
      // Absolute fallback if merge lives alongside podcast service:
      "./mergeAudio.js",
    ],
    (m) => m.mergeAudio || m.default
  );

  if (!mod) {
    warn("🎧 Merge step unavailable (no mergeAudio function found) — skipping.");
    return async () => {
      /* no-op */
    };
  }
  return mod;
}

// -------------------------------
/** Run full podcast pipeline */
export async function runPodcastPipeline(session) {
  const sessionId = normalizeSessionId(session);
  info({ sessionId }, "🎙️ Podcast pipeline starting");

  try {
    const orchestrateScript = await loadOrchestrateScript();
    const orchestrateTTS = await loadOrchestrateTTS();
    const generateArtwork = await loadGenerateArtwork();
    const mergeAudio = await loadMergeAudio();

    // 1) Script
    info({ sessionId }, "🧩 Script orchestration started");
    await orchestrateScript(sessionId);

    // 2) TTS
    info({ sessionId }, "🔊 Starting TTS orchestration");
    await orchestrateTTS(sessionId);

    // 3) Artwork (optional)
    info({ sessionId }, "🎨 Generating episode artwork (if available)");
    await generateArtwork(sessionId);

    // 4) Merge (optional)
    info({ sessionId }, "🎧 Starting audio merge (if available)");
    await mergeAudio(sessionId);

    info({ sessionId }, "✅ Podcast pipeline completed successfully");
    return { ok: true, sessionId };
  } catch (err) {
    error({ sessionId, error: err?.message }, "💥 Podcast pipeline failed");
    throw err;
  }
}

export default runPodcastPipeline;
