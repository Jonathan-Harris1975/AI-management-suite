// services/script/utils/orchestrator.js
import { info, error } from "#logger.js";

// Import actual generator routes
import { generateIntro } from "../routes/intro.js";
import { generateMain } from "../routes/main.js";
import { generateOutro } from "../routes/outro.js";
import { composeEpisode } from "../routes/compose.js";

export async function orchestrateEpisode(sessionId) {
  info(`🧩 Script orchestration started for ${sessionId}`);

  if (!sessionId) throw new Error("sessionId is required");

  try {
    // 1️⃣ Generate intro, main, and outro scripts
    const intro = await generateIntro(sessionId);
    const main = await generateMain(sessionId);
    const outro = await generateOutro(sessionId);

    // 2️⃣ Compose the final script text
    const composed = await composeEpisode({ intro, main, outro, sessionId });
    const fullText = composed?.fullText || [intro, main, outro].join("\n\n");

    // 3️⃣ Log and return unified script object
    info(`📜 Script composition complete for ${sessionId}`);

    return {
      ok: true,
      sessionId,
      fullText,
      meta: {
        parts: {
          introLength: intro?.length || 0,
          mainLength: main?.length || 0,
          outroLength: outro?.length || 0,
        },
      },
    };
  } catch (err) {
    error("💥 Script orchestration failed", { sessionId, error: err.message });
    throw err;
  }
}

export default orchestrateEpisode;
