// ============================================================
// 🧩 Script Orchestrator — Unified Script Generation for Podcast
// ============================================================

import { info, error } from "#logger.js";
import { generateIntro } from "../routes/generateIntro.js";
import { generateMain } from "../routes/generateMain.js";
import { generateOutro } from "../routes/generateOutro.js";
import { composeEpisode } from "../routes/composeScript.js";
import { uploadText, uploadToR2 } from "#shared/r2-client.js";
import chunkText from "../utils/chunkText.js";

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
    const fullText = composed?.fullText?.trim();
    if (!fullText || fullText.length < 50)
      throw new Error(`Generated script for ${sessionId} is empty or too short`);

    // 3️⃣ Split full script into text chunks for TTS
    const chunks = chunkText(fullText, 1200); // ~1.2KB per chunk
    info({ sessionId, count: chunks.length }, "🧩 Text split into TTS chunks");

    // 4️⃣ Upload each chunk to R2 under rawtext/<sessionId>/
    const uploadedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkKey = `${sessionId}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      await uploadText("rawtext", chunkKey, chunks[i], "text/plain");
      uploadedChunks.push(chunkKey);
    }

    // 5️⃣ Upload full text for transcript reference
    await uploadText("rawtext", `${sessionId}.txt`, fullText, "text/plain");

    // 6️⃣ Upload chunk list metadata
    const metadata = {
      sessionId,
      chunkCount: chunks.length,
      chunks: uploadedChunks,
      createdAt: new Date().toISOString(),
    };
    await uploadText("rawtext", `${sessionId}-chunks.json`, JSON.stringify(metadata), "application/json");

    info({ sessionId, chunkCount: chunks.length }, "✅ Script orchestration complete.");
    return { ...composed, fullText, chunks: uploadedChunks, chunkCount: chunks.length };
  } catch (err) {
    error({ sessionId, error: err.message }, "💥 Script orchestration failed");
    throw err;
  }
}

export default orchestrateScript;
