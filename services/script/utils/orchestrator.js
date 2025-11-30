// ============================================================================
// services/script/utils/orchestrator.js
// Unified Orchestrator for Intro → Main → Outro → Editorial → Formatting
// → FINAL CLEANUP → Chunking → Transcript & Meta export to R2
// ============================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { info, error, debug } from "#logger.js";
import * as models from "./models.js";
import { extractMainContent } from "./textHelpers.js";
import { uploadText, putJson } from "../../shared/utils/r2-client.js";
import chunkText from "./chunkText.js";
import editAndFormat from "./editAndFormat.js";
import { generateEpisodeMetaLLM } from "./podcastHelper.js";

// ------------------------------------------------------------
// FINAL SANITISATION LAYER — removes ALL style/scene cues
// ------------------------------------------------------------
function cleanupFinal(text) {
  if (!text) return "";

  return String(text)
    // Remove markdown (**bold**, *italics*, ### headers)
    .replace(/[*_]{1,3}/g, "")
    .replace(/^#{1,6}\s*/gm, "")

    // Remove stage + style directions: [Music…], (SFX…), Voiceover:
    .replace(/\[.*?(music|sfx|sound|cue|intro|outro|transition).*?]/gi, "")
    .replace(/\(.*?(music|sfx|sound|cue|intro|outro|transition).*?\)/gi, "")
    .replace(/^(scene|style|voiceover|narrator|direction)[:\-]/gim, "")

    // Remove decorative emojis
    .replace(/[🎵🎶🎤🎧🎙️✨⭐🌟🔥💥👉➡️❗⚠️★]+/g, "")

    // Remove markdown horizontal rules
    .replace(/^[-–—]{3,}$/gm, "")

    // Remove big whitespace gaps
    .replace(/\s{3,}/g, "\n\n")

    .trim();
}

// Helper to check env toggle for editorial pass
function editorialEnabled() {
  const raw = String(process.env.ENABLE_EDITORIAL_PASS || "yes")
    .trim()
    .toLowerCase();
  return raw === "yes" || raw === "true" || raw === "y";
}

// ------------------------------------------------------------
// MAIN ORCHESTRATION PIPELINE
// ------------------------------------------------------------
export async function orchestrateEpisode({
  sessionId,
  date,
  topic,
  tone = {},
} = {}) {
  const sid =
    sessionId ||
    `TT-${new Date().toISOString().slice(0, 10)}`;

  const safeDate = date || new Date().toISOString().slice(0, 10);

  info("🧠 Orchestrate Script: start", { sessionId: sid });

  try {
    // -------------------------------
    // 1) Generate intro / main / outro via models.js
    // -------------------------------
    const ctx = { sessionId: sid, date: safeDate, topic, tone };

    const introRaw = await models.generateIntro(ctx);
    const mainRaw = await models.generateMain(ctx);
    const outroRaw = await models.generateOutro(ctx);

    const intro = cleanupFinal(introRaw);
    const main = cleanupFinal(mainRaw);
    const outro = cleanupFinal(outroRaw);

    // -------------------------------
    // Combine full text BEFORE editorial pass
    // -------------------------------
    const initialFullText = `${intro}\n\n${main}\n\n${outro}`.trim();

    // -------------------------------
    // 2) EDITORIAL PASS (optional via env)
    // -------------------------------
    let editorialText = initialFullText;

    if (editorialEnabled()) {
      const editorialResp = await resilientRequest("editorialPass", {
        sessionId: { sessionId: sid },
        section: "editorial",
        messages: [
          {
            role: "system",
            content:
              "You are an expert editor. Remove fluff, keep factual clarity, " +
              "smooth transitions, and a British conversational tone. " +
              "No markdown, no scene cues, no emojis.",
          },
          {
            role: "user",
            content: initialFullText,
          },
        ],
        max_tokens: 4096,
      });

      editorialText = cleanupFinal(
        extractMainContent(editorialResp || "") || initialFullText
      );

      debug("script.editorial.applied", { sessionId: sid });
    }

    // -------------------------------
    // 3) FORMATTING PASS (local editAndFormat.js)
    // -------------------------------
    const formattedTextRaw = editAndFormat(editorialText);
    const finalFullText = cleanupFinal(
      formattedTextRaw?.trim() ||
        editorialText?.trim() ||
        initialFullText
    );

    // -------------------------------
    // 4) CHUNKING → rawtext bucket (for TTS)
    // -------------------------------
    const chunks = chunkText(finalFullText);
    const uploadedChunks = [];

    for (let i = 0; i < chunks.length; i++) {
      const key = `${sid}/chunk-${String(i + 1).padStart(3, "0")}.txt`;
      await uploadText("rawtext", key, chunks[i], "text/plain");
      uploadedChunks.push(key);
    }

    debug("script.chunks.uploaded", {
      sessionId: sid,
      chunkCount: uploadedChunks.length,
    });

    // -------------------------------
    // 5) EXPORT TRANSCRIPT TO R2 (transcripts alias)
    // -------------------------------
    const transcriptKey = `${sid}.txt`;
    const transcriptUrl = await uploadText(
      "transcripts",
      transcriptKey,
      finalFullText,
      "text/plain"
    );

    // -------------------------------
    // 6) GENERATE & STORE METADATA
    // -------------------------------
    const metaFromLlm = await generateEpisodeMetaLLM(finalFullText, sid);
    const metaKey = `${sid}.json`;

    const nowIso = new Date().toISOString();

    const meta = {
      ...(metaFromLlm || {}),
      session: {
        ...(metaFromLlm?.session || {}),
        sessionId: sid,
        date: safeDate,
      },
      transcriptUrl,
      textLength: finalFullText.length,
      topic,
      tone,
      chunks: uploadedChunks,
      createdAt: metaFromLlm?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    await putJson("meta", metaKey, meta);

    info("✅ Script orchestration complete", {
      sessionId: sid,
      transcriptKey,
      metaKey,
    });

    return {
      ok: true,
      sessionId: sid,
      metaUrls: {
        transcriptUrl,
      },
      text: finalFullText,
    };
  } catch (err) {
    error("❌ Script orchestration failed", {
      sessionId: sid,
      error: err.message,
    });
    throw err;
  }
}

export default { orchestrateEpisode };
