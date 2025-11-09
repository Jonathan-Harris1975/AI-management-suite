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
    // 1️⃣ Generate intro, main, outro
    const intro = await generateIntro(sessionId);
    const main = await generateMain(sessionId);
    const outro = await generateOutro(sessionId);

    // 2️⃣ Compose unified episode text
    const composed = await composeEpisode({ intro, main, outro, sessionId });

    // 3️⃣ Save composed text to R2 (correct bucket)
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
