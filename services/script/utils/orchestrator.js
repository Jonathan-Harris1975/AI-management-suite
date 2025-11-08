
// services/script/utils/orchestrator.js
// Real orchestrator: generate intro/main/outro, compose, and upload

import { info, error } from "#logger.js";
import { generateIntro } from "../routes/generateIntro.js";
import { generateMain } from "../routes/generateMain.js";
import { generateOutro } from "../routes/generateOutro.js";
import { composeEpisode } from "../routes/composeScript.js";
import { uploadText, R2_BUCKETS } from "#shared/r2-client.js";

export async function orchestrateScript(sessionId, options = {}){
  try {
    info({ sessionId }, "🧩 Script orchestration start");

    const [intro, main, outro] = await Promise.all([
      generateIntro(sessionId, options),
      generateMain(sessionId, options),
      generateOutro(sessionId, options),
    ]);

    const composed = await composeEpisode({ intro, main, outro, sessionId, tone: options.tone || "neutral" });
    const text = composed.fullText || [intro, main, outro].filter(Boolean).join("\n\n");

    await uploadText(R2_BUCKETS.RAW_TEXT, `${sessionId}.txt`, text, "text/plain");
    info({ sessionId, bytes: text.length }, "✅ Script saved to R2");
    return { ok: true, sessionId, text, parts: { intro, main, outro }, meta: { tone: options.tone || "neutral" } };
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 Script orchestration failed");
    throw err;
  }
}

export default orchestrateScript;
