// ============================================================
// 🧩 Script Orchestrator — Unified Script Generation for Podcast
// ============================================================

import { info, error } from "#logger.js";
import { generateIntro } from "../routes/generateIntro.js";
import { generateMain } from "../routes/generateMain.js";
import { generateOutro } from "../routes/generateOutro.js";
import { composeEpisode } from "../routes/composeScript.js";
import { uploadText } from "#shared/r2-client.js";

// ------------------------------------------------------------
// Main Orchestrator
// ------------------------------------------------------------
export async function orchestrateScript(sessionId) {
  info({ sessionId }, "🧩 Starting Script Orchestration...");

  try {
    const intro = await generateIntro(sessionId);
    const main = await generateMain(sessionId);
    const outro = await generateOutro(sessionId);

    const composed = await composeEpisode({ intro, main, outro, sessionId });

    // Save raw text to R2
    await uploadText(
      "rawtext",
      `${sessionId}.txt`,
      composed.fullText || "",
      "text/plain"
    );

    info({ sessionId }, "✅ Script orchestration complete.");
    return composed;
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 Script orchestration failed");
    throw err;
  }
}

export default orchestrateScript;
