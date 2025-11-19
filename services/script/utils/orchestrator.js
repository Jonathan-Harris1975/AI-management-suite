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
  info("🧠 Orchestrate Script: start", { sessionId: sid });

  try {
    // Step 1: Generate intro, main content, and outro
    const intro = await generateIntro(sid);
    const main = await generateMain(sid);
    const outro = await generateOutro(sid);

    // Step 2: Compose complete episode text
    const composed = await composeEpisode({ sessionId: sid, intro, main, outro });
    const fullText = composed?.fullText ?? [intro, main, outro].join("\n\n");

    // Step 3: Chunk and upload to rawtext bucket (flat paths)
    const chunks = chunkText(fullText);
    const uploadedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      const key = `${sid}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      await uploadText("rawtext", key, chunks[i], "text/plain");
      uploadedChunks.push(key);
    }

    // Step 4: Upload full transcript
    await uploadText("transcript", `${sid}.txt`, fullText, "text/plain");

    // Step 5: Generate and upload metadata
    const meta = await generateEpisodeMetaLLM(fullText, sid);
    if (meta) {
      const metaKey = `${sid}.json`;
      await uploadText("meta", metaKey, JSON.stringify(meta, null, 2), "application/json");
    }

    // Step 6: Log success and return structured result
    info("✅ Script orchestration complete", { sessionId: sid });
    return { ...composed, fullText, chunks: uploadedChunks, metadata: meta || {} };
  } catch (err) {
    error("💥 Script orchestration failed", { sessionId: sid, error: err?.message, stack: err?.stack });
    throw err;
  }
}

// ------------------------------------------------------------
// Backward-compatible alias + default export
// ------------------------------------------------------------
export const orchestrateEpisode = orchestrateScript;
export default orchestrateScript;
