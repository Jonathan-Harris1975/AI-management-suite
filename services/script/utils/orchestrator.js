// services/script/utils/orchestrator.js
// Updated to include episode number + env toggles for RSS metadata.
// Keeps same orchestration flow and integrates AWS Polly-friendly chunking.

import { info, error } from "#logger.js";
import { generateIntro, generateMain, generateOutro } from "../utils/models.js";
import { composeEpisode } from "../routes/composeScript.js";
import { uploadText } from "#shared/r2-client.js";
import chunkText from "../utils/chunkText.js";
import { generateEpisodeMetaLLM } from "../utils/podcastHelper.js";

export async function orchestrateScript(sessionId) {
  const sid = sessionId || `TT-${Date.now()}`;
  info({ sessionId: sid }, "🧠 Orchestrate Script: start");

  try {
    // Step 1 — Generate sections
    const intro = await generateIntro(sid);
    const main = await generateMain(sid);
    const outro = await generateOutro(sid);

    // Step 2 — Compose complete episode text
    const composed = await composeEpisode({ sessionId: sid, intro, main, outro });
    const fullText = composed?.fullText ?? [intro, main, outro].join("\n\n");

    // Step 3 — Chunk text for AWS Polly “natural”
    const chunks = chunkText(fullText);
    const uploadedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const key = `${sid}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      await uploadText("rawtext", key, chunks[i], "text/plain");
      uploadedChunks.push(key);
    }

    // Step 4 — Upload transcript
    await uploadText("transcript", `${sid}.txt`, fullText, "text/plain");

    // Step 5 — Generate metadata (ignore intro, include episode number)
    const episodeNumber = process.env.PODCAST_RSS_EP || "1";
    const meta = await generateEpisodeMetaLLM(fullText, { sessionId: sid, episodeNumber });

    if (meta && (process.env.PODCAST_RSS_ENABLED || "Yes") === "Yes") {
      const metaKey = `${sid}.json`;
      await uploadText("meta", metaKey, JSON.stringify(meta, null, 2), "application/json");
    }

    info({ sessionId: sid }, "✅ Script orchestration complete");

    return { fullText, chunks: uploadedChunks, metadata: meta || {} };
  } catch (err) {
    error({ sessionId: sid, error: err?.message, stack: err?.stack }, "💥 Script orchestration failed");
    throw err;
  }
}

// ------------------------------------------------------------
// Backward-compatible alias + default export
// ------------------------------------------------------------
export const orchestrateEpisode = orchestrateScript;
export default orchestrateScript;
