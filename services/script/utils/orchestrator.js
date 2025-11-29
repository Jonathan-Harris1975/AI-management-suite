// ============================================================================
// orchestrator.js – Unified Script Pipeline (FIXED + UPDATED)
// ============================================================================
// Responsibilities:
//   1. Generate intro → main → outro (via models.js)
//   2. Editorial pass (LLM)
//   3. Formatting (editAndFormat.js)
//   4. Final sanitisation (remove music cues, markdown, emojis)
//   5. Save transcript to R2
//   6. Save metadata JSON to R2
//   7. Return usable metaUrls to podcast pipeline
// ============================================================================

import { resilientRequest } from "../../shared/utils/ai-service.js";
import { uploadText, putJson } from "../../shared/utils/r2-client.js";
import { extractMainContent } from "./textHelpers.js";
import { info, error } from "#logger.js";
import * as models from "./models.js";

// ============================================================================
// FINAL SANITISATION LAYER — makes text TTS-friendly and clean
// ============================================================================
function cleanupFinal(text) {
  if (!text) return "";

  return String(text)
    // Remove markdown (**bold**)
    .replace(/[*_]{1,3}/g, "")
    .replace(/^#{1,6}\s*/gm, "")

    // Remove scene directions / music cues
    .replace(/\[.*?(music|sfx|sound|cue|intro|outro|transition).*?]/gi, "")
    .replace(/\(.*?(music|sfx|sound|cue|intro|outro|transition).*?\)/gi, "")

    // Remove prefixes like "Voiceover:", "Scene:", "Style:"
    .replace(/^(scene|voiceover|style|direction)[:\-]/gim, "")

    // Remove emojis
    .replace(/[🎵🎶🎤🎧🎙️✨⭐🌟🔥💥👉➡️❗⚠️★]+/g, "")

    // Remove horizontal rules
    .replace(/^[-–—]{3,}$/gm, "")

    // Collapse excessive whitespace
    .replace(/\s{3,}/g, "\n\n")

    .trim();
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================
export async function orchestrateEpisode({ sessionId, date, topic, tone = {} }) {
  info("🧠 Orchestrate Script: start", { sessionId });

  try {
    // ------------------------------------------------------------------------
    // 1. Generate intro → main → outro (via updated models.js)
    // ------------------------------------------------------------------------
    const parts = await models.generateComposedEpisodeParts({
      date,
      topic,
      tone,
    });

    const { intro, main, outro, formatted, callLog } = parts;

    const initialFullText =
      formatted?.trim() ||
      `${intro}\n\n${main}\n\n${outro}`.trim();

    // ------------------------------------------------------------------------
    // 2. Editorial Pass — cleans + tightens narrative
    // ------------------------------------------------------------------------
    const editorialResp = await resilientRequest({
      routeName: "editorialPass",
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an expert editor. Improve clarity, flow, pacing, and remove repetition. Keep tone British conversational. No markdown, no scene cues."
        },
        {
          role: "user",
          content: initialFullText
        }
      ],
      max_tokens: 4000,
    });

    const editorialText = extractMainContent(
      editorialResp?.content || ""
    );

    // ------------------------------------------------------------------------
    // 3. Final Clean-up (removes cues, markdown, emojis)
    // ------------------------------------------------------------------------
    const finalFullText = cleanupFinal(
      editorialText || initialFullText
    );

    // ------------------------------------------------------------------------
    // 4. Save transcript to R2
    // ------------------------------------------------------------------------
    const transcriptKey = `${sessionId}.txt`;
    const transcriptUrl = await uploadText(
      "transcripts",
      transcriptKey,
      finalFullText,
      "text/plain"
    );

    // ------------------------------------------------------------------------
    // 5. Save metadata JSON (used by TTS / merge / RSS)
    // ------------------------------------------------------------------------
    const metaKey = `${sessionId}.json`;

    const meta = {
      session: {
        sessionId,
        date: new Date().toISOString(),
      },
      transcriptUrl,
      introLength: intro.length,
      mainLength: main.length,
      outroLength: outro.length,
      textLength: finalFullText.length,
      topic,
      tone,
      callLog,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await putJson("meta", metaKey, meta);

    info("✅ Script orchestration complete", {
      sessionId,
      transcriptKey,
      metaKey,
      calls: callLog?.length,
    });

    // Send results back to podcast pipeline
    return {
      ok: true,
      sessionId,
      metaUrls: {
        transcriptUrl,
      },
      text: finalFullText,
      callLog,
    };
  } catch (err) {
    error("❌ Script orchestration failed", {
      sessionId,
      error: err.message,
    });
    throw err;
  }
}

export default { orchestrateEpisode };
