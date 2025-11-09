// ============================================================
// 🧩 Script Orchestrator — Unified Script Generation for Podcast
// ============================================================

import { info, error } from "#logger.js";
import { generateIntro } from "../routes/generateIntro.js";
import { generateMain } from "../routes/generateMain.js";
import { generateOutro } from "../routes/generateOutro.js";
import { composeEpisode } from "../routes/composeScript.js";
import { uploadText } from "#shared/r2-client.js";
import chunkText from "../utils/chunkText.js";

// ------------------------------------------------------------
// Main Orchestrator
// ------------------------------------------------------------
export async function orchestrateScript(sessionId) {
  info({ sessionId }, "🧩 Starting Script Orchestration...");

  try {
    // ─────────────────────────────────────────────
    // 1️⃣ Generate intro, main, outro
    // ─────────────────────────────────────────────
    const intro = await generateIntro(sessionId);
    const main = await generateMain(sessionId);
    const outro = await generateOutro(sessionId);

    // ─────────────────────────────────────────────
    // 2️⃣ Compose unified episode
    // ─────────────────────────────────────────────
    const composed = await composeEpisode({ intro, main, outro, sessionId });
    const fullText = composed?.fullText?.trim();

    if (!fullText || fullText.length < 50)
      throw new Error(`Script for ${sessionId} is empty or incomplete`);

    info({ sessionId, length: fullText.length }, "🧠 Script composed successfully");

    // ─────────────────────────────────────────────
    // 3️⃣ Split full script into TTS-friendly chunks
    // ─────────────────────────────────────────────
    const chunks = chunkText(fullText, 1200); // ~1.2KB per chunk
    if (!chunks.length) throw new Error("No chunks produced by chunkText");

    info({ sessionId, count: chunks.length }, "🧩 Text split into TTS chunks");

    // ─────────────────────────────────────────────
    // 4️⃣ Upload full transcript
    // ─────────────────────────────────────────────
    await uploadText("rawtext", `${sessionId}.txt`, fullText, "text/plain");
    info({ sessionId }, "📤 Full transcript uploaded to R2");

    // ─────────────────────────────────────────────
    // 5️⃣ Upload individual chunk files
    // ─────────────────────────────────────────────
    const uploadedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkKey = `${sessionId}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      await uploadText("rawtext", chunkKey, chunks[i], "text/plain");
      uploadedChunks.push(chunkKey);
    }

    info({ sessionId, uploaded: uploadedChunks.length }, "📤 All TTS chunks uploaded");

    // ─────────────────────────────────────────────
    // 6️⃣ Create and upload metadata JSON
    // ─────────────────────────────────────────────
    const metadata = {
      sessionId,
      createdAt: new Date().toISOString(),
      wordCount: fullText.split(/\s+/).length,
      chunkCount: chunks.length,
      chunkFiles: uploadedChunks,
      totalLength: fullText.length,
      title: composed?.meta?.title || "Untitled Episode",
      description: composed?.meta?.description || "No description provided.",
    };

    await uploadText(
      "rawtext",
      `${sessionId}-meta.json`,
      JSON.stringify(metadata, null, 2),
      "application/json"
    );

    info({ sessionId }, "📤 Metadata uploaded to R2");

    // ─────────────────────────────────────────────
    // 7️⃣ Return composed data for pipeline continuity
    // ─────────────────────────────────────────────
    info({ sessionId }, "✅ Script orchestration fully complete.");
    return { ...composed, fullText, chunks: uploadedChunks, metadata };

  } catch (err) {
    error({ sessionId, error: err.message }, "💥 Script orchestration failed");
    throw err;
  }
}

export default orchestrateScript;
