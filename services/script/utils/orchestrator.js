// services/script/utils/orchestrator.js
import { info, error } from "#logger.js";

// Import actual generator routes
import { generateIntro } from "../routes/intro.js";
import { generateMain } from "../routes/main.js";
import { generateOutro } from "../routes/outro.js";
import { composeEpisode } from "../routes/compose.js";

import { saveRawText } from "./rawTextSaver.js";
import { generateTranscript } from "./transcriptGenerator.js";
import { generateMeta } from "./metaGenerator.js";

export async function orchestrateEpisode(sessionId) {
  info(`🧩 Script orchestration started for ${sessionId}`);

  if (!sessionId) throw new Error("sessionId is required");

  try {
    // 1️⃣ Generate intro, main, outro
    const intro = await generateIntro(sessionId);
    const main = await generateMain(sessionId);
    const outro = await generateOutro(sessionId);

    // 2️⃣ Compose full episode text
    const composed = await composeEpisode({ intro, main, outro, sessionId });
    const fullText = composed.fullText || [intro, main, outro].join("\n\n");

    // 3️⃣ Save raw text to R2
    await saveRawText(sessionId, fullText);
    info(`🧾 Raw text saved for ${sessionId}`);

    // 4️⃣ Generate transcript
    await generateTranscript(sessionId, fullText);
    info(`💬 Transcript generated for ${sessionId}`);

    // 5️⃣ Generate metadata JSON
    const meta = await generateMeta(sessionId, fullText);
    info(`📄 Metadata created for ${sessionId}`);

    return { ok: true, sessionId, fullText, meta };
  } catch (err) {
    error("💥 Script orchestration failed", { sessionId, error: err.message });
    throw err;
  }
}

export default orchestrateEpisode;
