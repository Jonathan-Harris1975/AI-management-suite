// services/script/utils/orchestrator.js
// ============================================================
// 🧩 Script Orchestrator — Unified Script Generation for Podcast
// ============================================================

import { info, error } from "#logger.js";
import { generateIntro, generateMain, generateOutro } from "../utils/models.js";
import { composeEpisode } from "../routes/composeScript.js";
import { uploadText } from "#shared/r2-client.js";
import chunkText from "../utils/chunkText.js";
import { generateEpisodeMetaLLM } from "../utils/podcastHelper.js";

// ------------------------------------------------------------
// Core Orchestrator Function
// ------------------------------------------------------------
export async function orchestrateScript(sessionId) {
  const sid = sessionId || `TT-${Date.now()}`;
  info({ sessionId: sid }, "🧠 Orchestrate Script: start");

  try {
    // 1️⃣ Generate sections
    const intro = await generateIntro(sid);
    if (!intro || typeof intro !== "string") throw new Error("Intro generation returned no text");
    info({ sessionId: sid, size: intro.length }, "✍️ Intro generated");

    const main = await generateMain(sid);
    if (!main || typeof main !== "string") throw new Error("Main generation returned no text");
    info({ sessionId: sid, size: main.length }, "✍️ Main generated");

    const outro = await generateOutro(sid);
    if (!outro || typeof outro !== "string") throw new Error("Outro generation returned no text");
    info({ sessionId: sid, size: outro.length }, "✍️ Outro generated");

    // 2️⃣ Compose the full episode
    const composed = await composeEpisode({ sessionId: sid, intro, main, outro });
    const fullText = composed?.fullText ?? [intro, main, outro].join("\n\n");
    info({ sessionId: sid, size: fullText.length }, "🧩 Episode composed");

    // 3️⃣ Chunk text for TTS
    const chunks = chunkText(fullText);
    info({ sessionId: sid, chunks: chunks.length }, "🔪 Text chunked for TTS");

    // 4️⃣ Upload chunks
    const uploadedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const key = `${sid}/chunks/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      await uploadText("podcast-chunks", key, chunks[i], "text/plain");
      uploadedChunks.push(key);
      info({ sessionId: sid, index: i + 1, key }, "⬆️ Chunk uploaded");
    }

    // 5️⃣ Upload full transcript
    await uploadText("raw-text", `${sid}.txt`, fullText, "text/plain");
    info({ sessionId: sid }, "⬆️ Full transcript uploaded");

    // 6️⃣ Generate + upload metadata
    info({ sessionId: sid }, "⚙️ Generating episode metadata...");
    const meta = await generateEpisodeMetaLLM(fullText, sid);
    if (meta) {
      const metaKey = `${sid}.json`;
      await uploadText("podcast-meta", metaKey, JSON.stringify(meta, null, 2), "application/json");
      info({ sessionId: sid, metaKey }, "🧾 Metadata saved to podcast-meta");
    } else {
      info({ sessionId: sid }, "⚠️ Metadata generation returned null");
    }

    info({ sessionId: sid }, "✅ Script orchestration complete");
    return { ...composed, fullText, chunks: uploadedChunks, metadata: meta || {} };
  } catch (err) {
    error({ sessionId: sid, error: err?.message, stack: err?.stack }, "💥 Script orchestration failed");
    throw err;
  }
}

// ------------------------------------------------------------
// Backward-compatible alias for routes that expect orchestrateEpisode
// ------------------------------------------------------------
export const orchestrateEpisode = orchestrateScript;

// Default export
export default orchestrateScript;
