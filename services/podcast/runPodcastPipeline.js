// ============================================================
// 🎙️ Podcast Pipeline Orchestrator (Full Flow)
// ============================================================

import { info, error } from "#logger.js";
import { orchestrateScript } from "../script/utils/orchestrator.js";
import { orchestrateTTS } from "../tts/utils/orchestrator.js";
import { generateArtwork } from "../artwork/utils/generateArtwork.js";
import { mergeAudio } from "../merge/utils/mergeAudio.js";

// ------------------------------------------------------------
// 🧩 Helper
// ------------------------------------------------------------

function normalizeSessionId(input) {
  return typeof input === "object" && input.sessionId ? input.sessionId : input;
}

// ------------------------------------------------------------
// 🧠 Main Pipeline
// ------------------------------------------------------------

export async function runPodcastPipeline(session) {
  const sessionId = normalizeSessionId(session);
  info({ sessionId }, "🎙️ Podcast pipeline starting");

  try {
    // --------------------------------------------------------
    // 1️⃣ Script generation + save to R2
    // --------------------------------------------------------
    info({ sessionId }, "🧩 Script orchestration started");
    await orchestrateScript(sessionId);

    // --------------------------------------------------------
    // 2️⃣ TTS generation (Gemini / Google)
    // --------------------------------------------------------
    info({ sessionId }, "🔊 Starting TTS orchestration");
    await orchestrateTTS(sessionId);

    // --------------------------------------------------------
    // 3️⃣ Artwork generation
    // --------------------------------------------------------
    info({ sessionId }, "🎨 Generating episode artwork");
    await generateArtwork(sessionId);

    // --------------------------------------------------------
    // 4️⃣ Merge all audio parts
    // --------------------------------------------------------
    info({ sessionId }, "🎧 Starting audio merge");
    await mergeAudio(sessionId);

    info({ sessionId }, "✅ Podcast pipeline completed successfully");
    return { ok: true, sessionId };
  } catch (err) {
    error({ sessionId, err: err.message }, "💥 Podcast pipeline failed");
    throw err;
  }
}

export default runPodcastPipeline;
