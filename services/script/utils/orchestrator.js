// services/script/utils/orchestrator.js
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

    // 2️⃣ Compose the complete episode script
    const composed = await composeEpisode({ sessionId: sid, intro, main, outro });
    if (!composed || typeof composed?.fullText !== "string") throw new Error("Compose returned no fullText");
    info({ sessionId: sid, size: composed.fullText.length }, "🧩 Episode composed");

    // 3️⃣ Chunk text for TTS
    const fullText = composed.fullText;
    const chunks = chunkText(fullText);
    info({ sessionId: sid, chunks: chunks.length }, "🔪 Text chunked for TTS");

    // 4️⃣ Upload chunks for downstream TTS
    const uploadedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const key = `${sid}/chunks/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      await uploadText("podcast-chunks", key, chunks[i], "text/plain");
      uploadedChunks.push(key);
      info({ sessionId: sid, index: i + 1, key }, "⬆️ Chunk uploaded");
    }

    // 5️⃣ Upload the full composed script (optional but handy for debugging)
    await uploadText("raw-text", `${sid}.txt", fullText, "text/plain");
    info({ sessionId: sid }, "⬆️ Full script uploaded");

    // 6️⃣ Return composed data for pipeline continuity
    const metadata = composed?.metadata || {};
    info({ sessionId: sid }, "✅ Script orchestration complete");
    return { ...composed, fullText, chunks: uploadedChunks, metadata };
  } catch (err) {
    error({ sessionId: sid, error: err?.message }, "💥 Script orchestration failed");
    throw err;
  }
}

export default orchestrateScript;
