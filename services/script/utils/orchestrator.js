// services/script/utils/orchestrator.js

import { info, error } from "#logger.js";
import { generateIntro, generateMain, generateOutro } from "../utils/models.js";
import { composeEpisode } from "../routes/composeScript.js";
import { uploadText } from "#shared/r2-client.js";
import chunkText from "../utils/chunkText.js";
import { generateEpisodeMetaLLM } from "../utils/podcastHelper.js";

// ------------------------------------------------------------
// Main orchestrator function
// ------------------------------------------------------------
export async function orchestrateScript(sessionId) {
  const sid = sessionId || `TT-${Date.now()}`;
  info({ sessionId: sid }, "🧠 Orchestrate Script: start");

  try {
    const intro = await generateIntro(sid);
    const main = await generateMain(sid);
    const outro = await generateOutro(sid);

    const composed = await composeEpisode({ sessionId: sid, intro, main, outro });
    const fullText = composed?.fullText ?? [intro, main, outro].join("\n\n");

    const chunks = chunkText(fullText);
    const uploadedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      const key = `${sid}/chunks/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      await uploadText("rawtext", key, chunks[i], "text/plain");
      uploadedChunks.push(key);
    }

    await uploadText("transcript", `${sid}.txt`, fullText, "text/plain");

    const meta = await generateEpisodeMetaLLM(fullText, sid);
    if (meta) {
      const metaKey = `${sid}.json`;
      await uploadText("meta", metaKey, JSON.stringify(meta, null, 2), "application/json");
    }

    info({ sessionId: sid }, "✅ Script orchestration complete");
    return { ...composed, fullText, chunks: uploadedChunks, metadata: meta || {} };
  } catch (err) {
    error({ sessionId: sid, error: err?.message, stack: err?.stack }, "💥 Script orchestration failed");
    throw err;
  }
}

// ------------------------------------------------------------
// Backward-compatible alias + default
// ------------------------------------------------------------
export const orchestrateEpisode = orchestrateScript;
export default orchestrateScript;
