import { info, error, debug } from "#logger.js";
import { generateIntro, generateMain, generateOutro } from "./models.js";
import { composeEpisode } from "../routes/composeScript.js";
import { uploadText } from "#shared/r2-client.js";
import chunkText from "./chunkText.js";
import { generateEpisodeMetaLLM } from "./podcastHelper.js";
import * as sessionCache from "./sessionCache.js";
import { resilientRequest } from "../../shared/utils/ai-service.js";   // <-- required for LLM passes

// ------------------------------------------------------------
// Temporary delayed cleanup (4-minute silent safety net)
// ------------------------------------------------------------
function scheduleCleanup(sessionId) {
  setTimeout(async () => {
    try {
      await clearTempParts(sessionId);
      sessionCache.clearSession(sessionId);
    } catch (_) {}
  }, 4 * 60 * 1000);
}

// ------------------------------------------------------------
// Main orchestrator function
// ------------------------------------------------------------
export async function orchestrateScript(sessionId) {
  const sid = sessionId || `TT-${Date.now()}`;
  debug("🧠 Orchestrate Script: start", { sessionId: sid });

  try {
    // Step 1: Generate intro, main content, and outro
    const intro = await generateIntro(sid);
    const main = await generateMain(sid);
    const outro = await generateOutro(sid);

    // Step 2: Compose complete episode text
    const composed = await composeEpisode({
      sessionId: sid,
      intro,
      main,
      outro
    });

    const initialFullText =
      composed?.fullText ??
      [intro, main, outro].join("\n\n");

    // ------------------------------------------------------------
    // NEW Step 2.5: editorialPass (cleanup, cohesion, tone, flow)
    // ------------------------------------------------------------
    const editorialText = await resilientRequest("editorialPass", {
      sessionId: sid,
      messages: [
        {
          role: "system",
          content:
            "Perform a full editorial cleanup. Ensure cohesion, fix grammar, improve flow, and unify tone without altering meaning."
        },
        { role: "user", content: initialFullText }
      ]
    });

    // ------------------------------------------------------------
    // NEW Step 2.6: editAndFormat (final structured formatting)
    // ------------------------------------------------------------
    const formattedText = await resilientRequest("editAndFormat", {
      sessionId: sid,
      messages: [
        {
          role: "system",
          content:
            "Format the script for final podcast delivery. Ensure clean paragraph structure, smooth transitions, and TTS-friendly punctuation."
        },
        { role: "user", content: editorialText }
      ]
    });

    const finalFullText = formattedText?.trim() || editorialText?.trim() || initialFullText;

    // Step 3: Chunk and upload to rawtext bucket
    const chunks = chunkText(finalFullText);
    const uploadedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      const key = `${sid}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      await uploadText("rawtext", key, chunks[i], "text/plain");
      uploadedChunks.push(key);
    }

    // Step 4: Upload full transcript
    await uploadText("transcript", `${sid}.txt`, finalFullText, "text/plain");

    // Step 5: Generate and upload metadata (based on formatted text)
    const meta = await generateEpisodeMetaLLM(finalFullText, sid);
    if (meta) {
      const metaKey = `${sid}.json`;
      await uploadText(
        "meta",
        metaKey,
        JSON.stringify(meta, null, 2),
        "application/json"
      );
    }

    // ------------------------------------------------------------
    // 🔥 NEW: Expose artworkPrompt at the top-level return
    // ------------------------------------------------------------
    const artworkPrompt =
      meta?.artworkPrompt && String(meta.artworkPrompt).trim().length > 0
        ? meta.artworkPrompt.trim()
        : null;

    debug("🎨 Artwork prompt resolved", {
      sessionId: sid,
      artworkPrompt: artworkPrompt || "(none)"
    });

    // Step 6: Schedule delayed cleanup
    scheduleCleanup(sid);

    // Step 7: Return structured result
    info("✅ Script orchestration complete");
    debug("✅ Script orchestration complete", { sessionId: sid });

    return {
      ...composed,
      fullText: finalFullText,
      chunks: uploadedChunks,
      metadata: meta || {},
      // NEW: required for artwork generation pipeline
      artworkPrompt
    };
  } catch (err) {
    error("💥 Script orchestration failed", {
      sessionId: sid,
      error: err?.message,
      stack: err?.stack
    });
    throw err;
  }
}

// ------------------------------------------------------------
// Backward-compatible alias + default export
// ------------------------------------------------------------
export const orchestrateEpisode = orchestrateScript;
export default orchestrateScript;
